import { fileURLToPath } from "url";
import { dirname } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Le dépôt contient plusieurs lockfiles (bot RDR + web RDR + lspd) : on force la
  // racine Turbopack sur ce dossier pour un build propre (Vercel, Render…).
  turbopack: { root: __dirname },
  // Les Server Actions plafonnent le corps à 1 Mo par défaut ; on relève pour les
  // pièces jointes (photos de preuve, documents) réduites côté client avant envoi.
  experimental: { serverActions: { bodySizeLimit: "12mb" } },
  poweredByHeader: false,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
