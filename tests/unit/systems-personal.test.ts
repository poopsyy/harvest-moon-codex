import { it, expect } from "vitest";
import { createGame } from "../../src/state/game";
import { dispatch } from "../../src/systems/engine";
import { heartEvents, marriageEvents } from "../../src/data/narrative";
import { npcs } from "../../src/data/catalog";
it("makes every authored heart memory reachable at its location and friendship threshold", () => {
  expect(heartEvents.length).toBeGreaterThanOrEqual(75);
  for (const event of heartEvents) {
    const s = createGame();
    s.day = 257;
    s.flags.wren_returned = true;
    expect(dispatch(s, { type: "story", id: event.id })[0]?.type).toBe(
      "Blocked",
    );
    s.friendship[event.npc] = 1000;
    s.player.map = event.location;
    if (npcs.find((n) => n.id === event.npc)?.romanceable)
      s.relationships.dating = event.npc;
    const events = dispatch(s, { type: "story", id: event.id });
    expect(events.filter((e) => e.type === "Dialogue")).toHaveLength(
      event.lines.length,
    );
    expect(s.flags[event.flag]).toBe(true);
    if (s.pendingChoices.length) {
      const chosen = s.pendingChoices[0]!;
      dispatch(s, { type: "choice", flag: chosen });
      expect(s.flags[chosen]).toBe(true);
    }
    expect(dispatch(s, { type: "story", id: event.id })[0]?.type).toBe(
      "Blocked",
    );
  }
});
it("gates married memories on the spouse and time together", () => {
  expect(marriageEvents.length).toBeGreaterThanOrEqual(20);
  for (const event of marriageEvents) {
    const s = createGame();
    s.day = 257;
    s.flags.wren_returned = true;
    s.friendship[event.npc] = 1000;
    s.player.map = event.location;
    expect(dispatch(s, { type: "story", id: event.id })[0]?.type).toBe(
      "Blocked",
    );
    s.relationships.spouse = event.npc;
    s.relationships.marriedDay = 0;
    s.day = 120;
    expect(
      dispatch(s, { type: "story", id: event.id }).some(
        (e) => e.type === "Dialogue",
      ),
    ).toBe(true);
    expect(s.flags[event.flag]).toBe(true);
  }
});
