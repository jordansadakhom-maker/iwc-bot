require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ChannelType, ActivityType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, MessageFlags,
} = require('discord.js');
const cron = require('node-cron');

const { loadDB, saveDB, saveDBSync, sauvegarderSurGitHub, restaurerDepuisGitHub } = require('./db');

let notionExtra = {};
try { notionExtra = require('./notion-extra'); console.log('✅ Module notion-extra chargé'); }
catch (e) { console.log('⚠️ notion-extra non chargé:', e.message); }

let notionModules = {};
try { notionModules = require('./notion-modules-v2'); console.log('✅ Module notion-modules-v2 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v2 non chargé:', e.message); }

let notionV3 = {};
try { notionV3 = require('./notion-modules-v3'); console.log('✅ Module notion-modules-v3 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v3 non chargé:', e.message); }

let notionV4 = {};
try { notionV4 = require('./notion-modules-v4'); console.log('✅ Module notion-modules-v4 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v4 non chargé:', e.message); }

let notionV5 = {};
try { notionV5 = require('./notion-modules-v5'); console.log('✅ Module notion-modules-v5 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v5 non chargé:', e.message); }

process.on('unhandledRejection', reason => console.log('⚠️ Unhandled Rejection:', reason?.message || reason));
process.on('uncaughtException',  err    => console.log('⚠️ Uncaught Exception:', err?.message || err));
process.on('SIGTERM', () => { saveDBSync(); process.exit(0); });
process.on('SIGINT',  () => { saveDBSync(); process.exit(0); });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel, Partials.GuildMember],
});

// ── Configuration centralisée ──
const {
  CH, PARTICIPANTS_MAP, CONTRAT_ROLES, JUNE_MCCALL_ID,
  ROLE_POLE_LEGAL, ROLE_POLE_ILLEGAL, ROLE_ABSENT,
  MEMBRES_DISCORD_MAP, DISCORD_TO_IC,
  NOTION_RECRUTEMENT_DB, NOTION_MEMBRES_DB_ID: NOTION_MEMBRES_DB,
  SALON_IDS, _getPole,
} = require('./config');

// ── getCh amélioré — utilise l'ID si configuré dans SALON_IDS ──
function getChById(guild, salonKey, ...fallbackNames) {
  const id = SALON_IDS?.[salonKey];
  if (id) { const ch = guild.channels.cache.get(id); if (ch) return ch; }
  for (const name of fallbackNames) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('stats').setDescription('Affiche les statistiques de la Compagnie'),
  new SlashCommandBuilder().setName('solde').setDescription('Affiche les soldes des coffres'),
  new SlashCommandBuilder().setName('fiche').setDescription("Affiche la fiche d'un membre").addStringOption(o => o.setName('nom').setDescription('Nom du personnage').setRequired(true)),
  new SlashCommandBuilder().setName('ops').setDescription('Liste les opérations actives'),
  new SlashCommandBuilder().setName('absent').setDescription('Déclarer une absence')
    .addStringOption(o => o.setName('duree').setDescription('Durée de l\'absence').setRequired(true)
      .addChoices(
        { name: '1 jour',       value: '1 jour'       },
        { name: '2 jours',      value: '2 jours'      },
        { name: '3 jours',      value: '3 jours'      },
        { name: '1 semaine',    value: '1 semaine'    },
        { name: '2 semaines',   value: '2 semaines'   },
        { name: 'Indéterminé',  value: 'Indéterminé'  },
      ))
    .addStringOption(o => o.setName('raison').setDescription('Raison (optionnel)').setRequired(false)),
  new SlashCommandBuilder().setName('rapport').setDescription('Envoie le rapport quotidien en DM (Direction)'),
  new SlashCommandBuilder().setName('promo').setDescription('Promeut un membre (Direction)').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('rang').setDescription('Nouveau rang').setRequired(true).setAutocomplete(true)),
  new SlashCommandBuilder().setName('retro').setDescription('Rétrograde un membre (Direction)').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)).addStringOption(o => o.setName('rang').setDescription('Nouveau rang').setRequired(true).setAutocomplete(true)).addStringOption(o => o.setName('raison').setDescription('Raison (optionnel)').setRequired(false)),
  new SlashCommandBuilder().setName('tresor').setDescription('💰 Enregistrer une transaction'),
  new SlashCommandBuilder().setName('dashboard').setDescription('🐺 Tableau de bord complet de la faction'),
  new SlashCommandBuilder().setName('grade-set').setDescription('🎖️ Attribuer un grade à un membre (Direction)'),
  new SlashCommandBuilder().setName('hierarchie').setDescription('⚔️ Afficher le tableau hiérarchique'),
  new SlashCommandBuilder().setName('affaire').setDescription('📋 Soumettre une affaire à la Direction'),
  new SlashCommandBuilder().setName('journal').setDescription('📖 Journal IC de la Compagnie')
    .addStringOption(o => o.setName('type').setDescription('Filtrer par type').setRequired(false)
      .addChoices({ name: 'Tous', value: 'all' }, { name: 'Opérations', value: 'operation' }, { name: 'Contrats', value: 'contrat' }, { name: 'Recrutement', value: 'recrutement' }, { name: 'Trésorerie', value: 'tresorerie' }, { name: 'Promotions', value: 'promotion' }))
    .addIntegerOption(o => o.setName('page').setDescription('Numéro de page').setRequired(false)),
  new SlashCommandBuilder().setName('contrats-archives').setDescription('📜 Archives de tous les contrats')
    .addStringOption(o => o.setName('statut').setDescription('Filtrer par statut').setRequired(false)
      .addChoices({ name: 'Tous', value: 'tous' }, { name: 'Actifs', value: 'actif' }, { name: 'Refusés', value: 'refuse' }, { name: 'Expirés', value: 'expire' }))
    .addIntegerOption(o => o.setName('page').setDescription('Numéro de page').setRequired(false)),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche le profil d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)').setRequired(false)),
  new SlashCommandBuilder().setName('bilan').setDescription('📊 Résumé trésorerie 7 derniers jours')
    .addStringOption(o => o.setName('coffre').setDescription('Quel coffre ?').setRequired(false)
      .addChoices({ name: '⚖️ Légal', value: 'legal' }, { name: '🔒 Illégal', value: 'illegal' })),
  new SlashCommandBuilder().setName('agenda').setDescription('📅 Voir ou créer un RDV')
    .addSubcommand(s => s.setName('voir').setDescription('Voir les prochains RDV'))
    .addSubcommand(s => s.setName('creer').setDescription('Créer un nouveau RDV dans Notion')),
  new SlashCommandBuilder().setName('op-programmer').setDescription('🕐 Programmer une opération avec lancement automatique (Direction)'),
  new SlashCommandBuilder().setName('aide').setDescription('📖 Guide des commandes disponibles'),
  new SlashCommandBuilder().setName('version').setDescription('🔢 Version du bot et statut des connexions'),
  new SlashCommandBuilder().setName('sync').setDescription('🔄 Forcer une synchronisation manuelle (Direction)'),
  new SlashCommandBuilder().setName('avertir').setDescription('⚠️ Avertir un membre (Direction)')
    .addUserOption(o => o.setName('membre').setDescription('Membre à avertir').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Raison de l\'avertissement').setRequired(true)),
  new SlashCommandBuilder().setName('avertissements').setDescription('📋 Voir les avertissements d\'un membre')
    .addUserOption(o => o.setName('membre').setDescription('Membre (optionnel, défaut: toi)').setRequired(false)),
  new SlashCommandBuilder().setName('retour').setDescription('✅ Déclarer son retour d\'absence'),
  new SlashCommandBuilder().setName('purge').setDescription('🗑️ Effacer les messages d\'un salon (Direction)')
    .addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages à supprimer (1-100, défaut: tous)').setRequired(false).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('annuler-absence').setDescription('🔓 Lever l\'absence d\'un membre (Direction)')
    .addUserOption(o => o.setName('membre').setDescription('Membre dont lever l\'absence').setRequired(true)),
  new SlashCommandBuilder().setName('contrats').setDescription('📜 Voir mes contrats en cours'),
  new SlashCommandBuilder().setName('registre').setDescription('📋 Liste des membres actifs (Direction)')
    .addStringOption(o => o.setName('pole').setDescription('Filtrer par pôle').setRequired(false)
      .addChoices({ name: 'Tous', value: 'tous' }, { name: '⚖️ Légal', value: 'legal' }, { name: '🔒 Illégal', value: 'illegal' }))
    .addIntegerOption(o => o.setName('page').setDescription('Page').setRequired(false)),
  new SlashCommandBuilder().setName('op').setDescription('🎯 Détail d\'une opération')
    .addStringOption(o => o.setName('id').setDescription('ID de l\'opération').setRequired(false)),
].map(c => c.toJSON());

async function registerSlashCommands(guild) {
  try { await guild.commands.set(SLASH_COMMANDS); console.log('✅ Slash commands enregistrées'); }
  catch (e) { console.log('❌ Slash commands error:', e.message); }
}

function nomParticipant(member) { return DISCORD_TO_IC[member.id] || member.user?.username || member.displayName || 'Inconnu'; }
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function fmtLong(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

// getCh : cherche par inclusion (gère les emojis comme 🗺️・plans)
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

// getChExact : match exact après nettoyage (gère 🔒・coffre-illegal)
function getChExact(guild, name) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return guild.channels.cache.find(c => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) && clean(c.name) === clean(name)) || null;
}

function getMention(guild) { return guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ') || ''; }
function getContratMention(guild) { const roles = CONTRAT_ROLES.map(id => guild.roles.cache.get(id)).filter(Boolean).map(r => `<@&${r.id}>`); return [...roles, `<@${JUNE_MCCALL_ID}>`].join(' '); }
function isDirection(member) { return member?.roles.cache.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'].some(n => r.name.includes(n))); }

async function getLogsCh(guild) { let ch = guild.channels.cache.get(CH.LOGS); if (!ch) ch = await guild.channels.fetch(CH.LOGS).catch(() => null); return ch; }

async function sendToThread(guild, threadId, payload) {
  try {
    const direct = await guild.channels.fetch(threadId).catch(() => null);
    if (direct) { await direct.send(payload); return true; }
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isTextBased?.()) continue;
      try { const fetched = await channel.threads.fetch().catch(() => null); if (!fetched) continue; const thread = fetched.threads?.get(threadId) || channel.threads.cache.get(threadId); if (thread) { await thread.send(payload); return true; } } catch {}
    }
  } catch (e) { console.log('sendToThread error:', e.message); }
  return false;
}

async function sendLog(guild, type, data) {
  const ch = await getLogsCh(guild); if (!ch) return;
  const cfgs = {
    ARRIVEE: { color: 0x57F287, emoji: '👋', title: 'ARRIVÉE — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '🔢 Âge du compte', value: data.accountAge + ' jours', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    DEPART: { color: 0x555555, emoji: '🚪', title: 'DÉPART — ' + data.username, fields: [{ name: '👤 Membre', value: data.username, inline: true }, { name: '🎖️ Rang', value: data.rang || '—', inline: true }, { name: '⏱️ Durée', value: data.duree || '—', inline: true }] },
    REGLEMENT_VALIDE: { color: 0x3B82F6, emoji: '📜', title: 'RÈGLEMENT VALIDÉ — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_RECUE: { color: 0xFFA500, emoji: '📥', title: 'CANDIDATURE REÇUE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_ACCEPTEE: { color: 0x57F287, emoji: '✅', title: 'CANDIDATURE ACCEPTÉE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '✅ Par', value: data.validePar || '—', inline: true }] },
    CANDIDATURE_REFUSEE: { color: 0xED4245, emoji: '❌', title: 'CANDIDATURE REFUSÉE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }] },
    ABSENCE: { color: 0xFFA500, emoji: '🟡', title: 'ABSENCE — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CONTRAT_SIGNE: { color: 0x57F287, emoji: '📜', title: 'CONTRAT SIGNÉ — ' + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }, { name: '✍️ Signé par', value: data.signe, inline: true }] },
    CONTRAT_REFUSE: { color: 0xED4245, emoji: '📜', title: 'CONTRAT REFUSÉ — ' + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }] },
    OPERATION: { color: 0xFFA500, emoji: '🎯', title: 'OPÉRATION — ' + data.nom, fields: [{ name: '🎯 Nom', value: data.nom, inline: true }, { name: '📍 Lieu', value: data.lieu || '—', inline: true }, { name: '📋 Statut', value: data.statut || '—', inline: true }] },
    PROMOTION: { color: 0x57F287, emoji: '⬆️', title: 'PROMOTION — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📉 Ancien rang', value: data.ancienRang || '—', inline: true }, { name: '📈 Nouveau rang', value: data.nouveauRang || '—', inline: true }, { name: '✅ Décidé par', value: data.validePar || '—', inline: true }] },
    RETROGRADATION: { color: 0xED4245, emoji: '⬇️', title: 'RÉTROGRADATION — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📉 Ancien rang', value: data.ancienRang || '—', inline: true }, { name: '📈 Nouveau rang', value: data.nouveauRang || '—', inline: true }, { name: '📝 Raison', value: data.raison || '—', inline: true }] },
  };
  const cfg = cfgs[type]; if (!cfg) return;
  await ch.send({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(cfg.emoji + ' ' + cfg.title).addFields(...cfg.fields).setFooter({ text: 'IWC • Logs • ' + new Date().toLocaleString('fr-FR') })] }).catch(e => console.log('Log error:', e.message));
}

async function archiverCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN) return;
  try { await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: NOTION_RECRUTEMENT_DB }, properties: { 'Nom personnage': { title: [{ text: { content: cand.nomPerso || '—' } }] }, 'Date réception': { date: { start: cand.receivedAt ? new Date(cand.receivedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } }, 'Statut': { select: { name: statut === 'acceptee' ? '✅ Accepté' : '❌ Refusé' } }, 'Type': { select: { name: cand.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } }, 'Disponibilités': { rich_text: [{ text: { content: cand.dispos || '—' } }] }, 'Expérience RP': { rich_text: [{ text: { content: (cand.background || '—').slice(0, 2000) } }] }, 'Vote Direction': { rich_text: [{ text: { content: validePar || '—' } }] }, 'Notes': { rich_text: [{ text: { content: statut === 'acceptee' ? `Accepté par ${validePar} le ${fmtShort(new Date())}` : `Refusé le ${fmtShort(new Date())}` } }] }, 'Discord ID': { rich_text: [{ text: { content: cand.userId || '—' } }] }, 'Discord Username': { rich_text: [{ text: { content: cand.username || '—' } }] } } }) }); console.log(`✅ Candidature ${cand.nomPerso} archivée`); } catch (e) { console.log('❌ Archivage candidature error:', e.message); }
}

async function ajouterMembreNotion(cand, type) {
  if (!process.env.NOTION_TOKEN) return;
  try { await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: NOTION_MEMBRES_DB }, properties: { 'Nom': { title: [{ text: { content: cand.nomPerso || '—' } }] }, 'Personnage': { rich_text: [{ text: { content: cand.nomPerso || '—' } }] }, "Date d'entrée": { date: { start: new Date().toISOString().split('T')[0] } }, 'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } }, 'Pôle': { select: { name: type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } }, 'Rang': { select: { name: type === 'illegal' ? 'Loup Confirmé' : 'Recrue' } }, 'Statut': { select: { name: '✅ Actif' } }, 'Notes': { rich_text: [{ text: { content: `Accepté le ${fmtShort(new Date())}` } }] } } }) }); console.log(`✅ Registre Notion: ${cand.nomPerso} ajouté`); } catch (e) { console.log('❌ Registre Notion error:', e.message); }
}

async function syncRegistreNotion(guild) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_MEMBRES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ sorts: [{ property: 'Nom', direction: 'ascending' }] }) });
    const data = await res.json(); if (!data.results) return;
    const logsCh = await getLogsCh(guild); const today = new Date();
    for (const page of data.results) {
      const nomIC = page.properties['Nom']?.title?.[0]?.plain_text || page.properties['Personnage']?.rich_text?.[0]?.plain_text;
      const statut = page.properties['Statut']?.select?.name; const derniereActivite = page.properties['Dernière activité']?.date?.start;
      const discordId = MEMBRES_DISCORD_MAP[nomIC]; if (!discordId) continue;
      const member = await guild.members.fetch(discordId).catch(() => null); if (!member) continue;
      if (derniereActivite && logsCh) {
        const jours = Math.floor((today - new Date(derniereActivite)) / 86400000);
        const db2 = loadDB(); if (!db2.alertesInactivite) db2.alertesInactivite = {};
        const keyAlerte = `inactif_${discordId}_${Math.floor(jours / 7)}`;
        if (jours >= 7 && statut === '✅ Actif' && !db2.alertesInactivite[keyAlerte]) {
          await logsCh.send({ content: getMention(guild), embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`⚠️ Inactivité Notion — ${nomIC}`).setDescription(`**${nomIC}** est inactif depuis **${jours} jours** selon le Registre Notion.`).addFields({ name: '📅 Dernière activité', value: fmtShort(derniereActivite), inline: true }, { name: '📋 Statut', value: statut, inline: true }).setFooter({ text: 'IWC • Sync Registre Notion' })] });
          db2.alertesInactivite[keyAlerte] = true; saveDB(db2);
        }
      }
    }
  } catch (e) { console.log('❌ Sync registre error:', e.message); }
}

async function updateDashboard(guild) {
  const db = loadDB(); const ch = getChById(guild, 'DASHBOARD', 'dashboard'); if (!ch) return;
  const members = Object.values(db.members); const contrats = db.contrats || [];
  const alertes = members.filter(m => m.status !== 'parti' && daysSince(m.lastActivity) > 7);
  const nextSess = (db.sessions || []).filter(s => s.status === 'planifiee' && new Date(s.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 IRON WOLF COMPANY — TABLEAU DE BORD').setDescription('*Mise à jour automatique toutes les heures*')
    .addFields(
      { name: '👥 MEMBRES', value: [`✅ Actifs : **${members.filter(m => m.status === 'actif').length}**`, `⚠️ Absents : **${members.filter(m => m.status === 'absent').length}**`, `❌ Inactifs : **${members.filter(m => m.status === 'inactif').length}**`, `👁️ Total : **${members.filter(m => m.status !== 'parti').length}**`].join('\n'), inline: true },
      { name: '🎯 OPÉRATIONS', value: [`🟢 En cours : **${(db.operations || []).filter(o => o.status === 'en_cours').length}**`, `🟡 Préparation : **${(db.operations || []).filter(o => o.status === 'preparation').length}**`, `✅ Terminées : **${(db.operations || []).filter(o => o.status === 'terminee').length}**`].join('\n'), inline: true },
      { name: '📝 RECRUTEMENT', value: [`📥 En attente : **${(db.candidatures || []).filter(c => ['reçue', 'examen'].includes(c.status)).length}**`, `✅ Acceptés : **${(db.candidatures || []).filter(c => c.status === 'acceptee').length}**`].join('\n'), inline: true },
      { name: '📜 CONTRATS', value: [`🟡 En attente : **${contrats.filter(c => c.status === 'en_attente').length}**`, `✅ Signés : **${contrats.filter(c => c.status === 'signe').length}**`, `❌ Refusés : **${contrats.filter(c => c.status === 'refuse').length}**`].join('\n'), inline: true },
      { name: '📅 PROCHAINE SESSION', value: nextSess ? `**${nextSess.name}**\n📍 ${nextSess.lieu || '—'}\n🗓️ ${fmtShort(nextSess.date)}` : '*Aucune session planifiée*', inline: true },
      { name: alertes.length > 0 ? `⚠️ ALERTES (${alertes.length})` : '✅ AUCUNE ALERTE', value: alertes.length > 0 ? alertes.slice(0, 5).map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)}j`).join('\n') : '*Tous les membres sont actifs*', inline: true },
    ).setFooter({ text: `Dernière MàJ : ${new Date().toLocaleString('fr-FR')} • IWC 1895` });
  try {
    // Anti-doublon : scanner le salon, supprimer les anciens messages bot, garder un seul
    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (msgs) {
      const botMsgs = [...msgs.values()]
        .filter(m => m.author.id === ch.guild.members.me?.id && m.embeds?.length > 0)
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      // Supprimer les doublons (garder seulement le plus récent)
      for (let i = 1; i < botMsgs.length; i++) await botMsgs[i].delete().catch(() => {});
      // Réutiliser le plus récent si disponible
      if (botMsgs.length > 0) {
        try { await botMsgs[0].edit({ embeds: [embed] }); db.dashboardMsgId = botMsgs[0].id; saveDB(db); return; }
        catch { await botMsgs[0].delete().catch(() => {}); }
      }
    }
    // Fallback : essayer l'ID sauvegardé
    if (db.dashboardMsgId) {
      const msg = await ch.messages.fetch(db.dashboardMsgId).catch(() => null);
      if (msg) { await msg.edit({ embeds: [embed] }); return; }
    }
    // Créer un nouveau message
    const sent = await ch.send({ embeds: [embed] }); db.dashboardMsgId = sent.id; saveDB(db);
  } catch (e) { console.log('Dashboard error:', e.message); }
}

const JOURS_AVANT_KICK = 5;
async function autoKickVisiteurs(guild) {
  try {
    const db = loadDB(); const logsCh = await getLogsCh(guild); const maintenant = Date.now(); let kicked = 0;
    for (const [id, membre] of Object.entries(db.members || {})) {
      if (membre.status !== 'visiteur') continue;
      const joursDepuis = Math.floor((maintenant - new Date(membre.joinedAt).getTime()) / 86400000);
      if (joursDepuis < JOURS_AVANT_KICK) continue;
      try {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) { delete db.members[id]; continue; }
        if (!member.roles.cache.some(r => r.name.includes('Visiteur'))) { db.members[id].status = 'actif'; continue; }
        await member.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🚪 Iron Wolf Company').setDescription(`Tu as été retiré du serveur car tu n'as pas validé le règlement dans les **${JOURS_AVANT_KICK} jours** suivant ton arrivée.\n\n*La porte est ouverte une fois. Une seule.*\n— La Direction`).setFooter({ text: 'IWC • Système automatique' })] }).catch(() => {});
        const ok = await member.kick(`Visiteur inactif depuis ${joursDepuis} jours`).then(() => true).catch(() => false);
        if (!ok) continue;
        delete db.members[id]; kicked++;
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`🚪 AUTO-KICK — ${member.user.username}`).addFields({ name: '👤 Membre', value: member.user.username, inline: true }, { name: '⏱️ Arrivé il y a', value: `${joursDepuis} jours`, inline: true }, { name: '📋 Raison', value: 'Règlement non validé', inline: true }).setFooter({ text: `IWC • Auto-kick • ${fmtShort(new Date())}` })] });
      } catch (e) { console.log(`❌ Auto-kick error ${id}:`, e.message); }
    }
    if (kicked > 0) saveDB(db);
    console.log(`✅ Auto-kick : ${kicked} visiteur(s) kické(s)`);
  } catch (e) { console.log('❌ autoKickVisiteurs error:', e.message); }
}

