// ═══════════════════════════════════════════════════════════════
// notion-modules-v3.js — Grades · Inactivité · Affaires · Absences · Informateurs
// IWC Bot v3.2
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, StringSelectMenuOptionBuilder,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

let notionExtra = {};
try { notionExtra = require('./notion-extra'); } catch {}

// ── Constantes ──
const JOURS_INACTIF = 5;

// Rôles IDs — La Confrérie + Iron Wolf Company (pingés selon le pôle)
const ROLES = {
  // Légal
  LE_CONSEIL:    '1508289999035039875',
  OFFICIER:      '1508290320763195482',
  AGENT_CONFIRME:'1508292278953836655',
  OPERATEUR:     '1509340000000000001', // à adapter si besoin
  RECRUE:        '1509340000000000002', // à adapter si besoin
  IRON_WOLF:     '1508756436082102303', // Pôle Légal
  // Illégal
  LE_CONCEPTEUR: '1509252000000000001', // à adapter
  LE_FLEAU:      '1509252000000000002',
  EXECUTEUR:     '1509252000000000003',
  CONDAMNE:      '1509252000000000004',
  MAUDIT:        '1509252000000000005',
  CONFRATERIE:   '1508756479274913903', // Pôle Illégal
};

// Hiérarchie des grades — LÉGAL (ordre décroissant = plus haut rang en premier)
const GRADES_LEGAL = [
  { nom: 'Le Conseil — Directeur', emoji: '👑', roleKey: 'LE_CONSEIL',    couleur: 0xFFD700 },
  { nom: 'Officier de Terrain',    emoji: '🎖️', roleKey: 'OFFICIER',      couleur: 0xC0C0C0 },
  { nom: 'Agent Confirmé',         emoji: '🔵', roleKey: 'AGENT_CONFIRME', couleur: 0x3B82F6 },
  { nom: 'Opérateur',              emoji: '🟢', roleKey: 'OPERATEUR',      couleur: 0x57F287 },
  { nom: 'Recrue — Probatoire',    emoji: '⚪', roleKey: 'RECRUE',         couleur: 0xAAAAAA },
];

// Hiérarchie des grades — ILLÉGAL
const GRADES_ILLEGAL = [
  { nom: 'Le Concepteur',    emoji: '💀', roleKey: 'LE_CONCEPTEUR', couleur: 0x8B1A1A },
  { nom: 'Le Fléau',         emoji: '⚔️', roleKey: 'LE_FLEAU',      couleur: 0xED4245 },
  { nom: "L'Exécuteur",      emoji: '🗡️', roleKey: 'EXECUTEUR',     couleur: 0xFF6B35 },
  { nom: 'Le Condamné',      emoji: '🔴', roleKey: 'CONDAMNE',      couleur: 0xFFA500 },
  { nom: 'Le Maudit',        emoji: '🟤', roleKey: 'MAUDIT',        couleur: 0x8B5A2A },
];

const MEMBRES_DISCORD_MAP = {
  'Colt Kane':      '696325126047662081',
  'June McCall':    '998581854791798835',
  'Cyrus Hollow':   '324627678143578112',
  'Jonas Caverly':  '944208797084311583',
  'Thomas Galagan': '982201491773354035',
};

function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}
function isDirection(member) {
  return member?.roles?.cache?.some(r =>
    ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire', 'Conseil'].some(n => r.name.includes(n))
  );
}

// ═══════════════════════════════════════════════════════════════
// 1. ABSENCES — Détection dans n'importe quel salon + transfert
// ═══════════════════════════════════════════════════════════════
//
// Dans messageCreate (index.js), AVANT toute autre logique, appelle :
//   const handled = await notionV3.handleAbsenceDetection(message);
//   if (handled) return;
//
// Mots-clés déclencheurs : "absent", "absence", "dispo pas", "serai pas là",
// "serai pas dispo", "peux pas", "pas là", "reviens", "pause"

const ABSENCE_KEYWORDS = [
  'absent', 'absence', 'absente', 'serai pas là', 'serai pas dispo',
  'pas disponible', 'pas là', 'dispo pas', 'en pause', 'pause de',
  'reviens dans', 'retour dans', 'indisponible',
];

async function handleAbsenceDetection(message) {
  if (message.author.bot || !message.guild) return false;

  const absCh = getCh(message.guild, 'absences');
  if (!absCh) return false;

  // Si déjà dans #absences → laisser passer normalement
  if (message.channel.id === absCh.id) return false;

  const content = message.content.toLowerCase();
  const isAbsenceMsg = ABSENCE_KEYWORDS.some(kw => content.includes(kw));
  if (!isAbsenceMsg) return false;

  // Supprimer le message original
  await message.delete().catch(() => {});

  // Notifier discrètement l'auteur en éphémère (DM)
  await message.author.send({
    embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('📋 Absence détectée — IWC')
      .setDescription(`Ton message a été déplacé dans **#absences** automatiquement.\n\n> *${message.content.slice(0, 300)}*`)
      .setFooter({ text: 'IWC • Système automatique' })
    ]
  }).catch(() => {});

  // Reposer dans #absences avec mention de l'auteur
  const db = loadDB();
  if (db.members[message.author.id]) {
    db.members[message.author.id].status = 'absent';
    db.members[message.author.id].lastActivity = new Date().toISOString();
    saveDB(db);
  }

  // MàJ Notion
  await notionExtra.majStatutActiviteNotion?.(message.author.id, 'absent');

  await absCh.send({
    embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(`🟡 Absence — ${message.author.username}`)
      .setDescription(`> *${message.content.slice(0, 500)}*`)
      .addFields(
        { name: '👤 Membre',   value: `<@${message.author.id}>`, inline: true },
        { name: '📅 Date',     value: fmtShort(new Date()),       inline: true },
        { name: '📍 Origine',  value: `#${message.channel.name}`, inline: true },
      )
      .setFooter({ text: 'IWC • Absence automatique' })
      .setTimestamp()
    ]
  });

  return true; // message traité, stopper la propagation
}

