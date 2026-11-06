"use client";

import type {
  DashboardDueDateSummary,
  DashboardMachineLoad,
  DashboardPriorityBreakdown,
  DashboardQualitySummary,
  DashboardStatusBreakdown,
  DashboardTrendPoint,
  DashboardUnitStatusBreakdown,
  PiecePriority,
  PieceUnitStatus,
  QualityDefectCategory,
  QualityDispositionType,
} from "@nim/types";
import { AlertTriangle, Clock3 } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  ChartContainer,
  ChartLegend,
  ChartLegendContent,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { EmptyState } from "@/components/ui/empty-state";
import { cn } from "@/lib/utils";

const statusLabels: Record<DashboardStatusBreakdown["status"], string> = {
  PLANNED: "Planifiées",
  ASSIGNED: "Affectées",
  IN_PROGRESS: "En fabrication",
  COMPLETED: "Terminées",
  DELAYED: "En retard",
  ARCHIVED: "Archivées",
};

const unitStatusLabels: Record<PieceUnitStatus, string> = {
  PENDING: "À affecter",
  FACONNEE: "Façonnées",
  ASSIGNED: "Affectées",
  IN_PROGRESS: "En fabrication",
  COMPLETED: "Fabriquées",
  QUALITY_PENDING: "Contrôle en attente",
  ACCEPTED: "Conformes",
  REJECTED: "Non conformes",
  SCRAPPED: "Mises au rebut",
};

const priorityLabels: Record<PiecePriority, string> = {
  HIGH: "Haute",
  NORMAL: "Normale",
  LOW: "Basse",
};

const statusColors: Record<DashboardStatusBreakdown["status"], string> = {
  PLANNED: "#94a3b8",
  ASSIGNED: "#60a5fa",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#10b981",
  DELAYED: "#e10600",
  ARCHIVED: "#cbd5e1",
};

const priorityColors: Record<PiecePriority, string> = {
  HIGH: "#e10600",
  NORMAL: "#64748b",
  LOW: "#cbd5e1",
};

const unitStatusColors: Record<PieceUnitStatus, string> = {
  PENDING: "#94a3b8",
  FACONNEE: "#64748b",
  ASSIGNED: "#60a5fa",
  IN_PROGRESS: "#e10600",
  COMPLETED: "#10b981",
  QUALITY_PENDING: "#f59e0b",
  ACCEPTED: "#059669",
  REJECTED: "#dc2626",
  SCRAPPED: "#475569",
};

const defectLabels: Record<QualityDefectCategory, string> = {
  DIMENSIONAL: "Dimensionnel",
  SURFACE: "Surface",
  MATERIAL: "Matière",
  WELDING: "Soudure",
  FINISH: "Finition",
  DAMAGE: "Dommage",
  OTHER: "Autre",
};

const dispositionLabels: Record<QualityDispositionType, string> = {
  REWORK: "Rework",
  REMAKE: "Remake",
  SCRAP: "Mise au rebut",
  DEVIATION: "Dérogation",
};

const defectColors = ["#e10600", "#f59e0b", "#8b5cf6", "#0ea5e9", "#10b981", "#64748b", "#94a3b8"];

const chartConfig: ChartConfig = {
  inProgressCount: { label: "En fabrication", color: "#e10600" },
  queueCount: { label: "En file", color: "#cbd5e1" },
  count: { label: "Unités", color: "#e10600" },
};

const trendConfig: ChartConfig = {
  startedUnits: { label: "DÃ©marrÃ©es", color: "#94a3b8" },
  completedUnits: { label: "TerminÃ©es", color: "#e10600" },
  conformUnits: { label: "Conformes", color: "#10b981" },
  nonConformUnits: { label: "Non conformes", color: "#f59e0b" },
};

function formatTrendDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short" }).format(
    new Date(`${value}T00:00:00.000Z`),
  );
}

