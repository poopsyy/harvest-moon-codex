import { writeFileSync } from "node:fs";
import { glyph } from "./font";
class Bytes {
  b: number[] = [];
  u8(v: number) {
    this.b.push(v & 255);
    return this;
  }
  u16(v: number) {
    return this.u8(v >> 8).u8(v);
  }
  i16(v: number) {
    return this.u16(v);
  }
  u32(v: number) {
    return this.u16(v >>> 16).u16(v);
  }
  raw(v: Uint8Array) {
    this.b.push(...v);
    return this;
  }
  get buffer() {
    return Buffer.from(this.b);
  }
}
function checksum(b: Buffer) {
  let sum = 0;
  for (let i = 0; i < b.length; i += 4)
    sum =
      (sum +
        (b[i]! * 0x1000000 +
          (b[i + 1] ?? 0) * 65536 +
          (b[i + 2] ?? 0) * 256 +
          (b[i + 3] ?? 0))) >>>
      0;
  return sum;
}
/** TrueType contours are the exact self-authored bitmap pixels; no external outlines. */
export function generateTTF(dir: string) {
  const tables: Record<string, Buffer> = {},
    glyf = new Bytes(),
    loca = new Bytes();
  const count = 225;
  for (let code = 31; code < 256; code++) {
    loca.u32(glyf.b.length);
    const pixels: { x: number; y: number }[] = [];
    if (code >= 32)
      glyph(code).forEach((r, y) =>
        r.forEach((v, x) => {
          if (v) pixels.push({ x: x * 100, y: 800 - y * 100 });
        }),
      );
    if (!pixels.length) {
      glyf.i16(0).i16(0).i16(0).i16(0).i16(0);
    } else {
      glyf.i16(pixels.length).i16(0).i16(-200).i16(600).i16(900);
      pixels.forEach((_, i) => glyf.u16(i * 4 + 3));
      glyf.u16(0);
      pixels.forEach(() => {
        for (let i = 0; i < 4; i++) glyf.u8(1);
      });
      let prev = 0;
      for (const p of pixels)
        for (const x of [p.x, p.x, p.x + 100, p.x + 100]) {
          glyf.i16(x - prev);
          prev = x;
        }
      prev = 0;
      for (const p of pixels)
        for (const y of [p.y, p.y + 100, p.y + 100, p.y]) {
          glyf.i16(y - prev);
          prev = y;
        }
    }
    while (glyf.b.length % 4) glyf.u8(0);
  }
  loca.u32(glyf.b.length);
  tables.glyf = glyf.buffer;
  tables.loca = loca.buffer;
  const head = new Bytes()
    .u32(0x10000)
    .u32(0x10000)
    .u32(0)
    .u32(0x5f0f3cf5)
    .u16(3)
    .u16(1000)
    .u32(0)
    .u32(0)
    .u32(0)
    .u32(0)
    .i16(0)
    .i16(-200)
    .i16(600)
    .i16(900)
    .u16(0)
    .u16(8)
    .i16(2)
    .i16(1)
    .i16(0);
  tables.head = head.buffer;
  const hhea = new Bytes()
    .u32(0x10000)
    .i16(900)
    .i16(-200)
    .i16(0)
    .u16(600)
    .i16(0)
    .i16(0)
    .i16(600)
    .i16(1)
    .i16(0)
    .i16(0);
  for (let i = 0; i < 4; i++) hhea.i16(0);
  hhea.i16(0).u16(count);
  tables.hhea = hhea.buffer;
  const maxp = new Bytes()
    .u32(0x10000)
    .u16(count)
    .u16(300)
    .u16(75)
    .u16(0)
    .u16(0)
    .u16(1);
  for (let i = 0; i < 8; i++) maxp.u16(0);
  tables.maxp = maxp.buffer;
  const hmtx = new Bytes();
  for (let i = 0; i < count; i++) hmtx.u16(600).i16(0);
  tables.hmtx = hmtx.buffer;
  const sub = new Bytes()
    .u16(4)
    .u16(32)
    .u16(0)
    .u16(4)
    .u16(4)
    .u16(1)
    .u16(0)
    .u16(255)
    .u16(65535)
    .u16(0)
    .u16(32)
    .u16(65535)
    .i16(-31)
    .i16(1)
    .u16(0)
    .u16(0);
  tables.cmap = new Bytes()
    .u16(0)
    .u16(1)
    .u16(3)
    .u16(1)
    .u32(12)
    .raw(sub.buffer).buffer;
  const post = new Bytes().u32(0x30000).u32(0).i16(-100).i16(50).u32(1);
  for (let i = 0; i < 4; i++) post.u32(0);
  tables.post = post.buffer;
  const names = [
    "Willow Ink",
    "Regular",
    "WillowInk-Regular",
    "Willow Ink Regular",
    "Version 1.0",
    "WillowInk-Regular",
  ];
  const nb = new Bytes()
    .u16(0)
    .u16(names.length)
    .u16(6 + names.length * 12);
  let offset = 0;
  const texts: Buffer[] = [];
  names.forEach((s, i) => {
    const b = new Bytes();
    for (const c of s) b.u16(c.charCodeAt(0));
    texts.push(b.buffer);
    nb.u16(3)
      .u16(1)
      .u16(0x409)
      .u16(i === 2 ? 3 : i === 3 ? 4 : i === 4 ? 5 : i === 5 ? 6 : i + 1)
      .u16(b.b.length)
      .u16(offset);
    offset += b.b.length;
  });
  texts.forEach((b) => nb.raw(b));
  tables.name = nb.buffer;
  const os = Buffer.alloc(96);
  os.writeUInt16BE(4, 0);
  os.writeInt16BE(600, 2);
  os.writeUInt16BE(400, 4);
  os.writeUInt16BE(5, 6);
  os.writeUInt32BE(3, 42);
  os.write("WILL", 58);
  os.writeUInt16BE(64, 62);
  os.writeUInt16BE(32, 64);
  os.writeUInt16BE(255, 66);
  os.writeInt16BE(900, 68);
  os.writeInt16BE(-200, 70);
  os.writeUInt16BE(900, 74);
  os.writeUInt16BE(200, 76);
  os.writeUInt32BE(1, 78);
  os.writeInt16BE(700, 86);
  os.writeInt16BE(700, 88);
  os.writeUInt16BE(32, 92);
  tables["OS/2"] = os;
  const tags = Object.keys(tables).sort(),
    num = tags.length,
    power = 2 ** Math.floor(Math.log2(num));
  const out = new Bytes()
    .u32(0x10000)
    .u16(num)
    .u16(power * 16)
    .u16(Math.log2(power))
    .u16(num * 16 - power * 16);
  offset = 12 + num * 16;
  let headOffset = 0;
  for (const tag of tags) {
    const b = tables[tag]!;
    out.raw(Buffer.from(tag)).u32(checksum(b)).u32(offset).u32(b.length);
    if (tag === "head") headOffset = offset;
    offset += Math.ceil(b.length / 4) * 4;
  }
  for (const tag of tags) {
    out.raw(tables[tag]!);
    while (out.b.length % 4) out.u8(0);
  }
  const font = out.buffer;
  font.writeUInt32BE((0xb1b0afba - checksum(font)) >>> 0, headOffset + 8);
  writeFileSync(`${dir}/willow-ink.ttf`, font);
}
