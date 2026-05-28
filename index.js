require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ChannelType, ActivityType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const cron = require('node-cron');
const fs   = require('fs');

// ═══════════════════════════════════════════════════════════════
// MODULE EXTENSIONS NOTION (fiches, stats, trésorerie, contrats, opérations)
// Si le fichier casse, le bot continue de tourner (try/catch).
// ═══════════════════════════════════════════════════════════════
let notionExtra = {};
try { notionExtra = require('./notion-extra'); console.log('✅ Module notion-extra chargé'); }
catch (e) { console.log('⚠️ notion-extra non chargé:', e.message); }

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences,
    GatewayIntentBits.GuildInvites,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel, Partials.GuildMember]
});

const CH = {
  RECRUTEMENT:           '1508756414779232277',
  RECRUTEMENT_INT_LEGAL: '1509254315712188438',
  RECRUTEMENT_INT_ILLEG: '1508756516830842960',
  DOSSIER_LEGAL:         '1509254295717941278',
  DOSSIER_ILLEG:         '1509252295127466096',
  CONTRATS:              '1508756442730074222',
  FIL_CONTRATS_SIGNE:    '1509340729808388208',
  FIL_CONTRATS_REFUSE:   '1509340853808664627',
  LOGS:                  '1509337860724228137',
};

const PARTICIPANTS_MAP = {
  'Thomas Galagan':    '982201491773354035',
  'Jonas Caverly':     '944208797084311583',
  'Cyrus Hollow':      '324627678143578112',
  'June McCall':       '998581854791798835',
  'Colt Kane':         '696325126047662081',
  'Toute la Confrérie':'<@&1508756479274913903>',
  'Pôle Légal':        '<@&1508756436082102303>',
  'Pôle Illégal':      '<@&1508756479274913903>',
};

const CONTRAT_ROLES = [
  '1508289999035039875',
  '1508290320763195482',
  '1508292278953836655',
];
const JUNE_MCCALL_ID = '998581854791798835';

const NOTION_RECRUTEMENT_DB = '36ef4436a86c81de9f1acf55c5ad4076';
const NOTION_MEMBRES_DB     = '36ef4436a86c818d99a4dd875efec4e3';

// Correspondance Nom IC → ID Discord pour le Registre
const MEMBRES_DISCORD_MAP = {
  'Colt Kane':      '696325126047662081',
  'June McCall':    '998581854791798835',
  'Cyrus Hollow':   '324627678143578112',
  'Jonas Caverly':  '944208797084311583',
  'Thomas Galagan': '982201491773354035',
};

const DB_PATH = './data.json';
function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({
      members: {}, operations: [], sessions: [],
      candidatures: [], contrats: [],
      dashboardMsgId: null, reglementMsgId: null, recrutementMsgId: null,
    }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}
function saveDB(d) { fs.writeFileSync(DB_PATH, JSON.stringify(d, null, 2)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function sendToThread(guild, threadId, payload) {
  try {
    const direct = await guild.channels.fetch(threadId).catch(() => null);
    if (direct) { await direct.send(payload); return true; }
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isTextBased?.()) continue;
      try {
        const fetched = await channel.threads.fetch().catch(() => null);
        if (!fetched) continue;
        const thread = fetched.threads?.get(threadId) || channel.threads.cache.get(threadId);
        if (thread) { await thread.send(payload); return true; }
      } catch(e) {}
    }
  } catch(e) { console.log('sendToThread error:', e.message); }
  return false;
}

async function getLogsCh(guild) {
  let ch = guild.channels.cache.get(CH.LOGS);
  if (!ch) ch = await guild.channels.fetch(CH.LOGS).catch(() => null);
  return ch;
}

async function sendLog(guild, type, data) {
  const ch = await getLogsCh(guild);
  if (!ch) return;
  const configs = {
    ARRIVEE:             { color: 0x57F287, emoji: '👋', title: 'ARRIVÉE — '              + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '🔢 Âge du compte', value: data.accountAge + ' jours', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    DEPART:              { color: 0x555555, emoji: '🚪', title: 'DÉPART — '               + data.username,  fields: [{ name: '👤 Membre', value: data.username, inline: true }, { name: '🎖️ Rang', value: data.rang || '—', inline: true }, { name: '⏱️ Durée', value: data.duree || '—', inline: true }] },
    COMPTE_SUSPECT:      { color: 0xED4245, emoji: '⚠️', title: 'COMPTE SUSPECT — '       + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '🔢 Âge', value: data.accountAge + ' jours', inline: true }] },
    REGLEMENT_VALIDE:    { color: 0x3B82F6, emoji: '📜', title: 'RÈGLEMENT VALIDÉ — '     + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_RECUE:   { color: 0xFFA500, emoji: '📥', title: 'CANDIDATURE REÇUE — '    + data.nomPerso,  fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_ACCEPTEE:{ color: 0x57F287, emoji: '✅', title: 'CANDIDATURE ACCEPTÉE — ' + data.nomPerso,  fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '✅ Par', value: data.validePar || '—', inline: true }] },
    CANDIDATURE_REFUSEE: { color: 0xED4245, emoji: '❌', title: 'CANDIDATURE REFUSÉE — '  + data.nomPerso,  fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }] },
    ABSENCE:             { color: 0xFFA500, emoji: '🟡', title: 'ABSENCE — '               + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    INACTIVITE:          { color: 0xED4245, emoji: '💤', title: 'INACTIVITÉ — '            + data.username,  fields: [{ name: '👤 Membre', value: data.username, inline: true }, { name: '⏱️ Depuis', value: data.jours + ' jours', inline: true }] },
    CONTRAT_SIGNE:       { color: 0x57F287, emoji: '📜', title: 'CONTRAT SIGNÉ — '        + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }, { name: '✍️ Signé par', value: data.signe, inline: true }] },
    CONTRAT_REFUSE:      { color: 0xED4245, emoji: '📜', title: 'CONTRAT REFUSÉ — '       + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }] },
    OPERATION:           { color: 0xFFA500, emoji: '🎯', title: 'OPÉRATION — '            + data.nom,       fields: [{ name: '🎯 Nom', value: data.nom, inline: true }, { name: '📍 Lieu', value: data.lieu || '—', inline: true }, { name: '📋 Statut', value: data.statut || '—', inline: true }] },
  };
  const cfg = configs[type];
  if (!cfg) return;
  const embed = new EmbedBuilder().setColor(cfg.color).setTitle(cfg.emoji + ' ' + cfg.title).addFields(...cfg.fields).setFooter({ text: 'IWC • Logs • ' + new Date().toLocaleString('fr-FR') });
  await ch.send({ embeds: [embed] }).catch(e => console.log('Log error:', e.message));
}

async function log(guild, color, emoji, title, fields = []) {
  const ch = await getLogsCh(guild);
  if (!ch) return;
  const embed = new EmbedBuilder().setColor(color).setTitle(emoji + ' ' + title).setFooter({ text: new Date().toLocaleString('fr-FR') });
  if (fields.length) embed.addFields(...fields);
  await ch.send({ embeds: [embed] }).catch(() => {});
}

