import { get, set, del } from "idb-keyval";
import { z } from "zod";
import type { GameState } from "../state/game";
import {
  migrateSave,
  settingsSchema,
  defaultSettings,
  type Settings,
} from "./schema";
export { migrateSave, defaultSettings, type Settings } from "./schema";
export type Slot = 0 | 1 | 2 | 3;
export interface KeyValueStore {
  get(key: string): Promise<unknown>;
  set(key: string, value: string): Promise<void>;
  del(key: string): Promise<void>;
}
const indexedDBStore: KeyValueStore = {
  get: (key) => get(key),
  set: (key, value) => set(key, value),
  del: (key) => del(key),
};
const MAX_BYTES = 8 * 1024 * 1024;
const prefix = "willowmere:";
/** FNV-1a detects accidental corruption. The checksum is not an authenticity signature. */
export function checksum(value: string): string {
  let hash = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}
function parseJSON(json: string): unknown {
  if (json.length > MAX_BYTES)
    throw new Error("This save is too large to open (8 MB limit).");
  try {
    return JSON.parse(json, (key, value: unknown) => {
      if (["__proto__", "constructor", "prototype"].includes(key))
        throw new Error("Unsafe key");
      return value;
    });
  } catch {
    throw new Error(
      "This file is not valid save JSON. Please select an exported Willowmere save.",
    );
  }
}
const envelopeSchema = z.object({
  format: z.literal("willowmere-acres"),
  checksum: z.string().regex(/^[a-f0-9]{8}$/),
  payload: z.string().max(MAX_BYTES),
});
function seal(value: unknown): string {
  const payload = JSON.stringify(value);
  return JSON.stringify({
    format: "willowmere-acres",
    checksum: checksum(payload),
    payload,
  });
}
function open(json: string): unknown {
  const envelope = envelopeSchema.safeParse(parseJSON(json));
  if (!envelope.success)
    throw new Error("This file is not a Willowmere save export.");
  if (checksum(envelope.data.payload) !== envelope.data.checksum)
    throw new Error(
      "This save is damaged: its checksum does not match. Your existing saves have not been changed.",
    );
  return parseJSON(envelope.data.payload);
}
export function exportSave(state: GameState): string {
  return seal(migrateSave(state));
}
export function importSave(json: string): GameState {
  return migrateSave(open(json));
}
const storedSchema = z.object({
  savedAt: z.string().datetime(),
  thumbnail: z
    .string()
    .max(1000000)
    .refine(
      (value) =>
        value === "" ||
        /^data:image\/(png|webp);base64,[A-Za-z0-9+/=]+$/.test(value),
    ),
  state: z.unknown(),
});
type Stored = { savedAt: string; thumbnail: string; state: GameState };
function decodeSlot(value: unknown): Stored {
  if (typeof value !== "string") throw new Error("The save record is missing.");
  const record = storedSchema.safeParse(open(value));
  if (!record.success) throw new Error("The save record is damaged.");
  return { ...record.data, state: migrateSave(record.data.state) };
}
export interface SlotSummary {
  slot: Slot;
  name: string;
  farmName: string;
  day: number;
  money: number;
  savedAt: string;
  thumbnail: string;
  corrupt: boolean;
  empty: boolean;
}
export class SaveStore {
  private pending: Promise<unknown> = Promise.resolve();
  constructor(private readonly storage: KeyValueStore = indexedDBStore) {}
  private queue<T>(task: () => Promise<T>): Promise<T> {
    const result = this.pending.then(task, task);
    this.pending = result.catch(() => undefined);
    return result;
  }
  private key(slot: Slot): string {
    if (![0, 1, 2, 3].includes(slot))
      throw new Error("Choose autosave or manual slot 1–3.");
    return `${prefix}slot:${slot}`;
  }
  private async recover(key: string): Promise<Stored | null> {
    let found = false;
    for (const suffix of ["", ":backup", ":temp"]) {
      const raw = await this.storage.get(key + suffix);
      if (raw == null) continue;
      found = true;
      let decoded: Stored;
      try {
        decoded = decodeSlot(raw);
      } catch {
        continue;
      }
      if (suffix) await this.storage.set(key, raw as string);
      return decoded;
    }
    if (found)
      throw new Error(
        "This slot is damaged and no valid recovery copy was found. Try a different slot or import a backup.",
      );
    return null;
  }
  saveSlot(slot: Slot, state: GameState, thumbnail = ""): Promise<void> {
    const key = this.key(slot);
    // Capture synchronously so the live game cannot change while a queued write waits.
    const encoded = seal(
      storedSchema.parse({
        state: migrateSave(state),
        thumbnail,
        savedAt: new Date().toISOString(),
      }),
    );
    return this.queue(async () => {
      await this.storage.set(key + ":temp", encoded);
      const verified = await this.storage.get(key + ":temp");
      decodeSlot(verified);
      if (verified !== encoded)
        throw new Error(
          "Save verification failed. Your previous save is preserved.",
        );
      const old = await this.storage.get(key);
      if (typeof old === "string") {
        let valid = false;
        try {
          decodeSlot(old);
          valid = true;
        } catch {
          /* A valid new save can replace a damaged old one. */
        }
        if (valid) await this.storage.set(key + ":backup", old);
      }
      await this.storage.set(key, encoded);
      const committed = await this.storage.get(key);
      decodeSlot(committed);
      if (committed !== encoded)
        throw new Error(
          "The save could not be verified. A recovery copy is available.",
        );
      await this.storage.del(key + ":temp");
    });
  }
  loadSlot(slot: Slot): Promise<GameState | null> {
    return this.queue(
      async () => (await this.recover(this.key(slot)))?.state ?? null,
    );
  }
  listSlots(): Promise<SlotSummary[]> {
    return this.queue(async () => {
      const result: SlotSummary[] = [];
      for (const slot of [0, 1, 2, 3] as const) {
        const empty = {
          slot,
          name: "",
          farmName: "",
          day: 0,
          money: 0,
          savedAt: "",
          thumbnail: "",
          corrupt: false,
          empty: true,
        };
        try {
          const entry = await this.recover(this.key(slot));
          result.push(
            entry
              ? {
                  slot,
                  name: entry.state.player.name,
                  farmName: entry.state.player.farmName,
                  day: entry.state.day,
                  money: entry.state.money,
                  savedAt: entry.savedAt,
                  thumbnail: entry.thumbnail,
                  corrupt: false,
                  empty: false,
                }
              : empty,
          );
        } catch {
          result.push({ ...empty, empty: false, corrupt: true });
        }
      }
      return result;
    });
  }
  saveSettings(settings: Partial<Settings>): Promise<void> {
    return this.queue(async () => {
      const current = await this.readSettings();
      const checked = settingsSchema.parse({ ...current, ...settings });
      await this.storage.set(prefix + "settings", seal(checked));
    });
  }
  private async readSettings(): Promise<Settings> {
    const raw = await this.storage.get(prefix + "settings");
    if (raw == null) return settingsSchema.parse(defaultSettings);
    try {
      return settingsSchema.parse(open(String(raw)));
    } catch {
      return settingsSchema.parse(defaultSettings);
    }
  }
  loadSettings(): Promise<Settings> {
    return this.queue(() => this.readSettings());
  }
}
export const saveStore = new SaveStore();
export const saveSlot = (slot: Slot, state: GameState, thumbnail?: string) =>
  saveStore.saveSlot(slot, state, thumbnail);
export const loadSlot = (slot: Slot) => saveStore.loadSlot(slot);
export const listSlots = () => saveStore.listSlots();
export const saveSettings = (settings: Partial<Settings>) =>
  saveStore.saveSettings(settings);
export const loadSettings = () => saveStore.loadSettings();
