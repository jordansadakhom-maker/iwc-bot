"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getSessionProfile } from "@/lib/queries";
import { peutFacturer, estAutorise, peutSoigner } from "@/lib/dispensaire-roles";
import { emettreEvenementDispensaire, lireAvant } from "@/lib/dispensaire-evenements";
import { idAvecJeton, estDoublon } from "@/lib/dispensaire-idempotence";
import { lireDossierMedical, ecrireDossierMedical, type DossierMedical } from "@/lib/dispensaire-patients";
import { FACTURE_DELAI_H, statutsDe, serialiserStatuts, statutRepresentatif, estOuverte } from "@/lib/dispensaire-facturation-const";

// Factures — RÉSERVÉ aux chefs (habilités). Suivi des impayés.
export type FactureResult = { ok: boolean; error?: string; id?: string };

type Champ = "objet" | "destinataire" | "note";
const CHAMPS: Champ[] = ["objet", "destinataire", "note"];

const s = (v: unknown, max = 300) => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const n = (v: unknown) => Math.max(0, Math.round(Number(v) || 0));
function newId(p = "df") { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
// Date d'émission SAISIE (ISO ou « AAAA-MM-JJ ») → ISO. Repli si vide/invalide.
function emissionDe(v: unknown, fallback: string): string { const t = Date.parse(String(v ?? "").trim()); return Number.isFinite(t) ? new Date(t).toISOString() : fallback; }
// Échéance désormais MANUELLE : parse la date saisie → ISO, ou null si vide.
function echeanceManuelle(v: unknown): string | null { const raw = String(v ?? "").trim(); if (!raw) return null; const t = Date.parse(raw); return Number.isFinite(t) ? new Date(t).toISOString() : null; }
// Échéance par défaut à la création (suggestion, modifiable) = émission + délai indicatif.
function echeanceDefaut(emissionIso: string): string { return new Date(new Date(emissionIso).getTime() + FACTURE_DELAI_H * 3600000).toISOString(); }

// Écrit une ligne facture en tolérant l'absence de la colonne `statuts` (SQL non
// encore lancé) : on réessaie sans elle, la colonne `statut` restant synchronisée.
type Admin = NonNullable<ReturnType<typeof createAdminClient>>;
const COLS_OPTIONNELLES = ["statuts", "datePaiement", "payePar"];
async function ecrireFacture(admin: Admin, mode: "insert" | "update", row: Record<string, unknown>, id?: string) {
  const run = (r: Record<string, unknown>) => (mode === "insert" ? admin.from("DispensaireFacture").insert(r) : admin.from("DispensaireFacture").update(r).eq("id", id!));
  const cur: Record<string, unknown> = { ...row };
  let { error } = await run(cur);
  // Retire les colonnes optionnelles non encore migrées (mentionnées dans l'erreur) et réessaie.
  for (let i = 0; i < 3 && error; i++) {
    const m = error.message || "";
    const col = COLS_OPTIONNELLES.find((c) => c in cur && new RegExp(c, "i").test(m));
    if (!col) break;
    delete cur[col];
    ({ error } = await run(cur));
  }
  return error;
}
// Fail-closed : réservé aux grades porteurs du droit « factures » (ou admin).
async function autorise() { return peutFacturer(); }
async function qui() { try { return (await getSessionProfile())?.nom || "Équipe"; } catch { return "Équipe"; } }

// Journal des actions sur une facture (best-effort : n'échoue jamais l'action).
async function logFacture(admin: NonNullable<ReturnType<typeof createAdminClient>>, factureId: string, action: string, detail: string | null, par: string) {
  try { await admin.from("DispensaireFactureLog").insert({ id: newId("dfl"), factureId, action, detail, par, at: new Date().toISOString() }); } catch { /* table de log optionnelle */ }
}

function nettoyer(data: Record<string, unknown>) {
  const row: Record<string, unknown> = {};
  for (const c of CHAMPS) if (c in data) row[c] = s(data[c], c === "note" ? 1000 : 300);
  if ("montant" in data) row.montant = n(data.montant);
  // Statuts multiples (nouveau) ou statut unique (compat) → colonnes `statuts` + `statut`.
  if ("statuts" in data || "statut" in data) {
    const arr = statutsDe({ statuts: data.statuts, statut: data.statut });
    row.statuts = serialiserStatuts(arr);
    row.statut = statutRepresentatif(arr);
  }
  return row;
}

export async function creerFacture(data: Record<string, unknown>): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const row = nettoyer(data);
  if (!row.objet) return { ok: false, error: "Donne l'objet de la facture." };
  const id = idAvecJeton("df", data.cle, newId);
  const nowIso = new Date().toISOString();
  // Dates désormais MANUELLES : émission saisie (à défaut aujourd'hui), échéance
  // saisie (à défaut une suggestion +72 h, modifiable — plus rien d'imposé).
  const emission = emissionDe(data.dateEmission, nowIso);
  const echeance = "dateEcheance" in data ? echeanceManuelle(data.dateEcheance) : echeanceDefaut(emission);
  const par = await qui();
  const base: Record<string, unknown> = { id, statut: "non_payee", statuts: "non_payee", montant: 0, ...row, dateEmission: emission, dateEcheance: echeance, par, createdAt: nowIso, updatedAt: nowIso };
  const error = await ecrireFacture(admin, "insert", base);
  if (error) {
    if (estDoublon(error)) return { ok: true, id };
    return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  }
  await logFacture(admin, id, "Création", String(row.objet || ""), par);
  await emettreEvenementDispensaire({ aggregate: "facture", type: "facture.cree", cibleId: id, cibleLibelle: String(row.objet || ""), apres: { objet: row.objet, montant: base.montant, statut: base.statut } });
  return { ok: true, id };
}

