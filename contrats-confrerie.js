// ═══════════════════════════════════════════════════════════════
// contrats-confrerie.js — Système de contrats clandestins de La Confrérie
// Habillage Confrérie · Niveau de risque + prime · Confidentialité (anonyme + accès restreint)
// Assignation d'agents · Briefing privé en DM · Fin de mission (réussie/échouée) · Rappels d'échéance
// Branchement : voir les 3 lignes à ajouter dans index.js (en bas de ce fichier).
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

// ─── Salons (IDs figés du serveur) ───
const CH_CONTRATS          = '1508756442730074222';
const CH_CONTRATS_REPONSES = '1509340674779254876';
const CH_JOURNAL           = '1508756535407542372';

// ─── Rôles Direction (permissions + ping) ───
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil'];

// ─── Types de mission (clandestins) ───
const TYPES_MISSION = [
  { label: 'Contrebande',           value: 'Contrebande',           emoji: '📦' },
  { label: 'Sabotage',              value: 'Sabotage',              emoji: '🧨' },
  { label: 'Vol organisé',          value: 'Vol organisé',          emoji: '💰' },
  { label: 'Élimination',           value: 'Élimination',           emoji: '🗡️' },
  { label: 'Extorsion / Racket',    value: 'Extorsion',             emoji: '✊' },
  { label: 'Espionnage / Filature', value: 'Espionnage',            emoji: '👁️' },
  { label: 'Protection',            value: 'Protection',            emoji: '🛡️' },
  { label: 'Récupération de dette', value: 'Récupération de dette', emoji: '⛓️' },
  { label: 'Autre (à préciser)',    value: 'Autre',                 emoji: '❓' },
];

// ─── Niveaux de risque ───
const RISQUES = {
  discret:  { label: 'Discret',  emoji: '🟢', couleur: 0x4CAF50, prime: 'standard' },
  risque:   { label: 'Risqué',   emoji: '🟠', couleur: 0xE67E22, prime: 'majorée' },
  sanglant: { label: 'Sanglant', emoji: '🔴', couleur: 0x8B1A1A, prime: 'maximale (prime de sang)' },
};

