// ═══════════════════════════════════════════════════════════════
// notion-modules-v2.js — Trésorerie Modal + Journal IC + Dashboard
// IWC Bot v3.1 — À intégrer dans index.js
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

// ── Réutilise notionRequest, notionCreate, notionQueryDB de notion-extra.js ──
const notionExtra = require('./notion-extra');

// ═══════════════════════════════════════════════════════════════
// 1. TRÉSORERIE — MODAL DISCORD
// ═══════════════════════════════════════════════════════════════
//
// UTILISATION dans index.js :
//
//   // Commande slash /tresor → ouvre le modal
//   if (commandName === 'tresor') {
//     await handleTresorCommand(interaction);
//   }
//
//   // Soumission du modal
//   if (interaction.isModalSubmit() && interaction.customId === 'modal_tresor') {
//     await handleTresorModal(interaction);
//   }
//
//   // Bouton "Nouvelle transaction" dans #coffre-entreprise
//   if (interaction.isButton() && interaction.customId === 'btn_nouvelle_transaction') {
//     await handleTresorCommand(interaction);
//   }

/**
 * Affiche le modal de transaction.
 * Appelle depuis /tresor ou un bouton.
 */
async function handleTresorCommand(interaction) {
  const modal = new ModalBuilder()
    .setCustomId('modal_tresor')
    .setTitle('💰 Nouvelle Transaction');

  const montantInput = new TextInputBuilder()
    .setCustomId('montant')
    .setLabel('Montant ($)')
    .setPlaceholder('Ex : 5000')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const objetInput = new TextInputBuilder()
    .setCustomId('objet')
    .setLabel('Objet / Description')
    .setPlaceholder('Ex : Paiement mission Paleto Bay')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const typeInput = new TextInputBuilder()
    .setCustomId('type')
    .setLabel('Type (entree / sortie)')
    .setPlaceholder('entree  ou  sortie')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  const coffreInput = new TextInputBuilder()
    .setCustomId('coffre')
    .setLabel('Coffre (legal / illegal)')
    .setPlaceholder('legal  ou  illegal')
    .setStyle(TextInputStyle.Short)
    .setRequired(true);

  modal.addComponents(
    new ActionRowBuilder().addComponents(montantInput),
    new ActionRowBuilder().addComponents(objetInput),
    new ActionRowBuilder().addComponents(typeInput),
    new ActionRowBuilder().addComponents(coffreInput),
  );

  await interaction.showModal(modal);
}

/**
 * Traite la soumission du modal de transaction.
 */
async function handleTresorModal(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const montantRaw = interaction.fields.getTextInputValue('montant').replace(/[^0-9]/g, '');
  const objet      = interaction.fields.getTextInputValue('objet').trim();
  const typeRaw    = interaction.fields.getTextInputValue('type').trim().toLowerCase();
  const coffreRaw  = interaction.fields.getTextInputValue('coffre').trim().toLowerCase();

  // Validation
  const montant = parseInt(montantRaw, 10);
  if (isNaN(montant) || montant <= 0) {
    return interaction.editReply({ content: '❌ Montant invalide. Entrez un nombre positif.' });
  }
  const type   = typeRaw.startsWith('e') ? 'Entrée' : 'Sortie';
  const coffre = coffreRaw.startsWith('i') ? 'Illégal' : 'Légal';

  // Mise à jour du solde dans data.json
  const db = loadDB();
  if (!db.coffres) db.coffres = { legal: 0, illegal: 0 };
  const key = coffre === 'Légal' ? 'legal' : 'illegal';
  if (type === 'Entrée') db.coffres[key] += montant;
  else                   db.coffres[key] = Math.max(0, db.coffres[key] - montant);
  const nouveauSolde = db.coffres[key];
  saveDB(db);

  const tx = {
    objet,
    type,
    coffre,
    montant,
    solde: nouveauSolde,
    responsable: interaction.user.username,
  };

  // Enregistrement Notion
  await notionExtra.enregistrerTransactionNotion(tx);

  // Journal IC automatique
  await _ajouterJournalIC(interaction.guild, {
    type:        'tresorerie',
    emoji:       type === 'Entrée' ? '💵' : '💸',
    titre:       `${type} — ${coffre}`,
    description: `**${objet}** · $${montant.toLocaleString('fr-FR')} · par ${interaction.user.username}`,
    auteur:      interaction.user.username,
  });

  // Embed public dans #coffre-entreprise
  const color  = type === 'Entrée' ? 0x57F287 : 0xED4245;
  const arrow  = type === 'Entrée' ? '📈' : '📉';
  const coffreCh = interaction.guild.channels.cache.find(c => c.name?.includes('coffre'));

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`${arrow} ${type} — $${montant.toLocaleString('fr-FR')}`)
    .addFields(
      { name: '📋 Objet',        value: objet,                                       inline: true },
      { name: '🏦 Coffre',       value: coffre,                                      inline: true },
      { name: '👤 Responsable',  value: interaction.user.username,                   inline: true },
      { name: '💰 Nouveau solde', value: `**$${nouveauSolde.toLocaleString('fr-FR')}**`, inline: false },
    )
    .setFooter({ text: 'IWC • Trésorerie automatique' })
    .setTimestamp();

  if (coffreCh) await coffreCh.send({ embeds: [embed] });

  await interaction.editReply({ content: `✅ Transaction enregistrée — Nouveau solde **${coffre}** : **$${nouveauSolde.toLocaleString('fr-FR')}**` });
}