async function checkSessionReminders(guild) {
  const db = loadDB(); if (!db.sessionReminders) return;
  const now = Date.now(); let changed = false;
  for (const [id, r] of Object.entries(db.sessionReminders)) {
    if ((r.remindAt + 3600000 + 10800000) < now) { delete db.sessionReminders[id]; changed = true; continue; }
    if (!r.sent && r.remindAt <= now && now < r.remindAt + 5400000) {
      const ch = guild.channels.cache.get(r.channelId) || getChById(guild, 'PLANNING', 'planning');
      if (ch) await ch.send({ content: getMention(guild) || undefined, embeds: [new EmbedBuilder().setColor(0xFF6B35).setTitle(`⏰ RAPPEL — ${r.name} dans 1 heure`).setDescription(`📍 ${r.lieu || '—'} · 🕐 ${r.heure || '—'}`).setFooter({ text: 'IWC • Rappel automatique' })] }).catch(() => {});
      r.sent = true; changed = true;
    }
  }
  if (changed) saveDB(db);
}

async function envoyerRapportDirection(guild) {
  try {
    const db = loadDB(); const hier = Date.now() - 86400000; const depuisHier = d => d && new Date(d).getTime() >= hier;
    const nouveaux = Object.values(db.members || {}).filter(m => depuisHier(m.joinedAt));
    const departs = Object.values(db.members || {}).filter(m => m.status === 'parti' && depuisHier(m.leftAt));
    const candsRecues = (db.candidatures || []).filter(c => depuisHier(c.receivedAt));
    const candsAccept = (db.candidatures || []).filter(c => c.status === 'acceptee' && depuisHier(c.acceptedAt));
    const candsRefus = (db.candidatures || []).filter(c => c.status === 'refusee' && depuisHier(c.refusedAt || c.receivedAt));
    const contratsSign = (db.contrats || []).filter(c => c.status === 'signe' && depuisHier(c.signedAt));
    const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours');
    const opsTermHier = (db.operations || []).filter(o => o.status === 'terminee' && depuisHier(o.endedAt));
    const alertes = Object.values(db.members || {}).filter(m => m.status !== 'parti' && daysSince(m.lastActivity) > 7);
    const visiteurs = Object.values(db.members || {}).filter(m => m.status === 'visiteur');
    const soldeLegal = db.coffres?.legal || 0; const soldeIlleg = db.coffres?.illegal || 0;
    const embed = new EmbedBuilder().setColor(0x8B1A1A)
      .setTitle(`📋 Rapport hebdomadaire — Semaine du ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`)
      .setDescription('*Résumé des dernières 24 heures — Iron Wolf Company*')
      .addFields(
        { name: '👥 MEMBRES', value: [`🆕 Arrivées : **${nouveaux.length}**`, `🚪 Départs : **${departs.length}**`, `👁️ Visiteurs : **${visiteurs.length}**`, alertes.length > 0 ? `⚠️ Inactifs : **${alertes.length}**` : '✅ Aucune inactivité'].join('\n'), inline: false },
        { name: '📋 RECRUTEMENT', value: candsRecues.length > 0 ? [`📥 Reçues : **${candsRecues.length}**`, `✅ Acceptées : **${candsAccept.length}**`, `❌ Refusées : **${candsRefus.length}**`].join('\n') : '*Aucune candidature hier*', inline: true },
        { name: '📜 CONTRATS', value: contratsSign.length > 0 ? contratsSign.map(c => `→ \`${c.id}\` — ${c.objet}`).join('\n') : '*Aucun contrat signé hier*', inline: true },
        { name: '🎯 OPÉRATIONS', value: [opsEnCours.length > 0 ? `🟢 En cours : **${opsEnCours.length}**` : '🟢 Aucune', opsTermHier.length > 0 ? `✅ Terminées hier : **${opsTermHier.length}**` : ''].filter(Boolean).join('\n') || '*Aucune activité*', inline: false },
        { name: '💰 TRÉSORERIE', value: [`⚖️ Légal : **$${soldeLegal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${soldeIlleg.toLocaleString('fr-FR')}**`, `💎 Total : **$${(soldeLegal + soldeIlleg).toLocaleString('fr-FR')}**`].join('\n'), inline: false },
      ).setFooter({ text: `IWC • Rapport automatique • ${new Date().toLocaleString('fr-FR')}` });
    // Uniquement au Fléau et Concepteur
    const rolesCibles = ['Fléau', 'Concepteur'];
    let envoyes = 0;
    const membres = await guild.members.fetch().catch(() => null);
    if (membres) {
      for (const [, member] of membres) {
        const estCible = member.roles.cache.some(r => rolesCibles.some(n => r.name.includes(n)));
        if (!estCible) continue;
        try { await member.send({ embeds: [embed] }); envoyes++; } catch {}
      }
    }
    console.log(`✅ Rapport hebdo envoyé à ${envoyes} membre(s) (Fléau/Concepteur)`);
  } catch (e) { console.log('❌ Rapport quotidien error:', e.message); }
}

async function handleSlashCommand(interaction) {
  const { commandName, guild } = interaction; const db = loadDB();
  if (commandName === 'grade-set')         return notionV3.handleGradeSetCommand?.(interaction);
  if (commandName === 'hierarchie')        return notionV3.handleHierarchieCommand?.(interaction);
  if (commandName === 'affaire')           return notionV3.handleAffaireNouvelleButton?.(interaction);
  if (commandName === 'tresor')            return notionModules.handleTresorCommand?.(interaction);
  if (commandName === 'dashboard')         return notionModules.handleDashboard?.(interaction);
  if (commandName === 'journal')           return notionModules.handleJournalCommand?.(interaction);
  if (commandName === 'contrats-archives') return notionModules.handleContratsArchives?.(interaction);
  if (commandName === 'contrats')          return _handleMesContrats(interaction);
  if (commandName === 'registre')         return _handleRegistre(interaction);
  if (commandName === 'op')               return _handleOpDetail(interaction);
  if (commandName === 'profil')            return handleProfilEnhanced(interaction);
  if (commandName === 'bilan')             return notionModules.handleBilanCommand?.(interaction);
  if (commandName === 'agenda')            return notionV3.handleAgendaCommand?.(interaction);
  if (commandName === 'op-programmer')     return _ouvrirModalOpProgrammee(interaction);
  if (commandName === 'aide')              return _handleAide(interaction);
  if (commandName === 'version')           return _handleVersion(interaction);
  if (commandName === 'sync')              return _handleSync(interaction);
  if (commandName === 'avertir')           return _handleAvertir(interaction);
  if (commandName === 'avertissements')    return _handleAvertissements(interaction);
  if (commandName === 'retour')            return _handleRetour(interaction);
  if (commandName === 'annuler-absence')   return _handleAnnulerAbsence(interaction);
  if (commandName === 'purge')             return _handlePurge(interaction);

  if (commandName === 'stats') return notionV5.handleStatsAvancees?.(interaction);
  if (commandName === '_stats_old') {
    const members = Object.values(db.members || {}); const contrats = db.contrats || []; const ops = db.operations || []; const cands = db.candidatures || [];
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('📊 Statistiques — Iron Wolf Company').addFields({ name: '👥 Membres', value: [`✅ Actifs : **${members.filter(m => m.status === 'actif').length}**`, `⚠️ Absents : **${members.filter(m => m.status === 'absent').length}**`, `👁️ Total : **${members.filter(m => m.status !== 'parti').length}**`].join('\n'), inline: true }, { name: '🎯 Opérations', value: [`🟢 En cours : **${ops.filter(o => o.status === 'en_cours').length}**`, `🟡 Prépa : **${ops.filter(o => o.status === 'preparation').length}**`, `✅ Terminées : **${ops.filter(o => o.status === 'terminee').length}**`].join('\n'), inline: true }, { name: '📋 Recrutement', value: [`📥 En attente : **${cands.filter(c => c.status === 'reçue').length}**`, `✅ Acceptés : **${cands.filter(c => c.status === 'acceptee').length}**`].join('\n'), inline: true }, { name: '📜 Contrats', value: [`✅ Signés : **${contrats.filter(c => c.status === 'signe').length}**`, `🟡 En attente : **${contrats.filter(c => c.status === 'en_attente').length}**`].join('\n'), inline: true }, { name: '💰 Trésorerie', value: [`⚖️ Légal : **$${(db.coffres?.legal || 0).toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${(db.coffres?.illegal || 0).toLocaleString('fr-FR')}**`].join('\n'), inline: true }).setFooter({ text: `IWC • ${new Date().toLocaleString('fr-FR')}` })], ephemeral: false });
    return;
  }
  if (commandName === 'solde') {
    const soldeLegal = db.coffres?.legal || 0; const soldeIlleg = db.coffres?.illegal || 0;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('💰 Soldes des coffres — IWC').addFields({ name: '⚖️ Coffre Légal', value: `**$${soldeLegal.toLocaleString('fr-FR')}**`, inline: true }, { name: '🔒 Coffre Illégal', value: `**$${soldeIlleg.toLocaleString('fr-FR')}**`, inline: true }, { name: '💎 Total', value: `**$${(soldeLegal + soldeIlleg).toLocaleString('fr-FR')}**`, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })], flags: isDirection(interaction.member) ? undefined : MessageFlags.Ephemeral });
    return;
  }
  if (commandName === 'fiche') {
    const nom = interaction.options.getString('nom').toLowerCase();
    const cand = (db.candidatures || []).find(c => c.status === 'acceptee' && c.nomPerso?.toLowerCase().includes(nom));
    if (!cand) { const nomIC = Object.keys(MEMBRES_DISCORD_MAP).find(n => n.toLowerCase().includes(nom)); if (nomIC) { const discordId = MEMBRES_DISCORD_MAP[nomIC]; const membre = db.members[discordId]; await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`👤 Fiche — ${nomIC}`).setDescription('*Membre fondateur — fiche à compléter dans Notion*').addFields({ name: '🎭 Personnage', value: nomIC, inline: true }, { name: '📋 Statut', value: membre?.status === 'absent' ? '⚠️ Absent' : '✅ Actif', inline: true }, { name: '🎖️ Rang', value: membre?.rang || '—', inline: true }).setFooter({ text: 'IWC • Fiche personnage' })], flags: MessageFlags.Ephemeral }); return; } await interaction.reply({ content: `❌ Aucune fiche trouvée pour **${interaction.options.getString('nom')}**.`, flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(cand.type === 'illegal' ? 0x8B1A1A : 0x3B82F6).setTitle(`👤 Fiche — ${cand.nomPerso}`).addFields({ name: '🎭 Personnage', value: cand.nomPerso, inline: true }, { name: '🎂 Âge', value: cand.agePerso || '—', inline: true }, { name: '⚖️ Pôle', value: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal', inline: true }, { name: '💼 Métier', value: cand.metier || cand.specialite || '—', inline: true }, { name: '🕐 Disponibilités', value: cand.dispos || '—', inline: true }, { name: '📅 Entrée', value: fmtShort(cand.acceptedAt), inline: true }, { name: '📖 Background', value: (cand.background || '—').slice(0, 500) + ((cand.background?.length || 0) > 500 ? '...' : '') }).setFooter({ text: 'IWC • Fiche personnage' })], flags: MessageFlags.Ephemeral });
    return;
  }
  if (commandName === 'ops') {
    const opsActives = (db.operations || []).filter(o => ['preparation', 'en_cours'].includes(o.status));
    if (!opsActives.length) { await interaction.reply({ content: '*Aucune opération en cours ou en préparation.*', flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🎯 Opérations actives — IWC').setDescription(opsActives.map(o => [`**${o.name}** — ${o.status === 'en_cours' ? '🟢 En cours' : '🟡 Préparation'}`, `📍 ${o.lieu || '—'} · 👥 ${(o.participants || []).join(', ') || 'Aucun'}`].join('\n')).join('\n\n')).setFooter({ text: `IWC • ${fmtShort(new Date())}` })], ephemeral: false });
    return;
  }
  if (commandName === 'absent') {
    const duree  = interaction.options.getString('duree');
    const raison = interaction.options.getString('raison') || '—';

    // Calculer la date de fin selon la durée
    const dureeJours = { '1 jour': 1, '2 jours': 2, '3 jours': 3, '1 semaine': 7, '2 semaines': 14 };
    const joursAbsence = dureeJours[duree] || null;
    const finAbsence   = joursAbsence ? new Date(Date.now() + joursAbsence * 86400000).toISOString() : null;

    // Mettre à jour la DB
    if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
    db.members[interaction.user.id].status      = 'absent';
    db.members[interaction.user.id].absentJusqu = finAbsence;
    db.members[interaction.user.id].absentRaison= raison;
    db.members[interaction.user.id].lastActivity= new Date().toISOString();
    saveDB(db);

    // Attribuer le rôle Absent → retire les permissions d'écriture
    const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
    if (membreDiscord) {
      const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
      if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(e => console.log('❌ Rôle absent:', e.message));
    }

    await notionExtra.majStatutActiviteNotion?.(interaction.user.id, 'absent');
    _syncMembreNotion(interaction.user.id, { status: 'absent', lastActivity: new Date().toISOString() }).catch(() => {});
    await sendLog(guild, 'ABSENCE', { userId: interaction.user.id, username: interaction.user.username });

    const retourStr = finAbsence
      ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
      : 'Indéterminé — utilise /retour quand tu reviendras';

    await interaction.reply({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('🟡 Absence enregistrée')
        .addFields(
          { name: '⏱️ Durée',          value: duree,     inline: true },
          { name: '📅 Retour prévu',   value: retourStr, inline: true },
          { name: '📝 Raison',         value: raison,    inline: false },
        )
        .setDescription('*Tes permissions d\'écriture sont suspendues jusqu\'à ton retour.*')
        .setFooter({ text: 'IWC • Utilise /retour pour lever ton absence manuellement' })
      ],
    });

    // Post dans #absences
    const absCh = getChById(guild, 'ABSENCES', 'absences');
    if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setAuthor({ name: `${interaction.member?.displayName || interaction.user.username} — Absence`, iconURL: interaction.user.displayAvatarURL() })
      .setTitle('🟡 Déclaration d\'absence')
      .addFields(
        { name: '👤 Membre',        value: `<@${interaction.user.id}>`, inline: true },
        { name: '⏱️ Durée',         value: duree,                       inline: true },
        { name: '📅 Retour prévu',  value: retourStr,                   inline: true },
        { name: '📝 Raison',        value: raison,                      inline: false },
      )
      .setFooter({ text: `IWC • ${fmtShort(new Date())}` })
      .setTimestamp()
    ] });
    return;
  }
  if (commandName === 'rapport') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ content: '📋 Rapport en cours d\'envoi en DM...', flags: MessageFlags.Ephemeral });
    await envoyerRapportDirection(guild); return;
  }
  if (commandName === 'promo') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    const cible = interaction.options.getUser('membre'); const nouveauRang = interaction.options.getString('rang');
    const membre = await guild.members.fetch(cible.id).catch(() => null);
    if (!membre) { await interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral }); return; }
    const ancienRang = db.members[cible.id]?.rang || '—';
    if (db.members[cible.id]) { db.members[cible.id].rang = nouveauRang; saveDB(db); }
    _syncMembreNotion(cible.id, { rang: nouveauRang, lastActivity: new Date().toISOString() }).catch(() => {});
    await sendLog(guild, 'PROMOTION', { userId: cible.id, username: cible.username, ancienRang, nouveauRang, validePar: interaction.user.username });
    await notionExtra.logPromotionNotion?.(guild, { userId: cible.id, username: cible.username, nomPerso: db.members[cible.id]?.name || cible.username, ancienRang, nouveauRang, type: 'promotion', validePar: interaction.user.username });
    await notionModules.ajouterJournalIC?.(guild, { type: 'promotion', emoji: '⬆️', titre: `Promotion — ${cible.username}`, description: `${ancienRang} → **${nouveauRang}** · Décidé par ${interaction.user.username}`, auteur: interaction.user.username });
    // DM légal — Iron Wolf Company
    const _isIllegP = db.members[cible.id]?.pole === 'illegal';
    const _orgP = _isIllegP ? 'La Confrérie' : 'Iron Wolf Company';
    await membre.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`⬆️ Promotion — ${_orgP}`).setDescription(`Ton grade au sein de **${_orgP}** a été mis à jour.\n\n**Nouveau rang :** ${nouveauRang}\n\n${_isIllegP ? "*Tu as prouvé ta valeur dans l'ombre.*" : '*La Compagnie reconnaît ta valeur.*'}\n— La Direction`).setFooter({ text: _isIllegP ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })] }).catch(() => {});
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`⬆️ Promotion — ${cible.username}`).addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '📉 Ancien rang', value: ancienRang, inline: true }, { name: '📈 Nouveau rang', value: nouveauRang, inline: true }, { name: '✅ Décidé par', value: interaction.user.username, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    return;
  }
  if (commandName === 'retro') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    const cible = interaction.options.getUser('membre'); const nouveauRang = interaction.options.getString('rang'); const raison = interaction.options.getString('raison') || '—';
    const membre = await guild.members.fetch(cible.id).catch(() => null);
    if (!membre) { await interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral }); return; }
    const ancienRang = db.members[cible.id]?.rang || '—';
    if (db.members[cible.id]) { db.members[cible.id].rang = nouveauRang; saveDB(db); }
    _syncMembreNotion(cible.id, { rang: nouveauRang, lastActivity: new Date().toISOString() }).catch(() => {});
    await sendLog(guild, 'RETROGRADATION', { userId: cible.id, username: cible.username, ancienRang, nouveauRang, raison, validePar: interaction.user.username });
    await notionExtra.logPromotionNotion?.(guild, { userId: cible.id, username: cible.username, nomPerso: db.members[cible.id]?.name || cible.username, ancienRang, nouveauRang, type: 'retrogradation', validePar: interaction.user.username });
    await notionModules.ajouterJournalIC?.(guild, { type: 'promotion', emoji: '⬇️', titre: `Rétrogradation — ${cible.username}`, description: `${ancienRang} → **${nouveauRang}** · Raison : ${raison}`, auteur: interaction.user.username });
    // DM légal — Iron Wolf Company
    const _isIllegR = db.members[cible.id]?.pole === 'illegal';
    const _orgR = _isIllegR ? 'La Confrérie' : 'Iron Wolf Company';
    await membre.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`⬇️ Rétrogradation — ${_orgR}`).setDescription(`Ton grade au sein de **${_orgR}** a été mis à jour.\n\n**Nouveau rang :** ${nouveauRang}\n**Raison :** ${raison}\n\n*La Direction a pris cette décision.*\n— La Direction`).setFooter({ text: _isIllegR ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })] }).catch(() => {});
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`⬇️ Rétrogradation — ${cible.username}`).addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '📉 Ancien rang', value: ancienRang, inline: true }, { name: '📈 Nouveau rang', value: nouveauRang, inline: true }, { name: '📝 Raison', value: raison, inline: true }, { name: '✅ Décidé par', value: interaction.user.username, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    return;
  }
}

// ══════════════════════════════════════════════════════
// NETTOYAGE — dépingle + doublons + notifications système
// ══════════════════════════════════════════════════════
async function cleanBotPinnedMessages(guild, ...channelNames) {
  const botId = guild.members.me?.id; if (!botId) return;
  for (const name of channelNames) {
    try {
      const ch = getCh(guild, name); if (!ch) continue;
      // 1. Dépingler tous les messages épinglés du bot
      const pinned = await ch.messages.fetchPins().catch(() => null);
      if (pinned) { for (const [, msg] of pinned) { if (msg.author.id !== botId) continue; await msg.unpin().catch(() => {}); await msg.delete().catch(() => {}); console.log(`🧹 Pin supprimé #${ch.name}`); } }
      // 2. Supprimer notifications "X a épinglé" (type 6) + doublons embeds bot
      const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      if (!msgs) continue;
      for (const [, msg] of msgs) { if (msg.type === 6) await msg.delete().catch(() => {}); }
      const botMsgs = [...msgs.values()].filter(m => m.author.id === botId && m.embeds?.length > 0).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      for (let i = 1; i < botMsgs.length; i++) { await botMsgs[i].delete().catch(() => {}); console.log(`🧹 Doublon supprimé #${ch.name}`); }
    } catch (e) { console.log(`❌ cleanBotPinnedMessages error dans ${name}:`, e.message); }
  }
}

