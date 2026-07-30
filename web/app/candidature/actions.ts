"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Chargement PUBLIC d'une candidature par son n° de dossier (ref), pour la page
// de suivi /candidature/<ref> (aucune connexion). On ne renvoie que des champs
// « sûrs » : jamais les notes internes de l'équipe, ni l'expérience/motivation.
export type SuiviCandidature = {
  trouve: boolean;
  nomRP?: string;
  statut?: string;      // nouveau / entretien / accepte / refuse
  moyen?: string | null;
  contact?: string | null;
  createdAt?: string | null;
  updatedAt?: string | null;
};

export async function chargerCandidatureParRef(ref: string): Promise<SuiviCandidature> {
  const r = (ref || "").trim();
  if (r.length < 4 || r.length > 40) return { trouve: false };
  const admin = createAdminClient();
  if (!admin) return { trouve: false };
  try {
    const { data, error } = await admin
      .from("Candidature")
      .select("nomRP,statut,moyen,contact,createdAt,updatedAt")
      .eq("ref", r)
      .maybeSingle();
    if (error || !data) return { trouve: false };
    const c = data as Record<string, unknown>;
    return {
      trouve: true,
      nomRP: String(c.nomRP || "Candidat"),
      statut: String(c.statut || "nouveau"),
      moyen: (c.moyen as string) ?? null,
      contact: (c.contact as string) ?? null,
      createdAt: (c.createdAt as string) ?? null,
      updatedAt: (c.updatedAt as string) ?? null,
    };
  } catch {
    return { trouve: false };
  }
}
