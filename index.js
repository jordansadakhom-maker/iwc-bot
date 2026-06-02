require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ChannelType, ActivityType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
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

process.on('unhandledRejection', (reason, promise) => {
  console.log('⚠️ Unhandled Rejection:', reason?.message || reason);
  if (reason?.stack) console.log(reason.stack.split('\n').slice(0,5).join('\n'));
});
process.on('uncaughtException', err => {
  console.log('⚠️ Uncaught Exception:', err?.message || err);
  if (err?.stack) console.log(err.stack.split('\n').slice(0,8).join('\n'));
});
process.on('SIGTERM', () => { saveDBSync(); process.exit(0); });
process.on('SIGINT',  () => { saveDBSync(); process.exit(0); });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel, Partials.GuildMember],
});

const {
  CH, PARTICIPANTS_MAP, CONTRAT_ROLES, JUNE_MCCALL_ID,
  ROLE_POLE_LEGAL, ROLE_POLE_ILLEGAL, ROLE_ABSENT,
  MEMBRES_DISCORD_MAP, DISCORD_TO_IC,
  NOTION_RECRUTEMENT_DB, NOTION_MEMBRES_DB_ID: NOTION_MEMBRES_DB,
  SALON_IDS, _getPole,
} = require('./config');

function getChById(guild, salonKey, ...fallbackNames) {
  // D'abord chercher dans SALON_IDS (config.js)
  const id = SALON_IDS?.[salonKey];
  if (id) { const ch = guild.channels.cache.get(id); if (ch) return ch; }
  // Ensuite dans SALON_HARDCODED (IDs hardcodés IWC)
  if (typeof SALON_HARDCODED !== 'undefined' && SALON_HARDCODED[salonKey]) {
    const ch = guild.channels.cache.get(SALON_HARDCODED[salonKey]);
    if (ch) return ch;
  }
  // Fallback par nom
  for (const name of fallbackNames) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

// ── IDs Rôles hardcodés (fallback si config.js incomplet) ──
const ROLE_ABSENT_ID = '1511134028474876035';
// Surcharger ROLE_ABSENT si non défini dans config.js
const _ROLE_ABSENT_FINAL = ROLE_ABSENT || ROLE_ABSENT_ID;

// ── IDs Salons hardcodés (source: config Discord IWC) ──
const SALON_HARDCODED = {
  JOURNAL_DE_BORD:      '1508756535407542372',
  CONTRATS:             '1508756442730074222',
  CONTRATS_REPONSES:    '1509340674779254876',
  COFFRE_ENTREPRISE:    '1508756453354373202',
  COFFRE_ILLEGAL:       '1508756490432024636',
  ABSENCES:             '1509718164760563743',
  AFFAIRES_LEGAL:       '1508756508362674337',
  AFFAIRES_ILLEGAL:     '1509254234413994004',
  DOSSIER_RECRUTEMENT:  '1509252295127466096',
  PLANS:                '1508756493845925960',   // #plans (séparé d'informateurs)
  INFORMATEURS:         '1509255294184853524',   // #informateurs
};
const NOTION_TRANSACTIONS_DB = '36ff4436a86c80ecb4a9ebcabc104a07';

function getChHard(guild, key) {
  const id = SALON_HARDCODED[key];
  if (!id) return null;
  return guild.channels.cache.get(id) || null;
}

// Retourne le salon #absences selon le pôle du membre
function getAbsencesCh(guild, member) {
  const roles = member?.roles?.cache;
  if (!roles) return guild.channels.cache.get(SALON_HARDCODED.ABSENCES_ILLEGAL);
  // Détecter le pôle : noms de rôles légaux
  const legalRoles = ['Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent Confirmé', 'Opérateur', 'Recrue', 'Probatoire', 'Instructeur', 'Le Penseur', 'Fondateur'];
  const illegalRoles = ['Concepteur', 'Fléau', "L'Exécuteur", 'Le Condamné', 'Le Maudit', 'La Confrérie', 'Instructeur', 'Le Concepteur'];
  const isLegal = roles.some(r => legalRoles.some(n => r.name.includes(n)));
  const isIllegal = roles.some(r => illegalRoles.some(n => r.name.includes(n)));
  if (isIllegal && !isLegal) return guild.channels.cache.get(SALON_HARDCODED.ABSENCES_ILLEGAL);
  if (isLegal && !isIllegal) return guild.channels.cache.get(SALON_HARDCODED.ABSENCES_LEGAL);
  // Direction (les deux pôles) → légal par défaut
  return guild.channels.cache.get(SALON_HARDCODED.ABSENCES_LEGAL);
}

// Archive un contrat signé/refusé dans #contrats-reponses avec un thread par contrat
async function archiverContratReponses(guild, contrat, statut, embed) {
  try {
    const ch = getChHard(guild, 'CONTRATS_REPONSES') || guild.channels.cache.get('1509340674779254876');
    if (!ch) return;
    const threadName = `${statut === 'signe' ? '✅' : '❌'} ${contrat.id} — ${(contrat.objet || '').slice(0, 50)}`;
    // Chercher si un thread existe déjà pour ce contrat
    let thread = ch.threads?.cache.find(t => t.name.includes(contrat.id));
    if (!thread) {
      try {
        // Chercher dans les threads archivés aussi
        const archived = await ch.threads.fetchArchived().catch(() => null);
        if (archived) thread = archived.threads.find(t => t.name.includes(contrat.id));
      } catch {}
    }
    if (!thread) {
      // Créer un thread sans message parent épinglé
      try {
        thread = await ch.threads.create({
          name: threadName,
          autoArchiveDuration: 10080,
          type: 12, // PRIVATE_THREAD ou PUBLIC_THREAD selon le salon
          reason: `Contrat ${contrat.id}`,
        });
      } catch {
        // Fallback si threads.create non supporté → message + thread
        const msg = await ch.send({ content: `📋 **${threadName}**` });
        try { thread = await msg.startThread({ name: threadName, autoArchiveDuration: 10080 }); } catch {}
      }
    }
    if (thread) {
      await thread.send({ embeds: [embed] });
    } else {
      // Dernier fallback : envoyer directement dans le salon
      await ch.send({ embeds: [embed] });
    }
  } catch (e) { console.log('❌ archiverContratReponses error:', e.message); }
}

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('stats').setDescription('Affiche les statistiques de la Compagnie'),
  new SlashCommandBuilder().setName('solde').setDescription('Affiche les soldes des coffres'),
  new SlashCommandBuilder().setName('fiche').setDescription("Affiche la fiche d'un membre").addStringOption(o => o.setName('nom').setDescription('Nom du personnage').setRequired(true)),
  new SlashCommandBuilder().setName('ops').setDescription('Liste les opérations actives'),
  new SlashCommandBuilder().setName('absent').setDescription('🟡 Déclarer une absence'),
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
  new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche le profil d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)').setRequired(false)),
  new SlashCommandBuilder().setName('bilan').setDescription('📊 Résumé trésorerie 7 derniers jours').addStringOption(o => o.setName('coffre').setDescription('Quel coffre ?').setRequired(false).addChoices({ name: '⚖️ Légal', value: 'legal' }, { name: '🔒 Illégal', value: 'illegal' })),
  new SlashCommandBuilder().setName('rdv').setDescription('📅 Créer un rendez-vous'),
  new SlashCommandBuilder().setName('agenda').setDescription('📅 Voir ou créer un RDV')
    .addSubcommand(s => s.setName('voir').setDescription('Voir les prochains RDV'))
    .addSubcommand(s => s.setName('creer').setDescription('Créer un nouveau RDV dans Notion')),
  new SlashCommandBuilder().setName('op-programmer').setDescription('🕐 Programmer une opération avec lancement automatique (Direction)'),
  new SlashCommandBuilder().setName('op-creer').setDescription('🎯 Créer une nouvelle opération (Direction)'),
  new SlashCommandBuilder().setName('setup-serveur').setDescription('🔧 Réorganiser la structure du serveur Discord (Fondateur uniquement)'),
  new SlashCommandBuilder().setName('aide').setDescription('📖 Guide des commandes disponibles'),
  new SlashCommandBuilder().setName('patch').setDescription('Deployer le patch note'),
  new SlashCommandBuilder().setName('version').setDescription('🔢 Version du bot et statut des connexions'),
  new SlashCommandBuilder().setName('sync').setDescription('🔄 Forcer une synchronisation manuelle (Direction)'),
  new SlashCommandBuilder().setName('avertir').setDescription('⚠️ Avertir un membre (Direction)').addUserOption(o => o.setName('membre').setDescription('Membre à avertir').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison de l\'avertissement').setRequired(true)),
  new SlashCommandBuilder().setName('avertissements').setDescription('📋 Voir les avertissements d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel, défaut: toi)').setRequired(false)),
  new SlashCommandBuilder().setName('retour').setDescription('✅ Déclarer son retour d\'absence').addUserOption(o => o.setName('membre').setDescription('Membre (Direction uniquement — laisser vide pour soi-même)').setRequired(false)),
  new SlashCommandBuilder().setName('purge').setDescription('🗑️ Effacer les messages d\'un salon (Direction)').addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages à supprimer (1-100, défaut: tous)').setRequired(false).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('annuler-absence').setDescription('🔓 Lever l\'absence d\'un membre (Direction)').addUserOption(o => o.setName('membre').setDescription('Membre dont lever l\'absence').setRequired(true)),
  new SlashCommandBuilder().setName('contrats').setDescription('📜 Voir mes contrats en cours'),
  new SlashCommandBuilder().setName('registre').setDescription('📋 Liste des membres actifs (Direction)').addStringOption(o => o.setName('pole').setDescription('Filtrer par pôle').setRequired(false).addChoices({ name: 'Tous', value: 'tous' }, { name: '⚖️ Légal', value: 'legal' }, { name: '🔒 Illégal', value: 'illegal' })).addIntegerOption(o => o.setName('page').setDescription('Page').setRequired(false)),
  new SlashCommandBuilder().setName('op').setDescription('🎯 Détail d\'une opération').addStringOption(o => o.setName('id').setDescription('ID de l\'opération').setRequired(false)),
].map(c => c.toJSON());

async function registerSlashCommands(guild) {
  try { await guild.commands.set(SLASH_COMMANDS); console.log('✅ Slash commands enregistrées'); }
  catch (e) { console.log('❌ Slash commands error:', e.message); }
}

function nomParticipant(member) { return DISCORD_TO_IC[member.id] || member.user?.username || member.displayName || 'Inconnu'; }
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function fmtLong(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanName = clean(name);
    // 1. Cherche exact en priorité
    const exact = guild.channels.cache.find(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      clean(c.name) === cleanName
    );
    if (exact) return exact;
    // 2. Fallback includes — mais évite les faux positifs (ex: "logs" dans "patch-note-logs")
    const partial = guild.channels.cache.find(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      clean(c.name).includes(cleanName) &&
      !clean(c.name).includes('patchnote') &&
      !clean(c.name).includes('patch')
    );
    if (partial) return partial;
  }
  return null;
}
function getChExact(guild, name) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return guild.channels.cache.find(c => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) && clean(c.name) === clean(name)) || null;
}
function getMention(guild) { return guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ') || ''; }
// Retourne les options allowedMentions sécurisées (jamais @everyone/@here)
function safeMentions(roleIds = [], userIds = []) {
  return { parse: [], roles: roleIds.filter(Boolean), users: userIds.filter(Boolean) };
}
function getContratMention(guild) { const roles = CONTRAT_ROLES.map(id => guild.roles.cache.get(id)).filter(Boolean).map(r => `<@&${r.id}>`); return [...roles, `<@${JUNE_MCCALL_ID}>`].join(' '); }
function isDirection(member) { return member?.roles.cache.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'].some(n => r.name.includes(n))); }
function isMembre(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => r.name !== '@everyone' && !r.name.toLowerCase().includes('visiteur')) || false;
}
function isFondateurOuFleau(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => ['Fondateur', 'Fléau'].some(n => r.name.includes(n))) || false;
}
function isOfficierOuDirection(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Co-Directeur'].some(n => r.name.includes(n))) || false;
}
// #journal-de-bord = destination pour TOUS les logs IC
async function getLogsCh(guild) {
  const journalCh = guild.channels.cache.get('1508756535407542372');
  if (journalCh) return journalCh;
  // fallback : #logs technique
  let ch = guild.channels.cache.get(CH.LOGS);
  if (!ch) ch = await guild.channels.fetch(CH.LOGS).catch(() => null);
  return ch;
}
function getJournalCh(guild) { return guild.channels.cache.get('1508756535407542372') || null; }

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
  // Tout va dans #journal-de-bord
  const ch = await getLogsCh(guild);
  if (!ch) return;
  const cfgs = {
    ARRIVEE: { color: 0x57F287, title: 'ARRIVÉE — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '🔢 Âge du compte', value: data.accountAge + ' jours', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    DEPART: { color: 0x555555, title: 'DÉPART — ' + data.username, fields: [{ name: '👤 Membre', value: data.username, inline: true }, { name: '🎖️ Rang', value: data.rang || '—', inline: true }, { name: '⏱️ Durée', value: data.duree || '—', inline: true }] },
    REGLEMENT_VALIDE: { color: 0x3B82F6, title: 'RÈGLEMENT VALIDÉ — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_RECUE: { color: 0xFFA500, title: 'CANDIDATURE REÇUE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_ACCEPTEE: { color: 0x57F287, title: 'CANDIDATURE ACCEPTÉE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '✅ Par', value: data.validePar || '—', inline: true }] },
    CANDIDATURE_REFUSEE: { color: 0xED4245, title: 'CANDIDATURE REFUSÉE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }] },
    ABSENCE: { color: 0xFFA500, title: 'ABSENCE — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CONTRAT_SIGNE: { color: 0x57F287, title: 'CONTRAT SIGNÉ — ' + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }, { name: '✍️ Signé par', value: data.signe, inline: true }] },
    CONTRAT_REFUSE: { color: 0xED4245, title: 'CONTRAT REFUSÉ — ' + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }] },
    OPERATION: { color: 0xFFA500, title: 'OPÉRATION — ' + data.nom, fields: [{ name: '🎯 Nom', value: data.nom, inline: true }, { name: '📍 Lieu', value: data.lieu || '—', inline: true }, { name: '📋 Statut', value: data.statut || '—', inline: true }] },
    PROMOTION: { color: 0x57F287, title: 'PROMOTION — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📉 Ancien rang', value: data.ancienRang || '—', inline: true }, { name: '📈 Nouveau rang', value: data.nouveauRang || '—', inline: true }, { name: '✅ Décidé par', value: data.validePar || '—', inline: true }] },
    RETROGRADATION: { color: 0xED4245, title: 'RÉTROGRADATION — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📉 Ancien rang', value: data.ancienRang || '—', inline: true }, { name: '📈 Nouveau rang', value: data.nouveauRang || '—', inline: true }, { name: '📝 Raison', value: data.raison || '—', inline: true }] },
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
  const db = loadDB();
  const ch = getChById(guild, 'DASHBOARD', 'dashboard');
  if (!ch) return;
  // Sécurité: ne jamais poster le dashboard dans dossier-recrutement
  if (ch.id === SALON_HARDCODED.DOSSIER_RECRUTEMENT) { console.log('⚠️ updateDashboard: salon dossier-recrutement ignoré'); return; }
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
    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (msgs) {
      const botMsgs = [...msgs.values()].filter(m => m.author.id === ch.guild.members.me?.id && m.embeds?.length > 0).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      for (let i = 1; i < botMsgs.length; i++) await botMsgs[i].delete().catch(() => {});
      if (botMsgs.length > 0) {
        try { await botMsgs[0].edit({ embeds: [embed] }); db.dashboardMsgId = botMsgs[0].id; saveDB(db); return; }
        catch { await botMsgs[0].delete().catch(() => {}); }
      }
    }
    if (db.dashboardMsgId) { const msg = await ch.messages.fetch(db.dashboardMsgId).catch(() => null); if (msg) { await msg.edit({ embeds: [embed] }); return; } }
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
    const rolesCibles = ['Fléau', 'Concepteur'];
    let envoyes = 0;
    const membres = await guild.members.fetch().catch(() => null);
    if (membres) { for (const [, member] of membres) { if (!member.roles.cache.some(r => rolesCibles.some(n => r.name.includes(n)))) continue; try { await member.send({ embeds: [embed] }); envoyes++; } catch {} } }
    console.log(`✅ Rapport hebdo envoyé à ${envoyes} membre(s)`);
  } catch (e) { console.log('❌ Rapport quotidien error:', e.message); }
}

// ── [CORRECTION] Journal IC → poste dans #journal-de-bord ──
async function ajouterJournalIC(guild, entry) {
  try {
    const ch = guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD) || getChById(guild, 'JOURNAL_DE_BORD', 'journal-de-bord', 'journal');
    if (!ch) return;
    const emojiMap = { operation: '🎯', contrat: '📜', recrutement: '🐺', tresorerie: '💰', promotion: '⬆️', autre: '📋' };
    const emoji = entry.emoji || emojiMap[entry.type] || '📋';
    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle(`${emoji} ${entry.titre}`)
      .setDescription(entry.description || '')
      .addFields({ name: '✍️ Auteur', value: entry.auteur || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true })
      .setFooter({ text: `IWC • Journal IC • ${new Date().toLocaleString('fr-FR')}` })
      .setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch (e) { console.log('❌ ajouterJournalIC error:', e.message); }
}

// Wrapper pour compatibilité avec notionModules.ajouterJournalIC
const _ajouterJournalICOriginal = notionModules.ajouterJournalIC;
notionModules.ajouterJournalIC = async (guild, entry) => {
  await ajouterJournalIC(guild, entry);
  // Ne pas appeler l'original pour éviter les doublons dans d'autres salons
};

async function handleSlashCommand(interaction) {
  const { commandName, guild } = interaction; const db = loadDB();
  if (commandName === 'grade-set')         { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV3.handleGradeSetCommand?.(interaction); }
  if (commandName === 'hierarchie')        return notionV3.handleHierarchieCommand?.(interaction);
  if (commandName === 'affaire') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('modal_affaire').setTitle('📋 Soumettre une affaire');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel("Titre de l'affaire").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Proposition alliance, Demande de contrat...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description détaillée').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Détails, contexte, personnes impliquées...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('urgence').setLabel('Urgence (faible / normale / haute)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('normale')),
    );
    return interaction.showModal(modal);
  }
  if (commandName === 'tresor')            { if (!isOfficierOuDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction et aux Officiers de Terrain.', flags: MessageFlags.Ephemeral }); return notionModules.handleTresorCommand?.(interaction); }
  if (commandName === 'dashboard')         { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleDashboard?.(interaction); }
  if (commandName === 'journal')           { if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); return notionModules.handleJournalCommand?.(interaction); }
  if (commandName === 'contrats-archives') { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleContratsArchives?.(interaction); }
  if (commandName === 'contrats')          return _handleMesContrats(interaction);
  if (commandName === 'registre') { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); }
  if (commandName === 'registre')         return _handleRegistre(interaction);
  if (commandName === 'op')               return _handleOpDetail(interaction);
  if (commandName === 'profil')            return handleProfilEnhanced(interaction);
  if (commandName === 'bilan')             { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleBilanCommand?.(interaction); }
  if (commandName === 'rdv')               { if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); return _ouvrirMenuRdvSlash(interaction); }
  if (commandName === 'agenda') { if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); }
  if (commandName === 'agenda') {
    const subCmd = interaction.options?.getSubcommand(false);
    if (subCmd === 'creer') return _ouvrirModalAgendaSimple(interaction);
    if (subCmd === 'rdv') return _ouvrirMenuRdvSlash(interaction);
    return notionV3.handleAgendaCommand?.(interaction);
  }
  if (commandName === 'op-programmer')     { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return _ouvrirModalOpProgrammee(interaction); }
  if (commandName === 'op-creer')          return _ouvrirModalOpCreer(interaction);
  if (commandName === 'setup-serveur')     return _handleSetupServeur(interaction);
  if (commandName === 'aide')              return _handleAide(interaction);
  if (commandName === 'patch')             { if (!isFondateurOuFleau(interaction.member)) return interaction.reply({ content: '❌ Réservé au Fondateur et au Fléau.', flags: MessageFlags.Ephemeral }); return _handlePatchDeploy(interaction); }
  if (commandName === 'version')           return _handleVersion(interaction);
  if (commandName === 'sync')              return _handleSync(interaction);
  if (commandName === 'avertir')           return _handleAvertir(interaction);
  if (commandName === 'avertissements')    return _handleAvertissements(interaction);
  if (commandName === 'retour')            return _handleRetour(interaction);
  if (commandName === 'annuler-absence')   return _handleAnnulerAbsence(interaction);
  if (commandName === 'purge')             return _handlePurge(interaction);

  if (commandName === 'stats') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV5.handleStatsAvancees?.(interaction); }
  if (commandName === 'solde') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    const soldeLegal = db.coffres?.legal || 0; const soldeIlleg = db.coffres?.illegal || 0;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('💰 Soldes des coffres — IWC').addFields({ name: '⚖️ Coffre Légal', value: `**$${soldeLegal.toLocaleString('fr-FR')}**`, inline: true }, { name: '🔒 Coffre Illégal', value: `**$${soldeIlleg.toLocaleString('fr-FR')}**`, inline: true }, { name: '💎 Total', value: `**$${(soldeLegal + soldeIlleg).toLocaleString('fr-FR')}**`, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })], flags: isDirection(interaction.member) ? undefined : MessageFlags.Ephemeral });
    return;
  }
  if (commandName === 'fiche') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    const nom = interaction.options.getString('nom').toLowerCase();
    const cand = (db.candidatures || []).find(c => c.status === 'acceptee' && c.nomPerso?.toLowerCase().includes(nom));
    if (!cand) { const nomIC = Object.keys(MEMBRES_DISCORD_MAP).find(n => n.toLowerCase().includes(nom)); if (nomIC) { const discordId = MEMBRES_DISCORD_MAP[nomIC]; const membre = db.members[discordId]; await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`👤 Fiche — ${nomIC}`).setDescription('*Membre fondateur — fiche à compléter dans Notion*').addFields({ name: '🎭 Personnage', value: nomIC, inline: true }, { name: '📋 Statut', value: membre?.status === 'absent' ? '⚠️ Absent' : '✅ Actif', inline: true }, { name: '🎖️ Rang', value: membre?.rang || '—', inline: true }).setFooter({ text: 'IWC • Fiche personnage' })], flags: MessageFlags.Ephemeral }); return; } await interaction.reply({ content: `❌ Aucune fiche trouvée pour **${interaction.options.getString('nom')}**.`, flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(cand.type === 'illegal' ? 0x8B1A1A : 0x3B82F6).setTitle(`👤 Fiche — ${cand.nomPerso}`).addFields({ name: '🎭 Personnage', value: cand.nomPerso, inline: true }, { name: '🎂 Âge', value: cand.agePerso || '—', inline: true }, { name: '⚖️ Pôle', value: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal', inline: true }, { name: '💼 Métier', value: cand.metier || cand.specialite || '—', inline: true }, { name: '🕐 Disponibilités', value: cand.dispos || '—', inline: true }, { name: '📅 Entrée', value: fmtShort(cand.acceptedAt), inline: true }, { name: '📖 Background', value: (cand.background || '—').slice(0, 500) + ((cand.background?.length || 0) > 500 ? '...' : '') }).setFooter({ text: 'IWC • Fiche personnage' })], flags: MessageFlags.Ephemeral });
    return;
  }
  if (commandName === 'ops') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    const opsActives = (db.operations || []).filter(o => ['preparation', 'en_cours'].includes(o.status));
    if (!opsActives.length) { await interaction.reply({ content: '*Aucune opération en cours ou en préparation.*', flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🎯 Opérations actives — IWC').setDescription(opsActives.map(o => [`**${o.name}** — ${o.status === 'en_cours' ? '🟢 En cours' : '🟡 Préparation'}`, `📍 ${o.lieu || '—'} · 👥 ${(o.participants || []).join(', ') || 'Aucun'}`].join('\n')).join('\n\n')).setFooter({ text: `IWC • ${fmtShort(new Date())}` })], ephemeral: false });
    return;
  }

  if (commandName === 'absent') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    // Ouvrir un modal pour saisie libre de la durée + options
    const modal = new ModalBuilder().setCustomId('modal_absent').setTitle('🟡 Déclarer une absence');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duree')
          .setLabel('Durée')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 2 jours · 1 semaine · jusqu\'au 10 juin · ce soir 22h · Indéterminé')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('raison')
          .setLabel('Raison (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Ex: vacances, travail, IRL...')
      ),
    );
    await interaction.showModal(modal);
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
    await ajouterJournalIC(guild, { type: 'promotion', titre: `Promotion — ${cible.username}`, description: `${ancienRang} → **${nouveauRang}** · Décidé par ${interaction.user.username}`, auteur: interaction.user.username });
    await envoyerDMRecap(interaction.guild, membre.id, 'grade', { ancien: ancienRang, nouveau: nouveauRang }).catch(() => {});
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
    await ajouterJournalIC(guild, { type: 'promotion', titre: `Rétrogradation — ${cible.username}`, description: `${ancienRang} → **${nouveauRang}** · Raison : ${raison}`, auteur: interaction.user.username });
    await envoyerDMRecap(interaction.guild, membre.id, 'grade', { ancien: ancienRang, nouveau: nouveauRang }).catch(() => {});
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`⬇️ Rétrogradation — ${cible.username}`).addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '📉 Ancien rang', value: ancienRang, inline: true }, { name: '📈 Nouveau rang', value: nouveauRang, inline: true }, { name: '📝 Raison', value: raison, inline: true }, { name: '✅ Décidé par', value: interaction.user.username, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    return;
  }
}

async function cleanBotPinnedMessages(guild, ...channelNames) {
  const botId = guild.members.me?.id; if (!botId) return;
  for (const name of channelNames) {
    try {
      const ch = getCh(guild, name); if (!ch) continue;
      const pinnedRaw = await ch.messages.fetchPins().catch(() => null);
      if (pinnedRaw) {
        const pinnedList = pinnedRaw.values ? [...pinnedRaw.values()] : (Array.isArray(pinnedRaw) ? pinnedRaw : []);
        for (const msg of pinnedList) { if (msg.author.id !== botId) continue; await msg.unpin().catch(() => {}); await msg.delete().catch(() => {}); }
      }
      const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      if (!msgs) continue;
      for (const [, msg] of msgs) { if (msg.type === 6) await msg.delete().catch(() => {}); }
      const botMsgs = [...msgs.values()].filter(m => m.author.id === botId && m.embeds?.length > 0).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      for (let i = 1; i < botMsgs.length; i++) { await botMsgs[i].delete().catch(() => {}); }
    } catch (e) { console.log(`❌ cleanBotPinnedMessages error dans ${name}:`, e.message); }
  }
}

async function _cleanTransactionMessages(guild, channelName) {
  try {
    const ch = getCh(guild, channelName); if (!ch) return;
    const botId = guild.members.me?.id; if (!botId) return;
    const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null); if (!msgs) return;
    const orphelins = [...msgs.values()].filter(m => m.author.id === botId && m.embeds?.length > 0 && !(m.components?.length > 0) && m.type === 0);
    for (const m of orphelins) await m.delete().catch(() => {});
    if (orphelins.length > 0) console.log(`🧹 ${orphelins.length} transaction(s) orpheline(s) supprimée(s) dans #${ch.name}`);
  } catch (e) { console.log('❌ _cleanTransactionMessages error:', e.message); }
}