// ═══════════════════════════════════════════════════════════════
// 2. INACTIVITÉ — Détection auto après 5 jours sans message
// ═══════════════════════════════════════════════════════════════
//
// Appelé par un cron toutes les heures dans index.js :
//   await notionV3.checkInactivite(guild);

async function checkInactivite(guild) {
  try {
    const db = loadDB();
    const logsCh = getCh(guild, 'logs');
    let changed = false;

    for (const [userId, membre] of Object.entries(db.members || {})) {
      if (membre.status === 'parti' || membre.status === 'visiteur') continue;

      const jours = daysSince(membre.lastActivity);

      // Passage absent → inactif après 5 jours
      if (jours >= JOURS_INACTIF && membre.status !== 'inactif') {
        const ancienStatut = membre.status;
        db.members[userId].status = 'inactif';
        changed = true;

        await notionExtra.majStatutActiviteNotion?.(userId, 'inactif');

        if (logsCh) {
          await logsCh.send({
            embeds: [new EmbedBuilder()
              .setColor(0x555555)
              .setTitle(`💤 Inactivité automatique — ${membre.name}`)
              .setDescription(`**${membre.name}** est passé **inactif** après **${jours} jours** sans message.`)
              .addFields(
                { name: '👤 Membre',           value: `<@${userId}>`,            inline: true },
                { name: '📅 Dernière activité', value: fmtShort(membre.lastActivity), inline: true },
                { name: '📋 Ancien statut',     value: ancienStatut,              inline: true },
              )
              .setFooter({ text: `IWC • Inactivité auto • ${JOURS_INACTIF}j` })
            ]
          }).catch(() => {});
        }

        // DM au membre
        try {
          const member = await guild.members.fetch(userId).catch(() => null);
          if (member) {
            await member.send({
              embeds: [new EmbedBuilder()
                .setColor(0x555555)
                .setTitle('💤 Statut — Iron Wolf Company')
                .setDescription(`Tu as été marqué **inactif** suite à **${jours} jours** sans activité sur le serveur.\n\nReviens poster un message pour retrouver ton statut actif.\n\n*La Compagnie n'oublie pas ses membres — mais elle a besoin de les voir.*\n— La Direction`)
                .setFooter({ text: 'IWC • Système automatique' })
              ]
            }).catch(() => {});
          }
        } catch {}
      }

      // Retour automatique à actif si message récent (géré dans messageCreate)
    }

    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkInactivite error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 3. GRADES — Panneau de gestion + Tableau hiérarchique
// ═══════════════════════════════════════════════════════════════
//
// Slash commands à enregistrer :
//   { name: 'grade-set',    description: '🎖️ Attribuer un grade à un membre (Direction)' }
//   { name: 'hierarchie',   description: '📊 Afficher le tableau hiérarchique' }
//
// Bouton 'btn_grade_panel' → ouvre le panneau de gestion
// Appelé dans autoSetup :
//   await notionV3.setupGradePanel(guild);
//   await notionV3.updateHierarchieEmbed(guild);

/**
 * Poste ou met à jour l'embed épinglé de hiérarchie dans #grade
 */
async function updateHierarchieEmbed(guild) {
  try {
    const db = loadDB();
    const gradeCh = getCh(guild, 'grade');
    if (!gradeCh) return;

    const membres = Object.values(db.members || {}).filter(m => m.status !== 'parti' && m.status !== 'visiteur');

    // Grouper par grade
    const grouper = (grades) => grades.map(g => {
      const liste = membres.filter(m =>
        m.rang === g.nom || m.rang?.toLowerCase().includes(g.nom.toLowerCase().split(' ')[0])
      );
      return { ...g, membres: liste };
    }).filter(g => g.membres.length > 0);

    const legaux  = grouper(GRADES_LEGAL);
    const illegaux = grouper(GRADES_ILLEGAL);

    const buildSection = (grades, titre, couleurTitre) => {
      if (!grades.length) return `*Aucun membre*`;
      return grades.map(g =>
        `${g.emoji} **${g.nom}**\n${g.membres.map(m => `┗ ${m.name}${m.status === 'absent' ? ' *(absent)*' : m.status === 'inactif' ? ' *(inactif)*' : ''}`).join('\n')}`
      ).join('\n\n');
    };

    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('⚔️ IRON WOLF COMPANY — Tableau Hiérarchique')
      .setDescription('*Structure interne de la Compagnie. Mis à jour automatiquement.*')
      .addFields(
        {
          name: '⚖️ ═══ PÔLE LÉGAL ═══',
          value: buildSection(legaux, 'Légal', 0x3B82F6) || '*Aucun membre*',
          inline: false,
        },
        {
          name: '🔪 ═══ LA CONFRÉRIE ═══',
          value: buildSection(illegaux, 'Illégal', 0x8B1A1A) || '*Aucun membre*',
          inline: false,
        },
        {
          name: '📊 Effectifs',
          value: [
            `✅ Actifs : **${membres.filter(m => m.status === 'actif').length}**`,
            `⚠️ Absents : **${membres.filter(m => m.status === 'absent').length}**`,
            `💤 Inactifs : **${membres.filter(m => m.status === 'inactif').length}**`,
          ].join(' · '),
          inline: false,
        }
      )
      .setFooter({ text: `IWC • Hiérarchie • MàJ ${new Date().toLocaleString('fr-FR')}` });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_grade_panel')
        .setLabel('🎖️ Gérer les grades')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_hierarchie_refresh')
        .setLabel('🔄 Actualiser')
        .setStyle(ButtonStyle.Secondary),
    );

    // Mettre à jour le message épinglé ou en poster un nouveau
    if (db.hierarchieMsgId) {
      try {
        const msg = await gradeCh.messages.fetch(db.hierarchieMsgId);
        if (msg) { await msg.edit({ embeds: [embed], components: [row] }); return; }
      } catch {}
    }

    const sent = await gradeCh.send({ embeds: [embed], components: [row] });
    await sent.pin().catch(() => {});
    db.hierarchieMsgId = sent.id;
    saveDB(db);
  } catch (e) { console.log('❌ updateHierarchieEmbed error:', e.message); }
}

/**
 * /hierarchie — poste le tableau à la demande dans le salon courant
 */
async function handleHierarchieCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const db = loadDB();
  const membres = Object.values(db.members || {}).filter(m => m.status !== 'parti' && m.status !== 'visiteur');

  const buildSection = (grades) => grades.map(g => {
    const liste = membres.filter(m => m.rang === g.nom || m.rang?.toLowerCase().includes(g.nom.toLowerCase().split(' ')[0]));
    if (!liste.length) return null;
    return `${g.emoji} **${g.nom}**\n${liste.map(m => `┗ <@${Object.entries(MEMBRES_DISCORD_MAP).find(([n]) => n === m.name)?.[1] || m.id}>${m.status !== 'actif' ? ` *(${m.status})*` : ''}`).join('\n')}`;
  }).filter(Boolean).join('\n\n') || '*Aucun membre*';

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('⚔️ Hiérarchie — Iron Wolf Company')
    .addFields(
      { name: '⚖️ PÔLE LÉGAL',    value: buildSection(GRADES_LEGAL),    inline: false },
      { name: '🔪 LA CONFRÉRIE',  value: buildSection(GRADES_ILLEGAL),   inline: false },
    )
    .setFooter({ text: `IWC • ${new Date().toLocaleString('fr-FR')}` });

  await interaction.editReply({ embeds: [embed] });
}

