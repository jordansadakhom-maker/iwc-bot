import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  // Base des URL absolues (images de partage social) → supprime l'avertissement
  // de build. Surchargeable via NEXT_PUBLIC_SITE_URL sur Vercel.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "https://iwc-bot-psi.vercel.app"),
  title: "IWC — Poste de commandement",
  description:
    "Plateforme de gestion Iron Wolf Company / La Confrérie — centralise tout ce qui est réparti sur Discord.",
};

export const viewport: Viewport = {
  themeColor: "#0e1116",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr" data-theme="dark">
      <body>{children}</body>
    </html>
  );
}