function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

function getMention(guild) {
  return guild.roles.cache
    .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
    .map(r => `<@&${r.id}>`).join(' ') || '';
}

function getContratMention(guild) {
  const roleMentions = CONTRAT_ROLES.map(id => guild.roles.cache.get(id)).filter(Boolean).map(r => `<@&${r.id}>`);
  return [...roleMentions, `<@${JUNE_MCCALL_ID}>`].join(' ');
}

function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function fmtLong(d)  { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

function isDirection(member) {
  return member?.roles.cache.some(r =>
    ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'].some(n => r.name.includes(n))
  );
}

// ═══════════════════════════════════════════════════════════════
// NOTION — ARCHIVER CANDIDATURE
// ═══════════════════════════════════════════════════════════════
async function archiverCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    const body = {
      parent: { database_id: NOTION_RECRUTEMENT_DB },
      properties: {
        'Nom personnage': { title: [{ text: { content: cand.nomPerso || '—' } }] },
        'Date réception': { date: { start: cand.receivedAt ? new Date(cand.receivedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } },
        'Statut': { select: { name: statut === 'acceptee' ? '✅ Accepté' : '❌ Refusé' } },
        'Type': { select: { name: cand.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } },
        'Disponibilités': { rich_text: [{ text: { content: cand.dispos || '—' } }] },
        'Expérience RP': { rich_text: [{ text: { content: cand.background?.slice(0, 2000) || '—' } }] },
        'Vote Direction': { rich_text: [{ text: { content: validePar || '—' } }] },
        'Notes': { rich_text: [{ text: { content: statut === 'acceptee' ? `Accepté par ${validePar} le ${fmtShort(new Date())}` : `Refusé le ${fmtShort(new Date())}` } }] },
      }
    };
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log(`✅ Notion: Candidature ${cand.nomPerso} archivée (${statut})`);
  } catch(e) {
    console.log('❌ Notion archivage error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// NOTION — AJOUTER MEMBRE AU REGISTRE
// ═══════════════════════════════════════════════════════════════
async function ajouterMembreNotion(cand, type) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    const pole = type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal';
    const rang = type === 'illegal' ? 'Loup Confirmé' : 'Recrue';
    const body = {
      parent: { database_id: NOTION_MEMBRES_DB },
      properties: {
        'Nom': { title: [{ text: { content: cand.nomPerso || '—' } }] },
        'Personnage': { rich_text: [{ text: { content: cand.nomPerso || '—' } }] },
        'Date d\'entrée': { date: { start: new Date().toISOString().split('T')[0] } },
        'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } },
        'Pôle': { select: { name: pole } },
        'Rang': { select: { name: rang } },
        'Statut': { select: { name: '✅ Actif' } },
        'Notes': { rich_text: [{ text: { content: `Accepté le ${fmtShort(new Date())}` } }] },
      }
    };
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    console.log(`✅ Notion Registre: ${cand.nomPerso} ajouté`);
  } catch(e) { console.log('❌ Notion registre error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// NOTION — SYNC REGISTRE → DISCORD (toutes les 15 min)
// ═══════════════════════════════════════════════════════════════
async function syncRegistreNotion(guild) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_MEMBRES_DB}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ sorts: [{ property: 'Nom', direction: 'ascending' }] })
    });
    const data = await res.json();
    if (!data.results) return;

    const logsCh = await getLogsCh(guild);
    const today = new Date();

    for (const page of data.results) {
      const nomIC = page.properties['Nom']?.title?.[0]?.plain_text || page.properties['Personnage']?.rich_text?.[0]?.plain_text;
      const statut = page.properties['Statut']?.select?.name;
      const derniereActivite = page.properties['Dernière activité']?.date?.start;
      const discordId = MEMBRES_DISCORD_MAP[nomIC];
      if (!discordId) continue;

      // Sync statut Notion → rôle Discord
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;

      // Alerte inactivité +7 jours
      if (derniereActivite) {
        const jours = Math.floor((today - new Date(derniereActivite)) / 86400000);
        if (jours >= 7 && statut === '✅ Actif' && logsCh) {
          await logsCh.send({ content: getMention(guild), embeds: [new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`⚠️ Inactivité Notion — ${nomIC}`)
            .setDescription(`**${nomIC}** est inactif depuis **${jours} jours** selon le Registre Notion.`)
            .addFields({ name: '📅 Dernière activité', value: fmtShort(derniereActivite), inline: true }, { name: '📋 Statut', value: statut || '—', inline: true })
            .setFooter({ text: 'IWC • Sync Registre Notion' })
          ] });
        }
      }
    }
  } catch(e) { console.log('❌ Sync registre error:', e.message); }
}

