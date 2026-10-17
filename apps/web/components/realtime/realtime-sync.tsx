"use client";

import { useQueryClient } from "@tanstack/react-query";
import { io } from "socket.io-client";
import { useEffect } from "react";
import { useAuth } from "@/features/auth/auth-provider";

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export function RealtimeSync(): null {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  useEffect(() => {
    if (!user) return undefined;
    const socket = io(`${API_URL}/realtime`, { withCredentials: true, transports: ["websocket", "polling"] });
    const invalidate = (): void => { void queryClient.invalidateQueries(); };
    socket.on("realtime:event", invalidate);
    return () => { socket.off("realtime:event", invalidate); socket.disconnect(); };
  }, [queryClient, user]);
  return null;
}
