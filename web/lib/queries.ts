/**
 * Lecture des VRAIES données depuis Supabase (alimentées par le bot Discord via
 * supabase-sync.js). Aucune donnée inventée : on reflète exactement les lignes
 * de la base. Si la base est vide ou injoignable, on renvoie des états vides
 * honnêtes (le dashboard affiche « en attente » plutôt que des chiffres fictifs).
 *
 * Exécuté côté serveur — via le client Supabase lié à la session : les lectures
 * portent l'identité du membre connecté (compatible sécurité RLS).
 */
import "server-only";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

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

export type Profil = { nom: string; initiales: string; role: string; avatarUrl: string | null };

const EMPTY: DashData = {
  connecte: false,
  coffres: { commun: null, legal: null, illegal: null },
  contratsEnCours: 0,
  opsActives: 0,
  membresCount: 0,
  operations: { preparation: [], encours: [], terminees: [] },
  attention: [],
};

// Les données sont lues côté serveur avec la clé service (contourne la RLS).
function dataConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
}
// L'auth (connexion Discord) utilise la clé publiable.
function authConfigured() {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

// Statuts de contrat considérés comme « clos » (donc plus « en cours »).
const CONTRAT_CLOS = new Set(["termine", "terminee", "terminée", "annule", "annulee", "annulée", "refuse", "refusé", "clos", "cloture", "clôturé", "signe", "signé"]);

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
  if (!dataConfigured()) return false;
  try {
    const admin = createAdminClient();
    if (!admin) return false;
    const { error } = await admin.from("Coffre").select("id").limit(1);
    return !error;
  } catch {
    return false;
  }
}

// Profil du membre connecté (compte Discord + fiche Membre si elle existe).
export async function getSessionProfile(): Promise<Profil | null> {
  if (!authConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const discordId = (meta.provider_id || meta.sub || "") as string;
    let nom = (meta.full_name || meta.name || meta.user_name || user.email || "Membre") as string;
    let role = "Membre";
    // Enrichit avec la fiche Membre (via la clé service, côté serveur).
    const admin = createAdminClient();
    if (discordId && admin) {
      const { data } = await admin.from("Membre").select("nomIC,grade").eq("id", String(discordId)).maybeSingle();
      if (data) {
        if (data.nomIC) nom = data.nomIC as string;
        if (data.grade) role = data.grade as string;
      }
    }
    const initiales = nom.split(/\s+/).filter(Boolean).map((s) => s[0]).slice(0, 2).join("").toUpperCase() || "?";
    return { nom, initiales, role, avatarUrl: (meta.avatar_url as string) || null };
  } catch {
    return null;
  }
}

export async function getDashboard(): Promise<DashData> {
  if (!dataConfigured()) return EMPTY;
  const supabase = createAdminClient();
  if (!supabase) return EMPTY;

  const [coffresR, contratsR, operationsR, membresR] = await Promise.all([
    supabase.from("Coffre").select("id,pole,solde"),
    supabase.from("Contrat").select("id,cible,statut,pole,commanditaire"),
    supabase.from("Operation").select("id,categorie,cible,phase,agentsAssignes"),
    supabase.from("Membre").select("id"),
  ]);

  // Base injoignable → état vide honnête.
  if (coffresR.error && contratsR.error && operationsR.error && membresR.error) {
    return EMPTY;
  }

  type CoffreRow = { id: string; pole: string; solde: number };
  type ContratRow = { id: string; cible: string; statut: string; pole: string; commanditaire: string | null };
  type OperationRow = { id: string; categorie: string; cible: string; phase: string; agentsAssignes: string[] };

  const coffres = (coffresR.data || []) as CoffreRow[];
  const contrats = (contratsR.data || []) as ContratRow[];
  const operations = (operationsR.data || []) as OperationRow[];
  const membres = (membresR.data || []) as { id: string }[];

  const findSolde = (id: string) => coffres.find((c) => c.id === id)?.solde ?? null;

  const board: DashData["operations"] = { preparation: [], encours: [], terminees: [] };
  for (const o of operations) {
    const { col, etape } = phaseLabel(o.phase);
    board[col].push({
      titre: o.cible || "Opération",
      type: o.categorie || "Opération",
      etape,
      membres: Array.isArray(o.agentsAssignes) ? o.agentsAssignes : [],
    });
  }

  const contratsEnCours = contrats.filter((c) => !CONTRAT_CLOS.has(String(c.statut || "").toLowerCase())).length;
  const opsActives = board.preparation.length + board.encours.length;

  // « Ce qui demande ton attention » — uniquement des éléments RÉELS de la base.
  const attention: AttentionItem[] = [];
  for (const c of contrats) {
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
    membresCount: membres.length,
    operations: board,
    attention: attention.slice(0, 8),
  };
}

