// ═══════════════════════════════════════════════════════════════
//  carte.js — Carte / registre des lieux de la Confrérie
//  Fiable et léger : AUCUN traitement d'image (pas de blocage du bot).
//  • L'image de la carte postée dans le salon sert de référence visuelle.
//  • Points classés par type + région, filtrés par accréditation.
//  • Ajouter (guidé) · Consulter · Voir la carte · Gérer (Direction).
//  • 3 niveaux : 🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction).
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const CARTE_CHANNEL_ID = process.env.CARTE_CHANNEL_ID || '1519308989119074435';
// Pré-remplissage temporaire de l'ajout d'un lieu (ex : depuis une note de terrain), par utilisateur
const _addPrefill = new Map();

const TYPES = [
  { key: 'recolte', label: 'Lieu de récolte', emoji: '🌿' },
  { key: 'vendeur', label: 'Vendeur', emoji: '🛒' },
  { key: 'illegal', label: 'Mission illégale', emoji: '🔪' },
  { key: 'chasse',  label: 'Chasse', emoji: '🦌' },
  { key: 'peche',   label: 'Pêche', emoji: '🎣' },
  { key: 'planque', label: 'Planque', emoji: '🏚️' },
  { key: 'four',         label: 'Four', emoji: '🔥' },
  { key: 'fleur_dragon', label: 'Fleur du dragon', emoji: '🐉' },
  { key: 'fournaise',    label: 'Fournaise', emoji: '⚒️' },
  { key: 'peches',       label: 'Pêches (fruit)', emoji: '🍑' },
  { key: 'autre',   label: 'Autre', emoji: '📌' },
];
const NIVEAUX = [
  { key: 'public',       label: 'Public — tout le monde', emoji: '🟢' },
  { key: 'membre',       label: 'Membre — la Confrérie', emoji: '🟡' },
  { key: 'confidentiel', label: 'Confidentiel — Direction', emoji: '🔴' },
];
const REGIONS = ['Ambarino', 'New Hanover', 'Lemoyne', 'West Elizabeth', 'New Austin', 'Guarma', 'Autre'];

const _type = k => TYPES.find(t => t.key === k) || { key: k, label: k, emoji: '📌' };
const _niv = k => NIVEAUX.find(n => n.key === k) || { key: k, label: k, emoji: '⚪' };

let _isMembre = () => true, _isDirection = () => false;
function init(opts) { if (opts?.isMembre) _isMembre = opts.isMembre; if (opts?.isDirection) _isDirection = opts.isDirection; }
function _peutVoir(member, niveau) {
  if (niveau === 'membre') return _isMembre(member) || _isDirection(member);
  if (niveau === 'confidentiel') return _isDirection(member);
  return true;
}
function _ensure(db) { if (!db.carte) db.carte = {}; if (!Array.isArray(db.carte.points)) db.carte.points = []; return db.carte; }
function _id() { return 'PT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _estImage(a) { return (a.contentType || '').startsWith('image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || a.name || ''); }

// Brouillons d'ajout (en mémoire) : userId -> { type, niveau }
const _drafts = new Map();
function _purgeDrafts() { const now = Date.now(); for (const [k, v] of _drafts) if (now - (v.at || 0) > 1800000) _drafts.delete(k); }

// ── Image de référence (juste l'URL, AUCUN téléchargement/traitement) ──
async function capterCarteFond(guild, message) {
  try {
    if (message) {
      if (![...message.attachments.values()].some(_estImage)) return false;
      const db = loadDB(); _ensure(db).mapMsgId = message.id; saveDB(db); return true;
    }
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch?.messages) return false;
    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    const withImg = msgs ? [...msgs.values()].find(m => !m.author?.bot && [...m.attachments.values()].some(_estImage)) : null;
    if (withImg) { const db = loadDB(); _ensure(db).mapMsgId = withImg.id; saveDB(db); return true; }
    return false;
  } catch { return false; }
}
async function _mapImageUrl(guild) {
  try {
    if (!loadDB().carte?.mapMsgId) await capterCarteFond(guild);
    const id = loadDB().carte?.mapMsgId; if (!id) return null;
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch) return null;
    const msg = await ch.messages.fetch(id).catch(() => null);
    const att = msg ? [...msg.attachments.values()].find(_estImage) : null;
    return att ? att.url : null;
  } catch { return null; }
}

