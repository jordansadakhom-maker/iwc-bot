// ───────────────────────────────────────────────────────────────────────────
//  nettoyeur.js — « Le Nettoyeur » : garde le Discord propre en supprimant le
//  BRUIT du bot (confirmations, notifications périmées) après un court délai.
//  ----------------------------------------------------------------------------
//  Règles de sécurité (pour ne RIEN dérégler) — il ne supprime QUE si TOUT est vrai :
//    • message écrit par le BOT lui-même (jamais un membre, jamais un webhook RP)
//    • PAS d'embed  → un embed = contenu utile (ordre, fiche, tableau, poster…)
//    • PAS de bouton/menu → un composant = panneau interactif
//    • PAS épinglé, PAS de pièce jointe
//    • texte court commençant par un emoji de statut / une formule de confirmation
//    • plus vieux que le délai (par défaut 10 min) → on laisse le temps de lire
//  Ne touche JAMAIS aux salons protégés (RP, coffres, registres, journaux…).
//  Piloté par la Direction via « !nettoyage ». Additif : préfixe net_, écrit
//  uniquement db.nettoyeur — aucune autre donnée touchée.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelSelectMenuBuilder, ChannelType, MessageFlags, PermissionFlagsBits } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const DIRECTION = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estGestion(member) { try { return !!member?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n))); } catch { return false; } }

// Salons NON nettoyés par défaut : RP / écriture / registres / journaux / archives.
// (Les embeds y sont déjà protégés, mais on double la sécurité.)
const PROTEGES_DEFAUT = [
  '1509244143199715499', // #discussion-rp (reformulation)
  '1508756459444502661', // #histoire-iwc
  '1508756528277225512', // #fiches-personnages
  '1508915628315115581', // #surnom-pseudo
  '1509718164760563743', // #absences
  '1508756453354373202', // #coffre-entreprise
  '1508756490432024636', // #coffre-illegal
  '1509255294184853524', // #informateurs
  '1508756493845925960', // #plans
  '1508756442730074222', // #contrats
  '1508756486892027904', // #operations
  '1508756535407542372', // #journal-de-bord
  '1509695000441786608', // #logs / #patch-note
  '1518042088879423640', // #dashboard
  '1509638226132996178', // #agenda
  '1509719218654941315', // #planning
  '1508756508362674337', // #affaires
  '1521258635416834214', // #pépites
  '1518385544860667945', // #-contact (carnet)
];

