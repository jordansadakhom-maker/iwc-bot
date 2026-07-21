// ───────────────────────────────────────────────────────────────────────────
//  voix-terrain.js — /rapport-vocal : le bot rejoint TON canal vocal, enregistre
//  les voix des joueurs, transcrit (OpenAI Whisper) puis poste la transcription
//  dans le salon des transcriptions VIA WEBHOOK — ce qui déclenche le RAPPORT DE
//  TERRAIN immersif par IA (pipeline existant, genererRapportIA).
//
//  100 % isolé & défensif : chargé en try/catch, aucune exécution au require,
//  tout est protégé — si la voix échoue, le reste du bot n'est pas affecté.
//  Nécessite OPENAI_API_KEY (déjà utilisée par le bot pour les images) et la
//  permission « Gérer les webhooks » sur le salon des transcriptions.
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

const CHANNEL_TRANSCRIPTION = '1511491314351472701';
const MAX_MS = 5 * 60 * 1000;        // sécurité : coupe l'enregistrement après 5 min
const MAX_BYTES_PAR_USER = 45 * 1024 * 1024; // ~45 Mo de PCM max par personne

const voixCommands = [
  new SlashCommandBuilder().setName('rapport-vocal').setDescription('🎙️ Enregistre le canal vocal → rapport de terrain (IA)'),
];

// sessions actives : guildId -> { conn, buffers:Map<userId,Buffer[]>, tailles:Map, abonnes:Set, noms:Map, invoker, timer, receiver }
const _sessions = new Map();

function _lazyVoice() { try { return require('@discordjs/voice'); } catch { return null; } }
function _lazyPrism() { try { return require('prism-media'); } catch { return null; } }

// PCM (48 kHz stéréo s16le) -> MP3 mono 16 kHz via ffmpeg (compact & idéal pour Whisper).
function _pcmVersMp3(pcm) {
  return new Promise((resolve) => {
    try {
      const ffmpegPath = require('ffmpeg-static');
      const { spawn } = require('child_process');
      if (!ffmpegPath) return resolve(null);
      const ff = spawn(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-f', 's16le', '-ar', '48000', '-ac', '2', '-i', 'pipe:0', '-ac', '1', '-ar', '16000', '-f', 'mp3', 'pipe:1']);
      const out = [];
      ff.stdout.on('data', d => out.push(d));
      ff.on('error', () => resolve(null));
      ff.on('close', () => { const b = Buffer.concat(out); resolve(b.length > 800 ? b : null); });
      ff.stdin.on('error', () => {});
      ff.stdin.write(pcm); ff.stdin.end();
    } catch { resolve(null); }
  });
}

// Transcription OpenAI Whisper (français). Renvoie le texte, ou '' si échec.
async function _whisper(mp3) {
  const key = process.env.OPENAI_API_KEY;
  if (!key || !mp3) return '';
  try {
    const form = new FormData();
    form.append('file', new Blob([mp3], { type: 'audio/mpeg' }), 'audio.mp3');
    form.append('model', 'whisper-1');
    form.append('language', 'fr');
    form.append('response_format', 'text');
    const r = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form,
    });
    if (!r.ok) { console.log('⚠️ Whisper HTTP', r.status, (await r.text().catch(() => '')).slice(0, 160)); return ''; }
    return (await r.text()).trim();
  } catch (e) { console.log('⚠️ Whisper:', e.message); return ''; }
}

function _panneauStop() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('voixterrain_stop').setLabel('Arrêter & transcrire').setEmoji('⏹️').setStyle(ButtonStyle.Danger),
  );
}

