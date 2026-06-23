// ───────────────────────────────────────────────────────────────────────────
//  comptabilite.js — Bilan comptable de la Compagnie (Direction)
//  ----------------------------------------------------------------------------
//   • /compta : bilan sur une période (7j / 30j / tout) — chiffre d'affaires
//     (factures réglées), contrats À ENCAISSER (en attente de paiement) + ceux
//     EN RETARD, trésorerie du coffre, top clients.
//   • Bouton 📤 Export : génère un fichier récap (factures + contrats).
//   Lecture seule : ne modifie ni les contrats, ni le coffre.
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const DIRECTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estDirection(m) { try { return !!m?.roles?.cache?.some(r => DIRECTION_ROLES.some(n => r.name.includes(n))); } catch { return false; } }

function _eur(n) { return (parseFloat(n) || 0).toLocaleString('fr-FR'); }
function _suivi(c) { return c.suivi || (c.status === 'honore' ? 'Honoré' : c.status === 'signe' ? 'En cours' : c.status === 'valide' ? 'Validé' : 'En attente'); }
// Estimation du montant d'un contrat (encaissé si honoré, sinon champ montant, sinon parsé depuis la rému)
function _montant(c) {
  if (c.remuVerseAuCoffre) return parseFloat(c.remuVerseAuCoffre) || 0;
  if (c.montant) return parseFloat(c.montant) || 0;
  const m = String(c.remuneration || '').replace(/\s/g, '').match(/(\d[\d.]*)/);
  return m ? (parseFloat(m[1].replace(/\./g, '')) || 0) : 0;
}
function _clientNom(c) { return c.clientNom || c.employeurNom || c.commanditaire || c.client || 'Client'; }

const comptaCommands = [
  new SlashCommandBuilder().setName('compta').setDescription('💰 Bilan comptable : CA, à encaisser, trésorerie, export (Direction)'),
];

function _joursEch(c) { if (!c.dateEcheance) return null; const d = new Date(c.dateEcheance); if (isNaN(d.getTime())) return null; return Math.round((Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) - Date.UTC(new Date().getFullYear(), new Date().getMonth(), new Date().getDate())) / 86400000); }

function _calc(db, jours) {
  const now = Date.now(); const cutoff = jours ? now - jours * 86400000 : 0;
  const factures = (db.factures || []).filter(f => (f.createdAt || 0) >= cutoff);
  const ca = factures.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0);
  const contrats = (db.contrats || []);
  // À encaisser = travail validé mais pas encore honoré (payé)
  const aEncaisser = contrats.filter(c => _suivi(c) === 'Validé');
  const totalEncaisser = aEncaisser.reduce((s, c) => s + _montant(c), 0);
  const enRetard = aEncaisser.filter(c => { const j = _joursEch(c); return j !== null && j < 0; });
  // Top clients sur la période (d'après les factures réglées)
  const parClient = {};
  for (const f of factures) { const k = (f.clientNom || 'Client').replace(/<@!?\d+>/g, '').trim() || 'Client'; parClient[k] = (parClient[k] || 0) + (parseFloat(f.montant) || 0); }
  const top = Object.entries(parClient).sort((a, b) => b[1] - a[1]).slice(0, 5);
  return { factures, ca, aEncaisser, totalEncaisser, enRetard, top };
}

function _label(jours) { return jours === 7 ? '7 derniers jours' : jours === 30 ? '30 derniers jours' : 'depuis toujours'; }

function bilanEmbed(db, jours) {
  const { factures, ca, aEncaisser, totalEncaisser, enRetard, top } = _calc(db, jours);
  const solde = db.coffre || 0;
  const e = new EmbedBuilder().setColor(0xC9A227)
    .setTitle('💰 BILAN COMPTABLE — Iron Wolf Company')
    .setDescription(`*Période : **${_label(jours)}***`)
    .addFields(
      { name: '🏦 Trésorerie du coffre', value: `**$${_eur(solde)}**`, inline: true },
      { name: '📈 Chiffre d\'affaires', value: `**$${_eur(ca)}**\n*(${factures.length} facture(s) réglée(s))*`, inline: true },
      { name: '⏳ À encaisser', value: `**$${_eur(totalEncaisser)}**\n*(${aEncaisser.length} contrat(s) validé(s))*`, inline: true },
    );
  // Détail des paiements en attente (les plus urgents d'abord)
  if (aEncaisser.length) {
    const lignes = aEncaisser
      .sort((a, b) => (_joursEch(a) ?? 9999) - (_joursEch(b) ?? 9999))
      .slice(0, 10)
      .map(c => { const j = _joursEch(c); const ret = (j !== null && j < 0) ? ` · 🔴 retard ${Math.abs(j)}j` : (j !== null && j <= 3 ? ` · ⏰ ${j}j` : ''); return `• \`${c.id}\` — **${_clientNom(c).replace(/<@!?\d+>/g, '').trim()}** · $${_eur(_montant(c))}${ret}`; });
    e.addFields({ name: `🧾 Paiements en attente${enRetard.length ? ` — ⚠️ ${enRetard.length} en retard` : ''}`, value: lignes.join('\n').slice(0, 1024), inline: false });
  }
  if (top.length) e.addFields({ name: '🏆 Meilleurs clients (période)', value: top.map(([n, v]) => `• **${n}** — $${_eur(v)}`).join('\n').slice(0, 1024), inline: false });
  e.setFooter({ text: 'Iron Wolf Company • Comptabilité' }).setTimestamp();
  return e;
}

