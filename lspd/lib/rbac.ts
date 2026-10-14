import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

// ── Modèle de permissions du LSPD ───────────────────────────────────────────
// Les droits sont définis PAR ACTION (et non par nom de grade), vérifiés côté
// serveur, fail-closed. La hiérarchie (grades) est CONFIGURABLE en base
// (table LspdGrade) : les grades par défaut ci-dessous servent uniquement de
// repli tant que rien n'est configuré, ou pour l'amorçage.

export const PERMISSIONS = [
  "dashboard.voir",
  "agents.voir", "agents.gerer", "agents.promouvoir",
  "dossiers.voir", "dossiers.sensibles",
  "interventions.voir", "interventions.gerer", "interventions.superviser",
  "rapports.creer", "rapports.valider",
  "arrestations.valider",
  "enquetes.voir", "enquetes.gerer",
  "armurerie.acces", "armurerie.gerer",
  "flotte.voir", "flotte.gerer",
  "recrutement.gerer",
  "finances.voir", "finances.gerer",
  "audit.voir",
  "admin.config",     // configuration de l'organisation (grades, unités, catégories…)
  "admin.technique",  // administration TECHNIQUE du site (séparée de la hiérarchie RP)
] as const;
export type Perm = (typeof PERMISSIONS)[number];

// "*" = tous les droits.
export type GradeDef = { key: string; nom: string; ordre: number; couleur: string; perms: readonly (Perm | "*")[] };

// Hiérarchie par défaut (modifiable ensuite depuis l'administration).
export const GRADES_DEFAUT: GradeDef[] = [
  { key: "direction", nom: "Direction du LSPD", ordre: 100, couleur: "#d6a84d", perms: ["*"] },
  { key: "commandement", nom: "Commandement", ordre: 90, couleur: "#cf9b3f", perms: ["dashboard.voir", "agents.voir", "agents.gerer", "agents.promouvoir", "dossiers.voir", "dossiers.sensibles", "interventions.voir", "interventions.gerer", "interventions.superviser", "rapports.creer", "rapports.valider", "arrestations.valider", "enquetes.voir", "enquetes.gerer", "armurerie.acces", "armurerie.gerer", "flotte.voir", "flotte.gerer", "recrutement.gerer", "finances.voir", "audit.voir", "admin.config"] },
  { key: "capitaine", nom: "Capitaine", ordre: 80, couleur: "#6f9fc4", perms: ["dashboard.voir", "agents.voir", "agents.gerer", "dossiers.voir", "dossiers.sensibles", "interventions.voir", "interventions.gerer", "interventions.superviser", "rapports.creer", "rapports.valider", "arrestations.valider", "enquetes.voir", "enquetes.gerer", "armurerie.acces", "flotte.voir", "recrutement.gerer", "finances.voir"] },
  { key: "lieutenant", nom: "Lieutenant", ordre: 70, couleur: "#6f9fc4", perms: ["dashboard.voir", "agents.voir", "dossiers.voir", "dossiers.sensibles", "interventions.voir", "interventions.gerer", "interventions.superviser", "rapports.creer", "rapports.valider", "arrestations.valider", "enquetes.voir", "enquetes.gerer", "armurerie.acces", "flotte.voir"] },
  { key: "sergent", nom: "Sergent", ordre: 60, couleur: "#8aa6bd", perms: ["dashboard.voir", "agents.voir", "dossiers.voir", "interventions.voir", "interventions.gerer", "rapports.creer", "rapports.valider", "arrestations.valider", "enquetes.voir", "armurerie.acces", "flotte.voir"] },
  { key: "officier_sup", nom: "Officier supérieur", ordre: 50, couleur: "#8aa6bd", perms: ["dashboard.voir", "agents.voir", "dossiers.voir", "interventions.voir", "interventions.gerer", "rapports.creer", "arrestations.valider", "enquetes.voir", "armurerie.acces", "flotte.voir"] },
  { key: "officier", nom: "Officier", ordre: 40, couleur: "#9db4c8", perms: ["dashboard.voir", "agents.voir", "dossiers.voir", "interventions.voir", "interventions.gerer", "rapports.creer", "armurerie.acces", "flotte.voir"] },
  { key: "cadet", nom: "Cadet / Recrue", ordre: 20, couleur: "#b7c6d6", perms: ["dashboard.voir", "dossiers.voir", "interventions.voir", "rapports.creer"] },
  { key: "admin_tech", nom: "Administrateur technique", ordre: 110, couleur: "#db7a6f", perms: ["*"] },
];

