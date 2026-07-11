// ───────────────────────────────────────────────────────────────────────────
//  pokertable.js — TABLE DE POKER MULTIJOUEUR du saloon (inspirée d'unmasked.poker).
//  Module 100 % ISOLÉ, préfixe pkt_. Remplace le bouton « Poker » du saloon.
//  Deux variantes : TEXAS HOLD'EM (défaut) et 5-CARTES (draw) — toutes deux avec
//  de VRAIES enchères multijoueurs : blindes, bouton donneur qui tourne, tours
//  d'enchères (coucher/checker/suivre/relancer/tapis), pot & POTS SECONDAIRES
//  (side-pots), cave (buy-in), abattage, et suivi des gains de la soirée.
//
//  Jetons de table (casino-banque) : le NET de chaque joueur est réglé à la
//  banque de soirée quand il se lève ou à la fermeture. Aucune économie
//  IWC/Confrérie touchée.
//
//  Ce fichier contient d'abord le MOTEUR (fonctions pures, testables), puis
//  l'interface Discord.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }

const PREFIXE = 'pkt_';
const MIN_JOUEURS = 2, MAX_JOUEURS = 8;
const CAVE_DEF = 100, CAVE_MAX = 100;          // cave (buy-in) plafonnée à 100 $ (thème saloon)
const SB_DEF = 1, BB_DEF = 2;

// ═══════════════════════════════════════════════════════════════════════════
//  CARTES & ÉVALUATION (logique éprouvée reprise du module poker, + 7 cartes)
// ═══════════════════════════════════════════════════════════════════════════
const RANGS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const COULEURS = ['♠', '♥', '♦', '♣'];
const NOMS = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];

function _rval(r) { if (r === 'A') return 14; if (r === 'K') return 13; if (r === 'Q') return 12; if (r === 'J') return 11; return parseInt(r, 10); }
function _fmtCarte(c) { return '`' + c.r + c.s + '`'; }
function _fmtMain(main) { return main.map(_fmtCarte).join(' '); }
function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function _construireDeck() {
  const d = [];
  for (const c of COULEURS) for (const r of RANGS) d.push({ r, s: c });
  for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}
function _piocher(t) { if (!t.deck.length) t.deck = _construireDeck(); return t.deck.pop(); }

// Évalue EXACTEMENT 5 cartes → { cat, tie, nom }.
function _evaluer(main) {
  const vals = main.map(c => _rval(c.r)).sort((a, b) => b - a);
  const suits = main.map(c => c.s);
  const flush = suits.every(s => s === suits[0]);
  const cnt = {};
  for (const v of vals) cnt[v] = (cnt[v] || 0) + 1;
  const groupes = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a);
  const effectifs = groupes.map(v => cnt[v]);
  const uniq = [...new Set(vals)];
  let quinte = false, quinteHaute = 0;
  if (uniq.length === 5) {
    const mx = Math.max(...uniq), mn = Math.min(...uniq);
    if (mx - mn === 4) { quinte = true; quinteHaute = mx; }
    else if (uniq.includes(14) && uniq.includes(5) && uniq.includes(4) && uniq.includes(3) && uniq.includes(2)) { quinte = true; quinteHaute = 5; }
  }
  let cat, tie;
  if (quinte && flush) { cat = 8; tie = [quinteHaute]; }
  else if (effectifs[0] === 4) { cat = 7; tie = groupes; }
  else if (effectifs[0] === 3 && effectifs[1] === 2) { cat = 6; tie = groupes; }
  else if (flush) { cat = 5; tie = vals; }
  else if (quinte) { cat = 4; tie = [quinteHaute]; }
  else if (effectifs[0] === 3) { cat = 3; tie = groupes; }
  else if (effectifs[0] === 2 && effectifs[1] === 2) { cat = 2; tie = groupes; }
  else if (effectifs[0] === 2) { cat = 1; tie = groupes; }
  else { cat = 0; tie = vals; }
  return { cat, tie, nom: NOMS[cat] };
}
function _compare(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < n; i++) { const x = a.tie[i] || 0, y = b.tie[i] || 0; if (x !== y) return x - y; }
  return 0;
}
// Toutes les combinaisons de k éléments parmi arr.
function _combinaisons(arr, k) {
  const res = [];
  const rec = (start, combo) => {
    if (combo.length === k) { res.push(combo.slice()); return; }
    for (let i = start; i < arr.length; i++) { combo.push(arr[i]); rec(i + 1, combo); combo.pop(); }
  };
  rec(0, []);
  return res;
}
// Meilleure main de 5 cartes parmi 5 à 7 cartes → { cat, tie, nom, cartes }.
function _evaluerMeilleure(cartes) {
  if (cartes.length <= 5) { const e = _evaluer(cartes); e.cartes = cartes.slice(); return e; }
  let best = null;
  for (const c5 of _combinaisons(cartes, 5)) {
    const e = _evaluer(c5);
    if (!best || _compare(e, best) > 0) { best = e; best.cartes = c5; }
  }
  return best;
}

