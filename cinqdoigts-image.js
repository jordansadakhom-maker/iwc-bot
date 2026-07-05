// ═══════════════════════════════════════════════════════════════
// cinqdoigts-image.js — Rend la table de CINQ DOIGTS (Five Finger Fillet)
// en VRAIE image (sharp + SVG) : tapis de feutre du saloon, une main écartée
// vue de dessus posée sur la table, un couteau, et l'intervalle CIBLE en LUEUR
// dorée. En cas d'échec, une ENTAILLE rouge marque le gap raté.
//   • sharp est chargé PARESSEUSEMENT : s'il manque, on renvoie null et
//     cinqdoigts.js retombe sur l'affichage texte (jamais de crash).
//   • Aucune dépendance à une police pour les FORMES (couteau, main, lueur
//     sont des chemins vectoriels) — on garde les conventions de
//     blackjack-image.js (feutre #12704a→#093a25, bordure or #c8a45c,
//     DejaVu Sans / DejaVu Serif, _clean pour retirer les emoji du plan astral).
// ═══════════════════════════════════════════════════════════════
let _sharp = null, _tried = false;
function getSharp() { if (_tried) return _sharp; _tried = true; try { _sharp = require('sharp'); } catch (e) { console.log('⚠️ cinqdoigts-image: sharp indisponible →', e.message); _sharp = null; } return _sharp; }