function _bilanRow(jours) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('compta_p::7').setLabel('7 jours').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('compta_p::30').setLabel('30 jours').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('compta_p::0').setLabel('Tout').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('compta_export').setLabel('Exporter').setEmoji('📤').setStyle(ButtonStyle.Success),
  );
}
// Lignes de boutons du PANNEAU permanent (avec encaissement de contrat)
function _panelRows() {
  return [
    _bilanRow(30),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('compta_encaisser').setLabel('Encaisser un contrat').setEmoji('💵').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('compta_refresh').setLabel('Rafraîchir').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
// Contrats encaissables (travail fait / en cours, pas encore honoré ni abandonné)
function _encaissables(db) {
  return (db.contrats || []).filter(c => !['Honoré', 'Abandonné'].includes(_suivi(c)) && !c.remuVerseAuCoffre);
}
function _montantDetecte(s) { const m = String(s || '').replace(/\s/g, '').match(/(\d[\d.]*)/); return m ? (parseInt(m[1].replace(/\./g, ''), 10) || 0) : 0; }

// Panneau permanent : (ré)installe dans un salon et mémorise la référence
async function installerPanel(guild, channel) {
  try {
    const ch = channel || (loadDB().comptaPanel?.channelId ? await guild.channels.fetch(loadDB().comptaPanel.channelId).catch(() => null) : null);
    if (!ch?.send) return null;
    const db = loadDB();
    const payload = { embeds: [bilanEmbed(db, 30)], components: _panelRows() };
    const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    let panel = msgs ? [...msgs.values()].find(m => m.author?.id === guild.client.user.id && (m.embeds?.[0]?.title || '').includes('BILAN COMPTABLE')) : null;
    if (panel) await panel.edit(payload).catch(() => {});
    else panel = await ch.send(payload).catch(() => null);
    if (panel) { try { await panel.pin(); } catch {} const d = loadDB(); d.comptaPanel = { channelId: ch.id, messageId: panel.id }; saveDB(d); }
    return panel;
  } catch { return null; }
}
async function refreshPanel(client) {
  const ref = loadDB().comptaPanel; if (!ref?.channelId || !ref?.messageId) return;
  try {
    const ch = await client.channels.fetch(ref.channelId).catch(() => null); if (!ch) return;
    const msg = await ch.messages.fetch(ref.messageId).catch(() => null); if (!msg) return;
    await msg.edit({ embeds: [bilanEmbed(loadDB(), 30)], components: _panelRows() }).catch(() => {});
  } catch {}
}

function _exportTexte(db) {
  const now = new Date();
  const L = [];
  L.push('═══════════════════════════════════════════════');
  L.push('   IRON WOLF COMPANY — EXPORT COMPTABLE');
  L.push(`   Généré le ${now.toLocaleString('fr-FR')}`);
  L.push('═══════════════════════════════════════════════');
  L.push('');
  L.push(`Trésorerie du coffre : $${_eur(db.coffre || 0)}`);
  L.push('');
  const factures = (db.factures || []).slice().sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const caTotal = factures.reduce((s, f) => s + (parseFloat(f.montant) || 0), 0);
  L.push(`───── FACTURES RÉGLÉES (${factures.length}) — Total $${_eur(caTotal)} ─────`);
  for (const f of factures) {
    const d = f.createdAt ? new Date(f.createdAt).toLocaleDateString('fr-FR') : '—';
    L.push(`${f.numero || '—'} · ${d} · ${(f.clientNom || 'Client').replace(/<@!?\d+>/g, '').trim()} · $${_eur(f.montant)} · ${f.objet || ''}${f.ref ? ` · réf ${f.ref}` : ''}`);
  }
  L.push('');
  const contrats = (db.contrats || []);
  const aEnc = contrats.filter(c => _suivi(c) === 'Validé');
  const totEnc = aEnc.reduce((s, c) => s + _montant(c), 0);
  L.push(`───── CONTRATS À ENCAISSER (${aEnc.length}) — Total estimé $${_eur(totEnc)} ─────`);
  for (const c of aEnc) {
    const ech = c.dateEcheance ? new Date(c.dateEcheance).toLocaleDateString('fr-FR') : '—';
    L.push(`${c.id} · ${_clientNom(c).replace(/<@!?\d+>/g, '').trim()} · $${_eur(_montant(c))} · échéance ${ech} · ${c.objet || ''}`.slice(0, 300));
  }
  L.push('');
  const honores = contrats.filter(c => _suivi(c) === 'Honoré');
  L.push(`───── CONTRATS HONORÉS (${honores.length}) ─────`);
  for (const c of honores) {
    const d = c.honoreAt ? new Date(c.honoreAt).toLocaleDateString('fr-FR') : '—';
    L.push(`${c.id} · ${d} · ${_clientNom(c).replace(/<@!?\d+>/g, '').trim()} · $${_eur(c.remuVerseAuCoffre || _montant(c))} · ${c.objet || ''}`.slice(0, 300));
  }
  L.push('');
  L.push('— Fin de l\'export —');
  return L.join('\n');
}

async function routeInteraction(interaction) {
  try {
    // /compta → installe (ou rafraîchit) le PANNEAU permanent dans le salon courant
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'compta') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const panel = await installerPanel(interaction.guild, interaction.channel);
      await interaction.editReply({ content: panel ? '✅ Panneau **comptabilité** installé ici (épinglé). Il se met à jour tout seul à chaque contrat honoré / facture.' : "❌ Impossible d'installer le panneau ici (vérifie mes permissions d'écriture)." }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && interaction.customId === 'compta_refresh') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.update({ embeds: [bilanEmbed(loadDB(), 30)], components: _panelRows() }).catch(() => {});
      return true;
    }
    // Période → vue ÉPHÉMÈRE (ne modifie pas le panneau partagé)
    if (interaction.isButton?.() && interaction.customId.startsWith('compta_p::')) {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const jours = parseInt(interaction.customId.split('::')[1], 10) || 0;
      await interaction.reply({ embeds: [bilanEmbed(loadDB(), jours)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Encaisser un contrat → sélection puis modal de montant (réutilise le flux d'honoraire existant)
    if (interaction.isButton?.() && interaction.customId === 'compta_encaisser') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const enc = _encaissables(loadDB());
      if (!enc.length) { await interaction.reply({ content: 'Aucun contrat à encaisser pour le moment. ✅', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const opts = enc.slice(0, 25).map(c => ({ label: `${c.id} · ${_clientNom(c).replace(/<@!?\d+>/g, '').trim()}`.slice(0, 100), description: `${_suivi(c)} · ${_montant(c) ? '$' + _eur(_montant(c)) : 'montant à saisir'} · ${(c.objet || '').slice(0, 50)}`.slice(0, 100), value: String(c.id) }));
      const sel = new StringSelectMenuBuilder().setCustomId('compta_enc_sel').setPlaceholder('Choisis le contrat à encaisser…').addOptions(opts);
      await interaction.reply({ content: '💵 Quel contrat encaisser ? *(tout est déjà rempli, je m\'occupe du reste : coffre + facture + bilan)*', components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'compta_enc_sel') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const ref = interaction.values[0];
      const c = (loadDB().contrats || []).find(x => String(x.id) === ref);
      // On ouvre EXACTEMENT le modal d'honoraire géré par index.js (csuivi_montant::ref) → coffre + facture
      const det = c ? _montant(c) : 0;
      const modal = new ModalBuilder().setCustomId(`csuivi_montant::${ref}`).setTitle(`Encaisser ${ref}`.slice(0, 45));
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant à verser au coffre ($)').setStyle(TextInputStyle.Short).setRequired(true).setValue(det ? String(det) : '').setPlaceholder('Ex : 1500')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && interaction.customId === 'compta_export') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      const buf = Buffer.from(_exportTexte(db), 'utf8');
      const file = new AttachmentBuilder(buf, { name: `compta-iwc-${new Date().toISOString().slice(0, 10)}.txt` });
      await interaction.reply({ content: '📤 Export comptable (factures + contrats à encaisser + honorés) :', files: [file], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) { console.log('❌ comptabilite routeInteraction:', e.message); return true; }
}

module.exports = { comptaCommands, routeInteraction, bilanEmbed, installerPanel, refreshPanel };
