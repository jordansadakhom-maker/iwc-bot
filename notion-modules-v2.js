// ═══════════════════════════════════════════════════════════════
// notion-modules-v2.js — Trésorerie · Journal IC · Dashboard · Archives · Fiches
// IWC Bot v3.4
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');
const notionExtra = require('./notion-extra');

const NOTION_VERSION = '2022-06-28';

// ═══════════════════════════════════════════════════════════════
// 1. TRÉSORERIE — FLOW 3 ÉTAPES
// ═══════════════════════════════════════════════════════════════

// Détecter le pôle du membre pour sécuriser l'accès aux coffres
function _getPole(member) {
  if (!member) return 'both';
  const roles = member.roles?.cache;
  if (!roles) return 'both';
  // Rôles illégaux connus
  const illegalRoleNames = ['Concepteur', 'Fléau', 'Exécuteur', 'Condamné', 'Maudit', 'Confrérie', 'Ombre'];
  // Rôles légaux connus
  const legalRoleNames   = ['Conseil', 'Directeur', 'Officier', 'Agent', 'Opérateur', 'Recrue', 'Iron Wolf', 'Fondateur'];
  const hasIllegal = roles.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const hasLegal   = roles.some(r => legalRoleNames.some(n => r.name.includes(n)));
  if (hasIllegal && !hasLegal) return 'illegal';
  if (hasLegal   && !hasIllegal) return 'legal';
  return 'both'; // fondateur ou double rôle
}

async function handleTresorCommand(interaction) {
  await interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('💰 Nouvelle Transaction')
      .setDescription('**Étape 1/3** — Quel type de mouvement ?')
      .setFooter({ text: 'IWC • Trésorerie' })
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('tresor_type_entree').setLabel('📈 Entrée').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('tresor_type_sortie').setLabel('📉 Sortie').setStyle(ButtonStyle.Danger),
    )],
  });
}

async function handleTresorFlow(interaction) {
  const id = interaction.customId;

  if (id === 'tresor_type_entree' || id === 'tresor_type_sortie') {
    const type      = id === 'tresor_type_entree' ? 'entree' : 'sortie';
    const typeLabel = type === 'entree' ? '📈 Entrée' : '📉 Sortie';
    const pole      = _getPole(interaction.member);

    // Sécurité stricte : un membre légal ne voit PAS le coffre illégal
    const buttons = [];
    if (pole === 'legal' || pole === 'both') {
      buttons.push(new ButtonBuilder().setCustomId(`tresor_coffre_legal_${type}`).setLabel('⚖️ Coffre Légal').setStyle(ButtonStyle.Primary));
    }
    if (pole === 'illegal' || pole === 'both') {
      buttons.push(new ButtonBuilder().setCustomId(`tresor_coffre_illegal_${type}`).setLabel('🔒 Coffre Illégal').setStyle(ButtonStyle.Secondary));
    }
    if (buttons.length === 0) {
      return interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Accès refusé').setDescription("Tu n'as pas accès à un coffre.")], components: [] });
    }

    return interaction.update({
      embeds: [new EmbedBuilder()
        .setColor(type === 'entree' ? 0x57F287 : 0xED4245)
        .setTitle(`💰 Nouvelle Transaction — ${typeLabel}`)
        .setDescription('**Étape 2/3** — Quel coffre ?')
        .setFooter({ text: 'IWC • Trésorerie' })
      ],
      components: [new ActionRowBuilder().addComponents(...buttons)],
    });
  }

  if (id.startsWith('tresor_coffre_')) {
    const parts  = id.split('_');
    const coffre = parts[2];
    const type   = parts[3];
    const modal  = new ModalBuilder()
      .setCustomId(`modal_tresor_${type}_${coffre}`)
      .setTitle(`💰 ${type === 'entree' ? 'Entrée' : 'Sortie'} — ${coffre === 'legal' ? 'Coffre Légal' : 'Coffre Illégal'}`);
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant ($)').setPlaceholder('Ex : 5000').setStyle(TextInputStyle.Short).setRequired(true)),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet / Description').setPlaceholder('Ex : Paiement mission Paleto Bay').setStyle(TextInputStyle.Short).setRequired(true)),
    );
    return interaction.showModal(modal);
  }
}

