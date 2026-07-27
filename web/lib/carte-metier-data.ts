import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cartographier, type Cartographie, type MembreCarte } from "@/lib/carte-metier";

// Lecture réelle des membres → cartographie des métiers. Résilient : si la colonne
// ficheRH n'existe pas encore, on retombe sur la sélection de base (comme getMembres).
export async function getCarteMetier(): Promise<{ connecte: boolean; carto: Cartographie }> {
  const vide: Cartographie = { metiers: cartographier([]).metiers, nonClasses: [], total: 0 };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, carto: vide };

  let rows: Record<string, unknown>[] = [];
  const avec = await admin.from("Membre").select("nomIC,grade,statut,ficheRH").order("nomIC", { ascending: true });
  if (avec.error) {
    const base = await admin.from("Membre").select("nomIC,grade,statut").order("nomIC", { ascending: true });
    if (base.error) return { connecte: false, carto: vide };
    rows = (base.data || []) as Record<string, unknown>[];
  } else {
    rows = (avec.data || []) as Record<string, unknown>[];
  }

  const membres: MembreCarte[] = rows.map((m) => {
    const f = (m.ficheRH && typeof m.ficheRH === "object") ? (m.ficheRH as Record<string, unknown>) : null;
    return {
      nom: String(m.nomIC || m.id || "Membre"),
      grade: (m.grade as string) ?? null,
      statut: String(m.statut || ""),
      medecin: !!(f && f.medecin),
      specialite: f && f.specialite ? String(f.specialite) : null,
    };
  });

  return { connecte: true, carto: cartographier(membres) };
}
