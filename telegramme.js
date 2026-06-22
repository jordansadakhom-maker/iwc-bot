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
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags, SlashCommandBuilder, AttachmentBuilder, ChannelType,
} = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const COL = { or: 0xC8A45C, sepia: 0x8B5A2A, vert: 0x2ECC71, rouge: 0xC0392B, gris: 0x555555 };

// ───────────────────────────────────────────────────────────────────────────
//  TRACE DE CONVERSATION — journal du fil, résumé IA, registre, archive Notion
// ───────────────────────────────────────────────────────────────────────────
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;
const NOTION_TOKEN = process.env.NOTION_TOKEN || null;
const NOTION_TELEGRAMMES_DB = process.env.NOTION_TELEGRAMMES_DB || null;

function _dateHeure(d) { try { return new Date(d).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); } catch { return '—'; } }
function _dureeHumaine(ms) {
  if (!ms || ms < 0) return '—';
  const min = Math.floor(ms / 60000), h = Math.floor(min / 60), j = Math.floor(h / 24);
  if (j >= 1) return `${j} j ${h % 24} h`;
  if (h >= 1) return `${h} h ${min % 60} min`;
  return `${Math.max(min, 1)} min`;
}

// (A) Journal : on garde chaque message dans la fiche de la conversation.
function _logMsg(conv, from, name, content, opts = {}) {
  if (!conv) return;
  if (!Array.isArray(conv.messages)) conv.messages = [];
  conv.messages.push({ from, name: (name || '—').slice(0, 80), content: (content || '').slice(0, 2000), files: opts.files || 0, at: Date.now() });
  if (conv.messages.length > 300) conv.messages = conv.messages.slice(-300);
}

// Correction orthographique d'un message (silencieux si pas de clé ; renvoie l'original en cas d'échec).
async function _corriger(texte) {
  const t = (texte || '').trim();
  if (!ANTHROPIC_API_KEY || t.length < 2) return texte;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: "Corrige uniquement l'orthographe, la grammaire, les accents et la ponctuation du texte ci-dessous, en français. Ne change NI le sens, NI le style, NI le vocabulaire, NI la mise en forme. N'ajoute aucun commentaire ni guillemet. Réponds UNIQUEMENT par le texte corrigé.\n\nTexte :\n" + t }] }),
    });
    const data = await res.json();
    const out = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    return out || texte;
  } catch (e) { return texte; }
}

// (B bonus) Résumé IA de l'échange (silencieux s'il n'y a pas de clé).
async function _resumeIA(conv) {
  if (!ANTHROPIC_API_KEY) return null;
  const msgs = (conv.messages || []).filter(m => m.from === 'client' || m.from === 'equipe');
  if (!msgs.length) return null;
  const transcript = msgs.map(m => `${m.from === 'client' ? 'CLIENT' : 'IWC'} (${m.name}) : ${m.content}`).join('\n').slice(0, 6000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 300, messages: [{ role: 'user', content: `Voici un échange de télégrammes (RP western, Iron Wolf Company) entre un CLIENT et l'équipe IWC. Résume en 3-4 phrases : la demande du client, ce qui a été convenu, et la suite à donner. Texte simple, sans markdown.\n\n${transcript}` }] }),
    });
    const data = await res.json();
    const txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n').trim();
    return txt || null;
  } catch (e) { console.log('❌ telegramme resumeIA:', e.message); return null; }
}

