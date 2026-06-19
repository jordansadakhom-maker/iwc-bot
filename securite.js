// ───────────────────────────────────────────────────────────────────────────
//  securite.js — Anti-nuke & suppressions sous confirmation pour La Confrérie
//  • Seuls les IDs autorisés peuvent supprimer un salon / rôle, ET seulement
//    après confirmation par clic d'un responsable.
//  • Toute suppression NON validée (même par le propriétaire) est restaurée
//    automatiquement, avec alerte en MP et neutralisation de l'auteur.
//  Le bot a besoin des permissions : Gérer les salons, Gérer les rôles,
//  Voir les logs d'audit — et d'un rôle placé HAUT dans la hiérarchie.
// ───────────────────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, AuditLogEvent,
} = require('discord.js');

// ⚙️ Les deux seules personnes autorisées à supprimer (avec confirmation)
const AUTORISES = ['944208797084311583', '696325126047662081'];

// ⚙️ Retirer automatiquement les rôles de l'auteur d'une suppression non autorisée
const NEUTRALISER_ATTAQUANT = true;

// Suppressions approuvées (en attente d'exécution) → l'anti-nuke ne les restaure PAS
const salonsAutorisesASupprimer = new Set(); // channelId
const rolesAutorisesASupprimer  = new Set(); // roleId

const estAutorise = (userId) => AUTORISES.includes(userId);

// ───────────────────────── Helpers ─────────────────────────
async function _alerter(guild, titre, description, couleur = 0xC0392B) {
  const embed = new EmbedBuilder().setColor(couleur).setTitle(titre).setDescription(description).setTimestamp();
  for (const id of AUTORISES) {
    try { const u = await guild.client.users.fetch(id); await u.send({ embeds: [embed] }); } catch { /* MP fermés */ }
  }
  console.log(`[SÉCURITÉ] ${titre} — ${description.replace(/\n/g, ' ')}`);
}

// Trouve l'auteur d'une action via les logs d'audit (par cible + récence)
async function _trouverAuteur(guild, type, cibleId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const entry = logs.entries.find(e => e.target?.id === cibleId && (Date.now() - e.createdTimestamp) < 10000);
    return entry?.executor ? { user: entry.executor, id: entry.executor.id } : null;
  } catch { return null; }
}

// Retire tous les rôles "retirables" d'un membre (neutralisation d'un nuke)
async function _neutraliser(guild, userId) {
  try {
    const me = guild.members.me;
    const membre = await guild.members.fetch(userId).catch(() => null);
    if (!membre) return false;
    const aRetirer = membre.roles.cache.filter(r => r.id !== guild.id && !r.managed && r.position < (me?.roles?.highest?.position ?? 0));
    if (aRetirer.size) await membre.roles.remove([...aRetirer.keys()], 'Sécurité : suppression non autorisée').catch(() => {});
    return aRetirer.size > 0;
  } catch { return false; }
}

function _verdictAuteur(guild, auteurId) {
  // Renvoie le texte de neutralisation selon l'auteur
  if (!auteurId) return Promise.resolve('');
  if (auteurId === guild.ownerId) return Promise.resolve('\n👑 Auteur = propriétaire du serveur : impossible à neutraliser (limite Discord).');
  if (estAutorise(auteurId)) return Promise.resolve('\nℹ️ Auteur = responsable autorisé (pense à passer par `/supprimer-…` pour éviter la restauration).');
  if (!NEUTRALISER_ATTAQUANT) return Promise.resolve('');
  return _neutraliser(guild, auteurId).then(ok => ok ? '\n🔒 Ses rôles ont été retirés automatiquement (neutralisation).' : '');
}

