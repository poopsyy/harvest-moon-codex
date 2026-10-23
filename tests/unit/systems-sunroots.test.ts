import { expect, it } from "vitest";
import { createGame } from "../../src/state/game";
import { dispatch } from "../../src/systems/engine";
import { sunrootDiscoveries } from "../../src/data/sunroots";
it("requires ten distinct gated discoveries to reach the stamina cap", () => {
  const s = createGame();
  expect(sunrootDiscoveries).toHaveLength(10);
  for (const entry of sunrootDiscoveries) {
    s.player.map = entry.map;
    expect(dispatch(s, { type: "story", id: entry.id })[0]?.type).toBe(
      "Blocked",
    );
  }
  s.flags.orchard_stump_cleared = s.flags.orchard_boulder_cleared = true;
  s.flags.boat_repaired = s.flags.bloom = true;
  s.trees = Array.from({ length: 3 }, (_, x) => ({
    id: "apple",
    x,
    y: 20,
    age: 0,
    fruit: false,
  }));
  s.fishRecords = { a: 1, b: 1, c: 1, d: 1, e: 1 };
  s.stats.cropsShipped = 50;
  s.stats.festivals = 3;
  for (const entry of sunrootDiscoveries) {
    s.player.map = "farmhouse";
    expect(dispatch(s, { type: "story", id: entry.id })[0]?.type).toBe(
      "Blocked",
    );
    s.player.map = entry.map;
    if (entry.gate === "floor") s.mine.floor = entry.threshold;
    const before = s.maxStamina;
    expect(
      dispatch(s, { type: "story", id: entry.id }).filter(
        (e) => e.type === "Dialogue",
      ),
    ).toHaveLength(entry.lines.length);
    expect(s.flags[entry.id]).toBe(true);
    expect(s.maxStamina).toBe(before + 10);
    expect(dispatch(s, { type: "story", id: entry.id })[0]?.type).toBe(
      "Blocked",
    );
    expect(s.maxStamina).toBe(before + 10);
  }
  expect(s.maxStamina).toBe(200);
});
