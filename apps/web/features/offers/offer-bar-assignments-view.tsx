"use client";

import type { ManagedCuttingBar } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  ArrowRightLeft,
  Check,
  Factory,
  RefreshCw,
  Search,
  Scissors,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { StatusBadge } from "@/components/ui/status-badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  assignOfferBarsRequest,
  getMachinesRequest,
  getOfferBarAssignmentsRequest,
  unassignOfferBarRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import { CuttingBarStatusBadge } from "./offer-bar-ui";

const MAX_ASSIGNMENT_SELECTION = 500;

function localError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Une erreur est survenue. Vérifiez la connexion à l’API.";
}

export function OfferBarAssignmentsView({ offerId }: { offerId: string }): React.ReactNode {
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const urlParamsKey = urlParams.toString();
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [search, setSearch] = useState(() => getInitialListParam("search"));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [availablePage, setAvailablePage] = useState(() =>
    Math.max(1, Number(getInitialListParam("availablePage", "1")) || 1),
  );
  const [assignmentPage, setAssignmentPage] = useState(() =>
    Math.max(1, Number(getInitialListParam("assignmentPage", "1")) || 1),
  );
  const [pageSize, setPageSize] = useState(() =>
    [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20")))
      ? Number(getInitialListParam("pageSize", "20"))
      : 20,
  );
  const [machineId, setMachineId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [selectedBarCache, setSelectedBarCache] = useState<Record<string, ManagedCuttingBar>>({});
  const [selectingAllAvailable, setSelectingAllAvailable] = useState(false);
  const [allSelectedSearch, setAllSelectedSearch] = useState<string | null>(null);
  const [allSelectedAvailableIds, setAllSelectedAvailableIds] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<ManagedCuttingBar | null>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => {
    setAvailablePage(1);
    setAssignmentPage(1);
  }, [debouncedSearch, pageSize]);
  useEffect(() => {
    const params = new URLSearchParams(urlParamsKey);
    const nextSearch = params.get("search") ?? "";
    const nextAvailablePage = Math.max(1, Number(params.get("availablePage")) || 1);
    const nextAssignmentPage = Math.max(1, Number(params.get("assignmentPage")) || 1);
    const nextSize = Number(params.get("pageSize"));
    setSearch((current) => (current === nextSearch ? current : nextSearch));
    setAvailablePage((current) => (current === nextAvailablePage ? current : nextAvailablePage));
    setAssignmentPage((current) => (current === nextAssignmentPage ? current : nextAssignmentPage));
    if ([10, 20, 50].includes(nextSize)) {
      setPageSize((current) => (current === nextSize ? current : nextSize));
    }
  }, [urlParamsKey]);
  useEffect(() => {
    updateUrl({ search: search.trim(), availablePage, assignmentPage, pageSize });
  }, [search, availablePage, assignmentPage, pageSize, updateUrl]);
  const assignmentQuery = useQuery({
    queryKey: [
      "offer",
      offerId,
      "bar-assignments",
      availablePage,
      assignmentPage,
      pageSize,
      debouncedSearch,
    ],
    queryFn: () =>
      getOfferBarAssignmentsRequest(offerId, {
        availablePage,
        assignmentPage,
        pageSize,
        search: debouncedSearch,
      }),
    retry: false,
  });
  const availablePageCount = assignmentQuery.data?.pagination?.available?.totalPages;
  const assignmentsPageCount = assignmentQuery.data?.pagination?.assignments?.totalPages;
  useEffect(() => {
    if (availablePageCount && availablePage > availablePageCount) {
      setAvailablePage(availablePageCount);
    }
    if (assignmentsPageCount && assignmentPage > assignmentsPageCount) {
      setAssignmentPage(assignmentsPageCount);
    }
  }, [availablePage, availablePageCount, assignmentPage, assignmentsPageCount]);
  const machinesQuery = useQuery({
    queryKey: ["machines"],
    queryFn: getMachinesRequest,
    retry: false,
  });
  const machines = machinesQuery.data?.machines ?? [];
  const activeMachines = machines.filter((machine) => machine.status === "ACTIVE");
  const availableBars = assignmentQuery.data?.availableBars ?? [];
  const selectedMachine = machines.find((machine) => machine.id === machineId) ?? null;
  const selectedBars = selected
    .map((id) => selectedBarCache[id])
    .filter((bar): bar is ManagedCuttingBar => Boolean(bar));
  const machineBars = selectedMachine
    ? (assignmentQuery.data?.machines?.find((machine) => machine.machineId === selectedMachine.id)
        ?.assignmentCount ?? 0)
    : 0;

  const refreshRelated = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
      queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bars"] }),
      queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bar-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["offer", offerId, "bar-assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] }),
      queryClient.invalidateQueries({ queryKey: ["machines"] }),
      queryClient.invalidateQueries({ queryKey: ["assignments"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["history"] }),
    ]);
  };
  const assignMutation = useMutation({
    mutationFn: () => assignOfferBarsRequest(offerId, { machineId, barIds: selected }),
    onSuccess: async ({ assignedCount }) => {
      const currentAssignmentCount = assignmentQuery.data?.assignmentCount ?? 0;
      const pageWithNewAssignments = Math.max(
        1,
        Math.ceil((currentAssignmentCount + assignedCount) / pageSize),
      );
      await refreshRelated();
      setAssignmentPage(pageWithNewAssignments);
      setSelected([]);
      setSelectedBarCache({});
      setAllSelectedAvailableIds([]);
      setAllSelectedSearch(null);
      setConfirmOpen(false);
      toast.success(`${assignedCount} barre(s) affectée(s) à la machine.`);
    },
    onError: (error) => toast.error(localError(error)),
  });
  const unassignMutation = useMutation({
    mutationFn: (bar: ManagedCuttingBar) => unassignOfferBarRequest(offerId, bar.id),
    onSuccess: async (_, bar) => {
      await refreshRelated();
      setUnassignTarget(null);
      toast.success(`${bar.reference} est de nouveau disponible.`);
    },
    onError: (error) => toast.error(localError(error)),
  });
  const toggleBar = (bar: ManagedCuttingBar, checked: boolean): void => {
    if (checked && !selected.includes(bar.id) && selected.length >= MAX_ASSIGNMENT_SELECTION) {
      toast.error(
        "Une affectation est limitée à 500 barres. Réduisez la sélection avant de continuer.",
      );
      return;
    }
    setSelected((current) =>
      checked ? [...new Set([...current, bar.id])] : current.filter((id) => id !== bar.id),
    );
    setSelectedBarCache((current) => {
      if (!checked) {
        const next = { ...current };
        delete next[bar.id];
        return next;
      }
      return { ...current, [bar.id]: bar };
    });
  };
  const toggleAllVisible = (checked: boolean): void =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, ...availableBars.map((bar) => bar.id)])]
        : current.filter((id) => !availableBars.some((bar) => bar.id === id)),
    );
  const toggleVisibleSelection = (checked: boolean): void => {
    if (
      checked &&
      selected.length + availableBars.filter((bar) => !selected.includes(bar.id)).length >
        MAX_ASSIGNMENT_SELECTION
    ) {
      toast.error("Une affectation est limitée à 500 barres. Sélectionnez un lot plus petit.");
      return;
    }
    toggleAllVisible(checked);
    setSelectedBarCache((current) => {
      const next = { ...current };
      for (const bar of availableBars) {
        if (checked) next[bar.id] = bar;
        else delete next[bar.id];
      }
      return next;
    });
  };

  const toggleAllFilteredAvailable = async (): Promise<void> => {
    if (allSelectedSearch === debouncedSearch && allSelectedAvailableIds.length > 0) {
      setSelected((current) => current.filter((id) => !allSelectedAvailableIds.includes(id)));
      setSelectedBarCache((current) => {
        const next = { ...current };
        allSelectedAvailableIds.forEach((id) => delete next[id]);
        return next;
      });
      setAllSelectedAvailableIds([]);
      setAllSelectedSearch(null);
      return;
    }
    setSelectingAllAvailable(true);
    try {
      const first = await getOfferBarAssignmentsRequest(offerId, {
        availablePage: 1,
        assignmentPage,
        pageSize: 50,
        search: debouncedSearch,
      });
      const pages: Awaited<ReturnType<typeof getOfferBarAssignmentsRequest>>[] = [];
      for (let page = 2; page <= first.pagination.available.totalPages; page += 5) {
        const batch = await Promise.all(
          Array.from(
            { length: Math.min(5, first.pagination.available.totalPages - page + 1) },
            (_, index) =>
              getOfferBarAssignmentsRequest(offerId, {
                availablePage: page + index,
                assignmentPage,
                pageSize: 50,
                search: debouncedSearch,
              }),
          ),
        );
        pages.push(...batch);
      }
      const bars = [...first.availableBars, ...pages.flatMap((page) => page.availableBars)];
      const ids = bars.map((bar) => bar.id);
      setSelected((current) => [...new Set([...current, ...ids])]);
      setSelectedBarCache((current) => ({
        ...current,
        ...Object.fromEntries(bars.map((bar) => [bar.id, bar])),
      }));
      setAllSelectedAvailableIds(ids);
      setAllSelectedSearch(debouncedSearch);
      toast.success(
        `${ids.length} barre(s) disponible(s) sélectionnée(s) dans tous les résultats.`,
      );
    } catch (error) {
      toast.error(localError(error));
    } finally {
      setSelectingAllAvailable(false);
    }
  };

  if (assignmentQuery.isLoading || machinesQuery.isLoading)
    return (
      <div className="space-y-4" role="status" aria-label="Chargement des affectations">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-4 xl:grid-cols-2">
          <Skeleton className="h-96" />
          <Skeleton className="h-96" />
        </div>
      </div>
    );
  if (assignmentQuery.isError || machinesQuery.isError)
    return (
      <Card>
        <CardContent
          className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"
          role="alert"
        >
          <p className="font-semibold text-red-700">Impossible de charger les affectations</p>
          <p className="max-w-lg text-sm text-slate-500">
            {localError(assignmentQuery.error ?? machinesQuery.error)}
          </p>
          <Button
            variant="outline"
            onClick={() => void Promise.all([assignmentQuery.refetch(), machinesQuery.refetch()])}
          >
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );

  const allVisibleSelected =
    availableBars.length > 0 && availableBars.every((bar) => selected.includes(bar.id));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-nim-red">
            Affaire · Atelier
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">
            Affectation des barres
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Sélectionnez les barres façonnées puis choisissez une machine active.
          </p>
        </div>
        <Button
          variant="outline"
          onClick={() => void Promise.all([assignmentQuery.refetch(), machinesQuery.refetch()])}
          disabled={assignmentQuery.isFetching || machinesQuery.isFetching}
        >
          <RefreshCw
            className={`size-4 ${assignmentQuery.isFetching || machinesQuery.isFetching ? "animate-spin" : ""}`}
          />
          Actualiser
        </Button>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <KpiCard
          label="Barres disponibles"
          value={(assignmentQuery.data?.availableCount ?? 0).toLocaleString("fr-FR")}
          detail="prêtes à être affectées"
          icon={Scissors}
          tone="neutral"
        />
        <KpiCard
          label="Barres déjà affectées"
          value={(assignmentQuery.data?.assignmentCount ?? 0).toLocaleString("fr-FR")}
          detail="sur cette affaire"
          icon={ArrowRightLeft}
          tone="positive"
        />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card>
          <CardHeader className="border-b border-slate-200 dark:border-slate-800">
            <CardTitle className="text-base">Barres disponibles</CardTitle>
            <p className="text-xs text-slate-500">
              Seules les barres à l’état Façonnée peuvent être sélectionnées.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
            <div className="nim-offer-sticky-table-tools rounded-md py-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  className="pl-9 pr-9"
                  placeholder="Rechercher une référence ou un profil…"
                  aria-label="Rechercher une barre disponible"
                />
                {search ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                    aria-label="Effacer la recherche"
                    onClick={() => setSearch("")}
                  >
                    <X className="size-4" />
                  </Button>
                ) : null}
              </div>
            </div>
            {(assignmentQuery.data?.availableCount ?? 0) === 0 ? (
              <EmptyState
                title="Aucune barre disponible"
                description="Validez un plan de façonnage pour créer des barres pouvant être affectées."
                action={
                  canManage ? (
                    <Button asChild>
                      <Link href={`/offers/${offerId}/faconnage`}>Ouvrir le façonnage</Link>
                    </Button>
                  ) : undefined
                }
              />
            ) : availableBars.length === 0 ? (
              <EmptyState title="Aucun résultat" description="Modifiez votre recherche." />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      className="size-4 accent-red-600"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleVisibleSelection(event.currentTarget.checked)}
                      disabled={selectingAllAvailable}
                      aria-label="Sélectionner toutes les barres visibles"
                    />
                    Sélectionner cette page ({availableBars.length})
                  </label>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => void toggleAllFilteredAvailable()}
                    disabled={
                      selectingAllAvailable ||
                      search.trim() !== debouncedSearch ||
                      (assignmentQuery.data?.availableCount ?? 0) > MAX_ASSIGNMENT_SELECTION
                    }
                  >
                    {selectingAllAvailable ? (
                      <RefreshCw className="size-4 animate-spin" />
                    ) : (
                      <Check className="size-4" />
                    )}
                    {selectingAllAvailable
                      ? "Chargement des résultats…"
                      : allSelectedSearch === debouncedSearch && allSelectedAvailableIds.length > 0
                        ? `Désélectionner les ${allSelectedAvailableIds.length} résultats`
                        : (assignmentQuery.data?.availableCount ?? 0) > MAX_ASSIGNMENT_SELECTION
                          ? `Filtrez à ${MAX_ASSIGNMENT_SELECTION} barres maximum`
                          : `Tout sélectionner (${assignmentQuery.data?.availableCount ?? 0} résultats)`}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setSelected([]);
                      setSelectedBarCache({});
                      setAllSelectedAvailableIds([]);
                      setAllSelectedSearch(null);
                    }}
                    disabled={selected.length === 0}
                  >
                    <X className="size-4" />
                    Effacer
                  </Button>
                </div>
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {availableBars.map((bar) => (
                    <label
                      key={bar.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${selected.includes(bar.id) ? "border-nim-red/40 bg-red-50/60 dark:bg-red-950/20" : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"}`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-red-600"
                        checked={selected.includes(bar.id)}
                        onChange={(event) => toggleBar(bar, event.currentTarget.checked)}
                        aria-label={`Sélectionner ${bar.reference}`}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold">
                          {bar.reference}
                        </span>
                        <span className="mt-0.5 block text-xs text-slate-500">
                          {bar.profile} · {bar.rawLengthMm.toLocaleString("fr-FR")} mm ·{" "}
                          {bar.items.length} pièces
                        </span>
                      </span>
                      <CuttingBarStatusBadge status={bar.status} />
                    </label>
                  ))}
                </div>
                {assignmentQuery.data?.pagination?.available ? (
                  <Pagination
                    page={assignmentQuery.data.pagination.available.page}
                    pageCount={assignmentQuery.data.pagination.available.totalPages}
                    pageSize={pageSize}
                    total={assignmentQuery.data.pagination.available.total}
                    pageSizes={[10, 20, 50]}
                    itemLabel="barre disponible"
                    onPageChange={setAvailablePage}
                    onPageSizeChange={setPageSize}
                  />
                ) : null}
              </>
            )}
          </CardContent>
        </Card>

        <Card className="self-start xl:sticky xl:top-[220px]">
          <CardHeader>
            <CardTitle className="text-base">Machine de destination</CardTitle>
            <p className="text-xs text-slate-500">
              Une affectation n’est acceptée que si la machine est active.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bar-target-machine">Machine *</Label>
              <Select value={machineId} onValueChange={setMachineId}>
                <SelectTrigger id="bar-target-machine" aria-label="Sélectionner une machine">
                  <SelectValue placeholder="Choisir une machine active" />
                </SelectTrigger>
                <SelectContent>
                  {activeMachines.map((machine) => (
                    <SelectItem key={machine.id} value={machine.id}>
                      {machine.name} · {machine.internalNumber}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {selectedMachine ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-900">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="font-semibold">{selectedMachine.name}</p>
                    <p className="text-xs text-slate-500">
                      {selectedMachine.type} · {selectedMachine.internalNumber}
                    </p>
                  </div>
                  <StatusBadge tone="active">Active</StatusBadge>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {machineBars} barre(s) déjà affectée(s) à cette machine pour cette affaire.
                </p>
                <Button variant="link" size="sm" className="h-auto p-0" asChild>
                  <Link href={`/machines/${selectedMachine.id}`}>
                    Voir la machine
                    <ArrowRight className="size-3.5" />
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="rounded-lg bg-slate-50 p-3 text-xs text-slate-500 dark:bg-slate-900">
                Sélectionnez une machine pour consulter son état et confirmer l’affectation.
              </p>
            )}
            <div className="rounded-lg border border-slate-200 p-3 dark:border-slate-800">
              <div className="flex items-center justify-between text-sm">
                <span>Barres sélectionnées</span>
                <span className="font-semibold">{selectedBars.length}</span>
              </div>
              <p className="mt-1 text-xs text-slate-500">
                {selectedBars.reduce((sum, bar) => sum + bar.items.length, 0)} unités de pièces
                suivront cette affectation.
              </p>
            </div>
            <Button
              className="w-full"
              disabled={
                !canManage ||
                selectedMachine?.status !== "ACTIVE" ||
                selectedBars.length === 0 ||
                assignMutation.isPending
              }
              onClick={() => setConfirmOpen(true)}
            >
              {assignMutation.isPending ? (
                <RefreshCw className="size-4 animate-spin" />
              ) : (
                <Check className="size-4" />
              )}
              Affecter {selectedBars.length ? `${selectedBars.length} barre(s)` : "les barres"}
            </Button>
            {!canManage ? (
              <p className="text-center text-xs text-slate-500">
                Mode consultation — l’affectation est réservée aux responsables.
              </p>
            ) : null}
            {activeMachines.length === 0 ? (
              <p className="text-xs text-amber-700">
                Aucune machine active ne peut recevoir des barres. Vérifiez la page Machines.
              </p>
            ) : null}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-base">Affectations existantes</CardTitle>
          <p className="text-xs text-slate-500">
            Retrait autorisé uniquement avant le démarrage de fabrication.
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {(assignmentQuery.data?.assignmentCount ?? 0) === 0 ? (
            <EmptyState
              title="Aucune affectation"
              description="Les barres déjà affectées aux machines apparaîtront ici."
            />
          ) : (
            <div className="space-y-2">
              {assignmentQuery.data?.assignments.map((assignment) => (
                <div
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <Factory className="size-4 shrink-0 text-slate-400" />
                    <span className="min-w-0">
                      <Link
                        href={`/offers/${offerId}/bars/${assignment.bar.id}`}
                        className="block truncate text-sm font-semibold hover:text-nim-red"
                      >
                        {assignment.bar.reference} · {assignment.bar.profile}
                      </Link>
                      <span className="block text-xs text-slate-500">
                        {assignment.machineName} · {assignment.bar.items.length} pièces
                      </span>
                    </span>
                    <CuttingBarStatusBadge status={assignment.bar.status} />
                  </div>
                  {canManage && assignment.bar.status === "AFFECTEE" ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setUnassignTarget(assignment.bar)}
                      disabled={unassignMutation.isPending}
                    >
                      <X className="size-4" />
                      Retirer l’affectation
                    </Button>
                  ) : (
                    <span className="text-xs text-slate-500">
                      {assignment.bar.status === "LANCEE" || assignment.bar.status === "FABRIQUEE"
                        ? "Production démarrée — retrait bloqué"
                        : "Consultation"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          )}
          {(assignmentQuery.data?.pagination?.assignments?.total ?? 0) > 0 ? (
            <Pagination
              page={assignmentQuery.data?.pagination?.assignments?.page ?? assignmentPage}
              pageCount={assignmentQuery.data?.pagination?.assignments?.totalPages ?? 1}
              pageSize={pageSize}
              total={assignmentQuery.data?.pagination?.assignments?.total ?? 0}
              pageSizes={[10, 20, 50]}
              itemLabel="affectation"
              onPageChange={setAssignmentPage}
              onPageSizeChange={setPageSize}
            />
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={confirmOpen}
        onOpenChange={(open) => {
          if (!assignMutation.isPending) setConfirmOpen(open);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Affecter {selectedBars.length} barre(s) à {selectedMachine?.name ?? "cette machine"} ?
            </AlertDialogTitle>
            <AlertDialogDescription>
              Les barres et leurs pièces passeront de FAÇONNÉE à AFFECTÉE. L’opération est atomique
              : en cas d’erreur, aucune barre ne sera affectée.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="max-h-48 overflow-y-auto rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800">
            <ul className="space-y-1">
              {selectedBars.map((bar) => (
                <li key={bar.id} className="flex justify-between gap-3">
                  <span>
                    {bar.reference} ({bar.profile})
                  </span>
                  <span className="shrink-0 text-slate-500">
                    {bar.rawLengthMm.toLocaleString("fr-FR")} mm
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={assignMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                assignMutation.isPending ||
                selectedMachine?.status !== "ACTIVE" ||
                selectedBars.length === 0
              }
              onClick={() => assignMutation.mutate()}
            >
              {assignMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
              Confirmer l’affectation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(unassignTarget)}
        onOpenChange={(open) => {
          if (!open && !unassignMutation.isPending) setUnassignTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer {unassignTarget?.reference} de la machine ?</AlertDialogTitle>
            <AlertDialogDescription>
              La barre et ses unités reviendront à l’état façonné. Impossible après le démarrage de
              fabrication.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unassignMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={unassignMutation.isPending || !unassignTarget}
              onClick={() => unassignTarget && unassignMutation.mutate(unassignTarget)}
            >
              {unassignMutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
              Retirer l’affectation
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
