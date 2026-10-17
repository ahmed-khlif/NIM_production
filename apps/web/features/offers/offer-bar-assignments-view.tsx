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
import { useMemo, useState } from "react";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { CuttingBarStatusBadge } from "./offer-bar-ui";

function localError(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Une erreur est survenue. Vérifiez la connexion à l’API.";
}

export function OfferBarAssignmentsView({ offerId }: { offerId: string }): React.ReactNode {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [search, setSearch] = useState("");
  const [machineId, setMachineId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [unassignTarget, setUnassignTarget] = useState<ManagedCuttingBar | null>(null);
  const assignmentQuery = useQuery({
    queryKey: ["offer", offerId, "bar-assignments"],
    queryFn: () => getOfferBarAssignmentsRequest(offerId),
    retry: false,
  });
  const machinesQuery = useQuery({
    queryKey: ["machines"],
    queryFn: getMachinesRequest,
    retry: false,
  });
  const machines = machinesQuery.data?.machines ?? [];
  const activeMachines = machines.filter((machine) => machine.status === "ACTIVE");
  const availableBars = assignmentQuery.data?.availableBars ?? [];
  const selectedMachine = machines.find((machine) => machine.id === machineId) ?? null;
  const selectedBars = availableBars.filter((bar) => selected.includes(bar.id));
  const term = search.trim().toLocaleLowerCase("fr");
  const filteredBars = useMemo(
    () =>
      availableBars.filter(
        (bar) => !term || `${bar.reference} ${bar.profile}`.toLocaleLowerCase("fr").includes(term),
      ),
    [availableBars, term],
  );
  const machineBars = selectedMachine
    ? (assignmentQuery.data?.assignments ?? []).filter(
        (assignment) => assignment.machineId === selectedMachine.id,
      )
    : [];

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
      await refreshRelated();
      setSelected([]);
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
  const toggleBar = (barId: string, checked: boolean): void =>
    setSelected((current) =>
      checked ? [...new Set([...current, barId])] : current.filter((id) => id !== barId),
    );
  const toggleAllVisible = (checked: boolean): void =>
    setSelected((current) =>
      checked
        ? [...new Set([...current, ...filteredBars.map((bar) => bar.id)])]
        : current.filter((id) => !filteredBars.some((bar) => bar.id === id)),
    );

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
    filteredBars.length > 0 && filteredBars.every((bar) => selected.includes(bar.id));
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-nim-red">
            Offre · Atelier
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
        <KpiCard label="Barres disponibles" value={availableBars.length.toLocaleString("fr-FR")} detail="prêtes à être affectées" icon={Scissors} tone="neutral" />
        <KpiCard label="Barres déjà affectées" value={(assignmentQuery.data?.assignments.length ?? 0).toLocaleString("fr-FR")} detail="sur cette offre" icon={ArrowRightLeft} tone="positive" />
      </div>

      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card className="overflow-hidden">
          <CardHeader className="border-b border-slate-200 dark:border-slate-800">
            <CardTitle className="text-base">Barres disponibles</CardTitle>
            <p className="text-xs text-slate-500">
              Seules les barres à l’état Façonnée peuvent être sélectionnées.
            </p>
          </CardHeader>
          <CardContent className="space-y-3 p-4">
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
            {availableBars.length === 0 ? (
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
            ) : filteredBars.length === 0 ? (
              <EmptyState title="Aucun résultat" description="Modifiez votre recherche." />
            ) : (
              <>
                <div className="flex items-center justify-between gap-3">
                  <label className="flex items-center gap-2 text-xs text-slate-500">
                    <input
                      type="checkbox"
                      className="size-4 accent-red-600"
                      checked={allVisibleSelected}
                      onChange={(event) => toggleAllVisible(event.currentTarget.checked)}
                      aria-label="Sélectionner toutes les barres visibles"
                    />
                    Tout sélectionner ({filteredBars.length})
                  </label>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setSelected([])}
                    disabled={selected.length === 0}
                  >
                    <X className="size-4" />
                    Effacer
                  </Button>
                </div>
                <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
                  {filteredBars.map((bar) => (
                    <label
                      key={bar.id}
                      className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 transition-colors ${selected.includes(bar.id) ? "border-nim-red/40 bg-red-50/60 dark:bg-red-950/20" : "border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-900"}`}
                    >
                      <input
                        type="checkbox"
                        className="size-4 accent-red-600"
                        checked={selected.includes(bar.id)}
                        onChange={(event) => toggleBar(bar.id, event.currentTarget.checked)}
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
                  <Badge variant="outline" className="text-emerald-700">
                    Active
                  </Badge>
                </div>
                <p className="mt-3 text-xs text-slate-500">
                  {machineBars.length} barre(s) déjà affectée(s) à cette machine pour cette offre.
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

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-base">Affectations existantes</CardTitle>
          <p className="text-xs text-slate-500">
            Retrait autorisé uniquement avant le démarrage de fabrication.
          </p>
        </CardHeader>
        <CardContent className="p-4">
          {(assignmentQuery.data?.assignments.length ?? 0) === 0 ? (
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