async function _demarrer(interaction) {
  const V = _lazyVoice(); const prism = _lazyPrism();
  if (!V || !prism) return interaction.reply({ content: '🎙️ Enregistrement vocal indisponible (librairies manquantes).', flags: MessageFlags.Ephemeral });
  if (!process.env.OPENAI_API_KEY) return interaction.reply({ content: '🎙️ La transcription nécessite `OPENAI_API_KEY` (déjà utilisée pour les images) — ajoute-la au bot.', flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const vc = interaction.member?.voice?.channel;
  if (!vc) return interaction.reply({ content: '🎙️ Rejoins d\'abord un **canal vocal**, puis relance `/rapport-vocal`.', flags: MessageFlags.Ephemeral });
  if (_sessions.has(guild.id)) return interaction.reply({ content: '🎙️ Un enregistrement est déjà en cours sur ce serveur. Utilise ⏹️ pour l\'arrêter.', flags: MessageFlags.Ephemeral });

  let conn;
  try {
    conn = V.joinVoiceChannel({ channelId: vc.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: false, selfMute: true });
  } catch (e) { return interaction.reply({ content: `🎙️ Impossible de rejoindre le vocal : ${e.message}`, flags: MessageFlags.Ephemeral }); }

  const sess = { conn, buffers: new Map(), tailles: new Map(), abonnes: new Set(), noms: new Map(), invoker: interaction.member?.displayName || interaction.user.username, timer: null, receiver: conn.receiver };
  _sessions.set(guild.id, sess);

  const receiver = conn.receiver;
  receiver.speaking.on('start', (userId) => {
    try {
      if (sess.abonnes.has(userId)) return;
      if ((sess.tailles.get(userId) || 0) >= MAX_BYTES_PAR_USER) return;
      sess.abonnes.add(userId);
      const membre = guild.members.cache.get(userId);
      if (membre && !sess.noms.has(userId)) sess.noms.set(userId, membre.displayName || membre.user.username);
      const opus = receiver.subscribe(userId, { end: { behavior: V.EndBehaviorType.AfterSilence, duration: 900 } });
      const decoder = new prism.opus.Decoder({ frameSize: 960, channels: 2, rate: 48000 });
      const pcm = opus.pipe(decoder);
      if (!sess.buffers.has(userId)) sess.buffers.set(userId, []);
      pcm.on('data', (chunk) => {
        const t = (sess.tailles.get(userId) || 0);
        if (t < MAX_BYTES_PAR_USER) { sess.buffers.get(userId).push(chunk); sess.tailles.set(userId, t + chunk.length); }
      });
      const fin = () => { sess.abonnes.delete(userId); };
      pcm.on('end', fin); pcm.on('error', fin); opus.on('error', fin);
    } catch { sess.abonnes.delete(userId); }
  });

  // Coupe-circuit : arrêt automatique après MAX_MS.
  sess.timer = setTimeout(() => { _finaliser(guild, null).catch(() => {}); }, MAX_MS);

  return interaction.reply({
    content: `🎙️ **Enregistrement en cours** dans **${vc.name}** — parlez normalement. Appuyez sur **⏹️ Arrêter & transcrire** quand la scène est finie.\n_L'IA en fera un rapport de terrain immersif._`,
    components: [_panneauStop()],
  });
}

// Arrête, transcrit chaque personne, poste la transcription (déclenche le rapport IA).
async function _finaliser(guild, interaction) {
  const sess = _sessions.get(guild.id);
  if (!sess) { if (interaction) await interaction.reply({ content: 'ℹ️ Aucun enregistrement en cours.', flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
  _sessions.delete(guild.id);
  try { if (sess.timer) clearTimeout(sess.timer); } catch {}
  if (interaction) await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  try { sess.conn.destroy(); } catch {}

  // Laisse les derniers flux se vider.
  await new Promise(r => setTimeout(r, 700));

  const lignes = [];
  for (const [userId, chunks] of sess.buffers) {
    try {
      const pcm = Buffer.concat(chunks);
      if (pcm.length < 48000) continue; // < ~0,25 s utile → on ignore
      const mp3 = await _pcmVersMp3(pcm);
      if (!mp3) continue;
      const texte = await _whisper(mp3);
      if (texte && texte.length > 1 && !/^[\s.,!?…-]*$/.test(texte)) {
        const nom = sess.noms.get(userId) || guild.members.cache.get(userId)?.displayName || 'Voix';
        lignes.push(`${nom} : ${texte.replace(/\s+/g, ' ').trim()}`);
      }
    } catch { /* on continue avec les autres */ }
  }

  if (!lignes.length) {
    const msg = '🎙️ Aucune parole exploitable n\'a été captée (silence, micros coupés, ou clé Whisper invalide).';
    if (interaction) await interaction.editReply({ content: msg }).catch(() => {});
    return;
  }

  const info = lignes.join('\n').slice(0, 1800);
  // Poste au format du logiciel via webhook → déclenche genererRapportIA (rapport immersif).
  let ok = false;
  try {
    const ch = guild.channels.cache.get(CHANNEL_TRANSCRIPTION) || await guild.channels.fetch(CHANNEL_TRANSCRIPTION).catch(() => null);
    if (ch && typeof ch.fetchWebhooks === 'function') {
      const hooks = await ch.fetchWebhooks().catch(() => null);
      let hook = hooks ? ([...hooks.values()].find(h => h.token && /note|web|iwc|transcri/i.test(h.name || '')) || [...hooks.values()].find(h => h.token)) : null;
      if (!hook) hook = await ch.createWebhook({ name: 'IWC Notes Web' }).catch(() => null);
      if (hook) {
        const contenu = `🎙️||||||${info}||normale||${sess.invoker}`;
        await hook.send({ content: contenu.slice(0, 1950), username: `🎙️ ${sess.invoker}`, allowedMentions: { parse: [] } });
        ok = true;
      }
    }
  } catch (e) { console.log('⚠️ voix-terrain webhook:', e.message); }

  const rendu = ok
    ? `✅ **Scène transcrite** (${lignes.length} intervention(s)) — le réseau en fait un **rapport de terrain immersif**, il arrive dans le salon dédié.`
    : `⚠️ Transcription faite mais envoi impossible (permission « Gérer les webhooks » manquante sur le salon des transcriptions).\n\n${info.slice(0, 1500)}`;
  if (interaction) await interaction.editReply({ content: rendu }).catch(() => {});
}

async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'rapport-vocal') { await _demarrer(interaction); return true; }
    if (interaction.isButton?.() && interaction.customId === 'voixterrain_stop') {
      await _finaliser(interaction.guild, interaction);
      // Retire le bouton du message d'origine.
      try { await interaction.message.edit({ components: [] }); } catch {}
      return true;
    }
    return false;
  } catch (e) {
    console.log('❌ voix-terrain:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '⚠️ Erreur d\'enregistrement vocal.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { voixCommands, routeInteraction };
