"use client";

import type { AuthenticatedUser } from "@nim/types";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createContext, useContext, useMemo } from "react";
import { ApiError, getCurrentUser, logoutRequest } from "./auth-client";

type AuthContextValue = {
  user: AuthenticatedUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  authError: ApiError | null;
  refresh: () => Promise<AuthenticatedUser | null>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["auth", "me"], queryFn: getCurrentUser, retry: false, staleTime: 60_000 });
  const value = useMemo<AuthContextValue>(() => ({
    user: query.data?.user ?? null,
    isLoading: query.isLoading,
    isAuthenticated: Boolean(query.data?.user),
    authError: query.error instanceof ApiError ? query.error : null,
    refresh: async () => {
      const result = await query.refetch();
      return result.data?.user ?? null;
    },
    logout: async () => {
      await logoutRequest();
      queryClient.setQueryData(["auth", "me"], null);
    },
  }), [query.data?.user, query.error, query.isLoading, query.refetch, queryClient]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used inside AuthProvider");
  return value;
}