/**
 * /grade-set — Panneau de sélection membre + grade
 */
async function handleGradeSetCommand(interaction) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true });
  }
  await _showGradePanel(interaction);
}

/**
 * Bouton btn_grade_panel → même panneau
 */
async function handleGradePanelButton(interaction) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true });
  }
  await _showGradePanel(interaction);
}

async function _showGradePanel(interaction) {
  const db = loadDB();
  const membres = Object.values(db.members || {}).filter(m => m.status !== 'parti' && m.status !== 'visiteur');

  if (!membres.length) {
    return interaction.reply({ content: '❌ Aucun membre dans la base.', ephemeral: true });
  }

  // Menu sélection membre
  const options = membres.slice(0, 25).map(m => ({
    label: m.name,
    value: m.id || Object.entries(MEMBRES_DISCORD_MAP).find(([n]) => n === m.name)?.[1] || m.name,
    description: `Rang actuel : ${m.rang || '—'} · Statut : ${m.status}`,
    emoji: m.status === 'actif' ? '✅' : m.status === 'absent' ? '⚠️' : '💤',
  }));

  const memberSelect = new StringSelectMenuBuilder()
    .setCustomId('grade_select_membre')
    .setPlaceholder('Sélectionner un membre...')
    .addOptions(options);

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('🎖️ Gestion des Grades — IWC')
    .setDescription('**Étape 1/2** — Sélectionnez le membre à promouvoir / rétrograder.')
    .addFields(
      { name: '⚖️ Grades Légal', value: GRADES_LEGAL.map(g => `${g.emoji} ${g.nom}`).join('\n'), inline: true },
      { name: '🔪 Grades Illégal', value: GRADES_ILLEGAL.map(g => `${g.emoji} ${g.nom}`).join('\n'), inline: true },
    )
    .setFooter({ text: 'IWC • Panneau de gestion' });

  await interaction.reply({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(memberSelect)],
    ephemeral: true,
  });
}

/**
 * Étape 2 : sélection du membre → affiche les grades disponibles
 */
