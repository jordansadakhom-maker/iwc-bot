"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutFacturer } from "@/lib/dispensaire-roles";
import { FACTURE_DELAI_H, FACTURE_STATUTS } from "@/lib/dispensaire-facturation-const";

// Factures — RÉSERVÉ aux chefs (habilités). Suivi des impayés.
export type FactureResult = { ok: boolean; error?: string; id?: string };

const STATUTS = FACTURE_STATUTS.map((x) => x.key);
type Champ = "objet" | "destinataire" | "note";
const CHAMPS: Champ[] = ["objet", "destinataire", "note"];

const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId(p = "df") { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
// Date d'émission SAISIE (ISO ou « AAAA-MM-JJ ») → ISO. Repli si vide/invalide.
function emissionDe(v: unknown, fallback: string): string { const t = Date.parse(String(v ?? "").trim()); return Number.isFinite(t) ? new Date(t).toISOString() : fallback; }
// Échéance automatique = date d'émission + FACTURE_DELAI_H (72 h).
function echeanceDe(emissionIso: string): string { return new Date(new Date(emissionIso).getTime() + FACTURE_DELAI_H * 3600000).toISOString(); }
// Fail-closed : réservé aux grades porteurs du droit « factures » (ou admin).
async function autorise() { return peutFacturer(); }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

// Journal des actions sur une facture (best-effort : n'échoue jamais l'action).
async function logFacture(admin: NonNullable<ReturnType<typeof createAdminClient>>, factureId: string, action: string, detail: string | null, par: string) {
  try { await admin.from("DispensaireFactureLog").insert({ id: newId("dfl"), factureId, action, detail, par, at: new Date().toISOString() }); } catch { /* table de log optionnelle */ }
}

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 1000 : 300);
  if ("montant" in data) row.montant = n(data.montant);
  if ("statut" in data) row.statut = STATUTS.includes(String(data.statut)) ? data.statut : "non_payee";
  return row;
}

export async function creerFacture(data: Record<string, unknown>): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.objet) return { ok: false, error: "Donne l'objet de la facture." };
  const id = newId();
  const nowIso = new Date().toISOString();
  // Date d'émission : celle SAISIE (on n'émet pas forcément le jour même) ; à
  // défaut, aujourd'hui. Seule l'ÉCHÉANCE est automatique = émission + 72 h.
  const emission = emissionDe(data.dateEmission, nowIso);
  const echeance = echeanceDe(emission);
  const par = await qui();
  const { error } = await admin.from("DispensaireFacture").insert({ id, statut: "non_payee", montant: 0, ...row, dateEmission: emission, dateEcheance: echeance, par, createdAt: nowIso, updatedAt: nowIso });
  if (error) return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  await logFacture(admin, id, "Création", String(row.objet || ""), par);
  return { ok: true, id };
}

export async function majFacture(id: string, patch: Record<string, unknown>): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Facture introuvable." };
  const row = nettoyer(patch);
  // Date d'émission modifiable → l'échéance (72 h) est recalculée à partir d'elle.
  if ("dateEmission" in patch) {
    const t = Date.parse(String(patch.dateEmission ?? "").trim());
    if (Number.isFinite(t)) { row.dateEmission = new Date(t).toISOString(); row.dateEcheance = echeanceDe(new Date(t).toISOString()); }
  }
  if ("objet" in row && !row.objet) return { ok: false, error: "L'objet ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const par = await qui();
  const now = new Date().toISOString();
  // Paiement : on horodate le règlement et son auteur (trace conservée).
  const tracePaiement = row.statut === "payee";
  if (tracePaiement) { row.datePaiement = now; row.payePar = par; }
  let { error } = await admin.from("DispensaireFacture").update({ ...row, updatedAt: now }).eq("id", id);
  // Repli si les colonnes de paiement n'existent pas encore (SQL non lancé) :
  // on réessaie sans elles pour ne pas bloquer le changement de statut.
  if (error && tracePaiement) {
    const { datePaiement: _d, payePar: _p, ...base } = row;
    void _d; void _p;
    ({ error } = await admin.from("DispensaireFacture").update({ ...base, updatedAt: now }).eq("id", id));
  }
  if (error) return { ok: false, error: "Enregistrement impossible." };
  if ("statut" in row) { const st = String(row.statut); await logFacture(admin, id, st === "payee" ? "Paiement" : "Changement de statut", st, par); }
  return { ok: true };
}

export async function supprimerFacture(id: string): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  let objet: string | null = null;
  try { const { data } = await admin.from("DispensaireFacture").select("objet").eq("id", id).maybeSingle(); objet = data ? String((data as Record<string, unknown>).objet || "") : null; } catch { /* ignore */ }
  const { error } = await admin.from("DispensaireFacture").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await logFacture(admin, id, "Suppression", objet, await qui());
  return { ok: true };
}

// Journalise une copie des informations (pour l'historique).
export async function logCopieFacture(id: string): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false };
  await logFacture(admin, id, "Copie des informations", null, await qui());
  return { ok: true };
}

