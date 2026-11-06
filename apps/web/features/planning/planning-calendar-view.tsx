"use client";

import type { PiecePriority, PieceStatus } from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import { addDays, endOfMonth, format, getDay, parse, startOfMonth, startOfWeek } from "date-fns";
import { fr } from "date-fns/locale/fr";
import { CalendarDays, Filter, RefreshCw, RotateCcw } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { Calendar, dateFnsLocalizer, type EventProps } from "react-big-calendar";
import { AccessDenied } from "@/components/access/access-denied";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  ApiError,
  getPlanningPiecesRequest,
  type ManagedPieceListItem,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

type PlanningEvent = {
  id: string;
  title: string;
  start: Date;
  end: Date;
  allDay: boolean;
  resource: ManagedPieceListItem;
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek: (date: Date) => startOfWeek(date, { weekStartsOn: 1 }),
  getDay,
  locales: { fr },
});

const statusLabels: Record<PieceStatus, string> = {
  PLANNED: "Planifiée",
  ASSIGNED: "Affectée",
  IN_PROGRESS: "En fabrication",
  COMPLETED: "Terminée",
  DELAYED: "En retard",
  ARCHIVED: "Archivée",
};

const priorityLabels: Record<PiecePriority, string> = {
  HIGH: "Haute",
  NORMAL: "Normale",
  LOW: "Basse",
};

