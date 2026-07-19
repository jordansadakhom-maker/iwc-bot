"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Gestion des candidatures (recrutement). Table site-native Candidature :
// écrite directement via la clé service, jamais réconciliée par le bot.

export type CandResult = { ok: boolean; error?: string };
const s = (v: unknown, max = 2000): string | null => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const STATUTS = ["nouveau", "entretien", "accepte", "refuse"];

export async function majStatutCandidature(id: string, statut: string): Promise<CandResult> {
  if (!id) return { ok: false, error: "Candidature introuvable." };
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut inconnu." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("Candidature").update({ statut, updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function majNotesCandidature(id: string, notes: string): Promise<CandResult> {
  if (!id) return { ok: false, error: "Candidature introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("Candidature").update({ notes: s(notes, 2000), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerCandidature(id: string): Promise<CandResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("Candidature").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}
