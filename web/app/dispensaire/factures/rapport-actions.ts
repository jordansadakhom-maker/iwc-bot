"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";
import { getRapportData, getRapportSnapshot, type RapportImpayes } from "@/lib/dispensaire-rapport-impayes";

// Recharge les données du rapport courant (aperçu à la volée).
export async function rafraichirRapport(): Promise<RapportImpayes | null> {
  const { pret, rapport } = await getRapportData();
  return pret ? rapport : null;
}

// Charge le snapshot d'un rapport passé (aperçu de l'historique).
export async function chargerSnapshotRapport(id: string): Promise<RapportImpayes | null> {
  return getRapportSnapshot(id);
}

// Génère (et enregistre) le rapport des impayés. L'enregistrement fige un
// instantané et fait avancer la fenêtre « paiements récents » → remise à zéro.
export async function genererRapportImpayes(): Promise<{ ok: boolean; error?: string; rapport?: RapportImpayes }> {
  let habilite = true;
  try { habilite = (await getAcces()).peutMedical; } catch { habilite = true; }
  if (!habilite) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { pret, rapport } = await getRapportData();
  if (!pret) return { ok: false, error: "Données indisponibles (lance les SQL du dispensaire)." };
  const id = `dri-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { error } = await admin.from("DispensaireRapportImpayes").insert({
    id, at: rapport.genereLe, par: rapport.medecin, depuis: rapport.depuis,
    nbImpayes: rapport.impayes.length, nbPaiements: rapport.payes.length, snapshot: rapport,
  });
  if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-rapport-impayes.sql ?)." };
  return { ok: true, rapport };
}
