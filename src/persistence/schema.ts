import { z } from "zod";
import { createGame, type GameState } from "../state/game";

const n = z.number().finite();
const count = n.int().nonnegative();
const text = z.string().max(10000);
const id = z.string().max(120);
const bool = z.boolean();
const numbers = z.record(id, n);
const counts = z.record(id, count);
const strings = z.array(text).max(20000);
const weather = z.enum([
  "sunny",
  "cloudy",
  "rain",
  "storm",
  "snow",
  "blizzard",
]);
const stack = z.object({
  id,
  quantity: count.max(999999),
  quality: count.max(3),
});
const stacks = z.array(stack).max(10000);
export const gameSchema = z
  .object({
    version: z.literal(2),
    seed: n.int(),
    rng: count.max(4294967295),
    day: count,
    minute: n.min(0).max(1560),
    money: count,
    stamina: n.nonnegative(),
    maxStamina: n.positive(),
    fatigue: n.min(0).max(100),
    weather,
    forecast: weather,
    cold: bool,
    player: z.object({
      name: text,
      farmName: text,
      petName: text,
      petType: id,
      map: id,
      x: n,
      y: n,
      facing: id,
      appearance: numbers,
      birthday: z.object({
        season: z.enum(["spring", "summer", "autumn", "winter"]),
        day: count.min(1).max(30),
      }),
    }),
    inventory: stacks,
    storage: stacks,
    shipping: stacks,
    plots: z.record(
      id,
      z.object({
        x: n,
        y: n,
        tilled: bool,
        watered: bool,
        fertilizer: count.max(3),
        crop: id.nullable(),
        growth: count,
        quality: count.max(3),
        withered: bool,
        dryDays: count,
        streak: count,
      }),
    ),
    debris: z.record(id, id),
    animals: z.array(
      z.object({
        id,
        kind: id,
        name: text,
        affection: n.nonnegative(),
        fed: bool,
        petted: bool,
        brushed: bool,
        outside: bool,
        sick: bool,
        neglect: count,
        age: count,
        product: bool,
        pregnant: count.nullable(),
        away: bool,
      }),
    ),
    friendship: counts,
    flags: z.record(id, bool),
    tools: z.record(
      id,
      z.object({
        tier: count.max(4),
        water: count.optional(),
        readyDay: count.optional(),
      }),
    ),
    equipped: id,
    selectedSeed: id,
    seedCharges: counts.default({}),
    buildings: counts,
    construction: counts,
    collections: counts,
    journal: strings,
    mail: strings,
    achievements: strings,
    mine: z.object({
      floor: count.max(100),
      maxFloor: count.max(100),
      rocks: count,
      broken: strings.default([]),
      ladder: bool,
      minutes: n.nonnegative(),
    }),
    lastSummary: z.object({ earned: count, items: stacks, events: strings }),
    stats: z.object({
      totalEarned: count,
      cropsShipped: count,
      fishCaught: count,
      festivals: count,
      daysPlayed: count,
      harvested: count,
    }),
    relationships: z.object({
      dating: id.nullable(),
      spouse: id.nullable(),
      weddingDay: count.nullable(),
      marriedDay: count.nullable(),
      child: z
        .object({ name: text, joinedDay: count, stage: count, kind: id })
        .nullable(),
    }),
    settings: z.object({
      timeSpeed: n.min(0.5).max(2),
      preciseSow: bool,
      festivalDifficulty: n.min(0).max(2),
      runToggle: bool,
    }),
    talked: counts,
    gifted: z.record(id, z.object({ day: count, week: count, count })),
    dialogueHistory: counts,
    trees: z.array(z.object({ id, x: n, y: n, age: count, fruit: bool })),
    decorations: z.array(z.object({ id, x: n, y: n, rotation: n })),
    processing: z.array(z.object({ id, ready: count, quality: count.max(3) })),
    foraged: counts,
    knownRecipes: strings,
    fishRecords: numbers,
    markers: z.array(z.object({ day: count, label: text })),
    petAffection: n.nonnegative(),
    pendingChoices: strings,
  })
  .strict();

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
/** V1 lacked ancillary collection, forecast, relationship and settings fields. */
export function migrateSave(value: unknown): GameState {
  if (!record(value)) throw new Error("The save does not contain a farm.");
  let migrated = value;
  if (value.version === 1) {
    const defaults = createGame();
    const fixedObjects = new Set([
      "",
      "player",
      "player.birthday",
      "settings",
      "relationships",
      "stats",
      "mine",
      "lastSummary",
    ]);
    const merge = (base: unknown, old: unknown, path = ""): unknown => {
      if (!record(base) || !record(old) || !fixedObjects.has(path)) return old;
      const result: Record<string, unknown> = { ...base };
      for (const [key, item] of Object.entries(old))
        result[key] =
          key in base
            ? merge(base[key], item, path ? `${path}.${key}` : key)
            : item;
      return result;
    };
    migrated = merge(defaults, value) as Record<string, unknown>;
    migrated.version = 2;
  }
  const result = gameSchema.safeParse(migrated);
  if (!result.success)
    throw new Error(
      "This save has invalid or unsupported farm data. Please choose another save or backup.",
    );
  return result.data;
}

const volume = n.min(0).max(1);
export const settingsSchema = z.object({
  master: volume.default(0.7),
  music: volume.default(0.55),
  sfx: volume.default(0.7),
  ambience: volume.default(0.45),
  muteHidden: bool.default(true),
  timeSpeed: n.min(0.5).max(2).default(1),
  preciseSow: bool.default(false),
  festivalDifficulty: n.min(0).max(2).default(1),
  runToggle: bool.default(false),
  autoAdvance: bool.default(false),
  textSpeed: n.min(0).max(100).default(35),
  friendshipToasts: bool.default(true),
  screenShake: bool.default(true),
  reduceFlash: bool.default(false),
  highContrast: bool.default(false),
  waterPattern: bool.default(true),
  uiScale: z.union([z.literal(1), z.literal(2)]).default(1),
  touchOpacity: volume.default(0.75),
  keys: z.record(id, z.string().max(40)).default({}),
  gamepad: z.record(id, count.max(31)).default({}),
  touchLayout: z.record(id, z.object({ x: volume, y: volume })).default({}),
});
export type Settings = z.infer<typeof settingsSchema>;
export const defaultSettings: Settings = settingsSchema.parse({});
