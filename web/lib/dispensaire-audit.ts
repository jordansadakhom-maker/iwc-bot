import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleDispensaire, getGrades } from "@/lib/dispensaire-roles";
import { scorer, trierAnomalies, type Anomalie, type RapportAudit, type ChecklistItem } from "@/lib/audit-core";

export * from "@/lib/audit-core";

const CATEGORIES = ["Intégrité", "Cohérence", "Dates", "Unicité", "Permissions"];

// Checklist des tests manuels (scénarios) — cochable côté client (localStorage).
const CHECKLIST: ChecklistItem[] = [
  { id: "d-acc-1", groupe: "Accès & rôles", libelle: "Un compte hors liste blanche est bien refusé (écran « Accès réservé »)." },
  { id: "d-acc-2", groupe: "Accès & rôles", libelle: "Un médecin ne voit pas les onglets Admin/Compta/Cockpit." },
  { id: "d-pec-1", groupe: "Prise en charge", libelle: "Admettre un patient → il apparaît en « Admis »." },
  { id: "d-pec-2", groupe: "Prise en charge", libelle: "Démarrer le soin → passe « En soin » ; terminer → facture créée + stock débité." },
  { id: "d-pec-3", groupe: "Prise en charge", libelle: "Attribuer une chambre → la chambre passe « occupée » ; clôture → libérée." },
  { id: "d-stk-1", groupe: "Stock", libelle: "Entrée/sortie de stock → le stock glissant se met à jour + mouvement journalisé." },
  { id: "d-stk-2", groupe: "Stock", libelle: "Un article sous seuil déclenche l'alerte dans les notifications." },
  { id: "d-fac-1", groupe: "Facturation", libelle: "Encaisser une facture → statut « payée » ; le total colle aux lignes." },
  { id: "d-rdv-1", groupe: "Rendez-vous", libelle: "Créer un RDV du jour → rappel présent dans les notifications." },
  { id: "d-rt-1", groupe: "Temps réel", libelle: "Une action sur un poste se reflète sur un autre écran sans F5." },
];

const rapportVide = (opts: Partial<RapportAudit> = {}): RapportAudit => ({
  genereLe: new Date().toISOString(), pret: false, canVoir: false, scoreGlobal: 100,
  totalControles: 0, categories: [], anomalies: [], checklist: CHECKLIST, ...opts,
});

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase();

