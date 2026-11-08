import { BadRequestException, ConflictException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PlanningService } from "../src/planning/planning.service";

const actor = {
  user: { id: "manager-1", username: "manager", displayName: "Manager", role: "PRODUCTION_MANAGER" as const },
  sessionId: "session-1",
  tokenHash: "token-hash",
};

const startAt = new Date("2026-11-06T08:00:00.000Z");
const endAt = new Date("2026-11-06T09:00:00.000Z");

type TestMembership = {
  id?: string;
  operatorId: string;
  role?: string;
  active: boolean;
  operator?: { id?: string; displayName: string };
};

type TestScheduleEvent = {
  id: string;
  type: string;
  status: string;
  title: string;
  machineId: string;
  startAt: Date;
  endAt: Date;
  operators: TestMembership[];
  [key: string]: unknown;
};

type TestEventWhere = {
  id?: { not: string };
  machineId?: string;
  startAt: { gt: Date };
  endAt: { lt: Date };
  operators?: { some: { operatorId: { in: string[] } } };
};

type TestCreateData = {
  type: string;
  title: string;
  notes: string | null;
  startAt: Date;
  endAt: Date;
  machineId: string;
  cuttingBarId: string | null;
  createdById: string;
  operators?: { create?: Array<{ operatorId: string; role: string }> };
};

function createHarness(options: {
  barStatus?: string;
  assignmentMachineId?: string | null;
  machineStatus?: string;
  events?: TestScheduleEvent[];
  commitLog?: string[];
} = {}) {
  const machine = {
    id: "machine-1", name: "CNC-01", internalNumber: "CNC-01", type: "Découpe",
    status: options.machineStatus ?? "ACTIVE",
  };
  const bar = {
    id: "bar-1", reference: "OFF-01-B001", profile: "IPE200", rawLengthMm: 6000,
    status: options.barStatus ?? "AFFECTEE",
    assignments: options.assignmentMachineId === null
      ? []
      : [{ id: "bar-assignment-1", machineId: options.assignmentMachineId ?? machine.id }],
    offer: { id: "offer-1", reference: "OFF-01", name: "Atelier Nord" },
  };
  const events = options.events ?? [];
  const commitLog = options.commitLog ?? [];
  const rawQueryCalls = vi.fn();
  const rawQueryArgs: unknown[] = [];
  let nextId = 0;
  let held = false;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (!held) { held = true; return; }
    await new Promise<void>((resolve) => waiters.push(resolve));
  };
  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else held = false;
  };

  const overlaps = (candidate: TestScheduleEvent, where: TestEventWhere) => {
    if (candidate.status !== "PLANNED") return false;
    if (where.id?.not && candidate.id === where.id.not) return false;
    if (where.machineId && candidate.machineId !== where.machineId) return false;
    if (candidate.startAt >= where.endAt.lt || candidate.endAt <= where.startAt.gt) return false;
    if (where.operators?.some) {
      const ids = where.operators.some.operatorId.in;
      return candidate.operators.some((membership) => membership.active && ids.includes(membership.operatorId));
    }
    return true;
  };

  const materialize = (data: TestCreateData): TestScheduleEvent => {
    const operatorCreates = data.operators?.create ?? [];
    const event = {
      id: `schedule-${++nextId}`,
      type: data.type,
      status: "PLANNED",
      title: data.title,
      notes: data.notes,
      startAt: data.startAt,
      endAt: data.endAt,
      machineId: data.machineId,
      cuttingBarId: data.cuttingBarId,
      createdById: data.createdById,
      updatedById: null,
      cancelledById: null,
      cancelledAt: null,
      createdAt: new Date("2026-11-01T10:00:00.000Z"),
      updatedAt: new Date("2026-11-01T10:00:00.000Z"),
      machine,
      cuttingBar: data.cuttingBarId ? bar : null,
      createdBy: { id: actor.user.id, displayName: actor.user.displayName },
      cancelledBy: null,
      operators: operatorCreates.map((membership) => ({
        id: `membership-${membership.operatorId}`,
        operatorId: membership.operatorId,
        role: membership.role,
        active: true,
        joinedAt: new Date("2026-11-01T10:00:00.000Z"),
        removedAt: null,
        operator: { id: membership.operatorId, displayName: membership.operatorId === "operator-1" ? "Lead Operator" : "Helper Operator" },
      })),
    };
    return event;
  };

  const transaction = {
    machine: { findUnique: vi.fn().mockResolvedValue(machine) },
    cuttingBar: { findUnique: vi.fn().mockResolvedValue(bar) },
    user: { findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) =>
      Promise.resolve(where.id.in.map((id) => ({ id }))),
    ) },
    scheduleEvent: {
      findFirst: vi.fn().mockImplementation(({ where }: { where: TestEventWhere }) =>
        Promise.resolve(events.find((event) => overlaps(event, where)) ?? null),
      ),
      create: vi.fn().mockImplementation(({ data }: { data: TestCreateData }) => {
        const event = materialize(data);
        events.push(event);
        return Promise.resolve(event);
      }),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    historyEvent: { create: vi.fn().mockResolvedValue({ id: "history-1" }) },
  };
  const prisma = {
    $transaction: vi.fn(async (callback: (tx: typeof transaction) => Promise<unknown>) => {
      let acquired = false;
      const tx = {
        ...transaction,
        $queryRaw: vi.fn(async (query: unknown) => {
          rawQueryArgs.push(query);
          rawQueryCalls();
          if (!acquired) { await acquire(); acquired = true; }
          return [];
        }),
      };
      try {
        const result = await callback(tx);
        commitLog.push("commit");
        return result;
      } finally {
        if (acquired) release();
      }
    }),
  };
  const realtime = { publish: vi.fn(() => commitLog.push("publish")) };
  const service = new PlanningService(prisma as never, realtime as never);
  return { service, prisma, transaction, realtime, events, commitLog, machine, bar, rawQueryCalls, rawQueryArgs };
}

