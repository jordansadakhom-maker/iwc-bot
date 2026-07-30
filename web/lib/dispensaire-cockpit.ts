import "server-only";

import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { getAccueil } from "@/lib/dispensaire-accueil";
import { getPrisesEnCharge } from "@/lib/dispensaire-prises-en-charge";
import { getRendezVous } from "@/lib/dispensaire-rendez-vous";
import { getInterventions } from "@/lib/dispensaire-interventions";
import { getChambres } from "@/lib/dispensaire-chambres";
import { getPrevisions } from "@/lib/dispensaire-prevision";
import { getComptabilite } from "@/lib/dispensaire-comptabilite";
import { getJournalAudit, type AuditEntree } from "@/lib/dispensaire-evenements";
import { getFactures } from "@/lib/dispensaire-facturation";
import { estDeclarableFDO } from "@/lib/dispensaire-facturation-const";
import { getRapportConfig } from "@/lib/dispensaire-rapport-impayes";
import { getSalaires } from "@/lib/dispensaire-salaires";
import { getAssiduite } from "@/lib/dispensaire-pointage";
import { ymdParis } from "@/lib/dispensaire-dates";

// ── Cockpit Direction (Lot 7) — vue agrégée de tout le SIH ───────────────────
// Compose les modules existants en un tableau de bord unique (100 % dérivé, aucun
// nouveau SQL). Réservé à la direction (droit admin).

export type CockpitRdv = { patient: string; debut: string; medecin: string | null; type: string | null };
export type CockpitService = { nom: string; grade: string | null; debut: string };
export type CockpitRupture = { nom: string; joursRestants: number | null };

export type CockpitData = {
  pret: boolean; canVoir: boolean; genereLe: string;
  tresorerie: number; moisSolde: number; facturesImpayees: number; du: number;
  facturesEnRetard: number; duRetard: number; seuilRetard: number;
  masseSalariale: number; absencesInjustifiees: number;
  ventesJourNb: number; ventesJourCa: number;
  enService: CockpitService[];
  pecEnCours: number; pecAdmis: number; pecEnSoin: number;
  rdvAujourdhui: number; prochainsRdv: CockpitRdv[];
  intervEnCours: number;
  chambresOccupees: number; chambresTotal: number;
  stockAlertes: number; matieresRupture: number; ruptureBientot: number; topRupture: CockpitRupture[];
  journal: AuditEntree[];
};

export async function getCockpit(): Promise<CockpitData> {
  const vide: CockpitData = {
    pret: false, canVoir: false, genereLe: new Date().toISOString(),
    tresorerie: 0, moisSolde: 0, facturesImpayees: 0, du: 0,
    facturesEnRetard: 0, duRetard: 0, seuilRetard: 3, masseSalariale: 0, absencesInjustifiees: 0,
    ventesJourNb: 0, ventesJourCa: 0,
    enService: [], pecEnCours: 0, pecAdmis: 0, pecEnSoin: 0, rdvAujourdhui: 0, prochainsRdv: [], intervEnCours: 0,
    chambresOccupees: 0, chambresTotal: 0,
    stockAlertes: 0, matieresRupture: 0, ruptureBientot: 0, topRupture: [], journal: [],
  };
  let moi;
  try { moi = await getRoleDispensaire(); } catch { return vide; }
  if (!moi.perms.admin) return { ...vide, pret: true };

  const [accueil, pec, rdv, interv, chambres, prev, compta, journalRes, factures, cfg, salaires, assiduite] = await Promise.all([
    getAccueil().catch(() => null),
    getPrisesEnCharge().catch(() => null),
    getRendezVous().catch(() => null),
    getInterventions().catch(() => null),
    getChambres().catch(() => null),
    getPrevisions().catch(() => null),
    getComptabilite().catch(() => null),
    getJournalAudit({ limit: 8 }).catch(() => ({ pret: false, entrees: [] })),
    getFactures().catch(() => null),
    getRapportConfig().catch(() => null),
    getSalaires().catch(() => null),
    getAssiduite().catch(() => null),
  ]);

  const today = ymdParis();

  // Factures RÉELLEMENT en retard (même règle que la déclaration FDO) + montant dû.
  const seuilRetard = Math.max(0, cfg?.joursRetard ?? 3);
  const now = Date.now();
  const enRetard = (factures?.factures || []).filter((f) => estDeclarableFDO(f, seuilRetard, now));
  const facturesEnRetard = enRetard.length;
  const duRetard = enRetard.reduce((a, f) => a + f.montant, 0);
  // Masse salariale de la semaine (somme des salaires calculés) + absences injustifiées (semaine courante).
  const masseSalariale = (salaires?.lignes || []).reduce((a, l) => a + l.salaire, 0);
  const absencesInjustifiees = (assiduite?.lignes || []).reduce((a, l) => a + (l.semaines[1]?.absInj || 0), 0);
  const prochainsRdv: CockpitRdv[] = (rdv?.aVenir || []).slice(0, 5).map((r) => ({ patient: r.patient, debut: r.debut, medecin: r.medecin, type: r.type }));
  const rdvAujourdhui = (rdv?.aVenir || []).filter((r) => { try { return ymdParis(r.debut) === today; } catch { return false; } }).length;

  const ruptureUrg = (prev?.items || []).filter((p) => p.urgence === "rupture" || p.urgence === "critique" || p.urgence === "bientot");
  const topRupture: CockpitRupture[] = ruptureUrg.slice(0, 5).map((p) => ({ nom: p.nom, joursRestants: p.joursRestants }));

  return {
    pret: true, canVoir: true, genereLe: new Date().toISOString(),
    tresorerie: compta?.tresorerie ?? 0, moisSolde: compta?.moisSolde ?? 0,
    facturesImpayees: accueil?.facturesImpayees ?? 0, du: accueil?.du ?? 0,
    facturesEnRetard, duRetard, seuilRetard, masseSalariale, absencesInjustifiees,
    ventesJourNb: accueil?.ventesJourNb ?? 0, ventesJourCa: accueil?.ventesJourCa ?? 0,
    enService: (accueil?.enService || []).map((s) => ({ nom: s.nom, grade: s.grade, debut: s.debut })),
    pecEnCours: (pec?.enCours || []).length,
    pecAdmis: (pec?.enCours || []).filter((p) => p.etat === "admis").length,
    pecEnSoin: (pec?.enCours || []).filter((p) => p.etat === "en_soin").length,
    rdvAujourdhui, prochainsRdv,
    intervEnCours: (interv?.enCours || []).length,
    chambresOccupees: chambres?.stats?.occupee ?? 0,
    chambresTotal: chambres ? Object.values(chambres.stats).reduce((a, b) => a + b, 0) : 0,
    stockAlertes: (accueil?.stockAlertes || []).length, matieresRupture: (accueil?.matieresRupture || []).length,
    ruptureBientot: ruptureUrg.length, topRupture,
    journal: journalRes?.entrees || [],
  };
}