async function handleGradeMembreSelect(interaction) {
  const userId = interaction.values[0];
  const db = loadDB();

  // Trouver le membre (par id ou par nom mappé)
  const membre = db.members[userId] || Object.values(db.members).find(m =>
    Object.entries(MEMBRES_DISCORD_MAP).find(([n, id]) => id === userId && n === m.name)
  );

  const nomMembre = membre?.name || userId;
  const rangActuel = membre?.rang || '—';

  // Déterminer le pôle probable pour pré-sélectionner
  const isIlleg = membre?.pole === 'illegal' || GRADES_ILLEGAL.some(g => g.nom === rangActuel);

  const allGrades = [...GRADES_LEGAL, ...GRADES_ILLEGAL];
  const gradeOptions = allGrades.map(g => ({
    label: g.nom,
    value: `${userId}||${g.nom}`,
    description: GRADES_LEGAL.includes(g) ? '⚖️ Légal' : '🔪 Illégal',
    emoji: g.emoji,
  }));

  const gradeSelect = new StringSelectMenuBuilder()
    .setCustomId('grade_select_grade')
    .setPlaceholder(`Grade actuel : ${rangActuel} — Choisir le nouveau...`)
    .addOptions(gradeOptions.slice(0, 25));

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle(`🎖️ Attribution de grade — ${nomMembre}`)
    .setDescription(`**Étape 2/2** — Sélectionnez le nouveau grade.\n\nGrade actuel : **${rangActuel}**`)
    .setFooter({ text: 'IWC • Panneau de gestion' });

  await interaction.update({
    embeds: [embed],
    components: [new ActionRowBuilder().addComponents(gradeSelect)],
  });
}

/**
 * Étape 3 : confirmation + application du grade
 */
async function handleGradeGradeSelect(interaction) {
  const [userId, nouveauGrade] = interaction.values[0].split('||');
  const db = loadDB();

  const membre = db.members[userId];
  const nomMembre = membre?.name || userId;
  const ancienGrade = membre?.rang || '—';
  const gradeInfo = [...GRADES_LEGAL, ...GRADES_ILLEGAL].find(g => g.nom === nouveauGrade);
  const isPromotion = GRADES_LEGAL.indexOf(GRADES_LEGAL.find(g => g.nom === nouveauGrade)) <
                      GRADES_LEGAL.indexOf(GRADES_LEGAL.find(g => g.nom === ancienGrade));

  // Mise à jour data.json
  if (db.members[userId]) {
    db.members[userId].rang = nouveauGrade;
    const isIlleg = GRADES_ILLEGAL.some(g => g.nom === nouveauGrade);
    db.members[userId].pole = isIlleg ? 'illegal' : 'legal';
    saveDB(db);
  }

  // Mise à jour rôle Discord
  try {
    const guildMember = await interaction.guild.members.fetch(userId).catch(() => null);
    if (guildMember && gradeInfo?.roleKey && ROLES[gradeInfo.roleKey]) {
      // Retirer tous les anciens rôles de grade
      const allGradeRoleIds = [...GRADES_LEGAL, ...GRADES_ILLEGAL]
        .map(g => ROLES[g.roleKey])
        .filter(Boolean);
      for (const roleId of allGradeRoleIds) {
        const role = interaction.guild.roles.cache.get(roleId);
        if (role && guildMember.roles.cache.has(roleId)) {
          await guildMember.roles.remove(role).catch(() => {});
        }
      }
      // Ajouter le nouveau rôle
      const newRole = interaction.guild.roles.cache.get(ROLES[gradeInfo.roleKey]);
      if (newRole) await guildMember.roles.add(newRole).catch(() => {});
    }

    // DM au membre
    if (guildMember) {
      const typeChangement = ancienGrade === '—' ? 'Attribution' :
        GRADES_LEGAL.findIndex(g => g.nom === nouveauGrade) < GRADES_LEGAL.findIndex(g => g.nom === ancienGrade) ||
        GRADES_ILLEGAL.findIndex(g => g.nom === nouveauGrade) < GRADES_ILLEGAL.findIndex(g => g.nom === ancienGrade)
        ? 'Promotion' : 'Rétrogradation';

      await guildMember.send({
        embeds: [new EmbedBuilder()
          .setColor(typeChangement === 'Promotion' ? 0x57F287 : typeChangement === 'Attribution' ? 0x5865F2 : 0xED4245)
          .setTitle(`${typeChangement === 'Promotion' ? '⬆️' : typeChangement === 'Attribution' ? '🎖️' : '⬇️'} ${typeChangement} — Iron Wolf Company`)
          .setDescription(`Ton grade a été mis à jour.\n\n*${ancienGrade !== '—' ? `**Ancien :** ${ancienGrade}\n` : ''}**Nouveau :** ${nouveauGrade}*\n\n— La Direction`)
          .setFooter({ text: 'IWC • Système automatique' })
        ]
      }).catch(() => {});
    }
  } catch (e) { console.log('❌ Grade Discord role error:', e.message); }

  // MàJ Notion fiche personnage
  await notionExtra.logPromotionNotion?.(interaction.guild, {
    userId,
    username: nomMembre,
    nomPerso: nomMembre,
    ancienRang: ancienGrade,
    nouveauRang: nouveauGrade,
    type: 'promotion',
    validePar: interaction.user.username,
  });

  // Journal IC
  let notionModules = {};
  try { notionModules = require('./notion-modules-v2'); } catch {}
  await notionModules.ajouterJournalIC?.(interaction.guild, {
    type: 'promotion', emoji: '🎖️',
    titre: `Grade attribué — ${nomMembre}`,
    description: `${ancienGrade} → **${nouveauGrade}** · Décidé par ${interaction.user.username}`,
    auteur: interaction.user.username,
  });

  // Log dans #logs
  const logsCh = getCh(interaction.guild, 'logs');
  if (logsCh) {
    await logsCh.send({
      embeds: [new EmbedBuilder()
        .setColor(gradeInfo?.couleur || 0x8B1A1A)
        .setTitle(`🎖️ Grade modifié — ${nomMembre}`)
        .addFields(
          { name: '👤 Membre',      value: `<@${userId}>`,             inline: true },
          { name: '📉 Ancien',      value: ancienGrade,                inline: true },
          { name: '📈 Nouveau',     value: nouveauGrade,               inline: true },
          { name: '✅ Décidé par',  value: interaction.user.username,  inline: true },
        )
        .setFooter({ text: `IWC • ${fmtShort(new Date())}` })
      ]
    }).catch(() => {});
  }

  const embed = new EmbedBuilder()
    .setColor(gradeInfo?.couleur || 0x57F287)
    .setTitle(`✅ Grade appliqué — ${nomMembre}`)
    .addFields(
      { name: '📉 Ancien grade', value: ancienGrade,  inline: true },
      { name: '📈 Nouveau grade', value: nouveauGrade, inline: true },
      { name: '✅ Appliqué par', value: interaction.user.username, inline: true },
    )
    .setDescription('Discord, Notion et le Journal IC ont été mis à jour.')
    .setFooter({ text: 'IWC • Panneau de gestion' });

  await interaction.update({
    embeds: [embed],
    components: [],
  });

  // Rafraîchir le tableau hiérarchique
  await updateHierarchieEmbed(interaction.guild);
}

