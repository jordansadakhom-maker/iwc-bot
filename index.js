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
// CLIENT DISCORD
// ═══════════════════════════════════════════════════════════════
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel]
});

// ═══════════════════════════════════════════════════════════════
// BASE DE DONNÉES LOCALE (data.json)
// ═══════════════════════════════════════════════════════════════
const DB_PATH = './data.json';

function loadDB() {
  if (!fs.existsSync(DB_PATH)) {
    const init = {
      members: {},
      operations: [],
      sessions: [],
      candidatures: [],
      dashboardMsgId: null,
      reglementMsgId: null,
      recrutementMsgId: null,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(init, null, 2));
    return init;
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
}

function saveDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ═══════════════════════════════════════════════════════════════
// UTILITAIRES
// ═══════════════════════════════════════════════════════════════

// Trouver un canal par nom (insensible aux emojis et majuscules)
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c =>
      c.type === ChannelType.GuildText && clean(c.name).includes(clean(name))
    );
    if (ch) return ch;
  }
  return null;
}

// Mention Le Concepteur + Le Fléau
function getMention(guild) {
  const found = guild.roles.cache.filter(r =>
    ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))
  );
  return found.map(r => `<@&${r.id}>`).join(' ') || '';
}

// Jours depuis une date
function daysSince(d) {
  if (!d) return 999;
  return Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
}

// Format date longue
function fmtLong(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
  });
}

// Format date courte
function fmtShort(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('fr-FR', {
    day: '2-digit', month: '2-digit', year: 'numeric'
  });
}

// ═══════════════════════════════════════════════════════════════
// DASHBOARD — mis à jour automatiquement
// ═══════════════════════════════════════════════════════════════
async function updateDashboard(guild) {
  const db = loadDB();
  const ch = getCh(guild, 'dashboard');
  if (!ch) return;

  const members   = Object.values(db.members);
  const actifs    = members.filter(m => m.status === 'actif').length;
  const absents   = members.filter(m => m.status === 'absent').length;
  const inactifs  = members.filter(m => m.status === 'inactif').length;
  const enCours   = db.operations.filter(o => o.status === 'en_cours').length;
  const enPrepa   = db.operations.filter(o => o.status === 'preparation').length;
  const terminees = db.operations.filter(o => o.status === 'terminee').length;
  const candAttn  = db.candidatures.filter(c => ['reçue', 'examen'].includes(c.status)).length;
  const candAcc   = db.candidatures.filter(c => c.status === 'acceptee').length;
  const nextSess  = db.sessions
    .filter(s => s.status === 'planifiee' && new Date(s.date) > new Date())
    .sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const alertes   = members.filter(m => m.status === 'actif' && daysSince(m.lastActivity) > 7);

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('🐺 IRON WOLF COMPANY — TABLEAU DE BORD')
    .setDescription('*Mise à jour automatique toutes les heures*')
    .addFields(
      {
        name: '👥 MEMBRES',
        value: `✅ Actifs : **${actifs}**\n⚠️ Absents : **${absents}**\n❌ Inactifs : **${inactifs}**\n👁️ Total : **${members.filter(m => m.status !== 'parti').length}**`,
        inline: true
      },
      {
        name: '🎯 OPÉRATIONS',
        value: `🟢 En cours : **${enCours}**\n🟡 Préparation : **${enPrepa}**\n✅ Terminées : **${terminees}**`,
        inline: true
      },
      {
        name: '📝 RECRUTEMENT',
        value: `📥 En attente : **${candAttn}**\n✅ Acceptés : **${candAcc}**`,
        inline: true
      },
      {
        name: '📅 PROCHAINE SESSION',
        value: nextSess
          ? `**${nextSess.name}**\n📍 ${nextSess.lieu || '—'}\n🗓️ ${fmtShort(nextSess.date)}`
          : '*Aucune session planifiée*'
      },
      {
        name: alertes.length > 0 ? '⚠️ ALERTES INACTIVITÉ' : '✅ AUCUNE ALERTE',
        value: alertes.length > 0
          ? alertes.map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)} jours sans activité`).join('\n')
          : '*Tous les membres sont actifs*'
      }
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
  } catch (e) {
    console.log('Dashboard error:', e.message);
  }
}

// ═══════════════════════════════════════════════════════════════
// AUTO-SETUP — messages postés au démarrage si absents
// ═══════════════════════════════════════════════════════════════
async function autoSetup(guild) {
  const db = loadDB();
  console.log('🔧 Auto-setup en cours...');

  // ── Dashboard ──
  await updateDashboard(guild);

  // ── Message règlement ──
  const reglCh = getCh(guild, 'reglement', 'règlement');
  if (reglCh) {
    const msgs = await reglCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.content.includes('VALIDATION'));
    if (existing) {
      db.reglementMsgId = existing.id;
    } else if (!db.reglementMsgId) {
      const sent = await reglCh.send(
        '```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
        '✅ VALIDATION DU RÈGLEMENT\n' +
        '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n' +
        'Si vous avez lu et accepté le règlement dans son intégralité, réagissez avec ✅\n\n' +
        '*En réagissant, vous confirmez avoir compris et accepté chaque article du code de la Compagnie.*\n' +
        '— La Direction, Iron Wolf Company'
      );
      await sent.react('✅');
      db.reglementMsgId = sent.id;
      console.log('  ✅ Message règlement posté');
    }
    saveDB(db);
  }

  // ── Message recrutement avec bouton ──
  const recrutCh = guild.channels.cache.get('1508756414779232277'); // #recrutement GÉNÉRAL
  if (recrutCh) {
    const msgs = await recrutCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m =>
      m.author.id === client.user.id &&
      m.embeds.length > 0 &&
      m.embeds[0]?.title?.includes('RECRUTEMENT') &&
      m.components.length > 0 &&
      m.components[0]?.components?.length >= 2
    );
    if (existing) {
      db.recrutementMsgId = existing.id;
    } else {
      // Supprimer l'ancien message s'il existe
      if (db.recrutementMsgId) {
        const old = await recrutCh.messages.fetch(db.recrutementMsgId).catch(() => null);
        if (old) await old.delete().catch(() => {});
        db.recrutementMsgId = null;
      }
    }
    if (!db.recrutementMsgId) {
      const embed = new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle('📋 IRON WOLF COMPANY — RECRUTEMENT')
        .setDescription(
          '*On ne demande pas à rejoindre la Compagnie. On y est invité.*\n' +
          '*Si vous êtes ici — vous avez été jugé digne de frapper à la porte.*'
        )
        .addFields(
          {
            name: '⚖️ Recrutement Légal',
            value:
              '→ Tu exerces un métier légal au sein de la Compagnie\n' +
              '→ Protection, escorte en tout genre etc...\n' +
              '→ Clique sur **⚖️ Candidature Légale**'
          },
          {
            name: '🔪 Recrutement Illégal',
            value:
              '→ Tu opères dans l\'ombre pour une organisation\n' +
              '→ Contrebande, sécurité, assassinat etc...\n' +
              '→ Clique sur **🔪 Candidature Illégale**'
          },
          {
            name: '⚠️ Important',
            value:
              '→ Réponse en DM sous 48h\n' +
              '→ Aucune justification en cas de refus\n' +
              '→ *La porte est ouverte une fois. Une seule.*'
          }
        )
        .setFooter({ text: 'Iron Wolf Company • Recrutement officiel • Organisation Hors la loi' });

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('open_candidature_legal')
          .setLabel('⚖️ Candidature Légale')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('open_candidature_illegal')
          .setLabel('🔪 Candidature Illégale')
          .setStyle(ButtonStyle.Danger)
      );

      const sent = await recrutCh.send({ embeds: [embed], components: [row] });
      db.recrutementMsgId = sent.id;
      console.log('  ✅ Message recrutement + bouton posté');
    }
    saveDB(db);
  }

  console.log('✅ Auto-setup terminé\n');
}

