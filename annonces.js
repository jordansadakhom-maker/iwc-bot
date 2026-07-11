// ───────────────────────────────────────────────────────────────────────────
//  annonces.js — Annonces (avec catégorie RP + rappels) & Sondages natifs.
//   • Panneau « 📢 ANNONCES » → créer une annonce : catégorie RP, message,
//     date/heure (optionnel), ping d'un rôle, et rappels auto 1h / 30 min avant.
//   • Panneau « 📊 SONDAGES » → créer un sondage NATIF Discord (sans commande) + ping.
//   • Rappels vérifiés chaque minute via checkReminders() (heure interprétée en
//     Europe/Paris, affichage avec timestamps Discord qui s'adaptent à chacun).
//   • Tout est préfixé ann_ / poll_ — module isolé, ne touche à rien d'autre.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function estGestion(member) { if (global.aAccesTotal?.(member)) return true; try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

// ─── Catégories RP proposées (modifiables) ───
const CATEGORIES_RP = [
  { key: 'event',    label: 'Événement RP',                emoji: '🤠' },
  { key: 'braquage', label: 'Braquage / Coup',             emoji: '💰' },
  { key: 'reunion',  label: 'Réunion / Briefing',          emoji: '🤝' },
  { key: 'conflit',  label: 'Conflit / Guerre de gang',    emoji: '⚔️' },
  { key: 'soiree',   label: 'Soirée / Détente',            emoji: '🎉' },
  { key: 'info',     label: 'Information importante',       emoji: '📣' },
  { key: 'libre',    label: 'Activité libre / Patrouille', emoji: '🏇' },
  { key: 'aucune',   label: 'Générale (sans catégorie)',   emoji: '📢' },
];
const _cat = k => CATEGORIES_RP.find(c => c.key === k) || { key: k, label: '', emoji: '📢' };

// ─── Brouillons en mémoire (par utilisateur) ───
const _drafts = new Map();
function _setDraft(uid, d) { d.at = Date.now(); _drafts.set(uid, d); }
function _getDraft(uid) { const d = _drafts.get(uid); if (d && Date.now() - d.at > 1800000) { _drafts.delete(uid); return null; } return d; }

function _cfg(db) { if (!db.annoncesCfg) db.annoncesCfg = {}; return db.annoncesCfg; }
function _defRole(channelId) { return _cfg(loadDB())[channelId]?.pingRoleId || null; }

// ─── Date/heure → timestamp UTC (heure saisie interprétée en Europe/Paris) ───
function _tzOffsetMs(date, tz) {
  const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const p = dtf.formatToParts(date).reduce((a, x) => { a[x.type] = x.value; return a; }, {});
  const hour = p.hour === '24' ? '00' : p.hour;
  const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +hour, +p.minute, +p.second);
  return asUTC - date.getTime();
}
function _wallParisToUtc(y, mo, d, h, mi) {
  const guess = Date.UTC(y, mo - 1, d, h, mi, 0);
  return guess - _tzOffsetMs(new Date(guess), 'Europe/Paris');
}
function _parseDateHeure(dateTxt, heureTxt) {
  if (!dateTxt) return null;
  const md = String(dateTxt).match(/(\d{1,2})[\/.\-](\d{1,2})(?:[\/.\-](\d{2,4}))?/);
  if (!md) return null;
  let d = +md[1], mo = +md[2], y = md[3] ? +md[3] : null;
  if (y && y < 100) y += 2000;
  let h = 0, mi = 0;
  if (heureTxt) {
    const mh = String(heureTxt).match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/i);
    if (mh) { h = +mh[1]; mi = mh[2] ? +mh[2] : 0; }
    else { const m2 = String(heureTxt).match(/(\d{1,2})/); if (m2) h = +m2[1]; }
  }
  if (mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59) return null;
  const yr = y || new Date().getUTCFullYear();
  let ts = _wallParisToUtc(yr, mo, d, h, mi);
  if (!md[3] && ts < Date.now() - 3600000) ts = _wallParisToUtc(yr + 1, mo, d, h, mi); // année non précisée + déjà passé → l'an prochain
  return ts;
}
const _ts = ms => Math.floor(ms / 1000);