async function updateDashboard(guild) {
  const db = loadDB();
  const ch = getCh(guild, 'dashboard');
  if (!ch) return;
  const members  = Object.values(db.members);
  const contrats = db.contrats || [];
  const alertes  = members.filter(m => m.status === 'actif' && daysSince(m.lastActivity) > 7);
  const nextSess = db.sessions.filter(s => s.status === 'planifiee' && new Date(s.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 IRON WOLF COMPANY — TABLEAU DE BORD').setDescription('*Mise à jour automatique toutes les heures*')
    .addFields(
      { name: '👥 MEMBRES', value: `✅ Actifs : **${members.filter(m => m.status === 'actif').length}**\n⚠️ Absents : **${members.filter(m => m.status === 'absent').length}**\n❌ Inactifs : **${members.filter(m => m.status === 'inactif').length}**\n👁️ Total : **${members.filter(m => m.status !== 'parti').length}**`, inline: true },
      { name: '🎯 OPÉRATIONS', value: `🟢 En cours : **${db.operations.filter(o => o.status === 'en_cours').length}**\n🟡 Préparation : **${db.operations.filter(o => o.status === 'preparation').length}**\n✅ Terminées : **${db.operations.filter(o => o.status === 'terminee').length}**`, inline: true },
      { name: '📝 RECRUTEMENT', value: `📥 En attente : **${db.candidatures.filter(c => ['reçue', 'examen'].includes(c.status)).length}**\n✅ Acceptés : **${db.candidatures.filter(c => c.status === 'acceptee').length}**`, inline: true },
      { name: '📜 CONTRATS', value: `🟡 En attente : **${contrats.filter(c => c.status === 'en_attente').length}**\n✅ Signés : **${contrats.filter(c => c.status === 'signe').length}**\n❌ Refusés : **${contrats.filter(c => c.status === 'refuse').length}**`, inline: true },
      { name: '📅 PROCHAINE SESSION', value: nextSess ? `**${nextSess.name}**\n📍 ${nextSess.lieu || '—'}\n🗓️ ${fmtShort(nextSess.date)}` : '*Aucune session planifiée*', inline: true },
      { name: alertes.length > 0 ? '⚠️ ALERTES INACTIVITÉ' : '✅ AUCUNE ALERTE', value: alertes.length > 0 ? alertes.map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)}j`).join('\n') : '*Tous les membres sont actifs*', inline: true }
    )
    .setFooter({ text: `Dernière MàJ : ${new Date().toLocaleString('fr-FR')} • IWC 1895` });
  try {
    if (db.dashboardMsgId) {
      const msg = await ch.messages.fetch(db.dashboardMsgId).catch(() => null);
      if (msg) { await msg.edit({ embeds: [embed] }); return; }
    }
    const sent = await ch.send({ embeds: [embed] });
    db.dashboardMsgId = sent.id;
    saveDB(db);
  } catch (e) { console.log('Dashboard error:', e.message); }
}

async function autoSetup(guild) {
  const db = loadDB();
  console.log('🔧 Auto-setup en cours...');
  await updateDashboard(guild);

  const reglCh = getCh(guild, 'reglement', 'règlement');
  if (reglCh) {
    const msgs = await reglCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.content.includes('VALIDATION'));
    if (existing) { db.reglementMsgId = existing.id; }
    else if (!db.reglementMsgId) {
      const sent = await reglCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ VALIDATION DU RÈGLEMENT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nSi vous avez lu et accepté le règlement dans son intégralité, réagissez avec ✅\n\n*En réagissant, vous confirmez avoir compris et accepté chaque article du code de la Compagnie.*\n— La Direction');
      await sent.react('✅');
      db.reglementMsgId = sent.id;
    }
    saveDB(db);
  }

  const recrutCh = guild.channels.cache.get(CH.RECRUTEMENT);
  if (recrutCh) {
    const msgs = await recrutCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('RECRUTEMENT') && m.components.length > 0 && m.components[0]?.components?.length >= 2);
    if (existing) { db.recrutementMsgId = existing.id; }
    else {
      if (db.recrutementMsgId) { const old = await recrutCh.messages.fetch(db.recrutementMsgId).catch(() => null); if (old) await old.delete().catch(() => {}); db.recrutementMsgId = null; }
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('📋 IRON WOLF COMPANY — RECRUTEMENT')
        .setDescription('*On ne demande pas à rejoindre la Compagnie. On y est invité.*\n*Si vous êtes ici — vous avez été jugé digne de frapper à la porte.*')
        .addFields(
          { name: '⚖️ Recrutement Légal', value: '→ Tu exerces un métier légal au sein de la Compagnie\n→ Protection, escorte, commerce...\n→ Clique sur **⚖️ Candidature Légale**' },
          { name: '🔪 Recrutement Illégal', value: '→ Tu opères dans l\'ombre pour l\'organisation\n→ Contrebande, sécurité, assassinat...\n→ Clique sur **🔪 Candidature Illégale**' },
          { name: '⚠️ Important', value: '→ Réponse en DM sous 48h\n→ Aucune justification en cas de refus\n→ *La porte est ouverte une fois. Une seule.*' }
        ).setFooter({ text: 'Iron Wolf Company • Recrutement officiel' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_candidature_legal').setLabel('⚖️ Candidature Légale').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('open_candidature_illegal').setLabel('🔪 Candidature Illégale').setStyle(ButtonStyle.Danger)
      );
      const sent = await recrutCh.send({ embeds: [embed], components: [row] });
      db.recrutementMsgId = sent.id;
    }
    saveDB(db);
  }

  const contratsCh = guild.channels.cache.get(CH.CONTRATS);
  if (contratsCh) {
    const msgs = await contratsCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('CONTRATS'));
    if (!existing) {
      const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 IRON WOLF COMPANY — CONTRATS')
        .setDescription('*Tout accord entre la Compagnie et ses partenaires doit être formalisé.*\n*Un contrat signé engage les deux parties sans exception.*')
        .addFields(
          { name: '📤 Envoyer nos conditions', value: '→ Tu envoies tes tarifs & conditions à un client\n→ Le client signe → tu reçois la notification' },
          { name: '📥 Signer un contrat employeur', value: '→ Une entreprise vous engage\n→ Tu rentres ses infos & ses conditions\n→ Tu signes → ils reçoivent la notification' }
        ).setFooter({ text: 'Iron Wolf Company • Secrétariat officiel' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_contrat_offre').setLabel('📤 Envoyer nos conditions').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('open_contrat_emploi').setLabel('📥 Signer un contrat employeur').setStyle(ButtonStyle.Success)
      );
      await contratsCh.send({ embeds: [embed], components: [row] });
    }
  }

  const gradeCh = getCh(guild, 'grade');
  if (gradeCh) { const msgs = await gradeCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id)) await gradeCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎖️ GRADE — PRÉSENTE TON RANG IC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nPostez votre grade/rang **In Character** dans ce canal.\n\n**Format :**\n```\nNOM : \nRANG IC : \nSURNOM : \nSPÉCIALITÉ : \n```\n*Un seul message par membre. Mettez à jour si votre rang évolue.*'); }
  const surnomCh = getCh(guild, 'surnom-pseudo', 'surnom', 'pseudo');
  if (surnomCh) { const msgs = await surnomCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id)) await surnomCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎭 SURNOM / PSEUDO — IDENTITÉ IC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nRenseignez votre identité **In Character** pour faciliter les interactions RP.\n\n**Format :**\n```\nPSEUDO DISCORD : \nNOM IC : \nSURNOM IC : \nAPPARTENANCE : Légal / Illégal\n```\n*Un seul message par membre.*'); }
  const infoCh = getCh(guild, 'informateurs');
  if (infoCh) { const msgs = await infoCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id)) await infoCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🕵️ INFORMATEURS — CANAL CONFIDENTIEL\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n*Ce canal est réservé aux informations collectées sur le terrain.*\n*Discrétion absolue. Ce qui est posté ici ne sort pas de ces murs.*\n\n**Format de rapport :**\n```\nSOURCE : \nCIBLE / LIEU : \nINFORMATION : \nFIABILITÉ : Confirmée / Non confirmée\nDATE : \n```'); }
  const coffreCh = getCh(guild, 'coffre-entreprise', 'coffre');
  if (coffreCh) { const msgs = await coffreCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id && m.content.includes('COFFRE'))) await coffreCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 COFFRE ENTREPRISE — SUIVI DES FINANCES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nEnregistrez chaque mouvement financier de la Compagnie.\n\n**Format :**\n```\nTYPE      : Entrée / Sortie\nMONTANT   : $000\nOBJET     : description\nRESPONSABLE: \nSOLDE     : $000 (après opération)\n```\n*Toute transaction doit être enregistrée. Aucune exception.*'); }
  const coffreIllegCh = getCh(guild, 'coffre-illegal', 'coffreilleg');
  if (coffreIllegCh) { const msgs = await coffreIllegCh.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id && m.content.includes('COFFRE'))) await coffreIllegCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒 COFFRE — FINANCES ILLÉGALES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n*Ce canal est strictement confidentiel.*\n\n**Format :**\n```\nTYPE      : Entrée / Sortie\nMONTANT   : $000\nOBJET     : \nRESPONSABLE: \nSOLDE     : $000\n```'); }

  console.log('✅ Auto-setup terminé\n');
}

// ═══════════════════════════════════════════════════════════════
// NOTION AGENDA
// ═══════════════════════════════════════════════════════════════
async function notionQuery() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return [];
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Date', date: { on_or_after: new Date().toISOString() } }, sorts: [{ property: 'Date', direction: 'ascending' }] })
    });
    const data = await res.json();
    return (data.results || []).map(p => ({
      id: p.id,
      titre: p.properties.Titre?.title?.[0]?.plain_text || '—',
      date: p.properties.Date?.date?.start,
      heure: p.properties.Heure?.rich_text?.[0]?.plain_text,
      type: p.properties.Type?.select?.name || 'Réunion',
      participants: p.properties.Participants?.multi_select?.map(x => x.name) || [],
      lieu: p.properties.Lieu?.rich_text?.[0]?.plain_text || '—',
      notes: p.properties.Notes?.rich_text?.[0]?.plain_text,
      notif24: p.properties['Notif 24h']?.checkbox,
      notif1h: p.properties['Notif 1h']?.checkbox,
      notif15: p.properties['Notif 15min']?.checkbox,
      url: p.url,
    }));
  } catch(e) { return []; }
}

async function notionPatch(pageId, props) {
  if (!process.env.NOTION_TOKEN) return;
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties: props })
  }).catch(() => {});
}

async function sendParticipantDMs(guild, appt, embedTitle, embedColor) {
  const participants = appt.participants || [];
  for (const name of participants) {
    const discordId = PARTICIPANTS_MAP[name];
    if (!discordId || discordId.startsWith('<@&')) continue;
    try {
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      await member.send({ embeds: [new EmbedBuilder()
        .setColor(embedColor)
        .setTitle(embedTitle)
        .setDescription(`## 📅 ${appt.titre}`)
        .addFields(
          { name: '🗓️ Quand', value: `${fmtLong(appt.date)}${appt.heure ? ` à **${appt.heure}**` : ''}`, inline: true },
          { name: '📍 Lieu', value: appt.lieu, inline: true },
          ...(appt.notes ? [{ name: '📝 Notes', value: appt.notes }] : []),
          { name: '🔗 Voir sur Notion', value: `[Ouvrir](${appt.url})` }
        )
        .setFooter({ text: 'IWC • Rappel automatique' })
      ] });
    } catch(e) {}
  }
}