// ═══════════════════════════════════════════════════════════════
// 4. AFFAIRES — Résumé hebdo + Système de propositions avec votes
// ═══════════════════════════════════════════════════════════════
//
// Slash commands :
//   { name: 'affaire', description: '📋 Soumettre une affaire à la Direction' }
//
// Bouton btn_affaire_nouvelle → ouvre le modal
// Appelé dans autoSetup :
//   await notionV3.setupAffairesPanel(guild);
//
// Cron hebdo :
//   await notionV3.postResumeAffaires(guild);

async function setupAffairesPanel(guild) {
  try {
    const db = loadDB();
    const affairesCh = getCh(guild, 'affaires');
    if (!affairesCh) return;

    if (db.affairesPanelMsgId) {
      try {
        await affairesCh.messages.fetch(db.affairesPanelMsgId);
        return; // existe déjà
      } catch {}
    }

    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('⚔️ AFFAIRES — Direction Iron Wolf Company')
      .setDescription([
        '*Ce salon est réservé aux décisions stratégiques de la Direction.*',
        '',
        '**Fonctionnement :**',
        '→ Soumettre une proposition via le bouton ci-dessous',
        '→ La Direction vote ✅ / ❌ sur chaque proposition',
        '→ Décision validée après **2 votes ✅** de membres Direction',
        '→ Résumé hebdomadaire automatique chaque lundi',
        '',
        '*Confidentialité absolue. Ce salon n\'existe pas.*',
      ].join('\n'))
      .setFooter({ text: 'IWC • Direction — Affaires internes' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('btn_affaire_nouvelle')
        .setLabel('📋 Nouvelle proposition')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId('btn_affaires_resume')
        .setLabel('📊 Résumé des décisions')
        .setStyle(ButtonStyle.Secondary),
    );

    const sent = await affairesCh.send({ embeds: [embed], components: [row] });
    db.affairesPanelMsgId = sent.id;
    saveDB(db);
    console.log('✅ Panel affaires configuré');
  } catch (e) { console.log('❌ setupAffairesPanel error:', e.message); }
}

/**
 * Bouton btn_affaire_nouvelle → modal de proposition
 */
async function handleAffaireNouvelleButton(interaction) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true });
  }

  const modal = new ModalBuilder()
    .setCustomId('modal_affaire')
    .setTitle('📋 Nouvelle Affaire — Direction');

  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('titre')
        .setLabel('Titre de la proposition')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Ex: Recrutement Officier Terrain')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('description')
        .setLabel('Description / Détails')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Contexte, enjeux, décision attendue...')
        .setRequired(true)
        .setMaxLength(1000)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('categorie')
        .setLabel('Catégorie')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('Recrutement / Opération / Finance / Alliance / Sanction')
        .setRequired(true)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('urgence')
        .setLabel('Urgence (normale / haute / critique)')
        .setStyle(TextInputStyle.Short)
        .setPlaceholder('normale')
        .setRequired(false)
    ),
  );

  await interaction.showModal(modal);
}

/**
 * Soumission du modal affaire
 */
