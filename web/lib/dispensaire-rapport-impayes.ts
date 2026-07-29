import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { getFactures } from "@/lib/dispensaire-facturation";
import { factureOuverte, type Facture } from "@/lib/dispensaire-facturation-const";
import { RAPPORT_CONFIG_DEFAUT, type RapportConfig, type RapportMode } from "@/lib/dispensaire-rapport-const";

// ── Rapport des impayés (forces de l'ordre) ─────────────────────────────────
// Construit à la volée depuis les factures (aucune saisie), avec dédoublonnage
// par patient. La liste « payés depuis le dernier rapport » se fonde sur la date
// du dernier rapport enregistré → elle se remet d'elle-même à zéro.

export type LigneImpaye = { date: string | null; nom: string; montant: number; soins: string | null; medecin: string | null; refs: string[] };
// `emission` = date d'ÉMISSION de la facture ; `date` = date de PAIEMENT. Les deux
// sont INDÉPENDANTES : le paiement n'écrase jamais l'émission (correctif bug n°3).
export type LignePaye = { date: string | null; emission: string | null; nom: string; montant: number };
export type RapportImpayes = {
  genereLe: string;
  medecin: string;
  medecinTitre: string;
  depuis: string | null;
  impayes: LigneImpaye[];
  payes: LignePaye[];
  totalImpaye: number;
  totalPaye: number;
};

// Titre par défaut sous la signature quand aucun grade n'est connu.
export const TITRE_MEDECIN_DEFAUT = "Médecin du Dispensaire de Saint-Denis";
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
    const d = f.datePaiement || null;                 // date de PAIEMENT (indépendante)
    const em = f.dateEmission || f.createdAt || null;  // date d'ÉMISSION (indépendante)
    const e = m.get(k);
    if (e) {
      e.montant += f.montant;
      if (d && (!e.date || d < e.date)) e.date = d;
      if (em && (!e.emission || em < e.emission)) e.emission = em;
    } else m.set(k, { date: d, emission: em, nom: f.objet || "—", montant: f.montant });
  }
  return [...m.values()].sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

// FDO — soins aux forces de l'ordre (tarif fixe 2 $). Statut « facture » = dû,
// « regle » = payé. Ces sommes sont dues au dispensaire au même titre qu'une
// facture patient → on les intègre au rapport (impayés + payés depuis `depuis`),
// regroupées par bureau. Dégradation propre si la table n'existe pas encore.
async function fdoLignes(depuis: string | null): Promise<{ impayes: LigneImpaye[]; payes: LignePaye[] }> {
  const admin = createAdminClient();
  if (!admin) return { impayes: [], payes: [] };
  let rows: Record<string, unknown>[] = [];
  try { const { data } = await admin.from("DispensaireSoinFDO").select("bureau,agent,soin,montant,statut,par,createdAt,updatedAt"); rows = (data as Record<string, unknown>[]) || []; } catch { return { impayes: [], payes: [] }; }
  const val = (v: unknown) => Number(v) || 0;
  const impM = new Map<string, LigneImpaye>();
  const payM = new Map<string, LignePaye>();
  for (const r of rows) {
    const bureau = String(r.bureau ?? "Forces de l'ordre");
    const k = "fdo-" + norm(bureau);
    const regle = String(r.statut ?? "") === "regle";
    if (!regle) {
      const d = r.createdAt ? String(r.createdAt) : null;
      const agent = r.agent ? String(r.agent) : null;
      const e = impM.get(k);
      if (e) { e.montant += val(r.montant); if (d && (!e.date || d < e.date)) e.date = d; if (agent && (!e.soins || !e.soins.includes(agent))) e.soins = [e.soins, agent].filter(Boolean).join(", "); }
      else impM.set(k, { date: d, nom: `FDO — ${bureau}`, montant: val(r.montant), soins: agent, medecin: r.par ? String(r.par) : null, refs: [] });
    } else if (r.updatedAt && (!depuis || String(r.updatedAt) > depuis)) {
      const d = String(r.updatedAt);
      const em = r.createdAt ? String(r.createdAt) : null;
      const e = payM.get(k);
      if (e) { e.montant += val(r.montant); if (d && (!e.date || d < e.date)) e.date = d; if (em && (!e.emission || em < e.emission)) e.emission = em; }
      else payM.set(k, { date: d, emission: em, nom: `FDO — ${bureau}`, montant: val(r.montant) });
    }
  }
  return { impayes: [...impM.values()], payes: [...payM.values()] };
}

