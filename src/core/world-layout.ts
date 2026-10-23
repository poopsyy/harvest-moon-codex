export type Landmark = {
  x: number;
  y: number;
  frame: string;
  target?: string;
  width?: number;
  height?: number;
};
export type Layout = {
  width: number;
  height: number;
  indoor: boolean;
  landmarks: Landmark[];
  exits: { x: number; y: number; map: string }[];
};
export function hash(x: number, y: number): number {
  return (((x * 73856093) ^ (y * 19349663)) >>> 0) % 1000;
}
export function layoutFor(
  id: string,
  width: number,
  height: number,
  indoor: boolean,
  connections: string[],
  buildings: Record<string, number> = {},
): Layout {
  const landmarks: Landmark[] = [];
  const exits = connections.map((map, i) => ({
    map,
    x: i % 2 ? 2 : width - 3,
    y: 9 + Math.floor(i / 2) * 5,
  }));
  if (id === "farm") {
    landmarks.push(
      {
        x: 8,
        y: 5,
        frame: "building_house",
        target: "warp:farmhouse",
        width: 6,
        height: 3,
      },
      {
        x: 20,
        y: 7,
        frame: "building_barn",
        target: "animals",
        width: 6,
        height: 3,
      },
      {
        x: 12,
        y: 6,
        frame: "shipping",
        target: "shipping",
        width: 2,
        height: 1,
      },
    );
    if (buildings.greenhouse)
      landmarks.push({
        x: 22,
        y: 19,
        frame: "building_greenhouse",
        target: "warp:greenhouse",
        width: 6,
        height: 3,
      });
    const houseLevel = buildings.house_3
      ? 3
      : buildings.house_2
        ? 2
        : buildings.house_1
          ? 1
          : 0;
    if (houseLevel && landmarks[0]) {
      landmarks[0].frame = `building_house_${houseLevel}`;
      landmarks[0].width = 8;
      landmarks[0].height = 4;
    }
    exits.splice(
      0,
      exits.length,
      { x: 25, y: 9, map: "square" },
      { x: 3, y: 22, map: "forest" },
      { x: 20, y: 25, map: "riverside" },
    );
  } else if (indoor) {
    exits.splice(0, exits.length, {
      x: Math.floor(width / 2),
      y: height - 3,
      map: connections[0] ?? "square",
    });
    landmarks.push(
      {
        x: 4,
        y: 4,
        frame: "bed",
        target: id === "farmhouse" ? "bed" : "diary",
        width: 2,
        height: 2,
      },
      { x: 9, y: 4, frame: "desk", target: "diary", width: 2, height: 1 },
      { x: 13, y: 4, frame: "tv", target: "tv", width: 1, height: 1 },
    );
    if (id !== "farmhouse")
      landmarks.push({
        x: 8,
        y: 8,
        frame: "counter",
        target: ["store", "market", "ranch"].includes(id)
          ? "shop"
          : id === "forge"
            ? "forge"
            : id === "workshop"
              ? "workshop"
              : id === "mine"
                ? "mine"
                : "board",
        width: 4,
        height: 1,
      });
  } else {
    const buildings = connections.filter(
      (map) =>
        ![
          "farm",
          "square",
          "market",
          "riverside",
          "hilltop",
          "forest",
          "mountain",
          "beach",
          "cove",
          "summit",
        ].includes(map),
    );
    buildings.forEach((map, i) =>
      landmarks.push({
        x: 7 + (i % 3) * 10,
        y: 6 + Math.floor(i / 3) * 10,
        frame:
          map === "barn" || map === "ranch" ? "building_barn" : "building_shop",
        target: `warp:${map}`,
        width: 6,
        height: 3,
      }),
    );
    if (id === "square")
      landmarks.push(
        { x: 17, y: 13, frame: "tree_3", target: "tree", width: 2, height: 1 },
        { x: 11, y: 12, frame: "board", target: "board", width: 2, height: 1 },
      );
  }
  return { width, height, indoor, landmarks, exits };
}
export function groundAt(
  id: string,
  x: number,
  y: number,
  layout: Layout,
): string {
  if (layout.indoor)
    return x < 2 || y < 2 || x >= layout.width - 2 || y >= layout.height - 2
      ? "wall"
      : "floor";
  if (id === "mine") return hash(x, y) % 9 === 0 ? "tile_stone" : "tile_soil";
  if (id === "beach" || id === "cove")
    return y > layout.height * 0.65 ? "tile_water_0" : "tile_sand";
  if (id === "farm") {
    if (x >= 28 && x <= 32 + Math.floor(Math.sin(y / 5) * 2))
      return "tile_water_0";
    if (
      (y >= 8 && y <= 10 && x <= 28) ||
      (x >= 7 && x <= 9 && y >= 5 && y <= 12) ||
      (x >= 18 && x <= 20 && y >= 7 && y <= 26)
    )
      return "tile_path";
    if (x >= 7 && x <= 17 && y >= 12 && y <= 21) return "tile_soil";
  } else {
    if (
      (id === "riverside" || id === "forest") &&
      x > layout.width * 0.67 &&
      x < layout.width * 0.8
    )
      return "tile_water_0";
    if ((y >= 8 && y <= 10) || (x >= 15 && x <= 17)) return "tile_path";
  }
  return "tile_grass";
}
export function isBlocked(
  id: string,
  x: number,
  y: number,
  layout: Layout,
): boolean {
  if (x < 1 || y < 1 || x >= layout.width - 1 || y >= layout.height - 1)
    return true;
  if (
    id === "farm" &&
    ((y === 11 && x >= 5 && x <= 23 && ![8, 9, 19, 20].includes(x)) ||
      (y === 23 && x >= 5 && x < 18) ||
      (x === 5 && y >= 12 && y < 23))
  )
    return true;
  const ground = groundAt(id, x, y, layout);
  if (ground === "wall" || ground === "tile_water_0") return true;
  if (ground === "tile_grass" && !layout.indoor) {
    const h = hash(x, y);
    const edge =
      x < 3 || y < 3 || x > layout.width - 4 || y > layout.height - 4;
    const grove =
      id === "farm"
        ? (x < 5 && y > 5) || (x > 21 && x < 27 && y > 12)
        : id === "forest" || id === "hilltop" || id === "mountain";
    const nearBuilding = layout.landmarks.some(
      (p) => Math.abs(p.x - x) < 5 && y >= p.y - 4 && y <= p.y + 2,
    );
    if (!nearBuilding && ((edge && h % 3 === 0) || (grove && h % 13 === 0)))
      return true;
  }
  return layout.landmarks.some(
    (p) =>
      x >= p.x - Math.floor((p.width ?? 1) / 2) &&
      x < p.x + Math.ceil((p.width ?? 1) / 2) &&
      y <= p.y &&
      y > p.y - (p.height ?? 1),
  );
}
