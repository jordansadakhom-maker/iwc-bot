// ═══════════════════════════════════════════════════════════════
// parchemin-image.js — Génère une image « document parchemin » avec le texte
// gravé À L'ENCRE par-dessus la texture (sharp + SVG). Discord ne permet pas de
// texte sur image dans un embed → on fabrique donc une vraie image à envoyer.
// sharp est chargé de façon paresseuse : si absent (échec d'install), on renvoie
// null et l'appelant retombe sur l'embed classique — jamais de crash.
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
let _texB64 = null;
function texture() {
  if (_texB64 !== null) return _texB64;
  try { _texB64 = fs.readFileSync(path.join(__dirname, 'assets', 'parchemin-page.png')).toString('base64'); }
  catch { _texB64 = ''; }
  return _texB64;
}
const esc = s => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Découpe un texte en lignes selon une largeur max (approx : largeur moyenne d'un caractère ≈ 0.52 × taille)
function wrap(txt, maxWidth, fontSize) {
  const cpl = Math.max(8, Math.floor(maxWidth / (fontSize * 0.52)));
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

// blocks : [{type:'title'|'subtitle'|'rule'|'field'|'para'|'quote'|'gap', ...}]
async function genererParchemin(blocks, opts = {}) {
  const sharp = getSharp();
  if (!sharp || !texture()) return null;
  const W = opts.width || 820;
  const ML = 92, MR = 92;
  const innerW = W - ML - MR;
  const INK = '#3a2a16', INK2 = '#5e4526';
  const FONT = "Georgia,'DejaVu Serif','Times New Roman',serif";
  let y = 92;
  const els = [];
  const T = (txt, { x = W / 2, size = 22, color = INK, weight = 'normal', italic = false, anchor = 'middle', spacing = 0 } = {}) =>
    els.push(`<text x="${x}" y="${y}" font-family="${FONT}" font-size="${size}" fill="${color}" font-weight="${weight}" font-style="${italic ? 'italic' : 'normal'}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(txt)}</text>`);

  for (const b of blocks) {
    if (b.type === 'gap') { y += b.h || 18; continue; }
    if (b.type === 'title') { y += 10; T(b.text, { size: 33, weight: 'bold', spacing: 1 }); y += 12; continue; }
    if (b.type === 'subtitle') { y += 28; T(b.text, { size: 18, italic: true, color: INK2, spacing: 3 }); continue; }
    if (b.type === 'rule') { y += 28; els.push(`<line x1="${ML + 30}" y1="${y}" x2="${W - MR - 30}" y2="${y}" stroke="${INK2}" stroke-width="1.4" opacity="0.7"/>`); T('✦', { y, size: 15, color: INK2 }); y += 14; continue; }
    if (b.type === 'field') {
      y += 32; T(b.label.toUpperCase(), { x: ML, size: 14, weight: 'bold', color: INK2, anchor: 'start', spacing: 1 });
      y += 25;
      for (const ln of wrap(b.value || '—', innerW, 21)) { T(ln, { x: ML, size: 21, color: INK, anchor: 'start' }); y += 28; }
      continue;
    }
    if (b.type === 'para') {
      y += 26;
      if (b.label) { T(b.label.toUpperCase(), { x: ML, size: 14, weight: 'bold', color: INK2, anchor: 'start', spacing: 1 }); y += 25; }
      for (const ln of wrap(b.text || '—', innerW, 20)) { T(ln, { x: ML, size: 20, color: INK, anchor: 'start' }); y += 27; }
      continue;
    }
    if (b.type === 'quote') {
      y += 32;
      for (const ln of wrap(b.text || '', innerW, 18)) { T(ln, { size: 18, italic: true, color: INK2 }); y += 25; }
      continue;
    }
  }
  y += 84;
  const H = Math.max(opts.minHeight || 560, Math.round(y));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <image href="data:image/png;base64,${texture()}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="36" y="36" width="${W - 72}" height="${H - 72}" fill="none" stroke="#5e452655" stroke-width="2"/>
    ${els.join('\n')}
  </svg>`;
  try { return await sharp(Buffer.from(svg)).png().toBuffer(); }
  catch (e) { console.log('⚠️ parchemin-image rendu:', e.message); return null; }
}

module.exports = { genererParchemin, disponible: () => !!getSharp() };
