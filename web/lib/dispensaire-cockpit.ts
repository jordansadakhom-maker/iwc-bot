import "server-only";

import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { getAccueil } from "@/lib/dispensaire-accueil";
import { getPrisesEnCharge } from "@/lib/dispensaire-prises-en-charge";
import { getRendezVous } from "@/lib/dispensaire-rendez-vous";
import { getInterventions } from "@/lib/dispensaire-interventions";
import { getPrevisions } from "@/lib/dispensaire-prevision";
import { getComptabilite } from "@/lib/dispensaire-comptabilite";
import { getJournalAudit, type AuditEntree } from "@/lib/dispensaire-evenements";
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
  ventesJourNb: number; ventesJourCa: number;
  enService: CockpitService[];
  pecEnCours: number; pecAdmis: number; pecEnSoin: number;
  rdvAujourdhui: number; prochainsRdv: CockpitRdv[];
  intervEnCours: number;
  stockAlertes: number; matieresRupture: number; ruptureBientot: number; topRupture: CockpitRupture[];
  journal: AuditEntree[];
};

export async function getCockpit(): Promise<CockpitData> {
  const vide: CockpitData = {
    pret: false, canVoir: false, genereLe: new Date().toISOString(),
    tresorerie: 0, moisSolde: 0, facturesImpayees: 0, du: 0, ventesJourNb: 0, ventesJourCa: 0,
    enService: [], pecEnCours: 0, pecAdmis: 0, pecEnSoin: 0, rdvAujourdhui: 0, prochainsRdv: [], intervEnCours: 0,
    stockAlertes: 0, matieresRupture: 0, ruptureBientot: 0, topRupture: [], journal: [],
  };
  let moi;
  try { moi = await getRoleDispensaire(); } catch { return vide; }
  if (!moi.perms.admin) return { ...vide, pret: true };

  const [accueil, pec, rdv, interv, prev, compta, journalRes] = await Promise.all([
    getAccueil().catch(() => null),
    getPrisesEnCharge().catch(() => null),
    getRendezVous().catch(() => null),
    getInterventions().catch(() => null),
    getPrevisions().catch(() => null),
    getComptabilite().catch(() => null),
    getJournalAudit({ limit: 8 }).catch(() => ({ pret: false, entrees: [] })),
  ]);

  const today = ymdParis();
  const prochainsRdv: CockpitRdv[] = (rdv?.aVenir || []).slice(0, 5).map((r) => ({ patient: r.patient, debut: r.debut, medecin: r.medecin, type: r.type }));
  const rdvAujourdhui = (rdv?.aVenir || []).filter((r) => { try { return ymdParis(r.debut) === today; } catch { return false; } }).length;

  const ruptureUrg = (prev?.items || []).filter((p) => p.urgence === "rupture" || p.urgence === "critique" || p.urgence === "bientot");
  const topRupture: CockpitRupture[] = ruptureUrg.slice(0, 5).map((p) => ({ nom: p.nom, joursRestants: p.joursRestants }));

  return {
    pret: true, canVoir: true, genereLe: new Date().toISOString(),
    tresorerie: compta?.tresorerie ?? 0, moisSolde: compta?.moisSolde ?? 0,
    facturesImpayees: accueil?.facturesImpayees ?? 0, du: accueil?.du ?? 0,
    ventesJourNb: accueil?.ventesJourNb ?? 0, ventesJourCa: accueil?.ventesJourCa ?? 0,
    enService: (accueil?.enService || []).map((s) => ({ nom: s.nom, grade: s.grade, debut: s.debut })),
    pecEnCours: (pec?.enCours || []).length,
    pecAdmis: (pec?.enCours || []).filter((p) => p.etat === "admis").length,
    pecEnSoin: (pec?.enCours || []).filter((p) => p.etat === "en_soin").length,
    rdvAujourdhui, prochainsRdv,
    intervEnCours: (interv?.enCours || []).length,
    stockAlertes: (accueil?.stockAlertes || []).length, matieresRupture: (accueil?.matieresRupture || []).length,
    ruptureBientot: ruptureUrg.length, topRupture,
    journal: journalRes?.entrees || [],
  };
}
