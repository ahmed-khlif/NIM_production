"use client";

import { useParams } from "next/navigation";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ArrowLeft,
  Building2,
  Download,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Printer,
  Trash2,
  Upload,
} from "lucide-react";
import { AccessDenied } from "@/components/access/access-denied";
import { ReturnLink } from "@/components/navigation/return-navigation";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Skeleton } from "@/components/ui/skeleton";
import { StatusBadge } from "@/components/ui/status-badge";
import { useAuth } from "@/features/auth/auth-provider";
import {
  ApiError,
  getClientPhotoUrl,
  getClientRequest,
  removeClientPhotoRequest,
  updateClientRequest,
  uploadClientPhotoRequest,
  type ClientPayload,
} from "@/features/auth/auth-client";
import { ClientFormSheet } from "./client-form-sheet";

function contactRows(
  values: string[],
  Icon: typeof Phone,
  empty: string,
  hrefPrefix: "tel:" | "mailto:",
): React.ReactNode {
  if (values.length === 0) return <p className="text-sm text-muted-foreground">{empty}</p>;
  return (
    <ul className="space-y-2">
      {values.map((value, index) => (
        <li key={`${value}-${index}`} className="flex items-center gap-2 text-sm">
          <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
          <a
            className="break-all underline-offset-4 hover:text-nim-red hover:underline"
            href={`${hrefPrefix}${encodeURIComponent(value)}`}
          >
            {value}
          </a>
        </li>
      ))}
    </ul>
  );
}

