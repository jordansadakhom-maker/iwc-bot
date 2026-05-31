// ═══════════════════════════════════════════════════════════════
// notion-modules-v2.js — Trésorerie · Journal IC · Dashboard · Archives
// IWC Bot v3.2
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');
const notionExtra = require('./notion-extra');

// ═══════════════════════════════════════════════════════════════
// 1. TRÉSORERIE — FLOW EN 3 ÉTAPES
// ═══════════════════════════════════════════════════════════════
//
// Étape 1 : Boutons Entrée / Sortie          → customId: tresor_type_entree / tresor_type_sortie
// Étape 2 : Boutons Légal / Illégal          → customId: tresor_coffre_legal_entree / tresor_coffre_illegal_entree (etc.)
// Étape 3 : Modal montant + objet            → customId: modal_tresor_TYPE_COFFRE
//
// Dans index.js, ajouter dans interactionCreate :
//
//   // Boutons trésorerie (étape 1 et 2)
//   if (interaction.isButton() && interaction.customId.startsWith('tresor_')) {
//     return notionModules.handleTresorFlow(interaction);
//   }
//   // Modal trésorerie (étape 3)
//   if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_tresor_')) {
//     return notionModules.handleTresorModal(interaction);
//   }

/**
 * Étape 1 — Lance le flow depuis /tresor ou le bouton "Nouvelle Transaction"
 * Affiche les boutons Entrée / Sortie
 */
async function handleTresorCommand(interaction) {
  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('💰 Nouvelle Transaction')
    .setDescription('**Étape 1/3** — Quel type de mouvement ?')
    .setFooter({ text: 'IWC • Trésorerie' });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('tresor_type_entree')
      .setLabel('📈 Entrée')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('tresor_type_sortie')
      .setLabel('📉 Sortie')
      .setStyle(ButtonStyle.Danger),
  );

  await interaction.reply({ embeds: [embed], components: [row], ephemeral: true });
}

/**
 * Routeur du flow trésorerie (boutons étape 1 + 2)
 */
async function handleTresorFlow(interaction) {
  const id = interaction.customId;

  // Étape 1 → choix type (entree/sortie) → affiche choix coffre
  if (id === 'tresor_type_entree' || id === 'tresor_type_sortie') {
    const type = id === 'tresor_type_entree' ? 'entree' : 'sortie';
    const typeLabel = type === 'entree' ? '📈 Entrée' : '📉 Sortie';

    const embed = new EmbedBuilder()
      .setColor(type === 'entree' ? 0x57F287 : 0xED4245)
      .setTitle(`💰 Nouvelle Transaction — ${typeLabel}`)
      .setDescription('**Étape 2/3** — Quel coffre ?')
      .setFooter({ text: 'IWC • Trésorerie' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`tresor_coffre_legal_${type}`)
        .setLabel('⚖️ Coffre Légal')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`tresor_coffre_illegal_${type}`)
        .setLabel('🔒 Coffre Illégal')
        .setStyle(ButtonStyle.Secondary),
    );

    return interaction.update({ embeds: [embed], components: [row] });
  }

  // Étape 2 → choix coffre → ouvre le modal
  if (id.startsWith('tresor_coffre_')) {
    // tresor_coffre_legal_entree  ou  tresor_coffre_illegal_sortie
    const parts  = id.split('_'); // ['tresor','coffre','legal/illegal','entree/sortie']
    const coffre = parts[2]; // 'legal' ou 'illegal'
    const type   = parts[3]; // 'entree' ou 'sortie'

    const modal = new ModalBuilder()
      .setCustomId(`modal_tresor_${type}_${coffre}`)
      .setTitle(`💰 Transaction — ${type === 'entree' ? 'Entrée' : 'Sortie'} ${coffre === 'legal' ? 'Légal' : 'Illégal'}`);

    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('montant')
          .setLabel('Montant ($)')
          .setPlaceholder('Ex : 5000')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('objet')
          .setLabel('Objet / Description')
          .setPlaceholder('Ex : Paiement mission Paleto Bay')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
      ),
    );

    return interaction.showModal(modal);
  }
}

/**
 * Étape 3 — Traitement du modal
 * customId format : modal_tresor_TYPE_COFFRE
 */