/**
 * Poste un bouton persistant dans #coffre-entreprise au démarrage.
 * Appelle une fois dans autoSetup ou clientReady.
 */
async function setupTresorButton(guild) {
  const ch = guild.channels.cache.find(c => c.name?.includes('coffre'));
  if (!ch) return;

  // Vérifie si le bouton existe déjà
  const db = loadDB();
  if (db.tresorButtonMsgId) {
    try {
      await ch.messages.fetch(db.tresorButtonMsgId);
      return; // Existe déjà
    } catch { /* Message supprimé, on le recrée */ }
  }

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_nouvelle_transaction')
      .setLabel('💰 Nouvelle Transaction')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('btn_solde')
      .setLabel('📊 Voir les soldes')
      .setStyle(ButtonStyle.Secondary),
  );

  const msg = await ch.send({
    embeds: [new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('💰 Trésorerie — Iron Wolf Company')
      .setDescription('Enregistrez chaque mouvement financier via le bouton ci-dessous.\nToute transaction est archivée automatiquement dans Notion.')
      .setFooter({ text: 'IWC • Trésorerie automatique' })
    ],
    components: [row],
  });

  db.tresorButtonMsgId = msg.id;
  saveDB(db);
}

/**
 * Affiche les soldes actuels (bouton ou commande /soldes).
 */
async function handleSoldeButton(interaction) {
  const db = loadDB();
  const legal   = db.coffres?.legal   || 0;
  const illegal = db.coffres?.illegal || 0;

  await interaction.reply({ ephemeral: true, embeds: [new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('📊 Soldes actuels — IWC')
    .addFields(
      { name: '⚖️ Coffre Légal',    value: `**$${legal.toLocaleString('fr-FR')}**`,   inline: true },
      { name: '🔒 Coffre Illégal',  value: `**$${illegal.toLocaleString('fr-FR')}**`, inline: true },
      { name: '💼 Total',            value: `**$${(legal + illegal).toLocaleString('fr-FR')}**`, inline: true },
    )
    .setFooter({ text: 'IWC • Données en temps réel' })
    .setTimestamp()
  ] });
}

// ═══════════════════════════════════════════════════════════════
// 2. JOURNAL IC — LOG AUTOMATIQUE DES ÉVÉNEMENTS
// ═══════════════════════════════════════════════════════════════
//
// Appelle _ajouterJournalIC() depuis n'importe quel module :
//
//   await journalIC.ajouter(guild, {
//     type: 'operation' | 'contrat' | 'recrutement' | 'tresorerie' | 'promotion' | 'autre',
//     emoji: '🎯',
//     titre: 'Opération terminée — Paleto Bay',
//     description: 'Résultat : Succès. Butin : $12 000.',
//     auteur: 'Colt Kane',
//   });
//
// Commande slash /journal → handleJournalCommand(interaction)

const JOURNAL_DB_KEY = 'journalIC'; // Stocké dans data.json

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

  // Garde les 200 dernières entrées
  db[JOURNAL_DB_KEY] = db[JOURNAL_DB_KEY].slice(0, 200);
  saveDB(db);

  // Post dans #histoire-iwc ou #journal si existe
  const ch = guild?.channels?.cache?.find(c =>
    c.name?.includes('histoire') || c.name?.includes('journal')
  );
  if (ch) {
    await ch.send({ embeds: [new EmbedBuilder()
      .setColor(_journalColor(entry.type))
      .setTitle(`${entry.emoji} ${entry.titre}`)
      .setDescription(entry.description)
      .setFooter({ text: `IWC Journal • ${entry.auteur}` })
      .setTimestamp()
    ] }).catch(() => {});
  }
}

