import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { getFactures } from "@/lib/dispensaire-facturation";
import { factureOuverte, type Facture } from "@/lib/dispensaire-facturation-const";

// ── Rapport des impayés (forces de l'ordre) ─────────────────────────────────
// Construit à la volée depuis les factures (aucune saisie), avec dédoublonnage
// par patient. La liste « payés depuis le dernier rapport » se fonde sur la date
// du dernier rapport enregistré → elle se remet d'elle-même à zéro.

export type LigneImpaye = { date: string | null; nom: string; montant: number; soins: string | null; medecin: string | null; refs: string[] };
export type LignePaye = { date: string | null; nom: string; montant: number };
export type RapportImpayes = {
  genereLe: string;
  medecin: string;
  depuis: string | null;
  impayes: LigneImpaye[];
  payes: LignePaye[];
  totalImpaye: number;
  totalPaye: number;
};
export type RapportHisto = { id: string; at: string; par: string | null; nbImpayes: number; nbPaiements: number };

const norm = (x: unknown) => String(x ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

function agregerImpayes(fs: Facture[]): LigneImpaye[] {
  const m = new Map<string, LigneImpaye>();
  for (const f of fs) {
    const k = norm(f.objet) || f.id;
    const d = f.dateEmission || f.createdAt;
    const e = m.get(k);
    if (e) {
      e.montant += f.montant; e.refs.push(f.id);
      if (d && (!e.date || d < e.date)) e.date = d;
      if (f.destinataire && (!e.soins || !e.soins.includes(f.destinataire))) e.soins = [e.soins, f.destinataire].filter(Boolean).join(", ");
    } else m.set(k, { date: d, nom: f.objet || "—", montant: f.montant, soins: f.destinataire, medecin: f.par, refs: [f.id] });
  }
  return [...m.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}
function agregerPayes(fs: Facture[]): LignePaye[] {
  const m = new Map<string, LignePaye>();
  for (const f of fs) {
    const k = norm(f.objet) || f.id;
    const d = f.datePaiement || f.dateEmission || f.createdAt;
    const e = m.get(k);
    if (e) { e.montant += f.montant; if (d && (!e.date || d < e.date)) e.date = d; }
    else m.set(k, { date: d, nom: f.objet || "—", montant: f.montant });
  }
  return [...m.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

async function dernierRapportAt(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<string | null> {
  try { const { data } = await admin.from("DispensaireRapportImpayes").select("at").order("at", { ascending: false }).limit(1).maybeSingle(); return data ? String((data as Record<string, unknown>).at) : null; } catch { return null; }
}

// Données du prochain rapport (impayés courants + paiements depuis le dernier rapport).
export async function getRapportData(): Promise<{ pret: boolean; rapport: RapportImpayes }> {
  const medecin = await (async () => { try { return (await getSessionProfile())?.nom || "Le médecin de garde"; } catch { return "Le médecin de garde"; } })();
  const vide: RapportImpayes = { genereLe: new Date().toISOString(), medecin, depuis: null, impayes: [], payes: [], totalImpaye: 0, totalPaye: 0 };
  const admin = createAdminClient();
  if (!admin) return { pret: false, rapport: vide };
  const data = await getFactures();
  if (!data.pret) return { pret: false, rapport: vide };
  const depuis = await dernierRapportAt(admin);
  const impayesF = data.factures.filter((f) => factureOuverte(f.statut));
  const payesF = data.factures.filter((f) => f.statut === "payee" && f.datePaiement && (!depuis || String(f.datePaiement) > depuis));
  const impayes = agregerImpayes(impayesF);
  const payes = agregerPayes(payesF);
  return { pret: true, rapport: { genereLe: new Date().toISOString(), medecin, depuis, impayes, payes, totalImpaye: impayes.reduce((a, l) => a + l.montant, 0), totalPaye: payes.reduce((a, l) => a + l.montant, 0) } };
}

// Historique des rapports générés.
export async function getHistoriqueRapports(): Promise<{ pret: boolean; rapports: RapportHisto[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, rapports: [] };
  try {
    const { data, error } = await admin.from("DispensaireRapportImpayes").select("id,at,par,nbImpayes,nbPaiements").order("at", { ascending: false }).limit(60);
    if (error) return { pret: false, rapports: [] };
    return { pret: true, rapports: ((data || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), at: String(r.at), par: r.par == null ? null : String(r.par), nbImpayes: Number(r.nbImpayes) || 0, nbPaiements: Number(r.nbPaiements) || 0 })) };
  } catch { return { pret: false, rapports: [] }; }
}

// Snapshot d'un rapport passé (pour l'aperçu / réimpression).
export async function getRapportSnapshot(id: string): Promise<RapportImpayes | null> {
  const admin = createAdminClient();
  if (!admin || !id) return null;
  try { const { data } = await admin.from("DispensaireRapportImpayes").select("snapshot").eq("id", id).maybeSingle(); const snap = data ? (data as Record<string, unknown>).snapshot : null; return snap ? (snap as RapportImpayes) : null; } catch { return null; }
}