export async function majFacture(id: string, patch: Record<string, unknown>): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  if (!id) return { ok: false, error: "Facture introuvable." };
  const row = nettoyer(patch);
  // Dates INDÉPENDANTES et MANUELLES : l'émission ne recalcule plus l'échéance.
  if ("dateEmission" in patch) { const t = Date.parse(String(patch.dateEmission ?? "").trim()); if (Number.isFinite(t)) row.dateEmission = new Date(t).toISOString(); }
  if ("dateEcheance" in patch) row.dateEcheance = echeanceManuelle(patch.dateEcheance);
  if ("objet" in row && !row.objet) return { ok: false, error: "L'objet ne peut pas être vide." };
  if (!Object.keys(row).length) return { ok: true };
  const par = await qui();
  const now = new Date().toISOString();
  // Paiement : dès que « Payé » figure dans les statuts, on horodate le règlement.
  const nouveauxStatuts = ("statuts" in patch || "statut" in patch) ? statutsDe({ statuts: patch.statuts, statut: patch.statut }) : [];
  const tracePaiement = nouveauxStatuts.includes("payee");
  if (tracePaiement) { row.datePaiement = now; row.payePar = par; }
  const avant = await lireAvant("DispensaireFacture", id);
  const error = await ecrireFacture(admin, "update", { ...row, updatedAt: now }, id);
  if (error) return { ok: false, error: "Enregistrement impossible." };
  if ("statuts" in row) { const libelle = nouveauxStatuts.join(", "); await logFacture(admin, id, tracePaiement ? "Paiement" : "Changement de statut", libelle, par); }
  await emettreEvenementDispensaire({ aggregate: "facture", type: tracePaiement ? "facture.paiement" : "facture.maj", cibleId: id, cibleLibelle: String((avant?.objet ?? row.objet) ?? ""), avant, apres: row });
  return { ok: true };
}

export async function supprimerFacture(id: string): Promise<FactureResult> {
  if (!(await autorise())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  const avant = await lireAvant("DispensaireFacture", id);
  const objet = avant ? String(avant.objet || "") : null;
  const { error } = await admin.from("DispensaireFacture").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await logFacture(admin, id, "Suppression", objet, await qui());
  await emettreEvenementDispensaire({ aggregate: "facture", type: "facture.supprime", cibleId: id, cibleLibelle: objet ?? "", avant });
  return { ok: true };
}

// Journalise une copie des informations (pour l'historique).
export async function logCopieFacture(id: string): Promise<{ ok: boolean }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false };
  await logFacture(admin, id, "Copie des informations", null, await qui());
  return { ok: true };
}

// ── CONSULTATION UNIFIÉE ─────────────────────────────────────────────────────
// Un seul geste : patient + soins/articles → facture générée + (option) stock
// décrémenté + historique alimenté. Remplace la triple saisie soin / facture /
// stock. Additif : les écrans Ventes & Factures restent inchangés.

// Références pour le formulaire (patients connus + articles en stock).
export async function getConsultationRefs(): Promise<{ patients: string[]; stock: { id: string; nom: string; stock: number }[] }> {
  const admin = createAdminClient();
  if (!admin) return { patients: [], stock: [] };
  const rows = async (p: PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await p).data as Record<string, unknown>[]) || []; } catch { return []; } };
  const [ventes, factures, certs, stock] = await Promise.all([
    rows(admin.from("DispensaireVente").select("patient").order("createdAt", { ascending: false }).limit(200)),
    rows(admin.from("DispensaireFacture").select("objet").order("createdAt", { ascending: false }).limit(200)),
    rows(admin.from("DispensaireCertificat").select("patient").order("createdAt", { ascending: false }).limit(200)),
    rows(admin.from("DispensaireStock").select("id,nom,stock").order("nom", { ascending: true }).limit(500)),
  ]);
  const set = new Set<string>();
  const add = (v: unknown) => { const t = String(v ?? "").trim(); if (t) set.add(t); };
  for (const r of ventes) add(r.patient);
  for (const r of factures) add(r.objet);
  for (const r of certs) add(r.patient);
  const patients = [...set].sort((a, b) => a.localeCompare(b)).slice(0, 400);
  const stockList = stock.map((r) => ({ id: String(r.id), nom: String(r.nom || "?"), stock: Number(r.stock) || 0 }));
  return { patients, stock: stockList };
}

