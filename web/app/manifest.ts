import type { MetadataRoute } from "next";

// Manifeste PWA : rend le site installable comme une vraie appli (plein écran,
// icône sur l'écran d'accueil).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Iron Wolf Company — Poste de commandement",
    short_name: "Iron Wolf",
    description: "La plateforme de gestion de la Iron Wolf Company : opérations, armurerie, finances, membres.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1116",
    theme_color: "#0e1116",
    lang: "fr",
    categories: ["business", "productivity"],
    icons: [
      { src: "/pwa-icon", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/pwa-icon", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
