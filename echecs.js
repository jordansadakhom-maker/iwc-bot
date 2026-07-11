// ───────────────────────────────────────────────────────────────────────────
//  echecs.js — ÉCHECS jouables à deux dans le saloon RP. Module 100 % ISOLÉ,
//  préfixe ech_. N'écrit RIEN dans l'économie réelle : la mise éventuelle du duel
//  est un JETON de table (casino-banque), comme le blackjack. Aucune fonction
//  IWC/Confrérie touchée.
//
//  MOTEUR COMPLET & CORRECT :
//   • Tous les coups légaux (pions, cavaliers, fous, tours, dame, roi).
//   • Roque (petit / grand) avec toutes les conditions (roi/tour intacts, cases
//     vides, roi ni en échec ni traversant une case attaquée).
//   • Prise en passant. Promotion (dame par défaut, ou pièce choisie).
//   • Détection d'échec, d'ÉCHEC ET MAT et de PAT. Nulle (matériel insuffisant,
//     règle des 50 coups), abandon, proposition de nulle.
//
//  SAISIE : coup en notation de cases « e2e4 » (ou « e2 e4 », « O-O », « e7e8D »).
//  Plateau rendu en bloc de code : MAJUSCULES = Blancs ⚪, minuscules = Noirs ⚫.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }

const PREFIXE = 'ech_';
const MISE_MIN = 0, MISE_MAX = 100;

const tables = new Map(); // channelId -> partie

const _sous = uid => (casino.solde ? casino.solde(uid) : 0);
function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

// ═══════════════════════════════════════════════════════════════════════════
//  MOTEUR D'ÉCHECS (fonctions pures, testables)
// ═══════════════════════════════════════════════════════════════════════════
// board[r][c] : r=0 → rangée 8 (haut, Noirs), r=7 → rangée 1 (bas, Blancs).
//               c=0 → colonne a, c=7 → colonne h.
// Pièces : MAJUSCULE = Blanc (P N B R Q K), minuscule = Noir (p n b r q k), '.' vide.

function initBoard() {
  const back = ['r', 'n', 'b', 'q', 'k', 'b', 'n', 'r'];
  const b = [];
  b[0] = back.slice();                          // rangée 8 — pièces noires
  b[1] = Array(8).fill('p');                    // rangée 7 — pions noirs
  for (let r = 2; r <= 5; r++) b[r] = Array(8).fill('.');
  b[6] = Array(8).fill('P');                    // rangée 2 — pions blancs
  b[7] = back.map(x => x.toUpperCase());        // rangée 1 — pièces blanches
  return b;
}
function cloneBoard(b) { return b.map(r => r.slice()); }
function isW(p) { return p !== '.' && p === p.toUpperCase(); }
function isB(p) { return p !== '.' && p === p.toLowerCase(); }
function colorOf(p) { return p === '.' ? null : (isW(p) ? 'w' : 'b'); }
function enemy(c) { return c === 'w' ? 'b' : 'w'; }
function onB(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }
function sqName(r, c) { return 'abcdefgh'[c] + (8 - r); }
function parseSq(s) {
  if (!s || s.length < 2) return null;
  const c = 'abcdefgh'.indexOf(s[0].toLowerCase());
  const r = 8 - parseInt(s[1], 10);
  if (c < 0 || !onB(r, c)) return null;
  return { r, c };
}
function findKing(board, color) {
  const k = color === 'w' ? 'K' : 'k';
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) if (board[r][c] === k) return { r, c };
  return null;
}

const KNIGHT = [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]];
const KINGD = [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];
const DIAG = [[-1,-1],[-1,1],[1,-1],[1,1]];
const ORTH = [[-1,0],[1,0],[0,-1],[0,1]];

