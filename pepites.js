// ═══════════════════════════════════════════════════════════════
//  pepites.js — Compteur de pépites d'or
//  Dans le salon dédié, chaque message contenant un nombre (ex: « 5 »,
//  « +3 », « 3 pépites ») s'ajoute au total. Un panneau épinglé tient le
//  TOTAL exact à jour (+ valeur estimée si un prix unitaire est défini).
//   = N  → fixe le total à N      |   -N → retire N
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const SALON_PEPITES = '1521258635416834214';
const DIRECTION = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Conseil'];
const estDirection = m => !!m?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n)));

function _ens(db) {
  if (!db.pepites) db.pepites = { total: 0, prix: 0, log: [], panelId: null };
  if (!Array.isArray(db.pepites.log)) db.pepites.log = [];
  return db.pepites;
}

// Extrait l'opération demandée d'un message (ou null si ce n'est pas un comptage)
function _parse(content) {
  const c = (content || '').trim();
  if (!c) return null;
  let m;
  if ((m = c.match(/^=\s*(\d{1,7})\b/))) return { mode: 'set', n: +m[1] };
  if ((m = c.match(/^-\s*(\d{1,7})\b/))) return { mode: 'sub', n: +m[1] };
  if (/^\+?\s*\d{1,7}\s*$/.test(c)) { m = c.match(/(\d{1,7})/); return { mode: 'add', n: +m[1] }; }
  if (/p[ée]pite|nugget|⛏|💰/i.test(c)) { m = c.match(/(\d{1,7})/); if (m) return { mode: 'add', n: +m[1] }; }
  return null;
}

function _panelEmbed(db) {
  const p = _ens(db);
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('💰 PÉPITES — IRON WOLF COMPANY')
    .setDescription([
      '*Ramassé des pépites ? Poste le nombre ici — le total se calcule tout seul.*',
      '',
      '➕ `5` ou `+5` pour **ajouter** · ➖ `-2` pour **retirer** · 🟰 `=50` pour **fixer** le total.',
    ].join('\n'))
    .addFields({ name: '⛏️ Total ramassé', value: `**${p.total.toLocaleString('fr-FR')}** pépite(s)`, inline: true });
  if (p.prix > 0) e.addFields({ name: '💵 Valeur estimée', value: `**$${(p.total * p.prix).toLocaleString('fr-FR')}** *(${p.prix}$/pépite)*`, inline: true });
  const log = (p.log || []).slice(-5).reverse();
  if (log.length) e.addFields({ name: '🧾 Derniers mouvements', value: log.map(l => `• ${l.signe || '+'}${l.n} — <@${l.u}>`).join('\n').slice(0, 1024), inline: false });
  e.setFooter({ text: 'Iron Wolf Company • Compteur de pépites' });
  return e;
}
function _panelRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pep_prix').setLabel('Prix unitaire').setEmoji('💵').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pep_undo').setLabel('Annuler le dernier').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pep_reset').setLabel('Réinitialiser').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  )];
}

async function _majPanneau(guild, db) {
  try {
    const ch = await guild.channels.fetch(SALON_PEPITES).catch(() => null);
    if (!ch?.messages) return;
    const me = guild.client.user.id; const p = _ens(db);
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('PÉPITES');
    let panel = null;
    if (p.panelId) panel = await ch.messages.fetch(p.panelId).catch(() => null);
    if (!panel) { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) panel = [...pins.values()].find(estPanel) || null; }
    if (!panel) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) panel = [...recent.values()].find(estPanel) || null; }
    if (panel) { await panel.edit({ embeds: [_panelEmbed(db)], components: _panelRows() }).catch(() => {}); if (p.panelId !== panel.id) { p.panelId = panel.id; saveDB(db); } return; }
    const sent = await ch.send({ embeds: [_panelEmbed(db)], components: _panelRows() }).catch(() => null);
    if (sent) { await sent.pin().catch(() => {}); p.panelId = sent.id; saveDB(db); }
  } catch (e) { console.log('⚠️ pepites _majPanneau:', e.message); }
}

async function installerPanneau(guild) {
  try { const db = loadDB(); _ens(db); await _majPanneau(guild, db); } catch (e) { console.log('⚠️ pepites installerPanneau:', e.message); }
}

async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot || message.webhookId) return false;
    if (message.channelId !== SALON_PEPITES) return false;
    const parsed = _parse(message.content);
    if (!parsed) return false;
    const db = loadDB(); const p = _ens(db);
    if (parsed.mode === 'set') p.total = parsed.n;
    else if (parsed.mode === 'sub') p.total = Math.max(0, p.total - parsed.n);
    else p.total += parsed.n;
    p.log.push({ u: message.author.id, n: parsed.n, signe: parsed.mode === 'sub' ? '-' : (parsed.mode === 'set' ? '=' : '+'), at: Date.now() });
    if (p.log.length > 50) p.log = p.log.slice(-50);
    saveDB(db);
    await message.react('✅').catch(() => {});
    await _majPanneau(message.guild, db);
    return true;
  } catch (e) { console.log('❌ pepites onMessage:', e.message); return false; }
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (interaction.isButton?.() && cid === 'pep_prix') {
      const modal = new ModalBuilder().setCustomId('pep_prix_modal').setTitle('💵 Prix unitaire d\'une pépite');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prix').setLabel('Prix en $ par pépite (0 = enlever)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('ex : 8')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'pep_prix_modal') {
      const v = parseInt((interaction.fields.getTextInputValue('prix') || '').replace(/[^0-9]/g, ''), 10) || 0;
      const db = loadDB(); const p = _ens(db); p.prix = Math.max(0, v); saveDB(db);
      await _majPanneau(interaction.guild, db);
      await interaction.reply({ content: `✅ Prix unitaire : ${p.prix > 0 ? `$${p.prix}/pépite` : 'retiré'}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'pep_undo') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const p = _ens(db); const last = p.log.pop();
      if (last) { if (last.signe === '-') p.total += last.n; else if (last.signe === '=') { /* on ne restaure pas un set */ } else p.total = Math.max(0, p.total - last.n); }
      saveDB(db); await _majPanneau(interaction.guild, db);
      await interaction.reply({ content: last ? `↩️ Dernier mouvement annulé (${last.signe}${last.n}).` : 'Rien à annuler.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'pep_reset') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const p = _ens(db); p.total = 0; p.log = []; saveDB(db); await _majPanneau(interaction.guild, db);
      await interaction.reply({ content: '🗑️ Compteur de pépites remis à zéro.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ pepites routeInteraction:', e.message); return true; }
}

module.exports = { onMessage, routeInteraction, installerPanneau, SALON_PEPITES };