// ── Nettoyage messages de transaction orphelins (sans boutons = expirés) ──
async function _cleanTransactionMessages(guild, channelName) {
  try {
    const ch = getCh(guild, channelName); if (!ch) return;
    const botId = guild.members.me?.id; if (!botId) return;
    const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null); if (!msgs) return;
    const orphelins = [...msgs.values()].filter(m =>
      m.author.id === botId &&
      m.embeds?.length > 0 &&
      !(m.components?.length > 0) && // pas de boutons = message de transaction, pas le panel
      m.type === 0 // message normal
    );
    for (const m of orphelins) await m.delete().catch(() => {});
    if (orphelins.length > 0) console.log(`🧹 ${orphelins.length} transaction(s) orpheline(s) supprimée(s) dans #${ch.name}`);
  } catch (e) { console.log('❌ _cleanTransactionMessages error:', e.message); }
}

// ── Auto-setup ──
async function autoSetup(guild) {
  const db = loadDB(); console.log('🔧 Auto-setup en cours...');
  // Nettoyage EN PREMIER
  await cleanBotPinnedMessages(guild, 'planning', 'grade', 'coffre-entreprise', 'coffre-illegal', 'informateurs', 'affaires');
  notionModules.nettoyerTransactionsFantomes?.();
  // Nettoyer aussi les messages de transaction orphelins dans les coffres (sans boutons = transactions expirées)
  await _cleanTransactionMessages(guild, 'coffre-entreprise');
  await _cleanTransactionMessages(guild, 'coffre-illegal');
  await updateDashboard(guild);
  await notionModules.setupTresorButton?.(guild);
  await notionV3.setupAffairesPanel?.(guild);
  await notionV3.updateHierarchieEmbed?.(guild);
  await notionV3.setupInformateursPanel?.(guild);
  await setupFicheFormat(guild);
  await setupPlansFormat(guild);
  await setupPlanningFormat(guild);
  await setupSurnomFormat(guild);
  await setupCommandesSlash(guild);
  await setupPanelDirection(guild);

  const reglCh = getChById(guild, 'REGLEMENT', 'reglement', 'règlement');
  if (reglCh) {
    const msgs = await reglCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.content.includes('VALIDATION'));
    if (existing) { db.reglementMsgId = existing.id; }
    else if (!db.reglementMsgId) { const sent = await reglCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ VALIDATION DU RÈGLEMENT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nSi vous avez lu et accepté le règlement dans son intégralité, réagissez avec ✅\n\n*En réagissant, vous confirmez avoir compris et accepté chaque article du code de la Compagnie.*\n— La Direction'); await sent.react('✅'); db.reglementMsgId = sent.id; }
    saveDB(db);
  }

  const recrutCh = guild.channels.cache.get(CH.RECRUTEMENT);
  if (recrutCh) {
    const msgs = await recrutCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('RECRUTEMENT') && m.components.length > 0 && m.components[0]?.components?.length >= 2);
    if (existing) { db.recrutementMsgId = existing.id; }
    else {
      if (db.recrutementMsgId) { const old = await recrutCh.messages.fetch(db.recrutementMsgId).catch(() => null); if (old) await old.delete().catch(() => {}); db.recrutementMsgId = null; }
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('📋 IRON WOLF COMPANY — RECRUTEMENT').setDescription('*On ne demande pas à rejoindre la Compagnie. On y est invité.*\n*Si vous êtes ici — vous avez été jugé digne de frapper à la porte.*').addFields({ name: '⚖️ Recrutement Légal', value: '→ Tu exerces un métier légal au sein de la Compagnie\n→ Protection, escorte, commerce...\n→ Clique sur **⚖️ Candidature Légale**' }, { name: '🔪 Recrutement Illégal', value: "→ Tu opères dans l'ombre pour l'organisation\n→ Contrebande, sécurité, assassinat...\n→ Clique sur **🔪 Candidature Illégale**" }, { name: '⚠️ Important', value: '→ Réponse en DM sous 48h\n→ Aucune justification en cas de refus\n→ *La porte est ouverte une fois. Une seule.*' }).setFooter({ text: 'Iron Wolf Company • Recrutement officiel' });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_candidature_legal').setLabel('⚖️ Candidature Légale').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('open_candidature_illegal').setLabel('🔪 Candidature Illégale').setStyle(ButtonStyle.Danger));
      const sent = await recrutCh.send({ embeds: [embed], components: [row] }); db.recrutementMsgId = sent.id;
    }
    saveDB(db);
  }

  const contratsCh = guild.channels.cache.get(CH.CONTRATS);
  if (contratsCh) {
    const msgs = await contratsCh.messages.fetch({ limit: 20 });
    if (!msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('CONTRATS'))) {
      const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 IRON WOLF COMPANY — CONTRATS').setDescription('*Tout accord entre la Compagnie et ses partenaires doit être formalisé.*\n*Un contrat signé engage les deux parties sans exception.*').addFields({ name: '📤 Envoyer nos conditions', value: '→ Tu envoies tes tarifs & conditions à un client\n→ Le client signe → tu reçois la notification' }, { name: '📥 Signer un contrat employeur', value: '→ Une entreprise vous engage\n→ Tu rentres ses infos & ses conditions\n→ Tu signes → ils reçoivent la notification' }).setFooter({ text: 'Iron Wolf Company • Secrétariat officiel' });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_contrat_offre').setLabel('📤 Envoyer nos conditions').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('open_contrat_emploi').setLabel('📥 Signer un contrat employeur').setStyle(ButtonStyle.Success));
      await contratsCh.send({ embeds: [embed], components: [row] });
    }
  }

  const surnomCh = getChById(guild, 'SURNOM_PSEUDO', 'surnom-pseudo', 'surnom');
  if (surnomCh) { const msgs = await surnomCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id)) await surnomCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎭 SURNOM / PSEUDO — IDENTITÉ IC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nRenseignez votre identité **In Character** pour faciliter les interactions RP.\n\n**Format :**\n```\nPSEUDO DISCORD : \nNOM IC : \nSURNOM IC : \nAPPARTENANCE : Légal / Illégal\n```\n*Un seul message par membre. Mettez à jour si votre personnage change.*'); }

  // Coffre illégal — getChExact trouve 🔒・coffre-illegal par nettoyage des emojis
  const coffreIllegCh = getChExact(guild, 'coffre-illegal');
  if (coffreIllegCh) { const msgs = await coffreIllegCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id && m.content.includes('COFFRE'))) await coffreIllegCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒 COFFRE — FINANCES ILLÉGALES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n*Ce canal est strictement confidentiel.*\n*Utilisez le bouton Nouvelle Transaction dans coffre-entreprise pour enregistrer.*'); }

  console.log('✅ Auto-setup terminé\n');
}

// ── Notion Agenda ──
async function notionQueryAgenda() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return [];
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Date', date: { on_or_after: new Date().toISOString() } }, sorts: [{ property: 'Date', direction: 'ascending' }] }) });
    const data = await res.json();
    return (data.results || []).map(p => ({ id: p.id, titre: p.properties.Titre?.title?.[0]?.plain_text || '—', date: p.properties.Date?.date?.start, heure: p.properties.Heure?.rich_text?.[0]?.plain_text, type: p.properties.Type?.select?.name || 'Réunion', participants: p.properties.Participants?.multi_select?.map(x => x.name) || [], lieu: p.properties.Lieu?.rich_text?.[0]?.plain_text || '—', notes: p.properties.Notes?.rich_text?.[0]?.plain_text, notif24: p.properties['Notif 24h']?.checkbox, notif1h: p.properties['Notif 1h']?.checkbox, notif15: p.properties['Notif 15min']?.checkbox, statut: p.properties['Statut']?.select?.name || '', url: p.url }));
  } catch { return []; }
}

function parisOffsetHours(date) { const tzStr = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' }); const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' }); return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000); }
function buildRdvDate(dateStr, heureStr) {
  if (!dateStr) return null; const jour = dateStr.split('T')[0]; let hh = 0, mm = 0;
  if (heureStr && /\d{1,2}[:hH]\d{2}/.test(heureStr)) { const m = heureStr.match(/(\d{1,2})[:hH](\d{2})/); hh = parseInt(m[1], 10); mm = parseInt(m[2], 10); }
  else if (dateStr.includes('T')) { const t = dateStr.split('T')[1]; hh = parseInt(t.slice(0, 2), 10); mm = parseInt(t.slice(3, 5), 10); }
  const provisoire = new Date(`${jour}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00Z`);
  return new Date(provisoire.getTime() - parisOffsetHours(provisoire) * 3600000);
}
function buildParticipantMentions(participants) { return participants.map(name => { const val = PARTICIPANTS_MAP[name]; if (!val) return null; return val.startsWith('<@') ? val : `<@${val}>`; }).filter(Boolean).join(' '); }

async function sendParticipantDMs(guild, appt, title, color) {
  for (const name of (appt.participants || [])) {
    const discordId = PARTICIPANTS_MAP[name]; if (!discordId || discordId.startsWith('<@&')) continue;
    try { const member = await guild.members.fetch(discordId).catch(() => null); if (!member) continue; await member.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title).setDescription(`## 📅 ${appt.titre}`).addFields({ name: '🗓️ Quand', value: `${fmtLong(appt.date)}${appt.heure ? ` à **${appt.heure}**` : ''}`, inline: true }, { name: '📍 Lieu', value: appt.lieu, inline: true }, ...(appt.notes ? [{ name: '📝 Notes', value: appt.notes }] : []), { name: '🔗 Notion', value: `[Ouvrir](${appt.url})` }).setFooter({ text: 'IWC • Rappel automatique' })] }); } catch {}
  }
}

async function checkAgenda(guild) {
  const appts = await notionQueryAgenda();
  const ch = getChById(guild, 'AGENDA', 'agenda') || getChById(guild, 'PLANNING', 'planning');
  if (!ch || !appts.length) return;

  const mention = getMention(guild);
  const db = loadDB();
  if (!db.sentReminders) db.sentReminders = {};
  if (!db.reminderMsgIds) db.reminderMsgIds = {};
  let changed = false;

  for (const a of appts) {
    if (a.statut === 'Annulé' || !a.date) continue;
    const dt = buildRdvDate(a.date, a.heure); if (!dt) continue;
    const mins     = Math.floor((dt.getTime() - Date.now()) / 60000);
    const ping     = buildParticipantMentions(a.participants) || mention;
    const heureAff = dt.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

    const mkEmbed = (t, c) => new EmbedBuilder()
      .setColor(c).setTitle(t)
      .setDescription(`## 📅 ${a.titre}`)
      .addFields(
        { name: 'Quand',        value: `${fmtLong(a.date)}${heureAff ? ` à **${heureAff}**` : ''}`, inline: true },
        { name: 'Lieu',         value: a.lieu || '—', inline: true },
        { name: 'Participants', value: a.participants?.length > 0 ? a.participants.join(', ') : '—' },
        ...(a.notes ? [{ name: 'Notes', value: a.notes }] : []),
        { name: 'Modifier', value: `[Notion](${a.url})` },
      )
      .setFooter({ text: 'IWC • Secrétariat automatique' });

    const sent    = k => db.sentReminders[`${a.id}_${k}`];
    const getMsgId = k => db.reminderMsgIds[`${a.id}_${k}`];

    // Fonction pour envoyer un rappel et supprimer le précédent
    const envoyerRappel = async (key, prevKey, pingText, embed, dmTitle, dmColor) => {
      if (sent(key)) return;

      // Supprimer le message du rappel précédent
      if (prevKey && getMsgId(prevKey)) {
        const prevMsg = await ch.messages.fetch(getMsgId(prevKey)).catch(() => null);
        if (prevMsg) await prevMsg.delete().catch(() => {});
        delete db.reminderMsgIds[`${a.id}_${prevKey}`];
      }

      // Envoyer le nouveau rappel
      const msg = await ch.send({ content: pingText, embeds: [embed] }).catch(() => null);
      if (msg) {
        db.reminderMsgIds[`${a.id}_${key}`] = msg.id;
      }

      await sendParticipantDMs(guild, a, dmTitle, dmColor);
      db.sentReminders[`${a.id}_${key}`] = true;
      changed = true;
    };

    if (mins > 0) {
      // Rappel 24h
      if (a.notif24 && !sent('24h') && mins <= 1440 && mins > 60) {
        await envoyerRappel('24h', null, `${ping} — 📅 RDV dans 24h`, mkEmbed('📅 Rappel — 24 heures', 0x5865F2), '📅 Rappel — RDV dans 24h', 0x5865F2);
      }
      // Rappel 1h — supprime le 24h
      if (a.notif1h && !sent('1h') && mins <= 60 && mins > 15) {
        await envoyerRappel('1h', '24h', `${ping} — ⏰ RDV dans 1 heure`, mkEmbed('⏰ Rappel — 1 heure', 0xFFA500), '⏰ Rappel — RDV dans 1 heure', 0xFFA500);
      }
      // Rappel 15min — supprime le 1h
      if (a.notif15 && !sent('15min') && mins <= 15) {
        await envoyerRappel('15min', '1h', `${ping} — 🚨 15 minutes !`, mkEmbed('🚨 URGENT — 15 min', 0xED4245), '🚨 URGENT — RDV dans 15 minutes !', 0xED4245);
      }
    }

    // Nettoyer après le RDV (> 2h passé)
    if (mins < -120) {
      ['24h','1h','15min'].forEach(k => {
        delete db.sentReminders[`${a.id}_${k}`];
        delete db.reminderMsgIds[`${a.id}_${k}`];
      });
      changed = true;
    }
  }

  if (changed) saveDB(db);
}

async function postDailyAgenda(guild) {
  const ch = getChById(guild, 'AGENDA', 'agenda') || getChById(guild, 'PLANNING', 'planning'); if (!ch) return;
  const appts = await notionQueryAgenda(); const today = new Date().toISOString().split('T')[0];
  const todayA = appts.filter(a => a.date?.startsWith(today) && a.statut !== 'Annulé'); if (!todayA.length) return;
  const weekA = appts.filter(a => { if (!a.date || a.statut === 'Annulé') return false; const d = new Date(a.date); return d >= new Date() && d <= new Date(Date.now() + 7*86400000); });
  const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📅 Agenda — ${fmtLong(new Date())}`).setDescription(todayA.map(a => `📅 **${a.titre}**\n🕐 ${a.heure || '—'} · 📍 ${a.lieu} · 👥 ${a.participants.join(', ') || '—'}`).join('\n\n'));
  const nw = weekA.filter(a => !a.date?.startsWith(today)).slice(0, 5);
  if (nw.length) embed.addFields({ name: '📆 Cette semaine', value: nw.map(a => `📅 **${a.titre}** — ${fmtShort(a.date)} ${a.heure || ''}`).join('\n') });
  embed.setFooter({ text: 'IWC • Secrétariat automatique' });
  await ch.send({ content: getMention(guild) || undefined, embeds: [embed] });
}

// ════════════════════════════════════════════════
// ÉVÉNEMENTS
// ════════════════════════════════════════════════

client.on('guildMemberAdd', async member => {
  const db = loadDB(); const guild = member.guild;
  const visiteurRole = guild.roles.cache.find(r => r.name.includes('Visiteur'));
  if (visiteurRole) await member.roles.add(visiteurRole).catch(() => {});
  db.members[member.id] = { id: member.id, name: member.user.username, status: 'visiteur', rang: 'Visiteur', joinedAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
  saveDB(db);
  const arriveesCh = getChById(guild, 'ARRIVEES', 'arrivees', 'arrivée');
  if (arriveesCh) await arriveesCh.send({ embeds: [new EmbedBuilder().setColor(0x8B5A2A).setTitle('👁️ Nouveau visiteur').setDescription(`**${member.user.username}** a rejoint le serveur.\nDirigé vers **#règlement** pour validation.`).addFields({ name: 'Compte créé le', value: fmtShort(member.user.createdAt), inline: true }, { name: 'Âge du compte', value: `${daysSince(member.user.createdAt)} jours`, inline: true }).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: 'IWC • Automatique' })] });
  await sendLog(guild, 'ARRIVEE', { userId: member.id, username: member.user.username, accountAge: daysSince(member.user.createdAt) });
  await notionExtra.alerteCompteSuspect?.(guild, member);
  member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Iron Wolf Company').setDescription('Bienvenue sur le serveur.\n\nLis le **#règlement** et réagis avec ✅ pour accéder au recrutement.\n\n*La porte est ouverte une fois. Une seule.*').setFooter({ text: '— La Direction, IWC' })] }).catch(() => {});
});

