// ═══════════════════════════════════════════════════════════════
// notion-modules-v4.js — Opérations briefing · Dashboard alertes
//                         Recrutement suivi · Contrats rappels
// IWC Bot v4.0
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle } = require('discord.js');
const { loadDB, saveDB } = require('./db');

const { MEMBRES_DISCORD_MAP, _getPole } = require('./config');

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

// ═══════════════════════════════════════════════════════════════
// 1. BRIEFING OPÉRATION — DM automatique aux participants
// ═══════════════════════════════════════════════════════════════

async function envoyerBriefingOp(guild, op) {
  if (!op.participants?.length) return;

  const isIlleg = op.pole === 'illegal';
  const color   = isIlleg ? 0x8B1A1A : 0x3B82F6;
  const org     = isIlleg ? 'La Confrérie' : 'Iron Wolf Company';
  const footer  = isIlleg ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal';

  const embed = new EmbedBuilder()
    .setColor(color)
    .setAuthor({ name: `${org} — Briefing Opération`, iconURL: guild.iconURL() || undefined })
    .setTitle(`🎯 BRIEFING — ${op.name}`)
    .setDescription([
      '```',
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      `  OPÉRATION : ${op.name.toUpperCase()}`,
      `  STATUT    : 🟢 LANCÉE`,
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━',
      '```',
    ].join('\n'))
    .addFields(
      { name: '📍 Lieu',       value: op.lieu      || '—', inline: true },
      { name: '🎯 Objectif',   value: op.objectif  || '—', inline: true },
      { name: '👥 Équipe',     value: op.equipe    || op.participants.join(', ') || '—', inline: false },
      { name: '👤 Participants', value: op.participants.map(n => {
          const id = MEMBRES_DISCORD_MAP[n];
          return id ? `<@${id}>` : n;
        }).join(', '), inline: false },
    );

  if (op.objectifs) embed.addFields({ name: '📋 Détails', value: op.objectifs.slice(0, 500), inline: false });

  embed
    .addFields({ name: '⚠️ Rappel', value: '*Discrétion absolue. Ce message se réfère à une opération IC.*', inline: false })
    .setFooter({ text: `${footer} • Briefing automatique` })
    .setTimestamp();

  let envoyes = 0;
  const dejaEnvoyes = new Set();

  for (const nomParticipant of op.participants) {
    // Chercher d'abord dans MEMBRES_DISCORD_MAP
    let discordId = MEMBRES_DISCORD_MAP[nomParticipant];

    // Sinon chercher dans les membres Discord par displayName ou username
    if (!discordId) {
      const allMembers = await guild.members.fetch().catch(() => null);
      if (allMembers) {
        const found = [...allMembers.values()].find(m =>
          m.displayName.toLowerCase() === nomParticipant.toLowerCase() ||
          m.user.username.toLowerCase() === nomParticipant.toLowerCase()
        );
        if (found) discordId = found.id;
      }
    }

    if (!discordId || dejaEnvoyes.has(discordId)) continue;
    dejaEnvoyes.add(discordId);

    try {
      const member = await guild.members.fetch(discordId).catch(() => null);
      if (!member) continue;
      await member.send({ embeds: [embed] });
      envoyes++;
    } catch {}
  }

  console.log(`✅ Briefing envoyé à ${envoyes} participant(s) — ${op.name}`);
  return envoyes;
}

// ═══════════════════════════════════════════════════════════════
// 2. DASHBOARD — Alertes push quand quelque chose change
// ═══════════════════════════════════════════════════════════════

