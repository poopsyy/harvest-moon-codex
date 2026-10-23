import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { open, setup, startFarm, state, sleep, tool } from "./helpers";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus && !page.isClosed()) {
    const snapshot = await page
      .evaluate(() => window.__willowmere?.getState())
      .catch(() => undefined);
    if (snapshot)
      await testInfo.attach("farm-state.json", {
        body: JSON.stringify(snapshot, null, 2),
        contentType: "application/json",
      });
  }
});

test("create a named farm and enter the playable world", async ({ page }) => {
  await startFarm(page);
  const farm = await state(page);
  expect(farm.player).toMatchObject({
    name: "Fern",
    farmName: "Dewdrop",
    petName: "Button",
    map: "farm",
  });
  await expect(page.getByTestId("hud-money")).toContainText("500");
  await expect(page.getByTestId("toolbar")).toBeVisible();
  await expect(page.locator("canvas")).toBeVisible();
});

test("keyboard movement changes the world position and menus pause time", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "teleport", map: "farm", x: 10, y: 13 });
  const before = await state(page);
  await page.keyboard.down("ArrowRight");
  await page.waitForTimeout(400);
  await page.keyboard.up("ArrowRight");
  await expect
    .poll(async () => (await state(page)).player.x)
    .toBeGreaterThan(before.player.x);
  await page.keyboard.press("i");
  const paused = await state(page);
  await page.waitForTimeout(1600);
  expect((await state(page)).minute).toBe(paused.minute);
});

test("manual save survives browser reload with all state intact", async ({
  page,
}) => {
  await startFarm(page);
  await open(page, "save");
  const saved = await state(page);
  await page.evaluate(async () => {
    await window.__willowmere!.save(1);
  });
  await page.reload();
  await expect
    .poll(() => page.evaluate(() => Boolean(window.__willowmere)))
    .toBe(true);
  await page.evaluate(async () => {
    await window.__willowmere!.load(1);
    window.__willowmere!.open("save");
  });
  const restored = await state(page);
  expect(restored).toEqual(saved);
  const thumbnail = page.locator(".save-card img").first();
  await expect(thumbnail).toBeVisible();
  expect(
    await thumbnail.evaluate((img: HTMLImageElement) => [
      img.naturalWidth,
      img.naturalHeight,
    ]),
  ).toEqual([160, 120]);
});

test("touch direction controls move the player", async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== "mobile",
    "This scenario verifies the mobile touch viewport.",
  );
  await startFarm(page);
  await setup(page, { type: "teleport", map: "farm", x: 10, y: 13 });
  const before = await state(page);
  const right = page.getByRole("button", { name: "Move right", exact: true });
  await expect(right).toBeVisible();
  await right.tap();
  await expect
    .poll(async () => (await state(page)).player.x)
    .toBeGreaterThan(before.player.x);
});

test("clear, till, sow, water four nights, harvest and ship for morning income", async ({
  page,
}) => {
  await startFarm(page);
  const original = await state(page);
  const weed = Object.entries(original.debris).find(
    ([key, kind]) => key === "9,16" && kind === "weed",
  );
  expect(weed).toBeDefined();
  const [weedX, weedY] = weed![0].split(",").map(Number);
  await setup(page, {
    type: "teleport",
    map: "farm",
    x: weedX!,
    y: weedY! - 1,
  });
  await tool(page, "Sickle");
  await expect
    .poll(async () => (await state(page)).debris[weed![0]])
    .toBeUndefined();
  await setup(page, { type: "teleport", map: "farm", x: 10, y: 13 });
  await tool(page, "Hoe");
  await expect
    .poll(async () => (await state(page)).plots["10,14"]?.tilled)
    .toBe(true);
  await tool(page, "Sow seeds");
  await expect
    .poll(async () => (await state(page)).plots["10,14"]?.crop)
    .toBe("turnip");
  for (let day = 0; day < 4; day++) {
    await tool(page, "Watering can");
    await expect
      .poll(async () => (await state(page)).plots["10,14"]?.watered)
      .toBe(true);
    await sleep(page);
  }
  expect((await state(page)).plots["10,14"]?.growth).toBeGreaterThanOrEqual(4);
  await tool(page, "Gather");
  await expect
    .poll(async () =>
      (await state(page)).inventory.some((item) => item.id === "turnip"),
    )
    .toBe(true);
  await open(page, "inventory");
  await page
    .getByRole("button", { name: "Ship all produce", exact: true })
    .click();
  expect(
    (await state(page)).shipping.some((item) => item.id === "turnip"),
  ).toBe(true);
  const money = (await state(page)).money;
  await sleep(page);
  expect((await state(page)).money).toBeGreaterThan(money);
  expect((await state(page)).lastSummary.earned).toBeGreaterThanOrEqual(60);
});