function buildParticipantMentions(participants) {
  return participants.map(name => {
    const val = PARTICIPANTS_MAP[name];
    if (!val) return null;
    if (val.startsWith('<@')) return val;
    return `<@${val}>`;
  }).filter(Boolean).join(' ');
}

async function checkAgenda(guild) {
  const appts = await notionQuery();
  const ch = getCh(guild, 'agenda', 'planning-sessions', 'planning');
  if (!ch || !appts.length) return;
  const mention = getMention(guild);

  for (const a of appts) {
    if (!a.date) continue;
    const dt = a.heure ? new Date(`${a.date}T${a.heure}`) : new Date(a.date);
    const mins = Math.floor((dt.getTime() - Date.now()) / 60000);
    const participantMentions = buildParticipantMentions(a.participants);
    const pingContent = participantMentions || mention;

    const mkEmbed = (title, color) => new EmbedBuilder().setColor(color).setTitle(title)
      .setDescription(`## 📅 ${a.titre}`)
      .addFields(
        { name: 'Quand', value: `${fmtLong(a.date)}${a.heure ? ` à **${a.heure}**` : ''}`, inline: true },
        { name: 'Lieu', value: a.lieu, inline: true },
        { name: 'Participants', value: a.participants.length > 0 ? a.participants.join(', ') : '—' },
        ...(a.notes ? [{ name: 'Notes', value: a.notes }] : []),
        { name: 'Modifier', value: `[Notion](${a.url})` }
      ).setFooter({ text: 'IWC • Secrétariat automatique' });

    if (!a.notif24 && mins <= 1440 && mins > 60) {
      await ch.send({ content: `${pingContent} — 📅 RDV dans 24h`, embeds: [mkEmbed('📅 Rappel — 24 heures', 0x5865F2)] });
      await sendParticipantDMs(guild, a, '📅 Rappel — RDV dans 24h', 0x5865F2);
      await notionPatch(a.id, { 'Notif 24h': { checkbox: true } });
    }
    if (!a.notif1h && mins <= 60 && mins > 15) {
      await ch.send({ content: `${pingContent} — ⏰ RDV dans 1 heure`, embeds: [mkEmbed('⏰ Rappel — 1 heure', 0xFFA500)] });
      await sendParticipantDMs(guild, a, '⏰ Rappel — RDV dans 1 heure', 0xFFA500);
      await notionPatch(a.id, { 'Notif 1h': { checkbox: true } });
    }
    if (!a.notif15 && mins <= 15 && mins > 0) {
      await ch.send({ content: `${pingContent} — 🚨 15 minutes !`, embeds: [mkEmbed('🚨 URGENT — 15 min', 0xED4245)] });
      await sendParticipantDMs(guild, a, '🚨 URGENT — RDV dans 15 minutes !', 0xED4245);
      await notionPatch(a.id, { 'Notif 15min': { checkbox: true } });
    }
  }
}