// Emoji de statut en tête d'un message = confirmation jetable.
const NOISE_RE = /^\s*(?:✅|✔️|☑️|❌|❎|⏳|⌛|♻️|🔁|🔒|🔓|🧹|🗑️|👍|👌|🆗|➖|✨|🙏|💾|📎|📌|🔧|⚠️|🕹️|🎰)/u;
// Formules de confirmation connues (sans emoji).
const PHRASES_RE = /^(?:c'est fait|bien reçu|enregistr[ée]|mise à jour|termin[ée]|op[ée]ration effectu[ée]e|table ferm[ée]e|salon nettoy[ée]|d[ée]j[àa] propre|fait\s*!?$)/i;
// Commandes texte d'administration d'un MEMBRE : on les efface après traitement pour garder le salon net.
// (Liste fermée : on ne touche jamais à un message qui commence par « ! » sans être une de ces commandes.)
const CMD_RE = /^!(?:nettoyage|moderation|reset-registre|restaurer[ -]\w+|recuperer[ -]\w+)\b/i;

// Vrai si le message est du « bruit du bot » sans intérêt (voir en-tête).
function _estBruitBot(msg, botId) {
  try {
    if (!msg || !botId || msg.author?.id !== botId) return false; // seulement le bot lui-même
    if (msg.webhookId) return false;                              // reposts RP via webhook → jamais
    if (msg.pinned) return false;                                 // épinglé (panneau/info) → jamais
    if (msg.embeds && msg.embeds.length) return false;            // embed = contenu utile → jamais
    if (msg.components && msg.components.length) return false;     // boutons/menus = panneau → jamais
    if (msg.attachments && msg.attachments.size) return false;    // pièce jointe → jamais
    const c = (msg.content || '').trim();
    if (!c) return true;                                          // message vidé → bruit
    if (c.length > 350) return false;                             // texte long = probablement utile
    return NOISE_RE.test(c) || PHRASES_RE.test(c);
  } catch { return false; }
}

function _ensure(db) {
  if (!db.nettoyeur || typeof db.nettoyeur !== 'object') db.nettoyeur = {};
  const n = db.nettoyeur;
  if (typeof n.actif !== 'boolean') n.actif = true;
  if (!Number.isFinite(n.ttlMin)) n.ttlMin = 10;
  if (!Array.isArray(n.salons)) n.salons = [];               // whitelist optionnelle (vide = partout sauf protégés)
  if (!Array.isArray(n.proteges) || !n.proteges.length) n.proteges = [...PROTEGES_DEFAUT];
  return n;
}

// ── État runtime ──
let _client = null;
const _watch = new Set(); // salons où le bot a récemment posté du bruit (backstop du sweep)

// Appelé pour CHAQUE message (dont ceux du bot). Ne consomme rien : planifie une
// suppression différée du bruit, dans les salons non protégés.
function onMessage(message) {
  try {
    if (!_client) _client = message.client;
    const botId = message.client?.user?.id;
    if (!botId) return;
    const db = loadDB(); const n = _ensure(db);
    if (!n.actif) return;
    const chId = message.channelId;
    if (n.proteges.includes(chId)) return;
    if (n.salons.length && !n.salons.includes(chId)) return;

    // 1) Commande d'admin d'un MEMBRE (« !nettoyage », « !reset-registre »…) → effacée après un court délai.
    if (message.author?.id !== botId && !message.webhookId && CMD_RE.test((message.content || '').trim())) {
      _watch.add(chId);
      setTimeout(() => { message.delete().catch(() => {}); }, 30 * 1000);
      return;
    }
    // 2) Bruit du bot → suppression différée (on laisse le temps de lire la confirmation).
    if (message.author?.id !== botId) return;
    if (!_estBruitBot(message, botId)) return;
    _watch.add(chId);
    const ttl = Math.max(1, n.ttlMin) * 60 * 1000;
    setTimeout(() => { message.delete().catch(() => {}); }, ttl);
  } catch {}
}

// Balayage périodique (rattrape ce que les minuteries ont manqué, ex. après un redémarrage).
async function _sweep() {
  try {
    if (!_client) return;
    const db = loadDB(); const n = _ensure(db);
    if (!n.actif) return;
    const botId = _client.user?.id;
    const ttl = Math.max(1, n.ttlMin) * 60 * 1000;
    const now = Date.now();
    const cibles = new Set([..._watch, ...n.salons]);
    for (const chId of cibles) {
      if (n.proteges.includes(chId)) continue;
      const ch = _client.channels.cache.get(chId);
      if (!ch?.messages?.fetch || !ch.isTextBased?.()) continue;
      const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
      if (!msgs) continue;
      for (const m of msgs.values()) {
        if (now - m.createdTimestamp < ttl) continue;
        if (_estBruitBot(m, botId)) await m.delete().catch(() => {});
      }
    }
  } catch {}
}

// Grand ménage : balaie TOUS les salons texte (sauf protégés) et retire le bruit
// du bot. Lancé chaque jour + par le bouton « Nettoyer maintenant ». Ignore les
// messages de moins de 2 min (pour ne pas effacer une confirmation en cours).
async function grandMenage(guild) {
  let nb = 0;
  try {
    if (!guild?.channels?.cache) return 0;
    const db = loadDB(); const n = _ensure(db);
    if (!n.actif) return 0;
    const botId = guild.client.user?.id;
    const now = Date.now();
    const me = guild.members.me;
    const chans = guild.channels.cache.filter(c =>
      c && c.type === ChannelType.GuildText &&
      !n.proteges.includes(c.id) &&
      (!n.salons.length || n.salons.includes(c.id)));
    for (const ch of chans.values()) {
      try {
        if (!ch.messages?.fetch) continue;
        const perms = me ? ch.permissionsFor(me) : null;
        if (perms && !perms.has(PermissionFlagsBits.ManageMessages)) continue; // pas le droit d'effacer ici
        const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
        if (!msgs) continue;
        for (const m of msgs.values()) {
          if (now - m.createdTimestamp < 2 * 60 * 1000) continue; // trop récent → on laisse
          if (_estBruitBot(m, botId)) { await m.delete().catch(() => {}); nb++; }
        }
      } catch {}
    }
  } catch {}
  return nb;
}

// Nettoyage IMMÉDIAT (bouton « Nettoyer maintenant »), sans attendre le délai.
async function sweepNow(guild, extraChId) {
  let nb = 0;
  try {
    const db = loadDB(); const n = _ensure(db);
    const botId = guild.client.user?.id;
    const cibles = new Set([..._watch, ...n.salons]);
    if (extraChId) cibles.add(extraChId);
    for (const chId of cibles) {
      if (n.proteges.includes(chId)) continue;
      const ch = guild.channels.cache.get(chId);
      if (!ch?.messages?.fetch) continue;
      const msgs = await ch.messages.fetch({ limit: 40 }).catch(() => null);
      if (!msgs) continue;
      for (const m of msgs.values()) { if (_estBruitBot(m, botId)) { await m.delete().catch(() => {}); nb++; } }
    }
  } catch {}
  return nb;
}

// ── Panneau de configuration (Direction) ──
function _panelEmbed(n) {
  const wl = n.salons.length ? n.salons.map(id => `<#${id}>`).join(' ') : '_tous les salons **sauf** les protégés_';
  const prot = n.proteges.length ? n.proteges.map(id => `<#${id}>`).join(' ') : '_aucun_';
  return new EmbedBuilder().setColor(0x27AE60).setTitle('🧹 LE NETTOYEUR — configuration')
    .setDescription('Supprime **seulement le bruit du bot** (confirmations, notifications périmées) après un court délai.\n' +
      'Ne touche **jamais** aux messages des membres, aux embeds/panneaux, aux messages épinglés, ni aux salons protégés.')
    .addFields(
      { name: 'État', value: n.actif ? '🟢 Activé' : '🔴 En pause', inline: true },
      { name: 'Délai avant suppression', value: `${n.ttlMin} min`, inline: true },
      { name: '​', value: '​', inline: true },
      { name: '🎯 Salons nettoyés', value: (wl || '—').slice(0, 1024), inline: false },
      { name: '🛡️ Salons protégés (jamais touchés)', value: (prot || '—').slice(0, 1024), inline: false },
    ).setFooter({ text: 'Direction • le Nettoyeur ne retire que des messages du bot sans intérêt' });
}
function _panelRows(n) {
  const rowBtns = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('net_toggle').setLabel(n.actif ? 'Mettre en pause' : 'Activer').setEmoji(n.actif ? '⏸️' : '▶️').setStyle(n.actif ? ButtonStyle.Secondary : ButtonStyle.Success),
    new ButtonBuilder().setCustomId('net_ttl').setLabel('Délai : ' + n.ttlMin + ' min').setEmoji('⏱️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('net_now').setLabel('Nettoyer maintenant').setEmoji('🧹').setStyle(ButtonStyle.Primary),
  );
  const rowSalons = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('net_salons').setPlaceholder('🎯 Limiter à ces salons (laisser vide = partout)').addChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(25),
  );
  const rowProt = new ActionRowBuilder().addComponents(
    new ChannelSelectMenuBuilder().setCustomId('net_proteges').setPlaceholder('🛡️ Salons à PROTÉGER (RP, coffres…)').addChannelTypes(ChannelType.GuildText).setMinValues(0).setMaxValues(25),
  );
  return [rowBtns, rowSalons, rowProt];
}

