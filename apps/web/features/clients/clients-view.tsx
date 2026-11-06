"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Archive,
  ContactRound,
  FileSpreadsheet,
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Undo2,
} from "lucide-react";
import { AccessDenied } from "@/components/access/access-denied";
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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { PageHeader } from "@/components/ui/page-header";
import { Pagination } from "@/components/ui/pagination";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { Table } from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/features/auth/auth-provider";
import {
  archiveClientRequest,
  createClientRequest,
  exportClientsRequest,
  getClientsExportDataRequest,
  getClientPhotoUrl,
  getClientsRequest,
  restoreClientRequest,
  updateClientRequest,
  type ClientPayload,
  type ClientDirectoryStatus,
  type ManagedClient,
} from "@/features/auth/auth-client";
import { ClientFormSheet } from "./client-form-sheet";
import { buildClientsPrintDocument, downloadBlob } from "./client-exports";

export function ClientsView(): React.ReactNode {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [status, setStatus] = useState<ClientDirectoryStatus>("ACTIVE");
  const [sorting, setSorting] = useState<{ sortBy: string; sortDirection: "asc" | "desc" }>({ sortBy: "name", sortDirection: "asc" });
  const [exporting, setExporting] = useState<"PDF" | "EXCEL" | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedClient | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [archiveTarget, setArchiveTarget] = useState<ManagedClient | null>(null);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedSearch(search.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [search]);
  useEffect(() => setPage(1), [debouncedSearch, pageSize, status]);

  const listQuery = useQuery({
    queryKey: ["clients", page, pageSize, debouncedSearch, status, sorting],
    queryFn: () => getClientsRequest({ page, pageSize, search: debouncedSearch, status, ...sorting }),
    enabled: user?.role === "ADMIN" || user?.role === "PRODUCTION_MANAGER",
    retry: false,
  });
  const refresh = () => queryClient.invalidateQueries({ queryKey: ["clients"] });
  const saveMutation = useMutation({
    mutationFn: (value: ClientPayload) =>
      editing ? updateClientRequest(editing.id, value) : createClientRequest(value),
    onSuccess: async (client) => {
      await refresh();
      setFormOpen(false);
      setEditing(null);
      setFormError(null);
      toast.success(editing ? "Fiche client mise à jour" : "Client ajouté au répertoire");
      void client;
    },
    onError: (error) =>
      setFormError(error instanceof Error ? error.message : "Impossible d’enregistrer le client."),
  });
  const archiveMutation = useMutation({
    mutationFn: (id: string) => archiveClientRequest(id),
    onSuccess: async () => {
      await refresh();
      setArchiveTarget(null);
      toast.success("Client archivé. Ses affaires restent liées à sa fiche.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Impossible d’archiver le client."),
  });
  const restoreMutation = useMutation({
    mutationFn: (id: string) => restoreClientRequest(id),
    onSuccess: async () => {
      await refresh();
      toast.success("Client restauré");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Impossible de restaurer le client."),
  });

  if (!user || !["ADMIN", "PRODUCTION_MANAGER"].includes(user.role)) return <AccessDenied />;
  const clients = listQuery.data?.clients ?? [];
  const startCreate = () => {
    setEditing(null);
    setFormError(null);
    setFormOpen(true);
  };
  const startEdit = (client: ManagedClient) => {
    setEditing(client);
    setFormError(null);
    setFormOpen(true);
  };

  const currentExportFilters = { search: debouncedSearch, status };
  const exportExcel = async () => {
    setExporting("EXCEL");
    try {
      const blob = await exportClientsRequest(currentExportFilters);
      const date = new Date().toISOString().slice(0, 10);
      downloadBlob(blob, `nim-clients-${date}.xlsx`);
      toast.success("Le fichier Excel des clients a été téléchargé.");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Impossible d’exporter les clients.");
    } finally {
      setExporting(null);
    }
  };

  const exportPdf = async () => {
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      toast.error("Autorisez la fenêtre d’impression pour créer le PDF.");
      return;
    }
    setExporting("PDF");
    try {
      const exportClients = await getClientsExportDataRequest(currentExportFilters);
      printWindow.document.open();
      printWindow.document.write(buildClientsPrintDocument(exportClients, currentExportFilters));
      printWindow.document.close();
      printWindow.focus();
      window.setTimeout(() => printWindow.print(), 400);
      toast.success("Choisissez « Enregistrer au format PDF » dans la fenêtre d’impression.");
    } catch (error) {
      printWindow.close();
      toast.error(error instanceof Error ? error.message : "Impossible de préparer le PDF.");
    } finally {
      setExporting(null);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Répertoire commercial"
        title="Clients"
        description="Une fiche client unique, réutilisable dans toutes les affaires, avec ses coordonnées et ses documents de référence."
        action={
          <>
            <Button
              variant="outline"
              onClick={() => void exportPdf()}
              disabled={Boolean(exporting)}
            >
              {exporting === "PDF" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileText className="size-4" />
              )}
              Exporter PDF
            </Button>
            <Button
              variant="outline"
              onClick={() => void exportExcel()}
              disabled={Boolean(exporting)}
            >
              {exporting === "EXCEL" ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <FileSpreadsheet className="size-4" />
              )}
              Exporter Excel
            </Button>
            <Button
              variant="outline"
              onClick={() => void refresh()}
              disabled={listQuery.isFetching}
            >
              <RefreshCw className={listQuery.isFetching ? "size-4 animate-spin" : "size-4"} />
              Actualiser
            </Button>
            <Button onClick={startCreate}>
              <Plus className="size-4" />
              Nouveau client
            </Button>
          </>
        }
      />
      <Card className="overflow-clip border-slate-200 shadow-sm dark:border-slate-800">
        <div className="sticky top-[76px] z-20 border-b border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-950 sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                className="h-11 pl-10"
                placeholder="Rechercher un client par nom ou matricule fiscal…"
                aria-label="Rechercher des clients"
              />
            </div>
            <Select
              value={status}
              onValueChange={(value) => setStatus(value as ClientDirectoryStatus)}
            >
              <SelectTrigger
                className="h-11 w-full sm:w-[220px]"
                aria-label="Filtrer les clients par statut"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ACTIVE">Clients actifs</SelectItem>
                <SelectItem value="ARCHIVED">Clients archivés</SelectItem>
                <SelectItem value="ALL">Tous les statuts</SelectItem>
              </SelectContent>
            </Select>
            {(search || status !== "ACTIVE") && (
              <Button
                variant="ghost"
                className="shrink-0"
                onClick={() => {
                  setSearch("");
                  setStatus("ACTIVE");
                }}
              >
                Réinitialiser
              </Button>
            )}
          </div>
          <p className="mt-3 text-xs text-muted-foreground" aria-live="polite">
            {listQuery.data
              ? `${listQuery.data.pagination.total} client(s) correspondent aux filtres`
              : "Les clients actifs peuvent être sélectionnés dans une affaire."}
          </p>
        </div>
        {listQuery.isLoading ? (
          <div className="space-y-3 p-5" role="status" aria-label="Chargement des clients">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-14 w-full" />
            ))}
          </div>
        ) : listQuery.isError ? (
          <div className="p-8 text-center">
            <p role="alert" className="text-sm text-red-600">
              Impossible de charger le répertoire clients.
            </p>
            <Button className="mt-4" variant="outline" onClick={() => void listQuery.refetch()}>
              Réessayer
            </Button>
          </div>
        ) : clients.length === 0 ? (
          <CardContent className="py-14 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <ContactRound className="size-6" />
            </div>
            <h2 className="mt-4 text-base font-semibold">
              {debouncedSearch
                ? "Aucun client correspondant"
                : status === "ARCHIVED"
                  ? "Aucun client archivé"
                  : "Le répertoire est vide"}
            </h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              {debouncedSearch
                ? "Essayez un autre nom ou matricule fiscal."
                : "Ajoutez une fiche client pour la réutiliser dans vos affaires."}
            </p>
            {!debouncedSearch && status !== "ARCHIVED" ? (
              <Button className="mt-5" onClick={startCreate}>
                <Plus className="size-4" />
                Ajouter le premier client
              </Button>
            ) : null}
          </CardContent>
        ) : (
          <>
            <div className="overflow-x-auto">
              <Table
                aria-label="Répertoire des clients"
                data-sort-key="clients-directory"
                serverSorting={{ column: ({ name: "Client", taxId: "Matricule fiscal", offers: "Affaires liées", status: "État" } as const)[sorting.sortBy as "name" | "taxId" | "offers" | "status"], direction: sorting.sortDirection }}
                onServerSort={(column, direction) => {
                  const field = ({ Client: "name", "Matricule fiscal": "taxId", "Affaires liées": "offers", "État": "status" } as const)[column as "Client" | "Matricule fiscal" | "Affaires liées" | "État"];
                  if (field) { setSorting({ sortBy: field, sortDirection: direction }); setPage(1); }
                }}
                className="nim-data-table min-w-[820px]"
              >
                <thead className="bg-slate-100 dark:bg-slate-900">
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th
                      scope="col"
                      className="h-12 px-4 text-left align-middle font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Client
                    </th>
                    <th
                      scope="col"
                      className="h-12 px-4 text-left align-middle font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Matricule fiscal
                    </th>
                    <th
                      scope="col"
                      className="h-12 px-4 text-left align-middle font-semibold text-slate-700 dark:text-slate-200"
                      data-sortable="false"
                    >
                      Contact
                    </th>
                    <th
                      scope="col"
                      className="h-12 px-4 text-left align-middle font-semibold text-slate-700 dark:text-slate-200"
                    >
                      Affaires liées
                    </th>
                    <th
                      scope="col"
                      className="h-12 px-4 text-left align-middle font-semibold text-slate-700 dark:text-slate-200"
                    >
                      État
                    </th>
                    <th
                      scope="col"
                      className="h-12 px-4 text-right align-middle font-semibold text-slate-700 dark:text-slate-200"
                      data-sortable="false"
                    >
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {clients.map((client) => (
                    <tr key={client.id} className="border-b transition-colors hover:bg-muted/50">
                      <td className="p-4 align-middle">
                        <Link
                          href={`/clients/${encodeURIComponent(client.id)}`}
                          className="group flex min-w-56 items-center gap-3 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <Avatar className="size-10 rounded-xl">
                            <AvatarImage
                              src={
                                client.imageUrl
                                  ? getClientPhotoUrl(client.id, client.updatedAt)
                                  : undefined
                              }
                              alt=""
                            />
                            <AvatarFallback className="rounded-xl bg-slate-100 text-xs font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                              {client.name.trim().slice(0, 2).toLocaleUpperCase("fr-FR")}
                            </AvatarFallback>
                          </Avatar>
                          <span className="min-w-0">
                            <span className="block truncate font-semibold text-foreground group-hover:text-nim-red">
                              {client.name}
                            </span>
                            <span className="block text-xs text-muted-foreground">
                              Voir la fiche
                            </span>
                          </span>
                        </Link>
                      </td>
                      <td className="p-4 align-middle font-mono text-xs">
                        {client.taxId || (
                          <span className="font-sans text-muted-foreground">Non renseigné</span>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        <span className="block">
                          {client.phoneNumbers[0] || client.emails[0] || "—"}
                        </span>
                        <span className="block max-w-56 truncate text-xs text-muted-foreground">
                          {client.phoneNumbers[0] && client.emails[0]
                            ? client.emails[0]
                            : client.phoneNumbers.length > 1
                              ? `+${client.phoneNumbers.length - 1} autre(s)`
                              : client.emails.length > 1
                                ? "+1 autre e-mail"
                                : ""}
                        </span>
                      </td>
                      <td className="p-4 align-middle">{client.offerCount}</td>
                      <td className="p-4 align-middle">
                        {client.archivedAt ? (
                          <StatusBadge tone="neutral">Archivé</StatusBadge>
                        ) : (
                          <StatusBadge tone="active">Actif</StatusBadge>
                        )}
                      </td>
                      <td className="p-4 align-middle">
                        <div className="flex justify-end gap-2">
                          {client.archivedAt ? (
                            user.role === "ADMIN" ? (
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={restoreMutation.isPending}
                                onClick={() => restoreMutation.mutate(client.id)}
                              >
                                <Undo2 className="size-4" />
                                Restaurer
                              </Button>
                            ) : null
                          ) : (
                            <>
                              <Button size="sm" variant="outline" onClick={() => startEdit(client)}>
                                Modifier
                              </Button>
                              {user.role === "ADMIN" ? (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="text-slate-500"
                                  onClick={() => setArchiveTarget(client)}
                                  aria-label={`Archiver ${client.name}`}
                                >
                                  <Archive className="size-4" />
                                </Button>
                              ) : null}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </Table>
            </div>
            {listQuery.data ? (
              <Pagination
                page={page}
                pageCount={listQuery.data.pagination.totalPages}
                pageSize={pageSize}
                total={listQuery.data.pagination.total}
                onPageChange={setPage}
                onPageSizeChange={setPageSize}
                itemLabel="client"
              />
            ) : null}
          </>
        )}
      </Card>
      <ClientFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        client={editing}
        busy={saveMutation.isPending}
        error={formError}
        onSubmit={(value) => saveMutation.mutate(value)}
      />
      <AlertDialog
        open={Boolean(archiveTarget)}
        onOpenChange={(open) => {
          if (!open) setArchiveTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Archiver ce client ?</AlertDialogTitle>
            <AlertDialogDescription>
              La fiche disparaîtra des choix pour les nouvelles affaires. Les anciennes affaires,
              coordonnées et traces restent conservées. Vous pourrez restaurer le client plus tard.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={archiveMutation.isPending}
              onClick={() => archiveTarget && archiveMutation.mutate(archiveTarget.id)}
            >
              Archiver le client
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