async function postDailyAgenda(guild) {
  const ch = getCh(guild, 'agenda', 'planning-sessions', 'planning');
  if (!ch) return;
  const appts = await notionQuery();
  const today = new Date().toISOString().split('T')[0];
  const todayA = appts.filter(a => a.date?.startsWith(today));
  const weekA  = appts.filter(a => { if (!a.date) return false; const d = new Date(a.date); return d >= new Date() && d <= new Date(Date.now() + 7*86400000); });
  const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📅 Agenda — ${fmtLong(new Date())}`)
    .setDescription(todayA.length === 0 ? '*Aucun rendez-vous aujourd\'hui.*' : todayA.map(a => `📅 **${a.titre}**\n🕐 ${a.heure || '—'} · 📍 ${a.lieu} · 👥 ${a.participants.join(', ') || '—'}`).join('\n\n'));
  const nw = weekA.filter(a => !a.date?.startsWith(today)).slice(0, 5);
  if (nw.length) embed.addFields({ name: '📆 Cette semaine', value: nw.map(a => `📅 **${a.titre}** — ${fmtShort(a.date)} ${a.heure || ''}`).join('\n') });
  embed.setFooter({ text: 'IWC • Secrétariat automatique' });
  await ch.send({ embeds: [embed] });
}

client.on('guildMemberAdd', async member => {
  const db = loadDB(); const guild = member.guild;
  const visiteurRole = guild.roles.cache.find(r => r.name.includes('Visiteur'));
  if (visiteurRole) await member.roles.add(visiteurRole).catch(() => {});
  db.members[member.id] = { id: member.id, name: member.user.username, status: 'visiteur', rang: 'Visiteur', joinedAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
  saveDB(db);
  const arriveesCh = getCh(guild, 'arrivees', 'arrivée');
  if (arriveesCh) {
    await arriveesCh.send({ embeds: [new EmbedBuilder().setColor(0x8B5A2A).setTitle('👁️ Nouveau visiteur')
      .setDescription(`**${member.user.username}** a rejoint le serveur.\nDirigé vers **#règlement** pour validation.`)
      .addFields({ name: 'Compte créé le', value: fmtShort(member.user.createdAt), inline: true }, { name: 'Âge du compte', value: `${daysSince(member.user.createdAt)} jours`, inline: true })
      .setThumbnail(member.user.displayAvatarURL()).setFooter({ text: 'IWC • Automatique' })] });
  }
  await sendLog(guild, 'ARRIVEE', { userId: member.id, username: member.user.username, accountAge: daysSince(member.user.createdAt) });
  if (daysSince(member.user.createdAt) < 7) {
    await sendLog(guild, 'COMPTE_SUSPECT', { userId: member.id, username: member.user.username, accountAge: daysSince(member.user.createdAt) });
    const logsCh = await getLogsCh(guild);
    if (logsCh) await logsCh.send({ content: `${getMention(guild)} — ⚠️ Compte suspect (<@${member.id}> — ${daysSince(member.user.createdAt)} jours)` });
  }
  member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Iron Wolf Company').setDescription('Bienvenue sur le serveur.\n\nLis le **#règlement** et réagis avec ✅ pour accéder au recrutement.\n\n*La porte est ouverte une fois. Une seule.*').setFooter({ text: '— La Direction, IWC' })] }).catch(() => {});
});