client.on('guildMemberRemove', async member => {
  const db = loadDB(); const m = db.members[member.id];
  await sendLog(member.guild, 'DEPART', { username: member.user.username, rang: m?.rang, duree: m ? daysSince(m.joinedAt) + ' jours' : '—' });
  if (db.members[member.id]) { db.members[member.id].status = 'parti'; db.members[member.id].leftAt = new Date().toISOString(); saveDB(db); }
  _syncMembreNotion(member.id, { status: 'parti', leftAt: new Date().toISOString() }).catch(() => {});
  await notionModules.ajouterJournalIC?.(member.guild, { type: 'autre', emoji: '🚪', titre: `Départ — ${member.user.username}`, description: `${member.user.username} a quitté la Compagnie.`, auteur: 'Système' });
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); } catch { return; }
  const db = loadDB(); const guild = reaction.message.guild; if (!guild) return;

  if (reaction.message.id === db.reglementMsgId && reaction.emoji.name === '✅') {
    await sendLog(guild, 'REGLEMENT_VALIDE', { userId: user.id, username: user.username });
    const logsCh = await getLogsCh(guild); if (logsCh) await logsCh.send({ content: `${getMention(guild)} — **${user.username}** a validé le règlement.` });
    return;
  }

  if (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') {
    const title = reaction.message.embeds[0]?.title || ''; if (!title.includes('DOSSIER')) return;
    const isIllegal = title.includes('ILLÉGAL'); const isAccept = reaction.emoji.name === '✅';
    const nom = title.replace(/📁 \[.*?\] DOSSIER (LÉGAL|ILLÉGAL) — /, '').replace(/✅ ACCEPTÉ — /, '').trim();
    const cand = (db.candidatures || []).find(c => c.nomPerso === nom && c.status === 'reçue'); if (!cand) return;
    const reactUsers = await reaction.users.fetch(); const voteCount = reactUsers.filter(u => !u.bot).size; const VOTES_REQUIS = 2;
    if (voteCount < VOTES_REQUIS) { const msg = await reaction.message.channel.send({ content: `⏳ **${voteCount}/${VOTES_REQUIS} votes** pour ${isAccept ? 'accepter' : 'refuser'} **${cand.nomPerso}**. Il manque **${VOTES_REQUIS - voteCount} vote(s)**.` }); setTimeout(() => msg.delete().catch(() => {}), 10000); return; }
    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (isAccept) {
      if (member) {
        if (isIllegal) {
          const role = guild.roles.cache.find(r => r.name.includes('Maudit') || r.name.includes('Ombre')); if (role) await member.roles.add(role).catch(() => {});
          member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle("🔪 Bienvenue dans l'ombre — La Confrérie").setDescription("Tu as été **accepté** au sein de la Confrérie.\n\nDiscrétion absolue.\n\n*Ne fais confiance qu'à ceux que la Direction te désignera.*\n— La Direction").setFooter({ text: 'La Confrérie • Confidentiel' })] }).catch(() => {});
          const annCh = guild.channels.cache.get(CH.DOSSIER_ILLEG); if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle("🔪 La Confrérie — Nouveau visage dans l'ombre").setDescription(`**${cand.nomPerso}** a intégré la Confrérie.\n*Certains chemins ne se montrent pas à la lumière.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` })] });
        } else {
          const role = guild.roles.cache.find(r => r.name.includes('Recrue') || r.name.includes('Employé')); if (role) await member.roles.add(role).catch(() => {});
          member.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Candidature acceptée — Iron Wolf Company').setDescription("Ta candidature a été **acceptée**.\n\nLa période d'observation commence maintenant.\n\n*Tu connais les règles. Tu connais les attentes.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Légal' })] }).catch(() => {});
          const annCh = guild.channels.cache.get(CH.DOSSIER_LEGAL); if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Nouveau membre — Iron Wolf Company').setDescription(`**${cand.nomPerso}** rejoint la Compagnie.\n*Bienvenue dans la meute.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` })] });
        }
      }
      cand.status = 'acceptee'; cand.acceptedAt = new Date().toISOString(); saveDB(db);
      await archiverCandidatureNotion(cand, 'acceptee', user.username); await ajouterMembreNotion(cand, cand.type);
      _syncCandidatureNotion(cand, 'acceptee', user.username).catch(() => {});
      notionV5.archiverThreadCandidature?.(guild, cand, 'acceptee', user.username).catch(() => {});
      await notionExtra.creerFichePersonnageNotion?.(cand); notionExtra.planifierRappelFiche?.(guild, cand);
      await sendLog(guild, 'CANDIDATURE_ACCEPTEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal', validePar: user.username });
      await notionModules.ajouterJournalIC?.(guild, { type: 'recrutement', emoji: '🐺', titre: `Nouveau membre — ${cand.nomPerso}`, description: `${cand.nomPerso} rejoint la Compagnie · Pôle : ${isIllegal ? '🔪 Illégal' : '⚖️ Légal'} · Accepté par ${user.username}`, auteur: user.username });
      try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(isIllegal ? 0x8B1A1A : 0x3B82F6).setTitle(`✅ ACCEPTÉ — ${cand.nomPerso}`)] }); } catch {}
    } else {
      cand.status = 'refusee'; cand.refusedAt = new Date().toISOString(); saveDB(db);
      _syncCandidatureNotion(cand, 'refusee', user.username).catch(() => {});
      await archiverCandidatureNotion(cand, 'refusee', user.username);
      notionV5.archiverThreadCandidature?.(guild, cand, 'refusee', user.username).catch(() => {});
      await sendLog(guild, 'CANDIDATURE_REFUSEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal' });
      if (member) { const embedRefus = isIllegal ? new EmbedBuilder().setColor(0x555555).setTitle('La Confrérie').setDescription("Ta demande n'a pas été retenue.\n\n*On ne donne pas d'explication.*\n— La Direction").setFooter({ text: 'La Confrérie • Confidentiel' }) : new EmbedBuilder().setColor(0xED4245).setTitle('Iron Wolf Company').setDescription("Ta candidature n'a pas été retenue.\n\n*La Direction se réserve le droit de refuser sans justification.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Légal' }); member.send({ embeds: [embedRefus] }).catch(() => {}); }
      try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(0xED4245).setTitle(`❌ REFUSÉ — ${cand.nomPerso}`)] }); } catch {}
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const absenceHandled = await notionV3.handleAbsenceDetection?.(message);
  if (absenceHandled) return;
  const db = loadDB(); const guild = message.guild;

  if (db.members[message.author.id]) {
    const wasAbsent = db.members[message.author.id].status === 'absent'; const wasInactif = db.members[message.author.id].status === 'inactif';
    db.members[message.author.id].lastActivity = new Date().toISOString();
    if (wasAbsent || wasInactif) {
      db.members[message.author.id].status = 'actif';
      _syncMembreNotion(message.author.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
      // Notification de retour dans #absences
      const absCh2 = getChById(guild, 'ABSENCES', 'absences');
      if (absCh2 && wasAbsent) {
        const mData = db.members[message.author.id];
        absCh2.send({ embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setAuthor({ name: `${message.member?.displayName || message.author.username} — Retour`, iconURL: message.author.displayAvatarURL() })
          .setTitle('✅ Retour d\'absence')
          .addFields(
            { name: '👤 Membre',  value: `<@${message.author.id}>`, inline: true },
            { name: '🎖️ Grade',  value: mData?.rang || '—',          inline: true },
            { name: '📅 Retour', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
          )
          .setFooter({ text: 'IWC • Retour automatique détecté' })
          .setTimestamp()
        ] }).catch(() => {});
      }
      await notionExtra.majStatutActiviteNotion?.(message.author.id, 'actif');
      if (wasInactif) { const logsCh = await getLogsCh(guild); if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Retour activité — ${message.author.username}`).setDescription(`**${message.author.username}** est de retour après une période d'inactivité.`).addFields({ name: '📅 Date retour', value: fmtShort(new Date()), inline: true }).setFooter({ text: 'IWC • Activité automatique' })] }).catch(() => {}); }
    }
    saveDB(db);
  }

  const absCh = getChById(guild, 'ABSENCES', 'absences');
  if (absCh && message.channel.id === absCh.id) {
    if (db.members[message.author.id]) { db.members[message.author.id].status = 'absent'; saveDB(db); await message.react('✅'); await notionExtra.majStatutActiviteNotion?.(message.author.id, 'absent'); }
    await notionV3.syncAbsenceNotion?.(message.author.id, 'absent').catch(() => {});
    await notionV4.posterAbsencePropre?.(guild, message.member, message.content, `#${message.channel.name}`).catch(() => {});
    await sendLog(guild, 'ABSENCE', { userId: message.author.id, username: message.author.username }); return;
  }

  const infosCh = getChById(guild, 'INFORMATEURS', 'informateurs');
  if (infosCh && message.channel.id === infosCh.id) { await notionV3.handleInformateurMessage?.(message); return; }

  // ── #fiches-personnages — embed propre + synchro Notion ──
  const ficheCh = getChById(guild, 'FICHES_PERSONNAGES', 'fiches-personnages', 'fiches-perso', 'fiches');
  if (ficheCh && message.channel.id === ficheCh.id) { await notionModules.handleFichePersonnage?.(message); return; }

  // ── Détection RDV dans #discussion-hrp et #discussion-rp ──
  const cleanCh = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  // Détecter tous les salons de discussion (hrp, rp, direction)
  const isDiscussionCh = ['discussion-hrp','discussion-rp','conversation-direction','conversation-hrp','conversation-rp','parlote-hrp','parlote-rp'].some(n => cleanCh(message.channel.name).includes(cleanCh(n)));
  if (isDiscussionCh) {
    const mots = ['booker','rdv','rendez-vous','rendez vous','rendezvous','réunion','reunion','session','ce soir','demain','planifier','organiser','on se retrouve','meeting','on se voit'];
    const contenu = message.content.toLowerCase();
    if (mots.some(m => contenu.includes(m))) {
      await message.reply({
        content: `📅 <@${message.author.id}> Tu veux créer un RDV ?`,
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`btn_rdv_creer_${message.id}`).setLabel('📅 Créer ce RDV').setStyle(ButtonStyle.Primary),
        )],
        allowedMentions: { users: [message.author.id] },
      }).then(m => setTimeout(() => m.delete().catch(() => {}), 60000)).catch(() => {});
    }
  }

  // #surnom-pseudo — géré via bouton + modal (btn_surnom_ouvrir)

  const suggCh = getChById(guild, 'SUGGESTION_IDEE', 'suggestion-idee', 'suggestions', 'suggestion');
  if (suggCh && message.channel.id === suggCh.id) { await message.react('✅').catch(() => {}); await message.react('❌').catch(() => {}); return; }

  const clipCh = getChById(guild, 'CLIPS_TEMPS_FORT', 'clips-temps-fort', 'clips-highlights', 'clips');
  if (clipCh && message.channel.id === clipCh.id && message.attachments.size > 0) { await message.react('🔥').catch(() => {}); await message.react('❤️').catch(() => {}); return; }

  // ── 🔒・coffre-illegal — parsing format texte, solde illégal uniquement ──
  const coffreIllegCh = getChExact(guild, 'coffre-illegal');
  if (coffreIllegCh && message.channel.id === coffreIllegCh.id) {
    const up = message.content.toUpperCase();
    if (up.includes('TYPE') && up.includes('MONTANT')) {
      const lines = message.content.split('\n');
      const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() : ''; };
      const type = get('TYPE').toLowerCase().includes('sort') ? 'Sortie' : 'Entrée';
      const montant = (() => { const n = parseInt((get('MONTANT') || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; })();
      const objet = get('OBJET') || '—'; const responsable = get('RESPONSABLE') || message.author.username;
      const dbFresh = loadDB(); if (!dbFresh.coffres) dbFresh.coffres = { legal: 0, illegal: 0 };
      // Solde ILLÉGAL uniquement — jamais toucher au légal
      dbFresh.coffres.illegal += (type === 'Sortie' ? -montant : montant);
      const solde = dbFresh.coffres.illegal; saveDB(dbFresh);
      await notionExtra.enregistrerTransactionNotion?.({ type, coffre: '🔒 Illégal', montant, objet, responsable, solde });
      await notionModules.ajouterJournalIC?.(guild, { type: 'tresorerie', emoji: type === 'Entrée' ? '💵' : '💸', titre: `${type} — Coffre Illégal`, description: `**${objet}** · $${montant.toLocaleString('fr-FR')} · par ${responsable}`, auteur: responsable });
      await message.react('✅').catch(() => {});
      const isEntree = type === 'Entrée';
      await message.channel.send({ embeds: [new EmbedBuilder()
        .setColor(isEntree ? 0x57F287 : 0xED4245)
        .setAuthor({ name: '🔒 La Confrérie • Trésorerie Illégale' })
        .setTitle(`${isEntree ? '📈 ENTRÉE' : '📉 SORTIE'} — $${montant.toLocaleString('fr-FR')}`)
        .addFields(
          { name: '📋 Objet', value: objet, inline: true },
          { name: '👤 Responsable', value: responsable, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
          { name: `${isEntree ? '📥' : '📤'} Mouvement`, value: `**${isEntree ? '+' : '-'}$${montant.toLocaleString('fr-FR')}**`, inline: true },
          { name: '💰 Solde illégal', value: `**$${solde.toLocaleString('fr-FR')}**`, inline: true },
          { name: '\u200b', value: '\u200b', inline: true },
        )
        .setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` })
        .setTimestamp()
      ] });
    }
    return;
  }

  const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
  if (opsCh && message.channel.id === opsCh.id && isDirection(message.member)) {
    if (message.content.toUpperCase().includes('OPÉRATION') || message.content.toUpperCase().includes('OPERATION')) {
      const lines = message.content.split('\n'); const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() || '—' : '—'; };
      const poleRaw = get('PÔLE') !== '—' ? get('PÔLE') : get('POLE'); const pole = poleRaw.toLowerCase().includes('lég') || poleRaw.toLowerCase().includes('leg') ? 'legal' : 'illegal';
      const op = { id: Date.now().toString(), name: get('NOM'), lieu: get('LIEU'), objectif: get('OBJECTIF'), equipe: get('ÉQUIPE') || get('EQUIPE'), pole, participants: [], status: 'preparation', createdAt: new Date().toISOString() };
      db.operations.push(op); op.notionPageId = await notionExtra.creerOperationNotion?.(op); saveDB(db);
      await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' });
      await notionModules.ajouterJournalIC?.(guild, { type: 'operation', emoji: '🎯', titre: `Nouvelle opération — ${op.name}`, description: `📍 ${op.lieu} · Objectif : ${op.objectif} · Pôle : ${pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`, auteur: message.author.username });
      const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(`🎯 OPÉRATION — ${op.name}`).addFields({ name: 'Statut', value: '🟡 En préparation', inline: true }, { name: 'Pôle', value: pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal', inline: true }, { name: 'Lieu', value: op.lieu, inline: true }, { name: 'Objectif', value: op.objectif }, { name: 'Équipe', value: op.equipe }, { name: '👥 Participants (0)', value: '*Personne pour l\'instant. Clique « ✋ Je participe » ci-dessous.*' }).setFooter({ text: `ID: ${op.id} • ${fmtShort(new Date())}` });
      const rowP = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary));
      const rowG = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger));
      await opsCh.send({ content: `<@&${pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}> — 🎯 Nouvelle opération **${op.name}**. Inscrivez-vous via « ✋ Je participe ».`, embeds: [embed], components: [rowP, rowG] });
      await message.react('✅');
    }
    return;
  }

  // ── #planning — image → Notion uniquement (texte seul ignoré) ──
  const planCh = getChById(guild, 'PLANNING', 'planning');
  if (planCh && message.channel.id === planCh.id) {
    if (message.attachments.size > 0) await notionV3.handlePlanningScreenshot?.(message);
    return;
  }

  // ── 🗺️・plans — archive photos de lieux tactiques dans Notion ──
  const plansTactCh = getChById(guild, 'PLANS', 'plans');
  if (plansTactCh && message.channel.id === plansTactCh.id) {
    await notionV3.handlePlansMessage?.(message);
    return;
  }
});

client.on('interactionCreate', async interaction => {
  const guild = interaction.guild; const db = loadDB();

  if (interaction.isAutocomplete()) {
    if (['promo','retro'].includes(interaction.commandName)) return handleAutocompleteGrades(interaction);
    return;
  }
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction).catch(e => { console.log('❌ Slash command error:', e.message); interaction.reply({ content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral }).catch(() => {}); });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_affaire')     return notionV3.handleAffaireModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_agenda_rdv')   return notionV3.handleAgendaModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_op_programmee') return notionV5.handleOpProgrammeeModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_surnom_identite') return _validerModalSurnom(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rdv_')) return _validerModalRdv(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_informateur') return notionV3.handleInformateurModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_tresor_')) return notionModules.handleTresorModal?.(interaction);

  if (interaction.isButton()) {
    if (interaction.customId === 'btn_grade_panel')            return notionV3.handleGradePanelButton?.(interaction);
    if (interaction.customId === 'btn_agenda_nouveau')         return notionV3.handleAgendaNouveauButton?.(interaction);
    if (interaction.customId === 'btn_hierarchie_refresh')     { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); await notionV3.updateHierarchieEmbed?.(interaction.guild); return interaction.editReply({ content: '✅ Hiérarchie mise à jour.' }); }
    if (interaction.customId === 'btn_affaire_nouvelle')        return notionV3.handleAffaireNouvelleButton?.(interaction);
    if (interaction.customId === 'btn_affaires_resume')         return notionV3.handleAffairesResumeButton?.(interaction);
    if (interaction.customId === 'btn_informateur_rapport')     return notionV3.handleInformateurRapportButton?.(interaction);
    if (interaction.customId === 'btn_informateur_historique')  return notionV3.handleInformateurHistorique?.(interaction);
    if (interaction.customId.startsWith('info_confirmer_'))      return notionV3.handleInformateurConfirmer?.(interaction);
    if (interaction.customId === 'btn_surnom_ouvrir')           return _ouvrirModalSurnom(interaction);
    if (interaction.customId === 'dir_btn_candidatures')       return interaction.reply({ flags: MessageFlags.Ephemeral, content: _buildCandidaturesResume(db) });
    if (interaction.customId === 'dir_btn_ops')                return notionV5.handleStatsAvancees?.(interaction) || interaction.reply({ flags: MessageFlags.Ephemeral, content: '`/stats` pour plus de détails.' });
    if (interaction.customId === 'dir_btn_bilan')              return notionModules.handleBilanCommand?.(interaction);
    if (interaction.customId === 'dir_btn_registre')           return _handleRegistre(interaction);
    if (interaction.customId === 'dir_btn_refresh')            { await updateDirectionPanel(interaction.guild).catch(() => {}); return interaction.reply({ flags: MessageFlags.Ephemeral, content: '✅ Panel mis à jour.' }); }
    if (interaction.customId.startsWith('purge_confirm_'))      return _executerPurge(interaction);
    if (interaction.customId === 'purge_annuler')               return interaction.update({ content: '↩️ Suppression annulée.', embeds: [], components: [] });
    if (interaction.customId.startsWith('btn_rdv_creer_'))     return _ouvrirMenuRdv(interaction);
    if (interaction.customId.startsWith('rdv_type_select_'))    return _handleRdvTypeSelect(interaction);
    if (interaction.customId.startsWith('btn_grade_maj_'))      return notionV3.handleGradeMajButton?.(interaction);
    if (interaction.customId.startsWith('info_infirmer_'))       return notionV3.handleInformateurInfirmer?.(interaction);
    if (interaction.customId.startsWith('affaire_oui_'))        return notionV3.handleAffaireVote?.(interaction, 'oui');
    if (interaction.customId.startsWith('affaire_non_'))        return notionV3.handleAffaireVote?.(interaction, 'non');
    if (interaction.customId.startsWith('affaire_detail_'))     return notionV3.handleAffaireDetail?.(interaction);
    if (interaction.customId === 'btn_nouvelle_transaction')    return notionModules.handleTresorCommand?.(interaction);
    if (interaction.customId === 'btn_tresor_config')           return notionModules.handleTresorConfigButton?.(interaction);
    if (interaction.customId.startsWith('tresor_valider_'))     return notionModules.handleTresorValidation?.(interaction, 'valider');
    if (interaction.customId.startsWith('op_stop_'))            return notionV5.handleOpStop?.(interaction);
    if (interaction.customId.startsWith('op_lancer_force_'))    return notionV5.handleOpLancerForce?.(interaction);
    if (interaction.customId === 'btn_stats_refresh')           return notionV5.handleStatsAvancees?.(interaction);
    if (interaction.customId.startsWith('op_annulee_confirm_')) {
      const opId = interaction.customId.replace('op_annulee_confirm_', '');
      const op   = db.operations.find(o => o.id === opId);
      if (!op) return;
      op.status = 'annulee'; op.updatedAt = new Date().toISOString();
      saveDB(db);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Opération annulée — ${op.name}`).setDescription(`Annulée par **${interaction.user.username}**.`).setTimestamp()], components: [] });
      const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
      if (opsCh) await opsCh.send({ content: `❌ L'opération **${op.name}** a été annulée par ${interaction.user.username}.` }).catch(() => {});
      return;
    }
    if (interaction.customId === 'op_annulee_cancel') return interaction.update({ content: '↩️ Annulation annulée.', embeds: [], components: [] });
    if (interaction.customId.startsWith('tresor_refuser_'))     return notionModules.handleTresorValidation?.(interaction, 'refuser');
    if (interaction.customId.startsWith('tresor_'))             return notionModules.handleTresorFlow?.(interaction);
    if (interaction.customId === 'btn_solde')                   return notionModules.handleSoldeButton?.(interaction);
    if (interaction.customId === 'btn_dashboard_refresh')       return notionModules.handleDashboard?.(interaction);
    if (interaction.customId.startsWith('journal_'))            return notionModules.handleJournalPagination?.(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'tresor_config_limite_legal')   return notionModules.handleTresorConfigSelect?.(interaction);
    if (interaction.customId.startsWith('rdv_pole_select_'))    return _handleRdvPoleSelect(interaction);
    if (interaction.customId === 'tresor_config_limite_illegal') return notionModules.handleTresorConfigSelect?.(interaction);
    if (interaction.customId === 'grade_select_membre') return notionV3.handleGradeMembreSelect?.(interaction);
    if (interaction.customId === 'grade_select_grade')  return notionV3.handleGradeGradeSelect?.(interaction);
  }

  if (interaction.isButton() && interaction.customId === 'open_candidature_legal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_legal').setTitle('⚖️ Iron Wolf Company — Légal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom IC · Âge (Ex: Jonas Caverly, 34 ans)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Jonas Caverly, 34 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('metier').setLabel('Métier / Compétences').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Médecin, Avocat, Ingénieur...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800).setPlaceholder('Qui est ton personnage ? Son histoire, ce qui l\'amène ici...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivation').setLabel('Pourquoi rejoindre IWC ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Qu\'est-ce que tu apportes à la Compagnie ? Tes objectifs IC...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités · Niveau RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine + week-end · Confirmé 2 ans')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isButton() && interaction.customId === 'open_candidature_illegal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_illegal').setTitle('🔪 La Confrérie — Illégal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom IC · Âge (Ex: Viktor Crane, 29 ans)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Viktor Crane, 29 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('specialite').setLabel('Spécialité / Activités').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Contrebande, Sécurité, Renseignement...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800).setPlaceholder("Ce qui t'a amené dans l'ombre... Ton passé, tes actes...")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivation').setLabel('Pourquoi rejoindre la Confrérie ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Ce que tu apportes, tes intentions IC...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités · Niveau RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine + week-end · Confirmé 2 ans')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_legal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    // Parser nom + âge depuis le champ combiné
    const nomAgeL  = interaction.fields.getTextInputValue('nom_perso').split(',');
    const nomPersoL = nomAgeL[0]?.trim() || '—';
    const agePersoL = nomAgeL[1]?.trim() || '—';
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: nomPersoL, agePerso: agePersoL, metier: interaction.fields.getTextInputValue('metier'), background: interaction.fields.getTextInputValue('background'), motivation: interaction.fields.getTextInputValue('motivation'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'legal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    _syncCandidatureNotion(cand, 'reçue').catch(() => {});
    await interaction.editReply({ content: '✅ **Candidature légale transmise.**\nRéponse en DM sous 48h.\n*La Compagnie ne recrute pas au hasard.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '⚖️ Légal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('📥 Candidature légale reçue — IWC').setDescription("Ta candidature a bien été transmise à la Direction.\n\nUne réponse en DM sous 48h.\n\n*La Compagnie choisit ses membres avec soin.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_LEGAL);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ${cand.nomPerso}`).setDescription(`> *"Chaque talent a sa place au sein de la Compagnie."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**⚖️ TYPE : RECRUTEMENT LÉGAL**`).addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '💼 Métier', value: cand.metier }, { name: '📖 Background', value: cand.background.slice(0, 800) }, { name: '💡 Motivation', value: (cand.motivation || '—').slice(0, 500) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' }).setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `IWC • Légal • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 📋 Nouveau dossier **LÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[LÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** ⚖️\n\nÉchangez ici avant de voter.`); } catch {}
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_illegal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const nomAgeI   = interaction.fields.getTextInputValue('nom_perso').split(',');
    const nomPersoI  = nomAgeI[0]?.trim() || '—';
    const agePersoI  = nomAgeI[1]?.trim() || '—';
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: nomPersoI, agePerso: agePersoI, specialite: interaction.fields.getTextInputValue('specialite'), background: interaction.fields.getTextInputValue('background'), motivation: interaction.fields.getTextInputValue('motivation'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'illegal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    _syncCandidatureNotion(cand, 'reçue').catch(() => {});
    await interaction.editReply({ content: '🔒 **Dossier transmis.**\nReste discret.\n*On te contactera si tu es jugé digne.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '🔪 Illégal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🔒 Dossier transmis — IWC').setDescription("Ton dossier a été acheminé aux bonnes personnes.\n\nUne réponse en DM sous 48h.\n\n*Ne parle de cela à personne.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Confidentiel' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_ILLEG);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ${cand.nomPerso}`).setDescription(`> *"L'ombre protège ceux qui savent s'y fondre."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**🔪 TYPE : RECRUTEMENT ILLÉGAL**`).addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '🔪 Spécialité', value: cand.specialite }, { name: '📖 Background', value: cand.background.slice(0, 800) }, { name: '💡 Motivation', value: (cand.motivation || '—').slice(0, 500) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' }).setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `La Confrérie • CONFIDENTIEL • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 🔪 Nouveau dossier **ILLÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[ILLÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** 🔪\n\nÉchangez ici avant de voter.`); } catch {}
    }
    return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith('op_participer_') || interaction.customId.startsWith('op_retrait_'))) {
    const retrait = interaction.customId.startsWith('op_retrait_'); const opId = interaction.customId.replace(retrait ? 'op_retrait_' : 'op_participer_', '');
    const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    if (['terminee', 'annulee'].includes(op.status)) { await interaction.reply({ content: '❌ Cette opération est clôturée.', flags: MessageFlags.Ephemeral }); return; }
    op.participants = op.participants || []; const nom = nomParticipant(interaction.member);
    if (retrait) { op.participants = op.participants.filter(p => p !== nom); }
    else if (!op.participants.includes(nom)) { op.participants.push(nom); }
    saveDB(db); await notionExtra.majOperationNotion?.(op);
    const liste = op.participants.length ? op.participants.join(', ') : '*Personne pour l\'instant.*';
    const updated = EmbedBuilder.from(interaction.message.embeds[0]); const idx = interaction.message.embeds[0].fields.findIndex(f => f.name.startsWith('👥 Participants'));
    if (idx >= 0) updated.spliceFields(idx, 1, { name: `👥 Participants (${op.participants.length})`, value: liste });
    await interaction.update({ embeds: [updated] }); return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('op_terminee_')) {
    const opId = interaction.customId.replace('op_terminee_', ''); const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    const modal = new ModalBuilder().setCustomId(`op_resultat_modal_${opId}`).setTitle('✅ Compte-rendu opération');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('resultat').setLabel('Résultat').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Réussite complète / Échec / Réussite partielle / Abandonnée')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('butin').setLabel('Butin / Gains ($)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: $5 000 cash + véhicule')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pertes').setLabel('Pertes / Dommages').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Aucune / 2 blessés / matériel perdu')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('debrief').setLabel('Débrief complet').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Déroulement, points positifs, erreurs à éviter...')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('op_resultat_modal_')) {
    const opId = interaction.customId.replace('op_resultat_modal_', ''); const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    await interaction.deferUpdate();
    op.status = 'terminee'; op.endedAt = new Date().toISOString(); op.resultat = interaction.fields.getTextInputValue('resultat'); op.butin = interaction.fields.getTextInputValue('butin') || '—'; op.pertes = interaction.fields.getTextInputValue('pertes') || '—'; op.debrief = interaction.fields.getTextInputValue('debrief') || '—'; saveDB(db);
    await notionExtra.majOperationNotion?.(op);
    await notionV3.syncOperationTermineeNotion?.(op).catch(() => {});
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '✅ Terminée — ' + op.resultat });
    await notionModules.ajouterJournalIC?.(guild, { type: 'operation', emoji: '✅', titre: `Opération terminée — ${op.name}`, description: `Résultat : **${op.resultat}** · Butin : ${op.butin}`, auteur: interaction.user.username });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(0, 1, { name: 'Statut', value: '✅ Terminée', inline: true }).addFields({ name: '🏁 Résultat', value: op.resultat, inline: true }, { name: '💰 Butin', value: op.butin, inline: true }, { name: '⚠️ Pertes', value: op.pertes, inline: true }, { name: '📝 Débrief', value: op.debrief });
    await interaction.editReply({ embeds: [updated], components: [] }); return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith('op_encours_') || interaction.customId.startsWith('op_annulee_'))) {
    const isLancer = interaction.customId.startsWith('op_encours_'); const opId = interaction.customId.replace(isLancer ? 'op_encours_' : 'op_annulee_', '');
    // Confirmation avant annulation
    if (!isLancer) {
      const op = db.operations.find(o => o.id === opId);
      if (!op) return;
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Confirmer l\'annulation').setDescription(`Vous allez annuler l'opération **${op.name}**.

Cette action est **irréversible**. Les participants seront notifiés.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_annulee_confirm_${opId}`).setLabel('✅ Confirmer l\'annulation').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('op_annulee_cancel').setLabel('↩️ Retour').setStyle(ButtonStyle.Secondary))] });
    }
    const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    op.status = isLancer ? 'en_cours' : 'annulee'; saveDB(db); await notionExtra.majOperationNotion?.(op);
    const label = isLancer ? '🟢 En cours' : '❌ Annulée';
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: label });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(isLancer ? 0x00AA00 : 0xED4245).spliceFields(0, 1, { name: 'Statut', value: label, inline: true });
    if (isLancer) {
      const mentions = (op.participants || []).map(n => { const id = MEMBRES_DISCORD_MAP[n]; return id ? `<@${id}>` : null; }).filter(Boolean).join(' ');
      await interaction.update({ embeds: [updated] });
      await interaction.followUp({ content: `${mentions || `<@&${op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}>`} — 🟢 L'opération **${op.name}** est **LANCÉE**. À vos postes.` });
      // Envoyer le briefing en DM aux participants
      notionV4.envoyerBriefingOp?.(guild, op).catch(() => {});
    } else { await interaction.update({ embeds: [updated], components: [] }); }
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_offre') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    const modal = new ModalBuilder().setCustomId('contrat_offre_modal').setTitle('📤 Nos conditions — Contrat client');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('client_nom').setLabel('Nom / Entreprise du client').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Famille Moreau...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection rapprochée...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Notre rémunération souhaitée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1500$ + 500$/jour')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord du client').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Clic droit → Copier l\'identifiant')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_echeance').setLabel('Date d\'échéance (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 2026-08-30')));
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'contrat_offre_modal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-OF-' + Date.now().toString().slice(-5);
    const emetteurICOffre2 = db.members[interaction.user.id]?.name || interaction.user.username;
    const contrat = { id: contratId, type: 'offre', clientNom: interaction.fields.getTextInputValue('client_nom'), emetteurIC: emetteurICOffre2, objet: interaction.fields.getTextInputValue('objet'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), dateEcheance: interaction.fields.getTextInputValue('date_echeance') || null, emetteurId: interaction.user.id, emetteurNom: interaction.user.username, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    _syncContratNotion(contrat, 'en_attente').catch(() => {});
    await interaction.editReply({ content: `✅ Contrat **${contratId}** envoyé au client.` });
    const emetteurICOffre = db.members[interaction.user.id]?.name || interaction.user.username;
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📤 CONTRAT DE PRESTATION — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — OFFRE DE PRESTATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '✍️ Émis par', value: emetteurICOffre, inline: true }, { name: '📋 Objet', value: contrat.objet }, { name: '📅 Échéance', value: contrat.dateEcheance ? fmtShort(contrat.dateEcheance) : 'Aucune', inline: true }, { name: '💰 Rémunération souhaitée', value: contrat.remuneration }, { name: '📌 Statut', value: '🟡 En attente de signature', inline: true }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`signer_offre_${contratId}`).setLabel("✍️ J'accepte les termes").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`refuser_offre_${contratId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger));
    const ch = guild.channels.cache.get(CH.CONTRATS); if (ch) await ch.send({ content: `<@${contrat.userId}> — Iron Wolf Company vous soumet un contrat.`, embeds: [embed], components: [row] });
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📤 Contrat — IWC').setDescription(`L'IWC vous soumet le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}\n\nRépondez dans **#contrats**.`).setFooter({ text: 'Iron Wolf Company' })] }); } catch {}
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('signer_offre_')) {
    const contratId = interaction.customId.replace('signer_offre_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral }); return; }
    if (contrat.userId !== interaction.user.id) { await interaction.reply({ content: '❌ Ce contrat ne vous est pas destiné.', flags: MessageFlags.Ephemeral }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    const clientIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'signe', clientIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${clientIC} (${contrat.clientNom})` });
    await notionModules.ajouterJournalIC?.(guild, { type: 'contrat', emoji: '📜', titre: `Contrat signé — ${contratId}`, description: `Client : **${contrat.clientNom}** · Mission : ${contrat.objet}`, auteur: interaction.user.username });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_SIGNE, { embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT ACCEPTÉ — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — CONTRAT ACCEPTÉ\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé le', value: fmtShort(new Date()), inline: true }, { name: '✍️ Client', value: `${contrat.clientNom || interaction.user.username}`, inline: true }, { name: '🏢 IWC représentée par', value: db.members[contrat.emetteurId]?.name || contrat.emetteurNom || '—', inline: true }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` })] });
    try { const em = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (em) await em.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Contrat signé — ${contratId}`).setDescription(`**${contrat.clientNom}** a accepté le contrat.\n\n**Mission :** ${contrat.objet}`).setFooter({ text: 'IWC • Notification contrat' })] }); } catch {}
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — IWC').setDescription(`Vous avez accepté le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Document Officiel' })] }).catch(() => {});
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('refuser_offre_')) {
    const contratId = interaction.customId.replace('refuser_offre_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.userId !== interaction.user.id || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Action impossible.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    const refuseurIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'refuse', refuseurIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: `❌ Refusé le ${fmtShort(new Date())}`, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_REFUSE, { embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT REFUSÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Refusé par', value: interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    try { const em = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (em) await em.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Contrat refusé — ${contratId}`).setDescription(`**${contrat.clientNom}** a refusé le contrat pour **${contrat.objet}**.`).setFooter({ text: 'IWC • Notification' })] }); } catch {}
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_emploi') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    const modal = new ModalBuilder().setCustomId('contrat_emploi_modal').setTitle('📥 Contrat employeur — À signer');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('employeur_nom').setLabel("Nom de l'employeur").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Société Moreau...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection du convoi...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération proposée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 2000$ à la livraison')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel("ID Discord de l'employeur").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Clic droit → Copier l'identifiant")), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_echeance').setLabel('Date d\'échéance (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 2026-08-30')));
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'contrat_emploi_modal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-EM-' + Date.now().toString().slice(-5);
    const signataireICEmploi2 = db.members[interaction.user.id]?.name || interaction.user.username;
    const contrat = { id: contratId, type: 'emploi', employeurNom: interaction.fields.getTextInputValue('employeur_nom'), emetteurIC: signataireICEmploi2, objet: interaction.fields.getTextInputValue('objet'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), dateEcheance: interaction.fields.getTextInputValue('date_echeance') || null, signataire: interaction.user.username, signataireId: interaction.user.id, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    _syncContratNotion(contrat, 'en_attente').catch(() => {});
    await interaction.editReply({ content: `📋 Contrat **${contratId}** créé.` });
    const signataireICEmploi = db.members[interaction.user.id]?.name || interaction.user.username;
    const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📥 CONTRAT EMPLOYEUR — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  CONTRAT PROPOSÉ À IRON WOLF COMPANY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '✍️ Soumis par', value: signataireICEmploi, inline: true }, { name: `🏭 Employeur — ${contrat.employeurNom}`, value: contrat.dateEcheance ? `📅 Échéance : ${fmtShort(contrat.dateEcheance)}` : '—' }, { name: '💰 Rémunération', value: contrat.remuneration }, { name: '📋 Objet', value: contrat.objet }, { name: '📌 Statut', value: '🟡 En attente de notre signature', inline: true }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`signer_emploi_${contratId}`).setLabel('✍️ Signer & Accepter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`refuser_emploi_${contratId}`).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger));
    const ch = guild.channels.cache.get(CH.CONTRATS); if (ch) await ch.send({ content: `${getContratMention(guild)} — 📥 Nouveau contrat employeur à examiner.`, embeds: [embed], components: [row] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('signer_emploi_')) {
    const contratId = interaction.customId.replace('signer_emploi_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut signer.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); contrat.signedBy = interaction.user.username; saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    const signataireDirIC2 = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'signe', signataireDirIC2).catch(() => {});
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${signataireDirIC2} — IWC` });
    await notionModules.ajouterJournalIC?.(guild, { type: 'contrat', emoji: '📥', titre: `Contrat employeur signé — ${contratId}`, description: `Employeur : **${contrat.employeurNom}** · Mission : ${contrat.objet}`, auteur: interaction.user.username });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    const signataireDirIC = db.members[interaction.user.id]?.name || interaction.user.username;
    await sendToThread(guild, CH.FIL_CONTRATS_SIGNE, { embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT EMPLOYEUR SIGNÉ — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — CONTRAT ACCEPTÉ\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé le', value: fmtShort(new Date()), inline: true }, { name: '✍️ Signé par', value: signataireDirIC, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` })] });
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — IWC').setDescription(`Iron Wolf Company a **signé** le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Notification' })] }); } catch {}
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('refuser_emploi_')) {
    const contratId = interaction.customId.replace('refuser_emploi_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut décliner.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    const refuseurDirIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'refuse', refuseurDirIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: `❌ Décliné le ${fmtShort(new Date())}`, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_REFUSE, { embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT EMPLOYEUR DÉCLINÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Décliné par', value: interaction.user.username, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    return;
  }
});

