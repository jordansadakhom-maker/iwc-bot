// Domaine LICENCES — importable CÔTÉ CLIENT (types, libellés, constantes).
// Aucun couplage serveur : la logique métier pure (statut effectif, autorisation,
// numéro) vit ici pour être partagée entre la page, les actions et l'armurerie.

export type StatutLicence = "active" | "suspendue" | "revoquee" | "expiree";

export const STATUTS: { key: StatutLicence; label: string; tone: string }[] = [
  { key: "active", label: "Active", tone: "var(--good)" },
  { key: "suspendue", label: "Suspendue", tone: "var(--warn)" },
  { key: "revoquee", label: "Révoquée", tone: "var(--oxblood)" },
  { key: "expiree", label: "Expirée", tone: "var(--muted)" },
];
export const statutDef = (k: string) => STATUTS.find((s) => s.key === k) || STATUTS[0];

// ── Autorisations (activables individuellement) ─────────────────────────────
export const PERMISSIONS: { key: string; label: string }[] = [
  { key: "acheter_arme", label: "Peut acheter une arme" },
  { key: "vendre_arme", label: "Peut vendre une arme" },
  { key: "porter_arme", label: "Peut porter une arme" },
  { key: "transporter_arme", label: "Peut transporter une arme" },
  { key: "arme_longue", label: "Peut posséder une arme longue" },
  { key: "revolver", label: "Peut posséder un revolver" },
  { key: "acheter_munitions", label: "Peut acheter des munitions" },
  { key: "exercer_armurier", label: "Peut exercer comme armurier" },
  { key: "travailler_armurerie", label: "Peut travailler dans une armurerie" },
  { key: "acceder_stock", label: "Peut accéder au stock" },
  { key: "fabriquer_arme", label: "Peut fabriquer des armes" },
  { key: "reparer_arme", label: "Peut réparer des armes" },
  { key: "commandes", label: "Peut effectuer des commandes" },
  { key: "gerer_stock", label: "Peut gérer les stocks" },
  { key: "delivrer_licences", label: "Peut délivrer des licences" },
];
export const permLabel = (k: string) => PERMISSIONS.find((p) => p.key === k)?.label || k;

// ── Restrictions ────────────────────────────────────────────────────────────
export const RESTRICTIONS: { key: string; label: string }[] = [
  { key: "no_arme_longue", label: "Interdiction des armes longues" },
  { key: "no_auto", label: "Interdiction des armes automatiques" },
  { key: "port_service", label: "Port d'arme uniquement en service" },
  { key: "transport_mission", label: "Transport uniquement durant les missions" },
  { key: "limite_nombre", label: "Limité à un certain nombre d'armes" },
  { key: "no_vente", label: "Interdiction de vente" },
  { key: "no_achat", label: "Interdiction d'achat" },
];
export const restrLabel = (k: string) => RESTRICTIONS.find((r) => r.key === k)?.label || k;

export type LicenceType = {
  code: string; nom: string; description: string | null;
  permsDefaut: Record<string, boolean>; prefixe: string | null; actif: boolean; ordre: number;
};

export type Licence = {
  id: string; numero: string; typeCode: string; typeNom: string | null;
  nom: string; prenom: string | null; photoUrl: string | null;
  metier: string | null; grade: string | null; organisation: string | null; identifiant: string | null;
  dateDelivrance: string; dateExpiration: string | null; delivrePar: string | null;
  statut: StatutLicence;
  permissions: Record<string, boolean>; restrictions: string[];
  commentaires: string | null;
  suspensionMotif: string | null; suspensionDebut: string | null; suspensionFin: string | null; suspensionPar: string | null;
  revocationMotif: string | null; revocationAt: string | null; revocationPar: string | null;
  createdAt: string; updatedAt: string | null; updatedBy: string | null;
};

// Statut EFFECTIF — tient compte de l'expiration à la volée (aucun cron requis).
// Une licence « active » dont la date est passée est vue comme « expirée ».
export function statutEffectif(l: { statut: string; dateExpiration: string | null }): StatutLicence {
  if (l.statut === "revoquee" || l.statut === "suspendue") return l.statut as StatutLicence;
  if (l.dateExpiration) { const t = Date.parse(l.dateExpiration); if (Number.isFinite(t) && t < Date.now()) return "expiree"; }
  return ((l.statut as StatutLicence) || "active");
}

// Jours restants avant expiration (null si pas de date ; négatif si dépassée).
export function joursAvantExpiration(dateExpiration: string | null): number | null {
  if (!dateExpiration) return null;
  const t = Date.parse(dateExpiration); if (!Number.isFinite(t)) return null;
  return Math.ceil((t - Date.now()) / 86400000);
}

// Paliers d'alerte d'expiration (jours). Utilisés par les notifications (Lot D).
export const PALIERS_EXPIRATION = [30, 15, 7, 3, 1] as const;

// Une licence autorise-t-elle une permission ? (statut effectif « active » requis)
export function autoriseLicence(l: Licence, perm: string): boolean {
  return statutEffectif(l) === "active" && !!l.permissions[perm];
}

// ── Rôles fins & capacités (Lot G) ──────────────────────────────────────────
// Chaque rôle ne peut effectuer QUE les actions listées dans ses capacités.
export type CapLicence = "voir" | "creer" | "cycle" | "revoquer" | "supprimer" | "gererTypes" | "gererIntegration" | "gererRoles";

export const ROLES_LICENCE: { key: string; label: string; tone: string; caps: CapLicence[] }[] = [
  { key: "admin", label: "Administrateur", tone: "var(--oxblood)", caps: ["voir", "creer", "cycle", "revoquer", "supprimer", "gererTypes", "gererIntegration", "gererRoles"] },
  { key: "direction", label: "Direction IWC", tone: "var(--warn)", caps: ["voir", "creer", "cycle", "revoquer", "supprimer", "gererTypes", "gererIntegration", "gererRoles"] },
  { key: "responsable", label: "Responsable Armurerie", tone: "var(--accent)", caps: ["voir", "creer", "cycle", "revoquer", "gererTypes", "gererIntegration"] },
  { key: "armurier", label: "Armurier", tone: "var(--good)", caps: ["voir", "creer", "cycle"] },
  { key: "agent", label: "Agent autorisé", tone: "var(--steel)", caps: ["voir", "creer"] },
  { key: "consultation", label: "Consultation seule", tone: "var(--muted)", caps: ["voir"] },
];
export const roleLicenceDef = (k: string) => ROLES_LICENCE.find((r) => r.key === k) || ROLES_LICENCE[ROLES_LICENCE.length - 1];

export type CapsLicence = Record<CapLicence, boolean>;
export function capsDe(roleKey: string): CapsLicence {
  const set = new Set(roleLicenceDef(roleKey).caps);
  return { voir: set.has("voir"), creer: set.has("creer"), cycle: set.has("cycle"), revoquer: set.has("revoquer"), supprimer: set.has("supprimer"), gererTypes: set.has("gererTypes"), gererIntegration: set.has("gererIntegration"), gererRoles: set.has("gererRoles") };
}

// Numéro de repli (si la fonction SQL next_licence_numero n'est pas disponible) :
// même format & même clé de contrôle que la fonction Postgres.
export function genererNumeroLocal(prefixe: string | null, seq: number, annee: number): string {
  const base = `${(prefixe || "LIC").toUpperCase()}-${annee}-${String(seq).padStart(5, "0")}`;
  let s = 0; for (const ch of base) s += ch.charCodeAt(0);
  const alpha = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ";
  return `${base}-${alpha[s % 36]}`;
}
