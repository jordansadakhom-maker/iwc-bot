"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";

// Pointage — outil de service partagé (ouvert à toute personne connectée).
export type PointResult = { ok: boolean; error?: string; id?: string };

const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

// Prendre le service : ouvre une ligne (début = maintenant). Bloque si le salarié
// a déjà un service ouvert.
export async function prendreService(data: { salarieId?: string | null; nom: string }): Promise<PointResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom);
  if (!nom) return { ok: false, error: "Choisis un salarié." };
  const salarieId = s(data.salarieId ?? undefined);

  // Un seul service ouvert par salarié à la fois.
  let dejaOuvert;
  if (salarieId) dejaOuvert = await admin.from("DispensairePointage").select("id").eq("salarieId", salarieId).is("fin", null).maybeSingle();
  else dejaOuvert = await admin.from("DispensairePointage").select("id").eq("nom", nom).is("fin", null).maybeSingle();
  if (dejaOuvert?.data) return { ok: false, error: `${nom} est déjà en service.` };

  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensairePointage").insert({ id, salarieId, nom, debut: now, updatedBy: await qui(), updatedAt: now });
  return error ? { ok: false, error: "Prise de service impossible (la table existe-t-elle ?)." } : { ok: true, id };
}

// Terminer le service : renseigne la fin et calcule la durée (minutes).
export async function terminerService(id: string): Promise<PointResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Service introuvable." };
  const { data: ex } = await admin.from("DispensairePointage").select("id,debut,fin").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Service introuvable." };
  if ((ex as Record<string, unknown>).fin) return { ok: true };            // déjà clôturé
  const fin = new Date();
  const debut = new Date(String((ex as Record<string, unknown>).debut));
  const dureeMin = Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
  const { error } = await admin.from("DispensairePointage").update({ fin: fin.toISOString(), dureeMin, updatedBy: await qui(), updatedAt: fin.toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Clôture impossible." } : { ok: true };
}

// Correction : supprimer une ligne de pointage.
export async function supprimerPointage(id: string): Promise<PointResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { error } = await admin.from("DispensairePointage").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
