// ───────────────────────────────────────────────────────────────────────────
//  reseau.js — « Le Réseau » : des informateurs qui briefent l'organisation à
//  partir de la RETRANSCRIPTION du jeu (logiciel externe qui poste ce qui est
//  entendu en jeu dans un salon Discord).
//  ----------------------------------------------------------------------------
//   • ENTRÉE  : CHANNEL_TRANSCRIPTION  (le logiciel y pose la transcription)
//   • SORTIE  : CHANNEL_INFORMATEUR    (le bot y poste les rapports d'indics)
//   • Auto    : 2 briefs/jour (14h & 21h, Paris) — décalés des rumeurs (13h/20h)
//   • Manuel  : bouton « 📨 Faire parler les indics » (reseau_brief)
//  Différent des rumeurs : ancré sur ce qui s'est VRAIMENT passé en jeu, porté
//  par des personnages récurrents, et révèle des pistes/opportunités.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

let _utils = {}; try { _utils = require('./utils'); } catch { _utils = {}; }
const transcriptionHallucinee = _utils.transcriptionHallucinee || (() => false);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

// ⚠️ Salons (à confirmer / inverser si besoin)
const CHANNEL_TRANSCRIPTION = '1511491314351472701'; // ENTRÉE : transcription du logiciel
const CHANNEL_INFORMATEUR   = '1517785774211207288'; // SORTIE : salon informateur (briefs)

const HEURES = [14, 21]; // briefs auto (Europe/Paris)

const INFORMATEURS = {
  'La Pie':       { emoji: '🐦', lieu: 'Strawberry', couleur: 0xC8A45C },
  'Vieux Caleb':  { emoji: '🐴', lieu: 'Blackwater', couleur: 0x8B5A2A },
  "L'Adjoint":    { emoji: '🎖️', lieu: 'Blackwater', couleur: 0x6B4423 },
};

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }

