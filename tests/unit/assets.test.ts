import {
  blobMasks,
  blobTerrains,
  normalizeBlobMask,
  blobMask,
  blobFrame,
} from "../../tools/autotile";
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { PNG } from "pngjs";
import { palette } from "../../tools/palette";
import { songs, jingleSongs } from "../../src/audio/songs";
import { effects } from "../../src/audio/sfx";
import { maps, npcs, crops, items, trees, decor } from "../../src/data/catalog";
function pngs(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory()
      ? pngs(join(dir, e.name))
      : e.name.endsWith(".png")
        ? [join(dir, e.name)]
        : [],
  );
}
describe("Original asset production", () => {
  it("contains all four independent intro illustrations at 320 by 160", () => {
    const pixels = new Set<string>();
    for (const name of ["city", "letter", "arrival", "farm"]) {
      const file = readFileSync(`public/assets/intro_${name}.png`),
        image = PNG.sync.read(file);
      expect(image.width).toBe(320);
      expect(image.height).toBe(160);
      pixels.add(file.toString("base64"));
    }
    expect(pixels.size).toBe(4);
  });

  it("every visible pixel in every generated PNG belongs to the 48 inks", () => {
    expect(new Set(palette).size).toBe(48);
    const allowed = new Set(palette.map((c) => c.slice(1).toLowerCase()));
    const files = pngs("public");
    expect(files.length).toBeGreaterThan(8);
    for (const file of files) {
      const p = PNG.sync.read(readFileSync(file));
      const invalid = new Set<string>();
      for (let i = 0; i < p.data.length; i += 4)
        if (p.data[i + 3]) {
          const color = p.data.subarray(i, i + 3).toString("hex");
          if (!allowed.has(color)) invalid.add(color);
        }
      expect([...invalid], file).toEqual([]);
    }
  });
  it("exports frame geometry and complete catalog art", () => {
    const atlas = JSON.parse(
      readFileSync("public/assets/atlas.json", "utf8"),
    ) as {
      frames: Record<
        string,
        { frame: { x: number; y: number; w: number; h: number } }
      >;
    };
    const p = PNG.sync.read(readFileSync("public/assets/atlas.png"));
    for (const [name, { frame: f }] of Object.entries(atlas.frames)) {
      expect(f.x + f.w, name).toBeLessThanOrEqual(p.width);
      expect(f.y + f.h, name).toBeLessThanOrEqual(p.height);
    }
    for (const npc of npcs) {
      for (const d of ["up", "down", "left", "right"])
        for (let f = 0; f < 4; f++)
          expect(atlas.frames[`npc_${npc.id}_${d}_${f}`]?.frame.h).toBe(24);
      for (const emotion of [
        "neutral",
        "happy",
        "sad",
        "angry",
        "surprised",
        "blush",
      ])
        expect(atlas.frames[`portrait_${npc.id}_${emotion}`]?.frame.w).toBe(48);
    }
    for (const crop of crops)
      for (let stage = 0; stage < 7; stage++)
        expect(atlas.frames[`crop_${crop.id}_${stage}`]).toBeDefined();
    for (const item of items)
      expect(atlas.frames[`item_${item.id}`]).toBeDefined();
    for (const tree of trees)
      for (const stage of ["sapling", "mature", "fruit"])
        expect(atlas.frames[`tree_${tree.id}_${stage}`]?.frame.h).toBe(64);
    for (const item of decor)
      expect(atlas.frames[`decor_${item.id}`]?.frame.w).toBe(32);
    for (const d of ["up", "down", "left", "right"])
      for (let f = 0; f < 4; f++) {
        for (let body = 0; body < 2; body++)
          expect(atlas.frames[`body_${body}_${d}_${f}`]?.frame.h).toBe(24);
        for (let hair = 0; hair < 6; hair++)
          expect(atlas.frames[`hair_${hair}_${d}_${f}`]?.frame.h).toBe(24);
      }
    for (const name of [
      "tool_hand",
      "tool_seeds",
      "building_greenhouse",
      "child_stage0",
      "child_stage1",
      "child_stage2",
      "animal_horse_0",
    ])
      expect(atlas.frames[name]).toBeDefined();
  });
  it("generates Tiled maps with dimensions, collision and warps", () => {
    expect(maps.length).toBeGreaterThanOrEqual(25);
    for (const map of maps) {
      const data = JSON.parse(
        readFileSync(`public/assets/maps/${map.id}.json`, "utf8"),
      ) as {
        width: number;
        height: number;
        layers: {
          name: string;
          data?: number[];
          objects?: { name: string; id: number }[];
        }[];
      };
      expect(data.width).toBe(map.width);
      expect(data.layers[0]?.data?.length).toBe(map.width * map.height);
      expect(data.layers[1]?.data?.length).toBe(map.width * map.height);
      expect(data.layers.map((l) => l.name)).toEqual([
        "Ground",
        "GroundDetail",
        "Collision",
        "Objects",
        "AbovePlayer",
        "Lights",
        "Warps",
        "Spawns",
        "Triggers",
      ]);
      expect(data.layers[2]?.data?.length).toBe(map.width * map.height);
      expect(data.layers[7]?.objects?.some((o) => o.name === "player")).toBe(
        true,
      );
      const objectIDs = data.layers
        .flatMap((l) => l.objects ?? [])
        .map((o) => o.id);
      expect(new Set(objectIDs).size).toBe(objectIDs.length);
      expect(data.layers[6]?.objects?.map((o) => o.name)).toEqual(
        map.connections,
      );
    }
  });
  it("builds 47 visually distinct normalized neighbour blobs per material", () => {
    expect(blobMasks).toHaveLength(47);
    expect(normalizeBlobMask(16)).toBe(0);
    expect(normalizeBlobMask(19)).toBe(19);
    expect(normalizeBlobMask(255)).toBe(255);
    expect(blobMask(() => true, 0, 0)).toBe(255);
    expect(blobMask((x, y) => x === 0 && y === -1, 0, 0)).toBe(1);
    for (let raw = 0; raw < 256; raw++)
      expect(blobMasks).toContain(normalizeBlobMask(raw));
    for (const terrain of blobTerrains) {
      const rendered = new Set<string>();
      for (const mask of blobMasks) {
        const file = readFileSync(
            `public/assets/tiles/${blobFrame(terrain, mask)}.png`,
          ),
          png = PNG.sync.read(file);
        expect(png.width).toBe(16);
        expect(png.height).toBe(16);
        rendered.add(png.data.toString("hex"));
      }
      expect(rendered.size, terrain).toBe(47);
    }
    expect(blobFrame("water", 255, 5)).toBe("blob_water_255_1");
  });
  it("builds the original browser and 224-glyph Latin-1 bitmap fonts", () => {
    expect(existsSync("public/assets/willow-ink.ttf")).toBe(true);
    const font = readFileSync("public/assets/willow-ink.ttf");
    expect(font.readUInt32BE()).toBe(0x10000);
    const xml = readFileSync("public/assets/font.xml", "utf8");
    expect((xml.match(/<char id=/g) ?? []).length).toBe(224);
    expect(xml).toContain('id="255"');
  });
});
describe("Original five-channel soundtrack", () => {
  it("has 21 distinct full-length compositions and seven short jingles", () => {
    expect(songs).toHaveLength(21);
    expect(jingleSongs).toHaveLength(7);
    expect(
      new Set(songs.map((s) => JSON.stringify(s.patterns[0]?.channels.pulseA)))
        .size,
    ).toBe(21);
    for (const song of songs) {
      expect(song.duration).toBeGreaterThanOrEqual(60);
      expect(song.duration).toBeCloseTo((song.order.length * 240) / song.tempo);
      expect(song.patterns).toHaveLength(40);
      for (const index of song.order) {
        const p = song.patterns[index]!;
        expect(Object.keys(p.channels)).toHaveLength(5);
        for (const notes of Object.values(p.channels))
          for (const note of notes) {
            expect(note.pitch).toBeGreaterThan(0);
            expect(note.pitch).toBeLessThan(128);
            expect(note.step).toBeLessThan(16);
            expect(note.length).toBeGreaterThan(0);
          }
      }
    }
  });
  it("has over sixty synthesized, varied sound effects", () => {
    expect(effects.length).toBeGreaterThanOrEqual(60);
    expect(new Set(effects.map((e) => e.id)).size).toBe(effects.length);
    expect(
      new Set(effects.map((e) => `${e.frequency}/${e.end}/${e.duration}`)).size,
    ).toBe(effects.length);
    for (const e of effects) {
      expect(e.duration).toBeGreaterThan(0);
      expect(e.frequency).toBeGreaterThan(0);
      expect(e.volume).toBeLessThanOrEqual(1);
    }
  });
});
