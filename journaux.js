// ───────────────────────────────────────────────────────────────────────────
//  journaux.js — Parutions de presse (Texas / Louisiane / autre).
//   Un salon (FORUM « par fils » OU salon texte) est déclaré « journal » via
//   /journal-installer (région + rôle lecteur). Ensuite :
//   • FORUM : chaque nouvelle publication (fil) reçoit une en-tête propre
//     (région + date + auteur) et les lecteurs sont prévenus (ping).
//   • SALON TEXTE : une photo postée devient une parution propre (image recopiée
//     dans un embed, message brut supprimé) + ping.
//   Pensé pour des publications surtout en images. Tout est préfixé jrn_.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, AttachmentBuilder, SlashCommandBuilder, ChannelType, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const REGIONS = {
  texas:     { label: 'Journal du Texas',     emoji: '🤠', color: 0xC0392B },
  louisiane: { label: 'Journal de Louisiane', emoji: '⚜️', color: 0x8E44AD },
  autre:     { label: 'Journal',              emoji: '📰', color: 0xC8A45C },
};
const _reg = k => REGIONS[k] || REGIONS.autre;

function _store(db) { if (!db.journaux) db.journaux = {}; return db.journaux; }
const _estImage = a => (a.contentType || '').startsWith('image') || /\.(png|jpe?g|webp|gif)(\?|$)/i.test(a.url || a.name || '');

const _drafts = new Map();

function _cfgRows(d) {
  const regSel = new StringSelectMenuBuilder().setCustomId('jrn_region').setPlaceholder('Région du journal…').addOptions(
    Object.entries(REGIONS).map(([k, v]) => ({ label: v.label, value: k, emoji: v.emoji, default: d?.region === k })),
  );
  const roleSel = new RoleSelectMenuBuilder().setCustomId('jrn_role').setPlaceholder('👥 Rôle prévenu à chaque parution (optionnel)').setMinValues(0).setMaxValues(1);
  const btns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('jrn_save').setLabel('Activer ce salon comme journal').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('jrn_off').setLabel('Désactiver').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  );
  return [new ActionRowBuilder().addComponents(regSel), new ActionRowBuilder().addComponents(roleSel), btns];
}
function _cfgText(d) {
  const r = _reg(d?.region);
  return [
    '📰 **Configurer ce salon comme journal**',
    `• Région : ${d?.region ? `${r.emoji} ${r.label}` : '*à choisir*'}`,
    `• Lecteurs prévenus : ${d?.roleId ? `<@&${d.roleId}>` : '*aucun*'}`,
    '',
    'Choisis la **région** et (au choix) le **rôle à prévenir**, puis **Activer**.',
    '',
    '_Forum : chaque nouvelle publication (fil) recevra une en-tête + un ping._',
    '_Salon texte : une photo postée devient une parution propre + un ping._',
  ].join('\n');
}

