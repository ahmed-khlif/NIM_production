import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { randomUUID } from "node:crypto";
import type {
  ScheduleEvent as PrismaScheduleEvent,
  ScheduleEventStatus,
  MachineStatus,
  Prisma as PrismaTypes,
} from "@prisma/client";
import {
  createScheduleEventSchema,
  createScheduleBatchSchema,
  scheduleBoardQuerySchema,
  scheduleFirstEventDateQuerySchema,
  scheduleBatchPreviewSchema,
  scheduleOfferDayQuerySchema,
  updateScheduleEventSchema,
} from "@nim/validation";
import type { ManagedScheduleBatchBar, ManagedScheduleEvent, ScheduleBatchPreview, ScheduleBoard, ScheduleOfferDay } from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";
import { RealtimeService } from "../realtime/realtime.service";

const boardEventInclude = {
  machine: { select: { id: true, name: true, internalNumber: true, status: true } },
  cuttingBar: {
    select: {
      id: true,
      reference: true,
      profile: true,
      rawLengthMm: true,
      status: true,
      offer: { select: { id: true, reference: true, name: true } },
    },
  },
  operators: {
    where: { active: true },
    orderBy: { role: "asc" },
    include: { operator: { select: { id: true, displayName: true } } },
  },
  createdBy: { select: { id: true, displayName: true } },
  cancelledBy: { select: { id: true, displayName: true } },
} satisfies PrismaTypes.ScheduleEventInclude;

const detailEventInclude = {
  ...boardEventInclude,
  operators: {
    orderBy: { joinedAt: "asc" },
    include: { operator: { select: { id: true, displayName: true } } },
  },
} satisfies PrismaTypes.ScheduleEventInclude;

type EventWithRelations = PrismaTypes.ScheduleEventGetPayload<{ include: typeof detailEventInclude }>;

type ScheduleTeam = {
  leadOperatorId?: string;
  helperOperatorIds: string[];
};

type BatchCandidate = {
  id: string;
  reference: string;
  profile: string;
  rawLengthMm: number;
  offer: { id: string; reference: string; name: string };
  assignments: Array<{
    machineId: string;
    assignedAt: Date;
    machine: { id: string; name: string; internalNumber: string; status: MachineStatus };
  }>;
};

type BatchSlot = {
  candidate: BatchCandidate;
  startAt: Date;
  endAt: Date;
};

function badInput(message: string, details?: unknown): BadRequestException {
  return new BadRequestException({ code: "VALIDATION_ERROR", message, ...(details ? { details } : {}) });
}

function mapEvent(event: EventWithRelations, activeOnly = false): ManagedScheduleEvent {
  const operators = activeOnly ? event.operators.filter((membership) => membership.active) : event.operators;
  return {
    id: event.id,
    type: event.type,
    status: event.status,
    title: event.title,
    notes: event.notes,
    startAt: event.startAt.toISOString(),
    endAt: event.endAt.toISOString(),
    cancelledAt: event.cancelledAt?.toISOString() ?? null,
    createdAt: event.createdAt.toISOString(),
    updatedAt: event.updatedAt.toISOString(),
    machine: {
      id: event.machine.id,
      name: event.machine.name,
      internalNumber: event.machine.internalNumber,
      status: event.machine.status,
    },
    bar: event.cuttingBar
      ? {
          id: event.cuttingBar.id,
          reference: event.cuttingBar.reference,
          profile: event.cuttingBar.profile,
          rawLengthMm: event.cuttingBar.rawLengthMm,
          status: event.cuttingBar.status,
          offer: event.cuttingBar.offer,
        }
      : null,
    operators: operators.map((membership) => ({
      id: membership.operator.id,
      displayName: membership.operator.displayName,
      role: membership.role,
      active: membership.active,
    })),
    createdBy: event.createdBy,
    cancelledBy: event.cancelledBy,
  };
}

