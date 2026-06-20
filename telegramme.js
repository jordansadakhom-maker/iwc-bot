// ───────────────────────────────────────────────────────────────────────────
//  telegramme.js — Conversations suivies sur les télégrammes reçus (modmail)
//  ----------------------------------------------------------------------------
//  Quand un client envoie un télégramme (bouton « ✉ Envoyer un télégramme »),
//  index.js appelle ouvrirConversation() : un FIL est créé sous le télégramme.
//    • L'équipe écrit dans le fil   → envoyé au client EN MP (autant qu'on veut)
//    • « // » en début de message    → note interne (non envoyée)
//    • Le client répond en MP        → réacheminé automatiquement DANS le fil
//    • Bouton 🔒 Clôturer / ♻️ Rouvrir
//
//  Identifiants isolés : tg_close:: / tg_reopen::  (aucune collision).
//  Stockage : db.conversations[rdvId].
// ───────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const COL = { or: 0xC8A45C, sepia: 0x8B5A2A, vert: 0x2ECC71, rouge: 0xC0392B, gris: 0x555555 };

const GESTION_ROLES = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Secretaire'];
function peutGerer(member) {
  try { return !!member?.roles?.cache?.some(r => GESTION_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}

function _store(db) { if (!db.conversations) db.conversations = {}; return db.conversations; }
function _findOuverteParUser(store, userId) {
  const list = Object.values(store).filter(c => c.demandeurId === userId && c.status === 'ouvert');
  return list.length ? list[list.length - 1] : null;
}

// ── Télégramme stylé (vers le client en MP) ──
function _embedMP(titre, lignes, ref) {
  return new EmbedBuilder().setColor(COL.or).setTitle(titre)
    .setDescription(['```', ' WESTERN UNION ', '```', ...lignes].join('\n'))
    .setFooter({ text: ref ? `Réf. ${ref}` : 'Iron Wolf Company' }).setTimestamp();
}

// ═══════════════════════════════════════════════════════════════
//  OUVERTURE D'UNE CONVERSATION (appelé par index.js après le télégramme posté)
// ═══════════════════════════════════════════════════════════════
async function ouvrirConversation(message, { rdvId, demandeurId, nomRP }) {
  try {
    if (!message || typeof message.startThread !== 'function') return null;
    const db = loadDB(); const store = _store(db);
    if (store[rdvId]?.threadId) return store[rdvId]; // déjà ouverte

    const thread = await message.startThread({
      name: `💬 ${(nomRP || 'Client').slice(0, 60)} — ${rdvId}`,
      autoArchiveDuration: 10080,
    }).catch(() => null);
    if (!thread) return null;

    store[rdvId] = {
      rdvId, demandeurId, nomRP: nomRP || 'Client',
      threadId: thread.id, parentChannelId: message.channel.id, msgId: message.id,
      status: 'ouvert', createdAt: Date.now(),
    };
    persist(db);

    const intro = new EmbedBuilder().setColor(COL.vert).setTitle('💬 Conversation ouverte')
      .setDescription([
        `Discussion avec <@${demandeurId}> (**${nomRP || 'Client'}**).`,
        '',
        '✍️ **Écris ici** → ton message est envoyé au client **en message privé**.',
        '📝 Pour une **note interne** (non envoyée), commence ton message par `//`.',
        '📨 Les **réponses du client** apparaîtront ici automatiquement.',
        '🔒 Clique sur **Clôturer** quand la conversation est terminée.',
      ].join('\n'));
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`tg_close::${rdvId}`).setLabel('🔒 Clôturer la conversation').setStyle(ButtonStyle.Danger),
    );
    await thread.send({ embeds: [intro], components: [row] }).catch(() => {});

    // Prévenir le client qu'il peut répondre en MP
    const user = await message.client.users.fetch(demandeurId).catch(() => null);
    if (user) {
      const sent = await user.send({ embeds: [_embedMP('✉ TÉLÉGRAMME — IRON WOLF COMPANY', [
        'Votre télégramme a bien été reçu par **Iron Wolf Company**.', '',
        'Vous pouvez **répondre directement à ce message** pour échanger avec nous.',
      ], rdvId)] }).catch(() => null);
      if (!sent) await thread.send('⚠️ Le client a ses **MP fermés** : il ne pourra peut-être pas recevoir vos réponses ni vous répondre en MP.').catch(() => {});
    }
    return store[rdvId];
  } catch (e) { console.log('❌ telegramme ouvrirConversation:', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════════
//  RELAIS DES MESSAGES (appelé par index.js dans messageCreate)
//  → renvoie true si le message a été pris en charge
// ═══════════════════════════════════════════════════════════════
function _pingRoles(guild) {
  try {
    const ids = guild.roles.cache.filter(r => { const n = (r.name || '').toLowerCase(); return n.includes('homme') || n.includes('fondateur'); }).map(r => r.id);
    return { content: ids.map(id => `<@&${id}>`).join(' '), ids };
  } catch { return { content: '', ids: [] }; }
}

async function onMessage(message) {
  try {
    if (message.author?.bot) return false;
    const isDM = !message.guild;
    const isThread = !!(message.guild && message.channel?.isThread?.());
    if (!isDM && !isThread) return false;

    const db = loadDB(); const store = _store(db);

    // (1) MP du client → vers le fil
    if (isDM) {
      const conv = _findOuverteParUser(store, message.author.id);
      if (!conv) return false; // pas de conversation suivie → on laisse l'ancien relais gérer
      const thread = await message.client.channels.fetch(conv.threadId).catch(() => null);
      if (!thread) return false;
      const files = [...message.attachments.values()].map(a => a.url);
      const e = new EmbedBuilder().setColor(COL.sepia)
        .setAuthor({ name: `📨 ${conv.nomRP || message.author.username} (client)`, iconURL: message.author.displayAvatarURL?.() })
        .setDescription((message.content || '').slice(0, 4000) || '*(pièce jointe)*')
        .setTimestamp();
      const ping = _pingRoles(thread.guild);
      const tete = [ping.content ? `${ping.content} — 📨 **réponse d'un client**` : '', files.length ? files.join('\n') : ''].filter(Boolean).join('\n');
      await thread.send({ content: tete || null, embeds: [e], allowedMentions: { roles: ping.ids } }).catch(() => {});
      await message.react('📨').catch(() => {});
      return true;
    }

    // (2) Message de l'équipe dans un fil de conversation → MP au client
    const conv = Object.values(store).find(c => c.threadId === message.channel.id);
    if (!conv) return false;
    if (conv.status !== 'ouvert') return false; // fil clôturé : on ne relaie plus
    const content = message.content || '';
    if (!content && message.attachments.size === 0) return false;
    if (/^\s*(\/\/|\(\()/.test(content)) { await message.react('📝').catch(() => {}); return true; } // note interne

    const user = await message.client.users.fetch(conv.demandeurId).catch(() => null);
    if (!user) { await message.react('⚠️').catch(() => {}); return true; }
    const files = [...message.attachments.values()].map(a => a.url);
    const sent = await user.send({
      content: files.length ? files.join('\n') : null,
      embeds: [_embedMP('✉ TÉLÉGRAMME — IRON WOLF COMPANY', [content.slice(0, 3500) || '*(pièce jointe)*', '', '*Répondez à ce message pour continuer.*'], conv.rdvId)],
    }).catch(() => null);
    await message.react(sent ? '✅' : '⚠️').catch(() => {});
    return true;
  } catch (e) { console.log('❌ telegramme onMessage:', e.message); return false; }
}

// ═══════════════════════════════════════════════════════════════
//  BOUTONS : Clôturer / Rouvrir
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    if (!interaction.isButton?.()) return false;
    const isClose = interaction.customId?.startsWith('tg_close::');
    const isReopen = interaction.customId?.startsWith('tg_reopen::');
    if (!isClose && !isReopen) return false;

    if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à l\'équipe.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const rdvId = interaction.customId.split('::')[1];
    const db = loadDB(); const store = _store(db);
    const conv = store[rdvId];
    if (!conv) { await interaction.reply({ content: '⚠️ Conversation introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

    conv.status = isReopen ? 'ouvert' : 'cloture';
    conv[isReopen ? 'reopenedAt' : 'closedAt'] = Date.now();
    persist(db);

    // Met à jour le bouton du message d'intro
    const newRow = new ActionRowBuilder().addComponents(
      isReopen
        ? new ButtonBuilder().setCustomId(`tg_close::${rdvId}`).setLabel('🔒 Clôturer la conversation').setStyle(ButtonStyle.Danger)
        : new ButtonBuilder().setCustomId(`tg_reopen::${rdvId}`).setLabel('♻️ Rouvrir la conversation').setStyle(ButtonStyle.Secondary),
    );
    await interaction.update({ components: [newRow] }).catch(() => { interaction.deferUpdate?.().catch(() => {}); });

    // Notifier le client
    const user = await interaction.client.users.fetch(conv.demandeurId).catch(() => null);
    if (user) {
      const e = isReopen
        ? _embedMP('✉ CONVERSATION ROUVERTE', ['Iron Wolf Company a rouvert votre échange.', '', 'Vous pouvez de nouveau **répondre à ce message**.'], rdvId)
        : _embedMP('📪 CONVERSATION CLÔTURÉE', ['Votre échange avec Iron Wolf Company est terminé. Merci !', '', 'Pour une nouvelle demande, repassez par le bouton **✉ Envoyer un télégramme**.'], rdvId);
      await user.send({ embeds: [e] }).catch(() => {});
    }

    // Mettre à jour le fil
    const thread = await interaction.client.channels.fetch(conv.threadId).catch(() => null);
    if (thread) {
      await thread.send(isReopen ? `♻️ **Conversation rouverte** par <@${interaction.user.id}>.` : `🔒 **Conversation clôturée** par <@${interaction.user.id}>.`).catch(() => {});
      await thread.setArchived(!isReopen).catch(() => {});
    }
    return true;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ telegramme routeInteraction:', e.message);
    return true;
  }
}

module.exports = { ouvrirConversation, onMessage, routeInteraction };
