import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estSalarieActif } from "@/lib/dispensaire-personnel-const";

// Liste des médecins/praticiens tirée des EFFECTIFS (table DispensaireSalarie),
// hors renvoyés. Source unique pour les menus déroulants « médecin » (factures,
// certificats…) : ajouter/retirer un salarié dans les effectifs met à jour ces
// listes automatiquement, sans aucune saisie manuelle.
export type MedecinEffectif = { nom: string; grade: string | null };

export async function getMedecinsEffectifs(): Promise<MedecinEffectif[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data, error } = await admin
      .from("DispensaireSalarie")
      .select("nom,grade,statut")
      .order("nom", { ascending: true });
    if (error) return [];
    return ((data || []) as Record<string, unknown>[])
      .filter((r) => estSalarieActif(r.statut))
      .map((r) => ({ nom: String(r.nom || "").trim(), grade: r.grade == null ? null : String(r.grade) }))
      .filter((m) => m.nom);
  } catch {
    return [];
  }
}