client.on('guildMemberRemove', async member => {
  const db = loadDB(); const m = db.members[member.id];
  await sendLog(member.guild, 'DEPART', { username: member.user.username, rang: m?.rang, duree: m ? daysSince(m.joinedAt) + ' jours' : '—' });
  if (db.members[member.id]) { db.members[member.id].status = 'parti'; db.members[member.id].leftAt = new Date().toISOString(); saveDB(db); }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});
  const db = loadDB(); const guild = reaction.message.guild;
  if (!guild) return;

  if (reaction.message.id === db.reglementMsgId && reaction.emoji.name === '✅') {
    await sendLog(guild, 'REGLEMENT_VALIDE', { userId: user.id, username: user.username });
    const logsCh = await getLogsCh(guild);
    if (logsCh) await logsCh.send({ content: `${getMention(guild)} — **${user.username}** a validé le règlement.` });
    return;
  }

  if (reaction.emoji.name === '✅') {
    const title = reaction.message.embeds[0]?.title || '';
    if (!title.includes('DOSSIER')) return;
    const isIllegal = title.includes('ILLÉGAL');
    const nom = title.replace(/📁 \[.*?\] DOSSIER (LÉGAL|ILLÉGAL) — /, '').replace(/✅ ACCEPTÉ — /, '').trim();
    const cand = db.candidatures.find(c => c.nomPerso === nom && c.status === 'reçue');
    if (!cand) return;
    const reactUsers = await reaction.users.fetch();
    const voteCount = reactUsers.filter(u => !u.bot).size;
    if (voteCount < 2) {
      const msg = await reaction.message.channel.send({ content: `⏳ **${voteCount}/2 votes** pour accepter **${cand.nomPerso}**. Il manque **${2 - voteCount} vote(s)**.` });
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }
    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (!member) return;
    if (isIllegal) {
      const role = guild.roles.cache.find(r => r.name.includes('Maudit') || r.name.includes('Ombre'));
      if (role) await member.roles.add(role).catch(() => {});
      member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🔪 Bienvenue dans l\'ombre — La Confrérie').setDescription('Tu as été **accepté** au sein de la Confrérie.\n\nDiscrétion absolue.\n\n*Ne fais confiance qu\'à ceux que la Direction te désignera.*\n— La Direction').setFooter({ text: 'La Confrérie • Confidentiel' })] }).catch(() => {});
      const annCh = guild.channels.cache.get(CH.DOSSIER_ILLEG);
      if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🔪 La Confrérie — Nouveau visage dans l\'ombre').setDescription(`**${cand.nomPerso}** a intégré la Confrérie.\n*Certains chemins ne se montrent pas à la lumière.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` })] });
    } else {
      const role = guild.roles.cache.find(r => r.name.includes('Recrue') || r.name.includes('Employé'));
      if (role) await member.roles.add(role).catch(() => {});
      member.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Candidature acceptée — Iron Wolf Company').setDescription('Ta candidature a été **acceptée**.\n\nLa période d\'observation commence maintenant.\n\n*Tu connais les règles. Tu connais les attentes.*\n— La Direction').setFooter({ text: 'Iron Wolf Company • Légal' })] }).catch(() => {});
      const annCh = guild.channels.cache.get(CH.DOSSIER_LEGAL);
      if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Nouveau membre — Iron Wolf Company').setDescription(`**${cand.nomPerso}** rejoint la Compagnie.\n*Bienvenue dans la meute.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` })] });
    }
    cand.status = 'acceptee'; cand.acceptedAt = new Date().toISOString(); saveDB(db);
    // ✅ ARCHIVAGE + AJOUT AU REGISTRE NOTION + FICHE PERSONNAGE
    await archiverCandidatureNotion(cand, 'acceptee', user.username);
    await ajouterMembreNotion(cand, cand.type);
    await notionExtra.creerFichePersonnageNotion?.(cand);
    await sendLog(guild, 'CANDIDATURE_ACCEPTEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal', validePar: user.username });
    try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(isIllegal ? 0x8B1A1A : 0x3B82F6).setTitle(`✅ ACCEPTÉ — ${cand.nomPerso}`)] }); } catch(e) {}
    return;
  }

  if (reaction.emoji.name === '❌') {
    const title = reaction.message.embeds[0]?.title || '';
    if (!title.includes('DOSSIER')) return;
    const isIllegal = title.includes('ILLÉGAL');
    const nom = title.replace(/📁 \[.*?\] DOSSIER (LÉGAL|ILLÉGAL) — /, '').trim();
    const cand = db.candidatures.find(c => c.nomPerso === nom && c.status === 'reçue');
    if (!cand) return;
    const refuseUsers = await reaction.users.fetch();
    const refuseCount = refuseUsers.filter(u => !u.bot).size;
    if (refuseCount < 2) {
      const msg = await reaction.message.channel.send({ content: `⏳ **${refuseCount}/2 votes** pour refuser **${cand.nomPerso}**. Il manque **${2 - refuseCount} vote(s)**.` });
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }
    cand.status = 'refusee'; saveDB(db);
    // ✅ ARCHIVAGE AUTOMATIQUE NOTION
    await archiverCandidatureNotion(cand, 'refusee', user.username);
    await sendLog(guild, 'CANDIDATURE_REFUSEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal' });
    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (member) {
      const msg = isIllegal
        ? new EmbedBuilder().setColor(0x555555).setTitle('La Confrérie').setDescription('Ta demande n\'a pas été retenue.\n\n*On ne donne pas d\'explication.*\n— La Direction').setFooter({ text: 'La Confrérie • Confidentiel' })
        : new EmbedBuilder().setColor(0xED4245).setTitle('Iron Wolf Company').setDescription('Ta candidature n\'a pas été retenue.\n\n*La Direction se réserve le droit de refuser sans justification.*\n— La Direction').setFooter({ text: 'Iron Wolf Company • Légal' });
      member.send({ embeds: [msg] }).catch(() => {});
    }
    try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(0xED4245).setTitle(`❌ REFUSÉ — ${cand.nomPerso}`)] }); } catch(e) {}
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const db = loadDB(); const guild = message.guild;
  if (db.members[message.author.id]) { db.members[message.author.id].lastActivity = new Date().toISOString(); saveDB(db); }

  const absCh = getCh(guild, 'absences');
  if (absCh && message.channel.id === absCh.id) {
    if (db.members[message.author.id]) { db.members[message.author.id].status = 'absent'; saveDB(db); await message.react('✅'); }
    await sendLog(guild, 'ABSENCE', { userId: message.author.id, username: message.author.username });
    return;
  }

  const suggCh = getCh(guild, 'suggestion-idee', 'suggestions', 'suggestion');
  if (suggCh && message.channel.id === suggCh.id) { await message.react('✅').catch(() => {}); await message.react('❌').catch(() => {}); return; }

  const clipCh = getCh(guild, 'clips-temps-fort', 'clips-highlights', 'clips');
  if (clipCh && message.channel.id === clipCh.id && message.attachments.size > 0) { await message.react('🔥').catch(() => {}); await message.react('❤️').catch(() => {}); return; }

  // 💰 COFFRES — suivi financier automatique → Notion Trésorerie
  const coffreCh      = getCh(guild, 'coffre-entreprise', 'coffre');
  const coffreIllegCh = getCh(guild, 'coffre-illegal', 'coffreilleg');
  const coffreType = (coffreCh && message.channel.id === coffreCh.id) ? 'legal'
                   : (coffreIllegCh && message.channel.id === coffreIllegCh.id) ? 'illegal' : null;
  if (coffreType) {
    const up = message.content.toUpperCase();
    if (up.includes('TYPE') && up.includes('MONTANT')) {
      const lines = message.content.split('\n');
      const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() : ''; };
      const type = get('TYPE').toLowerCase().includes('sort') ? 'Sortie' : 'Entrée';
      const montant = (() => { const n = parseInt((get('MONTANT') || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; })();
      const objet = get('OBJET') || '—';
      const responsable = get('RESPONSABLE') || message.author.username;
      db.coffres = db.coffres || { legal: 0, illegal: 0 };
      db.coffres[coffreType] += (type === 'Sortie' ? -montant : montant);
      const solde = db.coffres[coffreType];
      saveDB(db);
      await notionExtra.enregistrerTransactionNotion?.({ type, coffre: coffreType === 'illegal' ? '🔒 Illégal' : '💰 Légal', montant, objet, responsable, solde });
      await message.react('✅').catch(() => {});
      await message.channel.send({ embeds: [new EmbedBuilder().setColor(type === 'Sortie' ? 0xED4245 : 0x57F287)
        .setTitle(`${type === 'Sortie' ? '📤 Sortie' : '📥 Entrée'} — $${montant.toLocaleString('fr-FR')}`)
        .addFields({ name: 'Objet', value: objet, inline: true }, { name: 'Responsable', value: responsable, inline: true }, { name: '💰 Solde', value: `**$${solde.toLocaleString('fr-FR')}**`, inline: true })
        .setFooter({ text: 'IWC • Trésorerie automatique' })] });
    }
    return;
  }

  const opsCh = getCh(guild, 'operations-en-cours', 'operations');
  if (opsCh && message.channel.id === opsCh.id && isDirection(message.member)) {
    if (message.content.toUpperCase().includes('OPÉRATION') || message.content.toUpperCase().includes('OPERATION')) {
      const lines = message.content.split('\n');
      const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() || '—' : '—'; };
      const op = { id: Date.now().toString(), name: get('NOM'), lieu: get('LIEU'), objectif: get('OBJECTIF'), equipe: get('ÉQUIPE') || get('EQUIPE'), status: 'preparation', createdAt: new Date().toISOString() };
      db.operations.push(op);
      op.notionPageId = await notionExtra.creerOperationNotion?.(op);
      saveDB(db);
      await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' });
      const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(`🎯 OPÉRATION — ${op.name}`)
        .addFields({ name: 'Statut', value: '🟡 En préparation', inline: true }, { name: 'Lieu', value: op.lieu, inline: true }, { name: 'Équipe', value: op.equipe }, { name: 'Objectif', value: op.objectif })
        .setFooter({ text: `ID: ${op.id} • ${fmtShort(new Date())}` });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
      );
      await opsCh.send({ embeds: [embed], components: [row] });
      await message.react('✅');
    }
    return;
  }

  const planCh = getCh(guild, 'planning-sessions', 'planning');
  if (planCh && message.channel.id === planCh.id && isDirection(message.member)) {
    if (message.content.toUpperCase().includes('SESSION') && message.content.toUpperCase().includes('DATE')) {
      const lines = message.content.split('\n');
      const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() || '—' : '—'; };
      const session = { id: Date.now().toString(), name: get('NOM') || get('SESSION'), date: get('DATE'), heure: get('HEURE'), lieu: get('LIEU'), type: get('TYPE') || 'RP Principal', status: 'planifiee' };
      db.sessions.push(session); saveDB(db);
      const embed = new EmbedBuilder().setColor(0x5865F2).setTitle(`📅 SESSION — ${session.name}`)
        .addFields({ name: 'Date & Heure', value: `${session.date} à ${session.heure}`, inline: true }, { name: 'Lieu IC', value: session.lieu, inline: true }, { name: 'Type', value: session.type, inline: true })
        .setDescription('Confirmez votre présence :').setFooter({ text: 'IWC • Rappel automatique 1h avant' });
      const sent = await planCh.send({ embeds: [embed] });
      await sent.react('✅'); await sent.react('❌');
      try {
        const dt = new Date(`${session.date.split('/').reverse().join('-')}T${session.heure}`);
        const delay = dt.getTime() - Date.now() - 3600000;
        if (delay > 0) setTimeout(async () => { await planCh.send({ content: getMention(guild), embeds: [new EmbedBuilder().setColor(0xFF6B35).setTitle(`⏰ RAPPEL — ${session.name} dans 1 heure`).setDescription(`📍 ${session.lieu} · 🕐 ${session.heure}`).setFooter({ text: 'IWC • Rappel automatique' })] }); }, delay);
      } catch(e) {}
      await message.react('✅');
    }
  }
});

