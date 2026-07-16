// ─────────────────────────────────────────────────────────────────────────────
//  avis.js — Suivi & avis clients
//  Quand un contrat client est honoré, le client reçoit un MP pour noter la
//  prestation (⭐ 1-5) + un mot facultatif. Les avis sont stockés, la fidélité
//  du client mise à jour, et un récap est posté pour la Direction.
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { loadDB, saveDB, sauvegarderSurGitHub } = require('./db');

// Salon où la Direction voit les avis (salon HRP de la Direction)
const SALON_AVIS = '1510712255514153101';

function _arr(db) { if (!Array.isArray(db.avisClients)) db.avisClients = []; return db.avisClients; }
const _etoiles = (n) => '⭐'.repeat(Math.max(0, Math.min(5, n || 0))) + '☆'.repeat(5 - Math.max(0, Math.min(5, n || 0)));
function _repartition(arr) { const r = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }; for (const a of arr) if (a.note >= 1 && a.note <= 5) r[a.note]++; return r; }
function _moyenne(arr) { return arr.length ? Math.round((arr.reduce((s, a) => s + a.note, 0) / arr.length) * 10) / 10 : 0; }
function _badge(moy, n) {
  if (!n) return '🆕 Réputation à bâtir';
  if (moy >= 4.5) return '🏆 Réputation exemplaire';
  if (moy >= 4) return '⭐ Excellente réputation';
  if (moy >= 3) return '👍 Bonne réputation';
  if (moy >= 2) return '⚠️ Réputation à redresser';
  return '🔴 Réputation critique';
}
// Vitrine de réputation (auto-actualisée) — moyenne, répartition, derniers témoignages.
function _vitrineEmbed(db) {
  const arr = _arr(db).filter(a => a.note);
  const n = arr.length; const moy = _moyenne(arr); const rep = _repartition(arr);
  const maxc = Math.max(1, ...Object.values(rep));
  const bar = c => { const len = Math.round((rep[c] / maxc) * 10); return '▰'.repeat(len) + '▱'.repeat(10 - len); };
  const derniers = arr.slice(-3).reverse();
  const e = new EmbedBuilder().setColor(0xB8860B).setTitle('⭐ RÉPUTATION — Iron Wolf Company')
    .setDescription(n
      ? `${_etoiles(Math.round(moy))}  **${moy}/5**  ·  **${n}** avis client(s)\n**${_badge(moy, n)}**`
      : "*Aucun avis pour l'instant — chaque prestation honorée invite le client à noter.*");
  if (n) {
    e.addFields({ name: '📊 Répartition', value: [5, 4, 3, 2, 1].map(c => `${c}⭐ ${bar(c)} \`${rep[c]}\``).join('\n'), inline: false });
    if (derniers.length) e.addFields({ name: '💬 Derniers témoignages', value: derniers.map(a => `${_etoiles(a.note)} — *${(a.objet || 'prestation').slice(0, 45)}*${a.commentaire ? `\n« ${a.commentaire.slice(0, 110)} »` : ''}`).join('\n\n').slice(0, 1024) });
  }
  return e.setFooter({ text: 'Iron Wolf Company • Satisfaction client' }).setTimestamp();
}
function _vitrineRows() { return [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('avis_voirtous').setLabel('Voir tous les avis').setEmoji('📋').setStyle(ButtonStyle.Secondary))]; }
async function installerPanneau(guild) {
  try {
    const ch = await guild.channels.fetch(SALON_AVIS).catch(() => null); if (!ch?.send) return false;
    const db = loadDB(); const payload = { embeds: [_vitrineEmbed(db)], components: _vitrineRows() };
    if (db.avisVitrineMsgId) { const m = await ch.messages.fetch(db.avisVitrineMsgId).catch(() => null); if (m) { await m.edit(payload).catch(() => {}); if (!m.pinned) await m.pin().catch(() => {}); return true; } }
    const recents = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    const deja = recents && [...recents.values()].find(m => m.author?.id === guild.members.me?.id && /RÉPUTATION/i.test(m.embeds?.[0]?.title || ''));
    if (deja) { await deja.edit(payload).catch(() => {}); db.avisVitrineMsgId = deja.id; saveDB(db); if (!deja.pinned) await deja.pin().catch(() => {}); return true; }
    const sent = await ch.send(payload).catch(() => null);
    if (sent) { db.avisVitrineMsgId = sent.id; saveDB(db); await sent.pin().catch(() => {}); }
    return !!sent;
  } catch (e) { console.log('⚠️ avis installerPanneau:', e.message); return false; }
}
async function _rafraichirVitrine(client) {
  try { const db = loadDB(); if (!db.avisVitrineMsgId) return; const ch = await client.channels.fetch(SALON_AVIS).catch(() => null); if (!ch) return; const m = await ch.messages.fetch(db.avisVitrineMsgId).catch(() => null); if (m) await m.edit({ embeds: [_vitrineEmbed(db)], components: _vitrineRows() }).catch(() => {}); } catch {}
}

