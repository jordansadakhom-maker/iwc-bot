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

// ID Discord du membre connecté (pour les ponts avec le bot, ex. la carte).
export async function getSessionDiscordId(): Promise<string | null> {
  if (!authConfigured()) return null;
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const discordId = (meta.provider_id || meta.sub || "") as string;
    return discordId ? String(discordId) : null;
  } catch { return null; }
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
  contrat: { statut: string; commanditaire: string | null; sens: string | null; envoyeAt: string | null; signeAt: string | null } | null;
};
export type ContratDetail = {
  id: string; cible: string; commanditaire: string | null; statut: string; pole: string;
  remuneration: string | null; motif: string | null; agentsNoms: string[]; createdAt: string | null;
  suivi: string | null; remuVerseAuCoffre: number | null;
  categorie: string | null; risque: string | null; echeance: string | null;
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
      contrat: (o.contrat && typeof o.contrat === "object") ? (o.contrat as OpDetail["contrat"]) : null,
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
        categorie: (c.categorie as string) ?? null,
        risque: (c.risque as string) ?? null,
        echeance: (c.echeance as string) ?? null,
      };
    });

  const membresLite: MembreLite[] = ((membresR.data || []) as { id: string; nomIC: string }[]).map((m) => ({ id: String(m.id), nom: m.nomIC || String(m.id) }));
  return { connecte: true, pole, operations: board, contrats, membres: membresLite };
}

// ── Membres & RH (page dédiée) ───────────────────────────────────
// Fiche RH : champ SITE-NATIVE porté par la table Membre, JAMAIS écrit par le
// bot (il ne l'envoie pas dans sa synchro → jamais écrasé). Édité depuis le site.
export type FicheRH = { specialite?: string; statutInterne?: string; salaire?: number; notes?: string; medecin?: boolean };
export type MembreDetail = { id: string; nomIC: string; grade: string | null; pole: string; statut: string; ficheRH: FicheRH | null };
export type MembresData = { connecte: boolean; membres: MembreDetail[] };

export async function getMembres(): Promise<MembresData> {
  if (!dataConfigured()) return { connecte: false, membres: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, membres: [] };
  // Sélection résiliente : si la colonne « ficheRH » n'existe pas encore
  // (migration SQL non passée), on retombe sur la sélection de base → la page
  // ne casse jamais.
  let rows: Record<string, unknown>[] | null = null;
  const avec = await supabase.from("Membre").select("id,nomIC,grade,pole,statut,ficheRH").order("nomIC", { ascending: true });
  if (avec.error) {
    const base = await supabase.from("Membre").select("id,nomIC,grade,pole,statut").order("nomIC", { ascending: true });
    if (base.error) return { connecte: false, membres: [] };
    rows = (base.data || []) as Record<string, unknown>[];
  } else {
    rows = (avec.data || []) as Record<string, unknown>[];
  }
  const membres: MembreDetail[] = rows.map((m) => ({
    id: String(m.id), nomIC: String(m.nomIC || ""), grade: (m.grade as string) ?? null,
    pole: String(m.pole || ""), statut: String(m.statut || ""),
    ficheRH: (m.ficheRH && typeof m.ficheRH === "object") ? (m.ficheRH as FicheRH) : null,
  }));
  return { connecte: true, membres };
}

// ── Absences (page dédiée) ───────────────────────────────────────
// Reflet du panneau Discord #absences. La colonne « absence » (site + bot) porte
// le détail { jusqu, raison, depuis, programmee }. Sélection résiliente : si la
// colonne n'existe pas encore, on retombe sur le seul statut « absent ».
export type AbsenceDetail = {
  jusqu: string | null; raison: string | null; depuis: string | null;
  programmee: { debut: string | null; fin: string | null; raison: string | null } | null;
};
export type MembreAbsence = { id: string; nom: string; grade: string | null; pole: string; statut: string; absence: AbsenceDetail | null };
export type AbsencesData = { connecte: boolean; absents: MembreAbsence[]; programmees: MembreAbsence[]; tous: MembreLite[] };

export async function getAbsences(): Promise<AbsencesData> {
  const vide: AbsencesData = { connecte: false, absents: [], programmees: [], tous: [] };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  let rows: Record<string, unknown>[] | null = null;
  const avec = await supabase.from("Membre").select("id,nomIC,grade,pole,statut,absence").order("nomIC", { ascending: true });
  if (avec.error) {
    const base = await supabase.from("Membre").select("id,nomIC,grade,pole,statut").order("nomIC", { ascending: true });
    if (base.error) return vide;
    rows = (base.data || []) as Record<string, unknown>[];
  } else {
    rows = (avec.data || []) as Record<string, unknown>[];
  }
  const norm = (m: Record<string, unknown>): MembreAbsence => {
    const a = (m.absence && typeof m.absence === "object") ? (m.absence as Record<string, unknown>) : null;
    const p = a && a.programmee && typeof a.programmee === "object" ? (a.programmee as Record<string, unknown>) : null;
    return {
      id: String(m.id), nom: String(m.nomIC || m.id), grade: (m.grade as string) ?? null,
      pole: String(m.pole || ""), statut: String(m.statut || ""),
      absence: a ? {
        jusqu: (a.jusqu as string) || null, raison: (a.raison as string) || null, depuis: (a.depuis as string) || null,
        programmee: p ? { debut: (p.debut as string) || null, fin: (p.fin as string) || null, raison: (p.raison as string) || null } : null,
      } : null,
    };
  };
  const membres = rows.filter((m) => String(m.statut || "") !== "parti").map(norm);
  const absents = membres.filter((m) => m.statut === "absent")
    .sort((a, b) => (a.absence?.jusqu || "~").localeCompare(b.absence?.jusqu || "~"));
  const programmees = membres.filter((m) => m.statut !== "absent" && m.absence?.programmee)
    .sort((a, b) => (a.absence?.programmee?.debut || "").localeCompare(b.absence?.programmee?.debut || ""));
  const tous: MembreLite[] = membres.map((m) => ({ id: m.id, nom: m.nom }));
  return { connecte: true, absents, programmees, tous };
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
    // nomRP (importé / patient non-membre) prioritaire, sinon nom du membre.
    nom: (d.nomRP as string) || noms.get(String(d.membreId)) || String(d.membreId) || "Patient",
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
export type RdvItem = { id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null; statut: string; source: string | null; lieuPhoto: string | null; assignes: string[]; duree: string | null; contact: string | null; message: string | null };
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
    supabase.from("Rdv").select("id,nomRP,type,lieu,creneau,statut,paiement").neq("statut", "cloture").order("createdAt", { ascending: false }).limit(100),
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
      duree: (p.duree as string) ?? null, contact: (p.contact as string) ?? null, message: (p.message as string) ?? null,
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
  assignes: string[]; lieuPhoto: string | null; duree: string | null;
};
export type CommunicationData = { connecte: boolean; rdvs: RdvComm[]; membres: MembreLite[] };

