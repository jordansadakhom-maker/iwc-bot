// ═══════════════════════════════════════════════════════════════
// FONCTIONS À REMPLACER/AJOUTER dans index.js
// Cherche chaque fonction par son nom et remplace le bloc entier
// ═══════════════════════════════════════════════════════════════

// ────────────────────────────────────────────────────────────────
// [1] NOUVELLES FONCTIONS — à coller juste avant client.login(...)
// ────────────────────────────────────────────────────────────────

async function _bloquerEcritureAbsent(guild, membre) {
  try {
    const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
    if (!roleAbsent) return;
    for (const [, channel] of guild.channels.cache) {
      if (!channel.isTextBased?.()) continue;
      if (channel.type === 4) continue;
      try {
        await channel.permissionOverwrites.edit(roleAbsent, {
          SendMessages: false,
          SendMessagesInThreads: false,
          CreatePublicThreads: false,
          CreatePrivateThreads: false,
        });
      } catch {}
    }
    console.log(`✅ Écriture bloquée pour rôle Absent`);
  } catch (e) { console.log('❌ _bloquerEcritureAbsent error:', e.message); }
}

async function _debloquerEcritureAbsent(guild, membre) {
  try {
    const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
    if (!roleAbsent) return;
    for (const [, channel] of guild.channels.cache) {
      if (!channel.isTextBased?.()) continue;
      if (channel.type === 4) continue;
      try {
        const existing = channel.permissionOverwrites.cache.get(roleAbsent.id);
        if (existing) await existing.delete();
      } catch {}
    }
    console.log(`✅ Écriture débloquée pour rôle Absent`);
  } catch (e) { console.log('❌ _debloquerEcritureAbsent error:', e.message); }
}

// ────────────────────────────────────────────────────────────────
// [2] REMPLACER la fonction setupSurnomFormat ENTIÈRE
// ────────────────────────────────────────────────────────────────

async function setupSurnomFormat(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && (clean(c.name).includes('surnompseudo') || clean(c.name).includes('surnom')));
    if (!ch) return;

    const msgs = await ch.messages.fetch({ limit: 20 });

    // Skip complet si panel avec bouton déjà présent
    const existing = msgs.find(m =>
      m.author.id === guild.members.me?.id &&
      m.components?.length > 0 &&
      m.embeds[0]?.title?.includes('IDENTITÉ')
    );
    if (existing) { console.log('✅ Panel surnom-pseudo déjà présent — skip'); return; }

    // Supprimer les doublons (messages bot sans bouton = anciens)
    for (const [, m] of msgs) {
      if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {});
    }

    // Ne reposter que si aucun panel valide
    await ch.send({
      embeds: [new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle('🎭 IDENTITÉ IC — Iron Wolf Company')
        .setDescription([
          '*Renseignez votre identité In Character pour faciliter les interactions RP.*',
          '*Notion et le Registre des Membres sont mis à jour automatiquement.*',
          '',
          '**Cliquez le bouton ci-dessous pour renseigner votre identité.**',
          '*Un formulaire s\'ouvre avec les champs à remplir.*',
        ].join('\n'))
        .setFooter({ text: 'IWC • Identité IC • Mis à jour automatiquement dans Notion' })
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('btn_surnom_ouvrir').setLabel('✏️ Renseigner mon identité IC').setStyle(ButtonStyle.Primary),
      )],
    });
    console.log('✅ Panel surnom-pseudo posté');
  } catch(e) { console.log('❌ setupSurnomFormat error:', e.message); }
}

// ────────────────────────────────────────────────────────────────
// [3] REMPLACER la fonction _validerModalAgendaSimple ENTIÈRE
// ────────────────────────────────────────────────────────────────

