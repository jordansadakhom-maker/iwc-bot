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
const dbm = require('./db');

// ⚙️ Les deux seules personnes autorisées à supprimer (avec confirmation)
const AUTORISES = ['944208797084311583', '696325126047662081'];

// 👑 LE MAÎTRE — seul autorisé à : ajouter un bot, faire une sauvegarde,
//    et LEVER un verrouillage. Personne d'autre, même la Direction.
const MAITRE = '944208797084311583';

// ───────────────────────── VERROUILLAGE (kill switch) ─────────────────────────
//  En cas de tentative de sauvegarde/clonage/nuke non autorisée, le bot se FIGE
//  pour tout le monde sauf le Maître, l'alerte, et expulse l'intrus. L'état est
//  persisté en base → il survit à un redémarrage.
function _etatSecu() { try { const db = dbm.loadDB(); db.securite = db.securite || {}; return db.securite; } catch { return {}; } }
function estVerrouille() { try { return !!_etatSecu().verrou; } catch { return false; } }
function _setVerrou(val, raison, parId) {
  try {
    const db = dbm.loadDB(); db.securite = db.securite || {};
    db.securite.verrou = !!val;
    db.securite.raison = raison || null;
    db.securite.depuis = new Date().toISOString();
    db.securite.parId = parId || null;
    dbm.saveDB(db); dbm.saveDBSync?.();
  } catch (e) { console.log('[SÉCURITÉ] _setVerrou:', e?.message); }
}

// Compteur glissant pour détecter les actions de MASSE (clé = auteur:type d'action)
const _compteur = new Map();
function _massif(execId, action, seuil = 4, fenetreMs = 10000) {
  const key = `${execId}:${action}`; const now = Date.now();
  const arr = (_compteur.get(key) || []).filter(t => now - t < fenetreMs);
  arr.push(now); _compteur.set(key, arr);
  return arr.length >= seuil;
}

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

// Alerte dédiée au verrouillage, avec bouton « Déverrouiller » pour le Maître
async function _alerterVerrou(guild, raison) {
  const embed = new EmbedBuilder().setColor(0x8B0000)
    .setTitle('🔒 SERVEUR VERROUILLÉ — sécurité déclenchée')
    .setDescription(
      `**Une action non autorisée a été détectée :**\n${raison}\n\n` +
      `🧊 Le bot est désormais **gelé** pour tout le monde — plus aucune commande ne fonctionne.\n` +
      `👑 **Toi seul** peux le réactiver, avec le bouton ci-dessous ou \`/securite deverrouiller\`.`,
    ).setTimestamp();
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('sec_unlock').setLabel('🔓 Déverrouiller (Maître)').setStyle(ButtonStyle.Success),
  );
  try { const u = await guild.client.users.fetch(MAITRE); await u.send({ embeds: [embed], components: [row] }); } catch {}
  // On informe aussi les autres responsables (sans bouton — ils ne peuvent pas lever le verrou)
  for (const id of AUTORISES) { if (id === MAITRE) continue; try { const u = await guild.client.users.fetch(id); await u.send({ embeds: [embed] }); } catch {} }
  console.log(`[SÉCURITÉ] 🔒 VERROUILLAGE — ${raison.replace(/\n/g, ' ')}`);
}

// Déclenche le verrouillage : fige le bot, alerte le Maître, expulse l'intrus.
async function verrouiller(guild, raison, opts = {}) {
  const dejaVerrou = estVerrouille();
  _setVerrou(true, raison, opts.intrusId || null);
  // Expulsion / neutralisation de l'intrus
  try {
    if (opts.botId) { await guild.members.kick(opts.botId, 'Sécurité : bot ajouté sans autorisation du Maître').catch(() => {}); }
    if (opts.intrusId && opts.intrusId !== guild.ownerId && !AUTORISES.includes(opts.intrusId)) { await _neutraliser(guild, opts.intrusId); }
  } catch (e) { console.log('[SÉCURITÉ] expulsion intrus:', e?.message); }
  if (!dejaVerrou) await _alerterVerrou(guild, raison); // pas de spam si déjà verrouillé
}

// Lève le verrouillage — RÉSERVÉ AU MAÎTRE.
async function deverrouiller(userId, guild) {
  if (userId !== MAITRE) return false;
  _setVerrou(false, null, null);
  if (guild) { try { const u = await guild.client.users.fetch(MAITRE); await u.send('🔓 **Serveur déverrouillé.** Le bot refonctionne normalement.'); } catch {} }
  console.log(`[SÉCURITÉ] 🔓 Déverrouillé par le Maître (${userId}).`);
  return true;
}

