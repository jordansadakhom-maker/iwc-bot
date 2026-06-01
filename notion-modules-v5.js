// ═══════════════════════════════════════════════════════════════
// notion-modules-v5.js — Opérations programmées · Stats avancées
//                         Threads candidatures · Journal IC hebdo
// IWC Bot v5.0
// ═══════════════════════════════════════════════════════════════

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

const { MEMBRES_DISCORD_MAP, ROLE_POLE_LEGAL, ROLE_POLE_ILLEGAL } = require('./config');

function fmtShort(d) { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' }); }
function fmtLong(d)  { return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' }); }
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

// ═══════════════════════════════════════════════════════════════
// 1. OPÉRATIONS PROGRAMMÉES
//    - Créée avec date/heure de début
//    - Inscription jusqu'au lancement automatique
//    - Bouton STOP pour arrêt d'urgence
//    - Cron vérifie toutes les minutes si une op doit se lancer
// ═══════════════════════════════════════════════════════════════

async function handleOpProgrammeeModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });

  const lines = interaction.fields.getTextInputValue('details').split('\n');
  const get   = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase()) && l.includes(':')); return l ? l.split(':').slice(1).join(':').trim() : ''; };

  const nom        = interaction.fields.getTextInputValue('nom').trim();
  const dateHeure  = interaction.fields.getTextInputValue('date_heure').trim();
  const lieu       = get('LIEU')     || interaction.fields.getTextInputValue('lieu')?.trim() || '—';
  const objectif   = get('OBJECTIF') || '—';
  const poleRaw    = get('PÔLE') || get('POLE') || 'legal';
  const pole       = poleRaw.toLowerCase().includes('ill') ? 'illegal' : 'legal';

  // Parser la date/heure — formats : "05/06/2026 21h00", "05/06 21h00", "21h00" (aujourd'hui)
  let lancementAt = null;
  try {
    const match = dateHeure.match(/(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*[àa]?\s*(\d{1,2})[hH:](\d{2})/);
    if (match) {
      const [, jour, mois, annee, hh, mm] = match;
      const year = annee || new Date().getFullYear();
      // Heure Paris → UTC (offset -1 ou -2 selon saison)
      const iso  = `${year}-${mois.padStart(2,'0')}-${jour.padStart(2,'0')}T${hh.padStart(2,'0')}:${mm}:00`;
      lancementAt = new Date(iso).getTime();
    } else {
      // Juste une heure → aujourd'hui
      const matchH = dateHeure.match(/(\d{1,2})[hH:](\d{2})/);
      if (matchH) {
        const now = new Date();
        now.setHours(parseInt(matchH[1]), parseInt(matchH[2]), 0, 0);
        lancementAt = now.getTime();
      }
    }
  } catch {}

  if (!lancementAt) {
    return interaction.editReply({ content: '❌ Format de date invalide.\nExemples : `05/06/2026 21h00` · `21h30` (ce soir)' });
  }

  const db = loadDB();
  const opId = Date.now().toString();
  const op = {
    id: opId, name: nom, lieu, objectif, pole,
    participants: [], status: 'programmee',
    lancementAt, equipe: '—',
    createdAt:  new Date().toISOString(),
    createdBy:  interaction.user.username,
  };

  if (!db.operations) db.operations = [];
  db.operations.push(op);
  saveDB(db);

  const color = pole === 'illegal' ? 0x8B1A1A : 0x3B82F6;
  // ROLE_POLE_LEGAL/ILLEGAL importés depuis config.js

  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🕐 OPÉRATION PROGRAMMÉE — ${nom}`)
    .setDescription('*Inscrivez-vous avant le lancement. L\'opération démarre automatiquement à l\'heure prévue.*')
    .addFields(
      { name: '📅 Lancement',   value: `**${new Date(lancementAt).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })} à ${new Date(lancementAt).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })}**`, inline: false },
      { name: '📍 Lieu',        value: lieu,     inline: true },
      { name: '🎯 Objectif',    value: objectif, inline: true },
      { name: '📂 Pôle',        value: pole === 'illegal' ? '🔪 Illégal' : '⚖️ Légal', inline: true },
      { name: '👥 Participants (0)', value: '*Aucune inscription pour l\'instant.*', inline: false },
    )
    .setFooter({ text: `ID: ${opId} • Créée par ${interaction.user.username}` })
    .setTimestamp();

  const rowP = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_participer_${opId}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`op_retrait_${opId}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary),
  );
  const rowG = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_lancer_force_${opId}`).setLabel('🟢 Lancer maintenant').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`op_stop_${opId}`).setLabel('🛑 STOP d\'urgence').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`op_annulee_${opId}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Secondary),
  );

  const opsCh = getCh(interaction.guild, 'operations-en-cours', 'operations');
  if (opsCh) {
    const msg = await opsCh.send({
      content: `<@&${pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}> — 🕐 Opération programmée **${nom}** — Inscriptions ouvertes !`,
      embeds: [embed],
      components: [rowP, rowG],
    });
    op.msgId  = msg.id;
    op.chanId = msg.channel.id;
    saveDB(db);
  }

  await interaction.editReply({ content: `✅ Opération **${nom}** programmée pour le **${new Date(lancementAt).toLocaleString('fr-FR')}**.\nLancement automatique à l'heure prévue.` });
}