export type Acteur = {
  connecte: boolean;
  autorise: boolean;
  discordId: string | null;
  nom: string;
  matricule: string | null;
  agentId: string | null;
  gradeKey: string | null;
  gradeNom: string | null;
  perms: Set<string>;
  source: "agent" | "amorcage" | "invite";
};

const INVITE: Acteur = { connecte: false, autorise: false, discordId: null, nom: "Invité", matricule: null, agentId: null, gradeKey: null, gradeNom: null, perms: new Set(), source: "invite" };

function permsDeGrade(g: GradeDef | undefined): Set<string> {
  if (!g) return new Set();
  if (g.perms.includes("*")) return new Set(["*"]);
  return new Set(g.perms as string[]);
}

// Grades configurés (base) ∪ défauts. La base gagne quand une clé existe.
export const getGrades = cache(async (): Promise<GradeDef[]> => {
  const admin = createAdminClient();
  const parKey = new Map<string, GradeDef>(GRADES_DEFAUT.map((g) => [g.key, g]));
  if (admin) {
    try {
      const { data } = await admin.from("LspdGrade").select("key,nom,ordre,couleur,perms");
      for (const r of (data || []) as Record<string, unknown>[]) {
        const key = String(r.key || "").trim();
        if (!key) continue;
        const perms = Array.isArray(r.perms) ? (r.perms as string[]) : [];
        parKey.set(key, {
          key,
          nom: String(r.nom || key),
          ordre: Number(r.ordre) || 0,
          couleur: String(r.couleur || "#6f9fc4"),
          perms: perms as (Perm | "*")[],
        });
      }
    } catch {
      /* table absente → défauts uniquement */
    }
  }
  return [...parKey.values()].sort((a, b) => b.ordre - a.ordre);
});

// Acteur courant (identité Discord → fiche agent → grade → permissions).
// fail-closed : au moindre doute, non autorisé.
export const getActeur = cache(async (): Promise<Acteur> => {
  let discordId = "";
  let nom = "Agent";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return INVITE;
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    discordId = String(meta.provider_id || meta.sub || "");
    nom = String(meta.full_name || meta.name || meta.user_name || user.email || "Agent");
  } catch {
    return INVITE;
  }

  const admin = createAdminClient();
  if (!admin) {
    // Base non connectée : on reconnaît la session mais aucun droit métier.
    return { ...INVITE, connecte: true, discordId: discordId || null, nom };
  }

  const grades = await getGrades();
  const gradeByKey = new Map(grades.map((g) => [g.key, g]));

  // 1) Fiche agent rattachée à cet identifiant Discord.
  let agent: Record<string, unknown> | null = null;
  try {
    if (discordId) {
      const { data } = await admin.from("LspdAgent").select("*").eq("identifiant", discordId).maybeSingle();
      agent = (data as Record<string, unknown>) || null;
    }
  } catch {
    /* table absente */
  }

  if (agent && (agent.actif ?? true)) {
    const g = gradeByKey.get(String(agent.grade || ""));
    return {
      connecte: true, autorise: true, discordId: discordId || null,
      nom: String(agent.nom || nom), matricule: agent.matricule == null ? null : String(agent.matricule),
      agentId: String(agent.id), gradeKey: g?.key ?? (String(agent.grade || "") || null), gradeNom: g?.nom ?? null,
      perms: permsDeGrade(g), source: "agent",
    };
  }

  // 2) Amorçage : si AUCUN agent n'existe encore, le 1er compte connecté reçoit
  //    l'accès complet pour se nommer et bâtir la hiérarchie. Se ferme au 1er agent.
  try {
    const { count, error } = await admin.from("LspdAgent").select("id", { count: "exact", head: true });
    if (!error && (count ?? 0) === 0) {
      return { connecte: true, autorise: true, discordId: discordId || null, nom, matricule: null, agentId: null, gradeKey: "direction", gradeNom: "Direction du LSPD (amorçage)", perms: new Set(["*"]), source: "amorcage" };
    }
  } catch {
    /* table absente → amorçage implicite ci-dessous si rien ne répond */
  }

  // 3) Compte connecté hors effectif → reconnu, mais aucun droit métier.
  return { ...INVITE, connecte: true, discordId: discordId || null, nom };
});

// Un droit est accordé si le grade porte "*" ou l'action demandée.
export function peut(acteur: Acteur, perm: Perm): boolean {
  return acteur.autorise && (acteur.perms.has("*") || acteur.perms.has(perm));
}

// Garde-fou serveur : renvoie l'acteur si le droit est présent, sinon null.
export async function requirePerm(perm: Perm): Promise<Acteur | null> {
  const a = await getActeur();
  return peut(a, perm) ? a : null;
}
