// ═══════════════════════════════════════════════════════════════
// notion-modules-v2.js — Trésorerie · Journal IC · Dashboard · Archives · Fiches
// IWC Bot v3.4 — FIX TDZ handleTresorModal (db avant utilisation)
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');
const notionExtra = require('./notion-extra');

const { NOTION_VERSION, LIMITE_SORTIE_LEGAL, LIMITE_SORTIE_ILLEGAL, SEUIL_COFFRE_LEGAL: SEUIL_LEGAL, SEUIL_COFFRE_ILLEGAL: SEUIL_ILLEGAL } = require('./config');

function _getPole(member) {
  if (!member) return 'both';
  const roles = member.roles?.cache;
  if (!roles) return 'both';
  const illegalRoleNames = ['Concepteur', 'Fléau', 'Exécuteur', 'Condamné', 'Maudit', 'Confrérie', 'Ombre'];
  const legalRoleNames   = ['Conseil', 'Directeur', 'Officier', 'Agent', 'Opérateur', 'Recrue', 'Iron Wolf', 'Fondateur'];
  const hasIllegal = roles.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const hasLegal   = roles.some(r => legalRoleNames.some(n => r.name.includes(n)));
  if (hasIllegal && !hasLegal) return 'illegal';
  if (hasLegal   && !hasIllegal) return 'legal';
  return 'both';
}

