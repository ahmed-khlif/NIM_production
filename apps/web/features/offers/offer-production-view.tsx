"use client";

import { Table } from "@/components/ui/table";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useEffect } from "react";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Factory,
  RefreshCw,
  Search,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { CategoryBadge } from "@/components/ui/category-badge";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Pagination } from "@/components/ui/pagination";
import { CuttingBarStatusBadge, PieceProgressStatusBadge } from "./offer-bar-ui";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import {
  ApiError,
  getOfferProductionSummaryRequest,
  getProductionMonitorRequest,
} from "@/features/auth/auth-client";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Vérifiez la connexion à l’API.";
}

export function OfferProductionView({ offerId }: { offerId: string }): React.ReactNode {
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const [piecesPage, setPiecesPage] = useState(() => Math.max(1, Number(getInitialListParam("piecesPage", "1")) || 1));
  const [piecesPageSize, setPiecesPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("piecesPageSize", "20"))) ? Number(getInitialListParam("piecesPageSize", "20")) : 20);
  const [piecesSearch, setPiecesSearch] = useState(() => getInitialListParam("piecesSearch"));
  const [piecesSearchDebounced, setPiecesSearchDebounced] = useState("");
  const [piecesStatus, setPiecesStatus] = useState(() => ["ALL", "PLANNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DELAYED"].includes(getInitialListParam("piecesStatus", "ASSIGNED")) ? getInitialListParam("piecesStatus", "ASSIGNED") : "ASSIGNED");
  const [monitorPage, setMonitorPage] = useState(() => Math.max(1, Number(getInitialListParam("page", "1")) || 1));
  const [monitorPageSize, setMonitorPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20"))) ? Number(getInitialListParam("pageSize", "20")) : 20);
  const [monitorSearch, setMonitorSearch] = useState(() => getInitialListParam("search"));
  const [monitorSearchDebounced, setMonitorSearchDebounced] = useState("");
  const [monitorStatus, setMonitorStatus] = useState(() => ["ALL", "FACONNEE", "AFFECTEE", "LANCEE", "FABRIQUEE"].includes(getInitialListParam("status", "AFFECTEE")) ? getInitialListParam("status", "AFFECTEE") : "AFFECTEE");
  const [monitorSorting, setMonitorSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "reference", sortDirection: "asc" });
  const [piecesSorting, setPiecesSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "profile", sortDirection: "asc" });
  useEffect(() => {
    const timer = window.setTimeout(() => setPiecesSearchDebounced(piecesSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [piecesSearch]);
  useEffect(() => setPiecesPage(1), [piecesSearchDebounced, piecesStatus, piecesPageSize]);
  useEffect(() => {
    const timer = window.setTimeout(() => setMonitorSearchDebounced(monitorSearch.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [monitorSearch]);
  useEffect(() => setMonitorPage(1), [monitorSearchDebounced, monitorStatus, monitorPageSize]);
  useEffect(() => {
    setPiecesPage(Math.max(1, Number(urlParams.get("piecesPage")) || 1));
    setPiecesSearch(urlParams.get("piecesSearch") ?? "");
    const nextPiecesStatus = urlParams.get("piecesStatus") ?? "ASSIGNED";
    setPiecesStatus(["ALL", "PLANNED", "ASSIGNED", "IN_PROGRESS", "COMPLETED", "DELAYED"].includes(nextPiecesStatus) ? nextPiecesStatus : "ASSIGNED");
    const nextPiecesSize = Number(urlParams.get("piecesPageSize"));
    if ([10, 20, 50].includes(nextPiecesSize)) setPiecesPageSize(nextPiecesSize);
    setMonitorSearch(urlParams.get("search") ?? "");
    setMonitorPage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextMonitorSize = Number(urlParams.get("pageSize"));
    if ([10, 20, 50].includes(nextMonitorSize)) setMonitorPageSize(nextMonitorSize);
    const nextStatus = urlParams.get("status") ?? "AFFECTEE";
    setMonitorStatus(["ALL", "FACONNEE", "AFFECTEE", "LANCEE", "FABRIQUEE"].includes(nextStatus) ? nextStatus : "AFFECTEE");
  }, [urlParams]);
  useEffect(() => {
    updateUrl({ piecesPage, piecesPageSize, piecesSearch: piecesSearch.trim(), piecesStatus, search: monitorSearch.trim(), page: monitorPage, pageSize: monitorPageSize, status: monitorStatus });
  }, [piecesPage, piecesPageSize, piecesSearch, piecesStatus, monitorSearch, monitorPage, monitorPageSize, monitorStatus, updateUrl]);
  const query = useQuery({
    queryKey: ["offer", offerId, "production-summary", piecesPage, piecesPageSize, piecesSearchDebounced, piecesStatus, piecesSorting],
    queryFn: () => getOfferProductionSummaryRequest(offerId, { page: piecesPage, pageSize: piecesPageSize, search: piecesSearchDebounced, status: piecesStatus, ...piecesSorting }),
    retry: false,
  });
  const monitorQuery = useQuery({
    queryKey: ["production", "monitor", offerId, monitorPage, monitorPageSize, monitorSearchDebounced, monitorStatus, monitorSorting],
    queryFn: () => getProductionMonitorRequest({ offerId, page: monitorPage, pageSize: monitorPageSize, search: monitorSearchDebounced, status: monitorStatus === "ALL" ? undefined : monitorStatus as "FACONNEE" | "AFFECTEE" | "LANCEE" | "FABRIQUEE", ...monitorSorting }),
    refetchInterval: 15_000,
    retry: false,
  });

  if (query.isLoading) {
    return (
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }, (_, index) => (
            <Skeleton key={index} className="h-28" />
          ))}
        </div>
        <Skeleton className="h-72 w-full" />
      </div>
    );
  }

  if (query.isError || !query.data?.summary) {
    return (
      <Card>
        <CardContent className="flex min-h-52 flex-col items-center justify-center gap-3 p-8 text-center">
          <p className="text-sm font-semibold text-red-700">Impossible de charger le suivi de l’affaire</p>
          <p className="max-w-md text-sm text-slate-500">{errorMessage(query.error)}</p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  const summary = query.data.summary;
  const { totals } = summary;
  const operational = summary.offer.status === "READY" || summary.offer.status === "IN_PRODUCTION";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-100">
            Production de l’affaire
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Affectations, fabrication et contrôle qualité restent liés uniquement aux pièces de cette affaire.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {summary.offer.status === "DRAFT" ? (
            <Button asChild>
              <Link href={`/offers/${offerId}/faconnage`}>
                <Scissors className="size-4" />
                Préparer le façonnage
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          ) : null}
          {operational ? (
            <>
              <Button variant="outline" asChild>
                <Link href={`/assignments?offerId=${encodeURIComponent(offerId)}`}>
                  <ClipboardList className="size-4" />
                  Affectations
                </Link>
              </Button>
              <Button asChild>
                <Link href={`/production?offerId=${encodeURIComponent(offerId)}`}>
                  <Activity className="size-4" />
                  Ouvrir Production
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
            </>
          ) : null}
          {summary.offer.status === "COMPLETED" ? (
            <Button variant="outline" asChild>
              <Link href={`/offers/${offerId}/quality`}>
                <ShieldCheck className="size-4" />
                Voir la qualité
              </Link>
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          {
            label: "Unités",
            value: totals.totalUnits,
            helper: `${totals.pieceRows} ligne(s) de pièces`,
            icon: Factory,
          },
          {
            label: "Barres affectées",
            value: totals.activeBarAssignments,
            helper: `${totals.activeProductionRuns} barre(s) en fabrication`,
            icon: ClipboardList,
          },
          {
            label: "Fabriquées",
            value: totals.manufacturedUnits,
            helper: `${totals.productionRate.toLocaleString("fr-FR")} %`,
            icon: Activity,
          },
          {
            label: "Qualité résolue",
            value: totals.resolvedUnits,
            helper: `${totals.pendingQuality} en attente de contrôle`,
            icon: ShieldCheck,
          },
        ].map(({ label, value, helper, icon: Icon }) => (
          <Card key={label} className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardContent className="flex items-center gap-4 p-5">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-nim-red dark:bg-red-950/30">
                <Icon className="size-5" />
              </div>
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-slate-400">{label}</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">{value}</p>
                <p className="text-xs text-slate-400">{helper}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Suivi des barres en atelier</CardTitle>
              <p className="mt-1 text-xs text-slate-500">État machine, session active et alertes remontées depuis les tablettes.</p>
            </div>
            {monitorQuery.data ? (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <StatusBadge tone="info">En attente {monitorQuery.data.counts.assigned}</StatusBadge>
                <StatusBadge tone="warning">En cours {monitorQuery.data.counts.inProgress}</StatusBadge>
                <StatusBadge tone="active">Fabriquées {monitorQuery.data.counts.fabricated}</StatusBadge>
                <StatusBadge tone={monitorQuery.data.counts.openNonConformities ? "danger" : "neutral"}>
                  NC ouvertes {monitorQuery.data.counts.openNonConformities}
                </StatusBadge>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <div className="nim-offer-sticky-table-tools grid gap-2 border-b border-slate-200 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_220px] dark:border-slate-800">
            <Input value={monitorSearch} onChange={(event) => setMonitorSearch(event.target.value)} placeholder="Rechercher barre, profil ou machine" aria-label="Rechercher dans le suivi atelier" />
            <Select value={monitorStatus} onValueChange={setMonitorStatus}>
              <SelectTrigger aria-label="Filtrer les barres par statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="FACONNEE">Façonnée</SelectItem>
                <SelectItem value="AFFECTEE">Affectée</SelectItem>
                <SelectItem value="LANCEE">En cours</SelectItem>
                <SelectItem value="FABRIQUEE">Fabriquée</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {monitorQuery.isLoading ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : monitorQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-5" role="alert">
              <p className="text-sm text-red-700">{errorMessage(monitorQuery.error)} Le suivi atelier n’a pas pu être chargé.</p>
              <Button variant="outline" size="sm" onClick={() => void monitorQuery.refetch()}>Réessayer</Button>
            </div>
          ) : monitorQuery.data?.pagination.total ? (
            <div className="overflow-x-auto">
              <Table className="nim-data-table w-full min-w-[760px] table-fixed text-left text-sm" serverSorting={{ column: monitorSorting.sortBy === "status" ? "État" : "Barre", direction: monitorSorting.sortDirection }} onServerSort={(column, direction) => { const sortBy = column === "État" ? "status" : column === "Barre" ? "reference" : undefined; if (sortBy) { setMonitorSorting({ sortBy, sortDirection: direction }); setMonitorPage(1); } }}>
                <colgroup><col className="w-[29%]" /><col className="w-[25%]" /><col className="w-[15%]" /><col className="w-[21%]" /><col className="w-[10%]" /></colgroup>
                <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr>
                  <th className="px-4 py-3">Barre</th><th className="bg-sky-50 px-4 py-3 text-sky-800 dark:bg-sky-950/40 dark:text-sky-200">Machine / équipe</th><th className="px-4 py-3">État</th><th className="bg-emerald-50 px-4 py-3 text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-200">Fabrication</th><th className="bg-rose-50 px-4 py-3 text-right text-rose-800 dark:bg-rose-950/40 dark:text-rose-200">NC ouvertes</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monitorQuery.data.bars.map(({ bar, machineSession, run, openNonConformities }) => (
                    <tr key={bar.id}>
                      <td className="px-4 py-3"><Link className="block truncate font-semibold text-slate-900 hover:text-nim-red hover:underline dark:text-slate-100" title={bar.reference} href={`/offers/${offerId}/bars/${bar.id}`}>{bar.reference}</Link><p className="mt-0.5 truncate text-xs text-slate-500">{bar.profile} <span aria-hidden="true">·</span> {bar.items.length} pièce(s)</p></td>
                      <td className="bg-sky-50/40 px-4 py-3 dark:bg-sky-950/10">{machineSession?.machineName || bar.machine?.name ? <><CategoryBadge tone="blue" className="max-w-full truncate">{machineSession?.machineName ?? bar.machine?.name}</CategoryBadge><p className="mt-1 truncate text-xs text-muted-foreground">{machineSession ? machineSession.team.map((member) => member.displayName).join(", ") || "Session active" : "Aucune session active"}</p></> : <StatusBadge tone="neutral" className="min-h-7 px-3">Non affectée</StatusBadge>}</td>
                      <td className="px-4 py-3"><CuttingBarStatusBadge status={bar.status} /></td>
                      <td className="bg-emerald-50/40 px-4 py-3 dark:bg-emerald-950/10">{run ? <><StatusBadge tone={run.status === "RUNNING" ? "warning" : "active"} className="min-h-7 px-3">{run.status === "RUNNING" ? "En cours" : "Terminée"}</StatusBadge><p className="mt-1 text-xs text-muted-foreground">{new Date(run.startedAt).toLocaleString("fr-FR", { dateStyle: "short", timeStyle: "short" })}</p></> : <StatusBadge tone="neutral" className="min-h-7 px-3">Non démarrée</StatusBadge>}</td>
                      <td className="bg-rose-50/30 px-4 py-3 text-right dark:bg-rose-950/10"><StatusBadge tone={openNonConformities.length ? "danger" : "active"} className="min-h-7 px-3">{openNonConformities.length} NC{openNonConformities.length > 0 ? " · à traiter" : ""}</StatusBadge></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          ) : (
            <div className="p-6"><EmptyState title={monitorSearchDebounced || monitorStatus !== "ALL" ? "Aucun résultat" : "Aucune barre dans cette affaire"} description={monitorSearchDebounced || monitorStatus !== "ALL" ? "Modifiez la recherche ou le statut." : "Les barres apparaîtront ici après validation du façonnage."} /></div>
          )}
          {!monitorQuery.isLoading && !monitorQuery.isError && monitorQuery.data?.pagination.total ? <Pagination page={monitorQuery.data.pagination.page} pageCount={monitorQuery.data.pagination.totalPages} pageSize={monitorQuery.data.pagination.pageSize} total={monitorQuery.data.pagination.total} pageSizes={[10, 20, 50]} itemLabel="barre" onPageChange={setMonitorPage} onPageSizeChange={setMonitorPageSize} /> : null}
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-base">Avancement global</CardTitle>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Fabrication</span>
              <span className="font-semibold tabular-nums">{totals.productionRate.toLocaleString("fr-FR")} %</span>
            </div>
            <Progress value={totals.productionRate} className="h-2.5" />
            <p className="mt-2 text-xs text-slate-500">
              {totals.manufacturedUnits} / {totals.totalUnits} unité(s) fabriquée(s)
            </p>
          </div>
          <div>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span className="font-medium text-slate-700 dark:text-slate-200">Cycle terminé</span>
              <span className="font-semibold tabular-nums">{totals.completionRate.toLocaleString("fr-FR")} %</span>
            </div>
            <Progress value={totals.completionRate} className="h-2.5" />
            <p className="mt-2 text-xs text-slate-500">
              {totals.acceptedUnits} conforme(s) · {totals.scrappedUnits} rebut(s) · {totals.pendingQuality} contrôle(s) en attente
            </p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800">
          <div>
            <CardTitle className="text-base">Avancement par pièce</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Les références restent isolées dans {summary.offer.reference}.</p>
          </div>
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/offers/${offerId}/quality`}>
              <CheckCircle2 className="size-4" />
              Qualité
            </Link>
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="nim-offer-sticky-table-tools grid gap-2 border-b border-slate-200 p-4 sm:grid-cols-[minmax(0,1fr)_220px_auto] dark:border-slate-800">
            <div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input type="search" value={piecesSearch} onChange={(event) => setPiecesSearch(event.target.value)} placeholder="Rechercher par repère ou profil…" aria-label="Rechercher dans l’avancement par pièce" className="pl-9" /></div>
            <Select value={piecesStatus} onValueChange={setPiecesStatus}>
              <SelectTrigger aria-label="Filtrer les pièces par statut"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                <SelectItem value="PLANNED">En attente</SelectItem>
                <SelectItem value="ASSIGNED">Affectées</SelectItem>
                <SelectItem value="IN_PROGRESS">En cours</SelectItem>
                <SelectItem value="COMPLETED">Terminées</SelectItem>
                <SelectItem value="DELAYED">En retard</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex items-center justify-between gap-2 sm:justify-end">
              <p className="self-center px-2 text-xs text-slate-500" aria-live="polite">{summary.pagination.total} pièce(s) · {piecesStatus === "ALL" ? "tous statuts" : piecesStatus === "ASSIGNED" ? "affectées" : piecesStatus.toLowerCase().replace("_", " ")}</p>
              {piecesSearch || piecesStatus !== "ASSIGNED" ? <Button variant="ghost" size="sm" onClick={() => { setPiecesSearch(""); setPiecesStatus("ASSIGNED"); }}>Réinitialiser</Button> : null}
            </div>
          </div>
          {summary.pagination.total === 0 ? (
            <div className="p-8">
              <EmptyState
                title={piecesSearchDebounced ? "Aucun résultat" : piecesStatus === "ASSIGNED" ? "Aucune pièce affectée" : piecesStatus !== "ALL" ? "Aucune pièce pour ce statut" : "Aucune pièce"}
                description={piecesSearchDebounced || piecesStatus !== "ALL" ? "Modifiez la recherche ou le statut pour afficher des pièces." : "Ajoutez ou importez des pièces avant de démarrer la production."}
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table className="nim-data-table mx-auto w-full min-w-[900px] max-w-[1240px] table-fixed text-left text-sm" serverSorting={{ column: piecesSorting.sortBy === "reference" ? "Repère" : piecesSorting.sortBy === "quantity" ? "Qté" : "Profil", direction: piecesSorting.sortDirection }} onServerSort={(column, direction) => { const sortBy = ({ Repère: "reference", Profil: "profile", Qté: "quantity" } as Record<string, string>)[column]; if (sortBy) { setPiecesSorting({ sortBy, sortDirection: direction }); setPiecesPage(1); } }}>
                <colgroup><col className="w-[15%]" /><col className="w-[13%]" /><col className="w-[9%]" /><col className="w-[10%]" /><col className="w-[10%]" /><col className="w-[28%]" /><col className="w-[15%]" /></colgroup>
                <thead className="border-b text-[11px] uppercase tracking-wide">
                  <tr>
                    <th className="px-4 py-3">Repère</th>
                    <th className="px-4 py-3">Profil</th>
                    <th className="px-4 py-3 text-right">Qté</th>
                    <th className="px-4 py-3 text-right">Fabriquées</th>
                    <th className="px-4 py-3 text-right">Résolues</th>
                    <th className="min-w-52 px-4 py-3">Avancement</th>
                    <th className="px-4 py-3">Statut</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {summary.pieces.map((piece) => (
                    <tr key={piece.id}>
                      <td className="px-4 py-3 font-semibold text-slate-900 dark:text-slate-100"><Link href={`/offers/${offerId}/pieces/${piece.id}`} className="underline-offset-4 hover:text-nim-red hover:underline">{piece.reference}</Link></td>
                      <td className="px-4 py-3">{piece.profile}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{piece.quantity}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{piece.completedUnits}</td>
                      <td className="px-4 py-3 text-right tabular-nums">{piece.resolvedUnits}</td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <Progress value={piece.progressRate} className="h-2.5 flex-1 bg-slate-200 dark:bg-slate-700" />
                          <span className="w-14 shrink-0 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">
                            {piece.progressRate.toLocaleString("fr-FR")} %
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3"><PieceProgressStatusBadge status={piece.status} /></td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
          )}
          {summary.pagination.total > 0 ? (
            <div className="border-t border-slate-200 p-4 dark:border-slate-800">
              <Pagination
                page={summary.pagination.page}
                pageCount={summary.pagination.totalPages}
                pageSize={summary.pagination.pageSize}
                total={summary.pagination.total}
                itemLabel="pièce"
                pageSizes={[10, 20, 50]}
                onPageChange={setPiecesPage}
                onPageSizeChange={(size) => { setPiecesPageSize(size); setPiecesPage(1); }}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}
