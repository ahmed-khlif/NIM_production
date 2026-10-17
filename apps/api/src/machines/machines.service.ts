import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import type { Machine, Prisma } from "@prisma/client";
import { createMachineSchema, updateMachineSchema } from "@nim/validation";
import type {
  MachineCuttingBar,
  MachineDetail,
  ManagedMachine,
  MachineStatus,
  ProductionQueueItem,
} from "@nim/types";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

const queueInclude = {
  pieceUnit: { include: { piece: true } },
  machine: { select: { id: true, name: true } },
} as const;

type QueueAssignment = Prisma.AssignmentGetPayload<{ include: typeof queueInclude }>;

const machineBarSelect = {
  id: true,
  offerId: true,
  reference: true,
  profile: true,
  rawLengthMm: true,
  usedLengthMm: true,
  wasteMm: true,
  status: true,
  qualityStatus: true,
  offer: { select: { reference: true } },
} satisfies Prisma.CuttingBarSelect;

type MachineBarRecord = Prisma.CuttingBarGetPayload<{ select: typeof machineBarSelect }>;

function startOfTunisianDay(now = new Date()): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Africa/Tunis",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const part = (type: Intl.DateTimeFormatPartTypes): string =>
    parts.find((item) => item.type === type)?.value ?? "";
  return new Date(`${part("year")}-${part("month")}-${part("day")}T00:00:00+01:00`);
}

function toMachineBar(bar: MachineBarRecord): MachineCuttingBar {
  return {
    id: bar.id,
    offerId: bar.offerId,
    offerReference: bar.offer.reference,
    reference: bar.reference,
    profile: bar.profile,
    rawLengthMm: bar.rawLengthMm,
    usedLengthMm: bar.usedLengthMm,
    wasteMm: bar.wasteMm,
    status: bar.status,
    qualityStatus: bar.qualityStatus,
  };
}