/**
 * FIX TIMEOUT : utiliser deferUpdate() + followUp() au lieu de deferReply()
 * deferReply() sur un modal crée un conflit avec l'interaction originale → timeout
 */
async function handleTresorModal(interaction) {
  await interaction.deferUpdate().catch(() => {});

  const parts    = interaction.customId.split('_');
  const typeRaw   = parts[2];
  const coffreRaw = parts[3];

  const montant = parseInt(interaction.fields.getTextInputValue('montant').replace(/[^0-9]/g, ''), 10);
  const objet   = interaction.fields.getTextInputValue('objet').trim();

  if (isNaN(montant) || montant <= 0) {
    return interaction.followUp({ content: '❌ Montant invalide.', ephemeral: true });
  }

  const type   = typeRaw   === 'entree'  ? 'Entrée'  : 'Sortie';
  const coffre = coffreRaw === 'illegal' ? 'Illégal' : 'Légal';
  const key    = coffreRaw === 'illegal' ? 'illegal' : 'legal';

  const db = loadDB();
  if (!db.coffres) db.coffres = { legal: 0, illegal: 0 };
  if (type === 'Entrée') db.coffres[key] += montant;
  else                   db.coffres[key] = Math.max(0, db.coffres[key] - montant);
  const nouveauSolde = db.coffres[key];
  saveDB(db);

  // Archive Notion directe (sans passer par notion-extra qui peut ne pas avoir la config)
  _archiverTransactionNotion({ objet, type, coffre, montant, solde: nouveauSolde, responsable: interaction.user.username, date: new Date().toISOString() }).catch(() => {});

  // Journal IC
  _ajouterJournalIC(interaction.guild, {
    type: 'tresorerie', emoji: type === 'Entrée' ? '💵' : '💸',
    titre: `${type} — Coffre ${coffre}`,
    description: `**${objet}** · $${montant.toLocaleString('fr-FR')} · par ${interaction.user.username}`,
    auteur: interaction.user.username,
  }).catch(() => {});

  // Post public dans le salon coffre correspondant
  // Noms exacts Discord : coffre-entreprise (légal) et coffre-illegal (illégal)
  const clean    = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const cibleNom = coffre === 'Légal' ? 'coffre-entreprise' : 'coffre-illegal';
  const coffreCh = interaction.guild.channels.cache.find(c => clean(c.name || '').includes(clean(cibleNom)));

  if (coffreCh) {
    const isEntree = type === 'Entrée';
    const color    = isEntree ? 0x57F287 : 0xED4245;
    const arrow    = isEntree ? '📈' : '📉';
    const line     = '─────────────────────────────────';

    const sentMsg = await coffreCh.send({ embeds: [new EmbedBuilder()
      .setColor(color)
      .setAuthor({ name: `${coffre === 'Légal' ? '⚖️ Iron Wolf Company' : '🔒 La Confrérie'} • Trésorerie`, iconURL: interaction.guild.iconURL() || undefined })
      .setTitle(`${arrow} ${type.toUpperCase()} — $${montant.toLocaleString('fr-FR')}`)
      .setDescription(`\`\`\`\n${line}\n  ${coffre === 'Légal' ? '⚖️ COFFRE LÉGAL' : '🔒 COFFRE ILLÉGAL'}\n${line}\n\`\`\``)
      .addFields(
        { name: '📋 Objet',          value: objet,                                               inline: true },
        { name: '👤 Responsable',    value: interaction.user.username,                           inline: true },
        { name: '\u200b',            value: '\u200b',                                            inline: true },
        { name: `${isEntree ? '📥' : '📤'} Mouvement`, value: `**${isEntree ? '+' : '-'}$${montant.toLocaleString('fr-FR')}**`, inline: true },
        { name: '💰 Solde actuel',   value: `**$${nouveauSolde.toLocaleString('fr-FR')}**`,      inline: true },
        { name: '\u200b',            value: '\u200b',                                            inline: true },
      )
      .setFooter({ text: `IWC • ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}` })
      .setTimestamp()
    ] }).catch(() => null);
    // Auto-suppression après 45 secondes — le salon reste propre
    if (sentMsg) setTimeout(() => sentMsg.delete().catch(() => {}), 45000);
  }

  await interaction.followUp({ content: `✅ Transaction enregistrée — Solde **${coffre}** : **$${nouveauSolde.toLocaleString('fr-FR')}**`, ephemeral: true });
}

