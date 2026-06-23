// ═══════════════════════════════════════════════════════════════
// notion-modules-v3.js — Grades · Inactivité · Affaires · Absences · Informateurs · Planning
// IWC Bot v3.4
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');
let notionExtra = {};
try { notionExtra = require('./notion-extra'); } catch {}
const JOURS_INACTIF = 5;
const ROLES = {
  LE_CONSEIL:    '1508289999035039875',
  OFFICIER:      '1508290255055229019',
  AGENT_CONFIRME:'1508292278953836655',
  OPERATEUR:     '1508290320763195482',
  RECRUE:        '1508290359917154460',
  IRON_WOLF:     '1508756436082102303',
  LE_CONCEPTEUR: '1508461993311338627',
  LE_FLEAU:      '1508480137555869936',
  EXECUTEUR:     '1508480140915507270',
  CONDAMNE:      '1508480142844891276',
  MAUDIT:        '1508480144782917693',
  CONFRATERIE:   '1508898841993281658',
};
const GRADES_LEGAL = [
  { nom: 'Le Conseil — Directeur', emoji: '👑', roleKey: 'LE_CONSEIL',    couleur: 0xFFD700 },
  { nom: 'Officier de Terrain',    emoji: '🎖️', roleKey: 'OFFICIER',      couleur: 0xC0C0C0 },
  { nom: 'Agent Confirmé',         emoji: '🔵', roleKey: 'AGENT_CONFIRME', couleur: 0x3B82F6 },
  { nom: 'Opérateur',              emoji: '🟢', roleKey: 'OPERATEUR',      couleur: 0x57F287 },
  { nom: 'Recrue — Probatoire',    emoji: '⚪', roleKey: 'RECRUE',         couleur: 0xAAAAAA },
];
const GRADES_ILLEGAL = [
  { nom: 'Le Concepteur',  emoji: '💀', roleKey: 'LE_CONCEPTEUR', couleur: 0x8B1A1A },
  { nom: 'Le Fléau',       emoji: '⚔️', roleKey: 'LE_FLEAU',      couleur: 0xED4245 },
  { nom: "L'Exécuteur",    emoji: '🗡️', roleKey: 'EXECUTEUR',     couleur: 0xFF6B35 },
  { nom: 'Le Condamné',    emoji: '🔴', roleKey: 'CONDAMNE',      couleur: 0xFFA500 },
  { nom: 'Le Maudit',      emoji: '🟤', roleKey: 'MAUDIT',        couleur: 0x8B5A2A },
];
const { MEMBRES_DISCORD_MAP, NOTION_VERSION: NOTION_VERSION_V3, _getPole } = require('./config');
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
function getChById(guild, salonKey, ...fallbackNames) {
  try {
    const { SALON_IDS } = require('./config');
    const id = SALON_IDS?.[salonKey];
    if (id) { const ch = guild.channels.cache.get(id); if (ch) return ch; }
  } catch {}
  for (const name of fallbackNames) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}
