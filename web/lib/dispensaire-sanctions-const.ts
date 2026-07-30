// Sanctions disciplinaires — types & helpers PURS (importables client/serveur).

export type Sanction = {
  id: string; salarieId: string | null; nom: string; type: string;
  motif: string | null; date: string | null; duree: string | null;
  commentaire: string | null; par: string | null; createdAt: string | null;
};

// Types de sanction configurables (au minimum ceux-ci). « autre » = libellé libre.
export const SANCTION_TYPES = [
  { key: "blame", label: "Blâme", tone: "var(--warn)" },
  { key: "avertissement", label: "Avertissement", tone: "var(--warn)" },
  { key: "suspension", label: "Suspension d'activité", tone: "var(--oxblood)" },
  { key: "mise_a_pied", label: "Mise à pied", tone: "var(--oxblood)" },
  { key: "autre", label: "Autre", tone: "var(--muted)" },
] as const;
export const SANCTION_KEYS = SANCTION_TYPES.map((t) => t.key) as string[];
export const sanctionLabel = (k: string) => SANCTION_TYPES.find((t) => t.key === k)?.label || "Autre";
export const sanctionTone = (k: string) => SANCTION_TYPES.find((t) => t.key === k)?.tone || "var(--muted)";