async function setupTresorButton(guild) {
  const ch = guild.channels.cache.find(c => c.name?.includes('coffre-entreprise'));
  if (!ch) return;
  const db = loadDB();

  // Récupérer tous les messages bot dans le salon
  let allBotMsgs = [];
  try {
    const msgs = await ch.messages.fetch({ limit: 100 });
    allBotMsgs = [...msgs.values()]
      .filter(m => m.author.id === guild.members.me?.id)
      .sort((a, b) => b.createdTimestamp - a.createdTimestamp);
  } catch {}

  // Séparer panels (avec boutons) des messages de transaction (sans boutons)
  const panels    = allBotMsgs.filter(m => m.components?.length > 0 && m.embeds?.length > 0);
  const nonPanels = allBotMsgs.filter(m => !(m.components?.length > 0));

  // Supprimer les messages de transaction orphelins qui ne se sont pas auto-supprimés
  for (const m of nonPanels) await m.delete().catch(() => {});

  // Supprimer les doublons de panels
  for (let i = 1; i < panels.length; i++) await panels[i].delete().catch(() => {});

  // Réutiliser ou recréer
  if (panels.length > 0) {
    try {
      await panels[0].edit({ embeds: [_tresorEmbed()], components: [_tresorRow()] });
      db.tresorButtonMsgId = panels[0].id;
      saveDB(db);
      return;
    } catch { await panels[0].delete().catch(() => {}); }
  }

  if (db.tresorButtonMsgId) {
    try {
      const existing = await ch.messages.fetch(db.tresorButtonMsgId);
      if (existing) { await existing.edit({ embeds: [_tresorEmbed()], components: [_tresorRow()] }); return; }
    } catch {}
  }

  const msg = await ch.send({ embeds: [_tresorEmbed()], components: [_tresorRow()] });
  db.tresorButtonMsgId = msg.id;
  saveDB(db);
}

function _tresorEmbed() {
  return new EmbedBuilder().setColor(0x8B1A1A).setTitle('💰 Trésorerie — Iron Wolf Company')
    .setDescription('Enregistrez chaque mouvement financier via le bouton ci-dessous.\nToute transaction est archivée automatiquement dans Notion.')
    .setFooter({ text: 'IWC • Trésorerie automatique' });
}
function _tresorRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_nouvelle_transaction').setLabel('💰 Nouvelle Transaction').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('btn_solde').setLabel('📊 Voir les soldes').setStyle(ButtonStyle.Secondary),
  );
}

async function handleSoldeButton(interaction) {
  const db = loadDB(); const legal = db.coffres?.legal || 0; const illegal = db.coffres?.illegal || 0;
  await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder()
    .setColor(0x8B1A1A).setTitle('📊 Soldes actuels — IWC')
    .addFields(
      { name: '⚖️ Coffre Légal',   value: `**$${legal.toLocaleString('fr-FR')}**`,            inline: true },
      { name: '🔒 Coffre Illégal', value: `**$${illegal.toLocaleString('fr-FR')}**`,           inline: true },
      { name: '💼 Total',          value: `**$${(legal + illegal).toLocaleString('fr-FR')}**`, inline: true },
    ).setFooter({ text: 'IWC • Données en temps réel' }).setTimestamp()
  ] });
}

