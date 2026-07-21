"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import type { FicheRH } from "@/lib/queries";

// Met à jour la FICHE RH d'un membre (champ site-native « ficheRH » sur la table
// Membre). Écriture directe : le bot ne touche jamais cette colonne, donc aucun
// conflit avec la synchro Discord (le grade/nom restent gérés côté Discord).
export type FicheResult = { ok: boolean; error?: string };

export async function majFicheMembre(id: string, fiche: FicheRH): Promise<FicheResult> {
  const membreId = String(id || "").trim();
  if (!membreId) return { ok: false, error: "Membre introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };

  const clean = (v: unknown, max: number) => String(v ?? "").trim().slice(0, max);
  const propre: FicheRH = {
    specialite: clean(fiche.specialite, 80),
    statutInterne: clean(fiche.statutInterne, 60),
    salaire: Math.max(0, Math.round(Number(fiche.salaire) || 0)),
    notes: clean(fiche.notes, 1500),
    // Habilitation médecin : donne accès à l'onglet Médical (voir getAcces).
    medecin: !!fiche.medecin,
  };

  const { error } = await admin.from("Membre").update({ ficheRH: propre }).eq("id", membreId);
  if (error) {
    if (/ficheRH|column|does not exist|schema cache/i.test(error.message)) {
      return { ok: false, error: "La fiche RH n'est pas encore prête côté base — exécute membre-fiche-rh.sql dans Supabase." };
    }
    return { ok: false, error: "Enregistrement impossible pour le moment." };
  }
  return { ok: true };
}
