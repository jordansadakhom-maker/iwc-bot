// ═══════════════════════════════════════════════════════════════
// traque.js — Avis de recherche / chasse à l'homme (mercenaires IWC)
// Créer une cible, signaler des pistes, rejoindre la traque comme
// chasseur, clôturer (capturée / éliminée / abandonnée) + prime.
// Branchement index.js : require + traqueCommands + routeInteraction.
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, SlashCommandBuilder, MessageFlags,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

const CH_JOURNAL = '1508756535407542372';
const RESP_ROLES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Instructeur'];

const STATUTS = {
  chasse:     { label: '🟠 En chasse',   couleur: 0xE67E22 },
  reperee:    { label: '🔵 Repérée',     couleur: 0x3498DB },
  capturee:   { label: '✅ Capturée',    couleur: 0x57F287 },
  eliminee:   { label: '💀 Éliminée',    couleur: 0xED4245 },
  abandonnee: { label: '⚫ Abandonnée',  couleur: 0x555555 },
};
const DANGER = {
  faible: '🟢 Faible', moyen: '🟡 Moyen', eleve: '🟠 Élevé', extreme: '🔴 Extrême',
};

const traqueCommands = [
  new SlashCommandBuilder().setName('avis-recherche').setDescription('🎯 Lancer un avis de recherche (traque une cible)'),
  new SlashCommandBuilder().setName('traques').setDescription('🎯 Voir les avis de recherche en cours'),
];

// ─── Helpers ───
function estResponsable(member) {
  return !!member?.roles?.cache?.some(r => RESP_ROLES.some(n => r.name.includes(n)));
}
function journalCh(guild) {
  if (typeof global.getJournalCh === 'function') { try { const c = global.getJournalCh(guild); if (c) return c; } catch {} }
  return guild.channels.cache.get(CH_JOURNAL) || null;
}
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR'); }
function findTraque(db, id) { return (db.traques || []).find(t => t.id === id); }
function dangerLabel(v) { return DANGER[v] || '🟡 Moyen'; }

