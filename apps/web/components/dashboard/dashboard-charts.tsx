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
import { AlertTriangle, CalendarClock, ShieldCheck } from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
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
  PENDING: "À préparer",
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
  FACONNEE: "#8b5cf6",
  ASSIGNED: "#60a5fa",
  IN_PROGRESS: "#f59e0b",
  COMPLETED: "#10b981",
  QUALITY_PENDING: "#f97316",
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
  REWORK: "Reprise",
  REMAKE: "Refabrication",
  SCRAP: "Mise au rebut",
  DEVIATION: "Dérogation",
};

const defectColors = ["#e10600", "#f59e0b", "#8b5cf6", "#0ea5e9", "#10b981", "#64748b", "#94a3b8"];

const machineChartConfig: ChartConfig = {
  inProgressCount: { label: "Barres en fabrication", color: "#e10600" },
  queueCount: { label: "Barres à lancer", color: "#94a3b8" },
};

const outputChartConfig: ChartConfig = {
  startedUnits: { label: "Démarrées", color: "#94a3b8" },
  completedUnits: { label: "Terminées", color: "#e10600" },
};

const qualityTrendConfig: ChartConfig = {
  conformUnits: { label: "Conformes", color: "#10b981" },
  nonConformUnits: { label: "Non conformes", color: "#e10600" },
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
  if (!items.length) {
    return <EmptyState title="Aucune donnée" description="La répartition apparaîtra avec les premières opérations." />;
  }

  return (
    <div className="space-y-4" aria-label="Répartition détaillée">
      {items.map((item) => {
        const share = total ? Math.round((item.count / total) * 100) : 0;
        return (
          <div key={item.label}>
            <div className="mb-1.5 flex items-center gap-3 text-xs">
              <span className="min-w-0 flex-1 truncate font-medium text-slate-600 dark:text-slate-300">{item.label}</span>
              <span className="tabular-nums text-slate-400">{share}%</span>
              <span className="w-12 text-right font-semibold tabular-nums text-slate-900 dark:text-slate-100">{item.count.toLocaleString("fr-FR")}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800" role="img" aria-label={`${item.label}: ${item.count} sur ${total}`}>
              <div className="h-full rounded-full transition-[width] duration-300" style={{ width: `${share}%`, backgroundColor: item.color }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function ProductionHeatmap({ points }: { points: DashboardTrendPoint[] }): React.ReactNode {
  const firstDate = points[0] ? new Date(`${points[0].date}T00:00:00.000Z`) : null;
  const leadingDays = firstDate ? (firstDate.getUTCDay() + 6) % 7 : 0;
  const cells = points.map((point, index) => {
    const date = new Date(`${point.date}T00:00:00.000Z`);
    const count = point.startedUnits + point.completedUnits;
    return {
      date: point.date,
      count,
      row: Math.floor((leadingDays + index) / 7),
      column: (leadingDays + index) % 7,
      label: new Intl.DateTimeFormat("fr-FR", {
        weekday: "long",
        day: "numeric",
        month: "long",
        timeZone: "UTC",
      }).format(date),
    };
  });
  const max = Math.max(0, ...cells.map((cell) => cell.count));
  const weeks = Math.max(1, Math.ceil((leadingDays + points.length) / 7));
  const weekdays = [
    { short: "Lu", label: "Lundi" },
    { short: "Ma", label: "Mardi" },
    { short: "Me", label: "Mercredi" },
    { short: "Je", label: "Jeudi" },
    { short: "Ve", label: "Vendredi" },
    { short: "Sa", label: "Samedi" },
    { short: "Di", label: "Dimanche" },
  ];
  const shades = [
    "bg-slate-100 dark:bg-slate-800",
    "bg-red-100 dark:bg-red-950",
    "bg-red-300 dark:bg-red-800",
    "bg-red-500 dark:bg-red-600",
    "bg-red-700 dark:bg-red-400",
  ];

  if (!points.length || max === 0) {
    return (
      <div data-testid="production-heatmap" className="flex min-h-44 items-center justify-center">
        <EmptyState title="Aucune activité de production" description="Les jours actifs apparaîtront après les premières opérations." />
      </div>
    );
  }

  return (
    <div data-testid="production-heatmap" className="space-y-3">
      <div className="mx-auto grid w-full max-w-[280px] grid-cols-7 gap-1.5 text-center text-[10px] font-medium text-slate-500">
        {weekdays.map((day) => (
          <span key={day.label} aria-label={day.label} title={day.label}>
            {day.short}
          </span>
        ))}
      </div>
      <div className="mx-auto max-h-[280px] w-full max-w-[280px] overflow-y-auto overscroll-contain">
        <div
          role="group"
          aria-label={`Activité quotidienne de production sur ${points.length} jours`}
          className="grid grid-cols-7 gap-1.5"
          style={{ gridTemplateRows: `repeat(${weeks}, minmax(0, 1fr))` }}
        >
          {cells.map((cell) => {
            const intensity = cell.count === 0 ? 0 : Math.min(4, Math.ceil((cell.count / max) * 4));
            return (
              <span
                key={cell.date}
                title={`${cell.label} · ${cell.count} unité(s) démarrée(s) ou terminée(s)`}
                aria-label={`${cell.label}: ${cell.count} unité(s)`}
                className={cn("aspect-square min-h-5 min-w-0 rounded-[3px] outline-none ring-offset-2 focus-visible:ring-2 focus-visible:ring-nim-red", shades[intensity])}
                style={{ gridRow: cell.row + 1, gridColumn: cell.column + 1 }}
                tabIndex={0}
              />
            );
          })}
        </div>
      </div>
      <div className="flex items-center justify-between gap-3 text-[10px] text-slate-500">
        <span>Moins</span>
        <span className="flex items-center gap-1" aria-hidden="true">
          {shades.map((shade, index) => <span key={index} className={cn("size-3 rounded-[3px]", shade)} />)}
        </span>
        <span>Plus</span>
      </div>
      <p className="text-xs text-slate-500">Unités démarrées et terminées, par jour.</p>
    </div>
  );
}

function UnitStatusDonut({ items }: { items: DashboardUnitStatusBreakdown[] }): React.ReactNode {
  const data = items.filter((item) => item.count > 0).map((item) => ({
    label: unitStatusLabels[item.status],
    count: item.count,
    color: unitStatusColors[item.status],
  }));
  const total = data.reduce((sum, item) => sum + item.count, 0);

  return (
    <div data-testid="unit-flow-chart" className="grid min-h-60 grid-cols-[minmax(130px,0.9fr)_minmax(0,1.1fr)] items-center gap-2 sm:gap-4">
      {data.length ? (
        <div className="relative mx-auto aspect-square w-full max-w-48">
          <ChartContainer config={{ count: { label: "Unités", color: "#e10600" } }} className="h-full w-full">
            <PieChart accessibilityLayer>
              <ChartTooltip content={<ChartTooltipContent />} />
              <Pie data={data} dataKey="count" nameKey="label" innerRadius="62%" outerRadius="88%" paddingAngle={2} strokeWidth={2}>
                {data.map((item) => <Cell key={item.label} fill={item.color} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums text-slate-950 dark:text-slate-50">{total.toLocaleString("fr-FR")}</span>
            <span className="text-[10px] text-slate-500">unités</span>
          </div>
        </div>
      ) : (
        <EmptyState title="Aucune unité" description="La répartition apparaîtra après la création d'une Affaire." />
      )}
      <div className="max-h-64 space-y-2 overflow-y-auto pr-1">
        {data.map((item) => (
          <div key={item.label} className="flex items-center gap-2 text-xs">
            <span className="size-2 shrink-0 rounded-sm" style={{ backgroundColor: item.color }} />
            <span className="min-w-0 flex-1 truncate text-slate-600 dark:text-slate-300">{item.label}</span>
            <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{item.count.toLocaleString("fr-FR")}</span>
            <span className="w-9 text-right tabular-nums text-slate-400">{total ? Math.round((item.count / total) * 100) : 0}%</span>
          </div>
        ))}
      </div>
    </div>
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
  const statusData = statusBreakdown.filter((item) => item.count > 0);
  const priorityData = priorityBreakdown.filter((item) => item.count > 0);
  const trendData = productionTrend.map((point) => ({ ...point, label: formatTrendDate(point.date) }));
  const hasProductionActivity = productionTrend.some((point) => point.startedUnits + point.completedUnits > 0);
  const hasQualityActivity = productionTrend.some((point) => point.conformUnits + point.nonConformUnits > 0);
  const machineData = [...machineLoads]
    .sort((left, right) => (right.inProgressCount + right.queueCount) - (left.inProgressCount + left.queueCount))
    .map((machine) => ({
      machine: machine.internalNumber,
      name: machine.name,
      inProgressCount: machine.inProgressCount,
      queueCount: machine.queueCount,
      status: machine.status,
    }));
  const defectData = (quality.defectBreakdown ?? [])
    .slice()
    .sort((left, right) => right.count - left.count)
    .slice(0, 6)
    .map((item) => ({ category: defectLabels[item.category], count: item.count }));
  const dispositionData = (quality.dispositionBreakdown ?? []).map((item) => ({
    type: dispositionLabels[item.type],
    count: item.count,
  }));
  const dueItems = [
    { label: "En retard", value: dueDateSummary.overduePieces, color: "bg-nim-red", tone: "text-nim-red" },
    { label: "Aujourd'hui", value: dueDateSummary.dueTodayPieces, color: "bg-amber-400", tone: "text-amber-700" },
    { label: "Sous 7 jours", value: dueDateSummary.dueNextSevenDaysPieces, color: "bg-sky-500", tone: "text-sky-700" },
  ];

  return (
    <section aria-labelledby="dashboard-metrics-title" className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-nim-red">Analyse atelier</p>
          <h2 id="dashboard-metrics-title" className="mt-1 text-xl font-semibold tracking-tight text-slate-950 dark:text-slate-50">
            Comprendre le flux de production
          </h2>
        </div>
        <p className="text-xs text-slate-500">Données persistées · {trendDays} derniers jours</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {dueItems.map((item) => (
          <Card key={item.label} className="flex min-w-0 items-center gap-3 px-4 py-3">
            <span className={cn("size-2.5 shrink-0 rounded-full", item.color)} />
            <span className="min-w-0 flex-1 truncate text-xs text-slate-500">Échéance {item.label.toLocaleLowerCase("fr-FR")}</span>
            <span className={cn("text-lg font-semibold tabular-nums", item.tone)}>{item.value.toLocaleString("fr-FR")}</span>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="production" className="min-w-0">
        <TabsList aria-label="Vues analytiques du tableau de bord" className="sticky top-[76px] z-30 flex w-full justify-start gap-1 overflow-x-auto rounded-none border-b border-slate-200 bg-background/95 p-0 px-2 shadow-sm backdrop-blur dark:border-slate-800">
          <TabsTrigger value="production" className="shrink-0 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-nim-red data-[state=active]:bg-transparent data-[state=active]:text-nim-red data-[state=active]:shadow-none">Production</TabsTrigger>
          <TabsTrigger value="atelier" className="shrink-0 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-nim-red data-[state=active]:bg-transparent data-[state=active]:text-nim-red data-[state=active]:shadow-none">Machines</TabsTrigger>
          <TabsTrigger value="flux" className="shrink-0 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-nim-red data-[state=active]:bg-transparent data-[state=active]:text-nim-red data-[state=active]:shadow-none">Flux</TabsTrigger>
          <TabsTrigger value="qualite" className="shrink-0 rounded-none border-b-2 border-transparent px-4 data-[state=active]:border-nim-red data-[state=active]:bg-transparent data-[state=active]:text-nim-red data-[state=active]:shadow-none">Qualité</TabsTrigger>
        </TabsList>

        <TabsContent value="production">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.7fr)_minmax(280px,0.8fr)]">
            <ChartCard title="Cadence journalière" description="Unités démarrées et terminées. Survolez le graphique pour les valeurs du jour.">
              <div className="h-[280px] w-full sm:h-[320px]" data-testid="production-trend-chart">
                {hasProductionActivity ? (
                  <ChartContainer config={outputChartConfig} className="h-full w-full">
                    <AreaChart accessibilityLayer data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <defs>
                        <linearGradient id="nim-started-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-startedUnits)" stopOpacity={0.2} /><stop offset="95%" stopColor="var(--color-startedUnits)" stopOpacity={0.01} /></linearGradient>
                        <linearGradient id="nim-completed-fill" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="var(--color-completedUnits)" stopOpacity={0.2} /><stop offset="95%" stopColor="var(--color-completedUnits)" stopOpacity={0.01} /></linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} fontSize={11} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Area type="stepAfter" dataKey="startedUnits" stroke="var(--color-startedUnits)" fill="url(#nim-started-fill)" strokeWidth={2} />
                      <Area type="stepAfter" dataKey="completedUnits" stroke="var(--color-completedUnits)" fill="url(#nim-completed-fill)" strokeWidth={2} />
                    </AreaChart>
                  </ChartContainer>
                ) : (
                  <EmptyState title="Aucune production sur cette période" description="La cadence apparaîtra après les premiers lancements et fabrications." />
                )}
              </div>
            </ChartCard>
            <ChartCard title="Rythme de l'atelier" description="Repérez rapidement les jours sans production et les journées les plus actives.">
              <ProductionHeatmap points={productionTrend} />
            </ChartCard>
          </div>
        </TabsContent>

        <TabsContent value="atelier">
            <ChartCard title="Charge constatée par machine" description="Barres affectées en attente de lancement et barres avec une fabrication active. Ce graphique ne représente pas une capacité théorique.">
            <div data-testid="machine-load-chart" className="w-full" style={{ height: Math.min(520, Math.max(260, machineData.length * 34)) }}>
              {machineData.length ? (
                <ChartContainer config={machineChartConfig} className="!aspect-auto h-full w-full">
                  <BarChart accessibilityLayer data={machineData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                    <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                    <YAxis dataKey="machine" type="category" width={72} tickLine={false} axisLine={false} fontSize={11} />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    <ChartLegend content={<ChartLegendContent />} />
                    <Bar dataKey="inProgressCount" fill="var(--color-inProgressCount)" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="queueCount" fill="var(--color-queueCount)" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ChartContainer>
              ) : (
                <EmptyState title="Aucune machine enregistrée" description="Ajoutez une machine pour comparer les files de production." />
              )}
            </div>
            <div className="mt-4 grid gap-2 border-t pt-4 sm:grid-cols-3">
              {machineData.slice(0, 3).map((machine) => (
                <div key={machine.machine} className="flex items-center justify-between gap-3 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-slate-900">
                  <span className="truncate font-medium text-slate-700 dark:text-slate-200">{machine.name}</span>
                  <span className="shrink-0 text-slate-500">{machine.status === "MAINTENANCE" ? "Maintenance" : machine.status === "INACTIVE" ? "Inactive" : "Active"}</span>
                </div>
              ))}
            </div>
          </ChartCard>
        </TabsContent>

        <TabsContent value="flux">
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)]">
            <ChartCard title="Cycle des unités" description="Répartition des unités physiques par état de production et de contrôle.">
              <UnitStatusDonut items={unitStatusBreakdown} />
            </ChartCard>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1">
              <ChartCard title="État des pièces" description="Nombre de pièces actives par état.">
                <div data-testid="piece-status-chart" className="min-h-40 py-2">
                  <BreakdownRows items={statusData.map((item) => ({ label: statusLabels[item.status], count: item.count, color: statusColors[item.status] }))} />
                </div>
              </ChartCard>
              <ChartCard title="Priorités" description="Répartition des pièces selon le niveau d'urgence.">
                <div data-testid="priority-chart" className="min-h-40 py-2">
                  <BreakdownRows items={priorityData.map((item) => ({ label: priorityLabels[item.priority], count: item.count, color: priorityColors[item.priority] }))} />
                </div>
              </ChartCard>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="qualite">
          <div className="mb-4 grid gap-3 sm:grid-cols-3">
            <Card className="flex items-center gap-3 px-4 py-3">
              <ShieldCheck className="size-4 text-emerald-600" />
              <span className="min-w-0 flex-1 text-xs text-slate-500">Conformité contrôlée</span>
              <span className="text-lg font-semibold tabular-nums text-emerald-700">{quality.inspectedUnits ? `${quality.conformityRate} %` : "—"}</span>
            </Card>
            <Card className="flex items-center gap-3 px-4 py-3">
              <CalendarClock className="size-4 text-amber-600" />
              <span className="min-w-0 flex-1 text-xs text-slate-500">Contrôles en attente</span>
              <span className="text-lg font-semibold tabular-nums">{quality.pendingUnits.toLocaleString("fr-FR")}</span>
            </Card>
            <Card className="flex items-center gap-3 px-4 py-3">
              <AlertTriangle className="size-4 text-nim-red" />
              <span className="min-w-0 flex-1 text-xs text-slate-500">Dérogations à décider</span>
              <span className="text-lg font-semibold tabular-nums text-nim-red">{(quality.pendingDeviationCount ?? 0).toLocaleString("fr-FR")}</span>
            </Card>
          </div>
          <div className="grid gap-4 xl:grid-cols-2">
            <ChartCard title="Tendance des contrôles" description="Inspections enregistrées chaque jour, conformes et non conformes.">
              <div className="h-[280px] w-full" data-testid="quality-trend-chart">
                {hasQualityActivity ? (
                  <ChartContainer config={qualityTrendConfig} className="h-full w-full">
                    <LineChart accessibilityLayer data={trendData} margin={{ top: 8, right: 8, left: -20, bottom: 0 }}>
                      <CartesianGrid vertical={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24} fontSize={11} />
                      <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <ChartLegend content={<ChartLegendContent />} />
                      <Line type="monotone" dataKey="conformUnits" stroke="var(--color-conformUnits)" strokeWidth={2} dot={{ r: 2 }} />
                      <Line type="monotone" dataKey="nonConformUnits" stroke="var(--color-nonConformUnits)" strokeWidth={2} dot={{ r: 2 }} />
                    </LineChart>
                  </ChartContainer>
                ) : (
                  <EmptyState title="Aucun contrôle sur cette période" description="Les tendances apparaîtront dès les premières inspections." />
                )}
              </div>
            </ChartCard>
            <ChartCard title="Profil des défauts" description="Les principales catégories remontées par les contrôles non conformes.">
              <div className="h-[280px] w-full" data-testid="quality-defect-chart">
                {defectData.length >= 3 ? (
                  <ChartContainer config={{ count: { label: "Défauts", color: "#e10600" } }} className="h-full w-full">
                    <RadarChart accessibilityLayer data={defectData} outerRadius="72%">
                      <PolarGrid stroke="hsl(var(--border))" />
                      <PolarAngleAxis dataKey="category" tick={{ fontSize: 10 }} />
                      <PolarRadiusAxis allowDecimals={false} tick={{ fontSize: 9 }} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Radar dataKey="count" name="Défauts" stroke="#e10600" fill="#e10600" fillOpacity={0.18} />
                    </RadarChart>
                  </ChartContainer>
                ) : defectData.length ? (
                  <div className="flex h-full items-center px-2">
                    <BreakdownRows items={defectData.map((item, index) => ({ label: item.category, count: item.count, color: defectColors[index % defectColors.length] }))} />
                  </div>
                ) : (
                  <EmptyState title="Aucun défaut classé" description="Les catégories apparaîtront après les contrôles non conformes." />
                )}
              </div>
            </ChartCard>
            <ChartCard title="Traitements des non-conformités" description="Décisions prises pour les pièces rejetées.">
              <div className="h-[250px] w-full" data-testid="quality-disposition-chart">
                {dispositionData.length ? (
                  <ChartContainer config={{ count: { label: "Décisions", color: "#64748b" } }} className="h-full w-full">
                    <BarChart accessibilityLayer data={dispositionData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 4 }}>
                      <CartesianGrid horizontal={false} strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} fontSize={11} />
                      <YAxis dataKey="type" type="category" width={108} tickLine={false} axisLine={false} fontSize={10} />
                      <ChartTooltip content={<ChartTooltipContent />} />
                      <Bar dataKey="count" fill="var(--color-count)" radius={[0, 4, 4, 0]} />
                    </BarChart>
                  </ChartContainer>
                ) : (
                  <EmptyState title="Aucun traitement enregistré" description="Les décisions apparaîtront après un rejet qualité." />
                )}
              </div>
            </ChartCard>
          </div>
        </TabsContent>
      </Tabs>
    </section>
  );
}
