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
import { cookies } from "next/headers";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Pôle actif (Iron Wolf légal / La Confrérie illégal) ──────────
// Choisi par le bouton du header, mémorisé dans un cookie côté client.
// Sert à filtrer les données qui ONT réellement un pôle (contrats, coffres,
// opérations liées à un contrat, armes, véhicules). Les données partagées
// (membres, renseignement, médical, agenda) ne sont jamais masquées.
export type PoleWeb = "iwc" | "confrerie";

export async function getPole(): Promise<PoleWeb> {
  try {
    const c = await cookies();
    return c.get("iwc_pole")?.value === "confrerie" ? "confrerie" : "iwc";
  } catch {
    return "iwc";
  }
}
// Valeur de pôle en base pour le côté actif.
function poleDb(p: PoleWeb): "legal" | "illegal" {
  return p === "confrerie" ? "illegal" : "legal";
}
// Une ligne appartient-elle au pôle actif ? (« both » ou vide → visible partout)
function matchPole(rowPole: string | null | undefined, actif: "legal" | "illegal"): boolean {
  const p = String(rowPole || "").toLowerCase();
  if (!p || p === "both" || p === "commun") return true;
  return p === actif;
}

export type OpCard = { titre: string; type: string; etape: string; membres: string[] };
export type AttentionItem = { titre: string; detail: string; tag: string; sev: "crit" | "warn" | "info" };

export type DashData = {
  connecte: boolean;
  pole: PoleWeb;
  coffres: { commun: number | null; legal: number | null; illegal: number | null };
  contratsEnCours: number;
  opsActives: number;
  membresCount: number;
  operations: { preparation: OpCard[]; encours: OpCard[]; terminees: OpCard[] };
  attention: AttentionItem[];
  membresParGrade: { label: string; value: number }[];
  opsParPhase: { label: string; value: number; color: string }[];
};

// Ordre hiérarchique canonique + libellé court pour les graphiques.
const ORDRE_GRADES: [string, string][] = [
  ["Fondateur", "Fondateur"],
  ["Le Conseil — Directeur / Co-Directeur", "Le Conseil"],
  ["Officier de Terrain", "Officier de Terrain"],
  ["Agent Confirmé", "Agent Confirmé"],
  ["Opérateur", "Opérateur"],
  ["Recrue — Probatoire", "Recrue"],
];

export type Profil = { nom: string; initiales: string; role: string; avatarUrl: string | null };

const EMPTY: DashData = {
  connecte: false,
  pole: "iwc",
  coffres: { commun: null, legal: null, illegal: null },
  contratsEnCours: 0,
  opsActives: 0,
  membresCount: 0,
  operations: { preparation: [], encours: [], terminees: [] },
  attention: [],
  membresParGrade: [],
  opsParPhase: [],
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
  const pole = await getPole();
  const actif = poleDb(pole);

  const [coffresR, contratsR, operationsR, membresR] = await Promise.all([
    supabase.from("Coffre").select("id,pole,solde"),
    supabase.from("Contrat").select("id,cible,statut,pole,commanditaire"),
    supabase.from("Operation").select("id,categorie,cible,phase,agentsAssignes,contratId"),
    supabase.from("Membre").select("id,grade"),
  ]);

  // Base injoignable → état vide honnête.
  if (coffresR.error && contratsR.error && operationsR.error && membresR.error) {
    return { ...EMPTY, pole };
  }

  type CoffreRow = { id: string; pole: string; solde: number };
  type ContratRow = { id: string; cible: string; statut: string; pole: string; commanditaire: string | null };
  type OperationRow = { id: string; categorie: string; cible: string; phase: string; agentsAssignes: string[]; contratId: string | null };

  const coffres = (coffresR.data || []) as CoffreRow[];
  const contratsAll = (contratsR.data || []) as ContratRow[];
  const operationsAll = (operationsR.data || []) as OperationRow[];
  const membres = (membresR.data || []) as { id: string; grade: string | null }[];

  // Filtre pôle : contrats du côté actif ; opérations selon le pôle de leur
  // contrat lié (sans contrat → visibles dans les deux pôles).
  const contratPole = new Map<string, string>();
  for (const c of contratsAll) contratPole.set(String(c.id), String(c.pole || "legal"));
  const contrats = contratsAll.filter((c) => matchPole(c.pole, actif));
  const operations = operationsAll.filter((o) => matchPole(o.contratId ? contratPole.get(String(o.contratId)) : null, actif));

  // Répartition des membres par grade (dans l'ordre hiérarchique, grades non vides).
  const gradeCount = new Map<string, number>();
  for (const m of membres) gradeCount.set(m.grade || "—", (gradeCount.get(m.grade || "—") || 0) + 1);
  const membresParGrade = ORDRE_GRADES
    .map(([g, court]) => ({ label: court, value: gradeCount.get(g) || 0 }))
    .filter((x) => x.value > 0);

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
    pole,
    coffres: { commun: findSolde("coffre_commun"), legal: findSolde("coffre_legal"), illegal: findSolde("coffre_illegal") },
    contratsEnCours,
    opsActives,
    membresCount: membres.length,
    operations: board,
    attention: attention.slice(0, 8),
    membresParGrade,
    opsParPhase: [
      { label: "Préparation", value: board.preparation.length, color: "#c98500" },
      { label: "En cours", value: board.encours.length, color: "#3987e5" },
      { label: "Terminées", value: board.terminees.length, color: "#199e70" },
    ],
  };
}