// ── Opérations & Contrats (page dédiée) ──────────────────────────
export type OpDetail = { id: string; titre: string; type: string; etape: string; membres: number; prime: string | null };
export type ContratDetail = { id: string; cible: string; commanditaire: string | null; statut: string; pole: string; remuneration: string | null };
export type OperationsData = {
  connecte: boolean;
  operations: { preparation: OpDetail[]; encours: OpDetail[]; terminees: OpDetail[] };
  contrats: ContratDetail[];
};

export async function getOperations(): Promise<OperationsData> {
  const vide: OperationsData = { connecte: false, operations: { preparation: [], encours: [], terminees: [] }, contrats: [] };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;

  const [opsR, contratsR] = await Promise.all([
    supabase.from("Operation").select("id,categorie,cible,phase,agentsAssignes,prime").order("createdAt", { ascending: false }),
    supabase.from("Contrat").select("id,cible,statut,pole,commanditaire,remuneration").order("createdAt", { ascending: false }),
  ]);
  if (opsR.error && contratsR.error) return vide;

  type OpRow = { id: string; categorie: string; cible: string; phase: string; agentsAssignes: string[]; prime: string | null };
  type CoRow = { id: string; cible: string; statut: string; pole: string; commanditaire: string | null; remuneration: string | null };

  const board: OperationsData["operations"] = { preparation: [], encours: [], terminees: [] };
  for (const o of (opsR.data || []) as OpRow[]) {
    const { col, etape } = phaseLabel(o.phase);
    board[col].push({
      id: o.id,
      titre: o.cible || "Opération",
      type: o.categorie || "Opération",
      etape,
      membres: Array.isArray(o.agentsAssignes) ? o.agentsAssignes.length : 0,
      prime: o.prime ?? null,
    });
  }
  const contrats: ContratDetail[] = ((contratsR.data || []) as CoRow[]).map((c) => ({
    id: c.id,
    cible: c.cible || "Contrat",
    commanditaire: c.commanditaire ?? null,
    statut: c.statut || "en_attente",
    pole: c.pole || "legal",
    remuneration: c.remuneration ?? null,
  }));

  return { connecte: true, operations: board, contrats };
}

// ── Membres & RH (page dédiée) ───────────────────────────────────
export type MembreDetail = { id: string; nomIC: string; grade: string | null; pole: string; statut: string };
export type MembresData = { connecte: boolean; membres: MembreDetail[] };

export async function getMembres(): Promise<MembresData> {
  if (!dataConfigured()) return { connecte: false, membres: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, membres: [] };
  const { data, error } = await supabase.from("Membre").select("id,nomIC,grade,pole,statut").order("nomIC", { ascending: true });
  if (error) return { connecte: false, membres: [] };
  return { connecte: true, membres: (data || []) as MembreDetail[] };
}

// ── Finances (page dédiée) ───────────────────────────────────────
export type FinancesData = { connecte: boolean; coffres: { commun: number | null; legal: number | null; illegal: number | null } };

export async function getFinances(): Promise<FinancesData> {
  if (!dataConfigured()) return { connecte: false, coffres: { commun: null, legal: null, illegal: null } };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, coffres: { commun: null, legal: null, illegal: null } };
  const { data, error } = await supabase.from("Coffre").select("id,solde");
  if (error) return { connecte: false, coffres: { commun: null, legal: null, illegal: null } };
  const find = (id: string) => (data || []).find((c: { id: string; solde: number }) => c.id === id)?.solde ?? null;
  return { connecte: true, coffres: { commun: find("coffre_commun"), legal: find("coffre_legal"), illegal: find("coffre_illegal") } };
}
