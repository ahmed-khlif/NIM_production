"use client";

import type {
  DashboardMachineLoad,
  DashboardOverview,
  DashboardPiece,
  ManagedHistoryEvent,
} from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CalendarDays,
  CheckCircle2,
  CircleDot,
  Factory,
  Gauge,
  RefreshCw,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { AccessDenied } from "@/components/access/access-denied";
import { DashboardCharts } from "@/components/dashboard/dashboard-charts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import { ProductionProgress } from "@/components/ui/production-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { TimelineItem } from "@/components/ui/timeline-item";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, getDashboardOverviewRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

const priorityLabels = { HIGH: "Haute", NORMAL: "Normale", LOW: "Basse" } as const;
const statusLabels = {
  PLANNED: "Planifiée",
  ASSIGNED: "Affectée",
  IN_PROGRESS: "En fabrication",
  COMPLETED: "Fabriquée",
  DELAYED: "En retard",
  ARCHIVED: "Archivée",
} as const;

function formatDate(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatDueDate(value: string | null): string {
  if (!value) return "Sans échéance";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date(value));
}

function eventTitle(event: ManagedHistoryEvent): string {
  const labels: Record<string, string> = {
    PIECE_CREATED: "Pièce créée",
    PIECE_UPDATED: "Pièce mise à jour",
    PIECE_ARCHIVED: "Pièce archivée",
    ASSIGNMENT_CREATED: "Affectation créée",
    ASSIGNMENT_REASSIGNED: "Affectation réassignée",
    ASSIGNMENT_REMOVED: "Affectation retirée",
    PRODUCTION_STARTED: "Production démarrée",
    PRODUCTION_COMPLETED: "Production terminée",
    QUALITY_VALIDATED: "Contrôle conforme",
    QUALITY_REJECTED: "Contrôle non conforme",
    MACHINE_STATUS_CHANGED: "État machine modifié",
  };
  return labels[event.eventType] ?? event.eventType.replaceAll("_", " ");
}

function eventTone(event: ManagedHistoryEvent): "neutral" | "success" | "danger" {
  if (["QUALITY_REJECTED", "MACHINE_STATUS_CHANGED"].includes(event.eventType)) return "danger";
  if (["QUALITY_VALIDATED", "PRODUCTION_COMPLETED"].includes(event.eventType)) return "success";
  return "neutral";
}

function Panel({
  title,
  action,
  children,
  className,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}): React.ReactNode {
  return (
    <Card className={className}>
      <CardHeader className="flex-row items-center justify-between space-y-0 border-b border-slate-100 px-5 py-4">
        <CardTitle className="text-sm font-semibold">{title}</CardTitle>
        {action}
      </CardHeader>
      <CardContent className="p-5">{children}</CardContent>
    </Card>
  );
}

function PanelLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <Button variant="ghost" size="sm" className="-mr-2 text-xs text-slate-500" asChild>
      <Link href={href}>
        {children}
        <ArrowUpRight className="size-3.5" />
      </Link>
    </Button>
  );
}

function DashboardSkeleton(): React.ReactNode {
  return (
    <div className="space-y-6" aria-label="Chargement du tableau de bord" role="status">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.85fr_0.9fr]">
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
        <Skeleton className="h-72 rounded-xl" />
      </div>
      <Skeleton className="h-96 rounded-xl" />
    </div>
  );
}

function MachineLoadRow({ machine }: { machine: DashboardMachineLoad }): React.ReactNode {
  const tone =
    machine.status === "MAINTENANCE"
      ? "warning"
      : machine.status === "INACTIVE"
        ? "neutral"
        : "active";
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_minmax(120px,1.25fr)_auto] items-center gap-3">
      <div className="min-w-0">
        <p className="truncate text-sm font-medium text-slate-800">{machine.name}</p>
        <p className="truncate text-xs text-slate-400">
          {machine.type} · {machine.internalNumber}
        </p>
      </div>
      <div>
        <div className="mb-1.5 flex justify-between text-[11px]">
          <span className="font-semibold text-slate-600">{machine.utilization}% actif</span>
          <span className="text-slate-400">{machine.queueCount} en file</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
          <div
            className={`h-full rounded-full ${machine.status === "MAINTENANCE" ? "bg-amber-400" : machine.utilization > 90 ? "bg-nim-red" : "bg-emerald-500"}`}
            style={{ width: `${machine.utilization}%` }}
          />
        </div>
      </div>
      <StatusBadge tone={tone}>
        {machine.status === "MAINTENANCE"
          ? "Maintenance"
          : machine.status === "INACTIVE"
            ? "Inactive"
            : "Active"}
      </StatusBadge>
    </div>
  );
}

