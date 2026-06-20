// ───────────────────────────────────────────────────────────────────────────
//  parrainage.js — Système de parrainage IWC, extrait d'index.js À L'IDENTIQUE.
//
//  Les vérifications de rôles (isDirection / isMembre) ne sont PAS réécrites :
//  elles sont INJECTÉES depuis index.js via init(). Ce sont donc EXACTEMENT
//  les mêmes fonctions (mêmes rôles, mêmes règles), pas des copies.
//  Aucune synchronisation Notion, aucun helper partagé déplacé.
//  → Comportement strictement inchangé.
// ───────────────────────────────────────────────────────────────────────────

const { EmbedBuilder, MessageFlags } = require('discord.js');
const { loadDB, saveDB } = require('./db');

// Injectées par index.js (mêmes fonctions que partout ailleurs).
let isDirection = () => false;
let isMembre = () => false;

function init(deps) {
  if (deps && typeof deps.isDirection === 'function') isDirection = deps.isDirection;
  if (deps && typeof deps.isMembre === 'function') isMembre = deps.isMembre;
}

async function _handleParrainageAssigner(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const parrain = interaction.options.getUser('parrain');
  const filleul = interaction.options.getUser('filleul');
  if (!parrain || !filleul || parrain.id === filleul.id) return interaction.reply({ content: '❌ Choisis un parrain et un filleul différents.', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  db.parrainages = db.parrainages || {};
  db.parrainages[filleul.id] = { parrainId: parrain.id, date: new Date().toLocaleDateString('fr-FR') };
  saveDB(db);
  const pM = await interaction.guild.members.fetch(parrain.id).catch(() => null);
  const fM = await interaction.guild.members.fetch(filleul.id).catch(() => null);
  if (pM) pM.send({ content: `🤝 Tu es désormais le **parrain** de **${fM?.displayName || filleul.username}** à l'Iron Wolf Company. Accompagne-le dans ses débuts !` }).catch(() => {});
  if (fM) fM.send({ content: `🤝 **${pM?.displayName || parrain.username}** est ton **parrain** à l'Iron Wolf Company. N'hésite pas à lui poser tes questions, il est là pour t'aider !` }).catch(() => {});
  return interaction.reply({ content: `✅ **${parrain.username}** est maintenant le parrain de **${filleul.username}**. Les deux ont été prévenus en MP.`, flags: MessageFlags.Ephemeral });
}

async function _handleMonParrainage(interaction) {
  if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres.', flags: MessageFlags.Ephemeral });
  const db = loadDB(); const par = db.parrainages || {}; const id = interaction.member.id;
  const e = new EmbedBuilder().setColor(0xB8860B).setTitle(`🤝 Mon parrainage — ${interaction.member.displayName}`);
  const monParrain = par[id] && par[id].parrainId;
  if (monParrain) {
    const pm = await interaction.guild.members.fetch(monParrain).catch(() => null);
    e.addFields({ name: '🎓 Mon parrain', value: pm ? `${pm}` : 'Membre inconnu', inline: false });
  }
  const filleuls = Object.keys(par).filter(fid => par[fid].parrainId === id);
  if (filleuls.length) {
    const noms = [];
    for (const fid of filleuls) { const fm = await interaction.guild.members.fetch(fid).catch(() => null); if (fm) noms.push(`• ${fm}`); }
    e.addFields({ name: `👥 Mes filleuls (${noms.length})`, value: (noms.join('\n') || '—').slice(0, 1024), inline: false });
  }
  if (!monParrain && !filleuls.length) e.setDescription("*Tu n'as ni parrain ni filleul pour le moment. La Direction peut t'en attribuer un.*");
  e.setFooter({ text: 'Iron Wolf Company' });
  return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}

// Renvoie true si l'interaction a été prise en charge (sinon index.js continue).
async function routeInteraction(interaction) {
  if (typeof interaction.isChatInputCommand === 'function' && interaction.isChatInputCommand()) {
    if (interaction.commandName === 'parrainage')     { await _handleParrainageAssigner(interaction); return true; }
    if (interaction.commandName === 'mon-parrainage') { await _handleMonParrainage(interaction); return true; }
  }
  if (typeof interaction.isButton === 'function' && interaction.isButton() && interaction.customId === 'menu_parrainage') {
    await _handleMonParrainage(interaction); return true;
  }
  return false;
}

module.exports = { init, routeInteraction };