// Appelé quand un contrat client est honoré → demande l'avis en MP.
async function demanderAvis(guild, contrat) {
  try {
    if (!contrat || !contrat.userId) return;          // pas de client réel (ex : Confrérie)
    if (contrat.avisDemande) return;                  // déjà demandé
    if (contrat.cc || contrat.type === 'confrerie') return;
    const membre = await guild.members.fetch(contrat.userId).catch(() => null);
    if (!membre) return;
    const embed = new EmbedBuilder().setColor(0xB8860B)
      .setTitle('⭐ Comment s\'est passée la prestation ?')
      .setDescription(`Merci d'avoir fait appel à l'**Iron Wolf Company** pour **${(contrat.objet || 'votre demande').slice(0, 200)}**.\n\nDonne ta note en un clic — ça nous aide énormément à nous améliorer.`)
      .setFooter({ text: 'Iron Wolf Company — merci de ta confiance' });
    const row = new ActionRowBuilder().addComponents(
      [1, 2, 3, 4, 5].map(n => new ButtonBuilder().setCustomId(`avis_note::${contrat.id}::${n}`).setLabel(String(n)).setEmoji('⭐').setStyle(ButtonStyle.Secondary)),
    );
    const sent = await membre.send({ embeds: [embed], components: [row] }).catch(() => null);
    if (sent) { const db = loadDB(); const c = (db.contrats || []).find(x => x.id === contrat.id); if (c) { c.avisDemande = true; saveDB(db); } }
  } catch (e) { console.log('⚠️ demanderAvis:', e.message); }
}

// Poste / met à jour le récap de l'avis pour la Direction.
async function _posterTemoignage(client, a) {
  try {
    const ch = await client.channels.fetch(SALON_AVIS).catch(() => null); if (!ch?.send) return;
    const db0 = loadDB(); const notes = _arr(db0).filter(x => x.note); const moy = _moyenne(notes);
    const negatif = a.note <= 2;
    const embed = new EmbedBuilder().setColor(negatif ? 0xED4245 : (a.note >= 4 ? 0x2ECC71 : 0xB8860B))
      .setTitle(negatif ? '⚠️ Avis client à traiter' : '⭐ Avis client reçu')
      .setDescription(`${_etoiles(a.note)} **(${a.note}/5)**\n\n${a.commentaire ? `« ${a.commentaire} »\n\n` : ''}*Prestation : ${a.objet || '—'}*`)
      .addFields({ name: '📈 Réputation globale', value: `${moy}/5 sur ${notes.length} avis · ${_badge(moy, notes.length)}`, inline: false })
      .setFooter({ text: `Client : ${a.clientNom || '—'} · contrat ${a.contratId}` }).setTimestamp();
    if (negatif) embed.addFields({ name: '📌 Action', value: 'Note basse — pense à **recontacter le client** pour comprendre et rattraper.', inline: false });
    if (a.messageId) { const msg = await ch.messages.fetch(a.messageId).catch(() => null); if (msg) { await msg.edit({ embeds: [embed] }).catch(() => {}); return; } }
    const sent = await ch.send({ embeds: [embed] }).catch(() => null);
    if (sent) { const db = loadDB(); const x = _arr(db).find(y => y.contratId === a.contratId); if (x) { x.messageId = sent.id; saveDB(db); } }
  } catch (e) { console.log('⚠️ posterTemoignage:', e.message); }
}

