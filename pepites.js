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
const estDirection = m => global.aAccesTotal?.(m) || !!m?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n)));

function _ens(db) {
  if (!db.pepites) db.pepites = { total: 0, prix: 0.05, log: [], panelId: null, parPersonne: {} };
  if (!Array.isArray(db.pepites.log)) db.pepites.log = [];
  if (!db.pepites.parPersonne || typeof db.pepites.parPersonne !== 'object') db.pepites.parPersonne = {};
  return db.pepites;
}
function _fmtArgent(n) { return Number(n).toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); }

// Extrait l'opération demandée d'un message (ou null si ce n'est pas un comptage)
function _parse(content) {
  const c = (content || '').trim();
  if (!c) return null;
  let m;
  // Commandes explicites (ancrées en début de message)
  if ((m = c.match(/^=\s*(\d{1,7})\b/))) return { mode: 'set', n: +m[1] };   // « =50 » → fixer le total
  if ((m = c.match(/^-\s*(\d{1,7})\b/))) return { mode: 'sub', n: +m[1] };   // « -2 » → retirer
  if (/^\+?\s*\d{1,7}\s*$/.test(c)) { m = c.match(/(\d{1,7})/); return { mode: 'add', n: +m[1] }; } // « 5 » / « +5 » → ajouter
  // Salon dédié : un nom/contexte + un nombre → on AJOUTE le nombre
  // (ex : « Jonas = 121 », « Jonas : 2030 », « Renard 2293 », « ... 2293 pépites »)
  const near = c.match(/(\d{1,7})\s*(?:p[ée]pites?|nuggets?|⛏|💰)/i); // nombre collé à « pépite » prioritaire
  if (near) return { mode: 'add', n: +near[1] };
  const nums = (c.match(/\d{1,7}/g) || []).map(Number).filter(n => n > 0);
  if (!nums.length) return null;
  if (nums.length === 1) return { mode: 'add', n: nums[0] };
  return { mode: 'add', n: Math.max(...nums) }; // plusieurs nombres sans mot-clé : le plus grand (le montant probable)
}

function _panelEmbed(db) {
  const p = _ens(db);
  const total = p.total || 0;
  const prix = p.prix || 0;
  const valeur = total * prix;
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('💰 PÉPITES — IRON WOLF COMPANY')
    .setDescription([
      '*Ramassé des pépites ? Poste le nombre ici — le total et le gain se calculent tout seuls.*',
      '',
      '➕ `5` ou `+5` pour **ajouter** · ➖ `-2` pour **retirer** · 🟰 `=50` pour **fixer** le total.',
      '_Tu peux aussi écrire avec un nom : `Jonas 121`, `Renard : 2030`, `… 2293 pépites` — je prends le nombre._',
    ].join('\n'))
    .addFields(
      { name: '⛏️ Total ramassé', value: `**${total.toLocaleString('fr-FR')}** pépite(s)`, inline: true },
      { name: '💵 Prix unitaire', value: prix > 0 ? `**${_fmtArgent(prix)} $** / pépite` : '*non défini*', inline: true },
    );
  if (prix > 0) {
    e.addFields({
      name: '💰 Ce que ça rapporte',
      value: `> **${valeur.toLocaleString('fr-FR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} $**\n*${total.toLocaleString('fr-FR')} pépites × ${_fmtArgent(prix)} $ = ${_fmtArgent(valeur)} $*`,
      inline: false,
    });
  } else {
    e.addFields({ name: '💰 Ce que ça rapporte', value: '*Définis le prix unitaire (bouton 💵) pour voir le gain estimé.*', inline: false });
  }
  const tops = Object.entries(p.parPersonne || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
  if (tops.length) {
    const medailles = ['🥇', '🥈', '🥉'];
    e.addFields({ name: '🏆 Meilleurs ramasseurs', value: tops.map(([u, n], i) => `${medailles[i] || '•'} <@${u}> — **${n.toLocaleString('fr-FR')}** pépite(s)`).join('\n').slice(0, 1024), inline: false });
  }
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
    else { p.total += parsed.n; p.parPersonne[message.author.id] = (p.parPersonne[message.author.id] || 0) + parsed.n; } // crédite le ramasseur
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
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prix').setLabel('Prix $ / pépite (ex : 0.05 · 0 = enlever)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('ex : 0.05 ou 0.06')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'pep_prix_modal') {
      const raw = (interaction.fields.getTextInputValue('prix') || '').replace(',', '.').replace(/[^0-9.]/g, '');
      const v = parseFloat(raw) || 0;
      const db = loadDB(); const p = _ens(db); p.prix = Math.max(0, v); saveDB(db);
      await _majPanneau(interaction.guild, db);
      await interaction.reply({ content: `✅ Prix unitaire : ${p.prix > 0 ? `$${_fmtArgent(p.prix)}/pépite` : 'retiré'}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'pep_undo') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const p = _ens(db); const last = p.log.pop();
      if (last) {
        if (last.signe === '-') p.total += last.n;
        else if (last.signe === '=') { /* on ne restaure pas un set */ }
        else { p.total = Math.max(0, p.total - last.n); if (last.u) p.parPersonne[last.u] = Math.max(0, (p.parPersonne[last.u] || 0) - last.n); } // décrédite le ramasseur
      }
      saveDB(db); await _majPanneau(interaction.guild, db);
      await interaction.reply({ content: last ? `↩️ Dernier mouvement annulé (${last.signe}${last.n}).` : 'Rien à annuler.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'pep_reset') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const p = _ens(db); p.total = 0; p.log = []; p.parPersonne = {}; saveDB(db); await _majPanneau(interaction.guild, db);
      await interaction.reply({ content: '🗑️ Compteur de pépites remis à zéro.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ pepites routeInteraction:', e.message); return true; }
}

module.exports = { onMessage, routeInteraction, installerPanneau, SALON_PEPITES };
