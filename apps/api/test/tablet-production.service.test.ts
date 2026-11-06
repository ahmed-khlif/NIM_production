import { BadRequestException, ConflictException, ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../src/infrastructure/prisma/prisma.service";
import { TabletProductionService } from "../src/production/tablet-production.service";

const auth = {
  operator: { id: "operator-1", displayName: "Ahmed Ben Ali" },
  sessionId: "auth-session-1",
  tokenHash: "token-hash",
};
const machine = {
  id: "machine-1",
  name: "Kaltenbach 01",
  internalNumber: "KAL-01",
  type: "Sciage",
  status: "ACTIVE",
};
const teamMember = {
  id: "membership-1",
  operatorId: auth.operator.id,
  role: "LEAD",
  active: true,
  joinedAt: new Date("2026-01-01T08:00:00Z"),
  operator: auth.operator,
};

function runRecord(input: {
  runStatus: "RUNNING" | "COMPLETED";
  barStatus: "AFFECTEE" | "LANCEE" | "FABRIQUEE";
  unitStatus: "ASSIGNED" | "IN_PROGRESS" | "QUALITY_PENDING";
  productionStatus: "AFFECTEE" | "LANCEE" | "FABRIQUEE";
  qualityStatus?: "NOT_INSPECTED" | "NON_CONFORME";
  barQualityStatus?: "NOT_INSPECTED" | "NON_CONFORME";
}) {
  const offer = { id: "offer-1", reference: "OFF-2026-0042", status: "IN_PRODUCTION" };
  const piece = {
    id: "piece-1",
    offerId: offer.id,
    reference: "P-001",
    profile: "IPE200",
    lengthMm: 3200,
    unitWeightKg: 71.2,
  };
  const pieceUnit = {
    id: "unit-1",
    pieceId: piece.id,
    sequenceNumber: 1,
    status: input.unitStatus,
    productionStatus: input.productionStatus,
    qualityStatus: input.qualityStatus ?? "NOT_INSPECTED",
    currentMachineId: machine.id,
    currentProductionOperatorId: null,
    startedAt: new Date("2026-01-01T08:00:00Z"),
    manufacturedAt: null,
    piece,
  };
  const session = {
    id: "machine-session-1",
    machineId: machine.id,
    leadOperatorId: auth.operator.id,
    status: "ACTIVE",
    startedAt: new Date("2026-01-01T08:00:00Z"),
    endedAt: null,
    machine,
    members: [teamMember],
  };
  const bar = {
    id: "bar-1",
    offerId: offer.id,
    cuttingPlanId: "plan-1",
    reference: "OFF42-B001",
    profile: "IPE200",
    rawLengthMm: 12000,
    usedLengthMm: 11800,
    wasteMm: 200,
    status: input.barStatus,
    qualityStatus: input.barQualityStatus ?? "NOT_INSPECTED",
    fabricatedAt: null,
    createdAt: new Date("2026-01-01T07:00:00Z"),
    offer,
    items: [
      {
        id: "bar-item-1",
        pieceUnitId: pieceUnit.id,
        active: true,
        createdAt: new Date(),
        pieceUnit,
      },
    ],
    assignments: [
      {
        id: "bar-assignment-1",
        machineId: machine.id,
        assignedAt: new Date(),
        unassignedAt: null,
        active: true,
        machine,
      },
    ],
    nonConformities: [],
  };
  return {
    id: "run-1",
    cuttingBarId: bar.id,
    machineId: machine.id,
    machineSessionId: session.id,
    startedByOperatorId: auth.operator.id,
    status: input.runStatus,
    startedAt: new Date("2026-01-01T08:00:00Z"),
    finishedAt: input.runStatus === "COMPLETED" ? new Date("2026-01-01T09:00:00Z") : null,
    cuttingBar: bar,
    machine,
    machineSession: session,
    startedByOperator: auth.operator,
    nonConformities: [],
  };
}

describe("TabletProductionService", () => {
  it("shows available operators with a live presence signal and puts online operators first", async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          { id: "offline", displayName: "Zied Offline" },
          { id: "online", displayName: "Sami Online" },
        ]),
      },
      tabletAuthSession: {
        findMany: vi.fn().mockResolvedValue([
          { userId: "online", lastUsedAt: new Date() },
          { userId: "offline", lastUsedAt: new Date(Date.now() - 60_000) },
        ]),
      },
    };
    const service = new TabletProductionService(prisma as never, {} as never);

    await expect(service.listAvailableOperators(auth)).resolves.toMatchObject({
      operators: [
        { id: "online", isOnline: true, lastSeenAt: expect.any(String) },
        { id: "offline", isOnline: false, lastSeenAt: expect.any(String) },
      ],
    });
    expect(prisma.tabletAuthSession.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          revokedAt: null,
          expiresAt: { gt: expect.any(Date) },
          lastUsedAt: { not: null },
        }),
      }),
    );
  });

  it("keeps operators in another active machine session visible but unavailable", async () => {
    const prisma = {
      user: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: "busy",
            displayName: "Zied Busy",
            machineSessionMemberships: [
              { machineSession: { machine: { name: "Kaltenbach 01" } } },
            ],
          },
          { id: "free", displayName: "Sami Free", machineSessionMemberships: [] },
        ]),
      },
      tabletAuthSession: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new TabletProductionService(prisma as never, {} as never);

    await expect(service.listAvailableOperators(auth)).resolves.toMatchObject({
      operators: [
        { id: "free", isAvailable: true, activeMachineName: null },
        { id: "busy", isAvailable: false, activeMachineName: "Kaltenbach 01" },
      ],
    });
  });

  it("allows only the session lead to close a shared machine session", async () => {
    const tx = {
      machineSessionOperator: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ machineSession: { leadOperatorId: "operator-lead" } }),
      },
      productionRun: { findFirst: vi.fn() },
      machineSession: { updateMany: vi.fn() },
    };
    const service = new TabletProductionService(
      {
        $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      } as never,
      {} as never,
    );

    await expect(service.endMachineSession(auth, "machine-session-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.productionRun.findFirst).not.toHaveBeenCalled();
    expect(tx.machineSession.updateMany).not.toHaveBeenCalled();
  });

  it("keeps run controls with the operator who launched the bar", async () => {
    const run = runRecord({
      runStatus: "RUNNING",
      barStatus: "LANCEE",
      unitStatus: "IN_PROGRESS",
      productionStatus: "LANCEE",
    });
    const otherOperator = { ...auth, operator: { id: "operator-2", displayName: "Sami Ben Ali" } };
    const tx = {
      productionRun: { findUnique: vi.fn().mockResolvedValue(run), updateMany: vi.fn() },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-2" }) },
    };
    const service = new TabletProductionService(
      {
        $transaction: (callback: (transaction: typeof tx) => Promise<unknown>) => callback(tx),
      } as never,
      {} as never,
    );

    await expect(service.finishRun(otherOperator, "run-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    await expect(service.cancelRun(otherOperator, "run-1")).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(tx.productionRun.updateMany).not.toHaveBeenCalled();
  });

  it("filters and paginates open workshop non-conformities in the database", async () => {
    const prisma = {
      nonConformity: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(31),
      },
    };
    const service = new TabletProductionService(prisma as never, {} as never);
    const result = await service.listOpenNonConformities({ page: 2, pageSize: 10, search: "CNC" });
    expect(prisma.nonConformity.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "OPEN", OR: expect.any(Array) }),
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toMatchObject({
      pagination: { page: 2, pageSize: 10, total: 31, totalPages: 4 },
      nonConformities: [],
    });
  });

  it("scopes the workshop non-conformity queue to the requested offer", async () => {
    const findMany = vi.fn().mockResolvedValue([]);
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-a" }) },
      nonConformity: { findMany, count: vi.fn().mockResolvedValue(1) },
    };
    const service = new TabletProductionService(prisma as never, {} as never);

    await service.listOpenNonConformities({ offerId: "offer-a", page: 1, pageSize: 20 });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "OPEN", offerId: "offer-a" }),
      }),
    );
  });

  it("filters and paginates the production monitor in PostgreSQL while keeping global status totals", async () => {
    const prisma = {
      cuttingBar: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(23),
        groupBy: vi.fn().mockResolvedValue([{ status: "AFFECTEE", _count: { _all: 4 } }]),
      },
      nonConformity: { count: vi.fn().mockResolvedValue(2) },
      machineSession: { findMany: vi.fn() },
    };
    const service = new TabletProductionService(prisma as never, { publish: vi.fn() } as never);
    const result = await service.getProductionMonitor({
      page: 2,
      pageSize: 10,
      search: "IPE",
      status: "AFFECTEE",
    });
    expect(prisma.cuttingBar.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "AFFECTEE", OR: expect.any(Array) }),
        skip: 10,
        take: 10,
      }),
    );
    expect(result).toMatchObject({
      pagination: { page: 2, pageSize: 10, total: 23, totalPages: 3 },
      counts: { assigned: 4, openNonConformities: 2 },
    });
  });

  it("limits a production manager monitor to Affaires already in production", async () => {
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-draft", status: "DRAFT" }) },
    };
    const service = new TabletProductionService(prisma as never, {} as never);
    await expect(
      service.getProductionMonitor({ offerId: "offer-draft" }, "PRODUCTION_MANAGER"),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it("starts a temporary machine session with a lead and helper, then publishes after commit", async () => {
    const events: string[] = [];
    const helper = { id: "operator-2", displayName: "Sami Ben Ali" };
    const session = {
      id: "machine-session-1",
      machineId: machine.id,
      leadOperatorId: auth.operator.id,
      status: "ACTIVE",
      startedAt: new Date("2026-01-01T08:00:00Z"),
      endedAt: null,
    };
    const members = [
      { ...teamMember, machineSessionId: session.id },
      {
        id: "membership-2",
        operatorId: helper.id,
        role: "HELPER",
        active: true,
        joinedAt: new Date(),
        operator: helper,
      },
    ];
    const transaction = {
      machine: { findUnique: vi.fn().mockResolvedValue(machine) },
      user: { findMany: vi.fn().mockResolvedValue([auth.operator, helper]), update: vi.fn() },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue(null), createMany: vi.fn() },
      machineSession: { create: vi.fn().mockResolvedValue(session) },
      historyEvent: { create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        const result = await callback(transaction);
        events.push("commit");
        return result;
      }),
      machineSessionOperator: {
        findFirst: vi.fn().mockResolvedValue({
          machineSession: {
            ...session,
            machine,
            members,
          },
        }),
      },
      machineBarAssignment: {
        findMany: vi.fn().mockResolvedValue([]),
        count: vi.fn().mockResolvedValue(0),
      },
      productionRun: { findFirst: vi.fn().mockResolvedValue(null) },
      cuttingBar: { groupBy: vi.fn().mockResolvedValue([]) },
    };
    const realtime = { publish: vi.fn(() => events.push("publish")) };
    const service = new TabletProductionService(
      prisma as never as PrismaService,
      realtime as never,
    );

    const result = await service.startMachineSession(auth, {
      machineId: machine.id,
      helperOperatorIds: [helper.id],
    });

    expect(result.session).toMatchObject({
      machineId: machine.id,
      team: [
        { id: auth.operator.id, role: "LEAD" },
        { id: helper.id, role: "HELPER" },
      ],
    });
    expect(transaction.machineSessionOperator.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({ operatorId: auth.operator.id, role: "LEAD" }),
          expect.objectContaining({ operatorId: helper.id, role: "HELPER" }),
        ]),
      }),
    );
    expect(events).toEqual(["commit", "publish"]);
  });

  it("rejects duplicate helper selection before database work", async () => {
    const prisma = { $transaction: vi.fn() };
    const service = new TabletProductionService(
      prisma as never as PrismaService,
      { publish: vi.fn() } as never,
    );
    await expect(
      service.startMachineSession(auth, {
        machineId: machine.id,
        helperOperatorIds: ["operator-2", "operator-2"],
      }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("starts an assigned bar once and publishes only after its transaction commits", async () => {
    const events: string[] = [];
    const transaction = {
      machineSessionOperator: {
        findFirst: vi.fn().mockResolvedValue({
          machineSession: { id: "machine-session-1", machineId: machine.id, machine },
        }),
      },
      cuttingBar: {
        findUnique: vi.fn().mockResolvedValue(
          runRecord({
            runStatus: "RUNNING",
            barStatus: "AFFECTEE",
            unitStatus: "ASSIGNED",
            productionStatus: "AFFECTEE",
          }).cuttingBar,
        ),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      assignment: { count: vi.fn().mockResolvedValue(1) },
      pieceUnit: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      productionRun: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: "run-1" }),
      },
      piece: { updateMany: vi.fn() },
      offer: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      historyEvent: {
        create: vi.fn(),
        createMany: vi.fn(),
        createManyAndReturn: vi.fn().mockResolvedValue([]),
      },
      user: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        const result = await callback(transaction);
        events.push("commit");
        return result;
      }),
      productionRun: {
        findUnique: vi.fn().mockResolvedValue(
          runRecord({
            runStatus: "RUNNING",
            barStatus: "LANCEE",
            unitStatus: "IN_PROGRESS",
            productionStatus: "LANCEE",
          }),
        ),
      },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
    };
    const realtime = { publish: vi.fn(() => events.push("publish")) };
    const service = new TabletProductionService(
      prisma as never as PrismaService,
      realtime as never,
    );

    const result = await service.startBar(auth, "bar-1");

    expect(result.run.status).toBe("RUNNING");
    expect(transaction.cuttingBar.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "bar-1", status: "AFFECTEE" },
        data: { status: "LANCEE" },
      }),
    );
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ productionStatus: "AFFECTEE" }),
        data: expect.objectContaining({ status: "IN_PROGRESS", productionStatus: "LANCEE" }),
      }),
    );
    expect(transaction.productionRun.create).toHaveBeenCalledOnce();
    expect(events).toEqual(["commit", "publish"]);
  });

  it("rejects a bar assigned to a different machine without mutating it", async () => {
    const bar = runRecord({
      runStatus: "RUNNING",
      barStatus: "AFFECTEE",
      unitStatus: "ASSIGNED",
      productionStatus: "AFFECTEE",
    }).cuttingBar;
    bar.assignments = [];
    const transaction = {
      machineSessionOperator: {
        findFirst: vi.fn().mockResolvedValue({
          machineSession: { id: "machine-session-1", machineId: machine.id, machine },
        }),
      },
      cuttingBar: { findUnique: vi.fn().mockResolvedValue(bar), updateMany: vi.fn() },
      assignment: { count: vi.fn() },
      pieceUnit: { updateMany: vi.fn() },
      productionRun: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
    };
    const realtime = { publish: vi.fn() };
    const service = new TabletProductionService(
      prisma as never as PrismaService,
      realtime as never,
    );

    await expect(service.startBar(auth, "bar-1")).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.cuttingBar.updateMany).not.toHaveBeenCalled();
    expect(transaction.productionRun.create).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("cancels a launched bar for its active operator, restores assignment state, audits, and publishes after commit", async () => {
    const before = runRecord({
      runStatus: "RUNNING",
      barStatus: "LANCEE",
      unitStatus: "IN_PROGRESS",
      productionStatus: "LANCEE",
    });
    const events: string[] = [];
    const transaction = {
      productionRun: {
        findUnique: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      pieceUnit: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      cuttingBar: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      piece: { updateMany: vi.fn() },
      historyEvent: {
        create: vi.fn(),
        createMany: vi.fn(),
        createManyAndReturn: vi.fn().mockResolvedValue([]),
      },
      user: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
        const result = await callback(transaction);
        events.push("commit");
        return result;
      }),
      productionRun: { findUnique: vi.fn().mockResolvedValue(before) },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      pieceUnit: { count: vi.fn().mockResolvedValue(0) },
    };
    const realtime = { publish: vi.fn(() => events.push("publish")) };
    const service = new TabletProductionService(prisma as never, realtime as never);

    await service.cancelRun(auth, "run-1");

    expect(transaction.productionRun.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "run-1", status: "RUNNING" },
        data: expect.objectContaining({ status: "CANCELLED" }),
      }),
    );
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "ASSIGNED",
          productionStatus: "AFFECTEE",
          startedAt: null,
        }),
      }),
    );
    expect(transaction.cuttingBar.updateMany).toHaveBeenCalledWith({
      where: { id: "bar-1", status: "LANCEE" },
      data: { status: "AFFECTEE" },
    });
    expect(transaction.historyEvent.createMany).toHaveBeenCalledOnce();
    expect(events).toEqual(["commit", "publish", "publish"]);
  });

  it("does not cancel a launched bar while it has an open non-conformity", async () => {
    const before = runRecord({
      runStatus: "RUNNING",
      barStatus: "LANCEE",
      unitStatus: "IN_PROGRESS",
      productionStatus: "LANCEE",
    });
    before.nonConformities.push({ id: "nc-1" } as never);
    const transaction = {
      productionRun: { findUnique: vi.fn().mockResolvedValue(before), updateMany: vi.fn() },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
    };
    const realtime = { publish: vi.fn() };
    const service = new TabletProductionService(
      {
        $transaction: (callback: (tx: typeof transaction) => Promise<unknown>) =>
          callback(transaction),
      } as never,
      realtime as never,
    );
    await expect(service.cancelRun(auth, "run-1")).rejects.toBeInstanceOf(ConflictException);
    expect(transaction.productionRun.updateMany).not.toHaveBeenCalled();
    expect(realtime.publish).not.toHaveBeenCalled();
  });

  it("finishes physical production without clearing the independent quality warning", async () => {
    const before = runRecord({
      runStatus: "RUNNING",
      barStatus: "LANCEE",
      unitStatus: "IN_PROGRESS",
      productionStatus: "LANCEE",
      qualityStatus: "NON_CONFORME",
      barQualityStatus: "NON_CONFORME",
    });
    const after = runRecord({
      runStatus: "COMPLETED",
      barStatus: "FABRIQUEE",
      unitStatus: "QUALITY_PENDING",
      productionStatus: "FABRIQUEE",
      qualityStatus: "NON_CONFORME",
      barQualityStatus: "NON_CONFORME",
    });
    const transaction = {
      productionRun: {
        findUnique: vi.fn().mockResolvedValue(before),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      pieceUnit: {
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
        count: vi.fn().mockResolvedValue(0),
      },
      cuttingBar: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      piece: { updateMany: vi.fn() },
      historyEvent: { createMany: vi.fn(), createManyAndReturn: vi.fn().mockResolvedValue([]) },
      user: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
      productionRun: { findUnique: vi.fn().mockResolvedValue(after) },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
    };
    const realtime = { publish: vi.fn() };
    const service = new TabletProductionService(
      prisma as never as PrismaService,
      realtime as never,
    );

    const result = await service.finishRun(auth, "run-1");

    expect(result.run.status).toBe("COMPLETED");
    expect(result.run.bar.status).toBe("FABRIQUEE");
    expect(result.run.bar.qualityStatus).toBe("NON_CONFORME");
    expect(result.run.bar.items[0]?.productionStatus).toBe("FABRIQUEE");
    expect(transaction.cuttingBar.updateMany.mock.calls[0]?.[0].data).not.toHaveProperty(
      "qualityStatus",
    );
    expect(realtime.publish).toHaveBeenCalledTimes(2);
  });

  it("captures a tablet non-conformity without changing the piece production state", async () => {
    const runningRun = runRecord({
      runStatus: "RUNNING",
      barStatus: "LANCEE",
      unitStatus: "IN_PROGRESS",
      productionStatus: "LANCEE",
    });
    const reportedAt = new Date("2026-01-01T08:30:00Z");
    const row = {
      id: "nc-1",
      offerId: "offer-1",
      pieceId: "piece-1",
      pieceUnitId: "unit-1",
      cuttingBarId: "bar-1",
      productionRunId: "run-1",
      machineId: machine.id,
      reportedByOperatorId: auth.operator.id,
      reason: "DIMENSION",
      comment: "Longueur hors tolérance",
      status: "OPEN",
      reportedAt,
      pieceUnit: {
        sequenceNumber: 1,
        piece: { id: "piece-1", offerId: "offer-1", reference: "P-001" },
      },
      cuttingBar: { id: "bar-1", reference: "OFF42-B001" },
      offer: { id: "offer-1", reference: "OFF-2026-0042" },
      machine: { id: machine.id, name: machine.name },
      reportedByOperator: auth.operator,
    };
    const transaction = {
      productionRun: { findUnique: vi.fn().mockResolvedValue(runningRun) },
      machineSessionOperator: { findFirst: vi.fn().mockResolvedValue({ id: "membership-1" }) },
      nonConformity: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue(row),
      },
      pieceUnit: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
      cuttingBar: { updateMany: vi.fn() },
      historyEvent: { create: vi.fn() },
      user: { update: vi.fn() },
    };
    const prisma = {
      $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
      ),
      nonConformity: { findUnique: vi.fn().mockResolvedValue(row) },
    };
    const realtime = { publish: vi.fn() };
    const service = new TabletProductionService(
      prisma as never as PrismaService,
      realtime as never,
    );

    const result = await service.reportNonConformity(auth, "run-1", {
      pieceUnitId: "unit-1",
      reason: "DIMENSION",
      comment: "Longueur hors tolérance",
    });

    expect(result.nonConformity).toMatchObject({ id: "nc-1", pieceId: "piece-1", status: "OPEN" });
    expect(transaction.pieceUnit.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { qualityStatus: "NON_CONFORME", version: { increment: 1 } },
      }),
    );
    expect(transaction.nonConformity.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { pieceUnitId: "unit-1", status: "OPEN" },
      }),
    );
    expect(realtime.publish).toHaveBeenCalledWith(
      expect.objectContaining({ type: "quality.nonConformityReported" }),
    );
  });
});
