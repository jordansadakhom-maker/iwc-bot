import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getVitrine } from "@/lib/queries";
import { Vitrine } from "@/components/vitrine";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://iwc-bot-psi.vercel.app";

// Métadonnées riches : ce sont elles qui font l'aperçu (embed) quand on colle le
// lien dans un salon Discord. L'image d'aperçu est générée par opengraph-image.tsx.
export const metadata: Metadata = {
  metadataBase: new URL(APP_URL),
  title: "Iron Wolf Company — Rejoignez la meute",
  description:
    "Compagnie de sécurité de l'Ouest : escorte, chasse de prime, armurerie de Van Horn. Débutant ou vétéran, votre place vous attend — déposez votre candidature.",
  openGraph: {
    title: "Iron Wolf Company — Rejoignez la meute",
    description:
      "Sécurité, escorte, chasse de prime, armurerie de Van Horn. Le pays a besoin de loups — et les loups chassent en meute.",
    type: "website",
    url: "/",
    siteName: "Iron Wolf Company",
    locale: "fr_FR",
  },
  twitter: {
    card: "summary_large_image",
    title: "Iron Wolf Company — Rejoignez la meute",
    description: "Sécurité, escorte, chasse de prime. Votre place vous attend.",
  },
};

// Racine PUBLIQUE : page de couverture pour les visiteurs, redirection vers le
// tableau de bord pour les membres connectés.
export default async function Home() {
  let connecte = false;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    connecte = !!data.user;
  } catch {}
  if (connecte) redirect("/dashboard");

  const stats = await getVitrine();
  return <Vitrine stats={stats} />;
}
