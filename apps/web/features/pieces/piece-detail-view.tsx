"use client";

import { Table } from "@/components/ui/table";
import type {
  ManagedHistoryEvent,
  PieceDetail,
  PieceStatus,
  PieceUnitStatus,
} from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  CalendarDays,
  CheckCircle2,
  Clock3,
  Copy,
  Factory,
  RefreshCw,
  UserRound,
} from "lucide-react";
import { useParams } from "next/navigation";
import {
  ApiError,
  getOfferPieceRequest,
  getPieceHistoryRequest,
  getPieceRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { PageHeader } from "@/components/ui/page-header";
import { ProductionProgress } from "@/components/ui/production-progress";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { PriorityBadge } from "@/components/ui/priority-badge";
import { PieceImageGallery } from "@/features/pieces/piece-image-gallery";
import { ReturnLink } from "@/components/navigation/return-navigation";

const statusLabels: Record<PieceStatus, string> = {
  PLANNED: "Planifiée",
  ASSIGNED: "Affectée",
  IN_PROGRESS: "En fabrication",
  COMPLETED: "Terminée",
  DELAYED: "En retard",
  ARCHIVED: "Archivée",
};
const statusTones: Record<PieceStatus, "active" | "info" | "warning" | "danger" | "neutral"> = {
  PLANNED: "neutral",
  ASSIGNED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "active",
  DELAYED: "danger",
  ARCHIVED: "neutral",
};
const unitStatusLabels: Record<PieceUnitStatus, string> = {
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
const unitStatusTones: Record<
  PieceUnitStatus,
  "active" | "info" | "warning" | "danger" | "neutral"
> = {
  PENDING: "neutral",
  FACONNEE: "info",
  ASSIGNED: "info",
  IN_PROGRESS: "warning",
  COMPLETED: "info",
  QUALITY_PENDING: "warning",
  ACCEPTED: "active",
  REJECTED: "danger",
  SCRAPPED: "neutral",
};

function date(value: string | null): string {
  if (!value) return "—";
  return new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value),
  );
}

function eventLabel(event: ManagedHistoryEvent): string {
  return event.eventType
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^./, (value) => value.toUpperCase());
}

function DetailError({
  message,
  onRetry,
}: {
  message: string;
  onRetry: () => void;
}): React.ReactNode {
  return (
    <div className="flex min-h-72 flex-col items-center justify-center rounded-xl border border-red-100 bg-red-50/40 p-8 text-center">
      <p className="font-semibold text-red-800">Impossible de charger la pièce</p>
      <p className="mt-1 max-w-md text-sm text-red-700">{message}</p>
      <Button variant="outline" className="mt-4" onClick={onRetry}>
        <RefreshCw className="size-4" />
        Réessayer
      </Button>
    </div>
  );
}

function UnitStatus({ status }: { status: PieceUnitStatus }): React.ReactNode {
  return <StatusBadge tone={unitStatusTones[status]}>{unitStatusLabels[status]}</StatusBadge>;
}