async function handleAffaireModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const titre      = interaction.fields.getTextInputValue('titre');
  const description = interaction.fields.getTextInputValue('description');
  const categorie  = interaction.fields.getTextInputValue('categorie');
  const urgenceRaw = (interaction.fields.getTextInputValue('urgence') || 'normale').toLowerCase();

  const urgence = urgenceRaw.includes('crit') ? 'critique' : urgenceRaw.includes('haut') ? 'haute' : 'normale';
  const urgenceEmoji = urgence === 'critique' ? '🔴' : urgence === 'haute' ? '🟠' : '🟡';
  const urgenceCouleur = urgence === 'critique' ? 0xED4245 : urgence === 'haute' ? 0xFF6B35 : 0xFFA500;

  const db = loadDB();
  if (!db.affaires) db.affaires = [];

  const affaireId = `AFF-${Date.now().toString().slice(-5)}`;
  const affaire = {
    id: affaireId,
    titre,
    description,
    categorie,
    urgence,
    soumisePar: interaction.user.username,
    soumiseParId: interaction.user.id,
    status: 'en_vote',
    votesOui: [],
    votesNon: [],
    createdAt: new Date().toISOString(),
  };
  db.affaires.push(affaire);
  saveDB(db);

  const affairesCh = getCh(interaction.guild, 'affaires');
  if (affairesCh) {
    const embed = new EmbedBuilder()
      .setColor(urgenceCouleur)
      .setTitle(`${urgenceEmoji} AFFAIRE — ${titre}`)
      .setDescription(`> *${description}*`)
      .addFields(
        { name: '🆔 Référence',   value: `\`${affaireId}\``,          inline: true },
        { name: '📁 Catégorie',   value: categorie,                    inline: true },
        { name: '🚨 Urgence',     value: `${urgenceEmoji} ${urgence}`, inline: true },
        { name: '👤 Soumis par',  value: interaction.user.username,    inline: true },
        { name: '📅 Date',        value: fmtShort(new Date()),         inline: true },
        { name: '📊 Votes',       value: '✅ 0 / ❌ 0 — En attente de 2 votes ✅', inline: false },
      )
      .setFooter({ text: 'IWC • Affaires Direction — Confidentiel' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`affaire_oui_${affaireId}`)
        .setLabel('✅ Approuver')
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`affaire_non_${affaireId}`)
        .setLabel('❌ Rejeter')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId(`affaire_detail_${affaireId}`)
        .setLabel('📋 Détails')
        .setStyle(ButtonStyle.Secondary),
    );

    const msg = await affairesCh.send({ embeds: [embed], components: [row] });
    affaire.msgId = msg.id;
    saveDB(db);
  }

  await interaction.editReply({ content: `✅ Affaire **${affaireId}** soumise au vote de la Direction.` });
}

/**
 * Vote sur une affaire
 */
async function handleAffaireVote(interaction, vote) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true });
  }

  const affaireId = interaction.customId.replace(vote === 'oui' ? 'affaire_oui_' : 'affaire_non_', '');
  const db = loadDB();
  const affaire = (db.affaires || []).find(a => a.id === affaireId);

  if (!affaire) return interaction.reply({ content: '❌ Affaire introuvable.', ephemeral: true });
  if (affaire.status !== 'en_vote') return interaction.reply({ content: '❌ Cette affaire est déjà clôturée.', ephemeral: true });

  // Retirer vote précédent
  affaire.votesOui = (affaire.votesOui || []).filter(id => id !== interaction.user.id);
  affaire.votesNon = (affaire.votesNon || []).filter(id => id !== interaction.user.id);

  // Ajouter nouveau vote
  if (vote === 'oui') affaire.votesOui.push(interaction.user.id);
  else                affaire.votesNon.push(interaction.user.id);

  const oui = affaire.votesOui.length;
  const non = affaire.votesNon.length;
  const VOTES_REQUIS = 2;

  let statusText = `✅ ${oui} / ❌ ${non} — Il faut **${VOTES_REQUIS} ✅** pour valider`;
  let decisionPrise = false;
  let couleur = 0xFFA500;

  if (oui >= VOTES_REQUIS) {
    affaire.status = 'approuvee';
    affaire.decideeAt = new Date().toISOString();
    statusText = `✅ **APPROUVÉE** — ${oui} votes pour`;
    couleur = 0x57F287;
    decisionPrise = true;
  } else if (non >= VOTES_REQUIS) {
    affaire.status = 'rejetee';
    affaire.decideeAt = new Date().toISOString();
    statusText = `❌ **REJETÉE** — ${non} votes contre`;
    couleur = 0xED4245;
    decisionPrise = true;
  }

  saveDB(db);

  // MàJ l'embed
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(couleur)
    .spliceFields(5, 1, { name: '📊 Votes', value: statusText, inline: false });

  const components = decisionPrise ? [] : interaction.message.components;
  await interaction.update({ embeds: [embed], components });

  if (decisionPrise) {
    await interaction.followUp({
      content: `${affaire.status === 'approuvee' ? '✅' : '❌'} L'affaire **${affaireId}** a été **${affaire.status === 'approuvee' ? 'APPROUVÉE' : 'REJETÉE'}**.`,
      ephemeral: false,
    });

    // Log dans #logs
    const logsCh = getCh(interaction.guild, 'logs');
    if (logsCh) {
      await logsCh.send({
        embeds: [new EmbedBuilder()
          .setColor(couleur)
          .setTitle(`${affaire.status === 'approuvee' ? '✅' : '❌'} Affaire ${affaire.status === 'approuvee' ? 'approuvée' : 'rejetée'} — ${affaire.titre}`)
          .addFields(
            { name: '🆔 Référence', value: `\`${affaireId}\``,    inline: true },
            { name: '📁 Catégorie', value: affaire.categorie,     inline: true },
            { name: '📊 Score',     value: `✅ ${oui} / ❌ ${non}`, inline: true },
          )
          .setFooter({ text: `IWC • Affaires Direction • ${fmtShort(new Date())}` })
        ]
      }).catch(() => {});
    }
  }
}

