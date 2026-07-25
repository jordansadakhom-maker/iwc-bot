import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAlertes, getAbsences } from "@/lib/queries";
import { getEtatsOverlay } from "@/lib/notif-etat";
import { detecterDoublons, detecterNegatifs, apercuReappro, type ReapproItem } from "@/lib/erp-coherence";
import { snapshotCycle, euros, pourcent } from "@/lib/armurerie-fiscal";
import { type AssistantData, type Constat, type Priorite, trierConstats, compterGravite, graviteDe } from "@/lib/erp-assistant-const";

export * from "@/lib/erp-assistant-const";

export const TABLE_ETAT_IWC = "NotifEtatIWC";

// ── Assistant de veille — IRON WOLF COMPANY ─────────────────────────────────
// Déterministe : lit les vraies données et en tire des constats + une action
// suggérée. S'appuie sur les alertes déjà agrégées (cloche) et y ajoute
// quelques règles propres (pointage ouvert, seuils inventaire/chasse, contrats).

const num = (v: unknown) => Number(v) || 0;
const fmtParis = (d: Date) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(d); } catch { return ""; } };
const safeCount = async (fn: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => { try { const { count, error } = await fn(); return error ? 0 : (count ?? 0); } catch { return 0; } };
const safeRows = async (fn: () => PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await fn()).data as Record<string, unknown>[]) || []; } catch { return []; } };

const PRIO_ALERTE: Record<string, Priorite> = { rdvArm: "importante", rdvs: "importante", contrats: "importante", impots: "critique", paies: "importante", ruptures: "critique", candids: "information", telegrammes: "normale" };
const CAT_ALERTE: Record<string, string> = { rdvArm: "Rendez-vous", rdvs: "Rendez-vous", contrats: "Contrats", impots: "Impôts", paies: "Paie", ruptures: "Stock", candids: "Recrutement", telegrammes: "Communication" };
// Fabrique un constat en dérivant la gravité de la priorité.
const mk = (o: Omit<Constat, "gravite">): Constat => ({ ...o, gravite: graviteDe(o.priorite) });
const SUGG_ALERTE: Record<string, string> = {
  rdvArm: "Prépare les rendez-vous armurerie du jour.",
  rdvs: "Traite les demandes de rendez-vous en attente.",
  contrats: "Relance le client pour la signature du contrat.",
  impots: "Règle les impôts dus avant l'échéance.",
  paies: "Verse les paies en attente aux employés.",
  ruptures: "Réassortis les produits en rupture.",
  candids: "Étudie les candidatures récentes.",
  telegrammes: "Réponds aux télégrammes récents.",
};