// ═══════════════════════════════════════════════════════════════════════════
//  ÉTAT DE TABLE & HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function _nouvelleTable({ channelId, guildId, hoteId, hoteNom }) {
  return {
    channelId, guildId, hoteId, hoteNom,
    variante: 'holdem',          // 'holdem' | 'draw'
    phase: 'lobby',              // 'lobby' | 'main' | 'fin'
    sb: SB_DEF, bb: BB_DEF,
    sieges: [],                  // voir _nouveauSiege
    boutonIdx: -1,               // index du bouton donneur (siège)
    deck: [], board: [], pot: 0,
    rue: null,                   // holdem: 'preflop'|'flop'|'turn'|'river' ; draw: 'mise1'|'draw'|'mise2'
    currentBet: 0, minRaise: BB_DEF, tourIdx: -1,
    handNo: 0,
    dernier: '',                 // dernière action (log court)
    resultatTexte: '',
    msg: null, messageId: null, timer: null,
  };
}
function _nouveauSiege(userId, nom, cave) {
  return { userId, nom, stack: cave, caveTotale: cave,
    inHand: false, folded: false, allin: false,
    committed: 0, totalCommitted: 0, hasActed: false, cartes: [], drawn: false };
}
function _siege(t, uid) { return t.sieges.find(s => s.userId === uid); }
function _idx(t, uid) { return t.sieges.findIndex(s => s.userId === uid); }
function _peutAgir(s) { return s.inHand && !s.folded && !s.allin && s.stack > 0; }
function _enJeu(t) { return t.sieges.filter(s => s.inHand && !s.folded); }       // encore dans le coup
// Siège suivant (circulaire) à partir de `from` (exclus) qui satisfait pred.
function _suivant(t, from, pred) {
  const n = t.sieges.length;
  for (let k = 1; k <= n; k++) { const i = (from + k) % n; if (pred(t.sieges[i], i)) return i; }
  return -1;
}

// ═══════════════════════════════════════════════════════════════════════════
//  MISES & ENCHÈRES
// ═══════════════════════════════════════════════════════════════════════════
function _miser(t, s, montant) {
  const m = Math.min(montant, s.stack);
  s.stack -= m; s.committed += m; s.totalCommitted += m; t.pot += m;
  if (s.stack === 0) s.allin = true;
  return m;
}
// Tous les joueurs POUVANT ENCORE AGIR ont-ils parlé et égalisé la mise ?
function _toutAppele(t) {
  const peut = t.sieges.filter(_peutAgir);
  if (peut.length === 0) return true;
  return peut.every(s => s.hasActed && s.committed === t.currentBet);
}
// Prochain siège devant agir après `from`.
function _prochainActeur(t, from) {
  return _suivant(t, from, s => _peutAgir(s) && (!s.hasActed || s.committed < t.currentBet));
}

// Applique une action du siège au trait. action ∈ 'fold'|'check'|'call'|'raise'|'allin'.
// montant = total visé CE TOUR pour 'raise' (mise cumulée du joueur ce tour).
// Renvoie { ok, err } ; en cas d'ok, avance l'état (rue/abattage) via _resoudre.
function _agir(t, s, action, montant) {
  if (t.phase !== 'main') return { ok: false, err: 'Aucune main en cours.' };
  if (t.sieges[t.tourIdx] !== s) return { ok: false, err: 'Ce n\'est pas ton tour.' };
  if (!_peutAgir(s)) return { ok: false, err: 'Tu ne peux pas agir (couché ou à tapis).' };
  const nom = s.nom;

  if (action === 'fold') {
    s.folded = true; s.hasActed = true;
    t.dernier = `🏳️ ${nom} se couche.`;
  } else if (action === 'check') {
    if (s.committed !== t.currentBet) return { ok: false, err: 'Impossible de checker : il y a une mise à suivre.' };
    s.hasActed = true;
    t.dernier = `✔️ ${nom} parle (check).`;
  } else if (action === 'call') {
    const need = t.currentBet - s.committed;
    if (need <= 0) return { ok: false, err: 'Rien à suivre — checke plutôt.' };
    const paye = _miser(t, s, need);
    s.hasActed = true;
    t.dernier = s.allin ? `🅰️ ${nom} suit à tapis (${_money(paye)}).` : `📞 ${nom} suit (${_money(paye)}).`;
  } else if (action === 'raise' || action === 'allin') {
    let cible;
    if (action === 'allin') cible = s.committed + s.stack;                    // tout ce qu'il a
    else cible = Math.floor(montant);
    // borne mini d'une relance : currentBet + minRaise (sauf tapis plus petit)
    const miseMini = t.currentBet + t.minRaise;
    const estTapis = (cible >= s.committed + s.stack);
    if (cible >= s.committed + s.stack) cible = s.committed + s.stack;        // plafonné au tapis
    if (cible <= t.currentBet) {
      // pas une vraie relance
      if (estTapis) {
        // tapis court qui n'atteint pas la relance mini → traité comme un simple suivi partiel/tapis
        const paye = _miser(t, s, cible - s.committed);
        s.hasActed = true;
        t.dernier = `🅰️ ${nom} fait tapis (${_money(paye)}).`;
        return _finAction(t, s, true);
      }
      return { ok: false, err: `Relance trop faible. Minimum : ${_money(miseMini)}.` };
    }
    if (!estTapis && cible < miseMini) return { ok: false, err: `Relance trop faible. Minimum : ${_money(miseMini)}.` };
    const supplement = cible - s.committed;
    if (supplement > s.stack) return { ok: false, err: 'Tu n\'as pas assez de jetons.' };
    const increment = cible - t.currentBet;                                   // taille de la relance
    _miser(t, s, supplement);
    // relance complète → réinitialise la parole des autres
    if (increment >= t.minRaise) { t.minRaise = increment; }
    t.currentBet = Math.max(t.currentBet, s.committed);
    for (const o of t.sieges) if (o !== s && _peutAgir(o)) o.hasActed = false;
    s.hasActed = true;
    t.dernier = s.allin ? `🅰️ ${nom} fait tapis à ${_money(t.currentBet)} !` : `⬆️ ${nom} relance à ${_money(t.currentBet)}.`;
  } else {
    return { ok: false, err: 'Action inconnue.' };
  }
  return _finAction(t, s, true);
}