// La case (r,c) est-elle attaquée par une pièce de couleur `by` ?
function squareAttacked(board, r, c, by) {
  // pions
  if (by === 'w') { // les pions blancs (en r+1) attaquent vers le haut
    if (onB(r + 1, c - 1) && board[r + 1][c - 1] === 'P') return true;
    if (onB(r + 1, c + 1) && board[r + 1][c + 1] === 'P') return true;
  } else {
    if (onB(r - 1, c - 1) && board[r - 1][c - 1] === 'p') return true;
    if (onB(r - 1, c + 1) && board[r - 1][c + 1] === 'p') return true;
  }
  // cavaliers
  const N = by === 'w' ? 'N' : 'n';
  for (const [dr, dc] of KNIGHT) if (onB(r + dr, c + dc) && board[r + dr][c + dc] === N) return true;
  // roi
  const K = by === 'w' ? 'K' : 'k';
  for (const [dr, dc] of KINGD) if (onB(r + dr, c + dc) && board[r + dr][c + dc] === K) return true;
  // fous / dame (diagonales)
  const B = by === 'w' ? 'B' : 'b', Q = by === 'w' ? 'Q' : 'q';
  for (const [dr, dc] of DIAG) {
    let nr = r + dr, nc = c + dc;
    while (onB(nr, nc)) {
      const p = board[nr][nc];
      if (p !== '.') { if (p === B || p === Q) return true; break; }
      nr += dr; nc += dc;
    }
  }
  // tours / dame (lignes/colonnes)
  const R = by === 'w' ? 'R' : 'r';
  for (const [dr, dc] of ORTH) {
    let nr = r + dr, nc = c + dc;
    while (onB(nr, nc)) {
      const p = board[nr][nc];
      if (p !== '.') { if (p === R || p === Q) return true; break; }
      nr += dr; nc += dc;
    }
  }
  return false;
}

function inCheck(board, color) {
  const k = findKing(board, color);
  if (!k) return false;
  return squareAttacked(board, k.r, k.c, enemy(color));
}

// Coups pseudo-légaux (sans filtrer l'échec au propre roi) pour la couleur au trait.
function pseudoMoves(state, color) {
  const board = state.board;
  const moves = [];
  const promoRank = color === 'w' ? 0 : 7;
  const startRank = color === 'w' ? 6 : 1;
  const dir = color === 'w' ? -1 : 1;
  const mine = color === 'w' ? isW : isB;
  const theirs = color === 'w' ? isB : isW;

  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const p = board[r][c];
    if (p === '.' || !mine(p)) continue;
    const t = p.toUpperCase();

    if (t === 'P') {
      // avance simple
      if (onB(r + dir, c) && board[r + dir][c] === '.') {
        if (r + dir === promoRank) for (const pr of ['q', 'r', 'b', 'n']) moves.push({ fr: r, fc: c, tr: r + dir, tc: c, promo: pr });
        else {
          moves.push({ fr: r, fc: c, tr: r + dir, tc: c });
          // avance double
          if (r === startRank && board[r + 2 * dir][c] === '.') moves.push({ fr: r, fc: c, tr: r + 2 * dir, tc: c, flag: 'double' });
        }
      }
      // captures
      for (const dc of [-1, 1]) {
        const nr = r + dir, nc = c + dc;
        if (!onB(nr, nc)) continue;
        if (theirs(board[nr][nc])) {
          if (nr === promoRank) for (const pr of ['q', 'r', 'b', 'n']) moves.push({ fr: r, fc: c, tr: nr, tc: nc, promo: pr });
          else moves.push({ fr: r, fc: c, tr: nr, tc: nc });
        } else if (state.ep && state.ep.r === nr && state.ep.c === nc) {
          moves.push({ fr: r, fc: c, tr: nr, tc: nc, flag: 'ep' });
        }
      }
    } else if (t === 'N') {
      for (const [dr, dc] of KNIGHT) { const nr = r + dr, nc = c + dc; if (onB(nr, nc) && !mine(board[nr][nc])) moves.push({ fr: r, fc: c, tr: nr, tc: nc }); }
    } else if (t === 'K') {
      for (const [dr, dc] of KINGD) { const nr = r + dr, nc = c + dc; if (onB(nr, nc) && !mine(board[nr][nc])) moves.push({ fr: r, fc: c, tr: nr, tc: nc }); }
      // roque
      const rank = color === 'w' ? 7 : 0;
      if (r === rank && c === 4 && !inCheck(board, color)) {
        const kSide = color === 'w' ? state.roque.wK : state.roque.bK;
        const qSide = color === 'w' ? state.roque.wQ : state.roque.bQ;
        const rk = color === 'w' ? 'R' : 'r';
        // petit roque : cases f,g vides ; tour en h ; f,g non attaquées
        if (kSide && board[rank][5] === '.' && board[rank][6] === '.' && board[rank][7] === rk
          && !squareAttacked(board, rank, 5, enemy(color)) && !squareAttacked(board, rank, 6, enemy(color))) {
          moves.push({ fr: rank, fc: 4, tr: rank, tc: 6, flag: 'castleK' });
        }
        // grand roque : cases b,c,d vides ; tour en a ; c,d non attaquées
        if (qSide && board[rank][1] === '.' && board[rank][2] === '.' && board[rank][3] === '.' && board[rank][0] === rk
          && !squareAttacked(board, rank, 3, enemy(color)) && !squareAttacked(board, rank, 2, enemy(color))) {
          moves.push({ fr: rank, fc: 4, tr: rank, tc: 2, flag: 'castleQ' });
        }
      }
    } else {
      // fou (DIAG), tour (ORTH), dame (les deux)
      const dirs = t === 'B' ? DIAG : t === 'R' ? ORTH : DIAG.concat(ORTH);
      for (const [dr, dc] of dirs) {
        let nr = r + dr, nc = c + dc;
        while (onB(nr, nc)) {
          if (board[nr][nc] === '.') { moves.push({ fr: r, fc: c, tr: nr, tc: nc }); }
          else { if (theirs(board[nr][nc])) moves.push({ fr: r, fc: c, tr: nr, tc: nc }); break; }
          nr += dr; nc += dc;
        }
      }
    }
  }
  return moves;
}

