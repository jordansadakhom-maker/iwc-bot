require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ChannelType, ActivityType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const cron = require('node-cron');

// ── Base de données avec cache ──
const { loadDB, saveDB, saveDBSync, sauvegarderSurGitHub, restaurerDepuisGitHub } = require('./db');

// ── Module Notion ──
let notionExtra = {};
try { notionExtra = require('./notion-extra'); console.log('✅ Module notion-extra chargé'); }
catch (e) { console.log('⚠️ notion-extra non chargé:', e.message); }

// ── Graceful shutdown ──
process.on('SIGTERM', () => { saveDBSync(); process.exit(0); });
process.on('SIGINT',  () => { saveDBSync(); process.exit(0); });

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
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel, Partials.GuildMember],
});

// ── IDs canaux ──
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
  'Thomas Galagan': '982201491773354035',
  'Jonas Caverly':  '944208797084311583',
  'Cyrus Hollow':   '324627678143578112',
  'June McCall':    '998581854791798835',
  'Colt Kane':      '696325126047662081',
  'Pôle Légal':     '<@&1508756436082102303>',
  'Pôle Illégal':   '<@&1508756479274913903>',
};

const CONTRAT_ROLES    = ['1508289999035039875', '1508290320763195482', '1508292278953836655'];
const JUNE_MCCALL_ID   = '998581854791798835';
const ROLE_POLE_LEGAL  = '1508756436082102303';
const ROLE_POLE_ILLEGAL= '1508756479274913903';

const NOTION_RECRUTEMENT_DB = process.env.NOTION_RECRUTEMENT_DB || '36ef4436a86c81de9f1acf55c5ad4076';
const NOTION_MEMBRES_DB     = process.env.NOTION_MEMBRES_DB     || '36ef4436a86c818d99a4dd875efec4e3';

const MEMBRES_DISCORD_MAP = {
  'Colt Kane':      '696325126047662081',
  'June McCall':    '998581854791798835',
  'Cyrus Hollow':   '324627678143578112',
  'Jonas Caverly':  '944208797084311583',
  'Thomas Galagan': '982201491773354035',
};
const DISCORD_TO_IC = Object.fromEntries(Object.entries(MEMBRES_DISCORD_MAP).map(([n, id]) => [id, n]));

// ── Helpers ──
function nomParticipant(member) {
  return DISCORD_TO_IC[member.id] || member.user?.username || member.displayName || 'Inconnu';
}
function daysSince(d)  { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function fmtLong(d)    { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function fmtShort(d)   { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }

function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      clean(c.name).includes(clean(name))
    );
    if (ch) return ch;
  }
  return null;
}

// getCh strict — évite les correspondances partielles ambiguës
function getChExact(guild, name) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return guild.channels.cache.find(c =>
    [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
    clean(c.name) === clean(name)
  ) || null;
}

function getMention(guild) {
  return guild.roles.cache
    .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
    .map(r => `<@&${r.id}>`).join(' ') || '';
}
function getContratMention(guild) {
  const roles = CONTRAT_ROLES.map(id => guild.roles.cache.get(id)).filter(Boolean).map(r => `<@&${r.id}>`);
  return [...roles, `<@${JUNE_MCCALL_ID}>`].join(' ');
}
function isDirection(member) {
  return member?.roles.cache.some(r =>
    ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'].some(n => r.name.includes(n))
  );
}

async function getLogsCh(guild) {
  let ch = guild.channels.cache.get(CH.LOGS);
  if (!ch) ch = await guild.channels.fetch(CH.LOGS).catch(() => null);
  return ch;
}

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
      } catch {}
    }
  } catch (e) { console.log('sendToThread error:', e.message); }
  return false;
}

// ── Logs Discord ──
async function sendLog(guild, type, data) {
  const ch = await getLogsCh(guild);
  if (!ch) return;
  const cfgs = {
    ARRIVEE:              { color: 0x57F287, emoji: '👋', title: 'ARRIVÉE — '              + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '🔢 Âge du compte', value: data.accountAge + ' jours', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    DEPART:               { color: 0x555555, emoji: '🚪', title: 'DÉPART — '               + data.username,  fields: [{ name: '👤 Membre', value: data.username, inline: true }, { name: '🎖️ Rang', value: data.rang || '—', inline: true }, { name: '⏱️ Durée', value: data.duree || '—', inline: true }] },
    REGLEMENT_VALIDE:     { color: 0x3B82F6, emoji: '📜', title: 'RÈGLEMENT VALIDÉ — '     + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_RECUE:    { color: 0xFFA500, emoji: '📥', title: 'CANDIDATURE REÇUE — '    + data.nomPerso,  fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_ACCEPTEE: { color: 0x57F287, emoji: '✅', title: 'CANDIDATURE ACCEPTÉE — ' + data.nomPerso,  fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '✅ Par', value: data.validePar || '—', inline: true }] },
    CANDIDATURE_REFUSEE:  { color: 0xED4245, emoji: '❌', title: 'CANDIDATURE REFUSÉE — '  + data.nomPerso,  fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }] },
    ABSENCE:              { color: 0xFFA500, emoji: '🟡', title: 'ABSENCE — '               + data.username,  fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CONTRAT_SIGNE:        { color: 0x57F287, emoji: '📜', title: 'CONTRAT SIGNÉ — '        + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }, { name: '✍️ Signé par', value: data.signe, inline: true }] },
    CONTRAT_REFUSE:       { color: 0xED4245, emoji: '📜', title: 'CONTRAT REFUSÉ — '       + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }] },
    OPERATION:            { color: 0xFFA500, emoji: '🎯', title: 'OPÉRATION — '            + data.nom,       fields: [{ name: '🎯 Nom', value: data.nom, inline: true }, { name: '📍 Lieu', value: data.lieu || '—', inline: true }, { name: '📋 Statut', value: data.statut || '—', inline: true }] },
  };
  const cfg = cfgs[type];
  if (!cfg) return;
  await ch.send({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(cfg.emoji + ' ' + cfg.title).addFields(...cfg.fields).setFooter({ text: 'IWC • Logs • ' + new Date().toLocaleString('fr-FR') })] }).catch(e => console.log('Log error:', e.message));
}

// ── Notion — Archiver candidature ──
async function archiverCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { database_id: NOTION_RECRUTEMENT_DB },
        properties: {
          'Nom personnage': { title: [{ text: { content: cand.nomPerso || '—' } }] },
          'Date réception': { date: { start: cand.receivedAt ? new Date(cand.receivedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } },
          'Statut':         { select: { name: statut === 'acceptee' ? '✅ Accepté' : '❌ Refusé' } },
          'Type':           { select: { name: cand.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } },
          'Disponibilités': { rich_text: [{ text: { content: cand.dispos || '—' } }] },
          'Expérience RP':  { rich_text: [{ text: { content: (cand.background || '—').slice(0, 2000) } }] },
          'Vote Direction': { rich_text: [{ text: { content: validePar || '—' } }] },
          'Notes':          { rich_text: [{ text: { content: statut === 'acceptee' ? `Accepté par ${validePar} le ${fmtShort(new Date())}` : `Refusé le ${fmtShort(new Date())}` } }] },
          'Discord ID':     { rich_text: [{ text: { content: cand.userId || '—' } }] },
          'Discord Username':{ rich_text: [{ text: { content: cand.username || '—' } }] },
        }
      })
    });
    console.log(`✅ Candidature ${cand.nomPerso} archivée (${statut})`);
  } catch (e) { console.log('❌ Archivage candidature error:', e.message); }
}

