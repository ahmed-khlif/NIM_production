"use client";

import { AlertTriangle, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useAuth } from "./auth-provider";
import { useRouter } from "next/navigation";

export function ProtectedRoute({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  const router = useRouter();
  const { user, isLoading, authError, refresh } = useAuth();
  const [retrying, setRetrying] = useState(false);
  const hasRecoverableError = Boolean(!user && !isLoading && authError && authError.status !== 401);

  useEffect(() => {
    if (!isLoading && !user && !hasRecoverableError) router.replace("/login");
  }, [hasRecoverableError, isLoading, router, user]);

  if (hasRecoverableError) {
    const offline = authError?.code === "OFFLINE" || authError?.status === 0;
    const retry = async (): Promise<void> => {
      setRetrying(true);
      await refresh();
      setRetrying(false);
    };
    return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="alert"><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-700"><AlertTriangle className="size-5" /></div><h1 className="mt-4 text-xl font-semibold text-slate-950">Session indisponible</h1><p className="mt-2 text-sm leading-6 text-slate-500">{offline ? "NIM ne peut pas vérifier votre session hors connexion." : "NIM ne peut pas vérifier votre session pour le moment."} Réessayez lorsque le réseau ou l’API est disponible.</p><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button type="button" onClick={() => void retry()} disabled={retrying}>{retrying ? <RefreshCw className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}Réessayer</Button><Button asChild variant="outline"><Link href="/login">Retour à la connexion</Link></Button></div></div></main>;
  }

  if (isLoading || !user) return <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-sm space-y-3" role="status" aria-label="Vérification de votre session"><Skeleton className="mx-auto h-8 w-32" /><Skeleton className="h-24 w-full rounded-xl" /><p className="text-center text-xs text-slate-400">Vérification de votre session…</p></div></div>;
  return <>{children}</>;
}
