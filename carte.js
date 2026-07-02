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

// ── Itinéraires / routes tracés sur la carte (opérations, routines, replis…) ──
const ROUTE_TYPES = [
  { key: 'operation', label: "Itinéraire d'opération", emoji: '🎯', color: '#c82828', dash: null },
  { key: 'routine',   label: 'Route habituelle / routine', emoji: '🔁', color: '#2870c8', dash: null },
  { key: 'convoi',    label: 'Convoi / contrebande', emoji: '📦', color: '#b84fd0', dash: null },
  { key: 'repli',     label: 'Repli / évasion', emoji: '🏃', color: '#e0762e', dash: '6 4' },
  { key: 'patrouille',label: 'Patrouille / reconnaissance', emoji: '🐎', color: '#3ca03c', dash: '2 4' },
  { key: 'autre',     label: 'Autre itinéraire', emoji: '🧵', color: '#c8a45c', dash: '6 4' },
];

const _type = k => TYPES.find(t => t.key === k) || { key: k, label: k, emoji: '📌' };
const _niv = k => NIVEAUX.find(n => n.key === k) || { key: k, label: k, emoji: '⚪' };
const _rtype = k => ROUTE_TYPES.find(t => t.key === k) || { key: k, label: k, emoji: '🧵', color: '#c8a45c' };

