// Rôles & permissions PROPRES au Dispensaire — importable côté client.
// Totalement indépendant de l'authentification Iron Wolf (aucun couplage).

export type Perms = { admin: boolean; rh: boolean; factures: boolean; stock: boolean; medical: boolean; voir: boolean };

export type RoleDef = { key: string; label: string; tone: string; rang: number; perms: Perms };

const P = (o: Partial<Perms>): Perms => ({ admin: false, rh: false, factures: false, stock: false, medical: false, voir: true, ...o });

export const ROLES: RoleDef[] = [
  { key: "directeur", label: "Directeur", tone: "var(--oxblood)", rang: 6, perms: P({ admin: true, rh: true, factures: true, stock: true, medical: true }) },
  { key: "adjoint", label: "Directeur adjoint", tone: "var(--warn)", rang: 5, perms: P({ admin: true, rh: true, factures: true, stock: true, medical: true }) },
  { key: "rh", label: "Responsable RH", tone: "var(--accent)", rang: 4, perms: P({ rh: true, stock: true, medical: true }) },
  { key: "medecin", label: "Médecin", tone: "var(--good)", rang: 3, perms: P({ stock: true, medical: true }) },
  { key: "infirmier", label: "Infirmier", tone: "var(--accent)", rang: 2, perms: P({ stock: true, medical: true }) },
  { key: "stagiaire", label: "Stagiaire", tone: "var(--muted)", rang: 1, perms: P({ medical: true }) },
];
export const roleDef = (k: string) => ROLES.find((r) => r.key === k) || ROLES[ROLES.length - 1];
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
