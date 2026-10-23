import { it, expect } from "vitest";
import { createGame } from "../../src/state/game";
import {
  eventMatches,
  runEvent,
  type ScriptEvent,
} from "../../src/systems/events";
it("evaluates compound story triggers and executes authored script commands", () => {
  const s = createGame();
  const condition = {
    map: "farm",
    startMinute: 360,
    endMinute: 800,
    flags: ["intro"],
    absentFlags: ["finished"],
    friendship: { npc: "bram", points: 20 },
    day: 2,
  };
  expect(eventMatches(s, condition)).toBe(false);
  s.day = 2;
  s.friendship.bram = 20;
  expect(eventMatches(s, condition)).toBe(true);
  const event: ScriptEvent = {
    id: "test",
    conditions: condition,
    repeat: true,
    steps: [
      { type: "dialogue", speaker: "bram", text: "Hello {player}." },
      { type: "flag", flag: "repaired", value: true },
      { type: "give", item: "wood", quantity: 2 },
      { type: "take", item: "wood", quantity: 1 },
      { type: "friendship", npc: "bram", points: 40 },
      { type: "warp", map: "square", x: 4, y: 5 },
      {
        type: "choice",
        choices: [{ label: "Help together", flag: "together" }],
      },
      { type: "music", value: "heart" },
      { type: "wait", value: 20 },
    ],
  };
  expect(runEvent(s, event, true)).toEqual([]);
  expect(runEvent(s, event).length).toBe(5);
  expect(s.flags.repaired).toBe(true);
  expect(s.friendship.bram).toBe(60);
  expect(s.inventory.find((i) => i.id === "wood")?.quantity).toBe(1);
  expect(s.pendingChoices).toEqual(["together"]);
  expect(runEvent(s, event)).toEqual([]);
  s.player.map = "farm";
  expect(runEvent(s, event, true).some((e) => e.type === "Dialogue")).toBe(
    false,
  );
  event.repeat = false;
  expect(runEvent(s, event)).toEqual([]);
});