// Applique un coup et renvoie un NOUVEL état (board + droits + trait mis à jour).
function applyMove(state, m) {
  const board = cloneBoard(state.board);
  const roque = { ...state.roque };
  const color = colorOf(state.board[m.fr][m.fc]);
  let piece = board[m.fr][m.fc];
  const t = piece.toUpperCase();
  let ep = null;
  const captured = board[m.tr][m.tc];

  // prise en passant : retirer le pion capturé (sur la rangée de départ, colonne d'arrivée)
  if (m.flag === 'ep') board[m.fr][m.tc] = '.';

  // déplacement
  board[m.tr][m.tc] = piece;
  board[m.fr][m.fc] = '.';

  // promotion
  if (m.promo) board[m.tr][m.tc] = color === 'w' ? m.promo.toUpperCase() : m.promo.toLowerCase();

  // avance double → case en passant
  if (m.flag === 'double') ep = { r: (m.fr + m.tr) / 2, c: m.fc };

  // roque : bouger la tour
  if (m.flag === 'castleK') { board[m.tr][5] = board[m.tr][7]; board[m.tr][7] = '.'; }
  if (m.flag === 'castleQ') { board[m.tr][3] = board[m.tr][0]; board[m.tr][0] = '.'; }

  // droits de roque : roi bougé
  if (t === 'K') { if (color === 'w') { roque.wK = false; roque.wQ = false; } else { roque.bK = false; roque.bQ = false; } }
  // tour bougée depuis sa case d'origine
  if (t === 'R') {
    if (m.fr === 7 && m.fc === 0) roque.wQ = false;
    if (m.fr === 7 && m.fc === 7) roque.wK = false;
    if (m.fr === 0 && m.fc === 0) roque.bQ = false;
    if (m.fr === 0 && m.fc === 7) roque.bK = false;
  }
  // tour capturée sur sa case d'origine
  if (m.tr === 7 && m.tc === 0) roque.wQ = false;
  if (m.tr === 7 && m.tc === 7) roque.wK = false;
  if (m.tr === 0 && m.tc === 0) roque.bQ = false;
  if (m.tr === 0 && m.tc === 7) roque.bK = false;

  const demi = (t === 'P' || captured !== '.' || m.flag === 'ep') ? 0 : (state.demi + 1);
  const coups = color === 'b' ? state.coups + 1 : state.coups;

  return { ...state, board, roque, ep, demi, coups, trait: enemy(color), dernier: { fr: m.fr, fc: m.fc, tr: m.tr, tc: m.tc } };
}

// Coups LÉGAUX pour la couleur au trait (filtre : ne pas laisser son roi en échec).
function legalMoves(state, color) {
  const col = color || state.trait;
  const res = [];
  for (const m of pseudoMoves(state, col)) {
    const ns = applyMove(state, m);
    if (!inCheck(ns.board, col)) res.push(m);
  }
  return res;
}

// Matériel insuffisant pour mater (nulle automatique) : K vs K, K+mineure vs K, K+B vs K+B mêmes couleurs.
function materielInsuffisant(board) {
  const pieces = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) { const p = board[r][c]; if (p !== '.' && p.toUpperCase() !== 'K') pieces.push({ p: p.toUpperCase(), r, c }); }
  if (pieces.length === 0) return true;                          // K vs K
  if (pieces.length === 1 && (pieces[0].p === 'B' || pieces[0].p === 'N')) return true; // K+mineure vs K
  if (pieces.length === 2 && pieces.every(x => x.p === 'B')) {   // 2 fous : nulle si même couleur de case
    const col = x => (x.r + x.c) % 2;
    if (col(pieces[0]) === col(pieces[1])) return true;
  }
  return false;
}

