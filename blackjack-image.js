// ═══════════════════════════════════════════════════════════════
// blackjack-image.js — Rend la table de blackjack en VRAIE image (sharp + SVG) :
// tapis vert, cartes dessinées (enseignes vectorielles, jamais dépendantes d'une
// police), et surtout un DOS de carte ornementé (emblème Iron Wolf) pour la carte
// cachée du croupier → immersion réelle.  sharp est chargé paresseusement : s'il
// manque, on renvoie null et blackjack.js retombe sur l'affichage texte.
// ═══════════════════════════════════════════════════════════════
let _sharp = null, _tried = false;
function getSharp() { if (_tried) return _sharp; _tried = true; try { _sharp = require('sharp'); } catch (e) { console.log('⚠️ blackjack-image: sharp indisponible →', e.message); _sharp = null; } return _sharp; }

// Enseignes dessinées en chemins vectoriels (viewBox 0 0 32 32) → rendu garanti.
const ENSEIGNES = {
  '♥': 'M16 28 C16 28 4 20.5 4 11.5 C4 7 7.2 4 11 4 C13.6 4 15.2 5.6 16 7 C16.8 5.6 18.4 4 21 4 C24.8 4 28 7 28 11.5 C28 20.5 16 28 16 28 Z',
  '♦': 'M16 3 L27 16 L16 29 L5 16 Z',
  '♠': 'M16 3 C16 3 4 13.5 4 20.5 C4 24 6.4 26 9.2 26 C11.4 26 13 24.8 13.6 23 C13.2 26 12 28 10 29 L22 29 C20 28 18.8 26 18.4 23 C19 24.8 20.6 26 22.8 26 C25.6 26 28 24 28 20.5 C28 13.5 16 3 16 3 Z',
  '♣': 'M16 4 C13.5 4 11.6 5.9 11.6 8.3 C11.6 9.6 12.1 10.6 12.9 11.4 C10.7 10.7 8.2 12.2 8.2 15 C8.2 17.6 10.4 19.4 13 19.4 C14.2 19.4 15.2 19 15.9 18.2 C15.5 21.5 14.2 24.5 12.2 26 L19.8 26 C17.8 24.5 16.5 21.5 16.1 18.2 C16.8 19 17.8 19.4 19 19.4 C21.6 19.4 23.8 17.6 23.8 15 C23.8 12.2 21.3 10.7 19.1 11.4 C19.9 10.6 20.4 9.6 20.4 8.3 C20.4 5.9 18.5 4 16 4 Z',
};
// Retire les emoji du plan astral (💥🎯🈚…) qui ne s'affichent pas dans le rendu SVG.
const _clean = s => String(s == null ? '' : s).replace(/[\u{10000}-\u{10FFFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
const esc = s => _clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const ROUGE = '#b12a1c', NOIR = '#20242b';
const estRouge = s => s === '♥' || s === '♦';

// Une enseigne pleine, centrée en (cx,cy), de taille « size » px.
function ens(suit, cx, cy, size, color) {
  const k = size / 32;
  return `<g transform="translate(${cx - size / 2},${cy - size / 2}) scale(${k})"><path d="${ENSEIGNES[suit]}" fill="${color}"/></g>`;
}

// Carte face visible.
function carteFace(x, y, w, h, r, s) {
  const col = estRouge(s) ? ROUGE : NOIR;
  const big = Math.min(w, h) * 0.46;
  const fs = w * 0.30;
  const label = r === '10' ? '10' : r;
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" rx="${w * 0.11}" fill="#fbf8ef" stroke="#cdbf9c" stroke-width="1.2"/>
    <text x="${w * 0.14}" y="${h * 0.20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fs}" font-weight="bold" fill="${col}" text-anchor="middle">${esc(label)}</text>
    ${ens(s, w * 0.15, h * 0.31, w * 0.20, col)}
    ${ens(s, w * 0.5, h * 0.52, big, col)}
    <g transform="rotate(180 ${w / 2} ${h / 2})">
      <text x="${w * 0.14}" y="${h * 0.20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${fs}" font-weight="bold" fill="${col}" text-anchor="middle">${esc(label)}</text>
      ${ens(s, w * 0.15, h * 0.31, w * 0.20, col)}
    </g>
  </g>`;
}

// Dos de carte ornementé (emblème de la maison Iron Wolf).
function carteDos(x, y, w, h) {
  const cx = w / 2, cy = h / 2;
  return `<g transform="translate(${x},${y})">
    <rect width="${w}" height="${h}" rx="${w * 0.11}" fill="#7c1f17" stroke="#e7cf94" stroke-width="1.4"/>
    <rect x="${w * 0.10}" y="${h * 0.07}" width="${w * 0.80}" height="${h * 0.86}" rx="${w * 0.06}" fill="none" stroke="#caa457" stroke-width="1.1"/>
    <g stroke="#a5623a" stroke-width="0.8" opacity="0.55">
      ${Array.from({ length: 9 }, (_, i) => `<line x1="${-h + i * (w / 3)}" y1="0" x2="${-h + i * (w / 3) + h}" y2="${h}"/>`).join('')}
      ${Array.from({ length: 9 }, (_, i) => `<line x1="${i * (w / 3)}" y1="0" x2="${i * (w / 3) - h}" y2="${h}"/>`).join('')}
    </g>
    <circle cx="${cx}" cy="${cy}" r="${w * 0.30}" fill="#5c1710" stroke="#e7cf94" stroke-width="1.3"/>
    <g transform="translate(${cx},${cy})">
      ${Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; const r1 = w * 0.30, r2 = w * 0.12; return `<line x1="${Math.cos(a) * r2}" y1="${Math.sin(a) * r2}" x2="${Math.cos(a) * r1}" y2="${Math.sin(a) * r1}" stroke="#caa457" stroke-width="0.9"/>`; }).join('')}
      <path d="M0 ${-w * 0.17} L${w * 0.045} ${-w * 0.045} L${w * 0.17} 0 L${w * 0.045} ${w * 0.045} L0 ${w * 0.17} L${-w * 0.045} ${w * 0.045} L${-w * 0.17} 0 L${-w * 0.045} ${-w * 0.045} Z" fill="#e7cf94"/>
      <text x="0" y="${w * 0.055}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${w * 0.17}" font-weight="bold" fill="#5c1710" text-anchor="middle">IW</text>
    </g>
  </g>`;
}

function ligneCartes(cards, x, y, cw, ch, gap, hideLast) {
  let out = '';
  cards.forEach((c, i) => {
    const cx = x + i * (cw + gap);
    out += (hideLast && i === cards.length - 1) ? carteDos(cx, y, cw, ch) : carteFace(cx, y, cw, ch, c.r, c.s);
  });
  return out;
}

// state = { croupier:{cards,total,hidden,bust,bj}, joueurs:[{nom,cards,total,mise,badge,couleur,actif}], sousTitre }
async function genererTable(state) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const W = 960;
    const CW = 66, CH = 94, GAP = 9;           // cartes joueurs
    const DW = 82, DH = 116;                    // cartes croupier
    const headH = 78, croH = 168, rowH = 108;
    const joueurs = state.joueurs || [];
    const H = headH + croH + Math.max(1, joueurs.length) * rowH + 30;

    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    // Tapis
    S.push(`<defs><radialGradient id="felt" cx="50%" cy="34%" r="80%"><stop offset="0%" stop-color="#12704a"/><stop offset="100%" stop-color="#093a25"/></radialGradient></defs>`);
    S.push(`<rect width="${W}" height="${H}" fill="#0a2a1c"/>`);
    S.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="24" fill="url(#felt)" stroke="#c8a45c" stroke-width="3"/>`);
    S.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="#0c3f28" stroke-width="2"/>`);

    // En-tête
    S.push(`<text x="${W / 2}" y="52" font-family="DejaVu Serif, Georgia, serif" font-size="30" font-weight="bold" fill="#e7cf94" text-anchor="middle" letter-spacing="4">SALOON  ·  BLACKJACK</text>`);
    if (state.sousTitre) S.push(`<text x="${W / 2}" y="${headH - 4}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#d8e8dd" text-anchor="middle">${esc(state.sousTitre)}</text>`);

    // Croupier
    const cro = state.croupier || { cards: [] };
    const croY = headH + 12;
    S.push(`<text x="46" y="${croY + 22}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="#e7cf94">🎩 CROUPIER</text>`.replace('🎩 ', ''));
    const croCardsX = 46;
    const nCro = (cro.cards || []).length;
    S.push(ligneCartes(cro.cards || [], croCardsX, croY + 34, DW, DH, GAP, !!cro.hidden));
    // Total du croupier À DROITE des cartes (pas en dessous → aucune collision).
    const croInfoX = croCardsX + Math.max(1, nCro) * (DW + GAP) + 14;
    const croInfoY = croY + 34 + DH / 2 + 6;
    if (cro.hidden) S.push(`<text x="${croInfoX}" y="${croInfoY}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#cfe3d6" font-style="italic">une carte cachée…</text>`);
    else S.push(`<text x="${croInfoX}" y="${croInfoY}" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" fill="#ffffff" font-weight="bold">= ${cro.total ?? '—'}${cro.bust ? '  ·  BRÛLÉ' : (cro.bj ? '  ·  BLACKJACK' : '')}</text>`);
    // Séparateur
    const sepY = headH + croH - 6;
    S.push(`<line x1="30" y1="${sepY}" x2="${W - 30}" y2="${sepY}" stroke="#c8a45c" stroke-width="1.4" opacity="0.6"/>`);

    // Joueurs
    joueurs.forEach((j, idx) => {
      const y = headH + croH + idx * rowH;
      if (j.actif) S.push(`<rect x="24" y="${y - 2}" width="${W - 48}" height="${rowH - 8}" rx="12" fill="#0f5132" opacity="0.5" stroke="#e7cf94" stroke-width="1.5"/>`);
      S.push(`<text x="44" y="${y + 26}" font-family="DejaVu Sans, Arial, sans-serif" font-size="19" font-weight="bold" fill="${j.actif ? '#ffe8a3' : '#eaf3ec'}">${j.actif ? '▸ ' : ''}${esc(j.nom)}</text>`);
      S.push(`<text x="44" y="${y + 48}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#bcd7c6">Mise ${esc(j.mise)}${j.sous ? '   ·   Sous ' + esc(j.sous) : ''}${j.badge ? '   ·   ' + esc(j.badge) : ''}</text>`);
      const cardsX = 300;
      S.push(ligneCartes(j.cards || [], cardsX, y - 2, CW, CH, GAP, false));
      if ((j.cards || []).length) S.push(`<text x="${cardsX + (j.cards.length) * (CW + GAP) + 6}" y="${y + CH / 2 + 4}" font-family="DejaVu Sans, Arial, sans-serif" font-size="22" font-weight="bold" fill="#ffffff">= ${j.total}</text>`);
    });
    if (!joueurs.length) S.push(`<text x="${W / 2}" y="${headH + croH + 50}" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" fill="#cfe3d6" text-anchor="middle" font-style="italic">Aucun joueur à la table — asseyez-vous pour jouer.</text>`);

    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ blackjack-image genererTable:', e.message); return null; }
}

module.exports = { genererTable };
