import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Registre du Dispensaire de Saint-Denis",
  description: "Gestion du Dispensaire de Saint-Denis — stocks, service, RH, facturation. Anno 1904.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
