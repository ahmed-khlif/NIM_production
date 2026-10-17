"use client";

import type { ManagedHistoryEvent } from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  Database,
  History as HistoryIcon,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";
import { useAuth } from "@/features/auth/auth-provider";
import { ApiError, getHistoryRequest, getOfferHistoryRequest } from "@/features/auth/auth-client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { KpiCard } from "@/components/ui/kpi-card";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { eventLabel } from "./event-labels";

const dateFormatter = new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" });

const entityLabels: Record<string, string> = {
  AUTH: "Authentification",
  USER: "Utilisateur",
  MACHINE: "Machine",
  PIECE: "Pièce",
  ASSIGNMENT: "Affectation",
  PRODUCTION_OPERATION: "Production",
  QUALITY_CONTROL: "Qualité",
  OFFER: "Offre",
  CUTTING_PLAN: "Plan de coupe",
};

const eventOptions = [
  "AUTH_LOGIN",
  "AUTH_LOGIN_FAILED",
  "USER_CREATED",
  "USER_DISABLED",
  "MACHINE_STATUS_CHANGED",
  "PIECE_CREATED",
  "PIECE_UPDATED",
  "ASSIGNMENT_CREATED",
  "ASSIGNMENT_REASSIGNED",
  "ASSIGNMENT_UNASSIGNED",
  "PRODUCTION_STARTED",
  "PRODUCTION_COMPLETED",
  "QUALITY_VALIDATED",
  "QUALITY_REJECTED",
];

const entityOptions = [
  "AUTH",
  "USER",
  "MACHINE",
  "PIECE",
  "ASSIGNMENT",
  "PRODUCTION_OPERATION",
  "QUALITY_CONTROL",
];

function formatDate(value: string): string {
  return dateFormatter.format(new Date(value));
}

function entityLabel(value: string): string {
  return entityLabels[value] ?? value;
}

function metadataSummary(metadata: ManagedHistoryEvent["metadata"]): string | null {
  if (!metadata) return null;
  const oldStatus = metadata.oldStatus ?? metadata.oldUnitStatus ?? metadata.oldPieceStatus;
  const newStatus = metadata.newStatus ?? metadata.newUnitStatus ?? metadata.newPieceStatus;
  if (typeof oldStatus === "string" && typeof newStatus === "string")
    return `${oldStatus} → ${newStatus}`;
  if (typeof metadata.result === "string")
    return metadata.result === "CONFORM" ? "Résultat conforme" : "Résultat non conforme";
  if (typeof metadata.internalNumber === "string") return metadata.internalNumber;
  return null;
}

function traceabilityLinks(event: ManagedHistoryEvent, offerId?: string): React.ReactNode {
  const links: Array<{ href: string; label: string }> = [];
  if (event.entityType === "PIECE") links.push({ href: offerId ? `/offers/${offerId}/pieces/${event.entityId}` : "/offers", label: "Voir la pièce" });
  if (event.entityType === "OFFER") links.push({ href: `/offers/${event.entityId}`, label: "Voir l’offre" });
  if (event.entityType === "MACHINE") links.push({ href: `/machines/${event.entityId}`, label: "Voir la machine" });
  const pieceId = event.metadata?.pieceId;
  const machineId = event.metadata?.machineId;
  if (typeof pieceId === "string") {
    const pieceHref = offerId ? `/offers/${offerId}/pieces/${pieceId}` : "/offers";
    if (!links.some((link) => link.href === pieceHref)) links.push({ href: pieceHref, label: "Pièce" });
  }
  if (typeof machineId === "string" && !links.some((link) => link.href === `/machines/${machineId}`)) links.push({ href: `/machines/${machineId}`, label: "Machine" });
  if (!links.length) return null;
  return <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">{links.map((link) => <Link key={link.href} href={link.href} className="text-xs font-medium text-nim-red underline-offset-4 hover:underline">{link.label}</Link>)}</div>;
}

