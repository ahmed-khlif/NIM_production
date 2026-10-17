import { Inject, Injectable } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type {
  DashboardDelayedPiece,
  DashboardDueDateSummary,
  DashboardMachineLoad,
  DashboardOverview,
  DashboardPiece,
  DashboardPriorityBreakdown,
  DashboardQualitySummary,
  DashboardTrendPoint,
  DashboardUnitStatusBreakdown,
  ManagedHistoryEvent,
  PieceStatus,
  QualityDefectCategory,
  QualityDispositionType,
  UserRole,
} from "@nim/types";
import { dashboardQuerySchema, type DashboardQuery } from "@nim/validation";
import type { AuthContext } from "../auth/auth.types";
import { PrismaService } from "../infrastructure/prisma/prisma.service";

const pieceInclude = {
  units: { include: { currentMachine: true } },
} as const;

type PieceWithUnits = Prisma.PieceGetPayload<{ include: typeof pieceInclude }>;

const dashboardStatuses: PieceStatus[] = [
  "PLANNED",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "DELAYED",
];

const dashboardUnitStatuses = [
  "PENDING",
  "ASSIGNED",
  "IN_PROGRESS",
  "COMPLETED",
  "QUALITY_PENDING",
  "ACCEPTED",
  "REJECTED",
  "SCRAPPED",
] as const;

const dashboardPriorities = ["HIGH", "NORMAL", "LOW"] as const;

function metadataObject(value: Prisma.JsonValue | null): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