// ════════════════════════════════════════════════
// READY + CRON
// ════════════════════════════════════════════════
client.once('clientReady', async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  client.user.setActivity('la meute • IWC 1895', { type: ActivityType.Watching });
  await restaurerDepuisGitHub();
  for (const guild of client.guilds.cache.values()) {
    await registerSlashCommands(guild).catch(e => console.log('registerSlashCommands error:', e.message));
    await autoSetup(guild).catch(e => console.log('autoSetup error:', e.message));
    await buildMembresDiscordMap(guild).catch(() => {});
  }
  for (const guild of client.guilds.cache.values()) {
    await notionExtra.envoyerRappelsFiches?.(guild).catch(() => {});
    // checkSessionReminders désactivé (doublon checkAgenda)
  }
  // ── CRONS REGROUPÉS ──

  // Toutes les minutes
  cron.schedule('* * * * *', async () => {
    for (const g of client.guilds.cache.values()) await notionV5.checkOpsProgrammees?.(g).catch(() => {});
  });

  // Toutes les 5 min
  cron.schedule('*/5 * * * *', async () => {
    for (const g of client.guilds.cache.values()) {
      await checkAgenda(g).catch(() => {});
      // checkSessionReminders désactivé — doublon de checkAgenda (Notion)
    }
  });

  // Toutes les 15 min
  cron.schedule('*/15 * * * *', async () => {
    for (const g of client.guilds.cache.values()) await syncRegistreNotion(g).catch(() => {});
  });

  // Toutes les 30 min
  cron.schedule('*/30 * * * *', async () => {
    for (const g of client.guilds.cache.values()) {
      await notionExtra.envoyerRappelsFiches?.(g).catch(() => {});
      await notionModules.checkAlerteCoffre?.(g).catch(() => {});
    }
  });

  // Toutes les heures
  cron.schedule('0 * * * *', async () => {
    for (const g of client.guilds.cache.values()) {
      await updateDashboard(g).catch(() => {});
      await notionExtra.checkFichesCompletees?.(g).catch(() => {});
      await notionExtra.checkEcheancesContrats?.(g).catch(() => {});
      await notionV3.checkInactivite?.(g).catch(() => {});
      await notionV3.updateHierarchieEmbed?.(g).catch(() => {});
      await notionV3.checkAffairesTimeout?.(g).catch(() => {});
      await _checkRetoursAbsence(g).catch(() => {});
      await updateDirectionPanel(g).catch(() => {});
      await notionV4.checkRecrutementSuivi?.(g).catch(() => {});
      await notionV4.checkEcheancesContrats?.(g).catch(() => {});
      await notionV4.checkOperationsTimeout?.(g).catch(() => {});
    }
    await sauvegarderSurGitHub().catch(() => {});
  }, { timezone: 'Europe/Paris' });

  // Toutes les 2h
  cron.schedule('0 */2 * * *', async () => {
    for (const g of client.guilds.cache.values()) await notionV4.checkDashboardAlertes?.(g).catch(() => {});
  });

  // Quotidiens
  cron.schedule('0 9 * * *',  async () => { for (const g of client.guilds.cache.values()) await postDailyAgenda(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 12 * * *', async () => { for (const g of client.guilds.cache.values()) await autoKickVisiteurs(g).catch(() => {}); }, { timezone: 'Europe/Paris' });

  // Hebdomadaires
  cron.schedule('0 8 * * 1',  async () => { for (const g of client.guilds.cache.values()) await notionV3.postResumeAffaires?.(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 9 * * 1',  async () => { for (const g of client.guilds.cache.values()) await notionV5.posterResumeJournalIC?.(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 20 * * 0', async () => { for (const g of client.guilds.cache.values()) await notionExtra.postStatsHebdo?.(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 20 * * 5', async () => { for (const g of client.guilds.cache.values()) await envoyerRapportDirection(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
});

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('IWC Bot OK'); }).listen(PORT, () => console.log(`🌐 Serveur keepalive en écoute sur le port ${PORT}`));

// ── /profil amélioré avec historique opérations ──
async function handleProfilEnhanced(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const cible  = interaction.options?.getUser('membre') || interaction.user;
  const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
  const db     = loadDB();
  const data   = db.members[cible.id];

  // Fiche Notion
  let ficheNotion = null;
  if (process.env.NOTION_TOKEN && process.env.NOTION_FICHES_DB) {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_FICHES_DB}/query`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: cible.id } }, page_size: 1 }),
      });
      const d = await res.json();
      ficheNotion = d.results?.[0];
    } catch {}
  }

  const nomPerso   = ficheNotion?.properties?.['Nom du personnage']?.title?.[0]?.plain_text || data?.name || cible.username;
  const profession = ficheNotion?.properties?.['Profession']?.rich_text?.[0]?.plain_text || '—';
  const reputation = ficheNotion?.properties?.['Réputation']?.rich_text?.[0]?.plain_text || '—';
  const pole       = ficheNotion?.properties?.['Pôle']?.select?.name || (data?.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal');
  const rang       = data?.rang || membre?.roles.cache.filter(r => !r.managed && r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name || '—';
  const statut     = data?.status || 'actif';
  const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', parti: '🚪', visiteur: '👁️' }[statut] || '❓';
  const color      = pole.includes('Illégal') ? 0x8B1A1A : 0x3B82F6;

  // Stats activité
  const contratsSigned = (db.contrats || []).filter(c => c.status === 'signe' && (c.emetteurId === cible.id || c.signataireId === cible.id)).length;
  const opsHisto = await notionV4.getHistoriqueOpsProfilMembre?.(cible.id, cible.username) || null;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: pole.includes('Illégal') ? '🔒 La Confrérie' : '⚖️ Iron Wolf Company', iconURL: interaction.guild.iconURL() || undefined })
    .setTitle(`👤 ${nomPerso}`)
    .setThumbnail(cible.displayAvatarURL({ size: 256 }))
    .addFields(
      { name: '🎖️ Grade',    value: rang,    inline: true },
      { name: '📂 Pôle',     value: pole,    inline: true },
      { name: `${statutEmoji} Statut`, value: statut.charAt(0).toUpperCase() + statut.slice(1), inline: true },
    );

  if (profession !== '—') embed.addFields({ name: '💼 Profession',  value: profession, inline: true });
  if (reputation !== '—') embed.addFields({ name: '⭐ Réputation',  value: reputation, inline: true });

  // Stats
  const daysSinceActivity = data?.lastActivity ? Math.floor((Date.now() - new Date(data.lastActivity).getTime()) / 86400000) : null;
  embed.addFields(
    { name: '📅 Dernière activité', value: data?.lastActivity ? `${fmtShort(data.lastActivity)} *(${daysSinceActivity}j)*` : '—', inline: true },
    { name: '📜 Contrats',          value: `**${contratsSigned}** signé(s)`, inline: true },
    { name: '👤 Discord',           value: `<@${cible.id}>`, inline: true },
  );

  // Historique ops
  if (opsHisto) embed.addFields({ name: '🎯 Dernières opérations', value: opsHisto, inline: false });

  // Lien thread fiche
  const threadUrl = ficheNotion?.properties?.['Thread Discord']?.rich_text?.[0]?.plain_text;
  if (threadUrl?.startsWith('http')) embed.addFields({ name: '📋 Fiche complète', value: `[Voir le thread](${threadUrl})`, inline: true });

  embed.setFooter({ text: `IWC • Profil • ${new Date().toLocaleDateString('fr-FR')}` }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// ── Modal /op-programmer ──
async function _ouvrirModalOpProgrammee(interaction) {
  if (!interaction.member?.roles.cache.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier'].some(n => r.name.includes(n)))) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  }
  const modal = new ModalBuilder().setCustomId('modal_op_programmee').setTitle('🕐 Programmer une opération');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel("Nom de l'opération").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Braquage Fleeca Grapeseed')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_heure').setLabel('Date et heure de lancement').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026 21h00 — ou juste 21h30 (ce soir)')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Fleeca Grapeseed, Route 1...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails (Objectif: ... / Pôle: légal ou illégal)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Objectif: Neutraliser les gardes\nPôle: illégal')),
  );
  await interaction.showModal(modal);
}

// ── Confirmation annulation op (bouton confirm) ──
// Ajouter ces handlers dans interactionCreate

// ═══════════════════════════════════════════════════════════════
// NOTION — Fonctions de sync centralisées
// ═══════════════════════════════════════════════════════════════

// NOTION_VERSION importée depuis config.js
async function _notionPatch(pageId, properties) {
  if (!process.env.NOTION_TOKEN) return;
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  }).catch(e => console.log('❌ _notionPatch error:', e.message));
}

async function _notionCreate(dbId, properties) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ parent: { database_id: dbId }, properties }),
  }).catch(e => { console.log('❌ _notionCreate error:', e.message); return null; });
  return res ? await res.json().catch(() => null) : null;
}

async function _notionFindByDiscordId(dbId, discordId) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return data?.results?.[0] || null;
}

// ── Sync identité IC (surnom-pseudo) ──
async function _syncSurnomNotion(message) {
  try {
    const lines = message.content.split('\n');
    const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase()) && l.includes(':')); return l ? l.split(':').slice(1).join(':').trim() : ''; };
    const nomIC    = get('NOM IC');
    const surnomIC = get('SURNOM IC');
    const appart   = get('APPARTENANCE');

    // Compatibilité modal (message.author peut être { id, username })
    const userId = message.author?.id;
    if (!userId) return;

    const page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, userId);
    if (!page) { if (typeof message.react === 'function') await message.react('⚠️').catch(() => {}); return; }

    const props = {};
    if (nomIC)    props['Personnage'] = { rich_text: [{ text: { content: nomIC } }] };
    if (surnomIC) props['Surnom']     = { rich_text: [{ text: { content: surnomIC } }] };
    if (appart)   props['Pôle']       = { select: { name: appart.toLowerCase().includes('ill') ? '🔒 Illégal' : '⚖️ Légal' } };
    props['Dernière activité'] = { date: { start: new Date().toISOString().split('T')[0] } };

    await _notionPatch(page.id, props);
    if (typeof message.react === 'function') await message.react('✅').catch(() => {});
    console.log(`✅ Identité IC synced : ${nomIC} (${message.author?.username || userId})`);
  } catch (e) { console.log('❌ _syncSurnomNotion error:', e.message); }
}

// ── Sync candidature (reçue, acceptée, refusée) ──
async function _syncCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_RECRUTEMENT_DB) return;
  const DB = process.env.NOTION_RECRUTEMENT_DB;
  const statutMap = {
    'reçue': '🟡 En attente', 'recue': '🟡 En attente',
    'acceptee': '✅ Acceptée', 'refusee': '❌ Refusée',
  };

  const props = {
    'Nom du personnage': { title:     [{ text: { content: cand.nomPerso || '—' } }] },
    'Statut':            { select:    { name: statutMap[statut] || statut } },
    'Type':              { select:    { name: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } },
    'Discord ID':        { rich_text: [{ text: { content: cand.userId || cand.discordId || '—' } }] },
    'Date candidature':  { date:      { start: new Date(cand.receivedAt || Date.now()).toISOString().split('T')[0] } },
  };
  if (validePar) {
    props['Décidé par']   = { rich_text: [{ text: { content: validePar } }] };
    props['Date décision']= { date: { start: new Date().toISOString().split('T')[0] } };
  }

  // Chercher par nom du personnage
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { property: 'Nom du personnage', title: { equals: cand.nomPerso || '' } }, page_size: 1 }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];

  if (existing) await _notionPatch(existing.id, props);
  else await _notionCreate(DB, props);
  console.log(`✅ Candidature Notion : ${cand.nomPerso} → ${statut}`);
}

// ── Sync membre (grade, statut, activité) ──
async function _syncMembreNotion(discordId, updates) {
  const page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, discordId);
  if (!page) return;
  const props = {};
  if (updates.rang)         props['Grade']             = { select: { name: updates.rang } };
  if (updates.status) {
    const map = { actif: '✅ Actif', absent: '⚠️ Absent', inactif: '💤 Inactif', parti: '🚪 Parti', visiteur: '👁️ Visiteur' };
    props['Statut'] = { select: { name: map[updates.status] || updates.status } };
  }
  if (updates.lastActivity) props['Dernière activité'] = { date: { start: new Date(updates.lastActivity).toISOString().split('T')[0] } };
  if (updates.leftAt)       props['Date de départ']    = { date: { start: new Date(updates.leftAt).toISOString().split('T')[0] } };
  if (Object.keys(props).length) {
    await _notionPatch(page.id, props);
    console.log(`✅ Membre Notion MàJ : ${discordId} →`, Object.keys(props).join(', '));
  }
}

// ── Sync contrat (créé, signé, refusé, expiré) ──
async function _syncContratNotion(contrat, statut, signePar) {
  if (!process.env.NOTION_MEMBRES_DB) return; // Utiliser NOTION_MEMBRES_DB ou une base dédiée
  const DB = process.env.NOTION_CONTRATS_DB || process.env.NOTION_MEMBRES_DB;
  if (!DB || !process.env.NOTION_TOKEN) return;

  const statutMap = {
    en_attente: '🟡 En attente', signe: '✅ Signé',
    refuse: '❌ Refusé', expire: '📁 Expiré',
  };

  const props = {
    'Référence':    { title:     [{ text: { content: contrat.id } }] },
    'Objet':        { rich_text: [{ text: { content: contrat.objet || '—' } }] },
    'Type':         { select:    { name: contrat.type === 'emploi' ? '📥 Employeur' : '📤 Prestation' } },
    'Statut':       { select:    { name: statutMap[statut] || statut } },
    'Rémunération': { rich_text: [{ text: { content: contrat.remuneration || '—' } }] },
    'Partenaire':   { rich_text: [{ text: { content: contrat.clientNom || contrat.employeurNom || '—' } }] },
    'Émetteur':     { rich_text: [{ text: { content: contrat.emetteurIC || contrat.emetteurNom || contrat.signataire || '—' } }] },
    'Date création':{ date:      { start: new Date(contrat.createdAt || Date.now()).toISOString().split('T')[0] } },
  };
  if (statut === 'signe' && signePar) {
    props['Signé par'] = { rich_text: [{ text: { content: signePar } }] };
    props['Date signature'] = { date: { start: new Date().toISOString().split('T')[0] } };
  }
  if (contrat.dateEcheance) props['Échéance'] = { date: { start: contrat.dateEcheance } };

  // Chercher si déjà dans Notion par référence
  if (!process.env.NOTION_TOKEN) return;
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { property: 'Référence', title: { equals: contrat.id } }, page_size: 1 }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];

  if (existing) {
    await _notionPatch(existing.id, props);
  } else {
    await _notionCreate(DB, props);
  }
  console.log(`✅ Contrat Notion MàJ : ${contrat.id} → ${statut}`);
}

// ── Sync affaire avec résultat vote ──
async function _syncAffaireNotion(affaire, decision) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  const DB = process.env.NOTION_AFFAIRES_DB || process.env.NOTION_MEMBRES_DB;
  const statutMap = { approuvee: '✅ Approuvée', rejetee: '❌ Rejetée', en_cours: '🗳️ En vote' };
  // Chercher par titre
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { property: 'Titre', title: { equals: affaire.titre || affaire.title || '' } }, page_size: 1 }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];
  const props = {
    'Statut':       { select: { name: statutMap[decision] || decision } },
    'Décision':     { rich_text: [{ text: { content: decision === 'approuvee' ? '✅ Approuvée' : '❌ Rejetée' } }] },
    'Date décision':{ date: { start: new Date().toISOString().split('T')[0] } },
  };
  if (existing) await _notionPatch(existing.id, props);
  console.log(`✅ Affaire Notion MàJ : ${affaire.titre} → ${decision}`);
}

// ── Sync informateur avec statut final ──
async function _syncInformateurNotion(info, statut, validePar) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_INFOS_DB) return;
  const statutMap = { confirme: '✅ Confirmé', infirme: '❌ Infirmé', nouveau: '🆕 Nouveau' };
  const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_INFOS_DB}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter: { property: 'Source', title: { equals: info.source || info.id || '' } }, page_size: 1 }),
  }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];
  const props = {
    'Statut':       { select:    { name: statutMap[statut] || statut } },
    'Validé par':   { rich_text: [{ text: { content: validePar || '—' } }] },
    'Date décision':{ date:      { start: new Date().toISOString().split('T')[0] } },
  };
  if (existing) {
    await _notionPatch(existing.id, props);
    console.log(`✅ Informateur Notion MàJ : ${info.titre || info.id} → ${statut}`);
  }
}

// ── Handler autocomplete grades ──
async function handleAutocompleteGrades(interaction) {
  const { GRADES_LEGAL, GRADES_ILLEGAL } = notionV3;
  const input   = (interaction.options.getFocused() || '').toLowerCase();
  const db      = loadDB();
  const cible   = interaction.options.getUser('membre');
  const membre  = cible ? await interaction.guild.members.fetch(cible.id).catch(() => null) : null;

  // Détecter le pôle de la cible pour proposer les bons grades
  let grades = [...(GRADES_LEGAL || []), ...(GRADES_ILLEGAL || [])];
  if (membre) {
    const pole = membre.roles.cache.some(r =>
      ['Exécuteur','Condamné','Maudit','Fléau','Confrérie','Ombre','Concepteur'].some(n => r.name.includes(n))
    ) ? 'illegal' : 'legal';
    grades = pole === 'illegal' ? (GRADES_ILLEGAL || []) : (GRADES_LEGAL || []);
  }

  const filtered = grades
    .filter(g => g.toLowerCase().includes(input))
    .slice(0, 25)
    .map(g => ({ name: g, value: g }));

  await interaction.respond(filtered).catch(() => {});
}

// ── /bilan enrichi avec graphique ASCII ──
function _graphiqueBarres(transactions, jours = 7) {
  // Créer un graphique entrées/sorties par jour
  const data = {};
  for (let i = 0; i < jours; i++) {
    const d = new Date(Date.now() - i * 86400000).toISOString().split('T')[0];
    data[d] = { entrees: 0, sorties: 0 };
  }
  for (const t of transactions) {
    const d = t.date?.split('T')[0];
    if (data[d]) {
      if (t.type?.includes('Entrée')) data[d].entrees += t.montant;
      else data[d].sorties += t.montant;
    }
  }
  const jrs = Object.entries(data).sort((a, b) => a[0].localeCompare(b[0]));
  const maxVal = Math.max(...jrs.map(([, v]) => Math.max(v.entrees, v.sorties)), 1);
  const hauteur = 5;
  let graphique = '\`\`\`\n';
  for (let h = hauteur; h >= 0; h--) {
    graphique += jrs.map(([, v]) => {
      const eH = Math.round((v.entrees / maxVal) * hauteur);
      const sH = Math.round((v.sorties / maxVal) * hauteur);
      if (h === 0) return '──';
      const e = eH >= h ? '█' : ' ';
      const s = sH >= h ? '▓' : ' ';
      return e + s;
    }).join(' ') + '\n';
  }
  graphique += jrs.map(([d]) => new Date(d).getDate().toString().padStart(2, '0')).join('  ') + '\n';
  graphique += '█ Entrées  ▓ Sorties\`\`\`';
  return graphique;
}

// ── /registre — Liste paginée des membres ──
async function _handleRegistre(interaction) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const db      = loadDB();
  const pole    = interaction.options?.getString('pole') || 'tous';
  const page    = Math.max(1, interaction.options?.getInteger('page') || 1);
  const PAR_PAGE = 10;

  let membres = Object.values(db.members || {}).filter(m => m.status !== 'parti');
  if (pole !== 'tous') membres = membres.filter(m => m.pole === pole);
  membres.sort((a, b) => (a.name || '').localeCompare(b.name || ''));

  const total    = membres.length;
  const pages    = Math.ceil(total / PAR_PAGE) || 1;
  const pageActuelle = Math.min(page, pages);
  const slice    = membres.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);

  const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', visiteur: '👁️' };

  const lignes = slice.map((m, i) => {
    const idx    = (pageActuelle - 1) * PAR_PAGE + i + 1;
    const emoji  = statutEmoji[m.status] || '❓';
    const pole_e = m.pole === 'illegal' ? '🔒' : '⚖️';
    const rang   = m.rang ? ` · *${m.rang}*` : '';
    const activ  = m.lastActivity ? ` · ${daysSince(m.lastActivity)}j` : '';
    return `\`${String(idx).padStart(2, '0')}\` ${emoji} ${pole_e} **${m.name || m.username || '—'}**${rang}${activ}`;
  }).join('\n');

  const poleLabel = pole === 'legal' ? '⚖️ Légal' : pole === 'illegal' ? '🔒 Illégal' : 'Tous les pôles';

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle(`📋 Registre — ${poleLabel}`)
    .setDescription(lignes || '*Aucun membre trouvé.*')
    .addFields({ name: '📊 Total', value: `**${total}** membre(s)`, inline: true })
    .setFooter({ text: `Page ${pageActuelle}/${pages} • IWC • Registre des membres` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── /op [id] — Détail d'une opération ──
async function _handleOpDetail(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const db  = loadDB();
  const id  = interaction.options?.getString('id');
  const ops = db.operations || [];

  let op;
  if (id) {
    op = ops.find(o => o.id === id || o.name?.toLowerCase().includes(id.toLowerCase()));
  } else {
    // Sans ID → afficher la dernière op en cours ou la plus récente
    op = ops.find(o => o.status === 'en_cours') ||
         ops.find(o => o.status === 'programmee') ||
         [...ops].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0];
  }

  if (!op) return interaction.editReply({ content: '❌ Aucune opération trouvée.' });

  const statutMap = {
    en_cours:       '🟢 En cours',
    programmee:     '🕐 Programmée',
    terminee:       '✅ Terminée',
    annulee:        '❌ Annulée',
    attente_direction: '⏳ En attente Direction',
    preparation:    '🟡 Préparation',
  };

  const color = op.status === 'en_cours' ? 0x57F287
              : op.status === 'terminee' ? 0x8B1A1A
              : op.status === 'annulee'  ? 0x555555
              : 0xFFA500;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🎯 ${op.name}`)
    .addFields(
      { name: '📌 Statut',    value: statutMap[op.status] || op.status, inline: true },
      { name: '📂 Pôle',      value: op.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal', inline: true },
      { name: '🆔 ID',        value: `\`${op.id}\``, inline: true },
      { name: '📍 Lieu',      value: op.lieu      || '—', inline: true },
      { name: '🎯 Objectif',  value: op.objectif  || '—', inline: true },
      { name: '👤 Créé par',  value: op.createdBy || '—', inline: true },
    );

  if (op.participants?.length) {
    embed.addFields({ name: `👥 Participants (${op.participants.length})`, value: op.participants.join(', '), inline: false });
  }

  if (op.status === 'terminee') {
    embed.addFields(
      { name: '📊 Résultat', value: op.resultat || '—', inline: true },
      { name: '💰 Butin',    value: op.butin    || '—', inline: true },
    );
    if (op.debrief) embed.addFields({ name: '📝 Débrief', value: op.debrief.slice(0, 500), inline: false });
  }

  if (op.status === 'programmee' && op.lancementAt) {
    embed.addFields({ name: '⏰ Lancement prévu', value: new Date(op.lancementAt).toLocaleString('fr-FR'), inline: false });
  }

  embed
    .addFields({ name: '📅 Créée le', value: fmtShort(op.createdAt), inline: true })
    .setFooter({ text: 'IWC • Opérations' })
    .setTimestamp();

  // Chercher toutes les ops si recherche par nom → proposer les autres résultats
  if (id && !ops.find(o => o.id === id)) {
    const autres = ops.filter(o => o.name?.toLowerCase().includes(id.toLowerCase()) && o.id !== op.id);
    if (autres.length > 0) {
      embed.addFields({ name: '🔍 Autres résultats', value: autres.slice(0, 3).map(o => `\`${o.id}\` — ${o.name}`).join('\n'), inline: false });
    }
  }

  await interaction.editReply({ embeds: [embed] });
}

// ── Résumé rapide des candidatures pour le panel Direction ──
function _buildCandidaturesResume(db) {
  const cands = (db.candidatures || []).filter(c => c.status === 'reçue');
  if (!cands.length) return '✅ Aucune candidature en attente.';
  return cands.map((c, i) => {
    const h = Math.floor((Date.now() - new Date(c.receivedAt).getTime()) / 3600000);
    const urgent = h >= 48 ? ' 🔴' : h >= 24 ? ' ⚠️' : '';
    return `**${i+1}.** ${c.nomPerso} — ${c.type === 'legal' ? '⚖️' : '🔒'} — ${h}h${urgent}`;
  }).join('\n');
}

// ── MEMBRES_DISCORD_MAP automatique ──
// Reconstruit depuis les vrais membres Discord à chaque démarrage
async function buildMembresDiscordMap(guild) {
  try {
    const { ROLES } = require('./notion-modules-v3');
    const allRoleIds = Object.values(ROLES || {});
    const members    = await guild.members.fetch().catch(() => null);
    if (!members) return;
    const db = loadDB();
    let updated = 0;
    for (const [, m] of members) {
      if (m.user.bot) continue;
      if (!m.roles.cache.some(r => allRoleIds.includes(r.id))) continue;
      const nomIC = db.members[m.id]?.name;
      if (nomIC && nomIC !== m.user.username) {
        // Mettre à jour le config en mémoire (pas le fichier)
        const cfg = require('./config');
        if (!cfg.MEMBRES_DISCORD_MAP[nomIC]) {
          cfg.MEMBRES_DISCORD_MAP[nomIC] = m.id;
          cfg.DISCORD_TO_IC[m.id] = nomIC;
          updated++;
        }
      }
    }
    if (updated > 0) console.log(`✅ MEMBRES_DISCORD_MAP enrichi : +${updated} entrées`);
  } catch (e) { console.log('❌ buildMembresDiscordMap:', e.message); }
}

// ── /version — Statut du bot ──
async function _handleVersion(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const BOT_VERSION = '4.0';
  const uptime = Math.floor(process.uptime());
  const h = Math.floor(uptime / 3600);
  const m = Math.floor((uptime % 3600) / 60);
  const s = uptime % 60;

  // Tester Notion
  let notionOk = false;
  try {
    const r = await fetch('https://api.notion.com/v1/users/me', {
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }
    });
    notionOk = r.ok;
  } catch {}

  const db = loadDB();

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle(`🤖 IWC Bot — v${BOT_VERSION}`)
    .addFields(
      { name: '⏱️ Uptime',         value: `${h}h ${m}m ${s}s`,                                     inline: true },
      { name: '🔗 Notion',          value: notionOk ? '✅ Connecté' : '❌ Déconnecté',               inline: true },
      { name: '💾 Mémoire',         value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true },
      { name: '👥 Membres en DB',   value: `${Object.keys(db.members || {}).length}`,                inline: true },
      { name: '🎯 Opérations',      value: `${(db.operations || []).length}`,                        inline: true },
      { name: '📜 Contrats',        value: `${(db.contrats || []).length}`,                          inline: true },
    )
    .setFooter({ text: `IWC Bot v${BOT_VERSION} • Node ${process.version}` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ── /sync — Forcer une synchronisation ──
async function _handleSync(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const start = Date.now();

  await syncRegistreNotion(guild).catch(() => {});
  await updateDashboard(guild).catch(() => {});
  await notionV3.updateHierarchieEmbed?.(guild).catch(() => {});
  await buildMembresDiscordMap(guild).catch(() => {});

  const ms = Date.now() - start;
  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🔄 Synchronisation terminée')
    .addFields(
      { name: '✅ Registre Notion',  value: 'Synchronisé',   inline: true },
      { name: '✅ Dashboard',         value: 'Mis à jour',    inline: true },
      { name: '✅ Hiérarchie',        value: 'Actualisée',    inline: true },
    )
    .setFooter({ text: `Durée : ${ms}ms` })
    .setTimestamp()
  ] });
}

// ── /avertir — Système de sanctions ──
async function _handleAvertir(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ ephemeral: false });

  const cible  = interaction.options.getUser('membre');
  const raison = interaction.options.getString('raison');
  const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);

  const db = loadDB();
  if (!db.avertissements) db.avertissements = {};
  if (!db.avertissements[cible.id]) db.avertissements[cible.id] = [];

  const avertissement = {
    id:        `AVT-${Date.now().toString().slice(-5)}`,
    raison,
    parId:     interaction.user.id,
    par:       interaction.user.username,
    date:      new Date().toISOString(),
  };
  db.avertissements[cible.id].push(avertissement);
  saveDB(db);

  const total = db.avertissements[cible.id].length;

  const color = total >= 3 ? 0xED4245 : total === 2 ? 0xFFA500 : 0xFFCC00;

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`⚠️ Avertissement — ${cible.username}`)
    .addFields(
      { name: '👤 Membre',        value: `<@${cible.id}>`,      inline: true },
      { name: '📋 Raison',        value: raison,                 inline: false },
      { name: '🔢 Total',         value: `**${total}/3**`,       inline: true },
      { name: '✅ Émis par',       value: interaction.user.username, inline: true },
    )
    .setFooter({ text: `IWC • Réf. ${avertissement.id}` })
    .setTimestamp();

  if (total >= 3) embed.addFields({ name: '🚨 Attention', value: '**3 avertissements atteints.** Une décision de la Direction est requise.', inline: false });

  await interaction.editReply({ embeds: [embed] });

  // DM au membre
  try {
    const isIlleg = db.members[cible.id]?.pole === 'illegal';
    await membre?.send({ embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle(`⚠️ Avertissement — ${isIlleg ? 'La Confrérie' : 'Iron Wolf Company'}`)
      .setDescription(`Tu as reçu un avertissement de la Direction.

**Raison :** ${raison}

*${total >= 3 ? '🚨 Tu as atteint 3 avertissements. La Direction va délibérer.' : `Avertissement ${total}/3.`}*`)
      .setFooter({ text: isIlleg ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })
    ] });
  } catch {}

  // Alerte Direction à 3 avertissements
  if (total >= 3) {
    const logsCh = getCh(interaction.guild, 'logs');
    const mention = interaction.guild.roles.cache
      .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
      .map(r => `<@&${r.id}>`).join(' ');
    if (logsCh) await logsCh.send({
      content: `${mention} — 🚨 **${cible.username} a atteint 3 avertissements**`,
      embeds: [embed],
    }).catch(() => {});
  }

  // Sync Notion
  _syncAvertissementNotion(cible.id, cible.username, avertissement, total).catch(() => {});
}

