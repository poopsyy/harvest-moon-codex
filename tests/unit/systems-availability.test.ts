import { it, expect } from "vitest";
import { createGame } from "../../src/state/game";
import {
  npcAvailable,
  resolveSchedule,
  dispatch,
} from "../../src/systems/engine";
it("respects returning villagers and seasonal merchant visits", () => {
  const s = createGame();
  expect(npcAvailable(s, "june")).toBe(false);
  expect(npcAvailable(s, "wren")).toBe(false);
  expect(resolveSchedule(s, "ozzie")).toBe(null);
  s.day = 4;
  expect(npcAvailable(s, "ozzie")).toBe(true);
  s.day = 5;
  expect(npcAvailable(s, "ozzie")).toBe(true);
  s.day = 6;
  expect(npcAvailable(s, "ozzie")).toBe(false);
  for (const day of [17, 44, 71]) {
    s.day = day;
    expect(npcAvailable(s, "halverd")).toBe(true);
  }
  s.day = 90;
  expect(npcAvailable(s, "halverd")).toBe(false);
  expect(npcAvailable(s, "june")).toBe(true);
  s.flags.halverd_resigned = true;
  s.flags.wren_returned = true;
  expect(npcAvailable(s, "halverd")).toBe(true);
  expect(npcAvailable(s, "wren")).toBe(true);
});
it("opens village interiors at eight and closes new entry at eighteen", () => {
  const s = createGame();
  s.player.map = "square";
  expect(dispatch(s, { type: "teleport", map: "townhall" })[0]?.type).toBe(
    "Blocked",
  );
  dispatch(s, { type: "wait", minutes: 120 });
  dispatch(s, { type: "teleport", map: "townhall" });
  expect(s.player.map).toBe("townhall");
  s.player.map = "square";
  s.minute = 1080;
  expect(dispatch(s, { type: "teleport", map: "townhall" })[0]?.type).toBe(
    "Blocked",
  );
});
