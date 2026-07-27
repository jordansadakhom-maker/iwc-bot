"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { FDO_PRIX } from "@/lib/dispensaire-facturation-const";

// Soins FDO — soins prodigués aux forces de l'ordre (par bureau).
// Tarif figé à 2 $ (FDO_PRIX) : le montant n'est jamais saisi ni « offert ».
export type FdoResult = { ok: boolean; error?: string; id?: string };

const STATUTS = ["facture", "regle"];
type Champ = "bureau" | "agent" | "soin" | "note";
const CHAMPS: Champ[] = ["bureau", "agent", "soin", "note"];

const REFUS = "Accès refusé.";
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dfo-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" || c === "soin" ? 1000 : 200);
  // Montant toujours figé à 2 $ — jamais pris de la saisie.
  if ("montant" in data) row.montant = FDO_PRIX;
  if ("statut" in data) row.statut = STATUTS.includes(String(data.statut)) ? data.statut : "facture";
  return row;
}

export async function creerSoin(data: Record<string, unknown>): Promise<FdoResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.bureau) return { ok: false, error: "Indique le bureau du shérif." };
  const id = idAvecJeton("dfo", data.cle, newId);
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensaireSoinFDO").insert({ id, statut: "facture", ...row, montant: FDO_PRIX, par: await qui(), createdAt: now, updatedAt: now });
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "fdo", type: "fdo.cree", cibleId: id, cibleLibelle: String(row.bureau ?? ""), apres: { ...row, montant: FDO_PRIX } });
  return { ok: true, id };
}

export async function majSoin(id: string, patch: Record<string, unknown>): Promise<FdoResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Soin introuvable." };
  const row = nettoyer(patch);
  if ("bureau" in row && !row.bureau) return { ok: false, error: "Le bureau ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const avant = await lireAvant("DispensaireSoinFDO", id);
  const { error } = await admin.from("DispensaireSoinFDO").update({ ...row, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "fdo", type: "fdo.maj", cibleId: id, cibleLibelle: String((avant?.bureau ?? row.bureau) ?? ""), avant, apres: row });
  return { ok: true };
}

export async function supprimerSoin(id: string): Promise<FdoResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireSoinFDO", id);
  const { error } = await admin.from("DispensaireSoinFDO").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "fdo", type: "fdo.supprime", cibleId: id, cibleLibelle: String(avant?.bureau ?? ""), avant });
  return { ok: true };
}
