"use client";

import type { AvailableProfile, FaconnagePreparation, ProfileFamily } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  Factory,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  X,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  getAvailableProfilesRequest,
  getOfferAvailableProfilesRequest,
  getOfferCuttingPlanRequest,
  getOfferCuttingPlansRequest,
  cancelCuttingPlanRequest,
  deleteDraftCuttingPlanRequest,
  getOfferRequest,
  prepareFaconnageRequest,
  prepareOfferFaconnageRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { FaconnageOptimizationPanel, FaconnageOptimizationResultView } from "@/features/pieces/faconnage-optimization-panel";

const familyOrder: ProfileFamily[] = ["IPE", "HEA", "UPN", "L", "ROND", "OTHER"];
const familyLabels: Record<ProfileFamily, string> = {
  IPE: "IPE",
  HEA: "HEA",
  UPN: "UPN",
  L: "L",
  ROND: "ROND",
  OTHER: "Autres profils",
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Impossible de charger les profils. Vérifiez la connexion à l’API.";
}

function FamilyGroup({
  family,
  profiles,
  selected,
  onToggleFamily,
  onToggleProfile,
}: {
  family: ProfileFamily;
  profiles: AvailableProfile[];
  selected: Set<string>;
  onToggleFamily: (family: ProfileFamily, checked: boolean) => void;
  onToggleProfile: (profile: string) => void;
}): React.ReactNode {
  const parentRef = useRef<HTMLInputElement>(null);
  const selectedCount = profiles.filter((profile) => selected.has(profile.profile)).length;
  const allSelected = profiles.length > 0 && selectedCount === profiles.length;
  const indeterminate = selectedCount > 0 && !allSelected;

  useEffect(() => {
    if (parentRef.current) parentRef.current.indeterminate = indeterminate;
  }, [indeterminate]);

  return (
    <details open className="group border-b border-slate-100 last:border-b-0 dark:border-slate-800">
      <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/60 [&::-webkit-details-marker]:hidden">
        <ChevronRight className="size-4 text-slate-400 transition-transform group-open:rotate-90" />
        <input
          ref={parentRef}
          type="checkbox"
          checked={allSelected}
          aria-label={`Sélectionner tous les profils ${familyLabels[family]}`}
          onChange={(event) => onToggleFamily(family, event.target.checked)}
          onClick={(event) => event.stopPropagation()}
          className="size-4 accent-nim-red"
        />
        <span className="font-semibold text-slate-900 dark:text-slate-100">{familyLabels[family]}</span>
        <span className="text-xs text-slate-400">({profiles.length} profil{profiles.length > 1 ? "s" : ""})</span>
        {selectedCount > 0 ? (
          <Badge variant="outline" className="ml-auto border-red-100 bg-red-50 text-nim-red dark:border-red-950 dark:bg-red-950/25">
            {selectedCount} sélectionné{selectedCount > 1 ? "s" : ""}
          </Badge>
        ) : null}
      </summary>
      <div className="grid gap-1 border-t border-slate-100 bg-slate-50/40 p-3 sm:grid-cols-2 lg:grid-cols-3 dark:border-slate-800 dark:bg-slate-900/30">
        {profiles.map((item) => {
          const checked = selected.has(item.profile);
          return (
            <label
              key={item.profile}
              className={`flex min-h-10 cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition-colors ${
                checked
                  ? "border-red-100 bg-red-50/70 dark:border-red-950 dark:bg-red-950/20"
                  : "border-transparent hover:border-slate-200 hover:bg-white dark:hover:border-slate-700 dark:hover:bg-slate-900"
              }`}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggleProfile(item.profile)}
                className="size-4 accent-nim-red"
              />
              <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                {item.profile}
              </span>
              <span className="text-xs text-slate-400">
                {item.pieceCount} ligne{item.pieceCount > 1 ? "s" : ""}
              </span>
            </label>
          );
        })}
      </div>
    </details>
  );
}