@Injectable()
export class MachinesService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  toManagedMachine(
    machine: Pick<
      Machine,
      | "id"
      | "name"
      | "internalNumber"
      | "type"
      | "status"
      | "description"
      | "location"
      | "createdAt"
      | "updatedAt"
    >,
  ): ManagedMachine {
    return {
      id: machine.id,
      name: machine.name,
      internalNumber: machine.internalNumber,
      type: machine.type,
      status: machine.status as MachineStatus,
      description: machine.description,
      location: machine.location,
      createdAt: machine.createdAt.toISOString(),
      updatedAt: machine.updatedAt.toISOString(),
    };
  }

  private toQueueItem(assignment: QueueAssignment): ProductionQueueItem {
    return {
      pieceUnitId: assignment.pieceUnitId,
      pieceId: assignment.pieceUnit.pieceId,
      reference: assignment.pieceUnit.piece.reference,
      sequenceNumber: assignment.pieceUnit.sequenceNumber,
      profile: assignment.pieceUnit.piece.profile,
      lengthMm: assignment.pieceUnit.piece.lengthMm,
      priority: assignment.pieceUnit.piece.priority,
      status: assignment.pieceUnit.status,
      machineId: assignment.machineId,
      machineName: assignment.machine.name,
      assignedAt: assignment.assignedAt.toISOString(),
      queuePosition: assignment.queuePosition,
    };
  }

  async listMachines(): Promise<ManagedMachine[]> {
    const [machines, barCounts] = await Promise.all([
      this.prisma.machine.findMany({ orderBy: [{ status: "asc" }, { name: "asc" }] }),
      this.prisma.machineBarAssignment.groupBy({ by: ["machineId"], where: { active: true }, _count: { _all: true } }),
    ]);
    const counts = new Map(barCounts.map((item) => [item.machineId, item._count._all]));
    return machines.map((machine) => ({ ...this.toManagedMachine(machine), assignedBarCount: counts.get(machine.id) ?? 0 }));
  }

  async listMachinesPage(options: { page?: number; pageSize?: number; search?: string; status?: string } = {}) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(pageSize) || ![10, 20, 50].includes(pageSize)) {
      throw new BadRequestException({ code: "VALIDATION_ERROR", message: "La pagination des machines est invalide." });
    }
    const search = options.search?.trim();
    const where: Prisma.MachineWhereInput = {
      ...(options.status ? { status: options.status as MachineStatus } : {}),
      ...(search ? { OR: [
        { name: { contains: search, mode: "insensitive" } },
        { internalNumber: { contains: search, mode: "insensitive" } },
        { type: { contains: search, mode: "insensitive" } },
        { location: { contains: search, mode: "insensitive" } },
      ] } : {}),
    };
    const [machines, barCounts, total, statusGroups] = await Promise.all([
      this.prisma.machine.findMany({ where, orderBy: [{ status: "asc" }, { name: "asc" }], skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.machineBarAssignment.groupBy({
        by: ["machineId"],
        where: { active: true },
        _count: { _all: true },
      }),
      this.prisma.machine.count({ where }),
      this.prisma.machine.groupBy({ by: ["status"], _count: { _all: true } }),
    ]);
    const counts = new Map(barCounts.map((item) => [item.machineId, item._count._all]));
    return {
      machines: machines.map((machine) => ({ ...this.toManagedMachine(machine), assignedBarCount: counts.get(machine.id) ?? 0 })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      statusCounts: Object.fromEntries(statusGroups.map((group) => [group.status, group._count._all])),
    };
  }

  async getMachine(id: string): Promise<MachineDetail> {
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine)
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });

    const [queue, activeOperationCount, activeBarAssignments, fabricatedTotal, fabricatedToday, activeSessionRecord, activeRunRecord] =
      await Promise.all([
        this.prisma.assignment.findMany({
          where: { machineId: id, active: true, pieceUnit: { status: "ASSIGNED" } },
          include: queueInclude,
          orderBy: [{ queuePosition: "asc" }, { assignedAt: "asc" }],
        }),
        this.prisma.productionOperation.count({ where: { machineId: id, status: "IN_PROGRESS" } }),
        this.prisma.machineBarAssignment.findMany({
          where: { machineId: id, active: true },
          include: { cuttingBar: { select: machineBarSelect } },
          orderBy: [{ assignedAt: "desc" }],
        }),
        this.prisma.cuttingBar.count({
          where: { status: "FABRIQUEE", assignments: { some: { machineId: id, active: true } } },
        }),
        this.prisma.cuttingBar.count({
          where: {
            status: "FABRIQUEE",
            fabricatedAt: { gte: startOfTunisianDay() },
            assignments: { some: { machineId: id, active: true } },
          },
        }),
        this.prisma.machineSession.findFirst({
          where: { machineId: id, status: "ACTIVE" },
          include: {
            machine: { select: { id: true, name: true, internalNumber: true } },
            members: {
              where: { active: true },
              include: { operator: { select: { id: true, displayName: true } } },
              orderBy: { joinedAt: "asc" },
            },
          },
        }),
        this.prisma.productionRun.findFirst({
          where: { machineId: id, status: "RUNNING" },
          include: {
            machine: { select: { id: true, name: true, internalNumber: true } },
            cuttingBar: {
              include: {
                offer: { select: { id: true, reference: true } },
                items: { where: { active: true }, select: { id: true } },
                nonConformities: { where: { status: "OPEN" }, select: { id: true } },
              },
            },
            machineSession: {
              include: {
                members: {
                  where: { active: true },
                  include: { operator: { select: { id: true, displayName: true } } },
                  orderBy: { joinedAt: "asc" },
                },
              },
            },
          },
        }),
      ]);

    const cuttingBars = activeBarAssignments.map((assignment) =>
      toMachineBar(assignment.cuttingBar),
    );

    return {
      ...this.toManagedMachine(machine),
      queue: queue.map((assignment) => this.toQueueItem(assignment)),
      activeOperationCount,
      assignedBarCount: activeBarAssignments.length,
      cuttingBars,
      activeSession: activeSessionRecord
        ? {
            id: activeSessionRecord.id,
            status: activeSessionRecord.status,
            machineId: activeSessionRecord.machineId,
            machineName: activeSessionRecord.machine.name,
            machineInternalNumber: activeSessionRecord.machine.internalNumber,
            leadOperatorId: activeSessionRecord.leadOperatorId,
            startedAt: activeSessionRecord.startedAt.toISOString(),
            endedAt: activeSessionRecord.endedAt?.toISOString() ?? null,
            team: activeSessionRecord.members.map((member) => ({
              id: member.operator.id,
              displayName: member.operator.displayName,
              role: member.role,
            })),
          }
        : null,
      currentProductionRun: activeRunRecord
        ? {
            id: activeRunRecord.id,
            offerId: activeRunRecord.cuttingBar.offerId,
            offerReference: activeRunRecord.cuttingBar.offer.reference,
            cuttingBarId: activeRunRecord.cuttingBarId,
            barReference: activeRunRecord.cuttingBar.reference,
            profile: activeRunRecord.cuttingBar.profile,
            rawLengthMm: activeRunRecord.cuttingBar.rawLengthMm,
            status: activeRunRecord.status,
            machineId: activeRunRecord.machineId,
            machineName: activeRunRecord.machine.name,
            machineInternalNumber: activeRunRecord.machine.internalNumber,
            machineSessionId: activeRunRecord.machineSessionId,
            startedByOperatorId: activeRunRecord.startedByOperatorId,
            startedAt: activeRunRecord.startedAt.toISOString(),
            finishedAt: activeRunRecord.finishedAt?.toISOString() ?? null,
            team: activeRunRecord.machineSession.members.map((member) => ({
              id: member.operator.id,
              displayName: member.operator.displayName,
              role: member.role,
            })),
            pieceCount: activeRunRecord.cuttingBar.items.length,
            openNonConformityCount: activeRunRecord.cuttingBar.nonConformities.length,
          }
        : null,
      barMetrics: {
        assigned: cuttingBars.filter((bar) => bar.status === "AFFECTEE").length,
        inProgress: cuttingBars.filter((bar) => bar.status === "LANCEE").length,
        fabricatedToday,
        fabricatedTotal,
      },
    };
  }

  async createMachine(actor: AuthContext, input: unknown): Promise<ManagedMachine> {
    const parsed = createMachineSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de la machine.",
        details: parsed.error.flatten(),
      });
    const internalNumber = parsed.data.internalNumber.toUpperCase();
    if (await this.prisma.machine.findUnique({ where: { internalNumber }, select: { id: true } }))
      throw new ConflictException({
        code: "MACHINE_NUMBER_TAKEN",
        message: "Ce numéro interne est déjà utilisé.",
      });
    return this.prisma.$transaction(async (transaction) => {
      const machine = await transaction.machine.create({
        data: {
          name: parsed.data.name,
          internalNumber,
          type: parsed.data.type,
          status: parsed.data.status,
          description: parsed.data.description || null,
          location: parsed.data.location || null,
        },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_CREATED",
          entityType: "MACHINE",
          entityId: machine.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { internalNumber, status: machine.status },
        },
      });
      return this.toManagedMachine(machine);
    });
  }

  async updateMachine(actor: AuthContext, id: string, input: unknown): Promise<ManagedMachine> {
    const parsed = updateMachineSchema.safeParse(input);
    if (!parsed.success)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Vérifiez les informations de la machine.",
        details: parsed.error.flatten(),
      });
    const target = await this.prisma.machine.findUnique({ where: { id } });
    if (!target)
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
    return this.prisma.$transaction(async (transaction) => {
      const machine = await transaction.machine.update({
        where: { id },
        data: {
          name: parsed.data.name,
          type: parsed.data.type,
          description: parsed.data.description || null,
          location: parsed.data.location || null,
        },
      });
      await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_UPDATED",
          entityType: "MACHINE",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { previousName: target.name, previousType: target.type },
        },
      });
      return this.toManagedMachine(machine);
    });
  }

  async setStatus(actor: AuthContext, id: string, status: MachineStatus): Promise<ManagedMachine> {
    const target = await this.prisma.machine.findUnique({ where: { id } });
    if (!target)
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
    if (target.status === status) return this.toManagedMachine(target);
    return this.prisma.$transaction(async (transaction) => {
      const machine = await transaction.machine.update({ where: { id }, data: { status } });
      await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_STATUS_CHANGED",
          entityType: "MACHINE",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { oldStatus: target.status, newStatus: status },
        },
      });
      return this.toManagedMachine(machine);
    });
  }
}
