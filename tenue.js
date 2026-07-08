// ═══════════════════════════════════════════════════════════════
//  tenue.js — Le Vestiaire
//  Quand un membre poste UNE ou PLUSIEURS photos de tenue dans #tenue :
//   → l'IA (le « tailleur ») décrit l'allure façon Far West, en se
//     servant de TOUTES les photos pour bien juger les couleurs
//   → fiche immersive avec les photos réuploadées
//   → le message d'origine est retiré (salon propre)
//   → réactions d'appréciation
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, AttachmentBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const PROMPT_TENUE = "Tu es le tailleur d'une compagnie de mercenaires dans un RP western (Far West texan, fin XIXe siecle). On te montre une ou PLUSIEURS photos de la MEME tenue d'un personnage — parfois sous des angles differents, ou montrant des PARTIES et ACCESSOIRES differents (face, dos, gros plans, chapeau, armes, sacoches...). Utilise-les TOUTES ENSEMBLE : COMBINE ce que montre chaque photo et dresse la liste COMPLETE de la tenue, sans JAMAIS omettre un objet vu sur une seule des photos. Reponds UNIQUEMENT en JSON strict, sans aucun texte autour, au format exact : {\"description\":\"3 a 4 phrases immersives et elogieuses, facon avis d'un tailleur de l'Ouest : la silhouette, l'effet d'ensemble, ce qui fait le caractere et la prestance du personnage\",\"pieces\":\"liste EXHAUSTIVE de TOUTES les pieces et accessoires visibles sur l'ENSEMBLE des photos, AVEC leurs couleurs precises et leurs matieres (chapeau, masque/foulard/bandana, manteau, veste, gilet, chemise, pantalon ou jupe, bottes, gants, ceinturon, holster/etui, arme(s) portee(s), sacoche, bijoux, eperons, insignes...), separees par des virgules ; n'oublie AUCUN objet, meme vu sur une seule photo\",\"couleurs\":\"la palette dominante de la tenue en 2 a 4 couleurs precises (ex: brun cuir, bordeaux, beige sable, noir charbon)\",\"matieres\":\"les matieres apparentes (cuir, laine, lin, coton, peau de bete...), sinon Non visible\",\"style\":\"un ou deux mots qualifiant le style (ex: elegant, brut, hors-la-loi, distingue, sauvage, sobre, baroudeur)\"}. Si les images ne montrent pas un personnage en tenue, mets description a 'Tenue non identifiable'.";

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}

async function _callVisionTenue(model, imgs) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const content = imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mt || 'image/png', data: im.b64 } }));
    content.push({ type: 'text', text: PROMPT_TENUE });
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1500, messages: [{ role: 'user', content }] }),
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

async function _analyserTenue(imgs) {
  let t = await _callVisionTenue('claude-sonnet-4-6', imgs);
  if (!t) t = await _callVisionTenue('claude-haiku-4-5-20251001', imgs);
  return _parseTenue(t);
}

function _isTenueChannel(channel) {
  const clean = (channel?.name || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  // JAMAIS dans un salon d'inventaire / coffre / stock (les photos d'inventaire ne sont pas des tenues),
  // même si l'ID correspond à un ancien salon « tenue » renommé depuis.
  if (/inventaire|coffre|stock|banque|entrepot|magasin/.test(clean)) return false;
  // JAMAIS non plus dans le salon configuré comme COFFRE COMMUN (lecture d'inventaire par photo) :
  // là, les photos sont des captures de coffre, pas des tenues.
  try { const inv = loadDB().inventaire; if (inv?.channelId && channel?.id === inv.channelId) return false; } catch {}
  // Sinon : par ID (fiable même si le salon est renommé) OU par nom.
  if (channel?.id === SALON_TENUE) return true;
  return /tenue|vestiaire/.test(clean);
}

function _ok(v) { return v && !/^(non visible|non identifiable|aucun|néant|n\/a)$/i.test(String(v).trim()); }

// Fusion des photos postées coup sur coup : on accumule les images du même auteur
// pendant quelques secondes, puis on analyse TOUT ensemble → une seule fiche complète,
// même quand la tenue tient sur deux captures séparées.
const _pending = new Map();       // clé « channelId:userId » → lot en cours
const _DEBOUNCE_MS = 4500;        // délai d'attente d'une éventuelle photo suivante

async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    if (!_isTenueChannel(message.channel)) return false;
    const imgsAtt = message.attachments ? [...message.attachments.values()].filter(a => (a.contentType || '').startsWith('image')).slice(0, 6) : [];
    if (!imgsAtt.length) return false;

    const key = message.channel.id + ':' + message.author.id;
    let p = _pending.get(key);
    if (!p) { p = { imgs: [], msgs: [], nom: null, note: '', channel: message.channel, member: message.member, author: message.author, wait: null, timer: null }; _pending.set(key, p); }
    for (const a of imgsAtt) p.imgs.push({ url: a.url, mt: a.contentType || 'image/png' });
    p.imgs = p.imgs.slice(-6); // au plus 6 photos par tenue
    p.msgs.push(message);
    const cap = (message.content || '').trim();
    if (cap) { if (cap.length <= 40 && !p.nom) p.nom = cap; else if (cap.length > 40 && !p.note) p.note = cap.slice(0, 250); }

    const n = p.imgs.length;
    const texte = `🧵 Le tailleur examine ${n > 1 ? `les ${n} photos` : 'la tenue'}…`;
    if (!p.wait) p.wait = await message.channel.send({ content: texte, allowedMentions: { parse: [] } }).catch(() => null);
    else await p.wait.edit({ content: texte }).catch(() => {});

    if (p.timer) clearTimeout(p.timer);
    p.timer = setTimeout(() => { _pending.delete(key); _finaliserTenue(p).catch(() => {}); }, _DEBOUNCE_MS);
    return true;
  } catch { return false; }
}