// ── Cron : vérifier et lancer les opérations programmées ──
async function checkOpsProgrammees(guild) {
  const db  = loadDB();
  const now = Date.now();

  // ── Rappel 30 min avant le lancement ──
  const opsBientot = (db.operations || []).filter(o =>
    o.status === 'programmee' && o.lancementAt &&
    o.lancementAt > now && o.lancementAt - now <= 30 * 60 * 1000 && !o.rappel30Sent
  );
  for (const op of opsBientot) {
    const minutesRestantes = Math.round((op.lancementAt - now) / 60000);
    // ROLE_POLE_LEGAL/ILLEGAL importés depuis config.js

    // Ping participants + rôle pôle dans le salon
    const mentions = (op.participants || [])
      .map(n => { const id = MEMBRES_DISCORD_MAP[n]; return id ? `<@${id}>` : null; })
      .filter(Boolean).join(' ');
    const ping = mentions || `<@&${op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}>`;

    const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
    if (opsCh) {
      await opsCh.send({
        content: `${ping}`,
        embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⏰ Rappel — ${op.name} dans ${minutesRestantes} min`)
          .setDescription([
            `L'opération **${op.name}** démarre dans **${minutesRestantes} minutes**.`,
            '',
            `📍 **Lieu :** ${op.lieu || '—'}`,
            `🎯 **Objectif :** ${op.objectif || '—'}`,
            `👥 **Inscrits :** ${(op.participants || []).length}`,
            '',
            (op.participants || []).length === 0
              ? '⚠️ *Aucun inscrit pour l\'instant — inscrivez-vous vite !*'
              : '*Préparez-vous. Dernière chance pour s\'inscrire.*',
          ].join('\n'))
          .setFooter({ text: `IWC • Rappel automatique` })
        ],
      }).catch(() => {});
    }

    // DM aux participants déjà inscrits
    for (const nomP of (op.participants || [])) {
      const id = MEMBRES_DISCORD_MAP[nomP]; if (!id) continue;
      try {
        const m = await guild.members.fetch(id).catch(() => null);
        if (m) await m.send({ embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⏰ ${op.name} — dans ${minutesRestantes} min`)
          .setDescription(`L'opération à laquelle tu participes démarre bientôt.\n\n📍 ${op.lieu || '—'} · 🎯 ${op.objectif || '—'}`)
          .setFooter({ text: op.pole === 'illegal' ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })
        ] }).catch(() => {});
      } catch {}
    }

    op.rappel30Sent = true;
    saveDB(db);
    console.log(`✅ Rappel 30 min envoyé — ${op.name}`);
  }

  // ── Lancement automatique ──
  const opsALancer = (db.operations || []).filter(o =>
    o.status === 'programmee' && o.lancementAt && o.lancementAt <= now
  );

  for (const op of opsALancer) {
    // ── Bloquer si 0 participant + alerter la Direction ──
    if (!op.participants || op.participants.length === 0) {
      const logsCh = getChById(guild, 'LOGS', 'logs');
      const mention = guild.roles.cache
        .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
        .map(r => `<@&${r.id}>`).join(' ');

      if (logsCh) await logsCh.send({
        content: `${mention} — ⚠️ Opération sans participants`,
        embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⚠️ Opération non lancée — ${op.name}`)
          .setDescription([
            `L'opération **${op.name}** était prévue maintenant mais **aucun membre ne s'est inscrit**.`,
            '',
            '**Options disponibles :**',
            '> 🟢 Lancer quand même — cliquez le bouton dans le salon',
            "'> ❌ Annuler — si l\'opération n\'a plus lieu',"
          ].join('\n'))
          .addFields({ name: '📅 Heure prévue', value: new Date(op.lancementAt).toLocaleString('fr-FR'), inline: true })
          .setFooter({ text: 'IWC • Opération en attente de décision' })
        ],
      }).catch(() => {});

      // Mettre en "en_attente_direction" pour ne plus retrigger le cron
      op.status    = 'attente_direction';
      op.updatedAt = new Date().toISOString();
      saveDB(db);
      continue;
    }
    await _lancerOpProgrammee(guild, op, db);
  }
}

async function _lancerOpProgrammee(guild, op, db) {
  op.status    = 'en_cours';
  op.updatedAt = new Date().toISOString();
  saveDB(db);

  // ROLE_POLE_LEGAL/ILLEGAL importés depuis config.js

  const mentions = (op.participants || [])
    .map(n => { const id = MEMBRES_DISCORD_MAP[n]; return id ? `<@${id}>` : null; })
    .filter(Boolean).join(' ');
  const ping = mentions || `<@&${op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}>`;

  const color = op.pole === 'illegal' ? 0x8B1A1A : 0x3B82F6;

  const embedLance = new EmbedBuilder()
    .setColor(0x00AA00)
    .setTitle(`🟢 OPÉRATION LANCÉE — ${op.name}`)
    .setDescription(`*L'heure est venue. L'opération démarre maintenant.*`)
    .addFields(
      { name: '📍 Lieu',        value: op.lieu    || '—', inline: true },
      { name: '🎯 Objectif',    value: op.objectif || '—', inline: true },
      { name: '👥 Participants', value: (op.participants || []).map(n => {
          const id = MEMBRES_DISCORD_MAP[n]; return id ? `<@${id}>` : n;
        }).join(', ') || '*Aucun inscrit*', inline: false },
    )
    .setFooter({ text: `ID: ${op.id} • Lancée automatiquement` })
    .setTimestamp();

  const rowStop = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_stop_${op.id}`).setLabel('🛑 STOP d\'urgence').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Clôturer').setStyle(ButtonStyle.Primary),
  );

  // Mettre à jour le message existant
  if (op.msgId && op.chanId) {
    try {
      const ch  = guild.channels.cache.get(op.chanId);
      const msg = await ch?.messages?.fetch(op.msgId).catch(() => null);
      if (msg) await msg.edit({ embeds: [embedLance], components: [rowStop] });
    } catch {}
  }

  // Ping dans le salon + briefing DM
  const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
  if (opsCh) {
    await opsCh.send({ content: `${ping} — 🟢 **${op.name}** est maintenant **LANCÉE**. Bonne opération.` }).catch(() => {});
  }

  // Envoyer le briefing DM
  let notionV4 = {};
  try { notionV4 = require('./notion-modules-v4'); } catch {}
  await notionV4.envoyerBriefingOp?.(guild, op).catch(() => {});
}

// ── Bouton STOP d'urgence ──
async function handleOpStop(interaction) {
  const opId = interaction.customId.replace('op_stop_', '');
  const db   = loadDB();
  const op   = db.operations.find(o => o.id === opId);
  if (!op) return interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral });

  const wasRunning = op.status === 'en_cours';
  op.status    = 'annulee';
  op.updatedAt = new Date().toISOString();
  op.stopBy    = interaction.user.username;
  saveDB(db);

  const embed = EmbedBuilder.from(interaction.message.embeds[0])
    .setColor(0xED4245)
    .setTitle(`🛑 OPÉRATION STOPPÉE — ${op.name}`)
    .setDescription(`Arrêtée par **${interaction.user.username}**${wasRunning ? ' en cours d\'opération' : ' avant le lancement'}.`);

  await interaction.update({ embeds: [embed], components: [] });

  // Notifier les participants
  // ROLE_POLE_LEGAL/ILLEGAL importés depuis config.js
  const mentions = (op.participants || []).map(n => { const id = MEMBRES_DISCORD_MAP[n]; return id ? `<@${id}>` : null; }).filter(Boolean).join(' ');
  const ping = mentions || `<@&${op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL}>`;

  const opsCh = getCh(interaction.guild, 'operations-en-cours', 'operations');
  if (opsCh && wasRunning) {
    await opsCh.send({ content: `${ping} — 🛑 L'opération **${op.name}** a été **STOPPÉE** par ${interaction.user.username}. Repli immédiat.` }).catch(() => {});
  }

  // DM participants si op était en cours
  if (wasRunning) {
    for (const nomP of (op.participants || [])) {
      const id = MEMBRES_DISCORD_MAP[nomP]; if (!id) continue;
      try {
        const m = await interaction.guild.members.fetch(id).catch(() => null);
        if (m) await m.send({ embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(`🛑 STOP — ${op.name}`)
          .setDescription(`L'opération a été stoppée d'urgence par **${interaction.user.username}**.\n*Repli immédiat.*`)
          .setFooter({ text: op.pole === 'illegal' ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })
        ] }).catch(() => {});
      } catch {}
    }
  }
}

