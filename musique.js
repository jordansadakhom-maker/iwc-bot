// ═══════════════════════════════════════════════════════════════
//  musique.js — Jukebox vocal ambiance Far West / Sud profond
//  Diffuse des radios internet (southern rock, country, cowboy roots…)
//  dans un salon vocal. Panneau de contrôle avec boutons + menu.
//
//  Flux = radios en ligne fiables (style « Sweet Home Alabama »,
//  Johnny Cash, Eagles, Creedence, Boot Liquor…). Décodés par ffmpeg
//  (ffmpeg-static) → PCM → Opus (@discordjs/opus). Aucune dépendance
//  système : tout est embarqué.
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, MessageFlags, ChannelType } = require('discord.js');
const { spawn } = require('child_process');
let voice = null; try { voice = require('@discordjs/voice'); } catch (e) { console.log('⚠️ @discordjs/voice indisponible:', e.message); }
let FFMPEG = null; try { FFMPEG = require('ffmpeg-static'); } catch {}
// Render peut livrer le binaire sans le bit exécutable → on le force au chargement.
try { if (FFMPEG) require('fs').chmodSync(FFMPEG, 0o755); } catch {}
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const SALON_MUSIQUE = '1509962606553727158';

// ── Catalogue de stations (flux vérifiés joignables) ──
// Ambiance western / sud des États-Unis : southern rock, country, cowboy roots.
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
// { connection, player, proc, stationId, playing, lastStart }
const G = new Map();
function _state(guildId) { let s = G.get(guildId); if (!s) { s = { connection: null, player: null, proc: null, stationId: null, playing: false, lastStart: 0 }; G.set(guildId, s); } return s; }

function _ens(db) {
  if (!db.musique) db.musique = { stationId: 'bootliquor', volume: 0.5, panelId: null };
  if (typeof db.musique.volume !== 'number') db.musique.volume = 0.5;
  return db.musique;
}

// ═══════════════════════ Audio ═══════════════════════
function _spawnFfmpeg(url, label) {
  // Décode le flux radio (mp3/aac…) → PCM brut 48kHz stéréo pour Discord.
  const args = [
    '-loglevel', 'warning',
    '-reconnect', '1', '-reconnect_streamed', '1', '-reconnect_delay_max', '5',
    '-i', url,
    '-vn',
    '-f', 's16le', '-ar', '48000', '-ac', '2',
    'pipe:1',
  ];
  const proc = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  // Observabilité : on capture les erreurs ffmpeg pour les logs Render.
  let octets = 0, vu = false;
  proc.stdout.on('data', d => { octets += d.length; if (!vu) { vu = true; console.log(`🎵 ffmpeg reçoit de l'audio (${label}) — flux OK`); } });
  let errBuf = '';
  proc.stderr.on('data', d => { errBuf += d.toString(); if (errBuf.length > 4000) errBuf = errBuf.slice(-4000); });
  proc.on('error', e => console.log(`⚠️ ffmpeg spawn error (${label}):`, e?.message));
  proc.on('exit', (code, sig) => {
    if (code && code !== 0) console.log(`⚠️ ffmpeg arrêté (${label}) code=${code} sig=${sig} octets=${octets}\n${errBuf.split('\n').slice(-4).join('\n')}`);
  });
  return proc;
}

function _killProc(s) { try { if (s.proc) { s.proc.kill('SIGKILL'); } } catch {} s.proc = null; }

function _ensurePlayer(guild) {
  const s = _state(guild.id);
  if (s.player) return s.player;
  const player = voice.createAudioPlayer({ behaviors: { noSubscriber: voice.NoSubscriberBehavior.Play } });
  player.on('error', err => {
    console.log('⚠️ musique player error:', err?.message);
    // Tente de relancer la station courante après une petite pause
    if (s.playing && s.stationId) setTimeout(() => _diffuser(guild, s.stationId).catch(() => {}), 1500);
  });
  player.on(voice.AudioPlayerStatus.Playing, () => console.log('🔊 musique : lecture en cours (player Playing)'));
  player.on(voice.AudioPlayerStatus.Idle, () => {
    // Le flux s'est interrompu (coupure radio) → on relance la même station.
    if (s.playing && s.stationId) {
      const ecoule = Date.now() - (s.lastStart || 0);
      const delai = ecoule < 4000 ? 4000 : 800; // évite une boucle de reconnexion trop serrée
      setTimeout(() => { if (s.playing) _diffuser(guild, s.stationId).catch(() => {}); }, delai);
    }
  });
  s.player = player;
  return player;
}