// Analyse le lot complet (toutes les photos accumulées) et poste UNE fiche.
async function _finaliserTenue(p) {
  try {
    const nomPerso = p.nom || p.member?.displayName || p.author?.username || 'Membre';
    const note = p.note || '';
    const bufs = [];
    for (const im of p.imgs) { const b = await _imageBytes(im.url); if (b) bufs.push({ buf: b, mt: im.mt }); }
    const t = bufs.length ? await _analyserTenue(bufs.map(x => ({ b64: x.buf.toString('base64'), mt: x.mt }))) : null;

    // Pas une tenue → on retire juste le message d'attente, on NE supprime PAS les photos de l'auteur.
    if (t && /non\s*identifiab/i.test(String(t.description || ''))) {
      if (p.wait) await p.wait.delete().catch(() => {});
      return;
    }

    const files = bufs.map((x, i) => new AttachmentBuilder(x.buf, { name: `tenue_${i}.png` }));
    const e = new EmbedBuilder()
      .setColor(0x8B5A2B)
      .setTitle(`🤠 ${nomPerso} — Allure`)
      .setFooter({ text: `Le Vestiaire • Iron Wolf Company • partagé par ${p.author?.username || ''}` })
      .setTimestamp();
    if (files.length) e.setImage('attachment://tenue_0.png');
    if (t && _ok(t.description)) {
      e.setDescription(`*« ${String(t.description).slice(0, 700)} »*\n— le tailleur de la Compagnie`);
      if (_ok(t.pieces)) e.addFields({ name: '👔 Pièces de la tenue', value: String(t.pieces).slice(0, 1024), inline: false });
      if (_ok(t.couleurs)) e.addFields({ name: '🎨 Palette dominante', value: String(t.couleurs).slice(0, 256), inline: true });
      if (_ok(t.matieres)) e.addFields({ name: '🧶 Matières', value: String(t.matieres).slice(0, 256), inline: true });
      if (_ok(t.style)) e.addFields({ name: '✨ Style', value: String(t.style).slice(0, 200), inline: true });
    } else {
      e.setDescription("*Une allure digne de l'Ouest.*");
    }
    if (note) e.addFields({ name: '📝 Note', value: note.slice(0, 250), inline: false });

    const payload = { content: '', embeds: [e] };
    if (files.length) payload.files = files;
    let card = null;
    if (p.wait) card = await p.wait.edit(payload).catch(() => null);
    if (!card) card = await p.channel.send(payload).catch(() => null);

    if (card) { for (const r of ['🤠', '🔥', '👍']) { await card.react(r).catch(() => {}); } }
    // 👗 Garde-robe : on mémorise la dernière tenue décrite du membre
    if (card && t && _ok(t.description)) {
      try {
        const db = loadDB(); if (!db.garderobe) db.garderobe = {};
        db.garderobe[p.author.id] = {
          nomPerso,
          description: String(t.description).slice(0, 700),
          pieces: _ok(t.pieces) ? String(t.pieces).slice(0, 1024) : '',
          couleurs: _ok(t.couleurs) ? String(t.couleurs).slice(0, 256) : '',
          matieres: _ok(t.matieres) ? String(t.matieres).slice(0, 256) : '',
          style: _ok(t.style) ? String(t.style).slice(0, 200) : '',
          image: card.embeds?.[0]?.image?.url || null,
          lien: card.url || null,
          at: Date.now(),
        };
        saveDB(db);
      } catch {}
    }
    // Salon propre : retirer les messages-photos d'origine une fois la fiche postée.
    if (files.length && card) { for (const m of p.msgs) { await m.delete().catch(() => {}); } }
  } catch {}
}

