"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire } from "@/lib/dispensaire-evenements";
import { getSalaires } from "@/lib/dispensaire-salaires";
import { lundiCourant } from "@/lib/dispensaire-dates";

export type SalaireResult = { ok: boolean; error?: string; total?: number; nb?: number };
async function qui() { try { return (await getSessionProfile())?.nom || "Direction"; } catch { return "Direction"; } }
function newId() { return `dpa-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
function newAjustId() { return `dpaj-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
const normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

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

// ── Ajustements manuels de la Direction (prime + correction de jours) ───────
// Persistés par salarié + semaine dans DispensairePaieAjust, tracés dans le
// journal d'audit (qui, quand, avant → après, motif). Réservé Direction.
type ChampAjust = "prime" | "ajustJours";

async function majAjust(nom: string, champ: ChampAjust, valeur: number, motif?: string): Promise<SalaireResult> {
  if (!(await peutAdministrer())) return { ok: false, error: "Réservé à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const n = String(nom || "").trim();
  if (!n) return { ok: false, error: "Salarié invalide." };
  // Prime : entier ≥ 0. Ajustement de jours : entier borné (une semaine = 7 jours).
  const v = champ === "prime" ? Math.max(0, Math.round(Number(valeur) || 0)) : Math.max(-14, Math.min(14, Math.round(Number(valeur) || 0)));
  const semaineLundi = lundiCourant(new Date().toISOString());
  const nomKey = normNom(n);
  const par = await qui();
  const now = new Date().toISOString();

  let id: string | null = null, avant = 0;
  try {
    const { data } = await admin.from("DispensairePaieAjust").select("id,prime,ajustJours").eq("semaineLundi", semaineLundi).eq("nomKey", nomKey).maybeSingle();
    if (data) { id = String(data.id); avant = Number((data as Record<string, unknown>)[champ]) || 0; }
  } catch { return { ok: false, error: "Enregistrement impossible (lance dispensaire-paie-ajust.sql ?)." }; }
  if (avant === v) return { ok: true };

  if (id) {
    const { error } = await admin.from("DispensairePaieAjust").update({ [champ]: v, updatedAt: now, updatedBy: par }).eq("id", id);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const row: Record<string, unknown> = { id: newAjustId(), semaineLundi, nomKey, nom: n, prime: 0, ajustJours: 0, updatedAt: now, updatedBy: par };
    row[champ] = v;
    const { error } = await admin.from("DispensairePaieAjust").insert(row);
    if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-paie-ajust.sql ?)." };
  }

  const type = champ === "prime" ? "salaire.prime" : "salaire.jours";
  const payload: Record<string, unknown> = { semaine: semaineLundi };
  if (motif && String(motif).trim()) payload.motif = String(motif).trim().slice(0, 200);
  await emettreEvenementDispensaire({ aggregate: "salaire", type, cibleLibelle: n, avant: { [champ]: avant }, apres: { [champ]: v }, payload });
  return { ok: true };
}

// Prime manuelle (€ ≥ 0) d'un salarié pour la semaine courante. Réservé Direction.
export async function setPrime(nom: string, prime: number, motif?: string): Promise<SalaireResult> {
  return majAjust(nom, "prime", prime, motif);
}
// Ajustement manuel des jours (±) d'un salarié pour la semaine courante. Réservé Direction.
export async function setAjustJours(nom: string, ajustJours: number, motif?: string): Promise<SalaireResult> {
  return majAjust(nom, "ajustJours", ajustJours, motif);
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
  const rows = lignes.map((l) => ({ id: newId(), semaineLundi, nom: l.nom, fonction: l.fonction, montantHebdo: l.montantHebdo, joursAuto: l.joursAuto, ajustJours: l.ajustJours, jours: l.jours, heuresMin: l.heuresMin, prime: l.prime, salaireBase: l.salaireBase, salaire: l.salaire, par, createdAt: now }));
  let { error } = await admin.from("DispensairePaie").insert(rows);
  if (error) {
    // Repli si la base n'est pas encore migrée (colonnes prime/ajust absentes) :
    // on archive au format historique — l'archivage ne casse jamais.
    const legacy = lignes.map((l) => ({ id: newId(), semaineLundi, nom: l.nom, fonction: l.fonction, montantHebdo: l.montantHebdo, jours: l.jours, heuresMin: l.heuresMin, salaire: l.salaire, par, createdAt: now }));
    ({ error } = await admin.from("DispensairePaie").insert(legacy));
  }
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
