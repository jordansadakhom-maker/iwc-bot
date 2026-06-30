// ═══════════════════════════════════════════════════════════════
//  musique.js — Jukebox vocal : radios d'ambiance + file YouTube
//  - Stations radio (southern rock, country, cowboy roots…)
//  - Liens / recherches YouTube avec file d'attente (via yt-dlp)
//
//  Audio : yt-dlp / flux radio → ffmpeg (ffmpeg-static, décodage → PCM)
//          → @discordjs/opus (encodage). Aucune dépendance système hormis
//          yt-dlp (ajouté dans l'image Docker).
//  ⚠️ La voix Discord nécessite l'UDP sortant → fonctionne sur Fly.io,
//     pas sur Render.
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, ChannelType } = require('discord.js');
const { spawn } = require('child_process');
let voice = null; try { voice = require('@discordjs/voice'); } catch (e) { console.log('⚠️ @discordjs/voice indisponible:', e.message); }
let FFMPEG = null; try { FFMPEG = require('ffmpeg-static'); } catch {}
try { if (FFMPEG) require('fs').chmodSync(FFMPEG, 0o755); } catch {}
const YTDLP = process.env.YTDLP_PATH || 'yt-dlp';
// Le module n'est ACTIF que sur un hébergement compatible voix (UDP) + yt-dlp.
// On l'active explicitement dans l'image Docker (Fly) via MUSIQUE_ENABLED=1.
// Sur Render (pas d'UDP, pas de yt-dlp), il reste en sommeil : il n'intercepte
// rien, n'affiche pas de panneau et ne génère aucune erreur — laissant la place
// à un éventuel bot musique public.
const MUSIQUE_ENABLED = process.env.MUSIQUE_ENABLED === '1';
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const SALON_MUSIQUE = '1509962606553727158';

// ── Catalogue de stations (flux vérifiés joignables) ──
const STATIONS = [
  { id: 'bootliquor', emoji: '🤠', nom: 'Boot Liquor — Cowboy Roots', desc: 'Americana, country roots, ambiance saloon', url: 'https://ice1.somafm.com/bootliquor-128-mp3' },
  { id: 'southern',   emoji: '🎸', nom: 'Southern Rock', desc: 'Style « Sweet Home Alabama »', url: 'https://streams.radiobob.de/southernrock/mp3-192/mediaplayer' },
  { id: 'skynyrd',    emoji: '🦅', nom: 'The Eagles', desc: 'Country rock classique', url: 'https://nl4.mystreaming.net/er/eagles/icecast.audio' },
  { id: 'creedence',  emoji: '🌊', nom: 'Creedence (CCR)', desc: 'Swamp rock, classiques du Sud', url: 'https://nl4.mystreaming.net/er/creedence/icecast.audio' },
  { id: 'allman',     emoji: '🎵', nom: 'Allman Brothers', desc: 'Southern rock / blues', url: 'https://streaming.exclusive.radio/er/allmanbrothers/icecast.audio' },
  { id: 'cash',       emoji: '🚂', nom: 'Johnny Cash', desc: 'L\'homme en noir, country outlaw', url: 'https://nl4.mystreaming.net/er/johnnycash/icecast.audio' },
  { id: 'country',    emoji: '🌾', nom: 'Country', desc: 'Country généraliste', url: 'https://streams.radiobob.de/country/mp3-192/mediaplayer' },
];
const stationById = id => STATIONS.find(s => s.id === id) || null;

// ── État runtime par serveur (non persisté) ──
// mode: 'radio' | 'queue'
const G = new Map();
function _state(guildId) {
  let s = G.get(guildId);
  if (!s) { s = { connection: null, player: null, proc: null, mode: 'radio', stationId: null, queue: [], current: null, playing: false, lastStart: 0 }; G.set(guildId, s); }
  if (!Array.isArray(s.queue)) s.queue = [];
  return s;
}

function _ens(db) {
  if (!db.musique) db.musique = { stationId: 'bootliquor', volume: 0.5, panelId: null };
  if (typeof db.musique.volume !== 'number') db.musique.volume = 0.5;
  return db.musique;
}