async function autoSetup(guild) {
  const db = loadDB(); console.log('🔧 Auto-setup en cours...');
  await cleanBotPinnedMessages(guild, 'planning', 'grade', 'coffre-entreprise', 'coffre-illegal', 'affaires');
  // Nettoyer le format "PLANS TACTIQUES" s'il a été posté par erreur dans #informateurs
  try {
    const infosCh2 = getChById(guild, 'INFORMATEURS', 'informateurs');
    if (infosCh2) {
      const msgs = await infosCh2.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) {
        if (m.author.id === guild.members.me?.id && m.embeds?.[0]?.title?.includes('PLANS TACTIQUES')) {
          await m.delete().catch(() => {});
        }
      }
    }
  } catch {}
  // Nettoyer le dashboard des salons dossier-recrutement
  try {
    const dossCh = guild.channels.cache.get(SALON_HARDCODED.DOSSIER_RECRUTEMENT);
    if (dossCh) {
      const msgs = await dossCh.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) {
        if (m.author.id === guild.members.me?.id && m.embeds?.[0]?.title?.includes('TABLEAU DE BORD')) {
          await m.delete().catch(() => {});
        }
      }
    }
  } catch {}
  notionModules.nettoyerTransactionsFantomes?.();
  await _cleanTransactionMessages(guild, 'coffre-entreprise');
  await _cleanTransactionMessages(guild, 'coffre-illegal');
  await updateDashboard(guild);
  await notionModules.setupTresorButton?.(guild);
  // Nettoyer les mauvais messages dans #absences (le panel affaires ne doit pas être là)
  try {
    // Nettoyer les deux salons absences (légal + illégal)
    for (const absId of [SALON_HARDCODED.ABSENCES_LEGAL, SALON_HARDCODED.ABSENCES_ILLEGAL]) {
      const absCh = guild.channels.cache.get(absId);
      if (!absCh) continue;
      const msgs = await absCh.messages.fetch({ limit: 50 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) {
        if (m.author.id === guild.members.me?.id && m.embeds?.[0]?.title?.includes('AFFAIRES')) {
          await m.delete().catch(() => {});
        }
      }
    }
  } catch {}
  // Panel affaires dans les bons salons uniquement
  await notionV3.setupAffairesPanel?.(guild);
  await notionV3.updateHierarchieEmbed?.(guild);
  await notionV3.setupInformateursPanel?.(guild);
  await setupFicheFormat(guild);
  await setupPlansFormat(guild);
  await setupPlanningFormat(guild);
  await setupSurnomFormat(guild);
  await setupCommandesSlash(guild);
  await setupPanelDirection(guild);
  if (typeof setupOperationsGuide === 'function') await setupOperationsGuide(guild);
  // Sync statut + pôle de tous les membres dans Fiches_personnages au démarrage
  _syncTousMembresNotion(guild).catch(() => {});

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

  const contratsCh = guild.channels.cache.get(SALON_HARDCODED.CONTRATS) || guild.channels.cache.get(CH.CONTRATS);
  if (contratsCh) {
    const msgs = await contratsCh.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) {
      if (m.author.id === client.user.id && m.embeds[0]?.title?.includes('CONTRATS')) {
        const hasRdvBtn = m.components?.[0]?.components?.some(c => c.customId === 'btn_rdv_creer_contrat_panel');
        if (!hasRdvBtn) await m.delete().catch(() => {});
      }
    }
    const msgs2 = await contratsCh.messages.fetch({ limit: 10 });
    if (!msgs2.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('CONTRATS'))) {
      const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 IRON WOLF COMPANY — CONTRATS').setDescription('*Tout accord entre la Compagnie et ses partenaires doit être formalisé.*\n*Un contrat signé engage les deux parties sans exception.*').addFields({ name: '📤 Envoyer nos conditions', value: '→ Tu envoies tes tarifs & conditions à un client\n→ Le client signe → tu reçois la notification' }, { name: '📥 Signer un contrat employeur', value: '→ Une entreprise vous engage\n→ Tu rentres ses infos & ses conditions\n→ Tu signes → ils reçoivent la notification' }).setFooter({ text: 'Iron Wolf Company • Secrétariat officiel' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_contrat_offre').setLabel('📤 Envoyer nos conditions').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('open_contrat_emploi').setLabel('📥 Signer un contrat employeur').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_rdv_creer_contrat_panel').setLabel('📅 Planifier un RDV').setStyle(ButtonStyle.Secondary),
      );
      await contratsCh.send({ embeds: [embed], components: [row] });
    }
  }
  console.log('✅ Auto-setup terminé\n');
}

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
    const mins = Math.floor((dt.getTime() - Date.now()) / 60000);
    const ping = buildParticipantMentions(a.participants) || mention;
    const heureAff = dt.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    const mkEmbed = (t, c) => new EmbedBuilder().setColor(c).setTitle(t).setDescription(`## 📅 ${a.titre}`).addFields({ name: 'Quand', value: `${fmtLong(a.date)}${heureAff ? ` à **${heureAff}**` : ''}`, inline: true }, { name: 'Lieu', value: a.lieu || '—', inline: true }, { name: 'Participants', value: a.participants?.length > 0 ? a.participants.join(', ') : '—' }, ...(a.notes ? [{ name: 'Notes', value: a.notes }] : []), { name: 'Modifier', value: `[Notion](${a.url})` }).setFooter({ text: 'IWC • Secrétariat automatique' });
    const sent = k => db.sentReminders[`${a.id}_${k}`];
    const getMsgId = k => db.reminderMsgIds[`${a.id}_${k}`];
    const envoyerRappel = async (key, prevKey, pingText, embed, dmTitle, dmColor) => {
      if (sent(key)) return;
      if (prevKey && getMsgId(prevKey)) { const prevMsg = await ch.messages.fetch(getMsgId(prevKey)).catch(() => null); if (prevMsg) await prevMsg.delete().catch(() => {}); delete db.reminderMsgIds[`${a.id}_${prevKey}`]; }
      const msg = await ch.send({ content: pingText, embeds: [embed] }).catch(() => null);
      if (msg) db.reminderMsgIds[`${a.id}_${key}`] = msg.id;
      for (const name of (a.participants || [])) { const uid = PARTICIPANTS_MAP[name]; if (uid && !uid.startsWith('<@&')) { await envoyerDMRecap(guild, uid, 'rappel', { titre: a.titre, dans: dmTitle, date: fmtLong(a.date), heure: a.heure || '', lieu: a.lieu || '—' }).catch(() => {}); } }
      db.sentReminders[`${a.id}_${key}`] = true; changed = true;
    };
    if (mins > 0) {
      if (a.notif24 && !sent('24h') && mins <= 1440 && mins > 60) await envoyerRappel('24h', null, `${ping} — 📅 RDV dans 24h`, mkEmbed('📅 Rappel — 24 heures', 0x5865F2), '📅 Rappel — RDV dans 24h', 0x5865F2);
      if (a.notif1h && !sent('1h') && mins <= 60 && mins > 15) await envoyerRappel('1h', '24h', `${ping} — ⏰ RDV dans 1 heure`, mkEmbed('⏰ Rappel — 1 heure', 0xFFA500), '⏰ Rappel — RDV dans 1 heure', 0xFFA500);
      if (a.notif15 && !sent('15min') && mins <= 15) await envoyerRappel('15min', '1h', `${ping} — 🚨 15 minutes !`, mkEmbed('🚨 URGENT — 15 min', 0xED4245), '🚨 URGENT — RDV dans 15 minutes !', 0xED4245);
    }
    if (mins < -120) { ['24h','1h','15min'].forEach(k => { delete db.sentReminders[`${a.id}_${k}`]; delete db.reminderMsgIds[`${a.id}_${k}`]; }); changed = true; }
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
  const _mentionIds = guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => r.id);
  await ch.send({ content: getMention(guild) || undefined, embeds: [embed], allowedMentions: { parse: [], roles: _mentionIds } });
}

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
  await envoyerDMRecap(guild, member.id, 'candidature', { message: '🐺 Bienvenue sur **Iron Wolf Company** !\n\nLis le **#règlement** et postule dans **#recrutement**.\n\n*La porte est ouverte une fois. Une seule.*\n— La Direction' }).catch(() => {});
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache.map(r => r.id).sort().join(',');
  const newRoles = newMember.roles.cache.map(r => r.id).sort().join(',');
  if (oldRoles === newRoles) return;
  const db = loadDB();
  const gradeRoleIds = Object.values(require('./notion-modules-v3').ROLES || {});
  const gradeChange = gradeRoleIds.some(id => oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id));

  // Détecter changement de pôle (légal ↔ illégal)
  const illegalRoleNames = ['Concepteur', 'Fléau', "L'Exécuteur", 'Le Condamné', 'Le Maudit', 'La Confrérie', 'Instructeur', 'Le Concepteur'];
  const legalRoleNames   = ['Le Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent Confirmé', 'Opérateur', 'Recrue', 'Probatoire', 'Le Penseur'];
  const wasIlleg = oldMember.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const isIlleg  = newMember.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const wasLegal = oldMember.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)));
  const isLegal  = newMember.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)));
  const poleChange = wasIlleg !== isIlleg || wasLegal !== isLegal;

  if (gradeChange || poleChange) {
    if (global._hierUpdating) return;
    global._hierUpdating = true;
    setTimeout(async () => {
      global._hierUpdating = false;
      if (gradeChange) {
        await require('./notion-modules-v3').updateHierarchieEmbed?.(newMember.guild).catch(() => {});
        console.log(`✅ Hiérarchie mise à jour suite au changement de rôle de ${newMember.displayName}`);
      }
      const nouveauGrade = newMember.roles.cache.filter(r => gradeRoleIds.includes(r.id)).map(r => r.name).join(', ') || 'Visiteur';
      // Calculer le nouveau pôle
      const nouveauPole = isIlleg ? 'illegal' : 'legal'; // illégal prioritaire
      const poleLabel   = nouveauPole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal';
      // Sync Registre des Membres
      _syncMembreNotion(newMember.id, { rang: nouveauGrade, pole: nouveauPole }).catch(() => {});
      // Sync Fiches_personnages si changement de pôle
      if (poleChange) {
        console.log(`🔄 Changement de pôle pour ${newMember.displayName} → ${poleLabel}`);
        _syncStatutFicheNotion(newMember.id, null, { pole: poleLabel }).catch(() => {});
      }
      // Mettre à jour la DB locale
      const dbFresh = loadDB();
      if (!dbFresh.members[newMember.id]) {
        // Nouveau membre qui vient de recevoir son premier rôle de pôle → l'enregistrer
        dbFresh.members[newMember.id] = {
          id: newMember.id,
          name: newMember.user.username,
          status: 'actif',
          rang: nouveauGrade,
          pole: nouveauPole,
          joinedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        };
      } else {
        dbFresh.members[newMember.id].pole = nouveauPole;
        dbFresh.members[newMember.id].rang = nouveauGrade;
        if (dbFresh.members[newMember.id].status === 'visiteur') {
          dbFresh.members[newMember.id].status = 'actif';
        }
      }
      saveDB(dbFresh);
      // Sync immédiate dans Notion Fiches_personnages
      const statutNotion = dbFresh.members[newMember.id].status === 'absent' ? 'Absent' : 'Actif';
      _syncStatutFicheNotion(newMember.id, statutNotion, { pole: poleLabel }).catch(() => {});
      // Sync Registre des Membres
      _syncMembreNotion(newMember.id, {
        rang: nouveauGrade,
        pole: nouveauPole,
        status: dbFresh.members[newMember.id].status,
        lastActivity: new Date().toISOString(),
      }).catch(() => {});
      console.log(`✅ Membre ${newMember.user.username} → pôle ${poleLabel} · grade ${nouveauGrade}`);
    }, 2000);
  }
});