test("buy seasonal seeds through the shop and pay the displayed price", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "debug", action: "minute", value: 600 });
  await setup(page, { type: "teleport", map: "store" });
  await open(page, "shop");
  await page.locator("#buy-quantity").fill("2");
  await page.locator('[data-action="buy"][data-item="turnip_seed"]').click();
  expect((await state(page)).money).toBe(260);
  expect(
    (await state(page)).inventory.find((row) => row.id === "turnip_seed")
      ?.quantity,
  ).toBe(5);
});

test("build a coop, buy a chicken and collect its egg the next morning", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "debug", action: "money", value: 10000 });
  await setup(page, { type: "debug", action: "item", id: "wood", value: 80 });
  await setup(page, { type: "debug", action: "item", id: "stone", value: 30 });
  await open(page, "craft");
  await page.locator('[data-action="build"][data-id="coop"]').click();
  expect((await state(page)).construction.coop).toBeDefined();
  for (let day = 0; day < 3; day++) await sleep(page);
  expect((await state(page)).buildings.coop).toBe(1);
  await open(page, "animals");
  await page.locator("#animal-name").fill("Pudding");
  await page.locator('[data-action="buyAnimal"][data-kind="chicken"]').click();
  expect((await state(page)).animals[0]?.name).toBe("Pudding");
  await sleep(page);
  await open(page, "animals");
  await page
    .getByRole("button", { name: "Collect produce", exact: true })
    .click();
  expect((await state(page)).inventory.some((row) => row.id === "egg")).toBe(
    true,
  );
  expect((await state(page)).animals[0]?.product).toBe(false);
});

test("enter the mine, discover three ladders and return to daylight", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "teleport", map: "mountain" });
  await open(page, "map");
  await page.locator('[data-action="travel"][data-map="mine"]').click();
  for (let floor = 1; floor <= 3; floor++) {
    for (let rock = 0; rock < 14; rock++) {
      if ((await state(page)).mine.ladder) break;
      await page
        .getByRole("button", { name: "Break a rock", exact: true })
        .click();
    }
    expect((await state(page)).mine.ladder).toBe(true);
    await page
      .getByRole("button", { name: "Follow the ladder", exact: true })
      .click();
    expect((await state(page)).mine.floor).toBe(floor + 1);
  }
  await page
    .getByRole("button", { name: "Return to daylight", exact: true })
    .click();
  expect((await state(page)).player.map).toBe("mountain");
  expect((await state(page)).mine.floor).toBe(0);
});

test("talk to a neighbor and offer a loved gift to grow friendship", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "debug", action: "item", id: "wood", value: 1 });
  await setup(page, { type: "debug", action: "minute", value: 600 });
  await setup(page, { type: "teleport", map: "workshop" });
  await open(page, "people");
  await page.locator('[data-action="talk"][data-npc="bram"]').click();
  expect((await state(page)).friendship.bram).toBe(10);
  await open(page, "people");
  await page.locator('[data-action="giftChoose"][data-npc="bram"]').click();
  await page.locator('[data-action="give"][data-item="wood"]').click();
  expect((await state(page)).friendship.bram).toBeGreaterThan(10);
  expect((await state(page)).inventory.some((row) => row.id === "wood")).toBe(
    false,
  );
});

test("join the Seedling Parade and complete its flower arrangement", async ({
  page,
}) => {
  await startFarm(page);
  await setup(page, { type: "debug", action: "day", value: 7 });
  await setup(page, { type: "teleport", map: "square" });
  await open(page, "festival");
  for (const value of [0, 1, 2, 2, 1, 0])
    await page
      .locator(`[data-action="mg-pick"][data-value="${value}"]`)
      .click();
  await page
    .getByRole("button", { name: "Share the celebration", exact: true })
    .click();
  expect((await state(page)).stats.festivals).toBe(1);
  expect((await state(page)).flags.festival_7).toBe(true);
});

test("header navigation is reachable without overlapping panels", async ({
  page,
}) => {
  await startFarm(page);
  await page.getByRole("button", { name: "Valley map", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("The Willowmere valley");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("A quiet moment");
});

test("JSON export restores a farm and rejects a damaged backup", async ({
  page,
}) => {
  await startFarm(page);
  await open(page, "menu");
  const original = await state(page);
  const downloading = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Export a backup", exact: true })
    .click();
  const download = await downloading;
  const file = await download.path();
  expect(file).toBeTruthy();
  const json = await readFile(file!, "utf8");
  await setup(page, { type: "debug", action: "money", value: 12345 });
  await page.locator("#save-file").setInputFiles({
    name: "farm.json",
    mimeType: "application/json",
    buffer: Buffer.from(json),
  });
  await expect.poll(async () => (await state(page)).money).toBe(original.money);
  await expect(page.locator('canvas[data-ready="true"]')).toBeVisible();
  await open(page, "menu");
  const restored = await state(page);
  expect(restored).toEqual(original);
  await page.locator("#save-file").setInputFiles({
    name: "damaged.json",
    mimeType: "application/json",
    buffer: Buffer.from(json.replace("Fern", "Spoiled")),
  });
  await expect(page.getByRole("status")).toContainText(
    "That save could not be read",
  );
  expect(await state(page)).toEqual(restored);
});
