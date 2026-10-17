"use client";

import { AlertTriangle, Home, RefreshCw } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }): React.ReactNode {
  return <main className="flex min-h-[50vh] items-center justify-center p-6"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm" role="alert"><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-red-50 text-nim-red"><AlertTriangle className="size-5" /></div><p className="mt-4 text-sm font-semibold text-nim-red">Erreur inattendue</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">Impossible de charger cette vue</h1><p className="mt-2 text-sm leading-6 text-slate-500">Votre session et les données persistées restent protégées. Réessayez ou revenez à une vue stable.</p>{error.digest ? <p className="mt-3 text-[11px] text-slate-400">Référence incident : {error.digest}</p> : null}<div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button type="button" onClick={reset}><RefreshCw className="size-4" />Réessayer</Button><Button asChild variant="outline"><Link href="/dashboard"><Home className="size-4" />Tableau de bord</Link></Button></div></div></main>;
}
