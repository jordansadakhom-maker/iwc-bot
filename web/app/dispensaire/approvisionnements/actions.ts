"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutModifierStock } from "@/lib/dispensaire-roles";

// Approvisionnements — seuils de commande & carnet de fournisseurs. Site-native,
// écriture directe. Mutation réservée au personnel habilité « stock » (comme le
// reste de la gestion des stocks) ; la lecture reste ouverte au dispensaire.
export type AppResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) ? Math.max(0, Math.round(n * 100) / 100) : 0; };
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
const STATUTS = ["a_commander", "urgente", "passee", "a_recuperer"];
const statutDe = (v: unknown) => { const t = String(v); return STATUTS.includes(t) ? t : "a_commander"; };
// « AAAA-MM-JJ » → ISO à midi (évite tout décalage de jour selon le fuseau).
function dateIso(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!t) return null;
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const d = new Date(`${t.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

// ── Lignes d'approvisionnement ────────────────────────────────────────────────
function ligneChamps(data: Record<string, unknown>, partiel: boolean): { row: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};
  if (!partiel || "article" in data) { const a = s(data.article, 160); if (!a) return { row, error: "Donne un nom à l'article." }; row.article = a; }
  if (!partiel || "categorie" in data) row.categorie = s(data.categorie, 120) || "Autre";
  if (!partiel || "fournisseur" in data) row.fournisseur = s(data.fournisseur, 160);
  if (!partiel || "stock" in data) row.stock = num(data.stock);
  if (!partiel || "seuil" in data) row.seuil = num(data.seuil);
  if (!partiel || "unite" in data) row.unite = s(data.unite, 40);
  if (!partiel || "statut" in data) row.statut = statutDe(data.statut);
  if (!partiel || "note" in data) row.note = s(data.note, 500);
  if (!partiel || "datePrevue" in data) row.datePrevue = dateIso(data.datePrevue);
  return { row };
}

export async function creerLigne(data: Record<string, unknown>): Promise<AppResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { row, error } = ligneChamps(data, false);
  if (error) return { ok: false, error };
  const id = newId("app");
  const now = new Date().toISOString();
  const { error: err } = await admin.from("DispensaireApprovisionnement").insert({ id, ...row, createdAt: now, updatedAt: now });
  if (err) return { ok: false, error: "Création impossible (la table DispensaireApprovisionnement existe-t-elle ?)." };
  return { ok: true, id };
}

export async function majLigne(id: string, patch: Record<string, unknown>): Promise<AppResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Ligne introuvable." };
  const { row, error } = ligneChamps(patch, true);
  if (error) return { ok: false, error };
  if (!Object.keys(row).length) return { ok: true };
  const { error: err } = await admin.from("DispensaireApprovisionnement").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  if (err) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

export async function supprimerLigne(id: string): Promise<AppResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Ligne introuvable." };
  const { error } = await admin.from("DispensaireApprovisionnement").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  return { ok: true };
}

// ── Carnet de fournisseurs ────────────────────────────────────────────────────
function fournChamps(data: Record<string, unknown>, partiel: boolean): { row: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};
  if (!partiel || "nom" in data) { const n = s(data.nom, 160); if (!n) return { row, error: "Donne un nom au fournisseur." }; row.nom = n; }
  if (!partiel || "categorie" in data) row.categorie = s(data.categorie, 120) || "Autre";
  if (!partiel || "contact" in data) row.contact = s(data.contact, 300);
  if (!partiel || "lieu" in data) row.lieu = s(data.lieu, 200);
  if (!partiel || "note" in data) row.note = s(data.note, 500);
  return { row };
}

export async function creerFournisseur(data: Record<string, unknown>): Promise<AppResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { row, error } = fournChamps(data, false);
  if (error) return { ok: false, error };
  const id = newId("four");
  const now = new Date().toISOString();
  const { error: err } = await admin.from("DispensaireFournisseur").insert({ id, ...row, createdAt: now, updatedAt: now });
  if (err) return { ok: false, error: "Création impossible (la table DispensaireFournisseur existe-t-elle ?)." };
  return { ok: true, id };
}

export async function majFournisseur(id: string, patch: Record<string, unknown>): Promise<AppResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Fournisseur introuvable." };
  const { row, error } = fournChamps(patch, true);
  if (error) return { ok: false, error };
  if (!Object.keys(row).length) return { ok: true };
  const { error: err } = await admin.from("DispensaireFournisseur").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  if (err) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

export async function supprimerFournisseur(id: string): Promise<AppResult> {
  if (!(await peutModifierStock())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Fournisseur introuvable." };
  const { error } = await admin.from("DispensaireFournisseur").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  return { ok: true };
}
