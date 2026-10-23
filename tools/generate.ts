import { mkdirSync, writeFileSync } from "node:fs";
import { Pixel } from "./pixel";
import { palette, seasonSwaps } from "./palette";
import { generateFont, generateBoldFont, glyph } from "./font";
import { generateMaps } from "./maps";
import { generateTTF } from "./ttf";
import { crops, npcs, items, trees, decor } from "../src/data/catalog";
import { songs, jingleSongs } from "../src/audio/songs";
import { effects } from "../src/audio/sfx";
import { blobTerrains, blobMasks, blobFrame } from "./autotile";
const dir = "public/assets";
mkdirSync(dir, { recursive: true });
const sprites: { name: string; p: Pixel }[] = [];
function sprite(name: string, w: number, h: number, draw: (p: Pixel) => void) {
  const p = new Pixel(w, h);
  draw(p);
  sprites.push({ name, p });
}
function hash(x: number, y: number, s = 0) {
  let h =
    Math.imul(x + 13, 374761393) ^
    Math.imul(y + 29, 668265263) ^
    Math.imul(s + 7, 1274126177);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}
for (const [name, base] of Object.entries({
  grass: 20,
  path: 13,
  soil: 10,
  tilled: 9,
  watered: 8,
  sand: 14,
  stone: 43,
  wood: 11,
  snow: 30,
})) {
  for (let variant = 0; variant < 4; variant++)
    sprite(`tile_${name}${variant ? "_" + variant : ""}`, 16, 16, (p) => {
      p.rect(0, 0, 16, 16, base);
      for (let y = 0; y < 16; y++)
        for (let x = 0; x < 16; x++) {
          const v = hash(x, y, variant) % 100;
          if (v < 8) p.dot(x, y, Math.min(47, base + 1));
          if (v > 96) p.dot(x, y, Math.max(0, base - 1));
        }
      if (name === "grass") {
        for (let i = 0; i < 4; i++) {
          const x = hash(i, 2, variant) % 15,
            y = hash(i, 3, variant) % 15;
          p.dot(x, y, 19);
          p.dot(x + 1, y - 1, 21);
        }
      }
      if (name === "tilled" || name === "watered")
        for (let y = 3; y < 16; y += 4) {
          p.line(0, y, 15, y, base + 1);
          p.line(0, y + 1, 15, y + 1, base - 1);
        }
      if (name === "wood")
        for (let y = 0; y < 16; y += 5) p.line(0, y, 15, y, 9);
    });
}
for (let frame = 0; frame < 4; frame++)
  sprite(`tile_water_${frame}`, 16, 16, (p) => {
    p.rect(0, 0, 16, 16, 26);
    for (let i = 0; i < 5; i++) {
      const x = (i * 7 + frame * 2) % 16,
        y = (i * 5) % 16;
      p.line(x, y, Math.min(15, x + 4), y, 27);
      p.dot((x + 6) % 16, (y + 2) % 16, 25);
    }
    p.line((frame * 3) % 10, 10, ((frame * 3) % 10) + 4, 10, 28);
  });
for (let season = 0; season < 4; season++)
  sprite(`tree_${season}`, 48, 64, (p) => {
    p.oval(25, 60, 18, 3, 18);
    p.rect(20, 28, 9, 33, 8);
    p.rect(22, 28, 5, 32, 10);
    p.line(22, 46, 12, 35, 9);
    p.line(26, 40, 35, 25, 9);
    p.rect(23, 46, 2, 13, 12);
    const colors =
      season === 2
        ? [32, 33, 35, 36, 37]
        : season === 3
          ? [24, 42, 43, 44, 30]
          : season === 1
            ? [16, 17, 18, 19, 21]
            : [16, 18, 19, 20, 22];
    for (const [x, y, rx, ry] of [
      [24, 23, 22, 20],
      [13, 30, 12, 13],
      [35, 29, 11, 12],
      [23, 12, 14, 11],
    ]) {
      p.oval(x!, y!, rx!, ry!, colors[0]!);
      p.oval(x!, y! - 2, rx! - 1, ry! - 2, colors[1]!);
      p.oval(x! - 2, y! - 4, rx! - 3, ry! - 4, colors[2]!);
    }
    for (let i = 0; i < 45; i++) {
      const x = 5 + (hash(i, 2) % 37),
        y = 4 + (hash(i, 3) % 33);
      if (((x - 24) / 21) ** 2 + ((y - 23) / 21) ** 2 < 0.9) {
        p.line(x, y, x + 2, y, colors[3]!);
        if (i % 3 === 0) p.dot(x, y - 1, colors[4]!);
      }
    }
    if (season === 0)
      for (let i = 0; i < 7; i++) {
        const x = 9 + (hash(i, 4) % 29),
          y = 8 + (hash(i, 5) % 26);
        p.dot(x, y, 40);
        p.dot(x + 1, y, 41);
      }
  });
sprite("bush", 32, 24, (p) => {
  p.oval(16, 21, 15, 2, 18);
  for (const [x, y, r] of [
    [9, 14, 8],
    [21, 13, 10],
    [15, 8, 7],
  ]) {
    p.oval(x!, y!, r!, r!, 17);
    p.oval(x! - 1, y! - 2, r! - 2, r! - 2, 19);
    p.line(x! - 3, y! - 4, x!, y! - 4, 22);
  }
  p.dot(10, 16, 35);
  p.dot(23, 10, 35);
});
for (let f = 0; f < 8; f++)
  sprite(`flower_${f}`, 16, 16, (p) => {
    p.line(7, 6, 7, 15, 17);
    p.line(7, 12, 3, 10, 19);
    p.line(7, 13, 11, 10, 18);
    for (const [x, y] of [
      [5, 4],
      [8, 3],
      [10, 6],
      [7, 8],
      [4, 7],
    ])
      p.oval(x!, y!, 2, 2, [36, 40, 35, 47, 29, 6, 41, 37][f]!);
    p.rect(6, 5, 3, 3, 46);
    p.dot(6, 5, 15);
  });
sprite("rock", 16, 16, (p) => {
  p.oval(8, 12, 7, 3, 18);
  p.oval(8, 8, 6, 5, 1);
  p.oval(8, 7, 5, 4, 43);
  p.line(5, 5, 9, 4, 45);
  p.line(10, 7, 12, 9, 42);
});
sprite("stump", 16, 16, (p) => {
  p.rect(3, 5, 10, 9, 8);
  p.rect(5, 6, 6, 8, 10);
  p.oval(8, 5, 6, 3, 13);
  p.oval(8, 5, 3, 1, 10);
  p.dot(8, 5, 14);
});
sprite("fence", 16, 16, (p) => {
  p.rect(0, 6, 16, 3, 9);
  p.rect(0, 11, 16, 3, 9);
  p.rect(0, 6, 16, 1, 13);
  p.rect(0, 11, 16, 1, 13);
  p.rect(2, 3, 4, 13, 10);
  p.rect(3, 2, 2, 13, 14);
});
sprite("bridge", 48, 32, (p) => {
  p.rect(0, 2, 48, 28, 8);
  for (let x = 1; x < 48; x += 6) {
    p.rect(x, 3, 5, 26, 12);
    p.line(x, 3, x + 4, 3, 14);
    p.dot(x + 2, 7, 9);
    p.dot(x + 2, 24, 9);
  }
  p.rect(0, 0, 48, 3, 10);
  p.rect(0, 29, 48, 3, 10);
});
sprite("shipping", 32, 24, (p) => {
  p.rect(2, 5, 28, 17, 8);
  p.rect(3, 6, 26, 14, 11);
  for (let x = 4; x < 29; x += 6) p.line(x, 7, x, 19, 9);
  p.rect(1, 3, 30, 5, 13);
  p.line(2, 3, 29, 3, 15);
  p.rect(12, 9, 8, 6, 14);
  p.line(14, 12, 18, 12, 10);
});
for (const [name, roof, wall] of [
  ["house", 33, 14],
  ["barn", 25, 34],
  ["shop", 38, 13],
  ["clinic", 25, 30],
  ["inn", 32, 14],
] as const)
  sprite(`building_${name}`, 96, 80, (p) => {
    p.oval(49, 75, 45, 4, 18);
    p.rect(8, 34, 80, 41, 8);
    p.rect(10, 35, 76, 38, wall);
    for (let y = 40; y < 73; y += 6)
      p.line(11, y, 85, y, wall === 34 ? 33 : 12);
    p.rect(9, 69, 78, 6, 43);
    p.rect(14, 35, 5, 34, 10);
    p.rect(76, 35, 5, 34, 10);
    for (let y = 4; y < 37; y++) {
      const inset = Math.max(0, 29 - y);
      p.line(inset, y, 95 - inset, y, 8);
      p.line(inset + 2, y, 93 - inset, y, roof);
      if (y % 5 === 0) p.line(inset + 2, y, 93 - inset, y, roof + 1);
    }
    for (let y = 9; y < 35; y += 5)
      for (let x = 6 + (y % 10); x < 90; x += 11)
        p.line(x, y, x - 1, y + 3, roof - 1);
    p.rect(3, 35, 90, 4, 8);
    p.line(4, 35, 91, 35, 12);
    p.rect(39, 47, 18, 28, 8);
    p.rect(41, 49, 14, 24, 10);
    p.rect(43, 51, 10, 10, 27);
    p.line(48, 51, 48, 60, 13);
    p.dot(52, 65, 47);
    for (const x of [23, 63]) {
      p.rect(x, 46, 13, 14, 8);
      p.rect(x + 1, 47, 11, 11, 26);
      p.rect(x + 2, 48, 4, 4, 29);
      p.line(x + 6, 47, x + 6, 58, 14);
      p.line(x + 1, 52, x + 11, 52, 14);
      p.rect(x - 1, 60, 15, 3, 10);
      p.rect(x - 1, 59, 15, 2, 19);
      for (let n = 0; n < 4; n++) p.dot(x + n * 3, 58, n % 2 ? 40 : 36);
    }
    p.rect(68, 3, 10, 15, 8);
    p.rect(70, 4, 6, 13, 43);
    p.rect(67, 2, 12, 3, 44);
    p.rect(37, 74, 22, 3, 44);
  });