client.on('guildMemberRemove', async member => {
  const db = loadDB(); const m = db.members[member.id];
  await sendLog(member.guild, 'DEPART', { username: member.user.username, rang: m?.rang, duree: m ? daysSince(m.joinedAt) + ' jours' : '—' });
  if (db.members[member.id]) { db.members[member.id].status = 'parti'; db.members[member.id].leftAt = new Date().toISOString(); saveDB(db); }
  _syncMembreNotion(member.id, { status: 'parti', leftAt: new Date().toISOString() }).catch(() => {});
  await ajouterJournalIC(member.guild, { type: 'autre', titre: `Départ — ${member.user.username}`, description: `${member.user.username} a quitté la Compagnie.`, auteur: 'Système' });
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); } catch { return; }
  const db = loadDB(); const guild = reaction.message.guild; if (!guild) return;
  if (reaction.message.id === db.reglementMsgId && reaction.emoji.name === '✅') {
    await sendLog(guild, 'REGLEMENT_VALIDE', { userId: user.id, username: user.username });
    const logsCh = await getLogsCh(guild);
      if (logsCh) {
        const _reglMentionIds = guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => r.id);
        await logsCh.send({ content: `${getMention(guild)} — **${user.username}** a validé le règlement.`, allowedMentions: { parse: [], roles: _reglMentionIds } });
      }
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
      await ajouterJournalIC(guild, { type: 'recrutement', titre: `Nouveau membre — ${cand.nomPerso}`, description: `${cand.nomPerso} rejoint la Compagnie · Pôle : ${isIllegal ? '🔪 Illégal' : '⚖️ Légal'} · Accepté par ${user.username}`, auteur: user.username });
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
      // [CORRECTION] Débloquer écriture si absent
      if (wasAbsent) {
        const membreRetourMsg = await guild.members.fetch(message.author.id).catch(() => null);
        if (membreRetourMsg) {
          const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
          if (roleAbsent) await membreRetourMsg.roles.remove(roleAbsent).catch(() => {});
          await _debloquerEcritureAbsent(guild, membreRetourMsg);
        }
      }
      const absCh2 = getAbsencesCh(guild, message.member);
      if (absCh2 && wasAbsent) {
        const mData = db.members[message.author.id];
        absCh2.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
          .setAuthor({ name: `${message.member?.displayName || message.author.username} — Retour`, iconURL: message.author.displayAvatarURL() })
          .setTitle('✅ Retour d\'absence')
          .addFields({ name: '👤 Membre', value: `<@${message.author.id}>`, inline: true }, { name: '🎖️ Grade', value: mData?.rang || '—', inline: true }, { name: '📅 Retour', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true })
          .setFooter({ text: 'IWC • Retour automatique détecté' }).setTimestamp()] }).catch(() => {});
      }
      await notionExtra.majStatutActiviteNotion?.(message.author.id, 'actif');
      if (wasInactif) { const logsCh = await getLogsCh(guild); if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Retour activité — ${message.author.username}`).setDescription(`**${message.author.username}** est de retour après une période d'inactivité.`).addFields({ name: '📅 Date retour', value: fmtShort(new Date()), inline: true }).setFooter({ text: 'IWC • Activité automatique' })] }).catch(() => {}); }
    }
    saveDB(db);
  }

  // Détecter si le message est dans l'un des deux salons absences
  const _absLegal = guild.channels.cache.get(SALON_HARDCODED.ABSENCES_LEGAL);
  const _absIlleg = guild.channels.cache.get(SALON_HARDCODED.ABSENCES_ILLEGAL);
  const _isInAbsSalon = (message.channel.id === _absLegal?.id || message.channel.id === _absIlleg?.id);
  if (_isInAbsSalon) {
    if (db.members[message.author.id]) { db.members[message.author.id].status = 'absent'; saveDB(db); await message.react('✅'); await notionExtra.majStatutActiviteNotion?.(message.author.id, 'absent'); }
    await notionV3.syncAbsenceNotion?.(message.author.id, 'absent').catch(() => {});
    await notionV4.posterAbsencePropre?.(guild, message.member, message.content, `#${message.channel.name}`).catch(() => {});
    await sendLog(guild, 'ABSENCE', { userId: message.author.id, username: message.author.username }); return;
  }

  // #informateurs avec ID hardcodé
  const infosCh = guild.channels.cache.get(SALON_HARDCODED.INFORMATEURS) || getChById(guild, 'INFORMATEURS', 'informateurs');
  if (infosCh && message.channel.id === infosCh.id) { await notionV3.handleInformateurMessage?.(message); return; }

  const ficheCh = getChById(guild, 'FICHES_PERSONNAGES', 'fiches-personnages', 'fiches-perso', 'fiches');
  if (ficheCh && message.channel.id === ficheCh.id) { await notionModules.handleFichePersonnage?.(message); return; }

  const suggCh = getChById(guild, 'SUGGESTION_IDEE', 'suggestion-idee', 'suggestions', 'suggestion');
  if (suggCh && message.channel.id === suggCh.id) { await message.react('✅').catch(() => {}); await message.react('❌').catch(() => {}); return; }

  const clipCh = getChById(guild, 'CLIPS_TEMPS_FORT', 'clips-temps-fort', 'clips-highlights', 'clips');
  if (clipCh && message.channel.id === clipCh.id && message.attachments.size > 0) { await message.react('🔥').catch(() => {}); await message.react('❤️').catch(() => {}); return; }

  const coffreIllegCh = guild.channels.cache.get(SALON_HARDCODED.COFFRE_ILLEGAL) || getChExact(guild, 'coffre-illegal');
  if (coffreIllegCh && message.channel.id === coffreIllegCh.id) {
    const up = message.content.toUpperCase();
    if (up.includes('TYPE') && up.includes('MONTANT')) {
      const lines = message.content.split('\n');
      const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() : ''; };
      const type = get('TYPE').toLowerCase().includes('sort') ? 'Sortie' : 'Entrée';
      const montant = (() => { const n = parseInt((get('MONTANT') || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; })();
      const objet = get('OBJET') || '—'; const responsable = get('RESPONSABLE') || message.author.username;
      const dbFresh = loadDB(); if (!dbFresh.coffres) dbFresh.coffres = { legal: 0, illegal: 0 };
      dbFresh.coffres.illegal += (type === 'Sortie' ? -montant : montant);
      const solde = dbFresh.coffres.illegal; saveDB(dbFresh);
      // Sync Notion DB transactions
      await notionExtra.enregistrerTransactionNotion?.({ type, coffre: '🔒 Illégal', montant, objet, responsable, solde });
      _syncTransactionNotion({ type, coffre: 'illegal', montant, objet, responsable, solde, date: new Date().toISOString(), discordId: message.author.id, userId: message.author.id }).catch(() => {});
      await ajouterJournalIC(guild, { type: 'tresorerie', emoji: type === 'Entrée' ? '💵' : '💸', titre: `${type} — Coffre Illégal`, description: `**${objet}** · $${montant.toLocaleString('fr-FR')} · par ${responsable}`, auteur: responsable });
      await message.react('✅').catch(() => {});
      const isEntree = type === 'Entrée';
      await message.channel.send({ embeds: [new EmbedBuilder().setColor(isEntree ? 0x57F287 : 0xED4245).setAuthor({ name: '🔒 La Confrérie • Trésorerie Illégale' }).setTitle(`${isEntree ? '📈 ENTRÉE' : '📉 SORTIE'} — $${montant.toLocaleString('fr-FR')}`).addFields({ name: '📋 Objet', value: objet, inline: true }, { name: '👤 Responsable', value: responsable, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: `${isEntree ? '📥' : '📤'} Mouvement`, value: `**${isEntree ? '+' : '-'}$${montant.toLocaleString('fr-FR')}**`, inline: true }, { name: '💰 Solde illégal', value: `**$${solde.toLocaleString('fr-FR')}**`, inline: true }, { name: '\u200b', value: '\u200b', inline: true }).setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` }).setTimestamp()] });
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
      await ajouterJournalIC(guild, { type: 'operation', titre: `Nouvelle opération — ${op.name}`, description: `📍 ${op.lieu} · Objectif : ${op.objectif} · Pôle : ${pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`, auteur: message.author.username });
      const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(`🎯 OPÉRATION — ${op.name}`).addFields({ name: 'Statut', value: '🟡 En préparation', inline: true }, { name: 'Pôle', value: pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal', inline: true }, { name: 'Lieu', value: op.lieu, inline: true }, { name: 'Objectif', value: op.objectif }, { name: 'Équipe', value: op.equipe }, { name: '👥 Participants (0)', value: '*Personne pour l\'instant. Clique « ✋ Je participe » ci-dessous.*' }).setFooter({ text: `ID: ${op.id} • ${fmtShort(new Date())}` });
      const rowP = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary));
      const rowG = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger));
      const rowModif2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_modifier_${op.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary));
      await opsCh.send({ content: `<@&${pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}> — 🎯 Nouvelle opération **${op.name}**. Inscrivez-vous via « ✋ Je participe ».`, embeds: [embed], components: [rowP, rowG, rowModif2], allowedMentions: { parse: [], roles: [pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL] } });
      await message.react('✅');
    }
    return;
  }

  const planCh = getChById(guild, 'PLANNING', 'planning');
  if (planCh && message.channel.id === planCh.id) { if (message.attachments.size > 0) await notionV3.handlePlanningScreenshot?.(message); return; }

  // #plans avec ID hardcodé
  const plansTactCh = guild.channels.cache.get(SALON_HARDCODED.PLANS);
  if (plansTactCh && message.channel.id === plansTactCh.id) { await notionV3.handlePlansMessage?.(message); return; }
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

  if (interaction.isModalSubmit() && interaction.customId === 'modal_affaire')          return notionV3.handleAffaireModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_absent')           return _validerModalAbsent(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_absent_programmer') return _validerModalAbsentProgramme(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_agenda_rdv')        return notionV3.handleAgendaModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_op_programmee')     return notionV5.handleOpProgrammeeModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_op_creer'))   return _validerModalOpCreer(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_op_modifier_')) {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const parts2 = interaction.customId.replace('modal_op_modifier_', '').split('_');
    const lieuVal2 = parts2.pop();
    const opIdMod = parts2.join('_');
    const opMod = db.operations.find(o => o.id === opIdMod);
    if (!opMod) return interaction.editReply({ content: '❌ Opération introuvable.' });
    const lieuVille2 = VILLES_RDR2.find(v => v.value === lieuVal2);
    opMod.lieu      = lieuVille2 ? `${lieuVille2.emoji || ''} ${lieuVille2.label}`.trim() : lieuVal2;
    opMod.lieuId    = lieuVal2;
    opMod.objectif  = interaction.fields.getTextInputValue('objectif').trim();
    const newDetails = interaction.fields.getTextInputValue('details')?.trim();
    if (newDetails) opMod.equipe = newDetails;
    opMod.updatedAt = new Date().toISOString();
    saveDB(db);
    // Sync Notion
    if (opMod.notionPageId && process.env.NOTION_TOKEN) {
      _notionPatch(opMod.notionPageId, {
        'Lieu IC':   { rich_text: [{ text: { content: opMod.lieu } }] },
        'Objectif':  { rich_text: [{ text: { content: opMod.objectif } }] },
        'Notes':     { rich_text: [{ text: { content: opMod.equipe || '—' } }] },
      }).catch(() => {});
    }
    // Mettre à jour l'embed dans #operations
    const opsCh3 = getChById(interaction.guild, 'OPERATIONS', 'operations');
    if (opsCh3) {
      const msgs3 = await opsCh3.messages.fetch({ limit: 50 }).catch(() => null);
      const msgOp = msgs3?.find(m => m.embeds[0]?.footer?.text?.includes(opIdMod));
      if (msgOp) {
        const newEmbed = EmbedBuilder.from(msgOp.embeds[0])
          .spliceFields(2, 1, { name: 'Lieu', value: opMod.lieu, inline: true })
          .spliceFields(3, 1, { name: 'Objectif', value: opMod.objectif, inline: false });
        await msgOp.edit({ embeds: [newEmbed] }).catch(() => {});
      }
    }
    await interaction.editReply({ content: `✅ Opération **${opMod.name}** modifiée — Lieu: ${opMod.lieu} · Objectif: ${opMod.objectif}` });
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'modal_surnom_identite')   return _validerModalSurnom(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_agenda_simple')) return _validerModalAgendaSimple(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rdv_individuel_')) return _validerModalRdvIndividuel(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rdv_'))      return _validerModalRdv(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_informateur')       return notionV3.handleInformateurModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_tresor_'))   return notionModules.handleTresorModal?.(interaction);

  if (interaction.isButton()) {
    if (interaction.customId === 'btn_grade_panel')            return notionV3.handleGradePanelButton?.(interaction);
    if (interaction.customId === 'btn_agenda_nouveau')         return notionV3.handleAgendaNouveauButton?.(interaction);
    if (interaction.customId === 'btn_hierarchie_refresh')     { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); await notionV3.updateHierarchieEmbed?.(interaction.guild); return interaction.editReply({ content: '✅ Hiérarchie mise à jour.' }); }
    if (interaction.customId === 'btn_affaire_nouvelle') {
      const modal = new ModalBuilder().setCustomId('modal_affaire').setTitle('📋 Soumettre une affaire');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel("Titre de l'affaire").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Proposition alliance, Demande de contrat...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description détaillée').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Détails, contexte, personnes impliquées...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('urgence').setLabel('Urgence (faible / normale / haute)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('normale')),
      );
      return interaction.showModal(modal);
    }
    if (interaction.customId === 'btn_affaires_resume')        return notionV3.handleAffairesResumeButton?.(interaction);
    if (interaction.customId === 'btn_informateur_rapport')    return notionV3.handleInformateurRapportButton?.(interaction);
    if (interaction.customId === 'setup_appliquer')             return _handleSetupServeur({ ...interaction, options: { getString: () => 'appliquer' } });
    if (interaction.customId === 'setup_annuler')               return interaction.update({ content: '❌ Annulé — aucune modification effectuée.', components: [] });
    if (interaction.customId === 'btn_informateur_historique') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV3.handleInformateurHistorique?.(interaction); }
    if (interaction.customId.startsWith('info_confirmer_'))    return notionV3.handleInformateurConfirmer?.(interaction);
    if (interaction.customId === 'btn_absent_programmer')         return _ouvrirModalAbsentProgrammer(interaction);
    if (interaction.customId.startsWith('btn_absent_confirmer_')) return _confirmerAbsence(interaction);
    if (interaction.customId === 'btn_absent_annuler')             return interaction.update({ content: '↩️ Absence annulée.', embeds: [], components: [] });
    if (interaction.customId === 'btn_surnom_ouvrir')              return _ouvrirModalSurnom(interaction);
    if (interaction.customId === 'dir_btn_candidatures')       return interaction.reply({ flags: MessageFlags.Ephemeral, content: _buildCandidaturesResume(db) });
    if (interaction.customId === 'dir_btn_ops')                return notionV5.handleStatsAvancees?.(interaction) || interaction.reply({ flags: MessageFlags.Ephemeral, content: '`/stats` pour plus de détails.' });
    if (interaction.customId === 'dir_btn_bilan')              { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleBilanCommand?.(interaction); }
    if (interaction.customId === 'dir_btn_registre')           return _handleRegistre(interaction);
    if (interaction.customId === 'dir_btn_refresh')            { await updateDirectionPanel(interaction.guild).catch(() => {}); return interaction.reply({ flags: MessageFlags.Ephemeral, content: '✅ Panel mis à jour.' }); }
    if (interaction.customId.startsWith('purge_confirm_'))     return _executerPurge(interaction);
    if (interaction.customId === 'purge_annuler')              return interaction.update({ content: '↩️ Suppression annulée.', embeds: [], components: [] });
    if (interaction.customId === 'btn_rdv_creer_contrat_panel') return _ouvrirMenuRdv(interaction);
    if (interaction.customId.startsWith('btn_rdv_creer_'))     return _ouvrirMenuRdv(interaction);
    // [CORRECTION] btn_rdv_modal_ est un bouton, pas un select menu
    if (interaction.customId.startsWith('btn_rdv_modal_'))     return _handleRdvModalBtn(interaction);
    if (interaction.customId.startsWith('btn_grade_maj_'))     return notionV3.handleGradeMajButton?.(interaction);
    if (interaction.customId.startsWith('info_infirmer_'))     return notionV3.handleInformateurInfirmer?.(interaction);
    if (interaction.customId.startsWith('affaire_oui_'))       return notionV3.handleAffaireVote?.(interaction, 'oui');
    if (interaction.customId.startsWith('affaire_non_'))       return notionV3.handleAffaireVote?.(interaction, 'non');
    if (interaction.customId.startsWith('affaire_detail_'))    { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV3.handleAffaireDetail?.(interaction); }
    if (interaction.customId === 'btn_nouvelle_transaction')   return notionModules.handleTresorCommand?.(interaction);
    if (interaction.customId === 'btn_tresor_config') {
      if (!isFondateurOuFleau(interaction.member) && !isOfficierOuDirection(interaction.member)) {
        return interaction.reply({ content: '❌ Accès réservé à la Direction.', flags: MessageFlags.Ephemeral });
      }
      return notionModules.handleTresorConfigButton?.(interaction);
    }
    if (interaction.customId.startsWith('tresor_valider_'))    return notionModules.handleTresorValidation?.(interaction, 'valider');
    if (interaction.customId.startsWith('op_stop_'))           return notionV5.handleOpStop?.(interaction);
    if (interaction.customId.startsWith('op_lancer_force_')) {
      const opId4 = interaction.customId.replace('op_lancer_force_', '');
      const op4   = db.operations.find(o => o.id === opId4);
      if (!op4) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
      const presentsText = (op4.presents || []).length > 0 ? (op4.presents || []).join(', ') : '*Aucune présence enregistrée*';
      // Afficher confirmation finale avec mode ping
      const roleLabel4 = op4.pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal';
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [new EmbedBuilder()
          .setColor(0x00AA00)
          .setTitle(`🚀 Lancer — ${op4.name}`)
          .setDescription('Tout le monde est là. Choisis le mode de notification pour le lancement.')
          .addFields(
            { name: '✋ Présents', value: presentsText, inline: true },
            { name: '❌ Absents', value: (op4.absents || []).length > 0 ? (op4.absents || []).join(', ') : '*—*', inline: true },
          )
          .setFooter({ text: 'IWC • Lancement imminent' })
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`op_lancer_ping_pole_${opId4}`).setLabel(`📢 Ping ${roleLabel4}`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`op_lancer_ping_participants_${opId4}`).setLabel('📢 Ping Participants').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`op_lancer_silencieux_${opId4}`).setLabel('🔇 Sans ping').setStyle(ButtonStyle.Secondary),
        )],
      });
      return;
    }
    if (interaction.customId === 'btn_stats_refresh')          { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV5.handleStatsAvancees?.(interaction); }
    if (interaction.customId.startsWith('op_annulee_confirm_')) {
      const opId = interaction.customId.replace('op_annulee_confirm_', '');
      const op = db.operations.find(o => o.id === opId); if (!op) return;
      op.status = 'annulee'; op.updatedAt = new Date().toISOString(); saveDB(db);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Opération annulée — ${op.name}`).setDescription(`Annulée par **${interaction.user.username}**.`).setTimestamp()], components: [] });
      const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
      if (opsCh) await opsCh.send({ content: `❌ L'opération **${op.name}** a été annulée par ${interaction.user.username}.` }).catch(() => {});
      return;
    }
    if (interaction.customId === 'op_annulee_cancel')         return interaction.update({ content: '↩️ Annulation annulée.', embeds: [], components: [] });

    // ── Handler ✏️ Modifier opération ──
    if (interaction.customId.startsWith('op_modifier_')) {
      if (!isDirection(interaction.member)) {
        return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
      }
      const opIdM = interaction.customId.replace('op_modifier_', '');
      const opM   = db.operations.find(o => o.id === opIdM);
      if (!opM) return interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral });
      if (opM.status === 'en_cours') {
        return interaction.reply({ content: '❌ Impossible de modifier une opération en cours.', flags: MessageFlags.Ephemeral });
      }
      if (opM.status === 'terminee' || opM.status === 'annulee') {
        return interaction.reply({ content: '❌ Impossible de modifier une opération terminée ou annulée.', flags: MessageFlags.Ephemeral });
      }
      // Ouvrir le menu de sélection de lieu
      const { StringSelectMenuBuilder } = require('discord.js');
      const villesOptions = VILLES_RDR2.map(v => ({ label: v.label, value: v.value, emoji: v.emoji || undefined, default: v.value === opM.lieuId }));
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`✏️ Modifier — ${opM.name}`)
          .setDescription('Choisis le nouveau lieu. Le formulaire de détails s\'ouvrira ensuite.')
          .addFields(
            { name: '📍 Lieu actuel',     value: opM.lieu    || '—', inline: true },
            { name: '🎯 Objectif actuel', value: opM.objectif || '—', inline: true },
          )
        ],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`op_modifier_lieu_${opIdM}`)
            .setPlaceholder('Choisir un nouveau lieu...')
            .addOptions(villesOptions.slice(0, 25))
        )],
      });
      return;
    }

    // ── Handler sélection lieu modification ──
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('op_modifier_lieu_')) {
      const opIdML = interaction.customId.replace('op_modifier_lieu_', '');
      const lieuVal = interaction.values[0];
      const lieuVille = VILLES_RDR2.find(v => v.value === lieuVal);
      const modal = new ModalBuilder()
        .setCustomId(`modal_op_modifier_${opIdML}_${lieuVal}`)
        .setTitle(`✏️ Modifier opération`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objectif').setLabel('Objectif').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Neutraliser les gardes...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Équipe / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Membres impliqués, matériel, heure...')),
      );
      return interaction.showModal(modal);
    }

    // ── Handler présence ✋ ──
    if (interaction.customId.startsWith('op_present_')) {
      const opId3 = interaction.customId.replace('op_present_', '');
      const op3   = db.operations.find(o => o.id === opId3);
      if (!op3) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
      if (!op3.presents) op3.presents = [];
      const username = interaction.member?.displayName || interaction.user.username;
      if (!op3.presents.includes(username)) {
        op3.presents.push(username);
        saveDB(db);
      }
      // Retirer de la liste absents si présent
      if (!op3.absents) op3.absents = [];
      op3.absents = op3.absents.filter(p => p !== username);
      saveDB(db);
      // Mettre à jour l'embed
      const presentsText = op3.presents.map(p => `✅ ${p}`).join('\n') || '*En attente...*';
      const absentsText  = op3.absents.map(p => `❌ ${p}`).join('\n') || '*—*';
      const nbPresents = op3.presents.length;
      const nbAbsents  = op3.absents.length;
      const nbInscrits = (op3.participants || []).length;
      const allPresent = nbInscrits > 0 && nbPresents >= nbInscrits;
      try {
        const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .spliceFields(4, 2,
            { name: `✋ Présents (${nbPresents}${nbInscrits > 0 ? `/${nbInscrits}` : ''})${allPresent ? ' ✅' : ''}`, value: presentsText, inline: true },
            { name: `❌ Absents (${nbAbsents})`, value: absentsText, inline: true },
          );
        await interaction.update({ embeds: [newEmbed] });
      } catch { await interaction.reply({ content: `✅ **${username}** est enregistré présent !`, flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ── Handler absent ❌ ──
    if (interaction.customId.startsWith('op_absent_op_')) {
      const opId5  = interaction.customId.replace('op_absent_op_', '');
      const op5    = db.operations.find(o => o.id === opId5);
      if (!op5) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
      if (!op5.absents)  op5.absents  = [];
      if (!op5.presents) op5.presents = [];
      const username5 = interaction.member?.displayName || interaction.user.username;
      if (!op5.absents.includes(username5)) {
        op5.absents.push(username5);
        op5.presents = op5.presents.filter(p => p !== username5);
        saveDB(db);
      }
      const presentsText5 = op5.presents.map(p => `✅ ${p}`).join('\n') || '*En attente...*';
      const absentsText5  = op5.absents.map(p => `❌ ${p}`).join('\n') || '*—*';
      const nbPresents5 = op5.presents.length;
      const nbAbsents5  = op5.absents.length;
      const nbInscrits5 = (op5.participants || []).length;
      try {
        const newEmbed5 = EmbedBuilder.from(interaction.message.embeds[0])
          .spliceFields(4, 2,
            { name: `✋ Présents (${nbPresents5}${nbInscrits5 > 0 ? `/${nbInscrits5}` : ''})`, value: presentsText5, inline: true },
            { name: `❌ Absents (${nbAbsents5})`, value: absentsText5, inline: true },
          );
        await interaction.update({ embeds: [newEmbed5] });
      } catch { await interaction.reply({ content: `❌ **${username5}** enregistré absent.`, flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ── Handlers lancement avec/sans ping ──
    if (interaction.customId.startsWith('op_lancer_ping_pole_') ||
        interaction.customId.startsWith('op_lancer_ping_participants_') ||
        interaction.customId.startsWith('op_lancer_silencieux_')) {
      const parts   = interaction.customId.split('_');
      const opId2   = parts[parts.length - 1];
      const pingMode = interaction.customId.includes('ping_pole') ? 'pole'
                     : interaction.customId.includes('ping_participants') ? 'participants'
                     : 'silencieux';
      const op2 = db.operations.find(o => o.id === opId2);
      if (!op2) { await interaction.update({ content: '❌ Opération introuvable.', embeds: [], components: [] }); return; }

      op2.status = 'en_cours'; saveDB(db);
      await notionExtra.majOperationNotion?.(op2);
      if (op2.notionPageId && process.env.NOTION_TOKEN) {
        _notionPatch(op2.notionPageId, {
          'Statut': { select: { name: '🟢 En cours' } },
          'Participants': { multi_select: (op2.participants || []).map(n => ({ name: n })) },
        }).catch(() => {});
      }
      await sendLog(guild, 'OPERATION', { nom: op2.name, lieu: op2.lieu, equipe: op2.equipe, statut: '🟢 En cours' });

      // Mettre à jour l'embed de confirmation
      await interaction.update({ content: `✅ Opération **${op2.name}** lancée.`, embeds: [], components: [] });

      // Poster dans le salon opérations
      const opsCh = getChById(guild, 'OPERATIONS', 'operations');
      if (opsCh) {
        let pingContent = '';
        if (pingMode === 'pole') {
          const roleId = op2.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL;
          pingContent = `<@&${roleId}> — 🟢 L'opération **${op2.name}** est **LANCÉE**. À vos postes.`;
          await opsCh.send({ content: pingContent, allowedMentions: { parse: [], roles: [roleId] } });
        } else if (pingMode === 'participants' && (op2.participants || []).length > 0) {
          const mentions = op2.participants.map(n => { const id = MEMBRES_DISCORD_MAP?.[n]; return id ? `<@${id}>` : `**${n}**`; }).join(' ');
          pingContent = `${mentions} — 🟢 L'opération **${op2.name}** est **LANCÉE**. À vos postes.`;
          await opsCh.send({ content: pingContent, allowedMentions: { parse: ['users'] } });
        } else if (pingMode === 'silencieux') {
          await opsCh.send({ content: `🟢 L'opération **${op2.name}** est **LANCÉE**.` });
        }
      }
      notionV4.envoyerBriefingOp?.(guild, op2).catch(() => {});
      return;
    }
    if (interaction.customId.startsWith('tresor_refuser_'))   return notionModules.handleTresorValidation?.(interaction, 'refuser');
    if (interaction.customId.startsWith('tresor_'))           return notionModules.handleTresorFlow?.(interaction);
    if (interaction.customId === 'btn_solde')                 return notionModules.handleSoldeButton?.(interaction);
    if (interaction.customId === 'btn_dashboard_refresh')     { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleDashboard?.(interaction); }
    if (interaction.customId.startsWith('journal_'))          return notionModules.handleJournalPagination?.(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'op_lieu_select')               return _handleOpLieuSelect(interaction);
    if (interaction.customId === 'agenda_lieu_select')           return _handleAgendaLieuSelect(interaction);
    // [CORRECTION] btn_rdv_modal_ retiré d'ici — c'est un bouton pas un select
    if (interaction.customId === 'tresor_config_limite_legal') {
      if (!isFondateurOuFleau(interaction.member) && !isOfficierOuDirection(interaction.member)) return;
      return notionModules.handleTresorConfigSelect?.(interaction);
    }
    if (interaction.customId.startsWith('rdv_type_select_'))     return _handleRdvTypeSelect(interaction);
    if (interaction.customId.startsWith('rdv_mode_select_'))     return _handleRdvModeSelect(interaction);
    if (interaction.customId.startsWith('rdv_individuel_select_')) return _handleRdvIndividuelSelect(interaction);
    if (interaction.customId.startsWith('rdv_pole_select_'))     return _handleRdvPoleSelect(interaction);
    if (interaction.customId.startsWith('rdv_lieu_select_'))     return _handleRdvLieuSelect(interaction);
    if (interaction.customId === 'tresor_config_limite_illegal') {
      if (!isFondateurOuFleau(interaction.member) && !isOfficierOuDirection(interaction.member)) return;
      return notionModules.handleTresorConfigSelect?.(interaction);
    }
    if (interaction.customId === 'absent_duree_select')           return _handleAbsentDureeSelect(interaction);
    if (interaction.customId === 'grade_select_membre')          return notionV3.handleGradeMembreSelect?.(interaction);
    if (interaction.customId === 'grade_select_grade')           return notionV3.handleGradeGradeSelect?.(interaction);
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
    const nomAgeL = interaction.fields.getTextInputValue('nom_perso').split(',');
    const nomPersoL = nomAgeL[0]?.trim() || '—'; const agePersoL = nomAgeL[1]?.trim() || '—';
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
    const nomAgeI = interaction.fields.getTextInputValue('nom_perso').split(',');
    const nomPersoI = nomAgeI[0]?.trim() || '—'; const agePersoI = nomAgeI[1]?.trim() || '—';
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
    // Sync participants Notion
    if (op.notionPageId && process.env.NOTION_TOKEN) {
      _notionPatch(op.notionPageId, { 'Participants': { multi_select: (op.participants || []).map(n => ({ name: n })) } }).catch(() => {});
    }
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
    // Sync directe Notion si notionPageId existe
    if (op.notionPageId && process.env.NOTION_TOKEN) {
      _notionPatch(op.notionPageId, {
        'Statut': { select: { name: '✅ Terminée' } },
        'Résultat': { rich_text: [{ text: { content: op.resultat || '—' } }] },
        'Butin': { rich_text: [{ text: { content: op.butin || '—' } }] },
        'Débrief': { rich_text: [{ text: { content: (op.debrief || '—').slice(0, 2000) } }] },
        'Date fin': { date: { start: new Date().toISOString().split('T')[0] } },
      }).catch(() => {});
    }
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '✅ Terminée — ' + op.resultat });
    await ajouterJournalIC(guild, { type: 'operation', titre: `Opération terminée — ${op.name}`, description: `Résultat : **${op.resultat}** · Butin : ${op.butin}`, auteur: interaction.user.username });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(0, 1, { name: 'Statut', value: '✅ Terminée', inline: true }).addFields({ name: '🏁 Résultat', value: op.resultat, inline: true }, { name: '💰 Butin', value: op.butin, inline: true }, { name: '⚠️ Pertes', value: op.pertes, inline: true }, { name: '📝 Débrief', value: op.debrief });
    await interaction.editReply({ embeds: [updated], components: [] }); return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith('op_encours_') || interaction.customId.startsWith('op_annulee_'))) {
    const isLancer = interaction.customId.startsWith('op_encours_'); const opId = interaction.customId.replace(isLancer ? 'op_encours_' : 'op_annulee_', '');
    if (!isLancer) {
      const op = db.operations.find(o => o.id === opId); if (!op) return;
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Confirmer l\'annulation').setDescription(`Vous allez annuler l'opération **${op.name}**.\n\nCette action est **irréversible**.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_annulee_confirm_${opId}`).setLabel('✅ Confirmer l\'annulation').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('op_annulee_cancel').setLabel('↩️ Retour').setStyle(ButtonStyle.Secondary))] });
    }
    const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }

    // ── Étape 1 : Rassemblement — avertir les membres avant de lancer ──
    const roleId  = op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL;
    const roleLabel = op.pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal';
    const participantsText = (op.participants || []).length > 0
      ? op.participants.join(', ')
      : '*Aucun inscrit*';

    // Poster le message de rassemblement dans le salon opérations
    const opsCh2 = getChById(guild, 'OPERATIONS', 'operations');
    if (!opsCh2) { await interaction.reply({ content: '❌ Salon #operations introuvable.', flags: MessageFlags.Ephemeral }); return; }

    const embedRassemblement = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(`⚠️ RASSEMBLEMENT — ${op.name}`)
      .setDescription(`L'opération **${op.name}** est sur le point de commencer.

**Cliquez sur ✋ Je suis là** pour signaler votre présence.

La Direction lancera l'opération quand tout le monde sera prêt.`)
      .addFields(
        { name: '📍 Lieu',         value: op.lieu || '—',    inline: true },
        { name: '🎯 Objectif',     value: op.objectif || '—', inline: true },
        { name: '📂 Pôle',         value: roleLabel,           inline: true },
        { name: '👥 Participants inscrits', value: participantsText, inline: false },
        { name: '✋ Présents (0)', value: '*En attente...*', inline: true },
        { name: '❌ Absents (0)', value: '*—*', inline: true },
      )
      .setFooter({ text: `IWC • Opérations • Rassemblement en cours` })
      .setTimestamp();

    const rowRassemblement = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`op_present_${opId}`).setLabel('✋ Je suis là').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`op_absent_op_${opId}`).setLabel('❌ Pas disponible').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`op_lancer_force_${opId}`).setLabel('🚀 Lancer').setStyle(ButtonStyle.Primary),
    );

    // Pinger le pôle pour le rassemblement
    await opsCh2.send({
      content: `<@&${roleId}> ⚠️ Rassemblement pour **${op.name}** — Cliquez ✋ pour confirmer votre présence !`,
      allowedMentions: { parse: [], roles: [roleId] },
    });
    await opsCh2.send({ embeds: [embedRassemblement], components: [rowRassemblement] });

    await interaction.reply({ content: `✅ Message de rassemblement posté dans #operations.`, flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_offre') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    const modal = new ModalBuilder().setCustomId('contrat_offre_modal').setTitle('📤 Nos conditions — Contrat client');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('client_nom').setLabel("Nom / Entreprise du client").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Famille Moreau...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection rapprochée...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Notre rémunération souhaitée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1500$ + 500$/jour')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord du client').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Clic droit → Copier l\'identifiant')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_echeance').setLabel('Date d\'échéance (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 2026-08-30')));
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'contrat_offre_modal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-OF-' + Date.now().toString().slice(-5);
    const emetteurICOffre = db.members[interaction.user.id]?.name || interaction.user.username;
    const contrat = { id: contratId, type: 'offre', clientNom: interaction.fields.getTextInputValue('client_nom'), emetteurIC: emetteurICOffre, objet: interaction.fields.getTextInputValue('objet'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), dateEcheance: interaction.fields.getTextInputValue('date_echeance') || null, emetteurId: interaction.user.id, emetteurNom: interaction.user.username, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    _syncContratNotion(contrat, 'en_attente').catch(() => {});
    await interaction.editReply({ content: `✅ Contrat **${contratId}** envoyé au client.` });
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📤 CONTRAT DE PRESTATION — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — OFFRE DE PRESTATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '✍️ Émis par', value: emetteurICOffre, inline: true }, { name: '📋 Objet', value: contrat.objet }, { name: '📅 Échéance', value: contrat.dateEcheance ? fmtShort(contrat.dateEcheance) : 'Aucune', inline: true }, { name: '💰 Rémunération souhaitée', value: contrat.remuneration }, { name: '📌 Statut', value: '🟡 En attente de signature', inline: true }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`signer_offre_${contratId}`).setLabel("✍️ J'accepte les termes").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`refuser_offre_${contratId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger));
    const ch = guild.channels.cache.get(SALON_HARDCODED.CONTRATS) || guild.channels.cache.get(CH.CONTRATS); if (ch) await ch.send({ content: `<@${contrat.userId}> — Iron Wolf Company vous soumet un contrat.`, embeds: [embed], components: [row] });
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
    await ajouterJournalIC(guild, { type: 'contrat', titre: `Contrat signé — ${contratId}`, description: `Client : **${contrat.clientNom}** · Mission : ${contrat.objet}`, auteur: interaction.user.username });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    const _embedContratSigne = new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT ACCEPTÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé le', value: fmtShort(new Date()), inline: true }, { name: '✍️ Client', value: contrat.clientNom || interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'signe', _embedContratSigne);
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
    const _embedContratRefuse = new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT REFUSÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Refusé par', value: interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'refuse', _embedContratRefuse);
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
    const signataireICEmploi = db.members[interaction.user.id]?.name || interaction.user.username;
    const contrat = { id: contratId, type: 'emploi', employeurNom: interaction.fields.getTextInputValue('employeur_nom'), emetteurIC: signataireICEmploi, objet: interaction.fields.getTextInputValue('objet'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), dateEcheance: interaction.fields.getTextInputValue('date_echeance') || null, signataire: interaction.user.username, signataireId: interaction.user.id, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    _syncContratNotion(contrat, 'en_attente').catch(() => {});
    await interaction.editReply({ content: `📋 Contrat **${contratId}** créé.` });
    const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📥 CONTRAT EMPLOYEUR — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  CONTRAT PROPOSÉ À IRON WOLF COMPANY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '✍️ Soumis par', value: signataireICEmploi, inline: true }, { name: `🏭 Employeur — ${contrat.employeurNom}`, value: contrat.dateEcheance ? `📅 Échéance : ${fmtShort(contrat.dateEcheance)}` : '—' }, { name: '💰 Rémunération', value: contrat.remuneration }, { name: '📋 Objet', value: contrat.objet }, { name: '📌 Statut', value: '🟡 En attente de notre signature', inline: true }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`signer_emploi_${contratId}`).setLabel('✍️ Signer & Accepter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`refuser_emploi_${contratId}`).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`btn_rdv_creer_contrat_${contratId}`).setLabel('📅 Planifier un RDV').setStyle(ButtonStyle.Secondary));
    const ch = guild.channels.cache.get(SALON_HARDCODED.CONTRATS) || guild.channels.cache.get(CH.CONTRATS); if (ch) await ch.send({ content: `${getContratMention(guild)} — 📥 Nouveau contrat employeur à examiner.`, embeds: [embed], components: [row] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('signer_emploi_')) {
    const contratId = interaction.customId.replace('signer_emploi_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut signer.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); contrat.signedBy = interaction.user.username; saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    const signataireDirIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'signe', signataireDirIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${signataireDirIC} — IWC` });
    await ajouterJournalIC(guild, { type: 'contrat', titre: `Contrat employeur signé — ${contratId}`, description: `Employeur : **${contrat.employeurNom}** · Mission : ${contrat.objet}`, auteur: interaction.user.username });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    const _embedEmploiSigne = new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT EMPLOYEUR SIGNÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé le', value: fmtShort(new Date()), inline: true }, { name: '✍️ Signé par', value: signataireDirIC, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'signe', _embedEmploiSigne);
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
    const _embedEmploiRefuse = new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT EMPLOYEUR DÉCLINÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Décliné par', value: interaction.user.username, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'refuse', _embedEmploiRefuse);
    return;
  }
}); // fin interactionCreate

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
  }

  cron.schedule('* * * * *', async () => {
    for (const g of client.guilds.cache.values()) await notionV5.checkOpsProgrammees?.(g).catch(() => {});
  });
  cron.schedule('*/5 * * * *', async () => {
    for (const g of client.guilds.cache.values()) await checkAgenda(g).catch(() => {});
  });
  cron.schedule('*/15 * * * *', async () => {
    for (const g of client.guilds.cache.values()) await syncRegistreNotion(g).catch(() => {});
  });
  cron.schedule('*/30 * * * *', async () => {
    for (const g of client.guilds.cache.values()) {
      await notionExtra.envoyerRappelsFiches?.(g).catch(() => {});
      await notionModules.checkAlerteCoffre?.(g).catch(() => {});
    }
  });
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
      try {
        const db = loadDB(); const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const before = (db.transactions || []).length;
        db.transactions = (db.transactions || []).filter(t => new Date(t.date || t.createdAt || 0).getTime() > cutoff);
        if (db.transactions.length < before) { saveDB(db); console.log(`🧹 Purge: ${before - db.transactions.length} transactions > 90j supprimées`); }
      } catch {}
      await notionV4.checkRecrutementSuivi?.(g).catch(() => {});
      await notionV4.checkEcheancesContrats?.(g).catch(() => {});
      try {
        const db = loadDB(); const demain = new Date(); demain.setDate(demain.getDate() + 1); const ds = demain.toISOString().split('T')[0];
        for (const ct of (db.contrats || [])) {
          if (ct.status !== 'signe' || !ct.dateEcheance || ct.notifExpirDemain) continue;
          if (ct.dateEcheance.startsWith(ds)) { ct.notifExpirDemain = true; if (ct.userId) await envoyerDMRecap(g, ct.userId, 'contrat', { id: ct.id, objet: 'Expire demain: ' + (ct.objet||'') }).catch(() => {}); }
        }
        saveDB(db);
      } catch(e) { console.log('notifExpirDemain error:', e.message); }
      await notionV4.checkOperationsTimeout?.(g).catch(() => {});
    }
    await sauvegarderSurGitHub().catch(() => {});
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 */2 * * *', async () => {
    for (const g of client.guilds.cache.values()) await notionV4.checkDashboardAlertes?.(g).catch(() => {});
  });
  cron.schedule('0 9 * * *',  async () => { for (const g of client.guilds.cache.values()) await postDailyAgenda(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 12 * * *', async () => { for (const g of client.guilds.cache.values()) await autoKickVisiteurs(g).catch(() => {}); }, { timezone: 'Europe/Paris' });

  // [CORRECTION] Résumés hebdo → #journal-de-bord via ajouterJournalIC
  cron.schedule('0 8 * * 1', async () => {
    for (const g of client.guilds.cache.values()) {
      // Résumé affaires → uniquement dans #journal-de-bord
      const affairesJournalCh = g.channels.cache.get('1508756535407542372');
      if (affairesJournalCh) await notionV3.postResumeAffaires?.(g, affairesJournalCh).catch(() => {});
    }
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 9 * * 1', async () => {
    for (const g of client.guilds.cache.values()) {
      // Résumé journal IC → #journal-de-bord (ID hardcodé forcé)
      const journalCh = g.channels.cache.get('1508756535407542372');
      if (journalCh) await notionV5.posterResumeJournalIC?.(g, journalCh).catch(() => {});
    }
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 20 * * 0', async () => { for (const g of client.guilds.cache.values()) await notionExtra.postStatsHebdo?.(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 20 * * 5', async () => { for (const g of client.guilds.cache.values()) await envoyerRapportDirection(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
});

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'text/plain' }); res.end('IWC Bot OK'); }).listen(PORT, () => console.log(`🌐 Serveur keepalive en écoute sur le port ${PORT}`));

async function handleProfilEnhanced(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const cible = interaction.options?.getUser('membre') || interaction.user;
  const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
  const db = loadDB(); const data = db.members[cible.id];
  let ficheNotion = null;
  if (process.env.NOTION_TOKEN && process.env.NOTION_FICHES_DB) {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_FICHES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: cible.id } }, page_size: 1 }) });
      const d = await res.json(); ficheNotion = d.results?.[0];
    } catch {}
  }
  const nomPerso = ficheNotion?.properties?.['Nom du personnage']?.title?.[0]?.plain_text || data?.name || cible.username;
  const profession = ficheNotion?.properties?.['Profession']?.rich_text?.[0]?.plain_text || '—';
  const reputation = ficheNotion?.properties?.['Réputation']?.rich_text?.[0]?.plain_text || '—';
  const pole = ficheNotion?.properties?.['Pôle']?.select?.name || (data?.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal');
  const rang = data?.rang || membre?.roles.cache.filter(r => !r.managed && r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name || '—';
  const statut = data?.status || 'actif';
  const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', parti: '🚪', visiteur: '👁️' }[statut] || '❓';
  const color = pole.includes('Illégal') ? 0x8B1A1A : 0x3B82F6;
  const contratsSigned = (db.contrats || []).filter(c => c.status === 'signe' && (c.emetteurId === cible.id || c.signataireId === cible.id)).length;
  const opsHisto = await notionV4.getHistoriqueOpsProfilMembre?.(cible.id, cible.username) || null;
  const embed = new EmbedBuilder().setColor(color).setAuthor({ name: pole.includes('Illégal') ? '🔒 La Confrérie' : '⚖️ Iron Wolf Company', iconURL: interaction.guild.iconURL() || undefined }).setTitle(`👤 ${nomPerso}`).setThumbnail(cible.displayAvatarURL({ size: 256 })).addFields({ name: '🎖️ Grade', value: rang, inline: true }, { name: '📂 Pôle', value: pole, inline: true }, { name: `${statutEmoji} Statut`, value: statut.charAt(0).toUpperCase() + statut.slice(1), inline: true });
  if (profession !== '—') embed.addFields({ name: '💼 Profession', value: profession, inline: true });
  if (reputation !== '—') embed.addFields({ name: '⭐ Réputation', value: reputation, inline: true });
  const daysSinceActivity = data?.lastActivity ? Math.floor((Date.now() - new Date(data.lastActivity).getTime()) / 86400000) : null;
  embed.addFields({ name: '📅 Dernière activité', value: data?.lastActivity ? `${fmtShort(data.lastActivity)} *(${daysSinceActivity}j)*` : '—', inline: true }, { name: '📜 Contrats', value: `**${contratsSigned}** signé(s)`, inline: true }, { name: '👤 Discord', value: `<@${cible.id}>`, inline: true });
  if (opsHisto) embed.addFields({ name: '🎯 Dernières opérations', value: opsHisto, inline: false });
  const threadUrl = ficheNotion?.properties?.['Thread Discord']?.rich_text?.[0]?.plain_text;
  if (threadUrl?.startsWith('http')) embed.addFields({ name: '📋 Fiche complète', value: `[Voir le thread](${threadUrl})`, inline: true });
  embed.setFooter({ text: `IWC • Profil • ${new Date().toLocaleDateString('fr-FR')}` }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// Villes RDR2 pour le menu opérations
const VILLES_RDR2 = [
  { label: 'Saint Denis', value: 'Saint Denis', description: 'Grande ville du sud — Lemoyne' },
  { label: 'Valentine', value: 'Valentine', description: 'Ville du nord — New Hanover' },
  { label: 'Armadillo', value: 'Armadillo', description: 'Ville désertique — New Austin' },
  { label: 'Annesburg', value: 'Annesburg', description: 'Ville minière du nord-est' },
  { label: 'Strawberry', value: 'Strawberry', description: 'Ville des montagnes — West Elizabeth' },
  { label: 'Emerald Ranch', value: 'Emerald Ranch', description: 'Ranch à l\'est — Heartlands' },
  { label: 'Tumbleweed', value: 'Tumbleweed', description: 'Ville fantôme — Gaptooth Ridge' },
  { label: 'Lagras', value: 'Lagras', description: 'Village des marais — Bluewater Marsh' },
  { label: 'Flatneck Station', value: 'Flatneck Station', description: 'Station ferroviaire' },
  { label: 'Roanoke Ridge', value: 'Roanoke Ridge', description: 'Région sauvage du nord-est' },
  { label: 'Tall Trees', value: 'Tall Trees', description: 'Forêt dense — West Elizabeth' },
  { label: 'Rhodes', value: 'Rhodes', description: 'Ville du comté de Lemoyne' },
  { label: 'Blackwater', value: 'Blackwater', description: 'Ville moderne — West Elizabeth' },
  { label: 'Thieves Landing', value: 'Thieves Landing', description: 'Port des hors-la-loi' },
  { label: 'Banque Saint Denis', value: 'Banque Saint Denis', description: 'Cible principale — Saint Denis' },
  { label: 'Banque Valentine', value: 'Banque Valentine', description: 'Cible principale — Valentine' },
  { label: 'Train en mouvement', value: 'Train en mouvement', description: 'Attaque / Braquage de train' },
  { label: 'Port fluvial', value: 'Port fluvial', description: 'Port ou convoi maritime' },
  { label: 'Autre lieu', value: 'Autre', description: 'Lieu personnalisé à préciser' },
];

async function _ouvrirModalOpCreer(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  // Étape 1 : choisir la ville
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🎯 Nouvelle Opération — Étape 1/2').setDescription('**Choisissez le lieu de l\'opération**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('op_lieu_select')
        .setPlaceholder('📍 Sélectionner un lieu RDR2...')
        .addOptions(VILLES_RDR2)
    )],
  });
}

