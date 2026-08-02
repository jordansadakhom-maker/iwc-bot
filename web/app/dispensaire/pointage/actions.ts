"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { estAutorise, peutGererRH } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { ymdParis, lundiCourant } from "@/lib/dispensaire-dates";

// Pointage — outil de service partagé (ouvert à tout le personnel du dispensaire).
export type PointResult = { ok: boolean; error?: string; id?: string };

const REFUS = "Accès refusé.";
const s = (v: unknown, max = 200) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
function newId() { return `dp-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }
const normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
function newEhId() { return `deh-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Somme des minutes VALIDÉES de la semaine courante pour un salarié (base d'audit).
async function heuresBaseSemaine(admin: NonNullable<ReturnType<typeof createAdminClient>>, nom: string, monday: string): Promise<number> {
  try {
    const bMin = new Date(monday + "T00:00:00Z"); bMin.setUTCDate(bMin.getUTCDate() - 1);
    const { data } = await admin.from("DispensairePointage").select("nom,debut,dureeMin,fin,valide").not("fin", "is", null).gte("debut", bMin.toISOString()).limit(2000);
    const key = normNom(nom); let min = 0;
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (r.valide === false) continue;
      if (ymdParis(String(r.debut)) < monday) continue;
      if (normNom(r.nom) !== key) continue;
      min += Number(r.dureeMin) || 0;
    }
    return min;
  } catch { return 0; }
}

// Ajuste (± minutes, cumulatif) les HEURES D'EFFECTIF d'un salarié pour la semaine
// courante. Réservé Direction / RH. Motif OBLIGATOIRE. AUCUN impact sur le salaire
// (qui ne dépend que des jours). Tracé au journal d'audit (avant → après).
export async function ajusterHeures(nom: string, deltaMin: number, motif: string): Promise<PointResult> {
  if (!(await peutGererRH())) return { ok: false, error: "Réservé à la Direction / RH." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const n = s(nom);
  if (!n) return { ok: false, error: "Salarié invalide." };
  const mtf = s(motif, 200);
  if (!mtf) return { ok: false, error: "Le motif est obligatoire." };
  const d = Math.max(-1440, Math.min(1440, Math.round(Number(deltaMin) || 0)));
  if (!d) return { ok: false, error: "Indique un nombre d'heures à ajouter ou à retirer." };

  const monday = lundiCourant(new Date().toISOString());
  const nomKey = normNom(n);
  const par = await qui();
  const now = new Date().toISOString();

  let id: string | null = null, avantDelta = 0;
  try {
    const { data } = await admin.from("DispensaireEffectifAjust").select("id,deltaMin").eq("semaineLundi", monday).eq("nomKey", nomKey).maybeSingle();
    if (data) { id = String(data.id); avantDelta = Number(data.deltaMin) || 0; }
  } catch { return { ok: false, error: "Enregistrement impossible (lance dispensaire-effectif-ajust.sql ?)." }; }
  const nouveauDelta = avantDelta + d;

  if (id) {
    const { error } = await admin.from("DispensaireEffectifAjust").update({ deltaMin: nouveauDelta, updatedAt: now, updatedBy: par }).eq("id", id);
    if (error) return { ok: false, error: "Enregistrement impossible." };
  } else {
    const { error } = await admin.from("DispensaireEffectifAjust").insert({ id: newEhId(), semaineLundi: monday, nomKey, nom: n, deltaMin: nouveauDelta, updatedAt: now, updatedBy: par });
    if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-effectif-ajust.sql ?)." };
  }

  // Audit : total AVANT → APRÈS (base pointage + ajustement cumulé) + différence + motif.
  const base = await heuresBaseSemaine(admin, n, monday);
  await emettreEvenementDispensaire({
    aggregate: "pointage", type: "pointage.heures_ajust", cibleLibelle: n,
    avant: { heuresMin: Math.max(0, base + avantDelta) }, apres: { heuresMin: Math.max(0, base + nouveauDelta) },
    payload: { deltaMin: d, motif: mtf, semaine: monday },
  });
  return { ok: true };
}

// Prendre le service : ouvre une ligne (début = maintenant). Bloque si le salarié
// a déjà un service ouvert.
export async function prendreService(data: { salarieId?: string | null; nom: string }): Promise<PointResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom);
  if (!nom) return { ok: false, error: "Choisis un salarié." };
  const salarieId = s(data.salarieId ?? undefined);

  // Un seul service ouvert par salarié à la fois.
  let dejaOuvert;
  if (salarieId) dejaOuvert = await admin.from("DispensairePointage").select("id").eq("salarieId", salarieId).is("fin", null).maybeSingle();
  else dejaOuvert = await admin.from("DispensairePointage").select("id").eq("nom", nom).is("fin", null).maybeSingle();
  if (dejaOuvert?.data) return { ok: false, error: `${nom} est déjà en service.` };

  const id = newId();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensairePointage").insert({ id, salarieId, nom, debut: now, lastSeen: now, etat: "en_service", updatedBy: await qui(), updatedAt: now });
  if (error) return { ok: false, error: "Prise de service impossible (la table existe-t-elle ?)." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.debut", cibleId: id, cibleLibelle: nom, apres: { nom, debut: now } });
  return { ok: true, id };
}