sprite("bed", 32, 40, (p) => {
  p.rect(2, 2, 28, 37, 8);
  p.rect(4, 4, 24, 33, 13);
  p.rect(5, 8, 22, 28, 38);
  p.rect(6, 9, 20, 25, 39);
  p.rect(7, 7, 18, 8, 30);
  p.line(7, 16, 24, 16, 41);
  p.rect(3, 32, 26, 4, 11);
  p.rect(3, 36, 4, 4, 9);
  p.rect(25, 36, 4, 4, 9);
});
for (const n of ["desk", "table"])
  sprite(n, 32, 24, (p) => {
    p.rect(4, 8, 4, 16, 8);
    p.rect(24, 8, 4, 16, 8);
    p.rect(1, 3, 30, 13, 8);
    p.rect(2, 2, 28, 11, 12);
    p.line(3, 3, 28, 3, 14);
    if (n === "desk") {
      p.rect(5, 4, 10, 7, 30);
      p.line(7, 6, 12, 6, 43);
      p.line(7, 8, 12, 8, 43);
      p.rect(23, 2, 4, 7, 38);
      p.rect(24, 0, 2, 4, 47);
    }
  });
function character(p: Pixel, idx: number, dir: string, f: number) {
  const skin = [14, 12, 11, 6, 13, 36][idx % 6]!,
    hair = [8, 9, 10, 1, 42, 33][idx % 6]!,
    shirt = [25, 38, 33, 17, 35, 39, 24, 46][idx % 8]!,
    bob = f % 2;
  const foot = f === 1 ? 1 : f === 3 ? -1 : 0;
  p.rect(4, 21, 3, 2, 8);
  p.rect(9, 21, 3, 2, 8);
  p.rect(5, 17, 3, 5 + foot, 24);
  p.rect(9, 17, 3, 5 - foot, 24);
  p.rect(4, 11 + bob, 9, 8, 0);
  p.rect(5, 12 + bob, 7, 6, shirt);
  p.line(5, 12 + bob, 10, 12 + bob, shirt + 1);
  p.rect(2, 12 + bob, 2, 5, skin);
  p.rect(13, 12 + bob, 2, 5, skin);
  p.oval(8, 6 + bob, 6, 6, 0);
  p.oval(8, 6 + bob, 5, 5, skin);
  p.oval(8, 3 + bob, 5, 3, hair);
  p.rect(3, 4 + bob, 2, 4, hair);
  if (idx % 3 === 0) p.rect(12, 4 + bob, 2, 7, hair);
  if (dir === "up") {
    p.oval(8, 6 + bob, 5, 5, hair);
    p.line(5, 3 + bob, 9, 2 + bob, hair + 1);
  } else {
    const eye = dir === "left" ? 4 : dir === "right" ? 10 : 5;
    p.dot(eye, 7 + bob, 0);
    if (dir === "down") p.dot(10, 7 + bob, 0);
    p.dot(7, 10 + bob, skin - 1);
    p.dot(4, 8 + bob, 7);
  }
  if (idx === 0) {
    p.rect(2, 2 + bob, 12, 3, 12);
    p.rect(4, 0 + bob, 8, 3, 14);
    p.line(2, 4 + bob, 14, 4 + bob, 10);
  }
}
const dirs = ["down", "left", "right", "up"];
for (const [idx, id] of ["player", ...npcs.map((n) => `npc_${n.id}`)].entries())
  for (const d of dirs)
    for (let f = 0; f < 4; f++)
      sprite(`${id}_${d}_${f}`, 16, 24, (p) => character(p, idx, d, f));
const tools = [
  "hoe",
  "can",
  "sickle",
  "axe",
  "hammer",
  "rod",
  "milker",
  "brush",
  "shears",
  "seed",
];
function drawTool(p: Pixel, name: string, x: number, y: number, angle = 0) {
  const dx = Math.round(Math.sin(angle) * 9),
    dy = Math.round(Math.cos(angle) * 9);
  p.line(x, y, x + dx, y - dy, 8);
  p.line(x + 1, y, x + dx + 1, y - dy, 12);
  const tx = x + dx,
    ty = y - dy;
  if (name === "can") {
    p.rect(tx - 3, ty - 1, 7, 7, 24);
    p.rect(tx - 2, ty, 5, 5, 27);
    p.line(tx + 3, ty + 2, tx + 7, ty - 1, 26);
    p.line(tx - 3, ty, tx - 5, ty + 3, 25);
    p.dot(tx - 1, ty + 1, 29);
  } else if (name === "seed") {
    p.rect(tx - 3, ty, 7, 8, 14);
    p.rect(tx - 2, ty + 1, 5, 2, 18);
    p.dot(tx, ty + 5, 20);
  } else if (name === "rod") {
    p.line(tx, ty, tx + 3, ty - 5, 11);
    p.line(tx + 3, ty - 5, tx + 8, ty + 4, 30);
    p.dot(tx + 8, ty + 4, 34);
  } else if (name === "brush") {
    p.rect(tx - 3, ty - 2, 7, 4, 10);
    for (let a = -2; a < 4; a += 2) p.line(tx + a, ty + 2, tx + a, ty + 4, 14);
  } else if (name === "sickle" || name === "shears") {
    p.line(tx - 1, ty + 1, tx + 4, ty - 3, 43);
    p.line(tx + 4, ty - 3, tx + 6, ty, 30);
    p.dot(tx + 5, ty + 1, 44);
    if (name === "shears") p.line(tx + 1, ty + 2, tx - 3, ty - 3, 30);
  } else {
    p.rect(
      tx - 4,
      ty - 2,
      name === "milker" ? 6 : 9,
      name === "hammer" ? 6 : 4,
      42,
    );
    p.rect(tx - 3, ty - 2, name === "milker" ? 4 : 7, 2, 45);
    if (name === "axe") p.line(tx + 4, ty - 2, tx + 4, ty + 3, 30);
  }
}
for (const name of tools) {
  sprite(`tool_${name}`, 16, 16, (p) => drawTool(p, name, 6, 14, -0.2));
  for (const d of dirs)
    for (let f = 0; f < 4; f++)
      sprite(`player_${name}_${d}_${f}`, 32, 32, (p) => {
        const person = new Pixel(16, 24);
        character(person, 0, d, f);
        p.paste(person, 8, 7);
        drawTool(p, name, 20, 21, (f - 1.5) * 0.6);
        if (name === "can" && f > 1)
          for (let j = 0; j < 5; j++) p.dot(24 + j, 24 + (j % 3) * 2, 28);
      });
}
sprite("tool_hand", 16, 16, (p) => {
  p.rect(5, 6, 8, 7, 8);
  p.rect(6, 6, 6, 6, 14);
  p.rect(5, 12, 7, 3, 25);
  for (let i = 0; i < 4; i++) {
    p.rect(5 + i * 2, 1 + (i === 0 || i === 3 ? 2 : 0), 2, 7, 8);
    p.rect(6 + i * 2, 2 + (i === 0 || i === 3 ? 2 : 0), 1, 6, 14);
  }
  p.line(4, 10, 2, 6, 8);
  p.line(5, 10, 3, 6, 14);
  p.dot(7, 8, 15);
});
sprite("tool_seeds", 16, 16, (p) => drawTool(p, "seed", 8, 15, 0));
for (const d of dirs) {
  for (let f = 0; f < 2; f++)
    sprite(`player_idle_${d}_${f}`, 16, 24, (p) => character(p, 0, d, f * 2));
  for (let f = 0; f < 4; f++)
    sprite(`player_carry_${d}_${f}`, 16, 24, (p) => {
      character(p, 0, d, f);
      p.rect(1, 8, 2, 5, 14);
      p.rect(13, 8, 2, 5, 14);
      p.rect(4, 0, 8, 4, 12);
      p.line(4, 0, 11, 0, 14);
    });
}
for (const action of ["eat", "sleep", "faint", "celebrate", "fish_reel"])
  for (let f = 0; f < 6; f++)
    sprite(`player_${action}_${f}`, 16, 24, (p) => {
      character(p, 0, "down", f % 4);
      if (action === "eat") {
        p.oval(8, 12, 3, 2, 35);
        p.rect(4, 11, 3, 2, 14);
      }
      if (action === "sleep" || action === "faint") {
        p.line(5, 7, 6, 7, 10);
        p.line(10, 7, 11, 7, 10);
        p.rect(3, 15, 11, 8, 39);
      }
      if (action === "celebrate") {
        p.rect(1, 7 - (f % 2), 2, 6, 14);
        p.rect(13, 7 - (f % 2), 2, 6, 14);
        p.dot(1, 4, 47);
        p.dot(14, 3, 47);
      }
      if (action === "fish_reel") drawTool(p, "rod", 11, 18, 0.4 + f * 0.1);
    });
