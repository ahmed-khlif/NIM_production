"use client";

import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import type { ManagedOffer, OfferPayload } from "@/features/auth/auth-client";

export type OfferFormValue = OfferPayload;

const emptyForm: OfferFormValue = {
  reference: "",
  revision: "A",
  name: "",
  clientName: "",
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
  const [form, setForm] = useState<OfferFormValue>(emptyForm);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setForm(
      offer
        ? {
            reference: offer.reference,
            revision: offer.revision,
            name: offer.name,
            clientName: offer.clientName ?? "",
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
      clientName: form.clientName?.trim(),
      site: form.site?.trim(),
      description: form.description?.trim(),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white p-0 sm:max-w-[520px] dark:border-slate-800 dark:bg-slate-950">
        <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-12 dark:border-slate-800">
          <SheetTitle>{offer ? "Modifier l’offre" : "Nouvelle offre"}</SheetTitle>
          <SheetDescription>
            {offer
              ? "Mettez à jour les informations de l’offre sans changer sa référence métier."
              : "Créez d’abord l’offre. Les pièces, imports et plans de coupe seront ensuite isolés dans cet espace."}
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_130px]">
            <div className="space-y-2">
              <Label htmlFor="offer-reference">Référence <span className="text-nim-red">*</span></Label>
              <Input id="offer-reference" value={form.reference} disabled={Boolean(offer)} onChange={(event) => update("reference", event.target.value)} placeholder="OFF-2026-0042" aria-invalid={Boolean(errors.reference)} />
              {errors.reference ? <p className="text-xs font-medium text-nim-red">{errors.reference}</p> : null}
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-revision">Indice <span className="text-nim-red">*</span></Label>
              <Input id="offer-revision" value={form.revision} onChange={(event) => update("revision", event.target.value)} placeholder="A" aria-invalid={Boolean(errors.revision)} />
              {errors.revision ? <p className="text-xs font-medium text-nim-red">{errors.revision}</p> : null}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-name">Nom de l’offre <span className="text-nim-red">*</span></Label>
            <Input id="offer-name" value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Charpente Bizerte" aria-invalid={Boolean(errors.name)} />
            {errors.name ? <p className="text-xs font-medium text-nim-red">{errors.name}</p> : null}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="offer-client">Client</Label>
              <Input id="offer-client" value={form.clientName ?? ""} onChange={(event) => update("clientName", event.target.value)} placeholder="Société Métal" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="offer-site">Site</Label>
              <Input id="offer-site" value={form.site ?? ""} onChange={(event) => update("site", event.target.value)} placeholder="Bizerte" />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="offer-description">Description</Label>
            <textarea
              id="offer-description"
              value={form.description ?? ""}
              onChange={(event) => update("description", event.target.value)}
              rows={5}
              maxLength={1200}
              placeholder="Décrivez brièvement l’offre et son périmètre..."
              className="flex w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
            />
          </div>
          {error ? <p className="rounded-lg border border-red-100 bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:border-red-950 dark:bg-red-950/30 dark:text-red-300">{error}</p> : null}
        </div>
        <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 dark:border-slate-800 dark:bg-slate-950">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Annuler</Button>
          <Button onClick={submit} disabled={busy}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
            {offer ? "Enregistrer" : "Créer l’offre"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
