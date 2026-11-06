"use client";

import { Loader2, Plus, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SuggestionInput } from "@/components/ui/suggestion-input";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  createClientRequest,
  getClientsRequest,
  getOffersRequest,
  type ClientPayload,
  type ManagedOffer,
  type OfferPayload,
} from "@/features/auth/auth-client";
import { ClientFormSheet } from "@/features/clients/client-form-sheet";

export type OfferFormValue = OfferPayload;

const emptyForm: OfferFormValue = {
  reference: "",
  revision: "A",
  name: "",
  clientId: null,
  site: "",
  description: "",
};

export function OfferFormSheet({
  open,
  onOpenChange,
  offer,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  offer?: ManagedOffer | null;
  busy: boolean;
  error?: string | null;
  onSubmit: (value: OfferFormValue) => void;
}): React.ReactNode {
  const queryClient = useQueryClient();
  const recommendationsQuery = useQuery({
    queryKey: ["offers", "form-recommendations"],
    queryFn: () => getOffersRequest({ page: 1, pageSize: 10 }),
    enabled: open,
    staleTime: 5 * 60 * 1000,
    retry: false,
  });
  const [form, setForm] = useState<OfferFormValue>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [clientSearch, setClientSearch] = useState("");
  const [newClientOpen, setNewClientOpen] = useState(false);
  const [clientError, setClientError] = useState<string | null>(null);
  const clientsQuery = useQuery({
    queryKey: ["clients", "selector", clientSearch.trim(), Boolean(offer?.clientId)],
    queryFn: () =>
      getClientsRequest({
        search: clientSearch.trim(),
        page: 1,
        pageSize: 50,
        includeArchived: Boolean(offer?.clientId),
      }),
    enabled: open,
    staleTime: 60_000,
    retry: false,
  });
  const createClientMutation = useMutation({
    mutationFn: (input: ClientPayload) => createClientRequest(input),
    onSuccess: async (client) => {
      setForm((current) => ({ ...current, clientId: client.id }));
      setClientSearch(client.name);
      setNewClientOpen(false);
      setClientError(null);
      await queryClient.invalidateQueries({ queryKey: ["clients"] });
    },
    onError: (reason) =>
      setClientError(reason instanceof Error ? reason.message : "Impossible de créer ce client."),
  });
  const clients = clientsQuery.data?.clients ?? [];
  const selectedClient = clients.find((client) => client.id === form.clientId) ?? null;
  const clientSuggestions = clients.map(
    (client) => `${client.name}${client.archivedAt ? " · archivé" : ""}${client.taxId ? ` · ${client.taxId}` : ""}`,
  );

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setClientSearch(offer?.clientName ?? "");
    setForm(
      offer
        ? {
            reference: offer.reference,
            revision: offer.revision,
            name: offer.name,
            clientId: offer.clientId,
            site: offer.site ?? "",
            description: offer.description ?? "",
          }
        : emptyForm,
    );
  }, [open, offer]);

  const update = <K extends keyof OfferFormValue>(key: K, value: OfferFormValue[K]): void => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => ({ ...current, [key]: "" }));
  };

  const submit = (): void => {
    const nextErrors: Record<string, string> = {};
    if (!form.reference.trim()) nextErrors.reference = "La référence est obligatoire.";
    if (!form.revision.trim()) nextErrors.revision = "L’indice est obligatoire.";
    if (form.name.trim().length < 2) nextErrors.name = "Le nom est obligatoire.";
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors);
      return;
    }
    onSubmit({
      ...form,
      reference: form.reference.trim().toUpperCase(),
      revision: form.revision.trim().toUpperCase(),
      name: form.name.trim(),
      site: form.site?.trim(),
      description: form.description?.trim(),
    });
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white p-0 sm:max-w-[520px] dark:border-slate-800 dark:bg-slate-950"
        >
          <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-12 dark:border-slate-800">
            <SheetTitle>{offer ? "Modifier l’affaire" : "Nouvelle affaire"}</SheetTitle>
            <SheetDescription>
              {offer
                ? "Mettez à jour les informations de l’affaire."
                : "Créez l’affaire. Ses pièces, imports et plans seront regroupés dans cet espace."}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
            <div className="grid gap-4 sm:grid-cols-[130px_minmax(0,1fr)]">
              <div className="space-y-2">
                <Label htmlFor="offer-revision">
                  Indice <span className="text-nim-red">*</span>
                </Label>
                <Input
                  id="offer-revision"
                  value={form.revision}
                  onChange={(event) => update("revision", event.target.value)}
                  placeholder="A"
                  aria-invalid={Boolean(errors.revision)}
                />
                {errors.revision ? (
                  <p className="text-xs font-medium text-nim-red">{errors.revision}</p>
                ) : null}
              </div>
              <div className="space-y-2">
                <Label htmlFor="offer-reference">
                  Référence <span className="text-nim-red">*</span>
                </Label>
                <Input
                  id="offer-reference"
                  value={form.reference}
                  disabled={Boolean(offer)}
                  onChange={(event) => update("reference", event.target.value)}
                  placeholder="OFF-2026-0042"
                  aria-invalid={Boolean(errors.reference)}
                />
                {errors.reference ? (
                  <p className="text-xs font-medium text-nim-red">{errors.reference}</p>
                ) : null}
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-name">
                Nom de l’affaire <span className="text-nim-red">*</span>
              </Label>
              <Input
                id="offer-name"
                value={form.name}
                onChange={(event) => update("name", event.target.value)}
                placeholder="Charpente Bizerte"
                aria-invalid={Boolean(errors.name)}
              />
              {errors.name ? (
                <p className="text-xs font-medium text-nim-red">{errors.name}</p>
              ) : null}
            </div>
            <div className="space-y-2 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <Label htmlFor="offer-client">Client</Label>
                  <p className="mt-1 text-xs text-slate-500">
                    Choisissez une fiche existante ou créez un nouveau client.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setClientError(null);
                    setNewClientOpen(true);
                  }}
                >
                  <Plus className="size-4" /> Nouveau client
                </Button>
              </div>
              <SuggestionInput
                id="offer-client"
                aria-label="Client de l’affaire"
                value={clientSearch}
                suggestions={clientSuggestions}
                contextLabel="Clients enregistrés"
                onChange={(event) => {
                  const nextValue = event.target.value
                  setClientSearch(nextValue)
                  if (form.clientId && nextValue !== selectedClient?.name) update("clientId", null)
                }}
                onValueSelect={(value) => {
                  const index = clientSuggestions.indexOf(value)
                  const client = index >= 0 ? clients[index] : undefined
                  if (!client) return
                  setClientSearch(client.name)
                  update("clientId", client.id)
                }}
                placeholder="Rechercher par nom ou matricule fiscal…"
              />
              {selectedClient ? (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm dark:border-emerald-900 dark:bg-emerald-950/30">
                  <span className="min-w-0 truncate text-emerald-800 dark:text-emerald-200">
                    Client sélectionné : <strong>{selectedClient.name}</strong>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => { update("clientId", null); setClientSearch("") }}>
                    Retirer
                  </Button>
                </div>
              ) : clientSearch.trim() ? (
                <p className="text-xs text-amber-700 dark:text-amber-300">
                  Sélectionnez une suggestion enregistrée pour rattacher un client à l’affaire.
                </p>
              ) : null}
              {clientsQuery.isLoading ? (
                <p className="text-xs text-slate-500">Chargement des clients…</p>
              ) : null}
              {clientsQuery.isError ? (
                <p role="alert" className="text-xs text-red-600">
                  Impossible de charger le répertoire clients.
                </p>
              ) : null}
            </div>
            <div className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800">
              <div>
                <Label htmlFor="offer-site">Site</Label>
                <p className="mt-1 text-xs text-slate-500">
                  Reprenez un site déjà utilisé ou saisissez une nouvelle valeur.
                </p>
              </div>
              <SuggestionInput
                id="offer-site"
                aria-label="Site de l’affaire"
                value={form.site ?? ""}
                onChange={(event) => update("site", event.target.value)}
                onValueSelect={(site) => update("site", site)}
                suggestions={recommendationsQuery.data?.facets?.sites ?? []}
                contextLabel="Sites déjà utilisés"
                placeholder="Bizerte"
              />
              {form.site?.trim() ? (
                <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-blue-200 bg-blue-50 px-3 py-2 text-sm dark:border-blue-900 dark:bg-blue-950/30">
                  <span className="min-w-0 truncate text-blue-800 dark:text-blue-200">
                    Site de l’affaire : <strong>{form.site}</strong>
                  </span>
                  <Button type="button" variant="ghost" size="sm" onClick={() => update("site", "")}>
                    Effacer
                  </Button>
                </div>
              ) : null}
              {recommendationsQuery.isLoading ? (
                <p className="text-xs text-slate-500">Chargement des sites déjà utilisés…</p>
              ) : null}
              {recommendationsQuery.isError ? (
                <p role="alert" className="text-xs text-red-600">
                  Impossible de charger les suggestions. Vous pouvez saisir le site manuellement.
                </p>
              ) : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-description">Description</Label>
              <textarea
                id="offer-description"
                value={form.description ?? ""}
                onChange={(event) => update("description", event.target.value)}
                rows={5}
                maxLength={1200}
                placeholder="Décrivez brièvement l’affaire et son périmètre..."
                className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
            </div>
            {error ? (
              <p
                role="alert"
                className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300"
              >
                {error}
              </p>
            ) : null}
          </div>
          <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
              Annuler
            </Button>
            <Button onClick={submit} disabled={busy}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              {offer ? "Enregistrer" : "Créer l’affaire"}
            </Button>
          </SheetFooter>
        </SheetContent>
      </Sheet>
      <ClientFormSheet
        open={newClientOpen}
        onOpenChange={setNewClientOpen}
        busy={createClientMutation.isPending}
        error={clientError}
        onSubmit={(input) => createClientMutation.mutate(input)}
      />
    </>
  );
}
