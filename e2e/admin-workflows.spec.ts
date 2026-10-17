import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { expect, test } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

test.describe("admin authenticated workflows", () => {
  test("authenticates through the UI and receives an authenticated API session", async ({
    page,
  }) => {
    await loginAsAdmin(page);

    await expect(page.getByRole("navigation", { name: "Navigation principale" })).toBeVisible();
    await expect(
      page.getByRole("complementary").getByText("Administrateur", { exact: true }),
    ).toBeVisible();

    const currentUser = await page.request.get("http://localhost:4000/auth/me");
    expect(currentUser.status()).toBe(200);
    await expect(page.getByRole("heading", { name: /Bonjour,/ })).toBeVisible();
  });

  test("switches and persists the dark theme from the authenticated shell", async ({ page }) => {
    await page.emulateMedia({ colorScheme: "light" });
    await loginAsAdmin(page);

    const themeToggle = page.getByRole("button", {
      name: /Activer le thème sombre|Activer le thème clair/,
    });
    await expect(themeToggle).toBeVisible();
    await themeToggle.click();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.reload();
    await expect(page.locator("html")).toHaveClass(/dark/);

    await page.getByRole("button", { name: /Activer le thème clair/ }).click();
    await expect(page.locator("html")).not.toHaveClass(/dark/);
  });

  test("enforces the admin API boundary before and after authentication", async ({
    page,
    request,
  }) => {
    const unauthenticated = await request.get("http://localhost:4000/users");
    expect(unauthenticated.status()).toBe(401);

    await loginAsAdmin(page);
    const users = await page.request.get("http://localhost:4000/users");
    expect(users.status()).toBe(200);
    await expect(page.getByRole("link", { name: "Utilisateurs" })).toBeVisible();
  });

  test("loads every primary admin-facing page from the real API", async ({ page }) => {
    test.setTimeout(90_000);
    const screenshotDirectory = join(process.cwd(), "test-results", "ui-audit");
    await mkdir(screenshotDirectory, { recursive: true });
    const apiFailures: string[] = [];
    page.on("response", (response) => {
      if (response.url().startsWith("http://localhost:4000/") && response.status() >= 500) {
        apiFailures.push(`${response.status()} ${response.url()}`);
      }
    });
    await loginAsAdmin(page);

    const pages = [
      { path: "/users", heading: "Utilisateurs" },
      { path: "/machines", heading: "Machines" },
      { path: "/offers", heading: "Offres" },
      { path: "/quality", heading: "Contrôle qualité" },
      { path: "/history", heading: "Historique" },
      { path: "/settings", heading: "Paramètres" },
      { path: "/notifications", heading: "Activité" },
      { path: "/profile", heading: "Profil et sécurité" },
    ];

    for (const target of pages) {
      const response = await page.goto(target.path);
      expect(response?.status(), `${target.path} should return a successful document`).toBe(200);
      await expect(page.getByRole("heading", { name: target.heading })).toBeVisible();
      await page.waitForTimeout(250);
      await page.screenshot({
        path: join(screenshotDirectory, `primary-${target.path.slice(1)}-1440.png`.replaceAll("/", "-")),
      });
    }
    expect(apiFailures, "API requests from the primary pages must not return 5xx").toEqual([]);
  });

  test("keeps primary pages within common phone and tablet viewport widths", async ({ page }) => {
    test.setTimeout(180_000);
    await loginAsAdmin(page);

    const paths = [
      "/dashboard",
      "/offers",
      "/machines",
      "/assignments",
      "/quality",
      "/history",
      "/planning",
      "/users",
      "/settings",
      "/notifications",
      "/profile",
    ];
    for (const width of [375, 768]) {
      await page.setViewportSize({ width, height: 900 });
      for (const path of paths) {
        const response = await page.goto(path, { waitUntil: "domcontentloaded" });
        expect(response?.status(), `${path} should render at ${width}px`).toBe(200);
        await expect(page.locator("main#main-content")).toBeVisible();
        const pageWidth = await page.evaluate(() =>
          Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
        );
        expect(
          pageWidth,
          `${path} must not cause horizontal page overflow at ${width}px`,
        ).toBeLessThanOrEqual(width);
      }
    }
  });

  test("exposes the management dialogs without mutating production data", async ({ page }) => {
    await loginAsAdmin(page);

    await page.goto("/users");
    await page.getByRole("button", { name: "Nouvel utilisateur" }).click();
    await expect(page.getByRole("dialog")).toContainText("Créer un utilisateur");
    await page.getByRole("button", { name: "Annuler" }).click();

    await page.goto("/machines");
    await page.getByRole("button", { name: "Ajouter une machine" }).click();
    await expect(page.getByRole("dialog")).toContainText("Ajouter une machine");
    await page.getByRole("button", { name: "Annuler" }).click();

    await page.goto("/offers");
    await page.getByRole("button", { name: "Nouvelle offre" }).click();
    await expect(page.getByRole("dialog")).toContainText("Nouvelle offre");
    await page.getByRole("button", { name: "Annuler" }).click();

    // Assignments are now part of each Offer's bar-assignment workspace; the
    // former global unit-assignment dialog route intentionally redirects to Offers.
  });

  test("creates an Offer through the connected workspace and verifies persistence", async ({
    page,
  }) => {
    await loginAsAdmin(page);
    const reference = `E2E-OFFER-${Date.now()}`;
    let offerId: string | undefined;

    try {
      await page.goto("/offers");
      await page.getByRole("button", { name: "Nouvelle offre" }).click();
      await page.getByLabel("Référence *").fill(reference);
      await page.getByLabel("Indice *").fill("A");
      await page.getByLabel("Nom de l’offre *").fill("E2E offer workspace");
      await page.getByRole("button", { name: "Créer l’offre" }).click();
      await expect(page).toHaveURL(/\/offers\//);

      const listResponse = await page.request.get("http://localhost:4000/offers");
      expect(listResponse.status()).toBe(200);
      const list = (await listResponse.json()) as {
        offers: Array<{ id: string; reference: string }>;
      };
      const created = list.offers.find((offer) => offer.reference === reference);
      expect(created).toBeDefined();
      offerId = created!.id;
      await expect(page.getByText(reference)).toBeVisible();
    } finally {
      if (!offerId) {
        const response = await page.request.get("http://localhost:4000/offers");
        if (response.ok()) {
          const list = (await response.json()) as {
            offers: Array<{ id: string; reference: string }>;
          };
          offerId = list.offers.find((offer) => offer.reference === reference)?.id;
        }
      }
      if (offerId) {
        const cleanupResponse = await page.request.post(
          `http://localhost:4000/offers/${offerId}/archive`,
        );
        expect([200, 201]).toContain(cleanupResponse.status());
      }
    }
  });

  test("uploads and removes authenticated piece photos through the UI", async ({ page }) => {
    await loginAsAdmin(page);
    const suffix = Date.now();
    const offerResponse = await page.request.post("http://localhost:4000/offers", {
      data: { reference: `E2E-IMAGE-${suffix}`, revision: "A", name: "E2E image offer" },
    });
    expect(offerResponse.status()).toBe(201);
    const offer = (await offerResponse.json()).offer as { id: string };
    let pieceId: string | undefined;

    try {
      const createResponse = await page.request.post(
        `http://localhost:4000/offers/${offer.id}/pieces`,
        {
          data: {
            reference: `IMAGE-${suffix}`,
            quantity: 1,
            profile: "IPE200",
            quality: "S275JR",
            lengthMm: 100,
            unitWeightKg: 1,
            designation: "E2E IMAGE",
          },
        },
      );
      expect(createResponse.status()).toBe(201);
      pieceId = ((await createResponse.json()).piece as { id: string }).id;
      await page.goto(`/offers/${offer.id}/pieces/${pieceId}`);
      await expect(page.getByText("Photos de la pièce", { exact: true })).toBeVisible();

      await page.locator('input[type="file"]').setInputFiles({
        name: "piece-proof.png",
        mimeType: "image/png",
        buffer: Buffer.from(
          "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
          "base64",
        ),
      });

      await expect(page.getByRole("button", { name: "Afficher piece-proof.png" })).toBeVisible();
      const preview = page.locator('img[alt*="piece-proof.png"]').first();
      await expect(preview).toBeVisible();
      const previewUrl = await preview.getAttribute("src");
      expect(previewUrl).toContain(`/offers/${offer.id}/pieces/${pieceId}/images/`);
      expect((await page.request.get(previewUrl!)).status()).toBe(200);

      await page.getByRole("button", { name: "Supprimer piece-proof.png" }).click();
      await page.getByRole("alertdialog").getByRole("button", { name: "Supprimer" }).click();
      await expect(page.getByText("Aucune photo attachée")).toBeVisible();
    } finally {
      if (pieceId) {
        const archiveResponse = await page.request.post(
          `http://localhost:4000/offers/${offer.id}/pieces/${pieceId}/archive`,
        );
        expect([200, 201]).toContain(archiveResponse.status());
      }
      const archiveOfferResponse = await page.request.post(
        `http://localhost:4000/offers/${offer.id}/archive`,
      );
      expect([200, 201]).toContain(archiveOfferResponse.status());
    }
  });
});
