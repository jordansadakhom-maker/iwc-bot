// ═══════════════════════════════════════════════════════════════
// faro-image.js — Rend la table de FARO en VRAIE image (sharp + SVG) :
// tapis vert (dégradé #12704a→#093a25), bordure or #c8a45c, le TABLEAU des
// 13 rangs A..K dessinés comme des cartes (enseignes vectorielles, jamais
// dépendantes d'une police), les jetons/mises posés sur chaque rang, et les
// DEUX cartes tirées (perdante/gagnante) mises en évidence avec le résultat.
// sharp est chargé PARESSEUSEMENT : s'il manque, on renvoie null et faro.js
// retombe sur l'affichage texte (jamais de crash).
// ═══════════════════════════════════════════════════════════════
let _sharp = null, _tried = false;
function getSharp() { if (_tried) return _sharp; _tried = true; try { _sharp = require('sharp'); } catch (e) { console.log('⚠️ faro-image: sharp indisponible →', e.message); _sharp = null; } return _sharp; }

// Enseignes dessinées en chemins vectoriels (viewBox 0 0 32 32) → rendu garanti,
// jamais dépendant d'une police pour les symboles (repris de blackjack-image.js).
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

// Carte face visible (repris de blackjack-image.js — rang + enseigne).
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

// Dos de carte ornementé (emblème de la maison Iron Wolf « IW ») — repris tel quel.
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

