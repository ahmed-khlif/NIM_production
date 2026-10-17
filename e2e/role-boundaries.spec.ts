import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { loginAsAdmin } from "./fixtures";

const API_URL = "http://localhost:4000";
const rolePassword = "E2e-role-password-2026";

type CreatedUser = { id: string; username: string; password: string };
type CreatedOffer = { id: string; reference: string };
type CreatedPiece = { id: string; reference: string; status: string };

async function loginRole(context: BrowserContext, user: CreatedUser): Promise<void> {
  const response = await context.request.post(`${API_URL}/auth/login`, {
    data: { username: user.username, password: user.password },
  });
  expect(response.status()).toBe(201);
}

async function createRoleUser(page: Page, role: string, suffix: string): Promise<CreatedUser> {
  const user = {
    username: `e2e.${role.toLowerCase()}.${suffix}`,
    displayName: `E2E ${role}`,
    role,
    password: rolePassword,
  };
  const response = await page.request.post(`${API_URL}/users`, { data: user });
  expect(response.status()).toBe(201);
  return { ...(await response.json()).user, password: user.password } as CreatedUser;
}

async function createOffer(context: BrowserContext, reference: string): Promise<CreatedOffer> {
  const response = await context.request.post(`${API_URL}/offers`, {
    data: { reference, revision: "A", name: `E2E ${reference}` },
  });
  expect(response.status(), await response.text()).toBe(201);
  return (await response.json()).offer as CreatedOffer;
}

test.describe("role boundaries and Offer isolation", () => {
  test.describe.configure({ timeout: 120_000 });

  test("scopes pieces to their Offer and enforces role permissions", async ({ browser, page }) => {
    await loginAsAdmin(page);
    const suffix = `${Date.now()}-${test.info().parallelIndex}`;
    const createdUsers: CreatedUser[] = [];
    const contexts: BrowserContext[] = [];
    const offers: CreatedOffer[] = [];
    const pieces: Array<{ offerId: string; piece: CreatedPiece }> = [];

    try {
      const manager = await createRoleUser(page, "PRODUCTION_MANAGER", suffix);
      const operator = await createRoleUser(page, "OPERATOR", suffix);
      const quality = await createRoleUser(page, "QUALITY_CONTROLLER", suffix);
      createdUsers.push(manager, operator, quality);

      const managerContext = await browser.newContext();
      const operatorContext = await browser.newContext();
      const qualityContext = await browser.newContext();
      contexts.push(managerContext, operatorContext, qualityContext);
      await loginRole(managerContext, manager);
      await loginRole(operatorContext, operator);
      await loginRole(qualityContext, quality);

      const managerApi = managerContext.request;
      const operatorApi = operatorContext.request;
      const qualityApi = qualityContext.request;
      const managerUsersResponse = await managerApi.get(`${API_URL}/users`);
      expect(managerUsersResponse.status()).toBe(200);
      const managerUsers = (await managerUsersResponse.json()).users as Array<{ role: string }>;
      expect(managerUsers.every((user) => user.role === "OPERATOR")).toBe(true);
      expect((await operatorApi.get(`${API_URL}/offers`)).status()).toBe(200);
      expect(
        (
          await operatorApi.post(`${API_URL}/offers`, {
            data: { reference: `NO-OP-${suffix}`, revision: "A", name: "Forbidden" },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await qualityApi.post(`${API_URL}/offers`, {
            data: { reference: `NO-QA-${suffix}`, revision: "A", name: "Forbidden" },
          })
        ).status(),
      ).toBe(403);

      const firstOffer = await createOffer(managerContext, `E2E-OFFER-A-${suffix}`);
      offers.push(firstOffer);
      const secondOffer = await createOffer(managerContext, `E2E-OFFER-B-${suffix}`);
      offers.push(secondOffer);

      const pieceInput = {
        reference: `SAME-REF-${suffix}`,
        quantity: 1,
        profile: "IPE200",
        quality: "S275JR",
        lengthMm: 3200,
        unitWeightKg: 10,
        designation: "E2E ISOLATION",
      };
      for (const offer of offers) {
        const response = await managerApi.post(`${API_URL}/offers/${offer.id}/pieces`, {
          data: pieceInput,
        });
        expect(response.status(), await response.text()).toBe(201);
        pieces.push({ offerId: offer.id, piece: (await response.json()).piece as CreatedPiece });
      }

      const firstList = await managerApi.get(`${API_URL}/offers/${firstOffer.id}/pieces`);
      const secondList = await managerApi.get(`${API_URL}/offers/${secondOffer.id}/pieces`);
      expect(((await firstList.json()).pieces as CreatedPiece[]).map((piece) => piece.id)).toEqual([
        pieces[0].piece.id,
      ]);
      expect(((await secondList.json()).pieces as CreatedPiece[]).map((piece) => piece.id)).toEqual([
        pieces[1].piece.id,
      ]);
      expect(
        (await managerApi.get(`${API_URL}/offers/${firstOffer.id}/pieces/${pieces[1].piece.id}`)).status(),
      ).toBe(404);

      expect(
        (
          await operatorApi.post(`${API_URL}/offers/${firstOffer.id}/pieces`, {
            data: { ...pieceInput, reference: `NO-OP-PIECE-${suffix}` },
          })
        ).status(),
      ).toBe(403);
      expect(
        (
          await qualityApi.post(`${API_URL}/offers/${firstOffer.id}/pieces`, {
            data: { ...pieceInput, reference: `NO-QA-PIECE-${suffix}` },
          })
        ).status(),
      ).toBe(403);
    } finally {
      for (const context of contexts) await context.close();
      for (const { offerId, piece } of pieces) {
        if (piece.id) await page.request.post(`${API_URL}/offers/${offerId}/pieces/${piece.id}/archive`);
      }
      for (const offer of offers) {
        await page.request.post(`${API_URL}/offers/${offer.id}/archive`);
      }
      for (const user of createdUsers) await page.request.post(`${API_URL}/users/${user.id}/disable`);
    }
  });
});
