import { layoutFor, isBlocked } from "../core/world-layout";
export type Season = "spring" | "summer" | "autumn" | "winter";
export type Weather =
  "sunny" | "cloudy" | "rain" | "storm" | "snow" | "blizzard";
export type Stack = { id: string; quantity: number; quality: number };
export type Plot = {
  x: number;
  y: number;
  tilled: boolean;
  watered: boolean;
  fertilizer: number;
  crop: string | null;
  growth: number;
  quality: number;
  withered: boolean;
  dryDays: number;
  streak: number;
};
export type Animal = {
  id: string;
  kind: string;
  name: string;
  affection: number;
  fed: boolean;
  petted: boolean;
  brushed: boolean;
  outside: boolean;
  sick: boolean;
  neglect: number;
  age: number;
  product: boolean;
  pregnant: number | null;
  away: boolean;
};
export type GameEvent = {
  type: string;
  message?: string;
  id?: string;
  amount?: number;
};
export type Command =
  | { type: "wait"; minutes: number }
  | { type: "ride" }
  | { type: "acknowledge"; event: "vote" | "bloom" | "wedding" }
  | { type: "selectSeed"; crop: string }
  | { type: "settings"; values: Partial<GameState["settings"]> }
  | { type: "face"; direction: string }
  | { type: "move"; dx: number; dy: number }
  | { type: "teleport"; map: string; x?: number; y?: number }
  | { type: "equip"; tool: string }
  | {
      type: "use" | "plant" | "water" | "harvest" | "clear" | "fertilize";
      x?: number;
      y?: number;
      charge?: number;
      crop?: string;
      grade?: number;
    }
  | { type: "buy" | "sell" | "ship"; item: string; quantity: number }
  | { type: "eat"; item: string }
  | { type: "talk"; npc: string }
  | { type: "gift"; npc: string; item: string }
  | { type: "sleep" }
  | { type: "collect" | "breed"; animal: string }
  | { type: "care"; animal: string; action: string }
  | { type: "buyAnimal"; kind: string; name: string }
  | { type: "fish"; location?: string; skill?: number }
  | { type: "mine"; action: string; floor?: number; x?: number; y?: number }
  | { type: "forage"; item?: string }
  | { type: "cook"; recipe: string }
  | { type: "process"; recipe?: string }
  | { type: "upgradeTool"; tool: string }
  | { type: "build"; building: string }
  | { type: "decorate"; item: string; x: number; y: number; rotation?: number }
  | { type: "date" | "propose"; npc: string }
  | { type: "adopt"; choice?: string }
  | { type: "festival"; score?: number }
  | { type: "quest"; id: string }
  | { type: "discover"; page: string }
  | { type: "story"; id: string }
  | { type: "choice"; flag: string }
  | { type: "saveMarker"; label?: string; day?: number }
  | {
      type: "debug";
      action: string;
      value?: number | string | boolean;
      id?: string;
    }
  | { type: "refill" | "hotSpring" | "readMail" | "tv" }
  | { type: "plantTree"; tree: string; x: number; y: number }
  | { type: "smelt"; ore: string }
  | { type: "store" | "retrieve"; item: string; quantity: number };
