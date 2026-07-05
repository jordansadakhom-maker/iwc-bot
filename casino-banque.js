// ═══════════════════════════════════════════════════════════════
// casino-banque.js — Compteur de « sous » du saloon, PERSISTANT et PARTAGÉ entre
// tous les jeux (blackjack, poker menteur, faro, poker, cinq doigts, dominos).
// Isolé sous db.casinoSoldes : n'a AUCUN lien avec la trésorerie / les pépites /
// l'économie RP réelle. C'est un simple cumul de jetons de jeu par joueur.
// ═══════════════════════════════════════════════════════════════
let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

function _d() { const d = loadDB(); if (!d.casinoSoldes || typeof d.casinoSoldes !== 'object') d.casinoSoldes = {}; return d; }

// Solde persistant d'un joueur (peut être négatif = dette envers la maison).
function solde(userId) { try { return _d().casinoSoldes[userId] || 0; } catch { return 0; } }

// Crédite (montant &lt; 0 = débite) un joueur, renvoie le nouveau solde.
function crediter(userId, montant) {
  try { const d = _d(); d.casinoSoldes[userId] = (d.casinoSoldes[userId] || 0) + Math.round(montant || 0); saveDB(d); return d.casinoSoldes[userId]; }
  catch { return solde(userId); }
}

// Crédite plusieurs joueurs en UNE seule écriture (fin de manche).
// list = [{ userId, montant }]
function crediterLot(list) {
  try {
    const d = _d();
    for (const e of (list || [])) { if (!e || !e.userId) continue; d.casinoSoldes[e.userId] = (d.casinoSoldes[e.userId] || 0) + Math.round(e.montant || 0); }
    saveDB(d); return d.casinoSoldes;
  } catch { return {}; }
}

// Classement des plus gros gains (top n).
function classement(n) {
  try { return Object.entries(_d().casinoSoldes).sort((a, b) => b[1] - a[1]).slice(0, n || 5); }
  catch { return []; }
}

module.exports = { solde, crediter, crediterLot, classement };
