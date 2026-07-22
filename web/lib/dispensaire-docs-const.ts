// Constantes, types & modèles PURS — Certificats / Rapports / Documents.
// Importable côté client (aucun accès serveur).

// ── Certificats ─────────────────────────────────────────────────────────────
export type Certificat = { id: string; patient: string; type: string; medecin: string | null; dateActe: string | null; dureeRepos: number; contenu: string | null; note: string | null; par: string | null; createdAt: string };
export type CertData = { connecte: boolean; pret: boolean; canEdit: boolean; certificats: Certificat[] };

export const CERT_TYPES = [
  { key: "medical", label: "Certificat médical", tone: "var(--accent)" },
  { key: "arret", label: "Arrêt de travail", tone: "var(--warn)" },
  { key: "aptitude", label: "Aptitude", tone: "var(--good)" },
  { key: "inaptitude", label: "Inaptitude", tone: "var(--oxblood)" },
  { key: "deces", label: "Décès", tone: "var(--faint)" },
  { key: "autre", label: "Personnalisé", tone: "var(--muted)" },
];
export const certType = (k: string) => CERT_TYPES.find((c) => c.key === k) || CERT_TYPES[0];

// Modèle de texte pré-rempli (remplissage rapide). L'utilisateur peut ensuite l'ajuster.
export function modeleCertificat(type: string, ctx: { patient?: string; medecin?: string; dureeRepos?: number }) {
  const p = ctx.patient?.trim() || "……………";
  const m = ctx.medecin?.trim() || "……………";
  const j = ctx.dureeRepos && ctx.dureeRepos > 0 ? ctx.dureeRepos : "……";
  const base = `Je soussigné(e) ${m}, praticien(ne) au Dispensaire de Saint-Denis,`;
  switch (type) {
    case "medical":
      return `${base} certifie avoir examiné ce jour ${p} et atteste de ce qui suit :\n`;
    case "arret":
      return `${base} certifie que l'état de santé de ${p} justifie un arrêt de travail de ${j} jour(s) à compter de ce jour.`;
    case "aptitude":
      return `${base} certifie avoir examiné ce jour ${p} et le/la déclare APTE, aucune contre-indication n'ayant été relevée.`;
    case "inaptitude":
      return `${base} certifie avoir examiné ce jour ${p} et le/la déclare INAPTE pour la ou les raison(s) suivante(s) :\n- `;
    case "deces":
      return `${base} constate le décès de ${p}, survenu le …………… à ……h……, après examen du corps.`;
    default:
      return `${base} certifie ce qui suit concernant ${p} :\n`;
  }
}

// ── Rapports médicaux (Canva) ───────────────────────────────────────────────
export type Rapport = { id: string; titre: string; categorie: string | null; patient: string | null; lien: string | null; auteur: string | null; note: string | null; par: string | null; createdAt: string };
export type RapportsData = { connecte: boolean; pret: boolean; canEdit: boolean; rapports: Rapport[]; categories: string[] };
export const estCanva = (url: string | null) => !!url && /canva\./i.test(url);
export const RAPPORT_CATEGORIES = ["Consultation", "Chirurgie", "Autopsie", "Expertise", "Suivi", "Autre"];

// ── Documents ───────────────────────────────────────────────────────────────
export type Doc = { id: string; titre: string; categorie: string | null; type: string; url: string | null; note: string | null; par: string | null; createdAt: string };
export type DocsData = { connecte: boolean; pret: boolean; canEdit: boolean; documents: Doc[]; categories: string[] };
export const DOC_CATEGORIES = ["Procédures", "Formulaires", "Règlement", "Formations", "Modèles", "Autre"];

// Normalise un lien saisi (ajoute https:// si absent).
export function normaliserLien(url: string): string {
  const t = url.trim();
  if (!t) return "";
  if (/^https?:\/\//i.test(t)) return t;
  return "https://" + t;
}