// ───────────────────────── Anti-nuke : SALONS ─────────────────────────
async function _onChannelDelete(channel) {
  try {
    const guild = channel.guild;
    if (!guild) return;
    if (channel.isThread?.()) return; // les fils ne sont pas protégés (non recréables à l'identique)
    if (salonsAutorisesASupprimer.has(channel.id)) { salonsAutorisesASupprimer.delete(channel.id); return; }

    const auteur = await _trouverAuteur(guild, AuditLogEvent.ChannelDelete, channel.id);
    const auteurId = auteur?.id;

    // Recrée le salon à l'identique (au mieux)
    let recree = null;
    try {
      const overwrites = channel.permissionOverwrites?.cache?.map(o => ({
        id: o.id, type: o.type, allow: o.allow?.bitfield, deny: o.deny?.bitfield,
      })) || [];
      recree = await guild.channels.create({
        name: channel.name,
        type: channel.type,
        parent: channel.parentId || undefined,
        position: channel.rawPosition ?? undefined,
        topic: channel.topic || undefined,
        nsfw: typeof channel.nsfw === 'boolean' ? channel.nsfw : undefined,
        bitrate: channel.bitrate || undefined,
        userLimit: channel.userLimit || undefined,
        rateLimitPerUser: channel.rateLimitPerUser || undefined,
        permissionOverwrites: overwrites,
        reason: 'Sécurité : restauration d\'un salon supprimé sans autorisation',
      });
    } catch (e) { console.log('[SÉCURITÉ] Échec recréation salon :', e?.message); }

    const qui = auteurId ? `<@${auteurId}>` : 'un utilisateur inconnu';
    const neutralise = await _verdictAuteur(guild, auteurId);
    await _alerter(guild,
      '🚨 Suppression de salon NON AUTORISÉE',
      `Le salon **#${channel.name}** a été supprimé par ${qui}.\n` +
      (recree
        ? `✅ Il a été **recréé automatiquement** : <#${recree.id}> *(historique des messages perdu — limite Discord)*.`
        : '⚠️ La recréation a **échoué** — vérifie les permissions du bot (Gérer les salons + rôle assez haut).') +
      neutralise,
    );
  } catch (e) { console.log('[SÉCURITÉ] Erreur onChannelDelete :', e?.message); }
}

// ───────────────────────── Anti-nuke : RÔLES ─────────────────────────
async function _onRoleDelete(role) {
  try {
    const guild = role.guild;
    if (!guild) return;
    if (role.managed || role.id === guild.id) return; // rôles d'intégration/bot & @everyone : ignorés
    if (rolesAutorisesASupprimer.has(role.id)) { rolesAutorisesASupprimer.delete(role.id); return; }

    const auteur = await _trouverAuteur(guild, AuditLogEvent.RoleDelete, role.id);
    const auteurId = auteur?.id;

    let recree = null;
    try {
      recree = await guild.roles.create({
        name: role.name,
        color: role.color || undefined,
        hoist: role.hoist,
        mentionable: role.mentionable,
        permissions: role.permissions?.bitfield,
        reason: 'Sécurité : restauration d\'un rôle supprimé sans autorisation',
      });
      if (typeof role.position === 'number') await recree.setPosition(role.position).catch(() => {});
    } catch (e) { console.log('[SÉCURITÉ] Échec recréation rôle :', e?.message); }

    const qui = auteurId ? `<@${auteurId}>` : 'un utilisateur inconnu';
    const neutralise = await _verdictAuteur(guild, auteurId);
    await _alerter(guild,
      '🚨 Suppression de rôle NON AUTORISÉE',
      `Le rôle **@${role.name}** a été supprimé par ${qui}.\n` +
      (recree
        ? '✅ Il a été **recréé automatiquement** *(à ré-attribuer aux membres concernés)*.'
        : '⚠️ La recréation a **échoué** — vérifie les permissions du bot (Gérer les rôles + rôle assez haut).') +
      neutralise,
    );
  } catch (e) { console.log('[SÉCURITÉ] Erreur onRoleDelete :', e?.message); }
}

// ───────────────────────── Commandes ─────────────────────────
const securiteCommands = [
  new SlashCommandBuilder().setName('supprimer-salon').setDescription('🔒 Supprimer un salon (réservé + confirmation requise)')
    .addChannelOption(o => o.setName('salon').setDescription('Le salon à supprimer').setRequired(true)),
  new SlashCommandBuilder().setName('supprimer-role').setDescription('🔒 Supprimer un rôle (réservé + confirmation requise)')
    .addRoleOption(o => o.setName('role').setDescription('Le rôle à supprimer').setRequired(true)),
];