// ── Notion — Ajouter membre au registre ──
async function ajouterMembreNotion(cand, type) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { database_id: NOTION_MEMBRES_DB },
        properties: {
          'Nom':               { title: [{ text: { content: cand.nomPerso || '—' } }] },
          'Personnage':        { rich_text: [{ text: { content: cand.nomPerso || '—' } }] },
          "Date d'entrée":     { date: { start: new Date().toISOString().split('T')[0] } },
          'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } },
          'Pôle':              { select: { name: type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } },
          'Rang':              { select: { name: type === 'illegal' ? 'Loup Confirmé' : 'Recrue' } },
          'Statut':            { select: { name: '✅ Actif' } },
          'Notes':             { rich_text: [{ text: { content: `Accepté le ${fmtShort(new Date())}` } }] },
        }
      })
    });
    console.log(`✅ Registre Notion: ${cand.nomPerso} ajouté`);
  } catch (e) { console.log('❌ Registre Notion error:', e.message); }
}

// ── Sync registre Notion ──
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
    const today  = new Date();
    for (const page of data.results) {
      const nomIC            = page.properties['Nom']?.title?.[0]?.plain_text || page.properties['Personnage']?.rich_text?.[0]?.plain_text;
      const statut           = page.properties['Statut']?.select?.name;
      const derniereActivite = page.properties['Dernière activité']?.date?.start;
      const discordId        = MEMBRES_DISCORD_MAP[nomIC];
      if (!discordId) continue;
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      if (derniereActivite && logsCh) {
        const jours = Math.floor((today - new Date(derniereActivite)) / 86400000);
        if (jours >= 7 && statut === '✅ Actif') {
          await logsCh.send({ content: getMention(guild), embeds: [new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle(`⚠️ Inactivité Notion — ${nomIC}`)
            .setDescription(`**${nomIC}** est inactif depuis **${jours} jours** selon le Registre Notion.`)
            .addFields({ name: '📅 Dernière activité', value: fmtShort(derniereActivite), inline: true }, { name: '📋 Statut', value: statut, inline: true })
            .setFooter({ text: 'IWC • Sync Registre Notion' })
          ] });
        }
      }
    }
  } catch (e) { console.log('❌ Sync registre error:', e.message); }
}

// ── Dashboard ──
async function updateDashboard(guild) {
  const db      = loadDB();
  const ch      = getCh(guild, 'dashboard');
  if (!ch) return;
  const members  = Object.values(db.members);
  const contrats = db.contrats || [];
  const alertes  = members.filter(m => m.status !== 'parti' && daysSince(m.lastActivity) > 7);
  const nextSess = (db.sessions || []).filter(s => s.status === 'planifiee' && new Date(s.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 IRON WOLF COMPANY — TABLEAU DE BORD').setDescription('*Mise à jour automatique toutes les heures*')
    .addFields(
      { name: '👥 MEMBRES',       value: [`✅ Actifs : **${members.filter(m => m.status === 'actif').length}**`, `⚠️ Absents : **${members.filter(m => m.status === 'absent').length}**`, `❌ Inactifs : **${members.filter(m => m.status === 'inactif').length}**`, `👁️ Total : **${members.filter(m => m.status !== 'parti').length}**`].join('\n'), inline: true },
      { name: '🎯 OPÉRATIONS',    value: [`🟢 En cours : **${(db.operations || []).filter(o => o.status === 'en_cours').length}**`, `🟡 Préparation : **${(db.operations || []).filter(o => o.status === 'preparation').length}**`, `✅ Terminées : **${(db.operations || []).filter(o => o.status === 'terminee').length}**`].join('\n'), inline: true },
      { name: '📝 RECRUTEMENT',   value: [`📥 En attente : **${(db.candidatures || []).filter(c => ['reçue', 'examen'].includes(c.status)).length}**`, `✅ Acceptés : **${(db.candidatures || []).filter(c => c.status === 'acceptee').length}**`].join('\n'), inline: true },
      { name: '📜 CONTRATS',      value: [`🟡 En attente : **${contrats.filter(c => c.status === 'en_attente').length}**`, `✅ Signés : **${contrats.filter(c => c.status === 'signe').length}**`, `❌ Refusés : **${contrats.filter(c => c.status === 'refuse').length}**`].join('\n'), inline: true },
      { name: '📅 PROCHAINE SESSION', value: nextSess ? `**${nextSess.name}**\n📍 ${nextSess.lieu || '—'}\n🗓️ ${fmtShort(nextSess.date)}` : '*Aucune session planifiée*', inline: true },
      { name: alertes.length > 0 ? `⚠️ ALERTES INACTIVITÉ (${alertes.length})` : '✅ AUCUNE ALERTE', value: alertes.length > 0 ? alertes.slice(0, 5).map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)}j`).join('\n') : '*Tous les membres sont actifs*', inline: true },
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

// ── Auto-kick visiteurs ──
const JOURS_AVANT_KICK = 5;

async function autoKickVisiteurs(guild) {
  try {
    const db      = loadDB();
    const logsCh  = await getLogsCh(guild);
    const maintenant = Date.now();
    let kicked = 0;

    for (const [id, membre] of Object.entries(db.members || {})) {
      if (membre.status !== 'visiteur') continue;
      const joursDepuis = Math.floor((maintenant - new Date(membre.joinedAt).getTime()) / 86400000);
      if (joursDepuis < JOURS_AVANT_KICK) continue;

      try {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) {
          // Déjà parti — nettoyer la DB
          delete db.members[id];
          continue;
        }

        // Vérifier qu'il a toujours le rôle Visiteur (pas encore validé)
        const estVisiteur = member.roles.cache.some(r => r.name.includes('Visiteur'));
        if (!estVisiteur) {
          // A changé de statut manuellement — mettre à jour la DB
          db.members[id].status = 'actif';
          continue;
        }

        // Envoyer un DM avant le kick
        await member.send({ embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🚪 Iron Wolf Company')
          .setDescription(`Tu as été retiré du serveur **Iron Wolf Company** car tu n'as pas validé le règlement dans les **${JOURS_AVANT_KICK} jours** suivant ton arrivée.\n\n*La porte est ouverte une fois. Une seule.*\n— La Direction`)
          .setFooter({ text: 'IWC • Système automatique' })
        ] }).catch(() => {});

        await member.kick(`Visiteur inactif depuis ${joursDepuis} jours — règlement non validé`).catch(() => {});

        delete db.members[id];
        kicked++;

        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(`🚪 AUTO-KICK — ${member.user.username}`)
          .addFields(
            { name: '👤 Membre', value: `${member.user.username}`, inline: true },
            { name: '⏱️ Arrivé il y a', value: `${joursDepuis} jours`, inline: true },
            { name: '📋 Raison', value: 'Règlement non validé', inline: true },
          )
          .setFooter({ text: `IWC • Auto-kick • ${fmtShort(new Date())}` })
        ] });

        console.log(`🚪 Auto-kick : ${member.user.username} (${joursDepuis}j sans valider le règlement)`);
      } catch (e) { console.log(`❌ Auto-kick error pour ${id}:`, e.message); }
    }

    if (kicked > 0) saveDB(db);
    console.log(`✅ Auto-kick : ${kicked} visiteur(s) kické(s)`);
  } catch (e) { console.log('❌ autoKickVisiteurs error:', e.message); }
}