async function checkDashboardAlertes(guild) {
  try {
    const db  = loadDB();
    const now = Date.now();

    if (!db.dashAlertes) db.dashAlertes = {};
    let changed = false;
    const alertes = [];

    // ── Candidatures en attente > 48h ──
    const candsEnAttente = (db.candidatures || []).filter(c => c.status === 'reçue');
    for (const c of candsEnAttente) {
      const heures = Math.floor((now - new Date(c.receivedAt).getTime()) / 3600000);
      const key    = `cand_${c.id}_48h`;
      if (heures >= 48 && !db.dashAlertes[key]) {
        alertes.push({
          emoji: '⏰', couleur: 0xFFA500,
          titre: `Candidature sans réponse — ${c.nomPerso}`,
          desc:  `La candidature de **${c.nomPerso}** est en attente depuis **${heures}h** sans décision.`,
          action: `Type : ${c.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`,
        });
        db.dashAlertes[key] = true;
        changed = true;
      }
    }

    // ── Opération en cours depuis > 6h sans clôture ──
    const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours');
    for (const op of opsEnCours) {
      const heures = Math.floor((now - new Date(op.updatedAt || op.createdAt).getTime()) / 3600000);
      const key    = `op_${op.id}_6h`;
      if (heures >= 6 && !db.dashAlertes[key]) {
        alertes.push({
          emoji: '🎯', couleur: 0xFFA500,
          titre: `Opération non clôturée — ${op.name}`,
          desc:  `L'opération **${op.name}** est en cours depuis **${heures}h**. Pensez à la clôturer.`,
          action: `Participants : ${(op.participants || []).join(', ') || '—'}`,
        });
        db.dashAlertes[key] = true;
        changed = true;
      }
    }

    // ── Membres inactifs depuis > 10 jours (plus agressif que 7) ──
    const inactifs = Object.values(db.members || {}).filter(m =>
      m.status !== 'parti' && m.status !== 'absent' && m.status !== 'visiteur' && daysSince(m.lastActivity) > 10
    );
    const keyInactifs = `inactifs_${inactifs.length}_${Math.floor(now / 86400000)}`;
    if (inactifs.length > 0 && !db.dashAlertes[keyInactifs]) {
      alertes.push({
        emoji: '💤', couleur: 0x555555,
        titre: `${inactifs.length} membre(s) inactif(s) > 10 jours`,
        desc:  inactifs.slice(0, 5).map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)}j`).join('\n'),
        action: inactifs.length > 5 ? `... et ${inactifs.length - 5} autre(s)` : null,
      });
      db.dashAlertes[keyInactifs] = true;
      changed = true;
    }

    // ── Contrats qui expirent dans 3 jours ──
    const contratsProches = (db.contrats || []).filter(c => {
      if (c.status !== 'signe' || !c.dateEcheance) return false;
      const jours = Math.floor((new Date(c.dateEcheance) - new Date()) / 86400000);
      return jours >= 0 && jours <= 3;
    });
    for (const c of contratsProches) {
      const jours = Math.floor((new Date(c.dateEcheance) - new Date()) / 86400000);
      const key   = `contrat_${c.id}_3j`;
      if (!db.dashAlertes[key]) {
        alertes.push({
          emoji: '📜', couleur: 0xED4245,
          titre: `Contrat expire bientôt — ${c.id}`,
          desc:  `Le contrat **${c.id}** (${c.objet}) expire dans **${jours === 0 ? 'aujourd\'hui' : jours + ' jour(s)'}**.`,
          action: `Client/Employeur : ${c.clientNom || c.employeurNom || '—'}`,
        });
        db.dashAlertes[key] = true;
        changed = true;
      }
    }

    if (changed) saveDB(db);

    // ── Envoyer les alertes en DM à la Direction ──
    if (alertes.length > 0) {
      const directionIds = Object.values(MEMBRES_DISCORD_MAP);
      for (const discordId of directionIds) {
        try {
          const member = await guild.members.fetch(discordId).catch(() => null);
          if (!member) continue;
          const estDirection = member.roles.cache.some(r =>
            ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier'].some(n => r.name.includes(n))
          );
          if (!estDirection) continue;

          for (const alerte of alertes) {
            const embed = new EmbedBuilder()
              .setColor(alerte.couleur)
              .setTitle(`${alerte.emoji} Alerte — ${alerte.titre}`)
              .setDescription(alerte.desc);
            if (alerte.action) embed.addFields({ name: '📋 Détail', value: alerte.action, inline: false });
            embed.setFooter({ text: 'IWC • Dashboard automatique' }).setTimestamp();
            await member.send({ embeds: [embed] }).catch(() => {});
          }
        } catch {}
      }
      console.log(`✅ ${alertes.length} alerte(s) dashboard envoyée(s)`);
    }
  } catch (e) { console.log('❌ checkDashboardAlertes error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 3. RECRUTEMENT — Suivi automatique
// ═══════════════════════════════════════════════════════════════

async function checkRecrutementSuivi(guild) {
  try {
    const db  = loadDB();
    const now = Date.now();
    if (!db.recrutSuivi) db.recrutSuivi = {};

    const logsCh = getChById(guild, 'LOGS', 'logs');
    // Les rappels de recrutement vont dans le journal de bord (pas dans les logs/patch note)
    const rappelCh = guild.channels.cache.get('1508756535407542372') || logsCh;

    // ── Rappel Direction : candidature en attente > 24h ──
    const enAttente = (db.candidatures || []).filter(c => c.status === 'reçue');
    for (const c of enAttente) {
      const heures = Math.floor((now - new Date(c.receivedAt).getTime()) / 3600000);
      const key24  = `rappel_24h_${c.id}`;
      const key72  = `rappel_72h_${c.id}`;

      if (heures >= 24 && !db.recrutSuivi[key24]) {
        if (rappelCh) await rappelCh.send({ embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⏰ Rappel recrutement — ${c.nomPerso}`)
          .setDescription(`La candidature de **${c.nomPerso}** attend une décision depuis **${heures}h**.`)
          .addFields(
            { name: '⚖️ Type', value: c.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal', inline: true },
            { name: '📅 Reçue le', value: fmtShort(c.receivedAt), inline: true },
          )
          .setFooter({ text: 'IWC • Suivi recrutement automatique' })
        ] }).catch(() => {});
        db.recrutSuivi[key24] = true;
      }

      // 72h — rappel urgent + mention Direction
      if (heures >= 72 && !db.recrutSuivi[key72]) {
        const mention = guild.roles.cache
          .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
          .map(r => `<@&${r.id}>`).join(' ');

        if (rappelCh) await rappelCh.send({
          content: `${mention} — ⚠️ Candidature sans réponse depuis 72h`,
          embeds: [new EmbedBuilder()
            .setColor(0xED4245)
            .setTitle(`🚨 URGENT — Candidature ${c.nomPerso} sans réponse`)
            .setDescription(`**${c.nomPerso}** attend une décision depuis **${heures}h**.\nUne réponse avait été promise sous 48h.`)
            .addFields({ name: '⚖️ Type', value: c.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal', inline: true })
            .setFooter({ text: 'IWC • Suivi recrutement' })
          ],
        }).catch(() => {});
        db.recrutSuivi[key72] = true;
      }
    }

    // ── Stats recrutement hebdo — résumé le lundi ──
    const acceptees = (db.candidatures || []).filter(c => c.status === 'acceptee');
    const refusees  = (db.candidatures || []).filter(c => c.status === 'refusee');
    const semDernier = now - 7 * 86400000;
    const accept7j  = acceptees.filter(c => new Date(c.acceptedAt || c.receivedAt).getTime() >= semDernier).length;
    const refus7j   = refusees.filter(c => new Date(c.refusedAt   || c.receivedAt).getTime() >= semDernier).length;
    const attente7j = enAttente.length;

    const keyStats = `stats_semaine_${Math.floor(now / (7 * 86400000))}`;
    if (!db.recrutSuivi[keyStats] && (accept7j + refus7j > 0)) {
      const recrutCh = getChById(guild, 'RECRUTEMENT_INTERNE', 'recrutement-interne', 'dossier-recrutement', 'logs');
      if (recrutCh) await recrutCh.send({ embeds: [new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle('📊 Bilan recrutement — Semaine')
        .addFields(
          { name: '✅ Acceptées', value: `**${accept7j}**`, inline: true },
          { name: '❌ Refusées',  value: `**${refus7j}**`,  inline: true },
          { name: '⏳ En attente',value: `**${attente7j}**`, inline: true },
        )
        .setFooter({ text: 'IWC • Bilan recrutement automatique' })
        .setTimestamp()
      ] }).catch(() => {});
      db.recrutSuivi[keyStats] = true;
    }

    saveDB(db);
  } catch (e) { console.log('❌ checkRecrutementSuivi error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 4. CONTRATS — Rappels d'échéance automatiques
// ═══════════════════════════════════════════════════════════════

async function checkEcheancesContrats(guild) {
  try {
    const db  = loadDB();
    const now = new Date();
    if (!db.contratsRappels) db.contratsRappels = {};
    let changed = false;

    const contratsActifs = (db.contrats || []).filter(c => c.status === 'signe' && c.dateEcheance);

    for (const c of contratsActifs) {
      const echeance = new Date(c.dateEcheance);
      const joursRestants = Math.floor((echeance - now) / 86400000);

      // Rappel 3 jours avant
      const key3j = `${c.id}_3j`;
      if (joursRestants <= 3 && joursRestants > 0 && !db.contratsRappels[key3j]) {
        await _envoyerRappelContrat(guild, c, joursRestants, 'rappel');
        db.contratsRappels[key3j] = true;
        changed = true;
      }

      // Rappel le jour même
      const keyJ = `${c.id}_0j`;
      if (joursRestants === 0 && !db.contratsRappels[keyJ]) {
        await _envoyerRappelContrat(guild, c, 0, 'urgent');
        db.contratsRappels[keyJ] = true;
        changed = true;
      }

      // Contrat expiré — marquer et notifier
      const keyExp = `${c.id}_expire`;
      if (joursRestants < 0 && !db.contratsRappels[keyExp]) {
        c.status = 'expire';
        await _envoyerRappelContrat(guild, c, joursRestants, 'expire');
        db.contratsRappels[keyExp] = true;
        changed = true;
      }
    }

    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkEcheancesContrats error:', e.message); }
}

async function _envoyerRappelContrat(guild, contrat, joursRestants, type) {
  const configs = {
    rappel: { color: 0xFFA500, emoji: '⏰', titre: `Contrat expire dans ${joursRestants} jour(s)`, urgent: false },
    urgent: { color: 0xED4245, emoji: '🚨', titre: 'Contrat expire AUJOURD\'HUI',                  urgent: true  },
    expire: { color: 0x555555, emoji: '📁', titre: 'Contrat expiré',                               urgent: false },
  };
  const cfg = configs[type];

  const embed = new EmbedBuilder()
    .setColor(cfg.color)
    .setTitle(`${cfg.emoji} ${cfg.titre} — ${contrat.id}`)
    .addFields(
      { name: '🆔 Référence', value: `\`${contrat.id}\``,                           inline: true },
      { name: '📋 Objet',     value: contrat.objet,                                  inline: true },
      { name: '📅 Échéance',  value: fmtShort(contrat.dateEcheance),                inline: true },
      { name: '🤝 Partenaire',value: contrat.clientNom || contrat.employeurNom || '—', inline: true },
    )
    .setFooter({ text: 'IWC • Rappel contrat automatique' })
    .setTimestamp();

  // Notifier la Direction
  const logsCh = getChById(guild, 'LOGS', 'logs');
  const mention = cfg.urgent ? guild.roles.cache
    .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
    .map(r => `<@&${r.id}>`).join(' ') : '';

  if (logsCh) await logsCh.send({ content: mention || undefined, embeds: [embed] }).catch(() => {});

  // Notifier le signataire
  try {
    const sigId = contrat.emetteurId || contrat.signataireId;
    if (sigId) {
      const member = await guild.members.fetch(sigId).catch(() => null);
      if (member) await member.send({ embeds: [embed] }).catch(() => {});
    }
  } catch {}

  // Notifier le client/partenaire si Discord ID connu
  try {
    if (contrat.userId) {
      const member = await guild.members.fetch(contrat.userId).catch(() => null);
      if (member) await member.send({ embeds: [embed] }).catch(() => {});
    }
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
// 5. OPÉRATIONS — Timeout auto + stats
// ═══════════════════════════════════════════════════════════════

async function checkOperationsTimeout(guild) {
  try {
    const db = loadDB();
    const now = Date.now();
    if (!db.opTimeouts) db.opTimeouts = {};

    const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours');

    for (const op of opsEnCours) {
      const heures = Math.floor((now - new Date(op.updatedAt || op.createdAt).getTime()) / 3600000);
      const key12h = `${op.id}_12h`;
      const key24h = `${op.id}_24h`;

      if (heures >= 12 && !db.opTimeouts[key12h]) {
        const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
        const logsCh = getChById(guild, 'LOGS', 'logs');
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`⏰ Opération toujours en cours — ${op.name}`)
          .setDescription(`L'opération **${op.name}** est en cours depuis **${heures}h**.\nPensez à la clôturer si elle est terminée.`)
          .addFields({ name: '👥 Participants', value: (op.participants || []).join(', ') || '—', inline: false })
          .setFooter({ text: 'IWC • Timeout opération automatique' })
        ] }).catch(() => {});
        db.opTimeouts[key12h] = true;
      }

      // 24h → clôture automatique avec résultat "Non renseigné"
      if (heures >= 24 && !db.opTimeouts[key24h]) {
        op.status   = 'terminee';
        op.endedAt  = new Date().toISOString();
        op.resultat = 'Non clôturé automatiquement (24h dépassées)';
        op.butin    = '—';
        op.debrief  = 'Clôture automatique — aucun résultat renseigné.';

        const logsCh = getChById(guild, 'LOGS', 'logs');
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle(`🔒 Clôture automatique — ${op.name}`)
          .setDescription(`L'opération **${op.name}** a été clôturée automatiquement après **24h** sans action.`)
          .setFooter({ text: 'IWC • Timeout opération' })
        ] }).catch(() => {});

        db.opTimeouts[key24h] = true;
      }
    }
    saveDB(db);
  } catch (e) { console.log('❌ checkOperationsTimeout error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 6. ABSENCES — Post propre dans #absences
// ═══════════════════════════════════════════════════════════════

async function posterAbsencePropre(guild, membre, contenu, source) {
  try {
    const absCh = getChById(guild, 'ABSENCES', 'absences');
    if (!absCh) return;

    const db = loadDB();
    const m  = db.members[membre.id];

    const embed = new EmbedBuilder()
      .setColor(0xFFA500)
      .setAuthor({ name: `${membre.displayName} — Absence`, iconURL: membre.user.displayAvatarURL() })
      .setTitle('🟡 Déclaration d\'absence')
      .setDescription(`> *${contenu.slice(0, 500)}*`)
      .addFields(
        { name: '👤 Membre',   value: `<@${membre.id}>`,                                     inline: true },
        { name: '🎖️ Rang',    value: m?.rang || '—',                                         inline: true },
        { name: '📍 Origine',  value: source || 'Déclaration directe',                       inline: true },
        { name: '📅 Date',     value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
      )
      .setFooter({ text: 'IWC • Absence automatique' })
      .setTimestamp();

    await absCh.send({ embeds: [embed] });
  } catch (e) { console.log('❌ posterAbsencePropre error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 7. AMÉLIORATION /profil — Ajouter historique opérations
// ═══════════════════════════════════════════════════════════════

async function getHistoriqueOpsProfilMembre(userId, username) {
  const db  = loadDB();
  const nom = Object.entries(MEMBRES_DISCORD_MAP).find(([, id]) => id === userId)?.[0] || username;

  const ops = (db.operations || [])
    .filter(o => o.status === 'terminee' && (o.participants || []).includes(nom))
    .sort((a, b) => new Date(b.endedAt) - new Date(a.endedAt))
    .slice(0, 5);

  if (!ops.length) return null;

  return ops.map(o => {
    const result = o.resultat || '—';
    const emoji  = result.toLowerCase().includes('réuss') ? '✅'
                 : result.toLowerCase().includes('échec') ? '❌' : '⚡';
    return `${emoji} **${o.name}** · ${fmtShort(o.endedAt)} · ${result}`;
  }).join('\n');
}

// ═══════════════════════════════════════════════════════════════
// EXPORTS
// ═══════════════════════════════════════════════════════════════
module.exports = {
  envoyerBriefingOp,
  checkDashboardAlertes,
  checkRecrutementSuivi,
  checkEcheancesContrats,
  checkOperationsTimeout,
  posterAbsencePropre,
  getHistoriqueOpsProfilMembre,
};

