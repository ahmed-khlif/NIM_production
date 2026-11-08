"use client";

import type { ManagedScheduleBatchBar, ScheduleBatchPreview, ScheduleOfferDay } from "@nim/types";
import { useQueryClient } from "@tanstack/react-query";
import { AlertTriangle, CalendarRange, Check, Clock3, LoaderCircle, RefreshCw, Search, Users } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DatePicker } from "@/components/ui/date-picker";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { TimePicker } from "@/components/ui/time-picker";
import {
  ApiError,
  createScheduleBatchRequest,
  getScheduleOfferDayRequest,
  previewScheduleBatchRequest,
  type ScheduleBatchPreviewWrite,
} from "@/features/auth/auth-client";
import { dateKeyInTunis, formatTunisDateTime, planningTimeZone, tunisDateTimeLocalToUtc } from "./planning-time";

type OfferChoice = { id: string; reference: string; name: string };
type OperatorChoice = { id: string; displayName: string };

type OfferBatchScheduleSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer: OfferChoice;
  operators: OperatorChoice[];
  anchorDate: string;
};

type MachineGroup = {
  machine: ManagedScheduleBatchBar["machine"];
  profiles: Array<{ profile: string; bars: ManagedScheduleBatchBar[] }>;
};

function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  return error instanceof Error ? error.message : "Une erreur est survenue. Réessayez.";
}

