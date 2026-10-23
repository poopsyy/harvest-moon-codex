import { mkdirSync, writeFileSync } from "node:fs";
import { maps, npcs } from "../src/data/catalog";
import { groundAt, isBlocked, layoutFor, hash } from "../src/core/world-layout";
import {
  blobMask,
  blobFrame,
  blobTerrains,
  blobMasks,
  type BlobTerrain,
} from "./autotile";
interface MapObject {
  id: number;
  name: string;
  type: string;
  x: number;
  y: number;
  width: number;
  height: number;
  gid?: number;
  ellipse?: boolean;
  properties: {
    name: string;
    type: string;
    value: string | number | boolean;
  }[];
}
interface Tile {
  id: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  properties?: { name: string; type: string; value: string | number }[];
  animation?: { tileid: number; duration: number }[];
}
export function generateMaps(
  dir: string,
  props: { name: string; width: number; height: number }[] = [],
) {
  mkdirSync(`${dir}/maps`, { recursive: true });
  const tiles: Tile[] = [],
    gid = new Map<string, number>();
  const add = (name: string, image: string, width = 16, height = 16) => {
    const id = tiles.length;
    tiles.push({
      id,
      image,
      imagewidth: width,
      imageheight: height,
      properties: [{ name: "frame", type: "string", value: name }],
    });
    gid.set(name, id + 1);
  };
  for (const name of ["grass", "path", "water", "wood", "stone", "soil"])
    add(`base_${name}`, `../tiles/${name}.png`);
  for (const terrain of blobTerrains)
    for (const mask of blobMasks) {
      const start = tiles.length;
      for (let frame = 0; frame < (terrain === "water" ? 4 : 1); frame++)
        add(
          blobFrame(terrain, mask, frame),
          `../tiles/${blobFrame(terrain, mask, frame)}.png`,
        );
      if (terrain === "water")
        tiles[start]!.animation = Array.from({ length: 4 }, (_, i) => ({
          tileid: start + i,
          duration: 400,
        }));
    }
  for (let f = 0; f < 8; f++) add(`flower_${f}`, `../tiles/flower_${f}.png`);
  for (const p of props)
    add(p.name, `../props/${p.name}.png`, p.width, p.height);
  const terrainFor = (ground: string): BlobTerrain | null =>
    ground === "tile_grass"
      ? "grass"
      : ground === "tile_path"
        ? "dirt"
        : ground === "tile_tilled"
          ? "tilled"
          : ground === "tile_water_0"
            ? "water"
            : ground === "tile_sand"
              ? "sand"
              : ground === "tile_snow"
                ? "snow"
                : null;
  for (const map of maps) {
    const layout = layoutFor(
        map.id,
        map.width,
        map.height,
        map.kind === "indoor",
        map.connections,
      ),
      ground: number[] = [],
      detail: number[] = [],
      collision: number[] = [];
    const same = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < map.width && y < map.height
        ? groundAt(map.id, x, y, layout)
        : "void";
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        const material = same(x, y),
          terrain = terrainFor(material),
          blocked = isBlocked(map.id, x, y, layout);
        ground.push(
          terrain
            ? gid.get(
                blobFrame(
                  terrain,
                  blobMask((nx, ny) => same(nx, ny) === material, x, y),
                ),
              )!
            : gid.get(
                material === "floor"
                  ? "base_wood"
                  : material === "tile_soil"
                    ? "base_soil"
                    : "base_stone",
              )!,
        );
        detail.push(
          material === "tile_grass" && !blocked && hash(x, y) % 37 === 0
            ? gid.get(`flower_${hash(y, x) % 8}`)!
            : 0,
        );
        collision.push(blocked ? gid.get("base_stone")! : 0);
      }
    let nextObject = 1;
    const object = (
      name: string,
      type: string,
      x: number,
      y: number,
      width = 16,
      height = 16,
      properties: MapObject["properties"] = [],
    ): MapObject => ({
      id: nextObject++,
      name,
      type,
      x,
      y,
      width,
      height,
      properties,
    });
    const objects: MapObject[] = [],
      above: MapObject[] = [],
      lights: MapObject[] = [],
      warps: MapObject[] = [],
      spawns: MapObject[] = [],
      triggers: MapObject[] = [];
    for (const landmark of layout.landmarks) {
      const frame = gid.has(landmark.frame)
        ? landmark.frame
        : landmark.frame.startsWith("building_")
          ? "building_shop"
          : landmark.target === "shipping"
            ? "shipping"
            : "table";
      const art = props.find((p) => p.name === frame);
      const width = art?.width ?? 16,
        height = art?.height ?? 16;
      objects.push({
        ...object(
          landmark.target ?? frame,
          "landmark",
          landmark.x * 16 - width / 2,
          landmark.y * 16 + 16,
          width,
          height,
          [
            { name: "frame", type: "string", value: frame },
            { name: "target", type: "string", value: landmark.target ?? "" },
            { name: "sortY", type: "int", value: landmark.y * 16 },
          ],
        ),
        gid: gid.get(frame),
      });
      if (height >= 48)
        above.push(
          object(
            `${frame}_canopy`,
            "occlusion",
            landmark.x * 16 - width / 2,
            (landmark.y + 1) * 16 - height,
            width,
            height - 24,
            [
              { name: "sourceFrame", type: "string", value: frame },
              { name: "fadeOnOverlap", type: "bool", value: true },
            ],
          ),
        );
      if (frame.startsWith("building_") || landmark.target === "bed")
        lights.push({
          ...object(
            `${frame}_window`,
            "warm_light",
            landmark.x * 16 - 12,
            landmark.y * 16 - 16,
            24,
            24,
            [
              { name: "color", type: "color", value: "#ffd19a" },
              { name: "radius", type: "int", value: 32 },
              { name: "nightOnly", type: "bool", value: map.kind !== "indoor" },
            ],
          ),
          ellipse: true,
        });
      if (landmark.target)
        triggers.push(
          object(
            landmark.target,
            "interact",
            landmark.x * 16 - 8,
            landmark.y * 16,
            16,
            16,
            [{ name: "action", type: "string", value: landmark.target }],
          ),
        );
    }
    for (const destination of map.connections) {
      const gate = layout.exits.find((exit) => exit.map === destination);
      const door = layout.landmarks.find(
        (landmark) => landmark.target === `warp:${destination}`,
      );
      const exit = {
        map: destination,
        x: gate?.x ?? door?.x ?? 2,
        y: gate?.y ?? (door?.y ?? map.height - 3) + 1,
      };
      warps.push(
        object(exit.map, "warp", exit.x * 16, exit.y * 16, 16, 16, [
          { name: "destination", type: "string", value: exit.map },
        ]),
      );
      triggers.push(
        object(
          `exit_${exit.map}`,
          "enter_region",
          exit.x * 16,
          exit.y * 16,
          16,
          16,
          [{ name: "action", type: "string", value: `warp:${exit.map}` }],
        ),
      );
    }
    if (map.kind === "outdoor")
      for (let y = 3; y < map.height - 3; y += 3)
        for (let x = 3; x < map.width - 3; x += 3) {
          if (
            same(x, y) !== "tile_grass" ||
            layout.landmarks.some(
              (l) => Math.abs(l.x - x) < 5 && Math.abs(l.y - y) < 5,
            ) ||
            hash(x, y) % 7 !== 0
          )
            continue;
          const tree = object(
            `tree_${x}_${y}`,
            "tree",
            x * 16 - 24,
            y * 16 + 16,
            48,
            64,
            [
              { name: "frame", type: "string", value: "tree_0" },
              { name: "sortY", type: "int", value: y * 16 },
            ],
          );
          tree.gid = gid.get("tree_0");
          objects.push(tree);
          above.push(
            object(
              `canopy_${x}_${y}`,
              "occlusion",
              x * 16 - 24,
              y * 16 - 48,
              48,
              40,
              [
                { name: "sourceObject", type: "object", value: tree.id },
                { name: "fadeOnOverlap", type: "bool", value: true },
              ],
            ),
          );
          collision[y * map.width + x] = gid.get("base_stone")!;
        }
    const startX =
        map.id === "farm"
          ? 10
          : map.kind === "indoor"
            ? Math.floor(map.width / 2)
            : 10,
      startY =
        map.id === "farm" ? 9 : map.kind === "indoor" ? map.height - 4 : 9;
    spawns.push(object("player", "player", startX * 16, startY * 16));
    for (const npc of npcs) {
      const stop = npc.schedule.find((stop) => stop.map === map.id);
      if (stop)
        spawns.push(
          object(npc.id, "npc", stop.x * 16, stop.y * 16, 16, 24, [
            { name: "npc", type: "string", value: npc.id },
            { name: "arrivalHour", type: "int", value: stop.hour },
          ]),
        );
    }
    if (map.kind === "mine") {
      lights.push({
        ...object(
          "entrance_torch",
          "torch",
          startX * 16 - 24,
          startY * 16 - 40,
          16,
          24,
          [
            { name: "radius", type: "int", value: 48 },
            { name: "color", type: "color", value: "#f0a878" },
          ],
        ),
        ellipse: true,
      });
      triggers.push(
        object(
          "mine_stairs",
          "mine_floor",
          startX * 16,
          startY * 16 - 32,
          16,
          16,
          [{ name: "action", type: "string", value: "mine" }],
        ),
      );
    }
    const tileLayer = (
      id: number,
      name: string,
      data: number[],
      visible = true,
    ) => ({
      id,
      name,
      type: "tilelayer",
      width: map.width,
      height: map.height,
      data,
      opacity: visible ? 1 : 0,
      visible,
      x: 0,
      y: 0,
    });
    const objectLayer = (
      id: number,
      name: string,
      entries: MapObject[],
      visible = true,
    ) => ({
      id,
      name,
      type: "objectgroup",
      objects: entries,
      opacity: 1,
      visible,
      x: 0,
      y: 0,
      draworder: name === "Objects" ? "topdown" : "index",
    });
    writeFileSync(
      `${dir}/maps/${map.id}.json`,
      JSON.stringify({
        compressionlevel: -1,
        height: map.height,
        width: map.width,
        infinite: false,
        orientation: "orthogonal",
        renderorder: "right-down",
        tiledversion: "1.11",
        type: "map",
        version: "1.10",
        tileheight: 16,
        tilewidth: 16,
        nextlayerid: 10,
        nextobjectid: nextObject,
        layers: [
          tileLayer(1, "Ground", ground),
          tileLayer(2, "GroundDetail", detail),
          tileLayer(3, "Collision", collision, false),
          objectLayer(4, "Objects", objects),
          objectLayer(5, "AbovePlayer", above, false),
          objectLayer(6, "Lights", lights, false),
          objectLayer(7, "Warps", warps, false),
          objectLayer(8, "Spawns", spawns, false),
          objectLayer(9, "Triggers", triggers, false),
        ],
        tilesets: [
          {
            firstgid: 1,
            name: "Willowmere Blob Terrain and Objects",
            tilewidth: 16,
            tileheight: 16,
            tilecount: tiles.length,
            columns: 0,
            tiles,
          },
        ],
        properties: [
          { name: "name", type: "string", value: map.name },
          { name: "blobOrder", type: "string", value: "N E S W NE SE SW NW" },
        ],
      }),
    );
  }
}