// ───────────────────────── Détecteur (logs d'audit) ─────────────────────────
//  Un seul point d'entrée pour : bot ajouté + actions de masse.
const _MASS_ACTIONS = {
  [AuditLogEvent.ChannelCreate]: 'création de salons',
  [AuditLogEvent.ChannelDelete]: 'suppression de salons',
  [AuditLogEvent.RoleCreate]: 'création de rôles',
  [AuditLogEvent.RoleDelete]: 'suppression de rôles',
  [AuditLogEvent.MemberBanAdd]: 'bannissements',
  [AuditLogEvent.MemberKick]: 'expulsions',
  [AuditLogEvent.WebhookCreate]: 'création de webhooks',
};
async function _onAuditEntry(entry, guild) {
  try {
    if (!guild) return;
    const exec = entry.executorId;
    const botSelf = guild.client.user.id;
    if (exec === botSelf) return; // nos propres restaurations ne comptent pas

    // 1) BOT AJOUTÉ sans l'autorisation du Maître → expulsion + verrouillage
    if (entry.action === AuditLogEvent.BotAdd) {
      if (exec === MAITRE) { console.log('[SÉCURITÉ] Bot ajouté par le Maître — autorisé.'); return; }
      const botId = entry.targetId;
      await verrouiller(guild,
        `🤖 Un bot (<@${botId}>) a été ajouté par <@${exec || '??'}> **sans ton autorisation**. Il a été expulsé.`,
        { intrusId: exec, botId });
      return;
    }

    // 2) ACTIONS DE MASSE (clonage/nuke) → neutralisation + verrouillage
    if (_MASS_ACTIONS[entry.action] && exec && exec !== MAITRE) {
      if (_massif(exec, entry.action)) {
        await verrouiller(guild,
          `⚠️ Actions de **masse** détectées (${_MASS_ACTIONS[entry.action]}) par <@${exec}> — signe d'un clonage ou d'un nuke.`,
          { intrusId: exec });
      }
    }
  } catch (e) { console.log('[SÉCURITÉ] _onAuditEntry:', e?.message); }
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
    // Responsable autorisé (toi ou 696…) → action de confiance, on NE restaure PAS
    if (auteurId && estAutorise(auteurId)) { console.log(`[SÉCURITÉ] Salon #${channel.name} supprimé par un responsable autorisé (${auteurId}) — autorisé.`); return; }

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
    // Responsable autorisé (toi ou 696…) → action de confiance, on NE restaure PAS
    if (auteurId && estAutorise(auteurId)) { console.log(`[SÉCURITÉ] Rôle @${role.name} supprimé par un responsable autorisé (${auteurId}) — autorisé.`); return; }

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
  new SlashCommandBuilder().setName('securite').setDescription('🛡️ Verrouillage de sécurité (Maître)')
    .addSubcommand(s => s.setName('etat').setDescription('Voir si le serveur est verrouillé'))
    .addSubcommand(s => s.setName('verrouiller').setDescription('🔒 Verrouiller le bot manuellement (Maître)'))
    .addSubcommand(s => s.setName('deverrouiller').setDescription('🔓 Lever le verrouillage (Maître)')),
];

// ───────────────────────── Routeur d'interactions ─────────────────────────
async function routeInteraction(interaction) {
  // /securite (etat / verrouiller / deverrouiller)
  if (interaction.isChatInputCommand?.() && interaction.commandName === 'securite') {
    const sub = interaction.options.getSubcommand();
    if (sub === 'etat') {
      const e = _etatSecu();
      const txt = e.verrou
        ? `🔒 **Verrouillé** depuis ${e.depuis ? new Date(e.depuis).toLocaleString('fr-FR') : '?'}\n📋 Raison : ${e.raison || '—'}`
        : '✅ **Non verrouillé** — tout fonctionne normalement.';
      await interaction.reply({ content: txt, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.user.id !== MAITRE) { await interaction.reply({ content: '🔒 Seul le Maître peut (dé)verrouiller le bot.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    if (sub === 'verrouiller') {
      await verrouiller(interaction.guild, `🔒 Verrouillage manuel demandé par le Maître.`, {});
      await interaction.reply({ content: '🔒 Bot **verrouillé**. Plus aucune commande ne répond, sauf pour toi. Utilise `/securite deverrouiller` pour rétablir.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (sub === 'deverrouiller') {
      await deverrouiller(interaction.user.id, interaction.guild);
      await interaction.reply({ content: '🔓 Bot **déverrouillé** — tout refonctionne.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
  }
  // Bouton « Déverrouiller » (depuis l'alerte MP du Maître)
  if (interaction.isButton?.() && interaction.customId === 'sec_unlock') {
    if (interaction.user.id !== MAITRE) { await interaction.reply({ content: '🔒 Seul le Maître peut lever le verrouillage.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const g = interaction.guild || interaction.client.guilds.cache.first();
    await deverrouiller(interaction.user.id, g);
    await interaction.update({ content: '🔓 **Serveur déverrouillé.** Le bot refonctionne normalement.', embeds: [], components: [] }).catch(() => {});
    return true;
  }

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
  // Détecteur central : bot ajouté + actions de masse → verrouillage
  client.on('guildAuditLogEntryCreate', (entry, guild) => { _onAuditEntry(entry, guild).catch(() => {}); });
  console.log('🛡️ Module sécurité actif (anti-nuke · verrouillage anti-clonage/nuke · Maître = ' + MAITRE + ')');
}

module.exports = { initSecurite, routeInteraction, securiteCommands, AUTORISES, MAITRE, estVerrouille, verrouiller, deverrouiller };
