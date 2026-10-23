import { button, esc, t } from "./i18n";
import { crops, npcs } from "../data/catalog";
import type { GameState } from "../state/game";
export type FishBehavior = "calm" | "darting" | "sinker" | "leaper";
export type MinigameOptions = {
  onComplete: (score: number) => void;
  onCancel: () => void;
  difficulty: number;
  sfx: (name: string) => void;
  state?: GameState;
  fishBehavior?: FishBehavior;
  biteDelaySeconds?: number;
  onCast?: (charge: number) => void;
};
const clamp = (n: number, min = 0, max = 1) => Math.max(min, Math.min(max, n));
function session(container: HTMLElement, options: MinigameOptions) {
  const abort = new AbortController();
  let active = true,
    frame = 0,
    last = 0;
  const cleanup = () => {
    active = false;
    abort.abort();
    cancelAnimationFrame(frame);
  };
  const finish = (score: number) => {
    if (!active) return;
    cleanup();
    options.onComplete(score);
  };
  const cancel = () => {
    if (!active) return;
    cleanup();
    options.onCancel();
  };
  const listen = (
    target: EventTarget,
    name: string,
    callback: (event: Event) => void,
  ) => target.addEventListener(name, callback, { signal: abort.signal });
  listen(window, "keydown", (event) => {
    const e = event as KeyboardEvent;
    if (e.key === "Escape") {
      e.preventDefault();
      e.stopImmediatePropagation();
      cancel();
    }
  });
  const animate = (tick: (dt: number) => void) => {
    const loop = (now: number) => {
      if (!active) return;
      const dt = last ? Math.min(0.05, (now - last) / 1000) : 0;
      last = now;
      if (!document.hidden) tick(dt);
      if (active) frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
  };
  const status = (text: string) => {
    const node = container.querySelector<HTMLElement>("[data-status]");
    if (node) node.textContent = text;
  };
  const click = (fn: (action: string, value: string, event: Event) => void) =>
    listen(container, "click", (event) => {
      const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-action]",
      );
      if (!target) return;
      event.stopPropagation();
      const action = target.dataset.action ?? "";
      if (action === "mg-cancel") cancel();
      else fn(action, target.dataset.value ?? "", event);
    });
  const keyboard = (fn: (key: string) => void) =>
    listen(window, "keydown", (event) => {
      const e = event as KeyboardEvent;
      if (e.repeat || e.key === "Escape") return;
      if (
        [
          " ",
          "Enter",
          "ArrowLeft",
          "ArrowRight",
          "ArrowUp",
          "ArrowDown",
          "1",
          "2",
          "3",
          "4",
        ].includes(e.key)
      ) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fn(e.key);
      }
    });
  return { cleanup, finish, cancel, listen, animate, status, click, keyboard };
}
const cancelButton = () =>
  button(esc(t("app.cancel")), "mg-cancel", {}, "quiet");
const statusMarkup = '<p data-status role="status" aria-live="polite"></p>';
const meter = (key: string, attribute: string) =>
  `<label>${esc(t(key))}</label><div class="meter ${attribute === "tension" ? "tension" : ""}" role="progressbar" aria-label="${esc(t(key))}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0" data-${attribute}><div style="width:0%"></div></div>`;
