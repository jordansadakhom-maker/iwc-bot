import type { MetadataRoute } from "next";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://iwc-bot-psi.vercel.app";

// Plan du site : uniquement les pages PUBLIQUES (l'espace interne est privé).
export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const page = (path: string, priority: number, changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"]) =>
    ({ url: `${APP_URL}${path}`, lastModified: now, changeFrequency, priority });
  return [
    page("/", 1, "weekly"),
    page("/rejoindre", 0.9, "monthly"),
    page("/telegramme", 0.6, "monthly"),
    page("/rendez-vous", 0.6, "monthly"),
    page("/armurerie-vh", 0.5, "monthly"),
  ];
}
