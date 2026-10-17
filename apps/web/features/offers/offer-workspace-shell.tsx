"use client";

import { useQuery } from "@tanstack/react-query";
import {
  ArrowRightLeft,
  Box,
  Factory,
  History,
  LayoutDashboard,
  Scissors,
  ShieldCheck,
} from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getOfferRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { OfferStatusBadge } from "./offer-ui";

const tabs = [
  { key: "overview", label: "Vue générale", icon: LayoutDashboard, suffix: "", roles: undefined },
  { key: "pieces", label: "Pièces", icon: Box, suffix: "/pieces", roles: undefined },
  {
    key: "faconnage",
    label: "Façonnage",
    icon: Scissors,
    suffix: "/faconnage",
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
  },
  { key: "bars", label: "Barres", icon: Box, suffix: "/bars", roles: undefined },
  {
    key: "bar-assignments",
    label: "Affectations",
    icon: ArrowRightLeft,
    suffix: "/bar-assignments",
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
  },
  {
    key: "production",
    label: "Production",
    icon: Factory,
    suffix: "/production",
    roles: undefined,
  },
  {
    key: "quality",
    label: "Qualité",
    icon: ShieldCheck,
    suffix: "/quality",
    roles: ["ADMIN", "PRODUCTION_MANAGER", "QUALITY_CONTROLLER"],
  },
  {
    key: "history",
    label: "Historique",
    icon: History,
    suffix: "/history",
    roles: ["ADMIN", "PRODUCTION_MANAGER"],
  },
] as const;

export function OfferWorkspaceShell({
  offerId,
  children,
}: {
  offerId: string;
  children: React.ReactNode;
}): React.ReactNode {
  const pathname = usePathname();
  const { user } = useAuth();
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId),
    retry: false,
  });

  const base = `/offers/${offerId}`;
  return (
    <div className="space-y-5">
      <div className="sticky top-[76px] z-20 rounded-xl border border-slate-200 bg-white/95 shadow-panel backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="px-5 py-4 lg:px-6">
          {offerQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-80" />
              <Skeleton className="h-4 w-52" />
            </div>
          ) : offerQuery.data?.offer ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link href="/offers" className="mb-2 inline-flex text-xs font-medium text-slate-400 transition-colors hover:text-nim-red">← Retour aux offres</Link>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                    {offerQuery.data.offer.reference} — {offerQuery.data.offer.name}
                  </h1>
                  <OfferStatusBadge status={offerQuery.data.offer.status} />
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span>Indice {offerQuery.data.offer.revision}</span>
                  {offerQuery.data.offer.clientName ? (
                    <span>{offerQuery.data.offer.clientName}</span>
                  ) : null}
                  {offerQuery.data.offer.site ? <span>{offerQuery.data.offer.site}</span> : null}
                </div>
              </div>
              {offerQuery.data.offer.status === "ARCHIVED" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  Offre archivée — consultation uniquement
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="font-semibold text-red-700">Offre introuvable</p>
            </div>
          )}
        </div>
        <nav
          className="flex overflow-x-auto border-t border-slate-200 px-3 dark:border-slate-800"
          aria-label="Navigation de l’offre"
        >
          {tabs
            .filter(
              (tab) => !tab.roles || (user && (tab.roles as readonly string[]).includes(user.role)),
            )
            .map(({ key, label, icon: Icon, suffix }) => {
              const href = `${base}${suffix}`;
              const active =
                key === "overview"
                  ? pathname === base
                  : pathname === href || pathname.startsWith(`${href}/`);
              return (
                <Link
                  key={key}
                  href={href}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-w-max items-center gap-2 px-4 py-3 text-sm font-medium transition-colors ${active ? "text-nim-red" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"}`}
                >
                  <Icon className="size-4" />
                  {label}
                  {active ? (
                    <span className="absolute inset-x-3 bottom-0 h-0.5 bg-nim-red" />
                  ) : null}
                </Link>
              );
            })}
        </nav>
      </div>
      {children}
    </div>
  );
}