// ═══════════════════════ Audio ═══════════════════════
function _spawnFfmpeg(url, label) {
  const args = [
    '-loglevel', 'warning',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', url,
    '-vn',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    'pipe:1',
  ];
  const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  let octets = 0, vu = false, errBuf = '';
  proc.stdout.on('data', d => { octets += d.length; if (!vu) { vu = true; console.log(`🎵 ffmpeg reçoit de l'audio (${label}) — flux OK`); } });
  proc.stderr.on('data', d => { errBuf += d.toString(); if (errBuf.length > 4000) errBuf = errBuf.slice(-4000); });
  proc.on('error', e => console.log(`⚠️ ffmpeg spawn error (${label}):`, e?.message));
  proc.on('exit', (code, sig) => { if (code && code !== 0) console.log(`⚠️ ffmpeg arrêté (${label}) code=${code} sig=${sig} octets=${octets}\n${errBuf.split('\n').slice(-4).join('\n')}`); });
  return proc;
}

function _killProc(s) { try { if (s.proc) s.proc.kill('SIGKILL'); } catch {} s.proc = null; }

// Résout un lien YouTube (ou une recherche) → { title, url direct }
function _resolveYt(input) {
  return new Promise(resolve => {
    const args = ['--no-playlist', '--default-search', 'ytsearch1', '-f', 'bestaudio/best', '--print', '%(title)s', '--print', 'urls', '--no-warnings', '--', input];
    let out = '', err = '', done = false;
    let p;
    try { p = spawn(YTDLP, args, { stdio: ['ignore', 'pipe', 'pipe'] }); }
    catch (e) { console.log('⚠️ yt-dlp introuvable:', e.message); return resolve(null); }
    const to = setTimeout(() => { if (!done) { done = true; try { p.kill('SIGKILL'); } catch {} console.log('⚠️ yt-dlp timeout'); resolve(null); } }, 30000);
    p.stdout.on('data', d => out += d.toString());
    p.stderr.on('data', d => err += d.toString());
    p.on('error', e => { if (!done) { done = true; clearTimeout(to); console.log('⚠️ yt-dlp error:', e.message); resolve(null); } });
    p.on('close', code => {
      if (done) return; done = true; clearTimeout(to);
      if (code !== 0) { console.log('⚠️ yt-dlp code', code, err.slice(-300)); return resolve(null); }
      const lines = out.trim().split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return resolve(null);
      resolve({ title: lines[0].slice(0, 200), url: lines[lines.length - 1] });
    });
  });
}

function _ensurePlayer(guild) {
  const s = _state(guild.id);
  if (s.player) return s.player;
  const player = voice.createAudioPlayer({ behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play } });
  player.on('error', err => {
    console.log('⚠️ musique player error:', err?.message);
    if (!s.playing) return;
    if (s.mode === 'queue') { s.queue.shift(); setTimeout(() => _playQueue(guild).catch(() => {}), 800); }
    else if (s.stationId) setTimeout(() => _diffuser(guild, s.stationId).catch(() => {}), 1500);
  });
  player.on(voice.AudioPlayerStatus.Playing, () => console.log('🔊 musique : lecture en cours (player Playing)'));
  player.on(voice.AudioPlayerStatus.Idle, () => {
    if (!s.playing) return;
    if (s.mode === 'queue') {
      // Le morceau courant est terminé (ou a échoué) → passe au suivant.
      s.queue.shift();
      if (s.queue.length) { setTimeout(() => _playQueue(guild).catch(() => {}), 500); }
      else { s.current = null; const db = loadDB(); _majPanneau(guild, db).catch(() => {}); }
      return;
    }
    // Radio : le flux a coupé → on relance la même station.
    if (s.stationId) {
      const ecoule = Date.now() - (s.lastStart || 0);
      setTimeout(() => { if (s.playing) _diffuser(guild, s.stationId).catch(() => {}); }, ecoule < 4000 ? 4000 : 800);
    }
  });
  s.player = player;
  return player;
}

async function _playStream(guild, url, label) {
  const s = _state(guild.id);
  if (!s.connection) return false;
  const db = loadDB(); const cfg = _ens(db);
  _killProc(s);
  const proc = _spawnFfmpeg(url, label); s.proc = proc; s.lastStart = Date.now();
  const resource = voice.createAudioResource(proc.stdout, { inputType: voice.StreamType.Raw, inlineVolume: true });
  try { resource.volume?.setVolume(cfg.volume); } catch {}
  const player = _ensurePlayer(guild);
  player.play(resource);
  s.connection.subscribe(player);
  s.playing = true;
  return true;
}

