import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { peutAdministrer } from "@/lib/dispensaire-roles";
import { ymdParis, lundiCourant, lundiDecale, dimancheDe } from "@/lib/dispensaire-dates";
import { joursRetenus as calcJoursRetenus, salaireFinal } from "@/lib/dispensaire-salaires-const";
import { estSalarieActif } from "@/lib/dispensaire-personnel-const";

export * from "@/lib/dispensaire-salaires-const";

// ── Salaires (réservé à la Direction) ───────────────────────────────────────
// La direction fixe un salaire HEBDOMADAIRE PLEIN par FONCTION (= grade du
// salarié). Le salaire réel est calculé AUTOMATIQUEMENT à partir des jours
// POINTÉS de la semaine courante :
//     • 4 jours pointés (ou plus) → salaire PLEIN ;
//     • moins de 4 jours → prorata (jours ÷ 4).
// (voir calculerSalaire — dispensaire-salaires-const). Les heures sont affichées
// à part → la direction ajoute les primes à la main.

export type SalaireFonction = { fonction: string; montantHebdo: number; utilisee: boolean };
// `jours` = jours RETENUS (auto + ajustement) ; `salaire` = salaire FINAL (base + prime).
export type LigneSalaire = { nom: string; fonction: string | null; montantHebdo: number; joursAuto: number; ajustJours: number; jours: number; heuresAutoMin: number; ajustMin: number; heuresMin: number; prime: number; salaireBase: number; salaire: number };
export type LignePaieArchive = { nom: string; fonction: string | null; joursAuto: number; ajustJours: number; jours: number; heuresMin: number; prime: number; salaireBase: number; salaire: number };
export type ArchivePaie = { semaineLundi: string; at: string; par: string | null; total: number; lignes: LignePaieArchive[] };
export type SalairesData = { pret: boolean; autorise: boolean; semaineLundi: string; fonctions: SalaireFonction[]; lignes: LigneSalaire[]; archives: ArchivePaie[]; semaineArchivee: boolean;
  // Navigation & « semaine active » : la semaine affichée n'est plus forcément la
  // semaine civile courante — c'est la plus ancienne semaine NON figée avec activité
  // (elle reste affichée tant qu'on ne l'a pas figée → plus de « disparition » le lundi).
  estCourante: boolean; semainePrec: string; semaineSuiv: string | null; semainesEnAttente: string[] };

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
      a.lignes.push({ nom: String(r.nom || "Salarié"), fonction: r.fonction == null ? null : String(r.fonction), joursAuto: Number(r.joursAuto) || 0, ajustJours: Number(r.ajustJours) || 0, jours: Number(r.jours) || 0, heuresMin: Number(r.heuresMin) || 0, prime: Number(r.prime) || 0, salaireBase: Number(r.salaireBase) || 0, salaire });
    }
    return [...parSemaine.values()];
  } catch {
    return [];
  }
}

const normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

type Admin = NonNullable<ReturnType<typeof createAdminClient>>;

// Contexte de paie : quelle semaine afficher par DÉFAUT et lesquelles restent « en
// attente de figeage ». Règle demandée par la Direction : tant qu'une semaine n'est
// pas figée manuellement, ses jours/heures ne doivent PAS disparaître au passage à
// la semaine civile suivante. On renvoie donc comme semaine « active » la PLUS
// ANCIENNE semaine (fenêtre de 6 semaines) qui a de l'activité pointée ET n'est pas
// encore figée ; à défaut, la semaine courante.
const FENETRE_SEMAINES = 6;
export async function contextePaie(admin: Admin): Promise<{ active: string; enAttente: string[]; courante: string }> {
  const courante = lundiCourant(new Date().toISOString());
  // Semaines déjà figées (archivées).
  const figes = new Set<string>();
  try {
    const { data } = await admin.from("DispensairePaie").select("semaineLundi");
    for (const r of (data || []) as Record<string, unknown>[]) figes.add(String(r.semaineLundi));
  } catch { /* table absente → aucune semaine figée */ }
  // Semaines (dans la fenêtre) ayant au moins un service validé & clôturé.
  const avecActivite = new Set<string>();
  try {
    const debut = lundiDecale(courante, -FENETRE_SEMAINES);
    const bMin = new Date(debut + "T00:00:00Z"); bMin.setUTCDate(bMin.getUTCDate() - 1);
    const { data } = await admin.from("DispensairePointage").select("debut,fin,valide").not("fin", "is", null).gte("debut", bMin.toISOString()).limit(4000);
    for (const r of (data || []) as Record<string, unknown>[]) {
      if (r.valide === false) continue;
      avecActivite.add(lundiCourant(String(r.debut)));
    }
  } catch { /* pointage absent → aucune activité */ }
  // De la plus ancienne (−6) à la précédente (−1) : semaines passées non figées avec activité.
  const enAttente: string[] = [];
  for (let i = FENETRE_SEMAINES; i >= 1; i--) {
    const wk = lundiDecale(courante, -i);
    if (avecActivite.has(wk) && !figes.has(wk)) enAttente.push(wk);
  }
  const active = enAttente.length ? enAttente[0] : courante;
  return { active, enAttente, courante };
}

