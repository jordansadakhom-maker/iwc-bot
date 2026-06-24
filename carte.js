// ═══════════════════════════════════════════════════════════════
//  carte.js — Carte interactive (registre de points d'intérêt)
//  • Ajouter des points : récolte, vendeur, mission illégale, chasse,
//    pêche, planque… avec un niveau d'accréditation (Public / Membre /
//    Confidentiel).
//  • Consulter : filtré par type ET par accréditation (un point
//    confidentiel n'apparaît qu'à la Direction).
//  • Persistant (db.carte.points) → rien ne se perd.
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
  { key: 'public',       label: 'Public (tout le monde)', emoji: '🟢' },
  { key: 'membre',       label: 'Membre (Confrérie)', emoji: '🟡' },
  { key: 'confidentiel', label: 'Confidentiel (Direction)', emoji: '🔴' },
];
const REGIONS = ['Ambarino', 'New Hanover', 'Lemoyne', 'West Elizabeth', 'New Austin', 'Guarma', 'Autre'];

const _type = k => TYPES.find(t => t.key === k) || { key: k, label: k, emoji: '📌' };
const _niv = k => NIVEAUX.find(n => n.key === k) || { key: k, label: k, emoji: '⚪' };

// Vérifs de rôle injectées depuis index.js (réutilise la logique canonique)
let _isMembre = () => true, _isDirection = () => false;
function init(opts) { if (opts?.isMembre) _isMembre = opts.isMembre; if (opts?.isDirection) _isDirection = opts.isDirection; }
function _peutVoir(member, niveau) {
  if (niveau === 'membre') return _isMembre(member) || _isDirection(member);
  if (niveau === 'confidentiel') return _isDirection(member);
  return true; // public
}
function _ensure(db) { if (!db.carte) db.carte = {}; if (!Array.isArray(db.carte.points)) db.carte.points = []; return db.carte; }
function _id() { return 'PT-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }

function _panelEmbed(db) {
  const pts = db.carte?.points || [];
  const parType = {};
  for (const p of pts) parType[p.type] = (parType[p.type] || 0) + 1;
  const lignes = TYPES.map(t => `${t.emoji} ${t.label} — **${parType[t.key] || 0}**`).join('\n');
  return new EmbedBuilder().setColor(0x8B5A2B).setTitle('🗺️ CARTE INTERACTIVE — La Confrérie')
    .setDescription([
      '*Le registre des lieux qui comptent : récoltes, vendeurs, coups, chasse, pêche, planques…*',
      '',
      '**Comment ça marche**',
      '➕ **Ajouter un point** — enregistre un lieu avec son niveau d\'accès.',
      '🔍 **Consulter** — filtre par type ; tu ne vois que ce que ton accréditation permet.',
      '',
      '🟢 Public · 🟡 Membre · 🔴 Confidentiel (Direction)',
      '',
      `📊 **${pts.length} point(s)** enregistré(s) :`,
      lignes,
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • Carte • rien ne se perd' });
}
function _panelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('carte_add').setLabel('Ajouter un point').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('carte_view').setLabel('Consulter').setEmoji('🔍').setStyle(ButtonStyle.Primary),
  );
}
async function installerPanel(guild) {
  try {
    const ch = guild.channels.cache.get(CARTE_CHANNEL_ID) || await guild.channels.fetch(CARTE_CHANNEL_ID).catch(() => null);
    if (!ch?.send) return;
    const db = loadDB();
    const payload = { embeds: [_panelEmbed(db)], components: [_panelRow()] };
    let msg = null;
    if (db.cartePanelId) msg = await ch.messages.fetch(db.cartePanelId).catch(() => null);
    if (!msg) { const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null); msg = msgs ? [...msgs.values()].find(m => m.author?.id === guild.client.user.id && (m.embeds?.[0]?.title || '').includes('CARTE INTERACTIVE')) : null; }
    if (msg) { await msg.edit(payload).catch(() => {}); if (db.cartePanelId !== msg.id) { const d = loadDB(); d.cartePanelId = msg.id; saveDB(d); } }
    else { const sent = await ch.send(payload).catch(() => null); if (sent) { try { await sent.pin(); } catch {} const d = loadDB(); d.cartePanelId = sent.id; saveDB(d); } }
  } catch (e) { console.log('❌ carte installerPanel:', e.message); }
}

function _typeSelect(customId, ph) {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(customId).setPlaceholder(ph).addOptions(TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji })))
  );
}