async function _diffuser(guild, stationId) {
  const station = stationById(stationId);
  if (!station) return false;
  const s = _state(guild.id);
  s.mode = 'radio'; s.stationId = stationId; s.current = null;
  const db = loadDB(); const cfg = _ens(db); cfg.stationId = stationId; saveDB(db);
  return _playStream(guild, station.url, station.nom);
}

async function _playQueue(guild) {
  const s = _state(guild.id);
  const item = s.queue[0];
  if (!item) { s.mode = 'radio'; s.current = null; s.playing = false; _killProc(s); try { s.player?.stop(true); } catch {} const db = loadDB(); _majPanneau(guild, db).catch(() => {}); return false; }
  s.mode = 'queue'; s.current = item;
  const ok = await _playStream(guild, item.url, item.title);
  const db = loadDB(); _majPanneau(guild, db).catch(() => {});
  return ok;
}

// Ajoute un lien/recherche à la file et démarre si besoin.
async function _ajouter(guild, voiceChannel, input, requesterId) {
  const s = _state(guild.id);
  const resolved = await _resolveYt(input);
  if (!resolved) return { ok: false, raison: 'introuvable' };
  s.queue.push({ title: resolved.title, url: resolved.url, by: requesterId });
  if (!s.connection && voiceChannel) await _connecter(voiceChannel);
  if (!s.connection) return { ok: false, raison: 'pas_de_vocal' };
  const position = s.queue.length;
  if (s.mode !== 'queue' || !s.playing) { await _playQueue(guild); return { ok: true, title: resolved.title, position: 1, joue: true }; }
  const db = loadDB(); _majPanneau(guild, db).catch(() => {});
  return { ok: true, title: resolved.title, position, joue: false };
}

async function _connecter(voiceChannel) {
  const s = _state(voiceChannel.guild.id);
  if (s.connection && s.connection.joinConfig.channelId === voiceChannel.id && s.connection.state.status !== voice.VoiceConnectionStatus.Destroyed) return s.connection;
  try { if (s.connection) s.connection.destroy(); } catch {}
  const connection = voice.joinVoiceChannel({
    channelId: voiceChannel.id,
    guildId: voiceChannel.guild.id,
    adapterCreator: voiceChannel.guild.voiceAdapterCreator,
    selfDeaf: true,
  });
  connection.on(voice.VoiceConnectionStatus.Disconnected, async () => {
    try {
      await Promise.race([
        voice.entersState(connection, voice.VoiceConnectionStatus.Signalling, 5000),
        voice.entersState(connection, voice.VoiceConnectionStatus.Connecting, 5000),
      ]);
    } catch { _quitter(voiceChannel.guild.id); }
  });
  s.connection = connection;
  try { await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 20000); console.log(`🎙️ musique : connecté au vocal ${voiceChannel.name}`); }
  catch (e) { console.log('⚠️ voice connect timeout:', e?.message); }
  return connection;
}

function _quitter(guildId) {
  const s = _state(guildId);
  s.playing = false; s.mode = 'radio'; s.queue = []; s.current = null;
  _killProc(s);
  try { s.player?.stop(true); } catch {}
  try { s.connection?.destroy(); } catch {}
  s.connection = null;
}

// ═══════════════════════ Panneau ═══════════════════════
function _statutTexte(guildId) {
  const s = _state(guildId);
  if (!s.connection || !s.playing) return '⏹️ *À l\'arrêt — rejoins un vocal puis ▶️ Lancer, ou colle un lien YouTube.*';
  if (s.mode === 'queue' && s.current) {
    let t = `🎧 **En lecture :** ${s.current.title}`;
    const suite = s.queue.slice(1, 6);
    if (suite.length) t += '\n📜 **À suivre :** ' + suite.map((q, i) => `\n  ${i + 1}. ${q.title}`).join('');
    if (s.queue.length > 6) t += `\n  …et ${s.queue.length - 6} de plus`;
    return t;
  }
  const st = stationById(s.stationId);
  return `📻 **Radio :** ${st ? st.emoji + ' ' + st.nom : 'station'}`;
}

