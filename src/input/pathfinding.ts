export type Tile = { x: number; y: number };
/** A bounded breadth-first route on the cardinal tile grid. */
export function findPath(
  start: Tile,
  goal: Tile,
  width: number,
  height: number,
  blocked: (x: number, y: number) => boolean,
): Tile[] {
  const key = (x: number, y: number) => y * width + x;
  const queue: Tile[] = [start],
    parents = new Map<number, Tile>();
  const seen = new Set<number>([key(start.x, start.y)]);
  let destination: Tile | undefined;
  const solidGoal = blocked(goal.x, goal.y);
  for (let index = 0; index < queue.length; index++) {
    const tile = queue[index]!;
    if (
      Math.abs(tile.x - goal.x) + Math.abs(tile.y - goal.y) <=
      (solidGoal ? 1 : 0)
    ) {
      destination = tile;
      break;
    }
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ] as const) {
      const x = tile.x + dx,
        y = tile.y + dy,
        k = key(x, y);
      if (
        x < 0 ||
        y < 0 ||
        x >= width ||
        y >= height ||
        seen.has(k) ||
        blocked(x, y)
      )
        continue;
      seen.add(k);
      parents.set(k, tile);
      queue.push({ x, y });
    }
  }
  if (!destination) return [];
  const route: Tile[] = [];
  while (destination.x !== start.x || destination.y !== start.y) {
    route.push(destination);
    destination = parents.get(key(destination.x, destination.y));
    if (!destination) return [];
  }
  return route.reverse();
}
