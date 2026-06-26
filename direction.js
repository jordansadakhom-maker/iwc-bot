// ─────────────────────────────────────────────────────────────────────────────
//  direction.js — Outils HRP de coordination de la Direction (salon haut-gradé)
//  4 systèmes : 🗳️ Votes/Décisions · ✅ Tâches · 📋 Réunions/Ordre du jour · 📌 Mémo
//  Réservé à la Direction. Persisté en base (db.direction). Identifiants isolés.
// ─────────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');
const { loadDB, saveDB, sauvegarderSurGitHub } = require('./db');

const SALON_HRP = '1510712255514153101';
const COULEUR = 0x2E5A88;
const ROLES_DIRECTION = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'];

function estDirection(member) {
  return !!member?.roles?.cache?.some(r => ROLES_DIRECTION.some(n => r.name.includes(n)));
}
let _seq = 0;
const _id = (p) => `${p}${Date.now().toString(36)}${(_seq++).toString(36)}`;
const _nom = (interaction) => interaction.member?.displayName || interaction.user?.username || 'Inconnu';

function _root(db) {
  db.direction = db.direction || {};
  const r = db.direction;
  if (!Array.isArray(r.decisions)) r.decisions = [];
  if (!Array.isArray(r.taches)) r.taches = [];
  if (!Array.isArray(r.reunions)) r.reunions = [];
  if (typeof r.memo !== 'object' || r.memo === null) r.memo = { texte: '', maj: null, parId: null, messageId: null };
  return r;
}
function _persist(db) { saveDB(db); sauvegarderSurGitHub?.().catch(() => {}); }
const _gate = async (interaction) => {
  if (estDirection(interaction.member)) return true;
  await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {});
  return false;
};

// ═══════════════════════════════════════ 🗳️ DÉCISIONS ═══════════════════════════════════════
function _decEmbed(d) {
  const votes = d.votes || {};
  const vals = Object.values(votes);
  const pour = vals.filter(v => v === 'pour'), contre = vals.filter(v => v === 'contre'), abst = vals.filter(v => v === 'abst');
  const ment = (choix) => Object.entries(votes).filter(([, v]) => v === choix).map(([id]) => `<@${id}>`).slice(0, 15).join(' ') || '—';
  const e = new EmbedBuilder().setColor(d.statut === 'clos' ? 0x555555 : COULEUR)
    .setTitle(`🗳️ DÉCISION — ${d.titre}`)
    .setDescription(d.desc || '*Pas de détail.*')
    .addFields(
      { name: `✅ Pour (${pour.length})`, value: ment('pour'), inline: true },
      { name: `❌ Contre (${contre.length})`, value: ment('contre'), inline: true },
      { name: `🤚 Abstention (${abst.length})`, value: ment('abst'), inline: true },
    );
  if (d.statut === 'clos') {
    const verdict = pour.length > contre.length ? '✅ ADOPTÉE' : (contre.length > pour.length ? '❌ REJETÉE' : '⚖️ ÉGALITÉ');
    e.addFields({ name: '📌 Résultat', value: `**${verdict}** — ${pour.length} pour / ${contre.length} contre / ${abst.length} abst.` });
    e.setFooter({ text: `Vote clos · proposé par ${d.parNom || '?'}` });
  } else {
    e.setFooter({ text: `Vote en cours · proposé par ${d.parNom || '?'} · 1 voix par personne (modifiable)` });
  }
  return e;
}
function _decRows(d) {
  if (d.statut === 'clos') return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`decv:${d.id}:pour`).setLabel('Pour').setEmoji('✅').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`decv:${d.id}:contre`).setLabel('Contre').setEmoji('❌').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId(`decv:${d.id}:abst`).setLabel('Abstention').setEmoji('🤚').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`decv:${d.id}:clore`).setLabel('Clore le vote').setEmoji('🔒').setStyle(ButtonStyle.Primary),
  )];
}

