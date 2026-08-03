import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { estSalarieActif } from "@/lib/dispensaire-personnel-const";
import { getAcces } from "@/lib/queries";
import { getRoleDispensaire, getConfig, peutGererRH } from "@/lib/dispensaire-roles";
import { estAConfirmer, estEscalade } from "@/lib/dispensaire-pointage-const";
import { ymdParis, dowParis, lundiCourant, lundiDecale, dimancheDe } from "@/lib/dispensaire-dates";

// ── Pointage du Dispensaire (prise de service) ──────────────────────────────
export type PointSession = {
  id: string; salarieId: string | null; nom: string;
  debut: string; fin: string | null; dureeMin: number | null; note: string | null;
  lastSeen: string | null; finSource: string | null; valide: boolean | null; etat: string | null; commentaire: string | null; corrigePar: string | null;
};
export type PointSalarie = { id: string; nom: string; grade: string | null };
export type SemaineJour = { dow: number; min: number };            // dow 0=Lun … 6=Dim
export type PointStats = { jourMin: number; semaineMin: number; moisMin: number; totalMin: number; jours: number; moyenneMin: number };
export type PointData = {
  connecte: boolean; pret: boolean; canEdit: boolean;
  roster: PointSalarie[];
  enCours: PointSession[];
  semaine: SemaineJour[];                                            // 7 jours (Lun→Dim)
  parSalarie: { nom: string; min: number }[];                       // total semaine par salarié
  mondayYmd: string;
  stats: PointStats;                                                 // jour / semaine / mois / total / jours / moyenne
  historique: PointSession[];                                        // dernières services clôturés
};

function toSession(r: Record<string, unknown>): PointSession {
  return {
    id: String(r.id), salarieId: r.salarieId == null ? null : String(r.salarieId), nom: String(r.nom || "Salarié"),
    debut: String(r.debut), fin: r.fin == null ? null : String(r.fin),
    dureeMin: r.dureeMin == null ? null : Number(r.dureeMin) || 0, note: r.note == null ? null : String(r.note),
    lastSeen: r.lastSeen == null ? null : String(r.lastSeen), finSource: r.finSource == null ? null : String(r.finSource),
    valide: r.valide == null ? null : Boolean(r.valide), etat: r.etat == null ? null : String(r.etat),
    commentaire: r.commentaire == null ? null : String(r.commentaire), corrigePar: r.corrigePar == null ? null : String(r.corrigePar),
  };
}

const STATS0: PointStats = { jourMin: 0, semaineMin: 0, moisMin: 0, totalMin: 0, jours: 0, moyenneMin: 0 };

