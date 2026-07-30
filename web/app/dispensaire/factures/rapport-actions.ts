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
// `factureIds` : sélection explicite des factures patient à déclarer (le rapport
// ne contiendra qu'elles). Absent → uniquement les factures réellement en retard.
export async function genererRapportImpayes(opts?: { medecin?: string; titre?: string; factureIds?: string[]; seuil?: number }): Promise<{ ok: boolean; error?: string; rapport?: RapportImpayes }> {
  if (!(await habilite())) return { ok: false, error: "Réservé aux chefs." };
  const nom = (opts?.medecin || "").trim() || await (async () => { try { return (await getSessionProfile())?.nom || "Le médecin de garde"; } catch { return "Le médecin de garde"; } })();
  const factureIds = Array.isArray(opts?.factureIds) ? opts!.factureIds.map((s) => String(s)).slice(0, 500) : undefined;
  const seuil = opts?.seuil != null ? Math.max(0, Math.min(365, Math.round(opts.seuil))) : undefined;
  return enregistrerRapport(nom, opts?.titre, { factureIds, seuil });
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

// Enregistre la planification (mode / heure / jour) et le délai de retard (jours).
export async function setRapportConfig(patch: { mode?: string; heure?: number; jour?: number; joursRetard?: number }): Promise<{ ok: boolean; error?: string }> {
  if (!(await habilite())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const cur = await getRapportConfig();
  const modes = ["manuel", "quotidien", "hebdo", "mensuel"];
  const mode = patch.mode && modes.includes(patch.mode) ? patch.mode : cur.mode;
  const heure = patch.heure != null ? Math.max(0, Math.min(23, Math.round(patch.heure))) : cur.heure;
  const jour = patch.jour != null ? Math.max(1, Math.min(31, Math.round(patch.jour))) : cur.jour;
  const joursRetard = patch.joursRetard != null ? Math.max(0, Math.min(365, Math.round(patch.joursRetard))) : cur.joursRetard;
  const row: Record<string, unknown> = { id: "config", mode, heure, jour, lastAutoAt: cur.lastAutoAt, updatedAt: new Date().toISOString() };
  // Colonne joursRetard optionnelle : si la migration n'est pas passée, on réessaie sans.
  let { error } = await admin.from("DispensaireRapportConfig").upsert({ ...row, joursRetard }, { onConflict: "id" });
  if (error && /joursRetard/i.test(error.message || "")) ({ error } = await admin.from("DispensaireRapportConfig").upsert(row, { onConflict: "id" }));
  return error ? { ok: false, error: "Enregistrement impossible (lance dispensaire-rapport-config.sql ?)." } : { ok: true };
}
