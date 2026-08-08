"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise, peutFacturer } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { parseMontant } from "@/lib/dispensaire-facturation-const";

// Notes de frais — dépôt ouvert au personnel ; validation/virement réservés aux
// chefs (droit « factures »). Gardes fail-closed : au moindre doute, refusé.
export type FraisResult = { ok: boolean; error?: string; id?: string };

const STATUTS = ["en_attente", "valide", "refuse", "vire"];
const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
// Montant en centimes conservés (virgule ou point acceptés) — plus d'arrondi entier.
const n = (v: unknown) => parseMontant(v);
function newId() { return `dfr-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function peutValider() { return peutFacturer(); }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerFrais(data: Record<string, unknown>): Promise<FraisResult> {
  if (!(await estAutorise())) return { ok: false, error: "Accès refusé." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const objet = s(data.objet);
  if (!objet) return { ok: false, error: "Donne l'objet de la note de frais." };
  const id = newId();
  const now = new Date().toISOString();
  const par = await qui();
  const { error } = await admin.from("DispensaireFrais").insert({ id, objet, montant: n(data.montant), demandeur: s(data.demandeur) || par, statut: "en_attente", note: s(data.note, 1000), par, createdAt: now, updatedAt: now });
  if (error) return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  await emettreEvenementDispensaire({ aggregate: "frais", type: "frais.cree", cibleId: id, cibleLibelle: objet, apres: { objet, montant: n(data.montant), demandeur: s(data.demandeur) || par } });
  return { ok: true, id };
}

// Change le statut (valider / refuser / marquer virée). Réservé aux chefs.
export async function statutFrais(id: string, statut: string): Promise<FraisResult> {
  if (!(await peutValider())) return { ok: false, error: "Validation réservée aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut inconnu." };
  const avant = await lireAvant("DispensaireFrais", id);
  const patch: Record<string, unknown> = { statut, updatedAt: new Date().toISOString() };
  if (statut === "valide" || statut === "vire") patch.validePar = await qui();
  const { error } = await admin.from("DispensaireFrais").update(patch).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  await emettreEvenementDispensaire({ aggregate: "frais", type: "frais.statut", cibleId: id, cibleLibelle: String(avant?.objet ?? ""), avant: { statut: avant?.statut ?? null }, apres: { statut } });
  return { ok: true };
}

export async function supprimerFrais(id: string): Promise<FraisResult> {
  if (!(await peutValider())) return { ok: false, error: "Suppression réservée aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireFrais", id);
  const { error } = await admin.from("DispensaireFrais").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "frais", type: "frais.supprime", cibleId: id, cibleLibelle: String(avant?.objet ?? ""), avant });
  return { ok: true };
}
