// Rapport automatique — synthèse dérivée des KPI + de la veille. Pur (aucun
// accès serveur, aucune requête) : on assemble ce qui a déjà été calculé.

import { compterGravite, trierConstats, PRIORITE_LABEL, type Constat } from "@/lib/erp-assistant-const";
import type { Kpi } from "@/lib/erp-kpi-const";

export type RapportLigne = { label: string; valeur: string };
export type Rapport = { titre: string; genereLe: string; lignes: RapportLigne[]; synthese: string; faits: string[] };

const actives = (cs: Constat[]) => cs.filter((c) => (c.etat ?? "nouveau") === "nouveau" || c.etat === "en_cours");

export function construireRapport(titre: string, genereLe: string, kpis: Kpi[], constats: Constat[]): Rapport {
  const act = actives(constats);
  const g = compterGravite(act);
  const synthese = act.length ? `${g.critique} critique(s) · ${g.important} à traiter · ${g.info} info.` : "Aucun point d'attention actif — tout est à jour.";
  const lignes: RapportLigne[] = kpis.map((k) => ({ label: k.label, valeur: k.value + (k.sub ? ` ${k.sub}` : "") }));
  const faits = trierConstats(act).slice(0, 8).map((c) => `${PRIORITE_LABEL[c.priorite]} — ${c.titre}${c.detail ? ` (${c.detail})` : ""}`);
  return { titre, genereLe, lignes, synthese, faits };
}

// Version texte, pour l'export presse-papier.
export function rapportEnTexte(r: Rapport): string {
  const l: string[] = [`${r.titre} — ${r.genereLe}`, "", "INDICATEURS", ...r.lignes.map((x) => `• ${x.label} : ${x.valeur}`), "", `SYNTHÈSE : ${r.synthese}`];
  if (r.faits.length) { l.push("", "POINTS D'ATTENTION", ...r.faits.map((f) => `• ${f}`)); }
  return l.join("\n");
}
