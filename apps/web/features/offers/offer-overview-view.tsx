"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  AlertTriangle,
  Box,
  CheckCircle2,
  ClipboardList,
  Factory,
  FileSpreadsheet,
  Loader2,
  Pencil,
  Plus,
  Scissors,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
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
import { Progress } from "@/components/ui/progress";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  getOfferRequest,
  getOfferBarSummaryRequest,
  getOfferProductionSummaryRequest,
  updateOfferRequest,
  type ManagedOffer,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { OfferFormSheet, type OfferFormValue } from "./offer-form-sheet";
import { formatDateTime } from "./offer-ui";

function message(error: unknown): string {
  return error instanceof ApiError ? error.message : "Une erreur est survenue.";
}

export function OfferOverviewView({ offerId }: { offerId: string }): React.ReactNode {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const [lifecycleTarget, setLifecycleTarget] = useState<"DRAFT" | "COMPLETED" | null>(null);
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId),
    retry: false,
  });
  const barsQuery = useQuery({
    queryKey: ["offer", offerId, "bar-summary"],
    queryFn: () => getOfferBarSummaryRequest(offerId),
    retry: false,
  });
  const productionQuery = useQuery({
    queryKey: ["offer", offerId, "production-summary"],
    queryFn: () => getOfferProductionSummaryRequest(offerId),
    retry: false,
  });
  const updateMutation = useMutation({
    mutationFn: (value: OfferFormValue) =>
      updateOfferRequest(offerId, {
        revision: value.revision,
        name: value.name,
        clientName: value.clientName,
        site: value.site,
        description: value.description,
      }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
        queryClient.invalidateQueries({ queryKey: ["offers"] }),
      ]);
      setEditOpen(false);
      setEditError(null);
      toast.success("Offre mise à jour.");
    },
    onError: (error) => setEditError(message(error)),
  });
  const lifecycleMutation = useMutation({
    mutationFn: (status: "DRAFT" | "COMPLETED") => updateOfferRequest(offerId, { status }),
    onSuccess: async (_, status) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
        queryClient.invalidateQueries({ queryKey: ["offers"] }),
        queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] }),
      ]);
      setLifecycleTarget(null);
      toast.success(status === "DRAFT" ? "Offre repassée en brouillon." : "Offre terminée.");
    },
    onError: (error) => toast.error(message(error)),
  });

  if (offerQuery.isLoading) {
    return (
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-28" />
        ))}
      </div>
    );
  }
  if (offerQuery.isError || !offerQuery.data?.offer) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-sm text-red-700">
          {message(offerQuery.error)}
        </CardContent>
      </Card>
    );
  }
  const offer = offerQuery.data.offer;
  const active = offer.status !== "ARCHIVED";
  const nextStep =
    offer.status === "ARCHIVED"
      ? {
          title: "Offre archivée",
          description: "Les données sont conservées en lecture seule.",
          href: `/offers/${offerId}`,
          label: "Consulter",
          icon: Box,
        }
      : offer.totalUnits === 0
        ? {
            title: "Ajouter les pièces",
            description: "Saisissez les pièces ou importez la liste Tekla propre à cette offre.",
            href: `/offers/${offerId}/pieces`,
            label: "Ouvrir les pièces",
            icon: Box,
          }
        : offer.status === "DRAFT"
          ? {
              title: "Préparer le façonnage",
              description:
                "Sélectionnez les profils à traiter, renseignez les longueurs brutes puis validez un plan de mise en barres.",
              href: `/offers/${offerId}/faconnage`,
              label: "Continuer vers Façonnage",
              icon: Scissors,
            }
          : offer.status === "READY"
            ? barsQuery.data?.total
              ? {
                  title: canManage ? "Affecter les barres" : "Consulter les barres",
                  description: canManage
                    ? "Le plan est validé. Sélectionnez les barres façonnées puis confirmez leur machine de destination."
                    : "Consultez les barres façonnées, leur statut et leur machine dans le détail de cette offre.",
                  href: canManage
                    ? `/offers/${offerId}/bar-assignments`
                    : `/offers/${offerId}/bars`,
                  label: canManage ? "Affecter les barres" : "Voir les barres",
                  icon: ClipboardList,
                }
              : {
                  title: "Consulter les affectations",
                  description:
                    offer.plannedBars > 0
                      ? "Ce plan existait avant le suivi individuel des barres. Les affectations historiques par pièce restent accessibles ici."
                      : "Validez un plan de façonnage pour créer les barres à affecter.",
                  href:
                    offer.plannedBars > 0
                      ? canManage
                        ? `/assignments?offerId=${encodeURIComponent(offerId)}`
                        : `/offers/${offerId}/bars`
                      : `/offers/${offerId}/faconnage`,
                  label:
                    offer.plannedBars > 0
                      ? canManage
                        ? "Affectations par pièce"
                        : "Voir les barres"
                      : "Ouvrir le façonnage",
                  icon: offer.plannedBars > 0 ? ClipboardList : Scissors,
                }
            : offer.status === "IN_PRODUCTION"
              ? {
                  title: "Suivre la production",
                  description:
                    "La fabrication a démarré. Suivez les unités, les opérations et le contrôle qualité de cette offre.",
                  href: `/offers/${offerId}/production`,
                  label: "Suivre la production",
                  icon: Factory,
                }
              : {
                  title: "Cycle terminé",
                  description:
                    "Toutes les unités ont terminé leur cycle de production et de qualité.",
                  href: `/offers/${offerId}/production`,
                  label: "Voir le bilan",
                  icon: Factory,
                };
  const NextIcon = nextStep.icon;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold text-slate-950 dark:text-slate-100">Vue générale</h2>
          <p className="mt-1 text-sm text-slate-500">
            Synthèse de l’offre et accès direct à son flux de préparation.
          </p>
        </div>
        {canManage && active ? (
          <div className="flex flex-wrap gap-2">
            {offer.status === "READY" ? (
              <>
                <Button
                  variant="outline"
                  onClick={() => setLifecycleTarget("DRAFT")}
                  disabled={barsQuery.isLoading || Boolean(barsQuery.data?.total)}
                >
                  Repasser en brouillon
                </Button>
                {barsQuery.data?.total ? (
                  <Button variant="outline" asChild>
                    <Link href={`/offers/${offerId}/bars`}>
                      Libérer les barres avant modification
                    </Link>
                  </Button>
                ) : null}
              </>
            ) : null}
            {offer.status === "IN_PRODUCTION" ? (
              <Button onClick={() => setLifecycleTarget("COMPLETED")}>Terminer l’offre</Button>
            ) : null}
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="size-4" />
              Modifier l’offre
            </Button>
          </div>
        ) : null}
      </div>

      <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-red-50 text-nim-red dark:bg-red-950/30">
              <NextIcon className="size-5" />
            </div>
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.16em] text-nim-red">
                Étape suivante
              </p>
              <h3 className="mt-1 font-semibold text-slate-950 dark:text-slate-100">
                {nextStep.title}
              </h3>
              <p className="mt-1 max-w-2xl text-sm text-slate-500">{nextStep.description}</p>
            </div>
          </div>
          <Button variant={active ? "default" : "outline"} asChild>
            <Link href={nextStep.href}>
              {nextStep.label}
              <ArrowRight className="size-4" />
            </Link>
          </Button>
        </CardContent>
      </Card>

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="flex flex-col gap-2 border-b border-slate-200 sm:flex-row sm:items-end sm:justify-between dark:border-slate-800">
          <div>
            <CardTitle className="text-base">État des unités</CardTitle>
            <p className="mt-1 text-sm text-slate-500">Chaque indicateur compte des unités de pièces, jamais des barres.</p>
          </div>
          <div className="text-sm font-medium tabular-nums text-slate-700 dark:text-slate-200">
            {offer.manufacturedUnits.toLocaleString("fr-FR")} / {offer.totalUnits.toLocaleString("fr-FR")} unités fabriquées
          </div>
        </CardHeader>
        <CardContent className="space-y-5 p-5">
          <div>
            <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
              <span>Progression de fabrication</span>
              <span className="font-semibold tabular-nums text-slate-700 dark:text-slate-200">{offer.progressRate.toLocaleString("fr-FR")} %</span>
            </div>
            <Progress value={offer.progressRate} className="h-2.5" />
          </div>
          {productionQuery.isLoading || barsQuery.isLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">{Array.from({ length: 5 }, (_, index) => <Skeleton key={index} className="h-[74px]" />)}</div>
          ) : productionQuery.isError || barsQuery.isError ? (
            <div className="flex flex-col gap-3 rounded-lg border border-red-200 bg-red-50/70 p-4 text-sm text-red-800 sm:flex-row sm:items-center sm:justify-between dark:border-red-950 dark:bg-red-950/20 dark:text-red-200">
              <span>Le détail du flux n’a pas pu être chargé. La progression globale reste basée sur les unités de l’offre.</span>
              <Button size="sm" variant="outline" onClick={() => { void productionQuery.refetch(); void barsQuery.refetch(); }}>Réessayer</Button>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-5">
                {[
                  { label: "À façonner", value: productionQuery.data?.summary.statusCounts.PENDING ?? 0, icon: Scissors, tone: "neutral" as const },
                  { label: "Façonnées", value: productionQuery.data?.summary.statusCounts.FACONNEE ?? 0, icon: Box, tone: "neutral" as const },
                  { label: "Affectées", value: productionQuery.data?.summary.statusCounts.ASSIGNED ?? 0, icon: ClipboardList, tone: "warning" as const },
                  { label: "En fabrication", value: productionQuery.data?.summary.statusCounts.IN_PROGRESS ?? 0, icon: Factory, tone: "warning" as const },
                  { label: "Fabrication terminée", value: productionQuery.data?.summary.totals.manufacturedUnits ?? 0, icon: CheckCircle2, tone: "positive" as const },
                ].map((stage) => (
                  <KpiCard key={stage.label} label={stage.label} value={stage.value.toLocaleString("fr-FR")} detail="unités" icon={stage.icon} tone={stage.tone} />
                ))}
              </div>
              {productionQuery.data?.summary.totals.pendingQuality ? (
                <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/20 dark:text-amber-200">
                  <AlertTriangle className="size-4 shrink-0" />
                  {productionQuery.data.summary.totals.pendingQuality.toLocaleString("fr-FR")} unité(s) attendent un contrôle qualité.
                </div>
              ) : null}
            </>
          )}
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
            <Button variant="outline" asChild><Link href={`/offers/${offerId}/bars`}>Voir les barres<ArrowRight className="size-4" /></Link></Button>
            {canManage && barsQuery.data?.total ? <Button asChild><Link href={`/offers/${offerId}/bar-assignments`}>Affecter les barres<ArrowRight className="size-4" /></Link></Button> : null}
          </div>
        </CardContent>
      </Card>

      {offer.totalUnits === 0 ? (
        <Card className="border-slate-200 shadow-panel dark:border-slate-800">
          <CardContent className="p-8">
            <EmptyState
              title="Aucune pièce pour cette offre"
              description="Commencez par ajouter des pièces manuellement ou importer la liste Tekla de cette offre."
              action={
                active && canManage ? (
                  <div className="flex flex-wrap justify-center gap-2">
                    <Button asChild>
                      <Link href={`/offers/${offerId}/pieces`}>
                        <Plus className="size-4" />
                        Ajouter une pièce
                      </Link>
                    </Button>
                    <Button variant="outline" asChild>
                      <Link href={`/offers/${offerId}/pieces/import`}>
                        <FileSpreadsheet className="size-4" />
                        Importer Excel / Tekla
                      </Link>
                    </Button>
                  </div>
                ) : undefined
              }
            />
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          <Card className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <CardTitle className="text-base">Derniers imports</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/offers/${offerId}/pieces/import`}>Importer</Link>
              </Button>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
              {offer.recentImports.length ? (
                offer.recentImports.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{item.filename}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <span className="text-xs font-semibold text-slate-500">
                      {item.rowsCreated} pièce(s)
                    </span>
                  </div>
                ))
              ) : (
                <p className="p-5 text-sm text-slate-500">Aucun import.</p>
              )}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader className="flex-row items-center justify-between border-b border-slate-200 dark:border-slate-800">
              <CardTitle className="text-base">Plans de mise en barres</CardTitle>
              <Button variant="ghost" size="sm" asChild>
                <Link href={`/offers/${offerId}/faconnage`}>Façonnage</Link>
              </Button>
            </CardHeader>
            <CardContent className="divide-y divide-slate-100 p-0 dark:divide-slate-800">
              {offer.cuttingPlans.length ? (
                offer.cuttingPlans.map((item) => (
                  <div key={item.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <div>
                      <p className="text-sm font-medium">{item.reference}</p>
                      <p className="text-xs text-slate-400">{formatDateTime(item.createdAt)}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-semibold">{item.totalBars} barre(s)</p>
                      <p className="text-[11px] text-slate-400">
                        {item.utilizationRate.toLocaleString("fr-FR")} %
                      </p>
                    </div>
                  </div>
                ))
              ) : (
                <p className="p-5 text-sm text-slate-500">Aucun plan calculé.</p>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      <AlertDialog
        open={Boolean(lifecycleTarget)}
        onOpenChange={(open) => !open && !lifecycleMutation.isPending && setLifecycleTarget(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {lifecycleTarget === "DRAFT"
                ? "Repasser cette offre en brouillon ?"
                : "Terminer cette offre ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {lifecycleTarget === "DRAFT"
                ? "Le plan approuvé sera archivé. Les pièces redeviendront modifiables après annulation des barres façonnées; toute affectation active doit d’abord être retirée. L’historique des barres reste conservé."
                : "La clôture est autorisée uniquement lorsque toutes les unités ont terminé la fabrication et que chaque contrôle qualité est résolu."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={lifecycleMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={lifecycleMutation.isPending || !lifecycleTarget}
              onClick={() => lifecycleTarget && lifecycleMutation.mutate(lifecycleTarget)}
            >
              {lifecycleMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              Confirmer
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <OfferFormSheet
        open={editOpen}
        onOpenChange={setEditOpen}
        offer={offer as ManagedOffer}
        busy={updateMutation.isPending}
        error={editError}
        onSubmit={(value) => updateMutation.mutate(value)}
      />
      {updateMutation.isPending ? (
        <div className="fixed bottom-5 right-5 flex items-center gap-2 rounded-lg bg-nim-dark px-4 py-3 text-sm text-white shadow-xl">
          <Loader2 className="size-4 animate-spin" />
          Mise à jour...
        </div>
      ) : null}
    </div>
  );
}