// ═══════════════════════════════════════════════════════════════
// NOTION AGENDA (optionnel)
// ═══════════════════════════════════════════════════════════════
async function notionQuery() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return [];
  try {
    const res = await fetch(
      `https://api.notion.com/v1/databases/${process.env.NOTION_AGENDA_DB_ID}/query`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          filter: { and: [
            { property: 'Date', date: { on_or_after: new Date().toISOString() } },
            { property: 'Statut', select: { does_not_equal: 'Annulé' } }
          ]},
          sorts: [{ property: 'Date', direction: 'ascending' }]
        })
      }
    );
    const data = await res.json();
    return (data.results || []).map(p => ({
      id: p.id,
      titre: p.properties.Titre?.title?.[0]?.plain_text || '—',
      date: p.properties.Date?.date?.start,
      heure: p.properties.Heure?.rich_text?.[0]?.plain_text,
      type: p.properties.Type?.select?.name || 'Réunion',
      participants: p.properties.Participants?.multi_select?.map(x => x.name).join(', ') || '—',
      lieu: p.properties.Lieu?.rich_text?.[0]?.plain_text || '—',
      notes: p.properties.Notes?.rich_text?.[0]?.plain_text,
      notif24: p.properties['Notif 24h']?.checkbox,
      notif1h: p.properties['Notif 1h']?.checkbox,
      notif15: p.properties['Notif 15min']?.checkbox,
      url: p.url,
    }));
  } catch (e) { return []; }
}

async function notionPatch(pageId, props) {
  if (!process.env.NOTION_TOKEN) return;
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ properties: props })
  }).catch(() => {});
}

async function checkAgenda(guild) {
  const appts = await notionQuery();
  const ch    = getCh(guild, 'agenda', 'planning-sessions', 'planning');
  if (!ch || !appts.length) return;

  const mention = getMention(guild);

  for (const a of appts) {
    if (!a.date) continue;
    const dt   = a.heure ? new Date(`${a.date}T${a.heure}`) : new Date(a.date);
    const mins = Math.floor((dt.getTime() - Date.now()) / 60000);

    const mkEmbed = (title, color) => new EmbedBuilder()
      .setColor(color)
      .setTitle(title)
      .setDescription(`## 📅 ${a.titre}`)
      .addFields(
        { name: 'Quand',        value: `${fmtLong(a.date)}${a.heure ? ` à **${a.heure}**` : ''}`, inline: true },
        { name: 'Lieu',         value: a.lieu, inline: true },
        { name: 'Participants', value: a.participants },
        ...(a.notes ? [{ name: 'Notes', value: a.notes }] : []),
        { name: 'Modifier',     value: `[Ouvrir dans Notion](${a.url})` }
      )
      .setFooter({ text: 'IWC • Secrétariat automatique' });

    if (!a.notif24 && mins <= 1440 && mins > 60) {
      await ch.send({ content: `${mention} — RDV dans 24h`, embeds: [mkEmbed('📅 Rappel — Dans 24 heures', 0x5865F2)] });
      await notionPatch(a.id, { 'Notif 24h': { checkbox: true } });
    }
    if (!a.notif1h && mins <= 60 && mins > 15) {
      await ch.send({ content: `${mention} — RDV dans 1 heure`, embeds: [mkEmbed('⏰ Rappel — Dans 1 heure', 0xFFA500)] });
      await notionPatch(a.id, { 'Notif 1h': { checkbox: true } });
    }
    if (!a.notif15 && mins <= 15 && mins > 0) {
      await ch.send({ content: `${mention} — 🚨 RDV dans 15 minutes`, embeds: [mkEmbed('🚨 URGENT — Dans 15 min', 0xED4245)] });
      await notionPatch(a.id, { 'Notif 15min': { checkbox: true } });
    }
  }
}

