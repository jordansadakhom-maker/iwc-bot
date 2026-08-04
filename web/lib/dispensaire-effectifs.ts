import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estSalarieActif } from "@/lib/dispensaire-personnel-const";

// Liste des médecins/praticiens tirée des EFFECTIFS (table DispensaireSalarie),
// hors renvoyés. Source unique pour les menus déroulants « médecin » (factures,
// certificats…) : ajouter/retirer un salarié dans les effectifs met à jour ces
// listes automatiquement, sans aucune saisie manuelle.
export type MedecinEffectif = { nom: string; grade: string | null };
// Résultat enrichi : `ok` distingue « chargé (peut être vide) » d'un « échec de
// chargement » (base injoignable / erreur réseau transitoire). Indispensable pour
// que l'UI n'affiche pas « aucun médecin » alors que c'est un simple raté réseau.
export type MedecinsResult = { ok: boolean; medecins: MedecinEffectif[] };

function toMedecins(data: unknown): MedecinEffectif[] {
  return ((data || []) as Record<string, unknown>[])
    .filter((r) => estSalarieActif(r.statut))
    .map((r) => ({ nom: String(r.nom || "").trim(), grade: r.grade == null ? null : String(r.grade) }))
    .filter((m) => m.nom);
}

// Récupère les médecins avec PLUSIEURS TENTATIVES : un raté réseau transitoire ne
// renvoie plus une liste vide silencieuse. On ne retente QUE sur erreur/exception
// (une base réellement vide renvoie ok:true avec 0 médecin — pas d'attente inutile).
export async function getMedecinsEffectifsResult(): Promise<MedecinsResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, medecins: [] };
  for (let essai = 0; essai < 3; essai++) {
    try {
      const { data, error } = await admin
        .from("DispensaireSalarie")
        .select("nom,grade,statut")
        .order("nom", { ascending: true });
      if (!error) return { ok: true, medecins: toMedecins(data) };
    } catch { /* transitoire → on retente */ }
    if (essai < 2) await new Promise((r) => setTimeout(r, 250 * (essai + 1)));
  }
  return { ok: false, medecins: [] };
}

export async function getMedecinsEffectifs(): Promise<MedecinEffectif[]> {
  return (await getMedecinsEffectifsResult()).medecins;
}
