// ═══════════════════════════════════════════════════════════════
// casino-voix.js — Le bot rejoint le salon VOCAL Discord et y joue les bruitages
// du saloon (battage, cartes, jetons, dés, tuiles, gains…) pendant les parties.
// Lecture de PCM brut (48 kHz / stéréo) via @discordjs/voice + @discordjs/opus →
// AUCUN ffmpeg requis. TOUT est gardé en try/catch : si la voix échoue (module
// absent, pas de permission, personne en vocal), les jeux ne sont JAMAIS impactés.
//   voix.jouer(voiceChannel, nomSon) — nomSon ∈ assets/sons/*.pcm
// ═══════════════════════════════════════════════════════════════
let V = null; try { V = require('@discordjs/voice'); } catch (e) { console.log('⚠️ casino-voix : @discordjs/voice indisponible →', e.message); V = null; }
const fs = require('fs');
const path = require('path');
const SONS = path.join(__dirname, 'assets', 'sons');

const _guilds = new Map(); // guildId -> { channelId, player, idleTimer }
const IDLE_MS = 90000;     // se déconnecte après 90 s sans son

function _fichier(nom) { const p = path.join(SONS, String(nom).replace(/[^a-z]/gi, '') + '.pcm'); return fs.existsSync(p) ? p : null; }

// Joue un bruitage dans le salon vocal donné (celui où se trouve le joueur qui agit).
async function jouer(voiceChannel, nomSon) {
  try {
    if (!V || !voiceChannel || !voiceChannel.guild || !voiceChannel.joinable) return;
    const fichier = _fichier(nomSon); if (!fichier) return;
    const guildId = voiceChannel.guild.id;
    let g = _guilds.get(guildId);
    let conn = V.getVoiceConnection(guildId);
    if (!conn || !g || g.channelId !== voiceChannel.id) {
      if (conn) { try { conn.destroy(); } catch {} }
      conn = V.joinVoiceChannel({ channelId: voiceChannel.id, guildId, adapterCreator: voiceChannel.guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
      const player = V.createAudioPlayer({ behaviors: { noSubscriber: V.NoSubscriberBehavior.Play } });
      conn.subscribe(player);
      g = { channelId: voiceChannel.id, player, idleTimer: null };
      _guilds.set(guildId, g);
      try { await V.entersState(conn, V.VoiceConnectionStatus.Ready, 8000); } catch {}
    }
    const resource = V.createAudioResource(fs.createReadStream(fichier), { inputType: V.StreamType.Raw });
    g.player.play(resource);
    if (g.idleTimer) clearTimeout(g.idleTimer);
    g.idleTimer = setTimeout(() => quitter(guildId), IDLE_MS);
  } catch (e) { console.log('⚠️ casino-voix jouer:', e.message); }
}

function quitter(guildId) {
  try {
    const g = _guilds.get(guildId); if (g?.idleTimer) clearTimeout(g.idleTimer);
    const c = V && V.getVoiceConnection && V.getVoiceConnection(guildId); if (c) c.destroy();
    _guilds.delete(guildId);
  } catch {}
}

module.exports = { jouer, quitter, disponible: () => !!V };
