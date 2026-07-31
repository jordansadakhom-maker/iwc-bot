import type { Metadata, Viewport } from "next";
import { Playfair_Display } from "next/font/google";
import "./globals.css";
import { ToastHost } from "@/components/toast-host";

// Police « registre » — élégante, contrastée, esprit document officiel des
// années 1900. Chargée ici (auto-hébergée par Next) mais APPLIQUÉE uniquement
// au Dispensaire (via --font-display sous .disp-premium) → Iron Wolf inchangé.
const registre = Playfair_Display({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-registre", display: "swap" });

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
    <html lang="fr" data-theme="dark" className={registre.variable}>
      <body>
        {children}
        {/* Notifications éphémères — disponibles sur tout le site. */}
        <ToastHost />
      </body>
    </html>
  );
}
