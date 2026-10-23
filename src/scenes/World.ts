import Phaser from "phaser";
import { blobMask, blobFrame, type BlobTerrain } from "../../tools/autotile";
import { Cinematic, type CeremonyKind } from "../render/cinematic";
import type { ScriptStep } from "../systems/events";
import { createDebugOverlay } from "../render/debug-overlay";
import type { Command, GameState } from "../state/game";
import {
  crops,
  maps,
  npcs,
  festivals,
  decor,
  wallpapers,
  floors,
} from "../data/catalog";
import { grassReady } from "../systems/pasture";
import { resolveSchedule } from "../systems/engine";
import { generateMineFloor, type MineLayout } from "../systems/mine";
import { appearanceTexture } from "../render/appearance";
import { Controls } from "../input/controls";
import { findPath, type Tile } from "../input/pathfinding";
import {
  groundAt,
  hash,
  isBlocked,
  layoutFor,
  type Layout,
} from "../render/layout";
export type WorldOptions = {
  keys?: Record<string, string>;
  gamepad?: Record<string, number>;
  reduceFlashes?: boolean;
  debugOverlay?: boolean;
};
export type WorldBridge = {
  options?: () => WorldOptions;
  getState: () => GameState;
  command: (command: Command) => void;
  interact: (target: string) => void;
  ready: () => void;
};
const TILE = 16;
const facingDelta: Record<string, [number, number]> = {
  down: [0, 1],
  up: [0, -1],
  left: [-1, 0],
  right: [1, 0],
};
export class World extends Phaser.Scene {
  public paused = false;
  private bridge: WorldBridge;
  private controls!: Controls;
  private layout!: Layout;
  private mapId = "";
  private mineLayout: MineLayout | null = null;
  private environmentKey = "";
  private glows!: Phaser.GameObjects.Graphics;
  private terrain: Phaser.GameObjects.GameObject[] = [];
  private dynamic: Phaser.GameObjects.GameObject[] = [];
  private waters: Phaser.GameObjects.Image[] = [];
  private waterMasks = new Map<Phaser.GameObjects.Image, number>();
  private waterFrame = -1;
  private nextRefresh = 0;
  private nextCull = 0;
  private cursorKey = "";
  private npcRefreshKey = "";
  private villagers: {
    id: string;
    sprite: Phaser.GameObjects.Image;
    x: number;
    y: number;
    target: Tile;
    route: Tile[];
    direction: string;
  }[] = [];
  private player!: Phaser.GameObjects.Image;
  private cursor!: Phaser.GameObjects.Graphics;
  private weather!: Phaser.GameObjects.Graphics;
  private precipitation!: Phaser.GameObjects.TileSprite;
  private light!: Phaser.GameObjects.Rectangle;
  private nextStep = 0;
  private cinematic!: Cinematic;
  private debugDraw?: (time: number) => void;
  private lastRefresh = "";
  private walkingUntil = 0;
  private toolUntil = 0;
  private avatar = "world";
  private heldTool!: Phaser.GameObjects.Image;
  private mount!: Phaser.GameObjects.Image;
  private route: Tile[] = [];
  private clickGoal: { x: number; y: number } | null = null;
  constructor(bridge: WorldBridge) {
    super("World");
    this.bridge = bridge;
  }
  preload() {
    this.load.atlas(
      "world",
      `${import.meta.env.BASE_URL}assets/atlas.png`,
      `${import.meta.env.BASE_URL}assets/atlas.json`,
    );
  }
  create() {
    for (const kind of ["floor", "wall"]) {
      const texture = this.textures.createCanvas(`interior_${kind}`, 16, 16);
      if (texture) {
        const c = texture.context;
        c.fillStyle = kind === "floor" ? "#c69b60" : "#eddab0";
        c.fillRect(0, 0, 16, 16);
        if (kind === "floor") {
          c.fillStyle = "#dec18a";
          c.fillRect(0, 0, 16, 1);
          c.fillRect(0, 8, 16, 1);
          c.fillStyle = "#a7764b";
          c.fillRect(0, 7, 16, 1);
          c.fillRect(0, 15, 16, 1);
          c.fillRect(10, 0, 1, 8);
          c.fillRect(4, 8, 1, 8);
        } else {
          c.fillStyle = "#dec18a";
          c.fillRect(3, 0, 1, 16);
          c.fillRect(11, 0, 1, 16);
          c.fillStyle = "#a7764b";
          c.fillRect(0, 14, 16, 2);
        }
        texture.refresh();
      }
    }
    for (const kind of ["rain", "snow"]) {
      const texture = this.textures.createCanvas(`weather_${kind}`, 64, 64);
      if (texture) {
        const c = texture.context;
        c.fillStyle = kind === "rain" ? "#91cbd1" : "#f5f7e7";
        for (const [x, y] of [
          [5, 8],
          [21, 37],
          [42, 21],
          [58, 55],
        ]) {
          if (kind === "snow") c.fillRect(x!, y!, 2, 2);
          else
            for (let k = 0; k < 6; k++)
              c.fillRect(x! - Math.floor(k / 3), y! + k, 1, 1);
        }
        texture.refresh();
      }
    }
    this.controls = new Controls(
      this,
      () => this.bridge.options?.().keys ?? {},
      () => this.bridge.options?.().gamepad ?? {},
    );
    this.player = this.add
      .image(0, 0, "world", "player_down_0")
      .setOrigin(0.5, 1);
    this.mount = this.add
      .image(0, 0, "world", this.frame("animal_horse_0"))
      .setOrigin(0.5, 1)
      .setVisible(false);
    this.heldTool = this.add
      .image(0, 0, "world", this.frame("tool_hoe"))
      .setOrigin(0.25, 0.85)
      .setVisible(false);
    this.cursor = this.add.graphics().setDepth(9000);
    this.glows = this.add.graphics().setDepth(10010);
    this.weather = this.add.graphics().setScrollFactor(0).setDepth(11000);
    this.precipitation = this.add
      .tileSprite(160, 120, 320, 240, "weather_rain")
      .setScrollFactor(0)
      .setDepth(11000)
      .setAlpha(0.65)
      .setVisible(false);
    this.light = this.add
      .rectangle(160, 120, 320, 240, 0x302d57, 0)
      .setScrollFactor(0)
      .setDepth(10000);
    this.cameras.main.setRoundPixels(true);
    this.cameras.main.startFollow(this.player, true, 0.16, 0.16);
    this.loadMap();
    this.input.on("pointerdown", (pointer: Phaser.Input.Pointer) => {
      if (this.paused) return;
      const p = this.cameras.main.getWorldPoint(pointer.x, pointer.y);
      const x = Math.floor(p.x / TILE),
        y = Math.floor(p.y / TILE),
        s = this.bridge.getState();
      if (Math.abs(x - s.player.x) + Math.abs(y - s.player.y) <= 2)
        this.action(x, y);
      else {
        this.clickGoal = { x, y };
        this.route = findPath(
          s.player,
          { x, y },
          this.layout.width,
          this.layout.height,
          (tx, ty) => this.blocked(tx, ty),
        );
      }
    });
    if (import.meta.env.DEV)
      this.debugDraw = createDebugOverlay(this, () => {
        const s = this.bridge.getState();
        return {
          enabled: Boolean(this.bridge.options?.().debugOverlay),
          width: this.layout.width,
          height: this.layout.height,
          blocked: (x: number, y: number) => this.blocked(x, y),
          paths: [
            { x: s.player.x, y: s.player.y, route: this.route },
            ...this.villagers.map((v) => ({ x: v.x, y: v.y, route: v.route })),
          ],
          triggers: [
            ...this.layout.landmarks,
            ...this.layout.exits,
            ...(this.mineLayout ? [this.mineLayout.ladder] : []),
          ],
        };
      });
    this.cinematic = new Cinematic(
      this,
      () => this.bridge.getState(),
      (id) =>
        id === "player"
          ? this.player
          : this.villagers.find((v) => v.id === id)?.sprite,
    );
    this.bridge.ready();
  }
  private blocked(x: number, y: number): boolean {
    return this.mineLayout
      ? this.mineLayout.tiles[y]?.[x] === undefined ||
          this.mineLayout.tiles[y]?.[x] === "wall"
      : isBlocked(this.mapId, x, y, this.layout);
  }
  public disposePresentation(): void {
    this.cinematic?.dispose();
  }
  public present(step: ScriptStep): Promise<void> {
    return this.cinematic.present(step);
  }
  public ceremony(kind: CeremonyKind, speakers: string[]): Promise<void> {
    return this.cinematic.ceremony(kind, speakers);
  }
  public endCeremony(): Promise<void> {
    return this.cinematic.end();
  }
  public toggleRun() {
    this.controls.toggleRun();
  }
  public useAction() {
    if (!this.paused && this.player) this.action();
  }
  public moveDirection(dx: number, dy: number) {
    if (this.paused || !this.player) return;
    dx = Math.sign(dx);
    dy = dx ? 0 : Math.sign(dy);
    if (!dx && !dy) return;
    const s = this.bridge.getState();
    if (!this.blocked(s.player.x + dx, s.player.y + dy)) {
      this.bridge.command({ type: "move", dx, dy });
      this.walkingUntil = this.time.now + 160;
    } else {
      this.bridge.command({
        type: "face",
        direction: dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down",
      });
      this.clickGoal = null;
    }
  }
  private frame(name: string, fallback = "tile_grass") {
    return this.textures.get("world").has(name) ? name : fallback;
  }
  private sprite(x: number, y: number, frame: string, depth = 0, origin = 1) {
    const image = this.add
      .image(x, y, "world", this.frame(frame))
      .setOrigin(0.5, origin)
      .setDepth(depth);
    this.terrain.push(image);
    return image;
  }
  private environmentSignature(s: GameState): string {
    return JSON.stringify([
      s.player.map,
      s.day,
      s.mine.floor,
      s.mine.broken.length,
      s.mine.ladder,
      s.buildings,
      s.construction,
      ...[
        "arc_marta_inn",
        "marta_inn_coop",
        "arc_ivy_bakery",
        "arc_sable_gallery",
        "arc_halverd_choice",
        "halverd_choice_stay",
      ].map((flag) => s.flags[flag]),
    ]);
  }
  private storyPlaces(state: GameState) {
    if (this.mapId === "inn" && state.flags.arc_marta_inn) {
      const g = this.add.graphics().setDepth(-0.7);
      g.fillStyle(state.flags.marta_inn_coop ? 0x849897 : 0xb1869b);
      g.fillRect(5 * 16, 7 * 16, 13 * 16, 6 * 16);
      g.lineStyle(1, 0xeddab0);
      g.strokeRect(5 * 16 + 3, 7 * 16 + 3, 13 * 16 - 6, 6 * 16 - 6);
      this.terrain.push(g);
      if (state.flags.marta_inn_coop) {
        for (let x = 7; x <= 16; x += 3) {
          this.sprite(x * 16 + 8, 10 * 16, "decor_honeywood_table", 160);
          this.sprite(x * 16 + 8, 12 * 16, "decor_willow_chair", 192);
        }
      } else {
        this.sprite(7 * 16 + 8, 10 * 16, "decor_patchwork_sofa", 160);
        this.sprite(16 * 16 + 8, 10 * 16, "decor_patchwork_sofa", 160);
        this.sprite(12 * 16 + 8, 10 * 16, "decor_honeywood_table", 160);
      }
      for (let x = 5; x <= 18; x += 13)
        this.sprite(x * 16 + 8, 7 * 16, "flower_0", 112);
    }
    if (this.mapId === "store" && state.flags.arc_ivy_bakery) {
      const g = this.add.graphics().setDepth(7 * 16);
      g.fillStyle(0x493b36);
      g.fillRect(14 * 16, 4 * 16, 48, 40);
      g.fillStyle(0xb65c56);
      g.fillRect(14 * 16 + 2, 4 * 16 + 2, 44, 34);
      g.fillStyle(0x34364b);
      g.fillRect(14 * 16 + 9, 4 * 16 + 12, 29, 19);
      g.fillStyle(0xdc7d61);
      g.fillRect(14 * 16 + 12, 4 * 16 + 25, 23, 4);
      g.fillStyle(0xc69b60);
      g.fillRect(13 * 16, 7 * 16, 80, 16);
      g.fillStyle(0xeddab0);
      for (let loaf = 0; loaf < 5; loaf++) {
        const x = 13 * 16 + 4 + loaf * 15;
        g.fillRoundedRect(x, 7 * 16 + 2, 12, 7, 3);
        g.lineStyle(1, 0xa7764b);
        g.lineBetween(x + 3, 7 * 16 + 3, x + 5, 7 * 16 + 6);
        g.lineBetween(x + 7, 7 * 16 + 3, x + 9, 7 * 16 + 6);
      }
      this.terrain.push(g);
    }
    if (this.mapId === "townhall" && state.flags.arc_sable_gallery) {
      for (const [index, npc] of npcs.slice(0, 21).entries()) {
        const x = (3 + (index % 7) * 3) * 16 + 8,
          y = (5 + Math.floor(index / 7) * 4) * 16;
        const g = this.add.graphics().setDepth(y);
        g.fillStyle(0x493b36);
        g.fillRect(x - 14, y - 27, 28, 28);
        g.fillStyle(0xdec18a);
        g.fillRect(x - 13, y - 26, 26, 26);
        this.terrain.push(g);
        this.sprite(x, y, `portrait_${npc.id}_neutral`, y + 1).setScale(0.5);
      }
    }
    if (
      this.mapId === "townhall" &&
      state.flags.arc_halverd_choice &&
      state.flags.halverd_choice_stay
    ) {
      this.sprite(18 * 16 + 8, 16 * 16, "desk", 256);
      const g = this.add.graphics().setDepth(257);
      g.fillStyle(0xeddab0);
      g.fillRect(18 * 16 - 4, 16 * 16 - 19, 24, 13);
      g.lineStyle(1, 0x849897);
      g.lineBetween(18 * 16 - 2, 16 * 16 - 15, 18 * 16 + 17, 16 * 16 - 11);
      g.lineBetween(18 * 16 + 4, 16 * 16 - 17, 18 * 16 + 7, 16 * 16 - 8);
      g.lineStyle(1, 0xd8b34d);
      g.strokeCircle(18 * 16 + 13, 16 * 16 - 14, 3);
      this.terrain.push(g);
    }
  }
  private loadMap() {
    this.terrain.forEach((o) => o.destroy());
    this.dynamic.forEach((o) => o.destroy());
    this.villagers.forEach((v) => v.sprite.destroy());
    this.terrain = [];
    this.dynamic = [];
    this.waters = [];
    this.waterMasks.clear();
    this.waterFrame = -1;
    this.npcRefreshKey = "";
    this.nextRefresh = 0;
    this.nextCull = 0;
    this.villagers = [];
    const state = this.bridge.getState();
    this.mapId = state.player.map;
    this.environmentKey = this.environmentSignature(state);
    this.mineLayout =
      this.mapId === "mine"
        ? generateMineFloor(state.seed, state.day, state.mine.floor)
        : null;
    const definition = maps.find((m) => m.id === this.mapId);
    this.layout = layoutFor(
      this.mapId,
      definition?.width ?? 40,
      definition?.height ?? 32,
      definition?.kind === "indoor",
      definition?.connections ?? ["square"],
      state.buildings,
    );
    if (this.mineLayout) {
      this.layout = {
        width: this.mineLayout.width,
        height: this.mineLayout.height,
        indoor: true,
        landmarks: [],
        exits: [{ ...this.mineLayout.entrance, map: "mountain" }],
      };
    }
    this.avatar = appearanceTexture(this, state.player.appearance);
    this.player.setTexture(this.avatar, "player_down_0");
    const { width, height, indoor } = this.layout;
    const grassTint =
      [0xffffff, 0xe7f1bd, 0xe8bf83, 0xdce9ef][
        Math.floor((state.day % 120) / 30)
      ] ?? 0xffffff;
    for (let y = 0; y < height; y++)
      for (let x = 0; x < width; x++) {
        const originalCave = this.mineLayout?.tiles[y]?.[x];
        const cave =
          originalCave === "ladder"
            ? state.mine.ladder
              ? "ladder"
              : "rock"
            : state.mine.broken.includes(`${x},${y}`)
              ? "floor"
              : originalCave;
        const ground = cave
          ? cave === "wall"
            ? "tile_stone"
            : "tile_soil"
          : groundAt(this.mapId, x, y, this.layout);
        const image = this.sprite(
          x * 16 + 8,
          y * 16 + 8,
          ground === "wall"
            ? "tile_stone"
            : ground === "floor"
              ? "tile_path"
              : ground,
          -2,
          0.5,
        );
        if (!cave && ground === "floor") image.setTexture("interior_floor");
        if (!cave && ground === "wall") image.setTexture("interior_wall");
        if (cave) {
          image.setTint(
            cave === "wall"
              ? 0x53516c
              : this.mineLayout?.crystal
                ? 0x929bb4
                : 0x998787,
          );
          if (
            cave === "wall" &&
            this.mineLayout?.tiles[y + 1]?.[x] &&
            this.mineLayout.tiles[y + 1]?.[x] !== "wall"
          ) {
            const edge = this.add.graphics().setDepth(-1);
            edge.fillStyle(0x424253);
            edge.fillRect(x * 16, y * 16 + 10, 16, 6);
            edge.fillStyle(0x686477);
            edge.fillRect(x * 16, y * 16 + 9, 16, 2);
            edge.fillStyle(0x323344);
            edge.fillRect(x * 16 + 3, y * 16 + 12, 1, 4);
            edge.fillRect(x * 16 + 11, y * 16 + 11, 1, 3);
            this.terrain.push(edge);
          }
          if (cave === "rock" || cave === "ore" || cave === "gem") {
            const rock = this.sprite(
              x * 16 + 8,
              (y + 1) * 16,
              "rock",
              y * 16 + 16,
            );
            if (cave !== "rock")
              rock.setTint(cave === "gem" ? 0xb7d5ef : 0xd4aa6b);
          }
          if (cave === "ladder" || cave === "chest") {
            const g = this.add.graphics().setDepth(y * 16 + 16);
            g.fillStyle(0x352e43);
            g.fillRect(x * 16 + 2, y * 16 + 1, 12, 14);
            g.lineStyle(2, cave === "chest" ? 0xc9b26d : 0xb08c60);
            g.lineBetween(x * 16 + 4, y * 16 + 2, x * 16 + 4, y * 16 + 14);
            g.lineBetween(x * 16 + 12, y * 16 + 2, x * 16 + 12, y * 16 + 14);
            for (let rung = 4; rung < 14; rung += 4)
              g.lineBetween(
                x * 16 + 4,
                y * 16 + rung,
                x * 16 + 12,
                y * 16 + rung,
              );
            if (cave === "chest") {
              g.clear();
              g.fillStyle(0x352e43);
              g.fillRect(x * 16 + 1, y * 16 + 3, 14, 12);
              g.fillStyle(0x9b744c);
              g.fillRect(x * 16 + 2, y * 16 + 4, 12, 9);
              g.fillStyle(0xd5b772);
              g.fillRect(x * 16 + 2, y * 16 + 7, 12, 2);
              g.fillRect(x * 16 + 7, y * 16 + 7, 3, 4);
            }
            this.terrain.push(g);
          }
        }
        if (ground === "tile_grass")
          image
            .setTint(grassTint)
            .setFrame(this.frame(`tile_grass_${hash(x, y) % 4}`, "tile_grass"));
        if (!cave) {
          const kind: BlobTerrain | undefined =
            ground === "tile_grass"
              ? Math.floor((state.day % 120) / 30) === 3
                ? "snow"
                : "grass"
              : ground === "tile_path"
                ? "dirt"
                : ground === "tile_water_0"
                  ? "water"
                  : ground === "tile_sand"
                    ? "sand"
                    : undefined;
          if (kind) {
            const mask = blobMask(
              (tx, ty) => groundAt(this.mapId, tx, ty, this.layout) === ground,
              x,
              y,
            );
            image.setFrame(
              this.frame(blobFrame(kind, mask), String(image.frame.name)),
            );
            if (kind === "water") this.waterMasks.set(image, mask);
          }
        }
        if (ground === "tile_water_0") this.waters.push(image);
        const h = hash(x, y);
        if (ground === "tile_grass" && !indoor) {
          if (h % 19 === 0)
            this.sprite(x * 16 + 8, y * 16 + 16, `flower_${h % 8}`, y * 16 + 1);
          if (h % 31 === 0) {
            const g = this.add.graphics().setDepth(-1);
            g.fillStyle(0x78aa58, 0.65);
            g.fillRect(x * 16 + 3, y * 16 + 4, 1, 3);
            g.fillRect(x * 16 + 5, y * 16 + 3, 1, 4);
            g.fillRect(x * 16 + 11, y * 16 + 11, 1, 2);
            this.terrain.push(g);
          }
          const edge = x < 3 || y < 3 || x > width - 4 || y > height - 4;
          const grove =
            this.mapId === "farm"
              ? (x < 5 && y > 5) || (x > 21 && x < 27 && y > 12)
              : this.mapId === "forest" ||
                this.mapId === "hilltop" ||
                this.mapId === "mountain";
          const nearBuilding = this.layout.landmarks.some(
            (p) => Math.abs(p.x - x) < 5 && y >= p.y - 4 && y <= p.y + 2,
          );
          if (
            !nearBuilding &&
            ((edge && h % 3 === 0) || (grove && h % 13 === 0))
          )
            this.sprite(
              x * 16 + 8,
              y * 16 + 16,
              `tree_${Math.floor((state.day % 120) / 30)}`,
              y * 16 + 16,
            );
          else if (h % 61 === 0)
            this.sprite(x * 16 + 8, y * 16 + 16, "bush", y * 16 + 15);
        }
      }
    // One cached GPU surface replaces thousands of static ground display objects.
    const animated = new Set(this.waters);
    const base = this.terrain.filter(
      (
        object,
      ): object is Phaser.GameObjects.Image | Phaser.GameObjects.Graphics =>
        (object instanceof Phaser.GameObjects.Image ||
          object instanceof Phaser.GameObjects.Graphics) &&
        object.depth < 0 &&
        !animated.has(object as Phaser.GameObjects.Image),
    );
    if (base.length) {
      base.sort((a, b) => a.depth - b.depth);
      const surface = this.add
        .renderTexture(0, 0, width * 16, height * 16)
        .setOrigin(0)
        .setDepth(-2);
      surface.draw(base);
      surface.render();
      const baked = new Set<Phaser.GameObjects.GameObject>(base);
      this.terrain = this.terrain.filter((o) => !baked.has(o));
      base.forEach((o) => o.destroy());
      this.terrain.push(surface);
    }
    if (this.mapId === "farm") {
      for (let x = 5; x <= 23; x++)
        if (x !== 8 && x !== 9 && x !== 19 && x !== 20)
          this.sprite(x * 16 + 8, 11 * 16 + 8, "fence", 184);
      for (let x = 5; x < 18; x++)
        this.sprite(x * 16 + 8, 23 * 16, "fence", 368);
      for (let y = 12; y < 23; y++)
        this.sprite(5 * 16 + 8, y * 16 + 8, "fence", y * 16 + 8);
      // Orchard crowns and little flower beds frame the yard without covering the work area.
      for (let x = 14; x <= 17; x++)
        for (let y = 4; y <= 5; y++)
          this.sprite(
            x * 16 + 8,
            y * 16 + 16,
            `flower_${(x + y) % 8}`,
            y * 16 + 16,
          );
    }
    for (const landmark of this.layout.landmarks) {
      const exists = this.textures.get("world").has(landmark.frame);
      if (exists)
        this.sprite(
          landmark.x * 16 + 8,
          (landmark.y + 1) * 16,
          landmark.frame,
          (landmark.y + 1) * 16,
        );
      else this.furniture(landmark.x, landmark.y, landmark.frame);
    }
    for (const exit of this.layout.exits) {
      const marker = this.add.graphics().setDepth(exit.y * 16 + 2);
      marker.fillStyle(0x856045);
      marker.fillRect(exit.x * 16 + 7, exit.y * 16 - 6, 2, 17);
      marker.fillStyle(0xd7b681);
      marker.fillRect(exit.x * 16 + 1, exit.y * 16 - 8, 15, 7);
      marker.fillStyle(0x6b473b);
      marker.fillRect(exit.x * 16 + 6, exit.y * 16 - 5, 6, 1);
      marker.fillRect(exit.x * 16 + 10, exit.y * 16 - 6, 1, 3);
      this.terrain.push(marker);
    }
    if (this.mapId === "farm")
      for (const id of Object.keys(state.construction)) {
        const x = id.startsWith("house") ? 8 : id === "greenhouse" ? 22 : 20,
          y = id.startsWith("house") ? 5 : id === "greenhouse" ? 19 : 7;
        const g = this.add.graphics().setDepth(y * 16 + 17);
        g.lineStyle(2, 0xcba16b);
        g.strokeRect(x * 16 - 43, y * 16 - 51, 88, 67);
        g.lineBetween(x * 16 - 43, y * 16 - 22, x * 16 + 45, y * 16 - 22);
        g.lineBetween(x * 16 - 43, y * 16 + 16, x * 16 + 45, y * 16 - 51);
        g.fillStyle(0xa88961);
        g.fillRect(x * 16 - 47, y * 16 - 26, 96, 5);
        this.terrain.push(g);
      }
    const season = ["spring", "summer", "autumn", "winter"][
      Math.floor((state.day % 120) / 30)
    ];
    const festival = festivals.find(
      (f) =>
        f.season === season &&
        f.day === (state.day % 30) + 1 &&
        (f.id !== "lantern_bloom_vigil" || state.flags.bloom),
    );
    if (festival && ["square", "market", "hilltop"].includes(this.mapId)) {
      const flags = this.add.graphics().setDepth(1000);
      flags.lineStyle(1, 0x785b4a);
      flags.lineBetween(5 * 16, 7 * 16, 26 * 16, 7 * 16);
      for (let i = 0; i < 19; i++) {
        flags.fillStyle(
          [0xd6a469, 0xa9b876, 0xa77678, 0x85b2b2][i % 4] ?? 0xd6a469,
        );
        flags.fillTriangle(
          (5 + i) * 16,
          7 * 16,
          (5 + i) * 16 + 10,
          7 * 16,
          (5 + i) * 16 + 5,
          7 * 16 + 9,
        );
      }
      this.terrain.push(flags);
    }
    this.storyPlaces(state);
    this.player.setPosition(state.player.x * 16 + 8, (state.player.y + 1) * 16);
    this.cameras.main.setBounds(0, 0, width * 16, height * 16);
    this.cameras.main.centerOn(this.player.x, this.player.y);
    this.lastRefresh = "";
    this.clickGoal = null;
  }
  private furniture(x: number, y: number, kind: string) {
    const g = this.add.graphics().setDepth((y + 1) * 16);
    const px = x * 16,
      py = y * 16;
    g.fillStyle(0x493c42);
    g.fillRect(px - 17, py - 22, 36, 39);
    g.fillStyle(0xb78052);
    g.fillRect(px - 15, py - 20, 32, 33);
    if (kind === "bed") {
      g.fillStyle(0xf2e5c0);
      g.fillRect(px - 12, py - 17, 26, 8);
      g.fillStyle(0x799ca3);
      g.fillRect(px - 12, py - 6, 26, 19);
      g.fillStyle(0xa9c8b3);
      g.fillRect(px - 9, py - 3, 20, 3);
    } else if (kind === "tv") {
      g.fillStyle(0x394b58);
      g.fillRect(px - 12, py - 16, 26, 19);
      g.fillStyle(0x90c4b4);
      g.fillRect(px - 9, py - 13, 19, 13);
    } else {
      g.fillStyle(0xe8d9ab);
      g.fillRect(px - 9, py - 16, 13, 10);
      g.fillStyle(0x83694e);
      g.fillRect(px - 7, py - 13, 8, 1);
      g.fillRect(px - 7, py - 10, 6, 1);
    }
    this.terrain.push(g);
  }
  private refresh() {
    if (this.time.now < this.nextRefresh) return;
    this.nextRefresh = this.time.now + 100;
    const state = this.bridge.getState();
    const visiblePlots = Object.entries(state.plots).filter(([, plot]) =>
      this.nearCamera(plot.x, plot.y),
    );
    const visibleDebris = Object.entries(state.debris).filter(([key]) => {
      const [x, y] = key.split(",").map(Number);
      return x !== undefined && y !== undefined && this.nearCamera(x, y);
    });
    const signature = JSON.stringify([
      Math.floor(this.cameras.main.scrollX / 32),
      Math.floor(this.cameras.main.scrollY / 32),
      visiblePlots,
      visibleDebris,
      state.animals,
      state.trees,
      state.decorations,
      state.relationships,
      state.flags.riding,
      state.flags.horse,
      state.day,
      state.weather,
      Object.keys(state.flags)
        .filter((key) => /^grass_\d+_\d+$/.test(key) && state.flags[key])
        .map((key) => [
          key,
          state.collections[key.replace("grass_", "grass_ready_")],
        ]),
    ]);
    if (signature === this.lastRefresh) return;
    this.lastRefresh = signature;
    this.dynamic.forEach((o) => o.destroy());
    this.dynamic = [];
    const add = (x: number, y: number, frame: string) => {
      const o = this.add
        .image(x * 16 + 8, (y + 1) * 16, "world", this.frame(frame))
        .setOrigin(0.5, 1)
        .setDepth((y + 1) * 16);
      this.dynamic.push(o);
      return o;
    };
    if (this.mapId === "farm")
      for (const key of Object.keys(state.flags)) {
        if (!/^grass_\d+_\d+$/.test(key) || !state.flags[key]) continue;
        const [, sx, sy] = key.split("_"),
          x = Number(sx),
          y = Number(sy),
          mature = grassReady(state, x, y),
          winter = Math.floor((state.day % 120) / 30) === 3;
        if (!this.nearCamera(x, y)) continue;
        const g = this.add.graphics().setDepth(y * 16 + 12);
        g.fillStyle(winter ? 0xa6b8b0 : mature ? 0x427b50 : 0xa7764b);
        g.fillRect(x * 16 + 2, y * 16 + 10, 12, 4);
        for (let tuft = 0; tuft < 5; tuft++) {
          const px = x * 16 + 2 + tuft * 3,
            py = y * 16 + 12 - (tuft % 2) * 3,
            height = mature ? 6 + (tuft % 3) : 2;
          g.fillStyle(winter ? 0xc8d3c6 : mature ? 0x80ad64 : 0x5b9557);
          g.fillRect(px, py - height, 1, height);
          if (mature) {
            g.fillRect(px - 1, py - height + 1, 1, 2);
            g.fillStyle(0xa8c776);
            g.fillRect(px + 1, py - height - 1, 1, 3);
          }
        }
        this.dynamic.push(g);
      }
    if (this.mapId === "farm" || this.mapId === "greenhouse") {
      for (const [key, plot] of visiblePlots) {
        if (!this.nearCamera(plot.x, plot.y)) continue;
        if (
          key.startsWith("g:") !== (this.mapId === "greenhouse") ||
          !plot.tilled
        )
          continue;
        const mask = blobMask(
          (x, y) =>
            Boolean(
              state.plots[`${this.mapId === "greenhouse" ? "g:" : ""}${x},${y}`]
                ?.tilled,
            ),
          plot.x,
          plot.y,
        );
        const soil = add(
          plot.x,
          plot.y,
          plot.watered
            ? this.frame(`blob_watered_${mask}`, "tile_watered")
            : this.frame(blobFrame("tilled", mask), "tile_tilled"),
        );
        soil.setDepth(-0.5);
        if (plot.crop) {
          const crop = crops.find((c) => c.id === plot.crop);
          const stage = Math.min(
            5,
            Math.floor((plot.growth / (crop?.growDays ?? 5)) * 5),
          );
          const plant = add(plot.x, plot.y, `crop_${plot.crop}_${stage}`);
          if (plot.withered) plant.setTint(0x987a55);
        }
      }
      for (const [key, debris] of visibleDebris) {
        if (this.mapId !== "farm") continue;
        const [x, y] = key.split(",").map(Number);
        if (x !== undefined && y !== undefined && this.nearCamera(x, y))
          add(
            x,
            y,
            debris === "weed"
              ? "bush"
              : debris === "stone" || debris === "boulder"
                ? "rock"
                : "stump",
          );
      }
      if (this.mapId === "farm")
        for (const tree of state.trees)
          add(
            tree.x,
            tree.y,
            `tree_${tree.id}_${tree.age < 28 ? "sapling" : tree.fruit ? "fruit" : "mature"}`,
          );
    }
    if (["farm", "barn", "coop", "ranch"].includes(this.mapId))
      state.animals.forEach((animal, i) => {
        add(
          20 + (i % 5),
          12 + Math.floor(i / 5) * 2,
          `animal_${animal.kind}_0`,
        );
      });
    if (this.mapId === "farm") {
      add(11, 8, `animal_${state.player.petType}_0`);
      if (state.flags.horse && !state.flags.riding)
        add(17, 9, "animal_horse_0");
    }
    for (const placed of state.decorations) {
      const definition = decor.find((d) => d.id === placed.id);
      if (!definition) continue;
      const outdoor = definition.outdoor;
      if (
        (outdoor && this.mapId === "farm") ||
        (!outdoor && this.mapId === "farmhouse")
      ) {
        const item = add(
          placed.x + (outdoor ? 0 : 2),
          placed.y + (outdoor ? 0 : 6),
          `decor_${placed.id}`,
        );
        item.setAngle(placed.rotation * 90);
      }
    }
    if (this.mapId === "farmhouse") {
      const wallpaper = state.decorations
          .filter((p) => wallpapers.some((w) => w.id === p.id))
          .at(-1),
        floor = state.decorations
          .filter((p) => floors.some((f) => f.id === p.id))
          .at(-1);
      for (const placed of [wallpaper, floor])
        if (placed) {
          const index = [...wallpapers, ...floors].findIndex(
            (d) => d.id === placed.id,
          );
          const g = this.add.graphics().setDepth(-0.8);
          g.fillStyle(
            [0xd5b89d, 0x98ad95, 0xaaa1bd, 0xc4bb8b][index % 4] ?? 0xc4bb8b,
            0.28,
          );
          if (placed === floor)
            g.fillRect(
              32,
              80,
              (this.layout.width - 4) * 16,
              (this.layout.height - 7) * 16,
            );
          else g.fillRect(32, 32, (this.layout.width - 4) * 16, 48);
          this.dynamic.push(g);
        }
      if (state.relationships.child)
        add(7, 7, `child_stage${Math.min(2, state.relationships.child.stage)}`);
    }
  }

