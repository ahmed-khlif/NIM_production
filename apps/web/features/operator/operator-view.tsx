"use client";

import type { ManagedProductionOperation, ProductionQueueItem } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronLeft,
  Factory,
  Loader2,
  LogOut,
  MoreVertical,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import Image from "next/image";
import { ReturnLink } from "@/components/navigation/return-navigation";
import { toast } from "sonner";
import { NimLogo } from "@/components/brand/nim-logo";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import {
  ApiError,
  finishProductionRequest,
  getMachinesRequest,
  getOfferRequest,
  getProductionCurrentRequest,
  startProductionRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { ProtectedRoute } from "@/features/auth/protected-route";

function initials(displayName: string): string {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function formatDate(value: string | number | Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value instanceof Date ? value : new Date(value));
}

function apiMessage(error: unknown, fallback: string): string {
  return error instanceof ApiError ? error.message : fallback;
}

function QueueItem({
  item,
  busy,
  offerId,
  onStart,
}: {
  item: ProductionQueueItem;
  busy: boolean;
  offerId?: string;
  onStart: (item: ProductionQueueItem) => void;
}): React.ReactNode {
  return (
    <div className="flex flex-col gap-4 rounded-xl border border-slate-200 bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <Link href={offerId ? `/offers/${offerId}/pieces/${item.pieceId}` : "/offers"} className="font-semibold text-slate-950 underline-offset-4 hover:text-nim-red hover:underline">
            {item.reference}
          </Link>
          <StatusBadge tone="info">En attente</StatusBadge>
          <PriorityBadge priority={item.priority} />
        </div>
        <p className="mt-1 text-sm text-slate-600">
          Unité {String(item.sequenceNumber).padStart(2, "0")} · {item.profile} · {item.lengthMm} mm
        </p>
        <p className="mt-1 text-xs text-slate-400" aria-label={`Affectation de ${item.reference}`}>
          {item.queuePosition ? `Position ${item.queuePosition} · ` : ""}Affectée{" "}
          {formatDate(item.assignedAt)}
        </p>
      </div>
      <Button
        className="min-h-11 w-full shrink-0 sm:w-auto"
        onClick={() => onStart(item)}
        disabled={busy}
      >
        {busy ? <Loader2 className="size-4 animate-spin" /> : <Factory className="size-4" />}
        Démarrer
      </Button>
    </div>
  );
}

function CurrentOperation({
  operation,
  busy,
  offerId,
  onComplete,
}: {
  operation: ManagedProductionOperation;
  busy: boolean;
  offerId?: string;
  onComplete: () => void;
}): React.ReactNode {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader className="gap-3 border-b border-slate-100 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nim-red">
            Opération en cours
          </p>
          <CardTitle className="mt-1 text-xl"><Link href={offerId ? `/offers/${offerId}/pieces/${operation.pieceId}` : "/offers"} className="underline-offset-4 hover:text-nim-red hover:underline">{operation.reference}</Link></CardTitle>
        </div>
        <div className="flex items-center gap-3"><Image src="/assets/illustrations/production-in-progress.png" alt="" aria-hidden="true" width={84} height={84} className="hidden size-16 object-contain sm:block" /><StatusBadge tone="active">En fabrication</StatusBadge></div>
      </CardHeader>
      <CardContent className="p-5 sm:p-7">
        <div className="grid gap-5 sm:grid-cols-3">
          <div>
            <p className="text-xs text-slate-500">Unité</p>
            <p className="mt-1 font-semibold text-slate-950">
              {String(operation.sequenceNumber).padStart(2, "0")}
            </p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Profil</p>
            <p className="mt-1 font-semibold text-slate-950">{operation.profile}</p>
          </div>
          <div>
            <p className="text-xs text-slate-500">Machine</p>
            <p className="mt-1 font-semibold text-slate-950">{operation.machineName}</p>
          </div>
        </div>
        <div className="mt-7 flex flex-col gap-4 rounded-xl bg-slate-50 p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3 text-sm text-slate-600">
            <UserRound className="size-4 text-slate-400" />
            Démarrée {formatDate(operation.startedAt)} par {operation.operatorName}
          </div>
          <Button className="min-h-12 w-full sm:w-auto" onClick={onComplete} disabled={busy} aria-label={`Envoyer ${operation.reference} au contrôle qualité`}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
            Envoyer au contrôle qualité
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

export function OperatorView(): React.ReactNode {
  const router = useRouter();
  const searchParams = useSearchParams();
  const offerId = searchParams.get("offerId")?.trim() || undefined;
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [selectedMachineId, setSelectedMachineId] = useState("");
  const [completionTarget, setCompletionTarget] = useState<ManagedProductionOperation | null>(null);
  const canOperate =
    user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER" || user?.role === "OPERATOR";
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId),
    retry: false,
  });
  const machinesQuery = useQuery({
    queryKey: ["machines"],
    queryFn: getMachinesRequest,
    enabled: canOperate,
    retry: false,
  });
  const activeMachines = useMemo(
    () => machinesQuery.data?.machines.filter((machine) => machine.status === "ACTIVE") ?? [],
    [machinesQuery.data],
  );

  useEffect(() => {
    if (!selectedMachineId && activeMachines.length > 0) setSelectedMachineId(activeMachines[0].id);
  }, [activeMachines, selectedMachineId]);

  const productionQuery = useQuery({
    queryKey: ["production", "current", selectedMachineId, offerId ?? "ALL"],
    queryFn: () => getProductionCurrentRequest(selectedMachineId, offerId),
    enabled: canOperate && Boolean(selectedMachineId),
    retry: false,
  });
  useEffect(() => {
    const currentMachineId = productionQuery.data?.current?.machineId;
    if (currentMachineId && currentMachineId !== selectedMachineId) setSelectedMachineId(currentMachineId);
  }, [productionQuery.data?.current?.machineId, selectedMachineId]);

  const refreshWorkspace = async (): Promise<void> => {
    await Promise.all([
      machinesQuery.refetch(),
      selectedMachineId ? productionQuery.refetch() : Promise.resolve(),
    ]);
  };

  const startMutation = useMutation({
    mutationFn: (item: ProductionQueueItem) =>
      startProductionRequest({ pieceUnitId: item.pieceUnitId, machineId: selectedMachineId }),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production"] }),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["pieces"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        ...(offerId
          ? [
              queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
              queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] }),
            ]
          : []),
      ]);
      toast.success("Production démarrée");
    },
    onError: (error) => toast.error(apiMessage(error, "Impossible de démarrer cette production.")),
  });
  const completeMutation = useMutation({
    mutationFn: (operationId: string) => finishProductionRequest(operationId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["production"] }),
        queryClient.invalidateQueries({ queryKey: ["assignments"] }),
        queryClient.invalidateQueries({ queryKey: ["pieces"] }),
        queryClient.invalidateQueries({ queryKey: ["quality"] }),
        queryClient.invalidateQueries({ queryKey: ["dashboard"] }),
        queryClient.invalidateQueries({ queryKey: ["history"] }),
        queryClient.invalidateQueries({ queryKey: ["notifications"] }),
        ...(offerId
          ? [
              queryClient.invalidateQueries({ queryKey: ["offer", offerId] }),
              queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] }),
            ]
          : []),
      ]);
      setCompletionTarget(null);
      toast.success("Unité envoyée au contrôle qualité");
    },
    onError: (error) => toast.error(apiMessage(error, "Impossible de terminer cette production.")),
  });

  const currentOperation = productionQuery.data?.current ?? null;
  const selectedMachine = machinesQuery.data?.machines.find((machine) => machine.id === selectedMachineId);
  const machineOptions = currentOperation && selectedMachine && !activeMachines.some((machine) => machine.id === selectedMachine.id) ? [selectedMachine] : activeMachines;
  const isWorkspaceBusy = machinesQuery.isFetching || productionQuery.isFetching || startMutation.isPending || completeMutation.isPending;

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.replace("/login");
  };

  const content = !canOperate ? (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center" role="alert">
        <UserRound className="size-8 text-slate-300" />
        <h1 className="mt-4 text-lg font-semibold text-slate-900">Accès opérateur requis</h1>
        <p className="mt-2 text-sm text-slate-500">
          Votre rôle ne permet pas d’exécuter une production.
        </p>
      </CardContent>
    </Card>
  ) : machinesQuery.isLoading ? (
    <div className="space-y-5">
      <Skeleton className="h-24 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  ) : machinesQuery.isError ? (
    <Card>
      <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center" role="alert">
        <p className="font-semibold text-red-700">Impossible de charger les machines</p>
        <p className="mt-1 text-sm text-slate-500">
          {apiMessage(machinesQuery.error, "Vérifiez la connexion à l’API.")}
        </p>
        <Button variant="outline" className="mt-4" onClick={() => void machinesQuery.refetch()}>
          <RefreshCw className="size-4" />
          Réessayer
        </Button>
      </CardContent>
    </Card>
  ) : (
    <>
      <Card className="border-slate-200 shadow-sm">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between sm:p-5">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-400">
              Machine utilisée
            </p>
            <p className="mt-1 text-sm text-slate-500">
              Choisissez votre poste pour voir sa file de production.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row">
          <Select value={selectedMachineId} onValueChange={setSelectedMachineId} disabled={!activeMachines.length || Boolean(currentOperation) || isWorkspaceBusy}>
            <SelectTrigger className="w-full sm:w-[280px]" aria-label="Machine active">
              <SelectValue
                placeholder={
                  activeMachines.length ? "Choisir une machine active" : "Aucune machine active"
                }
              />
            </SelectTrigger>
            <SelectContent>
                {machineOptions.map((machine) => (
                <SelectItem key={machine.id} value={machine.id}>
                  {machine.name} · {machine.internalNumber}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button type="button" variant="outline" size="icon" aria-label="Actualiser la file" title="Actualiser la file" onClick={() => void refreshWorkspace()} disabled={isWorkspaceBusy}>
            <RefreshCw className={machinesQuery.isFetching || productionQuery.isFetching ? "size-4 animate-spin" : "size-4"} />
          </Button>
          </div>
        </CardContent>
      </Card>
      {selectedMachine && !productionQuery.isLoading && !productionQuery.isError ? (
        <div className="grid gap-3 sm:grid-cols-3" aria-live="polite">
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-red-50 p-2.5 text-nim-red"><Factory className="size-5" /></div>
              <div><p className="text-xs text-slate-500">Poste sélectionné</p><p className="mt-1 font-semibold text-slate-950">{selectedMachine.name}</p><p className="text-xs text-slate-500">{selectedMachine.internalNumber}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600"><TimerReset className="size-5" /></div>
              <div><p className="text-xs text-slate-500">Unités en attente</p><p className="mt-1 text-2xl font-semibold text-slate-950">{productionQuery.data?.queue.length ?? 0}</p></div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="flex items-center gap-3 p-4">
              <div className="rounded-lg bg-slate-100 p-2.5 text-slate-700"><ShieldCheck className="size-5" /></div>
              <div><p className="text-xs text-slate-500">État opérateur</p><p className="mt-1 font-semibold text-slate-950">{currentOperation ? "En fabrication" : "Prêt à démarrer"}</p><p className="text-xs text-slate-500">Actualisé {formatDate(productionQuery.dataUpdatedAt)}</p></div>
            </CardContent>
          </Card>
        </div>
      ) : null}
      {!activeMachines.length && !currentOperation ? (
        <EmptyState
          title="Aucune machine active"
          description="Une machine active est nécessaire pour démarrer une production."
          illustration="/assets/illustrations/machine-maintenance.png"
          illustrationAlt="Illustration d’une machine en maintenance"
        />
      ) : productionQuery.isLoading ? (
        <div className="space-y-5">
          <Skeleton className="h-56 w-full rounded-xl" />
          <Skeleton className="h-48 w-full rounded-xl" />
        </div>
      ) : productionQuery.isError ? (
        <Card>
          <CardContent className="flex min-h-56 flex-col items-center justify-center p-8 text-center" role="alert">
            <p className="font-semibold text-red-700">Impossible de charger la file</p>
            <p className="mt-1 text-sm text-slate-500">
              {apiMessage(productionQuery.error, "Vérifiez la connexion à l’API.")}
            </p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => void productionQuery.refetch()}
            >
              <RefreshCw className="size-4" />
              Réessayer
            </Button>
          </CardContent>
        </Card>
      ) : (
        <>
          {currentOperation ? (
            <CurrentOperation
              operation={currentOperation}
              busy={completeMutation.isPending}
              offerId={offerId}
              onComplete={() => setCompletionTarget(currentOperation)}
            />
          ) : (
            <Card className="border-dashed border-slate-300">
              <CardContent className="p-0">
                <EmptyState
                  title="Aucune production en cours"
                  description="Démarrez la prochaine unité de la file pour commencer la fabrication."
                />
              </CardContent>
            </Card>
          )}
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <div className="flex items-center justify-between gap-3">
                <CardTitle className="text-base">File de production</CardTitle>
                <Badge variant="secondary">{productionQuery.data?.queue.length ?? 0} unité(s)</Badge>
              </div>
              <p className="text-sm text-slate-500">
                Les unités sont servies dans l’ordre d’affectation.
              </p>
            </CardHeader>
            <CardContent className="space-y-3" aria-live="polite">
              {productionQuery.data?.queue.length ? (
                productionQuery.data.queue.map((item) => (
                  <QueueItem
                    key={item.pieceUnitId}
                    item={item}
                    busy={startMutation.isPending || Boolean(productionQuery.data?.current)}
                    offerId={offerId}
                    onStart={(queueItem) => startMutation.mutate(queueItem)}
                  />
                ))
              ) : (
                <EmptyState
                  title="File vide"
                  description="Aucune unité affectée à cette machine n’attend actuellement."
                />
              )}
            </CardContent>
          </Card>
        </>
      )}
    </>
  );

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-slate-50">
        <header className="flex min-h-[72px] items-center justify-between border-b border-slate-200 bg-white px-4 sm:px-8">
          <div className="flex items-center gap-3">
            <ReturnLink
              href={offerId ? `/offers/${offerId}/production` : "/dashboard"}
              className="rounded-md p-2 text-slate-500 transition-colors hover:bg-slate-100"
              aria-label="Retour au tableau de bord"
            >
              <ChevronLeft className="size-5" />
            </ReturnLink>
            <div className="h-6 w-px bg-slate-200" />
            <div className="sm:hidden">
              <NimLogo compact />
            </div>
            <div className="hidden sm:block">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-nim-red">
                {offerId ? "Production de l’offre" : "Espace opérateur"}
              </p>
              <p className="mt-1 text-sm font-medium text-slate-900">
                {offerId && offerQuery.data?.offer
                  ? `${offerQuery.data.offer.reference} · ${offerQuery.data.offer.name}`
                  : "Exécution de production"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {user ? (
              <>
                <Avatar className="size-8">
                  <AvatarFallback className="bg-nim-dark text-[11px] font-bold text-white">
                    {initials(user.displayName)}
                  </AvatarFallback>
                </Avatar>
                <span className="hidden text-xs font-semibold text-slate-800 sm:block">
                  {user.displayName}
                </span>
              </>
            ) : null}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label="Plus d’options">
                  <MoreVertical className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => void handleLogout()}>
                  <LogOut />
                  Se déconnecter
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>
        <div className="mx-auto max-w-4xl space-y-5 px-4 py-6 sm:px-8 sm:py-10">{content}</div>
        <AlertDialog open={Boolean(completionTarget)} onOpenChange={(open) => { if (!open && !completeMutation.isPending) setCompletionTarget(null); }}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Envoyer cette unité au contrôle qualité ?</AlertDialogTitle>
              <AlertDialogDescription>
                {completionTarget ? `${completionTarget.reference} · unité ${String(completionTarget.sequenceNumber).padStart(2, "0")} sera marquée comme fabriquée et transmise au contrôle qualité.` : "Cette action terminera l'opération en cours."}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={completeMutation.isPending}>Annuler</AlertDialogCancel>
              <AlertDialogAction disabled={completeMutation.isPending} onClick={() => { if (completionTarget) completeMutation.mutate(completionTarget.id); }}>
                {completeMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Confirmer l'envoi
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </main>
    </ProtectedRoute>
  );
}
