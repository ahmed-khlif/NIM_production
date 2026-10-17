import { BadRequestException, ConflictException } from "@nestjs/common";
import argon2 from "argon2";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { AuthService } from "../src/auth/auth.service";

function createService(prisma: Partial<PrismaService> = {}, nodeEnv = "test"): AuthService {
  const config = {
    getOrThrow: vi.fn(() => "a-local-auth-secret-that-is-long-enough"),
    get: vi.fn((key: string) => (key === "NODE_ENV" ? nodeEnv : undefined)),
  };
  return new AuthService(prisma as PrismaService, config as never);
}

describe("AuthService", () => {
  it("parses the session cookie without exposing other cookies", () => {
    const service = createService();

    expect(service.readSessionCookie("theme=dark; nim_session=abc%20123; other=value")).toBe(
      "abc 123",
    );
    expect(service.readSessionCookie("theme=dark")).toBeNull();
    expect(service.readSessionCookie("nim_session=%E0%A4%A")).toBeNull();
  });

  it("creates an httpOnly session cookie", () => {
    const service = createService();
    const cookie = service.createSessionCookie("token", new Date(Date.now() + 60_000));

    expect(cookie).toContain("nim_session=token");
    expect(cookie).toContain("HttpOnly");
    expect(cookie).toContain("SameSite=Lax");
  });

  it("marks the deletion cookie secure in production", () => {
    expect(createService({}, "production").clearSessionCookie()).toContain("Secure");
  });

  it("rejects malformed login input before querying the database", async () => {
    const user = { findUnique: vi.fn() };
    const service = createService({ user } as never);

    await expect(service.login({ username: "", password: "" }, {})).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(user.findUnique).not.toHaveBeenCalled();
  });

  it("creates a session and history event after valid credentials", async () => {
    const passwordHash = await argon2.hash("NimAdmin!2026", { type: argon2.argon2id });
    const userRecord = {
      id: "user-1",
      username: "admin",
      displayName: "Admin",
      passwordHash,
      role: "ADMIN",
      isActive: true,
    };
    const transaction = {
      session: { create: vi.fn() },
      user: { update: vi.fn() },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(userRecord) },
      historyEvent: { create: vi.fn() },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<void>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);

    const result = await service.login(
      { username: "ADMIN", password: "NimAdmin!2026" },
      { ipAddress: "127.0.0.1" },
    );

    expect(result.user).toMatchObject({ username: "admin", role: "ADMIN" });
    expect(result.token).toHaveLength(43);
    expect(transaction.session.create).toHaveBeenCalledOnce();
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ eventType: "AUTH_LOGIN" }) }),
    );
  });

  it("creates a managed user with a hashed password and actor audit event", async () => {
    const createdUser = {
      id: "user-2",
      username: "sami",
      displayName: "Sami Ben Ali",
      role: "OPERATOR",
      isActive: true,
      createdAt: new Date("2026-01-01"),
      lastLoginAt: null,
    };
    const transaction = {
      user: { create: vi.fn().mockResolvedValue(createdUser) },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      user: { findUnique: vi.fn().mockResolvedValue(null) },
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const service = createService(prisma as never);
    const actor = {
      user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
      sessionId: "session-1",
      tokenHash: "hash",
    };

    const result = await service.createUser(actor, {
      username: "Sami",
      displayName: "Sami Ben Ali",
      role: "OPERATOR",
      password: "Operator!2026",
    });

    expect(result).toMatchObject({
      username: "sami",
      displayName: "Sami Ben Ali",
      role: "OPERATOR",
      isActive: true,
    });
    expect(transaction.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          username: "sami",
          role: "OPERATOR",
          passwordHash: expect.any(String),
        }),
      }),
    );
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          eventType: "USER_CREATED",
          actorUserId: "admin-1",
          actorRole: "ADMIN",
        }),
      }),
    );
  });

  it("lists existing OPERATOR users for the shared operator directory without exposing key hashes", async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "user-operator-1",
            username: "sami",
            displayName: "Sami Ben Ali",
            role: "OPERATOR",
            isActive: true,
            tabletAccessEnabled: true,
            connectionKeyHash: "private-hash",
            createdAt: new Date("2026-01-01T00:00:00.000Z"),
            lastLoginAt: null,
          },
        ]),
      },
    };
    const service = createService(prisma as never);

    const users = await service.listUsers("OPERATOR");

    expect(prisma.user.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { role: "OPERATOR" } }),
    );
    expect(users).toEqual([
      expect.objectContaining({
        id: "user-operator-1",
        role: "OPERATOR",
        tabletAccessEnabled: true,
        hasConnectionKey: true,
      }),
    ]);
    expect(users[0]).not.toHaveProperty("connectionKeyHash");
  });

  it("prevents an administrator from disabling their own account", async () => {
    const actor = {
      user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const },
      sessionId: "session-1",
      tokenHash: "hash",
    };
    const prisma = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: "admin-1", role: "ADMIN", isActive: true }),
      },
    };
    const service = createService(prisma as never);

    await expect(service.setUserActive(actor, "admin-1", false)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });
});
