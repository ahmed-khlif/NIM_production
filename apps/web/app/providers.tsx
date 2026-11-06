"use client";

import { QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { useState } from "react";
import { Toaster } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/features/auth/auth-provider";
import { OfflineStatus } from "@/components/pwa/offline-status";
import { ServiceWorkerRegister } from "@/components/pwa/service-worker-register";
import { RealtimeSync } from "@/components/realtime/realtime-sync";
import { UiPreferencesSync } from "@/components/preferences/ui-preferences-sync";
import { createAppQueryClient } from "@/lib/query-client";

export function Providers({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  const [queryClient] = useState(createAppQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        storageKey="nim-theme"
        disableTransitionOnChange
      >
        <TooltipProvider delayDuration={300}>
          <AuthProvider>
            <UiPreferencesSync />
            {children}
            <Toaster position="top-right" richColors />
            <OfflineStatus />
            <ServiceWorkerRegister />
            <RealtimeSync />
          </AuthProvider>
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
