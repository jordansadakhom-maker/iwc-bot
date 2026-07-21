// ═══════════════════════════════════════════════════════════════
// rdv-armurerie.js — Rappels des rendez-vous de l'armurerie de Van Horn.
//
// Les RDV sont pris sur le SITE (table Supabase ArmurerieRdv, site-native). Ce
// module lit les RDV « à venir » et envoie un rappel dans #agenda 45 min PUIS
// 15 min avant l'heure. Les drapeaux rappel45 / rappel15 sont écrits en base
// après envoi → un rappel n'est jamais répété (résiste aux redémarrages).
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op si
// les helpers Supabase ne sont pas là.
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder } = require('discord.js');
const supa = require('./supabase-sync');

const SALON_AGENDA = '1509638226132996178';       // #agenda (même salon que les RDV web)
const FONDATEUR_ID = '944208797084311583';
const PING_ROLES = ['Fondateur', 'Conseil', 'Directeur', 'Officier'];

// Chaîne de mentions des rôles à prévenir (ceux qui existent sur le serveur).
function _ping(guild) {
  try {
    const ids = [];
    for (const nom of PING_ROLES) {
      const r = guild.roles.cache.find(x => (x.name || '').toLowerCase().includes(nom.toLowerCase()));
      if (r) ids.push(`<@&${r.id}>`);
    }
    return ids.join(' ');
  } catch { return ''; }
}

async function _salon(guild) {
  let ch = guild.channels.cache.get(SALON_AGENDA) || await guild.channels.fetch(SALON_AGENDA).catch(() => null);
  if (ch && ch.isTextBased?.()) return ch;
  ch = guild.channels.cache.find(c => c.isTextBased?.() && /agenda/i.test(c.name || ''));
  return ch || null;
}

function _fmtHeure(iso) {
  try { return new Date(iso).toLocaleString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' }); }
  catch { return String(iso); }
}

// Vérifie les RDV à venir et envoie les rappels 45 / 15 min avant l'heure.
// À appeler régulièrement (cron chaque minute). Best-effort intégral.
async function checkRappelsArmurerie(guild) {
  try {
    if (!guild || !supa.lireRdvArmurerieARappeler) return;
    const rows = await supa.lireRdvArmurerieARappeler();
    if (!Array.isArray(rows) || !rows.length) return;
    const now = Date.now();
    let salon = null; // résolu à la première nécessité seulement
    for (const r of rows) {
      if (!r || !r.dateRdv) continue;
      const t = new Date(r.dateRdv).getTime();
      if (isNaN(t)) continue;
      const mins = Math.round((t - now) / 60000);
      let champ = null, tag = null, urgent = false;
      if (mins <= 15 && mins >= -3 && !r.rappel15) { champ = 'rappel15'; tag = '⏰ dans ~15 min'; urgent = true; }
      else if (mins <= 45 && mins > 15 && !r.rappel45) { champ = 'rappel45'; tag = '🔔 dans ~45 min'; }
      if (!champ) continue;

      if (!salon) salon = await _salon(guild);
      const nom = [r.clientPrenom, r.clientNom].filter(Boolean).join(' ') || r.clientNom || 'Client';
      const emb = new EmbedBuilder()
        .setColor(urgent ? 0xED4245 : 0xC9A227)
        .setTitle(`🗓️ Rappel rendez-vous — ${tag}`)
        .setDescription(`**${nom}** a rendez-vous à l'armurerie de Van Horn.`)
        .addFields(
          { name: '🕐 Heure', value: _fmtHeure(r.dateRdv), inline: false },
          ...(r.commande ? [{ name: '🧾 Commande', value: String(r.commande).slice(0, 1000), inline: false }] : []),
          ...(r.lieu ? [{ name: '📍 Lieu', value: String(r.lieu).slice(0, 200), inline: true }] : []),
          ...(r.telegramme ? [{ name: '📨 Contact', value: String(r.telegramme).slice(0, 120), inline: true }] : []),
        )
        .setFooter({ text: 'IWC · Armurerie de Van Horn' })
        .setTimestamp();

      let envoye = false;
      if (salon) {
        const ping = _ping(guild);
        const msg = await salon.send({ content: ping || undefined, embeds: [emb], allowedMentions: { parse: ['roles'] } }).catch(() => null);
        envoye = !!msg;
      }
      if (!envoye) {
        // Repli : message privé au fondateur (au moins l'info passe).
        const u = await guild.client.users.fetch(FONDATEUR_ID).catch(() => null);
        if (u) await u.send({ embeds: [emb] }).catch(() => {});
      }
      // On note le rappel comme envoyé même en repli MP (pour ne pas boucler).
      await supa.marquerRappelRdvArmurerie(r.id, champ).catch(() => {});
    }
  } catch (e) { console.log('❌ Rappels RDV armurerie:', e.message); }
}

module.exports = { checkRappelsArmurerie };
