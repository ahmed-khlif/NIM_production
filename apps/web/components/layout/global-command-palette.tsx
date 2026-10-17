"use client";

import { Bell, Search, UserRound } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/features/auth/auth-provider";
import { visibleNavigationItems } from "./navigation-config";

export function GlobalCommandPalette(): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const items = useMemo(() => {
    const primary = visibleNavigationItems(user?.role);
    return [
      ...primary,
      { label: "Activité", href: "/notifications", icon: Bell, section: "main" as const },
      { label: "Profil", href: "/profile", icon: UserRound, section: "admin" as const },
    ];
  }, [user]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setOpen((current) => !current);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const navigate = (href: string): void => {
    setOpen(false);
    if (href !== pathname) router.push(href);
  };

  return (
    <>
      <Button
        type="button"
        variant="outline"
        className="hidden h-10 shrink-0 gap-2 border-slate-200 bg-white px-3 text-slate-500 shadow-none hover:bg-slate-50 hover:text-slate-800 dark:border-slate-800 dark:bg-slate-950 dark:hover:bg-slate-900 dark:hover:text-slate-100 sm:flex"
        onClick={() => setOpen(true)}
        aria-label="Ouvrir la navigation rapide"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <Search className="size-4" />
        <span className="hidden lg:inline">Navigation rapide</span>
        <kbd className="ml-1 hidden rounded border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-[10px] font-medium text-slate-400 dark:border-slate-700 dark:bg-slate-900 lg:inline">⌘K</kbd>
      </Button>
      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Aller rapidement à une page..." />
        <CommandList>
          <CommandEmpty>Aucune destination trouvée.</CommandEmpty>
          <CommandGroup heading="Navigation">
            {items.map(({ label, href, icon: Icon }) => {
              const normalizedHref = href.split("?")[0] ?? href;
              const active = pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`);
              return (
                <CommandItem key={`${label}-${href}`} value={label} onSelect={() => navigate(href)}>
                  <Icon />
                  <span>{label}</span>
                  {active ? <span className="ml-auto text-xs text-slate-400">Actuelle</span> : null}
                </CommandItem>
              );
            })}
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}