async function _validerModalAgendaSimple(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const titre      = interaction.fields.getTextInputValue('titre');
  const dateRaw    = interaction.fields.getTextInputValue('date');
  const heure      = interaction.fields.getTextInputValue('heure');
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim() || '';
  const lieuVille  = interaction.customId.replace('modal_agenda_simple_', '').replace('modal_agenda_simple', '');
  const lieu       = lieuDetail || (lieuVille ? decodeURIComponent(lieuVille) : '—');
  const notes      = interaction.fields.getTextInputValue('notes') || '';

  let dateISO = null;
  try { const p = dateRaw.split('/'); if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });

  const db         = loadDB();
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const rdvId      = `RDV-${Date.now().toString().slice(-5)}`;
  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);

  // ── Étape photo : demander upload ou skip ──
  const skipId = `rdv_skip_photo_${interaction.id}`;

  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0x2C3E50)
      .setTitle('📸 Photo de repérage — optionnelle')
      .setDescription([
        `**📅 ${titre}** — ${heure} à ${lieu}`,
        '',
        '**Option 1 :** Envoie une capture d\'écran du lieu dans ce salon (depuis ton PC)',
        '**Option 2 :** Clique **Ignorer** pour poster le RDV sans photo',
        '',
        '*Tu as 2 minutes.*',
      ].join('\n'))
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(skipId)
        .setLabel('⏭️ Ignorer la photo')
        .setStyle(ButtonStyle.Secondary)
    )],
  });

  // Attendre photo OU bouton skip
  let photoUrl = null;
  try {
    const photoFilter = m => m.author.id === interaction.user.id && m.attachments.size > 0 && m.channel.id === interaction.channel.id;
    const btnFilter   = i => i.user.id === interaction.user.id && i.customId === skipId;

    await new Promise((resolve) => {
      // Collecteur photo
      const msgCollector = interaction.channel.createMessageCollector({ filter: photoFilter, max: 1, time: 120000 });
      // Collecteur bouton
      const btnCollector = interaction.channel.createMessageComponentCollector({ filter: btnFilter, max: 1, time: 120000 });

      msgCollector.on('collect', async msg => {
        photoUrl = msg.attachments.first().url;
        await msg.delete().catch(() => {});
        btnCollector.stop('photo');
        resolve();
      });
      btnCollector.on('collect', async i => {
        await i.deferUpdate().catch(() => {});
        msgCollector.stop('skip');
        resolve();
      });
      msgCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
      btnCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
    });
  } catch {}

  // Construire l'embed final
  const embed = new EmbedBuilder()
    .setColor(0x2C3E50)
    .setTitle(`📅 ${titre.toUpperCase()}`)
    .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — AVIS DE RENDEZ-VOUS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields(
      { name: '🆔 Référence',    value: '`' + rdvId + '`', inline: true },
      { name: '📅 Date',         value: dateCapital,         inline: true },
      { name: '🕐 Heure',        value: `**${heure}**`,     inline: true },
      { name: '📍 Lieu',         value: lieu,                inline: true },
      { name: '✍️ Créé par',     value: emetteurIC,         inline: true },
    );
  if (notes) embed.addFields({ name: '📋 Notes', value: notes });
  if (photoUrl) embed.setImage(photoUrl);
  embed.setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();

  // Poster dans #agenda avec ping
  const agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  if (agendaCh) {
    const isIlleg = interaction.member?.roles?.cache?.has(ROLE_POLE_ILLEGAL);
    const pingRole = isIlleg ? `<@&${ROLE_POLE_ILLEGAL}>` : `<@&${ROLE_POLE_LEGAL}>`;
    await agendaCh.send({ content: `${pingRole} — 📅 **${titre}** · ${heure} à ${lieu}`, embeds: [embed] }).catch(() => {});
  }

  await interaction.editReply({
    content: photoUrl ? '✅ RDV créé avec photo de repérage !' : '✅ RDV créé et posté dans #agenda !',
    embeds: [embed],
    components: [],
  });

  // Archivage Notion avec photo
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    const notionBody = {
      parent: { database_id: process.env.NOTION_AGENDA_DB_ID },
      properties: {
        'Titre': { title:     [{ text: { content: titre } }] },
        'Date':  { date:      { start: dateISO } },
        'Heure': { rich_text: [{ text: { content: heure } }] },
        'Lieu':  { rich_text: [{ text: { content: lieu !== '—' ? lieu : '' } }] },
        'Notes': { rich_text: [{ text: { content: notes.slice(0, 2000) } }] },
        'Statut': { select:   { name: 'Planifié' } },
        'Type':   { select:   { name: 'RDV' } },
        'Émetteur': { rich_text: [{ text: { content: emetteurIC } }] },
        ...(photoUrl ? { 'Photo': { files: [{ name: 'reperage.jpg', type: 'external', external: { url: photoUrl } }] } } : {}),
      },
    };
    fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(notionBody),
    }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) console.log(`✅ RDV archivé Notion : ${titre}${photoUrl ? ' + photo' : ''}`);
      else console.log(`❌ Notion RDV erreur: ${data?.message}`);
    }).catch(e => console.log('❌ Notion RDV error:', e.message));
  }

  // DM aux participants du pôle
  try {
    const isIlleg = interaction.member?.roles?.cache?.has(ROLE_POLE_ILLEGAL);
    const allMembers = await interaction.guild.members.fetch().catch(() => null);
    if (allMembers) {
      const cibles = allMembers.filter(m => {
        if (m.user.bot || m.id === interaction.user.id) return false;
        return isIlleg ? m.roles.cache.has(ROLE_POLE_ILLEGAL) : m.roles.cache.has(ROLE_POLE_LEGAL);
      });
      for (const [, membre] of cibles) {
        await envoyerDMRecap(interaction.guild, membre.id, 'rdv', {
          titre, date: dateCapital, heure, lieu,
        }).catch(() => {});
        await new Promise(r => setTimeout(r, 200));
      }
    }
  } catch(e) { console.log('❌ DM RDV error:', e.message); }
}