export async function getCommunication(): Promise<CommunicationData> {
  if (!dataConfigured()) return { connecte: false, rdvs: [], membres: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, rdvs: [], membres: [] };
  const [rdvR, membreR] = await Promise.all([
    supabase.from("Rdv").select("id,nomRP,type,lieu,creneau,statut,paiement,createdAt").neq("statut", "cloture").order("createdAt", { ascending: false }).limit(200),
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
      duree: (p.duree as string) ?? null,
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
  source: "discord" | "web"; contact: string | null;
};
export type TelegrammesData = { connecte: boolean; telegrammes: TelegrammeItem[] };

export async function getTelegrammes(): Promise<TelegrammesData> {
  if (!dataConfigured()) return { connecte: false, telegrammes: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, telegrammes: [] };
  type Raw = Record<string, unknown>;
  const [discR, webR] = await Promise.all([
    supabase.from("Telegramme").select("*").order("updatedAt", { ascending: false }).limit(100),
    supabase.from("TelegrammeWeb").select("*").order("createdAt", { ascending: false }).limit(60),
  ]);
  const discord: TelegrammeItem[] = discR.error ? [] : ((discR.data || []) as Raw[]).map((t) => ({
    id: String(t.id),
    clientId: (t.clientId as string) ?? null,
    clientNom: (t.clientNom as string) || "Client",
    statut: (t.statut as string) || "ouvert",
    messages: Array.isArray(t.messages) ? (t.messages as TgMessage[]) : [],
    rdvCree: !!t.rdvCree,
    createdAt: (t.createdAt as string) ?? null,
    updatedAt: (t.updatedAt as string) ?? null,
    source: "discord", contact: null,
  }));
  // Télégrammes envoyés depuis le site (message + réponses de l'équipe = trace).
  const web: TelegrammeItem[] = webR.error ? [] : ((webR.data || []) as Raw[]).map((t) => {
    const reps = Array.isArray(t.reponses) ? (t.reponses as { texte?: string; par?: string; at?: number }[]) : [];
    const messages: TgMessage[] = [
      { from: "client", content: (t.message as string) || "", at: t.createdAt ? new Date(t.createdAt as string).getTime() : undefined },
      ...reps.map((r) => ({ from: "equipe", name: r.par, content: r.texte, at: r.at })),
    ];
    return {
      id: `web-${String(t.id)}`, clientId: null, clientNom: (t.nom as string) || "Client",
      statut: (t.statut as string) === "clos" ? "cloture" : "ouvert", messages,
      rdvCree: false, createdAt: (t.createdAt as string) ?? null, updatedAt: (t.createdAt as string) ?? null,
      source: "web", contact: (t.contact as string) ?? null,
    };
  });
  const telegrammes = [...discord, ...web].sort((a, b) => (b.updatedAt || "").localeCompare(a.updatedAt || ""));
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

// ── Centre de notifications : flux réel agrégé ───────────────────
export type FeedItem = {
  id: string; type: string; icon: string; titre: string; detail: string;
  at: string | null; lien: string; tone: "accent" | "good" | "warn" | "muted" | "oxblood";
};
export type FeedData = { connecte: boolean; items: FeedItem[] };

export async function getNotificationsFeed(): Promise<FeedData> {
  if (!dataConfigured()) return { connecte: false, items: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, items: [] };
  const [tgR, rdvR, factR, opR] = await Promise.all([
    supabase.from("Telegramme").select("*").order("updatedAt", { ascending: false }).limit(60),
    supabase.from("Rdv").select("id,nomRP,type,creneau,statut,paiement,createdAt").order("createdAt", { ascending: false }).limit(40),
    supabase.from("Facture").select("*").order("createdAt", { ascending: false }).limit(20),
    supabase.from("Operation").select("id,cible,phase,updatedAt").order("updatedAt", { ascending: false }).limit(20),
  ]);
  type Raw = Record<string, unknown>;
  const items: FeedItem[] = [];

  // Télégrammes : chaque conversation + son dernier message + état (ouvert / clôturé).
  if (!tgR.error) for (const t of (tgR.data || []) as Raw[]) {
    const msgs = Array.isArray(t.messages) ? (t.messages as { from?: string; content?: string }[]) : [];
    const dernier = [...msgs].reverse().find((m) => m.content);
    const clos = /clotur|classe/i.test(String(t.statut || ""));
    items.push({
      id: `tg-${t.id}`, type: clos ? "telegramme-clos" : "telegramme", icon: clos ? "📁" : "✉️",
      titre: `Télégramme — ${(t.clientNom as string) || "Client"}${clos ? " (clôturé)" : ""}`,
      detail: dernier?.content ? `${dernier.from === "equipe" ? "Nous : " : ""}${dernier.content.slice(0, 120)}` : `${msgs.length} message(s)`,
      at: (t.updatedAt as string) || (t.createdAt as string) || null, lien: "/communication", tone: clos ? "muted" : "warn",
    });
  }
  // Rendez-vous reçus (site / télégramme).
  if (!rdvR.error) for (const r of (rdvR.data || []) as Raw[]) {
    const p = (r.paiement || {}) as Record<string, unknown>;
    const src = (p.source as string) || "";
    if (src !== "web" && src !== "telegramme") continue;
    items.push({
      id: `rdv-${r.id}`, type: "rdv", icon: "📅", titre: `Demande de RDV — ${(r.nomRP as string) || "Client"}`,
      detail: [r.type, r.creneau, p.duree].filter(Boolean).join(" · ") || "Nouvelle demande",
      at: (r.createdAt as string) || null, lien: "/communication", tone: "accent",
    });
  }
  // Factures créées.
  if (!factR.error) for (const f of (factR.data || []) as Raw[]) {
    items.push({
      id: `fac-${f.id}`, type: "facture", icon: "🧾", titre: `Facture ${(f.numero as string) || ""}`.trim(),
      detail: `${(f.objet as string) || "Prestation"} · ${(Number(f.montant) || 0).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}$`,
      at: (f.createdAt as string) || null, lien: "/finances", tone: "good",
    });
  }
  // Opérations terminées récemment.
  if (!opR.error) for (const o of (opR.data || []) as Raw[]) {
    if (String(o.phase) !== "terminee") continue;
    items.push({
      id: `op-${o.id}`, type: "operation", icon: "🎯", titre: `Opération terminée — ${(o.cible as string) || "Opération"}`,
      detail: "Clôturée", at: (o.updatedAt as string) || null, lien: "/operations", tone: "good",
    });
  }

  items.sort((a, b) => (b.at || "").localeCompare(a.at || ""));
  return { connecte: true, items: items.slice(0, 80) };
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

// ── Armurerie de Van Horn (comptoir : clients, ventes, contrats) ──
export type ArmClient = { id: string; nom: string; telegramme: string | null; discordId: string | null; carteIdentite: string | null; statut: string; notes: string | null; createdAt: string | null };
export type ArmVente = { id: string; clientId: string | null; acquereur: string; dateVente: string | null; marque: string | null; modele: string | null; categorie: string | null; numeroSerie: string | null; vendeur: string | null; telegramme: string | null; prix: number; quantite: number; prixUnitaire: number; notes: string | null; statut: string; photo: string | null; ticket: string | null; createdAt: string | null };
export type ArmContrat = { id: string; clientId: string | null; clientNom: string; clientDiscordId: string | null; arme: string | null; numeroSerie: string | null; prix: number; conditions: string | null; statut: string; envoyeAt: string | null; signeAt: string | null; createdAt: string | null };
export type ArmMouvement = { id: string; sens: string; montant: number; motif: string | null; auteur: string | null; nature: string | null; createdAt: string | null };
export type ArmRecetteLigne = { ingredient: string; qte: number };
export type ArmProduit = { id: string; nom: string; categorie: string; prix: number; cout: number; stock: number; aLaDemande: boolean; niveau: number; recette: ArmRecetteLigne[] };
export type ArmEmploye = { id: string; nom: string; discordId: string | null; role: string | null; commission: number; salaireBase: number; actif: boolean; createdAt: string | null };
export type ArmPointage = { id: string; employeId: string | null; employeNom: string; debut: string | null; fin: string | null; minutes: number; createdAt: string | null };
export type ArmPaie = { id: string; employeId: string | null; employeNom: string; periode: string | null; ventes: number; commission: number; base: number; prime: number; montant: number; statut: string; notes: string | null; payeAt: string | null; createdAt: string | null };
export type ArmImpot = { id: string; libelle: string | null; debut: string | null; fin: string | null; chiffreAffaires: number; taux: number; montant: number; statut: string; payeAt: string | null; notes: string | null; createdAt: string | null };
export type ArmNote = { id: string; titre: string | null; contenu: string; epingle: boolean; auteur: string | null; createdAt: string | null; updatedAt: string | null };
export type ArmTache = { id: string; texte: string; fait: boolean; assigneA: string | null; auteur: string | null; createdAt: string | null };
export type ArmCommandeLigne = { objet: string; qte: number; prixUnitaire: number };
export type ArmCommande = { id: string; categorie: string | null; clientNom: string; clientPrenom: string | null; lignes: ArmCommandeLigne[]; total: number; statut: string; notes: string | null; createdAt: string | null };
export type ArmRessource = { id: string; nom: string; categorie: string; prix: number; mine: boolean; stock: number };
export type ArmRdv = { id: string; clientPrenom: string | null; clientNom: string; telegramme: string | null; carteIdentite: string | null; commande: string | null; lieu: string | null; dateRdv: string | null; notes: string | null; statut: string; createdAt: string | null };
export type ArmurerieData = { connecte: boolean; clients: ArmClient[]; ventes: ArmVente[]; contrats: ArmContrat[]; ca: number; coffre: number; mouvementsCoffre: ArmMouvement[]; produits: ArmProduit[]; employes: ArmEmploye[]; pointages: ArmPointage[]; paies: ArmPaie[]; impots: ArmImpot[]; notes: ArmNote[]; taches: ArmTache[]; commandes: ArmCommande[]; ressources: ArmRessource[]; rdvs: ArmRdv[] };

export async function getArmurerie(): Promise<ArmurerieData> {
  const vide: ArmurerieData = { connecte: false, clients: [], ventes: [], contrats: [], ca: 0, coffre: 0, mouvementsCoffre: [], produits: [], employes: [], pointages: [], paies: [], impots: [], notes: [], taches: [], commandes: [], ressources: [], rdvs: [] };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const [clientR, venteR, contratR, coffreR, mvtR, prodR, empR, ptgR, paieR, impR, noteR, tacheR, cmdR, ressR, rdvR] = await Promise.all([
    supabase.from("ArmurerieClient").select("*").order("nom", { ascending: true }),
    supabase.from("ArmurerieVente").select("*").order("createdAt", { ascending: false }).limit(500),
    supabase.from("ArmurerieContrat").select("*").order("createdAt", { ascending: false }).limit(300),
    supabase.from("ArmurerieCoffre").select("solde").eq("id", "vanhorn").maybeSingle(),
    supabase.from("ArmurerieMouvementCoffre").select("*").order("createdAt", { ascending: false }).limit(400),
    supabase.from("ArmurerieProduit").select("*").order("nom", { ascending: true }),
    supabase.from("ArmurerieEmploye").select("*").order("nom", { ascending: true }),
    supabase.from("ArmureriePointage").select("*").order("debut", { ascending: false }).limit(200),
    supabase.from("ArmureriePaie").select("*").order("createdAt", { ascending: false }).limit(200),
    supabase.from("ArmurerieImpot").select("*").order("createdAt", { ascending: false }).limit(100),
    supabase.from("ArmurerieNote").select("*").order("updatedAt", { ascending: false }).limit(100),
    supabase.from("ArmurerieTache").select("*").order("createdAt", { ascending: false }).limit(200),
    supabase.from("ArmurerieCommande").select("*").order("createdAt", { ascending: false }).limit(200),
    supabase.from("ArmurerieRessource").select("*").order("prix", { ascending: true }),
    supabase.from("ArmurerieRdv").select("*").order("dateRdv", { ascending: true }).limit(300),
  ]);
  // Tables neuves : si absentes (400/404), on renvoie « connecté » avec des listes vides.
  type Raw = Record<string, unknown>;
  const clients: ArmClient[] = clientR.error ? [] : ((clientR.data || []) as Raw[]).map((c) => ({
    id: String(c.id), nom: (c.nom as string) || "Client", telegramme: (c.telegramme as string) ?? null,
    discordId: (c.discordId as string) ?? null, carteIdentite: (c.carteIdentite as string) ?? null,
    statut: (c.statut as string) || "actif", notes: (c.notes as string) ?? null, createdAt: (c.createdAt as string) ?? null,
  }));
  const ventes: ArmVente[] = venteR.error ? [] : ((venteR.data || []) as Raw[]).map((v) => ({
    id: String(v.id), clientId: (v.clientId as string) ?? null, acquereur: (v.acquereur as string) || "—",
    dateVente: (v.dateVente as string) ?? null, marque: (v.marque as string) ?? null, modele: (v.modele as string) ?? null,
    categorie: (v.categorie as string) ?? null, numeroSerie: (v.numeroSerie as string) ?? null, vendeur: (v.vendeur as string) ?? null,
    telegramme: (v.telegramme as string) ?? null, prix: Number(v.prix) || 0, notes: (v.notes as string) ?? null,
    quantite: Number(v.quantite) > 0 ? Math.round(Number(v.quantite)) : 1,
    prixUnitaire: v.prixUnitaire != null ? Number(v.prixUnitaire) || 0 : (Number(v.quantite) > 0 ? Math.round((Number(v.prix) || 0) / Number(v.quantite) * 100) / 100 : Number(v.prix) || 0),
    statut: (v.statut as string) || "enregistree", photo: (v.photo as string) ?? null, ticket: (v.ticket as string) ?? null, createdAt: (v.createdAt as string) ?? null,
  }));
  const contrats: ArmContrat[] = contratR.error ? [] : ((contratR.data || []) as Raw[]).map((c) => ({
    id: String(c.id), clientId: (c.clientId as string) ?? null, clientNom: (c.clientNom as string) || "Client",
    clientDiscordId: (c.clientDiscordId as string) ?? null, arme: (c.arme as string) ?? null, numeroSerie: (c.numeroSerie as string) ?? null,
    prix: Number(c.prix) || 0, conditions: (c.conditions as string) ?? null, statut: (c.statut as string) || "brouillon",
    envoyeAt: (c.envoyeAt as string) ?? null, signeAt: (c.signeAt as string) ?? null, createdAt: (c.createdAt as string) ?? null,
  }));
  const ca = ventes.reduce((s, v) => s + v.prix, 0);
  const coffre = coffreR.error || !coffreR.data ? 0 : Number((coffreR.data as { solde: number }).solde) || 0;
  const mouvementsCoffre: ArmMouvement[] = mvtR.error ? [] : ((mvtR.data || []) as Raw[]).map((m) => ({
    id: String(m.id), sens: (m.sens as string) || "entree", montant: Number(m.montant) || 0,
    motif: (m.motif as string) ?? null, auteur: (m.auteur as string) ?? null, nature: (m.nature as string) ?? null, createdAt: (m.createdAt as string) ?? null,
  }));
  const produits: ArmProduit[] = prodR.error ? [] : ((prodR.data || []) as Raw[]).map((p) => ({
    id: String(p.id), nom: (p.nom as string) || "Produit", categorie: (p.categorie as string) || "Divers",
    prix: Number(p.prix) || 0, cout: Number(p.cout) || 0, stock: Number(p.stock) || 0, aLaDemande: !!p.aLaDemande, niveau: Number(p.niveau) || 0,
    recette: Array.isArray(p.recette) ? (p.recette as ArmRecetteLigne[]).map((l) => ({ ingredient: String(l.ingredient || ""), qte: Number(l.qte) || 0 })) : [],
  }));
  const employes: ArmEmploye[] = empR.error ? [] : ((empR.data || []) as Raw[]).map((e) => ({
    id: String(e.id), nom: (e.nom as string) || "Employé", discordId: (e.discordId as string) ?? null,
    role: (e.role as string) ?? null, commission: Number(e.commission) || 0, salaireBase: Number(e.salaireBase) || 0,
    actif: e.actif !== false, createdAt: (e.createdAt as string) ?? null,
  }));
  const pointages: ArmPointage[] = ptgR.error ? [] : ((ptgR.data || []) as Raw[]).map((p) => ({
    id: String(p.id), employeId: (p.employeId as string) ?? null, employeNom: (p.employeNom as string) || "—",
    debut: (p.debut as string) ?? null, fin: (p.fin as string) ?? null, minutes: Number(p.minutes) || 0, createdAt: (p.createdAt as string) ?? null,
  }));
  const paies: ArmPaie[] = paieR.error ? [] : ((paieR.data || []) as Raw[]).map((p) => ({
    id: String(p.id), employeId: (p.employeId as string) ?? null, employeNom: (p.employeNom as string) || "—",
    periode: (p.periode as string) ?? null, ventes: Number(p.ventes) || 0, commission: Number(p.commission) || 0,
    base: Number(p.base) || 0, prime: Number(p.prime) || 0, montant: Number(p.montant) || 0,
    statut: (p.statut as string) || "du", notes: (p.notes as string) ?? null, payeAt: (p.payeAt as string) ?? null, createdAt: (p.createdAt as string) ?? null,
  }));
  const impots: ArmImpot[] = impR.error ? [] : ((impR.data || []) as Raw[]).map((i) => ({
    id: String(i.id), libelle: (i.libelle as string) ?? null, debut: (i.debut as string) ?? null, fin: (i.fin as string) ?? null,
    chiffreAffaires: Number(i.chiffreAffaires) || 0, taux: Number(i.taux) || 0, montant: Number(i.montant) || 0,
    statut: (i.statut as string) || "du", payeAt: (i.payeAt as string) ?? null, notes: (i.notes as string) ?? null, createdAt: (i.createdAt as string) ?? null,
  }));
  const notes: ArmNote[] = noteR.error ? [] : ((noteR.data || []) as Raw[]).map((n) => ({
    id: String(n.id), titre: (n.titre as string) ?? null, contenu: (n.contenu as string) || "", epingle: !!n.epingle,
    auteur: (n.auteur as string) ?? null, createdAt: (n.createdAt as string) ?? null, updatedAt: (n.updatedAt as string) ?? null,
  }));
  const taches: ArmTache[] = tacheR.error ? [] : ((tacheR.data || []) as Raw[]).map((t) => ({
    id: String(t.id), texte: (t.texte as string) || "", fait: !!t.fait, assigneA: (t.assigneA as string) ?? null,
    auteur: (t.auteur as string) ?? null, createdAt: (t.createdAt as string) ?? null,
  }));
  const commandes: ArmCommande[] = cmdR.error ? [] : ((cmdR.data || []) as Raw[]).map((c) => ({
    id: String(c.id), categorie: (c.categorie as string) ?? null, clientNom: (c.clientNom as string) || "Client",
    clientPrenom: (c.clientPrenom as string) ?? null,
    lignes: Array.isArray(c.lignes) ? (c.lignes as ArmCommandeLigne[]).map((l) => ({ objet: String(l.objet || ""), qte: Number(l.qte) || 0, prixUnitaire: Number(l.prixUnitaire) || 0 })) : [],
    total: Number(c.total) || 0, statut: (c.statut as string) || "en_attente", notes: (c.notes as string) ?? null, createdAt: (c.createdAt as string) ?? null,
  }));
  const ressources: ArmRessource[] = ressR.error ? [] : ((ressR.data || []) as Raw[]).map((r) => ({
    id: String(r.id), nom: (r.nom as string) || "Ressource", categorie: (r.categorie as string) || "Divers", prix: Number(r.prix) || 0, mine: !!r.mine, stock: Number(r.stock) || 0,
  }));
  const rdvs: ArmRdv[] = rdvR.error ? [] : ((rdvR.data || []) as Raw[]).map((r) => ({
    id: String(r.id), clientPrenom: (r.clientPrenom as string) ?? null, clientNom: (r.clientNom as string) || "Client",
    telegramme: (r.telegramme as string) ?? null, carteIdentite: (r.carteIdentite as string) ?? null,
    commande: (r.commande as string) ?? null, lieu: (r.lieu as string) ?? null, dateRdv: (r.dateRdv as string) ?? null,
    notes: (r.notes as string) ?? null, statut: (r.statut as string) || "a_venir", createdAt: (r.createdAt as string) ?? null,
  }));
  const connecte = !(clientR.error && venteR.error && contratR.error) || dataConfigured();
  return { connecte, clients, ventes, contrats, ca, coffre, mouvementsCoffre, produits, employes, pointages, paies, impots, notes, taches, commandes, ressources, rdvs };
}

// ── Vitrine publique de l'armurerie de Van Horn (tarifs, lecture seule) ──
// N'expose QUE ce qui est vendable : nom, catégorie, prix, disponibilité.
// Aucune donnée interne (coût, marge, clients, stock chiffré, recettes).
export type BoutiqueItem = { nom: string; categorie: string; prix: number; dispo: "stock" | "commande" };
export type BoutiqueData = { connecte: boolean; items: BoutiqueItem[] };
export async function getArmurerieBoutique(): Promise<BoutiqueData> {
  if (!dataConfigured()) return { connecte: false, items: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, items: [] };
  const { data, error } = await supabase.from("ArmurerieProduit").select("nom,categorie,prix,stock,aLaDemande").order("categorie", { ascending: true }).order("nom", { ascending: true });
  if (error) return { connecte: false, items: [] };
  const items: BoutiqueItem[] = ((data || []) as Record<string, unknown>[])
    .map((p) => ({
      nom: String(p.nom || "").trim(),
      categorie: String(p.categorie || "Divers").trim() || "Divers",
      prix: Number(p.prix) || 0,
      dispo: (!p.aLaDemande && (Number(p.stock) || 0) > 0 ? "stock" : "commande") as "stock" | "commande",
    }))
    .filter((i) => i.nom);
  return { connecte: true, items };
}

// ── Recrutement (candidatures déposées sur /rejoindre) ───────────
export type CandidatureItem = { id: string; nomRP: string; age: string | null; moyen: string | null; contact: string | null; experience: string | null; motivation: string | null; disponibilites: string | null; statut: string; notes: string | null; createdAt: string | null };
export type CandidaturesData = { connecte: boolean; candidatures: CandidatureItem[] };

export async function getCandidatures(): Promise<CandidaturesData> {
  if (!dataConfigured()) return { connecte: false, candidatures: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, candidatures: [] };
  const { data, error } = await supabase.from("Candidature").select("*").order("createdAt", { ascending: false }).limit(300);
  if (error) return { connecte: true, candidatures: [] };
  const candidatures: CandidatureItem[] = ((data || []) as Record<string, unknown>[]).map((c) => ({
    id: String(c.id), nomRP: (c.nomRP as string) || "Candidat", age: (c.age as string) ?? null,
    moyen: (c.moyen as string) ?? null, contact: (c.contact as string) ?? null, experience: (c.experience as string) ?? null,
    motivation: (c.motivation as string) ?? null, disponibilites: (c.disponibilites as string) ?? null,
    statut: (c.statut as string) || "nouveau", notes: (c.notes as string) ?? null, createdAt: (c.createdAt as string) ?? null,
  }));
  return { connecte: true, candidatures };
}

// ── Finances (page dédiée) ───────────────────────────────────────
export type FinancesData = { connecte: boolean; pole: PoleWeb; coffres: { commun: number | null; legal: number | null; illegal: number | null; vanhorn: number | null } };

export async function getFinances(): Promise<FinancesData> {
  const pole = await getPole();
  const vide: FinancesData = { connecte: false, pole, coffres: { commun: null, legal: null, illegal: null, vanhorn: null } };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const [coffreR, vhR] = await Promise.all([
    supabase.from("Coffre").select("id,solde"),
    supabase.from("ArmurerieCoffre").select("solde").eq("id", "vanhorn").maybeSingle(),
  ]);
  if (coffreR.error) return vide;
  const find = (id: string) => (coffreR.data || []).find((c: { id: string; solde: number }) => c.id === id)?.solde ?? null;
  const vanhorn = vhR.error || !vhR.data ? null : Number((vhR.data as { solde: number }).solde) || 0;
  return { connecte: true, pole, coffres: { commun: find("coffre_commun"), legal: find("coffre_legal"), illegal: find("coffre_illegal"), vanhorn } };
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

// ── Vitrine publique (page de couverture) ────────────────────────
// Quelques chiffres RÉELS pour donner vie à la page d'accueil, sans rien
// inventer. Lecture via la clé service (aucune session requise). Si la base
// n'est pas prête, les compteurs valent null → la page masque simplement la stat.
export type VitrineData = { membres: number | null; operations: number | null; armes: number | null };
export async function getVitrine(): Promise<VitrineData> {
  const admin = createAdminClient();
  // Chiffres affichés sur la couverture. Le MEMBRES est le chiffre déclaré par
  // le Fondateur (la base compte aussi des visiteurs de passage, non
  // représentatifs de « la meute ») ; il vaut MEMBRES_MEUTE par défaut et reste
  // ajustable sans toucher au code via NEXT_PUBLIC_VITRINE_MEMBRES. Les
  // opérations et armes viennent, elles, directement de la base.
  const MEMBRES_MEUTE = 7;
  const envNum = (n: string): number | undefined => {
    const v = process.env[n];
    if (v == null || v === "") return undefined;
    const x = parseInt(v, 10);
    return Number.isFinite(x) && x >= 0 ? x : undefined;
  };
  const oMembres = envNum("NEXT_PUBLIC_VITRINE_MEMBRES");
  const oOps = envNum("NEXT_PUBLIC_VITRINE_OPERATIONS");
  const oArmes = envNum("NEXT_PUBLIC_VITRINE_ARMES");
  if (!admin) return { membres: oMembres ?? MEMBRES_MEUTE, operations: oOps ?? null, armes: oArmes ?? null };
  async function compte(table: string): Promise<number | null> {
    try {
      const { count, error } = await admin!.from(table).select("*", { count: "exact", head: true });
      return error ? null : (typeof count === "number" ? count : null);
    } catch { return null; }
  }
  const [operations, armes] = await Promise.all([compte("Operation"), compte("Arme")]);
  return {
    membres: oMembres ?? MEMBRES_MEUTE,
    operations: oOps ?? operations,
    armes: oArmes ?? armes,
  };
}

// ── Alertes actionnables (cloche du header) ──────────────────────
// Ce qui demande une action de ta part, agrégé en compteurs. Remplace les
// pings Discord : tout t'attend sur le site. Compté via la clé service.
export type Alerte = { key: string; label: string; count: number; href: string; tone: "warn" | "oxblood" | "accent" | "good" };
export type AlertesData = { total: number; items: Alerte[] };
export async function getAlertes(): Promise<AlertesData> {
  const admin = createAdminClient();
  if (!admin) return { total: 0, items: [] };
  const safe = async (fn: () => PromiseLike<{ count: number | null; error: unknown }>): Promise<number> => {
    try { const { count, error } = await fn(); return error ? 0 : (count ?? 0); } catch { return 0; }
  };
  const iso7 = new Date(Date.now() - 7 * 86400000).toISOString();
  const nowIso = new Date().toISOString();
  const iso24 = new Date(Date.now() + 24 * 86400000).toISOString(); // fenêtre « dans les 24 h »
  const [contrats, impots, paies, ruptures, candids, rdvs, telegrammes, rdvArm] = await Promise.all([
    safe(() => admin.from("ArmurerieContrat").select("*", { count: "exact", head: true }).eq("statut", "envoye")),
    safe(() => admin.from("ArmurerieImpot").select("*", { count: "exact", head: true }).neq("statut", "paye")),
    safe(() => admin.from("ArmureriePaie").select("*", { count: "exact", head: true }).neq("statut", "paye")),
    safe(() => admin.from("ArmurerieProduit").select("*", { count: "exact", head: true }).lte("stock", 0).eq("aLaDemande", false)),
    safe(() => admin.from("Candidature").select("*", { count: "exact", head: true }).gte("createdAt", iso7)),
    safe(() => admin.from("Rdv").select("*", { count: "exact", head: true }).eq("statut", "nouveau")),
    safe(() => admin.from("TelegrammeWeb").select("*", { count: "exact", head: true }).gte("createdAt", iso7)),
    safe(() => admin.from("ArmurerieRdv").select("*", { count: "exact", head: true }).eq("statut", "a_venir").gte("dateRdv", nowIso).lte("dateRdv", iso24)),
  ]);
  // Le href pointe vers la ZONE exacte à regarder : onglet précis de l'armurerie
  // (?tab=…) ou ancre de la page communication (#…) → highlight à l'arrivée.
  const items: Alerte[] = [];
  if (rdvArm) items.push({ key: "rdvArm", label: `${rdvArm} rendez-vous armurerie dans les 24 h`, count: rdvArm, href: "/armurerie?tab=rdv", tone: "warn" });
  if (rdvs) items.push({ key: "rdvs", label: `${rdvs} rendez-vous à traiter`, count: rdvs, href: "/communication#rdv-clients", tone: "warn" });
  if (contrats) items.push({ key: "contrats", label: `${contrats} contrat(s) en attente de signature`, count: contrats, href: "/armurerie?tab=contrats", tone: "accent" });
  if (impots) items.push({ key: "impots", label: `${impots} impôt(s) à régler`, count: impots, href: "/armurerie?tab=impots", tone: "oxblood" });
  if (paies) items.push({ key: "paies", label: `${paies} paie(s) à verser`, count: paies, href: "/armurerie?tab=paies", tone: "warn" });
  if (ruptures) items.push({ key: "ruptures", label: `${ruptures} produit(s) en rupture de stock`, count: ruptures, href: "/armurerie?tab=produits", tone: "oxblood" });
  if (candids) items.push({ key: "candids", label: `${candids} candidature(s) récente(s)`, count: candids, href: "/recrutement", tone: "good" });
  if (telegrammes) items.push({ key: "telegrammes", label: `${telegrammes} télégramme(s) récent(s)`, count: telegrammes, href: "/communication#telegrammes", tone: "accent" });
  const total = items.reduce((s, i) => s + i.count, 0);
  return { total, items };
}

// ── Rapports de terrain (historique des captures « Son du jeu » / « Ma voix ») ──
export type RapportTerrain = { id: string; agent: string | null; cible: string | null; lieu: string | null; priorite: string; texte: string | null; resume: string | null; source: string; createdAt: string | null };
export async function getRapportsTerrain(): Promise<RapportTerrain[]> {
  const admin = createAdminClient();
  if (!admin) return [];
  const { data, error } = await admin.from("RapportTerrain").select("*").order("createdAt", { ascending: false }).limit(200);
  if (error) return []; // table pas encore créée → liste vide (aucun crash)
  type Raw = Record<string, unknown>;
  return ((data || []) as Raw[]).map((r) => ({
    id: String(r.id), agent: (r.agent as string) ?? null, cible: (r.cible as string) ?? null,
    lieu: (r.lieu as string) ?? null, priorite: (r.priorite as string) || "normale",
    texte: (r.texte as string) ?? null, resume: (r.resume as string) ?? null,
    source: (r.source as string) || "jeu", createdAt: (r.createdAt as string) ?? null,
  }));
}

// ── Journal de bord : rendez-vous CLÔTURÉS (historique / suivi complet) ──
export type JournalRdv = {
  id: string; nomRP: string | null; type: string | null; lieu: string | null; creneau: string | null;
  source: string | null; assignes: string[]; resultat: string | null; reponses: Reponse[];
  closedAt: string | null; closedBy: string | null; createdAt: string | null;
};
export type JournalData = { connecte: boolean; rdvs: JournalRdv[] };
export async function getJournal(): Promise<JournalData> {
  if (!dataConfigured()) return { connecte: false, rdvs: [] };
  const supabase = createAdminClient();
  if (!supabase) return { connecte: false, rdvs: [] };
  const { data, error } = await supabase.from("Rdv").select("id,nomRP,type,lieu,creneau,statut,paiement,createdAt").eq("statut", "cloture").limit(500);
  if (error) return { connecte: false, rdvs: [] };
  type Row = Record<string, unknown>;
  const rdvs: JournalRdv[] = ((data || []) as Row[]).map((r) => {
    const p = (r.paiement && typeof r.paiement === "object" ? r.paiement : {}) as Record<string, unknown>;
    return {
      id: String(r.id), nomRP: (r.nomRP as string) ?? null, type: (r.type as string) ?? null,
      lieu: (r.lieu as string) ?? null, creneau: (r.creneau as string) ?? null,
      source: (p.source as string) ?? null,
      assignes: Array.isArray(p.assignes) ? (p.assignes as string[]) : [],
      resultat: (p.resultat as string) ?? null,
      reponses: Array.isArray(p.reponses) ? (p.reponses as Reponse[]) : [],
      closedAt: (p.closedAt as string) ?? null, closedBy: (p.closedBy as string) ?? null,
      createdAt: (r.createdAt as string) ?? null,
    };
  });
  // Plus récemment clôturés en tête.
  rdvs.sort((a, b) => new Date(b.closedAt || b.createdAt || 0).getTime() - new Date(a.closedAt || a.createdAt || 0).getTime());
  return { connecte: true, rdvs };
}

// ── Statistiques : agrégats pour la page analytique (données réelles). ──
export type StatCat = { label: string; value: number; color: string };
export type StatistiquesData = {
  connecte: boolean;
  kpis: { membres: number; opsTerminees: number; coffreArmurerie: number; aptes: number };
  parGrade: { label: string; value: number }[];
  parPole: StatCat[];
  opsParPhase: StatCat[];
  medicalParStatut: StatCat[];
  coffres: StatCat[];
  coffreEvolution: { t: number; v: number }[];
};
export async function getStatistiques(): Promise<StatistiquesData> {
  const vide: StatistiquesData = { connecte: false, kpis: { membres: 0, opsTerminees: 0, coffreArmurerie: 0, aptes: 0 }, parGrade: [], parPole: [], opsParPhase: [], medicalParStatut: [], coffres: [], coffreEvolution: [] };
  const admin = createAdminClient();
  if (!admin) return vide;
  const [dash, memR, medR, acofR, amvtR] = await Promise.all([
    getDashboard(),
    admin.from("Membre").select("pole"),
    admin.from("DossierMedical").select("statut"),
    admin.from("ArmurerieCoffre").select("solde").eq("id", "vanhorn").maybeSingle(),
    admin.from("ArmurerieMouvementCoffre").select("sens,montant,createdAt").order("createdAt", { ascending: true }).limit(2000),
  ]);

  // Effectifs par pôle.
  const memRows = (memR.data || []) as { pole: string | null }[];
  const iwc = memRows.filter((m) => m.pole !== "illegal").length;
  const conf = memRows.filter((m) => m.pole === "illegal").length;
  const parPole: StatCat[] = [
    { label: "Iron Wolf", value: iwc, color: "#c8a45c" },
    { label: "La Confrérie", value: conf, color: "#b0413a" },
  ].filter((x) => x.value > 0);

  // Aptitude médicale (statut = état, palette « statut »).
  const medRows = (medR.data || []) as { statut: string | null }[];
  const mstat = (s: string) => { s = (s || "").toLowerCase(); if (s === "apte") return "Apte"; if (/observ/.test(s)) return "Observation"; if (s === "inapte") return "Inapte"; return "Non testé"; };
  const mc = new Map<string, number>();
  for (const d of medRows) { const k = mstat(d.statut || ""); mc.set(k, (mc.get(k) || 0) + 1); }
  const MED = [["Apte", "#54b085"], ["Observation", "#d8a53f"], ["Inapte", "#b0413a"], ["Non testé", "#95a1b1"]] as const;
  const medicalParStatut: StatCat[] = MED.map(([label, color]) => ({ label, value: mc.get(label) || 0, color })).filter((x) => x.value > 0);
  const aptes = mc.get("Apte") || 0;

  // Coffres de la maison (depuis le tableau de bord — déjà résolus).
  const c = dash.coffres;
  const coffres: StatCat[] = [
    { label: "Commun", value: c.commun ?? 0, color: "#c8a45c" },
    { label: "Iron Wolf", value: c.legal ?? 0, color: "#6f9fc4" },
    { label: "Confrérie", value: c.illegal ?? 0, color: "#b0413a" },
  ].filter((x) => x.value > 0);

  // Coffre armurerie + son évolution (solde cumulé, mouvement par mouvement).
  const coffreArmurerie = Number((acofR.data as { solde?: number } | null)?.solde ?? 0);
  const mvts = (amvtR.data || []) as { sens: string; montant: number; createdAt: string }[];
  let run = 0; const coffreEvolution: { t: number; v: number }[] = [];
  for (const m of mvts) { run += (m.sens === "sortie" ? -1 : 1) * (Number(m.montant) || 0); const t = new Date(m.createdAt).getTime(); if (t) coffreEvolution.push({ t, v: Math.round(run * 100) / 100 }); }

  const opsTerminees = (dash.opsParPhase.find((p) => /termin|fini|honor/i.test(p.label))?.value) || 0;
  return {
    connecte: true,
    kpis: { membres: dash.membresCount, opsTerminees, coffreArmurerie, aptes },
    parGrade: dash.membresParGrade,
    parPole,
    opsParPhase: dash.opsParPhase,
    medicalParStatut,
    coffres,
    coffreEvolution,
  };
}

// ── Accès par rôle (permissions du site) ─────────────────────────
// Déduit du grade du membre connecté (+ flag « médecin » sur sa fiche RH).
// PRINCIPE ANTI-VERROUILLAGE : au moindre doute (pas de session, grade inconnu,
// erreur), on OUVRE tout — on ne bloque jamais personne par erreur.
export type Acces = { direction: boolean; officier: boolean; medecin: boolean; peutRenseignement: boolean; peutMedical: boolean };
export async function getAcces(): Promise<Acces> {
  const ouvert: Acces = { direction: true, officier: true, medecin: true, peutRenseignement: true, peutMedical: true };
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ouvert;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    const did = String(meta.provider_id || meta.sub || "");
    const admin = createAdminClient();
    if (!admin || !did) return ouvert;
    const { data } = await admin.from("Membre").select("grade,ficheRH").eq("id", did).maybeSingle();
    const grade = String((data?.grade as string) || "").toLowerCase();
    if (!grade) return ouvert; // grade inconnu → on n'enferme personne
    const f = data?.ficheRH as Record<string, unknown> | null;
    const medecin = !!(f && typeof f === "object" && f.medecin);
    const direction = /fondateur|conseil|directeur|fl[eé]au|concepteur/.test(grade);
    const officier = direction || /officier|instructeur/.test(grade);
    return { direction, officier, medecin, peutRenseignement: officier, peutMedical: direction || medecin };
  } catch { return ouvert; }
}

// ── Carte interactive (lieux + itinéraires du bot ET du site) ────
// `source` distingue l'origine : « bot » (salon Discord, réconcilié — lecture
// seule côté site) ou « web » (ajouté depuis le site — éditable/supprimable).
export type CartePoint = { id: string; type: string; niveau: string; nom: string; region: string | null; lieu: string | null; notes: string | null; x: number | null; y: number | null; source: "bot" | "web" };
export type CarteRoute = { id: string; type: string; niveau: string; nom: string; notes: string | null; points: { x: number; y: number }[]; source: "bot" | "web" };
export type CarteData = { connecte: boolean; points: CartePoint[]; routes: CarteRoute[]; peutConfidentiel: boolean; imageUrl: string | null };

export async function getCarte(): Promise<CarteData> {
  const vide: CarteData = { connecte: false, points: [], routes: [], peutConfidentiel: false, imageUrl: null };
  if (!dataConfigured()) return vide;
  const supabase = createAdminClient();
  if (!supabase) return vide;
  const acces = await getAcces();
  const peutConfidentiel = acces.direction;
  const [pR, rR, pwR, rwR, cfgR] = await Promise.all([
    supabase.from("CartePoint").select("*").limit(1000),
    supabase.from("CarteRoute").select("*").limit(400),
    supabase.from("CartePointWeb").select("*").limit(1000),
    supabase.from("CarteRouteWeb").select("*").limit(400),
    supabase.from("CarteConfig").select("cle,valeur").eq("cle", "image").maybeSingle(),
  ]);
  const num = (v: unknown): number | null => (v == null || Number.isNaN(Number(v)) ? null : Number(v));
  type Raw = Record<string, unknown>;
  const mapPoint = (src: "bot" | "web") => (p: Raw): CartePoint => ({
    id: String(p.id), type: String(p.type || "autre"), niveau: String(p.niveau || "public"),
    nom: String(p.nom || "Lieu"), region: (p.region as string) ?? null, lieu: (p.lieu as string) ?? null,
    notes: (p.notes as string) ?? null, x: num(p.x), y: num(p.y), source: src,
  });
  const mapRoute = (src: "bot" | "web") => (r: Raw): CarteRoute => ({
    id: String(r.id), type: String(r.type || "autre"), niveau: String(r.niveau || "public"),
    nom: String(r.nom || "Itinéraire"), notes: (r.notes as string) ?? null,
    points: Array.isArray(r.points) ? (r.points as { x: number; y: number }[]).filter((pt) => pt && Number.isFinite(Number(pt.x)) && Number.isFinite(Number(pt.y))) : [],
    source: src,
  });
  let points: CartePoint[] = [
    ...(pR.error ? [] : ((pR.data || []) as Raw[]).map(mapPoint("bot"))),
    ...(pwR.error ? [] : ((pwR.data || []) as Raw[]).map(mapPoint("web"))),
  ];
  let routes: CarteRoute[] = [
    ...(rR.error ? [] : ((rR.data || []) as Raw[]).map(mapRoute("bot"))),
    ...(rwR.error ? [] : ((rwR.data || []) as Raw[]).map(mapRoute("web"))),
  ];
  if (!peutConfidentiel) {
    points = points.filter((p) => p.niveau !== "confidentiel");
    routes = routes.filter((r) => r.niveau !== "confidentiel");
  }
  const imageUrl = (!cfgR.error && cfgR.data ? String((cfgR.data as { valeur?: string }).valeur || "") : "") || process.env.NEXT_PUBLIC_CARTE_IMAGE_URL || null;
  return { connecte: true, points, routes, peutConfidentiel, imageUrl };
}