async function handleTresorCommand(interaction) {
  // Bloquer si une transaction est déjà en cours pour cet utilisateur
  const dbCheck = loadDB();
  const txEnCours = Object.values(dbCheck.transactionsPendantes || {}).find(
    tx => tx.userId === interaction.user.id && !tx.photoOk && !tx.approved &&
    (Date.now() - new Date(tx.createdAt).getTime()) < 8 * 60 * 1000
  );
  if (txEnCours) {
    return interaction.reply({
      flags: MessageFlags.Ephemeral,
      content: `⏳ Tu as déjà une transaction en cours (**Réf. \`${txEnCours.txId}\`**).
*Envoie ta photo ou attends qu'elle expire (8 min) avant d'en créer une nouvelle.*`,
    });
  }
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
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

async function handleTresorModal(interaction) {
  await interaction.deferUpdate().catch(() => {});

  const parts     = interaction.customId.split('_');
  const typeRaw   = parts[2];
  const coffreRaw = parts[3];

  const montant = parseInt(interaction.fields.getTextInputValue('montant').replace(/[^0-9.,]/g, '').replace(',', '.'), 10);
  const objet   = interaction.fields.getTextInputValue('objet').trim();

  if (isNaN(montant) || montant <= 0) {
    return interaction.followUp({ content: '❌ Montant invalide. Entre un nombre positif.', flags: MessageFlags.Ephemeral });
  }

  const type   = typeRaw   === 'entree'  ? 'Entrée'  : 'Sortie';
  const coffre = coffreRaw === 'illegal' ? 'Illégal' : 'Légal';
  const key    = coffreRaw === 'illegal' ? 'illegal' : 'legal';

  // ══ FIX TDZ : db déclaré ICI, avant toute utilisation ══
  const db = loadDB();

  // Limite dynamique — configurable par le Fléau/Concepteur
  const limiteDb = key === 'illegal' ? (db.limiteSortieIllegal || LIMITE_SORTIE_ILLEGAL) : (db.limiteSortieLegal || LIMITE_SORTIE_LEGAL);
  const limite = limiteDb;

  const txId = `TX-${Date.now().toString().slice(-6)}`;

  // ── Direction : pas de photo ni double saisie ──
  if (_isDirection(interaction.member)) {
    if (!db.coffres) db.coffres = { legal: 0, illegal: 0 };
    const limiteDb2 = key === 'illegal' ? (db.limiteSortieIllegal || LIMITE_SORTIE_ILLEGAL) : (db.limiteSortieLegal || LIMITE_SORTIE_LEGAL);
    const txDirect = { txId, type, coffre, key, montant, objet, userId: interaction.user.id, username: interaction.user.username, guildId: interaction.guild.id, createdAt: new Date().toISOString(), photoOk: true, approved: true };
    if (type === 'Sortie' && montant > limiteDb2) {
      await _soumettreValidationDirection(interaction.guild, txDirect, null);
      return interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('📨 Sortie importante soumise').setDescription(`Sortie de **$${montant.toLocaleString('fr-FR')}** soumise à validation Direction (traçabilité).\n\n*En tant que Direction, la preuve photo n'est pas requise.*`).setFooter({ text: `IWC • Réf. ${txId}` })] });
    }
    await _validerTransaction(interaction.guild, txDirect, null);
    const soldeFinal2 = loadDB().coffres?.[key] || 0;
    return interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Transaction validée').addFields({ name: '🆔 Réf.', value: `\`${txId}\``, inline: true }, { name: `${type === 'Entrée' ? '📥' : '📤'} ${type}`, value: `$${montant.toLocaleString('fr-FR')}`, inline: true }, { name: '💰 Solde', value: `**$${soldeFinal2.toLocaleString('fr-FR')}**`, inline: true }).setFooter({ text: `IWC • Direction — Sans preuve photo` })] });
  }

  if (!db.transactionsPendantes) db.transactionsPendantes = {};
  db.transactionsPendantes[txId] = {
    txId, type, coffre, key, montant, objet,
    userId:   interaction.user.id,
    username: interaction.user.username,
    guildId:  interaction.guild.id,
    createdAt: new Date().toISOString(),
    needsApproval: type === 'Sortie' && montant > limite,
    approved: false,
    photoOk: false,
  };
  saveDB(db);

  const embedPhoto = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('📸 Preuve requise — Transaction en attente')
    .setDescription([
      `Transaction **\`${txId}\`** enregistrée.`,
      '',
      "**Envoie maintenant une capture d'écran du jeu** confirmant cette transaction.",
      '',
      `> ${type === 'Entrée' ? '📥' : '📤'} **${type}** — $${montant.toLocaleString('fr-FR')}`,
      `> 📋 **Objet :** ${objet}`,
      `> 🏦 **Coffre :** ${coffre}`,
      '',
      type === 'Sortie' && montant > limite
        ? `⚠️ **Cette sortie dépasse $${limite.toLocaleString('fr-FR')}** — elle sera soumise à validation de la Direction après la photo.`
        : '✅ Transaction validée automatiquement après réception de la photo.',
      '',
      '*Envoie ta photo dans ce salon. Tu as **5 minutes**.*',
    ].join('\n'))
    .setFooter({ text: `IWC • Réf. ${txId}` });

  await interaction.followUp({ embeds: [embedPhoto], flags: MessageFlags.Ephemeral });

  const clean    = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const cibleNom = coffre === 'Légal' ? 'coffre-entreprise' : 'coffre-illegal';
  const coffreCh = interaction.guild.channels.cache.find(c => clean(c.name || '').includes(clean(cibleNom)));
  if (!coffreCh) return;

  const filter = m =>
    m.author.id === interaction.user.id &&
    m.attachments.some(a => a.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.url));

  let photoMsg = null;
  try {
    const collected = await coffreCh.awaitMessages({ filter, max: 1, time: 5 * 60 * 1000, errors: ['time'] });
    photoMsg = collected.first();
  } catch {
    const dbFresh = loadDB();
    delete dbFresh.transactionsPendantes[txId];
    saveDB(dbFresh);
    await interaction.followUp({
      embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⏰ Délai dépassé — Transaction annulée').setDescription(`La transaction **\`${txId}\`** a été annulée.\n\n**Raison :** Aucune photo reçue en 5 minutes.\n*Recommence depuis le bouton 💰 Nouvelle Transaction.*`).setFooter({ text: `IWC • Réf. ${txId} — Annulée` })],
      flags: MessageFlags.Ephemeral,
    }).catch(() => {});
    return;
  }

  const photoUrl = photoMsg.attachments.first()?.url;
  await photoMsg.delete().catch(() => {});

  const dbUpd = loadDB();
  if (dbUpd.transactionsPendantes?.[txId]) {
    dbUpd.transactionsPendantes[txId].photoUrl = photoUrl;
    saveDB(dbUpd);
  }

  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('🔢 Vérification du montant')
      .setDescription([
        '📸 Photo reçue.',
        '',
        "**Retape maintenant le montant exact visible sur ta capture d'écran.**",
        '',
        `> Tu as déclaré : **$${montant.toLocaleString('fr-FR')}**`,
        '',
        '*Si le montant ne correspond pas exactement → transaction annulée.*',
        '*Tu as **2 minutes**.*',
      ].join('\n'))
      .setFooter({ text: `IWC • Réf. ${txId}` })
    ],
  });

  const filterTxt = m => m.author.id === interaction.user.id && /^[0-9\s.,]+$/.test(m.content.trim());
  let confirmMsg = null;
  try {
    const collectedTxt = await coffreCh.awaitMessages({ filter: filterTxt, max: 1, time: 2 * 60 * 1000, errors: ['time'] });
    confirmMsg = collectedTxt.first();
  } catch {
    const dbFresh2 = loadDB();
    delete dbFresh2.transactionsPendantes[txId];
    saveDB(dbFresh2);
    await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⏰ Délai dépassé — Transaction annulée').setDescription(`La transaction **\`${txId}\`** a été annulée.\n\n**Raison :** Aucune confirmation du montant en 2 minutes.\n*Recommence depuis le bouton 💰 Nouvelle Transaction.*`).setFooter({ text: `IWC • Réf. ${txId} — Annulée` })] }).catch(() => {});
    return;
  }

  await confirmMsg.delete().catch(() => {});

  const montantConfirme = parseInt(confirmMsg.content.trim().replace(/[^0-9]/g, ''), 10);

  if (isNaN(montantConfirme) || montantConfirme !== montant) {
    const dbFresh3 = loadDB();
    delete dbFresh3.transactionsPendantes[txId];
    saveDB(dbFresh3);
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder()
        .setColor(0xED4245)
        .setTitle('❌ Montant incorrect — Transaction annulée')
        .setDescription([
          `Tu as saisi **$${montantConfirme ? montantConfirme.toLocaleString('fr-FR') : '?'}** mais la transaction déclarée était **$${montant.toLocaleString('fr-FR')}**.`,
          '',
          '*Les deux montants doivent être identiques.*',
          '*Recommence avec le bon montant visible sur ton écran.*',
        ].join('\n'))
        .setFooter({ text: `IWC • Réf. ${txId} — Annulée` })
      ],
    }).catch(() => {});
    return;
  }

  const dbUpd2 = loadDB();
  if (dbUpd2.transactionsPendantes?.[txId]) {
    dbUpd2.transactionsPendantes[txId].photoOk = true;
    saveDB(dbUpd2);
  }

  if (type === 'Sortie' && montant > limite) {
    const dbFinal = loadDB();
    await _soumettreValidationDirection(interaction.guild, dbFinal.transactionsPendantes[txId], photoUrl);
    await interaction.followUp({
      flags: MessageFlags.Ephemeral,
      embeds: [new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📨 En attente de validation')
        .setDescription([
          `✅ Montant **$${montant.toLocaleString('fr-FR')}** confirmé.`,
          '',
          `Ta sortie dépasse le seuil autorisé de **$${limite.toLocaleString('fr-FR')}**.`,
          'La Direction va examiner ta demande.',
          '',
          '*Tu seras notifié(e) par DM dès la décision.*',
        ].join('\n'))
        .setFooter({ text: `IWC • Réf. ${txId}` })
      ],
    }).catch(() => {});
    return;
  }

  const dbFinal2 = loadDB();
  await _validerTransaction(interaction.guild, dbFinal2.transactionsPendantes[txId], photoUrl);
  delete dbFinal2.transactionsPendantes[txId];
  saveDB(dbFinal2);

  const soldeFinal = (loadDB().coffres?.[key] || 0);
  await interaction.followUp({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Transaction validée')
      .addFields(
        { name: '🆔 Réf.',            value: `\`${txId}\``,                               inline: true },
        { name: `${type === 'Entrée' ? '📥' : '📤'} ${type}`, value: `$${montant.toLocaleString('fr-FR')}`, inline: true },
        { name: '💰 Nouveau solde',   value: `**$${soldeFinal.toLocaleString('fr-FR')}**`,  inline: true },
      )
      .setFooter({ text: `IWC • ${coffre} • Photo vérifiée ✅` })
    ],
  }).catch(() => {});
}