// ── Panneau (clair et intuitif) ──────────────────────────────────
function _panelEmbed(db) {
  const pts = db.carte?.points || [];
  const parType = {}; for (const p of pts) parType[p.type] = (parType[p.type] || 0) + 1;
  const compteurs = TYPES.map(t => `${t.emoji} ${t.label} **${parType[t.key] || 0}**`).join('  ·  ');
  return new EmbedBuilder().setColor(0x8B5A2B).setTitle('🗺️ CARTE DE LA CONFRÉRIE')
    .setDescription([
      '*Tous les lieux utiles, classés et conservés — récoltes, vendeurs, coups, chasse, pêche, planques.*',
      '',
      '**🌐 Ouvrir la carte cliquable** — la carte interactive : clique dessus pour poser/voir des points.',
      '**🗺️ Voir la carte** — l\'image de la carte en référence (ici dans Discord).',
      '**🔍 Consulter** — la liste des lieux que ton **accréditation** te permet de voir.',
      '**➕ Ajouter** — enregistre un lieu (type · accès · région · notes).',
      '**🛠️ Gérer** — *(Direction)* modifier ou supprimer un lieu.',
      '',
      '__Niveaux d\'accès__ : 🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction)',
    ].join('\n'))
    .addFields({ name: `📊 ${pts.length} lieu(x) enregistré(s)`, value: compteurs || '*Aucun pour l\'instant.*' })
    .setFooter({ text: 'La Confrérie • rien ne se perd' });
}
function _panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('carte_web').setLabel('Ouvrir la carte cliquable').setEmoji('🌐').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('carte_seemap').setLabel('Voir la carte').setEmoji('🗺️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('carte_view').setLabel('Consulter').setEmoji('🔍').setStyle(ButtonStyle.Primary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('carte_add').setLabel('Ajouter').setEmoji('➕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('carte_manage').setLabel('Gérer').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('carte_seturl').setLabel('Définir l\'adresse du bot (Direction)').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
async function installerPanel(guild) {
  try {
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch?.send) return;
    const db = loadDB();
    const payload = { embeds: [_panelEmbed(db)], components: _panelRows() };
    let msg = null;
    if (db.cartePanelId) msg = await ch.messages.fetch(db.cartePanelId).catch(() => null);
    if (!msg) { const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null); msg = msgs ? [...msgs.values()].find(m => m.author?.id === guild.client.user.id && (m.embeds?.[0]?.title || '').includes('CARTE DE LA CONFR')) : null; }
    if (msg) { await msg.edit(payload).catch(() => {}); if (db.cartePanelId !== msg.id) { const d = loadDB(); d.cartePanelId = msg.id; saveDB(d); } }
    else { const sent = await ch.send(payload).catch(() => null); if (sent) { try { await sent.pin(); } catch {} const d = loadDB(); d.cartePanelId = sent.id; saveDB(d); } }
  } catch (e) { console.log('❌ carte installerPanel:', e.message); }
}

function _listeEmbed(member, typeKey) {
  const db = loadDB();
  let pts = (db.carte?.points || []).filter(p => _peutVoir(member, p.niveau));
  if (typeKey && typeKey !== 'tout') pts = pts.filter(p => p.type === typeKey);
  const titre = typeKey && typeKey !== 'tout' ? `${_type(typeKey).emoji} ${_type(typeKey).label}` : '🗺️ Lieux accessibles';
  if (!pts.length) return new EmbedBuilder().setColor(0x8B5A2B).setTitle(titre).setDescription('*Aucun lieu pour ce filtre (ou ton accréditation ne le permet pas).*');
  const byRegion = {};
  for (const p of pts) { (byRegion[p.region || 'Autre'] = byRegion[p.region || 'Autre'] || []).push(p); }
  const desc = Object.entries(byRegion).sort((a, b) => a[0].localeCompare(b[0])).map(([reg, arr]) => {
    const lines = arr.map(p => `${_type(p.type).emoji} **${p.nom}**${p.lieu ? ` — ${p.lieu}` : ''}${p.notes ? `\n   ↳ *${String(p.notes).slice(0, 90)}*` : ''} ${_niv(p.niveau).emoji}`).join('\n');
    return `📍 __${reg}__\n${lines}`;
  }).join('\n\n').slice(0, 4000);
  return new EmbedBuilder().setColor(0x8B5A2B).setTitle(titre).setDescription(desc).setFooter({ text: `La Confrérie • ${pts.length} lieu(x) · selon ton accréditation` });
}

function _pointsSelect(customId, points) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Choisis un lieu…').addOptions(
    points.slice(0, 25).map(p => ({ label: `${p.nom}`.slice(0, 100), value: p.id, description: `${_type(p.type).label} · ${p.region || 'Autre'} · ${_niv(p.niveau).label}`.slice(0, 100), emoji: _type(p.type).emoji }))
  ));
}
function _formModal(customId, type, p) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(`${_type(type).label}`.slice(0, 45));
  const f = (id, label, val, ph, para, max) => { const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(para ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(id === 'nom').setMaxLength(max || 100); if (ph) t.setPlaceholder(ph); if (val) t.setValue(String(val).slice(0, max || 100)); return new ActionRowBuilder().addComponents(t); };
  modal.addComponents(
    f('nom', 'Nom du lieu', p?.nom, 'Ex: Champ de coca, Armurier de Valentine…'),
    f('region', 'Région', p?.region, REGIONS.join(' · ')),
    f('lieu', 'Lieu précis', p?.lieu, 'Ex: au nord de Valentine, près de la rivière'),
    f('notes', 'Notes (horaires, prix, dangers…)', p?.notes, '', true, 500),
  );
  return modal;
}

