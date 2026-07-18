/**
 * Lecture des VRAIES données depuis Supabase (alimentées par le bot Discord via
 * supabase-sync.js). Aucune donnée inventée : on reflète exactement les lignes
 * de la base. Si la base est vide ou injoignable, on renvoie des états vides
 * honnêtes (le dashboard affiche « en attente » plutôt que des chiffres fictifs).
 *
 * Exécuté côté serveur (Server Components) — lit via l'API REST PostgREST avec
 * la clé publiable (anon). Rafraîchi à chaque requête (cache: no-store).
 */
import "server-only";

const URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/+$/, "");
const KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
  "";

export type OpCard = { titre: string; type: string; etape: string; membres: string[] };
export type AttentionItem = { titre: string; detail: string; tag: string; sev: "crit" | "warn" | "info" };

export type DashData = {
  connecte: boolean;
  coffres: { commun: number | null; legal: number | null; illegal: number | null };
  contratsEnCours: number;
  opsActives: number;
  membresCount: number;
  operations: { preparation: OpCard[]; encours: OpCard[]; terminees: OpCard[] };
  attention: AttentionItem[];
};

const EMPTY: DashData = {
  connecte: false,
  coffres: { commun: null, legal: null, illegal: null },
  contratsEnCours: 0,
  opsActives: 0,
  membresCount: 0,
  operations: { preparation: [], encours: [], terminees: [] },
  attention: [],
};

async function rest<T = unknown>(pathAndQuery: string): Promise<T[] | null> {
  if (!URL || !KEY) return null;
  try {
    const res = await fetch(`${URL}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    return (await res.json()) as T[];
  } catch {
    return null;
  }
}

// Statuts de contrat considérés comme « clos » (donc plus « en cours »).
const CONTRAT_CLOS = new Set(["termine", "terminee", "terminée", "annule", "annulee", "annulée", "refuse", "refuse", "refusé", "clos", "cloture", "clôturé"]);

function phaseLabel(phase: string): { col: "preparation" | "encours" | "terminees"; etape: string } {
  switch (phase) {
    case "en_cours": return { col: "encours", etape: "En cours" };
    case "terminee": return { col: "terminees", etape: "Terminée" };
    case "annulee": return { col: "terminees", etape: "Annulée" };
    default: return { col: "preparation", etape: "Préparation" };
  }
}

// Vérif légère : la base Supabase est-elle joignable ? (sert au footer de la coquille)
export async function isBaseConnected(): Promise<boolean> {
  const rows = await rest("Coffre?select=id&limit=1");
  return rows !== null;
}

export async function getDashboard(): Promise<DashData> {
  const [coffres, contrats, operations, membres] = await Promise.all([
    rest<{ id: string; pole: string; solde: number }>("Coffre?select=id,pole,solde"),
    rest<{ id: string; cible: string; statut: string; pole: string; commanditaire: string | null }>(
      "Contrat?select=id,cible,statut,pole,commanditaire"
    ),
    rest<{ id: string; categorie: string; cible: string; phase: string; agentsAssignes: string[] }>(
      "Operation?select=id,categorie,cible,phase,agentsAssignes"
    ),
    rest<{ id: string }>("Membre?select=id"),
  ]);

  // Base injoignable / non configurée → état vide honnête.
  if (coffres === null && contrats === null && operations === null && membres === null) {
    return EMPTY;
  }

  const findSolde = (id: string) => coffres?.find((c) => c.id === id)?.solde ?? null;

  const board: DashData["operations"] = { preparation: [], encours: [], terminees: [] };
  for (const o of operations || []) {
    const { col, etape } = phaseLabel(o.phase);
    board[col].push({
      titre: o.cible || "Opération",
      type: o.categorie || "Opération",
      etape,
      membres: Array.isArray(o.agentsAssignes) ? o.agentsAssignes : [],
    });
  }

  const contratsEnCours = (contrats || []).filter(
    (c) => !CONTRAT_CLOS.has(String(c.statut || "").toLowerCase())
  ).length;

  const opsActives = board.preparation.length + board.encours.length;

  // « Ce qui demande ton attention » — uniquement des éléments RÉELS de la base :
  // contrats en attente de validation + opérations encore en préparation.
  const attention: AttentionItem[] = [];
  for (const c of contrats || []) {
    if (String(c.statut || "").toLowerCase() === "en_attente") {
      attention.push({
        titre: `Contrat à valider — ${c.cible || "sans objet"}`,
        detail: c.commanditaire ? `Commanditaire : ${c.commanditaire}` : "En attente de validation.",
        tag: "Contrat",
        sev: "warn",
      });
    }
  }
  for (const o of board.preparation) {
    attention.push({
      titre: `Opération en préparation — ${o.titre}`,
      detail: `${o.type} · ${o.membres.length} agent(s) assigné(s).`,
      tag: "Opération",
      sev: "info",
    });
  }

  return {
    connecte: true,
    coffres: { commun: findSolde("coffre_commun"), legal: findSolde("coffre_legal"), illegal: findSolde("coffre_illegal") },
    contratsEnCours,
    opsActives,
    membresCount: (membres || []).length,
    operations: board,
    attention: attention.slice(0, 8),
  };
}