// État de la partie APRÈS un coup, du point de vue de la couleur au trait.
// Renvoie { echec, fin: null|'mat'|'pat'|'nulle50'|'materiel', vainqueur:'w'|'b'|null }
function statutPartie(state) {
  const col = state.trait;
  const echec = inCheck(state.board, col);
  const coups = legalMoves(state, col);
  if (coups.length === 0) {
    if (echec) return { echec: true, fin: 'mat', vainqueur: enemy(col) };
    return { echec: false, fin: 'pat', vainqueur: null };
  }
  if (materielInsuffisant(state.board)) return { echec, fin: 'materiel', vainqueur: null };
  if (state.demi >= 100) return { echec, fin: 'nulle50', vainqueur: null };
  return { echec, fin: null, vainqueur: null };
}

// Parse une saisie utilisateur → { fr,fc,tr,tc, promo? } ou { castle:'K'|'Q' } ou null.
function parseCoup(txt, color) {
  let s = (txt || '').trim().replace(/[\s,.\-–—=]+/g, '').toLowerCase();
  // roque
  if (s === 'oo' || s === '00' || s === 'petitroque') return { castle: 'K' };
  if (s === 'ooo' || s === '000' || s === 'grandroque') return { castle: 'Q' };
  // promotion en lettre finale (dame=q/d, tour=r/t, fou=b/f, cavalier=n/c)
  let promo = null;
  const mPromo = s.match(/^([a-h][1-8][a-h][1-8])([qrbndtfc])$/);
  let core = s;
  if (mPromo) { core = mPromo[1]; const map = { q: 'q', d: 'q', r: 'r', t: 'r', b: 'b', f: 'b', n: 'n', c: 'n' }; promo = map[mPromo[2]] || 'q'; }
  const m = core.match(/^([a-h][1-8])([a-h][1-8])$/);
  if (!m) return null;
  const from = parseSq(m[1]), to = parseSq(m[2]);
  if (!from || !to) return null;
  return { fr: from.r, fc: from.c, tr: to.r, tc: to.c, promo };
}

// Trouve le coup LÉGAL correspondant à la saisie (gère roque + promotion par défaut = dame).
function trouverCoup(state, saisie) {
  const color = state.trait;
  const legaux = legalMoves(state, color);
  if (saisie.castle) {
    const flag = saisie.castle === 'K' ? 'castleK' : 'castleQ';
    return legaux.find(m => m.flag === flag) || null;
  }
  const cands = legaux.filter(m => m.fr === saisie.fr && m.fc === saisie.fc && m.tr === saisie.tr && m.tc === saisie.tc);
  if (!cands.length) return null;
  if (cands.length === 1) return cands[0];
  // plusieurs → promotion : choisir la pièce demandée (défaut dame)
  const want = saisie.promo || 'q';
  return cands.find(m => m.promo === want) || cands.find(m => m.promo === 'q') || cands[0];
}

// ═══════════════════════════════════════════════════════════════════════════
//  RENDU
// ═══════════════════════════════════════════════════════════════════════════
function _rendrePlateau(state, pov) {
  // pov : 'w' (Blancs en bas) ou 'b' (Noirs en bas) — on oriente selon le joueur au trait.
  const flip = pov === 'b';
  const lignes = [];
  lignes.push('  +------------------------+');
  for (let ri = 0; ri < 8; ri++) {
    const r = flip ? 7 - ri : ri;
    let row = (8 - r) + ' |';
    for (let ci = 0; ci < 8; ci++) {
      const c = flip ? 7 - ci : ci;
      const p = state.board[r][c];
      row += ' ' + (p === '.' ? '·' : p) + ' ';
    }
    row += '|';
    lignes.push(row);
  }
  lignes.push('  +------------------------+');
  lignes.push(flip ? '    h  g  f  e  d  c  b  a' : '    a  b  c  d  e  f  g  h');
  return lignes.join('\n');
}

