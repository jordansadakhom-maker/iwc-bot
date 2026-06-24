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

// Brouillons de placement (en mémoire) : userId -> { type, niveau, nom, region, lieu, notes, col, row, at }
const _drafts = new Map();
function _purgeDrafts() { const now = Date.now(); for (const [k, v] of _drafts) if (now - (v.at || 0) > 3600000) _drafts.delete(k); }
function _pushPoint(member, d, caseStr) {
  const db = loadDB(); const c = _ensure(db);
  c.points.push({ id: _id(), type: d.type, niveau: d.niveau, nom: d.nom, region: d.region || 'Autre', case: caseStr || '', lieu: d.lieu || '', notes: d.notes || '', parId: member.id, parNom: member.displayName || member.user?.username || '—', createdAt: new Date().toISOString() });
  saveDB(db);
}
function _placementRows(d) {
  const cols = Array.from({ length: COLS }, (_, i) => String.fromCharCode(65 + i));
  const rowsN = Array.from({ length: ROWS }, (_, i) => String(i + 1));
  return [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_col').setPlaceholder(d.col ? `Colonne : ${d.col}` : 'Colonne (A–L)…').addOptions(cols.map(c => ({ label: 'Colonne ' + c, value: c, default: d.col === c })))),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('carte_row').setPlaceholder(d.row ? `Ligne : ${d.row}` : 'Ligne (1–8)…').addOptions(rowsN.map(r => ({ label: 'Ligne ' + r, value: r, default: d.row === r })))),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('carte_place').setLabel('Placer ici').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('carte_place_none').setLabel('Sans position').setEmoji('📍').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

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
    const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
    const r = await fetch(att.url, { signal: ctrl.signal }).catch(() => null); clearTimeout(t);
    if (!r || !r.ok) return null;
    return Buffer.from(await r.arrayBuffer());
  } catch { return null; }
}
function _timeout(ms) { return new Promise(r => setTimeout(() => r(null), ms)); }
function _caseToXY(caseStr, W, H) {
  if (!caseStr) return null;
  const m = String(caseStr).trim().match(/^([A-La-l])\s*(\d{1,2})$/);
  if (!m) return null;
  const col = m[1].toUpperCase().charCodeAt(0) - 65, row = parseInt(m[2], 10) - 1;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { x: Math.round((col + 0.5) * (W / COLS)), y: Math.round((row + 0.5) * (H / ROWS)) };
}
// Position d'un point en POURCENTAGE (web + rendu). x/y prioritaires, sinon la case.
function _ptPct(p) {
  if (typeof p.x === 'number' && typeof p.y === 'number') return { x: p.x, y: p.y };
  if (!p.case) return null;
  const m = String(p.case).trim().match(/^([A-La-l])\s*(\d{1,2})$/);
  if (!m) return null;
  const col = m[1].toUpperCase().charCodeAt(0) - 65, row = parseInt(m[2], 10) - 1;
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return null;
  return { x: (col + 0.5) / COLS * 100, y: (row + 0.5) / ROWS * 100 };
}
function _ptXY(p, W, H) { const pc = _ptPct(p); return pc ? { x: Math.round(pc.x / 100 * W), y: Math.round(pc.y / 100 * H) } : null; }
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
  try { if (img.bitmap.width > 1280) img.scaleToFit(1280, 1280); } catch {}
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
    n++; const xy = _ptXY(p, W, H); legend.push({ n, p, placed: !!xy });
    if (!xy) continue;
    _marker(img, xy.x, xy.y, rad, _type(p.type).col);
    if (fNum) img.print(fNum, xy.x - (n > 9 ? 9 : 4), xy.y - 9, String(n));
  }
  try { img.quality(82); } catch {}
  const buf = await img.getBufferAsync(Jimp.MIME_JPEG).catch(() => null);
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
      '➕ **Ajouter** — type → niveau → infos → **choisis la position** (colonne + ligne) sur la carte.',
      '🔍 **Consulter** — la carte s\'affiche avec les marqueurs que ton accréditation permet.',
      '🧭 **Voir la grille** — la carte quadrillée pour repérer les cases.', '',
      '🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction)', '',
      `📊 **${pts.length} point(s)** :`, lignes,
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • Carte • rien ne se perd' });
}
function _panelRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('carte_add').setLabel('Ajouter un point').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('carte_view').setLabel('Consulter').setEmoji('🔍').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('carte_grille').setLabel('Voir la grille').setEmoji('🧭').setStyle(ButtonStyle.Secondary),
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
  const rendered = await Promise.race([_renderMap(interaction.guild, pts), _timeout(13000)]);
  if (rendered) {
    const num = rendered.legend.map(L => `**${L.n}.** ${_type(L.p.type).emoji} ${L.p.nom}${L.p.case ? ` \`${L.p.case.toUpperCase()}\`` : ' *(sans case)*'} ${_niv(L.p.niveau).emoji}`).join('\n').slice(0, 3900);
    const e = new EmbedBuilder().setColor(0x8B5A2B).setTitle(titre).setDescription(num).setImage('attachment://carte.jpg').setFooter({ text: `La Confrérie • ${pts.length} point(s) · selon ton accréditation` });
    return interaction.editReply({ embeds: [e], files: [new AttachmentBuilder(rendered.buf, { name: 'carte.jpg' })] });
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
      const draft = { type, niveau, nom, region: (interaction.fields.getTextInputValue('region') || '').trim().slice(0, 40) || 'Autre', lieu: (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200), notes: (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500) };
      // Case déjà tapée → on enregistre direct
      if (/^[A-L]\d{1,2}$/.test(caseStr)) {
        _pushPoint(interaction.member, draft, caseStr);
        await installerPanel(interaction.guild).catch(() => {});
        await interaction.reply({ content: `✅ Point ajouté : ${_type(type).emoji} **${nom}** (case \`${caseStr}\`) · ${_niv(niveau).emoji} ${_niv(niveau).label}.`, flags: MessageFlags.Ephemeral }); return true;
      }
      // Sinon : placement guidé (colonne + ligne sur la carte quadrillée)
      _purgeDrafts(); _drafts.set(interaction.user.id, { ...draft, at: Date.now() });
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const rendered = await Promise.race([_renderMap(interaction.guild, []), _timeout(13000)]);
      const payload = { content: `➕ **${nom}** — choisis sa **position** (colonne + ligne) puis **Placer ici** :`, components: _placementRows(_drafts.get(interaction.user.id)) };
      if (rendered) { payload.embeds = [new EmbedBuilder().setColor(0x8B5A2B).setImage('attachment://grille.jpg')]; payload.files = [new AttachmentBuilder(rendered.buf, { name: 'grille.jpg' })]; }
      await interaction.editReply(payload); return true;
    }
    if (interaction.isStringSelectMenu?.() && (id === 'carte_col' || id === 'carte_row')) {
      const d = _drafts.get(interaction.user.id);
      if (!d) { await interaction.update({ content: '⏱️ Session expirée — relance ➕ Ajouter.', components: [], embeds: [], files: [] }); return true; }
      if (id === 'carte_col') d.col = interaction.values[0]; else d.row = interaction.values[0];
      await interaction.update({ content: `📍 Position : **${d.col || '?'}${d.row || '?'}** — ajuste si besoin, puis **Placer ici**.`, components: _placementRows(d) }); return true;
    }
    if (interaction.isButton?.() && (id === 'carte_place' || id === 'carte_place_none')) {
      const d = _drafts.get(interaction.user.id);
      if (!d) { await interaction.update({ content: '⏱️ Session expirée.', components: [], embeds: [], files: [] }); return true; }
      if (id === 'carte_place' && (!d.col || !d.row)) { await interaction.reply({ content: '❌ Choisis d\'abord une **colonne** ET une **ligne** (ou « Sans position »).', flags: MessageFlags.Ephemeral }); return true; }
      const caseStr = id === 'carte_place' ? d.col + d.row : '';
      _pushPoint(interaction.member, d, caseStr); _drafts.delete(interaction.user.id);
      await installerPanel(interaction.guild).catch(() => {});
      const txt = caseStr ? `✅ **${d.nom}** placé en case \`${caseStr}\` · ${_niv(d.niveau).emoji} ${_niv(d.niveau).label}. (🔍 Consulter pour le voir sur la carte)` : `✅ **${d.nom}** enregistré (sans position). Tu peux lui donner une case via 🛠️ Gérer.`;
      await interaction.update({ content: txt, components: [], embeds: [], files: [] }); return true;
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
      const rendered = await Promise.race([_renderMap(interaction.guild, []), _timeout(13000)]);
      if (!rendered) return interaction.editReply({ content: 'ℹ️ Aucune carte de fond trouvée. Poste une image de la carte dans ce salon, puis réessaie.' });
      const e = new EmbedBuilder().setColor(0x8B5A2B).setTitle('🧭 Carte quadrillée').setDescription('Repère ta **case** (colonne A–L + ligne 1–8) pour ajouter un point au bon endroit.').setImage('attachment://grille.jpg');
      return interaction.editReply({ embeds: [e], files: [new AttachmentBuilder(rendered.buf, { name: 'grille.jpg' })] });
    }
    // 🌐 Carte web cliquable : génère un lien personnel selon l'accréditation
    if (interaction.isButton?.() && id === 'carte_web') {
      const { tok, level } = creerToken(interaction.member);
      const envHost = process.env.RENDER_EXTERNAL_HOSTNAME ? `https://${process.env.RENDER_EXTERNAL_HOSTNAME}` : '';
      const base = (process.env.RENDER_EXTERNAL_URL || process.env.PUBLIC_URL || process.env.BASE_URL || envHost || loadDB().carte?.baseUrl || '').replace(/\/$/, '');
      if (!base) { await interaction.reply({ content: '⚠️ L\'URL publique du bot n\'est pas encore connue. Ouvre une fois l\'adresse du bot dans un navigateur (la page d\'accueil Render), puis re-clique sur **🌐 Ouvrir la carte**. *(Le bot la détecte tout seul à la première visite.)*', flags: MessageFlags.Ephemeral }); return true; }
      const niv = _niv(level);
      await interaction.reply({ content: `🌐 **Ta carte interactive** — accès ${niv.emoji} **${niv.label}**\n${base}/carte?k=${tok}\n\n🖱️ *Clique sur la carte pour ajouter un point. Lien personnel, valable 24h.*`, flags: MessageFlags.Ephemeral });
      return true;
    }
    // ⚙️ Définir l'URL publique du bot à la main (Direction) — fiable à 100 %
    if (interaction.isButton?.() && id === 'carte_seturl') {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const modal = new ModalBuilder().setCustomId('carte_url_modal').setTitle('🌐 URL publique du bot');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('url').setLabel('Adresse complète (https://…)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://mon-bot.onrender.com').setValue(loadDB().carte?.baseUrl || '')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit?.() && id === 'carte_url_modal') {
      if (!_isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      let url = (interaction.fields.getTextInputValue('url') || '').trim().replace(/\s+/g, '').replace(/\/$/, '');
      if (!/^https:\/\/[a-z0-9.-]+\.[a-z]{2,}/i.test(url)) { await interaction.reply({ content: '❌ URL invalide. Elle doit ressembler à `https://mon-bot.onrender.com`.', flags: MessageFlags.Ephemeral }); return true; }
      const db = loadDB(); _ensure(db); db.carte.baseUrl = url; saveDB(db);
      await interaction.reply({ content: `✅ URL enregistrée : ${url}\nClique maintenant sur **🌐 Ouvrir la carte (cliquable)**.`, flags: MessageFlags.Ephemeral }); return true;
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

// ── Carte web cliquable (servie par le serveur HTTP du bot) ──────
function _rndTok() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 8); }
function creerToken(member) {
  const level = _isDirection(member) ? 'confidentiel' : (_isMembre(member) ? 'membre' : 'public');
  const db = loadDB(); const c = _ensure(db); if (!c.tokens) c.tokens = {};
  const now = Date.now();
  for (const [t, v] of Object.entries(c.tokens)) if (!v?.exp || v.exp < now) delete c.tokens[t];
  const tok = _rndTok();
  c.tokens[tok] = { level, userId: member.id, exp: now + 24 * 3600 * 1000 };
  saveDB(db);
  return { tok, level };
}
function _tokInfo(tok) { const v = (loadDB().carte?.tokens || {})[tok]; if (!v || (v.exp && v.exp < Date.now())) return null; return v; }
function _canSee(level, niveau) {
  if (niveau === 'confidentiel') return level === 'confidentiel';
  if (niveau === 'membre') return level === 'membre' || level === 'confidentiel';
  return true;
}
function _niveauxAutorises(level) { return NIVEAUX.filter(n => _canSee(level, n.key)); }

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
      const pts = (loadDB().carte?.points || []).filter(p => _canSee(level, p.niveau)).map(p => { const pc = _ptPct(p); return { id: p.id, type: p.type, niveau: p.niveau, nom: p.nom, lieu: p.lieu || '', notes: p.notes || '', region: p.region || '', x: pc ? pc.x : null, y: pc ? pc.y : null }; });
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ level, types: TYPES.map(t => ({ key: t.key, label: t.label, emoji: t.emoji })), niveaux: _niveauxAutorises(level), points: pts }));
      return true;
    }
    if (u.pathname === '/carte/add' && req.method === 'POST') {
      if (!level) { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => {
        try {
          const d = JSON.parse(body || '{}');
          const nom = String(d.nom || '').trim().slice(0, 100); if (!nom) { res.writeHead(400); res.end('{"error":"nom"}'); return; }
          const x = Math.max(0, Math.min(100, Number(d.x))); const y = Math.max(0, Math.min(100, Number(d.y)));
          if (!isFinite(x) || !isFinite(y)) { res.writeHead(400); res.end('{"error":"xy"}'); return; }
          const type = TYPES.find(t => t.key === d.type) ? d.type : 'autre';
          let niveau = ['public', 'membre', 'confidentiel'].includes(d.niveau) ? d.niveau : 'public';
          if (!_canSee(level, niveau)) niveau = level; // ne peut pas créer un point qu'il ne verrait pas
          const db = loadDB(); const c = _ensure(db);
          c.points.push({ id: _id(), type, niveau, nom, region: String(d.region || '').slice(0, 40), case: '', x, y, lieu: String(d.lieu || '').slice(0, 200), notes: String(d.notes || '').slice(0, 500), parId: info.userId, parNom: '(carte web)', createdAt: new Date().toISOString() });
          saveDB(db);
          res.writeHead(200, { 'Content-Type': 'application/json' }); res.end('{"ok":true}');
          if (guild) installerPanel(guild).catch(() => {});
        } catch { res.writeHead(500); res.end('{}'); }
      });
      return true;
    }
    if (u.pathname === '/carte/del' && req.method === 'POST') {
      if (level !== 'confidentiel') { res.writeHead(403); res.end('{}'); return true; }
      let body = ''; req.on('data', d => body += d); req.on('end', () => {
        try { const d = JSON.parse(body || '{}'); const db = loadDB(); const c = _ensure(db); c.points = c.points.filter(p => p.id !== d.id); saveDB(db); res.writeHead(200); res.end('{"ok":true}'); if (guild) installerPanel(guild).catch(() => {}); }
        catch { res.writeHead(500); res.end('{}'); }
      });
      return true;
    }
    if (u.pathname === '/carte') {
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(level ? _pageHTML(tok, level) : '<!doctype html><meta charset="utf-8"><body style="font-family:sans-serif;background:#1a1410;color:#e8d8c0;text-align:center;padding:60px"><h2>🔒 Lien expiré ou invalide</h2><p>Génère un nouveau lien depuis Discord (bouton « 🌐 Ouvrir la carte »).</p></body>');
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
header b{color:#d9a441}.lvl{font-size:13px;opacity:.85}
.hint{font-size:13px;opacity:.8;margin-left:auto}
#wrap{position:relative;width:100%;max-width:2000px;margin:0 auto}
#map{display:block;width:100%;height:auto;cursor:crosshair}
.pin{position:absolute;transform:translate(-50%,-50%);width:22px;height:22px;border-radius:50%;border:2px solid #fff;box-shadow:0 0 4px #000;cursor:pointer;display:flex;align-items:center;justify-content:center;font-size:12px}
.pop{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);background:#241a12;border:1px solid #5a4632;border-radius:10px;padding:16px;width:330px;max-width:92vw;z-index:50;box-shadow:0 8px 40px #000a}
.pop h3{margin:0 0 8px;color:#d9a441}.pop label{display:block;font-size:12px;margin:8px 0 2px;opacity:.85}
.pop input,.pop select,.pop textarea{width:100%;padding:7px;background:#15110c;color:#e8d8c0;border:1px solid #5a4632;border-radius:6px;font-family:inherit}
.pop .row{display:flex;gap:8px;margin-top:12px}.pop button{flex:1;padding:9px;border:0;border-radius:6px;cursor:pointer;font-weight:bold}
.bok{background:#3a7d3a;color:#fff}.bno{background:#5a4632;color:#e8d8c0}.bdel{background:#a33;color:#fff}
#mask{position:fixed;inset:0;background:#0008;z-index:40;display:none}
.tag{font-size:11px;padding:2px 6px;border-radius:10px;background:#3a2c1e;margin-right:4px}
</style></head><body>
<header><b>🗺️ Carte — La Confrérie</b><span class="lvl">Accès : ${level === 'confidentiel' ? '🔴 Confidentiel' : level === 'membre' ? '🟡 Membre' : '🟢 Public'}</span><span class="hint">🖱️ Clique sur la carte pour ajouter un point</span></header>
<div id="wrap"><img id="map" src="/carte/image?k=${tok}" alt="carte"></div>
<div id="mask"></div>
<script>
var TOK=${JSON.stringify(tok)},LVL=${JSON.stringify(level)},DATA={types:[],niveaux:[],points:[]};
var wrap=document.getElementById('wrap'),mapImg=document.getElementById('map'),mask=document.getElementById('mask');
function esc(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function colorFor(t){var m={recolte:'#3ca03c',vendeur:'#2870c8',illegal:'#c82828',chasse:'#965a28',peche:'#28a0b4',planque:'#783ca0',autre:'#5a5a5a'};return m[t]||'#5a5a5a';}
function emojiFor(t){var o=DATA.types.find(function(x){return x.key===t;});return o?o.emoji:'📌';}
function load(){fetch('/carte/data?k='+TOK).then(function(r){return r.json();}).then(function(j){if(j.error){document.body.innerHTML='<h2 style=text-align:center;margin-top:60px>Lien expiré</h2>';return;}DATA=j;render();});}
function render(){document.querySelectorAll('.pin').forEach(function(p){p.remove();});DATA.points.forEach(function(p){if(p.x==null)return;var d=document.createElement('div');d.className='pin';d.style.left=p.x+'%';d.style.top=p.y+'%';d.style.background=colorFor(p.type);d.textContent=emojiFor(p.type);d.title=p.nom+(p.lieu?(' — '+p.lieu):'');d.onclick=function(e){e.stopPropagation();showInfo(p);};wrap.appendChild(d);});}
function closePop(){var e=document.querySelector('.pop');if(e)e.remove();mask.style.display='none';}
mask.onclick=closePop;
function showInfo(p){closePop();mask.style.display='block';var n=DATA.niveaux.find(function(x){return x.key===p.niveau;});var box=document.createElement('div');box.className='pop';var del=(LVL==='confidentiel')?'<button class=bdel id=bdel>🗑️ Supprimer</button>':'';box.innerHTML='<h3>'+emojiFor(p.type)+' '+esc(p.nom)+'</h3><div><span class=tag>'+esc((DATA.types.find(function(x){return x.key===p.type;})||{}).label||p.type)+'</span><span class=tag>'+esc(n?n.label:p.niveau)+'</span></div>'+(p.region?'<p>📍 '+esc(p.region)+'</p>':'')+(p.lieu?'<p>'+esc(p.lieu)+'</p>':'')+(p.notes?'<p>📝 '+esc(p.notes)+'</p>':'')+'<div class=row>'+del+'<button class=bno id=bclose>Fermer</button></div>';document.body.appendChild(box);document.getElementById('bclose').onclick=closePop;if(del)document.getElementById('bdel').onclick=function(){fetch('/carte/del?k='+TOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:p.id})}).then(function(){closePop();load();});};}
mapImg.addEventListener('click',function(e){var r=mapImg.getBoundingClientRect();var x=(e.clientX-r.left)/r.width*100;var y=(e.clientY-r.top)/r.height*100;showAdd(x,y);});
function showAdd(x,y){closePop();mask.style.display='block';var topts=DATA.types.map(function(t){return '<option value='+t.key+'>'+t.emoji+' '+t.label+'</option>';}).join('');var nopts=DATA.niveaux.map(function(n){return '<option value='+n.key+'>'+n.label+'</option>';}).join('');var box=document.createElement('div');box.className='pop';box.innerHTML='<h3>➕ Nouveau point</h3><label>Type</label><select id=f_type>'+topts+'</select><label>Niveau d\\'accès</label><select id=f_niv>'+nopts+'</select><label>Nom *</label><input id=f_nom placeholder="Ex: Champ de coca"><label>Lieu précis</label><input id=f_lieu placeholder="Ex: au nord de Valentine"><label>Notes</label><textarea id=f_notes rows=2></textarea><div class=row><button class=bok id=fadd>Placer ici</button><button class=bno id=fcancel>Annuler</button></div>';document.body.appendChild(box);document.getElementById('fcancel').onclick=closePop;document.getElementById('fadd').onclick=function(){var nom=document.getElementById('f_nom').value.trim();if(!nom){alert('Le nom est obligatoire');return;}fetch('/carte/add?k='+TOK,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({x:x,y:y,type:document.getElementById('f_type').value,niveau:document.getElementById('f_niv').value,nom:nom,lieu:document.getElementById('f_lieu').value,notes:document.getElementById('f_notes').value})}).then(function(r){return r.json();}).then(function(){closePop();load();});};}
if(mapImg.complete)load();else mapImg.onload=load;mapImg.onerror=load;
</script></body></html>`;
}

module.exports = { init, installerPanel, routeInteraction, onMessage, capterCarteFond, httpHandle, CARTE_CHANNEL_ID };
