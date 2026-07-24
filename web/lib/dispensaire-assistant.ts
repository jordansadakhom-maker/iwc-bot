import "server-only";

import { getNotifications } from "@/lib/dispensaire-notifications";
import { type AssistantData, type Constat, type Gravite, trierConstats, compterGravite } from "@/lib/erp-assistant-const";

export * from "@/lib/erp-assistant-const";

// ── Assistant de veille — DISPENSAIRE DE SAINT-DENIS ────────────────────────
// S'appuie sur les alertes déjà calculées (stock, matières, factures, ventes,
// frais, RH) et les transforme en constats + action suggérée. Séparé de l'IWC :
// aucune donnée ne circule d'un système à l'autre.

const fmtParis = (d: Date) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", dateStyle: "medium", timeStyle: "short" }).format(d); } catch { return ""; } };
const SEVERITE_GRAVITE: Record<string, Gravite> = { alerte: "critique", attention: "important", info: "info" };

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
    for (const n of items) constats.push({
      id: "no-" + n.id, gravite: SEVERITE_GRAVITE[n.severite] || "info", categorie: n.type,
      titre: n.texte, detail: null, suggestion: suggestionPour(n.type), href: n.href,
    });
  } catch { pret = false; }

  return { pret, constats: trierConstats(constats), parGravite: compterGravite(constats), genereLe };
}