client.on('interactionCreate', async interaction => {
  const guild = interaction.guild;
  const db = loadDB();

  if (interaction.isButton() && interaction.customId === 'open_candidature_legal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_legal').setTitle('⚖️ Iron Wolf Company — Légal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom du personnage').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Jonas Caverly')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age_perso').setLabel('Âge du personnage').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 34 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('metier').setLabel('Métier / Compétences légales').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Médecin, Avocat, Marchand...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Qui est ton personnage ? Son passé...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités & Expérience RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine, week-end / Confirmé')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isButton() && interaction.customId === 'open_candidature_illegal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_illegal').setTitle('🔪 Organisation Hors la Loi — Illégal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom du personnage').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Viktor Crane')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age_perso').setLabel('Âge du personnage').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 29 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('specialite').setLabel('Spécialité / Activités').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Contrebande, Sécurité, Bras droit...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Qui est ton personnage ? Ce qui l\'a amené dans l\'ombre...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités & Expérience RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine, week-end / Confirmé')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_legal') {
    await interaction.deferReply({ ephemeral: true });
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: interaction.fields.getTextInputValue('nom_perso'), agePerso: interaction.fields.getTextInputValue('age_perso'), metier: interaction.fields.getTextInputValue('metier'), background: interaction.fields.getTextInputValue('background'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'legal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    await interaction.editReply({ content: '✅ **Candidature légale transmise.**\nRéponse en DM sous 48h.\n*La Compagnie ne recrute pas au hasard.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '⚖️ Légal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('📥 Candidature légale reçue — IWC').setDescription('Ta candidature a bien été transmise à la Direction.\n\nUne réponse en DM sous 48h.\n\n*La Compagnie choisit ses membres avec soin.*\n— La Direction').setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_LEGAL);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ${cand.nomPerso}`)
        .setDescription(`> *"Chaque talent a sa place au sein de la Compagnie."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**⚖️ TYPE : RECRUTEMENT LÉGAL**`)
        .addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '💼 Métier', value: cand.metier }, { name: '📖 Background', value: cand.background.slice(0, 1000) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' })
        .setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `IWC • Légal • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 📋 Nouveau dossier **LÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[LÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** ⚖️\n\nÉchangez ici avant de voter.`); } catch(e) {}
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_illegal') {
    await interaction.deferReply({ ephemeral: true });
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: interaction.fields.getTextInputValue('nom_perso'), agePerso: interaction.fields.getTextInputValue('age_perso'), specialite: interaction.fields.getTextInputValue('specialite'), background: interaction.fields.getTextInputValue('background'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'illegal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    await interaction.editReply({ content: '🔒 **Dossier transmis.**\nReste discret.\n*On te contactera si tu es jugé digne.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '🔪 Illégal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🔒 Dossier transmis — IWC').setDescription('Ton dossier a été acheminé aux bonnes personnes.\n\nUne réponse en DM sous 48h.\n\n*Ne parle de cela à personne.*\n— La Direction').setFooter({ text: 'Iron Wolf Company • Confidentiel' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_ILLEG);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ${cand.nomPerso}`)
        .setDescription(`> *"L'ombre protège ceux qui savent s'y fondre."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**🔪 TYPE : RECRUTEMENT ILLÉGAL**`)
        .addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '🔪 Spécialité', value: cand.specialite }, { name: '📖 Background', value: cand.background.slice(0, 1000) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' })
        .setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `La Confrérie • CONFIDENTIEL • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 🔪 Nouveau dossier **ILLÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[ILLÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** 🔪\n\nÉchangez ici avant de voter.`); } catch(e) {}
    }
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('op_')) {
    const [, status, opId] = interaction.customId.split('_');
    const op = db.operations.find(o => o.id === opId);
    if (!op) return interaction.reply({ content: '❌ Opération introuvable.', ephemeral: true });
    const labels = { encours: '🟢 En cours', terminee: '✅ Terminée', annulee: '❌ Annulée' };
    const colors = { encours: 0x00AA00, terminee: 0x57F287, annulee: 0xED4245 };
    op.status = status === 'encours' ? 'en_cours' : status;
    if (status === 'terminee') op.endedAt = new Date().toISOString();
    saveDB(db);
    await notionExtra.majOperationNotion?.(op);
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: labels[status] || status });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(colors[status] || 0x8B5A2A).spliceFields(0, 1, { name: 'Statut', value: labels[status] || status, inline: true });
    await interaction.update({ embeds: [updated], components: ['terminee', 'annulee'].includes(status) ? [] : interaction.message.components });
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_offre') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true }); return; }
    const modal = new ModalBuilder().setCustomId('contrat_offre_modal').setTitle('📤 Nos conditions — Contrat client');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('client_nom').setLabel('Nom / Entreprise du client').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Famille Moreau...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection rapprochée...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nos_conditions').setLabel('Nos conditions & ce qu\'on exige').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Nos règles, limites...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Notre rémunération souhaitée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1500$ + 500$/jour')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord du client').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Clic droit → Copier l\'identifiant')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'contrat_offre_modal') {
    await interaction.deferReply({ ephemeral: true });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-OF-' + Date.now().toString().slice(-5);
    const contrat = { id: contratId, type: 'offre', clientNom: interaction.fields.getTextInputValue('client_nom'), objet: interaction.fields.getTextInputValue('objet'), nosConditions: interaction.fields.getTextInputValue('nos_conditions'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), emetteurId: interaction.user.id, emetteurNom: interaction.user.username, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    await interaction.editReply({ content: '✅ Contrat **' + contratId + '** envoyé au client.' });
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📤 CONTRAT DE PRESTATION — ' + contratId)
      .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — OFFRE DE PRESTATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
      .addFields({ name: '🆔 Référence', value: '`' + contratId + '`', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '📋 Objet', value: contrat.objet }, { name: '🏢 Nos conditions', value: contrat.nosConditions }, { name: '💰 Rémunération souhaitée', value: contrat.remuneration }, { name: '📌 Statut', value: '🟡 En attente de signature', inline: true })
      .setFooter({ text: 'Iron Wolf Company • ' + fmtShort(new Date()) });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('signer_offre_' + contratId).setLabel('✍️ J\'accepte les termes').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('refuser_offre_' + contratId).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
    );
    const ch = guild.channels.cache.get(CH.CONTRATS);
    if (ch) await ch.send({ content: `<@${contrat.userId}> — Iron Wolf Company vous soumet un contrat.`, embeds: [embed], components: [row] });
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📤 Contrat — IWC').setDescription(`L\'IWC vous soumet le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}\n\nRépondez dans **#contrats**.`).setFooter({ text: 'Iron Wolf Company' })] }); } catch(e) {}
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('signer_offre_')) {
    const contratId = interaction.customId.replace('signer_offre_', '');
    if (!db.contrats) db.contrats = [];
    const contrat = db.contrats.find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.userId !== interaction.user.id) { await interaction.reply({ content: '❌ Ce contrat ne vous est pas destiné.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: interaction.user.username + ' (' + contrat.clientNom + ')' });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: '✅ Signé le ' + fmtShort(new Date()) + ' par ' + interaction.user.username, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_SIGNE, { embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ CONTRAT ACCEPTÉ — ' + contratId).addFields({ name: '🆔 Réf', value: '`' + contratId + '`', inline: true }, { name: '📅 Signé', value: fmtShort(new Date()), inline: true }, { name: '✍️ Client', value: interaction.user.username + ' (' + contrat.clientNom + ')', inline: true }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: 'IWC • ' + fmtShort(new Date()) })] });
    try { const emetteur = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (emetteur) await emetteur.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — ' + contratId).setDescription(`**${contrat.clientNom}** a accepté le contrat.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Notification contrat' })] }); } catch(e) {}
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — IWC').setDescription(`Vous avez accepté le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}\n\n*Iron Wolf Company a été notifié.*`).setFooter({ text: 'IWC • Document Officiel' })] }).catch(() => {});
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('refuser_offre_')) {
    const contratId = interaction.customId.replace('refuser_offre_', '');
    if (!db.contrats) db.contrats = [];
    const contrat = db.contrats.find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.userId !== interaction.user.id) { await interaction.reply({ content: '❌ Ce contrat ne vous est pas destiné.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: '❌ Refusé le ' + fmtShort(new Date()), inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_REFUSE, { embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ CONTRAT REFUSÉ — ' + contratId).addFields({ name: '🆔 Réf', value: '`' + contratId + '`', inline: true }, { name: '👤 Refusé par', value: interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: 'IWC • ' + fmtShort(new Date()) })] });
    try { const emetteur = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (emetteur) await emetteur.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Contrat refusé — ' + contratId).setDescription(`**${contrat.clientNom}** a refusé le contrat pour **${contrat.objet}**.`).setFooter({ text: 'IWC • Notification' })] }); } catch(e) {}
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_emploi') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true }); return; }
    const modal = new ModalBuilder().setCustomId('contrat_emploi_modal').setTitle('📥 Contrat employeur — À signer');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('employeur_nom').setLabel('Nom de l\'employeur').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Société Moreau...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection du convoi...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('leurs_conditions').setLabel('Conditions de l\'employeur').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Ce qu\'ils exigent...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération proposée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 2000$ à la livraison')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord de l\'employeur').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Clic droit → Copier l\'identifiant')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'contrat_emploi_modal') {
    await interaction.deferReply({ ephemeral: true });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-EM-' + Date.now().toString().slice(-5);
    const contrat = { id: contratId, type: 'emploi', employeurNom: interaction.fields.getTextInputValue('employeur_nom'), objet: interaction.fields.getTextInputValue('objet'), leursConditions: interaction.fields.getTextInputValue('leurs_conditions'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), signataire: interaction.user.username, signataireId: interaction.user.id, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    await interaction.editReply({ content: '📋 Contrat **' + contratId + '** créé. La Direction va examiner ce contrat.' });
    const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle('📥 CONTRAT EMPLOYEUR — ' + contratId)
      .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  CONTRAT PROPOSÉ À IRON WOLF COMPANY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
      .addFields({ name: '🆔 Référence', value: '`' + contratId + '`', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '🏭 Employeur — ' + contrat.employeurNom, value: contrat.leursConditions }, { name: '💰 Rémunération', value: contrat.remuneration }, { name: '📋 Objet', value: contrat.objet }, { name: '📌 Statut', value: '🟡 En attente de notre signature', inline: true })
      .setFooter({ text: 'IWC • Contrat Employeur • ' + fmtShort(new Date()) });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('signer_emploi_' + contratId).setLabel('✍️ Signer & Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('refuser_emploi_' + contratId).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger)
    );
    const ch = guild.channels.cache.get(CH.CONTRATS);
    if (ch) await ch.send({ content: `${getContratMention(guild)} — 📥 Nouveau contrat employeur à examiner.`, embeds: [embed], components: [row] });
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('signer_emploi_')) {
    const contratId = interaction.customId.replace('signer_emploi_', '');
    if (!db.contrats) db.contrats = [];
    const contrat = db.contrats.find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut signer.', ephemeral: true }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); contrat.signedBy = interaction.user.username; saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: interaction.user.username + ' — IWC' });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: '✅ Signé le ' + fmtShort(new Date()) + ' par ' + interaction.user.username, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_SIGNE, { embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ CONTRAT EMPLOYEUR SIGNÉ — ' + contratId).addFields({ name: '🆔 Réf', value: '`' + contratId + '`', inline: true }, { name: '📅 Signé', value: fmtShort(new Date()), inline: true }, { name: '✍️ Signé par', value: interaction.user.username, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: 'IWC • ' + fmtShort(new Date()) })] });
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — IWC').setDescription(`Iron Wolf Company a **signé** le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Notification' })] }); } catch(e) {}
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('refuser_emploi_')) {
    const contratId = interaction.customId.replace('refuser_emploi_', '');
    if (!db.contrats) db.contrats = [];
    const contrat = db.contrats.find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut décliner.', ephemeral: true }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: '❌ Décliné le ' + fmtShort(new Date()), inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_REFUSE, { embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ CONTRAT EMPLOYEUR DÉCLINÉ — ' + contratId).addFields({ name: '🆔 Réf', value: '`' + contratId + '`', inline: true }, { name: '👤 Décliné par', value: interaction.user.username, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: 'IWC • ' + fmtShort(new Date()) })] });
    return;
  }
});

