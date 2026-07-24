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
  const now = new Date();
  const nowIso = now.toISOString();
  // Délai automatique : émission = maintenant, échéance = +72 h. Aucune saisie.
  const echeance = new Date(now.getTime() + FACTURE_DELAI_H * 3600000).toISOString();
  const par = await qui();
  const { error } = await admin.from("DispensaireFacture").insert({ id, statut: "non_payee", montant: 0, ...row, dateEmission: nowIso, dateEcheance: echeance, par, createdAt: nowIso, updatedAt: nowIso });
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

