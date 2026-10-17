import type { Metadata } from "next";
import { Providers } from "./providers";
import "./globals.css";

export const metadata: Metadata = {
  title: "NIM Production",
  description: "Suivi de production et traçabilité industrielle NIM",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>): React.ReactNode {
  return (
    <html lang="fr" suppressHydrationWarning>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
