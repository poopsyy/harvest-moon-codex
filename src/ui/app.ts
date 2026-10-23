import {
  createGame,
  type GameState,
  type Command,
  type GameEvent,
  type Season,
} from "../state/game";
import { dispatch, tick, evaluate, resolveSchedule } from "../systems/engine";
import {
  crops,
  flowers,
  items,
  npcs,
  maps,
  festivals,
  fish,
  validateCatalog,
} from "../data/catalog";
import * as narrative from "../data/narrative";
import {
  saveSlot,
  loadSlot,
  listSlots,
  exportSave,
  importSave,
  saveSettings,
  loadSettings,
  defaultSettings,
  type Settings,
  type Slot,
} from "../persistence";
import { random } from "../core/rng";
import { AudioEngine } from "../audio/engine";
import { t, esc, button, money, dateParts, dateLabel, seasons } from "./i18n";
import { loadAtlas, sprite } from "./sprites";
import {
  parseDialogueText,
  renderDialogueText,
  type ParsedDialogueText,
} from "./dialogue-text";
import * as panels from "./panels";
import { startFishing, startFestival } from "./minigames";

type WorldHandle = Awaited<
  ReturnType<(typeof import("../render/world"))["mountWorld"]>
>;
type Dialog = {
  title: string;
  lines: string[];
  index: number;
  speaker: string;
  choices: { label: string; flag: string }[];
  onComplete?: () => void;
};
const toolIds = [
  "hoe",
  "can",
  "sickle",
  "axe",
  "hammer",
  "rod",
  "seeds",
  "hand",
];
const gamepadDefaults: Record<string, number> = {
  interact: 0,
  run: 2,
  inventory: 3,
  previousTool: 4,
  nextTool: 5,
  cancel: 9,
  journal: 8,
};
const keyDefaults: Record<string, string> = {
  up: "ArrowUp",
  down: "ArrowDown",
  left: "ArrowLeft",
  right: "ArrowRight",
  interact: " ",
  cancel: "Escape",
  inventory: "i",
  journal: "j",
  nextTool: "e",
  previousTool: "q",
  run: "Shift",
};
function textLines(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(textLines);
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return textLines(o.lines ?? o.text ?? o.body ?? o.description ?? []);
  }
  return [];
}
export class WillowmereApp {
  state: GameState = createGame();
  private settings: Settings = structuredClone(defaultSettings);
  private world: WorldHandle | null = null;
  private audio = new AudioEngine();
  private active = false;
  private panel = "";
  private tab = "";
  private selectedItem = "";
  private selectedNpc = "";
  private introStep = 0;
  private appearance: Record<string, number> = {
    body: 0,
    hair: 0,
    hairColor: 0,
    skin: 0,
    outfit: 0,
  };
  private modalCleanup: (() => void) | null = null;
  private dialog: Dialog | null = null;
  private typing: ReturnType<typeof setInterval> | null = null;
  private textComplete = true;
  private accumulator = 0;
  private lastFrame = 0;
  private lastHud = "";
  private lastMusic = "";
  private lastGamepad = 0;
  private savedFocus: HTMLElement | null = null;
  private pendingRebind: string | null = null;
  private toastRoot = document.createElement("div");
  private modalRoot = document.createElement("div");
  private debugOverlay = false;
  private touchLastTap = 0;
  private touchLastDirection = "";
  private touchTimer: ReturnType<typeof setInterval> | null = null;
  private screen = "title";
  private newOptions: {
    name: string;
    farmName: string;
    petName: string;
    petType: string;
    seed: number;
    appearance: Record<string, number>;
    birthday: { season: Season; day: number };
  } | null = null;
  constructor(private root: HTMLElement) {}
  async boot() {
    validateCatalog();
    narrative.validateNarrative();
    await loadAtlas();
    try {
      this.settings = await loadSettings();
    } catch {
      this.settings = structuredClone(defaultSettings);
    }
    this.applySettings();
    this.toastRoot.className = "toast-stack";
    this.toastRoot.setAttribute("role", "status");
    this.toastRoot.setAttribute("aria-live", "polite");
    this.modalRoot.className = "modal-layer";
    document.body.append(this.modalRoot, this.toastRoot);
    this.root.addEventListener("click", (e) => void this.click(e));
    this.modalRoot.addEventListener("click", (e) => void this.click(e));
    this.modalRoot.addEventListener("change", (e) => this.change(e));
    this.root.addEventListener("change", (e) => this.change(e));
    this.modalRoot.addEventListener("submit", (e) => {
      e.preventDefault();
      void this.submit(e);
    });
    this.modalRoot.addEventListener("input", (e) => this.settingInput(e));
    document.addEventListener("keydown", (e) => this.key(e), true);
    document.addEventListener("visibilitychange", () => {
      this.accumulator = 0;
      this.lastFrame = performance.now();
      if (this.settings.muteHidden) {
        if (document.hidden) this.audio.pause();
        else this.audio.resume();
      }
    });
    window.addEventListener("pagehide", () => {
      if (this.active)
        void saveSlot(0, this.state, this.world?.screenshot()).catch(
          () => undefined,
        );
    });
    if (import.meta.env.DEV) {
      window.__willowmere = {
        getState: () => structuredClone(this.state),
        command: (c) => {
          this.command(c);
        },
        open: (p) => this.open(p),
        save: (s) => this.save(s),
        load: (s) => this.load(s),
      };
    }
    await this.title();
    requestAnimationFrame((now) => this.frame(now));
  }
  private async title() {
    this.screen = "title";
    this.active = false;
    this.world?.destroy();
    this.world = null;
    this.close();
    const slots = await listSlots();
    const hasSave = slots.some((s) => !s.empty && !s.corrupt);
    const latest = slots
      .filter((s) => !s.empty && !s.corrupt)
      .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt))[0];
    const titleSeason = dateParts(latest?.day ?? 0).season;
    this.root.innerHTML = `<section class="title-screen"><div class="title-vista" style="background-image:url(/assets/title_${titleSeason}.png)"></div><div class="title-shade"></div>${Array.from({ length: 9 }, (_, i) => `<i class="title-firefly" style="left:${48 + i * 5}%;top:${35 + ((i * 17) % 46)}%;animation-delay:${i * 0.6}s"></i>`).join("")}<div class="title-content"><p class="eyebrow">${t("app.eyebrow")}</p><h1 class="title-logo">${t("app.logoMain")}<span>${t("app.logoSecond")}</span></h1><div class="title-rule"></div><p class="title-tagline">${t("app.tagline")}</p><nav class="title-menu">${button(t("app.start"), "new", {}, "primary")}${hasSave ? button(t("app.continue"), "continue") : ""}${button(t("app.load"), "open", { panel: "load" })}<div class="small-row">${button(t("app.options"), "open", { panel: "options" })}${button(t("app.credits"), "open", { panel: "credits" })}</div></nav></div><footer class="title-footer"><span>${t("app.footer")}</span><span>${t("app.version")} &nbsp; · &nbsp; ${t("app.offline")}</span></footer></section>`;
    this.audio.play("title");
  }
  private newGame() {
    this.panel = "new";
    this.appearance = { body: 0, hair: 0, hairColor: 0, skin: 0, outfit: 0 };
    this.modal(
      t("new.title"),
      `<p class="muted">${t("new.desc")}</p><form id="new-game-form"><div class="new-preview"><div id="new-avatar">${sprite("player_down_0", 3)}</div><div><p>${t("app.title")}</p><p class="muted">${t("app.tagline")}</p></div></div><div class="grid-two"><label class="field">${t("new.name")}<input name="name" maxlength="20" required value="${t("new.defaultName")}" autocomplete="off"></label><label class="field">${t("new.farm")}<input name="farmName" maxlength="24" required value="${t("new.defaultFarm")}" autocomplete="off"></label><label class="field">${t("new.pet")}<input name="petName" maxlength="16" required value="${t("new.defaultPet")}"></label><label class="field">${t("new.petType")}<select name="petType"><option value="dog">${t("new.dog")}</option><option value="cat">${t("new.cat")}</option></select></label></div><div class="customization">${this.swatches("hairColor", ["#493d36", "#846044", "#c4a466", "#d4cdb2", "#a66d4f", "#5c5372", "#71816a", "#c38c8b"], "new.hair")}${this.swatches("skin", ["#f3d9b0", "#e3bd91", "#c69870", "#a57557", "#825b47", "#60463b"], "new.skin")}${this.swatches("outfit", ["#748e5c", "#a66d59", "#778da1", "#c8ad68", "#957e9f", "#59847c"], "new.outfit")}</div><div class="grid-two"><label class="field">${t("new.style")}<select name="hair">${Array.from({ length: 6 }, (_, i) => `<option value="${i}">${i + 1}</option>`).join("")}</select></label><label class="field">${t("new.body")}<select name="body"><option value="0">1</option><option value="1">2</option></select></label><label class="field">${t("new.birthday")}<select name="season">${seasons.map((s) => `<option value="${s}">${t(`hud.season.${s}`)}</option>`).join("")}</select></label><label class="field">${t("new.day")}<input name="birthday" type="number" min="1" max="30" value="1"></label></div><input type="hidden" name="seed" value="${Date.now() % 2147483647}"><div class="divider"></div><button class="primary" type="submit">${t("new.begin")}</button></form>`,
      { wide: false },
    );
    void this.updateAppearancePreview();
  }
  private async updateAppearancePreview() {
    const preview = this.modalRoot.querySelector("#new-avatar");
    if (!preview) return;
    const { createAppearancePreview } = await import("../render/appearance");
    const image = await createAppearancePreview(this.appearance);
    if (this.panel === "new")
      preview.innerHTML = `<img width="48" height="72" alt="${t("new.appearance")}" src="${image}">`;
  }
  private swatches(field: string, colors: string[], label: string) {
    return `<div><span class="muted">${t(label)}</span><div class="swatches">${colors.map((c, i) => `<button type="button" class="swatch ${i === 0 ? "active" : ""}" aria-label="${t(label)} ${i + 1}" data-action="swatch" data-field="${field}" data-value="${i}" style="background:${c}"></button>`).join("")}</div></div>`;
  }
  private async submit(event: Event) {
    const form = event.target;
    if (!(form instanceof HTMLFormElement) || form.id !== "new-game-form")
      return;
    const f = new FormData(form);
    const clean = (key: string, fallback: string) =>
      String(f.get(key) ?? "")
        .replace(/[<>]/g, "")
        .trim() || fallback;
    this.newOptions = {
      name: clean("name", t("new.defaultName")),
      farmName: clean("farmName", t("new.defaultFarm")),
      petName: clean("petName", t("new.defaultPet")),
      petType: String(f.get("petType")),
      seed: Number(f.get("seed")),
      appearance: {
        ...this.appearance,
        hair: Number(f.get("hair")),
        body: Number(f.get("body")),
      },
      birthday: {
        season: String(f.get("season")) as Season,
        day: Math.min(30, Math.max(1, Number(f.get("birthday")))),
      },
    };
    this.state = createGame(this.newOptions);
    this.introStep = 0;
    this.intro();
  }
  private intro() {
    this.panel = "intro";
    this.modal(
      t("app.title"),
      `<img class="intro-art" src="/assets/intro_${["city", "letter", "arrival", "farm"][this.introStep]}.png" alt="${t(`intro.scene${this.introStep + 1}`)}"><div class="intro-page"><span class="eyebrow">${t("intro.eyebrow")}</span><h2>${t("intro.title")}</h2>${narrative.intro
        .slice([0, 2, 8, 13][this.introStep], [2, 8, 13, 17][this.introStep])
        .map((line) => `<p>${esc(line)}</p>`)
        .join(
          "",
        )}</div><div class="intro-dots">${[0, 1, 2, 3].map((i) => `<i class="${i === this.introStep ? "active" : ""}"></i>`).join("")}</div>`,
      {
        footer: button(
          t(this.introStep < 3 ? "app.continue" : "intro.enter"),
          "introNext",
          {},
          "primary",
        ),
        dismiss: false,
      },
    );
  }
  private async start() {
    this.close();
    this.active = false;
    this.screen = "game";
    this.accumulator = 0;
    this.lastHud = "";
    dispatch(this.state, {
      type: "settings",
      values: {
        timeSpeed: this.settings.timeSpeed,
        preciseSow: this.settings.preciseSow,
        festivalDifficulty: this.settings.festivalDifficulty,
        runToggle: this.settings.runToggle,
      },
    });
    this.root.innerHTML = `<section class="game-shell" data-testid="game"><header class="game-header"><div class="wordmark">${t("app.title")}<small id="farm-name">${esc(this.state.player.farmName.toUpperCase())}</small></div><nav class="header-tools">${button(t("hud.journal"), "open", { panel: "journal" })}${button(t("hud.people"), "open", { panel: "people" })}${button(t("hud.map"), "open", { panel: "map" })}${button(t("hud.menu"), "open", { panel: "menu" })}</nav></header><div class="game-main"><div class="world-column"><div class="world-frame"><div class="world-host" id="world"></div><div class="hud"><div class="hud-chip"><div class="hud-date" data-testid="hud-day"></div><div class="hud-time" id="hud-time"></div><div class="hud-weather" id="hud-weather"></div></div><div class="hud-right"><div class="hud-chip hud-gold" data-testid="hud-money"></div><div class="hud-chip"><div class="energy-label" id="energy-label"></div><div class="energy-track"><div class="energy-fill" id="energy-fill"></div></div></div></div></div><div class="touch-controls"><div class="touch-pad">${[
      ["up", "↑"],
      ["left", "←"],
      ["right", "→"],
      ["down", "↓"],
    ]
      .map(
        ([dir, label]) =>
          `<button aria-label="${t(`controls.move.${dir}`)}" data-dir="${dir}">${label}</button>`,
      )
      .join(
        "",
      )}</div><div class="touch-actions">${button(t("hud.bag"), "open", { panel: "inventory" }, "secondary")}${button(t("hud.action"), "touchAct")}</div></div></div><div class="world-caption"><span id="location-label"></span><span>${t("hud.hint")}</span></div></div><aside class="side-notebook"><div class="notebook-card"><span class="eyebrow">${t("hud.today")}</span><h2>${t("hud.greeting", { name: esc(this.state.player.name) })}</h2><p class="muted">${t("hud.daily")}</p><div class="daily-goals" id="daily-goals"></div><p class="muted">${t("hud.next")}</p></div><div class="side-actions">${button(t("hud.bag"), "open", { panel: "inventory" })}${button(t("menu.calendar"), "open", { panel: "calendar" })}${button(t("menu.collections"), "open", { panel: "collections" })}${button(t("menu.guide"), "open", { panel: "guide" })}</div></aside></div><nav class="tool-dock" data-testid="toolbar">${toolIds.map((id, i) => button(`${sprite(`tool_${id}`, 1.5)}<span class="tool-label">${t(`hud.tool.${id}`)}</span><span class="tool-key">${i + 1}</span>`, "equip", { tool: id }, "tool-button")).join("")}<span class="dock-separator"></span><select aria-label="${t("hud.held")}" id="seed-select">${[...crops, ...flowers, { id: "grass", name: t("inventory.grass") }].map((c) => `<option value="${c.id}">${esc(c.name)}</option>`).join("")}</select></nav></section>`;
    const { mountWorld } = await import("../render/world");
    this.world?.destroy();
    this.world = await mountWorld(
      this.root.querySelector<HTMLElement>("#world")!,
      () => this.state,
      (c) => this.command(c),
      (target) => this.interact(target),
      () => ({
        keys: this.settings.keys,
        gamepad: this.settings.gamepad,
        reduceFlashes: this.settings.reduceFlash,
        debugOverlay: import.meta.env.DEV && this.debugOverlay,
      }),
    );
    this.active = true;
    this.lastFrame = performance.now();
    this.accumulator = 0;
    this.bindTouch();
    this.updateHud();
    this.syncMusic();
    void this.save(0, false);
    if (this.state.pendingChoices.length) {
      const scene = [
        ...narrative.arcEvents,
        ...narrative.heartEvents,
        ...narrative.marriageEvents,
      ].find((e) =>
        e.choices?.some((choice) =>
          this.state.pendingChoices.includes(choice.flag),
        ),
      );
      if (scene)
        this.playDialogue(
          scene.title,
          scene.lines,
          scene.npc,
          scene.choices?.filter((choice) =>
            this.state.pendingChoices.includes(choice.flag),
          ) ?? [],
        );
    }
  }
  private frame(now: number) {
    const elapsed = this.lastFrame ? Math.min(now - this.lastFrame, 1000) : 0;
    this.lastFrame = now;
    if (this.active && !this.panel && !document.hidden) {
      this.accumulator += elapsed * this.settings.timeSpeed;
      if (this.accumulator >= 700) {
        const minutes = Math.floor(this.accumulator / 700);
        this.accumulator %= 700;
        this.handleEvents(tick(this.state, minutes));
        this.updateHud();
      }
    }
    if (this.panel) this.pollGamepad(now);
    requestAnimationFrame((n) => this.frame(n));
  }
  private pollGamepad(now: number) {
    if (now - this.lastGamepad < 180) return;
    const pad = navigator.getGamepads?.().find((p) => p?.connected);
    if (!pad) return;
    const focusable = Array.from(
      this.modalRoot.querySelectorAll<HTMLElement>(
        "button:not(:disabled),input,select",
      ),
    );
    const index = focusable.indexOf(document.activeElement as HTMLElement);
    if (pad.buttons[12]?.pressed || pad.axes[1]! < -0.5) {
      focusable[(index - 1 + focusable.length) % focusable.length]?.focus();
      this.lastGamepad = now;
    } else if (pad.buttons[13]?.pressed || pad.axes[1]! > 0.5) {
      focusable[(index + 1) % focusable.length]?.focus();
      this.lastGamepad = now;
    } else if (pad.buttons[this.settings.gamepad.interact ?? 0]?.pressed) {
      (document.activeElement as HTMLElement)?.click();
      this.lastGamepad = now;
    } else if (
      pad.buttons[this.settings.gamepad.cancel ?? 1]?.pressed &&
      !this.dialog?.onComplete &&
      !this.dialog?.choices.length
    ) {
      this.close();
      this.lastGamepad = now;
    }
  }
  private command(c: Command): GameEvent[] {
    if (c.type === "debug" && !import.meta.env.DEV) return [];
    const beforeDay = this.state.day;
    const events = dispatch(this.state, c);
    this.handleEvents(events, c.type === "talk");
    if (!["move", "face", "settings", "debug"].includes(c.type))
      this.audio.sfx(c.type === "use" ? this.state.equipped : c.type);
    if (this.state.day !== beforeDay) this.syncMusic();
    this.updateHud();
    return events;
  }
  private handleEvents(events: GameEvent[], dialogue = false) {
    for (const e of events) {
      if (e.type === "DayEnded") {
        this.open("summary");
        void this.save(0, false);
      } else if (e.message && e.type !== "Dialogue" && e.type !== "FlagSet") {
        if (e.type !== "FriendshipChanged" || this.settings.friendshipToasts)
          this.toast(e.message, e.type === "Blocked");
      }
    }
    if (dialogue) {
      const lines = events
        .filter((e) => e.type === "Dialogue" && e.message)
        .map((e) => e.message!);
      if (lines.length) {
        const choices = this.state.pendingChoices.map((flag) => {
          const choice = [...narrative.heartEvents, ...narrative.arcEvents]
            .flatMap((e) => e.choices ?? [])
            .find((c) => c.flag === flag);
          return { flag, label: choice?.label ?? flag.replaceAll("_", " ") };
        });
        this.playDialogue(
          npcs.find((n) => n.id === this.selectedNpc)?.name ?? t("app.title"),
          lines,
          this.selectedNpc,
          choices,
        );
      }
    }
  }
  private updateHud() {
    if (!this.active) return;
    const s = this.state;
    const key = [
      s.day,
      s.minute,
      s.money,
      s.stamina,
      s.equipped,
      s.selectedSeed,
      s.player.map,
      s.inventory.length,
      s.stats.harvested,
      Object.keys(s.plots).length,
    ].join("|");
    if (key === this.lastHud) return;
    this.lastHud = key;
    const set = (selector: string, text: string) => {
      const el = this.root.querySelector(selector);
      if (el) el.textContent = text;
    };
    set("[data-testid=hud-day]", dateLabel(s.day));
    const minutes = Math.floor(s.minute) % 1440;
    set(
      "#hud-time",
      `${String(Math.floor(minutes / 60)).padStart(2, "0")}:${String(minutes % 60).padStart(2, "0")}`,
    );
    set("#hud-weather", t(`hud.weather.${s.weather}`));
    set("[data-testid=hud-money]", `${money(s.money)} G`);
    set(
      "#energy-label",
      `${t("hud.stamina")} ${Math.round(s.stamina)} / ${s.maxStamina}`,
    );
    const bar = this.root.querySelector<HTMLElement>("#energy-fill");
    if (bar) bar.style.width = `${(s.stamina / s.maxStamina) * 100}%`;
    set("#location-label", maps.find((m) => m.id === s.player.map)?.name ?? "");
    this.root
      .querySelectorAll<HTMLButtonElement>("[data-action=equip]")
      .forEach((b) =>
        b.classList.toggle("active", b.dataset.tool === s.equipped),
      );
    const seed = this.root.querySelector<HTMLSelectElement>("#seed-select");
    if (seed) seed.value = s.selectedSeed;
    const goals = this.root.querySelector("#daily-goals");
    if (goals) {
      const done = [
        Object.keys(s.plots).length > 0,
        Object.values(s.plots).some((p) => p.crop),
        s.stats.harvested > 0,
        s.stats.cropsShipped > 0,
        Object.keys(s.talked).length > 0,
      ];
      goals.innerHTML = done
        .map(
          (v, i) =>
            `<div class="daily-goal ${v ? "done" : ""}">${t(`hud.goal${i + 1}`)}</div>`,
        )
        .join("");
    }
    this.syncMusic();
  }
  private syncMusic() {
    if (!this.active) return;
    const s = this.state;
    let track = dateParts(s.day).season as string;
    if (s.minute >= 1200) track = "night";
    else if (["rain", "storm"].includes(s.weather)) track = "rain";
    else if (s.player.map === "mine")
      track = s.mine.floor > 30 ? "deep_mine" : "mine";
    else if (["square", "market", "hilltop"].includes(s.player.map))
      track = "village";
    else if (["store", "forge", "ranch", "workshop"].includes(s.player.map))
      track = "shop";
    else if (["farmhouse", "inn"].includes(s.player.map)) track = "inn";
    if (track !== this.lastMusic) {
      this.audio.play(track);
      this.lastMusic = track;
    }
  }
  private interact(target: string) {
    if (this.panel) return;
    if (target.startsWith("warp:")) {
      this.travel(target.slice(5));
      return;
    }
    if (target.startsWith("npc:")) {
      this.selectedNpc = target.slice(4);
      this.command({ type: "talk", npc: this.selectedNpc });
      return;
    }
    if (target.startsWith("animal:")) {
      this.open("animals");
      return;
    }
    const panels: Record<string, string> = {
      bed: "sleep",
      diary: "save",
      shipping: "inventory",
      shop: "shop",
      animals: "animals",
      workshop: "craft",
      forge: "forge",
      board: "requests",
      tree: "journal",
      tv: "mail",
      map: "map",
      fish: "fish",
      mine: "mine",
      exit: "map",
      calendar: "calendar",
      kitchen: "cook",
      storage: "inventory",
      mail: "mail",
      pet: "animals",
      journal: "journal",
    };
    if (target === "horse") {
      this.command({ type: "ride" });
      return;
    }
    if (target === "forage") {
      this.command({ type: "forage" });
      return;
    }
    if (target === "well") {
      this.command({ type: "refill" });
      return;
    }
    if (target === "hotSpring") {
      this.command({ type: "hotSpring" });
      return;
    }
    this.open(panels[target] ?? "menu");
    if (target === "shipping") {
      this.tab = "bin";
      this.inventory();
    }
  }
  private travel(id: string) {
    const map = maps.find((m) => m.id === id);
    if (!map) return;
    const here = maps.find((m) => m.id === this.state.player.map);
    if (id !== this.state.player.map && !here?.connections.includes(id)) {
      this.toast(t("map.locked"), true);
      return;
    }
    const shopMaps = [
      "store",
      "forge",
      "clinic",
      "workshop",
      "ranch",
      "library",
    ];
    if (
      shopMaps.includes(id) &&
      (this.state.minute < 480 || this.state.minute >= 1080)
    ) {
      this.toast(t("shop.closed"), true);
      return;
    }
    const indoor = map.kind === "indoor";
    const events = this.command({
      type: "teleport",
      map: id,
      x: indoor ? Math.floor(map.width / 2) : 10,
      y: indoor ? map.height - 4 : 9,
    });
    if (events.some((e) => e.type === "Blocked")) return;
    this.close();
    this.audio.sfx("door_open");
    if (id === "mine") {
      this.command({ type: "mine", action: "enter" });
      this.open("mine");
    }
  }
  private modal(
    title: string,
    content: string,
    options: {
      footer?: string;
      wide?: boolean;
      narrow?: boolean;
      dismiss?: boolean;
    } = {},
  ) {
    this.cleanupModal();
    if (!this.modalRoot.childElementCount)
      this.savedFocus = document.activeElement as HTMLElement;
    this.world?.setPaused(true);
    this.modalRoot.innerHTML = `<section class="modal ${options.wide ? "wide" : ""} ${options.narrow ? "narrow" : ""}" role="dialog" aria-modal="true" aria-labelledby="modal-title"><header class="modal-head"><h2 id="modal-title">${esc(title)}</h2>${options.dismiss === false ? "" : `<button class="close-button" data-action="close" aria-label="${t("app.close")}">×</button>`}</header><div class="modal-content">${content}</div>${options.footer ? `<footer class="modal-foot">${options.footer}</footer>` : ""}</section>`;
    queueMicrotask(() =>
      this.modalRoot
        .querySelector<HTMLElement>(
          "input:not([type=hidden]),button:not(.close-button),select",
        )
        ?.focus(),
    );
  }
  private cleanupModal() {
    this.modalCleanup?.();
    this.modalCleanup = null;
    if (this.typing) clearInterval(this.typing);
    this.typing = null;
  }
  private close() {
    this.cleanupModal();
    this.modalRoot.innerHTML = "";
    this.panel = "";
    this.tab = "";
    this.dialog = null;
    this.world?.setPaused(false);
    this.accumulator = 0;
    this.savedFocus?.focus();
    this.savedFocus = null;
    if (this.active) this.syncMusic();
  }
  open(panel: string) {
    if (panel !== this.panel) this.tab = "";
    this.panel = panel;
    switch (panel) {
      case "new":
        this.newGame();
        break;
      case "menu":
        this.menu();
        break;
      case "inventory":
        this.inventory();
        break;
      case "shop":
        this.modal(
          t("shop.title"),
          panels.renderShop(this.state, this.tab || "seeds"),
        );
        break;
      case "people":
        this.modal(t("people.title"), panels.renderPeople(this.state), {
          wide: true,
        });
        break;
      case "calendar":
        this.modal(t("calendar.title"), panels.renderCalendar(this.state));
        break;
      case "map":
        this.modal(t("map.title"), panels.renderMap(this.state), {
          wide: true,
        });
        break;
      case "collections":
        this.modal(
          t("collection.title"),
          panels.renderCollections(this.state, this.tab || "shipped"),
        );
        break;
      case "journal":
      case "requests":
        this.modal(
          t("journal.title"),
          panels.renderJournal(
            this.state,
            panel === "requests" ? "requests" : this.tab || "story",
          ),
        );
        break;
      case "animals":
        this.modal(
          t("animals.title"),
          panels.renderAnimals(this.state) + this.familyPanel(),
        );
        break;
      case "craft":
      case "forge":
      case "cook":
      case "processing":
        this.modal(
          t("craft.title"),
          panels.renderCraft(
            this.state,
            this.tab ||
              (panel === "forge"
                ? "tools"
                : panel === "cook"
                  ? "cook"
                  : panel === "processing"
                    ? "process"
                    : "buildings"),
          ),
          { wide: true },
        );
        break;
      case "mail":
        this.modal(
          t("mail.title"),
          panels.renderMail(this.state, this.tab || "letters"),
        );
        break;
      case "decor":
        this.modal(t("menu.decorate"), panels.renderDecor(this.state));
        break;
      case "sleep":
        this.modal(
          t("sleep.title"),
          `<div class="intro-page"><div class="little-tree"></div><p>${t("sleep.desc")}</p></div>`,
          {
            narrow: true,
            footer:
              button(t("sleep.stay"), "close") +
              button(t("sleep.confirm"), "sleep", {}, "primary"),
          },
        );
        break;
      case "summary":
        this.summary();
        break;
      case "save":
      case "load":
        void this.saveMenu(panel);
        break;
      case "options":
        this.options();
        break;
      case "credits":
        this.modal(
          t("credits.title"),
          `<div class="intro-page"><div class="little-tree"></div><h2>${t("app.title")}</h2><p>${t("credits.original")}</p><p>${t("credits.thanks")}</p><p class="muted">${t("credits.libraries")}</p></div>`,
          { footer: button(t("credits.return"), "close", {}, "primary") },
        );
        this.audio.play("credits");
        break;
      case "guide":
        this.modal(
          t("guide.title"),
          `<div class="stack">${["farming", "growth", "community", "rest", "controls", "paths"].map((k) => `<div class="story-card"><p>${t(`guide.${k}`)}</p></div>`).join("")}</div>`,
        );
        break;
      case "fish":
        this.fishing();
        break;
      case "mine":
        this.mining();
        break;
      case "festival":
        this.festival();
        break;
      case "evaluation":
        this.ending();
        break;
      case "debug":
        if (import.meta.env.DEV) this.debug();
        else this.close();
        break;
      default:
        this.close();
    }
  }
  private menu() {
    const entries = [
      ["inventory", "menu.inventory"],
      ["calendar", "menu.calendar"],
      ["journal", "hud.journal"],
      ["people", "menu.relationships"],
      ["collections", "menu.collections"],
      ["map", "hud.map"],
      ["mail", "menu.mail"],
      ["cook", "menu.cook"],
      ["decor", "menu.decorate"],
      ["save", "menu.save"],
      ["load", "menu.load"],
      ["options", "app.options"],
      ["guide", "menu.guide"],
      ["credits", "app.credits"],
    ];
    this.modal(
      t("menu.title"),
      `<div class="menu-grid">${entries.map(([p, k]) => button(t(k!), "open", { panel: p! })).join("")}${this.state.flags.horse ? button(t(this.state.flags.riding ? "hud.dismount" : "hud.ride"), "ride") : ""}${this.state.player.map === "farmhouse" ? button(t("sleep.confirm"), "open", { panel: "sleep" }) : ""}${button(t("menu.export"), "export")}${button(t("menu.import"), "import")}</div><input type="file" id="save-file" accept=".json,application/json" hidden>`,
      {
        footer:
          button(t("menu.titleScreen"), "title", {}, "quiet") +
          button(t("menu.resume"), "close", {}, "primary"),
      },
    );
  }
  private inventory() {
    const s = this.state,
      tab = this.tab || "bag";
    const stacks =
      tab === "chest" ? s.storage : tab === "bin" ? s.shipping : s.inventory;
    const selected = stacks.find((i) => i.id === this.selectedItem);
    const item = items.find((i) => i.id === selected?.id);
    const capacity = s.flags.backpack ? 36 : 24;
    const inventoryTabs = [
      ["bag", "inventory.bag"],
      ["chest", "inventory.chest"],
      ["bin", "inventory.bin"],
    ];
    const total = s.shipping.reduce(
      (sum, i) =>
        sum +
        (items.find((x) => x.id === i.id)?.price ?? 0) *
          i.quantity *
          ([1, 1.25, 1.5, 2][i.quality] ?? 1),
      0,
    );
    this.modal(
      t("inventory.title"),
      `<div class="row between"><p class="muted">${t("inventory.desc")}</p><span class="muted">${t("inventory.capacity", { used: s.inventory.length, max: capacity })}</span></div><div class="tabs">${inventoryTabs.map(([id, key]) => button(t(key!), "tab", { tab: id! }, tab === id ? "active" : "")).join("")}</div><div class="item-grid">${Array.from(
        { length: Math.max(capacity, stacks.length) },
        (_, n) => {
          const i = stacks[n];
          if (!i) return '<div class="item-slot empty"></div>';
          return button(
            `${sprite(`item_${i.id}`)}<span class="quantity">${i.quantity}</span><span class="item-name">${esc(items.find((it) => it.id === i.id)?.name ?? i.id)}</span>`,
            "selectItem",
            { item: i.id },
            `item-slot ${selected?.id === i.id ? "active" : ""}`,
          );
        },
      ).join(
        "",
      )}</div>${item && selected ? `<div class="item-details"><div class="row between"><h3>${esc(item.name)}</h3><span class="muted">${t(`inventory.quality.${selected.quality}`)} · ${money(item.price)}G</span></div><p>${esc(item.description)}</p><div class="row wrap"><label class="field">${t("shop.quantity")}<input type="number" id="item-quantity" min="1" max="${selected.quantity}" value="1" style="width:70px"></label>${tab === "chest" ? button(t("inventory.retrieve"), "itemAction", { kind: "retrieve" }) : tab === "bin" ? "" : `${button(t("inventory.ship"), "itemAction", { kind: "ship" }, "primary")}${button(t("inventory.store"), "itemAction", { kind: "store" })}${item.stamina ? button(t("inventory.eat"), "itemAction", { kind: "eat" }) : ""}${item.id.endsWith("_seed") ? button(t("inventory.plant"), "seed", { crop: item.id.replace(/_seed$/, "") }) : ""}${item.id.endsWith("_sapling") ? button(t("inventory.plantTree"), "plantTree", { tree: item.id.replace(/_sapling$/, "") }) : ""}${item.category === "fertilizer" ? button(t("inventory.fertilize"), "fertilize", { grade: item.id.includes("3") ? 3 : item.id.includes("2") ? 2 : 1 }) : ""}${button(t("inventory.gift"), "giftMenu")}`}</div></div>` : `<p class="muted" style="margin-top:20px">${t(stacks.length ? "inventory.select" : "inventory.empty")}</p>`}<p class="muted">${t("inventory.partialSeeds", { n: Object.values(s.seedCharges).reduce((sum, n) => sum + n, 0) })}</p><div class="divider"></div><div class="row between"><span class="gold">${t("inventory.total", { n: money(total) })}</span>${button(t("inventory.shipAll"), "shipAll", {}, "small")}</div>`,
    );
  }
  private familyPanel() {
    const r = this.state.relationships;
    if (r.child)
      return `<div class="divider"></div><p>${t("animals.child", { name: esc(r.child.name) })}</p>`;
    if (r.marriedDay !== null && this.state.day - r.marriedDay >= 120)
      return `<div class="divider"></div><div class="row wrap">${button(t("animals.birth"), "adopt", { kind: "birth" })}${button(t("animals.adoption"), "adopt", { kind: "adoption" })}</div>`;
    return "";
  }
  private summary() {
    const s = this.state;
    this.audio.sfx("new_day");
    this.modal(
      t("sleep.summary"),
      `<p class="muted" style="text-align:center">${dateLabel(s.day)}</p><div class="summary-total">${money(s.lastSummary.earned)} G</div><p class="muted" style="text-align:center">${t("sleep.earned")}</p><div class="summary-items">${s.lastSummary.items.length ? s.lastSummary.items.map((i) => `<div class="summary-item"><span>${sprite(`item_${i.id}`)} ${esc(items.find((it) => it.id === i.id)?.name ?? i.id)} ×${i.quantity}</span><span>${money((items.find((it) => it.id === i.id)?.price ?? 0) * i.quantity * ([1, 1.25, 1.5, 2][i.quality] ?? 1))}G</span></div>`).join("") : `<p class="muted">${t("sleep.nothing")}</p>`}</div>${s.lastSummary.events.map((e) => `<p class="muted">${esc(e)}</p>`).join("")}`,
      {
        narrow: true,
        footer: button(t("sleep.next"), "morning", {}, "primary"),
        dismiss: false,
      },
    );
  }
  private async ceremony(
    kind: "wedding" | "bloom" | "vote",
    title: string,
    lines: string[],
    speaker: string,
    next: () => void,
  ) {
    this.panel = "cinematic";
    this.world?.setPaused(true);
    this.modalRoot.classList.add("ceremony");
    await this.world?.ceremony(
      kind,
      npcs.map((n) => n.id),
    );
    await this.world?.present({
      type: "camera",
      target: speaker,
      value: "focus",
    });
    await this.world?.present({
      type: "emote",
      target: speaker,
      value: kind === "wedding" ? "heart" : "!",
    });
    this.playDialogue(title, lines, speaker, [], () => {
      void (async () => {
        this.panel = "cinematic";
        this.world?.setPaused(true);
        await this.world?.endCeremony();
        this.modalRoot.classList.remove("ceremony");
        this.command({ type: "acknowledge", event: kind });
        await this.save(0, false);
        this.close();
        next();
      })();
    });
  }
  private morningScenes() {
    const s = this.state,
      spouse = s.relationships.spouse;
    if (spouse && !s.flags.wedding_seen) {
      this.audio.play("wedding");
      void this.ceremony(
        "wedding",
        t("people.wedding"),
        narrative.weddings[spouse] ?? [],
        spouse,
        () => this.morningScenes(),
      );
      return;
    }
    if (s.flags.bloom && !s.flags.bloom_seen) {
      this.audio.play("bloom");
      void this.ceremony(
        "bloom",
        narrative.bloom.title,
        narrative.bloom.lines,
        narrative.bloom.npc,
        () => this.morningScenes(),
      );
      return;
    }
    if (s.flags.evaluated && !s.flags.vote_seen) {
      void this.ceremony(
        "vote",
        narrative.vote.title,
        narrative.vote.lines,
        narrative.vote.npc,
        () => this.open("evaluation"),
      );
    }
  }
  private async saveMenu(mode: "save" | "load") {
    const slots = await listSlots();
    if (this.panel !== mode) return;
    this.modal(
      t(mode === "save" ? "save.title" : "app.load"),
      `<div class="stack">${slots
        .filter((s) => mode === "load" || s.slot !== 0)
        .map(
          (s) =>
            `<div class="save-card">${s.thumbnail ? `<img alt="${esc(s.farmName)}" src="${esc(s.thumbnail)}">` : `<div class="save-thumbnail-empty">${sprite("tree_0", 0.75)}</div>`}<div class="save-info"><h3>${s.slot === 0 ? t("save.autosave") : t("save.slot", { n: s.slot })}</h3><p>${s.empty ? t("save.empty") : s.corrupt ? t("save.corrupt") : esc(s.name) + " · " + esc(s.farmName)}</p>${!s.empty && !s.corrupt ? `<p>${dateLabel(s.day)} · ${money(s.money)}G</p>` : ""}</div>${mode === "save" ? button(t("save.write"), "save", { slot: s.slot }, "small primary") : !s.empty && !s.corrupt ? button(t("save.read"), "load", { slot: s.slot }, "small primary") : ""}</div>`,
        )
        .join("")}</div>`,
      { footer: this.active ? button(t("menu.export"), "export") : "" },
    );
  }
  async save(slot: Slot, notice = true) {
    try {
      await saveSlot(slot, this.state, this.world?.screenshot());
      if (notice) this.toast(t("app.saved"));
    } catch (error) {
      console.error(error);
      this.toast(t("app.saveError"), true);
    }
  }
  async load(slot: Slot) {
    const state = await loadSlot(slot);
    if (!state) return;
    this.state = state;
    await this.start();
  }
  private playDialogue(
    title: string,
    lines: string[],
    speaker = "",
    choices: { label: string; flag: string }[] = [],
    onComplete?: () => void,
  ) {
    this.dialog = { title, lines, index: 0, speaker, choices, onComplete };
    this.panel = "dialogue";
    this.dialoguePage();
  }
  private dialoguePage() {
    const d = this.dialog;
    if (!d) return;
    const last = d.index === d.lines.length - 1;
    const prefix = d.lines[d.index]?.split(":")[0];
    const speaker = npcs.find(
      (n) => n.name === prefix || n.name.split(" ")[0] === prefix,
    );
    const portrait = speaker?.id ?? d.speaker;
    const speakerName = speaker?.name ?? d.title;
    this.modal(
      d.title,
      `<div class="dialogue-panel"><div class="portrait">${sprite(`portrait_${portrait || "odalie"}_neutral`, 1.4)}</div><div><p class="dialogue-name">${esc(speakerName)}</p><p class="dialogue-text" id="dialogue-text"></p></div></div>`,
      {
        footer:
          last && d.choices.length
            ? d.choices
                .map((c) =>
                  button(esc(c.label), "choice", { flag: c.flag }, "primary"),
                )
                .join("")
            : button(
                t(last ? "dialogue.close" : "dialogue.continue"),
                "dialogueNext",
                {},
                "primary",
              ) +
              (d.speaker && !d.onComplete && !d.choices.length
                ? button(t("dialogue.gift"), "giftChoose", { npc: d.speaker })
                : ""),
        dismiss: !d.onComplete && !d.choices.length,
      },
    );
    const parsed = this.parseLine(d.lines[d.index]!);
    const el = this.modalRoot.querySelector<HTMLElement>("#dialogue-text")!;
    const expression = (name: string) => {
      const image = this.modalRoot.querySelector(".portrait");
      if (image)
        image.innerHTML = sprite(
          `portrait_${portrait || "odalie"}_${name}`,
          1.4,
        );
    };
    const render = (count: number) => {
      this.renderLine(el, parsed, count);
    };
    this.textComplete = this.settings.textSpeed === 0;
    if (this.textComplete) {
      for (const token of parsed.tokens)
        if (token.type === "expression") expression(token.expression);
      render(parsed.visibleLength);
      return;
    }
    let count = 0,
      delay = 1000 / this.settings.textSpeed,
      next = performance.now(),
      control = 0;
    const controls = parsed.tokens.filter((token) =>
      ["expression", "pause", "speed"].includes(token.type),
    );
    this.typing = setInterval(() => {
      const now = performance.now();
      while (now >= next && count < parsed.visibleLength) {
        while (
          control < controls.length &&
          controls[control]!.offset <= count
        ) {
          const token = controls[control++]!;
          if (token.type === "expression") expression(token.expression);
          else if (token.type === "pause") next += token.milliseconds;
          else if (token.type === "speed") delay = token.milliseconds;
        }
        if (now < next) break;
        count++;
        next += delay;
        if (count % 3 === 0)
          this.audio.sfx(
            `voice_${
              (Math.max(
                0,
                npcs.findIndex((n) => n.id === portrait),
              ) %
                5) +
              1
            }`,
          );
      }
      render(count);
      if (count >= parsed.visibleLength) {
        if (this.typing) clearInterval(this.typing);
        this.typing = null;
        this.textComplete = true;
        if (this.settings.autoAdvance && !d.choices.length)
          this.modalCleanup = (() => {
            const timer = setTimeout(() => this.nextDialogue(), 1500);
            return () => clearTimeout(timer);
          })();
      }
    }, 16);
  }
  private parseLine(line: string) {
    return parseDialogueText(line, {
      playerName: this.state.player.name,
      itemName: (id) => items.find((item) => item.id === id)?.name,
    });
  }
  private renderLine(
    el: HTMLElement,
    parsed: ParsedDialogueText,
    count = Infinity,
  ) {
    el.innerHTML = renderDialogueText(parsed, count);
    for (const item of el.querySelectorAll<HTMLElement>(
      ".dialogue-item[data-item]",
    ))
      item.insertAdjacentHTML(
        "afterbegin",
        sprite(`item_${item.dataset.item}`, 1),
      );
  }
  private nextDialogue() {
    const d = this.dialog;
    if (!d) return;
    if (!this.textComplete) {
      if (this.typing) clearInterval(this.typing);
      this.typing = null;
      this.renderLine(
        this.modalRoot.querySelector<HTMLElement>("#dialogue-text")!,
        this.parseLine(d.lines[d.index]!),
      );
      this.textComplete = true;
      return;
    }
    if (d.index < d.lines.length - 1) {
      d.index++;
      this.dialoguePage();
    } else {
      const complete = d.onComplete;
      this.close();
      complete?.();
    }
  }
  private giftMenu(npc?: string) {
    if (npc) this.selectedNpc = npc;
    this.panel = "gift";
    if (!this.selectedNpc) {
      this.modal(
        t("inventory.gift"),
        `<div class="neighbors">${npcs
          .filter(
            (n) =>
              resolveSchedule(this.state, n.id)?.map === this.state.player.map,
          )
          .map((n) => button(esc(n.name), "giftChoose", { npc: n.id }))
          .join("")}</div>`,
      );
      return;
    }
    this.modal(
      `${t("dialogue.gift")} · ${npcs.find((n) => n.id === this.selectedNpc)?.name ?? ""}`,
      `<div class="item-grid">${this.state.inventory.map((i) => button(`${sprite(`item_${i.id}`)}<span class="item-name">${esc(items.find((it) => it.id === i.id)?.name ?? i.id)}</span>`, "give", { item: i.id }, "item-slot")).join("")}</div>${this.state.inventory.length ? "" : `<p>${t("dialogue.noGift")}</p>`}`,
    );
  }
  private fishing() {
    const pool = fish.filter(
      (f) =>
        f.locations.includes(this.state.player.map) &&
        f.seasons.includes(dateParts(this.state.day).season) &&
        f.minTier <= (this.state.tools.rod?.tier ?? 0) &&
        f.startHour * 60 <= this.state.minute &&
        f.endHour * 60 > this.state.minute &&
        f.weather.includes(this.state.weather),
    );
    const peek = { rng: this.state.rng };
    random(peek);
    const catchPreview = pool[Math.floor(random(peek) * pool.length)];
    this.modal(t("fish.title"), '<div id="minigame"></div>', {
      dismiss: false,
      footer: button(t("app.cancel"), "close"),
    });
    this.audio.play("contest");
    this.modalCleanup = startFishing(
      this.modalRoot.querySelector<HTMLElement>("#minigame")!,
      {
        difficulty: this.settings.festivalDifficulty,
        fishBehavior: catchPreview?.behavior as
          "calm" | "darting" | "sinker" | "leaper" | undefined,
        biteDelaySeconds: 1.5 + random(peek) * 2.5,
        sfx: (name) => this.audio.sfx(name),
        onCancel: () => this.close(),
        onComplete: (skill) => {
          this.close();
          this.command({ type: "fish", skill });
        },
      },
    );
  }
  private mining() {
    const m = this.state.mine;
    this.modal(
      t("mine.title"),
      `<div class="intro-page"><h2>${t("mine.floor", { n: m.floor })}</h2><p>${t("mine.rocks")}</p><p class="muted">${t("mine.dark")}</p><div class="row wrap">${button(t("mine.break"), "mine", { kind: "break" }, "primary")}${m.ladder ? button(t("mine.descend"), "mine", { kind: "descend" }, "primary") : ""}</div><div class="row wrap">${Array.from({ length: Math.floor(m.maxFloor / 10) }, (_, i) => button(`${t("mine.elevator")} ${(i + 1) * 10}`, "mine", { kind: "elevator", floor: (i + 1) * 10 }, "small")).join("")}</div></div>`,
      { footer: button(t("mine.exit"), "mine", { kind: "exit" }) },
    );
  }
  private festival() {
    const d = dateParts(this.state.day);
    const f = festivals.find(
      (f) =>
        f.season === d.season &&
        f.day === d.day &&
        (f.id !== "lantern_bloom_vigil" || this.state.flags.bloom),
    );
    if (!f) {
      this.modal(t("festival.title"), `<p>${t("festival.none")}</p>`);
      return;
    }
    this.modal(
      f.name,
      `<p>${esc(f.description)}</p><div id="minigame"></div>`,
      { dismiss: false, footer: button(t("app.cancel"), "close") },
    );
    this.audio.play("festival");
    this.modalCleanup = startFestival(
      this.modalRoot.querySelector<HTMLElement>("#minigame")!,
      f.id,
      {
        state: this.state,
        difficulty: this.settings.festivalDifficulty,
        sfx: (name) => this.audio.sfx(name),
        onCancel: () => this.close(),
        onComplete: (score) => {
          this.close();
          this.command({ type: "festival", score });
          this.playDialogue(
            f.name,
            [
              t("festival.score", { n: Math.round(score) }),
              ...narrative.dialogue
                .filter((l) => l.festival === f.id)
                .slice(0, 4)
                .map((l) => l.text),
            ],
            "odalie",
          );
        },
      },
    );
  }
  private ending() {
    const result = evaluate(this.state);
    const tier = result.tier.startsWith("Thriving")
      ? "thriving"
      : result.tier.startsWith("Steady")
        ? "steady"
        : "uncertain";
    this.audio.play("ending");
    const endData = (
      narrative.endings as unknown as {
        id?: string;
        title?: string;
        lines?: string[];
        text?: string;
      }[]
    ).find((e) => e.id?.includes(tier) || e.title === result.tier);
    this.modal(
      t("evaluation.title"),
      `<div class="intro-page"><span class="eyebrow">${t("evaluation.score", { n: result.score })}</span><h2>${t(`evaluation.${tier}`)}</h2>${textLines(
        endData,
      )
        .map((l) => `<p>${esc(l)}</p>`)
        .join("")}<p>${t("evaluation.desc")}</p></div>`,
      {
        footer:
          button(t("evaluation.continue"), "close", {}, "primary") +
          button(t("app.credits"), "open", { panel: "credits" }),
      },
    );
  }
  private options() {
    const range = (key: keyof Settings, min = 0, max = 1, step = 0.05) =>
      `<label class="setting-row"><span>${t(`options.${key}`)}</span><input data-setting="${key}" aria-label="${t(`options.${key}`)}" type="range" min="${min}" max="${max}" step="${step}" value="${Number(this.settings[key])}"></label>`;
    const toggle = (key: keyof Settings) =>
      `<label class="setting-row"><span>${t(`options.${key}`)}</span><input data-setting="${key}" type="checkbox" ${this.settings[key] ? "checked" : ""}></label>`;
    const tab = this.tab || "audio";
    let body = "";
    if (tab === "audio")
      body =
        ["master", "music", "sfx", "ambience"]
          .map((k) => range(k as keyof Settings))
          .join("") + toggle("muteHidden");
    if (tab === "gameplay")
      body =
        range("timeSpeed", 0.5, 2, 0.5) +
        range("textSpeed", 0, 100, 5) +
        range("festivalDifficulty", 0, 2, 1) +
        ["preciseSow", "runToggle", "autoAdvance", "friendshipToasts"]
          .map((k) => toggle(k as keyof Settings))
          .join("");
    if (tab === "visual")
      body =
        ["screenShake", "reduceFlash", "highContrast", "waterPattern"]
          .map((k) => toggle(k as keyof Settings))
          .join("") +
        range("uiScale", 1, 2, 1) +
        range("touchOpacity", 0.1, 1, 0.05);
    if (tab === "controls")
      body = `<h3>${t("options.keyboard")}</h3><div class="key-grid">${Object.entries(
        keyDefaults,
      )
        .map(([k, v]) =>
          button(
            `${t(`options.action.${k}`)}<kbd>${esc(this.settings.keys[k] ?? v)}</kbd>`,
            "rebind",
            { key: k },
          ),
        )
        .join(
          "",
        )}</div><div class="divider"></div><h3>${t("options.gamepad")}</h3>${Object.entries(
        gamepadDefaults,
      )
        .map(
          ([k, v]) =>
            `<label class="setting-row"><span>${t(`options.action.${k}`)}</span><select data-gamepad="${k}">${Array.from({ length: 16 }, (_, i) => `<option value="${i}" ${(this.settings.gamepad[k] ?? v) === i ? "selected" : ""}>${t("options.padButton", { n: i })}</option>`).join("")}</select></label>`,
        )
        .join(
          "",
        )}<div class="divider"></div>${button(t("options.touchEdit"), "touchEdit")}<p class="muted">${t("options.touchHelp")}</p>`;
    this.modal(
      t("options.title"),
      `<div class="tabs">${["audio", "gameplay", "visual", "controls"].map((k) => button(t(`options.${k}`), "tab", { tab: k }, tab === k ? "active" : "")).join("")}</div><div class="setting-group">${body}</div>`,
      {
        footer:
          button(t("options.reset"), "resetSettings", {}, "quiet") +
          button(t("app.close"), "close", {}, "primary"),
      },
    );
  }
  private applySettings() {
    this.audio.setVolumes(this.settings);
    document.body.classList.toggle("high-contrast", this.settings.highContrast);
    document.body.classList.toggle("large-ui", this.settings.uiScale === 2);
    document.documentElement.style.setProperty(
      "--touch-opacity",
      String(this.settings.touchOpacity),
    );
    if (this.active)
      dispatch(this.state, {
        type: "settings",
        values: {
          timeSpeed: this.settings.timeSpeed,
          preciseSow: this.settings.preciseSow,
          festivalDifficulty: this.settings.festivalDifficulty,
          runToggle: this.settings.runToggle,
        },
      });
  }
  private settingInput(event: Event) {
    const el = event.target;
    if (!(el instanceof HTMLInputElement) || !el.dataset.setting) return;
    const key = el.dataset.setting as keyof Settings;
    const value = el.type === "checkbox" ? el.checked : Number(el.value);
    this.settings = { ...this.settings, [key]: value };
    this.applySettings();
    void saveSettings(this.settings);
  }
  private change(event: Event) {
    const el = event.target;
    if (el instanceof HTMLSelectElement && el.dataset.gamepad) {
      const action = el.dataset.gamepad,
        value = Number(el.value);
      if (
        Object.entries({ ...gamepadDefaults, ...this.settings.gamepad }).some(
          ([k, v]) => k !== action && v === value,
        )
      ) {
        this.toast(t("options.gamepadConflict"), true);
        this.options();
      } else {
        this.settings.gamepad[action] = value;
        void saveSettings(this.settings);
      }
      return;
    }
    if (
      el instanceof HTMLSelectElement &&
      this.panel === "new" &&
      ["hair", "body"].includes(el.name)
    ) {
      this.appearance[el.name] = Number(el.value);
      void this.updateAppearancePreview();
    }
    if (el instanceof HTMLSelectElement && el.id === "seed-select")
      this.command({ type: "selectSeed", crop: el.value });
    if (
      el instanceof HTMLInputElement &&
      el.id === "save-file" &&
      el.files?.[0]
    )
      void el.files[0]
        .text()
        .then((json) => {
          this.state = importSave(json);
          return this.start();
        })
        .catch(() => this.toast(t("app.importError"), true));
  }
  private async click(event: Event) {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-action]",
    );
    if (!target) return;
    const a = target.dataset.action,
      d = target.dataset;
    await this.audio.unlock();
    this.audio.sfx("select");
    switch (a) {
      case "new":
        this.newGame();
        break;
      case "continue": {
        const saves = (await listSlots())
          .filter((s) => !s.empty && !s.corrupt)
          .sort((a, b) => Date.parse(b.savedAt) - Date.parse(a.savedAt));
        if (saves[0]) await this.load(saves[0].slot);
        break;
      }
      case "open":
        this.root.classList.remove("touch-edit");
        this.open(d.panel!);
        break;
      case "close":
        this.close();
        break;
      case "title":
        await this.title();
        break;
      case "introNext":
        if (this.introStep < 3) {
          this.introStep++;
          this.intro();
        } else await this.start();
        break;
      case "swatch":
        this.appearance[d.field!] = Number(d.value);
        target.parentElement
          ?.querySelectorAll(".swatch")
          .forEach((s) => s.classList.remove("active"));
        target.classList.add("active");
        void this.updateAppearancePreview();
        break;
      case "equip":
        this.command({ type: "equip", tool: d.tool! });
        break;
      case "plantTree":
        this.command({
          type: "plantTree",
          tree: d.tree!,
          x: this.state.player.x,
          y: this.state.player.y + 1,
        });
        this.close();
        break;
      case "fertilize":
        this.command({ type: "fertilize", grade: Number(d.grade) });
        this.inventory();
        break;
      case "seed":
        this.command({ type: "selectSeed", crop: d.crop! });
        this.close();
        break;
      case "touchAct":
        this.world?.interact();
        break;
      case "tab":
        this.tab = d.tab!;
        this.open(this.panel);
        break;
      case "selectItem":
        this.selectedItem = d.item!;
        this.inventory();
        break;
      case "itemAction": {
        const n = Number(
          this.modalRoot.querySelector<HTMLInputElement>("#item-quantity")
            ?.value ?? 1,
        );
        const kind = d.kind!;
        if (kind === "eat")
          this.command({ type: "eat", item: this.selectedItem });
        else if (["ship", "store", "retrieve", "sell"].includes(kind))
          this.command({
            type: kind as "ship" | "store" | "retrieve" | "sell",
            item: this.selectedItem,
            quantity: n,
          });
        this.inventory();
        break;
      }
      case "shipAll":
        for (const i of [...this.state.inventory])
          if (
            [
              "crop",
              "fruit",
              "flower",
              "fish",
              "forage",
              "animal",
              "processed",
              "mineral",
            ].includes(items.find((it) => it.id === i.id)?.category ?? "")
          )
            this.command({ type: "ship", item: i.id, quantity: i.quantity });
        this.inventory();
        break;
      case "buy":
        this.command({
          type: "buy",
          item: d.item!,
          quantity: Number(
            this.modalRoot.querySelector<HTMLInputElement>("#buy-quantity")
              ?.value ?? 1,
          ),
        });
        this.open(this.panel);
        break;
      case "sleep":
        this.command({ type: "sleep" });
        break;
      case "morning":
        this.close();
        this.morningScenes();
        break;
      case "save":
        await this.save(Number(d.slot) as Slot);
        void this.saveMenu("save");
        break;
      case "load":
        await this.load(Number(d.slot) as Slot);
        break;
      case "export":
        this.download(
          exportSave(this.state),
          `${t("save.exportName")}-${this.state.day}.json`,
        );
        break;
      case "import": {
        let input =
          this.modalRoot.querySelector<HTMLInputElement>("#save-file");
        if (!input) {
          input = document.createElement("input");
          input.type = "file";
          input.accept = ".json,application/json";
          input.id = "save-file";
          input.hidden = true;
          this.modalRoot.append(input);
        }
        input.click();
        break;
      }
      case "talk":
        this.selectedNpc = d.npc!;
        this.command({ type: "talk", npc: d.npc! });
        break;
      case "dialogueNext":
        this.nextDialogue();
        break;
      case "giftMenu":
        this.selectedNpc = "";
        this.giftMenu();
        break;
      case "giftChoose":
        this.giftMenu(d.npc);
        break;
      case "give":
        this.command({ type: "gift", npc: this.selectedNpc, item: d.item! });
        this.close();
        break;
      case "date":
      case "propose": {
        const result = this.command({ type: a, npc: d.npc! });
        if (a === "propose" && !result.some((e) => e.type === "Blocked"))
          this.playDialogue(
            npcs.find((n) => n.id === d.npc)?.name ?? t("app.title"),
            narrative.proposals[d.npc!] ?? [],
            d.npc,
            [],
            () => this.open("people"),
          );
        else this.open("people");
        break;
      }
      case "choice":
        this.command({ type: "choice", flag: d.flag! });
        this.close();
        break;
      case "travel":
        this.travel(d.map!);
        break;
      case "collect":
      case "breed":
        this.command({ type: a, animal: d.animal! });
        this.open("animals");
        break;
      case "care":
        this.command({ type: "care", animal: d.animal!, action: d.kind! });
        this.open("animals");
        break;
      case "buyAnimal": {
        const kind =
          d.kind ??
          this.modalRoot.querySelector<HTMLSelectElement>("#animal-kind")
            ?.value ??
          "chicken";
        const name =
          this.modalRoot.querySelector<HTMLInputElement>("#animal-name")
            ?.value || t("new.defaultPet");
        this.command({ type: "buyAnimal", kind, name });
        this.open("animals");
        break;
      }
      case "ride":
        this.command({ type: "ride" });
        this.close();
        break;
      case "adopt":
        this.command({ type: "adopt", choice: d.kind ?? "adoption" });
        this.open("animals");
        break;
      case "build":
        this.command({ type: "build", building: d.id! });
        this.open(this.panel);
        break;
      case "upgrade":
        this.command({ type: "upgradeTool", tool: d.tool! });
        this.open(this.panel);
        break;
      case "smelt":
        this.command({ type: "smelt", ore: d.item! });
        this.open(this.panel);
        break;
      case "cook":
      case "process":
        this.command({ type: a, recipe: d.id! });
        this.open(this.panel);
        break;
      case "decorate": {
        const id =
          d.id ??
          this.modalRoot.querySelector<HTMLSelectElement>("#decor-item")
            ?.value ??
          "";
        this.command({
          type: "decorate",
          item: id,
          x: Number(d.x),
          y: Number(d.y),
        });
        this.open("decor");
        break;
      }
      case "story": {
        const result = this.command({ type: "story", id: d.id! });
        if (!result.some((e) => e.type === "Blocked")) {
          const c = narrative.chapters.find((c) => c.id === d.id);
          const emitted = result
            .filter((e) => e.type === "Dialogue" && e.message)
            .map((e) => e.message!);
          const lines = emitted.length ? emitted : textLines(c);
          const choices = this.state.pendingChoices.map((flag) => {
            const ch = [
              ...narrative.arcEvents,
              ...narrative.heartEvents,
              ...narrative.marriageEvents,
            ]
              .flatMap((e) => e.choices ?? [])
              .find((c) => c.flag === flag);
            return { flag, label: ch?.label ?? flag.replaceAll("_", " ") };
          });
          const personal = [
            ...narrative.heartEvents,
            ...narrative.marriageEvents,
          ].find((e) => e.id === d.id);
          this.playDialogue(
            c?.title ??
              personal?.title ??
              narrative.arcs.find((a) => a.id === d.id)?.name ??
              t(d.id === "boat" ? "journal.boat" : "journal.tree"),
            lines.length
              ? lines
              : result.filter((e) => e.message).map((e) => e.message!),
            personal?.npc ?? "ilse",
            choices,
            choices.length ? undefined : () => this.morningScenes(),
          );
        }
        break;
      }
      case "discover":
        this.command({ type: "discover", page: d.id! });
        this.open("journal");
        break;
      case "replayScene": {
        const scene = [
          ...narrative.heartEvents,
          ...narrative.marriageEvents,
          ...narrative.arcEvents,
        ].find((e) => e.id === d.id);
        if (scene && this.state.flags[scene.flag])
          this.playDialogue(scene.title, scene.lines, scene.npc);
        break;
      }
      case "readPage": {
        const p = narrative.journalPages.find((p) => p.id === d.id);
        if (p) {
          this.modal(
            p.title,
            `<article class="book-page"><p>${esc(p.text)}</p></article>`,
          );
          this.panel = "page";
        }
        break;
      }
      case "quest":
        this.command({ type: "quest", id: d.id! });
        this.open("requests");
        break;
      case "marker": {
        const label =
          this.modalRoot.querySelector<HTMLInputElement>(
            "#marker-label",
          )?.value;
        const day =
          this.state.day -
          (this.state.day % 30) +
          Number(
            this.modalRoot.querySelector<HTMLInputElement>("#marker-day")
              ?.value ?? 1,
          ) -
          1;
        this.command({ type: "saveMarker", label, day });
        this.open("calendar");
        break;
      }
      case "mine":
        this.command({
          type: "mine",
          action: d.kind!,
          floor: d.floor ? Number(d.floor) : undefined,
        });
        if (d.kind === "exit") this.close();
        else this.mining();
        break;
      case "festival":
        this.open("festival");
        break;
      case "tv":
        this.command({ type: "tv" });
        this.open("mail");
        break;
      case "rebind":
        this.pendingRebind = d.key!;
        this.toast(t("options.rebind", { action: d.key! }));
        break;
      case "resetSettings":
        this.settings = structuredClone(defaultSettings);
        this.applySettings();
        await saveSettings(this.settings);
        this.options();
        break;
      case "touchEdit":
        this.close();
        this.root.classList.toggle("touch-edit");
        this.toast(t("options.touchHelp"));
        break;
      case "debugApply":
        this.applyDebug();
        break;
    }
  }
  private key(event: KeyboardEvent) {
    const target = event.target as HTMLElement;
    if (this.pendingRebind) {
      event.preventDefault();
      event.stopImmediatePropagation();
      if (
        Object.entries({ ...keyDefaults, ...this.settings.keys }).some(
          ([k, v]) => k !== this.pendingRebind && v === event.key,
        )
      ) {
        this.toast(t("options.conflict"), true);
        return;
      }
      this.settings.keys[this.pendingRebind] = event.key;
      this.pendingRebind = null;
      void saveSettings(this.settings);
      this.options();
      return;
    }
    if (["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)) return;
    if (this.panel) {
      if (
        event.key === "Escape" &&
        !["intro", "summary", "cinematic"].includes(this.panel) &&
        !this.dialog?.onComplete &&
        !this.dialog?.choices.length
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.close();
        return;
      }
      if (event.key === "Tab") {
        const focusable = Array.from(
          this.modalRoot.querySelectorAll<HTMLElement>(
            "button:not(:disabled),input:not([type=hidden]),select",
          ),
        );
        const first = focusable[0],
          last = focusable[focusable.length - 1];
        if (event.shiftKey && document.activeElement === first) {
          last?.focus();
          event.preventDefault();
        } else if (!event.shiftKey && document.activeElement === last) {
          first?.focus();
          event.preventDefault();
        }
      }
      if (event.key === " " && this.panel === "dialogue") {
        event.preventDefault();
        event.stopImmediatePropagation();
        this.nextDialogue();
      }
      return;
    }
    if (!this.active) return;
    const k = event.key.toLowerCase(),
      keys = { ...keyDefaults, ...this.settings.keys };
    if (import.meta.env.DEV && event.key === "`") {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open("debug");
      return;
    }
    const panel =
      k === (keys.inventory ?? "i").toLowerCase() || k === "tab"
        ? "inventory"
        : k === (keys.journal ?? "j").toLowerCase()
          ? "journal"
          : k === "escape" || k === "enter"
            ? "menu"
            : null;
    if (panel) {
      event.preventDefault();
      event.stopImmediatePropagation();
      this.open(panel);
      return;
    }
    if (k === keys.nextTool || k === keys.previousTool) {
      event.preventDefault();
      const index = toolIds.indexOf(this.state.equipped);
      this.command({
        type: "equip",
        tool: toolIds[
          (index + (k === keys.nextTool ? 1 : toolIds.length - 1)) %
            toolIds.length
        ]!,
      });
    }
    if (/^[1-8]$/.test(k)) {
      event.preventDefault();
      this.command({ type: "equip", tool: toolIds[Number(k) - 1]! });
    }
  }
  private bindTouch() {
    this.root.querySelectorAll<HTMLElement>("[data-dir]").forEach((el) => {
      const stop = () => {
        if (this.touchTimer) clearInterval(this.touchTimer);
        this.touchTimer = null;
      };
      el.addEventListener("pointerdown", (event) => {
        if (this.root.classList.contains("touch-edit")) return;
        event.preventDefault();
        el.setPointerCapture(event.pointerId);
        const now = performance.now();
        if (
          now - this.touchLastTap < 300 &&
          this.touchLastDirection === el.dataset.dir
        )
          this.world?.toggleRun();
        this.touchLastTap = now;
        this.touchLastDirection = el.dataset.dir ?? "";
        const move = () => {
          if (this.panel) return;
          const dir = el.dataset.dir;
          this.world?.move(
            dir === "left" ? -1 : dir === "right" ? 1 : 0,
            dir === "up" ? -1 : dir === "down" ? 1 : 0,
          );
        };
        move();
        this.touchTimer = setInterval(move, 180);
      });
      el.addEventListener("pointerup", stop);
      el.addEventListener("pointercancel", stop);
    });
    for (const [id, selector] of [
      ["pad", ".touch-pad"],
      ["buttons", ".touch-actions"],
    ] as const) {
      const group = this.root.querySelector<HTMLElement>(selector),
        frame = this.root.querySelector<HTMLElement>(".world-frame");
      if (!group || !frame) continue;
      const apply = () => {
        const pos = this.settings.touchLayout[id] ?? {
          x: id === "pad" ? 0.035 : 0.97,
          y: 0.97,
        };
        group.style.position = "absolute";
        group.style.left = `calc((100% - ${group.offsetWidth}px) * ${pos.x})`;
        group.style.top = `calc((100% - ${group.offsetHeight}px) * ${pos.y})`;
      };
      requestAnimationFrame(apply);
      let drag: {
        pointer: number;
        x: number;
        y: number;
        left: number;
        top: number;
      } | null = null;
      group.addEventListener(
        "pointerdown",
        (e) => {
          if (!this.root.classList.contains("touch-edit")) return;
          e.preventDefault();
          e.stopPropagation();
          const r = group.getBoundingClientRect(),
            f = frame.getBoundingClientRect();
          drag = {
            pointer: e.pointerId,
            x: e.clientX,
            y: e.clientY,
            left: r.left - f.left,
            top: r.top - f.top,
          };
          group.setPointerCapture(e.pointerId);
        },
        true,
      );
      group.addEventListener("pointermove", (e) => {
        if (!drag || drag.pointer !== e.pointerId) return;
        const f = frame.getBoundingClientRect();
        const x = Math.max(
            0,
            Math.min(
              1,
              (drag.left + e.clientX - drag.x) /
                Math.max(1, f.width - group.offsetWidth),
            ),
          ),
          y = Math.max(
            0,
            Math.min(
              1,
              (drag.top + e.clientY - drag.y) /
                Math.max(1, f.height - group.offsetHeight),
            ),
          );
        this.settings.touchLayout[id] = { x, y };
        apply();
      });
      group.addEventListener("pointerup", () => {
        if (drag) {
          drag = null;
          void saveSettings(this.settings);
        }
      });
    }
  }
  private toast(message: string, error = false) {
    const toast = document.createElement("div");
    toast.className = `toast ${error ? "error" : ""}`;
    toast.textContent = message;
    this.toastRoot.append(toast);
    while (this.toastRoot.childElementCount > 3)
      this.toastRoot.firstElementChild?.remove();
    setTimeout(() => toast.remove(), 4200);
  }
  private download(text: string, name: string) {
    const blob = new Blob([text], { type: "application/json" });
    const url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  private debug() {
    if (!import.meta.env.DEV) return;
    this.modal(
      t("debug.title"),
      `<div class="grid-two"><label class="field">${t("debug.id")}<select id="debug-action">${["money", "day", "minute", "weather", "item", "grow", "friendship", "flag", "event", "teleport", "overlay", "fastForward"].map((v) => `<option value="${v}">${t(`debug.${v === "day" ? "date" : v}`)}</option>`).join("")}</select></label><label class="field">${t("debug.id")}<input id="debug-id" list="debug-ids"><datalist id="debug-ids">${[...items, ...npcs, ...maps].map((i) => `<option value="${i.id}">${esc(i.name)}</option>`).join("")}</datalist></label><label class="field">${t("debug.value")}<input id="debug-value" value="10000"></label></div><div class="divider"></div>${button(t("debug.apply"), "debugApply", {}, "primary")}${button(t("debug.inspect"), "export")}`,
    );
  }
  private applyDebug() {
    if (!import.meta.env.DEV) return;
    const action =
        this.modalRoot.querySelector<HTMLSelectElement>("#debug-action")!.value,
      id = this.modalRoot.querySelector<HTMLInputElement>("#debug-id")!.value,
      value =
        this.modalRoot.querySelector<HTMLInputElement>("#debug-value")!.value;
    if (action === "overlay") {
      this.debugOverlay = !this.debugOverlay;
      this.close();
    } else if (action === "event") {
      const scene = [
        ...narrative.heartEvents,
        ...narrative.marriageEvents,
        ...narrative.arcEvents,
        narrative.bloom,
        narrative.vote,
      ].find((e) => e.id === id);
      if (scene) this.playDialogue(scene.title, scene.lines, scene.npc);
    } else if (action === "teleport") {
      this.command({ type: "debug", action: "teleport", id, value });
      this.close();
    } else if (action === "fastForward") {
      for (let i = 0; i < Math.min(300, Number(value)); i++)
        dispatch(this.state, { type: "sleep" });
      this.updateHud();
      this.open("summary");
    } else this.command({ type: "debug", action, id, value });
  }
}