// Lance l'audit complet du Dispensaire — 100 % lecture seule (aucune écriture).
export async function getAuditDispensaire(): Promise<RapportAudit> {
  let admin_ok = false;
  try { admin_ok = !!(await getRoleDispensaire()).perms.admin; } catch { admin_ok = false; }
  if (!admin_ok) return rapportVide({ canVoir: false });

  const admin = createAdminClient();
  if (!admin) return rapportVide({ canVoir: true, pret: false });

  const q = async (t: string, cols: string): Promise<Record<string, unknown>[]> => {
    try { const { data, error } = await admin.from(t).select(cols).limit(5000); return error ? [] : ((data as unknown as Record<string, unknown>[]) || []); }
    catch { return []; }
  };

  const [pec, chambres, factures, stock, mouvements, membres, grades] = await Promise.all([
    q("DispensairePriseEnCharge", "id,patient,patientNormalise,etat,factureId,admisAt,soinAt,finAt"),
    q("DispensaireChambre", "id,nom,etat,patient,patientNormalise"),
    q("DispensaireFacture", "id,montant,statut"),
    q("DispensaireStock", "id,nom,stock"),
    q("DispensaireStockMouvement", "stockId"),
    q("DispensaireMembre", "id,identifiant,nom,role,actif"),
    getGrades().catch(() => []),
  ]);

  const A: Anomalie[] = [];
  let controles = 0;
  const ctrl = () => { controles++; };

  const factureIds = new Set(factures.map((f) => String(f.id)));
  const stockIds = new Set(stock.map((s) => String(s.id)));
  const gradeKeys = new Set(grades.map((g) => g.key));
  const gradeAdmin = new Set(grades.filter((g) => g.perms?.admin).map((g) => g.key));

  // ── Intégrité (références) ──────────────────────────────────────────────
  ctrl();
  for (const p of pec) if (p.factureId && !factureIds.has(String(p.factureId)))
    A.push({ categorie: "Intégrité", gravite: "majeur", titre: "Prise en charge liée à une facture inexistante", detail: `${p.patient} → facture ${String(p.factureId).slice(0, 12)} introuvable`, suggestion: "Détacher la facture ou la recréer.", ref: String(p.id) });
  ctrl();
  for (const m of mouvements) if (m.stockId && !stockIds.has(String(m.stockId)))
    A.push({ categorie: "Intégrité", gravite: "mineur", titre: "Mouvement de stock orphelin", detail: `mouvement sur un article supprimé (${String(m.stockId).slice(0, 12)})`, suggestion: "Purge des mouvements orphelins.", ref: String(m.stockId) });
  ctrl();
  for (const m of membres) if (gradeKeys.size && !gradeKeys.has(String(m.role)))
    A.push({ categorie: "Intégrité", gravite: "majeur", titre: "Membre avec un grade inconnu", detail: `${m.nom} → grade « ${m.role} » absent des grades définis`, suggestion: "Réattribuer un grade valide dans l'Administration.", ref: String(m.id) });

  // ── Cohérence (logique métier) ──────────────────────────────────────────
  ctrl();
  for (const s of stock) if (Number(s.stock) < 0)
    A.push({ categorie: "Cohérence", gravite: "critique", titre: "Stock négatif", detail: `${s.nom} = ${s.stock}`, suggestion: "Corriger le stock / rejouer les mouvements.", ref: String(s.id) });
  const pecActifNorm = new Set(pec.filter((p) => p.etat === "admis" || p.etat === "en_soin").map((p) => norm(p.patientNormalise || p.patient)));
  ctrl();
  for (const c of chambres) {
    if (c.etat !== "occupee") continue;
    if (!String(c.patient ?? "").trim()) { A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Chambre occupée sans patient", detail: `${c.nom}`, suggestion: "Libérer la chambre ou renseigner le patient.", ref: String(c.id) }); continue; }
    if (!pecActifNorm.has(norm(c.patientNormalise || c.patient)))
      A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Lit occupé sans prise en charge active", detail: `${c.nom} — ${c.patient} n'a aucune PEC en cours`, suggestion: "Libérer le lit (PEC probablement clôturée).", ref: String(c.id) });
  }
  ctrl();
  for (const f of factures) {
    if (f.statut === "payee" && Number(f.montant) <= 0)
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Facture payée à 0 $", detail: `facture ${String(f.id).slice(0, 12)}`, suggestion: "Vérifier le montant encaissé.", ref: String(f.id) });
    if (Number(f.montant) < 0)
      A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Facture à montant négatif", detail: `facture ${String(f.id).slice(0, 12)} = ${f.montant}`, suggestion: "Corriger le montant.", ref: String(f.id) });
  }

  // ── Dates ───────────────────────────────────────────────────────────────
  ctrl();
  for (const p of pec) {
    const a = p.admisAt ? Date.parse(String(p.admisAt)) : NaN;
    const fin = p.finAt ? Date.parse(String(p.finAt)) : NaN;
    const soin = p.soinAt ? Date.parse(String(p.soinAt)) : NaN;
    if (Number.isFinite(a) && Number.isFinite(fin) && fin < a)
      A.push({ categorie: "Dates", gravite: "mineur", titre: "Clôture avant l'admission", detail: `${p.patient} : fin < admission`, suggestion: "Vérifier l'horodatage de la PEC.", ref: String(p.id) });
    if (Number.isFinite(a) && Number.isFinite(soin) && soin < a)
      A.push({ categorie: "Dates", gravite: "mineur", titre: "Soin daté avant l'admission", detail: `${p.patient} : soin < admission`, suggestion: "Vérifier l'horodatage de la PEC.", ref: String(p.id) });
  }

  // ── Unicité (doublons) ──────────────────────────────────────────────────
  ctrl();
  const parIdent = new Map<string, string[]>();
  for (const m of membres) { const k = norm(m.identifiant); if (!k) continue; parIdent.set(k, [...(parIdent.get(k) || []), String(m.nom)]); }
  for (const [k, noms] of parIdent) if (noms.length > 1)
    A.push({ categorie: "Unicité", gravite: "majeur", titre: "Même ID Discord sur plusieurs fiches", detail: `${noms.join(", ")} partagent l'ID ${k.slice(0, 12)}`, suggestion: "Supprimer les fiches en double.", ref: k });

  // ── Permissions ─────────────────────────────────────────────────────────
  ctrl();
  const admActifs = membres.filter((m) => (m.actif ?? true) && gradeAdmin.has(String(m.role))).length;
  if (membres.length > 0 && admActifs === 0)
    A.push({ categorie: "Permissions", gravite: "majeur", titre: "Aucun administrateur actif", detail: "des membres existent mais aucun n'a le droit admin", suggestion: "Attribuer un grade « admin » à au moins un membre.", ref: "perms" });

  const { categories, scoreGlobal } = scorer(CATEGORIES, A);
  return { genereLe: new Date().toISOString(), pret: true, canVoir: true, scoreGlobal, totalControles: controles, categories, anomalies: trierAnomalies(A), checklist: CHECKLIST };
}