function _screenPayload(t) {
  const e = new EmbedBuilder().setColor(0x4A4A4A).setTitle('♟️ ÉCHECS');

  if (t.phase === 'lobby') {
    const jb = t.joueurs.w ? `⚪ **${t.joueurs.w.nom}**` : '⚪ *libre*';
    const jn = t.joueurs.b ? `⚫ **${t.joueurs.b.nom}**` : '⚫ *libre*';
    e.setDescription([
      '*La table est dressée, les pièces alignées. Un duel d\'esprit, sans un mot.*',
      '',
      `${jb}  vs  ${jn}`,
      t.mise > 0 ? `\n💰 Enjeu : **${_money(t.mise)}** (jetons de table).` : '\n🕊️ Partie amicale (sans mise).',
      '',
      t.joueurs.w && t.joueurs.b ? '✅ Les deux camps sont prêts — l\'hôte peut **lancer la partie**.' : '👉 Rejoins un camp pour compléter la table.',
    ].join('\n')).setFooter({ text: `Hôte : ${t.hoteNom} · Saloon` });
    return { embeds: [e], components: _components(t) };
  }

  const pov = t.trait; // on oriente le plateau du côté du joueur au trait
  const plateau = '```\n' + _rendrePlateau(t, pov) + '\n```';
  const nomW = t.joueurs.w?.nom || 'Blancs', nomB = t.joueurs.b?.nom || 'Noirs';

  if (t.phase === 'jeu') {
    const auTrait = t.trait === 'w' ? `⚪ **${nomW}**` : `⚫ **${nomB}**`;
    const etat = [];
    if (t.echec) etat.push('⚠️ **ÉCHEC au roi !**');
    etat.push(`🎯 Au trait : ${auTrait}  — clique **Jouer un coup**.`);
    if (t.dernierTexte) etat.push(`↩️ Dernier coup : \`${t.dernierTexte}\``);
    e.setDescription([plateau, '', etat.join('\n')].join('\n'))
      .setFooter({ text: `⚪ ${nomW}  vs  ⚫ ${nomB} · coup ${t.coups}${t.mise > 0 ? ` · enjeu ${_money(t.mise)}` : ''} · MAJ=Blancs, min=Noirs` });
    return { embeds: [e], components: _components(t) };
  }

  // fini
  let verdict = t.resultatTexte || 'Partie terminée.';
  e.setDescription([plateau, '', '🏁 ' + verdict].join('\n'))
    .setFooter({ text: `⚪ ${nomW}  vs  ⚫ ${nomB} · Saloon` });
  return { embeds: [e], components: _components(t) };
}

function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ech_join_w').setLabel('Prendre les Blancs').setEmoji('⚪').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ech_join_b').setLabel('Prendre les Noirs').setEmoji('⚫').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ech_mise').setLabel('Fixer une mise').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ech_start').setLabel('Lancer la partie').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ech_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ech_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    ));
  } else if (t.phase === 'jeu') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ech_coup').setLabel('Jouer un coup').setEmoji('♟️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ech_nulle').setLabel('Proposer nulle').setEmoji('🤝').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ech_abandon').setLabel('Abandonner').setEmoji('🏳️').setStyle(ButtonStyle.Danger),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ech_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ech_coups').setLabel('Coups possibles').setEmoji('💡').setStyle(ButtonStyle.Secondary),
    ));
  } else {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ech_rejouer').setLabel('Rejouer').setEmoji('🔄').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('ech_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
    ));
  }
  return rows;
}

const _REGLES = [
  '📖 **ÉCHECS — COMMENT JOUER**',
  '',
  '**But :** mettre le roi adverse **échec et mat**.',
  '',
  '**Rejoindre :** un joueur prend les **⚪ Blancs**, l\'autre les **⚫ Noirs**. L\'hôte lance la partie. Les Blancs commencent.',
  '',
  '**Jouer un coup :** clique **♟️ Jouer un coup** quand c\'est ton tour, et écris la **case de départ + la case d\'arrivée**, par ex. `e2e4`, `g1f3`.',
  '• **Roque** : écris `O-O` (petit) ou `O-O-O` (grand).',
  '• **Promotion** : ajoute la pièce, ex. `e7e8D` (Dame), `a2a1T` (Tour). Par défaut → Dame.',
  '• **Prise en passant** : joue simplement la case de capture, elle est reconnue.',
  '',
  '**Aide :** le bouton 💡 **Coups possibles** te liste tes coups légaux depuis une case.',
  '',
  '**Nulle / Abandon :** 🤝 propose la nulle, 🏳️ abandonne. Le plateau se lit : **MAJUSCULES = Blancs**, **minuscules = Noirs**, `·` = case vide.',
].join('\n');

// ═══════════════════════════════════════════════════════════════════════════
//  ÉTAT DE TABLE
// ═══════════════════════════════════════════════════════════════════════════
function _nouvellePartie(interaction) {
  return {
    channelId: interaction.channelId,
    guildId: interaction.guild?.id,
    hoteId: interaction.user.id,
    hoteNom: interaction.member?.displayName || interaction.user.username,
    phase: 'lobby',
    board: initBoard(),
    trait: 'w',
    joueurs: { w: null, b: null },
    roque: { wK: true, wQ: true, bK: true, bQ: true },
    ep: null, demi: 0, coups: 1,
    dernier: null, dernierTexte: '', echec: false,
    resultat: null, resultatTexte: '',
    nulleOfferte: null,   // 'w' | 'b' | null : couleur qui a proposé nulle
    mise: 0,
    msg: null, messageId: null,
  };
}
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _couleurDe(t, uid) { return t.joueurs.w?.userId === uid ? 'w' : t.joueurs.b?.userId === uid ? 'b' : null; }