async function _soumettreValidationDirection(guild, tx, photoUrl) {
  const logsCh = guild.channels.cache.find(c => {
    const cl = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    return c.isTextBased?.() && cl(c.name).includes('logs');
  });
  if (!logsCh) return;

  const embed = new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('⚠️ Validation requise — Sortie importante')
    .setDescription(`**<@${tx.userId}>** souhaite effectuer une sortie qui dépasse le seuil autorisé.`)
    .addFields(
      { name: '🆔 Réf.',         value: `\`${tx.txId}\``,                               inline: true },
      { name: '📤 Montant',      value: `**$${tx.montant.toLocaleString('fr-FR')}**`,   inline: true },
      { name: '🏦 Coffre',       value: tx.coffre,                                       inline: true },
      { name: '📋 Objet',        value: tx.objet,                                        inline: false },
      { name: '👤 Demandé par',  value: `<@${tx.userId}> (${tx.username})`,             inline: true },
      { name: '📅 Date',         value: new Date(tx.createdAt).toLocaleString('fr-FR'), inline: true },
    )
    .setImage(photoUrl || null)
    .setFooter({ text: 'IWC • Validation trésorerie' })
    .setTimestamp();

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`tresor_valider_${tx.txId}`).setLabel('✅ Approuver').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`tresor_refuser_${tx.txId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger),
  );

  await logsCh.send({ content: `💰 Validation requise — sortie $${tx.montant.toLocaleString('fr-FR')}`, embeds: [embed], components: [row] });
}

async function _validerTransaction(guild, tx, photoUrl) {
  const db = loadDB();
  if (!db.coffres) db.coffres = { legal: 0, illegal: 0 };
  if (tx.type === 'Entrée') db.coffres[tx.key] += tx.montant;
  else                      db.coffres[tx.key] = Math.max(0, db.coffres[tx.key] - tx.montant);
  const nouveauSolde = db.coffres[tx.key];
  saveDB(db);

  _archiverTransactionNotion({
    objet: tx.objet, type: tx.type, coffre: tx.coffre,
    montant: tx.montant, solde: nouveauSolde,
    responsable: tx.username, date: tx.createdAt,
    photoUrl: photoUrl || '—',
  }).catch(() => {});

  const ajouterJournalIC = global.ajouterJournalIC || _ajouterJournalIC;
  ajouterJournalIC(guild, {
    type: 'tresorerie', emoji: tx.type === 'Entrée' ? '💵' : '💸',
    titre: `${tx.type} — Coffre ${tx.coffre}`,
    description: `**${tx.objet}** · $${tx.montant.toLocaleString('fr-FR')} · par ${tx.username}`,
    auteur: tx.username,
  }).catch(() => {});

  const clean    = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const cibleNom = tx.coffre === 'Légal' ? 'coffre-entreprise' : 'coffre-illegal';
  const coffreCh = guild.channels.cache.find(c => clean(c.name || '').includes(clean(cibleNom)));

  if (coffreCh) {
    const isEntree = tx.type === 'Entrée';
    const line     = '─────────────────────────────────';

    const embed = new EmbedBuilder()
      .setColor(isEntree ? 0x57F287 : 0xED4245)
      .setAuthor({ name: `${tx.coffre === 'Légal' ? '⚖️ Iron Wolf Company' : '🔒 La Confrérie'} • Trésorerie`, iconURL: guild.iconURL() || undefined })
      .setTitle(`${isEntree ? '📈' : '📉'} ${tx.type.toUpperCase()} — $${tx.montant.toLocaleString('fr-FR')}`)
      .setDescription(`\`\`\`\n${line}\n  ${tx.coffre === 'Légal' ? '⚖️ COFFRE LÉGAL' : '🔒 COFFRE ILLÉGAL'}\n${line}\n\`\`\``)
      .addFields(
        { name: '📋 Objet',       value: tx.objet,                                             inline: true },
        { name: '👤 Responsable', value: tx.username,                                          inline: true },
        { name: '🆔 Réf.',        value: `\`${tx.txId}\``,                                    inline: true },
        { name: `${isEntree ? '📥' : '📤'} Mouvement`, value: `**${isEntree ? '+' : '-'}$${tx.montant.toLocaleString('fr-FR')}**`, inline: true },
        { name: '💰 Solde actuel',value: `**$${nouveauSolde.toLocaleString('fr-FR')}**`,      inline: true },
        { name: '📸 Preuve',      value: '✅ Photo vérifiée',                                  inline: true },
      );

    if (photoUrl) embed.setImage(photoUrl);
    embed.setFooter({ text: `IWC • ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })}` }).setTimestamp();

    const sentMsg = await coffreCh.send({ embeds: [embed] }).catch(() => null);
    if (sentMsg) setTimeout(() => sentMsg.delete().catch(() => {}), 30000);
  }

  // Rafraîchir le panel trésorerie
  try {
    const coffrePanel = guild.channels.cache.find(c => c.name?.includes('coffre-entreprise'));
    if (coffrePanel) {
      const dbRefresh = loadDB();
      if (dbRefresh.tresorButtonMsgId) {
        const panelMsg = await coffrePanel.messages.fetch(dbRefresh.tresorButtonMsgId).catch(() => null);
        if (panelMsg) await panelMsg.edit({ embeds: [_tresorEmbed()], components: [_tresorRow()] }).catch(() => {});
      }
    }
  } catch {}

  return nouveauSolde;
}

async function handleTresorValidation(interaction, decision) {
  if (!_isDirection(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  }

  const txId = interaction.customId.replace(decision === 'valider' ? 'tresor_valider_' : 'tresor_refuser_', '');
  const db   = loadDB();
  const tx   = db.transactionsPendantes?.[txId];

  if (!tx) {
    return interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x555555).setDescription('*Transaction déjà traitée ou expirée.*')], components: [] });
  }

  if (decision === 'valider') {
    await _validerTransaction(interaction.guild, tx, tx.photoUrl);
    delete db.transactionsPendantes[txId];
    saveDB(db);
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).setTitle(`✅ Approuvée — ${txId}`).addFields({ name: '✅ Approuvé par', value: interaction.user.username, inline: true })], components: [] });
    try { const member = await interaction.guild.members.fetch(tx.userId).catch(() => null); if (member) await member.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Transaction approuvée — IWC').setDescription(`Ta sortie de **$${tx.montant.toLocaleString('fr-FR')}** a été **approuvée** par la Direction.`).addFields({ name: '📋 Objet', value: tx.objet, inline: true }, { name: '🆔 Réf.', value: `\`${txId}\``, inline: true }).setFooter({ text: tx.coffre === 'Illégal' ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })] }).catch(() => {}); } catch {}
  } else {
    delete db.transactionsPendantes[txId];
    saveDB(db);
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setTitle(`❌ Refusée — ${txId}`).addFields({ name: '❌ Refusé par', value: interaction.user.username, inline: true })], components: [] });
    try { const member = await interaction.guild.members.fetch(tx.userId).catch(() => null); if (member) await member.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Transaction refusée — IWC').setDescription(`Ta sortie de **$${tx.montant.toLocaleString('fr-FR')}** a été **refusée** par la Direction.`).addFields({ name: '📋 Objet', value: tx.objet, inline: true }, { name: '🆔 Réf.', value: `\`${txId}\``, inline: true }).setFooter({ text: tx.coffre === 'Illégal' ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })] }).catch(() => {}); } catch {}
  }
}

function _isDirection(member) {
  return member?.roles?.cache?.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier'].some(n => r.name.includes(n)));
}