async function postDailyAgenda(guild) {
  const ch = getCh(guild, 'agenda', 'planning-sessions', 'planning');
  if (!ch) return;

  const appts = await notionQuery();
  const today = new Date().toISOString().split('T')[0];
  const todayAppts = appts.filter(a => a.date?.startsWith(today));
  const weekAppts  = appts.filter(a => {
    if (!a.date) return false;
    const d = new Date(a.date);
    return d >= new Date() && d <= new Date(Date.now() + 7 * 86400000);
  });

  const embed = new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle(`📅 Agenda — ${fmtLong(new Date())}`)
    .setDescription(
      todayAppts.length === 0
        ? '*Aucun rendez-vous aujourd\'hui.*'
        : todayAppts.map(a =>
            `📅 **${a.titre}**\n🕐 ${a.heure || '—'} · 📍 ${a.lieu} · 👥 ${a.participants}`
          ).join('\n\n')
    );

  const upcoming = weekAppts.filter(a => !a.date?.startsWith(today)).slice(0, 5);
  if (upcoming.length > 0) {
    embed.addFields({
      name: '📆 Cette semaine',
      value: upcoming.map(a => `📅 **${a.titre}** — ${fmtShort(a.date)} ${a.heure || ''}`).join('\n')
    });
  }

  embed.setFooter({ text: 'IWC • Secrétariat automatique' });
  await ch.send({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// NOUVEAU MEMBRE
// ═══════════════════════════════════════════════════════════════
client.on('guildMemberAdd', async member => {
  const db    = loadDB();
  const guild = member.guild;

  // Rôle Visiteur automatique
  const visiteurRole = guild.roles.cache.find(r => r.name.includes('Visiteur'));
  if (visiteurRole) await member.roles.add(visiteurRole).catch(() => {});

  // Enregistrement
  db.members[member.id] = {
    id: member.id,
    name: member.user.username,
    status: 'visiteur',
    rang: 'Visiteur',
    joinedAt: new Date().toISOString(),
    lastActivity: new Date().toISOString(),
  };
  saveDB(db);

  // Notification #arrivées
  const arriveesCh = getCh(guild, 'arrivees', 'arrivée');
  if (arriveesCh) {
    await arriveesCh.send({
      embeds: [new EmbedBuilder()
        .setColor(0x8B5A2A)
        .setTitle('👁️ Nouveau visiteur')
        .setDescription(`**${member.user.username}** a rejoint le serveur.\nDirigé vers **#règlement** pour validation.`)
        .addFields(
          { name: 'Compte créé le', value: fmtShort(member.user.createdAt), inline: true },
          { name: 'Âge du compte',  value: `${daysSince(member.user.createdAt)} jours`, inline: true }
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: 'IWC • Automatique' })]
    });
  }

  // Alerte compte suspect
  if (daysSince(member.user.createdAt) < 7) {
    const logsCh = getCh(guild, 'logs-moderation', 'logs');
    if (logsCh) {
      await logsCh.send({
        content: `${getMention(guild)} — ⚠️ Compte suspect`,
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('⚠️ ALERTE — Compte récent')
          .setDescription(`**${member.user.username}** a rejoint avec un compte créé il y a **${daysSince(member.user.createdAt)} jours**.`)
          .setFooter({ text: 'IWC • Sécurité automatique' })]
      });
    }
  }

  // DM de bienvenue
  member.send({
    embeds: [new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('🐺 Iron Wolf Company')
      .setDescription(
        'Bienvenue sur le serveur.\n\n' +
        'Lis le **#règlement** intégralement et réagis avec ✅ pour accéder au recrutement.\n\n' +
        '*La porte est ouverte une fois. Une seule.*'
      )
      .setFooter({ text: '— La Direction, IWC' })]
  }).catch(() => {});
});

// ═══════════════════════════════════════════════════════════════
// MEMBRE QUI QUITTE
// ═══════════════════════════════════════════════════════════════
client.on('guildMemberRemove', async member => {
  const db = loadDB();
  const m  = db.members[member.id];
  const ch = getCh(member.guild, 'logs-moderation', 'logs');

  if (ch) {
    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(0x555555)
        .setTitle('🚪 Départ')
        .setDescription(`**${member.user.username}** a quitté le serveur.`)
        .addFields(
          { name: 'Rang',   value: m?.rang || '—',                                 inline: true },
          { name: 'Durée',  value: m ? `${daysSince(m.joinedAt)} jours` : '—', inline: true }
        )
        .setFooter({ text: fmtShort(new Date()) })]
    });
  }

  if (db.members[member.id]) {
    db.members[member.id].status = 'parti';
    db.members[member.id].leftAt = new Date().toISOString();
    saveDB(db);
  }
});