// ── Auto-setup ──
async function autoSetup(guild) {
  const db = loadDB();
  console.log('🔧 Auto-setup en cours...');
  await updateDashboard(guild);

  // Règlement
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

  // Recrutement
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
          { name: '⚖️ Recrutement Légal',   value: '→ Tu exerces un métier légal au sein de la Compagnie\n→ Protection, escorte, commerce...\n→ Clique sur **⚖️ Candidature Légale**' },
          { name: '🔪 Recrutement Illégal', value: "→ Tu opères dans l'ombre pour l'organisation\n→ Contrebande, sécurité, assassinat...\n→ Clique sur **🔪 Candidature Illégale**" },
          { name: '⚠️ Important',           value: '→ Réponse en DM sous 48h\n→ Aucune justification en cas de refus\n→ *La porte est ouverte une fois. Une seule.*' }
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

  // Contrats
  const contratsCh = guild.channels.cache.get(CH.CONTRATS);
  if (contratsCh) {
    const msgs = await contratsCh.messages.fetch({ limit: 20 });
    if (!msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('CONTRATS'))) {
      const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 IRON WOLF COMPANY — CONTRATS')
        .setDescription('*Tout accord entre la Compagnie et ses partenaires doit être formalisé.*\n*Un contrat signé engage les deux parties sans exception.*')
        .addFields(
          { name: '📤 Envoyer nos conditions',     value: '→ Tu envoies tes tarifs & conditions à un client\n→ Le client signe → tu reçois la notification' },
          { name: '📥 Signer un contrat employeur', value: '→ Une entreprise vous engage\n→ Tu rentres ses infos & ses conditions\n→ Tu signes → ils reçoivent la notification' }
        ).setFooter({ text: 'Iron Wolf Company • Secrétariat officiel' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_contrat_offre').setLabel('📤 Envoyer nos conditions').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('open_contrat_emploi').setLabel('📥 Signer un contrat employeur').setStyle(ButtonStyle.Success)
      );
      await contratsCh.send({ embeds: [embed], components: [row] });
    }
  }

  // Salons informatifs
  const salons = [
    { key: 'grade',      content: '```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎖️ GRADE — PRÉSENTE TON RANG IC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nPostez votre grade/rang **In Character** dans ce canal.\n\n**Format :**\n```\nNOM : \nRANG IC : \nSURNOM : \nSPÉCIALITÉ : \n```\n*Un seul message par membre. Mettez à jour si votre rang évolue.*' },
    { key: 'surnom',     content: '```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🎭 SURNOM / PSEUDO — IDENTITÉ IC\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nRenseignez votre identité **In Character** pour faciliter les interactions RP.\n\n**Format :**\n```\nPSEUDO DISCORD : \nNOM IC : \nSURNOM IC : \nAPPARTENANCE : Légal / Illégal\n```\n*Un seul message par membre.*' },
    { key: 'informateurs', content: '```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🕵️ INFORMATEURS — CANAL CONFIDENTIEL\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n*Ce canal est réservé aux informations collectées sur le terrain.*\n*Discrétion absolue. Ce qui est posté ici ne sort pas de ces murs.*\n\n**Format de rapport :**\n```\nSOURCE : \nCIBLE / LIEU : \nINFORMATION : \nFIABILITÉ : Confirmée / Non confirmée\nDATE : \n```' },
  ];
  for (const { key, content } of salons) {
    const ch = getCh(guild, key);
    if (ch) {
      const msgs = await ch.messages.fetch({ limit: 10 });
      if (!msgs.find(m => m.author.id === client.user.id)) await ch.send(content);
    }
  }

  // Coffres
  const coffreLegal  = getChExact(guild, 'coffre-entreprise') || getCh(guild, 'coffre-entreprise');
  const coffreIlleg  = getChExact(guild, 'coffre-illegal');
  if (coffreLegal) { const msgs = await coffreLegal.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id && m.content.includes('COFFRE'))) await coffreLegal.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n💰 COFFRE ENTREPRISE — SUIVI DES FINANCES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nEnregistrez chaque mouvement financier de la Compagnie.\n\n**Format :**\n```\nTYPE      : Entrée / Sortie\nMONTANT   : $000\nOBJET     : description\nRESPONSABLE: \nSOLDE     : $000 (après opération)\n```\n*Toute transaction doit être enregistrée. Aucune exception.*'); }
  if (coffreIlleg)  { const msgs = await coffreIlleg.messages.fetch({ limit: 10 }); if (!msgs.find(m => m.author.id === client.user.id && m.content.includes('COFFRE'))) await coffreIlleg.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n🔒 COFFRE — FINANCES ILLÉGALES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n*Ce canal est strictement confidentiel.*\n\n**Format :**\n```\nTYPE      : Entrée / Sortie\nMONTANT   : $000\nOBJET     : \nRESPONSABLE: \nSOLDE     : $000\n```'); }

  console.log('✅ Auto-setup terminé\n');
}

// ── Notion Agenda ──
async function notionQueryAgenda() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return [];
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Date', date: { on_or_after: new Date().toISOString() } }, sorts: [{ property: 'Date', direction: 'ascending' }] })
    });
    const data = await res.json();
    return (data.results || []).map(p => ({
      id:           p.id,
      titre:        p.properties.Titre?.title?.[0]?.plain_text || '—',
      date:         p.properties.Date?.date?.start,
      heure:        p.properties.Heure?.rich_text?.[0]?.plain_text,
      type:         p.properties.Type?.select?.name || 'Réunion',
      participants: p.properties.Participants?.multi_select?.map(x => x.name) || [],
      lieu:         p.properties.Lieu?.rich_text?.[0]?.plain_text || '—',
      notes:        p.properties.Notes?.rich_text?.[0]?.plain_text,
      notif24:      p.properties['Notif 24h']?.checkbox,
      notif1h:      p.properties['Notif 1h']?.checkbox,
      notif15:      p.properties['Notif 15min']?.checkbox,
      url:          p.url,
    }));
  } catch { return []; }
}