async function _consulter(interaction, typeKey) {
  const db = loadDB();
  let pts = (db.carte?.points || []).filter(p => _peutVoir(interaction.member, p.niveau));
  if (typeKey && typeKey !== 'tout') pts = pts.filter(p => p.type === typeKey);
  if (!pts.length) {
    const m = { content: '📭 Aucun point accessible pour ce filtre (ou ton accréditation ne le permet pas).', flags: MessageFlags.Ephemeral };
    return interaction.deferred || interaction.replied ? interaction.editReply(m) : interaction.reply(m);
  }
  const byRegion = {};
  for (const p of pts) { (byRegion[p.region || 'Autre'] = byRegion[p.region || 'Autre'] || []).push(p); }
  const desc = Object.entries(byRegion).map(([reg, arr]) => {
    const lines = arr.map(p => {
      const t = _type(p.type); const n = _niv(p.niveau);
      const extra = p.notes ? ` · ${String(p.notes).slice(0, 70)}` : '';
      return `${t.emoji} **${p.nom}** — ${p.lieu || '—'}${extra} ${n.emoji}`;
    }).join('\n');
    return `📍 __${reg}__\n${lines}`;
  }).join('\n\n').slice(0, 4000);
  const titre = typeKey && typeKey !== 'tout' ? `${_type(typeKey).emoji} ${_type(typeKey).label}` : '🗺️ Tous les points accessibles';
  const e = new EmbedBuilder().setColor(0x8B5A2B).setTitle(titre).setDescription(desc).setFooter({ text: `La Confrérie • ${pts.length} point(s) · ton accréditation` }).setTimestamp();
  const m = { embeds: [e], flags: MessageFlags.Ephemeral };
  return interaction.deferred || interaction.replied ? interaction.editReply(m) : interaction.reply(m);
}

async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    // ➕ Ajouter : choix du type
    if (interaction.isButton?.() && id === 'carte_add') {
      await interaction.reply({ content: '➕ **Ajouter un point** — quel type ?', components: [_typeSelect('carte_type_sel', 'Choisis le type de point…')], flags: MessageFlags.Ephemeral });
      return true;
    }
    // Type choisi → choix du niveau d'accès
    if (interaction.isStringSelectMenu?.() && id === 'carte_type_sel') {
      const type = interaction.values[0];
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId(`carte_niv_sel::${type}`).setPlaceholder('Niveau d\'accès…').addOptions(NIVEAUX.map(n => ({ label: n.label, value: n.key, emoji: n.emoji })))
      );
      await interaction.update({ content: `➕ Type : **${_type(type).emoji} ${_type(type).label}**\nQui peut voir ce point ?`, components: [row] });
      return true;
    }
    // Niveau choisi → formulaire
    if (interaction.isStringSelectMenu?.() && id.startsWith('carte_niv_sel::')) {
      const type = id.split('::')[1]; const niveau = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`carte_modal::${type}::${niveau}`).setTitle(`${_type(type).label}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom du point').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Champ de coca, Vendeur d\'armes…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('region').setLabel('Région').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder(REGIONS.join(' · '))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu précis').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Au nord de Valentine, près de la rivière…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes (horaires, prix, dangers…)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
      );
      await interaction.showModal(modal);
      return true;
    }
    // Enregistrement du point
    if (interaction.isModalSubmit?.() && id.startsWith('carte_modal::')) {
      const [, type, niveau] = id.split('::');
      const nom = (interaction.fields.getTextInputValue('nom') || '').trim().slice(0, 100);
      if (!nom) { await interaction.reply({ content: '❌ Le nom est obligatoire.', flags: MessageFlags.Ephemeral }); return true; }
      let region = (interaction.fields.getTextInputValue('region') || '').trim();
      const regMatch = REGIONS.find(r => region && r.toLowerCase().includes(region.toLowerCase()) || (region && region.toLowerCase().includes(r.toLowerCase())));
      region = regMatch || (region ? region.slice(0, 40) : 'Autre');
      const point = {
        id: _id(), type, niveau, nom,
        region,
        lieu: (interaction.fields.getTextInputValue('lieu') || '').trim().slice(0, 200),
        notes: (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 500),
        parId: interaction.user.id, parNom: interaction.member?.displayName || interaction.user.username,
        createdAt: new Date().toISOString(),
      };
      const db = loadDB(); const c = _ensure(db); c.points.push(point); saveDB(db);
      await installerPanel(interaction.guild).catch(() => {});
      await interaction.reply({ content: `✅ Point ajouté : ${_type(type).emoji} **${nom}** (${region}) · accès ${_niv(niveau).emoji} ${_niv(niveau).label}.`, flags: MessageFlags.Ephemeral });
      return true;
    }
    // 🔍 Consulter : choix du type (ou tout)
    if (interaction.isButton?.() && id === 'carte_view') {
      const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder().setCustomId('carte_view_sel').setPlaceholder('Filtrer par type…').addOptions([
          { label: 'Tout afficher', value: 'tout', emoji: '🗺️' },
          ...TYPES.map(t => ({ label: t.label, value: t.key, emoji: t.emoji })),
        ])
      );
      await interaction.reply({ content: '🔍 **Consulter la carte** — choisis un filtre :', components: [row], flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'carte_view_sel') {
      await _consulter(interaction, interaction.values[0]);
      return true;
    }
  } catch (e) {
    console.log('❌ carte routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur sur la carte.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
  return false;
}

module.exports = { init, installerPanel, routeInteraction, CARTE_CHANNEL_ID };
