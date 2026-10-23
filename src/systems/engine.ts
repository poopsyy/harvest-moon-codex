import { sunrootDiscoveries, canDiscoverSunroot } from "../data/sunroots";
import { systemText } from "../core/localization";
import {
  crops as fieldCrops,
  flowers,
  achievements,
  shops,
  items,
  npcs,
  fish,
  forage,
  minerals,
  recipes,
  processedGoods,
  festivals,
  maps,
  buildings,
  trees,
} from "../data/catalog";
import {
  dialogue,
  heartEvents,
  arcs,
  arcEvents,
  marriageEvents,
  chapters,
  journalPages,
} from "../data/narrative";
import { generateMineFloor } from "./mine";
import { layoutFor, isBlocked } from "../core/world-layout";
import {
  plantGrass,
  cutGrass,
  hasGrass,
  grassKey,
  feedFromSilo,
  grazeAnimal,
} from "./pasture";
import { safeAnimalName } from "../core/names";
import { random, clamp } from "../core/rng";
import type {
  GameState,
  GameEvent,
  Command,
  Season,
  Weather,
  Stack,
  Plot,
} from "../state/game";
export type { Command, GameEvent } from "../state/game";
const crops = [...fieldCrops, ...flowers];
const seasons: Season[] = ["spring", "summer", "autumn", "winter"];
export function getDate(s: GameState) {
  return {
    year: Math.floor(s.day / 120) + 1,
    season: seasons[Math.floor(s.day / 30) % 4]!,
    day: (s.day % 30) + 1,
    weekday: s.day % 7,
  };
}
const price = (id: string) => items.find((i) => i.id === id)?.price ?? 0;
const qualityValue = [1, 1.25, 1.5, 2];
export function quantity(s: GameState, id: string) {
  return s.inventory
    .filter((i) => i.id === id)
    .reduce((n, i) => n + i.quantity, 0);
}
export function addItem(
  s: GameState,
  id: string,
  count = 1,
  quality = 0,
): boolean {
  if (count <= 0 || !Number.isFinite(count)) return false;
  const stack = s.inventory.find((i) => i.id === id && i.quality === quality);
  if (stack) {
    stack.quantity += count;
    return true;
  }
  if (s.inventory.length >= (s.flags.backpack ? 36 : 24)) return false;
  s.inventory.push({ id, quantity: count, quality });
  return true;
}
export function takeItem(s: GameState, id: string, count = 1): boolean {
  if (count <= 0 || !Number.isInteger(count) || quantity(s, id) < count)
    return false;
  for (const stack of s.inventory) {
    if (stack.id === id) {
      const n = Math.min(count, stack.quantity);
      stack.quantity -= n;
      count -= n;
      if (count === 0) break;
    }
  }
  s.inventory = s.inventory.filter((i) => i.quantity > 0);
  return true;
}
function spend(s: GameState, n: number) {
  if (s.stamina < n) return false;
  s.stamina -= n;
  if (
    s.stamina < 20 ||
    ["rain", "snow", "storm", "blizzard"].includes(s.weather)
  )
    s.fatigue = clamp(s.fatigue + 2, 0, 100);
  return true;
}
function weather(s: GameState): Weather {
  const r = random(s);
  return getDate(s).season === "winter"
    ? r < 0.08
      ? "blizzard"
      : r < 0.45
        ? "snow"
        : r < 0.7
          ? "cloudy"
          : "sunny"
    : r < 0.06
      ? "storm"
      : r < 0.3
        ? "rain"
        : r < 0.5
          ? "cloudy"
          : "sunny";
}
function flag(s: GameState, id: string, events: GameEvent[], message = id) {
  if (!s.flags[id]) {
    s.flags[id] = true;
    if (id === "bloom" && s.flags.evaluated) {
      s.flags.vote_seen = false;
      events.push({
        type: "Revote",
        message: systemText(
          "the_restored_lantern_tree_brings_the_council_together",
        ),
      });
    }
    s.journal.push(id);
    events.push({ type: "FlagSet", id, message });
    const chapter = chapters.find((ch) => ch.flag === id);
    if (chapter)
      for (const line of chapter.lines)
        events.push({ type: "Dialogue", id: chapter.id, message: line });
  }
}
function friend(s: GameState, id: string, n: number) {
  s.friendship[id] = clamp((s.friendship[id] ?? 0) + n, 0, 1000);
}
function plotKey(s: GameState, x: number, y: number) {
  return `${s.player.map === "greenhouse" ? "g:" : ""}${x},${y}`;
}
function target(s: GameState, c: { x?: number; y?: number }) {
  const [dx, dy] =
    s.player.facing === "up"
      ? [0, -1]
      : s.player.facing === "left"
        ? [-1, 0]
        : s.player.facing === "right"
          ? [1, 0]
          : [0, 1];
  return {
    x: Math.round(clamp(c.x ?? s.player.x + dx!, 0, 79)),
    y: c.y ?? s.player.y + dy!,
  };
}
function getPlot(s: GameState, x: number, y: number): Plot {
  const key = plotKey(s, x, y);
  return (s.plots[key] ??= {
    x,
    y,
    tilled: false,
    watered: false,
    fertilizer: 0,
    crop: null,
    growth: 0,
    quality: 0,
    withered: false,
    dryDays: 0,
    streak: 0,
  });
}
export function evaluate(s: GameState) {
  const restored = !!s.flags.bloom;
  const completed = arcs.filter((a) => s.flags[`arc_${a.id}`]).length;
  const average =
    npcs.reduce((n, p) => n + (s.friendship[p.id] ?? 0), 0) / npcs.length;
  const score = Math.round(
    (restored ? 350 : 0) +
      completed * 35 +
      average * 0.2 +
      Math.min(150, s.stats.totalEarned / 1000) +
      Math.min(100, Object.keys(s.collections).length * 2) +
      Math.min(60, s.stats.festivals * 8) +
      Object.keys(s.buildings).length * 10 +
      (s.relationships.spouse ? 40 : 0) +
      s.animals.reduce((n, a) => n + a.affection / 10, 0),
  );
  return {
    score,
    tier: restored
      ? score >= 850
        ? systemText("thriving_willowmere")
        : systemText("steady_willowmere")
      : systemText("uncertain_willowmere"),
    restored,
    arcs: completed,
    friendship: Math.round(average),
  };
}
export function selectDialogue(s: GameState, npc: string): string {
  const d = getDate(s);
  const candidates = dialogue.filter(
    (l) =>
      l.npc === npc &&
      (!l.season || l.season === d.season) &&
      (!l.weather || l.weather === s.weather) &&
      (!l.minFriendship || (s.friendship[npc] ?? 0) >= l.minFriendship) &&
      (l.married === undefined ||
        l.married === (s.relationships.spouse === npc)) &&
      (!l.festival ||
        festivals.some(
          (f) =>
            f.id === l.festival &&
            f.season === d.season &&
            f.day === d.day &&
            (f.id !== "lantern_bloom_vigil" || s.flags.bloom),
        )),
  );
  const score = (l: (typeof dialogue)[number]) =>
    (l.priority ?? 0) +
    (l.season ? 2 : 0) +
    (l.weather ? 2 : 0) +
    (l.minFriendship ? 3 : 0) +
    (l.married !== undefined ? 4 : 0) +
    (l.festival ? 8 : 0);
  candidates.sort((a, b) => score(b) - score(a) || a.id.localeCompare(b.id));
  const line =
    candidates.find((l) => s.day - (s.dialogueHistory[l.id] ?? -99) > 7) ??
    candidates[0];
  if (!line) return systemText("the_village_is_quiet_for_a_moment");
  s.dialogueHistory[line.id] = s.day;
  return line.text.replaceAll("{player}", s.player.name);
}
export function npcAvailable(s: GameState, id: string): boolean {
  const d = getDate(s);
  if (id === "june" && s.day < 60) return false;
  if (id === "wren" && !s.flags.wren_returned) return false;
  if (id === "ozzie" && ![4, 5].includes(d.weekday)) return false;
  if (id === "halverd" && !s.flags.halverd_resigned) {
    return d.season === "spring"
      ? d.day >= 18 && d.day <= 21
      : d.season === "summer"
        ? d.day >= 15 && d.day <= 18
        : d.season === "autumn"
          ? d.day >= 12 && d.day <= 15
          : false;
  }
  return npcs.some((n) => n.id === id);
}
export function resolveSchedule(s: GameState, id: string) {
  const n = npcs.find((n) => n.id === id);
  if (!n || !npcAvailable(s, id)) return null;
  if (s.relationships.spouse === id && s.minute < 540)
    return { map: "farmhouse", x: 8, y: 8 };
  const d = getDate(s);
  if (
    festivals.some(
      (f) =>
        f.season === d.season &&
        f.day === d.day &&
        (f.id !== "lantern_bloom_vigil" || s.flags.bloom),
    ) &&
    s.minute >= 600 &&
    s.minute < 1200
  )
    return {
      map: "square",
      x: 12 + (npcs.indexOf(n) % 8),
      y: 12 + Math.floor(npcs.indexOf(n) / 8),
    };
  const rule = [...n.scheduleRules]
    .filter(
      (r) =>
        (!r.weekdays.length || r.weekdays.includes(d.weekday)) &&
        (!r.seasons.length || r.seasons.includes(d.season)) &&
        (!r.weather.length || r.weather.includes(s.weather)) &&
        !r.festival,
    )
    .sort((a, b) => b.priority - a.priority)[0];
  const steps = rule?.steps ?? n.schedule;
  return (
    [...steps].reverse().find((p) => p.hour * 60 <= s.minute) ??
    steps[0] ?? { map: n.home, x: 6, y: 7 }
  );
}
export function unlockAchievements(s: GameState): void {
  const stats: Record<string, number> = {
    ...s.stats,
    crops: s.stats.harvested,
    fishSpecies: Object.keys(s.fishRecords).length,
    cooked: Object.keys(s.collections).filter((k) => k.startsWith("cooked_"))
      .length,
    recipes: Object.keys(s.collections).filter((k) => k.startsWith("cooked_"))
      .length,
    friendship: Math.max(0, ...Object.values(s.friendship)),
    friends: Object.values(s.friendship).filter((v) => v >= 300).length,
    animals: s.animals.length,
    affection: Math.max(0, ...s.animals.map((a) => a.affection)),
    mineFloor: s.mine.maxFloor,
    minerals: minerals.filter((m) => s.collections[`mineral_${m.id}`]).length,
    festivalTypes: festivals.filter((f) => s.flags[`attended_${f.id}`]).length,
    buildings: Object.values(s.buildings).filter((v) => v > 0).length,
    greenhouse: s.buildings.greenhouse ?? 0,
    trees: s.trees.length,
    treeTypes: new Set(s.trees.map((t) => t.id)).size,
    journal: s.journal.filter((j) => j.startsWith("page_")).length,
    bloom: Number(!!s.flags.bloom),
    married: Number(!!s.relationships.spouse),
    child: Number(!!s.relationships.child),
    vote: Number(!!s.flags.evaluated),
  };
  for (const a of achievements)
    if ((stats[a.stat] ?? 0) >= a.threshold && !s.achievements.includes(a.id))
      s.achievements.push(a.id);
}
export function advanceDay(s: GameState): GameEvent[] {
  const events: GameEvent[] = [];
  const old = getDate(s);
  const collapsed = s.minute >= 1560;
  const recovery = collapsed ? 0.5 : s.minute >= 1440 ? 0.75 : 1;
  const penalty = collapsed ? Math.min(1000, Math.floor(s.money * 0.1)) : 0;
  s.money -= penalty;
  if (collapsed) {
    s.player.map = "farmhouse";
    s.player.x = 8;
    s.player.y = 8;
    s.flags.riding = false;
  }
  let earned = 0;
  for (const stack of s.shipping) {
    earned += Math.floor(
      price(stack.id) * stack.quantity * (qualityValue[stack.quality] ?? 1),
    );
    s.collections[stack.id] = (s.collections[stack.id] ?? 0) + stack.quantity;
    if (crops.some((c) => c.id === stack.id)) {
      s.stats.cropsShipped += stack.quantity;
      s.collections[`spring_crops`] =
        (s.collections.spring_crops ?? 0) +
        (old.season === "spring" ? stack.quantity : 0);
    }
  }
  s.money += earned;
  s.stats.totalEarned += earned;
  s.lastSummary = {
    earned,
    items: s.shipping.map((i) => ({ ...i })),
    events: collapsed
      ? [`A neighbor brought you home. Recovery cost: ${penalty}G.`]
      : [],
  };
  s.shipping = [];
  s.day++;
  s.stats.daysPlayed++;
  s.minute = 360;
  s.cold = s.fatigue >= 90;
  if (s.cold) {
    s.player.map = "farmhouse";
    s.player.x = 8;
    s.player.y = 8;
    s.lastSummary.events.push(
      systemText("a_heavy_cold_keeps_you_in_bed_today"),
    );
  }
  s.stamina = Math.floor(s.maxStamina * (s.cold ? 0.25 : recovery));
  s.fatigue = Math.max(0, s.fatigue - (s.cold ? 70 : 30));
  s.weather = s.forecast;
  s.forecast = weather(s);
  const wet = ["rain", "storm"].includes(s.weather);
  let pests = random(s) < 0.06 ? 1 + Math.floor(random(s) * 3) : 0;
  for (const [key, p] of Object.entries(s.plots)) {
    const crop = crops.find((c) => c.id === p.crop);
    if (crop) {
      if (!key.startsWith("g:") && crop.season !== getDate(s).season) {
        p.withered = true;
      } else if (p.watered && !p.withered) {
        p.growth++;
        p.streak++;
        p.quality = clamp(
          p.fertilizer + (p.streak > 5 ? 1 : 0) + (random(s) < 0.08 ? 1 : 0),
          0,
          3,
        );
      }
      const protectedField = s.decorations.some(
        (d) =>
          ["wind_ward", "crow_kite"].includes(d.id) &&
          Math.abs(d.x - p.x) < 7 &&
          Math.abs(d.y - p.y) < 7,
      );
      if (!protectedField && s.weather === "storm" && random(s) < 0.04)
        p.withered = true;
      if (
        !protectedField &&
        !key.startsWith("g:") &&
        pests > 0 &&
        !p.withered
      ) {
        p.crop = null;
        pests--;
        s.lastSummary.events.push(
          systemText("crows_nibbled_an_unprotected_crop_a_crow_kite"),
        );
      }
    } else if (!p.watered && ++p.dryDays >= 3) p.tilled = false;
    p.watered = wet && !key.startsWith("g:");
  }
  for (const t of s.trees) {
    t.age++;
    t.fruit =
      t.age >= 28 &&
      trees.some((x) => x.id === t.id && x.season === getDate(s).season);
  }
  for (const a of [...s.animals]) {
    a.age++;
    if (a.fed) {
      a.neglect = 0;
      a.affection = clamp(a.affection + 3, 0, 255);
    } else {
      a.neglect++;
      a.affection = clamp(a.affection - 8, 0, 255);
    }
    if (a.neglect >= 3 || (a.outside && wet)) {
      a.sick = true;
    }
    if (a.neglect >= 10) {
      a.away = true;
      s.mail.push(`animal_missing_${a.id}`);
    }
    a.product =
      !a.sick &&
      !a.away &&
      a.fed &&
      a.age >= (a.kind === "chicken" ? 7 : 14) &&
      (a.kind !== "sheep" || s.day % 3 === 0);
    a.fed = false;
    grazeAnimal(s, a);
    a.petted = false;
    a.brushed = false;
    if (a.pregnant !== null && s.day >= a.pregnant) {
      s.animals.push({
        ...a,
        id: `animal_${s.day}_${s.animals.length}`,
        name: systemText("junior", { value0: a.name.slice(0, 8) }),
        age: 0,
        affection: 20,
        pregnant: null,
        product: false,
      });
      a.pregnant = null;
    }
  }
  for (const n of npcs) {
    const last = s.talked[n.id] ?? 0;
    if (s.day - last >= 7) {
      const floor = heartEvents
        .filter((e) => e.npc === n.id && s.flags[e.flag])
        .reduce((v, e) => Math.max(v, e.hearts * 100 - 50), 0);
      s.friendship[n.id] = Math.max(floor, (s.friendship[n.id] ?? 0) - 2);
    }
  }
  for (const [id, ready] of Object.entries(s.construction))
    if (s.day >= ready) {
      s.buildings[id] = (s.buildings[id] ?? 0) + 1;
      const match = id.match(/^(house|coop|barn|silo)_([123])$/);
      if (match) s.buildings[match[1]!] = Number(match[2]);
      delete s.construction[id];
      events.push({
        type: "BuildingCompleted",
        id,
        message: systemText("is_ready", { value0: id.replaceAll("_", " ") }),
      });
    }
  for (const t of Object.values(s.tools))
    if (t.readyDay !== undefined && s.day >= t.readyDay) {
      t.tier++;
      delete t.readyDay;
    }
  if (s.relationships.weddingDay === s.day) {
    s.relationships.spouse = s.relationships.dating;
    s.relationships.marriedDay = s.day;
    flag(
      s,
      "married",
      events,
      systemText("the_chapel_fills_with_friends_as_you_promise"),
    );
  }
  if (s.relationships.spouse && random(s) < 0.35) {
    Object.values(s.plots)
      .slice(0, 12)
      .forEach((p) => (p.watered = true));
    s.animals.forEach((a) => (a.fed = true));
  }
  if (s.relationships.child)
    s.relationships.child.stage = Math.min(
      2,
      Math.floor((s.day - s.relationships.child.joinedDay) / 40),
    );
  if (s.day % 30 === 0 && !s.mail.includes(`wren_${getDate(s).season}`))
    s.mail.push(`wren_${getDate(s).season}`);
  const deliveries: [string, boolean][] = [
    ["bram_orchard", s.day >= 3],
    ["greta_ready", Object.values(s.tools).some((tool) => tool.tier > 0)],
    ["lira_materials", s.day >= 30],
    ["marta_thanks", !!s.flags.arc_marta_inn],
    ["ivy_open", !!s.flags.arc_ivy_bakery],
    ["ansel_schedule", !!s.flags.arc_ansel_rest],
    ["sable_gallery", !!s.flags.arc_sable_gallery],
    ["dex_city", !!s.flags.dex_city],
    ["dex_stay", !!s.flags.dex_music_night],
    ["june_honey", !!s.flags.arc_marrow_family],
    ["halverd_revision", !!s.flags.arc_halverd_choice],
    ["ozzie_ribbon", Object.values(s.friendship).some((v) => v >= 700)],
    ["odalie_birthday", s.day % 30 === s.player.birthday.day - 2],
    ["ilse_bloom", !!s.flags.bloom],
    ["wren_return", !!s.flags.wren_returned],
    ["kip_show", !!s.flags.arc_kip_confidence],
  ];
  for (const [id, ready] of deliveries)
    if (ready && !s.mail.includes(id)) s.mail.push(id);
  for (const f of festivals)
    if (f.season === getDate(s).season && f.day === getDate(s).day + 3)
      s.mail.push(`festival_${f.id}`);
  if (s.flags.winter_stone && s.day >= 120)
    flag(
      s,
      "bloom",
      events,
      systemText("every_branch_of_the_lantern_tree_opens_in"),
    );
  if (s.day >= 267 && !s.flags.evaluated) {
    flag(s, "evaluated", events, evaluate(s).tier);
    if (s.journal.filter((j) => j.startsWith("page_")).length >= 12)
      flag(
        s,
        "wren_returned",
        events,
        systemText("wren_returns_to_speak_for_the_valley"),
      );
  }
  if (s.stats.harvested >= 1 && !s.achievements.includes("first_harvest"))
    s.achievements.push("first_harvest");
  if (s.flags.bloom && !s.achievements.includes("lantern_keeper"))
    s.achievements.push("lantern_keeper");
  unlockAchievements(s);
  events.push({
    type: "DayEnded",
    amount: earned,
    message: systemText("morning_shipped_goods_earned_g", {
      value0: getDate(s).day,
      value1: earned,
    }),
  });
  return events;
}
export function tick(s: GameState, minutes: number): GameEvent[] {
  if (!Number.isFinite(minutes) || minutes <= 0) return [];
  s.minute += Math.min(1440, minutes);
  const events: GameEvent[] = [];
  for (const p of [...s.processing])
    if (s.day * 1440 + s.minute >= p.ready && addItem(s, p.id, 1, p.quality)) {
      s.processing.splice(s.processing.indexOf(p), 1);
      events.push({
        type: "Processed",
        id: p.id,
        message: systemText("is_ready", { value0: p.id.replaceAll("_", " ") }),
      });
    }
  if (s.minute >= 1560) events.push(...advanceDay(s));
  return events;
}
export function dispatch(s: GameState, c: Command): GameEvent[] {
  const events: GameEvent[] = [];
  const say = (message: string, type = "Notice") =>
    events.push({ type, message });
  const fail = (message: string) => {
    say(message, "Blocked");
    return events;
  };
  if (
    s.cold &&
    [
      "move",
      "teleport",
      "use",
      "plant",
      "water",
      "harvest",
      "clear",
      "fertilize",
      "fish",
      "mine",
      "forage",
      "plantTree",
      "ride",
    ].includes(c.type)
  )
    return fail(systemText("a_heavy_cold_keeps_you_in_bed_rest"));
  if (c.type === "wait") return tick(s, clamp(c.minutes, 1, 120));
  if (c.type === "ride") {
    if (!s.flags.horse)
      return fail(systemText("rosalind_will_introduce_you_to_a_horse_during"));
    if (maps.find((m) => m.id === s.player.map)?.kind !== "outdoor")
      return fail(systemText("your_horse_waits_outside_buildings_and_caves"));
    s.flags.riding = !s.flags.riding;
    say(
      s.flags.riding
        ? systemText("you_settle_into_the_saddle")
        : systemText("you_pat_your_horse_and_dismount"),
    );
    return events;
  }
  if (c.type === "acknowledge") {
    if (
      (c.event === "vote" && s.flags.evaluated) ||
      (c.event === "bloom" && s.flags.bloom) ||
      (c.event === "wedding" && s.relationships.spouse)
    )
      s.flags[`${c.event}_seen`] = true;
    return events;
  }
  if (c.type === "settings") {
    if (c.values.timeSpeed !== undefined)
      s.settings.timeSpeed = clamp(c.values.timeSpeed, 0.5, 2);
    if (c.values.preciseSow !== undefined)
      s.settings.preciseSow = !!c.values.preciseSow;
    if (c.values.festivalDifficulty !== undefined)
      s.settings.festivalDifficulty = clamp(
        c.values.festivalDifficulty,
        0.5,
        2,
      );
    if (c.values.runToggle !== undefined)
      s.settings.runToggle = !!c.values.runToggle;
    return events;
  }
  if (c.type === "selectSeed") {
    if (c.crop === "grass" || crops.some((crop) => crop.id === c.crop)) {
      s.selectedSeed = c.crop;
      s.equipped = "seeds";
    }
    return events;
  }
  if (c.type === "use" && s.equipped === "seeds")
    return dispatch(s, { ...c, type: "plant" });
  if (c.type === "use" && s.equipped === "hand")
    return dispatch(s, {
      ...c,
      type: ["farm", "greenhouse"].includes(s.player.map)
        ? "harvest"
        : "forage",
    });
  if (c.type === "face") {
    if (["up", "down", "left", "right"].includes(c.direction))
      s.player.facing = c.direction;
    return events;
  }
  if (c.type === "sleep") return advanceDay(s);
  if (c.type === "move") {
    const map = maps.find((m) => m.id === s.player.map);
    const dx = clamp(Math.round(c.dx), -1, 1),
      dy = clamp(Math.round(c.dy), -1, 1);
    const x = clamp(s.player.x + dx, 1, (map?.width ?? 80) - 2),
      y = clamp(s.player.y + dy, 1, (map?.height ?? 64) - 2);
    const blocked =
      s.player.map === "mine"
        ? generateMineFloor(s.seed, s.day, Math.max(1, s.mine.floor)).tiles[
            y
          ]?.[x] === "wall"
        : map
          ? isBlocked(
              map.id,
              x,
              y,
              layoutFor(
                map.id,
                map.width,
                map.height,
                map.kind === "indoor",
                map.connections,
                s.buildings,
              ),
            )
          : true;
    if (!blocked) {
      s.player.x = x;
      s.player.y = y;
    }
    s.player.facing =
      dx < 0 ? "left" : dx > 0 ? "right" : dy < 0 ? "up" : "down";
    return events;
  }
  if (c.type === "teleport") {
    const map = maps.find((m) => m.id === c.map);
    if (!map) return fail(systemText("that_path_does_not_lead_anywhere"));
    const current = maps.find((m) => m.id === s.player.map);
    if (c.map !== s.player.map && !current?.connections.includes(c.map))
      return fail(systemText("follow_a_connected_path_from_your_current_map"));
    if (c.map === "cove" && !s.flags.boat_repaired)
      return fail(systemText("repair_liras_boat_before_sailing_to_the_hidden"));
    if (c.map === "greenhouse" && !s.buildings.greenhouse)
      return fail(systemText("bram_can_build_a_greenhouse"));
    if (
      map.kind === "indoor" &&
      !["farmhouse", "coop", "barn", "greenhouse"].includes(map.id) &&
      (s.minute < 480 || s.minute >= 1080)
    )
      return fail(systemText("village_doors_open_from_800_to_1800"));
    s.player.map = c.map;
    if (map.kind !== "outdoor") s.flags.riding = false;
    s.player.x = clamp(c.x ?? 8, 1, map.width - 2);
    s.player.y = clamp(c.y ?? 8, 1, map.height - 2);
    events.push(...tick(s, 5));
    return events;
  }
  if (c.type === "equip") {
    if (!s.tools[c.tool] && !["seeds", "hand"].includes(c.tool))
      return fail(systemText("that_tool_is_not_in_the_toolbox"));
    s.equipped = c.tool;
    return events;
  }
  if (
    c.type === "use" ||
    c.type === "plant" ||
    c.type === "water" ||
    c.type === "harvest" ||
    c.type === "clear" ||
    c.type === "fertilize"
  ) {
    const cmd = c as Extract<
      Command,
      { type: "use" | "plant" | "water" | "harvest" | "clear" | "fertilize" }
    >;
    if (!["farm", "greenhouse"].includes(s.player.map))
      return fail(systemText("use_your_field_or_greenhouse_for_farming"));
    const { x, y } = target(s, cmd);
    if (x < 1 || y < 1 || x >= 79 || y >= 63)
      return fail(systemText("the_field_ends_here"));
    const key = plotKey(s, x, y);
    const p = getPlot(s, x, y);
    const tool = s.tools[s.equipped];
    if (tool?.readyDay !== undefined)
      return fail(systemText("your_tool_is_still_at_the_forge"));
    if (c.type === "plant" && (cmd.crop ?? s.selectedSeed) === "grass") {
      if (s.stamina < 1) return fail(systemText("rest_before_planting_grass"));
      const planted = plantGrass(s, x, y);
      if (!planted.ok)
        return fail(
          systemText("plant_grass_on_clear_untilled_farm_ground_outside"),
        );
      spend(s, 1);
      say(systemText("grass_roots_settle_in_cut_the_mature_patch"));
      return events;
    }
    if (
      s.player.map === "farm" &&
      hasGrass(s, x, y) &&
      c.type === "use" &&
      s.equipped === "sickle"
    ) {
      if (s.stamina < 1) return fail(systemText("rest_before_cutting_grass"));
      if (!cutGrass(s, x, y))
        return fail(systemText("let_the_grass_mature_and_leave_room_in"));
      spend(s, 1);
      say(systemText("fodder_gathered_the_roots_will_regrow_in_three"));
      return events;
    }
    if (
      c.type === "clear" ||
      (c.type === "use" && ["axe", "hammer", "sickle"].includes(s.equipped))
    ) {
      const debris = s.debris[key];
      if (!debris && p.withered) {
        p.crop = null;
        p.withered = false;
        return events;
      }
      if (!debris) return fail(systemText("there_is_nothing_to_clear"));
      const required = ["stone", "boulder"].includes(debris)
        ? "hammer"
        : debris === "weed"
          ? "sickle"
          : "axe";
      if (s.equipped !== required)
        return fail(systemText("use_the_here", { value0: required }));
      const tier = ["stump", "boulder"].includes(debris)
        ? 2
        : debris === "log"
          ? 3
          : 0;
      if ((tool?.tier ?? 0) < tier)
        return fail(systemText("upgrade_this_tool_at_the_forge"));
      if (!spend(s, required === "sickle" ? 1 : 4))
        return fail(systemText("rest_or_eat_before_working"));
      delete s.debris[key];
      if (debris === "stump")
        flag(
          s,
          "orchard_stump_cleared",
          events,
          systemText("the_oldest_orchard_stump_gives_way"),
        );
      if (debris === "boulder")
        flag(
          s,
          "orchard_boulder_cleared",
          events,
          systemText("the_orchard_boulder_is_cleared"),
        );
      addItem(
        s,
        required === "hammer"
          ? "stone"
          : required === "sickle"
            ? "fodder"
            : "wood",
        debris === "log" ? 8 : 2,
      );
      say(systemText("cleared"));
    } else if (c.type === "plant") {
      const crop = crops.find((r) => r.id === (cmd.crop ?? s.selectedSeed));
      if (!crop) return fail(systemText("choose_a_seed_first"));
      if (
        crop.season === "winter" &&
        fieldCrops.some((c) => c.id === crop.id) &&
        s.player.map !== "greenhouse"
      )
        return fail(
          systemText("winter_vegetables_need_the_warmth_of_a_greenhouse"),
        );
      if (crop.season !== getDate(s).season && s.player.map !== "greenhouse")
        return fail(systemText("these_seeds_need_another_season"));
      const plots: Plot[] = [];
      for (
        let dy = s.settings.preciseSow ? 0 : -1;
        dy <= (s.settings.preciseSow ? 0 : 1);
        dy++
      )
        for (
          let dx = s.settings.preciseSow ? 0 : -1;
          dx <= (s.settings.preciseSow ? 0 : 1);
          dx++
        ) {
          const q = getPlot(s, x + dx, y + dy);
          if (q.tilled && !q.crop && !s.debris[plotKey(s, x + dx, y + dy)])
            plots.push(q);
        }
      if (!plots.length) return fail(systemText("till_an_empty_patch_first"));
      let charges = s.seedCharges[crop.id] ?? 0;
      if (charges < plots.length) {
        if (!takeItem(s, `${crop.id}_seed`))
          return fail(systemText("buy_a_seed_bag_at_the_store"));
        charges += 9;
      }
      s.seedCharges[crop.id] = charges - plots.length;
      plots.forEach((q) => {
        q.crop = crop.id;
        q.growth = 0;
        q.withered = false;
        q.streak = 0;
      });
      s.selectedSeed = crop.id;
      say(
        systemText("sowed_seeds", { value0: plots.length, value1: crop.name }),
      );
    } else if (c.type === "harvest") {
      const tree = s.trees.find((t) => t.x === x && t.y === y && t.fruit);
      if (tree) {
        if (addItem(s, tree.id, 3)) {
          tree.fruit = false;
          say(systemText("fruit_gathered"));
        }
        return events;
      }
      const crop = crops.find((r) => r.id === p.crop);
      if (!crop || p.withered || p.growth < crop.growDays)
        return fail(systemText("this_crop_is_not_ready"));
      if (!addItem(s, crop.id, 1, p.quality))
        return fail(systemText("your_bag_is_full"));
      s.stats.harvested++;
      if (crop.regrowDays) p.growth = crop.growDays - crop.regrowDays;
      else p.crop = null;
      say(systemText("harvested", { value0: crop.name }), "Harvest");
    } else if (c.type === "fertilize") {
      const grade = clamp(cmd.grade ?? 1, 1, 3);
      if (!takeItem(s, grade === 1 ? "fertilizer" : `fertilizer_${grade}`))
        return fail(systemText("buy_fertilizer_first"));
      p.fertilizer = grade;
      say(systemText("soil_enriched"));
    } else {
      const watering = c.type === "water" || s.equipped === "can";
      if (!watering && s.equipped !== "hoe")
        return fail(systemText("equip_the_hoe_or_watering_can"));
      const active = s.tools[watering ? "can" : "hoe"]!;
      if (active.readyDay !== undefined)
        return fail(systemText("your_tool_is_at_the_forge"));
      const charge = clamp(Math.floor(cmd.charge ?? 0), 0, active.tier);
      const width = charge >= 4 ? 5 : charge >= 2 ? 3 : 1;
      const height = charge >= 3 ? 5 : charge >= 1 ? 3 : 1;
      let worked = 0;
      for (let dy = 0; dy < height; dy++)
        for (let dx = 0; dx < width; dx++) {
          const tx = x + dx - Math.floor(width / 2),
            ty = y + dy;
          const q = getPlot(s, tx, ty);
          if (
            s.debris[plotKey(s, tx, ty)] ||
            (watering && (!q.tilled || q.watered))
          )
            continue;
          if (watering && (active.water ?? 0) <= 0) continue;
          if (!spend(s, 2)) continue;
          if (!watering && s.player.map === "farm")
            delete s.flags[grassKey(tx, ty)];
          if (watering) {
            q.watered = true;
            active.water = (active.water ?? 0) - 1;
          } else q.tilled = true;
          worked++;
        }
      say(
        worked
          ? systemText("tiles", {
              value0: watering ? systemText("watered") : systemText("tilled"),
              value1: worked,
            })
          : watering
            ? systemText("refill_at_the_well_or_choose_dry_tilled")
            : systemText("clear_the_ground_or_regain_stamina"),
      );
    }
    return events;
  }
  switch (c.type) {
    case "refill":
      s.tools.can!.water = [30, 50, 80, 120, 160][s.tools.can!.tier] ?? 160;
      say(systemText("watering_can_filled"));
      break;
    case "buy": {
      const item = items.find((i) => i.id === c.item),
        n = Math.floor(c.quantity);
      if (!item || n <= 0 || !Number.isFinite(n))
        return fail(systemText("choose_an_item_and_quantity"));
      const stock =
        shops
          .find((shop) => shop.map === s.player.map)
          ?.stock.find((row) => row.item === item.id) ??
        shops.flatMap((shop) => shop.stock).find((row) => row.item === item.id);
      const cost = (stock?.price ?? item.price) * n;
      if (s.money < cost) return fail(systemText("you_need_more_gold"));
      if (!addItem(s, item.id, n)) return fail(systemText("your_bag_is_full"));
      s.money -= cost;
      say(systemText("bought", { value0: n, value1: item.name }));
      break;
    }
    case "sell":
    case "ship": {
      const n = Math.floor(c.quantity);
      if (n <= 0 || !Number.isFinite(n) || quantity(s, c.item) < n)
        return fail(systemText("you_do_not_have_that_quantity"));
      let remaining = n;
      const outgoing: Stack[] = [];
      for (const i of s.inventory)
        if (i.id === c.item && remaining > 0) {
          const count = Math.min(i.quantity, remaining);
          outgoing.push({ ...i, quantity: count });
          remaining -= count;
        }
      takeItem(s, c.item, n);
      if (c.type === "ship") {
        for (const i of outgoing) {
          const stack = s.shipping.find(
            (x) => x.id === i.id && x.quality === i.quality,
          );
          if (stack) stack.quantity += i.quantity;
          else s.shipping.push(i);
        }
        say(systemText("placed_in_the_shipping_bin"));
      } else {
        const gold = outgoing.reduce(
          (sum, i) =>
            sum +
            Math.floor(
              price(i.id) * i.quantity * (qualityValue[i.quality] ?? 1) * 0.75,
            ),
          0,
        );
        s.money += gold;
        s.stats.totalEarned += gold;
        say(systemText("sold_for_g", { value0: gold }));
      }
      break;
    }
    case "eat": {
      const food = items.find((i) => i.id === c.item);
      if (!food?.stamina || !takeItem(s, c.item))
        return fail(systemText("choose_food_from_your_bag"));
      s.stamina = clamp(s.stamina + food.stamina, 0, s.maxStamina);
      s.fatigue = clamp(s.fatigue - food.stamina / 2, 0, 100);
      say(systemText("a_welcome_bite_restores_your_energy"));
      break;
    }
    case "talk": {
      const n = npcs.find((n) => n.id === c.npc);
      if (!n) return fail(systemText("nobody_answers"));
      if (resolveSchedule(s, n.id)?.map !== s.player.map)
        return fail(
          systemText("find_on_the_village_map_first", { value0: n.name }),
        );
      if (s.talked[n.id] !== s.day) {
        friend(s, n.id, 10);
        s.talked[n.id] = s.day;
        flag(s, `met_${n.id}`, events);
      }
      say(selectDialogue(s, n.id), "Dialogue");
      for (const e of [
        ...heartEvents,
        ...marriageEvents.filter(
          (e) =>
            s.relationships.spouse === e.npc &&
            s.day - (s.relationships.marriedDay ?? s.day) >=
              marriageEvents.filter((m) => m.npc === e.npc).indexOf(e) * 30,
        ),
      ].filter(
        (e) =>
          e.npc === n.id &&
          !s.pendingChoices.length &&
          !(
            n.romanceable &&
            e.hearts >= 8 &&
            !marriageEvents.includes(e) &&
            s.relationships.dating !== n.id
          ) &&
          e.hearts * 100 <= (s.friendship[n.id] ?? 0) &&
          !s.flags[e.flag] &&
          e.location === s.player.map,
      )) {
        flag(s, e.flag, events, e.title);
        for (const line of e.lines) say(line, "Dialogue");
        s.pendingChoices = e.choices?.map((ch) => ch.flag) ?? [];
        break;
      }
      break;
    }
    case "gift": {
      const n = npcs.find((n) => n.id === c.npc);
      if (!n) return fail(systemText("choose_a_villager"));
      if (resolveSchedule(s, n.id)?.map !== s.player.map)
        return fail(
          systemText("visit_before_offering_a_gift", { value0: n.name }),
        );
      const gift = s.gifted[n.id];
      const week = Math.floor(s.day / 7);
      if (gift?.day === s.day || (gift?.week === week && gift.count >= 2))
        return fail(systemText("one_gift_each_day_two_each_week_is"));
      const q = s.inventory.find((i) => i.id === c.item)?.quality ?? 0;
      if (!takeItem(s, c.item))
        return fail(systemText("that_item_is_not_in_your_bag"));
      const points = n.loved.includes(c.item)
        ? 80
        : n.liked.includes(c.item)
          ? 45
          : n.hated.includes(c.item)
            ? -40
            : n.disliked.includes(c.item)
              ? -20
              : 15;
      const birthday =
        n.birthday.day === getDate(s).day &&
        n.birthday.season === getDate(s).season;
      friend(s, n.id, Math.round(points * (birthday ? 8 : 1) * (1 + q * 0.1)));
      s.gifted[n.id] = {
        day: s.day,
        week,
        count: gift?.week === week ? gift.count + 1 : 1,
      };
      say(
        points > 0
          ? systemText("smiles_at_your_thoughtful_gift", { value0: n.name })
          : systemText("thanks_you_though_this_is_not_a_favorite", {
              value0: n.name,
            }),
        "FriendshipChanged",
      );
      break;
    }
    case "buyAnimal": {
      if (!["chicken", "cow", "sheep"].includes(c.kind))
        return fail(systemText("choose_chicken_cow_or_sheep"));
      const building = c.kind === "chicken" ? "coop" : "barn",
        level = s.buildings[building] ?? 0,
        cost = c.kind === "chicken" ? 1500 : c.kind === "cow" ? 6000 : 4500;
      if (!level)
        return fail(systemText("build_a_first", { value0: building }));
      if (
        s.animals.filter(
          (a) => (a.kind === "chicken") === (c.kind === "chicken") && !a.away,
        ).length >=
        level * 4
      )
        return fail(systemText("the_building_is_full"));
      if (s.money < cost) return fail(systemText("you_need_more_gold"));
      s.money -= cost;
      s.animals.push({
        id: `animal_${s.day}_${s.animals.length}`,
        kind: c.kind,
        name: safeAnimalName(c.name),
        affection: 20,
        fed: true,
        petted: false,
        brushed: false,
        outside: false,
        sick: false,
        neglect: 0,
        age: 20,
        product: false,
        pregnant: null,
        away: false,
      });
      say(systemText("your_new_animal_settles_in"));
      break;
    }
    case "care": {
      if (c.animal === "pet") {
        s.petAffection = clamp(s.petAffection + 1, 0, 255);
        say(systemText("leans_into_your_hand", { value0: s.player.petName }));
        break;
      }
      const a = s.animals.find((a) => a.id === c.animal);
      if (!a) return fail(systemText("choose_an_animal"));
      if (
        c.action === "feed" &&
        !a.fed &&
        (feedFromSilo(s) || takeItem(s, "fodder"))
      )
        a.fed = true;
      else if (c.action === "pet" && !a.petted) {
        a.petted = true;
        a.affection = clamp(a.affection + 5, 0, 255);
      } else if (c.action === "brush" && !a.brushed) {
        a.brushed = true;
        a.affection = clamp(a.affection + 3, 0, 255);
      } else if (c.action === "outside") {
        a.outside = !a.outside;
        grazeAnimal(s, a);
      } else if (c.action === "cure" && takeItem(s, "animal_tonic")) {
        a.sick = false;
        a.neglect = 0;
      } else if (c.action === "recover" && s.money >= 500) {
        s.money -= 500;
        a.away = false;
        a.neglect = 0;
      } else
        return fail(
          systemText("this_animal_has_already_received_that_care_or"),
        );
      say(systemText("looks_more_comfortable", { value0: a.name }));
      break;
    }
    case "collect": {
      const a = s.animals.find((a) => a.id === c.animal);
      if (!a?.product) return fail(systemText("no_product_is_ready_yet"));
      const base =
        a.kind === "chicken" ? "egg" : a.kind === "cow" ? "milk" : "wool";
      const id = a.affection >= 200 ? `golden_${base}` : base;
      if (
        !addItem(
          s,
          id,
          1,
          a.affection >= 200 ? 0 : Math.min(2, Math.floor(a.affection / 64)),
        )
      )
        return fail(systemText("your_bag_is_full"));
      a.product = false;
      say(systemText("collected_from", { value0: id, value1: a.name }));
      break;
    }
    case "breed": {
      const a = s.animals.find((a) => a.id === c.animal);
      if (!a || a.pregnant !== null || a.sick)
        return fail(systemText("choose_a_healthy_adult_animal"));
      if (!takeItem(s, a.kind === "chicken" ? "egg" : "breeding_kit"))
        return fail(systemText("you_need_an_egg_or_breeding_kit"));
      a.pregnant = s.day + (a.kind === "chicken" ? 3 : 21);
      say(systemText("a_little_one_is_on_the_way"));
      break;
    }
    case "fish": {
      const location = c.location ?? s.player.map;
      if (location !== s.player.map)
        return fail(systemText("travel_to_that_fishing_spot_first"));
      const pool = fish.filter(
        (f) =>
          f.locations.includes(location) &&
          f.seasons.includes(getDate(s).season) &&
          f.minTier <= (s.tools.rod?.tier ?? 0) &&
          f.startHour * 60 <= s.minute &&
          f.endHour * 60 > s.minute &&
          f.weather.includes(s.weather),
      );
      if (s.tools.rod?.readyDay !== undefined)
        return fail(systemText("your_fishing_rod_is_still_at_the_forge"));
      if (!pool.length)
        return fail(systemText("no_fish_are_biting_for_this_rod_season"));
      if (!spend(s, 3)) return fail(systemText("rest_before_casting"));
      events.push(...tick(s, 20));
      if (random(s) > clamp(c.skill ?? 0.75, 0.1, 1))
        return fail(systemText("the_fish_slips_away_try_a_gentler_reel"));
      const f = pool[Math.floor(random(s) * pool.length)]!;
      const size = Math.round(f.minSize + random(s) * (f.maxSize - f.minSize));
      if (!addItem(s, f.id)) return fail(systemText("your_bag_is_full"));
      s.stats.fishCaught++;
      s.fishRecords[f.id] = Math.max(s.fishRecords[f.id] ?? 0, size);
      s.collections[`caught_${f.id}`] =
        (s.collections[`caught_${f.id}`] ?? 0) + 1;
      say(
        systemText("caught_cm", { value0: f.name, value1: size }),
        "FishCaught",
      );
      break;
    }
    case "mine": {
      if (c.action === "enter") {
        if (!["mountain", "mine"].includes(s.player.map))
          return fail(systemText("the_mine_entrance_is_on_mount_tallow"));
        s.player.map = "mine";
        s.flags.riding = false;
        s.mine.floor = Math.max(
          1,
          Math.min(
            s.flags.spring_stone
              ? Math.max(1, Math.floor(s.mine.maxFloor / 10) * 10)
              : 1,
            c.floor ?? 1,
          ),
        );
        s.mine.rocks = 6 + Math.floor(random(s) * 7);
        s.mine.ladder = false;
        s.mine.minutes = 0;
        s.mine.broken = [];
        s.player.x = 2;
        s.player.y = 3;
      } else if (c.action === "exit") {
        s.player.map = "mountain";
        s.mine.floor = 0;
      } else if (c.action === "break") {
        if (s.mine.floor < 1) return fail(systemText("enter_the_mine_first"));
        if (c.x !== undefined && c.y !== undefined) {
          const key = `${c.x},${c.y}`,
            layout = generateMineFloor(s.seed, s.day, s.mine.floor);
          const tile = layout.tiles[c.y]?.[c.x];
          if (
            s.mine.broken.includes(key) ||
            !tile ||
            !["rock", "ore", "gem", "ladder"].includes(tile)
          )
            return fail(systemText("choose_a_rock_or_mineral_node"));
          if (s.stamina >= 4) {
            s.mine.broken.push(key);
            if (tile === "ladder") s.mine.ladder = true;
          }
        }
        if (!spend(s, 4)) return fail(systemText("rest_or_eat_before_mining"));
        s.mine.rocks = Math.max(0, s.mine.rocks - 1);
        s.mine.minutes += 10;
        if (random(s) < 0.3 || s.mine.rocks === 0) s.mine.ladder = true;
        const depth = Math.min(
          minerals.length,
          4 + Math.floor(s.mine.floor / 5),
        );
        const ore = minerals[Math.floor(random(s) * depth)];
        if (ore && addItem(s, ore.id))
          s.collections[`mineral_${ore.id}`] =
            (s.collections[`mineral_${ore.id}`] ?? 0) + 1;
        events.push(...tick(s, 10));
        if (s.mine.minutes > 240 && s.mine.floor > 30) {
          s.player.map = "mountain";
          s.mine.floor = 0;
          say(systemText("loose_stones_rumble_you_return_safely_to_the"));
        }
      } else if (c.action === "descend") {
        if (!s.mine.ladder)
          return fail(systemText("break_rocks_to_uncover_a_ladder"));
        s.mine.floor = Math.min(60, s.mine.floor + 1);
        s.mine.maxFloor = Math.max(s.mine.maxFloor, s.mine.floor);
        s.mine.rocks = 6 + Math.floor(random(s) * 7);
        s.mine.ladder = false;
        s.mine.minutes = 0;
        s.mine.broken = [];
        s.player.x = 2;
        s.player.y = 3;
        if (s.mine.floor % 10 === 0) {
          flag(
            s,
            `mine_${s.mine.floor}`,
            events,
            systemText("a_crystal_chamber_waits_on_floor", {
              value0: s.mine.floor,
            }),
          );
        }
      }
      say(systemText("mine_floor", { value0: s.mine.floor }));
      break;
    }
    case "forage": {
      const available = forage.filter(
        (f) =>
          f.seasons.includes(getDate(s).season) &&
          f.locations.includes(s.player.map) &&
          (s.foraged[f.id] ?? -3) <= s.day - 3,
      );
      const f = c.item
        ? available.find((f) => f.id === c.item)
        : available[Math.floor(random(s) * available.length)];
      if (!f) return fail(systemText("this_patch_needs_time_to_grow_back"));
      if (!addItem(s, f.id)) return fail(systemText("your_bag_is_full"));
      s.foraged[f.id] = s.day;
      say(systemText("found", { value0: f.name }));
      break;
    }
    case "cook": {
      if (!(s.buildings.house ?? 0))
        return fail(systemText("build_a_kitchen_with_the_first_house_upgrade"));
      const recipe = recipes.find((r) => r.id === c.recipe);
      if (
        !recipe ||
        !recipe.ingredients.every((i) => quantity(s, i.item) >= i.count)
      )
        return fail(systemText("check_the_recipe_ingredients"));
      for (const i of recipe.ingredients) takeItem(s, i.item, i.count);
      if (!addItem(s, recipe.id)) {
        for (const i of recipe.ingredients) addItem(s, i.item, i.count);
        return fail(systemText("make_room_in_your_bag_before_cooking"));
      }
      s.collections[`cooked_${recipe.id}`] =
        (s.collections[`cooked_${recipe.id}`] ?? 0) + 1;
      if (!s.knownRecipes.includes(recipe.id)) s.knownRecipes.push(recipe.id);
      say(systemText("cooked", { value0: recipe.name }));
      break;
    }
    case "process": {
      const product =
        processedGoods.find((p) => p.id === c.recipe) ?? processedGoods[0];
      if (!product) return fail(systemText("choose_a_processing_recipe"));
      if (
        !s.decorations.some((d) => d.id === product.machine) &&
        !s.buildings[product.machine]
      )
        return fail(
          systemText("place_a_first", {
            value0: product.machine.replaceAll("_", " "),
          }),
        );
      const ingredients = product.ingredients;
      if (!ingredients.every((i) => quantity(s, i.item) >= i.count))
        return fail(systemText("you_need_the_raw_ingredients"));
      for (const i of ingredients) takeItem(s, i.item, i.count);
      s.processing.push({
        id: product.id,
        ready: s.day * 1440 + s.minute + product.hours * 60,
        quality: 0,
      });
      say(
        systemText("processing_will_finish_in_hours", {
          value0: product.hours,
        }),
      );
      break;
    }
    case "upgradeTool": {
      const t = s.tools[c.tool];
      if (!t || t.tier >= 4 || t.readyDay !== undefined)
        return fail(systemText("that_tool_cannot_be_upgraded_now"));
      const ore = [
        "bronze_bar",
        "iron_bar",
        "silversteel_bar",
        "starglass_bar",
      ][t.tier]!;
      const cost = [1000, 2500, 5000, 10000][t.tier]!;
      if (s.money < cost || quantity(s, ore) < 2)
        return fail(
          systemText("bring_2_and_g", {
            value0: ore.replaceAll("_", " "),
            value1: cost,
          }),
        );
      takeItem(s, ore, 2);
      s.money -= cost;
      t.readyDay = s.day + 2;
      say(systemText("the_tool_will_be_ready_in_two_days"));
      break;
    }
    case "smelt": {
      if (
        ![
          "bronze_ore",
          "iron_ore",
          "silversteel_ore",
          "starglass_shard",
        ].includes(c.ore)
      )
        return fail(
          systemText("choose_a_smeltable_ore_from_the_forge_catalog"),
        );
      const metal = c.ore.replace(/_ore$|_shard$/, "");
      if (!takeItem(s, c.ore, 3))
        return fail(systemText("bring_three_pieces_of_ore"));
      if (!s.buildings.furnace && s.money < 50) {
        addItem(s, c.ore, 3);
        return fail(systemText("smelting_costs_50g_without_a_furnace"));
      }
      if (!s.buildings.furnace) s.money -= 50;
      addItem(s, `${metal}_bar`);
      say(systemText("a_fresh_bar_cools_on_the_anvil"));
      break;
    }
    case "build": {
      const b = buildings.find((b) => b.id === c.building);
      if (!b) return fail(systemText("choose_a_building_from_brams_catalog"));
      if (s.construction[b.id])
        return fail(systemText("construction_is_already_underway"));
      if (
        s.money < b.cost ||
        quantity(s, "wood") < b.wood ||
        quantity(s, "stone") < b.stone
      )
        return fail(
          systemText("bring_g_wood_and_stone", {
            value0: b.cost,
            value1: b.wood,
            value2: b.stone,
          }),
        );
      if (b.wood) takeItem(s, "wood", b.wood);
      if (b.stone) takeItem(s, "stone", b.stone);
      s.money -= b.cost;
      s.construction[b.id] = s.day + b.days;
      say(systemText("bram_marks_out_the_construction_site"));
      break;
    }
    case "decorate":
      if (!takeItem(s, c.item))
        return fail(systemText("buy_that_decoration_first"));
      s.decorations.push({
        id: c.item,
        x: clamp(c.x, 0, 79),
        y: clamp(c.y, 0, 63),
        rotation: (c.rotation ?? 0) % 4,
      });
      say(systemText("a_personal_touch_for_your_home"));
      break;
    case "plantTree": {
      if (s.player.map !== "farm")
        return fail(systemText("plant_saplings_in_your_farm_orchard"));
      const tree = trees.find((t) => t.id === c.tree);
      if (!tree || !takeItem(s, `${tree.id}_sapling`))
        return fail(systemText("buy_a_sapling_first"));
      if (
        s.trees.some((t) => Math.abs(t.x - c.x) < 2 && Math.abs(t.y - c.y) < 2)
      ) {
        addItem(s, `${tree.id}_sapling`);
        return fail(systemText("leave_room_for_the_branches"));
      }
      s.trees.push({ id: tree.id, x: c.x, y: c.y, age: 0, fruit: false });
      say(systemText("the_orchard_has_a_new_beginning"));
      break;
    }
    case "date": {
      if (s.relationships.spouse)
        return fail(systemText("your_shared_home_is_the_beginning_of_this"));
      const n = npcs.find((n) => n.id === c.npc);
      if (!n?.romanceable || n.age < 25 || (s.friendship[n.id] ?? 0) < 800)
        return fail(
          systemText("courtship_begins_with_eight_hearts_and_a_willow"),
        );
      if (!takeItem(s, "willow_ribbon"))
        return fail(systemText("bring_a_willow_ribbon"));
      s.relationships.dating = n.id;
      flag(
        s,
        `dating_${n.id}`,
        events,
        systemText("takes_your_hand", { value0: n.name }),
      );
      break;
    }
    case "propose":
      if (s.relationships.weddingDay !== null)
        return fail(systemText("your_wedding_plans_are_already_settled"));
      if (
        s.relationships.dating !== c.npc ||
        (s.friendship[c.npc] ?? 0) < 1000 ||
        (s.buildings.house ?? 0) < 2 ||
        !s.flags.winter_stone
      )
        return fail(systemText("a_proposal_needs_ten_hearts_a_larger_home"));
      if (!takeItem(s, "hearth_ring"))
        return fail(systemText("bring_a_hearth_ring"));
      s.relationships.weddingDay = s.day + 7;
      say(systemText("your_wedding_will_be_in_seven_days"));
      break;
    case "adopt":
      if (
        s.relationships.marriedDay === null ||
        s.day - s.relationships.marriedDay < 120 ||
        s.relationships.child
      )
        return fail(systemText("your_family_can_grow_after_a_year_together"));
      s.relationships.child = {
        name: systemText("wren"),
        joinedDay: s.day,
        stage: 0,
        kind: c.choice === "birth" ? "birth" : "adoption",
      };
      say(systemText("a_small_new_voice_fills_your_home"));
      break;
    case "festival": {
      const d = getDate(s);
      const f = festivals.find(
        (f) =>
          f.day === d.day &&
          f.season === d.season &&
          (f.id !== "lantern_bloom_vigil" || s.flags.bloom),
      );
      if (!f)
        return fail(systemText("check_the_calendar_for_the_next_festival"));
      if (s.flags[`festival_${s.day}`])
        return fail(systemText("you_have_already_joined_todays_activity"));
      flag(
        s,
        `festival_${s.day}`,
        events,
        systemText("the_whole_valley_gathers", { value0: f.name }),
      );
      s.stats.festivals++;
      s.flags[`attended_${f.id}`] = true;
      for (const n of npcs) friend(s, n.id, 15);
      if ((c.score ?? 50) >= 50) {
        s.money += 500;
        addItem(s, "fodder", 5);
        say(systemText("your_care_earns_a_festival_prize"));
      }
      if (f.day === 29 && d.season === "winter") s.flags.longnight = true;
      break;
    }
    case "discover": {
      const index = journalPages.findIndex((p) => p.id === c.page);
      if (index < 0) return fail(systemText("that_page_has_not_been_found"));
      const conditions = [
        s.day >= 2,
        s.flags.spring_stone,
        (s.friendship.fenwick ?? 0) >= 400,
        (s.friendship.corran ?? 0) >= 400,
        s.flags.summer_stone,
        s.mine.maxFloor >= 20,
        s.mine.maxFloor >= 40,
        s.mine.maxFloor >= 60,
        s.flags.autumn_stone,
        s.stats.festivals >= 3,
        s.flags.longnight,
        s.day >= 90,
        s.day >= 30,
        s.day >= 120,
        (s.friendship.ilse ?? 0) >= 600,
        getDate(s).season === "winter" && s.minute <= 480,
      ];
      if (!conditions[index])
        return fail(systemText("follow_this_pages_journal_hint"));
      flag(s, `page_${c.page}`, events, journalPages[index]!.text);
      break;
    }
    case "story": {
      const discovery = sunrootDiscoveries.find((entry) => entry.id === c.id);
      if (discovery) {
        if (s.player.map !== discovery.map || !canDiscoverSunroot(s, discovery))
          return fail(discovery.hint);
        s.flags[discovery.id] = true;
        s.maxStamina = Math.min(200, s.maxStamina + 10);
        s.stamina = Math.min(s.maxStamina, s.stamina + 10);
        for (const line of discovery.lines)
          events.push({ type: "Dialogue", id: discovery.id, message: line });
        break;
      }
      const personal = [...heartEvents, ...marriageEvents].find(
        (e) => e.id === c.id,
      );
      if (personal) {
        if (!npcAvailable(s, personal.npc))
          return fail(
            systemText("this_villager_is_away_today_check_the_calendar"),
          );
        if (s.pendingChoices.length)
          return fail(
            systemText("finish_the_current_conversation_choice_first"),
          );
        if (s.flags[personal.flag])
          return fail(
            systemText("this_memory_is_already_recorded_in_your_journal"),
          );
        if ((s.friendship[personal.npc] ?? 0) < personal.hearts * 100)
          return fail(
            systemText("this_memory_needs_hearts", { value0: personal.hearts }),
          );
        if (s.player.map !== personal.location)
          return fail(
            systemText("visit_for_this_memory", {
              value0:
                maps.find((m) => m.id === personal.location)?.name ??
                personal.location,
            }),
          );
        const married = marriageEvents.includes(personal);
        if (
          married &&
          (s.relationships.spouse !== personal.npc ||
            s.day - (s.relationships.marriedDay ?? s.day) <
              marriageEvents
                .filter((e) => e.npc === personal.npc)
                .indexOf(personal) *
                30)
        )
          return fail(systemText("give_this_new_chapter_of_married_life_time"));
        if (
          !married &&
          personal.hearts >= 8 &&
          npcs.some((n) => n.id === personal.npc && n.romanceable) &&
          s.relationships.dating !== personal.npc
        )
          return fail(
            systemText("share_a_willow_ribbon_before_this_courtship_memory"),
          );
        flag(s, personal.flag, events, personal.title);
        for (const line of personal.lines) say(line, "Dialogue");
        s.pendingChoices = personal.choices?.map((ch) => ch.flag) ?? [];
        break;
      }
      if (c.id === "spring" || c.id === "spring_stone") {
        if (
          (s.tools.axe?.tier ?? 0) < 2 ||
          (s.tools.hammer?.tier ?? 0) < 2 ||
          !s.flags.orchard_stump_cleared ||
          !s.flags.orchard_boulder_cleared ||
          s.trees.length < 3 ||
          (s.collections.spring_crops ?? 0) < 50 ||
          (s.friendship.bram ?? 0) < 300
        )
          return fail(
            systemText("restore_the_orchard_clear_its_stump_and_boulder"),
          );
        flag(
          s,
          "spring_stone",
          events,
          systemText("a_warm_stone_rests_in_the_old_roots"),
        );
      } else if (c.id === "summer" || c.id === "summer_stone") {
        if (
          !s.flags.spring_stone ||
          Object.keys(s.fishRecords).length < 15 ||
          (s.friendship.corran ?? 0) < 400 ||
          !s.flags.boat_repaired
        )
          return fail(
            systemText("catch_15_fish_species_befriend_corran_and_repair"),
          );
        flag(
          s,
          "summer_stone",
          events,
          systemText("beyond_the_falls_the_tide_reveals_the_second"),
        );
        flag(
          s,
          "horse",
          events,
          systemText("rosalind_brings_you_a_patient_riding_horse"),
        );
      } else if (c.id === "boat") {
        if (s.flags.boat_repaired)
          return fail(systemText("liras_boat_is_ready_to_sail"));
        if (quantity(s, "wood") < 30 || quantity(s, "iron_bar") < 2)
          return fail(systemText("lira_needs_30_wood_and_two_iron_bars"));
        takeItem(s, "wood", 30);
        takeItem(s, "iron_bar", 2);
        flag(
          s,
          "boat_repaired",
          events,
          systemText("liras_boat_is_ready_to_sail"),
        );
      } else if (c.id === "autumn" || c.id === "autumn_stone") {
        if (
          !s.flags.summer_stone ||
          s.mine.maxFloor < 50 ||
          (s.friendship.greta ?? 0) < 400
        )
          return fail(systemText("reach_mine_floor_50_and_four_hearts_with"));
        flag(
          s,
          "autumn_stone",
          events,
          systemText("wrens_letter_warms_the_old_forge_greta_lifts"),
        );
      } else if (c.id === "winter" || c.id === "winter_stone") {
        const mid = arcs.filter(
          (a) =>
            a.events.filter((id) => {
              const e = arcEvents.find((e) => e.id === id);
              return e && s.flags[e.flag];
            }).length >= Math.ceil(a.events.length / 2),
        ).length;
        if (
          !s.flags.autumn_stone ||
          Object.values(s.friendship).filter((v) => v >= 300).length < 10 ||
          mid < 3 ||
          !s.flags.longnight
        )
          return fail(
            systemText("unite_ten_friends_help_three_village_arcs_and"),
          );
        flag(
          s,
          "winter_stone",
          events,
          systemText(
            "the_villages_shared_hearth_becomes_the_fourth_hearthstone",
          ),
        );
      } else if (c.id === "vote") {
        if (s.day < 267 || !s.flags.bloom)
          return fail(systemText("the_council_gathers_in_year_3_spring"));
        flag(s, "evaluated", events, evaluate(s).tier);
      } else {
        const arc = arcs.find((a) => a.id === c.id);
        if (!arc)
          return fail(systemText("read_the_journal_for_your_next_goal"));
        if (s.pendingChoices.length)
          return fail(
            systemText("finish_the_current_conversation_choice_first"),
          );
        const next = arc.events
          .map((id) => arcEvents.find((e) => e.id === id))
          .find((e) => e && !s.flags[e.flag]);
        if (!next) {
          if (arc.events.length) flag(s, `arc_${arc.id}`, events, arc.epilogue);
          break;
        }
        if (!npcAvailable(s, next.npc))
          return fail(
            systemText("this_villager_is_away_today_continue_when_they"),
          );
        if ((s.friendship[next.npc] ?? 0) < next.hearts * 100)
          return fail(
            systemText("spend_more_time_with_this_chapter_needs_hearts", {
              value0: npcs.find((n) => n.id === next.npc)?.name ?? next.npc,
              value1: next.hearts,
            }),
          );
        if (s.player.map !== next.location)
          return fail(
            systemText("meet_at_to_continue", {
              value0:
                maps.find((m) => m.id === next.location)?.name ?? next.location,
              value1: arc.name,
            }),
          );
        flag(s, next.flag, events, next.title);
        for (const line of next.lines) say(line, "Dialogue");
        s.pendingChoices = next.choices?.map((ch) => ch.flag) ?? [];
        if (
          arc.events.every((id) => {
            const e = arcEvents.find((e) => e.id === id);
            return e && s.flags[e.flag];
          })
        )
          flag(s, `arc_${arc.id}`, events, arc.epilogue);
      }
      break;
    }
    case "choice":
      if (!s.pendingChoices.includes(c.flag))
        return fail(
          systemText("choose_one_of_the_current_conversation_options"),
        );
      flag(s, c.flag, events);
      const consequences: Record<string, string> = {
        marta_inn_coop: "inn_coop",
        marta_inn_renovate: "inn_renovated",
        dex_future_leave: "dex_city",
        dex_future_stay: "music_night",
        halverd_choice_stay: "halverd_resigned",
        halverd_choice_leave: "halverd_departed",
      };
      if (consequences[c.flag]) flag(s, consequences[c.flag]!, events);
      s.pendingChoices = [];
      break;
    case "quest": {
      const week = Math.floor(s.day / 7),
        id = `quest_${week}_${c.id}`;
      if (s.flags[id])
        return fail(systemText("this_weeks_request_is_complete"));
      const item = items.find((i) => i.id === c.id);
      if (!item || !takeItem(s, item.id, 3))
        return fail(systemText("deliver_three_of_the_requested_item"));
      s.money += item.price * 5 + 150;
      friend(s, npcs[week % npcs.length]!.id, 40);
      flag(
        s,
        id,
        events,
        systemText("the_request_is_fulfilled_your_neighbor_thanks_you"),
      );
      break;
    }
    case "hotSpring":
      if (s.player.map !== "mountain")
        return fail(systemText("visit_the_hot_spring_on_mount_tallow_to"));
      s.stamina = clamp(s.stamina + 30, 0, s.maxStamina);
      s.fatigue = Math.max(0, s.fatigue - 15);
      events.push(...tick(s, 60));
      say(systemText("steam_curls_over_the_quiet_spring"));
      break;
    case "tv": {
      const d = getDate(s);
      say(systemText("tomorrows_weather", { value0: s.forecast }));
      if (d.weekday === 0 || d.weekday === 3) {
        const r = recipes[Math.floor(s.day / 3) % recipes.length];
        if (r && !s.knownRecipes.includes(r.id)) {
          s.knownRecipes.push(r.id);
          say(systemText("willowmere_kitchen_teaches", { value0: r.name }));
        }
      }
      break;
    }
    case "readMail":
      say(
        s.mail.length
          ? systemText("you_reread", {
              value0: s.mail[s.mail.length - 1]!.replaceAll("_", " "),
            })
          : systemText("the_mailbox_is_quiet_today"),
      );
      break;
    case "saveMarker":
      s.markers.push({
        day: Math.max(s.day, c.day ?? s.day),
        label: c.label?.slice(0, 40) || systemText("remember"),
      });
      break;
    case "store":
    case "retrieve": {
      const source = c.type === "store" ? s.inventory : s.storage;
      const destination = c.type === "store" ? s.storage : s.inventory;
      const stack = source.find((i) => i.id === c.item);
      const n = Math.floor(c.quantity);
      if (!stack || n <= 0 || n > stack.quantity)
        return fail(systemText("choose_an_available_quantity"));
      const dest = destination.find(
        (i) => i.id === stack.id && i.quality === stack.quality,
      );
      if (!dest && c.type === "retrieve" && destination.length >= 24)
        return fail(systemText("your_bag_is_full"));
      if (dest) dest.quantity += n;
      else destination.push({ ...stack, quantity: n });
      stack.quantity -= n;
      if (!stack.quantity) source.splice(source.indexOf(stack), 1);
      break;
    }
    case "debug": {
      if (c.action === "teleport" && c.id) {
        const map = maps.find((m) => m.id === c.id);
        if (map) {
          const [x, y] = String(c.value ?? "8,8")
            .split(",")
            .map(Number);
          s.player.map = map.id;
          s.player.x = Math.floor(clamp(x ?? 8, 1, map.width - 2));
          s.player.y = Math.floor(clamp(y ?? 8, 1, map.height - 2));
          if (map.kind !== "outdoor") s.flags.riding = false;
        }
      } else if (c.action === "minute")
        s.minute = Math.floor(clamp(Number(c.value), 360, 1559));
      else if (c.action === "money") s.money = clamp(Number(c.value), 0, 1e12);
      else if (c.action === "day")
        s.day = Math.floor(clamp(Number(c.value), 0, 365000));
      else if (c.action === "item" && c.id)
        addItem(s, c.id, Math.max(1, Number(c.value) || 1));
      else if (c.action === "friendship" && c.id)
        s.friendship[c.id] = clamp(Number(c.value), 0, 1000);
      else if (c.action === "flag" && c.id)
        s.flags[c.id] = ![false, "false", "0", 0].includes(c.value ?? true);
      else if (c.action === "grow")
        Object.values(s.plots).forEach((p) => (p.growth = 99));
      else if (
        c.action === "weather" &&
        ["sunny", "cloudy", "rain", "storm", "snow", "blizzard"].includes(
          String(c.value),
        )
      )
        s.weather = c.value as Weather;
      break;
    }
  }
  if (quantity(s, "sunroot_fragment") && s.maxStamina < 200) {
    takeItem(s, "sunroot_fragment");
    s.maxStamina += 10;
    s.stamina = Math.min(s.maxStamina, s.stamina + 10);
    say(systemText("a_sunroot_fragment_warms_your_palm_maximum_stamina"));
  }
  unlockAchievements(s);
  return events;
}