async function setupTresorButton(guild) {
  const ch = guild.channels.cache.find(c => c.name?.includes('coffre-entreprise'));
  if (!ch) return;
  const db = loadDB();

  // Récupérer tous les messages du salon (pas seulement les messages bot)
  let allMsgs = [];
  try {
    let lastId = null;
    for (let i = 0; i < 3; i++) {
      const opts = { limit: 100 };
      if (lastId) opts.before = lastId;
      const batch = await ch.messages.fetch(opts);
      if (!batch.size) break;
      allMsgs = allMsgs.concat([...batch.values()]);
      lastId = batch.last()?.id;
      if (batch.size < 100) break;
    }
  } catch {}

  // Séparer : panel bot (avec boutons) vs tout le reste
  const botMsgs = allMsgs.filter(m => m.author.id === guild.members.me?.id);
  const panels  = botMsgs.filter(m => m.components?.length > 0 && m.embeds?.[0]?.title?.includes('Trésorerie'));
  const autres  = botMsgs.filter(m => !panels.find(p => p.id === m.id));

  // Supprimer TOUS les messages bot qui ne sont pas le panel principal
  for (const m of autres) await m.delete().catch(() => {});
  // Supprimer les doublons de panels
  for (let i = 1; i < panels.length; i++) await panels[i].delete().catch(() => {});

  // Mettre à jour ou créer le panel
  if (panels.length > 0) {
    try {
      await panels[0].edit({ embeds: [_tresorEmbed()], components: [_tresorRow()] });
      db.tresorButtonMsgId = panels[0].id;
      saveDB(db);
      return;
    } catch { await panels[0].delete().catch(() => {}); }
  }

  // Chercher par ID sauvegardé
  if (db.tresorButtonMsgId) {
    try {
      const existing = await ch.messages.fetch(db.tresorButtonMsgId);
      if (existing) {
        await existing.edit({ embeds: [_tresorEmbed()], components: [_tresorRow()] });
        return;
      }
    } catch {}
  }

  // Créer un nouveau panel
  const msg = await ch.send({ embeds: [_tresorEmbed()], components: [_tresorRow()] });
  db.tresorButtonMsgId = msg.id;
  saveDB(db);
}

function _tresorEmbed() {
  const db = loadDB(); const legal = db.coffres?.legal || 0; const illega = db.coffres?.illegal || 0;
  return new EmbedBuilder().setColor(0x8B1A1A).setTitle('💰 Trésorerie — Iron Wolf Company').setDescription('Enregistrez chaque mouvement financier via le bouton ci-dessous.\nToute transaction est archivée automatiquement dans Notion.').addFields({ name: '⚖️ Coffre Légal', value: `**$${legal.toLocaleString('fr-FR')}**`, inline: true }, { name: '🔒 Coffre Illégal', value: `**$${illega.toLocaleString('fr-FR')}**`, inline: true }, { name: '💼 Total', value: `**$${(legal + illega).toLocaleString('fr-FR')}**`, inline: true }).setFooter({ text: `IWC • Trésorerie automatique • Mis à jour le ${new Date().toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}` }).setTimestamp();
}
function _tresorRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_nouvelle_transaction').setLabel('💰 Nouvelle Transaction').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId('btn_solde').setLabel('📊 Voir les soldes').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('btn_tresor_config').setLabel('⚙️').setStyle(ButtonStyle.Secondary));
}

async function handleSoldeButton(interaction) {
  const db = loadDB(); const legal = db.coffres?.legal || 0; const illega = db.coffres?.illegal || 0;
  const ch = interaction.guild.channels.cache.find(c => c.name?.includes('coffre-entreprise'));
  if (ch && db.tresorButtonMsgId) { const msg = await ch.messages.fetch(db.tresorButtonMsgId).catch(() => null); if (msg) await msg.edit({ embeds: [_tresorEmbed()], components: [_tresorRow()] }).catch(() => {}); }
  await interaction.reply({ flags: MessageFlags.Ephemeral, content: `💰 **Soldes mis à jour dans le salon**\n⚖️ Légal : **$${legal.toLocaleString('fr-FR')}** · 🔒 Illégal : **$${illega.toLocaleString('fr-FR')}** · Total : **$${(legal + illega).toLocaleString('fr-FR')}**` });
}

async function _archiverTransactionNotion({ objet, type, coffre, montant, solde, responsable, date }) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_TRESORERIE_DB) { console.log('⚠️ NOTION_TRESORERIE_DB non configuré — transaction non archivée dans Notion'); return; }
  try {
    const res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: process.env.NOTION_TRESORERIE_DB }, properties: { 'Objet': { title: [{ text: { content: objet || '—' } }] }, 'Type': { select: { name: type === 'Entrée' ? '📥 Entrée' : '📤 Sortie' } }, 'Coffre': { select: { name: coffre === 'Illégal' ? '🔒 Illégal' : '⚖️ Légal' } }, 'Montant': { number: montant }, 'Solde': { number: solde }, 'Responsable': { rich_text: [{ text: { content: responsable || '—' } }] }, 'Date': { date: { start: date ? new Date(date).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } } } }) });
    const data = await res.json();
    if (data.object === 'error') { console.log('❌ Notion trésorerie error:', data.message); return; }
    console.log(`✅ Transaction archivée dans Notion : ${objet} — ${type} $${montant}`);
  } catch (e) { console.log('❌ _archiverTransactionNotion error:', e.message); }
}

const JOURNAL_DB_KEY = 'journalIC';

async function _ajouterJournalIC(guild, entry) {
  const db = loadDB();
  if (!db[JOURNAL_DB_KEY]) db[JOURNAL_DB_KEY] = [];
  db[JOURNAL_DB_KEY].unshift({ id: Date.now().toString(), date: new Date().toISOString(), type: entry.type || 'autre', emoji: entry.emoji || '📝', titre: entry.titre || '—', description: entry.description || '—', auteur: entry.auteur || '—' });
  db[JOURNAL_DB_KEY] = db[JOURNAL_DB_KEY].slice(0, 200);
  saveDB(db);
  const embed = new EmbedBuilder().setColor(_journalColor(entry.type)).setTitle(`${entry.emoji} ${entry.titre}`).setDescription(entry.description).addFields({ name: '👤 Auteur', value: entry.auteur || '—', inline: true }).setFooter({ text: `IWC Journal • ${entry.auteur}` }).setTimestamp();
  const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
  const journalCh = guild?.channels?.cache?.find(c => c.isTextBased?.() && clean(c.name).includes(clean('journal-de-bord')));
  if (journalCh) await journalCh.send({ embeds: [embed] }).catch(() => {});
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

async function handleContratsArchives(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
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
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Tableau de Bord — Iron Wolf Company').setDescription(`*Snapshot au ${new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}*`).addFields({ name: '👥 EFFECTIFS', value: [`Actifs : **${actifs}** · Probatoires : **${probatoires}**`, `Absents : **${absents}** · Inactifs : **${inactifs}**`, `Capacité : \`${bar}\` ${Math.round(fillRate * 100)}%`].join('\n'), inline: false }, { name: '💰 TRÉSORERIE', value: [`⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${illegal.toLocaleString('fr-FR')}**`, `💼 Total : **$${(legal + illegal).toLocaleString('fr-FR')}**`].join('\n'), inline: true }, { name: '🎯 OPÉRATIONS', value: [`🟢 En cours : **${opsEnCours}**`, `🟡 En prépa : **${opsPrepa}**`, `✅ Cette semaine : **${opsTerminees7j}**`].join('\n'), inline: true }, { name: '📜 CONTRATS', value: [`✅ Actifs : **${contratsActifs}**`, `⚠️ Expirés : **${contratsExpires}**`, `📥 Candidatures : **${candsEnAttente}**`].join('\n'), inline: true }, { name: '📅 PROCHAIN RDV', value: prochainRdv ? `**${prochainRdv.titre || prochainRdv.name || 'Session'}** — ${_fmtDate(prochainRdv.date || prochainRdv.heure)}\n📍 ${prochainRdv.lieu || '—'}` : '*Aucun RDV planifié*', inline: false }, { name: '🚨 ALERTES', value: alertes.length > 0 ? alertes.join('\n') : '✅ Aucune alerte active', inline: false }).setFooter({ text: 'IWC Dashboard · /dashboard pour rafraîchir' }).setTimestamp()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_dashboard_refresh').setLabel('🔄 Rafraîchir').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId('btn_solde').setLabel('💰 Soldes détaillés').setStyle(ButtonStyle.Primary))] });
}

