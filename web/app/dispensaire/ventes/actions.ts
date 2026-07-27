"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise, getConfig } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";

// Ventes — comptoir du dispensaire (ouvert à tout le personnel du dispensaire).
export type VenteResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé.";
const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId() { return `dv-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

export async function creerVente(data: Record<string, unknown>): Promise<VenteResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const patient = s(data.patient);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const item = s(data.item) || "Bandage";
  const quantite = Math.max(1, n(data.quantite) || 1);
  // Prix de repli = prix configuré en admin (et non plus « 4 » codé en dur) : si
  // le client n'envoie pas de prix, on applique la valeur courante de la config.
  const prixUnitaire = data.prixUnitaire != null ? n(data.prixUnitaire) : (await getConfig()).prixBandage;
  const total = quantite * prixUnitaire;
  // Idempotence : id dérivé du jeton client → un second envoi (double-clic) est
  // rejeté par la clé primaire et renvoie la vente déjà créée.
  const id = idAvecJeton("dv", data.cle, newId);
  const { error } = await admin.from("DispensaireVente").insert({ id, patient, item, quantite, prixUnitaire, total, note: s(data.note, 500), par: await qui(), createdAt: new Date().toISOString() });
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Enregistrement impossible (la table existe-t-elle ?)." };
  }
  await emettreEvenementDispensaire({ aggregate: "vente", type: "vente.cree", cibleId: id, cibleLibelle: patient, apres: { patient, item, quantite, prixUnitaire, total } });
  return { ok: true, id };
}

export async function supprimerVente(id: string): Promise<VenteResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireVente", id);
  const { error } = await admin.from("DispensaireVente").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "vente", type: "vente.supprime", cibleId: id, cibleLibelle: String(avant?.patient ?? ""), avant });
  return { ok: true };
}