for (const [idx, npc] of npcs.entries())
  for (const [exp, expression] of [
    "neutral",
    "happy",
    "sad",
    "angry",
    "surprised",
    "blush",
  ].entries())
    sprite(`portrait_${npc.id}_${expression}`, 48, 48, (p) => {
      const skin = [14, 12, 11, 6, 13, 36][(idx + 1) % 6]!,
        hair = [8, 9, 10, 1, 42, 33][(idx + 1) % 6]!,
        shirt = [25, 38, 33, 17, 35, 39, 24, 46][(idx + 1) % 8]!;
      p.rect(0, 0, 48, 48, 15);
      p.rect(2, 2, 44, 44, 41);
      p.oval(24, 47, 20, 15, 0);
      p.oval(24, 47, 18, 14, shirt);
      p.rect(20, 29, 8, 10, skin);
      p.oval(24, 20, 15, 18, 0);
      p.oval(24, 20, 14, 17, hair);
      p.oval(24, 22, 11, 13, skin);
      p.oval(23, 10, 13, 8, hair);
      p.oval(15, 17, 4, 9, hair);
      if (idx % 3 === 0) p.rect(33, 14, 5, 22, hair);
      p.line(14, 10, 21, 6, hair + 1);
      for (const x of [19, 29]) {
        if (exp === 1) p.line(x - 1, 22, x + 1, 21, 0);
        else {
          p.rect(x, 21, 2, exp === 4 ? 4 : 2, 0);
          p.dot(x, 21, 30);
        }
        if (exp === 3) p.line(x - 2, 17, x + 1, 19, 0);
        if (exp === 2) p.line(x - 2, 19, x + 1, 17, 0);
      }
      p.line(22, 29, 26, exp === 2 ? 28 : 29, 32);
      if (exp === 1) p.line(22, 30, 25, 31, 32);
      if (exp === 4) p.oval(24, 29, 2, 3, 32);
      if (exp === 5) {
        p.line(16, 26, 20, 26, 35);
        p.line(29, 26, 33, 26, 35);
      }
      p.dot(24, 25, skin - 1);
      p.line(17, 41, 21, 37, shirt + 1);
    });
for (const [i, crop] of crops.entries())
  for (let stage = 0; stage < 7; stage++)
    sprite(`crop_${crop.id}_${stage}`, 16, 32, (p) => {
      const green = stage === 6 ? 10 : 18;
      const h = stage === 6 ? 14 : 4 + stage * 3;
      p.oval(8, 29, 6, 2, 9);
      p.line(8, 29, 8, 29 - h, green);
      for (let j = 0; j < stage + 1; j++) {
        const y = 27 - j * 3;
        p.oval(5, y, 3, 2, green + 1);
        p.oval(11, y - 2, 3, 2, green + 2);
      }
      if (stage >= 4 && stage < 6) {
        const c = [35, 40, 46, 37, 6, 29][i % 6]!;
        if (i % 3 === 0) {
          p.oval(8, 23, 5, 5, c - 1);
          p.oval(7, 22, 4, 4, c);
          p.dot(6, 20, 15);
        } else
          for (let j = 0; j < 3; j++) {
            p.oval(4 + j * 4, 26 - j * 4, 2, 3, c);
            p.dot(4 + j * 4, 25 - j * 4, c + 1);
          }
      }
    });
for (const [i, item] of items.entries())
  sprite(`item_${item.id}`, 16, 16, (p) => {
    if (item.category === "seed") {
      p.rect(3, 1, 10, 14, 8);
      p.rect(4, 2, 8, 12, 14);
      p.rect(4, 3, 8, 3, 18);
      p.oval(8, 10, 3, 3, 19);
      p.dot(7, 9, 22);
    } else {
      const c = [35, 40, 46, 26, 13, 6, 43, 37][i % 8]!;
      p.oval(8, 9, 6, 6, 8);
      p.oval(8, 8, 5, 5, c);
      p.oval(6, 6, 2, 2, Math.min(47, c + 1));
      p.line(8, 3, 10, 1, 17);
      p.dot(11, 1, 20);
    }
  });
for (const [k, kind] of [
  "chicken",
  "cow",
  "sheep",
  "dog",
  "cat",
  "chick",
  "calf",
  "lamb",
].entries())
  for (let f = 0; f < 4; f++)
    sprite(`animal_${kind}_${f}`, 32, 24, (p) => {
      const c = k === 3 ? 12 : k === 4 ? 43 : 30;
      p.oval(16, 21, 13, 2, 18);
      for (const x of [7, 12, 21, 25]) p.rect(x, 16, 2, 5 + (f % 2), 8);
      p.oval(15, 13, 12, k === 0 ? 6 : 8, 8);
      p.oval(15, 12, 11, k === 0 ? 5 : 7, c);
      p.oval(25, 10, 6, 7, 8);
      p.oval(25, 9, 5, 6, c);
      p.dot(27, 8, 0);
      p.dot(27, 7, 31);
      p.oval(29, 13, 3, 2, k === 0 ? 46 : 6);
      p.line(3, 11, 1, 7, c);
      if (k === 1) {
        p.oval(9, 10, 3, 4, 42);
        p.oval(18, 14, 3, 3, 42);
        p.line(23, 3, 22, 1, 13);
        p.line(28, 3, 29, 1, 13);
      }
      if (k === 0) {
        p.rect(24, 2, 4, 3, 34);
        p.line(7, 11, 14, 13, 44);
      }
      if (k === 2)
        for (let i = 0; i < 7; i++) p.oval(6 + i * 3, 7 + (i % 2), 3, 3, 31);
      if (k === 3 || k === 4) {
        p.line(22, 6, 21, 1, c);
        p.line(27, 5, 29, 1, c);
      }
    });
// Directional livestock frames preserve each animal's markings when mirrored.
for (const kind of [
  "chicken",
  "cow",
  "sheep",
  "dog",
  "cat",
  "chick",
  "calf",
  "lamb",
]) {
  for (const direction of dirs)
    for (let frame = 0; frame < 4; frame++)
      sprite(`animal_${kind}_${direction}_${frame}`, 32, 24, (p) => {
        const original = sprites.find(
          (s) => s.name === `animal_${kind}_${frame}`,
        )!.p;
        for (let yy = 0; yy < 24; yy++)
          for (let xx = 0; xx < 32; xx++) {
            const source = (yy * 32 + xx) * 4;
            if (original.png.data[source + 3] === 0) continue;
            const target =
              (yy * 32 + (direction === "left" ? 31 - xx : xx)) * 4;
            for (let k = 0; k < 4; k++)
              p.png.data[target + k] = original.png.data[source + k]!;
          }
        if (direction === "up") {
          p.oval(25, 8, 4, 5, kind === "dog" ? 12 : kind === "cat" ? 43 : 30);
          p.dot(24, 3, kind === "cow" ? 13 : 44);
        }
        if (direction === "down") p.dot(24, 8, 0);
      });
  for (const action of ["eat", "sleep", "happy"])
    for (let frame = 0; frame < 4; frame++)
      sprite(`animal_${kind}_${action}_${frame}`, 32, 24, (p) => {
        p.paste(
          sprites.find((s) => s.name === `animal_${kind}_${frame}`)!.p,
          0,
          0,
        );
        if (action === "eat") {
          p.line(26, 18, 30, 16, 18);
          p.dot(28, 17, 21);
        }
        if (action === "sleep") {
          p.line(26, 8, 28, 8, 42);
          p.dot(28, 6, 30);
        }
        if (action === "happy") {
          p.dot(18, 0, 35);
          p.dot(20, 0, 35);
          p.dot(19, 1, 35);
        }
      });
}
// Character layers deliberately reserve exact inks for appearance recoloring.
for (let body = 0; body < 2; body++)
  for (const direction of dirs)
    for (let frame = 0; frame < 4; frame++)
      sprite(`body_${body}_${direction}_${frame}`, 16, 24, (p) => {
        const bob = frame % 2,
          width = body ? 10 : 8,
          left = body ? 3 : 4,
          step = frame === 1 ? 1 : frame === 3 ? -1 : 0;
        p.rect(4, 21 + step, 4, 2, 0);
        p.rect(9, 21 - step, 4, 2, 0);
        p.rect(5, 17, 3, 5 + step, 24);
        p.rect(9, 17, 3, 5 - step, 24);
        p.rect(left, 11 + bob, width, 8, 0);
        p.rect(left + 1, 12 + bob, width - 2, 6, 25);
        p.line(left + 1, 12 + bob, left + width - 3, 12 + bob, 26);
        p.dot(left + 1, 13 + bob, 27);
        p.rect(left - 1, 12 + bob, 2, 5, 13);
        p.rect(left - 1, 12 + bob, 1, 4, 14);
        p.rect(left + width, 12 + bob, 2, 5, 13);
        p.rect(left + width, 12 + bob, 1, 4, 14);
        p.oval(8, 6 + bob, 6, 6, 0);
        p.oval(8, 6 + bob, 5, 5, 13);
        p.oval(7, 5 + bob, 4, 4, 14);
        p.dot(5, 4 + bob, 15);
        if (direction !== "up") {
          const eye = direction === "left" ? 4 : direction === "right" ? 10 : 5;
          p.dot(eye, 7 + bob, 0);
          if (direction === "down") p.dot(10, 7 + bob, 0);
          p.dot(8, 10 + bob, 13);
        }
      });
