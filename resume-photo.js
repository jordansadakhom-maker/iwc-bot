// ───────────────────────────────────────────────────────────────────────────
//  resume-photo.js — Résumé automatique d'une photo par l'IA (vision)
//  ----------------------------------------------------------------------------
//  Dans le salon configuré ci-dessous, dès qu'une personne poste une (ou
//  plusieurs) photo(s), le bot la LIT (vision IA) et publie, juste en dessous,
//  un TEXTE qui reformule / résume ce que montre l'image.
//
//  La photo d'origine est conservée ; le résumé est posté en réponse.
//  Nécessite ANTHROPIC_API_KEY. Branché via index.js (messageCreate → onMessage).
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');

// Salon où l'on poste les photos à résumer (modifiable).
const SALON_RESUME = '1519640462334365756';

const PROMPT_RESUME = `Tu es un greffier méticuleux. On te montre une ou plusieurs images (souvent des captures d'un jeu Far West type Red Dead / RedM, parfois un document, une carte ou une scène).
Rédige en FRANÇAIS un RÉSUMÉ clair et fidèle de ce que montre l'image, en 2 à 5 phrases bien tournées.
- Décris la scène, les personnages, le lieu, l'action ou les informations visibles.
- Si l'image contient du TEXTE lisible (affiche, lettre, panneau, message), restitue-en l'essentiel.
- Reste fidèle : ne devine pas, n'invente rien que tu ne vois pas.
- Ne mentionne pas que c'est une « capture d'écran » ni l'interface du jeu : va droit au contenu.
- N'ajoute ni titre, ni puces, ni guillemets : seulement le résumé en texte courant.
Si l'image est illisible ou vide, réponds exactement : RIEN.`;

const _SUPPORTED_MT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
function _cleanMt(mt) { let m = String(mt || 'image/png').split(';')[0].trim().toLowerCase(); if (m === 'image/jpg') m = 'image/jpeg'; return _SUPPORTED_MT.includes(m) ? m : 'image/png'; }
function _sniffMt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}
function _estImage(a) {
  if (!a) return false;
  if ((a.contentType || '').startsWith('image')) return true;
  if (/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|jfif|avif)(\?|$)/i.test(a.name || a.url || '')) return true;
  return (a.width != null && a.height != null);
}
async function _bytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}

async function _resumeVision(blocks) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) { console.log('⚠️ resume-photo: ANTHROPIC_API_KEY absente'); return null; }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, messages: [{ role: 'user', content: [...blocks, { type: 'text', text: PROMPT_RESUME }] }] }),
    });
    if (!resp.ok) { const b = await resp.text().catch(() => ''); console.log(`❌ resume-photo vision HTTP ${resp.status}: ${b.slice(0, 300)}`); return null; }
    const data = await resp.json();
    const txt = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return txt || null;
  } catch (e) { console.log('❌ resume-photo vision exception:', e.message); return null; }
}

async function onMessage(message) {
  try {
    if (!message || message.author?.bot || message.webhookId) return false;
    // Salon cible, ou un fil dont le salon-parent est le salon cible (support forum)
    const ok = message.channelId === SALON_RESUME || message.channel?.parentId === SALON_RESUME;
    if (!ok) return false;
    const imgs = message.attachments ? [...message.attachments.values()].filter(_estImage) : [];
    if (!imgs.length) return false;
    if (!process.env.ANTHROPIC_API_KEY) { await message.react('⚠️').catch(() => {}); return false; }

    await message.react('🔍').catch(() => {});
    const blocks = [];
    for (const a of imgs.slice(0, 4)) {
      const buf = await _bytes(a.url);
      if (!buf) continue;
      const mt = _cleanMt(_sniffMt(buf) || a.contentType);
      blocks.push({ type: 'image', source: { type: 'base64', media_type: mt, data: buf.toString('base64') } });
    }
    if (!blocks.length) { await message.reactions?.removeAll?.().catch(() => {}); await message.react('⚠️').catch(() => {}); return true; }

    const resume = await _resumeVision(blocks);
    if (!resume || /^RIEN\.?$/i.test(resume.trim())) {
      await message.react('⚠️').catch(() => {});
      return true;
    }
    await message.react('✅').catch(() => {});
    const embed = new EmbedBuilder()
      .setColor(0xC9A66B)
      .setTitle(`📝 Résumé de la photo${imgs.length > 1 ? `s (${imgs.length})` : ''}`)
      .setDescription(resume.slice(0, 4000))
      .setFooter({ text: 'Résumé rédigé automatiquement par l\'IA d\'après l\'image' });
    await message.reply({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } catch (e) { console.log('⚠️ resume-photo onMessage:', e.message); return false; }
}

module.exports = { onMessage, SALON_RESUME };