// ═══════════════════════════════════════════════════════════════
// NOTION — Archive transaction directe
// ═══════════════════════════════════════════════════════════════
async function _archiverTransactionNotion({ objet, type, coffre, montant, solde, responsable, date }) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_TRESORERIE_DB) {
    console.log('⚠️ NOTION_TRESORERIE_DB non configuré — transaction non archivée dans Notion');
    return;
  }
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': '2022-06-28',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        parent: { database_id: process.env.NOTION_TRESORERIE_DB },
        properties: {
          'Objet':        { title:     [{ text: { content: objet || '—' } }] },
          'Type':         { select:    { name: type === 'Entrée' ? '📥 Entrée' : '📤 Sortie' } },
          'Coffre':       { select:    { name: coffre === 'Illégal' ? '🔒 Illégal' : '⚖️ Légal' } },
          'Montant':      { number:    montant },
          'Solde':        { number:    solde },
          'Responsable':  { rich_text: [{ text: { content: responsable || '—' } }] },
          'Date':         { date:      { start: date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } },
        },
      }),
    });
    const data = await res.json();
    if (data.object === 'error') { console.log('❌ Notion trésorerie error:', data.message); return; }
    console.log(`✅ Transaction archivée dans Notion : ${objet} — ${type} $${montant}`);
  } catch (e) { console.log('❌ _archiverTransactionNotion error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 2. JOURNAL IC
// ═══════════════════════════════════════════════════════════════

const JOURNAL_DB_KEY = 'journalIC';

async function _ajouterJournalIC(guild, entry) {
  const db = loadDB();
  if (!db[JOURNAL_DB_KEY]) db[JOURNAL_DB_KEY] = [];
  db[JOURNAL_DB_KEY].unshift({ id: Date.now().toString(), date: new Date().toISOString(), type: entry.type || 'autre', emoji: entry.emoji || '📝', titre: entry.titre || '—', description: entry.description || '—', auteur: entry.auteur || '—' });
  db[JOURNAL_DB_KEY] = db[JOURNAL_DB_KEY].slice(0, 200);
  saveDB(db);
  const ch = guild?.channels?.cache?.find(c => c.name?.includes('histoire') || c.name?.includes('journal'));
  if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(_journalColor(entry.type)).setTitle(`${entry.emoji} ${entry.titre}`).setDescription(entry.description).setFooter({ text: `IWC Journal • ${entry.auteur}` }).setTimestamp()] }).catch(() => {});
}

function _journalColor(type) {
  return { operation: 0xED4245, contrat: 0x5865F2, recrutement: 0x57F287, tresorerie: 0xFEE75C, promotion: 0xFF9A00, autre: 0x8B1A1A }[type] || 0x8B1A1A;
}

async function handleJournalCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const db = loadDB(); const journal = db[JOURNAL_DB_KEY] || [];
  const filtre = interaction.options?.getString('type') || 'all';
  const page   = Math.max(1, interaction.options?.getInteger('page') || 1);
  const perPage = 8;
  const filtered = filtre === 'all' ? journal : journal.filter(e => e.type === filtre);
  if (!filtered.length) return interaction.editReply({ content: '📭 Aucune entrée dans le journal pour ce filtre.' });
  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData   = filtered.slice((page - 1) * perPage, page * perPage);
  const lines = pageData.map(e => { const d = new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' }); return `${e.emoji} **${e.titre}**\n┗ ${e.description} — *${d}*`; }).join('\n\n');
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('📖 Journal IC — Iron Wolf Company').setDescription(lines || '*Aucune entrée*').setFooter({ text: `Page ${page}/${totalPages} · ${filtered.length} entrée(s) · IWC Journal` }).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`journal_prev_${filtre}_${page}`).setLabel('◀ Précédent').setStyle(ButtonStyle.Secondary).setDisabled(page <= 1), new ButtonBuilder().setCustomId(`journal_next_${filtre}_${page}`).setLabel('Suivant ▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages))] });
}

async function handleJournalPagination(interaction) {
  const parts = interaction.customId.split('_');
  const dir = parts[1]; const filtre = parts[2]; const page = parseInt(parts[3], 10);
  interaction.options = { getString: k => k === 'type' ? (filtre === 'all' ? null : filtre) : null, getInteger: k => k === 'page' ? (dir === 'next' ? page + 1 : page - 1) : 1 };
  await handleJournalCommand(interaction);
}

// ═══════════════════════════════════════════════════════════════
// 3. ARCHIVES CONTRATS
// ═══════════════════════════════════════════════════════════════

async function handleContratsArchives(interaction) {
  await interaction.deferReply({ ephemeral: true });
  const db = loadDB(); const statut = interaction.options?.getString('statut') || 'tous'; const page = Math.max(1, interaction.options?.getInteger('page') || 1); const perPage = 6;
  const contrats = db.contrats || [];
  const filtered = statut === 'tous' ? contrats : contrats.filter(c => { if (statut === 'actif') return c.status === 'signe'; if (statut === 'refuse') return c.status === 'refuse'; if (statut === 'expire') return c.status === 'expire' || (c.dateEcheance && new Date(c.dateEcheance) < new Date()); return true; });
  if (!filtered.length) return interaction.editReply({ content: `📭 Aucun contrat trouvé pour le filtre **${statut}**.` });
  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData   = filtered.sort((a, b) => new Date(b.signedAt || b.createdAt || 0) - new Date(a.signedAt || a.createdAt || 0)).slice((page - 1) * perPage, page * perPage);
  const statutEmoji = { signe: '✅', refuse: '❌', expire: '⏰', resilie: '🚫' };
  const fields = pageData.map(c => { const emoji = statutEmoji[c.status] || '📄'; const partner = c.clientNom || c.employeurNom || '—'; const echeance = c.dateEcheance ? ` · Éch. ${new Date(c.dateEcheance).toLocaleDateString('fr-FR')}` : ''; return { name: `${emoji} \`${c.id}\` — ${c.objet || '—'}`, value: `Partenaire : **${partner}** · Type : ${c.type === 'emploi' ? '📥 Employeur' : '📤 Prestation'}${echeance}\nSigné par : ${c.signedBy || c.signataire || '—'} · ${_fmtDate(c.signedAt)}`, inline: false }; });
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`📜 Archives Contrats — ${statut.charAt(0).toUpperCase() + statut.slice(1)}`).addFields(fields).setFooter({ text: `Page ${page}/${totalPages} · ${filtered.length} contrat(s) · IWC` }).setTimestamp()] });
}

