"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { changePasswordSchema, type ChangePasswordInput } from "@nim/validation";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2, Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { ApiError, changePasswordRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PageHeader } from "@/components/ui/page-header";

const roleLabels = {
  ADMIN: "Administrateur",
  PRODUCTION_MANAGER: "Responsable production",
  OPERATOR: "Opérateur",
  QUALITY_CONTROLLER: "Contrôleur qualité",
} as const;

type PasswordFieldProps = {
  id: string;
  label: string;
  type: "currentPassword" | "newPassword";
  visible: boolean;
  onToggle: () => void;
  register: ReturnType<typeof useForm<ChangePasswordInput>>["register"];
  error?: string;
  hint?: string;
};

function PasswordField({ id, label, type, visible, onToggle, register, error, hint }: PasswordFieldProps): React.ReactNode {
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <Input
          id={id}
          className="pr-11"
          type={visible ? "text" : "password"}
          autoComplete={type === "currentPassword" ? "current-password" : "new-password"}
          {...register(type)}
          aria-invalid={error ? "true" : undefined}
          aria-describedby={error ? errorId : hint ? hintId : undefined}
        />
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-slate-500"
          onClick={onToggle}
          aria-label={visible ? `Masquer ${label.toLowerCase()}` : `Afficher ${label.toLowerCase()}`}
          aria-pressed={visible}
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </Button>
      </div>
      {hint ? <p id={hintId} className="text-xs text-slate-500">{hint}</p> : null}
      {error ? <p id={errorId} className="text-xs text-nim-red" role="alert">{error}</p> : null}
    </div>
  );
}

export function ProfileView(): React.ReactNode {
  const { user } = useAuth();
  const [confirmPassword, setConfirmPassword] = useState("");
  const [confirmError, setConfirmError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [visibleFields, setVisibleFields] = useState({ current: false, next: false, confirm: false });
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<ChangePasswordInput>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "" },
  });
  const mutation = useMutation({
    mutationFn: changePasswordRequest,
    onSuccess: () => {
      reset();
      setConfirmPassword("");
      setConfirmError(null);
      setSuccessMessage("Votre mot de passe a été modifié. Les autres sessions ont été protégées côté serveur.");
      toast.success("Mot de passe modifié");
    },
  });

  if (!user) return null;

  const submit = handleSubmit((values) => {
    setSuccessMessage(null);
    if (values.newPassword !== confirmPassword) {
      setConfirmError("La confirmation doit correspondre au nouveau mot de passe.");
      return;
    }
    setConfirmError(null);
    mutation.mutate(values);
  });

  return (
    <div className="space-y-6">
      <PageHeader eyebrow="Mon espace" title="Profil et sécurité" description="Gérez votre identité et protégez votre accès à NIM." />
      <div className="grid gap-5 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><ShieldCheck className="size-4 text-emerald-600" />Compte connecté</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Nom affiché</p><p className="mt-1 text-lg font-semibold text-slate-900">{user.displayName}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Identifiant</p><p className="mt-1 text-sm text-slate-600">@{user.username}</p></div>
            <div><p className="text-xs uppercase tracking-wide text-slate-400">Rôle</p><Badge variant="outline" className="mt-2">{roleLabels[user.role]}</Badge></div>
            <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-slate-500">Les permissions sont contrôlées côté serveur. Modifier ce profil ne change pas votre rôle applicatif.</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base"><KeyRound className="size-4 text-nim-red" />Modifier le mot de passe</CardTitle>
            <p className="text-xs text-slate-500">Utilisez au moins 8 caractères. La validation finale reste faite par l’API.</p>
          </CardHeader>
          <CardContent>
            <form className="space-y-5" onSubmit={(event) => void submit(event)} noValidate>
              <PasswordField id="current-password" label="Mot de passe actuel" type="currentPassword" visible={visibleFields.current} onToggle={() => setVisibleFields((state) => ({ ...state, current: !state.current }))} register={register} error={errors.currentPassword?.message} />
              <PasswordField id="new-password" label="Nouveau mot de passe" type="newPassword" visible={visibleFields.next} onToggle={() => setVisibleFields((state) => ({ ...state, next: !state.next }))} register={register} error={errors.newPassword?.message} hint="Minimum 8 caractères. Évitez un mot de passe déjà utilisé ailleurs." />
              <div className="space-y-2">
                <Label htmlFor="confirm-password">Confirmer le nouveau mot de passe</Label>
                <div className="relative">
                  <Input id="confirm-password" className="pr-11" type={visibleFields.confirm ? "text" : "password"} autoComplete="new-password" value={confirmPassword} onChange={(event) => { setConfirmPassword(event.target.value); setConfirmError(null); }} aria-invalid={confirmError ? "true" : undefined} aria-describedby={confirmError ? "confirm-password-error" : undefined} />
                  <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-slate-500" onClick={() => setVisibleFields((state) => ({ ...state, confirm: !state.confirm }))} aria-label={visibleFields.confirm ? "Masquer la confirmation" : "Afficher la confirmation"} aria-pressed={visibleFields.confirm}>{visibleFields.confirm ? <EyeOff className="size-4" /> : <Eye className="size-4" />}</Button>
                </div>
                {confirmError ? <p id="confirm-password-error" className="text-xs text-nim-red" role="alert">{confirmError}</p> : null}
              </div>
              {mutation.isError ? <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{mutation.error instanceof ApiError ? mutation.error.message : "Impossible de modifier le mot de passe."}</p> : null}
              {successMessage ? <p className="flex items-start gap-2 rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-700" role="status"><CheckCircle2 className="mt-0.5 size-4 shrink-0" />{successMessage}</p> : null}
              <Button type="submit" disabled={mutation.isPending}>{mutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <KeyRound className="size-4" />}Enregistrer le nouveau mot de passe</Button>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
