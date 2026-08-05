"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { cleNom } from "@/lib/noms";
import { ETATS_RDV, PRIORITES, type EtatRDV, type Priorite } from "@/lib/dispensaire-rendez-vous-const";
import { conflitsRdv, type RdvExistant } from "@/lib/rdv-conflits";

// Rendez-vous — ouvert au personnel autorisé (accueil/planning).
export type RDVResult = { ok: boolean; error?: string; id?: string; conflit?: boolean };
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
  // Anti double-réservation : refuse si le médecin OU la salle est déjà occupé sur
  // un créneau qui chevauche (sauf « forcer »). Ne bloque jamais sur erreur technique.
  if (!data.forcer && (row.medecin || row.salle)) {
    try {
      const { data: exist } = await admin.from("DispensaireRendezVous")
        .select("id,debut,dureeMin,medecin,salle,etat")
        .gte("debut", new Date(t - 12 * 3600000).toISOString())
        .lte("debut", new Date(t + 12 * 3600000).toISOString());
      const conflits = conflitsRdv({ debut: row.debut, dureeMin: row.dureeMin, medecin: row.medecin, salle: row.salle }, (exist || []) as unknown as RdvExistant[]);
      if (conflits.length) {
        const c = conflits[0];
        const parMed = !!row.medecin && String(c.medecin ?? "").trim().toLowerCase() === String(row.medecin).trim().toLowerCase();
        const quoi = parMed ? `Le médecin « ${row.medecin} »` : `La salle « ${row.salle} »`;
        return { ok: false, conflit: true, error: `${quoi} a déjà un rendez-vous sur ce créneau. Change l'horaire, le médecin ou la salle.` };
      }
    } catch { /* la détection ne bloque jamais la création */ }
  }

  const { error } = await admin.from("DispensaireRendezVous").insert(row);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (lance dispensaire-rendez-vous.sql ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "rendez_vous", type: "rendez_vous.cree", cibleId: id, cibleLibelle: patient, apres: { patient, type: row.type, medecin: row.medecin, debut: row.debut, priorite } });
  return { ok: true, id };
}

// Modifie un rendez-vous existant (patient, date/heure, type, médecin, salle,
// priorité, motif, note). Rejoue la détection de conflit médecin/salle en
// s'excluant lui-même. Ouvert au personnel autorisé, comme la création.
export async function majRDV(id: string, patch: Record<string, unknown>): Promise<RDVResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Rendez-vous introuvable." };
  const avant = await lireAvant("DispensaireRendezVous", id);
  if (!avant) return { ok: false, error: "Rendez-vous introuvable." };

  const row: Record<string, unknown> = {};
  if ("patient" in patch) { const p = s(patch.patient, 200); if (!p) return { ok: false, error: "Indique le patient." }; row.patient = p; row.patientNormalise = cleNom(p); }
  if ("debut" in patch) { const t = Date.parse(String(patch.debut ?? "")); if (!Number.isFinite(t)) return { ok: false, error: "Indique une date et une heure valides." }; row.debut = new Date(t).toISOString(); }
  if ("type" in patch) row.type = s(patch.type, 120);
  if ("medecin" in patch) row.medecin = s(patch.medecin, 200);
  if ("salle" in patch) row.salle = s(patch.salle, 120);
  if ("priorite" in patch) row.priorite = (PRIORITES as string[]).includes(String(patch.priorite)) ? (String(patch.priorite) as Priorite) : "normale";
  if ("motif" in patch) row.motif = s(patch.motif, 500);
  if ("note" in patch) row.note = s(patch.note, 1000);
  if (!Object.keys(row).length) return { ok: true };

  // Anti double-réservation (comme à la création) : on s'exclut soi-même.
  const debut = String(("debut" in row ? row.debut : avant.debut) ?? "");
  const medecin = ("medecin" in row ? row.medecin : avant.medecin) as string | null;
  const salle = ("salle" in row ? row.salle : avant.salle) as string | null;
  const dureeMin = avant.dureeMin == null ? null : Number(avant.dureeMin) || 0;
  const t = Date.parse(debut);
  if (!patch.forcer && Number.isFinite(t) && (medecin || salle)) {
    try {
      const { data: exist } = await admin.from("DispensaireRendezVous")
        .select("id,debut,dureeMin,medecin,salle,etat")
        .gte("debut", new Date(t - 12 * 3600000).toISOString())
        .lte("debut", new Date(t + 12 * 3600000).toISOString());
      const autres = ((exist || []) as Record<string, unknown>[]).filter((e) => String(e.id) !== id) as unknown as RdvExistant[];
      const conflits = conflitsRdv({ debut, dureeMin, medecin, salle }, autres);
      if (conflits.length) {
        const c = conflits[0];
        const parMed = !!medecin && String(c.medecin ?? "").trim().toLowerCase() === String(medecin).trim().toLowerCase();
        const quoi = parMed ? `Le médecin « ${medecin} »` : `La salle « ${salle} »`;
        return { ok: false, conflit: true, error: `${quoi} a déjà un rendez-vous sur ce créneau. Change l'horaire, le médecin ou la salle.` };
      }
    } catch { /* la détection ne bloque jamais la modification */ }
  }

  const { error } = await admin.from("DispensaireRendezVous").update({ ...row, updatedBy: await qui(), updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "rendez_vous", type: "rendez_vous.maj", cibleId: id, cibleLibelle: String(row.patient ?? avant.patient ?? ""), avant, apres: row });
  return { ok: true };
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
