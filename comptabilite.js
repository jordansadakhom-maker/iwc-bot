// ───────────────────────────────────────────────────────────────────────────
//  comptabilite.js — Bilan comptable de la Compagnie (Direction)
//  ----------------------------------------------------------------------------
//   • /compta : bilan sur une période (7j / 30j / tout) — chiffre d'affaires
//     (factures réglées), contrats À ENCAISSER (en attente de paiement) + ceux
//     EN RETARD, trésorerie du coffre, top clients.
//   • Bouton 📤 Export : génère un fichier récap (factures + contrats).
//   Lecture seule : ne modifie ni les contrats, ni le coffre.
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, AttachmentBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));

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
    new ButtonBuilder().setCustomId('compta_p::7').setLabel('7 jours').setStyle(jours === 7 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('compta_p::30').setLabel('30 jours').setStyle(jours === 30 ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('compta_p::0').setLabel('Tout').setStyle(!jours ? ButtonStyle.Primary : ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('compta_export').setLabel('Exporter').setEmoji('📤').setStyle(ButtonStyle.Success),
  );
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
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'compta') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      await interaction.reply({ embeds: [bilanEmbed(db, 30)], components: [_bilanRow(30)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && interaction.customId.startsWith('compta_p::')) {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const jours = parseInt(interaction.customId.split('::')[1], 10) || 0;
      const db = loadDB();
      await interaction.update({ embeds: [bilanEmbed(db, jours)], components: [_bilanRow(jours)] }).catch(() => {});
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

module.exports = { comptaCommands, routeInteraction, bilanEmbed };