function createBatchHarness(options: { existing?: TestScheduleEvent[] } = {}) {
  type BatchTestBar = {
    id: string;
    reference: string;
    profile: string;
    rawLengthMm: number;
    status: string;
    offerId: string;
    offer: { id: string; reference: string; name: string };
    assignments: Array<{
      id: string;
      machineId: string;
      assignedAt: Date;
      machine: { id: string; name: string; internalNumber: string; status: string };
    }>;
  };
  const offer = { id: "offer-1", reference: "OFF-01", name: "Atelier Nord" };
  const machine = { id: "machine-1", name: "CNC-01", internalNumber: "CNC-01", status: "ACTIVE" };
  const bars: BatchTestBar[] = ["bar-1", "bar-2"].map((id, index) => ({
    id,
    reference: `OFF-01-B00${index + 1}`,
    profile: "IPE200",
    rawLengthMm: 6000,
    status: "AFFECTEE",
    offerId: offer.id,
    offer,
    assignments: [{ id: `assignment-${id}`, machineId: machine.id, assignedAt: startAt, machine }],
  }));
  const events = options.existing ? [...options.existing] : [];
  const createdEvents: TestScheduleEvent[] = [];
  const commitLog: string[] = [];
  let nextId = 0;
  let held = false;
  const waiters: Array<() => void> = [];
  const acquire = async () => {
    if (!held) { held = true; return; }
    await new Promise<void>((resolve) => waiters.push(resolve));
  };
  const release = () => {
    const next = waiters.shift();
    if (next) next();
    else held = false;
  };
  const findBars = ({ where }: { where: { offerId?: string; id?: { in: string[] } } }) => Promise.resolve(
    bars.filter((bar) => bar.offerId === where.offerId
      && (!where.id || where.id.in.includes(bar.id))
      && bar.status === "AFFECTEE"
      && bar.assignments.length > 0
      && ![...events, ...createdEvents].some((event) => event.status === "PLANNED" && event.type === "PRODUCTION" && event.cuttingBarId === bar.id)),
  );
  const findOverlaps = ({ where }: { where: { startAt: { lt: Date }; endAt: { gt: Date }; OR?: Array<{ machineId?: { in: string[] }; operators?: { some: { operatorId: { in: string[] } } } }> } }) => Promise.resolve(
    [...events, ...createdEvents].filter((event) => {
      if (event.status !== "PLANNED" || event.startAt >= where.startAt.lt || event.endAt <= where.endAt.gt) return false;
      return where.OR?.some((condition) => {
        if (condition.machineId) return condition.machineId.in.includes(event.machineId);
        const operatorIds = condition.operators?.some.operatorId.in ?? [];
        return event.operators.some((membership) => membership.active && operatorIds.includes(membership.operatorId));
      }) ?? false;
    }).map((event) => ({
      ...event,
      machine: { id: "machine-1", name: "CNC-01", internalNumber: "CNC-01" },
    })),
  );
  const materialize = (data: TestCreateData) => {
    const bar = bars.find((item) => item.id === data.cuttingBarId)!;
    const event = {
      id: `batch-event-${++nextId}`,
      type: data.type,
      status: "PLANNED",
      title: data.title,
      notes: data.notes,
      startAt: data.startAt,
      endAt: data.endAt,
      machineId: data.machineId,
      cuttingBarId: data.cuttingBarId,
      createdById: data.createdById,
      updatedById: null,
      cancelledById: null,
      cancelledAt: null,
      createdAt: startAt,
      updatedAt: startAt,
      machine,
      cuttingBar: bar,
      createdBy: { id: actor.user.id, displayName: actor.user.displayName },
      cancelledBy: null,
      operators: (data.operators?.create ?? []).map((membership) => ({
        id: `membership-${membership.operatorId}`,
        operatorId: membership.operatorId,
        role: membership.role,
        active: true,
        joinedAt: startAt,
        removedAt: null,
        operator: { id: membership.operatorId, displayName: "Lead Operator" },
      })),
    };
    createdEvents.push(event);
    return Promise.resolve(event);
  };
  const transaction = {
    offer: { findUnique: vi.fn().mockResolvedValue(offer) },
    cuttingBar: { findMany: vi.fn(findBars) },
    user: { findMany: vi.fn().mockImplementation(({ where }: { where: { id: { in: string[] } } }) => Promise.resolve(where.id.in.map((id) => ({ id })))) },
    scheduleEvent: { findMany: vi.fn(findOverlaps), create: vi.fn().mockImplementation(({ data }: { data: TestCreateData }) => materialize(data)) },
    historyEvent: { create: vi.fn().mockImplementation(async () => ({ id: "history" })) },
  };
  const prisma = {
    offer: { findUnique: vi.fn().mockResolvedValue(offer) },
    cuttingBar: { findMany: vi.fn(findBars) },
    user: transaction.user,
    scheduleEvent: { findMany: vi.fn(findOverlaps) },
    $transaction: vi.fn(async (callback: (tx: typeof transaction & { $queryRaw: ReturnType<typeof vi.fn> }) => Promise<unknown>) => {
      let acquired = false;
      const tx = {
        ...transaction,
        $queryRaw: vi.fn(async () => { if (!acquired) { await acquire(); acquired = true; } return []; }),
      };
      try {
        const result = await callback(tx);
        commitLog.push("commit");
        return result;
      } finally {
        if (acquired) release();
      }
    }),
  };
  const realtime = { publish: vi.fn(() => commitLog.push("publish")) };
  return {
    service: new PlanningService(prisma as never, realtime as never),
    prisma,
    transaction,
    realtime,
    bars,
    events,
    createdEvents,
    commitLog,
  };
}