// ────────────────────────────────────────────────────────────────
// [4] REMPLACER le bloc /absent dans handleSlashCommand
// Chercher : if (commandName === 'absent') {
// Remplacer uniquement le bloc "Attribuer le rôle Absent"
// ────────────────────────────────────────────────────────────────

// AVANT :
//   const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
//   if (membreDiscord) {
//     const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
//     if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(e => console.log('❌ Rôle absent:', e.message));
//   }

// APRÈS (remplacer par) :
//   const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
//   if (membreDiscord) {
//     const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
//     if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(e => console.log('❌ Rôle absent:', e.message));
//     await _bloquerEcritureAbsent(guild, membreDiscord);
//   }

// ────────────────────────────────────────────────────────────────
// [5] REMPLACER _handleRetour ENTIÈRE
// ────────────────────────────────────────────────────────────────

async function _handleRetour(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const db = loadDB();
  const m  = db.members[interaction.user.id];

  if (!m) return interaction.editReply({ content: '❌ Tu n\'es pas enregistré dans le système.' });
  if (m.status === 'actif') return interaction.editReply({ content: '✅ Tu es déjà marqué comme actif.' });

  const ancienStatut = m.status;
  m.status        = 'actif';
  m.lastActivity  = new Date().toISOString();
  m.absentJusqu   = null;
  m.absentRaison  = null;
  saveDB(db);

  const membreRetour = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
  if (membreRetour) {
    const roleAbsent = interaction.guild.roles.cache.get(ROLE_ABSENT);
    if (roleAbsent) await membreRetour.roles.remove(roleAbsent).catch(() => {});
    await _debloquerEcritureAbsent(interaction.guild, membreRetour);
  }

  _syncMembreNotion(interaction.user.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});

  const absCh = getCh(interaction.guild, 'absences');
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setAuthor({ name: `${interaction.member?.displayName || interaction.user.username} — Retour`, iconURL: interaction.user.displayAvatarURL() })
    .setTitle('✅ Retour déclaré')
    .addFields(
      { name: '👤 Membre',    value: `<@${interaction.user.id}>`, inline: true },
      { name: '🎖️ Grade',    value: m.rang || '—',                inline: true },
      { name: '📅 Retour le', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
    )
    .setFooter({ text: 'IWC • Retour déclaré manuellement' })
    .setTimestamp()
  ] }).catch(() => {});

  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Retour enregistré')
    .setDescription(`Tu es de retour ! Ton statut a été mis à jour.\n\nAncien statut : **${ancienStatut}** → **Actif**\n*Tes permissions d\'écriture sont rétablies.*`)
    .setFooter({ text: 'IWC • Bienvenue de retour' })
  ] });
}

// ────────────────────────────────────────────────────────────────
// [6] REMPLACER _handleAnnulerAbsence ENTIÈRE
// ────────────────────────────────────────────────────────────────

