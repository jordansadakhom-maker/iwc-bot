// Ciblage des notifications — logique PURE (testable), partagée serveur.
// Une notification peut être :
//   • d'équipe   : membreId NULL ET roleCible NULL      → visible de tous
//   • ciblée membre : membreId renseigné                → seulement ce membre
//   • ciblée rôle   : roleCible renseigné (direction…)  → membres ayant ce rôle
// Vocabulaire de rôles : direction / officier / medecin / armurier.

export type CibleActeur = { did: string | null; roles: string[] };
export type NotifCiblable = { membreId?: string | null; roleCible?: string | null };

// Rôles de l'acteur à partir des drapeaux d'accès (getAcces).
export function rolesDeActeur(a: { direction?: boolean; officier?: boolean; medecin?: boolean; armurier?: boolean }): string[] {
  const r: string[] = [];
  if (a.direction) r.push("direction");
  if (a.officier) r.push("officier");
  if (a.medecin) r.push("medecin");
  if (a.armurier) r.push("armurier");
  return r;
}

// Prédicat en mémoire : cette notification est-elle visible pour l'acteur ?
export function notifVisiblePour(row: NotifCiblable, acteur: CibleActeur): boolean {
  const mid = row.membreId ? String(row.membreId) : null;
  const rc = row.roleCible ? String(row.roleCible).toLowerCase() : null;
  if (!mid && !rc) return true;                                             // équipe
  if (mid && acteur.did && mid === acteur.did) return true;                 // ciblée membre
  if (rc && acteur.roles.some((x) => x.toLowerCase() === rc)) return true;  // ciblée rôle
  return false;
}

// Équivalent PostgREST pour les COUNT (sans charger les lignes). Entrées
// assainies : id numérique, rôles alphabétiques → aucune injection possible.
export function orCibleNotif(acteur: CibleActeur): string {
  const parts = ["and(membreId.is.null,roleCible.is.null)"];
  if (acteur.did && /^\d{5,}$/.test(acteur.did)) parts.push(`membreId.eq.${acteur.did}`);
  const roles = acteur.roles.filter((r) => /^[a-z]+$/.test(r));
  if (roles.length) parts.push(`roleCible.in.(${roles.join(",")})`);
  return parts.join(",");
}