let _isMembre = () => true, _isDirection = () => false;
function init(opts) { if (opts?.isMembre) _isMembre = opts.isMembre; if (opts?.isDirection) _isDirection = opts.isDirection; }
function _peutVoir(member, niveau) {
  if (niveau === 'membre') return _isMembre(member) || _isDirection(member);
  if (niveau === 'confidentiel') return _isDirection(member);
  return true;
}
function _ensure(db) { if (!db.carte) db.carte = {}; if (!Array.isArray(db.carte.points)) db.carte.points = []; if (!Array.isArray(db.carte.routes)) db.carte.routes = []; return db.carte; }
function _id() { return 'PT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _rid() { return 'RT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _cleanPoints(arr) {
  if (!Array.isArray(arr)) return [];
  const out = [];
  for (const p of arr) {
    const x = Math.max(0, Math.min(100, Number(p && p.x))), y = Math.max(0, Math.min(100, Number(p && p.y)));
    if (isFinite(x) && isFinite(y)) out.push({ x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100 });
  }
  return out.slice(0, 60);
}
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
      '**🌐 Ouvrir la carte cliquable** — la carte interactive : pose des points **et trace des itinéraires** (opérations, routines, replis, patrouilles…).',
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
      const routes = (loadDB().carte?.routes || []).filter(r => _canSee(level, r.niveau)).map(r => ({ id: r.id, type: r.type, niveau: r.niveau, nom: r.nom, notes: r.notes || '', points: (r.points || []).map(p => ({ x: p.x, y: p.y })) }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ level, types: TYPES.map(t => ({ key: t.key, label: t.label, emoji: t.emoji })), routeTypes: ROUTE_TYPES.map(t => ({ key: t.key, label: t.label, emoji: t.emoji, color: t.color, dash: t.dash || null })), niveaux: _niveauxAutorises(level), points: pts, routes, kmLargeur: (loadDB().carte?.kmLargeur || null) })); return true;
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
    // ── Itinéraires / routes ──
    if (u.pathname === '/carte/route/add' && req.method === 'POST') {
      if (!level) { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => {
        try {
          const d = JSON.parse(body || '{}');
          const nom = String(d.nom || '').trim().slice(0, 100); if (!nom) { res.writeHead(400); res.end('{"error":"nom"}'); return; }
          const points = _cleanPoints(d.points); if (points.length < 2) { res.writeHead(400); res.end('{"error":"points"}'); return; }
          const type = ROUTE_TYPES.find(t => t.key === d.type) ? d.type : 'autre';
          let niveau = ['public', 'membre', 'confidentiel'].includes(d.niveau) ? d.niveau : 'membre'; if (!_canSee(level, niveau)) niveau = level;
          const db = loadDB(); const c = _ensure(db);
          c.routes.push({ id: _rid(), type, niveau, nom, points, notes: String(d.notes || '').slice(0, 500), parId: info.userId, parNom: '(carte web)', createdAt: new Date().toISOString() });
          saveDB(db);
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {});
        } catch { res.writeHead(500); res.end('{}'); }
      }); return true;
    }
    if (u.pathname === '/carte/route/edit' && req.method === 'POST') {
      if (!level) { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => {
        try {
          const d = JSON.parse(body || '{}'); const db = loadDB(); const c = _ensure(db);
          const r = c.routes.find(x => x.id === d.id);
          if (!r) { res.writeHead(404); res.end('{}'); return; }
          if (!_canSee(level, r.niveau)) { res.writeHead(403); res.end('{}'); return; }
          const nom = String(d.nom || '').trim().slice(0, 100); if (nom) r.nom = nom;
          if (ROUTE_TYPES.find(t => t.key === d.type)) r.type = d.type;
          let niveau = ['public', 'membre', 'confidentiel'].includes(d.niveau) ? d.niveau : r.niveau; if (!_canSee(level, niveau)) niveau = r.niveau; r.niveau = niveau;
          r.notes = String(d.notes || '').slice(0, 500);
          if (Array.isArray(d.points)) { const pts = _cleanPoints(d.points); if (pts.length >= 2) r.points = pts; }
          saveDB(db); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {});
        } catch { res.writeHead(500); res.end('{}'); }
      }); return true;
    }
    if (u.pathname === '/carte/route/del' && req.method === 'POST') {
      if (level !== 'confidentiel') { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => { try { const d = JSON.parse(body || '{}'); const db = loadDB(); const c = _ensure(db); c.routes = c.routes.filter(r => r.id !== d.id); saveDB(db); res.writeHead(200); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {}); } catch { res.writeHead(500); res.end('{}'); } }); return true;
    }
    // 📏 Échelle de la carte (largeur totale en km) — pour estimer les distances
    if (u.pathname === '/carte/scale' && req.method === 'POST') {
      if (level !== 'confidentiel') { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => { try { const d = JSON.parse(body || '{}'); const km = Math.max(0, Math.min(100000, Number(d.km) || 0)); const db = loadDB(); const c = _ensure(db); c.kmLargeur = km > 0 ? km : null; saveDB(db); res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}'); } catch { res.writeHead(500); res.end('{}'); } }); return true;
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
*{box-sizing:border-box}html,body{height:100%}body{margin:0;font-family:Georgia,serif;background:#15110c;color:#e8d8c0;display:flex;flex-direction:column;overflow:hidden}
header{padding:10px 16px;background:#241a12;border-bottom:1px solid #4a3826;display:flex;gap:12px;align-items:center;flex-wrap:wrap}
header b{color:#d9a441}.lvl{font-size:13px;opacity:.85}.hint{font-size:13px;opacity:.8;margin-left:auto}
#stage{position:relative;flex:1;overflow:hidden;background:#15110c;touch-action:none;cursor:grab}#stage.drag{cursor:grabbing}
#wrap{position:absolute;left:0;top:0;width:100%;transform-origin:0 0}#map{display:block;width:100%;height:auto;cursor:crosshair}
#zoom{position:fixed;bottom:10px;left:10px;display:flex;flex-direction:column;gap:6px;z-index:30}
#zoom button{width:40px;height:40px;border-radius:8px;border:1px solid #5a4632;background:#241a12dd;color:#e8d8c0;font-size:20px;line-height:1;cursor:pointer}
.pin{position:absolute;transform:translate(-50%,-50%) scale(var(--ps,1));transform-origin:center;width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px #000;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:10px}
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
#coords{position:fixed;bottom:10px;right:10px;background:#241a12dd;border:1px solid #5a4632;border-radius:6px;padding:5px 9px;font-family:monospace;font-size:12px;color:#d9a441;z-index:30}
#routes{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.rline{fill:none;stroke-width:2.5;stroke-linejoin:round;stroke-linecap:round;pointer-events:stroke;cursor:pointer}
.rhalo{fill:none;stroke:#000;stroke-width:5;opacity:.3;stroke-linejoin:round;stroke-linecap:round;pointer-events:none}
.modebtn{background:#241a12;color:#e8d8c0;border:1px solid #5a4632;border-radius:6px;padding:6px 10px;font-family:inherit;font-size:13px;cursor:pointer}
.modebtn.on{background:#d9a441;color:#1a1208;border-color:#d9a441;font-weight:bold}
#drawbar{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:35;background:#241a12f2;border:1px solid #d9a441;border-radius:10px;padding:8px 10px;display:none;gap:8px;align-items:center;box-shadow:0 6px 20px #000a}
#drawbar.on{display:flex}#drawbar span{font-size:13px;color:#f0c850}
#drawbar button{border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font-weight:bold;font-family:inherit;font-size:13px}
.dbu{background:#5a4632;color:#e8d8c0}.dbf{background:#3a7d3a;color:#fff}.dbc{background:#a33;color:#fff}
.leg.rt .dot{height:5px;border-radius:2px;width:16px}
.whandle{position:absolute;transform:translate(-50%,-50%) scale(var(--ps,1));transform-origin:center;width:15px;height:15px;border-radius:50%;background:#f0c850;border:2px solid #1a1208;box-shadow:0 0 4px #000;cursor:grab;z-index:6;touch-action:none}
.whandle.dragging{cursor:grabbing;background:#fff}
#navbar{position:fixed;top:58px;left:50%;transform:translateX(-50%);z-index:35;background:#241a12f2;border:1px solid #d9a441;border-radius:10px;padding:8px 10px;display:none;gap:8px;align-items:center;box-shadow:0 6px 20px #000a;max-width:92vw}
#navbar.on{display:flex}#navbar span{font-size:13px;color:#f0c850}
#navbar button{border:0;border-radius:6px;padding:7px 10px;cursor:pointer;font-weight:bold;font-family:inherit;font-size:13px}
.navline{fill:none;stroke:#ffe08a;stroke-width:4;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.navhalo{fill:none;stroke:#000;stroke-width:8;opacity:.45;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
</style></head><body>
<header><b>🗺️ Carte — La Confrérie</b><span class="lvl">Accès : ${level === 'confidentiel' ? '🔴 Confidentiel' : level === 'membre' ? '🟡 Membre' : '🟢 Public'}</span><input id="search" placeholder="🔎 Chercher…"><select id="regionf"><option value="">📍 Toutes régions</option></select><button id="modebtn" class="modebtn">🧵 Tracer un itinéraire</button><button id="navbtn" class="modebtn">🧭 Trajet</button>${level === 'confidentiel' ? '<button id="scalebtn" class="modebtn">📏 Échelle</button>' : ''}<span class="hint">🖱️ Clic = point · 🧵 = itinéraire · 🧭 = trajet auto</span></header>
<div id="stage"><div id="wrap"><img id="map" src="/carte/image?k=${tok}" alt="carte"><svg id="routes" viewBox="0 0 100 100" preserveAspectRatio="none"></svg></div></div><div id="legend"></div><div id="coords">X — · Y —</div><div id="zoom"><button id="zin" title="Zoom +">＋</button><button id="zout" title="Zoom −">－</button><button id="zres" title="Réinitialiser">⟲</button></div><div id="drawbar"><span id="drawinfo">Itinéraire : 0 point</span><button id="drawundo" class="dbu">↶ Annuler</button><button id="drawfin" class="dbf">✓ Terminer</button><button id="drawcancel" class="dbc">✕</button></div><div id="navbar"><span id="navinfo">🧭 Clique le point de DÉPART</span><button id="naverase" class="dbc">✕ Effacer</button></div><div id="mask"></div>
<script>
var TOK=${JSON.stringify(tok)},LVL=${JSON.stringify(level)},DATA={types:[],niveaux:[],points:[]},HIDDEN={},SEARCH='',REGION='';
var ROUTES=[],RTYPES=[],RHIDDEN={},MODE='pts',DRAW=[],KM=null,WDRAG=null;
var NAVA=null,NAVB=null,NAVPATH=null,NAVINFO='';
var wrap=document.getElementById('wrap'),mapImg=document.getElementById('map'),mask=document.getElementById('mask');
var SC=1,OX=0,OY=0,_moved=false;
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function escA(s){return esc(s).replace(/"/g,'&quot;');}
function borderFor(n){if(n==='confidentiel')return '3px solid #e05555';if(n==='membre')return '2px solid #f0c850';return '2px solid #ffffff';}
function colorFor(t){var m={recolte:'#3ca03c',vendeur:'#2870c8',illegal:'#c82828',chasse:'#965a28',peche:'#28a0b4',planque:'#783ca0',four:'#e08a2e',fleur_dragon:'#b84fd0',fournaise:'#8a4b2a',peches:'#e8a05a',autre:'#5a5a5a'};return m[t]||'#5a5a5a';}
function emojiFor(t){var o=DATA.types.find(function(x){return x.key===t;});return o?o.emoji:'📌';}
function rcolor(t){var o=RTYPES.find(function(x){return x.key===t;});return o?o.color:'#c8a45c';}
function remoji(t){var o=RTYPES.find(function(x){return x.key===t;});return o?o.emoji:'🧵';}
function rlabel(t){var o=RTYPES.find(function(x){return x.key===t;});return o?o.label:t;}
function rdash(t){var o=RTYPES.find(function(x){return x.key===t;});return o&&o.dash?o.dash:'';}
function sizeSvg(){var s=document.getElementById('routes');if(s&&mapImg){s.setAttribute('width',mapImg.clientWidth);s.setAttribute('height',mapImg.clientHeight);s.style.width=mapImg.clientWidth+'px';s.style.height=mapImg.clientHeight+'px';}}
function smoothD(pts){if(!pts||!pts.length)return '';if(pts.length<3){var d0='M '+pts[0].x+' '+pts[0].y;for(var j=1;j<pts.length;j++)d0+=' L '+pts[j].x+' '+pts[j].y;return d0;}var d='M '+pts[0].x+' '+pts[0].y;for(var i=0;i<pts.length-1;i++){var p0=pts[i-1]||pts[i],p1=pts[i],p2=pts[i+1],p3=pts[i+2]||p2;var c1x=p1.x+(p2.x-p0.x)/6,c1y=p1.y+(p2.y-p0.y)/6,c2x=p2.x-(p3.x-p1.x)/6,c2y=p2.y-(p3.y-p1.y)/6;d+=' C '+c1x.toFixed(2)+' '+c1y.toFixed(2)+' '+c2x.toFixed(2)+' '+c2y.toFixed(2)+' '+p2.x+' '+p2.y;}return d;}
function renderRoutes(){var svg=document.getElementById('routes');if(!svg)return;sizeSvg();var q=(SEARCH||'').toLowerCase();var h='';for(var i=0;i<ROUTES.length;i++){var r=ROUTES[i];if(RHIDDEN[r.type])continue;if(!r.points||r.points.length<2)continue;if(q&&(r.nom||'').toLowerCase().indexOf(q)<0&&(r.notes||'').toLowerCase().indexOf(q)<0)continue;var dd=smoothD(r.points);var da=rdash(r.type);h+='<path class="rhalo" d="'+dd+'" vector-effect="non-scaling-stroke"></path><path class="rline" data-rid="'+r.id+'" d="'+dd+'" stroke="'+rcolor(r.type)+'"'+(da?' stroke-dasharray="'+da+'"':'')+' vector-effect="non-scaling-stroke"></path>';}if(MODE==='route'&&DRAW.length>1){var dp=DRAW.map(function(p){return p.x+','+p.y;}).join(' ');h+='<polyline class="rline" points="'+dp+'" stroke="#f0c850" stroke-dasharray="2 1.5" vector-effect="non-scaling-stroke"></polyline>';}
if(NAVPATH&&NAVPATH.length>1){var nd=smoothD(NAVPATH);h+='<path class="navhalo" d="'+nd+'" vector-effect="non-scaling-stroke"></path><path class="navline" d="'+nd+'" vector-effect="non-scaling-stroke"></path>';if(NAVA)h+='<line x1="'+NAVA.x+'" y1="'+NAVA.y+'" x2="'+NAVPATH[0].x+'" y2="'+NAVPATH[0].y+'" stroke="#3ce06a" stroke-width="1" stroke-dasharray="1 1" vector-effect="non-scaling-stroke"></line>';if(NAVB)h+='<line x1="'+NAVB.x+'" y1="'+NAVB.y+'" x2="'+NAVPATH[NAVPATH.length-1].x+'" y2="'+NAVPATH[NAVPATH.length-1].y+'" stroke="#e0483c" stroke-width="1" stroke-dasharray="1 1" vector-effect="non-scaling-stroke"></line>';}
if(NAVA)h+='<circle cx="'+NAVA.x+'" cy="'+NAVA.y+'" r="1.4" fill="#3ce06a" stroke="#08240f" stroke-width="0.4"></circle>';
if(NAVB)h+='<circle cx="'+NAVB.x+'" cy="'+NAVB.y+'" r="1.4" fill="#e0483c" stroke="#2a0a08" stroke-width="0.4"></circle>';
svg.innerHTML=h;Array.prototype.forEach.call(svg.querySelectorAll('.rline[data-rid]'),function(el){el.addEventListener('click',function(e){e.stopPropagation();if(MODE==='nav'){var rr=mapImg.getBoundingClientRect();navClickAt((e.clientX-rr.left)/rr.width*100,(e.clientY-rr.top)/rr.height*100);return;}var r=ROUTES.find(function(x){return x.id===el.getAttribute('data-rid');});if(r)showRoute(r);});});}
function renderDrawHandles(){Array.prototype.forEach.call(document.querySelectorAll('.whandle'),function(el){el.remove();});if(MODE!=='route')return;for(var i=0;i<DRAW.length;i++){(function(idx){var hd=document.createElement('div');hd.className='whandle';hd.style.left=DRAW[idx].x+'%';hd.style.top=DRAW[idx].y+'%';hd.setAttribute('data-i',idx);hd.addEventListener('pointerdown',function(e){e.stopPropagation();e.preventDefault();WDRAG=idx;hd.classList.add('dragging');try{hd.setPointerCapture(e.pointerId);}catch(_){}});hd.addEventListener('dblclick',function(e){e.stopPropagation();e.preventDefault();DRAW.splice(idx,1);renderRoutes();renderDrawHandles();updateDrawBar();});wrap.appendChild(hd);})(i);}}
function showRoute(r){closePop();mask.style.display='block';var n=DATA.niveaux.find(function(x){return x.key===r.niveau;});var box=document.createElement('div');box.className='pop';var del=(LVL==='confidentiel')?'<button class=bdel id=rdel>🗑️ Supprimer</button>':'';var ed='<button class=bok id=redit>✏️ Modifier</button>';box.innerHTML='<h3>'+remoji(r.type)+' '+esc(r.nom)+'</h3><div><span class=tag>'+esc(rlabel(r.type))+'</span><span class=tag>'+esc(n?n.label:r.niveau)+'</span><span class=tag>'+r.points.length+' points</span></div>'+'<p>📏 '+fmtDist(r.points)+'</p>'+(r.notes?'<p>📝 '+esc(r.notes)+'</p>':'')+'<div class=row>'+ed+del+'<button class=bno id=rclose>Fermer</button></div>';document.body.appendChild(box);document.getElementById('rclose').onclick=closePop;document.getElementById('redit').onclick=function(){showRouteForm(r);};if(del)document.getElementById('rdel').onclick=function(){fetch('/carte/route/del?k='+TOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:r.id})}).then(function(){closePop();load();});};}
function showRouteForm(er){closePop();mask.style.display='block';var topts=RTYPES.map(function(t){return '<option value='+t.key+(er&&er.type===t.key?' selected':'')+'>'+t.emoji+' '+t.label+'</option>';}).join('');var nopts=DATA.niveaux.map(function(n){return '<option value='+n.key+(er&&er.niveau===n.key?' selected':'')+'>'+n.label+'</option>';}).join('');var box=document.createElement('div');box.className='pop';box.innerHTML='<h3>'+(er?'✏️ Modifier le tracé':'🧵 Nouvel itinéraire')+'</h3><p style="font-family:monospace;opacity:.85;margin:0 0 6px">'+(er?er.points.length:DRAW.length)+' point(s) tracé(s)</p><label>Type</label><select id=r_type>'+topts+'</select><label>👁️ Qui peut voir ?</label><select id=r_niv>'+nopts+'</select><label>Nom *</label><input id=r_nom value="'+(er?escA(er.nom):'')+'" placeholder="Ex: Convoi Blackwater vers Valentine"><label>Notes (horaires, fréquence, précautions…)</label><textarea id=r_notes rows=2>'+(er?esc(er.notes):'')+'</textarea><div class=row><button class=bok id=r_save>Enregistrer</button><button class=bno id=r_cancel>Annuler</button></div>';document.body.appendChild(box);document.getElementById('r_cancel').onclick=closePop;document.getElementById('r_save').onclick=function(){var nom=document.getElementById('r_nom').value.trim();if(!nom){alert('Le nom est obligatoire');return;}var payload={nom:nom,type:document.getElementById('r_type').value,niveau:document.getElementById('r_niv').value,notes:document.getElementById('r_notes').value};var url;if(er){url='/carte/route/edit?k='+TOK;payload.id=er.id;}else{url='/carte/route/add?k='+TOK;payload.points=DRAW;}fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(){DRAW=[];setMode('pts');closePop();load();});};}
function updateDrawBar(){var el=document.getElementById('drawinfo');if(el)el.textContent='Itinéraire : '+DRAW.length+' point'+(DRAW.length>1?'s':'')+(DRAW.length>1?' · '+fmtDist(DRAW):'');}
function setMode(m){MODE=m;var b=document.getElementById('modebtn'),nb=document.getElementById('navbtn'),bar=document.getElementById('drawbar'),nbar=document.getElementById('navbar');if(b){b.classList.toggle('on',m==='route');b.textContent=m==='route'?'✋ Arrêter le tracé':'🧵 Tracer un itinéraire';}if(nb)nb.classList.toggle('on',m==='nav');if(bar)bar.classList.toggle('on',m==='route');if(nbar)nbar.classList.toggle('on',m==='nav');if(m!=='route')DRAW=[];if(m!=='nav'){NAVA=null;NAVB=null;NAVPATH=null;NAVINFO='';}updateDrawBar();updateNavBar();renderRoutes();renderDrawHandles();}
function load(){fetch('/carte/data?k='+TOK).then(function(r){return r.json();}).then(function(j){if(j.error){document.body.innerHTML='<h2 style=text-align:center;margin-top:60px>Lien expiré</h2>';return;}DATA=j;ROUTES=j.routes||[];RTYPES=j.routeTypes||[];KM=j.kmLargeur||null;render();});}
function _routeLen(pts){var W=mapImg.naturalWidth||mapImg.clientWidth||1,H=mapImg.naturalHeight||mapImg.clientHeight||1;var tot=0;for(var i=1;i<pts.length;i++){var dx=(pts[i].x-pts[i-1].x)/100*W,dy=(pts[i].y-pts[i-1].y)/100*H;tot+=Math.sqrt(dx*dx+dy*dy);}var pctW=W?tot/W*100:0;var km=KM?pctW/100*KM:null;return {pctW:pctW,km:km};}
function fmtDist(pts){if(!pts||pts.length<2)return '';var L=_routeLen(pts);var s='≈ '+L.pctW.toFixed(0)+'% de la carte';if(L.km!=null){var min=Math.round(L.km/13*60);s+=' · '+L.km.toFixed(1).replace('.',',')+' km · ~'+min+' min à cheval';}return s;}
function fmtLen(px){var W=mapImg.naturalWidth||mapImg.clientWidth||1;var pctW=px/W*100;var s='≈ '+pctW.toFixed(0)+'% de la carte';if(KM){var km=pctW/100*KM;s+=' · '+km.toFixed(1).replace('.',',')+' km · ~'+Math.round(km/13*60)+' min à cheval';}return s;}
// ── Calcul de trajet le long du réseau d'itinéraires déjà tracés ──
function _ndist(a,b){var W=mapImg.naturalWidth||mapImg.clientWidth||1,H=mapImg.naturalHeight||mapImg.clientHeight||1;var dx=(a.x-b.x)/100*W,dy=(a.y-b.y)/100*H;return Math.sqrt(dx*dx+dy*dy);}
function _buildGraph(){var TOL=0.8,nodes=[],adj=[];function addNode(p){for(var i=0;i<nodes.length;i++){if(Math.abs(nodes[i].x-p.x)<=TOL&&Math.abs(nodes[i].y-p.y)<=TOL)return i;}nodes.push({x:p.x,y:p.y});adj.push([]);return nodes.length-1;}function addEdge(a,b){if(a===b)return;var w=_ndist(nodes[a],nodes[b]);adj[a].push({to:b,w:w});adj[b].push({to:a,w:w});}for(var r=0;r<ROUTES.length;r++){var pts=ROUTES[r].points||[];var prev=-1;for(var k=0;k<pts.length;k++){var id=addNode(pts[k]);if(prev>=0)addEdge(prev,id);prev=id;}}return {nodes:nodes,adj:adj};}
function _projSeg(p,a,b){var vx=b.x-a.x,vy=b.y-a.y,L2=vx*vx+vy*vy;if(L2===0)return {x:a.x,y:a.y};var t=((p.x-a.x)*vx+(p.y-a.y)*vy)/L2;t=Math.max(0,Math.min(1,t));return {x:a.x+t*vx,y:a.y+t*vy};}
function _snap(G,p){var best=null;for(var a=0;a<G.nodes.length;a++){for(var e=0;e<G.adj[a].length;e++){var b=G.adj[a][e].to;if(b<a)continue;var q=_projSeg(p,G.nodes[a],G.nodes[b]);var d=_ndist(p,q);if(!best||d<best.d)best={d:d,q:q,a:a,b:b};}}return best;}
function _addTemp(G,sn){var id=G.nodes.length;G.nodes.push(sn.q);G.adj.push([]);var wa=_ndist(sn.q,G.nodes[sn.a]),wb=_ndist(sn.q,G.nodes[sn.b]);G.adj[id].push({to:sn.a,w:wa});G.adj[sn.a].push({to:id,w:wa});G.adj[id].push({to:sn.b,w:wb});G.adj[sn.b].push({to:id,w:wb});return id;}
function _dijkstra(G,s,t){var n=G.nodes.length,dist=[],prev=[],vis=[],i;for(i=0;i<n;i++){dist[i]=Infinity;prev[i]=-1;vis[i]=false;}dist[s]=0;for(var it=0;it<n;it++){var u=-1,bd=Infinity;for(i=0;i<n;i++){if(!vis[i]&&dist[i]<bd){bd=dist[i];u=i;}}if(u<0)break;if(u===t)break;vis[u]=true;for(var e=0;e<G.adj[u].length;e++){var v=G.adj[u][e].to,nd=dist[u]+G.adj[u][e].w;if(nd<dist[v]){dist[v]=nd;prev[v]=u;}}}if(dist[t]===Infinity)return null;var path=[],c=t;while(c>=0){path.unshift(G.nodes[c]);c=prev[c];}return {path:path,dist:dist[t]};}
function computeNav(){NAVPATH=null;NAVINFO='';if(!NAVA||!NAVB)return;var G=_buildGraph();if(!G.nodes.length){NAVINFO='Aucun itinéraire tracé — trace des routes avant.';return;}var sa=_snap(G,NAVA),sb=_snap(G,NAVB);if(!sa||!sb){NAVINFO='Réseau introuvable.';return;}var s=_addTemp(G,sa),t=_addTemp(G,sb);var res=_dijkstra(G,s,t);if(!res){NAVINFO='Pas de chemin le long des routes tracées entre ces deux points. Trace le tronçon manquant.';return;}NAVPATH=res.path;NAVINFO='🧭 Trajet : '+fmtLen(res.dist);}
function navClickAt(x,y){if(!NAVA){NAVA={x:+x.toFixed(2),y:+y.toFixed(2)};NAVB=null;NAVPATH=null;NAVINFO='';}else if(!NAVB){NAVB={x:+x.toFixed(2),y:+y.toFixed(2)};computeNav();}else{NAVA={x:+x.toFixed(2),y:+y.toFixed(2)};NAVB=null;NAVPATH=null;NAVINFO='';}renderRoutes();updateNavBar();}
function updateNavBar(){var el=document.getElementById('navinfo');if(!el)return;if(NAVINFO)el.textContent=NAVINFO;else if(!NAVA)el.textContent='🧭 Clique le point de DÉPART';else if(!NAVB)el.textContent='🏁 Clique le point ARRIVÉE';else el.textContent='Calcul…';}
function render(){document.querySelectorAll('.pin').forEach(function(p){p.remove();});var q=(SEARCH||'').toLowerCase();DATA.points.forEach(function(p){if(p.x==null)return;if(HIDDEN[p.type])return;if(REGION&&(p.region||'')!==REGION)return;if(q&&(p.nom||'').toLowerCase().indexOf(q)<0&&(p.lieu||'').toLowerCase().indexOf(q)<0&&(p.notes||'').toLowerCase().indexOf(q)<0)return;var d=document.createElement('div');d.className='pin';d.style.left=p.x+'%';d.style.top=p.y+'%';d.style.background=colorFor(p.type);d.style.border=borderFor(p.niveau);d.textContent=emojiFor(p.type);d.title=p.nom+(p.lieu?(' — '+p.lieu):'');d.onclick=function(e){e.stopPropagation();showInfo(p);};wrap.appendChild(d);});buildLegend();buildRegions();renderRoutes();}
function buildRegions(){var sel=document.getElementById('regionf');if(!sel)return;var regs={};DATA.points.forEach(function(p){if(p.region)regs[p.region]=1;});var opts='<option value="">📍 Toutes régions</option>';Object.keys(regs).sort().forEach(function(r){opts+='<option value="'+escA(r)+'"'+(r===REGION?' selected':'')+'>📍 '+esc(r)+'</option>';});sel.innerHTML=opts;}
function buildLegend(){var counts={},tot=0;DATA.points.forEach(function(p){if(p.x==null)return;tot++;counts[p.type]=(counts[p.type]||0)+1;});var rcounts={};ROUTES.forEach(function(r){rcounts[r.type]=(rcounts[r.type]||0)+1;});var box=document.getElementById('legend');if(!box)return;var keys=DATA.types.filter(function(t){return counts[t.key];});var rkeys=RTYPES.filter(function(t){return rcounts[t.key];});if(!keys.length&&!rkeys.length){box.style.display='none';return;}box.style.display='block';var html='';if(keys.length){html+='<h4>Lieux · '+tot+'</h4>';keys.forEach(function(t){html+='<div class="leg'+(HIDDEN[t.key]?' off':'')+'" data-k="'+t.key+'"><span class="dot" style="background:'+colorFor(t.key)+'"></span>'+t.emoji+' '+esc(t.label)+'<span class="c">'+counts[t.key]+'</span></div>';});}if(rkeys.length){html+='<h4 style="margin-top:8px">🧵 Itinéraires</h4>';rkeys.forEach(function(t){html+='<div class="leg rt'+(RHIDDEN[t.key]?' off':'')+'" data-rk="'+t.key+'"><span class="dot" style="background:'+t.color+'"></span>'+t.emoji+' '+esc(t.label)+'<span class="c">'+rcounts[t.key]+'</span></div>';});}box.innerHTML=html;Array.prototype.forEach.call(box.querySelectorAll('.leg[data-k]'),function(el){el.onclick=function(){var k=el.getAttribute('data-k');HIDDEN[k]=!HIDDEN[k];render();};});Array.prototype.forEach.call(box.querySelectorAll('.leg[data-rk]'),function(el){el.onclick=function(){var k=el.getAttribute('data-rk');RHIDDEN[k]=!RHIDDEN[k];buildLegend();renderRoutes();};});}
function closePop(){var e=document.querySelector('.pop');if(e)e.remove();mask.style.display='none';}
mask.onclick=closePop;
function showInfo(p){closePop();mask.style.display='block';var n=DATA.niveaux.find(function(x){return x.key===p.niveau;});var box=document.createElement('div');box.className='pop';var del=(LVL==='confidentiel')?'<button class=bdel id=bdel>🗑️ Supprimer</button>':'';var ed='<button class=bok id=bedit>✏️ Modifier</button>';box.innerHTML='<h3>'+emojiFor(p.type)+' '+esc(p.nom)+'</h3><div><span class=tag>'+esc((DATA.types.find(function(x){return x.key===p.type;})||{}).label||p.type)+'</span><span class=tag>'+esc(n?n.label:p.niveau)+'</span></div>'+(p.region?'<p>📍 '+esc(p.region)+'</p>':'')+(p.lieu?'<p>'+esc(p.lieu)+'</p>':'')+(p.notes?'<p>📝 '+esc(p.notes)+'</p>':'')+(p.x!=null?'<p>🧭 <span style="font-family:monospace">X '+(+p.x).toFixed(1)+' · Y '+(+p.y).toFixed(1)+'</span></p>':'')+'<div class=row>'+ed+del+'<button class=bno id=bclose>Fermer</button></div>';document.body.appendChild(box);document.getElementById('bclose').onclick=closePop;document.getElementById('bedit').onclick=function(){closePop();showAdd(p.x,p.y,p);};if(del)document.getElementById('bdel').onclick=function(){fetch('/carte/del?k='+TOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id})}).then(function(){closePop();load();});};}
function _setCoords(x,y){var c=document.getElementById('coords');if(c)c.textContent='X '+x.toFixed(1)+' · Y '+y.toFixed(1);}
mapImg.addEventListener('mousemove',function(e){var r=mapImg.getBoundingClientRect();_setCoords((e.clientX-r.left)/r.width*100,(e.clientY-r.top)/r.height*100);});
mapImg.addEventListener('click',function(e){if(_moved){_moved=false;return;}var r=mapImg.getBoundingClientRect();var x=(e.clientX-r.left)/r.width*100;var y=(e.clientY-r.top)/r.height*100;_setCoords(x,y);if(MODE==='route'){DRAW.push({x:+x.toFixed(2),y:+y.toFixed(2)});renderRoutes();renderDrawHandles();updateDrawBar();return;}if(MODE==='nav'){navClickAt(x,y);return;}showAdd(x,y);});
window.addEventListener('pointermove',function(e){if(WDRAG==null)return;var r=mapImg.getBoundingClientRect();var x=Math.max(0,Math.min(100,(e.clientX-r.left)/r.width*100)),y=Math.max(0,Math.min(100,(e.clientY-r.top)/r.height*100));DRAW[WDRAG]={x:+x.toFixed(2),y:+y.toFixed(2)};var hs=document.querySelectorAll('.whandle');if(hs[WDRAG]){hs[WDRAG].style.left=x+'%';hs[WDRAG].style.top=y+'%';}renderRoutes();updateDrawBar();});
window.addEventListener('pointerup',function(){if(WDRAG!=null){var el=document.querySelector('.whandle.dragging');if(el)el.classList.remove('dragging');WDRAG=null;}});
(function(){var STg=document.getElementById('stage');if(!STg)return;
function applyT(){wrap.style.transform='translate('+OX+'px,'+OY+'px) scale('+SC+')';wrap.style.setProperty('--ps',1/SC);}
function zoomAt(mx,my,ds){var ns=Math.min(18,Math.max(1,SC*ds));var k=ns/SC;OX=mx-(mx-OX)*k;OY=my-(my-OY)*k;SC=ns;if(SC<=1.001){SC=1;OX=0;OY=0;}applyT();}
STg.addEventListener('wheel',function(e){e.preventDefault();var r=STg.getBoundingClientRect();zoomAt(e.clientX-r.left,e.clientY-r.top,e.deltaY<0?1.15:1/1.15);},{passive:false});
var zin=document.getElementById('zin'),zout=document.getElementById('zout'),zres=document.getElementById('zres');
if(zin)zin.onclick=function(){var r=STg.getBoundingClientRect();zoomAt(r.width/2,r.height/2,1.3);};
if(zout)zout.onclick=function(){var r=STg.getBoundingClientRect();zoomAt(r.width/2,r.height/2,1/1.3);};
if(zres)zres.onclick=function(){SC=1;OX=0;OY=0;applyT();};
var dragging=false,sx=0,sy=0,sox=0,soy=0,pinch=0;
STg.addEventListener('pointerdown',function(e){if(pinch)return;if(e.target&&e.target.closest&&(e.target.closest('.pin')||e.target.closest('.rline')))return;dragging=true;_moved=false;sx=e.clientX;sy=e.clientY;sox=OX;soy=OY;STg.classList.add('drag');});
window.addEventListener('pointermove',function(e){if(!dragging||pinch)return;var dx=e.clientX-sx,dy=e.clientY-sy;if(Math.abs(dx)+Math.abs(dy)>5)_moved=true;OX=sox+dx;OY=soy+dy;applyT();});
window.addEventListener('pointerup',function(){dragging=false;STg.classList.remove('drag');});
STg.addEventListener('touchstart',function(e){if(e.touches.length===2){pinch=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);dragging=false;}},{passive:false});
STg.addEventListener('touchmove',function(e){if(e.touches.length===2){e.preventDefault();var d=Math.hypot(e.touches[0].clientX-e.touches[1].clientX,e.touches[0].clientY-e.touches[1].clientY);if(pinch){var r=STg.getBoundingClientRect();zoomAt((e.touches[0].clientX+e.touches[1].clientX)/2-r.left,(e.touches[0].clientY+e.touches[1].clientY)/2-r.top,d/pinch);}pinch=d;}},{passive:false});
STg.addEventListener('touchend',function(e){if(e.touches.length<2)pinch=0;});
})();
function showAdd(x,y,ep){closePop();mask.style.display='block';var topts=DATA.types.map(function(t){return '<option value='+t.key+(ep&&ep.type===t.key?' selected':'')+'>'+t.emoji+' '+t.label+'</option>';}).join('');var nopts=DATA.niveaux.map(function(n){return '<option value='+n.key+(ep&&ep.niveau===n.key?' selected':'')+'>'+n.label+'</option>';}).join('');var box=document.createElement('div');box.className='pop';box.innerHTML='<h3>'+(ep?'✏️ Modifier le point':'➕ Nouveau point')+'</h3>'+((ep?ep.x:x)!=null?'<p style="font-family:monospace;opacity:.85;margin:0 0 6px">🧭 X '+(+(ep?ep.x:x)).toFixed(1)+' · Y '+(+(ep?ep.y:y)).toFixed(1)+'</p>':'')+'<label>Type</label><select id=f_type>'+topts+'</select><label>👁️ Qui peut voir ?</label><select id=f_niv>'+nopts+'</select><label>Nom *</label><input id=f_nom value="'+(ep?escA(ep.nom):'')+'" placeholder="Ex: Champ de coca"><label>Région</label><input id=f_region value="'+(ep?escA(ep.region):'')+'" placeholder="New Hanover, Lemoyne…"><label>Lieu précis</label><input id=f_lieu value="'+(ep?escA(ep.lieu):'')+'" placeholder="Ex: au nord de Valentine"><label>Notes</label><textarea id=f_notes rows=2>'+(ep?esc(ep.notes):'')+'</textarea><div class=row><button class=bok id=fadd>'+(ep?'Enregistrer':'Placer ici')+'</button><button class=bno id=fcancel>Annuler</button></div>';document.body.appendChild(box);document.getElementById('fcancel').onclick=closePop;document.getElementById('fadd').onclick=function(){var nom=document.getElementById('f_nom').value.trim();if(!nom){alert('Le nom est obligatoire');return;}var payload={type:document.getElementById('f_type').value,niveau:document.getElementById('f_niv').value,nom:nom,region:document.getElementById('f_region').value,lieu:document.getElementById('f_lieu').value,notes:document.getElementById('f_notes').value};var url;if(ep){url='/carte/edit?k='+TOK;payload.id=ep.id;}else{url='/carte/add?k='+TOK;payload.x=x;payload.y=y;}fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)}).then(function(r){return r.json();}).then(function(){closePop();load();});};}
var _si=document.getElementById('search');if(_si)_si.addEventListener('input',function(e){SEARCH=e.target.value||'';render();});
var _ri=document.getElementById('regionf');if(_ri)_ri.addEventListener('change',function(e){REGION=e.target.value||'';render();});
var _mb=document.getElementById('modebtn');if(_mb)_mb.onclick=function(){setMode(MODE==='route'?'pts':'route');};
var _nb=document.getElementById('navbtn');if(_nb)_nb.onclick=function(){setMode(MODE==='nav'?'pts':'nav');};
var _ne=document.getElementById('naverase');if(_ne)_ne.onclick=function(){NAVA=null;NAVB=null;NAVPATH=null;NAVINFO='';updateNavBar();renderRoutes();};
var _sb=document.getElementById('scalebtn');if(_sb)_sb.onclick=function(){var cur=KM?String(KM):'';var v=prompt('Largeur totale de la carte en km (du bord gauche au bord droit). Laisse vide pour retirer :',cur);if(v===null)return;var s=String(v).replace(',','.').trim();var km=s===''?0:parseFloat(s);if(s!==''&&!(km>0)){alert('Nombre invalide');return;}fetch('/carte/scale?k='+TOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({km:km})}).then(function(r){return r.json();}).then(function(){load();});};
var _du=document.getElementById('drawundo');if(_du)_du.onclick=function(){DRAW.pop();renderRoutes();renderDrawHandles();updateDrawBar();};
var _df=document.getElementById('drawfin');if(_df)_df.onclick=function(){if(DRAW.length<2){alert('Ajoute au moins 2 points sur la carte.');return;}showRouteForm();};
var _dc=document.getElementById('drawcancel');if(_dc)_dc.onclick=function(){DRAW=[];setMode('pts');};
window.addEventListener('resize',function(){sizeSvg();renderRoutes();});
mapImg.addEventListener('load',function(){sizeSvg();renderRoutes();});
if(mapImg.complete)load();else{mapImg.onload=load;mapImg.onerror=load;}
</script></body></html>`;
}

module.exports = { init, installerPanel, routeInteraction, onMessage, capterCarteFond, httpHandle, ouvrirAjout, CARTE_CHANNEL_ID };