async function _syncAvertissementNotion(userId, username, avt, total) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  const page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, userId);
  if (!page) return;
  await _notionPatch(page.id, {
    'Avertissements': { number: total },
    'Dernier avertissement': { rich_text: [{ text: { content: avt.raison } }] },
  });
  console.log(`✅ Avertissement Notion MàJ : ${username} (${total}/3)`);
}

// ── /avertissements — Voir l'historique ──
async function _handleAvertissements(interaction) {
  const cible = interaction.options?.getUser('membre') || interaction.user;
  const db    = loadDB();
  const liste = db.avertissements?.[cible.id] || [];

  const embed = new EmbedBuilder()
    .setColor(liste.length >= 3 ? 0xED4245 : liste.length > 0 ? 0xFFA500 : 0x57F287)
    .setTitle(`⚠️ Avertissements — ${cible.username}`)
    .setDescription(liste.length === 0 ? '✅ Aucun avertissement.' : `**${liste.length}/3 avertissement(s)**`)
    .setThumbnail(cible.displayAvatarURL());

  for (const a of liste.slice(-5).reverse()) {
    embed.addFields({ name: `${fmtShort(a.date)} — ${a.id}`, value: `${a.raison}
*Par ${a.par}*`, inline: false });
  }

  embed.setFooter({ text: 'IWC • Historique des sanctions' }).setTimestamp();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ── Exécution de la purge ──
async function _executerPurge(interaction) {
  if (!isDirection(interaction.member)) return interaction.update({ content: '❌ Accès refusé.', embeds: [], components: [] });

  const parts   = interaction.customId.replace('purge_confirm_', '').split('_');
  const salonId = parts[0];
  const nbRaw   = parts[1];
  const nombre  = nbRaw === 'all' ? null : parseInt(nbRaw);

  const salon = interaction.guild.channels.cache.get(salonId);
  if (!salon) return interaction.update({ content: '❌ Salon introuvable.', embeds: [], components: [] });

  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🗑️ Suppression en cours...').setDescription('Patience, le bot supprime les messages.')],
    components: [],
  });

  let total = 0;
  let continuer = true;

  while (continuer) {
    // Récupérer jusqu'à 100 messages
    const limit = nombre ? Math.min(nombre - total, 100) : 100;
    const msgs  = await salon.messages.fetch({ limit }).catch(() => null);
    if (!msgs || msgs.size === 0) break;

    // Séparer récents (< 14j) et anciens
    const maintenant  = Date.now();
    const limite14j   = maintenant - 13 * 24 * 60 * 60 * 1000;
    const recents     = msgs.filter(m => m.createdTimestamp > limite14j);
    const anciens     = msgs.filter(m => m.createdTimestamp <= limite14j);

    // Supprimer les récents en masse
    if (recents.size >= 2) {
      await salon.bulkDelete(recents).catch(() => {});
      total += recents.size;
    } else if (recents.size === 1) {
      await recents.first().delete().catch(() => {});
      total += 1;
    }

    // Supprimer les anciens un par un
    for (const [, m] of anciens) {
      await m.delete().catch(() => {});
      total++;
      await new Promise(r => setTimeout(r, 300)); // Rate limit
      if (nombre && total >= nombre) { continuer = false; break; }
    }

    if (nombre && total >= nombre) break;
    if (msgs.size < 100) break; // Plus de messages
    if (recents.size === 0 && anciens.size === 0) break;
  }

  // Confirmation finale (éphémère dans le salon ou DM)
  try {
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Purge terminée')
        .addFields(
          { name: '🗑️ Messages supprimés', value: `**${total}**`,         inline: true },
          { name: '📋 Salon',              value: `#${salon.name}`,        inline: true },
          { name: '👤 Exécuté par',        value: interaction.user.username, inline: true },
        )
        .setFooter({ text: 'IWC • Purge automatique' })
        .setTimestamp()
      ],
    });
  } catch {}

  console.log(`✅ Purge : ${total} messages supprimés dans #${salon.name} par ${interaction.user.username}`);
}