// ═══════════════════════════════════════════════════════════════
// READY + CRON
// ═══════════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  client.user.setActivity('la meute • IWC 1895', { type: ActivityType.Watching });

  for (const guild of client.guilds.cache.values()) {
    await autoSetup(guild).catch(e => console.log('autoSetup error:', e.message));
  }

  cron.schedule('*/5 * * * *',  async () => { for (const g of client.guilds.cache.values()) await checkAgenda(g).catch(() => {}); });        // agenda
  cron.schedule('0 * * * *',    async () => { for (const g of client.guilds.cache.values()) await updateDashboard(g).catch(() => {}); });   // dashboard horaire
  cron.schedule('*/15 * * * *', async () => { for (const g of client.guilds.cache.values()) await syncRegistreNotion(g).catch(() => {}); });// sync Notion 15min
  cron.schedule('0 9 * * *',    async () => { for (const g of client.guilds.cache.values()) await postDailyAgenda(g).catch(() => {}); }, { timezone: 'Europe/Paris' }); // agenda du jour
  cron.schedule('0 20 * * 0',   async () => { for (const g of client.guilds.cache.values()) { try { await notionExtra.postStatsHebdo?.(g); } catch (e) { console.log(e.message); } } }, { timezone: 'Europe/Paris' }); // stats hebdo dimanche 20h
});

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);