function _panelEmbed(db, guildId) {
  const cfg = _ens(db);
  const e = new EmbedBuilder().setColor(0xB5651D).setTitle('🎶 JUKEBOX DU SALOON — IRON WOLF COMPANY')
    .setDescription([
      '*Deux façons d\'écouter :*',
      '• 📻 **Radios d\'ambiance** — choisis une station dans le menu, puis ▶️ Lancer.',
      '• 🎧 **YouTube** — colle un **lien** (ou tape une **recherche**) ici, ou via le bouton 🔎. Ça se met en file.',
      '',
      _statutTexte(guildId),
    ].join('\n'))
    .addFields(
      { name: '📻 Stations', value: STATIONS.map(st => `${st.emoji} ${st.nom}`).join(' · '), inline: false },
      { name: '🔊 Volume', value: `${Math.round((cfg.volume || 0.5) * 100)} %`, inline: true },
    )
    .setFooter({ text: 'Iron Wolf Company • Saloon de Blackwater' });
  return e;
}

function _panelRows(db) {
  const cfg = _ens(db);
  const menu = new StringSelectMenuBuilder().setCustomId('mus_pick').setPlaceholder('📻 Choisir une station radio…')
    .addOptions(STATIONS.map(st => ({ label: st.nom.slice(0, 100), description: st.desc.slice(0, 100), value: st.id, emoji: st.emoji, default: st.id === cfg.stationId })));
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mus_play').setLabel('Lancer').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('mus_stop').setLabel('Arrêter').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mus_next').setLabel('Passer / Suivant').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mus_voldown').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mus_volup').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mus_add').setLabel('Ajouter un lien YouTube / rechercher').setEmoji('🔎').setStyle(ButtonStyle.Primary),
    ),
  ];
}

async function _majPanneau(guild, db) {
  try {
    const ch = await guild.channels.fetch(SALON_MUSIQUE).catch(() => null);
    if (!ch?.messages) return;
    const me = guild.client.user.id; const cfg = _ens(db);
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('JUKEBOX');
    let panel = null;
    if (cfg.panelId) panel = await ch.messages.fetch(cfg.panelId).catch(() => null);
    if (!panel) { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) panel = [...pins.values()].find(estPanel) || null; }
    if (!panel) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) panel = [...recent.values()].find(estPanel) || null; }
    if (panel) { await panel.edit({ embeds: [_panelEmbed(db, guild.id)], components: _panelRows(db) }).catch(() => {}); if (cfg.panelId !== panel.id) { cfg.panelId = panel.id; saveDB(db); } return; }
    const sent = await ch.send({ embeds: [_panelEmbed(db, guild.id)], components: _panelRows(db) }).catch(() => null);
    if (sent) { await sent.pin().catch(() => {}); cfg.panelId = sent.id; saveDB(db); }
  } catch (e) { console.log('⚠️ musique _majPanneau:', e.message); }
}

async function _retirerPanneau(guild) {
  // Supprime le panneau Jukebox (utilisé quand le module est en sommeil).
  try {
    const ch = await guild.channels.fetch(SALON_MUSIQUE).catch(() => null);
    if (!ch?.messages) return;
    const me = guild.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('JUKEBOX');
    const trouves = [];
    const pins = await ch.messages.fetchPinned().catch(() => null);
    if (pins) trouves.push(...[...pins.values()].filter(estPanel));
    const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    if (recent) trouves.push(...[...recent.values()].filter(estPanel));
    for (const m of trouves) await m.delete().catch(() => {});
    const db = loadDB(); const cfg = _ens(db); if (cfg.panelId) { cfg.panelId = null; saveDB(db); }
  } catch {}
}

async function installerPanneau(guild) {
  if (!MUSIQUE_ENABLED) { await _retirerPanneau(guild); return; } // en sommeil sur cet hébergement
  if (!voice || !FFMPEG) { console.log('⚠️ musique : voice/ffmpeg indisponible, panneau non installé'); return; }
  try { const db = loadDB(); _ens(db); await _majPanneau(guild, db); } catch (e) { console.log('⚠️ musique installerPanneau:', e.message); }
}