async function handleTresorModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  // Extraire type et coffre depuis le customId
  const parts   = interaction.customId.split('_'); // ['modal','tresor','type','coffre']
  const typeRaw  = parts[2]; // 'entree' ou 'sortie'
  const coffreRaw = parts[3]; // 'legal' ou 'illegal'

  const montantRaw = interaction.fields.getTextInputValue('montant').replace(/[^0-9]/g, '');
  const objet      = interaction.fields.getTextInputValue('objet').trim();

  const montant = parseInt(montantRaw, 10);
  if (isNaN(montant) || montant <= 0) {
    return interaction.editReply({ content: '❌ Montant invalide. Entrez un nombre positif.' });
  }

  const type   = typeRaw   === 'entree'  ? 'Entrée'  : 'Sortie';
  const coffre = coffreRaw === 'illegal' ? 'Illégal' : 'Légal';
  const key    = coffreRaw === 'illegal' ? 'illegal' : 'legal';

  // Mise à jour solde
  const db = loadDB();
  if (!db.coffres) db.coffres = { legal: 0, illegal: 0 };
  if (type === 'Entrée') db.coffres[key] += montant;
  else                   db.coffres[key] = Math.max(0, db.coffres[key] - montant);
  const nouveauSolde = db.coffres[key];
  saveDB(db);

  const tx = { objet, type, coffre, montant, solde: nouveauSolde, responsable: interaction.user.username };

  // Enregistrement Notion
  await notionExtra.enregistrerTransactionNotion(tx);

  // Journal IC
  await _ajouterJournalIC(interaction.guild, {
    type:        'tresorerie',
    emoji:       type === 'Entrée' ? '💵' : '💸',
    titre:       `${type} — ${coffre}`,
    description: `**${objet}** · $${montant.toLocaleString('fr-FR')} · par ${interaction.user.username}`,
    auteur:      interaction.user.username,
  });

  // Embed public dans le salon coffre correspondant
  const color = type === 'Entrée' ? 0x57F287 : 0xED4245;
  const arrow = type === 'Entrée' ? '📈' : '📉';

  const nomCoffre = coffre === 'Légal' ? 'coffre-entreprise' : 'coffre-illegal';
  const coffreCh  = interaction.guild.channels.cache.find(c =>
    c.name?.includes(coffre === 'Légal' ? 'coffre-entreprise' : 'coffre-illegal')
  ) || interaction.guild.channels.cache.find(c => c.name?.includes('coffre'));

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${arrow} ${type} — $${montant.toLocaleString('fr-FR')}`)
    .addFields(
      { name: '📋 Objet',         value: objet,                                            inline: true },
      { name: '🏦 Coffre',        value: coffre,                                           inline: true },
      { name: '👤 Responsable',   value: interaction.user.username,                        inline: true },
      { name: '💰 Nouveau solde', value: `**$${nouveauSolde.toLocaleString('fr-FR')}**`,   inline: false },
    )
    .setFooter({ text: 'IWC • Trésorerie automatique' })
    .setTimestamp();

  if (coffreCh) await coffreCh.send({ embeds: [embed] });

  await interaction.editReply({
    content: `✅ Transaction enregistrée — Solde **${coffre}** : **$${nouveauSolde.toLocaleString('fr-FR')}**`,
  });
}

/**
 * Poste ou MET À JOUR le bouton persistant dans #coffre-entreprise.
 * Ne crée jamais de doublon.
 */
async function setupTresorButton(guild) {
  const ch = guild.channels.cache.find(c => c.name?.includes('coffre-entreprise'));
  if (!ch) return;

  const db = loadDB();

  // Tenter de mettre à jour le message existant
  if (db.tresorButtonMsgId) {
    try {
      const existing = await ch.messages.fetch(db.tresorButtonMsgId);
      if (existing) {
        await existing.edit({
          embeds: [_buildTresorPanelEmbed()],
          components: [_buildTresorPanelRow()],
        });
        return; // Mis à jour, on s'arrête
      }
    } catch { /* Message supprimé ou introuvable → on en recrée un */ }
  }

  // Supprimer tous les anciens messages du bot dans ce salon pour éviter les doublons
  try {
    const msgs = await ch.messages.fetch({ limit: 20 });
    const botMsgs = msgs.filter(m => m.author.id === guild.members.me?.id);
    for (const [, msg] of botMsgs) {
      await msg.delete().catch(() => {});
    }
  } catch {}

  const msg = await ch.send({
    embeds: [_buildTresorPanelEmbed()],
    components: [_buildTresorPanelRow()],
  });

  db.tresorButtonMsgId = msg.id;
  saveDB(db);
}

function _buildTresorPanelEmbed() {
  return new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('💰 Trésorerie — Iron Wolf Company')
    .setDescription('Enregistrez chaque mouvement financier via le bouton ci-dessous.\nToute transaction est archivée automatiquement dans Notion.')
    .setFooter({ text: 'IWC • Trésorerie automatique' });
}

function _buildTresorPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_nouvelle_transaction')
      .setLabel('💰 Nouvelle Transaction')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_solde')
      .setLabel('📊 Voir les soldes')
      .setStyle(ButtonStyle.Secondary),
  );
}

/**
 * Affiche les soldes actuels
 */
async function handleSoldeButton(interaction) {
  const db = loadDB();
  const legal   = db.coffres?.legal   || 0;
  const illegal = db.coffres?.illegal || 0;

  await interaction.reply({
    ephemeral: true,
    embeds: [new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('📊 Soldes actuels — IWC')
      .addFields(
        { name: '⚖️ Coffre Légal',   value: `**$${legal.toLocaleString('fr-FR')}**`,            inline: true },
        { name: '🔒 Coffre Illégal', value: `**$${illegal.toLocaleString('fr-FR')}**`,           inline: true },
        { name: '💼 Total',          value: `**$${(legal + illegal).toLocaleString('fr-FR')}**`, inline: true },
      )
      .setFooter({ text: 'IWC • Données en temps réel' })
      .setTimestamp()
    ],
  });
}

// ═══════════════════════════════════════════════════════════════
// 2. JOURNAL IC
// ═══════════════════════════════════════════════════════════════

const JOURNAL_DB_KEY = 'journalIC';

async function _ajouterJournalIC(guild, entry) {
  const db = loadDB();
  if (!db[JOURNAL_DB_KEY]) db[JOURNAL_DB_KEY] = [];

  db[JOURNAL_DB_KEY].unshift({
    id:          Date.now().toString(),
    date:        new Date().toISOString(),
    type:        entry.type        || 'autre',
    emoji:       entry.emoji       || '📝',
    titre:       entry.titre       || '—',
    description: entry.description || '—',
    auteur:      entry.auteur      || '—',
  });

  db[JOURNAL_DB_KEY] = db[JOURNAL_DB_KEY].slice(0, 200);
  saveDB(db);

  const ch = guild?.channels?.cache?.find(c =>
    c.name?.includes('histoire') || c.name?.includes('journal')
  );
  if (ch) {
    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(_journalColor(entry.type))
        .setTitle(`${entry.emoji} ${entry.titre}`)
        .setDescription(entry.description)
        .setFooter({ text: `IWC Journal • ${entry.auteur}` })
        .setTimestamp()
      ],
    }).catch(() => {});
  }
}

function _journalColor(type) {
  const map = {
    operation:   0xED4245,
    contrat:     0x5865F2,
    recrutement: 0x57F287,
    tresorerie:  0xFEE75C,
    promotion:   0xFF9A00,
    autre:       0x8B1A1A,
  };
  return map[type] || 0x8B1A1A;
}

async function handleJournalCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const db      = loadDB();
  const journal = db[JOURNAL_DB_KEY] || [];
  const filtre  = interaction.options?.getString('type') || 'all';
  const page    = Math.max(1, interaction.options?.getInteger('page') || 1);
  const perPage = 8;

  const filtered = filtre === 'all' ? journal : journal.filter(e => e.type === filtre);
  const total    = filtered.length;

  if (total === 0) {
    return interaction.editReply({ content: '📭 Aucune entrée dans le journal pour ce filtre.' });
  }

  const totalPages = Math.ceil(total / perPage);
  const pageData   = filtered.slice((page - 1) * perPage, page * perPage);

  const lines = pageData.map(e => {
    const d = new Date(e.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: '2-digit' });
    return `${e.emoji} **${e.titre}**\n┗ ${e.description} — *${d}*`;
  }).join('\n\n');

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('📖 Journal IC — Iron Wolf Company')
    .setDescription(lines || '*Aucune entrée*')
    .setFooter({ text: `Page ${page}/${totalPages} · ${total} entrée(s) · IWC Journal` })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`journal_prev_${filtre}_${page}`)
      .setLabel('◀ Précédent')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page <= 1),
    new ButtonBuilder()
      .setCustomId(`journal_next_${filtre}_${page}`)
      .setLabel('Suivant ▶')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(page >= totalPages),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

async function handleJournalPagination(interaction) {
  const parts   = interaction.customId.split('_');
  const dir     = parts[1];
  const filtre  = parts[2];
  const page    = parseInt(parts[3], 10);
  const newPage = dir === 'next' ? page + 1 : page - 1;

  interaction.options = {
    getString:  (k) => k === 'type' ? (filtre === 'all' ? null : filtre) : null,
    getInteger: (k) => k === 'page' ? newPage : 1,
  };
  await handleJournalCommand(interaction);
}

// ═══════════════════════════════════════════════════════════════
// 3. ARCHIVES CONTRATS
// ═══════════════════════════════════════════════════════════════

async function handleContratsArchives(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db      = loadDB();
  const statut  = interaction.options?.getString('statut') || 'tous';
  const page    = Math.max(1, interaction.options?.getInteger('page') || 1);
  const perPage = 6;

  const contrats = db.contrats || [];
  const filtered = statut === 'tous' ? contrats : contrats.filter(c => {
    if (statut === 'actif')  return c.status === 'signe';
    if (statut === 'refuse') return c.status === 'refuse';
    if (statut === 'expire') return c.status === 'expire' || (c.dateEcheance && new Date(c.dateEcheance) < new Date());
    return true;
  });

  if (filtered.length === 0) {
    return interaction.editReply({ content: `📭 Aucun contrat trouvé pour le filtre **${statut}**.` });
  }

  const totalPages = Math.ceil(filtered.length / perPage);
  const pageData   = filtered
    .sort((a, b) => new Date(b.signedAt || b.createdAt || 0) - new Date(a.signedAt || a.createdAt || 0))
    .slice((page - 1) * perPage, page * perPage);

  const statutEmoji = { signe: '✅', refuse: '❌', expire: '⏰', resilie: '🚫' };

  const fields = pageData.map(c => {
    const emoji    = statutEmoji[c.status] || '📄';
    const partner  = c.clientNom || c.employeurNom || '—';
    const echeance = c.dateEcheance ? ` · Éch. ${new Date(c.dateEcheance).toLocaleDateString('fr-FR')}` : '';
    return {
      name:  `${emoji} \`${c.id}\` — ${c.objet || '—'}`,
      value: `Partenaire : **${partner}** · Type : ${c.type === 'emploi' ? '📥 Employeur' : '📤 Prestation'}${echeance}\nSigné par : ${c.signedBy || c.signataire || '—'} · ${_fmtDate(c.signedAt)}`,
      inline: false,
    };
  });

  const embed = new EmbedBuilder()
    .setColor(0x5865F2)
    .setTitle(`📜 Archives Contrats — ${statut.charAt(0).toUpperCase() + statut.slice(1)}`)
    .addFields(fields)
    .setFooter({ text: `Page ${page}/${totalPages} · ${filtered.length} contrat(s) · IWC` })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
