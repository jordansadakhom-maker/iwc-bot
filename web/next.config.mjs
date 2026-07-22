import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Racine explicite : le dépôt contient deux lockfiles (bot + web). On force
  // la racine sur /web pour un build propre (Vercel, Render…).
  turbopack: { root: __dirname },
  // Les Server Actions plafonnent le corps de requête à 1 Mo par défaut → un
  // envoi de photo un peu lourd (fond de carte, capture) échoue silencieusement.
  // On relève la limite (les images sont aussi réduites côté client avant envoi).
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  // Le site est déployable tel quel sur Vercel ou Render (Next.js standard).
};

export default nextConfig;