export async function getAssistantIWC(): Promise<AssistantData> {
  const genereLe = fmtParis(new Date());
  const admin = createAdminClient();
  if (!admin) return { pret: false, constats: [], parGravite: { critique: 0, important: 0, info: 0 }, genereLe };

  const constats: Constat[] = [];

  // 1) Réutilise les alertes actionnables déjà agrégées.
  let pret = true;
  try {
    const { items } = await getAlertes();
    for (const a of items) constats.push(mk({
      id: "al-" + a.key, priorite: PRIO_ALERTE[a.key] || "normale", categorie: CAT_ALERTE[a.key] || "Alerte",
      titre: a.label, detail: null, suggestion: SUGG_ALERTE[a.key] || "À traiter.", href: a.href,
    }));
  } catch { pret = false; }

  // 2) Règles propres à l'assistant (points d'insertion repérés).
  const iso12 = new Date(Date.now() - 12 * 3600000).toISOString();
  const [pointage, invRows, chasseRows, contratsAValider] = await Promise.all([
    safeCount(() => admin.from("ArmureriePointage").select("*", { count: "exact", head: true }).is("fin", null).lt("debut", iso12)),
    safeRows(() => admin.from("InventaireItem").select("nom,quantite,seuil")),
    safeRows(() => admin.from("ChasseStock").select("nom,quantite,seuil")),
    safeCount(() => admin.from("Contrat").select("*", { count: "exact", head: true }).eq("statut", "en_attente")),
  ]);

  if (pointage) constats.push(mk({ id: "pointage-ouvert", priorite: "importante", categorie: "Pointage", titre: `${pointage} pointage(s) armurerie non clôturé(s)`, detail: "Service ouvert depuis plus de 12 h.", suggestion: "Clôture les pointages restés ouverts pour fiabiliser la paie.", href: "/armurerie?tab=pointage", action: { kind: "clore-pointages", label: "Clôturer maintenant" } }));

  const invBas = invRows.filter((r) => num(r.seuil) > 0 && num(r.quantite) <= num(r.seuil));
  if (invBas.length) constats.push(mk({ id: "inv-bas", priorite: "normale", categorie: "Inventaire", titre: `${invBas.length} article(s) d'inventaire sous le seuil`, detail: invBas.slice(0, 3).map((r) => `${r.nom} (${num(r.quantite)})`).join(" · "), suggestion: "Réapprovisionne les articles sous leur seuil d'alerte.", href: "/inventaire" }));

  const chBas = chasseRows.filter((r) => num(r.seuil) > 0 && num(r.quantite) <= num(r.seuil));
  if (chBas.length) constats.push(mk({ id: "chasse-bas", priorite: "faible", categorie: "Chasse", titre: `${chBas.length} ressource(s) de chasse basse(s)`, detail: chBas.slice(0, 3).map((r) => `${r.nom} (${num(r.quantite)})`).join(" · "), suggestion: "Planifie une sortie de chasse pour recompléter les zones.", href: "/chasse" }));

  if (contratsAValider) constats.push(mk({ id: "contrats-valider", priorite: "importante", categorie: "Contrats", titre: `${contratsAValider} contrat(s) à valider`, detail: null, suggestion: "Valide ou refuse les contrats en attente.", href: "/operations" }));

  // Contrôle de cohérence & réappro sur les produits de l'armurerie.
  // Seuils armurerie : bas ≤ 3, cible 5 (mêmes valeurs que le comptoir).
  const SEUIL_BAS = 3, CIBLE = 5;
  const produits = await safeRows(() => admin.from("ArmurerieProduit").select("nom,stock,aLaDemande"));
  const enStock = produits.filter((p) => !p.aLaDemande); // « à la demande » = pas de stock à tenir
  const reappro: ReapproItem[] = enStock
    .filter((p) => num(p.stock) > 0 && num(p.stock) <= SEUIL_BAS)
    .map((p) => ({ nom: String(p.nom ?? "?"), q: num(p.stock), manque: Math.max(0, CIBLE - num(p.stock)) }))
    .sort((a, b) => b.manque - a.manque);
  if (reappro.length) constats.push(mk({ id: "reappro-produits", priorite: "importante", categorie: "Réappro", titre: `${reappro.length} produit(s) à réassortir`, detail: apercuReappro(reappro), suggestion: `Lance la fabrication pour revenir au stock cible (${CIBLE}).`, href: "/armurerie?tab=produits" }));

  const doublons = detecterDoublons(produits);
  if (doublons.length) constats.push(mk({ id: "doublons-produits", priorite: "normale", categorie: "Cohérence", titre: `${doublons.length} produit(s) en double`, detail: doublons.slice(0, 3).map((d) => `${d.nom} ×${d.n}`).join(" · "), suggestion: "Fusionne les fiches produit en double.", href: "/armurerie?tab=produits" }));

  const negatifs = detecterNegatifs(produits, "stock");
  if (negatifs.length) constats.push(mk({ id: "negatif-produits", priorite: "critique", categorie: "Cohérence", titre: `${negatifs.length} produit(s) à stock négatif`, detail: negatifs.slice(0, 3).map((n) => `${n.nom} (${n.q})`).join(" · "), suggestion: "Corrige : un stock négatif signale une perte ou un écart de caisse.", href: "/armurerie?tab=produits" }));

  // RH & contrats proactifs.
  const CLOS = new Set(["termine", "terminee", "terminée", "annule", "annulee", "annulée", "refuse", "refusé", "clos", "cloture", "clôturé", "signe", "signé"]);
  const nowIso = new Date().toISOString(), nowY = nowIso.slice(0, 10);
  const [absencesData, contratsRows] = await Promise.all([
    getAbsences().catch(() => null),
    safeRows(() => admin.from("Contrat").select("cible,statut,echeance,suivi")),
  ]);
  const termine = absencesData ? absencesData.absents.filter((m) => m.absence?.jusqu && String(m.absence.jusqu).slice(0, 10) < nowY) : [];
  if (termine.length) constats.push(mk({ id: "abs-terminees", priorite: "normale", categorie: "RH", titre: `${termine.length} absence(s) arrivée(s) à terme`, detail: termine.slice(0, 3).map((m) => m.nom).join(" · "), suggestion: "Réactive les membres dont l'absence est finie.", href: "/absences" }));
  const relance = contratsRows.filter((c) => c.echeance && String(c.echeance) < nowIso && !CLOS.has(String(c.statut ?? "").toLowerCase()));
  if (relance.length) constats.push(mk({ id: "contrats-relance", priorite: "importante", categorie: "Contrats", titre: `${relance.length} contrat(s) à échéance dépassée`, detail: relance.slice(0, 3).map((c) => String(c.cible ?? "?")).join(" · "), suggestion: "Relance ou clôture les contrats dont l'échéance est passée.", href: "/operations" }));

  // Conflits de rendez-vous (carnet armurerie) : deux RDV « à venir » trop
  // rapprochés = risque de double-réservation. On cible ArmurerieRdv, seule table
  // portant une date/heure structurée (dateRdv ISO) ; le créneau des Rdv généraux
  // est en texte libre, non exploitable pour un chevauchement fiable.
  const FENETRE_MIN = 20;
  const rdvArm = (await safeRows(() => admin.from("ArmurerieRdv").select("clientPrenom,clientNom,dateRdv,statut")))
    .filter((r) => String(r.statut ?? "a_venir") === "a_venir" && r.dateRdv)
    .map((r) => ({ qui: `${String(r.clientPrenom ?? "")} ${String(r.clientNom ?? "")}`.trim() || "Client", t: Date.parse(String(r.dateRdv)) }))
    .filter((r) => Number.isFinite(r.t) && r.t >= Date.now() - 3600000)
    .sort((a, b) => a.t - b.t);
  const conflits: string[] = [];
  for (let i = 1; i < rdvArm.length; i++) {
    if (rdvArm[i].t - rdvArm[i - 1].t <= FENETRE_MIN * 60000) conflits.push(`${rdvArm[i - 1].qui} ↔ ${rdvArm[i].qui}`);
  }
  if (conflits.length) constats.push(mk({ id: "rdv-conflit", priorite: "importante", categorie: "Rendez-vous", titre: `${conflits.length} chevauchement(s) de rendez-vous`, detail: conflits.slice(0, 3).join(" · "), suggestion: `Deux rendez-vous sont à moins de ${FENETRE_MIN} min l'un de l'autre : décale un créneau.`, href: "/armurerie?tab=rdv" }));

  // Fiscalité armurerie : impôt à provisionner, approche d'une tranche (avant de
  // la franchir), et détection d'incohérence entre la déclaration en base et le
  // calcul sur le bénéfice réel (grille officielle — lib/armurerie-fiscal).
  const [mvtCoffre, impotsRows] = await Promise.all([
    safeRows(() => admin.from("ArmurerieMouvementCoffre").select("sens,montant,createdAt,motif")),
    safeRows(() => admin.from("ArmurerieImpot").select("statut,montant,payeAt,fin")),
  ]);
  if (mvtCoffre.length) {
    const payes = impotsRows.filter((i) => String(i.statut) === "paye").map((i) => ({ payeAt: (i.payeAt as string) ?? null, fin: (i.fin as string) ?? null }));
    const cycle = snapshotCycle(mvtCoffre.map((m) => ({ sens: String(m.sens), montant: num(m.montant), createdAt: (m.createdAt as string) ?? null, motif: (m.motif as string) ?? null })), payes);
    if (cycle.impot > 0) constats.push(mk({ id: "fisc-impot", priorite: cycle.impot >= 1000 ? "importante" : "normale", categorie: "Impôts", titre: `Impôt à provisionner : ${euros(cycle.impot)}`, detail: `Bénéfice ${euros(cycle.benefice)} · tranche ${pourcent(cycle.taux)} · net ${euros(cycle.net)}`, suggestion: "Provisionne l'impôt du cycle ; règle la déclaration pour clôturer.", href: "/armurerie?tab=impots" }));
    if (cycle.prochainSeuil != null && cycle.resteAvantProchain != null && cycle.resteAvantProchain <= 200) constats.push(mk({ id: "fisc-proche-tranche", priorite: "information", categorie: "Impôts", titre: `À ${euros(cycle.resteAvantProchain)} de la tranche ${pourcent(cycle.tauxProchain || 0)}`, detail: `Bénéfice ${euros(cycle.benefice)} → prochain palier ${euros(cycle.prochainSeuil)}.`, suggestion: "Une prochaine vente peut faire monter le taux d'imposition.", href: "/armurerie?tab=impots" }));
    const du = impotsRows.find((i) => String(i.statut) === "du");
    if (du && Math.abs(num(du.montant) - cycle.impot) > 1) constats.push(mk({ id: "fisc-anomalie", priorite: "critique", categorie: "Cohérence", titre: "Incohérence fiscale détectée", detail: `Déclaration en base ${euros(num(du.montant))} ≠ calcul sur le bénéfice réel ${euros(cycle.impot)}.`, suggestion: "Une vente recalcule et corrige automatiquement ; vérifie la déclaration en cours.", href: "/armurerie?tab=impots" }));
  }

  // Couche d'état persistée (Non lue / En cours / Résolue / Archivée).
  const etats = await getEtatsOverlay(TABLE_ETAT_IWC);
  for (const c of constats) c.etat = etats[c.id] || "nouveau";

  return { pret, constats: trierConstats(constats), parGravite: compterGravite(constats), genereLe };
}