async function _handleOpLieuSelect(interaction) {
  const lieu = interaction.values[0];
  const lieuEnc = encodeURIComponent(lieu);
  const modal = new ModalBuilder().setCustomId(`modal_op_creer_${lieuEnc}`).setTitle(`🎯 Opération — ${lieu === 'Autre' ? 'Lieu à préciser' : lieu}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nom').setLabel("Nom de l'opération").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Opération Lumière Noire, Braquage Fleeca...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('lieu_detail').setLabel(lieu === 'Autre' ? 'Lieu précis' : `Détail du lieu (optionnel)`).setStyle(TextInputStyle.Short).setRequired(lieu === 'Autre').setValue(lieu !== 'Autre' ? lieu : '').setPlaceholder(`Ex: Entrepôt nord de ${lieu}...`)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('objectif').setLabel('Objectif').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Neutraliser les gardes, Récupérer le butin...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pole').setLabel('Pôle : légal ou illégal').setStyle(TextInputStyle.Short).setRequired(true).setValue('illégal').setPlaceholder('légal ou illégal')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('details').setLabel('Équipe / Notes (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Membres impliqués, matériel nécessaire, heure prévue...')
    ),
  );
  await interaction.showModal(modal);
}

async function _validerModalOpCreer(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild; const db = loadDB();
  const nom        = interaction.fields.getTextInputValue('nom').trim();
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim();
  // Récupérer la ville depuis le customId (modal_op_creer_VILLE_ENCODEE)
  const lieuVille  = decodeURIComponent(interaction.customId.replace('modal_op_creer_', ''));
  const lieu       = lieuDetail || lieuVille || '—';
  const objectif   = interaction.fields.getTextInputValue('objectif').trim();
  const poleRaw    = interaction.fields.getTextInputValue('pole').trim().toLowerCase();
  const details    = interaction.fields.getTextInputValue('details').trim() || '—';
  const pole     = poleRaw.includes('lég') || poleRaw.includes('leg') ? 'legal' : 'illegal';
  const createur = db.members[interaction.user.id]?.name || interaction.user.username;

  const op = {
    id: Date.now().toString(),
    name: nom, lieu, objectif,
    equipe: details, pole,
    createdBy: createur,
    createdById: interaction.user.id,
    participants: [], status: 'preparation',
    createdAt: new Date().toISOString(),
  };
  if (!db.operations) db.operations = [];
  db.operations.push(op);

  // Sync Notion
  let notionPageId = null;
  if (process.env.NOTION_TOKEN && process.env.NOTION_OPERATIONS_DB) {
    try {
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: { database_id: process.env.NOTION_OPERATIONS_DB }, properties: {
          'Nom': { title: [{ text: { content: nom } }] },
          'Lieu IC': { rich_text: [{ text: { content: lieu } }] },
          'Objectif': { rich_text: [{ text: { content: objectif } }] },
          'Pôle': { select: { name: pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } },
          'Statut': { select: { name: '🟡 En préparation' } },
          'Notes': { rich_text: [{ text: { content: details.slice(0, 2000) } }] },
          'Type': { select: { name: pole === 'legal' ? 'Légal' : 'Illégal' } },
          'Date prévue': { date: { start: new Date().toISOString().split('T')[0] } },
        }})
      });
      const data = await res.json();
      notionPageId = data.id;
      console.log(`✅ Opération Notion créée: ${nom}`);
    } catch(e) { console.log('❌ Notion op créer:', e.message); }
  }
  op.notionPageId = notionPageId;
  saveDB(db);

  await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' });
  await ajouterJournalIC(guild, { type: 'operation', titre: `Nouvelle opération — ${nom}`, description: `📍 ${lieu} · ${objectif} · Pôle : ${pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`, auteur: createur });

  const embed = new EmbedBuilder().setColor(0xFFA500)
    .setTitle(`🎯 OPÉRATION — ${nom}`)
    .setDescription(`*Créée par **${createur}** · ${fmtShort(new Date())}*`)
    .addFields(
      { name: '📌 Statut', value: '🟡 En préparation', inline: true },
      { name: '🗂️ Pôle', value: pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal', inline: true },
      { name: '🆔 ID', value: `\`${op.id}\``, inline: true },
      { name: '📍 Lieu', value: lieu, inline: true },
      { name: '🎯 Objectif', value: objectif, inline: true },
      { name: '👥 Participants (0)', value: '*Clique ✋ pour rejoindre*', inline: false },
      { name: '📋 Détails', value: details, inline: false },
      ...(notionPageId ? [{ name: '🔗 Notion', value: `[Voir la fiche](https://notion.so/${notionPageId.replace(/-/g, '')})`, inline: true }] : []),
    )
    .setFooter({ text: `IWC • Opération • ${fmtShort(new Date())}` })
    .setTimestamp();

  const rowP = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary),
  );
  const rowG = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
  );
  const rowModif = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_modifier_${op.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary),
  );

  const opsCh = guild.channels.cache.get(SALON_IDS.OPERATIONS) || getChById(guild, 'OPERATIONS', 'operations');
  if (opsCh) {
    const mention = `<@&${pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}>`;
    await opsCh.send({ content: `${mention} — 🎯 Nouvelle opération **${nom}** · Inscrivez-vous ci-dessous.`, embeds: [embed], components: [rowP, rowG, rowModif], allowedMentions: { parse: [], roles: [pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL] } });
  }
  await interaction.editReply({ content: `✅ Opération **${nom}** créée${notionPageId ? ' et synchronisée avec Notion' : ''}.` });
}

async function _ouvrirModalOpProgrammee(interaction) {
  if (!interaction.member?.roles.cache.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier'].some(n => r.name.includes(n)))) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  }
  const modal = new ModalBuilder().setCustomId('modal_op_programmee').setTitle('🕐 Programmer une opération');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel("Nom de l'opération").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Braquage Fleeca Grapeseed')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_heure').setLabel('Date et heure de lancement').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Fleeca Grapeseed...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails (Objectif / Pôle: légal ou illégal)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Objectif: Neutraliser les gardes\nPôle: illégal')),
  );
  await interaction.showModal(modal);
}

async function _notionPatch(pageId, properties) {
  if (!process.env.NOTION_TOKEN) return;
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ properties }) }).catch(e => console.log('❌ _notionPatch error:', e.message));
}
async function _notionCreate(dbId, properties) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: dbId }, properties }) }).catch(e => { console.log('❌ _notionCreate error:', e.message); return null; });
  return res ? await res.json().catch(() => null) : null;
}
async function _notionFindByDiscordId(dbId, discordId) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return data?.results?.[0] || null;
}

async function _syncSurnomNotion(message) {
  try {
    const lines = message.content.split('\n');
    const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase()) && l.includes(':')); return l ? l.split(':').slice(1).join(':').trim() : ''; };
    const nomIC = get('NOM IC'); const surnomIC = get('SURNOM IC'); const appart = get('APPARTENANCE');
    const userId = message.discordId || message.author?.id;
    const pseudoDiscord = message.pseudoDiscord || message.author?.username || '';
    if (!userId) return;
    let page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, userId);
    if (!page && process.env.NOTION_TOKEN && process.env.NOTION_MEMBRES_DB) {
      const created = await _notionCreate(process.env.NOTION_MEMBRES_DB, { 'Nom': { title: [{ text: { content: nomIC || pseudoDiscord } }] }, 'Discord ID': { rich_text: [{ text: { content: userId } }] }, 'Pseudo': { rich_text: [{ text: { content: pseudoDiscord } }] } });
      page = created; console.log(`✅ Nouveau membre créé dans Notion : ${nomIC}`);
    }
    if (!page) { if (typeof message.react === 'function') await message.react('⚠️').catch(() => {}); return; }
    const props = {};
    if (nomIC)         props['Personnage']        = { rich_text: [{ text: { content: nomIC } }] };
    if (surnomIC)      props['Surnom']             = { rich_text: [{ text: { content: surnomIC } }] };
    if (pseudoDiscord) props['Pseudo']             = { rich_text: [{ text: { content: pseudoDiscord } }] };
    if (userId)        props['Discord ID']         = { rich_text: [{ text: { content: userId } }] };
    if (appart)        props['Pôle']               = { select: { name: appart.toLowerCase().includes('ill') ? '🔒 Illégal' : '⚖️ Légal' } };
    props['Dernière activité'] = { date: { start: new Date().toISOString().split('T')[0] } };
    await _notionPatch(page.id, props);
    if (typeof message.react === 'function') await message.react('✅').catch(() => {});
    console.log(`✅ Identité IC synced : ${nomIC} — ID: ${userId}`);
  } catch (e) { console.log('❌ _syncSurnomNotion error:', e.message); }
}

async function _syncCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_RECRUTEMENT_DB) return;
  const DB = process.env.NOTION_RECRUTEMENT_DB;
  const statutMap = { 'reçue': '🟡 En attente', 'recue': '🟡 En attente', 'acceptee': '✅ Acceptée', 'refusee': '❌ Refusée' };
  const props = { 'Nom du personnage': { title: [{ text: { content: cand.nomPerso || '—' } }] }, 'Statut': { select: { name: statutMap[statut] || statut } }, 'Type': { select: { name: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } }, 'Discord ID': { rich_text: [{ text: { content: cand.userId || cand.discordId || '—' } }] }, 'Date candidature': { date: { start: new Date(cand.receivedAt || Date.now()).toISOString().split('T')[0] } } };
  if (validePar) { props['Décidé par'] = { rich_text: [{ text: { content: validePar } }] }; props['Date décision'] = { date: { start: new Date().toISOString().split('T')[0] } }; }
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Nom du personnage', title: { equals: cand.nomPerso || '' } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];
  if (existing) await _notionPatch(existing.id, props); else await _notionCreate(DB, props);
  console.log(`✅ Candidature Notion : ${cand.nomPerso} → ${statut}`);
}

async function _syncMembreNotion(discordId, updates) {
  const page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, discordId); if (!page) return;
  const props = {};
  if (updates.rang) props['Grade'] = { select: { name: updates.rang } };
  if (updates.status) { const map = { actif: '✅ Actif', absent: '⚠️ Absent', inactif: '💤 Inactif', parti: '🚪 Parti', visiteur: '👁️ Visiteur' }; props['Statut'] = { select: { name: map[updates.status] || updates.status } }; }
  if (updates.lastActivity) props['Dernière activité'] = { date: { start: new Date(updates.lastActivity).toISOString().split('T')[0] } };
  if (updates.leftAt) props['Date de départ'] = { date: { start: new Date(updates.leftAt).toISOString().split('T')[0] } };
  if (Object.keys(props).length) { await _notionPatch(page.id, props); console.log(`✅ Membre Notion MàJ : ${discordId}`); }
}

async function _syncContratNotion(contrat, statut, signePar) {
  const DB = process.env.NOTION_CONTRATS_DB || process.env.NOTION_MEMBRES_DB;
  if (!DB || !process.env.NOTION_TOKEN) return;
  const statutMap = { en_attente: '🟡 En attente', signe: '✅ Signé', refuse: '❌ Refusé', expire: '📁 Expiré' };
  const props = { 'Référence': { title: [{ text: { content: contrat.id } }] }, 'Objet': { rich_text: [{ text: { content: contrat.objet || '—' } }] }, 'Type': { select: { name: contrat.type === 'emploi' ? '📥 Employeur' : '📤 Prestation' } }, 'Statut': { select: { name: statutMap[statut] || statut } }, 'Rémunération': { rich_text: [{ text: { content: contrat.remuneration || '—' } }] }, 'Partenaire': { rich_text: [{ text: { content: contrat.clientNom || contrat.employeurNom || '—' } }] }, 'Émetteur': { rich_text: [{ text: { content: contrat.emetteurIC || contrat.emetteurNom || contrat.signataire || '—' } }] }, 'Date création': { date: { start: new Date(contrat.createdAt || Date.now()).toISOString().split('T')[0] } } };
  if (statut === 'signe' && signePar) { props['Signé par'] = { rich_text: [{ text: { content: signePar } }] }; props['Date signature'] = { date: { start: new Date().toISOString().split('T')[0] } }; }
  if (contrat.dateEcheance) props['Échéance'] = { date: { start: contrat.dateEcheance } };
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Référence', title: { equals: contrat.id } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];
  if (existing) await _notionPatch(existing.id, props); else await _notionCreate(DB, props);
  console.log(`✅ Contrat Notion MàJ : ${contrat.id} → ${statut}`);
}

async function _syncAffaireNotion(affaire, decision) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  const DB = process.env.NOTION_AFFAIRES_DB || process.env.NOTION_MEMBRES_DB;
  const statutMap = { approuvee: '✅ Approuvée', rejetee: '❌ Rejetée', en_cours: '🗳️ En vote' };
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Titre', title: { equals: affaire.titre || affaire.title || '' } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null; const existing = data?.results?.[0];
  const props = { 'Statut': { select: { name: statutMap[decision] || decision } }, 'Décision': { rich_text: [{ text: { content: decision === 'approuvee' ? '✅ Approuvée' : '❌ Rejetée' } }] }, 'Date décision': { date: { start: new Date().toISOString().split('T')[0] } } };
  if (existing) await _notionPatch(existing.id, props);
}

async function _syncInformateurNotion(info, statut, validePar) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_INFOS_DB) return;
  const statutMap = { confirme: '✅ Confirmé', infirme: '❌ Infirmé', nouveau: '🆕 Nouveau' };
  const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_INFOS_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Source', title: { equals: info.source || info.id || '' } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null; const existing = data?.results?.[0];
  const props = { 'Statut': { select: { name: statutMap[statut] || statut } }, 'Validé par': { rich_text: [{ text: { content: validePar || '—' } }] }, 'Date décision': { date: { start: new Date().toISOString().split('T')[0] } } };
  if (existing) { await _notionPatch(existing.id, props); console.log(`✅ Informateur Notion MàJ : ${info.titre || info.id} → ${statut}`); }
}

async function _syncAvertissementNotion(userId, username, avt, total) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  const page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, userId); if (!page) return;
  await _notionPatch(page.id, { 'Avertissements': { number: total }, 'Dernier avertissement': { rich_text: [{ text: { content: avt.raison } }] } });
}

async function handleAutocompleteGrades(interaction) {
  const { GRADES_LEGAL, GRADES_ILLEGAL } = notionV3;
  const input = (interaction.options.getFocused() || '').toLowerCase();
  const db = loadDB(); const cible = interaction.options.getUser('membre');
  const membre = cible ? await interaction.guild.members.fetch(cible.id).catch(() => null) : null;
  let grades = [...(GRADES_LEGAL || []), ...(GRADES_ILLEGAL || [])];
  if (membre) {
    const pole = membre.roles.cache.some(r => ['Exécuteur','Condamné','Maudit','Fléau','Confrérie','Ombre','Concepteur'].some(n => r.name.includes(n))) ? 'illegal' : 'legal';
    grades = pole === 'illegal' ? (GRADES_ILLEGAL || []) : (GRADES_LEGAL || []);
  }
  const filtered = grades.filter(g => g.toLowerCase().includes(input)).slice(0, 25).map(g => ({ name: g, value: g }));
  await interaction.respond(filtered).catch(() => {});
}

async function _handleRegistre(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const pole = interaction.options?.getString('pole') || 'tous'; const page = Math.max(1, interaction.options?.getInteger('page') || 1); const PAR_PAGE = 10;
  let membres = Object.values(db.members || {}).filter(m => m.status !== 'parti');
  if (pole !== 'tous') membres = membres.filter(m => m.pole === pole);
  membres.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const total = membres.length; const pages = Math.ceil(total / PAR_PAGE) || 1; const pageActuelle = Math.min(page, pages);
  const slice = membres.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);
  const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', visiteur: '👁️' };
  const lignes = slice.map((m, i) => { const idx = (pageActuelle - 1) * PAR_PAGE + i + 1; const emoji = statutEmoji[m.status] || '❓'; const pole_e = m.pole === 'illegal' ? '🔒' : '⚖️'; const rang = m.rang ? ` · *${m.rang}*` : ''; const activ = m.lastActivity ? ` · ${daysSince(m.lastActivity)}j` : ''; return `\`${String(idx).padStart(2, '0')}\` ${emoji} ${pole_e} **${m.name || m.username || '—'}**${rang}${activ}`; }).join('\n');
  const poleLabel = pole === 'legal' ? '⚖️ Légal' : pole === 'illegal' ? '🔒 Illégal' : 'Tous les pôles';
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📋 Registre — ${poleLabel}`).setDescription(lignes || '*Aucun membre trouvé.*').addFields({ name: '📊 Total', value: `**${total}** membre(s)`, inline: true }).setFooter({ text: `Page ${pageActuelle}/${pages} • IWC` }).setTimestamp()] });
}

async function _handleOpDetail(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const db = loadDB(); const id = interaction.options?.getString('id'); const ops = db.operations || [];
  let op;
  if (id) { op = ops.find(o => o.id === id || o.name?.toLowerCase().includes(id.toLowerCase())); }
  else { op = ops.find(o => o.status === 'en_cours') || ops.find(o => o.status === 'programmee') || [...ops].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; }
  if (!op) return interaction.editReply({ content: '❌ Aucune opération trouvée.' });
  const statutMap = { en_cours: '🟢 En cours', programmee: '🕐 Programmée', terminee: '✅ Terminée', annulee: '❌ Annulée', preparation: '🟡 Préparation' };
  const color = op.status === 'en_cours' ? 0x57F287 : op.status === 'terminee' ? 0x8B1A1A : op.status === 'annulee' ? 0x555555 : 0xFFA500;
  const embed = new EmbedBuilder().setColor(color).setTitle(`🎯 ${op.name}`).addFields({ name: '📌 Statut', value: statutMap[op.status] || op.status, inline: true }, { name: '📂 Pôle', value: op.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal', inline: true }, { name: '🆔 ID', value: `\`${op.id}\``, inline: true }, { name: '📍 Lieu', value: op.lieu || '—', inline: true }, { name: '🎯 Objectif', value: op.objectif || '—', inline: true }, { name: '👤 Créé par', value: op.createdBy || '—', inline: true });
  if (op.participants?.length) embed.addFields({ name: `👥 Participants (${op.participants.length})`, value: op.participants.join(', '), inline: false });
  if (op.status === 'terminee') { embed.addFields({ name: '📊 Résultat', value: op.resultat || '—', inline: true }, { name: '💰 Butin', value: op.butin || '—', inline: true }); if (op.debrief) embed.addFields({ name: '📝 Débrief', value: op.debrief.slice(0, 500), inline: false }); }
  if (op.status === 'programmee' && op.lancementAt) embed.addFields({ name: '⏰ Lancement prévu', value: new Date(op.lancementAt).toLocaleString('fr-FR'), inline: false });
  embed.addFields({ name: '📅 Créée le', value: fmtShort(op.createdAt), inline: true }).setFooter({ text: 'IWC • Opérations' }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

function _buildCandidaturesResume(db) {
  const cands = (db.candidatures || []).filter(c => c.status === 'reçue');
  if (!cands.length) return '✅ Aucune candidature en attente.';
  return cands.map((c, i) => { const h = Math.floor((Date.now() - new Date(c.receivedAt).getTime()) / 3600000); const urgent = h >= 48 ? ' 🔴' : h >= 24 ? ' ⚠️' : ''; return `**${i+1}.** ${c.nomPerso} — ${c.type === 'legal' ? '⚖️' : '🔒'} — ${h}h${urgent}`; }).join('\n');
}

async function envoyerDMRecap(guild, userId, type, data) {
  try {
    const db = loadDB(); if (!db._dmRecap) db._dmRecap = {}; if (!db._dmRecap[userId]) db._dmRecap[userId] = {};
    const membre = await guild.members.fetch(userId).catch(() => null); if (!membre) return;
    const events = db._dmRecap[userId].events || [];
    events.unshift({ type, data, date: new Date().toISOString() });
    db._dmRecap[userId].events = events.slice(0, 5);
    const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Iron Wolf Company — Vos notifications').setDescription('*Récapitulatif de vos dernières notifications IWC.*').setTimestamp();
    for (const ev of db._dmRecap[userId].events) {
      const date = new Date(ev.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      if (ev.type === 'grade') embed.addFields({ name: `🎖️ Grade — ${date}`, value: `**${ev.data.ancien}** → **${ev.data.nouveau}**`, inline: false });
      else if (ev.type === 'rdv') embed.addFields({ name: `📅 Convocation — ${date}`, value: `**${ev.data.titre}** — ${ev.data.date} à ${ev.data.heure}\n📍 ${ev.data.lieu}`, inline: false });
      else if (ev.type === 'contrat') embed.addFields({ name: `📜 Contrat — ${date}`, value: `**${ev.data.id}** — ${ev.data.objet}`, inline: false });
      else if (ev.type === 'candidature') embed.addFields({ name: `🐺 Candidature — ${date}`, value: ev.data.message, inline: false });
      else if (ev.type === 'rappel') embed.addFields({ name: `⏰ Rappel RDV — ${date}`, value: `**${ev.data.titre}** dans ${ev.data.dans}`, inline: false });
      else if (ev.type === 'absence') embed.addFields({ name: `🟡 Absence — ${date}`, value: ev.data.message, inline: false });
    }
    embed.setFooter({ text: 'IWC • Secrétariat automatique • Ce message est mis à jour automatiquement' });
    const dmChannel = await membre.createDM().catch(() => null); if (!dmChannel) return;
    const lastMsgId = db._dmRecap[userId].msgId;
    if (lastMsgId) { const lastMsg = await dmChannel.messages.fetch(lastMsgId).catch(() => null); if (lastMsg) { await lastMsg.edit({ embeds: [embed] }); saveDB(db); return; } }
    const sent = await dmChannel.send({ embeds: [embed] }).catch(() => null);
    if (sent) { db._dmRecap[userId].msgId = sent.id; saveDB(db); }
  } catch(e) { console.log('❌ envoyerDMRecap error:', e.message); }
}

async function buildMembresDiscordMap(guild) {
  try {
    const allMembers = await guild.members.fetch().catch(() => null);
    if (allMembers) {
      const db = loadDB(); let changed = false;
      for (const [id, m] of allMembers) {
        if (m.user.bot) continue;
        if (!db.members[id]) { db.members[id] = { discordId: id, username: m.user.username, status: 'visiteur', joinedAt: new Date().toISOString(), lastActivity: new Date().toISOString() }; changed = true; }
        else if (!db.members[id].username) { db.members[id].username = m.user.username; changed = true; }
      }
      if (changed) { saveDB(db); console.log('✅ MEMBRES_DISCORD_MAP auto-refresh'); }
    }
  } catch(e) { console.log('❌ buildMembresDiscordMap refresh:', e.message); }
  try {
    const { ROLES } = require('./notion-modules-v3'); const allRoleIds = Object.values(ROLES || {});
    const members = await guild.members.fetch().catch(() => null); if (!members) return;
    const db = loadDB(); let updated = 0;
    for (const [, m] of members) {
      if (m.user.bot) continue; if (!m.roles.cache.some(r => allRoleIds.includes(r.id))) continue;
      const nomIC = db.members[m.id]?.name;
      if (nomIC && nomIC !== m.user.username) { const cfg = require('./config'); if (!cfg.MEMBRES_DISCORD_MAP[nomIC]) { cfg.MEMBRES_DISCORD_MAP[nomIC] = m.id; cfg.DISCORD_TO_IC[m.id] = nomIC; updated++; } }
    }
    if (updated > 0) console.log(`✅ MEMBRES_DISCORD_MAP enrichi : +${updated} entrées`);
  } catch (e) { console.log('❌ buildMembresDiscordMap:', e.message); }
}

async function _handleVersion(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const BOT_VERSION = '4.1'; const uptime = Math.floor(process.uptime()); const h = Math.floor(uptime / 3600); const m = Math.floor((uptime % 3600) / 60); const s = uptime % 60;
  let notionOk = false;
  try { const r = await fetch('https://api.notion.com/v1/users/me', { headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' } }); notionOk = r.ok; } catch {}
  const db = loadDB();
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`🤖 IWC Bot — v${BOT_VERSION}`).addFields({ name: '⏱️ Uptime', value: `${h}h ${m}m ${s}s`, inline: true }, { name: '🔗 Notion', value: notionOk ? '✅ Connecté' : '❌ Déconnecté', inline: true }, { name: '💾 Mémoire', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true }, { name: '👥 Membres en DB', value: `${Object.keys(db.members || {}).length}`, inline: true }, { name: '🎯 Opérations', value: `${(db.operations || []).length}`, inline: true }, { name: '📜 Contrats', value: `${(db.contrats || []).length}`, inline: true }).setFooter({ text: `IWC Bot v${BOT_VERSION} • Node ${process.version}` }).setTimestamp()] });
}

async function _handleSync(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild; const start = Date.now();
  await syncRegistreNotion(guild).catch(() => {}); await updateDashboard(guild).catch(() => {}); await notionV3.updateHierarchieEmbed?.(guild).catch(() => {}); await buildMembresDiscordMap(guild).catch(() => {});
  const ms = Date.now() - start;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('🔄 Synchronisation terminée').addFields({ name: '✅ Registre Notion', value: 'Synchronisé', inline: true }, { name: '✅ Dashboard', value: 'Mis à jour', inline: true }, { name: '✅ Hiérarchie', value: 'Actualisée', inline: true }).setFooter({ text: `Durée : ${ms}ms` }).setTimestamp()] });
}

