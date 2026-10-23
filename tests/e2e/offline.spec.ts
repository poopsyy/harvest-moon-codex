import { test, expect } from "@playwright/test";
import { startFarm } from "./helpers";

test("production app precaches, reloads offline, and plays a day", async ({
  page,
  context,
}) => {
  await startFarm(page);
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.ready).active),
  );
  await page.reload();
  await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
  await expect(
    page.getByRole("button", { name: "Begin your story", exact: true }),
  ).toBeVisible();
  await context.setOffline(true);
  await startFarm(page);
  await expect(page.locator("canvas")).toBeVisible();
  // Use the real bed UI; production never exposes the development command bridge.
  await page.getByRole("button", { name: "Valley map", exact: true }).click();
  await page.locator('[data-action="travel"][data-map="farmhouse"]').click();
  await page.getByRole("button", { name: "Menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Sleep until morning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Sleep until morning", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Greet the morning", exact: true })
    .click();
  await expect(page.getByTestId("hud-day")).toContainText("2");
  expect(await page.evaluate(() => typeof window.__willowmere)).toBe(
    "undefined",
  );
});

test("production title meets initial and cached load budgets", async ({
  page,
}, testInfo) => {
  await page.addInitScript(() => {
    const observer = new MutationObserver(() => {
      if (!document.querySelector('button[data-action="new"]')) return;
      observer.disconnect();
      requestAnimationFrame(() =>
        requestAnimationFrame(() => performance.mark("willowmere-title-ready")),
      );
    });
    observer.observe(document, { childList: true, subtree: true });
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Begin your story", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(
    () => performance.getEntriesByName("willowmere-title-ready").length > 0,
  );
  const firstTitleMs = await page.evaluate(
    () => performance.getEntriesByName("willowmere-title-ready")[0]!.startTime,
  );
  await page.waitForFunction(async () =>
    Boolean((await navigator.serviceWorker.ready).active),
  );
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Begin your story", exact: true }),
  ).toBeVisible();
  await page.waitForFunction(
    () => performance.getEntriesByName("willowmere-title-ready").length > 0,
  );
  const repeatTitleMs = await page.evaluate(
    () => performance.getEntriesByName("willowmere-title-ready")[0]!.startTime,
  );
  const manifestURL = await page
    .locator('link[rel="manifest"]')
    .getAttribute("href");
  expect(manifestURL).toBeTruthy();
  const manifest = (await (await page.request.get(manifestURL!)).json()) as {
    name: string;
    display: string;
    icons: { src: string; sizes: string }[];
  };
  expect(manifest.name).toBe("Willowmere Acres");
  expect(manifest.display).toBe("standalone");
  expect(manifest.icons.some((icon) => icon.sizes === "192x192")).toBe(true);
  expect(manifest.icons.some((icon) => icon.sizes === "512x512")).toBe(true);
  for (const icon of manifest.icons)
    expect((await page.request.get(icon.src)).ok()).toBe(true);
  await testInfo.attach("title-load.json", {
    body: JSON.stringify(
      {
        firstTitleMs,
        repeatTitleMs,
        environment:
          "production preview; headless Chromium; unthrottled localhost; browser navigation to two animation frames after title DOM",
      },
      null,
      2,
    ),
    contentType: "application/json",
  });
  expect(firstTitleMs).toBeLessThan(4000);
  expect(repeatTitleMs).toBeLessThan(1500);
});