// Heartbeat : signal « je suis toujours là » d'un service ouvert (met à jour
// lastSeen). Léger, silencieux (aucun événement), appelé périodiquement par le
// navigateur. Sert à distinguer un service actif d'un service oublié.
export async function battreCoeur(id: string): Promise<PointResult> {
  if (!id) return { ok: false };
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false };
  const now = new Date().toISOString();
  // Ne touche QUE les services ouverts (fin absente) — jamais un service clôturé.
  const { error } = await admin.from("DispensairePointage").update({ lastSeen: now, etat: "en_service" }).eq("id", id).is("fin", null);
  return error ? { ok: false } : { ok: true };
}

// Terminer le service : renseigne la fin et calcule la durée (minutes).
export async function terminerService(id: string): Promise<PointResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Service introuvable." };
  const { data: ex } = await admin.from("DispensairePointage").select("id,nom,debut,fin").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Service introuvable." };
  const r = ex as Record<string, unknown>;
  if (r.fin) return { ok: true };            // déjà clôturé
  const fin = new Date();
  const debut = new Date(String(r.debut));
  const dureeMin = Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
  // Clôture NORMALE (par le salarié, en direct) → validée d'office.
  const { error } = await admin.from("DispensairePointage").update({ fin: fin.toISOString(), dureeMin, etat: "cloture", finSource: "normal", valide: true, updatedBy: await qui(), updatedAt: fin.toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Clôture impossible." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.fin", cibleId: id, cibleLibelle: String(r.nom ?? ""), apres: { dureeMin, finSource: "normal" } });
  return { ok: true };
}

// ── Reprise d'un service « à confirmer » (à la reconnexion) ─────────────────
// Le salarié corrige lui-même son oubli en un geste : reprendre, clôturer à
// l'heure du dernier signal, ou saisir l'heure réelle de fin.

// Reprendre : le salarié était toujours en service → on relance le heartbeat.
export async function reprendreService(id: string): Promise<PointResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Service introuvable." };
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensairePointage").update({ lastSeen: now, etat: "en_service" }).eq("id", id).is("fin", null);
  if (error) return { ok: false, error: "Reprise impossible." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.reprise", cibleId: id, cibleLibelle: "", apres: { at: now } });
  return { ok: true };
}

// Clôturer « après oubli » : ferme à l'heure du DERNIER signal (lastSeen) — on ne
// compte jamais le temps d'inactivité. Service validé, marqué « oubli ».
export async function cloturerParOubli(id: string): Promise<PointResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { data: ex } = await admin.from("DispensairePointage").select("id,nom,debut,fin,lastSeen").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Service introuvable." };
  const r = ex as Record<string, unknown>;
  if (r.fin) return { ok: true };
  const debut = new Date(String(r.debut));
  let fin = r.lastSeen ? new Date(String(r.lastSeen)) : debut;
  if (isNaN(fin.getTime()) || fin.getTime() < debut.getTime()) fin = debut;
  const dureeMin = Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensairePointage").update({ fin: fin.toISOString(), dureeMin, etat: "cloture", finSource: "oubli", valide: true, updatedBy: await qui(), updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Clôture impossible." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.oubli", cibleId: id, cibleLibelle: String(r.nom ?? ""), apres: { dureeMin, finSource: "oubli", fin: fin.toISOString() } });
  return { ok: true };
}

// Clôturer avec l'heure de fin SAISIE par le salarié. Service validé, « corrigé
// (salarié) ». La fin doit être ≥ début et non future.
export async function cloturerManuel(id: string, finIso: string): Promise<PointResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { data: ex } = await admin.from("DispensairePointage").select("id,nom,debut,fin").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Service introuvable." };
  const r = ex as Record<string, unknown>;
  if (r.fin) return { ok: true };
  const debut = new Date(String(r.debut));
  const fin = new Date(String(finIso || ""));
  if (isNaN(fin.getTime())) return { ok: false, error: "Heure de fin invalide." };
  if (fin.getTime() < debut.getTime()) return { ok: false, error: "La fin ne peut pas précéder le début." };
  if (fin.getTime() > Date.now() + 60000) return { ok: false, error: "La fin ne peut pas être dans le futur." };
  const dureeMin = Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensairePointage").update({ fin: fin.toISOString(), dureeMin, etat: "cloture", finSource: "user", updatedBy: await qui(), valide: true, updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Clôture impossible." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.correction", cibleId: id, cibleLibelle: String(r.nom ?? ""), apres: { dureeMin, finSource: "user", fin: fin.toISOString() } });
  return { ok: true };
}