// ═══════════════════════════════════════════════════════════════
// 4. DASHBOARD
// ═══════════════════════════════════════════════════════════════

async function handleDashboard(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const db = loadDB(); const now = Date.now();
  const membres = Object.values(db.members || {});
  const actifs = membres.filter(m => m.status !== 'parti').length; const inactifs = membres.filter(m => m.status === 'inactif').length; const absents = membres.filter(m => m.status === 'absent').length; const probatoires = membres.filter(m => m.status === 'probatoire').length;
  const candsEnAttente = (db.candidatures || []).filter(c => c.status === 'en_attente').length;
  const legal = db.coffres?.legal || 0; const illegal = db.coffres?.illegal || 0;
  const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours').length; const opsPrepa = (db.operations || []).filter(o => o.status === 'preparation').length;
  const opsTerminees7j = (db.operations || []).filter(o => o.status === 'terminee' && o.endedAt && (now - new Date(o.endedAt).getTime()) < 7 * 86400000).length;
  const contratsActifs = (db.contrats || []).filter(c => c.status === 'signe').length; const contratsExpires = (db.contrats || []).filter(c => c.status === 'signe' && c.dateEcheance && new Date(c.dateEcheance) < new Date()).length;
  const prochainRdv = (db.sessions || db.agenda || []).filter(s => new Date(s.date || s.heure) > new Date() && s.statut !== 'Annulé').sort((a, b) => new Date(a.date || a.heure) - new Date(b.date || b.heure))[0];
  const alertes = [candsEnAttente > 0 && `🔔 **${candsEnAttente}** candidature(s) en attente`, contratsExpires > 0 && `⚠️ **${contratsExpires}** contrat(s) expiré(s)`, inactifs > 0 && `💤 **${inactifs}** membre(s) inactif(s)`, opsEnCours > 0 && `🟢 **${opsEnCours}** opération(s) en cours`].filter(Boolean);
  const fillRate = Math.min(1, actifs / 20); const bar = '█'.repeat(Math.round(fillRate * 10)) + '░'.repeat(10 - Math.round(fillRate * 10));
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Tableau de Bord — Iron Wolf Company').setDescription(`*Snapshot au ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*`).addFields(
    { name: '👥 EFFECTIFS',    value: [`Actifs : **${actifs}** · Probatoires : **${probatoires}**`, `Absents : **${absents}** · Inactifs : **${inactifs}**`, `Capacité : \`${bar}\` ${Math.round(fillRate * 100)}%`].join('\n'), inline: false },
    { name: '💰 TRÉSORERIE',   value: [`⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${illegal.toLocaleString('fr-FR')}**`, `💼 Total : **$${(legal + illegal).toLocaleString('fr-FR')}**`].join('\n'), inline: true },
    { name: '🎯 OPÉRATIONS',   value: [`🟢 En cours : **${opsEnCours}**`, `🟡 En prépa : **${opsPrepa}**`, `✅ Cette semaine : **${opsTerminees7j}**`].join('\n'), inline: true },
    { name: '📜 CONTRATS',     value: [`✅ Actifs : **${contratsActifs}**`, `⚠️ Expirés : **${contratsExpires}**`, `📥 Candidatures : **${candsEnAttente}**`].join('\n'), inline: true },
    { name: '📅 PROCHAIN RDV', value: prochainRdv ? `**${prochainRdv.titre || prochainRdv.name || 'Session'}** — ${_fmtDate(prochainRdv.date || prochainRdv.heure)}\n📍 ${prochainRdv.lieu || '—'}` : '*Aucun RDV planifié*', inline: false },
    { name: '🚨 ALERTES',      value: alertes.length > 0 ? alertes.join('\n') : '✅ Aucune alerte active', inline: false },
  ).setFooter({ text: 'IWC Dashboard · /dashboard pour rafraîchir' }).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_dashboard_refresh').setLabel('🔄 Rafraîchir').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('btn_solde').setLabel('💰 Soldes détaillés').setStyle(ButtonStyle.Primary))] });
}

