"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { cleNom } from "@/lib/noms";
import { ETATS_RDV, PRIORITES, type EtatRDV, type Priorite } from "@/lib/dispensaire-rendez-vous-const";

// Rendez-vous — ouvert au personnel autorisé (accueil/planning).
export type RDVResult = { ok: boolean; error?: string; id?: string };
const REFUS = "Accès refusé.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `drdv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerRDV(data: Record<string, unknown>): Promise<RDVResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const debutRaw = String(data.debut ?? "").trim();
  const t = Date.parse(debutRaw);
  if (!Number.isFinite(t)) return { ok: false, error: "Indique une date et une heure valides." };
  const priorite = (PRIORITES as string[]).includes(String(data.priorite)) ? (String(data.priorite) as Priorite) : "normale";
  const id = idAvecJeton("drdv", data.cle, newId);
  const now = new Date().toISOString();
  const row = {
    id, patient, patientNormalise: cleNom(patient), type: s(data.type, 120), medecin: s(data.medecin, 200), salle: s(data.salle, 120),
    priorite, debut: new Date(t).toISOString(), dureeMin: data.dureeMin != null ? n(data.dureeMin) : null,
    etat: "prevu" as EtatRDV, motif: s(data.motif, 500), note: s(data.note, 1000), updatedBy: await qui(), updatedAt: now, createdAt: now,
  };
  const { error } = await admin.from("DispensaireRendezVous").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (lance dispensaire-rendez-vous.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "rendez_vous", type: "rendez_vous.cree", cibleId: id, cibleLibelle: patient, apres: { patient, type: row.type, medecin: row.medecin, debut: row.debut, priorite } });
  return { ok: true, id };
}

export async function changerEtatRDV(id: string, etat: string): Promise<RDVResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(ETATS_RDV as string[]).includes(etat)) return { ok: false, error: "État inconnu." };
  const avant = await lireAvant("DispensaireRendezVous", id);
  if (!avant) return { ok: false, error: "Rendez-vous introuvable." };
  const { error } = await admin.from("DispensaireRendezVous").update({ etat, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "rendez_vous", type: "rendez_vous.etat", cibleId: id, cibleLibelle: String(avant.patient ?? ""), avant: { etat: avant.etat }, apres: { etat } });
  return { ok: true };
}

export async function supprimerRDV(id: string): Promise<RDVResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireRendezVous", id);
  const { error } = await admin.from("DispensaireRendezVous").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "rendez_vous", type: "rendez_vous.supprime", cibleId: id, cibleLibelle: String(avant?.patient ?? ""), avant });
  return { ok: true };
}
