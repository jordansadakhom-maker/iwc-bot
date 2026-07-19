"use server";

import { db, newId } from "@/lib/supabase";

type R = { ok: boolean; error?: string };

// ── Prise / fin de service (chrono des heures) ───────────────────
export async function prendreService(salarieNom: string): Promise<R> {
  const nom = String(salarieNom || "").trim().slice(0, 120);
  if (nom.length < 2) return { ok: false, error: "Indique ton nom." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  // Empêche un double pointage ouvert pour la même personne.
  const { data: ouvert } = await sb.from("DispPointage").select("id").eq("salarieNom", nom).is("fin", null).limit(1);
  if (Array.isArray(ouvert) && ouvert.length) return { ok: false, error: "Tu es déjà en service." };
  const { error } = await sb.from("DispPointage").insert({ id: newId("ptg"), salarieNom: nom, debut: new Date().toISOString() });
  return error ? { ok: false, error: "Enregistrement impossible — la table n'existe peut-être pas encore (exécute sql/init.sql)." } : { ok: true };
}

export async function finService(pointageId: string): Promise<R> {
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispPointage").select("debut").eq("id", pointageId).maybeSingle();
  if (!data) return { ok: false, error: "Pointage introuvable." };
  const debut = new Date(String((data as { debut: string }).debut)).getTime();
  const minutes = Math.max(0, Math.round((Date.now() - debut) / 60000));
  const { error } = await sb.from("DispPointage").update({ fin: new Date().toISOString(), minutes }).eq("id", pointageId);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

// ── Ajustement de stock + traçabilité ────────────────────────────
export async function ajusterStock(stockId: string, delta: number, auteur: string, motif?: string): Promise<R> {
  const d = Math.round(Number(delta) || 0);
  if (!d) return { ok: false, error: "Aucun changement." };
  const sb = db(); if (!sb) return { ok: false, error: "Base non configurée." };
  const { data } = await sb.from("DispStock").select("nom,quantite").eq("id", stockId).maybeSingle();
  if (!data) return { ok: false, error: "Article introuvable." };
  const avant = Number((data as { quantite: number }).quantite) || 0;
  const apres = Math.max(0, avant + d);
  await sb.from("DispStock").update({ quantite: apres }).eq("id", stockId);
  await sb.from("DispMouvement").insert({
    id: newId("mvt"), stockId, stockNom: String((data as { nom: string }).nom || ""),
    delta: apres - avant, quantiteApres: apres, auteur: String(auteur || "—").slice(0, 120), motif: motif ? String(motif).slice(0, 200) : null,
    createdAt: new Date().toISOString(),
  });
  return { ok: true };
}
