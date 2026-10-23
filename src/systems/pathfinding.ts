export type Point = { x: number; y: number };
export function findPath(
  start: Point,
  end: Point,
  width: number,
  height: number,
  blocked: ReadonlySet<string> = new Set(),
): Point[] {
  const key = (p: Point) => `${p.x},${p.y}`;
  if (
    end.x < 0 ||
    end.y < 0 ||
    end.x >= width ||
    end.y >= height ||
    blocked.has(key(end))
  )
    return [];
  const open = [start],
    cost = new Map([[key(start), 0]]),
    parent = new Map<string, Point>();
  while (open.length) {
    open.sort(
      (a, b) =>
        cost.get(key(a))! +
        Math.abs(a.x - end.x) +
        Math.abs(a.y - end.y) -
        (cost.get(key(b))! + Math.abs(b.x - end.x) + Math.abs(b.y - end.y)),
    );
    const p = open.shift()!;
    if (key(p) === key(end)) {
      const path = [p];
      let prev = parent.get(key(p));
      while (prev) {
        path.unshift(prev);
        prev = parent.get(key(prev));
      }
      return path;
    }
    for (const [dx, dy] of [
      [0, 1],
      [1, 0],
      [0, -1],
      [-1, 0],
    ]) {
      const q = { x: p.x + dx!, y: p.y + dy! },
        k = key(q),
        g = cost.get(key(p))! + 1;
      if (
        q.x < 0 ||
        q.y < 0 ||
        q.x >= width ||
        q.y >= height ||
        blocked.has(k) ||
        g >= (cost.get(k) ?? Infinity)
      )
        continue;
      cost.set(k, g);
      parent.set(k, p);
      if (!open.some((v) => key(v) === k)) open.push(q);
    }
  }
  return [];
}
