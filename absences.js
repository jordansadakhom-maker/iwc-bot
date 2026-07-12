// ───────────────────────────────────────────────────────────────────────────
//  absences.js — Salon #absences : PANNEAU + TABLEAU VIVANT + commande /absences.
//
//  • Un panneau ÉPINGLÉ affiche en direct qui est absent (retour prévu, raison)
//    et les absences à venir. Il se met à jour tout seul (déclaration, retour,
//    démarrage) et via le bouton 🔄 Actualiser.
//  • Boutons : 🌙 Déclarer une absence (réutilise le modal `modal_absent` déjà
//    géré ailleurs → écriture cohérente), ✅ Je suis de retour (lève l'absence),
//    🔄 Actualiser.
//  • /absences reste dispo (même tableau, en éphémère).
//  Se base sur db.members (status, absentJusqu, absentRaison, absenceProgrammee).
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const CH_ABSENCES = '1509718164760563743';

const absencesCommands = [
  new SlashCommandBuilder().setName('absences').setDescription("🌙 Tableau des absents : qui, retour prévu, raison"),
];

function _fmt(d) {
  try { return new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }); } catch { return '—'; }
}
function _jours(d) {
  try { return Math.ceil((new Date(d) - Date.now()) / 86400000); } catch { return null; }
}

// ── Tableau des absences (embed) — partagé par /absences ET le panneau ──
function _boardEmbed(db) {
  const membres = Object.entries(db.members || {});
  const absents = membres
    .filter(([, m]) => m && m.status === 'absent')
    .map(([id, m]) => ({ id, jusqu: m.absentJusqu || null, raison: (m.absentRaison || '').trim(), rang: (m.rang || '').trim() }))
    .sort((a, b) => {
      if (!a.jusqu && !b.jusqu) return 0;
      if (!a.jusqu) return 1;
      if (!b.jusqu) return -1;
      return new Date(a.jusqu) - new Date(b.jusqu);
    });
  const programmees = membres
    .filter(([, m]) => m && m.absenceProgrammee && m.status !== 'absent')
    .map(([id, m]) => ({ id, debut: m.absenceProgrammee.debut, fin: m.absenceProgrammee.fin, raison: (m.absenceProgrammee.raison || '').trim() }))
    .sort((a, b) => new Date(a.debut) - new Date(b.debut));

  const e = new EmbedBuilder().setColor(0xE0A93B).setTitle('🌙 TABLEAU DES ABSENCES').setTimestamp()
    .setFooter({ text: 'Iron Wolf Company • mise à jour automatique • retour auto à la date prévue' });

  if (!absents.length && !programmees.length) {
    e.setDescription("✅ **Personne n'est absent.** Toute la troupe est sur le pont. 🐺");
    return e;
  }
  e.setDescription("*État des troupes — qui manque à l'appel, et quand il revient.*");
  if (absents.length) {
    const lignes = absents.map(a => {
      let quand;
      if (a.jusqu) {
        const j = _jours(a.jusqu);
        const suffixe = j == null ? '' : j <= 0 ? " *(aujourd'hui)*" : j === 1 ? ' *(demain)*' : ` *(dans ${j} j)*`;
        quand = `retour **${_fmt(a.jusqu)}**${suffixe}`;
      } else quand = 'retour **indéterminé**';
      const r = a.raison ? `\n   ↳ *${a.raison.slice(0, 140)}*` : '';
      return `🟡 <@${a.id}>${a.rang ? ` · ${a.rang}` : ''} — ${quand}${r}`;
    });
    let val = lignes.join('\n');
    if (val.length > 1024) val = val.slice(0, 1000) + '\n…';
    e.addFields({ name: `🟡 Absents actuellement (${absents.length})`, value: val, inline: false });
  }
  if (programmees.length) {
    const lignes = programmees.map(p => `📅 <@${p.id}> — du **${_fmt(p.debut)}** au **${_fmt(p.fin)}**${p.raison ? `\n   ↳ *${p.raison.slice(0, 140)}*` : ''}`);
    let val = lignes.join('\n');
    if (val.length > 1024) val = val.slice(0, 1000) + '\n…';
    e.addFields({ name: `📅 Absences à venir (${programmees.length})`, value: val, inline: false });
  }
  return e;
}

