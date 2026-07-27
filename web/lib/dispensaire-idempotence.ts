// Idempotence des créations — sans nouvelle table : un jeton client stable dérive
// l'id de la ligne, et la CLÉ PRIMAIRE rejette atomiquement un second envoi
// (double-clic, retry réseau). Le serveur renvoie alors la ligne existante au lieu
// d'en créer une deuxième. Fonctions pures — aucune dépendance serveur.

// Dérive un id à partir d'un jeton client. Sans jeton (ou jeton invalide), on
// retombe sur l'id aléatoire habituel → comportement inchangé.
export function idAvecJeton(prefix: string, cle: unknown, aleatoire: () => string): string {
  const t = typeof cle === "string" ? cle.trim().slice(0, 64).replace(/[^a-zA-Z0-9_-]/g, "") : "";
  return t ? `${prefix}-${t}` : aleatoire();
}

// Détecte une violation d'unicité (doublon de clé primaire) dans une erreur Supabase.
export function estDoublon(err: { message?: string; code?: string } | null | undefined): boolean {
  if (!err) return false;
  return err.code === "23505" || /duplicate key|unique constraint|already exists/i.test(err.message || "");
}