function AccessDenied(): React.ReactNode {
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Traçabilité"
        title="Historique"
        description="Consultez les événements métier conservés par NIM."
      />
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <div className="rounded-full bg-red-50 p-3 text-nim-red">
            <ShieldCheck className="size-6" />
          </div>
          <h2 className="mt-4 font-semibold text-slate-900">Accès restreint</h2>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            L’historique complet est réservé aux administrateurs et responsables de production.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function EventSkeleton(): React.ReactNode {
  return (
    <div className="space-y-3 p-5">
      {Array.from({ length: 6 }, (_, index) => (
        <Skeleton key={index} className="h-14 w-full" />
      ))}
    </div>
  );
}

function HistoryEventRow({ event, offerId }: { event: ManagedHistoryEvent; offerId?: string }): React.ReactNode {
  const summary = metadataSummary(event.metadata);
  return (
    <>
      <tr className="transition-colors hover:bg-slate-50/70">
        <td className="px-5 py-4">
          <p className="font-medium text-slate-900">{eventLabel(event.eventType)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
        </td>
        <td className="px-5 py-4">
          <Badge variant="outline">{entityLabel(event.entityType)}</Badge>
          <p
            className="mt-1 max-w-48 truncate font-mono text-[11px] text-slate-400"
            title={event.entityId}
          >
            {event.entityType === "PIECE" ? <Link href={offerId ? `/offers/${offerId}/pieces/${event.entityId}` : "/offers"} className="hover:text-nim-red hover:underline">{event.entityId}</Link> : event.entityType === "MACHINE" ? <Link href={`/machines/${event.entityId}`} className="hover:text-nim-red hover:underline">{event.entityId}</Link> : event.entityId}
          </p>
        </td>
        <td className="px-5 py-4">
          <p className="text-sm text-slate-700">{event.actorName ?? "Système"}</p>
          <p className="mt-1 text-xs text-slate-400">{event.actorRole ?? "SYSTEM"}</p>
        </td>
        <td className="px-5 py-4 text-sm text-slate-500">{summary ?? "—"}{traceabilityLinks(event, offerId)}</td>
      </tr>
    </>
  );
}

function HistoryEventCard({ event, offerId }: { event: ManagedHistoryEvent; offerId?: string }): React.ReactNode {
  const summary = metadataSummary(event.metadata);
  return (
    <div className="rounded-xl border border-slate-100 p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-medium text-slate-900">{eventLabel(event.eventType)}</p>
          <p className="mt-1 text-xs text-slate-500">{formatDate(event.createdAt)}</p>
        </div>
        <Badge variant="outline">{entityLabel(event.entityType)}</Badge>
      </div>
      <div className="mt-4 grid gap-2 text-xs text-slate-500">
        <span>
          Acteur :{" "}
          <strong className="font-medium text-slate-700">{event.actorName ?? "Système"}</strong>
        </span>
        <span className="font-mono text-[11px]">ID : {event.entityId}</span>
        {traceabilityLinks(event, offerId)}
        {summary ? <StatusBadge tone="neutral">{summary}</StatusBadge> : null}
      </div>
    </div>
  );
}

export function HistoryView({ offerId }: { offerId?: string } = {}): React.ReactNode {
  const { user } = useAuth();
  const canRead = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const [eventType, setEventType] = useState("ALL");
  const [entityType, setEntityType] = useState("ALL");
  const queryInput = useMemo(
    () => ({
      page,
      pageSize: 25,
      search,
      eventType: eventType === "ALL" ? undefined : eventType,
      entityType: entityType === "ALL" ? undefined : entityType,
    }),
    [entityType, eventType, page, search],
  );
  const historyQuery = useQuery({
    queryKey: ["history", offerId ?? "ALL", queryInput],
    queryFn: () => offerId ? getOfferHistoryRequest(offerId, queryInput) : getHistoryRequest(queryInput),
    enabled: canRead,
    retry: false,
  });
  const data = historyQuery.data;
  const events = data?.events ?? [];
  const hasFilters = Boolean(search.trim()) || eventType !== "ALL" || entityType !== "ALL";

  if (!canRead) return <AccessDenied />;

  function resetFilters(): void {
    setPage(1);
    setSearch("");
    setEventType("ALL");
    setEntityType("ALL");
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={offerId ? "Offre · Traçabilité" : "Traçabilité"}
        title="Historique"
        description={offerId ? "Événements liés uniquement à cette offre, ses pièces, son façonnage et sa production." : "Suivez chaque changement métier avec son acteur, son contexte et son horodatage."}
        action={
          <Button
            variant="outline"
            className="w-full sm:w-auto"
            onClick={() => void historyQuery.refetch()}
            disabled={historyQuery.isFetching}
          >
            <RefreshCw className={`size-4 ${historyQuery.isFetching ? "animate-spin" : ""}`} />
            Actualiser
          </Button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <KpiCard
          label="Événements"
          value={String(data?.total ?? 0)}
          detail="Résultats correspondant aux filtres"
          icon={Database}
          tone="neutral"
        />
        <KpiCard
          label="Page actuelle"
          value={`${data?.page ?? page}/${data?.totalPages ?? 1}`}
          detail="Navigation paginée"
          icon={HistoryIcon}
          tone="positive"
        />
        <KpiCard
          label="Source"
          value="PostgreSQL"
          detail="Journal append-only"
          icon={Activity}
          tone="neutral"
        />
      </div>
      <Card>
        <CardHeader className="gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Journal des événements</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Les événements ne sont jamais supprimés par l’interface.
            </p>
          </div>
          <Button variant="ghost" size="sm" onClick={resetFilters} disabled={!hasFilters}>
            Réinitialiser
          </Button>
        </CardHeader>
        <CardContent className="border-t border-slate-100 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1.4fr)_minmax(170px,0.8fr)_minmax(170px,0.8fr)]">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setPage(1);
                }}
                placeholder="Rechercher un événement ou un identifiant"
                aria-label="Rechercher dans l’historique"
                className="pl-9 pr-9"
              />
              {search ? <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-7 -translate-y-1/2" aria-label="Effacer la recherche historique" onClick={() => { setSearch(""); setPage(1); }}><X className="size-4" /></Button> : null}
            </div>
            <Select
              value={eventType}
              onValueChange={(value) => {
                setEventType(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrer par événement">
                <SelectValue placeholder="Tous les événements" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les événements</SelectItem>
                {eventOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {eventLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select
              value={entityType}
              onValueChange={(value) => {
                setEntityType(value);
                setPage(1);
              }}
            >
              <SelectTrigger aria-label="Filtrer par entité">
                <SelectValue placeholder="Toutes les entités" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les entités</SelectItem>
                {entityOptions.map((value) => (
                  <SelectItem key={value} value={value}>
                    {entityLabel(value)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <p className="mt-3 text-xs font-medium text-slate-600" aria-live="polite">{events.length} evenement(s) affiche(s) sur cette page</p>
        </CardContent>
        <CardContent className="p-0">
          {historyQuery.isLoading ? (
            <EventSkeleton />
          ) : historyQuery.isError ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center" role="alert">
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger l’historique
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {historyQuery.error instanceof ApiError
                  ? historyQuery.error.message
                  : "Vérifiez la connexion à l’API."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void historyQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : events.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title="Aucun événement"
                description="Aucun événement ne correspond aux filtres sélectionnés."
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Journal des événements de traçabilité</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Événement</th>
                      <th className="px-5 py-3 font-medium">Entité</th>
                      <th className="px-5 py-3 font-medium">Acteur</th>
                      <th className="px-5 py-3 font-medium">Contexte</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {events.map((event) => (
                      <HistoryEventRow key={event.id} event={event} offerId={offerId} />
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {events.map((event) => (
                  <HistoryEventCard key={event.id} event={event} offerId={offerId} />
                ))}
              </div>
            </>
          )}
        </CardContent>
        {data && data.totalPages > 1 ? (
          <CardContent className="flex items-center justify-between border-t border-slate-100 px-4 py-3 sm:px-5">
            <p className="text-xs text-slate-500">
              Page {data.page} sur {data.totalPages} · {data.total} événements
            </p>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.max(1, current - 1))}
                disabled={page <= 1 || historyQuery.isFetching}
              >
                <ChevronLeft className="size-4" />
                Précédent
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage((current) => Math.min(data.totalPages, current + 1))}
                disabled={page >= data.totalPages || historyQuery.isFetching}
              >
                Suivant
                <ChevronRight className="size-4" />
              </Button>
            </div>
          </CardContent>
        ) : null}
      </Card>
      <p className="flex items-center gap-2 text-xs text-slate-400">
        <CalendarClock className="size-3.5" />
        Les heures sont affichées selon le fuseau du navigateur.
      </p>
    </div>
  );
}
