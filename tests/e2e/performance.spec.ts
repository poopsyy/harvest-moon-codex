import { test, expect } from "@playwright/test";
import { startFarm, open, importFixture, state, worldCatalog } from "./helpers";
import { createGame } from "../../src/state/game";
import { layoutFor, isBlocked } from "../../src/core/world-layout";

test("records rendered frame timing and retained heap over sixty days", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "Chrome DevTools exposes comparable forced-GC heap metrics.",
  );
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const began = Date.now();
  await startFarm(page);
  const worldReadyMs = Date.now() - began;
  const fixture = createGame({ name: "Fern", seed: 9001 });
  fixture.day = 60;
  fixture.minute = 600;
  fixture.flags.wren_returned = true;
  fixture.flags.halverd_resigned = true;
  fixture.player.x = 40;
  fixture.player.y = 40;
  fixture.weather = "rain";
  fixture.forecast = "rain";
  fixture.debris = {};
  const { maps } = await worldCatalog(page);
  const farm = maps.find((map) => map.id === "farm")!;
  const layout = layoutFor(
    farm.id,
    farm.width,
    farm.height,
    false,
    farm.connections,
  );
  for (let y = 20; y < 50; y++)
    for (let x = 20; x < 60; x++) {
      if (isBlocked("farm", x, y, layout)) continue;
      fixture.plots[`${x},${y}`] = {
        x,
        y,
        tilled: true,
        watered: true,
        fertilizer: 2,
        crop: "turnip",
        growth: 3,
        quality: 2,
        withered: false,
        dryDays: 0,
        streak: 3,
      };
    }
  fixture.flags.evaluated = true;
  await importFixture(page, fixture);
  const stress = await state(page);
  const cropTiles = Object.keys(stress.plots).length;
  const scheduledVillagers = await page.evaluate(async () => {
    const enginePath = "/src/systems/engine.ts",
      catalogPath = "/src/data/catalog.ts";
    const engine = (await import(
      enginePath
    )) as typeof import("../../src/systems/engine");
    const { npcs } = (await import(
      catalogPath
    )) as typeof import("../../src/data/catalog");
    return npcs.filter((npc) =>
      Boolean(engine.resolveSchedule(window.__willowmere!.getState(), npc.id)),
    ).length;
  });
  expect(cropTiles).toBeGreaterThan(1000);
  expect(scheduledVillagers).toBeGreaterThanOrEqual(20);
  expect(stress.weather).toBe("rain");
  await page.waitForTimeout(1500);
  const frames = await page.evaluate(
    () =>
      new Promise<number[]>((resolve) => {
        const intervals: number[] = [];
        let last = performance.now();
        const frame = (now: number) => {
          intervals.push(now - last);
          last = now;
          if (intervals.length >= 120) resolve(intervals);
          else requestAnimationFrame(frame);
        };
        requestAnimationFrame(frame);
      }),
  );
  const cdp = await page.context().newCDPSession(page);
  await open(page, "inventory");
  // Warm up daily effects, autosave, modal rendering and caches before the baseline.
  await page.evaluate(async () => {
    for (let day = 0; day < 5; day++) {
      window.__willowmere!.command({ type: "sleep" });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
  // A manual save queues behind autosaves, so the heap excludes unfinished writes.
  await page.evaluate(async () => window.__willowmere!.save(3));
  await cdp.send("HeapProfiler.collectGarbage");
  const before = await cdp.send("Runtime.getHeapUsage");
  await page.evaluate(async () => {
    for (let day = 0; day < 60; day++) {
      window.__willowmere!.command({ type: "sleep" });
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
  });
  await page.waitForTimeout(1000);
  // A manual save queues behind autosaves, so the heap excludes unfinished writes.
  await page.evaluate(async () => window.__willowmere!.save(3));
  await cdp.send("HeapProfiler.collectGarbage");
  const after = await cdp.send("Runtime.getHeapUsage");
  const sorted = [...frames].sort((a, b) => a - b);
  const metrics = {
    worldReadyMs,
    cropTiles,
    scheduledVillagers,
    weather: "rain",
    frameMeanMs: frames.reduce((sum, n) => sum + n, 0) / frames.length,
    frameP95Ms: sorted[Math.floor(sorted.length * 0.95)],
    heapBefore: before.usedSize,
    heapAfter: after.usedSize,
    retainedGrowthRatio: (after.usedSize - before.usedSize) / before.usedSize,
    days: 60,
    environment:
      "headless Chromium; CPU/network unthrottled; full field + rain; all NPC schedules simulated, only local villagers rendered; no physical-phone claim",
  };
  await testInfo.attach("performance.json", {
    body: JSON.stringify(metrics, null, 2),
    contentType: "application/json",
  });
  expect(errors).toEqual([]);
  expect(metrics.retainedGrowthRatio).toBeLessThanOrEqual(0.1);
});
