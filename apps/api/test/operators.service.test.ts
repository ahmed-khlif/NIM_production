import { ConflictException } from "@nestjs/common";
import argon2 from "argon2";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import type { AuthService } from "../src/auth/auth.service";
import { OperatorAuthService } from "../src/operators/operator-auth.service";
import { OperatorsService } from "../src/operators/operators.service";

const manager = {
  user: {
    id: "manager-1",
    username: "manager",
    displayName: "Manager",
    role: "PRODUCTION_MANAGER" as const,
  },
  sessionId: "session-1",
  tokenHash: "token-hash",
};

function config() {
  return {
    getOrThrow: vi.fn(() => "test-secret-that-is-long-enough-for-session-hashing"),
    get: vi.fn(() => "test"),
  };
}

describe("Operator tablet credentials on existing Users", () => {
  it("toggles tablet access without issuing a separate credential", async () => {
    const user = {
      id: "user-1",
      username: "ahmed",
      displayName: "Ahmed Ben Ali",
      role: "OPERATOR",
      isActive: true,
      tabletAccessEnabled: true,
      lastLoginAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const transaction = {
      user: { update: vi.fn().mockResolvedValue({ ...user, tabletAccessEnabled: false }) },
      tabletAuthSession: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: user.id, isActive: true }) },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const auth = {
      toManagedUser: vi.fn((value: typeof user) => ({
        id: value.id,
        username: value.username,
        displayName: value.displayName,
        role: value.role,
        isActive: value.isActive,
        tabletAccessEnabled: value.tabletAccessEnabled,
        createdAt: value.createdAt.toISOString(),
        lastLoginAt: null,
      })),
    };
    const service = new OperatorsService(
      prisma as never as PrismaService,
      auth as never as AuthService,
    );

    const result = await service.setTabletAccess(manager, user.id, false);
    const updateData = transaction.user.update.mock.calls[0]?.[0].data;

    expect(result.user).toMatchObject({ id: user.id, displayName: user.displayName, tabletAccessEnabled: false });
    expect(updateData).toEqual({ tabletAccessEnabled: false });
    expect(transaction.tabletAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, revokedAt: null } }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "USER",
          entityId: user.id,
          actorUserId: manager.user.id,
          eventType: "OPERATOR_TABLET_DEACTIVATED",
        }),
      }),
    );
  });

  it("does not disable tablet access while the User is in an active machine session", async () => {
    const prisma = {
      user: {
        findFirst: vi.fn().mockResolvedValue({
          id: "user-1",
          isActive: true,
          tabletAccessEnabled: true,
        }),
      },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      $transaction: vi.fn(),
    };
    const service = new OperatorsService(prisma as never as PrismaService, {} as AuthService);
    await expect(service.setTabletAccess(manager, "user-1", false)).rejects.toBeInstanceOf(
      ConflictException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("OperatorAuthService authenticates the canonical User", () => {
  it("authenticates an OPERATOR User and records the same User ID in history", async () => {
    const username = "ahmed";
    const password = "Operator!2026";
    const passwordHash = await argon2.hash(password);
    const user = {
      id: "user-1",
      username: "ahmed",
      passwordHash,
      displayName: "Ahmed Ben Ali",
      role: "OPERATOR",
      isActive: true,
      tabletAccessEnabled: true,
    };
    const transaction = {
      tabletAuthSession: { create: vi.fn() },
      user: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(user) },
      historyEvent: { create: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = new OperatorAuthService(prisma as never as PrismaService, config() as never);

    const result = await service.login({ username, password }, { ipAddress: "127.0.0.1" });

    expect(result.operator).toEqual({ id: user.id, displayName: user.displayName });
    expect(result.token).not.toBe(password);
    expect(transaction.tabletAuthSession.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          userId: user.id,
          tokenHash: expect.not.stringContaining(result.token),
        }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ eventType: "OPERATOR_LOGIN", actorUserId: user.id }),
      }),
    );
  });

  it("uses the same generic credential error when the User is inactive", async () => {
    const username = "ahmed";
    const password = "Operator!2026";
    const passwordHash = await argon2.hash(password);
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          role: "OPERATOR",
          isActive: false,
          tabletAccessEnabled: false,
          passwordHash,
        }),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new OperatorAuthService(prisma as never as PrismaService, config() as never);
    await expect(
      service.login({ username, password }, { ipAddress: "127.0.0.1" }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_OPERATOR_CREDENTIALS", message: expect.stringContaining("Identifiant") },
    });
  });
});
