"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutSoigner } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { cleNom } from "@/lib/noms";
import { CHAMPS_CRO, STATUTS_INTERV_EN_COURS } from "@/lib/dispensaire-interventions-const";

// Interventions (CRO) — écriture réservée au personnel soignant.
export type IntervResult = { ok: boolean; error?: string; id?: string };
const REFUS = "Réservé au personnel soignant.";
const s = (v: unknown, max = 2000) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dint-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function croFields(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS_CRO) if (c in data) row[c] = s(data[c], c === "compteRendu" || c === "soinsRealises" || c === "complications" || c === "note" ? 4000 : 200);
  return row;
}

export async function creerIntervention(data: Record<string, unknown>): Promise<IntervResult> {
  if (!(await peutSoigner())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const id = idAvecJeton("dint", data.cle, newId);
  const now = new Date().toISOString();
  const cro = croFields(data);
  const row = { id, patient, patientNormalise: cleNom(patient), statut: "planifiee", ...cro, updatedBy: await qui(), updatedAt: now, createdAt: now };
  const { error } = await admin.from("DispensaireIntervention").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (lance dispensaire-interventions.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "intervention", type: "intervention.creee", cibleId: id, cibleLibelle: patient, apres: { patient, type: cro.type ?? null, chirurgien: cro.chirurgien ?? null } });
  return { ok: true, id };
}

async function transition(id: string, type: string, patch: Record<string, unknown>, depuis?: string[]): Promise<IntervResult> {
  if (!(await peutSoigner())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Intervention introuvable." };
  const avant = await lireAvant("DispensaireIntervention", id);
  if (!avant) return { ok: false, error: "Intervention introuvable." };
  if (depuis && !depuis.includes(String(avant.statut))) return { ok: false, error: "Transition impossible depuis l'état actuel." };
  const { error } = await admin.from("DispensaireIntervention").update({ ...patch, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "intervention", type, cibleId: id, cibleLibelle: String(avant.patient ?? ""), avant, apres: patch });
  return { ok: true, id };
}

export async function demarrerIntervention(id: string): Promise<IntervResult> {
  return transition(id, "intervention.demarree", { statut: "en_cours", debut: new Date().toISOString() }, ["planifiee"]);
}

export async function terminerIntervention(id: string, cro: Record<string, unknown>): Promise<IntervResult> {
  return transition(id, "intervention.terminee", { ...croFields(cro), statut: "terminee", fin: new Date().toISOString() }, STATUTS_INTERV_EN_COURS as unknown as string[]);
}

export async function annulerIntervention(id: string): Promise<IntervResult> {
  return transition(id, "intervention.annulee", { statut: "annulee", fin: new Date().toISOString() }, STATUTS_INTERV_EN_COURS as unknown as string[]);
}

// Édite le compte-rendu (à tout moment), sans changer le statut.
export async function majIntervention(id: string, patch: Record<string, unknown>): Promise<IntervResult> {
  if (!(await peutSoigner())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = croFields(patch);
  if (!Object.keys(row).length) return { ok: true };
  const avant = await lireAvant("DispensaireIntervention", id);
  if (!avant) return { ok: false, error: "Intervention introuvable." };
  const { error } = await admin.from("DispensaireIntervention").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "intervention", type: "intervention.cro", cibleId: id, cibleLibelle: String(avant.patient ?? ""), avant, apres: row });
  return { ok: true, id };
}

export async function supprimerIntervention(id: string): Promise<IntervResult> {
  if (!(await peutSoigner())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireIntervention", id);
  const { error } = await admin.from("DispensaireIntervention").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "intervention", type: "intervention.supprimee", cibleId: id, cibleLibelle: String(avant?.patient ?? ""), avant });
  return { ok: true };
}
