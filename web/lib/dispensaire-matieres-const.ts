// Constantes, types & helpers PURS — Matières premières & Coffres.
// Importable côté client (aucun accès serveur).

export type Matiere = { id: string; nom: string; quantite: number; seuil: number; cible: number; unite: string | null; fournisseur: string | null; note: string | null; updatedAt: string | null; updatedBy: string | null };
export type MatieresData = { connecte: boolean; pret: boolean; canEdit: boolean; matieres: Matiere[]; alertes: number };
export const enRupture = (m: { quantite: number; seuil: number }) => m.seuil > 0 && m.quantite <= m.seuil;
// Quantité suggérée à commander pour revenir à la cible (ou 2× le seuil par défaut).
export const suggestionCommande = (m: Matiere) => {
  const cible = m.cible > 0 ? m.cible : m.seuil * 2;
  return Math.max(0, cible - m.quantite);
};

export type Coffre = { id: string; nom: string; emplacement: string | null; responsable: string | null; note: string | null; photo: string | null; updatedAt: string | null; updatedBy: string | null };
export type CoffresData = { connecte: boolean; pret: boolean; canEdit: boolean; coffres: Coffre[] };