// Lire la transcription récente (messages postés après `sinceTs`, jusqu'à 90 derniers)
async function _lireTranscription(guild, sinceTs = 0) {
  const ch = _ch(guild, CHANNEL_TRANSCRIPTION);
  if (!ch || !ch.messages) return '';
  const fetched = await ch.messages.fetch({ limit: 90 }).catch(() => null);
  if (!fetched) return '';
  const lignes = [...fetched.values()]
    .filter(m => m.content && m.createdTimestamp > sinceTs)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(m => (m.content || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(l => !transcriptionHallucinee(l)); // ignore le charabia halluciné par Whisper
  return lignes.join('\n').slice(0, 8000);
}

// Générer les rapports via l'IA → tableau [{informateur, rapport, piste}]
async function _genererRapports(transcript) {
  if (!ANTHROPIC_API_KEY || !transcript || transcript.length < 40) return [];
  const prompt = `Tu es "Le Réseau" d'informateurs d'Iron Wolf Company et de La Confrérie — deux organisations de l'ouest de l'État du TEXAS (forêts, ranchs, rivières ; villes principales : Blackwater et Strawberry, et leurs environs). Année ~1904.

Voici une RETRANSCRIPTION de ce qui a été entendu en jeu récemment (dialogues, événements, bruits). Elle est brute, parfois désordonnée ou partielle.

À partir UNIQUEMENT de cette matière, rédige 1 à 3 RAPPORTS d'informateurs. Personnages disponibles :
- "La Pie" : serveuse du saloon de Strawberry, commère, entend les conversations privées.
- "Vieux Caleb" : palefrenier de Blackwater, voit qui passe avec quels chevaux et diligences.
- "L'Adjoint" : homme de loi corrompu de Blackwater, au courant des affaires officielles et des primes.

Règles STRICTES :
- Ancre-toi sur ce qui a RÉELLEMENT été dit/entendu. N'invente PAS d'événements absents de la transcription.
- Ton western, immersif, à la première personne de l'informateur, en français.
- Cite les noms, lieux, convois, tensions, dettes, menaces quand ils apparaissent.
- Si la matière suggère une OPPORTUNITÉ pour IWC ou La Confrérie (cible, convoi à intercepter, contrat potentiel, dette à recouvrer), mets-la dans "piste". Sinon "piste" = "".
- Évalue la FIABILITÉ de chaque rapport selon la netteté de la source : "Bonne" (entendu clairement / vu de ses yeux), "Moyenne" (rapporté, à recouper), "Faible" (rumeur vague, ouï-dire).
- Choisis l'informateur le plus logique selon le lieu/sujet. Tu peux n'en utiliser qu'un seul si la matière est mince.
- 2 à 5 phrases par rapport, pas plus.

Réponds STRICTEMENT en JSON (aucun texte autour, aucune balise) :
[{"informateur":"La Pie","fiabilite":"Moyenne","rapport":"...","piste":""}]

Si rien d'exploitable, réponds exactement : []

RETRANSCRIPTION :
${transcript}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1400, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    let txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    txt = txt.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const arr = JSON.parse(txt);
    return Array.isArray(arr) ? arr.filter(r => r && r.rapport).slice(0, 3) : [];
  } catch (e) { console.log('❌ reseau genererRapports:', e.message); return []; }
}

function _embedRapport(r) {
  const info = INFORMATEURS[r.informateur] || { emoji: '📨', lieu: '', couleur: 0x8B5A2A };
  const fiab = String(r.fiabilite || 'Moyenne');
  const fiabTxt = /bonne/i.test(fiab) ? '🟢 Bonne' : /faible/i.test(fiab) ? '🔴 Faible' : '🟠 Moyenne';
  const e = new EmbedBuilder().setColor(info.couleur)
    .setAuthor({ name: `${info.emoji} ${r.informateur || 'Un informateur'}${info.lieu ? ` — ${info.lieu}` : ''}` })
    .setDescription(String(r.rapport || '').slice(0, 3500))
    .addFields({ name: '🎚️ Fiabilité', value: fiabTxt, inline: true })
    .setFooter({ text: 'Le Réseau • À recouper — un indic dit ce qu\'il croit avoir entendu' }).setTimestamp();
  if (r.piste && String(r.piste).trim()) e.addFields({ name: '🎯 Opportunité — piste à exploiter', value: String(r.piste).slice(0, 1000), inline: false });
  return e;
}

// Générer + poster un brief
async function genererBrief(guild, { manuel = false } = {}) {
  const out = _ch(guild, CHANNEL_INFORMATEUR);
  if (!out || !out.send) return { ok: false, raison: 'salon_sortie_introuvable' };
  const db = loadDB(); if (!db.reseau) db.reseau = {};
  const douzeH = 12 * 3600 * 1000;
  const sinceTs = manuel ? (Date.now() - douzeH) : (db.reseau.lastBriefAt || (Date.now() - douzeH));
  const transcript = await _lireTranscription(guild, sinceTs);
  if (!transcript || transcript.length < 40) {
    if (manuel) await out.send({ embeds: [new EmbedBuilder().setColor(0x555555).setDescription('🤫 *Le Réseau est silencieux — rien de neuf n\'est remonté du terrain pour l\'instant.*')] }).catch(() => {});
    return { ok: false, raison: 'rien_a_dire' };
  }
  const rapports = await _genererRapports(transcript);
  if (!rapports.length) {
    if (manuel) await out.send({ embeds: [new EmbedBuilder().setColor(0x555555).setDescription('🤫 *Les indics n\'ont rien tiré d\'intéressant de ce qui se raconte en ce moment.*')] }).catch(() => {});
    db.reseau.lastBriefAt = Date.now(); try { saveDB(db); } catch {}
    return { ok: false, raison: 'aucun_rapport' };
  }
  const entete = new EmbedBuilder().setColor(0x2B2118).setTitle('📨 Dépêche du Réseau')
    .setDescription('*Voici ce qui est remonté du terrain. À prendre avec des pincettes.*').setTimestamp();
  await out.send({ embeds: [entete] }).catch(() => {});
  for (const r of rapports) { await out.send({ embeds: [_embedRapport(r)] }).catch(() => {}); await new Promise(res => setTimeout(res, 600)); }
  db.reseau.lastBriefAt = Date.now(); try { saveDB(db); } catch {}
  return { ok: true, n: rapports.length };
}

// Panneau bouton dans le salon informateur (idempotent)
async function installerPanel(guild) {
  const ch = _ch(guild, CHANNEL_INFORMATEUR);
  if (!ch || !ch.send) return;
  const moi = guild.members.me?.id;
  const existing = await ch.messages.fetch({ limit: 30 }).catch(() => null);
  if (existing && [...existing.values()].some(m => m.author?.id === moi && m.components?.length && (m.embeds?.[0]?.title || '').includes('Réseau'))) return;
  const e = new EmbedBuilder().setColor(0x2B2118).setTitle('🕵️ Le Réseau d\'informateurs')
    .setDescription([
'Nos oreilles dans tout l\'ouest du Texas.',
      '',
      'Le Réseau remonte **automatiquement** ce qui se dit sur le terrain (2× par jour).',
      'Tu peux aussi le faire parler **à la demande** avec le bouton ci-dessous.',
    ].join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('reseau_brief').setLabel('Faire parler les indics').setEmoji('📨').setStyle(ButtonStyle.Primary),
  );
  await ch.send({ embeds: [e], components: [row] }).catch(() => {});
}

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function peutGerer(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

async function routeInteraction(interaction) {
  try {
    if (!interaction.isButton?.() || interaction.customId !== 'reseau_brief') return false;
    if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à l\'équipe.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
    await interaction.reply({ content: '📨 J\'envoie un pigeon au Réseau… (quelques secondes)', flags: MessageFlags.Ephemeral }).catch(() => {});
    const res = await genererBrief(interaction.guild, { manuel: true });
    const msg = res.ok ? `✅ ${res.n} rapport(s) posté(s) dans le salon.`
      : (res.raison === 'salon_sortie_introuvable' ? '⚠️ Salon informateur introuvable (vérifie l\'ID / les permissions).' : '🤫 Rien d\'intéressant à remonter pour l\'instant.');
    await interaction.editReply({ content: msg }).catch(() => {});
    return true;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ reseau routeInteraction:', e.message); return true; }
}

// Planification : check toutes les 20 min, poste à 14h et 21h (Paris), anti-double
let _interval = null; let _lastHour = null;
function init(client) {
  if (_interval) return;
  const tick = async () => {
    try {
      const h = parseInt(new Intl.DateTimeFormat('fr-FR', { hour: '2-digit', hour12: false, timeZone: 'Europe/Paris' }).format(new Date()), 10);
      if (!HEURES.includes(h)) { if (_lastHour !== null && !HEURES.includes(h)) _lastHour = null; return; }
      if (_lastHour === h) return;
      _lastHour = h;
      for (const g of client.guilds.cache.values()) { await genererBrief(g, { manuel: false }).catch(() => {}); }
    } catch (e) { console.log('❌ reseau tick:', e.message); }
  };
  _interval = setInterval(tick, 20 * 60 * 1000);
  console.log('✅ Le Réseau : planification active (14h & 21h)');
}

module.exports = { genererBrief, installerPanel, routeInteraction, init, CHANNEL_TRANSCRIPTION, CHANNEL_INFORMATEUR };
