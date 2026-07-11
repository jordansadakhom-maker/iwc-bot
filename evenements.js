// ───────────────────────────────────────────────────────────────────────────
//  evenements.js — Événements HRP de La Confrérie
//   • Panneau « 🎉 ÉVÉNEMENTS » + bouton « ➕ Proposer un événement ».
//   • Activités : 🎬 Soirée film · 🎮 Soirée jeux (extensible).
//   • Carte d'événement avec RSVP (✅ Présent / ❓ Peut-être / ❌ Absent) en direct.
//   • Ping d'un rôle à la création (configurable via ⚙️).
//   • Tout est préfixé evt_ — module isolé.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estGestion(member) { if (global.aAccesTotal?.(member)) return true; try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const ACTIVITES = {
  film: { emoji: '🎬', label: 'Soirée film' },
  jeux: { emoji: '🎮', label: 'Soirée jeux' },
};

function _store(db) { if (!db.evenements) db.evenements = {}; if (!db.evenements.list) db.evenements.list = {}; return db.evenements; }
function _now() { return Date.now(); }

function _panelPayload() {
  const e = new EmbedBuilder().setColor(0x9B59B6).setTitle('🎉 ÉVÉNEMENTS — LA CONFRÉRIE')
    .setDescription([
      '*Les moments hors-RP de la Confrérie : on se retrouve, on décompresse, on rigole.*',
      '',
      'Clique sur **➕ Proposer un événement**, choisis l\'activité (🎬 film, 🎮 jeux…), donne la date et l\'heure.',
      'Chacun indique ensuite s\'il est **✅ présent**, **❓ peut-être** ou **❌ absent** — en un clic.',
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • Événements' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('evt_new').setLabel('Proposer un événement').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('evt_config').setLabel('⚙️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [row] };
}

function _eventEmbed(ev) {
  const a = ACTIVITES[ev.type] || { emoji: '🎉', label: ev.type };
  const fmt = arr => arr.length ? arr.map(id => `<@${id}>`).join(' ') : '—';
  return new EmbedBuilder().setColor(0x9B59B6)
    .setTitle(`${a.emoji} ${ev.titre}`)
    .setDescription(ev.description ? ev.description.slice(0, 1500) : '*Pas de description.*')
    .addFields(
      { name: '🎲 Activité', value: a.label, inline: true },
      { name: '🗓️ Date', value: ev.date || '—', inline: true },
      { name: '🕐 Heure', value: ev.heure || '—', inline: true },
      { name: `✅ Présents (${ev.rsvp.yes.length})`, value: fmt(ev.rsvp.yes).slice(0, 1024), inline: false },
      { name: `❓ Peut-être (${ev.rsvp.maybe.length})`, value: fmt(ev.rsvp.maybe).slice(0, 1024), inline: true },
      { name: `❌ Absents (${ev.rsvp.no.length})`, value: fmt(ev.rsvp.no).slice(0, 1024), inline: true },
    )
    .setFooter({ text: `Organisé par ${ev.orgNom} • La Confrérie` })
    .setTimestamp(ev.createdAt);
}
function _eventButtons(id) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`evt_yes::${id}`).setLabel('Présent').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`evt_maybe::${id}`).setLabel('Peut-être').setEmoji('❓').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`evt_no::${id}`).setLabel('Absent').setEmoji('❌').setStyle(ButtonStyle.Danger),
  );
}

async function installerPanel(guild, channel) {
  try {
    const ch = channel || (loadDB().evenements?.panelChannelId ? await guild.channels.fetch(loadDB().evenements.panelChannelId).catch(() => null) : null);
    if (!ch?.send) return null;
    const db = loadDB(); const st = _store(db);
    const me = guild.client.user.id;
    const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    let panel = msgs ? [...msgs.values()].find(m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('ÉVÉNEMENTS')) : null;
    const payload = _panelPayload();
    if (panel) { await panel.edit(payload).catch(() => {}); }
    else { panel = await ch.send(payload).catch(() => null); if (panel) await panel.pin().catch(() => {}); }
    if (panel) { st.panelChannelId = ch.id; st.panelMsgId = panel.id; saveDB(db); }
    return panel;
  } catch (e) { console.log('⚠️ evenements installerPanel:', e.message); return null; }
}

async function _refreshCard(client, ev) {
  try {
    const ch = await client.channels.fetch(ev.channelId).catch(() => null); if (!ch) return;
    const msg = await ch.messages.fetch(ev.msgId).catch(() => null); if (!msg) return;
    await msg.edit({ embeds: [_eventEmbed(ev)], components: [_eventButtons(ev.id)] }).catch(() => {});
  } catch {}
}

const evenementsCommands = [
  new SlashCommandBuilder().setName('evenements-installer').setDescription('🎉 Poser le panneau des événements dans CE salon (Direction)'),
];

