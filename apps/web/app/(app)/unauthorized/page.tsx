import { ArrowLeft, Home, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function UnauthorizedPage(): React.ReactNode {
  return <main className="flex min-h-[50vh] items-center justify-center p-6"><div className="w-full max-w-md rounded-xl border border-amber-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-amber-50 text-amber-700"><ShieldAlert className="size-5" /></div><p className="mt-4 text-sm font-semibold text-amber-700">Accès restreint</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">Vous n’avez pas cette permission</h1><p className="mt-2 text-sm leading-6 text-slate-500">Votre rôle est bien authentifié, mais cette action ou cette vue est réservée à un autre rôle métier.</p><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button asChild><Link href="/dashboard"><Home className="size-4" />Tableau de bord</Link></Button><Button asChild variant="outline"><Link href="/login"><ArrowLeft className="size-4" />Changer de compte</Link></Button></div></div></main>;
}
