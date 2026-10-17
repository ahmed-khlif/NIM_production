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
  it("issues an Argon2id key to an existing OPERATOR User and returns it once", async () => {
    const user = {
      id: "user-1",
      username: "ahmed",
      displayName: "Ahmed Ben Ali",
      role: "OPERATOR",
      isActive: true,
      tabletAccessEnabled: true,
      connectionKeyHash: "argon-hash",
      lastLoginAt: null,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    };
    const transaction = {
      user: { update: vi.fn().mockResolvedValue(user) },
      tabletAuthSession: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      user: { findFirst: vi.fn().mockResolvedValue({ id: user.id, isActive: true }) },
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
        hasConnectionKey: Boolean(value.connectionKeyHash),
        createdAt: value.createdAt.toISOString(),
        lastLoginAt: null,
      })),
    };
    const service = new OperatorsService(
      prisma as never as PrismaService,
      auth as never as AuthService,
    );

    const result = await service.resetConnectionKey(manager, user.id);
    const updateData = transaction.user.update.mock.calls[0]?.[0].data;

    expect(result.user).toMatchObject({ id: user.id, displayName: user.displayName });
    expect(result.user).not.toHaveProperty("connectionKeyHash");
    expect(result.connectionKey).toMatch(/^NIM-[0-9A-F]{12}-[0-9A-F]{32}$/);
    expect(await argon2.verify(updateData.connectionKeyHash, result.connectionKey)).toBe(true);
    expect(updateData).toHaveProperty("tabletAccessEnabled", true);
    expect(transaction.tabletAuthSession.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: user.id, revokedAt: null } }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          entityType: "USER",
          entityId: user.id,
          actorUserId: manager.user.id,
          eventType: "OPERATOR_KEY_RESET",
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
    const connectionKey = "NIM-ABCDEF123456-0123456789ABCDEF0123456789ABCDEF";
    const connectionKeyHash = await argon2.hash(connectionKey, { type: argon2.argon2id });
    const user = {
      id: "user-1",
      username: "ahmed",
      displayName: "Ahmed Ben Ali",
      role: "OPERATOR",
      isActive: true,
      tabletAccessEnabled: true,
      connectionKeyId: "ABCDEF123456",
      connectionKeyHash,
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

    const result = await service.login({ connectionKey }, { ipAddress: "127.0.0.1" });

    expect(result.operator).toEqual({ id: user.id, displayName: user.displayName });
    expect(result).not.toHaveProperty("connectionKeyHash");
    expect(result.token).not.toBe(connectionKey);
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
    const connectionKey = "NIM-ABCDEF123456-0123456789ABCDEF0123456789ABCDEF";
    const connectionKeyHash = await argon2.hash(connectionKey, { type: argon2.argon2id });
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({
          id: "user-1",
          role: "OPERATOR",
          isActive: false,
          tabletAccessEnabled: false,
          connectionKeyId: "ABCDEF123456",
          connectionKeyHash,
        }),
      },
      historyEvent: { create: vi.fn() },
    };
    const service = new OperatorAuthService(prisma as never as PrismaService, config() as never);
    await expect(
      service.login({ connectionKey }, { ipAddress: "127.0.0.1" }),
    ).rejects.toMatchObject({
      response: { code: "INVALID_OPERATOR_KEY", message: expect.stringContaining("invalide") },
    });
  });
});
