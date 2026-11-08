import { Inject, Injectable, Optional } from "@nestjs/common";
import type { OnModuleDestroy } from "@nestjs/common";
import { Prisma, type Prisma as PrismaTypes } from "@prisma/client";
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
import { RealtimeService } from "../realtime/realtime.service";

const DASHBOARD_METRICS_TTL_MS = 3_000;

const pieceSelect = {
  id: true,
  reference: true,
  profile: true,
  lengthMm: true,
  quantity: true,
  priority: true,
  dueDate: true,
  status: true,
  _count: {
    select: {
      units: {
        where: { status: { in: ["COMPLETED", "QUALITY_PENDING", "ACCEPTED", "REJECTED"] } },
      },
    },
  },
  units: {
    where: { currentMachineId: { not: null } },
    select: { currentMachine: { select: { name: true } } },
    take: 1,
  },
} satisfies PrismaTypes.PieceSelect;

type PieceWithUnits = PrismaTypes.PieceGetPayload<{ select: typeof pieceSelect }>;
type DashboardMachineRow = {
  id: string;
  name: string;
  internalNumber: string;
  type: string;
  status: "ACTIVE" | "MAINTENANCE" | "INACTIVE";
  _count: { barAssignments: number; productionRuns: number };
};

type DashboardAggregateRow = {
  totalPieces: number;
  totalUnits: number;
  completedUnits: number;
  inProductionUnits: number;
  delayedPiecesCount: number;
  dueTodayPieces: number;
  dueNextSevenDaysPieces: number;
  withoutDueDatePieces: number;
  qualityPendingCount: number;
  openProductionNonConformityCount: number;
  pendingDeviationCount: number;
  statusCounts: Array<{ status: string; count: number }>;
  unitStatusCounts: Array<{ status: string; count: number }>;
  priorityCounts: Array<{ priority: string; count: number }>;
  qualityCounts: Array<{ result: string; count: number }>;
  qualityDefectCounts: Array<{ defectCategory: string; count: number }>;
  qualityDispositionCounts: Array<{ type: string; count: number }>;
  productionTrendOperations: Array<{ date: string; startedUnits: number; completedUnits: number }>;
  productionTrendQuality: Array<{ date: string; conformUnits: number; nonConformUnits: number }>;
};

type CachedDashboardAggregate = { expiresAt: number; value: DashboardAggregateRow };

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
export class DashboardService implements OnModuleDestroy {
  private readonly aggregateCache = new Map<string, CachedDashboardAggregate>();
  private readonly aggregateRequests = new Map<string, Promise<DashboardAggregateRow>>();
  private cacheGeneration = 0;
  private readonly unsubscribeRealtime?: () => void;

  constructor(
    @Inject(PrismaService) private readonly prisma: PrismaService,
    @Optional() @Inject(RealtimeService) realtime?: RealtimeService,
  ) {
    this.unsubscribeRealtime = realtime?.subscribe(() => this.invalidateAggregateCache());
  }

  onModuleDestroy(): void {
    this.unsubscribeRealtime?.();
    this.invalidateAggregateCache();
  }