export function ClientDetailView(): React.ReactNode {
  const params = useParams<{ clientId: string }>();
  const clientId = params.clientId;
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const photoInputRef = useRef<HTMLInputElement>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [removePhotoOpen, setRemovePhotoOpen] = useState(false);
  const clientQuery = useQuery({
    queryKey: ["client", clientId],
    queryFn: () => getClientRequest(clientId),
    enabled: Boolean(clientId),
    retry: false,
  });
  const client = clientQuery.data?.client;
  const updateMutation = useMutation({
    mutationFn: (value: ClientPayload) => updateClientRequest(clientId, value),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      setFormOpen(false);
      toast.success("Fiche client mise à jour");
    },
    onError: (error) =>
      setFormError(error instanceof Error ? error.message : "Impossible d’enregistrer la fiche."),
  });
  const photoMutation = useMutation({
    mutationFn: (file: File) => uploadClientPhotoRequest(clientId, file),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      toast.success("Photo du client enregistrée");
    },
    onError: (error) =>
      toast.error(error instanceof ApiError ? error.message : "Impossible d’importer cette image."),
  });
  const removePhotoMutation = useMutation({
    mutationFn: () => removeClientPhotoRequest(clientId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["client", clientId] });
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
      setRemovePhotoOpen(false);
      toast.success("Photo du client supprimée");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Impossible de supprimer la photo."),
  });

  if (!user || !["ADMIN", "PRODUCTION_MANAGER"].includes(user.role)) return <AccessDenied />;
  if (clientQuery.isLoading)
    return (
      <div className="space-y-5">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  if (clientQuery.isError || !client)
    return (
      <div className="rounded-xl border border-dashed p-10 text-center">
        <h1 className="font-semibold">Fiche client indisponible</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Le client est introuvable ou le serveur est momentanément inaccessible.
        </p>
        <div className="mt-4 flex justify-center gap-2">
          <Button variant="outline" onClick={() => void clientQuery.refetch()}>
            Réessayer
          </Button>
          <Button variant="outline" asChild>
            <ReturnLink href="/clients">
              <ArrowLeft className="size-4" />
              Retour aux clients
            </ReturnLink>
          </Button>
        </div>
      </div>
    );

  const uploadPhoto = (file?: File) => {
    if (!file) return;
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      toast.error("Choisissez une image JPEG, PNG ou WebP de 5 Mo maximum.");
      return;
    }
    photoMutation.mutate(file);
  };

  return (
    <div className="space-y-6">
      <style>{`@media print { @page { size: A4; margin: 16mm; } body * { visibility: hidden !important; } #client-print-card, #client-print-card * { visibility: visible !important; } #client-print-card { position: absolute; inset: 0 auto auto 0; width: 100%; border: 0 !important; box-shadow: none !important; } .client-no-print { display: none !important; } }`}</style>
      <div className="client-no-print">
        <PageHeader
          eyebrow="Répertoire commercial"
          title={client.name}
          description="Fiche client de référence · coordonnées et affaires associées."
          action={
            <>
              <Button variant="outline" asChild>
                <ReturnLink href="/clients">
                  <ArrowLeft className="size-4" />
                  Tous les clients
                </ReturnLink>
              </Button>
              <Button variant="outline" onClick={() => window.print()}>
                <Download className="size-4" />
                Exporter en PDF
              </Button>
              <Button
                onClick={() => {
                  setFormError(null);
                  setFormOpen(true);
                }}
                disabled={Boolean(client.archivedAt)}
              >
                <Pencil className="size-4" />
                Modifier la fiche
              </Button>
            </>
          }
        />
      </div>
      <Card
        id="client-print-card"
        className="overflow-hidden border-slate-200 shadow-sm dark:border-slate-800"
      >
        <CardHeader className="border-b bg-slate-50/80 dark:border-slate-800 dark:bg-slate-900/50">
          <div className="flex flex-wrap items-center gap-4">
            <Avatar className="size-20 rounded-2xl border border-slate-200 dark:border-slate-700">
              <AvatarImage
                src={client.imageUrl ? getClientPhotoUrl(client.id, client.updatedAt) : undefined}
                alt={`Logo ${client.name}`}
              />
              <AvatarFallback className="rounded-2xl bg-white text-xl font-semibold text-slate-700 dark:bg-slate-800 dark:text-slate-200">
                {client.name.trim().slice(0, 2).toLocaleUpperCase("fr-FR")}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-2">
                <CardTitle className="text-xl">{client.name}</CardTitle>
                {client.archivedAt ? (
                  <StatusBadge tone="neutral">Archivé</StatusBadge>
                ) : (
                  <StatusBadge tone="active">Actif</StatusBadge>
                )}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                Matricule fiscal ·{" "}
                <span className="font-medium text-foreground">
                  {client.taxId || "Non renseigné"}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                {client.offerCount} affaire(s) liée(s)
              </p>
            </div>
            <div className="client-no-print flex flex-wrap gap-2">
              <input
                ref={photoInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="sr-only"
                aria-label="Importer la photo du client"
                onChange={(event) => {
                  uploadPhoto(event.target.files?.[0]);
                  event.currentTarget.value = "";
                }}
              />
              <Button
                variant="outline"
                onClick={() => photoInputRef.current?.click()}
                disabled={photoMutation.isPending || Boolean(client.archivedAt)}
              >
                {photoMutation.isPending ? (
                  <span className="animate-spin">◌</span>
                ) : (
                  <Upload className="size-4" />
                )}
                {client.imageUrl ? "Remplacer la photo" : "Ajouter une photo"}
              </Button>
              {client.imageUrl ? (
                <Button
                  variant="outline"
                  onClick={() => setRemovePhotoOpen(true)}
                  disabled={removePhotoMutation.isPending || Boolean(client.archivedAt)}
                >
                  <Trash2 className="size-4" />
                  Retirer
                </Button>
              ) : null}
              <Button
                variant="ghost"
                className="hidden print:hidden"
                onClick={() => window.print()}
                aria-label="Imprimer la fiche"
              >
                <Printer className="size-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="grid gap-6 p-5 sm:grid-cols-2 sm:p-6">
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Phone className="size-4 text-muted-foreground" />
              Téléphones
            </h2>
            {contactRows(client.phoneNumbers, Phone, "Aucun numéro renseigné", "tel:")}
          </section>
          <section className="space-y-3">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Mail className="size-4 text-muted-foreground" />
              E-mails
            </h2>
            {contactRows(client.emails, Mail, "Aucun e-mail renseigné", "mailto:")}
          </section>
          <section className="rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <Building2 className="size-4 text-muted-foreground" />
              Coordonnées officielles
            </h2>
            <dl className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-xs text-muted-foreground">Nom / raison sociale</dt>
                <dd className="mt-1 text-sm font-medium">{client.name}</dd>
              </div>
              <div>
                <dt className="text-xs text-muted-foreground">Matricule fiscal</dt>
                <dd className="mt-1 font-mono text-sm font-medium">
                  {client.taxId || "Non renseigné"}
                </dd>
              </div>
            </dl>
          </section>
          <section className="client-no-print rounded-xl border border-slate-200 p-4 dark:border-slate-800 sm:col-span-2">
            <h2 className="flex items-center gap-2 text-sm font-semibold">
              <MapPin className="size-4 text-muted-foreground" />
              Affaires associées
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {client.offerCount === 0
                ? "Aucune affaire n’est encore liée à cette fiche."
                : `${client.offerCount} affaire(s) sont reliées à ce client et accessibles depuis le menu Affaires.`}
            </p>
          </section>
          <p className="hidden text-xs text-slate-500 print:block sm:col-span-2">
            Fiche éditée le{" "}
            {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" }).format(new Date())} · NIM
            Production
          </p>
        </CardContent>
      </Card>
      {photoMutation.isError ? (
        <p role="alert" className="text-sm text-red-600">
          {photoMutation.error instanceof Error
            ? photoMutation.error.message
            : "Échec de l’import de la photo."}
        </p>
      ) : null}
      <ClientFormSheet
        open={formOpen}
        onOpenChange={setFormOpen}
        client={client}
        busy={updateMutation.isPending}
        error={formError}
        onSubmit={(value) => updateMutation.mutate(value)}
      />
      <AlertDialog open={removePhotoOpen} onOpenChange={setRemovePhotoOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Retirer la photo client ?</AlertDialogTitle>
            <AlertDialogDescription>
              La fiche client et ses affaires liées seront conservées. Le retrait de la photo
              restera inscrit dans l’historique.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Annuler</AlertDialogCancel>
            <AlertDialogAction
              disabled={removePhotoMutation.isPending}
              onClick={() => removePhotoMutation.mutate()}
            >
              Retirer la photo
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
