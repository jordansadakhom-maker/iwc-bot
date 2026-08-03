// Pièce jointe « référence visuelle » — validation PURE (client + serveur).
//
// Objectif : rattacher une image de référence (blessure, radio, document RP…) à
// une fiche, SANS transformer le site en MDT (aucune identité, aucune base RP).
// Ici on ne gère qu'un LIEN vers une image ; l'upload de fichiers, les PDF et les
// pièces multiples pourront s'ajouter par-dessus sans casser ce socle.
//
// Sécurité : on n'accepte QUE des liens `https://` pointant vers une image
// (extension connue) ou un CDN d'images de confiance (Discord). Tout le reste
// (javascript:, data:, http://, blob:…) est refusé — jamais de contenu exécutable.

// Longueur max d'un lien (les liens Discord CDN signés sont longs). Sert aussi de
// garde-fou pour une future limite de taille si l'upload est ajouté.
export const PIECE_JOINTE_MAX = 2000;

// Extensions d'image directes acceptées (query/hash tolérés après l'extension).
const EXT_IMAGE = /\.(png|jpe?g|webp|gif)(?:[?#].*)?$/i;

// CDN d'images de confiance : le lien Discord porte l'extension dans le chemin,
// mais on liste les hôtes pour rester explicite et facilement extensible.
const HOTES_IMAGE = new Set([
  "cdn.discordapp.com",
  "media.discordapp.net",
  "images.discordapp.net",
  "cdn.discordcdn.com",
]);

// Vrai si l'URL ressemble à un lien direct d'image (extension) ou vient d'un CDN
// d'images connu. Utilisé pour l'indice affiché à la saisie.
export function estUrlImage(brut: string): boolean {
  const t = (brut || "").trim();
  if (!t) return false;
  try {
    const u = new URL(t);
    if (u.protocol !== "https:") return false;
    return EXT_IMAGE.test(u.pathname) || HOTES_IMAGE.has(u.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export type PieceJointeValide = { ok: true; url: string } | { ok: false; error: string };

// Valide et normalise un lien de pièce jointe. Vide = accepté (pas de pièce).
// C'est le SEUL point de vérité de sécurité : appelé côté client (retour immédiat)
// ET côté serveur (rempart avant enregistrement).
export function validerPieceJointe(brut: string): PieceJointeValide {
  const t = (brut || "").trim();
  if (!t) return { ok: true, url: "" };
  if (t.length > PIECE_JOINTE_MAX) return { ok: false, error: "Le lien est trop long." };
  let u: URL;
  try {
    u = new URL(t);
  } catch {
    return { ok: false, error: "Lien invalide." };
  }
  if (u.protocol !== "https:") return { ok: false, error: "Seuls les liens https:// sont acceptés." };
  if (!EXT_IMAGE.test(u.pathname) && !HOTES_IMAGE.has(u.hostname.toLowerCase())) {
    return { ok: false, error: "Colle un lien direct vers une image (.png, .jpg, .webp, .gif) ou un lien Discord." };
  }
  return { ok: true, url: u.toString() };
}
