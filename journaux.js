// ───────────────────────────────────────────────────────────────────────────
//  journaux.js — Parutions de presse (Texas / Louisiane / autre).
//   Le système : un salon est déclaré « journal » via /journal-installer
//   (région + rôle lecteur). Ensuite, quand la personne autorisée poste une
//   PHOTO dans ce salon, le bot la transforme automatiquement en une belle
//   parution (en-tête région + date + auteur), recopie la/les image(s) et
//   prévient les lecteurs (ping). Pensé pour des publications surtout en images.
//   Tout est préfixé jrn_ — module isolé.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, RoleSelectMenuBuilder, AttachmentBuilder, SlashCommandBuilder, MessageFlags } = require('discord.js');

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

// Brouillons de config (par utilisateur)
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
    '_Ensuite : poste une **photo** dans ce salon → le bot la transforme en parution et prévient les lecteurs._',
  ].join('\n');
}

const journauxCommands = [
  new SlashCommandBuilder().setName('journal-installer').setDescription('📰 Déclarer CE salon comme journal (région + rôle lecteur) — Direction'),
];

async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'journal-installer') {
      if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      const existing = _store(loadDB())[interaction.channelId] || null;
      const d = { channelId: interaction.channelId, region: existing?.region || null, roleId: existing?.roleId || null, at: Date.now() };
      _drafts.set(interaction.user.id, d);
      await interaction.reply({ content: _cfgText(d), components: _cfgRows(d), flags: MessageFlags.Ephemeral }); return true;
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
      await interaction.update({ content: `✅ Salon activé comme **${r.emoji} ${r.label}**. ${d.roleId ? `Lecteurs prévenus : <@&${d.roleId}>.` : 'Aucun rôle prévenu.'}\n\nPoste une **photo** ici → elle devient une parution automatiquement.`, components: [] }); return true;
    }
    if (interaction.isButton() && id === 'jrn_off') {
      if (!estGestion(interaction.member)) { await interaction.update({ content: '🔒 Réservé à la Direction.', components: [] }); return true; }
      const db = loadDB(); const s = _store(db); delete s[interaction.channelId]; saveDB(db);
      _drafts.delete(interaction.user.id);
      await interaction.update({ content: '🗑️ Ce salon n\'est plus un journal (les photos ne seront plus transformées).', components: [] }); return true;
    }
    return false;
  } catch (e) {
    console.log('❌ journaux routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur (journaux).', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

// Transforme une photo postée dans un salon-journal en parution propre + ping.
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    const cfg = _store(loadDB())[message.channel?.id];
    if (!cfg) return false;
    const imgs = [...(message.attachments?.values() || [])].filter(_estImage);
    if (!imgs.length) return false; // on ne touche qu'aux messages avec image

    const r = _reg(cfg.region);
    let dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    dateStr = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    const auteur = message.member?.displayName || message.author.username;
    const legende = (message.content || '').trim().slice(0, 1500);

    // Recopie des images (pour pouvoir supprimer l'original sans perdre la photo)
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

    const embed = new EmbedBuilder().setColor(r.color)
      .setTitle(`${r.emoji} ${r.label.toUpperCase()}`)
      .setDescription(`🗓️ **${dateStr}**${legende ? `\n\n${legende}` : ''}`)
      .setFooter({ text: `Édition publiée par ${auteur}` }).setTimestamp(new Date());
    const content = cfg.roleId ? `<@&${cfg.roleId}> 📰 **Nouvelle parution !**` : '📰 **Nouvelle parution !**';
    const mentions = { roles: cfg.roleId ? [cfg.roleId] : [] };

    if (files.length) {
      embed.setImage(`attachment://${files[0].name}`);
      const sent = await message.channel.send({ content, embeds: [embed], files, allowedMentions: mentions }).catch(e => { console.log('⚠️ journal post:', e.message); return null; });
      if (sent) { await message.delete().catch(() => {}); await sent.react('📰').catch(() => {}); }
    } else {
      // Recopie impossible → on garde l'original et on ajoute juste l'en-tête en réponse
      await message.reply({ content, embeds: [embed], allowedMentions: mentions }).catch(() => {});
      await message.react('📰').catch(() => {});
    }
    return false;
  } catch (e) { console.log('⚠️ journaux onMessage:', e.message); return false; }
}

module.exports = { routeInteraction, onMessage, journauxCommands };
