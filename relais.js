// ═══════════════════════════════════════════════════════════════
//  RELAIS INTER-SERVEURS — recopie d'affiches vers un autre serveur
//  Via WEBHOOK (lecture seule). Tant qu'aucune URL n'est configurée,
//  toutes les fonctions sont des no-op : rien ne change pour l'existant.
// ═══════════════════════════════════════════════════════════════
const { loadDB, saveDB } = require('./db');
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

// Catégories recopiées (toutes vers le même salon, choix de l'utilisateur)
const TYPES = {
  avis:     '🎯 Avis de recherche',
  annonces: '📢 Annonces / patch-notes',
  carnet:   '🕵️ Carnet de renseignements (confirmés)',
  contrats: '📜 Contrats publiés',
};

function _cfg() { const db = loadDB(); if (!db.relais) db.relais = {}; return db.relais; }
function estValideUrl(u) { return /^https:\/\/(?:ptb\.|canary\.)?(?:discord|discordapp)\.com\/api\/(?:v\d+\/)?webhooks\/\d+\/[\w-]+/.test(String(u || '').trim()); }
function _actif() { const c = _cfg(); return !!c.url && c.enabled !== false; }

// Envoi bas-niveau via webhook. payload = { content, embeds(builders/JSON), files:[{buffer,name}], username, avatarURL }
async function _envoyer(url, { content, embeds, files, username, avatarURL } = {}) {
  const body = { username: (username || 'La Confrérie').slice(0, 80), allowed_mentions: { parse: [] } };
  if (avatarURL) body.avatar_url = avatarURL;
  if (content) body.content = String(content).slice(0, 2000);
  if (embeds && embeds.length) body.embeds = embeds.map(e => (e && typeof e.toJSON === 'function') ? e.toJSON() : e).slice(0, 10);
  try {
    if (files && files.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(body));
      files.forEach((f, i) => { if (f && f.buffer) form.append(`files[${i}]`, new Blob([f.buffer]), f.name || `file${i}.png`); });
      const res = await fetch(url, { method: 'POST', body: form });
      return res.ok;
    }
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    return res.ok;
  } catch (e) { console.log('⚠️ relais envoi:', e.message); return false; }
}

// Recopie une affiche d'une catégorie donnée vers le webhook configuré.
async function relayer(cat, payload = {}) {
  try {
    const cfg = _cfg();
    if (!cfg.url || cfg.enabled === false) return false;
    if (cfg.types && cfg.types[cat] === false) return false;
    return await _envoyer(cfg.url, payload);
  } catch (e) { console.log('⚠️ relais', cat, e.message); return false; }
}

// Recopie d'un embed Discord existant : on convertit les images "attachment://" en URL CDN
// pour qu'elles s'affichent dans l'autre serveur sans réuploader.
function _embedDepuisMessage(srcEmbed, message) {
  const e = EmbedBuilder.from(srcEmbed);
  const cdn = [...(message?.attachments?.values?.() || [])];
  const fix = (u) => {
    if (!u) return u;
    if (String(u).startsWith('attachment://')) { const name = String(u).slice('attachment://'.length); const a = cdn.find(x => x.name === name) || cdn[0]; return a ? a.url : null; }
    return u;
  };
  const j = e.toJSON();
  if (j.thumbnail?.url) e.setThumbnail(fix(j.thumbnail.url));
  if (j.image?.url) e.setImage(fix(j.image.url));
  return e;
}

// Miroir générique d'un message (utilisé pour les salons d'annonces / patch-notes).
async function mirrorMessage(message) {
  try {
    if (!_actif()) return;
    if (!message?.guild || message.system) return;
    const cfg = _cfg();
    if (cfg.types && cfg.types.annonces === false) return;
    const clean = (s) => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
    const cname = clean(message.channel?.name);
    const estAnnonce = (cname.includes('annonce') && !cname.includes('illeg')) || cname.includes('patchnote');
    if (!estAnnonce) return;
    // On ne recopie que de vraies publications (texte ou embed), pas les pièces jointes seules / messages vides
    const embeds = (message.embeds || []).map(e => _embedDepuisMessage(e, message));
    const content = (message.content || '').trim();
    if (!content && !embeds.length) return;
    await _envoyer(cfg.url, {
      content: content || undefined,
      embeds,
      username: 'La Confrérie • ' + (message.channel?.name || 'annonces'),
    });
  } catch (e) { console.log('⚠️ relais mirror:', e.message); }
}