// ── /purge — Effacer les messages d'un salon ──
async function _handlePurge(interaction) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  }

  const nombre = interaction.options?.getInteger('nombre') || null;
  const salon  = interaction.channel;
  const label  = nombre ? `les **${nombre} derniers messages**` : `**tous les messages récents**`;

  // Confirmation
  const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor(0xED4245)
      .setTitle('🗑️ Confirmer la suppression')
      .setDescription([
        `Tu vas supprimer ${label} dans **#${salon.name}**.`,
        '',
        '⚠️ **Cette action est irréversible.**',
        '*Note : seuls les messages de moins de 14 jours peuvent être supprimés en masse.*',
      ].join('\n'))
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`purge_confirm_${salon.id}_${nombre || 'all'}`)
        .setLabel('🗑️ Confirmer la suppression')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('purge_annuler')
        .setLabel('↩️ Annuler')
        .setStyle(ButtonStyle.Secondary),
    )],
  });
}

// ── /annuler-absence — Direction lève une absence ──
async function _handleAnnulerAbsence(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cible   = interaction.options.getUser('membre');
  const db      = loadDB();
  const m       = db.members[cible.id];

  if (!m || m.status !== 'absent') return interaction.editReply({ content: `❌ <@${cible.id}> n'est pas marqué absent.` });

  m.status       = 'actif';
  m.lastActivity = new Date().toISOString();
  m.absentJusqu  = null;
  m.absentRaison = null;
  saveDB(db);

  // Retirer le rôle Absent
  const membreD = await interaction.guild.members.fetch(cible.id).catch(() => null);
  if (membreD) {
    const roleAbsent = interaction.guild.roles.cache.get(ROLE_ABSENT);
    if (roleAbsent) await membreD.roles.remove(roleAbsent).catch(() => {});
  }

  _syncMembreNotion(cible.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});

  // Post dans #absences
  const absCh = getCh(interaction.guild, 'absences');
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Absence levée par la Direction')
    .addFields(
      { name: '👤 Membre',   value: `<@${cible.id}>`,                inline: true },
      { name: '✅ Levé par', value: interaction.user.username,        inline: true },
      { name: '📅 Date',     value: new Date().toLocaleDateString('fr-FR'), inline: true },
    )
    .setFooter({ text: 'IWC • Absence annulée par la Direction' })
    .setTimestamp()
  ] }).catch(() => {});

  // DM au membre
  try {
    await membreD?.send({ embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Absence levée')
      .setDescription(`Ton absence a été levée par **${interaction.user.username}**.
Tes permissions sont rétablies.`)
      .setFooter({ text: 'IWC' })
    ] });
  } catch {}

  await interaction.editReply({ content: `✅ Absence de <@${cible.id}> levée.` });
}

// ── /retour — Déclarer son retour d'absence ──
async function _handleRetour(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const db = loadDB();
  const m  = db.members[interaction.user.id];

  if (!m) return interaction.editReply({ content: '❌ Tu n\'es pas enregistré dans le système.' });
  if (m.status === 'actif') return interaction.editReply({ content: '✅ Tu es déjà marqué comme actif.' });

  const ancienStatut = m.status;
  m.status        = 'actif';
  m.lastActivity  = new Date().toISOString();
  m.absentJusqu   = null;
  m.absentRaison  = null;
  saveDB(db);

  // Retirer le rôle Absent
  const membreRetour = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (membreRetour) {
    const roleAbsent = interaction.guild.roles.cache.get(ROLE_ABSENT);
    if (roleAbsent) await membreRetour.roles.remove(roleAbsent).catch(() => {});
  }

  _syncMembreNotion(interaction.user.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});

  // Poster dans #absences
  const absCh = getCh(interaction.guild, 'absences');
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: `${interaction.member?.displayName || interaction.user.username} — Retour`, iconURL: interaction.user.displayAvatarURL() })
    .setTitle('✅ Retour déclaré')
    .addFields(
      { name: '👤 Membre',        value: `<@${interaction.user.id}>`, inline: true },
      { name: '🎖️ Grade',        value: m.rang || '—',                inline: true },
      { name: '📅 Retour le',     value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
    )
    .setFooter({ text: 'IWC • Retour déclaré manuellement' })
    .setTimestamp()
  ] }).catch(() => {});

  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Retour enregistré')
    .setDescription(`Tu es de retour ! Ton statut a été mis à jour.

Ancien statut : **${ancienStatut}** → **Actif**`)
    .setFooter({ text: 'IWC • Bienvenue de retour' })
  ] });
}

// ── /contrats — Voir ses propres contrats ──
async function _handleMesContrats(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const uid = interaction.user.id;

  // Contrats où l'utilisateur est partenaire, émetteur ou signataire
  const mesContrats = (db.contrats || []).filter(c =>
    c.userId === uid || c.emetteurId === uid || c.signataireId === uid
  ).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (!mesContrats.length) {
    return interaction.editReply({ content: '📭 Tu n\'as aucun contrat enregistré.' });
  }

  const statutMap = {
    en_attente: '🟡 En attente', signe: '✅ Signé',
    refuse: '❌ Refusé', expire: '📁 Expiré',
  };

  const embed = new EmbedBuilder()
    .setColor(0x2C3E50)
    .setTitle('📜 Mes contrats — Iron Wolf Company')
    .setDescription(`*${mesContrats.length} contrat(s) trouvé(s).*`);

  for (const c of mesContrats.slice(0, 10)) {
    const partenaire = c.clientNom || c.employeurNom || '—';
    const echeance = c.dateEcheance ? ` · 📅 ${fmtShort(c.dateEcheance)}` : '';
    embed.addFields({
      name: `${statutMap[c.status] || c.status} — ${c.id}`,
      value: `📋 ${c.objet}
🤝 ${partenaire} · 💰 ${c.remuneration || '—'}${echeance}`,
      inline: false,
    });
  }

  if (mesContrats.length > 10) embed.setFooter({ text: `... et ${mesContrats.length - 10} autre(s) • IWC` });
  else embed.setFooter({ text: 'IWC • Mes contrats' });

  await interaction.editReply({ embeds: [embed] });
}

// ── /aide — Guide complet selon le rôle ──
async function _handleAide(interaction) {
  const isDir = isDirection(interaction.member);
  const isFleau = interaction.member?.roles?.cache?.some(r => ['Fléau','Concepteur','Fondateur'].some(n => r.name.includes(n)));

  const embedBase = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('📖 Guide des commandes — IWC Bot')
    .setDescription('*Voici toutes les commandes disponibles selon ton rôle.*');

  // Commandes pour tous
  embedBase.addFields({
    name: '👥 Commandes générales',
    value: [
      "`/profil [@membre]` — Voir le profil et la fiche d'un membre",
      '`/stats` — Statistiques de la faction',
      '`/hierarchie` — Voir la hiérarchie',
      '`/absent [durée] [raison]` — Déclarer une absence',
      '`/journal` — Consulter le journal IC',
      '`/fiche [nom]` — Chercher une fiche personnage',
      '`/ops` — Voir les opérations en cours',
      '`/agenda voir` — Voir les prochains RDV',
      '`/contrats` — Voir mes contrats en cours',
      '`/op [id]` — Détail d\'une opération',
      '`/retour` — Déclarer son retour d\'absence',
      '`/avertissements` — Voir ses avertissements',
    ].join('\n'),
    inline: false,
  });

  if (isDir) {
    embedBase.addFields({
      name: '🎖️ Commandes Direction',
      value: [
        '`/promo @membre rang` — Promouvoir un membre',
        '`/retro @membre rang [raison]` — Rétrograder un membre',
        '`/grade-set` — Attribuer un grade via panneau',
        '`/dashboard` — Tableau de bord complet',
        '`/bilan [coffre]` — Résumé trésorerie 7j',
        "`/contrats-archives` — Archives de tous les contrats",
        '`/agenda creer` — Créer un RDV dans Notion',
        '`/rapport` — Envoyer le rapport hebdo en DM',
      ].join('\n'),
      inline: false,
    });
  }

  if (isFleau) {
    embedBase.addFields({
      name: '⚙️ Commandes Fléau & Concepteur',
      value: [
        '`/op-programmer` — Programmer une opération avec lancement auto',
        '`⚙️ dans coffre-entreprise` — Modifier les limites de sortie',
        '`/bilan` — Accès aux deux coffres',
      ].join('\n'),
      inline: false,
    });
  }

  embedBase.addFields({
    name: '🏦 Trésorerie',
    value: [
      '**Bouton 💰 Nouvelle Transaction** dans `#coffre-entreprise`',
      '→ Entrée ou Sortie → Choisir le coffre → Remplir montant + objet',
      '→ Envoyer une photo de preuve → Confirmer le montant visible',
      '',
      '⚠️ *Sortie > limite → validation Direction requise*',
    ].join('\n'),
    inline: false,
  });

  embedBase.addFields({
    name: '📋 Fiches personnages',
    value: 'Poste ta fiche dans `#fiches-personnages` → embed + thread créés automatiquement + synchro Notion',
    inline: false,
  });

  embedBase.setFooter({ text: 'IWC Bot • /aide pour revoir ce guide' }).setTimestamp();
  await interaction.reply({ embeds: [embedBase], flags: MessageFlags.Ephemeral });
}

// ── Panel Direction — embed permanent + boutons ──
async function setupPanelDirection(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() &&
      (clean(c.name).includes('direction') && (clean(c.name).includes('5') || clean(c.name).includes('nous')))
    ) || guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes('direction-nous'));
    if (!ch) return;

    const db = loadDB();

    // Supprimer l'ancien panel bot si existant
    const msgs = await ch.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) {
      if (m.author.id === guild.members.me?.id && m.components?.length > 0) {
        await m.delete().catch(() => {});
      }
    }

    const embed = _buildDirectionPanelEmbed(guild, db);
    const row   = _buildDirectionPanelRow();

    const sent = await ch.send({ embeds: [embed], components: [row] });
    db.directionPanelMsgId  = sent.id;
    db.directionPanelChanId = ch.id;
    saveDB(db);
    console.log('✅ Panel Direction posté');
  } catch(e) { console.log('❌ setupPanelDirection error:', e.message); }
}

function _buildDirectionPanelEmbed(guild, db) {
  const membres     = Object.values(db.members || {});
  const cands       = (db.candidatures || []).filter(c => c.status === 'reçue');
  const opsEnCours  = (db.operations   || []).filter(o => o.status === 'en_cours');
  const opsProg     = (db.operations   || []).filter(o => o.status === 'programmee');
  const absents     = membres.filter(m => m.status === 'absent');
  const contrats3j  = (db.contrats     || []).filter(c => {
    if (c.status !== 'signe' || !c.dateEcheance) return false;
    const j = Math.floor((new Date(c.dateEcheance) - new Date()) / 86400000);
    return j >= 0 && j <= 3;
  });
  const legal  = db.coffres?.legal   || 0;
  const illeg  = db.coffres?.illegal || 0;

  const ligne = (emoji, label, val, urgent) =>
    `${urgent && val > 0 ? '🔴' : '🟢'} ${emoji} **${label}** — ${val}`;

  return new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setAuthor({ name: 'IWC Setup • Panel Direction', iconURL: guild.iconURL() || undefined })
    .setTitle('🐺 Tableau de bord — Iron Wolf Company')
    .addFields(
      { name: '📋 RECRUTEMENT', value: [
        ligne('📥', 'Candidatures en attente', cands.length, true),
      ].join('\n'), inline: true },
      { name: '🎯 OPÉRATIONS', value: [
        ligne('🟢', 'En cours', opsEnCours.length, false),
        ligne('🕐', 'Programmées', opsProg.length, false),
      ].join('\n'), inline: true },
      { name: '​', value: '​', inline: true },
      { name: '💰 TRÉSORERIE', value: [
        `⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`,
        `🔒 Illégal : **$${illeg.toLocaleString('fr-FR')}**`,
      ].join('\n'), inline: true },
      { name: '👥 MEMBRES', value: [
        ligne('⚠️', 'Absents', absents.length, false),
        ligne('📜', 'Contrats expirent ≤3j', contrats3j.length, true),
      ].join('\n'), inline: true },
      { name: '​', value: '​', inline: true },
    )
    .setFooter({ text: `IWC • Panel Direction • MàJ ${new Date().toLocaleString('fr-FR')}` })
    .setTimestamp();
}

function _buildDirectionPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dir_btn_candidatures').setLabel('📋 Candidatures').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dir_btn_ops').setLabel('🎯 Opérations').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dir_btn_bilan').setLabel('💰 Bilan').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dir_btn_registre').setLabel('👥 Membres').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dir_btn_refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
  );
}

async function updateDirectionPanel(guild) {
  try {
    const db = loadDB();
    if (!db.directionPanelMsgId || !db.directionPanelChanId) { await setupPanelDirection(guild); return; }
    const ch  = guild.channels.cache.get(db.directionPanelChanId);
    const msg = await ch?.messages.fetch(db.directionPanelMsgId).catch(() => null);
    if (!msg) { await setupPanelDirection(guild); return; }
    await msg.edit({ embeds: [_buildDirectionPanelEmbed(guild, db)], components: [_buildDirectionPanelRow()] });
  } catch(e) { console.log('❌ updateDirectionPanel:', e.message); }
}

// ── Setup #commandes-slash — liste complète ──
async function setupCommandesSlash(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean('commandes-slash')));
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }

    const e1 = new EmbedBuilder().setColor(0x3B82F6).setTitle('📖 COMMANDES — Membres').setDescription('*Commandes accessibles à tous les membres.*')
      .addFields(
        { name: '👤 Profil & Identité', value: '/profil · /fiche [nom] · /hierarchie · /registre', inline: false },
        { name: '🎯 Opérations', value: '/ops · /op [id]', inline: false },
        { name: '📅 Agenda', value: '/agenda voir · /agenda creer', inline: false },
        { name: '📜 Contrats', value: '/contrats', inline: false },
        { name: '🟡 Absences', value: '/absent [durée] · /retour · /avertissements', inline: false },
        { name: '📊 Stats & Info', value: '/stats · /solde · /journal · /aide', inline: false },
      ).setFooter({ text: 'IWC Bot • Commandes membres' });

    const e2 = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🎖️ COMMANDES — Direction').setDescription('*Réservées à la Direction.*')
      .addFields(
        { name: '⚙️ Membres', value: '/promo · /retro · /grade-set · /avertir · /annuler-absence · /registre', inline: false },
        { name: '💰 Trésorerie', value: '/bilan · /contrats-archives · ⚙️ dans coffre-entreprise', inline: false },
        { name: '🎯 Opérations', value: '/op-programmer', inline: false },
        { name: '📊 Dashboard', value: '/dashboard · /rapport · /stats', inline: false },
        { name: '🛠️ Admin', value: '/purge · /sync · /version', inline: false },
      ).setFooter({ text: 'IWC Bot • Commandes Direction' });

    const e3 = new EmbedBuilder().setColor(0xED4245).setTitle('💀 COMMANDES — Fléau & Concepteur').setDescription('*Accès exclusif.*')
      .addFields(
        { name: '⚙️ Config', value: '/op-programmer · /rapport · ⚙️ limites coffre', inline: false },
      ).setFooter({ text: 'IWC Bot • Fléau & Concepteur' });

    const e4 = new EmbedBuilder().setColor(0x555555).setTitle('🤖 AUTOMATISMES — Sans commande').setDescription('*Le bot fait ça tout seul.*')
      .addFields(
        { name: '💰 Trésorerie', value: 'Bouton Nouvelle Transaction → photo → double saisie → validation Direction si > limite', inline: false },
        { name: '📋 Fiches personnages', value: 'Poster dans #fiches-personnages → embed + thread + Notion auto', inline: false },
        { name: '🎭 Identité IC', value: 'Bouton dans #surnom-pseudo → Notion auto', inline: false },
        { name: '🗺️ Plans & Planning', value: 'Photo dans plans → Notion · Photo dans planning → RDV Notion', inline: false },
        { name: '📅 RDV détecté', value: 'Ecrire "rdv", "booker"... dans discussion-hrp → bouton 📅 proposé', inline: false },
        { name: '⏰ Rappels', value: 'Rappel 24h + 1h avant RDV Notion · Rappel 30min avant op programmée', inline: false },
        { name: '🟡 Absences', value: 'Rôle Absent auto · Permissions suspendues · Levée auto à la date de fin', inline: false },
        { name: '🐺 Recrutement', value: 'Candidature → thread discussion · Rappel 24h/72h · Archivage auto', inline: false },
      ).setFooter({ text: 'IWC Bot • Automatismes' });

    await ch.send({ embeds: [e1] });
    await ch.send({ embeds: [e2] });
    await ch.send({ embeds: [e3] });
    await ch.send({ embeds: [e4] });
    console.log('✅ Commandes slash postées');
  } catch(e) { console.log('❌ setupCommandesSlash error:', e.message); }
}

// ── Setup message #surnom-pseudo — embed + bouton ──
async function setupSurnomFormat(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && (clean(c.name).includes('surnompseudo') || clean(c.name).includes('surnom')));
    if (!ch) return;

    // Supprimer les anciens messages texte ou embeds sans bouton
    const msgs = await ch.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) {
      if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {});
    }

    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle('🎭 IDENTITÉ IC — Iron Wolf Company')
        .setDescription([
          '*Renseignez votre identité In Character pour faciliter les interactions RP.*',
          '*Notion et le Registre des Membres sont mis à jour automatiquement.*',
          '',
          '**Cliquez le bouton ci-dessous pour renseigner votre identité.**',
          '*Un formulaire s\'ouvre avec les champs à remplir.*',
        ].join('\n'))
        .setFooter({ text: 'IWC • Identité IC • Mis à jour automatiquement dans Notion' })
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_surnom_ouvrir').setLabel('✏️ Renseigner mon identité IC').setStyle(ButtonStyle.Primary),
      )],
    });
    console.log('✅ Panel surnom-pseudo posté');
  } catch(e) { console.log('❌ setupSurnomFormat error:', e.message); }
}

// ── Flow RDV détecté dans #discussion ──

