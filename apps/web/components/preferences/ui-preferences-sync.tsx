"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { getSettingsRequest } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";

export function UiPreferencesSync(): null {
  const { user } = useAuth();
  const settingsQuery = useQuery({
    queryKey: ["settings"],
    queryFn: getSettingsRequest,
    enabled: Boolean(user),
    retry: false,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (!user) {
      delete document.documentElement.dataset.density;
      return;
    }
    document.documentElement.dataset.density = settingsQuery.data?.settings.density ?? "comfortable";
  }, [settingsQuery.data?.settings.density, user]);

  return null;
}
