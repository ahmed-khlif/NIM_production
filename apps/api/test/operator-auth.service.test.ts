import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { OperatorAuthService } from "../src/operators/operator-auth.service";

describe("OperatorAuthService presence heartbeat", () => {
  it("records tablet activity on a valid session without writing on every request", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });
    const tabletAuthSession = {
      findUnique: vi.fn().mockResolvedValue({
        id: "tablet-session-1",
        tokenHash: "hash",
        userId: "operator-1",
        expiresAt: new Date(Date.now() + 60_000),
        revokedAt: null,
        lastUsedAt: null,
        user: {
          id: "operator-1",
          displayName: "Sami Ben Ali",
          role: "OPERATOR",
          isActive: true,
          tabletAccessEnabled: true,
        },
      }),
      updateMany,
    };
    const service = new OperatorAuthService(
      { tabletAuthSession } as never as PrismaService,
      { getOrThrow: () => "test-secret", get: () => "test" } as never,
    );

    await expect(service.validateSession("tablet-token")).resolves.toMatchObject({
      operator: { id: "operator-1" },
      sessionId: "tablet-session-1",
    });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "tablet-session-1", revokedAt: null, lastUsedAt: null },
        data: { lastUsedAt: expect.any(Date) },
      }),
    );
  });
});