// ─── Panneaux ───
function _panelAnnoncePayload() {
  const embed = new EmbedBuilder().setColor(0xC8A45C).setTitle('📢 ANNONCES')
    .setDescription([
      "*Crée une annonce propre : catégorie RP, message, et — si tu veux — des rappels automatiques avant l'événement.*",
      '',
      '📢 **Créer une annonce** — titre, message, catégorie RP, date/heure (optionnel), rôle à pinger et rappels.',
      '⏰ Rappels possibles : **1 h avant** et/ou **30 min avant** (si une date + heure sont indiquées).',
    ].join('\n')).setFooter({ text: 'La Confrérie • Annonces' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ann_new').setLabel('Créer une annonce').setEmoji('📢').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ann_cfg').setLabel('Rôle par défaut').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}
function _panelSondagePayload() {
  const embed = new EmbedBuilder().setColor(0x5865F2).setTitle('📊 SONDAGES')
    .setDescription([
      '*Lance un sondage en quelques secondes, sans commande.*',
      '',
      '📊 **Créer un sondage** — une question, 2 à 10 réponses, une durée → **sondage natif Discord** (vote intégré, résultats automatiques) + ping.',
    ].join('\n')).setFooter({ text: 'La Confrérie • Sondages' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('poll_new').setLabel('Créer un sondage').setEmoji('📊').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('poll_cfg').setLabel('Rôle par défaut').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row] };
}
async function _install(channel, payload, titleMark) {
  if (!channel?.send) return null;
  const me = channel.client.user.id;
  const db = loadDB();
  if (!db.annoncesPanels) db.annoncesPanels = {};
  const key = `${channel.id}:${titleMark}`;
  const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes(titleMark);
  // Recherche FIABLE pour ne JAMAIS reposter en double au redémarrage :
  // 1) id mémorisé  → 2) messages épinglés  → 3) 50 derniers messages.
  let existing = null;
  if (db.annoncesPanels[key]) existing = await channel.messages.fetch(db.annoncesPanels[key]).catch(() => null);
  if (!existing) { const pins = await channel.messages.fetchPinned().catch(() => null); if (pins) existing = [...pins.values()].find(estPanel) || null; }
  if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
  if (existing) {
    await existing.edit(payload).catch(() => {});
    if (db.annoncesPanels[key] !== existing.id) { db.annoncesPanels[key] = existing.id; saveDB(db); }
    // Nettoie d'éventuels doublons laissés par l'ancien bug (panneaux identiques en trop)
    try { const recent = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (recent) for (const m of recent.values()) { if (estPanel(m) && m.id !== existing.id) await m.delete().catch(() => {}); } } catch {}
    return existing;
  }
  const sent = await channel.send(payload).catch(() => null);
  if (sent) { try { await sent.pin(); } catch {} db.annoncesPanels[key] = sent.id; saveDB(db); }
  return sent;
}
async function installerPanelAnnonce(guild, channel) { return _install(channel, _panelAnnoncePayload(), 'ANNONCES'); }
async function installerPanelSondage(guild, channel) { return _install(channel, _panelSondagePayload(), 'SONDAGES'); }

// ─── UI de configuration d'une annonce (rôle + rappels + publier) ───
function _annConfigRows(eventTs, reminders) {
  const roleRow = new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('ann_role').setPlaceholder('👥 Rôle à pinger (optionnel)').setMinValues(0).setMaxValues(1));
  const remMenu = new StringSelectMenuBuilder().setCustomId('ann_rem').setPlaceholder(eventTs ? '⏰ Rappels avant…' : '⏰ Rappels (ajoute une date + heure)').setMinValues(0).setMaxValues(2)
    .addOptions(
      { label: '1 heure avant', value: '60', emoji: '⏰', default: (reminders || []).includes('60') },
      { label: '30 minutes avant', value: '30', emoji: '⏰', default: (reminders || []).includes('30') },
    );
  if (!eventTs) remMenu.setDisabled(true);
  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ann_pub').setLabel("Publier l'annonce").setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('ann_cancel').setLabel('Annuler').setStyle(ButtonStyle.Danger),
  );
  return [roleRow, new ActionRowBuilder().addComponents(remMenu), btnRow];
}
function _annPreview(d) {
  const c = _cat(d.cat);
  return [
    `📢 **Aperçu** — ${c.emoji} ${c.label}`,
    `**${d.titre}**`,
    d.eventTs ? `🗓️ <t:${_ts(d.eventTs)}:F> (<t:${_ts(d.eventTs)}:R>)` : ((d.dateTxt || d.heureTxt) ? `🗓️ ${d.dateTxt} ${d.heureTxt} *(date non reconnue → pas de rappel auto)*` : '🗓️ *Sans date*'),
    `👥 Ping : ${d.roleId ? `<@&${d.roleId}>` : '*aucun*'}`,
    '',
    'Choisis le **rôle à pinger** et les **rappels**, puis **Publier**.',
    d.eventTs ? '' : "⏰ *Les rappels nécessitent une date + heure valides.*",
  ].filter(Boolean).join('\n');
}
// Rangée « gérer » ajoutée SOUS chaque annonce publiée (annulation ultérieure par la Direction).
function _gererRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('ann_gerer').setLabel('Gérer').setEmoji('🛠️').setStyle(ButtonStyle.Secondary),
  );
}
function _pollRows() {
  return [
    new ActionRowBuilder().addComponents(new RoleSelectMenuBuilder().setCustomId('poll_role').setPlaceholder('👥 Rôle à pinger (optionnel)').setMinValues(0).setMaxValues(1)),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('poll_pub').setLabel('Publier le sondage').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('poll_cancel').setLabel('Annuler').setStyle(ButtonStyle.Danger),
    ),
  ];
}
function _pollPreview(d) {
  return `📊 **${d.question}**\n${d.options.map(o => `• ${o}`).join('\n')}\n⏳ Durée : ${d.hours} h\n👥 Ping : ${d.roleId ? `<@&${d.roleId}>` : '*aucun*'}\n\nClique **Publier le sondage**.`;
}

