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

// Catégories par région (Texas / Louisiane) + repli.
const REGIONS = {
  texas:     { label: 'Texas',     emoji: '🤠', color: 0xC0392B },
  louisiane: { label: 'Louisiane', emoji: '⚜️', color: 0x8E44AD },
  autre:     { label: 'Autre',     emoji: '📰', color: 0xC8A45C },
};
// Rôle La Confrérie (pôle illégal) : pingé dans le salon + prévenu en MP quand une annonce importante est repérée.
const ROLE_CONFRERIE = '1508898841993281658';

const PROMPT_RESUME = `Tu es un greffier méticuleux. On te montre une ou plusieurs images (captures d'un jeu Far West type Red Dead / RedM : journaux, affiches, lettres, scènes).
Analyse-les et réponds UNIQUEMENT en JSON valide, sans markdown, ce format EXACT :
{"resume":"résumé clair et fidèle en 2 à 5 phrases en français, va droit au contenu (ne mentionne pas que c'est une capture ni l'interface du jeu)","region":"un seul mot: texas, louisiane ou autre","importante":true ou false}
- "region" : l'État concerné par l'info si identifiable (Texas / Louisiane), sinon "autre".
- "importante" : true si c'est une nouvelle NOTABLE pour la direction (conflit, attaque, braquage, événement majeur, menace, grosse opportunité, décision officielle) ; false si c'est anecdotique/ordinaire.
- Reste fidèle, n'invente rien que tu ne vois pas.
Si l'image est illisible ou vide, réponds {"resume":"RIEN","region":"autre","importante":false}.`;

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
    if (!txt) return null;
    let obj = null;
    try { obj = JSON.parse(txt.replace(/```json|```/g, '').trim()); } catch {}
    if (!obj || !obj.resume) obj = { resume: txt, region: 'autre', importante: false }; // repli : texte brut
    return obj;
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

    const res = await _resumeVision(blocks);
    if (!res || !res.resume || /^RIEN\.?$/i.test(String(res.resume).trim())) {
      await message.react('⚠️').catch(() => {});
      return true;
    }
    const region = REGIONS[String(res.region || '').toLowerCase()] || REGIONS.autre;
    const important = res.importante === true || /^(true|oui|importante?)$/i.test(String(res.importante || ''));
    await message.react(important ? '🚨' : '✅').catch(() => {});

    const embed = new EmbedBuilder()
      .setColor(important ? 0xED4245 : region.color)
      .setTitle(`📝 Résumé — ${region.emoji} ${region.label}${imgs.length > 1 ? ` (${imgs.length} photos)` : ''}`)
      .setDescription(String(res.resume).slice(0, 4000))
      .addFields(
        { name: '🗂️ Catégorie', value: `${region.emoji} ${region.label}`, inline: true },
        { name: '📌 Importance', value: important ? '🚨 Importante' : '• Ordinaire', inline: true },
      )
      .setFooter({ text: 'Résumé rédigé automatiquement par l\'IA d\'après l\'image' });
    const reply = await message.reply({ embeds: [embed], allowedMentions: { parse: [] } }).catch(() => null);

    // ── Annonce IMPORTANTE → ping de La Confrérie dans le salon + MP à chaque membre ──
    if (important) {
      const lien = reply ? `https://discord.com/channels/${message.guild.id}/${message.channel.id}/${reply.id}` : null;
      // Ping du rôle Confrérie dans le salon
      await message.channel.send({
        content: `🚨 <@&${ROLE_CONFRERIE}> — **annonce journal importante** (${region.emoji} ${region.label}), à voir ci-dessus.`,
        allowedMentions: { roles: [ROLE_CONFRERIE] },
      }).catch(() => {});
      // MP à chaque membre de la Confrérie : résumé + photo + lien
      const photoUrl = imgs[0]?.url || null;
      let role = message.guild.roles.cache.get(ROLE_CONFRERIE) || null;
      try { await message.guild.members.fetch(); } catch {} // s'assurer que les membres du rôle sont en cache
      role = message.guild.roles.cache.get(ROLE_CONFRERIE) || role;
      if (role) {
        let n = 0;
        for (const mem of role.members.values()) {
          if (mem.user.bot) continue;
          if (n >= 60) break; // garde-fou anti-abus
          n++;
          const dmE = EmbedBuilder.from(embed);
          if (photoUrl) dmE.setImage(photoUrl);
          if (lien) dmE.addFields({ name: '🔗 Voir dans le salon', value: `[Ouvrir le message](${lien})` });
          mem.send({ content: `🚨 **Annonce journal importante** (${region.emoji} ${region.label}) :`, embeds: [dmE] }).catch(() => {});
        }
      }
    }
    return true;
  } catch (e) { console.log('⚠️ resume-photo onMessage:', e.message); return false; }
}

// ── Panneau permanent (posté + épinglé une seule fois, idempotent) ──
const _TITRE_PANNEAU = '📸 RÉSUMÉ AUTOMATIQUE DE PHOTOS';
function _panneauEmbed() {
  return new EmbedBuilder()
    .setColor(0xC9A66B)
    .setTitle(_TITRE_PANNEAU)
    .setDescription([
      '*Poste une **photo** de presse/journal dans ce salon — j\'en rédige automatiquement un **résumé**, classé par **région**.*',
      '',
      '**Comment ça marche :**',
      '1️⃣ Envoie une (ou plusieurs) **photo(s)** ici.',
      '2️⃣ Je la lis (🔍) puis je réponds avec un **« 📝 Résumé »** étiqueté **🤠 Texas** ou **⚜️ Louisiane**.',
      '3️⃣ Si l\'info est **importante** 🚨, je **ping La Confrérie** et j\'envoie à chaque membre un **MP** (résumé + photo + lien).',
      '',
      '✅ Aucune commande à taper. La photo reste en place, le résumé s\'ajoute dessous.',
    ].join('\n'))
    .setFooter({ text: 'Résumé rédigé par l\'IA d\'après l\'image' });
}
function _estPanneau(m, botId) {
  return m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('RÉSUMÉ AUTOMATIQUE');
}
async function installerPanneau(client) {
  try {
    const ch = await client.channels.fetch(SALON_RESUME).catch(() => null);
    if (!ch || typeof ch.send !== 'function') return; // salon introuvable, ou forum (pas de panneau épinglé)
    const botId = client.user.id;
    // Idempotent : si le panneau existe déjà (épinglé ou récent), on ne le redouble pas.
    let exists = null;
    try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) exists = pins.find(m => _estPanneau(m, botId)); } catch {}
    if (!exists) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) exists = recent.find(m => _estPanneau(m, botId)); }
    if (exists) return; // déjà en place
    const m = await ch.send({ embeds: [_panneauEmbed()] }).catch(() => null);
    if (m) await m.pin().catch(() => {});
  } catch (e) { console.log('⚠️ resume-photo installerPanneau:', e.message); }
}

module.exports = { onMessage, installerPanneau, SALON_RESUME };
