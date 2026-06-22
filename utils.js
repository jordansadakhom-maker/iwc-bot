// ───────────────────────────────────────────────────────────────────────────
//  utils.js — Fonctions utilitaires PURES, extraites d'index.js à l'identique.
//  Aucun rôle, aucune permission, aucune synchronisation, aucun ID ici :
//  uniquement du formatage. Comportement strictement inchangé.
// ───────────────────────────────────────────────────────────────────────────

function fmtLong(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function parisOffsetHours(date) { const tzStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }); const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' }); return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000); }
function _fmtDollars(n) { return `${Math.round(Number(n) || 0).toLocaleString('fr-FR')} $`; }

// Détecte une transcription manifestement HALLUCINÉE par Whisper (silence/bruit du jeu) :
// phrase courte répétée en boucle, très faible diversité de mots, ou échos connus du prompt.
// But : ne pas générer de rapport / d'analyse de contrat sur du charabia.
function transcriptionHallucinee(texte) {
  if (!texte) return false;
  const sansAccents = String(texte).toLowerCase().replace(/\*\*/g, ' ').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const echos = [
    "ouest americain en 1895", "jeu de role western", "jeu de l'ouest", "voix off",
    "sous-titres realises par", "merci d'avoir regarde", "abonnez-vous", "amara.org",
  ];
  const mots = sansAccents.replace(/[.,;:!?()«»"']/g, ' ').split(/\s+/).filter(Boolean);
  if (mots.length < 6) return false; // trop court pour juger fiablement
  const uniq = new Set(mots).size;
  // 1) très faible diversité de mots (ex : "1895 jeu 1895 jeu 1895 jeu...")
  if (uniq / mots.length < 0.25) return true;
  // 2) une courte séquence (3 à 6 mots) répétée au moins 3 fois
  for (let taille = 3; taille <= 6; taille++) {
    if (mots.length < taille * 3) continue;
    const motif = mots.slice(0, taille).join(' ');
    let rep = 0;
    for (let i = 0; i + taille <= mots.length; i += taille) { if (mots.slice(i, i + taille).join(' ') === motif) rep++; }
    if (rep >= 3) return true;
  }
  // 3) échos connus du prompt qui dominent un texte peu varié
  if (echos.some(e => sansAccents.includes(e)) && uniq / mots.length < 0.5) return true;
  return false;
}

module.exports = { fmtLong, fmtShort, daysSince, parisOffsetHours, _fmtDollars, transcriptionHallucinee };