// ═══════════════════════════════════════ ✅ TÂCHES ═══════════════════════════════════════
function _tachesPayload(db) {
  const r = _root(db);
  const actives = r.taches.filter(t => t.statut !== 'fait');
  const faites = r.taches.filter(t => t.statut === 'fait');
  const e = new EmbedBuilder().setColor(COULEUR).setTitle('✅ TÂCHES DE LA DIRECTION')
    .setDescription(actives.length
      ? actives.map(t => `• **${t.titre}**${t.pour ? ` — 👤 ${t.pour}` : ''}${t.echeance ? ` — ⏳ ${t.echeance}` : ''}`).join('\n').slice(0, 3900)
      : '*Aucune tâche en cours. Clique sur ➕ pour en créer une.*');
  if (faites.length) e.addFields({ name: `✔️ Terminées (${faites.length})`, value: faites.slice(-8).map(t => `~~${t.titre}~~`).join('\n').slice(0, 1000) });
  const rows = [];
  let row = new ActionRowBuilder();
  actives.slice(0, 20).forEach((t, i) => {
    if (i > 0 && i % 5 === 0) { rows.push(row); row = new ActionRowBuilder(); }
    row.addComponents(new ButtonBuilder().setCustomId(`tache_done:${t.id}`).setLabel(`✓ ${t.titre}`.slice(0, 78)).setStyle(ButtonStyle.Secondary));
  });
  if (row.components.length && rows.length < 4) rows.push(row);
  rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('tache_new').setLabel('Nouvelle tâche').setEmoji('➕').setStyle(ButtonStyle.Success)));
  return { embeds: [e], components: rows.slice(0, 5), flags: MessageFlags.Ephemeral };
}

// ═══════════════════════════════════════ 📋 RÉUNIONS ═══════════════════════════════════════
function _reunEmbed(m) {
  const e = new EmbedBuilder().setColor(m.statut === 'clos' ? 0x555555 : COULEUR)
    .setTitle(`📋 RÉUNION — ${m.titre}`)
    .setDescription(`🗓️ **${m.date || 'à définir'}**\n\n**Ordre du jour :**\n` + ((m.points && m.points.length) ? m.points.map((p, i) => `**${i + 1}.** ${p}`).join('\n') : '*Aucun point. Ajoute-en avec ➕.*'));
  if (m.statut === 'clos') {
    e.addFields({ name: '📝 Compte-rendu', value: (m.compteRendu || '—').slice(0, 1024) });
    e.setFooter({ text: `Réunion close · ouverte par ${m.parNom || '?'}` });
  } else {
    e.setFooter({ text: `Ouverte par ${m.parNom || '?'}` });
  }
  return e;
}
function _reunRows(m) {
  if (m.statut === 'clos') return [];
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`reun_point:${m.id}`).setLabel('Ajouter un point').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`reun_cr:${m.id}`).setLabel('Compte-rendu & clôturer').setEmoji('📝').setStyle(ButtonStyle.Primary),
  )];
}

// ═══════════════════════════════════════ 📌 MÉMO ═══════════════════════════════════════
function _memoEmbed(memo) {
  return new EmbedBuilder().setColor(0xB8860B).setTitle('📌 MÉMO DE LA DIRECTION')
    .setDescription((memo.texte && memo.texte.trim()) ? memo.texte.slice(0, 4000) : '*Mémo vide. Clique sur « Modifier » pour écrire les règles internes, rappels, liens utiles…*')
    .setFooter({ text: memo.maj ? `Mis à jour le ${new Date(memo.maj).toLocaleString('fr-FR')}` : 'Jamais modifié' });
}
function _memoRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('memo_edit').setLabel('Modifier le mémo').setEmoji('✏️').setStyle(ButtonStyle.Primary),
  );
}
async function installerMemo(guild) {
  try {
    const ch = await guild.channels.fetch(SALON_HRP).catch(() => null);
    if (!ch || typeof ch.send !== 'function') return;
    const db = loadDB(); const r = _root(db);
    const botId = guild.client.user.id;
    let msg = null;
    if (r.memo.messageId) msg = await ch.messages.fetch(r.memo.messageId).catch(() => null);
    if (!msg) { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) msg = pins.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('MÉMO DE LA DIRECTION')); }
    if (msg) { await msg.edit({ embeds: [_memoEmbed(r.memo)], components: [_memoRow()] }).catch(() => {}); r.memo.messageId = msg.id; _persist(db); return; }
    const sent = await ch.send({ embeds: [_memoEmbed(r.memo)], components: [_memoRow()] }).catch(() => null);
    if (sent) { await sent.pin().catch(() => {}); r.memo.messageId = sent.id; _persist(db); }
  } catch (e) { console.log('⚠️ direction installerMemo:', e.message); }
}

