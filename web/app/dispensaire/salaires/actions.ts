"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire } from "@/lib/dispensaire-evenements";

export type SalaireResult = { ok: boolean; error?: string };
async function qui() { try { return (await getSessionProfile())?.nom || "Direction"; } catch { return "Direction"; } }

// Fixe le salaire hebdomadaire (plein, 7 jours) d'une fonction. Réservé Direction.
export async function setSalaireFonction(fonction: string, montantHebdo: number): Promise<SalaireResult> {
  if (!(await peutAdministrer())) return { ok: false, error: "Réservé à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const f = String(fonction || "").trim();
  if (!f) return { ok: false, error: "Fonction invalide." };
  const m = Math.max(0, Math.round(Number(montantHebdo) || 0));
  const { error } = await admin.from("DispensaireSalaireFonction").upsert({ fonction: f, montantHebdo: m, updatedAt: new Date().toISOString(), updatedBy: await qui() }, { onConflict: "fonction" });
  if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-salaires.sql ?)." };
  await emettreEvenementDispensaire({ aggregate: "salaire", type: "salaire.bareme", cibleLibelle: f, apres: { montantHebdo: m } });
  return { ok: true };
}
