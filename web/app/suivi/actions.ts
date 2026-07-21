"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Portail client PUBLIC : un client retrouve SON suivi (rendez-vous + contrats
// de vente) en tapant son nom. Lecture seule, aucun champ sensible (pas d'ID
// Discord, pas de notes internes).
export type SuiviRdv = { type: string; lieu: string; creneau: string; statut: string };
export type SuiviContrat = { arme: string; prix: number; statut: string };
export type SuiviResult = { ok: boolean; nom?: string; rdvs: SuiviRdv[]; contrats: SuiviContrat[]; vide?: boolean; error?: string };

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function chercherSuivi(nom: string): Promise<SuiviResult> {
  const q = String(nom || "").trim();
  if (q.length < 2) return { ok: false, rdvs: [], contrats: [], error: "Entre ton nom (2 lettres minimum)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, rdvs: [], contrats: [], error: "Service momentanément indisponible." };
  const like = `%${q.replace(/[%_,]/g, " ")}%`;
  const safe = async (p: PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> => {
    try { const { data, error } = await p; return error ? [] : (data || []); } catch { return []; }
  };
  const [rdvRows, ctrRows] = await Promise.all([
    safe(admin.from("Rdv").select("nomRP,type,lieu,creneau,statut").ilike("nomRP", like).neq("statut", "cloture").limit(25)),
    safe(admin.from("ArmurerieContrat").select("clientNom,arme,prix,statut").ilike("clientNom", like).limit(25)),
  ]);
  const rdvs: SuiviRdv[] = rdvRows.map((r) => ({ type: s(r.type) || "Rendez-vous", lieu: s(r.lieu), creneau: s(r.creneau), statut: s(r.statut) || "nouveau" }));
  const contrats: SuiviContrat[] = ctrRows.map((c) => ({ arme: s(c.arme) || "Contrat de vente", prix: Number(c.prix) || 0, statut: s(c.statut) || "brouillon" }));
  return { ok: true, nom: q, rdvs, contrats, vide: rdvs.length === 0 && contrats.length === 0 };
}