// ── Bouton lancer maintenant (forcer avant l'heure) ──
async function handleOpLancerForce(interaction) {
  const opId = interaction.customId.replace('op_lancer_force_', '');
  const db   = loadDB();
  const op   = db.operations.find(o => o.id === opId);
  if (!op) return interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral });
  if (op.status !== 'programmee') return interaction.reply({ content: '❌ Cette opération ne peut pas être lancée manuellement.', flags: MessageFlags.Ephemeral });

  await interaction.deferUpdate();
  await _lancerOpProgrammee(interaction.guild, op, db);
}

// ═══════════════════════════════════════════════════════════════
// 2. STATS AVANCÉES — /stats amélioré avec tendances
// ═══════════════════════════════════════════════════════════════

async function handleStatsAvancees(interaction) {
  await interaction.deferReply({ ephemeral: false });

  const db  = loadDB();
  const now = Date.now();
  const s7j = now - 7  * 86400000;
  const s30j= now - 30 * 86400000;

  // ── Membres ──
  const membres      = Object.values(db.members || {});
  const actifs       = membres.filter(m => m.status === 'actif').length;
  const absents      = membres.filter(m => m.status === 'absent').length;
  const inactifs     = membres.filter(m => m.status === 'inactif').length;
  const arrivees7j   = membres.filter(m => m.joinedAt && new Date(m.joinedAt).getTime() >= s7j).length;
  const departs7j    = membres.filter(m => m.status === 'parti' && m.leftAt && new Date(m.leftAt).getTime() >= s7j).length;
  const tauxActivite = actifs > 0 ? Math.round((actifs / (actifs + absents + inactifs)) * 100) : 0;

  // ── Recrutement ──
  const cands        = db.candidatures || [];
  const accept7j     = cands.filter(c => c.status === 'acceptee' && c.acceptedAt && new Date(c.acceptedAt).getTime() >= s7j).length;
  const accept30j    = cands.filter(c => c.status === 'acceptee' && c.acceptedAt && new Date(c.acceptedAt).getTime() >= s30j).length;
  const refus7j      = cands.filter(c => c.status === 'refusee'  && new Date(c.refusedAt || c.receivedAt || 0).getTime() >= s7j).length;
  const enAttente    = cands.filter(c => c.status === 'reçue').length;
  const tauxAccept   = (accept30j + refus7j) > 0 ? Math.round(accept30j / (accept30j + cands.filter(c => c.status === 'refusee' && new Date(c.refusedAt || 0).getTime() >= s30j).length) * 100) : 0;

  // ── Opérations ──
  const ops           = db.operations || [];
  const opsTotal      = ops.length;
  const ops7j         = ops.filter(o => o.createdAt && new Date(o.createdAt).getTime() >= s7j).length;
  const opsTerminees  = ops.filter(o => o.status === 'terminee').length;
  const opsReussies   = ops.filter(o => o.status === 'terminee' && o.resultat && (o.resultat.toLowerCase().includes('réuss') || o.resultat.toLowerCase().includes('succes') || o.resultat.toLowerCase().includes('succès'))).length;
  const tauxReussite  = opsTerminees > 0 ? Math.round(opsReussies / opsTerminees * 100) : 0;

  // ── Trésorerie ──
  const legal    = db.coffres?.legal   || 0;
  const illegal  = db.coffres?.illegal || 0;

  // ── Activité par pôle ──
  const membresLegal   = membres.filter(m => m.pole === 'legal'   && m.status !== 'parti').length;
  const membresIlleg   = membres.filter(m => m.pole === 'illegal' && m.status !== 'parti').length;

  // ── Barre de progression ──
  const bar = (val, max = 100) => {
    const pct = Math.min(val, max);
    const fill = Math.round(pct / 10);
    return '█'.repeat(fill) + '░'.repeat(10 - fill) + ` ${pct}%`;
  };

  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('📊 Statistiques avancées — Iron Wolf Company')
    .setDescription(`*Snapshot au ${fmtLong(new Date())}*`)
    .addFields(
      {
        name: '👥 EFFECTIFS',
        value: [
          `✅ Actifs : **${actifs}** · ⚠️ Absents : **${absents}** · 💤 Inactifs : **${inactifs}**`,
          `⚖️ Pôle Légal : **${membresLegal}** · 🔒 Confrérie : **${membresIlleg}**`,
          `📈 Taux d'activité : \`${bar(tauxActivite)}\``,
          `🆕 Arrivées 7j : **+${arrivees7j}** · 🚪 Départs : **-${departs7j}**`,
        ].join('\n'),
        inline: false,
      },
      {
        name: '📋 RECRUTEMENT',
        value: [
          `✅ Acceptés (7j) : **${accept7j}** · ❌ Refusés : **${refus7j}** · ⏳ En attente : **${enAttente}**`,
          `📊 Taux d'acceptation (30j) : \`${bar(tauxAccept)}\``,
        ].join('\n'),
        inline: false,
      },
      {
        name: '🎯 OPÉRATIONS',
        value: [
          `📋 Total : **${opsTotal}** · 🆕 Cette semaine : **${ops7j}** · ✅ Terminées : **${opsTerminees}**`,
          `🏆 Taux de réussite : \`${bar(tauxReussite)}\``,
          ops.filter(o => o.status === 'programmee').length > 0 ? `🕐 Programmées : **${ops.filter(o => o.status === 'programmee').length}**` : '',
        ].filter(Boolean).join('\n'),
        inline: false,
      },
      {
        name: '💰 TRÉSORERIE',
        value: [
          `⚖️ Légal : **$${legal.toLocaleString('fr-FR')}** · 🔒 Illégal : **$${illegal.toLocaleString('fr-FR')}**`,
          `💎 Total : **$${(legal + illegal).toLocaleString('fr-FR')}**`,
        ].join('\n'),
        inline: false,
      },
    )
    .setTimestamp();

  // ── Tendances semaine vs semaine précédente ──
  const s14j = now - 14 * 86400000;
  const arriveesPrev = membres.filter(m => m.joinedAt && new Date(m.joinedAt).getTime() >= s14j && new Date(m.joinedAt).getTime() < s7j).length;
  const accept7jPrev = cands.filter(c => c.status === 'acceptee' && c.acceptedAt && new Date(c.acceptedAt).getTime() >= s14j && new Date(c.acceptedAt).getTime() < s7j).length;
  const ops14j       = ops.filter(o => o.createdAt && new Date(o.createdAt).getTime() >= s14j && new Date(o.createdAt).getTime() < s7j).length;
  const tendArr = arrivees7j > arriveesPrev ? '📈' : arrivees7j < arriveesPrev ? '📉' : '➡️';
  const tendRec = accept7j   > accept7jPrev  ? '📈' : accept7j   < accept7jPrev  ? '📉' : '➡️';
  const tendOps = ops7j      > ops14j        ? '📈' : ops7j      < ops14j        ? '📉' : '➡️';

  embed
    .addFields({
      name: '📈 TENDANCES vs semaine précédente',
      value: [
        `${tendArr} Arrivées : **${arrivees7j}** (sem. passée : ${arriveesPrev})`,
        `${tendRec} Recrutement : **${accept7j}** accepté(s) (sem. passée : ${accept7jPrev})`,
        `${tendOps} Opérations : **${ops7j}** (sem. passée : ${ops14j})`,
      ].join('\n'),
      inline: false,
    })
    .setFooter({ text: `IWC Stats • ${new Date().toLocaleString('fr-FR')}` });

  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('btn_stats_refresh').setLabel('🔄 Rafraîchir').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('btn_dashboard_refresh').setLabel('📊 Dashboard').setStyle(ButtonStyle.Primary),
  );

  await interaction.editReply({ embeds: [embed], components: [row] });
}

