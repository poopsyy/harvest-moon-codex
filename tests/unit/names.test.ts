import { describe, it, expect } from "vitest";
import { safeAnimalName } from "../../src/core/names";
describe("animal names", () => {
  it("preserves benign names while rejecting obscured profanity", () => {
    expect(safeAnimalName("Buttercup")).toBe("Buttercup");
    expect(safeAnimalName(" F.u.c.k ")).toBe("Clover");
    expect(safeAnimalName("Sh!t")).toBe("Clover");
    expect(safeAnimalName("123")).toBe("Clover");
    expect(safeAnimalName("An Extremely Long Animal Name")).toHaveLength(16);
  });
});
