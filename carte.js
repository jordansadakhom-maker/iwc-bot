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

const TYPES = [
  { key: 'recolte', label: 'Lieu de récolte', emoji: '🌿' },
  { key: 'vendeur', label: 'Vendeur', emoji: '🛒' },
  { key: 'illegal', label: 'Mission illégale', emoji: '🔪' },
  { key: 'chasse',  label: 'Chasse', emoji: '🦌' },
  { key: 'peche',   label: 'Pêche', emoji: '🎣' },
  { key: 'planque', label: 'Planque', emoji: '🏚️' },
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
      '**➕ Ajouter** — enregistre un lieu (type · accès · région · notes).',
      '**🔍 Consulter** — la liste des lieux que ton **accréditation** te permet de voir.',
      '**🗺️ Voir la carte** — l\'image de la carte en référence.',
      '**🛠️ Gérer** — *(Direction)* modifier ou supprimer un lieu.',
      '',
      '__Niveaux d\'accès__ : 🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction)',
    ].join('\n'))
    .addFields({ name: `📊 ${pts.length} lieu(x) enregistré(s)`, value: compteurs || '*Aucun pour l\'instant.*' })
    .setFooter({ text: 'La Confrérie • rien ne se perd' });
}
function _panelRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('carte_add').setLabel('Ajouter un lieu').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('carte_view').setLabel('Consulter').setEmoji('🔍').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('carte_seemap').setLabel('Voir la carte').setEmoji('🗺️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('carte_manage').setLabel('Gérer').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
  )];
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
      await interaction.showModal(_formModal(`carte_modal::${type}::${niveau}`, type, null)); return true;
    }
    if (interaction.isModalSubmit?.() && id.startsWith('carte_modal::')) {
      const [, type, niveau] = id.split('::');
      const nom = (interaction.fields.getTextInputValue('nom') || '').trim().slice(0, 100);
      if (!nom) { await interaction.reply({ content: '❌ Le nom est obligatoire.', flags: MessageFlags.Ephemeral }); return true; }
      let region = (interaction.fields.getTextInputValue('region') || '').trim();
      region = REGIONS.find(r => region && (r.toLowerCase().includes(region.toLowerCase()) || region.toLowerCase().includes(r.toLowerCase()))) || (region ? region.slice(0, 40) : 'Autre');
      const db = loadDB(); _ensure(db).points.push({ id: _id(), type, niveau, nom, region, lieu: (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200), notes: (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500), parId: interaction.user.id, parNom: interaction.member?.displayName || interaction.user.username, createdAt: new Date().toISOString() });
      saveDB(db);
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

module.exports = { init, installerPanel, routeInteraction, onMessage, capterCarteFond, CARTE_CHANNEL_ID };