  private nearCamera(x: number, y: number): boolean {
    const camera = this.cameras.main;
    return (
      x * 16 > camera.scrollX - 64 &&
      x * 16 < camera.scrollX + 384 &&
      y * 16 > camera.scrollY - 64 &&
      y * 16 < camera.scrollY + 304
    );
  }
  private cullScenery(time: number): void {
    if (time < this.nextCull) return;
    this.nextCull = time + 100;
    const camera = this.cameras.main,
      left = camera.scrollX - 32,
      top = camera.scrollY - 64,
      right = camera.scrollX + 352,
      bottom = camera.scrollY + 304;
    for (const o of this.terrain)
      if (o instanceof Phaser.GameObjects.Image) {
        const x = o.x - o.displayWidth * o.originX,
          y = o.y - o.displayHeight * o.originY;
        o.setVisible(
          x + o.displayWidth >= left &&
            x <= right &&
            y + o.displayHeight >= top &&
            y <= bottom,
        );
      }
  }
  private refreshNPCs(): void {
    const state = this.bridge.getState();
    const key = [
      this.mapId,
      state.day,
      state.minute,
      state.weather,
      state.relationships.spouse,
      state.flags.wren_returned,
      state.flags.halverd_resigned,
    ].join(":");
    if (key === this.npcRefreshKey) return;
    this.npcRefreshKey = key;
    const previous = new Map(
      this.villagers.map((v) => [
        v.id,
        { ...v, px: v.sprite.x, py: v.sprite.y },
      ]),
    );
    this.villagers.forEach((v) => v.sprite.destroy());
    this.villagers = [];
    const add = (x: number, y: number, frame: string) =>
      this.add
        .image(x * 16 + 8, (y + 1) * 16, "world", this.frame(frame))
        .setOrigin(0.5, 1)
        .setDepth((y + 1) * 16);
    for (const npc of npcs) {
      const schedule = resolveSchedule(state, npc.id);
      if (schedule?.map !== this.mapId) continue;
      let target: Tile | undefined;
      for (let radius = 0; radius < 8 && !target; radius++)
        for (let oy = -radius; oy <= radius && !target; oy++)
          for (let ox = -radius; ox <= radius; ox++) {
            const x = Math.max(
                1,
                Math.min(this.layout.width - 2, schedule.x + ox),
              ),
              y = Math.max(
                1,
                Math.min(this.layout.height - 2, schedule.y + oy),
              );
            if (!this.blocked(x, y)) {
              target = { x, y };
              break;
            }
          }
      if (!target) continue;
      const prior = previous.get(npc.id),
        x = prior?.x ?? target.x,
        y = prior?.y ?? target.y;
      const sprite = add(x, y, `npc_${npc.id}_${prior?.direction ?? "down"}_0`);
      if (prior) sprite.setPosition(prior.px, prior.py);
      const sameTarget =
        prior?.target.x === target.x && prior?.target.y === target.y;
      const route = sameTarget
        ? prior.route
        : findPath(
            { x, y },
            target,
            this.layout.width,
            this.layout.height,
            (tx, ty) => this.blocked(tx, ty),
          );
      this.villagers.push({
        id: npc.id,
        sprite,
        x,
        y,
        target,
        route,
        direction: prior?.direction ?? "down",
      });
    }
  }

