import { describe, expect, it } from "vitest";
import { fishingPosition, type FishBehavior } from "../../src/ui/minigames";
const behaviors: FishBehavior[] = ["calm", "darting", "sinker", "leaper"];
describe("fishing behavior profiles", () => {
  it("keeps every fish reachable at each accessibility difficulty", () => {
    for (const behavior of behaviors)
      for (const difficulty of [0, 0.5, 1, 1.5, 2, 3])
        for (let step = 0; step < 260; step++) {
          const position = fishingPosition(behavior, step / 10, difficulty);
          expect(position).toBeGreaterThanOrEqual(0.08);
          expect(position).toBeLessThanOrEqual(0.92);
        }
  });
  it("provides four distinct deterministic movement paths", () => {
    const paths = behaviors.map((behavior) =>
      Array.from({ length: 80 }, (_, i) => fishingPosition(behavior, i / 5, 1)),
    );
    expect(new Set(paths.map((path) => JSON.stringify(path))).size).toBe(4);
    for (const behavior of behaviors)
      expect(fishingPosition(behavior, 7.4, 1)).toBe(
        fishingPosition(behavior, 7.4, 1),
      );
  });
  it("slows the same path at reduced difficulty without changing its shape", () => {
    for (const behavior of behaviors)
      for (let second = 0; second < 20; second++)
        expect(fishingPosition(behavior, second * 2, 0.5)).toBeCloseTo(
          fishingPosition(behavior, second, 1),
          10,
        );
  });
});