function productionInput(overrides: Record<string, unknown> = {}) {
  return {
    type: "PRODUCTION",
    startAt: startAt.toISOString(),
    endAt: endAt.toISOString(),
    machineId: "machine-1",
    cuttingBarId: "bar-1",
    leadOperatorId: "operator-1",
    helperOperatorIds: [],
    ...overrides,
  };
}

describe("PlanningService", () => {
  it("opens the calendar on the earliest planned event date in Tunis time", async () => {
    const startAt = new Date("2026-11-06T23:30:00.000Z");
    const findFirst = vi.fn().mockResolvedValue({ startAt });
    const prisma = { scheduleEvent: { findFirst }, offer: { findUnique: vi.fn() }, machine: { findUnique: vi.fn() } };
    const service = new PlanningService(prisma as never);

    await expect(service.getFirstEventDate({})).resolves.toEqual({ date: "2026-11-07", startAt: startAt.toISOString() });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PLANNED" },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: { startAt: true },
    }));
  });

  it("scopes the first event to the requested Affaire or machine", async () => {
    const findFirst = vi.fn().mockResolvedValue(null);
    const service = new PlanningService({
      scheduleEvent: { findFirst },
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1" }) },
      machine: { findUnique: vi.fn().mockResolvedValue({ id: "machine-1" }) },
    } as never);

    await expect(service.getFirstEventDate({ offerId: "offer-1", machineId: "machine-1" })).resolves.toEqual({ date: null, startAt: null });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { status: "PLANNED", type: "PRODUCTION", cuttingBar: { offerId: "offer-1" }, machineId: "machine-1" },
    }));
  });

  it("previews all eligible bars for an Affaire in deterministic slots and exposes conflicts without hiding bars", async () => {
    const conflictEvent: TestScheduleEvent = {
      id: "existing-block", type: "MAINTENANCE", status: "PLANNED", title: "Maintenance",
      machineId: "machine-1", startAt: new Date("2026-11-06T08:30:00.000Z"), endAt: new Date("2026-11-06T08:45:00.000Z"), operators: [],
    };
    const harness = createBatchHarness({ existing: [conflictEvent] });
    const result = await harness.service.previewBatch({
      offerId: "offer-1", startAt: startAt.toISOString(), durationMinutes: 60, gapMinutes: 15,
      leadOperatorId: "operator-1", helperOperatorIds: [],
    });

    expect(result.bars).toHaveLength(2);
    expect(result.bars[0]).toMatchObject({ id: "bar-1", selectable: true, startAt: startAt.toISOString() });
    expect(result.bars[1]?.startAt).toBe("2026-11-06T09:15:00.000Z");
    expect(result.conflicts).toMatchObject([{
      barId: "bar-1",
      reason: "MACHINE_OVERLAP",
      resourceType: "MACHINE",
      resourceLabel: "CNC-01 · CNC-01",
      conflictingEventStartAt: "2026-11-06T08:30:00.000Z",
    }]);
  });

  it("identifies an operator reservation when the machine itself is free", async () => {
    const conflictEvent: TestScheduleEvent = {
      id: "other-machine-event", type: "PRODUCTION", status: "PLANNED", title: "OFF-02-B004",
      machineId: "machine-2", startAt: new Date("2026-11-06T08:15:00.000Z"), endAt: new Date("2026-11-06T08:45:00.000Z"),
      operators: [{ operatorId: "operator-1", role: "LEAD", active: true, operator: { displayName: "Amine" } }],
    };
    const harness = createBatchHarness({ existing: [conflictEvent] });
    const result = await harness.service.previewBatch({
      offerId: "offer-1", startAt: startAt.toISOString(), durationMinutes: 60, gapMinutes: 0,
      leadOperatorId: "operator-1", helperOperatorIds: [],
    });

    expect(result.conflicts[0]).toMatchObject({
      reason: "OPERATOR_OVERLAP",
      resourceType: "OPERATOR",
      resourceLabel: "Amine",
      conflictingBarReference: null,
    });
  });

  it("returns planned bars for the selected Affair and Tunis calendar day", async () => {
    const scheduledEvent = {
      id: "scheduled-1",
      title: "OFF-01-B001",
      startAt: new Date("2026-11-06T08:00:00.000Z"),
      endAt: new Date("2026-11-06T09:00:00.000Z"),
      machine: { id: "machine-1", name: "CNC-01", internalNumber: "CNC-01" },
      cuttingBar: { id: "bar-1", reference: "OFF-01-B001", profile: "IPE200" },
      operators: [{ role: "LEAD", operator: { id: "operator-1", displayName: "Amine" } }],
    };
    const findMany = vi.fn().mockResolvedValue([scheduledEvent]);
    const prisma = {
      offer: { findUnique: vi.fn().mockResolvedValue({ id: "offer-1", reference: "OFF-01", name: "Atelier Nord" }) },
      scheduleEvent: { findMany },
    };
    const service = new PlanningService(prisma as never);

    const result = await service.getOfferDay("offer-1", { date: "2026-11-06" });

    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({
        type: "PRODUCTION",
        status: "PLANNED",
        cuttingBar: { offerId: "offer-1" },
        startAt: { lt: new Date("2026-11-06T23:00:00.000Z") },
        endAt: { gt: new Date("2026-11-05T23:00:00.000Z") },
      }),
    }));
    expect(result.events).toMatchObject([{
      id: "scheduled-1",
      bar: { reference: "OFF-01-B001", profile: "IPE200" },
      machine: { internalNumber: "CNC-01" },
      operators: [{ id: "operator-1", displayName: "Amine", role: "LEAD" }],
    }]);
  });

  it("creates one event and history record per selected bar, then publishes after commit", async () => {
    const harness = createBatchHarness();
    const result = await harness.service.createBatch(actor, {
      offerId: "offer-1", cuttingBarIds: ["bar-1", "bar-2"], startAt: startAt.toISOString(),
      durationMinutes: 45, gapMinutes: 10, leadOperatorId: "operator-1", helperOperatorIds: ["operator-2"],
    });

    expect(result.events).toHaveLength(2);
    expect(result.events.map((event) => event.bar?.id)).toEqual(["bar-1", "bar-2"]);
    expect(result.events[1]?.startAt).toBe("2026-11-06T08:55:00.000Z");
    expect(harness.transaction.historyEvent.create).toHaveBeenCalledTimes(2);
    expect(harness.transaction.scheduleEvent.create).toHaveBeenCalledTimes(2);
    expect(harness.commitLog).toEqual(["commit", "publish"]);
    expect(harness.realtime.publish).toHaveBeenCalledTimes(1);
  });

  it("rejects an overlapping batch atomically without creating events or publishing", async () => {
    const conflictEvent: TestScheduleEvent = {
      id: "existing-block", type: "MACHINE_BLOCK", status: "PLANNED", title: "Machine indisponible",
      machineId: "machine-1", startAt, endAt, operators: [],
    };
    const harness = createBatchHarness({ existing: [conflictEvent] });
    await expect(harness.service.createBatch(actor, {
      offerId: "offer-1", cuttingBarIds: ["bar-1", "bar-2"], startAt: startAt.toISOString(),
      durationMinutes: 60, gapMinutes: 0, leadOperatorId: "operator-1", helperOperatorIds: [],
    })).rejects.toMatchObject({ response: { code: "SCHEDULE_MACHINE_OVERLAP" } });

    expect(harness.transaction.scheduleEvent.create).not.toHaveBeenCalled();
    expect(harness.transaction.historyEvent.create).not.toHaveBeenCalled();
    expect(harness.createdEvents).toHaveLength(0);
    expect(harness.realtime.publish).not.toHaveBeenCalled();
  });

  it("serializes competing batch requests for the same bar", async () => {
    const harness = createBatchHarness();
    const request = () => harness.service.createBatch(actor, {
      offerId: "offer-1", cuttingBarIds: ["bar-1"], startAt: startAt.toISOString(),
      durationMinutes: 60, gapMinutes: 0, leadOperatorId: "operator-1", helperOperatorIds: [],
    });
    const outcomes = await Promise.allSettled([request(), request()]);

    expect(outcomes.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(outcomes.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(harness.createdEvents).toHaveLength(1);
    expect(harness.transaction.historyEvent.create).toHaveBeenCalledTimes(1);
    expect(harness.realtime.publish).toHaveBeenCalledTimes(1);
  });

  it("limits an Affaire planning board to that Affaire's machines and bars", async () => {
    const eventFindMany = vi.fn()
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);
    const prisma = {
      offer: {
        findUnique: vi.fn().mockResolvedValue({ id: "offer-1" }),
        findMany: vi.fn().mockResolvedValue([{ id: "offer-1", reference: "OFF-01", name: "Atelier Nord" }]),
      },
      machineBarAssignment: { findMany: vi.fn().mockResolvedValue([{ machineId: "machine-1" }]) },
      scheduleEvent: { findMany: eventFindMany },
      cuttingBar: { count: vi.fn().mockResolvedValue(1), findMany: vi.fn().mockResolvedValue([]) },
      machine: { findMany: vi.fn().mockResolvedValue([{ id: "machine-1" }]) },
      user: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const service = new PlanningService(prisma as never);

    const board = await service.getBoard({
      startAt: "2026-11-01T00:00:00.000Z",
      endAt: "2026-12-01T00:00:00.000Z",
      offerId: "offer-1",
    });

    expect(board.machines).toHaveLength(1);
    expect(prisma.machine.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["machine-1"] } } }));
    expect(prisma.cuttingBar.count).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ offerId: "offer-1" }) }));
    expect(eventFindMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: expect.objectContaining({ AND: expect.arrayContaining([
        expect.objectContaining({ OR: expect.arrayContaining([
          expect.objectContaining({ cuttingBar: { offerId: "offer-1" } }),
        ]) }),
      ]) }),
    }));
  });

  it("schedules only an assigned bar on its existing machine and audits before publishing", async () => {
    const harness = createHarness();
    const result = await harness.service.createEvent(actor, productionInput());

    expect(result.event).toMatchObject({
      type: "PRODUCTION",
      machine: { id: "machine-1" },
      bar: { id: "bar-1", status: "AFFECTEE" },
      operators: [{ id: "operator-1", role: "LEAD", active: true }],
    });
    expect(harness.rawQueryCalls).toHaveBeenCalled();
    expect(harness.rawQueryArgs.some((query) => (query as { sql: string }).sql.includes("::text"))).toBe(true);
    expect(harness.transaction.historyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "SCHEDULE_EVENT_CREATED", entityType: "SCHEDULE_EVENT" }),
    }));
    expect(harness.commitLog).toEqual(["commit", "publish"]);
  });

  it.each([
    ["shaped but not assigned bar", { assignmentMachineId: null }],
    ["bar assigned to a different machine", { assignmentMachineId: "machine-2" }],
    ["bar whose production already started", { barStatus: "LANCEE" }],
  ])("rejects a %s without persisting or publishing", async (_label, options) => {
    const harness = createHarness(options);
    await expect(harness.service.createEvent(actor, productionInput())).rejects.toBeInstanceOf(ConflictException);
    expect(harness.transaction.scheduleEvent.create).not.toHaveBeenCalled();
    expect(harness.transaction.historyEvent.create).not.toHaveBeenCalled();
    expect(harness.realtime.publish).not.toHaveBeenCalled();
  });

  it("rejects overlapping machine events and separately protects operator schedules", async () => {
    const existing = {
      id: "existing-1", type: "MACHINE_BLOCK", status: "PLANNED", title: "Maintenance",
      machineId: "machine-1", startAt, endAt,
      operators: [],
    };
    const machineConflict = createHarness({ events: [existing] });
    await expect(machineConflict.service.createEvent(actor, {
      type: "MACHINE_BLOCK", title: "Inspection", startAt: startAt.toISOString(), endAt: endAt.toISOString(), machineId: "machine-1",
    })).rejects.toMatchObject({ response: { code: "SCHEDULE_MACHINE_OVERLAP" } });
    expect(machineConflict.transaction.scheduleEvent.create).not.toHaveBeenCalled();

    const operatorOnlyConflict = createHarness({ events: [{ ...existing, machineId: "machine-2", operators: [{ operatorId: "operator-1", active: true, operator: { displayName: "Lead Operator" } }] }] });
    await expect(operatorOnlyConflict.service.createEvent(actor, productionInput())).rejects.toMatchObject({ response: { code: "SCHEDULE_OPERATOR_OVERLAP" } });
    expect(operatorOnlyConflict.transaction.scheduleEvent.create).not.toHaveBeenCalled();
  });

  it("serializes competing schedules on the same machine so only one overlapping event commits", async () => {
    const harness = createHarness();
    const results = await Promise.allSettled([
      harness.service.createEvent(actor, productionInput()),
      harness.service.createEvent(actor, productionInput({ cuttingBarId: "bar-2", leadOperatorId: "operator-2" })),
    ]);

    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")).toHaveLength(1);
    expect(harness.events).toHaveLength(1);
    expect(harness.transaction.historyEvent.create).toHaveBeenCalledTimes(1);
    expect(harness.realtime.publish).toHaveBeenCalledTimes(1);
  });

  it("rejects operator roster changes on maintenance and machine-block events", async () => {
    const harness = createHarness();
    harness.transaction.scheduleEvent.findUnique.mockResolvedValue({
      id: "schedule-maintenance",
      type: "MAINTENANCE",
      status: "PLANNED",
      title: "Inspection",
      machineId: "machine-1",
      startAt,
      endAt,
      operators: [],
    });

    await expect(harness.service.updateEvent(actor, "schedule-maintenance", {
      leadOperatorId: "operator-1",
    })).rejects.toBeInstanceOf(BadRequestException);

    expect(harness.transaction.scheduleEvent.update).not.toHaveBeenCalled();
    expect(harness.transaction.historyEvent.create).not.toHaveBeenCalled();
    expect(harness.realtime.publish).not.toHaveBeenCalled();
  });

  it("cancels an obsolete planned slot after work starts without touching production state", async () => {
    const harness = createHarness({ barStatus: "LANCEE" });
    const existing = {
      id: "schedule-1", type: "PRODUCTION", status: "PLANNED", title: "Production · OFF-01-B001",
      notes: null, startAt, endAt, machineId: "machine-1", cuttingBarId: "bar-1", createdById: actor.user.id,
      updatedById: null, cancelledById: null, cancelledAt: null, createdAt: startAt, updatedAt: startAt,
      machine: harness.machine, cuttingBar: { ...harness.bar, status: "LANCEE" },
      createdBy: { id: actor.user.id, displayName: "Manager" }, cancelledBy: null,
      operators: [{ id: "membership-operator-1", operatorId: "operator-1", role: "LEAD", active: true, joinedAt: startAt, removedAt: null, operator: { id: "operator-1", displayName: "Lead Operator" } }],
    };
    harness.transaction.scheduleEvent.findUnique.mockResolvedValue(existing);
    harness.transaction.scheduleEvent.update.mockImplementation(({ data }: { data: Record<string, unknown> }) => Promise.resolve({
      ...existing,
      ...data,
      status: "CANCELLED",
      cancelledAt: endAt,
      cancelledBy: { id: actor.user.id, displayName: "Manager" },
      operators: existing.operators.map((membership) => ({ ...membership, active: false, removedAt: endAt })),
    }));

    const result = await harness.service.cancelEvent(actor, existing.id);
    expect(result.event.status).toBe("CANCELLED");
    expect(harness.transaction.cuttingBar.findUnique).not.toHaveBeenCalled();
    expect(harness.transaction.historyEvent.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ eventType: "SCHEDULE_EVENT_CANCELLED", entityId: existing.id }),
    }));
    expect(harness.commitLog).toEqual(["commit", "publish"]);
  });
});
