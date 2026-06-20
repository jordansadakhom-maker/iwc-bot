// ═══════════════════════════════════════════════════════════════
// tableaubord.js — Tableau de bord unifié des missions & contrats
// IWC (légal) + La Confrérie (clandestin) + missions/cibles, dans une
// seule vue, regroupée par statut, avec filtres et tri par échéance.
// Branchement index.js : require + tableauCommands dans le set + routeInteraction.
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  SlashCommandBuilder, MessageFlags,
} = require('discord.js');
const { loadDB } = require('./db');

const tableauCommands = [
  new SlashCommandBuilder().setName('tableau-missions').setDescription('📋 Tableau de bord de toutes les missions et contrats (IWC + Confrérie)'),
];

// ─── Normalisation des statuts (3 schémas : IWC / Confrérie / missions) ───
function _phase(statut) {
  const s = String(statut || '').toLowerCase().trim();
  if (['signe', 'signé', 'actif', 'en cours'].includes(s)) return 'encours';
  if (['reussie', 'réussie', 'echouee', 'échouée', 'refuse', 'refusé', 'cloture', 'cloturé', 'clôturé', 'termine', 'terminé'].includes(s)) return 'termine';
  return 'attente'; // en_attente, propose, 'en attente', vide…
}
function _labelStatut(statut) {
  const map = {
    en_attente: '🟡 En attente', propose: '🟡 Proposé',
    actif: '🟢 En cours', signe: '🟢 Signé',
    reussie: '✅ Réussie', echouee: '💀 Échouée', refuse: '⛔ Refusé',
  };
  return map[statut] || statut || '—';
}
function _fmtDate(d) {
  if (!d) return null;
  const dt = new Date(d);
  return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR');
}
function _enRetard(d, phase) {
  if (!d || phase === 'termine') return false;
  const dt = new Date(d);
  return !isNaN(dt.getTime()) && dt.getTime() < Date.now();
}

// ─── Collecte unifiée ───
function _collecter(db) {
  const items = [];
  for (const c of (db.contrats || [])) {
    const estConfrerie = ['propose', 'actif', 'reussie', 'echouee'].includes(c.status);
    items.push({
      ref: c.id || '—',
      client: c.clientNom || c.commanditaire || '—',
      type: c.typeMission || c.objet || (c.type === 'offre' ? 'Offre de contrat' : '—'),
      echeance: c.dateEcheance || null,
      statut: c.status,
      remu: c.remuneration || c.prime || null,
      pole: estConfrerie ? '🔪' : '⚖️',
      phase: _phase(c.status),
    });
  }
  for (const [ref, m] of Object.entries(db.missions || {})) {
    items.push({
      ref,
      client: m.cible ? `🎯 ${m.cible}` : '—',
      type: m.type || 'Mission',
      echeance: null,
      statut: m.statut,
      remu: null,
      pole: '🔪',
      phase: _phase(m.statut),
    });
  }
  return items;
}

function _ligne(it) {
  const retard = _enRetard(it.echeance, it.phase) ? ' ⚠️' : '';
  const ech = it.echeance ? ` · 📅 ${_fmtDate(it.echeance)}${retard}` : '';
  const remu = it.remu ? ` · 💰 ${it.remu}` : '';
  return `${it.pole} \`${it.ref}\` — **${String(it.client).slice(0, 40)}** · ${String(it.type).slice(0, 30)}${ech}${remu}`;
}

function _embed(db, filtre) {
  const all = _collecter(db);
  const titres = { attente: '🟡 En attente / proposés', encours: '🟢 En cours', termine: '✅ Terminés' };
  const phasesAff = filtre === 'tous' ? ['attente', 'encours', 'termine'] : [filtre];
  const e = new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle('📋 Tableau de bord — Missions & Contrats')
    .setFooter({ text: `IWC ⚖️ + Confrérie 🔪 • ${all.length} au total • ${new Date().toLocaleString('fr-FR')}` });
  let vide = true;
  for (const ph of ['attente', 'encours', 'termine']) {
    if (!phasesAff.includes(ph)) continue;
    const list = all.filter(i => i.phase === ph);
    if (!list.length) continue;
    vide = false;
    list.sort((a, b) => {
      const da = a.echeance ? new Date(a.echeance).getTime() : Infinity;
      const dbb = b.echeance ? new Date(b.echeance).getTime() : Infinity;
      return da - dbb;
    });
    const txt = list.slice(0, 20).map(_ligne).join('\n').slice(0, 1024);
    const suffixe = list.length > 20 ? ` (20 affichés sur ${list.length})` : ` (${list.length})`;
    e.addFields({ name: `${titres[ph]}${suffixe}`, value: txt || '—', inline: false });
  }
  if (vide) e.setDescription('*Aucune mission ou contrat pour ce filtre.*');
  return e;
}

function _boutons(filtre) {
  const mk = (id, label, emoji) => new ButtonBuilder()
    .setCustomId(`tbm_${id}`).setLabel(label).setEmoji(emoji)
    .setStyle(filtre === id ? ButtonStyle.Primary : ButtonStyle.Secondary);
  return new ActionRowBuilder().addComponents(
    mk('encours', 'En cours', '🟢'),
    mk('attente', 'En attente', '🟡'),
    mk('termine', 'Terminés', '✅'),
    mk('tous', 'Tous', '📋'),
  );
}

async function _afficher(interaction, filtre, isUpdate) {
  const db = loadDB();
  const payload = { embeds: [_embed(db, filtre)], components: [_boutons(filtre)] };
  if (isUpdate) return interaction.update(payload);
  return interaction.reply({ ...payload, flags: MessageFlags.Ephemeral });
}

async function routeInteraction(interaction) {
  if (interaction.isChatInputCommand?.() && interaction.commandName === 'tableau-missions') {
    await _afficher(interaction, 'encours', false);
    return true;
  }
  if (interaction.isButton?.() && interaction.customId?.startsWith('tbm_')) {
    const filtre = interaction.customId.replace('tbm_', '');
    await _afficher(interaction, filtre, true);
    return true;
  }
  return false;
}

module.exports = { tableauCommands, routeInteraction };
