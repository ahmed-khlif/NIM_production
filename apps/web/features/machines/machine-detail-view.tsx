"use client";

import { Table } from "@/components/ui/table";
import type { MachineStatus } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  AlertTriangle,
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Check,
  Copy,
  CalendarClock,
  Factory,
  RefreshCw,
  Scissors,
  Search,
  Users,
  Unlink,
  Wrench,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ApiError,
  getMachineHistoryRequest,
  getMachineRequest,
  getMachineReleasableBarsRequest,
  unassignOfferBarRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { ReturnLink } from "@/components/navigation/return-navigation";
import { CuttingBarStatusBadge } from "@/features/offers/offer-bar-ui";
import { eventLabel } from "@/features/history/event-labels";
import { Input } from "@/components/ui/input";
import { useEffect, useState } from "react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

type ReleasableMachineBar = {
  id: string;
  offerId: string;
  offerReference: string;
  reference: string;
};

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
  const router = useRouter();
  const [barPage, setBarPage] = useState(1);
  const [barSearch, setBarSearch] = useState("");
  const [barSearchQuery, setBarSearchQuery] = useState("");
  const [barStatus, setBarStatus] = useState("ALL");
  const [barToUnassign, setBarToUnassign] = useState<ReleasableMachineBar | null>(null);
  const [selectedBars, setSelectedBars] = useState<Record<string, ReleasableMachineBar>>({});
  const [selectedAllIds, setSelectedAllIds] = useState<string[]>([]);
  const [selectingAll, setSelectingAll] = useState(false);
  const [barSort, setBarSort] = useState<{ column: string; direction: "asc" | "desc" }>({
    column: "Profil",
    direction: "asc",
  });
  const [bulkReleaseOpen, setBulkReleaseOpen] = useState(false);
  const queryClient = useQueryClient();
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setBarSearchQuery(barSearch.trim());
      setBarPage(1);
    }, 250);
    return () => window.clearTimeout(timer);
  }, [barSearch, barStatus]);
  const { user } = useAuth();
  const canViewHistory = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const canManageBars = canViewHistory;
  const machineQuery = useQuery({
    queryKey: ["machine", id, barPage, barSearchQuery, barStatus, barSort],
    queryFn: () =>
      getMachineRequest(id, {
        page: barPage,
        pageSize: 10,
        search: barSearchQuery,
        status: barStatus,
        sortBy:
          (
            {
              Barre: "reference",
              Affaire: "offer",
              Profil: "profile",
              "Longueur brute": "rawLengthMm",
              Statut: "status",
            } as Record<string, string>
          )[barSort.column] ?? "profile",
        sortDirection: barSort.direction,
      }),
    enabled: Boolean(id),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["history", "machine", id],
    queryFn: () => getMachineHistoryRequest(id, { pageSize: 8 }),
    enabled: Boolean(id) && canViewHistory,
    retry: false,
  });
  const unassignMutation = useMutation({
    mutationFn: (bar: ReleasableMachineBar) => unassignOfferBarRequest(bar.offerId, bar.id),
    onSuccess: async (_, bar) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["machine", id] }),
        queryClient.invalidateQueries({ queryKey: ["machines"] }),
        queryClient.invalidateQueries({ queryKey: ["offer", bar.offerId] }),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
      ]);
      setBarToUnassign(null);
      toast.success(`${bar.reference} libérée.`, {
        description: "La barre est disponible pour une nouvelle affectation.",
        action: {
          label: "Réaffecter",
          onClick: () =>
            router.push(
              `/offers/${bar.offerId}/bar-assignments?search=${encodeURIComponent(bar.reference)}`,
            ),
        },
      });
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Impossible de libérer cette barre. Actualisez la machine puis réessayez.",
      ),
  });
  const bulkUnassignMutation = useMutation({
    mutationFn: async (bars: ReleasableMachineBar[]) => {
      const results: Array<{ bar: ReleasableMachineBar; error?: string }> = [];
      for (const bar of bars) {
        try {
          await unassignOfferBarRequest(bar.offerId, bar.id);
          results.push({ bar });
        } catch (error) {
          results.push({
            bar,
            error:
              error instanceof ApiError
                ? error.message
                : "La barre n’a pas pu être libérée. Actualisez puis réessayez.",
          });
        }
      }
      return results;
    },
    onSuccess: async (results) => {
      const successful = results.filter((result) => !result.error);
      const failed = results.filter((result) => result.error);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["machine", id] }),
        queryClient.invalidateQueries({ queryKey: ["machines"] }),
        ...[...new Set(results.map((result) => result.bar.offerId))].map((offerId) =>
          queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
        ),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
      ]);
      setSelectedBars({});
      setSelectedAllIds([]);
      setBulkReleaseOpen(false);
      if (successful.length > 0)
        toast.success(`${successful.length} barre(s) libérée(s).`, {
          description:
            "Les affectations restent dans l’historique et les barres peuvent être réaffectées.",
          ...(successful.every((result) => result.bar.offerId === successful[0]?.bar.offerId)
            ? {
                action: {
                  label: "Réaffecter",
                  onClick: () => {
                    const first = successful[0]?.bar;
                    if (first)
                      router.push(
                        `/offers/${first.offerId}/bar-assignments?search=${encodeURIComponent(first.reference)}`,
                      );
                  },
                },
              }
            : {}),
        });
      if (failed.length > 0)
        toast.error(`${failed.length} barre(s) n’ont pas été libérées.`, {
          description: failed.map(({ bar, error }) => `${bar.reference} : ${error}`).join(" · "),
          duration: 9000,
        });
    },
    onError: (error) =>
      toast.error(
        error instanceof Error ? error.message : "Impossible de libérer les barres sélectionnées.",
      ),
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
  const eligibleBars =
    canManageBars && machine.status === "MAINTENANCE"
      ? machine.cuttingBars
          .filter((bar) => bar.status === "AFFECTEE")
          .map((bar) => ({
            id: bar.id,
            offerId: bar.offerId,
            offerReference: bar.offerReference,
            reference: bar.reference,
          }))
      : [];
  const selectedBarList = Object.values(selectedBars);
  const allEligibleSelected =
    selectedAllIds.length > 0 && selectedAllIds.every((barId) => selectedBars[barId]);
  const selectAllMatchingBars = async (): Promise<void> => {
    if (allEligibleSelected) {
      setSelectedBars((current) => {
        const next = { ...current };
        selectedAllIds.forEach((barId) => delete next[barId]);
        return next;
      });
      setSelectedAllIds([]);
      return;
    }
    setSelectingAll(true);
    try {
      const firstPage = await getMachineReleasableBarsRequest(id, {
        page: 1,
        pageSize: 50,
        search: barSearchQuery,
      });
      const selected = [...firstPage.bars];
      for (let page = 2; page <= firstPage.pagination.totalPages; page += 1) {
        const result = await getMachineReleasableBarsRequest(id, {
          page,
          pageSize: 50,
          search: barSearchQuery,
        });
        selected.push(...result.bars);
      }
      setSelectedBars((current) => ({
        ...current,
        ...Object.fromEntries(selected.map((bar) => [bar.id, bar])),
      }));
      setSelectedAllIds(selected.map((bar) => bar.id));
      toast.success(
        `${selected.length} barre(s) affectée(s) sélectionnée(s) dans tous les résultats.`,
      );
    } catch (error) {
      toast.error(
        error instanceof ApiError
          ? error.message
          : "Impossible de charger toutes les barres filtrées.",
      );
    } finally {
      setSelectingAll(false);
    }
  };
  const toggleBarSelection = (bar: ReleasableMachineBar): void => {
    setSelectedBars((current) => {
      const next = { ...current };
      if (next[bar.id]) delete next[bar.id];
      else next[bar.id] = bar;
      return next;
    });
  };
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
      <ReturnLink
        href="/machines"
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-nim-red"
      >
        <ArrowLeft className="size-4" />
        Retour aux machines
      </ReturnLink>
      <PageHeader
        eyebrow="Atelier"
        title={machine.name}
        description={`${machine.internalNumber} · ${machine.type} · ${machine.location ?? "Emplacement non renseigné"}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {canManageBars ? (
              <Button asChild variant="outline" size="sm">
                <Link href={`/machines/${id}/planning`}>
                  <CalendarClock className="size-4" />
                  Planning
                </Link>
              </Button>
            ) : null}
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

      {machine.status === "MAINTENANCE" ? (
        <section
          role="alert"
          className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"
        >
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold">Machine en maintenance</h2>
              <p className="mt-1 text-sm">
                {machine.barMetrics.assigned > 0
                  ? `${machine.barMetrics.assigned} barre(s) affectée(s) attendent une décision. Libérez-les ici pour les rendre disponibles à une nouvelle affectation. Les barres déjà fabriquées restent dans l’historique.`
                  : "Aucune barre en attente d’affectation n’a besoin d’être libérée. Les nouvelles affectations et les nouveaux lancements sont bloqués."}
              </p>
              {machine.currentProductionRun ? (
                <p className="mt-2 rounded-lg border border-amber-300 bg-white/70 p-3 text-sm font-medium dark:border-amber-800 dark:bg-slate-950/60">
                  La barre {machine.currentProductionRun.barReference} est déjà en cours. Elle peut
                  être terminée normalement; aucune nouvelle barre ne peut être lancée.
                </p>
              ) : machine.barMetrics.inProgress > 0 ? (
                <p className="mt-2 text-sm font-medium">
                  {machine.barMetrics.inProgress} barre(s) sont marquées « en fabrication ».
                  Vérifiez leur exécution avant toute intervention de maintenance.
                </p>
              ) : null}
              {machine.barMetrics.assigned > 0 ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="mt-3 border-red-300 bg-white/80 dark:border-red-900 dark:bg-slate-950"
                  onClick={() => {
                    setBarSearch("");
                    setBarSearchQuery("");
                    setBarStatus("AFFECTEE");
                    setBarPage(1);
                    setSelectedBars({});
                    setSelectedAllIds([]);
                  }}
                >
                  Afficher les {machine.barMetrics.assigned} barres à libérer
                </Button>
              ) : null}
            </div>
          </div>
        </section>
      ) : null}

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
            <CardTitle className="flex items-center gap-2 text-sm">
              <Users className="size-4 text-slate-500" />
              Équipe machine
            </CardTitle>
          </CardHeader>
          <CardContent>
            {machine.activeSession ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge tone="active">Session active</StatusBadge>
                  <span className="text-xs text-slate-500">
                    Depuis {date(machine.activeSession.startedAt)}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {machine.activeSession.team.map((member) => (
                    <span
                      key={member.id}
                      className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-medium text-slate-700"
                    >
                      {member.displayName}
                      {member.role === "LEAD" ? " · principal" : ""}
                    </span>
                  ))}
                </div>
              </div>
            ) : (
              <EmptyState
                title="Aucune équipe active"
                description="Les opérateurs apparaîtront ici après l’ouverture d’une session sur la tablette machine."
              />
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-sm">
              <Activity className="size-4 text-nim-red" />
              Fabrication en cours
            </CardTitle>
          </CardHeader>
          <CardContent>
            {machine.currentProductionRun ? (
              <div className="rounded-lg border border-red-100 bg-red-50/60 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-950">
                      {machine.currentProductionRun.barReference}
                    </p>
                    <p className="mt-1 text-xs text-slate-600">
                      {machine.currentProductionRun.offerReference} ·{" "}
                      {machine.currentProductionRun.profile} ·{" "}
                      {machine.currentProductionRun.pieceCount} pièce(s)
                    </p>
                  </div>
                  <StatusBadge tone="warning">Lancée</StatusBadge>
                </div>
                <p className="mt-3 text-xs text-slate-600">
                  Début · {date(machine.currentProductionRun.startedAt)}
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Équipe ·{" "}
                  {machine.currentProductionRun.team
                    .map((member) => member.displayName)
                    .join(" · ")}
                </p>
                {machine.currentProductionRun.openNonConformityCount ? (
                  <p className="mt-2 text-xs font-medium text-red-800">
                    {machine.currentProductionRun.openNonConformityCount} non-conformité(s)
                    ouverte(s)
                  </p>
                ) : null}
                <Button asChild variant="link" size="sm" className="mt-2 h-auto px-0">
                  <Link href={`/offers/${machine.currentProductionRun.offerId}/production`}>
                    Suivre l’offre
                  </Link>
                </Button>
              </div>
            ) : (
              <EmptyState
                title="Aucune fabrication active"
                description="La barre en cours et son équipe seront affichées ici dès son lancement."
              />
            )}
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="nim-sticky-table-tools">
          <CardTitle className="text-sm">Barres associées à la machine</CardTitle>
          <p className="text-xs text-slate-500">
            Le total historique de barres fabriquées est de {machine.barMetrics.fabricatedTotal}.
          </p>
          <div className="grid gap-2 pt-2 sm:grid-cols-[minmax(0,1fr)_180px]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                aria-label="Rechercher une barre"
                className="pl-9"
                value={barSearch}
                disabled={selectingAll}
                onChange={(event) => {
                  setBarSearch(event.target.value);
                  setSelectedBars({});
                  setSelectedAllIds([]);
                }}
                placeholder="Référence, profil ou affaire…"
              />
            </div>
            <select
              aria-label="Filtrer les barres par statut"
              className="h-10 rounded-md border border-slate-200 bg-background px-3 text-sm dark:border-slate-800"
              value={barStatus}
              disabled={selectingAll}
              onChange={(event) => {
                setBarStatus(event.target.value);
                setBarPage(1);
                setSelectedBars({});
                setSelectedAllIds([]);
              }}
            >
              <option value="ALL">Tous les statuts</option>
              <option value="AFFECTEE">Affectée</option>
              <option value="LANCEE">En fabrication</option>
              <option value="FABRIQUEE">Fabriquée</option>
              <option value="NON_CONFORME">Non conforme</option>
            </select>
          </div>
          {canManageBars && machine.status === "MAINTENANCE" ? (
            <div className="flex flex-col gap-2 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <div className="flex flex-wrap items-center gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  onClick={() => void selectAllMatchingBars()}
                  disabled={
                    selectingAll ||
                    barSearch.trim() !== barSearchQuery ||
                    (eligibleBars.length === 0 &&
                      barStatus !== "ALL" &&
                      barStatus !== "AFFECTEE") ||
                    bulkUnassignMutation.isPending
                  }
                >
                  {selectingAll ? (
                    <RefreshCw className="size-4 animate-spin" />
                  ) : (
                    <Check className="size-4" />
                  )}
                  {selectingAll
                    ? "Chargement des résultats…"
                    : allEligibleSelected
                      ? "Tout désélectionner"
                      : "Tout sélectionner (tous les résultats)"}
                </Button>
                <span className="text-xs text-slate-500">
                  {machine.barMetrics.assigned} barre(s) affectée(s) sur cette machine ·{" "}
                  {selectedBarList.length} sélectionnée(s) sur tous les résultats
                </span>
              </div>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                onClick={() => setBulkReleaseOpen(true)}
                disabled={selectedBarList.length === 0 || bulkUnassignMutation.isPending}
              >
                <Unlink className="size-4" />
                Libérer la sélection ({selectedBarList.length})
              </Button>
            </div>
          ) : null}
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
                <Table
                  className="nim-data-table w-full text-left text-sm"
                  serverSorting={barSort}
                  onServerSort={(column, direction) => {
                    if (["Barre", "Affaire", "Profil", "Longueur brute", "Statut"].includes(column))
                      setBarSort({ column, direction });
                    setBarPage(1);
                  }}
                >
                  <caption className="sr-only">Barres associées à {machine.name}</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      {canManageBars && machine.status === "MAINTENANCE" ? (
                        <th className="w-12 px-3 py-3 font-medium">
                          <span className="sr-only">Sélection</span>
                        </th>
                      ) : null}
                      <th className="px-5 py-3 font-medium">Barre</th>
                      <th className="px-5 py-3 font-medium">Affaire</th>
                      <th className="px-5 py-3 font-medium">Profil</th>
                      <th className="px-5 py-3 font-medium">Longueur brute</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      {canManageBars && machine.status === "MAINTENANCE" ? (
                        <th className="px-5 py-3 text-right font-medium">Action</th>
                      ) : null}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {machine.cuttingBars.map((bar) => (
                      <tr key={bar.id}>
                        {canManageBars && machine.status === "MAINTENANCE" ? (
                          <td className="px-3 py-4">
                            {bar.status === "AFFECTEE" ? (
                              <input
                                type="checkbox"
                                aria-label={`Sélectionner ${bar.reference}`}
                                checked={Boolean(selectedBars[bar.id])}
                                disabled={bulkUnassignMutation.isPending}
                                onChange={() =>
                                  toggleBarSelection({
                                    id: bar.id,
                                    offerId: bar.offerId,
                                    offerReference: bar.offerReference,
                                    reference: bar.reference,
                                  })
                                }
                                className="size-4 rounded border-slate-300 accent-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                              />
                            ) : null}
                          </td>
                        ) : null}
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
                        {canManageBars && machine.status === "MAINTENANCE" ? (
                          <td className="px-5 py-3 text-right">
                            {bar.status === "AFFECTEE" ? (
                              <Button
                                type="button"
                                size="sm"
                                variant="outline"
                                disabled={bulkUnassignMutation.isPending}
                                onClick={() =>
                                  setBarToUnassign({
                                    id: bar.id,
                                    offerId: bar.offerId,
                                    offerReference: bar.offerReference,
                                    reference: bar.reference,
                                  })
                                }
                              >
                                <Unlink className="size-4" />
                                Libérer
                              </Button>
                            ) : bar.status === "LANCEE" ? (
                              <span className="text-xs text-amber-700 dark:text-amber-300">
                                À terminer
                              </span>
                            ) : (
                              <span className="text-xs text-slate-400">Historique conservé</span>
                            )}
                          </td>
                        ) : null}
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {machine.cuttingBars.map((bar) => (
                  <div
                    key={bar.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-start gap-2">
                        {canManageBars &&
                        machine.status === "MAINTENANCE" &&
                        bar.status === "AFFECTEE" ? (
                          <input
                            type="checkbox"
                            aria-label={`Sélectionner ${bar.reference}`}
                            checked={Boolean(selectedBars[bar.id])}
                            disabled={bulkUnassignMutation.isPending}
                            onChange={() =>
                              toggleBarSelection({
                                id: bar.id,
                                offerId: bar.offerId,
                                offerReference: bar.offerReference,
                                reference: bar.reference,
                              })
                            }
                            className="mt-1 size-4 shrink-0 rounded border-slate-300 accent-red-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2"
                          />
                        ) : null}
                        <Link
                          href={`/offers/${bar.offerId}/bars/${bar.id}`}
                          className="min-w-0 break-all font-semibold hover:text-nim-red"
                        >
                          {bar.reference}
                        </Link>
                      </div>
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
                    {canManageBars && machine.status === "MAINTENANCE" ? (
                      <div className="mt-3 flex justify-end">
                        {bar.status === "AFFECTEE" ? (
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            disabled={bulkUnassignMutation.isPending}
                            onClick={() =>
                              setBarToUnassign({
                                id: bar.id,
                                offerId: bar.offerId,
                                offerReference: bar.offerReference,
                                reference: bar.reference,
                              })
                            }
                          >
                            <Unlink className="size-4" />
                            Libérer
                          </Button>
                        ) : bar.status === "LANCEE" ? (
                          <span className="text-xs text-amber-700 dark:text-amber-300">
                            À terminer
                          </span>
                        ) : (
                          <span className="text-xs text-slate-400">Historique conservé</span>
                        )}
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
          {machine.cuttingBarsPagination.total > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 px-4 py-3 text-sm dark:border-slate-800">
              <span className="text-slate-500">
                {machine.cuttingBarsPagination.total} barre(s) · page{" "}
                {machine.cuttingBarsPagination.page} / {machine.cuttingBarsPagination.totalPages}
              </span>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={barPage <= 1 || machineQuery.isFetching}
                  onClick={() => {
                    setBarPage((page) => Math.max(1, page - 1));
                  }}
                >
                  <ChevronLeft className="size-4" />
                  Précédent
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={
                    barPage >= machine.cuttingBarsPagination.totalPages || machineQuery.isFetching
                  }
                  onClick={() => {
                    setBarPage((page) => page + 1);
                  }}
                >
                  Suivant
                  <ChevronRight className="size-4" />
                </Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Activité récente de la machine</CardTitle>
          <p className="text-xs text-slate-500">
            Affectations, maintenance et opérations associées. Les anciennes affectations unitaires
            restent disponibles dans l’historique global.
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
                <li
                  key={event.id}
                  className="relative rounded-lg border border-slate-200 p-4 pl-10 dark:border-slate-800"
                >
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
      <AlertDialog
        open={Boolean(barToUnassign)}
        onOpenChange={(open) => {
          if (!open && !unassignMutation.isPending) setBarToUnassign(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Libérer cette barre de la machine ?</AlertDialogTitle>
            <AlertDialogDescription>
              {barToUnassign ? (
                <>
                  <strong>{barToUnassign.reference}</strong> · Affaire{" "}
                  {barToUnassign.offerReference}. La barre et ses pièces façonnées redeviendront
                  disponibles pour une affectation sur une machine active. L’historique
                  d’affectation sera conservé.
                </>
              ) : null}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassignMutation.isPending}>
              Garder l’affectation
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={unassignMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (barToUnassign) unassignMutation.mutate(barToUnassign);
              }}
            >
              {unassignMutation.isPending ? "Libération…" : "Confirmer la libération"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={bulkReleaseOpen}
        onOpenChange={(open) => {
          if (!bulkUnassignMutation.isPending) setBulkReleaseOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Libérer {selectedBarList.length} barre(s) sélectionnée(s) ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les affectations seront clôturées et conservées dans l’historique. Les pièces
              redeviendront façonnées et pourront être réaffectées. Chaque barre est validée
              séparément par le serveur; si son état a changé, elle sera signalée comme échec.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-40 overflow-y-auto rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
            <ul className="space-y-1">
              {selectedBarList.slice(0, 8).map((bar) => (
                <li key={bar.id} className="break-all">
                  <span className="font-medium">{bar.reference}</span>
                  <span className="text-slate-500"> · {bar.offerReference}</span>
                </li>
              ))}
              {selectedBarList.length > 8 ? (
                <li className="text-slate-500">et {selectedBarList.length - 8} autre(s)…</li>
              ) : null}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={bulkUnassignMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={selectedBarList.length === 0 || bulkUnassignMutation.isPending}
              onClick={(event) => {
                event.preventDefault();
                if (selectedBarList.length > 0) bulkUnassignMutation.mutate(selectedBarList);
              }}
            >
              {bulkUnassignMutation.isPending
                ? "Libération en cours…"
                : `Confirmer la libération (${selectedBarList.length})`}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
