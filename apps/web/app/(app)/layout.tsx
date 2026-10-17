import { AppShell } from "@/components/layout/app-shell";
import { ProtectedRoute } from "@/features/auth/protected-route";

export default function AuthenticatedLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return <ProtectedRoute><AppShell>{children}</AppShell></ProtectedRoute>;
}
