import type Phaser from "phaser";
import { palette } from "../../tools/palette";
type Rect = { x: number; y: number; w: number; h: number };
type Appearance = Record<string, number>;
const dirs = ["down", "left", "right", "up"];
const rgba = palette.map(
  (hex) =>
    [
      parseInt(hex.slice(1, 3), 16),
      parseInt(hex.slice(3, 5), 16),
      parseInt(hex.slice(5, 7), 16),
    ] as const,
);
const normalize = (n: number | undefined, length: number) =>
  Math.abs(Math.floor(n ?? 0)) % length;
function composite(
  source: CanvasImageSource,
  rect: (name: string) => Rect | undefined,
  appearance: Appearance,
  dir: string,
  frame: number,
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = 16;
  canvas.height = 24;
  const target = canvas.getContext("2d")!;
  target.imageSmoothingEnabled = false;
  const skinRamps = [
    [13, 14, 15],
    [11, 12, 13],
    [9, 11, 12],
    [8, 9, 11],
    [5, 6, 7],
    [34, 36, 37],
  ];
  const clothes = [
    [25, 26, 27],
    [17, 18, 20],
    [32, 33, 34],
    [38, 39, 40],
    [10, 11, 12],
    [42, 43, 44],
  ];
  const hairs = [
    [8, 9, 10],
    [9, 10, 11],
    [11, 12, 13],
    [0, 1, 2],
    [32, 33, 34],
    [42, 43, 44],
    [38, 39, 40],
    [17, 18, 20],
  ];
  const skin = skinRamps[normalize(appearance.skin, skinRamps.length)]!;
  const outfit = clothes[normalize(appearance.outfit, clothes.length)]!;
  const hair = hairs[normalize(appearance.hairColor, hairs.length)]!;
  const layers = [
    {
      name: `body_${normalize(appearance.body, 2)}_${dir}_${frame}`,
      swaps: new Map([
        [13, skin[0]!],
        [14, skin[1]!],
        [15, skin[2]!],
        [25, outfit[0]!],
        [26, outfit[1]!],
        [27, outfit[2]!],
      ]),
    },
    {
      name: `hair_${normalize(appearance.hair, 6)}_${dir}_${frame}`,
      swaps: new Map([
        [8, hair[0]!],
        [9, hair[1]!],
        [10, hair[2]!],
      ]),
    },
  ];
  for (const layer of layers) {
    const region = rect(layer.name);
    if (!region) continue;
    const buffer = document.createElement("canvas");
    buffer.width = 16;
    buffer.height = 24;
    const context = buffer.getContext("2d")!;
    context.drawImage(
      source,
      region.x,
      region.y,
      region.w,
      region.h,
      0,
      0,
      16,
      24,
    );
    const pixels = context.getImageData(0, 0, 16, 24);
    for (let i = 0; i < pixels.data.length; i += 4) {
      if (!pixels.data[i + 3]) continue;
      for (const [from, to] of layer.swaps) {
        const a = rgba[from]!,
          b = rgba[to]!;
        if (
          pixels.data[i] === a[0] &&
          pixels.data[i + 1] === a[1] &&
          pixels.data[i + 2] === a[2]
        ) {
          pixels.data[i] = b[0];
          pixels.data[i + 1] = b[1];
          pixels.data[i + 2] = b[2];
          break;
        }
      }
    }
    context.putImageData(pixels, 0, 0);
    target.drawImage(buffer, 0, 0);
  }
  return canvas;
}
export function appearanceTexture(
  scene: Phaser.Scene,
  appearance: Appearance,
): string {
  const atlas = scene.textures.get("world");
  if (!atlas.has("body_0_down_0")) return "world";
  const key = `avatar_${["body", "hair", "hairColor", "skin", "outfit"].map((k) => appearance[k] ?? 0).join("_")}`;
  if (scene.textures.exists(key)) return key;
  const texture = scene.textures.createCanvas(key, 64, 96);
  if (!texture) return "world";
  const source = atlas.getSourceImage() as CanvasImageSource;
  const rect = (name: string) => {
    const frame = atlas.get(name);
    return {
      x: frame.cutX,
      y: frame.cutY,
      w: frame.cutWidth,
      h: frame.cutHeight,
    };
  };
  for (const [dy, dir] of dirs.entries())
    for (let f = 0; f < 4; f++) {
      texture.context.drawImage(
        composite(source, rect, appearance, dir, f),
        f * 16,
        dy * 24,
      );
      texture.add(`player_${dir}_${f}`, 0, f * 16, dy * 24, 16, 24);
      if (f < 2)
        texture.add(`player_idle_${dir}_${f}`, 0, f * 32, dy * 24, 16, 24);
    }
  texture.refresh();
  return key;
}
let previewAssets:
  | Promise<{
      image: HTMLImageElement;
      frames: Record<string, { frame: Rect }>;
    }>
  | undefined;
export async function createAppearancePreview(
  appearance: Appearance,
): Promise<string> {
  previewAssets ??= Promise.all([
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `${import.meta.env.BASE_URL}assets/atlas.png`;
    }),
    fetch(`${import.meta.env.BASE_URL}assets/atlas.json`).then(
      async (response) => {
        if (!response.ok) throw new Error("Avatar atlas unavailable");
        return (await response.json()) as {
          frames: Record<string, { frame: Rect }>;
        };
      },
    ),
  ]).then(([image, atlas]) => ({ image, frames: atlas.frames }));
  const { image, frames } = await previewAssets;
  return composite(
    image,
    (name) => frames[name]?.frame,
    appearance,
    "down",
    0,
  ).toDataURL("image/png");
}
