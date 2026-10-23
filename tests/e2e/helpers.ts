import { expect, type Page } from "@playwright/test";
import type { Command, GameState } from "../../src/state/game";
import { exportSave } from "../../src/persistence";
export interface TestHook {
  getState(): GameState;
  command(command: Command): void;
  open(panel: string): void;
  save(slot: 0 | 1 | 2 | 3): Promise<void>;
  load(slot: 0 | 1 | 2 | 3): Promise<void>;
}
declare global {
  interface Window {
    __willowmere?: TestHook;
  }
}
export async function startFarm(page: Page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Begin your story", exact: true })
    .click();
  await page.getByLabel("Your name", { exact: true }).fill("Fern");
  await page.getByLabel("Farm name", { exact: true }).fill("Dewdrop");
  await page.getByLabel("Pet name", { exact: true }).fill("Button");
  // Keep weather and debris reproducible while exercising the real creation form.
  await page
    .locator('input[name="seed"]')
    .evaluate((input: HTMLInputElement) => {
      input.value = "1739";
    });
  await page.getByRole("button", { name: "Make a home", exact: true }).click();
  for (let count = 0; count < 12; count++) {
    const enter = page.getByRole("button", {
      name: "Step into Willowmere",
      exact: true,
    });
    if (await enter.isVisible()) {
      await enter.click();
      break;
    }
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Continue", exact: true })
      .click();
  }
  await expect(page.getByTestId("game")).toBeVisible();
  await expect(
    page.locator('canvas[aria-label="Willowmere Acres pixel world"]'),
  ).toBeVisible();
}
export async function state(page: Page): Promise<GameState> {
  return page.evaluate(() => {
    if (!window.__willowmere)
      throw new Error("Development test bridge unavailable");
    return window.__willowmere.getState();
  });
}
export async function setup(page: Page, command: Command) {
  if (command.type === "teleport") {
    const { maps } = await worldCatalog(page);
    const current = (await state(page)).player.map;
    const queue: string[][] = [[current]];
    const visited = new Set([current]);
    let route: string[] | undefined;
    while (queue.length) {
      const path = queue.shift()!;
      const last = path[path.length - 1]!;
      if (last === command.map) {
        route = path;
        break;
      }
      for (const next of maps.find((map) => map.id === last)?.connections ??
        []) {
        if (!visited.has(next)) {
          visited.add(next);
          queue.push([...path, next]);
        }
      }
    }
    if (!route)
      throw new Error(`No connected route from ${current} to ${command.map}`);
    for (const map of route.slice(1, -1)) {
      await page.evaluate(
        (map) => window.__willowmere!.command({ type: "teleport", map }),
        map,
      );
      expect((await state(page)).player.map).toBe(map);
    }
  }
  await page.evaluate((command) => {
    if (!window.__willowmere)
      throw new Error("Development test bridge unavailable");
    window.__willowmere.command(command);
  }, command);
  if (command.type === "teleport")
    expect((await state(page)).player.map).toBe(command.map);
}
export async function open(page: Page, panel: string) {
  await page.evaluate((panel) => {
    if (!window.__willowmere)
      throw new Error("Development test bridge unavailable");
    window.__willowmere.open(panel);
  }, panel);
}
export async function sleep(page: Page) {
  await open(page, "sleep");
  await page
    .getByRole("button", { name: "Sleep until morning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Greet the morning", exact: true })
    .click();
}
export async function tool(page: Page, name: string) {
  const ids: Record<string, string> = {
    Hoe: "hoe",
    "Watering can": "can",
    Sickle: "sickle",
    Axe: "axe",
    Hammer: "hammer",
    "Fishing rod": "rod",
    "Sow seeds": "seeds",
    Gather: "hand",
  };
  await page.locator(`[data-action="equip"][data-tool="${ids[name]}"]`).click();
  await page.keyboard.press("z", { delay: 100 });
}

export async function importFixture(page: Page, fixture: GameState) {
  await open(page, "menu");
  await page.locator("#save-file").setInputFiles({
    name: "story-fixture.json",
    mimeType: "application/json",
    buffer: Buffer.from(exportSave(fixture)),
  });
  await expect.poll(async () => (await state(page)).seed).toBe(fixture.seed);
  await expect(page.locator('canvas[data-ready="true"]')).toBeVisible();
}

export async function worldCatalog(page: Page) {
  return page.evaluate(async () => {
    const path = "/src/data/catalog.ts";
    const catalog = (await import(
      path
    )) as typeof import("../../src/data/catalog");
    return { maps: catalog.maps, npcs: catalog.npcs };
  });
}
