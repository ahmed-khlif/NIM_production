"use client";

import type { UserRole } from "@nim/types";
import { useQuery } from "@tanstack/react-query";
import { Bell, ChevronDown, LogOut, Search, Settings, UserRound, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/auth-provider";
import {
  getNotificationsRequest,
  getSettingsRequest,
} from "@/features/auth/auth-client";
import { GlobalCommandPalette } from "./global-command-palette";
import { ThemeToggle } from "@/components/theme/theme-toggle";

const roleLabels: Record<UserRole, string> = {
  ADMIN: "Administrateur",
  PRODUCTION_MANAGER: "Responsable production",
  OPERATOR: "Opérateur",
  QUALITY_CONTROLLER: "Contrôleur qualité",
};

function initials(displayName: string): string {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

export function AppHeader(): React.ReactNode {
  const router = useRouter();
  const { user, logout } = useAuth();
  const [search, setSearch] = useState("");
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettingsRequest,
    enabled: Boolean(user),
    retry: false,
    staleTime: 60_000,
  });
  const activityIndicatorEnabled = settingsQuery.data?.settings.notificationsEnabled ?? true;
  const notificationsQuery = useQuery({
    queryKey: ["notifications"],
    queryFn: getNotificationsRequest,
    enabled: Boolean(user) && activityIndicatorEnabled,
    retry: false,
    staleTime: 30_000,
  });
  const hasRecentActivity = (notificationsQuery.data?.notifications.length ?? 0) > 0;

  if (!user) return null;

  const canSearchOffers = user.role === "ADMIN" || user.role === "PRODUCTION_MANAGER";

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.replace("/login");
  };
  const handleSearch = (event: React.FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = search.trim();
    const base = "/offers";
    router.push(value ? `${base}?search=${encodeURIComponent(value)}` : base);
  };

  return (
    <header className="sticky top-0 z-30 flex min-h-[76px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/95 lg:px-8">
      <div className="w-full max-w-xl pl-12 lg:pl-0">
        {canSearchOffers ? (
          <form className="relative" onSubmit={handleSearch} role="search">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <Input
              className="h-10 border-transparent bg-slate-50 pl-9 pr-10 shadow-none focus:border-slate-200 dark:bg-slate-900 dark:focus:border-slate-700"
              placeholder="Offres..."
              aria-label="Rechercher dans les offres"
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search ? (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="absolute right-1 top-1/2 size-8 -translate-y-1/2 text-slate-400"
                onClick={() => setSearch("")}
                aria-label="Effacer la recherche d’offres"
              >
                <X className="size-4" />
              </Button>
            ) : null}
          </form>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1.5">
        <GlobalCommandPalette />
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative text-slate-500"
              aria-label="Ouvrir l’activité récente"
              onClick={() => router.push("/notifications")}
            >
              <Bell className="size-[18px]" />
              {activityIndicatorEnabled && hasRecentActivity ? (
                <span
                  className="absolute right-1 top-1 size-2 rounded-full bg-nim-red ring-2 ring-white dark:ring-slate-950"
                  aria-hidden="true"
                />
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Activité récente</TooltipContent>
        </Tooltip>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="ml-1 gap-2 px-2">
              <Avatar className="size-8">
                <AvatarFallback className="bg-nim-dark text-[11px] font-bold text-white">
                  {initials(user.displayName)}
                </AvatarFallback>
              </Avatar>
              <span className="hidden text-left xl:block">
                <span className="block text-xs font-semibold text-slate-800 dark:text-slate-100">
                  {user.displayName}
                </span>
                <span className="block text-[11px] text-slate-400">{roleLabels[user.role]}</span>
              </span>
              <ChevronDown className="hidden size-4 text-slate-400 sm:block" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Mon espace</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => router.push("/profile")}>
              <UserRound />
              Profil
            </DropdownMenuItem>
            <DropdownMenuItem onClick={() => router.push("/settings")}>
              <Settings />
              Paramètres
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-red-600" onClick={() => void handleLogout()}>
              <LogOut />
              Se déconnecter
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