async function _diffuser(guild, stationId) {
  const s = _state(guild.id);
  const station = stationById(stationId);
  if (!station || !s.connection) return false;
  const db = loadDB(); const cfg = _ens(db);
  _killProc(s);
  const proc = _spawnFfmpeg(station.url, station.nom);
  s.proc = proc;
  s.stationId = stationId;
  s.lastStart = Date.now();
  const resource = voice.createAudioResource(proc.stdout, { inputType: voice.StreamType.Raw, inlineVolume: true });
  try { resource.volume?.setVolume(cfg.volume); } catch {}
  const player = _ensurePlayer(guild);
  player.play(resource);
  s.connection.subscribe(player);
  s.playing = true;
  cfg.stationId = stationId; saveDB(db);
  return true;
}

async function _connecter(voiceChannel) {
  const s = _state(voiceChannel.guild.id);
  if (s.connection && s.connection.joinConfig.channelId === voiceChannel.id
      && s.connection.state.status !== voice.VoiceConnectionStatus.Destroyed) return s.connection;
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
      // reconnexion en cours → on laisse faire
    } catch {
      _quitter(voiceChannel.guild.id);
    }
  });
  s.connection = connection;
  try { await voice.entersState(connection, voice.VoiceConnectionStatus.Ready, 20000); console.log(`🎙️ musique : connecté au vocal ${voiceChannel.name}`); }
  catch (e) { console.log('⚠️ voice connect timeout:', e?.message); }
  return connection;
}

function _quitter(guildId) {
  const s = _state(guildId);
  s.playing = false;
  _killProc(s);
  try { s.player?.stop(true); } catch {}
  try { s.connection?.destroy(); } catch {}
  s.connection = null;
}

// ═══════════════════════ Panneau ═══════════════════════
function _statutTexte(guildId) {
  const s = _state(guildId);
  if (s.playing && s.connection) { const st = stationById(s.stationId); return `🔊 **En lecture** — ${st ? st.emoji + ' ' + st.nom : 'station inconnue'}`; }
  return '⏹️ *À l\'arrêt — rejoins un salon vocal puis clique sur ▶️ Lancer.*';
}

function _panelEmbed(db, guildId) {
  const cfg = _ens(db);
  const e = new EmbedBuilder().setColor(0xB5651D).setTitle('🎶 JUKEBOX DU SALOON — IRON WOLF COMPANY')
    .setDescription([
      '*Mets l\'ambiance Far West dans le vocal — southern rock, country, cowboy roots.*',
      '',
      _statutTexte(guildId),
      '',
      '**Comment faire :** rejoins un salon vocal, choisis une station dans le menu, puis ▶️ **Lancer**.',
    ].join('\n'))
    .addFields(
      { name: '📻 Stations disponibles', value: STATIONS.map(st => `${st.emoji} **${st.nom}** — *${st.desc}*`).join('\n'), inline: false },
      { name: '🔊 Volume', value: `${Math.round((cfg.volume || 0.5) * 100)} %`, inline: true },
    )
    .setFooter({ text: 'Iron Wolf Company • Saloon de Blackwater' });
  return e;
}

