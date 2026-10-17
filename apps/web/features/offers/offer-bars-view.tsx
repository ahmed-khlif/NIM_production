"use client";

import type { CuttingBarStatus, ManagedCuttingBar } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Factory, RefreshCw, Search, Scissors, Trash2, Unlink, X } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { KpiCard } from "@/components/ui/kpi-card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Pagination } from "@/components/ui/pagination";
import {
  ApiError,
  cancelOfferBarRequest,
  getOfferBarsRequest,
  unassignOfferBarRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { CuttingBarStatusBadge, cuttingBarStatusLabels } from "./offer-bar-ui";

type ActionTarget = { bar: ManagedCuttingBar; action: "cancel" | "unassign" } | null;

const statuses: CuttingBarStatus[] = [
  "FACONNEE",
  "AFFECTEE",
  "LANCEE",
  "FABRIQUEE",
  "NON_CONFORME",
];

export function OfferBarsView({ offerId }: { offerId: string }): React.ReactNode {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [status, setStatus] = useState("ALL");
  const [profile, setProfile] = useState("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [target, setTarget] = useState<ActionTarget>(null);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const barsQuery = useQuery({
    queryKey: ["offer", offerId, "bars", page, pageSize, debouncedSearch, status, profile],
    queryFn: () => getOfferBarsRequest(offerId, { page, pageSize, search: debouncedSearch, status, profile }),
    retry: false,
  });
  const mutation = useMutation({
    mutationFn: (value: NonNullable<ActionTarget>) =>
      value.action === "cancel"
        ? cancelOfferBarRequest(offerId, value.bar.id)
        : unassignOfferBarRequest(offerId, value.bar.id),
    onSuccess: async (_, value) => {
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
      setTarget(null);
      toast.success(
        value.action === "cancel"
          ? "Barre annulée. Les unités sont à nouveau disponibles pour le façonnage."
          : "Affectation retirée. La barre est de nouveau disponible.",
      );
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de modifier cette barre.",
      ),
  });
  const bars = barsQuery.data?.bars ?? [];
  const profiles = barsQuery.data?.profiles ?? [];
  const pagination = barsQuery.data?.pagination ?? { page, pageSize, total: bars.length, totalPages: 1 };
  const hasFilters = Boolean(search.trim()) || status !== "ALL" || profile !== "ALL";

  useEffect(() => {
    setPage(1);
  }, [pageSize, profile, debouncedSearch, status]);

  if (barsQuery.isLoading)
    return (
      <div className="space-y-4" role="status" aria-label="Chargement des barres">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-16 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (barsQuery.isError)
    return (
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="font-semibold text-red-700">Impossible de charger les barres</p>
          <p className="max-w-lg text-sm text-slate-500">
            {barsQuery.error instanceof ApiError
              ? barsQuery.error.message
              : "Vérifiez la connexion à l’API."}
          </p>
          <Button variant="outline" onClick={() => void barsQuery.refetch()}>
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );

  const count = (value: CuttingBarStatus): number =>
    barsQuery.data?.statusCounts[value] ?? 0;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-nim-red">
            Atelier · Façonnage
          </p>
          <h2 className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">
            Barres de l’offre
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Barres générées à partir des plans validés, avec chaque unité de pièce tracée.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => void barsQuery.refetch()}
            disabled={barsQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${barsQuery.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
          <Button asChild>
            <Link href={`/offers/${offerId}/faconnage`}>
              <Scissors className="size-4" />
              Façonnage
            </Link>
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
        {(
          ["FACONNEE", "AFFECTEE", "LANCEE", "FABRIQUEE", "NON_CONFORME"] as CuttingBarStatus[]
        ).map((value) => (
          <KpiCard
            key={value}
            label={cuttingBarStatusLabels[value]}
            value={count(value).toLocaleString("fr-FR")}
            detail="barres dans cette offre"
            icon={value === "FABRIQUEE" ? Factory : value === "FACONNEE" ? Scissors : value === "NON_CONFORME" ? X : ArrowRight}
            tone={value === "FABRIQUEE" ? "positive" : value === "NON_CONFORME" ? "danger" : value === "FACONNEE" ? "neutral" : "warning"}
          />
        ))}
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <CardTitle className="text-base">Barres</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                {pagination.total.toLocaleString("fr-FR")} barre(s) correspondent aux filtres
              </p>
            </div>
            {canManage ? (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/offers/${offerId}/bar-assignments`}>
                  <Factory className="size-4" />
                  Affecter des barres
                </Link>
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="space-y-3 p-4">
          <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_180px_180px_auto]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                className="pl-9 pr-9"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher barre, profil, pièce ou machine…"
                aria-label="Rechercher une barre"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger aria-label="Filtrer par statut">
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                {statuses.map((value) => (
                  <SelectItem key={value} value={value}>
                    {cuttingBarStatusLabels[value]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={profile} onValueChange={setProfile}>
              <SelectTrigger aria-label="Filtrer par profil">
                <SelectValue placeholder="Tous les profils" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les profils</SelectItem>
                {profiles.map((value) => (
                  <SelectItem key={value} value={value}>
                    {value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {hasFilters ? <Button type="button" variant="ghost" onClick={() => { setSearch(""); setStatus("ALL"); setProfile("ALL"); }}>Réinitialiser</Button> : <span className="hidden md:block" />}
          </div>
          {pagination.total === 0 ? (
            <EmptyState
              title={bars.length ? "Aucun résultat" : "Aucune barre façonnée"}
              description={
                bars.length
                  ? "Modifiez la recherche ou les filtres."
                  : "Validez un plan de façonnage pour générer les barres de cette offre."
              }
              action={
                !bars.length && canManage ? (
                  <Button asChild>
                    <Link href={`/offers/${offerId}/faconnage`}>
                      Ouvrir le façonnage
                      <ArrowRight className="size-4" />
                    </Link>
                  </Button>
                ) : undefined
              }
            />
          ) : (
            <>
              <div className="hidden overflow-x-auto lg:block">
                <table className="w-full min-w-[900px] text-left text-sm">
                  <caption className="sr-only">Barres façonnées de l’offre</caption>
                  <thead className="border-b text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-3 py-3">Référence</th>
                      <th className="px-3 py-3">Profil</th>
                      <th className="px-3 py-3">Longueur brute</th>
                      <th className="px-3 py-3">Pièces</th>
                      <th className="px-3 py-3">Chute</th>
                      <th className="px-3 py-3">Statut</th>
                      <th className="px-3 py-3">Machine</th>
                      <th className="px-3 py-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {bars.map((bar) => (
                      <tr key={bar.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900">
                        <td className="px-3 py-3 font-semibold">
                          <Link
                            href={`/offers/${offerId}/bars/${bar.id}`}
                            className="hover:text-nim-red"
                          >
                            {bar.reference}
                          </Link>
                        </td>
                        <td className="px-3 py-3">{bar.profile}</td>
                        <td className="px-3 py-3 tabular-nums">
                          {bar.rawLengthMm.toLocaleString("fr-FR")} mm
                        </td>
                        <td className="px-3 py-3">
                          {bar.items.filter((item) => item.active).length}
                        </td>
                        <td className="px-3 py-3 tabular-nums">
                          {bar.wasteMm.toLocaleString("fr-FR")} mm
                        </td>
                        <td className="px-3 py-3">
                          <CuttingBarStatusBadge status={bar.status} />
                        </td>
                        <td className="px-3 py-3">
                          {bar.machine ? (
                            <Link
                              className="hover:text-nim-red"
                              href={`/machines/${bar.machine.id}`}
                            >
                              {bar.machine.name}
                            </Link>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-3 py-3">
                          <div className="flex justify-end gap-1">
                            {canManage && bar.status === "AFFECTEE" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setTarget({ bar, action: "unassign" })}
                              >
                                <Unlink className="size-4" />
                                Retirer
                              </Button>
                            ) : null}
                            {canManage && bar.status === "FACONNEE" ? (
                              <Button
                                size="icon"
                                variant="ghost"
                                aria-label={`Annuler la barre ${bar.reference}`}
                                onClick={() => setTarget({ bar, action: "cancel" })}
                              >
                                <Trash2 className="size-4 text-red-600" />
                              </Button>
                            ) : null}
                            <Button size="sm" variant="ghost" asChild>
                              <Link href={`/offers/${offerId}/bars/${bar.id}`}>Détails</Link>
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 lg:hidden">
                {bars.map((bar) => (
                  <div
                    key={bar.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/offers/${offerId}/bars/${bar.id}`}
                          className="font-semibold hover:text-nim-red"
                        >
                          {bar.reference}
                        </Link>
                        <p className="mt-1 text-xs text-slate-500">
                          {bar.profile} · {bar.rawLengthMm.toLocaleString("fr-FR")} mm ·{" "}
                          {bar.items.filter((item) => item.active).length} pièces
                        </p>
                      </div>
                      <CuttingBarStatusBadge status={bar.status} />
                    </div>
                    <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
                      <span>Chute {bar.wasteMm.toLocaleString("fr-FR")} mm</span>
                      {bar.machine ? (
                        <Link href={`/machines/${bar.machine.id}`} className="hover:text-nim-red">
                          {bar.machine.name}
                        </Link>
                      ) : (
                        <span>Non affectée</span>
                      )}
                    </div>
                    <div className="mt-3 flex justify-end gap-2">
                      {canManage && bar.status === "AFFECTEE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTarget({ bar, action: "unassign" })}
                        >
                          <Unlink className="size-4" />
                          Retirer
                        </Button>
                      ) : null}
                      {canManage && bar.status === "FACONNEE" ? (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setTarget({ bar, action: "cancel" })}
                        >
                          <Trash2 className="size-4" />
                          Annuler
                        </Button>
                      ) : null}
                      <Button size="sm" variant="ghost" asChild>
                        <Link href={`/offers/${offerId}/bars/${bar.id}`}>Détails</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
          {pagination.total > 0 ? (
            <Pagination
              page={pagination.page}
              pageCount={pagination.totalPages}
              pageSize={pagination.pageSize}
              total={pagination.total}
              itemLabel="barre"
              onPageChange={setPage}
              onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
            />
          ) : null}
        </CardContent>
      </Card>

      <AlertDialog
        open={Boolean(target)}
        onOpenChange={(open) => {
          if (!open && !mutation.isPending) setTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {target?.action === "cancel"
                ? `Annuler ${target.bar.reference} ?`
                : `Retirer ${target?.bar.reference} de ${target?.bar.machine?.name ?? "la machine"} ?`}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {target?.action === "cancel"
                ? "La barre sera conservée dans l’historique et ses unités redeviendront disponibles pour un prochain plan de façonnage."
                : "Cette opération est possible uniquement avant le démarrage de la production. La barre et ses pièces reviendront à l’état façonné."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={mutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={mutation.isPending || !target}
              onClick={() => target && mutation.mutate(target)}
            >
              {mutation.isPending ? <RefreshCw className="size-4 animate-spin" /> : null}
              {target?.action === "cancel" ? "Confirmer l’annulation" : "Retirer l’affectation"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
