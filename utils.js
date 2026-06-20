// ───────────────────────────────────────────────────────────────────────────
//  utils.js — Fonctions utilitaires PURES, extraites d'index.js à l'identique.
//  Aucun rôle, aucune permission, aucune synchronisation, aucun ID ici :
//  uniquement du formatage. Comportement strictement inchangé.
// ───────────────────────────────────────────────────────────────────────────

function fmtLong(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

module.exports = { fmtLong, fmtShort };