function init(client) {
  if (!voice) return;
  try { const sodium = require('libsodium-wrappers'); sodium.ready.then(() => console.log('🔐 musique : libsodium prêt')).catch(() => {}); } catch (e) { console.log('⚠️ musique libsodium:', e.message); }
  try { console.log('🎶 musique — dépendances audio :\n' + voice.generateDependencyReport()); } catch {}
  client.on('voiceStateUpdate', (oldS, newS) => {
    try {
      const guild = newS.guild || oldS.guild; if (!guild) return;
      const s = _state(guild.id);
      if (!s.connection || !s.playing) return;
      const vcId = s.connection.joinConfig.channelId;
      const vc = guild.channels.cache.get(vcId);
      if (!vc) return;
      if (vc.members.filter(m => !m.user.bot).size === 0) { _quitter(guild.id); const db = loadDB(); _majPanneau(guild, db).catch(() => {}); }
    } catch {}
  });
}

// Salon musique : tout message (lien YouTube ou recherche) = ajout à la file.
async function onMessage(message) {
  try {
    if (!MUSIQUE_ENABLED) return false; // en sommeil : on n'intercepte rien (laisse place à un bot public)
    if (!message.guild || message.author?.bot || message.webhookId) return false;
    if (message.channelId !== SALON_MUSIQUE) return false;
    const contenu = (message.content || '').trim();
    if (!contenu || contenu.length > 300) return false;
    if (!voice || !FFMPEG) return false;
    const vc = message.member?.voice?.channel
      || ((message.channel.type === ChannelType.GuildVoice || message.channel.type === ChannelType.GuildStageVoice) ? message.channel : null);
    if (!vc) {
      const avert = await message.reply({ content: '🔇 Rejoins d\'abord un salon vocal pour que je puisse jouer ta musique.' }).catch(() => null);
      if (avert) setTimeout(() => avert.delete().catch(() => {}), 10000);
      return true;
    }
    await message.react('🔎').catch(() => {});
    const res = await _ajouter(message.guild, vc, contenu, message.author.id);
    await message.reactions.cache.get('🔎')?.remove().catch(() => {});
    if (!res.ok) {
      const m = await message.reply({ content: res.raison === 'pas_de_vocal' ? '🔇 Je n\'arrive pas à rejoindre le vocal.' : '❌ Rien trouvé pour ça.' }).catch(() => null);
      if (m) setTimeout(() => m.delete().catch(() => {}), 10000);
      return true;
    }
    await message.react('✅').catch(() => {});
    const conf = await message.reply({ content: res.joue ? `🎧 Lecture : **${res.title}**` : `➕ Ajouté à la file (n°${res.position}) : **${res.title}**` }).catch(() => null);
    if (conf) setTimeout(() => conf.delete().catch(() => {}), 12000);
    const db = loadDB(); await _majPanneau(message.guild, db);
    return true;
  } catch (e) { console.log('❌ musique onMessage:', e.message); return false; }
}

