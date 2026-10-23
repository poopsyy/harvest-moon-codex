import type { Animal, GameState } from "../state/game";
import { decor, maps } from "../data/catalog";
import { groundAt, isBlocked, layoutFor } from "../core/world-layout";

export type GrassError =
  | "wrong_map"
  | "invalid_tile"
  | "winter"
  | "occupied"
  | "already_planted"
  | "no_seed";
export type GrassResult =
  | { ok: true; x: number; y: number; readyDay: number }
  | { ok: false; error: GrassError };
export const GRASS_REGROW_DAYS = 3;
export const grassKey = (x: number, y: number) => `grass_${x}_${y}`;
const readyKey = (x: number, y: number) => `grass_ready_${x}_${y}`;
const winter = (s: GameState) => Math.floor(s.day / 30) % 4 === 3;
const validCoordinate = (x: number, y: number) =>
  Number.isInteger(x) &&
  Number.isInteger(y) &&
  x >= 1 &&
  y >= 1 &&
  x < 79 &&
  y < 63;

/** Stable serialization uses only existing boolean flags and numeric collections. */
export function hasGrass(s: GameState, x: number, y: number): boolean {
  return validCoordinate(x, y) && s.flags[grassKey(x, y)] === true;
}
export function grassReady(s: GameState, x: number, y: number): boolean {
  return (
    hasGrass(s, x, y) &&
    !winter(s) &&
    (s.collections[readyKey(x, y)] ?? Infinity) <= s.day
  );
}
export function siloCapacity(s: GameState): number {
  const tier = s.buildings.silo ?? 0;
  return tier >= 3 ? 999 : tier >= 2 ? 500 : tier >= 1 ? 200 : 0;
}
export function siloFodder(s: GameState): number {
  return Math.max(0, Math.floor(s.collections.silo_fodder ?? 0));
}

/** Plant one perennial patch; unsuccessful actions do not consume any resources. */
export function plantGrass(s: GameState, x: number, y: number): GrassResult {
  if (s.player.map !== "farm") return { ok: false, error: "wrong_map" };
  if (!validCoordinate(x, y)) return { ok: false, error: "invalid_tile" };
  if (winter(s)) return { ok: false, error: "winter" };
  if (hasGrass(s, x, y)) return { ok: false, error: "already_planted" };
  const farm = maps.find((map) => map.id === "farm")!;
  const layout = layoutFor(
    "farm",
    farm.width,
    farm.height,
    false,
    farm.connections,
    s.buildings,
  );
  const ground = groundAt("farm", x, y, layout),
    plot = s.plots[`${x},${y}`];
  if (
    isBlocked("farm", x, y, layout) ||
    !["tile_grass", "tile_soil"].includes(ground) ||
    s.debris[`${x},${y}`] ||
    plot?.crop ||
    plot?.tilled ||
    s.trees.some((t) => Math.abs(t.x - x) <= 1 && Math.abs(t.y - y) <= 1) ||
    s.decorations.some((d) => {
      const item = decor.find((item) => item.id === d.id),
        width = item?.width ?? 1,
        height = item?.height ?? 1;
      const rotated = d.rotation % 180 !== 0,
        w = rotated ? height : width,
        h = rotated ? width : height;
      return x >= d.x && x < d.x + w && y >= d.y && y < d.y + h;
    })
  )
    return { ok: false, error: "occupied" };
  const seed = s.inventory.find(
    (item) => item.id === "grass_seed" && item.quantity > 0,
  );
  if (!seed) return { ok: false, error: "no_seed" };
  seed.quantity--;
  s.inventory = s.inventory.filter((item) => item.quantity > 0);
  s.flags[grassKey(x, y)] = true;
  s.collections[readyKey(x, y)] = s.day + GRASS_REGROW_DAYS;
  return { ok: true, x, y, readyDay: s.day + GRASS_REGROW_DAYS };
}

/** Harvest only after checking storage, so a full bag and silo cannot destroy grass. */
export function cutGrass(s: GameState, x: number, y: number): number {
  if (s.player.map !== "farm" || !grassReady(s, x, y)) return 0;
  const stored = siloFodder(s),
    capacity = siloCapacity(s);
  if (stored < capacity) s.collections.silo_fodder = stored + 1;
  else {
    const stack = s.inventory.find(
      (item) => item.id === "fodder" && item.quality === 0,
    );
    if (stack) stack.quantity++;
    else if (s.inventory.length < (s.flags.backpack ? 36 : 24))
      s.inventory.push({ id: "fodder", quantity: 1, quality: 0 });
    else return 0;
  }
  s.collections[readyKey(x, y)] = s.day + GRASS_REGROW_DAYS;
  return 1;
}

/** Consume one stored meal; callers set the chosen animal's fed flag on success. */
export function feedFromSilo(s: GameState): boolean {
  const stored = siloFodder(s);
  if (siloCapacity(s) === 0 || stored < 1) return false;
  s.collections.silo_fodder = stored - 1;
  return true;
}

/** One animal consumes one mature patch, in stable row-major order, per day. */
export function grazeAnimal(s: GameState, animal: Animal): boolean {
  if (
    animal.fed ||
    !animal.outside ||
    animal.away ||
    !["cow", "sheep", "chicken", "horse"].includes(animal.kind) ||
    !["sunny", "cloudy"].includes(s.weather) ||
    winter(s)
  )
    return false;
  const patches = Object.keys(s.flags)
    .filter((key) => /^grass_\d+_\d+$/.test(key) && s.flags[key])
    .map((key) => {
      const [, x, y] = key.split("_");
      return { x: Number(x), y: Number(y) };
    })
    .filter(({ x, y }) => grassReady(s, x, y))
    .sort((a, b) => a.y - b.y || a.x - b.x);
  const patch = patches[0];
  if (!patch) return false;
  s.collections[readyKey(patch.x, patch.y)] = s.day + GRASS_REGROW_DAYS;
  animal.fed = true;
  return true;
}
