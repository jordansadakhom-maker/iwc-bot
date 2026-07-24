import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getAlertes } from "@/lib/queries";
import { getEtatsOverlay } from "@/lib/notif-etat";
import { detecterDoublons, detecterNegatifs, apercuReappro, type ReapproItem } from "@/lib/erp-coherence";
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

  if (pointage) constats.push(mk({ id: "pointage-ouvert", priorite: "importante", categorie: "Pointage", titre: `${pointage} pointage(s) armurerie non clôturé(s)`, detail: "Service ouvert depuis plus de 12 h.", suggestion: "Clôture les pointages restés ouverts pour fiabiliser la paie.", href: "/armurerie?tab=pointage" }));

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

  // Couche d'état persistée (Non lue / En cours / Résolue / Archivée).
  const etats = await getEtatsOverlay(TABLE_ETAT_IWC);
  for (const c of constats) c.etat = etats[c.id] || "nouveau";

  return { pret, constats: trierConstats(constats), parGravite: compterGravite(constats), genereLe };
}