export async function getPointage(): Promise<PointData> {
  const vide: PointData = { connecte: false, pret: false, canEdit: false, roster: [], enCours: [], semaine: [], parSalarie: [], mondayYmd: "", stats: STATS0, historique: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  // Le pointage est un outil de service partagé : ouvert à toute personne connectée.
  let canEdit = true;
  try { await getAcces(); } catch { /* accès permissif par défaut */ }

  const nowIso = new Date().toISOString();
  const monday = lundiCourant(nowIso);
  const todayYmd = ymdParis(nowIso);
  const moisPrefix = todayYmd.slice(0, 7);

  // Roster (salariés actifs) pour le sélecteur de prise de service.
  const { data: rost } = await admin.from("DispensaireSalarie").select("id,nom,grade,statut").order("nom", { ascending: true });
  const roster: PointSalarie[] = ((rost || []) as Record<string, unknown>[])
    .filter((r) => estSalarieActif(r.statut))
    .map((r) => ({ id: String(r.id), nom: String(r.nom || "Salarié"), grade: r.grade == null ? null : String(r.grade) }));

  // Sessions ouvertes (en service).
  const { data: ouv, error: eOuv } = await admin.from("DispensairePointage").select("*").is("fin", null).order("debut", { ascending: true });
  if (eOuv) return { ...vide, connecte: true, pret: false, canEdit, roster, mondayYmd: monday };
  const enCours = ((ouv || []) as Record<string, unknown>[]).map(toSession);

  // Services récents clôturés (historique + agrégat de la semaine).
  const { data: clos } = await admin.from("DispensairePointage").select("*").not("fin", "is", null).order("debut", { ascending: false }).limit(300);
  const closes = ((clos || []) as Record<string, unknown>[]).map(toSession);

  // Agrégat semaine (Lun→Dim) + statistiques (jour / mois / total / jours travaillés).
  const semaine: SemaineJour[] = Array.from({ length: 7 }, (_, i) => ({ dow: i, min: 0 }));
  const parNom = new Map<string, number>();
  const joursSet = new Set<string>();
  const stats: PointStats = { ...STATS0 };
  for (const s of closes) {
    const ymd = ymdParis(s.debut), dow = dowParis(s.debut);
    const min = s.dureeMin || 0;
    stats.totalMin += min;
    joursSet.add(ymd);
    if (ymd === todayYmd) stats.jourMin += min;
    if (ymd.startsWith(moisPrefix)) stats.moisMin += min;
    if (ymd >= monday) {                               // semaine courante
      stats.semaineMin += min;
      semaine[dow].min += min;
      parNom.set(s.nom, (parNom.get(s.nom) || 0) + min);
    }
  }
  // Ajustements manuels d'heures d'effectif de la SEMAINE COURANTE (Direction/RH) :
  // corrigent le classement et les stats d'heures — SANS toucher aux salaires (qui
  // ne dépendent que des jours). Best-effort : table absente → aucun ajustement.
  try {
    const { data: aj } = await admin.from("DispensaireEffectifAjust").select("nom,nomKey,deltaMin").eq("semaineLundi", monday);
    if (aj && aj.length) {
      const parKey = new Map<string, { nom: string; min: number }>();
      for (const [nom, min] of parNom) parKey.set(normNom(nom), { nom, min });
      for (const r of aj as Record<string, unknown>[]) {
        const d = Number(r.deltaMin) || 0; if (!d) continue;
        const k = String(r.nomKey || normNom(r.nom));
        stats.semaineMin += d; stats.moisMin += d; stats.totalMin += d;
        const e = parKey.get(k) || { nom: String(r.nom || "Salarié"), min: 0 };
        e.min += d; parKey.set(k, e);
      }
      stats.semaineMin = Math.max(0, stats.semaineMin); stats.moisMin = Math.max(0, stats.moisMin); stats.totalMin = Math.max(0, stats.totalMin);
      parNom.clear();
      for (const { nom, min } of parKey.values()) parNom.set(nom, Math.max(0, min));
    }
  } catch { /* table absente → aucun ajustement */ }

  stats.jours = joursSet.size;
  stats.moyenneMin = stats.jours ? Math.round(stats.totalMin / stats.jours) : 0;
  const parSalarie = [...parNom.entries()].map(([nom, min]) => ({ nom, min })).sort((a, b) => b.min - a.min);

  return { connecte: true, pret: true, canEdit, roster, enCours, semaine, parSalarie, mondayYmd: monday, stats, historique: closes.slice(0, 40) };
}

// ── Assiduité sur 3 semaines (précédente / actuelle / suivante) ─────────────
// Pour chaque salarié et chaque semaine : jours travaillés, heures, absences
// justifiées et injustifiées. Sert directement au calcul des salaires.
export type SemaineAssiduite = { jours: number; heuresMin: number; heuresAjustMin: number; absJust: number; absInj: number; oublis: number; corrections: number };
export type LigneAssiduite = { nom: string; grade: string | null; semaines: SemaineAssiduite[] };
export type AssiduiteData = { pret: boolean; lundis: string[]; lignes: LigneAssiduite[] };

const normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
const semaineVide = (): SemaineAssiduite => ({ jours: 0, heuresMin: 0, heuresAjustMin: 0, absJust: 0, absInj: 0, oublis: 0, corrections: 0 });

export async function getAssiduite(): Promise<AssiduiteData> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, lundis: [], lignes: [] };

  const monday = lundiCourant(new Date().toISOString());
  const lundis = [lundiDecale(monday, -1), monday, lundiDecale(monday, 1)];
  const dimanches = lundis.map(dimancheDe);
  const debutFenetre = lundis[0];
  const finFenetre = dimanches[2];
  // Bornes UTC élargies d'un jour de chaque côté (le regroupement se fait ensuite
  // sur la date civile Paris → aucun jour de bord perdu par le décalage horaire).
  const bMin = new Date(debutFenetre + "T00:00:00Z"); bMin.setUTCDate(bMin.getUTCDate() - 1);
  const bMax = new Date(finFenetre + "T00:00:00Z"); bMax.setUTCDate(bMax.getUTCDate() + 2);
  const semaineDe = (ymd: string) => lundis.findIndex((_, i) => ymd >= lundis[i] && ymd <= dimanches[i]);

  // Roster (salariés actifs) → toutes les personnes apparaissent, même à 0.
  const { data: rost } = await admin.from("DispensaireSalarie").select("id,nom,grade,statut").order("nom", { ascending: true });
  const roster = ((rost || []) as Record<string, unknown>[]).filter((r) => estSalarieActif(r.statut));

  // Une ligne par personne (clé = nom normalisé), semences depuis le roster.
  const map = new Map<string, LigneAssiduite>();
  const joursSet = new Set<string>(); // `${cle}|${sem}|${ymd}` → jours travaillés distincts
  const ligne = (nom: string, grade: string | null) => {
    const cle = normNom(nom);
    let l = map.get(cle);
    if (!l) { l = { nom, grade, semaines: [semaineVide(), semaineVide(), semaineVide()] }; map.set(cle, l); }
    return l;
  };
  for (const r of roster) ligne(String(r.nom || "Salarié"), r.grade == null ? null : String(r.grade));

  // Services VALIDÉS de la fenêtre → jours + heures par semaine (le temps « ouvert »
  // ou non validé n'est jamais compté).
  try {
    const { data: clos } = await admin.from("DispensairePointage").select("nom,debut,dureeMin,fin,valide,finSource").not("fin", "is", null).gte("debut", bMin.toISOString()).lte("debut", bMax.toISOString()).limit(2000);
    for (const r of (clos || []) as Record<string, unknown>[]) {
      if (r.valide === false) continue;            // clôturé mais invalidé → exclu
      const ymd = ymdParis(String(r.debut));
      const sem = semaineDe(ymd);
      if (sem < 0) continue;
      const nom = String(r.nom || "Salarié");
      const l = ligne(nom, null);
      l.semaines[sem].heuresMin += Number(r.dureeMin) || 0;
      const src = String(r.finSource || "normal");
      if (src === "oubli") l.semaines[sem].oublis += 1;
      else if (src === "user" || src === "direction") l.semaines[sem].corrections += 1;
      const k = `${normNom(nom)}|${sem}|${ymd}`;
      if (!joursSet.has(k)) { joursSet.add(k); l.semaines[sem].jours += 1; }
    }
  } catch { /* table absente → 0 partout */ }

  // Absences datées de la fenêtre → justifiées / injustifiées par semaine.
  try {
    const { data: abs } = await admin.from("DispensaireAbsence").select("nom,date,justifiee").gte("date", debutFenetre).lte("date", finFenetre).limit(2000);
    for (const r of (abs || []) as Record<string, unknown>[]) {
      const ymd = String(r.date).slice(0, 10);
      const sem = semaineDe(ymd);
      if (sem < 0) continue;
      const l = ligne(String(r.nom || "Salarié"), null);
      if (r.justifiee) l.semaines[sem].absJust += 1; else l.semaines[sem].absInj += 1;
    }
  } catch { /* table Absence pas encore créée → aucune absence */ }

  // Ajustements manuels d'heures d'effectif (Direction/RH) par semaine : corrigent
  // les heures affichées et le marqueur d'ajustement — SANS toucher aux salaires.
  try {
    const { data: aj } = await admin.from("DispensaireEffectifAjust").select("semaineLundi,nomKey,deltaMin").in("semaineLundi", lundis);
    for (const r of (aj || []) as Record<string, unknown>[]) {
      const sem = lundis.indexOf(String(r.semaineLundi));
      if (sem < 0) continue;
      const l = map.get(String(r.nomKey || ""));
      if (!l) continue;
      const d = Number(r.deltaMin) || 0;
      l.semaines[sem].heuresAjustMin += d;
      l.semaines[sem].heuresMin = Math.max(0, l.semaines[sem].heuresMin + d);
    }
  } catch { /* table absente → aucun ajustement */ }

  const lignes = [...map.values()].sort((a, b) => a.nom.localeCompare(b.nom));
  return { pret: true, lundis, lignes };
}

