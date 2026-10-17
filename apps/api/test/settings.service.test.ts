import { BadRequestException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { SettingsService } from "../src/settings/settings.service";

const actor = { user: { id: "admin-1", username: "admin", displayName: "Admin", role: "ADMIN" as const }, sessionId: "session-1", tokenHash: "hash" };

describe("SettingsService", () => {
  it("returns safe defaults without creating a settings row", async () => {
    const userSettings = { findUnique: vi.fn().mockResolvedValue(null) };
    const service = new SettingsService({ userSettings } as never as PrismaService);

    await expect(service.get(actor)).resolves.toEqual({ density: "comfortable", notificationsEnabled: true, updatedAt: null });
    expect(userSettings.findUnique).toHaveBeenCalledWith({ where: { userId: "admin-1" } });
  });

  it("validates and persists preferences with an audit event", async () => {
    const userSettings = { upsert: vi.fn().mockResolvedValue({ density: "compact", notificationsEnabled: false, updatedAt: new Date("2026-01-02") }) };
    const transaction = { userSettings, historyEvent: { create: vi.fn() } };
    const prisma = { $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)) };
    const service = new SettingsService(prisma as never);

    await expect(service.update(actor, { density: "compact", notificationsEnabled: false })).resolves.toMatchObject({ density: "compact", notificationsEnabled: false });
    expect(transaction.historyEvent.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ eventType: "SETTINGS_UPDATED", actorUserId: "admin-1" }) }));
    await expect(service.update(actor, { density: "dense", notificationsEnabled: false })).rejects.toBeInstanceOf(BadRequestException);
  });
});