// ═══════════════════════════════════════════════════════════════
// 3. THREADS CANDIDATURES — archivage propre à la décision
// ═══════════════════════════════════════════════════════════════

async function archiverThreadCandidature(guild, cand, decision, validePar) {
  try {
    // Retrouver le thread de discussion de la candidature
    const intCh = guild.channels.cache.get(
      cand.type === 'illegal' ? '1508756516830842960' : '1509254315712188438'
    );
    if (!intCh) return;

    const threads = await intCh.threads.fetch().catch(() => null);
    const archivedT = await intCh.threads.fetchArchived().catch(() => null);
    const allT = [
      ...(threads?.threads?.values() || []),
      ...(archivedT?.threads?.values() || []),
    ];

    const thread = allT.find(t => t.name.toLowerCase().includes(cand.nomPerso.toLowerCase()));
    if (!thread) return;

    const color   = decision === 'acceptee' ? 0x57F287 : 0xED4245;
    const emoji   = decision === 'acceptee' ? '✅' : '❌';
    const statut  = decision === 'acceptee' ? 'ACCEPTÉE' : 'REFUSÉE';

    // Post de clôture dans le thread
    await thread.send({ embeds: [new EmbedBuilder()
      .setColor(color)
      .setTitle(`${emoji} Candidature ${statut} — ${cand.nomPerso}`)
      .addFields(
        { name: '📋 Décision',    value: `**${statut}**`, inline: true },
        { name: '👤 Décidé par',  value: validePar,       inline: true },
        { name: '📅 Date',        value: fmtShort(new Date()), inline: true },
      )
      .setDescription(decision === 'acceptee'
        ? '*Le candidat intègre la Compagnie. Ce thread est archivé.*'
        : '*La candidature a été refusée. Ce thread est archivé.*')
      .setFooter({ text: 'IWC • Clôture automatique du dossier' })
    ] }).catch(() => {});

    // Renommer et archiver
    const newName = `${emoji} [${statut}] ${cand.nomPerso}`;
    await thread.setName(newName).catch(() => {});
    await thread.setArchived(true).catch(() => {});

    console.log(`✅ Thread candidature archivé : ${newName}`);
  } catch (e) { console.log('❌ archiverThreadCandidature error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 4. JOURNAL IC — Résumé hebdomadaire automatique
// ═══════════════════════════════════════════════════════════════

async function posterResumeJournalIC(guild) {
  try {
    const db      = loadDB();
    const journal = db.journalIC || [];
    const since   = Date.now() - 7 * 86400000;

    const entriesSemaine = journal.filter(e => new Date(e.date).getTime() >= since);
    if (!entriesSemaine.length) return;

    // Grouper par type
    const byType = {};
    for (const e of entriesSemaine) {
      if (!byType[e.type]) byType[e.type] = [];
      byType[e.type].push(e);
    }

    const typeConfig = {
      operation:   { emoji: '🎯', label: 'Opérations' },
      contrat:     { emoji: '📜', label: 'Contrats' },
      recrutement: { emoji: '🐺', label: 'Recrutement' },
      tresorerie:  { emoji: '💰', label: 'Trésorerie' },
      promotion:   { emoji: '🎖️', label: 'Grades' },
      autre:       { emoji: '📝', label: 'Divers' },
    };

    const fields = [];
    for (const [type, entries] of Object.entries(byType)) {
      const cfg = typeConfig[type] || { emoji: '📌', label: type };
      const lignes = entries.slice(0, 5).map(e => `→ ${e.description}`).join('\n');
      const suite  = entries.length > 5 ? `\n*...et ${entries.length - 5} autre(s)*` : '';
      fields.push({ name: `${cfg.emoji} ${cfg.label} (${entries.length})`, value: lignes + suite, inline: false });
    }

    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('📖 Résumé hebdomadaire — Journal IC')
      .setDescription([
        `*Semaine du ${fmtShort(new Date(since))} au ${fmtShort(new Date())}*`,
        `*${entriesSemaine.length} événement(s) enregistré(s) cette semaine.*`,
      ].join('\n'))
      .addFields(...fields)
      .addFields({
        name: '📊 En chiffres',
        value: [
          `🎯 Opérations : **${byType.operation?.length || 0}**`,
          `📜 Contrats : **${byType.contrat?.length || 0}**`,
          `🐺 Recrues : **${byType.recrutement?.length || 0}**`,
          `💰 Transactions : **${byType.tresorerie?.length || 0}**`,
        ].join(' · '),
        inline: false,
      })
      .setFooter({ text: 'IWC • Journal IC • Résumé automatique du lundi' })
      .setTimestamp();

    const histCh = getChById(guild, 'HISTOIRE_IWC', 'histoire-iwc', 'histoire', 'journal');
    if (histCh) {
      await histCh.send({ embeds: [embed] });
      console.log('✅ Résumé journal IC posté');
    }
  } catch (e) { console.log('❌ posterResumeJournalIC error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  handleOpProgrammeeModal,
  checkOpsProgrammees,
  handleOpStop,
  handleOpLancerForce,
  handleStatsAvancees,
  archiverThreadCandidature,
  posterResumeJournalIC,
};
