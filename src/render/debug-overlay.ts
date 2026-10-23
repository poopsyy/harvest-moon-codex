import type Phaser from "phaser";
import type { Tile } from "../input/pathfinding";
export interface DebugSnapshot {
  enabled: boolean;
  width: number;
  height: number;
  blocked: (x: number, y: number) => boolean;
  paths: { x: number; y: number; route: Tile[] }[];
  triggers: { x: number; y: number; width?: number; height?: number }[];
}
/** Imported only by a DEV-guarded call, so production tree-shaking removes this module. */
export function createDebugOverlay(
  scene: Phaser.Scene,
  snapshot: () => DebugSnapshot,
): (time: number) => void {
  const lines = scene.add.graphics().setDepth(15000);
  const label = scene.add
    .text(4, 216, "", {
      fontFamily: "monospace",
      fontSize: "8px",
      color: "#fff0cf",
      backgroundColor: "#25283e",
      padding: { x: 3, y: 2 },
    })
    .setDepth(15001)
    .setScrollFactor(0);
  let next = 0;
  return (time) => {
    if (time < next) return;
    next = time + 100;
    const view = snapshot();
    lines.clear().setVisible(view.enabled);
    label.setVisible(view.enabled);
    if (!view.enabled) return;
    const bounds = scene.cameras.main.worldView;
    const left = Math.max(0, Math.floor(bounds.x / 16)),
      right = Math.min(view.width, Math.ceil(bounds.right / 16));
    const top = Math.max(0, Math.floor(bounds.y / 16)),
      bottom = Math.min(view.height, Math.ceil(bounds.bottom / 16));
    lines.lineStyle(1, 0xdc7d61, 0.65);
    lines.fillStyle(0xb65c56, 0.16);
    for (let y = top; y < bottom; y++)
      for (let x = left; x < right; x++)
        if (view.blocked(x, y)) {
          lines.fillRect(x * 16, y * 16, 16, 16);
          lines.strokeRect(x * 16, y * 16, 16, 16);
        }
    for (const [index, path] of view.paths.entries()) {
      lines.lineStyle(1, index === 0 ? 0xf4d66a : 0x91cbd1, 0.95);
      lines.beginPath();
      lines.moveTo(path.x * 16 + 8, path.y * 16 + 8);
      for (const tile of path.route)
        lines.lineTo(tile.x * 16 + 8, tile.y * 16 + 8);
      lines.strokePath();
      const end = path.route.at(-1);
      if (end) lines.strokeCircle(end.x * 16 + 8, end.y * 16 + 8, 3);
    }
    lines.lineStyle(1, 0xab87b6, 1);
    for (const trigger of view.triggers) {
      const width = trigger.width ?? 1,
        height = trigger.height ?? 1;
      lines.strokeRect(
        (trigger.x - Math.floor(width / 2)) * 16,
        (trigger.y - height + 1) * 16,
        width * 16,
        height * 16,
      );
      lines.strokeCircle(trigger.x * 16 + 8, trigger.y * 16 + 8, 4);
    }
    label.setText(
      `${Math.round(scene.game.loop.actualFps)} FPS  ${scene.children.length} entities\nred:collision cyan:path purple:trigger`,
    );
  };
}
