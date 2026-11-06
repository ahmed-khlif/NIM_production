"use client";

import { operatorLoginSchema } from "@nim/validation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2, ShieldCheck, UserRound } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NimLogo } from "@/components/brand/nim-logo";
import {
  ApiError,
  getCurrentTabletOperatorRequest,
  operatorTabletLoginRequest,
} from "@/features/auth/auth-client";

export function OperatorTabletLoginView(): React.ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const current = useQuery({
    queryKey: ["tablet", "operator"],
    queryFn: getCurrentTabletOperatorRequest,
    retry: false,
    staleTime: 30_000,
  });
  const login = useMutation({
    mutationFn: operatorTabletLoginRequest,
    onSuccess: async ({ operator: loginOperator }) => {
      // Avoid using a cached 401 from before login; confirm the new HttpOnly cookie first.
      await queryClient.cancelQueries({ queryKey: ["tablet", "operator"] });
      const session = await getCurrentTabletOperatorRequest();
      if (session.operator.id !== loginOperator.id) {
        throw new Error("La session opérateur n’a pas pu être confirmée. Réessayez.");
      }
      queryClient.setQueryData(["tablet", "operator"], session);
      setPassword("");
      setFormError(null);
      router.replace("/production/tablet");
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
          ? error.message
          : error instanceof Error && error.message
            ? error.message
          : "Connexion impossible. Vérifiez le réseau et réessayez.",
      );
    },
  });
  useEffect(() => {
    if (current.data?.operator) router.replace("/production/tablet");
  }, [current.data?.operator, router]);

  const submit = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const parsed = operatorLoginSchema.safeParse({ username, password });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Vérifiez votre identifiant et votre mot de passe.");
      return;
    }
    setFormError(null);
    login.mutate(parsed.data);
  };

  return (
    <main className="flex min-h-dvh items-center justify-center p-4 sm:p-8">
      <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl md:grid-cols-[0.9fr_1.1fr]">
        <section className="flex min-h-52 flex-col justify-between bg-[#111] p-6 text-white sm:p-8 md:min-h-[500px]">
          <div>
            <NimLogo invert />
            <p className="mt-8 text-xs font-semibold uppercase tracking-[0.2em] text-slate-400">
              Production atelier
            </p>
            <h1 className="mt-3 text-2xl font-semibold sm:text-3xl">NIM PRODUCTION</h1>
            <p className="mt-3 max-w-sm text-sm leading-6 text-slate-300">
              Un espace dédié aux équipes machine : session, barres affectées et suivi de
              fabrication.
            </p>
          </div>
          <div className="mt-8 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-4">
            <ShieldCheck className="size-5 shrink-0 text-emerald-400" />
            <p className="text-xs leading-5 text-slate-300">
              Connectez-vous avec l’identifiant et le mot de passe de votre compte opérateur.
            </p>
          </div>
        </section>
        <section className="flex items-center p-5 sm:p-9">
          <Card className="w-full border-0 shadow-none">
            <CardContent className="p-0">
              <div className="mb-7 flex size-12 items-center justify-center rounded-xl bg-red-50 text-nim-red">
                <UserRound className="size-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Connexion opérateur
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Utilisez les identifiants remis par votre administrateur ou responsable de production.
              </p>
              <form className="mt-7 space-y-5" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="tablet-operator-username">Identifiant</Label>
                  <Input id="tablet-operator-username" autoComplete="username" required value={username} onChange={(event) => setUsername(event.target.value)} className="h-14 text-base" placeholder="Votre identifiant opérateur" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="tablet-operator-password">Mot de passe</Label>
                  <div className="relative">
                    <Input
                      id="tablet-operator-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      required
                      value={password}
                      onChange={(event) => setPassword(event.target.value)}
                      className="h-14 pr-12 text-base"
                      placeholder="Votre mot de passe"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 size-10 -translate-y-1/2"
                      aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
                      aria-pressed={showPassword}
                      onClick={() => setShowPassword((visible) => !visible)}
                    >
                      {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </Button>
                  </div>
                </div>
                {formError ? (
                  <p
                    className="rounded-lg border border-red-200 bg-red-50 px-3 py-3 text-sm text-red-800"
                    role="alert"
                  >
                    {formError}
                  </p>
                ) : null}
                {!current.isError && current.isFetching ? (
                  <p className="text-xs text-slate-400" role="status">
                    Vérification d’une session existante…
                  </p>
                ) : null}
                {current.isError &&
                current.error instanceof ApiError &&
                current.error.status !== 401 ? (
                  <p className="text-xs text-amber-700">
                    Le serveur est momentanément indisponible. Vous pouvez réessayer la connexion.
                  </p>
                ) : null}
                <Button
                  type="submit"
                  disabled={login.isPending || (current.isFetching && !current.isError)}
                  className="h-14 w-full text-base font-semibold"
                >
                  <span>
                    {login.isPending ? (
                      <Loader2 className="size-5 animate-spin" />
                    ) : (
                      <UserRound className="size-5" />
                    )}
                  </span>
                  {login.isPending ? "Connexion…" : "Se connecter"}
                </Button>
              </form>
              <p className="mt-6 text-center text-xs text-slate-400">
                Besoin d’aide ? Contactez votre responsable de production.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}
