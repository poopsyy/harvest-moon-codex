import { writeFileSync } from "node:fs";
import {
  sunrootDiscoveries,
  canDiscoverSunroot,
} from "../../src/data/sunroots";
import assert from "node:assert/strict";
import { createGame, type Command } from "../../src/state/game";
import {
  dispatch,
  getDate,
  quantity,
  evaluate,
  resolveSchedule,
  npcAvailable,
} from "../../src/systems/engine";
import { crops, npcs, festivals, maps, shops } from "../../src/data/catalog";
import { arcs, arcEvents, journalPages } from "../../src/data/narrative";
import { hash } from "../../src/core/rng";
export function simulate(seed: number, days: number) {
  const s = createGame({ seed });
  const commands: Command[] = [];
  const issue = (c: Command) => {
    if (s.day >= days) return [];
    assert.notEqual(c.type, "debug");
    commands.push(c);
    const events = dispatch(s, c);
    if (s.pendingChoices.length) {
      const choice: Command = { type: "choice", flag: s.pendingChoices[0]! };
      commands.push(choice);
      dispatch(s, choice);
    }
    return events;
  };
  const navigate = (map: string) => {
    if (s.player.map === map || s.day >= days) return [];
    const queue: { map: string; path: string[] }[] = [
      { map: s.player.map, path: [] },
    ];
    const seen = new Set([s.player.map]);
    while (queue.length) {
      const current = queue.shift()!;
      if (current.map === map) {
        const events = [];
        for (const next of current.path) {
          const target = maps.find((m) => m.id === next)!;
          if (
            target.kind === "indoor" &&
            !["farmhouse", "coop", "barn", "greenhouse"].includes(next)
          ) {
            if (s.minute >= 1080) return events;
            if (s.minute < 480)
              events.push(...issue({ type: "wait", minutes: 480 - s.minute }));
          }
          events.push(...issue({ type: "teleport", map: next }));
        }
        return events;
      }
      for (const next of maps.find((m) => m.id === current.map)?.connections ??
        [])
        if (
          !seen.has(next) &&
          !(next === "greenhouse" && !s.buildings.greenhouse) &&
          !(next === "cove" && !s.flags.boat_repaired)
        ) {
          seen.add(next);
          queue.push({ map: next, path: [...current.path, next] });
        }
    }
    throw new Error(`No route ${s.player.map} to ${map}`);
  };
  const run = (c: Command) => {
    if (s.day >= days) return [];
    if (c.type === "sleep") {
      const before = s.day;
      const travel = navigate("farmhouse");
      return s.day === before ? issue(c) : travel;
    }
    if (c.type === "teleport") return navigate(c.map);
    if (c.type === "talk" || c.type === "gift") {
      for (let attempt = 0; attempt < 3; attempt++) {
        const schedule = resolveSchedule(s, c.npc);
        if (!schedule) return [];
        if (s.player.map === schedule.map) break;
        navigate(schedule.map);
      }
      if (resolveSchedule(s, c.npc)?.map !== s.player.map) return [];
    }
    if (c.type === "hotSpring") {
      const previous = s.player.map;
      navigate("mountain");
      const events = issue(c);
      navigate(previous);
      return events;
    }
    if (c.type === "mine" && c.action === "enter") navigate("mountain");
    if (c.type === "fish") navigate(c.location ?? s.player.map);
    if (c.type === "buy") {
      const previous = s.player.map;
      const shop = shops.find((shop) =>
        shop.stock.some((row) => row.item === c.item),
      );
      if (shop) navigate(shop.map);
      if (shop && s.player.map !== shop.map) {
        navigate(previous);
        return [];
      }
      const events = issue(c);
      navigate(previous);
      return events;
    }
    return issue(c);
  };
  const buy = (item: string, n: number) =>
    run({ type: "buy", item, quantity: n });
  const ship = () => {
    for (const item of [...s.inventory])
      if (
        !item.id.endsWith("_seed") &&
        !item.id.endsWith("_bar") &&
        !item.id.endsWith("_sapling") &&
        !["wood", "stone", "fodder"].includes(item.id)
      )
        run({ type: "ship", item: item.id, quantity: item.quantity });
  };
  for (let d = 0; s.day < days; d++) {
    if (s.cold) {
      run({ type: "sleep" });
      continue;
    }
    const startDay = s.day;
    const date = getDate(s);
    for (const n of [...npcs].sort((a, b) =>
      (resolveSchedule(s, a.id)?.map ?? "").localeCompare(
        resolveSchedule(s, b.id)?.map ?? "",
      ),
    )) {
      if (!npcAvailable(s, n.id)) {
        assert.equal(resolveSchedule(s, n.id), null);
        continue;
      }
      assert(resolveSchedule(s, n.id));
      run({ type: "talk", npc: n.id });
      const gift = s.gifted[n.id];
      const canGift =
        gift?.day !== s.day &&
        !(gift?.week === Math.floor(s.day / 7) && gift.count >= 2);
      if (
        canGift &&
        s.money > 3000 &&
        ((s.day >= 30 && s.day % 7 === 1) || n.id === "halverd")
      ) {
        const item = n.id === "halverd" ? n.loved[0] : n.liked[0];
        if (item) {
          buy(item, 1);
          run({ type: "gift", npc: n.id, item });
        }
      }
    }
    if (
      !s.relationships.dating &&
      !s.relationships.spouse &&
      (s.friendship.ivy ?? 0) >= 800
    ) {
      if (!quantity(s, "willow_ribbon")) buy("willow_ribbon", 1);
      const schedule = resolveSchedule(s, "ivy");
      if (schedule) {
        run({ type: "teleport", map: schedule.map });
        run({ type: "date", npc: "ivy" });
      }
    }
    if (
      (s.buildings.house ?? 0) < 2 &&
      !s.construction.house_2 &&
      s.money > 35000
    ) {
      buy("wood", Math.max(0, 200 - quantity(s, "wood")));
      buy("stone", Math.max(0, 100 - quantity(s, "stone")));
      run({ type: "build", building: "house_2" });
    }
    if (
      s.relationships.dating === "ivy" &&
      s.relationships.weddingDay === null &&
      (s.friendship.ivy ?? 0) >= 1000 &&
      (s.buildings.house ?? 0) >= 2 &&
      s.flags.winter_stone
    ) {
      if (!quantity(s, "hearth_ring")) buy("hearth_ring", 1);
      const schedule = resolveSchedule(s, "ivy");
      if (schedule) {
        run({ type: "teleport", map: schedule.map });
        run({ type: "propose", npc: "ivy" });
      }
    }
    if (
      s.relationships.marriedDay !== null &&
      s.day - s.relationships.marriedDay >= 120 &&
      !s.relationships.child
    ) {
      run({ type: "teleport", map: "farmhouse" });
      run({ type: "adopt", choice: "adoption" });
    }
    run({ type: "teleport", map: "farm" });
    if (s.money > 2200 && !s.decorations.some((d) => d.id === "crow_kite")) {
      buy("crow_kite", 1);
      run({ type: "decorate", item: "crow_kite", x: 15, y: 12 });
    }
    const crop =
      crops.find((c) => c.season === date.season && c.regrowDays > 0) ??
      crops.find((c) => c.season === date.season)!;
    if (date.season !== "winter") {
      run({ type: "equip", tool: "hoe" });
      for (let y = 11; y <= 13; y++)
        for (let x = 11; x <= 19; x++) {
          const p = s.plots[`${x},${y}`];
          if (p?.withered) {
            run({ type: "clear", x, y });
          }
          if (
            p?.crop &&
            p.growth >= (crops.find((c) => c.id === p.crop)?.growDays ?? 99)
          )
            run({ type: "harvest", x, y });
          if (!s.plots[`${x},${y}`]?.tilled) run({ type: "use", x, y });
        }
      for (const x of [12, 15, 18])
        if (!s.plots[`${x},12`]?.crop && s.money >= crop.seedPrice) {
          buy(`${crop.id}_seed`, 1);
          run({ type: "plant", crop: crop.id, x, y: 12 });
        }
      run({ type: "refill" });
      for (let y = 11; y <= 13; y++)
        for (let x = 11; x <= 19; x++) {
          if (s.stamina < 3) run({ type: "hotSpring" });
          run({ type: "water", x, y });
        }
    }
    if (
      s.day > 30 &&
      !s.buildings.coop &&
      !s.construction.coop &&
      s.money > 7000
    ) {
      buy("wood", 80);
      buy("stone", 30);
      run({ type: "build", building: "coop" });
    }
    if (s.buildings.coop && !s.animals.length && s.money > 2000)
      run({ type: "buyAnimal", kind: "chicken", name: "Marigold" });
    for (const a of s.animals) {
      run({ type: "care", animal: a.id, action: "pet" });
      if (!a.fed) {
        if (!quantity(s, "fodder")) buy("fodder", 10);
        run({ type: "care", animal: a.id, action: "feed" });
      }
      run({ type: "collect", animal: a.id });
    }
    if (
      (d < 30 && ["rain", "storm"].includes(s.weather)) ||
      (d >= 30 && d < 85) ||
      (date.weekday > 4 && d >= 30)
    ) {
      if (d >= 30 && date.weekday === 5)
        while (s.minute < 1080 && s.day === startDay)
          run({ type: "hotSpring" });
      for (const location of d < 30
        ? ["riverside", "mountain"]
        : ["riverside", "mountain", "beach", "mine"]) {
        run({ type: "teleport", map: location });
        for (let i = 0; i < 2; i++) {
          if (s.stamina < 4) run({ type: "hotSpring" });
          run({ type: "fish", location, skill: 1 });
        }
      }
    }
    for (const location of ["forest", "mountain", "beach"]) {
      run({ type: "teleport", map: location });
      for (let i = 0; i < 3; i++) run({ type: "forage" });
    }
    ship();
    if (s.money > 3000) {
      for (const id of ["axe", "hammer", "rod"]) {
        const t = s.tools[id]!;
        if (t.tier < (id === "rod" ? 3 : 2) && t.readyDay === undefined) {
          const bar = ["bronze_bar", "iron_bar", "silversteel_bar"][t.tier]!;
          buy(bar, 2);
          run({ type: "upgradeTool", tool: id });
        }
      }
    }
    if (s.trees.length < 3 && s.money > 2000) {
      run({ type: "teleport", map: "farm" });
      buy("apple_sapling", 1);
      run({
        type: "plantTree",
        tree: "apple",
        x: 30 + s.trees.length * 3,
        y: 20,
      });
    }
    if (s.tools.axe!.tier >= 2 && !s.flags.orchard_stump_cleared) {
      run({ type: "teleport", map: "farm" });
      run({ type: "equip", tool: "axe" });
      if (s.stamina < 4) run({ type: "hotSpring" });
      run({ type: "clear", x: 18, y: 19 });
    }
    if (s.tools.hammer!.tier >= 2 && !s.flags.orchard_boulder_cleared) {
      run({ type: "teleport", map: "farm" });
      run({ type: "equip", tool: "hammer" });
      if (s.stamina < 4) run({ type: "hotSpring" });
      run({ type: "clear", x: 16, y: 20 });
    }
    run({ type: "story", id: "spring" });
    if (!s.flags.boat_repaired && s.money > 4000) {
      buy("wood", 30);
      buy("iron_bar", 2);
      run({ type: "story", id: "boat" });
    }
    run({ type: "story", id: "summer" });
    if (s.flags.summer_stone && s.mine.maxFloor < 50 && s.minute < 1000) {
      run({
        type: "mine",
        action: "enter",
        floor: Math.max(1, Math.floor(s.mine.maxFloor / 10) * 10),
      });
      let safety = 0;
      while (
        s.mine.floor < 50 &&
        s.day === startDay &&
        s.minute < 1400 &&
        safety++ < 150
      ) {
        if (s.stamina < 5) run({ type: "hotSpring" });
        run({ type: "mine", action: s.mine.ladder ? "descend" : "break" });
        for (const discovery of sunrootDiscoveries)
          if (discovery.map === "mine" && canDiscoverSunroot(s, discovery))
            run({ type: "story", id: discovery.id });
      }
      run({ type: "mine", action: "exit" });
    }
    run({ type: "story", id: "autumn" });
    if (festivals.some((f) => f.season === date.season && f.day === date.day))
      run({ type: "festival", score: 90 });
    for (const a of arcs) {
      const next = a.events
        .map((id) => arcEvents.find((e) => e.id === id))
        .find((e) => e && !s.flags[e.flag]);
      if (next && !npcAvailable(s, next.npc)) continue;
      if (next) run({ type: "teleport", map: next.location });
      run({ type: "story", id: a.id });
    }
    run({ type: "story", id: "winter" });
    run({ type: "story", id: "vote" });
    for (const page of journalPages)
      if (!s.flags[`page_${page.id}`]) run({ type: "discover", page: page.id });
    for (const discovery of sunrootDiscoveries) {
      if (discovery.map !== "mine" && canDiscoverSunroot(s, discovery)) {
        run({ type: "teleport", map: discovery.map });
        run({ type: "story", id: discovery.id });
      }
    }
    assert(Number.isFinite(s.money) && s.money >= 0);
    assert(s.inventory.every((i) => i.quantity > 0));
    if (s.day === startDay) run({ type: "sleep" });
  }
  return {
    state: s,
    commands,
    summary: {
      seed,
      day: s.day,
      totalEarned: s.stats.totalEarned,
      money: s.money,
      fish: Object.keys(s.fishRecords).length,
      crops: s.stats.cropsShipped,
      mine: s.mine.maxFloor,
      arcs: arcs.filter((a) => s.flags[`arc_${a.id}`]).length,
      storyScenes: arcEvents.filter((e) => s.flags[e.flag]).length,
      sunroots: sunrootDiscoveries.filter((entry) => s.flags[entry.id]).length,
      spouse: s.relationships.spouse,
      marriedDay: s.relationships.marriedDay,
      child: s.relationships.child,
      festivals: festivals.filter((f) => s.flags[`attended_${f.id}`]).length,
      ending: evaluate(s).tier,
      hash: hash(s),
    },
  };
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const short = process.argv.includes("--short");
  const results = [];
  for (const seed of short ? [1739] : [1739, 42, 808, 2026, 991]) {
    const result = simulate(seed, short ? 30 : 300);
    if (!short) {
      assert(result.state.flags.bloom, JSON.stringify(result.summary));
      for (const stone of [
        "spring_stone",
        "summer_stone",
        "autumn_stone",
        "winter_stone",
      ])
        assert(result.state.flags[stone], stone);
      assert.equal(result.summary.arcs, 9);
      assert.equal(result.summary.storyScenes, 45);
      assert.equal(result.summary.sunroots, 10);
      assert.equal(result.state.maxStamina, 200);
      assert.equal(result.state.relationships.spouse, "ivy");
      assert(result.state.relationships.child);
      assert.equal(result.summary.festivals, 9);
      assert.notEqual(result.summary.ending, "Uncertain Willowmere");
    }
    const replay = createGame({ seed });
    for (const c of result.commands) dispatch(replay, c);
    assert.equal(hash(replay), hash(result.state));
    results.push(result.summary);
  }
  writeFileSync(
    new URL(
      short ? "../../SIM_SHORT_RESULTS.json" : "../../SIM_RESULTS.json",
      import.meta.url,
    ),
    JSON.stringify(results, null, 2) + "\n",
  );
  console.log(JSON.stringify(results, null, 2));
}