  private action(x?: number, y?: number) {
    const s = this.bridge.getState();
    const [dx, dy] = facingDelta[s.player.facing] ?? [0, 1];
    const tx = x ?? s.player.x + dx,
      ty = y ?? s.player.y + dy;
    if (
      this.mapId === "farm" &&
      s.flags.horse &&
      (s.flags.riding || Math.abs(tx - 17) + Math.abs(ty - 9) <= 1)
    ) {
      this.bridge.interact("horse");
      return;
    }
    if (
      this.mapId === "farm" &&
      s.trees.some((tree) => tree.x === tx && tree.y === ty && tree.fruit)
    ) {
      this.bridge.command({ type: "harvest", x: tx, y: ty });
      this.toolEffect(tx, ty);
      return;
    }
    const npc = this.villagers.find(
      (n) => Math.abs(n.x - tx) + Math.abs(n.y - ty) <= 1,
    );
    if (npc) {
      this.bridge.interact(`npc:${npc.id}`);
      return;
    }
    const landmark = this.layout.landmarks.find(
      (p) =>
        Math.abs(p.x - tx) <= Math.max(1, (p.width ?? 1) / 2) &&
        Math.abs(p.y - ty) <= 1,
    );
    if (landmark?.target) {
      this.bridge.interact(landmark.target);
      return;
    }
    const exit = this.layout.exits.find(
      (p) =>
        Math.abs(p.x - tx) + Math.abs(p.y - ty) <= (this.mineLayout ? 0 : 1),
    );
    if (exit) {
      if (this.mineLayout)
        this.bridge.command({ type: "mine", action: "exit" });
      else this.bridge.interact(`warp:${exit.map}`);
      return;
    }
    if (groundAt(this.mapId, tx, ty, this.layout) === "tile_water_0") {
      this.bridge.interact("fish");
      return;
    }
    if (this.mapId === "mine") {
      const tile = this.mineLayout?.tiles[ty]?.[tx];
      if (tile === "ladder" && s.mine.ladder)
        this.bridge.command({ type: "mine", action: "descend" });
      else if (
        tile &&
        ["rock", "ore", "gem", "ladder"].includes(tile) &&
        !s.mine.broken.includes(`${tx},${ty}`)
      ) {
        this.bridge.command({ type: "mine", action: "break", x: tx, y: ty });
        this.toolEffect(tx, ty);
      } else this.bridge.interact("mine");
      return;
    }
    this.bridge.command({ type: "use", x: tx, y: ty });
    this.toolEffect(tx, ty);
  }
  private toolEffect(x: number, y: number) {
    this.toolUntil = this.time.now + 420;
    const g = this.add.graphics().setDepth(9100);
    g.lineStyle(2, 0xffe9ad, 0.9);
    g.strokeCircle(x * 16 + 8, y * 16 + 8, 7);
    for (let i = 0; i < 5; i++) {
      g.fillStyle(i % 2 ? 0xb8d7bc : 0xf6df9c);
      g.fillRect(x * 16 + i * 4 - 2, y * 16 - (i % 3) * 3, 2, 2);
    }
    this.tweens.add({
      targets: g,
      alpha: 0,
      y: -8,
      duration: 320,
      onComplete: () => g.destroy(),
    });
  }
  update(time: number, delta: number) {
    if (!this.player) return;
    if (import.meta.env.DEV) this.debugDraw?.(time);
    const s = this.bridge.getState();
    if (this.environmentSignature(s) !== this.environmentKey) this.loadMap();
    this.refresh();
    this.refreshNPCs();
    this.cullScenery(time);
    if (!this.paused) {
      const running = this.controls.running(s.settings.runToggle);
      if (this.controls.padPressed("inventory", 3))
        this.bridge.interact("storage");
      if (this.controls.padPressed("journal", 8))
        this.bridge.interact("journal");
      if (this.controls.padPressed("cancel", 9)) this.bridge.interact("menu");
      const nextTool = this.controls.padPressed("nextTool", 5),
        previousTool = this.controls.padPressed("previousTool", 4);
      if (nextTool || previousTool) {
        const tools = Object.keys(s.tools),
          index = tools.indexOf(s.equipped),
          tool =
            tools[(index + (nextTool ? 1 : tools.length - 1)) % tools.length];
        if (tool) this.bridge.command({ type: "equip", tool });
      }
      let [dx, dy] = this.controls.direction();
      if (dx || dy) this.clickGoal = null;
      else if (this.clickGoal) {
        const gx = this.clickGoal.x - s.player.x,
          gy = this.clickGoal.y - s.player.y;
        if (Math.abs(gx) + Math.abs(gy) <= 1) {
          this.action(this.clickGoal.x, this.clickGoal.y);
          this.clickGoal = null;
        } else {
          while (
            this.route[0]?.x === s.player.x &&
            this.route[0]?.y === s.player.y
          )
            this.route.shift();
          const next = this.route[0];
          if (next) {
            dx = Math.sign(next.x - s.player.x);
            dy = Math.sign(next.y - s.player.y);
          } else this.clickGoal = null;
        }
      }
      if ((dx || dy) && time > this.nextStep) {
        this.nextStep = time + (s.flags.riding ? 65 : running ? 95 : 155);
        this.moveDirection(dx, dy);
      }
      if (this.controls.interactPressed() || this.controls.gamepadAction())
        this.action();
      if (this.controls.pressed("X")) {
        if (this.mineLayout) this.action();
        else {
          const [fx, fy] = facingDelta[s.player.facing] ?? [0, 1];
          this.bridge.command({
            type: "use",
            x: s.player.x + fx,
            y: s.player.y + fy,
          });
          this.toolEffect(s.player.x + fx, s.player.y + fy);
        }
      }
    }
    const targetX = s.player.x * 16 + 8,
      targetY = (s.player.y + 1) * 16;
    this.player.x = Phaser.Math.Linear(
      this.player.x,
      targetX,
      Math.min(1, delta / 65),
    );
    this.player.y = Phaser.Math.Linear(
      this.player.y,
      targetY,
      Math.min(1, delta / 65),
    );
    this.mount
      .setVisible(Boolean(s.flags.riding))
      .setPosition(this.player.x, this.player.y)
      .setFrame(this.frame(`animal_horse_${Math.floor(time / 180) % 4}`));
    this.player.setOrigin(0.5, s.flags.riding ? 1.45 : 1);
    this.heldTool
      .setVisible(time < this.toolUntil)
      .setFrame(this.frame(`tool_${s.equipped}`))
      .setPosition(this.player.x + 7, this.player.y - 9)
      .setRotation(
        Math.sin(((this.toolUntil - time) / 420) * Math.PI) * 1.4 - 0.5,
      );
    const playerDepth = Math.round(this.player.y);
    if (this.mount.depth !== playerDepth + 0.25)
      this.mount.setDepth(playerDepth + 0.25);
    if (this.heldTool.depth !== playerDepth + 1)
      this.heldTool.setDepth(playerDepth + 1);
    if (this.player.depth !== playerDepth + 0.5)
      this.player.setDepth(playerDepth + 0.5);
    this.player.setFrame(
      this.frame(
        time < this.toolUntil && this.avatar === "world"
          ? `player_${s.equipped}_${s.player.facing}_${Math.floor(time / 105) % 4}`
          : time < this.walkingUntil
            ? `player_${s.player.facing}_${Math.floor(time / 110) % 4}`
            : `player_idle_${s.player.facing}_${Math.floor(time / 900) % 2}`,
        `player_${s.player.facing}_0`,
      ),
    );
    const [fx, fy] = facingDelta[s.player.facing] ?? [0, 1];
    const cursorKey = `${s.player.x},${s.player.y},${s.player.facing}`;
    if (cursorKey !== this.cursorKey) {
      this.cursorKey = cursorKey;
      this.cursor.clear();
      this.cursor.lineStyle(1, 0xffedbd, 0.65);
      const cx = (s.player.x + fx) * 16,
        cy = (s.player.y + fy) * 16;
      for (const [ox, oy] of [
        [0, 0],
        [12, 0],
        [0, 12],
        [12, 12],
      ])
        this.cursor.strokeRect(cx + (ox ?? 0) + 1, cy + (oy ?? 0) + 1, 3, 3);
    }
    for (const villager of this.villagers) {
      const next = villager.route[0];
      if (next && !this.paused) {
        const tx = next.x * 16 + 8,
          ty = (next.y + 1) * 16,
          dx = tx - villager.sprite.x,
          dy = ty - villager.sprite.y,
          distance = Math.hypot(dx, dy),
          step = delta * 0.026;
        villager.direction =
          Math.abs(dx) > Math.abs(dy)
            ? dx < 0
              ? "left"
              : "right"
            : dy < 0
              ? "up"
              : "down";
        if (distance <= step) {
          villager.sprite.setPosition(tx, ty);
          villager.route.shift();
        } else
          villager.sprite.setPosition(
            villager.sprite.x + (dx / distance) * step,
            villager.sprite.y + (dy / distance) * step,
          );
        villager.x = Math.round((villager.sprite.x - 8) / 16);
        villager.y = Math.round(villager.sprite.y / 16) - 1;
      }
      const depth = Math.round(villager.sprite.y) + 0.5;
      if (villager.sprite.depth !== depth) villager.sprite.setDepth(depth);
      villager.sprite.setFrame(
        this.frame(
          `npc_${villager.id}_${villager.direction}_${next ? Math.floor(time / 140) % 4 : Math.floor(time / 900) % 2}`,
        ),
      );
    }
    const waterFrame = Math.floor(time / 400) % 4;
    if (waterFrame !== this.waterFrame) {
      this.waterFrame = waterFrame;
      for (const water of this.waters)
        if (water.visible)
          water.setFrame(
            this.frame(
              blobFrame("water", this.waterMasks.get(water) ?? 255, waterFrame),
              `tile_water_${waterFrame}`,
            ),
          );
    }
    const darkness =
      s.minute < 420
        ? 0.16
        : s.minute > 1080
          ? Math.min(0.55, (s.minute - 1080) / 600)
          : 0;
    this.light
      .setAlpha(this.layout.indoor ? darkness * 0.3 : darkness)
      .setFillStyle(s.minute < 1140 ? 0xd6a46d : 0x262c58);
    this.glows.clear();
    if (this.mineLayout) {
      this.light.setAlpha(0.22).setFillStyle(0x272c48);
      this.glows.fillStyle(0xe6be78, 0.08);
      this.glows.fillCircle(this.player.x, this.player.y - 10, 34);
      if (this.mineLayout.crystal) {
        this.glows.fillStyle(0x92bed6, 0.18);
        this.glows.fillCircle(56, 56, 22 + Math.sin(time / 800) * 2);
      }
    } else if (darkness > 0.08) {
      for (const landmark of this.layout.landmarks) {
        if (!landmark.frame.startsWith("building")) continue;
        const x = landmark.x * 16 + 8,
          y = (landmark.y + 1) * 16;
        this.glows.fillStyle(0xffd692, 0.11);
        this.glows.fillEllipse(x, y, 70, 32);
        this.glows.fillStyle(0xf0c778, 0.7);
        this.glows.fillRect(x - 28, y - 37, 11, 12);
        this.glows.fillRect(x + 18, y - 37, 11, 12);
      }
    }
    if (
      !this.layout.indoor &&
      ["rain", "storm", "cloudy", "blizzard"].includes(s.weather)
    )
      this.light.setAlpha(Math.min(0.6, darkness + 0.12));
    this.weather.clear();
    this.precipitation.setVisible(false);
    if (
      !this.layout.indoor &&
      ["rain", "storm", "snow", "blizzard"].includes(s.weather)
    ) {
      const snow = s.weather === "snow" || s.weather === "blizzard",
        texture = snow ? "weather_snow" : "weather_rain";
      if (this.precipitation.texture.key !== texture)
        this.precipitation.setTexture(texture);
      this.precipitation.setVisible(true);
      this.precipitation.tilePositionX = -time * (snow ? 0.006 : 0.035);
      this.precipitation.tilePositionY = -time * (snow ? 0.025 : 0.16);
    } else if (!this.layout.indoor) {
      this.weather.fillStyle(0xffedbd, 0.5);
      for (let i = 0; i < 9; i++) {
        const x = (i * 47 + time * 0.005) % 325,
          y = (i * 31 + Math.sin(time / 1800 + i) * 7) % 240;
        this.weather.fillRect(x, y, 1, 1);
      }
    }
  }
}
