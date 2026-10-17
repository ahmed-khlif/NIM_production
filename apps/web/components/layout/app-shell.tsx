import { AppHeader } from "./app-header";
import { AppSidebar } from "./app-sidebar";

export function AppShell({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return (
    <div className="flex min-h-screen bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only z-50 rounded-md bg-background px-3 py-2 text-sm font-semibold text-foreground focus:not-sr-only focus:fixed focus:left-4 focus:top-4"
      >
        Passer au contenu
      </a>
      <AppSidebar />
      <div className="min-w-0 flex-1">
        <AppHeader />
        <main id="main-content" className="mx-auto max-w-[1600px] p-5 lg:p-8">
          {children}
        </main>
      </div>
    </div>
  );
}