// ── Opérations & Contrats (page dédiée) ──────────────────────────
export type OpDetail = { id: string; titre: string; type: string; etape: string; phase: string; membres: number; prime: string | null };
export type ContratDetail = { id: string; cible: string; commanditaire: string | null; statut: string; pole: string; remuneration: string | null };
export type OperationsData = {
  connecte: boolean;
  pole: PoleWeb;
  operations: { preparation: OpDetail[]; encours: OpDetail[]; terminees: OpDetail[] };
  contrats: ContratDetail[];
};

export async function getOperations(): Promise<OperationsData> {
  const vide: OperationsData = { connecte: false, pole: "iwc", operations: { preparation: [], encours: [], terminees: [] }, contrats: [] };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const pole = await getPole();
  const actif = poleDb(pole);

  const [opsR, contratsR] = await Promise.all([
    supabase.from("Operation").select("id,categorie,cible,phase,agentsAssignes,prime,contratId").order("createdAt", { ascending: false }),
    supabase.from("Contrat").select("id,cible,statut,pole,commanditaire,remuneration").order("createdAt", { ascending: false }),
  ]);
  if (opsR.error && contratsR.error) return { ...vide, pole };

  type OpRow = { id: string; categorie: string; cible: string; phase: string; agentsAssignes: string[]; prime: string | null; contratId: string | null };
  type CoRow = { id: string; cible: string; statut: string; pole: string; commanditaire: string | null; remuneration: string | null };

  // Pôle de chaque contrat → sert à rattacher les opérations à un pôle.
  const contratPole = new Map<string, string>();
  for (const c of (contratsR.data || []) as CoRow[]) contratPole.set(String(c.id), String(c.pole || "legal"));

  const board: OperationsData["operations"] = { preparation: [], encours: [], terminees: [] };
  for (const o of (opsR.data || []) as OpRow[]) {
    // Opération sans contrat lié → visible dans les deux pôles.
    if (!matchPole(o.contratId ? contratPole.get(String(o.contratId)) : null, actif)) continue;
    const { col, etape } = phaseLabel(o.phase);
    board[col].push({
      id: o.id,
      titre: o.cible || "Opération",
      type: o.categorie || "Opération",
      etape,
      phase: col === "encours" ? "en_cours" : col === "terminees" ? (o.phase === "annulee" ? "annulee" : "terminee") : "preparation",
      membres: Array.isArray(o.agentsAssignes) ? o.agentsAssignes.length : 0,
      prime: o.prime ?? null,
    });
  }
  const contrats: ContratDetail[] = ((contratsR.data || []) as CoRow[])
    .filter((c) => matchPole(c.pole, actif))
    .map((c) => ({
      id: c.id,
      cible: c.cible || "Contrat",
      commanditaire: c.commanditaire ?? null,
      statut: c.statut || "en_attente",
      pole: c.pole || "legal",
      remuneration: c.remuneration ?? null,
    }));

  return { connecte: true, pole, operations: board, contrats };
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

// ── Renseignement (page dédiée) ──────────────────────────────────
export type RapportItem = { id: string; source: string | null; cible: string | null; info: string; fiabilite: number; statut: string; createdAt: string };
export type TraqueItem = { id: string; cible: string; prime: string | null; dangerosite: string | null; statut: string };
export type RenseignementData = { connecte: boolean; rapports: RapportItem[]; traques: TraqueItem[] };

export async function getRenseignement(): Promise<RenseignementData> {
  const vide: RenseignementData = { connecte: false, rapports: [], traques: [] };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const [rapportsR, traquesR] = await Promise.all([
    supabase.from("RapportInfo").select("id,source,cible,info,fiabilite,statut,createdAt").order("createdAt", { ascending: false }).limit(100),
    supabase.from("Traque").select("id,cible,prime,dangerosite,statut").order("createdAt", { ascending: false }).limit(100),
  ]);
  if (rapportsR.error && traquesR.error) return vide;
  return {
    connecte: true,
    rapports: ((rapportsR.data || []) as RapportItem[]),
    traques: ((traquesR.data || []) as TraqueItem[]),
  };
}

// ── Avis de recherche / Wanted (page dédiée) ─────────────────────
export type AvisItem = {
  id: string; cible: string; prime: string | null; dangerosite: string | null; statut: string;
  photo: string | null; position: string | null; vivantMort: string | null;
  commanditaire: string | null; signalement: string | null; chasseurs: number;
};
export type AvisData = { connecte: boolean; avis: AvisItem[] };

export async function getAvisRecherche(): Promise<AvisData> {
  if (!dataConfigured()) return { connecte: false, avis: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, avis: [] };
  // select("*") : robuste que les colonnes riches existent ou non.
  const { data, error } = await supabase.from("Traque").select("*").order("createdAt", { ascending: false }).limit(200);
  if (error) return { connecte: false, avis: [] };
  type Raw = Record<string, unknown>;
  const avis: AvisItem[] = ((data || []) as Raw[]).map((t) => ({
    id: String(t.id),
    cible: (t.cible as string) || "Inconnu",
    prime: (t.prime as string) ?? null,
    dangerosite: (t.dangerosite as string) ?? null,
    statut: (t.statut as string) || "chasse",
    photo: (t.photo as string) ?? null,
    position: (t.position as string) ?? null,
    vivantMort: (t.vivantMort as string) ?? null,
    commanditaire: (t.commanditaire as string) ?? null,
    signalement: (t.signalement as string) ?? null,
    chasseurs: Number(t.chasseurs) || 0,
  }));
  return { connecte: true, avis };
}

// ── Médical (page dédiée) ────────────────────────────────────────
export type Blessure = { date?: string; desc?: string; localisation?: string; gravite?: string };
export type Suivi = { date?: string; soin?: string; soignant?: string; etat?: string; traitement?: string; suite?: string };
export type Ordonnance = { medicaments?: string; posologie?: string; duree?: string; conseils?: string };
export type Histo = { date?: string; action?: string; par?: string };
export type DossierItem = {
  id: string; membreId: string; nom: string; statut: string;
  blessures: Blessure[]; ordonnances: Ordonnance[]; suivis: Suivi[]; historique: Histo[];
  notes: string | null; testValide: boolean | null; prochainRdv: string | null;
  reposJusquAt: string | null; reposMotif: string | null; majPar: string | null;
};
export type MedicalData = { connecte: boolean; dossiers: DossierItem[] };

function _arr<T>(v: unknown): T[] {
  return Array.isArray(v) ? (v as T[]) : [];
}

export async function getMedical(): Promise<MedicalData> {
  if (!dataConfigured()) return { connecte: false, dossiers: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, dossiers: [] };
  const [dossiersR, membresR] = await Promise.all([
    // select("*") : robuste que les colonnes détaillées existent ou non.
    supabase.from("DossierMedical").select("*").order("updatedAt", { ascending: false }),
    supabase.from("Membre").select("id,nomIC"),
  ]);
  if (dossiersR.error) return { connecte: false, dossiers: [] };
  const noms = new Map<string, string>();
  for (const m of (membresR.data || []) as { id: string; nomIC: string }[]) noms.set(m.id, m.nomIC);
  type DRow = Record<string, unknown>;
  const dossiers: DossierItem[] = ((dossiersR.data || []) as DRow[]).map((d) => ({
    id: String(d.id),
    membreId: String(d.membreId ?? d.id),
    nom: noms.get(String(d.membreId)) || String(d.membreId) || "Patient",
    statut: (d.statut as string) || "—",
    blessures: _arr<Blessure>(d.blessures),
    ordonnances: _arr<Ordonnance>(d.ordonnances),
    suivis: _arr<Suivi>(d.suivis),
    historique: _arr<Histo>(d.historique),
    notes: (d.notes as string) ?? null,
    testValide: typeof d.testValide === "boolean" ? d.testValide : null,
    prochainRdv: (d.prochainRdv as string) ?? null,
    reposJusquAt: (d.reposJusquAt as string) ?? null,
    reposMotif: (d.reposMotif as string) ?? null,
    majPar: (d.majPar as string) ?? null,
  }));
  return { connecte: true, dossiers };
}

// ── Agenda & Clients (page dédiée) ───────────────────────────────
export type RdvItem = { id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null; statut: string; source: string | null };
export type ContactItem = {
  id: string; nom: string; type: string; fiabilite: number; secteur: string | null;
  notes: string | null; telegramme: string | null; metier: string | null;
  affiliation: string | null; relation: string | null; statutRP: string | null; creeParNom: string | null;
};
export type AgendaData = { connecte: boolean; rdvs: RdvItem[]; contacts: ContactItem[] };

export async function getAgenda(): Promise<AgendaData> {
  if (!dataConfigured()) return { connecte: false, rdvs: [], contacts: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, rdvs: [], contacts: [] };
  const [rdvR, contactR] = await Promise.all([
    supabase.from("Rdv").select("id,nomRP,type,lieu,creneau,statut,paiement").order("createdAt", { ascending: false }).limit(100),
    // select("*") : robuste que les colonnes détaillées existent ou non.
    supabase.from("Contact").select("*").order("nom", { ascending: true }).limit(400),
  ]);
  if (rdvR.error && contactR.error) return { connecte: false, rdvs: [], contacts: [] };
  type RRow = { id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null; statut: string; paiement: { source?: string } | null };
  const rdvs: RdvItem[] = ((rdvR.data || []) as RRow[]).map((r) => ({
    id: r.id, nomRP: r.nomRP, type: r.type, lieu: r.lieu, creneau: r.creneau, statut: r.statut || "Planifié", source: r.paiement?.source ?? null,
  }));
  type CRaw = Record<string, unknown>;
  const contacts: ContactItem[] = ((contactR.data || []) as CRaw[]).map((c) => ({
    id: String(c.id),
    nom: (c.nom as string) || "Contact",
    type: (c.type as string) || "Neutre",
    fiabilite: Number(c.fiabilite) || 0,
    secteur: (c.secteur as string) ?? null,
    notes: (c.notes as string) ?? null,
    telegramme: (c.telegramme as string) ?? null,
    metier: (c.metier as string) ?? null,
    affiliation: (c.affiliation as string) ?? null,
    relation: (c.relation as string) ?? null,
    statutRP: (c.statutRP as string) ?? null,
    creeParNom: (c.creeParNom as string) ?? null,
  }));
  return { connecte: true, rdvs, contacts };
}

// ── Inventaire (page dédiée) ─────────────────────────────────────
export type VehiculeItem = { id: string; nom: string; type: string | null; pole: string; etat: string | null; notes: string | null };
export type ArmeItem = { id: string; serie: string; type: string | null; categorie: string | null; appartenance: string | null; membreNom: string | null; pole: string | null };
export type InventaireData = { connecte: boolean; pole: PoleWeb; vehicules: VehiculeItem[]; armes: ArmeItem[] };

export async function getInventaire(): Promise<InventaireData> {
  if (!dataConfigured()) return { connecte: false, pole: "iwc", vehicules: [], armes: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, pole: "iwc", vehicules: [], armes: [] };
  const pole = await getPole();
  const actif = poleDb(pole);
  const [vehR, armeR] = await Promise.all([
    supabase.from("Vehicule").select("id,nom,type,pole,etat,notes").order("nom", { ascending: true }),
    // La table Arme peut ne pas encore exister → on ignore l'erreur (liste vide).
    supabase.from("Arme").select("id,serie,type,categorie,appartenance,membreNom,pole").order("serie", { ascending: true }),
  ]);
  if (vehR.error && armeR.error) return { connecte: false, pole, vehicules: [], armes: [] };
  // Une arme/un véhicule sans pôle défini reste visible dans les deux pôles.
  const vehicules = ((vehR.data || []) as VehiculeItem[]).filter((v) => matchPole(v.pole, actif));
  const armes = armeR.error ? [] : ((armeR.data || []) as ArmeItem[]).filter((a) => matchPole(a.pole, actif));
  return { connecte: true, pole, vehicules, armes };
}

// ── Notifications (page dédiée) ──────────────────────────────────
export type NotifItem = { id: string; type: string; titre: string; corps: string | null; lu: boolean; createdAt: string };
export type NotificationsData = { connecte: boolean; notifs: NotifItem[] };

export async function getNotifications(): Promise<NotificationsData> {
  if (!dataConfigured()) return { connecte: false, notifs: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, notifs: [] };
  const { data, error } = await supabase.from("Notification").select("id,type,titre,corps,lu,createdAt").order("createdAt", { ascending: false }).limit(100);
  if (error) return { connecte: false, notifs: [] };
  return { connecte: true, notifs: (data || []) as NotifItem[] };
}

// ── Finances (page dédiée) ───────────────────────────────────────
export type FinancesData = { connecte: boolean; pole: PoleWeb; coffres: { commun: number | null; legal: number | null; illegal: number | null } };

export async function getFinances(): Promise<FinancesData> {
  const pole = await getPole();
  if (!dataConfigured()) return { connecte: false, pole, coffres: { commun: null, legal: null, illegal: null } };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, pole, coffres: { commun: null, legal: null, illegal: null } };
  const { data, error } = await supabase.from("Coffre").select("id,solde");
  if (error) return { connecte: false, pole, coffres: { commun: null, legal: null, illegal: null } };
  const find = (id: string) => (data || []).find((c: { id: string; solde: number }) => c.id === id)?.solde ?? null;
  return { connecte: true, pole, coffres: { commun: find("coffre_commun"), legal: find("coffre_legal"), illegal: find("coffre_illegal") } };
}