// ── Panneau (tableau + boutons) ──
function _panelPayload(db) {
  const board = _boardEmbed(db);
  const intro = new EmbedBuilder().setColor(0x8B6914).setTitle('🌙 GESTION DES ABSENCES')
    .setDescription([
      "*Tu t'absentes ? Préviens la Compagnie en un clic — c'est rapide et ça évite qu'on te croie inactif.*",
      '',
      '🌙 **Déclarer une absence** — durée, date de début (optionnelle) et raison.',
      '✅ **Je suis de retour** — lève ton absence dès que tu reviens (sinon retour **automatique** à la date prévue).',
      '🔄 **Actualiser** — rafraîchit le tableau ci-dessous.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Bureau des présences' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('abs_declarer').setLabel('Déclarer une absence').setEmoji('🌙').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('abs_retour').setLabel('Je suis de retour').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('abs_refresh').setLabel('Actualiser').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [intro, board], components: [row] };
}

// Installe (ou met à jour) le panneau épinglé dans #absences.
async function installerPanelAbsences(guild) {
  try {
    const ch = guild.channels.cache.get(CH_ABSENCES) || await guild.channels.fetch(CH_ABSENCES).catch(() => null);
    if (!ch?.messages || typeof ch.send !== 'function') return null;
    const me = guild.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('GESTION DES ABSENCES');
    let panneau = null;
    const db = loadDB();
    if (db.absencesPanelId) panneau = await ch.messages.fetch(db.absencesPanelId).catch(() => null);
    if (!panneau) { const pins = await ch.messages.fetchPinned?.().catch(() => null); if (pins?.values) panneau = [...pins.values()].find(estPanel) || null; }
    if (!panneau) { const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) panneau = [...msgs.values()].find(estPanel) || null; }
    const payload = _panelPayload(db);
    if (panneau) { await panneau.edit(payload).catch(() => {}); return panneau; }
    const sent = await ch.send(payload).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} const d = loadDB(); d.absencesPanelId = sent.id; saveDB(d); }
    return sent;
  } catch (e) { console.log('⚠️ panneau absences:', e.message); return null; }
}
// Rafraîchit le tableau (alias : ré-édite le panneau).
async function rafraichirTableau(guild) { try { return await installerPanelAbsences(guild); } catch { return null; } }

// Le même modal que la commande /absent (réutilise le handler `modal_absent` d'index.js).
function _modalDeclarer() {
  return new ModalBuilder().setCustomId('modal_absent').setTitle('🟡 Déclarer une absence').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duree').setLabel('Durée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Ex: 2 jours · 1 semaine · jusqu'au 10 juin · Indéterminé")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('debut').setLabel('Jour de début (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Vide = tout de suite · ex: demain · 10/07 · lundi')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Raison (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: vacances, travail, IRL...')),
  );
}

async function routeInteraction(interaction) {
  try {
    // ── Boutons du panneau ──
    if (interaction.isButton?.() && interaction.customId?.startsWith('abs_')) {
      const eph = MessageFlags.Ephemeral;
      const id = interaction.customId;

      if (id === 'abs_declarer') { await interaction.showModal(_modalDeclarer()); return true; }

      if (id === 'abs_refresh') {
        await interaction.deferReply({ flags: eph }).catch(() => {});
        await rafraichirTableau(interaction.guild);
        await interaction.editReply({ content: '🔄 Tableau des absences à jour.' }).catch(() => {});
        return true;
      }

      if (id === 'abs_retour') {
        await interaction.deferReply({ flags: eph }).catch(() => {});
        const db = loadDB();
        const m = db.members?.[interaction.user.id];
        if (!m || m.status !== 'absent') { await interaction.editReply({ content: 'ℹ️ Tu n\'es pas marqué **absent** — rien à lever.' }).catch(() => {}); return true; }
        m.status = 'actif';
        delete m.absentJusqu; delete m.absentRaison; delete m.absentMode; delete m.absentDepuis;
        m.lastActivity = new Date().toISOString();
        saveDB(db);
        // retire le rôle « Absent » s'il existe
        try {
          const membre = await interaction.guild.members.fetch(interaction.user.id).catch(() => null);
          const roleAbsent = interaction.guild.roles.cache.find(r => /absent/i.test(r.name || ''));
          if (membre && roleAbsent) await membre.roles.remove(roleAbsent).catch(() => {});
        } catch {}
        await rafraichirTableau(interaction.guild);
        await interaction.editReply({ content: '✅ **Bon retour !** Ton absence est levée, tu réapparais comme actif.' }).catch(() => {});
        return true;
      }
      return true;
    }

    // ── Commande /absences ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'absences') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await interaction.editReply({ embeds: [_boardEmbed(loadDB())], allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }
    return false;
  } catch (err) {
    if ([10062, 10008, 40060].includes(err?.code)) return true;
    console.log('❌ absences:', err.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: "⚠️ Erreur du tableau des absences.", flags: MessageFlags.Ephemeral }); else await interaction.editReply({ content: "⚠️ Erreur du tableau des absences." }).catch(() => {}); } catch {}
    return true;
  }
}

module.exports = { absencesCommands, routeInteraction, installerPanelAbsences, rafraichirTableau };
