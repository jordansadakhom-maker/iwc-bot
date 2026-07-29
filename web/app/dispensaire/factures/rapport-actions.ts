"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutFacturer } from "@/lib/dispensaire-roles";
import { getRapportData, getRapportSnapshot, getRapportConfig, enregistrerRapport, type RapportImpayes } from "@/lib/dispensaire-rapport-impayes";

// Rapport des impayés = donnée financière → réservé au droit « factures » (fail-closed).
async function habilite() { return peutFacturer(); }

// Génère (et enregistre) le rapport des impayés. Fait avancer la fenêtre
// « paiements récents » → remise à zéro automatique. Le médecin signataire (et
// son titre/grade) est choisi dans les effectifs ; à défaut, le compte connecté.
export async function genererRapportImpayes(medecin?: string, titre?: string): Promise<{ ok: boolean; error?: string; rapport?: RapportImpayes }> {
  if (!(await habilite())) return { ok: false, error: "Réservé aux chefs." };
  const nom = (medecin || "").trim() || await (async () => { try { return (await getSessionProfile())?.nom || "Le médecin de garde"; } catch { return "Le médecin de garde"; } })();
  return enregistrerRapport(nom, titre);
}

// Recharge les données du rapport courant (aperçu à la volée).
export async function rafraichirRapport(): Promise<RapportImpayes | null> {
  const { pret, rapport } = await getRapportData();
  return pret ? rapport : null;
}

// Charge le snapshot d'un rapport passé (aperçu de l'historique).
export async function chargerSnapshotRapport(id: string): Promise<RapportImpayes | null> {
  return getRapportSnapshot(id);
}

// Enregistre la planification (mode / heure / jour).
export async function setRapportConfig(patch: { mode?: string; heure?: number; jour?: number }): Promise<{ ok: boolean; error?: string }> {
  if (!(await habilite())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const cur = await getRapportConfig();
  const modes = ["manuel", "quotidien", "hebdo", "mensuel"];
  const mode = patch.mode && modes.includes(patch.mode) ? patch.mode : cur.mode;
  const heure = patch.heure != null ? Math.max(0, Math.min(23, Math.round(patch.heure))) : cur.heure;
  const jour = patch.jour != null ? Math.max(1, Math.min(31, Math.round(patch.jour))) : cur.jour;
  const { error } = await admin.from("DispensaireRapportConfig").upsert({ id: "config", mode, heure, jour, lastAutoAt: cur.lastAutoAt, updatedAt: new Date().toISOString() }, { onConflict: "id" });
  return error ? { ok: false, error: "Enregistrement impossible (lance dispensaire-rapport-config.sql ?)." } : { ok: true };
}
