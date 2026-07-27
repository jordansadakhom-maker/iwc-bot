"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise, peutSoigner } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { cleNom } from "@/lib/noms";
import { libererChambresDuPatient } from "@/lib/dispensaire-chambres";
import { ETATS_EN_COURS, type EtatPEC } from "@/lib/dispensaire-prises-en-charge-const";

// Workflow médical — la prise en charge (machine à états). Transitions gardées
// (fail-closed), journalisées (avant → après) et idempotentes.
export type PECResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dpec-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

// Admission : ouvre un épisode (état « admis »). Ouvert à tout le personnel autorisé.
export async function admettre(data: Record<string, unknown>): Promise<PECResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const id = idAvecJeton("dpec", data.cle, newId);
  const now = new Date().toISOString();
  const medecin = s(data.medecin, 200);
  const row = { id, patient, patientNormalise: cleNom(patient), motif: s(data.motif, 300), medecin, note: s(data.note, 1000), etat: "admis" as EtatPEC, admisAt: now, createdAt: now, updatedAt: now, updatedBy: await qui() };
  const { error } = await admin.from("DispensairePriseEnCharge").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Admission impossible (lance dispensaire-prises-en-charge.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "prise_en_charge", type: "prise_en_charge.admis", cibleId: id, cibleLibelle: patient, apres: { patient, motif: row.motif, medecin } });
  return { ok: true, id };
}

// Transition générique d'état, avec garde de cohérence + journalisation.
async function transition(id: string, opts: { type: string; patch: Record<string, unknown>; depuis?: EtatPEC[]; soignant?: boolean; libereChambre?: boolean }): Promise<PECResult> {
  const autorise = opts.soignant ? await peutSoigner() : await estAutorise();
  if (!autorise) return { ok: false, error: opts.soignant ? "Réservé au personnel soignant." : REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Prise en charge introuvable." };
  const avant = await lireAvant("DispensairePriseEnCharge", id);
  if (!avant) return { ok: false, error: "Prise en charge introuvable." };
  const etatActuel = String(avant.etat) as EtatPEC;
  if (opts.depuis && !opts.depuis.includes(etatActuel)) return { ok: false, error: "Transition impossible depuis l'état actuel." };
  const par = await qui();
  const { error } = await admin.from("DispensairePriseEnCharge").update({ ...opts.patch, updatedBy: par, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "prise_en_charge", type: opts.type, cibleId: id, cibleLibelle: String(avant.patient ?? ""), avant, apres: opts.patch });
  // À la clôture / annulation, on libère le lit éventuellement occupé par le patient.
  if (opts.libereChambre) await libererChambresDuPatient(String(avant.patient ?? ""), par);
  return { ok: true, id };
}

// Assigne un lit à la prise en charge : occupe la chambre avec le patient (et son
// médecin) de l'épisode. Rapproché par nom ensuite (aucune colonne ajoutée au PEC).
export async function assignerChambrePEC(pecId: string, chambreId: string): Promise<PECResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const pec = await lireAvant("DispensairePriseEnCharge", pecId);
  if (!pec) return { ok: false, error: "Prise en charge introuvable." };
  const ch = await lireAvant("DispensaireChambre", chambreId);
  if (!ch) return { ok: false, error: "Chambre introuvable." };
  if (String(ch.etat) === "occupee") return { ok: false, error: "Cette chambre est déjà occupée." };
  const patient = String(pec.patient ?? "");
  const now = new Date().toISOString();
  const par = await qui();
  const { error } = await admin.from("DispensaireChambre").update({ etat: "occupee", patient, patientNormalise: cleNom(patient), medecin: pec.medecin ?? null, depuis: now, updatedBy: par, updatedAt: now }).eq("id", chambreId);
  if (error) return { ok: false, error: "Assignation impossible." };
  await emettreEvenementDispensaire({ aggregate: "chambre", type: "chambre.occupee", cibleId: chambreId, cibleLibelle: String(ch.nom ?? ""), avant: { etat: ch.etat }, apres: { etat: "occupee", patient } });
  return { ok: true };
}

// Attribuer / changer le médecin en charge.
export async function attribuerMedecin(id: string, medecin: string): Promise<PECResult> {
  return transition(id, { type: "prise_en_charge.attribue", patch: { medecin: s(medecin, 200) }, depuis: ETATS_EN_COURS });
}

// Démarrer le soin (admis → en_soin) — geste clinique.
export async function demarrerSoin(id: string): Promise<PECResult> {
  return transition(id, { type: "prise_en_charge.soin", patch: { etat: "en_soin", soinAt: new Date().toISOString() }, depuis: ["admis"], soignant: true });
}

// Terminer la prise en charge — geste clinique. Libère le lit du patient.
export async function terminerPriseEnCharge(id: string): Promise<PECResult> {
  return transition(id, { type: "prise_en_charge.termine", patch: { etat: "termine", finAt: new Date().toISOString() }, depuis: ETATS_EN_COURS, soignant: true, libereChambre: true });
}

// Annuler la prise en charge (erreur d'admission, départ du patient…). Libère le lit.
export async function annulerPriseEnCharge(id: string): Promise<PECResult> {
  return transition(id, { type: "prise_en_charge.annule", patch: { etat: "annule", finAt: new Date().toISOString() }, depuis: ETATS_EN_COURS, libereChambre: true });
}
