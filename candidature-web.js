// ═══════════════════════════════════════════════════════════════
// candidature-web.js — Relaie sur Discord les CANDIDATURES de recrutement
// déposées depuis la page publique /rejoindre.
//
// La page enregistre les candidatures dans Supabase (table Candidature,
// notifieDiscord = false). Ce module les relève et poste une notification dans
// le salon de recrutement, pour que l'équipe traite la candidature depuis le site.
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op sans
// les variables Supabase.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const { lireCandidaturesWeb, marquerCandidatureTransmise } = require('./supabase-sync');

const FONDATEUR_ID = '944208797084311583'; // repli MP
// Rôles à pinguer pour qu'on soit alerté sur Discord même sans le site ouvert.
const PING_ROLES = ['Fondateur', 'Conseil', 'Directeur', 'Officier'];
function _ping(guild) {
  const ids = new Set();
  for (const motif of PING_ROLES) {
    const r = guild.roles.cache.find(x => x.name && x.name.includes(motif));
    if (r) ids.add(r.id);
  }
  return [...ids].map(id => `<@&${id}>`).join(' ');
}

function _peutEcrire(guild, ch) {
  try {
    if (!ch || !ch.isTextBased?.()) return false;
    const me = guild.members.me; if (!me) return true;
    const perms = ch.permissionsFor(me);
    return !perms || perms.has('SendMessages');
  } catch { return true; }
}
function _salon(guild) {
  const n = guild.channels.cache.find(c => c.isTextBased?.() && /recrut|candidat|rejoindre|rh\b/i.test(c.name) && _peutEcrire(guild, c));
  if (n) return n;
  if (guild.systemChannel && _peutEcrire(guild, guild.systemChannel)) return guild.systemChannel;
  return guild.channels.cache.find(c => c.isTextBased?.() && _peutEcrire(guild, c)) || null;
}
function _embed(c) {
  const e = new EmbedBuilder()
    .setColor(0xc8a45c)
    .setTitle('🐺 Nouvelle candidature — Iron Wolf Company')
    .setDescription(String(c.motivation || '').slice(0, 1500) || '—')
    .addFields(
      { name: '👤 Nom RP', value: String(c.nomRP || '—').slice(0, 120), inline: true },
      { name: '🎂 Âge', value: String(c.age || '—').slice(0, 40), inline: true },
      { name: '📇 Contact', value: `${c.moyen ? c.moyen + ' : ' : ''}${String(c.contact || '—')}`.slice(0, 200), inline: true },
    )
    .setFooter({ text: 'Iron Wolf Company · Candidature déposée sur le site' })
    .setTimestamp();
  if (c.experience) e.addFields({ name: '🎯 Expérience', value: String(c.experience).slice(0, 1000) });
  if (c.disponibilites) e.addFields({ name: '🕒 Disponibilités', value: String(c.disponibilites).slice(0, 300) });
  return e;
}

async function verifierCandidaturesWeb(guild) {
  let rows;
  try { rows = await lireCandidaturesWeb(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const salon = _salon(guild);
  const ping = salon ? _ping(guild) : '';
  for (const c of rows) {
    let livre = false;
    if (salon) {
      try { await salon.send({ content: `${ping ? ping + ' — ' : ''}🐺 **Nouvelle candidature reçue** (site web).`, embeds: [_embed(c)], allowedMentions: { parse: ['roles'] } }); livre = true; }
      catch (e) { console.log('⚠️ candidature-web salon:', e.message); }
    }
    if (!livre) {
      try { const u = await guild.client.users.fetch(FONDATEUR_ID).catch(() => null); if (u) { await u.send({ content: '🐺 **Nouvelle candidature** (site web) — *aucun salon trouvé.*', embeds: [_embed(c)] }); livre = true; } }
      catch (e) { console.log('⚠️ candidature-web MP:', e.message); }
    }
    if (livre) { try { await marquerCandidatureTransmise(c.id); } catch {} }
  }
}

module.exports = { verifierCandidaturesWeb };
