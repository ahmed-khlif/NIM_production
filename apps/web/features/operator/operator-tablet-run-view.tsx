"use client";

import { reportProductionNonConformitySchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  Clock3,
  Flag,
  Loader2,
  ShieldAlert,
} from "lucide-react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  finishTabletRunRequest,
  getCurrentTabletOperatorRequest,
  getTabletRunRequest,
  reportTabletNonConformityRequest,
} from "@/features/auth/auth-client";
import type { ProductionNonConformityReason } from "@nim/types";
import { TabletHeader, TabletProblem, elapsedTimeLabel, formatTabletDate } from "./tablet-ui";

const reasonLabels: Record<ProductionNonConformityReason, string> = {
  DIMENSION: "Défaut dimensionnel",
  CUTTING_ERROR: "Erreur de coupe",
  DRILLING_ERROR: "Erreur de perçage",
  MATERIAL_DEFECT: "Défaut matière",
  DEFORMATION: "Déformation",
  OTHER: "Autre",
};

function errorMessage(error: unknown): string {
  return error instanceof ApiError
    ? error.message
    : "Le serveur ne confirme pas cette action. Vérifiez le réseau puis réessayez.";
}

export function OperatorTabletRunView(): React.ReactNode {
  const params = useParams<{ runId: string }>();
  const runId = params.runId;
  const router = useRouter();
  const queryClient = useQueryClient();
  const [now, setNow] = useState(Date.now());
  const [finishOpen, setFinishOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [pieceUnitId, setPieceUnitId] = useState("");
  const [reason, setReason] = useState<ProductionNonConformityReason | "">("");
  const [comment, setComment] = useState("");
  const [reportError, setReportError] = useState<string | null>(null);
  const operatorQuery = useQuery({
    queryKey: ["tablet", "operator"],
    queryFn: getCurrentTabletOperatorRequest,
    retry: false,
  });
  const runQuery = useQuery({
    queryKey: ["tablet", "run", runId],
    queryFn: () => getTabletRunRequest(runId),
    retry: false,
    enabled: Boolean(operatorQuery.data?.operator),
    refetchInterval: (query) => (query.state.data?.run.status === "RUNNING" ? 10000 : false),
  });
  const invalidateProduction = async (): Promise<void> => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["tablet", "current"] }),
      queryClient.invalidateQueries({ queryKey: ["tablet", "run", runId] }),
      queryClient.invalidateQueries({ queryKey: ["production"] }),
      queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
      queryClient.invalidateQueries({ queryKey: ["offer"] }),
      queryClient.invalidateQueries({ queryKey: ["machines"] }),
      queryClient.invalidateQueries({ queryKey: ["quality"] }),
      queryClient.invalidateQueries({ queryKey: ["history"] }),
      queryClient.invalidateQueries({ queryKey: ["notifications"] }),
    ]);
  };
  const reportMutation = useMutation({
    mutationFn: (input: {
      pieceUnitId: string;
      reason: ProductionNonConformityReason;
      comment?: string;
    }) => reportTabletNonConformityRequest(runId, input),
    onSuccess: async () => {
      setReportOpen(false);
      setPieceUnitId("");
      setReason("");
      setComment("");
      setReportError(null);
      await invalidateProduction();
      toast.success("Non-conformité enregistrée");
    },
    onError: (error) => setReportError(errorMessage(error)),
  });
  const finishMutation = useMutation({
    mutationFn: () => finishTabletRunRequest(runId),
    onSuccess: async ({ run }) => {
      setFinishOpen(false);
      await invalidateProduction();
      if (run.status === "COMPLETED") toast.success(`Fabrication de ${run.barReference} terminée`);
    },
  });
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  useEffect(() => {
    if (operatorQuery.error instanceof ApiError && operatorQuery.error.status === 401)
      router.replace("/production/login");
    if (runQuery.error instanceof ApiError && runQuery.error.status === 401)
      router.replace("/production/login");
  }, [operatorQuery.error, router, runQuery.error]);

  if (operatorQuery.isLoading || runQuery.isLoading)
    return (
      <>
        <TabletHeader />
        <main className="mx-auto max-w-4xl space-y-4 p-4 pt-6">
          <Skeleton className="h-10 w-40" />
          <Skeleton className="h-32 rounded-xl" />
          <Skeleton className="h-56 rounded-xl" />
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
  if (runQuery.isError || !runQuery.data?.run)
    return (
      <>
        <TabletHeader operator={operator} />
        <main className="mx-auto max-w-3xl space-y-4 p-4 pt-6">
          <TabletProblem
            error={runQuery.error}
            onRetry={() => void runQuery.refetch()}
            retrying={runQuery.isFetching}
          />
        </main>
      </>
    );

  const run = runQuery.data.run;
  const running = run.status === "RUNNING";
  const duration = elapsedTimeLabel(
    run.startedAt,
    run.finishedAt ? new Date(run.finishedAt).getTime() : now,
  );
  const submitReport = (): void => {
    const parsed = reportProductionNonConformitySchema.safeParse({
      pieceUnitId,
      reason,
      comment: comment.trim() || undefined,
    });
    if (!parsed.success) {
      setReportError(parsed.error.issues[0]?.message ?? "Vérifiez la non-conformité.");
      return;
    }
    setReportError(null);
    reportMutation.mutate(parsed.data);
  };

  return (
    <div className="min-h-dvh pb-10">
      <TabletHeader
        operator={operator}
        machineName={run.machineName}
        action={
          <Badge
            className={
              running
                ? "min-h-8 bg-red-50 px-3 text-red-800 hover:bg-red-50"
                : "min-h-8 bg-emerald-50 px-3 text-emerald-800 hover:bg-emerald-50"
            }
          >
            {running ? "En cours" : "Terminée"}
          </Badge>
        }
      />
      <main className="mx-auto max-w-4xl space-y-4 p-4 pt-5 sm:p-6 sm:pt-7">
        <Button asChild variant="ghost" className="min-h-11 px-0">
          <Link href="/production/tablet">
            <ArrowLeft className="size-5" />
            File machine
          </Link>
        </Button>
        <Card className={running ? "border-nim-red/30" : "border-emerald-200"}>
          <CardContent className="p-5 sm:p-7">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">
                  {run.offerReference} · {run.machineName}
                </p>
                <h1 className="mt-1 text-2xl font-semibold sm:text-3xl">{run.barReference}</h1>
                <p className="mt-2 text-sm text-slate-500">
                  {run.profile} · {run.rawLengthMm.toLocaleString("fr-FR")} mm · {run.pieceCount}{" "}
                  pièce(s)
                </p>
              </div>
              <div className="rounded-xl bg-slate-50 px-4 py-3 text-right">
                <p className="text-xs text-slate-500">Durée</p>
                <p className="mt-1 flex items-center justify-end gap-2 font-mono text-2xl font-semibold tabular-nums">
                  <Clock3 className="size-5 text-slate-400" />
                  {duration}
                </p>
                <p className="mt-1 text-xs text-slate-500">
                  Début {formatTabletDate(run.startedAt)}
                </p>
              </div>
            </div>
            <div className="mt-5 flex flex-wrap gap-2">
              {run.team.map((member) => (
                <Badge key={member.id} variant="outline" className="min-h-8 px-3">
                  {member.displayName}
                  {member.role === "LEAD" ? " · principal" : ""}
                </Badge>
              ))}
            </div>
            {!running ? (
              <div className="mt-5 flex items-start gap-3 rounded-lg bg-emerald-50 p-4 text-sm text-emerald-900">
                <CheckCircle2 className="mt-0.5 size-5 shrink-0" />
                <div>
                  <p className="font-semibold">Fabrication confirmée</p>
                  <p className="mt-1">
                    Terminée à {run.finishedAt ? formatTabletDate(run.finishedAt) : "—"}.
                    L’historique et les indicateurs ont été mis à jour.
                  </p>
                </div>
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Pièces de la barre</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {run.bar.items.map((item) => {
              const issue = run.nonConformities.find(
                (entry) => entry.pieceUnitId === item.pieceUnitId,
              );
              return (
                <div
                  key={item.id}
                  className="flex min-h-16 items-center gap-3 rounded-lg border border-slate-200 p-3"
                >
                  <span className="flex size-9 items-center justify-center rounded-md bg-slate-100 text-xs font-semibold">
                    {String(item.sequenceNumber).padStart(2, "0")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{item.reference}</p>
                    <p className="text-xs text-slate-500">
                      {item.lengthMm.toLocaleString("fr-FR")} mm
                    </p>
                  </div>
                  {issue ? (
                    <Badge className="bg-red-50 text-red-800 hover:bg-red-50">
                      <ShieldAlert className="mr-1 size-3.5" />
                      Non conforme
                    </Badge>
                  ) : (
                    <Badge variant="outline">
                      {item.productionStatus === "FABRIQUEE" ? "Fabriquée" : "En cours"}
                    </Badge>
                  )}
                </div>
              );
            })}
          </CardContent>
        </Card>
        {run.nonConformities.length ? (
          <Card className="border-red-200">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base text-red-800">
                <AlertTriangle className="size-5" />
                Non-conformités ouvertes ({run.nonConformities.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {run.nonConformities.map((item) => (
                <div key={item.id} className="rounded-lg bg-red-50 p-3">
                  <p className="font-medium text-red-900">
                    {item.pieceReference} · {reasonLabel(item.reason)}
                  </p>
                  {item.comment ? (
                    <p className="mt-1 text-sm text-red-800">{item.comment}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-red-700">
                    Signalée par {item.reportedBy.displayName} à {formatTabletDate(item.reportedAt)}
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
        {running ? (
          <div className="sticky bottom-3 grid gap-2 rounded-xl border border-slate-200 bg-white/95 p-3 shadow-lg backdrop-blur sm:static sm:grid-cols-2 sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none">
            <Button
              variant="outline"
              className="h-14 text-base"
              onClick={() => {
                setReportError(null);
                setReportOpen(true);
              }}
              disabled={reportMutation.isPending}
            >
              <Flag className="size-5" />
              Signaler une non-conformité
            </Button>
            <Button
              className="h-14 text-base"
              onClick={() => setFinishOpen(true)}
              disabled={finishMutation.isPending}
            >
              <CheckCircle2 className="size-5" />
              Terminer la barre
            </Button>
          </div>
        ) : (
          <Button asChild className="h-14 w-full text-base sm:mx-auto sm:max-w-md">
            <Link href="/production/tablet">
              <CheckCircle2 className="size-5" />
              Barre suivante
            </Link>
          </Button>
        )}
        {finishMutation.isError ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-800" role="alert">
            {errorMessage(finishMutation.error)}
          </p>
        ) : null}
        <Dialog
          open={reportOpen}
          onOpenChange={(open) => {
            if (!reportMutation.isPending) setReportOpen(open);
          }}
        >
          <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>Signaler une non-conformité</DialogTitle>
              <DialogDescription>
                Le statut de fabrication reste inchangé. L’alerte qualité sera rattachée à cette
                pièce, cette barre et cette session.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="nc-piece">Pièce concernée</Label>
                <select
                  id="nc-piece"
                  value={pieceUnitId}
                  onChange={(event) => setPieceUnitId(event.target.value)}
                  className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Choisir une pièce</option>
                  {run.bar.items.map((item) => (
                    <option key={item.pieceUnitId} value={item.pieceUnitId}>
                      {item.reference} · {item.lengthMm} mm
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nc-reason">Motif</Label>
                <select
                  id="nc-reason"
                  value={reason}
                  onChange={(event) =>
                    setReason(event.target.value as ProductionNonConformityReason | "")
                  }
                  className="h-12 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                >
                  <option value="">Choisir un motif</option>
                  {Object.entries(reasonLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="nc-comment">
                  Commentaire {reason === "OTHER" ? "(obligatoire)" : "(facultatif)"}
                </Label>
                <textarea
                  id="nc-comment"
                  value={comment}
                  onChange={(event) => setComment(event.target.value)}
                  maxLength={1000}
                  rows={3}
                  placeholder="Décrivez brièvement le défaut observé"
                  className="min-h-24 w-full resize-y rounded-md border border-slate-200 bg-white px-3 py-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red"
                />
              </div>
              {reportError ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                  {reportError}
                </p>
              ) : null}
              {reportMutation.isError && !reportError ? (
                <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800" role="alert">
                  {errorMessage(reportMutation.error)}
                </p>
              ) : null}
            </div>
            <DialogFooter>
              <Button
                variant="outline"
                onClick={() => setReportOpen(false)}
                disabled={reportMutation.isPending}
              >
                Annuler
              </Button>
              <Button onClick={submitReport} disabled={reportMutation.isPending}>
                {reportMutation.isPending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Flag className="size-4" />
                )}
                Déclarer non conforme
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
        <AlertDialog
          open={finishOpen}
          onOpenChange={(open) => {
            if (!finishMutation.isPending) setFinishOpen(open);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Terminer la fabrication de {run.barReference} ?</AlertDialogTitle>
              <AlertDialogDescription>
                La barre et les pièces restantes passeront à l’état fabriqué. Les non-conformités
                ouvertes resteront visibles pour le responsable qualité.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <div className="rounded-lg bg-slate-50 p-4 text-sm">
              <p className="flex items-center justify-between">
                <span className="text-slate-500">Durée</span>
                <span className="font-mono font-semibold">{duration}</span>
              </p>
              <p className="mt-2 flex items-center justify-between">
                <span className="text-slate-500">Non-conformités ouvertes</span>
                <span className="font-semibold">{run.openNonConformityCount}</span>
              </p>
            </div>
            {finishMutation.isError ? (
              <p className="text-sm text-red-700" role="alert">
                {errorMessage(finishMutation.error)}
              </p>
            ) : null}
            <AlertDialogFooter>
              <AlertDialogCancel disabled={finishMutation.isPending}>Continuer</AlertDialogCancel>
              <AlertDialogAction
                disabled={finishMutation.isPending}
                onClick={(event) => {
                  event.preventDefault();
                  finishMutation.mutate();
                }}
              >
                {finishMutation.isPending ? "Finalisation…" : "Terminer la barre"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </div>
  );
}

function reasonLabel(reason: ProductionNonConformityReason): string {
  return reasonLabels[reason];
}