function UnitCard({ unit }: { unit: PieceDetail["units"][number] }): React.ReactNode {
  return (
    <div className="rounded-lg border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-semibold text-slate-900">Unité #{unit.sequenceNumber}</p>
          <p className="mt-1 text-xs text-slate-500">{unit.id}</p>
        </div>
        <UnitStatus status={unit.status} />
      </div>
      <div className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <p className="text-xs text-slate-400">Machine</p>
          <p className="mt-1 flex items-center gap-1.5 text-slate-700">
            <Factory className="size-3.5 text-slate-400" />
            {unit.currentMachineName ?? "Non affectée"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Opérateur</p>
          <p className="mt-1 flex items-center gap-1.5 text-slate-700">
            <UserRound className="size-3.5 text-slate-400" />
            {unit.currentOperatorName ?? "—"}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Fabrication</p>
          <p className="mt-1 text-slate-700">{date(unit.manufacturedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-slate-400">Contrôle</p>
          <p className="mt-1 text-slate-700">{unit.qualityResult ?? "En attente"}</p>
        </div>
      </div>
    </div>
  );
}

export function PieceDetailView({ offerId }: { offerId?: string } = {}): React.ReactNode {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { user } = useAuth();
  const canViewHistory = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const canManage = canViewHistory;
  const pieceQuery = useQuery({
    queryKey: offerId ? ["offer", offerId, "piece", id] : ["piece", id],
    queryFn: () => (offerId ? getOfferPieceRequest(offerId, id) : getPieceRequest(id)),
    enabled: Boolean(id),
    retry: false,
  });
  const historyQuery = useQuery({
    queryKey: ["history", "piece", id],
    queryFn: () => getPieceHistoryRequest(id, { pageSize: 8 }),
    enabled: Boolean(id) && canViewHistory,
    retry: false,
  });

  if (pieceQuery.isLoading)
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full" />
        <div className="grid gap-3 sm:grid-cols-3">
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
          <Skeleton className="h-28" />
        </div>
        <Skeleton className="h-80 w-full" />
      </div>
    );
  if (pieceQuery.isError)
    return (
      <DetailError
        message={
          pieceQuery.error instanceof ApiError
            ? pieceQuery.error.message
            : "Vérifiez la connexion à l’API."
        }
        onRetry={() => void pieceQuery.refetch()}
      />
    );
  const piece = pieceQuery.data?.piece;
  if (!piece)
    return (
      <EmptyState
        title="Pièce introuvable"
        description="Cette pièce n’existe plus ou vous n’avez pas accès à cette référence."
      />
    );
  const progress = piece.quantity ? Math.round((piece.completedUnits / piece.quantity) * 100) : 0;
  const history = historyQuery.data?.events ?? [];
  const refresh = async (): Promise<void> => {
    await pieceQuery.refetch();
    if (canViewHistory) await historyQuery.refetch();
  };
  const copyReference = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(piece.reference);
      toast.success("Référence copiée");
    } catch {
      toast.error("Impossible de copier la référence.");
    }
  };

  const piecesHref = offerId ? `/offers/${offerId}/pieces` : "/pieces";

  return (
    <div className="space-y-6">
      <ReturnLink
        href={piecesHref}
        className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 hover:text-nim-red"
      >
        <ArrowLeft className="size-4" />
        Retour aux pièces
      </ReturnLink>
      <PageHeader
        eyebrow="Traçabilité production"
        title={piece.reference}
        description={`${piece.profile} · ${piece.lengthMm.toLocaleString("fr-FR")} mm`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => void copyReference()}>
              <Copy className="size-4" />
              Copier la référence
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void refresh()}
              disabled={pieceQuery.isFetching || historyQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${pieceQuery.isFetching || historyQuery.isFetching ? "animate-spin" : ""}`}
              />
              Actualiser
            </Button>
            <StatusBadge tone={statusTones[piece.status]}>{statusLabels[piece.status]}</StatusBadge>
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Avancement</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{progress}%</p>
            <div className="mt-3">
              <ProductionProgress completed={piece.completedUnits} total={piece.quantity} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Unités</p>
            <p className="mt-2 text-2xl font-semibold text-slate-950">{piece.quantity}</p>
            <p className="mt-1 text-xs text-slate-500">{piece.completedUnits} terminée(s)</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Priorité</p>
            <div className="mt-2"><PriorityBadge priority={piece.priority} prefix /></div>
            <p className="mt-1 text-xs text-slate-500">
              {piece.unitWeightKg === null
                ? "Poids non renseigné"
                : `${piece.unitWeightKg} kg / unité`}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Échéance</p>
            <p className="mt-2 flex items-center gap-2 text-sm font-semibold text-slate-950">
              <CalendarDays className="size-4 text-slate-400" />
              {date(piece.dueDate)}
            </p>
            <p className="mt-1 text-xs text-slate-500">Créée {date(piece.createdAt)}</p>
          </CardContent>
        </Card>
      </div>
      <PieceImageGallery piece={piece} canManage={canManage} offerId={offerId} />
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Unités traçables</CardTitle>
            <p className="text-xs text-slate-500">État, affectation et contrôle de chaque unité.</p>
          </CardHeader>
          <CardContent className="p-0">
            <div className="hidden overflow-x-auto md:block">
              <Table className="nim-data-table w-full text-left text-sm">
                <caption className="sr-only">Unités traçables de {piece.reference}</caption>
                <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                  <tr>
                    <th className="px-5 py-3 font-medium">Unité</th>
                    <th className="px-5 py-3 font-medium">Statut</th>
                    <th className="px-5 py-3 font-medium">Machine / opérateur</th>
                    <th className="px-5 py-3 font-medium">Contrôle</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {piece.units.map((unit) => (
                    <tr key={unit.id}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-slate-900">#{unit.sequenceNumber}</p>
                        <p className="text-xs text-slate-400">{unit.id}</p>
                      </td>
                      <td className="px-5 py-4">
                        <UnitStatus status={unit.status} />
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700">
                          {unit.currentMachineName ??
                            unit.activeAssignment?.machineName ??
                            "Non affectée"}
                        </p>
                        <p className="text-xs text-slate-500">
                          {unit.currentOperatorName ?? "Aucun opérateur"}
                        </p>
                      </td>
                      <td className="px-5 py-4">
                        <p className="text-slate-700">{unit.qualityResult ?? "En attente"}</p>
                        <p className="text-xs text-slate-500">{date(unit.controlledAt)}</p>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            <div className="space-y-3 p-4 md:hidden">
              {piece.units.map((unit) => (
                <UnitCard key={unit.id} unit={unit} />
              ))}
            </div>
            {piece.units.length === 0 ? (
              <div className="p-5">
                <EmptyState
                  title="Aucune unité"
                  description="Cette pièce ne contient aucune unité traçable."
                />
              </div>
            ) : null}
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">Historique de la pièce</CardTitle>
            <p className="text-xs text-slate-500">
              Les événements métier associés à cette référence.
            </p>
          </CardHeader>
          <CardContent>
            {!canViewHistory ? (
              <p className="rounded-lg bg-slate-50 p-4 text-sm text-slate-500">
                L’historique détaillé est réservé aux responsables de production.
              </p>
            ) : historyQuery.isLoading ? (
              <div className="space-y-4">
                {Array.from({ length: 4 }, (_, index) => (
                  <Skeleton key={index} className="h-12 w-full" />
                ))}
              </div>
            ) : historyQuery.isError ? (
              <div className="rounded-lg bg-red-50 p-4 text-sm text-red-700" role="alert">
                {historyQuery.error instanceof ApiError
                  ? historyQuery.error.message
                  : "Historique indisponible."}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void historyQuery.refetch()}
                >
                  <RefreshCw className="size-4" />
                  Réessayer
                </Button>
              </div>
            ) : history.length === 0 ? (
              <EmptyState
                title="Aucun événement"
                description="Les actions liées à cette pièce apparaîtront ici."
              />
            ) : (
              <ol className="space-y-5">
                {history.map((event) => (
                  <li key={event.id} className="relative pl-7">
                    <span className="absolute left-0 top-1.5 flex size-4 items-center justify-center rounded-full bg-nim-red/10 text-nim-red">
                      <Clock3 className="size-3" />
                    </span>
                    <p className="text-sm font-semibold text-slate-800">{eventLabel(event)}</p>
                    <p className="mt-1 text-xs text-slate-500">
                      {date(event.createdAt)} · {event.actorName ?? "Système"}
                    </p>
                  </li>
                ))}
              </ol>
            )}
          </CardContent>
        </Card>
      </div>
      <div className="flex items-center gap-2 text-xs text-slate-400">
        <CheckCircle2 className="size-4" />
        Données affichées depuis l’API et la base de production.
      </div>
    </div>
  );
}