// Journal de bord = destination de TOUTES les alertes/logs du module
// (inactivité, grades, affaires, informateurs). N'utilise JAMAIS patch-note.
function _journalCh(guild) {
  try {
    if (typeof global.getInactiviteCh === 'function') { const c = global.getInactiviteCh(guild); if (c) return c; }
    if (typeof global.getJournalCh === 'function')    { const c = global.getJournalCh(guild);    if (c) return c; }
  } catch {}
  return guild.channels.cache.get('1508756535407542372')
      || getChById(guild, 'JOURNAL_DE_BORD', 'journal-de-bord', 'journal')
      || getChById(guild, 'LOGS', 'logs');
}
function isDirection(member) {
  return member?.roles?.cache?.some(r =>
    ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire', 'Conseil'].some(n => r.name.includes(n))
  );
}
function canManageGrades(member) {
  return member?.roles?.cache?.some(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)));
}
// ═══════════════════════════════════════════════════════════════
// HELPER — Upsert message bot sans doublon, sans pin
// ═══════════════════════════════════════════════════════════════
async function _upsertBotMessage(guild, ch, dbKey, payload) {
  const db = loadDB();
  if (db[dbKey]) {
    try {
      const msg = await ch.messages.fetch(db[dbKey]);
      if (msg) { await msg.edit(payload); return db[dbKey]; }
    } catch {}
  }
  try {
    const msgs   = await ch.messages.fetch({ limit: 30 });
    const botMsg = [...msgs.values()]
      .filter(m => m.author.id === guild.members.me?.id && m.embeds?.length > 0)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
    // Supprimer les doublons (garder le plus récent)
    for (let i = 1; i < botMsg.length; i++) await botMsg[i].delete().catch(() => {});
    if (botMsg.length > 0) {
      await botMsg[0].edit(payload);
      db[dbKey] = botMsg[0].id;
      saveDB(db);
      return botMsg[0].id;
    }
  } catch {}
  const sent = await ch.send(payload);
  // PAS de pin
  db[dbKey] = sent.id;
  saveDB(db);
  return sent.id;
}
// ═══════════════════════════════════════════════════════════════
// 1. ABSENCES
// ═══════════════════════════════════════════════════════════════
const ABSENCE_KEYWORDS = ['absent', 'absence', 'absente', 'serai pas là', 'serai pas dispo', 'pas disponible', 'pas là', 'dispo pas', 'en pause', 'pause de', 'reviens dans', 'retour dans', 'indisponible'];
async function handleAbsenceDetection(message) {
  // ⛔ DÉSACTIVÉ : la détection automatique par mot-clé mettait en absence dès qu'on
  // écrivait « absence », « pas là », « en pause »… (beaucoup trop de faux positifs).
  // L'absence se déclare désormais UNIQUEMENT avec /absent, ou en postant dans #absences.
  return false;
  // eslint-disable-next-line no-unreachable
  if (message.author.bot || !message.guild) return false;
  const absCh = getCh(message.guild, 'absences');
  if (!absCh || message.channel.id === absCh.id) return false;
  if (!ABSENCE_KEYWORDS.some(kw => message.content.toLowerCase().includes(kw))) return false;
  await message.delete().catch(() => {});
  await message.author.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📋 Absence détectée — IWC').setDescription(`Ton message a été déplacé dans **#absences** automatiquement.\n\n> *${message.content.slice(0, 300)}*`).setFooter({ text: 'IWC • Système automatique' })] }).catch(() => {});
  const db = loadDB();
  if (db.members[message.author.id]) { db.members[message.author.id].status = 'absent'; db.members[message.author.id].lastActivity = new Date().toISOString(); saveDB(db); }
  await notionExtra.majStatutActiviteNotion?.(message.author.id, 'absent');
  await absCh.send({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`🟡 Absence — ${message.author.username}`).setDescription(`> *${message.content.slice(0, 500)}*`).addFields({ name: '👤 Membre', value: `<@${message.author.id}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '📍 Origine', value: `#${message.channel.name}`, inline: true }).setFooter({ text: 'IWC • Absence automatique' }).setTimestamp()] });
  return true;
}
// ═══════════════════════════════════════════════════════════════
// 2. INACTIVITÉ
// ═══════════════════════════════════════════════════════════════
async function checkInactivite(guild) {
  try {
    const db = loadDB(); const logsCh = _journalCh(guild); let changed = false;
    for (const [userId, membre] of Object.entries(db.members || {})) {
      if (membre.status === 'parti' || membre.status === 'visiteur') continue;
      if (daysSince(membre.lastActivity) >= JOURS_INACTIF && membre.status !== 'inactif') {
        const ancienStatut = membre.status; db.members[userId].status = 'inactif'; changed = true;
        await notionExtra.majStatutActiviteNotion?.(userId, 'inactif');
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0x555555).setTitle(`💤 Inactivité automatique — ${membre.name}`).setDescription(`**${membre.name}** est passé **inactif** après **${daysSince(membre.lastActivity)} jours** sans message.`).addFields({ name: '👤 Membre', value: `<@${userId}>`, inline: true }, { name: '📅 Dernière activité', value: fmtShort(membre.lastActivity), inline: true }, { name: '📋 Ancien statut', value: ancienStatut, inline: true }).setFooter({ text: `IWC • Inactivité auto • ${JOURS_INACTIF}j` })] }).catch(() => {});
        try { const m = await guild.members.fetch(userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x555555).setTitle('💤 Statut — Iron Wolf Company').setDescription(`Tu as été marqué **inactif** suite à **${daysSince(membre.lastActivity)} jours** sans activité.\n\nReviens poster un message pour retrouver ton statut actif.\n\n*La Compagnie n'oublie pas ses membres — mais elle a besoin de les voir.*\n— La Direction`).setFooter({ text: 'IWC • Système automatique' })] }).catch(() => {}); } catch {}
      }
    }
    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkInactivite error:', e.message); }
}
// ═══════════════════════════════════════════════════════════════
// 3. GRADES — Tableau hiérarchique (sans doublon, sans pin)
// ═══════════════════════════════════════════════════════════════
async function updateHierarchieEmbed(guild) {
  try {
    const gradeCh = getChById(guild, 'GRADE', 'grade', 'hierarchie-iron-wolf', 'hierarchie-ombre');
    if (!gradeCh) return;
    const db = loadDB();
    // ── Source de vérité = les vrais rôles Discord des membres ──
    const allMembers = await guild.members.fetch().catch(() => null);
    if (!allMembers) return;
    // Construire une map roleId → liste de membres Discord
    const roleMembers = {};
    const allGrades   = [...GRADES_LEGAL, ...GRADES_ILLEGAL];
    for (const g of allGrades) {
      const roleId = ROLES[g.roleKey];
      if (!roleId) continue;
      roleMembers[roleId] = [...allMembers.values()].filter(m =>
        !m.user.bot && m.roles.cache.has(roleId)
      );
    }
    // Construire une section — chaque membre n'apparaît qu'une seule fois
    // dans son grade le plus élevé (premier grade dans la liste)
    const buildSection = (grades) => {
      const dejaVus = new Set(); // éviter les doublons
      const lignes = [];
      for (const g of grades) {
        const roleId  = ROLES[g.roleKey];
        const members = (roleMembers[roleId] || []).filter(m => !dejaVus.has(m.id));
        if (!members.length) continue;
        members.forEach(m => dejaVus.add(m.id));
        const lines = members.map(m => {
          const dbData = db.members[m.id];
          const statut = dbData?.status;
          const suffix = statut === 'absent' ? ' *(absent)*' : statut === 'inactif' ? ' *(inactif)*' : '';
          return `┗ ${m.displayName}${suffix}`;
        }).join('\n');
        lignes.push(`${g.emoji} **${g.nom}**\n${lines}`);
      }
      return lignes.join('\n\n') || '*Aucun membre*';
    };
    // Compter les membres actifs depuis les rôles Discord
    const allRoleIds  = allGrades.map(g => ROLES[g.roleKey]).filter(Boolean);
    const membresRole = [...allMembers.values()].filter(m =>
      !m.user.bot && m.roles.cache.some(r => allRoleIds.includes(r.id))
    );
    const actifs  = membresRole.filter(m => db.members[m.id]?.status !== 'absent' && db.members[m.id]?.status !== 'inactif').length;
    const absents = membresRole.filter(m => db.members[m.id]?.status === 'absent').length;
    const inactifs= membresRole.filter(m => db.members[m.id]?.status === 'inactif').length;
    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('⚔️ IRON WOLF COMPANY — Tableau Hiérarchique')
      .setDescription('*Structure interne de la Compagnie. Basée sur les vrais rôles Discord.*')
      .addFields(
        { name: '⚖️ ═══ PÔLE LÉGAL ═══',  value: buildSection(GRADES_LEGAL),   inline: false },
        { name: '🔪 ═══ LA CONFRÉRIE ═══', value: buildSection(GRADES_ILLEGAL), inline: false },
        { name: '📊 Effectifs', value: [`✅ Actifs : **${actifs}**`, `⚠️ Absents : **${absents}**`, `💤 Inactifs : **${inactifs}**`].join(' · '), inline: false },
      )
      .setFooter({ text: `IWC • Hiérarchie • MàJ ${new Date().toLocaleString('fr-FR')}` });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('btn_grade_panel').setLabel('🎖️ Gérer les grades').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('btn_hierarchie_refresh').setLabel('🔄 Actualiser').setStyle(ButtonStyle.Secondary),
    );
    await _upsertBotMessage(guild, gradeCh, 'hierarchieMsgId', { embeds: [embed], components: [row] });
  } catch (e) { console.log('❌ updateHierarchieEmbed error:', e.message); }
}
async function handleHierarchieCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const db = loadDB(); const membres = Object.values(db.members || {}).filter(m => m.status !== 'parti' && m.status !== 'visiteur');
  const buildSection = (grades) => grades.map(g => { const liste = membres.filter(m => m.rang === g.nom || m.rang?.toLowerCase().includes(g.nom.toLowerCase().split(' ')[0])); if (!liste.length) return null; return `${g.emoji} **${g.nom}**\n${liste.map(m => { const id = Object.entries(MEMBRES_DISCORD_MAP).find(([n]) => n === m.name)?.[1] || m.id; return `┗ <@${id}>${m.status !== 'actif' ? ` *(${m.status})*` : ''}`; }).join('\n')}`; }).filter(Boolean).join('\n\n') || '*Aucun membre*';
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('⚔️ Hiérarchie — Iron Wolf Company').addFields({ name: '⚖️ PÔLE LÉGAL', value: buildSection(GRADES_LEGAL), inline: false }, { name: '🔪 LA CONFRÉRIE', value: buildSection(GRADES_ILLEGAL), inline: false }).setFooter({ text: `IWC • ${new Date().toLocaleString('fr-FR')}` })] });
}
async function handleGradeSetCommand(interaction) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  await _showGradePanel(interaction);
}
async function handleGradePanelButton(interaction) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  await _showGradePanel(interaction);
}
async function _showGradePanel(interaction) {
  const db = loadDB(); const membres = Object.values(db.members || {}).filter(m => m.status !== 'parti' && m.status !== 'visiteur');
  if (!membres.length) return interaction.reply({ content: '❌ Aucun membre dans la base.', flags: MessageFlags.Ephemeral });
  const options = membres.slice(0, 25).map(m => ({ label: m.name, value: m.id || Object.entries(MEMBRES_DISCORD_MAP).find(([n]) => n === m.name)?.[1] || m.name, description: `Rang : ${m.rang || '—'} · Statut : ${m.status}`, emoji: m.status === 'actif' ? '✅' : m.status === 'absent' ? '⚠️' : '💤' }));
  await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🎖️ Gestion des Grades — IWC').setDescription('**Étape 1/2** — Sélectionnez le membre.').addFields({ name: '⚖️ Grades Légal', value: GRADES_LEGAL.map(g => `${g.emoji} ${g.nom}`).join('\n'), inline: true }, { name: '🔪 Grades Illégal', value: GRADES_ILLEGAL.map(g => `${g.emoji} ${g.nom}`).join('\n'), inline: true }).setFooter({ text: 'IWC • Panneau de gestion' })], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('grade_select_membre').setPlaceholder('Sélectionner un membre...').addOptions(options)), new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('grade_eligibles').setLabel('Éligibles à une promotion').setEmoji('📈').setStyle(ButtonStyle.Success))], flags: MessageFlags.Ephemeral });
}
function _membreFromId(db, userId) {
  return db.members[userId] || Object.values(db.members || {}).find(m => Object.entries(MEMBRES_DISCORD_MAP).find(([n, id]) => id === userId && n === m.name)) || null;
}
function _vueEtape2Payload(userId, membre) {
  const rangActuel = membre?.rang || '—';
  const allGrades = [...GRADES_LEGAL, ...GRADES_ILLEGAL];
  const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle(`🎖️ Gestion du grade — ${membre?.name || userId}`).setDescription(`Grade actuel : **${rangActuel}**\n\nChoisis un nouveau grade ci-dessous, ou monte / descends d'un cran.`).setFooter({ text: 'IWC • Panneau de gestion' });
  const selectRow = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('grade_select_grade').setPlaceholder(`Actuel : ${rangActuel} — Choisir le nouveau...`).addOptions(allGrades.map(g => ({ label: g.nom, value: `${userId}||${g.nom}`, description: GRADES_LEGAL.includes(g) ? '⚖️ Légal' : '🔪 Illégal', emoji: g.emoji })).slice(0, 25)));
  const btnRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`grade_up_${userId}`).setLabel("Monter d'un cran").setEmoji('⬆️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`grade_down_${userId}`).setLabel("Descendre d'un cran").setEmoji('⬇️').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`grade_fiche_${userId}`).setLabel('Fiche').setEmoji('📋').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [selectRow, btnRow] };
}
async function handleGradeMembreSelect(interaction) {
  const userId = interaction.values[0]; const db = loadDB();
  const membre = _membreFromId(db, userId);
  await interaction.update(_vueEtape2Payload(userId, membre));
}
async function showGradeMembre(interaction, userId) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  const db = loadDB(); const membre = _membreFromId(db, userId);
  const payload = _vueEtape2Payload(userId, membre);
  return interaction.reply({ embeds: payload.embeds, components: payload.components, flags: MessageFlags.Ephemeral });
}
async function handleGradeGradeSelect(interaction) {
  const [userId, nouveauGrade] = interaction.values[0].split('||');
  return _appliquerGrade(interaction, userId, nouveauGrade);
}
async function _appliquerGrade(interaction, userId, nouveauGrade) {
  const db = loadDB(); const membre = db.members[userId]; const nomMembre = membre?.name || userId; const ancienGrade = membre?.rang || '—';
  const gradeInfo = [...GRADES_LEGAL, ...GRADES_ILLEGAL].find(g => g.nom === nouveauGrade);
  if (db.members[userId]) { const m = db.members[userId]; if (!Array.isArray(m.historiqueGrades)) m.historiqueGrades = []; if ((m.rang || '—') !== nouveauGrade) m.historiqueGrades.push({ de: m.rang || '—', vers: nouveauGrade, par: interaction.user?.username || '—', at: new Date().toISOString() }); m.rang = nouveauGrade; m.pole = GRADES_ILLEGAL.some(g => g.nom === nouveauGrade) ? 'illegal' : 'legal'; m.gradeDepuis = new Date().toISOString(); saveDB(db); }
  try { if (global._syncMembreNotion) global._syncMembreNotion(userId, { rang: nouveauGrade, lastActivity: new Date().toISOString() }).catch(() => {}); } catch {}
  try {
    const guildMember = await interaction.guild.members.fetch(userId).catch(() => null);
    if (guildMember && gradeInfo?.roleKey && ROLES[gradeInfo.roleKey]) {
      const allGradeRoleIds = [...GRADES_LEGAL, ...GRADES_ILLEGAL].map(g => ROLES[g.roleKey]).filter(Boolean);
      for (const roleId of allGradeRoleIds) { const role = interaction.guild.roles.cache.get(roleId); if (role && guildMember.roles.cache.has(roleId)) await guildMember.roles.remove(role).catch(() => {}); }
      const newRole = interaction.guild.roles.cache.get(ROLES[gradeInfo.roleKey]);
      if (newRole) await guildMember.roles.add(newRole).catch(() => {});
    }
    if (guildMember) {
      const isIlleg  = GRADES_ILLEGAL.some(g => g.nom === nouveauGrade);
      const typeC    = ancienGrade === '—' ? 'Attribution'
        : (GRADES_LEGAL.findIndex(g => g.nom === nouveauGrade) < GRADES_LEGAL.findIndex(g => g.nom === ancienGrade) ||
           GRADES_ILLEGAL.findIndex(g => g.nom === nouveauGrade) < GRADES_ILLEGAL.findIndex(g => g.nom === ancienGrade))
        ? 'Promotion' : 'Rétrogradation';
      const orgNom    = isIlleg ? 'La Confrérie'              : 'Iron Wolf Company';
      const orgFooter = isIlleg ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal';
      const typeEmoji = typeC === 'Promotion' ? '⬆️' : typeC === 'Attribution' ? '🎖️' : '⬇️';
      const typeColor = typeC === 'Promotion' ? 0x57F287 : typeC === 'Attribution' ? 0x5865F2 : 0xED4245;
      const sousTitre = typeC === 'Rétrogradation'
        ? '*La Direction a pris cette décision.*'
        : typeC === 'Promotion'
        ? (isIlleg ? '*Tu as prouvé ta valeur dans l\'ombre.*' : '*La Compagnie reconnaît ta valeur.*')
        : (isIlleg ? '*Tu entres dans les rangs de la Confrérie.*' : '*La Direction t\'a attribué ce grade.*');
      const desc = [
        `Ton grade au sein de **${orgNom}** a été mis à jour.`,
        '',
        ancienGrade !== '—' ? `**Ancien rang :** ${ancienGrade}` : null,
        `**Nouveau rang :** ${nouveauGrade}`,
        '',
        sousTitre,
        '— La Direction',
      ].filter(l => l !== null).join('\n');
      await guildMember.send({ embeds: [new EmbedBuilder()
        .setColor(typeColor)
        .setTitle(`${typeEmoji} ${typeC} — ${orgNom}`)
        .setDescription(desc)
        .setFooter({ text: orgFooter })
      ] }).catch(() => {});
    }
  } catch (e) { console.log('❌ Grade Discord role error:', e.message); }
  await notionExtra.logPromotionNotion?.(interaction.guild, { userId, username: nomMembre, nomPerso: nomMembre, ancienRang: ancienGrade, nouveauRang: nouveauGrade, type: 'promotion', validePar: interaction.user.username });
  let notionModules = {}; try { notionModules = require('./notion-modules-v2'); } catch {}
  try { if (global.ajouterJournalIC) await global.ajouterJournalIC(interaction.guild, { type: 'promotion', titre: `Grade — ${nomMembre}`, description: `${ancienGrade} → **${nouveauGrade}** · par ${interaction.user?.username || '—'}`, auteur: interaction.user?.username || '—' }); } catch {}
  const logsCh = _journalCh(interaction.guild);
  if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(gradeInfo?.couleur || 0x8B1A1A).setTitle(`🎖️ Grade modifié — ${nomMembre}`).addFields({ name: '👤 Membre', value: `<@${userId}>`, inline: true }, { name: '📉 Ancien', value: ancienGrade, inline: true }, { name: '📈 Nouveau', value: nouveauGrade, inline: true }, { name: '✅ Décidé par', value: interaction.user.username, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] }).catch(() => {});
  await interaction.update({ embeds: [new EmbedBuilder().setColor(gradeInfo?.couleur || 0x57F287).setTitle(`✅ Grade appliqué — ${nomMembre}`).addFields({ name: '📉 Ancien grade', value: ancienGrade, inline: true }, { name: '📈 Nouveau grade', value: nouveauGrade, inline: true }, { name: '✅ Appliqué par', value: interaction.user.username, inline: true }).setDescription('Discord, Notion et le Journal IC ont été mis à jour.').setFooter({ text: 'IWC • Panneau de gestion' })], components: [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`btn_grade_maj_${userId}`).setLabel('🔄 Modifier à nouveau').setStyle(ButtonStyle.Secondary),
    )
  ] });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 10000);
  await updateHierarchieEmbed(interaction.guild);
}
// ── Bouton "Modifier à nouveau" — relance directement le menu de grade pour ce membre ──
async function handleGradeMajButton(interaction) {
  const userId = interaction.customId.replace('btn_grade_maj_', '');
  const db = loadDB(); const membre = _membreFromId(db, userId);
  if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral });
  await interaction.update(_vueEtape2Payload(userId, membre));
}
// ── 1-clic : monter / descendre d'un cran, fiche, éligibles ──
function _gradeVoisin(userId, sens) {
  const db = loadDB(); const membre = db.members[userId]; if (!membre) return null;
  const rang = membre.rang || '—';
  const lL = GRADES_LEGAL.map(g => g.nom), lI = GRADES_ILLEGAL.map(g => g.nom);
  const ladder = lL.includes(rang) ? lL : lI.includes(rang) ? lI : (membre.pole === 'illegal' ? lI : lL);
  const idx = ladder.indexOf(rang);
  if (idx === -1) return sens === 'up' ? ladder[ladder.length - 1] : null;
  const newIdx = sens === 'up' ? idx - 1 : idx + 1;
  if (newIdx < 0 || newIdx >= ladder.length) return null;
  return ladder[newIdx];
}
async function handleGradeUp(interaction) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  const userId = interaction.customId.replace('grade_up_', '');
  const cible = _gradeVoisin(userId, 'up');
  if (!cible) return interaction.reply({ content: '⛔ Déjà au grade le plus élevé de son pôle (ou membre introuvable).', flags: MessageFlags.Ephemeral });
  return _appliquerGrade(interaction, userId, cible);
}
async function handleGradeDown(interaction) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  const userId = interaction.customId.replace('grade_down_', '');
  const cible = _gradeVoisin(userId, 'down');
  if (!cible) return interaction.reply({ content: '⛔ Déjà au grade le plus bas de son pôle (ou membre introuvable).', flags: MessageFlags.Ephemeral });
  return _appliquerGrade(interaction, userId, cible);
}
async function handleGradeFiche(interaction) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  const userId = interaction.customId.replace('grade_fiche_', '');
  const db = loadDB(); const membre = _membreFromId(db, userId);
  if (!membre) return interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral });
  const rang = membre.rang || '—';
  const gradeInfo = [...GRADES_LEGAL, ...GRADES_ILLEGAL].find(g => g.nom === rang);
  const depuis = membre.gradeDepuis ? `${daysSince(membre.gradeDepuis)} j (depuis le ${fmtShort(membre.gradeDepuis)})` : '— (non enregistré)';
  const prochain = _gradeVoisin(userId, 'up');
  const hist = (membre.historiqueGrades || []).slice(-8).reverse();
  const histTxt = hist.length ? hist.map(h => `• ${fmtShort(h.at)} — ${h.de || '—'} → ${h.vers}${h.par ? ` _(par ${h.par})_` : ''}`).join('\n').slice(0, 1024) : '*Aucun historique enregistré.*';
  const e = new EmbedBuilder().setColor(gradeInfo?.couleur || 0x8B1A1A).setTitle(`📋 Fiche de grade — ${membre.name || userId}`)
    .addFields(
      { name: '🎖️ Grade actuel', value: `${gradeInfo?.emoji || ''} ${rang}`.trim(), inline: true },
      { name: '⚖️ Pôle', value: membre.pole === 'illegal' ? '🔪 Confrérie' : '⚖️ Légal', inline: true },
      { name: '⏱️ Ancienneté', value: depuis, inline: true },
      { name: '⬆️ Prochain grade', value: prochain || '— (au sommet)', inline: false },
      { name: '📜 Historique', value: histTxt, inline: false },
    ).setFooter({ text: 'IWC • Fiche de grade' });
  return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}
