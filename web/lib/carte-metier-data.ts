import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { cartographier, type Cartographie, type MembreCarte } from "@/lib/carte-metier";
import { normNom } from "@/lib/roles";
import { getActeur } from "@/lib/authz";

// Membre assignable depuis la Carte métier (fonctions éditables côté site).
export type MembreAssign = { id: string; nom: string; grade: string | null; medecin: boolean; instructeur: boolean; armurier: boolean };
export type CarteMetierData = {
  connecte: boolean;
  carto: Cartographie;
  membres: MembreAssign[];
  peut: { direction: boolean; officier: boolean };
};

// Lecture réelle des membres → cartographie des métiers. Résilient : si la colonne
// ficheRH n'existe pas encore, on retombe sur la sélection de base (comme getMembres).
export async function getCarteMetier(): Promise<CarteMetierData> {
  const vide: Cartographie = { metiers: cartographier([]).metiers, nonClasses: [], total: 0 };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, carto: vide, membres: [], peut: { direction: false, officier: false } };
  const acteur = await getActeur();
  const peut = { direction: !!acteur?.direction, officier: !!acteur?.officier };

  let rows: Record<string, unknown>[] = [];
  const avec = await admin.from("Membre").select("id,nomIC,grade,statut,ficheRH").order("nomIC", { ascending: true });
  if (avec.error) {
    const base = await admin.from("Membre").select("id,nomIC,grade,statut").order("nomIC", { ascending: true });
    if (base.error) return { connecte: false, carto: vide, membres: [], peut };
    rows = (base.data || []) as Record<string, unknown>[];
  } else {
    rows = (avec.data || []) as Record<string, unknown>[];
  }

  // Roster de l'Armurerie : un employé au roster (par ID Discord ou nom IC) est
  // reconnu « Armurerie » même si son grade ne contient pas « armur » — aligne la
  // carte sur l'accès réel (getAcces), levant l'ancienne désynchro.
  const rosterIds = new Set<string>();
  const rosterNoms = new Set<string>();
  try {
    const { data: emp } = await admin.from("ArmurerieEmploye").select("discordId,nom");
    for (const e of (emp || []) as Record<string, unknown>[]) {
      if (e.discordId) rosterIds.add(String(e.discordId));
      if (e.nom) rosterNoms.add(normNom(e.nom));
    }
  } catch { /* roster indisponible → dérivation par grade/spécialité seule */ }

  const membres: MembreCarte[] = rows.map((m) => {
    const f = (m.ficheRH && typeof m.ficheRH === "object") ? (m.ficheRH as Record<string, unknown>) : null;
    const nom = String(m.nomIC || m.id || "Membre");
    return {
      nom,
      grade: (m.grade as string) ?? null,
      statut: String(m.statut || ""),
      medecin: !!(f && f.medecin),
      specialite: f && f.specialite ? String(f.specialite) : null,
      armurierRoster: rosterIds.has(String(m.id || "")) || rosterNoms.has(normNom(m.nomIC)),
    };
  });

  // Liste assignable (avec id) : sert au sélecteur de membres de la Carte métier.
  const assignables: MembreAssign[] = rows.map((m) => {
    const f = (m.ficheRH && typeof m.ficheRH === "object") ? (m.ficheRH as Record<string, unknown>) : null;
    const spec = f && f.specialite ? String(f.specialite) : "";
    return {
      id: String(m.id || ""),
      nom: String(m.nomIC || m.id || "Membre"),
      grade: (m.grade as string) ?? null,
      medecin: !!(f && f.medecin),
      instructeur: /instruct/i.test(spec),
      armurier: rosterIds.has(String(m.id || "")) || rosterNoms.has(normNom(m.nomIC)),
    };
  }).filter((m) => m.id);

  return { connecte: true, carto: cartographier(membres), membres: assignables, peut };
}