// Démarre l'ajout d'un lieu en pré-remplissant le formulaire (ex : depuis une note de terrain)
async function ouvrirAjout(interaction, prefill) {
  if (prefill && (prefill.lieu || prefill.notes || prefill.nom)) _addPrefill.set(interaction.user.id, prefill);
  const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_type_sel').setPlaceholder('Type de lieu…').addOptions(TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji }))));
  await interaction.reply({ content: '➕ **Ajouter ce lieu à la carte** — c\'est quoi ?', components: [row], flags: MessageFlags.Ephemeral });
}
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    // ➕ Ajouter : type → niveau → formulaire
    if (interaction.isButton?.() && id === 'carte_add') {
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_type_sel').setPlaceholder('Type de lieu…').addOptions(TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji }))));
      await interaction.reply({ content: '➕ **Ajouter un lieu** — c\'est quoi ?', components: [row], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_type_sel') {
      const type = interaction.values[0];
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`carte_niv_sel::${type}`).setPlaceholder('Qui peut le voir ?').addOptions(NIVEAUX.map(n => ({ label: n.label, value: n.key, emoji: n.emoji }))));
      await interaction.update({ content: `➕ **${_type(type).emoji} ${_type(type).label}** — qui peut le voir ?`, components: [row] }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id.startsWith('carte_niv_sel::')) {
      const type = id.split('::')[1], niveau = interaction.values[0];
      const pre = _addPrefill.get(interaction.user.id) || null; // pré-rempli si lancé depuis une note
      await interaction.showModal(_formModal(`carte_modal::${type}::${niveau}`, type, pre)); return true;
    }
    if (interaction.isModalSubmit?.() && id.startsWith('carte_modal::')) {
      const [, type, niveau] = id.split('::');
      const nom = (interaction.fields.getTextInputValue('nom') || '').trim().slice(0, 100);
      if (!nom) { await interaction.reply({ content: '❌ Le nom est obligatoire.', flags: MessageFlags.Ephemeral }); return true; }
      let region = (interaction.fields.getTextInputValue('region') || '').trim();
      region = REGIONS.find(r => region && (r.toLowerCase().includes(region.toLowerCase()) || region.toLowerCase().includes(r.toLowerCase()))) || (region ? region.slice(0, 40) : 'Autre');
      const db = loadDB(); _ensure(db).points.push({ id: _id(), type, niveau, nom, region, lieu: (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200), notes: (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500), parId: interaction.user.id, parNom: interaction.member?.displayName || interaction.user.username, createdAt: new Date().toISOString() });
      saveDB(db);
      _addPrefill.delete(interaction.user.id); // pré-remplissage consommé
      await installerPanel(interaction.guild).catch(() => {});
      await interaction.reply({ content: `✅ Lieu ajouté : ${_type(type).emoji} **${nom}** · 📍 ${region} · ${_niv(niveau).emoji} ${_niv(niveau).label}.`, flags: MessageFlags.Ephemeral }); return true;
    }
    // 🔍 Consulter
    if (interaction.isButton?.() && id === 'carte_view') {
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_view_sel').setPlaceholder('Filtrer par type…').addOptions([{ label: 'Tout afficher', value: 'tout', emoji: '🗺️' }, ...TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji }))]));
      await interaction.reply({ content: '🔍 **Consulter** — choisis un filtre :', components: [row], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_view_sel') {
      await interaction.update({ content: '', embeds: [_listeEmbed(interaction.member, interaction.values[0])], components: [] }); return true;
    }
    // 🗺️ Voir la carte (image de référence)
    if (interaction.isButton?.() && id === 'carte_seemap') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const url = await _mapImageUrl(interaction.guild);
      if (!url) return interaction.editReply({ content: 'ℹ️ Aucune image de carte trouvée. Poste une image de la carte dans ce salon, puis réessaie.' });
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B5A2B).setTitle('🗺️ Carte de la Confrérie').setImage(url).setFooter({ text: 'Référence visuelle' })] });
    }
    // 🌐 Carte web cliquable
    if (interaction.isButton?.() && id === 'carte_web') {
      const base = _baseUrl();
      if (!base) { await interaction.reply({ content: '⚠️ L\'adresse web du bot n\'est pas encore connue.\n• La Direction peut la définir via **⚙️ Définir l\'adresse du bot** (en bas du panneau).\n• En attendant, utilise **🗺️ Voir la carte** pour afficher l\'image de référence.', flags: MessageFlags.Ephemeral }); return true; }
      const { tok, level } = creerToken(interaction.member); const niv = _niv(level);
      const lien = `${base}/carte?k=${tok}`;
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir la carte').setEmoji('🗺️').setURL(lien));
      await interaction.reply({ content: `🌐 **Carte cliquable** — accès ${niv.emoji} **${niv.label}**.\n🖱️ *Clique le bouton ci-dessous : la carte s'ouvre directement. Lien personnel, valable 24h.*`, components: [row], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isButton?.() && id === 'carte_seturl') {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const modal = new ModalBuilder().setCustomId('carte_url_modal').setTitle('🌐 Adresse web du bot');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Adresse (https://…)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://mon-bot.onrender.com').setValue(loadDB().carte?.baseUrl || '')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit?.() && id === 'carte_url_modal') {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      let url = (interaction.fields.getTextInputValue('url') || '').trim().replace(/\s+/g, '').replace(/\/$/, '');
      if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(url)) { await interaction.reply({ content: '❌ Adresse invalide (ex : https://mon-bot.onrender.com).', flags: MessageFlags.Ephemeral }); return true; }
      const db = loadDB(); _ensure(db).baseUrl = url; saveDB(db);
      await interaction.reply({ content: `✅ Adresse enregistrée : ${url}\nClique maintenant sur **🌐 Ouvrir la carte cliquable**.`, flags: MessageFlags.Ephemeral }); return true;
    }
    // 🛠️ Gérer (Direction)
    if (interaction.isButton?.() && id === 'carte_manage') {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 La gestion des lieux est réservée à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const pts = loadDB().carte?.points || [];
      if (!pts.length) { await interaction.reply({ content: 'Aucun lieu à gérer.', flags: MessageFlags.Ephemeral }); return true; }
      await interaction.reply({ content: '🛠️ **Gérer un lieu** — sélectionne-le :', components: [_pointsSelect('carte_manage_sel', pts)], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_manage_sel') {
      if (!_isDirection(interaction.member)) { await interaction.update({ content: '🔒 Réservé à la Direction.', components: [] }); return true; }
      const p = (loadDB().carte?.points || []).find(x => x.id === interaction.values[0]);
      if (!p) { await interaction.update({ content: '❌ Lieu introuvable.', components: [] }); return true; }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`carte_edit::${p.id}`).setLabel('Modifier').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`carte_del::${p.id}`).setLabel('Supprimer').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      );
      await interaction.update({ content: `${_type(p.type).emoji} **${p.nom}** · 📍 ${p.region || 'Autre'} · ${_niv(p.niveau).emoji} ${_niv(p.niveau).label}\n${p.lieu || ''}${p.notes ? '\n📝 ' + p.notes : ''}`, components: [row] }); return true;
    }
    if (interaction.isButton?.() && id.startsWith('carte_edit::')) {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const p = (loadDB().carte?.points || []).find(x => x.id === id.split('::')[1]);
      if (!p) { await interaction.reply({ content: '❌ Lieu introuvable.', flags: MessageFlags.Ephemeral }); return true; }
      await interaction.showModal(_formModal(`carte_editmodal::${p.id}`, p.type, p)); return true;
    }
    if (interaction.isModalSubmit?.() && id.startsWith('carte_editmodal::')) {
      const db = loadDB(); const p = (db.carte?.points || []).find(x => x.id === id.split('::')[1]);
      if (!p) { await interaction.reply({ content: '❌ Lieu introuvable.', flags: MessageFlags.Ephemeral }); return true; }
      const nom = (interaction.fields.getTextInputValue('nom') || '').trim().slice(0, 100); if (nom) p.nom = nom;
      let region = (interaction.fields.getTextInputValue('region') || '').trim();
      p.region = REGIONS.find(r => region && (r.toLowerCase().includes(region.toLowerCase()) || region.toLowerCase().includes(r.toLowerCase()))) || (region ? region.slice(0, 40) : p.region);
      p.lieu = (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200);
      p.notes = (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500);
      saveDB(db); await installerPanel(interaction.guild).catch(() => {});
      await interaction.reply({ content: `✏️ **${p.nom}** mis à jour.`, flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isButton?.() && id.startsWith('carte_del::')) {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const db = loadDB(); const c = _ensure(db); const pid = id.split('::')[1];
      const p = c.points.find(x => x.id === pid); c.points = c.points.filter(x => x.id !== pid); saveDB(db);
      await installerPanel(interaction.guild).catch(() => {});
      await interaction.update({ content: `🗑️ **${p?.nom || pid}** supprimé.`, components: [] }); return true;
    }
  } catch (e) {
    if ([10062, 40060, 10008].includes(e?.code)) return true; // interaction expirée / déjà traitée — sans bruit
    console.log('❌ carte routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur sur la carte.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
  return false;
}

// Capture auto de l'image de référence quand un membre poste une image dans le salon carte
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot || message.channel?.id !== CARTE_CHANNEL_ID) return false;
    if (![...(message.attachments?.values() || [])].some(_estImage)) return false;
    const ok = await capterCarteFond(message.guild, message);
    if (ok) { await message.react('🗺️').catch(() => {}); await installerPanel(message.guild).catch(() => {}); }
    return false;
  } catch { return false; }
}