// Statistiques (pour bilan / recap éventuel)
function stats() {
  const db = loadDB(); const arr = _arr(db).filter(a => a.note);
  if (!arr.length) return { count: 0, moyenne: 0 };
  return { count: arr.length, moyenne: Math.round((arr.reduce((s, a) => s + a.note, 0) / arr.length) * 10) / 10 };
}

async function routeInteraction(interaction) {
  const cid = interaction.customId || '';
  if (!cid.startsWith('avis_')) return false;
  try {
    if (interaction.isButton?.() && cid.startsWith('avis_note::')) {
      const [, contratId, nStr] = cid.split('::'); const note = parseInt(nStr, 10) || 0;
      const db = loadDB(); const arr = _arr(db);
      const c = (db.contrats || []).find(x => x.id === contratId);
      let a = arr.find(x => x.contratId === contratId);
      if (!a) { a = { id: 'AV-' + Date.now().toString(36), contratId, clientId: interaction.user.id, clientNom: c?.clientNom || interaction.user.username, objet: c?.objet || '', note, commentaire: '', date: new Date().toISOString() }; arr.push(a); }
      else a.note = note;
      // fidélité client
      try {
        if (!db.rdvplus) db.rdvplus = { clients: {} }; if (!db.rdvplus.clients) db.rdvplus.clients = {};
        const cl = db.rdvplus.clients[interaction.user.id] || { nomRP: a.clientNom, total: 0, honored: 0, noshow: 0, derniers: [] };
        cl.notes = cl.notes || []; cl.notes.push(note); db.rdvplus.clients[interaction.user.id] = cl;
      } catch {}
      saveDB(db); sauvegarderSurGitHub?.().catch(() => {});
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`avis_comm::${contratId}`).setLabel('Laisser un mot (facultatif)').setEmoji('✍️').setStyle(ButtonStyle.Primary));
      await interaction.update({ content: `Merci pour ta note : ${_etoiles(note)} **(${note}/5)** !`, embeds: [], components: [row] }).catch(() => {});
      _posterTemoignage(interaction.client, a).catch(() => {});
      _rafraichirVitrine(interaction.client).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid.startsWith('avis_comm::')) {
      const contratId = cid.split('::')[1];
      const m = new ModalBuilder().setCustomId(`avis_comm_modal::${contratId}`).setTitle('✍️ Ton avis');
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('txt').setLabel('Ton mot sur la prestation').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)));
      await interaction.showModal(m).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('avis_comm_modal::')) {
      const contratId = cid.split('::')[1];
      const db = loadDB(); const a = _arr(db).find(x => x.contratId === contratId);
      if (a) { a.commentaire = (interaction.fields.getTextInputValue('txt') || '').trim(); saveDB(db); sauvegarderSurGitHub?.().catch(() => {}); _posterTemoignage(interaction.client, a).catch(() => {}); _rafraichirVitrine(interaction.client).catch(() => {}); }
      await interaction.reply({ content: '🙏 Merci pour ton retour, c\'est précieux !', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // 📋 Voir tous les avis (récap trié, le plus récent d'abord)
    if (interaction.isButton?.() && cid === 'avis_voirtous') {
      const db = loadDB(); const arr = _arr(db).filter(a => a.note).slice().reverse();
      if (!arr.length) return interaction.reply({ content: '📭 Aucun avis client pour l\'instant.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const moy = _moyenne(arr);
      const lignes = arr.slice(0, 15).map(a => {
        const d = a.date ? new Date(a.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '';
        return `${_etoiles(a.note)} — **${(a.clientNom || '—').slice(0, 30)}**${d ? ` · ${d}` : ''}\n*${(a.objet || 'prestation').slice(0, 50)}*${a.commentaire ? `\n> ${a.commentaire.slice(0, 120)}` : ''}`;
      });
      const embed = new EmbedBuilder().setColor(0xB8860B).setTitle(`📋 Avis clients — ${moy}/5 (${arr.length})`)
        .setDescription(lignes.join('\n\n').slice(0, 4000)).setFooter({ text: `${_badge(moy, arr.length)} · Iron Wolf Company` });
      return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral }).catch(() => {});
    }
    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ avis routeInteraction:', e.message);
    return true;
  }
}

module.exports = { demanderAvis, routeInteraction, stats, installerPanneau, SALON_AVIS, _test: { _moyenne, _repartition, _badge } };