export interface GameState {
  version: number;
  seed: number;
  rng: number;
  day: number;
  minute: number;
  money: number;
  stamina: number;
  maxStamina: number;
  fatigue: number;
  weather: Weather;
  forecast: Weather;
  cold: boolean;
  player: {
    name: string;
    farmName: string;
    petName: string;
    petType: string;
    map: string;
    x: number;
    y: number;
    facing: string;
    appearance: Record<string, number>;
    birthday: { season: Season; day: number };
  };
  inventory: Stack[];
  storage: Stack[];
  shipping: Stack[];
  plots: Record<string, Plot>;
  debris: Record<string, string>;
  animals: Animal[];
  friendship: Record<string, number>;
  flags: Record<string, boolean>;
  tools: Record<string, { tier: number; water?: number; readyDay?: number }>;
  equipped: string;
  selectedSeed: string;
  seedCharges: Record<string, number>;
  buildings: Record<string, number>;
  construction: Record<string, number>;
  collections: Record<string, number>;
  journal: string[];
  mail: string[];
  achievements: string[];
  mine: {
    broken: string[];
    floor: number;
    maxFloor: number;
    rocks: number;
    ladder: boolean;
    minutes: number;
  };
  lastSummary: { earned: number; items: Stack[]; events: string[] };
  stats: {
    totalEarned: number;
    cropsShipped: number;
    fishCaught: number;
    festivals: number;
    daysPlayed: number;
    harvested: number;
  };
  relationships: {
    dating: string | null;
    spouse: string | null;
    weddingDay: number | null;
    marriedDay: number | null;
    child: {
      name: string;
      joinedDay: number;
      stage: number;
      kind: string;
    } | null;
  };
  settings: {
    timeSpeed: number;
    preciseSow: boolean;
    festivalDifficulty: number;
    runToggle: boolean;
  };
  talked: Record<string, number>;
  gifted: Record<string, { day: number; week: number; count: number }>;
  dialogueHistory: Record<string, number>;
  trees: { id: string; x: number; y: number; age: number; fruit: boolean }[];
  decorations: { id: string; x: number; y: number; rotation: number }[];
  processing: { id: string; ready: number; quality: number }[];
  foraged: Record<string, number>;
  knownRecipes: string[];
  fishRecords: Record<string, number>;
  markers: { day: number; label: string }[];
  petAffection: number;
  pendingChoices: string[];
}
export function createGame(
  options: {
    name?: string;
    farmName?: string;
    petName?: string;
    petType?: string;
    seed?: number;
    appearance?: Record<string, number>;
    birthday?: { season: Season; day: number };
  } = {},
): GameState {
  const seed = Number.isFinite(options.seed)
    ? Math.trunc(options.seed!) >>> 0
    : 1739;
  const state: GameState = {
    version: 2,
    seed,
    rng: seed >>> 0,
    day: 0,
    minute: 360,
    money: 500,
    stamina: 100,
    maxStamina: 100,
    fatigue: 0,
    weather: "sunny",
    forecast: "sunny",
    cold: false,
    player: {
      name: options.name?.slice(0, 20) || "Rowan",
      farmName: options.farmName?.slice(0, 24) || "Willowmere",
      petName: options.petName?.slice(0, 16) || "Clover",
      petType: options.petType || "dog",
      map: "farm",
      x: 10,
      y: 9,
      facing: "down",
      appearance: options.appearance ?? {},
      birthday: options.birthday ?? { season: "spring", day: 1 },
    },
    inventory: [{ id: "turnip_seed", quantity: 3, quality: 0 }],
    storage: [],
    shipping: [],
    plots: {},
    debris: {},
    animals: [],
    friendship: {},
    flags: { intro: true },
    tools: Object.fromEntries(
      [
        "hoe",
        "can",
        "sickle",
        "axe",
        "hammer",
        "rod",
        "milker",
        "brush",
        "shears",
      ].map((id) => [id, { tier: 0, ...(id === "can" ? { water: 30 } : {}) }]),
    ),
    equipped: "hoe",
    selectedSeed: "turnip",
    seedCharges: {},
    buildings: { house: 0 },
    construction: {},
    collections: {},
    journal: ["intro"],
    mail: ["wren_spring"],
    achievements: [],
    mine: {
      broken: [],
      floor: 0,
      maxFloor: 0,
      rocks: 0,
      ladder: false,
      minutes: 0,
    },
    lastSummary: { earned: 0, items: [], events: [] },
    stats: {
      totalEarned: 0,
      cropsShipped: 0,
      fishCaught: 0,
      festivals: 0,
      daysPlayed: 0,
      harvested: 0,
    },
    relationships: {
      dating: null,
      spouse: null,
      weddingDay: null,
      marriedDay: null,
      child: null,
    },
    settings: {
      timeSpeed: 1,
      preciseSow: false,
      festivalDifficulty: 1,
      runToggle: false,
    },
    talked: {},
    gifted: {},
    dialogueHistory: {},
    trees: [],
    decorations: [],
    processing: [],
    foraged: {},
    knownRecipes: [],
    fishRecords: {},
    markers: [],
    petAffection: 0,
    pendingChoices: [],
  };
  const farmLayout = layoutFor("farm", 80, 64, false, [
    "square",
    "forest",
    "riverside",
  ]);
  for (let y = 29; y < 54; y++)
    for (let x = 20; x < 60; x++) {
      const n = ((x * 73856093) ^ (y * 19349663) ^ seed) >>> 0;
      if (n % 7 === 0 && !isBlocked("farm", x, y, farmLayout))
        state.debris[`${x},${y}`] = [
          "weed",
          "stone",
          "branch",
          "stump",
          "boulder",
          "log",
        ][n % 6]!;
    }
  for (const [x, y, kind] of [
    [9, 16, "weed"],
    [12, 18, "stone"],
    [15, 17, "branch"],
    [18, 19, "stump"],
    [8, 20, "weed"],
    [16, 20, "boulder"],
  ] as const)
    state.debris[`${x},${y}`] = kind;
  return state;
}
