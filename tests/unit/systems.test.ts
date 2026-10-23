import { describe, it, expect } from "vitest";
import { createGame, type Command } from "../../src/state/game";
import {
  dispatch,
  advanceDay,
  tick,
  getDate,
  evaluate,
  addItem,
  takeItem,
  quantity,
  selectDialogue,
  resolveSchedule,
  npcAvailable,
} from "../../src/systems/engine";
import { findPath } from "../../src/systems/pathfinding";
import { random, hash, clamp } from "../../src/core/rng";
import { EventBus } from "../../src/core/events";
import { npcs, recipes, fish, processedGoods } from "../../src/data/catalog";
import {
  arcs,
  arcEvents,
  journalPages,
  heartEvents,
} from "../../src/data/narrative";
const rich = () => {
  const s = createGame();
  s.money = 1e7;
  s.stamina = s.maxStamina = 200;
  s.decorations.push({ id: "crow_kite", x: 12, y: 12, rotation: 0 });
  return s;
};
describe("deterministic farm", () => {
  it("holds the council vote without restoration and permits a later hopeful revote", () => {
    const s = createGame();
    s.day = 266;
    advanceDay(s);
    expect(s.flags.evaluated).toBe(true);
    expect(evaluate(s).tier).toBe("Uncertain Willowmere");
    dispatch(s, { type: "acknowledge", event: "vote" });
    expect(s.flags.vote_seen).toBe(true);
    s.flags.winter_stone = true;
    const events = advanceDay(s);
    expect(events.some((e) => e.type === "Revote")).toBe(true);
    expect(s.flags.vote_seen).toBe(false);
    expect(evaluate(s).tier).toBe("Steady Willowmere");
  });

  it("preserves all nine seeds when precise sow opens a bag", () => {
    const s = createGame();
    dispatch(s, { type: "settings", values: { preciseSow: true } });
    for (let x = 35; x < 44; x++) dispatch(s, { type: "use", x, y: 10 });
    for (let x = 35; x < 44; x++)
      dispatch(s, { type: "plant", crop: "turnip", x, y: 10 });
    expect(
      Object.values(s.plots).filter((p) => p.crop === "turnip"),
    ).toHaveLength(9);
    expect(quantity(s, "turnip_seed")).toBe(2);
    expect(s.seedCharges.turnip).toBe(0);
  });

  it("selects seeds and settings through commands and routes hand interactions", () => {
    const s = createGame();
    dispatch(s, {
      type: "settings",
      values: {
        timeSpeed: 2,
        preciseSow: true,
        runToggle: true,
        festivalDifficulty: 0.5,
      },
    });
    expect(s.settings.preciseSow).toBe(true);
    dispatch(s, { type: "use", x: 10, y: 12 });
    dispatch(s, { type: "selectSeed", crop: "turnip" });
    expect(s.equipped).toBe("seeds");
    dispatch(s, { type: "use", x: 10, y: 12 });
    expect(s.plots["10,12"]!.crop).toBe("turnip");
    s.plots["10,12"]!.growth = 4;
    dispatch(s, { type: "equip", tool: "hand" });
    dispatch(s, { type: "use", x: 10, y: 12 });
    expect(quantity(s, "turnip")).toBe(1);
    dispatch(s, { type: "teleport", map: "forest" });
    dispatch(s, { type: "use" });
    expect(Object.keys(s.foraged)).toHaveLength(1);
  });

  it("grows only watered crops and ships quality at the documented multiplier", () => {
    const s = createGame();
    s.decorations.push({ id: "crow_kite", x: 11, y: 11, rotation: 0 });
    dispatch(s, { type: "use", x: 11, y: 11 });
    dispatch(s, { type: "plant", crop: "turnip", x: 11, y: 11 });
    advanceDay(s);
    expect(s.plots["11,11"]!.growth).toBe(0);
    for (let i = 0; i < 4; i++) {
      dispatch(s, { type: "water", x: 11, y: 11 });
      advanceDay(s);
    }
    expect(s.plots["11,11"]!.growth).toBe(4);
    dispatch(s, { type: "harvest", x: 11, y: 11 });
    expect(quantity(s, "turnip")).toBe(1);
    dispatch(s, { type: "ship", item: "turnip", quantity: 1 });
    const before = s.money;
    advanceDay(s);
    expect(s.money - before).toBeGreaterThanOrEqual(60);
    expect(s.stats.cropsShipped).toBe(1);
  });
  it("handles rain, greenhouse, regrowth, fertilizer and withering", () => {
    const s = rich();
    s.flags.backpack = true;
    addItem(s, "fertilizer", 2);
    addItem(s, "peas_seed");
    for (const type of ["use", "fertilize", "plant"] as const)
      dispatch(s, { type, x: 12, y: 12, crop: "peas" });
    s.plots["12,12"]!.growth = 8;
    dispatch(s, { type: "harvest", x: 12, y: 12 });
    expect(s.plots["12,12"]!.growth).toBe(5);
    s.forecast = "rain";
    advanceDay(s);
    expect(s.plots["12,12"]!.watered).toBe(true);
    s.day = 29;
    advanceDay(s);
    expect(s.plots["12,12"]!.withered).toBe(true);
    dispatch(s, { type: "clear", x: 12, y: 12 });
    expect(s.plots["12,12"]!.crop).toBe(null);
    s.buildings.greenhouse = 1;
    dispatch(s, { type: "teleport", map: "greenhouse" });
    dispatch(s, { type: "use", x: 12, y: 12 });
    dispatch(s, { type: "plant", crop: "turnip", x: 12, y: 12 });
    s.day = 59;
    advanceDay(s);
    expect(s.plots["g:12,12"]!.withered).toBe(false);
  });
  it("clears correct debris tiers, charges tools and refills", () => {
    const s = rich();
    const kinds = ["weed", "stone", "branch", "stump", "boulder", "log"];
    for (const kind of kinds) {
      s.debris["10,10"] = kind;
      const tool =
        kind === "weed"
          ? "sickle"
          : ["stone", "boulder"].includes(kind)
            ? "hammer"
            : "axe";
      dispatch(s, { type: "equip", tool: "hoe" });
      expect(dispatch(s, { type: "clear", x: 10, y: 10 })[0]?.type).toBe(
        "Blocked",
      );
      dispatch(s, { type: "equip", tool });
      s.tools[tool]!.tier = 0;
      dispatch(s, { type: "clear", x: 10, y: 10 });
      s.tools[tool]!.tier = 4;
      dispatch(s, { type: "clear", x: 10, y: 10 });
      expect(s.debris["10,10"]).toBeUndefined();
    }
    dispatch(s, { type: "equip", tool: "hoe" });
    s.debris = {};
    s.tools.hoe!.tier = 4;
    dispatch(s, { type: "use", x: 20, y: 15, charge: 4 });
    expect(
      Object.values(s.plots).filter((p) => p.tilled).length,
    ).toBeGreaterThanOrEqual(25);
    dispatch(s, { type: "equip", tool: "can" });
    s.tools.can!.tier = 4;
    dispatch(s, { type: "refill" });
    dispatch(s, { type: "use", x: 20, y: 15, charge: 4 });
    expect(s.tools.can!.water).toBe(135);
  });
  it("uses late sleep and collapse penalties, fatigue/cold and soil reversion", () => {
    const s = rich();
    s.minute = 1450;
    advanceDay(s);
    expect(s.stamina).toBe(150);
    s.minute = 1560;
    s.fatigue = 95;
    const money = s.money;
    advanceDay(s);
    expect(s.money).toBe(money - 1000);
    expect(s.cold).toBe(true);
    s.cold = false;
    s.player.map = "farm";
    dispatch(s, { type: "use", x: 4, y: 4 });
    for (let i = 0; i < 3; i++) {
      s.forecast = "sunny";
      s.plots["4,4"]!.watered = false;
      advanceDay(s);
    }
    expect(s.plots["4,4"]!.tilled).toBe(false);
    tick(s, 1300);
    expect(s.minute).toBe(360);
    expect(tick(s, NaN)).toEqual([]);
  });
  it("does not overdraw bags, money or stacked storage", () => {
    const s = rich();
    expect(addItem(s, "wood", 0)).toBe(false);
    expect(takeItem(s, "wood", -2)).toBe(false);
    dispatch(s, { type: "buy", item: "wood", quantity: 20 });
    dispatch(s, { type: "store", item: "wood", quantity: 10 });
    dispatch(s, { type: "store", item: "wood", quantity: 5 });
    dispatch(s, { type: "retrieve", item: "wood", quantity: 10 });
    expect(quantity(s, "wood")).toBe(15);
    dispatch(s, { type: "sell", item: "wood", quantity: 5 });
    dispatch(s, { type: "ship", item: "wood", quantity: 5 });
    dispatch(s, { type: "ship", item: "wood", quantity: 5 });
    expect(quantity(s, "wood")).toBe(0);
    expect(s.shipping[0]!.quantity).toBe(10);
    for (let i = 0; i < 30; i++) addItem(s, `item${i}`);
    expect(addItem(s, "full")).toBe(false);
    expect(
      dispatch(s, { type: "buy", item: "wood", quantity: 1 })[0]!.type,
    ).toBe("Blocked");
  });
  it("constructs houses, upgrades tools, smelts and processes food", () => {
    const s = rich();
    addItem(s, "wood", 2000);
    addItem(s, "stone", 2000);
    for (const id of ["house_1", "house_2", "coop", "barn", "furnace"]) {
      dispatch(s, { type: "build", building: id });
      for (let i = 0; i < 3; i++) advanceDay(s);
    }
    expect(s.buildings.house).toBe(2);
    for (const tool of ["axe", "hammer"]) {
      addItem(s, "bronze_bar", 2);
      dispatch(s, { type: "upgradeTool", tool });
      advanceDay(s);
      advanceDay(s);
      expect(s.tools[tool]!.tier).toBe(1);
    }
    addItem(s, "iron_ore", 3);
    dispatch(s, { type: "smelt", ore: "iron_ore" });
    expect(quantity(s, "iron_bar")).toBe(1);
    const r = recipes[0]!;
    for (const i of r.ingredients) addItem(s, i.item, i.count);
    dispatch(s, { type: "cook", recipe: r.id });
    expect(s.knownRecipes).toContain(r.id);
    dispatch(s, { type: "eat", item: r.id });
    const good = processedGoods.find((p) => p.ingredients.length > 0)!;
    s.buildings[good.machine] = 1;
    for (const i of good.ingredients) addItem(s, i.item, i.count);
    dispatch(s, { type: "process", recipe: good.id });
    tick(s, 180);
    expect(quantity(s, good.id)).toBeGreaterThan(0);
  });
  it("raises animals, cures sickness and delivers births", () => {
    const s = rich();
    s.buildings.coop = s.buildings.barn = 3;
    for (const kind of ["chicken", "cow", "sheep"])
      dispatch(s, { type: "buyAnimal", kind, name: "Clover" });
    addItem(s, "fodder", 100);
    for (const a of s.animals) {
      dispatch(s, { type: "care", animal: a.id, action: "pet" });
      dispatch(s, { type: "care", animal: a.id, action: "brush" });
      dispatch(s, { type: "care", animal: a.id, action: "outside" });
    }
    advanceDay(s);
    dispatch(s, { type: "collect", animal: s.animals[0]!.id });
    expect(quantity(s, "egg")).toBe(1);
    dispatch(s, { type: "breed", animal: s.animals[0]!.id });
    for (let i = 0; i < 3; i++) {
      s.animals.forEach((a) =>
        dispatch(s, { type: "care", animal: a.id, action: "feed" }),
      );
      advanceDay(s);
    }
    expect(s.animals.length).toBe(4);
    expect(s.animals[3]!.age).toBe(0);
    const a = s.animals[0]!;
    a.sick = true;
    addItem(s, "animal_tonic");
    dispatch(s, { type: "care", animal: a.id, action: "cure" });
    expect(a.sick).toBe(false);
    a.away = true;
    dispatch(s, { type: "care", animal: a.id, action: "recover" });
    expect(a.away).toBe(false);
    dispatch(s, { type: "care", animal: "pet", action: "pet" });
    expect(s.petAffection).toBe(1);
  });
  it("applies social daily/weekly limits, birthday gifts and friendship floors", () => {
    const s = rich(),
      n = npcs[0]!;
    s.player.map = resolveSchedule(s, n.id)!.map;
    dispatch(s, { type: "talk", npc: n.id });
    dispatch(s, { type: "talk", npc: n.id });
    expect(s.friendship[n.id]).toBe(10);
    addItem(s, n.loved[0]!, 3);
    dispatch(s, { type: "gift", npc: n.id, item: n.loved[0]! });
    expect(s.friendship[n.id]).toBe(90);
    dispatch(s, { type: "gift", npc: n.id, item: n.loved[0]! });
    expect(quantity(s, n.loved[0]!)).toBe(2);
    advanceDay(s);
    dispatch(s, { type: "gift", npc: n.id, item: n.loved[0]! });
    advanceDay(s);
    expect(
      dispatch(s, { type: "gift", npc: n.id, item: n.loved[0]! })[0]!.type,
    ).toBe("Blocked");
    s.day =
      ["spring", "summer", "autumn", "winter"].indexOf(n.birthday.season) * 30 +
      n.birthday.day -
      1;
    dispatch(s, { type: "gift", npc: n.id, item: n.loved[0]! });
    expect(s.friendship[n.id]).toBeGreaterThan(300);
    const event = heartEvents[0]!;
    s.friendship[event.npc] = event.hearts * 100;
    s.flags[event.flag] = true;
    s.day += 20;
    advanceDay(s);
    expect(s.friendship[event.npc]).toBeGreaterThanOrEqual(
      event.hearts * 100 - 50,
    );
  });
  it("resolves all schedules and dialogue conditions deterministically", () => {
    const s = rich();
    for (const season of [0, 30, 60, 90])
      for (let weekday = 0; weekday < 7; weekday++)
        for (const weather of ["sunny", "rain", "snow", "storm"] as const) {
          s.day = season + weekday;
          s.weather = weather;
          for (const n of npcs) {
            if (npcAvailable(s, n.id))
              expect(resolveSchedule(s, n.id)?.map).toBeTruthy();
            else expect(resolveSchedule(s, n.id)).toBe(null);
            expect(selectDialogue(s, n.id).length).toBeGreaterThan(5);
          }
        }
    expect(resolveSchedule(s, "unknown")).toBe(null);
    expect(selectDialogue(s, "unknown")).toContain("quiet");
  });
  it("fishes, forages, mines, and prevents repeat Sunroot rewards", () => {
    const s = rich();
    s.tools.rod!.tier = 3;
    for (const location of ["riverside", "mountain", "beach", "mine"])
      for (let i = 0; i < 10; i++) {
        s.stamina = 200;
        s.player.map = location;
        dispatch(s, { type: "fish", location, skill: 1 });
      }
    expect(s.stats.fishCaught).toBeGreaterThan(0);
    s.player.map = "forest";
    dispatch(s, { type: "forage" });
    expect(Object.keys(s.foraged).length).toBe(1);
    s.player.map = "mountain";
    dispatch(s, { type: "mine", action: "enter" });
    for (let i = 0; i < 15; i++) {
      s.stamina = 200;
      dispatch(s, { type: "mine", action: "break" });
    }
    expect(s.mine.ladder).toBe(true);
    dispatch(s, { type: "mine", action: "descend" });
    expect(s.mine.floor).toBe(2);
    s.mine.floor = 9;
    s.mine.ladder = true;
    dispatch(s, { type: "mine", action: "descend" });
    expect(s.maxStamina).toBe(200);
    dispatch(s, { type: "mine", action: "exit" });
    expect(s.player.map).toBe("mountain");
  });
  it("completes romance, wedding, spouse care, child stages and evaluation", () => {
    const s = rich(),
      n = npcs.find((n) => n.romanceable)!;
    s.friendship[n.id] = 1000;
    s.buildings.house = 2;
    s.flags.winter_stone = true;
    addItem(s, "willow_ribbon");
    dispatch(s, { type: "date", npc: n.id });
    addItem(s, "hearth_ring");
    dispatch(s, { type: "propose", npc: n.id });
    for (let i = 0; i < 7; i++) advanceDay(s);
    expect(s.relationships.spouse).toBe(n.id);
    expect(resolveSchedule(s, n.id)?.map).toBe("farmhouse");
    s.day += 120;
    dispatch(s, { type: "adopt", choice: "adoption" });
    expect(s.relationships.child?.stage).toBe(0);
    s.day += 80;
    advanceDay(s);
    expect(s.relationships.child?.stage).toBe(2);
    expect(evaluate(s).tier).not.toBe("Uncertain Willowmere");
    s.stats.totalEarned = 1e6;
    for (const n of npcs) s.friendship[n.id] = 1000;
    for (const a of arcs) s.flags[`arc_${a.id}`] = true;
    expect(evaluate(s).tier).toBe("Thriving Willowmere");
  });
  it("repairs the boat once without charging materials again", () => {
    const s = createGame();
    s.player.map = "beach";
    addItem(s, "wood", 60);
    addItem(s, "iron_bar", 4);
    const woodBefore = quantity(s, "wood");
    const ironBefore = quantity(s, "iron_bar");
    dispatch(s, { type: "story", id: "boat" });
    expect(s.flags.boat_repaired).toBe(true);
    expect(quantity(s, "wood")).toBe(woodBefore - 30);
    expect(quantity(s, "iron_bar")).toBe(ironBefore - 2);
    const inventoryAfterRepair = structuredClone(s.inventory);
    const repeated = dispatch(s, { type: "story", id: "boat" });
    expect(repeated[0]?.type).toBe("Blocked");
    expect(s.flags.boat_repaired).toBe(true);
    expect(s.inventory).toEqual(inventoryAfterRepair);
  });

  it("gates story milestones, journals, festival and consequential choices", () => {
    const s = rich();
    for (const id of ["spring", "summer", "autumn", "winter", "vote"])
      expect(dispatch(s, { type: "story", id })[0]!.type).toBe("Blocked");
    s.tools.axe!.tier = s.tools.hammer!.tier = 2;
    dispatch(s, { type: "equip", tool: "axe" });
    dispatch(s, { type: "clear", x: 18, y: 19 });
    dispatch(s, { type: "equip", tool: "hammer" });
    dispatch(s, { type: "clear", x: 16, y: 20 });
    s.collections.spring_crops = 50;
    s.friendship.bram = 400;
    for (let i = 0; i < 3; i++) {
      addItem(s, "apple_sapling");
      dispatch(s, { type: "plantTree", tree: "apple", x: i * 3, y: 5 });
    }
    dispatch(s, { type: "story", id: "spring" });
    expect(s.flags.spring_stone).toBe(true);
    addItem(s, "wood", 30);
    addItem(s, "iron_bar", 2);
    dispatch(s, { type: "story", id: "boat" });
    for (const f of fish.slice(0, 15)) s.fishRecords[f.id] = 10;
    s.friendship.corran = 400;
    dispatch(s, { type: "story", id: "summer" });
    s.mine.maxFloor = 60;
    s.friendship.greta = 400;
    dispatch(s, { type: "story", id: "autumn" });
    for (const n of npcs) s.friendship[n.id] = 700;
    for (const n of npcs) s.friendship[n.id] = 1000;
    s.day = 257;
    for (const a of arcs)
      for (const id of a.events) {
        const e = arcEvents.find((e) => e.id === id)!;
        s.player.map = e.location;
        dispatch(s, { type: "story", id: a.id });
        if (s.pendingChoices.length)
          dispatch(s, { type: "choice", flag: s.pendingChoices[0]! });
      }
    s.day = 118;
    dispatch(s, { type: "festival", score: 90 });
    dispatch(s, { type: "story", id: "winter" });
    expect(s.flags.winter_stone).toBe(true);
    for (const a of arcs) dispatch(s, { type: "story", id: a.id });
    s.day = 270;
    s.flags.bloom = true;
    dispatch(s, { type: "story", id: "vote" });
    s.stats.festivals = 10;
    s.minute = 400;
    s.day = 359;
    for (const p of journalPages) dispatch(s, { type: "discover", page: p.id });
    expect(s.journal.length).toBeGreaterThan(10);
    s.pendingChoices = ["save_inn"];
    dispatch(s, { type: "choice", flag: "save_inn" });
    expect(s.flags.save_inn).toBe(true);
  });
  it("handles decor, trees, calendar, cooking TV, requests, directions and debug adapters", () => {
    const s = rich();
    dispatch(s, { type: "saveMarker", label: "picnic", day: 10 });
    expect(s.markers[0]?.day).toBe(10);
    dispatch(s, { type: "tv" });
    expect(s.knownRecipes.length).toBe(1);
    dispatch(s, { type: "readMail" });
    addItem(s, "wood", 3);
    dispatch(s, { type: "quest", id: "wood" });
    addItem(s, "wood");
    dispatch(s, { type: "decorate", item: "wood", x: 9, y: 4, rotation: 1 });
    expect(s.decorations.some((d) => d.id === "wood")).toBe(true);
    dispatch(s, { type: "face", direction: "left" });
    dispatch(s, { type: "move", dx: -1, dy: 0 });
    expect(s.player.facing).toBe("left");
    dispatch(s, { type: "hotSpring" });
    for (const action of [
      "money",
      "day",
      "item",
      "friendship",
      "flag",
      "grow",
      "weather",
    ])
      dispatch(s, {
        type: "debug",
        action,
        value: action === "weather" ? "rain" : 20,
        id: "wood",
      });
    expect(s.weather).toBe("rain");
    dispatch(s, { type: "debug", action: "minute", value: 2000 });
    expect(s.minute).toBe(1559);
    dispatch(s, { type: "debug", action: "flag", id: "wood", value: false });
    expect(s.flags.wood).toBe(false);
    dispatch(s, {
      type: "debug",
      action: "teleport",
      id: "farm",
      value: "999,-5",
    });
    expect(s.player.x).toBe(78);
    expect(s.player.y).toBe(1);
    expect(getDate(s).day).toBe(21);
  });
  it("rejects unavailable actions without corrupting state", () => {
    const s = createGame();
    const commands: Command[] = [
      { type: "buy", item: "bad", quantity: 1 },
      { type: "buy", item: "wood", quantity: 1e9 },
      { type: "ship", item: "wood", quantity: 1 },
      { type: "sell", item: "wood", quantity: -1 },
      { type: "eat", item: "wood" },
      { type: "talk", npc: "bad" },
      { type: "gift", npc: "bad", item: "wood" },
      { type: "gift", npc: npcs[0]!.id, item: "wood" },
      { type: "collect", animal: "bad" },
      { type: "breed", animal: "bad" },
      { type: "care", animal: "bad", action: "feed" },
      { type: "buyAnimal", kind: "dragon", name: "X" },
      { type: "buyAnimal", kind: "chicken", name: "X" },
      { type: "fish", location: "farm" },
      { type: "cook", recipe: recipes[0]!.id },
      { type: "process", recipe: processedGoods[0]!.id },
      { type: "upgradeTool", tool: "bad" },
      { type: "upgradeTool", tool: "axe" },
      { type: "smelt", ore: "iron_ore" },
      { type: "build", building: "bad" },
      { type: "build", building: "house_1" },
      { type: "decorate", item: "wood", x: 2, y: 2 },
      { type: "plantTree", tree: "apple", x: 2, y: 2 },
      { type: "date", npc: "pip" },
      { type: "propose", npc: "ivy" },
      { type: "adopt" },
      { type: "festival" },
      { type: "discover", page: "bad" },
      { type: "discover", page: journalPages[0]!.id },
      { type: "story", id: "bad" },
      { type: "choice", flag: "bad" },
      { type: "quest", id: "bad" },
      { type: "retrieve", item: "wood", quantity: 1 },
      { type: "equip", tool: "bad" },
      { type: "teleport", map: "bad" },
      { type: "teleport", map: "greenhouse" },
      { type: "plant", crop: "bad" },
      { type: "plant", crop: "melon" },
      { type: "plant", crop: "turnip" },
      { type: "harvest", x: 5, y: 5 },
      { type: "fertilize", x: 5, y: 5 },
      { type: "clear", x: 5, y: 5 },
      { type: "mine", action: "break" },
      { type: "mine", action: "descend" },
    ];
    for (const c of commands)
      expect(dispatch(s, c)[0]?.type, c.type).toBe("Blocked");
    expect(s.money).toBe(500);
  });
});
describe("core infrastructure", () => {
  it("produces reproducible random streams and stable hashes", () => {
    const a = { rng: 1 },
      b = { rng: 1 };
    for (let i = 0; i < 100; i++) expect(random(a)).toBe(random(b));
    expect(hash(a)).toBe(hash(b));
    expect(clamp(NaN, 0, 1)).toBe(0);
  });
  it("dispatches typed events and unsubscribes", () => {
    const bus = new EventBus();
    let count = 0;
    const off = bus.subscribe(() => count++);
    bus.emit([{ type: "DayEnded" }]);
    off();
    bus.emit([{ type: "DayEnded" }]);
    expect(count).toBe(1);
    bus.clear();
  });
  it("finds shortest valid paths around walls", () => {
    const path = findPath(
      { x: 0, y: 0 },
      { x: 4, y: 0 },
      5,
      5,
      new Set(["2,0", "2,1"]),
    );
    expect(path.length).toBe(9);
    expect(
      findPath({ x: 0, y: 0 }, { x: 2, y: 0 }, 3, 3, new Set(["2,0"])),
    ).toEqual([]);
    expect(
      findPath({ x: 0, y: 0 }, { x: 2, y: 2 }, 3, 3, new Set(["0,1", "1,0"])),
    ).toEqual([]);
  });
});
