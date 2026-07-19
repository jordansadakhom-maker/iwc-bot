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
// Détail COMPLET : on lit toutes les colonnes synchronisées (motif, agents,
// étapes JSON avec leurs champs & photos) pour tout afficher au clic.
export type EtapeChamp = { label: string; valeur: string };
export type EtapePhoto = { url: string; name: string };
export type EtapeDetail = {
  titre: string; statut: "validee" | "encours" | "verrouillee";
  valideePar: string | null; valideeAt: string | null; champs: EtapeChamp[]; photos: EtapePhoto[];
};
export type OpDetail = {
  id: string; titre: string; type: string; etape: string; phase: string;
  membres: number; membresNoms: string[]; membresIds: string[]; prime: string | null;
  objectif: string | null; lieu: string | null; pole: string;
  etapes: EtapeDetail[]; createurNom: string | null; createdAt: string | null; contratLie: string | null;
  resultat: string | null; butin: string | null; debrief: string | null;
};
export type ContratDetail = {
  id: string; cible: string; commanditaire: string | null; statut: string; pole: string;
  remuneration: string | null; motif: string | null; agentsNoms: string[]; createdAt: string | null;
  suivi: string | null; remuVerseAuCoffre: number | null;
};
export type OperationsData = {
  connecte: boolean;
  pole: PoleWeb;
  operations: { preparation: OpDetail[]; encours: OpDetail[]; terminees: OpDetail[] };
  contrats: ContratDetail[];
  membres: MembreLite[];
};

// Libellés lisibles pour les identifiants de champs d'étape les plus courants
// (issus des modèles d'étapes du bot). Repli : identifiant « joli » (capitalisé).
const CHAMP_LABELS: Record<string, string> = {
  position: "Dernière position", effectif: "Effectif", habitudes: "Habitudes / horaires",
  notes: "Notes", ralliement: "Point de ralliement", itineraire: "Itinéraire (approche + repli)",
  equipement: "Équipement", horaire: "Heure prévue", issue: "Issue", deroulement: "Déroulement",
  pertes: "Pertes / incidents", lieuRemise: "Lieu de remise", prime: "Prime", bilan: "Bilan",
  cargaison: "Cargaison", depart: "Point de départ", destination: "Destination", quantite: "Quantité / valeur",
  controles: "Points de contrôle", couverture: "Couverture", incidents: "Incidents", destinataire: "Destinataire",
  paiement: "Paiement", methode: "Méthode", materiel: "Matériel", acces: "Accès + repli", degats: "Dégâts",
  temoins: "Témoins", roles: "Rôles assignés", participants: "Membres confirmés", cible: "Cible",
  surveillance: "Surveillance", motif: "Motif", commission: "Commission", objectif: "Objectif",
  montant: "Montant", protege: "Protégé", menace: "Menace", dispositif: "Dispositif",
};
function _champLabel(id: string): string {
  if (CHAMP_LABELS[id]) return CHAMP_LABELS[id];
  return id.replace(/([A-Z])/g, " $1").replace(/^./, (c) => c.toUpperCase());
}
// Convertit une étape brute (JSON du bot) en détail lisible pour le site.
function _etapeDetail(raw: unknown, i: number): EtapeDetail {
  const e = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const titre = String(e.label || e.titre || e.key || `Étape ${i + 1}`);
  const valide = !!e.valide;
  const champsObj = (e.champs && typeof e.champs === "object" ? e.champs : {}) as Record<string, unknown>;
  const champs: EtapeChamp[] = Object.entries(champsObj)
    .filter(([, v]) => v != null && String(v).trim() !== "")
    .map(([k, v]) => ({ label: _champLabel(k), valeur: String(v) }));
  const photosRaw = Array.isArray(e.photos) ? e.photos : [];
  const photos: EtapePhoto[] = photosRaw
    .map((p) => (p && typeof p === "object" ? p : {}) as Record<string, unknown>)
    .filter((p) => p.url)
    .map((p) => ({ url: String(p.url), name: String(p.name || "photo") }));
  return {
    titre,
    statut: valide ? "validee" : champs.length || photos.length ? "encours" : "verrouillee",
    valideePar: (e.valideePar as string) ?? null,
    valideeAt: (e.valideeAt as string) ?? null,
    champs, photos,
  };
}

