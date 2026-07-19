// ═══════════════════════════════════════════════════════════════
// rdv-web.js — Notifie l'équipe des demandes de RDV venues du SITE WEB
//
// Le site public (page « Prendre rendez-vous ») enregistre les demandes dans
// Supabase (table Rdv, statut « nouveau », paiement.source = 'web'). Ce module
// relève ces demandes et poste une notification dans #agenda en mentionnant les
// rôles opérateurs — exactement le salon où arrivent déjà les RDV Discord.
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. Ne touche
// pas au flux rdvplus existant (notification autonome, sans boutons). No-op sans
// les variables Supabase.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const { lireDemandesRdvWeb, marquerRdvTransmis } = require('./supabase-sync');

const SALON_AGENDA = '1509638226132996178'; // #agenda (même salon que les RDV Discord)
const PING_ROLES = ['Panseur', 'Officier de Terrain', 'Officier', 'Fondateur'];
const FONDATEUR_ID = '944208797084311583'; // Jonas — reçoit la notif en dernier recours

// Le bot peut-il écrire dans ce salon ?
function _peutEcrire(guild, ch) {
  try {
    if (!ch || !ch.isTextBased?.()) return false;
    const me = guild.members.me;
    if (!me) return true;
    const perms = ch.permissionsFor(me);
    return !perms || perms.has('SendMessages');
  } catch { return true; }
}

function _salonAgenda(guild) {
  // 1) le salon dédié ; 2) un salon nommé agenda/planning/rdv/rendez-vous/demande ;
  // 3) le salon système ; 4) le premier salon texte où le bot peut écrire.
  const dedie = guild.channels.cache.get(SALON_AGENDA);
  if (dedie && _peutEcrire(guild, dedie)) return dedie;
  const nomme = guild.channels.cache.find(c => c.isTextBased?.() && /agenda|planning|rendez|rdv|demande/i.test(c.name) && _peutEcrire(guild, c));
  if (nomme) return nomme;
  if (guild.systemChannel && _peutEcrire(guild, guild.systemChannel)) return guild.systemChannel;
  return guild.channels.cache.find(c => c.isTextBased?.() && _peutEcrire(guild, c)) || null;
}

function _ping(guild) {
  const ids = new Set();
  for (const motif of PING_ROLES) {
    const r = guild.roles.cache.find(x => x.name.includes(motif));
    if (r) ids.add(r.id);
  }
  return [...ids].map(id => `<@&${id}>`).join(' ');
}

function _embed(d) {
  const p = d.paiement || {};
  const champs = [
    { name: '👤 Demandeur', value: (d.nomRP || '—').slice(0, 200), inline: false },
    { name: '🧰 Prestation', value: (d.type || '—').slice(0, 200), inline: true },
    { name: '⏳ Durée estimée', value: (p.duree || '—').slice(0, 60), inline: true },
    { name: '📍 Lieu', value: (d.lieu || '—').slice(0, 200), inline: true },
    { name: '🕐 Créneau souhaité', value: (d.creneau || '—').slice(0, 200), inline: true },
    { name: '📇 Contact', value: (p.contact || '—').slice(0, 300), inline: false },
  ];
  if (p.message) champs.push({ name: '📝 Demande', value: String(p.message).slice(0, 1000), inline: false });
  return new EmbedBuilder()
    .setColor(0xc8a45c)
    .setTitle('🌐 Nouvelle demande de rendez-vous — via le site')
    .setDescription(`**Réf.** \`${d.id}\``)
    .addFields(champs)
    .setFooter({ text: 'Iron Wolf Company · Demande via le site web' })
    .setTimestamp();
}

// Relève les nouvelles demandes web et prévient l'équipe dans #agenda.
async function verifierDemandesRdvWeb(guild) {
  let rows;
  try { rows = await lireDemandesRdvWeb(); } catch { return; }
  if (!Array.isArray(rows) || !rows.length) return;
  const salon = _salonAgenda(guild);
  const ping = salon ? _ping(guild) : '';
  for (const d of rows) {
    let livre = false;
    // 1) Notification dans le salon (agenda / fallback).
    if (salon) {
      try {
        await salon.send({
          content: `${ping ? ping + ' — ' : ''}📨 **Nouvelle demande de rendez-vous** (site web).`,
          embeds: [_embed(d)],
        });
        livre = true;
      } catch (e) { console.log('⚠️ rdv-web notif salon:', e.message); }
    } else {
      console.log('⚠️ rdv-web : aucun salon d\'agenda trouvé — repli sur le MP du fondateur.');
    }
    // 2) Dernier recours : MP au fondateur (garantit qu'une notif arrive).
    if (!livre) {
      try {
        const u = await guild.client.users.fetch(FONDATEUR_ID).catch(() => null);
        if (u) { await u.send({ content: '📨 **Nouvelle demande de rendez-vous** (site web) — *aucun salon d\'agenda trouvé sur le serveur.*', embeds: [_embed(d)] }); livre = true; }
      } catch (e) { console.log('⚠️ rdv-web notif MP fondateur:', e.message); }
    }
    if (livre) { try { await marquerRdvTransmis(d.id); } catch {} }
  }
}

module.exports = { verifierDemandesRdvWeb };