for (let style = 0; style < 6; style++)
  for (const direction of dirs)
    for (let frame = 0; frame < 4; frame++)
      sprite(`hair_${style}_${direction}_${frame}`, 16, 24, (p) => {
        const bob = frame % 2;
        if (style === 0) {
          p.oval(8, 3 + bob, 6, 3, 8);
          p.oval(7, 2 + bob, 4, 2, 9);
          p.rect(3, 4 + bob, 2, 3, 8);
          p.line(4, 4 + bob, 8, 4 + bob, 9);
          p.dot(5, 1 + bob, 10);
        }
        if (style === 1) {
          p.oval(8, 4 + bob, 6, 4, 8);
          p.oval(7, 3 + bob, 5, 3, 9);
          p.rect(2, 4 + bob, 3, 8, 8);
          p.rect(12, 4 + bob, 3, 8, 8);
          p.line(3, 4 + bob, 3, 10 + bob, 9);
          p.line(5, 1 + bob, 10, 1 + bob, 10);
        }
        if (style === 2) {
          for (const [x, y] of [
            [4, 3],
            [7, 2],
            [10, 2],
            [12, 4],
            [3, 6],
            [13, 7],
          ]) {
            p.oval(x!, y! + bob, 3, 3, 8);
            p.oval(x! - 1, y! - 1 + bob, 2, 2, 9);
            p.dot(x! - 1, y! - 2 + bob, 10);
          }
        }
        if (style === 3) {
          p.oval(8, 3 + bob, 6, 3, 8);
          p.oval(7, 2 + bob, 5, 2, 9);
          p.rect(3, 4 + bob, 2, 3, 8);
          p.oval(direction === "left" ? 12 : 3, 10 + bob, 3, 5, 8);
          p.line(
            direction === "left" ? 12 : 3,
            8 + bob,
            direction === "left" ? 12 : 3,
            12 + bob,
            9,
          );
          p.line(5, 1 + bob, 9, 1 + bob, 10);
        }
        if (style === 4) {
          p.oval(8, 3 + bob, 6, 3, 8);
          p.oval(8, 0 + bob, 3, 2, 8);
          p.oval(7, 0 + bob, 2, 1, 9);
          p.line(4, 3 + bob, 11, 3 + bob, 9);
          p.dot(6, 2 + bob, 10);
          p.rect(3, 4 + bob, 2, 3, 8);
        }
        if (style === 5) {
          p.oval(8, 3 + bob, 6, 3, 8);
          p.oval(7, 2 + bob, 4, 2, 9);
          p.rect(2, 4 + bob, 3, 11, 8);
          p.rect(12, 4 + bob, 3, 11, 8);
          p.line(3, 5 + bob, 3, 13 + bob, 9);
          p.line(13, 5 + bob, 13, 13 + bob, 9);
          p.line(5, 1 + bob, 9, 1 + bob, 10);
        }
        if (direction === "up") {
          p.oval(8, 6 + bob, 5, 5, 8);
          p.oval(7, 5 + bob, 4, 4, 9);
          p.line(5, 3 + bob, 8, 2 + bob, 10);
        }
      });
for (let stage = 0; stage < 3; stage++)
  sprite(`child_stage${stage}`, 16, 24, (p) => {
    if (stage === 0) {
      p.oval(8, 16, 6, 7, 38);
      p.oval(8, 15, 5, 6, 41);
      p.oval(8, 11, 4, 4, 14);
      p.dot(6, 11, 0);
      p.dot(10, 11, 0);
      p.line(5, 17, 11, 19, 39);
    } else {
      p.rect(4, 19, 3, 3, 24);
      p.rect(9, 19, 3, 3, 24);
      p.rect(4, 12, 8, 8, stage === 1 ? 38 : 17);
      p.rect(3, 13, 2, 4, 14);
      p.rect(12, 13, 2, 4, 14);
      p.oval(8, 8, 5, 5, 8);
      p.oval(8, 9, 4, 4, 14);
      p.oval(8, 5, 4, 2, 10);
      p.dot(6, 9, 0);
      p.dot(10, 9, 0);
      p.dot(8, 11, 13);
      if (stage === 2) {
        p.rect(5, 16, 6, 4, 19);
        p.line(6, 5, 8, 4, 12);
      }
    }
  });
for (let level = 1; level <= 3; level++)
  sprite(`building_house_${level}`, 128, 96, (p) => {
    p.paste(sprites.find((s) => s.name === "building_house")!.p, 16, 16);
    p.rect(3, 47, 24, 44, 8);
    p.rect(5, 48, 20, 40, 14);
    p.rect(4, 87, 23, 5, 43);
    for (let y = 50; y < 88; y += 6) p.line(5, y, 24, y, 12);
    for (let y = 31; y < 50; y++) {
      const inset = Math.max(0, 44 - y);
      p.line(inset, y, 32 - inset, y, 33);
      if (y % 5 === 0) p.line(inset, y, 32 - inset, y, 34);
    }
    p.line(1, 49, 32, 49, 8);
    p.rect(10, 61, 11, 14, 8);
    p.rect(11, 62, 9, 11, 27);
    p.line(15, 62, 15, 72, 14);
    p.line(11, 67, 19, 67, 14);
    if (level >= 2) {
      p.rect(100, 48, 24, 42, 8);
      p.rect(102, 49, 20, 38, 14);
      for (let y = 50; y < 86; y += 6) p.line(102, y, 120, y, 12);
      p.rect(105, 61, 13, 14, 8);
      p.rect(106, 62, 11, 11, 27);
      p.line(111, 62, 111, 72, 14);
      for (let y = 31; y < 50; y++) {
        const inset = Math.max(0, 44 - y);
        p.line(95 + inset, y, 127 - inset, y, 33);
        if (y % 5 === 0) p.line(95 + inset, y, 127 - inset, y, 34);
      }
      p.line(96, 49, 127, 49, 8);
    }
    if (level >= 3) {
      p.rect(55, 25, 20, 22, 8);
      p.rect(57, 27, 16, 18, 14);
      p.rect(60, 30, 10, 12, 27);
      p.line(65, 30, 65, 41, 14);
      for (let y = 14; y < 28; y++)
        p.line(65 - (y - 14), y, 65 + (y - 14), y, y % 4 ? 33 : 34);
      p.line(52, 28, 78, 28, 8);
      p.rect(43, 90, 40, 4, 44);
    }
  });
sprite("building_greenhouse", 96, 80, (p) => {
  p.oval(48, 76, 45, 3, 18);
  p.rect(5, 31, 86, 44, 8);
  p.rect(7, 32, 82, 41, 26);
  for (let y = 6; y < 33; y++) {
    const inset = 30 - y;
    p.line(Math.max(3, inset), y, 95 - Math.max(3, inset), y, 24);
    p.line(Math.max(5, inset + 2), y, 93 - Math.max(5, inset + 2), y, 28);
  }
  for (let x = 10; x < 90; x += 16) {
    p.line(x, 33, x, 72, 44);
    p.line(x, 32, 48 + (x - 48) * 0.5, 6, 45);
    p.line(x + 3, 36, x + 10, 43, 29);
  }
  p.line(5, 32, 90, 32, 45);
  p.line(6, 51, 90, 51, 44);
  p.rect(39, 45, 19, 30, 8);
  p.rect(41, 47, 15, 26, 27);
  p.line(48, 47, 48, 72, 44);
  p.dot(52, 61, 47);
  for (let x = 12; x < 36; x += 9) {
    p.rect(x, 65, 6, 6, 10);
    p.oval(x + 3, 62, 4, 5, 19);
    p.dot(x + 2, 59, 22);
  }
  for (let x = 64; x < 87; x += 9) {
    p.rect(x, 65, 6, 6, 10);
    p.oval(x + 3, 62, 4, 5, 19);
    p.dot(x + 2, 59, 40);
  }
  p.rect(4, 73, 88, 3, 43);
});
for (const [idx, tree] of trees.entries())
  for (const stage of ["sapling", "mature", "fruit"])
    sprite(`tree_${tree.id}_${stage}`, 48, 64, (p) => {
      if (stage === "sapling") {
        p.oval(24, 61, 9, 2, 18);
        p.rect(23, 40, 3, 22, 10);
        p.line(24, 49, 17, 44, 10);
        p.oval(18, 42, 6, 4, 19);
        p.oval(26, 36, 7, 5, 20);
        p.line(21, 34, 26, 33, 22);
      } else {
        p.paste(sprites.find((s) => s.name === "tree_0")!.p, 0, 0);
        if (stage === "fruit")
          for (let j = 0; j < 8; j++) {
            const x = 9 + (hash(j, idx) % 30),
              y = 15 + (hash(j, idx + 30) % 22),
              c = [35, 33, 6, 36, 47][idx]!;
            p.oval(x, y, 2, 3, c);
            p.dot(x - 1, y - 1, c === 47 ? 15 : c + 1);
            p.line(x, y - 3, x + 1, y - 4, 17);
          }
      }
    });
for (let frame = 0; frame < 4; frame++)
  sprite(`animal_horse_${frame}`, 40, 32, (p) => {
    p.oval(20, 29, 18, 2, 18);
    for (const x of [9, 14, 26, 31]) {
      p.rect(x, 18, 3, 11 + (frame % 2), 8);
      p.rect(x + 1, 18, 1, 8, 11);
    }
    p.oval(20, 16, 14, 8, 8);
    p.oval(20, 15, 13, 7, 11);
    p.line(11, 10, 24, 10, 12);
    p.rect(28, 5, 6, 13, 10);
    p.oval(32, 6, 6, 5, 8);
    p.oval(33, 6, 5, 4, 11);
    p.rect(30, 0, 2, 4, 10);
    p.rect(34, 0, 2, 4, 10);
    p.dot(35, 5, 0);
    p.oval(36, 9, 3, 2, 13);
    p.rect(27, 4, 3, 13, 9);
    p.line(6, 14, 2, 25, 9);
    p.rect(15, 10, 10, 4, 25);
    p.line(17, 14, 17, 21, 25);
  });
