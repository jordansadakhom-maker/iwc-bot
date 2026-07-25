// Canonicalisation des noms de ressources de chasse — PUR (importable client ET
// serveur). Regroupe les noms TRONQUÉS sous leur forme la plus complète :
// « Viande de petit g » et « Viande de petit gibier » désignent la même ressource.
// Règle SANS AMBIGUÏTÉ : A est une troncature de B si A normalisé est un PRÉFIXE
// de B, et on ne fusionne que si les candidats plus longs forment une chaîne
// (tous préfixes du plus long) — sinon on garde séparé (« Viande de gibier » ≠
// « …gros gibier »). Utilisé à l'affichage (regroupement) ET au scan/import
// (rapprochement du référentiel avant enregistrement → jamais de troncature stockée).

import { cleNom } from "@/lib/noms";
// Normalisation des noms de ressources = la clé d'appariement commune (source unique).
export const normChasse = cleNom;

export function construireCanon(noms: string[]): { cle: (nom: string) => string; label: (cle: string) => string } {
  const disp = new Map<string, string>(); // clé normalisée -> meilleur affichage (le plus long)
  for (const nom of noms) {
    const k = normChasse(nom); if (!k) continue;
    const t = nom.trim(); const p = disp.get(k);
    if (!p || t.length > p.length) disp.set(k, t);
  }
  const keys = [...disp.keys()];
  const canon = new Map<string, string>();
  for (const k of keys) {
    const sup = keys.filter((o) => o !== k && o.startsWith(k)); // k est un préfixe de o
    if (!sup.length) { canon.set(k, k); continue; }
    const long = sup.reduce((a, b) => (b.length > a.length ? b : a));
    canon.set(k, sup.every((s) => long.startsWith(s)) ? long : k); // chaîne → fusion ; branche → séparé
  }
  const resolve = (k: string, g = 0): string => { const c = canon.get(k) ?? k; return c === k || g > 8 ? c : resolve(c, g + 1); };
  return { cle: (nom: string) => resolve(normChasse(nom)), label: (k: string) => disp.get(k) || k };
}
