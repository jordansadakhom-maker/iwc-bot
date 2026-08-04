import type { SoinFDO } from "@/lib/dispensaire-facturation-const";

// ─────────────────────────────────────────────────────────────────────────────
// Regroupement des soins FDO par SEMAINE DU MOIS (définition maison, calendaire) :
//   Semaine 1 : du 1 au 7   ·  Semaine 2 : du 8 au 14
//   Semaine 3 : du 15 au 21 ·  Semaine 4 : du 22 à la fin du mois
// Le classement suit la DATE du soin (createdAt). 100 % pur → client-safe.
// ─────────────────────────────────────────────────────────────────────────────

export const MOIS_FR = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

// N° de semaine dans le mois (1..4) — la 4ᵉ absorbe les jours 22→fin.
export function semaineDuMois(d: Date): number {
  return Math.min(4, Math.ceil(d.getDate() / 7));
}
function dernierJour(annee: number, mois1: number): number { return new Date(annee, mois1, 0).getDate(); } // mois1 = 1..12

// Clé stable d'une semaine : « AAAA-MM-Sn ».
export function cleSemaineDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-S${semaineDuMois(d)}`;
}
export function cleSemaine(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0000-00-S0";
  return cleSemaineDate(d);
}

// Semaine précédente (même schéma) : Sn-1, ou dernière semaine (S4) du mois d'avant.
export function cleSemainePrecedente(d: Date): string {
  const n = semaineDuMois(d);
  if (n > 1) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-S${n - 1}`;
  const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
  return `${prev.getFullYear()}-${String(prev.getMonth() + 1).padStart(2, "0")}-S4`;
}

export function periodeSemaine(annee: number, mois1: number, n: number): { du: number; au: number; label: string; mois: string } {
  const du = (n - 1) * 7 + 1;
  const au = n < 4 ? n * 7 : dernierJour(annee, mois1);
  return { du, au, label: `Du ${du} au ${au}`, mois: MOIS_FR[mois1 - 1] || "" };
}

export type ParBureau = { bureau: string; nb: number; total: number };
export type SemaineFDO = {
  cle: string; annee: number; mois: number; n: number;
  periode: string; moisLabel: string;
  nb: number; total: number; patients: number; nbBureaux: number;
  parBureau: ParBureau[]; soins: SoinFDO[];
};

// Décompose une clé « AAAA-MM-Sn » → { annee, mois(1..12), n }.
function decoupe(cle: string): { annee: number; mois: number; n: number } {
  const p = cle.split(/-|S/).filter(Boolean);
  return { annee: Number(p[0]) || 0, mois: Number(p[1]) || 0, n: Number(p[2]) || 0 };
}

export function grouperParSemaine(soins: SoinFDO[]): SemaineFDO[] {
  const map = new Map<string, SoinFDO[]>();
  for (const s of soins) {
    const cle = cleSemaine(s.createdAt);
    const arr = map.get(cle);
    if (arr) arr.push(s); else map.set(cle, [s]);
  }
  const out: SemaineFDO[] = [];
  for (const [cle, list] of map) {
    const { annee, mois, n } = decoupe(cle);
    const per = periodeSemaine(annee, mois, n);
    const bm = new Map<string, { nb: number; total: number }>();
    const pats = new Set<string>();
    let total = 0;
    for (const s of list) {
      const e = bm.get(s.bureau) || { nb: 0, total: 0 };
      e.nb += 1; e.total += s.montant; bm.set(s.bureau, e);
      total += s.montant;
      pats.add((s.agent || "—").toLowerCase().trim());
    }
    const parBureau = [...bm.entries()].map(([bureau, e]) => ({ bureau, ...e })).sort((a, b) => b.total - a.total || a.bureau.localeCompare(b.bureau));
    out.push({
      cle, annee, mois, n, periode: per.label, moisLabel: per.mois,
      nb: list.length, total, patients: pats.size, nbBureaux: bm.size,
      parBureau,
      soins: [...list].sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)),
    });
  }
  return out.sort((a, b) => (b.annee - a.annee) || (b.mois - a.mois) || (b.n - a.n));
}

export type StatsFDO = {
  soinsSemaine: number; totalSemaine: number;
  adminTop: { bureau: string; nb: number } | null;
  medecinTop: { nom: string; nb: number } | null;
  deltaSemaine: number; // soins semaine courante − semaine précédente
};

function plusHaut(m: Map<string, number>): { k: string; v: number } | null {
  let bk = "", bv = 0;
  for (const [k, v] of m) if (v > bv) { bk = k; bv = v; }
  return bv ? { k: bk, v: bv } : null;
}

export function statsFDO(soins: SoinFDO[], now: Date): StatsFDO {
  const cur = cleSemaineDate(now), prev = cleSemainePrecedente(now);
  let soinsSemaine = 0, totalSemaine = 0, prevCount = 0;
  const bureauCnt = new Map<string, number>();
  const medCnt = new Map<string, number>();
  for (const s of soins) {
    const k = cleSemaine(s.createdAt);
    if (k === cur) { soinsSemaine++; totalSemaine += s.montant; }
    if (k === prev) prevCount++;
    bureauCnt.set(s.bureau, (bureauCnt.get(s.bureau) || 0) + 1);
    if (s.par) medCnt.set(s.par, (medCnt.get(s.par) || 0) + 1);
  }
  const a = plusHaut(bureauCnt);
  const md = plusHaut(medCnt);
  return {
    soinsSemaine, totalSemaine,
    adminTop: a ? { bureau: a.k, nb: a.v } : null,
    medecinTop: md ? { nom: md.k, nb: md.v } : null,
    deltaSemaine: soinsSemaine - prevCount,
  };
}