// Après une action valide : décide de la suite (fin de coup / fin de ronde / joueur suivant).
function _finAction(t) {
  if (_enJeu(t).length <= 1) { _terminerParAbandon(t); return { ok: true, fin: 'abandon' }; }
  if (_toutAppele(t)) { _finRonde(t); return { ok: true, fin: 'ronde' }; }
  const nx = _prochainActeur(t, t.tourIdx);
  if (nx < 0) { _finRonde(t); return { ok: true, fin: 'ronde' }; }
  t.tourIdx = nx;
  return { ok: true, fin: null };
}

// Un seul joueur reste → il rafle le pot, sans abattage.
function _terminerParAbandon(t) {
  const reste = _enJeu(t);
  const g = reste[0];
  if (g) { g.stack += t.pot; t.resultatTexte = `🏆 **${g.nom}** rafle le pot de **${_money(t.pot)}** — tout le monde s'est couché.`; }
  t.pot = 0;
  _finDeMain(t);
}

// Fin d'une ronde d'enchères → abattage, rue suivante, ou déroulé du tableau.
function _finRonde(t) {
  // plus assez de joueurs pouvant miser → on déroule le reste puis abattage
  const peut = t.sieges.filter(_peutAgir);
  if (t.variante === 'holdem') {
    if (t.rue === 'river') return _abattage(t);
    if (peut.length < 2) { while (t.board.length < 5) _dealStreet(t); return _abattage(t); }
    _prochaineRue(t);
  } else { // draw
    if (t.rue === 'mise2') return _abattage(t);
    if (t.rue === 'mise1') {
      if (peut.length < 2) return _abattage(t);     // plus de mise possible → abattage direct
      t.rue = 'draw';                                // phase d'échange (pilotée par l'UI)
      for (const s of _enJeu(t)) s.drawn = false;
    }
  }
}

function _dealStreet(t) {
  if (t.board.length === 0) { _piocher(t); t.board.push(_piocher(t), _piocher(t), _piocher(t)); t.rue = 'flop'; }
  else if (t.board.length === 3) { _piocher(t); t.board.push(_piocher(t)); t.rue = 'turn'; }
  else if (t.board.length === 4) { _piocher(t); t.board.push(_piocher(t)); t.rue = 'river'; }
}
function _resetRonde(t) {
  for (const s of t.sieges) { s.committed = 0; s.hasActed = false; }
  t.currentBet = 0; t.minRaise = t.bb;
}
function _prochaineRue(t) {
  _dealStreet(t);
  _resetRonde(t);
  const first = _suivant(t, t.boutonIdx, s => _peutAgir(s));
  t.tourIdx = first;
}

// Fin de la phase d'échange (draw) → 2e ronde d'enchères.
function _finDraw(t) {
  _resetRonde(t);
  t.rue = 'mise2';
  const first = _suivant(t, t.boutonIdx, s => _peutAgir(s));
  if (first < 0) return _abattage(t);
  t.tourIdx = first;
}

// ═══════════════════════════════════════════════════════════════════════════
//  POTS SECONDAIRES (side-pots) & ABATTAGE
// ═══════════════════════════════════════════════════════════════════════════
// Construit les pots à partir des contributions totales de chaque siège.
// Renvoie [{ montant, eligibles:[siege,...] }] (eligibles = non couchés ayant misé à ce palier).
function _construirePots(t) {
  const c = t.sieges.map(s => ({ s, reste: s.totalCommitted, folded: s.folded }));
  const pots = [];
  while (c.some(x => x.reste > 0)) {
    const min = Math.min(...c.filter(x => x.reste > 0).map(x => x.reste));
    let montant = 0; const eligibles = [];
    for (const x of c) {
      if (x.reste > 0) { montant += min; x.reste -= min; if (!x.folded) eligibles.push(x.s); }
    }
    if (montant > 0) {
      // fusionne avec le pot précédent si mêmes éligibles (présentation)
      const prev = pots[pots.length - 1];
      if (prev && prev.eligibles.length === eligibles.length && prev.eligibles.every(e => eligibles.includes(e))) prev.montant += montant;
      else pots.push({ montant, eligibles });
    }
  }
  return pots;
}

function _abattage(t) {
  const pots = _construirePots(t);
  const enJeu = _enJeu(t);
  for (const s of enJeu) s.eval = _evaluerMeilleure(t.variante === 'holdem' ? s.cartes.concat(t.board) : s.cartes);
  const gains = {};             // userId -> montant gagné
  const lignes = [];
  pots.forEach((pot, i) => {
    const cands = pot.eligibles.filter(s => enJeu.includes(s));
    if (!cands.length) return;
    let best = null;
    for (const s of cands) if (!best || _compare(s.eval, best.eval) > 0) best = s;
    const gagnants = cands.filter(s => _compare(s.eval, best.eval) === 0);
    const part = Math.floor(pot.montant / gagnants.length);
    let reste = pot.montant - part * gagnants.length;
    for (const g of gagnants) {
      let gain = part; if (reste > 0) { gain += 1; reste -= 1; }
      g.stack += gain; gains[g.userId] = (gains[g.userId] || 0) + gain;
    }
    const nomPot = pots.length > 1 ? (i === 0 ? 'Pot principal' : `Pot secondaire ${i}`) : 'Pot';
    lignes.push(`**${nomPot}** (${_money(pot.montant)}) → ${gagnants.map(g => `**${g.nom}** (${g.eval.nom})`).join(', ')}`);
  });
  t.pot = 0;
  t.resultatTexte = '🃏 **Abattage**\n' + lignes.join('\n');
  t._abattageDetail = enJeu.map(s => `${s.nom} : ${_fmtMain(s.cartes)} → *${s.eval.nom}*`).join('\n');
  _finDeMain(t);
}

