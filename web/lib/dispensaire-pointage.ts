import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAcces } from "@/lib/queries";

// ── Pointage du Dispensaire (prise de service) ──────────────────────────────
export type PointSession = {
  id: string; salarieId: string | null; nom: string;
  debut: string; fin: string | null; dureeMin: number | null; note: string | null;
};
export type PointSalarie = { id: string; nom: string; grade: string | null };
export type SemaineJour = { dow: number; min: number };            // dow 0=Lun … 6=Dim
export type PointData = {
  connecte: boolean; pret: boolean; canEdit: boolean;
  roster: PointSalarie[];
  enCours: PointSession[];
  semaine: SemaineJour[];                                            // 7 jours (Lun→Dim)
  parSalarie: { nom: string; min: number }[];                       // total semaine par salarié
  mondayYmd: string;
  historique: PointSession[];                                        // dernières services clôturés
};

const PARIS = "Europe/Paris";
const DOW: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

// Date « civile » à Paris (YYYY-MM-DD) + jour de semaine (0=Lun) pour un instant donné.
function jourParis(iso: string): { ymd: string; dow: number } {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: PARIS, year: "numeric", month: "2-digit", day: "2-digit", weekday: "short" }).formatToParts(new Date(iso));
  const g = (t: string) => parts.find((p) => p.type === t)?.value || "";
  return { ymd: `${g("year")}-${g("month")}-${g("day")}`, dow: DOW[g("weekday")] ?? 0 };
}

// Lundi (YYYY-MM-DD, date civile Paris) de la semaine contenant `nowIso`.
function lundiDeLaSemaine(nowIso: string): string {
  const { ymd, dow } = jourParis(nowIso);
  const base = new Date(ymd + "T12:00:00Z");         // midi UTC : à l'abri des bascules d'heure
  base.setUTCDate(base.getUTCDate() - dow);
  return base.toISOString().slice(0, 10);
}

function toSession(r: Record<string, unknown>): PointSession {
  return {
    id: String(r.id), salarieId: r.salarieId == null ? null : String(r.salarieId), nom: String(r.nom || "Salarié"),
    debut: String(r.debut), fin: r.fin == null ? null : String(r.fin),
    dureeMin: r.dureeMin == null ? null : Number(r.dureeMin) || 0, note: r.note == null ? null : String(r.note),
  };
}

export async function getPointage(): Promise<PointData> {
  const vide: PointData = { connecte: false, pret: false, canEdit: false, roster: [], enCours: [], semaine: [], parSalarie: [], mondayYmd: "", historique: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  // Le pointage est un outil de service partagé : ouvert à toute personne connectée.
  let canEdit = true;
  try { await getAcces(); } catch { /* accès permissif par défaut */ }

  const monday = lundiDeLaSemaine(new Date().toISOString());

  // Roster (salariés actifs) pour le sélecteur de prise de service.
  const { data: rost } = await admin.from("DispensaireSalarie").select("id,nom,grade,statut").order("nom", { ascending: true });
  const roster: PointSalarie[] = ((rost || []) as Record<string, unknown>[])
    .filter((r) => String(r.statut || "actif") !== "renvoye")
    .map((r) => ({ id: String(r.id), nom: String(r.nom || "Salarié"), grade: r.grade == null ? null : String(r.grade) }));

  // Sessions ouvertes (en service).
  const { data: ouv, error: eOuv } = await admin.from("DispensairePointage").select("*").is("fin", null).order("debut", { ascending: true });
  if (eOuv) return { ...vide, connecte: true, pret: false, canEdit, roster, mondayYmd: monday };
  const enCours = ((ouv || []) as Record<string, unknown>[]).map(toSession);

  // Services récents clôturés (historique + agrégat de la semaine).
  const { data: clos } = await admin.from("DispensairePointage").select("*").not("fin", "is", null).order("debut", { ascending: false }).limit(300);
  const closes = ((clos || []) as Record<string, unknown>[]).map(toSession);

  // Agrégat semaine (Lun→Dim) sur les services clôturés de la semaine courante.
  const semaine: SemaineJour[] = Array.from({ length: 7 }, (_, i) => ({ dow: i, min: 0 }));
  const parNom = new Map<string, number>();
  for (const s of closes) {
    const { ymd, dow } = jourParis(s.debut);
    if (ymd < monday) continue;                       // hors semaine courante
    const min = s.dureeMin || 0;
    semaine[dow].min += min;
    parNom.set(s.nom, (parNom.get(s.nom) || 0) + min);
  }
  const parSalarie = [...parNom.entries()].map(([nom, min]) => ({ nom, min })).sort((a, b) => b.min - a.min);

  return { connecte: true, pret: true, canEdit, roster, enCours, semaine, parSalarie, mondayYmd: monday, historique: closes.slice(0, 40) };
}

// Encart léger de l'accueil : uniquement les salariés en service.
export async function getEnService(): Promise<PointSession[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("DispensairePointage").select("*").is("fin", null).order("debut", { ascending: true });
  if (error) return [];
  return ((data || []) as Record<string, unknown>[]).map(toSession);
}
