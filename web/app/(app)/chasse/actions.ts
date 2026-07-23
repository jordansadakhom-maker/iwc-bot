"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { lireStockDepuisImage, type LigneStock } from "@/lib/vision";
import { getSessionProfile } from "@/lib/queries";

// ═══════════════════════════════════════════════════════════════
//  Services du module Chasse (site-native, écriture directe Supabase).
//  Aucune commande bot : suppressions/éditions fiables par construction.
//
//  · InventoryService : ajusterChasse, importerStockChasse
//  · HistoryService   : chaque écriture trace un ChasseMouvement
//  · HuntingService   : deplacerChasse, seuil, capacité, zones, suppression
//  · OCRService       : lireStockChasse (→ lib/vision)
// ═══════════════════════════════════════════════════════════════

export type ChasseResult = { ok: boolean; error?: string; apres?: number; deplace?: number; count?: number };

type Mode = "add" | "remove" | "set";
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

const s = (v: unknown, max = 120) => String(v ?? "").trim().slice(0, max);
const clampQ = (q: unknown) => Math.max(0, Math.round(Number(q) || 0));
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]/g, "");
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Identité de l'acteur, résolue CÔTÉ SERVEUR (nom IC de la session) pour que
// chaque mouvement soit attribué même si le client ne transmet rien. Repli sur
// la valeur éventuellement fournie.
async function acteur(fourni?: string | null): Promise<string | null> {
  try { const p = await getSessionProfile(); if (p?.nom) return String(p.nom).slice(0, 120); } catch { /* session indisponible */ }
  const f = (fourni || "").trim();
  return f ? f.slice(0, 120) : null;
}

// HistoryService — trace un mouvement (best-effort : n'échoue jamais l'action).
async function ecrireMouvement(admin: Admin, m: {
  zoneId: string; cibleZoneId?: string | null; nom: string; type: string;
  delta: number; avant: number | null; apres: number | null; par?: string | null; commentaire?: string | null;
}) {
  try {
    await admin.from("ChasseMouvement").insert({
      id: newId("cmv"), zoneId: m.zoneId, cibleZoneId: m.cibleZoneId ?? null, nom: m.nom, type: m.type,
      delta: m.delta, avant: m.avant, apres: m.apres, par: m.par ?? null, commentaire: m.commentaire ?? null,
    });
  } catch { /* la traçabilité est un plus — on n'échoue pas le mouvement de stock pour ça */ }
}

// Cœur : applique un mouvement (add/remove/set) sur une (zone, ressource) et trace.
async function appliquer(admin: Admin, o: {
  zoneId: string; nom: string; mode: Mode; quantite: number; type?: string;
  categorie?: string | null; seuil?: number | null; cibleZoneId?: string | null; par?: string | null; commentaire?: string | null;
}): Promise<{ ok: boolean; avant: number; apres: number; error?: string }> {
  const nom = s(o.nom, 100);
  if (!nom) return { ok: false, avant: 0, apres: 0, error: "Nom de ressource manquant." };
  const q = clampQ(o.quantite);

  const { data: ex } = await admin.from("ChasseStock").select("id,quantite").eq("zoneId", o.zoneId).ilike("nom", nom).limit(1).maybeSingle();
  const avant = ex ? Number(ex.quantite) || 0 : 0;
  const apres = o.mode === "add" ? avant + q : o.mode === "remove" ? Math.max(0, avant - q) : q;

  if (ex) {
    const patch: Record<string, unknown> = { quantite: apres, updatedAt: new Date().toISOString() };
    if (o.categorie != null) patch.categorie = s(o.categorie, 60);
    if (o.seuil !== undefined) patch.seuil = o.seuil == null ? null : clampQ(o.seuil);
    const { error } = await admin.from("ChasseStock").update(patch).eq("id", (ex as { id: string }).id);
    if (error) return { ok: false, avant, apres, error: "Enregistrement impossible." };
  } else {
    const row: Record<string, unknown> = { id: newId("cst"), zoneId: o.zoneId, nom, quantite: apres, updatedAt: new Date().toISOString() };
    if (o.categorie != null) row.categorie = s(o.categorie, 60);
    if (o.seuil != null) row.seuil = clampQ(o.seuil);
    const { error } = await admin.from("ChasseStock").insert(row);
    if (error) return { ok: false, avant, apres, error: "Création impossible." };
  }

  const type = o.type || (o.mode === "remove" ? "retrait" : o.mode === "set" ? "correction" : "ajout");
  await ecrireMouvement(admin, { zoneId: o.zoneId, cibleZoneId: o.cibleZoneId ?? null, nom, type, delta: apres - avant, avant, apres, par: o.par, commentaire: o.commentaire });
  return { ok: true, avant, apres };
}

// ── InventoryService : ajouter / retirer / corriger une ressource ──
export async function ajusterChasse(input: {
  zoneId: string; nom: string; mode: Mode; quantite: number;
  categorie?: string | null; seuil?: number | null; par?: string | null; commentaire?: string | null;
}): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const zoneId = s(input.zoneId, 40);
  if (!zoneId) return { ok: false, error: "Zone manquante." };
  const mode: Mode = input.mode === "remove" ? "remove" : input.mode === "set" ? "set" : "add";
  const r = await appliquer(admin, { ...input, zoneId, mode, par: await acteur(input.par) });
  return r.ok ? { ok: true, apres: r.apres } : { ok: false, error: r.error };
}

