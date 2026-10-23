import { describe, it, expect } from "vitest";
import { createGame } from "../../src/state/game";
import {
  SaveStore,
  exportSave,
  importSave,
  checksum,
  migrateSave,
  defaultSettings,
  type KeyValueStore,
} from "../../src/persistence";
class MemoryStore implements KeyValueStore {
  values = new Map<string, string>();
  failKey = "";
  async get(key: string) {
    return this.values.get(key);
  }
  async set(key: string, value: string) {
    if (key === this.failKey) throw new Error("Disk full");
    this.values.set(key, value);
  }
  async del(key: string) {
    this.values.delete(key);
  }
}
function envelope(value: unknown) {
  const payload = JSON.stringify(value);
  return JSON.stringify({
    format: "willowmere-acres",
    payload,
    checksum: checksum(payload),
  });
}
describe("versioned farm persistence", () => {
  it("migration preserves cleared debris and intentionally empty flag records", () => {
    const old = { ...createGame(), version: 1, debris: {}, flags: {} };
    const migrated = migrateSave(old);
    expect(migrated.debris).toEqual({});
    expect(migrated.flags).toEqual({});
  });

  it("round trips a farm independently of original memory", () => {
    const state = createGame({ seed: 7 });
    const restored = importSave(exportSave(state));
    expect(restored).toEqual(state);
    restored.money++;
    expect(restored.money).not.toBe(state.money);
  });
  it("validates checksum and malformed imports before touching slots", () => {
    const original = exportSave(createGame());
    expect(() => importSave(original.replace("Rowan", "Broken"))).toThrow(
      /checksum/,
    );
    expect(() => importSave("{")).toThrow(/JSON/);
    expect(() => importSave("{}")).toThrow(/export/);
    expect(() => importSave(" ".repeat(8 * 1024 * 1024 + 1))).toThrow(/large/);
    expect(() => importSave(envelope({ ...createGame(), money: -5 }))).toThrow(
      /invalid/,
    );
    expect(() =>
      importSave(envelope({ ...createGame(), version: 99 })),
    ).toThrow(/unsupported/);
  });
  it("rejects prototype pollution, including nested imports", () => {
    expect(() => importSave('{"__proto__":{}}')).toThrow(/JSON/);
    const payload = '{"constructor":{}}';
    expect(() =>
      importSave(
        JSON.stringify({
          format: "willowmere-acres",
          payload,
          checksum: checksum(payload),
        }),
      ),
    ).toThrow(/JSON/);
  });
  it("migrates the v1 farm fixture with ordered defaults", () => {
    const current = createGame({ name: "Violet", seed: 42 });
    const { forecast: _forecast, storage: _storage, ...old } = current;
    void _forecast;
    void _storage;
    const fixture = {
      ...old,
      version: 1,
      settings: { timeSpeed: 1 },
      relationships: { dating: null, spouse: null, weddingDay: null },
    };
    const migrated = migrateSave(fixture);
    expect(migrated.version).toBe(2);
    expect(migrated.player.name).toBe("Violet");
    expect(migrated.forecast).toBe("sunny");
    expect(migrated.storage).toEqual([]);
    expect(migrated.relationships.child).toBeNull();
    expect(importSave(envelope(fixture))).toEqual(migrated);
  });
  it("stores 3 manual slots and autosave with summary and snapshot", async () => {
    const db = new MemoryStore();
    const store = new SaveStore(db);
    expect(await store.loadSlot(0)).toBeNull();
    for (const slot of [0, 1, 2, 3] as const) {
      const state = createGame();
      state.money = slot * 500;
      await store.saveSlot(slot, state, "data:image/png;base64,AA==");
    }
    const slots = await store.listSlots();
    expect(slots.map((s) => s.money)).toEqual([0, 500, 1000, 1500]);
    expect(slots.every((s) => !s.empty && !s.corrupt && s.thumbnail)).toBe(
      true,
    );
    expect((await store.loadSlot(3))?.money).toBe(1500);
    expect([...db.values.keys()].some((key) => key.endsWith(":temp"))).toBe(
      false,
    );
  });
  it("recovers the previous verified save after committed data corruption", async () => {
    const db = new MemoryStore();
    const store = new SaveStore(db);
    const state = createGame();
    await store.saveSlot(1, state);
    state.money = 999;
    await store.saveSlot(1, state);
    db.values.set("willowmere:slot:1", "broken");
    expect((await store.loadSlot(1))?.money).toBe(500);
    expect((await store.loadSlot(1))?.money).toBe(500);
  });
  it("recovers a verified temporary save when initial commit was interrupted", async () => {
    const db = new MemoryStore();
    const store = new SaveStore(db);
    db.failKey = "willowmere:slot:2";
    await expect(store.saveSlot(2, createGame())).rejects.toThrow("Disk full");
    db.failKey = "";
    expect((await store.loadSlot(2))?.money).toBe(500);
  });
  it("leaves an existing committed save readable on a failed replacement", async () => {
    const db = new MemoryStore();
    const store = new SaveStore(db);
    const state = createGame();
    await store.saveSlot(1, state);
    db.failKey = "willowmere:slot:1";
    state.money = 999;
    await expect(store.saveSlot(1, state)).rejects.toThrow();
    db.failKey = "";
    expect((await store.loadSlot(1))?.money).toBe(500);
  });
  it("reports irrecoverable corruption and permits replacement", async () => {
    const db = new MemoryStore();
    const store = new SaveStore(db);
    db.values.set("willowmere:slot:0", "broken");
    await expect(store.loadSlot(0)).rejects.toThrow(/damaged/);
    expect((await store.listSlots())[0]?.corrupt).toBe(true);
    await store.saveSlot(0, createGame());
    expect((await store.listSlots())[0]?.corrupt).toBe(false);
  });
  it("serializes concurrent updates and captures state at invocation", async () => {
    const store = new SaveStore(new MemoryStore());
    const state = createGame();
    const first = store.saveSlot(1, state);
    state.money = 678;
    const second = store.saveSlot(1, state);
    state.money = 0;
    await Promise.all([first, second]);
    expect((await store.loadSlot(1))?.money).toBe(678);
  });
  it("keeps settings independent, merges changes, and recovers defaults", async () => {
    const db = new MemoryStore();
    const store = new SaveStore(db);
    expect(await store.loadSettings()).toEqual(defaultSettings);
    await store.saveSettings({ master: 0.2, reduceFlash: true });
    await store.saveSettings({ music: 0.3 });
    await store.saveSlot(0, createGame());
    expect(await store.loadSettings()).toMatchObject({
      master: 0.2,
      music: 0.3,
      reduceFlash: true,
    });
    await expect(store.saveSettings({ master: 2 })).rejects.toThrow();
    db.values.set("willowmere:settings", "broken");
    expect(await store.loadSettings()).toEqual(defaultSettings);
  });
});
