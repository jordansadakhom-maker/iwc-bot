"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// ═══════════════════════════════════════════════════════════════
//  Carte — écriture WEB-NATIVE (tables CartePointWeb / CarteRouteWeb /
//  CarteConfig). Séparées des tables du bot (réconciliées) → jamais
//  effacées. Suppressions fiables (delete direct en base).
// ═══════════════════════════════════════════════════════════════

export type CarteResult = { ok: boolean; error?: string; id?: string };

const NIVEAUX = ["public", "membre", "confidentiel"];
const s = (v: unknown, max = 200) => String(v ?? "").trim().slice(0, max);
const clampXY = (v: unknown) => Math.min(100, Math.max(0, Math.round((Number(v) || 0) * 100) / 100));
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// ── Lieux ────────────────────────────────────────────────────────
export async function creerLieu(input: { nom: string; type: string; niveau: string; region?: string; lieu?: string; notes?: string; x: number; y: number; par?: string }): Promise<CarteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(input.nom, 120);
  if (!nom) return { ok: false, error: "Donne un nom au lieu." };
  const id = newId("cpw");
  const row = {
    id, nom, type: s(input.type, 40) || "autre",
    niveau: NIVEAUX.includes(input.niveau) ? input.niveau : "public",
    region: s(input.region, 60) || null, lieu: s(input.lieu, 200) || null, notes: s(input.notes, 1000) || null,
    x: clampXY(input.x), y: clampXY(input.y), par: s(input.par, 80) || null,
  };
  const { error } = await admin.from("CartePointWeb").insert(row);
  return error ? { ok: false, error: "Création impossible (la table CartePointWeb existe-t-elle ?)." } : { ok: true, id };
}

export async function majLieu(id: string, patch: { nom?: string; type?: string; niveau?: string; region?: string; lieu?: string; notes?: string; x?: number; y?: number }): Promise<CarteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Lieu introuvable." };
  const up: Record<string, unknown> = {};
  if (patch.nom !== undefined) up.nom = s(patch.nom, 120);
  if (patch.type !== undefined) up.type = s(patch.type, 40) || "autre";
  if (patch.niveau !== undefined) up.niveau = NIVEAUX.includes(patch.niveau) ? patch.niveau : "public";
  if (patch.region !== undefined) up.region = s(patch.region, 60) || null;
  if (patch.lieu !== undefined) up.lieu = s(patch.lieu, 200) || null;
  if (patch.notes !== undefined) up.notes = s(patch.notes, 1000) || null;
  if (patch.x !== undefined) up.x = clampXY(patch.x);
  if (patch.y !== undefined) up.y = clampXY(patch.y);
  if (!Object.keys(up).length) return { ok: true };
  const { error } = await admin.from("CartePointWeb").update(up).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerLieu(id: string): Promise<CarteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Lieu introuvable." };
  const { error } = await admin.from("CartePointWeb").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Itinéraires ──────────────────────────────────────────────────
export async function creerItineraire(input: { nom: string; type: string; niveau: string; notes?: string; points: { x: number; y: number }[]; par?: string }): Promise<CarteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(input.nom, 120);
  if (!nom) return { ok: false, error: "Donne un nom à l'itinéraire." };
  const pts = (Array.isArray(input.points) ? input.points : [])
    .map((p) => ({ x: clampXY(p.x), y: clampXY(p.y) }))
    .filter((p) => Number.isFinite(p.x) && Number.isFinite(p.y))
    .slice(0, 200);
  if (pts.length < 2) return { ok: false, error: "Un itinéraire a besoin d'au moins 2 points." };
  const id = newId("crw");
  const row = {
    id, nom, type: s(input.type, 40) || "autre",
    niveau: NIVEAUX.includes(input.niveau) ? input.niveau : "public",
    notes: s(input.notes, 1000) || null, points: pts, par: s(input.par, 80) || null,
  };
  const { error } = await admin.from("CarteRouteWeb").insert(row);
  return error ? { ok: false, error: "Création impossible (la table CarteRouteWeb existe-t-elle ?)." } : { ok: true, id };
}

export async function supprimerItineraire(id: string): Promise<CarteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Itinéraire introuvable." };
  const { error } = await admin.from("CarteRouteWeb").delete().eq("id", id);
  return error ? { ok: false, error: "Suppression impossible." } : { ok: true };
}

// ── Fond de carte (image) ───────────────────────────────────────
export async function definirFondCarte(url: string): Promise<CarteResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const valeur = s(url, 600);
  if (valeur && !/^https?:\/\//.test(valeur)) return { ok: false, error: "URL d'image invalide." };
  const { error } = await admin.from("CarteConfig").upsert({ cle: "image", valeur: valeur || null, updatedAt: new Date().toISOString() }, { onConflict: "cle" });
  return error ? { ok: false, error: "Enregistrement impossible (la table CarteConfig existe-t-elle ?)." } : { ok: true };
}