function _journalColor(type) {
  const map = {
    operation:    0xED4245,
    contrat:      0x5865F2,
    recrutement:  0x57F287,
    tresorerie:   0xFEE75C,
    promotion:    0xFF9A00,
    autre:        0x8B1A1A,
  };
  return map[type] || 0x8B1A1A;
}

/**
 * /journal [type] [page]
 * Affiche les dernières entrées du journal IC.
 */
async function handleJournalCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const db      = loadDB();
  const journal = db[JOURNAL_DB_KEY] || [];
  const filtre  = interaction.options?.getString('type') || 'all';
  const page    = Math.max(1, interaction.options?.getInteger('page') || 1);
  const perPage = 8;

  const filtered = filtre === 'all'
    ? journal
    : journal.filter(e => e.type === filtre);

  const total = filtered.length;
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

  // Boutons de pagination
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

/**
 * Gère les boutons de pagination du journal.
 * customId format : journal_prev_TYPE_PAGE ou journal_next_TYPE_PAGE
 */
async function handleJournalPagination(interaction) {
  const parts  = interaction.customId.split('_'); // ['journal','prev/next','type','page']
  const dir    = parts[1];
  const filtre = parts[2];
  const page   = parseInt(parts[3], 10);
  const newPage = dir === 'next' ? page + 1 : page - 1;

  // Simule l'options pour réutiliser handleJournalCommand
  interaction.options = {
    getString:  (k) => k === 'type' ? (filtre === 'all' ? null : filtre) : null,
    getInteger: (k) => k === 'page' ? newPage : 1,
  };
  await handleJournalCommand(interaction);
}

// ═══════════════════════════════════════════════════════════════
// 3. ARCHIVES CONTRATS — /contrats-archives
// ═══════════════════════════════════════════════════════════════
//
// Commandes : /contrats-archives [statut] [page]
// Statuts : actif | refuse | expire | tous

/**
 * /contrats-archives [statut] [page]
 */
