import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";

// Villes & Marchés de chasse — prix de rachat par ville + comparateur.
export type VilleMarche = { id: string; nom: string; actif: boolean; ordre: number };
export type CategorieMarche = "legal" | "illegal";
export type RessourceMarche = { id: string; nom: string; categorie: CategorieMarche; ordre: number };
export type HistoriqueMarche = { id: string; ville: string | null; ressource: string | null; ancien: number | null; nouveau: number | null; par: string | null; createdAt: string | null };
export type MarchesData = {
  pret: boolean;                                   // tables présentes ?
  villes: VilleMarche[];
  ressources: RessourceMarche[];
  prix: Record<string, Record<string, number>>;    // villeId → nom ressource → prix
  historique: HistoriqueMarche[];
  peut: boolean;                                   // droit d'écriture (Direction)
};

// Comparateur PUR (testable) : pour une ressource, à partir de { villeId → prix }
// et de la liste des villes, renvoie la meilleure offre + l'écart avec la 2e.
export function meilleureOffre(
  prixParVille: Record<string, number>,
  villes: { id: string; nom: string }[],
): { villeId: string; nom: string; prix: number; ecart: number } | null {
  const entrees = villes
    .map((v) => ({ id: v.id, nom: v.nom, prix: Number(prixParVille[v.id]) || 0 }))
    .filter((e) => e.prix > 0)
    .sort((a, b) => b.prix - a.prix);
  if (!entrees.length) return null;
  const best = entrees[0];
  const second = entrees[1]?.prix ?? 0;
  return { villeId: best.id, nom: best.nom, prix: best.prix, ecart: Math.round((best.prix - second) * 100) / 100 };
}

export async function getMarchesChasse(): Promise<MarchesData> {
  const vide: MarchesData = { pret: false, villes: [], ressources: [], prix: {}, historique: [], peut: false };
  const admin = createAdminClient();
  if (!admin) return vide;
  let peut = false;
  try { peut = !!(await getActeur())?.officier; } catch { peut = false; }

  const [vR, rR, pR, hR] = await Promise.all([
    admin.from("ChasseVille").select("*").order("ordre", { ascending: true }),
    admin.from("ChasseRessourceMarche").select("*").order("ordre", { ascending: true }),
    admin.from("ChasseMarchePrix").select("villeId,ressource,prix"),
    admin.from("ChasseMarcheHistorique").select("*").order("createdAt", { ascending: false }).limit(80),
  ]);
  // Tables pas encore créées → non prêt (l'UI affiche « lance le SQL »).
  if (vR.error && rR.error) return { ...vide, peut };

  type Row = Record<string, unknown>;
  const villes: VilleMarche[] = ((vR.data || []) as Row[]).map((v) => ({
    id: String(v.id), nom: String(v.nom || ""), actif: v.actif !== false, ordre: Number(v.ordre) || 0,
  }));
  const ressources: RessourceMarche[] = ((rR.data || []) as Row[]).map((r) => ({
    id: String(r.id), nom: String(r.nom || ""), categorie: r.categorie === "illegal" ? "illegal" : "legal", ordre: Number(r.ordre) || 0,
  }));
  const prix: Record<string, Record<string, number>> = {};
  for (const p of (pR.data || []) as Row[]) {
    const vid = String(p.villeId || ""); const res = String(p.ressource || "");
    if (!vid || !res) continue;
    (prix[vid] = prix[vid] || {})[res] = Number(p.prix) || 0;
  }
  const historique: HistoriqueMarche[] = ((hR.data || []) as Row[]).map((h) => ({
    id: String(h.id), ville: (h.ville as string) ?? null, ressource: (h.ressource as string) ?? null,
    ancien: h.ancien == null ? null : Number(h.ancien), nouveau: h.nouveau == null ? null : Number(h.nouveau),
    par: (h.par as string) ?? null, createdAt: (h.createdAt as string) ?? null,
  }));
  return { pret: true, villes, ressources, prix, historique, peut };
}
