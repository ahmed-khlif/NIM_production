import type { Metadata } from "next";
import { ReturnNavigationProvider } from "@/components/navigation/return-navigation";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NIM Production",
  description: "Suivi de production et traçabilité industrielle NIM",
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }],
    shortcut: ["/icon.svg"],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <ReturnNavigationProvider>
          <Providers>{children}</Providers>
        </ReturnNavigationProvider>
      </body>
    </html>
  );
}
