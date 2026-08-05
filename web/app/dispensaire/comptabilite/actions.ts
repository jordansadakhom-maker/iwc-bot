"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutAdministrer } from "@/lib/dispensaire-roles";

// Écritures comptables MANUELLES — réservées à la Direction (droit `admin` :
// directeur + directeur adjoint). Site-native, écriture directe. Servent à saisir
// à la main toute recette/dépense — notamment les factures réglées en jeu.
export type EcrResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès réservé à la Direction.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `em-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Direction"; } catch { return "Direction"; } }

// « AAAA-MM-JJ » → ISO à midi (évite tout décalage de jour selon le fuseau).
function dateIso(v: unknown): string | null {
  const t = String(v ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const d = new Date(`${t.slice(0, 10)}T12:00:00`);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
function montantDe(v: unknown): number { const n = Math.abs(Number(v)); return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0; }
function typeDe(v: unknown): "recette" | "depense" { return String(v) === "depense" ? "depense" : "recette"; }

// Construit la part « champs » d'une écriture à partir d'un formulaire libre.
// `partiel` = mise à jour : seuls les champs présents sont renvoyés.
function champs(data: Record<string, unknown>, partiel: boolean): { row: Record<string, unknown>; error?: string } {
  const row: Record<string, unknown> = {};
  if (!partiel || "libelle" in data) { const l = s(data.libelle, 200); if (!l) return { row, error: "Donne un libellé à l'écriture." }; row.libelle = l; }
  if (!partiel || "montant" in data) { const m = montantDe(data.montant); if (!m) return { row, error: "Indique un montant supérieur à 0." }; row.montant = m; }
  if (!partiel || "type" in data) row.type = typeDe(data.type);
  if (!partiel || "categorie" in data) row.categorie = s(data.categorie, 120) || "Divers";
  if (!partiel || "note" in data) row.note = s(data.note, 500);
  if (!partiel || "date" in data) row.date = dateIso(data.date) || new Date().toISOString();
  return { row };
}

export async function ajouterEcriture(data: Record<string, unknown>): Promise<EcrResult> {
  if (!(await peutAdministrer())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { row, error } = champs(data, false);
  if (error) return { ok: false, error };
  const id = newId();
  const now = new Date().toISOString();
  const { error: err } = await admin.from("DispensaireEcritureManuelle").insert({ id, ...row, par: await qui(), createdAt: now, updatedAt: now });
  if (err) return { ok: false, error: "Enregistrement impossible (la table DispensaireEcritureManuelle existe-t-elle ?)." };
  return { ok: true, id };
}

export async function majEcriture(id: string, patch: Record<string, unknown>): Promise<EcrResult> {
  if (!(await peutAdministrer())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Écriture introuvable." };
  const { row, error } = champs(patch, true);
  if (error) return { ok: false, error };
  if (!Object.keys(row).length) return { ok: true };
  const { error: err } = await admin.from("DispensaireEcritureManuelle").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  if (err) return { ok: false, error: "Enregistrement impossible." };
  return { ok: true };
}

export async function supprimerEcriture(id: string): Promise<EcrResult> {
  if (!(await peutAdministrer())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Écriture introuvable." };
  const { error } = await admin.from("DispensaireEcritureManuelle").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  return { ok: true };
}