function SavedPlans({ offerId }: { offerId: string }): React.ReactNode {
  const queryClient = useQueryClient();
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [cancelPlanId, setCancelPlanId] = useState<string | null>(null);
  const [deletePlanId, setDeletePlanId] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const plansQuery = useQuery({
    queryKey: ["offer", offerId, "cutting-plans", page],
    queryFn: () => getOfferCuttingPlansRequest(offerId, page, 10),
    retry: false,
  });
  const detailQuery = useQuery({
    queryKey: ["offer", offerId, "cutting-plan", selectedPlanId],
    queryFn: () => getOfferCuttingPlanRequest(offerId, selectedPlanId as string),
    enabled: Boolean(selectedPlanId),
    retry: false,
  });

  const plans = plansQuery.data?.plans ?? [];
  const pagination = plansQuery.data?.pagination ?? { page, pageSize: 10, total: plans.length, totalPages: 1 };
  const cancelMutation = useMutation({
    mutationFn: (planId: string) => cancelCuttingPlanRequest(offerId, planId),
    onSuccess: () => {
      toast.success("Reliquat retiré des données actives. Les barres validées et l'historique sont conservés.");
      setCancelPlanId(null);
      setSelectedPlanId(null);
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "cutting-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "cutting-plan", selectedPlanId] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "profiles"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  const deleteMutation = useMutation({
    mutationFn: (planId: string) => deleteDraftCuttingPlanRequest(offerId, planId),
    onSuccess: ({ plan }) => {
      toast.success(`Le plan ${plan.reference} a été supprimé de la base. L'événement reste dans l'historique.`);
      setDeletePlanId(null);
      if (selectedPlanId === plan.id) setSelectedPlanId(null);
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "cutting-plans"] });
      void queryClient.invalidateQueries({ queryKey: ["offer", offerId, "profiles"] });
    },
    onError: (error) => toast.error(errorMessage(error)),
  });
  useEffect(() => {
    if (!plansQuery.isLoading && page > Math.max(1, pagination.totalPages)) setPage(Math.max(1, pagination.totalPages));
  }, [page, pagination.totalPages, plansQuery.isLoading]);
  if (!plansQuery.isLoading && pagination.total === 0) return null;

  return (
    <div className="space-y-4">
      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="flex-row items-center justify-between gap-3 border-b border-slate-200 dark:border-slate-800">
          <div>
            <CardTitle className="text-base">Plans de mise en barres enregistrés</CardTitle>
            <p className="mt-1 text-xs text-slate-500">Retrouvez les calculs de cette offre et validez le plan retenu.</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => void plansQuery.refetch()} disabled={plansQuery.isFetching}>
            <RefreshCw className={`size-4 ${plansQuery.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        </CardHeader>
        <CardContent className="p-0">
          {plansQuery.isLoading ? (
            <div className="space-y-2 p-5"><Skeleton className="h-12 w-full" /><Skeleton className="h-12 w-full" /></div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800">
              {plans.map((plan) => (
                <div key={plan.id} className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{plan.reference}</p>
                      <Badge variant="outline">
                        {plan.status === "APPROVED" || plan.status === "VALIDATED" ? "Validé" : plan.status === "PARTIALLY_VALIDATED" ? "Partiellement validé" : plan.status === "DRAFT" ? "Brouillon" : plan.status === "CANCELLED" ? "Reliquat supprimé" : "Archivé"}
                      </Badge>
                    </div>
                    <p className="mt-1 text-xs text-slate-500">
                      {plan.status === "PARTIALLY_VALIDATED" ? `${plan.validatedBarCount ?? 0} validée(s) · ${plan.remainingBarCount ?? 0} restante(s) · ` : ""}{plan.totalBars} barre(s) · {plan.utilizationRate.toLocaleString("fr-FR")} % de rendement · {plan.totalWasteMm.toLocaleString("fr-FR")} mm de chute
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant={selectedPlanId === plan.id ? "default" : "outline"} size="sm" onClick={() => setSelectedPlanId((current) => current === plan.id ? null : plan.id)}>
                      {selectedPlanId === plan.id ? "Fermer" : "Ouvrir le plan"}
                    </Button>
                    {plan.status === "DRAFT" ? (
                      <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletePlanId(plan.id)}>
                        <Trash2 className="size-4" />
                        Supprimer définitivement
                      </Button>
                    ) : plan.status === "PARTIALLY_VALIDATED" ? (
                      <Button type="button" variant="outline" size="sm" className="text-destructive hover:text-destructive" onClick={() => setCancelPlanId(plan.id)}>
                        <Trash2 className="size-4" />
                        Supprimer le reliquat
                      </Button>
                    ) : null}
                  </div>
                </div>
              ))}
            </div>
          )}
          {pagination.totalPages > 1 ? (
            <div className="flex flex-col gap-3 border-t border-slate-100 px-5 py-3 sm:flex-row sm:items-center sm:justify-between dark:border-slate-800">
              <p className="text-xs text-slate-500">{pagination.total} plan(s) · page {pagination.page} sur {pagination.totalPages}</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={page <= 1 || plansQuery.isFetching} onClick={() => setPage((current) => Math.max(1, current - 1))}><ChevronLeft className="size-4" />Précédent</Button>
                <Button type="button" size="sm" variant="outline" disabled={page >= pagination.totalPages || plansQuery.isFetching} onClick={() => setPage((current) => current + 1)}>Suivant<ChevronRight className="size-4" /></Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {selectedPlanId ? (
        detailQuery.isLoading ? (
          <Skeleton className="h-56 w-full" />
        ) : detailQuery.data?.optimization ? (
          <FaconnageOptimizationResultView
            offerId={offerId}
            optimization={detailQuery.data.optimization}
            onChange={() => {
              void plansQuery.refetch();
              void detailQuery.refetch();
            }}
          />
        ) : detailQuery.isError ? (
          <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700">{errorMessage(detailQuery.error)}</div>
        ) : null
      ) : null}
      <AlertDialog open={Boolean(cancelPlanId)} onOpenChange={(open) => { if (!open) setCancelPlanId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer le reliquat du plan ?</AlertDialogTitle>
            <AlertDialogDescription>
              Les barres proposées mais non validées seront retirées du plan et ne seront pas créées. Les barres déjà validées ne changent pas. L'action reste inscrite dans l'historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction disabled={cancelMutation.isPending} onClick={(event) => {
              event.preventDefault();
              if (cancelPlanId) cancelMutation.mutate(cancelPlanId);
            }}>
              {cancelMutation.isPending ? "Suppression…" : "Supprimer le reliquat"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog open={Boolean(deletePlanId)} onOpenChange={(open) => { if (!open) setDeletePlanId(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Supprimer définitivement ce plan brouillon ?</AlertDialogTitle>
            <AlertDialogDescription>Le plan et ses propositions seront réellement supprimés de la base et ne réapparaîtront plus dans cette liste. Un événement de suppression restera consultable dans l'historique. Cette action est réservée aux plans sans barre matérialisée.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Retour</AlertDialogCancel>
            <AlertDialogAction disabled={deleteMutation.isPending} onClick={(event) => { event.preventDefault(); if (deletePlanId) deleteMutation.mutate(deletePlanId); }}>
              {deleteMutation.isPending ? "Suppression…" : "Supprimer définitivement"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function PreparationResult({
  preparation,
  onReset,
  offerId,
}: {
  preparation: FaconnagePreparation;
  onReset: () => void;
  offerId?: string;
}): React.ReactNode {
  return (
    <div className="space-y-5" data-testid="faconnage-preparation-result">
      <PageHeader
        eyebrow="Façonnage"
        title="Besoins préparés"
        description="Les pièces sélectionnées ont été regroupées par profil détaillé et longueur."
        action={
          <Button variant="outline" onClick={onReset}>
            <ArrowLeft className="size-4" />
            Modifier la sélection
          </Button>
        }
      />

      <div aria-label="Étapes du façonnage" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>Étape 2 sur 3</span><span>Préparation des longueurs et optimisation</span></div>
        <div role="progressbar" aria-label="Progression du façonnage" aria-valuemin={1} aria-valuemax={3} aria-valuenow={2} className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full w-2/3 rounded-full bg-nim-red" /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span className="text-emerald-700 dark:text-emerald-300">✓ Profils sélectionnés</span><span className="font-semibold text-nim-red">2 · Longueurs brutes</span><span className="text-slate-400">3 · Vérification et validation</span></div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          ["Profils sélectionnés", preparation.summary.selectedProfileCount],
          ["Lignes de pièces", preparation.summary.pieceRows],
          ["Quantité totale", preparation.summary.totalQuantity],
          ["Besoins agrégés", preparation.summary.lengthCount],
        ].map(([label, value]) => (
          <Card key={String(label)} className="border-slate-200 shadow-panel dark:border-slate-800">
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-slate-200 shadow-panel dark:border-slate-800">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-base">Profil · longueur · quantité</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {preparation.requirements.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Aucun besoin trouvé"
                description="Les profils sélectionnés ne possèdent aucune pièce active."
              />
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <caption className="sr-only">Besoins Façonnage agrégés</caption>
                <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  <tr>
                    <th className="px-5 py-3">Profil</th>
                    <th className="px-5 py-3 text-right">Longueur</th>
                    <th className="px-5 py-3 text-right">Quantité</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {preparation.requirements.map((item) => (
                    <tr key={`${item.profile}-${item.lengthMm}`} className="hover:bg-slate-50/60 dark:hover:bg-slate-900/50">
                      <td className="px-5 py-4 font-semibold text-slate-900 dark:text-slate-100">{item.profile}</td>
                      <td className="px-5 py-4 text-right tabular-nums text-slate-600 dark:text-slate-300">
                        {item.lengthMm.toLocaleString("fr-FR")} mm
                      </td>
                      <td className="px-5 py-4 text-right tabular-nums font-semibold text-slate-900 dark:text-slate-100">{item.quantity}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border border-red-100 bg-red-50/70 px-4 py-3 text-sm text-slate-700 dark:border-red-950 dark:bg-red-950/20 dark:text-slate-200">
        <Factory className="mt-0.5 size-4 shrink-0 text-nim-red" />
        <p>
          Les besoins sont prêts. Configurez maintenant les longueurs de matière brute possibles pour calculer la mise en barres.
        </p>
      </div>

      <FaconnageOptimizationPanel offerId={offerId} requirements={preparation.requirements} />
    </div>
  );
}

export function FaconnagePreparationView({ offerId }: { offerId?: string } = {}): React.ReactNode {
  const { user } = useAuth();
  const canRead = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId) && canRead,
    retry: false,
  });
  const offerEditable = !offerId || offerQuery.data?.offer.status === "DRAFT" || offerQuery.data?.offer.status === "READY";
  const profilesQuery = useQuery({
    queryKey: offerId ? ["offer", offerId, "profiles"] : ["piece-profiles"],
    queryFn: () => offerId ? getOfferAvailableProfilesRequest(offerId) : getAvailableProfilesRequest(),
    enabled: canRead,
    retry: false,
  });
  const [search, setSearch] = useState("");
  const [familyFilter, setFamilyFilter] = useState<ProfileFamily | "ALL">("ALL");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [preparation, setPreparation] = useState<FaconnagePreparation | null>(null);

  const prepareMutation = useMutation({
    mutationFn: (profiles: string[]) => offerId ? prepareOfferFaconnageRequest(offerId, profiles) : prepareFaconnageRequest(profiles),
    onSuccess: (result) => {
      setPreparation(result.preparation);
      toast.success("Préparation Façonnage générée.");
    },
  });

  const visibleProfiles = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (profilesQuery.data?.profiles ?? []).filter(
      (item) => (familyFilter === "ALL" || item.family === familyFilter)
        && (!term || `${item.profile} ${item.family} ${item.pieceCount} ${item.totalQuantity}`.toLowerCase().includes(term)),
    );
  }, [profilesQuery.data?.profiles, search, familyFilter]);

  const grouped = useMemo(
    () =>
      new Map(
        familyOrder.map((family) => [
          family,
          visibleProfiles.filter((item) => item.family === family),
        ]),
      ),
    [visibleProfiles],
  );

  const allProfiles = profilesQuery.data?.profiles ?? [];
  const selectedProfiles = allProfiles.filter((item) => selected.has(item.profile));
  const selectedQuantity = selectedProfiles.reduce((sum, item) => sum + item.totalQuantity, 0);
  const selectedRows = selectedProfiles.reduce((sum, item) => sum + item.pieceCount, 0);
  const visibleSelectedCount = visibleProfiles.filter((item) => selected.has(item.profile)).length;

  if (!canRead) return <AccessDenied />;
  if (preparation) {
    return <PreparationResult preparation={preparation} onReset={() => setPreparation(null)} offerId={offerId} />;
  }

  const toggleProfile = (profile: string): void => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(profile)) next.delete(profile);
      else next.add(profile);
      return next;
    });
  };

  const toggleFamily = (family: ProfileFamily, checked: boolean): void => {
    setSelected((current) => {
      const next = new Set(current);
      for (const item of allProfiles.filter((profile) => profile.family === family)) {
        if (checked) next.add(item.profile);
        else next.delete(item.profile);
      }
      return next;
    });
  };

  const reset = (): void => {
    setSelected(new Set());
    setSearch("");
  };

  const error = profilesQuery.isError
    ? errorMessage(profilesQuery.error)
    : prepareMutation.isError
      ? errorMessage(prepareMutation.error)
      : null;

  const piecesHref = offerId ? `/offers/${offerId}/pieces` : "/pieces";

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Link href={piecesHref} className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition-colors hover:text-nim-red">
          <ArrowLeft className="size-4" />
          Retour aux pièces
        </Link>
        <Button variant="outline" size="sm" onClick={() => void profilesQuery.refetch()} disabled={profilesQuery.isFetching}>
          <RefreshCw className={`size-4 ${profilesQuery.isFetching ? "animate-spin" : ""}`} />
          Actualiser
        </Button>
      </div>

      <PageHeader
        eyebrow={offerId ? "Offre · Façonnage" : "Façonnage"}
        title="Profils à traiter"
        description="Sélectionnez les profils détaillés à inclure dans le façonnage."
      />

      <div aria-label="Étapes du façonnage" className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950">
        <div className="mb-3 flex items-center justify-between text-xs text-slate-500"><span>Étape 1 sur 3</span><span>Sélection des profils</span></div>
        <div role="progressbar" aria-label="Progression du façonnage" aria-valuemin={1} aria-valuemax={3} aria-valuenow={1} className="h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800"><div className="h-full w-1/3 rounded-full bg-nim-red" /></div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-xs"><span className="font-semibold text-nim-red">1 · Profils</span><span className="text-slate-400">2 · Longueurs brutes</span><span className="text-slate-400">3 · Vérification et validation</span></div>
      </div>

      {offerId ? <SavedPlans offerId={offerId} /> : null}

      {offerId && offerQuery.data?.offer && !offerEditable ? (
        <div className="rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          Le plan de cette offre est verrouillé car son statut est <span className="font-semibold">{offerQuery.data.offer.status}</span>. Les plans sauvegardés restent consultables. Repassez l’offre en brouillon pour recalculer le façonnage.
        </div>
      ) : null}

      {error ? (
        <div className="rounded-lg border border-red-100 bg-red-50 p-4 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300" role="alert">
          {error}
        </div>
      ) : null}

      {profilesQuery.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-52 w-full" />
        </div>
      ) : profilesQuery.data?.profiles.length === 0 ? (
        <EmptyState
          title="Aucun profil détecté"
          description="Créez ou importez des pièces avant de préparer le Façonnage."
        />
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-3">
            <Card className="border-slate-200 shadow-panel dark:border-slate-800">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Profils détectés</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">{profilesQuery.data?.totalProfiles ?? 0}</p>
              </CardContent>
            </Card>
            <Card className="border-red-100 bg-red-50/60 shadow-panel dark:border-red-950 dark:bg-red-950/20">
              <CardContent className="p-4">
                <p className="text-xs text-red-600 dark:text-red-300">Sélectionnés</p>
                <p className="mt-1 text-2xl font-semibold text-nim-red">{selected.size}</p>
              </CardContent>
            </Card>
            <Card className="border-slate-200 shadow-panel dark:border-slate-800">
              <CardContent className="p-4">
                <p className="text-xs text-slate-500">Lignes de pièces</p>
                <p className="mt-1 text-2xl font-semibold text-slate-950 dark:text-slate-100">{selectedRows}</p>
              </CardContent>
            </Card>
          </div>

          <Card className="overflow-hidden border-slate-200 shadow-panel dark:border-slate-800">
            <CardHeader className="space-y-4 border-b border-slate-200 dark:border-slate-800">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                <Input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Rechercher un profil..."
                  aria-label="Rechercher un profil"
                  className="pl-9 pr-10"
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
              <div className="flex flex-wrap gap-2" aria-label="Filtrer les familles de profils">
                {(["ALL", ...familyOrder] as const).map((family) => (
                  <Button key={family} type="button" size="sm" variant={familyFilter === family ? "default" : "outline"} onClick={() => setFamilyFilter(family)}>
                    {family === "ALL" ? "Toutes les familles" : familyLabels[family]}
                  </Button>
                ))}
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  {visibleProfiles.length} profils affichés · sélection précise par profil; les familles ne mélangent jamais des profils différents.
                </p>
                <div className="flex flex-wrap gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setSelected((current) => new Set([...current, ...visibleProfiles.map((item) => item.profile)]))}
                  >
                    <Check className="size-4" />
                    {search || familyFilter !== "ALL" ? "Tout sélectionner (filtre)" : "Tout sélectionner"}
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => setSelected((current) => {
                    const next = new Set(current);
                    visibleProfiles.forEach((item) => next.delete(item.profile));
                    return next;
                  })} disabled={visibleSelectedCount === 0}>
                    <X className="size-4" />
                    Désélectionner (filtre)
                  </Button>
                  <Button variant="ghost" size="sm" onClick={reset}>Effacer tout</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {familyOrder.map((family) => {
                if (familyFilter !== "ALL" && family !== familyFilter) return null;
                const items = grouped.get(family) ?? [];
                return items.length ? (
                  <FamilyGroup
                    key={family}
                    family={family}
                    profiles={items}
                    selected={selected}
                    onToggleFamily={toggleFamily}
                    onToggleProfile={toggleProfile}
                  />
                ) : null;
              })}
            </CardContent>
          </Card>

          <div className="sticky bottom-0 z-30 -mx-5 flex flex-col gap-3 border-t border-slate-200 bg-white/95 px-5 py-3 shadow-[0_-8px_24px_rgba(15,23,42,0.08)] backdrop-blur supports-[backdrop-filter]:bg-white/85 sm:flex-row sm:items-center sm:justify-between lg:-mx-8 lg:px-8 dark:border-slate-800 dark:bg-slate-950/95 dark:supports-[backdrop-filter]:bg-slate-950/85">
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-sm">
              <span><strong className="text-slate-950 dark:text-slate-100">{selected.size}</strong> profils sélectionnés</span>
              <span><strong className="text-slate-950 dark:text-slate-100">{selectedRows}</strong> lignes concernées</span>
              <span><strong className="text-slate-950 dark:text-slate-100">{selectedQuantity}</strong> pièces au total</span>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row">
              <Button variant="outline" asChild>
                <Link href={piecesHref}>Retour</Link>
              </Button>
              <Button
                onClick={() => prepareMutation.mutate([...selected])}
                disabled={selected.size === 0 || prepareMutation.isPending || !offerEditable}
              >
                {prepareMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <ArrowRight className="size-4" />}
                Continuer vers Façonnage
              </Button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
