import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getNotifications } from "@/lib/dispensaire-notifications";
import { getEtatsOverlay } from "@/lib/notif-etat";
import { calculerReappro, detecterDoublons, detecterNegatifs, apercuReappro } from "@/lib/erp-coherence";
import { type AssistantData, type Constat, type Priorite, trierConstats, compterGravite, graviteDe } from "@/lib/erp-assistant-const";

export * from "@/lib/erp-assistant-const";

export const TABLE_ETAT_DISPENSAIRE = "DispensaireNotifEtat";
const mk = (o: Omit<Constat, "gravite">): Constat => ({ ...o, gravite: graviteDe(o.priorite) });
const rows = async (fn: () => PromiseLike<{ data: unknown }>): Promise<Record<string, unknown>[]> => { try { return ((await fn()).data as Record<string, unknown>[]) || []; } catch { return []; } };

// ── Assistant de veille — DISPENSAIRE DE SAINT-DENIS ────────────────────────
// S'appuie sur les alertes déjà calculées (stock, matières, factures, ventes,
// frais, RH) et les transforme en constats + action suggérée. Séparé de l'IWC :
// aucune donnée ne circule d'un système à l'autre.

const fmtParis = (d: Date) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(d); } catch { return ""; } };
const SEVERITE_PRIORITE: Record<string, Priorite> = { alerte: "urgente", attention: "importante", info: "information" };

// Action suggérée selon le type de notification (repli générique sinon).
function suggestionPour(type: string): string {
  const t = type.toLowerCase();
  if (t.includes("stock")) return "Réapprovisionne avant la rupture.";
  if (t.includes("matière")) return "Commande la matière première manquante.";
  if (t.includes("facture")) return "Relance le client / encaisse la facture.";
  if (t.includes("vente") || t.includes("limite")) return "Vérifie le patient : plafond hebdomadaire dépassé.";
  if (t.includes("frais")) return "Valide ou refuse les notes de frais en attente.";
  if (t.includes("rh")) return "Convoque un entretien : absences au-delà du seuil.";
  return "À traiter.";
}

export async function getAssistantDispensaire(): Promise<AssistantData> {
  const genereLe = fmtParis(new Date());
  const constats: Constat[] = [];
  let pret = true;
  try {
    const { items } = await getNotifications();
    for (const n of items) {
      const priorite = SEVERITE_PRIORITE[n.severite] || "information";
      constats.push({ id: "no-" + n.id, gravite: graviteDe(priorite), priorite, categorie: n.type, titre: n.texte, detail: null, suggestion: suggestionPour(n.type), href: n.href });
    }
  } catch { pret = false; }

  // Contrôle de cohérence & réappro sur le stock et les matières.
  const admin = createAdminClient();
  if (admin) {
    const [stock, matieres] = await Promise.all([
      rows(() => admin.from("DispensaireStock").select("nom,stock,seuil,stockFixe")),
      rows(() => admin.from("DispensaireMatiere").select("nom,quantite,seuil,cible")),
    ]);
    const reappro = [
      ...calculerReappro(stock, { qtyKey: "stock", seuilKey: "seuil", cibleKey: "stockFixe" }),
      ...calculerReappro(matieres, { qtyKey: "quantite", seuilKey: "seuil", cibleKey: "cible" }),
    ].sort((a, b) => b.manque - a.manque);
    if (reappro.length) constats.push(mk({ id: "reappro", priorite: "importante", categorie: "Réappro", titre: `${reappro.length} article(s) à réapprovisionner`, detail: apercuReappro(reappro), suggestion: "Prépare la commande pour revenir aux quantités cibles.", href: "/dispensaire/coffres" }));

    const doublons = detecterDoublons(stock);
    if (doublons.length) constats.push(mk({ id: "doublons-stock", priorite: "normale", categorie: "Cohérence", titre: `${doublons.length} doublon(s) dans le stock`, detail: doublons.slice(0, 3).map((d) => `${d.nom} ×${d.n}`).join(" · "), suggestion: "Fusionne les fiches en double pour fiabiliser les quantités.", href: "/dispensaire/stockage" }));

    const negatifs = detecterNegatifs(stock, "stock");
    if (negatifs.length) constats.push(mk({ id: "negatif-stock", priorite: "critique", categorie: "Cohérence", titre: `${negatifs.length} stock(s) négatif(s)`, detail: negatifs.slice(0, 3).map((n) => `${n.nom} (${n.q})`).join(" · "), suggestion: "Corrige : un stock négatif signale une perte ou une erreur de saisie.", href: "/dispensaire/stockage" }));
  }

  // Couche d'état persistée (Non lue / En cours / Résolue / Archivée).
  const etats = await getEtatsOverlay(TABLE_ETAT_DISPENSAIRE);
  for (const c of constats) c.etat = etats[c.id] || "nouveau";

  return { pret, constats: trierConstats(constats), parGravite: compterGravite(constats), genereLe };
}