  private invalidateAggregateCache(): void {
    this.cacheGeneration += 1;
    this.aggregateCache.clear();
    this.aggregateRequests.clear();
  }

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
    const aggregateCacheKey = `${days}:${startOfToday.toISOString()}`;
    const [activePieceRows, delayedPieceRows, machines, recentEvents, aggregates] =
      await Promise.all([
        this.prisma.piece.findMany({
          where: { status: { notIn: ["COMPLETED", "ARCHIVED"] } },
          select: pieceSelect,
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }, { id: "asc" }],
          take: 8,
        }),
        this.prisma.piece.findMany({
          where: {
            status: { notIn: ["COMPLETED", "ARCHIVED"] },
            dueDate: { lt: now },
          },
          select: pieceSelect,
          orderBy: [{ dueDate: "asc" }, { createdAt: "desc" }, { id: "asc" }],
          take: 8,
        }),
        this.prisma.machine.findMany({
          orderBy: [{ status: "asc" }, { name: "asc" }],
          select: {
            id: true,
            name: true,
            internalNumber: true,
            type: true,
            status: true,
            _count: {
              select: {
                barAssignments: {
                  where: {
                    active: true,
                    cuttingBar: { is: { status: "AFFECTEE" } },
                  },
                },
                productionRuns: { where: { status: "RUNNING" } },
              },
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
        this.getDashboardAggregates(aggregateCacheKey, {
          now,
          startOfToday,
          endOfToday,
          endOfNextSevenDays,
          trendStart,
          trendEnd,
        }),
      ]);

    const activePieces = activePieceRows.map((piece) => this.toDashboardPiece(piece));
    const delayedPieces = delayedPieceRows.map((piece) => {
      const mapped = this.toDashboardPiece(piece);
      return {
        ...mapped,
        delayDays: this.delayDays(mapped.dueDate as string, now),
      } satisfies DashboardDelayedPiece;
    });

    const machineLoads = machines.map((machine) => this.toMachineLoad(machine));
    const progressPercent =
      aggregates.totalUnits === 0
        ? 0
        : Math.round((aggregates.completedUnits / aggregates.totalUnits) * 100);
    const unitStatusBreakdown = dashboardUnitStatuses.map(
      (status): DashboardUnitStatusBreakdown => ({
        status,
        count: aggregates.unitStatusCounts.find((item) => item.status === status)?.count ?? 0,
      }),
    );
    const priorityBreakdown = dashboardPriorities.map((priority): DashboardPriorityBreakdown => ({
      priority,
      count: aggregates.priorityCounts.find((item) => item.priority === priority)?.count ?? 0,
    }));
    const conformUnits =
      aggregates.qualityCounts.find((item) => item.result === "CONFORM")?.count ?? 0;
    const nonConformUnits =
      aggregates.qualityCounts.find((item) => item.result === "NON_CONFORM")?.count ?? 0;
    const inspectedUnits = conformUnits + nonConformUnits;
    const quality: DashboardQualitySummary = {
      pendingUnits: aggregates.qualityPendingCount,
      inspectedUnits,
      conformUnits,
      nonConformUnits,
      conformityRate: inspectedUnits === 0 ? 0 : Math.round((conformUnits / inspectedUnits) * 100),
      defectBreakdown: aggregates.qualityDefectCounts
        .filter((item): item is typeof item & { defectCategory: QualityDefectCategory } =>
          Boolean(item.defectCategory),
        )
        .map((item) => ({ category: item.defectCategory, count: item.count }))
        .sort((left, right) => right.count - left.count),
      dispositionBreakdown: aggregates.qualityDispositionCounts
        .map((item) => ({ type: item.type as QualityDispositionType, count: item.count }))
        .sort((left, right) => right.count - left.count),
      pendingDeviationCount: aggregates.pendingDeviationCount,
    };
    const dueDateSummary: DashboardDueDateSummary = {
      overduePieces: aggregates.delayedPiecesCount,
      dueTodayPieces: aggregates.dueTodayPieces,
      dueNextSevenDaysPieces: aggregates.dueNextSevenDaysPieces,
      withoutDueDatePieces: aggregates.withoutDueDatePieces,
    };
    const productionTrend = this.buildProductionTrend(
      days,
      trendStart,
      aggregates.productionTrendOperations,
      aggregates.productionTrendQuality,
    );

    return {
      summary: {
        totalPieces: aggregates.totalPieces,
        totalUnits: aggregates.totalUnits,
        completedUnits: aggregates.completedUnits,
        progressPercent,
        inProductionUnits: aggregates.inProductionUnits,
        delayedPieces: aggregates.delayedPiecesCount,
        activeMachines: machines.filter((machine) => machine.status === "ACTIVE").length,
        maintenanceMachines: machines.filter((machine) => machine.status === "MAINTENANCE").length,
        totalMachines: machines.length,
        openNonConformities: aggregates.openProductionNonConformityCount,
      },
      machineLoads,
      recentActivity: recentEvents.map((event) => this.toHistoryEvent(event)),
      delayedPieces,
      activePieces,
      statusBreakdown: dashboardStatuses.map((status) => ({
        status,
        count: aggregates.statusCounts.find((item) => item.status === status)?.count ?? 0,
      })),
      unitStatusBreakdown,
      priorityBreakdown,
      quality,
      dueDateSummary,
      trendDays: days,
      productionTrend,
    };
  }

  private async getDashboardAggregates(
    key: string,
    window: {
      now: Date;
      startOfToday: Date;
      endOfToday: Date;
      endOfNextSevenDays: Date;
      trendStart: Date;
      trendEnd: Date;
    },
  ): Promise<DashboardAggregateRow> {
    const cached = this.aggregateCache.get(key);
    if (cached && cached.expiresAt > Date.now()) return cached.value;
    const pending = this.aggregateRequests.get(key);
    if (pending) return pending;

    const generation = this.cacheGeneration;
    const request = this.loadDashboardAggregates(window);
    this.aggregateRequests.set(key, request);
    try {
      const value = await request;
      if (generation === this.cacheGeneration) {
        this.aggregateCache.set(key, { value, expiresAt: Date.now() + DASHBOARD_METRICS_TTL_MS });
      }
      return value;
    } finally {
      if (this.aggregateRequests.get(key) === request) this.aggregateRequests.delete(key);
    }
  }

  private async loadDashboardAggregates(window: {
    now: Date;
    startOfToday: Date;
    endOfToday: Date;
    endOfNextSevenDays: Date;
    trendStart: Date;
    trendEnd: Date;
  }): Promise<DashboardAggregateRow> {
    const rows = await this.prisma.$queryRaw<DashboardAggregateRow[]>(Prisma.sql`
      WITH "activePieces" AS MATERIALIZED (
        SELECT "id", "status"::text AS "status", "priority"::text AS "priority", "dueDate"
        FROM "Piece"
        WHERE "status" <> 'ARCHIVED'
      ),
      "pieceStatuses" AS (
        SELECT "status", COUNT(*)::int AS "count"
        FROM "activePieces"
        GROUP BY "status"
      ),
      "unitStatuses" AS (
        SELECT unit."status"::text AS "status", COUNT(*)::int AS "count"
        FROM "PieceUnit" unit
        INNER JOIN "activePieces" piece ON piece."id" = unit."pieceId"
        GROUP BY unit."status"
      ),
      "unitTotals" AS (
        SELECT
          COALESCE(SUM("count"), 0)::int AS "totalUnits",
          COALESCE(SUM("count") FILTER (WHERE "status" IN ('COMPLETED', 'QUALITY_PENDING', 'ACCEPTED', 'REJECTED')), 0)::int AS "completedUnits",
          COALESCE(SUM("count") FILTER (WHERE "status" = 'IN_PROGRESS'), 0)::int AS "inProductionUnits",
          COALESCE(SUM("count") FILTER (WHERE "status" = 'QUALITY_PENDING'), 0)::int AS "qualityPendingCount"
        FROM "unitStatuses"
      ),
      "priorities" AS (
        SELECT "priority", COUNT(*)::int AS "count"
        FROM "activePieces"
        GROUP BY "priority"
      ),
      "qualityResults" AS (
        SELECT control."result"::text AS "result", COUNT(*)::int AS "count"
        FROM "QualityControl" control
        INNER JOIN "activePieces" piece ON piece."id" = control."pieceId"
        GROUP BY control."result"
      ),
      "qualityDefects" AS (
        SELECT control."defectCategory"::text AS "defectCategory", COUNT(*)::int AS "count"
        FROM "QualityControl" control
        INNER JOIN "activePieces" piece ON piece."id" = control."pieceId"
        WHERE control."result" = 'NON_CONFORM' AND control."defectCategory" IS NOT NULL
        GROUP BY control."defectCategory"
      ),
      "qualityDispositions" AS (
        SELECT disposition."type"::text AS "type", COUNT(*)::int AS "count"
        FROM "QualityDisposition" disposition
        INNER JOIN "activePieces" piece ON piece."id" = disposition."pieceId"
        GROUP BY disposition."type"
      ),
      "barRunEvents" AS (
        SELECT TO_CHAR(DATE_TRUNC('day', run."startedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "date",
               COUNT(item."pieceUnitId")::int AS "startedUnits", 0::int AS "completedUnits"
        FROM "ProductionRun" run
        INNER JOIN "CuttingBarItem" item ON item."cuttingBarId" = run."cuttingBarId"
          AND item."createdAt" <= run."startedAt"
          AND (item."releasedAt" IS NULL OR item."releasedAt" > run."startedAt")
        WHERE run."startedAt" >= ${window.trendStart} AND run."startedAt" < ${window.trendEnd}
        GROUP BY 1
        UNION ALL
        SELECT TO_CHAR(DATE_TRUNC('day', run."finishedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "date",
               0::int AS "startedUnits", COUNT(item."pieceUnitId")::int AS "completedUnits"
        FROM "ProductionRun" run
        INNER JOIN "CuttingBarItem" item ON item."cuttingBarId" = run."cuttingBarId"
          AND item."createdAt" <= run."finishedAt"
          AND (item."releasedAt" IS NULL OR item."releasedAt" > run."finishedAt")
        WHERE run."status" = 'COMPLETED'
          AND run."finishedAt" >= ${window.trendStart} AND run."finishedAt" < ${window.trendEnd}
        GROUP BY 1
      ),
      "standaloneOperationEvents" AS (
        SELECT TO_CHAR(DATE_TRUNC('day', operation."startedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "date",
               COUNT(*)::int AS "startedUnits", 0::int AS "completedUnits"
        FROM "ProductionOperation" operation
        WHERE operation."startedAt" >= ${window.trendStart} AND operation."startedAt" < ${window.trendEnd}
          AND NOT EXISTS (
            SELECT 1
            FROM "CuttingBarItem" item
            INNER JOIN "MachineBarAssignment" assignment ON assignment."cuttingBarId" = item."cuttingBarId"
            WHERE item."pieceUnitId" = operation."pieceUnitId"
              AND item."createdAt" <= operation."startedAt"
              AND (item."releasedAt" IS NULL OR item."releasedAt" > operation."startedAt")
              AND assignment."assignedAt" <= operation."startedAt"
              AND (assignment."unassignedAt" IS NULL OR assignment."unassignedAt" > operation."startedAt")
          )
        GROUP BY 1
        UNION ALL
        SELECT TO_CHAR(DATE_TRUNC('day', operation."completedAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "date",
               0::int AS "startedUnits", COUNT(*)::int AS "completedUnits"
        FROM "ProductionOperation" operation
        WHERE operation."status" = 'COMPLETED'
          AND operation."completedAt" >= ${window.trendStart} AND operation."completedAt" < ${window.trendEnd}
          AND NOT EXISTS (
            SELECT 1
            FROM "CuttingBarItem" item
            INNER JOIN "MachineBarAssignment" assignment ON assignment."cuttingBarId" = item."cuttingBarId"
            WHERE item."pieceUnitId" = operation."pieceUnitId"
              AND item."createdAt" <= operation."completedAt"
              AND (item."releasedAt" IS NULL OR item."releasedAt" > operation."completedAt")
              AND assignment."assignedAt" <= operation."completedAt"
              AND (assignment."unassignedAt" IS NULL OR assignment."unassignedAt" > operation."completedAt")
          )
        GROUP BY 1
      ),
      "operationEvents" AS (
        SELECT * FROM "barRunEvents"
        UNION ALL
        SELECT * FROM "standaloneOperationEvents"
      ),
      "operationTrend" AS (
        SELECT "date", SUM("startedUnits")::int AS "startedUnits",
               SUM("completedUnits")::int AS "completedUnits"
        FROM "operationEvents"
        GROUP BY "date"
      ),
      "qualityTrend" AS (
        SELECT TO_CHAR(DATE_TRUNC('day', "controlledAt" AT TIME ZONE 'UTC'), 'YYYY-MM-DD') AS "date",
               COUNT(*) FILTER (WHERE "result" = 'CONFORM')::int AS "conformUnits",
               COUNT(*) FILTER (WHERE "result" = 'NON_CONFORM')::int AS "nonConformUnits"
        FROM "QualityControl"
        WHERE "controlledAt" >= ${window.trendStart} AND "controlledAt" < ${window.trendEnd}
        GROUP BY "date"
      )
      SELECT
        (SELECT COUNT(*)::int FROM "activePieces") AS "totalPieces",
        (SELECT "totalUnits" FROM "unitTotals") AS "totalUnits",
        (SELECT "completedUnits" FROM "unitTotals") AS "completedUnits",
        (SELECT "inProductionUnits" FROM "unitTotals") AS "inProductionUnits",
        (SELECT COUNT(*)::int FROM "activePieces"
          WHERE "dueDate" < ${window.now} AND "status" NOT IN ('COMPLETED', 'ARCHIVED')) AS "delayedPiecesCount",
        (SELECT COUNT(*)::int FROM "activePieces"
          WHERE "dueDate" >= ${window.startOfToday} AND "dueDate" < ${window.endOfToday}
            AND "status" <> 'COMPLETED') AS "dueTodayPieces",
        (SELECT COUNT(*)::int FROM "activePieces"
          WHERE "dueDate" >= ${window.endOfToday} AND "dueDate" < ${window.endOfNextSevenDays}
            AND "status" <> 'COMPLETED') AS "dueNextSevenDaysPieces",
        (SELECT COUNT(*)::int FROM "activePieces"
          WHERE "dueDate" IS NULL AND "status" <> 'COMPLETED') AS "withoutDueDatePieces",
        (SELECT "qualityPendingCount" FROM "unitTotals") AS "qualityPendingCount",
        (SELECT COUNT(*)::int FROM "NonConformity" WHERE "status" = 'OPEN') AS "openProductionNonConformityCount",
        (SELECT COUNT(*)::int FROM "QualityDisposition" disposition
          INNER JOIN "activePieces" piece ON piece."id" = disposition."pieceId"
          WHERE disposition."type" = 'DEVIATION' AND disposition."status" = 'PENDING') AS "pendingDeviationCount",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('status', "status", 'count', "count")) FROM "pieceStatuses"), '[]'::jsonb) AS "statusCounts",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('status', "status", 'count', "count")) FROM "unitStatuses"), '[]'::jsonb) AS "unitStatusCounts",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('priority', "priority", 'count', "count")) FROM "priorities"), '[]'::jsonb) AS "priorityCounts",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('result', "result", 'count', "count")) FROM "qualityResults"), '[]'::jsonb) AS "qualityCounts",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('defectCategory', "defectCategory", 'count', "count")) FROM "qualityDefects"), '[]'::jsonb) AS "qualityDefectCounts",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('type', "type", 'count', "count")) FROM "qualityDispositions"), '[]'::jsonb) AS "qualityDispositionCounts",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('date', "date", 'startedUnits', "startedUnits", 'completedUnits', "completedUnits")) FROM "operationTrend"), '[]'::jsonb) AS "productionTrendOperations",
        COALESCE((SELECT jsonb_agg(jsonb_build_object('date', "date", 'conformUnits', "conformUnits", 'nonConformUnits', "nonConformUnits")) FROM "qualityTrend"), '[]'::jsonb) AS "productionTrendQuality"
    `);
    const result = rows[0];
    if (!result) throw new Error("Dashboard aggregation returned no result row.");
    return result;
  }

  private buildProductionTrend(
    days: DashboardQuery["days"],
    start: Date,
    operations: Array<{ date: string; startedUnits: number; completedUnits: number }>,
    qualityControls: Array<{ date: string; conformUnits: number; nonConformUnits: number }>,
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
      const point = byDate.get(operation.date);
      if (!point) continue;
      point.startedUnits = operation.startedUnits;
      point.completedUnits = operation.completedUnits;
    }
    for (const control of qualityControls) {
      const point = byDate.get(control.date);
      if (!point) continue;
      point.conformUnits = control.conformUnits;
      point.nonConformUnits = control.nonConformUnits;
    }
    return points;
  }

  private toDashboardPiece(piece: PieceWithUnits): DashboardPiece {
    const machineName =
      piece.units.find((unit) => unit.currentMachine)?.currentMachine?.name ?? null;
    return {
      id: piece.id,
      reference: piece.reference,
      profile: piece.profile,
      lengthMm: piece.lengthMm,
      quantity: piece.quantity,
      completedUnits: piece._count.units,
      priority: piece.priority,
      dueDate: piece.dueDate?.toISOString() ?? null,
      status: piece.status,
      machineName,
    };
  }

  private toMachineLoad(machine: DashboardMachineRow): DashboardMachineLoad {
    const queueCount = machine._count.barAssignments;
    const inProgressCount = machine._count.productionRuns;
    return {
      id: machine.id,
      name: machine.name,
      internalNumber: machine.internalNumber,
      type: machine.type,
      status: machine.status,
      queueCount,
      inProgressCount,
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
