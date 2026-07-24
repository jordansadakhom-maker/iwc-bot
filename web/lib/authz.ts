/**
 * Autorisation des ÉCRITURES — fail-CLOSED.
 *
 * `getAcces()` (queries.ts) régit la NAVIGATION et suit un principe anti-verrouillage
 * (au moindre doute, on ouvre pour ne bloquer personne). Ce principe est acceptable
 * pour l'affichage, mais DANGEREUX pour les mutations : il laisse un compte sans
 * grade modifier des fiches sensibles.
 *
 * Ce module fournit la barrière inverse, à utiliser dans les Server Actions
 * sensibles : au moindre doute (pas de session, pas de fiche, erreur), on REFUSE.
 * On réutilise exactement le même mapping que getAcces (Discord provider_id → Membre.id),
 * donc aucun risque de verrouillage nouveau : un utilisateur déjà reconnu par la
 * navigation l'est aussi ici.
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export type Acteur = {
  did: string;
  grade: string;
  nomIC: string;
  direction: boolean;
  officier: boolean;
  medecin: boolean;
};

// Renvoie l'acteur connecté, ou null au moindre doute (fail-closed).
export async function getActeur(): Promise<Acteur | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const did = String(meta.provider_id || meta.sub || "");
    if (!did) return null;
    const admin = createAdminClient();
    if (!admin) return null;
    const { data } = await admin.from("Membre").select("nomIC,grade,ficheRH").eq("id", did).maybeSingle();
    if (!data) return null;
    const grade = String((data.grade as string) || "").toLowerCase();
    const nomIC = String((data.nomIC as string) || "");
    const f = data.ficheRH as Record<string, unknown> | null;
    const medecin = !!(f && typeof f === "object" && f.medecin);
    const direction = /fondateur|conseil|directeur|fl[eé]au|concepteur/.test(grade);
    const officier = direction || /officier|instructeur/.test(grade);
    return { did, grade, nomIC, direction, officier, medecin };
  } catch {
    return null;
  }
}

// Raccourcis d'assertion : renvoient l'acteur si autorisé, sinon null.
// Chacun reflète EXACTEMENT la règle déjà déclarée par la page correspondante
// (composant AccesReserve), appliquée ici au niveau des ÉCRITURES.
export async function requireOfficier(): Promise<Acteur | null> {
  const a = await getActeur();
  return a && a.officier ? a : null;
}
export async function requireDirection(): Promise<Acteur | null> {
  const a = await getActeur();
  return a && a.direction ? a : null;
}
// Médical : « réservé au médecin de la compagnie et à la Direction ».
export async function requireMedical(): Promise<Acteur | null> {
  const a = await getActeur();
  return a && (a.direction || a.medecin) ? a : null;
}
// Renseignement : « réservé à la Direction et aux officiers de terrain » = officier.
export async function requireRenseignement(): Promise<Acteur | null> {
  const a = await getActeur();
  return a && a.officier ? a : null;
}