export type ConsultationLigne = { desc: string; quantite: number; prixUnitaire: number; stockId?: string | null };
export type ConsultationResult = { ok: boolean; error?: string; id?: string; montant?: number; avertissements?: string[] };

export async function creerConsultation(input: { patient: string; lignes: ConsultationLigne[]; regle: boolean; dateEmission?: string; note?: string; cle?: string }): Promise<ConsultationResult> {
  if (!(await peutFacturer())) return { ok: false, error: "Réservé aux chefs." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  return creerFactureDeSoins(admin, input, await qui());
}

// Cœur PARTAGÉ : crée la facture d'une consultation + décrémente le stock lié.
// Réutilisé par la consultation manuelle (droit factures) ET par la clôture d'une
// prise en charge (droit soignant) — la garde est faite par l'appelant.
async function creerFactureDeSoins(admin: Admin, input: { patient: string; lignes: ConsultationLigne[]; regle: boolean; dateEmission?: string; note?: string; cle?: string }, par: string): Promise<ConsultationResult> {
  const patient = s(input.patient, 200);
  if (!patient) return { ok: false, error: "Indique le patient." };
  const lignes = (Array.isArray(input.lignes) ? input.lignes : [])
    .map((l) => ({ desc: s(l.desc, 200) || "", quantite: Math.max(1, Math.round(Number(l.quantite) || 1)), prixUnitaire: n(l.prixUnitaire), stockId: l.stockId ? String(l.stockId) : null }))
    .filter((l) => l.desc || l.prixUnitaire > 0 || l.stockId);
  if (!lignes.length) return { ok: false, error: "Ajoute au moins un soin ou un article." };

  const nowIso = new Date().toISOString();
  const emission = emissionDe(input.dateEmission, nowIso);
  const echeance = echeanceDefaut(emission);
  const montant = lignes.reduce((a, l) => a + l.prixUnitaire * l.quantite, 0);
  const resume = lignes.map((l) => `${l.quantite}× ${l.desc || "soin"}`).join(", ");
  const regle = !!input.regle;
  const statutUnique = regle ? "payee" : "non_payee";

  const id = idAvecJeton("df", input.cle, newId);
  const row: Record<string, unknown> = {
    id, objet: patient, destinataire: resume.slice(0, 300), montant, statut: statutUnique, statuts: statutUnique,
    dateEmission: emission, dateEcheance: echeance, note: s(input.note, 1000), par, createdAt: nowIso, updatedAt: nowIso,
  };
  if (regle) { row.datePaiement = nowIso; row.payePar = par; }
  const insErr = await ecrireFacture(admin, "insert", row);
  if (insErr) {
    // Doublon (double-clic / retry) : la consultation existe déjà → on renvoie
    // le succès SANS re-décrémenter le stock ni re-journaliser.
    if (estDoublon(insErr)) return { ok: true, id, montant };
    return { ok: false, error: "Création impossible (la table existe-t-elle ?)." };
  }
  await logFacture(admin, id, "Consultation", resume.slice(0, 200), par);
  await emettreEvenementDispensaire({ aggregate: "facture", type: "facture.consultation", cibleId: id, cibleLibelle: patient, apres: { patient, montant, resume: resume.slice(0, 300), regle } });

  // Décrément de stock optionnel & non bloquant : le soin reste facturé quoi qu'il arrive.
  const avert: string[] = [];
  for (const l of lignes) {
    if (!l.stockId) continue;
    try {
      const { data: ex } = await admin.from("DispensaireStock").select("id,nom,stock,coffre").eq("id", l.stockId).maybeSingle();
      if (!ex) continue;
      const r = ex as Record<string, unknown>;
      const avant = Number(r.stock) || 0;
      const apres = Math.max(0, avant - l.quantite);
      await admin.from("DispensaireStock").update({ stock: apres, updatedBy: par, updatedAt: nowIso }).eq("id", l.stockId);
      await admin.from("DispensaireStockMouvement").insert({ id: newId("dsm"), stockId: l.stockId, nomItem: String(r.nom || "?"), coffre: (r.coffre as string) ?? null, delta: -l.quantite, apres, motif: `Consultation — ${patient}`, par, createdAt: nowIso });
      if (avant < l.quantite) avert.push(`${String(r.nom || "?")} : stock insuffisant (${avant} en réserve, ${l.quantite} demandé)`);
    } catch { /* décrément best-effort */ }
  }
  return { ok: true, id, montant, avertissements: avert.length ? avert : undefined };
}

// ── DOSSIER PATIENT (dérivé à la lecture, sans nouvelle table) ────────────────
// Reconstruit tout l'historique d'un patient à partir des tables existantes,
// rapproché par nom normalisé. Donne une vue 360° : actes + total dû / réglé.
const _normNom = (v: unknown) => String(v ?? "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");
export type DossierActe = { id: string; type: "Facture" | "Vente" | "Certificat" | "Rapport"; libelle: string; montant: number | null; statut: string | null; date: string };
export type DossierPatient = { nom: string; totalDu: number; totalRegle: number; nbActes: number; actes: DossierActe[] };

export async function getDossierPatient(nom: string): Promise<DossierPatient> {
  const vide: DossierPatient = { nom: String(nom ?? "").trim(), totalDu: 0, totalRegle: 0, nbActes: 0, actes: [] };
  const admin = createAdminClient();
  const cible = _normNom(nom);
  if (!admin || !cible) return vide;
  const rows = async (p: PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await p).data as Record<string, unknown>[]) || []; } catch { return []; } };
  const [factures, ventes, certs, rapports] = await Promise.all([
    rows(admin.from("DispensaireFacture").select("id,objet,destinataire,montant,statut,statuts,dateEmission,createdAt").order("createdAt", { ascending: false }).limit(500)),
    rows(admin.from("DispensaireVente").select("id,patient,item,quantite,total,createdAt").order("createdAt", { ascending: false }).limit(500)),
    rows(admin.from("DispensaireCertificat").select("id,patient,type,dateActe,createdAt").order("createdAt", { ascending: false }).limit(500)),
    rows(admin.from("DispensaireRapport").select("id,patient,titre,createdAt").order("createdAt", { ascending: false }).limit(500)),
  ]);
  const actes: DossierActe[] = [];
  let du = 0, regle = 0;
  for (const f of factures) {
    if (_normNom(f.objet) !== cible) continue;
    const m = Number(f.montant) || 0; const arr = statutsDe(f); const st = statutRepresentatif(arr);
    if (estOuverte(arr)) du += m; else regle += m;
    actes.push({ id: "f" + f.id, type: "Facture", libelle: String(f.destinataire || f.objet || "Facture"), montant: m, statut: st, date: String(f.dateEmission || f.createdAt) });
  }
  for (const v of ventes) { if (_normNom(v.patient) !== cible) continue; actes.push({ id: "v" + v.id, type: "Vente", libelle: `${Number(v.quantite) || 0}× ${String(v.item || "article")}`, montant: Number(v.total) || 0, statut: null, date: String(v.createdAt) }); }
  for (const c of certs) { if (_normNom(c.patient) !== cible) continue; actes.push({ id: "c" + c.id, type: "Certificat", libelle: String(c.type || "Certificat"), montant: null, statut: null, date: String(c.dateActe || c.createdAt) }); }
  for (const r of rapports) { if (_normNom(r.patient) !== cible) continue; actes.push({ id: "r" + r.id, type: "Rapport", libelle: String(r.titre || "Rapport"), montant: null, statut: null, date: String(r.createdAt) }); }
  actes.sort((a, b) => String(b.date).localeCompare(String(a.date)));
  return { nom: String(nom).trim(), totalDu: du, totalRegle: regle, nbActes: actes.length, actes };
}