export async function getSalaires(semaineCible?: string): Promise<SalairesData> {
  const navVide = { estCourante: true, semainePrec: "", semaineSuiv: null, semainesEnAttente: [] as string[] };
  const vide: SalairesData = { pret: false, autorise: false, semaineLundi: "", fonctions: [], lignes: [], archives: [], semaineArchivee: false, ...navVide };
  const autorise = await peutAdministrer();
  if (!autorise) return { pret: true, autorise: false, semaineLundi: "", fonctions: [], lignes: [], archives: [], semaineArchivee: false, ...navVide };
  const admin = createAdminClient();
  if (!admin) return vide;

  // Semaine affichée : celle demandée (navigation) si valide, sinon la « semaine
  // active » (plus ancienne semaine non figée avec activité, ou la courante).
  const ctx = await contextePaie(admin);
  const monday = (semaineCible && /^\d{4}-\d{2}-\d{2}$/.test(semaineCible)) ? semaineCible : ctx.active;

  // Salariés actifs (fonction = grade, texte libre).
  const { data: sal } = await admin.from("DispensaireSalarie").select("nom,grade,statut").order("nom", { ascending: true });
  const salaries = ((sal || []) as Record<string, unknown>[])
    .filter((r) => estSalarieActif(r.statut))
    .map((r) => ({ nom: String(r.nom || "Salarié"), fonction: r.grade == null ? null : String(r.grade).trim() || null }));

  // Barème par fonction (clé = fonction exacte, comme la PK en base).
  const bareme = new Map<string, number>();
  try {
    const { data: b } = await admin.from("DispensaireSalaireFonction").select("fonction,montantHebdo");
    for (const r of (b || []) as Record<string, unknown>[]) bareme.set(String(r.fonction || "").trim(), Number(r.montantHebdo) || 0);
  } catch { /* table absente → barème vide (tout à 0) */ }

  // Jours + heures de la SEMAINE AFFICHÉE (bornée lundi→dimanche), par salarié.
  const dimanche = dimancheDe(monday);
  const jm = new Map<string, { jours: number; heuresMin: number }>();
  try {
    const bMin = new Date(monday + "T00:00:00Z"); bMin.setUTCDate(bMin.getUTCDate() - 1);
    const bMax = new Date(dimanche + "T00:00:00Z"); bMax.setUTCDate(bMax.getUTCDate() + 2);
    const { data: clos } = await admin.from("DispensairePointage").select("nom,debut,dureeMin,fin,valide").not("fin", "is", null).gte("debut", bMin.toISOString()).lte("debut", bMax.toISOString()).limit(2000);
    const joursSet = new Set<string>();
    for (const r of (clos || []) as Record<string, unknown>[]) {
      if (r.valide === false) continue;           // service invalidé → ne compte pas pour la paie
      const ymd = ymdParis(String(r.debut));
      if (ymd < monday || ymd > dimanche) continue; // strictement la semaine affichée
      const k = normNom(r.nom);
      const e = jm.get(k) || { jours: 0, heuresMin: 0 };
      e.heuresMin += Number(r.dureeMin) || 0;
      const dk = `${k}|${ymd}`;
      if (!joursSet.has(dk)) { joursSet.add(dk); e.jours += 1; }
      jm.set(k, e);
    }
  } catch { /* pointage absent → 0 partout */ }

  // Ajustements manuels d'heures d'effectif (Direction/RH) → corrigent l'AFFICHAGE
  // des heures de cette colonne, JAMAIS le salaire (qui ne dépend que des jours).
  // On garde le delta À PART (jm reste les heures AUTO du pointage) pour pouvoir
  // afficher « auto X · ajust Y » et permettre l'édition depuis la page salaires.
  const deltaMin = new Map<string, number>();
  try {
    const { data: eh } = await admin.from("DispensaireEffectifAjust").select("nomKey,deltaMin").eq("semaineLundi", monday);
    for (const r of (eh || []) as Record<string, unknown>[]) deltaMin.set(String(r.nomKey || ""), Number(r.deltaMin) || 0);
  } catch { /* table absente → aucun ajustement */ }

  // Ajustements manuels de la Direction pour la semaine courante (prime + correction
  // de jours), rapprochés par nom normalisé. Dégradation propre si la table manque.
  const ajust = new Map<string, { prime: number; ajustJours: number }>();
  try {
    const { data: aj } = await admin.from("DispensairePaieAjust").select("nomKey,prime,ajustJours").eq("semaineLundi", monday);
    for (const r of (aj || []) as Record<string, unknown>[]) ajust.set(String(r.nomKey || ""), { prime: Number(r.prime) || 0, ajustJours: Number(r.ajustJours) || 0 });
  } catch { /* table absente → aucun ajustement */ }

  const lignes: LigneSalaire[] = salaries.map((s) => {
    const montantHebdo = s.fonction ? (bareme.get(s.fonction) || 0) : 0;
    const k = normNom(s.nom);
    const stat = jm.get(k) || { jours: 0, heuresMin: 0 };
    const aj = ajust.get(k) || { prime: 0, ajustJours: 0 };
    // Jours retenus = jours pointés + ajustement manuel ; salaire final = calcul + prime.
    const jours = calcJoursRetenus(stat.jours, aj.ajustJours);
    const prime = Math.max(0, Math.round(Number(aj.prime) || 0));
    const salaire = salaireFinal(montantHebdo, jours, prime);
    // Heures = heures pointées (auto) + ajustement manuel (peut être négatif), borné à 0.
    const ajustMin = deltaMin.get(k) || 0;
    const heuresMin = Math.max(0, stat.heuresMin + ajustMin);
    return { nom: s.nom, fonction: s.fonction, montantHebdo, joursAuto: stat.jours, ajustJours: aj.ajustJours, jours, heuresAutoMin: stat.heuresMin, ajustMin, heuresMin, prime, salaireBase: salaire - prime, salaire };
  }).sort((a, b) => b.salaire - a.salaire || a.nom.localeCompare(b.nom));

  // Fonctions à barémer = celles présentes chez les salariés ∪ celles déjà au barème.
  // `utilisee` = au moins un salarié actif porte cette fonction (⇒ suppression du
  // barème = remise à 0, la fonction réapparaît). Sinon = entrée orpheline supprimable.
  const usedF = new Set(salaries.map((s) => s.fonction).filter(Boolean) as string[]);
  const fset = new Map<string, number>();
  for (const s of salaries) if (s.fonction) fset.set(s.fonction, bareme.get(s.fonction) || 0);
  for (const [f, m] of bareme) if (f) fset.set(f, m);
  const fonctions = [...fset.entries()].map(([fonction, montantHebdo]) => ({ fonction, montantHebdo, utilisee: usedF.has(fonction) })).sort((a, b) => a.fonction.localeCompare(b.fonction));

  const archives = await getArchivesPaie();
  const semaineArchivee = archives.some((a) => a.semaineLundi === monday);

  // Navigation : on ne va jamais dans le futur (semaine suivante nulle si on est
  // déjà sur la semaine courante). `semainesEnAttente` alimente l'indicateur
  // « semaines à figer ».
  const estCourante = monday === ctx.courante;
  const semainePrec = lundiDecale(monday, -1);
  const semaineSuiv = monday < ctx.courante ? lundiDecale(monday, 1) : null;

  return { pret: true, autorise: true, semaineLundi: monday, fonctions, lignes, archives, semaineArchivee, estCourante, semainePrec, semaineSuiv, semainesEnAttente: ctx.enAttente };
}
