"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { ETATS_AMBULANCE } from "@/lib/dispensaire-ambulances-const";

// Ambulances — flotte gérée par le personnel autorisé.
export type AmbResult = { ok: boolean; error?: string; id?: string };
const REFUS = "Accès refusé.";
const s = (v: unknown, max = 1000) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const clampPct = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : null; };
const int = (v: unknown) => { const n = Math.round(Number(v)); return Number.isFinite(n) ? Math.max(0, n) : null; };
function newId() { return `damb-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerAmbulance(data: Record<string, unknown>): Promise<AmbResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom, 120);
  if (!nom) return { ok: false, error: "Donne un nom / une immatriculation." };
  const id = idAvecJeton("damb", data.cle, newId);
  const now = new Date().toISOString();
  const row = { id, nom, etat: "disponible", essence: clampPct(data.essence), kilometrage: int(data.kilometrage), materiel: s(data.materiel), note: s(data.note, 500), updatedBy: await qui(), updatedAt: now, createdAt: now };
  const { error } = await admin.from("DispensaireAmbulance").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (lance dispensaire-ambulances.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "ambulance", type: "ambulance.creee", cibleId: id, cibleLibelle: nom, apres: { nom } });
  return { ok: true, id };
}

export async function changerEtatAmbulance(id: string, etat: string): Promise<AmbResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!(ETATS_AMBULANCE as string[]).includes(etat)) return { ok: false, error: "État inconnu." };
  const avant = await lireAvant("DispensaireAmbulance", id);
  if (!avant) return { ok: false, error: "Ambulance introuvable." };
  const { error } = await admin.from("DispensaireAmbulance").update({ etat, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "ambulance", type: "ambulance.etat", cibleId: id, cibleLibelle: String(avant.nom ?? ""), avant: { etat: avant.etat }, apres: { etat } });
  return { ok: true };
}

export async function majAmbulance(id: string, patch: Record<string, unknown>): Promise<AmbResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row: Record<string, unknown> = {};
  if ("nom" in patch) { const n = s(patch.nom, 120); if (!n) return { ok: false, error: "Le nom ne peut pas être vide." }; row.nom = n; }
  if ("essence" in patch) row.essence = clampPct(patch.essence);
  if ("kilometrage" in patch) row.kilometrage = int(patch.kilometrage);
  if ("materiel" in patch) row.materiel = s(patch.materiel);
  if ("dernierEntretien" in patch) row.dernierEntretien = s(patch.dernierEntretien, 40);
  if ("note" in patch) row.note = s(patch.note, 500);
  if (!Object.keys(row).length) return { ok: true };
  const avant = await lireAvant("DispensaireAmbulance", id);
  if (!avant) return { ok: false, error: "Ambulance introuvable." };
  const { error } = await admin.from("DispensaireAmbulance").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "ambulance", type: "ambulance.maj", cibleId: id, cibleLibelle: String((avant.nom ?? row.nom) ?? ""), avant, apres: row });
  return { ok: true };
}

export async function supprimerAmbulance(id: string): Promise<AmbResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireAmbulance", id);
  const { error } = await admin.from("DispensaireAmbulance").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "ambulance", type: "ambulance.supprimee", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}
