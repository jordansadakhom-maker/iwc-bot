"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutGererRH } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { SANCTION_KEYS } from "@/lib/dispensaire-sanctions-const";

// Sanctions disciplinaires — réservé à l'encadrement (RH / Direction), tracé.
export type SanctionResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Réservé à l'encadrement (RH / Direction).";
const s = (v: unknown, max = 500) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dsx-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Encadrement"; } catch { return "Encadrement"; } }

export async function ajouterSanction(data: { salarieId: string; nom: string; type: string; motif?: string; date?: string; duree?: string; commentaire?: string }): Promise<SanctionResult> {
  if (!(await peutGererRH())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const salarieId = s(data.salarieId, 100);
  const nom = s(data.nom, 120);
  if (!salarieId || !nom) return { ok: false, error: "Salarié introuvable." };
  const type = SANCTION_KEYS.includes(String(data.type)) ? String(data.type) : "autre";
  const motif = s(data.motif, 500);
  if (!motif) return { ok: false, error: "Indique le motif de la sanction." };
  const date = s(data.date, 10);
  if (date && !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date invalide." };
  const id = newId();
  const par = await qui();
  const now = new Date().toISOString();
  const row = { id, salarieId, nom, type, motif, date: date || now.slice(0, 10), duree: s(data.duree, 100), commentaire: s(data.commentaire, 800), par, createdAt: now };
  const { error } = await admin.from("DispensaireSanction").insert(row);
  if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-sanctions.sql ?)." };
  await emettreEvenementDispensaire({ aggregate: "sanction", type: "sanction.cree", cibleId: id, cibleLibelle: nom, apres: { type, motif, date: row.date, duree: row.duree } });
  return { ok: true, id };
}

export async function supprimerSanction(id: string): Promise<SanctionResult> {
  if (!(await peutGererRH())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireSanction", id);
  const { error } = await admin.from("DispensaireSanction").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "sanction", type: "sanction.supprime", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}
