"use client";

import type { AssignablePieceUnit, ManagedAssignment, ManagedMachine } from "@nim/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  ClipboardList,
  Filter,
  Factory,
  Loader2,
  MapPin,
  RefreshCw,
  Search,
  SquareStack,
  X,
  UserRound,
  UserRoundCheck,
} from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import {
  ApiError,
  createAssignmentRequest,
  getAssignmentsRequest,
  getMachinesRequest,
  getOfferRequest,
  reassignAssignmentRequest,
  unassignAssignmentRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

const priorityLabels = { HIGH: "Haute", NORMAL: "Normale", LOW: "Basse" } as const;
const priorityTones = { HIGH: "danger", NORMAL: "warning", LOW: "neutral" } as const;

type AssignmentForm = {
  pieceUnitId: string;
  machineId: string;
  queuePosition: string;
  reason: string;
};
type ReassignForm = { machineId: string; queuePosition: string; reason: string };

const emptyAssignmentForm: AssignmentForm = {
  pieceUnitId: "",
  machineId: "",
  queuePosition: "",
  reason: "",
};
const emptyReassignForm: ReassignForm = { machineId: "", queuePosition: "", reason: "" };

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function AssignmentDialog({
  open,
  onOpenChange,
  units,
  machines,
  form,
  setForm,
  error,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  units: AssignablePieceUnit[];
  machines: ManagedMachine[];
  form: AssignmentForm;
  setForm: (form: AssignmentForm) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}): React.ReactNode {
  useEffect(() => {
    if (open) setForm(emptyAssignmentForm);
  }, [open, setForm]);
  const availableMachines = machines.filter((machine) => machine.status === "ACTIVE");
  const setField = <K extends keyof AssignmentForm>(field: K, value: AssignmentForm[K]): void =>
    setForm({ ...form, [field]: value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Affecter une unité</DialogTitle>
          <DialogDescription>
            Choisissez une unité traçable et une machine active. L’affectation sera enregistrée dans
            l’historique.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Unité de pièce</Label>
            <Select
              value={form.pieceUnitId}
              onValueChange={(value) => setField("pieceUnitId", value)}
            >
              <SelectTrigger>
                <SelectValue
                  placeholder={units.length ? "Choisir une unité" : "Aucune unité disponible"}
                />
              </SelectTrigger>
              <SelectContent>
                {units.map((unit) => (
                  <SelectItem key={unit.id} value={unit.id}>
                    {unit.reference} · Unité {String(unit.sequenceNumber).padStart(2, "0")} ·{" "}
                    {unit.profile}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Machine active</Label>
            <Select value={form.machineId} onValueChange={(value) => setField("machineId", value)}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    availableMachines.length ? "Choisir une machine" : "Aucune machine active"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableMachines.map((machine) => (
                  <SelectItem key={machine.id} value={machine.id}>
                    {machine.name} · {machine.internalNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="assignment-position">Position de file (optionnelle)</Label>
              <Input
                id="assignment-position"
                type="number"
                min="1"
                value={form.queuePosition}
                onChange={(event) => setField("queuePosition", event.target.value)}
                placeholder="1"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="assignment-reason">Note (optionnelle)</Label>
              <Input
                id="assignment-reason"
                value={form.reason}
                onChange={(event) => setField("reason", event.target.value)}
                placeholder="Ordre prioritaire"
              />
            </div>
          </div>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={onSubmit}
            disabled={busy || !units.length || !availableMachines.length}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ClipboardList className="size-4" />
            )}
            Affecter l’unité
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReassignDialog({
  open,
  onOpenChange,
  target,
  machines,
  form,
  setForm,
  error,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: ManagedAssignment | null;
  machines: ManagedMachine[];
  form: ReassignForm;
  setForm: (form: ReassignForm) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}): React.ReactNode {
  useEffect(() => {
    if (open) setForm({ ...emptyReassignForm, machineId: "" });
  }, [open, setForm]);
  const availableMachines = machines.filter(
    (machine) => machine.status === "ACTIVE" && machine.id !== target?.machineId,
  );
  const setField = <K extends keyof ReassignForm>(field: K, value: ReassignForm[K]): void =>
    setForm({ ...form, [field]: value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Réaffecter l’unité</DialogTitle>
          <DialogDescription>
            {target
              ? `${target.reference} · Unité ${String(target.sequenceNumber).padStart(2, "0")} quittera ${target.machineName}. L’ancienne affectation restera conservée.`
              : "Choisissez une nouvelle machine."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Nouvelle machine active</Label>
            <Select value={form.machineId} onValueChange={(value) => setField("machineId", value)}>
              <SelectTrigger>
                <SelectValue
                  placeholder={
                    availableMachines.length ? "Choisir une machine" : "Aucune autre machine active"
                  }
                />
              </SelectTrigger>
              <SelectContent>
                {availableMachines.map((machine) => (
                  <SelectItem key={machine.id} value={machine.id}>
                    {machine.name} · {machine.internalNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="reassign-position">Position de file</Label>
              <Input
                id="reassign-position"
                type="number"
                min="1"
                value={form.queuePosition}
                onChange={(event) => setField("queuePosition", event.target.value)}
                placeholder="Conserver"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="reassign-reason">Motif</Label>
              <Input
                id="reassign-reason"
                value={form.reason}
                onChange={(event) => setField("reason", event.target.value)}
                placeholder="Machine indisponible"
              />
            </div>
          </div>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Annuler
          </Button>
          <Button type="button" onClick={onSubmit} disabled={busy || !availableMachines.length}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="size-4" />
            )}
            Réaffecter
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function AssignmentsView(): React.ReactNode {
  const searchParams = useSearchParams();
  const offerId = searchParams.get("offerId")?.trim() || undefined;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [assignOpen, setAssignOpen] = useState(false);
  const [reassignTarget, setReassignTarget] = useState<ManagedAssignment | null>(null);
  const [unassignTarget, setUnassignTarget] = useState<ManagedAssignment | null>(null);
  const [assignForm, setAssignForm] = useState<AssignmentForm>(emptyAssignmentForm);
  const [reassignForm, setReassignForm] = useState<ReassignForm>(emptyReassignForm);
  const [unassignReason, setUnassignReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [machineFilter, setMachineFilter] = useState("ALL");
  const assignmentsQuery = useQuery({
    queryKey: ["assignments", offerId ?? "ALL"],
    queryFn: () => getAssignmentsRequest(offerId),
    retry: false,
  });
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId ?? ""),
    enabled: Boolean(offerId),
    retry: false,
  });
  const machinesQuery = useQuery({
    queryKey: ["machines"],
    queryFn: getMachinesRequest,
    retry: false,
  });
  const machines = machinesQuery.data?.machines ?? [];

  const invalidate = async (): Promise<void> => {
    await queryClient.invalidateQueries({ queryKey: ["assignments"] });
    await queryClient.invalidateQueries({ queryKey: ["pieces"] });
    if (offerId) {
      await queryClient.invalidateQueries({ queryKey: ["offer", offerId] });
      await queryClient.invalidateQueries({ queryKey: ["offer", offerId, "production-summary"] });
    }
  };
  const createMutation = useMutation({
    mutationFn: () =>
      createAssignmentRequest({
        pieceUnitId: assignForm.pieceUnitId,
        machineId: assignForm.machineId,
        queuePosition: assignForm.queuePosition.trim()
          ? Number(assignForm.queuePosition)
          : undefined,
        reason: assignForm.reason.trim() || undefined,
      }),
    onSuccess: async () => {
      await invalidate();
      setAssignOpen(false);
      toast.success("Unité affectée");
    },
    onError: (error) =>
      setFormError(
        error instanceof ApiError ? error.message : "Impossible de créer l’affectation.",
      ),
  });
  const reassignMutation = useMutation({
    mutationFn: () =>
      reassignAssignmentRequest(reassignTarget?.id ?? "", {
        machineId: reassignForm.machineId,
        queuePosition: reassignForm.queuePosition.trim()
          ? Number(reassignForm.queuePosition)
          : undefined,
        reason: reassignForm.reason.trim(),
      }),
    onSuccess: async () => {
      await invalidate();
      setReassignTarget(null);
      toast.success("Affectation réenregistrée");
    },
    onError: (error) =>
      setFormError(error instanceof ApiError ? error.message : "Impossible de réaffecter l’unité."),
  });
  const unassignMutation = useMutation({
    mutationFn: () => unassignAssignmentRequest(unassignTarget?.id ?? "", unassignReason.trim()),
    onSuccess: async () => {
      await invalidate();
      setUnassignTarget(null);
      setUnassignReason("");
      toast.success("Affectation retirée");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de retirer l’affectation.",
      ),
  });

  const assignments = assignmentsQuery.data?.assignments ?? [];
  const availableUnits = assignmentsQuery.data?.availableUnits ?? [];
  const filteredAssignments = useMemo(() => {
    const term = search.trim().toLowerCase();
    return assignments.filter((item) => {
      const matchesSearch =
        !term ||
        `${item.reference} ${item.profile} ${item.machineName} ${item.machineStatus}`
          .toLowerCase()
          .includes(term);
      const matchesMachine = machineFilter === "ALL" || item.machineId === machineFilter;
      return matchesSearch && matchesMachine;
    });
  }, [assignments, machineFilter, search]);
  const hasFilters = Boolean(search.trim()) || machineFilter !== "ALL";
  const activeMachines = new Set(assignments.map((item) => item.machineId)).size;
  const refresh = (): void => {
    void Promise.all([assignmentsQuery.refetch(), machinesQuery.refetch()]);
  };
  const resetFilters = (): void => {
    setSearch("");
    setMachineFilter("ALL");
  };
  const openAssign = (): void => {
    setFormError(null);
    setAssignForm(emptyAssignmentForm);
    setAssignOpen(true);
  };
  const openReassign = (target: ManagedAssignment): void => {
    setFormError(null);
    setReassignForm({
      machineId: "",
      queuePosition: target.queuePosition ? String(target.queuePosition) : "",
      reason: "",
    });
    setReassignTarget(target);
  };
  const handleCreate = (): void => {
    if (!assignForm.pieceUnitId || !assignForm.machineId) {
      setFormError("Choisissez une unité et une machine.");
      return;
    }
    if (
      assignForm.queuePosition &&
      (!Number.isInteger(Number(assignForm.queuePosition)) || Number(assignForm.queuePosition) < 1)
    ) {
      setFormError("La position de file doit être un entier positif.");
      return;
    }
    setFormError(null);
    createMutation.mutate();
  };
  const handleReassign = (): void => {
    if (!reassignForm.machineId || reassignForm.reason.trim().length < 2) {
      setFormError("Choisissez une machine et indiquez un motif.");
      return;
    }
    setFormError(null);
    reassignMutation.mutate();
  };
  const handleUnassign = (): void => {
    if (unassignReason.trim().length < 2) {
      toast.error("Indiquez un motif de désaffectation.");
      return;
    }
    unassignMutation.mutate();
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Production"
        title="Affectations"
        description={
          offerId && offerQuery.data?.offer
            ? `Affectations limitées à ${offerQuery.data.offer.reference} — ${offerQuery.data.offer.name}.`
            : "Affectez chaque unité à une machine active et conservez l’historique des changements."
        }
        action={
          <div className="flex flex-wrap gap-2">
            {offerId ? (
              <Button type="button" variant="outline" asChild>
                <Link href={`/offers/${offerId}/production`}>Retour à l’offre</Link>
              </Button>
            ) : null}
            <Button
              type="button"
              variant="outline"
              onClick={refresh}
              disabled={assignmentsQuery.isFetching || machinesQuery.isFetching}
            >
              <RefreshCw
                className={`size-4 ${assignmentsQuery.isFetching || machinesQuery.isFetching ? "animate-spin" : ""}`}
              />
              Actualiser
            </Button>
            {canManage ? (
              <Button onClick={openAssign}>
                <ClipboardList className="size-4" />
                Nouvelle affectation
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-blue-50 p-2.5 text-blue-600">
              <ClipboardList className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Affectations actives</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{assignments.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
              <SquareStack className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Unités à affecter</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{availableUnits.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
              <Factory className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Machines mobilisées</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{activeMachines}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
              <UserRoundCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Machines actives</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {machines.filter((machine) => machine.status === "ACTIVE").length}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-sm">Tableau des affectations</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Les machines en maintenance ou inactives sont bloquées côté serveur.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une pièce ou machine"
              aria-label="Rechercher une affectation"
              className="pl-9 pr-9"
            />
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-slate-400"
                onClick={() => setSearch("")}
                aria-label="Effacer la recherche"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <Select value={machineFilter} onValueChange={setMachineFilter}>
              <SelectTrigger className="w-full sm:w-56" aria-label="Filtrer par machine">
                <Filter className="size-4 text-slate-400" />
                <SelectValue placeholder="Toutes les machines" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Toutes les machines</SelectItem>
                {machines.map((machine) => (
                  <SelectItem key={machine.id} value={machine.id}>
                    {machine.name} · {machine.internalNumber}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              {filteredAssignments.length} affectation(s) affichée(s) sur {assignments.length}
            </span>
            {hasFilters ? (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-slate-500"
                onClick={resetFilters}
              >
                Réinitialiser les filtres
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {assignmentsQuery.isLoading || machinesQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : assignmentsQuery.isError || machinesQuery.isError ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger les affectations
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {assignmentsQuery.error instanceof ApiError
                  ? assignmentsQuery.error.message
                  : machinesQuery.error instanceof ApiError
                    ? machinesQuery.error.message
                    : "Vérifiez la connexion à l’API."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => {
                  void assignmentsQuery.refetch();
                  void machinesQuery.refetch();
                }}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="p-5">
              <EmptyState
                title={hasFilters ? "Aucun résultat" : "Aucune affectation active"}
                description={
                  hasFilters
                    ? "Modifiez votre recherche."
                    : canManage && availableUnits.length
                      ? "Des unités sont prêtes à être affectées."
                      : "Les affectations apparaîtront ici dès qu’elles seront créées."
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Affectations actives par unité et machine</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Unité</th>
                      <th className="px-5 py-3 font-medium">Profil</th>
                      <th className="px-5 py-3 font-medium">Machine</th>
                      <th className="px-5 py-3 font-medium">Priorité</th>
                      <th className="px-5 py-3 font-medium">Affectée le</th>
                      <th className="px-5 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredAssignments.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <Link
                            href={offerId ? `/offers/${offerId}/pieces/${item.pieceId}` : "/offers"}
                            className="font-semibold text-slate-900 hover:text-nim-red"
                          >
                            {item.reference}
                          </Link>
                          <p className="text-xs text-slate-500">
                            Unité {String(item.sequenceNumber).padStart(2, "0")}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <p className="font-medium text-slate-700">{item.profile}</p>
                          <p className="text-xs text-slate-500">
                            {item.unitStatus === "ASSIGNED" ? "Prête à démarrer" : item.unitStatus}
                          </p>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-2">
                            <Factory className="size-4 text-slate-400" />
                            <div>
                              <p className="font-medium text-slate-800">{item.machineName}</p>
                              <p className="text-xs text-slate-500">
                                {item.machineStatus === "ACTIVE" ? "Active" : item.machineStatus}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge
                            variant="outline"
                            className={
                              priorityTones[item.priority] === "danger"
                                ? "border-red-200 text-red-700"
                                : priorityTones[item.priority] === "warning"
                                  ? "border-amber-200 text-amber-700"
                                  : "text-slate-500"
                            }
                          >
                            {priorityLabels[item.priority]}
                          </Badge>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {formatDate(item.assignedAt)}
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            {item.barId ? (
                              <Button variant="outline" size="sm" asChild>
                                <Link href={`/offers/${item.offerId}/bars/${item.barId}`}>
                                  Voir la barre
                                </Link>
                              </Button>
                            ) : canManage ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Réaffecter ${item.reference} unité ${item.sequenceNumber}`}
                                  onClick={() => openReassign(item)}
                                >
                                  <ArrowRightLeft className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Désaffecter ${item.reference} unité ${item.sequenceNumber}`}
                                  onClick={() => {
                                    setUnassignReason("");
                                    setUnassignTarget(item);
                                  }}
                                >
                                  <UserRound className="size-4 text-slate-500" />
                                </Button>
                              </>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {filteredAssignments.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={offerId ? `/offers/${offerId}/pieces/${item.pieceId}` : "/offers"}
                          className="truncate font-semibold text-slate-900 hover:text-nim-red"
                        >
                          {item.reference} · Unité {String(item.sequenceNumber).padStart(2, "0")}
                        </Link>
                        <p className="mt-1 truncate text-xs text-slate-500">{item.profile}</p>
                      </div>
                      <Badge variant="outline">{priorityLabels[item.priority]}</Badge>
                    </div>
                    <div className="mt-4 grid gap-2 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1.5">
                        <Factory className="size-3.5" />
                        {item.machineName}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <MapPin className="size-3.5" />
                        Affectée {formatDate(item.assignedAt)}
                      </span>
                    </div>
                    {item.barId ? (
                      <div className="mt-3 flex justify-end border-t border-slate-100 pt-3">
                        <Button variant="outline" size="sm" asChild>
                          <Link href={`/offers/${item.offerId}/bars/${item.barId}`}>
                            Voir la barre affectée
                          </Link>
                        </Button>
                      </div>
                    ) : canManage ? (
                      <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-3">
                        <Button variant="ghost" size="sm" onClick={() => openReassign(item)}>
                          <ArrowRightLeft className="size-4" />
                          Réaffecter
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => {
                            setUnassignReason("");
                            setUnassignTarget(item);
                          }}
                        >
                          <UserRound className="size-4" />
                          Retirer
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
            </>
          )}
        </CardContent>
      </Card>
      <AssignmentDialog
        open={assignOpen}
        onOpenChange={(open) => {
          setAssignOpen(open);
          if (!open) setFormError(null);
        }}
        units={availableUnits}
        machines={machines}
        form={assignForm}
        setForm={setAssignForm}
        error={formError}
        busy={createMutation.isPending}
        onSubmit={handleCreate}
      />
      <ReassignDialog
        open={Boolean(reassignTarget)}
        onOpenChange={(open) => {
          if (!open) {
            setReassignTarget(null);
            setFormError(null);
          }
        }}
        target={reassignTarget}
        machines={machines}
        form={reassignForm}
        setForm={setReassignForm}
        error={formError}
        busy={reassignMutation.isPending}
        onSubmit={handleReassign}
      />
      <Dialog
        open={Boolean(unassignTarget)}
        onOpenChange={(open) => {
          if (!open) setUnassignTarget(null);
        }}
      >
        <DialogContent className="sm:max-w-[480px]">
          <DialogHeader>
            <DialogTitle>Retirer l’affectation</DialogTitle>
            <DialogDescription>
              {unassignTarget
                ? `${unassignTarget.reference} · Unité ${String(unassignTarget.sequenceNumber).padStart(2, "0")} redeviendra disponible pour une nouvelle affectation.`
                : "Indiquez un motif."}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label htmlFor="unassign-reason">Motif obligatoire</Label>
            <Input
              id="unassign-reason"
              value={unassignReason}
              onChange={(event) => setUnassignReason(event.target.value)}
              placeholder="Correction de planification"
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setUnassignTarget(null)}
              disabled={unassignMutation.isPending}
            >
              Annuler
            </Button>
            <Button
              variant="destructive"
              onClick={handleUnassign}
              disabled={unassignMutation.isPending}
            >
              {unassignMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <UserRound className="size-4" />
              )}
              Retirer l’affectation
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
