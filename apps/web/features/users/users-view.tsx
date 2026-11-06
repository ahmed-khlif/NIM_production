"use client";

import { Table } from "@/components/ui/table";
import type { ManagedUser, UserRole } from "@nim/types";
import { createUserSchema, resetUserPasswordSchema, updateUserSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Eye,
  EyeOff,
  Filter,
  Loader2,
  Pencil,
  Power,
  RefreshCw,
  Search,
  ShieldCheck,
  ShieldOff,
  UserCheck,
  UserPlus,
  UserX,
  UsersRound,
  X,
} from "lucide-react";
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
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { EmptyState } from "@/components/ui/empty-state";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { RoleBadge, roleLabels } from "@/components/ui/role-badge";
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
  createUserRequest,
  getUsersPageRequest,
  endUserMachineSessionRequest,
  resetUserPasswordRequest,
  setUserTabletAccessRequest,
  setUserActiveRequest,
  updateUserRequest,
} from "@/features/auth/auth-client";
import { getInitialListParam, useListQueryState } from "@/lib/list-query-state";
import { useAuth } from "@/features/auth/auth-provider";

const roleOptions: Array<{ value: UserRole; label: string; description: string }> = [
  { value: "ADMIN", label: roleLabels.ADMIN, description: "Utilisateurs, sécurité et paramètres" },
  {
    value: "PRODUCTION_MANAGER",
    label: roleLabels.PRODUCTION_MANAGER,
    description: "Pièces, affectations et pilotage",
  },
  { value: "OPERATOR", label: roleLabels.OPERATOR, description: "Opérations et suivi de fabrication" },
  {
    value: "QUALITY_CONTROLLER",
    label: roleLabels.QUALITY_CONTROLLER,
    description: "Contrôles et validations qualité",
  },
];
type UserForm = { username: string; displayName: string; role: UserRole; password: string };
type StatusFilter = "all" | "active" | "inactive";
const emptyForm: UserForm = { username: "", displayName: "", role: "OPERATOR", password: "" };

function initials(displayName: string): string {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}
function formatDate(value: string | null): string {
  if (!value) return "Jamais connecté";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}
function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function TabletKeyActions({ item }: { item: ManagedUser }): React.ReactNode {
  const queryClient = useQueryClient();
  const accessMutation = useMutation({
    mutationFn: (active: boolean) => setUserTabletAccessRequest(item.id, active),
    onSuccess: async (_, active) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      toast.success(active ? "Accès tablette activé" : "Accès tablette désactivé");
    },
    onError: (error) =>
      toast.error(
        error instanceof ApiError ? error.message : "Impossible de modifier l’accès tablette.",
      ),
  });

  return (
    <>
      <div className="flex items-center justify-end gap-1">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          disabled={!item.isActive || accessMutation.isPending}
          aria-label={item.tabletAccessEnabled ? `Désactiver l’accès tablette de ${item.displayName}` : `Activer l’accès tablette de ${item.displayName}`}
          title={item.tabletAccessEnabled ? "Désactiver l’accès tablette" : "Activer l’accès tablette"}
          onClick={() => accessMutation.mutate(!item.tabletAccessEnabled)}
        >
          {accessMutation.isPending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : item.tabletAccessEnabled ? (
            <ShieldOff className="size-4 text-amber-600" />
          ) : (
            <ShieldCheck className="size-4 text-emerald-600" />
          )}
        </Button>
      </div>
    </>
  );
}

