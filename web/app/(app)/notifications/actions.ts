"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSessionProfile, getAcces } from "@/lib/queries";
import { versCentreNotif, type CentreNotif } from "@/lib/notifications-centre";
import { rolesDeActeur, notifVisiblePour, orCibleNotif, type CibleActeur } from "@/lib/notif-ciblage";

// Centre de notifications — lecture & actions (lu / archivé / supprimé).
// Réservé aux membres connectés (le layout (app) protège déjà l'affichage ;
// on refait la vérification ici pour l'appel direct de l'action).

async function membreConnecte(): Promise<string | null> {
  try { return (await getSessionProfile())?.nom || null; } catch { return null; }
}

// Id Discord du membre connecté (pour le ciblage). null si non résolu.
async function monId(): Promise<string | null> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const meta = (user?.user_metadata || {}) as Record<string, unknown>;
    const id = String(meta.provider_id || meta.sub || "");
    return /^\d{5,}$/.test(id) ? id : null;
  } catch { return null; }
}

// Acteur de ciblage : id + rôles (membre / rôle / équipe).
async function monCiblage(): Promise<CibleActeur> {
  const [did, acces] = await Promise.all([monId(), getAcces().catch(() => ({}))]);
  return { did, roles: rolesDeActeur(acces) };
}

// Garde de PROPRIÉTÉ : le membre connecté a-t-il le droit d'agir sur CETTE
// notification ? (équipe, ou ciblée sur lui). Empêche d'altérer ou de supprimer
// la notification d'un autre membre en devinant son id.
async function peutAgirSurNotif(admin: NonNullable<ReturnType<typeof createAdminClient>>, id: string): Promise<boolean> {
  try {
    const { data } = await admin.from("Notification").select("membreId,roleCible").eq("id", id).maybeSingle();
    if (!data) return false;
    return notifVisiblePour(data as { membreId?: string | null; roleCible?: string | null }, await monCiblage());
  } catch { return false; }
}

export async function listerNotifications(): Promise<{ connecte: boolean; notifs: CentreNotif[] }> {
  if (!(await membreConnecte())) return { connecte: false, notifs: [] };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, notifs: [] };
  const { data, error } = await admin.from("Notification").select("id,type,titre,corps,lien,clientNom,cibleId,lu,luAt,archive,createdAt,membreId,roleCible").order("createdAt", { ascending: false }).limit(200);
  if (error) return { connecte: false, notifs: [] };
  const cible = await monCiblage();
  // Ciblage : équipe (membreId & roleCible null) → tous ; ciblée membre → lui ;
  // ciblée rôle → les porteurs du rôle.
  const rows = ((data || []) as Record<string, unknown>[]).filter((r) => notifVisiblePour(r as { membreId?: string | null; roleCible?: string | null }, cible));
  return { connecte: true, notifs: rows.map(versCentreNotif) };
}

// Compteur léger des non-lues actives (pastille rouge) — jamais d'erreur bloquante.
export async function compterNotifsNonLues(): Promise<number> {
  try {
    const admin = createAdminClient();
    if (!admin) return 0;
    const cible = await monCiblage();
    const { count } = await admin.from("Notification").select("id", { count: "exact", head: true }).eq("lu", false).eq("archive", false).or(orCibleNotif(cible));
    return count || 0;
  } catch { return 0; }
}

export async function marquerNotifLue(id: string, lu = true): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false };
  if (!(await peutAgirSurNotif(admin, id))) return { ok: false };
  const patch: Record<string, unknown> = { lu, luAt: lu ? new Date().toISOString() : null };
  const { error } = await admin.from("Notification").update(patch).eq("id", id);
  return { ok: !error };
}

export async function marquerToutesLues(): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin) return { ok: false };
  // Ciblage : ne marque lues QUE les notifications visibles par ce membre (équipe
  // + les siennes) — plus de « tout le monde marqué lu » pour un clic d'un seul.
  const cible = await monCiblage();
  const { error } = await admin.from("Notification").update({ lu: true, luAt: new Date().toISOString() }).eq("lu", false).eq("archive", false).or(orCibleNotif(cible));
  return { ok: !error };
}

export async function archiverNotif(id: string, archive = true): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false };
  if (!(await peutAgirSurNotif(admin, id))) return { ok: false };
  // Archiver marque aussi comme lu (elle sort du compteur des non-lues).
  const patch: Record<string, unknown> = archive ? { archive: true, lu: true } : { archive: false };
  const { error } = await admin.from("Notification").update(patch).eq("id", id);
  return { ok: !error };
}

export async function supprimerNotif(id: string): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false };
  if (!(await peutAgirSurNotif(admin, id))) return { ok: false };
  const { error } = await admin.from("Notification").delete().eq("id", id);
  return { ok: !error };
}
