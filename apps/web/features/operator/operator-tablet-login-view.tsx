"use client";

import { operatorLoginSchema } from "@nim/validation";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, KeyRound, Loader2, ShieldCheck } from "lucide-react";
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
  const [connectionKey, setConnectionKey] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const current = useQuery({
    queryKey: ["tablet", "operator"],
    queryFn: getCurrentTabletOperatorRequest,
    retry: false,
    staleTime: 0,
  });
  const login = useMutation({
    mutationFn: operatorTabletLoginRequest,
    onSuccess: () => {
      setConnectionKey("");
      setFormError(null);
      router.replace("/production/tablet");
    },
    onError: (error) => {
      setFormError(
        error instanceof ApiError
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
    const parsed = operatorLoginSchema.safeParse({ connectionKey });
    if (!parsed.success) {
      setFormError(parsed.error.issues[0]?.message ?? "Saisissez votre clé de connexion.");
      return;
    }
    setFormError(null);
    login.mutate(parsed.data.connectionKey);
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
              Votre clé est vérifiée par l’API et n’est jamais conservée dans le navigateur.
            </p>
          </div>
        </section>
        <section className="flex items-center p-5 sm:p-9">
          <Card className="w-full border-0 shadow-none">
            <CardContent className="p-0">
              <div className="mb-7 flex size-12 items-center justify-center rounded-xl bg-red-50 text-nim-red">
                <KeyRound className="size-6" />
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Connexion opérateur
              </h2>
              <p className="mt-2 text-sm leading-6 text-slate-500">
                Saisissez la clé remise par votre responsable de production.
              </p>
              <form className="mt-7 space-y-5" onSubmit={submit}>
                <div className="space-y-2">
                  <Label htmlFor="tablet-connection-key">Clé de connexion</Label>
                  <div className="relative">
                    <Input
                      id="tablet-connection-key"
                      type={showKey ? "text" : "password"}
                      autoComplete="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      required
                      value={connectionKey}
                      onChange={(event) => setConnectionKey(event.target.value)}
                      className="h-14 pr-12 font-mono text-base tracking-wide"
                      placeholder="NIM-••••••-••••••••"
                      aria-describedby="tablet-key-help"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-2 top-1/2 size-10 -translate-y-1/2"
                      aria-label={showKey ? "Masquer la clé" : "Afficher la clé"}
                      aria-pressed={showKey}
                      onClick={() => setShowKey((visible) => !visible)}
                    >
                      {showKey ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                    </Button>
                  </div>
                  <p id="tablet-key-help" className="text-xs text-slate-400">
                    La clé est sensible à sa valeur complète.
                  </p>
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
                      <KeyRound className="size-5" />
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
