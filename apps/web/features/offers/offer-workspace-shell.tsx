"use client";

import { useQuery } from "@tanstack/react-query";
import { useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Skeleton } from "@/components/ui/skeleton";
import { getOfferRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import { OfferStatusBadge } from "./offer-ui";
import { visibleOfferWorkspaceNavigation } from "./offer-workspace-navigation";

export function OfferWorkspaceShell({
  offerId,
  children,
}: {
  offerId: string;
  children: React.ReactNode;
}): React.ReactNode {
  const pathname = usePathname();
  const { user } = useAuth();
  const workspaceRef = useRef<HTMLDivElement>(null);
  const stickyHeaderRef = useRef<HTMLDivElement>(null);
  const lastWorkspacePath = useRef(pathname);
  const [previousTabPath, setPreviousTabPath] = useState<string | null>(null);
  const offerQuery = useQuery({
    queryKey: ["offer", offerId],
    queryFn: () => getOfferRequest(offerId),
    retry: false,
  });

  const base = `/offers/${offerId}`;
  const workspaceNavigation = visibleOfferWorkspaceNavigation(user?.role);
  const previousWorkspaceTab = previousTabPath === base
    ? workspaceNavigation.find((item) => item.key === "overview")
    : workspaceNavigation
        .filter((item) => item.suffix !== "")
        .sort((left, right) => right.suffix.length - left.suffix.length)
        .find((item) => previousTabPath === `${base}${item.suffix}` || previousTabPath?.startsWith(`${base}${item.suffix}/`));
  const returnLabel = previousWorkspaceTab
    ? `Retour à ${previousWorkspaceTab.label}`
    : "Retour aux affaires";

  useLayoutEffect(() => {
    if (!pathname) return;
    const priorPath = lastWorkspacePath.current;
    if (priorPath && priorPath !== pathname) {
      if (priorPath === base || priorPath.startsWith(`${base}/`)) {
        setPreviousTabPath(priorPath);
      } else {
        setPreviousTabPath(null);
      }
    }
    lastWorkspacePath.current = pathname;
  }, [base, pathname]);

  useLayoutEffect(() => {
    const workspace = workspaceRef.current;
    const stickyHeader = stickyHeaderRef.current;
    if (!workspace || !stickyHeader) return;

    const updateHeight = () => {
      workspace.style.setProperty(
        "--nim-offer-workspace-header-height",
        `${stickyHeader.getBoundingClientRect().height}px`,
      );
    };

    updateHeight();
    const observer = new ResizeObserver(updateHeight);
    observer.observe(stickyHeader);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={workspaceRef} className="space-y-4 [--nim-offer-workspace-header-height:176px]">
      <div ref={stickyHeaderRef} className="sticky top-[76px] z-30 rounded-xl border border-slate-200 bg-white/95 shadow-panel backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="px-5 py-3 lg:px-6">
          {offerQuery.isLoading ? (
            <div className="space-y-2">
              <Skeleton className="h-7 w-80" />
              <Skeleton className="h-4 w-52" />
            </div>
          ) : offerQuery.data?.offer ? (
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link href={previousWorkspaceTab ? previousTabPath ?? base : "/offers"} className="mb-1 inline-flex text-xs font-medium text-slate-400 transition-colors hover:text-nim-red">← {returnLabel}</Link>
                <div className="flex flex-wrap items-center gap-2">
                  <h1 className="text-2xl font-semibold tracking-tight text-slate-950 dark:text-slate-100">
                    <span>{offerQuery.data.offer.revision} · </span>
                    {offerQuery.data.offer.reference} — {offerQuery.data.offer.name}
                  </h1>
                  <OfferStatusBadge status={offerQuery.data.offer.status} />
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500">
                  <span>Affaire</span>
                  {offerQuery.data.offer.clientName ? (
                    <span>{offerQuery.data.offer.clientName}</span>
                  ) : null}
                  {offerQuery.data.offer.site ? <span>{offerQuery.data.offer.site}</span> : null}
                </div>
              </div>
              {offerQuery.data.offer.status === "ARCHIVED" ? (
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  Affaire archivée — consultation uniquement
                </div>
              ) : null}
            </div>
          ) : (
            <div>
              <p className="font-semibold text-red-700">Affaire introuvable</p>
            </div>
          )}
        </div>
        <nav
          className="flex overflow-x-auto border-t border-slate-200 px-3 dark:border-slate-800"
          aria-label="Navigation de l’affaire"
        >
          {workspaceNavigation
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
                  onClick={(event) => {
                    if (
                      event.defaultPrevented ||
                      event.button !== 0 ||
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      pathname === href ||
                      !(pathname === base || pathname.startsWith(`${base}/`))
                    ) {
                      return;
                    }
                    setPreviousTabPath(pathname);
                    lastWorkspacePath.current = href;
                  }}
                  aria-current={active ? "page" : undefined}
                  className={`relative flex min-w-max items-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors ${active ? "text-nim-red" : "text-slate-500 hover:text-slate-900 dark:hover:text-slate-100"}`}
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