async function handleFichePersonnage(message) {
  if (message.author.bot || !message.guild) return;

  const db      = loadDB();
  const isDir   = message.member?.roles?.cache?.some(r =>
    ['Concepteur','Fléau','Fondateur','Directeur','Officier','Co-Directeur'].some(n => r.name.includes(n))
  );

  const lines = message.content.split('\n');
  const get = (...keys) => { for (const key of keys) { const line = lines.find(l => l.toUpperCase().includes(key.toUpperCase()) && l.includes(':')); if (line) { const val = line.split(':').slice(1).join(':').trim(); if (val) return val; } } return '—'; };
  const nom = get('NOM COMPLET', 'NOM'); const surnom = get('SURNOM'); const age = get('ÂGE', 'AGE'); const naissance = get('LIEU DE NAISSANCE', 'NAISSANCE'); const nationalite = get('NATIONALITÉ', 'NATIONALITE'); const taille = get('TAILLE', 'CORPULENCE'); const yeux = get('YEUX', 'CHEVEUX'); const signes = get('SIGNES PARTICULIERS', 'SIGNES'); const profession = get('PROFESSION', 'MÉTIER', 'METIER'); const reputation = get('RÉPUTATION', 'REPUTATION');
  const extractBloc = (marker) => { const idx = lines.findIndex(l => l.replace(/[—\-\s]/g, '').toUpperCase().includes(marker.toUpperCase().replace(/\s/g, ''))); if (idx < 0) return null; const bloc = []; for (let i = idx + 1; i < lines.length; i++) { const l = lines[i].trim(); if (!l) continue; if (/^—{2,}/.test(l) || /^={2,}/.test(l)) break; bloc.push(l); } return bloc.length ? bloc.join('\n').slice(0, 1000) : null; };
  const histoire = extractBloc('HISTOIRE'); const personnalite = extractBloc('PERSONNALITÉ'); const competences = extractBloc('COMPÉTENCES'); const faiblesses = extractBloc('FAIBLESSES'); const liens = extractBloc('LIENS'); const objectif = extractBloc('OBJECTIF');
  const citation = lines.find(l => /^[""]/.test(l.trim()) || /^\*"/.test(l.trim()));
  const membre = db.members[message.author.id]; const pole = membre?.pole || _getPole(message.member); const isIlleg = pole === 'illegal'; const color = isIlleg ? 0x8B1A1A : 0x3B82F6; const nomPerso = nom !== '—' ? nom : message.author.username;
  // ── Vérifier si la fiche existe déjà et si l'auteur est autorisé ──
  if (!db.fiches) db.fiches = {};
  const ficheExistante = db.fiches[nomPerso.toLowerCase()];

  if (ficheExistante && ficheExistante.discordId !== message.author.id && !isDir) {
    await message.react('❌').catch(() => {});
    const rejet = await message.reply({
      content: `❌ **Fiche protégée** — La fiche de **${nomPerso}** appartient à <@${ficheExistante.discordId}>.
*Seul son auteur ou la Direction peut la modifier.*`,
    }).catch(() => null);
    if (rejet) setTimeout(() => rejet.delete().catch(() => {}), 10000);
    setTimeout(() => message.delete().catch(() => {}), 10000);
    return;
  }

  // Enregistrer/mettre à jour le propriétaire de la fiche
  db.fiches[nomPerso.toLowerCase()] = { discordId: message.author.id, username: message.author.username, nomPerso, updatedAt: new Date().toISOString() };
  saveDB(db);

  await message.react('✅').catch(() => {});
  // Supprimer le message original après 5 secondes pour garder le salon propre
  setTimeout(() => message.delete().catch(() => {}), 5000);
  const embedCompact = new EmbedBuilder().setColor(color).setAuthor({ name: isIlleg ? '🔒 La Confrérie — Fiche Personnage' : '⚖️ Iron Wolf Company — Fiche Personnage', iconURL: message.guild.iconURL() || undefined }).setTitle(`👤 ${nomPerso}`).setThumbnail(message.author.displayAvatarURL({ size: 256 }));
  if (citation) embedCompact.setDescription(`> *${citation.replace(/^[\*""\s]+|[\*""\s]+$/g, '')}*`);
  const identiteLines = [`**Surnom :** ${surnom}`, `**Âge :** ${age}`, `**Nationalité :** ${nationalite}`, `**Né(e) à :** ${naissance}`];
  if (telegramme !== '—') identiteLines.push(`**📨 Télégramme :** ${telegramme}`);
  embedCompact.addFields({ name: '🎭 Identité', value: identiteLines.join('\n'), inline: true }, { name: '🔍 Physique', value: [`**Taille :** ${taille}`, `**Yeux / Cheveux :** ${yeux}`, `**Signes :** ${signes}`].join('\n'), inline: true });
  if (profession !== '—') embedCompact.addFields({ name: '💼 Profession', value: profession, inline: false });
  if (reputation !== '—') embedCompact.addFields({ name: '⭐ Réputation', value: reputation, inline: false });
  if (histoire) embedCompact.addFields({ name: '📖 Histoire (extrait)', value: histoire.slice(0, 300) + (histoire.length > 300 ? '...' : ''), inline: false });
  embedCompact.addFields({ name: '👤 Joueur', value: `<@${message.author.id}>`, inline: true }, { name: '📂 Pôle', value: isIlleg ? '🔒 Illégal' : '⚖️ Légal', inline: true }).setFooter({ text: `IWC • Fiche personnage • ${new Date().toLocaleDateString('fr-FR')}` }).setTimestamp();
  const reponse = await message.reply({ embeds: [embedCompact] }).catch(() => null);
  let thread = null;
  try {
    const threads = await message.channel.threads.fetchArchived().catch(() => null); const activeT = await message.channel.threads.fetchActive().catch(() => null); const allT = [...(activeT?.threads?.values() || []), ...(threads?.threads?.values() || [])];
    thread = allT.find(t => t.name.toLowerCase().includes(nomPerso.toLowerCase()));
    if (!thread) { thread = await message.startThread({ name: `📋 ${nomPerso}`, autoArchiveDuration: 10080, reason: `Fiche personnage — ${nomPerso}` }); }
    else if (thread.archived) await thread.setArchived(false).catch(() => {});
  } catch (e) { console.log('❌ Thread fiche error:', e.message); }
  if (thread) {
    const embedFull = new EmbedBuilder().setColor(color).setAuthor({ name: isIlleg ? '🔒 La Confrérie — Fiche Officielle' : '⚖️ Iron Wolf Company — Fiche Officielle', iconURL: message.guild.iconURL() || undefined }).setTitle(`👤 ${nomPerso}`).setThumbnail(message.author.displayAvatarURL({ size: 256 }));
    if (citation) embedFull.setDescription(`> *${citation.replace(/^[\*""\s]+|[\*""\s]+$/g, '')}*\n\u200b`);
    const identiteLinesFull = [`**Nom complet :** ${nom}`, `**Surnom(s) :** ${surnom}`, `**Âge :** ${age}`, `**Nationalité :** ${nationalite}`, `**Né(e) à :** ${naissance}`];
    if (telegramme !== '—') identiteLinesFull.push(`**📨 Télégramme :** ${telegramme}`);
    embedFull.addFields({ name: '🎭 Identité', value: identiteLinesFull.join('\n'), inline: true }, { name: '🔍 Physique', value: [`**Taille :** ${taille}`, `**Yeux / Cheveux :** ${yeux}`, `**Signes :** ${signes}`].join('\n'), inline: true });
    if (profession !== '—') embedFull.addFields({ name: '💼 Profession', value: profession, inline: false });
    if (reputation !== '—') embedFull.addFields({ name: '⭐ Réputation', value: reputation, inline: false });
    if (histoire) embedFull.addFields({ name: '📖 Histoire', value: histoire.slice(0, 1000), inline: false });
    if (personnalite) embedFull.addFields({ name: '🧠 Personnalité', value: personnalite.slice(0, 500), inline: false });
    if (competences) embedFull.addFields({ name: '⚔️ Compétences', value: competences.slice(0, 500), inline: true });
    if (faiblesses) embedFull.addFields({ name: '💔 Faiblesses', value: faiblesses.slice(0, 500), inline: true });
    if (liens) embedFull.addFields({ name: '🔗 Liens importants', value: liens.slice(0, 500), inline: false });
    if (objectif) embedFull.addFields({ name: '🎯 Objectif', value: objectif.slice(0, 300), inline: false });
    embedFull.addFields({ name: '\u200b', value: '\u200b', inline: false }, { name: '👤 Joueur Discord', value: `<@${message.author.id}>`, inline: true }, { name: '📂 Pôle', value: isIlleg ? '🔒 La Confrérie' : '⚖️ Iron Wolf Company', inline: true }, { name: '📅 Créée le', value: new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' }), inline: true }).setFooter({ text: 'IWC • Fiche complète • Ce thread est dédié aux évolutions du personnage' }).setTimestamp();
    await thread.send({ content: `📋 **Fiche officielle de ${nomPerso}** — mise à jour automatiquement à chaque modification.`, embeds: [embedFull] }).catch(() => {});
    await thread.send({ content: [`## 📝 Historique des évolutions`, `*Ce thread enregistre toutes les mises à jour de la fiche de **${nomPerso}**.*`, `*Pour mettre à jour ta fiche, reposte-la dans <#${message.channel.id}>.*`, '```', `📅 ${new Date().toLocaleDateString('fr-FR')} — Fiche créée / mise à jour par <@${message.author.id}>`, '```'].join('\n') }).catch(() => {});
  }
  _syncFicheNotion(message.author.id, { nom: nomPerso, surnom, age, naissance, nationalite, taille, yeux, signes, profession, reputation, telegramme, histoire: histoire || '—', personnalite: personnalite || '—', competences: competences || '—', faiblesses: faiblesses || '—', objectif: objectif || '—', citation: citation ? citation.replace(/^[\*""\s]+|[\*""\s]+$/g, '') : '—', pole: isIlleg ? 'Illégal' : 'Légal', threadId: thread?.id || '—', discordId: message.author.id, discordUsername: message.author.username }).catch(() => {});
}

async function _syncFicheNotion(discordId, data) {
  if (!process.env.NOTION_TOKEN) return;
  const FICHES_DB = process.env.NOTION_FICHES_DB;
  if (FICHES_DB) {
    try {
      const search = await fetch(`https://api.notion.com/v1/databases/${FICHES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }) });
      const { results } = await search.json(); const existing = results?.[0];
      const ficheProps = { 'Nom du personnage': { title: [{ text: { content: data.nom } }] }, 'Surnom': { rich_text: [{ text: { content: data.surnom } }] }, 'Âge': { rich_text: [{ text: { content: data.age } }] }, 'Nationalité': { rich_text: [{ text: { content: data.nationalite } }] }, 'Lieu de naissance': { rich_text: [{ text: { content: data.naissance } }] }, 'Taille / Corpulence': { rich_text: [{ text: { content: data.taille } }] }, 'Yeux / Cheveux': { rich_text: [{ text: { content: data.yeux } }] }, 'Signes particuliers': { rich_text: [{ text: { content: data.signes } }] }, 'Profession': { rich_text: [{ text: { content: data.profession } }] }, 'Réputation': { rich_text: [{ text: { content: data.reputation } }] }, 'Histoire': { rich_text: [{ text: { content: (data.histoire || '').slice(0, 2000) } }] }, 'Personnalité': { rich_text: [{ text: { content: (data.personnalite || '').slice(0, 2000) } }] }, 'Compétences': { rich_text: [{ text: { content: (data.competences || '').slice(0, 2000) } }] }, 'Faiblesses': { rich_text: [{ text: { content: (data.faiblesses || '').slice(0, 2000) } }] }, 'Objectif': { rich_text: [{ text: { content: (data.objectif || '').slice(0, 2000) } }] }, 'Citation': { rich_text: [{ text: { content: data.citation || '—' } }] }, 'Pôle': { select: { name: data.pole === 'Illégal' ? '🔒 Illégal' : '⚖️ Légal' } }, 'Discord ID': { rich_text: [{ text: { content: discordId } }] }, 'Discord Username': { rich_text: [{ text: { content: data.discordUsername } }] }, 'Thread Discord': { rich_text: [{ text: { content: data.threadId !== '—' ? `https://discord.com/channels/${data.threadId}` : '—' } }] }, 'Dernière MàJ': { date: { start: new Date().toISOString().split('T')[0] } } };
      if (existing) { await fetch(`https://api.notion.com/v1/pages/${existing.id}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: ficheProps }) }); console.log(`✅ Fiche Notion MàJ : ${data.nom}`); }
      else { await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: FICHES_DB }, properties: { ...ficheProps, 'Date de création': { date: { start: new Date().toISOString().split('T')[0] } } } }) }); console.log(`✅ Fiche Notion créée : ${data.nom}`); }
    } catch (e) { console.log('❌ Sync Fiches_personnages error:', e.message); }
  }
  const MEMBRES_DB = process.env.NOTION_MEMBRES_DB;
  if (MEMBRES_DB) {
    try {
      const search = await fetch(`https://api.notion.com/v1/databases/${MEMBRES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }) });
      const { results } = await search.json(); const existing = results?.[0];
      if (existing) { await fetch(`https://api.notion.com/v1/pages/${existing.id}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ properties: { 'Personnage': { rich_text: [{ text: { content: data.nom } }] }, 'Profession': { rich_text: [{ text: { content: data.profession } }] }, 'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } } } }) }); console.log(`✅ Registre Membres MàJ : ${data.nom}`); }
    } catch (e) { console.log('❌ Sync Registre Membres error:', e.message); }
  }
}

function _fmtDate(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function _isFleau(member) { return member?.roles?.cache?.some(r => ['Fléau', 'Fleau', 'Concepteur', 'Fondateur'].some(n => r.name.toLowerCase().includes(n.toLowerCase()))); }

async function handleTresorConfigButton(interaction) {
  if (!_isFleau(interaction.member)) return interaction.reply({ content: '❌ Accès réservé au Fléau et au Concepteur.', flags: MessageFlags.Ephemeral });
  const db = loadDB(); const limL = db.limiteSortieLegal || LIMITE_SORTIE_LEGAL; const limI = db.limiteSortieIllegal || LIMITE_SORTIE_ILLEGAL;
  const { StringSelectMenuBuilder } = require('discord.js');
  const optionsLegal = [500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000].map(v => ({ label: `$${v.toLocaleString('fr-FR')}`, value: `legal_${v}`, description: 'Limite sortie coffre légal', default: v === limL }));
  const optionsIllegal = [500, 1000, 2000, 3000, 5000, 7500, 10000, 15000, 20000].map(v => ({ label: `$${v.toLocaleString('fr-FR')}`, value: `illegal_${v}`, description: 'Limite sortie coffre illégal', default: v === limI }));
  await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('⚙️ Configuration Trésorerie — Direction').setDescription(['*Ce panneau est visible uniquement par le Fléau et le Concepteur.*', '', '**Limite de sortie** — Au-delà de ce montant, une sortie nécessite une validation de la Direction.', '', `⚖️ Coffre Légal actuel : **$${limL.toLocaleString('fr-FR')}**`, `🔒 Coffre Illégal actuel : **$${limI.toLocaleString('fr-FR')}**`].join('\n')).setFooter({ text: 'IWC • Configuration trésorerie • Fléau & Concepteur' })], components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tresor_config_limite_legal').setPlaceholder(`⚖️ Limite sortie légal — actuellement $${limL.toLocaleString('fr-FR')}`).addOptions(optionsLegal)), new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tresor_config_limite_illegal').setPlaceholder(`🔒 Limite sortie illégal — actuellement $${limI.toLocaleString('fr-FR')}`).addOptions(optionsIllegal))] });
}

async function handleTresorConfigSelect(interaction) {
  if (!_isFleau(interaction.member)) return interaction.reply({ content: '❌ Accès réservé au Fléau et au Concepteur.', flags: MessageFlags.Ephemeral });
  const val = interaction.values[0]; const [type, montantStr] = val.split('_'); const montant = parseInt(montantStr, 10); const isLegal = type === 'legal';
  const db = loadDB(); if (isLegal) db.limiteSortieLegal = montant; else db.limiteSortieIllegal = montant; saveDB(db);
  const label = isLegal ? '⚖️ Coffre Légal' : '🔒 Coffre Illégal';
  await interaction.update({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Limite mise à jour').setDescription([`${label} — nouvelle limite de sortie :`, `# $${montant.toLocaleString('fr-FR')}`, '', '*Au-delà de ce montant, toute sortie nécessite ton approbation.*'].join('\n')).setFooter({ text: `Modifié par ${interaction.user.username} • IWC` }).setTimestamp()], components: [] });
  console.log(`✅ Limite sortie ${isLegal ? 'légal' : 'illégal'} mise à jour : $${montant} par ${interaction.user.username}`);
}

function nettoyerTransactionsFantôomes() {
  const db = loadDB(); if (!db.transactionsPendantes) return;
  const now = Date.now(); const limite = 10 * 60 * 1000; let changed = false;
  for (const [txId, tx] of Object.entries(db.transactionsPendantes)) { if (now - new Date(tx.createdAt).getTime() > limite) { delete db.transactionsPendantes[txId]; changed = true; console.log(`🧹 Transaction fantôme supprimée : ${txId}`); } }
  if (changed) saveDB(db);
}

async function handleProfilCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const cible = interaction.options?.getUser('membre') || interaction.user; const membre = await interaction.guild.members.fetch(cible.id).catch(() => null); const db = loadDB(); const data = db.members[cible.id];
  let ficheNotion = null;
  if (process.env.NOTION_TOKEN && process.env.NOTION_FICHES_DB) { try { const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_FICHES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: cible.id } }, page_size: 1 }) }); const d = await res.json(); ficheNotion = d.results?.[0]; } catch {} }
  const nomPerso = ficheNotion?.properties?.['Nom du personnage']?.title?.[0]?.plain_text || data?.name || cible.username; const profession = ficheNotion?.properties?.['Profession']?.rich_text?.[0]?.plain_text || '—'; const reputation = ficheNotion?.properties?.['Réputation']?.rich_text?.[0]?.plain_text || '—'; const pole = ficheNotion?.properties?.['Pôle']?.select?.name || (data?.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal'); const rang = data?.rang || membre?.roles.cache.filter(r => !r.managed && r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name || '—'; const statut = data?.status || 'actif'; const derniereAct = data?.lastActivity; const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', parti: '🚪', visiteur: '👁️' }[statut] || '❓'; const color = pole.includes('Illégal') ? 0x8B1A1A : 0x3B82F6;
  const embed = new EmbedBuilder().setColor(color).setAuthor({ name: pole.includes('Illégal') ? '🔒 La Confrérie' : '⚖️ Iron Wolf Company', iconURL: interaction.guild.iconURL() || undefined }).setTitle(`👤 ${nomPerso}`).setThumbnail(cible.displayAvatarURL({ size: 256 })).addFields({ name: '🎖️ Grade', value: rang, inline: true }, { name: '📂 Pôle', value: pole, inline: true }, { name: `${statutEmoji} Statut`, value: statut.charAt(0).toUpperCase() + statut.slice(1), inline: true });
  if (profession !== '—') embed.addFields({ name: '💼 Profession', value: profession, inline: true });
  if (reputation !== '—') embed.addFields({ name: '⭐ Réputation', value: reputation, inline: true });
  embed.addFields({ name: '📅 Dernière activité', value: derniereAct ? _fmtDate(derniereAct) + ` *(${daysSince(derniereAct)}j)*` : '—', inline: true }, { name: '👤 Discord', value: `<@${cible.id}>`, inline: true });
  if (ficheNotion?.properties?.['Thread Discord']?.rich_text?.[0]?.plain_text?.startsWith('http')) embed.addFields({ name: '📋 Fiche complète', value: `[Voir le thread](${ficheNotion.properties['Thread Discord'].rich_text[0].plain_text})`, inline: true });
  embed.setFooter({ text: `IWC • Profil • ${new Date().toLocaleDateString('fr-FR')}` }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

async function handleBilanCommand(interaction) {
  await interaction.deferReply({ ephemeral: false });
  const db = loadDB(); const coffre = interaction.options?.getString('coffre') || 'legal';
  let transactions = [];
  if (process.env.NOTION_TOKEN && process.env.NOTION_TRESORERIE_DB) { try { const depuis = new Date(Date.now() - 7 * 86400000).toISOString().split('T')[0]; const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_TRESORERIE_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { and: [{ property: 'Date', date: { on_or_after: depuis } }, { property: 'Coffre', select: { equals: coffre === 'illegal' ? '🔒 Illégal' : '⚖️ Légal' } }] }, sorts: [{ property: 'Date', direction: 'descending' }], page_size: 20 }) }); const data = await res.json(); transactions = (data.results || []).map(p => ({ objet: p.properties['Objet']?.title?.[0]?.plain_text || '—', type: p.properties['Type']?.select?.name || '—', montant: p.properties['Montant']?.number || 0, solde: p.properties['Solde']?.number || 0, responsable: p.properties['Responsable']?.rich_text?.[0]?.plain_text || '—', date: p.properties['Date']?.date?.start || '—' })); } catch (e) { console.log('❌ Notion bilan error:', e.message); } }
  const key = coffre === 'illegal' ? 'illegal' : 'legal'; const soldeActuel = db.coffres?.[key] || 0; const label = coffre === 'illegal' ? '🔒 Coffre Illégal' : '⚖️ Coffre Légal'; const color = coffre === 'illegal' ? 0x8B1A1A : 0x3B82F6;
  const entrees = transactions.filter(t => t.type.includes('Entrée')); const sorties = transactions.filter(t => t.type.includes('Sortie')); const totalEntrees = entrees.reduce((s, t) => s + t.montant, 0); const totalSorties = sorties.reduce((s, t) => s + t.montant, 0);
  const embed = new EmbedBuilder().setColor(color).setTitle(`📊 Bilan — ${label}`).setDescription(`*7 derniers jours — ${new Date(Date.now() - 7 * 86400000).toLocaleDateString('fr-FR')} → ${new Date().toLocaleDateString('fr-FR')}*`).addFields({ name: '💰 Solde actuel', value: `**$${soldeActuel.toLocaleString('fr-FR')}**`, inline: true }, { name: '📥 Total entrées', value: `**+$${totalEntrees.toLocaleString('fr-FR')}**`, inline: true }, { name: '📤 Total sorties', value: `**-$${totalSorties.toLocaleString('fr-FR')}**`, inline: true });
  if (transactions.length > 0) { const lignes = transactions.slice(0, 8).map(t => { const emoji = t.type.includes('Entrée') ? '📥' : '📤'; const signe = t.type.includes('Entrée') ? '+' : '-'; return `${emoji} \`${_fmtDate(t.date)}\` **${t.objet}** — ${signe}$${t.montant.toLocaleString('fr-FR')} · *${t.responsable}*`; }).join('\n'); embed.addFields({ name: `📋 Dernières transactions (${transactions.length})`, value: lignes, inline: false }); }
  else { embed.addFields({ name: '📋 Transactions', value: '*Aucune transaction sur les 7 derniers jours.*', inline: false }); }
  embed.setFooter({ text: `IWC • Bilan automatique • ${new Date().toLocaleString('fr-FR')}` }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

async function checkAlerteCoffre(guild) {
  try {
    const db = loadDB(); const legal = db.coffres?.legal || 0; const illegal = db.coffres?.illegal || 0;
    const logsCh = guild.channels.cache.find(c => { const cl = s => s.toLowerCase().replace(/[^a-z0-9]/g, ''); return c.isTextBased?.() && cl(c.name).includes('logs'); });
    if (!logsCh) return;
    if (!db.alertesCoffre) db.alertesCoffre = {};
    if (legal < SEUIL_LEGAL && !db.alertesCoffre.legal) { await logsCh.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⚠️ Alerte — Coffre Légal bas').setDescription("Le **Coffre Légal** est passé sous le seuil d'alerte.").addFields({ name: '💰 Solde actuel', value: `**$${legal.toLocaleString('fr-FR')}**`, inline: true }, { name: '⚠️ Seuil', value: `$${SEUIL_LEGAL.toLocaleString('fr-FR')}`, inline: true }).setFooter({ text: 'IWC • Alerte automatique' }).setTimestamp()] }); db.alertesCoffre.legal = true; saveDB(db); }
    else if (legal >= SEUIL_LEGAL && db.alertesCoffre.legal) { db.alertesCoffre.legal = false; saveDB(db); }
    if (illegal < SEUIL_ILLEGAL && !db.alertesCoffre.illegal) { await logsCh.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('⚠️ Alerte — Coffre Illégal bas').setDescription("Le **Coffre Illégal** est passé sous le seuil d'alerte.").addFields({ name: '💰 Solde actuel', value: `**$${illegal.toLocaleString('fr-FR')}**`, inline: true }, { name: '⚠️ Seuil', value: `$${SEUIL_ILLEGAL.toLocaleString('fr-FR')}`, inline: true }).setFooter({ text: 'IWC • Alerte automatique' }).setTimestamp()] }); db.alertesCoffre.illegal = true; saveDB(db); }
    else if (illegal >= SEUIL_ILLEGAL && db.alertesCoffre.illegal) { db.alertesCoffre.illegal = false; saveDB(db); }
  } catch (e) { console.log('❌ checkAlerteCoffre error:', e.message); }
}

module.exports = {
  handleTresorCommand, handleTresorFlow, handleTresorModal, handleSoldeButton, setupTresorButton,
  handleTresorValidation, handleTresorConfigButton, handleTresorConfigSelect,
  nettoyerTransactionsFantôomes,
  ajouterJournalIC: _ajouterJournalIC,
  handleJournalCommand, handleJournalPagination,
  handleContratsArchives,
  handleDashboard,
  handleFichePersonnage,
  handleProfilCommand,
  handleBilanCommand,
  checkAlerteCoffre,
};

