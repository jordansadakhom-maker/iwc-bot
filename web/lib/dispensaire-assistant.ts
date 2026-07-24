import "server-only";

import { getNotifications } from "@/lib/dispensaire-notifications";
import { getEtatsOverlay } from "@/lib/notif-etat";
import { type AssistantData, type Constat, type Priorite, trierConstats, compterGravite, graviteDe } from "@/lib/erp-assistant-const";

export * from "@/lib/erp-assistant-const";

export const TABLE_ETAT_DISPENSAIRE = "DispensaireNotifEtat";

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

  // Couche d'état persistée (Non lue / En cours / Résolue / Archivée).
  const etats = await getEtatsOverlay(TABLE_ETAT_DISPENSAIRE);
  for (const c of constats) c.etat = etats[c.id] || "nouveau";

  return { pret, constats: trierConstats(constats), parGravite: compterGravite(constats), genereLe };
}