function ChartCard({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
  className?: string;
}): React.ReactNode {
  return (
    <Card className={cn("min-w-0", className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">{title}</CardTitle>
        <CardDescription className="text-xs leading-5">{description}</CardDescription>
      </CardHeader>
      <CardContent className="pt-2">{children}</CardContent>
    </Card>
  );
}

function BreakdownRows({
  items,
}: {
  items: Array<{ label: string; count: number; color: string }>;
}): React.ReactNode {
  const total = items.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="space-y-4" aria-label="Répartition détaillée">
      {items.map((item) => {
        const share = total ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center gap-3 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className="tabular-nums text-slate-400">{share}%</span>
              <span className="w-10 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{item.count}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${item.label}: ${item.count} sur ${total}`}>
              <div className="h-full rounded-full transition-[width]" style={{ width: `${share}%`, backgroundColor: item.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RiskSummary({ summary }: { summary: DashboardDueDateSummary }): React.ReactNode {
  const total = summary.overduePieces + summary.dueTodayPieces + summary.dueNextSevenDaysPieces;
  const items = [
    {
      label: "En retard",
      value: summary.overduePieces,
      color: "bg-nim-red",
      textColor: "text-nim-red",
    },
    {
      label: "Échéance aujourd’hui",
      value: summary.dueTodayPieces,
      color: "bg-amber-400",
      textColor: "text-amber-700",
    },
    {
      label: "Dans les 7 jours",
      value: summary.dueNextSevenDaysPieces,
      color: "bg-sky-400",
      textColor: "text-sky-700",
    },
  ];

  return (
    <Card className="min-w-0">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Risque de livraison</CardTitle>
        <CardDescription className="text-xs leading-5">
          Les ordres actifs par proximité d’échéance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4 pt-2">
        <div className="flex items-end justify-between gap-4">
          <div>
            <p className="text-3xl font-semibold tracking-tight text-slate-950">{total}</p>
            <p className="mt-1 text-xs text-slate-500">ordres à surveiller</p>
          </div>
          <p className="text-right text-xs text-slate-500">
            {summary.withoutDueDatePieces} sans échéance
          </p>
        </div>
        <div
          className="flex h-3 overflow-hidden rounded-full bg-slate-100"
          aria-label="Répartition du risque de livraison"
        >
          {items.map((item) => (
            <div
              key={item.label}
              className={cn("h-full transition-all", item.color)}
              style={{ width: total ? `${(item.value / total) * 100}%` : "0%" }}
              title={`${item.label}: ${item.value}`}
            />
          ))}
        </div>
        <div className="grid gap-2 sm:grid-cols-3">
          {items.map((item) => (
            <div key={item.label} className="flex items-center gap-2 text-xs">
              <span className={cn("size-2 rounded-full", item.color)} />
              <span className="min-w-0 flex-1 truncate text-slate-500">{item.label}</span>
              <span className={cn("font-semibold tabular-nums", item.textColor)}>{item.value}</span>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

export function DashboardCharts({
  machineLoads,
  statusBreakdown,
  unitStatusBreakdown,
  priorityBreakdown,
  quality,
  dueDateSummary,
  productionTrend,
  trendDays,
}: {
  machineLoads: DashboardMachineLoad[];
  statusBreakdown: DashboardStatusBreakdown[];
  unitStatusBreakdown: DashboardUnitStatusBreakdown[];
  priorityBreakdown: DashboardPriorityBreakdown[];
  quality: DashboardQualitySummary;
  dueDateSummary: DashboardDueDateSummary;
  productionTrend: DashboardTrendPoint[];
  trendDays: number;
}): React.ReactNode {
  const hasMachineData = machineLoads.length > 0;
  const statusData = statusBreakdown.filter((item) => item.count > 0);
  const unitData = unitStatusBreakdown.filter((item) => item.count > 0);
  const priorityData = priorityBreakdown.filter((item) => item.count > 0);
  const trendData = productionTrend.map((point) => ({
    ...point,
    label: formatTrendDate(point.date),
  }));
  const hasTrendActivity = productionTrend.some(
    (point) =>
      point.startedUnits + point.completedUnits + point.conformUnits + point.nonConformUnits > 0,
  );

  return (
    <section aria-labelledby="dashboard-metrics-title" className="space-y-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <p className="text-sm font-medium text-nim-red">Pilotage</p>
          <h2
            id="dashboard-metrics-title"
            className="mt-1 text-xl font-semibold tracking-tight text-slate-950"
          >
            Indicateurs opérationnels
          </h2>
        </div>
        <p className="hidden text-right text-xs text-slate-400 sm:block">
          Données persistées · actualisées avec le tableau de bord
        </p>
      </div>

      <ChartCard
        title="Cadence de production et qualité"
        description={`Opérations démarrées/terminées et inspections réalisées par jour · ${trendDays} derniers jours.`}
      >
        <div className="h-[280px] sm:h-[320px]" data-testid="production-trend-chart">
          {hasTrendActivity ? (
            <ChartContainer config={trendConfig}>
              <LineChart
                accessibilityLayer
                data={trendData}
                margin={{ top: 8, right: 8, left: -20 }}
              >
                <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="label"
                  tickLine={false}
                  axisLine={false}
                  tickMargin={8}
                  minTickGap={24}
                  fontSize={11}
                />
                <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                <ChartTooltip content={<ChartTooltipContent />} />
                <ChartLegend content={<ChartLegendContent />} />
                <Line
                  type="linear"
                  dataKey="startedUnits"
                  stroke="var(--color-startedUnits)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="linear"
                  dataKey="completedUnits"
                  stroke="var(--color-completedUnits)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="linear"
                  dataKey="conformUnits"
                  stroke="var(--color-conformUnits)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
                <Line
                  type="linear"
                  dataKey="nonConformUnits"
                  stroke="var(--color-nonConformUnits)"
                  strokeWidth={2}
                  dot={{ r: 2 }}
                />
              </LineChart>
            </ChartContainer>
          ) : (
            <EmptyState
              title="Aucune activite recente"
              description="Les tendances apparaitront apres les premieres operations et controles."
            />
          )}
        </div>
      </ChartCard>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <ChartCard
          title="Charge par machine"
          description="Unités en fabrication comparées à la file active."
        >
          <div className="h-[300px]" data-testid="machine-load-chart">
            {hasMachineData ? (
              <ChartContainer config={chartConfig}>
                <BarChart
                  accessibilityLayer
                  data={machineLoads.map((machine) => ({
                    machine: machine.internalNumber,
                    inProgressCount: machine.inProgressCount,
                    queueCount: machine.queueCount,
                  }))}
                  margin={{ top: 8, right: 8, left: -20, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    dataKey="machine"
                    tickLine={false}
                    axisLine={false}
                    tickMargin={8}
                    fontSize={11}
                  />
                  <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <ChartLegend content={<ChartLegendContent />} />
                  <Bar
                    dataKey="inProgressCount"
                    fill="var(--color-inProgressCount)"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar dataKey="queueCount" fill="var(--color-queueCount)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState
                title="Aucune machine"
                description="Ajoutez une machine pour voir sa charge."
              />
            )}
          </div>
        </ChartCard>

        <ChartCard title="État du carnet de pièces" description="Nombre et part de chaque état, hors archives.">
          <div className="min-h-[250px] py-2" data-testid="piece-status-chart">
            {statusData.length ? <BreakdownRows items={statusData.map((item) => ({ label: statusLabels[item.status], count: item.count, color: statusColors[item.status] }))} /> : <EmptyState title="Aucune pièce" description="Les états apparaîtront dès la création des pièces." />}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-[1.35fr_0.65fr]">
        <ChartCard
          title="Flux des unités"
          description="Où se trouvent les unités dans le cycle de fabrication."
        >
          <div className="min-h-[320px] py-2" data-testid="unit-flow-chart">
            {unitData.length ? (
              <BreakdownRows items={unitData.map((item) => ({ label: unitStatusLabels[item.status], count: item.count, color: unitStatusColors[item.status] }))} />
            ) : (
              <EmptyState
                title="Aucune unité"
                description="Le flux apparaîtra après la création d'un ordre."
              />
            )}
          </div>
        </ChartCard>

        <ChartCard title="Priorité des pièces" description="Part et volume des pièces par niveau de priorité.">
          <div className="min-h-[250px] py-2" data-testid="priority-chart">
            {priorityData.length ? <BreakdownRows items={priorityData.map((item) => ({ label: priorityLabels[item.priority], count: item.count, color: priorityColors[item.priority] }))} /> : <EmptyState title="Aucune priorité définie" description="Les priorités apparaîtront avec les premiers ordres." />}
          </div>
        </ChartCard>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <RiskSummary summary={dueDateSummary} />
        <Card className="min-w-0">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm">
              <AlertTriangle className="size-4 text-amber-600" />
              Lecture qualité
            </CardTitle>
            <CardDescription className="text-xs leading-5">
              La conformité est calculée uniquement sur les unités déjà contrôlées.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4 pt-2">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-3xl font-semibold tracking-tight text-emerald-600">
                  {quality.inspectedUnits ? `${quality.conformityRate} %` : "—"}
                </p>
                <p className="mt-1 text-xs text-slate-500">{quality.inspectedUnits ? "taux de conformité contrôlée" : "aucun contrôle terminé"}</p>
              </div>
              <div className="text-right text-xs leading-5 text-slate-500">
                <p>{quality.conformUnits} conformes</p>
                <p className="text-nim-red">{quality.nonConformUnits} non conformes</p>
              </div>
            </div>
            {quality.inspectedUnits ? (
              <div
                className="h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"
                role="progressbar"
                aria-label="Taux de conformité"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={quality.conformityRate}
              >
                <div
                  className="h-full rounded-full bg-emerald-500 transition-all"
                  style={{ width: `${quality.conformityRate}%` }}
                />
              </div>
            ) : null}
            <div className="flex items-center gap-2 rounded-lg bg-slate-50 px-3 py-2.5 text-xs text-slate-600">
              <Clock3 className="size-3.5 shrink-0 text-slate-400" />
              {quality.pendingUnits
                ? `${quality.pendingUnits} unité(s) attendent encore un contrôle.`
                : "Aucune unité n’attend actuellement un contrôle."}
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <ChartCard
          title="Pareto des défauts"
          description="Les catégories les plus fréquentes sur les inspections non conformes."
        >
          <div className="h-[300px]" data-testid="quality-defect-chart">
            {quality.defectBreakdown?.length ? (
              <ChartContainer config={{ count: { label: "Défauts", color: "#e10600" } }}>
                <BarChart
                  accessibilityLayer
                  layout="vertical"
                  data={quality.defectBreakdown.map((item) => ({
                    category: defectLabels[item.category],
                    count: item.count,
                  }))}
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    dataKey="category"
                    type="category"
                    width={92}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]}>
                    {quality.defectBreakdown.map((item, index) => (
                      <Cell key={item.category} fill={defectColors[index % defectColors.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState
                title="Aucun défaut classé"
                description="Les catégories apparaîtront après les contrôles non conformes."
              />
            )}
          </div>
        </ChartCard>

        <ChartCard
          title="Traitements des non-conformités"
          description="Suivez les décisions prises et les dérogations encore en attente."
        >
          <div className="h-[300px]" data-testid="quality-disposition-chart">
            {quality.dispositionBreakdown?.length ? (
              <ChartContainer config={{ count: { label: "Décisions", color: "#64748b" } }}>
                <BarChart
                  accessibilityLayer
                  layout="vertical"
                  data={quality.dispositionBreakdown.map((item) => ({
                    type: dispositionLabels[item.type],
                    count: item.count,
                  }))}
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <YAxis
                    dataKey="type"
                    type="category"
                    width={104}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                  />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ChartContainer>
            ) : (
              <EmptyState
                title="Aucun traitement"
                description="Les décisions de traitement apparaîtront après un rejet."
              />
            )}
          </div>
          <div className="flex items-center justify-between gap-3 rounded-lg bg-amber-50 px-3 py-2.5 text-xs text-amber-800">
            <span>Dérogations en attente d’approbation</span>
            <span className="font-semibold tabular-nums">{quality.pendingDeviationCount ?? 0}</span>
          </div>
        </ChartCard>
      </div>
    </section>
  );
}
