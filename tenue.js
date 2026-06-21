// ═══════════════════════════════════════════════════════════════
//  tenue.js — Le Vestiaire
//  Quand un membre poste une photo de tenue dans #tenue :
//   → l'IA décrit l'allure façon Far West (le « tailleur »)
//   → fiche immersive avec la photo réuploadée
//   → le message photo d'origine est retiré (salon propre)
//   → réactions d'appréciation
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

const PROMPT_TENUE = "Tu es le tailleur d'une compagnie de mercenaires dans un RP western (Far West texan, fin XIXe siecle). On te montre la tenue d'un personnage. Reponds UNIQUEMENT en JSON strict, sans aucun texte autour, au format exact : {\"description\":\"2 a 3 phrases immersives et elogieuses decrivant l'allure generale du personnage, facon avis du tailleur dans l'Ouest\",\"pieces\":\"liste des pieces visibles avec leurs couleurs (chapeau, manteau, chemise, gilet, pantalon, bottes, foulard/bandana, gants, ceinturon, arme portee...), separees par des virgules\",\"style\":\"un ou deux mots qualifiant le style (ex: elegant, brut, hors-la-loi, distingue, sauvage, sobre, baroudeur)\"}. Si l'image ne montre pas un personnage en tenue, mets description a 'Tenue non identifiable'.";

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}

async function _callVisionTenue(model, b64, mt) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 700, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mt || 'image/png', data: b64 } },
        { type: 'text', text: PROMPT_TENUE },
      ] }] }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data?.content?.[0]?.text || '');
  } catch { return null; }
}

function _parseTenue(txt) {
  if (!txt) return null;
  txt = String(txt).trim().replace(/```json/gi, '').replace(/```/g, '').trim();
  const m = txt.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const o = JSON.parse(m[0]); return (o && typeof o === 'object') ? o : null; } catch { return null; }
}

async function _analyserTenue(b64, mt) {
  let t = await _callVisionTenue('claude-sonnet-4-6', b64, mt);
  if (!t) t = await _callVisionTenue('claude-haiku-4-5-20251001', b64, mt);
  return _parseTenue(t);
}

function _isTenueChannel(channel) {
  const clean = (channel?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  return /tenue|vestiaire/.test(clean);
}

async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    if (!_isTenueChannel(message.channel)) return false;
    const img = message.attachments ? [...message.attachments.values()].find(a => (a.contentType || '').startsWith('image')) : null;
    if (!img) return false;

    const cap = (message.content || '').trim();
    const nomPerso = (cap && cap.length <= 40) ? cap : (message.member?.displayName || message.author.username);
    const note = (cap && cap.length > 40) ? cap.slice(0, 250) : '';

    const wait = await message.channel.send({ content: '🧵 Le tailleur examine la tenue…', allowedMentions: { parse: [] } }).catch(() => null);
    const buf = await _imageBytes(img.url);
    const t = buf ? await _analyserTenue(buf.toString('base64'), img.contentType || 'image/png') : null;

    const fileName = 'tenue.png';
    const att = buf ? new AttachmentBuilder(buf, { name: fileName }) : null;
    const e = new EmbedBuilder()
      .setColor(0x8B5A2B)
      .setTitle(`🤠 ${nomPerso} — Allure`)
      .setFooter({ text: `Le Vestiaire • Iron Wolf Company • partagé par ${message.author.username}` })
      .setTimestamp();
    if (att) e.setImage(`attachment://${fileName}`);
    if (t && t.description && !/non identifiable/i.test(String(t.description))) {
      e.setDescription(`*« ${String(t.description).slice(0, 600)} »*\n— le tailleur de la Compagnie`);
      if (t.pieces) e.addFields({ name: '👔 Pièces de la tenue', value: String(t.pieces).slice(0, 1024), inline: false });
      if (t.style) e.addFields({ name: '✨ Style', value: String(t.style).slice(0, 200), inline: true });
    } else {
      e.setDescription('*Une allure digne de l\'Ouest.*');
    }
    if (note) e.addFields({ name: '📝 Note', value: note.slice(0, 250), inline: false });

    const payload = { content: '', embeds: [e] };
    if (att) payload.files = [att];
    let card = null;
    if (wait) card = await wait.edit(payload).catch(() => null); else card = await message.channel.send(payload).catch(() => null);

    if (card) { for (const r of ['🤠', '🔥', '👍']) { await card.react(r).catch(() => {}); } }
    // Retirer le message d'origine UNIQUEMENT si on a pu réuploader la photo (sinon on ne perd rien)
    if (att && card) await message.delete().catch(() => {});
    return true;
  } catch { return false; }
}

module.exports = { onMessage };
