"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ArrowRight,
  CheckCircle2,
  ClipboardList,
  Factory,
  RefreshCw,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import {
  ApiError,
  getOfferProductionSummaryRequest,
  getProductionMonitorRequest,
} from "@/features/auth/auth-client";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Vérifiez la connexion à l’API.";
}

export function OfferProductionView({ offerId }: { offerId: string }): React.ReactNode {
  const query = useQuery({
    queryKey: ["offer", offerId, "production-summary"],
    queryFn: () => getOfferProductionSummaryRequest(offerId),
    retry: false,
  });
  const monitorQuery = useQuery({
    queryKey: ["production", "monitor", offerId],
    queryFn: () => getProductionMonitorRequest({ offerId }),
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
          <p className="text-sm font-semibold text-red-700">Impossible de charger le suivi de l’offre</p>
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
            Production de l’offre
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Affectations, fabrication et contrôle qualité restent liés uniquement aux pièces de cette offre.
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
            label: "Affectations actives",
            value: totals.activeAssignments,
            helper: `${totals.activeOperations} opération(s) en cours`,
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

      <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <CardTitle className="text-base">Suivi des barres en atelier</CardTitle>
              <p className="mt-1 text-xs text-slate-500">État machine, session active et alertes remontées depuis les tablettes.</p>
            </div>
            {monitorQuery.data ? (
              <div className="flex flex-wrap gap-1.5 text-xs">
                <Badge variant="outline">En attente {monitorQuery.data.counts.assigned}</Badge>
                <Badge variant="outline">En cours {monitorQuery.data.counts.inProgress}</Badge>
                <Badge variant="outline">Fabriquées {monitorQuery.data.counts.fabricated}</Badge>
                <Badge variant={monitorQuery.data.counts.openNonConformities ? "destructive" : "outline"}>
                  NC ouvertes {monitorQuery.data.counts.openNonConformities}
                </Badge>
              </div>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {monitorQuery.isLoading ? (
            <div className="space-y-3 p-5"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div>
          ) : monitorQuery.isError ? (
            <div className="flex flex-wrap items-center justify-between gap-3 p-5" role="alert">
              <p className="text-sm text-red-700">{errorMessage(monitorQuery.error)} Le suivi atelier n’a pas pu être chargé.</p>
              <Button variant="outline" size="sm" onClick={() => void monitorQuery.refetch()}>Réessayer</Button>
            </div>
          ) : monitorQuery.data?.bars.length ? (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="bg-slate-50 text-xs text-slate-500 dark:bg-slate-900"><tr>
                  <th className="px-4 py-3">Barre</th><th className="px-4 py-3">Machine / équipe</th><th className="px-4 py-3">État</th><th className="px-4 py-3">Fabrication</th><th className="px-4 py-3 text-right">NC ouvertes</th>
                </tr></thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {monitorQuery.data.bars.map(({ bar, machineSession, run, openNonConformities }) => (
                    <tr key={bar.id}>
                      <td className="px-4 py-3"><Link className="font-medium hover:text-nim-red hover:underline" href={`/offers/${offerId}/bars/${bar.id}`}>{bar.reference}</Link><p className="text-xs text-slate-500">{bar.profile} · {bar.items.length} pièce(s)</p></td>
                      <td className="px-4 py-3">{machineSession?.machineName ?? bar.machine?.name ?? "—"}<p className="text-xs text-slate-500">{machineSession?.team.map((member) => member.displayName).join(", ") ?? "Aucune session"}</p></td>
                      <td className="px-4 py-3"><Badge variant="outline">{bar.status}</Badge></td>
                      <td className="px-4 py-3">{run ? (run.status === "RUNNING" ? "En cours" : "Terminée") : "—"}<p className="text-xs text-slate-500">{run ? new Date(run.startedAt).toLocaleString("fr-FR") : "Pas de lancement"}</p></td>
                      <td className="px-4 py-3 text-right"><span className={openNonConformities.length ? "font-semibold text-red-700" : "text-slate-500"}>{openNonConformities.length}</span></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-6"><EmptyState title="Aucune barre dans cette offre" description="Les barres apparaîtront ici après validation du façonnage." /></div>
          )}
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

      <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
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
          {summary.pieces.length === 0 ? (
            <div className="p-8">
              <EmptyState
                title="Aucune pièce"
                description="Ajoutez ou importez des pièces avant de démarrer la production."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[760px] text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50/80 text-[11px] uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900/70">
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
                          <Progress value={piece.progressRate} className="h-2" />
                          <span className="w-14 text-right text-xs font-semibold tabular-nums">
                            {piece.progressRate.toLocaleString("fr-FR")} %
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-500">{piece.status}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