export async function getOperations(): Promise<OperationsData> {
  const vide: OperationsData = { connecte: false, pole: "iwc", operations: { preparation: [], encours: [], terminees: [] }, contrats: [], membres: [] };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const pole = await getPole();
  const actif = poleDb(pole);

  const [opsR, contratsR, membresR] = await Promise.all([
    // select("*") : robuste que les colonnes riches existent ou non.
    supabase.from("Operation").select("*").order("createdAt", { ascending: false }),
    supabase.from("Contrat").select("*").order("createdAt", { ascending: false }),
    supabase.from("Membre").select("id,nomIC"),
  ]);
  if (opsR.error && contratsR.error) return { ...vide, pole };

  type Raw = Record<string, unknown>;
  // Résolution ID Discord → nom RP (les agents peuvent être des ids ou déjà des noms).
  const noms = new Map<string, string>();
  for (const m of (membresR.data || []) as { id: string; nomIC: string }[]) noms.set(String(m.id), m.nomIC);
  const resoudre = (v: unknown) => { const s = String(v); return noms.get(s) || s; };

  // Pôle de chaque contrat → sert à rattacher les opérations à un pôle.
  const contratPole = new Map<string, string>();
  const contratNom = new Map<string, string>();
  for (const c of (contratsR.data || []) as Raw[]) {
    contratPole.set(String(c.id), String(c.pole || "legal"));
    contratNom.set(String(c.id), String(c.cible || c.id));
  }

  const board: OperationsData["operations"] = { preparation: [], encours: [], terminees: [] };
  for (const o of (opsR.data || []) as Raw[]) {
    const contratId = o.contratId ? String(o.contratId) : null;
    // Opération sans contrat lié → visible dans les deux pôles.
    if (!matchPole(contratId ? contratPole.get(contratId) : null, actif)) continue;
    const phase = String(o.phase || "preparation");
    const { col, etape } = phaseLabel(phase);
    const agents = Array.isArray(o.agentsAssignes) ? (o.agentsAssignes as unknown[]) : [];
    const etapesRaw = Array.isArray(o.etapes) ? (o.etapes as unknown[]) : [];
    board[col].push({
      id: String(o.id),
      titre: String(o.cible || "Opération"),
      type: String(o.categorie || "Opération"),
      etape,
      phase: col === "encours" ? "en_cours" : col === "terminees" ? (phase === "annulee" ? "annulee" : "terminee") : "preparation",
      membres: agents.length,
      membresNoms: agents.map(resoudre),
      membresIds: agents.map(String),
      prime: (o.prime as string) ?? null,
      objectif: (o.objectif as string) ?? null,
      lieu: (o.lieu as string) ?? null,
      pole: contratId ? (contratPole.get(contratId) || "legal") : String(o.pole || "both"),
      etapes: etapesRaw.map(_etapeDetail),
      createurNom: (o.createurNom as string) ?? null,
      createdAt: (o.createdAt as string) ?? null,
      contratLie: contratId ? (contratNom.get(contratId) || contratId) : null,
      resultat: (o.resultat as string) ?? null,
      butin: (o.butin as string) ?? null,
      debrief: (o.debrief as string) ?? null,
    });
  }
  const contrats: ContratDetail[] = ((contratsR.data || []) as Raw[])
    .filter((c) => matchPole(c.pole as string, actif))
    .map((c) => {
      const agents = Array.isArray(c.agents) ? (c.agents as unknown[]) : [];
      return {
        id: String(c.id),
        cible: String(c.cible || "Contrat"),
        commanditaire: (c.commanditaire as string) ?? null,
        statut: String(c.statut || "en_attente"),
        pole: String(c.pole || "legal"),
        remuneration: (c.remuneration as string) ?? null,
        motif: (c.motif as string) ?? null,
        agentsNoms: agents.map(resoudre),
        createdAt: (c.createdAt as string) ?? null,
        suivi: (c.suivi as string) ?? null,
        remuVerseAuCoffre: c.remuVerseAuCoffre == null ? null : Number(c.remuVerseAuCoffre),
      };
    });

  const membresLite: MembreLite[] = ((membresR.data || []) as { id: string; nomIC: string }[]).map((m) => ({ id: String(m.id), nom: m.nomIC || String(m.id) }));
  return { connecte: true, pole, operations: board, contrats, membres: membresLite };
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
export type RdvItem = { id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null; statut: string; source: string | null; lieuPhoto: string | null; assignes: string[] };
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
  type RRow = { id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null; statut: string; paiement: Record<string, unknown> | null };
  const rdvs: RdvItem[] = ((rdvR.data || []) as RRow[]).map((r) => {
    const p = (r.paiement || {}) as Record<string, unknown>;
    return {
      id: r.id, nomRP: r.nomRP, type: r.type, lieu: r.lieu, creneau: r.creneau, statut: r.statut || "Planifié",
      source: (p.source as string) ?? null, lieuPhoto: (p.lieuPhoto as string) ?? null,
      assignes: Array.isArray(p.assignes) ? (p.assignes as string[]) : [],
    };
  });
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

// ── Communication : rendez-vous clients (table Rdv) ──────────────
export type Reponse = { texte: string; par?: string; at?: string };
export type MembreLite = { id: string; nom: string };
export type RdvComm = {
  id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null;
  statut: string; source: string | null; contact: string | null; message: string | null; reponses: Reponse[]; createdAt: string | null;
  assignes: string[]; lieuPhoto: string | null;
};
export type CommunicationData = { connecte: boolean; rdvs: RdvComm[]; membres: MembreLite[] };

export async function getCommunication(): Promise<CommunicationData> {
  if (!dataConfigured()) return { connecte: false, rdvs: [], membres: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, rdvs: [], membres: [] };
  const [rdvR, membreR] = await Promise.all([
    supabase.from("Rdv").select("id,nomRP,type,lieu,creneau,statut,paiement,createdAt").order("createdAt", { ascending: false }).limit(200),
    supabase.from("Membre").select("id,nomIC").order("nomIC", { ascending: true }),
  ]);
  if (rdvR.error) return { connecte: false, rdvs: [], membres: [] };
  type Row = { id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null; statut: string; paiement: Record<string, unknown> | null; createdAt: string | null };
  const rdvs: RdvComm[] = ((rdvR.data || []) as Row[]).map((r) => {
    const p = (r.paiement || {}) as Record<string, unknown>;
    const reps = Array.isArray(p.reponses) ? (p.reponses as Reponse[]) : [];
    return {
      id: String(r.id), nomRP: r.nomRP, type: r.type, lieu: r.lieu, creneau: r.creneau,
      statut: r.statut || "nouveau", source: (p.source as string) ?? null,
      contact: (p.contact as string) ?? null, message: (p.message as string) ?? null,
      reponses: reps, createdAt: r.createdAt,
      assignes: Array.isArray(p.assignes) ? (p.assignes as string[]) : [],
      lieuPhoto: (p.lieuPhoto as string) ?? null,
    };
  });
  const membres: MembreLite[] = ((membreR.data || []) as { id: string; nomIC: string }[]).map((m) => ({ id: String(m.id), nom: m.nomIC || String(m.id) }));
  return { connecte: true, rdvs, membres };
}

// ── Télégrammes (table Telegramme, alimentée par le bot depuis Discord) ──
export type TgMessage = { from: string; name?: string; content?: string; at?: number };
export type TelegrammeItem = {
  id: string; clientId: string | null; clientNom: string; statut: string;
  messages: TgMessage[]; rdvCree: boolean; createdAt: string | null; updatedAt: string | null;
};
export type TelegrammesData = { connecte: boolean; telegrammes: TelegrammeItem[] };

export async function getTelegrammes(): Promise<TelegrammesData> {
  if (!dataConfigured()) return { connecte: false, telegrammes: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, telegrammes: [] };
  // La table peut ne pas encore exister → repli silencieux (liste vide).
  const { data, error } = await supabase.from("Telegramme").select("*").order("updatedAt", { ascending: false }).limit(100);
  if (error) return { connecte: true, telegrammes: [] };
  type Raw = Record<string, unknown>;
  const telegrammes: TelegrammeItem[] = ((data || []) as Raw[]).map((t) => ({
    id: String(t.id),
    clientId: (t.clientId as string) ?? null,
    clientNom: (t.clientNom as string) || "Client",
    statut: (t.statut as string) || "ouvert",
    messages: Array.isArray(t.messages) ? (t.messages as TgMessage[]) : [],
    rdvCree: !!t.rdvCree,
    createdAt: (t.createdAt as string) ?? null,
    updatedAt: (t.updatedAt as string) ?? null,
  }));
  return { connecte: true, telegrammes };
}

// ── Inventaire (page dédiée) : registre d'armes + stock du coffre commun ──
export type ArmeItem = { id: string; serie: string; type: string | null; categorie: string | null; appartenance: string | null; membreNom: string | null; pole: string | null };
export type StockItem = { id: string; categorie: string; nom: string; quantite: number; seuil: number | null };
export type MouvementItem = { id: string; texte: string | null; par: string | null; createdAt: string | null };
export type InventaireData = { connecte: boolean; pole: PoleWeb; armes: ArmeItem[]; stock: StockItem[]; mouvements: MouvementItem[] };

export async function getInventaire(): Promise<InventaireData> {
  if (!dataConfigured()) return { connecte: false, pole: "iwc", armes: [], stock: [], mouvements: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, pole: "iwc", armes: [], stock: [], mouvements: [] };
  const pole = await getPole();
  const actif = poleDb(pole);
  const [armeR, stockR, mouvR] = await Promise.all([
    // Tables optionnelles → on ignore l'erreur (liste vide) si elles n'existent pas encore.
    supabase.from("Arme").select("id,serie,type,categorie,appartenance,membreNom,pole").order("serie", { ascending: true }),
    supabase.from("InventaireItem").select("*").order("categorie", { ascending: true }),
    supabase.from("InventaireMouvement").select("*").order("createdAt", { ascending: false }).limit(40),
  ]);
  const armes = armeR.error ? [] : ((armeR.data || []) as ArmeItem[]).filter((a) => matchPole(a.pole, actif));
  type SRaw = Record<string, unknown>;
  const stock: StockItem[] = stockR.error ? [] : ((stockR.data || []) as SRaw[]).map((s) => ({
    id: String(s.id), categorie: (s.categorie as string) || "Commun", nom: (s.nom as string) || "Objet",
    quantite: Number(s.quantite) || 0, seuil: s.seuil == null ? null : Number(s.seuil),
  }));
  const mouvements: MouvementItem[] = mouvR.error ? [] : ((mouvR.data || []) as SRaw[]).map((m) => ({
    id: String(m.id), texte: (m.texte as string) ?? null, par: (m.par as string) ?? null, createdAt: (m.createdAt as string) ?? null,
  }));
  return { connecte: true, pole, armes, stock, mouvements };
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

// ── Factures ─────────────────────────────────────────────────────
export type FactureItem = { id: string; numero: string; objet: string; montant: number; clientNom: string | null; type: string | null; createdAt: string | null };
export type FacturesData = { connecte: boolean; factures: FactureItem[]; total: number };

export async function getFactures(): Promise<FacturesData> {
  if (!dataConfigured()) return { connecte: false, factures: [], total: 0 };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, factures: [], total: 0 };
  const { data, error } = await supabase.from("Facture").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { connecte: false, factures: [], total: 0 };
  type Raw = Record<string, unknown>;
  const factures: FactureItem[] = ((data || []) as Raw[]).map((f) => ({
    id: String(f.id),
    numero: (f.numero as string) || "—",
    objet: (f.objet as string) || "Prestation",
    montant: Number(f.montant) || 0,
    clientNom: (f.clientNom as string) ?? null,
    type: (f.type as string) ?? null,
    createdAt: (f.createdAt as string) ?? null,
  }));
  const total = factures.reduce((s, f) => s + f.montant, 0);
  return { connecte: true, factures, total };
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

// ── Portefeuilles perso + journal de trésorerie ──────────────────
export type MvtPerso = { date?: string; montant?: number; raison?: string };
export type Portefeuille = { id: string; nom: string; solde: number; historique: MvtPerso[] };
export type Transaction = { id: string; sens: string; montant: number; poste: string | null; motif: string | null; auteur: string | null; createdAt: string | null };
export type PortefeuillesData = { connecte: boolean; portefeuilles: Portefeuille[]; transactions: Transaction[]; membres: MembreLite[]; total: number };

export async function getPortefeuilles(): Promise<PortefeuillesData> {
  const vide: PortefeuillesData = { connecte: false, portefeuilles: [], transactions: [], membres: [], total: 0 };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const [walletR, txR, membreR] = await Promise.all([
    supabase.from("Portefeuille").select("*").order("solde", { ascending: false }),
    supabase.from("Transaction").select("*").order("createdAt", { ascending: false }).limit(60),
    supabase.from("Membre").select("id,nomIC").order("nomIC", { ascending: true }),
  ]);
  const noms = new Map<string, string>();
  const membres: MembreLite[] = ((membreR.data || []) as { id: string; nomIC: string }[]).map((m) => {
    noms.set(String(m.id), m.nomIC || String(m.id));
    return { id: String(m.id), nom: m.nomIC || String(m.id) };
  });
  type Raw = Record<string, unknown>;
  const portefeuilles: Portefeuille[] = walletR.error ? [] : ((walletR.data || []) as Raw[]).map((w) => ({
    id: String(w.id), nom: noms.get(String(w.id)) || String(w.id), solde: Number(w.solde) || 0,
    historique: Array.isArray(w.historique) ? (w.historique as MvtPerso[]).slice(-15).reverse() : [],
  }));
  const transactions: Transaction[] = txR.error ? [] : ((txR.data || []) as Raw[]).map((t) => ({
    id: String(t.id), sens: (t.sens as string) || "entree", montant: Number(t.montant) || 0,
    poste: (t.poste as string) ?? null, motif: (t.motif as string) ?? null, auteur: (t.auteur as string) ?? null, createdAt: (t.createdAt as string) ?? null,
  }));
  const total = portefeuilles.reduce((s, w) => s + w.solde, 0);
  return { connecte: true, portefeuilles, transactions, membres, total };
}