for (const [index, item] of decor.entries())
  sprite(`decor_${item.id}`, 32, 32, (p) => {
    const id = item.id,
      c = [38, 25, 33, 17, 35, 43][index % 6]!;
    if (/rug/.test(id)) {
      p.oval(16, 24, 15, 6, 8);
      p.oval(16, 23, 14, 5, c);
      p.oval(16, 23, 10, 3, c + 1);
      p.line(7, 23, 25, 23, 14);
    } else if (/chair|stool|bench|sofa/.test(id)) {
      p.rect(5, 22, 3, 8, 8);
      p.rect(24, 22, 3, 8, 8);
      p.rect(3, 8, 26, 17, 8);
      p.rect(5, 9, 22, 13, /stone/.test(id) ? 43 : c);
      p.rect(3, 21, 26, 5, 10);
      p.line(5, 21, 27, 21, 14);
      if (/sofa|armchair/.test(id)) {
        p.rect(2, 17, 5, 9, c + 1);
        p.rect(25, 17, 5, 9, c + 1);
      } else {
        p.rect(7, 11, 2, 9, 13);
        p.rect(23, 11, 2, 9, 13);
      }
    } else if (/bedframe/.test(id)) {
      p.rect(3, 3, 26, 27, 9);
      p.rect(5, 5, 22, 23, 39);
      p.rect(6, 6, 20, 7, 30);
      p.rect(5, 26, 22, 3, 46);
      p.rect(3, 1, 3, 31, 46);
      p.rect(26, 1, 3, 31, 46);
    } else if (/table|desk/.test(id)) {
      p.paste(sprites.find((s) => s.name === "desk")!.p, 0, 8);
    } else if (/lamp|lantern|chime|mobile|wind_ward/.test(id)) {
      p.rect(15, 7, 2, 23, 9);
      p.rect(10, 29, 12, 2, 8);
      p.line(8, 7, 24, 7, 13);
      for (const x of /mobile|chime/.test(id) ? [9, 16, 23] : [16]) {
        p.line(x, 7, x, 12, 10);
        p.rect(x - 3, 12, 7, 10, 8);
        p.rect(x - 2, 13, 5, 7, 46);
        p.line(x - 1, 14, x - 1, 17, 47);
      }
    } else if (/vase|teapot|crockery|jar|pot/.test(id)) {
      p.oval(16, 24, 11, 6, 8);
      p.oval(16, 21, 9, 8, c);
      p.rect(12, 12, 8, 5, c);
      p.oval(16, 12, 5, 2, c + 1);
      p.line(12, 18, 20, 18, 30);
      p.line(12, 24, 20, 24, c + 1);
      if (/teapot/.test(id)) p.line(22, 19, 30, 13, c);
    } else if (/herb|flower|birdbath|bee_house/.test(id)) {
      p.rect(3, 18, 26, 10, 9);
      p.rect(4, 19, 24, 7, 12);
      for (let x = 7; x < 29; x += 8) {
        p.line(x, 18, x, 10, 18);
        p.oval(x, 9, 4, 4, 19);
        p.dot(x - 1, 7, index % 2 ? 40 : 47);
      }
      if (/birdbath/.test(id)) {
        p.rect(14, 18, 4, 12, 43);
        p.oval(16, 17, 14, 4, 44);
        p.oval(16, 16, 11, 2, 27);
      }
    } else if (/arch/.test(id)) {
      p.rect(4, 8, 4, 23, 10);
      p.rect(24, 8, 4, 23, 10);
      p.oval(16, 9, 13, 8, 10);
      p.oval(16, 10, 9, 6, 18);
      p.rect(8, 12, 16, 20, 20);
      for (let x = 5; x < 30; x += 6) {
        p.oval(x, 7, 4, 3, 19);
        p.dot(x, 6, 40);
      }
    } else if (/duck|kite/.test(id)) {
      p.oval(16, 22, 12, 6, 12);
      p.oval(23, 14, 5, 6, 13);
      p.dot(25, 13, 0);
      p.line(27, 16, 31, 16, 46);
      p.line(4, 20, 1, 15, 12);
    } else if (/clock|mirror/.test(id)) {
      p.oval(16, 15, 12, 14, 8);
      p.oval(16, 15, 10, 12, /mirror/.test(id) ? 28 : 14);
      p.oval(16, 15, 8, 10, /mirror/.test(id) ? 29 : 15);
      if (/clock/.test(id)) {
        p.line(16, 15, 16, 8, 8);
        p.line(16, 15, 21, 18, 8);
      } else p.line(11, 8, 19, 17, 30);
    } else if (/cushion/.test(id)) {
      p.oval(16, 22, 13, 8, 8);
      p.oval(16, 21, 12, 7, c);
      p.line(16, 17, 16, 25, 47);
      p.line(12, 21, 20, 21, 47);
    } else if (/banner|screen|rack/.test(id)) {
      p.rect(3, 2, 2, 29, 9);
      p.rect(27, 2, 2, 29, 9);
      p.rect(4, 4, 24, 3, 12);
      p.rect(6, 7, 20, 19, c);
      for (let x = 7; x < 26; x += 5) p.line(x, 8, x, 24, c + 1);
      p.oval(16, 15, 4, 4, 46);
    } else {
      p.rect(3, 7, 26, 23, 8);
      p.rect(5, 8, 22, 20, /furnace/.test(id) ? 43 : 11);
      p.line(5, 9, 26, 9, 14);
      p.line(5, 20, 26, 20, 9);
      if (/shelf|cabinet|basket/.test(id)) {
        for (let x = 7; x < 26; x += 4) {
          p.rect(x, 12, 3, 7, [25, 38, 33, 46][x % 4]!);
          p.dot(x, 13, 14);
        }
      } else {
        p.oval(16, 18, 6, 6, /furnace/.test(id) ? 35 : 43);
        p.oval(16, 18, 4, 4, /furnace/.test(id) ? 47 : 44);
        p.dot(23, 26, 46);
      }
    }
  });

// Spacious original painted-in-pixels vista. Foreground and cloud layers are also exported.
const vista = new Pixel(320, 240);
for (let y = 0; y < 240; y++)
  vista.rect(
    0,
    y,
    320,
    1,
    y < 35 ? 26 : y < 72 ? 27 : y < 111 ? 28 : y < 145 ? 29 : y < 165 ? 21 : 20,
  );
// Soft cloud banks and separated silhouettes give the tiny vista real depth.
for (const [x, y, s] of [
  [25, 47, 1],
  [110, 30, 1],
  [245, 54, 1],
  [300, 24, 1],
]) {
  vista.oval(x!, y!, 23 * s!, 5, 29);
  vista.oval(x! - 6, y! - 4, 12, 7, 30);
  vista.oval(x! + 8, y! - 2, 15, 6, 30);
  vista.line(x! - 17, y! + 3, x! + 22, y! + 3, 28);
}
vista.oval(273, 86, 12, 12, 15);
for (let x = 0; x < 320; x++) {
  const y = 110 + Math.round(Math.sin(x / 43) * 10 + Math.sin(x / 21) * 5);
  vista.line(x, y, x, 145, 43);
  const hill = 129 + Math.round(Math.sin(x / 37 + 2) * 9);
  vista.line(x, hill, x, 161, 19);
  const near = 149 + Math.round(Math.sin(x / 56) * 8);
  vista.line(x, near, x, 239, 20);
}
for (let i = 0; i < 85; i++) {
  const x = i * 4,
    y = 139 + Math.round(Math.sin(x / 37 + 2) * 9);
  vista.line(x, y - 6, x, y + 6, 18);
  vista.oval(x, y - 3, 3, 6, 18);
  vista.dot(x - 1, y - 5, 21);
}
// The brook winds from a distant valley to the lower right of the farm.
for (let y = 143; y < 240; y++) {
  const x = 239 + Math.sin((y - 143) / 32) * 22 + (y - 143) * 0.32,
    w = 6 + (y - 143) * 0.2;
  vista.rect(x - 2, y, w + 4, 1, 22);
  vista.rect(x, y, w, 1, 26);
  if (y % 5 === 0) vista.line(x + 2, y, x + w - 3, y, 27);
  if (y % 13 === 0) vista.line(x + 5, y, x + w - 2, y, 29);
}
for (let y = 163; y < 240; y++) {
  const x = 171 + (y - 163) * 0.2;
  vista.rect(x, y, 21 + (y - 163) * 0.1, 1, 13);
  vista.dot(x - 1, y, 12);
  if (y % 4 === 0) vista.dot(x + 4 + (hash(y, 2) % 16), y, 14);
}
for (let y = 185; y < 238; y += 7)
  for (let x = 53; x < 148; x += 9) {
    vista.rect(x, y, 7, 4, 10);
    vista.line(x + 3, y, x + 3, y - 4, 18);
    vista.dot(x + 2, y - 4, 22);
    vista.dot(x + 4, y - 5, 19);
    if ((x + y) % 3 === 0) vista.oval(x + 3, y - 2, 2, 2, 35);
  }