const STATUTS = {
  propose:  { label: '🟡 Proposé',  couleur: 0xF1C40F },
  actif:    { label: '🟢 En cours', couleur: 0x2ECC71 },
  reussie:  { label: '✅ Réussie',  couleur: 0x57F287 },
  echouee:  { label: '💀 Échouée',  couleur: 0xED4245 },
  refuse:   { label: '⛔ Refusé',   couleur: 0x555555 },
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function isDirection(member) {
  return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n)));
}
async function fetchCh(guild, id) {
  let ch = guild.channels.cache.get(id);
  if (!ch) ch = await guild.channels.fetch(id).catch(() => null);
  return ch || null;
}
function journalCh(guild) {
  if (typeof global.getJournalCh === 'function') { try { const c = global.getJournalCh(guild); if (c) return c; } catch {} }
  return guild.channels.cache.get(CH_JOURNAL) || null;
}
function directionMention(guild) {
  return guild.roles.cache.filter(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ');
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function parseDateFR(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) { const iso = s.match(/\d{4}-\d{2}-\d{2}/); return iso ? iso[0] : null; }
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function genId() { return 'CF-' + Date.now().toString().slice(-5); }
function findContrat(db, id) { return (db.contrats || []).find(c => c.id === id); }
function riskOf(c) { return RISQUES[c.risque] || RISQUES.discret; }
function emojiType(v) { return (TYPES_MISSION.find(t => t.value === v) || {}).emoji || '📋'; }

// ─── Construction de la fiche contrat (embed) ───
function buildContratEmbed(contrat) {
  const r = riskOf(contrat);
  const closed = ['reussie', 'echouee', 'refuse'].includes(contrat.status);
  const st = STATUTS[contrat.status] || STATUTS.propose;
  const couleur = closed ? st.couleur : r.couleur;
  const confid = !!contrat.confidentiel;

  const commanditaire = confid ? '🕶️ *Anonyme*' : (contrat.commanditaire || '—');
  const objet = confid
    ? '🔒 *Confidentiel — détails transmis aux agents en privé.*'
    : (contrat.objet || '—');

  const agents = (contrat.agents && contrat.agents.length)
    ? contrat.agents.map(id => `<@${id}>`).join(', ')
    : '*Aucun agent assigné*';

  const e = new EmbedBuilder()
    .setColor(couleur)
    .setTitle(`🐺 CONTRAT — ${contrat.id}`)
    .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n        LA CONFRÉRIE — CONTRAT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields(
      { name: '🆔 Référence', value: `\`${contrat.id}\``, inline: true },
      { name: '🎯 Type', value: `${emojiType(contrat.typeMission)} ${contrat.typeMission || '—'}`, inline: true },
      { name: '⚠️ Risque', value: `${r.emoji} ${r.label}`, inline: true },
      { name: '👤 Commanditaire', value: commanditaire, inline: true },
      { name: '💰 Prime', value: `${contrat.remuneration || '—'}\n*Prime ${r.prime}*`, inline: true },
      { name: '📅 Échéance', value: contrat.dateEcheance ? fmtDate(contrat.dateEcheance) : 'Aucune', inline: true },
      { name: '🗡️ Agents assignés', value: agents, inline: false },
      { name: '📋 Objet', value: objet, inline: false },
      { name: '📌 Statut', value: st.label, inline: true },
    )
    .setFooter({ text: `La Confrérie • Contrat clandestin${confid ? ' • CONFIDENTIEL' : ''}` })
    .setTimestamp(new Date(contrat.createdAt || Date.now()));
  return e;
}

// ─── Boutons selon le statut ───
function buildContratButtons(contrat) {
  const rows = [];
  if (contrat.status === 'propose') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cc_accept::${contrat.id}`).setLabel('✅ Valider le contrat').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cc_refuse::${contrat.id}`).setLabel('⛔ Refuser').setStyle(ButtonStyle.Danger),
    ));
  } else if (contrat.status === 'actif') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cc_assign::${contrat.id}`).setLabel('🎯 Assigner des agents').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cc_done::${contrat.id}`).setLabel('🏁 Mission réussie').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cc_fail::${contrat.id}`).setLabel('💀 Mission échouée').setStyle(ButtonStyle.Danger),
    ));
  }
  return rows; // vide si contrat clôturé
}

// ─── Briefing privé envoyé en DM aux agents ───
function buildBriefingEmbed(contrat) {
  const r = riskOf(contrat);
  const e = new EmbedBuilder()
    .setColor(r.couleur)
    .setTitle(`🗡️ BRIEFING — Contrat ${contrat.id}`)
    .setDescription('*Tu es assigné à ce contrat. Discrétion absolue. Ce message ne sort pas de tes mains.*')
    .addFields(
      { name: '🎯 Type de mission', value: `${emojiType(contrat.typeMission)} ${contrat.typeMission || '—'}`, inline: true },
      { name: '⚠️ Risque', value: `${r.emoji} ${r.label}`, inline: true },
      { name: '📅 Échéance', value: contrat.dateEcheance ? fmtDate(contrat.dateEcheance) : 'Aucune', inline: true },
      { name: '👤 Commanditaire', value: contrat.commanditaire ? contrat.commanditaire : '🕶️ Anonyme', inline: false },
      { name: '📋 Objet', value: contrat.objet || '—', inline: false },
      { name: '💰 Prime', value: `${contrat.remuneration || '—'} *(prime ${r.prime})*`, inline: false },
    )
    .setFooter({ text: 'La Confrérie • Briefing confidentiel' });
  if (contrat.details) e.addFields({ name: '📝 Consignes', value: contrat.details.slice(0, 1000) });
  return e;
}

async function envoyerBriefings(guild, contrat) {
  for (const userId of (contrat.agents || [])) {
    try {
      const m = await guild.members.fetch(userId).catch(() => null);
      if (m) await m.send({ embeds: [buildBriefingEmbed(contrat)] }).catch(() => {});
    } catch {}
  }
}

// ─── Mise à jour de la fiche déjà postée ───
async function rafraichirFiche(guild, contrat) {
  if (!contrat.channelId || !contrat.msgId) return;
  const ch = await fetchCh(guild, contrat.channelId);
  if (!ch) return;
  const msg = await ch.messages.fetch(contrat.msgId).catch(() => null);
  if (!msg) return;
  await msg.edit({ embeds: [buildContratEmbed(contrat)], components: buildContratButtons(contrat) }).catch(() => {});
}

// ─── Notion (réutilise la synchro existante d'index.js) ───
function syncNotion(contrat, statutTexte) {
  try {
    if (typeof global._syncContratNotion === 'function') {
      // compat champs : la synchro lit clientNom/employeurNom + emetteurIC
      contrat.clientNom = contrat.commanditaire || 'Anonyme';
      global._syncContratNotion(contrat, statutTexte).catch(() => {});
    }
  } catch {}
}

// ─── Archivage dans #contrats-reponses ───
async function archiver(guild, contrat) {
  const ch = await fetchCh(guild, CH_CONTRATS_REPONSES);
  if (!ch) return;
  await ch.send({ embeds: [buildContratEmbed(contrat)] }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// PANNEAU
// ═══════════════════════════════════════════════════════════════
async function postPanel(channel) {
  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('🐺 CONTRATS — LA CONFRÉRIE')
    .setDescription([
      '*Ici se négocient les contrats de la Confrérie. Discrétion absolue.*',
      '',
      '**Fonctionnement :**',
      '→ La Direction crée un contrat (type, risque, prime, échéance).',
      '→ Le contrat est validé, puis des **agents** y sont assignés.',
      '→ Chaque agent reçoit son **briefing en privé**.',
      '→ La mission est clôturée : **réussie** ou **échouée**.',
      '',
      '*Un commanditaire laissé vide = contrat **anonyme & confidentiel**.*',
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • Secrétariat clandestin' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cc_new').setLabel('📋 Nouveau contrat').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cc_mine').setLabel('🗂️ Mes contrats').setStyle(ButtonStyle.Secondary),
  );
  return channel.send({ embeds: [embed], components: [row] });
}

// ═══════════════════════════════════════════════════════════════
// CRÉATION — type → risque → modal
// ═══════════════════════════════════════════════════════════════
async function onNew(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('cc_type')
    .setPlaceholder('Type de mission...')
    .addOptions(TYPES_MISSION.map(t => ({ label: t.label, value: t.value, emoji: t.emoji })));
  return interaction.reply({ content: '🎯 **Type de mission ?**', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
}
async function onTypeSelect(interaction) {
  const type = interaction.values[0];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cc_risk::${type}`)
    .setPlaceholder('Niveau de risque...')
    .addOptions(
      { label: 'Discret', value: 'discret', emoji: '🟢', description: 'Prime standard' },
      { label: 'Risqué', value: 'risque', emoji: '🟠', description: 'Prime majorée' },
      { label: 'Sanglant', value: 'sanglant', emoji: '🔴', description: 'Prime maximale (prime de sang)' },
    );
  return interaction.update({ content: `🎯 Mission : **${type}**\n⚠️ **Niveau de risque ?**`, components: [new ActionRowBuilder().addComponents(menu)] });
}
async function onRiskSelect(interaction) {
  const type = interaction.customId.split('::')[1] || 'Autre';
  const risk = interaction.values[0];
  const modal = new ModalBuilder().setCustomId(`cc_modal::${type}::${risk}`).setTitle('🐺 Nouveau contrat — Confrérie');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('commanditaire').setLabel('Commanditaire (vide = anonyme)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Laisse vide pour un contrat anonyme & confidentiel')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: récupérer la cargaison volée à Valentine...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Prime / Rémunération').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 2000$ + part du butin')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('echeance').setLabel('Échéance (JJ/MM/AAAA) — optionnel').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 30/08/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Consignes / détails').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900).setPlaceholder('Lieu, cible, méthode, contacts, infos utiles...')),
  );
  return interaction.showModal(modal);
}
async function onModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const parts = interaction.customId.split('::');
  const typeMission = parts[1] || 'Autre';
  const risque = parts[2] || 'discret';
  const db = loadDB();
  if (!db.contrats) db.contrats = [];

  const commanditaire = (interaction.fields.getTextInputValue('commanditaire') || '').trim();
  const confidentiel = commanditaire.length === 0; // anonyme ⇒ confidentiel
  const emetteurIC = db.members?.[interaction.user.id]?.name || interaction.user.username;

  const contrat = {
    id: genId(),
    cc: true,
    typeMission,
    type: 'confrerie',
    risque,
    commanditaire,
    confidentiel,
    objet: interaction.fields.getTextInputValue('objet'),
    remuneration: interaction.fields.getTextInputValue('remuneration'),
    dateEcheance: parseDateFR(interaction.fields.getTextInputValue('echeance')),
    details: (interaction.fields.getTextInputValue('details') || '').trim(),
    agents: [],
    emetteurId: interaction.user.id,
    emetteurNom: interaction.user.username,
    emetteurIC,
    status: 'propose',
    createdAt: new Date().toISOString(),
  };
  db.contrats.push(contrat);
  saveDB(db);
  syncNotion(contrat, '🟡 Proposé');

  const ch = await fetchCh(interaction.guild, CH_CONTRATS);
  if (!ch) { await interaction.editReply({ content: '⚠️ Contrat enregistré, mais le salon #contrats est introuvable.' }); return; }
  const sent = await ch.send({
    content: `${directionMention(interaction.guild)} — 🐺 Nouveau contrat à valider.`,
    embeds: [buildContratEmbed(contrat)],
    components: buildContratButtons(contrat),
  });
  contrat.msgId = sent.id;
  contrat.channelId = ch.id;
  saveDB(db);
  await interaction.editReply({ content: `✅ Contrat **${contrat.id}** créé${confidentiel ? ' *(anonyme & confidentiel)*' : ''}.` });
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION / REFUS
// ═══════════════════════════════════════════════════════════════
async function onAccept(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'propose') return interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral });
  c.status = 'actif';
  c.acceptedAt = new Date().toISOString();
  c.acceptePar = db.members?.[interaction.user.id]?.name || interaction.user.username;
  saveDB(db);
  syncNotion(c, '🟢 En cours');
  await interaction.update({ embeds: [buildContratEmbed(c)], components: buildContratButtons(c) });
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle(`🟢 Contrat validé — ${c.id}`).setDescription(`**${c.typeMission}** · validé par ${c.acceptePar}`).setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()] }).catch(() => {});
}
async function onRefuse(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'propose') return interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral });
  c.status = 'refuse';
  c.closedAt = new Date().toISOString();
  saveDB(db);
  syncNotion(c, '⛔ Refusé');
  await interaction.update({ embeds: [buildContratEmbed(c)], components: [] });
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNATION D'AGENTS (+ briefing DM)
// ═══════════════════════════════════════════════════════════════
async function onAssign(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'actif') return interaction.reply({ content: '❌ Contrat introuvable ou non actif.', flags: MessageFlags.Ephemeral });
  const menu = new UserSelectMenuBuilder()
    .setCustomId(`cc_assign_go::${id}`)
    .setPlaceholder('Choisis les agents à assigner...')
    .setMinValues(1)
    .setMaxValues(10);
  return interaction.reply({ content: `🎯 **Assignation — contrat ${id}**\nSélectionne les agents (ils recevront leur briefing en DM).`, components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
}
async function onAssignGo(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.update({ content: '❌ Contrat introuvable.', components: [] });
  c.agents = Array.from(new Set([...(c.agents || []), ...interaction.values]));
  saveDB(db);
  await interaction.update({ content: `✅ ${interaction.values.length} agent(s) assigné(s) au contrat **${id}**. Briefings envoyés.`, components: [] });
  await envoyerBriefings(interaction.guild, c);
  await rafraichirFiche(interaction.guild, c);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🎯 Agents assignés — ${c.id}`).setDescription(`${c.agents.map(a => `<@${a}>`).join(', ')}`).setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()] }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// FIN DE MISSION
// ═══════════════════════════════════════════════════════════════
async function cloturer(interaction, succes) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'actif') return interaction.reply({ content: '❌ Contrat introuvable ou non actif.', flags: MessageFlags.Ephemeral });
  c.status = succes ? 'reussie' : 'echouee';
  c.closedAt = new Date().toISOString();
  c.clôturePar = db.members?.[interaction.user.id]?.name || interaction.user.username;
  saveDB(db);
  syncNotion(c, succes ? '✅ Réussie' : '💀 Échouée');
  await interaction.update({ embeds: [buildContratEmbed(c)], components: [] });
  await archiver(interaction.guild, c);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(succes ? 0x57F287 : 0xED4245).setTitle(`${succes ? '✅' : '💀'} Contrat ${succes ? 'réussi' : 'échoué'} — ${c.id}`).setDescription(`**${c.typeMission}** · clôturé par ${c.clôturePar}`).setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()] }).catch(() => {});
  // prévenir les agents
  for (const userId of (c.agents || [])) {
    try { const m = await interaction.guild.members.fetch(userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(succes ? 0x57F287 : 0xED4245).setTitle(`${succes ? '✅ Mission accomplie' : '💀 Mission échouée'} — ${c.id}`).setDescription(succes ? 'Beau travail. La Confrérie n\'oublie pas les siens.' : 'La mission a échoué. On en tire les leçons.').setFooter({ text: 'La Confrérie' })] }).catch(() => {}); } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════
// MES CONTRATS
// ═══════════════════════════════════════════════════════════════
async function onMine(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const uid = interaction.user.id;
  const mine = (db.contrats || []).filter(c => c.cc && (c.emetteurId === uid || (c.agents || []).includes(uid)));
  if (!mine.length) return interaction.editReply({ content: '🗂️ Aucun contrat à ton nom pour l\'instant.' });
  const actifs = mine.filter(c => c.status === 'actif' || c.status === 'propose');
  const clos = mine.filter(c => ['reussie', 'echouee', 'refuse'].includes(c.status)).slice(-8);
  const ligne = c => `${(STATUTS[c.status] || STATUTS.propose).label} \`${c.id}\` — ${emojiType(c.typeMission)} ${c.typeMission}${c.dateEcheance ? ` · ⏳ ${fmtDate(c.dateEcheance)}` : ''}`;
  const e = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🗂️ Mes contrats — La Confrérie')
    .addFields(
      { name: `🟢 En cours / proposés (${actifs.length})`, value: actifs.length ? actifs.map(ligne).join('\n') : '*Aucun*', inline: false },
      { name: `📁 Clôturés récents (${clos.length})`, value: clos.length ? clos.map(ligne).join('\n') : '*Aucun*', inline: false },
    ).setFooter({ text: 'La Confrérie • Contrats' });
  return interaction.editReply({ embeds: [e] });
}

// ═══════════════════════════════════════════════════════════════
// RAPPELS D'ÉCHÉANCE (J-3, J-1, dépassement) — à appeler toutes les heures
// ═══════════════════════════════════════════════════════════════
async function checkEcheances(guild) {
  try {
    const db = loadDB();
    if (!db.contrats?.length) return;
    let changed = false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const jc = journalCh(guild);
    if (!jc) return;
    for (const c of db.contrats) {
      if (!c.cc || c.status !== 'actif' || !c.dateEcheance) continue;
      const d = new Date(c.dateEcheance + 'T00:00:00');
      if (isNaN(d.getTime())) continue;
      const jours = Math.round((d - today) / 86400000);
      const ping = [directionMention(guild), ...(c.agents || []).map(a => `<@${a}>`)].filter(Boolean).join(' ');
      const envoyer = (titre, couleur, txt) => jc.send({ content: ping || undefined, embeds: [new EmbedBuilder().setColor(couleur).setTitle(titre).setDescription(txt).addFields({ name: '🎯 Mission', value: `${emojiType(c.typeMission)} ${c.typeMission}`, inline: true }, { name: '📅 Échéance', value: fmtDate(c.dateEcheance), inline: true }).setFooter({ text: 'La Confrérie • Rappel d\'échéance' })] }).catch(() => {});
      if (jours < 0 && !c.relanceDepasse) {
        await envoyer(`🔴 Contrat DÉPASSÉ — ${c.id}`, 0x8B1A1A, `L'échéance du contrat **${c.id}** est **dépassée**. À clôturer ou relancer.`);
        c.relanceDepasse = true; changed = true;
      } else if (jours === 1 && !c.relance1j) {
        await envoyer(`🟠 Échéance demain — ${c.id}`, 0xE67E22, `Le contrat **${c.id}** arrive à échéance **demain**.`);
        c.relance1j = true; changed = true;
      } else if (jours <= 3 && jours > 1 && !c.relance3j) {
        await envoyer(`🟡 Échéance dans ${jours}j — ${c.id}`, 0xF1C40F, `Le contrat **${c.id}** arrive à échéance dans **${jours} jours**.`);
        c.relance3j = true; changed = true;
      }
    }
    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkEcheances error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// ROUTEUR D'INTERACTIONS — renvoie true si l'interaction a été gérée
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'contrat-panel') {
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      await postPanel(interaction.channel);
      await interaction.reply({ content: '✅ Panneau des contrats publié.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.isButton?.()) {
      const id = interaction.customId;
      if (id === 'cc_new') { await onNew(interaction); return true; }
      if (id === 'cc_mine') { await onMine(interaction); return true; }
      if (id.startsWith('cc_accept::')) { await onAccept(interaction); return true; }
      if (id.startsWith('cc_refuse::')) { await onRefuse(interaction); return true; }
      if (id.startsWith('cc_assign::')) { await onAssign(interaction); return true; }
      if (id.startsWith('cc_done::')) { await cloturer(interaction, true); return true; }
      if (id.startsWith('cc_fail::')) { await cloturer(interaction, false); return true; }
    }
    if (interaction.isStringSelectMenu?.()) {
      if (interaction.customId === 'cc_type') { await onTypeSelect(interaction); return true; }
      if (interaction.customId.startsWith('cc_risk::')) { await onRiskSelect(interaction); return true; }
    }
    if (interaction.isUserSelectMenu?.()) {
      if (interaction.customId.startsWith('cc_assign_go::')) { await onAssignGo(interaction); return true; }
    }
    if (interaction.isModalSubmit?.()) {
      if (interaction.customId.startsWith('cc_modal::')) { await onModalSubmit(interaction); return true; }
    }
  } catch (e) {
    console.log('❌ contrats-confrerie routeInteraction error:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
  return false;
}

module.exports = { routeInteraction, checkEcheances, postPanel };

/* ═══════════════════════════════════════════════════════════════
   BRANCHEMENT DANS index.js (3 ajouts) :

   1) En haut du fichier, avec les autres require :
        const contratsConf = require('./contrats-confrerie');

   2) Tout en haut du handler d'interactions
      (juste après la ligne  client.on('interactionCreate', async interaction => {  ) :
        if (await contratsConf.routeInteraction(interaction)) return;

   3) Dans le cron horaire  cron.schedule('0 * * * *', ...)  :
        for (const g of client.guilds.cache.values()) await contratsConf.checkEcheances(g).catch(() => {});

   4) (commande) Ajouter dans le tableau des SlashCommandBuilder :
        new SlashCommandBuilder().setName('contrat-panel').setDescription('📋 Publier le panneau des contrats (Direction)'),
   ═══════════════════════════════════════════════════════════════ */
