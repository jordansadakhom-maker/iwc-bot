// ═══════════════════════════════════════════════════════════════
// pokermenteur-image.js — Rend la table de POKER MENTEUR (Liar's Dice) en VRAIE
// image (sharp + SVG) : tapis vert du saloon, dés dessinés (carré arrondi blanc,
// pips = disques noirs, le 1 « joker » en rouge), et un DOS de dé ornementé
// (emblème Iron Wolf « IW ») pour les dés cachés → immersion réelle.
// sharp est chargé PARESSEUSEMENT : s'il manque, on renvoie null et
// pokermenteur.js retombe sur l'affichage texte (jamais de crash).
// ═══════════════════════════════════════════════════════════════
let _sharp = null, _tried = false;
function getSharp() { if (_tried) return _sharp; _tried = true; try { _sharp = require('sharp'); } catch (e) { console.log('⚠️ pokermenteur-image: sharp indisponible →', e.message); _sharp = null; } return _sharp; }

// Retire les emoji du plan astral (💥🎯🈚…) qui ne s'affichent pas dans le rendu SVG.
const _clean = s => String(s == null ? '' : s).replace(/[\u{10000}-\u{10FFFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
const esc = s => _clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

const NOIR = '#20242b', ROUGE = '#b12a1c';

// Position des pips (fractions de la taille du dé) pour chaque face 1..6.
function _pips(v) {
  const a = 0.27, b = 0.5, c = 0.73;
  const P = {
    1: [[b, b]],
    2: [[a, a], [c, c]],
    3: [[a, a], [b, b], [c, c]],
    4: [[a, a], [c, a], [a, c], [c, c]],
    5: [[a, a], [c, a], [b, b], [a, c], [c, c]],
    6: [[a, a], [c, a], [a, b], [c, b], [a, c], [c, c]],
  };
  return P[v] || [];
}

// Dé face visible. Le 1 (joker) a ses pips en rouge pour rappeler qu'il compte
// pour n'importe quelle face lors du comptage.
function deFace(x, y, s, v) {
  const rp = s * 0.088;
  const joker = (v === 1);
  let out = `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.16}" fill="#fbf8ef" stroke="#cdbf9c" stroke-width="1.4"/>`;
  if (joker) out += `<rect x="${x + s * 0.06}" y="${y + s * 0.06}" width="${s * 0.88}" height="${s * 0.88}" rx="${s * 0.12}" fill="none" stroke="#b12a1c" stroke-width="1.2" opacity="0.5"/>`;
  for (const [fx, fy] of _pips(v)) out += `<circle cx="${x + fx * s}" cy="${y + fy * s}" r="${rp}" fill="${joker ? ROUGE : NOIR}"/>`;
  return out;
}

// Dos de dé ornementé (emblème de la maison Iron Wolf).
function deDos(x, y, s) {
  const cx = x + s / 2, cy = y + s / 2;
  return `<g>
    <rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.16}" fill="#7c1f17" stroke="#e7cf94" stroke-width="1.4"/>
    <rect x="${x + s * 0.13}" y="${y + s * 0.13}" width="${s * 0.74}" height="${s * 0.74}" rx="${s * 0.10}" fill="none" stroke="#caa457" stroke-width="1"/>
    <text x="${cx}" y="${cy + s * 0.12}" font-family="DejaVu Sans, Arial, sans-serif" font-size="${s * 0.34}" font-weight="bold" fill="#e7cf94" text-anchor="middle">IW</text>
  </g>`;
}

function ligneDes(des, cache, x, y, s, gap) {
  let out = '';
  (des || []).forEach((v, i) => {
    const dx = x + i * (s + gap);
    out += cache ? deDos(dx, y, s) : deFace(dx, y, s, v);
  });
  return out;
}

// Cadre + tapis communs.
function _plateau(S, W, H, titre, sousTitre) {
  S.push(`<defs><radialGradient id="felt" cx="50%" cy="30%" r="85%"><stop offset="0%" stop-color="#12704a"/><stop offset="100%" stop-color="#093a25"/></radialGradient></defs>`);
  S.push(`<rect width="${W}" height="${H}" fill="#0a2a1c"/>`);
  S.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="24" fill="url(#felt)" stroke="#c8a45c" stroke-width="3"/>`);
  S.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="#0c3f28" stroke-width="2"/>`);
  S.push(`<text x="${W / 2}" y="52" font-family="DejaVu Serif, Georgia, serif" font-size="28" font-weight="bold" fill="#e7cf94" text-anchor="middle" letter-spacing="3">${esc(titre)}</text>`);
  if (sousTitre) S.push(`<text x="${W / 2}" y="74" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#d8e8dd" text-anchor="middle">${esc(sousTitre)}</text>`);
}

// state = { sousTitre, pot, bid:{qty,face,parNom}|null, reveal, historique:[str],
//           defi:{txt}|null, gagnant, joueurs:[{nom,nb,des,cache,actif,vivant,badge}] }
async function genererTable(state) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const W = 960;
    const DS = 46, GAP = 8;
    const headH = 88, rowH = 74;
    const joueurs = state.joueurs || [];
    const footH = 96;
    const H = headH + Math.max(1, joueurs.length) * rowH + footH;

    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    _plateau(S, W, H, 'SALOON  ·  POKER MENTEUR', state.sousTitre);

    // Bandeau enchère + pot
    const bidY = headH - 4;
    const bidTxt = state.bid ? `Enchère : ${state.bid.qty} × ${state.bid.face}` + (state.bid.parNom ? `  (${_clean(state.bid.parNom)})` : '') : 'Aucune enchère — à l\'ouvreur de parler';
    S.push(`<rect x="30" y="${bidY}" width="${W - 60}" height="30" rx="8" fill="#0c3f28" stroke="#caa457" stroke-width="1.1" opacity="0.9"/>`);
    S.push(`<text x="46" y="${bidY + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" fill="#ffe8a3">${esc(bidTxt)}</text>`);
    if (state.pot != null) S.push(`<text x="${W - 46}" y="${bidY + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" font-weight="bold" fill="#e7cf94" text-anchor="end">POT : ${esc(state.pot)}</text>`);

    // Joueurs
    joueurs.forEach((j, idx) => {
      const y = headH + 30 + idx * rowH;
      if (j.actif) S.push(`<rect x="24" y="${y - 4}" width="${W - 48}" height="${rowH - 8}" rx="12" fill="#0f5132" opacity="0.5" stroke="#e7cf94" stroke-width="1.5"/>`);
      const nomCol = !j.vivant ? '#8fa79a' : (j.actif ? '#ffe8a3' : '#eaf3ec');
      S.push(`<text x="42" y="${y + 22}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="${nomCol}">${j.actif ? '▸ ' : ''}${esc(j.nom)}${!j.vivant ? '  ✗' : ''}</text>`);
      S.push(`<text x="42" y="${y + 42}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#bcd7c6">${j.nb} dé${j.nb > 1 ? 's' : ''}${j.badge ? '   ·   ' + esc(j.badge) : ''}</text>`);
      // Dés à droite
      const desX = 300;
      if (!j.vivant) {
        S.push(`<text x="${desX}" y="${y + 32}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#8fa79a" font-style="italic">— hors jeu —</text>`);
      } else if (j.nb > 0) {
        const arr = (state.reveal && j.des && j.des.length) ? j.des : Array.from({ length: j.nb }, () => 0);
        const cache = !(state.reveal && j.des && j.des.length);
        S.push(ligneDes(cache ? Array.from({ length: j.nb }, () => 1) : arr, cache, desX, y - 2, DS, GAP));
      }
    });
    if (!joueurs.length) S.push(`<text x="${W / 2}" y="${headH + 70}" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" fill="#cfe3d6" text-anchor="middle" font-style="italic">Aucun joueur — asseyez-vous pour jouer.</text>`);

    // Pied : historique / défi / gagnant
    const fY = H - footH + 14;
    S.push(`<line x1="30" y1="${fY - 6}" x2="${W - 30}" y2="${fY - 6}" stroke="#c8a45c" stroke-width="1.2" opacity="0.6"/>`);
    if (state.gagnant) {
      S.push(`<text x="${W / 2}" y="${fY + 34}" font-family="DejaVu Serif, Georgia, serif" font-size="26" font-weight="bold" fill="#ffe8a3" text-anchor="middle">★ ${esc(state.gagnant)} rafle la mise ! ★</text>`);
    } else if (state.defi && state.defi.txt) {
      S.push(`<text x="46" y="${fY + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" font-weight="bold" fill="#ffd9a0">${esc(state.defi.txt)}</text>`);
      const hist = (state.historique || []).slice(-3).join('    ·    ');
      if (hist) S.push(`<text x="46" y="${fY + 44}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#bcd7c6">Enchères : ${esc(hist)}</text>`);
    } else {
      S.push(`<text x="46" y="${fY + 20}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" font-weight="bold" fill="#e7cf94">Dernières enchères</text>`);
      const hist = (state.historique || []).slice(-4);
      if (hist.length) S.push(`<text x="46" y="${fY + 42}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#cfe3d6">${esc(hist.join('    ·    '))}</text>`);
      else S.push(`<text x="46" y="${fY + 42}" font-family="DejaVu Sans, Arial, sans-serif" font-size="13" fill="#9fbcac" font-style="italic">— la manche commence —</text>`);
    }

    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ pokermenteur-image genererTable:', e.message); return null; }
}

// Rend la main PRIVÉE d'un joueur (dés face visible) pour la réponse éphémère pm_peek.
async function genererMain(des, nom) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const DS = 64, GAP = 12;
    const n = Math.max(1, (des || []).length);
    const W = Math.max(360, 60 + n * (DS + GAP));
    const H = 150;
    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    _plateau(S, W, H, 'VOS DÉS', nom ? _clean(nom) : '');
    S.push(ligneDes(des || [], false, 30, 74, DS, GAP));
    // Rappel joker
    S.push(`<text x="${W / 2}" y="${H - 14}" font-family="DejaVu Sans, Arial, sans-serif" font-size="12" fill="#ffd9a0" text-anchor="middle" font-style="italic">Les 1 (en rouge) sont des jokers.</text>`);
    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ pokermenteur-image genererMain:', e.message); return null; }
}

module.exports = { genererTable, genererMain, _test: { _pips } };