const house = sprites.find((s) => s.name === "building_house")!.p;
vista.paste(house, 118, 101);
for (const [x, y] of [
  [-12, 119],
  [22, 126],
  [274, 145],
  [292, 173],
])
  vista.paste(sprites.find((s) => s.name === "tree_0")!.p, x!, y!);
// A golden lantern tree beside the water foreshadows the original main story.
vista.paste(sprites.find((s) => s.name === "tree_0")!.p, 219, 135);
for (const [x, y] of [
  [232, 158],
  [246, 146],
  [257, 164],
  [239, 172],
]) {
  vista.line(x!, y! - 3, x!, y!, 10);
  vista.oval(x!, y! + 2, 2, 3, 46);
  vista.line(x!, y!, x!, y! + 3, 47);
  vista.dot(x! - 1, y! + 1, 15);
}
for (let x = 47; x < 152; x += 16)
  vista.paste(sprites.find((s) => s.name === "fence")!.p, x, 168);
vista.paste(sprites.find((s) => s.name === "bridge")!.p, 254, 193);
vista.paste(sprites.find((s) => s.name === "animal_chicken_0")!.p, 196, 194);
vista.paste(sprites.find((s) => s.name === "player_down_0")!.p, 173, 182);
for (let i = 0; i < 200; i++) {
  const x = hash(i, 11) % 320,
    y = 163 + (hash(i, 12) % 77);
  if (x < 48 || (x > 199 && x < 234) || x > 304) {
    vista.dot(x, y, 21);
    if (i % 7 === 0) {
      vista.dot(x, y - 1, 40);
      vista.dot(x + 1, y - 1, 41);
    }
  }
}
for (const [x, y, f] of [
  [6, 218, 1],
  [30, 230, 3],
  [207, 227, 4],
  [307, 216, 0],
])
  vista.paste(sprites.find((s) => s.name === `flower_${f}`)!.p, x!, y!);
writeFileSync(`${dir}/title.png`, vista.buffer());
sprite("cloud", 64, 24, (p) => {
  p.oval(18, 15, 17, 7, 29);
  p.oval(35, 11, 19, 10, 29);
  p.oval(51, 16, 12, 6, 29);
  p.oval(25, 10, 13, 7, 30);
  p.oval(39, 8, 12, 6, 30);
});
writeFileSync(
  `${dir}/cloud.png`,
  sprites.find((s) => s.name === "cloud")!.p.buffer(),
);
for (const [season, swap] of Object.entries(seasonSwaps)) {
  const landscape = new Pixel(320, 240);
  for (let yy = 0; yy < 240; yy++)
    for (let xx = 0; xx < 320; xx++) {
      const i = (yy * 320 + xx) * 4;
      const hex = "#" + vista.png.data.subarray(i, i + 3).toString("hex");
      const c = palette.indexOf(hex as (typeof palette)[number]);
      landscape.dot(xx, yy, (swap as Record<number, number>)[c] ?? c);
    }
  writeFileSync(`${dir}/title_${season}.png`, landscape.buffer());
}
for (let f = 0; f < 4; f++)
  sprite(`leaf_${f}`, 8, 8, (p) => {
    p.oval(4, 4, 3, f % 2 ? 1 : 2, [20, 21, 35, 37][f]!);
    p.line(1, 4, 6, 4, 10);
  });