// ═══════════════════════════════════════════════════════════════
// 5. FICHES PERSONNAGES — Embed propre + Synchro Notion
// ═══════════════════════════════════════════════════════════════
// Appelé dans messageCreate quand message dans #fiches-personnages
// Format libre : NOM COMPLET : ..., ÂGE : ..., etc.

async function handleFichePersonnage(message) {
  if (message.author.bot || !message.guild) return;

  const lines = message.content.split('\n');

  const get = (...keys) => {
    for (const key of keys) {
      const line = lines.find(l => l.toUpperCase().includes(key.toUpperCase()) && l.includes(':'));
      if (line) { const val = line.split(':').slice(1).join(':').trim(); if (val) return val; }
    }
    return '—';
  };

  const nom         = get('NOM COMPLET', 'NOM');
  const surnom      = get('SURNOM');
  const age         = get('ÂGE', 'AGE');
  const naissance   = get('LIEU DE NAISSANCE', 'NAISSANCE');
  const nationalite = get('NATIONALITÉ', 'NATIONALITE');
  const taille      = get('TAILLE', 'CORPULENCE');
  const yeux        = get('YEUX', 'CHEVEUX');
  const signes      = get('SIGNES PARTICULIERS', 'SIGNES');
  const profession  = get('PROFESSION', 'MÉTIER', 'METIER');
  const reputation  = get('RÉPUTATION', 'REPUTATION');

  // Extraire blocs multi-lignes
  const extractBloc = (marker) => {
    const idx = lines.findIndex(l => l.replace(/[—\-\s]/g, '').toUpperCase().includes(marker.toUpperCase().replace(/\s/g, '')));
    if (idx < 0) return null;
    const bloc = [];
    for (let i = idx + 1; i < lines.length; i++) {
      const l = lines[i].trim();
      if (!l) continue;
      if (/^—{2,}/.test(l) || /^={2,}/.test(l)) break;
      bloc.push(l);
    }
    return bloc.length ? bloc.join('\n').slice(0, 500) : null;
  };

  const histoire     = extractBloc('HISTOIRE');
  const personnalite = extractBloc('PERSONNALITÉ');
  const competences  = extractBloc('COMPÉTENCES');
  const faiblesses   = extractBloc('FAIBLESSES');
  const objectif     = extractBloc('OBJECTIF');

  const citation = lines.find(l => /^[""]/.test(l.trim()) || /^\*"/.test(l.trim()));

  const db      = loadDB();
  const membre  = db.members[message.author.id];
  const isIlleg = membre?.pole === 'illegal';
  const color   = isIlleg ? 0x8B1A1A : 0x3B82F6;

  await message.react('✅').catch(() => {});

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`👤 ${nom !== '—' ? nom : message.author.username}`)
    .setThumbnail(message.author.displayAvatarURL({ size: 128 }));

  if (citation) embed.setDescription(`*${citation.replace(/^[\*""\s]+|[\*""\s]+$/g, '')}*`);

  embed.addFields(
    { name: '🎭 Identité', value: [`**Surnom :** ${surnom}`, `**Âge :** ${age}`, `**Nationalité :** ${nationalite}`, `**Né(e) à :** ${naissance}`].join('\n'), inline: true },
    { name: '🔍 Physique', value: [`**Taille :** ${taille}`, `**Yeux/Cheveux :** ${yeux}`, `**Signes :** ${signes}`].join('\n'), inline: true },
  );

  if (profession  !== '—') embed.addFields({ name: '💼 Profession',    value: profession,             inline: false });
  if (reputation  !== '—') embed.addFields({ name: '⭐ Réputation',    value: reputation,             inline: false });
  if (histoire)             embed.addFields({ name: '📖 Histoire',      value: histoire.slice(0, 500), inline: false });
  if (personnalite)         embed.addFields({ name: '🧠 Personnalité',  value: personnalite.slice(0, 300), inline: false });
  if (competences)          embed.addFields({ name: '⚔️ Compétences',   value: competences.slice(0, 300), inline: true });
  if (faiblesses)           embed.addFields({ name: '💔 Faiblesses',    value: faiblesses.slice(0, 300),  inline: true });
  if (objectif)             embed.addFields({ name: '🎯 Objectif',      value: objectif.slice(0, 200),    inline: false });

  embed.addFields({ name: '👤 Joueur Discord', value: `<@${message.author.id}>`, inline: true });
  embed.setFooter({ text: `IWC • Fiche personnage • ${new Date().toLocaleDateString('fr-FR')}` }).setTimestamp();

  await message.reply({ embeds: [embed] }).catch(() => {});

  // Synchro Notion en arrière-plan
  _syncFicheNotion(message.author.id, {
    nom: nom !== '—' ? nom : message.author.username,
    surnom, age, naissance, nationalite, taille, yeux, signes, profession, reputation,
    histoire: histoire || '—', discordId: message.author.id, discordUsername: message.author.username,
  }).catch(() => {});
}

