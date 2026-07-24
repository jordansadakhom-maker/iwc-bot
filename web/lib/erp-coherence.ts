// Contrôle de cohérence & réapprovisionnement — utilitaires PURS (aucun accès
// serveur). Détecte doublons, stocks négatifs, et calcule des suggestions de
// commande. Déterministe : opère sur des lignes déjà lues, sans rien inventer.

type Row = Record<string, unknown>;
const num = (v: unknown) => Number(v) || 0;
const norm = (x: unknown) => String(x ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

// Doublons : même nom (normalisé) présent plusieurs fois.
export function detecterDoublons(rows: Row[], key = "nom"): { nom: string; n: number }[] {
  const m = new Map<string, { nom: string; n: number }>();
  for (const r of rows) {
    const k = norm(r[key]);
    if (!k) continue;
    const e = m.get(k);
    if (e) e.n++; else m.set(k, { nom: String(r[key]), n: 1 });
  }
  return [...m.values()].filter((e) => e.n > 1).sort((a, b) => b.n - a.n);
}

// Stocks négatifs (incohérence / perte non tracée).
export function detecterNegatifs(rows: Row[], qtyKey: string): { nom: string; q: number }[] {
  return rows.filter((r) => num(r[qtyKey]) < 0).map((r) => ({ nom: String(r.nom ?? "?"), q: num(r[qtyKey]) }));
}

// Réappro : articles sous le seuil, avec la quantité à commander pour revenir à
// la cible (colonne cible si fournie, sinon valeur fixe, sinon 2× le seuil).
export type ReapproItem = { nom: string; q: number; manque: number };
export function calculerReappro(rows: Row[], opts: { qtyKey: string; seuilKey: string; cibleKey?: string; cibleFixe?: number }): ReapproItem[] {
  const out: ReapproItem[] = [];
  for (const r of rows) {
    const q = num(r[opts.qtyKey]);
    const seuil = num(r[opts.seuilKey]);
    if (seuil <= 0 || q > seuil) continue;
    const cibleCol = opts.cibleKey ? num(r[opts.cibleKey]) : 0;
    const cible = cibleCol > 0 ? cibleCol : (opts.cibleFixe && opts.cibleFixe > 0 ? opts.cibleFixe : seuil * 2);
    const manque = Math.max(0, cible - q);
    if (manque > 0) out.push({ nom: String(r.nom ?? "?"), q, manque });
  }
  return out.sort((a, b) => b.manque - a.manque);
}

// Résumé « liste de courses » : « Bandage ×6 · Morphine ×4 (+2) ».
export function apercuReappro(items: ReapproItem[], max = 3): string {
  const tete = items.slice(0, max).map((i) => `${i.nom} ×${i.manque}`).join(" · ");
  return items.length > max ? `${tete} … +${items.length - max}` : tete;
}