// Retire les emoji du plan astral (💥🔪🈚…) qui ne s'affichent pas dans le rendu SVG.
const _clean = s => String(s == null ? '' : s).replace(/[\u{10000}-\u{10FFFF}️‍]/gu, '').replace(/\s{2,}/g, ' ').trim();
const esc = s => _clean(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// ─── Couteau vectoriel : pointe (tip) en bas, lame + garde + manche au-dessus.
function couteau(cx, tipY) {
  const bladeLen = 84, bladeW = 20, handleLen = 66, handleW = 26;
  const topBlade = tipY - bladeLen;
  const topHandle = topBlade - handleLen - 6;
  return `<g>
    <polygon points="${cx - bladeW / 2},${topBlade} ${cx + bladeW / 2},${topBlade} ${cx + 2.5},${tipY} ${cx - 2.5},${tipY}" fill="#d9dde3" stroke="#7f858e" stroke-width="1.2"/>
    <line x1="${cx - 3}" y1="${topBlade}" x2="${cx - 1}" y2="${tipY - 6}" stroke="#aeb4bd" stroke-width="1.3"/>
    <rect x="${cx - handleW / 2 - 5}" y="${topBlade - 7}" width="${handleW + 10}" height="8" rx="3" fill="#caa457" stroke="#8a6d3b" stroke-width="0.8"/>
    <rect x="${cx - handleW / 2}" y="${topHandle}" width="${handleW}" height="${handleLen}" rx="8" fill="#5a3b23" stroke="#3a2413" stroke-width="1.4"/>
    ${Array.from({ length: 3 }, (_, i) => `<circle cx="${cx}" cy="${topHandle + 16 + i * 18}" r="2.4" fill="#caa457"/>`).join('')}
  </g>`;
}

// ─── Main écartée vue de dessus (avant-bras + paume + 5 doigts).
const CX = 480;
const FX = [364, 422, 480, 538, 596];        // centre horizontal de chaque doigt
const FLEN = [118, 172, 202, 186, 148];       // longueur de chaque doigt (pouce → auriculaire)
const FW = [46, 40, 42, 40, 36];              // largeur de chaque doigt
const PALM_TOP = 352;
// 5 intervalles (boutons 1..5) : à gauche du pouce, puis les 4 gaps entre doigts.
const GX = [335, 393, 451, 509, 567];
const SLOT_Y = 300;

function main() {
  let s = '';
  // avant-bras
  s += `<rect x="${CX - 150}" y="466" width="300" height="120" rx="34" fill="#e0ad81" stroke="#8a5a3a" stroke-width="2"/>`;
  // doigts (dessinés AVANT la paume pour que la paume recouvre proprement les bases)
  FX.forEach((x, i) => {
    const len = FLEN[i], w = FW[i], top = PALM_TOP - len;
    s += `<rect x="${x - w / 2}" y="${top}" width="${w}" height="${len + 46}" rx="${w / 2}" fill="#e8b98f" stroke="#8a5a3a" stroke-width="2"/>`;
    // ongle
    s += `<ellipse cx="${x}" cy="${top + 14}" rx="${w * 0.28}" ry="9" fill="#f3d3b4" opacity="0.8"/>`;
  });
  // paume
  s += `<rect x="${CX - 150}" y="${PALM_TOP}" width="300" height="150" rx="58" fill="#e8b98f" stroke="#8a5a3a" stroke-width="2"/>`;
  s += `<path d="M${CX - 96} ${PALM_TOP + 40} Q${CX - 40} ${PALM_TOP + 90} ${CX + 40} ${PALM_TOP + 70}" fill="none" stroke="#c68f66" stroke-width="2" opacity="0.6"/>`;
  return s;
}

// state = { sousTitre, mode, cible, fenetre, manche, entaille, actifNom, resultat,
//           joueurs:[{nom, mise, score, actif}], peek }
async function genererTable(state) {
  const sharp = getSharp();
  if (!sharp) return null;
  try {
    const W = 960, H = 680;
    const cible = state.cible || null;
    const S = [];
    S.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">`);
    // Tapis de feutre (conventions blackjack)
    S.push(`<defs><radialGradient id="felt" cx="50%" cy="30%" r="82%"><stop offset="0%" stop-color="#12704a"/><stop offset="100%" stop-color="#093a25"/></radialGradient>`);
    S.push(`<radialGradient id="glow" cx="50%" cy="50%" r="50%"><stop offset="0%" stop-color="#ffe6a0" stop-opacity="0.9"/><stop offset="100%" stop-color="#f4c96b" stop-opacity="0"/></radialGradient></defs>`);
    S.push(`<rect width="${W}" height="${H}" fill="#0a2a1c"/>`);
    S.push(`<rect x="10" y="10" width="${W - 20}" height="${H - 20}" rx="24" fill="url(#felt)" stroke="#c8a45c" stroke-width="3"/>`);
    S.push(`<rect x="20" y="20" width="${W - 40}" height="${H - 40}" rx="18" fill="none" stroke="#0c3f28" stroke-width="2"/>`);
    // Planche de bois sous la main (table du saloon)
    S.push(`<rect x="150" y="250" width="660" height="360" rx="18" fill="#5a3a22" stroke="#3a2413" stroke-width="3" opacity="0.92"/>`);
    S.push(`<g stroke="#4a2f1b" stroke-width="2" opacity="0.55">${Array.from({ length: 5 }, (_, i) => `<line x1="150" y1="${300 + i * 62}" x2="810" y2="${300 + i * 62}"/>`).join('')}</g>`);

    // En-tête
    const titre = state.peek ? 'TA LECTURE  ·  CINQ DOIGTS' : 'SALOON  ·  CINQ DOIGTS';
    S.push(`<text x="${W / 2}" y="52" font-family="DejaVu Serif, Georgia, serif" font-size="30" font-weight="bold" fill="#e7cf94" text-anchor="middle" letter-spacing="3">${titre}</text>`);
    if (state.sousTitre) S.push(`<text x="${W / 2}" y="78" font-family="DejaVu Sans, Arial, sans-serif" font-size="15" fill="#d8e8dd" text-anchor="middle">${esc(state.sousTitre)}</text>`);

    // Bandeau infos (mode / manche / fenêtre)
    const infos = [];
    if (state.mode) infos.push(state.mode === 'duel' ? 'DUEL' : 'SOLO');
    if (state.manche) infos.push('Manche ' + state.manche);
    if (state.fenetre) infos.push('Fenêtre ' + (state.fenetre / 1000).toFixed(1) + ' s');
    if (infos.length) S.push(`<text x="${W / 2}" y="102" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#bcd7c6" text-anchor="middle" letter-spacing="2">${esc(infos.join('   ·   '))}</text>`);

    // La main
    S.push(main());

    // Les 5 intervalles + lueur dorée sur la cible + couteau
    GX.forEach((x, i) => {
      const n = i + 1;
      const isCible = cible === n;
      if (isCible) {
        S.push(`<circle cx="${x}" cy="${SLOT_Y}" r="46" fill="url(#glow)"/>`);
        S.push(`<circle cx="${x}" cy="${SLOT_Y}" r="24" fill="#f6d47f" opacity="0.5"/>`);
      }
      S.push(`<circle cx="${x}" cy="${SLOT_Y}" r="15" fill="${isCible ? '#8a5a1e' : '#0c3f28'}" stroke="${isCible ? '#ffe8a3' : '#c8a45c'}" stroke-width="2"/>`);
      S.push(`<text x="${x}" y="${SLOT_Y + 6}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="${isCible ? '#fff2cf' : '#e7cf94'}" text-anchor="middle">${n}</text>`);
    });
    if (cible) {
      const cx = GX[cible - 1];
      if (state.entaille) {
        // ENTAILLE rouge : le couteau a raté le gap → sang
        S.push(`<line x1="${cx - 42}" y1="${SLOT_Y - 32}" x2="${cx + 42}" y2="${SLOT_Y + 32}" stroke="#c0231a" stroke-width="8" stroke-linecap="round"/>`);
        S.push(`<line x1="${cx - 42}" y1="${SLOT_Y - 32}" x2="${cx + 42}" y2="${SLOT_Y + 32}" stroke="#7a140d" stroke-width="3" stroke-linecap="round"/>`);
        S.push(Array.from({ length: 4 }, (_, k) => `<circle cx="${cx - 28 + k * 20}" cy="${SLOT_Y + 40 + (k % 2) * 14}" r="${4 - k * 0.4}" fill="#a01810"/>`).join(''));
        S.push(couteau(cx, SLOT_Y + 40)); // couteau planté de travers
      } else {
        S.push(couteau(cx, SLOT_Y - 16)); // couteau en suspens au-dessus de la cible
      }
    }

    // Séparateur
    S.push(`<line x1="40" y1="558" x2="${W - 40}" y2="558" stroke="#c8a45c" stroke-width="1.4" opacity="0.55"/>`);

    // Résultat de la dernière manche (lobby)
    if (state.resultat) S.push(`<text x="${W / 2}" y="582" font-family="DejaVu Sans, Arial, sans-serif" font-size="16" fill="#ffe8a3" text-anchor="middle" font-style="italic">${esc(state.resultat)}</text>`);

    // Joueurs (1 = solo centré ; 2 = duel côte à côte)
    const js = state.joueurs || [];
    if (!js.length) {
      S.push(`<text x="${W / 2}" y="628" font-family="DejaVu Sans, Arial, sans-serif" font-size="17" fill="#cfe3d6" text-anchor="middle" font-style="italic">Personne au couteau — choisis Solo ou lance un Duel.</text>`);
    } else {
      const baseY = state.resultat ? 600 : 592;
      const boxW = js.length >= 2 ? 400 : 460;
      const gap = js.length >= 2 ? 40 : 0;
      const totalW = js.length * boxW + (js.length - 1) * gap;
      const startX = (W - totalW) / 2;
      js.forEach((j, i) => {
        const bx = startX + i * (boxW + gap);
        S.push(`<rect x="${bx}" y="${baseY}" width="${boxW}" height="60" rx="12" fill="${j.actif ? '#0f5132' : '#0c3f28'}" opacity="${j.actif ? 0.9 : 0.6}" stroke="${j.actif ? '#ffe8a3' : '#c8a45c'}" stroke-width="${j.actif ? 2 : 1.2}"/>`);
        S.push(`<text x="${bx + 16}" y="${baseY + 26}" font-family="DejaVu Sans, Arial, sans-serif" font-size="18" font-weight="bold" fill="${j.actif ? '#ffe8a3' : '#eaf3ec'}">${j.actif ? '▸ ' : ''}${esc(j.nom)}</text>`);
        const sous = 'Score ' + (j.score || 0) + ' manche(s)' + (j.mise ? '   ·   Mise ' + _clean(j.mise) : '');
        S.push(`<text x="${bx + 16}" y="${baseY + 48}" font-family="DejaVu Sans, Arial, sans-serif" font-size="14" fill="#bcd7c6">${esc(sous)}</text>`);
      });
    }

    S.push('</svg>');
    return await sharp(Buffer.from(S.join(''))).png().toBuffer();
  } catch (e) { console.log('⚠️ cinqdoigts-image genererTable:', e.message); return null; }
}

// Vue privée (bouton peek) : même plateau, titré « TA LECTURE ».
async function genererPeek(state) {
  try { return await genererTable({ ...(state || {}), peek: true }); } catch { return null; }
}

module.exports = { genererTable, genererPeek };
