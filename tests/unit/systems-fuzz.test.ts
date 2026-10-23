import { it, expect } from "vitest";
import { createGame, type Command } from "../../src/state/game";
import { dispatch } from "../../src/systems/engine";
import { random, hash } from "../../src/core/rng";
import { npcs, items } from "../../src/data/catalog";
it("preserves invariants and serialized determinism over 200,000 commands", () => {
  for (let seed = 1; seed <= 20; seed++) {
    const s = createGame({ seed }),
      rng = { rng: seed },
      replay = createGame({ seed });
    let day = 0;
    for (let i = 0; i < 10000; i++) {
      const item = items[Math.floor(random(rng) * items.length)]!.id,
        npc = npcs[Math.floor(random(rng) * npcs.length)]!.id;
      const choices: Command[] = [
        {
          type: "move",
          dx: Math.floor(random(rng) * 3) - 1,
          dy: Math.floor(random(rng) * 3) - 1,
        },
        { type: "sleep" },
        { type: "buy", item, quantity: 1 },
        { type: "ship", item, quantity: 1 },
        { type: "sell", item, quantity: 1 },
        { type: "eat", item },
        { type: "talk", npc },
        { type: "gift", npc, item },
        { type: "water", x: 12, y: 12 },
        { type: "harvest", x: 12, y: 12 },
        { type: "plant", crop: "turnip", x: 12, y: 12 },
        { type: "use", x: 12, y: 12 },
        { type: "fish", location: "riverside", skill: 0.7 },
        { type: "mine", action: "enter" },
        { type: "mine", action: "break" },
        { type: "mine", action: "descend" },
        { type: "forage" },
        { type: "festival", score: 70 },
        { type: "story", id: "spring" },
        { type: "refill" },
      ];
      const c = choices[Math.floor(random(rng) * choices.length)]!;
      dispatch(s, c);
      dispatch(replay, c);
      if (
        !Number.isFinite(s.money) ||
        s.money < 0 ||
        s.stamina < 0 ||
        s.day < day ||
        s.inventory.some((i) => i.quantity <= 0 || !Number.isFinite(i.quantity))
      )
        throw new Error(`Invariant at ${seed}:${i}`);
      day = s.day;
      if (i % 1000 === 0) {
        expect(JSON.parse(JSON.stringify(s))).toEqual(s);
        expect(hash(replay)).toBe(hash(s));
      }
    }
    expect(hash(replay)).toBe(hash(s));
  }
}, 120000);
