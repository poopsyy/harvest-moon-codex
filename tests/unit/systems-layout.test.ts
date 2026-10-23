import { it, expect } from "vitest";
import { maps } from "../../src/data/catalog";
import { layoutFor, isBlocked, groundAt } from "../../src/core/world-layout";
it("builds navigable indoor and outdoor maps with shared collision and warp targets", () => {
  for (const map of maps) {
    const layout = layoutFor(
      map.id,
      map.width,
      map.height,
      map.kind === "indoor",
      map.connections,
    );
    let open = 0,
      blocked = 0;
    for (let y = 0; y < map.height; y++)
      for (let x = 0; x < map.width; x++) {
        expect(groundAt(map.id, x, y, layout)).toBeTruthy();
        if (isBlocked(map.id, x, y, layout)) blocked++;
        else open++;
      }
    expect(open).toBeGreaterThan(10);
    expect(blocked).toBeGreaterThan(0);
    expect(layout.exits.length).toBeGreaterThan(0);
  }
});

it("matches upgraded house and greenhouse collision footprints", () => {
  const layout = layoutFor("farm", 80, 64, false, ["square"], {
    house: 3,
    house_3: 1,
    greenhouse: 1,
  });
  expect(layout.landmarks.some((l) => l.frame === "building_house_3")).toBe(
    true,
  );
  expect(isBlocked("farm", 22, 19, layout)).toBe(true);
  expect(groundAt("farm", 22, 19, layout)).toBeTruthy();
});
