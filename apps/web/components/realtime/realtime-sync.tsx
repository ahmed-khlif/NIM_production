"use client";

import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useEffect } from "react";
import { getApiBaseUrl } from "@/features/auth/auth-client";
import { useAuth } from "@/features/auth/auth-provider";
import type { RealtimeEvent } from "@nim/types";
import { getRealtimeInvalidationKeys } from "@/lib/realtime-query-invalidation";

const API_URL = getApiBaseUrl();

export function RealtimeSync(): null {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return undefined;
    const socket = io(`${API_URL}/realtime`, { withCredentials: true, transports: ["websocket", "polling"] });
    const invalidate = (event: RealtimeEvent): void => {
      for (const queryKey of getRealtimeInvalidationKeys(event)) {
        void queryClient.invalidateQueries({ queryKey, refetchType: "active" });
      }
    };
    socket.on("realtime:event", invalidate);
    return () => { socket.off("realtime:event", invalidate); socket.disconnect(); };
  }, [queryClient, user]);
  return null;
}