async function _handleAvertir(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ ephemeral: false });
  const cible = interaction.options.getUser('membre'); const raison = interaction.options.getString('raison');
  const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
  const db = loadDB(); if (!db.avertissements) db.avertissements = {}; if (!db.avertissements[cible.id]) db.avertissements[cible.id] = [];
  const avertissement = { id: `AVT-${Date.now().toString().slice(-5)}`, raison, parId: interaction.user.id, par: interaction.user.username, date: new Date().toISOString() };
  db.avertissements[cible.id].push(avertissement); saveDB(db);
  const total = db.avertissements[cible.id].length; const color = total >= 3 ? 0xED4245 : total === 2 ? 0xFFA500 : 0xFFCC00;
  const embed = new EmbedBuilder().setColor(color).setTitle(`⚠️ Avertissement — ${cible.username}`).addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '📋 Raison', value: raison, inline: false }, { name: '🔢 Total', value: `**${total}/3**`, inline: true }, { name: '✅ Émis par', value: interaction.user.username, inline: true }).setFooter({ text: `IWC • Réf. ${avertissement.id}` }).setTimestamp();
  if (total >= 3) embed.addFields({ name: '🚨 Attention', value: '**3 avertissements atteints.** Une décision de la Direction est requise.', inline: false });
  await interaction.editReply({ embeds: [embed] });
  try { const isIlleg = db.members[cible.id]?.pole === 'illegal'; await membre?.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(`⚠️ Avertissement — ${isIlleg ? 'La Confrérie' : 'Iron Wolf Company'}`).setDescription(`Tu as reçu un avertissement de la Direction.\n\n**Raison :** ${raison}\n\n*${total >= 3 ? '🚨 Tu as atteint 3 avertissements. La Direction va délibérer.' : `Avertissement ${total}/3.`}*`).setFooter({ text: isIlleg ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })] }); } catch {}
  if (total >= 3) { const logsCh = getCh(interaction.guild, 'logs'); const mention = interaction.guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' '); if (logsCh) await logsCh.send({ content: `${mention} — 🚨 **${cible.username} a atteint 3 avertissements**`, embeds: [embed] }).catch(() => {}); }
  _syncAvertissementNotion(cible.id, cible.username, avertissement, total).catch(() => {});
}

async function _handleAvertissements(interaction) {
  const cible = interaction.options?.getUser('membre') || interaction.user; const db = loadDB(); const liste = db.avertissements?.[cible.id] || [];
  const embed = new EmbedBuilder().setColor(liste.length >= 3 ? 0xED4245 : liste.length > 0 ? 0xFFA500 : 0x57F287).setTitle(`⚠️ Avertissements — ${cible.username}`).setDescription(liste.length === 0 ? '✅ Aucun avertissement.' : `**${liste.length}/3 avertissement(s)**`).setThumbnail(cible.displayAvatarURL());
  for (const a of liste.slice(-5).reverse()) embed.addFields({ name: `${fmtShort(a.date)} — ${a.id}`, value: `${a.raison}\n*Par ${a.par}*`, inline: false });
  embed.setFooter({ text: 'IWC • Historique des sanctions' }).setTimestamp();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// [FIX] _handleRetour — membres déclarent leur retour, Direction peut choisir un membre
async function _handleRetour(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const guild = interaction.guild;
  // La Direction peut passer un membre en option
  const cibleUser = isDirection(interaction.member) ? interaction.options?.getUser('membre') : null;
  const targetId   = cibleUser ? cibleUser.id : interaction.user.id;
  const targetUser = cibleUser || interaction.user;
  const m = db.members[targetId];
  if (!m) return interaction.editReply({ content: `❌ <@${targetId}> n'est pas enregistré dans le système.` });
  if (m.status === 'actif') return interaction.editReply({ content: `✅ <@${targetId}> est déjà actif.` });
  // Forcer le retour même si statut inconnu
  console.log(`🔄 Retour de ${targetId} — statut: ${m.status}`);
  const ancienStatut = m.status;
  m.status = 'actif'; m.lastActivity = new Date().toISOString(); m.absentJusqu = null; m.absentRaison = null; saveDB(db);
  const membreRetour = await guild.members.fetch(targetId).catch(() => null);
  if (membreRetour) {
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreRetour.roles.remove(roleAbsent).catch(() => {});
    await _debloquerEcritureAbsent(guild, membreRetour);
  }
  _syncMembreNotion(targetId, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
  // Mettre à jour Fiches_personnages aussi
  _syncStatutFicheNotion(targetId, 'Actif').catch(() => {});
  const absCh = getAbsencesCh(guild, membreRetour);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
    .setAuthor({ name: `${membreRetour?.displayName || targetUser.username} — Retour`, iconURL: targetUser.displayAvatarURL?.() || undefined })
    .setTitle('✅ Retour déclaré')
    .addFields(
      { name: '👤 Membre', value: `<@${targetId}>`, inline: true },
      { name: '🎖️ Grade', value: m.rang || '—', inline: true },
      { name: '📅 Retour le', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
      ...(cibleUser ? [{ name: '✅ Levé par', value: interaction.user.username, inline: true }] : []),
    ).setFooter({ text: cibleUser ? 'IWC • Levé par la Direction' : 'IWC • Retour déclaré manuellement' }).setTimestamp()] }).catch(() => {});
  if (cibleUser) {
    await interaction.editReply({ content: `✅ Retour de <@${targetId}> enregistré. Permissions rétablies.` });
  } else {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Retour enregistré').setDescription(`Tu es de retour !\n\nAncien statut : **${ancienStatut}** → **Actif**\n*Tes permissions d'écriture sont rétablies.*`).setFooter({ text: 'IWC • Bienvenue de retour' })] });
  }
}

// [CORRECTION] _handleAnnulerAbsence avec déblocage écriture
async function _handleAnnulerAbsence(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const cible = interaction.options.getUser('membre');
  if (!cible) return interaction.editReply({ content: '❌ Membre introuvable. Utilise l\'option @membre.' });
  const db = loadDB(); const m = db.members[cible.id];
  if (!m) return interaction.editReply({ content: `❌ <@${cible.id}> n'est pas enregistré dans le système. Vérifie que le membre a bien utilisé /absent.` });
  if (m.status !== 'absent') {
    // Forcer quand même le retrait du rôle au cas où
    const membreForce = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (membreForce) await _debloquerEcritureAbsent(interaction.guild, membreForce);
    return interaction.editReply({ content: `⚠️ <@${cible.id}> n'était pas marqué absent (statut : ${m.status}) mais les permissions ont été rétablies.` });
  }
  m.status = 'actif'; m.lastActivity = new Date().toISOString(); m.absentJusqu = null; m.absentRaison = null; saveDB(db);
  const membreD = await interaction.guild.members.fetch(cible.id).catch(() => null);
  if (membreD) {
    const roleAbsent = interaction.guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreD.roles.remove(roleAbsent).catch(() => {});
    await _debloquerEcritureAbsent(interaction.guild, membreD);
  }
  _syncMembreNotion(cible.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
  _syncStatutFicheNotion(cible.id, 'Actif').catch(() => {});
  const absCh = getAbsencesCh(interaction.guild, membreD);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Absence levée par la Direction').addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '✅ Levé par', value: interaction.user.username, inline: true }, { name: '📅 Date', value: new Date().toLocaleDateString('fr-FR'), inline: true }).setFooter({ text: 'IWC • Absence annulée par la Direction' }).setTimestamp()] }).catch(() => {});
  try { await membreD?.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Absence levée').setDescription(`Ton absence a été levée par **${interaction.user.username}**.\nTes permissions d'écriture sont rétablies.`).setFooter({ text: 'IWC' })] }); } catch {}
  await interaction.editReply({ content: `✅ Absence de <@${cible.id}> levée.` });
}

async function _executerPurge(interaction) {
  if (!isDirection(interaction.member)) return interaction.update({ content: '❌ Accès refusé.', embeds: [], components: [] });
  const parts = interaction.customId.replace('purge_confirm_', '').split('_'); const salonId = parts[0]; const nbRaw = parts[1]; const nombre = nbRaw === 'all' ? null : parseInt(nbRaw);
  const salon = interaction.guild.channels.cache.get(salonId); if (!salon) return interaction.update({ content: '❌ Salon introuvable.', embeds: [], components: [] });
  await interaction.update({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🗑️ Suppression en cours...').setDescription('Patience, le bot supprime les messages.')], components: [] });
  let total = 0; let continuer = true;
  while (continuer) {
    const limit = nombre ? Math.min(nombre - total, 100) : 100;
    const msgs = await salon.messages.fetch({ limit }).catch(() => null); if (!msgs || msgs.size === 0) break;
    const maintenant = Date.now(); const limite14j = maintenant - 13 * 24 * 60 * 60 * 1000;
    const recents = msgs.filter(m => m.createdTimestamp > limite14j); const anciens = msgs.filter(m => m.createdTimestamp <= limite14j);
    if (recents.size >= 2) { await salon.bulkDelete(recents).catch(() => {}); total += recents.size; }
    else if (recents.size === 1) { await recents.first().delete().catch(() => {}); total += 1; }
    for (const [, m] of anciens) { await m.delete().catch(() => {}); total++; await new Promise(r => setTimeout(r, 300)); if (nombre && total >= nombre) { continuer = false; break; } }
    if (nombre && total >= nombre) break; if (msgs.size < 100) break;
  }
  try { await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Purge terminée').addFields({ name: '🗑️ Messages supprimés', value: `**${total}**`, inline: true }, { name: '📋 Salon', value: `#${salon.name}`, inline: true }, { name: '👤 Exécuté par', value: interaction.user.username, inline: true }).setFooter({ text: 'IWC • Purge automatique' }).setTimestamp()] }); } catch {}
  console.log(`✅ Purge : ${total} messages supprimés dans #${salon.name}`);
}

async function _handlePatchDeploy(interaction) {
  const isFondateur = interaction.member.roles.cache.some(r => r.name.includes('Fondateur'));
  const isFleau = interaction.member.roles.cache.some(r => r.name.includes('Fl\u00e9au') || r.name.includes('Fleau'));
  if (!isFondateur && !isFleau) return interaction.reply({ flags: MessageFlags.Ephemeral, content: '\u274c R\u00e9serv\u00e9 au Fondateur et au Fl\u00e9au.' });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const patchCh = getChById(interaction.guild, 'PATCH_NOTE', 'patch-note', 'patch');
  if (!patchCh) return interaction.editReply({ content: '\u274c Salon #patch-note introuvable.' });
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const embed1 = new EmbedBuilder()
    .setColor(0x8B4513)
    .setAuthor({ name: 'Iron Wolf Company \u00b7 IWC Setup', iconURL: interaction.guild.iconURL() || undefined })
    .setTitle('\uD83D\uDC3A IWC Bot \u2014 Mise \u00e0 jour majeure \u00b7 02/06/2026')
    .setDescription('*D\u00e9ploy\u00e9 le **' + dateStr + '** \u2014 Version 5.0*')
    .addFields(
      { name: '\uD83D\uDCB0 TR\u00c9SORERIE', value: '\u2192 Sync Notion corrig\u00e9e \u2014 colonnes Entr\u00e9e/Sortie et L\u00e9gal/Ill\u00e9gal\n\u2192 Panel mis \u00e0 jour automatiquement apr\u00e8s chaque transaction\n\u2192 Blocage double transaction si un flow est d\u00e9j\u00e0 en cours\n\u2192 Nettoyage automatique des messages orphelins au d\u00e9marrage\n\u2192 Colonne Mouvement + vues Coffre L\u00e9gal et Coffre Ill\u00e9gal dans Notion', inline: false },
      { name: '\uD83E\uDDD1 FICHES PERSONNAGES', value: '\u2192 Nouveau format Far West \u2014 style authentique 1895\n\u2192 Champ TELEGRAPHE IC ajout\u00e9 dans le formulaire et les embeds\n\u2192 Protection propri\u00e9taire \u2014 seul auteur ou Direction peut modifier\n\u2192 Textes longs \u2192 multi-embeds automatiques dans le thread\n\u2192 Message original du membre conserv\u00e9', inline: false },
    )
    .setFooter({ text: 'IWC Bot v5.0 \u00b7 1/3' });

  const embed2 = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .addFields(
      { name: '\uD83C\uDFAF OP\u00c9RATIONS', value: '\u2192 Sync Notion corrig\u00e9e \u2014 colonnes Lieu IC, Notes, Date pr\u00e9vue\n\u2192 Bouton Modifier \u2014 lieu, objectif, notes modifiables avant lancement\n\u2192 Syst\u00e8me Rassemblement \u2014 ping p\u00f4le + boutons pr\u00e9sents/absents\n\u2192 Embed pr\u00e9sents/absents mis \u00e0 jour en temps r\u00e9el\n\u2192 Confirmation avant lancement : Ping P\u00f4le / Ping Participants / Sans ping\n\u2192 Blocage modification si op\u00e9ration lanc\u00e9e ou termin\u00e9e', inline: false },
      { name: '\uD83D\uDCC5 AGENDA & RDV', value: '\u2192 Choix l\u00e9gal/ill\u00e9gal \u2014 RDV post\u00e9 dans #agenda ou #agenda-ill\u00e9gal\n\u2192 Sync Notion avec colonne P\u00f4le : L\u00e9gal / Ill\u00e9gal / Direction / Tous\n\u2192 Bouton RDV depuis #contrats \u2014 flow complet avec choix p\u00f4le\n\u2192 Nettoyage automatique des messages interm\u00e9diaires apr\u00e8s cr\u00e9ation', inline: false },
      { name: '\uD83D\uDC65 MEMBRES & SYNCHRONISATION', value: '\u2192 Sync automatique au d\u00e9marrage \u2014 statut + p\u00f4le de tous les membres\n\u2192 Changement de r\u00f4le Discord \u2192 Notion mis \u00e0 jour en temps r\u00e9el\n\u2192 /absent et /retour sync Fiches_personnages automatiquement\n\u2192 Nouveau membre avec r\u00f4le de p\u00f4le \u2192 cr\u00e9\u00e9 dans Notion\n\u2192 D\u00e9tection p\u00f4le corrig\u00e9e \u2014 ill\u00e9gal prioritaire sur l\u00e9gal', inline: false },
    )
    .setFooter({ text: 'IWC Bot v5.0 \u00b7 2/3' });

  const embed3 = new EmbedBuilder()
    .setColor(0x2C3E50)
    .addFields(
      { name: '\uD83D\uDD27 SERVEUR & PERMISSIONS', value: '\u2192 /setup-serveur \u2014 9 cat\u00e9gories, 53 salons, permissions compl\u00e8tes\n\u2192 Permissions par r\u00f4le selon document officiel IWC\n\u2192 Bot IWC pr\u00e9sent automatiquement sur tous les salons\n\u2192 Cat\u00e9gorie BOT CACH\u00c9 \u2014 #patch-note et #logs Direction uniquement', inline: false },
      { name: '\uD83D\uDC1B CORRECTIONS', value: '\u2192 @r\u00f4le inconnu corrig\u00e9 \u2014 La Confr\u00e9rie ping\u00e9e correctement\n\u2192 Format fiches ne se reposte plus en boucle\n\u2192 Erreurs Notion Heure et Emetteur corrig\u00e9es\n\u2192 setupOperationsGuide \u2014 crash d\u00e9marrage corrig\u00e9\n\u2192 Double transaction \u2014 blocage si flow en cours', inline: false },
      { name: '\uD83D\uDD2E PROCHAINES MISES \u00c0 JOUR', value: '\u2192 Script push-to-talk \u2014 F9 pour dicter un rapport vocal vers #informateurs\n\u2192 Dashboard hebdomadaire \u2014 stats visuelles par p\u00f4le\n\u2192 Rappels RDV automatiques \u2014 notification 1h et 15min avant\n\u2192 Archivage automatique des op\u00e9rations termin\u00e9es dans Notion', inline: false },
    )
    .setFooter({ text: 'IWC Bot v5.0 \u00b7 3/3 \u00b7 La force est dans l\'ombre. \u2014 La Compagnie' })
    .setTimestamp();

  await patchCh.send({ embeds: [embed1] });
  await patchCh.send({ embeds: [embed2] });
  await patchCh.send({ embeds: [embed3] });
  await interaction.editReply({ content: '\u2705 Patch note v5.0 post\u00e9 dans ' + patchCh + ' (3 embeds).' });
}
async function _handlePurge(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const nombre = interaction.options?.getInteger('nombre') || null; const salon = interaction.channel;
  const label = nombre ? `les **${nombre} derniers messages**` : `**tous les messages récents**`;
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🗑️ Confirmer la suppression').setDescription(`Tu vas supprimer ${label} dans **#${salon.name}**.\n\n⚠️ **Cette action est irréversible.**`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`purge_confirm_${salon.id}_${nombre || 'all'}`).setLabel('🗑️ Confirmer la suppression').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('purge_annuler').setLabel('↩️ Annuler').setStyle(ButtonStyle.Secondary))],
  });
}

async function _handleMesContrats(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const uid = interaction.user.id;
  const mesContrats = (db.contrats || []).filter(c => c.userId === uid || c.emetteurId === uid || c.signataireId === uid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!mesContrats.length) return interaction.editReply({ content: '📭 Tu n\'as aucun contrat enregistré.' });
  const statutMap = { en_attente: '🟡 En attente', signe: '✅ Signé', refuse: '❌ Refusé', expire: '📁 Expiré' };
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 Mes contrats — Iron Wolf Company').setDescription(`*${mesContrats.length} contrat(s) trouvé(s).*`);
  for (const c of mesContrats.slice(0, 10)) { const partenaire = c.clientNom || c.employeurNom || '—'; const echeance = c.dateEcheance ? ` · 📅 ${fmtShort(c.dateEcheance)}` : ''; embed.addFields({ name: `${statutMap[c.status] || c.status} — ${c.id}`, value: `📋 ${c.objet}\n🤝 ${partenaire} · 💰 ${c.remuneration || '—'}${echeance}`, inline: false }); }
  if (mesContrats.length > 10) embed.setFooter({ text: `... et ${mesContrats.length - 10} autre(s) • IWC` }); else embed.setFooter({ text: 'IWC • Mes contrats' });
  await interaction.editReply({ embeds: [embed] });
}

async function _handleAide(interaction) {
  const member = interaction.member; const isDir = isDirection(member); const isIll = member.roles.cache.has(ROLE_POLE_ILLEGAL); const isLeg = member.roles.cache.has(ROLE_POLE_LEGAL);
  const isFleau = member.roles.cache.some(r => ['Fléau','Fleau','Concepteur','Fondateur'].some(n => r.name.toLowerCase().includes(n.toLowerCase())));
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📖 Guide des commandes — IWC');
  embed.addFields({ name: '👤 Profil & Info', value: '`/profil` · `/hierarchie` · `/registre` · `/fiche`', inline: false });
  embed.addFields({ name: '📅 RDV & Agenda', value: '`/rdv` — Créer un RDV\n`/agenda creer` — RDV rapide\n`/agenda voir` — Prochains RDV', inline: false });
  embed.addFields({ name: '🟡 Absences', value: '`/absent [durée]` · `/retour` · `/avertissements`', inline: false });
  embed.addFields({ name: '📜 Contrats', value: '`/contrats` — Tes contrats en cours', inline: false });
  if (isLeg || isDir) embed.addFields({ name: '⚖️ Pôle Légal', value: '`/solde` · `/stats` · `/ops` · `/op`', inline: false });
  if (isIll || isDir) embed.addFields({ name: '🔒 Confrérie', value: '`/solde` · `/stats` · `/ops`', inline: false });
  if (isDir) embed.addFields({ name: '🎖️ Direction', value: '`/promo` · `/retro` · `/grade-set` · `/avertir` · `/annuler-absence`\n`/dashboard` · `/bilan` · `/contrats-archives` · `/rapport`\n`/purge` · `/sync` · `/version`', inline: false });
  if (isFleau) embed.addFields({ name: '💀 Fléau & Concepteur', value: '`/op-programmer` · `/patch` · ⚙️ config coffre', inline: false });
  embed.addFields({ name: '🤖 Automatismes', value: 'Trésorerie · Fiches · Identité IC · Plans · Rappels RDV · Absences auto', inline: false });
  embed.setFooter({ text: 'IWC Bot • Commandes adaptées à ton rôle' });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function _handleSetupServeur(interaction) {
  if (!isFondateurOuFleau(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au Fondateur uniquement.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const me = guild.members.me;
  await interaction.editReply({ content: '⏳ Réorganisation en cours... (~60 secondes)' });

  // ── IDs des rôles ──
  const EVERYONE  = guild.roles.everyone.id;
  const VISITEUR  = '1508756369258578070';
  const R_LEGAL   = '1509251285264761053';
  const R_ILLEG   = '1508898841993281658';
  const R_ABSENT  = '1511134028474876035';
  const BOT_ROLE  = me.roles.cache.find(r => r.managed)?.id;
  const DIR_ROLES = guild.roles.cache
    .filter(r => ['Concepteur','Fléau','Fondateur','Directeur','Officier','Co-Directeur'].some(n => r.name.includes(n)))
    .map(r => r.id);

  // Permission bot
  const bot = BOT_ROLE ? [{ id: BOT_ROLE, allow: ['ViewChannel','SendMessages','ManageMessages','EmbedLinks','ReadMessageHistory','AttachFiles','ManageThreads'] }] : [];
  const dir = [...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel','SendMessages','ManageMessages','EmbedLinks','ReadMessageHistory'] })), ...bot];

  // ── Helpers permissions ──
  const p = {
    public:    [{ id: EVERYONE, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...bot],
    visiteurs: [{ id: EVERYONE, deny: ['ViewChannel','SendMessages'] }, { id: VISITEUR, allow: ['ViewChannel','SendMessages'] }, ...bot],
    membres:   [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel','SendMessages'] }, { id: R_ILLEG, allow: ['ViewChannel','SendMessages'] }, ...dir],
    legal:     [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel','SendMessages'] }, ...dir],
    illeg:     [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel','SendMessages'] }, ...dir],
    dir:       [{ id: EVERYONE, deny: ['ViewChannel'] }, ...dir],
    absLegal:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel','SendMessages'] }, { id: R_ABSENT, allow: ['ViewChannel','SendMessages'] }, ...dir],
    absIlleg:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel','SendMessages'] }, { id: R_ABSENT, allow: ['ViewChannel','SendMessages'] }, ...dir],
    legalRO:   [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...dir],
    illegRO:   [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...dir],
    membresRO: [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'], deny: ['SendMessages'] }, { id: R_ILLEG, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...dir],
    catPublic: [{ id: EVERYONE, allow: ['ViewChannel'] }],
    catVisit:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: VISITEUR, allow: ['ViewChannel'] }],
    catMembres:[{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
    catLegal:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
    catIlleg:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
    catDir:    [{ id: EVERYONE, deny: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
  };

  // ── Structure complète ──
  const STRUCTURE = [
    { name: '📢 GÉNÉRAL', catPerms: p.catPublic, channels: [
      { name: '📣・annonces',    type: 0, perms: p.public,    id: null },
      { name: '📜・règlement',   type: 0, perms: p.public,    id: null },
      { name: '👋・arrivée',     type: 0, perms: p.membresRO, id: null },
      { name: '📅・événements',  type: 0, perms: p.public,    id: null },
    ]},
    { name: '👁️ VISITEURS', catPerms: p.catVisit, channels: [
      { name: '💬・discussion-hrp', type: 0, perms: p.visiteurs, id: null },
      { name: '🔊・attente-vocal',  type: 2, perms: p.visiteurs, id: null },
    ]},
    { name: '💬 COMMUNAUTÉ', catPerms: p.catMembres, channels: [
      { name: '💬・discussion-hrp',   type: 0, perms: p.membres, id: null },
      { name: '💬・discussion-rp',    type: 0, perms: p.membres, id: null },
      { name: '💡・suggestion-idée',  type: 0, perms: p.membres, id: null },
      { name: '📸・screenshots',      type: 0, perms: p.membres, id: null },
      { name: '🎬・clips-temps-fort', type: 0, perms: p.membres, id: null },
      { name: '📋・planning',         type: 0, perms: p.membres, id: null },
    ]},
    { name: '⚖️ PÔLE LÉGAL', catPerms: p.catLegal, channels: [
      { name: '🏛️・hierarchie-iron-wolf-company', type: 0, perms: p.legalRO,  id: null },
      { name: '📜・contrats',                      type: 0, perms: p.legal,    id: null },
      { name: '📁・contrats-reponses',             type: 0, perms: p.dir,      id: null },
      { name: '💰・coffre-entreprise',             type: 0, perms: p.dir,      id: null },
      { name: '📅・agenda',                        type: 0, perms: p.legal,    id: null },
      { name: '📖・histoire-iwc',                  type: 0, perms: p.legalRO,  id: null },
      { name: '🟡・absences',                      type: 0, perms: p.absLegal, id: SALON_HARDCODED.ABSENCES_LEGAL },
      { name: '💬・parlote',                       type: 0, perms: p.legal,    id: null },
      { name: '💬・parlote-hrp',                   type: 0, perms: p.legal,    id: null },
      { name: '🎓・formation',                     type: 0, perms: p.legal,    id: null },
      { name: '🔊・Salon vocal — Légal',            type: 2, perms: p.legal,    id: null },
    ]},
    { name: '🔪 PÔLE ILLÉGAL', catPerms: p.catIlleg, channels: [
      { name: '💀・hierarchie-ombre',        type: 0, perms: p.illegRO,  id: null },
      { name: '📣・annonces-illégal',        type: 0, perms: p.illegRO,  id: null },
      { name: '📜・règlement-illégal',       type: 0, perms: p.illegRO,  id: null },
      { name: '🎖️・grade',                   type: 0, perms: p.illegRO,  id: null },
      { name: '✏️・surnom-pseudo',            type: 0, perms: p.illeg,    id: null },
      { name: '🔒・coffre-illegal',          type: 0, perms: p.dir,      id: null },
      { name: '📅・agenda-illégal',          type: 0, perms: p.illeg,    id: null },
      { name: '📖・histoire-de-la-confrérie',type: 0, perms: p.illegRO,  id: null },
      { name: '🎯・operations',              type: 0, perms: p.illeg,    id: null },
      { name: '🕵️・informateurs',            type: 0, perms: p.dir,      id: null },
      { name: '🗺️・plans',                   type: 0, perms: p.illeg,    id: null },
      { name: '🟡・absences',               type: 0, perms: p.absIlleg, id: SALON_HARDCODED.ABSENCES_ILLEGAL },
      { name: '💬・parlote-ombre',           type: 0, perms: p.illeg,    id: null },
      { name: '💬・parlote-hrp-ombre',       type: 0, perms: p.illeg,    id: null },
      { name: '🔊・Opérations — vocal',      type: 2, perms: p.illeg,    id: null },
    ]},
    { name: '🔒 DIRECTION LÉGAL', catPerms: p.catDir, channels: [
      { name: '⚔️・affaires',            type: 0, perms: p.dir, id: null },
      { name: '👥・backgrounds-membres', type: 0, perms: p.dir, id: null },
      { name: '📁・dossier-recrutement', type: 0, perms: p.dir, id: null },
      { name: '📋・recrutement-interne', type: 0, perms: p.dir, id: null },
      { name: '🔊・Conseil vocal Légal', type: 2, perms: p.dir, id: null },
    ]},
    { name: '🔒 DIRECTION ILLÉGAL', catPerms: p.catDir, channels: [
      { name: '⚔️・affaires',              type: 0, perms: p.dir, id: null },
      { name: '👥・backgrounds-membres',   type: 0, perms: p.dir, id: null },
      { name: '📁・dossier-recrutement',   type: 0, perms: p.dir, id: null },
      { name: '📋・recrutement-interne',   type: 0, perms: p.dir, id: null },
      { name: '🔊・Conseil vocal Illégal', type: 2, perms: p.dir, id: null },
    ]},
    { name: '🎭 ROLEPLAY HRP', catPerms: p.catMembres, channels: [
      { name: '🧑・fiches-personnages',         type: 0, perms: p.membres,   id: null },
      { name: '📖・journal-de-bord',            type: 0, perms: p.dir,       id: SALON_HARDCODED.JOURNAL_DE_BORD },
      { name: '🌍・lore-et-univers',            type: 0, perms: p.membresRO, id: null },
      { name: '⌨️・commandes-slash',            type: 0, perms: p.membres,   id: null },
      { name: '💬・conversation-direction-hrp', type: 0, perms: p.dir,       id: null },
    ]},
    { name: '🔧 BOT', catPerms: p.catDir, channels: [
      { name: '🔇・patch-note', type: 0, perms: p.dir, id: null },
      { name: '📊・logs',       type: 0, perms: p.dir, id: null },
    ]},
  ];

  const clean = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  let created = 0, moved = 0, permsOk = 0, errors = 0;

  for (const catDef of STRUCTURE) {
    try {
      // Trouver ou créer la catégorie
      const catClean = clean(catDef.name.replace(/[^a-z\s]/gi,'').trim());
      let category = guild.channels.cache.find(c =>
        c.type === 4 && clean(c.name).includes(catClean.slice(2))
      );
      if (!category) {
        category = await guild.channels.create({
          name: catDef.name, type: 4,
          permissionOverwrites: catDef.catPerms,
        });
        created++;
      } else {
        await category.permissionOverwrites.set(catDef.catPerms).catch(() => {});
        permsOk++;
      }

      for (const chDef of catDef.channels) {
        await new Promise(r => setTimeout(r, 300));
        try {
          // Trouver le salon : par ID hardcodé en priorité, sinon par nom
          let salon = null;
          if (chDef.id) {
            salon = guild.channels.cache.get(chDef.id);
          }
          if (!salon) {
            const chClean = clean(chDef.name.replace(/[^a-z0-9\s]/gi,'').trim());
            salon = guild.channels.cache.find(c =>
              c.type !== 4 &&
              clean(c.name).includes(chClean.slice(0, Math.min(chClean.length, 12))) &&
              !chDef.name.toLowerCase().includes('illegal') === !c.name.toLowerCase().includes('illegal')
            );
          }

          if (salon) {
            // Déplacer + appliquer permissions
            if (salon.parentId !== category.id) {
              await salon.setParent(category.id, { lockPermissions: false }).catch(() => {});
              moved++;
            }
            await salon.permissionOverwrites.set(chDef.perms).catch(() => {});
            permsOk++;
          } else {
            // Créer le salon
            await guild.channels.create({
              name: chDef.name,
              type: chDef.type,
              parent: category.id,
              permissionOverwrites: chDef.perms,
            });
            created++;
          }
        } catch(e) { errors++; console.log(`❌ Salon ${chDef.name}:`, e.message); }
      }
    } catch(e) { errors++; console.log(`❌ Catégorie ${catDef.name}:`, e.message); }
  }

  const result = `✅ Réorganisation terminée\n\n→ **${created}** créés\n→ **${moved}** déplacés\n→ **${permsOk}** permissions appliquées\n→ **${errors}** erreurs`;
  await interaction.editReply({ content: result });

  const jCh = guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD);
  if (jCh) await jCh.send({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🔧 Réorganisation serveur effectuée')
    .setDescription(`Par **${interaction.user.username}** · ${created} créés · ${moved} déplacés · ${permsOk} permissions · ${errors} erreurs`)
    .setTimestamp()] }).catch(() => {});
}


async function setupPanelDirection(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && (clean(c.name).includes('direction') && (clean(c.name).includes('5') || clean(c.name).includes('nous')))) || guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes('directionnous'));
    if (!ch) return;
    const db = loadDB();
    const msgs = await ch.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id && m.components?.length > 0) await m.delete().catch(() => {}); }
    const embed = _buildDirectionPanelEmbed(guild, db); const row = _buildDirectionPanelRow();
    const sent = await ch.send({ embeds: [embed], components: [row] });
    db.directionPanelMsgId = sent.id; db.directionPanelChanId = ch.id; saveDB(db);
    console.log('✅ Panel Direction posté');
  } catch(e) { console.log('❌ setupPanelDirection error:', e.message); }
}

function _buildDirectionPanelEmbed(guild, db) {
  const membres = Object.values(db.members || {}); const cands = (db.candidatures || []).filter(c => c.status === 'reçue'); const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours'); const opsProg = (db.operations || []).filter(o => o.status === 'programmee'); const absents = membres.filter(m => m.status === 'absent');
  const contrats3j = (db.contrats || []).filter(c => { if (c.status !== 'signe' || !c.dateEcheance) return false; const j = Math.floor((new Date(c.dateEcheance) - new Date()) / 86400000); return j >= 0 && j <= 3; });
  const legal = db.coffres?.legal || 0; const illeg = db.coffres?.illegal || 0;
  const ligne = (emoji, label, val, urgent) => `${urgent && val > 0 ? '🔴' : '🟢'} ${emoji} **${label}** — ${val}`;
  return new EmbedBuilder().setColor(0x8B1A1A).setAuthor({ name: 'IWC Setup • Panel Direction', iconURL: guild.iconURL() || undefined }).setTitle('🐺 Tableau de bord — Iron Wolf Company')
    .addFields({ name: '📋 RECRUTEMENT', value: ligne('📥', 'Candidatures en attente', cands.length, true), inline: true }, { name: '🎯 OPÉRATIONS', value: [ligne('🟢', 'En cours', opsEnCours.length, false), ligne('🕐', 'Programmées', opsProg.length, false)].join('\n'), inline: true }, { name: '💰 TRÉSORERIE', value: [`⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${illeg.toLocaleString('fr-FR')}**`].join('\n'), inline: true }, { name: '👥 MEMBRES', value: [ligne('⚠️', 'Absents', absents.length, false), ligne('📜', 'Contrats expirent ≤3j', contrats3j.length, true)].join('\n'), inline: true })
    .setFooter({ text: `IWC • Panel Direction • MàJ ${new Date().toLocaleString('fr-FR')}` }).setTimestamp();
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
    const db = loadDB(); if (!db.directionPanelMsgId || !db.directionPanelChanId) { await setupPanelDirection(guild); return; }
    const ch = guild.channels.cache.get(db.directionPanelChanId); const msg = await ch?.messages.fetch(db.directionPanelMsgId).catch(() => null);
    if (!msg) { await setupPanelDirection(guild); return; }
    await msg.edit({ embeds: [_buildDirectionPanelEmbed(guild, db)], components: [_buildDirectionPanelRow()] });
  } catch(e) { console.log('❌ updateDirectionPanel:', e.message); }
}

async function setupCommandesSlash(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean('commandes-slash')));
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const botMsgs = msgs.filter(m => m.author.id === guild.members.me?.id && m.embeds.length > 0);
    if (botMsgs.size >= 4) { console.log('✅ #commandes-slash déjà à jour — skip'); return; }
    for (const [, m] of botMsgs) await m.delete().catch(() => {});
    const e1 = new EmbedBuilder().setColor(0x3B82F6).setTitle('📖 COMMANDES — Membres').setDescription('*Commandes accessibles à tous les membres IWC.*').addFields({ name: '👤 Profil & Identité', value: '`/profil` · `/fiche` · `/hierarchie` · `/registre`', inline: false }, { name: '📅 Agenda & RDV', value: '`/rdv` · `/agenda creer` · `/agenda voir`', inline: false }, { name: '🟡 Absences', value: '`/absent [durée]` · `/retour` · `/avertissements`', inline: false }, { name: '📜 Contrats', value: '`/contrats` — Tes contrats en cours', inline: false }, { name: '📊 Stats & Info', value: '`/stats` · `/solde` · `/journal` · `/aide`', inline: false }).setFooter({ text: 'IWC Bot • Commandes membres' });
    const e2 = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🎖️ COMMANDES — Direction').setDescription('*Réservées à la Direction.*').addFields({ name: '⚙️ Gestion membres', value: '`/promo` · `/retro` · `/grade-set` · `/avertir` · `/annuler-absence`', inline: false }, { name: '💰 Trésorerie', value: '`/bilan` · `/contrats-archives` · ⚙️ dans coffre-entreprise', inline: false }, { name: '🎯 Opérations', value: '`/op-programmer` — Lancement automatique', inline: false }, { name: '📊 Rapports', value: '`/dashboard` · `/rapport` · `/stats`', inline: false }, { name: '🛠️ Administration', value: '`/purge` · `/sync` · `/version`', inline: false }).setFooter({ text: 'IWC Bot • Commandes Direction' });
    const e3 = new EmbedBuilder().setColor(0xED4245).setTitle('💀 COMMANDES — Fléau & Concepteur').addFields({ name: '⚙️ Configuration', value: '`/op-programmer` · `/patch` · `/rapport` (auto vendredi 20h)', inline: false }).setFooter({ text: 'IWC Bot • Fléau & Concepteur' });
    const e4 = new EmbedBuilder().setColor(0x555555).setTitle('🤖 AUTOMATISMES — Le bot fait ça tout seul').addFields({ name: '📖 Journal de bord', value: 'Ops, contrats, promos, recrutements → **#journal-de-bord** auto\nRésumé hebdo chaque lundi à 9h', inline: false }, { name: '💰 Trésorerie', value: 'Bouton 💰 → validation Direction si > limite', inline: false }, { name: '🟡 Absences', value: 'Rôle Absent → permissions bloquées → levée auto + DM', inline: false }, { name: '⏰ Rappels', value: 'Rappels 24h + 1h avant RDV Notion · Rappel 30min avant op', inline: false }, { name: '🎭 Identité IC', value: 'Bouton ✏️ dans #surnom-pseudo → Notion auto', inline: false }).setFooter({ text: 'IWC Bot • Automatismes' });
    await ch.send({ embeds: [e1] }); await ch.send({ embeds: [e2] }); await ch.send({ embeds: [e3] }); await ch.send({ embeds: [e4] });
    console.log('✅ Commandes slash postées');
  } catch(e) { console.log('❌ setupCommandesSlash error:', e.message); }
}

// [CORRECTION] setupSurnomFormat — skip si panel avec bouton déjà présent
async function setupSurnomFormat(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && (clean(c.name).includes('surnompseudo') || clean(c.name).includes('surnom')));
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.components?.length > 0 && m.embeds[0]?.title?.includes('IDENTITÉ'));
    if (existing) { console.log('✅ Panel surnom-pseudo déjà présent — skip'); return; }
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🎭 IDENTITÉ IC — Iron Wolf Company').setDescription(['*Renseignez votre identité In Character pour faciliter les interactions RP.*', '*Notion et le Registre des Membres sont mis à jour automatiquement.*', '', '**Cliquez le bouton ci-dessous pour renseigner votre identité.**', '*Un formulaire s\'ouvre avec les champs à remplir.*'].join('\n')).setFooter({ text: 'IWC • Identité IC • Mis à jour automatiquement dans Notion' })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_surnom_ouvrir').setLabel('✏️ Renseigner mon identité IC').setStyle(ButtonStyle.Primary))],
    });
    console.log('✅ Panel surnom-pseudo posté');
  } catch(e) { console.log('❌ setupSurnomFormat error:', e.message); }
}

