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
  // Hauteur PILOTÉE PAR LE CONTENU (la texture remplit le fond) → marche pour tout format d'image,
  // sans rapetisser le texte. Marges absolues pour rester à l'écart des bords.
  const ML = Math.round(W * 0.11), MR = Math.round(W * 0.11);
  const topInset = 78, bottomInset = 78;
  const innerW = W - ML - MR;
  const INK = '#3a2a16', INK2 = '#5e4526';
  const FONT = "Georgia,'DejaVu Serif','Times New Roman',serif";

  function layout() {
    let y = topInset;
    const els = [];
    const T = (txt, { x = W / 2, size = 22, color = INK, weight = 'normal', italic = false, anchor = 'middle', spacing = 0 } = {}) =>
      els.push(`<text x="${x}" y="${Math.round(y)}" font-family="${FONT}" font-size="${size}" fill="${color}" font-weight="${weight}" font-style="${italic ? 'italic' : 'normal'}" text-anchor="${anchor}"${spacing ? ` letter-spacing="${spacing}"` : ''}>${esc(txt)}</text>`);
    const adv = px => { y += px; };
    for (const b of blocks) {
      if (b.type === 'gap') { adv(b.h || 16); continue; }
      if (b.type === 'title') { adv(10); T(b.text, { size: 32, weight: 'bold', spacing: 1 }); adv(12); continue; }
      if (b.type === 'subtitle') { adv(26); T(b.text, { size: 17, italic: true, color: INK2, spacing: 2 }); continue; }
      if (b.type === 'rule') { adv(26); els.push(`<line x1="${ML + 20}" y1="${Math.round(y)}" x2="${W - MR - 20}" y2="${Math.round(y)}" stroke="${INK2}" stroke-width="1.4" opacity="0.6"/>`); T('✦', { y, size: 14, color: INK2 }); adv(14); continue; }
      if (b.type === 'field') {
        adv(28); T(b.label.toUpperCase(), { x: ML, size: 14, weight: 'bold', color: INK2, anchor: 'start', spacing: 1 }); adv(24);
        for (const ln of wrap(b.value || '—', innerW, 20)) { T(ln, { x: ML, size: 20, color: INK, anchor: 'start' }); adv(27); }
        continue;
      }
      if (b.type === 'para') {
        adv(24);
        if (b.label) { T(b.label.toUpperCase(), { x: ML, size: 14, weight: 'bold', color: INK2, anchor: 'start', spacing: 1 }); adv(24); }
        for (const ln of wrap(b.text || '—', innerW, 19)) { T(ln, { x: ML, size: 19, color: INK, anchor: 'start' }); adv(26); }
        continue;
      }
      if (b.type === 'quote') {
        adv(28);
        for (const ln of wrap(b.text || '', innerW, 17)) { T(ln, { size: 17, italic: true, color: INK2 }); adv(24); }
        continue;
      }
    }
    return { els, bottom: y };
  }

  const { els, bottom } = layout();
  const H = Math.max(opts.minHeight || 460, Math.round(bottom + bottomInset));
  // Fond : teinte parchemin pleine (au cas où l'image a de la transparence) PUIS la texture qui couvre tout.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
    <rect x="0" y="0" width="${W}" height="${H}" fill="#d8c39a"/>
    <image href="data:image/png;base64,${tex.b64}" x="0" y="0" width="${W}" height="${H}" preserveAspectRatio="xMidYMid slice"/>
    <rect x="22" y="22" width="${W - 44}" height="${H - 44}" fill="none" stroke="#5e452633" stroke-width="2"/>
    ${els.join('\n')}
  </svg>`;
  try { return await sharp(Buffer.from(svg)).png().toBuffer(); }
  catch (e) { console.log('⚠️ parchemin-image rendu:', e.message); return null; }
}

module.exports = { genererParchemin, disponible: () => !!getSharp() };
