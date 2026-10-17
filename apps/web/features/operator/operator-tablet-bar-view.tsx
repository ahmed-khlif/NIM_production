"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Clock3, Factory, Play, Ruler } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  getCurrentTabletOperatorRequest,
  getTabletBarRequest,
  startTabletBarRequest,
} from "@/features/auth/auth-client";
import { TabletBackButton, TabletHeader, TabletProblem } from "./tablet-ui";

function errorMessage(error: unknown): string {
  return error instanceof ApiError ? error.message : "Le serveur ne confirme pas cette action.";
}

export function OperatorTabletBarView(): React.ReactNode {
  const params = useParams<{ barId: string }>();
  const barId = params.barId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const operatorQuery = useQuery({
    queryKey: ["tablet", "operator"],
    queryFn: getCurrentTabletOperatorRequest,
    retry: false,
  });
  const barQuery = useQuery({
    queryKey: ["tablet", "bar", barId],
    queryFn: () => getTabletBarRequest(barId),
    retry: false,
    enabled: Boolean(operatorQuery.data?.operator),
  });
  const startMutation = useMutation({
    mutationFn: () => startTabletBarRequest(barId),
    onSuccess: async ({ run }) => {
      setConfirmOpen(false);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["tablet", "current"] }),
        queryClient.invalidateQueries({ queryKey: ["production"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["offer"] }),
        queryClient.invalidateQueries({ queryKey: ["machines"] }),
      ]);
      router.push(`/production/tablet/runs/${run.id}`);
    },
  });
  useEffect(() => {
    if (operatorQuery.error instanceof ApiError && operatorQuery.error.status === 401)
      router.replace("/production/login");
    if (barQuery.error instanceof ApiError && barQuery.error.status === 401)
      router.replace("/production/login");
  }, [barQuery.error, operatorQuery.error, router]);

  if (operatorQuery.isLoading || barQuery.isLoading)
    return (
      <>
        <TabletHeader />
        <main className="mx-auto max-w-4xl space-y-4 p-4 pt-6">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-36 rounded-xl" />
          <Skeleton className="h-64 rounded-xl" />
        </main>
      </>
    );
  const operator = operatorQuery.data?.operator;
  if (!operator)
    return (
      <div className="p-6 text-center text-sm text-slate-500">
        Redirection vers la connexion opérateur…
      </div>
    );
  if (barQuery.isError || !barQuery.data)
    return (
      <>
        <TabletHeader operator={operator} />
        <main className="mx-auto max-w-3xl space-y-4 p-4 pt-6">
          <TabletBackButton href="/production/tablet">Retour à la file</TabletBackButton>
          <TabletProblem
            error={barQuery.error}
            onRetry={() => void barQuery.refetch()}
            retrying={barQuery.isFetching}
          />
        </main>
      </>
    );

  const { bar, session } = barQuery.data;
  const scale = Math.min(100, (bar.usedLengthMm / Math.max(1, bar.rawLengthMm)) * 100);
  return (
    <div className="min-h-dvh pb-10">
      <TabletHeader
        operator={operator}
        machineName={session.machineName}
        action={
          <Badge className="min-h-8 bg-blue-50 px-3 text-blue-800 hover:bg-blue-50">Affectée</Badge>
        }
      />
      <main className="mx-auto max-w-4xl space-y-4 p-4 pt-5 sm:p-6 sm:pt-7">
        <TabletBackButton href="/production/tablet">File de la machine</TabletBackButton>
        <section>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
            {bar.offerReference} · Détail barre
          </p>
          <div className="mt-1 flex flex-wrap items-center gap-3">
            <h1 className="text-2xl font-semibold sm:text-3xl">{bar.reference}</h1>
            <Badge variant="outline">{bar.profile}</Badge>
          </div>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-500">
            <Factory className="size-4" />
            {session.machineName} · {session.machineInternalNumber}
          </p>
        </section>
        <Card>
          <CardContent className="grid gap-4 p-5 sm:grid-cols-3">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Longueur brute
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {bar.rawLengthMm.toLocaleString("fr-FR")} mm
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Longueur utilisée
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {bar.usedLengthMm.toLocaleString("fr-FR")} mm
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Chute prévue
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {bar.wasteMm.toLocaleString("fr-FR")} mm
              </p>
            </div>
            <div className="sm:col-span-3">
              <div className="mb-2 flex items-center justify-between text-xs text-slate-500">
                <span>Plan de coupe</span>
                <span>{Math.round(scale)} % utilisé</span>
              </div>
              <div
                className="flex h-8 overflow-hidden rounded-md bg-slate-100"
                role="img"
                aria-label={`${bar.usedLengthMm} mm utilisés sur ${bar.rawLengthMm} mm`}
              >
                {bar.items.map((item, index) => (
                  <div
                    key={item.id}
                    className={`flex h-full items-center justify-center border-r border-white/70 text-[10px] font-semibold text-white ${index % 2 ? "bg-slate-600" : "bg-nim-red"}`}
                    style={{ width: `${(item.lengthMm / bar.rawLengthMm) * 100}%` }}
                    title={`${item.reference} · ${item.lengthMm} mm`}
                  />
                ))}
                <div className="h-full flex-1 bg-slate-200" />
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                <Ruler className="size-3.5" />
                La visualisation reprend les longueurs enregistrées du plan validé.
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Pièces de cette barre</CardTitle>
              <p className="mt-1 text-xs text-slate-500">
                {bar.items.length} pièce(s) · statut de production affecté
              </p>
            </div>
            <Badge variant="outline" className="min-h-8 px-3">
              {bar.items.length}
            </Badge>
          </CardHeader>
          <CardContent className="space-y-2">
            {bar.items.map((item) => (
              <div
                key={item.id}
                className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 bg-white p-3"
              >
                <span className="flex size-9 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold text-slate-700">
                  {String(item.sequenceNumber).padStart(2, "0")}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{item.reference}</p>
                  <p className="text-xs text-slate-500">
                    {item.lengthMm.toLocaleString("fr-FR")} mm ·{" "}
                    {item.weightKg === null
                      ? "Poids non renseigné"
                      : `${item.weightKg.toLocaleString("fr-FR")} kg`}
                  </p>
                </div>
                <div className="text-right">
                  <Badge variant="outline">Affectée</Badge>
                  {item.qualityStatus === "NON_CONFORME" ? (
                    <p className="mt-1 text-[11px] text-red-700">Alerte qualité</p>
                  ) : null}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
        {startMutation.isError ? (
          <p
            className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            role="alert"
          >
            {errorMessage(startMutation.error)}
          </p>
        ) : null}
        <div className="sticky bottom-3 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:static sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
          <Button
            className="h-14 w-full text-base sm:mx-auto sm:max-w-md"
            onClick={() => setConfirmOpen(true)}
            disabled={bar.status !== "AFFECTEE" || startMutation.isPending}
          >
            <Play className="size-5" />
            Lancer la fabrication
            <ArrowRight className="size-5" />
          </Button>
        </div>
        <AlertDialog
          open={confirmOpen}
          onOpenChange={(open) => {
            if (!startMutation.isPending) setConfirmOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Lancer la fabrication de {bar.reference} ?</AlertDialogTitle>
              <AlertDialogDescription>
                Machine : {session.machineName}. L’équipe présente est enregistrée dans la session
                de production. La barre et ses pièces passeront à l’état « Lancée ».
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-lg bg-slate-50 p-3 text-sm">
              <p className="font-medium">Équipe</p>
              <p className="mt-1 text-slate-600">
                {session.team.map((member) => member.displayName).join(" · ")}
              </p>
              <p className="mt-3 flex items-center gap-2 text-xs text-slate-500">
                <Clock3 className="size-3.5" />
                La date et l’opérateur seront conservés dans l’historique.
              </p>
            </div>
            {startMutation.isError ? (
              <p className="text-sm text-red-700" role="alert">
                {errorMessage(startMutation.error)}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={startMutation.isPending}>Annuler</AlertDialogCancel>
              <AlertDialogAction
                disabled={startMutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  startMutation.mutate();
                }}
              >
                {startMutation.isPending ? "Lancement…" : "Lancer la fabrication"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}