// (D) Archive Notion (silencieux si NOTION_TELEGRAMMES_DB non défini).
async function _archiverConversationNotion(conv, resume) {
  if (!NOTION_TOKEN || !NOTION_TELEGRAMMES_DB) return;
  try {
    const transcript = (conv.messages || []).map(m => {
      const who = m.from === 'client' ? `CLIENT (${m.name})` : m.from === 'note' ? `NOTE (${m.name})` : `IWC (${m.name})`;
      return `${who} : ${m.content}`;
    }).join('\n').slice(0, 1800);
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { database_id: NOTION_TELEGRAMMES_DB },
        properties: {
          'Client': { title: [{ text: { content: (conv.nomRP || 'Client').slice(0, 200) } }] },
          'Réf': { rich_text: [{ text: { content: conv.rdvId || '—' } }] },
          'Résumé': { rich_text: [{ text: { content: (resume || '—').slice(0, 2000) } }] },
          'Messages': { number: (conv.messages || []).length },
          'Clôturé': { date: { start: new Date().toISOString().split('T')[0] } },
        },
        children: transcript ? [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: transcript } }] } }] : [],
      }),
    });
  } catch (e) { console.log('❌ telegramme Notion:', e.message); }
}

// (B + C + E) Récap de clôture : posté dans le fil ET le registre, archivé Notion, avec lien.
async function _cloturerAvecRecap(interaction, conv, thread) {
  try {
    const msgs = Array.isArray(conv.messages) ? conv.messages : [];
    const nbClient = msgs.filter(m => m.from === 'client').length;
    const nbEquipe = msgs.filter(m => m.from === 'equipe').length;
    const nbNotes = msgs.filter(m => m.from === 'note').length;
    const ouvertLe = conv.createdAt ? new Date(conv.createdAt) : null;
    const clotLe = new Date();
    const lien = (interaction.guild?.id && conv.threadId) ? `https://discord.com/channels/${interaction.guild.id}/${conv.threadId}` : null;

    const resume = msgs.length ? await _resumeIA(conv) : null;

    const repondants = [...new Set(msgs.filter(m => m.from === 'equipe').map(m => m.name).filter(Boolean))];
    const premier = msgs.find(m => m.from === 'client');

    const recap = new EmbedBuilder().setColor(COL.sepia)
      .setTitle(`📜 Récapitulatif — Télégramme ${conv.rdvId}`)
      .addFields(
        { name: '👤 Client', value: `<@${conv.demandeurId}> (${conv.nomRP || 'Client'})`, inline: true },
        { name: '🔖 Réf.', value: `${conv.rdvId}`, inline: true },
        { name: '💬 Messages', value: `${nbClient} client · ${nbEquipe} équipe${nbNotes ? ` · ${nbNotes} note(s)` : ''}`, inline: true },
        { name: '📅 Ouvert', value: ouvertLe ? _dateHeure(ouvertLe) : '—', inline: true },
        { name: '📪 Clôturé', value: _dateHeure(clotLe), inline: true },
        { name: '⏱️ Durée', value: ouvertLe ? _dureeHumaine(clotLe - ouvertLe) : '—', inline: true },
        { name: '✍️ Ont répondu', value: (repondants.join(', ') || '—').slice(0, 1024), inline: false },
      )
      .setFooter({ text: `Clôturé par ${interaction.user.username} • IWC — Confidentiel` }).setTimestamp();
    if (premier) recap.addFields({ name: '📩 Demande initiale', value: String(premier.content || '—').slice(0, 1024) });
    if (resume) recap.addFields({ name: '🧠 Résumé', value: resume.slice(0, 1024) });
    if (lien) recap.addFields({ name: '🔗 Conversation', value: `[Ouvrir le fil](${lien})` });

    // Transcription intégrale (.txt) — trace de TOUT
    let transcriptTxt = '';
    try {
      const lignes = msgs.map(m => {
        const who = m.from === 'client' ? `CLIENT (${m.name})` : m.from === 'note' ? `NOTE INTERNE (${m.name})` : `IWC (${m.name})`;
        const t = m.at ? new Date(m.at).toLocaleString('fr-FR') : '';
        return `[${t}] ${who} :\n${m.content || ''}${m.files ? `\n  (${m.files} pièce(s) jointe(s))` : ''}`;
      });
      const entete = `TÉLÉGRAMME ${conv.rdvId} — ${conv.nomRP || 'Client'}\nOuvert : ${ouvertLe ? _dateHeure(ouvertLe) : '—'} · Clôturé : ${_dateHeure(clotLe)} · Clôturé par : ${interaction.user.username}\n${'='.repeat(50)}\n\n`;
      transcriptTxt = entete + (lignes.join('\n\n') || 'Aucun message enregistré.');
    } catch {}
    const mkFile = () => transcriptTxt ? [new AttachmentBuilder(Buffer.from(transcriptTxt, 'utf8'), { name: `telegramme-${conv.rdvId}.txt` })] : [];

    if (thread) await thread.send({ embeds: [recap], files: mkFile() }).catch(() => {});
    const db = loadDB();
    if (db.registreTelegrammesId) {
      const reg = await interaction.client.channels.fetch(db.registreTelegrammesId).catch(() => null);
      if (reg) await reg.send({ embeds: [recap], files: mkFile() }).catch(() => {});
    }
    await _archiverConversationNotion(conv, resume).catch(() => {});
  } catch (e) { console.log('❌ telegramme cloturerAvecRecap:', e.message); }
}

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

    const tname = `💬 ${(nomRP || 'Client').slice(0, 60)} — ${rdvId}`;
    let thread = await message.channel.threads.create({
      name: tname,
      autoArchiveDuration: 10080,
      type: ChannelType.PrivateThread,
      invitable: false,
    }).catch(() => null);
    if (!thread) thread = await message.startThread({ name: tname, autoArchiveDuration: 10080 }).catch(() => null); // repli fil public si privé indisponible
    if (!thread) return null;
    // Option B : ajouter automatiquement l'équipe au fil privé (Opérateur / Homme de main / Fondateur)
    if (thread.type === ChannelType.PrivateThread) {
      try {
        const g = message.guild;
        const cible = r => { const n = (r.name || '').toLowerCase(); return n.includes('opérateur') || n.includes('operateur') || n.includes('homme de main') || n.includes('fondateur'); };
        const ids = new Set();
        for (const role of g.roles.cache.filter(cible).values()) { for (const mem of role.members.values()) ids.add(mem.id); }
        let n = 0;
        for (const uid of ids) { if (n >= 40) break; await thread.members.add(uid).catch(() => {}); n++; }
      } catch {}
    }

    store[rdvId] = {
      rdvId, demandeurId, nomRP: nomRP || 'Client',
      threadId: thread.id, parentChannelId: message.channel.id, msgId: message.id,
      status: 'ouvert', createdAt: Date.now(),
    };
    const initial = (message.embeds?.[0]?.description || (message.embeds?.[0]?.fields || []).map(f => `${f.name}: ${f.value}`).join(' · ') || message.content || '').replace(/\s+/g, ' ').trim();
    if (initial) _logMsg(store[rdvId], 'client', nomRP || 'Client', initial.slice(0, 1000));
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
    const pingNew = _pingRoles(thread.guild);
    await thread.send({ content: pingNew.content ? `${pingNew.content} — 📨 **nouveau télégramme reçu**` : null, embeds: [intro], components: [row], allowedMentions: { roles: pingNew.ids } }).catch(() => {});

    // Prévenir le client qu'il peut répondre en MP
    const user = await message.client.users.fetch(demandeurId).catch(() => null);
    if (user) {
      const sent = await user.send({ embeds: [_embedMP('✉ TÉLÉGRAMME — IRON WOLF COMPANY', [
        'Votre télégramme a bien été reçu par **Iron Wolf Company**.', '',
        'Vous pouvez **répondre directement à ce message** pour échanger avec nous.',
      ], rdvId)] }).catch(() => null);
      if (!sent) await thread.send('⚠️ Le client a ses **MP fermés** : il ne pourra peut-être pas recevoir vos réponses ni vous répondre en MP.').catch(() => {});
    }

    // Trace dans le journal de bord (demande client)
    try {
      if (typeof global.ajouterJournalIC === 'function' && thread.guild) {
        const apercuRaw = (message.embeds?.[0]?.description || (message.embeds?.[0]?.fields || []).map(f => f.value).join(' · ') || message.content || '').replace(/\s+/g, ' ').trim();
        const apercu = apercuRaw ? apercuRaw.slice(0, 300) : '';
        await global.ajouterJournalIC(thread.guild, {
          type: 'autre', emoji: '📨',
          titre: `Nouveau télégramme — ${nomRP || 'Client'}`,
          description: `Demande reçue de <@${demandeurId}>.${apercu ? `\n\n*${apercu}*` : ''}\n\n💬 Suivi dans le fil : <#${thread.id}>`,
          auteur: nomRP || 'Client',
        });
      }
    } catch {}

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
      _logMsg(conv, 'client', conv.nomRP || message.author.username, message.content || '', { files: files.length });
      persist(db);
      await message.react('📨').catch(() => {});
      return true;
    }

    // (2) Message de l'équipe dans un fil de conversation → MP au client
    const conv = Object.values(store).find(c => c.threadId === message.channel.id);
    if (!conv) return false;
    if (conv.status !== 'ouvert') return false; // fil clôturé : on ne relaie plus
    const content = message.content || '';
    if (!content && message.attachments.size === 0) return false;
    if (/^\s*(\/\/|\(\()/.test(content)) { _logMsg(conv, 'note', message.member?.displayName || message.author.username, content.replace(/^\s*(\/\/|\(\()\s*/, '')); persist(db); await message.react('📝').catch(() => {}); return true; } // note interne

    const user = await message.client.users.fetch(conv.demandeurId).catch(() => null);
    if (!user) { await message.react('⚠️').catch(() => {}); return true; }
    const files = [...message.attachments.values()].map(a => a.url);
    // Correction orthographique du message envoyé au client (⏳ pendant le traitement)
    let contentCorr = content;
    if (content) {
      await message.react('⏳').catch(() => {});
      contentCorr = await _corriger(content);
      const hg = message.reactions?.cache?.find(r => r.emoji?.name === '⏳');
      if (hg) await hg.users.remove(message.client.user.id).catch(() => {});
    }
    const sent = await user.send({
      content: files.length ? files.join('\n') : null,
      embeds: [_embedMP('✉ TÉLÉGRAMME — IRON WOLF COMPANY', [contentCorr.slice(0, 3500) || '*(pièce jointe)*', '', '*Répondez à ce message pour continuer.*'], conv.rdvId)],
    }).catch(() => null);
    if (sent) { _logMsg(conv, 'equipe', message.member?.displayName || message.author.username, contentCorr, { files: files.length }); persist(db); }
    await message.react(sent ? '✅' : '⚠️').catch(() => {});
    return true;
  } catch (e) { console.log('❌ telegramme onMessage:', e.message); return false; }
}

// ═══════════════════════════════════════════════════════════════
//  BOUTONS : Clôturer / Rouvrir
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    // Commande : définir CE salon comme registre des télégrammes clôturés
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'registre-telegrammes-installer') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à l\'équipe.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const dbR = loadDB(); dbR.registreTelegrammesId = interaction.channel.id; persist(dbR);
      await interaction.reply({ content: '✅ Ce salon est désormais le **📜 Registre des télégrammes**. Chaque conversation clôturée y sera archivée (récap + résumé + lien vers le fil).', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (!interaction.isButton?.()) return false;
    const isClose = interaction.customId?.startsWith('tg_close::');
    const isReopen = interaction.customId?.startsWith('tg_reopen::');
    const isPurge = interaction.customId?.startsWith('tg_purge::');
    if (!isClose && !isReopen && !isPurge) return false;

    if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à l\'équipe.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const rdvId = interaction.customId.split('::')[1];
    const db = loadDB(); const store = _store(db);
    const conv = store[rdvId];
    if (!conv) { await interaction.reply({ content: '⚠️ Conversation introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

    // ─── CLASSER : retirer la conversation du salon (le récap reste archivé dans le registre) ───
    if (isPurge) {
      await interaction.deferUpdate?.().catch(() => {});
      const thread0 = await interaction.client.channels.fetch(conv.threadId).catch(() => null);
      if (!db.registreTelegrammesId && !NOTION_TELEGRAMMES_DB) {
        if (thread0) await thread0.setArchived(true).catch(() => {});
        await interaction.followUp?.({ content: '⚠️ Aucun **registre** n\'est configuré : je ne supprime pas (pour ne pas perdre la trace de l\'échange). Installe un registre avec `/registre-telegrammes-installer`, puis réessaie. En attendant, la conversation est archivée.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      if (conv.status !== 'cloture' && conv.status !== 'classe') { try { await _cloturerAvecRecap(interaction, conv, thread0); } catch {} } // on archive le récap avant de supprimer
      if (thread0) await thread0.delete().catch(() => {});
      try {
        const parent = await interaction.client.channels.fetch(conv.parentChannelId).catch(() => null);
        if (parent && conv.msgId) { const pm = await parent.messages.fetch(conv.msgId).catch(() => null); if (pm) await pm.delete().catch(() => {}); }
      } catch {}
      conv.status = 'classe'; conv.classedAt = Date.now(); persist(db);
      return true;
    }

    conv.status = isReopen ? 'ouvert' : 'cloture';
    conv[isReopen ? 'reopenedAt' : 'closedAt'] = Date.now();
    persist(db);

    // (1) FEEDBACK IMMÉDIAT : on met à jour les boutons tout de suite
    const closeBtn = new ButtonBuilder().setCustomId(`tg_close::${rdvId}`).setLabel('🔒 Clôturer la conversation').setStyle(ButtonStyle.Danger);
    const reopenBtn = new ButtonBuilder().setCustomId(`tg_reopen::${rdvId}`).setLabel('♻️ Rouvrir').setStyle(ButtonStyle.Secondary);
    const purgeBtn = new ButtonBuilder().setCustomId(`tg_purge::${rdvId}`).setLabel('🗑️ Classer (retirer du salon)').setStyle(ButtonStyle.Secondary);
    const newRow = new ActionRowBuilder().addComponents(...(isReopen ? [closeBtn] : [reopenBtn, purgeBtn]));
    await interaction.update({ components: [newRow] }).catch(() => { interaction.deferUpdate?.().catch(() => {}); });

    // (2) Confirmation visible immédiate dans le fil
    const thread = await interaction.client.channels.fetch(conv.threadId).catch(() => null);
    if (thread) await thread.send(isReopen ? `♻️ **Conversation rouverte** par <@${interaction.user.id}>.` : `🔒 **Conversation clôturée** par <@${interaction.user.id}>.`).catch(() => {});

    // (3) Prévenir le client (en arrière-plan, sans bloquer le feedback)
    interaction.client.users.fetch(conv.demandeurId).then(u => {
      if (!u) return;
      const e = isReopen
        ? _embedMP('✉ CONVERSATION ROUVERTE', ['Iron Wolf Company a rouvert votre échange.', '', 'Vous pouvez de nouveau **répondre à ce message**.'], rdvId)
        : _embedMP('📪 CONVERSATION CLÔTURÉE', ['Votre échange avec Iron Wolf Company est terminé. Merci !', '', 'Pour une nouvelle demande, repassez par le bouton **✉ Envoyer un télégramme**.'], rdvId);
      u.send({ embeds: [e] }).catch(() => {});
    }).catch(() => {});

    // (4) Récap + archive (en arrière-plan : ne bloque plus l'affichage)
    if (isClose) {
      (async () => {
        try { await _cloturerAvecRecap(interaction, conv, thread); } catch {}
        if (thread) await thread.setArchived(true).catch(() => {});
      })();
    } else if (thread) {
      await thread.setArchived(false).catch(() => {});
    }
    return true;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ telegramme routeInteraction:', e.message);
    return true;
  }
}

const telegrammeCommands = [
  new SlashCommandBuilder().setName('registre-telegrammes-installer').setDescription('📜 Faire de CE salon le registre des télégrammes clôturés (équipe)'),
];

module.exports = { ouvrirConversation, onMessage, routeInteraction, telegrammeCommands };
