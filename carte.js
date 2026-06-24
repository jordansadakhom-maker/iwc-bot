// ═══════════════════════════════════════════════════════════════
//  carte.js — Carte interactive (registre + rendu visuel sur la carte)
//  • Carte de fond = l'image postée dans le salon (capturée auto).
//  • Grille A–L / 1–8 : chaque point a une case (ex: F4) → marqueur
//    numéroté dessiné directement sur la carte.
//  • Ajouter / Consulter (filtré par type ET accréditation) / Gérer.
//  • 3 niveaux : 🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction).
//  • Persistant (db.carte.points). Dégrade proprement si pas d'image/jimp.
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
let Jimp = null; try { Jimp = require('jimp'); } catch (e) { console.log('⚠️ carte : jimp non dispo (marqueurs désactivés) —', e.message); }

const CARTE_CHANNEL_ID = process.env.CARTE_CHANNEL_ID || '1519308989119074435';

const TYPES = [
  { key: 'recolte', label: 'Lieu de récolte', emoji: '🌿', col: [60, 160, 60] },
  { key: 'vendeur', label: 'Vendeur', emoji: '🛒', col: [40, 110, 200] },
  { key: 'illegal', label: 'Mission illégale', emoji: '🔪', col: [200, 40, 40] },
  { key: 'chasse',  label: 'Chasse', emoji: '🦌', col: [150, 90, 40] },
  { key: 'peche',   label: 'Pêche', emoji: '🎣', col: [40, 160, 180] },
  { key: 'planque', label: 'Planque', emoji: '🏚️', col: [120, 60, 160] },
  { key: 'autre',   label: 'Autre', emoji: '📌', col: [90, 90, 90] },
];
const NIVEAUX = [
  { key: 'public',       label: 'Public (tout le monde)', emoji: '🟢' },
  { key: 'membre',       label: 'Membre (Confrérie)', emoji: '🟡' },
  { key: 'confidentiel', label: 'Confidentiel (Direction)', emoji: '🔴' },
];
const COLS = 12, ROWS = 8; // grille A–L / 1–8

const _type = k => TYPES.find(t => t.key === k) || { key: k, label: k, emoji: '📌', col: [90, 90, 90] };
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