// Commande texte « !nettoyage » (comme !reset-registre). Renvoie true si consommée.
async function commande(message) {
  try {
    if (!message?.guild || message.author?.bot) return false;
    if (!/^!nettoyage\b/i.test((message.content || '').trim())) return false;
    if (!estGestion(message.member)) { await message.reply({ content: '❌ Réservé à la Direction.', allowedMentions: { parse: [] } }).catch(() => {}); return true; }
    const db = loadDB(); const n = _ensure(db);
    await message.reply({ embeds: [_panelEmbed(n)], components: _panelRows(n), allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } catch { return false; }
}

async function _maj(interaction, n) {
  try { await interaction.update({ embeds: [_panelEmbed(n)], components: _panelRows(n) }); }
  catch { try { await interaction.deferUpdate(); } catch {} }
}

async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith('net_')) return false;
    if (!estGestion(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const db = loadDB(); const n = _ensure(db);

    if (id === 'net_toggle') { n.actif = !n.actif; persist(db); await _maj(interaction, n); return true; }
    if (id === 'net_ttl') { n.ttlMin = n.ttlMin >= 30 ? 5 : (n.ttlMin >= 10 ? 30 : 10); persist(db); await _maj(interaction, n); return true; }
    if (id === 'net_now') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const nb = await grandMenage(interaction.guild);
      await interaction.editReply({ content: `🧹 Grand ménage effectué : **${nb}** message(s) du bot retiré(s) dans les salons non protégés.` }).catch(() => {});
      return true;
    }
    if (id === 'net_salons' && interaction.isChannelSelectMenu?.()) { n.salons = (interaction.values || []).slice(0, 25); persist(db); await _maj(interaction, n); return true; }
    if (id === 'net_proteges' && interaction.isChannelSelectMenu?.()) { n.proteges = (interaction.values || []).slice(0, 25); persist(db); await _maj(interaction, n); return true; }
    return true;
  } catch (e) { console.log('⚠️ nettoyeur route:', e.message); return true; }
}

// Démarre le balayage périodique + le grand ménage quotidien.
function demarrer(client) {
  _client = client;
  try { setInterval(() => { _sweep().catch(() => {}); }, 5 * 60 * 1000); } catch {}          // rattrapage léger toutes les 5 min
  try { setInterval(() => { grandMenage(client.guilds.cache.first()).catch(() => {}); }, 12 * 60 * 60 * 1000); } catch {} // grand ménage 2×/jour
  console.log('🧹 Nettoyeur démarré (bruit du bot + commandes admin, hors salons protégés)');
}

module.exports = {
  onMessage, routeInteraction, commande, demarrer, sweepNow, grandMenage,
  _test: { _estBruitBot, _ensure, PROTEGES_DEFAUT, CMD_RE },
};
