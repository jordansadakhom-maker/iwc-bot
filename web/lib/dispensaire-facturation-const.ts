// Constantes, types & helpers PURS de la facturation — importables côté client
// (aucun accès serveur ici, contrairement à `dispensaire-facturation.ts`).

// ── Ventes ──────────────────────────────────────────────────────────────────
export const PRIX_BANDAGE = 4;         // $ par bandage
export const MAX_BANDAGES_SEM = 10;    // maximum par patient et par semaine
export const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
export const estBandage = (item: string) => norm(item).includes("bandage");

export type Vente = { id: string; patient: string; item: string; quantite: number; prixUnitaire: number; total: number; note: string | null; par: string | null; createdAt: string };
export type PatientSemaine = { patient: string; bandages: number; total: number; depasse: boolean };
export type VentesData = { connecte: boolean; pret: boolean; canEdit: boolean; ventes: Vente[]; semaine: PatientSemaine[]; caSemaine: number; mondayYmd: string; prix: number; plafond: number };

// ── Factures ────────────────────────────────────────────────────────────────
export const FACTURE_DELAI_H = 72; // délai de paiement automatique (heures)
export const FACTURE_STATUTS = [
  { key: "non_payee", label: "Non payée", tone: "var(--warn)" },
  { key: "relancee", label: "Relancée", tone: "var(--accent)" },
  { key: "en_attente", label: "En attente", tone: "var(--steel)" },
  { key: "transmise", label: "Transmise", tone: "var(--accent)" },
  { key: "dossier_police", label: "Dossier police", tone: "var(--oxblood)" },
  { key: "payee", label: "Payée", tone: "var(--good)" },
  { key: "cloture", label: "Clôturé", tone: "var(--faint)" },
];
export const factureStatut = (k: string) => FACTURE_STATUTS.find((s) => s.key === k) || FACTURE_STATUTS[0];
// « Ouverte » = encore due (impayée). Seules Payée / Clôturé sortent des impayés.
export const factureOuverte = (s: string) => s !== "payee" && s !== "cloture";
export type Facture = { id: string; objet: string; destinataire: string | null; montant: number; dateEmission: string | null; dateEcheance: string | null; statut: string; note: string | null; par: string | null; createdAt: string; datePaiement: string | null; payePar: string | null };
export type FacturesData = { connecte: boolean; pret: boolean; canEdit: boolean; factures: Facture[]; enRetard: number; du: number };

// État d'échéance d'une facture ouverte : dépassée / bientôt (< 24 h) / ok.
export type EcheanceEtat = "depasse" | "bientot" | "ok" | null;
export function echeanceEtat(f: { statut: string; dateEcheance: string | null }, now = Date.now()): EcheanceEtat {
  if (!factureOuverte(f.statut) || !f.dateEcheance) return null;
  const t = new Date(f.dateEcheance).getTime();
  if (!Number.isFinite(t)) return null;
  if (t < now) return "depasse";
  if (t - now < 24 * 3600000) return "bientot";
  return "ok";
}
// Ligne « prête pour la police » : Date / Nom / Prix dû.
export function copiePolice(f: { dateEmission: string | null; createdAt: string; destinataire: string | null; montant: number }): string {
  const d = f.dateEmission || f.createdAt;
  let dfr = "—";
  try { dfr = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(d)); } catch { /* garde — */ }
  return `${dfr}\n${f.destinataire || "—"}\n${Math.round(f.montant)} $`;
}

// ── Soins FDO ───────────────────────────────────────────────────────────────
// Tarif unique : un soin FDO coûte toujours 2 $ (remboursé ensuite par le
// gouvernement). Montant figé, aucune gratuité possible.
export const FDO_PRIX = 2;
export const FDO_STATUTS = [
  { key: "facture", label: "Facturé", tone: "var(--warn)" },
  { key: "regle", label: "Réglé", tone: "var(--good)" },
];
export const fdoStatut = (k: string) => FDO_STATUTS.find((s) => s.key === k) || FDO_STATUTS[0];
export type SoinFDO = { id: string; bureau: string; agent: string | null; soin: string | null; montant: number; statut: string; note: string | null; par: string | null; createdAt: string };
export type BureauFDO = { bureau: string; nb: number; total: number };
export type FDOData = { connecte: boolean; pret: boolean; canEdit: boolean; soins: SoinFDO[]; bureaux: BureauFDO[] };

// ── Notes de frais ──────────────────────────────────────────────────────────
export const FRAIS_STATUTS = [
  { key: "en_attente", label: "En attente", tone: "var(--warn)" },
  { key: "valide", label: "Validée", tone: "var(--good)" },
  { key: "refuse", label: "Refusée", tone: "var(--oxblood)" },
  { key: "vire", label: "Virée", tone: "var(--accent)" },
];
export const fraisStatut = (k: string) => FRAIS_STATUTS.find((s) => s.key === k) || FRAIS_STATUTS[0];
export type Frais = { id: string; objet: string; montant: number; demandeur: string | null; statut: string; validePar: string | null; note: string | null; par: string | null; createdAt: string };
export type FraisData = { connecte: boolean; pret: boolean; canValidate: boolean; frais: Frais[]; enAttente: number };

// Format monétaire commun.
export const money = (n: number) => `$${Math.round(n).toLocaleString("fr-FR")}`;
