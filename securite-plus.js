// ═══════════════════════════════════════════════════════════════
// securite-plus.js — Protections complémentaires (mode « auto modéré + alerte »)
//   1) Anti-spam / flood (messages en rafale, mentions de masse, @everyone abusif)
//   2) Anti-scam / liens d'arnaque (faux Nitro, phishing, steam-scam)
//   3) Anti-raid (vague de connexions de nouveaux comptes)
//   4) Anti ban/kick en masse (modérateur compromis)
//
// Philosophie : seuils PRUDENTS + exemption du staff/bots → on sanctionne peu mais
// on alerte toujours la Direction. Toute action est RÉVERSIBLE (timeout, retrait de
// rôles). N'interfère pas avec le reste : onMessage ne renvoie true QUE s'il a agi.
// Complète securite.js (anti-nuke salons/rôles déjà en place).
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, PermissionFlagsBits, AuditLogEvent } = require('discord.js');
let AUTORISES = [];
try { ({ AUTORISES } = require('./securite')); } catch { AUTORISES = []; }

// ── Seuils (prudents pour éviter les faux positifs) ──
const CONF = {
  SPAM_MSGS: 6, SPAM_WINDOW_MS: 4000,       // 6 messages en 4 s → flood
  SPAM_TIMEOUT_MS: 5 * 60 * 1000,           // timeout 5 min
  MAX_MENTIONS: 8,                          // ≥ 8 mentions dans un message → spam de mentions
  RAID_JOINS: 6, RAID_WINDOW_MS: 12000,     // 6 arrivées en 12 s → raid
  RAID_TIMEOUT_MS: 15 * 60 * 1000,          // timeout des arrivants 15 min (réversible)
  RAID_ALERT_COOLDOWN_MS: 60000,            // une alerte raid / minute max
  MASSMOD: 4, MASSMOD_WINDOW_MS: 20000,     // 4 ban/kick en 20 s par la même personne → attaque
};

// ── Domaines/motifs d'arnaque connus (liste ciblée pour limiter les faux positifs) ──
const SCAM_RE = [
  /\bfree\s*[-]?\s*nitro\b/i,
  /nitro\s*(?:gratuit|gift|free|giveaway|cadeau)/i,
  /disc[o0]rd\s*nitro/i,
  /(?:dlscord|disc0rd|disclrd|dlscord)\.(?:com|gg|gift|ru|tk)/i,
  /(?:steamcommunlty|stearncommunity|steamcomunity|steam-?community-?gift)\./i,
  /steam\s*(?:gift|free\s*games?)/i,
  /https?:\/\/[^\s]*\.(?:ru|tk|cf|gq|ml|xyz)\/[^\s]*(?:nitro|gift|steam)/i,
  /@everyone[^\n]{0,40}https?:\/\//i, // ping everyone juste avant un lien = très suspect
];

// ── États en mémoire ──
const _msgs = new Map();      // userId → [timestamps]
const _joins = new Map();     // guildId → [{id, at}]
const _modActs = new Map();   // guildId:executorId → [timestamps]
let _lastRaidAlert = 0;

// ── Helpers ──
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estStaffOuBot(member, user) {
  if (user?.bot) return true;
  if (member && AUTORISES.includes(member.id)) return true;
  const p = member?.permissions;
  if (p && (p.has(PermissionFlagsBits.Administrator) || p.has(PermissionFlagsBits.ManageGuild) || p.has(PermissionFlagsBits.ManageMessages) || p.has(PermissionFlagsBits.ModerateMembers))) return true;
  if (member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n)))) return true;
  return false;
}
async function alerter(guild, titre, description, couleur = 0xC0392B) {
  const embed = new EmbedBuilder().setColor(couleur).setTitle(titre).setDescription(description.slice(0, 3900)).setTimestamp().setFooter({ text: 'Sécurité • La Confrérie' });
  // Salon d'alerte (journal de bord / logs) si dispo
  try { const ch = (typeof global.getAlerteCh === 'function') ? global.getAlerteCh(guild) : null; if (ch?.send) await ch.send({ embeds: [embed] }).catch(() => {}); } catch {}
  // MP aux responsables
  for (const id of AUTORISES) { try { const u = await guild.client.users.fetch(id); await u.send({ embeds: [embed] }); } catch {} }
  console.log(`[SÉCURITÉ+] ${titre} — ${description.replace(/\n/g, ' ').slice(0, 200)}`);
}
async function timeout(member, ms, raison) {
  try { if (member?.moderatable) { await member.timeout(ms, raison); return true; } } catch {}
  return false;
}
async function neutraliser(member, raison) {
  try {
    if (!member || !member.manageable) return false;
    const roles = member.roles.cache.filter(r => r.id !== member.guild.id && r.managed === false);
    await member.roles.remove([...roles.keys()], raison).catch(() => {});
    return true;
  } catch { return false; }
}
async function trouverExecuteur(guild, type, cibleId) {
  try {
    const logs = await guild.fetchAuditLogs({ type, limit: 6 });
    const e = logs.entries.find(x => x.target?.id === cibleId && (Date.now() - x.createdTimestamp) < 10000);
    return e?.executor || null;
  } catch { return null; }
}