// Bouton « 👔 Ma garde-robe » → affiche la dernière tenue enregistrée du membre
async function routeInteraction(interaction) {
  try {
    if (!interaction.isButton?.() || interaction.customId !== 'tenue_garderobe') return false;
    const g = (loadDB().garderobe || {})[interaction.user.id];
    if (!g) { await interaction.reply({ content: '👔 Ta garde-robe est vide — poste une photo de ta tenue dans le vestiaire pour l\'enregistrer.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const e = new EmbedBuilder().setColor(0x8B5A2B)
      .setTitle(`👔 Garde-robe — ${g.nomPerso || interaction.member?.displayName || interaction.user.username}`)
      .setDescription(g.description ? `*« ${g.description} »*\n— le tailleur de la Compagnie` : '*Ta dernière tenue enregistrée.*');
    if (g.image) e.setImage(g.image);
    if (g.pieces) e.addFields({ name: '👔 Pièces', value: g.pieces.slice(0, 1024), inline: false });
    if (g.couleurs) e.addFields({ name: '🎨 Palette', value: g.couleurs.slice(0, 256), inline: true });
    if (g.matieres) e.addFields({ name: '🧶 Matières', value: g.matieres.slice(0, 256), inline: true });
    if (g.style) e.addFields({ name: '✨ Style', value: g.style.slice(0, 200), inline: true });
    if (g.lien) e.addFields({ name: '🔗 Fiche', value: `[Voir dans le vestiaire](${g.lien})`, inline: false });
    e.setFooter({ text: `Enregistrée le ${new Date(g.at).toLocaleDateString('fr-FR')}` });
    await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(() => {});
    return true;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ tenue routeInteraction:', e.message); return true; }
}

// ── Panneau explicatif épinglé dans #tenue ──
const SALON_TENUE = '1517863681655046234';
function _panneauEmbed() {
  return new EmbedBuilder().setColor(0x8B5A2A)
    .setTitle('🧵 LE VESTIAIRE — IRON WOLF COMPANY')
    .setDescription([
      '*Le tailleur de la Compagnie juge ton allure. Montre-lui ta tenue.*',
      '',
      '**📸 Comment faire ?**',
      '→ Poste **une ou plusieurs photos** de ta tenue dans ce salon.',
      '→ Le tailleur en fait une **fiche immersive** : silhouette, pièces, couleurs, matières, style.',
      '→ Ton message d\'origine est **retiré** pour garder le salon propre.',
      '',
      '**💡 Astuces**',
      '→ Mets le **nom de ton personnage** en légende de la photo.',
      '→ Plusieurs **angles / lumières** = couleurs mieux jugées.',
      '→ Plusieurs photos d\'une **même tenue** d\'un coup, c\'est parfait.',
    ].join('\n'))
    .setFooter({ text: 'Le Vestiaire • « L\'habit fait le hors-la-loi »' });
}
async function installerPanneau(guild) {
  try {
    let ch = await guild.channels.fetch(SALON_TENUE).catch(() => null);
    if (!ch || typeof ch.send !== 'function') ch = guild.channels.cache.find(c => c.isTextBased?.() && _isTenueChannel(c)) || null;
    if (!ch || typeof ch.send !== 'function') return;
    const botId = guild.client.user.id;
    let exists = null;
    try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) exists = pins.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('VESTIAIRE')); } catch {}
    if (!exists) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) exists = recent.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('VESTIAIRE')); }
    if (exists) { await exists.edit({ embeds: [_panneauEmbed()] }).catch(() => {}); return; }
    const m = await ch.send({ embeds: [_panneauEmbed()] }).catch(() => null);
    if (m) await m.pin().catch(() => {});
  } catch (e) { console.log('⚠️ tenue installerPanneau:', e.message); }
}

// ── Retirer le panneau explicatif (le salon doit rester propre, sans pin) ──
async function retirerPanneau(guild) {
  try {
    let ch = await guild.channels.fetch(SALON_TENUE).catch(() => null);
    if (!ch || typeof ch.send !== 'function') ch = guild.channels.cache.find(c => c.isTextBased?.() && _isTenueChannel(c)) || null;
    if (!ch?.messages) return;
    const botId = guild.client.user.id;
    const cible = m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('VESTIAIRE');
    try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) for (const m of pins.values()) if (cible(m)) await m.delete().catch(() => {}); } catch {}
    try { const recent = await ch.messages.fetch({ limit: 50 }).catch(() => null); if (recent) for (const m of recent.values()) if (cible(m)) await m.delete().catch(() => {}); } catch {}
  } catch (e) { console.log('⚠️ tenue retirerPanneau:', e.message); }
}

module.exports = { onMessage, routeInteraction, installerPanneau, retirerPanneau, SALON_TENUE };