/**
 * Résumé hebdomadaire des affaires — posté automatiquement le lundi
 */
async function postResumeAffaires(guild) {
  try {
    const db = loadDB();
    const affairesCh = getCh(guild, 'affaires');
    if (!affairesCh) return;

    const semaineDerniere = Date.now() - 7 * 86400000;
    const affaires = (db.affaires || []).filter(a => new Date(a.createdAt).getTime() >= semaineDerniere);

    const approuvees = affaires.filter(a => a.status === 'approuvee');
    const rejetees   = affaires.filter(a => a.status === 'rejetee');
    const enVote     = affaires.filter(a => a.status === 'en_vote');

    if (!affaires.length) return;

    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('📊 Résumé hebdomadaire — Affaires Direction')
      .setDescription(`*Semaine du ${fmtShort(new Date(semaineDerniere))} au ${fmtShort(new Date())}*`)
      .addFields(
        {
          name: `✅ APPROUVÉES (${approuvees.length})`,
          value: approuvees.length > 0
            ? approuvees.map(a => `→ \`${a.id}\` **${a.titre}** — ${a.categorie}`).join('\n')
            : '*Aucune*',
          inline: false,
        },
        {
          name: `❌ REJETÉES (${rejetees.length})`,
          value: rejetees.length > 0
            ? rejetees.map(a => `→ \`${a.id}\` **${a.titre}**`).join('\n')
            : '*Aucune*',
          inline: false,
        },
        {
          name: `⏳ EN ATTENTE DE VOTE (${enVote.length})`,
          value: enVote.length > 0
            ? enVote.map(a => `→ \`${a.id}\` **${a.titre}** — ✅ ${(a.votesOui||[]).length} / ❌ ${(a.votesNon||[]).length}`).join('\n')
            : '*Aucune*',
          inline: false,
        },
      )
      .setFooter({ text: 'IWC • Résumé automatique hebdomadaire' })
      .setTimestamp();

    await affairesCh.send({ embeds: [embed] });
    console.log('✅ Résumé affaires hebdo posté');
  } catch (e) { console.log('❌ postResumeAffaires error:', e.message); }
}

/**
 * Bouton btn_affaires_resume → résumé à la demande
 */