// ═══════════ 1 & 2 : ANTI-SPAM / FLOOD + ANTI-SCAM (sur messages) ═══════════
// Renvoie true UNIQUEMENT si le message a été supprimé (pour que l'appelant fasse `return`).
async function onMessage(message) {
  try {
    if (!message?.guild || message.author?.bot || message.webhookId) return false;
    if (estStaffOuBot(message.member, message.author)) return false;
    const contenu = message.content || '';

    // — Anti-scam : lien/arnaque connue —
    if (contenu && SCAM_RE.some(re => re.test(contenu))) {
      await message.delete().catch(() => {});
      await timeout(message.member, CONF.SPAM_TIMEOUT_MS, 'Lien/arnaque détecté');
      await alerter(message.guild, '🪤 Lien d\'arnaque supprimé',
        `Message de <@${message.author.id}> dans <#${message.channelId}> supprimé (arnaque/phishing présumé) et auteur mis en sourdine 5 min.\n\n> ${contenu.slice(0, 300).replace(/\n/g, ' ')}`);
      return true;
    }

    // — Anti-mentions de masse —
    const nbMentions = (message.mentions?.users?.size || 0) + (message.mentions?.roles?.size || 0);
    if (nbMentions >= CONF.MAX_MENTIONS || (message.mentions?.everyone && nbMentions >= 3)) {
      await message.delete().catch(() => {});
      await timeout(message.member, CONF.SPAM_TIMEOUT_MS, 'Spam de mentions');
      await alerter(message.guild, '📛 Spam de mentions',
        `<@${message.author.id}> a envoyé un message avec **${nbMentions}** mentions${message.mentions?.everyone ? ' (+ @everyone/@here)' : ''} dans <#${message.channelId}>. Message supprimé, sourdine 5 min.`);
      return true;
    }

    // — Anti-flood : trop de messages en peu de temps —
    const now = Date.now();
    const arr = (_msgs.get(message.author.id) || []).filter(t => now - t < CONF.SPAM_WINDOW_MS);
    arr.push(now);
    _msgs.set(message.author.id, arr);
    if (arr.length >= CONF.SPAM_MSGS) {
      _msgs.set(message.author.id, []);
      await timeout(message.member, CONF.SPAM_TIMEOUT_MS, 'Flood de messages');
      // Supprime les derniers messages de l'auteur dans ce salon
      try {
        const recents = await message.channel.messages.fetch({ limit: 15 });
        const aSupprimer = recents.filter(m => m.author.id === message.author.id && (now - m.createdTimestamp) < CONF.SPAM_WINDOW_MS * 2);
        for (const m of aSupprimer.values()) await m.delete().catch(() => {});
      } catch {}
      await alerter(message.guild, '🌊 Flood détecté',
        `<@${message.author.id}> a envoyé ${arr.length}+ messages en ${CONF.SPAM_WINDOW_MS / 1000}s dans <#${message.channelId}>. Sourdine 5 min, messages récents supprimés.`);
      return true;
    }
  } catch (e) { console.log('⚠️ securite-plus onMessage:', e.message); }
  return false;
}