// ═══════════════════════ Interactions ═══════════════════════
async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('mus_')) return false;
    if (!MUSIQUE_ENABLED) { await interaction.reply({ content: 'ℹ️ La musique intégrée au bot n\'est pas disponible sur cet hébergement (voix bloquée). Elle s\'activera une fois le bot sur Fly. En attendant, utilise un bot musique public.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    if (!voice || !FFMPEG) { await interaction.reply({ content: '⚠️ Module audio indisponible sur l\'hébergement actuel.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const guild = interaction.guild; if (!guild) return true;
    const db = loadDB(); const cfg = _ens(db);

    if (interaction.isStringSelectMenu?.() && cid === 'mus_pick') {
      const choix = interaction.values?.[0];
      if (choix) { cfg.stationId = choix; saveDB(db); }
      const s = _state(guild.id);
      if (s.connection && s.playing) await _diffuser(guild, choix).catch(() => {});
      await _majPanneau(guild, db);
      const st = stationById(choix);
      await interaction.reply({ content: (s.connection && s.playing) ? `📻 Station : ${st?.emoji || ''} **${st?.nom || ''}**.` : `📻 Station choisie : ${st?.emoji || ''} **${st?.nom || ''}**. Clique sur ▶️ Lancer.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // Bouton « Ajouter » → fenêtre de saisie
    if (interaction.isButton?.() && cid === 'mus_add') {
      const modal = new ModalBuilder().setCustomId('mus_add_modal').setTitle('🔎 Ajouter une musique');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('q').setLabel('Lien YouTube ou recherche').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('https://youtu.be/… ou « sweet home alabama »')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'mus_add_modal') {
      const q = (interaction.fields.getTextInputValue('q') || '').trim();
      let vc = interaction.member?.voice?.channel || null;
      if (!vc && (interaction.channel?.type === ChannelType.GuildVoice || interaction.channel?.type === ChannelType.GuildStageVoice)) vc = interaction.channel;
      if (!vc) { await interaction.reply({ content: '🔇 Rejoins d\'abord un salon vocal.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const res = await _ajouter(guild, vc, q, interaction.user.id);
      await _majPanneau(guild, db);
      await interaction.editReply({ content: res.ok ? (res.joue ? `🎧 Lecture : **${res.title}**` : `➕ Ajouté (n°${res.position}) : **${res.title}**`) : '❌ Rien trouvé pour ça.' }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && cid === 'mus_play') {
      let vc = interaction.member?.voice?.channel || null;
      if (!vc && (interaction.channel?.type === ChannelType.GuildVoice || interaction.channel?.type === ChannelType.GuildStageVoice)) vc = interaction.channel;
      if (!vc) { await interaction.reply({ content: '🔇 Rejoins d\'abord un salon vocal, puis ▶️ Lancer.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const perms = vc.permissionsFor(guild.members.me);
      if (!perms?.has('Connect') || !perms?.has('Speak')) { await interaction.reply({ content: '🚫 Je n\'ai pas la permission de me connecter / parler dans ce salon vocal.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await _connecter(vc);
      const s = _state(guild.id);
      let ok, quoi;
      if (s.queue.length) { ok = await _playQueue(guild); quoi = s.current?.title ? `🎧 ${s.current.title}` : 'la file'; }
      else { ok = await _diffuser(guild, cfg.stationId || 'bootliquor'); const st = stationById(cfg.stationId || 'bootliquor'); quoi = `📻 ${st?.nom || ''}`; }
      await _majPanneau(guild, db);
      await interaction.editReply({ content: ok ? `🔊 C'est parti dans **${vc.name}** — ${quoi} 🤠` : '⚠️ Impossible de lancer la lecture.' }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && cid === 'mus_stop') {
      _quitter(guild.id);
      await _majPanneau(guild, db);
      await interaction.reply({ content: '⏹️ Musique arrêtée, file vidée, je quitte le vocal.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && cid === 'mus_next') {
      const s = _state(guild.id);
      if (s.mode === 'queue' && s.playing) {
        // Passer au morceau suivant (l'évènement Idle enchaîne).
        try { s.player?.stop(true); } catch {}
        await interaction.reply({ content: s.queue.length > 1 ? '⏭️ Morceau suivant.' : '⏭️ Fin de la file.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      // Radio : station suivante
      const idx = STATIONS.findIndex(x => x.id === (cfg.stationId || 'bootliquor'));
      const next = STATIONS[(idx + 1 + STATIONS.length) % STATIONS.length];
      cfg.stationId = next.id; saveDB(db);
      if (s.connection && s.playing) await _diffuser(guild, next.id).catch(() => {});
      await _majPanneau(guild, db);
      await interaction.reply({ content: `📻 Station : ${next.emoji} **${next.nom}**${s.playing ? '' : ' — clique sur ▶️ Lancer.'}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && (cid === 'mus_volup' || cid === 'mus_voldown')) {
      const pas = cid === 'mus_volup' ? 0.1 : -0.1;
      cfg.volume = Math.min(1, Math.max(0.1, Math.round(((cfg.volume || 0.5) + pas) * 10) / 10));
      saveDB(db);
      const s = _state(guild.id);
      try { s.player?.state?.resource?.volume?.setVolume(cfg.volume); } catch {}
      await _majPanneau(guild, db);
      await interaction.reply({ content: `🔊 Volume : ${Math.round(cfg.volume * 100)} %`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ musique routeInteraction:', e.message); return true; }
}

module.exports = { installerPanneau, routeInteraction, onMessage, init, SALON_MUSIQUE, STATIONS };
