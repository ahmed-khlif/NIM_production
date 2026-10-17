import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

function readEnvFile(): Record<string, string> {
  const filePath = process.env.E2E_ENV_FILE ?? resolve(process.cwd(), "apps/api/.env");
  if (!existsSync(filePath)) return {};

  return Object.fromEntries(
    readFileSync(filePath, "utf8")
      .split(/\r?\n/)
      .filter((line) => line.trim() && !line.trim().startsWith("#"))
      .map((line) => {
        const separator = line.indexOf("=");
        if (separator < 0) return [line.trim(), ""];
        return [
          line.slice(0, separator).trim(),
          line
            .slice(separator + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ""),
        ];
      }),
  );
}

const localEnv = readEnvFile();

export const adminCredentials = {
  username: process.env.E2E_ADMIN_USERNAME ?? localEnv.SEED_ADMIN_USERNAME,
  password: process.env.E2E_ADMIN_PASSWORD ?? localEnv.SEED_ADMIN_PASSWORD,
};

export async function loginAsAdmin(page: Page): Promise<void> {
  if (!adminCredentials.username || !adminCredentials.password) {
    throw new Error(
      "E2E credentials are missing. Set E2E_ADMIN_USERNAME/E2E_ADMIN_PASSWORD or configure apps/api/.env.",
    );
  }

  await page.goto("/login");
  await page.getByLabel("Identifiant").fill(adminCredentials.username);
  await page.getByRole("textbox", { name: "Mot de passe" }).fill(adminCredentials.password);
  await page.getByRole("button", { name: "Se connecter" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("link", { name: "Utilisateurs" })).toBeVisible();
}