async function handleContratsArchives(interaction) {
  await interaction.deferReply({ ephemeral: true });

  const db     = loadDB();
  const statut = interaction.options?.getString('statut') || 'tous';
  const page   = Math.max(1, interaction.options?.getInteger('page') || 1);
  const perPage = 6;

  const contrats = (db.contrats || []);
  const filtered = statut === 'tous'
    ? contrats
    : contrats.filter(c => {
        if (statut === 'actif')   return c.status === 'signe';
        if (statut === 'refuse')  return c.status === 'refuse';
        if (statut === 'expire')  return c.status === 'expire' || (c.dateEcheance && new Date(c.dateEcheance) < new Date());
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
      name:   `${emoji} \`${c.id}\` — ${c.objet || '—'}`,
      value:  `Partenaire : **${partner}** · Type : ${c.type === 'emploi' ? '📥 Employeur' : '📤 Prestation'}${echeance}\nSigné par : ${c.signedBy || c.signataire || '—'} · ${_fmtDate(c.signedAt)}`,
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
// 4. DASHBOARD FACTION — /dashboard
// ═══════════════════════════════════════════════════════════════
//
// Commande : /dashboard
// Poste un embed complet avec l'état de la faction en temps réel.

/**
 * /dashboard — État complet de la faction
 */
async function handleDashboard(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const db = loadDB();
  const now = Date.now();

  // ── Membres ──
  const membres     = Object.values(db.members || {});
  const actifs      = membres.filter(m => m.status !== 'parti').length;
  const inactifs    = membres.filter(m => m.status === 'inactif').length;
  const absents     = membres.filter(m => m.status === 'absent').length;
  const probatoires = membres.filter(m => m.status === 'probatoire').length;

  // ── Candidatures en attente ──
  const candsEnAttente = (db.candidatures || []).filter(c => c.status === 'en_attente').length;

  // ── Trésorerie ──
  const legal   = db.coffres?.legal   || 0;
  const illegal = db.coffres?.illegal || 0;

  // ── Opérations en cours ──
  const opsEnCours    = (db.operations || []).filter(o => o.status === 'en_cours').length;
  const opsPrepa      = (db.operations || []).filter(o => o.status === 'preparation').length;
  const opsTerminees7j = (db.operations || []).filter(o =>
    o.status === 'terminee' && o.endedAt && (now - new Date(o.endedAt).getTime()) < 7 * 86400000
  ).length;

  // ── Contrats actifs ──
  const contratsActifs   = (db.contrats || []).filter(c => c.status === 'signe').length;
  const contratsExpires  = (db.contrats || []).filter(c => {
    return c.status === 'signe' && c.dateEcheance && new Date(c.dateEcheance) < new Date();
  }).length;

  // ── Prochain RDV ──
  const agenda = (db.sessions || db.agenda || [])
    .filter(s => new Date(s.date || s.heure) > new Date() && s.statut !== 'Annulé')
    .sort((a, b) => new Date(a.date || a.heure) - new Date(b.date || b.heure));
  const prochainRdv = agenda[0];

  // ── Alertes ──
  const alertes = [];
  if (candsEnAttente > 0)  alertes.push(`🔔 **${candsEnAttente}** candidature(s) en attente`);
  if (contratsExpires > 0) alertes.push(`⚠️ **${contratsExpires}** contrat(s) expiré(s)`);
  if (inactifs > 0)        alertes.push(`💤 **${inactifs}** membre(s) inactif(s)`);
  if (opsEnCours > 0)      alertes.push(`🟢 **${opsEnCours}** opération(s) en cours`);

  // ── Barre de progression membres ──
  const MAX_MEMBRES = 20; // Capacité max de la faction (ajuste selon besoins)
  const fillRate    = Math.min(1, actifs / MAX_MEMBRES);
  const barFilled   = Math.round(fillRate * 10);
  const barEmpty    = 10 - barFilled;
  const bar         = '█'.repeat(barFilled) + '░'.repeat(barEmpty);
  const pct         = Math.round(fillRate * 100);

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('🐺 Tableau de Bord — Iron Wolf Company')
    .setDescription(`*Snapshot au ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*`)
    .addFields(
      // ── Effectifs ──
      {
        name:  '👥 EFFECTIFS',
        value: [
          `Actifs : **${actifs}** · Probatoires : **${probatoires}**`,
          `Absents : **${absents}** · Inactifs : **${inactifs}**`,
          `Capacité : \`${bar}\` ${pct}%`,
        ].join('\n'),
        inline: false,
      },
      // ── Trésorerie ──
      {
        name:  '💰 TRÉSORERIE',
        value: [
          `⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`,
          `🔒 Illégal : **$${illegal.toLocaleString('fr-FR')}**`,
          `💼 Total : **$${(legal + illegal).toLocaleString('fr-FR')}**`,
        ].join('\n'),
        inline: true,
      },
      // ── Opérations ──
      {
        name:  '🎯 OPÉRATIONS',
        value: [
          `🟢 En cours : **${opsEnCours}**`,
          `🟡 En prépa : **${opsPrepa}**`,
          `✅ Cette semaine : **${opsTerminees7j}**`,
        ].join('\n'),
        inline: true,
      },
      // ── Contrats ──
      {
        name:  '📜 CONTRATS',
        value: [
          `✅ Actifs : **${contratsActifs}**`,
          contratsExpires > 0 ? `⚠️ Expirés : **${contratsExpires}**` : `⚠️ Expirés : **0**`,
          `📥 Candidatures : **${candsEnAttente}**`,
        ].join('\n'),
        inline: true,
      },
      // ── Prochain RDV ──
      {
        name:  '📅 PROCHAIN RDV',
        value: prochainRdv
          ? `**${prochainRdv.titre || prochainRdv.name || 'Session'}** — ${_fmtDate(prochainRdv.date || prochainRdv.heure)}\n📍 ${prochainRdv.lieu || '—'}`
          : '*Aucun RDV planifié*',
        inline: false,
      },
      // ── Alertes ──
      {
        name:  '🚨 ALERTES',
        value: alertes.length > 0 ? alertes.join('\n') : '✅ Aucune alerte active',
        inline: false,
      },
    )
    .setFooter({ text: `IWC Dashboard · /dashboard pour rafraîchir` })
    .setTimestamp();

  // Bouton de rafraîchissement
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('btn_dashboard_refresh')
      .setLabel('🔄 Rafraîchir')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('btn_solde')
      .setLabel('💰 Soldes détaillés')
      .setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ═══════════════════════════════════════════════════════════════
// HELPER LOCAL
// ═══════════════════════════════════════════════════════════════
function _fmtDate(d) {
  return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════
// ENREGISTREMENT DES SLASH COMMANDS
// ═══════════════════════════════════════════════════════════════
// Ajoute ces commandes dans ton registerSlashCommands() existant :
//
//   { name: 'tresor',             description: '💰 Enregistrer une transaction' },
//   { name: 'soldes',             description: '📊 Voir les soldes des coffres' },
//   { name: 'dashboard',          description: '🐺 Tableau de bord de la faction' },
//   { name: 'journal',            description: '📖 Journal IC de la Compagnie',
//     options: [
//       { name: 'type',  type: 3, description: 'Filtrer par type', required: false,
//         choices: [
//           { name: 'Tous',          value: 'all'          },
//           { name: 'Opérations',    value: 'operation'    },
//           { name: 'Contrats',      value: 'contrat'      },
//           { name: 'Recrutement',   value: 'recrutement'  },
//           { name: 'Trésorerie',    value: 'tresorerie'   },
//           { name: 'Promotions',    value: 'promotion'    },
//         ]
//       },
//       { name: 'page', type: 4, description: 'Numéro de page', required: false },
//     ]
//   },
//   { name: 'contrats-archives',  description: '📜 Archives des contrats',
//     options: [
//       { name: 'statut', type: 3, description: 'Filtrer par statut', required: false,
//         choices: [
//           { name: 'Tous',    value: 'tous'   },
//           { name: 'Actifs',  value: 'actif'  },
//           { name: 'Refusés', value: 'refuse' },
//           { name: 'Expirés', value: 'expire' },
//         ]
//       },
//       { name: 'page', type: 4, description: 'Numéro de page', required: false },
//     ]
//   },

// ═══════════════════════════════════════════════════════════════
// INTÉGRATION index.js — Router principal
// ═══════════════════════════════════════════════════════════════
// Dans ton interactionCreate handler, ajoute :
//
//   const modules = require('./notion-modules-v2');
//
//   // Slash commands
//   if (interaction.isChatInputCommand()) {
//     if (commandName === 'tresor')            return modules.handleTresorCommand(interaction);
//     if (commandName === 'soldes')            return modules.handleSoldeButton(interaction);
//     if (commandName === 'dashboard')         return modules.handleDashboard(interaction);
//     if (commandName === 'journal')           return modules.handleJournalCommand(interaction);
//     if (commandName === 'contrats-archives') return modules.handleContratsArchives(interaction);
//   }
//
//   // Modaux
//   if (interaction.isModalSubmit()) {
//     if (interaction.customId === 'modal_tresor') return modules.handleTresorModal(interaction);
//   }
//
//   // Boutons
//   if (interaction.isButton()) {
//     if (interaction.customId === 'btn_nouvelle_transaction') return modules.handleTresorCommand(interaction);
//     if (interaction.customId === 'btn_solde')                return modules.handleSoldeButton(interaction);
//     if (interaction.customId === 'btn_dashboard_refresh')    return modules.handleDashboard(interaction);
//     if (interaction.customId.startsWith('journal_'))         return modules.handleJournalPagination(interaction);
//   }
//
//   // Dans clientReady / autoSetup :
//   await modules.setupTresorButton(guild);
//
// ── Journal IC : appels depuis les autres modules ──
// Partout où tu veux logger un événement IC, importe et appelle :
//
//   const { ajouterJournalIC } = require('./notion-modules-v2');
//
//   // Exemple dans la gestion des opérations :
//   await ajouterJournalIC(guild, {
//     type: 'operation', emoji: '🎯',
//     titre: `Opération terminée — ${op.name}`,
//     description: `Résultat : ${op.resultat} · Participants : ${op.participants?.join(', ')}`,
//     auteur: 'Système',
//   });
//
//   // Exemple dans la gestion du recrutement :
//   await ajouterJournalIC(guild, {
//     type: 'recrutement', emoji: '🐺',
//     titre: `Nouveau membre — ${cand.nomPerso}`,
//     description: `${cand.nomPerso} rejoint la Compagnie · Pôle : ${cand.type}`,
//     auteur: 'Direction',
//   });

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  // Trésorerie
  handleTresorCommand,
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

