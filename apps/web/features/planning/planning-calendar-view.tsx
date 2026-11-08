"use client";

import type { ManagedScheduleBar, ManagedScheduleEvent, ScheduleBoard, ScheduleEventType } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  CalendarRange,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Factory,
  FilterX,
  Plus,
  RefreshCw,
  Search,
  Users,
  Wrench,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { AccessDenied } from "@/components/access/access-denied";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { DatePicker } from "@/components/ui/date-picker";
import { TimePicker } from "@/components/ui/time-picker";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
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
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  ApiError,
  cancelScheduleEventRequest,
  createScheduleEventRequest,
  getPlanningFirstEventDateRequest,
  getScheduleBoardRequest,
  getScheduleEventRequest,
  updateScheduleEventRequest,
  type ScheduleEventWrite,
} from "@/features/auth/auth-client";
import { OfferBatchScheduleSheet } from "./offer-batch-schedule-sheet";
import { useAuth } from "@/features/auth/auth-provider";
import {
  dateKeyInTunis,
  dateTimeLocalInTunis,
  durationMinutes,
  eventStartMinutes,
  formatTunisDateKey,
  formatTunisDateTime,
  planningTimeZone,
  rangeForPlanning,
  shiftDateKey,
  tunisDateTimeLocalToUtc,
  tunisDateTimeToUtc,
  type PlanningView,
} from "./planning-time";

type PlanningCalendarViewProps = { offerId?: string; machineId?: string };
type EventStatusFilter = "ALL" | "PLANNED" | "CANCELLED";

const typeLabels: Record<ScheduleEventType, string> = {
  PRODUCTION: "Production",
  MAINTENANCE: "Maintenance",
  MACHINE_BLOCK: "Blocage machine",
};
const typeIcons = { PRODUCTION: Factory, MAINTENANCE: Wrench, MACHINE_BLOCK: CalendarDays };

function apiErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.";
}

function selectedOperators(event: ManagedScheduleEvent | undefined) {
  const active = event?.operators.filter((membership) => membership.active) ?? [];
  return {
    lead: active.find((membership) => membership.role === "LEAD")?.id ?? "",
    helpers: active.filter((membership) => membership.role === "HELPER").map((membership) => membership.id),
  };
}

function eventColor(event: ManagedScheduleEvent): string {
  if (event.status === "CANCELLED") return "border-dashed border-slate-300 bg-slate-100 text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400";
  if (event.type === "PRODUCTION") return "border-blue-300 bg-blue-50 text-blue-950 hover:bg-blue-100 dark:border-blue-900 dark:bg-blue-950/50 dark:text-blue-100 dark:hover:bg-blue-950";
  if (event.type === "MAINTENANCE") return "border-amber-300 bg-amber-50 text-amber-950 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/50 dark:text-amber-100 dark:hover:bg-amber-950";
  return "border-slate-300 bg-slate-100 text-slate-800 hover:bg-slate-200 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:hover:bg-slate-700";
}

