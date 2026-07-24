// KPI — type pur (importable côté client comme serveur).
export type Kpi = {
  id: string;
  label: string;
  value: string;        // déjà formaté
  sub?: string | null;  // précision discrète
  tone?: string;        // teinte de statut (var(--good) / --warn / --oxblood…) ; défaut = encre
  spark?: number[];     // mini-tendance (série unique) — facultatif
};

// Sous-échantillonne une série à ~n points (garde les extrémités).
export function echantillonner(data: number[], n = 24): number[] {
  if (data.length <= n) return data;
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(data[Math.round((i / (n - 1)) * (data.length - 1))]);
  return out;
}