// Petit jeton (chip) posé sur un rang, portant un montant.
function jeton(cx, cy, r, txt) {
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="#c8a45c" stroke="#8a6d3b" stroke-width="1.6"/>
    <circle cx="${cx}" cy="${cy}" r="${r * 0.72}" fill="none" stroke="#fbf3d8" stroke-width="1.2" stroke-dasharray="3 3"/>
    <text x="${cx}" y="${cy + r * 0.30}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${r * 0.72}" font-weight="bold" fill="#3a2a12" text-anchor="middle">${esc(txt)}</text>
  </g>`;
}

// state = {
//   sousTitre, coup, banque,
//   rangs: [ { r, total, nJoueurs, perdante, gagnante, split } … 13 ],
//   dernier: { perdante:{r,s}, gagnante:{r,s}, split, label } | null,
//   soldes: [ { nom, net } ]
// }
async function genererTableFaro(state) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const W = 960;
    const rangs = state.rangs || [];
    const soldes = state.soldes || [];

    const headH = 78;
    const resH = 210;                 // bandeau des 2 cartes tirées
    const CW = 60, CH = 86, GAP = 6;  // cartes du tableau
    const boardH = 34 + CH + 46;      // libellé + carte + jetons
    const ledgerH = 34 + Math.max(1, soldes.length) * 22 + 14;
    const H = headH + resH + boardH + ledgerH + 20;

    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    // Tapis feutre
    S.push(`<defs><radialGradient id="felt" cx="50%" cy="30%" r="85%"><stop offset="0%" stop-color="#12704a"/><stop offset="100%" stop-color="#093a25"/></radialGradient></defs>`);
    S.push(`<rect width="${W}" height="${H}" fill="#0a2a1c"/>`);
    S.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="24" fill="url(#felt)" stroke="#c8a45c" stroke-width="3"/>`);
    S.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="#0c3f28" stroke-width="2"/>`);

    // En-tête
    S.push(`<text x="${W / 2}" y="52" font-family="DejaVu Serif, Georgia, serif" font-size="30" font-weight="bold" fill="#e7cf94" text-anchor="middle" letter-spacing="4">SALOON  ·  FARO</text>`);
    if (state.sousTitre) S.push(`<text x="${W / 2}" y="${headH - 4}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#d8e8dd" text-anchor="middle">${esc(state.sousTitre)}</text>`);

    // Bandeau : les deux cartes tirées (perdante / gagnante)
    const d = state.dernier;
    const resY = headH + 8;
    const DW = 84, DH = 118;
    const cxPerd = W * 0.34, cxGag = W * 0.66;
    S.push(`<text x="${W / 2}" y="${resY + 16}" font-family="DejaVu Serif, Georgia, serif" font-size="16" fill="#e7cf94" text-anchor="middle" letter-spacing="2">${d ? ('COUP N° ' + (state.coup || '')) : 'AUCUN COUP JOUÉ — PLACEZ VOS MISES'}</text>`);
    if (d) {
      const py = resY + 30;
      // Perdante (banque) — cadre rouge
      S.push(`<text x="${cxPerd}" y="${py + 12}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#f2b8ae" text-anchor="middle">PERDANTE · banque</text>`);
      S.push(`<rect x="${cxPerd - DW / 2 - 5}" y="${py + 18}" width="${DW + 10}" height="${DH + 10}" rx="12" fill="none" stroke="#e0574a" stroke-width="3"/>`);
      S.push(carteFace(cxPerd - DW / 2, py + 22, DW, DH, d.perdante.r, d.perdante.s));
      // Gagnante (joueur) — cadre vert
      S.push(`<text x="${cxGag}" y="${py + 12}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#bfe9c8" text-anchor="middle">GAGNANTE · joueur</text>`);
      S.push(`<rect x="${cxGag - DW / 2 - 5}" y="${py + 18}" width="${DW + 10}" height="${DH + 10}" rx="12" fill="none" stroke="#54c06a" stroke-width="3"/>`);
      S.push(carteFace(cxGag - DW / 2, py + 22, DW, DH, d.gagnante.r, d.gagnante.s));
      if (d.split) S.push(`<text x="${W / 2}" y="${py + DH / 2 + 26}" font-family="DejaVu Serif, Georgia, serif" font-size="20" font-weight="bold" fill="#ffd76a" text-anchor="middle">SPLIT</text>`);
      else S.push(`<text x="${W / 2}" y="${py + DH / 2 + 6}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#eaf3ec" text-anchor="middle" font-style="italic">contre</text>`);
      if (d.label) S.push(`<text x="${W / 2}" y="${py + DH + 24}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#d8e8dd" text-anchor="middle">${esc(d.label)}</text>`);
    } else {
      const cx = W / 2, py = resY + 40;
      S.push(carteDos(cx - 130, py + 6, DW, DH));
      S.push(carteDos(cx + 130 - DW, py + 6, DW, DH));
      S.push(`<text x="${cx}" y="${py + DH / 2 + 6}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#cfe3d6" text-anchor="middle" font-style="italic">le sabot attend…</text>`);
    }

    // Séparateur
    const sep1 = headH + resH - 6;
    S.push(`<line x1="30" y1="${sep1}" x2="${W - 30}" y2="${sep1}" stroke="#c8a45c" stroke-width="1.4" opacity="0.6"/>`);

    // Tableau des 13 rangs
    const boardY = headH + resH;
    S.push(`<text x="44" y="${boardY + 22}" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" font-weight="bold" fill="#e7cf94">TABLEAU DES RANGS</text>`);
    const totalW = 13 * CW + 12 * GAP;
    const startX = (W - totalW) / 2;
    const cardsY = boardY + 34;
    rangs.forEach((rg, i) => {
      const x = startX + i * (CW + GAP);
      // surbrillance perdante / gagnante
      if (rg.split) S.push(`<rect x="${x - 4}" y="${cardsY - 4}" width="${CW + 8}" height="${CH + 8}" rx="10" fill="none" stroke="#ffd76a" stroke-width="3"/>`);
      else if (rg.gagnante) S.push(`<rect x="${x - 4}" y="${cardsY - 4}" width="${CW + 8}" height="${CH + 8}" rx="10" fill="none" stroke="#54c06a" stroke-width="3"/>`);
      else if (rg.perdante) S.push(`<rect x="${x - 4}" y="${cardsY - 4}" width="${CW + 8}" height="${CH + 8}" rx="10" fill="none" stroke="#e0574a" stroke-width="3"/>`);
      S.push(carteFace(x, cardsY, CW, CH, rg.r, '♠'));
      // jetons / mises posés
      if (rg.total > 0) {
        S.push(jeton(x + CW / 2, cardsY + CH + 20, 18, String(rg.total)));
        if (rg.nJoueurs > 1) S.push(`<text x="${x + CW / 2}" y="${cardsY + CH + 44}" font-family="DejaVu Sans, Arial, sans-serif" font-size="11" fill="#cfe3d6" text-anchor="middle">${rg.nJoueurs} j.</text>`);
      } else {
        S.push(`<circle cx="${x + CW / 2}" cy="${cardsY + CH + 20}" r="4" fill="#0c3f28" stroke="#356b4e" stroke-width="1"/>`);
      }
    });

    // Séparateur bas
    const sep2 = boardY + boardH - 4;
    S.push(`<line x1="30" y1="${sep2}" x2="${W - 30}" y2="${sep2}" stroke="#c8a45c" stroke-width="1.2" opacity="0.5"/>`);

    // Grand livre des jetons
    const ledY = boardY + boardH;
    S.push(`<text x="44" y="${ledY + 22}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" fill="#e7cf94">JETONS DE LA SOIRÉE${typeof state.banque === 'number' ? '   ·   banque : ' + esc(fmt(state.banque)) : ''}</text>`);
    if (!soldes.length) {
      S.push(`<text x="44" y="${ledY + 44}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#cfe3d6" font-style="italic">Personne n'a encore joué un jeton.</text>`);
    } else {
      soldes.forEach((s, i) => {
        const yy = ledY + 44 + i * 22;
        const col = s.net > 0 ? '#8fe6a0' : (s.net < 0 ? '#f2a49b' : '#d8e8dd');
        S.push(`<text x="44" y="${yy}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#eaf3ec">• ${esc(s.nom)}</text>`);
        S.push(`<text x="${W - 44}" y="${yy}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="${col}" text-anchor="end">${esc(fmt(s.net))}</text>`);
      });
    }

    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ faro-image genererTableFaro:', e.message); return null; }
}

function fmt(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '+') + s + ' $'; }

module.exports = { genererTableFaro };
