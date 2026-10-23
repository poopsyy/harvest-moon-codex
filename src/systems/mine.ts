import { random } from "../core/rng";
export type MineTile =
  "wall" | "floor" | "rock" | "ore" | "gem" | "ladder" | "chest";
export interface MineLayout {
  width: number;
  height: number;
  tiles: MineTile[][];
  entrance: { x: number; y: number };
  ladder: { x: number; y: number };
  crystal: boolean;
}
export function generateMineFloor(
  seed: number,
  day: number,
  floor: number,
): MineLayout {
  const rng = {
      rng:
        (seed ^ Math.imul(day + 1, 374761393) ^ Math.imul(floor, 668265263)) >>>
        0,
    },
    width = 30,
    height = 24;
  const tiles: MineTile[][] = Array.from({ length: height }, () =>
    Array.from({ length: width }, () => "wall" as MineTile),
  );
  for (let room = 0; room < 6; room++) {
    const x = 2 + Math.floor(random(rng) * 20),
      y = 2 + Math.floor(random(rng) * 15),
      w = 4 + Math.floor(random(rng) * 5),
      h = 3 + Math.floor(random(rng) * 5);
    for (let yy = y; yy < Math.min(height - 2, y + h); yy++)
      for (let xx = x; xx < Math.min(width - 2, x + w); xx++)
        tiles[yy]![xx] = "floor";
    for (let xx = 2; xx <= x; xx++) tiles[3]![xx] = "floor";
    for (let yy = 3; yy <= y; yy++) tiles[yy]![x] = "floor";
  }
  const floors: { x: number; y: number }[] = [];
  for (let y = 1; y < height - 1; y++)
    for (let x = 1; x < width - 1; x++)
      if (tiles[y]![x] === "floor") {
        floors.push({ x, y });
        const roll = random(rng);
        tiles[y]![x] =
          roll < 0.03
            ? "gem"
            : roll < 0.12
              ? "ore"
              : roll < 0.35
                ? "rock"
                : "floor";
      }
  const entrance = { x: 2, y: 3 };
  tiles[3]![2] = "floor";
  const ladder = floors[Math.floor(random(rng) * floors.length)] ?? {
    x: 3,
    y: 3,
  };
  tiles[ladder.y]![ladder.x] = "ladder";
  const crystal = floor % 10 === 0;
  if (crystal) tiles[3]![3] = "chest";
  return { width, height, tiles, entrance, ladder, crystal };
}
