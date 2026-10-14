import "./globals.css";
import type { Metadata, Viewport } from "next";

export const metadata: Metadata = {
  title: "LSPD — Los Santos Police Department",
  description: "Plateforme interne de gestion du LSPD (serveur GTA V RP).",
};

export const viewport: Viewport = {
  themeColor: "#0c121c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
