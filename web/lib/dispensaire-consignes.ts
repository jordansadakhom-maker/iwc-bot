import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";

// ── Consignes du jour ────────────────────────────────────────────────────────
// Une consigne par journée (clé = date Paris). Chaque enregistrement est journalisé
// (auteur + heure) pour l'historique des modifications. Dégrade proprement si les
// tables n'existent pas encore.

export type ConsigneLog = { texte: string; par: string | null; at: string };
export type ConsigneData = {
  pret: boolean;
  jour: string;                 // ymd Paris
  texte: string;
  createdAt: string | null;
  updatedBy: string | null;
  updatedAt: string | null;
  historique: ConsigneLog[];
};

const s = (v: unknown) => (v == null ? null : String(v));
export const jourParis = (d = new Date()) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);

export async function getConsigneDuJour(): Promise<ConsigneData> {
  const jour = jourParis();
  const vide: ConsigneData = { pret: false, jour, texte: "", createdAt: null, updatedBy: null, updatedAt: null, historique: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  try {
    const { data, error } = await admin.from("DispensaireConsigne").select("*").eq("jour", jour).maybeSingle();
    if (error) return vide; // table absente → non prêt
    let historique: ConsigneLog[] = [];
    try {
      const { data: logs } = await admin.from("DispensaireConsigneLog").select("texte,par,at").eq("jour", jour).order("at", { ascending: false }).limit(10);
      historique = ((logs || []) as Record<string, unknown>[]).map((r) => ({ texte: String(r.texte || ""), par: s(r.par), at: String(r.at) }));
    } catch { /* log optionnel */ }
    const r = (data || {}) as Record<string, unknown>;
    return { pret: true, jour, texte: String(r.texte || ""), createdAt: s(r.createdAt), updatedBy: s(r.updatedBy), updatedAt: s(r.updatedAt), historique };
  } catch { return vide; }
}