async function handleAffairesResumeButton(interaction) {
  if (!isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', ephemeral: true });
  }
  await interaction.deferReply({ ephemeral: true });
  const db = loadDB();
  const affaires = db.affaires || [];

  const approuvees = affaires.filter(a => a.status === 'approuvee').slice(-10);
  const rejetees   = affaires.filter(a => a.status === 'rejetee').slice(-5);
  const enVote     = affaires.filter(a => a.status === 'en_vote');

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('📊 Décisions de la Direction — IWC')
    .addFields(
      { name: `✅ Dernières approuvées (${approuvees.length})`, value: approuvees.length > 0 ? approuvees.map(a => `→ \`${a.id}\` **${a.titre}**`).join('\n') : '*Aucune*', inline: false },
      { name: `❌ Dernières rejetées (${rejetees.length})`,    value: rejetees.length > 0   ? rejetees.map(a => `→ \`${a.id}\` **${a.titre}**`).join('\n')   : '*Aucune*', inline: false },
      { name: `⏳ En attente (${enVote.length})`,              value: enVote.length > 0      ? enVote.map(a => `→ \`${a.id}\` **${a.titre}** — ✅ ${(a.votesOui||[]).length} vote(s)`).join('\n') : '*Aucune*', inline: false },
    )
    .setFooter({ text: `IWC • ${new Date().toLocaleString('fr-FR')}` });

  await interaction.editReply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// 5. INFORMATEURS — Archivage auto + alerte Direction
// ═══════════════════════════════════════════════════════════════
//
// Quand un message est posté dans #informateurs :
//   await notionV3.handleInformateurMessage(message);
//
// Le bot parse automatiquement le format SOURCE/CIBLE/INFORMATION/FIABILITE/DATE
// Archive dans Notion + alerte la Direction si fiabilité = Confirmée

const NOTION_INFOS_DB = process.env.NOTION_INFOS_DB || null;

async function handleInformateurMessage(message) {
  if (message.author.bot || !message.guild) return;

  const content = message.content;
  const lines = content.split('\n');
  const get = k => {
    const l = lines.find(l => l.toUpperCase().startsWith(k.toUpperCase()));
    return l ? l.split(':').slice(1).join(':').trim() : null;
  };

  const source     = get('SOURCE');
  const cible      = get('CIBLE') || get('CIBLE / LIEU') || get('CIBLE/LIEU');
  const info       = get('INFORMATION') || get('INFO');
  const fiabilite  = get('FIABILITÉ') || get('FIABILITE');
  const date       = get('DATE') || fmtShort(new Date());

  // Si le message n'a pas le format attendu, on réagit juste
  if (!source && !info) {
    await message.react('👁️').catch(() => {});
    return;
  }

  // Réaction de confirmation
  await message.react('✅').catch(() => {});

  const estConfirmee = fiabilite?.toLowerCase().includes('confirm');
  const db = loadDB();
  if (!db.informateurs) db.informateurs = [];

  const rapport = {
    id: Date.now().toString(),
    source:    source    || '—',
    cible:     cible     || '—',
    info:      info      || content.slice(0, 500),
    fiabilite: fiabilite || '—',
    date:      date,
    rapporteurId:  message.author.id,
    rapporteur:    message.author.username,
    createdAt: new Date().toISOString(),
  };
  db.informateurs.push(rapport);
  saveDB(db);

  // Archivage Notion si DB configurée
  if (process.env.NOTION_TOKEN && NOTION_INFOS_DB) {
    try {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
          'Notion-Version': '2022-06-28',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          parent: { database_id: NOTION_INFOS_DB },
          properties: {
            'Source':     { title: [{ text: { content: rapport.source } }] },
            'Cible':      { rich_text: [{ text: { content: rapport.cible } }] },
            'Information':{ rich_text: [{ text: { content: rapport.info.slice(0, 2000) } }] },
            'Fiabilité':  { select: { name: estConfirmee ? '✅ Confirmée' : '⚠️ Non confirmée' } },
            'Date':       { date: { start: new Date().toISOString().split('T')[0] } },
            'Rapporteur': { rich_text: [{ text: { content: rapport.rapporteur } }] },
          }
        })
      });
      console.log(`✅ Rapport informateur archivé dans Notion`);
    } catch (e) { console.log('❌ Informateur Notion error:', e.message); }
  }

  // Alerte Direction si info confirmée
  if (estConfirmee) {
    const logsCh = getCh(message.guild, 'logs');
    if (logsCh) {
      const mention = message.guild.roles.cache
        .filter(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur'].some(n => r.name.includes(n)))
        .map(r => `<@&${r.id}>`).join(' ');

      await logsCh.send({
        content: `${mention} — 🚨 **Information confirmée reçue**`,
        embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🔴 ALERTE — Information Confirmée')
          .addFields(
            { name: '🕵️ Source',      value: rapport.source,   inline: true },
            { name: '🎯 Cible / Lieu', value: rapport.cible,    inline: true },
            { name: '📋 Fiabilité',    value: `✅ ${fiabilite}`, inline: true },
            { name: '📝 Information',  value: rapport.info.slice(0, 500) },
            { name: '👤 Rapporteur',   value: `<@${message.author.id}>`, inline: true },
          )
          .setFooter({ text: 'IWC • Réseau d\'informateurs — Confidentiel' })
          .setTimestamp()
        ]
      }).catch(() => {});
    }
  }

  // Embed de confirmation discret dans #informateurs
  await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(estConfirmee ? 0xED4245 : 0xFFA500)
      .setTitle(`${estConfirmee ? '🔴 Info Confirmée' : '🟡 Info Reçue'} — Archivée`)
      .setDescription(`Rapport \`${rapport.id}\` enregistré.${estConfirmee ? '\n⚠️ **La Direction a été alertée.**' : ''}`)
      .setFooter({ text: 'IWC • Informateurs — Confidentiel' })
    ],
    allowedMentions: { repliedUser: false },
  }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// 6. PING NOTION/DISCORD — La Confrérie & Iron Wolf Company
// ═══════════════════════════════════════════════════════════════
// Utilisé dans checkAgenda, postStatsHebdo, etc.
// getMentionPole(guild, 'legal')   → mentionne les rôles Légal
// getMentionPole(guild, 'illegal') → mentionne les rôles Illégal
// getMentionPole(guild, 'all')     → mentionne tous les membres actifs

function getMentionPole(guild, pole = 'all') {
  const legalRoleNames   = ['Conseil', 'Officier', 'Agent', 'Opérateur', 'Recrue', 'Iron Wolf'];
  const illegalRoleNames = ['Concepteur', 'Fléau', 'Exécuteur', 'Condamné', 'Maudit', 'Confrérie'];

  let roleNames;
  if (pole === 'legal')   roleNames = legalRoleNames;
  else if (pole === 'illegal') roleNames = illegalRoleNames;
  else roleNames = [...legalRoleNames, ...illegalRoleNames, 'Fondateur', 'Directeur'];

  return guild.roles.cache
    .filter(r => roleNames.some(n => r.name.includes(n)))
    .map(r => `<@&${r.id}>`)
    .join(' ') || '';
}

// ─── Notification Notion : mise à jour statut fiche selon pole ───
async function updateNotionStatutPole(userId, pole) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_FICHES_DB) return;
  try {
    const pageId = await notionExtra.getFicheId?.(userId);
    if (!pageId) return;
    await notionExtra.notionPatch?.(pageId, {
      'Pôle': { select: { name: pole === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } },
    });
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  // Absences
  handleAbsenceDetection,
  ABSENCE_KEYWORDS,
  // Inactivité
  checkInactivite,
  JOURS_INACTIF,
  // Grades
  updateHierarchieEmbed,
  handleHierarchieCommand,
  handleGradeSetCommand,
  handleGradePanelButton,
  handleGradeMembreSelect,
  handleGradeGradeSelect,
  GRADES_LEGAL,
  GRADES_ILLEGAL,
  // Affaires
  setupAffairesPanel,
  handleAffaireNouvelleButton,
  handleAffaireModal,
  handleAffaireVote,
  postResumeAffaires,
  handleAffairesResumeButton,
  // Informateurs
  handleInformateurMessage,
  // Pings
  getMentionPole,
  updateNotionStatutPole,
};