// ── Panneau de configuration (/relais) ──
function _panelBody() {
  const cfg = _cfg();
  const ok = !!cfg.url;
  const actif = ok && cfg.enabled !== false;
  const emb = new EmbedBuilder()
    .setColor(actif ? 0x2ECC71 : 0x95A5A6)
    .setTitle('🛰️ Relais inter-serveurs')
    .setDescription([
      'Recopie automatiquement les **affiches** de ce serveur vers **un autre serveur Discord**, via un **webhook** (copie en lecture seule).',
      '',
      `**État :** ${ok ? (actif ? '🟢 Actif' : '⏸️ En pause') : '⚪ Non configuré'}`,
      ok ? `**Webhook :** \`…${String(cfg.url).slice(-14)}\`` : '',
      '',
      '**Contenus recopiés :**',
      ...Object.values(TYPES).map(t => `• ${t}`),
    ].filter(Boolean).join('\n'))
    .setFooter({ text: 'Webhook : Paramètres du salon cible → Intégrations → Webhooks → Nouveau webhook → Copier l\'URL' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('relais_seturl').setLabel(ok ? 'Changer le webhook' : 'Définir le webhook').setEmoji('🔗').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('relais_test').setLabel('Tester').setEmoji('📨').setStyle(ButtonStyle.Secondary).setDisabled(!ok),
    new ButtonBuilder().setCustomId('relais_toggle').setLabel(actif ? 'Mettre en pause' : 'Activer').setEmoji(actif ? '⏸️' : '▶️').setStyle(actif ? ButtonStyle.Secondary : ButtonStyle.Success).setDisabled(!ok),
    new ButtonBuilder().setCustomId('relais_clear').setLabel('Supprimer').setEmoji('🗑️').setStyle(ButtonStyle.Danger).setDisabled(!ok),
  );
  return { embeds: [emb], components: [row] };
}

async function handleCommand(interaction) {
  return interaction.reply({ ..._panelBody(), flags: MessageFlags.Ephemeral });
}

async function routeInteraction(interaction) {
  const cid = interaction.customId || '';
  if (!cid.startsWith('relais_')) return false;

  if (interaction.isButton() && cid === 'relais_seturl') {
    const modal = new ModalBuilder().setCustomId('relais_url_modal').setTitle('Webhook du salon cible');
    modal.addComponents(new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('url').setLabel('URL du webhook (autre serveur)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://discord.com/api/webhooks/...')
    ));
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit() && cid === 'relais_url_modal') {
    const url = (interaction.fields.getTextInputValue('url') || '').trim();
    if (!estValideUrl(url)) return interaction.reply({ content: '❌ URL de webhook invalide.\nElle doit ressembler à `https://discord.com/api/webhooks/123…/abc…`', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const okTest = await _envoyer(url, { content: '✅ **Relais connecté** — les affiches de La Confrérie arriveront désormais ici.', username: 'La Confrérie' });
    if (!okTest) return interaction.editReply({ content: '❌ Impossible d\'envoyer via ce webhook (URL expirée ou supprimée ?). Recrée-le et réessaie.' });
    const db = loadDB(); if (!db.relais) db.relais = {};
    db.relais.url = url; db.relais.enabled = true;
    db.relais.types = db.relais.types || { avis: true, annonces: true, carnet: true, contrats: true };
    saveDB(db);
    return interaction.editReply({ content: '🟢 Relais **activé**. Un message de test vient d\'être envoyé dans le salon cible — vérifie qu\'il est bien arrivé.' });
  }

  if (interaction.isButton() && cid === 'relais_test') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const cfg = _cfg();
    const ok = cfg.url ? await _envoyer(cfg.url, { content: '📨 Test du relais — tout fonctionne.', username: 'La Confrérie' }) : false;
    return interaction.editReply({ content: ok ? '✅ Message de test envoyé dans le salon cible.' : '❌ Échec de l\'envoi (webhook invalide ou supprimé ?).' });
  }

  if (interaction.isButton() && cid === 'relais_toggle') {
    const db = loadDB(); if (!db.relais) db.relais = {};
    db.relais.enabled = db.relais.enabled === false;
    saveDB(db);
    return interaction.update(_panelBody()).then(() => true).catch(() => true);
  }

  if (interaction.isButton() && cid === 'relais_clear') {
    const db = loadDB(); db.relais = {}; saveDB(db);
    return interaction.update(_panelBody()).then(() => true).catch(() => true);
  }

  return false;
}

module.exports = { relayer, mirrorMessage, routeInteraction, handleCommand, estActif: _actif, TYPES };
