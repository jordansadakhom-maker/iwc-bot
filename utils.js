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
  // Marqueurs Whisper INDÉNIABLES (n'apparaissent jamais dans une vraie scène RP) → rejet direct
  const echosDurs = ["sous-titres realises par", "merci d'avoir regarde", "abonnez-vous", "amara.org"];
  // Échos « mous » (possibles mais suspects) → rejet seulement si le texte est par ailleurs peu varié
  const echosMous = ["ouest americain en 1895", "jeu de role western", "jeu de l'ouest", "voix off"];
  const mots = sansAccents.replace(/[.,;:!?()«»"']/g, ' ').split(/\s+/).filter(Boolean);
  // ── Filtre rendu PLUS TOLÉRANT (moins de faux positifs sur de vraies notes) ──
  // On ne juge qu'à partir de 8 mots (avant : 6) : une note courte n'est jamais rejetée.
  if (mots.length < 8) return false;
  const uniq = new Set(mots).size;
  const diversite = uniq / mots.length;
  // 1) diversité de mots EXTRÊMEMENT faible (avant : < 0.25 → maintenant < 0.18) :
  //    il faut vraiment du charabia répété en boucle pour être rejeté.
  if (diversite < 0.18) return true;
  // 2) une courte séquence (3 à 6 mots) répétée au moins 4 fois (avant : 3) :
  //    une phrase répétée 3× (insistance RP) ne déclenche plus.
  for (let taille = 3; taille <= 6; taille++) {
    if (mots.length < taille * 4) continue;
    const motif = mots.slice(0, taille).join(' ');
    let rep = 0;
    for (let i = 0; i + taille <= mots.length; i += taille) { if (mots.slice(i, i + taille).join(' ') === motif) rep++; }
    if (rep >= 4) return true;
  }
  // 3a) marqueur Whisper indéniable présent → rejet direct (aucun risque pour de vraies notes)
  if (echosDurs.some(e => sansAccents.includes(e))) return true;
  // 3b) écho « mou » dans un texte par ailleurs peu varié
  if (echosMous.some(e => sansAccents.includes(e)) && diversite < 0.5) return true;
  return false;
}

module.exports = { fmtLong, fmtShort, daysSince, parisOffsetHours, _fmtDollars, transcriptionHallucinee };