// ── DOSSIER MÉDICAL (Lot 2) ──────────────────────────────────────────────────
// Fiche patient structurée (groupe sanguin, allergies, antécédents…). Lecture
// ouverte à tout le personnel autorisé ; édition réservée aux soignants.
export type DossierMedicalResult = { pret: boolean; existe: boolean; dossier: DossierMedical | null; canEdit: boolean };

export async function getDossierMedical(nom: string): Promise<DossierMedicalResult> {
  if (!(await estAutorise())) return { pret: false, existe: false, dossier: null, canEdit: false };
  const [{ pret, existe, dossier }, canEdit] = await Promise.all([lireDossierMedical(nom), peutSoigner()]);
  return { pret, existe, dossier, canEdit };
}

export async function majDossierMedical(nom: string, patch: Record<string, unknown>): Promise<{ ok: boolean; error?: string; id?: string }> {
  if (!(await peutSoigner())) return { ok: false, error: "Édition réservée au personnel soignant." };
  const par = await qui();
  const avant = (await lireDossierMedical(nom)).dossier;
  const res = await ecrireDossierMedical(nom, patch, par);
  if (!res.ok) return res;
  await emettreEvenementDispensaire({ aggregate: "patient", type: "patient.dossier_maj", cibleId: res.id, cibleLibelle: String(nom).trim(), avant, apres: { nom: String(nom).trim(), ...patch } });
  return res;
}

