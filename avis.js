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
const _etoiles = (n) => '⭐'.repeat(Math.max(0, Math.min(5, n || 0)));

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
    const embed = new EmbedBuilder().setColor(0xB8860B).setTitle('⭐ Avis client reçu')
      .setDescription(`${_etoiles(a.note)} **(${a.note}/5)**\n\n${a.commentaire ? `« ${a.commentaire} »\n\n` : ''}*Prestation : ${a.objet || '—'}*`)
      .setFooter({ text: `Client : ${a.clientNom || '—'} · contrat ${a.contratId}` }).setTimestamp();
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
      if (a) { a.commentaire = (interaction.fields.getTextInputValue('txt') || '').trim(); saveDB(db); sauvegarderSurGitHub?.().catch(() => {}); _posterTemoignage(interaction.client, a).catch(() => {}); }
      await interaction.reply({ content: '🙏 Merci pour ton retour, c\'est précieux !', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ avis routeInteraction:', e.message);
    return true;
  }
}

module.exports = { demanderAvis, routeInteraction, stats, SALON_AVIS };