function PieceStatus({ status }: { status: DashboardPiece["status"] }): React.ReactNode {
  return (
    <StatusBadge
      tone={
        status === "IN_PROGRESS"
          ? "info"
          : status === "COMPLETED"
            ? "active"
            : status === "DELAYED"
              ? "danger"
              : "neutral"
      }
    >
      {statusLabels[status]}
    </StatusBadge>
  );
}

function PieceRow({ piece }: { piece: DashboardPiece }): React.ReactNode {
  return (
    <tr className="transition-colors hover:bg-slate-50/80">
      <td className="py-4 pr-4 font-semibold text-slate-900">{piece.reference}</td>
      <td className="py-4 pr-4 text-slate-600">{piece.profile}</td>
      <td className="py-4 pr-4 text-slate-600">{piece.lengthMm} mm</td>
      <td className="py-4 pr-4 text-slate-600">{piece.machineName ?? "—"}</td>
      <td className="py-4 pr-4">
        <ProductionProgress completed={piece.completedUnits} total={piece.quantity} />
      </td>
      <td className="py-4 pr-4">
        <PieceStatus status={piece.status} />
      </td>
      <td className="py-4 text-slate-600">{formatDueDate(piece.dueDate)}</td>
    </tr>
  );
}

function PriorityActions({
  summary,
  pendingQualityUnits,
}: {
  summary: DashboardOverview["summary"];
  pendingQualityUnits: number;
}): React.ReactNode {
  const actions = [
    summary.delayedPieces > 0
      ? {
          href: "/offers",
          label: "Pièces en retard",
          detail: "Vérifier les échéances et les ordres concernés",
          count: summary.delayedPieces,
          tone: "text-red-700 bg-red-50",
        }
      : null,
    summary.openNonConformities > 0
      ? {
          href: "/quality",
          label: "Non-conformités atelier",
          detail: "Examiner les signalements à traiter",
          count: summary.openNonConformities,
          tone: "text-red-700 bg-red-50",
        }
      : null,
    pendingQualityUnits > 0
      ? {
          href: "/quality",
          label: "Contrôles qualité en attente",
          detail: "Valider les unités fabriquées",
          count: pendingQualityUnits,
          tone: "text-amber-700 bg-amber-50",
        }
      : null,
    summary.maintenanceMachines > 0
      ? {
          href: "/machines",
          label: "Machines en maintenance",
          detail: "Consulter leur disponibilité et leur charge",
          count: summary.maintenanceMachines,
          tone: "text-amber-700 bg-amber-50",
        }
      : null,
  ].filter((action) => action !== null);

  return (
    <section aria-labelledby="dashboard-priority-title" className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 id="dashboard-priority-title" className="text-base font-semibold text-slate-950">
            À traiter en priorité
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Les actions sont calculées à partir des données actuelles de production.
          </p>
        </div>
        <Badge variant="outline" className="bg-white">
          {actions.length ? `${actions.length} point(s) à suivre` : "Tout est à jour"}
        </Badge>
      </div>
      {actions.length ? (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {actions.map((action) => (
            <Link
              key={action.label}
              href={action.href}
              className="group flex min-h-24 items-start justify-between gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-sm transition-colors hover:border-slate-300 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            >
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-slate-900">{action.label}</span>
                <span className="mt-1 block text-xs leading-5 text-slate-500">{action.detail}</span>
              </span>
              <span
                className={`inline-flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-bold ${action.tone}`}
                aria-label={`${action.count} éléments`}
              >
                {action.count}
              </span>
            </Link>
          ))}
        </div>
      ) : (
        <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50/70 p-4 text-sm text-emerald-800">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden="true" />
          Aucune action prioritaire détectée. Les indicateurs restent disponibles ci-dessous.
        </div>
      )}
    </section>
  );
}

