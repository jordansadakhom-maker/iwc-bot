// Types & helpers PURS des charrettes (importables côté client — aucun accès
// serveur ici). Le suivi : détenteur actuel + date de réception, besoins
// (qui en a besoin et quand) et historique des détenteurs successifs.

export type Besoin = { id: string; nom: string; quand: string | null; par: string | null; at: string };
export type Passage = { detenteur: string; dateReception: string | null; dateRetour: string | null; par: string | null };
export type Charrette = {
  id: string; nom: string;
  detenteur: string | null; dateReception: string | null; note: string | null;
  besoins: Besoin[]; historique: Passage[];
  createdAt: string; updatedAt: string | null;
};
export type CharrettesData = { connecte: boolean; pret: boolean; canEdit: boolean; charrettes: Charrette[] };

// Une charrette est disponible tant qu'aucun détenteur n'est renseigné.
export const estDisponible = (c: { detenteur: string | null }) => !c.detenteur || !c.detenteur.trim();
