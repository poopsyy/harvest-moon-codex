import { PNG } from "pngjs";
import { palette } from "./palette";
export class Pixel {
  readonly png: PNG;
  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.png = new PNG({ width: w, height: h });
  }
  dot(x: number, y: number, c: number) {
    x = Math.floor(x);
    y = Math.floor(y);
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
    const hex = palette[c % 48]!;
    const i = (y * this.w + x) * 4;
    this.png.data[i] = parseInt(hex.slice(1, 3), 16);
    this.png.data[i + 1] = parseInt(hex.slice(3, 5), 16);
    this.png.data[i + 2] = parseInt(hex.slice(5, 7), 16);
    this.png.data[i + 3] = 255;
  }
  rect(x: number, y: number, w: number, h: number, c: number) {
    for (let j = y; j < y + h; j++)
      for (let i = x; i < x + w; i++) this.dot(i, j, c);
  }
  oval(x: number, y: number, rx: number, ry: number, c: number) {
    for (let j = -ry; j <= ry; j++)
      for (let i = -rx; i <= rx; i++)
        if ((i * i) / (rx * rx) + (j * j) / (ry * ry) <= 1)
          this.dot(x + i, y + j, c);
  }
  line(x: number, y: number, xx: number, yy: number, c: number) {
    const n = Math.max(Math.abs(xx - x), Math.abs(yy - y));
    for (let i = 0; i <= n; i++)
      this.dot(x + ((xx - x) * i) / (n || 1), y + ((yy - y) * i) / (n || 1), c);
  }
  paste(p: Pixel, x: number, y: number) {
    for (let j = 0; j < p.h; j++)
      for (let i = 0; i < p.w; i++) {
        const source = (j * p.w + i) * 4,
          dx = x + i,
          dy = y + j;
        if (
          dx < 0 ||
          dy < 0 ||
          dx >= this.w ||
          dy >= this.h ||
          p.png.data[source + 3] === 0
        )
          continue;
        const target = (dy * this.w + dx) * 4;
        for (let k = 0; k < 4; k++)
          this.png.data[target + k] = p.png.data[source + k]!;
      }
  }
  buffer() {
    return PNG.sync.write(this.png);
  }
}