export function DashboardView(): React.ReactNode {
  const { user } = useAuth();
  const [trendDays, setTrendDays] = useState(14);
  const canRead = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const query = useQuery({
    queryKey: ["dashboard", "overview", trendDays],
    queryFn: () => getDashboardOverviewRequest(trendDays),
    enabled: canRead,
    retry: false,
  });
  const firstName = user?.displayName.split(" ")[0] ?? "à vous";

  if (!canRead) return <AccessDenied />;
  const data: DashboardOverview | undefined = query.data;
  const summary = data?.summary;

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Vue d’ensemble"
        title={`Bonjour, ${firstName}`}
        description="Voici l’état réel de la production et des opérations en cours."
        action={
          <div className="flex w-full gap-2 sm:w-auto">
            <Select
              value={String(trendDays)}
              onValueChange={(value) => setTrendDays(Number(value))}
            >
              <SelectTrigger
                className="w-full bg-white sm:w-[150px]"
                aria-label="Periode des tendances"
              >
                <CalendarDays className="size-4 text-slate-400" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">7 derniers jours</SelectItem>
                <SelectItem value="14">14 derniers jours</SelectItem>
                <SelectItem value="30">30 derniers jours</SelectItem>
                <SelectItem value="90">90 derniers jours</SelectItem>
              </SelectContent>
            </Select>
            <Badge variant="outline" className="h-10 gap-2 bg-white px-3 font-medium text-slate-600 dark:bg-slate-950">
              <CalendarDays className="size-4 text-slate-400" />
              Aujourd’hui
            </Badge>
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualiser le tableau de bord"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={`size-4 ${query.isFetching ? "animate-spin" : ""}`} />
            </Button>
          </div>
        }
      />
      {query.isLoading ? (
        <DashboardSkeleton />
      ) : query.isError ? (
        <Card>
          <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
            <p className="font-semibold text-red-700">Impossible de charger le tableau de bord</p>
            <p className="mt-1 text-sm text-slate-500">
              {query.error instanceof ApiError
                ? query.error.message
                : "Vérifiez la connexion à l’API."}
            </p>
            <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
              <RefreshCw className="size-4" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : !data || !summary ? (
        <EmptyState
          title="Aucune donnée de production"
          description="Les indicateurs apparaîtront dès que des pièces et machines seront enregistrées."
        />
      ) : (
        <>
          <PriorityActions
            summary={summary}
            pendingQualityUnits={data.quality?.pendingUnits ?? 0}
          />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
            <KpiCard
              label="Avancement global"
              value={`${summary.progressPercent} %`}
              detail={`${summary.completedUnits} / ${summary.totalUnits} unités fabriquées`}
              icon={Gauge}
              tone="positive"
            />
            <KpiCard
              label="En fabrication"
              value={String(summary.inProductionUnits)}
              detail="Unités actuellement actives"
              icon={CircleDot}
              tone="neutral"
            />
            <KpiCard
              label="Pièces en retard"
              value={String(summary.delayedPieces)}
              detail="Échéance dépassée"
              icon={AlertTriangle}
              tone="danger"
            />
            <KpiCard
              label="Machines actives"
              value={String(summary.activeMachines)}
              detail={`sur ${summary.totalMachines} machines`}
              icon={Factory}
              tone="positive"
            />
            <KpiCard
              label="En maintenance"
              value={String(summary.maintenanceMachines)}
              detail="Machines indisponibles"
              icon={Wrench}
              tone="warning"
              className="col-span-2 sm:col-span-1"
            />
            <KpiCard
              label="NC atelier ouvertes"
              value={String(summary.openNonConformities ?? 0)}
              detail="À traiter en qualité"
              icon={AlertTriangle}
              tone={summary.openNonConformities ? "danger" : "positive"}
            />
          </div>
          <div className="grid gap-5 xl:grid-cols-[1.2fr_0.85fr_0.9fr]">
            <Panel
              title="Charge des machines"
              action={<PanelLink href="/machines">Voir toutes</PanelLink>}
            >
              <div className="space-y-4">
                {data.machineLoads.length ? (
                  data.machineLoads
                    .slice(0, 6)
                    .map((machine) => <MachineLoadRow key={machine.id} machine={machine} />)
                ) : (
                  <EmptyState
                    title="Aucune machine"
                    description="Ajoutez une machine pour suivre sa charge."
                  />
                )}
              </div>
            </Panel>
            <Panel
              title="Activité récente"
              action={<PanelLink href="/history">Voir tout</PanelLink>}
            >
              <div>
                {data.recentActivity.length ? (
                  data.recentActivity
                    .slice(0, 5)
                    .map((event) => (
                      <TimelineItem
                        key={event.id}
                        time={formatDate(event.createdAt)}
                        title={eventTitle(event)}
                        detail={`${event.actorName ?? "Système"} · ${event.entityType}`}
                        tone={eventTone(event)}
                      />
                    ))
                ) : (
                  <EmptyState
                    title="Aucune activité"
                    description="Les événements de production apparaîtront ici."
                  />
                )}
              </div>
            </Panel>
            <Panel
              title="Pièces en retard"
              action={<PanelLink href="/offers">Voir toutes</PanelLink>}
            >
              <div className="divide-y divide-slate-100">
                {data.delayedPieces.length ? (
                  data.delayedPieces.slice(0, 5).map((piece) => (
                    <div
                      key={piece.id}
                      className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-800">{piece.reference}</p>
                        <p className="mt-0.5 text-xs text-nim-red">
                          {piece.delayDays} jour{piece.delayDays > 1 ? "s" : ""} de retard
                        </p>
                      </div>
                      <span className="text-xs text-slate-500">{piece.quantity} pcs</span>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="Aucun retard"
                    description="Toutes les échéances sont maîtrisées."
                  />
                )}
              </div>
              {data.delayedPieces.length ? (
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-red-50 p-3 text-xs leading-5 text-red-700">
                  <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
                  {data.delayedPieces.length} pièce
                  {data.delayedPieces.length > 1 ? "s nécessitent" : " nécessite"} une attention.
                </div>
              ) : null}
            </Panel>
          </div>
          <DashboardCharts
            machineLoads={data.machineLoads}
            statusBreakdown={data.statusBreakdown ?? []}
            unitStatusBreakdown={data.unitStatusBreakdown ?? []}
            priorityBreakdown={data.priorityBreakdown ?? []}
            quality={
              data.quality ?? {
                pendingUnits: 0,
                inspectedUnits: 0,
                conformUnits: 0,
                nonConformUnits: 0,
                conformityRate: 0,
                defectBreakdown: [],
                dispositionBreakdown: [],
                pendingDeviationCount: 0,
              }
            }
            dueDateSummary={
              data.dueDateSummary ?? {
                overduePieces: summary.delayedPieces,
                dueTodayPieces: 0,
                dueNextSevenDaysPieces: 0,
                withoutDueDatePieces: 0,
              }
            }
            productionTrend={data.productionTrend ?? []}
            trendDays={data.trendDays ?? trendDays}
          />
          <Panel
            title="Pièces en cours"
            action={<PanelLink href="/offers">Ouvrir les ordres</PanelLink>}
          >
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Repère</th>
                    <th className="pb-3 pr-4 font-medium">Profilé</th>
                    <th className="pb-3 pr-4 font-medium">Longueur</th>
                    <th className="pb-3 pr-4 font-medium">Machine</th>
                    <th className="pb-3 pr-4 font-medium">Progression</th>
                    <th className="pb-3 pr-4 font-medium">Statut</th>
                    <th className="pb-3 font-medium">Échéance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.activePieces.length ? (
                    data.activePieces.map((piece) => <PieceRow key={piece.id} piece={piece} />)
                  ) : (
                    <tr>
                      <td colSpan={7} className="py-12">
                        <EmptyState
                          title="Aucune pièce planifiée"
                          description="Créez un ordre de production pour commencer."
                        />
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <div className="space-y-3 md:hidden">
              {data.activePieces.length ? (
                data.activePieces.map((piece) => (
                  <div key={piece.id} className="rounded-lg border border-slate-100 p-3">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-semibold text-slate-900">{piece.reference}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {piece.profile} · {piece.lengthMm} mm
                        </p>
                      </div>
                      <PieceStatus status={piece.status} />
                    </div>
                    <div className="mt-3 flex items-end justify-between gap-4">
                      <ProductionProgress completed={piece.completedUnits} total={piece.quantity} />
                      <p className="text-right text-xs text-slate-500">
                        {piece.machineName ?? "Sans machine"}
                        <br />
                        Échéance {formatDueDate(piece.dueDate)}
                      </p>
                    </div>
                    <Badge variant="outline" className="mt-3">
                      Priorité {priorityLabels[piece.priority]}
                    </Badge>
                  </div>
                ))
              ) : (
                <EmptyState
                  title="Aucune pièce planifiée"
                  description="Créez un ordre de production pour commencer."
                />
              )}
            </div>
          </Panel>
          <div className="grid gap-5 lg:grid-cols-2">
            <Panel title="Raccourcis opérationnels">
              <div className="grid gap-2 sm:grid-cols-3">
                <Button
                  variant="outline"
                  className="h-auto min-h-24 flex-col items-start justify-start whitespace-normal p-3 text-left text-xs"
                  asChild
                >
                  <Link href="/quality">
                    <CheckCircle2 className="mb-3 size-5 text-emerald-600" />
                    Contrôles en attente
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-24 flex-col items-start justify-start whitespace-normal p-3 text-left text-xs"
                  asChild
                >
                  <Link href="/machines">
                    <Factory className="mb-3 size-5 text-slate-600" />
                    Vue machines
                  </Link>
                </Button>
                <Button
                  variant="outline"
                  className="h-auto min-h-24 flex-col items-start justify-start whitespace-normal p-3 text-left text-xs"
                  asChild
                >
                  <Link href="/history">
                    <Gauge className="mb-3 size-5 text-slate-600" />
                    Historique
                  </Link>
                </Button>
              </div>
            </Panel>
            <Panel title="Contexte de la journée">
              <p className="text-sm leading-6 text-slate-600">
                Les indicateurs sont calculés depuis les ordres, unités, machines et événements
                persistés dans PostgreSQL.
              </p>
              <p className="mt-3 text-xs text-slate-400">
                Dernière actualisation : {formatDate(new Date().toISOString())}
              </p>
            </Panel>
          </div>
        </>
      )}
    </div>
  );
}
