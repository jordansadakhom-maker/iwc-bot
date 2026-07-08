// ───────────────────────────────────────────────────────────────────────────
//  recap-hebdo.js — Récap d'activité hebdomadaire (Direction)
//  ----------------------------------------------------------------------------
//   • Chaque semaine (dimanche ~20 h), poste dans le salon Direction un résumé :
//     saloon (meilleurs joueurs), absences en cours, opérations, pépites.
//   • « !recap » (Direction) → poste le récap à la demande.
//   • Additif et isolé : lit la base, n'écrit que db.recapHebdo (anti-doublon).
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }

const SALON_RECAP = '1518042088879423640'; // #dashboard / tableau de bord (Direction)
const DIRECTION = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estGestion(member) { try { return !!member?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n))); } catch { return false; } }

function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
function _nom(guild, userId, fallback) {
  try { const m = guild.members.cache.get(userId); if (m) return m.displayName || m.user?.username; } catch {}
  return fallback || `Membre ${String(userId).slice(-4)}`;
}
// Numéro de semaine ISO (pour ne poster qu'une fois par semaine).
function _semaineISO(d) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const jour = t.getUTCDay() || 7; t.setUTCDate(t.getUTCDate() + 4 - jour);
  const an = t.getUTCFullYear();
  const sem = Math.ceil((((t - new Date(Date.UTC(an, 0, 1))) / 86400000) + 1) / 7);
  return `${an}-S${String(sem).padStart(2, '0')}`;
}

// Construit l'embed du récap à partir de la base.
function genererRecap(guild) {
  const db = loadDB();
  const e = new EmbedBuilder().setColor(0xB8860B).setTitle('📅 RÉCAP DE LA SEMAINE')
    .setDescription('*Photo de l\'activité de la compagnie. Bon travail à tous.* 🤠')
    .setFooter({ text: 'Iron Wolf Company • récap hebdomadaire' }).setTimestamp();

  // — Saloon : meilleurs joueurs (soldes de jetons) —
  let saloon = '_Personne n\'a joué pour l\'instant._';
  try {
    const top = (casino.classement?.(3) || []).filter(([, m]) => m);
    if (top.length) saloon = top.map(([uid, m], i) => `${['🥇', '🥈', '🥉'][i] || '•'} **${_nom(guild, uid)}** — ${_money(m)}`).join('\n');
  } catch {}
  e.addFields({ name: '🎰 Saloon — meilleurs joueurs', value: saloon.slice(0, 1024), inline: false });

  // — Absences en cours —
  try {
    const absents = Object.values(db.members || {}).filter(m => m && m.status === 'absent');
    const val = absents.length
      ? `**${absents.length}** en cours : ` + absents.slice(0, 10).map(m => m.name || 'Inconnu').join(', ') + (absents.length > 10 ? '…' : '')
      : 'Aucune absence en cours. ✅';
    e.addFields({ name: '🌙 Absences', value: val.slice(0, 1024), inline: false });
  } catch {}

  // — Opérations —
  try {
    const ops = db.operations || [];
    const enCours = ops.filter(o => o.status === 'en_cours').length;
    const prep = ops.filter(o => o.status === 'preparation').length;
    const finies = ops.filter(o => o.status === 'terminee').length;
    e.addFields({ name: '🎯 Opérations', value: `🟢 En cours : **${enCours}**\n🟡 En préparation : **${prep}**\n✅ Terminées (total) : **${finies}**`, inline: true });
  } catch {}

  // — Pépites —
  try {
    const p = db.pepites || {};
    const tops = Object.entries(p.parPersonne || {}).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]).slice(0, 3);
    const lead = tops.length ? tops.map(([uid, n], i) => `${['🥇', '🥈', '🥉'][i] || '•'} ${_nom(guild, uid)} — ${n}`).join('\n') : '_Aucun ramasseur._';
    e.addFields({ name: `💰 Pépites (total : ${p.total || 0})`, value: lead.slice(0, 1024), inline: true });
  } catch {}

  return e;
}

async function _poster(guild) {
  try {
    const ch = guild.channels.cache.get(SALON_RECAP) || await guild.channels.fetch(SALON_RECAP).catch(() => null);
    if (!ch?.send) return false;
    await ch.send({ embeds: [genererRecap(guild)] });
    return true;
  } catch { return false; }
}

// Vérifie l'heure : dimanche ~20 h → poste une fois par semaine (anti-doublon en base).
async function _tick(client) {
  try {
    const guild = client.guilds.cache.first();
    if (!guild) return;
    const now = new Date();
    if (now.getUTCDay() !== 0 || now.getUTCHours() !== 20) return; // dimanche 20 h UTC
    const db = loadDB();
    if (!db.recapHebdo || typeof db.recapHebdo !== 'object') db.recapHebdo = {};
    const sem = _semaineISO(now);
    if (db.recapHebdo.derniereSemaine === sem) return; // déjà posté cette semaine
    if (await _poster(guild)) { db.recapHebdo.derniereSemaine = sem; saveDB(db); console.log('📅 Récap hebdo posté :', sem); }
  } catch (e) { console.log('⚠️ recap-hebdo tick:', e.message); }
}

// Commande texte « !recap » (Direction) → poste le récap tout de suite.
async function commande(message) {
  try {
    if (!message?.guild || message.author?.bot) return false;
    if (!/^!recap\b/i.test((message.content || '').trim())) return false;
    if (!estGestion(message.member)) { await message.reply({ content: '❌ Réservé à la Direction.', allowedMentions: { parse: [] } }).catch(() => {}); return true; }
    await message.reply({ embeds: [genererRecap(message.guild)], allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } catch { return false; }
}

function demarrer(client) {
  try { setInterval(() => { _tick(client).catch(() => {}); }, 30 * 60 * 1000); } catch {} // vérifie toutes les 30 min
  console.log('📅 Récap hebdo armé (dimanche 20 h)');
}

module.exports = { demarrer, commande, genererRecap, _test: { _semaineISO } };