@Injectable()
export class DashboardService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async overview(
    _actor: AuthContext,
    rawQuery: Record<string, unknown> = {},
  ): Promise<DashboardOverview> {
    const { days } = dashboardQuerySchema.parse(rawQuery);
    const now = new Date();
    const startOfToday = new Date(now);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday);
    endOfToday.setDate(endOfToday.getDate() + 1);
    const endOfNextSevenDays = new Date(endOfToday);
    endOfNextSevenDays.setDate(endOfNextSevenDays.getDate() + 7);
    const trendStart = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()),
    );
    trendStart.setUTCDate(trendStart.getUTCDate() - (days - 1));
    const trendEnd = new Date(trendStart);
    trendEnd.setUTCDate(trendEnd.getUTCDate() + days);
    const activePieceWhere = { status: { not: "ARCHIVED" as const } };
    const duePieceWhere: Prisma.PieceWhereInput = {
      status: { notIn: ["COMPLETED", "ARCHIVED"] },
    };
    const [
      pieces,
      totalPieces,
      totalUnits,
      completedUnits,
      inProductionUnits,
      delayedPiecesCount,
      statusCounts,
      machines,
      recentEvents,
      unitStatusCounts,
      priorityCounts,
      qualityCounts,
      qualityDefectCounts,
      qualityDispositionCounts,
      pendingDeviationCount,
      qualityPendingCount,
      openProductionNonConformityCount,
      dueTodayPieces,
      dueNextSevenDaysPieces,
      withoutDueDatePieces,
      productionTrendOperations,
      productionTrendQuality,
    ] = await Promise.all([
      this.prisma.piece.findMany({
        where: activePieceWhere,
        include: pieceInclude,
        orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }],
        take: 100,
      }),
      this.prisma.piece.count({ where: activePieceWhere }),
      this.prisma.pieceUnit.count({ where: { piece: activePieceWhere } }),
      this.prisma.pieceUnit.count({
        where: {
          piece: activePieceWhere,
          status: { in: ["COMPLETED", "QUALITY_PENDING", "ACCEPTED", "REJECTED"] },
        },
      }),
      this.prisma.pieceUnit.count({
        where: { piece: activePieceWhere, status: "IN_PROGRESS" },
      }),
      this.prisma.piece.count({
        where: {
          dueDate: { lt: now },
          ...duePieceWhere,
        },
      }),
      this.prisma.piece.groupBy({
        by: ["status"],
        where: activePieceWhere,
        _count: { _all: true },
      }),
      this.prisma.machine.findMany({
        orderBy: [{ status: "asc" }, { name: "asc" }],
        include: {
          assignments: {
            where: { active: true, pieceUnit: { status: "ASSIGNED" } },
            select: { id: true },
          },
          productionOperations: {
            where: { status: "IN_PROGRESS" },
            select: { id: true },
          },
        },
      }),
      this.prisma.historyEvent.findMany({
        take: 8,
        orderBy: { createdAt: "desc" },
        include: {
          actor: { select: { displayName: true } },
        },
      }),
      this.prisma.pieceUnit.groupBy({
        by: ["status"],
        where: { piece: activePieceWhere },
        _count: { _all: true },
      }),
      this.prisma.piece.groupBy({
        by: ["priority"],
        where: activePieceWhere,
        _count: { _all: true },
      }),
      this.prisma.qualityControl.groupBy({
        by: ["result"],
        where: { piece: activePieceWhere },
        _count: { _all: true },
      }),
      this.prisma.qualityControl.groupBy({
        by: ["defectCategory"],
        where: { piece: activePieceWhere, result: "NON_CONFORM", defectCategory: { not: null } },
        _count: { _all: true },
      }),
      this.prisma.qualityDisposition.groupBy({
        by: ["type"],
        where: { piece: activePieceWhere },
        _count: { _all: true },
      }),
      this.prisma.qualityDisposition.count({
        where: { piece: activePieceWhere, type: "DEVIATION", status: "PENDING" },
      }),
      this.prisma.pieceUnit.count({
        where: { piece: activePieceWhere, status: "QUALITY_PENDING" },
      }),
      this.prisma.nonConformity.count({ where: { status: "OPEN" } }),
      this.prisma.piece.count({
        where: { ...duePieceWhere, dueDate: { gte: startOfToday, lt: endOfToday } },
      }),
      this.prisma.piece.count({
        where: { ...duePieceWhere, dueDate: { gte: endOfToday, lt: endOfNextSevenDays } },
      }),
      this.prisma.piece.count({ where: { ...duePieceWhere, dueDate: null } }),
      this.prisma.productionOperation.findMany({
        where: { startedAt: { gte: trendStart, lt: trendEnd } },
        select: { startedAt: true, completedAt: true, status: true },
      }),
      this.prisma.qualityControl.findMany({
        where: { controlledAt: { gte: trendStart, lt: trendEnd } },
        select: { controlledAt: true, result: true },
      }),
    ]);

    const mappedPieces = pieces.map((piece) => this.toDashboardPiece(piece));
    const delayedPieces = mappedPieces
      .filter(
        (piece) =>
          piece.dueDate &&
          new Date(piece.dueDate) < now &&
          !["COMPLETED", "ARCHIVED"].includes(piece.status),
      )
      .map(
        (piece) =>
          ({
            ...piece,
            delayDays: this.delayDays(piece.dueDate as string, now),
          }) satisfies DashboardDelayedPiece,
      );

    const machineLoads = machines.map((machine) => this.toMachineLoad(machine));
    const progressPercent = totalUnits === 0 ? 0 : Math.round((completedUnits / totalUnits) * 100);
    const unitStatusBreakdown = dashboardUnitStatuses.map(
      (status): DashboardUnitStatusBreakdown => ({
        status,
        count: unitStatusCounts.find((item) => item.status === status)?._count._all ?? 0,
      }),
    );
    const priorityBreakdown = dashboardPriorities.map((priority): DashboardPriorityBreakdown => ({
      priority,
      count: priorityCounts.find((item) => item.priority === priority)?._count._all ?? 0,
    }));
    const conformUnits = qualityCounts.find((item) => item.result === "CONFORM")?._count._all ?? 0;
    const nonConformUnits =
      qualityCounts.find((item) => item.result === "NON_CONFORM")?._count._all ?? 0;
    const inspectedUnits = conformUnits + nonConformUnits;
    const quality: DashboardQualitySummary = {
      pendingUnits: qualityPendingCount,
      inspectedUnits,
      conformUnits,
      nonConformUnits,
      conformityRate: inspectedUnits === 0 ? 0 : Math.round((conformUnits / inspectedUnits) * 100),
      defectBreakdown: qualityDefectCounts
        .filter((item): item is typeof item & { defectCategory: QualityDefectCategory } =>
          Boolean(item.defectCategory),
        )
        .map((item) => ({ category: item.defectCategory, count: item._count._all }))
        .sort((left, right) => right.count - left.count),
      dispositionBreakdown: qualityDispositionCounts
        .map((item) => ({ type: item.type as QualityDispositionType, count: item._count._all }))
        .sort((left, right) => right.count - left.count),
      pendingDeviationCount,
    };
    const dueDateSummary: DashboardDueDateSummary = {
      overduePieces: delayedPiecesCount,
      dueTodayPieces,
      dueNextSevenDaysPieces,
      withoutDueDatePieces,
    };
    const productionTrend = this.buildProductionTrend(
      days,
      trendStart,
      productionTrendOperations,
      productionTrendQuality,
    );

    return {
      summary: {
        totalPieces,
        totalUnits,
        completedUnits,
        progressPercent,
        inProductionUnits,
        delayedPieces: delayedPiecesCount,
        activeMachines: machines.filter((machine) => machine.status === "ACTIVE").length,
        maintenanceMachines: machines.filter((machine) => machine.status === "MAINTENANCE").length,
        totalMachines: machines.length,
        openNonConformities: openProductionNonConformityCount,
      },
      machineLoads,
      recentActivity: recentEvents.map((event) => this.toHistoryEvent(event)),
      delayedPieces: delayedPieces.slice(0, 8),
      activePieces: mappedPieces.slice(0, 8),
      statusBreakdown: dashboardStatuses.map((status) => ({
        status,
        count: statusCounts.find((item) => item.status === status)?._count._all ?? 0,
      })),
      unitStatusBreakdown,
      priorityBreakdown,
      quality,
      dueDateSummary,
      trendDays: days,
      productionTrend,
    };
  }

  private buildProductionTrend(
    days: DashboardQuery["days"],
    start: Date,
    operations: Array<{
      startedAt: Date;
      completedAt: Date | null;
      status: "IN_PROGRESS" | "COMPLETED";
    }>,
    qualityControls: Array<{
      controlledAt: Date;
      result: "CONFORM" | "NON_CONFORM";
    }>,
  ): DashboardTrendPoint[] {
    const points = Array.from({ length: days }, (_, index) => {
      const date = new Date(start);
      date.setUTCDate(start.getUTCDate() + index);
      return {
        date: date.toISOString().slice(0, 10),
        startedUnits: 0,
        completedUnits: 0,
        conformUnits: 0,
        nonConformUnits: 0,
      } satisfies DashboardTrendPoint;
    });
    const byDate = new Map(points.map((point) => [point.date, point]));

    for (const operation of operations) {
      const started = byDate.get(operation.startedAt.toISOString().slice(0, 10));
      if (started) started.startedUnits += 1;
      if (operation.status === "COMPLETED" && operation.completedAt) {
        const completed = byDate.get(operation.completedAt.toISOString().slice(0, 10));
        if (completed) completed.completedUnits += 1;
      }
    }
    for (const control of qualityControls) {
      const point = byDate.get(control.controlledAt.toISOString().slice(0, 10));
      if (!point) continue;
      if (control.result === "CONFORM") point.conformUnits += 1;
      else point.nonConformUnits += 1;
    }
    return points;
  }

  private toDashboardPiece(piece: PieceWithUnits): DashboardPiece {
    const completedUnits = piece.units.filter((unit) =>
      ["COMPLETED", "QUALITY_PENDING", "ACCEPTED", "REJECTED"].includes(unit.status),
    ).length;
    const machineName =
      piece.units.find((unit) => unit.currentMachine)?.currentMachine?.name ?? null;
    return {
      id: piece.id,
      reference: piece.reference,
      profile: piece.profile,
      lengthMm: piece.lengthMm,
      quantity: piece.quantity,
      completedUnits,
      priority: piece.priority,
      dueDate: piece.dueDate?.toISOString() ?? null,
      status: piece.status,
      machineName,
    };
  }

  private toMachineLoad(machine: {
    id: string;
    name: string;
    internalNumber: string;
    type: string;
    status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
    assignments: Array<{ id: string }>;
    productionOperations: Array<{ id: string }>;
  }): DashboardMachineLoad {
    const queueCount = machine.assignments.length;
    const inProgressCount = machine.productionOperations.length;
    const totalWork = queueCount + inProgressCount;
    return {
      id: machine.id,
      name: machine.name,
      internalNumber: machine.internalNumber,
      type: machine.type,
      status: machine.status,
      queueCount,
      inProgressCount,
      utilization:
        totalWork === 0 ? 0 : Math.min(100, Math.round((inProgressCount / totalWork) * 100)),
    };
  }

  private toHistoryEvent(
    event: Prisma.HistoryEventGetPayload<{
      include: {
        actor: { select: { displayName: true } };
      };
    }>,
  ): ManagedHistoryEvent {
    return {
      id: event.id,
      eventType: event.eventType,
      entityType: event.entityType,
      entityId: event.entityId,
      actorUserId: event.actorUserId,
      actorName: event.actor?.displayName ?? null,
      actorRole: event.actorRole as UserRole | null,
      metadata: metadataObject(event.metadata),
      createdAt: event.createdAt.toISOString(),
    };
  }

  private delayDays(dueDate: string, now: Date): number {
    const difference = now.getTime() - new Date(dueDate).getTime();
    return Math.max(1, Math.ceil(difference / (1000 * 60 * 60 * 24)));
  }
}
