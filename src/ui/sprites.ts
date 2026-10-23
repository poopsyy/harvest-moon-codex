import { esc } from "./i18n";
interface Atlas {
  frames: Record<
    string,
    { frame: { x: number; y: number; w: number; h: number } }
  >;
  meta: { size: { w: number; h: number } };
}
let atlas: Atlas | null = null;
export async function loadAtlas() {
  const r = await fetch("/assets/atlas.json");
  if (!r.ok) throw new Error(`Atlas ${r.status}`);
  atlas = (await r.json()) as Atlas;
}
export function sprite(name: string, scale = 1): string {
  const f = atlas?.frames[name]?.frame ?? atlas?.frames[`item_${name}`]?.frame;
  if (!f || !atlas)
    return '<span class="pixel-star" aria-hidden="true"></span>';
  return `<span class="sprite" aria-hidden="true" data-sprite="${esc(name)}" style="width:${f.w * scale}px;height:${f.h * scale}px;background-size:${atlas.meta.size.w * scale}px ${atlas.meta.size.h * scale}px;background-position:-${f.x * scale}px -${f.y * scale}px"></span>`;
}
