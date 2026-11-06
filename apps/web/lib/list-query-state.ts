"use client";

import { useCallback, useEffect, useState } from "react";

export type ListQueryValue = string | number | boolean | null | undefined;

function currentParams(): URLSearchParams {
  return typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
}

export function getInitialListParam(key: string, fallback = ""): string {
  return currentParams().get(key) ?? fallback;
}

export function useListQueryState(): {
  params: URLSearchParams;
  update: (values: Record<string, ListQueryValue>) => void;
} {
  const [params, setParams] = useState(currentParams);

  useEffect(() => {
    const sync = (): void => setParams(currentParams());
    window.addEventListener("popstate", sync);
    window.addEventListener("nim:list-query-change", sync);
    return () => {
      window.removeEventListener("popstate", sync);
      window.removeEventListener("nim:list-query-change", sync);
    };
  }, []);

  const update = useCallback((values: Record<string, ListQueryValue>): void => {
    if (typeof window === "undefined") return;
    const url = new URL(window.location.href);
    for (const [key, value] of Object.entries(values)) {
      const defaultValue = (key === "page" && Number(value) === 1)
        || (key === "pageSize" && Number(value) === 20)
        || ((key === "status" || key === "role") && (value === "ALL" || value === "all"));
      if (value === null || value === undefined || value === "" || value === false || defaultValue) url.searchParams.delete(key);
      else url.searchParams.set(key, String(value));
    }
    const nextLocation = `${url.pathname}${url.search}${url.hash}`;
    const currentLocation = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (nextLocation === currentLocation) return;

    window.history.replaceState(window.history.state, "", nextLocation);
    setParams(new URLSearchParams(url.searchParams));
    window.dispatchEvent(new Event("nim:list-query-change"));
  }, []);

  return { params, update };
}
