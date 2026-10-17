import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

const screenshotDirectory = join(process.cwd(), "test-results", "ui-audit");

test("loads and displays a machine with active cutting bars", async ({ page }) => {
  await mkdir(screenshotDirectory, { recursive: true });
  await loginAsAdmin(page);

  const listResponse = await page.request.get("http://localhost:4000/machines");
  expect(listResponse.status()).toBe(200);
  const machines = (await listResponse.json()) as {
    machines: Array<{ id: string; name: string; assignedBarCount: number }>;
  };
  const target = machines.machines.find((machine) => machine.assignedBarCount > 0);
  expect(target, "The local dataset includes a machine with assigned bars").toBeDefined();

  const detailResponse = await page.request.get(`http://localhost:4000/machines/${target!.id}`);
  expect(detailResponse.status(), await detailResponse.text()).toBe(200);
  const detail = (await detailResponse.json()) as { machine: { cuttingBars: unknown[] } };
  expect(detail.machine.cuttingBars.length).toBeGreaterThan(0);

  await page.goto(`/machines/${target!.id}`);
  await expect(page.getByRole("heading", { name: target!.name, level: 1 })).toBeVisible();
  await expect(page.getByText("Aucune barre associée")).toHaveCount(0);
  await page.screenshot({ path: join(screenshotDirectory, "machine-detail-1440.png"), fullPage: true });

  await page.setViewportSize({ width: 390, height: 844 });
  const documentWidth = await page.evaluate(() =>
    Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
  );
  expect(documentWidth).toBeLessThanOrEqual(390);
  await page.screenshot({ path: join(screenshotDirectory, "machine-detail-390.png") });
});
