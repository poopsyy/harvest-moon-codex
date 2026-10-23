import { test, expect, type Page } from "@playwright/test";
import { createGame } from "../../src/state/game";
import { readFileSync } from "node:fs";
const { heartEvents, arcEvents, arcs, bloom, vote, weddings } = JSON.parse(
  readFileSync(
    new URL("../../src/data/strings/en.json", import.meta.url),
    "utf8",
  ),
).narrative as Pick<
  typeof import("../../src/data/narrative"),
  "heartEvents" | "arcEvents" | "arcs" | "bloom" | "vote" | "weddings"
>;
import { startFarm, open, setup, state, sleep, importFixture } from "./helpers";

async function instantDialogue(page: Page) {
  await open(page, "options");
  await page.locator('[data-action="tab"][data-tab="gameplay"]').click();
  await page.locator('input[data-setting="textSpeed"]').fill("0");
  await page.locator('input[data-setting="textSpeed"]').dispatchEvent("input");
  await page.keyboard.press("Escape");
}
async function finishScene(page: Page, lines: string[]) {
  for (const line of lines) {
    await expect(page.locator("#dialogue-text")).toHaveText(
      line.replaceAll("{player}", "Fern"),
    );
    await page.locator('[data-action="dialogueNext"]').click();
  }
}

test("the four illustrated introduction pages load and tell Wren’s invitation", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Begin your story", exact: true })
    .click();
  await page.getByRole("button", { name: "Make a home", exact: true }).click();
  for (const [index, scene] of [
    "city",
    "letter",
    "arrival",
    "farm",
  ].entries()) {
    const art = page.locator(".intro-art");
    await expect(art).toHaveAttribute("src", `/assets/intro_${scene}.png`);
    await expect
      .poll(() =>
        art.evaluate(
          (img: HTMLImageElement) => img.complete && img.naturalWidth > 0,
        ),
      )
      .toBe(true);
    expect(await art.getAttribute("alt")).toBeTruthy();
    if (scene === "letter")
      await expect(page.getByRole("dialog")).toContainText("Wren");
    await page
      .getByRole("dialog")
      .getByRole("button", {
        name: index < 3 ? "Continue" : "Step into Willowmere",
        exact: true,
      })
      .click();
  }
  await expect(page.locator('canvas[data-ready="true"]')).toBeVisible();
});

test("Journal Memories presents a heart scene and records its outcome", async ({
  page,
}) => {
  await startFarm(page);
  await instantDialogue(page);
  const scene =
    heartEvents.find((event) => event.choices?.length) ?? heartEvents[0]!;
  await setup(page, {
    type: "debug",
    action: "friendship",
    id: scene.npc,
    value: scene.hearts * 100,
  });
  await setup(page, { type: "debug", action: "minute", value: 600 });
  await setup(page, { type: "teleport", map: scene.location });
  await open(page, "journal");
  await page.locator('[data-action="tab"][data-tab="memories"]').click();
  await page.locator(`[data-action="story"][data-id="${scene.id}"]`).click();
  for (const [index, line] of scene.lines.entries()) {
    await expect(page.locator("#dialogue-text")).toHaveText(
      line.replaceAll("{player}", "Fern"),
    );
    if (index === scene.lines.length - 1 && scene.choices?.length) {
      const choice = scene.choices[0]!;
      await page
        .getByRole("button", { name: choice.label, exact: true })
        .click();
      expect((await state(page)).flags[choice.flag]).toBe(true);
    } else await page.locator('[data-action="dialogueNext"]').click();
  }
  expect((await state(page)).flags[scene.flag]).toBe(true);
  await open(page, "journal");
  await page.locator('[data-action="tab"][data-tab="memories"]').click();
  await expect(
    page.locator(`[data-action="story"][data-id="${scene.id}"]`),
  ).toHaveCount(0);
});