function UserFormSheet({
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
  editing: ManagedUser | null;
  form: UserForm;
  setForm: (form: UserForm) => void;
  error: string | null;
  busy: boolean;
  onSubmit: () => void;
}): React.ReactNode {
  const [showPassword, setShowPassword] = useState(false);
  useEffect(() => {
    if (!open) return;
    setShowPassword(false);
    setForm(
      editing
        ? {
            username: editing.username,
            displayName: editing.displayName,
            role: editing.role,
            password: "",
          }
        : emptyForm,
    );
  }, [editing, open, setForm]);
  const setField = <K extends keyof UserForm>(field: K, value: UserForm[K]): void =>
    setForm({ ...form, [field]: value });
  return (
    <Sheet
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen && busy) return;
        onOpenChange(nextOpen);
      }}
    >
      <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white p-0 sm:max-w-[520px] dark:border-slate-800 dark:bg-slate-950">
        <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-12 dark:border-slate-800">
          <SheetTitle>{editing ? "Modifier l’utilisateur" : "Créer un utilisateur"}</SheetTitle>
          <SheetDescription>
            {editing
              ? "Mettez à jour son identité ou son niveau d’accès."
              : "Créez un compte interne avec un rôle précis et un mot de passe initial."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="user-username">Identifiant</Label>
              <Input
                id="user-username"
                value={form.username}
                disabled={Boolean(editing)}
                onChange={(event) => setField("username", event.target.value)}
                placeholder="ex. sami.benali"
                autoComplete="username"
              />
              <p className="text-xs text-slate-400">L’identifiant ne pourra pas être modifié.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="user-display-name">Nom affiché</Label>
              <Input
                id="user-display-name"
                value={form.displayName}
                onChange={(event) => setField("displayName", event.target.value)}
                placeholder="Prénom Nom"
                autoComplete="name"
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Rôle applicatif</Label>
            <Select
              value={form.role}
              onValueChange={(value) => setField("role", value as UserRole)}
            >
              <SelectTrigger>
                <SelectValue placeholder="Choisir un rôle" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((role) => (
                  <SelectItem key={role.value} value={role.value}>
                    <span className="font-medium">{role.label}</span>
                    <span className="ml-2 text-xs text-slate-400">— {role.description}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="user-password">
              {editing ? "Nouveau mot de passe (optionnel)" : "Mot de passe initial"}
            </Label>
            <div className="relative">
              <Input
                id="user-password"
                className="pr-11"
                type={showPassword ? "text" : "password"}
                value={form.password}
                onChange={(event) => setField("password", event.target.value)}
                placeholder={editing ? "Laisser vide pour conserver" : "Minimum 8 caractères"}
                autoComplete="new-password"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                onClick={() => setShowPassword((visible) => !visible)}
                aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                aria-pressed={showPassword}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </Button>
            </div>
            <p className="text-xs text-slate-400">
              Le mot de passe est hashé côté serveur et n’est jamais affiché.
            </p>
          </div>
          {error ? (
            <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
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
              <UserPlus className="size-4" />
            )}
            {editing ? "Enregistrer" : "Créer l’utilisateur"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export function UsersView(): React.ReactNode {
  const { params: urlParams, update: updateUrl } = useListQueryState();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const isAdmin = user?.role === "ADMIN";
  const canManageDirectory = isAdmin || user?.role === "PRODUCTION_MANAGER";
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">(() => {
    const role = getInitialListParam("role", "all");
    return roleOptions.some((option) => option.value === role) ? role as UserRole : "all";
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [form, setForm] = useState<UserForm>(emptyForm);
  const [formError, setFormError] = useState<string | null>(null);
  const [statusTarget, setStatusTarget] = useState<ManagedUser | null>(null);
  const [sessionTarget, setSessionTarget] = useState<ManagedUser | null>(null);
  const [statusError, setStatusError] = useState<string | null>(null);
  const [search, setSearch] = useState(() => getInitialListParam("search"));
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>(() => {
    const status = getInitialListParam("status", "all");
    return ["all", "active", "inactive"].includes(status) ? status as StatusFilter : "all";
  });
  const [page, setPage] = useState(() => Math.max(1, Number(getInitialListParam("page", "1")) || 1));
  const [pageSize, setPageSize] = useState(() => [10, 20, 50].includes(Number(getInitialListParam("pageSize", "20"))) ? Number(getInitialListParam("pageSize", "20")) : 20);
  const [sorting, setSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "displayName", sortDirection: "asc" });
  useEffect(() => {
    setSearch(urlParams.get("search") ?? "");
    const requestedRole = urlParams.get("role") ?? "all";
    setRoleFilter(roleOptions.some((role) => role.value === requestedRole) ? requestedRole as UserRole : "all");
    const status = urlParams.get("status") ?? "all";
    setStatusFilter(["all", "active", "inactive"].includes(status) ? status as StatusFilter : "all");
    setPage(Math.max(1, Number(urlParams.get("page")) || 1));
    const nextSize = Number(urlParams.get("pageSize"));
    if ([10, 20, 50].includes(nextSize)) setPageSize(nextSize);
  }, [urlParams]);
  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  const usersQuery = useQuery({
    queryKey: ["users", page, pageSize, debouncedSearch, roleFilter, statusFilter, sorting],
    queryFn: () => getUsersPageRequest({
      page,
      pageSize,
      search: debouncedSearch,
      role: roleFilter,
      active: statusFilter === "all" ? undefined : statusFilter === "active",
      ...sorting,
    }),
    enabled: Boolean(canManageDirectory),
    retry: false,
    refetchInterval: isAdmin ? 15_000 : false,
  });
  const saveMutation = useMutation({
    mutationFn: async ({ target, values }: { target: ManagedUser | null; values: UserForm }) => {
      if (target) {
        const updated = await updateUserRequest(target.id, {
          displayName: values.displayName,
          role: values.role,
        });
        if (values.password) await resetUserPasswordRequest(target.id, values.password);
        return updated;
      }
      return createUserRequest(values);
    },
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setDialogOpen(false);
      toast.success(variables.target ? "Utilisateur mis à jour" : "Utilisateur créé");
    },
    onError: (error) =>
      setFormError(
        error instanceof ApiError ? error.message : "Impossible d’enregistrer cet utilisateur.",
      ),
  });
  const statusMutation = useMutation({
    mutationFn: ({ id, active }: { id: string; active: boolean }) =>
      setUserActiveRequest(id, active),
    onSuccess: async (_, variables) => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      setStatusTarget(null);
      setStatusError(null);
      toast.success(variables.active ? "Compte réactivé" : "Compte désactivé");
    },
    onError: (error) => {
      const message =
        error instanceof ApiError ? error.message : "Impossible de modifier le statut.";
      setStatusError(message);
      toast.error(message);
    },
  });
  const endMachineSessionMutation = useMutation({
    mutationFn: (id: string) => endUserMachineSessionRequest(id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["users"] });
      await queryClient.invalidateQueries({ queryKey: ["tablet"] });
      setSessionTarget(null);
      toast.success("Session machine terminée");
    },
    onError: (error) => {
      const message = error instanceof ApiError ? error.message : "Impossible de terminer la session machine.";
      toast.error(message);
      void usersQuery.refetch();
    },
  });
  const users = usersQuery.data?.users ?? [];
  const pagination = usersQuery.data?.pagination ?? { page, pageSize, total: users.length, totalPages: 1 };
  const pageCount = pagination.totalPages;
  const currentPage = pagination.page;
  const pagedUsers = users;
  const activeCount = usersQuery.data?.summary?.activeCount ?? 0;
  const adminCount = usersQuery.data?.summary?.adminCount ?? 0;
  const tabletAccessCount = usersQuery.data?.summary?.tabletAccessCount ?? 0;
  const hasFilters = Boolean(search.trim()) || statusFilter !== "all" || roleFilter !== "all";
  useEffect(() => {
    setPage(1);
  }, [pageSize, roleFilter, debouncedSearch, statusFilter]);
  useEffect(() => {
    updateUrl({ search: search.trim(), role: roleFilter === "all" ? null : roleFilter, status: statusFilter === "all" ? null : statusFilter, page, pageSize });
  }, [search, roleFilter, statusFilter, page, pageSize, updateUrl]);

  const resetFilters = (): void => {
    setSearch("");
    setStatusFilter("all");
    setRoleFilter("all");
    setPage(1);
  };
  const openCreate = (): void => {
    setEditing(null);
    setFormError(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };
  const openEdit = (target: ManagedUser): void => {
    setEditing(target);
    setFormError(null);
    setForm({
      username: target.username,
      displayName: target.displayName,
      role: target.role,
      password: "",
    });
    setDialogOpen(true);
  };
  const handleSave = (): void => {
    const result = editing
      ? updateUserSchema.safeParse({ displayName: form.displayName, role: form.role })
      : createUserSchema.safeParse(form);
    if (!result.success) {
      setFormError(result.error.issues[0]?.message ?? "Vérifiez les informations saisies.");
      return;
    }
    if (editing && form.password) {
      const passwordResult = resetUserPasswordSchema.safeParse({ newPassword: form.password });
      if (!passwordResult.success) {
        setFormError(
          passwordResult.error.issues[0]?.message ?? "Vérifiez le nouveau mot de passe.",
        );
        return;
      }
    }
    setFormError(null);
    saveMutation.mutate({ target: editing, values: form });
  };

  if (!canManageDirectory)
    return (
      <Card>
        <CardContent className="flex min-h-64 flex-col items-center justify-center p-8 text-center">
          <ShieldCheck className="size-8 text-slate-300" />
          <h1 className="mt-4 text-lg font-semibold text-slate-900">Accès administrateur requis</h1>
          <p className="mt-2 max-w-md text-sm text-slate-500">
            La gestion des comptes est réservée aux administrateurs.
          </p>
        </CardContent>
      </Card>
    );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Administration"
        title={roleFilter === "OPERATOR" || !isAdmin ? "Opérateurs" : "Utilisateurs"}
        description="Gérez les comptes, les rôles et les accès à la plateforme."
        action={
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              onClick={() => void usersQuery.refetch()}
              disabled={usersQuery.isFetching}
            >
              <RefreshCw className={`size-4 ${usersQuery.isFetching ? "animate-spin" : ""}`} />
              Actualiser
            </Button>
            {isAdmin ? (
              <Button onClick={openCreate}>
                <UserPlus className="size-4" />
                Nouvel utilisateur
              </Button>
            ) : null}
          </div>
        }
      />
      <div className="grid gap-3 sm:grid-cols-3">
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-slate-100 p-2.5 text-slate-600">
              <UsersRound className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Comptes totaux</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{users.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-emerald-50 p-2.5 text-emerald-600">
              <UserCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">Actifs</p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">{activeCount}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="flex items-center gap-3 p-4">
            <div className="rounded-lg bg-red-50 p-2.5 text-nim-red">
              <ShieldCheck className="size-5" />
            </div>
            <div>
              <p className="text-xs text-slate-500">
                {isAdmin ? "Administrateurs actifs" : "Accès tablette actifs"}
              </p>
              <p className="mt-1 text-2xl font-semibold text-slate-950">
                {isAdmin ? adminCount : tabletAccessCount}
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader className="nim-sticky-table-tools gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <CardTitle className="text-sm">Répertoire des utilisateurs</CardTitle>
            <p className="mt-1 text-xs text-slate-500">
              Les mots de passe ne sont jamais visibles dans cette liste.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:max-w-xl sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Rechercher un utilisateur"
                aria-label="Rechercher un utilisateur"
                className="pl-9 pr-9"
              />
              {search ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute right-1 top-1/2 size-8 -translate-y-1/2"
                  onClick={() => setSearch("")}
                  aria-label="Effacer la recherche"
                >
                  <X className="size-4" />
                </Button>
              ) : null}
            </div>
            {isAdmin ? (
              <Select
                value={roleFilter}
                onValueChange={(value) => setRoleFilter(value as UserRole | "all")}
              >
                <SelectTrigger className="w-full sm:w-[190px]" aria-label="Filtrer par rôle">
                  <SelectValue placeholder="Tous les rôles" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Tous les rôles</SelectItem>
                  {roleOptions.map((role) => (
                    <SelectItem key={role.value} value={role.value}>
                      {role.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            ) : null}
            <Select
              value={statusFilter}
              onValueChange={(value) => setStatusFilter(value as StatusFilter)}
            >
              <SelectTrigger className="w-full sm:w-[155px]" aria-label="Filtrer par statut">
                <Filter className="size-4 text-slate-400" />
                <SelectValue placeholder="Tous les statuts" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Tous les statuts</SelectItem>
                <SelectItem value="active">Actifs</SelectItem>
                <SelectItem value="inactive">Désactivés</SelectItem>
              </SelectContent>
            </Select>
            {hasFilters ? (
              <Button type="button" variant="ghost" onClick={resetFilters}>
                Réinitialiser
              </Button>
            ) : null}
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {statusError ? (
            <div
              className="mx-5 mt-5 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
              role="alert"
            >
              {statusError}
            </div>
          ) : null}
          {usersQuery.isLoading ? (
            <div className="space-y-3 p-5" aria-busy="true">
              {Array.from({ length: 4 }, (_, index) => (
                <Skeleton key={index} className="h-16 w-full" />
              ))}
            </div>
          ) : usersQuery.isError ? (
            <div
              className="flex min-h-48 flex-col items-center justify-center p-8 text-center"
              role="alert"
            >
              <p className="text-sm font-semibold text-red-700">
                Impossible de charger les utilisateurs
              </p>
              <p className="mt-1 text-sm text-slate-500">
                {usersQuery.error instanceof ApiError
                  ? usersQuery.error.message
                  : "Vérifiez la connexion à l’API."}
              </p>
              <Button
                variant="outline"
                className="mt-4"
                onClick={() => void usersQuery.refetch()}
                disabled={usersQuery.isFetching}
              >
                <RefreshCw className="size-4" />
                Réessayer
              </Button>
            </div>
          ) : pagination.total === 0 ? (
            <div className="p-5">
              <EmptyState
                title={hasFilters ? "Aucun résultat" : "Aucun utilisateur"}
                description={
                  hasFilters
                    ? "Modifiez les filtres pour afficher d’autres comptes."
                    : "Créez le premier compte métier de votre équipe."
                }
              />
            </div>
          ) : (
            <>
              <p
                className="border-b border-slate-100 px-5 py-3 text-xs text-slate-500"
                aria-live="polite"
              >
                {pagination.total.toLocaleString("fr-FR")} {pagination.total === 1 ? "utilisateur correspond" : "utilisateurs correspondent"} aux filtres
              </p>
              <div className="hidden overflow-x-auto md:block">
                <Table
                  serverSorting={{ column: ({ displayName: "Utilisateur", role: "Rôle", isActive: "Statut", lastLoginAt: "Dernière connexion" } as const)[sorting.sortBy as "displayName" | "role" | "isActive" | "lastLoginAt"], direction: sorting.sortDirection }}
                  onServerSort={(column, direction) => {
                    const field = ({ Utilisateur: "displayName", Rôle: "role", Statut: "isActive", "Dernière connexion": "lastLoginAt" } as const)[column as "Utilisateur" | "Rôle" | "Statut" | "Dernière connexion"];
                    if (field) { setSorting({ sortBy: field, sortDirection: direction }); setPage(1); }
                  }}
                  className="nim-data-table w-full text-left text-sm"
                >
                  <caption className="sr-only">Répertoire des utilisateurs</caption>
                  <thead className="border-b border-slate-100 text-[11px] uppercase tracking-wide text-slate-400">
                    <tr>
                      <th className="px-5 py-3 font-medium">Utilisateur</th>
                      <th className="px-5 py-3 font-medium">Rôle</th>
                      <th className="px-5 py-3 font-medium">Statut</th>
                      <th className="px-5 py-3 font-medium">Dernière connexion</th>
                      {isAdmin ? <th className="px-5 py-3 font-medium" data-sortable="false">Session machine</th> : null}
                      <th className="px-5 py-3 text-right font-medium" data-sortable="false">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {pagedUsers.map((item) => (
                      <tr key={item.id} className="transition-colors hover:bg-slate-50/70">
                        <td className="px-5 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar className="size-9">
                              <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-600">
                                {initials(item.displayName)}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium text-slate-900">{item.displayName}</p>
                              <p className="text-xs text-slate-500">@{item.username}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-5 py-4">
                          <RoleBadge role={item.role} />
                        </td>
                        <td className="px-5 py-4">
                          <StatusBadge tone={item.isActive ? "active" : "neutral"}>
                            {item.isActive ? "Actif" : "Désactivé"}
                          </StatusBadge>
                        </td>
                        <td className="px-5 py-4 text-xs text-slate-500">
                          {formatDate(item.lastLoginAt)}
                        </td>
                        {isAdmin ? (
                          <td className="px-5 py-4">
                            {item.activeMachineSession ? (
                              <div className="space-y-1.5">
                                <StatusBadge tone="warning">Session active</StatusBadge>
                                <p className="text-xs font-medium text-slate-700">{item.activeMachineSession.machineName}</p>
                                <p className="text-xs text-slate-500">Depuis {formatDateTime(item.activeMachineSession.startedAt)}</p>
                                {item.activeMachineSession.runningBarReference ? (
                                  <p className="text-xs font-medium text-amber-700">
                                    Fabrication en cours · {item.activeMachineSession.runningBarReference}
                                  </p>
                                ) : (
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="mt-1"
                                    onClick={() => setSessionTarget(item)}
                                  >
                                    <Power className="size-3.5" />
                                    Terminer la session
                                  </Button>
                                )}
                              </div>
                            ) : (
                              <span className="text-xs text-slate-400">Aucune session machine</span>
                            )}
                          </td>
                        ) : null}
                        <td className="px-5 py-4">
                          <div className="flex justify-end gap-1">
                            {isAdmin ? (
                              <>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={`Modifier ${item.displayName}`}
                                  onClick={() => openEdit(item)}
                                >
                                  <Pencil className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  aria-label={
                                    item.isActive
                                      ? `Désactiver ${item.displayName}`
                                      : `Réactiver ${item.displayName}`
                                  }
                                  onClick={() => {
                                    setStatusError(null);
                                    setStatusTarget(item);
                                  }}
                                >
                                  {item.isActive ? (
                                    <UserX className="size-4 text-red-500" />
                                  ) : (
                                    <UserCheck className="size-4 text-emerald-600" />
                                  )}
                                </Button>
                              </>
                            ) : null}
                            {item.role === "OPERATOR" ? <TabletKeyActions item={item} /> : null}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </Table>
              </div>
              <div className="space-y-3 p-4 md:hidden">
                {pagedUsers.map((item) => (
                  <div key={item.id} className="rounded-lg border border-slate-100 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Avatar className="size-9">
                          <AvatarFallback className="bg-slate-100 text-xs font-semibold text-slate-600">
                            {initials(item.displayName)}
                          </AvatarFallback>
                        </Avatar>
                        <div className="min-w-0">
                          <p className="truncate font-medium text-slate-900">{item.displayName}</p>
                          <p className="truncate text-xs text-slate-500">@{item.username}</p>
                        </div>
                      </div>
                      <StatusBadge tone={item.isActive ? "active" : "neutral"}>
                        {item.isActive ? "Actif" : "Désactivé"}
                      </StatusBadge>
                    </div>
                    <div className="mt-3 flex items-center justify-between gap-3">
                      <RoleBadge role={item.role} />
                      <div className="flex gap-1">
                        {isAdmin ? (
                          <>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={`Modifier ${item.displayName}`}
                              onClick={() => openEdit(item)}
                            >
                              <Pencil className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={
                                item.isActive
                                  ? `Désactiver ${item.displayName}`
                                  : `Réactiver ${item.displayName}`
                              }
                              onClick={() => {
                                setStatusError(null);
                                setStatusTarget(item);
                              }}
                            >
                              {item.isActive ? (
                                <UserX className="size-4 text-red-500" />
                              ) : (
                                <UserCheck className="size-4 text-emerald-600" />
                              )}
                            </Button>
                          </>
                        ) : null}
                        {item.role === "OPERATOR" ? <TabletKeyActions item={item} /> : null}
                      </div>
                    </div>
                    {isAdmin && item.role === "OPERATOR" ? (
                      <div className="mt-3 border-t border-slate-100 pt-3">
                        {item.activeMachineSession ? (
                          <div className="flex flex-wrap items-center justify-between gap-3">
                            <div className="space-y-1">
                              <StatusBadge tone="warning">Session · {item.activeMachineSession.machineName}</StatusBadge>
                              <p className="text-xs text-slate-500">Depuis {formatDateTime(item.activeMachineSession.startedAt)}</p>
                              {item.activeMachineSession.runningBarReference ? (
                                <p className="text-xs font-medium text-amber-700">Fabrication en cours · {item.activeMachineSession.runningBarReference}</p>
                              ) : null}
                            </div>
                            {!item.activeMachineSession.runningBarReference ? (
                              <Button type="button" variant="outline" size="sm" onClick={() => setSessionTarget(item)}>
                                <Power className="size-4" />
                                Terminer la session
                              </Button>
                            ) : null}
                          </div>
                        ) : (
                          <p className="text-xs text-slate-400">Aucune session machine active</p>
                        )}
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
                itemLabel="utilisateur"
                onPageChange={setPage}
                onPageSizeChange={(size) => { setPageSize(size); setPage(1); }}
              />
            </>
          )}
        </CardContent>
      </Card>
      <UserFormSheet
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
          if (!open && !statusMutation.isPending) {
            setStatusTarget(null);
            setStatusError(null);
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {statusTarget?.isActive ? "Désactiver ce compte ?" : "Réactiver ce compte ?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {statusTarget?.isActive
                ? `Le compte de ${statusTarget.displayName} sera déconnecté et ne pourra plus accéder à NIM.`
                : `Le compte de ${statusTarget?.displayName} pourra à nouveau se connecter à NIM.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={statusMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={statusMutation.isPending}
              onClick={() => {
                if (statusTarget)
                  statusMutation.mutate({ id: statusTarget.id, active: !statusTarget.isActive });
              }}
            >
              {statusMutation.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : statusTarget?.isActive ? (
                <UserX className="size-4" />
              ) : (
                <UserCheck className="size-4" />
              )}
              {statusTarget?.isActive ? "Désactiver" : "Réactiver"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <AlertDialog
        open={Boolean(sessionTarget)}
        onOpenChange={(open) => {
          if (!open && !endMachineSessionMutation.isPending) setSessionTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Terminer cette session machine ?</AlertDialogTitle>
            <AlertDialogDescription>
              {sessionTarget?.activeMachineSession
                ? `${sessionTarget.displayName} sera retiré de la session sur ${sessionTarget.activeMachineSession.machineName}. L’historique de la session sera conservé. Cette action ne déconnecte pas son compte NIM.`
                : "Cette session n’est plus active. Actualisez la liste des utilisateurs."}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={endMachineSessionMutation.isPending}>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={
                endMachineSessionMutation.isPending ||
                !sessionTarget?.activeMachineSession ||
                Boolean(sessionTarget.activeMachineSession.runningBarReference)
              }
              onClick={() => {
                if (sessionTarget) endMachineSessionMutation.mutate(sessionTarget.id);
              }}
            >
              {endMachineSessionMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}
              Terminer la session
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