sprite("heart", 12, 12, (p) => {
  p.oval(3, 3, 3, 3, 32);
  p.oval(8, 3, 3, 3, 32);
  for (let y = 3; y < 11; y++) p.line(y - 3, y, 14 - y, y, 32);
  p.oval(3, 3, 2, 2, 35);
  p.oval(8, 3, 2, 2, 35);
  for (let y = 4; y < 10; y++) p.line(y - 3, y, 13 - y, y, 35);
  p.line(2, 2, 4, 2, 7);
});
sprite("coin", 12, 12, (p) => {
  p.oval(6, 6, 5, 5, 10);
  p.oval(6, 5, 4, 4, 46);
  p.oval(6, 5, 3, 3, 47);
  p.line(6, 3, 6, 7, 12);
  p.dot(4, 3, 15);
});
sprite("sun", 16, 16, (p) => {
  for (let a = 0; a < 8; a++) {
    const t = (a * Math.PI) / 4;
    p.line(
      8 + Math.cos(t) * 6,
      8 + Math.sin(t) * 6,
      8 + Math.cos(t) * 8,
      8 + Math.sin(t) * 8,
      46,
    );
  }
  p.oval(8, 8, 4, 4, 47);
  p.dot(6, 6, 15);
});
sprite("moon", 16, 16, (p) => {
  p.oval(8, 8, 6, 6, 47);
  p.oval(11, 5, 5, 5, 25);
  p.dot(5, 9, 15);
});
// Four authored narrative illustrations share the palette but have independent
// compositions, lighting and props; no screenshot crops or external references.
function scenePanel(name: string, paint: (p: Pixel) => void) {
  const p = new Pixel(320, 160);
  paint(p);
  writeFileSync(`${dir}/intro_${name}.png`, p.buffer());
}
function inkText(p: Pixel, text: string, x: number, y: number, color: number) {
  for (const [i, ch] of [...text].entries())
    glyph(ch.charCodeAt(0)).forEach((row, j) =>
      row.forEach((v, k) => {
        if (v) p.dot(x + i * 6 + k, y + j, color);
      }),
    );
}
scenePanel("city", (p) => {
  p.rect(0, 0, 320, 160, 1);
  p.rect(0, 0, 320, 12, 0);
  p.rect(8, 12, 304, 104, 2);
  // An office window looks across a quiet, rainy skyline.
  p.rect(25, 18, 184, 93, 0);
  p.rect(29, 22, 176, 85, 24);
  for (let i = 0; i < 13; i++) {
    const x = 30 + i * 14,
      h = 18 + (hash(i, 91) % 56);
    p.rect(x, 106 - h, 12, h, 1);
    p.line(x, 106 - h, x + 11, 106 - h, 42);
    for (let y = 111 - h; y < 103; y += 8)
      for (let xx = x + 3; xx < x + 11; xx += 5) {
        const lit = hash(xx, y, 3) % 4 === 0;
        p.rect(xx, y, 2, 3, lit ? 13 : 2);
      }
  }
  p.oval(177, 38, 7, 7, 44);
  p.oval(180, 35, 6, 6, 24);
  for (let i = 0; i < 42; i++) {
    const x = 32 + (hash(i, 42) % 167),
      y = 24 + (hash(i, 43) % 76);
    p.line(x, y, x - 2, y + 5, 25);
  }
  p.rect(115, 20, 4, 89, 0);
  p.rect(28, 67, 178, 3, 0);
  p.rect(23, 108, 188, 6, 8);
  p.line(24, 109, 209, 109, 43);
  // Wall clock, coat and an unoccupied chair leave room for the reader.
  p.oval(262, 42, 16, 16, 0);
  p.oval(262, 42, 14, 14, 43);
  p.oval(262, 42, 12, 12, 1);
  p.line(262, 42, 262, 33, 44);
  p.line(262, 42, 270, 45, 44);
  for (const [x, y] of [
    [262, 31],
    [273, 42],
    [262, 53],
    [251, 42],
  ])
    p.dot(x!, y!, 14);
  p.rect(288, 75, 3, 60, 8);
  p.line(278, 84, 301, 84, 8);
  p.oval(289, 97, 10, 12, 24);
  p.rect(282, 99, 15, 27, 24);
  p.line(287, 88, 287, 121, 25);
  p.rect(8, 116, 304, 44, 8);
  p.rect(12, 118, 296, 42, 10);
  for (let y = 121; y < 160; y += 7) p.line(13, y, 307, y, 9);
  p.rect(40, 117, 48, 31, 0);
  p.rect(44, 119, 40, 26, 24);
  p.line(47, 122, 81, 122, 25);
  p.rect(50, 149, 29, 11, 0);
  // A small pool of warm light surrounds the first letter.
  p.oval(195, 137, 56, 16, 11);
  p.oval(195, 137, 42, 12, 12);
  p.rect(157, 125, 66, 24, 13);
  p.rect(160, 123, 64, 24, 15);
  p.line(161, 124, 192, 140, 14);
  p.line(223, 124, 192, 140, 14);
  p.oval(192, 139, 4, 4, 33);
  p.dot(191, 138, 35);
  p.rect(241, 133, 25, 4, 8);
  p.oval(253, 134, 13, 3, 9);
  p.line(253, 132, 250, 95, 43);
  p.line(250, 95, 234, 85, 43);
  p.oval(233, 86, 14, 5, 46);
  p.rect(222, 86, 23, 4, 46);
  p.line(222, 90, 244, 90, 47);
  p.rect(111, 132, 18, 16, 2);
  p.oval(120, 132, 9, 3, 43);
  p.oval(120, 132, 6, 2, 8);
  p.oval(130, 139, 4, 5, 43);
  p.oval(130, 139, 2, 3, 10);
  p.rect(17, 96, 14, 20, 2);
  p.line(24, 98, 24, 76, 17);
  p.oval(18, 82, 7, 3, 18);
  p.oval(29, 88, 7, 3, 17);
});
scenePanel("letter", (p) => {
  p.rect(0, 0, 320, 160, 10);
  for (let y = 0; y < 160; y += 16) {
    p.rect(0, y, 320, 1, 8);
    p.line(0, y + 2, 319, y + 2, 12);
    for (let i = 0; i < 7; i++) {
      const x = hash(i, y, 19) % 320;
      p.line(x, y + 8, x + 15, y + 8, 9);
    }
  }
  // A folded envelope rests beneath the opened letter, with a botanical stamp.
  p.rect(80, 22, 160, 119, 8);
  p.rect(78, 20, 160, 117, 13);
  p.line(79, 21, 157, 94, 14);
  p.line(237, 21, 157, 94, 14);
  p.rect(95, 13, 141, 132, 12);
  p.rect(92, 10, 141, 132, 15);
  p.rect(94, 12, 137, 128, 14);
  p.rect(97, 13, 132, 125, 15);
  p.line(99, 65, 226, 65, 14);
  p.line(99, 105, 226, 105, 14);
  inkText(p, "FOR YOU", 107, 21, 9);
  p.rect(205, 21, 18, 22, 9);
  p.rect(206, 22, 16, 20, 30);
  p.rect(208, 24, 12, 16, 21);
  p.line(214, 37, 214, 27, 10);
  p.oval(212, 29, 4, 3, 18);
  p.oval(216, 32, 3, 2, 19);
  p.dot(210, 27, 22);
  for (let y = 22; y < 43; y += 4) {
    p.dot(205, y, 15);
    p.dot(222, y, 15);
  }
  inkText(p, "A SMALL PLACE", 106, 46, 10);
  inkText(p, "TO BEGIN AGAIN.", 106, 57, 10);
  for (let row = 0; row < 4; row++) {
    const y = 79 + row * 7;
    for (let part = 0; part < 5; part++) {
      const x = 106 + part * 23,
        len = 9 + (hash(row, part, 4) % 11);
      p.line(x, y, x + len, y, 12);
      if (part % 2 === 0) p.dot(x + 3, y - 1, 12);
    }
  }
  inkText(p, "WITH LOVE,", 106, 114, 10);
  inkText(p, "WREN", 106, 125, 9);
  // Pressed meadow flowers, wax, a pen and a cup ground the intimate scene.
  p.line(45, 116, 70, 45, 17);
  p.line(52, 98, 37, 87, 18);
  p.oval(38, 86, 7, 3, 19);
  p.line(59, 78, 77, 69, 18);
  p.oval(77, 68, 7, 3, 20);
  for (const [x, y] of [
    [65, 58],
    [71, 44],
    [58, 73],
  ]) {
    for (const [dx, dy] of [
      [-3, 0],
      [3, 0],
      [0, -3],
      [0, 3],
    ])
      p.oval(x! + dx!, y! + dy!, 2, 2, 40);
    p.dot(x!, y!, 47);
  }
  p.oval(46, 127, 10, 5, 32);
  p.oval(46, 125, 9, 5, 34);
  p.line(42, 125, 50, 125, 35);
  p.line(46, 122, 46, 128, 35);
  p.line(251, 130, 275, 61, 0);
  p.line(253, 130, 277, 61, 25);
  p.line(255, 123, 274, 66, 27);
  p.line(251, 131, 250, 138, 46);
  p.line(276, 61, 279, 53, 46);
  p.oval(279, 27, 26, 12, 9);
  p.oval(279, 25, 25, 11, 14);
  p.oval(278, 23, 18, 14, 30);
  p.oval(278, 20, 16, 10, 31);
  p.oval(278, 20, 13, 7, 11);
  p.oval(280, 19, 9, 4, 12);
  p.oval(300, 24, 8, 8, 30);
  p.oval(300, 24, 5, 5, 10);
});
scenePanel("arrival", (p) => {
  p.rect(0, 0, 320, 160, 20);
  p.rect(0, 0, 320, 32, 19);
  for (let i = 0; i < 19; i++) {
    const x = i * 18 - 8;
    p.oval(x, 19, 14, 18, 17);
    p.oval(x - 2, 14, 11, 13, 18);
    p.line(x - 5, 8, x, 7, 21);
  }
  p.rect(0, 91, 320, 43, 13);
  p.rect(145, 25, 38, 135, 13);
  for (let i = 0; i < 240; i++) {
    const x = hash(i, 61) % 320,
      y = hash(i, 62) % 160;
    if ((y >= 91 && y < 134) || (x >= 145 && x < 183))
      p.dot(x, y, i % 3 ? 14 : 12);
    else if (y > 30) p.dot(x, y, 21);
  }
  p.paste(sprites.find((s) => s.name === "building_shop")!.p, 21, 14);
  p.paste(sprites.find((s) => s.name === "building_inn")!.p, 177, 7);
  // The village well and flower baskets make the square welcoming.
  p.oval(147, 76, 15, 6, 8);
  p.oval(147, 74, 14, 6, 43);
  p.oval(147, 72, 11, 4, 25);
  p.rect(133, 52, 3, 22, 10);
  p.rect(158, 52, 3, 22, 10);
  for (let y = 39; y < 54; y++)
    p.line(147 - (y - 39), y, 147 + (y - 39), y, 33);
  p.line(131, 54, 163, 54, 8);
  p.line(147, 53, 147, 71, 13);
  p.rect(143, 68, 8, 5, 43);
  p.paste(sprites.find((s) => s.name === "tree_0")!.p, 270, 55);
  for (const [x, y] of [
    [282, 79],
    [296, 66],
    [307, 86],
  ]) {
    p.line(x!, y! - 4, x!, y!, 9);
    p.oval(x!, y! + 2, 2, 3, 46);
    p.line(x!, y!, x!, y! + 3, 47);
  }
  for (let i = 0; i < 5; i++)
    p.paste(
      sprites.find((s) => s.name === `flower_${i}`)!.p,
      196 + i * 16,
      137 + (i % 2) * 5,
    );
  // The arrival wagon carries a quilt, one trunk and a small potted plant.
  p.oval(77, 129, 12, 12, 8);
  p.oval(77, 129, 9, 9, 11);
  p.oval(77, 129, 6, 6, 13);
  p.line(69, 129, 85, 129, 8);
  p.line(77, 121, 77, 137, 8);
  p.oval(117, 129, 12, 12, 8);
  p.oval(117, 129, 9, 9, 11);
  p.oval(117, 129, 6, 6, 13);
  p.line(109, 129, 125, 129, 8);
  p.line(117, 121, 117, 137, 8);
  p.rect(62, 98, 69, 29, 8);
  p.rect(64, 100, 65, 23, 11);
  for (let y = 103; y < 123; y += 6) p.line(65, y, 127, y, 13);
  p.rect(62, 97, 69, 4, 14);
  p.rect(66, 99, 4, 26, 9);
  p.rect(123, 99, 4, 26, 9);
  p.rect(76, 82, 25, 16, 8);
  p.rect(78, 84, 21, 13, 10);
  p.rect(87, 83, 3, 14, 46);
  p.rect(104, 87, 19, 11, 39);
  p.line(106, 89, 121, 89, 41);
  p.line(106, 93, 121, 93, 41);
  p.rect(66, 88, 8, 10, 33);
  p.line(70, 88, 70, 77, 17);
  p.oval(67, 80, 5, 3, 19);
  p.line(131, 114, 158, 114, 10);
  p.paste(sprites.find((s) => s.name === "animal_horse_0")!.p, 150, 91);
  p.paste(sprites.find((s) => s.name === "player_down_0")!.p, 190, 107);
  p.paste(sprites.find((s) => s.name === "npc_wren_down_0")!.p, 220, 95);
  p.rect(251, 110, 2, 27, 9);
  p.rect(238, 106, 30, 15, 8);
  p.rect(240, 108, 26, 11, 14);
  inkText(p, "HOME", 241, 108, 10);
});
scenePanel("farm", (p) => {
  p.rect(0, 0, 320, 160, 28);
  for (let x = 0; x < 320; x++) {
    const y = 23 + Math.round(Math.sin(x / 34) * 9);
    p.line(x, y, x, 50, 43);
    const h = 38 + Math.round(Math.sin(x / 51) * 6);
    p.line(x, h, x, 160, 20);
  }
  for (let i = 0; i < 17; i++) {
    const x = i * 21 - 12;
    p.oval(x, 42, 12, 13, 18);
    p.oval(x - 2, 39, 9, 10, 19);
    p.dot(x - 5, 35, 22);
  }
  p.rect(142, 77, 35, 83, 13);
  for (let y = 80; y < 160; y++) {
    const x = 141 - Math.floor((y - 80) / 12);
    p.line(x, y, 179 + (y - 80) / 12, y, 13);
    if (y % 3 === 0) p.dot(x + 8 + (hash(y, 7) % 25), y, 14);
  }
  p.paste(sprites.find((s) => s.name === "building_house")!.p, 113, 16);
  p.rect(40, 92, 76, 51, 10);
  for (let y = 95; y < 142; y += 6) p.line(42, y, 113, y, 11);
  p.paste(sprites.find((s) => s.name === "rock")!.p, 63, 106);
  p.paste(sprites.find((s) => s.name === "stump")!.p, 88, 124);
  p.paste(sprites.find((s) => s.name === "bush")!.p, 40, 120);
  p.paste(sprites.find((s) => s.name === "shipping")!.p, 195, 89);
  p.paste(sprites.find((s) => s.name === "tree_0")!.p, -4, 52);
  p.paste(sprites.find((s) => s.name === "tree_0")!.p, 270, 48);
  for (let x = 0; x < 130; x += 16)
    p.paste(sprites.find((s) => s.name === "fence")!.p, x, 139);
  for (let x = 192; x < 320; x += 16)
    p.paste(sprites.find((s) => s.name === "fence")!.p, x, 139);
  // Open gate, the player's first view of the cottage, and Wren's old plaque.
  p.rect(127, 116, 6, 44, 8);
  p.rect(128, 117, 3, 43, 12);
  p.rect(189, 116, 6, 44, 8);
  p.rect(190, 117, 3, 43, 12);
  p.rect(125, 114, 10, 5, 14);
  p.rect(187, 114, 10, 5, 14);
  p.line(133, 139, 144, 124, 10);
  p.line(133, 147, 144, 132, 10);
  p.line(144, 121, 144, 137, 13);
  p.rect(207, 123, 55, 22, 8);
  p.rect(209, 125, 51, 18, 14);
  inkText(p, "WILLOW", 215, 124, 10);
  inkText(p, "ACRES", 218, 134, 10);
  p.paste(sprites.find((s) => s.name === "player_up_0")!.p, 151, 126);
  for (let i = 0; i < 6; i++)
    p.paste(
      sprites.find((s) => s.name === `flower_${i % 4}`)!.p,
      228 + i * 13,
      93 + (i % 2) * 13,
    );
  for (let i = 0; i < 90; i++) {
    const x = hash(i, 16) % 320,
      y = 75 + (hash(i, 17) % 61);
    if ((x < 38 || x > 225) && y < 135) p.dot(x, y, 21);
  }
});

