"use client";

import type { MachineStatus } from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import { Activity, ArrowLeft, Copy, Factory, RefreshCw, Scissors, Users, Wrench } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { toast } from "sonner";
import { ApiError, getMachineHistoryRequest, getMachineRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { CuttingBarStatusBadge } from "@/features/offers/offer-bar-ui";
import { eventLabel } from "@/features/history/event-labels";

const statusLabels: Record<MachineStatus, string> = {
  ACTIVE: "Active",
  MAINTENANCE: "Maintenance",
  INACTIVE: "Inactive",
};
const statusTones: Record<MachineStatus, "active" | "warning" | "neutral"> = {
  ACTIVE: "active",
  MAINTENANCE: "warning",
  INACTIVE: "neutral",
};
function date(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function DetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactNode {
  return (
    <div
      className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/40 p-8 text-center"
      role="alert"
    >
      <p className="font-semibold text-red-800">Impossible de charger la machine</p>
      <p className="mt-1 max-w-md text-sm text-red-700">{message}</p>
      <Button type="button" variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="size-4" />
        Réessayer
      </Button>
    </div>
  );
}

export function MachineDetailView(): React.ReactNode {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const canViewHistory = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const machineQuery = useQuery({
    queryKey: ["machine", id],
    queryFn: () => getMachineRequest(id),
    enabled: Boolean(id),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["history", "machine", id],
    queryFn: () => getMachineHistoryRequest(id, { pageSize: 8 }),
    enabled: Boolean(id) && canViewHistory,
    retry: false,
  });

  if (machineQuery.isLoading)
    return (
      <div className="space-y-6" aria-label="Chargement" role="status">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  if (machineQuery.isError)
    return (
      <DetailError
        message={
          machineQuery.error instanceof ApiError
            ? machineQuery.error.message
            : "Vérifiez la connexion à l’API."
        }
        onRetry={() => void machineQuery.refetch()}
      />
    );
  const machine = machineQuery.data?.machine;
  if (!machine)
    return (
      <EmptyState
        title="Machine introuvable"
        description="Cette machine n’existe plus ou n’est pas disponible."
      />
    );
  const history = historyQuery.data?.events ?? [];
  const refresh = async (): Promise<void> => {
    await machineQuery.refetch();
    if (canViewHistory) await historyQuery.refetch();
  };
  const copyInternalNumber = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(machine.internalNumber);
      toast.success("Numéro interne copié");
    } catch {
      toast.error("Impossible de copier le numéro interne.");
    }
  };

  return (
    <div className="space-y-6">
      <Link
        href="/machines"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-nim-red"
      >
        <ArrowLeft className="size-4" />
        Retour aux machines
      </Link>
      <PageHeader
        eyebrow="Atelier"
        title={machine.name}
        description={`${machine.internalNumber} · ${machine.type} · ${machine.location ?? "Emplacement non renseigné"}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void copyInternalNumber()}
            >
              <Copy className="size-4" />
              Copier le numéro
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={machineQuery.isFetching || historyQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${machineQuery.isFetching || historyQuery.isFetching ? "animate-spin" : ""}`}
              />
              Actualiser
            </Button>
            <StatusBadge tone={statusTones[machine.status]}>
              {statusLabels[machine.status]}
            </StatusBadge>
          </div>
        }
      />

      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        {[
          {
            label: "À lancer",
            value: machine.barMetrics.assigned,
            icon: Factory,
            tone: "text-slate-600 bg-slate-100 dark:bg-slate-900 dark:text-slate-300",
          },
          {
            label: "En fabrication",
            value: machine.barMetrics.inProgress,
            icon: Wrench,
            tone: "text-nim-red bg-red-50",
          },
          {
            label: "Fabriquées aujourd’hui",
            value: machine.barMetrics.fabricatedToday,
            icon: Scissors,
            tone: "text-emerald-600 bg-emerald-50",
          },
          {
            label: "Barres associées",
            value: machine.assignedBarCount,
            icon: Scissors,
            tone: "text-slate-600 bg-slate-100 dark:bg-slate-900 dark:text-slate-300",
          },
        ].map(({ label, value, icon: Icon, tone }) => (
          <Card key={label}>
            <CardContent className="flex items-center gap-3 p-4">
              <div className={`rounded-lg p-2.5 ${tone}`}>
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-xs text-slate-500">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">
                  {value}
                </p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Users className="size-4 text-slate-500" />Équipe machine</CardTitle>
          </CardHeader>
          <CardContent>
            {machine.activeSession ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge className="bg-emerald-50 text-emerald-800 hover:bg-emerald-50">Session active</Badge>
                  <span className="text-xs text-slate-500">Depuis {date(machine.activeSession.startedAt)}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {machine.activeSession.team.map((member) => (
                    <span key={member.id} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700">
                      {member.displayName}{member.role === "LEAD" ? " · principal" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : <EmptyState title="Aucune équipe active" description="Les opérateurs apparaîtront ici après l’ouverture d’une session sur la tablette machine." />}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm"><Activity className="size-4 text-nim-red" />Fabrication en cours</CardTitle>
          </CardHeader>
          <CardContent>
            {machine.currentProductionRun ? (
              <div className="rounded-lg border border-red-100 bg-red-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="font-semibold text-slate-950">{machine.currentProductionRun.barReference}</p><p className="mt-1 text-xs text-slate-600">{machine.currentProductionRun.offerReference} · {machine.currentProductionRun.profile} · {machine.currentProductionRun.pieceCount} pièce(s)</p></div>
                  <Badge className="bg-red-100 text-red-800 hover:bg-red-100">Lancée</Badge>
                </div>
                <p className="mt-3 text-xs text-slate-600">Début · {date(machine.currentProductionRun.startedAt)}</p>
                <p className="mt-1 text-xs text-slate-600">Équipe · {machine.currentProductionRun.team.map((member) => member.displayName).join(" · ")}</p>
                {machine.currentProductionRun.openNonConformityCount ? <p className="mt-2 text-xs font-medium text-red-800">{machine.currentProductionRun.openNonConformityCount} non-conformité(s) ouverte(s)</p> : null}
                <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0"><Link href={`/offers/${machine.currentProductionRun.offerId}/production`}>Suivre l’offre</Link></Button>
              </div>
            ) : <EmptyState title="Aucune fabrication active" description="La barre en cours et son équipe seront affichées ici dès son lancement." />}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Barres associées à la machine</CardTitle>
          <p className="text-xs text-slate-500">
            Le total historique de barres fabriquées est de {machine.barMetrics.fabricatedTotal}.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {machine.cuttingBars.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucune barre associée"
                description="Les barres seront visibles ici après leur affectation à cette machine."
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Barres associées à {machine.name}</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Barre</th>
                      <th className="px-5 py-3 font-medium">Affaire</th>
                      <th className="px-5 py-3 font-medium">Profil</th>
                      <th className="px-5 py-3 font-medium">Longueur brute</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {machine.cuttingBars.map((bar) => (
                      <tr key={bar.id}>
                        <td className="px-5 py-4 font-semibold">
                          <Link
                            href={`/offers/${bar.offerId}/bars/${bar.id}`}
                            className="hover:text-nim-red"
                          >
                            {bar.reference}
                          </Link>
                        </td>
                        <td className="px-5 py-4">
                          <Link href={`/offers/${bar.offerId}`} className="hover:text-nim-red">
                            {bar.offerReference}
                          </Link>
                        </td>
                        <td className="px-5 py-4">{bar.profile}</td>
                        <td className="px-5 py-4 tabular-nums">
                          {bar.rawLengthMm.toLocaleString("fr-FR")} mm
                        </td>
                        <td className="px-5 py-4">
                          <CuttingBarStatusBadge status={bar.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {machine.cuttingBars.map((bar) => (
                  <div
                    key={bar.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <Link
                        href={`/offers/${bar.offerId}/bars/${bar.id}`}
                        className="font-semibold hover:text-nim-red"
                      >
                        {bar.reference}
                      </Link>
                      <CuttingBarStatusBadge status={bar.status} />
                    </div>
                    <Link
                      href={`/offers/${bar.offerId}`}
                      className="mt-1 block text-xs text-slate-500 hover:text-nim-red"
                    >
                      {bar.offerReference} · {bar.profile}
                    </Link>
                    <p className="mt-2 text-xs text-slate-500">
                      {bar.rawLengthMm.toLocaleString("fr-FR")} mm bruts
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activité récente de la machine</CardTitle>
          <p className="text-xs text-slate-500">
            Affectations, maintenance et opérations associées. Les anciennes affectations unitaires restent disponibles dans l’historique global.
          </p>
        </CardHeader>
        <CardContent>
          {!canViewHistory ? (
            <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900">
              L’historique détaillé est réservé aux responsables de production.
            </p>
          ) : historyQuery.isLoading ? (
            <div className="space-y-4">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-12 w-full" />
              ))}
            </div>
          ) : historyQuery.isError ? (
            <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
              {historyQuery.error instanceof ApiError
                ? historyQuery.error.message
                : "Historique indisponible."}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-3"
                onClick={() => void historyQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : history.length === 0 ? (
            <EmptyState
              title="Aucun événement"
              description="Les événements liés à cette machine apparaîtront ici."
            />
          ) : (
            <ol className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {history.map((event) => (
                <li key={event.id} className="relative rounded-lg border border-slate-200 p-4 pl-10 dark:border-slate-800">
                  <span className="absolute left-4 top-4 flex size-4 items-center justify-center rounded-full bg-nim-red/10 text-nim-red">
                    <Wrench className="size-3" />
                  </span>
                  <p className="text-sm font-semibold text-slate-800 dark:text-slate-100">
                    {eventLabel(event.eventType)}
                  </p>
                  <p className="mt-1 text-xs text-slate-500">
                    {date(event.createdAt)} · {event.actorName ?? "Système"}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <Factory className="size-4" />
        Données affichées depuis l’API et la base de production.
      </div>
    </div>
  );
}