function parisOffsetHours(date) {
  const tzStr  = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const utcStr = date.toLocaleString('en-US', { timeZone: 'UTC' });
  return Math.round((new Date(tzStr).getTime() - new Date(utcStr).getTime()) / 3600000);
}
function buildRdvDate(dateStr, heureStr) {
  if (!dateStr) return null;
  const jour = dateStr.split('T')[0];
  let hh = 0, mm = 0;
  if (heureStr && /\d{1,2}[:hH]\d{2}/.test(heureStr)) {
    const m = heureStr.match(/(\d{1,2})[:hH](\d{2})/);
    hh = parseInt(m[1], 10); mm = parseInt(m[2], 10);
  } else if (dateStr.includes('T')) {
    const t = dateStr.split('T')[1];
    hh = parseInt(t.slice(0, 2), 10); mm = parseInt(t.slice(3, 5), 10);
  }
  const provisoire = new Date(`${jour}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00Z`);
  return new Date(provisoire.getTime() - parisOffsetHours(provisoire) * 3600000);
}

function buildParticipantMentions(participants) {
  return participants.map(name => {
    const val = PARTICIPANTS_MAP[name];
    if (!val) return null;
    return val.startsWith('<@') ? val : `<@${val}>`;
  }).filter(Boolean).join(' ');
}

async function sendParticipantDMs(guild, appt, title, color) {
  for (const name of (appt.participants || [])) {
    const discordId = PARTICIPANTS_MAP[name];
    if (!discordId || discordId.startsWith('<@&')) continue;
    try {
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      await member.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(title)
        .setDescription(`## 📅 ${appt.titre}`)
        .addFields(
          { name: '🗓️ Quand', value: `${fmtLong(appt.date)}${appt.heure ? ` à **${appt.heure}**` : ''}`, inline: true },
          { name: '📍 Lieu',  value: appt.lieu, inline: true },
          ...(appt.notes ? [{ name: '📝 Notes', value: appt.notes }] : []),
          { name: '🔗 Notion', value: `[Ouvrir](${appt.url})` }
        ).setFooter({ text: 'IWC • Rappel automatique' })
      ] });
    } catch {}
  }
}

async function checkAgenda(guild) {
  const appts = await notionQueryAgenda();
  const ch    = getCh(guild, 'agenda', 'planning-sessions', 'planning');
  if (!ch || !appts.length) return;
  const mention = getMention(guild);
  const db = loadDB();
  let changed = false;

  for (const a of appts) {
    if (!a.date) continue;
    const dt = buildRdvDate(a.date, a.heure);
    if (!dt) continue;
    const mins = Math.floor((dt.getTime() - Date.now()) / 60000);
    const ping = buildParticipantMentions(a.participants) || mention;
    const heureAff = dt.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });

    const mkEmbed = (t, c) => new EmbedBuilder().setColor(c).setTitle(t)
      .setDescription(`## 📅 ${a.titre}`)
      .addFields(
        { name: 'Quand',        value: `${fmtLong(a.date)}${heureAff ? ` à **${heureAff}**` : ''}`, inline: true },
        { name: 'Lieu',         value: a.lieu, inline: true },
        { name: 'Participants', value: a.participants.length > 0 ? a.participants.join(', ') : '—' },
        ...(a.notes ? [{ name: 'Notes', value: a.notes }] : []),
        { name: 'Modifier', value: `[Notion](${a.url})` }
      ).setFooter({ text: 'IWC • Secrétariat automatique' });

    const sent  = k => db.sentReminders?.[`${a.id}_${k}`];
    const mark  = k => { if (!db.sentReminders) db.sentReminders = {}; db.sentReminders[`${a.id}_${k}`] = true; changed = true; };

    if (mins > 0) {
      if (a.notif24 && !sent('24h') && mins <= 1440 && mins > 60) { await ch.send({ content: `${ping} — 📅 RDV dans 24h`, embeds: [mkEmbed('📅 Rappel — 24 heures', 0x5865F2)] }); await sendParticipantDMs(guild, a, '📅 Rappel — RDV dans 24h', 0x5865F2); mark('24h'); }
      if (a.notif1h && !sent('1h')  && mins <= 60  && mins > 15)  { await ch.send({ content: `${ping} — ⏰ RDV dans 1 heure`, embeds: [mkEmbed('⏰ Rappel — 1 heure', 0xFFA500)] }); await sendParticipantDMs(guild, a, '⏰ Rappel — RDV dans 1 heure', 0xFFA500); mark('1h'); }
      if (a.notif15 && !sent('15min') && mins <= 15)               { await ch.send({ content: `${ping} — 🚨 15 minutes !`, embeds: [mkEmbed('🚨 URGENT — 15 min', 0xED4245)] }); await sendParticipantDMs(guild, a, '🚨 URGENT — RDV dans 15 minutes !', 0xED4245); mark('15min'); }
    }
    if (mins < -120) { ['24h','1h','15min'].forEach(k => { if (db.sentReminders?.[`${a.id}_${k}`]) { delete db.sentReminders[`${a.id}_${k}`]; changed = true; } }); }
  }
  if (changed) saveDB(db);
}

async function postDailyAgenda(guild) {
  const ch    = getCh(guild, 'agenda', 'planning-sessions', 'planning');
  if (!ch) return;
  const appts = await notionQueryAgenda();
  const today = new Date().toISOString().split('T')[0];
  const todayA = appts.filter(a => a.date?.startsWith(today));
  if (!todayA.length) return;
  const weekA = appts.filter(a => { if (!a.date) return false; const d = new Date(a.date); return d >= new Date() && d <= new Date(Date.now() + 7*86400000); });
  const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📅 Agenda — ${fmtLong(new Date())}`)
    .setDescription(todayA.map(a => `📅 **${a.titre}**\n🕐 ${a.heure || '—'} · 📍 ${a.lieu} · 👥 ${a.participants.join(', ') || '—'}`).join('\n\n'));
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

  const arriveesCh = getCh(guild, 'arrivees', 'arrivée');
  if (arriveesCh) await arriveesCh.send({ embeds: [new EmbedBuilder().setColor(0x8B5A2A).setTitle('👁️ Nouveau visiteur')
    .setDescription(`**${member.user.username}** a rejoint le serveur.\nDirigé vers **#règlement** pour validation.`)
    .addFields({ name: 'Compte créé le', value: fmtShort(member.user.createdAt), inline: true }, { name: 'Âge du compte', value: `${daysSince(member.user.createdAt)} jours`, inline: true })
    .setThumbnail(member.user.displayAvatarURL()).setFooter({ text: 'IWC • Automatique' })] });

  await sendLog(guild, 'ARRIVEE', { userId: member.id, username: member.user.username, accountAge: daysSince(member.user.createdAt) });

  // Alerte compte suspect améliorée
  await notionExtra.alerteCompteSuspect?.(guild, member);

  member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Iron Wolf Company')
    .setDescription('Bienvenue sur le serveur.\n\nLis le **#règlement** et réagis avec ✅ pour accéder au recrutement.\n\n*La porte est ouverte une fois. Une seule.*')
    .setFooter({ text: '— La Direction, IWC' })] }).catch(() => {});
});

