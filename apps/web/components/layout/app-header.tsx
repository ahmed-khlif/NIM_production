"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  Bell,
  CheckCheck,
  ChevronDown,
  LogOut,
  RefreshCw,
  Settings,
  UserRound,
  X,
} from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/auth-provider";
import {
  getNotificationsRequest,
  getSettingsRequest,
  markAllNotificationsReadRequest,
  markNotificationReadRequest,
} from "@/features/auth/auth-client";
import { GlobalSearchForm } from "./global-search-form";
import { ThemeToggle } from "@/components/theme/theme-toggle";
import { roleLabels } from "@/components/ui/role-badge";
import { ReturnLink, useReturnNavigation } from "@/components/navigation/return-navigation";

function parentPage(pathname: string): { href: string; label: string } {
  const segments = pathname.split("/").filter(Boolean);
  if (segments[0] === "offers" && segments.length >= 2) {
    if (segments.length === 2) return { href: "/offers", label: "aux affaires" };
    if (segments.length === 3) return { href: `/offers/${segments[1]}`, label: "l’affaire" };
    const parent = `/${segments.slice(0, -1).join("/")}`;
    return { href: parent, label: "à la page précédente" };
  }
  if (segments[0] === "machines" && segments.length > 1)
    return { href: "/machines", label: "aux machines" };
  if (segments[0] === "clients" && segments.length > 1)
    return { href: "/clients", label: "aux clients" };
  if (segments[0] === "pieces" && segments.length > 1)
    return { href: "/pieces", label: "aux pièces" };
  if (segments[0] === "settings" && segments.length > 1)
    return { href: "/settings", label: "aux paramètres" };
  if (segments[0] === "production" && segments[1] === "tablet")
    return { href: "/production/tablet", label: "à la file de production" };
  return { href: "/dashboard", label: "au tableau de bord" };
}

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
  const pathname = usePathname() ?? "/dashboard";
  const { hasInAppHistory } = useReturnNavigation();
  const queryClient = useQueryClient();
  const { user, logout } = useAuth();
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettingsRequest,
    enabled: Boolean(user),
    retry: false,
    staleTime: 60_000,
  });
  const notificationBadgeEnabled = settingsQuery.data?.settings.notificationsEnabled ?? true;
  const notificationsQuery = useQuery({
    queryKey: ["notifications", "latest"],
    queryFn: () => getNotificationsRequest({ page: 1, pageSize: 5 }),
    enabled: Boolean(user),
    retry: false,
    staleTime: 30_000,
    refetchInterval: 20_000,
  });
  const latestNotifications = notificationsQuery.data?.notifications ?? [];
  const fallback = parentPage(pathname);
  const unreadCount = notificationsQuery.data?.unreadCount ?? 0;
  const markOneRead = useMutation({
    mutationFn: markNotificationReadRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const markAllRead = useMutation({
    mutationFn: markAllNotificationsReadRequest,
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  if (!user) return null;

  const handleLogout = async (): Promise<void> => {
    await logout();
    router.replace("/login");
  };
  return (
    <header className="sticky top-0 z-40 flex min-h-[76px] items-center justify-between gap-4 border-b border-slate-200/80 bg-white/95 px-5 backdrop-blur dark:border-slate-800/80 dark:bg-slate-950/95 lg:px-8">
      <div className="flex w-full min-w-0 max-w-xl items-center gap-2 pl-12 lg:pl-0">
        {pathname !== "/dashboard" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                asChild
                variant="ghost"
                size="icon"
                className="min-h-11 min-w-11 shrink-0 text-slate-500"
              >
                <ReturnLink
                  href={fallback.href}
                  aria-label={`Retour ${hasInAppHistory ? "à la page précédente" : fallback.label}`}
                >
                  <ArrowLeft className="size-4" />
                </ReturnLink>
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {hasInAppHistory ? "Retour à la page précédente" : `Retour ${fallback.label}`}
            </TooltipContent>
          </Tooltip>
        ) : null}
        <GlobalSearchForm />
      </div>
      <div className="relative flex shrink-0 items-center gap-1.5">
        <ThemeToggle />
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="relative min-h-11 min-w-11 text-slate-500"
              aria-label={
                unreadCount
                  ? `Ouvrir les notifications, ${unreadCount} non lues`
                  : "Ouvrir les notifications"
              }
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell className="size-[18px]" />
              {notificationBadgeEnabled && unreadCount > 0 ? (
                <span
                  className="absolute -right-1 -top-1 flex min-h-5 min-w-5 items-center justify-center rounded-full bg-nim-red px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white dark:ring-slate-950"
                  aria-label={`${unreadCount} notifications non lues`}
                >
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              ) : null}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Notifications non lues</TooltipContent>
        </Tooltip>
        {notificationsOpen ? (
          <>
            <button
              type="button"
              tabIndex={-1}
              aria-label="Fermer les notifications"
              className="fixed inset-0 z-40 bg-slate-950/20 sm:hidden"
              onClick={() => setNotificationsOpen(false)}
            />
            <section
              className="fixed left-2 right-2 top-[calc(76px_+_env(safe-area-inset-top))] z-50 flex max-h-[calc(100dvh_-_5.5rem_-_env(safe-area-inset-top))] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl dark:border-slate-800 dark:bg-slate-950 sm:absolute sm:left-auto sm:right-14 sm:top-12 sm:max-h-[min(30rem,75vh)] sm:w-[min(24rem,calc(100vw-1rem))]"
              aria-label="Notifications"
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3 dark:border-slate-800">
                <div>
                  <p className="text-sm font-semibold">Notifications</p>
                  <p className="text-xs text-slate-500">
                    {unreadCount} non lue{unreadCount === 1 ? "" : "s"}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="min-h-11 min-w-11"
                  aria-label="Fermer les notifications"
                  onClick={() => setNotificationsOpen(false)}
                >
                  <X className="size-4" />
                </Button>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2 sm:max-h-[min(24rem,65vh)] sm:flex-none">
                {notificationsQuery.isLoading ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">Chargement…</p>
                ) : null}
                {notificationsQuery.isError ? (
                  <div className="px-3 py-6 text-center">
                    <p className="text-sm text-red-600">
                      Impossible de charger l’activité récente.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void notificationsQuery.refetch()}
                      disabled={notificationsQuery.isFetching}
                    >
                      <RefreshCw className="size-4" />
                      Réessayer
                    </Button>
                  </div>
                ) : null}
                {!notificationsQuery.isLoading &&
                !notificationsQuery.isError &&
                latestNotifications.length === 0 ? (
                  <p className="px-3 py-6 text-center text-sm text-slate-500">
                    Vous êtes à jour. Les changements qui vous concernent apparaîtront ici.
                  </p>
                ) : null}
                {latestNotifications.map((item) => (
                  <button
                    type="button"
                    key={item.id}
                    onClick={() => {
                      setNotificationsOpen(false);
                      if (!item.readAt) markOneRead.mutate(item.id);
                      router.push(item.href);
                    }}
                    className={`flex min-h-16 w-full gap-3 rounded-lg px-3 py-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-nim-red hover:bg-slate-50 dark:hover:bg-slate-900 ${item.readAt ? "" : "bg-red-50/50 dark:bg-red-950/10"}`}
                  >
                    <span
                      className={`mt-0.5 size-9 shrink-0 rounded-full p-2 ${item.readAt ? "bg-slate-100 text-slate-500 dark:bg-slate-800" : "bg-red-50 text-nim-red dark:bg-red-950/40"}`}
                    >
                      <Bell className="size-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="min-w-0 flex-1 break-words text-sm font-semibold text-slate-800 dark:text-slate-100">
                          {item.title}
                        </span>
                        {!item.readAt ? (
                          <span
                            className="mt-1.5 size-2 shrink-0 rounded-full bg-nim-red"
                            aria-label="Non lue"
                          />
                        ) : null}
                      </span>
                      <span className="mt-0.5 block break-words text-xs text-slate-500">
                        {item.message}
                      </span>
                      <span className="mt-1 block break-words text-[11px] text-slate-400">
                        {new Intl.DateTimeFormat("fr-FR", {
                          dateStyle: "short",
                          timeStyle: "short",
                        }).format(new Date(item.createdAt))}
                        {item.actorName ? ` · ${item.actorName}` : ""}
                      </span>
                    </span>
                  </button>
                ))}
              </div>
              <div className="flex shrink-0 gap-1 border-t border-slate-100 p-2 dark:border-slate-800">
                <Button
                  variant="ghost"
                  className="min-h-11 min-w-0 flex-1 whitespace-normal px-2 text-xs sm:text-sm"
                  onClick={() => markAllRead.mutate()}
                  disabled={!unreadCount || markAllRead.isPending}
                >
                  <CheckCheck className="size-4" />
                  Tout lire
                </Button>
                <Button
                  variant="ghost"
                  className="min-h-11 min-w-0 flex-1 whitespace-normal px-2 text-xs text-nim-red sm:text-sm"
                  onClick={() => {
                    setNotificationsOpen(false);
                    router.push("/notifications");
                  }}
                >
                  Boîte complète
                </Button>
              </div>
            </section>
          </>
        ) : null}
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