export type AbsenceRow = { id: string; salarieId: string | null; nom: string; date: string; justifiee: boolean; motif: string | null };
export async function getAbsencesRecentes(): Promise<{ pret: boolean; absences: AbsenceRow[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, absences: [] };
  try {
    const { data, error } = await admin.from("DispensaireAbsence").select("*").order("date", { ascending: false }).limit(60);
    if (error) return { pret: false, absences: [] };
    return { pret: true, absences: ((data || []) as Record<string, unknown>[]).map((r) => ({ id: String(r.id), salarieId: r.salarieId == null ? null : String(r.salarieId), nom: String(r.nom || "Salarié"), date: String(r.date).slice(0, 10), justifiee: !!r.justifiee, motif: r.motif == null ? null : String(r.motif) })) };
  } catch { return { pret: false, absences: [] }; }
}

// Encart léger de l'accueil : uniquement les salariés en service.
export async function getEnService(): Promise<PointSession[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("DispensairePointage").select("*").is("fin", null).order("debut", { ascending: true });
  if (error) return [];
  return ((data || []) as Record<string, unknown>[]).map(toSession);
}

// Services ouverts à traiter par la Direction : « à confirmer » (plus de signal)
// ou escaladés (ouverts au-delà du seuil). Réservé à l'encadrement (RH/Direction).
export type ServiceAValider = { id: string; nom: string; debut: string; lastSeen: string | null; dureeMin: number; motif: "a_confirmer" | "escalade" };
export type ServicesAValiderData = { pret: boolean; peut: boolean; services: ServiceAValider[]; inactiviteMin: number; escaladeH: number };
export async function getServicesAValider(): Promise<ServicesAValiderData> {
  const cfg = await getConfig();
  const base: ServicesAValiderData = { pret: false, peut: false, services: [], inactiviteMin: cfg.pointageInactiviteMin, escaladeH: cfg.pointageEscaladeH };
  const admin = createAdminClient();
  if (!admin) return base;
  const peut = await peutGererRH();
  if (!peut) return { ...base, pret: true };
  const { data, error } = await admin.from("DispensairePointage").select("id,nom,debut,lastSeen").is("fin", null).order("debut", { ascending: true }).limit(200);
  if (error) return { ...base, peut: true };
  const now = Date.now();
  const services: ServiceAValider[] = [];
  for (const r of (data || []) as Record<string, unknown>[]) {
    const debut = String(r.debut);
    const lastSeen = r.lastSeen == null ? null : String(r.lastSeen);
    const esc = estEscalade({ fin: null, debut }, cfg.pointageEscaladeH, now);
    const aConf = estAConfirmer({ fin: null, lastSeen, debut }, cfg.pointageInactiviteMin, now);
    if (!esc && !aConf) continue;
    const t = Date.parse(debut);
    const dureeMin = Number.isFinite(t) ? Math.max(0, Math.round((now - t) / 60000)) : 0;
    services.push({ id: String(r.id), nom: String(r.nom || "Salarié"), debut, lastSeen, dureeMin, motif: esc ? "escalade" : "a_confirmer" });
  }
  return { pret: true, peut: true, services, inactiviteMin: cfg.pointageInactiviteMin, escaladeH: cfg.pointageEscaladeH };
}

// Le service OUVERT du compte connecté (rapproché par nom), pour le heartbeat et
// la reprise à la reconnexion. Renvoie null si le compte n'a pas de service ouvert.
export type MonService = { id: string; debut: string; lastSeen: string | null; nom: string };
export async function getMonServiceOuvert(): Promise<MonService | null> {
  const admin = createAdminClient();
  if (!admin) return null;
  let nom = "";
  try { nom = (await getRoleDispensaire()).nom || ""; } catch { return null; }
  const cle = normNom(nom);
  if (!cle) return null;
  const { data } = await admin.from("DispensairePointage").select("id,nom,debut,lastSeen").is("fin", null).order("debut", { ascending: false }).limit(100);
  const row = ((data || []) as Record<string, unknown>[]).find((r) => normNom(r.nom) === cle);
  if (!row) return null;
  return { id: String(row.id), debut: String(row.debut), lastSeen: row.lastSeen == null ? null : String(row.lastSeen), nom: String(row.nom || nom) };
}
