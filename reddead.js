// ═══════════════════════════════════════════════════════════════
//  reddead.js — Le Photographe (salon Far West)
//  Quand un membre poste UNE ou PLUSIEURS captures Red Dead / RedM
//  dans le salon dédié :
//   → l'IA (Google Gemini 2.5 Flash Image, « Nano Banana ») repeint
//     la capture en un beau cliché photoréaliste façon Far West 1890
//     (sépia, grain, lumière d'époque), HUD du jeu retiré
//   → le bot re-poste le cliché dans une fiche propre
//   → la capture d'origine est retirée (salon net) — comme Le Vestiaire
//   → réactions d'appréciation
//
//  Silencieux s'il n'y a pas de clé GEMINI_API_KEY (rien n'est touché).
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, AttachmentBuilder } = require('discord.js');

// Salon Far West (overridable via .env). ID demandé par la Direction.
const RED_DEAD_CHANNEL_ID = process.env.RED_DEAD_CHANNEL_ID || '1508756424862203988';

// Modèle Gemini d'édition d'image. Overridable via .env (GEMINI_IMAGE_MODEL),
// p. ex. « gemini-3-pro-image-preview » (Nano Banana Pro) pour la meilleure qualité.
// Par défaut : « gemini-2.5-flash-image » (Nano Banana), le plus économique.
const GEMINI_MODELS = [process.env.GEMINI_IMAGE_MODEL, 'gemini-2.5-flash-image']
  .filter((m, i, a) => m && a.indexOf(m) === i);

const PROMPT_FARWEST = [
  "Transforme cette capture d'écran du jeu vidéo Red Dead Redemption en une véritable et magnifique photographie ancienne du Far West américain (frontière, fin du XIXe siècle, vers 1890).",
  "Garde EXACTEMENT la même scène : mêmes personnages, mêmes poses, même décor, même cadrage et même composition.",
  "Rends-la comme un authentique cliché d'époque, photoréaliste et cinématographique : tons chauds sépia/ambre, grain de pellicule argentique, léger vignettage, lumière naturelle d'époque, poussière et atmosphère, à la manière d'une photo de l'Ouest des années 1890 ou d'un plan de film western.",
  "Retire impérativement tous les éléments d'interface du jeu : ATH/HUD, textes à l'écran, menus, mini-carte, icônes, jauges, sous-titres, filigranes.",
  "Ne réponds qu'avec l'image éditée, sans texte.",
].join(' ');

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}

// Accepte toute pièce jointe « image » (le contentType Discord est parfois vide/erroné).
function _estImage(a) {
  if (!a) return false;
  if ((a.contentType || '').startsWith('image')) return true;
  if (/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|jfif|avif)(\?|$)/i.test(a.name || a.url || '')) return true;
  return (a.width != null && a.height != null);
}
const _SUPPORTED_MT = ['image/png', 'image/jpeg', 'image/webp'];
function _cleanMt(mt) { let m = String(mt || 'image/png').split(';')[0].trim().toLowerCase(); if (m === 'image/jpg') m = 'image/jpeg'; return _SUPPORTED_MT.includes(m) ? m : 'image/png'; }
function _sniffMt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}
// Pour rester sous les limites, on demande au proxy Discord une version ≤1568px si l'image est grande.
function _urlPourIA(a) {
  const grande = (a.width && a.width > 1600) || (a.height && a.height > 1600) || (a.size && a.size > 3500000);
  if (grande && a.proxyURL) { const sep = a.proxyURL.includes('?') ? '&' : '?'; return `${a.proxyURL}${sep}width=1568&height=1568`; }
  return a.url;
}

// Extrait la 1re image (base64) trouvée dans une réponse Gemini, quelle que soit la casse des champs.
function _extractImage(data) {
  try {
    const cands = data?.candidates || [];
    for (const c of cands) {
      const parts = c?.content?.parts || [];
      for (const p of parts) {
        const inl = p?.inlineData || p?.inline_data;
        if (inl && inl.data) return { b64: inl.data, mt: inl.mimeType || inl.mime_type || 'image/png' };
      }
    }
  } catch {}
  return null;
}

