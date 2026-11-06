import { describe, expect, it, vi } from "vitest";
import { deliverBusinessNotification } from "../src/notifications/notification-delivery";

function transactionMock() {
  const notification = { createMany: vi.fn().mockResolvedValue({ count: 0 }) };
  const user = {
    findMany: vi.fn().mockResolvedValue([{ id: "manager-1" }, { id: "quality-1" }]),
    findUnique: vi.fn().mockResolvedValue({ displayName: "Operator A" }),
  };
  const offer = {
    findUnique: vi.fn().mockResolvedValue({ id: "offer-1", reference: "AFF-2026-001" }),
  };
  const machine = {
    findUnique: vi
      .fn()
      .mockResolvedValue({ id: "machine-1", name: "Scie", internalNumber: "SC-01" }),
  };
  const machineSession = {
    findMany: vi
      .fn()
      .mockResolvedValue([
        { leadOperatorId: "operator-1", members: [{ operatorId: "operator-2" }] },
      ]),
  };
  const pieceUnit = { findUnique: vi.fn().mockResolvedValue(null) };
  const cuttingBar = {
    findUnique: vi.fn().mockResolvedValue({ reference: "AFF-B001", offerId: "offer-1" }),
  };
  return { notification, user, offer, machine, machineSession, pieceUnit, cuttingBar };
}

describe("deliverBusinessNotification", () => {
  it("sends a maintenance notice with the machine and bar-removal instruction", async () => {
    const tx = transactionMock();
    await deliverBusinessNotification(
      tx as never,
      {
        id: "history-maintenance",
        eventType: "MACHINE_STATUS_CHANGED",
        entityType: "MACHINE",
        entityId: "machine-1",
        actorUserId: "manager-1",
        metadata: { oldStatus: "ACTIVE", newStatus: "MAINTENANCE" },
      },
      { machineId: "machine-1" },
    );

    const rows = tx.notification.createMany.mock.calls[0]?.[0].data as Array<
      Record<string, unknown>
    >;
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0]).toMatchObject({
      eventType: "MACHINE_STATUS_CHANGED",
      href: "/machines/machine-1",
      message: expect.stringContaining("Scie (SC-01) est en maintenance. Retirez les barres"),
    });
    expect(rows[0]?.message).toContain(
      "Aucune nouvelle affectation ni fabrication ne peut démarrer.",
    );
  });

  it("targets managers, quality controllers and the current machine team, without notifying the actor", async () => {
    const tx = transactionMock();
    await deliverBusinessNotification(tx as never, {
      id: "history-1",
      eventType: "BAR_PRODUCTION_COMPLETED",
      entityType: "CUTTING_BAR",
      entityId: "bar-1",
      actorUserId: "operator-1",
      metadata: { offerId: "offer-1", machineId: "machine-1", reference: "AFF-B001" },
    });

    const rows = tx.notification.createMany.mock.calls[0]?.[0].data as Array<
      Record<string, unknown>
    >;
    expect(rows.map((item) => item.recipientUserId).sort()).toEqual([
      "manager-1",
      "operator-2",
      "quality-1",
    ]);
    expect(
      rows.every(
        (item) => item.sourceEventId === "history-1" && item.href === "/offers/offer-1/quality",
      ),
    ).toBe(true);
    expect(
      rows.every((item) => String(item.message).includes("prête pour le contrôle qualité")),
    ).toBe(true);
    expect(tx.notification.createMany).toHaveBeenCalledWith(
      expect.objectContaining({ skipDuplicates: true }),
    );
  });

  it("sends account access to the invited user but does not expose it to unrelated roles", async () => {
    const tx = transactionMock();
    tx.user.findMany.mockResolvedValue([{ id: "manager-1" }]);
    await deliverBusinessNotification(
      tx as never,
      {
        id: "history-user",
        eventType: "USER_CREATED",
        entityType: "USER",
        entityId: "new-user",
        actorUserId: "admin-1",
        metadata: { displayName: "New Operator" },
      },
      { targetUserIds: ["new-user"] },
    );

    const rows = tx.notification.createMany.mock.calls[0]?.[0].data as Array<
      Record<string, unknown>
    >;
    expect(rows.map((item) => item.recipientUserId).sort()).toEqual(["manager-1", "new-user"]);
    expect(rows.find((item) => item.recipientUserId === "new-user")).toMatchObject({
      href: "/profile",
      title: "Utilisateur créé",
    });
  });

  it("notifies selected operators when the lead adds them to a machine session", async () => {
    const tx = transactionMock();
    tx.machineSession.findMany.mockResolvedValue([
      { leadOperatorId: "lead-operator", members: [{ operatorId: "helper-operator" }] },
    ]);

    await deliverBusinessNotification(
      tx as never,
      {
        id: "history-session",
        eventType: "MACHINE_SESSION_STARTED",
        entityType: "MACHINE_SESSION",
        entityId: "machine-session-1",
        actorUserId: "lead-operator",
        metadata: { machineId: "machine-1" },
      },
      {
        machineId: "machine-1",
        targetUserIds: ["helper-operator"],
        href: "/production/tablet",
        skipRoleRecipients: true,
      },
    );

    const rows = tx.notification.createMany.mock.calls[0]?.[0].data as Array<
      Record<string, unknown>
    >;
    expect(rows.map((item) => item.recipientUserId)).toEqual(["helper-operator"]);
    expect(rows.find((item) => item.recipientUserId === "helper-operator")).toMatchObject({
      eventType: "MACHINE_SESSION_STARTED",
      href: "/production/tablet",
      message: expect.stringContaining("équipe de Scie (SC-01)"),
    });
    expect(rows.some((item) => item.recipientUserId === "lead-operator")).toBe(false);
  });

  it("does not fan out informational preparation/history events", async () => {
    const tx = transactionMock();
    await deliverBusinessNotification(tx as never, {
      id: "history-prep",
      eventType: "FACONNAGE_PREPARATION_CREATED",
      entityType: "FACONNAGE_PREPARATION",
      entityId: "prep-1",
      actorUserId: "manager-1",
      metadata: { offerId: "offer-1" },
    });
    expect(tx.notification.createMany).not.toHaveBeenCalled();
  });
});