function dueDateAsLocalDay(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

function CalendarEvent({ event }: EventProps<PlanningEvent>): React.ReactNode {
  return (
    <div className="min-w-0 leading-tight">
      <p className="truncate font-semibold">{event.title}</p>
      <p className="truncate text-[11px] opacity-80">
        {event.resource.profile} · {statusLabels[event.resource.status]} ·{" "}
        {priorityLabels[event.resource.priority]}
      </p>
    </div>
  );
}

export function PlanningCalendarView(): React.ReactNode {
  const { user } = useAuth();
  const router = useRouter();
  const canRead = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const [statusFilter, setStatusFilter] = useState<PieceStatus | "ALL">("ALL");
  const [priorityFilter, setPriorityFilter] = useState<PiecePriority | "ALL">("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [visibleRange, setVisibleRange] = useState(() => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }));
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const dueDateFrom = visibleRange.start.toISOString();
  const dueDateTo = visibleRange.end.toISOString();
  const query = useQuery({
    queryKey: ["pieces", "planning", dueDateFrom, dueDateTo, debouncedSearch, statusFilter, priorityFilter],
    queryFn: () => getPlanningPiecesRequest({
      dueDateFrom,
      dueDateTo,
      search: debouncedSearch,
      priority: priorityFilter === "ALL" ? undefined : priorityFilter,
      status: statusFilter === "ALL" || statusFilter === "DELAYED" ? undefined : statusFilter,
    }),
    enabled: canRead,
    retry: false,
  });

  const pieces = query.data?.pieces ?? [];
  const scheduledPieces = useMemo(
    () =>
      pieces.filter(
        (piece) =>
          piece.dueDate &&
          (statusFilter === "ALL" || piece.status === statusFilter),
      ),
    [pieces, statusFilter],
  );
  const events: PlanningEvent[] = scheduledPieces.map((piece) => {
    const start = dueDateAsLocalDay(piece.dueDate as string);
    return {
      id: piece.id,
      title: piece.reference,
      start,
      end: addDays(start, 1),
      allDay: true,
      resource: piece,
    };
  });

  if (!canRead) return <AccessDenied />;

  if (query.isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-24 w-full rounded-xl" />
        <Skeleton className="h-[620px] w-full rounded-xl" />
      </div>
    );
  }

  if (query.isError) {
    return (
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <p className="font-semibold text-red-700">Impossible de charger le planning</p>
          <p className="mt-1 text-sm text-slate-500">
            {query.error instanceof ApiError
              ? query.error.message
              : "Vérifiez la connexion à l’API."}
          </p>
          <Button variant="outline" className="mt-4" onClick={() => void query.refetch()}>
            <RefreshCw className="size-4" />
            Réessayer
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Planification production"
        title="Calendrier des échéances"
        description="Visualisez les pièces à produire par échéance et ouvrez leur traçabilité en un clic."
        action={
          <div className="flex w-full gap-2 sm:w-auto">
            <Badge variant="outline" className="h-10 px-3">
              <CalendarDays className="size-4" />
              {events.length} échéance{events.length === 1 ? "" : "s"}
            </Badge>
            <Button
              variant="outline"
              size="icon"
              aria-label="Actualiser le planning"
              onClick={() => void query.refetch()}
              disabled={query.isFetching}
            >
              <RefreshCw className={query.isFetching ? "size-4 animate-spin" : "size-4"} />
            </Button>
          </div>
        }
      />

      <Card className="nim-sticky-table-tools">
        <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2 text-sm font-medium text-slate-600">
            <Filter className="size-4 text-slate-400" />
            Filtres
          </div>
          <Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher une pièce ou un profil" aria-label="Rechercher dans le planning" className="w-full sm:max-w-xs" />
          <Select
            value={statusFilter}
            onValueChange={(value) => setStatusFilter(value as PieceStatus | "ALL")}
          >
            <SelectTrigger
              className="w-full sm:w-[190px]"
              aria-label="Filtrer le planning par statut"
            >
              <SelectValue placeholder="Tous les statuts" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Tous les statuts</SelectItem>
              {(Object.keys(statusLabels) as PieceStatus[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {statusLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={priorityFilter}
            onValueChange={(value) => setPriorityFilter(value as PiecePriority | "ALL")}
          >
            <SelectTrigger
              className="w-full sm:w-[180px]"
              aria-label="Filtrer le planning par priorité"
            >
              <SelectValue placeholder="Toutes les priorités" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les priorités</SelectItem>
              {(Object.keys(priorityLabels) as PiecePriority[]).map((value) => (
                <SelectItem key={value} value={value}>
                  {priorityLabels[value]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {statusFilter !== "ALL" || priorityFilter !== "ALL" ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("ALL");
                setPriorityFilter("ALL");
              }}
            >
              <RotateCcw className="size-4" />
              Réinitialiser
            </Button>
          ) : null}
        </CardContent>
      </Card>

      {events.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <EmptyState
              title="Aucune échéance planifiée"
              description="Ajoutez une date d’échéance aux pièces pour les afficher dans le calendrier."
            />
          </CardContent>
        </Card>
      ) : (
        <Card>
          <CardContent className="p-3 sm:p-5">
            <div className="h-[680px] min-w-0" data-testid="planning-calendar">
              <Calendar<PlanningEvent>
                localizer={localizer}
                events={events}
                startAccessor="start"
                endAccessor="end"
                titleAccessor="title"
                popup
                views={["month", "week", "agenda"]}
                defaultView="month"
                onRangeChange={(range) => {
                  const values = Array.isArray(range) ? range : [range.start, range.end];
                  const start = values.reduce((left, right) => left < right ? left : right);
                  const end = values.reduce((left, right) => left > right ? left : right);
                  setVisibleRange({ start, end });
                }}
                messages={{
                  next: "Suivant",
                  previous: "Précédent",
                  today: "Aujourd’hui",
                  month: "Mois",
                  week: "Semaine",
                  agenda: "Agenda",
                  date: "Date",
                  time: "Heure",
                  event: "Échéance",
                  noEventsInRange: "Aucune échéance dans cette période.",
                  showMore: (total) => `+${total} de plus`,
                }}
                components={{ event: CalendarEvent }}
                eventPropGetter={(event) => ({
                  className:
                    event.resource.priority === "HIGH" ? "nim-calendar-event-high" : undefined,
                  style: {
                    backgroundColor:
                      event.resource.status === "DELAYED"
                        ? "#e10600"
                        : event.resource.priority === "HIGH"
                          ? "#b45309"
                          : "#334155",
                    borderColor: "transparent",
                  },
                })}
                onSelectEvent={(event) =>
                  router.push(`/offers/${event.resource.offerId}/pieces/${event.resource.id}`)
                }
              />
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Échéances affichées</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">{events.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Sans échéance</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {pieces.filter((piece) => !piece.dueDate).length}
            </p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-slate-500">Priorité haute</p>
            <p className="mt-1 text-2xl font-semibold text-slate-950">
              {scheduledPieces.filter((piece) => piece.priority === "HIGH").length}
            </p>
            <p className="mt-1 text-xs text-slate-500">À surveiller dans le planning</p>
          </CardContent>
        </Card>
      </div>

      <p className="text-xs text-slate-400">
        Les couleurs indiquent les pièces en retard et les priorités hautes. Les données proviennent
        de l’API de production.
      </p>
    </div>
  );
}
