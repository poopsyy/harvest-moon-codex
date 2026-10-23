import Phaser from "phaser";
import type { ScriptStep } from "../systems/events";
import type { CeremonyKind } from "./cinematic";
import type { Command, GameState } from "../state/game";
import { World, type WorldOptions } from "../scenes/World";
export async function mountWorld(
  container: HTMLElement,
  getState: () => GameState,
  onCommand: (command: Command) => void,
  onInteract: (target: string) => void,
  options: () => WorldOptions = () => ({}),
): Promise<{
  present(step: ScriptStep): Promise<void>;
  ceremony(kind: CeremonyKind, speakerIds: string[]): Promise<void>;
  endCeremony(): Promise<void>;
  toggleRun(): void;
  interact(): void;
  move(dx: number, dy: number): void;
  destroy(): void;
  setPaused(paused: boolean): void;
  screenshot(): string;
  resize(): void;
}> {
  let ready!: () => void;
  const loaded = new Promise<void>((resolve) => {
    ready = resolve;
  });
  const world = new World({
    getState,
    command: onCommand,
    interact: onInteract,
    ready,
    options,
  });
  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: container,
    width: 320,
    height: 240,
    pixelArt: true,
    roundPixels: true,
    backgroundColor: "#75965a",
    render: {
      antialias: false,
      pixelArt: true,
      roundPixels: true,
      preserveDrawingBuffer: true,
    },
    scale: {
      mode: Phaser.Scale.NONE,
      autoCenter: Phaser.Scale.CENTER_BOTH,
      width: 320,
      height: 240,
    },
    scene: [world],
    audio: { noAudio: true },
    input: { gamepad: true },
    banner: false,
  });
  await loaded;
  game.canvas.setAttribute("aria-label", "Willowmere Acres pixel world");
  game.canvas.dataset.ready = "true";
  const resize = () => {
    const bounds = container.getBoundingClientRect();
    const zoom = Math.max(
      1,
      Math.floor(Math.min(bounds.width / 320, bounds.height / 240)),
    );
    game.scale.setZoom(zoom);
    game.scale.refresh();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();
  return {
    present: (step) => world.present(step),
    ceremony: (kind, ids) => world.ceremony(kind, ids),
    endCeremony: () => world.endCeremony(),
    toggleRun() {
      world.toggleRun();
    },
    interact() {
      world.useAction();
    },
    move(dx, dy) {
      world.moveDirection(dx, dy);
    },
    destroy() {
      world.disposePresentation();
      observer.disconnect();
      game.destroy(true);
    },
    setPaused(paused) {
      world.paused = paused;
    },
    screenshot() {
      const thumbnail = document.createElement("canvas");
      thumbnail.width = 160;
      thumbnail.height = 120;
      const context = thumbnail.getContext("2d");
      if (context) {
        context.imageSmoothingEnabled = false;
        context.drawImage(game.canvas, 0, 0, 160, 120);
      }
      return thumbnail.toDataURL("image/png");
    },
    resize,
  };
}