client.on('guildMemberRemove', async member => {
  const db = loadDB(); const m = db.members[member.id];
  await sendLog(member.guild, 'DEPART', { username: member.user.username, rang: m?.rang, duree: m ? daysSince(m.joinedAt) + ' jours' : '—' });
  if (db.members[member.id]) { db.members[member.id].status = 'parti'; db.members[member.id].leftAt = new Date().toISOString(); saveDB(db); }
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); } catch { return; }
  const db = loadDB(); const guild = reaction.message.guild;
  if (!guild) return;

  // Validation règlement
  if (reaction.message.id === db.reglementMsgId && reaction.emoji.name === '✅') {
    await sendLog(guild, 'REGLEMENT_VALIDE', { userId: user.id, username: user.username });
    const logsCh = await getLogsCh(guild);
    if (logsCh) await logsCh.send({ content: `${getMention(guild)} — **${user.username}** a validé le règlement.` });
    return;
  }

  // Votes candidatures
  if (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') {
    const title = reaction.message.embeds[0]?.title || '';
    if (!title.includes('DOSSIER')) return;
    const isIllegal = title.includes('ILLÉGAL');
    const isAccept  = reaction.emoji.name === '✅';
    const nom = title.replace(/📁 \[.*?\] DOSSIER (LÉGAL|ILLÉGAL) — /, '').replace(/✅ ACCEPTÉ — /, '').trim();
    const cand = db.candidatures.find(c => c.nomPerso === nom && c.status === 'reçue');
    if (!cand) return;

    const reactUsers = await reaction.users.fetch();
    const voteCount  = reactUsers.filter(u => !u.bot).size;
    const VOTES_REQUIS = 2;

    if (voteCount < VOTES_REQUIS) {
      const action  = isAccept ? 'accepter' : 'refuser';
      const msg = await reaction.message.channel.send({ content: `⏳ **${voteCount}/${VOTES_REQUIS} votes** pour ${action} **${cand.nomPerso}**. Il manque **${VOTES_REQUIS - voteCount} vote(s)**.` });
      setTimeout(() => msg.delete().catch(() => {}), 10000);
      return;
    }

    const member = await guild.members.fetch(cand.userId).catch(() => null);

    if (isAccept) {
      if (member) {
        if (isIllegal) {
          const role = guild.roles.cache.find(r => r.name.includes('Maudit') || r.name.includes('Ombre'));
          if (role) await member.roles.add(role).catch(() => {});
          member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle("🔪 Bienvenue dans l'ombre — La Confrérie").setDescription("Tu as été **accepté** au sein de la Confrérie.\n\nDiscrétion absolue.\n\n*Ne fais confiance qu'à ceux que la Direction te désignera.*\n— La Direction").setFooter({ text: 'La Confrérie • Confidentiel' })] }).catch(() => {});
          const annCh = guild.channels.cache.get(CH.DOSSIER_ILLEG);
          if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle("🔪 La Confrérie — Nouveau visage dans l'ombre").setDescription(`**${cand.nomPerso}** a intégré la Confrérie.\n*Certains chemins ne se montrent pas à la lumière.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` })] });
        } else {
          const role = guild.roles.cache.find(r => r.name.includes('Recrue') || r.name.includes('Employé'));
          if (role) await member.roles.add(role).catch(() => {});
          member.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Candidature acceptée — Iron Wolf Company').setDescription("Ta candidature a été **acceptée**.\n\nLa période d'observation commence maintenant.\n\n*Tu connais les règles. Tu connais les attentes.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Légal' })] }).catch(() => {});
          const annCh = guild.channels.cache.get(CH.DOSSIER_LEGAL);
          if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Nouveau membre — Iron Wolf Company').setDescription(`**${cand.nomPerso}** rejoint la Compagnie.\n*Bienvenue dans la meute.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` })] });
        }
      }
      cand.status = 'acceptee'; cand.acceptedAt = new Date().toISOString(); saveDB(db);
      await archiverCandidatureNotion(cand, 'acceptee', user.username);
      await ajouterMembreNotion(cand, cand.type);
      await notionExtra.creerFichePersonnageNotion?.(cand);
      notionExtra.planifierRappelFiche?.(guild, cand);
      await sendLog(guild, 'CANDIDATURE_ACCEPTEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal', validePar: user.username });
      try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(isIllegal ? 0x8B1A1A : 0x3B82F6).setTitle(`✅ ACCEPTÉ — ${cand.nomPerso}`)] }); } catch {}
    } else {
      cand.status = 'refusee'; saveDB(db);
      await archiverCandidatureNotion(cand, 'refusee', user.username);
      await sendLog(guild, 'CANDIDATURE_REFUSEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal' });
      if (member) {
        const embedRefus = isIllegal
          ? new EmbedBuilder().setColor(0x555555).setTitle('La Confrérie').setDescription("Ta demande n'a pas été retenue.\n\n*On ne donne pas d'explication.*\n— La Direction").setFooter({ text: 'La Confrérie • Confidentiel' })
          : new EmbedBuilder().setColor(0xED4245).setTitle('Iron Wolf Company').setDescription("Ta candidature n'a pas été retenue.\n\n*La Direction se réserve le droit de refuser sans justification.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Légal' });
        member.send({ embeds: [embedRefus] }).catch(() => {});
      }
      try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(0xED4245).setTitle(`❌ REFUSÉ — ${cand.nomPerso}`)] }); } catch {}
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const db = loadDB(); const guild = message.guild;

  // Mise à jour lastActivity + retour d'absence
  if (db.members[message.author.id]) {
    const wasAbsent = db.members[message.author.id].status === 'absent';
    db.members[message.author.id].lastActivity = new Date().toISOString();
    if (wasAbsent) {
      db.members[message.author.id].status = 'actif';
      await notionExtra.majStatutActiviteNotion?.(message.author.id, 'actif');
    }
    saveDB(db);
  }

  // Absences
  const absCh = getCh(guild, 'absences');
  if (absCh && message.channel.id === absCh.id) {
    if (db.members[message.author.id]) {
      db.members[message.author.id].status = 'absent';
      saveDB(db);
      await message.react('✅');
      await notionExtra.majStatutActiviteNotion?.(message.author.id, 'absent');
    }
    await sendLog(guild, 'ABSENCE', { userId: message.author.id, username: message.author.username });
    return;
  }

  // Suggestions
  const suggCh = getCh(guild, 'suggestion-idee', 'suggestions', 'suggestion');
  if (suggCh && message.channel.id === suggCh.id) { await message.react('✅').catch(() => {}); await message.react('❌').catch(() => {}); return; }

  // Clips
  const clipCh = getCh(guild, 'clips-temps-fort', 'clips-highlights', 'clips');
  if (clipCh && message.channel.id === clipCh.id && message.attachments.size > 0) { await message.react('🔥').catch(() => {}); await message.react('❤️').catch(() => {}); return; }

  // Coffres — utilise getChExact pour éviter les collisions
  const coffreLegalCh = getChExact(guild, 'coffre-entreprise');
  const coffreIllegCh = getChExact(guild, 'coffre-illegal');
  const coffreType = coffreLegalCh && message.channel.id === coffreLegalCh.id ? 'legal'
                   : coffreIllegCh && message.channel.id === coffreIllegCh.id ? 'illegal' : null;

  if (coffreType) {
    const up = message.content.toUpperCase();
    if (up.includes('TYPE') && up.includes('MONTANT')) {
      const lines = message.content.split('\n');
      const get   = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() : ''; };
      const type  = get('TYPE').toLowerCase().includes('sort') ? 'Sortie' : 'Entrée';
      const montant = (() => { const n = parseInt((get('MONTANT') || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; })();
      const objet = get('OBJET') || '—';
      const responsable = get('RESPONSABLE') || message.author.username;
      if (!db.coffres) db.coffres = { legal: 0, illegal: 0 };
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

  // Opérations
  const opsCh = getCh(guild, 'operations-en-cours', 'operations');
  if (opsCh && message.channel.id === opsCh.id && isDirection(message.member)) {
    if (message.content.toUpperCase().includes('OPÉRATION') || message.content.toUpperCase().includes('OPERATION')) {
      const lines = message.content.split('\n');
      const get   = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() || '—' : '—'; };
      const poleRaw = get('PÔLE') !== '—' ? get('PÔLE') : get('POLE');
      const pole    = poleRaw.toLowerCase().includes('lég') || poleRaw.toLowerCase().includes('leg') ? 'legal' : 'illegal';
      const op = { id: Date.now().toString(), name: get('NOM'), lieu: get('LIEU'), objectif: get('OBJECTIF'), equipe: get('ÉQUIPE') || get('EQUIPE'), pole, participants: [], status: 'preparation', createdAt: new Date().toISOString() };
      db.operations.push(op);
      op.notionPageId = await notionExtra.creerOperationNotion?.(op);
      saveDB(db);
      await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' });
      const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(`🎯 OPÉRATION — ${op.name}`)
        .addFields(
          { name: 'Statut', value: '🟡 En préparation', inline: true },
          { name: 'Pôle', value: pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal', inline: true },
          { name: 'Lieu', value: op.lieu, inline: true },
          { name: 'Objectif', value: op.objectif },
          { name: 'Équipe', value: op.equipe },
          { name: '👥 Participants (0)', value: '*Personne pour l\'instant. Clique « ✋ Je participe » ci-dessous.*' }
        ).setFooter({ text: `ID: ${op.id} • ${fmtShort(new Date())}` });
      const rowP = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary),
      );
      const rowG = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
      );
      await opsCh.send({ content: `<@&${pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}> — 🎯 Nouvelle opération **${op.name}**. Inscrivez-vous via « ✋ Je participe ».`, embeds: [embed], components: [rowP, rowG] });
      await message.react('✅');
    }
    return;
  }

  // Planning sessions
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
        const dt    = new Date(`${session.date.split('/').reverse().join('-')}T${session.heure}`);
        const delay = dt.getTime() - Date.now() - 3600000;
        if (delay > 0) setTimeout(async () => { await planCh.send({ content: getMention(guild), embeds: [new EmbedBuilder().setColor(0xFF6B35).setTitle(`⏰ RAPPEL — ${session.name} dans 1 heure`).setDescription(`📍 ${session.lieu} · 🕐 ${session.heure}`).setFooter({ text: 'IWC • Rappel automatique' })] }); }, delay);
      } catch {}
      await message.react('✅');
    }
  }
});