// ─── Affichage de l'avis (poster) ───
function buildPoster(t) {
  const st = STATUTS[t.status] || STATUTS.chasse;
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  const chasseurs = (t.chasseurs || []).length ? t.chasseurs.map(id => `<@${id}>`).join(', ') : '*Aucun chasseur assigné*';
  const pistes = (t.pistes || []).slice(-5).reverse();
  const pistesTxt = pistes.length
    ? pistes.map(p => `• ${fmtDate(p.at)} — ${p.lieu ? `📍 **${p.lieu}** · ` : ''}${p.info || ''}${p.par ? ` _(${p.par})_` : ''}`).join('\n').slice(0, 1024)
    : '*Aucune piste signalée.*';
  const e = new EmbedBuilder()
    .setColor(st.couleur)
    .setTitle(`🎯 AVIS DE RECHERCHE — ${t.cible}`)
    .setDescription(t.signalement ? `*${String(t.signalement).slice(0, 500)}*` : '*Pas de signalement.*')
    .addFields(
      { name: '📍 Dernière position', value: t.position || '—', inline: true },
      { name: '⚠️ Dangerosité', value: dangerLabel(t.dangerosite), inline: true },
      { name: '💰 Prime', value: t.prime || '—', inline: true },
      { name: '👤 Commanditaire', value: t.commanditaire || '—', inline: true },
      { name: '🎯 Consigne', value: t.vivantMort || 'Indifférent', inline: true },
      { name: '📌 Statut', value: st.label, inline: true },
      { name: '🤠 Chasseurs', value: chasseurs, inline: false },
      { name: `🧭 Pistes (${(t.pistes || []).length})`, value: pistesTxt, inline: false },
    )
    .setFooter({ text: `IWC • Avis ${t.id}${closed && t.resultat ? ' • ' + t.resultat : ''}` });
  if (t.createdAt) e.setTimestamp(new Date(t.createdAt));
  return e;
}
function buildBoutons(t) {
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  if (closed) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`traque_noop::${t.id}`).setLabel('Traque clôturée').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true),
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_piste::${t.id}`).setLabel('Signaler une piste').setEmoji('🧭').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`traque_chasseur::${t.id}`).setLabel('Rejoindre la traque').setEmoji('🤠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`traque_cloturer::${t.id}`).setLabel('Clôturer').setEmoji('✅').setStyle(ButtonStyle.Danger),
  )];
}

// ─── Mise à jour du message d'origine ───
async function rafraichir(guild, t) {
  if (!t.messageId || !t.channelId) return;
  try {
    const ch = await guild.channels.fetch(t.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(t.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [buildPoster(t)], components: buildBoutons(t) }).catch(() => {});
  } catch {}
}

// ─── Création : modal ───
function modalCreation() {
  const m = new ModalBuilder().setCustomId('traque_create_modal').setTitle('🎯 Nouvel avis de recherche');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Cible (nom / identité)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex : Cole Bradford, le contrebandier')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('signalement').setLabel('Signalement (description, délit)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Apparence, méfaits, raison de la traque...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('position').setLabel('Dernière position connue').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Armadillo, Tumbleweed, Fort Mercer, Rio Bravo...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prime').setLabel('Prime + dangerosité').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : 500 $ · élevé  (faible/moyen/élevé/extrême)')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('infos').setLabel('Commanditaire + vivant/mort').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : Shérif de Armadillo · Vivant de préférence')),
  );
  return m;
}
function parseDanger(txt) {
  const s = String(txt || '').toLowerCase();
  if (s.includes('extr')) return 'extreme';
  if (s.includes('élev') || s.includes('elev') || s.includes('haut')) return 'eleve';
  if (s.includes('faible') || s.includes('bas')) return 'faible';
  return 'moyen';
}

async function handleCreateModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const cible = interaction.fields.getTextInputValue('cible').trim();
  const primeRaw = interaction.fields.getTextInputValue('prime') || '';
  const infosRaw = interaction.fields.getTextInputValue('infos') || '';
  const prime = primeRaw.split(/[·|]/)[0].trim() || '—';
  const dangerosite = parseDanger(primeRaw);
  const commanditaire = infosRaw.split(/[·|]/)[0].trim() || '—';
  const vivantMort = (infosRaw.split(/[·|]/)[1] || '').trim() || 'Indifférent';
  const t = {
    id: 'AR-' + Date.now().toString().slice(-5),
    cible,
    signalement: interaction.fields.getTextInputValue('signalement') || '',
    position: (interaction.fields.getTextInputValue('position') || '').trim() || '—',
    prime, dangerosite, commanditaire, vivantMort,
    status: 'chasse',
    chasseurs: [], pistes: [],
    createdAt: new Date().toISOString(),
    createdBy: interaction.user.username,
    channelId: interaction.channelId,
  };
  const db = loadDB();
  if (!db.traques) db.traques = [];
  const sent = await interaction.channel.send({ embeds: [buildPoster(t)], components: buildBoutons(t) }).catch(() => null);
  if (sent) t.messageId = sent.id;
  db.traques.push(t); saveDB(db);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0xE67E22).setTitle(`🎯 Avis de recherche lancé — ${t.cible}`).setDescription(`Prime : **${t.prime}** · Dangerosité : ${dangerLabel(t.dangerosite)}\nLancé par ${t.createdBy}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});
  await interaction.editReply({ content: `✅ Avis de recherche **${t.id}** publié pour **${cible}**.` });
}

// ─── Piste : modal ───
async function handlePisteButton(interaction) {
  const id = interaction.customId.split('::')[1];
  const m = new ModalBuilder().setCustomId(`traque_piste_modal::${id}`).setTitle('🧭 Signaler une piste');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu (où la cible a été vue)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : saloon de Tumbleweed')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel('Info / détails').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400).setPlaceholder('Ce que tu as vu, entendu, appris...')),
  );
  return interaction.showModal(m);
}
async function handlePisteModal(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  if (!Array.isArray(t.pistes)) t.pistes = [];
  t.pistes.push({ lieu: (interaction.fields.getTextInputValue('lieu') || '').trim(), info: interaction.fields.getTextInputValue('info').trim(), par: interaction.user.username, at: new Date().toISOString() });
  saveDB(db);
  await rafraichir(interaction.guild, t);
  return interaction.reply({ content: '✅ Piste enregistrée. Merci, chasseur.', flags: MessageFlags.Ephemeral });
}

// ─── Rejoindre la traque ───
async function handleChasseurButton(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  if (!Array.isArray(t.chasseurs)) t.chasseurs = [];
  const dejaLa = t.chasseurs.includes(interaction.user.id);
  if (dejaLa) t.chasseurs = t.chasseurs.filter(x => x !== interaction.user.id);
  else t.chasseurs.push(interaction.user.id);
  saveDB(db);
  await rafraichir(interaction.guild, t);
  return interaction.reply({ content: dejaLa ? '↩️ Tu t\'es retiré de la traque.' : '🤠 Tu as rejoint la traque !', flags: MessageFlags.Ephemeral });
}

