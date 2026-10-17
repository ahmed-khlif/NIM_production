"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Factory, RefreshCw, Scissors } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { ApiError, getOfferBarRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { CuttingBarStatusBadge } from "./offer-bar-ui";

const unitStatusLabels: Record<string, string> = {
  PENDING: "En attente",
  FACONNEE: "Façonnée",
  ASSIGNED: "Affectée",
  IN_PROGRESS: "En fabrication",
  COMPLETED: "Fabriquée",
  QUALITY_PENDING: "Contrôle qualité",
  ACCEPTED: "Conforme",
  REJECTED: "Non conforme",
  SCRAPPED: "Mise au rebut",
};

export function OfferBarDetailView(): React.ReactNode {
  const params = useParams<{ offerId: string; barId: string }>();
  const { user } = useAuth();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const { offerId, barId } = params;
  const query = useQuery({
    queryKey: ["offer", offerId, "bar", barId],
    queryFn: () => getOfferBarRequest(offerId, barId),
    enabled: Boolean(offerId && barId),
    retry: false,
  });
  if (query.isLoading)
    return (
      <div className="space-y-4" role="status" aria-label="Chargement de la barre">
        <Skeleton className="h-24 w-full" />
        <Skeleton className="h-56 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
    );
  if (query.isError)
    return (
      <Card>
        <CardContent
          className="flex min-h-64 flex-col items-center justify-center gap-3 p-8 text-center"
          role="alert"
        >
          <p className="font-semibold text-red-700">Impossible de charger cette barre</p>
          <p className="max-w-lg text-sm text-slate-500">
            {query.error instanceof ApiError
              ? query.error.message
              : "Vérifiez la connexion à l’API."}
          </p>
          <Button variant="outline" onClick={() => void query.refetch()}>
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  const bar = query.data?.bar;
  if (!bar)
    return (
      <EmptyState
        title="Barre introuvable"
        description="Cette barre ne fait pas partie de l’offre sélectionnée."
      />
    );
  const activeItems = bar.items.filter((item) => item.active);
  const assignmentHistory = bar.assignmentHistory ?? [];

  return (
    <div className="space-y-5">
      <Link
        href={`/offers/${offerId}/bars`}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-nim-red"
      >
        <ArrowLeft className="size-4" />
        Retour aux barres
      </Link>
      <PageHeader
        eyebrow={`${bar.offerReference} · ${bar.profile}`}
        title={bar.reference}
        description={`${bar.rawLengthMm.toLocaleString("fr-FR")} mm bruts · ${bar.usedLengthMm.toLocaleString("fr-FR")} mm utilisés · chute ${bar.wasteMm.toLocaleString("fr-FR")} mm`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <CuttingBarStatusBadge status={bar.status} />
            {bar.machine ? (
              <Button variant="outline" asChild>
                <Link href={`/machines/${bar.machine.id}`}>
                  <Factory className="size-4" />
                  {bar.machine.name}
                </Link>
              </Button>
            ) : bar.status === "FACONNEE" && canManage ? (
              <Button asChild>
                <Link href={`/offers/${offerId}/bar-assignments`}>
                  <Factory className="size-4" />
                  Affecter à une machine
                </Link>
              </Button>
            ) : null}
          </div>
        }
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {[
          { label: "Profil", value: bar.profile },
          { label: "Pièces dans la barre", value: activeItems.length },
          {
            label: "Taux d’utilisation",
            value: `${bar.rawLengthMm ? Math.round((bar.usedLengthMm / bar.rawLengthMm) * 1000) / 10 : 0} %`,
          },
          { label: "Chute", value: `${bar.wasteMm.toLocaleString("fr-FR")} mm` },
        ].map((metric) => (
          <Card key={metric.label}>
            <CardContent className="p-4">
              <p className="text-xs text-slate-500">{metric.label}</p>
              <p className="mt-1 text-xl font-semibold text-slate-950 dark:text-slate-100">
                {metric.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Scissors className="size-4 text-nim-red" />
            Plan de coupe proportionnel
          </CardTitle>
          <p className="text-xs text-slate-500">
            Chaque segment représente sa longueur réelle par rapport à la longueur brute.
          </p>
        </CardHeader>
        <CardContent>
          <div
            className="flex min-h-20 w-full overflow-hidden rounded-lg border border-slate-300 bg-slate-50 dark:border-slate-700 dark:bg-slate-900"
            aria-label={`Schéma de coupe de ${bar.reference}`}
          >
            {activeItems.map((item, index) => (
              <div
                key={item.id}
                title={`${item.reference} #${item.sequenceNumber} · ${item.lengthMm} mm`}
                style={{ width: `${Math.max((item.lengthMm / bar.rawLengthMm) * 100, 0.5)}%` }}
                className={`flex min-w-0 shrink-0 flex-col justify-center overflow-hidden border-r border-white/60 px-1.5 text-center text-[10px] font-semibold text-slate-800 ${index % 2 === 0 ? "bg-red-100 dark:bg-red-950/60 dark:text-red-100" : "bg-red-200 dark:bg-red-900/60 dark:text-red-50"}`}
              >
                <span className="truncate">{item.reference}</span>
                <span className="truncate font-normal">{item.lengthMm} mm</span>
              </div>
            ))}
            {bar.wasteMm > 0 ? (
              <div
                style={{ width: `${Math.max((bar.wasteMm / bar.rawLengthMm) * 100, 0.5)}%` }}
                className="flex min-w-8 shrink-0 flex-col items-center justify-center bg-slate-200 px-1 text-center text-[10px] font-medium text-slate-600 dark:bg-slate-700 dark:text-slate-200"
              >
                <span>Chute</span>
                <span>{bar.wasteMm} mm</span>
              </div>
            ) : null}
          </div>
          <div className="mt-2 flex justify-between text-[11px] text-slate-400">
            <span>0 mm</span>
            <span>{bar.rawLengthMm.toLocaleString("fr-FR")} mm</span>
          </div>
        </CardContent>
      </Card>

      <Card className="overflow-hidden">
        <CardHeader className="border-b border-slate-200 dark:border-slate-800">
          <CardTitle className="text-base">Pièces et unités tracées</CardTitle>
          <p className="text-xs text-slate-500">
            Chaque unité de coupe est reliée à sa pièce et à son statut réel.
          </p>
        </CardHeader>
        <CardContent className="p-0">
          {activeItems.length === 0 ? (
            <div className="p-6">
              <EmptyState
                title="Aucune unité active"
                description="Cette barre a été annulée et son contenu a été rendu disponible pour un prochain plan."
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Pièces découpées dans {bar.reference}</caption>
                  <thead className="border-b text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3">Repère</th>
                      <th className="px-5 py-3">Unité</th>
                      <th className="px-5 py-3">Longueur</th>
                      <th className="px-5 py-3">Poids unitaire</th>
                      <th className="px-5 py-3">État</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                    {activeItems.map((item) => (
                      <tr key={item.id}>
                        <td className="px-5 py-3">
                          <Link
                            href={`/offers/${offerId}/pieces/${item.pieceId}`}
                            className="font-semibold hover:text-nim-red"
                          >
                            {item.reference}
                          </Link>
                        </td>
                        <td className="px-5 py-3">#{item.sequenceNumber}</td>
                        <td className="px-5 py-3 tabular-nums">
                          {item.lengthMm.toLocaleString("fr-FR")} mm
                        </td>
                        <td className="px-5 py-3 tabular-nums">
                          {item.weightKg === null
                            ? "—"
                            : `${item.weightKg.toLocaleString("fr-FR")} kg`}
                        </td>
                        <td className="px-5 py-3">
                          {unitStatusLabels[item.status] ?? item.status}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {activeItems.map((item) => (
                  <div
                    key={item.id}
                    className="rounded-lg border border-slate-200 p-4 dark:border-slate-800"
                  >
                    <div className="flex justify-between gap-3">
                      <Link
                        href={`/offers/${offerId}/pieces/${item.pieceId}`}
                        className="font-semibold hover:text-nim-red"
                      >
                        {item.reference}{" "}
                        <span className="text-xs text-slate-400">#{item.sequenceNumber}</span>
                      </Link>
                      <span className="text-xs text-slate-500">
                        {unitStatusLabels[item.status] ?? item.status}
                      </span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {item.lengthMm.toLocaleString("fr-FR")} mm ·{" "}
                      {item.weightKg === null
                        ? "Poids non renseigné"
                        : `${item.weightKg.toLocaleString("fr-FR")} kg`}
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
          <CardTitle className="text-base">Historique des affectations</CardTitle>
          <p className="text-xs text-slate-500">
            Chaque retrait reste conservé; aucune affectation précédente n’est effacée.
          </p>
        </CardHeader>
        <CardContent>
          {assignmentHistory.length === 0 ? (
            <EmptyState
              title="Aucune affectation enregistrée"
              description="L’historique apparaîtra dès que cette barre sera affectée à une machine."
            />
          ) : (
            <ol className="space-y-3">
              {assignmentHistory.map((assignment) => (
                <li
                  key={assignment.id}
                  className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <Link
                      href={`/machines/${assignment.machineId}`}
                      className="font-medium hover:text-nim-red"
                    >
                      {assignment.machineName}
                    </Link>
                    <p className="mt-1 text-xs text-slate-500">
                      Affectée le{" "}
                      {new Intl.DateTimeFormat("fr-FR", {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }).format(new Date(assignment.assignedAt))}
                    </p>
                  </div>
                  {assignment.active ? (
                    <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                      Affectation active
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">
                      Retirée le{" "}
                      {assignment.unassignedAt
                        ? new Intl.DateTimeFormat("fr-FR", {
                            dateStyle: "medium",
                            timeStyle: "short",
                          }).format(new Date(assignment.unassignedAt))
                        : "—"}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