function Timeline({
  board,
  dateKey,
  dayCount,
  events,
  onOpen,
}: {
  board: ScheduleBoard;
  dateKey: string;
  dayCount: number;
  events: ManagedScheduleEvent[];
  onOpen: (event: ManagedScheduleEvent) => void;
}): React.ReactNode {
  const width = dayCount * 1440;
  const ticks = dayCount === 1
    ? Array.from({ length: 13 }, (_, index) => ({ minute: index * 120, label: `${String(index * 2).padStart(2, "0")}:00` }))
    : Array.from({ length: 8 }, (_, index) => ({ minute: index * 1440, label: formatTunisDateKey(shiftDateKey(dateKey, index), { weekday: "short", day: "numeric", month: "short" }) }));

  return (
    <div className="hidden overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950 sm:block" data-testid="planning-resource-timeline">
      <div className="min-w-[900px]">
        <div className="grid border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900" style={{ gridTemplateColumns: `220px minmax(${width}px, 1fr)` }}>
          <div className="sticky left-0 z-10 flex items-center border-r border-slate-200 bg-slate-50 px-4 py-3 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:bg-slate-900">Machine</div>
          <div className="relative h-11" style={{ minWidth: width }}>
            {ticks.map((tick) => (
              <div key={tick.minute} className="absolute top-0 flex h-full items-center border-l border-slate-200 pl-2 text-xs text-slate-500 dark:border-slate-800" style={{ left: `${(tick.minute / width) * 100}%`, transform: tick.minute === 0 ? "translateX(0)" : tick.minute === width ? "translateX(-100%)" : "translateX(-50%)" }}>
                {tick.label}
              </div>
            ))}
          </div>
        </div>
        {board.machines.map((machine) => {
          const machineEvents = events.filter((event) => event.machine.id === machine.id);
          return (
            <div key={machine.id} className="grid border-b border-slate-100 last:border-b-0 dark:border-slate-800" style={{ gridTemplateColumns: `220px minmax(${width}px, 1fr)` }}>
              <div className="sticky left-0 z-10 flex min-h-[88px] flex-col justify-center border-r border-slate-200 bg-white px-4 dark:border-slate-800 dark:bg-slate-950">
                <span className="font-semibold text-slate-900 dark:text-slate-100">{machine.name}</span>
                <span className="text-xs text-slate-500">{machine.internalNumber} · {machine.type}</span>
                <span className={`mt-1 w-fit rounded-full px-2 py-0.5 text-[11px] font-medium ${machine.status === "ACTIVE" ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300" : machine.status === "MAINTENANCE" ? "bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300" : "bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400"}`}>
                  {machine.status === "ACTIVE" ? "Active" : machine.status === "MAINTENANCE" ? "Maintenance" : "Inactive"}
                </span>
              </div>
              <div className="relative min-h-[88px]" style={{ minWidth: width, backgroundImage: `repeating-linear-gradient(to right, transparent 0, transparent calc(100% / ${dayCount * 24} - 1px), var(--planning-grid, #e2e8f0) calc(100% / ${dayCount * 24} - 1px), var(--planning-grid, #e2e8f0) calc(100% / ${dayCount * 24}))` }}>
                {machineEvents.map((event) => {
                  const rawStart = eventStartMinutes(event.startAt, dateKey);
                  const rawEnd = rawStart + durationMinutes(event.startAt, event.endAt);
                  const left = Math.max(0, rawStart);
                  const right = Math.min(width, rawEnd);
                  const leftPercent = (left / width) * 100;
                  const eventWidth = right - left;
                  const widthPercent = (eventWidth / width) * 100;
                  const Icon = typeIcons[event.type];
                  const label = event.type === "PRODUCTION" ? event.bar?.reference ?? event.title : event.title;
                  const compact = eventWidth < 96;
                  const compactLabel = event.type === "PRODUCTION"
                    ? label.split(/[-\s]/).at(-1) ?? label.slice(0, 4)
                    : event.type === "MAINTENANCE" ? "Maint." : "Bloc.";
                  const eventTime = `${formatTunisDateTime(event.startAt, { dateStyle: undefined, timeStyle: "short" })}–${formatTunisDateTime(event.endAt, { dateStyle: undefined, timeStyle: "short" })}`;
                  return (
                    <button
                      type="button"
                      key={event.id}
                      onClick={() => onOpen(event)}
                      title={`${typeLabels[event.type]} · ${label} · ${event.machine.internalNumber} · ${eventTime}`}
                      className={`absolute top-3 z-[1] flex h-[62px] min-w-0 flex-col justify-center overflow-hidden rounded-md border text-left shadow-sm transition-colors focus-visible:z-20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red ${compact ? "items-center px-0.5 text-[10px]" : "items-stretch px-2 text-xs"} ${eventColor(event)}`}
                      style={{ left: `${leftPercent}%`, width: `${widthPercent}%` }}
                      aria-label={`${typeLabels[event.type]} ${label}, ${formatTunisDateTime(event.startAt)} – ${formatTunisDateTime(event.endAt)}`}
                    >
                      {compact
                        ? <span className="max-w-full truncate font-bold leading-none">{compactLabel}</span>
                        : <>
                          <span className="flex min-w-0 items-center gap-1 font-semibold"><Icon className="size-3.5 shrink-0" /><span className="truncate">{label}</span></span>
                          {eventWidth >= 140 ? <span className="truncate text-[11px] opacity-80">{eventTime}{event.status === "CANCELLED" ? " · Annulé" : ""}</span> : null}
                        </>}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({
  dateKey,
  dayCount,
  events,
  onOpen,
}: {
  dateKey: string;
  dayCount: number;
  events: ManagedScheduleEvent[];
  onOpen: (event: ManagedScheduleEvent) => void;
}): React.ReactNode {
  const [year, month] = dateKey.split("-").map(Number);
  const leadingDays = (new Date(Date.UTC(year!, month! - 1, 1, 12)).getUTCDay() + 6) % 7;
  const cellCount = Math.ceil((leadingDays + dayCount) / 7) * 7;
  const dates = Array.from({ length: cellCount }, (_, index) => {
    const current = shiftDateKey(dateKey, index - leadingDays);
    return { key: current, inMonth: Number(current.slice(5, 7)) === month };
  });
  const weekdayLabels = ["Lundi", "Mardi", "Mercredi", "Jeudi", "Vendredi", "Samedi", "Dimanche"];

  return (
    <div className="hidden overflow-x-auto sm:block" data-testid="planning-month-grid">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900">
          {weekdayLabels.map((label) => <div key={label} className="px-3 py-2 text-xs font-semibold text-slate-500">{label}</div>)}
        </div>
        <div className="grid grid-cols-7">
          {dates.map(({ key, inMonth }) => {
            const dayStart = tunisDateTimeToUtc(key, 0).getTime();
            const dayEnd = tunisDateTimeToUtc(shiftDateKey(key, 1), 0).getTime();
            const dayEvents = events.filter((event) => new Date(event.startAt).getTime() < dayEnd && new Date(event.endAt).getTime() > dayStart);
            return (
              <section key={key} aria-label={formatTunisDateKey(key, { weekday: "long", day: "numeric", month: "long" })} className={`min-h-36 border-b border-r border-slate-200 p-2 dark:border-slate-800 ${inMonth ? "bg-white dark:bg-slate-950" : "bg-slate-50/70 text-slate-400 dark:bg-slate-900/50"}`}>
                <p className={`mb-2 text-xs font-semibold ${inMonth ? "text-slate-700 dark:text-slate-200" : "text-slate-400"}`}>{formatTunisDateKey(key, { day: "numeric" })}</p>
                <div className="max-h-28 space-y-1 overflow-y-auto">
                  {dayEvents.map((event) => {
                    const Icon = typeIcons[event.type];
                    const label = event.type === "PRODUCTION" ? event.bar?.reference ?? event.title : event.title;
                    const startsToday = dateKeyInTunis(new Date(event.startAt)) === key;
                    const timeLabel = startsToday
                      ? formatTunisDateTime(event.startAt, { dateStyle: undefined, timeStyle: "short" })
                      : "En cours";
                    return (
                      <button type="button" key={event.id} onClick={() => onOpen(event)} className={`flex w-full min-w-0 items-start gap-1.5 rounded-md border px-1.5 py-1 text-left text-[11px] leading-tight ${eventColor(event)}`} aria-label={`${typeLabels[event.type]} ${label}, ${event.machine.internalNumber}`}>
                        <Icon className="mt-0.5 size-3 shrink-0" />
                        <span className="min-w-0"><span className="block truncate font-semibold">{timeLabel} · {label}</span><span className="block truncate opacity-75">{event.machine.internalNumber}{event.bar ? ` · ${event.bar.offer.reference}` : ""}</span></span>
                      </button>
                    );
                  })}
                  {inMonth && dayEvents.length === 0 ? <span className="text-[11px] text-slate-400">Aucun créneau</span> : null}
                </div>
              </section>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function EventFormSheet({
  open,
  onOpenChange,
  board,
  anchorDate,
  initialBarId,
  event,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  board: ScheduleBoard;
  anchorDate: string;
  initialBarId: string | null;
  event: ManagedScheduleEvent | null;
  saving: boolean;
  error: string | null;
  onSave: (input: ScheduleEventWrite | { updateId: string; patch: Parameters<typeof updateScheduleEventRequest>[1] }) => Promise<void>;
}): React.ReactNode {
  const [type, setType] = useState<ScheduleEventType>(event?.type ?? (initialBarId ? "PRODUCTION" : "MACHINE_BLOCK"));
  const [title, setTitle] = useState(event?.title ?? "");
  const [notes, setNotes] = useState(event?.notes ?? "");
  const [machineId, setMachineId] = useState(event?.machine.id ?? "");
  const [barId, setBarId] = useState(event?.bar?.id ?? initialBarId ?? "");
  const [startLocal, setStartLocal] = useState(() => event ? dateTimeLocalInTunis(event.startAt) : `${anchorDate}T08:00`);
  const [endLocal, setEndLocal] = useState(() => event ? dateTimeLocalInTunis(event.endAt) : `${anchorDate}T09:00`);
  const initialTeam = selectedOperators(event ?? undefined);
  const [leadOperatorId, setLeadOperatorId] = useState(initialTeam.lead);
  const [helperOperatorIds, setHelperOperatorIds] = useState<string[]>(initialTeam.helpers);

  useEffect(() => {
    if (!open) return;
    const team = selectedOperators(event ?? undefined);
    setType(event?.type ?? (initialBarId ? "PRODUCTION" : "MACHINE_BLOCK"));
    setTitle(event?.title ?? "");
    setNotes(event?.notes ?? "");
    setMachineId(event?.machine.id ?? "");
    setBarId(event?.bar?.id ?? initialBarId ?? "");
    setStartLocal(event ? dateTimeLocalInTunis(event.startAt) : `${anchorDate}T08:00`);
    setEndLocal(event ? dateTimeLocalInTunis(event.endAt) : `${anchorDate}T09:00`);
    setLeadOperatorId(team.lead);
    setHelperOperatorIds(team.helpers);
  }, [open, event, initialBarId, anchorDate]);

  const chosenBar = board.unscheduledBars.find((bar) => bar.id === barId) ?? null;
  const effectiveMachineId = chosenBar?.machine.id ?? machineId;
  const isEdit = event !== null;

  const toggleHelper = (operatorId: string) => {
    setHelperOperatorIds((current) => current.includes(operatorId)
      ? current.filter((id) => id !== operatorId)
      : [...current, operatorId]);
  };

  const submit = async (formEvent: React.FormEvent<HTMLFormElement>) => {
    formEvent.preventDefault();
    if (!effectiveMachineId) {
      toast.error("Choisissez une machine.");
      return;
    }
    try {
      const startAt = tunisDateTimeLocalToUtc(startLocal).toISOString();
      const endAt = tunisDateTimeLocalToUtc(endLocal).toISOString();
      if (new Date(endAt) <= new Date(startAt)) {
        toast.error("L’heure de fin doit être après l’heure de début.");
        return;
      }
      if (type === "PRODUCTION" && !isEdit && !barId) {
        toast.error("Sélectionnez une barre affectée à cette machine.");
        return;
      }
      if (type === "PRODUCTION" && !leadOperatorId) {
        toast.error("Choisissez l’opérateur responsable.");
        return;
      }
      if (isEdit && event) {
        await onSave({
          updateId: event.id,
          patch: {
            title,
            notes,
            startAt,
            endAt,
            ...(type === "PRODUCTION" ? { leadOperatorId, helperOperatorIds } : {}),
          },
        });
      } else {
        await onSave({
          type,
          title,
          notes,
          startAt,
          endAt,
          machineId: effectiveMachineId,
          ...(type === "PRODUCTION" ? { cuttingBarId: barId, leadOperatorId, helperOperatorIds } : {}),
        });
      }
    } catch {
      // The mutation error is rendered in the fixed form header area below.
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-dvh max-h-dvh flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" aria-describedby="schedule-sheet-description">
        <SheetHeader className="shrink-0 border-b border-slate-200 px-6 py-5 pr-14 text-left dark:border-slate-800">
          <SheetTitle>{isEdit ? "Modifier la planification" : "Planifier un événement"}</SheetTitle>
          <SheetDescription id="schedule-sheet-description">Le planning réserve un créneau et une équipe. Il ne modifie ni l’affectation machine ni l’état de production.</SheetDescription>
          {error ? <p className="mt-2 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200" role="alert">{error}</p> : null}
        </SheetHeader>
        <form onSubmit={(event) => void submit(event)} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            {!isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="schedule-type">Type d’événement</Label>
                <Select value={type} onValueChange={(value) => {
                  const next = value as ScheduleEventType;
                  setType(next);
                  if (next !== "PRODUCTION") { setBarId(""); setLeadOperatorId(""); setHelperOperatorIds([]); }
                }}>
                  <SelectTrigger id="schedule-type" aria-label="Type d’événement"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="PRODUCTION">Production d’une barre</SelectItem>
                    <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                    <SelectItem value="MACHINE_BLOCK">Blocage machine</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900">
                <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Événement</p>
                <p className="mt-1 font-semibold">{typeLabels[event!.type]}{event!.bar ? ` · ${event!.bar.reference}` : ""}</p>
              </div>
            )}

            {type !== "PRODUCTION" || isEdit ? (
              <div className="space-y-2">
                <Label htmlFor="schedule-title">Motif / titre</Label>
                <Input id="schedule-title" value={title} onChange={(event) => setTitle(event.target.value)} maxLength={120} required={type !== "PRODUCTION"} placeholder={type === "MAINTENANCE" ? "Ex. Entretien préventif" : "Ex. Machine indisponible"} />
              </div>
            ) : null}

            {!isEdit && type === "PRODUCTION" && !initialBarId ? (
              <div className="space-y-2">
                <Label htmlFor="schedule-bar">Barre affectée</Label>
                <Select value={barId || "NONE"} onValueChange={(value) => {
                  const nextBar = value === "NONE" ? null : board.unscheduledBars.find((bar) => bar.id === value);
                  setBarId(nextBar?.id ?? "");
                  if (nextBar) setMachineId(nextBar.machine.id);
                }}>
                  <SelectTrigger id="schedule-bar" aria-label="Barre à planifier"><SelectValue placeholder="Choisir une barre" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Choisir une barre…</SelectItem>
                    {board.unscheduledBars.map((bar) => <SelectItem key={bar.id} value={bar.id}>{bar.offer.reference} · {bar.reference} · {bar.profile} · {bar.machine.internalNumber}</SelectItem>)}
                  </SelectContent>
                </Select>
                {chosenBar ? <p className="text-xs text-slate-500">Machine déjà affectée : {chosenBar.machine.name} ({chosenBar.machine.internalNumber}).</p> : null}
              </div>
            ) : null}

            {!isEdit && type === "PRODUCTION" && initialBarId && chosenBar ? (
              <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/30">
                <p className="text-xs font-medium uppercase tracking-wide text-blue-700 dark:text-blue-300">Affaire sélectionnée</p>
                <p className="mt-1 font-semibold">{chosenBar.offer.reference} · {chosenBar.offer.name}</p>
                <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Barre {chosenBar.reference} · {chosenBar.profile} · {chosenBar.rawLengthMm.toLocaleString("fr-FR")} mm</p>
                <p className="text-xs text-slate-600 dark:text-slate-300">Machine déjà affectée : {chosenBar.machine.internalNumber} · {chosenBar.machine.name}</p>
              </div>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="schedule-machine">Machine</Label>
              {isEdit ? (
                <Input id="schedule-machine" value={`${event!.machine.name} · ${event!.machine.internalNumber}`} readOnly aria-readonly="true" />
              ) : (
                <Select value={effectiveMachineId || "NONE"} onValueChange={setMachineId} disabled={Boolean(chosenBar)}>
                  <SelectTrigger id="schedule-machine" aria-label="Machine"><SelectValue placeholder="Choisir une machine" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="NONE">Choisir une machine…</SelectItem>
                    {board.machines.filter((machine) => machine.status !== "INACTIVE").map((machine) => (
                      <SelectItem key={machine.id} value={machine.id}>{machine.name} · {machine.internalNumber}{machine.status === "MAINTENANCE" ? " · Maintenance" : ""}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
              {type === "PRODUCTION" ? <p className="text-xs text-slate-500">La machine provient de l’affectation active de la barre et ne peut pas être changée ici.</p> : null}
            </div>

            <div className="grid grid-cols-1 gap-4">
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Début · heure de Tunis</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <DatePicker aria-label="Date de début" value={startLocal.slice(0, 10)} onChange={(date) => setStartLocal(`${date}T${startLocal.slice(11, 16)}`)} required />
                  <TimePicker aria-label="Heure de début" value={startLocal.slice(11, 16)} onChange={(time) => setStartLocal(`${startLocal.slice(0, 10)}T${time}`)} />
                </div>
              </fieldset>
              <fieldset className="space-y-2">
                <legend className="mb-2 text-sm font-medium">Fin · heure de Tunis</legend>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[minmax(0,1fr)_10rem]">
                  <DatePicker aria-label="Date de fin" value={endLocal.slice(0, 10)} onChange={(date) => setEndLocal(`${date}T${endLocal.slice(11, 16)}`)} required />
                  <TimePicker aria-label="Heure de fin" value={endLocal.slice(11, 16)} onChange={(time) => setEndLocal(`${endLocal.slice(0, 10)}T${time}`)} />
                </div>
              </fieldset>
            </div>

            {type === "PRODUCTION" ? (
              <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
                <div className="flex items-center gap-2"><Users className="size-4 text-slate-500" /><div><h3 className="text-sm font-semibold">Équipe planifiée</h3><p className="text-xs text-slate-500">Le responsable est obligatoire. L’équipe de production réelle reste gérée par la session machine.</p></div></div>
                <div className="space-y-2">
                  <Label htmlFor="schedule-lead">Opérateur responsable</Label>
                  <Select value={leadOperatorId || "NONE"} onValueChange={setLeadOperatorId}>
                    <SelectTrigger id="schedule-lead" aria-label="Opérateur responsable"><SelectValue placeholder="Choisir un opérateur" /></SelectTrigger>
                    <SelectContent><SelectItem value="NONE">Choisir un responsable…</SelectItem>{board.operators.map((operator) => <SelectItem key={operator.id} value={operator.id}>{operator.displayName}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {board.operators.length ? (
                  <fieldset className="space-y-2"><legend className="text-sm font-medium">Assistants · facultatif</legend>
                    <div className="max-h-44 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">
                      {board.operators.filter((operator) => operator.id !== leadOperatorId).map((operator) => (
                        <label key={operator.id} className="flex min-h-10 cursor-pointer items-center gap-3 rounded-md px-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900">
                          <input type="checkbox" checked={helperOperatorIds.includes(operator.id)} onChange={() => toggleHelper(operator.id)} className="size-4 accent-nim-red" />
                          {operator.displayName}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ) : <p className="text-sm text-amber-700 dark:text-amber-300">Aucun compte opérateur actif disponible.</p>}
              </section>
            ) : null}

            <div className="space-y-2"><Label htmlFor="schedule-notes">Notes · facultatif</Label><textarea id="schedule-notes" value={notes} onChange={(event) => setNotes(event.target.value)} maxLength={1500} rows={4} className="flex min-h-24 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring" placeholder="Consignes utiles pour l’équipe…" /></div>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">Stockage UTC · affichage et saisie selon le fuseau {planningTimeZone}.</p>
          </div>
          <SheetFooter className="shrink-0 border-t border-slate-200 bg-background px-6 py-4 dark:border-slate-800">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>Fermer</Button>
            <Button type="submit" disabled={saving || (type === "PRODUCTION" && board.operators.length === 0)}>
              {saving ? <RefreshCw className="animate-spin" /> : null}{isEdit ? "Enregistrer" : "Créer la planification"}
            </Button>
          </SheetFooter>
        </form>
      </SheetContent>
    </Sheet>
  );
}

export function PlanningCalendarView({ offerId, machineId }: PlanningCalendarViewProps = {}): React.ReactNode {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canRead = Boolean(user && ["ADMIN", "PRODUCTION_MANAGER"].includes(user.role));
  const [view, setView] = useState<PlanningView>("DAY");
  const [anchorDate, setAnchorDate] = useState(() => dateKeyInTunis(new Date()));
  const appliedInitialDateScope = useRef<string | null>(null);
  const manuallyChangedDateScope = useRef<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [offerFilter, setOfferFilter] = useState(offerId ?? "ALL");
  const [machineFilter, setMachineFilter] = useState(machineId ?? "ALL");
  const [operatorFilter, setOperatorFilter] = useState("ALL");
  const [statusFilter, setStatusFilter] = useState<EventStatusFilter>("PLANNED");
  const [showAllMachines, setShowAllMachines] = useState(false);
  const [unscheduledOpen, setUnscheduledOpen] = useState(true);
  const [unscheduledPage, setUnscheduledPage] = useState(1);
  const [initialBarId, setInitialBarId] = useState<string | null>(null);
  const [formEvent, setFormEvent] = useState<ManagedScheduleEvent | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [batchSheetOpen, setBatchSheetOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [editingFromDetail, setEditingFromDetail] = useState(false);
  const [cancelConfirmOpen, setCancelConfirmOpen] = useState(false);
  const range = useMemo(() => rangeForPlanning(anchorDate, view), [anchorDate, view]);
  const activeOffer = offerId ?? (offerFilter && offerFilter !== "ALL" ? offerFilter : undefined);
  const activeMachine = machineId ?? (machineFilter === "ALL" ? undefined : machineFilter);

  const initialDateScope = offerId ? `offer:${offerId}` : machineId ? `machine:${machineId}` : "global";
  const initialDateQuery = useQuery({
    queryKey: ["planning", "first-event-date", offerId ?? null, machineId ?? null],
    queryFn: () => getPlanningFirstEventDateRequest({ offerId, machineId }),
    enabled: canRead,
    staleTime: 60_000,
    retry: false,
  });
  useEffect(() => {
    if (!initialDateQuery.isSuccess || appliedInitialDateScope.current === initialDateScope) return;
    if (manuallyChangedDateScope.current !== initialDateScope && initialDateQuery.data.date) setAnchorDate(initialDateQuery.data.date);
    appliedInitialDateScope.current = initialDateScope;
  }, [initialDateQuery.data, initialDateQuery.isSuccess, initialDateScope]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setUnscheduledPage(1), [activeOffer, activeMachine, debouncedSearch]);

  const boardQuery = useQuery({
    queryKey: ["planning", "board", range.start.toISOString(), range.end.toISOString(), activeOffer, activeMachine, operatorFilter, statusFilter, debouncedSearch, unscheduledPage],
    queryFn: () => getScheduleBoardRequest({
      startAt: range.start.toISOString(),
      endAt: range.end.toISOString(),
      offerId: activeOffer,
      machineId: activeMachine,
      operatorId: operatorFilter === "ALL" ? undefined : operatorFilter,
      status: statusFilter,
      search: debouncedSearch,
      unscheduledPage,
      pageSize: 20,
    }),
    enabled: canRead,
    refetchInterval: 30_000,
    retry: false,
  });
  const board = boardQuery.data;
  const activeOfferRecord = board?.offers.find((offer) => offer.id === activeOffer)
    ?? board?.unscheduledBars.find((bar) => bar.offer.id === activeOffer)?.offer;
  const groupedUnscheduledBars = useMemo(() => {
    const affairs = new Map<string, {
      offer: ManagedScheduleBar["offer"];
      machines: Map<string, {
        machine: ManagedScheduleBar["machine"];
        profiles: Map<string, ManagedScheduleBar[]>;
      }>;
    }>();
    for (const bar of board?.unscheduledBars ?? []) {
      let affairGroup = affairs.get(bar.offer.id);
      if (!affairGroup) {
        affairGroup = { offer: bar.offer, machines: new Map() };
        affairs.set(bar.offer.id, affairGroup);
      }
      let machineGroup = affairGroup.machines.get(bar.machine.id);
      if (!machineGroup) {
        machineGroup = { machine: bar.machine, profiles: new Map() };
        affairGroup.machines.set(bar.machine.id, machineGroup);
      }
      const profileBars = machineGroup.profiles.get(bar.profile) ?? [];
      profileBars.push(bar);
      machineGroup.profiles.set(bar.profile, profileBars);
    }
    return Array.from(affairs.values())
      .map(({ offer, machines }) => ({
        offer,
        machines: Array.from(machines.values())
          .map(({ machine, profiles }) => ({
            machine,
            profiles: Array.from(profiles, ([profile, bars]) => ({ profile, bars })),
          }))
          .sort((left, right) => left.machine.internalNumber.localeCompare(right.machine.internalNumber)),
      }))
      .sort((left, right) => left.offer.reference.localeCompare(right.offer.reference));
  }, [board?.unscheduledBars]);
  const detailQuery = useQuery({
    queryKey: ["planning", "event", detailId],
    queryFn: () => getScheduleEventRequest(detailId!),
    enabled: Boolean(detailId && canRead),
    retry: false,
  });
  const createMutation = useMutation({
    mutationFn: createScheduleEventRequest,
    onSuccess: (result) => {
      toast.success("Planification créée.");
      setFormOpen(false);
      setInitialBarId(null);
      setFormEvent(null);
      setDetailId(result.event.id);
      void queryClient.invalidateQueries({ queryKey: ["planning"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });
  const updateMutation = useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Parameters<typeof updateScheduleEventRequest>[1] }) => updateScheduleEventRequest(id, patch),
    onSuccess: (result) => {
      toast.success("Planification mise à jour.");
      setFormOpen(false);
      setEditingFromDetail(false);
      setDetailId(result.event.id);
      void queryClient.invalidateQueries({ queryKey: ["planning"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });
  const cancelMutation = useMutation({
    mutationFn: cancelScheduleEventRequest,
    onSuccess: (result) => {
      toast.success("Événement annulé. Son historique est conservé.");
      setCancelConfirmOpen(false);
      setDetailId(result.event.id);
      void queryClient.invalidateQueries({ queryKey: ["planning"] });
    },
    onError: (error) => toast.error(apiErrorMessage(error)),
  });

  const setManualAnchorDate = (date: string) => {
    manuallyChangedDateScope.current = initialDateScope;
    setAnchorDate(date);
  };
  const goToToday = () => setManualAnchorDate(dateKeyInTunis(new Date()));
  const move = (direction: -1 | 1) => {
    manuallyChangedDateScope.current = initialDateScope;
    setAnchorDate((current) => {
    if (view === "DAY") return shiftDateKey(current, direction);
    if (view === "WEEK") return shiftDateKey(current, direction * 7);
    const [year, month] = current.split("-").map(Number);
    return `${new Date(Date.UTC(year!, month! - 1 + direction, 1, 12)).getUTCFullYear()}-${String(new Date(Date.UTC(year!, month! - 1 + direction, 1, 12)).getUTCMonth() + 1).padStart(2, "0")}-01`;
    });
  };
  const openCreate = (barId: string | null = null) => {
    setDetailId(null);
    setFormEvent(null);
    setInitialBarId(barId);
    setFormOpen(true);
  };
  const openDetail = (event: ManagedScheduleEvent) => {
    setFormOpen(false);
    setDetailId(event.id);
    setEditingFromDetail(false);
  };
  const submitEvent = async (input: ScheduleEventWrite | { updateId: string; patch: Parameters<typeof updateScheduleEventRequest>[1] }) => {
    if ("updateId" in input) await updateMutation.mutateAsync({ id: input.updateId, patch: input.patch });
    else await createMutation.mutateAsync(input);
  };
  const visibleEvents = board?.events ?? [];
  const scheduledMachineIds = useMemo(() => new Set(visibleEvents.map((event) => event.machine.id)), [visibleEvents]);
  const timelineMachines = showAllMachines
    ? board?.machines ?? []
    : (board?.machines ?? []).filter((machine) => scheduledMachineIds.has(machine.id));
  const detailEvent = detailQuery.data?.event;
  const activeProduction = detailEvent?.type === "PRODUCTION" && detailEvent.status === "PLANNED" && detailEvent.bar?.status === "AFFECTEE";
  const pageTitle = offerId ? "Planning de l’affaire" : machineId ? "Planning machine" : "Ordonnancement par Affaire";
  const pageDescription = offerId
    ? "Planifiez les barres de cette affaire sur leur machine déjà affectée."
    : machineId
      ? "Choisissez une Affaire pour planifier les barres déjà affectées à cette machine."
      : "Choisissez une Affaire, puis planifiez ses barres par machine et par profil.";

  if (!canRead) return <AccessDenied />;

  if (boardQuery.isLoading && !board) {
    return <div className="space-y-5"><Skeleton className="h-24 w-full rounded-xl" /><Skeleton className="h-16 w-full rounded-xl" /><Skeleton className="h-[540px] w-full rounded-xl" /></div>;
  }

  if (boardQuery.isError && !board) {
    return <Card><CardContent className="flex min-h-72 flex-col items-center justify-center p-8 text-center"><AlertTriangle className="size-8 text-red-600" /><p className="mt-3 font-semibold">Impossible de charger le planning</p><p className="mt-1 max-w-md text-sm text-muted-foreground">{apiErrorMessage(boardQuery.error)}</p><Button className="mt-4" variant="outline" onClick={() => void boardQuery.refetch()}><RefreshCw className="size-4" />Réessayer</Button></CardContent></Card>;
  }

  if (!board) return null;

  return (
    <div className="space-y-4" data-testid="planning-calendar">
      <PageHeader
        eyebrow="Planification · atelier"
        title={pageTitle}
        description={pageDescription}
        action={<div className="flex flex-wrap items-center gap-2">{activeOffer && activeOfferRecord && !machineId ? <Button type="button" variant="outline" aria-label="Planifier l’Affaire" onClick={() => setBatchSheetOpen(true)}><CalendarRange className="size-4" /><span className="hidden sm:inline">Planifier l’Affaire</span><span className="sm:hidden">Ordonnancer</span></Button> : null}<span className="inline-flex h-10 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300"><CalendarDays className="size-4" />{visibleEvents.length} événement(s)</span><Button type="button" variant="outline" onClick={() => void boardQuery.refetch()} disabled={boardQuery.isFetching}><RefreshCw className={boardQuery.isFetching ? "size-4 animate-spin" : "size-4"} />Actualiser</Button><Button type="button" onClick={() => openCreate()}><Plus className="size-4" />Nouvel événement</Button></div>}
      />

      {!offerId ? <Card className="border-slate-200 dark:border-slate-800" data-testid="planning-affair-selector">
        <CardContent className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_minmax(16rem,0.8fr)] sm:items-center">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-nim-red">Ordonnancement · Affaires</p>
            <h2 className="mt-1 font-semibold text-slate-900 dark:text-slate-100">Toutes les Affaires sont affichées</h2>
            <p className="mt-1 text-sm text-slate-500">Choisissez une Affaire pour filtrer. Les barres restent regroupées par machine et par profil, sans changer leur affectation.</p>
          </div>
          <Select
            value={offerId ?? offerFilter}
            onValueChange={(value) => {
              setOfferFilter(value);
              setMachineFilter(machineId ?? "ALL");
              setSearch("");
              setUnscheduledPage(1);
            }}
            disabled={Boolean(offerId)}
          >
            <SelectTrigger aria-label="Filtrer par Affaire"><SelectValue placeholder="Toutes les Affaires" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">Toutes les Affaires</SelectItem>
              {board.offers.map((offer) => <SelectItem key={offer.id} value={offer.id}>{offer.reference} · {offer.name}</SelectItem>)}
              {offerId && !board.offers.some((offer) => offer.id === offerId) ? <SelectItem value={offerId}>Affaire sélectionnée</SelectItem> : null}
            </SelectContent>
          </Select>
        </CardContent>
      </Card> : null}

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800" data-testid="planning-affair-bars">
        <button type="button" aria-expanded={unscheduledOpen} onClick={() => setUnscheduledOpen((open) => !open)} className="flex min-h-16 w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-900">
          <span className="flex min-w-0 items-center gap-2"><ChevronDown className={`size-4 transition-transform ${unscheduledOpen ? "" : "-rotate-90"}`} /><span className="min-w-0"><span className="block font-semibold">{activeOffer ? "Barres de l’Affaire à planifier" : "Barres à planifier · toutes les Affaires"}</span><span className="mt-0.5 block text-xs font-normal text-slate-500">Affectées, sans créneau · regroupées par Affaire, machine et profil</span></span></span>
          <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">{board.unscheduledPagination.total}</span>
        </button>
        {unscheduledOpen ? (
          <div className="border-t border-slate-200 dark:border-slate-800">
            {board.unscheduledPagination.total === 0 ? <div className="p-4"><EmptyState title={activeOffer ? "Aucune barre à planifier pour cette Affaire" : "Aucune barre à planifier"} description="Les barres apparaîtront ici après leur affectation à une machine. Les créneaux déjà planifiés restent visibles dans le calendrier ci-dessous." /></div>
                : board.unscheduledBars.length === 0 ? <div className="p-4"><EmptyState title="Aucune barre ne correspond aux filtres" description="Modifiez la recherche ou les filtres machine et actualisez la liste." /></div>
                  : <div className="divide-y divide-slate-200 dark:divide-slate-800">
                    {groupedUnscheduledBars.map((affairGroup) => (
                      <section key={affairGroup.offer.id} aria-label={`Affaire ${affairGroup.offer.reference}`}>
                        <div className="flex items-center justify-between gap-3 bg-slate-100 px-4 py-3 dark:bg-slate-800">
                          <div className="min-w-0"><h3 className="truncate text-sm font-semibold">{affairGroup.offer.reference} · {affairGroup.offer.name}</h3><p className="text-xs text-slate-500">Affaire</p></div>
                          <span className="shrink-0 text-xs text-slate-500">{affairGroup.machines.reduce((count, machine) => count + machine.profiles.reduce((profileCount, profile) => profileCount + profile.bars.length, 0), 0)} barre(s)</span>
                        </div>
                        {affairGroup.machines.map((machineGroup) => (
                          <div key={`${affairGroup.offer.id}-${machineGroup.machine.id}`} className="border-t border-slate-200 dark:border-slate-800">
                            <div className="flex items-center justify-between gap-3 bg-slate-50 px-4 py-2.5 dark:bg-slate-900">
                              <div className="min-w-0"><h4 className="truncate text-sm font-semibold">{machineGroup.machine.internalNumber} · {machineGroup.machine.name}</h4><p className="text-xs text-slate-500">Machine affectée · inchangée par le Planning</p></div>
                              <span className="shrink-0 text-xs text-slate-500">{machineGroup.profiles.reduce((count, profile) => count + profile.bars.length, 0)} barre(s)</span>
                            </div>
                        {machineGroup.profiles.map(({ profile, bars }) => (
                          <div key={`${machineGroup.machine.id}-${profile}`} className="border-t border-slate-100 dark:border-slate-800">
                            <div className="flex items-center gap-2 px-4 pb-1 pt-3"><span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Profil</span><span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold dark:bg-slate-800">{profile}</span><span className="text-xs text-slate-500">{bars.length}</span></div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                              {bars.map((bar) => <div key={bar.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center"><div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold">{bar.reference}</p><p className="text-xs text-slate-500">{bar.rawLengthMm.toLocaleString("fr-FR")} mm · {bar.offer.reference}</p></div><Button type="button" variant="outline" size="sm" onClick={() => openCreate(bar.id)}><CalendarDays className="size-4" />Choisir le créneau</Button></div>)}
                            </div>
                          </div>
                        ))}
                          </div>
                        ))}
                      </section>
                    ))}
                  </div>}
            {board.unscheduledPagination.totalPages > 1 ? <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-4 py-3 dark:border-slate-800"><p className="text-xs text-slate-500">{(unscheduledPage - 1) * board.unscheduledPagination.pageSize + 1}–{Math.min(unscheduledPage * board.unscheduledPagination.pageSize, board.unscheduledPagination.total)} sur {board.unscheduledPagination.total} barres</p><div className="flex gap-2"><Button variant="outline" size="sm" disabled={unscheduledPage <= 1} onClick={() => setUnscheduledPage((page) => page - 1)}><ArrowLeft className="size-4" />Précédent</Button><Button variant="outline" size="sm" disabled={unscheduledPage >= board.unscheduledPagination.totalPages} onClick={() => setUnscheduledPage((page) => page + 1)}>Suivant<ArrowRight className="size-4" /></Button></div></div> : null}
          </div>
        ) : null}
      </Card>

      <Card className="border-slate-200 dark:border-slate-800">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
          <div className="grid min-w-0 flex-1 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 sm:flex">
            <Button className="w-full sm:w-auto" variant="outline" onClick={goToToday}>Aujourd’hui</Button>
            <Button variant="outline" size="icon" aria-label="Période précédente" onClick={() => move(-1)}><ChevronLeft /></Button>
            <Button variant="outline" size="icon" aria-label="Période suivante" onClick={() => move(1)}><ChevronRight /></Button>
            <DatePicker containerClassName="col-span-3 sm:col-auto sm:w-[10.5rem]" aria-label="Aller à une date dans le planning" value={anchorDate} onChange={setManualAnchorDate} className="h-10 w-full pl-3 text-sm" />
            <p className="col-span-3 min-w-0 truncate pl-1 text-sm font-semibold text-slate-800 dark:text-slate-100 sm:flex-1">
              {view === "DAY" ? formatTunisDateKey(anchorDate, { weekday: "long", day: "numeric", month: "long", year: "numeric" }) : view === "MONTH" ? formatTunisDateKey(range.startDateKey, { month: "long", year: "numeric" }) : `${formatTunisDateKey(range.startDateKey, { day: "numeric", month: "short" })} – ${formatTunisDateKey(shiftDateKey(range.startDateKey, 6), { day: "numeric", month: "short", year: "numeric" })}`}
            </p>
          </div>
          <div className="flex rounded-md border border-slate-200 p-1 dark:border-slate-800" aria-label="Affichage du planning">
            {(["DAY", "WEEK", "MONTH"] as const).map((nextView) => <Button key={nextView} type="button" size="sm" variant={view === nextView ? "secondary" : "ghost"} aria-pressed={view === nextView} onClick={() => setView(nextView)}>{nextView === "DAY" ? "Jour" : nextView === "WEEK" ? "Semaine" : "Mois"}</Button>)}
          </div>
        </CardContent>
        <div className="grid gap-2 border-t border-slate-200 p-3 dark:border-slate-800 sm:grid-cols-2 xl:grid-cols-4 sm:p-4">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Rechercher barre, Affaire…" aria-label="Rechercher dans le planning" className="pl-9" /></div>
          <Select value={machineId ?? machineFilter} onValueChange={setMachineFilter} disabled={Boolean(machineId)}><SelectTrigger aria-label="Filtrer par machine"><SelectValue placeholder="Toutes les machines" /></SelectTrigger><SelectContent><SelectItem value="ALL">Toutes les machines</SelectItem>{board.machines.map((machine) => <SelectItem key={machine.id} value={machine.id}>{machine.internalNumber} · {machine.name}</SelectItem>)}</SelectContent></Select>
          <Select value={operatorFilter} onValueChange={setOperatorFilter}><SelectTrigger aria-label="Filtrer par opérateur"><SelectValue placeholder="Tous les opérateurs" /></SelectTrigger><SelectContent><SelectItem value="ALL">Tous les opérateurs</SelectItem>{board.operators.map((operator) => <SelectItem key={operator.id} value={operator.id}>{operator.displayName}</SelectItem>)}</SelectContent></Select>
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as EventStatusFilter)}><SelectTrigger aria-label="Filtrer par statut de planification"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PLANNED">Planifiés</SelectItem><SelectItem value="CANCELLED">Annulés</SelectItem><SelectItem value="ALL">Tous les statuts</SelectItem></SelectContent></Select>
          <div className="flex justify-end sm:col-span-2 xl:col-span-4"><Button type="button" variant="ghost" size="sm" onClick={() => { setSearch(""); if (!machineId) setMachineFilter("ALL"); setOperatorFilter("ALL"); setStatusFilter("PLANNED"); }}><FilterX className="size-4" />Effacer les filtres</Button></div>
        </div>
      </Card>

      {boardQuery.isError ? <div className="flex items-center justify-between rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800 dark:border-red-900 dark:bg-red-950/30 dark:text-red-200" role="alert"><span>La dernière actualisation a échoué. Les données affichées peuvent être anciennes.</span><Button variant="outline" size="sm" onClick={() => void boardQuery.refetch()}>Réessayer</Button></div> : null}

      <Card className="overflow-hidden border-slate-200 dark:border-slate-800">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <div><h2 className="font-semibold text-slate-900 dark:text-slate-100">{view === "MONTH" ? "Calendrier mensuel" : `Machines · ${view === "DAY" ? "jour" : "semaine"}`}</h2><p className="mt-0.5 text-xs text-slate-500">Les créneaux se chevauchant sont refusés par le serveur pour chaque machine et opérateur.</p></div>
          <div className="flex items-center gap-2">
            {view !== "MONTH" && board.machines.length > 0 ? <Button type="button" size="sm" variant="outline" onClick={() => setShowAllMachines((current) => !current)}>{showAllMachines ? "Masquer les machines sans planification" : `Afficher toutes les machines (${board.machines.length})`}</Button> : null}
            {boardQuery.isFetching ? <span className="inline-flex items-center gap-2 text-xs text-slate-500"><RefreshCw className="size-3.5 animate-spin" />Actualisation</span> : null}
          </div>
        </div>
        {board.machines.length === 0 ? <div className="p-4"><EmptyState title="Aucune machine dans ce contexte" description="Aucune machine n’a de barre affectée ou de planification liée à cette Affaire pour l’instant." /></div> : (
          <>
            {view === "MONTH" ? <MonthGrid dateKey={range.startDateKey} dayCount={range.dayCount} events={visibleEvents} onOpen={openDetail} /> : timelineMachines.length ? <Timeline board={{ ...board, machines: timelineMachines }} dateKey={range.startDateKey} dayCount={range.dayCount} events={visibleEvents} onOpen={openDetail} /> : <div className="p-4"><EmptyState title="Aucune machine planifiée sur cette période" description="Seules les machines avec un créneau planifié sont affichées. Affichez toutes les machines pour consulter ou préparer un autre créneau." /></div>}
            <div className="space-y-2 p-3 sm:hidden" data-testid="planning-mobile-list">
              {visibleEvents.length ? visibleEvents.map((event) => {
                const Icon = typeIcons[event.type];
                return <button type="button" key={event.id} onClick={() => openDetail(event)} className={`flex min-h-16 w-full items-start gap-3 rounded-lg border p-3 text-left ${eventColor(event)}`}><Icon className="mt-0.5 size-4 shrink-0" /><span className="min-w-0 flex-1"><span className="block truncate font-semibold">{event.type === "PRODUCTION" ? event.bar?.reference : event.title}</span><span className="mt-1 block text-xs opacity-80">{event.machine.internalNumber} · {formatTunisDateTime(event.startAt)} – {formatTunisDateTime(event.endAt)}</span><span className="block truncate text-xs opacity-75">{event.bar?.offer.reference ?? typeLabels[event.type]}{event.operators.length ? ` · ${event.operators.map((operator) => operator.displayName).join(", ")}` : ""}</span></span></button>;
              }) : <EmptyState title="Aucun événement prévu" description="Choisissez un autre jour ou créez une planification." />}
            </div>
          </>
        )}
        <div className="border-t border-slate-200 px-4 py-2 text-xs text-slate-500 dark:border-slate-800">Heures affichées selon {planningTimeZone}. Les dates de production réelles restent consultables dans Production.</div>
      </Card>

      <EventFormSheet
        open={formOpen}
        onOpenChange={(open) => { if (!open && (createMutation.isPending || updateMutation.isPending)) return; setFormOpen(open); if (!open) { setInitialBarId(null); setFormEvent(null); setEditingFromDetail(false); } }}
        board={board}
        anchorDate={anchorDate}
        initialBarId={initialBarId}
        event={formEvent}
        saving={createMutation.isPending || updateMutation.isPending}
        error={(createMutation.error ?? updateMutation.error) ? apiErrorMessage(createMutation.error ?? updateMutation.error) : null}
        onSave={submitEvent}
      />

      {activeOfferRecord && !machineId ? <OfferBatchScheduleSheet
        open={batchSheetOpen}
        onOpenChange={setBatchSheetOpen}
        offer={activeOfferRecord}
        operators={board.operators}
        anchorDate={anchorDate}
      /> : null}

      <Sheet open={Boolean(detailId) && !editingFromDetail} onOpenChange={(open) => { if (!open) setDetailId(null); }}>
        <SheetContent side="right" className="flex h-dvh max-h-dvh flex-col gap-0 overflow-hidden p-0 sm:max-w-xl" aria-describedby="schedule-detail-description">
          {detailQuery.isLoading ? <div className="space-y-4 p-6"><Skeleton className="h-8 w-2/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-40 w-full" /></div> : detailQuery.isError ? <div className="p-6" role="alert"><h2 className="font-semibold">Détail indisponible</h2><p className="mt-2 text-sm text-muted-foreground">{apiErrorMessage(detailQuery.error)}</p><Button className="mt-4" variant="outline" onClick={() => void detailQuery.refetch()}>Réessayer</Button></div> : detailEvent ? (
            <>
              <SheetHeader className="shrink-0 border-b border-slate-200 px-6 py-5 pr-14 text-left dark:border-slate-800"><SheetTitle>{detailEvent.type === "PRODUCTION" ? detailEvent.bar?.reference : detailEvent.title}</SheetTitle><SheetDescription id="schedule-detail-description">Détail de la planification · {detailEvent.machine.internalNumber}</SheetDescription></SheetHeader>
              <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
                <div className="flex flex-wrap gap-2"><span className="rounded-full border border-slate-200 px-2.5 py-1 text-xs font-medium dark:border-slate-700">{typeLabels[detailEvent.type]}</span><span className={`rounded-full px-2.5 py-1 text-xs font-medium ${detailEvent.status === "PLANNED" ? "bg-blue-50 text-blue-700 dark:bg-blue-950/50 dark:text-blue-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{detailEvent.status === "PLANNED" ? "Planifié" : "Annulé"}</span></div>
                <dl className="grid gap-3 rounded-xl border border-slate-200 p-4 text-sm dark:border-slate-800 sm:grid-cols-2"><div><dt className="text-xs text-slate-500">Début</dt><dd className="mt-1 font-medium">{formatTunisDateTime(detailEvent.startAt)}</dd></div><div><dt className="text-xs text-slate-500">Fin</dt><dd className="mt-1 font-medium">{formatTunisDateTime(detailEvent.endAt)}</dd></div><div><dt className="text-xs text-slate-500">Machine planifiée</dt><dd className="mt-1 font-medium">{detailEvent.machine.name} · {detailEvent.machine.internalNumber}</dd></div>{detailEvent.bar ? <div><dt className="text-xs text-slate-500">Barre / Affaire</dt><dd className="mt-1 font-medium">{detailEvent.bar.reference} · {detailEvent.bar.offer.reference}</dd></div> : null}</dl>
                {detailEvent.bar ? <div className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-sm dark:border-blue-900 dark:bg-blue-950/30"><p className="font-medium">État réel de la barre : {detailEvent.bar.status}</p><p className="mt-1 text-xs text-slate-600 dark:text-slate-300">Cet état vient de la production. L’événement de planning ne le modifie pas.</p></div> : null}
                {detailEvent.operators.length ? <section><h3 className="mb-2 text-sm font-semibold">Équipe prévue</h3><ul className="space-y-2">{detailEvent.operators.map((operator, index) => <li key={`${operator.id}-${index}`} className={`flex items-center justify-between rounded-md border px-3 py-2 text-sm ${operator.active ? "border-slate-200 dark:border-slate-800" : "border-dashed border-slate-300 text-slate-500 dark:border-slate-700"}`}><span>{operator.displayName}</span><span className="text-xs">{operator.role === "LEAD" ? "Responsable" : "Assistant"}{operator.active ? "" : " · retiré de l’équipe"}</span></li>)}</ul></section> : null}
                {detailEvent.notes ? <section><h3 className="mb-1 text-sm font-semibold">Notes</h3><p className="whitespace-pre-wrap rounded-md bg-slate-50 p-3 text-sm text-slate-700 dark:bg-slate-900 dark:text-slate-300">{detailEvent.notes}</p></section> : null}
                <p className="text-xs text-slate-500">Créé par {detailEvent.createdBy.displayName} · {formatTunisDateTime(detailEvent.createdAt)}</p>
                {detailEvent.cancelledAt ? <p className="text-xs text-slate-500">Annulé par {detailEvent.cancelledBy?.displayName ?? "un utilisateur"} · {formatTunisDateTime(detailEvent.cancelledAt)}</p> : null}
              </div>
              <SheetFooter className="shrink-0 border-t border-slate-200 bg-background px-6 py-4 dark:border-slate-800">{detailEvent.status === "PLANNED" ? <><Button variant="outline" onClick={() => { setFormEvent(detailEvent); setEditingFromDetail(true); setFormOpen(true); }} disabled={detailEvent.type === "PRODUCTION" && !activeProduction}>Modifier / déplacer</Button><Button variant="destructive" onClick={() => setCancelConfirmOpen(true)} disabled={cancelMutation.isPending}>Annuler</Button></> : <span className="mr-auto text-xs text-slate-500">Événement annulé · historique conservé</span>}</SheetFooter>
              {detailEvent.type === "PRODUCTION" && detailEvent.bar?.status !== "AFFECTEE" && detailEvent.status === "PLANNED" ? <p className="border-t border-amber-200 bg-amber-50 px-6 py-3 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">La production réelle a commencé. Vous pouvez annuler ce créneau devenu obsolète; cela ne modifiera aucune donnée de fabrication.</p> : null}
            </>
          ) : null}
        </SheetContent>
      </Sheet>

      <AlertDialog open={cancelConfirmOpen} onOpenChange={setCancelConfirmOpen}>
        <AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Annuler cet événement ?</AlertDialogTitle><AlertDialogDescription>L’événement restera consultable dans l’historique du planning. Aucun état de barre, affectation, session ou fabrication ne sera supprimé.</AlertDialogDescription></AlertDialogHeader><AlertDialogFooter><AlertDialogCancel disabled={cancelMutation.isPending}>Retour</AlertDialogCancel><AlertDialogAction disabled={cancelMutation.isPending} onClick={(event) => { event.preventDefault(); if (detailId) cancelMutation.mutate(detailId); }}>Confirmer l’annulation</AlertDialogAction></AlertDialogFooter></AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