// 4. DASHBOARD
// ═══════════════════════════════════════════════════════════════

async function handleDashboard(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const db  = loadDB();
  const now = Date.now();

  const membres        = Object.values(db.members || {});
  const actifs         = membres.filter(m => m.status !== 'parti').length;
  const inactifs       = membres.filter(m => m.status === 'inactif').length;
  const absents        = membres.filter(m => m.status === 'absent').length;
  const probatoires    = membres.filter(m => m.status === 'probatoire').length;
  const candsEnAttente = (db.candidatures || []).filter(c => c.status === 'en_attente').length;
  const legal          = db.coffres?.legal   || 0;
  const illegal        = db.coffres?.illegal || 0;
  const opsEnCours     = (db.operations || []).filter(o => o.status === 'en_cours').length;
  const opsPrepa       = (db.operations || []).filter(o => o.status === 'preparation').length;
  const opsTerminees7j = (db.operations || []).filter(o =>
    o.status === 'terminee' && o.endedAt && (now - new Date(o.endedAt).getTime()) < 7 * 86400000
  ).length;
  const contratsActifs  = (db.contrats || []).filter(c => c.status === 'signe').length;
  const contratsExpires = (db.contrats || []).filter(c =>
    c.status === 'signe' && c.dateEcheance && new Date(c.dateEcheance) < new Date()
  ).length;

  const agenda     = (db.sessions || db.agenda || [])
    .filter(s => new Date(s.date || s.heure) > new Date() && s.statut !== 'Annulé')
    .sort((a, b) => new Date(a.date || a.heure) - new Date(b.date || b.heure));
  const prochainRdv = agenda[0];

  const alertes = [];
  if (candsEnAttente > 0)  alertes.push(`🔔 **${candsEnAttente}** candidature(s) en attente`);
  if (contratsExpires > 0) alertes.push(`⚠️ **${contratsExpires}** contrat(s) expiré(s)`);
  if (inactifs > 0)        alertes.push(`💤 **${inactifs}** membre(s) inactif(s)`);
  if (opsEnCours > 0)      alertes.push(`🟢 **${opsEnCours}** opération(s) en cours`);

  const MAX_MEMBRES = 20;
  const fillRate    = Math.min(1, actifs / MAX_MEMBRES);
  const barFilled   = Math.round(fillRate * 10);
  const bar         = '█'.repeat(barFilled) + '░'.repeat(10 - barFilled);
  const pct         = Math.round(fillRate * 100);

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('🐺 Tableau de Bord — Iron Wolf Company')
    .setDescription(`*Snapshot au ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*`)
    .addFields(
      { name: '👥 EFFECTIFS',    value: [`Actifs : **${actifs}** · Probatoires : **${probatoires}**`, `Absents : **${absents}** · Inactifs : **${inactifs}**`, `Capacité : \`${bar}\` ${pct}%`].join('\n'),  inline: false },
      { name: '💰 TRÉSORERIE',   value: [`⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${illegal.toLocaleString('fr-FR')}**`, `💼 Total : **$${(legal + illegal).toLocaleString('fr-FR')}**`].join('\n'), inline: true },
      { name: '🎯 OPÉRATIONS',   value: [`🟢 En cours : **${opsEnCours}**`, `🟡 En prépa : **${opsPrepa}**`, `✅ Cette semaine : **${opsTerminees7j}**`].join('\n'), inline: true },
      { name: '📜 CONTRATS',     value: [`✅ Actifs : **${contratsActifs}**`, `⚠️ Expirés : **${contratsExpires}**`, `📥 Candidatures : **${candsEnAttente}**`].join('\n'), inline: true },
      { name: '📅 PROCHAIN RDV', value: prochainRdv ? `**${prochainRdv.titre || prochainRdv.name || 'Session'}** — ${_fmtDate(prochainRdv.date || prochainRdv.heure)}\n📍 ${prochainRdv.lieu || '—'}` : '*Aucun RDV planifié*', inline: false },
      { name: '🚨 ALERTES',      value: alertes.length > 0 ? alertes.join('\n') : '✅ Aucune alerte active', inline: false },
    )
    .setFooter({ text: 'IWC Dashboard · /dashboard pour rafraîchir' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_dashboard_refresh').setLabel('🔄 Rafraîchir').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_solde').setLabel('💰 Soldes détaillés').setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ═══════════════════════════════════════════════════════════════
// HELPER
// ═══════════════════════════════════════════════════════════════
function _fmtDate(d) {
  return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  // Trésorerie
  handleTresorCommand,
  handleTresorFlow,
  handleTresorModal,
  handleSoldeButton,
  setupTresorButton,
  // Journal IC
  ajouterJournalIC: _ajouterJournalIC,
  handleJournalCommand,
  handleJournalPagination,
  // Contrats
  handleContratsArchives,
  // Dashboard
  handleDashboard,
};

