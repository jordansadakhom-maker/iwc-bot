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

  const [chambres, factures, stock, mouvements, membres, grades, rdv, pointages, matieres, ambulances, frais, interventions] = await Promise.all([
    q("DispensaireChambre", "id,nom,etat,patient,patientNormalise"),
    q("DispensaireFacture", "id,montant,statut"),
    q("DispensaireStock", "id,nom,stock,seuil,stockFixe"),
    q("DispensaireStockMouvement", "stockId"),
    q("DispensaireMembre", "id,identifiant,nom,role,actif"),
    getGrades().catch(() => []),
    q("DispensaireRendezVous", "id,patient,etat,debut"),
    q("DispensairePointage", "id,nom,debut,fin"),
    q("DispensaireMatiere", "id,nom,quantite"),
    q("DispensaireAmbulance", "id,nom,etat,essence"),
    q("DispensaireFrais", "id,objet,montant,statut"),
    q("DispensaireIntervention", "id,patient,statut"),
  ]);

  const A: Anomalie[] = [];
  let controles = 0;
  const ctrl = () => { controles++; };

  const stockIds = new Set(stock.map((s) => String(s.id)));
  const gradeKeys = new Set(grades.map((g) => g.key));
  const gradeAdmin = new Set(grades.filter((g) => g.perms?.admin).map((g) => g.key));

  // ── Intégrité (références) ──────────────────────────────────────────────
  ctrl();
  for (const m of mouvements) if (m.stockId && !stockIds.has(String(m.stockId)))
    A.push({ categorie: "Intégrité", gravite: "mineur", titre: "Mouvement de stock orphelin", detail: `mouvement sur un article supprimé (${String(m.stockId).slice(0, 12)})`, suggestion: "Purge des mouvements orphelins.", ref: String(m.stockId) });
  ctrl();
  for (const m of membres) if (gradeKeys.size && !gradeKeys.has(String(m.role)))
    A.push({ categorie: "Intégrité", gravite: "majeur", titre: "Membre avec un grade inconnu", detail: `${m.nom} → grade « ${m.role} » absent des grades définis`, suggestion: "Réattribuer un grade valide dans l'Administration.", ref: String(m.id) });

  // ── Cohérence (logique métier) ──────────────────────────────────────────
  ctrl();
  for (const s of stock) {
    if (Number(s.stock) < 0) A.push({ categorie: "Cohérence", gravite: "critique", titre: "Stock négatif", detail: `${s.nom} = ${s.stock}`, suggestion: "Corriger le stock / rejouer les mouvements.", ref: String(s.id) });
    if (Number(s.seuil) < 0) A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Seuil d'alerte négatif", detail: `${s.nom} : seuil ${s.seuil}`, suggestion: "Le seuil doit être ≥ 0.", ref: String(s.id) });
    if (Number(s.stockFixe) < 0) A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Stock de référence négatif", detail: `${s.nom} : ${s.stockFixe}`, suggestion: "Corriger le stock fixe.", ref: String(s.id) });
  }
  ctrl();
  for (const c of chambres) {
    if (c.etat !== "occupee") continue;
    if (!String(c.patient ?? "").trim()) A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Chambre occupée sans patient", detail: `${c.nom}`, suggestion: "Libérer la chambre ou renseigner le patient.", ref: String(c.id) });
  }
  ctrl();
  for (const f of factures) {
    if (f.statut === "payee" && Number(f.montant) <= 0)
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Facture payée à 0 $", detail: `facture ${String(f.id).slice(0, 12)}`, suggestion: "Vérifier le montant encaissé.", ref: String(f.id) });
    if (Number(f.montant) < 0)
      A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Facture à montant négatif", detail: `facture ${String(f.id).slice(0, 12)} = ${f.montant}`, suggestion: "Corriger le montant.", ref: String(f.id) });
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

  // ── Élargissement : matières, rendez-vous, pointage, ambulances ───────────
  const now = Date.now();
  ctrl();
  for (const m of matieres) if (Number(m.quantite) < 0)
    A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Matière première négative", detail: `${m.nom} = ${m.quantite}`, suggestion: "Corriger le stock de matière.", ref: String(m.id) });
  ctrl();
  for (const r of rdv) if (r.etat === "prevu") {
    const d = r.debut ? Date.parse(String(r.debut)) : NaN;
    if (Number.isFinite(d) && d < now - 3600000)
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Rendez-vous passé non traité", detail: `${r.patient} — prévu mais dépassé`, suggestion: "Marquer honoré / absent / annulé.", ref: String(r.id) });
  }
  ctrl();
  for (const p of pointages) {
    const deb = p.debut ? Date.parse(String(p.debut)) : NaN;
    const fin = p.fin ? Date.parse(String(p.fin)) : NaN;
    if (!p.fin && Number.isFinite(deb) && now - deb > 86400000)
      A.push({ categorie: "Cohérence", gravite: "info", titre: "Service non clôturé depuis plus de 24 h", detail: `${p.nom} — pointage resté ouvert`, suggestion: "Clôturer le pointage oublié.", ref: String(p.id) });
    if (Number.isFinite(deb) && Number.isFinite(fin) && fin < deb)
      A.push({ categorie: "Dates", gravite: "mineur", titre: "Fin de service avant le début", detail: `${p.nom}`, suggestion: "Corriger l'horodatage du pointage.", ref: String(p.id) });
  }
  ctrl();
  const etatsAmb = new Set(["disponible", "en_intervention", "entretien", "hs"]);
  for (const amb of ambulances) {
    if (amb.etat && !etatsAmb.has(String(amb.etat)))
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "État d'ambulance inconnu", detail: `${amb.nom} → « ${amb.etat} »`, suggestion: "Ramener à disponible/en_intervention/entretien/hs.", ref: String(amb.id) });
    const e = Number(amb.essence);
    if (amb.essence != null && (e < 0 || e > 100))
      A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Niveau d'essence hors bornes", detail: `${amb.nom} = ${amb.essence} %`, suggestion: "L'essence doit être entre 0 et 100 %.", ref: String(amb.id) });
  }

  // ── Notes de frais & interventions ───────────────────────────────────────
  ctrl();
  const statutsFrais = new Set(["en_attente", "valide", "refuse", "vire"]);
  for (const f of frais) {
    if (Number(f.montant) < 0) A.push({ categorie: "Cohérence", gravite: "majeur", titre: "Note de frais à montant négatif", detail: `${f.objet} = ${f.montant} $`, suggestion: "Corriger le montant.", ref: String(f.id) });
    if (f.statut && !statutsFrais.has(String(f.statut))) A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Statut de note de frais inconnu", detail: `${f.objet} → « ${f.statut} »`, suggestion: "Ramener à en_attente/valide/refuse/vire.", ref: String(f.id) });
  }
  ctrl();
  const statutsInterv = new Set(["planifiee", "en_cours", "terminee", "annulee"]);
  for (const it of interventions) if (it.statut && !statutsInterv.has(String(it.statut)))
    A.push({ categorie: "Cohérence", gravite: "mineur", titre: "Statut d'intervention inconnu", detail: `${it.patient} → « ${it.statut} »`, suggestion: "Ramener à planifiée/en cours/terminée/annulée.", ref: String(it.id) });

  const { categories, scoreGlobal } = scorer(CATEGORIES, A);
  return { genereLe: new Date().toISOString(), pret: true, canVoir: true, scoreGlobal, totalControles: controles, categories, anomalies: trierAnomalies(A), checklist: CHECKLIST };
}
