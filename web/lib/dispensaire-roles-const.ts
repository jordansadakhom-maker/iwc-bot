// Rôles & permissions PROPRES au Dispensaire — importable côté client.
// Totalement indépendant de l'authentification Iron Wolf (aucun couplage).

export type Perms = { admin: boolean; rh: boolean; factures: boolean; stock: boolean; medical: boolean; voir: boolean };

export type RoleDef = { key: string; label: string; tone: string; rang: number; perms: Perms };

export const P = (o: Partial<Perms>): Perms => ({ admin: false, rh: false, factures: false, stock: false, medical: false, voir: true, ...o });

// Teintes par rang (du plus haut au plus bas) — réutilisées pour les grades
// dynamiques créés depuis l'administration.
export const TONES = ["var(--oxblood)", "var(--warn)", "var(--accent)", "var(--good)", "var(--steel)", "var(--muted)"];
export const toneForRang = (rang: number, total: number) => TONES[Math.max(0, Math.min(TONES.length - 1, total - rang))] || "var(--muted)";

// Grades PAR DÉFAUT (serveur Reckless) — graine de la table DispensaireGrade et
// repli si la table n'est pas encore là. Entièrement éditables depuis l'admin.
export const GRADES_DEFAUT: RoleDef[] = [
  { key: "directeur", label: "Directeur", tone: "var(--oxblood)", rang: 5, perms: P({ admin: true, rh: true, factures: true, stock: true, medical: true }) },
  { key: "adjoint", label: "Adjoint", tone: "var(--warn)", rang: 4, perms: P({ admin: true, rh: true, factures: true, stock: true, medical: true }) },
  { key: "referent", label: "Médecin Référent", tone: "var(--accent)", rang: 3, perms: P({ rh: true, stock: true, medical: true }) },
  { key: "medecin", label: "Médecin", tone: "var(--good)", rang: 2, perms: P({ stock: true, medical: true }) },
  { key: "apprenti", label: "Apprenti Médecin", tone: "var(--muted)", rang: 1, perms: P({ medical: true }) },
];
// Alias de compatibilité pour les anciens imports.
export const ROLES = GRADES_DEFAUT;

// Résout un grade dans une liste donnée (repli sur le grade le plus bas).
export const roleDefIn = (grades: RoleDef[], k: string): RoleDef =>
  grades.find((r) => r.key === k) || grades[grades.length - 1] || GRADES_DEFAUT[GRADES_DEFAUT.length - 1];
export const roleDef = (k: string) => roleDefIn(GRADES_DEFAUT, k);
export const roleLabel = (k: string) => roleDef(k).label;

// ── Configuration / seuils (avec valeurs par défaut) ────────────────────────
export type Config = { seuilRenvoi: number; prixBandage: number; plafondBandage: number; delaiFactureJours: number };
export const CONFIG_DEFAUT: Config = { seuilRenvoi: 3, prixBandage: 4, plafondBandage: 10, delaiFactureJours: 7 };
export const CONFIG_CHAMPS: { cle: keyof Config; label: string; aide: string }[] = [
  { cle: "seuilRenvoi", label: "Seuil de renvoi (absences injustifiées)", aide: "Un salarié est signalé « à renvoyer » au-delà de ce nombre." },
  { cle: "prixBandage", label: "Prix d'un bandage ($)", aide: "Prix unitaire appliqué aux ventes de bandages." },
  { cle: "plafondBandage", label: "Bandages max / semaine / patient", aide: "Au-delà, le patient est signalé en rouge." },
  { cle: "delaiFactureJours", label: "Délai de facture (jours)", aide: "Indicatif : délai standard avant échéance." },
];
