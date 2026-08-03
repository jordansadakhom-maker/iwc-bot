"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { validerPieceJointe } from "@/lib/piece-jointe";

// Rapports médicaux (liens Canva) — ouvert au personnel soignant du dispensaire.
export type RapportResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé.";
type Champ = "titre" | "categorie" | "patient" | "lien" | "pieceJointe" | "auteur" | "note";
const CHAMPS: Champ[] = ["titre", "categorie", "patient", "lien", "pieceJointe", "auteur", "note"];
const s = (v: unknown, max = 400) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 2000 : c === "lien" || c === "pieceJointe" ? 2000 : 300);
  return row;
}

// Valide la pièce jointe (rempart serveur : https + image uniquement, jamais de
// contenu exécutable). Renvoie un message d'erreur si le lien fourni est refusé.
function validerRow(row: Record<string, unknown>): string | null {
  if ("pieceJointe" in row) {
    const pj = validerPieceJointe(String(row.pieceJointe ?? ""));
    if (!pj.ok) return pj.error;
    row.pieceJointe = pj.url || null;
  }
  return null;
}

// Insert/update tolérants à l'absence de la colonne « pieceJointe » (avant que le
// SQL additif ne soit lancé) : on réessaie sans elle plutôt que de tout casser.
async function insertRapport(admin: ReturnType<typeof createAdminClient>, base: Record<string, unknown>) {
  if (!admin) return { error: true as const };
  let { error } = await admin.from("DispensaireRapport").insert(base);
  if (error && "pieceJointe" in base) {
    const { pieceJointe: _omit, ...legacy } = base; void _omit;
    ({ error } = await admin.from("DispensaireRapport").insert(legacy));
  }
  return { error: !!error };
}
async function updateRapport(admin: ReturnType<typeof createAdminClient>, id: string, row: Record<string, unknown>) {
  if (!admin) return { error: true as const };
  let { error } = await admin.from("DispensaireRapport").update(row).eq("id", id);
  if (error && "pieceJointe" in row) {
    const { pieceJointe: _omit, ...legacy } = row; void _omit;
    ({ error } = await admin.from("DispensaireRapport").update(legacy).eq("id", id));
  }
  return { error: !!error };
}

export async function creerRapport(data: Record<string, unknown>): Promise<RapportResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.titre) return { ok: false, error: "Donne un nom au rapport." };
  const errPj = validerRow(row);
  if (errPj) return { ok: false, error: errPj };
  const id = newId();
  const { error } = await insertRapport(admin, { id, auteur: row.auteur ?? (await qui()), ...row, par: await qui(), createdAt: new Date().toISOString() });
  if (error) return { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." };
  await emettreEvenementDispensaire({ aggregate: "rapport", type: "rapport.cree", cibleId: id, cibleLibelle: String(row.titre ?? ""), apres: row });
  return { ok: true, id };
}

export async function majRapport(id: string, patch: Record<string, unknown>): Promise<RapportResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Rapport introuvable." };
  const row = nettoyer(patch);
  if ("titre" in row && !row.titre) return { ok: false, error: "Le nom ne peut pas être vide." };
  const errPj = validerRow(row);
  if (errPj) return { ok: false, error: errPj };
  if (!Object.keys(row).length) return { ok: true };
  const avant = await lireAvant("DispensaireRapport", id);
  const { error } = await updateRapport(admin, id, row);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "rapport", type: "rapport.maj", cibleId: id, cibleLibelle: String((avant?.titre ?? row.titre) ?? ""), avant, apres: row });
  return { ok: true };
}

export async function supprimerRapport(id: string): Promise<RapportResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireRapport", id);
  const { error } = await admin.from("DispensaireRapport").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "rapport", type: "rapport.supprime", cibleId: id, cibleLibelle: String(avant?.titre ?? ""), avant });
  return { ok: true };
}