// ── ÉTAPE 1 : Choisir le type de RDV ──
async function _ouvrirMenuRdv(interaction) {
  const msgId = interaction.customId.replace('btn_rdv_creer_', '');
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor(0x2C3E50)
      .setTitle('📅 Nouveau Rendez-vous — IWC')
      .setDescription('**Étape 1/2** — Sélectionne le type de rendez-vous.')
    ],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rdv_type_select_${msgId}`)
        .setPlaceholder('Type de rendez-vous...')
        .addOptions([
          { label: '👑 Réunion Direction',      value: 'reunion_direction',  description: 'Réunion interne Direction & Conseil', emoji: '👑' },
          { label: '🤝 Rendez-vous Client',     value: 'rdv_client',         description: 'Rencontre avec un partenaire ou client', emoji: '🤝' },
          { label: '🎯 Briefing Opération',     value: 'briefing_op',        description: 'Préparation avant une opération', emoji: '🎯' },
          { label: '📊 Débrief Opération',      value: 'debrief_op',         description: 'Bilan après une opération', emoji: '📊' },
          { label: '🔍 Entretien Recrutement',  value: 'entretien_recru',    description: 'Entretien avec un candidat', emoji: '🔍' },
          { label: '📋 Réunion Pôle Légal',     value: 'reunion_legal',      description: 'Réunion interne pôle légal', emoji: '📋' },
          { label: '🔒 Réunion Confrérie',      value: 'reunion_confrerie',  description: 'Réunion interne La Confrérie', emoji: '🔒' },
          { label: '🎓 Formation Membres',      value: 'formation',          description: 'Session de formation nouveaux membres', emoji: '🎓' },
          { label: '⚖️ Négociation',            value: 'negociation',        description: 'Négociation avec une faction ou partenaire', emoji: '⚖️' },
          { label: '🏥 Rendez-vous Médical',    value: 'rdv_medical',        description: 'Consultation médicale RP', emoji: '🏥' },
          { label: '⚖️ Rendez-vous Juridique',  value: 'rdv_juridique',      description: 'Consultation juridique / avocats RP', emoji: '⚖️' },
          { label: '📝 Autre',                  value: 'autre',              description: 'Autre type de rendez-vous', emoji: '📝' },
        ])
    )],
  });
}

async function _handleRdvTypeSelect(interaction) {
  const typeRdv = interaction.values[0];
  const msgId   = interaction.customId.replace('rdv_type_select_', '');

  // Étape 2 : Choisir qui pinguer
  await interaction.update({
    embeds: [new EmbedBuilder()
      .setColor(0x2C3E50)
      .setTitle('📅 Nouveau Rendez-vous — IWC')
      .setDescription('**Étape 2/2** — Qui doit être convoqué ?')
    ],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rdv_pole_select_${typeRdv}_${msgId}`)
        .setPlaceholder('Choisir les convoqués...')
        .addOptions([
          { label: '⚖️ Pôle Légal',       value: 'legal',   description: 'Ping le rôle Pôle Légal',       emoji: '⚖️' },
          { label: '🔒 La Confrérie',      value: 'illegal', description: 'Ping le rôle La Confrérie',      emoji: '🔒' },
          { label: '👥 Tout le monde',     value: 'tous',    description: 'Ping les deux pôles',             emoji: '👥' },
          { label: '👑 Direction seule',   value: 'direction', description: 'Ping la Direction uniquement', emoji: '👑' },
        ])
    )],
  });
}

// ── ÉTAPE 3 : Modal avec les détails ──
async function _handleRdvPoleSelect(interaction) {
  const parts   = interaction.customId.replace('rdv_pole_select_', '').split('_');
  // Format : rdv_pole_select_{type}_{msgId} — le type peut contenir des _
  // On prend le dernier segment comme msgId (timestamp)
  const allParts = interaction.customId.replace('rdv_pole_select_', '').split('_');
  const pole    = interaction.values[0];
  // Reconstruire le type (tout sauf le dernier segment)
  const typeRdv = allParts.slice(0, -1).join('_');

  const typeLabels = {
    reunion_direction: 'Réunion Direction',
    rdv_client:        'Rendez-vous Client',
    briefing_op:       'Briefing Opération',
    debrief_op:        'Débrief Opération',
    entretien_recru:   'Entretien Recrutement',
    reunion_legal:     'Réunion Pôle Légal',
    reunion_confrerie: 'Réunion Confrérie',
    formation:         'Formation Membres',
    negociation:       'Négociation',
    rdv_medical:       'Rendez-vous Médical',
    rdv_juridique:     'Rendez-vous Juridique',
    autre:             'Autre',
  };
  const typeLabel = typeLabels[typeRdv] || 'Rendez-vous';

  const modal = new ModalBuilder()
    .setCustomId(`modal_rdv_${pole}_${typeRdv}`)
    .setTitle(`📅 ${typeLabel}`);

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('titre').setLabel('Titre / Objet du RDV')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setValue(typeLabel)
        .setPlaceholder('Ex: Réunion stratégique S1, Négociation famille Wellington...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('Ex: 05/06/2026')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('heure').setLabel('Heure de convocation')
        .setStyle(TextInputStyle.Short).setRequired(true)
        .setPlaceholder('Ex: 21h00')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('lieu').setLabel('Lieu de rendez-vous')
        .setStyle(TextInputStyle.Short).setRequired(false)
        .setPlaceholder('Ex: Mairie de Saint Denis, Discord vocal Conseil...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('notes').setLabel('Ordre du jour / Notes')
        .setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400)
        .setPlaceholder('Points à aborder, informations importantes...')
    ),
  );

  await interaction.update({ components: [] });
  await interaction.showModal(modal).catch(() => {});
}

async function _validerModalRdv(interaction) {
  await interaction.deferReply({ ephemeral: false });

  // Format : modal_rdv_{pole}_{typeRdv}
  const withoutPrefix = interaction.customId.replace('modal_rdv_', '');
  const firstUnderscore = withoutPrefix.indexOf('_');
  const pole    = withoutPrefix.substring(0, firstUnderscore); // legal/illegal/tous/direction
  const typeRdv = withoutPrefix.substring(firstUnderscore + 1); // type rdv

  const titre  = interaction.fields.getTextInputValue('titre');
  const dateRaw= interaction.fields.getTextInputValue('date');
  const heure  = interaction.fields.getTextInputValue('heure');
  const lieu   = interaction.fields.getTextInputValue('lieu')  || '—';
  const notes  = interaction.fields.getTextInputValue('notes') || '';

  // Parser la date
  let dateISO = null;
  try {
    const p = dateRaw.split('/');
    if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`;
  } catch {}

  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });

  // Créer dans Notion
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    try {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent: { database_id: process.env.NOTION_AGENDA_DB_ID },
          properties: {
            'Titre': { title:     [{ text: { content: titre } }] },
            'Date':  { date:      { start: dateISO } },
            'Heure': { rich_text: [{ text: { content: heure } }] },
            'Lieu':  { rich_text: [{ text: { content: lieu } }] },
            'Notes': { rich_text: [{ text: { content: notes.slice(0, 2000) } }] },
            'Type':  { select:    { name: 'Réunion' } },
            'Statut':{ select:    { name: 'Planifié' } },
          },
        }),
      });
      console.log(`✅ RDV Notion créé : ${titre}`);
    } catch (e) { console.log('❌ RDV Notion error:', e.message); }
  }

  // pingMap défini plus bas
  // Récupérer le nom IC de l'émetteur
  const db         = loadDB();
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const rdvId      = `RDV-${Date.now().toString().slice(-5)}`;

  const typeLabels = {
    reunion_direction: 'Réunion Direction',   rdv_client: 'Rendez-vous Client',
    briefing_op: 'Briefing Opération',        debrief_op: 'Débrief Opération',
    entretien_recru: 'Entretien Recrutement', reunion_legal: 'Réunion Pôle Légal',
    reunion_confrerie: 'Réunion Confrérie',   formation: 'Formation Membres',
    negociation: 'Négociation',               rdv_medical: 'Rendez-vous Médical',
    rdv_juridique: 'Rendez-vous Juridique',   autre: 'Autre',
  };
  const typeLabel = typeLabels[typeRdv] || typeRdv || 'Rendez-vous';

  const pingMap = {
    legal:     `<@&${ROLE_POLE_LEGAL}>`,
    illegal:   `<@&${ROLE_POLE_ILLEGAL}>`,
    tous:      `<@&${ROLE_POLE_LEGAL}> <@&${ROLE_POLE_ILLEGAL}>`,
    direction: interaction.guild.roles.cache.filter(r => ['Conseil','Directeur','Fléau','Concepteur','Fondateur'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' '),
  };
  const ping = pingMap[pole] || '';

  const poleLabel = { legal: '⚖️ Pôle Légal', illegal: '🔒 La Confrérie', tous: '👥 Tous les membres', direction: '👑 Direction' }[pole] || pole;
  const poleColor = pole === 'illegal' ? 0x8B1A1A : pole === 'direction' ? 0xFFD700 : 0x2C3E50;

  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);

  const isConfrerie = pole === 'illegal' || typeRdv === 'reunion_confrerie';
  const header = isConfrerie
    ? '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   LA CONFRÉRIE — CONVOCATION OFFICIELLE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━'
    : '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — AVIS DE RENDEZ-VOUS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';

  const embed = new EmbedBuilder()
    .setColor(poleColor)
    .setTitle(`📅 ${titre.toUpperCase()}`)
    .setDescription('```\n' + header + '\n```')
    .addFields(
      { name: '🆔 Référence',    value: '`' + rdvId + '`',   inline: true },
      { name: '🗂️ Type',         value: typeLabel,             inline: true },
      { name: '📌 Statut',       value: '🟡 Planifié',         inline: true },
      { name: '📅 Date',         value: dateCapital,            inline: true },
      { name: '🕐 Heure',        value: `**${heure}**`,        inline: true },
      { name: '📍 Lieu',         value: lieu || '—',           inline: true },
      { name: '👥 Convoqués',    value: poleLabel,              inline: true },
      { name: '✍️ Convoqué par', value: `${emetteurIC}`,       inline: true },
    );

  if (notes) embed.addFields({ name: '📋 Ordre du jour', value: notes, inline: false });

  embed.setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` }).setTimestamp();

  // Archivage Notion
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_AGENDA_DB_ID },
        properties: {
          'Titre':     { title:     [{ text: { content: titre } }] },
          'Date':      { date:      { start: dateISO } },
          'Heure':     { rich_text: [{ text: { content: heure } }] },
          'Lieu':      { rich_text: [{ text: { content: lieu || '—' } }] },
          'Notes':     { rich_text: [{ text: { content: notes?.slice(0, 2000) || '' } }] },
          'Type':      { select:    { name: typeLabel } },
          'Statut':    { select:    { name: 'Planifié' } },
          'Référence': { rich_text: [{ text: { content: rdvId } }] },
          'Émetteur':  { rich_text: [{ text: { content: emetteurIC } }] },
          'Convoqués': { rich_text: [{ text: { content: poleLabel } }] },
        },
      }),
    }).catch(e => console.log('❌ RDV Notion error:', e.message));
    console.log(`✅ RDV Notion archivé : ${rdvId} — ${titre}`);
  }

  await interaction.editReply({ content: ping, embeds: [embed] });
}

// ── Surnom-pseudo : modal d'identité IC ──
async function _ouvrirModalSurnom(interaction) {
  const db   = loadDB();
  const data = db.members[interaction.user.id];

  const modal = new ModalBuilder()
    .setCustomId('modal_surnom_identite')
    .setTitle('🎭 Identité IC — Iron Wolf Company');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('pseudo_discord')
        .setLabel('Pseudo Discord')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(interaction.user.username)
        .setPlaceholder('Ex: storm__as')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('nom_ic')
        .setLabel('Nom IC (In Character)')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(data?.name || '')
        .setPlaceholder('Ex: Jonas Caverly')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('surnom_ic')
        .setLabel('Surnom IC (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setValue(data?.surnom || '')
        .setPlaceholder('Ex: Le Loup')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('appartenance')
        .setLabel('Appartenance')
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setValue(data?.pole === 'illegal' ? 'Illégal' : data?.pole === 'legal' ? 'Légal' : '')
        .setPlaceholder('Légal ou Illégal')
    ),
  );

  await interaction.showModal(modal);
}

async function _validerModalSurnom(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const pseudo     = interaction.fields.getTextInputValue('pseudo_discord').trim();
  const nomIC      = interaction.fields.getTextInputValue('nom_ic').trim();
  const surnomIC   = interaction.fields.getTextInputValue('surnom_ic').trim();
  const appartRaw  = interaction.fields.getTextInputValue('appartenance').trim().toLowerCase();
  const isIlleg    = appartRaw.includes('ill');
  const pole       = isIlleg ? 'illegal' : 'legal';

  // Mettre à jour la DB locale
  const db = loadDB();
  if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  db.members[interaction.user.id].name   = nomIC;
  db.members[interaction.user.id].surnom = surnomIC;
  db.members[interaction.user.id].pole   = pole;
  db.members[interaction.user.id].lastActivity = new Date().toISOString();
  saveDB(db);

  // Sync Notion
  await _syncSurnomNotion({
    author: { id: interaction.user.id, username: pseudo },
    content: `NOM IC : ${nomIC}\nSURNOM IC : ${surnomIC}\nAPPARTENANCE : ${isIlleg ? 'Illégal' : 'Légal'}`,
    guild: interaction.guild,
    react: () => {},
  });

  // Confirmation éphémère
  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(isIlleg ? 0x8B1A1A : 0x3B82F6)
    .setTitle('✅ Identité IC enregistrée')
    .addFields(
      { name: '👤 Pseudo Discord', value: pseudo,   inline: true },
      { name: '🎭 Nom IC',         value: nomIC,    inline: true },
      { name: '🏷️ Surnom IC',     value: surnomIC || '—', inline: true },
      { name: '📂 Appartenance',   value: isIlleg ? '🔒 Illégal' : '⚖️ Légal', inline: true },
    )
    .setDescription('*Ton identité a été enregistrée dans le Registre Membres Notion.*')
    .setFooter({ text: 'IWC • Identité IC' })
  ] });
}

// ── Vérification automatique des retours d'absence ──
async function _checkRetoursAbsence(guild) {
  const db  = loadDB();
  const now = Date.now();
  let changed = false;

  for (const [userId, m] of Object.entries(db.members || {})) {
    if (m.status !== 'absent') continue;
    if (!m.absentJusqu) continue; // Indéterminé → retour manuel uniquement

    const finAbsence = new Date(m.absentJusqu).getTime();
    if (now < finAbsence) continue; // Pas encore fini

    // Durée écoulée → lever l'absence automatiquement
    m.status       = 'actif';
    m.lastActivity = new Date().toISOString();
    m.absentJusqu  = null;
    m.absentRaison = null;
    changed = true;

    // Retirer le rôle Absent
    try {
      const membre = await guild.members.fetch(userId).catch(() => null);
      if (membre) {
        const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
        if (roleAbsent) await membre.roles.remove(roleAbsent).catch(() => {});
      }
    } catch {}

    // Sync Notion
    _syncMembreNotion(userId, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});

    // Post dans #absences
    const absCh = getChById(guild, 'ABSENCES', 'absences');
    if (absCh) {
      const discordMembre = await guild.members.fetch(userId).catch(() => null);
      await absCh.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setAuthor({ name: `${discordMembre?.displayName || m.name || userId} — Retour automatique`, iconURL: discordMembre?.user.displayAvatarURL() || undefined })
        .setTitle('✅ Fin d\'absence — Retour automatique')
        .addFields(
          { name: '👤 Membre',  value: `<@${userId}>`, inline: true },
          { name: '📅 Retour',  value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
        )
        .setFooter({ text: 'IWC • Retour automatique détecté' })
        .setTimestamp()
      ] }).catch(() => {});
    }

    // DM au membre pour le prévenir
    try {
      const discordMembre = await guild.members.fetch(userId).catch(() => null);
      if (discordMembre) await discordMembre.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Fin de ton absence — IWC')
        .setDescription("Ta période d'absence est terminée.\n\nTes permissions d'écriture ont été rétablies automatiquement.\n*Bon retour !*")
        .setFooter({ text: 'IWC • Bienvenue de retour' })
      ] }).catch(() => {});
    } catch {}

    console.log(`✅ Retour automatique : ${m.name || userId}`);
  }

  if (changed) saveDB(db);
}

// Exposer les syncs Notion globalement (utilisé par les modules)
global._syncInformateurNotion = _syncInformateurNotion;
global._syncAffaireNotion     = _syncAffaireNotion;
global._syncMembreNotion      = _syncMembreNotion;
global._syncContratNotion     = _syncContratNotion;

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);

// ── PATCH : Setup message format fiche dans #fiches-personnages ──
// Appelé dans autoSetup
async function setupFicheFormat(guild) {
  try {
    const cleanN = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && cleanN(c.name).includes('fichespersonnages'));
    if (!ch) { console.log('⚠️ Salon fiches-personnages introuvable'); return; }

    // Supprimer l'ancien message de format s'il existe (texte brut ou ancien embed)
    const msgs = await ch.messages.fetch({ limit: 30 });
    for (const [, m] of msgs) {
      if (m.author.id === guild.members.me?.id && (m.content.includes('FORMAT FICHE') || m.content.includes('NOM COMPLET'))) {
        await m.delete().catch(() => {});
      }
    }

    // Ne pas recréer si un embed propre existe déjà
    const msgsAfter = await ch.messages.fetch({ limit: 10 });
    const alreadyEmbed = [...msgsAfter.values()].find(m => m.author.id === guild.members.me?.id && m.embeds?.length > 0 && m.embeds[0]?.title?.includes('FICHE'));
    if (alreadyEmbed) return;

    const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

    // Embed 1 — Présentation
    const embedIntro = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('📋 FICHES PERSONNAGES — Iron Wolf Company')
      .setDescription([
        '*Ce salon est dédié aux fiches officielles de vos personnages IWC.*',
        '*Une fiche par membre. Mettez à jour après chaque évolution majeure.*',
        '',
        '**Comment faire :**',
        '> **1.** Copiez le format ci-dessous',
        '> **2.** Remplissez chaque champ',
        '> **3.** Envoyez votre message dans ce salon',
        '> **4.** Le bot génère automatiquement votre fiche et un thread dédié ✅',
      ].join('\n'))
      .setFooter({ text: 'IWC • Fiches personnages • Un thread par personnage' });

    // Embed 2 — Format à copier
    const embedFormat = new EmbedBuilder()
      .setColor(0x3B82F6)
      .setTitle('📝 FORMAT — À copier/coller')
      .setDescription([
        '```',
        'NOM COMPLET :',
        'SURNOM(S) :',
        'ÂGE :',
        'LIEU DE NAISSANCE :',
        'NATIONALITÉ :',
        'TAILLE / CORPULENCE :',
        'YEUX / CHEVEUX :',
        'SIGNES PARTICULIERS :',
        'PROFESSION :',
        'RÉPUTATION :',
        '',
        '"Citation du personnage."',
        '',
        '---- HISTOIRE ----',
        '[5 à 15 lignes minimum]',
        '',
        '---- PERSONNALITÉ ----',
        '→ Trait 1',
        '→ Trait 2',
        '→ Trait 3',
        '',
        '---- COMPÉTENCES ----',
        '⚔️ Compétence : ●●●●○',
        '🎯 Compétence : ●●●●●',
        '',
        '---- FAIBLESSES ----',
        '→ Faiblesse 1',
        '→ Faiblesse 2',
        '',
        '---- LIENS IMPORTANTS ----',
        '[Nom] — [Relation] — [Description courte]',
        '',
        '---- OBJECTIF ----',
        '[Ce que le personnage cherche à accomplir]',
        '',
        '— IWC • 1895 —',
        '```',
      ].join('\n'))
      .addFields(
        { name: '⚠️ Important', value: 'Tous les champs sont libres — écrivez ce qui correspond à votre personnage.\nSeul **NOM COMPLET** est obligatoire pour que le bot reconnaisse votre fiche.', inline: false },
        { name: '🔄 Mise à jour', value: 'Pour modifier votre fiche, repostez-la complète dans ce salon.\nLe thread existant sera réouvert et Notion mis à jour automatiquement.', inline: false },
      )
      .setFooter({ text: 'IWC • Copie le format, remplis les champs, envoie dans ce salon' });

    await ch.send({ embeds: [embedIntro] });
    await ch.send({ embeds: [embedFormat] });
    console.log('✅ Format fiche personnage posté dans #fiches-personnages');
  } catch (e) {
    console.log('❌ setupFicheFormat error:', e.message);
  }
}

// ── Setup message explicatif dans 🗺️・plans ──
async function setupPlansFormat(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name) === clean('plans'));
    if (!ch) { console.log('⚠️ Salon plans introuvable'); return; }

    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.content.includes('PLANS TACTIQUES'));
    if (existing) return;

    const MSG = [
      '```',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  🗺️  PLANS TACTIQUES — IWC',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '```',
      '',
      '**Comment archiver un lieu dans Notion :**',
      '',
      '> **1.** Prends un screen du lieu en jeu',
      '> **2.** Envoie la photo dans ce salon',
      '> **3.** Ajoute le nom du lieu en texte avec ta photo',
      '> **4.** Le bot archive tout automatiquement dans Notion 🗺️',
      '',
      '**Exemple :**',
      '```',
      'Entrepôt Paleto Bay — entrée principale',
      '+ [ta photo jointe]',
      '```',
      '',
      '*Le nom du lieu sera enregistré comme titre dans Notion.*',
      '*Sans texte → archivé sous "Lieu non précisé".*',
      '',
      '```',
      '— IWC • Confidentialité absolue —',
      '```',
    ].join('\n');

    await ch.send(MSG);
    console.log('✅ Message plans tactiques posté');
  } catch (e) {
    console.log('❌ setupPlansFormat error:', e.message);
  }
}

// ── Setup message explicatif dans #planning ──
async function setupPlanningFormat(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name) === clean('planning'));
    if (!ch) { console.log('⚠️ Salon planning introuvable'); return; }

    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.content.includes('PLANNING'));
    if (existing) return;

    const MSG = [
      '```',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '  📅  PLANNING — IWC',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '```',
      '',
      '**Ce salon est lié au calendrier Notion.**',
      '',
      '**Comment ajouter une capture à un RDV :**',
      '',
      '> **1.** Prends un screen lié à la session ou au repérage',
      '> **2.** Envoie la photo dans ce salon',
      '> **3.** Ajoute le nom du lieu ou de l\'opération en texte',
      '> **4.** Le bot attache automatiquement la photo au RDV Notion le plus proche 📅',
      '',
      '**Exemple :**',
      '```',
      'Repérage avant la mission de samedi',
      '+ [ta photo jointe]',
      '```',
      '',
      '*Les textes seuls sont ignorés — images uniquement.*',
      '*Sans texte → attaché au prochain RDV Notion sans titre.*',
      '',
      '```',
      '— IWC • Secrétariat automatique —',
      '```',
    ].join('\n');

    await ch.send(MSG);
    console.log('✅ Message planning posté');
  } catch (e) {
    console.log('❌ setupPlanningFormat error:', e.message);
  }
}

