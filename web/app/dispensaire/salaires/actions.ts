"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire } from "@/lib/dispensaire-evenements";
import { getSalaires } from "@/lib/dispensaire-salaires";

export type SalaireResult = { ok: boolean; error?: string; total?: number; nb?: number };
async function qui() { try { return (await getSessionProfile())?.nom || "Direction"; } catch { return "Direction"; } }
function newId() { return `dpa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

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

// Fige (archive) les salaires de la SEMAINE COURANTE : un instantané par salarié.
// Ré-archiver la même semaine remplace l'instantané précédent. Réservé Direction.
export async function archiverSemaine(): Promise<SalaireResult> {
  if (!(await peutAdministrer())) return { ok: false, error: "Réservé à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const data = await getSalaires();
  if (!data.autorise) return { ok: false, error: "Réservé à la direction." };
  const semaineLundi = data.semaineLundi;
  const lignes = data.lignes.filter((l) => l.salaire > 0 || l.jours > 0);
  if (!lignes.length) return { ok: false, error: "Rien à archiver cette semaine (aucun jour travaillé)." };
  const par = await qui();
  const now = new Date().toISOString();
  // Remplace un éventuel instantané précédent de la même semaine (idempotent).
  await admin.from("DispensairePaie").delete().eq("semaineLundi", semaineLundi);
  const rows = lignes.map((l) => ({ id: newId(), semaineLundi, nom: l.nom, fonction: l.fonction, montantHebdo: l.montantHebdo, jours: l.jours, heuresMin: l.heuresMin, salaire: l.salaire, par, createdAt: now }));
  const { error } = await admin.from("DispensairePaie").insert(rows);
  if (error) return { ok: false, error: "Archivage impossible (lance dispensaire-paie.sql ?)." };
  const total = rows.reduce((a, r) => a + r.salaire, 0);
  await emettreEvenementDispensaire({ aggregate: "paie", type: "paie.archive", cibleLibelle: `Semaine du ${semaineLundi}`, apres: { total, nb: rows.length } });
  return { ok: true, total, nb: rows.length };
}

// Supprime l'archive d'une semaine (Direction).
export async function supprimerArchivePaie(semaineLundi: string): Promise<SalaireResult> {
  if (!(await peutAdministrer())) return { ok: false, error: "Réservé à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const sem = String(semaineLundi || "").trim();
  if (!sem) return { ok: false, error: "Semaine invalide." };
  const { error } = await admin.from("DispensairePaie").delete().eq("semaineLundi", sem);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "paie", type: "paie.supprime", cibleLibelle: `Semaine du ${sem}` });
  return { ok: true };
}