// ───────────────────────── Routeur d'interactions ─────────────────────────
async function routeInteraction(interaction) {
  // /supprimer-salon
  if (interaction.isChatInputCommand?.() && interaction.commandName === 'supprimer-salon') {
    if (!estAutorise(interaction.user.id)) { await interaction.reply({ content: '🔒 Seuls les responsables autorisés peuvent supprimer un salon.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const salon = interaction.options.getChannel('salon');
    const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Confirmation de suppression')
      .setDescription(`<@${interaction.user.id}> demande la suppression de <#${salon.id}> (**#${salon.name}**).\n\nUn responsable doit **confirmer** ci-dessous. Cette action est **définitive**.`)
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sec_delch_ok:${salon.id}`).setLabel('✅ Confirmer la suppression').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('sec_delch_no').setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ embeds: [embed], components: [row] }).catch(() => {});
    return true;
  }

  // /supprimer-role
  if (interaction.isChatInputCommand?.() && interaction.commandName === 'supprimer-role') {
    if (!estAutorise(interaction.user.id)) { await interaction.reply({ content: '🔒 Seuls les responsables autorisés peuvent supprimer un rôle.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const role = interaction.options.getRole('role');
    if (role.id === interaction.guild.id) { await interaction.reply({ content: '⚠️ Impossible de supprimer le rôle @everyone.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    if (role.managed) { await interaction.reply({ content: '⚠️ Ce rôle est géré par une intégration/bot et ne peut pas être supprimé manuellement.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const embed = new EmbedBuilder().setColor(0xE67E22).setTitle('⚠️ Confirmation de suppression')
      .setDescription(`<@${interaction.user.id}> demande la suppression du rôle **@${role.name}**.\n\nUn responsable doit **confirmer** ci-dessous. Cette action est **définitive**.`)
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`sec_delrole_ok:${role.id}`).setLabel('✅ Confirmer la suppression').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('sec_delrole_no').setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary),
    );
    await interaction.reply({ embeds: [embed], components: [row] }).catch(() => {});
    return true;
  }

  // Annulation (salon ou rôle)
  if (interaction.isButton?.() && (interaction.customId === 'sec_delch_no' || interaction.customId === 'sec_delrole_no')) {
    if (!estAutorise(interaction.user.id)) { await interaction.reply({ content: '🔒 Action réservée aux responsables.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    await interaction.update({ content: '❌ Suppression annulée.', embeds: [], components: [] }).catch(() => {});
    return true;
  }

  // Confirmation suppression SALON
  if (interaction.isButton?.() && interaction.customId?.startsWith('sec_delch_ok:')) {
    if (!estAutorise(interaction.user.id)) { await interaction.reply({ content: '🔒 Seul un responsable autorisé peut confirmer.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const salonId = interaction.customId.split(':')[1];
    const salon = interaction.guild.channels.cache.get(salonId);
    if (!salon) { await interaction.update({ content: '⚠️ Ce salon n\'existe plus.', embeds: [], components: [] }).catch(() => {}); return true; }
    salonsAutorisesASupprimer.add(salonId);
    setTimeout(() => salonsAutorisesASupprimer.delete(salonId), 15000); // garde-fou anti-blocage
    await interaction.update({ content: `✅ Salon **#${salon.name}** supprimé (confirmé par <@${interaction.user.id}>).`, embeds: [], components: [] }).catch(() => {});
    await salon.delete(`Suppression confirmée par ${interaction.user.username}`).catch(() => { salonsAutorisesASupprimer.delete(salonId); });
    return true;
  }

  // Confirmation suppression RÔLE
  if (interaction.isButton?.() && interaction.customId?.startsWith('sec_delrole_ok:')) {
    if (!estAutorise(interaction.user.id)) { await interaction.reply({ content: '🔒 Seul un responsable autorisé peut confirmer.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const roleId = interaction.customId.split(':')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) { await interaction.update({ content: '⚠️ Ce rôle n\'existe plus.', embeds: [], components: [] }).catch(() => {}); return true; }
    rolesAutorisesASupprimer.add(roleId);
    setTimeout(() => rolesAutorisesASupprimer.delete(roleId), 15000);
    await interaction.update({ content: `✅ Rôle **@${role.name}** supprimé (confirmé par <@${interaction.user.id}>).`, embeds: [], components: [] }).catch(() => {});
    await role.delete(`Suppression confirmée par ${interaction.user.username}`).catch(() => { rolesAutorisesASupprimer.delete(roleId); });
    return true;
  }

  return false;
}

// ───────────────────────── Init ─────────────────────────
function initSecurite(client) {
  client.on('channelDelete', _onChannelDelete);
  client.on('roleDelete', _onRoleDelete);
  console.log('🛡️ Module sécurité actif (anti-nuke salons + rôles · suppression sous confirmation)');
}

module.exports = { initSecurite, routeInteraction, securiteCommands, AUTORISES };