const annoncesCommands = [
  new SlashCommandBuilder().setName('annonce-installer').setDescription("📢 Poser le panneau d'annonces dans CE salon (Direction)"),
  new SlashCommandBuilder().setName('sondage-installer').setDescription('📊 Poser le panneau de sondages dans CE salon (Direction)'),
];

async function routeInteraction(interaction) {
  try {
    // ── Commandes slash ──
    if (interaction.isChatInputCommand?.()) {
      if (interaction.commandName === 'annonce-installer') {
        if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await installerPanelAnnonce(interaction.guild, interaction.channel);
        await interaction.editReply({ content: `✅ Panneau d'annonces installé dans ${interaction.channel}.` }); return true;
      }
      if (interaction.commandName === 'sondage-installer') {
        if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        await installerPanelSondage(interaction.guild, interaction.channel);
        await interaction.editReply({ content: `✅ Panneau de sondages installé dans ${interaction.channel}.` }); return true;
      }
      return false;
    }

    const id = interaction.customId || '';
    if (!id.startsWith('ann_') && !id.startsWith('poll_')) return false;

    // ══════════ ANNONCES ══════════
    if (interaction.isButton() && id === 'ann_new') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('ann_cat').setPlaceholder("Catégorie RP de l'annonce…").addOptions(CATEGORIES_RP.map(c => ({ label: c.label, value: c.key, emoji: c.emoji })));
      await interaction.reply({ content: '📢 **Nouvelle annonce** — choisis d\'abord la catégorie :', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isStringSelectMenu() && id === 'ann_cat') {
      const cat = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`ann_modal::${cat}`).setTitle(`📢 ${_cat(cat).label}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel("Message de l'annonce").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (optionnel) — ex : 28/06 ou 28/06/2026').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure (optionnel) — ex : 21h00').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10)),
      );
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id.startsWith('ann_modal::')) {
      const cat = id.split('::')[1];
      const titre = interaction.fields.getTextInputValue('titre').trim();
      const message = interaction.fields.getTextInputValue('message').trim();
      const dateTxt = (interaction.fields.getTextInputValue('date') || '').trim();
      const heureTxt = (interaction.fields.getTextInputValue('heure') || '').trim();
      const eventTs = _parseDateHeure(dateTxt, heureTxt);
      const d = { kind: 'ann', cat, titre, message, eventTs, dateTxt, heureTxt, channelId: interaction.channelId, roleId: _defRole(interaction.channelId), reminders: eventTs ? ['60', '30'] : [] };
      _setDraft(interaction.user.id, d);
      await interaction.reply({ content: _annPreview(d), components: _annConfigRows(eventTs, d.reminders), flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isRoleSelectMenu?.() && id === 'ann_role') {
      const d = _getDraft(interaction.user.id); if (!d) { await interaction.update({ content: '⌛ Brouillon expiré, recommence.', components: [] }); return true; }
      d.roleId = interaction.values[0] || null; _setDraft(interaction.user.id, d);
      await interaction.update({ content: _annPreview(d), components: _annConfigRows(d.eventTs, d.reminders) }); return true;
    }
    if (interaction.isStringSelectMenu() && id === 'ann_rem') {
      const d = _getDraft(interaction.user.id); if (!d) { await interaction.update({ content: '⌛ Brouillon expiré, recommence.', components: [] }); return true; }
      d.reminders = interaction.values || []; _setDraft(interaction.user.id, d);
      await interaction.update({ content: _annPreview(d), components: _annConfigRows(d.eventTs, d.reminders) }); return true;
    }
    if (interaction.isButton() && id === 'ann_cancel') { _drafts.delete(interaction.user.id); await interaction.update({ content: '❌ Annonce annulée.', components: [] }); return true; }
    if (interaction.isButton() && id === 'ann_pub') {
      const d = _getDraft(interaction.user.id); if (!d) { await interaction.update({ content: '⌛ Brouillon expiré, recommence.', components: [] }); return true; }
      const ch = interaction.guild.channels.cache.get(d.channelId) || interaction.channel;
      const c = _cat(d.cat);
      const embed = new EmbedBuilder().setColor(0xC8A45C).setTitle(`${c.emoji} ${d.titre}`.slice(0, 256)).setDescription(d.message)
        .setFooter({ text: `Annonce • ${interaction.member?.displayName || interaction.user.username}` }).setTimestamp(new Date());
      if (c.label && d.cat !== 'aucune') embed.addFields({ name: 'Catégorie', value: `${c.emoji} ${c.label}`, inline: true });
      if (d.eventTs) embed.addFields({ name: '🗓️ Quand', value: `<t:${_ts(d.eventTs)}:F>\n<t:${_ts(d.eventTs)}:R>`, inline: true });
      const content = d.roleId ? `<@&${d.roleId}>` : '';
      const sent = await ch.send({ content, embeds: [embed], components: [_gererRow()], allowedMentions: { roles: d.roleId ? [d.roleId] : [] } }).catch(e => { console.log('⚠️ annonce send:', e.message); return null; });
      let remCount = 0;
      if (sent) {
        const db = loadDB();
        // Mémorise l'annonce publiée (pour l'annuler proprement plus tard).
        if (!db.annoncesPubliees) db.annoncesPubliees = {};
        db.annoncesPubliees[sent.id] = { channelId: d.channelId, roleId: d.roleId || null, titre: d.titre, eventTs: d.eventTs || null, cat: d.cat, by: interaction.member?.displayName || interaction.user.username, at: Date.now() };
        if (d.eventTs && d.reminders?.length) {
          if (!Array.isArray(db.annoncesReminders)) db.annoncesReminders = [];
          for (const off of d.reminders) {
            const fireAt = d.eventTs - (off === '60' ? 60 : 30) * 60000;
            if (fireAt > Date.now() - 60000) { db.annoncesReminders.push({ id: 'R' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), channelId: d.channelId, roleId: d.roleId || null, titre: d.titre, eventTs: d.eventTs, fireAt, fired: false, annonceMsgId: sent.id }); remCount++; }
          }
        }
        saveDB(db);
      }
      _drafts.delete(interaction.user.id);
      await interaction.update({ content: sent ? `✅ Annonce publiée dans ${ch}.${remCount ? ` ⏰ ${remCount} rappel(s) programmé(s).` : ''}\n🛠️ *Un bouton « Gérer » est disponible sous l'annonce pour l'**annuler** en cas de besoin.*` : '❌ Échec de publication (permissions ?).', components: [] }); return true;
    }

    // ── GÉRER / ANNULER une annonce déjà publiée ──
    if (interaction.isButton() && id === 'ann_gerer') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const rec = (loadDB().annoncesPubliees || {})[interaction.message.id];
      const titre = rec?.titre || (interaction.message.embeds?.[0]?.title || 'cette annonce').replace(/^[^\wÀ-ÿ]+/, '').trim();
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`ann_annuler::${interaction.channelId}::${interaction.message.id}`).setLabel("Annuler l'annonce").setEmoji('❌').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('ann_gclose').setLabel('Fermer').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: `🛠️ **Gérer** — « ${titre} »\nTu peux **annuler** cette annonce : elle sera marquée *ANNULÉE*, ses rappels seront supprimés, et les personnes pingées seront prévenues.`, components: [row], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isButton() && id === 'ann_gclose') { await interaction.update({ content: '✅ Fermé.', components: [] }); return true; }
    if (interaction.isButton() && id.startsWith('ann_annuler::')) {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const [, chId, msgId] = id.split('::');
      const modal = new ModalBuilder().setCustomId(`ann_annuler_modal::${chId}::${msgId}`).setTitle("❌ Annuler l'annonce");
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Raison (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setPlaceholder('Ex : événement reporté, annulé faute de participants…')),
      );
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id.startsWith('ann_annuler_modal::')) {
      const [, chId, msgId] = id.split('::');
      const raison = (interaction.fields.getTextInputValue('raison') || '').trim();
      await interaction.deferReply({ flags: MessageFlags.Ephemeral });
      const ch = interaction.guild.channels.cache.get(chId) || await interaction.guild.channels.fetch(chId).catch(() => null);
      const msg = ch ? await ch.messages.fetch(msgId).catch(() => null) : null;
      if (!msg) { await interaction.editReply({ content: "❌ Annonce introuvable (déjà supprimée ?)." }); return true; }
      const db = loadDB();
      const rec = (db.annoncesPubliees || {})[msgId] || {};
      const titre = rec.titre || (msg.embeds?.[0]?.title || 'Annonce').replace(/^[^\wÀ-ÿ]+/, '').trim();
      // 1) Marque l'annonce comme ANNULÉE (on garde une trace, on ne supprime pas le message).
      let embed = msg.embeds?.[0] ? EmbedBuilder.from(msg.embeds[0]) : new EmbedBuilder().setDescription(titre);
      embed.setColor(0xED4245).setTitle(`❌ ANNULÉE — ${titre}`.slice(0, 256))
        .addFields({ name: '❌ Annulée', value: `${raison ? raison + '\n' : ''}par **${interaction.member?.displayName || interaction.user.username}** • <t:${_ts(Date.now())}:R>` });
      await msg.edit({ embeds: [embed], components: [] }).catch(() => {});
      // 2) Supprime les rappels programmés pour cette annonce.
      let remOff = 0;
      if (Array.isArray(db.annoncesReminders)) {
        const before = db.annoncesReminders.length;
        db.annoncesReminders = db.annoncesReminders.filter(r => !(r.annonceMsgId === msgId || (rec.titre && r.channelId === chId && r.titre === rec.titre && !r.fired)));
        remOff = before - db.annoncesReminders.length;
      }
      if (db.annoncesPubliees && db.annoncesPubliees[msgId]) { db.annoncesPubliees[msgId].annulee = true; db.annoncesPubliees[msgId].annuleeAt = Date.now(); }
      saveDB(db);
      // 3) Prévient les personnes concernées (même rôle que l'annonce d'origine).
      const roleId = rec.roleId || (msg.content?.match(/<@&(\d+)>/)?.[1]) || null;
      const notice = [
        `⚠️ **Annonce annulée** — « ${titre} »`,
        rec.eventTs ? `🗓️ *(était prévue <t:${_ts(rec.eventTs)}:F>)*` : '',
        raison ? `📝 ${raison}` : '',
      ].filter(Boolean).join('\n');
      await ch.send({ content: (roleId ? `<@&${roleId}> ` : '') + notice, allowedMentions: { roles: roleId ? [roleId] : [] } }).catch(() => {});
      await interaction.editReply({ content: `✅ Annonce annulée${remOff ? ` — ${remOff} rappel(s) supprimé(s)` : ''}. Les personnes pingées ont été prévenues.` }); return true;
    }

    // ══════════ SONDAGES ══════════
    if (interaction.isButton() && id === 'poll_new') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const modal = new ModalBuilder().setCustomId('poll_modal').setTitle('📊 Nouveau sondage');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('question').setLabel('Question').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(280)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('options').setLabel('Options (une par ligne, 2 à 10)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800).setPlaceholder('Oui\nNon\nPeut-être')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duree').setLabel('Durée en heures (optionnel, défaut 24)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4)),
      );
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'poll_modal') {
      const question = interaction.fields.getTextInputValue('question').trim();
      let options = (interaction.fields.getTextInputValue('options') || '').split('\n').map(s => s.trim()).filter(Boolean);
      options = [...new Set(options)].slice(0, 10);
      if (options.length < 2) { await interaction.reply({ content: '❌ Il faut au moins **2 options** (une par ligne).', flags: MessageFlags.Ephemeral }); return true; }
      let hours = parseInt((interaction.fields.getTextInputValue('duree') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(hours) || hours < 1) hours = 24; if (hours > 768) hours = 768;
      const d = { kind: 'poll', question, options, hours, channelId: interaction.channelId, roleId: _defRole(interaction.channelId) };
      _setDraft(interaction.user.id, d);
      await interaction.reply({ content: _pollPreview(d), components: _pollRows(), flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isRoleSelectMenu?.() && id === 'poll_role') {
      const d = _getDraft(interaction.user.id); if (!d || d.kind !== 'poll') { await interaction.update({ content: '⌛ Brouillon expiré.', components: [] }); return true; }
      d.roleId = interaction.values[0] || null; _setDraft(interaction.user.id, d);
      await interaction.update({ content: _pollPreview(d), components: _pollRows() }); return true;
    }
    if (interaction.isButton() && id === 'poll_cancel') { _drafts.delete(interaction.user.id); await interaction.update({ content: '❌ Sondage annulé.', components: [] }); return true; }
    if (interaction.isButton() && id === 'poll_pub') {
      const d = _getDraft(interaction.user.id); if (!d || d.kind !== 'poll') { await interaction.update({ content: '⌛ Brouillon expiré.', components: [] }); return true; }
      const ch = interaction.guild.channels.cache.get(d.channelId) || interaction.channel;
      const content = d.roleId ? `<@&${d.roleId}> 📊 Nouveau sondage !` : '';
      const sent = await ch.send({
        content,
        poll: { question: { text: d.question.slice(0, 300) }, answers: d.options.slice(0, 10).map(o => ({ text: o.slice(0, 55) })), duration: d.hours, allowMultiselect: false },
        allowedMentions: { roles: d.roleId ? [d.roleId] : [] },
      }).catch(e => { console.log('⚠️ poll send:', e.message); return null; });
      _drafts.delete(interaction.user.id);
      await interaction.update({ content: sent ? `✅ Sondage publié dans ${ch}.` : '❌ Échec (sondages natifs : vérifie les permissions « Créer des sondages » du bot).', components: [] }); return true;
    }

    // ══════════ CONFIG (rôle par défaut du salon) ══════════
    if (interaction.isButton() && (id === 'ann_cfg' || id === 'poll_cfg')) {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const sel = new RoleSelectMenuBuilder().setCustomId(id === 'ann_cfg' ? 'ann_setrole' : 'poll_setrole').setPlaceholder('Rôle pingé par défaut ici').setMinValues(0).setMaxValues(1);
      await interaction.reply({ content: '⚙️ Choisis le rôle **pingé par défaut** dans ce salon (laisse vide pour aucun) :', components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral }); return true;
    }
    if (interaction.isRoleSelectMenu?.() && (id === 'ann_setrole' || id === 'poll_setrole')) {
      const db = loadDB(); const cfg = _cfg(db); if (!cfg[interaction.channelId]) cfg[interaction.channelId] = {};
      cfg[interaction.channelId].pingRoleId = interaction.values[0] || null; saveDB(db);
      await interaction.update({ content: interaction.values[0] ? `✅ Rôle par défaut : <@&${interaction.values[0]}>.` : '✅ Aucun rôle par défaut.', components: [] }); return true;
    }

    return false;
  } catch (e) {
    console.log('❌ annonces routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur (annonces/sondages).', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

// ─── Rappels (appelé chaque minute par le cron, par guilde) ───
async function checkReminders(guild) {
  try {
    const db = loadDB(); const arr = db.annoncesReminders;
    if (!Array.isArray(arr) || !arr.length) return;
    const now = Date.now(); let changed = false;
    for (const r of arr) {
      if (r.fired) continue;
      const ch = guild.channels?.cache?.get(r.channelId);
      if (!ch) continue; // pas ce serveur (ou salon supprimé)
      if (now >= r.fireAt && now < r.fireAt + 6 * 60000) {
        const content = (r.roleId ? `<@&${r.roleId}> ` : '') + `⏰ **Rappel** — « ${r.titre} » commence <t:${_ts(r.eventTs)}:R> (à <t:${_ts(r.eventTs)}:t>) !`;
        await ch.send({ content, allowedMentions: { roles: r.roleId ? [r.roleId] : [] } }).catch(() => {});
        r.fired = true; changed = true;
      } else if (now >= r.fireAt + 6 * 60000) { r.fired = true; changed = true; } // fenêtre ratée → on ne spamme pas
    }
    db.annoncesReminders = arr.filter(r => !(r.fired && now > (r.eventTs || r.fireAt) + 3600000));
    if (changed) saveDB(db);
  } catch (e) { console.log('⚠️ annonces checkReminders:', e.message); }
}

module.exports = { installerPanelAnnonce, installerPanelSondage, routeInteraction, checkReminders, annoncesCommands };
