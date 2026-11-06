"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { ComponentProps, ReactNode } from "react";

type ReturnNavigationState = {
  hasInAppHistory: boolean;
  previousPath: string | null;
};

type RouteHistory = {
  paths: string[];
  index: number;
};

const ReturnNavigationContext = createContext<ReturnNavigationState>({
  hasInAppHistory: false,
  previousPath: null,
});

export function ReturnNavigationProvider({ children }: { children: ReactNode }): ReactNode {
  const pathname = usePathname();
  const history = useRef<RouteHistory | null>(null);
  const [navigation, setNavigation] = useState<ReturnNavigationState>({
    hasInAppHistory: false,
    previousPath: null,
  });

  useEffect(() => {
    if (!pathname) return;

    const currentHistory = history.current;
    if (!currentHistory) {
      history.current = { paths: [pathname], index: 0 };
      return;
    }

    if (currentHistory.paths[currentHistory.index] === pathname) return;

    const previousIndex = currentHistory.index - 1;
    const nextIndex = currentHistory.index + 1;
    if (currentHistory.paths[previousIndex] === pathname) {
      currentHistory.index = previousIndex;
    } else if (currentHistory.paths[nextIndex] === pathname) {
      currentHistory.index = nextIndex;
    } else {
      const existingIndex = currentHistory.paths.lastIndexOf(pathname);
      if (existingIndex >= 0) {
        currentHistory.index = existingIndex;
      } else {
        currentHistory.paths = currentHistory.paths.slice(0, currentHistory.index + 1);
        currentHistory.paths.push(pathname);
        currentHistory.index += 1;
      }
    }

    setNavigation({
      hasInAppHistory: currentHistory.index > 0,
      previousPath: currentHistory.paths[currentHistory.index - 1] ?? null,
    });
  }, [pathname]);

  return (
    <ReturnNavigationContext.Provider value={navigation}>
      {children}
    </ReturnNavigationContext.Provider>
  );
}

export function useReturnNavigation(): ReturnNavigationState {
  return useContext(ReturnNavigationContext);
}

type ReturnLinkProps = Omit<ComponentProps<typeof Link>, "href"> & { href: string };

export function ReturnLink({ href, onClick, children, ...props }: ReturnLinkProps): ReactNode {
  const router = useRouter();
  const { hasInAppHistory } = useReturnNavigation();

  return (
    <Link
      {...props}
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (
          event.defaultPrevented ||
          event.button !== 0 ||
          event.metaKey ||
          event.ctrlKey ||
          event.shiftKey ||
          event.altKey ||
          !hasInAppHistory
        ) {
          return;
        }
        event.preventDefault();
        router.back();
      }}
    >
      {children}
    </Link>
  );
}
