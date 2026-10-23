import { it, expect } from "vitest";
import { generateMineFloor } from "../../src/systems/mine";
import { findPath } from "../../src/systems/pathfinding";
it("generates sixty deterministic traversable cave floors with ten-floor treasure chambers", () => {
  for (let floor = 1; floor <= 60; floor++) {
    const cave = generateMineFloor(17, 4, floor);
    expect(generateMineFloor(17, 4, floor)).toEqual(cave);
    const blocked = new Set<string>();
    cave.tiles.forEach((row, y) =>
      row.forEach((tile, x) => {
        if (tile === "wall") blocked.add(`${x},${y}`);
      }),
    );
    expect(
      findPath(cave.entrance, cave.ladder, cave.width, cave.height, blocked)
        .length,
    ).toBeGreaterThan(0);
    expect(cave.crystal).toBe(floor % 10 === 0);
  }
  expect(generateMineFloor(17, 4, 1)).not.toEqual(generateMineFloor(17, 5, 1));
});
