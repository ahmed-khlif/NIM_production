"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useAuth } from "@/features/auth/auth-provider";
import { Search, X } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export function GlobalSearchForm(): React.ReactNode {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const focusResultsSearch = (): boolean => {
    if (pathname !== "/search") return false;
    const resultsInput = document.getElementById("global-search-page-input");
    if (!(resultsInput instanceof HTMLInputElement)) return false;
    resultsInput.focus();
    resultsInput.scrollIntoView?.({ block: "center", behavior: "smooth" });
    return true;
  };

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (pathname === "/search") {
          const resultsInput = document.getElementById("global-search-page-input");
          if (resultsInput instanceof HTMLInputElement) {
            resultsInput.focus();
            resultsInput.scrollIntoView?.({ block: "center", behavior: "smooth" });
            return;
          }
        }
        setOpen(true);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent): void => {
      if (!containerRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);

  const submitSearch = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const query = search.trim();
    if (!query) {
      inputRef.current?.focus();
      return;
    }
    setSearch("");
    setOpen(false);
    router.push(`/search?q=${encodeURIComponent(query.slice(0, 80))}`);
  };

  if (!user) return null;

  return (
    <div className="relative w-fit" ref={containerRef}>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={open ? "bg-slate-100 text-slate-950 dark:bg-slate-800 dark:text-white" : "text-slate-500"}
        aria-label="Ouvrir la recherche globale"
        aria-expanded={open}
        aria-controls="global-search-panel"
        onClick={() => {
          if (focusResultsSearch()) return;
          setOpen((current) => !current);
        }}
      >
        <Search className="size-[18px]" />
      </Button>
      {open ? (
        <form id="global-search-panel" className="absolute left-0 top-full z-50 mt-3 w-[min(52rem,calc(100vw-5rem))] rounded-2xl border border-slate-200 bg-white p-4 shadow-2xl shadow-slate-950/15 ring-1 ring-black/5 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/40 dark:ring-white/10 sm:p-5" onSubmit={submitSearch} role="search">
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <p className="text-sm font-semibold text-slate-950 dark:text-slate-50">Recherche globale</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Trouvez rapidement une Affaire, une pièce, une barre ou une machine.</p>
            </div>
            <Button type="button" variant="ghost" size="icon" className="-mr-1 -mt-1 size-9 shrink-0 text-slate-500" aria-label="Fermer la recherche" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <Input
                ref={inputRef}
                className="h-12 border-slate-200 bg-slate-50 pl-10 text-base shadow-none placeholder:text-slate-400 focus-visible:border-nim-red focus-visible:ring-nim-red/20 dark:border-slate-700 dark:bg-slate-900"
                placeholder="Référence, profil, nom d’affaire, machine…"
                aria-label="Rechercher dans toute l’application"
                type="search"
                value={search}
                maxLength={80}
                onChange={(event) => setSearch(event.target.value)}
              />
            </div>
            <Button type="submit" className="h-12 shrink-0 px-5 sm:min-w-40" aria-label="Lancer la recherche globale" disabled={!search.trim()}>
              <Search className="size-4" />
              Rechercher
            </Button>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-slate-500 dark:text-slate-400">
            <span>Recherche dans</span>
            {['Affaires', 'Pièces', 'Barres', 'Machines'].map((label) => <span key={label} className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 dark:border-slate-700 dark:bg-slate-900">{label}</span>)}
            <span className="ml-auto hidden sm:inline">Entrée pour rechercher · Échap pour fermer</span>
          </div>
        </form>
      ) : null}
    </div>
  );
}
