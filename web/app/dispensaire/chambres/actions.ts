"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise, peutSoigner } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { cleNom } from "@/lib/noms";
import { ETATS_CHAMBRE } from "@/lib/dispensaire-chambres-const";

// Chambres / lits — opérations ouvertes au personnel autorisé ; création /
// suppression réservées au personnel soignant.
export type ChambreResult = { ok: boolean; error?: string; id?: string };
const REFUS = "Accès refusé.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dch-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerChambre(data: Record<string, unknown>): Promise<ChambreResult> {
  if (!(await peutSoigner())) return { ok: false, error: "Réservé au personnel soignant." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom, 120);
  if (!nom) return { ok: false, error: "Donne un nom / numéro à la chambre." };
  const id = idAvecJeton("dch", data.cle, newId);
  const now = new Date().toISOString();
  const row = { id, nom, type: s(data.type, 120), etat: "libre", note: s(data.note, 500), updatedBy: await qui(), updatedAt: now, createdAt: now };
  const { error } = await admin.from("DispensaireChambre").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (lance dispensaire-chambres.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "chambre", type: "chambre.creee", cibleId: id, cibleLibelle: nom, apres: { nom, type: row.type } });
  return { ok: true, id };
}

export async function occuperChambre(id: string, data: Record<string, unknown>): Promise<ChambreResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const avant = await lireAvant("DispensaireChambre", id);
  if (!avant) return { ok: false, error: "Chambre introuvable." };
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireChambre").update({ etat: "occupee", patient, patientNormalise: cleNom(patient), medecin: s(data.medecin, 200), depuis: now, updatedBy: await qui(), updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "chambre", type: "chambre.occupee", cibleId: id, cibleLibelle: String(avant.nom ?? ""), avant: { etat: avant.etat, patient: avant.patient }, apres: { etat: "occupee", patient } });
  return { ok: true };
}

export async function libererChambre(id: string): Promise<ChambreResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireChambre", id);
  if (!avant) return { ok: false, error: "Chambre introuvable." };
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireChambre").update({ etat: "nettoyage", patient: null, patientNormalise: null, medecin: null, depuis: null, updatedBy: await qui(), updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "chambre", type: "chambre.liberee", cibleId: id, cibleLibelle: String(avant.nom ?? ""), avant: { etat: avant.etat, patient: avant.patient }, apres: { etat: "nettoyage" } });
  return { ok: true };
}

export async function changerEtatChambre(id: string, etat: string): Promise<ChambreResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(ETATS_CHAMBRE as string[]).includes(etat)) return { ok: false, error: "État inconnu." };
  const avant = await lireAvant("DispensaireChambre", id);
  if (!avant) return { ok: false, error: "Chambre introuvable." };
  // Passer à un état non occupé détache l'occupant.
  const patch: Record<string, unknown> = { etat, updatedBy: await qui(), updatedAt: new Date().toISOString() };
  if (etat !== "occupee") { patch.patient = null; patch.patientNormalise = null; patch.medecin = null; patch.depuis = null; }
  const { error } = await admin.from("DispensaireChambre").update(patch).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "chambre", type: "chambre.etat", cibleId: id, cibleLibelle: String(avant.nom ?? ""), avant: { etat: avant.etat }, apres: { etat } });
  return { ok: true };
}

export async function supprimerChambre(id: string): Promise<ChambreResult> {
  if (!(await peutSoigner())) return { ok: false, error: "Réservé au personnel soignant." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireChambre", id);
  const { error } = await admin.from("DispensaireChambre").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "chambre", type: "chambre.supprimee", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}