// ─── Clôture ───
async function handleCloturerButton(interaction) {
  if (!estResponsable(interaction.member)) return interaction.reply({ content: '❌ Seul un responsable peut clôturer un avis.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`traque_cloture_select::${id}`).setPlaceholder('Résultat de la traque...').addOptions(
      { label: 'Capturée', value: 'capturee', emoji: '✅', description: 'Cible capturée vivante' },
      { label: 'Éliminée', value: 'eliminee', emoji: '💀', description: 'Cible éliminée' },
      { label: 'Abandonnée', value: 'abandonnee', emoji: '⚫', description: 'Traque abandonnée' },
    ),
  );
  return interaction.reply({ content: `Clôture de l'avis **${id}** — choisis le résultat :`, components: [row], flags: MessageFlags.Ephemeral });
}
async function handleClotureSelect(interaction) {
  const id = interaction.customId.split('::')[1];
  const choix = interaction.values[0];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.update({ content: '❌ Avis introuvable.', components: [] });
  t.status = choix;
  t.closedAt = new Date().toISOString();
  t.resultat = (STATUTS[choix] || {}).label || choix;
  const prime = choix === 'capturee' || choix === 'eliminee' ? t.prime : null;
  saveDB(db);
  await rafraichir(interaction.guild, t);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor((STATUTS[choix] || {}).couleur || 0x555555).setTitle(`🎯 Avis clôturé — ${t.cible}`).setDescription(`Résultat : **${t.resultat}**${prime ? `\n💰 Prime à verser : **${prime}**` : ''}\nChasseurs : ${(t.chasseurs || []).map(x => `<@${x}>`).join(', ') || '—'}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});
  return interaction.update({ content: `✅ Avis **${id}** clôturé : ${t.resultat}.${prime ? ` Pense à verser la prime (${prime}) aux chasseurs via ton système d'économie.` : ''}`, components: [] });
}

// ─── Liste des traques en cours ───
async function handleListe(interaction) {
  const db = loadDB();
  const actifs = (db.traques || []).filter(t => ['chasse', 'reperee'].includes(t.status));
  const e = new EmbedBuilder().setColor(0xE67E22).setTitle('🎯 Avis de recherche en cours').setFooter({ text: `IWC • ${actifs.length} traque(s) active(s)` });
  if (!actifs.length) e.setDescription('*Aucune traque en cours.*');
  else e.setDescription(actifs.slice(0, 20).map(t => {
    const st = STATUTS[t.status] || STATUTS.chasse;
    return `${st.label} \`${t.id}\` — **${t.cible}** · 📍 ${t.position} · 💰 ${t.prime} · 🤠 ${(t.chasseurs || []).length}`;
  }).join('\n').slice(0, 4000));
  return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}

// ─── Routage ───
async function routeInteraction(interaction) {
  if (interaction.isChatInputCommand?.()) {
    if (interaction.commandName === 'avis-recherche') {
      if (!estResponsable(interaction.member)) { await interaction.reply({ content: '❌ Lancer un avis de recherche est réservé aux responsables.', flags: MessageFlags.Ephemeral }); return true; }
      await interaction.showModal(modalCreation());
      return true;
    }
    if (interaction.commandName === 'traques') { await handleListe(interaction); return true; }
  }
  if (interaction.isButton?.()) {
    const cid = interaction.customId || '';
    if (cid.startsWith('traque_piste::'))     { await handlePisteButton(interaction); return true; }
    if (cid.startsWith('traque_chasseur::'))  { await handleChasseurButton(interaction); return true; }
    if (cid.startsWith('traque_cloturer::'))  { await handleCloturerButton(interaction); return true; }
    if (cid.startsWith('traque_noop::'))      { await interaction.deferUpdate().catch(() => {}); return true; }
  }
  if (interaction.isStringSelectMenu?.() && (interaction.customId || '').startsWith('traque_cloture_select::')) { await handleClotureSelect(interaction); return true; }
  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'traque_create_modal') { await handleCreateModal(interaction); return true; }
    if ((interaction.customId || '').startsWith('traque_piste_modal::')) { await handlePisteModal(interaction); return true; }
  }
  return false;
}

module.exports = { traqueCommands, routeInteraction };
