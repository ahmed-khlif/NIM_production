"use client";

import { Loader2, Save } from "lucide-react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { ClientPayload, ManagedClient } from "@/features/auth/auth-client";

function formFromClient(client?: ManagedClient | null) {
  return {
    name: client?.name ?? "",
    taxId: client?.taxId ?? "",
    phoneNumbers: [
      client?.phoneNumbers[0] ?? "",
      client?.phoneNumbers[1] ?? "",
      client?.phoneNumbers[2] ?? "",
    ],
    emails: [client?.emails[0] ?? "", client?.emails[1] ?? ""],
  };
}

export function ClientFormSheet({
  open,
  onOpenChange,
  client,
  busy,
  error,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  client?: ManagedClient | null;
  busy: boolean;
  error: string | null;
  onSubmit: (value: ClientPayload) => void;
}): React.ReactNode {
  const [form, setForm] = useState(() => formFromClient(client));
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (open) {
      setForm(formFromClient(client));
      setValidationErrors({});
    }
  }, [client, open]);
  const setContact = (field: "phoneNumbers" | "emails", index: number, value: string) => {
    setForm((current) => ({
      ...current,
      [field]: current[field].map((entry, itemIndex) => (itemIndex === index ? value : entry)),
    }));
  };
  const submit = () => {
    const nextErrors: Record<string, string> = {};
    if (form.name.trim().length < 2) nextErrors.name = "Le nom du client est obligatoire.";
    if (!form.taxId.trim()) nextErrors.taxId = "Le matricule fiscal est obligatoire.";
    if (!form.phoneNumbers[0].trim()) nextErrors.phone = "Un numéro de téléphone est obligatoire.";
    if (!form.emails[0].trim()) nextErrors.email = "Une adresse e-mail est obligatoire.";
    if (Object.keys(nextErrors).length) {
      setValidationErrors(nextErrors);
      return;
    }
    setValidationErrors({});
    onSubmit({
      name: form.name.trim(),
      taxId: form.taxId.trim(),
      phoneNumbers: form.phoneNumbers.map((value) => value.trim()).filter(Boolean),
      emails: form.emails.map((value) => value.trim()).filter(Boolean),
    });
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col overflow-hidden border-slate-200 bg-white p-0 sm:max-w-[560px] dark:border-slate-800 dark:bg-slate-950"
      >
        <SheetHeader className="border-b border-slate-200 px-6 py-5 pr-12 text-left dark:border-slate-800">
          <SheetTitle>{client ? "Modifier le client" : "Nouveau client"}</SheetTitle>
          <SheetDescription>
            Centralisez les coordonnées du client. Une fiche peut être reliée à plusieurs affaires.
          </SheetDescription>
        </SheetHeader>
        <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
          <div className="space-y-2">
            <Label htmlFor="client-name">
              Nom / raison sociale <span className="text-nim-red">*</span>
            </Label>
            <Input
              id="client-name"
              autoFocus
              value={form.name}
              aria-invalid={Boolean(validationErrors.name)}
              onChange={(event) => {
                setForm((current) => ({ ...current, name: event.target.value }));
                setValidationErrors((current) => ({ ...current, name: "" }));
              }}
              maxLength={160}
              placeholder="Nom officiel du client"
            />
            {validationErrors.name ? (
              <p role="alert" className="text-xs text-nim-red">
                {validationErrors.name}
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Le nom est unique dans le répertoire pour éviter les doublons.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="client-tax-id">
              Matricule fiscal <span className="text-nim-red">*</span>
            </Label>
            <Input
              id="client-tax-id"
              required
              value={form.taxId}
              aria-invalid={Boolean(validationErrors.taxId)}
              onChange={(event) => {
                setForm((current) => ({ ...current, taxId: event.target.value }));
                setValidationErrors((current) => ({ ...current, taxId: "" }));
              }}
              maxLength={64}
              placeholder="Ex. 1234567A/A/M/000"
            />
            {validationErrors.taxId ? (
              <p role="alert" className="text-xs text-nim-red">
                {validationErrors.taxId}
              </p>
            ) : null}
          </div>
          <section
            className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            aria-labelledby="client-phones-heading"
          >
            <div>
              <h3 id="client-phones-heading" className="text-sm font-semibold">
                Téléphones <span className="font-normal text-muted-foreground">· jusqu’à 3</span>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Ajoutez les numéros généraux et les contacts principaux.
              </p>
            </div>
            {form.phoneNumbers.map((value, index) => (
              <div key={`phone-${index}`} className="space-y-1.5">
                <Label htmlFor={`client-phone-${index}`}>
                  Téléphone {index + 1}{" "}
                  {index === 0 ? <span className="text-nim-red">*</span> : null}
                </Label>
                <Input
                  id={`client-phone-${index}`}
                  type="tel"
                  required={index === 0}
                  inputMode="tel"
                  value={value}
                  aria-invalid={index === 0 && Boolean(validationErrors.phone)}
                  onChange={(event) => {
                    setContact("phoneNumbers", index, event.target.value);
                    if (index === 0) setValidationErrors((current) => ({ ...current, phone: "" }));
                  }}
                  placeholder="+216 …"
                  maxLength={32}
                />
                {index === 0 && validationErrors.phone ? (
                  <p role="alert" className="text-xs text-nim-red">
                    {validationErrors.phone}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
          <section
            className="space-y-3 rounded-xl border border-slate-200 p-4 dark:border-slate-800"
            aria-labelledby="client-emails-heading"
          >
            <div>
              <h3 id="client-emails-heading" className="text-sm font-semibold">
                E-mails <span className="font-normal text-muted-foreground">· jusqu’à 2</span>
              </h3>
              <p className="mt-1 text-xs text-muted-foreground">
                Utilisés comme coordonnées de référence du client.
              </p>
            </div>
            {form.emails.map((value, index) => (
              <div key={`email-${index}`} className="space-y-1.5">
                <Label htmlFor={`client-email-${index}`}>
                  E-mail {index + 1} {index === 0 ? <span className="text-nim-red">*</span> : null}
                </Label>
                <Input
                  id={`client-email-${index}`}
                  type="email"
                  required={index === 0}
                  inputMode="email"
                  value={value}
                  aria-invalid={index === 0 && Boolean(validationErrors.email)}
                  onChange={(event) => {
                    setContact("emails", index, event.target.value);
                    if (index === 0) setValidationErrors((current) => ({ ...current, email: "" }));
                  }}
                  placeholder="contact@entreprise.tn"
                  maxLength={254}
                />
                {index === 0 && validationErrors.email ? (
                  <p role="alert" className="text-xs text-nim-red">
                    {validationErrors.email}
                  </p>
                ) : null}
              </div>
            ))}
          </section>
          {error ? (
            <p
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950/30 dark:text-red-300"
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
            {client ? "Enregistrer" : "Créer la fiche"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}
