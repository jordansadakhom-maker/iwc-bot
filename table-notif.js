// ═══════════════════════════════════════════════════════════════
// table-notif.js — Notification « à toi de jouer » pour les jeux de table.
// Garde UNE seule notif vivante par table : supprime l'ancienne et en poste une
// nouvelle qui PINGUE le joueur courant quand le tour change → chacun sait quand
// c'est à lui (même en pleine partie RP), sans spammer le salon. Sur un tour
// inchangé, ne fait RIEN (pas de re-ping). Aucune dépendance, rien en base.
// ═══════════════════════════════════════════════════════════════
async function majPingTour(t, channel, curUserId) {
  try {
    if (!channel) return;
    if (curUserId && curUserId !== t._lastPingId) {
      // Le tour a changé → on retire l'ancienne notif et on pingue le nouveau joueur.
      if (t._pingMsgId) { await channel.messages.delete(t._pingMsgId).catch(() => {}); t._pingMsgId = null; }
      const m = await channel.send({ content: '🎯 <@' + curUserId + '> — **à toi de jouer !**', allowedMentions: { users: [curUserId] } }).catch(() => null);
      t._pingMsgId = m ? m.id : null; t._lastPingId = curUserId;
    } else if (!curUserId && (t._pingMsgId || t._lastPingId)) {
      // Plus de tour en cours (manche finie / lobby) → on enlève la notif.
      if (t._pingMsgId) await channel.messages.delete(t._pingMsgId).catch(() => {});
      t._pingMsgId = null; t._lastPingId = null;
    }
  } catch {}
}
module.exports = { majPingTour };