async function _ouvrirModalAgendaSimple(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau RDV — IWC').setDescription('**Étape 1/2** — Choisis le lieu du rendez-vous')],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('agenda_lieu_select').setPlaceholder('Choisir un lieu...').addOptions([
      { label: 'Saint Denis', value: 'Saint Denis', description: 'La grande ville du sud' },
      { label: 'Valentine', value: 'Valentine', description: 'Ville du nord-ouest' },
      { label: 'Armadillo', value: 'Armadillo', description: 'Ville désertique du sud' },
      { label: 'Annesburg', value: 'Annesburg', description: 'Ville minière du nord-est' },
      { label: 'Strawberry', value: 'Strawberry', description: 'Ville des montagnes' },
      { label: 'Emerald Ranch', value: 'Emerald Ranch', description: 'Ranch a l\'est' },
      { label: 'Tumbleweed', value: 'Tumbleweed', description: 'Ville fantôme du désert' },
      { label: 'Lagras', value: 'Lagras', description: 'Village des marais' },
      { label: 'Flatneck Station', value: 'Flatneck Station', description: 'Station ferroviaire' },
      { label: 'Roanoke Ridge', value: 'Roanoke Ridge', description: 'Région sauvage du nord' },
      { label: 'Tall Trees', value: 'Tall Trees', description: 'Foret de l\'ouest' },
      { label: 'Rhodes', value: 'Rhodes', description: 'Ville du comté de Lemoyne' },
      { label: 'Blackwater', value: 'Blackwater', description: 'Ville moderne de West Elizabeth' },
      { label: 'Thieves Landing', value: 'Thieves Landing', description: 'Port des hors-la-loi' },
      { label: 'Autre lieu', value: 'Autre', description: 'Lieu personnalisé à préciser' },
    ]))],
  });
}

async function _handleAgendaLieuSelect(interaction) {
  const lieu = interaction.values[0];
  const lieuEnc = encodeURIComponent(lieu);
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau RDV — IWC').setDescription(`**📍 Lieu sélectionné : ${lieu}**\n\nClique sur le bouton ci-dessous pour remplir les détails du RDV.`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_rdv_modal_${lieuEnc}`).setLabel('📝 Remplir les détails du RDV').setStyle(ButtonStyle.Primary))],
  });
}

// [CORRECTION] _handleRdvModalBtn — était dans isStringSelectMenu, maintenant dans isButton
async function _handleRdvModalBtn(interaction) {
  const lieu = decodeURIComponent(interaction.customId.replace('btn_rdv_modal_', ''));
  const modal = new ModalBuilder().setCustomId(`modal_agenda_simple_${encodeURIComponent(lieu)}`).setTitle(`📅 RDV — ${lieu === 'Autre' ? 'Lieu personnalisé' : lieu}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre du RDV').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Réunion Direction, Entretien...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu_detail').setLabel(lieu === 'Autre' ? 'Lieu précis' : `Détail du lieu (optionnel)`).setStyle(TextInputStyle.Short).setRequired(lieu === 'Autre').setValue(lieu !== 'Autre' ? lieu : '').setPlaceholder(`Ex: Mairie de ${lieu}...`)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes / Ordre du jour (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('Points à aborder, informations importantes...')),
  );
  await interaction.showModal(modal);
}

// [CORRECTION] _validerModalAgendaSimple — collecteurs corrects + photo optionnelle

// Map clés internes → libellés exacts Notion (colonne Taper/Type)
const RDV_TYPE_NOTION_MAP = {
  'reunion_direction':  '👑 Direction de la réunion',
  'rdv_client':         '🤝 Rendez-vous Client',
  'briefing_op':        '🎯 Opération de briefing',
  'debrief_op':         '📊 Opération de débriefing',
  'entretien_recru':    '🎯 Entretien Recrutement',
  'reunion_legal':      '⚖️ Pôle de réunion légal',
  'reunion_confrerie':  '🔒 Réunion Confrérie',
  'formation':          '🎓 Membres de la formation',
  'negociation':        '🤝 Négociation',
  'rdv_medical':        '🏥 Rendez-vous Médical',
  'rdv_juridique':      '⚖️ Rendez-vous Juridique',
  'autre':              '📋 Autre',
  'RDV':                '📋 Autre',
  'Convocation individuelle': '📋 Autre',
};

const RDV_VILLE_NOTION_MAP = {
  'Saint Denis':      '🏛️ Saint Denis',
  'Valentine':        '🤠 Valentin',
  'Armadillo':        '🌿 Tatou',
  'Annesburg':        '⛏️ Annesburg',
  'Strawberry':       '🍓 Fraise',
  'Emerald Ranch':    '🐃 Emerald Ranch',
  'Tumbleweed':       '🌵 Tumbleweed',
  'Lagras':           '🐊 Lagras',
  'Flatneck Station': '🚂 Gare de Flatneck',
  'Roanoke Ridge':    '🏔️ Crête de Roanoke',
  'Tall Trees':       '🌲 Grands arbres',
  'Rhodes':           '🐎 Rhodes',
  'Blackwater':       '🌆 Blackwater',
  'Thieves Landing':  '🔥 Le Débarquement des Voleurs',
  'Autre':            '❗ Autre lieu',
};

const RDV_MODE_NOTION_MAP = {
  'role':        '📢 Par rôle - tout le pôle',
  'individuel':  '👤 Par nom IC individuel',
};

async function _validerModalAgendaSimple(interaction) {
  console.log('🔵 RDV STEP 5b - _validerModalAgendaSimple appelé');
  await interaction.deferReply({ ephemeral: false });
  const titre      = interaction.fields.getTextInputValue('titre');
  const dateRaw    = interaction.fields.getTextInputValue('date');
  const heure      = interaction.fields.getTextInputValue('heure');
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim() || '';
  const lieuVille  = interaction.customId.replace('modal_agenda_simple_', '').replace('modal_agenda_simple', '');
  const lieu       = lieuDetail || (lieuVille ? decodeURIComponent(lieuVille) : '—');
  const notes      = interaction.fields.getTextInputValue('notes') || '';
  let dateISO = null;
  try { const p = dateRaw.split('/'); if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });
  const db = loadDB();
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);
  const skipId = `rdv_skip_photo_${interaction.id}`;
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📸 Photo de repérage — optionnelle').setDescription(`**📅 ${titre}** — ${heure} à ${lieu}\n\n**Option 1 :** Envoie une capture d\'écran du lieu dans ce salon\n**Option 2 :** Clique **Ignorer** pour poster le RDV sans photo\n\n*Tu as 2 minutes.*`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(skipId).setLabel('⏭️ Ignorer la photo').setStyle(ButtonStyle.Secondary))],
  });
  let photoUrl = null;
  try {
    const photoFilter = m => m.author.id === interaction.user.id && m.attachments.size > 0 && m.channel.id === interaction.channel.id;
    const btnFilter   = i => i.user.id === interaction.user.id && i.customId === skipId;
    await new Promise((resolve) => {
      const msgCollector = interaction.channel.createMessageCollector({ filter: photoFilter, max: 1, time: 120000 });
      const btnCollector = interaction.channel.createMessageComponentCollector({ filter: btnFilter, max: 1, time: 120000 });
      msgCollector.on('collect', async msg => { photoUrl = msg.attachments.first().url; await msg.delete().catch(() => {}); btnCollector.stop('photo'); resolve(); });
      btnCollector.on('collect', async i => { await i.deferUpdate().catch(() => {}); msgCollector.stop('skip'); resolve(); });
      msgCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
      btnCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
    });
  } catch {}
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📅 ${titre.toUpperCase()}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — AVIS DE RENDEZ-VOUS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields({ name: '🆔 Référence', value: '`' + rdvId + '`', inline: true }, { name: '📅 Date', value: dateCapital, inline: true }, { name: '🕐 Heure', value: `**${heure}**`, inline: true }, { name: '📍 Lieu', value: lieu, inline: true }, { name: '✍️ Créé par', value: emetteurIC, inline: true });
  if (notes) embed.addFields({ name: '📋 Notes', value: notes });
  if (photoUrl) embed.setImage(photoUrl);
  embed.setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();
  // Poster dans le bon salon selon le pôle du membre
  const isIlleg = interaction.member?.roles?.cache?.has(ROLE_POLE_ILLEGAL);
  const poleLabel = isIlleg ? '🔒 Illégal' : '⚖️ Légal';
  const pingRole  = isIlleg ? `<@&${ROLE_POLE_ILLEGAL}>` : `<@&${ROLE_POLE_LEGAL}>`;
  let agendaCh;
  if (isIlleg) {
    agendaCh = interaction.guild.channels.cache.get(SALON_HARDCODED.AGENDA_ILLEGAL)
      || getChById(interaction.guild, 'AGENDA_ILLEGAL', 'agenda-illegal', 'agenda-illégal');
  } else {
    agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  }
  if (agendaCh) await agendaCh.send({ content: `${pingRole} — 📅 **${titre}** · ${heure} à ${lieu}`, embeds: [embed], allowedMentions: { parse: [], roles: [isIlleg ? ROLE_POLE_ILLEGAL : ROLE_POLE_LEGAL] } }).catch(() => {});
  const salonLabel = isIlleg ? '#agenda-illégal' : '#agenda';
  const confirmMsg = await interaction.editReply({ content: photoUrl ? '✅ RDV créé avec photo de repérage !' : `✅ RDV créé et posté dans ${salonLabel} !`, embeds: [], components: [] });
  // Supprimer le message intermédiaire "Nouveau RDV — Étape 1/2" dans #contrats
  try {
    const ch = interaction.channel;
    const msgs = await ch.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id === interaction.client.user.id &&
          (m.embeds[0]?.title?.includes('Nouveau RDV') || m.embeds[0]?.description?.includes('Étape'))) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: {
      'Titre':    { title:     [{ text: { content: titre } }] },
      'Date':     { date:      { start: dateISO } },
      'Lieu':             { rich_text: [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':           { select:    { name: 'Planifié' } },
      'Type':             { select:    { name: RDV_TYPE_NOTION_MAP['RDV'] || '📋 Autre' } },
      'Pôle':             { select:    { name: isIlleg ? '🔒 Illégal' : '⚖️ Légal' } },
      'Mode de convocation': { select: { name: RDV_MODE_NOTION_MAP['role'] } },
      'Villes RDR2':      { select:    { name: RDV_VILLE_NOTION_MAP[lieuNotionKey] || RDV_VILLE_NOTION_MAP['Autre'] } },
      ...(photoUrl ? { 'Photo': { files: [{ name: 'reperage.jpg', type: 'external', external: { url: photoUrl } }] } } : {}),
    } }) }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) console.log(`✅ RDV archivé Notion : ${titre}`);
      else console.log(`❌ Notion RDV erreur complet:`, JSON.stringify(data).slice(0, 500));
    }).catch(e => console.log('❌ Notion RDV error:', e.message));
  }
}

async function _ouvrirMenuRdvSlash(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau RDV — Iron Wolf Company').setDescription('**Étape 1/2** — Choisis le lieu du rendez-vous')],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('agenda_lieu_select').setPlaceholder('📍 Choisir un lieu RDR2...').addOptions([
      { label: '🏛 Saint Denis', value: 'Saint Denis', description: 'La grande ville du Sud' },
      { label: '🤠 Valentine', value: 'Valentine', description: 'Ville du Nord' },
      { label: '🌵 Armadillo', value: 'Armadillo', description: 'Village du désert' },
      { label: '⛏ Annesburg', value: 'Annesburg', description: 'Ville minière du Nord-Est' },
      { label: '🏔 Strawberry', value: 'Strawberry', description: 'Ville de montagne' },
      { label: '🌾 Emerald Ranch', value: 'Emerald Ranch', description: 'Ranch du Heartlands' },
      { label: '🏜 Tumbleweed', value: 'Tumbleweed', description: 'Ville fantôme de Gaptooth' },
      { label: '🌊 Lagras', value: 'Lagras', description: 'Village des marais' },
      { label: '🏕 Flatneck Station', value: 'Flatneck Station', description: 'Station du Heartlands' },
      { label: '🏞 Roanoke Ridge', value: 'Roanoke Ridge', description: 'Region sauvage du Nord' },
      { label: '🗻 Tall Trees', value: 'Tall Trees', description: 'Foret de West Elizabeth' },
      { label: '🏘 Rhodes', value: 'Rhodes', description: 'Ville du Lemoyne' },
      { label: '🌁 Blackwater', value: 'Blackwater', description: 'Ville moderne du Sud' },
      { label: '⛪ Thieves Landing', value: 'Thieves Landing', description: 'Port du Flat Iron Lake' },
      { label: '📍 Autre lieu', value: 'Autre', description: 'Preciser le lieu manuellement' },
    ]))],
  });
}

async function _ouvrirMenuRdv(interaction) {
  console.log('🔵 RDV STEP 1 - _ouvrirMenuRdv appelé');
  const msgId = interaction.customId ? interaction.customId.replace('btn_rdv_creer_', '') : interaction.id;
  const options = [
    { label: '👑 Reunion Direction', value: 'reunion_direction', description: 'Réunion interne Direction' },
    { label: '🤝 Rendez-vous Client', value: 'rdv_client', description: 'RDV avec un client externe' },
    { label: '🎯 Briefing Operation', value: 'briefing_op', description: 'Brief avant une opération' },
    { label: '📊 Debrief Operation', value: 'debrief_op', description: 'Retour après opération' },
    { label: '🔍 Entretien Recrutement', value: 'entretien_recru', description: 'Entretien candidat' },
    { label: '⚖ Reunion Pole Legal', value: 'reunion_legal', description: 'Réunion Iron Wolf Company' },
    { label: '🔒 Reunion Confrerie', value: 'reunion_confrerie', description: 'Réunion La Confrérie' },
    { label: '🎓 Formation Membres', value: 'formation', description: 'Session de formation' },
    { label: '🤝 Negociation', value: 'negociation', description: 'Négociation commerciale' },
    { label: '🏥 Rendez-vous Medical', value: 'rdv_medical', description: 'Consultation médicale IC' },
    { label: '📋 Rendez-vous Juridique', value: 'rdv_juridique', description: 'Consultation juridique IC' },
    { label: '📝 Autre', value: 'autre', description: 'Autre type de rendez-vous' },
  ];
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 1/2** — Sélectionne le type de rendez-vous.')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rdv_type_select_${msgId}`)
        .setPlaceholder('Type de rendez-vous...')
        .addOptions(options)
    )],
  });
}

