"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { versCentreNotif, type CentreNotif } from "@/lib/notifications-centre";

// Centre de notifications — lecture & actions (lu / archivé / supprimé).
// Réservé aux membres connectés (le layout (app) protège déjà l'affichage ;
// on refait la vérification ici pour l'appel direct de l'action).

async function membreConnecte(): Promise<string | null> {
  try { return (await getSessionProfile())?.nom || null; } catch { return null; }
}

const COLS = "id,type,titre,corps,lien,clientNom,cibleId,lu,luAt,archive,createdAt";

export async function listerNotifications(): Promise<{ connecte: boolean; notifs: CentreNotif[] }> {
  if (!(await membreConnecte())) return { connecte: false, notifs: [] };
  const admin = createAdminClient();
  if (!admin) return { connecte: false, notifs: [] };
  const { data, error } = await admin.from("Notification").select(COLS).order("createdAt", { ascending: false }).limit(200);
  if (error) return { connecte: false, notifs: [] };
  return { connecte: true, notifs: ((data || []) as Record<string, unknown>[]).map(versCentreNotif) };
}

// Compteur léger des non-lues actives (pastille rouge) — jamais d'erreur bloquante.
export async function compterNotifsNonLues(): Promise<number> {
  try {
    const admin = createAdminClient();
    if (!admin) return 0;
    const { count } = await admin.from("Notification").select("id", { count: "exact", head: true }).eq("lu", false).eq("archive", false);
    return count || 0;
  } catch { return 0; }
}

export async function marquerNotifLue(id: string, lu = true): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false };
  const patch: Record<string, unknown> = { lu, luAt: lu ? new Date().toISOString() : null };
  const { error } = await admin.from("Notification").update(patch).eq("id", id);
  return { ok: !error };
}

export async function marquerToutesLues(): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin) return { ok: false };
  const { error } = await admin.from("Notification").update({ lu: true, luAt: new Date().toISOString() }).eq("lu", false).eq("archive", false);
  return { ok: !error };
}

export async function archiverNotif(id: string, archive = true): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false };
  // Archiver marque aussi comme lu (elle sort du compteur des non-lues).
  const patch: Record<string, unknown> = archive ? { archive: true, lu: true } : { archive: false };
  const { error } = await admin.from("Notification").update(patch).eq("id", id);
  return { ok: !error };
}

export async function supprimerNotif(id: string): Promise<{ ok: boolean }> {
  if (!(await membreConnecte())) return { ok: false };
  const admin = createAdminClient();
  if (!admin || !id) return { ok: false };
  const { error } = await admin.from("Notification").delete().eq("id", id);
  return { ok: !error };
}