// Traitement d'un service par la DIRECTION (filet de sécurité) : clôturer à
// l'heure du dernier signal, ou corriger l'heure de fin (finIso), avec un
// commentaire. Service validé, marqué « corrigé (Direction) ». Réservé à
// l'encadrement, tracé.
export async function cloturerServiceDirection(id: string, finIso: string | null, commentaire?: string): Promise<PointResult> {
  if (!(await peutGererRH())) return { ok: false, error: "Réservé à l'encadrement (RH/Direction)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const { data: ex } = await admin.from("DispensairePointage").select("id,nom,debut,fin,lastSeen").eq("id", id).maybeSingle();
  if (!ex) return { ok: false, error: "Service introuvable." };
  const r = ex as Record<string, unknown>;
  const debut = new Date(String(r.debut));
  let fin: Date;
  if (finIso) { fin = new Date(finIso); if (isNaN(fin.getTime())) return { ok: false, error: "Heure de fin invalide." }; }
  else { fin = r.lastSeen ? new Date(String(r.lastSeen)) : new Date(); }
  if (isNaN(fin.getTime()) || fin.getTime() < debut.getTime()) fin = debut; // jamais avant le début
  if (fin.getTime() > Date.now() + 60000) return { ok: false, error: "La fin ne peut pas être dans le futur." };
  const dureeMin = Math.max(0, Math.round((fin.getTime() - debut.getTime()) / 60000));
  const par = await qui();
  const now = new Date().toISOString();
  const { error } = await admin.from("DispensairePointage").update({ fin: fin.toISOString(), dureeMin, etat: "cloture", finSource: "direction", valide: true, commentaire: s(commentaire, 500), corrigePar: par, updatedBy: par, updatedAt: now }).eq("id", id);
  if (error) return { ok: false, error: "Clôture impossible." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.validation", cibleId: id, cibleLibelle: String(r.nom ?? ""), apres: { dureeMin, finSource: "direction", fin: fin.toISOString(), commentaire: s(commentaire, 500) } });
  return { ok: true };
}

// ── Absences (justifiées / injustifiées) — suivi d'assiduité ────────────────
// Réservé à l'encadrement RH/Direction (peutGererRH), fail-closed : c'est un
// jugement sur l'assiduité, pas un simple pointage.
export async function ajouterAbsence(data: { salarieId?: string | null; nom: string; date: string; justifiee: boolean; motif?: string }): Promise<PointResult> {
  if (!(await peutGererRH())) return { ok: false, error: "Réservé à l'encadrement (RH/Direction)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const nom = s(data.nom);
  if (!nom) return { ok: false, error: "Choisis un salarié." };
  const date = s(data.date, 10);
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return { ok: false, error: "Date invalide." };
  const id = `da-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const now = new Date().toISOString();
  const row = { id, salarieId: s(data.salarieId ?? undefined), nom, date, justifiee: !!data.justifiee, motif: s(data.motif, 300), par: await qui(), createdAt: now };
  const { error } = await admin.from("DispensaireAbsence").insert(row);
  if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-absences.sql ?)." };
  await emettreEvenementDispensaire({ aggregate: "absence", type: "absence.cree", cibleId: id, cibleLibelle: nom, apres: { date, justifiee: !!data.justifiee } });
  return { ok: true, id };
}

export async function supprimerAbsence(id: string): Promise<PointResult> {
  if (!(await peutGererRH())) return { ok: false, error: "Réservé à l'encadrement (RH/Direction)." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireAbsence", id);
  const { error } = await admin.from("DispensaireAbsence").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "absence", type: "absence.supprime", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}

// Correction : supprimer une ligne de pointage.
export async function supprimerPointage(id: string): Promise<PointResult> {
  if (!(await estAutorise())) return { ok: false, error: REFUS };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensairePointage", id);
  const { error } = await admin.from("DispensairePointage").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenementDispensaire({ aggregate: "pointage", type: "pointage.supprime", cibleId: id, cibleLibelle: String(avant?.nom ?? ""), avant });
  return { ok: true };
}