function _finDeMain(t) {
  t.phase = 'fin';
  for (const s of t.sieges) { s.inHand = false; s.committed = 0; s.hasActed = false; }
  t.tourIdx = -1; t.rue = null;
}

// ═══════════════════════════════════════════════════════════════════════════
//  DÉMARRAGE D'UNE MAIN
// ═══════════════════════════════════════════════════════════════════════════
function _joueursPrets(t) { return t.sieges.filter(s => s.stack > 0 && !s.sittingOut); }

function _demarrerMain(t) {
  const prets = _joueursPrets(t);
  if (prets.length < MIN_JOUEURS) return { ok: false, err: `Il faut au moins ${MIN_JOUEURS} joueurs avec des jetons.` };
  t.handNo++;
  t.deck = _construireDeck();
  t.board = []; t.pot = 0; t.currentBet = 0; t.minRaise = t.bb; t.dernier = ''; t.resultatTexte = ''; t._abattageDetail = '';
  for (const s of t.sieges) {
    s.inHand = s.stack > 0 && !s.sittingOut;
    s.folded = false; s.allin = false; s.committed = 0; s.totalCommitted = 0; s.hasActed = false; s.cartes = []; s.drawn = false; s.eval = null;
  }
  // bouton donneur : avance au prochain siège en jeu
  t.boutonIdx = _suivant(t, t.boutonIdx, s => s.inHand);
  const enJeu = t.sieges.filter(s => s.inHand);
  const heads = enJeu.length === 2;

  // blindes
  let sbIdx, bbIdx;
  if (heads) { sbIdx = t.boutonIdx; bbIdx = _suivant(t, t.boutonIdx, s => s.inHand); }
  else { sbIdx = _suivant(t, t.boutonIdx, s => s.inHand); bbIdx = _suivant(t, sbIdx, s => s.inHand); }
  _miser(t, t.sieges[sbIdx], t.sb);
  _miser(t, t.sieges[bbIdx], t.bb);
  t.currentBet = t.bb; t.minRaise = t.bb;
  // les blindes ne comptent PAS comme « avoir parlé »
  t.sieges[sbIdx].hasActed = false; t.sieges[bbIdx].hasActed = false;

  // distribution
  const nCartes = t.variante === 'holdem' ? 2 : 5;
  for (let k = 0; k < nCartes; k++) for (const s of enJeu) s.cartes.push(_piocher(t));

  t.phase = 'main';
  t.rue = t.variante === 'holdem' ? 'preflop' : 'mise1';
  // premier à parler : après la BB (heads-up preflop : le bouton/SB), et
  // TOUJOURS un joueur qui peut réellement agir. Si personne ne peut miser
  // (tout le monde à tapis sur les blindes), on déroule directement l'abattage.
  let first;
  if (heads) first = _peutAgir(t.sieges[sbIdx]) ? sbIdx : _suivant(t, sbIdx, s => _peutAgir(s));
  else first = _suivant(t, bbIdx, s => _peutAgir(s));
  if (first < 0) { t.tourIdx = -1; _finRonde(t); }   // aucun joueur ne peut agir → déroulé + abattage
  else t.tourIdx = first;
  return { ok: true, sbIdx, bbIdx };
}

// Échange de cartes (variante draw) : indices 0-4 à jeter.
function _appliquerDraw(t, s, indices) {
  if (t.variante !== 'draw' || t.rue !== 'draw') return { ok: false, err: 'Pas en phase d\'échange.' };
  if (!s.inHand || s.folded) return { ok: false, err: 'Tu n\'es pas dans le coup.' };
  if (s.drawn) return { ok: false, err: 'Tu as déjà échangé.' };
  const uniq = [...new Set(indices.filter(i => i >= 0 && i < 5))];
  for (const i of uniq) s.cartes[i] = null;
  s.cartes = s.cartes.filter(Boolean);
  while (s.cartes.length < 5) s.cartes.push(_piocher(t));
  s.drawn = true;
  // tous les joueurs en jeu ont échangé → 2e ronde
  const reste = _enJeu(t);
  if (reste.every(x => x.drawn)) _finDraw(t);
  return { ok: true, nb: uniq.length };
}

// ═══════════════════════════════════════════════════════════════════════════
//  RÉGLAGE DES GAINS (net → banque de soirée)
// ═══════════════════════════════════════════════════════════════════════════
function _netSiege(s) { return s.stack - s.caveTotale; }
// Règle le net d'un siège à la banque puis le retire (cash-out).
function _cashOut(t, s) {
  const net = _netSiege(s);
  try { if (casino.crediter && net !== 0) casino.crediter(s.userId, net); } catch {}
  const i = _idx(t, s.userId);
  if (i >= 0) {
    t.sieges.splice(i, 1);
    if (i < t.boutonIdx) t.boutonIdx--;                        // garde le bouton donneur au bon siège
    if (t.boutonIdx >= t.sieges.length) t.boutonIdx = t.sieges.length - 1;
  }
  return net;
}

