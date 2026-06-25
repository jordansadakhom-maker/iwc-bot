// ═══════════════════════════════════════════════════════════════
// parchemin-image.js — Génère une image « document parchemin » avec le texte
// gravé À L'ENCRE par-dessus la texture (sharp + SVG). Discord ne permet pas de
// texte sur image dans un embed → on fabrique donc une vraie image à envoyer.
//
// Mode ROULEAU : on garde la silhouette du parchemin (fond transparent), le texte
// est contraint à la zone « papier » centrale, et la taille de police s'ajuste
// automatiquement (auto-fit) si le contrat est long, pour ne jamais déborder.
//
// sharp est chargé de façon paresseuse : si absent, on renvoie null et l'appelant
// retombe sur l'embed classique — jamais de crash.
// ═══════════════════════════════════════════════════════════════
const fs = require('fs');
const path = require('path');

let _sharp = null, _sharpTried = false;
function getSharp() {
  if (_sharpTried) return _sharp;
  _sharpTried = true;
  try { _sharp = require('sharp'); } catch (e) { console.log('⚠️ parchemin-image: sharp indisponible →', e.message); _sharp = null; }
  return _sharp;
}
let _tex = null; // { b64, w, h } — dimensions lues dans l'en-tête PNG pour s'adapter à TOUT format d'image
function texture() {
  if (_tex !== null) return _tex;
  try {
    const buf = fs.readFileSync(path.join(__dirname, 'assets', 'parchemin.png'));
    const w = buf.readUInt32BE(16), h = buf.readUInt32BE(20); // IHDR : largeur @16, hauteur @20
    _tex = { b64: buf.toString('base64'), w: w || 500, h: h || 500 };
  } catch { _tex = { b64: '', w: 500, h: 500 }; }
  return _tex;
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Découpe un texte en lignes selon une largeur max (approx : largeur moyenne d'un caractère ≈ 0.52 × taille)
function wrap(txt, maxWidth, fontSize) {
  const cpl = Math.max(6, Math.floor(maxWidth / (fontSize * 0.52)));
  const out = [];
  for (const para of String(txt || '').split(/\n/)) {
    if (!para.trim()) { out.push(''); continue; }
    let line = '';
    for (let word of para.split(/\s+/)) {
      while (word.length > cpl) { if (line) { out.push(line); line = ''; } out.push(word.slice(0, cpl)); word = word.slice(cpl); }
      if (!line) line = word;
      else if ((line + ' ' + word).length <= cpl) line += ' ' + word;
      else { out.push(line); line = word; }
    }
    if (line) out.push(line);
  }
  return out;
}

// Silhouette ROULEAU : canvas au format du parchemin, texte dans la zone papier, auto-fit.
async function genererParchemin(blocks, opts = {}) {
  const sharp = getSharp();
  const tex = texture();
  if (!sharp || !tex.b64) return null;
  const W = opts.width || 760;
  const H = Math.round(W * tex.h / tex.w); // canvas calé sur le ratio RÉEL de la texture (pas de déformation)
  // Zone d'écriture (insets pour rester sur le « papier », à l'écart des bords déchirés)
  const ML = Math.round(W * 0.15), MR = Math.round(W * 0.15);
  const topInset = Math.round(H * 0.13), bottomInset = Math.round(H * 0.11);
  const innerW = W - ML - MR;
  const writableH = H - topInset - bottomInset;
  const INK = '#3a2a16', INK2 = '#5e4526';
  const FONT = "Georgia,'DejaVu Serif','Times New Roman',serif";

  // Construit les éléments SVG pour une échelle donnée ; renvoie { els, bottom }.
  function layout(scale) {
    let y = topInset;
    const els = [];
    const T = (txt, { x = W / 2, size = 22, color = INK, weight = 'normal', italic = false, anchor = 'middle', spacing = 0 } = {}) =>
      els.push(`<text x="${x}" y="${Math.round(y)}" font-family="${FONT}" font-size="${(size * scale).toFixed(1)}" fill="${color}" font-weight="${weight}" font-style="${italic ? 'italic' : 'normal'}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${(spacing * scale).toFixed(2)}"` : ''}>${esc(txt)}</text>`);
    const adv = px => { y += px * scale; };
    for (const b of blocks) {
      if (b.type === 'gap') { adv(b.h || 16); continue; }
      if (b.type === 'title') { adv(8); T(b.text, { size: 30, weight: 'bold', spacing: 1 }); adv(10); continue; }
      if (b.type === 'subtitle') { adv(24); T(b.text, { size: 16, italic: true, color: INK2, spacing: 2 }); continue; }
      if (b.type === 'rule') { adv(22); els.push(`<line x1="${ML + 20}" y1="${Math.round(y)}" x2="${W - MR - 20}" y2="${Math.round(y)}" stroke="${INK2}" stroke-width="${(1.3 * scale).toFixed(2)}" opacity="0.65"/>`); T('✦', { y, size: 13, color: INK2 }); adv(12); continue; }
      if (b.type === 'field') {
        adv(26); T(b.label.toUpperCase(), { x: ML, size: 13, weight: 'bold', color: INK2, anchor: 'start', spacing: 1 }); adv(22);
        for (const ln of wrap(b.value || '—', innerW, 19 * scale)) { T(ln, { x: ML, size: 19, color: INK, anchor: 'start' }); adv(25); }
        continue;
      }
      if (b.type === 'para') {
        adv(22);
        if (b.label) { T(b.label.toUpperCase(), { x: ML, size: 13, weight: 'bold', color: INK2, anchor: 'start', spacing: 1 }); adv(22); }
        for (const ln of wrap(b.text || '—', innerW, 18 * scale)) { T(ln, { x: ML, size: 18, color: INK, anchor: 'start' }); adv(24); }
        continue;
      }
      if (b.type === 'quote') {
        adv(26);
        for (const ln of wrap(b.text || '', innerW, 16 * scale)) { T(ln, { size: 16, italic: true, color: INK2 }); adv(22); }
        continue;
      }
    }
    return { els, bottom: y };
  }

  // Pass 1 (échelle 1) → mesure ; si ça déborde la zone papier, on réduit la police (jusqu'à 0,55).
  let scale = 1;
  const mesure = layout(1).bottom - topInset;
  if (mesure > writableH) scale = Math.max(0.55, writableH / mesure);
  const { els } = layout(scale);

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <image href="data:image/png;base64,${tex.b64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid meet"/>
    ${els.join('\n')}
  </svg>`;
  try { return await sharp(Buffer.from(svg)).png().toBuffer(); }
  catch (e) { console.log('⚠️ parchemin-image rendu:', e.message); return null; }
}

module.exports = { genererParchemin, disponible: () => !!getSharp() };