test("morning wedding, bloom and council scenes acknowledge in order and persist", async ({
  page,
}) => {
  test.setTimeout(120000);
  await startFarm(page);
  await instantDialogue(page);
  const fixture = createGame({ name: "Fern", seed: 2001 });
  fixture.day = 266;
  fixture.relationships.dating = "ivy";
  fixture.relationships.weddingDay = 267;
  fixture.friendship.ivy = 1000;
  fixture.flags.bloom = true;
  await importFixture(page, fixture);
  await sleep(page);
  expect((await state(page)).relationships.spouse).toBe("ivy");
  expect((await state(page)).flags.wedding_seen).not.toBe(true);
  await finishScene(page, weddings.ivy!);
  await expect
    .poll(async () => (await state(page)).flags.wedding_seen)
    .toBe(true);
  expect((await state(page)).flags.bloom_seen).not.toBe(true);
  await finishScene(page, bloom.lines);
  await expect
    .poll(async () => (await state(page)).flags.bloom_seen)
    .toBe(true);
  expect((await state(page)).flags.vote_seen).not.toBe(true);
  await finishScene(page, vote.lines);
  await expect.poll(async () => (await state(page)).flags.vote_seen).toBe(true);
  await expect(page.getByRole("dialog")).toContainText(
    "A valley worth keeping",
  );
  await page.evaluate(async () => window.__willowmere!.save(1));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__willowmere)))
    .toBe(true);
  await page.evaluate(async () => window.__willowmere!.load(1));
  const restored = await state(page);
  expect(restored.relationships.spouse).toBe("ivy");
  expect(restored.flags).toMatchObject({
    wedding_seen: true,
    bloom_seen: true,
    vote_seen: true,
  });
  await sleep(page);
  await expect(page.locator("#dialogue-text")).toHaveCount(0);
});

test("a journal arc choice applies its authored consequence", async ({
  page,
}) => {
  await startFarm(page);
  await instantDialogue(page);
  const scene = arcEvents.find((event) => event.id === "marta_inn_4")!;
  const arc = arcs.find((arc) => arc.events.includes(scene.id))!;
  for (const id of arc.events.slice(0, arc.events.indexOf(scene.id)))
    await setup(page, { type: "debug", action: "flag", id });
  await setup(page, {
    type: "debug",
    action: "friendship",
    id: scene.npc,
    value: scene.hearts * 100,
  });
  await setup(page, { type: "debug", action: "minute", value: 600 });
  await setup(page, { type: "teleport", map: scene.location });
  await open(page, "journal");
  await page.locator('[data-action="tab"][data-tab="arcs"]').click();
  await page.locator(`[data-action="story"][data-id="${arc.id}"]`).click();
  for (const [index, line] of scene.lines.entries()) {
    await expect(page.locator("#dialogue-text")).toHaveText(line);
    if (index < scene.lines.length - 1)
      await page.locator('[data-action="dialogueNext"]').click();
  }
  expect((await state(page)).pendingChoices.length).toBeGreaterThan(0);
  await page.evaluate(async () => window.__willowmere!.save(2));
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__willowmere)))
    .toBe(true);
  await page.evaluate(async () => window.__willowmere!.load(2));
  // Resuming a stored choice replays its context before offering the same options.
  for (const [index, line] of scene.lines.entries()) {
    await expect(page.locator("#dialogue-text")).toHaveText(line);
    if (index < scene.lines.length - 1)
      await page.locator('[data-action="dialogueNext"]').click();
  }
  const choice = scene.choices!.find(
    (choice) => choice.flag === "marta_inn_coop",
  )!;
  await page.getByRole("button", { name: choice.label, exact: true }).click();
  expect((await state(page)).flags).toMatchObject({
    marta_inn_coop: true,
    inn_coop: true,
  });
  expect((await state(page)).pendingChoices).toEqual([]);
});

test("deliver boat repair materials through the Journal and unlock the cove", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "debug", action: "item", id: "wood", value: 30 });
  await setup(page, {
    type: "debug",
    action: "item",
    id: "iron_bar",
    value: 2,
  });
  await open(page, "journal");
  await page.locator('[data-action="story"][data-id="boat"]').click();
  await expect
    .poll(async () => (await state(page)).flags.boat_repaired)
    .toBe(true);
  const repaired = await state(page);
  expect(repaired.inventory.some((row) => row.id === "wood")).toBe(false);
  expect(repaired.inventory.some((row) => row.id === "iron_bar")).toBe(false);
  await open(page, "journal");
  await expect(
    page.locator('[data-action="story"][data-id="boat"]'),
  ).toHaveCount(0);
  await setup(page, { type: "teleport", map: "cove" });
  expect((await state(page)).player.map).toBe("cove");
});