async function handleGradeEligibles(interaction) {
  if (!canManageGrades(interaction.member)) return interaction.reply({ content: '❌ Réservé au Concepteur et au Fléau.', flags: MessageFlags.Ephemeral });
  const SEUIL = 14;
  const db = loadDB();
  const lL = GRADES_LEGAL.map(g => g.nom), lI = GRADES_ILLEGAL.map(g => g.nom);
  const elig = Object.values(db.members || {}).filter(m => {
    if (m.status !== 'actif') return false;
    const rang = m.rang || '—';
    const ladder = lL.includes(rang) ? lL : lI.includes(rang) ? lI : null;
    if (!ladder || ladder.indexOf(rang) <= 0) return false;
    return m.gradeDepuis ? daysSince(m.gradeDepuis) >= SEUIL : false;
  }).sort((a, b) => daysSince(b.gradeDepuis) - daysSince(a.gradeDepuis));
  const txt = elig.length ? elig.slice(0, 20).map(m => {
    const id = m.id || Object.entries(MEMBRES_DISCORD_MAP).find(([n]) => n === m.name)?.[1] || m.name;
    return `• <@${id}> — ${m.rang} _(${daysSince(m.gradeDepuis)} j à ce grade)_`;
  }).join('\n') : `*Aucun membre actif depuis ≥ ${SEUIL} j à son grade actuel (ou ancienneté pas encore enregistrée).*`;
  const e = new EmbedBuilder().setColor(0x57F287).setTitle('📈 Éligibles à une promotion').setDescription(txt.slice(0, 4000)).setFooter({ text: `IWC • Actifs ≥ ${SEUIL} j au grade actuel` });
  return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}
