import { describe, expect, it, vi } from "vitest";
import { HealthController } from "../src/health/health.controller";

describe("HealthController", () => {
  const prisma = { $queryRaw: vi.fn() };

  it("returns a stable health payload", () => {
    const response = new HealthController(prisma as never).getHealth();
    expect(response.status).toBe("ok");
    expect(response.service).toBe("nim-api");
    expect(Number.isNaN(Date.parse(response.timestamp))).toBe(false);
  });

  it("reports database readiness after a successful probe", async () => {
    prisma.$queryRaw.mockResolvedValueOnce([{ result: 1 }]);
    const response = await new HealthController(prisma as never).getReadiness();

    expect(response).toMatchObject({
      status: "ok",
      service: "nim-api",
      dependencies: { database: "ok" },
    });
  });

  it("fails readiness without exposing database details", async () => {
    prisma.$queryRaw.mockRejectedValueOnce(new Error("connection details must not leak"));

    await expect(new HealthController(prisma as never).getReadiness()).rejects.toMatchObject({
      status: 503,
      response: expect.objectContaining({
        code: "DATABASE_UNAVAILABLE",
        message: "La base de données est indisponible.",
      }),
    });
  });
});