// ── HuntingService : déplacer une ressource entre deux zones ──────
export async function deplacerChasse(input: { nom: string; deZone: string; versZone: string; quantite: number; par?: string | null }): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(input.nom, 100), de = s(input.deZone, 40), vers = s(input.versZone, 40);
  if (!nom || !de || !vers) return { ok: false, error: "Champs manquants." };
  if (de === vers) return { ok: false, error: "Choisis deux zones différentes." };
  const q = clampQ(input.quantite);
  if (q <= 0) return { ok: false, error: "Quantité invalide." };

  const { data: src } = await admin.from("ChasseStock").select("quantite").eq("zoneId", de).ilike("nom", nom).limit(1).maybeSingle();
  const dispo = src ? Number((src as { quantite: number }).quantite) || 0 : 0;
  if (dispo <= 0) return { ok: false, error: `Rien à déplacer — « ${nom} » est absent de la zone de départ.` };
  const moved = Math.min(q, dispo);
  const par = await acteur(input.par);

  await appliquer(admin, { zoneId: de, nom, mode: "remove", quantite: moved, type: "transfert", cibleZoneId: vers, par, commentaire: `Transfert vers ${vers}` });
  const r = await appliquer(admin, { zoneId: vers, nom, mode: "add", quantite: moved, type: "transfert", cibleZoneId: de, par, commentaire: `Transfert depuis ${de}` });
  return { ok: true, deplace: moved, apres: r.apres };
}

// ── HuntingService : seuil de réappro d'une ressource ────────────
export async function definirSeuilChasse(input: { zoneId: string; nom: string; seuil: number | null }): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { data: ex } = await admin.from("ChasseStock").select("id").eq("zoneId", s(input.zoneId, 40)).ilike("nom", s(input.nom, 100)).limit(1).maybeSingle();
  if (!ex) return { ok: false, error: "Ressource introuvable." };
  const { error } = await admin.from("ChasseStock").update({ seuil: input.seuil == null ? null : clampQ(input.seuil) }).eq("id", (ex as { id: string }).id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

// ── HuntingService : supprimer une ressource (suppression fiable) ──
export async function supprimerRessourceChasse(input: { zoneId: string; nom: string; par?: string | null }): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const zoneId = s(input.zoneId, 40), nom = s(input.nom, 100);
  const { data: ex } = await admin.from("ChasseStock").select("id,quantite").eq("zoneId", zoneId).ilike("nom", nom).limit(1).maybeSingle();
  if (!ex) return { ok: true }; // déjà absente
  const avant = Number((ex as { quantite: number }).quantite) || 0;
  const { error } = await admin.from("ChasseStock").delete().eq("id", (ex as { id: string }).id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await ecrireMouvement(admin, { zoneId, nom, type: "suppression", delta: -avant, avant, apres: 0, par: await acteur(input.par), commentaire: "Ressource retirée de la zone" });
  return { ok: true };
}

// ── HuntingService : capacité / nom d'une zone (upsert) ───────────
export async function definirCapaciteChasse(input: { zoneId: string; nom?: string; capacite: number | null }): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const zoneId = s(input.zoneId, 40);
  if (!zoneId) return { ok: false, error: "Zone manquante." };
  const capacite = input.capacite == null ? null : clampQ(input.capacite);
  const { data: ex } = await admin.from("ChasseZone").select("id").eq("id", zoneId).maybeSingle();
  if (ex) {
    const patch: Record<string, unknown> = { capacite };
    if (input.nom && input.nom.trim()) patch.nom = s(input.nom, 60);
    const { error } = await admin.from("ChasseZone").update(patch).eq("id", zoneId);
    return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
  }
  const { error } = await admin.from("ChasseZone").insert({ id: zoneId, nom: s(input.nom, 60) || zoneId, capacite, ordre: 99 });
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

// ── HuntingService : ajouter une zone (Charrette 3, Entrepôt…) ────
export async function ajouterZoneChasse(input: { nom: string; capacite?: number | null }): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(input.nom, 60);
  if (!nom) return { ok: false, error: "Donne un nom à la zone." };
  const id = "z-" + (norm(nom).slice(0, 18) || "zone") + "-" + Math.random().toString(36).slice(2, 5);
  const { data: zs } = await admin.from("ChasseZone").select("ordre");
  const ordre = ((zs || []) as { ordre: number }[]).reduce((m, z) => Math.max(m, Number(z.ordre) || 0), 0) + 1;
  const { error } = await admin.from("ChasseZone").insert({ id, nom, capacite: input.capacite == null ? null : clampQ(input.capacite), ordre });
  return error ? { ok: false, error: "Création impossible." } : { ok: true };
}

// ── OCRService : lire une photo/scan/PDF → liste corrigeable ──────
export async function lireStockChasse(url: string): Promise<{ ok: boolean; lignes?: LigneStock[]; error?: string }> {
  const u = String(url || "");
  if (!/^https?:\/\//.test(u)) return { ok: false, error: "Photo invalide." };
  return lireStockDepuisImage(u);
}

// ── InventoryService : appliquer un import OCR corrigé ───────────
export async function importerStockChasse(input: { zoneId: string; lignes: LigneStock[]; mode?: "add" | "set"; par?: string | null }): Promise<ChasseResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const zoneId = s(input.zoneId, 40);
  if (!zoneId) return { ok: false, error: "Zone manquante." };
  const mode: Mode = input.mode === "set" ? "set" : "add";
  const lignes = Array.isArray(input.lignes) ? input.lignes.slice(0, 60) : [];
  if (!lignes.length) return { ok: false, error: "Aucune ligne à importer." };
  const par = await acteur(input.par);
  let count = 0;
  for (const l of lignes) {
    const nom = s(l.nom, 100); const q = clampQ(l.quantite);
    if (!nom) continue;
    if (mode === "add" && q <= 0) continue;
    const r = await appliquer(admin, { zoneId, nom, mode, quantite: q, type: "ocr", par, commentaire: "Import photo (OCR)" });
    if (r.ok) count++;
  }
  return count ? { ok: true, count } : { ok: false, error: "Aucune ressource importée." };
}
