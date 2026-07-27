// Cockpit « Mode Direction » — types partagés & synthèse PURE (testable).
// Aucune I/O ici : l'agrégation réelle vit dans lib/cockpit-data.ts (server-only).

import type { Alerte } from "@/lib/queries";
import type { PoleWeb } from "@/lib/queries";

export type Cockpit = {
  connecte: boolean;
  pole: PoleWeb;
  tresorerie: { commun: number | null; legal: number | null; illegal: number | null; armurerie: number | null; total: number };
  effectifs: { total: number; presents: number; absents: number };
  charge: { contratsEnCours: number; opsActives: number };
  taches: { enCours: number; enRetard: number };
  conversations: { ouvertes: number; total: number };
  attention: Alerte[];
  attentionTotal: number;
};

export type CockpitTon = "calme" | "vigilance" | "tendu";

// Synthèse d'une phrase + « ton » global à partir des signaux consolidés.
// Seuils volontairement simples et prévisibles (testables).
export function resumeDirection(x: { attentionTotal: number; tachesEnRetard: number; coffreNegatif: boolean }): { ton: CockpitTon; texte: string } {
  const { attentionTotal, tachesEnRetard, coffreNegatif } = x;
  const ton: CockpitTon =
    coffreNegatif || tachesEnRetard > 0 || attentionTotal >= 8 ? "tendu"
    : attentionTotal >= 3 ? "vigilance"
    : "calme";

  if (ton === "calme") return { ton, texte: "Tout est sous contrôle. 🐺" };

  const raisons: string[] = [];
  if (coffreNegatif) raisons.push("trésorerie négative");
  if (tachesEnRetard > 0) raisons.push(`${tachesEnRetard} tâche(s) en retard`);
  if (attentionTotal > 0) raisons.push(`${attentionTotal} point(s) d'attention`);
  const prefix = ton === "tendu" ? "À surveiller de près :" : "Quelques points à suivre :";
  return { ton, texte: `${prefix} ${raisons.join(" · ")}.` };
}

export const TON_LABEL: Record<CockpitTon, string> = {
  calme: "Sous contrôle",
  vigilance: "Vigilance",
  tendu: "Tendu",
};
