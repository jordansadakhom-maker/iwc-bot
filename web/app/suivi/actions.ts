"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Portail client PUBLIC : un client retrouve SON suivi (rendez-vous + contrats
// de vente) en tapant son nom. Lecture seule, aucun champ sensible (pas d'ID
// Discord, pas de notes internes).
export type SuiviRdv = { type: string; lieu: string; creneau: string; statut: string };
export type SuiviContrat = { arme: string; prix: number; statut: string };
export type SuiviReponse = { texte: string; par: string; at?: number };
export type SuiviTelegramme = { message: string; statut: string; reponses: SuiviReponse[] };
export type SuiviResult = { ok: boolean; nom?: string; rdvs: SuiviRdv[]; contrats: SuiviContrat[]; telegrammes: SuiviTelegramme[]; vide?: boolean; error?: string };

type Row = Record<string, unknown>;
const s = (v: unknown) => (v == null ? "" : String(v));

export async function chercherSuivi(nom: string): Promise<SuiviResult> {
  const q = String(nom || "").trim();
  if (q.length < 2) return { ok: false, rdvs: [], contrats: [], telegrammes: [], error: "Entre ton nom (2 lettres minimum)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, rdvs: [], contrats: [], telegrammes: [], error: "Service momentanément indisponible." };
  const like = `%${q.replace(/[%_,]/g, " ")}%`;
  const safe = async (p: PromiseLike<{ data: Row[] | null; error: unknown }>): Promise<Row[]> => {
    try { const { data, error } = await p; return error ? [] : (data || []); } catch { return []; }
  };
  const [rdvRows, ctrRows, tgRows] = await Promise.all([
    safe(admin.from("Rdv").select("nomRP,type,lieu,creneau,statut").ilike("nomRP", like).neq("statut", "cloture").limit(25)),
    safe(admin.from("ArmurerieContrat").select("clientNom,arme,prix,statut").ilike("clientNom", like).limit(25)),
    // Télégrammes envoyés depuis le site : le client y retrouve la RÉPONSE de
    // l'équipe (champ `reponses`) sans compte — sa « notification » côté site.
    safe(admin.from("TelegrammeWeb").select("nom,message,statut,reponses").ilike("nom", like).limit(25)),
  ]);
  const rdvs: SuiviRdv[] = rdvRows.map((r) => ({ type: s(r.type) || "Rendez-vous", lieu: s(r.lieu), creneau: s(r.creneau), statut: s(r.statut) || "nouveau" }));
  const contrats: SuiviContrat[] = ctrRows.map((c) => ({ arme: s(c.arme) || "Contrat de vente", prix: Number(c.prix) || 0, statut: s(c.statut) || "brouillon" }));
  const telegrammes: SuiviTelegramme[] = tgRows.map((t) => {
    const rep = Array.isArray(t.reponses) ? (t.reponses as Record<string, unknown>[]) : [];
    return {
      message: s(t.message),
      statut: s(t.statut) || "nouveau",
      reponses: rep.map((r) => ({ texte: s(r.texte), par: s(r.par) || "Équipe", at: typeof r.at === "number" ? r.at : undefined })),
    };
  });
  return { ok: true, nom: q, rdvs, contrats, telegrammes, vide: rdvs.length === 0 && contrats.length === 0 && telegrammes.length === 0 };
}
