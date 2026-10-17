import { ArrowLeft, Home, SearchX } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function NotFound(): React.ReactNode {
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6"><div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-8 text-center shadow-sm"><div className="mx-auto flex size-11 items-center justify-center rounded-full bg-slate-100 text-slate-600"><SearchX className="size-5" /></div><p className="mt-4 text-sm font-semibold text-nim-red">Page introuvable</p><h1 className="mt-2 text-2xl font-semibold text-slate-950">Cette vue n’existe pas</h1><p className="mt-2 text-sm leading-6 text-slate-500">Le lien a peut-être changé ou la ressource n’est plus disponible.</p><div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row"><Button asChild><Link href="/dashboard"><Home className="size-4" />Tableau de bord</Link></Button><Button asChild variant="outline"><Link href="/login"><ArrowLeft className="size-4" />Connexion</Link></Button></div></div></main>;
}