function formatScheduleInterval(startAt: string, endAt: string): string {
  const format = (value: string, withDate: boolean) => new Intl.DateTimeFormat("fr-FR", {
    timeZone: planningTimeZone,
    ...(withDate ? { day: "numeric", month: "short" as const } : {}),
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  return dateKeyInTunis(new Date(startAt)) === dateKeyInTunis(new Date(endAt))
    ? `${format(startAt, false)}–${format(endAt, false)}`
    : `${format(startAt, true)} → ${format(endAt, true)}`;
}

function previewKey(input: ScheduleBatchPreviewWrite, selectedIds: string[]): string {
  return JSON.stringify({
    ...input,
    cuttingBarIds: [...selectedIds].sort(),
    helperOperatorIds: [...input.helperOperatorIds].sort(),
  });
}

function barGroups(bars: ManagedScheduleBatchBar[]): MachineGroup[] {
  const machines = new Map<string, { machine: ManagedScheduleBatchBar["machine"]; profiles: Map<string, ManagedScheduleBatchBar[]> }>();
  for (const bar of bars) {
    let machine = machines.get(bar.machine.id);
    if (!machine) {
      machine = { machine: bar.machine, profiles: new Map() };
      machines.set(bar.machine.id, machine);
    }
    const items = machine.profiles.get(bar.profile) ?? [];
    items.push(bar);
    machine.profiles.set(bar.profile, items);
  }
  return Array.from(machines.values())
    .map(({ machine, profiles }) => ({
      machine,
      profiles: Array.from(profiles, ([profile, items]) => ({ profile, bars: items })),
    }))
    .sort((a, b) => a.machine.internalNumber.localeCompare(b.machine.internalNumber));
}

export function OfferBatchScheduleSheet({
  open,
  onOpenChange,
  offer,
  operators,
  anchorDate,
}: OfferBatchScheduleSheetProps): React.ReactNode {
  const queryClient = useQueryClient();
  const [startLocal, setStartLocal] = useState(`${anchorDate}T08:00`);
  const [durationText, setDurationText] = useState("60");
  const [gapText, setGapText] = useState("0");
  const [leadOperatorId, setLeadOperatorId] = useState("");
  const [helperOperatorIds, setHelperOperatorIds] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [bars, setBars] = useState<ManagedScheduleBatchBar[]>([]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [preview, setPreview] = useState<ScheduleBatchPreview | null>(null);
  const [lastPreviewKey, setLastPreviewKey] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [daySchedule, setDaySchedule] = useState<ScheduleOfferDay | null>(null);
  const [dayScheduleLoading, setDayScheduleLoading] = useState(false);
  const [dayScheduleError, setDayScheduleError] = useState<string | null>(null);
  const firstOperatorId = operators[0]?.id ?? "";

  const durationMinutes = Number(durationText);
  const gapMinutes = gapText.trim() === "" ? 0 : Number(gapText);
  const currentInput = useMemo<ScheduleBatchPreviewWrite | null>(() => {
    if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 1440) return null;
    if (!Number.isInteger(gapMinutes) || gapMinutes < 0 || gapMinutes > 240 || !leadOperatorId) return null;
    try {
      return {
        offerId: offer.id,
        startAt: tunisDateTimeLocalToUtc(startLocal).toISOString(),
        durationMinutes,
        gapMinutes,
        leadOperatorId,
        helperOperatorIds,
      };
    } catch {
      return null;
    }
  }, [durationMinutes, gapMinutes, helperOperatorIds, leadOperatorId, offer.id, startLocal]);
  const selectedKey = currentInput ? previewKey(currentInput, selectedIds) : null;
  const previewIsCurrent = Boolean(selectedKey && selectedKey === lastPreviewKey);
  const previewById = useMemo(() => new Map((preview?.bars ?? []).map((bar) => [bar.id, bar])), [preview]);
  const filteredBars = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("fr-FR");
    return query
      ? bars.filter((bar) => `${bar.reference} ${bar.profile} ${bar.machine.name} ${bar.machine.internalNumber}`.toLocaleLowerCase("fr-FR").includes(query))
      : bars;
  }, [bars, search]);
  const groupedBars = useMemo(() => barGroups(filteredBars), [filteredBars]);
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedDate = startLocal.slice(0, 10);
  const selectedConflicts = (preview?.conflicts ?? []).filter((conflict) => selectedSet.has(conflict.barId));
  const selectedUnavailable = bars.filter((bar) => selectedSet.has(bar.id) && !bar.selectable);
  const canSubmit = previewIsCurrent && !previewLoading && !saving && selectedIds.length > 0
    && selectedConflicts.length === 0 && selectedUnavailable.length === 0
    && (preview?.bars.filter((bar) => selectedSet.has(bar.id)).length ?? 0) === selectedIds.length;
  const canRefreshPreview = Boolean(currentInput && selectedIds.length > 0 && !previewLoading && !saving);
  const submitHint = saving
    ? "Enregistrement du lot en cours…"
    : previewLoading
      ? "Vérification des créneaux en cours…"
      : !currentInput
        ? "Vérifiez la durée, la pause et l’opérateur responsable."
        : selectedIds.length === 0
          ? "Sélectionnez au moins une barre pour continuer."
          : selectedUnavailable.length > 0
            ? `${selectedUnavailable.length} barre(s) sélectionnée(s) ne sont plus disponibles. Actualisez l’aperçu.`
            : previewIsCurrent && selectedConflicts.length > 0
              ? `${selectedConflicts.length} conflit(s) : décochez les barres concernées ou choisissez un autre horaire.`
              : previewIsCurrent && !canSubmit
                ? "L’aperçu ne correspond plus à toute la sélection. Recalculez les créneaux."
                : previewIsCurrent
                  ? `Aperçu vérifié pour ${selectedIds.length} barre(s). Vous pouvez confirmer.`
                  : "La configuration a changé. Vérifiez les créneaux avant de confirmer.";

  useEffect(() => {
    if (!open) return;
    const start = `${anchorDate}T08:00`;
    const firstOperator = firstOperatorId;
    setStartLocal(start);
    setDurationText("60");
    setGapText("0");
    setLeadOperatorId(firstOperator);
    setHelperOperatorIds([]);
    setSearch("");
    setBars([]);
    setSelectedIds([]);
    setPreview(null);
    setLastPreviewKey(null);
    setError(null);
    if (!firstOperator) {
      setError("Aucun compte opérateur actif n’est disponible pour constituer l’équipe planifiée.");
      return;
    }

    let cancelled = false;
    setPreviewLoading(true);
    const input: ScheduleBatchPreviewWrite = {
      offerId: offer.id,
      startAt: tunisDateTimeLocalToUtc(start).toISOString(),
      durationMinutes: 60,
      gapMinutes: 0,
      leadOperatorId: firstOperator,
      helperOperatorIds: [],
    };
    void previewScheduleBatchRequest(input)
      .then((result) => {
        if (cancelled) return;
        const available = result.bars.filter((bar) => bar.selectable);
        const ids = available.map((bar) => bar.id);
        setBars(result.bars);
        setSelectedIds(ids);
        setPreview(result);
        setLastPreviewKey(previewKey(input, ids));
        if (!result.bars.length) setError("Aucune barre affectée sans planification active n’est disponible dans cette Affaire.");
      })
      .catch((cause: unknown) => { if (!cancelled) setError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setPreviewLoading(false); });
    return () => { cancelled = true; };
  }, [anchorDate, firstOperatorId, offer.id, open]);

  useEffect(() => {
    if (!open) return;
    const date = selectedDate;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return;
    let cancelled = false;
    setDaySchedule(null);
    setDayScheduleLoading(true);
    setDayScheduleError(null);
    void getScheduleOfferDayRequest(offer.id, date)
      .then((result) => { if (!cancelled) setDaySchedule(result); })
      .catch((cause: unknown) => { if (!cancelled) setDayScheduleError(errorMessage(cause)); })
      .finally(() => { if (!cancelled) setDayScheduleLoading(false); });
    return () => { cancelled = true; };
  }, [offer.id, open, selectedDate]);

  const setBarSelected = (barId: string, checked: boolean) => {
    setSelectedIds((current) => checked
      ? current.includes(barId) ? current : [...current, barId]
      : current.filter((id) => id !== barId));
  };

  const selectGroup = (groupBars: ManagedScheduleBatchBar[], checked: boolean) => {
    const groupIds = groupBars.filter((bar) => bar.selectable).map((bar) => bar.id);
    setSelectedIds((current) => checked
      ? Array.from(new Set([...current, ...groupIds]))
      : current.filter((id) => !groupIds.includes(id)));
  };

  const refreshPreview = async () => {
    if (!currentInput) {
      setError("Vérifiez la durée, l’intervalle et l’opérateur responsable.");
      return;
    }
    if (selectedIds.length === 0) {
      setError("Sélectionnez au moins une barre à planifier.");
      return;
    }
    setPreviewLoading(true);
    setError(null);
    try {
      const result = await previewScheduleBatchRequest({ ...currentInput, cuttingBarIds: selectedIds });
      setPreview(result);
      setLastPreviewKey(previewKey(currentInput, selectedIds));
      setBars((current) => current.map((bar) => result.bars.find((item) => item.id === bar.id) ?? bar));
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setPreviewLoading(false);
    }
  };

  const submit = async () => {
    if (!currentInput || !previewIsCurrent || !canSubmit) return;
    setSaving(true);
    setError(null);
    try {
      const result = await createScheduleBatchRequest({ ...currentInput, cuttingBarIds: selectedIds });
      toast.success(`${result.events.length} barre(s) planifiée(s) pour ${offer.reference}.`);
      await queryClient.invalidateQueries({ queryKey: ["planning"] });
      onOpenChange(false);
    } catch (cause) {
      setError(errorMessage(cause));
    } finally {
      setSaving(false);
    }
  };

  const clear = () => setSelectedIds([]);

  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!saving) onOpenChange(nextOpen); }}>
      <SheetContent side="right" className="flex h-dvh max-h-dvh w-screen max-w-[100vw] flex-col gap-0 overflow-hidden p-0 sm:w-[min(94vw,48rem)] sm:max-w-3xl" aria-describedby="offer-batch-schedule-description">
        <SheetHeader className="shrink-0 border-b border-slate-200 px-5 py-4 pr-14 text-left dark:border-slate-800 sm:px-6">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-nim-red"><CalendarRange className="size-4" />Ordonnancement par Affaire</div>
          <SheetTitle className="text-xl">Planifier {offer.reference}</SheetTitle>
          <SheetDescription id="offer-batch-schedule-description">
            Préparez les créneaux des barres affectées en une fois. Chaque barre garde son événement, sa machine et son historique propres.
          </SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4 sm:px-6">
          {error ? <div role="alert" className="flex gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200"><AlertTriangle className="mt-0.5 size-4 shrink-0" /><span>{error}</span></div> : null}

          <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center gap-2"><Clock3 className="size-4 text-slate-500" /><div><h3 className="text-sm font-semibold">Départ et cadence</h3><p className="text-xs text-slate-500">La durée est une estimation saisie par vous, appliquée à chaque barre.</p></div></div>
            <div className="grid min-w-0 gap-3 sm:grid-cols-2 sm:items-end">
              <fieldset className="min-w-0 space-y-2 sm:col-span-2"><legend className="text-sm font-medium">Début · date et heure de Tunis</legend><div className="grid min-w-0 grid-cols-[minmax(0,1fr)_8rem] gap-2 sm:max-w-md"><DatePicker aria-label="Date de début du lot" value={startLocal.slice(0, 10)} onChange={(date) => setStartLocal(`${date}T${startLocal.slice(11, 16)}`)} /><TimePicker aria-label="Heure de début du lot" value={startLocal.slice(11, 16)} onChange={(time) => setStartLocal(`${startLocal.slice(0, 10)}T${time}`)} /></div></fieldset>
              <div className="min-w-0 space-y-2"><Label htmlFor="batch-duration">Durée par barre · min</Label><Input id="batch-duration" type="number" min={5} max={1440} step={5} value={durationText} onChange={(event) => setDurationText(event.target.value)} /></div>
              <div className="min-w-0 space-y-2"><Label htmlFor="batch-gap">Pause entre barres · min</Label><Input id="batch-gap" type="number" min={0} max={240} step={5} value={gapText} onChange={(event) => setGapText(event.target.value)} /></div>
            </div>
            <p className="rounded-md bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-900">Les créneaux sont générés séquentiellement, par machine, profil et repère, avec la même équipe. Aucun temps de fabrication n’est déduit automatiquement. Les heures sont enregistrées en UTC et affichées selon {planningTimeZone}.</p>
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800" aria-label="Planning existant de cette Affaire">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><h3 className="text-sm font-semibold">Déjà planifiées dans cette Affaire</h3><p className="text-xs text-slate-500">Réservations actives du {selectedDate} · heure de Tunis. Les conflits ne bloquent que les créneaux qui se chevauchent.</p></div>
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600 dark:bg-slate-900 dark:text-slate-300">{daySchedule?.events.length ?? 0} réservation(s)</span>
            </div>
            {dayScheduleError ? <p role="alert" className="text-sm text-red-700 dark:text-red-300">Impossible de charger les réservations existantes : {dayScheduleError}</p>
              : dayScheduleLoading ? <div className="flex items-center gap-2 py-3 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Chargement du planning de l’Affaire…</div>
                : !daySchedule?.events.length ? <p className="rounded-md bg-slate-50 px-3 py-3 text-sm text-slate-500 dark:bg-slate-900">Aucune barre déjà planifiée dans cette Affaire à cette date.</p>
                  : <ul className="max-h-48 divide-y divide-slate-200 overflow-y-auto rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                    {daySchedule.events.map((event) => <li key={event.id} className="grid gap-1 px-3 py-2.5 text-sm sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
                      <div className="min-w-0"><p className="truncate font-medium">{event.bar?.reference ?? event.title}<span className="ml-2 text-xs font-normal text-slate-500">{event.bar?.profile ?? "Production"}</span></p><p className="text-xs text-slate-500">{event.machine.internalNumber} · {event.machine.name}{event.operators.length ? ` · ${event.operators.map((operator) => operator.displayName).join(", ")}` : ""}</p></div>
                      <time className="text-xs tabular-nums text-slate-600 dark:text-slate-300">{formatTunisDateTime(event.startAt)} – {formatTunisDateTime(event.endAt)}</time>
                    </li>)}
                  </ul>}
          </section>

          <section className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
            <div className="flex items-center gap-2"><Users className="size-4 text-slate-500" /><div><h3 className="text-sm font-semibold">Équipe prévue</h3><p className="text-xs text-slate-500">Cette équipe est réservée sur les créneaux du lot; la session réelle reste gérée sur la machine.</p></div></div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2"><Label htmlFor="batch-lead">Opérateur responsable</Label><Select value={leadOperatorId || "NONE"} onValueChange={(id) => { setLeadOperatorId(id === "NONE" ? "" : id); setHelperOperatorIds((current) => current.filter((helperId) => helperId !== id)); }}><SelectTrigger id="batch-lead" aria-label="Responsable du lot"><SelectValue placeholder="Choisir un responsable" /></SelectTrigger><SelectContent><SelectItem value="NONE">Choisir un responsable</SelectItem>{operators.map((operator) => <SelectItem key={operator.id} value={operator.id}>{operator.displayName}</SelectItem>)}</SelectContent></Select></div>
              <fieldset className="space-y-2"><legend className="text-sm font-medium">Assistants · facultatif</legend><div className="max-h-32 space-y-1 overflow-y-auto rounded-md border border-slate-200 p-2 dark:border-slate-800">{operators.filter((operator) => operator.id !== leadOperatorId).map((operator) => <label key={operator.id} className="flex min-h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm hover:bg-slate-50 dark:hover:bg-slate-900"><input type="checkbox" className="size-4 accent-nim-red" checked={helperOperatorIds.includes(operator.id)} onChange={() => setHelperOperatorIds((current) => current.includes(operator.id) ? current.filter((id) => id !== operator.id) : [...current, operator.id])} />{operator.displayName}</label>)}</div></fieldset>
            </div>
          </section>

          <section className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800" aria-label="Barres de cette Affaire">
            <div className="space-y-3 border-b border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><h3 className="text-sm font-semibold">Barres à planifier</h3><p className="text-xs text-slate-500">{selectedIds.length} sélectionnée(s) sur {bars.length} · une case par barre</p></div><div className="flex gap-2"><Button type="button" variant="outline" size="sm" onClick={() => setSelectedIds(bars.filter((bar) => bar.selectable).map((bar) => bar.id))} disabled={!bars.some((bar) => bar.selectable)}>Tout sélectionner</Button><Button type="button" variant="ghost" size="sm" onClick={clear} disabled={!selectedIds.length}>Tout désélectionner</Button></div></div>
              <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" /><Input className="pl-9" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Filtrer par barre, profil ou machine…" aria-label="Filtrer les barres du lot" /></div>
            </div>
            {previewLoading && !bars.length ? <div className="flex items-center justify-center gap-2 p-10 text-sm text-slate-500"><LoaderCircle className="size-4 animate-spin" />Chargement et vérification des barres…</div>
              : !bars.length ? <div className="p-6 text-center text-sm text-slate-500">Aucune barre éligible à planifier dans cette Affaire.</div>
                : !filteredBars.length ? <div className="p-6 text-center text-sm text-slate-500">Aucune barre ne correspond à cette recherche.</div>
                  : <div className="max-h-[42vh] divide-y divide-slate-200 overflow-y-auto dark:divide-slate-800">
                    {groupedBars.map((machineGroup) => <section key={machineGroup.machine.id} aria-label={`Machine ${machineGroup.machine.internalNumber}`}>
                      <div className="sticky top-0 z-[1] flex flex-wrap items-center gap-x-2 gap-y-1 bg-slate-100 px-3 py-2.5 text-sm dark:bg-slate-900 sm:px-4"><span className="break-words font-semibold">{machineGroup.machine.internalNumber} · {machineGroup.machine.name}</span><span className="text-xs text-slate-500">Machine issue de l’affectation</span></div>
                      {machineGroup.profiles.map((profileGroup) => {
                        const eligible = profileGroup.bars.filter((bar) => bar.selectable);
                        const allSelected = eligible.length > 0 && eligible.every((bar) => selectedSet.has(bar.id));
                        return <div key={`${machineGroup.machine.id}-${profileGroup.profile}`}>
                          <div className="flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2 dark:border-slate-800 dark:bg-slate-950 sm:px-4"><label className="flex cursor-pointer items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-600 dark:text-slate-300"><input type="checkbox" className="size-4 accent-nim-red" checked={allSelected} disabled={!eligible.length} onChange={(event) => selectGroup(profileGroup.bars, event.target.checked)} />{profileGroup.profile}<span className="font-normal normal-case text-slate-500">· {profileGroup.bars.length} barre(s)</span></label></div>
                          {profileGroup.bars.map((bar) => {
                            const slot = previewById.get(bar.id) ?? bar;
                            const conflict = preview?.conflicts.find((item) => item.barId === bar.id);
                            const checked = selectedSet.has(bar.id);
                            return <label key={bar.id} className={`flex min-w-0 cursor-pointer items-start gap-3 px-3 py-3 text-sm sm:px-4 ${checked ? "bg-blue-50/60 dark:bg-blue-950/20" : "bg-white dark:bg-slate-950"} ${!bar.selectable ? "cursor-not-allowed opacity-60" : ""}`}>
                              <input type="checkbox" className="mt-1 size-4 shrink-0 accent-nim-red" checked={checked} disabled={!bar.selectable} onChange={(event) => setBarSelected(bar.id, event.target.checked)} />
                              <span className="min-w-0 flex-1 space-y-1.5">
                                <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                                  <span className="max-w-full break-words font-semibold">{bar.reference}</span>
                                  <span className="text-xs text-slate-500">{bar.profile} · {bar.rawLengthMm.toLocaleString("fr-FR")} mm</span>
                                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${conflict && checked ? "bg-red-100 text-red-800 dark:bg-red-950/50 dark:text-red-200" : !bar.selectable ? "bg-amber-100 text-amber-800 dark:bg-amber-950/50 dark:text-amber-200" : checked ? "bg-blue-100 text-blue-800 dark:bg-blue-950/50 dark:text-blue-200" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"}`}>{conflict && checked ? "Conflit" : !bar.selectable ? "Indisponible" : checked ? "Sélectionnée" : "Exclue"}</span>
                                </span>
                                <span className="block min-w-0 text-xs leading-5 text-slate-600 dark:text-slate-300">
                                  {slot.startAt && slot.endAt ? formatScheduleInterval(slot.startAt, slot.endAt) : bar.blockedReason ?? "Créneau calculé après sélection"}
                                </span>
                                {conflict && checked ? <span className="flex max-w-full min-w-0 flex-wrap items-baseline gap-x-1 gap-y-0.5 rounded-md border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs leading-5 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
                                  <span className="font-semibold">Conflit {conflict.resourceType === "MACHINE" ? "machine" : "opérateur"}</span>
                                  <span className="break-words">· {conflict.resourceLabel}</span>
                                  <span className="basis-full break-words text-[11px] opacity-90">Déjà réservé {conflict.conflictingBarReference ? `par la barre ${conflict.conflictingBarReference}` : `: ${conflict.eventTitle}`} · {formatScheduleInterval(conflict.conflictingEventStartAt, conflict.conflictingEventEndAt)}</span>
                                </span> : null}
                              </span>
                            </label>;
                          })}
                        </div>;
                      })}
                    </section>)}
                  </div>}
          </section>

          {selectedConflicts.length ? <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-950 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100"><p className="font-semibold">{selectedConflicts.length} barre(s) sélectionnée(s) en conflit</p><p className="mt-1 text-xs leading-5">Décochez les barres signalées ou modifiez l’heure de départ. Les détails du blocage sont affichés sous chaque barre.</p></div> : null}
          {preview?.bars.length && previewIsCurrent ? <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900 dark:border-emerald-900 dark:bg-emerald-950/30 dark:text-emerald-100"><Check className="size-4" />Aperçu vérifié · {selectedIds.length} créneau(x) · fin estimée {formatTunisDateTime(preview.bars.filter((bar) => selectedSet.has(bar.id)).at(-1)?.endAt ?? preview.bars.at(-1)!.endAt!)}</div> : null}
          {!previewIsCurrent && bars.length ? <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900 dark:border-blue-900 dark:bg-blue-950/30 dark:text-blue-100">La configuration a changé. Actualisez l’aperçu pour revérifier les conflits avant de planifier.</div> : null}
        </div>

        <SheetFooter className="shrink-0 flex-col gap-2 border-t border-slate-200 bg-background px-4 py-3 dark:border-slate-800 sm:px-6">
          <p role="status" aria-live="polite" className={`w-full break-words text-left text-xs leading-5 sm:max-h-10 sm:overflow-y-auto ${previewIsCurrent && canSubmit ? "text-emerald-700 dark:text-emerald-300" : "text-amber-700 dark:text-amber-300"}`}>{submitHint}</p>
          <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            {previewIsCurrent ? <Button type="button" variant="outline" onClick={() => void refreshPreview()} disabled={!canRefreshPreview} className="w-full sm:w-auto"><RefreshCw className={`size-4 ${previewLoading ? "animate-spin" : ""}`} />Actualiser l’aperçu</Button> : null}
            <div className="flex w-full gap-2 sm:w-auto"><Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={saving} className="flex-1 sm:flex-none">Fermer</Button><Button type="button" onClick={() => previewIsCurrent ? void submit() : void refreshPreview()} disabled={previewIsCurrent ? !canSubmit : !canRefreshPreview} className="flex-1 sm:flex-none">{saving || previewLoading ? <LoaderCircle className="size-4 animate-spin" /> : previewIsCurrent ? <CalendarRange className="size-4" /> : <Check className="size-4" />}{previewIsCurrent ? `Planifier ${selectedIds.length} barre(s)` : "Vérifier les créneaux"}</Button></div>
          </div>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