async function _refresh(t) { try { if (t.msg) await t.msg.edit(_screenPayload(t)); } catch (e) { console.log('⚠️ ech refresh:', e.message); } }

// Clôt la partie : crédite l'éventuelle mise et pose le texte du verdict.
function _terminer(t, vainqueur, cause) {
  t.phase = 'fini';
  const nomW = t.joueurs.w?.nom || 'Blancs', nomB = t.joueurs.b?.nom || 'Noirs';
  if (vainqueur === 'w' || vainqueur === 'b') {
    const gN = vainqueur === 'w' ? nomW : nomB;
    if (t.mise > 0 && t.joueurs.w && t.joueurs.b) {
      const g = vainqueur === 'w' ? t.joueurs.w : t.joueurs.b;
      const p = vainqueur === 'w' ? t.joueurs.b : t.joueurs.w;
      try { if (casino.crediterLot) casino.crediterLot([{ userId: g.userId, montant: t.mise }, { userId: p.userId, montant: -t.mise }]); } catch {}
    }
    const q = vainqueur === 'w' ? '⚪' : '⚫';
    t.resultat = vainqueur === 'w' ? '1-0' : '0-1';
    t.resultatTexte = `${q} **${gN}** l'emporte — **${cause}** !${t.mise > 0 ? ` Pot de **${_money(t.mise)}** empoché.` : ''}`;
  } else {
    t.resultat = '½-½';
    t.resultatTexte = `🤝 **Partie nulle** (${cause}). Les mises sont rendues.`;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
//  PANNEAU AUTONOME (le Saloon principal l'inclut déjà)
// ═══════════════════════════════════════════════════════════════════════════
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('♟️ SALOON — ÉCHECS')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   ÉCHECS · DUEL D\'ESPRIT       ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Deux joueurs, soixante-quatre cases, aucune place au hasard. Matez le roi adverse.*',
      '',
      '♟️ Règles complètes (roque, prise en passant, promotion, mat & pat). Mise en jetons **optionnelle**.',
      '',
      '👉 **Ouvrir une table** ci-dessous : tu en deviens l\'**hôte**.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ech_open').setLabel('Ouvrir une table d\'Échecs').setEmoji('♟️').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}
