// Redéploiement — test de déclenchement Vercel (post-reconnexion Git).
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
  // N'expose pas la stack (retire l'en-tête « X-Powered-By: Next.js »).
  poweredByHeader: false,
  // En-têtes de sécurité (toutes les routes). Volontairement SANS Content-Security-
  // Policy stricte : Next.js utilise des scripts inline → une CSP nécessiterait un
  // déploiement par nonce (chantier à part) au risque de tout casser. camera /
  // microphone / geolocation sont autorisés à « self » car le site les utilise
  // (photo d'identité, notes vocales, carte).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self)" },
        ],
      },
    ];
  },
  // Le site est déployable tel quel sur Vercel ou Render (Next.js standard).
};

export default nextConfig;