// ── Image de fond ───────────────────────────────────────────────
function _estImage(a) { return (a.contentType || '').startsWith('image') || /\.(png|jpe?g|webp)(\?|$)/i.test(a.url || a.name || ''); }
async function capterCarteFond(guild, message) {
  try {
    if (message) {
      const att = [...message.attachments.values()].find(_estImage);
      if (!att) return false;
      const db = loadDB(); const c = _ensure(db); c.mapMsgId = message.id; saveDB(db);
      return true;
    }
    // Scan des messages récents pour trouver une image
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch?.messages) return false;
    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return false;
    const withImg = [...msgs.values()].find(m => !m.author?.bot && [...m.attachments.values()].some(_estImage));
    if (withImg) { const db = loadDB(); const c = _ensure(db); c.mapMsgId = withImg.id; saveDB(db); return true; }
    return false;
  } catch { return false; }
}
async function _baseMapBuffer(guild) {
  try {
    const db = loadDB();
    if (!db.carte?.mapMsgId) { if (!(await capterCarteFond(guild))) return null; }
    const id = loadDB().carte?.mapMsgId; if (!id) return null;
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch) return null;
    const msg = await ch.messages.fetch(id).catch(() => null);
    const att = msg ? [...msg.attachments.values()].find(_estImage) : null;
    if (!att) return null;
    const r = await fetch(att.url); if (!r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}
function _caseToXY(caseStr, W, H) {
  if (!caseStr) return null;
  const m = String(caseStr).trim().match(/^([A-La-l])\s*(\d{1,2})$/);
  if (!m) return null;
  const col = m[1].toUpperCase().charCodeAt(0) - 65, row = parseInt(m[2], 10) - 1;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { x: Math.round((col + 0.5) * (W / COLS)), y: Math.round((row + 0.5) * (H / ROWS)) };
}
function _setPx(img, x, y, c) { if (x < 0 || y < 0 || x >= img.bitmap.width || y >= img.bitmap.height) return; const i = (img.bitmap.width * y + x) << 2; img.bitmap.data[i] = c[0]; img.bitmap.data[i + 1] = c[1]; img.bitmap.data[i + 2] = c[2]; img.bitmap.data[i + 3] = 255; }
function _marker(img, cx, cy, r, col) {
  for (let y = -r - 2; y <= r + 2; y++) for (let x = -r - 2; x <= r + 2; x++) { const d = x * x + y * y; if (d <= r * r) _setPx(img, cx + x, cy + y, col); else if (d <= (r + 2) * (r + 2)) _setPx(img, cx + x, cy + y, [255, 255, 255]); }
}
function _drawGrid(img) {
  const W = img.bitmap.width, H = img.bitmap.height, cw = W / COLS, ch = H / ROWS, line = [60, 45, 30];
  for (let c = 1; c < COLS; c++) { const x = Math.round(c * cw); for (let y = 0; y < H; y++) if (y % 2 === 0) _setPx(img, x, y, line); }
  for (let r = 1; r < ROWS; r++) { const y = Math.round(r * ch); for (let x = 0; x < W; x++) if (x % 2 === 0) _setPx(img, x, y, line); }
}
// Rend la carte avec les marqueurs des points fournis. Retourne {buf, legend} ou null.
async function _renderMap(guild, points, opts = {}) {
  if (!Jimp) return null;
  const base = await _baseMapBuffer(guild); if (!base) return null;
  let img; try { img = await Jimp.read(base); } catch { return null; }
  const W = img.bitmap.width, H = img.bitmap.height;
  _drawGrid(img);
  // étiquettes de grille (A–L en haut, 1–8 à gauche)
  let fLabel = null, fNum = null;
  try { fLabel = await Jimp.loadFont(Jimp.FONT_SANS_32_BLACK); } catch {}
  try { fNum = await Jimp.loadFont(Jimp.FONT_SANS_16_WHITE); } catch {}
  const cw = W / COLS, ch = H / ROWS;
  if (fLabel) {
    for (let c = 0; c < COLS; c++) img.print(fLabel, Math.round(c * cw + cw / 2 - 9), 4, String.fromCharCode(65 + c));
    for (let r = 0; r < ROWS; r++) img.print(fLabel, 4, Math.round(r * ch + ch / 2 - 16), String(r + 1));
  }
  const rad = Math.max(12, Math.round(W / 120));
  const legend = []; let n = 0;
  for (const p of points) {
    n++; const xy = _caseToXY(p.case, W, H); legend.push({ n, p, placed: !!xy });
    if (!xy) continue;
    _marker(img, xy.x, xy.y, rad, _type(p.type).col);
    if (fNum) img.print(fNum, xy.x - (n > 9 ? 9 : 4), xy.y - 9, String(n));
  }
  const buf = await img.getBufferAsync(Jimp.MIME_PNG).catch(() => null);
  return buf ? { buf, legend } : null;
}

// ── Panneau ─────────────────────────────────────────────────────
function _panelEmbed(db) {
  const pts = db.carte?.points || [];
  const parType = {}; for (const p of pts) parType[p.type] = (parType[p.type] || 0) + 1;
  const lignes = TYPES.map(t => `${t.emoji} ${t.label} — **${parType[t.key] || 0}**`).join('\n');
  return new EmbedBuilder().setColor(0x8B5A2B).setTitle('🗺️ CARTE INTERACTIVE — La Confrérie')
    .setDescription([
      '*Le registre des lieux qui comptent — affichés directement sur la carte.*', '',
      '**Comment ça marche**',
      '➕ **Ajouter** — type → niveau d\'accès → nom + **case** (ex: `F4`) + détails.',
      '🔍 **Consulter** — la carte s\'affiche avec les marqueurs que ton accréditation permet.',
      '🧭 **Grille** — affiche la carte quadrillée pour trouver ta case.', '',
      '🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction)', '',
      `📊 **${pts.length} point(s)** :`, lignes,
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • Carte • rien ne se perd' });
}
function _panelRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('carte_add').setLabel('Ajouter un point').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('carte_view').setLabel('Consulter').setEmoji('🔍').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('carte_grille').setLabel('Grille').setEmoji('🧭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('carte_manage').setLabel('Gérer').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
  )];
}
async function installerPanel(guild) {
  try {
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch?.send) return;
    await capterCarteFond(guild).catch(() => {});
    const db = loadDB();
    const payload = { embeds: [_panelEmbed(db)], components: _panelRows() };
    let msg = null;
    if (db.cartePanelId) msg = await ch.messages.fetch(db.cartePanelId).catch(() => null);
    if (!msg) { const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null); msg = msgs ? [...msgs.values()].find(m => m.author?.id === guild.client.user.id && (m.embeds?.[0]?.title || '').includes('CARTE INTERACTIVE')) : null; }
    if (msg) { await msg.edit(payload).catch(() => {}); if (db.cartePanelId !== msg.id) { const d = loadDB(); d.cartePanelId = msg.id; saveDB(d); } }
    else { const sent = await ch.send(payload).catch(() => null); if (sent) { try { await sent.pin(); } catch {} const d = loadDB(); d.cartePanelId = sent.id; saveDB(d); } }
  } catch (e) { console.log('❌ carte installerPanel:', e.message); }
}

