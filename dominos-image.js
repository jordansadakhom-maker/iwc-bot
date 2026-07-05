// ═══════════════════════════════════════════════════════════════
// dominos-image.js — Rend la table de DOMINOS en VRAIE image (sharp + SVG) :
// feutre vert du saloon, tuiles d'os dessinées (pips en disques vectoriels,
// jamais dépendantes d'une police), doubles posés EN TRAVERS, et les deux
// extrémités ouvertes affichées en clair. sharp est chargé paresseusement :
// s'il manque, on renvoie null et dominos.js retombe sur l'affichage texte.
// Le DOS des tuiles (pioche) porte l'emblème « IW » de la maison Iron Wolf.
// ═══════════════════════════════════════════════════════════════
let _sharp = null, _tried = false;
function getSharp() { if (_tried) return _sharp; _tried = true; try { _sharp = require('sharp'); } catch (e) { console.log('⚠️ dominos-image: sharp indisponible →', e.message); _sharp = null; } return _sharp; }

// Retire les emoji du plan astral (💥🎯🈚…) qui ne s'affichent pas dans le rendu SVG.
const _clean = s => String(s == null ? '' : s).replace(/[\u{10000}-\u{10FFFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
const esc = s => _clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const IVOIRE = '#f4ecd6', OS_BORD = '#b9a06a', PIP = '#20242b';
const OR = '#c8a45c', OR_CLAIR = '#e7cf94';

// Disposition des pips d'une valeur 0..6 sur une grille 3×3 (col,row ∈ {0,1,2}).
const PIPS = {
  0: [],
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

// Pips d'une demi-tuile : carré de côté sz centré en (cx,cy).
function demiPips(cx, cy, sz, val, color) {
  const r = sz * 0.11;
  const x0 = cx - sz / 2, y0 = cy - sz / 2;
  const pos = PIPS[Math.max(0, Math.min(6, val | 0))] || [];
  return pos.map(([c, rr]) => {
    const px = x0 + sz * (0.25 + c * 0.25);
    const py = y0 + sz * (0.25 + rr * 0.25);
    return `<circle cx="${px.toFixed(1)}" cy="${py.toFixed(1)}" r="${r.toFixed(1)}" fill="${color}"/>`;
  }).join('');
}

// Corps d'une tuile (rectangle ivoire + liseré). w×h à (x,y).
function corpsTuile(x, y, w, h, surligne) {
  const stroke = surligne ? OR_CLAIR : OS_BORD;
  const sw = surligne ? 2.6 : 1.4;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(Math.min(w, h) * 0.14).toFixed(1)}" fill="${IVOIRE}" stroke="${stroke}" stroke-width="${sw}"/>`
    + (surligne ? `<rect x="${x + 3}" y="${y + 3}" width="${w - 6}" height="${h - 6}" rx="${(Math.min(w, h) * 0.12).toFixed(1)}" fill="none" stroke="${OR}" stroke-width="0.9" opacity="0.6"/>` : '');
}

// Tuile horizontale : deux demi-carrés côte à côte (valeurs g|d), côté sz.
function tuileH(x, y, sz, g, d, surligne) {
  const w = 2 * sz, h = sz;
  return corpsTuile(x, y, w, h, surligne)
    + `<line x1="${x + sz}" y1="${y + sz * 0.12}" x2="${x + sz}" y2="${y + sz * 0.88}" stroke="${OS_BORD}" stroke-width="1.3"/>`
    + demiPips(x + sz / 2, y + sz / 2, sz, g, PIP)
    + demiPips(x + sz * 1.5, y + sz / 2, sz, d, PIP);
}

// Tuile verticale (double posé en travers) : deux demi-carrés empilés, côté sz.
function tuileV(x, y, sz, g, d, surligne) {
  const w = sz, h = 2 * sz;
  return corpsTuile(x, y, w, h, surligne)
    + `<line x1="${x + sz * 0.12}" y1="${y + sz}" x2="${x + sz * 0.88}" y2="${y + sz}" stroke="${OS_BORD}" stroke-width="1.3"/>`
    + demiPips(x + sz / 2, y + sz / 2, sz, g, PIP)
    + demiPips(x + sz / 2, y + sz * 1.5, sz, d, PIP);
}

// Dos de tuile (pioche) — emblème de la maison Iron Wolf.
function dosTuile(x, y, sz) {
  const w = 2 * sz, h = sz, cx = x + w / 2, cy = y + h / 2;
  return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${(h * 0.14).toFixed(1)}" fill="#7c1f17" stroke="${OR_CLAIR}" stroke-width="1.4"/>`
    + `<rect x="${x + w * 0.05}" y="${y + h * 0.12}" width="${w * 0.9}" height="${h * 0.76}" rx="${(h * 0.1).toFixed(1)}" fill="none" stroke="${OR}" stroke-width="1"/>`
    + `<circle cx="${cx}" cy="${cy}" r="${(h * 0.32).toFixed(1)}" fill="#5c1710" stroke="${OR_CLAIR}" stroke-width="1.2"/>`
    + `<text x="${cx}" y="${cy + h * 0.11}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${(h * 0.34).toFixed(1)}" font-weight="bold" fill="${OR_CLAIR}" text-anchor="middle">IW</text>`;
}

// Cadre feutre commun.
function cadre(W, H, titre, sousTitre, S) {
  S.push(`<defs><radialGradient id="felt" cx="50%" cy="34%" r="80%"><stop offset="0%" stop-color="#12704a"/><stop offset="100%" stop-color="#093a25"/></radialGradient></defs>`);
  S.push(`<rect width="${W}" height="${H}" fill="#0a2a1c"/>`);
  S.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="24" fill="url(#felt)" stroke="${OR}" stroke-width="3"/>`);
  S.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="#0c3f28" stroke-width="2"/>`);
  S.push(`<text x="${W / 2}" y="50" font-family="DejaVu Serif, Georgia, serif" font-size="28" font-weight="bold" fill="${OR_CLAIR}" text-anchor="middle" letter-spacing="4">${esc(titre)}</text>`);
  if (sousTitre) S.push(`<text x="${W / 2}" y="72" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#d8e8dd" text-anchor="middle">${esc(sousTitre)}</text>`);
}

// Répartit les tuiles de la chaîne en lignes (retour à la ligne). Chaque item :
//  { g, d, doub } (doub → tuile verticale). Renvoie des lignes de positions.
function agencerChaine(items, sz, gap, maxW, x0, y0) {
  const rowH = 2 * sz + gap;
  const placements = [];
  let x = x0, y = y0, rowMax = y0;
  for (const it of items) {
    const w = it.doub ? sz : 2 * sz;
    if (x + w > x0 + maxW && x > x0) { x = x0; y += rowH; }
    // Centrage vertical sur la bande (hauteur 2*sz) : doubles pleine hauteur, simples au milieu.
    const ty = it.doub ? y : y + sz / 2;
    placements.push({ it, x, y: ty, w });
    x += w + gap;
    rowMax = y + 2 * sz;
  }
  return { placements, bas: rowMax };
}

// state public = { sousTitre, chaine:[{g,d,doub}], gauche, droite, pioche, joueurs:[{nom,restant,ante,actif,badge}], pot }
async function genererPlateau(state) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const W = 960;
    const sz = 44, gap = 8;
    const items = (state.chaine || []).map(c => ({ g: c.g, d: c.d, doub: c.g === c.d }));
    const bandX = 40, bandY = 150, bandMaxW = W - 80;
    // Pré-calcul de la hauteur nécessaire pour la chaîne.
    const pre = agencerChaine(items.length ? items : [], sz, gap, bandMaxW, bandX, bandY);
    const chaineBas = items.length ? pre.bas : bandY + 2 * sz;
    const joueurs = state.joueurs || [];
    const joueursY = chaineBas + 34;
    const H = joueursY + Math.max(1, joueurs.length) * 30 + 40;

    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    cadre(W, H, 'SALOON  ·  DOMINOS', state.sousTitre || '', S);

    // Extrémités ouvertes (badges).
    const gv = state.gauche == null ? '—' : String(state.gauche);
    const dv = state.droite == null ? '—' : String(state.droite);
    S.push(`<text x="${W / 2}" y="108" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#cfe3d6" text-anchor="middle">Extrémités ouvertes</text>`);
    S.push(`<rect x="${W / 2 - 150}" y="118" width="120" height="24" rx="7" fill="#0f5132" stroke="${OR_CLAIR}" stroke-width="1.2"/>`);
    S.push(`<text x="${W / 2 - 90}" y="135" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#ffe8a3" text-anchor="middle">gauche : ${esc(gv)}</text>`);
    S.push(`<rect x="${W / 2 + 30}" y="118" width="120" height="24" rx="7" fill="#0f5132" stroke="${OR_CLAIR}" stroke-width="1.2"/>`);
    S.push(`<text x="${W / 2 + 90}" y="135" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#ffe8a3" text-anchor="middle">droite : ${esc(dv)}</text>`);

    // La chaîne.
    if (!items.length) {
      S.push(`<text x="${W / 2}" y="${bandY + sz}" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" fill="#cfe3d6" text-anchor="middle" font-style="italic">La table est nue — l'ouvreur pose la première tuile.</text>`);
    } else {
      for (const p of pre.placements) {
        S.push(p.it.doub ? tuileV(p.x, p.y, sz, p.it.g, p.it.d, false) : tuileH(p.x, p.y, sz, p.it.g, p.it.d, false));
      }
    }

    // Séparateur + pioche.
    const sepY = chaineBas + 14;
    S.push(`<line x1="30" y1="${sepY}" x2="${W - 30}" y2="${sepY}" stroke="${OR}" stroke-width="1.2" opacity="0.55"/>`);
    S.push(`<text x="44" y="${joueursY}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#e7cf94">Pioche : ${state.pioche | 0} tuile(s)</text>`);
    if ((state.pot | 0) > 0) S.push(`<text x="${W - 44}" y="${joueursY}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#ffe8a3" text-anchor="end">Pot : ${esc(state.pot)}</text>`);

    // Joueurs (nom · tuiles restantes).
    joueurs.forEach((j, i) => {
      const y = joueursY + 26 + i * 28;
      const col = j.actif ? '#ffe8a3' : '#eaf3ec';
      S.push(`<text x="44" y="${y}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="${j.actif ? 'bold' : 'normal'}" fill="${col}">${j.actif ? '▸ ' : '•  '}${esc(j.nom)} — ${j.restant | 0} tuile(s)${j.badge ? '   ·   ' + esc(j.badge) : ''}</text>`);
    });

    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ dominos-image genererPlateau:', e.message); return null; }
}

// state main = { nom, tiles:[{a,b,jouable}], gauche, droite }
async function genererMain(state) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const sz = 52, gap = 12;
    const tiles = state.tiles || [];
    const perRow = 5;
    const W = 40 + perRow * (2 * sz + gap);
    const rows = Math.max(1, Math.ceil(tiles.length / perRow));
    const H = 120 + rows * (sz + gap) + 20;

    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    cadre(W, H, 'VOTRE MAIN', (state.nom || '') + '  ·  extrémités ' + (state.gauche == null ? '—' : state.gauche) + ' / ' + (state.droite == null ? '—' : state.droite), S);
    S.push(`<text x="${W / 2}" y="100" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#cfe3d6" text-anchor="middle" font-style="italic">Les tuiles cerclées d'or sont jouables sur une extrémité.</text>`);

    if (!tiles.length) {
      S.push(`<text x="${W / 2}" y="${H / 2 + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" fill="#e7cf94" text-anchor="middle" font-weight="bold">Main vide — vous avez gagné !</text>`);
    } else {
      tiles.forEach((tile, i) => {
        const r = Math.floor(i / perRow), c = i % perRow;
        const x = 20 + c * (2 * sz + gap);
        const y = 120 + r * (sz + gap);
        S.push(tuileH(x, y, sz, tile.a, tile.b, !!tile.jouable));
      });
    }

    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ dominos-image genererMain:', e.message); return null; }
}

module.exports = { genererPlateau, genererMain, _test: { PIPS, agencerChaine, demiPips } };