// ═══════════════════════════════════════════════════════════════
// RÉACTIONS
// ═══════════════════════════════════════════════════════════════
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  if (reaction.partial) await reaction.fetch().catch(() => {});

  const db    = loadDB();
  const guild = reaction.message.guild;
  if (!guild) return;

  // Validation règlement ✅
  if (reaction.message.id === db.reglementMsgId && reaction.emoji.name === '✅') {
    const logsCh = getCh(guild, 'logs-moderation', 'logs');
    if (logsCh) {
      await logsCh.send({
        content: getMention(guild),
        embeds: [new EmbedBuilder()
          .setColor(0x57F287)
          .setTitle('✅ Règlement validé')
          .setDescription(`**${user.username}** a validé le règlement et peut désormais postuler dans **#recrutement**.`)
          .setFooter({ text: fmtShort(new Date()) })]
      });
    }
    return;
  }

  // Vote dossier ✅ → ACCEPTER
  if (reaction.emoji.name === '✅') {
    const msg   = reaction.message;
    const title = msg.embeds[0]?.title || '';
    if (!title.includes('DOSSIER')) return;

    const isIllegal = title.includes('ILLÉGAL');
    const nom  = title
      .replace('📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ', '')
      .replace('📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ', '')
      .replace('📁 DOSSIER LÉGAL — ', '')
      .replace('📁 DOSSIER ILLÉGAL — ', '')
      .replace('✅ ACCEPTÉ — ', '')
      .trim();
    const cand = db.candidatures.find(c => c.nomPerso === nom && c.status === 'reçue');
    if (!cand) return;

    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (!member) return;

    // Vérifier minimum 4 votes ✅
    const reactUsers = await reaction.users.fetch();
    const voteCount = reactUsers.filter(u => !u.bot).size;
    if (voteCount < 2) {
      await reaction.message.channel.send({
        content: `⏳ **${voteCount}/2 votes** pour accepter **${cand.nomPerso}**. Il manque encore **${2 - voteCount} vote(s)**.`
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 10000));
      return;
    }

    // Rôle selon type
    if (isIllegal) {
      const role = guild.roles.cache.find(r => r.name.includes('Maudit') || r.name.includes('Ombre'));
      if (role) await member.roles.add(role).catch(() => {});
    } else {
      const role = guild.roles.cache.find(r => r.name.includes('Recrue') || r.name.includes('Employé'));
      if (role) await member.roles.add(role).catch(() => {});
    }

    cand.status = 'acceptee';
    saveDB(db);

    // DM selon type
    if (isIllegal) {
      member.send({
        embeds: [new EmbedBuilder()
          .setColor(0x8B1A1A)
          .setTitle('🔪 Bienvenue dans l\'ombre — La Confrérie')
          .setDescription(
            'Tu as été **accepté** au sein de la Confrérie.\n\n' +
            'Tu opères désormais dans l\'ombre. Discrétion absolue.\n\n' +
            '*Ne fais confiance qu\'à ceux que la Direction te désignera.*\n' +
            '*Un faux pas et tu disparais.*\n— La Direction'
          )
          .setFooter({ text: 'La Confrérie • Confidentiel' })]
      }).catch(() => {});
    } else {
      member.send({
        embeds: [new EmbedBuilder()
          .setColor(0x3B82F6)
          .setTitle('⚖️ Candidature acceptée — Iron Wolf Company')
          .setDescription(
            'Ta candidature a été **acceptée**.\n\n' +
            'Tu rejoins la Compagnie dans le cadre légal. La période d\'observation commence maintenant.\n\n' +
            '*Tu connais les règles. Tu connais les attentes.*\n— La Direction'
          )
          .setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })]
      }).catch(() => {});
    }

    // Annonce dans le bon -dossier-recrutement selon type
    const dossierFinalCh = isIllegal
      ? guild.channels.cache.get('1509252295127466096')  // -dossier-recrutement ILLÉGAL
      : guild.channels.cache.get('1509254295717941278'); // -dossier-recrutement LÉGAL
    if (dossierFinalCh) {
      if (isIllegal) {
        await dossierFinalCh.send({
          embeds: [new EmbedBuilder()
            .setColor(0x8B1A1A)
            .setTitle('🔪 La Confrérie — Un nouveau visage dans l\'ombre')
            .setDescription(`**${cand.nomPerso}** a intégré la Confrérie.\n*Certains chemins ne se montrent pas à la lumière.*`)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` })]
        });
      } else {
        await dossierFinalCh.send({
          embeds: [new EmbedBuilder()
            .setColor(0x3B82F6)
            .setTitle('⚖️ Nouveau membre — Iron Wolf Company')
            .setDescription(`**${cand.nomPerso}** rejoint la Compagnie.\n*Bienvenue dans la meute.*`)
            .setThumbnail(member.user.displayAvatarURL())
            .setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` })]
        });
      }
    }

    try {
      const updated = EmbedBuilder.from(msg.embeds[0])
        .setColor(isIllegal ? 0x8B1A1A : 0x3B82F6)
        .setTitle(`✅ ACCEPTÉ — ${cand.nomPerso}`);
      await msg.edit({ embeds: [updated] });
    } catch (e) {}
    return;
  }

  // Vote dossier ❌ → REFUSER
  if (reaction.emoji.name === '❌') {
    const msg   = reaction.message;
    const title = msg.embeds[0]?.title || '';
    if (!title.includes('DOSSIER')) return;

    const isIllegal = title.includes('ILLÉGAL');
    const nom  = title
      .replace('📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ', '')
      .replace('📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ', '')
      .replace('📁 DOSSIER LÉGAL — ', '')
      .replace('📁 DOSSIER ILLÉGAL — ', '')
      .trim();
    const cand = db.candidatures.find(c => c.nomPerso === nom && c.status === 'reçue');
    if (!cand) return;

    // Vérifier minimum 4 votes ❌
    const refuseUsers = await reaction.users.fetch();
    const refuseCount = refuseUsers.filter(u => !u.bot).size;
    if (refuseCount < 2) {
      await reaction.message.channel.send({
        content: `⏳ **${refuseCount}/2 votes** pour refuser **${cand.nomPerso}**. Il manque encore **${2 - refuseCount} vote(s)**.`
      }).then(msg => setTimeout(() => msg.delete().catch(() => {}), 10000));
      return;
    }

    cand.status = 'refusee';
    saveDB(db);

    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (member) {
      if (isIllegal) {
        member.send({
          embeds: [new EmbedBuilder()
            .setColor(0x555555)
            .setTitle('La Confrérie')
            .setDescription(
              'Ta demande n\'a pas été retenue.\n\n' +
              '*On ne donne pas d\'explication. On ne discute pas.*\n— La Direction'
            )
            .setFooter({ text: 'La Confrérie • Confidentiel' })]
        }).catch(() => {});
      } else {
        member.send({
          embeds: [new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle('Iron Wolf Company')
            .setDescription(
              'Ta candidature n\'a pas été retenue.\n\n' +
              '*La Direction se réserve le droit de refuser sans justification.*\n— La Direction'
            )
            .setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })]
        }).catch(() => {});
      }
    }

    try {
      const updated = EmbedBuilder.from(msg.embeds[0])
        .setColor(0xED4245)
        .setTitle(`❌ REFUSÉ — ${cand.nomPerso}`);
      await msg.edit({ embeds: [updated] });
    } catch (e) {}
  }
});