function _legendeTexte(pts) {
  const byRegion = {};
  for (const p of pts) { (byRegion[p.region || 'Autre'] = byRegion[p.region || 'Autre'] || []).push(p); }
  return Object.entries(byRegion).map(([reg, arr]) => {
    const lines = arr.map(p => { const t = _type(p.type), n = _niv(p.niveau); return `${t.emoji} **${p.nom}**${p.case ? ` \`${p.case.toUpperCase()}\`` : ''} — ${p.lieu || '—'}${p.notes ? ` · ${String(p.notes).slice(0, 60)}` : ''} ${n.emoji}`; }).join('\n');
    return `📍 __${reg}__\n${lines}`;
  }).join('\n\n').slice(0, 3900);
}
async function _consulter(interaction, typeKey) {
  const db = loadDB();
  let pts = (db.carte?.points || []).filter(p => _peutVoir(interaction.member, p.niveau));
  if (typeKey && typeKey !== 'tout') pts = pts.filter(p => p.type === typeKey);
  if (!pts.length) return interaction.editReply({ content: '📭 Aucun point accessible pour ce filtre.' });
  const titre = typeKey && typeKey !== 'tout' ? `${_type(typeKey).emoji} ${_type(typeKey).label}` : '🗺️ Carte — points accessibles';
  const rendered = await _renderMap(interaction.guild, pts).catch(() => null);
  if (rendered) {
    const num = rendered.legend.map(L => `**${L.n}.** ${_type(L.p.type).emoji} ${L.p.nom}${L.p.case ? ` \`${L.p.case.toUpperCase()}\`` : ' *(sans case)*'} ${_niv(L.p.niveau).emoji}`).join('\n').slice(0, 3900);
    const e = new EmbedBuilder().setColor(0x8B5A2B).setTitle(titre).setDescription(num).setImage('attachment://carte.png').setFooter({ text: `La Confrérie • ${pts.length} point(s) · selon ton accréditation` });
    return interaction.editReply({ embeds: [e], files: [new AttachmentBuilder(rendered.buf, { name: 'carte.png' })] });
  }
  // Repli texte si pas d'image
  const e = new EmbedBuilder().setColor(0x8B5A2B).setTitle(titre).setDescription(_legendeTexte(pts)).setFooter({ text: `La Confrérie • ${pts.length} point(s) · selon ton accréditation` });
  return interaction.editReply({ embeds: [e] });
}

function _pointsSelect(customId, points) {
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder('Choisis un point…').addOptions(
    points.slice(0, 25).map(p => ({ label: `${p.nom}`.slice(0, 100), value: p.id, description: `${_type(p.type).label}${p.case ? ' · ' + p.case.toUpperCase() : ''} · ${_niv(p.niveau).label}`.slice(0, 100), emoji: _type(p.type).emoji }))
  ));
}
function _formModal(customId, type, niveau, p) {
  const modal = new ModalBuilder().setCustomId(customId).setTitle(`${_type(type).label}`.slice(0, 45));
  const f = (id, label, val, ph, para, max) => { const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(para ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(id === 'nom').setMaxLength(max || 100); if (ph) t.setPlaceholder(ph); if (val) t.setValue(String(val).slice(0, max || 100)); return new ActionRowBuilder().addComponents(t); };
  modal.addComponents(
    f('nom', 'Nom du point', p?.nom, 'Ex: Champ de coca, Vendeur d\'armes…'),
    f('region', 'Région', p?.region, 'Ambarino · New Hanover · Lemoyne · West Elizabeth · New Austin'),
    f('case', 'Case sur la grille (ex: F4)', p?.case, 'Lettre A–L + chiffre 1–8'),
    f('lieu', 'Lieu précis', p?.lieu, 'Ex: au nord de Valentine, près de la rivière'),
    f('notes', 'Notes (horaires, prix, dangers…)', p?.notes, '', true, 500),
  );
  return modal;
}

async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (interaction.isButton?.() && id === 'carte_add') {
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_type_sel').setPlaceholder('Type de point…').addOptions(TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji }))));
      await interaction.reply({ content: '➕ **Ajouter un point** — quel type ?', components: [row], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_type_sel') {
      const type = interaction.values[0];
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`carte_niv_sel::${type}`).setPlaceholder('Niveau d\'accès…').addOptions(NIVEAUX.map(n => ({ label: n.label, value: n.key, emoji: n.emoji }))));
      await interaction.update({ content: `➕ Type : **${_type(type).emoji} ${_type(type).label}** — qui peut le voir ?`, components: [row] }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id.startsWith('carte_niv_sel::')) {
      const type = id.split('::')[1], niveau = interaction.values[0];
      await interaction.showModal(_formModal(`carte_modal::${type}::${niveau}`, type, niveau, null)); return true;
    }
    if (interaction.isModalSubmit?.() && id.startsWith('carte_modal::')) {
      const [, type, niveau] = id.split('::');
      const nom = (interaction.fields.getTextInputValue('nom') || '').trim().slice(0, 100);
      if (!nom) { await interaction.reply({ content: '❌ Le nom est obligatoire.', flags: MessageFlags.Ephemeral }); return true; }
      const caseStr = (interaction.fields.getTextInputValue('case') || '').trim().toUpperCase().replace(/\s+/g, '');
      const point = { id: _id(), type, niveau, nom, region: (interaction.fields.getTextInputValue('region') || '').trim().slice(0, 40) || 'Autre', case: /^[A-L]\d{1,2}$/.test(caseStr) ? caseStr : '', lieu: (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200), notes: (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500), parId: interaction.user.id, parNom: interaction.member?.displayName || interaction.user.username, createdAt: new Date().toISOString() };
      const db = loadDB(); _ensure(db).points.push(point); saveDB(db);
      await installerPanel(interaction.guild).catch(() => {});
      const warn = !point.case ? '\n⚠️ Pas de case valide (A–L + 1–8) → le point existe mais n\'est pas dessiné sur la carte. Tu peux corriger via 🛠️ Gérer.' : '';
      await interaction.reply({ content: `✅ Point ajouté : ${_type(type).emoji} **${nom}**${point.case ? ` (case \`${point.case}\`)` : ''} · ${_niv(niveau).emoji} ${_niv(niveau).label}.${warn}`, flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isButton?.() && id === 'carte_view') {
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_view_sel').setPlaceholder('Filtrer par type…').addOptions([{ label: 'Tout afficher', value: 'tout', emoji: '🗺️' }, ...TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji }))]));
      await interaction.reply({ content: '🔍 **Consulter** — choisis un filtre :', components: [row], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_view_sel') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await _consulter(interaction, interaction.values[0]); return true;
    }
    if (interaction.isButton?.() && id === 'carte_grille') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const rendered = await _renderMap(interaction.guild, []).catch(() => null);
      if (!rendered) return interaction.editReply({ content: 'ℹ️ Aucune carte de fond trouvée. Poste une image de la carte dans ce salon, puis réessaie.' });
      const e = new EmbedBuilder().setColor(0x8B5A2B).setTitle('🧭 Carte quadrillée').setDescription('Repère ta **case** (colonne A–L + ligne 1–8) pour ajouter un point au bon endroit.').setImage('attachment://grille.png');
      return interaction.editReply({ embeds: [e], files: [new AttachmentBuilder(rendered.buf, { name: 'grille.png' })] });
    }
    // ── Gérer (Direction) : modifier / supprimer ──
    if (interaction.isButton?.() && id === 'carte_manage') {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 La gestion des points est réservée à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const pts = loadDB().carte?.points || [];
      if (!pts.length) { await interaction.reply({ content: 'Aucun point à gérer.', flags: MessageFlags.Ephemeral }); return true; }
      await interaction.reply({ content: '🛠️ **Gérer un point** — sélectionne-le :', components: [_pointsSelect('carte_manage_sel', pts)], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_manage_sel') {
      if (!_isDirection(interaction.member)) { await interaction.update({ content: '🔒 Réservé à la Direction.', components: [] }); return true; }
      const p = (loadDB().carte?.points || []).find(x => x.id === interaction.values[0]);
      if (!p) { await interaction.update({ content: '❌ Point introuvable.', components: [] }); return true; }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`carte_edit::${p.id}`).setLabel('Modifier').setEmoji('✏️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`carte_del::${p.id}`).setLabel('Supprimer').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      );
      await interaction.update({ content: `${_type(p.type).emoji} **${p.nom}**${p.case ? ` \`${p.case}\`` : ''} · ${_niv(p.niveau).emoji} ${_niv(p.niveau).label}\n${p.lieu || ''}${p.notes ? '\n📝 ' + p.notes : ''}`, components: [row] }); return true;
    }
    if (interaction.isButton?.() && id.startsWith('carte_edit::')) {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const p = (loadDB().carte?.points || []).find(x => x.id === id.split('::')[1]);
      if (!p) { await interaction.reply({ content: '❌ Point introuvable.', flags: MessageFlags.Ephemeral }); return true; }
      await interaction.showModal(_formModal(`carte_editmodal::${p.id}`, p.type, p.niveau, p)); return true;
    }
    if (interaction.isModalSubmit?.() && id.startsWith('carte_editmodal::')) {
      const db = loadDB(); const p = (db.carte?.points || []).find(x => x.id === id.split('::')[1]);
      if (!p) { await interaction.reply({ content: '❌ Point introuvable.', flags: MessageFlags.Ephemeral }); return true; }
      const nom = (interaction.fields.getTextInputValue('nom') || '').trim().slice(0, 100); if (nom) p.nom = nom;
      p.region = (interaction.fields.getTextInputValue('region') || '').trim().slice(0, 40) || p.region;
      const caseStr = (interaction.fields.getTextInputValue('case') || '').trim().toUpperCase().replace(/\s+/g, '');
      p.case = /^[A-L]\d{1,2}$/.test(caseStr) ? caseStr : '';
      p.lieu = (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200);
      p.notes = (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500);
      saveDB(db); await installerPanel(interaction.guild).catch(() => {});
      await interaction.reply({ content: `✏️ Point **${p.nom}** mis à jour.`, flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isButton?.() && id.startsWith('carte_del::')) {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const db = loadDB(); const c = _ensure(db); const pid = id.split('::')[1];
      const p = c.points.find(x => x.id === pid); c.points = c.points.filter(x => x.id !== pid); saveDB(db);
      await installerPanel(interaction.guild).catch(() => {});
      await interaction.update({ content: `🗑️ Point **${p?.nom || pid}** supprimé.`, components: [] }); return true;
    }
  } catch (e) {
    console.log('❌ carte routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur sur la carte.', flags: MessageFlags.Ephemeral }); else if (interaction.deferred) await interaction.editReply({ content: '❌ Erreur sur la carte.' }); } catch {}
    return true;
  }
  return false;
}

// Capture auto de l'image de fond quand un membre poste une image dans le salon carte
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot || message.channel?.id !== CARTE_CHANNEL_ID) return false;
    if (![...(message.attachments?.values() || [])].some(_estImage)) return false;
    const ok = await capterCarteFond(message.guild, message);
    if (ok) { await message.react('🗺️').catch(() => {}); await installerPanel(message.guild).catch(() => {}); }
    return false; // on ne consomme pas le message (il reste comme carte de fond)
  } catch { return false; }
}

module.exports = { init, installerPanel, routeInteraction, onMessage, capterCarteFond, CARTE_CHANNEL_ID };
