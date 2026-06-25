// ═══════════════════════════════════════════════════════════════
// sticky-panel.js — Garde un panneau d'actions TOUJOURS en bas de son salon.
// But : quand on clique un bouton du panneau, le menu déroulant éphémère (que
// Discord place en bas du salon) apparaît juste sous le panneau.
//
// Fonctionnement : on repère le panneau par un marqueur dans le titre de son embed.
// Dès qu'un message le fait remonter, on re-poste une COPIE identique en bas
// (mêmes embeds + mêmes boutons) puis on supprime l'ancienne. Aucune dépendance
// aux fonctions de construction des panneaux → générique et non invasif.
// Garde-fous : debounce (anti-rafale), « déjà en bas » (anti-spam), pas de boucle.
// ═══════════════════════════════════════════════════════════════
const _cfg = new Map();    // channelId → marqueur (titre, en minuscules)
const _timers = new Map(); // channelId → timeout de debounce

function register(channelId, titleMarker) {
  if (channelId && titleMarker) _cfg.set(String(channelId), String(titleMarker).toLowerCase());
}

async function _bump(channel) {
  try {
    const marker = _cfg.get(channel.id);
    if (!marker) return;
    const recent = await channel.messages.fetch({ limit: 25 }).catch(() => null);
    if (!recent || !recent.size) return;
    const arr = [...recent.values()]; // du plus récent au plus ancien
    const me = channel.client.user.id;
    const panel = arr.find(m => m.author?.id === me && (m.embeds?.[0]?.title || '').toLowerCase().includes(marker));
    if (!panel) return;                 // panneau introuvable (trop loin) → on ne touche à rien
    if (arr[0]?.id === panel.id) return; // déjà tout en bas → rien à faire
    // Re-poste une copie identique en bas, puis supprime l'ancienne (jamais l'inverse → aucune perte)
    const sent = await channel.send({ embeds: panel.embeds, components: panel.components }).catch(() => null);
    if (!sent) return;
    await panel.delete().catch(() => {});
    try { await sent.pin(); } catch {}
  } catch (e) { console.log('⚠️ sticky-panel bump:', e.message); }
}

// À appeler sur chaque message (ne consomme rien). Replanifie un « bump » différé.
function onMessage(message) {
  try {
    const chId = message?.channel?.id;
    if (!message?.guild || !chId || !_cfg.has(chId)) return;
    if (_timers.has(chId)) clearTimeout(_timers.get(chId));
    _timers.set(chId, setTimeout(() => { _timers.delete(chId); _bump(message.channel).catch(() => {}); }, 3000));
  } catch {}
}

module.exports = { register, onMessage };