async function _syncFicheNotion(discordId, data) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  try {
    const DB = process.env.NOTION_MEMBRES_DB;
    const search = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }),
    });
    const { results } = await search.json();
    const existing = results?.[0];

    const props = {
      'Nom':               { title: [{ text: { content: data.nom } }] },
      'Personnage':        { rich_text: [{ text: { content: data.nom } }] },
      'Profession':        { rich_text: [{ text: { content: data.profession } }] },
      'Réputation':        { rich_text: [{ text: { content: data.reputation } }] },
      'Histoire':          { rich_text: [{ text: { content: (data.histoire || '').slice(0, 2000) } }] },
      'Discord ID':        { rich_text: [{ text: { content: discordId } }] },
      'Discord Username':  { rich_text: [{ text: { content: data.discordUsername } }] },
      'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } },
    };

    if (existing) {
      await fetch(`https://api.notion.com/v1/pages/${existing.id}`, {
        method: 'PATCH',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
        body: JSON.stringify({ properties: props }),
      });
      console.log(`✅ Fiche Notion MàJ : ${data.nom}`);
    } else {
      await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: { database_id: DB }, properties: { ...props, "Date d'entrée": { date: { start: new Date().toISOString().split('T')[0] } }, 'Statut': { select: { name: '✅ Actif' } } } }),
      });
      console.log(`✅ Fiche Notion créée : ${data.nom}`);
    }
  } catch (e) { console.log('❌ Sync fiche Notion error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════
function _fmtDate(d) {
  return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

module.exports = {
  handleTresorCommand, handleTresorFlow, handleTresorModal, handleSoldeButton, setupTresorButton,
  ajouterJournalIC: _ajouterJournalIC,
  handleJournalCommand, handleJournalPagination,
  handleContratsArchives,
  handleDashboard,
  handleFichePersonnage,
};