function updateMeter(container: HTMLElement, name: string, value: number) {
  const node = container.querySelector<HTMLElement>(`[data-${name}]`);
  if (node) {
    node.setAttribute("aria-valuenow", String(Math.round(value * 100)));
    const fill = node.firstElementChild as HTMLElement | null;
    if (fill) fill.style.width = `${value * 100}%`;
  }
}
/** Deterministic movement profiles; encounter selection and bite delay come from the simulation. */
export function fishingPosition(
  behavior: FishBehavior,
  seconds: number,
  difficulty: number,
): number {
  const time = seconds * clamp(difficulty, 0.5, 2);
  switch (behavior) {
    case "darting":
      return clamp(
        0.5 +
          Math.tanh(Math.sin(time * 1.55) * 3) * 0.29 +
          Math.sin(time * 4.1) * 0.04,
        0.08,
        0.92,
      );
    case "sinker":
      return clamp(
        0.3 +
          (0.5 + Math.sin(time * 0.55) * 0.5) ** 2 * 0.5 +
          Math.sin(time * 2) * 0.025,
        0.08,
        0.92,
      );
    case "leaper":
      return clamp(
        0.36 +
          Math.max(0, Math.sin(time * 1.3)) ** 4 * 0.45 +
          Math.sin(time * 0.45) * 0.12,
        0.08,
        0.92,
      );
    default:
      return clamp(
        0.5 + Math.sin(time * 0.65) * 0.23 + Math.sin(time * 1.1) * 0.04,
        0.08,
        0.92,
      );
  }
}
export function startFishing(
  container: HTMLElement,
  options: MinigameOptions,
): () => void {
  const game = session(container, options);
  const difficulty = clamp(options.difficulty, 0.5, 2);
  const behavior = options.fishBehavior ?? "calm";
  const biteDelay = clamp(options.biteDelaySeconds ?? 2.5, 0.5, 8);
  container.innerHTML = `<div data-cast-stage><p>${esc(t("fish.castHelp"))}</p><div class="minigame-stage">${meter("fish.castPower", "cast-power")}<div class="reel-track" aria-hidden="true"><div data-bobber class="reel-fish" style="left:10%;background:#b96b54"></div></div></div></div><div data-reel-stage hidden><p>${esc(t("fish.desc"))}</p><p class="muted">${esc(t("fish.controls"))}</p><p class="muted">${esc(t(`fish.behavior.${behavior}`))}</p><div class="minigame-stage"><div class="reel-track" aria-hidden="true"><div class="reel-window"></div><div class="reel-fish"></div></div><div class="stack">${meter("fish.progress", "catch")}${meter("fish.tension", "tension")}</div></div></div>${statusMarkup}<div class="row wrap">${button(esc(t("fish.cast")), "mg-cast", {}, "primary")}${button(esc(t("fish.reel")), "mg-reel", {}, "primary")}${button(esc(t("fish.release")), "mg-release")}${cancelButton()}</div>`;
  const windowNode = container.querySelector<HTMLElement>(".reel-window")!,
    fishNode = container.querySelector<HTMLElement>(
      "[data-reel-stage] .reel-fish",
    )!,
    bobber = container.querySelector<HTMLElement>("[data-bobber]")!,
    castButton = container.querySelector<HTMLButtonElement>(
      "[data-action=mg-cast]",
    )!,
    reel = container.querySelector<HTMLButtonElement>("[data-action=mg-reel]")!,
    releaseButton = container.querySelector<HTMLButtonElement>(
      "[data-action=mg-release]",
    )!;
  reel.hidden = true;
  releaseButton.hidden = true;
  let phase: "casting" | "waiting" | "reeling" = "casting",
    charging = false,
    chargeTime = 0,
    charge = 0.15,
    waiting = 0,
    held = false,
    position = 0.38,
    velocity = 0,
    elapsed = 0,
    progress = 0.12,
    tension = 0.1,
    overlapTime = 0;
  container.dataset.fishingPhase = phase;
  game.status(t("fish.castHelp"));
  const cast = () => {
    if (phase !== "casting" || !charging) return;
    charging = false;
    phase = "waiting";
    container.dataset.fishingPhase = phase;
    castButton.hidden = true;
    castButton.setAttribute("aria-pressed", "false");
    bobber.style.left = `${15 + charge * 70}%`;
    game.status(t("fish.waitHelp"));
    options.sfx("fish_cast");
    options.onCast?.(charge);
  };
  const beginCharge = () => {
    if (phase !== "casting" || charging) return;
    charging = true;
    chargeTime = 0;
    castButton.setAttribute("aria-pressed", "true");
    game.status(t("fish.charging"));
  };
  const release = () => {
    held = false;
    reel.setAttribute("aria-pressed", "false");
  };
  const hold = (event: Event) => {
    event.preventDefault();
    if (phase === "casting") beginCharge();
    else if (phase === "reeling") {
      held = true;
      reel.setAttribute("aria-pressed", "true");
    }
  };
  game.listen(castButton, "pointerdown", hold);
  game.listen(reel, "pointerdown", hold);
  game.listen(window, "pointerup", () => {
    if (phase === "casting") cast();
    release();
  });
  game.listen(window, "pointercancel", () => {
    charging = false;
    castButton.setAttribute("aria-pressed", "false");
    release();
  });
  game.listen(window, "blur", () => {
    charging = false;
    castButton.setAttribute("aria-pressed", "false");
    release();
  });
  game.listen(window, "keydown", (event) => {
    const e = event as KeyboardEvent;
    if ((e.code === "Space" || e.code === "KeyZ") && !e.repeat) {
      e.preventDefault();
      e.stopImmediatePropagation();
      hold(e);
    }
  });
  game.listen(window, "keyup", (event) => {
    const e = event as KeyboardEvent;
    if (e.code === "Space" || e.code === "KeyZ") {
      if (phase === "casting") cast();
      release();
    }
  });
  game.click((action, _value, event) => {
    if (action === "mg-release") release();
    if (action === "mg-cast" && phase === "casting") {
      if (charging) cast();
      else beginCharge();
    }
    if (
      action === "mg-reel" &&
      phase === "reeling" &&
      (event as MouseEvent).detail === 0
    ) {
      held = !held;
      reel.setAttribute("aria-pressed", String(held));
    }
  });
  game.animate((dt) => {
    if (phase === "casting") {
      if (charging) {
        chargeTime += dt;
        charge = 0.15 + (1 - Math.abs(((chargeTime * 0.65) % 2) - 1)) * 0.85;
        updateMeter(container, "cast-power", charge);
      }
      return;
    }
    if (phase === "waiting") {
      waiting += dt;
      bobber.style.transform = `translateY(${Math.sin(waiting * 3) * 2}px)`;
      if (waiting >= biteDelay) {
        phase = "reeling";
        container.dataset.fishingPhase = phase;
        container.querySelector<HTMLElement>("[data-cast-stage]")!.hidden =
          true;
        container.querySelector<HTMLElement>("[data-reel-stage]")!.hidden =
          false;
        reel.hidden = false;
        releaseButton.hidden = false;
        reel.focus();
        options.sfx("fish_bite");
        game.status(t("fish.bite"));
      }
      return;
    }
    elapsed += dt;
    const fish = fishingPosition(behavior, elapsed, difficulty);
    velocity = clamp(velocity + (held ? 0.65 : -0.48) * dt, -0.42, 0.42);
    position = clamp(position + velocity * dt, 0.12, 0.88);
    const windowRadius = 0.12 + (2 - difficulty) * 0.035 + charge * 0.025;
    const overlap = Math.abs(position - fish) < windowRadius;
    tension = clamp(tension + (held ? 0.17 + difficulty * 0.04 : -0.32) * dt);
    if (overlap) overlapTime += dt;
    progress = clamp(
      progress + (overlap && tension < 0.92 ? 0.074 : -0.014) * dt,
    );
    if (tension >= 0.98) {
      progress = Math.max(0.05, progress - dt * 0.09);
      game.status(t("fish.ease"));
    } else if (overlap) game.status(t("fish.following"));
    else game.status(t("fish.bite"));
    windowNode.style.left = `${(position - windowRadius) * 100}%`;
    windowNode.style.width = `${windowRadius * 200}%`;
    fishNode.style.left = `${fish * 94}%`;
    updateMeter(container, "catch", progress);
    updateMeter(container, "tension", tension);
    if (progress >= 1 || elapsed >= 26) {
      options.sfx("fish_catch");
      game.finish(clamp(0.2 + (overlapTime / Math.max(1, elapsed)) * 0.8));
    }
  });
  return game.cleanup;
}
export function startFestival(
  container: HTMLElement,
  festivalId: string,
  options: MinigameOptions,
): () => void {
  if (festivalId === "fishing_derby")
    return startFishing(container, {
      ...options,
      onComplete: (skill) => options.onComplete(Math.round(skill * 100)),
    });
  if (
    ["seedling_parade", "longnight_gathering", "harvest_scales"].includes(
      festivalId,
    )
  )
    return arrange(container, festivalId, options);
  if (festivalId === "frostglass_fair") return memory(container, options);
  return rhythm(container, festivalId, options);
}
function arrange(
  container: HTMLElement,
  id: string,
  options: MinigameOptions,
): () => void {
  const game = session(container, options);
  const cart = id === "seedling_parade",
    judging = id === "harvest_scales";
  const choices = judging
    ? judgingEntries(options.state)
    : Array.from({ length: 4 }, (_, i) => ({
        label: t(`${cart ? "festival.flower" : "festival.dish"}.${i}`),
        value: i,
        quality: 0,
      }));
  const selected: number[] = [];
  let elapsed = 0;
  const draw = () => {
    container.innerHTML = `<p>${esc(t(judging ? "festival.judgeHelp" : cart ? "festival.cartHelp" : "festival.feastHelp"))}</p><div class="minigame-stage"><p>${esc(t("festival.arrangement", { n: selected.length, total: judging ? 1 : 6 }))}</p><div class="row wrap" style="min-height:72px;margin:16px 0">${selected.map((i) => `<span style="padding:12px;background:#fff2cf;border:1px solid #b3b58c">${esc(choices[i]?.label ?? "")}</span>`).join("")}</div><div class="row wrap">${choices.map((choice, i) => button(`${i + 1}. ${esc(choice.label)}`, "mg-pick", { value: i })).join("")}</div></div>${statusMarkup}<div class="row wrap">${button(esc(t("festival.undo")), "mg-undo")}${button(esc(t("festival.finish")), "mg-finish", {}, "primary")}${cancelButton()}</div>`;
  };
  const finish = () => {
    if (!selected.length) {
      game.status(t("festival.chooseFirst"));
      return;
    }
    let score = 0;
    if (judging) score = choices[selected[0] ?? 0]?.quality ?? 25;
    else if (cart) {
      const unique = new Set(selected).size;
      const symmetry = selected.filter(
        (n, i) => n === selected[selected.length - 1 - i],
      ).length;
      score = 20 + unique * 10 + (symmetry / 6) * 40;
    } else {
      const unique = new Set(selected).size;
      let pairs = 0;
      for (let i = 1; i < selected.length; i++)
        if (selected[i] !== selected[i - 1]) pairs++;
      score = 10 + unique * 10 + pairs * 10;
    }
    options.sfx("festival_win");
    game.finish(Math.round(clamp(score, 0, 100)));
  };
  const choose = (value: number) => {
    if (!choices[value]) return;
    if (judging) selected.splice(0, selected.length, value);
    else if (selected.length < 6) selected.push(value);
    options.sfx("ui_confirm");
    draw();
  };
  draw();
  game.click((action, value) => {
    if (action === "mg-pick") choose(Number(value));
    else if (action === "mg-undo") {
      selected.pop();
      draw();
    } else if (action === "mg-finish") finish();
  });
  game.keyboard((key) => {
    if (/^[1-4]$/.test(key)) choose(Number(key) - 1);
    else if (key === "Enter") finish();
  });
  game.animate((dt) => {
    elapsed += dt;
    if (elapsed >= 30 && selected.length) finish();
  });
  return game.cleanup;
}
function judgingEntries(
  state?: GameState,
): { label: string; value: number; quality: number }[] {
  const entries: { label: string; value: number; quality: number }[] = [];
  for (const item of state?.inventory ?? []) {
    const crop = crops.find((c) => c.id === item.id);
    if (crop)
      entries.push({
        label: crop.name,
        value: entries.length,
        quality: Math.min(100, 55 + item.quality * 15),
      });
  }
  for (const animal of state?.animals ?? [])
    entries.push({
      label: animal.name,
      value: entries.length,
      quality: Math.min(
        100,
        30 +
          animal.affection * 0.07 +
          (animal.fed ? 15 : 0) +
          (animal.brushed ? 10 : 0),
      ),
    });
  return entries.length
    ? entries.sort((a, b) => b.quality - a.quality).slice(0, 4)
    : [
        { label: t("festival.gardenDisplay"), value: 0, quality: 25 },
        { label: t("festival.seedDisplay"), value: 1, quality: 35 },
      ];
}
function memory(container: HTMLElement, options: MinigameOptions): () => void {
  const game = session(container, options);
  const pattern = [0, 2, 1, 3, 2, 0];
  let elapsed = 0,
    step = 0,
    score = 0,
    showing = true,
    lastLit = -1;
  container.innerHTML = `<p>${esc(t("festival.pattern"))}</p><p class="muted">${esc(t("festival.memoryHelp"))}</p><div class="minigame-stage"><div class="pattern-buttons">${Array.from({ length: 4 }, (_, i) => button(String(i + 1), "mg-pad", { value: i })).join("")}</div></div>${statusMarkup}<div class="row">${button(esc(t("festival.replay")), "mg-replay")}${cancelButton()}</div>`;
  const pads = Array.from(
    container.querySelectorAll<HTMLButtonElement>("[data-action=mg-pad]"),
  );
  const select = (n: number) => {
    if (showing) return;
    score += pattern[step] === n ? 100 / pattern.length : 0;
    step++;
    options.sfx("ui_confirm");
    pads.forEach((p, i) => p.classList.toggle("lit", i === n));
    game.status(t("festival.remembered", { n: step, total: pattern.length }));
    if (step === pattern.length) game.finish(Math.round(score));
  };
  game.click((action, value) => {
    if (action === "mg-pad") select(Number(value));
    else if (action === "mg-replay") {
      elapsed = 0;
      showing = true;
      lastLit = -1;
    }
  });
  game.keyboard((key) => {
    if (/^[1-4]$/.test(key)) select(Number(key) - 1);
  });
  game.animate((dt) => {
    elapsed += dt;
    if (showing) {
      const index = Math.floor(elapsed / 0.85);
      const lit = elapsed % 0.85 < 0.6 ? (pattern[index] ?? -1) : -1;
      if (lit !== lastLit) {
        pads.forEach((p, i) => p.classList.toggle("lit", i === lit));
        if (lit >= 0) options.sfx("ui_confirm");
        lastLit = lit;
      }
      game.status(t("festival.watch"));
      if (index >= pattern.length) {
        showing = false;
        game.status(t("festival.repeat"));
      }
    }
    if (elapsed >= 28) game.finish(Math.round(score));
  });
  return game.cleanup;
}
function rhythm(
  container: HTMLElement,
  id: string,
  options: MinigameOptions,
): () => void {
  const game = session(container, options);
  const lantern = id === "tide_lantern_night",
    ember = id === "ember_walk",
    bloom = id === "lantern_bloom_vigil";
  const key = lantern ? "lantern" : ember ? "ember" : bloom ? "bloom" : "kite";
  let elapsed = 0,
    score = 0,
    hits = 0,
    lastHit = -1,
    started = !lantern,
    companion = "";
  const names = npcs.filter((n) => n.id !== "wren").slice(0, 4);
  container.innerHTML = `<p>${esc(t(`festival.${key}Help`))}</p>${lantern ? `<div class="row wrap" data-companions>${names.map((n) => button(esc(n.name), "mg-companion", { value: n.id })).join("")}</div>` : ""}<div class="minigame-stage"><div class="festival-timing" aria-hidden="true"><div class="festival-zone"></div><div class="festival-cursor"></div></div><div class="pattern-buttons">${ember || bloom ? Array.from({ length: 4 }, (_, i) => button(String(i + 1), "mg-note", { value: i })).join("") : button(esc(t("festival.tap")), "mg-note", { value: 0 }, "primary")}</div></div>${statusMarkup}${meter("festival.progress", "round")}<div class="row">${cancelButton()}</div>`;
  const cursor = container.querySelector<HTMLElement>(".festival-cursor")!,
    zone = container.querySelector<HTMLElement>(".festival-zone")!,
    pads = Array.from(
      container.querySelectorAll<HTMLButtonElement>("[data-action=mg-note]"),
    );
  const duration = 24,
    beat = 2.4,
    rounds = 10,
    width = clamp(0.34 / options.difficulty, 0.2, 0.5);
  zone.style.left = `${(1 - width) * 50}%`;
  zone.style.width = `${width * 100}%`;
  const hit = (note: number) => {
    if (!started) {
      game.status(t("festival.guest"));
      return;
    }
    const round = Math.floor(elapsed / beat);
    if (lastHit === round) return;
    lastHit = round;
    const phase = (elapsed % beat) / beat;
    const closeness = clamp(1 - Math.abs(phase - 0.5) / (width * 0.8));
    const expected = ember
      ? [0, 1, 3, 2, 1, 0, 2, 3, 1, 2][round % 10]
      : round % 4;
    const correct = !(ember || bloom) || note === expected;
    score += correct ? closeness * 10 : 0;
    hits++;
    options.sfx(correct ? "ui_confirm" : "ui_back");
    game.status(
      t(correct && closeness > 0.5 ? "festival.good" : "festival.gentle"),
    );
  };
  game.click((action, value) => {
    if (action === "mg-note") hit(Number(value));
    if (action === "mg-companion") {
      companion = value;
      started = true;
      options.sfx("ui_confirm");
      container.querySelector("[data-companions]")?.remove();
    }
  });
  game.keyboard((key) => {
    if (/^[1-4]$/.test(key)) {
      if (!started) {
        companion = names[Number(key) - 1]?.id ?? "";
        started = Boolean(companion);
        container.querySelector("[data-companions]")?.remove();
      } else hit(Number(key) - 1);
    } else if (key === " " || key === "Enter") hit(0);
  });
  game.status(t(lantern ? "festival.guest" : "festival.ready"));
  game.animate((dt) => {
    if (!started) return;
    elapsed += dt;
    const round = Math.min(rounds - 1, Math.floor(elapsed / beat)),
      phase = (elapsed % beat) / beat;
    cursor.style.left = `${phase * 99}%`;
    const note = ember ? [0, 1, 3, 2, 1, 0, 2, 3, 1, 2][round] : round % 4;
    pads.forEach((p, i) => {
      const active = (ember || bloom) && i === note;
      p.classList.toggle("lit", active);
      p.setAttribute("aria-pressed", String(active));
    });
    updateMeter(container, "round", Math.min(1, elapsed / duration));
    if (elapsed >= duration) {
      options.sfx("festival_win");
      game.finish(
        Math.round(
          clamp(score + (companion ? 5 : 0) + (hits > 0 ? 5 : 0), 0, 100),
        ),
      );
    }
  });
  return game.cleanup;
}
