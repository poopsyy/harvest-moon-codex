import Phaser from "phaser";
import type { ScriptStep } from "../systems/events";
import type { GameState } from "../state/game";
export type CeremonyKind = "wedding" | "bloom" | "vote";
/** Temporary presentation actors; the simulation remains the source of persistent positions. */
export class Cinematic {
  private actors = new Map<string, Phaser.GameObjects.Image>();
  private originals = new Map<string, Phaser.GameObjects.Image>();
  private stage: Phaser.GameObjects.Container | null = null;
  private fade: Phaser.GameObjects.Rectangle;
  private pending = new Set<() => void>();
  private timers = new Set<Phaser.Time.TimerEvent>();
  private tweens = new Set<Phaser.Tweens.Tween>();
  private effects = new Set<Phaser.GameObjects.GameObject>();
  private disposed = false;
  constructor(
    private scene: Phaser.Scene,
    private state: () => GameState,
    private source: (id: string) => Phaser.GameObjects.Image | undefined,
  ) {
    this.fade = scene.add
      .rectangle(0, 0, 320, 240, 0x25283e, 1)
      .setAlpha(0)
      .setOrigin(0)
      .setScrollFactor(0)
      .setDepth(30000);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.dispose());
    scene.events.once(Phaser.Scenes.Events.DESTROY, () => this.dispose());
  }
  private tween(
    target: object,
    values: Record<string, unknown>,
    duration = 450,
  ): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      const tween = this.scene.tweens.add({
        targets: target,
        ...values,
        duration,
        onComplete: () => {
          this.tweens.delete(tween);
          done();
        },
      });
      this.tweens.add(tween);
    });
  }
  private wait(duration: number): Promise<void> {
    if (this.disposed) return Promise.resolve();
    return new Promise((resolve) => {
      const done = () => {
        this.pending.delete(done);
        resolve();
      };
      this.pending.add(done);
      const timer = this.scene.time.delayedCall(
        Math.max(0, Math.min(5000, duration)),
        () => {
          this.timers.delete(timer);
          done();
        },
      );
      this.timers.add(timer);
    });
  }
  private actor(id: string): Phaser.GameObjects.Image | undefined {
    if (this.actors.has(id)) return this.actors.get(id);
    const original = this.source(id);
    if (!original) return;
    const actor = this.scene.add
      .image(original.x, original.y, original.texture.key, original.frame.name)
      .setOrigin(0.5, 1)
      .setDepth(original.depth + 2);
    if (this.stage) this.stage.add(actor);
    else {
      original.setVisible(false);
      this.originals.set(id, original);
    }
    this.actors.set(id, actor);
    return actor;
  }
  private face(id: string, actor: Phaser.GameObjects.Image, direction: string) {
    const frame = `${id === "player" ? "player" : `npc_${id}`}_${direction}_0`;
    if (actor.texture.has(frame)) actor.setFrame(frame);
  }
  async present(step: ScriptStep): Promise<void> {
    if (this.disposed || !("value" in step) || step.type === "flag") return;
    if (
      ![
        "move",
        "face",
        "emote",
        "animation",
        "camera",
        "fade",
        "wait",
      ].includes(step.type)
    )
      return;
    if (step.type === "wait") {
      await this.wait(Number(step.value) || 0);
      return;
    }
    if (step.type === "fade") {
      await this.tween(
        this.fade,
        { alpha: step.value === "out" || step.value === 1 ? 1 : 0 },
        350,
      );
      return;
    }
    if (
      step.type === "camera" &&
      (step.value === "restore" || (step.target === "player" && !this.stage))
    ) {
      const player = this.source("player");
      if (player) this.scene.cameras.main.startFollow(player, true, 0.12, 0.12);
      return;
    }
    const id = step.target ?? "player",
      actor = this.actor(id);
    if (!actor) return;
    switch (step.type) {
      case "move": {
        const coordinates = String(step.value).split(/[, ]+/).map(Number);
        const [x, y] = coordinates;
        if (
          x === undefined ||
          y === undefined ||
          !Number.isFinite(x) ||
          !Number.isFinite(y)
        )
          return;
        const tx = x * 16 + 8,
          ty = (y + 1) * 16;
        this.face(
          id,
          actor,
          Math.abs(tx - actor.x) > Math.abs(ty - actor.y)
            ? tx < actor.x
              ? "left"
              : "right"
            : ty < actor.y
              ? "up"
              : "down",
        );
        await this.tween(
          actor,
          { x: tx, y: ty, onUpdate: () => actor.setDepth(actor.y + 2) },
          Math.max(
            200,
            Math.min(2400, Math.hypot(tx - actor.x, ty - actor.y) * 22),
          ),
        );
        break;
      }
      case "face":
        this.face(id, actor, String(step.value));
        break;
      case "emote": {
        const g = this.scene.add.graphics().setDepth(29000);
        g.fillStyle(0xfff0cf);
        g.fillRoundedRect(actor.x - 8, actor.y - 40, 16, 15, 3);
        g.fillTriangle(
          actor.x - 2,
          actor.y - 25,
          actor.x + 2,
          actor.y - 25,
          actor.x,
          actor.y - 21,
        );
        if (String(step.value).includes("heart")) {
          g.fillStyle(0xb65c56);
          g.fillRect(actor.x - 5, actor.y - 36, 4, 4);
          g.fillRect(actor.x + 1, actor.y - 36, 4, 4);
          g.fillTriangle(
            actor.x - 5,
            actor.y - 32,
            actor.x + 5,
            actor.y - 32,
            actor.x,
            actor.y - 27,
          );
        } else {
          g.fillStyle(0x685371);
          g.fillRect(actor.x - 1, actor.y - 37, 2, 6);
          g.fillRect(actor.x - 1, actor.y - 29, 2, 2);
        }
        if (this.stage) this.stage.add(g);
        this.effects.add(g);
        await this.tween(g, { y: -4, alpha: 0 }, 900);
        this.effects.delete(g);
        g.destroy();
        break;
      }
      case "animation": {
        if (step.value === "sleep")
          await this.tween(actor, { angle: -90, y: actor.y + 4 }, 400);
        else
          await this.tween(
            actor,
            {
              y: actor.y - 7,
              yoyo: true,
              repeat: step.value === "celebrate" ? 2 : 0,
            },
            180,
          );
        break;
      }
      case "camera": {
        if (this.stage) {
          const x = 160 - actor.x,
            y = 108 - actor.y;
          await this.tween(
            this.stage,
            {
              x: Phaser.Math.Clamp(x, -40, 40),
              y: Phaser.Math.Clamp(y, -24, 24),
            },
            500,
          );
        } else {
          this.scene.cameras.main.stopFollow();
          this.scene.cameras.main.pan(actor.x, actor.y, 550, "Sine.easeInOut");
          await this.wait(570);
        }
        break;
      }
    }
  }
  async ceremony(kind: CeremonyKind, ids: string[]): Promise<void> {
    await this.end(false);
    await this.present({ type: "fade", value: "out" });
    if (this.disposed) return;
    const stage = this.scene.add
      .container(0, 0)
      .setScrollFactor(0)
      .setDepth(25000);
    this.stage = stage;
    const atlas = this.scene.textures.get("world");
    for (let y = -3; y < 18; y++)
      for (let x = -4; x < 24; x++) {
        const tile = this.scene.add.image(
          x * 16 + 8,
          y * 16 + 8,
          kind === "bloom" ? "world" : "interior_floor",
          kind === "bloom" ? "tile_grass" : undefined,
        );
        stage.add(tile);
      }
    const g = this.scene.add.graphics();
    stage.add(g);
    g.fillStyle(kind === "bloom" ? 0xdec18a : 0xb1869b);
    g.fillRect(145, 65, 30, 175);
    if (kind === "wedding") {
      g.fillStyle(0xeddab0);
      g.fillRect(94, 25, 8, 70);
      g.fillRect(218, 25, 8, 70);
      g.fillRect(94, 25, 132, 9);
      g.fillStyle(0x80ad64);
      for (let x = 94; x < 226; x += 12) {
        g.fillCircle(x, 28, 5);
        g.fillStyle(0xf1d0c3);
        g.fillRect(x - 2, 26, 4, 4);
        g.fillStyle(0x80ad64);
      }
      g.fillStyle(0xa7764b);
      for (let y = 120; y < 225; y += 28) {
        g.fillRect(20, y, 108, 9);
        g.fillRect(192, y, 108, 9);
      }
    } else if (kind === "bloom") {
      const tree = this.scene.add
        .image(160, 88, "world", "tree_0")
        .setOrigin(0.5, 1)
        .setScale(1.5);
      stage.add(tree);
      g.fillStyle(0xf4d66a);
      for (let i = 0; i < 13; i++)
        g.fillRect(134 + ((i * 19) % 52), 20 + ((i * 13) % 40), 3, 3);
    } else {
      g.fillStyle(0xeddab0);
      g.fillRect(8, 8, 304, 28);
      g.fillStyle(0xa7764b);
      g.fillRect(120, 48, 80, 23);
      g.fillStyle(0xdec18a);
      g.fillRect(118, 46, 84, 5);
      g.fillStyle(0x685371);
      for (let x = 24; x < 300; x += 32) g.fillRect(x, 12, 18, 14);
    }
    const s = this.state(),
      spouse = s.relationships.spouse;
    const attendees = [...new Set(ids)].filter(
      (id) => id !== "player" && (kind !== "wedding" || id !== spouse),
    );
    const place = (id: string, x: number, y: number, direction: string) => {
      const source = this.source(id),
        frame = `${id === "player" ? "player" : `npc_${id}`}_${direction}_0`;
      if (id !== "player" && !atlas.has(frame)) return;
      const actor = this.scene.add
        .image(
          x,
          y,
          id === "player" && source ? source.texture.key : "world",
          frame,
        )
        .setOrigin(0.5, 1);
      stage.add(actor);
      this.actors.set(id, actor);
    };
    attendees.slice(0, 24).forEach((id, i) => {
      const column = i % 8,
        row = Math.floor(i / 8);
      place(id, 28 + column * 37 + (column >= 4 ? 5 : 0), 118 + row * 32, "up");
    });
    place(
      "player",
      kind === "wedding" ? 146 : 145,
      kind === "wedding" ? 87 : 215,
      "down",
    );
    if (kind === "wedding" && spouse) place(spouse, 178, 87, "down");
    await this.present({ type: "fade", value: "in" });
  }
  async end(transition = true): Promise<void> {
    if (this.disposed) return;
    if (transition) await this.present({ type: "fade", value: "out" });
    this.stage?.destroy(true);
    this.stage = null;
    for (const actor of this.actors.values()) if (actor.scene) actor.destroy();
    this.actors.clear();
    for (const actor of this.originals.values())
      if (actor.scene) actor.setVisible(true);
    this.originals.clear();
    const player = this.source("player");
    if (player) this.scene.cameras.main.startFollow(player, true, 0.16, 0.16);
    if (transition) await this.present({ type: "fade", value: "in" });
  }
  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    for (const tween of this.tweens) tween.stop();
    for (const timer of this.timers) timer.remove();
    for (const resolve of this.pending) resolve();
    this.pending.clear();
    for (const effect of this.effects) effect.destroy();
    this.effects.clear();
    this.stage?.destroy(true);
    for (const actor of this.actors.values()) if (actor.scene) actor.destroy();
    this.actors.clear();
    for (const actor of this.originals.values())
      if (actor.scene) actor.setVisible(true);
    this.originals.clear();
    this.fade.destroy();
  }
}
