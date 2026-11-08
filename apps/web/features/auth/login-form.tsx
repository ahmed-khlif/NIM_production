"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { loginSchema, type LoginInput } from "@nim/validation";
import {
  AlertCircle,
  ArrowRight,
  Eye,
  EyeOff,
  LockKeyhole,
  Loader2,
  UserRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { NimLogo } from "@/components/brand/nim-logo";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  ApiError,
  getCurrentTabletOperatorRequest,
  loginRequest,
  operatorTabletLoginRequest,
} from "./auth-client";
import { useAuth } from "./auth-provider";

export function LoginForm(): React.ReactNode {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { refresh } = useAuth();
  const [showPassword, setShowPassword] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: "", password: "" },
  });

  const onSubmit = async (values: LoginInput): Promise<void> => {
    setSubmitError(null);
    try {
      const result = await loginRequest(values);
      if (result.user.role === "OPERATOR") {
        // The regular sign-in creates the application session. Create and verify
        // the dedicated tablet session as part of the same visible login flow.
        await operatorTabletLoginRequest(values);
        await queryClient.cancelQueries({ queryKey: ["tablet", "operator"] });
        const tabletSession = await getCurrentTabletOperatorRequest();
        if (tabletSession.operator.id !== result.user.id) {
          throw new Error(
            "La session de production de l’opérateur n’a pas pu être confirmée. Réessayez.",
          );
        }
        queryClient.setQueryData(["tablet", "operator"], tabletSession);
      }
      await refresh();
      toast.success(`Bienvenue, ${result.user.displayName}`);
      const destination =
        result.user.role === "QUALITY_CONTROLLER"
          ? "/quality"
          : result.user.role === "OPERATOR"
            ? "/production/tablet"
            : "/dashboard";
      if (result.user.role === "OPERATOR") router.replace(destination);
      else router.push(destination);
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error && error.message
            ? error.message
            : "Impossible de se connecter pour le moment.";
      setSubmitError(message);
      toast.error(message);
    }
  };

  return (
    <main className="grid min-h-screen bg-background lg:grid-cols-[minmax(0,1.05fr)_minmax(440px,0.95fr)]">
      <section className="pointer-events-none relative hidden min-w-0 overflow-hidden bg-nim-dark lg:block">
        <Image
          src="/assets/illustrations/login-security.png"
          alt="Illustration industrielle NIM"
          fill
          sizes="(min-width: 1024px) 52vw, 100vw"
          className="pointer-events-none object-cover opacity-55"
          priority
        />
        <div className="pointer-events-none absolute inset-0 bg-nim-dark/65" />
        <div
          aria-hidden="true"
          className="nim-login-glow pointer-events-none absolute right-[12%] top-[14%] size-72 rounded-full bg-[radial-gradient(circle,rgba(225,6,0,0.18),transparent_70%)]"
        />
        <div className="absolute left-12 top-[44%] flex items-center gap-2 xl:left-20">
          <span className="h-px w-12 bg-white/20" />
          <span className="nim-login-signal size-1.5 rounded-full bg-nim-red shadow-[0_0_12px_rgba(225,6,0,0.7)]" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-12 xl:p-20">
          <div className="nim-login-enter"><NimLogo invert /></div>
          <p className="nim-login-enter nim-login-enter-delay-1 mt-10 max-w-lg text-3xl font-semibold leading-tight tracking-tight text-white xl:text-5xl">
            La production, avec la précision qui fait notre industrie.
          </p>
          <p className="nim-login-enter nim-login-enter-delay-2 mt-5 max-w-md text-sm leading-6 text-slate-300">
            Une vue claire sur les opérations, les machines et la traçabilité de chaque pièce.
          </p>
          <div className="nim-login-enter nim-login-enter-delay-3 mt-10 flex items-center gap-2 text-xs text-slate-400">
            <span className="size-1.5 rounded-full bg-nim-red" />
            Production · Planification · Traçabilité
          </div>
        </div>
      </section>
      <section className="relative z-10 flex min-w-0 items-center justify-center px-5 py-10 sm:px-10">
        <div className="w-full max-w-[390px]">
          <div className="nim-login-enter mb-12 lg:hidden">
            <NimLogo />
          </div>
          <div className="nim-login-enter mb-7">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-nim-red">
              Espace sécurisé
            </p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950">Connexion</h1>
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Accédez au suivi de production NIM.
            </p>
          </div>
          <Card className="nim-login-enter nim-login-enter-delay-1 border-slate-200 shadow-sm transition-[box-shadow,transform] duration-200 hover:-translate-y-0.5 hover:shadow-md motion-reduce:transform-none">
            <CardContent className="p-5 sm:p-6">
              <form
                className="space-y-5"
                onSubmit={(event) => void handleSubmit(onSubmit)(event)}
                method="post"
                action="/login"
                noValidate
              >
                <div className="space-y-2">
                  <Label htmlFor="username">Identifiant</Label>
                  <div className="group relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-nim-red" />
                    <Input
                      id="username"
                      className="h-11 pl-10"
                      autoComplete="username"
                      autoFocus
                      placeholder="Votre identifiant"
                      aria-invalid={errors.username ? "true" : undefined}
                      {...register("username")}
                    />
                  </div>
                  {errors.username ? (
                    <p className="text-xs text-nim-red" role="alert">
                      {errors.username.message}
                    </p>
                  ) : null}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Mot de passe</Label>
                  <div className="group relative">
                    <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-nim-red" />
                    <Input
                      id="password"
                      className="h-11 pl-10 pr-12"
                      type={showPassword ? "text" : "password"}
                      autoComplete="current-password"
                      placeholder="Votre mot de passe"
                      aria-invalid={errors.password ? "true" : undefined}
                      {...register("password")}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="absolute right-1 top-1/2 size-9 -translate-y-1/2 text-slate-500 hover:text-slate-900"
                      onClick={() => setShowPassword((visible) => !visible)}
                      aria-label={
                        showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"
                      }
                      aria-pressed={showPassword}
                    >
                      {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                    </Button>
                  </div>
                  {errors.password ? (
                    <p className="text-xs text-nim-red" role="alert">
                      {errors.password.message}
                    </p>
                  ) : null}
                </div>
                {submitError ? (
                  <p
                    className="flex items-start gap-2 rounded-md bg-red-50 px-3 py-2 text-sm text-red-700"
                    role="alert"
                    aria-live="assertive"
                  >
                    <AlertCircle className="mt-0.5 size-4 shrink-0" />
                    {submitError}
                  </p>
                ) : null}
                <Button
                  className="h-11 w-full transition-transform duration-150 hover:-translate-y-0.5 active:translate-y-0 motion-reduce:transform-none"
                  type="submit"
                  disabled={isSubmitting}
                  aria-busy={isSubmitting}
                >
                  {isSubmitting ? (
                    <>
                      <Loader2 className="size-4 animate-spin" />
                      Connexion...
                    </>
                  ) : (
                    <>
                      Se connecter
                      <ArrowRight className="size-4" />
                    </>
                  )}
                </Button>
              </form>
            </CardContent>
          </Card>
          <div className="nim-login-enter nim-login-enter-delay-2 mt-6 space-y-2 text-center text-xs text-slate-400">
            <p>Mot de passe oublié ? Contactez votre administrateur NIM.</p>
            <Link
              href="/production/tablet"
              className="inline-flex font-semibold text-slate-600 transition-colors hover:text-nim-red"
            >
              Accès opérateur tablette →
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
