import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

type OfferList = { offers: Array<{ id: string; status: string }> };

const screenshotDirectory = join(process.cwd(), "test-results", "ui-audit");

async function firstOpenOffer(page: Page): Promise<string> {
  const response = await page.request.get("http://localhost:4000/offers");
  expect(response.status()).toBe(200);
  const { offers } = (await response.json()) as OfferList;
  const offer = offers.find((item) => item.status !== "ARCHIVED");
  expect(offer, "A non-archived Offer is available for a read-only walkthrough").toBeDefined();
  return offer!.id;
}

test("captures every manager route in the persisted Offer workspace", async ({ page }) => {
  test.setTimeout(120_000);
  await mkdir(screenshotDirectory, { recursive: true });
  const apiFailures: string[] = [];
  page.on("response", (response) => {
    if (response.url().startsWith("http://localhost:4000/") && response.status() >= 500) {
      apiFailures.push(`${response.status()} ${new URL(response.url()).pathname}`);
    }
  });
  await loginAsAdmin(page);
  const offerId = await firstOpenOffer(page);
  const routeSpecs = [
    { path: "", activeTab: "Vue générale", screenshot: "offer-overview-1440.png" },
    { path: "/pieces", activeTab: "Pièces", screenshot: "offer-pieces-1440.png" },
    { path: "/pieces/import", activeTab: "Pièces", screenshot: "offer-import-1440.png" },
    { path: "/faconnage", activeTab: "Façonnage", screenshot: "offer-faconnage-1440.png" },
    { path: "/bars", activeTab: "Barres", screenshot: "offer-bars-1440.png" },
    {
      path: "/bar-assignments",
      activeTab: "Affectations",
      screenshot: "offer-assignments-1440.png",
    },
    { path: "/production", activeTab: "Production", screenshot: "offer-production-1440.png" },
    { path: "/quality", activeTab: "Qualité", screenshot: "offer-quality-1440.png" },
    { path: "/history", activeTab: "Historique", screenshot: "offer-history-1440.png" },
  ];

  for (const route of routeSpecs) {
    const response = await page.goto(`/offers/${offerId}${route.path}`, {
      waitUntil: "domcontentloaded",
    });
    expect(response?.status(), `${route.path || "/"} should render`).toBe(200);
    const offerNav = page.getByRole("navigation", { name: "Navigation de l’offre" });
    await expect(offerNav).toBeVisible();
    await expect(
      offerNav.getByRole("link", { name: route.activeTab, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await page.waitForLoadState("networkidle", { timeout: 8_000 }).catch(() => undefined);
    await page.screenshot({ path: join(screenshotDirectory, route.screenshot) });
  }

  expect(apiFailures).toEqual([]);
});

test("keeps Offer workspaces usable at phone width", async ({ page }) => {
  test.setTimeout(90_000);
  await mkdir(screenshotDirectory, { recursive: true });
  await loginAsAdmin(page);
  const offerId = await firstOpenOffer(page);
  await page.setViewportSize({ width: 390, height: 844 });

  for (const route of [
    { path: "/pieces", tab: "Pièces", screenshot: "offer-pieces-390.png" },
    { path: "/faconnage", tab: "Façonnage", screenshot: "offer-faconnage-390.png" },
    { path: "/bar-assignments", tab: "Affectations", screenshot: "offer-assignments-390.png" },
    { path: "/production", tab: "Production", screenshot: "offer-production-390.png" },
  ]) {
    await page.goto(`/offers/${offerId}${route.path}`, { waitUntil: "domcontentloaded" });
    const offerNav = page.getByRole("navigation", { name: "Navigation de l’offre" });
    await expect(offerNav.getByRole("link", { name: route.tab, exact: true })).toHaveAttribute(
      "aria-current",
      "page",
    );
    const documentWidth = await page.evaluate(() =>
      Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    );
    expect(documentWidth, `${route.path} must not overflow at 390px`).toBeLessThanOrEqual(390);
    await page.screenshot({ path: join(screenshotDirectory, route.screenshot) });
  }
});

test("filters and paginates Offer pieces on the server", async ({ page }) => {
  await loginAsAdmin(page);
  const offerId = await firstOpenOffer(page);
  const response = await page.request.get(
    `http://localhost:4000/offers/${offerId}/pieces?page=1&pageSize=10`,
  );
  expect(response.status()).toBe(200);
  const result = (await response.json()) as {
    pieces: Array<{ profile: string }>;
    profiles: string[];
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
  expect(result.page).toBe(1);
  expect(result.pageSize).toBe(10);
  expect(result.pieces.length).toBeLessThanOrEqual(10);
  expect(result.totalPages).toBe(Math.max(1, Math.ceil(result.total / 10)));
  if (result.profiles[0]) {
    const filteredResponse = await page.request.get(
      `http://localhost:4000/offers/${offerId}/pieces?page=1&pageSize=10&profile=${encodeURIComponent(result.profiles[0])}`,
    );
    expect(filteredResponse.status()).toBe(200);
    const filtered = (await filteredResponse.json()) as typeof result;
    expect(filtered.pieces.every((piece) => piece.profile === result.profiles[0])).toBe(true);
  }
});