async function dernierRapportAt(admin: NonNullable<ReturnType<typeof createAdminClient>>): Promise<string | null> {
  try { const { data } = await admin.from("DispensaireRapportImpayes").select("at").order("at", { ascending: false }).limit(1).maybeSingle(); return data ? String((data as Record<string, unknown>).at) : null; } catch { return null; }
}

// Construit le rapport (impayés courants + paiements depuis `depuis`).
async function batirRapport(medecin: string, depuis: string | null, titre?: string | null): Promise<{ pret: boolean; rapport: RapportImpayes }> {
  const medecinTitre = (titre || "").trim() || TITRE_MEDECIN_DEFAUT;
  const vide: RapportImpayes = { genereLe: new Date().toISOString(), medecin, medecinTitre, depuis, impayes: [], payes: [], totalImpaye: 0, totalPaye: 0 };
  const data = await getFactures();
  if (!data.pret) return { pret: false, rapport: vide };
  const impayesF = data.factures.filter((f) => factureOuverte(f.statut));
  const payesF = data.factures.filter((f) => f.statut === "payee" && f.datePaiement && (!depuis || String(f.datePaiement) > depuis));
  const impayes = agregerImpayes(impayesF);
  const payes = agregerPayes(payesF);
  // Ajout des soins FDO (dus / réglés) au même rapport, triés avec le reste.
  const fdo = await fdoLignes(depuis);
  if (fdo.impayes.length) { impayes.push(...fdo.impayes); impayes.sort((a, b) => String(a.date).localeCompare(String(b.date))); }
  if (fdo.payes.length) { payes.push(...fdo.payes); payes.sort((a, b) => String(a.date).localeCompare(String(b.date))); }
  return { pret: true, rapport: { genereLe: new Date().toISOString(), medecin, medecinTitre, depuis, impayes, payes, totalImpaye: impayes.reduce((a, l) => a + l.montant, 0), totalPaye: payes.reduce((a, l) => a + l.montant, 0) } };
}

// Données du prochain rapport (aperçu — médecin = compte connecté par défaut).
export async function getRapportData(): Promise<{ pret: boolean; rapport: RapportImpayes }> {
  const medecin = await (async () => { try { return (await getSessionProfile())?.nom || "Le médecin de garde"; } catch { return "Le médecin de garde"; } })();
  const admin = createAdminClient();
  const depuis = admin ? await dernierRapportAt(admin) : null;
  return batirRapport(medecin, depuis);
}

// Enregistre un rapport (fige un instantané) — utilisé par l'action manuelle
// ET par la génération planifiée (par = « Génération automatique »). `titre` =
// grade/fonction du médecin signataire (affiché sous la signature).
export async function enregistrerRapport(par: string, titre?: string | null): Promise<{ ok: boolean; error?: string; rapport?: RapportImpayes }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const depuis = await dernierRapportAt(admin);
  const { pret, rapport } = await batirRapport(par, depuis, titre);
  if (!pret) return { ok: false, error: "Données indisponibles (lance les SQL du dispensaire)." };
  const id = `dri-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await admin.from("DispensaireRapportImpayes").insert({ id, at: rapport.genereLe, par, depuis, nbImpayes: rapport.impayes.length, nbPaiements: rapport.payes.length, snapshot: rapport });
  if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-rapport-impayes.sql ?)." };
  return { ok: true, rapport };
}

// ── Planification ────────────────────────────────────────────────────────────
export async function getRapportConfig(): Promise<RapportConfig> {
  const admin = createAdminClient();
  if (!admin) return { ...RAPPORT_CONFIG_DEFAUT };
  try {
    const { data } = await admin.from("DispensaireRapportConfig").select("*").eq("id", "config").maybeSingle();
    if (!data) return { ...RAPPORT_CONFIG_DEFAUT };
    const r = data as Record<string, unknown>;
    const modes: RapportMode[] = ["manuel", "quotidien", "hebdo", "mensuel"];
    return {
      mode: modes.includes(String(r.mode) as RapportMode) ? (String(r.mode) as RapportMode) : "manuel",
      heure: Math.max(0, Math.min(23, Number(r.heure) || 8)),
      jour: Math.max(1, Math.min(31, Number(r.jour) || 1)),
      lastAutoAt: r.lastAutoAt == null ? null : String(r.lastAutoAt),
    };
  } catch { return { ...RAPPORT_CONFIG_DEFAUT }; }
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