async function installerPanelEchecs(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('ÉCHECS');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ ech panel:', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════════════════════
//  ROUTEUR
// ═══════════════════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table
    if (interaction.isButton() && id === 'ech_open') {
      if (tables.get(interaction.channelId)) { await interaction.reply({ content: '♟️ Une table d\'Échecs est déjà ouverte ici. Rejoins-la plus haut !', flags: eph }); return true; }
      await interaction.deferReply({ flags: eph });
      const t = _nouvellePartie(interaction);
      t.joueurs.w = { userId: interaction.user.id, nom: t.hoteNom }; // l'hôte prend les Blancs par défaut
      const msg = await interaction.channel.send(_screenPayload(t)).catch(() => null);
      if (!msg) { await interaction.editReply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).' }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.editReply({ content: '♟️ Table ouverte — tu tiens les **⚪ Blancs**. Attends un adversaire aux **⚫ Noirs** 👇' });
      return true;
    }

    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau ♟️.', flags: eph }).catch(() => {}); } return true; }

    // Extras toujours dispo
    if (interaction.isButton() && id === 'ech_regles') { await interaction.reply({ content: _REGLES, flags: eph }); return true; }
    if (interaction.isButton() && id === 'ech_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      tables.delete(interaction.channelId);
      try { if (t.msg) await t.msg.edit({ content: '🔒 Table d\'Échecs fermée.', embeds: [], components: [] }); } catch {}
      await interaction.reply({ content: '🔒 Table fermée.', flags: eph });
      return true;
    }

    // ── LOBBY : rejoindre un camp ──
    if (interaction.isButton() && (id === 'ech_join_w' || id === 'ech_join_b')) {
      if (t.phase !== 'lobby') { await interaction.reply({ content: 'La partie a déjà commencé.', flags: eph }); return true; }
      const camp = id === 'ech_join_w' ? 'w' : 'b';
      const autre = camp === 'w' ? 'b' : 'w';
      const nom = interaction.member?.displayName || interaction.user.username;
      if (t.joueurs[camp] && t.joueurs[camp].userId !== interaction.user.id) { await interaction.reply({ content: 'Ce camp est déjà pris.', flags: eph }); return true; }
      if (t.joueurs[autre]?.userId === interaction.user.id) t.joueurs[autre] = null; // change de camp
      t.joueurs[camp] = { userId: interaction.user.id, nom };
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      return true;
    }

    // ── LOBBY : fixer une mise ──
    if (interaction.isButton() && id === 'ech_mise') {
      if (t.phase !== 'lobby') { await interaction.reply({ content: 'On ne change plus la mise en cours de partie.', flags: eph }); return true; }
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte fixe la mise.', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('ech_mise_modal').setTitle('💰 Mise de la partie')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mise').setLabel('Mise en jetons (0 = amical, max 100 $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(t.mise)).setPlaceholder('Ex : 50')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'ech_mise_modal') {
      let mise = parseInt((interaction.fields.getTextInputValue('mise') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(mise) || mise < MISE_MIN) mise = 0;
      if (mise > MISE_MAX) mise = MISE_MAX;
      t.mise = mise;
      await interaction.reply({ content: mise > 0 ? `💰 Mise fixée à **${_money(mise)}**.` : '🕊️ Partie amicale (sans mise).', flags: eph });
      await _refresh(t); return true;
    }

    // ── Lancer la partie ──
    if (interaction.isButton() && id === 'ech_start') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut lancer.', flags: eph }); return true; }
      if (t.phase !== 'lobby') { await interaction.reply({ content: 'La partie est déjà lancée.', flags: eph }); return true; }
      if (!t.joueurs.w || !t.joueurs.b) { await interaction.reply({ content: '♟️ Il faut **un joueur dans chaque camp** pour lancer.', flags: eph }); return true; }
      if (t.joueurs.w.userId === t.joueurs.b.userId) { await interaction.reply({ content: 'Un même joueur ne peut pas tenir les deux camps.', flags: eph }); return true; }
      t.phase = 'jeu'; t.trait = 'w'; t.echec = false;
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      return true;
    }

    // ── Coups possibles (aide) ──
    if (interaction.isButton() && id === 'ech_coups') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'La partie n\'est pas en cours.', flags: eph }); return true; }
      const col = _couleurDe(t, interaction.user.id);
      if (col !== t.trait) { await interaction.reply({ content: 'Ce n\'est pas ton tour (ou tu n\'es pas dans cette partie).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('ech_coups_modal').setTitle('💡 Coups possibles depuis…')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('case').setLabel('Une case (ex : e2) — vide = tous').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(2).setPlaceholder('e2')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'ech_coups_modal') {
      const col = _couleurDe(t, interaction.user.id);
      if (t.phase !== 'jeu' || col !== t.trait) { await interaction.reply({ content: 'Ce n\'est plus ton tour.', flags: eph }); return true; }
      const legaux = legalMoves(t, col);
      const sqTxt = (interaction.fields.getTextInputValue('case') || '').trim();
      let liste = legaux;
      if (sqTxt) { const sq = parseSq(sqTxt.toLowerCase()); if (sq) liste = legaux.filter(m => m.fr === sq.r && m.fc === sq.c); }
      if (!liste.length) { await interaction.reply({ content: sqTxt ? `Aucun coup légal depuis \`${sqTxt}\`.` : 'Aucun coup légal.', flags: eph }); return true; }
      const parCase = {};
      for (const m of liste) { const k = sqName(m.fr, m.fc); (parCase[k] = parCase[k] || []).push(sqName(m.tr, m.tc) + (m.flag === 'castleK' ? ' (O-O)' : m.flag === 'castleQ' ? ' (O-O-O)' : '')); }
      const txt = Object.entries(parCase).slice(0, 16).map(([k, v]) => `**${k}** → ${[...new Set(v)].join(', ')}`).join('\n');
      await interaction.reply({ content: '💡 **Coups légaux :**\n' + txt, flags: eph });
      return true;
    }

    // ── Jouer un coup ──
    if (interaction.isButton() && id === 'ech_coup') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'La partie n\'est pas en cours.', flags: eph }); return true; }
      const col = _couleurDe(t, interaction.user.id);
      if (!col) { await interaction.reply({ content: '👀 Tu n\'es pas un joueur de cette partie.', flags: eph }); return true; }
      if (col !== t.trait) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — patiente.', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('ech_coup_modal').setTitle(col === 'w' ? '⚪ Ton coup (Blancs)' : '⚫ Ton coup (Noirs)')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('coup').setLabel('Ton coup (ex : e2e4, g1f3, O-O)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setPlaceholder('e2e4')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'ech_coup_modal') {
      const col = _couleurDe(t, interaction.user.id);
      if (t.phase !== 'jeu' || col !== t.trait) { await interaction.reply({ content: 'Ce n\'est plus ton tour.', flags: eph }); return true; }
      const saisie = parseCoup(interaction.fields.getTextInputValue('coup'), col);
      if (!saisie) { await interaction.reply({ content: '❌ Saisie non comprise. Écris la **case de départ + arrivée**, ex. `e2e4`, `g1f3`, `O-O`.', flags: eph }); return true; }
      const coup = trouverCoup(t, saisie);
      if (!coup) { await interaction.reply({ content: '❌ Coup **illégal** dans cette position. Vérifie (échec au roi ? pièce clouée ?) ou clique 💡 **Coups possibles**.', flags: eph }); return true; }

      // Applique le coup
      const avant = t.trait;
      const ns = applyMove(t, coup);
      // reporter les champs mutables de l'état sur la table existante
      t.board = ns.board; t.roque = ns.roque; t.ep = ns.ep; t.demi = ns.demi; t.coups = ns.coups; t.trait = ns.trait; t.dernier = ns.dernier;
      t.dernierTexte = sqName(coup.fr, coup.fc) + sqName(coup.tr, coup.tc) + (coup.promo ? '=' + coup.promo.toUpperCase() : '') + (coup.flag === 'castleK' ? ' (O-O)' : coup.flag === 'castleQ' ? ' (O-O-O)' : '');
      t.nulleOffre = null; t.nulleOfferte = null;

      const st = statutPartie(t);
      t.echec = st.echec;
      await interaction.deferUpdate().catch(() => {});
      if (st.fin === 'mat') { _terminer(t, st.vainqueur, 'échec et mat'); }
      else if (st.fin === 'pat') { _terminer(t, null, 'pat'); }
      else if (st.fin === 'materiel') { _terminer(t, null, 'matériel insuffisant'); }
      else if (st.fin === 'nulle50') { _terminer(t, null, 'règle des 50 coups'); }
      await _refresh(t);
      return true;
    }

    // ── Proposer / accepter la nulle ──
    if (interaction.isButton() && id === 'ech_nulle') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'La partie n\'est pas en cours.', flags: eph }); return true; }
      const col = _couleurDe(t, interaction.user.id);
      if (!col) { await interaction.reply({ content: '👀 Tu n\'es pas un joueur de cette partie.', flags: eph }); return true; }
      if (t.nulleOfferte && t.nulleOfferte !== col) {
        // l'adversaire avait proposé → on accepte
        await interaction.deferUpdate().catch(() => {});
        _terminer(t, null, 'accord mutuel');
        await _refresh(t);
        return true;
      }
      t.nulleOfferte = col;
      const advId = col === 'w' ? t.joueurs.b?.userId : t.joueurs.w?.userId;
      await interaction.reply({ content: `🤝 Proposition de nulle envoyée. ${advId ? `<@${advId}>` : 'L\'adversaire'} peut cliquer **🤝 Proposer nulle** à son tour pour accepter.`, flags: eph });
      return true;
    }

    // ── Abandonner ──
    if (interaction.isButton() && id === 'ech_abandon') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'La partie n\'est pas en cours.', flags: eph }); return true; }
      const col = _couleurDe(t, interaction.user.id);
      if (!col) { await interaction.reply({ content: '👀 Tu n\'es pas un joueur de cette partie.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _terminer(t, enemy(col), 'abandon adverse');
      await _refresh(t);
      return true;
    }

    // ── Rejouer ──
    if (interaction.isButton() && id === 'ech_rejouer') {
      const w = t.joueurs.w, b = t.joueurs.b, mise = t.mise, hoteId = t.hoteId, hoteNom = t.hoteNom;
      const nt = _nouvellePartie({ channelId: t.channelId, guild: { id: t.guildId }, user: { id: hoteId }, member: { displayName: hoteNom } });
      nt.joueurs.w = w; nt.joueurs.b = b; nt.mise = mise; nt.msg = t.msg; nt.messageId = t.messageId;
      tables.set(t.channelId, nt);
      await interaction.deferUpdate().catch(() => {});
      await _refresh(nt);
      return true;
    }

    return true; // ech_* pris en charge
  } catch (e) {
    console.log('❌ echecs routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Un pépin sur l\'échiquier. Réessaie.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelEchecs,
  // moteur exposé pour les tests
  initBoard, cloneBoard, applyMove, legalMoves, pseudoMoves, inCheck, squareAttacked,
  statutPartie, parseCoup, trouverCoup, sqName, parseSq, materielInsuffisant,
  _nouvellePartie, _screenPayload, _rendrePlateau, _terminer, tables,
};