// ═══════════════════════════════════════ ROUTEUR ═══════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';

    // ── Ouvrir : Décision ──
    if (interaction.isButton?.() && cid === 'dec_open') {
      if (!await _gate(interaction)) return true;
      const m = new ModalBuilder().setCustomId('dec_modal').setTitle('🗳️ Proposer une décision');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Sujet de la décision').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Détail / contexte').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(2000)),
      );
      await interaction.showModal(m).catch(() => {}); return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'dec_modal') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _root(db);
      const d = { id: _id('D'), titre: interaction.fields.getTextInputValue('titre'), desc: (interaction.fields.getTextInputValue('desc') || '').trim(), votes: {}, statut: 'ouvert', parId: interaction.user.id, parNom: _nom(interaction), createdAt: new Date().toISOString() };
      const sent = await interaction.channel.send({ embeds: [_decEmbed(d)], components: _decRows(d) }).catch(() => null);
      if (sent) d.messageId = sent.id;
      r.decisions.push(d); _persist(db);
      await interaction.reply({ content: '🗳️ Décision publiée — la Direction peut voter.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // ── Voter ──
    if (interaction.isButton?.() && cid.startsWith('decv:')) {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Seule la Direction peut voter.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const [, did, choix] = cid.split(':');
      const db = loadDB(); const r = _root(db);
      const d = r.decisions.find(x => x.id === did);
      if (!d) { await interaction.reply({ content: '⚠️ Décision introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (d.statut === 'clos') { await interaction.reply({ content: '🔒 Ce vote est déjà clos.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (choix === 'clore') {
        if (interaction.user.id !== d.parId && !estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Seul le proposeur ou la Direction peut clore.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        d.statut = 'clos';
      } else {
        d.votes[interaction.user.id] = choix;
      }
      _persist(db);
      await interaction.update({ embeds: [_decEmbed(d)], components: _decRows(d) }).catch(() => {});
      return true;
    }

    // ── Tâches ──
    if (interaction.isButton?.() && cid === 'tache_open') {
      if (!await _gate(interaction)) return true;
      await interaction.reply(_tachesPayload(loadDB())).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'tache_new') {
      if (!await _gate(interaction)) return true;
      const m = new ModalBuilder().setCustomId('tache_modal').setTitle('➕ Nouvelle tâche');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Intitulé de la tâche').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pour').setLabel('Assignée à (qui ?)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('echeance').setLabel('Échéance (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40)),
      );
      await interaction.showModal(m).catch(() => {}); return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'tache_modal') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _root(db);
      r.taches.push({ id: _id('T'), titre: interaction.fields.getTextInputValue('titre'), pour: (interaction.fields.getTextInputValue('pour') || '').trim(), echeance: (interaction.fields.getTextInputValue('echeance') || '').trim(), statut: 'en_cours', creePar: _nom(interaction), createdAt: new Date().toISOString() });
      _persist(db);
      await interaction.reply({ content: '✅ Tâche ajoutée.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid.startsWith('tache_done:')) {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const tid = cid.split(':')[1];
      const db = loadDB(); const r = _root(db);
      const t = r.taches.find(x => x.id === tid);
      if (t) { t.statut = t.statut === 'fait' ? 'en_cours' : 'fait'; t.fini = t.statut === 'fait' ? new Date().toISOString() : null; _persist(db); }
      await interaction.update(_tachesPayload(db)).catch(() => {});
      return true;
    }

    // ── Réunions ──
    if (interaction.isButton?.() && cid === 'reun_open') {
      if (!await _gate(interaction)) return true;
      const m = new ModalBuilder().setCustomId('reun_modal').setTitle('📋 Nouvelle réunion');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre de la réunion').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(150)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date / heure').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder('Ex : sam. 21h, 28/06 20h…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('points').setLabel('Premiers points (1 par ligne, optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500)),
      );
      await interaction.showModal(m).catch(() => {}); return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'reun_modal') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _root(db);
      const pts = (interaction.fields.getTextInputValue('points') || '').split('\n').map(s => s.trim()).filter(Boolean);
      const mtg = { id: _id('R'), titre: interaction.fields.getTextInputValue('titre'), date: (interaction.fields.getTextInputValue('date') || '').trim(), points: pts, statut: 'ouvert', parId: interaction.user.id, parNom: _nom(interaction), createdAt: new Date().toISOString() };
      const sent = await interaction.channel.send({ embeds: [_reunEmbed(mtg)], components: _reunRows(mtg) }).catch(() => null);
      if (sent) mtg.messageId = sent.id;
      r.reunions.push(mtg); _persist(db);
      await interaction.reply({ content: '📋 Réunion créée.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid.startsWith('reun_point:')) {
      if (!await _gate(interaction)) return true;
      const rid = cid.split(':')[1];
      const m = new ModalBuilder().setCustomId(`reunpt_modal:${rid}`).setTitle('➕ Ajouter un point');
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pt').setLabel('Point à l\'ordre du jour').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(300)));
      await interaction.showModal(m).catch(() => {}); return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('reunpt_modal:')) {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const rid = cid.split(':')[1];
      const db = loadDB(); const r = _root(db);
      const mtg = r.reunions.find(x => x.id === rid);
      if (!mtg) { await interaction.reply({ content: '⚠️ Réunion introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      mtg.points = mtg.points || []; mtg.points.push(interaction.fields.getTextInputValue('pt').trim());
      _persist(db);
      if (mtg.messageId) { const msg = await interaction.channel.messages.fetch(mtg.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [_reunEmbed(mtg)], components: _reunRows(mtg) }).catch(() => {}); }
      await interaction.reply({ content: '✅ Point ajouté.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid.startsWith('reun_cr:')) {
      if (!await _gate(interaction)) return true;
      const rid = cid.split(':')[1];
      const m = new ModalBuilder().setCustomId(`reuncr_modal:${rid}`).setTitle('📝 Compte-rendu & clôture');
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cr').setLabel('Décisions / compte-rendu').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1024)));
      await interaction.showModal(m).catch(() => {}); return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('reuncr_modal:')) {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const rid = cid.split(':')[1];
      const db = loadDB(); const r = _root(db);
      const mtg = r.reunions.find(x => x.id === rid);
      if (!mtg) { await interaction.reply({ content: '⚠️ Réunion introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      mtg.compteRendu = interaction.fields.getTextInputValue('cr').trim(); mtg.statut = 'clos';
      _persist(db);
      if (mtg.messageId) { const msg = await interaction.channel.messages.fetch(mtg.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [_reunEmbed(mtg)], components: _reunRows(mtg) }).catch(() => {}); }
      await interaction.reply({ content: '📝 Compte-rendu enregistré, réunion close.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // ── Mémo ──
    if (interaction.isButton?.() && cid === 'memo_edit') {
      if (!await _gate(interaction)) return true;
      const db = loadDB(); const r = _root(db);
      const m = new ModalBuilder().setCustomId('memo_modal').setTitle('✏️ Modifier le mémo');
      m.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('texte').setLabel('Contenu du mémo').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(4000).setValue((r.memo.texte || '').slice(0, 4000)),
      ));
      await interaction.showModal(m).catch(() => {}); return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'memo_modal') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _root(db);
      r.memo.texte = (interaction.fields.getTextInputValue('texte') || '').trim();
      r.memo.maj = new Date().toISOString(); r.memo.parId = interaction.user.id;
      _persist(db);
      // met à jour le message épinglé
      try {
        if (r.memo.messageId) { const msg = await interaction.channel.messages.fetch(r.memo.messageId).catch(() => null); if (msg) await msg.edit({ embeds: [_memoEmbed(r.memo)], components: [_memoRow()] }).catch(() => {}); }
      } catch {}
      await interaction.reply({ content: '📌 Mémo mis à jour.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ direction routeInteraction:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerMemo, estDirection, SALON_HRP };