// ═══════════════════════════════════════════════════════════════
// INTERACTIONS (boutons + modals)
// ═══════════════════════════════════════════════════════════════
client.on('interactionCreate', async interaction => {

  // ── Bouton Candidature LÉGALE ──
  if (interaction.isButton() && interaction.customId === 'open_candidature_legal') {
    const modal = new ModalBuilder()
      .setCustomId('candidature_modal_legal')
      .setTitle('⚖️ Iron Wolf Company — Légal');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nom_perso')
          .setLabel('Nom du personnage')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Jonas Caverly')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('age_perso')
          .setLabel('Âge du personnage')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 34 ans')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('metier')
          .setLabel('Métier / Compétences légales')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Médecin, Avocat, Marchand, Forgeron...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('background')
          .setLabel('Background du personnage')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setPlaceholder('Qui est ton personnage ? Décris son passé...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('dispos')
          .setLabel('Disponibilités & Expérience RP')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Soir semaine, week-end / Expérience confirmée')
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  // ── Bouton Candidature ILLÉGALE ──
  if (interaction.isButton() && interaction.customId === 'open_candidature_illegal') {
    const modal = new ModalBuilder()
      .setCustomId('candidature_modal_illegal')
      .setTitle('🔪 Organisation Hors la Loi — Illégal');

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('nom_perso')
          .setLabel('Nom du personnage')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Viktor Crane')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('age_perso')
          .setLabel('Âge du personnage')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 29 ans')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('specialite')
          .setLabel('Spécialité / Activités')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Contrebande, Sécurité, Bras droit...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('background')
          .setLabel('Background du personnage')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000)
          .setPlaceholder('Qui est ton personnage ? Ce qui l’a amené dans l’ombre...')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('dispos')
          .setLabel('Disponibilités & Expérience RP')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: Soir semaine, week-end / Expérience confirmée')
      ),
    );

    await interaction.showModal(modal);
    return;
  }

  // ── Soumission formulaire LÉGAL ──
  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_legal') {
    await interaction.deferReply({ ephemeral: true });
    const db    = loadDB();
    const guild = interaction.guild;

    const cand = {
      id: Date.now().toString(),
      userId: interaction.user.id,
      username: interaction.user.username,
      nomPerso: interaction.fields.getTextInputValue('nom_perso'),
      agePerso: interaction.fields.getTextInputValue('age_perso'),
      metier: interaction.fields.getTextInputValue('metier'),
      background: interaction.fields.getTextInputValue('background'),
      dispos: interaction.fields.getTextInputValue('dispos'),
      type: 'legal',
      status: 'reçue',
      receivedAt: new Date().toISOString(),
    };
    db.candidatures.push(cand);
    saveDB(db);

    await interaction.editReply({
      content:
        '✅ **Candidature légale transmise à la Direction**\n\n' +
        'Ta demande a été enregistrée. Tu recevras une réponse en DM sous 48h.\n' +
        '*La Compagnie ne recrute pas au hasard.*'
    });

    interaction.user.send({
      embeds: [new EmbedBuilder()
        .setColor(0x3B82F6)
        .setTitle('📥 Candidature légale reçue — IWC')
        .setDescription(
          'Ta candidature a bien été transmise à la Direction.\n\n' +
          'Une réponse en DM sous 48h.\n\n' +
          '*La Compagnie choisit ses membres avec soin.*\n— La Direction, Iron Wolf Company'
        )
        .setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })]
    }).catch(() => {});

    const dossierCh = guild.channels.cache.get('1509254315712188438'); // recrutement-interne LÉGAL
    if (dossierCh) {
      const mention = getMention(guild);
      const embed = new EmbedBuilder()
        .setColor(0x3B82F6)
        .setTitle(`📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ${cand.nomPerso}`)
        .setDescription(
          `> *"Chaque talent a sa place au sein de la Compagnie."*\n\n` +
          `Candidature de <@${cand.userId}> (**${cand.username}**)\n` +
          `**⚖️ TYPE : RECRUTEMENT LÉGAL**`
        )
        .addFields(
          { name: '👤 Personnage',       value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true },
          { name: '📅 Reçue le',         value: fmtShort(new Date()), inline: true },
          { name: '🆔 ID',               value: `\`${cand.id}\``, inline: true },
          { name: '💼 Métier / Compétences', value: cand.metier },
          { name: '📖 Background',       value: cand.background.slice(0, 1000) },
          { name: '🕐 Disponibilités',   value: cand.dispos, inline: true },
          { name: '📋 Statut',           value: '🟡 En attente d\'examen', inline: true },
          { name: '\u200b', value: '**Réagissez pour voter :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: `Iron Wolf Company • Dossier Légal • ${fmtShort(new Date())}` });

      const dossierMsg = await dossierCh.send({
        content: `${mention} — 📋 Nouveau dossier **LÉGAL**`,
        embeds: [embed]
      });
      await dossierMsg.react('✅');
      await dossierMsg.react('❌');
      await dossierMsg.react('🤔');

      try {
        const thread = await dossierMsg.startThread({
          name: `[LÉGAL] Discussion — ${cand.nomPerso}`,
          autoArchiveDuration: 10080,
        });
        await thread.send(
          `**Discussion interne — ${cand.nomPerso}** ⚖️ Recrutement Légal\n\n` +
          `Échangez ici avant de voter.\n` +
          `Réagissez sur le message principal avec ✅ ❌ 🤔`
        );
      } catch (e) {}
    }
    return;
  }

  // ── Soumission formulaire ILLÉGAL ──
  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_illegal') {
    await interaction.deferReply({ ephemeral: true });
    const db    = loadDB();
    const guild = interaction.guild;

    const cand = {
      id: Date.now().toString(),
      userId: interaction.user.id,
      username: interaction.user.username,
      nomPerso: interaction.fields.getTextInputValue('nom_perso'),
      agePerso: interaction.fields.getTextInputValue('age_perso'),
      specialite: interaction.fields.getTextInputValue('specialite'),
      background: interaction.fields.getTextInputValue('background'),
      dispos: interaction.fields.getTextInputValue('dispos'),
      type: 'illegal',
      status: 'reçue',
      receivedAt: new Date().toISOString(),
    };
    db.candidatures.push(cand);
    saveDB(db);

    await interaction.editReply({
      content:
        '🔒 **Demande transmise**\n\n' +
        'Ton dossier a été acheminé. Reste discret.\n' +
        '*On te contactera si tu es jugé digne.*'
    });

    interaction.user.send({
      embeds: [new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle('🔒 Dossier transmis — IWC')
        .setDescription(
          'Ton dossier a été acheminé aux bonnes personnes.\n\n' +
          'Une réponse en DM sous 48h.\n\n' +
          '*Ne parle de cela à personne.*\n— La Direction, Iron Wolf Company'
        )
        .setFooter({ text: 'Iron Wolf Company • Confidentiel' })]
    }).catch(() => {});

    const dossierCh = guild.channels.cache.get('1508756516830842960'); // recrutement-interne ILLÉGAL
    if (dossierCh) {
      const mention = getMention(guild);
      const embed = new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle(`📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ${cand.nomPerso}`)
        .setDescription(
          `> *"L'ombre protège ceux qui savent s'y fondre."*\n\n` +
          `Candidature de <@${cand.userId}> (**${cand.username}**)\n` +
          `**🔪 TYPE : RECRUTEMENT ILLÉGAL**`
        )
        .addFields(
          { name: '👤 Personnage',       value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true },
          { name: '📅 Reçue le',         value: fmtShort(new Date()), inline: true },
          { name: '🆔 ID',               value: `\`${cand.id}\``, inline: true },
          { name: '🔪 Spécialité',       value: cand.specialite },
          { name: '📖 Background',       value: cand.background.slice(0, 1000) },
          { name: '🕐 Disponibilités',   value: cand.dispos, inline: true },
          { name: '📋 Statut',           value: '🟡 En attente d\'examen', inline: true },
          { name: '\u200b', value: '**Réagissez pour voter :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' }
        )
        .setThumbnail(interaction.user.displayAvatarURL())
        .setFooter({ text: `La Confrérie • Dossier Illégal — CONFIDENTIEL • ${fmtShort(new Date())}` });

      const dossierMsg = await dossierCh.send({
        content: `${mention} — 🔪 Nouveau dossier **ILLÉGAL**`,
        embeds: [embed]
      });
      await dossierMsg.react('✅');
      await dossierMsg.react('❌');
      await dossierMsg.react('🤔');

      try {
        const thread = await dossierMsg.startThread({
          name: `[ILLÉGAL] Discussion — ${cand.nomPerso}`,
          autoArchiveDuration: 10080,
        });
        await thread.send(
          `**Discussion interne — ${cand.nomPerso}** 🔪 Recrutement Illégal\n\n` +
          `Échangez ici avant de voter.\n` +
          `Réagissez sur le message principal avec ✅ ❌ 🤔`
        );
      } catch (e) {}
    }
    return;
  }

    // ── Boutons statut opérations ──
  if (interaction.isButton()) {
    const parts = interaction.customId.split('_');
    if (parts[0] !== 'op') return;

    const [, status, opId] = parts;
    const db = loadDB();
    const op = db.operations.find(o => o.id === opId);
    if (!op) return interaction.reply({ content: '❌ Opération introuvable.', ephemeral: true });

    const labels = {
      encours: '🟢 En cours',
      terminee: '✅ Terminée',
      annulee: '❌ Annulée',
    };

    op.status = status === 'encours' ? 'en_cours' : status;
    if (status === 'terminee') op.endedAt = new Date().toISOString();
    saveDB(db);

    const colors = { encours: 0x00AA00, terminee: 0x57F287, annulee: 0xED4245 };
    const updated = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(colors[status] || 0x8B5A2A)
      .spliceFields(0, 1, { name: 'Statut', value: labels[status] || status, inline: true });

    await interaction.update({
      embeds: [updated],
      components: ['terminee', 'annulee'].includes(status) ? [] : interaction.message.components
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// MESSAGES — détection automatique (opérations + sessions + absences)
// ═══════════════════════════════════════════════════════════════
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const db    = loadDB();
  const guild = message.guild;

  // Suivi activité
  if (db.members[message.author.id]) {
    db.members[message.author.id].lastActivity = new Date().toISOString();
    saveDB(db);
  }

  const isDir = message.member?.roles.cache.some(r =>
    ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier'].some(n => r.name.includes(n))
  );

  // ── Absence dans #absences ──
  const absCh = getCh(guild, 'absences');
  if (absCh && message.channel.id === absCh.id) {
    if (db.members[message.author.id]) {
      db.members[message.author.id].status = 'absent';
      saveDB(db);
      await message.react('✅');
      const logsCh = getCh(guild, 'logs-moderation', 'logs');
      if (logsCh) {
        await logsCh.send({
          embeds: [new EmbedBuilder()
            .setColor(0xFFA500)
            .setTitle('⚠️ Absence signalée')
            .setDescription(`**${message.author.username}** a signalé une absence.`)
            .setFooter({ text: fmtShort(new Date()) })]
        });
      }
    }
    return;
  }

  // ── Opération dans #opérations ──
  const opsCh = getCh(guild, 'operations-en-cours', 'operations');
  if (opsCh && message.channel.id === opsCh.id && isDir) {
    if (message.content.toUpperCase().includes('OPÉRATION') || message.content.toUpperCase().includes('OPERATION')) {
      const lines = message.content.split('\n');
      const get   = k => {
        const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase()));
        return l ? l.split(':').slice(1).join(':').trim() || '—' : '—';
      };

      const op = {
        id: Date.now().toString(),
        name: get('NOM'),
        lieu: get('LIEU'),
        objectif: get('OBJECTIF'),
        equipe: get('ÉQUIPE') || get('EQUIPE'),
        status: 'preparation',
        createdAt: new Date().toISOString(),
      };
      db.operations.push(op);
      saveDB(db);

      const embed = new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle(`🎯 OPÉRATION — ${op.name}`)
        .addFields(
          { name: 'Statut',   value: '🟡 En préparation', inline: true },
          { name: 'Lieu',     value: op.lieu, inline: true },
          { name: 'Équipe',   value: op.equipe },
          { name: 'Objectif', value: op.objectif }
        )
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

  // ── Session dans #planning-sessions ──
  const planCh = getCh(guild, 'planning-sessions', 'planning');
  if (planCh && message.channel.id === planCh.id && isDir) {
    if (message.content.toUpperCase().includes('SESSION') && message.content.toUpperCase().includes('DATE')) {
      const lines = message.content.split('\n');
      const get   = k => {
        const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase()));
        return l ? l.split(':').slice(1).join(':').trim() || '—' : '—';
      };

      const session = {
        id: Date.now().toString(),
        name: get('NOM') || get('SESSION'),
        date: get('DATE'),
        heure: get('HEURE'),
        lieu: get('LIEU'),
        type: get('TYPE') || 'RP Principal',
        status: 'planifiee',
      };
      db.sessions.push(session);
      saveDB(db);

      const embed = new EmbedBuilder()
        .setColor(0x5865F2)
        .setTitle(`📅 SESSION — ${session.name}`)
        .addFields(
          { name: 'Date & Heure', value: `${session.date} à ${session.heure}`, inline: true },
          { name: 'Lieu IC',      value: session.lieu, inline: true },
          { name: 'Type',         value: session.type, inline: true }
        )
        .setDescription('Confirmez votre présence :')
        .setFooter({ text: 'IWC • Rappel automatique 1h avant' });

      const sent = await planCh.send({ embeds: [embed] });
      await sent.react('✅');
      await sent.react('❌');

      // Rappel automatique 1h avant
      try {
        const dt    = new Date(`${session.date.split('/').reverse().join('-')}T${session.heure}`);
        const delay = dt.getTime() - Date.now() - 3600000;
        if (delay > 0) {
          setTimeout(async () => {
            const mention = getMention(guild);
            await planCh.send({
              content: mention,
              embeds: [new EmbedBuilder()
                .setColor(0xFF6B35)
                .setTitle(`⏰ RAPPEL — ${session.name} dans 1 heure`)
                .setDescription(`📍 ${session.lieu} · 🕐 ${session.heure}`)
                .setFooter({ text: 'IWC • Rappel automatique' })]
            });
          }, delay);
        }
      } catch (e) {}

      await message.react('✅');
    }
  }
});