// ── Carte web cliquable (servie par le serveur HTTP du bot — pas de jimp, ne bloque rien) ──
function _baseUrl() {
  const e = process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || process.env.BASE_URL
    || (process.env.RENDER_EXTERNAL_HOSTNAME ? 'https://' + process.env.RENDER_EXTERNAL_HOSTNAME : '')
    || (loadDB().carte?.baseUrl || '');
  return (e || '').replace(/\/$/, '');
}
function _rndTok() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 8); }
function creerToken(member) {
  const level = _isDirection(member) ? 'confidentiel' : (_isMembre(member) ? 'membre' : 'public');
  const db = loadDB(); const c = _ensure(db); if (!c.tokens) c.tokens = {};
  const now = Date.now();
  for (const [t, v] of Object.entries(c.tokens)) if (!v?.exp || v.exp < now) delete c.tokens[t];
  const tok = _rndTok(); c.tokens[tok] = { level, userId: member.id, exp: now + 24 * 3600 * 1000 }; saveDB(db);
  return { tok, level };
}
function _tokInfo(tok) { const v = (loadDB().carte?.tokens || {})[tok]; if (!v || (v.exp && v.exp < Date.now())) return null; return v; }
function _canSee(level, niveau) { if (niveau === 'confidentiel') return level === 'confidentiel'; if (niveau === 'membre') return level === 'membre' || level === 'confidentiel'; return true; }
function _niveauxAutorises(level) { return NIVEAUX.filter(n => _canSee(level, n.key)); }
async function _baseMapBuffer(guild) {
  try {
    if (!loadDB().carte?.mapMsgId) await capterCarteFond(guild);
    const id = loadDB().carte?.mapMsgId; if (!id) return null;
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch) return null;
    const msg = await ch.messages.fetch(id).catch(() => null);
    const att = msg ? [...msg.attachments.values()].find(_estImage) : null;
    if (!att) return null;
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(att.url, { signal: ctrl.signal }).catch(() => null); clearTimeout(t);
    if (!r || !r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}
async function httpHandle(req, res, client) {
  let u; try { u = new URL(req.url, 'http://x'); } catch { return false; }
  if (!u.pathname.startsWith('/carte')) return false;
  try {
    const tok = u.searchParams.get('k') || '';
    const info = _tokInfo(tok); const level = info?.level || null;
    const guild = client.guilds.cache.first();
    if (u.pathname === '/carte/image') {
      if (!level) { res.writeHead(403); res.end('expired'); return true; }
      const buf = guild ? await _baseMapBuffer(guild) : null;
      if (!buf) { res.writeHead(404); res.end('no map'); return true; }
      res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' }); res.end(buf); return true;
    }
    if (u.pathname === '/carte/data') {
      if (!level) { res.writeHead(403, { 'Content-Type': 'application/json' }); res.end('{"error":"expired"}'); return true; }
      const pts = (loadDB().carte?.points || []).filter(p => _canSee(level, p.niveau)).map(p => ({ id: p.id, type: p.type, niveau: p.niveau, nom: p.nom, lieu: p.lieu || '', notes: p.notes || '', region: p.region || '', x: (typeof p.x === 'number' ? p.x : null), y: (typeof p.y === 'number' ? p.y : null) }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ level, types: TYPES.map(t => ({ key: t.key, label: t.label, emoji: t.emoji })), niveaux: _niveauxAutorises(level), points: pts })); return true;
    }
    if (u.pathname === '/carte/add' && req.method === 'POST') {
      if (!level) { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => {
        try {
          const d = JSON.parse(body || '{}'); const nom = String(d.nom || '').trim().slice(0, 100); if (!nom) { res.writeHead(400); res.end('{"error":"nom"}'); return; }
          const x = Math.max(0, Math.min(100, Number(d.x))), y = Math.max(0, Math.min(100, Number(d.y))); if (!isFinite(x) || !isFinite(y)) { res.writeHead(400); res.end('{}'); return; }
          const type = TYPES.find(t => t.key === d.type) ? d.type : 'autre'; let niveau = ['public', 'membre', 'confidentiel'].includes(d.niveau) ? d.niveau : 'public'; if (!_canSee(level, niveau)) niveau = level;
          const db = loadDB(); const c = _ensure(db); c.points.push({ id: _id(), type, niveau, nom, region: String(d.region || '').slice(0, 40), x, y, lieu: String(d.lieu || '').slice(0, 200), notes: String(d.notes || '').slice(0, 500), parId: info.userId, parNom: '(carte web)', createdAt: new Date().toISOString() }); saveDB(db);
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {});
        } catch { res.writeHead(500); res.end('{}'); }
      }); return true;
    }
    if (u.pathname === '/carte/del' && req.method === 'POST') {
      if (level !== 'confidentiel') { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => { try { const d = JSON.parse(body || '{}'); const db = loadDB(); const c = _ensure(db); c.points = c.points.filter(p => p.id !== d.id); saveDB(db); res.writeHead(200); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {}); } catch { res.writeHead(500); res.end('{}'); } }); return true;
    }
    if (u.pathname === '/carte/edit' && req.method === 'POST') {
      if (!level) { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => {
        try {
          const d = JSON.parse(body || '{}'); const db = loadDB(); const c = _ensure(db);
          const p = c.points.find(x => x.id === d.id);
          if (!p) { res.writeHead(404); res.end('{}'); return; }
          if (!_canSee(level, p.niveau)) { res.writeHead(403); res.end('{}'); return; } // on ne modifie que ce qu'on peut voir
          const nom = String(d.nom || '').trim().slice(0, 100); if (nom) p.nom = nom;
          if (TYPES.find(t => t.key === d.type)) p.type = d.type;
          let niveau = ['public', 'membre', 'confidentiel'].includes(d.niveau) ? d.niveau : p.niveau; if (!_canSee(level, niveau)) niveau = p.niveau; p.niveau = niveau;
          p.region = String(d.region || '').slice(0, 40); p.lieu = String(d.lieu || '').slice(0, 200); p.notes = String(d.notes || '').slice(0, 500);
          saveDB(db); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {});
        } catch { res.writeHead(500); res.end('{}'); }
      }); return true;
    }
    if (u.pathname === '/carte') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(level ? _pageHTML(tok, level) : '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#1a1410;color:#e8d8c0;text-align:center;padding:60px"><h2>🔒 Lien expiré ou invalide</h2><p>Génère un nouveau lien depuis Discord (bouton « 🌐 Ouvrir la carte cliquable »).</p></body>');
      return true;
    }
    res.writeHead(404); res.end('not found'); return true;
  } catch (e) { console.log('❌ carte httpHandle:', e.message); try { res.writeHead(500); res.end('err'); } catch {} return true; }
}
function _pageHTML(tok, level) {
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Carte — La Confrérie</title><style>
*{box-sizing:border-box}body{margin:0;font-family:Georgia,serif;background:#15110c;color:#e8d8c0}
header{padding:10px 16px;background:#241a12;border-bottom:1px solid #4a3826;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header b{color:#d9a441}.lvl{font-size:13px;opacity:.85}.hint{font-size:13px;opacity:.8;margin-left:auto}
#wrap{position:relative;width:100%;max-width:2000px;margin:0 auto}#map{display:block;width:100%;height:auto;cursor:crosshair}
.pin{position:absolute;transform:translate(-50%,-50%);width:24px;height:24px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 5px #000;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:13px}
.pop{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#241a12;border:1px solid #5a4632;border-radius:10px;padding:16px;width:330px;max-width:92vw;z-index:50;box-shadow:0 8px 40px #000a}
.pop h3{margin:0 0 8px;color:#d9a441}.pop label{display:block;font-size:12px;margin:8px 0 2px;opacity:.85}
.pop input,.pop select,.pop textarea{width:100%;padding:7px;background:#15110c;color:#e8d8c0;border:1px solid #5a4632;border-radius:6px;font-family:inherit}
.pop .row{display:flex;gap:8px;margin-top:12px}.pop button{flex:1;padding:9px;border:0;border-radius:6px;cursor:pointer;font-weight:bold}
.bok{background:#3a7d3a;color:#fff}.bno{background:#5a4632;color:#e8d8c0}.bdel{background:#a33;color:#fff}
#mask{position:fixed;inset:0;background:#0008;z-index:40;display:none}.tag{font-size:11px;padding:2px 6px;border-radius:10px;background:#3a2c1e;margin-right:4px}
#legend{position:fixed;top:60px;left:10px;background:#241a12ee;border:1px solid #5a4632;border-radius:8px;padding:8px 10px;z-index:30;max-width:48vw;max-height:72vh;overflow:auto;font-size:13px;display:none}
#legend h4{margin:0 0 6px;color:#d9a441;font-size:13px}
.leg{display:flex;align-items:center;gap:6px;padding:3px 4px;border-radius:5px;cursor:pointer;user-select:none}
.leg:hover{background:#ffffff14}.leg.off{opacity:.4;text-decoration:line-through}
.leg .dot{width:12px;height:12px;border-radius:50%;border:1px solid #ffffff88;flex:none}.leg .c{margin-left:auto;opacity:.7}
header input,header select{background:#15110c;color:#e8d8c0;border:1px solid #5a4632;border-radius:6px;padding:6px 8px;font-family:inherit;font-size:13px}
header #search{width:170px;max-width:40vw}
</style></head><body>
<header><b>🗺️ Carte — La Confrérie</b><span class="lvl">Accès : ${level === 'confidentiel' ? '🔴 Confidentiel' : level === 'membre' ? '🟡 Membre' : '🟢 Public'}</span><input id="search" placeholder="🔎 Chercher un nom…"><select id="regionf"><option value="">📍 Toutes régions</option></select><span class="hint">🖱️ Clique pour ajouter</span></header>
<div id="wrap"><img id="map" src="/carte/image?k=${tok}" alt="carte"></div><div id="legend"></div><div id="mask"></div>
<script>
var TOK=${JSON.stringify(tok)},LVL=${JSON.stringify(level)},DATA={types:[],niveaux:[],points:[]},HIDDEN={},SEARCH='',REGION='';
var wrap=document.getElementById('wrap'),mapImg=document.getElementById('map'),mask=document.getElementById('mask');
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function escA(s){return esc(s).replace(/"/g,'&quot;');}
function borderFor(n){if(n==='confidentiel')return '3px solid #e05555';if(n==='membre')return '2px solid #f0c850';return '2px solid #ffffff';}
function colorFor(t){var m={recolte:'#3ca03c',vendeur:'#2870c8',illegal:'#c82828',chasse:'#965a28',peche:'#28a0b4',planque:'#783ca0',four:'#e08a2e',fleur_dragon:'#b84fd0',fournaise:'#8a4b2a',peches:'#e8a05a',autre:'#5a5a5a'};return m[t]||'#5a5a5a';}
function emojiFor(t){var o=DATA.types.find(function(x){return x.key===t;});return o?o.emoji:'📌';}
function load(){fetch('/carte/data?k='+TOK).then(function(r){return r.json();}).then(function(j){if(j.error){document.body.innerHTML='<h2 style=text-align:center;margin-top:60px>Lien expiré</h2>';return;}DATA=j;render();});}
function render(){document.querySelectorAll('.pin').forEach(function(p){p.remove();});var q=(SEARCH||'').toLowerCase();DATA.points.forEach(function(p){if(p.x==null)return;if(HIDDEN[p.type])return;if(REGION&&(p.region||'')!==REGION)return;if(q&&(p.nom||'').toLowerCase().indexOf(q)<0&&(p.lieu||'').toLowerCase().indexOf(q)<0&&(p.notes||'').toLowerCase().indexOf(q)<0)return;var d=document.createElement('div');d.className='pin';d.style.left=p.x+'%';d.style.top=p.y+'%';d.style.background=colorFor(p.type);d.style.border=borderFor(p.niveau);d.textContent=emojiFor(p.type);d.title=p.nom+(p.lieu?(' — '+p.lieu):'');d.onclick=function(e){e.stopPropagation();showInfo(p);};wrap.appendChild(d);});buildLegend();buildRegions();}
function buildRegions(){var sel=document.getElementById('regionf');if(!sel)return;var regs={};DATA.points.forEach(function(p){if(p.region)regs[p.region]=1;});var opts='<option value="">📍 Toutes régions</option>';Object.keys(regs).sort().forEach(function(r){opts+='<option value="'+escA(r)+'"'+(r===REGION?' selected':'')+'>📍 '+esc(r)+'</option>';});sel.innerHTML=opts;}
function buildLegend(){var counts={},tot=0;DATA.points.forEach(function(p){if(p.x==null)return;tot++;counts[p.type]=(counts[p.type]||0)+1;});var box=document.getElementById('legend');if(!box)return;var keys=DATA.types.filter(function(t){return counts[t.key];});if(!keys.length){box.style.display='none';return;}box.style.display='block';var html='<h4>Filtres · '+tot+' point(s)</h4>';keys.forEach(function(t){html+='<div class="leg'+(HIDDEN[t.key]?' off':'')+'" data-k="'+t.key+'"><span class="dot" style="background:'+colorFor(t.key)+'"></span>'+t.emoji+' '+esc(t.label)+'<span class="c">'+counts[t.key]+'</span></div>';});box.innerHTML=html;Array.prototype.forEach.call(box.querySelectorAll('.leg'),function(el){el.onclick=function(){var k=el.getAttribute('data-k');HIDDEN[k]=!HIDDEN[k];render();};});}
function closePop(){var e=document.querySelector('.pop');if(e)e.remove();mask.style.display='none';}
mask.onclick=closePop;
function showInfo(p){closePop();mask.style.display='block';var n=DATA.niveaux.find(function(x){return x.key===p.niveau;});var box=document.createElement('div');box.className='pop';var del=(LVL==='confidentiel')?'<button class=bdel id=bdel>🗑️ Supprimer</button>':'';var ed='<button class=bok id=bedit>✏️ Modifier</button>';box.innerHTML='<h3>'+emojiFor(p.type)+' '+esc(p.nom)+'</h3><div><span class=tag>'+esc((DATA.types.find(function(x){return x.key===p.type;})||{}).label||p.type)+'</span><span class=tag>'+esc(n?n.label:p.niveau)+'</span></div>'+(p.region?'<p>📍 '+esc(p.region)+'</p>':'')+(p.lieu?'<p>'+esc(p.lieu)+'</p>':'')+(p.notes?'<p>📝 '+esc(p.notes)+'</p>':'')+'<div class=row>'+ed+del+'<button class=bno id=bclose>Fermer</button></div>';document.body.appendChild(box);document.getElementById('bclose').onclick=closePop;document.getElementById('bedit').onclick=function(){closePop();showAdd(p.x,p.y,p);};if(del)document.getElementById('bdel').onclick=function(){fetch('/carte/del?k='+TOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id})}).then(function(){closePop();load();});};}
mapImg.addEventListener('click',function(e){var r=mapImg.getBoundingClientRect();var x=(e.clientX-r.left)/r.width*100;var y=(e.clientY-r.top)/r.height*100;showAdd(x,y);});
function showAdd(x,y,ep){closePop();mask.style.display='block';var topts=DATA.types.map(function(t){return '<option value='+t.key+(ep&&ep.type===t.key?' selected':'')+'>'+t.emoji+' '+t.label+'</option>';}).join('');var nopts=DATA.niveaux.map(function(n){return '<option value='+n.key+(ep&&ep.niveau===n.key?' selected':'')+'>'+n.label+'</option>';}).join('');var box=document.createElement('div');box.className='pop';box.innerHTML='<h3>'+(ep?'✏️ Modifier le point':'➕ Nouveau point')+'</h3><label>Type</label><select id=f_type>'+topts+'</select><label>👁️ Qui peut voir ?</label><select id=f_niv>'+nopts+'</select><label>Nom *</label><input id=f_nom value="'+(ep?escA(ep.nom):'')+'" placeholder="Ex: Champ de coca"><label>Région</label><input id=f_region value="'+(ep?escA(ep.region):'')+'" placeholder="New Hanover, Lemoyne…"><label>Lieu précis</label><input id=f_lieu value="'+(ep?escA(ep.lieu):'')+'" placeholder="Ex: au nord de Valentine"><label>Notes</label><textarea id=f_notes rows=2>'+(ep?esc(ep.notes):'')+'</textarea><div class=row><button class=bok id=fadd>'+(ep?'Enregistrer':'Placer ici')+'</button><button class=bno id=fcancel>Annuler</button></div>';document.body.appendChild(box);document.getElementById('fcancel').onclick=closePop;document.getElementById('fadd').onclick=function(){var nom=document.getElementById('f_nom').value.trim();if(!nom){alert('Le nom est obligatoire');return;}var payload={type:document.getElementById('f_type').value,niveau:document.getElementById('f_niv').value,nom:nom,region:document.getElementById('f_region').value,lieu:document.getElementById('f_lieu').value,notes:document.getElementById('f_notes').value};var url;if(ep){url='/carte/edit?k='+TOK;payload.id=ep.id;}else{url='/carte/add?k='+TOK;payload.x=x;payload.y=y;}fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(){closePop();load();});};}
var _si=document.getElementById('search');if(_si)_si.addEventListener('input',function(e){SEARCH=e.target.value||'';render();});
var _ri=document.getElementById('regionf');if(_ri)_ri.addEventListener('change',function(e){REGION=e.target.value||'';render();});
if(mapImg.complete)load();else{mapImg.onload=load;mapImg.onerror=load;}
</script></body></html>`;
}

module.exports = { init, installerPanel, routeInteraction, onMessage, capterCarteFond, httpHandle, ouvrirAjout, CARTE_CHANNEL_ID };