// Fait quitter un joueur (se lève). Pendant une main : se couche puis part à la fin.
function _quitter(t, s) {
  if (t.phase === 'main' && s.inHand && !s.folded) {
    if (t.sieges[t.tourIdx] === s) { _agir(t, s, 'fold'); }
    else { s.folded = true; s.hasActed = true; if (_enJeu(t).length <= 1) _terminerParAbandon(t); }
  }
  s.sittingOut = true; s.leaving = true;
  if (t.phase !== 'main') return _cashOut(t, s);
  return null;
}
// À la fin d'une main : encaisse les partants.
const _finDeMainOrig = _finDeMain;
_finDeMain = function (t) {
  _finDeMainOrig(t);
  for (const s of [...t.sieges]) if (s.leaving) _cashOut(t, s);
  if (t.boutonIdx >= t.sieges.length) t.boutonIdx = t.sieges.length - 1;
};

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU
// ═══════════════════════════════════════════════════════════════════════════
const _VAR = { holdem: 'Texas Hold\'em', draw: '5 Cartes (draw)' };
const _REGLES = [
  '📖 **TABLE DE POKER — COMMENT JOUER**',
  '',
  '**Rejoindre :** 🪑 **S\'asseoir** et pose ta **cave** (jetons, max 100 $). 2 à 8 joueurs. L\'hôte lance avec ▶️ **Distribuer**.',
  '',
  '**Texas Hold\'em :** 2 cartes privées + 5 cartes communes. Blindes, puis 4 tours d\'enchères (**pré-flop → flop → turn → river**). La meilleure main de 5 cartes rafle le pot.',
  '**5 Cartes (draw) :** 5 cartes privées, une enchère, un **échange** (🔄), une 2ᵉ enchère, puis l\'abattage.',
  '',
  '**À ton tour :** 🏳️ **Se coucher** · ✔️ **Checker** / 📞 **Suivre** · ⬆️ **Relancer** · 🅰️ **Tapis**.',
  '👁️ **Voir ma main** t\'affiche tes cartes en privé (à tout moment).',
  '',
  '**Pots secondaires :** si un joueur fait tapis pour moins, un pot secondaire se crée automatiquement — chacun ne peut gagner que ce qu\'il a pu couvrir.',
  '**Suivi des gains :** 💰 **Bilan** montre le net de chacun ; il est réglé à la banque de soirée quand on se lève.',
].join('\n');

function _ligneBoard(t) {
  if (t.variante !== 'holdem') return '';
  const b = t.board.map(_fmtCarte);
  while (b.length < 5) b.push('`▪▪`');
  return '🃏 **Tableau** ' + b.join(' ');
}
function _roleBlinde(t, i) {
  if (t.phase !== 'main' && t.phase !== 'fin') return '';
  return '';
}
function _ligneSiege(t, s, i) {
  const isTurn = t.phase === 'main' && i === t.tourIdx;
  const fleche = isTurn ? '➡️ ' : '　';
  const bouton = i === t.boutonIdx ? ' 🔘' : '';
  let etat = '';
  if (t.phase === 'main') {
    if (s.folded) etat = ' · *couché*';
    else if (s.allin) etat = ' · 🅰️ **tapis**';
    else if (s.committed > 0) etat = ` · mise ${_money(s.committed)}`;
  }
  const dort = s.sittingOut && !s.inHand ? ' · 💤' : '';
  return `${fleche}**${s.nom}**${bouton} — ${_money(s.stack)}${etat}${dort}`;
}

function _screenPayload(t) {
  const e = new EmbedBuilder().setColor(0x2E6B4F).setTitle(`♠️ TABLE DE POKER — ${_VAR[t.variante]}`);

  if (t.phase === 'lobby') {
    const lignes = [
      '*Tirez une chaise, posez vos jetons. On joue « comme à la maison ».*',
      '',
      `⚙️ Blindes : **${_money(t.sb)} / ${_money(t.bb)}** · Cave max **${_money(CAVE_MAX)}**`,
      '',
      t.sieges.length ? '**À la table :**\n' + t.sieges.map((s, i) => _ligneSiege(t, s, i)).join('\n') : '*Personne encore assis.*',
      '',
      t.sieges.length >= MIN_JOUEURS ? '✅ Prêt — l\'hôte peut **distribuer**.' : `👉 Encore ${MIN_JOUEURS - t.sieges.length} joueur(s) minimum.`,
    ];
    e.setDescription(lignes.join('\n')).setFooter({ text: `Hôte : ${t.hoteNom} · Saloon · jetons de table` });
    return { embeds: [e], components: _components(t) };
  }

  const desc = [];
  if (t.variante === 'holdem') desc.push(_ligneBoard(t), '');
  desc.push(`💰 **Pot : ${_money(t.pot)}**` + (t.currentBet > 0 && t.phase === 'main' ? ` · mise à suivre : ${_money(t.currentBet)}` : ''));
  desc.push('');
  desc.push(t.sieges.map((s, i) => _ligneSiege(t, s, i)).join('\n'));
  if (t.phase === 'main') {
    desc.push('');
    if (t.rue === 'draw') desc.push('🔄 **Phase d\'échange** — chaque joueur clique **Échanger**.');
    else {
      const cur = t.sieges[t.tourIdx];
      const rueNom = { preflop: 'Pré-flop', flop: 'Flop', turn: 'Turn', river: 'River', mise1: '1ʳᵉ enchère', mise2: '2ᵉ enchère' }[t.rue] || '';
      desc.push(`${rueNom} — au tour de **${cur ? cur.nom : '—'}**.`);
    }
    if (t.dernier) desc.push('› ' + t.dernier);
  } else { // fin
    desc.push('');
    if (t.resultatTexte) desc.push(t.resultatTexte);
  }
  e.setDescription(desc.join('\n')).setFooter({ text: `Main n°${t.handNo} · ${_VAR[t.variante]} · Saloon` });
  return { embeds: [e], components: _components(t) };
}

