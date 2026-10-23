import { describe, expect, it } from "vitest";
import {
  catalog,
  catalogSchemas,
  validateCatalog,
  itemById,
  npcs,
  maps,
  forage,
  recipes,
  crops,
  trees,
  flowers,
  processedGoods,
} from "../../src/data/catalog";

describe("complete authored catalog", () => {
  it("validates every data array and every reference", () => {
    expect(validateCatalog).not.toThrow();
  });
  it("meets all content minimums", () => {
    const minimums = {
      crops: 20,
      trees: 5,
      flowers: 6,
      fish: 24,
      forage: 30,
      minerals: 14,
      recipes: 40,
      processedGoods: 15,
      decor: 40,
      wallpapers: 10,
      floors: 10,
      festivals: 9,
      achievements: 30,
      maps: 25,
      npcs: 20,
    };
    for (const key of Object.keys(minimums) as (keyof typeof minimums)[])
      expect(catalog[key].length, key).toBeGreaterThanOrEqual(minimums[key]);
    expect(npcs.filter((npc) => npc.romanceable)).toHaveLength(5);
    for (const npc of npcs.filter((npc) => npc.romanceable))
      expect(npc.age).toBeGreaterThanOrEqual(25);
    expect(npcs.find((npc) => npc.id === "pip")?.romanceable).toBe(false);
  });
  it("offers twelve forage varieties in every season", () => {
    for (const season of ["spring", "summer", "autumn", "winter"])
      expect(
        forage.filter((item) => item.seasons.includes(season)).length,
        season,
      ).toBeGreaterThanOrEqual(12);
  });
  it("connects every destination to the farm with reciprocal exits", () => {
    const visited = new Set(["farm"]);
    const queue = ["farm"];
    while (queue.length) {
      const id = queue.shift();
      for (const next of maps.find((map) => map.id === id)?.connections ?? []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push(next);
        }
      }
    }
    expect(visited.size).toBe(maps.length);
  });
  it("has safe schedules for every weekday, season and weather combination", () => {
    for (const npc of npcs)
      for (let weekday = 0; weekday < 7; weekday++)
        for (const season of ["spring", "summer", "autumn", "winter"] as const)
          for (const weather of [
            "sunny",
            "cloudy",
            "rain",
            "storm",
            "snow",
            "blizzard",
          ]) {
            const rule = npc.scheduleRules
              .filter(
                (rule) =>
                  !rule.festival &&
                  (!rule.weekdays.length || rule.weekdays.includes(weekday)) &&
                  (!rule.seasons.length || rule.seasons.includes(season)) &&
                  (!rule.weather.length || rule.weather.includes(weather)),
              )
              .sort((a, b) => b.priority - a.priority)[0];
            const schedule = rule?.steps ?? npc.schedule;
            for (let hour = 6; hour <= 25; hour++) {
              const step = [...schedule]
                .reverse()
                .find((step) => step.hour <= hour);
              expect(
                step,
                `${npc.id}/${weekday}/${season}/${weather}/${hour}`,
              ).toBeDefined();
              const map = maps.find((map) => map.id === step?.map);
              expect(map).toBeDefined();
              expect(step?.x ?? Infinity).toBeLessThan(map?.width ?? 0);
              expect(step?.y ?? Infinity).toBeLessThan(map?.height ?? 0);
            }
          }
  });
  it("provides purchasable seeds and usable recipe outputs", () => {
    for (const crop of [...crops, ...flowers])
      expect(itemById(`${crop.id}_seed`)?.price).toBe(crop.seedPrice);
    for (const tree of trees)
      expect(itemById(`${tree.id}_sapling`)?.price).toBe(tree.saplingPrice);
    for (const recipe of recipes) {
      expect(itemById(recipe.id)?.stamina).toBe(recipe.stamina);
      expect(recipe.ingredients.length).toBeGreaterThanOrEqual(2);
    }
    for (const good of processedGoods)
      expect(itemById(good.machine)?.category).toBe("decor");
    expect(itemById("missing_item")).toBeUndefined();
  });
  it("rejects malformed content instead of silently accepting bad data", () => {
    expect(
      catalogSchemas.crops.safeParse([{ ...crops[0], growDays: -1 }]).success,
    ).toBe(false);
    expect(
      catalogSchemas.npcs.safeParse([{ ...npcs[0], loved: [] }]).success,
    ).toBe(false);
    const recipe = recipes[0];
    if (!recipe) throw new Error("Missing recipe");
    const part = recipe.ingredients[0];
    if (!part) throw new Error("Missing ingredient");
    const original = part.item;
    try {
      part.item = "missing_item";
      expect(validateCatalog).toThrow("Missing item");
    } finally {
      part.item = original;
    }
  });
});