// Embed d'une parution
function _editionEmbed(cfg, auteur, legende, imageName) {
  const r = _reg(cfg.region);
  let dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
  const e = new EmbedBuilder().setColor(r.color).setTitle(`${r.emoji} ${r.label.toUpperCase()}`)
    .setDescription(`🗓️ **${dateStr}**${legende ? `\n\n${String(legende).slice(0, 1500)}` : ''}`)
    .setFooter({ text: `Édition publiée par ${auteur}` }).setTimestamp(new Date());
  if (imageName) e.setImage(`attachment://${imageName}`);
  return { embed: e, region: r, dateStr };
}
function _pingFor(cfg) {
  return { content: cfg.roleId ? `<@&${cfg.roleId}> 📰 **Nouvelle parution !**` : '📰 **Nouvelle parution !**', allowedMentions: { roles: cfg.roleId ? [cfg.roleId] : [] } };
}
async function _reupload(imgs) {
  const files = [];
  for (let i = 0; i < imgs.length && i < 10; i++) {
    try {
      const ctrl = new AbortController(); const t = setTimeout(() => ctrl.abort(), 8000);
      const res = await fetch(imgs[i].url, { signal: ctrl.signal }).catch(() => null); clearTimeout(t);
      if (res && res.ok) {
        const buf = Buffer.from(await res.arrayBuffer());
        const ext = (String(imgs[i].name || '').split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        files.push(new AttachmentBuilder(buf, { name: `edition${i}.${ext}` }));
      }
    } catch {}
  }
  return files;
}

const journauxCommands = [
  new SlashCommandBuilder().setName('journal-installer').setDescription('📰 Déclarer CE salon comme journal (région + rôle lecteur) — Direction'),
];

async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'journal-installer') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const enFil = !!interaction.channel?.isThread?.();
      const targetId = enFil ? interaction.channel.parentId : interaction.channelId;
      const existing = _store(loadDB())[targetId] || null;
      const d = { channelId: targetId, region: existing?.region || null, roleId: existing?.roleId || null, at: Date.now() };
      _drafts.set(interaction.user.id, d);
      const note = enFil ? '\n\n*(Tu es dans un fil : c\'est le **salon-forum parent** qui sera déclaré comme journal.)*' : '';
      await interaction.reply({ content: _cfgText(d) + note, components: _cfgRows(d), flags: MessageFlags.Ephemeral }); return true;
    }

    const id = interaction.customId || '';
    if (!id.startsWith('jrn_')) return false;

    if (interaction.isStringSelectMenu() && id === 'jrn_region') {
      const d = _drafts.get(interaction.user.id); if (!d) { await interaction.update({ content: '⌛ Expiré, relance /journal-installer.', components: [] }); return true; }
      d.region = interaction.values[0]; _drafts.set(interaction.user.id, d);
      await interaction.update({ content: _cfgText(d), components: _cfgRows(d) }); return true;
    }
    if (interaction.isRoleSelectMenu?.() && id === 'jrn_role') {
      const d = _drafts.get(interaction.user.id); if (!d) { await interaction.update({ content: '⌛ Expiré, relance /journal-installer.', components: [] }); return true; }
      d.roleId = interaction.values[0] || null; _drafts.set(interaction.user.id, d);
      await interaction.update({ content: _cfgText(d), components: _cfgRows(d) }); return true;
    }
    if (interaction.isButton() && id === 'jrn_save') {
      if (!estGestion(interaction.member)) { await interaction.update({ content: '🔒 Réservé à la Direction.', components: [] }); return true; }
      const d = _drafts.get(interaction.user.id); if (!d) { await interaction.update({ content: '⌛ Expiré, relance /journal-installer.', components: [] }); return true; }
      if (!d.region) { await interaction.update({ content: '⚠️ Choisis d\'abord une **région**.\n\n' + _cfgText(d), components: _cfgRows(d) }); return true; }
      const db = loadDB(); _store(db)[d.channelId] = { region: d.region, roleId: d.roleId || null }; saveDB(db);
      _drafts.delete(interaction.user.id);
      const r = _reg(d.region);
      await interaction.update({ content: `✅ Salon activé comme **${r.emoji} ${r.label}**. ${d.roleId ? `Lecteurs prévenus : <@&${d.roleId}>.` : 'Aucun rôle prévenu.'}\n\nForum → nouvelle publication = parution automatique. Salon texte → poste une **photo**.`, components: [] }); return true;
    }
    if (interaction.isButton() && id === 'jrn_off') {
      if (!estGestion(interaction.member)) { await interaction.update({ content: '🔒 Réservé à la Direction.', components: [] }); return true; }
      const db = loadDB(); const s = _store(db); delete s[interaction.channelId]; const enFil = interaction.channel?.isThread?.(); if (enFil && interaction.channel.parentId) delete s[interaction.channel.parentId]; saveDB(db);
      _drafts.delete(interaction.user.id);
      await interaction.update({ content: '🗑️ Ce salon n\'est plus un journal.', components: [] }); return true;
    }
    return false;
  } catch (e) {
    console.log('❌ journaux routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur (journaux).', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

// SALON TEXTE : une photo postée → parution propre (recopie image + suppression du brut) + ping.
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    const ch = message.channel;
    if (ch?.isThread?.()) return false; // les forums passent par onThreadCreate
    const cfg = _store(loadDB())[ch?.id];
    if (!cfg) return false;
    const imgs = [...(message.attachments?.values() || [])].filter(_estImage);
    if (!imgs.length) return false; // on ne touche qu'aux messages avec image
    const auteur = message.member?.displayName || message.author.username;
    const legende = (message.content || '').trim();
    const files = await _reupload(imgs);
    const { content, allowedMentions } = _pingFor(cfg);
    if (files.length) {
      const { embed } = _editionEmbed(cfg, auteur, legende, files[0].name);
      const sent = await ch.send({ content, embeds: [embed], files, allowedMentions }).catch(e => { console.log('⚠️ journal post:', e.message); return null; });
      if (sent) { await message.delete().catch(() => {}); await sent.react('📰').catch(() => {}); }
    } else {
      const { embed } = _editionEmbed(cfg, auteur, legende, null);
      await message.reply({ content, embeds: [embed], allowedMentions }).catch(() => {});
      await message.react('📰').catch(() => {});
    }
    return false;
  } catch (e) { console.log('⚠️ journaux onMessage:', e.message); return false; }
}

// FORUM : nouvelle publication (fil) → en-tête propre + ping (on ne supprime rien, le post EST la parution).
async function onThreadCreate(thread) {
  try {
    if (!thread?.guild || !thread.parentId) return;
    if (thread.parent?.type !== ChannelType.GuildForum) return;
    const cfg = _store(loadDB())[thread.parentId];
    if (!cfg) return;
    let starter = null;
    try { starter = await thread.fetchStarterMessage(); } catch {}
    if (!starter) { await new Promise(r => setTimeout(r, 2000)); try { starter = await thread.fetchStarterMessage(); } catch {} }
    if (starter?.author?.bot) return;
    const auteur = starter?.member?.displayName || starter?.author?.username || (thread.ownerId ? `<@${thread.ownerId}>` : 'la presse');
    const legende = (starter?.content || '').trim();
    const { embed } = _editionEmbed(cfg, auteur, legende, null);
    const { content, allowedMentions } = _pingFor(cfg);
    await thread.send({ content, embeds: [embed], allowedMentions }).catch(() => {});
    if (starter) await starter.react('📰').catch(() => {});
  } catch (e) { console.log('⚠️ journaux onThreadCreate:', e.message); }
}

module.exports = { routeInteraction, onMessage, onThreadCreate, journauxCommands };