async function _handleAnnulerAbsence(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const cible   = interaction.options.getUser('membre');
  const db      = loadDB();
  const m       = db.members[cible.id];

  if (!m || m.status !== 'absent') return interaction.editReply({ content: `❌ <@${cible.id}> n'est pas marqué absent.` });

  m.status       = 'actif';
  m.lastActivity = new Date().toISOString();
  m.absentJusqu  = null;
  m.absentRaison = null;
  saveDB(db);

  const membreD = await interaction.guild.members.fetch(cible.id).catch(() => null);
  if (membreD) {
    const roleAbsent = interaction.guild.roles.cache.get(ROLE_ABSENT);
    if (roleAbsent) await membreD.roles.remove(roleAbsent).catch(() => {});
    await _debloquerEcritureAbsent(interaction.guild, membreD);
  }

  _syncMembreNotion(cible.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});

  const absCh = getCh(interaction.guild, 'absences');
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('✅ Absence levée par la Direction')
    .addFields(
      { name: '👤 Membre',   value: `<@${cible.id}>`,                inline: true },
      { name: '✅ Levé par', value: interaction.user.username,        inline: true },
      { name: '📅 Date',     value: new Date().toLocaleDateString('fr-FR'), inline: true },
    )
    .setFooter({ text: 'IWC • Absence annulée par la Direction' })
    .setTimestamp()
  ] }).catch(() => {});

  try {
    await membreD?.send({ embeds: [new EmbedBuilder()
      .setColor(0x57F287)
      .setTitle('✅ Absence levée')
      .setDescription(`Ton absence a été levée par **${interaction.user.username}**.\nTes permissions d'écriture sont rétablies.`)
      .setFooter({ text: 'IWC' })
    ] });
  } catch {}

  await interaction.editReply({ content: `✅ Absence de <@${cible.id}> levée.` });
}

// ────────────────────────────────────────────────────────────────
// [7] REMPLACER _checkRetoursAbsence ENTIÈRE
// ────────────────────────────────────────────────────────────────

async function _checkRetoursAbsence(guild) {
  const db  = loadDB();
  const now = Date.now();
  let changed = false;

  for (const [userId, m] of Object.entries(db.members || {})) {
    if (m.status !== 'absent') continue;
    if (!m.absentJusqu) continue;

    const finAbsence = new Date(m.absentJusqu).getTime();
    if (now < finAbsence) continue;

    m.status       = 'actif';
    m.lastActivity = new Date().toISOString();
    m.absentJusqu  = null;
    m.absentRaison = null;
    changed = true;

    try {
      const membre = await guild.members.fetch(userId).catch(() => null);
      if (membre) {
        const roleAbsent = guild.roles.cache.get(ROLE_ABSENT);
        if (roleAbsent) await membre.roles.remove(roleAbsent).catch(() => {});
        await _debloquerEcritureAbsent(guild, membre);
      }
    } catch {}

    _syncMembreNotion(userId, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});

    const absCh = getChById(guild, 'ABSENCES', 'absences');
    if (absCh) {
      const discordMembre = await guild.members.fetch(userId).catch(() => null);
      await absCh.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setAuthor({ name: `${discordMembre?.displayName || m.name || userId} — Retour automatique`, iconURL: discordMembre?.user.displayAvatarURL() || undefined })
        .setTitle('✅ Fin d\'absence — Retour automatique')
        .addFields(
          { name: '👤 Membre',  value: `<@${userId}>`, inline: true },
          { name: '🎖️ Grade',  value: m.rang || '—',  inline: true },
          { name: '📅 Retour',  value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
        )
        .setFooter({ text: 'IWC • Retour automatique détecté' })
        .setTimestamp()
      ] }).catch(() => {});
    }

    try {
      const discordMembre = await guild.members.fetch(userId).catch(() => null);
      if (discordMembre) await discordMembre.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Fin de ton absence — IWC')
        .setDescription("Ta période d'absence est terminée.\nTes permissions d'écriture ont été rétablies automatiquement.\n*Bon retour !*")
        .setFooter({ text: 'IWC • Bienvenue de retour' })
      ] }).catch(() => {});
    } catch {}

    console.log(`✅ Retour automatique : ${m.name || userId}`);
  }

  if (changed) saveDB(db);
}