// ── CONSULTATION UNIFIÉE ─────────────────────────────────────────────────────
// Un seul geste : patient + soins/articles → facture générée + (option) stock
// décrémenté + historique alimenté. Remplace la triple saisie soin / facture /
// stock. Additif : les écrans Ventes & Factures restent inchangés.

// Références pour le formulaire (patients connus + articles en stock).
export async function getConsultationRefs(): Promise<{ patients: string[]; stock: { id: string; nom: string; stock: number }[] }> {
  const admin = createAdminClient();
  if (!admin) return { patients: [], stock: [] };
  const rows = async (p: PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await p).data as Record<string, unknown>[]) || []; } catch { return []; } };
  const [ventes, factures, certs, stock] = await Promise.all([
    rows(admin.from("DispensaireVente").select("patient").order("createdAt", { ascending: false }).limit(200)),
    rows(admin.from("DispensaireFacture").select("objet").order("createdAt", { ascending: false }).limit(200)),
    rows(admin.from("DispensaireCertificat").select("patient").order("createdAt", { ascending: false }).limit(200)),
    rows(admin.from("DispensaireStock").select("id,nom,stock").order("nom", { ascending: true }).limit(500)),
  ]);
  const set = new Set<string>();
  const add = (v: unknown) => { const t = String(v ?? "").trim(); if (t) set.add(t); };
  for (const r of ventes) add(r.patient);
  for (const r of factures) add(r.objet);
  for (const r of certs) add(r.patient);
  const patients = [...set].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const stockList = stock.map((r) => ({ id: String(r.id), nom: String(r.nom || "?"), stock: Number(r.stock) || 0 }));
  return { patients, stock: stockList };
}

export type ConsultationLigne = { desc: string; quantite: number; prixUnitaire: number; stockId?: string | null };
export type ConsultationResult = { ok: boolean; error?: string; id?: string; montant?: number; avertissements?: string[] };

export async function creerConsultation(input: { patient: string; lignes: ConsultationLigne[]; regle: boolean; dateEmission?: string; note?: string }): Promise<ConsultationResult> {
  if (!(await peutFacturer())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(input.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const lignes = (Array.isArray(input.lignes) ? input.lignes : [])
    .map((l) => ({ desc: s(l.desc, 200) || "", quantite: Math.max(1, Math.round(Number(l.quantite) || 1)), prixUnitaire: n(l.prixUnitaire), stockId: l.stockId ? String(l.stockId) : null }))
    .filter((l) => l.desc || l.prixUnitaire > 0 || l.stockId);
  if (!lignes.length) return { ok: false, error: "Ajoute au moins un soin ou un article." };

  const par = await qui();
  const nowIso = new Date().toISOString();
  const emission = emissionDe(input.dateEmission, nowIso);
  const echeance = echeanceDe(emission);
  const montant = lignes.reduce((a, l) => a + l.prixUnitaire * l.quantite, 0);
  const resume = lignes.map((l) => `${l.quantite}× ${l.desc || "soin"}`).join(", ");
  const regle = !!input.regle;

  const id = newId();
  const row: Record<string, unknown> = {
    id, objet: patient, destinataire: resume.slice(0, 300), montant, statut: regle ? "payee" : "non_payee",
    dateEmission: emission, dateEcheance: echeance, note: s(input.note, 1000), par, createdAt: nowIso, updatedAt: nowIso,
  };
  if (regle) { row.datePaiement = nowIso; row.payePar = par; }
  let ins = await admin.from("DispensaireFacture").insert(row);
  // Repli si les colonnes de paiement ne sont pas encore migrées.
  if (ins.error && regle) { const { datePaiement: _d, payePar: _p, ...base } = row; void _d; void _p; ins = await admin.from("DispensaireFacture").insert(base); }
  if (ins.error) return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  await logFacture(admin, id, "Consultation", resume.slice(0, 200), par);

  // Décrément de stock optionnel & non bloquant : le soin reste facturé quoi qu'il arrive.
  const avert: string[] = [];
  for (const l of lignes) {
    if (!l.stockId) continue;
    try {
      const { data: ex } = await admin.from("DispensaireStock").select("id,nom,stock,coffre").eq("id", l.stockId).maybeSingle();
      if (!ex) continue;
      const r = ex as Record<string, unknown>;
      const avant = Number(r.stock) || 0;
      const apres = Math.max(0, avant - l.quantite);
      await admin.from("DispensaireStock").update({ stock: apres, updatedBy: par, updatedAt: nowIso }).eq("id", l.stockId);
      await admin.from("DispensaireStockMouvement").insert({ id: newId("dsm"), stockId: l.stockId, nomItem: String(r.nom || "?"), coffre: (r.coffre as string) ?? null, delta: -l.quantite, apres, motif: `Consultation — ${patient}`, par, createdAt: nowIso });
      if (avant < l.quantite) avert.push(`${String(r.nom || "?")} : stock insuffisant (${avant} en réserve, ${l.quantite} demandé)`);
    } catch { /* décrément best-effort */ }
  }
  return { ok: true, id, montant, avertissements: avert.length ? avert : undefined };
}