// ── Interactions ──
client.on('interactionCreate', async interaction => {
  const guild = interaction.guild;
  const db    = loadDB();

  // Candidature légale — bouton
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

  // Candidature illégale — bouton
  if (interaction.isButton() && interaction.customId === 'open_candidature_illegal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_illegal').setTitle('🔪 Organisation Hors la Loi — Illégal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom du personnage').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Viktor Crane')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age_perso').setLabel('Âge du personnage').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 29 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('specialite').setLabel('Spécialité / Activités').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Contrebande, Sécurité, Bras droit...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder("Qui est ton personnage ? Ce qui l'a amené dans l'ombre...")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités & Expérience RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine, week-end / Confirmé')),
    );
    await interaction.showModal(modal); return;
  }

  // Modal candidature légale
  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_legal') {
    await interaction.deferReply({ ephemeral: true });
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: interaction.fields.getTextInputValue('nom_perso'), agePerso: interaction.fields.getTextInputValue('age_perso'), metier: interaction.fields.getTextInputValue('metier'), background: interaction.fields.getTextInputValue('background'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'legal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    await interaction.editReply({ content: '✅ **Candidature légale transmise.**\nRéponse en DM sous 48h.\n*La Compagnie ne recrute pas au hasard.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '⚖️ Légal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('📥 Candidature légale reçue — IWC').setDescription("Ta candidature a bien été transmise à la Direction.\n\nUne réponse en DM sous 48h.\n\n*La Compagnie choisit ses membres avec soin.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_LEGAL);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ${cand.nomPerso}`)
        .setDescription(`> *"Chaque talent a sa place au sein de la Compagnie."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**⚖️ TYPE : RECRUTEMENT LÉGAL**`)
        .addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '💼 Métier', value: cand.metier }, { name: '📖 Background', value: cand.background.slice(0, 1000) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' })
        .setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `IWC • Légal • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 📋 Nouveau dossier **LÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[LÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** ⚖️\n\nÉchangez ici avant de voter.`); } catch {}
    }
    return;
  }

  // Modal candidature illégale
  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_illegal') {
    await interaction.deferReply({ ephemeral: true });
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: interaction.fields.getTextInputValue('nom_perso'), agePerso: interaction.fields.getTextInputValue('age_perso'), specialite: interaction.fields.getTextInputValue('specialite'), background: interaction.fields.getTextInputValue('background'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'illegal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    await interaction.editReply({ content: '🔒 **Dossier transmis.**\nReste discret.\n*On te contactera si tu es jugé digne.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '🔪 Illégal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🔒 Dossier transmis — IWC').setDescription("Ton dossier a été acheminé aux bonnes personnes.\n\nUne réponse en DM sous 48h.\n\n*Ne parle de cela à personne.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Confidentiel' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_ILLEG);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ${cand.nomPerso}`)
        .setDescription(`> *"L'ombre protège ceux qui savent s'y fondre."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**🔪 TYPE : RECRUTEMENT ILLÉGAL**`)
        .addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '🔪 Spécialité', value: cand.specialite }, { name: '📖 Background', value: cand.background.slice(0, 1000) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' })
        .setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `La Confrérie • CONFIDENTIEL • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 🔪 Nouveau dossier **ILLÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[ILLÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** 🔪\n\nÉchangez ici avant de voter.`); } catch {}
    }
    return;
  }

  // Participation opération
  if (interaction.isButton() && (interaction.customId.startsWith('op_participer_') || interaction.customId.startsWith('op_retrait_'))) {
    const retrait = interaction.customId.startsWith('op_retrait_');
    const opId    = interaction.customId.replace(retrait ? 'op_retrait_' : 'op_participer_', '');
    const op      = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', ephemeral: true }); return; }
    if (['terminee', 'annulee'].includes(op.status)) { await interaction.reply({ content: '❌ Cette opération est clôturée.', ephemeral: true }); return; }
    op.participants = op.participants || [];
    const nom = nomParticipant(interaction.member);
    if (retrait) { op.participants = op.participants.filter(p => p !== nom); }
    else if (!op.participants.includes(nom)) { op.participants.push(nom); }
    saveDB(db);
    await notionExtra.majOperationNotion?.(op);
    const liste = op.participants.length ? op.participants.join(', ') : '*Personne pour l\'instant. Clique « ✋ Je participe » ci-dessous.*';
    const embeds = interaction.message.embeds;
    const idx    = embeds[0].fields.findIndex(f => f.name.startsWith('👥 Participants'));
    const updated = EmbedBuilder.from(embeds[0]);
    if (idx >= 0) updated.spliceFields(idx, 1, { name: `👥 Participants (${op.participants.length})`, value: liste });
    await interaction.update({ embeds: [updated] });
    return;
  }

  // Terminer opération — modal résultat
  if (interaction.isButton() && interaction.customId.startsWith('op_terminee_')) {
    const opId = interaction.customId.replace('op_terminee_', '');
    const op   = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', ephemeral: true }); return; }
    const modal = new ModalBuilder().setCustomId(`op_resultat_modal_${opId}`).setTitle("✅ Clôture de l'opération");
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('resultat').setLabel('Résultat').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Réussite / Échec / Mitigé')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('butin').setLabel('Butin / Gains').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 5000$, matériel récupéré...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('debrief').setLabel('Débrief / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Comment ça s\'est passé...')),
    );
    await interaction.showModal(modal); return;
  }

  // Modal résultat opération
  if (interaction.isModalSubmit() && interaction.customId.startsWith('op_resultat_modal_')) {
    const opId = interaction.customId.replace('op_resultat_modal_', '');
    const op   = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', ephemeral: true }); return; }
    await interaction.deferUpdate();
    op.status   = 'terminee';
    op.endedAt  = new Date().toISOString();
    op.resultat = interaction.fields.getTextInputValue('resultat');
    op.butin    = interaction.fields.getTextInputValue('butin')   || '—';
    op.debrief  = interaction.fields.getTextInputValue('debrief') || '—';
    saveDB(db);
    await notionExtra.majOperationNotion?.(op);
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '✅ Terminée — ' + op.resultat });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287)
      .spliceFields(0, 1, { name: 'Statut', value: '✅ Terminée', inline: true })
      .addFields({ name: '🏁 Résultat', value: op.resultat, inline: true }, { name: '💰 Butin', value: op.butin, inline: true }, { name: '📝 Débrief', value: op.debrief });
    await interaction.editReply({ embeds: [updated], components: [] }); return;
  }

  // Lancer / annuler opération
  if (interaction.isButton() && (interaction.customId.startsWith('op_encours_') || interaction.customId.startsWith('op_annulee_'))) {
    const isLancer = interaction.customId.startsWith('op_encours_');
    const opId     = interaction.customId.replace(isLancer ? 'op_encours_' : 'op_annulee_', '');
    const op       = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', ephemeral: true }); return; }
    op.status = isLancer ? 'en_cours' : 'annulee';
    saveDB(db);
    await notionExtra.majOperationNotion?.(op);
    const label   = isLancer ? '🟢 En cours' : '❌ Annulée';
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: label });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(isLancer ? 0x00AA00 : 0xED4245).spliceFields(0, 1, { name: 'Statut', value: label, inline: true });
    if (isLancer) {
      const mentions = (op.participants || []).map(nom => { const id = MEMBRES_DISCORD_MAP[nom]; return id ? `<@${id}>` : null; }).filter(Boolean).join(' ');
      const ping = mentions || `<@&${op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}>`;
      await interaction.update({ embeds: [updated] });
      await interaction.followUp({ content: `${ping} — 🟢 L'opération **${op.name}** est **LANCÉE**. À vos postes.` });
    } else { await interaction.update({ embeds: [updated], components: [] }); }
    return;
  }

  // Contrat offre — bouton
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

  // Modal contrat offre
  if (interaction.isModalSubmit() && interaction.customId === 'contrat_offre_modal') {
    await interaction.deferReply({ ephemeral: true });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-OF-' + Date.now().toString().slice(-5);
    const contrat = { id: contratId, type: 'offre', clientNom: interaction.fields.getTextInputValue('client_nom'), objet: interaction.fields.getTextInputValue('objet'), nosConditions: interaction.fields.getTextInputValue('nos_conditions'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), emetteurId: interaction.user.id, emetteurNom: interaction.user.username, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    await interaction.editReply({ content: `✅ Contrat **${contratId}** envoyé au client.` });
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📤 CONTRAT DE PRESTATION — ${contratId}`)
      .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — OFFRE DE PRESTATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
      .addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '📋 Objet', value: contrat.objet }, { name: '🏢 Nos conditions', value: contrat.nosConditions }, { name: '💰 Rémunération souhaitée', value: contrat.remuneration }, { name: '📌 Statut', value: '🟡 En attente de signature', inline: true })
      .setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`signer_offre_${contratId}`).setLabel("✍️ J'accepte les termes").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuser_offre_${contratId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger)
    );
    const ch = guild.channels.cache.get(CH.CONTRATS);
    if (ch) await ch.send({ content: `<@${contrat.userId}> — Iron Wolf Company vous soumet un contrat.`, embeds: [embed], components: [row] });
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📤 Contrat — IWC').setDescription(`L'IWC vous soumet le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}\n\nRépondez dans **#contrats**.`).setFooter({ text: 'Iron Wolf Company' })] }); } catch {}
    return;
  }

  // Signer offre
  if (interaction.isButton() && interaction.customId.startsWith('signer_offre_')) {
    const contratId = interaction.customId.replace('signer_offre_', '');
    const contrat   = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.userId !== interaction.user.id) { await interaction.reply({ content: '❌ Ce contrat ne vous est pas destiné.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${interaction.user.username} (${contrat.clientNom})` });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_SIGNE, { embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT ACCEPTÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé', value: fmtShort(new Date()), inline: true }, { name: '✍️ Client', value: `${interaction.user.username} (${contrat.clientNom})`, inline: true }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    try { const em = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (em) await em.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Contrat signé — ${contratId}`).setDescription(`**${contrat.clientNom}** a accepté le contrat.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Notification contrat' })] }); } catch {}
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Contrat signé — IWC`).setDescription(`Vous avez accepté le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}\n\n*Iron Wolf Company a été notifié.*`).setFooter({ text: 'IWC • Document Officiel' })] }).catch(() => {});
    return;
  }

  // Refuser offre
  if (interaction.isButton() && interaction.customId.startsWith('refuser_offre_')) {
    const contratId = interaction.customId.replace('refuser_offre_', '');
    const contrat   = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.userId !== interaction.user.id) { await interaction.reply({ content: '❌ Ce contrat ne vous est pas destiné.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: `❌ Refusé le ${fmtShort(new Date())}`, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_REFUSE, { embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT REFUSÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Refusé par', value: interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    try { const em = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (em) await em.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Contrat refusé — ${contratId}`).setDescription(`**${contrat.clientNom}** a refusé le contrat pour **${contrat.objet}**.`).setFooter({ text: 'IWC • Notification' })] }); } catch {}
    return;
  }

  // Contrat emploi — bouton
  if (interaction.isButton() && interaction.customId === 'open_contrat_emploi') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true }); return; }
    const modal = new ModalBuilder().setCustomId('contrat_emploi_modal').setTitle('📥 Contrat employeur — À signer');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('employeur_nom').setLabel("Nom de l'employeur").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Société Moreau...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection du convoi...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('leurs_conditions').setLabel("Conditions de l'employeur").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder("Ce qu'ils exigent...")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération proposée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 2000$ à la livraison')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel("ID Discord de l'employeur").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Clic droit → Copier l'identifiant")),
    );
    await interaction.showModal(modal); return;
  }

  // Modal contrat emploi
  if (interaction.isModalSubmit() && interaction.customId === 'contrat_emploi_modal') {
    await interaction.deferReply({ ephemeral: true });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-EM-' + Date.now().toString().slice(-5);
    const contrat = { id: contratId, type: 'emploi', employeurNom: interaction.fields.getTextInputValue('employeur_nom'), objet: interaction.fields.getTextInputValue('objet'), leursConditions: interaction.fields.getTextInputValue('leurs_conditions'), remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), signataire: interaction.user.username, signataireId: interaction.user.id, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    await interaction.editReply({ content: `📋 Contrat **${contratId}** créé. La Direction va examiner ce contrat.` });
    const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📥 CONTRAT EMPLOYEUR — ${contratId}`)
      .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  CONTRAT PROPOSÉ À IRON WOLF COMPANY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
      .addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: `🏭 Employeur — ${contrat.employeurNom}`, value: contrat.leursConditions }, { name: '💰 Rémunération', value: contrat.remuneration }, { name: '📋 Objet', value: contrat.objet }, { name: '📌 Statut', value: '🟡 En attente de notre signature', inline: true })
      .setFooter({ text: `IWC • Contrat Employeur • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`signer_emploi_${contratId}`).setLabel('✍️ Signer & Accepter').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`refuser_emploi_${contratId}`).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger)
    );
    const ch = guild.channels.cache.get(CH.CONTRATS);
    if (ch) await ch.send({ content: `${getContratMention(guild)} — 📥 Nouveau contrat employeur à examiner.`, embeds: [embed], components: [row] });
    return;
  }

  // Signer emploi
  if (interaction.isButton() && interaction.customId.startsWith('signer_emploi_')) {
    const contratId = interaction.customId.replace('signer_emploi_', '');
    const contrat   = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut signer.', ephemeral: true }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); contrat.signedBy = interaction.user.username; saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${interaction.user.username} — IWC` });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    await sendToThread(guild, CH.FIL_CONTRATS_SIGNE, { embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT EMPLOYEUR SIGNÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé', value: fmtShort(new Date()), inline: true }, { name: '✍️ Signé par', value: interaction.user.username, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Contrat signé — IWC`).setDescription(`Iron Wolf Company a **signé** le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Notification' })] }); } catch {}
    return;
  }

  // Refuser emploi
  if (interaction.isButton() && interaction.customId.startsWith('refuser_emploi_')) {
    const contratId = interaction.customId.replace('refuser_emploi_', '');
    const contrat   = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', ephemeral: true }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', ephemeral: true }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut décliner.', ephemeral: true }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
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

  // Restauration des données depuis GitHub si data.json est vide
  await restaurerDepuisGitHub();

  for (const guild of client.guilds.cache.values()) {
    await autoSetup(guild).catch(e => console.log('autoSetup error:', e.message));
  }

  // Vérifier les rappels de fiches en attente au démarrage
  for (const guild of client.guilds.cache.values()) {
    await notionExtra.envoyerRappelsFiches?.(guild).catch(() => {});
  }

  // ── Crons ──
  cron.schedule('*/5 * * * *',  async () => { for (const g of client.guilds.cache.values()) await checkAgenda(g).catch(() => {}); });
  cron.schedule('*/30 * * * *', async () => { for (const g of client.guilds.cache.values()) await notionExtra.envoyerRappelsFiches?.(g).catch(() => {}); }); // rappels fiches
  cron.schedule('0 * * * *',    async () => { for (const g of client.guilds.cache.values()) await updateDashboard(g).catch(() => {}); });                    // dashboard
  cron.schedule('0 * * * *',    async () => { for (const g of client.guilds.cache.values()) await notionExtra.checkFichesCompletees?.(g).catch(() => {}); }); // fiches complètes
  cron.schedule('*/15 * * * *', async () => { for (const g of client.guilds.cache.values()) await syncRegistreNotion(g).catch(() => {}); });                  // sync registre
  cron.schedule('0 * * * *',    async () => { await sauvegarderSurGitHub().catch(() => {}); },                         { timezone: 'Europe/Paris' });          // sauvegarde GitHub
  cron.schedule('0 9 * * *',    async () => { for (const g of client.guilds.cache.values()) await postDailyAgenda(g).catch(() => {}); },    { timezone: 'Europe/Paris' }); // agenda
  cron.schedule('0 20 * * 0',   async () => { for (const g of client.guilds.cache.values()) await notionExtra.postStatsHebdo?.(g).catch(e => console.log(e.message)); }, { timezone: 'Europe/Paris' }); // stats
  cron.schedule('0 12 * * *',   async () => { for (const g of client.guilds.cache.values()) await autoKickVisiteurs(g).catch(() => {}); }, { timezone: 'Europe/Paris' }); // auto-kick visiteurs
});

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);

