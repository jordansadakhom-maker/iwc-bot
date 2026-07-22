import "server-only";
import { headers } from "next/headers";

// Détection du mode « site autonome du Dispensaire », côté serveur.
//
// Deux déclencheurs (l'un OU l'autre) — plus besoin de compter uniquement sur la
// variable d'env, dont la valeur/le nom peut être mal saisi :
//   1. NEXT_PUBLIC_DISPENSAIRE_STANDALONE = "true", ou
//   2. le nom de domaine contient « dispensaire » (ex. dispensaire-saint-denis.vercel.app).
//
// Ainsi, dès que le site est servi sur une adresse « dispensaire… », il passe
// automatiquement en mode autonome. Le déploiement Iron Wolf (autre domaine) reste normal.
export async function isStandalone(): Promise<boolean> {
  if (process.env.NEXT_PUBLIC_DISPENSAIRE_STANDALONE === "true") return true;
  try {
    const host = ((await headers()).get("host") || "").toLowerCase();
    return host.includes("dispensaire");
  } catch {
    return false;
  }
}