sprite("board", 32, 32, (p) => {
  p.rect(5, 17, 4, 15, 8);
  p.rect(24, 17, 4, 15, 8);
  p.rect(2, 2, 28, 22, 8);
  p.rect(4, 4, 24, 18, 11);
  p.rect(6, 6, 8, 11, 15);
  p.rect(18, 8, 9, 10, 14);
  p.line(7, 9, 12, 9, 43);
  p.line(7, 12, 12, 12, 43);
  p.line(19, 11, 25, 11, 10);
  p.dot(10, 7, 34);
  p.dot(22, 9, 38);
});
sprite("counter", 64, 32, (p) => {
  p.rect(1, 8, 62, 22, 8);
  p.rect(3, 10, 58, 18, 11);
  for (let x = 8; x < 61; x += 12) p.line(x, 11, x, 28, 9);
  p.rect(0, 4, 64, 9, 8);
  p.rect(1, 3, 62, 8, 13);
  p.line(2, 4, 61, 4, 15);
  p.rect(45, 1, 10, 7, 24);
  p.rect(47, 2, 6, 3, 28);
});
sprite("tv", 24, 32, (p) => {
  p.rect(1, 5, 22, 19, 8);
  p.rect(3, 7, 18, 15, 10);
  p.rect(4, 8, 13, 12, 24);
  p.rect(5, 9, 11, 9, 27);
  p.line(6, 10, 10, 10, 29);
  p.dot(19, 11, 46);
  p.dot(19, 17, 43);
  p.rect(4, 24, 3, 8, 8);
  p.rect(18, 24, 3, 8, 8);
  p.line(11, 5, 6, 0, 43);
  p.line(11, 5, 17, 0, 43);
});
// The 47 normalized neighbour configurations each have their own edge geometry.
for (const kind of blobTerrains)
  for (const mask of blobMasks)
    for (let animation = 0; animation < (kind === "water" ? 4 : 1); animation++)
      sprite(blobFrame(kind, mask, animation), 16, 16, (p) => {
        const base = {
            grass: 20,
            dirt: 13,
            tilled: 9,
            water: 26,
            sand: 14,
            snow: 30,
            watered: 8,
          }[kind],
          outside = {
            grass: 13,
            dirt: 20,
            tilled: 10,
            water: 13,
            sand: 26,
            snow: 43,
            watered: 10,
          }[kind];
        const inside = (x: number, y: number): boolean => {
          if (!(mask & 1) && y < 2) return false;
          if (!(mask & 2) && x > 13) return false;
          if (!(mask & 4) && y > 13) return false;
          if (!(mask & 8) && x < 2) return false;
          for (const [cx, cy, a, b, corner] of [
            [0, 0, 1, 8, 128],
            [15, 0, 1, 2, 16],
            [15, 15, 4, 2, 32],
            [0, 15, 4, 8, 64],
          ]) {
            const dx = Math.abs(x - cx!),
              dy = Math.abs(y - cy!);
            if (
              mask & a! &&
              mask & b! &&
              !(mask & corner!) &&
              dx * dx + dy * dy < 10
            )
              return false;
            if (
              !(mask & a!) &&
              !(mask & b!) &&
              dx < 5 &&
              dy < 5 &&
              (5 - dx) ** 2 + (5 - dy) ** 2 > 16
            )
              return false;
          }
          return true;
        };
        for (let y = 0; y < 16; y++)
          for (let x = 0; x < 16; x++) {
            let c = outside;
            if (inside(x, y)) {
              c = base;
              const r = hash(x, y, kind.length) % 100;
              if ((kind === "tilled" || kind === "watered") && y % 4 === 2)
                c = base + 1;
              else if (r < 7) c = kind === "snow" ? 31 : base + 1;
              else if (r > 96) c = base - 1;
              if (
                kind === "water" &&
                (x + animation * 2 + (y % 5) * 3) % 13 < 4 &&
                y % 5 === 2
              )
                c = 27;
              if (!inside(x, y - 1) || !inside(x - 1, y))
                c = kind === "water" ? 28 : kind === "snow" ? 31 : base + 1;
              else if (!inside(x + 1, y) || !inside(x, y + 1))
                c = kind === "snow" ? 44 : base - 1;
            }
            p.dot(x, y, c);
          }
        if (kind === "watered") {
          p.dot(5, 5, 12);
          p.dot(10, 9, 12);
          p.dot(7, 12, 12);
        }
      });

const atlas = new Pixel(1024, 2048);
let x = 0,
  y = 0,
  row = 0;
const frames: Record<string, unknown> = {};
for (const { name, p } of sprites) {
  if (x + p.w > 1024) {
    x = 0;
    y += row + 1;
    row = 0;
  }
  if (y + p.h > 2048) throw Error("Atlas overflow");
  atlas.paste(p, x, y);
  frames[name] = {
    frame: { x, y, w: p.w, h: p.h },
    rotated: false,
    trimmed: false,
    spriteSourceSize: { x: 0, y: 0, w: p.w, h: p.h },
    sourceSize: { w: p.w, h: p.h },
  };
  x += p.w + 1;
  row = Math.max(row, p.h);
}
writeFileSync(`${dir}/atlas.png`, atlas.buffer());
writeFileSync(
  `${dir}/atlas.json`,
  JSON.stringify({
    frames,
    meta: {
      app: "Willowmere original pixel workshop",
      image: "atlas.png",
      format: "RGBA8888",
      size: { w: 1024, h: 2048 },
      scale: "1",
    },
  }),
);
writeFileSync(`${dir}/palette.json`, JSON.stringify(palette));
writeFileSync(
  `${dir}/soundtrack.json`,
  JSON.stringify({
    songs: songs.map(({ id, title, duration, tempo }) => ({
      id,
      title,
      duration,
      tempo,
    })),
    jingles: jingleSongs.map(({ id, duration }) => ({ id, duration })),
    effects: effects.map((e) => e.id),
  }),
);
generateFont(dir);
generateBoldFont(dir);
generateTTF(dir);
mkdirSync(`${dir}/tiles`, { recursive: true });
for (const { name, p } of sprites)
  if (name.startsWith("blob_") || /^flower_[0-7]$/.test(name))
    writeFileSync(`${dir}/tiles/${name}.png`, p.buffer());
mkdirSync(`${dir}/props`, { recursive: true });
const propFrames = [
  "building_house",
  "building_barn",
  "building_shop",
  "building_inn",
  "building_clinic",
  "shipping",
  "tree_0",
  "tree_3",
  "board",
  "counter",
  "tv",
  "bed",
  "desk",
  "table",
  "bush",
  "rock",
  "stump",
  "fence",
];
for (const name of propFrames)
  writeFileSync(
    `${dir}/props/${name}.png`,
    sprites.find((s) => s.name === name)!.p.buffer(),
  );
generateMaps(
  dir,
  propFrames.map((name) => {
    const p = sprites.find((s) => s.name === name)!.p;
    return { name, width: p.w, height: p.h };
  }),
);
mkdirSync(`${dir}/tiles`, { recursive: true });
for (const n of ["grass", "path", "wood", "stone", "water", "soil"])
  writeFileSync(
    `${dir}/tiles/${n}.png`,
    sprites
      .find((s) => s.name === `tile_${n}${n === "water" ? "_0" : ""}`)!
      .p.buffer(),
  );
for (const size of [192, 512]) {
  const icon = new Pixel(size, size);
  icon.rect(0, 0, size, size, 17);
  const scale = Math.floor(size / 32);
  for (let yy = 0; yy < 32; yy++)
    for (let xx = 0; xx < 32; xx++) {
      let c = 17;
      if (((xx - 16) / 12) ** 2 + ((yy - 16) / 12) ** 2 < 1) c = 20;
      if (yy > 12 && yy < 26 && xx > 8 && xx < 24) c = 14;
      if (yy >= 6 && yy <= 14 && Math.abs(xx - 16) < yy - 3) c = 33;
      if (yy > 19 && xx > 13 && xx < 19) c = 9;
      if (c !== 17) icon.rect(xx * scale, yy * scale, scale, scale, c);
    }
  writeFileSync(`public/icon-${size}.png`, icon.buffer());
}
console.log(
  `Generated ${sprites.length} original atlas frames, title, font, icons and Tiled maps.`,
);
