// ═══════════════════════════════════════════════════════════════
// telegramme-web.js — Relaie sur Discord les télégrammes ENVOYÉS DEPUIS LE SITE
//
// La page publique /telegramme enregistre les messages dans Supabase
// (table TelegrammeWeb, statut « nouveau »). Ce module les relève et poste une
// notification dans le salon des télégrammes, pour que l'équipe puisse répondre
// (via le moyen de contact laissé par l'expéditeur).
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op sans
// les variables Supabase.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const { lireTelegrammesWeb, marquerTelegrammeWebTransmis } = require('./supabase-sync');

const SALON_TELEGRAMME = '1512175624176009348'; // salon des télégrammes
const FONDATEUR_ID = '944208797084311583';       // repli MP
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
  const d = guild.channels.cache.get(SALON_TELEGRAMME);
  if (d && _peutEcrire(guild, d)) return d;
  const n = guild.channels.cache.find(c => c.isTextBased?.() && /t[eé]l[eé]gramme|courrier|message/i.test(c.name) && _peutEcrire(guild, c));
  if (n) return n;
  if (guild.systemChannel && _peutEcrire(guild, guild.systemChannel)) return guild.systemChannel;
  return guild.channels.cache.find(c => c.isTextBased?.() && _peutEcrire(guild, c)) || null;
}
function _embed(t) {
  return new EmbedBuilder()
    .setColor(0xc8a45c)
    .setTitle('📨 Nouveau télégramme — via le site')
    .setDescription(String(t.message || '').slice(0, 1800) || '—')
    .addFields(
      { name: '👤 De', value: String(t.nom || '—').slice(0, 120), inline: true },
      { name: '📇 Répondre à', value: String(t.contact || '—').slice(0, 200), inline: true },
    )
    .setFooter({ text: 'Iron Wolf Company · Télégramme envoyé depuis le site' })
    .setTimestamp();
}

async function verifierTelegrammesWeb(guild) {
  let rows;
  try { rows = await lireTelegrammesWeb(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const salon = _salon(guild);
  const ping = salon ? _ping(guild) : '';
  for (const t of rows) {
    let livre = false;
    if (salon) {
      try { await salon.send({ content: `${ping ? ping + ' — ' : ''}📨 **Nouveau télégramme reçu** (site web).`, embeds: [_embed(t)], allowedMentions: { parse: ['roles'] } }); livre = true; }
      catch (e) { console.log('⚠️ telegramme-web salon:', e.message); }
    }
    if (!livre) {
      try { const u = await guild.client.users.fetch(FONDATEUR_ID).catch(() => null); if (u) { await u.send({ content: '📨 **Nouveau télégramme** (site web) — *aucun salon trouvé.*', embeds: [_embed(t)] }); livre = true; } }
      catch (e) { console.log('⚠️ telegramme-web MP:', e.message); }
    }
    if (livre) { try { await marquerTelegrammeWebTransmis(t.id); } catch {} }
  }
}

module.exports = { verifierTelegrammesWeb };