async function _handleRdvTypeSelect(interaction) {
  console.log('🔵 RDV STEP 2 - _handleRdvTypeSelect, typeRdv:', interaction.values[0]);
  await interaction.deferUpdate();
  const typeRdv = interaction.values[0];
  const msgId = interaction.customId.replace('rdv_type_select_', '');
  return interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 2/3** — Comment convoquer ?')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rdv_mode_select_${typeRdv}_${msgId}`)
        .setPlaceholder('Mode de convocation...')
        .addOptions([
          { label: '📢 Par role - tout le pole', value: 'role', description: 'Convoque tout le pôle légal ou illégal' },
          { label: '👤 Par nom IC individuel', value: 'individuel', description: 'Sélectionne des membres spécifiques' },
        ])
    )],
  });
}

async function _handleRdvModeSelect(interaction) {
  console.log('🔵 RDV STEP 3 - _handleRdvModeSelect, mode:', interaction.values[0]);
  await interaction.deferUpdate();
  const mode = interaction.values[0]; const allParts = interaction.customId.replace('rdv_mode_select_', '').split('_'); const typeRdv = allParts.slice(0, -1).join('_'); const msgId = allParts[allParts.length - 1];
  if (mode === 'role') {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 3/3** — Quel groupe convoquer ?')],
      components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rdv_pole_select_${typeRdv}_${msgId}`).setPlaceholder('Choisir le groupe...').addOptions([
        { label: '⚖ Pole Legal Iron Wolf', value: 'legal', description: 'Convoque tout le pôle légal' },
        { label: '🔒 La Confrerie', value: 'illegal', description: 'Convoque tout le pôle illégal' },
        { label: '👥 Tout le monde', value: 'tous', description: 'Convoque les deux pôles' },
        { label: '👑 Direction seule', value: 'direction', description: 'Convoque la Direction uniquement' },
      ]))],
    });
  } else {
    const db = loadDB();
    const membres = Object.entries(db.members || {})
      .filter(([, m]) => m.name && m.status !== 'parti')
      .map(([id, m]) => ({
        label: String(m.name || m.username || id).slice(0, 100),
        value: String(id).slice(0, 100),
        description: m.username ? String(m.username).slice(0, 100) : undefined,
      }))
      .filter(o => o.label.length > 0 && o.value.length > 0)
      .slice(0, 25);
    if (!membres.length) { await interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Aucun membre IC enregistré')], components: [] }); return; }
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 3/3** — Sélectionne les participants (max 25)')],
      components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rdv_individuel_select_${typeRdv}_${msgId}`).setPlaceholder('Choisir les participants...').setMinValues(1).setMaxValues(Math.min(membres.length, 25)).addOptions(membres))],
    });
  }
}

async function _handleRdvIndividuelSelect(interaction) {
  console.log('🔵 RDV STEP 3b - _handleRdvIndividuelSelect');
  const selectedIds = interaction.values; const allParts = interaction.customId.replace('rdv_individuel_select_', '').split('_'); const typeRdv = allParts.slice(0, -1).join('_');
  const db = loadDB(); if (!db._rdvPending) db._rdvPending = {}; db._rdvPending[interaction.id] = { type: 'individuel', ids: selectedIds }; saveDB(db);
  const typeLabels = { reunion_direction: 'Réunion Direction', rdv_client: 'Rendez-vous Client', briefing_op: 'Briefing Opération', debrief_op: 'Débrief Opération', entretien_recru: 'Entretien Recrutement', reunion_legal: 'Réunion Pôle Légal', reunion_confrerie: 'Réunion Confrérie', formation: 'Formation Membres', negociation: 'Négociation', rdv_medical: 'Rendez-vous Médical', rdv_juridique: 'Rendez-vous Juridique', autre: 'Autre' };
  const typeLabel = typeLabels[typeRdv] || 'Rendez-vous';
  const modal = new ModalBuilder().setCustomId(`modal_rdv_individuel_${interaction.id}`).setTitle(`📅 ${typeLabel}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre / Objet du RDV').setStyle(TextInputStyle.Short).setRequired(true).setValue(typeLabel).setPlaceholder('Ex: Réunion stratégique...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure de convocation').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Mairie de Saint Denis...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Ordre du jour / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('Points à aborder...')),
  );
  await interaction.showModal(modal);
}

async function _handleRdvPoleSelect(interaction) {
  console.log('🔵 RDV STEP 4 - _handleRdvPoleSelect, pole:', interaction.values[0]);
  const pole = interaction.values[0]; const allParts = interaction.customId.replace('rdv_pole_select_', '').split('_'); const typeRdv = allParts.slice(0, -1).join('_');
  const typeLabels = { reunion_direction: 'Réunion Direction', rdv_client: 'Rendez-vous Client', briefing_op: 'Briefing Opération', debrief_op: 'Débrief Opération', entretien_recru: 'Entretien Recrutement', reunion_legal: 'Réunion Pôle Légal', reunion_confrerie: 'Réunion Confrérie', formation: 'Formation Membres', negociation: 'Négociation', rdv_medical: 'Rendez-vous Médical', rdv_juridique: 'Rendez-vous Juridique', autre: 'Autre' };
  const typeLabel = typeLabels[typeRdv] || 'Rendez-vous';
  const modal = new ModalBuilder().setCustomId(`modal_rdv_${pole}_${typeRdv}`).setTitle(`📅 ${typeLabel}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre / Objet du RDV').setStyle(TextInputStyle.Short).setRequired(true).setValue(typeLabel).setPlaceholder('Ex: Réunion stratégique...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure de convocation').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu de rendez-vous').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Mairie de Saint Denis...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Ordre du jour / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('Points à aborder...')),
  );
  await interaction.showModal(modal);
}

async function _validerModalRdvIndividuel(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const pendingId = interaction.customId.replace('modal_rdv_individuel_', '');
  const pending = db._rdvPending?.[pendingId]; if (!pending) return interaction.editReply({ content: '❌ Session expirée. Recommence avec /rdv.' });
  const titre = interaction.fields.getTextInputValue('titre'); const dateRaw = interaction.fields.getTextInputValue('date'); const heure = interaction.fields.getTextInputValue('heure'); const lieu = interaction.fields.getTextInputValue('lieu') || '—'; const notes = interaction.fields.getTextInputValue('notes') || '';
  let dateISO = null; try { const p = dateRaw.split('/'); if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);
  const participants = pending.ids.map(id => db.members[id]?.name || id);
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📅 ${titre.toUpperCase()}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — CONVOCATION PRIVÉE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields({ name: '🆔 Référence', value: '`' + rdvId + '`', inline: true }, { name: '📅 Date', value: dateCapital, inline: true }, { name: '🕐 Heure', value: `**${heure}**`, inline: true }, { name: '📍 Lieu', value: lieu, inline: true }, { name: '✍️ Convoqué par', value: emetteurIC, inline: true }, { name: `👥 Participants (${participants.length})`, value: participants.join(', ') || '—' })
    .setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();
  if (notes) embed.addFields({ name: '📋 Ordre du jour', value: notes });
  // Détecter le pôle de l'émetteur pour poster dans le bon salon
  const emetteurPole = db.members[interaction.user.id]?.pole || 'legal';
  let agendaCh;
  if (emetteurPole === 'illegal') {
    agendaCh = interaction.guild.channels.cache.get(SALON_HARDCODED.AGENDA_ILLEGAL)
      || getChById(interaction.guild, 'AGENDA_ILLEGAL', 'agenda-illegal', 'agenda-illégal');
  } else {
    agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  }
  const mentionsMembres = pending.ids.map(id => `<@${id}>`).join(' ');
  if (agendaCh) await agendaCh.send({ content: `${mentionsMembres} — 📅 Convocation : **${titre}** · ${heure} à ${lieu}`, embeds: [embed] }).catch(() => {});
  for (const uid of pending.ids) { await envoyerDMRecap(interaction.guild, uid, 'rdv', { titre, date: dateCapital, heure, lieu, notes }).catch(() => {}); }
  delete db._rdvPending[pendingId]; saveDB(db);
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: {
      'Titre':        { title:        [{ text: { content: titre } }] },
      'Date':         { date:         { start: dateISO } },
      'Lieu':             { rich_text:    [{ text: { content: lieu !== '—' ? lieu : '' } }] },
      'Lieu':             { rich_text:    [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':           { select:       { name: 'Planifié' } },
      'Type':             { select:       { name: RDV_TYPE_NOTION_MAP['Convocation individuelle'] || '📋 Autre' } },
      'Pôle':             { select:       { name: emetteurPole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal' } },
      'Mode de convocation': { select:    { name: RDV_MODE_NOTION_MAP['individuel'] } },
      'Villes RDR2':      { select:       { name: RDV_VILLE_NOTION_MAP[lieu] || RDV_VILLE_NOTION_MAP['Autre'] } },
      'Participants':     { multi_select: participants.map(n => ({ name: n })) },
      'Notif 1h':     { checkbox: true },
      'Notif 15min':  { checkbox: true },
    } }) }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) console.log(`✅ RDV individuel archivé Notion : ${titre}`);
      else console.log(`❌ Notion RDV individuel erreur complet:`, JSON.stringify(data).slice(0, 500));
    }).catch(e => console.log('❌ Notion RDV individuel error:', e.message));
  }
  await interaction.editReply({ content: `✅ Convocation envoyée à ${participants.join(', ')} !`, embeds: [], components: [] });
  try {
    const ch = interaction.channel;
    const msgs = await ch.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id === interaction.client.user.id &&
          (m.embeds[0]?.title?.includes('Nouveau Rendez-vous') || m.embeds[0]?.description?.includes('Étape'))) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
}

async function _validerModalRdv(interaction) {
  console.log('🔵 RDV STEP 5 - _validerModalRdv appelé, customId:', interaction.customId);
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const rawId = interaction.customId.replace('modal_rdv_', '');
  const parts = rawId.split('_');
  const pole = parts[0];
  // Le lieu est encodé en dernier si vient de _handleRdvLieuSelect
  let lieuFromMenu = null;
  try { lieuFromMenu = decodeURIComponent(parts[parts.length - 1]); } catch {}
  const knownVilles = ['Saint Denis','Valentine','Armadillo','Annesburg','Strawberry','Emerald Ranch','Tumbleweed','Lagras','Flatneck Station','Roanoke Ridge','Tall Trees','Rhodes','Blackwater','Thieves Landing','Autre'];
  const hasLieuInId = knownVilles.includes(lieuFromMenu);
  const typeRdv = hasLieuInId ? parts.slice(1, -1).join('_') : parts.slice(1).join('_');
  const titre = interaction.fields.getTextInputValue('titre'); const dateRaw = interaction.fields.getTextInputValue('date'); const heure = interaction.fields.getTextInputValue('heure');
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim();
  const lieu = lieuDetail || (hasLieuInId && lieuFromMenu !== 'Autre' ? lieuFromMenu : '—');
  const notes = interaction.fields.getTextInputValue('notes') || '';
  const lieuNotionKey = hasLieuInId ? lieuFromMenu : lieu;
  let dateISO = null; try { const p = dateRaw.split('/'); if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const db = loadDB(); const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);
  const poleMap = { legal: { label: 'Pole Legal', roleId: ROLE_POLE_LEGAL, color: 0x3B82F6 }, illegal: { label: 'La Confrerie', roleId: ROLE_POLE_ILLEGAL, color: 0x8B1A1A }, tous: { label: 'Tous les membres', roleId: null, color: 0x2C3E50 }, direction: { label: 'Direction', roleId: null, color: 0xFFD700 } };
  const poleCfg = poleMap[pole] || poleMap.tous;
  const embed = new EmbedBuilder().setColor(poleCfg.color).setTitle(`📅 ${titre.toUpperCase()}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — CONVOCATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields({ name: '🆔 Référence', value: '`' + rdvId + '`', inline: true }, { name: '📅 Date', value: dateCapital, inline: true }, { name: '🕐 Heure', value: `**${heure}**`, inline: true }, { name: '📍 Lieu', value: lieu, inline: true }, { name: '👥 Destinataires', value: poleCfg.label, inline: true }, { name: '✍️ Convoqué par', value: emetteurIC, inline: true })
    .setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();
  if (notes) embed.addFields({ name: '📋 Ordre du jour', value: notes });
  // Poster dans le bon salon selon le pôle
  let agendaCh;
  if (pole === 'illegal') {
    agendaCh = interaction.guild.channels.cache.get(SALON_HARDCODED.AGENDA_ILLEGAL)
      || getChById(interaction.guild, 'AGENDA_ILLEGAL', 'agenda-illegal', 'agenda-illégal');
  } else {
    agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  }
  let mention = ''; if (poleCfg.roleId) mention = `<@&${poleCfg.roleId}>`; else if (pole === 'direction') mention = getMention(interaction.guild); else mention = `<@&${ROLE_POLE_LEGAL}> <@&${ROLE_POLE_ILLEGAL}>`;
  if (agendaCh) await agendaCh.send({ content: `${mention} — 📅 **${titre}** · ${heure} à ${lieu}`, embeds: [embed] }).catch(() => {});
  if (poleCfg.roleId) {
    const roleMembers = interaction.guild.members.cache.filter(m => m.roles.cache.has(poleCfg.roleId) && !m.user.bot);
    for (const [uid] of roleMembers) { await envoyerDMRecap(interaction.guild, uid, 'rdv', { titre, date: dateCapital, heure, lieu }).catch(() => {}); }
  } else if (pole === 'direction') {
    const dirs = interaction.guild.members.cache.filter(m => isDirection(m) && !m.user.bot);
    for (const [uid] of dirs) { await envoyerDMRecap(interaction.guild, uid, 'rdv', { titre, date: dateCapital, heure, lieu }).catch(() => {}); }
  }
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: {
      'Titre':    { title:     [{ text: { content: titre } }] },
      'Date':     { date:      { start: dateISO } },
      'Lieu':             { rich_text: [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':           { select:    { name: 'Planifié' } },
      'Type':             { select:    { name: RDV_TYPE_NOTION_MAP[typeRdv] || '📋 Autre' } },
      'Pôle':             { select:    { name: pole === 'illegal' ? '🔒 Illégal' : pole === 'direction' ? '👑 Direction' : pole === 'tous' ? '👑 Tous' : '⚖️ Légal' } },
      'Mode de convocation': { select: { name: RDV_MODE_NOTION_MAP['role'] } },
      'Villes RDR2':      { select:    { name: RDV_VILLE_NOTION_MAP[lieu] || RDV_VILLE_NOTION_MAP['Autre'] } },
      'Notif 24h':  { checkbox: true },
      'Notif 1h':   { checkbox: true },
      'Notif 15min':{ checkbox: true },
    } }) }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) console.log(`✅ RDV pôle archivé Notion : ${titre}`);
      else console.log(`❌ Notion RDV pôle erreur complet:`, JSON.stringify(data).slice(0, 500));
    }).catch(e => console.log('❌ Notion RDV pôle error:', e.message));
  }
  const salonLabel = pole === 'illegal' ? '#agenda-illégal' : '#agenda';

  // ── Attente photo optionnelle ──
  const skipPhotoId = `rdv_skip_photo_${interaction.id}`;
  await interaction.editReply({
    content: `✅ RDV **${titre}** posté dans ${salonLabel} !

📸 **Photo de repérage optionnelle** — envoie une image dans ce salon ou clique **Ignorer**.`,
    embeds: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(skipPhotoId).setLabel('⏭️ Ignorer la photo').setStyle(ButtonStyle.Secondary)
    )],
  });

  let photoUrl = null;
  try {
    const photoFilter = m => m.author.id === interaction.user.id && m.attachments.size > 0 && m.channel.id === interaction.channel.id;
    const btnFilter   = i => i.user.id === interaction.user.id && i.customId === skipPhotoId;
    await new Promise((resolve) => {
      const msgCollector = interaction.channel.createMessageCollector({ filter: photoFilter, max: 1, time: 60000 });
      const btnCollector = interaction.channel.createMessageComponentCollector({ filter: btnFilter, max: 1, time: 60000 });
      msgCollector.on('collect', async msg => { photoUrl = msg.attachments.first().url; await msg.delete().catch(() => {}); btnCollector.stop('photo'); resolve(); });
      btnCollector.on('collect', async i => { await i.deferUpdate().catch(() => {}); msgCollector.stop('skip'); resolve(); });
      msgCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
      btnCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
    });
  } catch {}

  // Si photo → mettre à jour l'embed dans #agenda avec la photo
  if (photoUrl && agendaCh) {
    try {
      const msgs = await agendaCh.messages.fetch({ limit: 5 });
      const rdvMsg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.title?.includes(titre.toUpperCase()));
      if (rdvMsg) {
        const newEmbed = EmbedBuilder.from(rdvMsg.embeds[0]).setImage(photoUrl);
        await rdvMsg.edit({ embeds: [newEmbed] });
      }
    } catch {}
  }

  await interaction.editReply({
    content: photoUrl ? `✅ RDV **${titre}** posté avec photo dans ${salonLabel} !` : `✅ RDV **${titre}** planifié dans ${salonLabel} !`,
    components: [],
  });

  // Nettoyer les messages intermédiaires dans le salon
  try {
    const ch = interaction.channel;
    const msgs = await ch.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id === interaction.client.user.id &&
          (m.embeds[0]?.title?.includes('Nouveau Rendez-vous') || m.embeds[0]?.description?.includes('Étape'))) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
}

async function _ouvrirModalSurnom(interaction) {
  const db = loadDB(); const m = db.members[interaction.user.id];
  const modal = new ModalBuilder().setCustomId('modal_surnom_identite').setTitle('🎭 Identité IC — Iron Wolf Company');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_ic').setLabel('Nom IC').setStyle(TextInputStyle.Short).setRequired(true).setValue(m?.name || '').setPlaceholder('Ex: Jonas Caverly')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('surnom_ic').setLabel('Surnom IC (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setValue(m?.surnom || '').setPlaceholder('Ex: Le Loup, L\'Ombre...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pseudo_discord').setLabel('Pseudo Discord').setStyle(TextInputStyle.Short).setRequired(true).setValue(interaction.user.username).setPlaceholder('Ton pseudo Discord actuel')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('appartenance').setLabel('Appartenance (Légal / Illégal)').setStyle(TextInputStyle.Short).setRequired(true).setValue(m?.pole === 'illegal' ? 'Illégal' : 'Légal').setPlaceholder('Légal ou Illégal')),
  );
  await interaction.showModal(modal);
}

async function _validerModalSurnom(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const nomIC = interaction.fields.getTextInputValue('nom_ic').trim(); const surnomIC = interaction.fields.getTextInputValue('surnom_ic').trim(); const pseudoDiscord = interaction.fields.getTextInputValue('pseudo_discord').trim(); const appartenance = interaction.fields.getTextInputValue('appartenance').trim().toLowerCase();
  if (!nomIC) return interaction.editReply({ content: '❌ Le nom IC est obligatoire.' });
  const db = loadDB(); if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  db.members[interaction.user.id].name     = nomIC;
  db.members[interaction.user.id].surnom   = surnomIC || null;
  db.members[interaction.user.id].username = pseudoDiscord;
  db.members[interaction.user.id].pole     = appartenance.includes('ill') ? 'illegal' : 'legal';
  db.members[interaction.user.id].lastActivity = new Date().toISOString();
  saveDB(db);
  await _syncSurnomNotion({ content: `NOM IC: ${nomIC}\nSURNOM IC: ${surnomIC || ''}\nAPPARTENANCE: ${appartenance}\nPSEUDO DISCORD: ${pseudoDiscord}`, discordId: interaction.user.id, pseudoDiscord });
  const nomComplet = surnomIC ? `${nomIC} dit « ${surnomIC} »` : nomIC;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Identité IC enregistrée').addFields({ name: '🎭 Nom IC', value: nomIC, inline: true }, ...(surnomIC ? [{ name: '🐺 Surnom', value: surnomIC, inline: true }] : []), { name: '💬 Pseudo Discord', value: pseudoDiscord, inline: true }, { name: '⚖️ Appartenance', value: appartenance.includes('ill') ? '🔒 Illégal' : '⚖️ Légal', inline: true }).setDescription('*Ton identité IC a été synchronisée avec Notion.*').setFooter({ text: 'IWC • Registre des Membres' })] });
  try {
    await interaction.member?.setNickname(nomComplet).catch(() => {});
  } catch {}
  console.log(`✅ Identité IC : ${nomIC} (${interaction.user.username})`);
}


// ── Handler sélection durée absence ──
async function _handleAbsentDureeSelect(interaction) {
  await interaction.deferUpdate();
  const valeur = interaction.values[0];

  // Cas "programmer" → ouvrir modal avec dates début/fin
  if (valeur === 'programmer') {
    const modal = new ModalBuilder()
      .setCustomId('modal_absent_programmer')
      .setTitle('📅 Programmer une absence');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date_debut')
          .setLabel('Date de début (JJ/MM/AAAA)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 10/06/2026')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date_fin')
          .setLabel('Date de fin (JJ/MM/AAAA)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 17/06/2026')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('raison')
          .setLabel('Raison (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Ex: vacances, travail, IRL...')
      ),
    );
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: '📅 Remplis les dates de ton absence :' });
    // showModal nécessite interaction originale → on ne peut pas après deferUpdate
    // Workaround : bouton intermédiaire
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📅 Programmer une absence')
        .setDescription('Clique le bouton ci-dessous pour saisir tes dates.')
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_absent_programmer')
          .setLabel('📅 Saisir mes dates')
          .setStyle(ButtonStyle.Primary)
      )],
    });
    return;
  }

  // Calculer la date de fin selon la valeur choisie
  const maintenant = new Date();
  let dureeLabel = '';
  let finAbsence = null;

  switch (valeur) {
    case '1_soir':
      dureeLabel = 'Ce soir';
      finAbsence = new Date(maintenant);
      finAbsence.setHours(23, 59, 0, 0);
      break;
    case '1_jour':
      dureeLabel = '1 jour';
      finAbsence = new Date(maintenant.getTime() + 1 * 86400000);
      break;
    case '2_jours':
      dureeLabel = '2 jours';
      finAbsence = new Date(maintenant.getTime() + 2 * 86400000);
      break;
    case '3_jours':
      dureeLabel = '3 jours';
      finAbsence = new Date(maintenant.getTime() + 3 * 86400000);
      break;
    case '1_semaine':
      dureeLabel = '1 semaine';
      finAbsence = new Date(maintenant.getTime() + 7 * 86400000);
      break;
    case '2_semaines':
      dureeLabel = '2 semaines';
      finAbsence = new Date(maintenant.getTime() + 14 * 86400000);
      break;
    case '1_mois':
      dureeLabel = '1 mois';
      finAbsence = new Date(maintenant.getTime() + 30 * 86400000);
      break;
    case 'indetermine':
      dureeLabel = 'Indéterminée';
      finAbsence = null;
      break;
  }

  // Demander la raison via modal léger
  const modal = new ModalBuilder()
    .setCustomId(`modal_absent_${valeur}`)
    .setTitle(`🟡 Absence — ${dureeLabel}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('raison')
        .setLabel('Raison (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Ex: vacances, travail, IRL...')
    ),
  );

  // Stocker la durée en attente
  const db = loadDB();
  if (!db._absencePending) db._absencePending = {};
  db._absencePending[interaction.user.id] = {
    dureeLabel,
    finAbsence: finAbsence ? finAbsence.toISOString() : null,
  };
  saveDB(db);

  // Afficher bouton pour ouvrir le modal raison
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(`🟡 Absence — ${dureeLabel}`)
      .setDescription(finAbsence
        ? `Retour prévu : **${finAbsence.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}**

Clique pour confirmer.`
        : `Durée **indéterminée** — tu utiliseras \`/retour\` quand tu reviens.

Clique pour confirmer.`
      )
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_absent_confirmer_${valeur}`)
        .setLabel('✅ Confirmer mon absence')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_absent_annuler')
        .setLabel('↩️ Annuler')
        .setStyle(ButtonStyle.Secondary),
    )],
  });
}

// ── Handler bouton confirmation absence ──
// Routing dans isButton()
// btn_absent_confirmer_VALEUR → confirmer
// btn_absent_programmer → ouvrir modal dates

// ── Handler modal absence programmée ──
async function _validerModalAbsentProgramme(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const dateDebutRaw = interaction.fields.getTextInputValue('date_debut').trim();
  const dateFinRaw   = interaction.fields.getTextInputValue('date_fin').trim();
  const raison       = interaction.fields.getTextInputValue('raison').trim() || '—';

  // Parser les dates JJ/MM/AAAA
  const parseDate = (s) => {
    const p = s.split('/');
    if (p.length !== 3) return null;
    const d = new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`);
    return isNaN(d.getTime()) ? null : d;
  };

  const dateDebut = parseDate(dateDebutRaw);
  const dateFin   = parseDate(dateFinRaw);

  if (!dateDebut || !dateFin) {
    return interaction.editReply({ content: '❌ Dates invalides. Utilise le format JJ/MM/AAAA.' });
  }
  if (dateFin <= dateDebut) {
    return interaction.editReply({ content: '❌ La date de fin doit être après la date de début.' });
  }

  const debutLabel = dateDebut.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  const finLabel   = dateFin.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  const nbJours    = Math.ceil((dateFin - dateDebut) / 86400000);
  const dureeLabel = `Du ${debutLabel} au ${finLabel} (${nbJours} jour${nbJours > 1 ? 's' : ''})`;

  // Si l'absence est dans le futur → programmer (pas encore absent)
  const estFuture = dateDebut > new Date();

  await _enregistrerAbsence(interaction, guild, dureeLabel, dateFin.toISOString(), raison, estFuture ? dateDebut.toISOString() : null);
}

// ── Fonction centrale enregistrement absence ──
async function _enregistrerAbsence(interaction, guild, dureeLabel, finAbsence, raison, debutProgramme = null) {
  const db = loadDB();
  if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  const m = db.members[interaction.user.id];

  const estProgrammee = debutProgramme && new Date(debutProgramme) > new Date();

  if (estProgrammee) {
    // Absence programmée → enregistrer pour activation future
    m.absenceProgrammee = {
      debut: debutProgramme,
      fin: finAbsence,
      raison,
      dureeLabel,
    };
    saveDB(db);
    const debutAff = new Date(debutProgramme).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
    const finAff   = finAbsence ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Indéterminé';
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📅 Absence programmée')
      .addFields(
        { name: '📅 Début', value: debutAff, inline: true },
        { name: '📅 Fin prévue', value: finAff, inline: true },
        { name: '📝 Raison', value: raison, inline: false },
      )
      .setDescription('*Ton absence sera activée automatiquement à la date de début.*')
      .setFooter({ text: 'IWC • /retour pour revenir à tout moment' })
    ]});
    return;
  }

  // Absence immédiate
  m.status       = 'absent';
  m.absentJusqu  = finAbsence;
  m.absentRaison = raison;
  m.lastActivity = new Date().toISOString();
  saveDB(db);

  const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (membreDiscord) {
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(() => {});
  }

  await notionExtra.majStatutActiviteNotion?.(interaction.user.id, 'absent');
  _syncMembreNotion(interaction.user.id, { status: 'absent', lastActivity: new Date().toISOString() }).catch(() => {});
  _syncStatutFicheNotion(interaction.user.id, 'Absent').catch(() => {});
  await sendLog(guild, 'ABSENCE', { userId: interaction.user.id, username: interaction.user.username });

  const retourStr = finAbsence
    ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
    : 'Indéterminé';

  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('🟡 Absence enregistrée')
    .addFields(
      { name: '⏱️ Durée', value: dureeLabel, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setDescription('*Tu peux encore lire les salons. Utilise `/retour` pour revenir à tout moment.*')
    .setFooter({ text: 'IWC • /retour pour revenir à tout moment' })
  ]});

  // Poster dans #absences
  const absCh = getAbsencesCh(guild, membreDiscord);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
    .setColor(0xFFA500)
    .setAuthor({ name: `${membreDiscord?.displayName || interaction.user.username} — Absence`, iconURL: interaction.user.displayAvatarURL() })
    .setTitle(`🟡 Déclaration d'absence`)
    .addFields(
      { name: '👤 Membre', value: `<@${interaction.user.id}>`, inline: true },
      { name: '⏱️ Durée', value: dureeLabel, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setFooter({ text: `IWC • ${fmtShort(new Date())}` }).setTimestamp()
  ]}).catch(() => {});
}