function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pkt_sit').setLabel('S\'asseoir').setEmoji('🪑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pkt_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pkt_deal').setLabel('Distribuer').setEmoji('▶️').setStyle(ButtonStyle.Primary).setDisabled(t.sieges.filter(s => s.stack > 0).length < MIN_JOUEURS),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pkt_variant').setLabel(t.variante === 'holdem' ? '→ 5 Cartes' : '→ Hold\'em').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pkt_blinds').setLabel('Blindes').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pkt_rules').setLabel('Règles').setEmoji('📖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pkt_bilan').setLabel('Bilan').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pkt_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
  }
  if (t.phase === 'main') {
    if (t.rue === 'draw') {
      rows.push(new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('pkt_draw').setLabel('Échanger').setEmoji('🔄').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('pkt_cards').setLabel('Voir ma main').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('pkt_skip').setLabel('Forcer la suite (hôte)').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      ));
      return rows;
    }
    const cur = t.sieges[t.tourIdx];
    const toCall = cur ? t.currentBet - cur.committed : 0;
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pkt_fold').setLabel('Se coucher').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('pkt_call').setLabel(toCall > 0 ? `Suivre (${_money(toCall)})` : 'Checker').setEmoji(toCall > 0 ? '📞' : '✔️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pkt_raise').setLabel('Relancer').setEmoji('⬆️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pkt_allin').setLabel('Tapis').setEmoji('🅰️').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pkt_cards').setLabel('Voir ma main').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pkt_skip').setLabel('Passer le joueur').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    ));
    return rows;
  }
  // fin
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pkt_deal').setLabel('Nouvelle main').setEmoji('▶️').setStyle(ButtonStyle.Success).setDisabled(t.sieges.filter(s => s.stack > 0).length < MIN_JOUEURS),
    new ButtonBuilder().setCustomId('pkt_sit').setLabel('S\'asseoir').setEmoji('🪑').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pkt_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pkt_cards').setLabel('Revoir les mains').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pkt_bilan').setLabel('Bilan').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pkt_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function _refresh(t) { try { if (t.msg) await t.msg.edit(_screenPayload(t)); } catch (e) { console.log('⚠️ pkt refresh:', e.message); } }

async function _envoyerMain(interaction, t, s) {
  const eph = MessageFlags.Ephemeral;
  if (!s.cartes.length) { await interaction.reply({ content: 'Tu n\'as pas de cartes (attends la distribution).', flags: eph }); return; }
  let txt = `🂠 **Ta main :** ${_fmtMain(s.cartes)}`;
  if (t.variante === 'holdem' && t.board.length) {
    const ev = _evaluerMeilleure(s.cartes.concat(t.board));
    txt += `\n🃏 Tableau : ${_fmtMain(t.board)}\n➡️ Meilleure combinaison : **${ev.nom}**`;
  } else if (t.variante === 'draw') {
    const ev = _evaluer(s.cartes);
    txt += `\n➡️ Actuellement : **${ev.nom}**`;
  }
  await interaction.reply({ content: txt, flags: eph });
}

// ═══════════════════════════════════════════════════════════════════════════
//  PANNEAU (le Saloon principal l'inclut déjà via le bouton pkt_open)
// ═══════════════════════════════════════════════════════════════════════════
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('♠️ SALOON — TABLE DE POKER')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   POKER · COMME À LA MAISON    ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Une vraie table : blindes, tours d\'enchères, pot et pots secondaires, abattage. Texas Hold\'em ou 5 Cartes.*',
      '',
      '♠️ Ouvre une table, invite les joueurs à **s\'asseoir**, et distribue. Jetons de table, suivi des gains de la soirée.',
      '',
      '👉 **Ouvrir une table** ci-dessous : tu en deviens l\'**hôte**.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('pkt_open').setLabel('Ouvrir une table de Poker').setEmoji('♠️').setStyle(ButtonStyle.Success))] };
}
async function installerPanelPoker(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('TABLE DE POKER');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ pkt panel:', e.message); return null; }
}