function _panelRows(db) {
  const cfg = _ens(db);
  const menu = new StringSelectMenuBuilder().setCustomId('mus_pick').setPlaceholder('🎵 Choisir une station…')
    .addOptions(STATIONS.map(st => ({ label: st.nom.slice(0, 100), description: st.desc.slice(0, 100), value: st.id, emoji: st.emoji, default: st.id === cfg.stationId })));
  return [
    new ActionRowBuilder().addComponents(menu),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('mus_play').setLabel('Lancer').setEmoji('▶️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('mus_stop').setLabel('Arrêter').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('mus_next').setLabel('Station suivante').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mus_voldown').setLabel('Vol -').setEmoji('🔉').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('mus_volup').setLabel('Vol +').setEmoji('🔊').setStyle(ButtonStyle.Secondary),
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

async function installerPanneau(guild) {
  if (!voice || !FFMPEG) { console.log('⚠️ musique : voice/ffmpeg indisponible, panneau non installé'); return; }
  try { const db = loadDB(); _ens(db); await _majPanneau(guild, db); } catch (e) { console.log('⚠️ musique installerPanneau:', e.message); }
}

// Quitte automatiquement si plus personne (hors bots) n'écoute dans le vocal.
function init(client) {
  if (!voice) return;
  // Initialise libsodium (asynchrone) AVANT toute lecture : sans ça, le chiffrement
  // des paquets audio peut échouer silencieusement → le bot rejoint mais reste muet.
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
      const humains = vc.members.filter(m => !m.user.bot).size;
      if (humains === 0) {
        _quitter(guild.id);
        const db = loadDB(); _majPanneau(guild, db).catch(() => {});
      }
    } catch {}
  });
}

// ═══════════════════════ Interactions ═══════════════════════
async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('mus_')) return false;
    if (!voice || !FFMPEG) { await interaction.reply({ content: '⚠️ Module audio indisponible sur l\'hébergement actuel.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    const guild = interaction.guild; if (!guild) return true;
    const db = loadDB(); const cfg = _ens(db);

    // Menu : choisir une station
    if (interaction.isStringSelectMenu?.() && cid === 'mus_pick') {
      const choix = interaction.values?.[0];
      if (choix) { cfg.stationId = choix; saveDB(db); }
      const s = _state(guild.id);
      if (s.playing && s.connection) await _diffuser(guild, choix).catch(() => {});
      await _majPanneau(guild, db);
      const st = stationById(choix);
      await interaction.reply({ content: s.playing ? `🎵 Station changée : ${st?.emoji || ''} **${st?.nom || ''}**.` : `🎵 Station sélectionnée : ${st?.emoji || ''} **${st?.nom || ''}**. Clique sur ▶️ Lancer.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && cid === 'mus_play') {
      // Salon vocal cible : celui du membre, sinon le salon-panneau s'il est vocal.
      let vc = interaction.member?.voice?.channel || null;
      if (!vc) {
        const ch = interaction.channel;
        if (ch && (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice)) vc = ch;
      }
      if (!vc) { await interaction.reply({ content: '🔇 Rejoins d\'abord un salon vocal, puis clique sur ▶️ Lancer.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const perms = vc.permissionsFor(guild.members.me);
      if (!perms?.has('Connect') || !perms?.has('Speak')) { await interaction.reply({ content: '🚫 Je n\'ai pas la permission de me connecter / parler dans ce salon vocal.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await _connecter(vc);
      const ok = await _diffuser(guild, cfg.stationId || 'bootliquor');
      await _majPanneau(guild, db);
      const st = stationById(cfg.stationId || 'bootliquor');
      await interaction.editReply({ content: ok ? `🔊 C'est parti dans **${vc.name}** — ${st?.emoji || ''} ${st?.nom || ''} 🤠` : '⚠️ Impossible de lancer la lecture.' }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && cid === 'mus_stop') {
      _quitter(guild.id);
      await _majPanneau(guild, db);
      await interaction.reply({ content: '⏹️ Musique arrêtée, je quitte le vocal.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    if (interaction.isButton?.() && cid === 'mus_next') {
      const idx = STATIONS.findIndex(s => s.id === (cfg.stationId || 'bootliquor'));
      const next = STATIONS[(idx + 1 + STATIONS.length) % STATIONS.length];
      cfg.stationId = next.id; saveDB(db);
      const s = _state(guild.id);
      if (s.playing && s.connection) await _diffuser(guild, next.id).catch(() => {});
      await _majPanneau(guild, db);
      await interaction.reply({ content: `⏭️ Station : ${next.emoji} **${next.nom}**${s.playing ? '' : ' — clique sur ▶️ Lancer.'}`, flags: MessageFlags.Ephemeral }).catch(() => {});
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

module.exports = { installerPanneau, routeInteraction, init, SALON_MUSIQUE, STATIONS };