async function routeInteraction(interaction) {
  try {
    // Commande d'installation
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'evenements-installer') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const p = await installerPanel(interaction.guild, interaction.channel);
      await interaction.reply({ content: p ? '✅ Panneau des événements installé dans ce salon.' : '⚠️ Installation impossible (permissions ?).', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    const cid = interaction.customId || '';
    if (!cid.startsWith('evt_')) return false;

    // ➕ Proposer un événement → choix de l'activité
    if (interaction.isButton?.() && cid === 'evt_new') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 La création d\'événements est réservée à l\'équipe.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('evt_type').setPlaceholder('Quelle activité ?')
        .addOptions(Object.entries(ACTIVITES).map(([k, a]) => ({ label: a.label, value: k, emoji: a.emoji })));
      await interaction.reply({ content: '🎲 Choisis le type d\'événement :', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Activité choisie → formulaire
    if (interaction.isStringSelectMenu?.() && cid === 'evt_type') {
      const type = interaction.values[0]; const a = ACTIVITES[type] || { label: type };
      const modal = new ModalBuilder().setCustomId(`evt_modal::${type}`).setTitle(`${a.label}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre de l\'événement').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Ex : Soirée film western, tournoi Gartic…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(30).setPlaceholder('Ex : samedi 28/06')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20).setPlaceholder('Ex : 21h00')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description / détails').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Ce qu\'on fait, ce qu\'il faut prévoir…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    // Formulaire soumis → carte d'événement + ping
    if (interaction.isModalSubmit?.() && cid.startsWith('evt_modal::')) {
      const type = cid.split('::')[1] || 'jeux';
      const db = loadDB(); const st = _store(db);
      const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      const ev = {
        id, type,
        titre: interaction.fields.getTextInputValue('titre').trim(),
        date: (interaction.fields.getTextInputValue('date') || '').trim(),
        heure: (interaction.fields.getTextInputValue('heure') || '').trim(),
        description: (interaction.fields.getTextInputValue('description') || '').trim(),
        orgId: interaction.user.id, orgNom: interaction.member?.displayName || interaction.user.username,
        rsvp: { yes: [], maybe: [], no: [] },
        channelId: null, msgId: null, createdAt: _now(),
      };
      const ch = st.panelChannelId ? await interaction.client.channels.fetch(st.panelChannelId).catch(() => null) : interaction.channel;
      if (!ch?.send) { await interaction.reply({ content: '⚠️ Salon des événements introuvable — relance /evenements-installer.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const content = st.pingRoleId ? `<@&${st.pingRoleId}> — 🎉 nouvel événement !` : '🎉 nouvel événement !';
      const msg = await ch.send({ content, embeds: [_eventEmbed(ev)], components: [_eventButtons(id)], allowedMentions: { roles: st.pingRoleId ? [st.pingRoleId] : [] } }).catch(() => null);
      if (msg) { ev.channelId = ch.id; ev.msgId = msg.id; }
      st.list[id] = ev; saveDB(db);
      await interaction.reply({ content: msg ? `✅ Événement publié${msg ? ` : ${msg.url}` : ''}.` : '⚠️ Publication impossible.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // RSVP
    if (interaction.isButton?.() && (cid.startsWith('evt_yes::') || cid.startsWith('evt_maybe::') || cid.startsWith('evt_no::'))) {
      const [tag, id] = cid.split('::');
      const choix = tag === 'evt_yes' ? 'yes' : tag === 'evt_maybe' ? 'maybe' : 'no';
      const db = loadDB(); const st = _store(db); const ev = st.list[id];
      if (!ev) { await interaction.reply({ content: '⚠️ Événement introuvable (peut-être trop ancien).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const uid = interaction.user.id;
      for (const k of ['yes', 'maybe', 'no']) ev.rsvp[k] = ev.rsvp[k].filter(x => x !== uid);
      ev.rsvp[choix].push(uid);
      saveDB(db);
      await interaction.update({ embeds: [_eventEmbed(ev)], components: [_eventButtons(id)] }).catch(() => { interaction.deferUpdate?.().catch(() => {}); });
      return true;
    }
    // ⚙️ Config → choisir le rôle à pinger
    if (interaction.isButton?.() && cid === 'evt_config') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const sel = new RoleSelectMenuBuilder().setCustomId('evt_setrole').setPlaceholder('Rôle à prévenir à chaque événement').setMinValues(1).setMaxValues(1);
      await interaction.reply({ content: '⚙️ Choisis le rôle pingé à la création d\'un événement :', components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isRoleSelectMenu?.() && cid === 'evt_setrole') {
      const db = loadDB(); const st = _store(db); st.pingRoleId = interaction.values[0]; saveDB(db);
      await interaction.update({ content: `✅ Rôle prévenu à chaque événement : <@&${st.pingRoleId}>.`, components: [] }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 40060].includes(e?.code)) return true;
    console.log('❌ evenements routeInteraction:', e.message);
    return true;
  }
}

module.exports = { installerPanel, routeInteraction, evenementsCommands };
