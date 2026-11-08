import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  Optional,
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
import { parseListSort } from "../list-sorting";
import { deliverBusinessNotification } from "../notifications/notification-delivery";
import { RealtimeService } from "../realtime/realtime.service";

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
  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimeService) private readonly realtime?: RealtimeService,
  ) {}

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
      this.prisma.machineBarAssignment.groupBy({
        by: ["machineId"],
        where: { active: true },
        _count: { _all: true },
      }),
    ]);
    const counts = new Map(barCounts.map((item) => [item.machineId, item._count._all]));
    return machines.map((machine) => ({
      ...this.toManagedMachine(machine),
      assignedBarCount: counts.get(machine.id) ?? 0,
    }));
  }

  async listMachinesPage(
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      sortBy?: string;
      sortDirection?: string;
    } = {},
  ) {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 20;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      !Number.isInteger(pageSize) ||
      ![10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination des machines est invalide.",
      });
    }
    const search = options.search?.trim();
    if (search && search.length > 80)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    const machineStatuses: MachineStatus[] = ["ACTIVE", "MAINTENANCE", "INACTIVE"];
    if (options.status && !machineStatuses.includes(options.status as MachineStatus)) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le filtre de statut machine est invalide.",
      });
    }
    const where: Prisma.MachineWhereInput = {
      ...(options.status ? { status: options.status as MachineStatus } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: "insensitive" } },
              { internalNumber: { contains: search, mode: "insensitive" } },
              { type: { contains: search, mode: "insensitive" } },
              { location: { contains: search, mode: "insensitive" } },
            ],
          }
        : {}),
    };
    const sort = parseListSort(
      options.sortBy,
      options.sortDirection,
      ["name", "type", "location", "status"] as const,
      { sortBy: "status", sortDirection: "asc" },
    );
    const orderBy: Prisma.MachineOrderByWithRelationInput[] = [
      { [sort.sortBy]: sort.sortDirection },
      { id: "asc" },
    ];
    const [machines, barCounts, total, statusGroups] = await Promise.all([
      this.prisma.machine.findMany({
        where,
        orderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
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
      machines: machines.map((machine) => ({
        ...this.toManagedMachine(machine),
        assignedBarCount: counts.get(machine.id) ?? 0,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
      statusCounts: Object.fromEntries(
        statusGroups.map((group) => [group.status, group._count._all]),
      ),
      sorting: sort,
    };
  }

  async getMachine(
    id: string,
    options: {
      page?: number;
      pageSize?: number;
      search?: string;
      status?: string;
      sortBy?: string;
      sortDirection?: string;
    } = {},
  ): Promise<MachineDetail> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 10;
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      !Number.isInteger(pageSize) ||
      ![10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination de la machine est invalide.",
      });
    }
    const search = options.search?.trim();
    if (search && search.length > 80)
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    const statuses = ["AFFECTEE", "LANCEE", "FABRIQUEE", "NON_CONFORME"];
    if (options.status && !statuses.includes(options.status))
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le statut de barre est invalide.",
      });
    const sortColumns = ["profile", "reference", "offer", "rawLengthMm", "status"] as const;
    const sortBy = options.sortBy ?? "profile";
    const sortDirection = options.sortDirection ?? "asc";
    if (
      !sortColumns.includes(sortBy as (typeof sortColumns)[number]) ||
      !["asc", "desc"].includes(sortDirection)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "Le tri des barres est invalide.",
      });
    }
    const machine = await this.prisma.machine.findUnique({ where: { id } });
    if (!machine)
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });

    const barWhere: Prisma.MachineBarAssignmentWhereInput = {
      machineId: id,
      active: true,
      ...(options.status || search
        ? {
            cuttingBar: {
              is: {
                ...(options.status ? { status: options.status as never } : {}),
                ...(search
                  ? {
                      OR: [
                        { reference: { contains: search, mode: "insensitive" } },
                        { profile: { contains: search, mode: "insensitive" } },
                        { offer: { reference: { contains: search, mode: "insensitive" } } },
                      ],
                    }
                  : {}),
              },
            },
          }
        : {}),
    };
    const sortOrder = sortDirection as Prisma.SortOrder;
    const primaryBarOrder: Prisma.MachineBarAssignmentOrderByWithRelationInput =
      sortBy === "offer"
        ? { cuttingBar: { offer: { reference: sortOrder } } }
        : sortBy === "rawLengthMm"
          ? { cuttingBar: { rawLengthMm: sortOrder } }
          : sortBy === "status"
            ? { cuttingBar: { status: sortOrder } }
            : sortBy === "reference"
              ? { cuttingBar: { reference: sortOrder } }
              : { cuttingBar: { profile: sortOrder } };
    const barOrderBy: Prisma.MachineBarAssignmentOrderByWithRelationInput[] = options.sortBy
      ? [
          primaryBarOrder,
          { cuttingBar: { reference: "asc" } },
          { assignedAt: "desc" },
          { id: "asc" },
        ]
      : [
          { cuttingBar: { profile: "asc" } },
          { cuttingBar: { reference: "asc" } },
          { assignedAt: "desc" },
        ];
    const queueWhere: Prisma.AssignmentWhereInput = {
      machineId: id,
      active: true,
      barAssignmentId: null,
      pieceUnit: {
        status: "ASSIGNED",
        NOT: {
          barMemberships: {
            some: {
              active: true,
              cuttingBar: { is: { assignments: { some: { active: true } } } },
            },
          },
        },
        ...(search
          ? {
              piece: {
                OR: [
                  { reference: { contains: search, mode: "insensitive" } },
                  { profile: { contains: search, mode: "insensitive" } },
                ],
              },
            }
          : {}),
      },
    };
    const [
      queue,
      queueCount,
      activeOperationCount,
      activeProductionRunCount,
      activeBarAssignments,
      activeBarCount,
      barStatusGroups,
      fabricatedTotal,
      fabricatedToday,
      activeSessionRecord,
      activeRunRecord,
    ] = await Promise.all([
      this.prisma.assignment.findMany({
        where: queueWhere,
        include: queueInclude,
        orderBy: [{ queuePosition: "asc" }, { assignedAt: "asc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.assignment.count({ where: queueWhere }),
      this.prisma.productionOperation.count({
        where: {
          machineId: id,
          status: "IN_PROGRESS",
          NOT: {
            pieceUnit: {
              barMemberships: {
                some: {
                  active: true,
                  cuttingBar: { is: { assignments: { some: { active: true } } } },
                },
              },
            },
          },
        },
      }),
      this.prisma.productionRun.count({ where: { machineId: id, status: "RUNNING" } }),
      this.prisma.machineBarAssignment.findMany({
        where: barWhere,
        include: { cuttingBar: { select: machineBarSelect } },
        orderBy: barOrderBy,
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.machineBarAssignment.count({ where: barWhere }),
      this.prisma.cuttingBar.groupBy({
        by: ["status"],
        where: { assignments: { some: { machineId: id, active: true } } },
        _count: { _all: true },
      }),
      this.prisma.productionRun.count({
        where: { machineId: id, status: "COMPLETED" },
      }),
      this.prisma.productionRun.count({
        where: {
          machineId: id,
          status: "COMPLETED",
          finishedAt: { gte: startOfTunisianDay() },
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
          startedByOperator: { select: { id: true, displayName: true } },
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
      queuePagination: {
        page,
        pageSize,
        total: queueCount,
        totalPages: Math.max(1, Math.ceil(queueCount / pageSize)),
      },
      activeOperationCount,
      activeProductionRunCount,
      assignedBarCount: activeBarCount,
      cuttingBars,
      cuttingBarsPagination: {
        page,
        pageSize,
        total: activeBarCount,
        totalPages: Math.max(1, Math.ceil(activeBarCount / pageSize)),
      },
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
            startedBy: {
              id: activeRunRecord.startedByOperator.id,
              displayName: activeRunRecord.startedByOperator.displayName,
            },
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
        assigned: barStatusGroups.find((group) => group.status === "AFFECTEE")?._count._all ?? 0,
        inProgress: activeProductionRunCount,
        fabricatedToday,
        fabricatedTotal,
      },
    };
  }

  async getMachineReleasableBars(
    id: string,
    options: { page?: number; pageSize?: number; search?: string } = {},
  ): Promise<{
    bars: Array<{ id: string; offerId: string; offerReference: string; reference: string }>;
    pagination: { page: number; pageSize: number; total: number; totalPages: number };
  }> {
    const page = options.page ?? 1;
    const pageSize = options.pageSize ?? 50;
    const search = options.search?.trim();
    if (
      !Number.isInteger(page) ||
      page < 1 ||
      page > 1_000_000 ||
      ![10, 20, 50].includes(pageSize)
    ) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La pagination des barres est invalide.",
      });
    }
    if (search && search.length > 80) {
      throw new BadRequestException({
        code: "VALIDATION_ERROR",
        message: "La recherche est trop longue.",
      });
    }
    const machine = await this.prisma.machine.findUnique({
      where: { id },
      select: { id: true, status: true },
    });
    if (!machine)
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
    if (machine.status !== "MAINTENANCE") {
      throw new BadRequestException({
        code: "MACHINE_NOT_IN_MAINTENANCE",
        message: "La sélection groupée est réservée aux machines en maintenance.",
      });
    }
    const where: Prisma.MachineBarAssignmentWhereInput = {
      machineId: id,
      active: true,
      cuttingBar: {
        is: {
          status: "AFFECTEE",
          ...(search
            ? {
                OR: [
                  { reference: { contains: search, mode: "insensitive" } },
                  { profile: { contains: search, mode: "insensitive" } },
                  { offer: { reference: { contains: search, mode: "insensitive" } } },
                ],
              }
            : {}),
        },
      },
    };
    const [rows, total] = await Promise.all([
      this.prisma.machineBarAssignment.findMany({
        where,
        select: {
          cuttingBar: {
            select: {
              id: true,
              offerId: true,
              reference: true,
              offer: { select: { reference: true } },
            },
          },
        },
        orderBy: [
          { cuttingBar: { profile: "asc" } },
          { cuttingBar: { reference: "asc" } },
          { id: "asc" },
        ],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
      this.prisma.machineBarAssignment.count({ where }),
    ]);
    return {
      bars: rows.map(({ cuttingBar }) => ({
        id: cuttingBar.id,
        offerId: cuttingBar.offerId,
        offerReference: cuttingBar.offer.reference,
        reference: cuttingBar.reference,
      })),
      pagination: { page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) },
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
    const created = await this.prisma.$transaction(async (transaction) => {
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
      const machineCreatedEvent = await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_CREATED",
          entityType: "MACHINE",
          entityId: machine.id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { internalNumber, status: machine.status },
        },
      });
      await deliverBusinessNotification(transaction, machineCreatedEvent, {
        machineId: machine.id,
      });
      return this.toManagedMachine(machine);
    });
    this.realtime?.publish({
      type: "machine.created",
      entityType: "MACHINE",
      entityId: created.id,
      actorUserId: actor.user.id,
    });
    return created;
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
    const updated = await this.prisma.$transaction(async (transaction) => {
      const machine = await transaction.machine.update({
        where: { id },
        data: {
          name: parsed.data.name,
          type: parsed.data.type,
          description: parsed.data.description || null,
          location: parsed.data.location || null,
        },
      });
      const event = await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_UPDATED",
          entityType: "MACHINE",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { previousName: target.name, previousType: target.type },
        },
      });
      await deliverBusinessNotification(transaction, event, { machineId: id });
      return this.toManagedMachine(machine);
    });
    this.realtime?.publish({
      type: "machine.updated",
      entityType: "MACHINE",
      entityId: updated.id,
      actorUserId: actor.user.id,
    });
    return updated;
  }

  async setStatus(actor: AuthContext, id: string, status: MachineStatus): Promise<ManagedMachine> {
    const target = await this.prisma.machine.findUnique({ where: { id } });
    if (!target)
      throw new NotFoundException({ code: "MACHINE_NOT_FOUND", message: "Machine introuvable." });
    if (target.status === status) return this.toManagedMachine(target);
    const updated = await this.prisma.$transaction(async (transaction) => {
      const machine = await transaction.machine.update({ where: { id }, data: { status } });
      const statusEvent = await transaction.historyEvent.create({
        data: {
          eventType: "MACHINE_STATUS_CHANGED",
          entityType: "MACHINE",
          entityId: id,
          actorUserId: actor.user.id,
          actorRole: actor.user.role,
          metadata: { oldStatus: target.status, newStatus: status },
        },
      });
      await deliverBusinessNotification(transaction, statusEvent, { machineId: id });
      return this.toManagedMachine(machine);
    });
    this.realtime?.publish({
      type: "machine.statusChanged",
      entityType: "MACHINE",
      entityId: updated.id,
      actorUserId: actor.user.id,
    });
    return updated;
  }

  async deleteMachine(actor: AuthContext, id: string) {
    let deleted: { id: string; name: string; internalNumber: string };
    try {
      deleted = await this.prisma.$transaction(async (transaction) => {
        const target = await transaction.machine.findUnique({
          where: { id },
          include: {
            _count: {
              select: {
                currentPieceUnits: true,
                assignments: true,
                barAssignments: true,
                productionOperations: true,
                machineSessions: true,
                productionRuns: true,
                nonConformities: true,
              },
            },
          },
        });
        if (!target)
          throw new NotFoundException({
            code: "MACHINE_NOT_FOUND",
            message: "Machine introuvable.",
          });

        const relatedRecordCount = Object.values(target._count).reduce(
          (sum, count) => sum + count,
          0,
        );
        if (relatedRecordCount > 0) {
          throw new ConflictException({
            code: "MACHINE_HAS_HISTORY",
            message:
              "Cette machine possède des affectations ou un historique de production. Désactivez-la pour la retirer des futures affectations.",
          });
        }

        await transaction.machine.delete({ where: { id } });
        const event = await transaction.historyEvent.create({
          data: {
            eventType: "MACHINE_DELETED",
            entityType: "MACHINE",
            entityId: id,
            actorUserId: actor.user.id,
            actorRole: actor.user.role,
            metadata: { name: target.name, internalNumber: target.internalNumber },
          },
        });
        await deliverBusinessNotification(transaction, event, { machineId: id, href: "/machines" });
        return { id, name: target.name, internalNumber: target.internalNumber };
      });
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "P2003") {
        throw new ConflictException({
          code: "MACHINE_HAS_HISTORY",
          message:
            "Cette machine vient d’être utilisée et ne peut plus être supprimée. Désactivez-la à la place.",
        });
      }
      throw error;
    }
    this.realtime?.publish({
      type: "machine.deleted",
      entityType: "MACHINE",
      entityId: deleted.id,
      actorUserId: actor.user.id,
    });
    return deleted;
  }
}