// ═══════════════════════════════════════════════════════════════
// 4. AFFAIRES — Panel sans doublon + Détails propres (FIX defer)
// ═══════════════════════════════════════════════════════════════
async function setupAffairesPanel(guild) {
  try {
    const affairesCh = getChById(guild, 'AFFAIRES', 'affaires');
    if (!affairesCh) return;
    const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('⚔️ AFFAIRES — Direction Iron Wolf Company').setDescription(['*Ce salon est réservé aux décisions stratégiques de la Direction.*', '', '**Fonctionnement :**', '→ Soumettre une proposition via le bouton ci-dessous', '→ La Direction vote ✅ / ❌ sur chaque proposition', '→ Décision validée après **2 votes ✅** de membres Direction', '→ Résumé hebdomadaire automatique chaque lundi', '', '*Confidentialité absolue. Ce salon n\'existe pas.*'].join('\n')).setFooter({ text: 'IWC • Direction — Affaires internes' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_affaire_nouvelle').setLabel('📋 Nouvelle proposition').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('btn_affaires_resume').setLabel('📊 Résumé des décisions').setStyle(ButtonStyle.Secondary));
    await _upsertBotMessage(guild, affairesCh, 'affairesPanelMsgId', { embeds: [embed], components: [row] });
    console.log('✅ Panel affaires configuré');
  } catch (e) { console.log('❌ setupAffairesPanel error:', e.message); }
}
async function handleAffaireNouvelleButton(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const modal = new ModalBuilder().setCustomId('modal_affaire').setTitle('📋 Nouvelle Affaire — Direction');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre de la proposition').setStyle(TextInputStyle.Short).setPlaceholder('Ex: Recrutement Officier Terrain').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description / Détails').setStyle(TextInputStyle.Paragraph).setPlaceholder('Contexte, enjeux, décision attendue...').setRequired(true).setMaxLength(1000)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('categorie').setLabel('Catégorie').setStyle(TextInputStyle.Short).setPlaceholder('Recrutement / Opération / Finance / Alliance / Sanction').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('urgence').setLabel('Urgence (normale / haute / critique)').setStyle(TextInputStyle.Short).setPlaceholder('normale').setRequired(false)),
  );
  await interaction.showModal(modal);
}
async function handleAffaireModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const titre = interaction.fields.getTextInputValue('titre'); const description = interaction.fields.getTextInputValue('description'); const categorie = interaction.fields.getTextInputValue('categorie');
  const urgenceRaw = (interaction.fields.getTextInputValue('urgence') || 'normale').toLowerCase();
  const urgence = urgenceRaw.includes('crit') ? 'critique' : urgenceRaw.includes('haut') ? 'haute' : 'normale';
  const urgenceEmoji = urgence === 'critique' ? '🔴' : urgence === 'haute' ? '🟠' : '🟡';
  const urgenceCouleur = urgence === 'critique' ? 0xED4245 : urgence === 'haute' ? 0xFF6B35 : 0xFFA500;
  const db = loadDB(); if (!db.affaires) db.affaires = [];
  const affaireId = `AFF-${Date.now().toString().slice(-5)}`;
  const affaire = { id: affaireId, titre, description, categorie, urgence, soumisePar: interaction.user.username, soumiseParId: interaction.user.id, status: 'en_vote', votesOui: [], votesNon: [], createdAt: new Date().toISOString() };
  db.affaires.push(affaire); saveDB(db);
  const affairesCh = getCh(interaction.guild, 'affaires');
  if (affairesCh) {
    const embed = new EmbedBuilder().setColor(urgenceCouleur).setTitle(`${urgenceEmoji} AFFAIRE — ${titre}`).setDescription(`> *${description}*`).addFields({ name: '🆔 Référence', value: `\`${affaireId}\``, inline: true }, { name: '📁 Catégorie', value: categorie, inline: true }, { name: '🚨 Urgence', value: `${urgenceEmoji} ${urgence}`, inline: true }, { name: '👤 Soumis par', value: interaction.user.username, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '📊 Votes', value: '✅ 0 / ❌ 0 — En attente de 2 votes ✅', inline: false }).setFooter({ text: 'IWC • Affaires Direction — Confidentiel' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`affaire_oui_${affaireId}`).setLabel('✅ Approuver').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`affaire_non_${affaireId}`).setLabel('❌ Rejeter').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`affaire_detail_${affaireId}`).setLabel('🔍 Détails').setStyle(ButtonStyle.Secondary));
    const msg = await affairesCh.send({ embeds: [embed], components: [row] });
    affaire.msgId = msg.id; saveDB(db);
  }
  await interaction.editReply({ content: `✅ Affaire **${affaireId}** soumise.` });
  setTimeout(() => interaction.deleteReply().catch(() => {}), 3000);
}
/**
 * FIX DOUBLON : utiliser reply({ flags: MessageFlags.Ephemeral }) directement au lieu de deferReply + editReply
 * deferReply crée un message visible puis editReply le modifie → doublon visible
 */