@Injectable()
export class PlanningService {
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimeService) private readonly realtime?: RealtimeService,
  ) {}

  async getFirstEventDate(input: unknown): Promise<{ date: string | null; startAt: string | null }> {
    const parsed = scheduleFirstEventDateQuerySchema.safeParse(input);
    if (!parsed.success) throw badInput("Les filtres du planning sont invalides.", parsed.error.flatten());
    const { offerId, machineId } = parsed.data;
    if (offerId && !(await this.prisma.offer.findUnique({ where: { id: offerId }, select: { id: true } }))) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Affaire introuvable." });
    }
    if (machineId && !(await this.prisma.machine.findUnique({ where: { id: machineId }, select: { id: true } }))) {
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
    }

    const event = await this.prisma.scheduleEvent.findFirst({
      where: {
        status: "PLANNED",
        ...(offerId ? { type: "PRODUCTION", cuttingBar: { offerId } } : {}),
        ...(machineId ? { machineId } : {}),
      },
      orderBy: [{ startAt: "asc" }, { id: "asc" }],
      select: { startAt: true },
    });
    if (!event) return { date: null, startAt: null };

    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Tunis",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(event.startAt);
    const part = (type: "year" | "month" | "day") => parts.find((item) => item.type === type)?.value ?? "";
    return { date: `${part("year")}-${part("month")}-${part("day")}`, startAt: event.startAt.toISOString() };
  }

  async getBoard(input: unknown): Promise<ScheduleBoard> {
    const parsed = scheduleBoardQuerySchema.safeParse(input);
    if (!parsed.success) throw badInput("Les filtres du planning sont invalides.", parsed.error.flatten());
    const query = parsed.data;
    if (query.offerId && !(await this.prisma.offer.findUnique({ where: { id: query.offerId }, select: { id: true } }))) {
      throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Affaire introuvable." });
    }

    let offerMachineIds: string[] | undefined;
    if (query.offerId) {
      const [assignedMachines, scheduledMachines] = await Promise.all([
        this.prisma.machineBarAssignment.findMany({
          where: { active: true, cuttingBar: { offerId: query.offerId } },
          select: { machineId: true },
          distinct: ["machineId"],
        }),
        this.prisma.scheduleEvent.findMany({
          where: { cuttingBar: { offerId: query.offerId } },
          select: { machineId: true },
          distinct: ["machineId"],
        }),
      ]);
      offerMachineIds = [...new Set([...assignedMachines, ...scheduledMachines].map((row) => row.machineId))];
      if (query.machineId) offerMachineIds = offerMachineIds.includes(query.machineId) ? [query.machineId] : [];
    }

    const machineWhere: PrismaTypes.MachineWhereInput = query.machineId
      ? { id: query.machineId }
      : offerMachineIds
        ? { id: { in: offerMachineIds } }
        : {};
    const eventConditions: PrismaTypes.ScheduleEventWhereInput[] = [
      { startAt: { lt: new Date(query.endAt) }, endAt: { gt: new Date(query.startAt) } },
    ];
    if (query.status !== "ALL") eventConditions.push({ status: query.status as ScheduleEventStatus });
    if (query.machineId) eventConditions.push({ machineId: query.machineId });
    if (query.operatorId) {
      eventConditions.push({ operators: { some: { operatorId: query.operatorId, active: true } } });
    }
    if (query.offerId) {
      eventConditions.push({
        OR: [
          { cuttingBar: { offerId: query.offerId } },
          { type: { in: ["MAINTENANCE", "MACHINE_BLOCK"] }, machineId: { in: offerMachineIds ?? [] } },
        ],
      });
    }
    if (query.search) {
      eventConditions.push({
        OR: [
          { title: { contains: query.search, mode: "insensitive" } },
          { notes: { contains: query.search, mode: "insensitive" } },
          { machine: { name: { contains: query.search, mode: "insensitive" } } },
          { machine: { internalNumber: { contains: query.search, mode: "insensitive" } } },
          { cuttingBar: { reference: { contains: query.search, mode: "insensitive" } } },
          { cuttingBar: { profile: { contains: query.search, mode: "insensitive" } } },
          { cuttingBar: { offer: { reference: { contains: query.search, mode: "insensitive" } } } },
        ],
      });
    }
    const events = await this.prisma.scheduleEvent.findMany({
      where: { AND: eventConditions },
      include: boardEventInclude,
      orderBy: [{ machine: { internalNumber: "asc" } }, { startAt: "asc" }, { id: "asc" }],
    });

    const barWhere: PrismaTypes.CuttingBarWhereInput = {
      status: "AFFECTEE",
      assignments: {
        some: {
          active: true,
          ...(query.machineId ? { machineId: query.machineId } : {}),
        },
      },
      scheduleEvents: { none: { type: "PRODUCTION", status: "PLANNED" } },
      ...(query.offerId ? { offerId: query.offerId } : {}),
      ...(query.search
        ? {
            OR: [
              { reference: { contains: query.search, mode: "insensitive" } },
              { profile: { contains: query.search, mode: "insensitive" } },
              { offer: { reference: { contains: query.search, mode: "insensitive" } } },
              { offer: { name: { contains: query.search, mode: "insensitive" } } },
            ],
          }
        : {}),
    };
    const unscheduledSkip = (query.unscheduledPage - 1) * query.pageSize;
    const [barCount, bars, machines, offers, operators] = await Promise.all([
      this.prisma.cuttingBar.count({ where: barWhere }),
      this.prisma.cuttingBar.findMany({
        where: barWhere,
        include: {
          offer: { select: { id: true, reference: true, name: true } },
          assignments: {
            where: { active: true },
            take: 1,
            orderBy: { assignedAt: "desc" },
            select: {
              machineId: true,
              assignedAt: true,
              machine: { select: { id: true, name: true, internalNumber: true, status: true } },
            },
          },
        },
        orderBy: [{ offer: { reference: "asc" } }, { profile: "asc" }, { reference: "asc" }],
        skip: unscheduledSkip,
        take: query.pageSize,
      }),
      this.prisma.machine.findMany({
        where: machineWhere,
        select: { id: true, name: true, internalNumber: true, type: true, status: true },
        orderBy: [{ internalNumber: "asc" }, { name: "asc" }],
      }),
      this.prisma.offer.findMany({
        where: {
          OR: [
            { bars: { some: { assignments: { some: { active: true } } } } },
            { bars: { some: { scheduleEvents: { some: { status: "PLANNED" } } } } },
            ...(query.offerId ? [{ id: query.offerId }] : []),
          ],
        },
        select: { id: true, reference: true, name: true },
        orderBy: { reference: "desc" },
      }),
      this.prisma.user.findMany({
        where: { role: "OPERATOR", isActive: true },
        select: { id: true, displayName: true },
        orderBy: [{ displayName: "asc" }, { id: "asc" }],
      }),
    ]);

    return {
      events: events.map((event) => mapEvent(event as EventWithRelations, true)),
      machines,
      offers,
      operators,
      unscheduledBars: bars.flatMap((bar) => {
        const assignment = bar.assignments[0];
        return assignment
          ? [{
              id: bar.id,
              reference: bar.reference,
              profile: bar.profile,
              rawLengthMm: bar.rawLengthMm,
              offer: bar.offer,
              machine: assignment.machine,
              assignedAt: assignment.assignedAt.toISOString(),
            }]
          : [];
      }),
      unscheduledPagination: {
        page: query.unscheduledPage,
        pageSize: query.pageSize,
        total: barCount,
        totalPages: Math.max(1, Math.ceil(barCount / query.pageSize)),
      },
      range: { startAt: query.startAt, endAt: query.endAt, timeZone: "Africa/Tunis" },
    };
  }

  async getEvent(id: string): Promise<{ event: ManagedScheduleEvent }> {
    const event = await this.prisma.scheduleEvent.findUnique({ where: { id }, include: detailEventInclude });
    if (!event) throw new NotFoundException({ code: "SCHEDULE_EVENT_NOT_FOUND", message: "Événement introuvable." });
    return { event: mapEvent(event) };
  }

  async getOfferDay(offerId: string, input: unknown): Promise<ScheduleOfferDay> {
    const parsed = scheduleOfferDayQuerySchema.safeParse(input);
    if (!parsed.success) throw badInput("La date du planning est invalide.", parsed.error.flatten());
    const offer = await this.prisma.offer.findUnique({
      where: { id: offerId },
      select: { id: true, reference: true, name: true },
    });
    if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Affaire introuvable." });

    const startAt = this.tunisDateStart(parsed.data.date);
    const nextDate = new Date(`${parsed.data.date}T00:00:00.000Z`);
    nextDate.setUTCDate(nextDate.getUTCDate() + 1);
    const endAt = this.tunisDateStart(nextDate.toISOString().slice(0, 10));
    const events = await this.prisma.scheduleEvent.findMany({
      where: {
        type: "PRODUCTION",
        status: "PLANNED",
        cuttingBar: { offerId },
        startAt: { lt: endAt },
        endAt: { gt: startAt },
      },
      include: {
        machine: { select: { id: true, name: true, internalNumber: true } },
        cuttingBar: { select: { id: true, reference: true, profile: true } },
        operators: {
          where: { active: true },
          orderBy: { role: "asc" },
          include: { operator: { select: { id: true, displayName: true } } },
        },
      },
      orderBy: [{ startAt: "asc" }, { machine: { internalNumber: "asc" } }],
    });
    return {
      offer,
      date: parsed.data.date,
      events: events.map((event) => ({
        id: event.id,
        title: event.title,
        startAt: event.startAt.toISOString(),
        endAt: event.endAt.toISOString(),
        machine: event.machine,
        bar: event.cuttingBar,
        operators: event.operators.map((membership) => ({
          id: membership.operator.id,
          displayName: membership.operator.displayName,
          role: membership.role,
        })),
      })),
    };
  }

  async createEvent(actor: AuthContext, input: unknown): Promise<{ event: ManagedScheduleEvent }> {
    const parsed = createScheduleEventSchema.safeParse(input);
    if (!parsed.success) throw badInput("Vérifiez les informations de planification.", parsed.error.flatten());
    const data = parsed.data;
    const startAt = new Date(data.startAt);
    const endAt = new Date(data.endAt);
    const team = this.teamForCreate(data);
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        const machine = await transaction.machine.findUnique({ where: { id: data.machineId } });
        if (!machine) throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
        if (machine.status === "INACTIVE") {
          throw new ConflictException({ code: "MACHINE_INACTIVE", message: "Une machine inactive ne peut pas être planifiée." });
        }
        if (data.type === "PRODUCTION" && machine.status !== "ACTIVE") {
          throw new ConflictException({ code: "MACHINE_IN_MAINTENANCE", message: "Une machine en maintenance ne peut pas recevoir de planification de production." });
        }

        if (data.type === "PRODUCTION") {
          await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "CuttingBar" WHERE "id" = ${data.cuttingBarId!} FOR UPDATE`);
        }
        const bar = data.type === "PRODUCTION" ? await this.getEligibleBar(transaction, data.cuttingBarId!, data.machineId) : null;
        await this.validateTeam(transaction, team);
        await this.lockResources(transaction, data.machineId, this.operatorIds(team));
        await this.assertNoOverlap(transaction, data.machineId, startAt, endAt, this.operatorIds(team));

        const created = await transaction.scheduleEvent.create({
          data: {
            type: data.type,
            title: data.title?.trim() || (bar ? `Production · ${bar.reference}` : ""),
            notes: data.notes?.trim() || null,
            startAt,
            endAt,
            machineId: data.machineId,
            cuttingBarId: bar?.id ?? null,
            createdById: actor.user.id,
            operators: team.leadOperatorId
              ? {
                  create: [
                    { operatorId: team.leadOperatorId, role: "LEAD" },
                    ...team.helperOperatorIds.map((operatorId) => ({ operatorId, role: "HELPER" as const })),
                  ],
                }
              : undefined,
          },
          include: detailEventInclude,
        });
        await transaction.historyEvent.create({
          data: {
            eventType: "SCHEDULE_EVENT_CREATED",
            entityType: "SCHEDULE_EVENT",
            entityId: created.id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              eventType: created.type,
              title: created.title,
              machineId: machine.id,
              cuttingBarId: bar?.id ?? null,
              barReference: bar?.reference ?? null,
              startAt: startAt.toISOString(),
              endAt: endAt.toISOString(),
              leadOperatorId: team.leadOperatorId ?? null,
              helperOperatorIds: team.helperOperatorIds,
            },
          },
        });
        // Build the response while the transaction is still open. If mapping
        // ever fails, the event and its audit record roll back together.
        return { event: created, mappedEvent: mapEvent(created) };
      }, { maxWait: 10_000, timeout: 15_000 });

      this.publish(result.event, actor.user.id, "schedule.created");
      return { event: result.mappedEvent };
    } catch (error) {
      this.mapUniqueConflict(error);
      throw error;
    }
  }

  async previewBatch(input: unknown): Promise<ScheduleBatchPreview> {
    const parsed = scheduleBatchPreviewSchema.safeParse(input);
    if (!parsed.success) throw badInput("VÃ©rifiez les paramÃ¨tres de planification groupÃ©e.", parsed.error.flatten());
    const data = parsed.data;
    const offer = await this.prisma.offer.findUnique({
      where: { id: data.offerId },
      select: { id: true, reference: true, name: true },
    });
    if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Affaire introuvable." });

    const candidates = await this.getBatchCandidates(this.prisma, data.offerId, data.cuttingBarIds);
    if (candidates.length > 500) {
      throw badInput("Cette Affaire contient plus de 500 barres Ã  planifier. Filtrez et planifiez-la en plusieurs groupes.");
    }
    if (data.cuttingBarIds && candidates.length !== data.cuttingBarIds.length) {
      throw new ConflictException({ code: "BATCH_BARS_CHANGED", message: "Certaines barres ne sont plus disponibles pour cette Affaire. Actualisez la liste avant de continuer." });
    }
    const team: ScheduleTeam = { leadOperatorId: data.leadOperatorId, helperOperatorIds: data.helperOperatorIds };
    await this.validateTeam(this.prisma, team);
    const slots = this.buildBatchSlots(candidates.filter((candidate) => candidate.assignments.length === 1 && candidate.assignments[0]!.machine.status === "ACTIVE"), data.startAt, data.durationMinutes, data.gapMinutes);
    const conflicts = await this.findBatchConflicts(this.prisma, slots, this.operatorIds(team));
    const slotsById = new Map(slots.map((slot) => [slot.candidate.id, slot]));
    const conflictsByBar = new Set(conflicts.map((conflict) => conflict.barId));
    return {
      offer,
      startAt: data.startAt,
      durationMinutes: data.durationMinutes,
      gapMinutes: data.gapMinutes,
      bars: candidates.map((candidate): ManagedScheduleBatchBar => {
        const slot = slotsById.get(candidate.id);
        const blockedReason = candidate.assignments.length !== 1
          ? "La barre doit avoir une affectation machine active unique."
          : candidate.assignments[0]!.machine.status !== "ACTIVE"
            ? "La machine n’est pas disponible pour la production."
            : conflictsByBar.has(candidate.id)
              ? "Un conflit de machine ou d’équipe existe sur ce créneau."
              : null;
        const assignment = candidate.assignments[0]!;
        return {
          id: candidate.id,
          reference: candidate.reference,
          profile: candidate.profile,
          rawLengthMm: candidate.rawLengthMm,
          offer: candidate.offer,
          machine: assignment.machine,
          assignedAt: assignment.assignedAt.toISOString(),
          startAt: slot?.startAt.toISOString() ?? null,
          endAt: slot?.endAt.toISOString() ?? null,
          // Conflicts stay selectable so the planner can remove them from the batch.
          selectable: Boolean(slot),
          blockedReason,
        };
      }),
      conflicts,
    };
  }

  async createBatch(actor: AuthContext, input: unknown): Promise<{ batchId: string; events: ManagedScheduleEvent[] }> {
    const parsed = createScheduleBatchSchema.safeParse(input);
    if (!parsed.success) throw badInput("VÃ©rifiez les barres et les crÃ©neaux du lot.", parsed.error.flatten());
    const data = parsed.data;
    const team: ScheduleTeam = { leadOperatorId: data.leadOperatorId, helperOperatorIds: data.helperOperatorIds };
    const batchId = randomUUID();
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`
          SELECT "id" FROM "CuttingBar"
          WHERE "id" IN (${Prisma.join(data.cuttingBarIds)})
          ORDER BY "id" FOR UPDATE
        `);
        const offer = await transaction.offer.findUnique({
          where: { id: data.offerId },
          select: { id: true, reference: true, name: true },
        });
        if (!offer) throw new NotFoundException({ code: "OFFER_NOT_FOUND", message: "Affaire introuvable." });

        const candidates = await this.getBatchCandidates(transaction, data.offerId, data.cuttingBarIds);
        if (candidates.length !== data.cuttingBarIds.length) {
          throw new ConflictException({ code: "BATCH_BARS_CHANGED", message: "Certaines barres ne sont plus disponibles pour cette Affaire. Actualisez l’aperçu avant de confirmer." });
        }
        const unavailable = candidates.find((candidate) => candidate.assignments.length !== 1 || candidate.assignments[0]!.machine.status !== "ACTIVE");
        if (unavailable) {
          throw new ConflictException({
            code: "BATCH_MACHINE_UNAVAILABLE",
            message: `La barre ${unavailable.reference} n’a plus de machine disponible. Actualisez l’aperçu et retirez-la du lot.`,
          });
        }
        await this.validateTeam(transaction, team);
        const machineIds = candidates.map((candidate) => candidate.assignments[0]!.machineId);
        await this.lockBatchResources(transaction, machineIds, this.operatorIds(team));
        const slots = this.buildBatchSlots(candidates, data.startAt, data.durationMinutes, data.gapMinutes);
        const conflicts = await this.findBatchConflicts(transaction, slots, this.operatorIds(team));
        if (conflicts.length) {
          const first = conflicts[0]!;
          throw new ConflictException({
            code: first.reason === "MACHINE_OVERLAP" ? "SCHEDULE_MACHINE_OVERLAP" : "SCHEDULE_OPERATOR_OVERLAP",
            message: `${conflicts.length} barre(s) du lot ont un conflit de planification. Premier conflit : ${first.barReference} · ${first.eventTitle}.`,
            details: { conflicts },
          });
        }

        const createdEvents: EventWithRelations[] = [];
        for (const slot of slots) {
          const bar = slot.candidate;
          const machineId = bar.assignments[0]!.machineId;
          const created = await transaction.scheduleEvent.create({
            data: {
              type: "PRODUCTION",
              title: `Production · ${bar.reference}`,
              notes: null,
              startAt: slot.startAt,
              endAt: slot.endAt,
              machineId,
              cuttingBarId: bar.id,
              createdById: actor.user.id,
              operators: {
                create: [
                  { operatorId: team.leadOperatorId!, role: "LEAD" },
                  ...team.helperOperatorIds.map((operatorId) => ({ operatorId, role: "HELPER" as const })),
                ],
              },
            },
            include: detailEventInclude,
          });
          await transaction.historyEvent.create({
            data: {
              eventType: "SCHEDULE_EVENT_CREATED",
              entityType: "SCHEDULE_EVENT",
              entityId: created.id,
              actorUserId: actor.user.id,
              actorRole: actor.user.role,
              metadata: {
                eventType: created.type,
                batchId,
                offerId: offer.id,
                offerReference: offer.reference,
                machineId,
                cuttingBarId: bar.id,
                barReference: bar.reference,
                startAt: slot.startAt.toISOString(),
                endAt: slot.endAt.toISOString(),
                durationMinutes: data.durationMinutes,
                gapMinutes: data.gapMinutes,
                leadOperatorId: team.leadOperatorId,
                helperOperatorIds: team.helperOperatorIds,
              },
            },
          });
          createdEvents.push(created as EventWithRelations);
        }
        return createdEvents.map((event) => ({ event, mappedEvent: mapEvent(event) }));
      }, { maxWait: 10_000, timeout: 60_000 });

      if (result[0]) this.publish(result[0].event, actor.user.id, "schedule.batch.created");
      return { batchId, events: result.map((item) => item.mappedEvent) };
    } catch (error) {
      this.mapUniqueConflict(error);
      throw error;
    }
  }

  async updateEvent(actor: AuthContext, id: string, input: unknown): Promise<{ event: ManagedScheduleEvent }> {
    const parsed = updateScheduleEventSchema.safeParse(input);
    if (!parsed.success) throw badInput("Vérifiez les modifications du planning.", parsed.error.flatten());
    const patch = parsed.data;
    if (!Object.keys(patch).length) throw badInput("Indiquez au moins une modification.");
    try {
      const result = await this.prisma.$transaction(async (transaction) => {
        await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "ScheduleEvent" WHERE "id" = ${id} FOR UPDATE`);
        const current = await transaction.scheduleEvent.findUnique({ where: { id }, include: detailEventInclude });
        if (!current) throw new NotFoundException({ code: "SCHEDULE_EVENT_NOT_FOUND", message: "Événement introuvable." });
        if (current.status !== "PLANNED") {
          throw new ConflictException({ code: "SCHEDULE_EVENT_NOT_ACTIVE", message: "Un événement annulé ne peut plus être modifié." });
        }
        if (
          current.type !== "PRODUCTION" &&
          (patch.leadOperatorId !== undefined || patch.helperOperatorIds !== undefined)
        ) {
          throw badInput("Une équipe ne peut être associée qu’à une planification de production.");
        }
        if (current.type === "PRODUCTION") {
          await this.getEligibleBar(transaction, current.cuttingBarId!, current.machineId);
          if (current.machine.status !== "ACTIVE") {
            throw new ConflictException({ code: "MACHINE_IN_MAINTENANCE", message: "La production ne peut pas être replanifiée sur une machine inactive ou en maintenance." });
          }
        }
        const nextStart = patch.startAt ? new Date(patch.startAt) : current.startAt;
        const nextEnd = patch.endAt ? new Date(patch.endAt) : current.endAt;
        if (nextEnd <= nextStart) throw badInput("La fin doit être après le début.");

        const activeTeam = current.operators.filter((membership) => membership.active);
        const currentLead = activeTeam.find((membership) => membership.role === "LEAD")?.operatorId;
        const currentHelpers = activeTeam.filter((membership) => membership.role === "HELPER").map((membership) => membership.operatorId);
        const teamWasEdited = patch.leadOperatorId !== undefined || patch.helperOperatorIds !== undefined;
        const team: ScheduleTeam = current.type === "PRODUCTION"
          ? {
              leadOperatorId: patch.leadOperatorId ?? currentLead,
              helperOperatorIds: patch.helperOperatorIds ?? currentHelpers,
            }
          : { helperOperatorIds: [] };
        if (current.type === "PRODUCTION" && !team.leadOperatorId) {
          throw new ConflictException({ code: "SCHEDULE_LEAD_REQUIRED", message: "Un responsable de production est requis." });
        }
        await this.validateTeam(transaction, team);
        const nextOperatorIds = this.operatorIds(team);
        const priorOperatorIds = activeTeam.map((membership) => membership.operatorId);
        await this.lockResources(transaction, current.machineId, [...priorOperatorIds, ...nextOperatorIds]);
        await this.assertNoOverlap(transaction, current.machineId, nextStart, nextEnd, nextOperatorIds, id);

        const updated = await transaction.scheduleEvent.update({
          where: { id },
          data: {
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.notes !== undefined ? { notes: patch.notes || null } : {}),
            ...(patch.startAt !== undefined ? { startAt: nextStart } : {}),
            ...(patch.endAt !== undefined ? { endAt: nextEnd } : {}),
            updatedById: actor.user.id,
            ...(teamWasEdited && current.type === "PRODUCTION"
              ? {
                  operators: {
                    updateMany: { where: { active: true }, data: { active: false, removedAt: new Date() } },
                    create: [
                      { operatorId: team.leadOperatorId!, role: "LEAD" as const },
                      ...team.helperOperatorIds.map((operatorId) => ({ operatorId, role: "HELPER" as const })),
                    ],
                  },
                }
              : {}),
          },
          include: detailEventInclude,
        });
        await transaction.historyEvent.create({
          data: {
            eventType: "SCHEDULE_EVENT_UPDATED",
            entityType: "SCHEDULE_EVENT",
            entityId: id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: {
              eventType: current.type,
              machineId: current.machineId,
              cuttingBarId: current.cuttingBarId,
              previous: { title: current.title, startAt: current.startAt.toISOString(), endAt: current.endAt.toISOString(), operatorIds: priorOperatorIds },
              next: { title: updated.title, startAt: updated.startAt.toISOString(), endAt: updated.endAt.toISOString(), operatorIds: nextOperatorIds },
            },
          },
        });
        return { event: updated, mappedEvent: mapEvent(updated) };
      }, { maxWait: 10_000, timeout: 15_000 });

      this.publish(result.event, actor.user.id, "schedule.updated");
      return { event: result.mappedEvent };
    } catch (error) {
      this.mapUniqueConflict(error);
      throw error;
    }
  }

  async cancelEvent(actor: AuthContext, id: string): Promise<{ event: ManagedScheduleEvent }> {
    const result = await this.prisma.$transaction(async (transaction) => {
      await transaction.$queryRaw(Prisma.sql`SELECT "id" FROM "ScheduleEvent" WHERE "id" = ${id} FOR UPDATE`);
      const current = await transaction.scheduleEvent.findUnique({ where: { id }, include: detailEventInclude });
      if (!current) throw new NotFoundException({ code: "SCHEDULE_EVENT_NOT_FOUND", message: "Événement introuvable." });
      if (current.status !== "PLANNED") {
        throw new ConflictException({ code: "SCHEDULE_EVENT_ALREADY_CANCELLED", message: "Cet événement est déjà annulé." });
      }
      const activeTeam = current.operators.filter((membership) => membership.active);
      await this.lockResources(transaction, current.machineId, activeTeam.map((membership) => membership.operatorId));
      const cancelledAt = new Date();
      const event = await transaction.scheduleEvent.update({
        where: { id },
        data: {
          status: "CANCELLED",
          cancelledAt,
          cancelledById: actor.user.id,
          updatedById: actor.user.id,
          operators: { updateMany: { where: { active: true }, data: { active: false, removedAt: cancelledAt } } },
        },
        include: detailEventInclude,
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "SCHEDULE_EVENT_CANCELLED",
          entityType: "SCHEDULE_EVENT",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: {
            eventType: current.type,
            title: current.title,
            machineId: current.machineId,
            cuttingBarId: current.cuttingBarId,
            startAt: current.startAt.toISOString(),
            endAt: current.endAt.toISOString(),
            operatorIds: activeTeam.map((membership) => membership.operatorId),
          },
        },
      });
      return { event, mappedEvent: mapEvent(event) };
    }, { maxWait: 10_000, timeout: 15_000 });

    this.publish(result.event, actor.user.id, "schedule.cancelled");
    return { event: result.mappedEvent };
  }

  private teamForCreate(data: ReturnType<typeof createScheduleEventSchema.parse>): ScheduleTeam {
    return {
      leadOperatorId: data.type === "PRODUCTION" ? data.leadOperatorId : undefined,
      helperOperatorIds: data.type === "PRODUCTION" ? data.helperOperatorIds : [],
    };
  }

  private async getBatchCandidates(
    database: PrismaService | PrismaTypes.TransactionClient,
    offerId: string,
    cuttingBarIds?: string[],
  ): Promise<BatchCandidate[]> {
    const bars = await database.cuttingBar.findMany({
      where: {
        offerId,
        status: "AFFECTEE",
        ...(cuttingBarIds ? { id: { in: cuttingBarIds } } : {}),
        assignments: { some: { active: true } },
        scheduleEvents: { none: { type: "PRODUCTION", status: "PLANNED" } },
      },
      include: {
        offer: { select: { id: true, reference: true, name: true } },
        assignments: {
          where: { active: true },
          take: 2,
          orderBy: { assignedAt: "desc" },
          select: {
            machineId: true,
            assignedAt: true,
            machine: { select: { id: true, name: true, internalNumber: true, status: true } },
          },
        },
      },
      orderBy: [{ profile: "asc" }, { reference: "asc" }, { id: "asc" }],
      take: 501,
    });
    return (bars as BatchCandidate[]).sort((left, right) => {
      const leftMachine = left.assignments[0]?.machine.internalNumber ?? "";
      const rightMachine = right.assignments[0]?.machine.internalNumber ?? "";
      return leftMachine.localeCompare(rightMachine)
        || left.profile.localeCompare(right.profile)
        || left.reference.localeCompare(right.reference)
        || left.id.localeCompare(right.id);
    });
  }

  private buildBatchSlots(
    candidates: BatchCandidate[],
    startAtIso: string,
    durationMinutes: number,
    gapMinutes: number,
  ): BatchSlot[] {
    let cursor = new Date(startAtIso).getTime();
    return candidates.map((candidate) => {
      const slotStart = new Date(cursor);
      const slotEnd = new Date(cursor + durationMinutes * 60_000);
      cursor = slotEnd.getTime() + gapMinutes * 60_000;
      return { candidate, startAt: slotStart, endAt: slotEnd };
    });
  }

  private async findBatchConflicts(
    database: PrismaService | PrismaTypes.TransactionClient,
    slots: BatchSlot[],
    operatorIds: string[],
  ): Promise<ScheduleBatchPreview["conflicts"]> {
    if (!slots.length) return [];
    const machineIds = [...new Set(slots.map((slot) => slot.candidate.assignments[0]!.machineId))];
    const firstStart = slots[0]!.startAt;
    const lastEnd = slots.at(-1)!.endAt;
    const events = await database.scheduleEvent.findMany({
      where: {
        status: "PLANNED",
        startAt: { lt: lastEnd },
        endAt: { gt: firstStart },
        OR: [
          { machineId: { in: machineIds } },
          ...(operatorIds.length ? [{ operators: { some: { active: true, operatorId: { in: operatorIds } } } }] : []),
        ],
      },
      include: {
        machine: { select: { id: true, name: true, internalNumber: true } },
        cuttingBar: { select: { reference: true } },
        operators: {
          where: { active: true },
          select: { operatorId: true, operator: { select: { displayName: true } } },
        },
      },
    });
    const result: ScheduleBatchPreview["conflicts"] = [];
    for (const slot of slots) {
      const machineId = slot.candidate.assignments[0]!.machineId;
      const conflict = events.find((event) => {
        const overlaps = event.startAt < slot.endAt && event.endAt > slot.startAt;
        if (!overlaps) return false;
        return event.machineId === machineId
          || event.operators.some((membership) => operatorIds.includes(membership.operatorId));
      });
      if (conflict) {
        const sameMachine = conflict.machineId === machineId;
        const conflictingOperator = sameMachine
          ? undefined
          : conflict.operators.find((membership) => operatorIds.includes(membership.operatorId));
        const reason = sameMachine ? "MACHINE_OVERLAP" : "OPERATOR_OVERLAP";
        result.push({
          barId: slot.candidate.id,
          barReference: slot.candidate.reference,
          machineId,
          machineName: slot.candidate.assignments[0]!.machine.name,
          eventTitle: conflict.title,
          startAt: slot.startAt.toISOString(),
          endAt: slot.endAt.toISOString(),
          reason,
          resourceType: sameMachine ? "MACHINE" : "OPERATOR",
          resourceLabel: sameMachine
            ? `${conflict.machine.internalNumber} · ${conflict.machine.name}`
            : conflictingOperator?.operator.displayName ?? "Opérateur",
          conflictingEventStartAt: conflict.startAt.toISOString(),
          conflictingEventEndAt: conflict.endAt.toISOString(),
          conflictingBarReference: conflict.cuttingBar?.reference ?? null,
        });
      }
    }
    return result;
  }

  private tunisDateStart(date: string): Date {
    const [year, month, day] = date.split("-").map(Number);
    const targetUtc = Date.UTC(year!, month! - 1, day!);
    let guess = targetUtc;
    const formatter = new Intl.DateTimeFormat("en-CA", {
      timeZone: "Africa/Tunis",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const parts = Object.fromEntries(formatter.formatToParts(new Date(guess)).map((part) => [part.type, part.value]));
      const observed = Date.UTC(
        Number(parts.year), Number(parts.month) - 1, Number(parts.day),
        Number(parts.hour), Number(parts.minute), Number(parts.second),
      );
      const delta = targetUtc - observed;
      guess += delta;
      if (delta === 0) break;
    }
    return new Date(guess);
  }

  private async lockBatchResources(
    transaction: PrismaTypes.TransactionClient,
    machineIds: string[],
    operatorIds: string[],
  ): Promise<void> {
    const keys = [...new Set([
      ...machineIds.map((id) => `machine:${id}`),
      ...operatorIds.map((id) => `operator:${id}`),
    ])].sort();
    for (const key of keys) {
      await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
    }
  }

  private operatorIds(team: ScheduleTeam): string[] {
    return [...new Set([...(team.leadOperatorId ? [team.leadOperatorId] : []), ...team.helperOperatorIds])];
  }

  private async getEligibleBar(
    transaction: PrismaTypes.TransactionClient,
    cuttingBarId: string,
    machineId: string,
  ) {
    const bar = await transaction.cuttingBar.findUnique({
      where: { id: cuttingBarId },
      include: { assignments: { where: { active: true }, select: { id: true, machineId: true }, take: 2 } },
    });
    if (!bar) throw new NotFoundException({ code: "CUTTING_BAR_NOT_FOUND", message: "Barre introuvable." });
    if (bar.status !== "AFFECTEE") {
      throw new ConflictException({ code: "BAR_NOT_SCHEDULABLE", message: "Seule une barre affectée et non lancée peut être planifiée." });
    }
    const assignment = bar.assignments[0];
    if (!assignment || bar.assignments.length !== 1) {
      throw new ConflictException({ code: "BAR_ACTIVE_ASSIGNMENT_REQUIRED", message: "La barre doit avoir une affectation machine active unique." });
    }
    if (assignment.machineId !== machineId) {
      throw new ConflictException({ code: "BAR_MACHINE_ASSIGNMENT_MISMATCH", message: "La planification doit utiliser la machine déjà affectée à cette barre. Modifiez l'affectation depuis l'espace Affectations." });
    }
    return bar;
  }

  private async validateTeam(transaction: PrismaTypes.TransactionClient | PrismaService, team: ScheduleTeam): Promise<void> {
    const ids = this.operatorIds(team);
    if (!ids.length) return;
    const users = await transaction.user.findMany({
      where: { id: { in: ids }, role: "OPERATOR", isActive: true },
      select: { id: true },
    });
    if (users.length !== ids.length) {
      throw new ConflictException({ code: "SCHEDULE_OPERATOR_UNAVAILABLE", message: "Un opérateur sélectionné est inactif ou n'a pas le rôle opérateur. Actualisez la liste." });
    }
    if (team.leadOperatorId && team.helperOperatorIds.includes(team.leadOperatorId)) {
      throw badInput("Le responsable ne peut pas être aussi assistant.");
    }
  }

  private async lockResources(
    transaction: PrismaTypes.TransactionClient,
    machineId: string,
    operatorIds: string[],
  ): Promise<void> {
    const keys = [...new Set([`machine:${machineId}`, ...operatorIds.map((id) => `operator:${id}`)])].sort();
    for (const key of keys) {
      // PostgreSQL advisory locks return `void`; cast it so Prisma can decode
      // the result of this raw query without failing the scheduling request.
      await transaction.$queryRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
    }
  }

  private async assertNoOverlap(
    transaction: PrismaTypes.TransactionClient,
    machineId: string,
    startAt: Date,
    endAt: Date,
    operatorIds: string[],
    exceptEventId?: string,
  ): Promise<void> {
    const activeRange: PrismaTypes.ScheduleEventWhereInput = {
      status: "PLANNED",
      startAt: { lt: endAt },
      endAt: { gt: startAt },
      ...(exceptEventId ? { id: { not: exceptEventId } } : {}),
    };
    const machineConflict = await transaction.scheduleEvent.findFirst({
      where: { ...activeRange, machineId },
      select: { id: true, title: true, startAt: true, endAt: true },
    });
    if (machineConflict) {
      throw new ConflictException({
        code: "SCHEDULE_MACHINE_OVERLAP",
        message: `La machine a déjà un événement planifié sur ce créneau : ${machineConflict.title}.`,
        details: { eventId: machineConflict.id, startAt: machineConflict.startAt.toISOString(), endAt: machineConflict.endAt.toISOString() },
      });
    }
    if (!operatorIds.length) return;
    const operatorConflict = await transaction.scheduleEvent.findFirst({
      where: {
        ...activeRange,
        operators: { some: { active: true, operatorId: { in: operatorIds } } },
      },
      select: {
        id: true,
        title: true,
        startAt: true,
        endAt: true,
        operators: { where: { active: true, operatorId: { in: operatorIds } }, select: { operator: { select: { displayName: true } } } },
      },
    });
    if (operatorConflict) {
      throw new ConflictException({
        code: "SCHEDULE_OPERATOR_OVERLAP",
        message: "Un opérateur sélectionné est déjà planifié sur un autre événement à ce créneau.",
        details: {
          eventId: operatorConflict.id,
          title: operatorConflict.title,
          operators: operatorConflict.operators.map((membership) => membership.operator.displayName),
          startAt: operatorConflict.startAt.toISOString(),
          endAt: operatorConflict.endAt.toISOString(),
        },
      });
    }
  }

  private publish(event: Pick<PrismaScheduleEvent, "id" | "machineId">, actorUserId: string, type: string): void {
    this.realtime?.publish({ type, entityType: "SCHEDULE_EVENT", entityId: event.id, actorUserId });
  }

  private mapUniqueConflict(error: unknown): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const target = error.meta?.target;
      const targetText = Array.isArray(target) ? target.join(" ") : String(target ?? "");
      if (!targetText.includes("one_active_production_per_bar") && !targetText.includes("cuttingBarId")) return;
      throw new ConflictException({
        code: "BAR_ALREADY_SCHEDULED",
        message: "Cette barre a déjà une planification de production active. Actualisez le planning.",
      });
    }
  }
}
