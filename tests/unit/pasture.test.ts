import { describe, it, expect } from "vitest";
import { createGame, type Animal } from "../../src/state/game";
import {
  plantGrass,
  cutGrass,
  grassReady,
  hasGrass,
  siloCapacity,
  siloFodder,
  feedFromSilo,
  grazeAnimal,
} from "../../src/systems/pasture";
const farm = () => {
  const s = createGame();
  s.debris = {};
  s.inventory = [{ id: "grass_seed", quantity: 5, quality: 0 }];
  return s;
};
const cow = (id = "cow"): Animal => ({
  id,
  kind: "cow",
  name: id,
  affection: 0,
  fed: false,
  petted: false,
  brushed: false,
  outside: true,
  sick: false,
  neglect: 0,
  age: 20,
  product: false,
  pregnant: null,
  away: false,
});
describe("perennial pasture and conserved silo feed", () => {
  it("consumes one seed for one patch, matures after three days and regrows after cutting", () => {
    const s = farm();
    expect(plantGrass(s, 12, 14)).toEqual({
      ok: true,
      x: 12,
      y: 14,
      readyDay: 3,
    });
    expect(s.inventory[0]!.quantity).toBe(4);
    expect(hasGrass(s, 12, 14)).toBe(true);
    expect(cutGrass(s, 12, 14)).toBe(0);
    s.day = 2;
    expect(grassReady(s, 12, 14)).toBe(false);
    s.day = 3;
    expect(cutGrass(s, 12, 14)).toBe(1);
    expect(s.inventory.find((i) => i.id === "fodder")?.quantity).toBe(1);
    expect(cutGrass(s, 12, 14)).toBe(0);
    expect(hasGrass(s, 12, 14)).toBe(true);
    s.day = 6;
    expect(cutGrass(s, 12, 14)).toBe(1);
    expect(s.inventory.find((i) => i.id === "fodder")?.quantity).toBe(2);
  });
  it("fails atomically on map, boundaries, winter, path, fences, water and buildings", () => {
    for (const [x, y, error] of [
      [NaN, 14, "invalid_tile"],
      [12.5, 14, "invalid_tile"],
      [0, 14, "invalid_tile"],
      [79, 14, "invalid_tile"],
      [12, 63, "invalid_tile"],
      [12, 9, "occupied"],
      [12, 11, "occupied"],
      [29, 14, "occupied"],
      [8, 4, "occupied"],
    ] as const) {
      const s = farm(),
        before = JSON.stringify(s);
      expect(plantGrass(s, x, y)).toEqual({ ok: false, error });
      expect(JSON.stringify(s)).toBe(before);
    }
    const s = farm();
    s.player.map = "greenhouse";
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "wrong_map" });
    s.player.map = "farm";
    s.day = 90;
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "winter" });
    expect(s.inventory[0]!.quantity).toBe(5);
  });
  it("rejects crop plots, roots, placed decor, debris, repeated seeds and missing supplies", () => {
    const s = farm();
    s.debris["12,14"] = "weed";
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "occupied" });
    s.debris = {};
    s.trees.push({ id: "apple", x: 13, y: 14, age: 0, fruit: false });
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "occupied" });
    s.trees = [];
    s.decorations.push({ id: "willow_chair", x: 11, y: 14, rotation: 0 });
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "occupied" });
    s.decorations = [{ id: "willow_chair", x: 12, y: 13, rotation: 90 }];
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "occupied" });
    s.decorations = [];
    s.plots["12,14"] = {
      x: 12,
      y: 14,
      tilled: true,
      watered: false,
      fertilizer: 0,
      crop: null,
      growth: 0,
      quality: 0,
      withered: false,
      dryDays: 0,
      streak: 0,
    };
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "occupied" });
    s.plots["12,14"]!.tilled = false;
    s.plots["12,14"]!.crop = "turnip";
    expect(plantGrass(s, 12, 14)).toEqual({ ok: false, error: "occupied" });
    s.plots = {};
    expect(plantGrass(s, 12, 14).ok).toBe(true);
    expect(plantGrass(s, 12, 14)).toEqual({
      ok: false,
      error: "already_planted",
    });
    s.inventory = [];
    expect(plantGrass(s, 13, 14)).toEqual({ ok: false, error: "no_seed" });
  });
  it("caps silo tiers at 200/500/999 and routes surplus to inventory without losing feed", () => {
    const s = farm();
    expect(siloCapacity(s)).toBe(0);
    for (const [tier, capacity] of [
      [1, 200],
      [2, 500],
      [3, 999],
      [4, 999],
    ]) {
      s.buildings.silo = tier!;
      expect(siloCapacity(s)).toBe(capacity);
    }
    s.buildings.silo = 1;
    s.collections.silo_fodder = 199;
    plantGrass(s, 12, 14);
    plantGrass(s, 13, 14);
    s.day = 3;
    expect(cutGrass(s, 12, 14)).toBe(1);
    expect(siloFodder(s)).toBe(200);
    expect(cutGrass(s, 13, 14)).toBe(1);
    expect(siloFodder(s)).toBe(200);
    expect(s.inventory.find((i) => i.id === "fodder")?.quantity).toBe(1);
    expect(feedFromSilo(s)).toBe(true);
    expect(siloFodder(s)).toBe(199);
    s.collections.silo_fodder = 0;
    expect(feedFromSilo(s)).toBe(false);
    expect(siloFodder(s)).toBe(0);
    s.collections.silo_fodder = 1;
    delete s.buildings.silo;
    expect(feedFromSilo(s)).toBe(false);
    expect(siloFodder(s)).toBe(1);
  });
  it("preserves mature grass when both storage destinations are full", () => {
    const s = farm();
    plantGrass(s, 12, 14);
    s.day = 3;
    s.buildings.silo = 1;
    s.collections.silo_fodder = 200;
    s.inventory = Array.from({ length: 24 }, (_, i) => ({
      id: `test_${i}`,
      quantity: 1,
      quality: 0,
    }));
    const before = JSON.stringify(s);
    expect(cutGrass(s, 12, 14)).toBe(0);
    expect(JSON.stringify(s)).toBe(before);
    s.flags.backpack = true;
    expect(cutGrass(s, 12, 14)).toBe(1);
    expect(s.inventory.length).toBe(25);
  });
  it("grazing requires actual grass and consumes one distinct patch for each animal", () => {
    const s = farm(),
      a = cow("a"),
      b = cow("b");
    expect(grazeAnimal(s, a)).toBe(false);
    plantGrass(s, 13, 14);
    plantGrass(s, 12, 14);
    s.day = 3;
    expect(grazeAnimal(s, a)).toBe(true);
    expect(a.fed).toBe(true);
    expect(grassReady(s, 12, 14)).toBe(false);
    expect(grassReady(s, 13, 14)).toBe(true);
    expect(grazeAnimal(s, a)).toBe(false);
    expect(grazeAnimal(s, b)).toBe(true);
    expect(grazeAnimal(s, cow("c"))).toBe(false);
    expect(siloFodder(s)).toBe(0);
    expect(s.inventory.every((i) => i.id !== "fodder")).toBe(true);
  });
  it("keeps roots dormant in winter and prevents grazing in bad weather or while sheltered", () => {
    const s = farm(),
      a = cow();
    plantGrass(s, 12, 14);
    s.day = 3;
    for (const weather of ["rain", "storm", "snow", "blizzard"] as const) {
      s.weather = weather;
      expect(grazeAnimal(s, a)).toBe(false);
    }
    s.weather = "cloudy";
    a.outside = false;
    expect(grazeAnimal(s, a)).toBe(false);
    a.outside = true;
    a.away = true;
    expect(grazeAnimal(s, a)).toBe(false);
    a.away = false;
    a.kind = "cat";
    expect(grazeAnimal(s, a)).toBe(false);
    a.kind = "cow";
    s.day = 90;
    expect(grazeAnimal(s, a)).toBe(false);
    expect(cutGrass(s, 12, 14)).toBe(0);
    s.day = 120;
    expect(grazeAnimal(s, a)).toBe(true);
  });
  it("survives JSON save roundtrips and consumes the final seed stack cleanly", () => {
    const s = farm();
    s.inventory[0]!.quantity = 1;
    plantGrass(s, 12, 14);
    expect(s.inventory).toEqual([]);
    s.day = 3;
    const loaded = JSON.parse(JSON.stringify(s)) as typeof s;
    expect(grassReady(loaded, 12, 14)).toBe(true);
    expect(cutGrass(loaded, 12, 14)).toBe(1);
    loaded.player.map = "square";
    loaded.day = 6;
    expect(cutGrass(loaded, 12, 14)).toBe(0);
    expect(grassReady(loaded, 12, 14)).toBe(true);
    expect(hasGrass(loaded, -1, 14)).toBe(false);
  });
});