async function handleAffaireDetail(interaction) {
  const affaireId = interaction.customId.replace('affaire_detail_', '');
  const db = loadDB();
  const affaire = (db.affaires || []).find(a => a.id === affaireId);
  if (!affaire) return interaction.reply({ content: '❌ Affaire introuvable.', flags: MessageFlags.Ephemeral });
  const urgenceEmoji = affaire.urgence === 'critique' ? '🔴' : affaire.urgence === 'haute' ? '🟠' : '🟡';
  const statusEmoji  = affaire.status === 'approuvee' ? '✅' : affaire.status === 'rejetee' ? '❌' : '⏳';
  const statusLabel  = affaire.status === 'approuvee' ? 'Approuvée' : affaire.status === 'rejetee' ? 'Rejetée' : 'En vote';
  const statusColor  = affaire.status === 'approuvee' ? 0x57F287 : affaire.status === 'rejetee' ? 0xED4245 : 0xFFA500;
  const votantsOui = (affaire.votesOui || []).map(id => `<@${id}>`).join(', ') || '*Aucun*';
  const votantsNon = (affaire.votesNon || []).map(id => `<@${id}>`).join(', ') || '*Aucun*';
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor(statusColor)
      .setTitle(`📋 ${affaire.titre}`)
      .setDescription(`> *${affaire.description}*`)
      .addFields(
        { name: '🆔 Référence',   value: `\`${affaire.id}\``,                 inline: true },
        { name: '📁 Catégorie',   value: affaire.categorie,                    inline: true },
        { name: '🚨 Urgence',     value: `${urgenceEmoji} ${affaire.urgence}`, inline: true },
        { name: '📊 Statut',      value: `${statusEmoji} ${statusLabel}`,      inline: true },
        { name: '👤 Soumis par',  value: affaire.soumisePar,                   inline: true },
        { name: '📅 Date',        value: fmtShort(affaire.createdAt),          inline: true },
        { name: `✅ Pour (${(affaire.votesOui||[]).length})`,  value: votantsOui, inline: true },
        { name: `❌ Contre (${(affaire.votesNon||[]).length})`, value: votantsNon, inline: true },
      )
      .setFooter({ text: 'IWC • Affaires Direction — Confidentiel' })
    ],
  });
}
async function handleAffaireVote(interaction, vote) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const affaireId = interaction.customId.replace(vote === 'oui' ? 'affaire_oui_' : 'affaire_non_', '');
  const db = loadDB(); const affaire = (db.affaires || []).find(a => a.id === affaireId);
  if (!affaire) return interaction.reply({ content: '❌ Affaire introuvable.', flags: MessageFlags.Ephemeral });
  if (affaire.status !== 'en_vote') return interaction.reply({ content: '❌ Cette affaire est déjà clôturée.', flags: MessageFlags.Ephemeral });
  affaire.votesOui = (affaire.votesOui || []).filter(id => id !== interaction.user.id);
  affaire.votesNon = (affaire.votesNon || []).filter(id => id !== interaction.user.id);
  if (vote === 'oui') affaire.votesOui.push(interaction.user.id); else affaire.votesNon.push(interaction.user.id);
  const oui = affaire.votesOui.length; const non = affaire.votesNon.length; const VOTES_REQUIS = 2;
  let statusText = `✅ ${oui} / ❌ ${non} — Il faut **${VOTES_REQUIS} ✅** pour valider`;
  let decisionPrise = false; let couleur = 0xFFA500;
  if (oui >= VOTES_REQUIS) { affaire.status = 'approuvee'; affaire.decideeAt = new Date().toISOString(); statusText = `✅ **APPROUVÉE** — ${oui} votes pour`; couleur = 0x57F287; decisionPrise = true; }
  else if (non >= VOTES_REQUIS) { affaire.status = 'rejetee'; affaire.decideeAt = new Date().toISOString(); statusText = `❌ **REJETÉE** — ${non} votes contre`; couleur = 0xED4245; decisionPrise = true; }
  saveDB(db);
  const embed = EmbedBuilder.from(interaction.message.embeds[0]).setColor(couleur).spliceFields(5, 1, { name: '📊 Votes', value: statusText, inline: false });
  await interaction.update({ embeds: [embed], components: decisionPrise ? [] : interaction.message.components });
  if (decisionPrise) {
    await interaction.followUp({ content: `${affaire.status === 'approuvee' ? '✅' : '❌'} L'affaire **${affaireId}** a été **${affaire.status === 'approuvee' ? 'APPROUVÉE' : 'REJETÉE'}**.`, ephemeral: false });
    const logsCh = _journalCh(interaction.guild);
    if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(couleur).setTitle(`${affaire.status === 'approuvee' ? '✅' : '❌'} Affaire ${affaire.status === 'approuvee' ? 'approuvée' : 'rejetée'} — ${affaire.titre}`).addFields({ name: '🆔 Référence', value: `\`${affaireId}\``, inline: true }, { name: '📁 Catégorie', value: affaire.categorie, inline: true }, { name: '📊 Score', value: `✅ ${oui} / ❌ ${non}`, inline: true }).setFooter({ text: `IWC • Affaires Direction • ${fmtShort(new Date())}` })] }).catch(() => {});
  }
}
// ── Timeout affaires (48h sans décision) + archivage ──
async function checkAffairesTimeout(guild) {
  try {
    const db  = loadDB();
    const now = Date.now();
    if (!db.affaires?.length) return;
    const affairesCh = getChById(guild, 'AFFAIRES', 'affaires');
    const logsCh     = _journalCh(guild);
    let changed = false;
    for (const affaire of db.affaires) {
      if (affaire.status !== 'en_vote') continue;
      const heures = Math.floor((now - new Date(affaire.createdAt).getTime()) / 3600000);
      // Rappel à 24h
      if (heures >= 24 && !affaire.rappel24h) {
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⏰ Affaire en attente — ${affaire.titre}`)
          .setDescription(`L'affaire **${affaire.id}** est en vote depuis **${heures}h** sans décision.`)
          .addFields({ name: '📊 Score actuel', value: `✅ ${(affaire.votesOui || []).length} · ❌ ${(affaire.votesNon || []).length}`, inline: true })
          .setFooter({ text: 'IWC • Affaires Direction' })
        ] }).catch(() => {});
        affaire.rappel24h = true;
        changed = true;
      }
      // Clôture automatique à 48h
      if (heures >= 48 && !affaire.rappel48h) {
        const oui = (affaire.votesOui || []).length;
        const non = (affaire.votesNon || []).length;
        const decision = oui > non ? 'approuvee' : non > oui ? 'rejetee' : 'expiree';
        affaire.status    = decision;
        affaire.decideeAt = new Date().toISOString();
        affaire.rappel48h = true;
        changed = true;
        const color = decision === 'approuvee' ? 0x57F287 : decision === 'rejetee' ? 0xED4245 : 0x555555;
        const label = decision === 'approuvee' ? '✅ APPROUVÉE' : decision === 'rejetee' ? '❌ REJETÉE' : '⏰ EXPIRÉE (égalité)';
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder()
          .setColor(color)
          .setTitle(`${label} (auto) — ${affaire.titre}`)
          .setDescription(`Clôture automatique après **48h**. Score final : ✅ ${oui} / ❌ ${non}`)
          .setFooter({ text: 'IWC • Clôture automatique' })
        ] }).catch(() => {});
        if (global._syncAffaireNotion) global._syncAffaireNotion(affaire, decision).catch(() => {});
      }
    }
    // Archivage : déplacer les affaires terminées dans db.affairesArchives
    const actives  = db.affaires.filter(a => a.status === 'en_vote');
    const terminees = db.affaires.filter(a => a.status !== 'en_vote');
    if (terminees.length > 0) {
      if (!db.affairesArchives) db.affairesArchives = [];
      db.affairesArchives.push(...terminees.filter(a => !db.affairesArchives.find(x => x.id === a.id)));
      db.affaires = actives;
      changed = true;
      console.log(`✅ ${terminees.length} affaire(s) archivée(s)`);
    }
    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkAffairesTimeout error:', e.message); }
}
async function postResumeAffaires(guild) {
  try {
    const db = loadDB(); const affairesCh = getChById(guild, 'AFFAIRES', 'affaires'); if (!affairesCh) return;
    const semaineDerniere = Date.now() - 7 * 86400000;
    const affaires = (db.affaires || []).filter(a => new Date(a.createdAt).getTime() >= semaineDerniere);
    if (!affaires.length) return;
    const approuvees = affaires.filter(a => a.status === 'approuvee'); const rejetees = affaires.filter(a => a.status === 'rejetee'); const enVote = affaires.filter(a => a.status === 'en_vote');
    await affairesCh.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('📊 Résumé hebdomadaire — Affaires Direction').setDescription(`*Semaine du ${fmtShort(new Date(semaineDerniere))} au ${fmtShort(new Date())}*`).addFields({ name: `✅ APPROUVÉES (${approuvees.length})`, value: approuvees.length > 0 ? approuvees.map(a => `→ \`${a.id}\` **${a.titre}** — ${a.categorie}`).join('\n') : '*Aucune*', inline: false }, { name: `❌ REJETÉES (${rejetees.length})`, value: rejetees.length > 0 ? rejetees.map(a => `→ \`${a.id}\` **${a.titre}**`).join('\n') : '*Aucune*', inline: false }, { name: `⏳ EN ATTENTE (${enVote.length})`, value: enVote.length > 0 ? enVote.map(a => `→ \`${a.id}\` **${a.titre}** — ✅ ${(a.votesOui||[]).length} / ❌ ${(a.votesNon||[]).length}`).join('\n') : '*Aucune*', inline: false }).setFooter({ text: 'IWC • Résumé automatique hebdomadaire' }).setTimestamp()] });
  } catch (e) { console.log('❌ postResumeAffaires error:', e.message); }
}
async function handleAffairesResumeButton(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const affaires = db.affaires || [];
  const approuvees = affaires.filter(a => a.status === 'approuvee').slice(-10); const rejetees = affaires.filter(a => a.status === 'rejetee').slice(-5); const enVote = affaires.filter(a => a.status === 'en_vote');
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('📊 Décisions de la Direction — IWC').addFields({ name: `✅ Dernières approuvées (${approuvees.length})`, value: approuvees.length > 0 ? approuvees.map(a => `→ \`${a.id}\` **${a.titre}**`).join('\n') : '*Aucune*', inline: false }, { name: `❌ Dernières rejetées (${rejetees.length})`, value: rejetees.length > 0 ? rejetees.map(a => `→ \`${a.id}\` **${a.titre}**`).join('\n') : '*Aucune*', inline: false }, { name: `⏳ En attente (${enVote.length})`, value: enVote.length > 0 ? enVote.map(a => `→ \`${a.id}\` **${a.titre}** — ✅ ${(a.votesOui||[]).length}`).join('\n') : '*Aucune*', inline: false }).setFooter({ text: `IWC • ${new Date().toLocaleString('fr-FR')}` })] });
}
// ═══════════════════════════════════════════════════════════════
// 5. INFORMATEURS — Panel sans doublon
// ═══════════════════════════════════════════════════════════════
const NOTION_INFOS_DB = process.env.NOTION_INFOS_DB || null;
async function setupInformateursPanel(guild) {
  try {
    const infosCh = getChById(guild, 'INFORMATEURS', 'informateurs'); if (!infosCh) return;
    const embed = new EmbedBuilder().setColor(0x2C2F33).setTitle('🕵️ INFORMATEURS — Réseau de Renseignement').setDescription(['*Ce canal est réservé aux informations collectées sur le terrain.*', '*Discrétion absolue. Ce qui est posté ici ne sort pas de ces murs.*', '', '**Deux façons de soumettre un rapport :**', '→ Via le bouton **📋 Soumettre un rapport** ci-dessous', '→ Via le format texte directement dans le salon', '', '**Format texte :**', '```', 'SOURCE : ', 'CIBLE / LIEU : ', 'INFORMATION : ', 'FIABILITÉ : Confirmée / Non confirmée', 'DATE : ', '```'].join('\n')).setFooter({ text: 'IWC • Réseau d\'informateurs — Confidentiel' });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_informateur_rapport').setLabel('📋 Soumettre un rapport').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('btn_informateur_historique').setLabel('📂 Historique').setStyle(ButtonStyle.Secondary));
    await _upsertBotMessage(guild, infosCh, 'informeursPanelMsgId', { embeds: [embed], components: [row] });
    console.log('✅ Panel informateurs configuré');
  } catch (e) { console.log('❌ setupInformateursPanel error:', e.message); }
}
async function handleInformateurRapportButton(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_informateur').setTitle('🕵️ Rapport — Réseau Informateurs');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('source').setLabel('Source (nom / pseudo / anonyme)').setStyle(TextInputStyle.Short).setPlaceholder('Ex: Contact dans la police, Anonyme...').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Cible / Lieu').setStyle(TextInputStyle.Short).setPlaceholder('Ex: Commissariat de Paleto Bay, Famille Moreau...').setRequired(true)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('information').setLabel('Information collectée').setStyle(TextInputStyle.Paragraph).setPlaceholder('Décris ce que tu as vu / entendu / appris...').setRequired(true).setMaxLength(1000)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fiabilite').setLabel('Fiabilité (Confirmée / Non confirmée)').setStyle(TextInputStyle.Short).setPlaceholder('Confirmée  ou  Non confirmée').setRequired(true)),
  );
  await interaction.showModal(modal);
}
async function handleInformateurModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const source = interaction.fields.getTextInputValue('source'); const cible = interaction.fields.getTextInputValue('cible'); const information = interaction.fields.getTextInputValue('information');
  const fiabiliteRaw = interaction.fields.getTextInputValue('fiabilite').toLowerCase(); const estConfirmee = fiabiliteRaw.includes('confirm') && !fiabiliteRaw.includes('non'); const fiabilite = estConfirmee ? 'Confirmée' : 'Non confirmée';
  const db = loadDB(); if (!db.informateurs) db.informateurs = [];
  const rapport = { id: `INFO-${Date.now().toString().slice(-5)}`, source, cible, info: information, fiabilite, statut: 'nouveau', rapporteurId: interaction.user.id, rapporteur: interaction.user.username, createdAt: new Date().toISOString() };
  db.informateurs.push(rapport); saveDB(db);
  await _archiverRapportNotion(rapport);
  const infosCh = getCh(interaction.guild, 'informateurs');
  if (infosCh) await infosCh.send({
    embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`🆕 Rapport \`${rapport.id}\` — À vérifier`).addFields({ name: '🕵️ Source', value: source, inline: true }, { name: '🎯 Cible / Lieu', value: cible, inline: true }, { name: '📋 Fiabilité déclarée', value: `${estConfirmee ? '✅' : '⚠️'} ${fiabilite}`, inline: true }, { name: '📝 Information', value: information.slice(0, 800) }, { name: '👤 Rapporteur', value: `<@${interaction.user.id}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '📌 Statut', value: '🆕 En attente de validation Direction', inline: false }).setFooter({ text: 'IWC • Réseau Informateurs — Confidentiel' }).setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`info_confirmer_${rapport.id}`).setLabel('✅ Confirmer').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`info_infirmer_${rapport.id}`).setLabel('❌ Infirmer').setStyle(ButtonStyle.Danger),
    )],
  }).catch(() => {});
  await interaction.editReply({ content: `✅ Rapport \`${rapport.id}\` soumis.\nLa Direction va le vérifier avant toute action.` });
}
async function handleInformateurHistorique(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const rapports = (db.informateurs || []).slice(-10).reverse();
  if (!rapports.length) return interaction.editReply({ content: '📭 Aucun rapport dans l\'historique.' });
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x2C2F33).setTitle('📂 Historique — 10 derniers rapports').setDescription(rapports.map(r => `${r.fiabilite === 'Confirmée' ? '🔴' : '🟡'} \`${r.id}\` **${r.cible}** — ${r.info.slice(0, 60)}... *(${fmtShort(r.createdAt)})*`).join('\n')).setFooter({ text: 'IWC • Réseau Informateurs — Confidentiel' })] });
}
async function handleInformateurMessage(message) {
  if (message.author.bot || !message.guild) return;
  const lines = message.content.split('\n');
  const get = k => { const l = lines.find(l => l.toUpperCase().startsWith(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() : null; };
  const source = get('SOURCE'); const cible = get('CIBLE') || get('CIBLE / LIEU') || get('CIBLE/LIEU'); const info = get('INFORMATION') || get('INFO'); const fiabilite = get('FIABILITÉ') || get('FIABILITE');
  if (!source && !info) { await message.react('👁️').catch(() => {}); return; }
  await message.react('✅').catch(() => {});
  const estConfirmee = fiabilite?.toLowerCase().includes('confirm') && !fiabilite?.toLowerCase().includes('non');
  const db = loadDB(); if (!db.informateurs) db.informateurs = [];
  const rapport = { id: `INFO-${Date.now().toString().slice(-5)}`, source: source || '—', cible: cible || '—', info: info || message.content.slice(0, 500), fiabilite: fiabilite || '—', statut: 'nouveau', rapporteurId: message.author.id, rapporteur: message.author.username, createdAt: new Date().toISOString() };
  db.informateurs.push(rapport); saveDB(db);
  await _archiverRapportNotion(rapport);
  // Poster avec boutons de validation Direction
  const infosCh2 = getCh(message.guild, 'informateurs');
  if (infosCh2) await infosCh2.send({
    embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`🆕 Rapport \`${rapport.id}\` — À vérifier`).addFields({ name: '🕵️ Source', value: rapport.source, inline: true }, { name: '🎯 Cible / Lieu', value: rapport.cible, inline: true }, { name: '📋 Fiabilité déclarée', value: rapport.fiabilite, inline: true }, { name: '📝 Information', value: rapport.info.slice(0, 800) }, { name: '👤 Rapporteur', value: `<@${message.author.id}>`, inline: true }, { name: '📌 Statut', value: '🆕 En attente de validation', inline: true }).setFooter({ text: 'IWC • Réseau Informateurs — Confidentiel' }).setTimestamp()],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`info_confirmer_${rapport.id}`).setLabel('✅ Confirmer').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`info_infirmer_${rapport.id}`).setLabel('❌ Infirmer').setStyle(ButtonStyle.Danger),
    )],
  }).catch(() => {});
  await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`🆕 \`${rapport.id}\` enregistré`).setDescription('Rapport soumis. La Direction va le vérifier.').setFooter({ text: 'IWC • Informateurs — Confidentiel' })], allowedMentions: { repliedUser: false } }).then(m => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
}
async function _archiverRapportNotion(rapport) {
  if (!process.env.NOTION_TOKEN || !NOTION_INFOS_DB) return;
  try {
    await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: NOTION_INFOS_DB }, properties: { 'Source': { title: [{ text: { content: rapport.source } }] }, 'Cible': { rich_text: [{ text: { content: rapport.cible } }] }, 'Information': { rich_text: [{ text: { content: rapport.info.slice(0, 2000) } }] }, 'Fiabilité': { select: { name: rapport.fiabilite === 'Confirmée' ? '✅ Confirmée' : '⚠️ Non confirmée' } }, 'Statut': { select: { name: '🆕 Nouveau' } }, 'Date': { date: { start: new Date().toISOString().split('T')[0] } }, 'Rapporteur': { rich_text: [{ text: { content: rapport.rapporteur } }] } } }) });
  } catch (e) { console.log('❌ Informateur Notion error:', e.message); }
}
// ── Validation Direction : Confirmer / Infirmer un rapport ──
async function handleInformateurConfirmer(interaction) {
  return _traiterValidationInfo(interaction, 'confirme');
}
async function handleInformateurInfirmer(interaction) {
  return _traiterValidationInfo(interaction, 'infirme');
}
async function _traiterValidationInfo(interaction, decision) {
  const estDir = interaction.member?.roles?.cache?.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'].some(n => r.name.includes(n)));
  if (!estDir) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const rapId = interaction.customId.replace(decision === 'confirme' ? 'info_confirmer_' : 'info_infirmer_', '');
  const db = loadDB();
  const rapport = (db.informateurs || []).find(r => r.id === rapId);
  if (!rapport) return interaction.reply({ content: '❌ Rapport introuvable.', flags: MessageFlags.Ephemeral });
  if (rapport.statut && rapport.statut !== 'nouveau') {
    return interaction.reply({ content: `❌ Rapport déjà traité (${rapport.statut}).`, flags: MessageFlags.Ephemeral });
  }
  rapport.statut = decision;
  rapport.valideePar = interaction.user.username;
  rapport.valideeAt = new Date().toISOString();
  saveDB(db);
  // Sync Notion
  if (global._syncInformateurNotion) global._syncInformateurNotion(rapport, decision, interaction.user.username).catch(() => {});
  const confirme = decision === 'confirme';
  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(confirme ? 0xED4245 : 0x555555)
    .setTitle(`${confirme ? '🔴 Confirmé' : '⬛ Infirmé'} — Rapport ${rapId}`)
    .spliceFields(-1, 1, { name: '📌 Statut', value: confirme ? `🔴 Confirmé par ${interaction.user.username}` : `⬛ Infirmé par ${interaction.user.username}`, inline: false });
  await interaction.update({ embeds: [embed], components: [] });
  // Si confirmé → alerter la Direction
  if (confirme) await _alerterDirection(interaction.guild, rapport, rapport.rapporteurId);
}
async function _alerterDirection(guild, rapport, rapporteurId) {
  const logsCh = guild.channels.cache.get('1508756535407542372') || _journalCh(guild); if (!logsCh) return;
  const mention = guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ');
  await logsCh.send({ content: `${mention} — 🚨 **Information confirmée reçue**`, embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`🔴 ALERTE — Information Confirmée \`${rapport.id}\``).addFields({ name: '🕵️ Source', value: rapport.source, inline: true }, { name: '🎯 Cible / Lieu', value: rapport.cible, inline: true }, { name: '👤 Rapporteur', value: rapporteurId ? `<@${rapporteurId}>` : rapport.rapporteur, inline: true }, { name: '📝 Information', value: rapport.info.slice(0, 500) }).setFooter({ text: 'IWC • Réseau d\'informateurs — Confidentiel' }).setTimestamp()] }).catch(() => {});
}
// ═══════════════════════════════════════════════════════════════
// 6. PLANNING — Image → Notion (sans panneau, sans SESSION)
// ═══════════════════════════════════════════════════════════════
const NOTION_BASE_URL = 'https://api.notion.com/v1';
// NOTION_VERSION importée depuis config.js (alias NOTION_VERSION_V3)
async function notionAddImageBlock(pageId, imageUrl, caption) {
  if (!process.env.NOTION_TOKEN || !pageId) return false;
  try {
    await fetch(`${NOTION_BASE_URL}/blocks/${pageId}/children`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION_V3, 'Content-Type': 'application/json' }, body: JSON.stringify({ children: [{ object: 'block', type: 'image', image: { type: 'external', external: { url: imageUrl }, caption: caption ? [{ type: 'text', text: { content: caption } }] : [] } }, { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `📸 Ajouté le ${fmtShort(new Date())} via Discord` } }] } }] }) });
    return true;
  } catch (e) { console.log('❌ notionAddImageBlock error:', e.message); return false; }
}
async function getProchainRdvNotion() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return null;
  try {
    const res = await fetch(`${NOTION_BASE_URL}/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION_V3, 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Date', date: { on_or_after: new Date().toISOString() } }, sorts: [{ property: 'Date', direction: 'ascending' }], page_size: 5 }) });
    const data = await res.json(); const p = (data.results || [])[0]; if (!p) return null;
    return { id: p.id, titre: p.properties.Titre?.title?.[0]?.plain_text || '—', date: p.properties.Date?.date?.start, lieu: p.properties.Lieu?.rich_text?.[0]?.plain_text || '—' };
  } catch { return null; }
}
async function rechercherRdvNotion(motCle) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return null;
  try {
    const res = await fetch(`${NOTION_BASE_URL}/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION_V3, 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { or: [{ property: 'Titre', rich_text: { contains: motCle } }, { property: 'Lieu', rich_text: { contains: motCle } }, { property: 'Notes', rich_text: { contains: motCle } }] }, sorts: [{ property: 'Date', direction: 'ascending' }], page_size: 3 }) });
    const data = await res.json(); const p = (data.results || [])[0]; if (!p) return null;
    return { id: p.id, titre: p.properties.Titre?.title?.[0]?.plain_text || '—', date: p.properties.Date?.date?.start, lieu: p.properties.Lieu?.rich_text?.[0]?.plain_text || '—' };
  } catch { return null; }
}
async function handlePlanningScreenshot(message) {
  if (message.author.bot || !message.guild) return false;
  const images = message.attachments.filter(a => a.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.url));
  if (!images.size) return false;
  const texte    = message.content.toLowerCase().trim();
  const motsCles = texte.replace(/screen|rdv|lieu|repérage|reperage|capture|screenshot|planning|photo|image/gi, '').trim();
  let rdv = null;
  if (motsCles.length > 2) rdv = await rechercherRdvNotion(motsCles);
  if (!rdv) rdv = await getProchainRdvNotion();
  if (!rdv) {
    await message.react('📸').catch(() => {});
    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📸 Image reçue').setDescription('Aucun RDV trouvé dans Notion pour associer cette image.\nElle reste disponible ici sur Discord.').setFooter({ text: 'IWC • Planning' })], allowedMentions: { repliedUser: false } }).catch(() => null);
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 10000);
    return true;
  }
  let succes = 0;
  const caption = texte ? `${message.author.username} — ${texte}` : `${message.author.username} — Repérage`;
  for (const [, attachment] of images) { if (await notionAddImageBlock(rdv.id, attachment.url, caption)) succes++; }
  if (succes > 0) {
    await message.react('✅').catch(() => {});
    const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`📸 ${succes} image(s) ajoutée(s) dans Notion`).addFields({ name: '📅 RDV', value: `**${rdv.titre}**`, inline: true }, { name: '📍 Lieu', value: rdv.lieu, inline: true }, { name: '🗓️ Date', value: fmtShort(rdv.date), inline: true }).setFooter({ text: 'IWC • Planning automatique' })], allowedMentions: { repliedUser: false } }).catch(() => null);
    if (reply) setTimeout(() => reply.delete().catch(() => {}), 12000);
  } else { await message.react('❌').catch(() => {}); }
  return true;
}
// ═══════════════════════════════════════════════════════════════
// 7. PLANS — Archive photos de lieux dans Notion
// ═══════════════════════════════════════════════════════════════
const NOTION_PLANS_DB = process.env.NOTION_PLANS_DB || process.env.NOTION_AGENDA_DB_ID || null;
async function handlePlansMessage(message) {
  if (message.author.bot || !message.guild) return false;
  const images = message.attachments.filter(a => a.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.url));
  if (!images.size) return false;
  const lieu = message.content.trim() || 'Lieu non précisé';
  if (process.env.NOTION_TOKEN && NOTION_PLANS_DB) {
    try {
      for (const [, attachment] of images) {
        await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION_V3, 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: NOTION_PLANS_DB }, properties: { 'Titre': { title: [{ text: { content: `Plan — ${lieu}` } }] }, 'Lieu': { rich_text: [{ text: { content: lieu } }] }, 'Date': { date: { start: new Date().toISOString().split('T')[0] } }, 'Auteur': { rich_text: [{ text: { content: message.author.username } }] }, 'Type': { select: { name: '🗺️ Plan tactique' } }, 'URL Image': { url: attachment.url } } }) });
      }
    } catch (e) { console.log('❌ Plans Notion error:', e.message); }
  }
  await message.react('🗺️').catch(() => {});
  const reply = await message.reply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🗺️ Plan archivé — ${lieu}`).addFields({ name: '📍 Lieu', value: lieu, inline: true }, { name: '👤 Ajouté par', value: message.author.username, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }).setDescription(`${images.size} image(s) archivée(s) dans Notion.`).setFooter({ text: 'IWC • Plans tactiques' })], allowedMentions: { repliedUser: false } }).catch(() => null);
  if (reply) setTimeout(() => reply.delete().catch(() => {}), 12000);
  return true;
}
// ═══════════════════════════════════════════════════════════════
// 8. PINGS
// ═══════════════════════════════════════════════════════════════
function getMentionPole(guild, pole = 'all') {
  const legalRoleNames   = ['Conseil', 'Officier', 'Agent', 'Opérateur', 'Recrue', 'Iron Wolf'];
  const illegalRoleNames = ['Concepteur', 'Fléau', 'Exécuteur', 'Condamné', 'Maudit', 'Confrérie'];
  let roleNames;
  if (pole === 'legal')        roleNames = legalRoleNames;
  else if (pole === 'illegal') roleNames = illegalRoleNames;
  else roleNames = [...legalRoleNames, ...illegalRoleNames, 'Fondateur', 'Directeur'];
  return guild.roles.cache.filter(r => roleNames.some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ') || '';
}
async function updateNotionStatutPole(userId, pole) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_FICHES_DB) return;
  try { const pageId = await notionExtra.getFicheId?.(userId); if (!pageId) return; await notionExtra.notionPatch?.(pageId, { 'Pôle': { select: { name: pole === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } } }); } catch {}
}
// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  handleAbsenceDetection, ABSENCE_KEYWORDS,
  checkInactivite, JOURS_INACTIF,
  updateHierarchieEmbed, handleHierarchieCommand, handleGradeSetCommand, handleGradePanelButton, handleGradeMembreSelect, handleGradeGradeSelect, handleGradeMajButton, handleGradeUp, handleGradeDown, handleGradeFiche, handleGradeEligibles, showGradeMembre, GRADES_LEGAL, GRADES_ILLEGAL, ROLES,
  setupAffairesPanel, handleAffaireNouvelleButton, handleAffaireModal, handleAffaireVote, handleAffaireDetail, postResumeAffaires, handleAffairesResumeButton, checkAffairesTimeout,
  setupInformateursPanel, handleInformateurRapportButton, handleInformateurModal, handleInformateurHistorique, handleInformateurMessage, handleInformateurConfirmer, handleInformateurInfirmer,
  handlePlanningScreenshot, handlePlansMessage,
  getMentionPole, updateNotionStatutPole,
  syncOperationTermineeNotion, syncAbsenceNotion,
  handleAgendaCommand, handleAgendaNouveauButton, handleAgendaModal,
  _getPole,
};
// ═══════════════════════════════════════════════════════════════
// 9. SYNC NOTION — Opérations terminées
// ═══════════════════════════════════════════════════════════════
async function syncOperationTermineeNotion(op) {
  // Accepte les deux noms d'env (NOTION_OPS_DB historique + NOTION_OPERATIONS_DB utilisé ailleurs)
  const OPS_DB = process.env.NOTION_OPS_DB || process.env.NOTION_OPERATIONS_DB;
  if (!process.env.NOTION_TOKEN || !OPS_DB) return;
  try {
    const props = {
      'Nom':         { title:     [{ text: { content: op.name || '—' } }] },
      'Lieu':        { rich_text: [{ text: { content: op.lieu || '—' } }] },
      'Objectif':    { rich_text: [{ text: { content: op.objectif || '—' } }] },
      'Résultat':    { rich_text: [{ text: { content: op.resultat || '—' } }] },
      'Butin':       { rich_text: [{ text: { content: op.butin || '—' } }] },
      'Débrief':     { rich_text: [{ text: { content: op.debrief || '—' } }] },
      'Pôle':        { select:    { name: op.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal' } },
      'Statut':      { select:    { name: '✅ Terminée' } },
      'Participants':{ rich_text: [{ text: { content: (op.participants || []).join(', ') } }] },
      'Date fin':    { date:      { start: op.endedAt ? new Date(op.endedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } },
    };
    if (op.notionPageId) {
      await fetch(`https://api.notion.com/v1/pages/${op.notionPageId}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: props }),
      });
    } else {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: { database_id: OPS_DB }, properties: props }),
      });
    }
    console.log(`✅ Opération archivée dans Notion : ${op.name}`);
  } catch (e) { console.log('❌ syncOperationTermineeNotion error:', e.message); }
}
// ═══════════════════════════════════════════════════════════════
// 10. SYNC NOTION — Absences
// ═══════════════════════════════════════════════════════════════
async function syncAbsenceNotion(userId, statut) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_MEMBRES_DB}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: userId } }, page_size: 1 }),
    });
    const data = await res.json();
    const page = data.results?.[0];
    if (!page) return;
    const statutNotion = statut === 'absent' ? '⚠️ Absent' : statut === 'inactif' ? '💤 Inactif' : '✅ Actif';
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: {
        'Statut':            { select:    { name: statutNotion } },
        'Dernière activité': { date:      { start: new Date().toISOString().split('T')[0] } },
      } }),
    });
    console.log(`✅ Statut Notion MàJ : ${userId} → ${statutNotion}`);
  } catch (e) { console.log('❌ syncAbsenceNotion error:', e.message); }
}
// ═══════════════════════════════════════════════════════════════
// 11. AGENDA INTERACTIF — Créer un RDV depuis Discord
// ═══════════════════════════════════════════════════════════════
async function handleAgendaCommand(interaction) {
  const sub = interaction.options?.getSubcommand?.() || 'voir';
  if (sub === 'voir') {
    await interaction.deferReply({ ephemeral: false });
    let rdvs = [];
    if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
      try {
        const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
          body: JSON.stringify({ filter: { property: 'Date', date: { on_or_after: new Date().toISOString() } }, sorts: [{ property: 'Date', direction: 'ascending' }], page_size: 8 }),
        });
        const data = await res.json();
        rdvs = (data.results || []).map(p => ({
          titre: p.properties.Titre?.title?.[0]?.plain_text || '—',
          date:  p.properties.Date?.date?.start,
          heure: p.properties.Heure?.rich_text?.[0]?.plain_text || '',
          lieu:  p.properties.Lieu?.rich_text?.[0]?.plain_text || '—',
          type:  p.properties.Type?.select?.name || '—',
          statut: p.properties.Statut?.select?.name || '—',
        }));
      } catch (e) { console.log('❌ Agenda voir error:', e.message); }
    }
    const embed = new EmbedBuilder()
      .setColor(0x8B5A2A)
      .setTitle('📅 Agenda — Iron Wolf Company')
      .setDescription(rdvs.length > 0
        ? rdvs.map(r => {
            const d = r.date ? new Date(r.date).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: 'short' }) : '—';
            return `**${r.titre}**\n📅 ${d}${r.heure ? ` à **${r.heure}**` : ''} · 📍 ${r.lieu} · *(${r.type})*`;
          }).join('\n\n')
        : '*Aucun RDV à venir dans Notion.*'
      )
      .setFooter({ text: `IWC • Agenda • ${new Date().toLocaleDateString('fr-FR')}` })
      .setTimestamp();
    const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
    await interaction.editReply({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_agenda_nouveau').setLabel('➕ Nouveau RDV').setStyle(ButtonStyle.Primary),
      )],
    });
    return;
  }
  // /agenda creer → géré dans index.js par _ouvrirModalAgendaSimple
  if (sub === 'creer') return; // handled in index.js
}
async function handleAgendaNouveauButton(interaction) {
  const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
  const modal = new ModalBuilder().setCustomId('modal_agenda_rdv').setTitle('📅 Nouveau RDV — Agenda IWC');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre du RDV').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Réunion Direction, Mission Paleto Bay...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Paleto Bay, Discord vocal...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes / Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)),
  );
  await interaction.showModal(modal);
}
async function handleAgendaModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const titre = interaction.fields.getTextInputValue('titre');
  const dateRaw = interaction.fields.getTextInputValue('date');
  const heure = interaction.fields.getTextInputValue('heure') || '';
  const lieu  = interaction.fields.getTextInputValue('lieu')  || '—';
  const notes = interaction.fields.getTextInputValue('notes') || '';
  // Parser la date JJ/MM/AAAA
  let dateISO = null;
  try {
    const parts = dateRaw.split('/');
    if (parts.length === 3) {
      dateISO = `${parts[2]}-${parts[1].padStart(2,'0')}-${parts[0].padStart(2,'0')}`;
    }
  } catch {}
  if (!dateISO) {
    return interaction.editReply({ content: '❌ Format de date invalide. Utilisez JJ/MM/AAAA.' });
  }
  // Créer dans Notion
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    try {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({
          parent: { database_id: process.env.NOTION_AGENDA_DB_ID },
          properties: {
            'Titre':  { title:     [{ text: { content: titre } }] },
            'Date':   { date:      { start: dateISO } },
            'Heure':  { rich_text: [{ text: { content: heure } }] },
            'Lieu':   { rich_text: [{ text: { content: lieu } }] },
            'Notes':  { rich_text: [{ text: { content: notes.slice(0, 2000) } }] },
            'Type':   { select:    { name: 'Réunion' } },
            'Statut': { select:    { name: 'Planifié' } },
            'Notif 24h':   { checkbox: true },
            'Notif 1h':    { checkbox: true },
            'Notif 15min': { checkbox: true },
          },
        }),
      });
      console.log(`✅ RDV Notion créé : ${titre}`);
    } catch (e) {
      console.log('❌ Agenda modal error:', e.message);
      return interaction.editReply({ content: '❌ Erreur lors de la création dans Notion.' });
    }
  }
  // Confirmer + annoncer dans le salon planning
  const { EmbedBuilder } = require('discord.js');
  const embedConfirm = new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle(`📅 RDV créé — ${titre}`)
    .addFields(
      { name: '📅 Date',  value: new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }), inline: true },
      { name: '🕐 Heure', value: heure || '—', inline: true },
      { name: '📍 Lieu',  value: lieu,          inline: true },
    );
  if (notes) embedConfirm.addFields({ name: '📝 Notes', value: notes.slice(0, 300) });
  embedConfirm
    .addFields({ name: '🔔 Rappels', value: '24h · 1h · 15min activés automatiquement' })
    .setFooter({ text: `Créé par ${interaction.user.username} • IWC Agenda` })
    .setTimestamp();
  await interaction.editReply({ embeds: [embedConfirm] });
  // Annoncer dans #planning
  const planCh = interaction.guild.channels.cache.find(c => {
    const cl = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return c.isTextBased?.() && cl(c.name) === cl('planning');
  });
  if (planCh) await planCh.send({ embeds: [embedConfirm] }).catch(() => {});
}