async function _ouvrirModalAbsentProgrammer(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_absent_programmer').setTitle('📅 Programmer une absence');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_debut').setLabel('Date de début (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 10/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_fin').setLabel('Date de fin (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 17/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Raison (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: vacances, travail, IRL...')),
  );
  await interaction.showModal(modal);
}

async function _confirmerAbsence(interaction) {
  await interaction.deferUpdate();
  const valeur = interaction.customId.replace('btn_absent_confirmer_', '');
  const db = loadDB();
  const pending = db._absencePending?.[interaction.user.id];
  if (!pending) return interaction.editReply({ content: '❌ Session expirée. Recommence avec /absent.' });
  delete db._absencePending[interaction.user.id];
  saveDB(db);
  await _enregistrerAbsence(interaction, interaction.guild, pending.dureeLabel, pending.finAbsence, '—');
}

// ── Validation modal absence ──
async function _validerModalAbsent(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const dureeRaw = interaction.fields.getTextInputValue('duree').trim();
  const raison   = interaction.fields.getTextInputValue('raison').trim() || '—';
  // Mode lecture-seule par défaut : la personne peut lire mais pas écrire
  const modeLectureSeule = true;

  // Calculer la date de retour depuis la durée saisie
  let finAbsence = null;
  const d = dureeRaw.toLowerCase();
  if (d.includes('indét') || d.includes('indeter')) finAbsence = null;
  else if (d.match(/(\d+)\s*jour/)) finAbsence = new Date(Date.now() + parseInt(d.match(/(\d+)/)[1]) * 86400000).toISOString();
  else if (d.match(/(\d+)\s*semaine/)) finAbsence = new Date(Date.now() + parseInt(d.match(/(\d+)/)[1]) * 7 * 86400000).toISOString();
  else if (d.match(/(\d+)\s*mois/)) finAbsence = new Date(Date.now() + parseInt(d.match(/(\d+)/)[1]) * 30 * 86400000).toISOString();
  else if (d.includes('jusqu')) {
    // "jusqu'au 15 juin" → chercher une date
    const dateMatch = dureeRaw.match(/(\d{1,2})[\/\s]([a-zéûôàèù]+|\d{1,2})(?:[\/\s](\d{4}))?/i);
    if (dateMatch) {
      const months = { jan: 0, fév: 1, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5, jul: 6, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
      const day = parseInt(dateMatch[1]);
      const monthRaw = dateMatch[2].toLowerCase().slice(0, 3);
      const month = months[monthRaw] ?? (parseInt(dateMatch[2]) - 1);
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
      finAbsence = new Date(year, isNaN(month) ? 0 : month, day).toISOString();
    }
  }

  const db = loadDB();
  if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  db.members[interaction.user.id].status       = 'absent';
  db.members[interaction.user.id].absentJusqu  = finAbsence;
  db.members[interaction.user.id].absentRaison = raison;
  db.members[interaction.user.id].absentMode   = modeLectureSeule ? 'lecture-seule' : 'absent-total';
  db.members[interaction.user.id].lastActivity = new Date().toISOString();
  saveDB(db);

  const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (membreDiscord) {
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(() => {});
    if (!modeLectureSeule) {
      // Mode absent-total : bloquer aussi la lecture
      await _bloquerEcritureAbsent(guild, membreDiscord);
    }
    // Mode lecture-seule (défaut) : le rôle Absent gère les perms d'écriture via les permissions du rôle
    // La personne peut encore lire tous les salons
  }

  await notionExtra.majStatutActiviteNotion?.(interaction.user.id, 'absent');
  _syncMembreNotion(interaction.user.id, { status: 'absent', lastActivity: new Date().toISOString() }).catch(() => {});
  _syncStatutFicheNotion(interaction.user.id, 'Absent').catch(() => {});
  await sendLog(guild, 'ABSENCE', { userId: interaction.user.id, username: interaction.user.username });

  const retourStr = finAbsence
    ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
    : 'Indéterminé';

  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🟡 Absence enregistrée')
    .addFields(
      { name: '⏱️ Durée', value: dureeRaw, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setDescription("*Tu peux encore lire les salons. L'écriture sera bloquée selon les permissions du rôle Absent.*")
    .setFooter({ text: 'IWC • /retour pour revenir à tout moment' })] });

  // Poster dans #absences
  const absCh = getAbsencesCh(guild, interaction.member);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0xFFA500)
    .setAuthor({ name: `${interaction.member?.displayName || interaction.user.username} — Absence`, iconURL: interaction.user.displayAvatarURL() })
    .setTitle('🟡 Déclaration d\'absence')
    .addFields(
      { name: '👤 Membre', value: `<@${interaction.user.id}>`, inline: true },
      { name: '⏱️ Durée', value: dureeRaw, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setFooter({ text: `IWC • ${fmtShort(new Date())}` }).setTimestamp()] }).catch(() => {});

  // Sync Notion absences
  if (process.env.NOTION_TOKEN && process.env.NOTION_MEMBRES_DB) {
    _syncMembreNotion(interaction.user.id, {
      status: 'absent',
      lastActivity: new Date().toISOString(),
    }).catch(() => {});
  }
}

// [CORRECTION] _checkRetoursAbsence — avec _debloquerEcritureAbsent
async function _checkRetoursAbsence(guild) {
  const db = loadDB(); const maintenant = new Date(); let changed = false;

  // Activer les absences programmées dont la date de début est arrivée
  for (const [uid, m] of Object.entries(db.members || {})) {
    if (!m.absenceProgrammee) continue;
    const debut = new Date(m.absenceProgrammee.debut);
    if (debut > maintenant) continue;
    // Heure venue → activer l'absence
    console.log(`🔄 Activation absence programmée : ${m.name || uid}`);
    m.status = 'absent';
    m.absentJusqu = m.absenceProgrammee.fin;
    m.absentRaison = m.absenceProgrammee.raison;
    delete m.absenceProgrammee;
    changed = true;
    const membreD = await guild.members.fetch(uid).catch(() => null);
    if (membreD) {
      const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
      if (roleAbsent) await membreD.roles.add(roleAbsent).catch(() => {});
    }
    _syncStatutFicheNotion(uid, 'Absent').catch(() => {});
    const absCh = getAbsencesCh(guild, membreD);
    if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🟡 Absence activée automatiquement')
      .addFields(
        { name: '👤 Membre', value: `<@${uid}>`, inline: true },
        { name: '📅 Retour prévu', value: m.absentJusqu ? new Date(m.absentJusqu).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Indéterminé', inline: true },
      ).setFooter({ text: 'IWC • Absence programmée activée' }).setTimestamp()
    ]}).catch(() => {});
  }

  for (const [uid, m] of Object.entries(db.members || {})) {
    if (m.status !== 'absent' || !m.absentJusqu) continue;
    if (new Date(m.absentJusqu) > maintenant) continue;
    m.status = 'actif'; m.lastActivity = new Date().toISOString(); m.absentJusqu = null; m.absentRaison = null; changed = true;
    const membreD = await guild.members.fetch(uid).catch(() => null);
    if (membreD) {
      const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
      if (roleAbsent) await membreD.roles.remove(roleAbsent).catch(() => {});
      await _debloquerEcritureAbsent(guild, membreD);
    }
    _syncMembreNotion(uid, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
    const membreAbsent3 = await guild.members.fetch(uid).catch(() => null);
    const absCh = getAbsencesCh(guild, membreAbsent3);
    if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Retour automatique').setDescription(`<@${uid}> est revenu automatiquement d'absence.`).addFields({ name: '📅 Date de retour', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true }, { name: '🎖️ Grade', value: m.rang || '—', inline: true }).setFooter({ text: 'IWC • Retour automatique' }).setTimestamp()] }).catch(() => {});
    const membre2 = await guild.members.fetch(uid).catch(() => null);
    if (membre2) { await envoyerDMRecap(guild, uid, 'absence', { message: '✅ Ton absence est terminée. Tu es de retour !\n\nTes permissions d\'écriture sont rétablies.' }).catch(() => {}); }
    await notionExtra.majStatutActiviteNotion?.(uid, 'actif');
    console.log(`✅ Retour automatique : ${m.name || uid}`);
  }
  if (changed) saveDB(db);
}

// ─────────────────────────────────────────────────────────────────────────────
// [NOUVELLES FONCTIONS] Blocage / Déblocage écriture pour absences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retire les permissions d'écriture dans tous les salons texte accessibles
 * au membre absent, sauf #absences et #général.
 */
async function _bloquerEcritureAbsent(guild, member) {
  try {
    // Approche par rôle : on modifie les perms du rôle Absent sur tous les salons
    // Plus robuste que par membre individuel
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (!roleAbsent) {
      // Fallback : bloquer par membre directement
      for (const [, ch] of guild.channels.cache) {
        if (!ch.isTextBased?.() || ch.type === 4) continue;
        if (ch.id === SALON_HARDCODED.ABSENCES_LEGAL || ch.id === SALON_HARDCODED.ABSENCES_ILLEGAL) continue; // laisser écrire dans #absences
        await ch.permissionOverwrites.edit(member, { SendMessages: false }).catch(() => {});
      }
      console.log(`🔒 Écriture bloquée (membre) pour ${member.user?.username || member.id}`);
      return;
    }
    // Les perms du rôle Absent sont déjà configurées sur le serveur
    // On s'assure juste que le rôle est attribué (fait dans handleSlashCommand)
    console.log(`🔒 Rôle Absent attribué → permissions bloquées pour ${member.user?.username || member.id}`);
  } catch (e) { console.log('❌ _bloquerEcritureAbsent error:', e.message); }
}

async function _debloquerEcritureAbsent(guild, member) {
  try {
    if (!member) { console.log('⚠️ _debloquerEcritureAbsent: member null, skip'); return; }
    if (!guild) { console.log('⚠️ _debloquerEcritureAbsent: guild null, skip'); return; }
    const memberId = member.id || member;
    // Récupérer le membre si nécessaire (au cas où c'est juste un ID)
    let m = member;
    if (typeof member === 'string' || !member.roles) {
      m = await guild.members.fetch(memberId).catch(() => null);
    }
    // 1. Retirer le rôle Absent
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent && m?.roles?.cache?.has(roleAbsent.id)) {
      await m.roles.remove(roleAbsent).catch(() => {});
      console.log(`🔓 Rôle Absent retiré pour ${m?.user?.username || memberId}`);
    }
    // 2. Retirer les overrides par membre (fallback)
    if (m) {
      for (const [, ch] of guild.channels.cache) {
        if (!ch.isTextBased?.()) continue;
        const perm = ch.permissionOverwrites.cache.get(memberId);
        if (perm?.deny?.has('SendMessages') || perm?.deny?.has('ViewChannel')) {
          await ch.permissionOverwrites.delete(m).catch(() => {});
        }
      }
    }
    // 3. Nettoyer la DB
    const db = loadDB();
    if (db._absenceOverrides?.[memberId]) { delete db._absenceOverrides[memberId]; saveDB(db); }
    if (db.members[memberId]) {
      db.members[memberId].status = 'actif';
      db.members[memberId].absentJusqu = null;
      db.members[memberId].absentRaison = null;
      saveDB(db);
    }
    console.log(`🔓 Écriture débloquée pour ${m?.user?.username || memberId}`);
  } catch (e) { console.log('❌ _debloquerEcritureAbsent error:', e.message); }
}

async function setupFicheFormat(guild) {
  try {
    const ch = getChById(guild, 'FICHES_PERSONNAGES', 'fiches-personnages', 'fiches-perso', 'fiches'); if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    // Chercher si le format est déjà posté (vérifier plusieurs titres possibles)
    const existing = msgs.find(m =>
      m.author.id === guild.members.me?.id &&
      (m.embeds[0]?.title?.includes('FORMAT') ||
       m.embeds[0]?.title?.includes('FORMULAIRE') ||
       m.embeds[0]?.title?.includes('DOSSIERS') ||
       m.embeds[0]?.title?.includes('FICHES'))
    );
    if (existing) {
      // Vérifier si le TÉLÉGRAMME IC est déjà présent dans n'importe quel embed du message
      const allDescs = existing.embeds.map(e => e.description || '').join('');
      if (allDescs.includes('TÉLÉGRAMME IC')) {
        console.log('✅ Format fiches déjà à jour — skip');
        return;
      }
      // Format obsolète → supprimer tous les messages bot et recréer
      for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    } else {
      // Pas de format trouvé → supprimer les éventuels anciens messages bot orphelins
      for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    }

    const format = [
      '✦ NOM COMPLET :',
      '✦ SURNOM(S) :',
      '✦ ÂGE :',
      '✦ LIEU DE NAISSANCE :',
      '✦ NATIONALITÉ :',
      '✦ TAILLE / CORPULENCE :',
      '✦ YEUX / CHEVEUX :',
      '✦ SIGNES PARTICULIERS :',
      '✦ TÉLÉGRAMME IC :',
      '✦ PROFESSION :',
      '✦ RÉPUTATION :',
      '',
      '"Citation du personnage."',
      '',
      '─ ─ ─ HISTOIRE ─ ─ ─',
      '[5 à 15 lignes minimum]',
      '',
      '─ ─ ─ PERSONNALITÉ ─ ─ ─',
      '› Trait 1',
      '› Trait 2',
      '› Trait 3',
      '',
      '─ ─ ─ COMPÉTENCES ─ ─ ─',
      '⬡ Compétence : ◆◆◆◆◇',
      '⬡ Compétence : ◆◆◆◆◆',
      '',
      '─ ─ ─ FAIBLESSES ─ ─ ─',
      '› Faiblesse 1',
      '› Faiblesse 2',
      '',
      '─ ─ ─ LIENS IMPORTANTS ─ ─ ─',
      '[Nom] — [Relation] — [Description courte]',
      '',
      '─ ─ ─ OBJECTIF ─ ─ ─',
      '[Ce que le personnage cherche à accomplir]',
      '',
      '⋆ ─────────────────── ⋆',
      '     I W C  ·  1 8 9 5',
      '⋆ ─────────────────── ⋆',
    ].join('\n');

    await ch.send({ embeds: [
      new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('🤠 DOSSIERS — Iron Wolf Company')
        .setDescription([
          '```',
          '╔═══════════════════════════════════╗',
          '║   FICHES OFFICIELLES DES AGENTS   ║',
          '║       Iron Wolf Company · 1895    ║',
          '╚═══════════════════════════════════╝',
          '```',
          '*Un dossier par agent. Rédigez le vôtre ci-dessous.*',
        ].join('\n'))
        .addFields(
          { name: '📜 Procédure', value: ['**1.** Copiez le formulaire ci-dessous', '**2.** Remplissez chaque rubrique', '**3.** Envoyez dans ce salon', '**4.** Le bureau génère automatiquement votre dossier ✅'].join('\n'), inline: false },
        )
        .setFooter({ text: 'Iron Wolf Company · Bureau des Archives · 1895' }),
      new EmbedBuilder()
        .setColor(0x5C3317)
        .setTitle('📋 FORMULAIRE — À copier/coller')
        .setDescription('```\n' + format + '\n```')
        .addFields(
          { name: '⚠️ Règlement', value: 'Tous les champs sont libres.\nSeul **NOM COMPLET** est obligatoire pour que le bureau reconnaisse votre dossier.\nChaque agent ne peut déposer **qu\'un seul dossier**.' },
          { name: '🔄 Mise à jour', value: 'Pour modifier votre dossier, repostez-le complet dans ce salon.\nL\'ancien sera archivé et Notion mis à jour automatiquement.' },
        )
        .setFooter({ text: '« La vérité a un prix. Nous le faisons payer aux autres. » — La Compagnie' }),
    ] });
    console.log('✅ Format fiches posté (avec TÉLÉGRAMME IC)');
  } catch (e) { console.log('❌ setupFicheFormat:', e.message); }
}

async function setupPlansFormat(guild) {
  try {
    // Utiliser l'ID hardcodé pour #plans
    const ch = guild.channels.cache.get(SALON_HARDCODED.PLANS) || guild.channels.cache.find(c => {
      const n = c.name?.toLowerCase().replace(/[^a-z0-9]/g,'');
      return c.isTextBased?.() && n === 'plans' && !c.name.includes('informateur');
    });
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.embeds[0]?.title?.includes('PLANS'));
    if (existing) return;
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    await ch.send({ embeds: [new EmbedBuilder().setColor(0x8B5A2A).setTitle('🗺️ PLANS TACTIQUES — IWC').setDescription(['*Partagez vos plans et cartes tactiques ici.*', '', '**Format recommandé :**', '```', '━━━━━━━━━━━━━━━━━━━━━━━━', 'PLAN TACTIQUE', '━━━━━━━━━━━━━━━━━━━━━━━━', 'OPÉRATION: ', 'LIEU: ', 'OBJECTIF: ', 'POINT DE RASSEMBLEMENT: ', 'PLAN D\'ATTAQUE: ', 'PLAN DE REPLI: ', 'NOTES: ', '━━━━━━━━━━━━━━━━━━━━━━━━', '```'].join('\n')).setFooter({ text: 'IWC • Plans tactiques' })] });
    console.log('✅ Format plans posté');
  } catch (e) { console.log('❌ setupPlansFormat:', e.message); }
}

async function setupPlanningFormat(guild) {
  try {
    const ch = getChById(guild, 'PLANNING', 'planning'); if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.embeds[0]?.title?.includes('PLANNING'));
    if (existing) return;
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 PLANNING — Iron Wolf Company').setDescription('*Planning hebdomadaire de la Compagnie.*\n\nPartagez ici les screenshots de planning ou utilisez la commande `/rdv` pour créer un rendez-vous.').addFields({ name: '📌 Utilisation', value: ['→ Postez un screenshot → automatiquement archivé', '→ `/rdv` pour créer un RDV officiel', '→ `/agenda voir` pour voir les prochains RDV'].join('\n') }).setFooter({ text: 'IWC • Planning • Mis à jour automatiquement' });
    await ch.send({ embeds: [embed] });
    console.log('✅ Format planning posté');
  } catch (e) { console.log('❌ setupPlanningFormat:', e.message); }
}

// Sync transactions dans la DB Notion IWC
async function _syncTransactionNotion(t) {
  if (!process.env.NOTION_TOKEN) return;
  const dbId = process.env.NOTION_TRESORERIE_DB || NOTION_TRANSACTIONS_DB;
  if (!dbId) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: dbId }, properties: {
        'Objet': { title: [{ text: { content: t.objet || '—' } }] },
        'Type': { select: { name: t.type || 'Entrée' } },
        'Coffre': { select: { name: t.coffre === 'illegal' ? '🔒 Illégal' : '⚖️ Légal' } },
        'Montant': { number: t.montant || 0 },
        'Responsable': { rich_text: [{ text: { content: t.responsable || '—' } }] },
        'Discord ID': { rich_text: [{ text: { content: t.discordId || t.userId || '—' } }] },
        'Solde après': { number: t.solde || 0 },
        'Date': { date: { start: (t.date || new Date().toISOString()).split('T')[0] } },
      }})
    });
    console.log(`✅ Transaction Notion: ${t.type} ${t.coffre} $${t.montant} par ${t.responsable}`);
  } catch (e) { console.log('❌ _syncTransactionNotion error:', e.message); }
}

// Exposer les IDs hardcodés et fonctions aux modules notionV3/V4/V5
global.SALON_HARDCODED = SALON_HARDCODED;
global.NOTION_TRANSACTIONS_DB = NOTION_TRANSACTIONS_DB;
global._syncTransactionNotion = _syncTransactionNotion;
global.archiverContratReponses = archiverContratReponses;
global.getChHard = getChHard;
// Surcharge enregistrerTransactionNotion pour ajouter Discord ID et sync DB transactions
const _origEnregistrerTransaction = notionExtra.enregistrerTransactionNotion;
notionExtra.enregistrerTransactionNotion = async (data) => {
  // Ajouter sync dans la DB transactions IWC
  _syncTransactionNotion({
    type: data.type || '—',
    coffre: data.coffre?.includes('llé') ? 'illegal' : 'legal',
    montant: data.montant || 0,
    objet: data.objet || '—',
    responsable: data.responsable || '—',
    discordId: data.discordId || data.userId || '—',
    solde: data.solde || 0,
    date: new Date().toISOString(),
  }).catch(() => {});
  if (_origEnregistrerTransaction) return _origEnregistrerTransaction(data);
};
global._syncInformateurNotion = _syncInformateurNotion;
global._syncAvertissementNotion = _syncAvertissementNotion;
global._syncMembreNotion = _syncMembreNotion;
global._syncContratNotion = _syncContratNotion;
global._syncCandidatureNotion = _syncCandidatureNotion;
global._syncAffaireNotion = _syncAffaireNotion;
global._syncSurnomNotion = _syncSurnomNotion;
global.ajouterJournalIC = ajouterJournalIC;
global.envoyerDMRecap = envoyerDMRecap;
global.getChById = getChById;
global.sendLog = sendLog;
global.isDirection = isDirection;

// Créer la DB Informateurs dans Notion si elle n'existe pas
async function _initDBInformateursNotion(guild) {
  if (!process.env.NOTION_TOKEN) return;
  if (process.env.NOTION_INFOS_DB) return; // déjà configurée
  
  // Trouver la page parent IWC depuis une DB existante
  const parentId = process.env.NOTION_MEMBRES_DB || process.env.NOTION_RECRUTEMENT_DB;
  if (!parentId) return;
  
  try {
    // Récupérer l'ID de la page parent depuis une DB existante
    const res = await fetch(`https://api.notion.com/v1/databases/${parentId}`, {
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }
    }).catch(() => null);
    if (!res?.ok) return;
    const dbData = await res.json().catch(() => null);
    const parentPageId = dbData?.parent?.page_id;
    if (!parentPageId) return;
    
    // Créer la DB Informateurs
    const createRes = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: parentPageId },
        icon: { type: 'emoji' },
        title: [{ type: 'text', text: { content: 'Informateurs' } }],
        properties: {
          'Source':               { title: {} },
          'Cible / Lieu':         { rich_text: {} },
          'Information':          { rich_text: {} },
          'Fiabilité':            { select: { options: [{ name: '✅ Confirmée', color: 'green' }, { name: '❌ Non confirmée', color: 'red' }] } },
          'Statut':               { select: { options: [{ name: '🆕 Nouveau', color: 'yellow' }, { name: '✅ Confirmé', color: 'green' }, { name: '❌ Infirmé', color: 'red' }] } },
          'Validé par':           { rich_text: {} },
          'Rapporteur Discord ID':{ rich_text: {} },
          'Date décision':        { date: {} },
          'Date rapport':         { date: {} },
        }
      })
    });
    
    if (createRes.ok) {
      const dbCreated = await createRes.json();
      const newId = dbCreated.id;
      console.log(`✅ DB Informateurs Notion créée automatiquement : ${newId}`);
      console.log(`⚠️  IMPORTANT : Ajoute dans Render → NOTION_INFOS_DB = ${newId}`);
      // Poster l'ID dans le salon logs pour que l'admin puisse le récupérer
      const logsCh = await getLogsCh(guild).catch(() => null);
      if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
        .setTitle('✅ Base Notion "Informateurs" créée automatiquement')
        .setDescription(`**Ajoute cette variable dans Render :**
\`\`\`
NOTION_INFOS_DB = ${newId}
\`\`\`
Ensuite redémarre le bot.`)
        .setFooter({ text: 'IWC • Configuration Notion' })] }).catch(() => {});
    } else {
      const errData = await createRes.json().catch(() => ({}));
      console.log('❌ Création DB Informateurs échouée:', errData?.message || createRes.status);
    }
  } catch(e) { console.log('❌ _initDBInformateursNotion:', e.message); }
}
global.getLogsCh = getLogsCh;
global.getJournalCh = getJournalCh;
// notionV3 utilise global.getLogsCh — on le surcharge pour rediriger vers journal-de-bord
// pour les alertes informateurs et affaires
const _origGetLogsCh = getLogsCh;
global.getInformateurCh = (guild) => getJournalCh(guild) || guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD);

// Mettre à jour le statut activité dans Fiches_personnages
async function _syncTousMembresNotion(guild) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_FICHES_DB) return;
  try {
    const illegalRoleNames = ['Concepteur', 'Fléau', "L'Exécuteur", 'Le Condamné', 'Le Maudit', 'La Confrérie', 'Instructeur', 'Le Concepteur'];
    const legalRoleNames   = ['Le Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent Confirmé', 'Opérateur', 'Recrue', 'Probatoire', 'Le Penseur', 'Fondateur'];
    const db = loadDB();
    const membres = Object.entries(db.members || {});
    if (!membres.length) return;
    console.log(`🔄 Sync Notion — ${membres.length} membres...`);
    let synced = 0;
    for (const [discordId, m] of membres) {
      try {
        const member = await guild.members.fetch(discordId).catch(() => null);
        if (!member) continue;
        const isIlleg = member.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
        const isLegal = member.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)));
        const pole    = isIlleg ? '🔒 Illégal' : '⚖️ Légal'; // illégal prioritaire
        const statut  = m.status === 'absent' ? 'Absent' : m.status === 'inactif' ? 'Inactif' : 'Actif';
        await _syncStatutFicheNotion(discordId, statut, { pole });
        synced++;
        await new Promise(r => setTimeout(r, 400)); // pause anti rate-limit Notion
      } catch(e) { console.log(`❌ Sync membre ${discordId}:`, e.message); }
    }
    console.log(`✅ Sync Notion terminée — ${synced}/${membres.length} membres mis à jour`);
  } catch(e) { console.log('❌ _syncTousMembresNotion:', e.message); }
}

async function _syncStatutFicheNotion(discordId, statut, extras = {}) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_FICHES_DB) return;
  try {
    const search = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_FICHES_DB}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }),
    });
    const data = await search.json();
    const page = data.results?.[0];
    if (!page) return;
    const props = { 'Dernière MàJ': { date: { start: new Date().toISOString().split('T')[0] } } };
    if (statut) props['Statut activité'] = { select: { name: statut } };
    if (extras.pole) props['Pôle'] = { select: { name: extras.pole } };
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: props }),
    });
    const changes = [statut && `statut → ${statut}`, extras.pole && `pôle → ${extras.pole}`].filter(Boolean).join(', ');
    console.log(`✅ Fiches_personnages MàJ : ${discordId} — ${changes}`);
  } catch(e) { console.log('❌ _syncStatutFicheNotion:', e.message); }
}

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔑 Login OK'))
  .catch(e => { console.error('❌ Login failed:', e.message); process.exit(1); });