// ═══════════════════════════════════════════════════════════════
// DÉMARRAGE + CRON JOBS
// ═══════════════════════════════════════════════════════════════
client.once('ready', async () => {
  console.log(`\n🐺 IWC Bot — ${client.user.tag}`);
  console.log('MODE FULL AUTO — Zéro commande requise\n');
  console.log('⚠️  Aucune permission existante modifiée\n');

  client.user.setActivity('Iron Wolf Company', { type: ActivityType.Watching });

  const guild = client.guilds.cache.first();
  if (!guild) {
    console.log('❌ Serveur introuvable. Vérifiez GUILD_ID dans .env');
    return;
  }

  await sleep(2000);
  await autoSetup(guild);

  // ── Toutes les heures → dashboard ──
  cron.schedule('0 * * * *', () => updateDashboard(guild));

  // ── Toutes les 5 min → agenda Notion ──
  cron.schedule('*/5 * * * *', () => checkAgenda(guild));

  // ── 8h00 → agenda du jour ──
  cron.schedule('0 8 * * *', () => postDailyAgenda(guild));

  // ── 9h30 quotidien → inactivité + retours absences ──
  cron.schedule('30 9 * * *', async () => {
    const db     = loadDB();
    const logsCh = getCh(guild, 'logs-moderation', 'logs');
    let changed  = false;

    for (const m of Object.values(db.members)) {
      // Passage inactif après 14 jours
      if (m.status === 'actif' && daysSince(m.lastActivity) >= 14) {
        db.members[m.id].status = 'inactif';
        changed = true;
      }
      // Retour automatique après fin d'absence
      if (m.status === 'absent' && m.absentUntil) {
        const retour = new Date(m.absentUntil.split('/').reverse().join('-'));
        if (retour <= new Date()) {
          db.members[m.id].status = 'actif';
          db.members[m.id].absentUntil = null;
          changed = true;
        }
      }
    }
    if (changed) saveDB(db);

    // Rapport inactivité (7+ jours)
    const inactifs = Object.values(db.members).filter(m =>
      m.status === 'actif' && daysSince(m.lastActivity) >= 7
    );
    if (inactifs.length > 0 && logsCh) {
      await logsCh.send({
        content: getMention(guild),
        embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle('⚠️ Rapport inactivité')
          .setDescription(inactifs.map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)} jours`).join('\n'))
          .setFooter({ text: `${fmtShort(new Date())} • IWC Automatique` })]
      });
    }
  });

  // ── Lundi 9h00 → rapport hebdomadaire ──
  cron.schedule('0 9 * * 1', async () => {
    const db  = loadDB();
    const ch  = getCh(guild, 'logs-moderation', 'logs');
    if (!ch) return;

    const members = Object.values(db.members);

    await ch.send({
      content: getMention(guild),
      embeds: [new EmbedBuilder()
        .setColor(0x8B5A2A)
        .setTitle('📊 Rapport hebdomadaire — IWC')
        .setDescription(`Semaine du ${fmtShort(new Date(Date.now() - 7 * 86400000))} au ${fmtShort(new Date())}`)
        .addFields(
          {
            name: '👥 Membres',
            value: `Actifs : **${members.filter(m => m.status === 'actif').length}** · Absents : **${members.filter(m => m.status === 'absent').length}** · Inactifs : **${members.filter(m => m.status === 'inactif').length}**`
          },
          {
            name: '🎯 Opérations',
            value: `**${db.operations.filter(o => o.status === 'terminee').length}** terminées au total`
          },
          {
            name: '📝 Recrutement',
            value: `**${db.candidatures.filter(c => daysSince(c.receivedAt) <= 7).length}** candidatures cette semaine`
          }
        )
        .setFooter({ text: `Rapport automatique • ${fmtShort(new Date())}` })]
    });
  });

  console.log('✅ Automatismes actifs :');
  console.log('   → Dashboard           : toutes les heures');
  console.log('   → Agenda Notion       : toutes les 5 minutes');
  console.log('   → Agenda du jour      : 8h00 chaque matin');
  console.log('   → Rapport inactivité  : 9h30 chaque jour');
  console.log('   → Rapport hebdo       : lundi 9h00');
  console.log('\n📣 Notifications → Le Concepteur + Le Fléau\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Bot opérationnel. Rien à faire sur Discord.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
});

client.login(process.env.BOT_TOKEN);
