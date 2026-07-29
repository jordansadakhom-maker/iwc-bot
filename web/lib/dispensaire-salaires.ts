import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { ymdParis, lundiCourant } from "@/lib/dispensaire-dates";

// ── Salaires (réservé à la Direction) ───────────────────────────────────────
// La direction fixe un salaire HEBDOMADAIRE (plein, 7 jours) par FONCTION
// (= grade du salarié). Le salaire réel est calculé AUTOMATIQUEMENT :
//     salaire = montantHebdo ÷ 7 × jours travaillés (semaine courante, pointage).
// Les heures sont affichées à part → la direction ajoute les primes à la main.

export type SalaireFonction = { fonction: string; montantHebdo: number };
export type LigneSalaire = { nom: string; fonction: string | null; montantHebdo: number; jours: number; heuresMin: number; salaire: number };
export type SalairesData = { pret: boolean; autorise: boolean; semaineLundi: string; fonctions: SalaireFonction[]; lignes: LigneSalaire[] };

const normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

export async function getSalaires(): Promise<SalairesData> {
  const vide: SalairesData = { pret: false, autorise: false, semaineLundi: "", fonctions: [], lignes: [] };
  const autorise = await peutAdministrer();
  if (!autorise) return { pret: true, autorise: false, semaineLundi: "", fonctions: [], lignes: [] };
  const admin = createAdminClient();
  if (!admin) return vide;

  const monday = lundiCourant(new Date().toISOString());

  // Salariés actifs (fonction = grade, texte libre).
  const { data: sal } = await admin.from("DispensaireSalarie").select("nom,grade,statut").order("nom", { ascending: true });
  const salaries = ((sal || []) as Record<string, unknown>[])
    .filter((r) => String(r.statut || "actif") !== "renvoye")
    .map((r) => ({ nom: String(r.nom || "Salarié"), fonction: r.grade == null ? null : String(r.grade).trim() || null }));

  // Barème par fonction (clé = fonction exacte, comme la PK en base).
  const bareme = new Map<string, number>();
  try {
    const { data: b } = await admin.from("DispensaireSalaireFonction").select("fonction,montantHebdo");
    for (const r of (b || []) as Record<string, unknown>[]) bareme.set(String(r.fonction || "").trim(), Number(r.montantHebdo) || 0);
  } catch { /* table absente → barème vide (tout à 0) */ }

  // Jours + heures de la SEMAINE COURANTE, par salarié (rapproché par nom).
  const jm = new Map<string, { jours: number; heuresMin: number }>();
  try {
    const bMin = new Date(monday + "T00:00:00Z"); bMin.setUTCDate(bMin.getUTCDate() - 1);
    const { data: clos } = await admin.from("DispensairePointage").select("nom,debut,dureeMin,fin").not("fin", "is", null).gte("debut", bMin.toISOString()).limit(2000);
    const joursSet = new Set<string>();
    for (const r of (clos || []) as Record<string, unknown>[]) {
      const ymd = ymdParis(String(r.debut));
      if (ymd < monday) continue;                 // seulement la semaine courante
      const k = normNom(r.nom);
      const e = jm.get(k) || { jours: 0, heuresMin: 0 };
      e.heuresMin += Number(r.dureeMin) || 0;
      const dk = `${k}|${ymd}`;
      if (!joursSet.has(dk)) { joursSet.add(dk); e.jours += 1; }
      jm.set(k, e);
    }
  } catch { /* pointage absent → 0 partout */ }

  const lignes: LigneSalaire[] = salaries.map((s) => {
    const montantHebdo = s.fonction ? (bareme.get(s.fonction) || 0) : 0;
    const stat = jm.get(normNom(s.nom)) || { jours: 0, heuresMin: 0 };
    const salaire = Math.round((montantHebdo / 7) * stat.jours);
    return { nom: s.nom, fonction: s.fonction, montantHebdo, jours: stat.jours, heuresMin: stat.heuresMin, salaire };
  }).sort((a, b) => b.salaire - a.salaire || a.nom.localeCompare(b.nom));

  // Fonctions à barémer = celles présentes chez les salariés ∪ celles déjà au barème.
  const fset = new Map<string, number>();
  for (const s of salaries) if (s.fonction) fset.set(s.fonction, bareme.get(s.fonction) || 0);
  for (const [f, m] of bareme) if (f) fset.set(f, m);
  const fonctions = [...fset.entries()].map(([fonction, montantHebdo]) => ({ fonction, montantHebdo })).sort((a, b) => a.fonction.localeCompare(b.fonction));

  return { pret: true, autorise: true, semaineLundi: monday, fonctions, lignes };
}
