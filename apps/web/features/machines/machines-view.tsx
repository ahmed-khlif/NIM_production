"use client";

import type { ManagedMachine, MachineStatus } from "@nim/types";
import { createMachineSchema, updateMachineSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Factory,
  Filter,
  Loader2,
  MapPin,
  Pencil,
  RefreshCw,
  Search,
  Settings2,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import Link from "next/link";
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
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import {
  ApiError,
  createMachineRequest,
  getMachinesPageRequest,
  setMachineStatusRequest,
  updateMachineRequest,
} from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

const statusLabels: Record<MachineStatus, string> = {
  ACTIVE: "Active",
  MAINTENANCE: "Maintenance",
  INACTIVE: "Inactive",
};
const statusTones: Record<MachineStatus, "active" | "warning" | "neutral"> = {
  ACTIVE: "active",
  MAINTENANCE: "warning",
  INACTIVE: "neutral",
};

type MachineForm = {
  name: string;
  internalNumber: string;
  type: string;
  status: MachineStatus;
  description: string;
  location: string;
};

type MachineStatusFilter = MachineStatus | "ALL";
const emptyForm: MachineForm = {
  name: "",
  internalNumber: "",
  type: "",
  status: "ACTIVE",
  description: "",
  location: "",
};

function MachineDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  error,
  busy,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: ManagedMachine | null;
  form: MachineForm;
  setForm: (form: MachineForm) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}): React.ReactNode {
  useEffect(() => {
    if (!open) return;
    setForm(
      editing
        ? {
            name: editing.name,
            internalNumber: editing.internalNumber,
            type: editing.type,
            status: editing.status,
            description: editing.description ?? "",
            location: editing.location ?? "",
          }
        : emptyForm,
    );
  }, [editing, open, setForm]);
  const setField = <K extends keyof MachineForm>(field: K, value: MachineForm[K]): void =>
    setForm({ ...form, [field]: value });
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{editing ? "Modifier la machine" : "Ajouter une machine"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Mettez à jour les informations de cette machine."
              : "Enregistrez une machine pour la rendre disponible dans le suivi de production."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machine-name">Nom</Label>
              <Input
                id="machine-name"
                value={form.name}
                onChange={(event) => setField("name", event.target.value)}
                placeholder="CNC découpe principale"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-number">Numéro interne</Label>
              <Input
                id="machine-number"
                value={form.internalNumber}
                disabled={Boolean(editing)}
                onChange={(event) => setField("internalNumber", event.target.value)}
                placeholder="CNC-06"
              />
              <p className="text-xs text-slate-400">Unique et non modifiable après création.</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="machine-type">Type / spécialité</Label>
              <Input
                id="machine-type"
                value={form.type}
                onChange={(event) => setField("type", event.target.value)}
                placeholder="Découpe profils"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="machine-location">Emplacement</Label>
              <Input
                id="machine-location"
                value={form.location}
                onChange={(event) => setField("location", event.target.value)}
                placeholder="Atelier A"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Statut</Label>
            <Select
              value={form.status}
              onValueChange={(value) => setField("status", value as MachineStatus)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Active</SelectItem>
                <SelectItem value="MAINTENANCE">Maintenance</SelectItem>
                <SelectItem value="INACTIVE">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="machine-description">Description (optionnelle)</Label>
            <Input
              id="machine-description"
              value={form.description}
              onChange={(event) => setField("description", event.target.value)}
              placeholder="Informations utiles pour l’atelier"
            />
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
          <Button type="button" onClick={onSubmit} disabled={busy}>
            {busy ? (
              <Loader2 className="size-4 animate-spin" />
            ) : editing ? (
              <Pencil className="size-4" />
            ) : (
              <Factory className="size-4" />
            )}
            {editing ? "Enregistrer" : "Ajouter la machine"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function MachinesView(): React.ReactNode {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const canManage = user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER";
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedMachine | null>(null);
  const [form, setForm] = useState<MachineForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<ManagedMachine | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<MachineStatusFilter>("ALL");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const machinesQuery = useQuery({
    queryKey: ["machines", page, pageSize, debouncedSearch, statusFilter],
    queryFn: () => getMachinesPageRequest({ page, pageSize, search: debouncedSearch, status: statusFilter }),
    retry: false,
  });
  const saveMutation = useMutation({
    mutationFn: async ({
      target,
      values,
    }: {
      target: ManagedMachine | null;
      values: MachineForm;
    }) => {
      if (!target) return createMachineRequest(values);
      const updated = await updateMachineRequest(target.id, {
        name: values.name,
        type: values.type,
        description: values.description,
        location: values.location,
      });
      if (values.status !== target.status) await setMachineStatusRequest(target.id, values.status);
      return updated;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["machines"] });
      setDialogOpen(false);
      toast.success(editing ? "Machine mise à jour" : "Machine ajoutée");
    },
    onError: (error) =>
      setFormError(
        error instanceof ApiError ? error.message : "Impossible d’enregistrer la machine.",
      ),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, status }: { id: string; status: MachineStatus }) =>
      setMachineStatusRequest(id, status),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["machines"] });
      setStatusTarget(null);
      toast.success(`Machine ${statusLabels[variables.status].toLowerCase()}`);
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Impossible de modifier le statut."),
  });
  const machines = machinesQuery.data?.machines ?? [];
  const pagination = machinesQuery.data?.pagination ?? { page, pageSize, total: machines.length, totalPages: 1 };
  const pageCount = pagination.totalPages;
  const currentPage = pagination.page;
  const pagedMachines = machines;
  const hasFilters = Boolean(search.trim()) || statusFilter !== "ALL";
  const activeCount = machinesQuery.data?.statusCounts.ACTIVE ?? 0;
  const maintenanceCount = machinesQuery.data?.statusCounts.MAINTENANCE ?? 0;
  const openCreate = (): void => {
    setEditing(null);
    setFormError(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (target: ManagedMachine): void => {
    setEditing(target);
    setFormError(null);
    setForm({
      name: target.name,
      internalNumber: target.internalNumber,
      type: target.type,
      status: target.status,
      description: target.description ?? "",
      location: target.location ?? "",
    });
    setDialogOpen(true);
  };
  const handleSave = (): void => {
    const result = editing
      ? updateMachineSchema.safeParse({
          name: form.name,
          type: form.type,
          description: form.description,
          location: form.location,
        })
      : createMachineSchema.safeParse(form);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? "Vérifiez les informations saisies.");
      return;
    }
    setFormError(null);
    saveMutation.mutate({ target: editing, values: form });
  };
  useEffect(() => {
    setPage(1);
  }, [pageSize, debouncedSearch, statusFilter]);

  const resetFilters = (): void => {
    setSearch("");
    setStatusFilter("ALL");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Atelier"
        title="Machines"
        description="Suivez la disponibilité des équipements et leur état opérationnel."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void machinesQuery.refetch()}
              disabled={machinesQuery.isFetching}
            >
              <RefreshCw className={`size-4 ${machinesQuery.isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            {canManage ? (
              <Button onClick={openCreate}>
                <Factory className="size-4" />
                Ajouter une machine
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
              <Settings2 className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Machines actives</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-amber-50 p-2.5 text-amber-600">
              <Wrench className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">En maintenance</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{maintenanceCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
              <Factory className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Total équipements</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{machines.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="gap-4">
          <div>
            <CardTitle className="text-sm">Parc machines</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Une machine en maintenance ne pourra pas recevoir d’affectation dans la prochaine
              étape.
            </p>
          </div>
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Rechercher une machine"
              aria-label="Rechercher une machine"
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
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as MachineStatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-48" aria-label="Filtrer par statut machine">
                <Filter className="size-4 text-slate-400" />
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
                {Object.entries(statusLabels).map(([value, label]) => (
                  <SelectItem key={value} value={value}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 text-xs text-slate-500">
            <span>
              {pagination.total.toLocaleString("fr-FR")} machine(s) correspondent aux filtres
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
          {machinesQuery.isLoading ? (
            <div className="space-y-3 p-5">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : machinesQuery.isError ? (
            <div className="flex min-h-48 flex-col items-center justify-center p-8 text-center">
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger les machines
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {machinesQuery.error instanceof ApiError
                  ? machinesQuery.error.message
                  : "Vérifiez la connexion à l’API."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void machinesQuery.refetch()}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : pagination.total === 0 ? (
            <div className="p-5">
              <EmptyState
                title={hasFilters ? "Aucun résultat" : "Aucune machine"}
                description={
                  hasFilters
                    ? "Modifiez votre recherche."
                    : canManage
                      ? "Ajoutez la première machine de votre atelier."
                      : "Aucune machine n’est encore configurée."
                }
                illustration={
                  hasFilters ? undefined : "/assets/illustrations/machine-maintenance.png"
                }
                illustrationAlt={
                  hasFilters ? undefined : "Illustration d’une machine nécessitant une intervention"
                }
              />
            </div>
          ) : (
            <>
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-left text-sm">
                  <caption className="sr-only">Parc des machines de production</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Machine</th>
                      <th className="px-5 py-3 font-medium">Type</th>
                      <th className="px-5 py-3 font-medium">Emplacement</th>
                      <th className="px-5 py-3 font-medium">Barres associées</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      <th className="px-5 py-3 text-right font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedMachines.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div>
                            <Link
                              href={`/machines/${item.id}`}
                              className="font-medium text-slate-900 hover:text-nim-red"
                            >
                              {item.name}
                            </Link>
                            <p className="text-xs font-medium text-slate-500">
                              {item.internalNumber}
                            </p>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <Badge variant="outline">{item.type}</Badge>
                        </td>
                        <td className="px-5 py-4 text-sm text-slate-500">
                          {item.location ? (
                            <span className="inline-flex items-center gap-1.5">
                              <MapPin className="size-3.5" />
                              {item.location}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                        <td className="px-5 py-4 text-sm tabular-nums text-slate-600">
                          {item.assignedBarCount ?? 0}
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge tone={statusTones[item.status]}>
                            {statusLabels[item.status]}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            {canManage ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Modifier ${item.name}`}
                                  onClick={() => openEdit(item)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={
                                    item.status !== "ACTIVE"
                                      ? `Réactiver ${item.name}`
                                      : `Mettre ${item.name} en maintenance`
                                  }
                                  onClick={() => setStatusTarget(item)}
                                >
                                  {item.status !== "ACTIVE" ? (
                                    <Settings2 className="size-4 text-emerald-600" />
                                  ) : (
                                    <Wrench className="size-4 text-amber-600" />
                                  )}
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
                {pagedMachines.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <Link
                          href={`/machines/${item.id}`}
                          className="truncate font-medium text-slate-900 hover:text-nim-red"
                        >
                          {item.name}
                        </Link>
                        <p className="text-xs font-medium text-slate-500">{item.internalNumber}</p>
                      </div>
                      <StatusBadge tone={statusTones[item.status]}>
                        {statusLabels[item.status]}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3 text-xs text-slate-500">
                      <span>{item.type}</span>
                      <span>{item.location ?? "Sans emplacement"}</span>
                    </div>
                    <p className="mt-2 text-xs text-slate-500">
                      {item.assignedBarCount ?? 0} barre(s) associée(s)
                    </p>
                    {canManage ? (
                      <div className="mt-3 flex justify-end gap-1 border-t border-slate-100 pt-3">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(item)}>
                          <Pencil className="size-4" />
                          Modifier
                        </Button>
                        <Button variant="ghost" size="sm" onClick={() => setStatusTarget(item)}>
                          {item.status !== "ACTIVE" ? (
                            <Settings2 className="size-4 text-emerald-600" />
                          ) : (
                            <Wrench className="size-4 text-amber-600" />
                          )}
                          {item.status !== "ACTIVE" ? "Réactiver" : "Maintenance"}
                        </Button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <Pagination
                page={currentPage}
                pageCount={pageCount}
                pageSize={pageSize}
                total={pagination.total}
                itemLabel="machine"
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>
      <MachineDialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) setFormError(null);
        }}
        editing={editing}
        form={form}
        setForm={setForm}
        error={formError}
        busy={saveMutation.isPending}
        onSubmit={handleSave}
      />
      <AlertDialog
        open={Boolean(statusTarget)}
        onOpenChange={(open) => {
          if (!open) setStatusTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.status !== "ACTIVE"
                ? "Réactiver cette machine ?"
                : "Mettre en maintenance ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget
                ? statusTarget.status !== "ACTIVE"
                  ? `${statusTarget.name} redeviendra disponible pour les futures affectations.`
                  : `${statusTarget.name} ne pourra plus recevoir d’affectation pendant sa maintenance.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusMutation.isPending}
              onClick={() => {
                if (statusTarget)
                  statusMutation.mutate({
                    id: statusTarget.id,
                    status: statusTarget.status !== "ACTIVE" ? "ACTIVE" : "MAINTENANCE",
                  });
              }}
            >
              {statusMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : statusTarget?.status !== "ACTIVE" ? (
                <Settings2 className="size-4" />
              ) : (
                <Wrench className="size-4" />
              )}
              {statusTarget?.status !== "ACTIVE" ? "Réactiver" : "Mettre en maintenance"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
