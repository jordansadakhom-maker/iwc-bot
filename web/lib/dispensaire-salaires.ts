import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { ymdParis, lundiCourant } from "@/lib/dispensaire-dates";
import { calculerSalaire } from "@/lib/dispensaire-salaires-const";

export * from "@/lib/dispensaire-salaires-const";

// ── Salaires (réservé à la Direction) ───────────────────────────────────────
// La direction fixe un salaire HEBDOMADAIRE PLEIN par FONCTION (= grade du
// salarié). Le salaire réel est calculé AUTOMATIQUEMENT à partir des jours
// POINTÉS de la semaine courante :
//     • 4 jours pointés (ou plus) → salaire PLEIN ;
//     • moins de 4 jours → prorata (jours ÷ 4).
// (voir calculerSalaire — dispensaire-salaires-const). Les heures sont affichées
// à part → la direction ajoute les primes à la main.

export type SalaireFonction = { fonction: string; montantHebdo: number };
export type LigneSalaire = { nom: string; fonction: string | null; montantHebdo: number; jours: number; heuresMin: number; salaire: number };
export type LignePaieArchive = { nom: string; fonction: string | null; jours: number; heuresMin: number; salaire: number };
export type ArchivePaie = { semaineLundi: string; at: string; par: string | null; total: number; lignes: LignePaieArchive[] };
export type SalairesData = { pret: boolean; autorise: boolean; semaineLundi: string; fonctions: SalaireFonction[]; lignes: LigneSalaire[]; archives: ArchivePaie[]; semaineArchivee: boolean };

// Archives de paie (semaines figées), les plus récentes d'abord. Dégradation
// propre si la table n'existe pas encore.
export async function getArchivesPaie(): Promise<ArchivePaie[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  try {
    const { data, error } = await admin.from("DispensairePaie").select("*").order("semaineLundi", { ascending: false }).order("salaire", { ascending: false }).limit(400);
    if (error) return [];
    const parSemaine = new Map<string, ArchivePaie>();
    for (const r of (data || []) as Record<string, unknown>[]) {
      const sem = String(r.semaineLundi);
      let a = parSemaine.get(sem);
      if (!a) { a = { semaineLundi: sem, at: String(r.createdAt || ""), par: r.par == null ? null : String(r.par), total: 0, lignes: [] }; parSemaine.set(sem, a); }
      const salaire = Number(r.salaire) || 0;
      a.total += salaire;
      a.lignes.push({ nom: String(r.nom || "Salarié"), fonction: r.fonction == null ? null : String(r.fonction), jours: Number(r.jours) || 0, heuresMin: Number(r.heuresMin) || 0, salaire });
    }
    return [...parSemaine.values()];
  } catch {
    return [];
  }
}

const normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

export async function getSalaires(): Promise<SalairesData> {
  const vide: SalairesData = { pret: false, autorise: false, semaineLundi: "", fonctions: [], lignes: [], archives: [], semaineArchivee: false };
  const autorise = await peutAdministrer();
  if (!autorise) return { pret: true, autorise: false, semaineLundi: "", fonctions: [], lignes: [], archives: [], semaineArchivee: false };
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
    // Règle : 4 jours pointés = salaire plein ; en deçà, prorata (jours ÷ 4).
    const salaire = calculerSalaire(montantHebdo, stat.jours);
    return { nom: s.nom, fonction: s.fonction, montantHebdo, jours: stat.jours, heuresMin: stat.heuresMin, salaire };
  }).sort((a, b) => b.salaire - a.salaire || a.nom.localeCompare(b.nom));

  // Fonctions à barémer = celles présentes chez les salariés ∪ celles déjà au barème.
  const fset = new Map<string, number>();
  for (const s of salaries) if (s.fonction) fset.set(s.fonction, bareme.get(s.fonction) || 0);
  for (const [f, m] of bareme) if (f) fset.set(f, m);
  const fonctions = [...fset.entries()].map(([fonction, montantHebdo]) => ({ fonction, montantHebdo })).sort((a, b) => a.fonction.localeCompare(b.fonction));

  const archives = await getArchivesPaie();
  const semaineArchivee = archives.some((a) => a.semaineLundi === monday);

  return { pret: true, autorise: true, semaineLundi: monday, fonctions, lignes, archives, semaineArchivee };
}
