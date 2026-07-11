// ───────────────────────────────────────────────────────────────────────────
//  monitoring.js — Visibilité technique (le filet de sécurité)
//  ----------------------------------------------------------------------------
//  • Un salon « journal technique » (db.techLogChannelId) où le bot écrit ses
//    erreurs et son auto-contrôle — fini les pannes silencieuses.
//  • Auto-contrôle au démarrage : variables d'env, commandes en double,
//    permissions du bot, placement hiérarchique, salons configurés.
//  Module NEUF et ISOLÉ — n'altère rien d'existant.
//
//  /journal-technique-installer  (Direction → désigne CE salon)
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags, PermissionsBitField } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const invalidateCache = dbMod.invalidateCache || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const DIRECTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estDirection(member) { if (global.aAccesTotal?.(member)) return true;
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}
const FONDATEUR_ROLES = ['Fondateur', 'Fléau', 'Fleau', 'Concepteur'];
function estFondateur(member) {
  try { return !!member?.roles?.cache?.some(r => FONDATEUR_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}

// Anti-spam de logs identiques (évite d'inonder le salon si une erreur boucle)
const _recent = new Map();
function _tropRecent(cle) {
  const now = Date.now(); const last = _recent.get(cle) || 0;
  if (now - last < 60000) return true; // même log < 60 s → on saute
  _recent.set(cle, now);
  if (_recent.size > 200) _recent.clear();
  return false;
}

async function logTech(client, niveau, titre, details) {
  try {
    if (!client) return;
    const db = loadDB(); const id = db.techLogChannelId; if (!id) return;
    if (_tropRecent(`${niveau}|${titre}`)) return;
    const ch = await client.channels.fetch(id).catch(() => null); if (!ch) return;
    const couleur = niveau === 'error' ? 0xC0392B : niveau === 'warn' ? 0xE67E22 : 0x2ECC71;
    const e = new EmbedBuilder().setColor(couleur).setTitle(titre).setTimestamp().setFooter({ text: 'Iron Wolf Company • journal technique' });
    if (details) e.setDescription(String(details).slice(0, 4000));
    await ch.send({ embeds: [e], allowedMentions: { parse: [] } }).catch(() => {});
  } catch {}
}

async function autoCheck(client, commandNames) {
  try {
    const db = loadDB();
    const env = process.env;
    const lignes = [];

    // 1) Variables d'environnement
    const envs = { 'Clé IA (ANTHROPIC)': env.ANTHROPIC_API_KEY, 'Notion (token)': env.NOTION_TOKEN, 'GitHub (token)': env.GITHUB_TOKEN, 'GitHub (Gist ID)': env.GITHUB_GIST_ID };
    for (const [k, v] of Object.entries(envs)) lignes.push(`${v ? '✅' : '❌'} ${k}`);

    // 2) Doublons de commandes (la cause du blocage récent)
    let doublons = [];
    if (Array.isArray(commandNames)) {
      const vus = new Set();
      for (const n of commandNames) { if (vus.has(n)) { if (!doublons.includes(n)) doublons.push(n); } else vus.add(n); }
      lignes.push(doublons.length ? `❌ Commandes EN DOUBLE : ${doublons.join(', ')}` : `✅ Aucune commande en double (${commandNames.length} au total)`);
    }

    // 3) Salons configurés
    lignes.push(`${db.rumeursChannelId ? '✅' : '⚠️'} Salon rumeurs${db.rumeursChannelId ? '' : ' — /rumeurs-salon'}`);
    lignes.push(`${db.inventaire?.channelId ? '✅' : '⚠️'} Salon coffre${db.inventaire?.channelId ? '' : ' — /inventaire-installer'}`);
    lignes.push(`${db.repertoire?.channelId ? '✅' : '⚠️'} Panneau répertoire`);

    // 4) Permissions + placement du bot (par serveur)
    const flags = [
      ['Gérer les salons', PermissionsBitField.Flags.ManageChannels],
      ['Gérer les rôles', PermissionsBitField.Flags.ManageRoles],
      ['Bannir', PermissionsBitField.Flags.BanMembers],
      ['Voir les logs d\'audit', PermissionsBitField.Flags.ViewAuditLog],
      ['Créer des fils', PermissionsBitField.Flags.CreatePublicThreads],
    ];
    for (const guild of client.guilds.cache.values()) {
      const me = guild.members.me;
      const manque = flags.filter(([, f]) => !me?.permissions?.has(f)).map(([n]) => n);
      lignes.push(manque.length ? `⚠️ ${guild.name} — permissions manquantes : ${manque.join(', ')}` : `✅ ${guild.name} — permissions OK`);
      const pos = me?.roles?.highest?.position ?? 0;
      const top = guild.roles?.highest?.position ?? 0;
      if (top && pos < top - 1) lignes.push(`⚠️ ${guild.name} — rôle du bot bas dans la hiérarchie (protection anti-nuke limitée)`);
    }

    const niveau = doublons.length || Object.values(envs).some(v => !v) ? 'warn' : 'info';
    await logTech(client, niveau, '🩺 Auto-contrôle au démarrage', lignes.join('\n'));
    return { doublons };
  } catch (e) { console.log('❌ autoCheck:', e.message); return {}; }
}

// ── Restauration depuis une sauvegarde Gist ──
async function _gist(token, gistId) {
  try {
    const r = await fetch(`https://api.github.com/gists/${gistId}`, { headers: { 'Authorization': `Bearer ${token}`, 'User-Agent': 'iwc-bot', 'Accept': 'application/vnd.github+json' } });
    if (!r.ok) return null;
    return await r.json();
  } catch { return null; }
}
async function _fetchBackupContent(token, gistId, name) {
  try {
    const g = await _gist(token, gistId); if (!g) return null;
    const f = g.files?.[name]; if (!f) return null;
    if (f.content && !f.truncated) return f.content;
    if (f.raw_url) { const rr = await fetch(f.raw_url, { headers: { 'Authorization': `Bearer ${token}` } }); if (rr.ok) return await rr.text(); }
    return f.content || null;
  } catch { return null; }
}

const monitoringCommands = [
  new SlashCommandBuilder().setName('journal-technique-installer').setDescription('🛠️ Désigner CE salon comme journal technique du bot (Direction)'),
  new SlashCommandBuilder().setName('restaurer').setDescription('♻️ Restaurer les données depuis une sauvegarde (Fondateur — destructif)'),
];

async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'journal-technique-installer') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); db.techLogChannelId = interaction.channelId; persist(db);
      await logTech(interaction.client, 'info', '🛠️ Journal technique activé', 'Ce salon reçoit désormais les erreurs du bot et le bilan de démarrage.');
      await interaction.editReply({ content: '✅ Journal technique activé ici. Le bot y écrira ses erreurs et son auto-contrôle à chaque démarrage. Tu peux lancer un redémarrage (ou /sync) pour voir le premier bilan.' }).catch(() => {});
      return true;
    }

    // ── /restaurer : choisir une sauvegarde ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'restaurer') {
      if (!estFondateur(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au Fondateur / Fléau.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const token = process.env.GITHUB_TOKEN, gistId = process.env.GITHUB_GIST_ID;
      if (!token || !gistId) { await interaction.editReply({ content: '❌ Sauvegarde GitHub non configurée.' }).catch(() => {}); return true; }
      const g = await _gist(token, gistId);
      if (!g) { await interaction.editReply({ content: '❌ Impossible de lire les sauvegardes (Gist injoignable).' }).catch(() => {}); return true; }
      const backups = Object.keys(g.files || {}).filter(n => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort().reverse();
      if (!backups.length) { await interaction.editReply({ content: '❌ Aucune sauvegarde datée trouvée.' }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('restaurer_sel').setPlaceholder('Choisis une sauvegarde…')
        .addOptions(backups.slice(0, 25).map(n => { const d = (n.match(/backup-(\d{4}-\d{2}-\d{2})/) || [])[1]; return { label: d || n, description: `Sauvegarde du ${d || '?'}`, value: n }; }));
      await interaction.editReply({ content: '♻️ **Restauration** — choisis la sauvegarde à charger.\n⚠️ Elle **remplacera toutes les données actuelles**.', components: [new ActionRowBuilder().addComponents(menu)] }).catch(() => {});
      return true;
    }

    // ── Sélection d'une sauvegarde → confirmation ──
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'restaurer_sel') {
      if (!estFondateur(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au Fondateur / Fléau.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const name = interaction.values?.[0];
      const d = (String(name).match(/backup-(\d{4}-\d{2}-\d{2})/) || [])[1] || name;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`restaurer_ok::${name}`).setLabel('Oui, restaurer').setEmoji('♻️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('restaurer_no').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ content: `⚠️ **Confirmer la restauration du ${d} ?**\nToutes les données actuelles (membres, contrats, coffre, répertoire…) seront **remplacées** par celles de cette sauvegarde. **Irréversible.**`, components: [row] }).catch(() => {});
      return true;
    }

    // ── Annulation ──
    if (interaction.isButton?.() && interaction.customId === 'restaurer_no') {
      await interaction.update({ content: '❌ Restauration annulée — rien n\'a changé.', components: [] }).catch(() => {});
      return true;
    }

    // ── Confirmation de restauration ──
    if (interaction.isButton?.() && interaction.customId.startsWith('restaurer_ok::')) {
      if (!estFondateur(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au Fondateur / Fléau.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const name = interaction.customId.split('::')[1];
      await interaction.update({ content: `♻️ Restauration de **${name}** en cours…`, components: [] }).catch(() => {});
      const token = process.env.GITHUB_TOKEN, gistId = process.env.GITHUB_GIST_ID;
      const contenu = await _fetchBackupContent(token, gistId, name);
      if (!contenu) { await interaction.editReply({ content: '❌ Impossible de lire cette sauvegarde.' }).catch(() => {}); return true; }
      let data; try { data = JSON.parse(contenu); } catch { await interaction.editReply({ content: '❌ Sauvegarde illisible (JSON invalide).' }).catch(() => {}); return true; }
      if (!data || !data.members || !Object.keys(data.members).length) { await interaction.editReply({ content: '❌ Sauvegarde suspecte (aucun membre) — restauration annulée par sécurité.' }).catch(() => {}); return true; }
      try {
        saveDB(data);
        if (backupGit) await backupGit();
        invalidateCache();
        await logTech(interaction.client, 'warn', '♻️ Restauration effectuée', `Données restaurées depuis **${name}** par <@${interaction.user.id}>.`);
        await interaction.editReply({ content: `✅ Données restaurées depuis **${name}**.\nLes nouvelles actions utilisent déjà les données restaurées. Un **redémarrage** du bot garantit un rafraîchissement complet.` }).catch(() => {});
      } catch (e) { await interaction.editReply({ content: `❌ Échec de la restauration : ${e.message}` }).catch(() => {}); }
      return true;
    }

    return false;
  } catch (e) { if ([10062, 10008, 40060].includes(e?.code)) return true; console.log('❌ monitoring:', e.message); return true; }
}

module.exports = { monitoringCommands, routeInteraction, logTech, autoCheck };