const tables = new Map(); // channelId -> table

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTEUR
// ═══════════════════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    if (interaction.isButton() && id === 'pkt_open') {
      const dejaLa = tables.get(interaction.channelId);
      if (dejaLa) {
        const vivante = await dejaLa.msg?.fetch?.().then(() => true).catch(() => false);
        if (vivante) { await interaction.reply({ content: '♠️ Une table de poker est déjà ouverte ici. Rejoins-la plus haut !', flags: eph }); return true; }
        tables.delete(interaction.channelId); // le message a disparu → on repart proprement
      }
      await interaction.deferReply({ flags: eph });
      const t = _nouvelleTable({ channelId: interaction.channelId, guildId: interaction.guild?.id, hoteId: interaction.user.id, hoteNom: interaction.member?.displayName || interaction.user.username });
      const msg = await interaction.channel.send(_screenPayload(t)).catch(() => null);
      if (!msg) { await interaction.editReply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).' }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.editReply({ content: '♠️ Table ouverte — tu en es l\'**hôte**. Assieds-toi et invite les joueurs 👇' });
      return true;
    }

    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau ♠️.', flags: eph }).catch(() => {}); } return true; }

    // ── Extras ──
    if (interaction.isButton() && id === 'pkt_rules') { await interaction.reply({ content: _REGLES, flags: eph }); return true; }
    if (interaction.isButton() && id === 'pkt_bilan') {
      const lignes = t.sieges.map(s => { const net = _netSiege(s); return `${net >= 0 ? '🟢' : '🔴'} **${s.nom}** — ${_money(s.stack)} en jeu · net ${net >= 0 ? '+' : ''}${_money(net)}`; });
      await interaction.reply({ content: '💰 **Bilan de la table**\n' + (lignes.join('\n') || '*Table vide.*') + `\n\n🏦 Ton solde de soirée : ${_money(casino.solde ? casino.solde(interaction.user.id) : 0)}`, flags: eph });
      return true;
    }
    if (interaction.isButton() && id === 'pkt_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      for (const s of [...t.sieges]) _cashOut(t, s);          // règle tout le monde
      tables.delete(interaction.channelId);
      try { if (t.msg) await t.msg.edit({ content: '🔒 Table de poker fermée — les gains ont été réglés.', embeds: [], components: [] }); } catch {}
      await interaction.reply({ content: '🔒 Table fermée, comptes réglés.', flags: eph });
      return true;
    }
    if (interaction.isButton() && id === 'pkt_cards') {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: '👀 Tu n\'es pas assis à cette table.', flags: eph }); return true; }
      if (t.phase === 'fin' && t._abattageDetail) { await interaction.reply({ content: '🃏 **Mains abattues :**\n' + t._abattageDetail, flags: eph }); return true; }
      await _envoyerMain(interaction, t, s); return true;
    }

    // ── Lobby : variante / blindes ──
    if (interaction.isButton() && id === 'pkt_variant') {
      if (t.phase === 'main') { await interaction.reply({ content: 'On ne change pas de variante en pleine main.', flags: eph }); return true; }
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte choisit la variante.', flags: eph }); return true; }
      t.variante = t.variante === 'holdem' ? 'draw' : 'holdem';
      await interaction.deferUpdate().catch(() => {}); await _refresh(t); return true;
    }
    if (interaction.isButton() && id === 'pkt_blinds') {
      if (t.phase === 'main') { await interaction.reply({ content: 'Pas en pleine main.', flags: eph }); return true; }
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte fixe les blindes.', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('pkt_blinds_modal').setTitle('⚙️ Blindes')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sb').setLabel('Petite blinde ($)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(t.sb))),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('bb').setLabel('Grosse blinde ($)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(t.bb))),
        );
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pkt_blinds_modal') {
      let sb = parseInt((interaction.fields.getTextInputValue('sb') || '').replace(/[^0-9]/g, ''), 10);
      let bb = parseInt((interaction.fields.getTextInputValue('bb') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(sb) || sb < 1) sb = 1;
      if (sb > CAVE_MAX) sb = CAVE_MAX;
      if (!Number.isFinite(bb) || bb < sb) bb = sb * 2;
      if (bb > CAVE_MAX) bb = CAVE_MAX;
      if (sb > bb) sb = bb;              // la petite blinde ne dépasse jamais la grosse
      t.sb = sb; t.bb = bb; t.minRaise = bb;
      await interaction.reply({ content: `⚙️ Blindes réglées : **${_money(sb)} / ${_money(bb)}**.`, flags: eph });
      await _refresh(t); return true;
    }

    // ── S'asseoir (cave) ──
    if (interaction.isButton() && id === 'pkt_sit') {
      if (_siege(t, interaction.user.id)) { await interaction.reply({ content: '🪑 Tu es déjà à la table.', flags: eph }); return true; }
      if (t.sieges.length >= MAX_JOUEURS) { await interaction.reply({ content: `La table est complète (${MAX_JOUEURS} joueurs).`, flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('pkt_sit_modal').setTitle('🪑 S\'asseoir à la table')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cave').setLabel(`Ta cave en jetons (max ${CAVE_MAX} $)`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setPlaceholder('Ex : 100')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pkt_sit_modal') {
      if (_siege(t, interaction.user.id)) { await interaction.reply({ content: 'Déjà assis.', flags: eph }); return true; }
      if (t.sieges.length >= MAX_JOUEURS) { await interaction.reply({ content: 'Table complète.', flags: eph }); return true; }
      let cave = parseInt((interaction.fields.getTextInputValue('cave') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(cave) || cave < 1) cave = CAVE_DEF;
      if (cave > CAVE_MAX) cave = CAVE_MAX;
      const nom = interaction.member?.displayName || interaction.user.username;
      t.sieges.push(_nouveauSiege(interaction.user.id, nom, cave));
      await interaction.reply({ content: `🪑 Tu t'assieds avec **${_money(cave)}**.` + (t.phase === 'main' ? ' Tu entres à la **prochaine main**.' : ''), flags: eph });
      await _refresh(t); return true;
    }

    // ── Se lever ──
    if (interaction.isButton() && id === 'pkt_leave') {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: 'Tu n\'es pas à la table.', flags: eph }); return true; }
      const net = _quitter(t, s);
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      if (net !== null) { try { await interaction.followUp({ content: `🚪 Tu te lèves. Net réglé : **${net >= 0 ? '+' : ''}${_money(net)}**.`, flags: eph }); } catch {} }
      else { try { await interaction.followUp({ content: '🚪 Tu quitteras la table **à la fin de la main** (comptes réglés à ce moment).', flags: eph }); } catch {} }
      return true;
    }

    // ── Distribuer / Nouvelle main ──
    if (interaction.isButton() && id === 'pkt_deal') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut distribuer.', flags: eph }); return true; }
      if (t.phase === 'main') { await interaction.reply({ content: 'Une main est déjà en cours.', flags: eph }); return true; }
      const r = _demarrerMain(t);
      if (!r.ok) { await interaction.reply({ content: '⚠️ ' + r.err, flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      return true;
    }

    // ── Échange (draw) ──
    if (interaction.isButton() && id === 'pkt_draw') {
      const s = _siege(t, interaction.user.id);
      if (!s || !s.inHand || s.folded) { await interaction.reply({ content: 'Tu n\'es pas dans le coup.', flags: eph }); return true; }
      if (t.rue !== 'draw') { await interaction.reply({ content: 'Ce n\'est pas la phase d\'échange.', flags: eph }); return true; }
      if (s.drawn) { await interaction.reply({ content: 'Tu as déjà échangé.', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('pkt_draw_modal').setTitle('🔄 Échanger des cartes')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('jeter').setLabel('Cartes à jeter (positions 1-5, ex : 1 3 5)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(12).setPlaceholder('Laisse vide pour tout garder')));
      // rappel des cartes
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pkt_draw_modal') {
      const s = _siege(t, interaction.user.id);
      if (!s || t.rue !== 'draw' || s.drawn) { await interaction.reply({ content: 'Échange impossible maintenant.', flags: eph }); return true; }
      const raw = (interaction.fields.getTextInputValue('jeter') || '');
      const indices = (raw.match(/[1-5]/g) || []).map(x => parseInt(x, 10) - 1);
      const av = s.cartes.slice();
      const r = _appliquerDraw(t, s, indices);
      await interaction.reply({ content: r.ok ? (r.nb ? `🔄 Tu échanges **${r.nb}** carte(s).\nAncienne main : ${_fmtMain(av)}\nNouvelle main : ${_fmtMain(s.cartes)}` : '✋ Tu gardes ta main.') : '⚠️ ' + r.err, flags: eph });
      await _refresh(t); return true;
    }

    // ── Actions d'enchère ──
    if (interaction.isButton() && (id === 'pkt_fold' || id === 'pkt_call' || id === 'pkt_allin')) {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: '👀 Tu n\'es pas à cette table.', flags: eph }); return true; }
      if (t.phase !== 'main') { await interaction.reply({ content: 'Aucune main en cours.', flags: eph }); return true; }
      if (t.sieges[t.tourIdx] !== s) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour.', flags: eph }); return true; }
      const action = id === 'pkt_fold' ? 'fold' : id === 'pkt_allin' ? 'allin' : (t.currentBet - s.committed > 0 ? 'call' : 'check');
      const r = _agir(t, s, action);
      if (!r.ok) { await interaction.reply({ content: '⚠️ ' + r.err, flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t); return true;
    }
    if (interaction.isButton() && id === 'pkt_raise') {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: '👀 Tu n\'es pas à cette table.', flags: eph }); return true; }
      if (t.phase !== 'main' || t.sieges[t.tourIdx] !== s) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour.', flags: eph }); return true; }
      const min = t.currentBet + t.minRaise;
      const modal = new ModalBuilder().setCustomId('pkt_raise_modal').setTitle('⬆️ Relancer')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel(`Monter la mise à combien ? (min ${min})`).setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setPlaceholder(`Ex : ${min}`)));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pkt_raise_modal') {
      const s = _siege(t, interaction.user.id);
      if (!s || t.phase !== 'main' || t.sieges[t.tourIdx] !== s) { await interaction.reply({ content: 'Ce n\'est plus ton tour.', flags: eph }); return true; }
      let montant = parseInt((interaction.fields.getTextInputValue('montant') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(montant)) { await interaction.reply({ content: '⚠️ Montant invalide.', flags: eph }); return true; }
      const r = _agir(t, s, 'raise', montant);
      if (!r.ok) { await interaction.reply({ content: '⚠️ ' + r.err, flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t); return true;
    }

    // ── Passer le joueur / forcer la suite (hôte) ──
    if (interaction.isButton() && id === 'pkt_skip') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Réservé à l\'hôte.', flags: eph }); return true; }
      if (t.phase !== 'main') { await interaction.reply({ content: 'Rien à passer.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      if (t.rue === 'draw') {
        // débloque une phase d'échange figée : les joueurs restants gardent leur main
        for (const s of _enJeu(t)) if (!s.drawn) s.drawn = true;
        _finDraw(t);
      } else {
        const cur = t.sieges[t.tourIdx];
        if (cur) { const action = (t.currentBet - cur.committed > 0) ? 'fold' : 'check'; _agir(t, cur, action); }
      }
      await _refresh(t); return true;
    }

    // filet de sécurité : tout pkt_* non géré est quand même acquitté (jamais « interaction failed »)
    if ((interaction.isButton?.() || interaction.isModalSubmit?.()) && !interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate().catch(() => {});
    }
    return true;
  } catch (e) {
    console.log('❌ pokertable routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Un pépin à la table. Réessaie.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelPoker,
  __engine: {
    RANGS, COULEURS, _rval, _evaluer, _compare, _evaluerMeilleure, _combinaisons, _construireDeck,
    _nouvelleTable, _nouveauSiege, _demarrerMain, _agir, _appliquerDraw, _construirePots, _abattage,
    _peutAgir, _enJeu, _netSiege, _money, _fmtMain, _screenPayload, _components, tables,
  },
};
