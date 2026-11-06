"use client";

import type { AuthenticatedUser, UserRole } from "@nim/types";
import { cn } from "@nim/ui";
import { LogOut, Menu } from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { roleLabels } from "@/components/ui/role-badge";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { useAuth } from "@/features/auth/auth-provider";
import { visibleOfferWorkspaceNavigation } from "@/features/offers/offer-workspace-navigation";
import { NimLogo } from "../brand/nim-logo";
import { visibleNavigationItems } from "./navigation-config";

function initials(displayName: string): string {
  return displayName
    .split(" ")
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();
}

function NavigationLinks({
  pathname,
  role,
  onNavigate,
}: {
  pathname: string;
  role?: UserRole;
  onNavigate: () => void;
}): React.ReactNode {
  const items = visibleNavigationItems(role);
  const main = items.filter((item) => item.section === "main");
  const admin = items.filter((item) => item.section === "admin");
  const offerMatch = pathname.match(/^\/offers\/([^/]+)/);
  const offerId = offerMatch?.[1];
  const offerBase = offerId ? `/offers/${offerId}` : null;
  const offerTabs = offerBase ? visibleOfferWorkspaceNavigation(role) : [];

  const renderItems = (group: typeof items): React.ReactNode =>
    group.map(({ label, href, icon: Icon }) => {
      const normalizedHref = href.split("?")[0] ?? href;
      const active =
        normalizedHref === "/offers"
          ? pathname === "/offers" || pathname.startsWith("/offers/")
          : pathname === normalizedHref || pathname.startsWith(`${normalizedHref}/`);
      const isOfferItem = normalizedHref === "/offers";
      return (
        <div key={`${label}-${href}`} className="space-y-1">
          <Link
            href={href}
            onClick={onNavigate}
            aria-current={active ? "page" : undefined}
            className={cn(
              "group relative flex min-h-10 items-center gap-3 rounded-md px-3 text-sm text-slate-400 transition-colors hover:bg-white/[0.07] hover:text-white",
              active && "bg-nim-red font-semibold text-white shadow-sm hover:bg-nim-red/90",
            )}
          >
            <Icon
              className={cn(
                "size-[17px] shrink-0 transition-colors",
                active ? "text-white" : "text-slate-500 group-hover:text-white",
              )}
            />
            <span>{label}</span>
          </Link>
          {isOfferItem && offerBase ? (
            <div className="ml-5 space-y-0.5 border-l border-white/[0.12] py-1 pl-2">
              <p className="px-2 pb-1 pt-0.5 text-[9px] font-semibold uppercase tracking-[0.16em] text-slate-600">
                Espace de l’affaire
              </p>
              {offerTabs.map(({ key, label: tabLabel, icon: TabIcon, suffix }) => {
                const tabHref = `${offerBase}${suffix}`;
                const tabActive = key === "overview"
                  ? pathname === offerBase
                  : pathname === tabHref || pathname.startsWith(`${tabHref}/`);
                return (
                  <Link
                    key={key}
                    href={tabHref}
                    onClick={onNavigate}
                    aria-current={tabActive ? "page" : undefined}
                    className={cn(
                      "flex min-h-9 items-center gap-2 rounded-md px-2 text-xs transition-colors hover:bg-white/[0.07] hover:text-white",
                      tabActive ? "bg-white/[0.1] font-semibold text-white" : "text-slate-400",
                    )}
                  >
                    <TabIcon
                      className={cn(
                        "size-3.5 shrink-0",
                        tabActive ? "text-nim-red" : "text-slate-500",
                      )}
                    />
                    <span className="truncate">{tabLabel}</span>
                  </Link>
                );
              })}
            </div>
          ) : null}
        </div>
      );
    });

  return (
    <nav
      className="min-h-0 flex-1 space-y-7 overflow-y-auto overscroll-y-contain px-3 py-6 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      aria-label="Navigation principale"
    >
      <div className="space-y-1">{renderItems(main)}</div>
      {admin.length ? (
        <div>
          <p className="mb-2 px-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-slate-600">
            Administration
          </p>
          <div className="space-y-1">{renderItems(admin)}</div>
        </div>
      ) : null}
    </nav>
  );
}

function SidebarPanel({
  pathname,
  user,
  onNavigate,
  onLogout,
}: {
  pathname: string;
  user: AuthenticatedUser;
  onNavigate: () => void;
  onLogout: () => void;
}): React.ReactNode {
  return (
    <aside className="flex h-dvh min-h-0 w-[248px] flex-col bg-nim-dark text-white">
      <div className="flex h-[76px] items-center border-b border-white/[0.08] px-6">
        <NimLogo compact invert />
      </div>
      <NavigationLinks pathname={pathname} role={user.role} onNavigate={onNavigate} />
      <div className="border-t border-white/[0.08] p-3">
        <div className="flex items-center gap-2.5 rounded-lg bg-white/[0.05] p-2.5">
          <Avatar className="size-8">
            <AvatarFallback className="bg-nim-red text-[11px] font-bold text-white">
              {initials(user.displayName)}
            </AvatarFallback>
          </Avatar>
          <div className="min-w-0 flex-1">
            <p className="truncate text-xs font-semibold text-white">{user.displayName}</p>
            <p className="truncate text-[11px] text-slate-500">{roleLabels[user.role]}</p>
          </div>
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                aria-label="Se déconnecter"
                onClick={onLogout}
                className="min-h-11 min-w-11 rounded-md p-1.5 text-slate-500 transition-colors hover:bg-white/10 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80"
              >
                <LogOut className="size-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent>Se déconnecter</TooltipContent>
          </Tooltip>
        </div>
      </div>
    </aside>
  );
}

export function AppSidebar(): React.ReactNode {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  if (!user) return null;
  const handleLogout = async (): Promise<void> => {
    await logout();
    router.replace("/login");
  };
  return (
    <TooltipProvider>
      <>
        <div className="hidden w-[248px] shrink-0 lg:block">
          <div className="fixed inset-y-0 left-0 z-30 h-dvh">
            <SidebarPanel
              pathname={pathname}
              user={user}
              onNavigate={() => setOpen(false)}
              onLogout={() => void handleLogout()}
            />
          </div>
        </div>
        <div className="fixed left-4 top-4 z-40 lg:hidden">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="default" size="icon" aria-label="Ouvrir le menu">
                <Menu className="size-5" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[248px] border-none bg-nim-dark p-0 text-white">
              <SheetTitle className="sr-only">Navigation principale</SheetTitle>
              <SidebarPanel
                pathname={pathname}
                user={user}
                onNavigate={() => setOpen(false)}
                onLogout={() => void handleLogout()}
              />
            </SheetContent>
          </Sheet>
        </div>
      </>
    </TooltipProvider>
  );
}