// ═══════════ 3 : ANTI-RAID (arrivées en masse) ═══════════
async function onGuildMemberAdd(member) {
  try {
    if (!member?.guild) return;
    const now = Date.now();
    const arr = (_joins.get(member.guild.id) || []).filter(j => now - j.at < CONF.RAID_WINDOW_MS);
    arr.push({ id: member.id, at: now });
    _joins.set(member.guild.id, arr);
    if (arr.length >= CONF.RAID_JOINS && (now - _lastRaidAlert) > CONF.RAID_ALERT_COOLDOWN_MS) {
      _lastRaidAlert = now;
      // Mode auto modéré : on met en sourdine les arrivants de la vague (réversible) + alerte
      let mutes = 0;
      for (const j of arr) {
        const m = await member.guild.members.fetch(j.id).catch(() => null);
        if (m && await timeout(m, CONF.RAID_TIMEOUT_MS, 'Anti-raid : vague de connexions')) mutes++;
      }
      await alerter(member.guild, '🚨 RAID détecté — vague de connexions',
        `**${arr.length}** comptes ont rejoint en moins de ${CONF.RAID_WINDOW_MS / 1000}s.\n` +
        `→ ${mutes} arrivant(s) mis en **sourdine 15 min** (réversible) le temps que la Direction vérifie.\n` +
        `*Si c'est un faux positif, retire la sourdine. Pour un blocage total, on peut activer un lockdown.*`,
        0xE67E22);
    }
  } catch (e) { console.log('⚠️ securite-plus raid:', e.message); }
}

// ═══════════ 4 : ANTI BAN/KICK EN MASSE ═══════════
async function _suivreModeration(guild, executor, type) {
  if (!executor || executor.bot) return;
  if (AUTORISES.includes(executor.id) || executor.id === guild.ownerId) return; // responsables de confiance
  const key = `${guild.id}:${executor.id}`;
  const now = Date.now();
  const arr = (_modActs.get(key) || []).filter(t => now - t < CONF.MASSMOD_WINDOW_MS);
  arr.push(now);
  _modActs.set(key, arr);
  if (arr.length >= CONF.MASSMOD) {
    _modActs.set(key, []);
    const m = await guild.members.fetch(executor.id).catch(() => null);
    const neutralise = m ? await neutraliser(m, 'Sécurité : ban/kick en masse') : false;
    await alerter(guild, '🚨 Ban/Kick EN MASSE détecté',
      `<@${executor.id}> a effectué **${arr.length}+ ${type}** en ${CONF.MASSMOD_WINDOW_MS / 1000}s.\n` +
      (neutralise ? '→ Ses **rôles ont été retirés** par précaution (compte peut-être compromis).' : '→ ⚠️ Impossible de retirer ses rôles (hiérarchie/permissions du bot).') +
      '\n*Vérifie en urgence et rétablis si c\'est une erreur.*');
  }
}
async function onGuildBanAdd(ban) {
  try { const ex = await trouverExecuteur(ban.guild, AuditLogEvent.MemberBanAdd, ban.user.id); await _suivreModeration(ban.guild, ex, 'bannissement(s)'); }
  catch (e) { console.log('⚠️ securite-plus banAdd:', e.message); }
}
async function onGuildMemberRemove(member) {
  try {
    // Un départ peut être un kick : on ne réagit QUE si un kick figure dans les logs d'audit récents
    const ex = await trouverExecuteur(member.guild, AuditLogEvent.MemberKick, member.id);
    if (ex) await _suivreModeration(member.guild, ex, 'expulsion(s)');
  } catch (e) { console.log('⚠️ securite-plus memberRemove:', e.message); }
}

function initSecuritePlus(client) {
  client.on('guildMemberAdd', m => { onGuildMemberAdd(m).catch(() => {}); });
  client.on('guildBanAdd', b => { onGuildBanAdd(b).catch(() => {}); });
  client.on('guildMemberRemove', m => { onGuildMemberRemove(m).catch(() => {}); });
  console.log('🛡️ securite-plus initialisé (anti-spam, anti-scam, anti-raid, anti ban/kick masse)');
}

module.exports = { initSecuritePlus, onMessage, CONF };
