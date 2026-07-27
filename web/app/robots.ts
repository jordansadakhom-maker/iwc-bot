import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://iwc-bot-psi.vercel.app";

// robots.txt servi en clair (le middleware laisse passer /robots.txt) : on
// autorise l'indexation des pages vitrine/publiques et on interdit l'espace
// interne, les routes techniques et les liens privés à jeton (/suivi, /avis).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/rejoindre", "/telegramme", "/rendez-vous", "/armurerie-vh"],
      disallow: [
        "/login", "/auth/", "/api/", "/suivi", "/avis",
        "/dashboard", "/finances", "/operations", "/contrats", "/membres", "/absences",
        "/recrutement", "/renseignement", "/wanted", "/medical", "/agenda", "/repertoire",
        "/documents", "/notes-vocales", "/inventaire", "/chasse", "/armurerie", "/mouvements",
        "/carte", "/carte-metier", "/communication", "/journal", "/notifications", "/dispensaire",
        "/statistiques", "/assistant", "/direction", "/taches", "/messages", "/activite",
      ],
    },
    sitemap: `${APP_URL}/sitemap.xml`,
  };
}