// Un appel Gemini (un modèle). withModalities=true ajoute responseModalities en repli.
async function _callGemini(model, b64, mt, withModalities) {
  const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY; if (!apiKey) return null;
  try {
    const body = {
      contents: [{ role: 'user', parts: [
        { text: PROMPT_FARWEST },
        { inlineData: { mimeType: _cleanMt(mt), data: b64 } },
      ] }],
    };
    if (withModalities) body.generationConfig = { responseModalities: ['TEXT', 'IMAGE'] };
    const resp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    });
    if (!resp.ok) { const t = await resp.text().catch(() => ''); console.log(`❌ reddead Gemini ${model} HTTP ${resp.status}: ${t.slice(0, 200)}`); return null; }
    const data = await resp.json();
    const img = _extractImage(data);
    if (!img) console.log(`⚠️ reddead Gemini ${model}: aucune image dans la réponse`);
    return img;
  } catch (e) { console.log(`❌ reddead Gemini ${model} exception:`, e.message); return null; }
}

// Repeint une image : essaie chaque modèle, puis avec responseModalities en repli.
async function _transformer(b64, mt) {
  for (const model of GEMINI_MODELS) {
    let img = await _callGemini(model, b64, mt, false);
    if (!img) img = await _callGemini(model, b64, mt, true);
    if (img) return img;
  }
  return null;
}

function _isRedDeadChannel(channel) {
  if (!channel) return false;
  if (channel.id === RED_DEAD_CHANNEL_ID) return true;
  if (channel.parentId && channel.parentId === RED_DEAD_CHANNEL_ID) return true; // fils du salon
  return false;
}

async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot || message.webhookId) return false;
    if (!_isRedDeadChannel(message.channel)) return false;
    const atts = message.attachments ? [...message.attachments.values()].filter(_estImage).slice(0, 4) : [];
    if (!atts.length) return false;
    // Pas de clé image → on ne touche à rien (l'utilisateur garde sa capture telle quelle).
    if (!(process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY)) return false;

    const auteur = message.member?.displayName || message.author.username;
    const cap = (message.content || '').trim().slice(0, 250);
    const plur = atts.length > 1 ? `les ${atts.length} clichés` : 'le cliché';
    const wait = await message.channel.send({ content: `🎨 Le photographe développe ${plur} façon Far West…`, allowedMentions: { parse: [] } }).catch(() => null);

    // Repeindre chaque image
    const outBufs = [];
    for (const a of atts) {
      let buf = await _imageBytes(_urlPourIA(a));
      if (!buf) buf = await _imageBytes(a.url);
      if (!buf) continue;
      const mt = _sniffMt(buf) || _cleanMt(a.contentType);
      const img = await _transformer(buf.toString('base64'), mt);
      if (img && img.b64) { try { outBufs.push(Buffer.from(img.b64, 'base64')); } catch {} }
    }

    // Échec total → on garde la capture d'origine et on retire le message d'attente.
    if (!outBufs.length) { if (wait) await wait.delete().catch(() => {}); return false; }

    const files = outBufs.map((b, i) => new AttachmentBuilder(b, { name: `farwest_${i}.png` }));
    const e = new EmbedBuilder()
      .setColor(0x8B5A2B)
      .setTitle('🤠 Cliché du Far West')
      .setDescription("*Capture repeinte par l'IA, façon vieille photographie de l'Ouest.*")
      .setImage('attachment://farwest_0.png')
      .setFooter({ text: `Salon Far West • Iron Wolf Company • partagé par ${auteur}` })
      .setTimestamp();
    if (cap) e.addFields({ name: '📝 Légende', value: cap, inline: false });

    const payload = { content: '', embeds: [e], files, allowedMentions: { parse: [] } };
    let card = null;
    if (wait) card = await wait.edit(payload).catch(() => null);
    if (!card) card = await message.channel.send(payload).catch(() => null);

    if (card) { for (const r of ['🤠', '🔥', '👍']) { await card.react(r).catch(() => {}); } }
    // On retire la capture d'origine UNIQUEMENT si le cliché repeint a bien été posté.
    if (card) await message.delete().catch(() => {});
    return true;
  } catch (e) { console.log('❌ reddead onMessage:', e.message); return false; }
}

module.exports = { onMessage, RED_DEAD_CHANNEL_ID };
