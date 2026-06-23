// ───────────────────────────────────────────────────────────────────────────
//  ripoux.js — « Le Ripoux » : un adjoint du shérif CORROMPU à la solde de
//  La Confrérie. Il fait fuiter ce que la loi sait/prépare, annonce les primes
//  sur les têtes de la bande, suit le niveau de recherche (heat) et peut faire
//  disparaître un avis de recherche — mais plus on l'utilise, plus il devient
//  nerveux (jauge de suspicion) : trop sollicité, il se met au vert un moment.
//  ----------------------------------------------------------------------------
//   • Salon : FORUM dédié (chaque tuyau = un post/dossier).
//   • Source : CHANNEL_TRANSCRIPTION (ce qui est entendu en jeu) → fuites IA.
//   • Gratuit (pas de coût coffre), avec mécanique de risque (suspicion).
//   • Auto : 1 fuite gratuite/jour + décroissance suspicion/heat.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
let _utils = {}; try { _utils = require('./utils'); } catch { _utils = {}; }
const transcriptionHallucinee = _utils.transcriptionHallucinee || (() => false);

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

const FORUM_RIPOUX          = '1519114962738348102'; // FORUM dédié au Ripoux
const CHANNEL_TRANSCRIPTION = '1511491314351472701'; // ce qui est entendu en jeu

const SUSPICION_MAX   = 100;
const SUSPICION_SOUDO = 18;  // soutirer une info
const SUSPICION_AVIS  = 28;  // faire disparaître un avis (gros risque)
const SUSPICION_AUTO  = 6;   // fuite spontanée
const SUSPICION_DECAY = 13;  // par jour
const HEAT_DECAY      = 8;    // par jour
const SILENCE_MS      = 2 * 24 * 3600 * 1000; // 2 jours au vert

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function peutGerer(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }
function _now() { return Date.now(); }

function _ensure(db) {
  if (!db.ripoux) db.ripoux = {};
  const r = db.ripoux;
  if (typeof r.nom !== 'string' || !r.nom) r.nom = "L'Adjoint Caleb Mercer";
  if (typeof r.suspicion !== 'number') r.suspicion = 0;
  if (typeof r.silentUntil !== 'number') r.silentUntil = 0;
  if (typeof r.heat !== 'number') r.heat = 0;
  if (!Array.isArray(r.primes)) r.primes = [];
  if (typeof r.lastAutoLeakAt !== 'number') r.lastAutoLeakAt = 0;
  if (!r.panelThreadId) r.panelThreadId = null;
  return r;
}
const _clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));

// Jauge texte : [██████░░░░] 60%
function _jauge(val) {
  const v = _clamp(val, 0, 100); const plein = Math.round(v / 10);
  return `\`${'█'.repeat(plein)}${'░'.repeat(10 - plein)}\` ${v}%`;
}
function _heatLabel(h) {
  if (h < 20) return '🟢 Calme — la loi vous laisse tranquilles';
  if (h < 50) return '🟡 Surveillés — gardez profil bas';
  if (h < 80) return '🟠 Recherchés activement — prudence';
  return '🔴 Chasse à l\'homme — la corde n\'est pas loin';
}
function _estAuVert(r) { return r.silentUntil && _now() < r.silentUntil; }

function _panelEmbed(db) {
  const r = _ensure(db);
  const auVert = _estAuVert(r);
  const statut = auVert
    ? `🕳️ **Au vert** — il se fait oublier (revient le ${new Date(r.silentUntil).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })})`
    : '✅ **Joignable** — discrètement';
  const primesTxt = r.primes.length
    ? r.primes.slice(0, 8).map(p => `• **${p.cible}** — ${p.montant ? `$${Number(p.montant).toLocaleString('fr-FR')}` : 'prime inconnue'}${p.raison ? ` · *${p.raison}*` : ''}`).join('\n')
    : '*Aucun avis de recherche connu pour l\'instant.*';
  return new EmbedBuilder()
    .setColor(auVert ? 0x555555 : 0x6B4423)
    .setTitle(`🎖️ LE RIPOUX — ${r.nom}`)
    .setDescription([
      '*Un adjoint du shérif acheté par la Confrérie. Il vend ce que la loi sait… tant qu\'on ne le grille pas.*',
      '',
      statut,
    ].join('\n'))
    .addFields(
      { name: '🔥 Niveau de recherche de la bande', value: `${_jauge(r.heat)}\n${_heatLabel(r.heat)}`, inline: false },
      { name: '🫣 Nervosité de l\'indic (suspicion)', value: `${_jauge(r.suspicion)}\n${r.suspicion >= 75 ? '⚠️ *Il commence à flipper — espace les demandes.*' : '*Plus on le sollicite, plus il prend de risques.*'}`, inline: false },
      { name: `📜 Avis de recherche connus (${r.primes.length})`, value: primesTxt.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'La Confrérie • CONFIDENTIEL — à ne jamais ébruiter' })
    .setTimestamp();
}
function _panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ripoux_soudoyer').setLabel('Soutirer une info').setEmoji('🤝').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ripoux_traque').setLabel('État de la traque').setEmoji('🔥').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ripoux_prime_add').setLabel('Signaler une prime').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ripoux_avis_clear').setLabel('Faire disparaître un avis').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ripoux_config').setLabel('⚙️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// Lire la transcription récente (ce qui est entendu en jeu)
async function _lireTranscription(guild, sinceTs = 0) {
  const ch = _ch(guild, CHANNEL_TRANSCRIPTION);
  if (!ch || !ch.messages) return '';
  const fetched = await ch.messages.fetch({ limit: 90 }).catch(() => null);
  if (!fetched) return '';
  return [...fetched.values()]
    .filter(m => m.content && m.createdTimestamp > sinceTs)
    .sort((a, b) => a.createdTimestamp - b.createdTimestamp)
    .map(m => (m.content || '').replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter(l => !transcriptionHallucinee(l))
    .join('\n').slice(0, 8000);
}

// L'IA incarne le ripoux et génère une fuite côté LOI à partir de la transcription
async function _genererFuite(transcript, nom) {
  if (!ANTHROPIC_API_KEY || !transcript || transcript.length < 40) return null;
  const prompt = `Tu incarnes "${nom}", un adjoint du shérif CORROMPU, secrètement à la solde de La Confrérie — ouest de l'État du TEXAS, villes de Blackwater et Strawberry, année ~1904.

Voici une RETRANSCRIPTION de ce qui a été entendu en jeu récemment (brute, partielle) :
"""
${transcript}
"""

À partir UNIQUEMENT de cette matière (n'invente PAS d'événements absents), rédige une FUITE confidentielle adressée à la Confrérie, à la PREMIÈRE PERSONNE, ton nerveux et vénal d'un homme de loi qui trahit son camp et prend des risques. Révèle ce que la LOI sait ou prépare : patrouilles, surveillances, enquêtes, arrestations imminentes, qui a parlé au shérif, primes/avis de recherche sur des membres ou des cibles.

Réponds STRICTEMENT en JSON (aucun texte autour, aucune balise) :
{"rapport":"la fuite immersive, 3 à 6 phrases","primes":[{"cible":"nom de la personne/cible recherchée","montant":0,"raison":"motif court"}],"heatDelta":0}

- "primes" : uniquement si la transcription évoque clairement une tête mise à prix / un avis de recherche ; sinon [].
- "heatDelta" : entier de -10 à +25 — à quel point la pression de la loi sur la bande monte d'après ce qu'on entend.
- Si rien d'exploitable côté loi : {"rapport":"","primes":[],"heatDelta":0}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1200, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    let txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    txt = txt.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const obj = JSON.parse(txt);
    if (!obj || typeof obj !== 'object') return null;
    obj.primes = Array.isArray(obj.primes) ? obj.primes.filter(p => p && p.cible).slice(0, 5) : [];
    obj.heatDelta = Number(obj.heatDelta) || 0;
    obj.rapport = String(obj.rapport || '').trim();
    return obj;
  } catch (e) { console.log('❌ ripoux _genererFuite:', e.message); return null; }
}

function _fuiteEmbed(db, rapport, { auto = false } = {}) {
  const r = _ensure(db);
  return new EmbedBuilder()
    .setColor(auto ? 0x4B3621 : 0x6B4423)
    .setAuthor({ name: `🎖️ ${r.nom} — adjoint du shérif (acheté)` })
    .setTitle(auto ? '🕯️ Un mot glissé sous la porte' : '🤝 Tuyau soutiré')
    .setDescription(String(rapport || '').slice(0, 3500))
    .addFields({ name: '🔥 Niveau de recherche', value: `${_jauge(r.heat)} · ${_heatLabel(r.heat)}`, inline: false })
    .setFooter({ text: 'La Confrérie • Brûle ce papier après lecture' })
    .setTimestamp();
}

// Poste un dossier (tuyau) comme NOUVEAU post du forum
async function _posterDossier(guild, titre, embed) {
  const forum = _ch(guild, FORUM_RIPOUX);
  if (!forum || forum.type !== 15 || !forum.threads?.create) return null;
  const opts = { name: titre.slice(0, 100), message: { embeds: [embed], allowedMentions: { parse: [] } } };
  if (forum.availableTags?.length) opts.appliedTags = [forum.availableTags[0].id];
  let post = await forum.threads.create(opts).catch(() => null);
  if (!post) post = await forum.threads.create({ name: titre.slice(0, 100), message: { embeds: [embed], allowedMentions: { parse: [] } } }).catch(() => null);
  return post;
}

// Met à jour le panneau de commande (post épinglé) en place
async function _refreshPanel(guild) {
  try {
    const db = loadDB(); const r = _ensure(db);
    if (!r.panelThreadId) return;
    const th = await guild.channels.fetch(r.panelThreadId).catch(() => null);
    if (!th) return;
    const starter = await th.fetchStarterMessage().catch(() => null);
    if (starter) await starter.edit({ embeds: [_panelEmbed(db)], components: _panelRows() }).catch(() => {});
  } catch {}
}

// Applique la décroissance (suspicion + heat) — appelé par le cron quotidien
function _decay(db) {
  const r = _ensure(db);
  r.suspicion = _clamp(r.suspicion - SUSPICION_DECAY, 0, SUSPICION_MAX);
  r.heat = _clamp(r.heat - HEAT_DECAY, 0, 100);
  if (r.silentUntil && _now() >= r.silentUntil) r.silentUntil = 0;
}

// Monte la suspicion ; si elle sature → l'indic se met au vert
function _monterSuspicion(db, montant) {
  const r = _ensure(db);
  r.suspicion = _clamp(r.suspicion + montant, 0, SUSPICION_MAX);
  if (r.suspicion >= SUSPICION_MAX && !_estAuVert(r)) {
    r.silentUntil = _now() + SILENCE_MS;
    r.suspicion = 35; // il a eu chaud, il recommence plus calme
    return true; // vient de se mettre au vert
  }
  return false;
}

// ── INSTALLATION du panneau de commande dans le forum ──
async function installerPanel(guild) {
  try {
    const forum = _ch(guild, FORUM_RIPOUX);
    if (!forum || forum.type !== 15 || !forum.threads?.create) return;
    const db = loadDB(); const r = _ensure(db);
    // Déjà installé ?
    let existing = null;
    if (r.panelThreadId) existing = await guild.channels.fetch(r.panelThreadId).catch(() => null);
    if (!existing) {
      const act = await forum.threads.fetchActive().catch(() => null);
      const all = act?.threads ? [...act.threads.values()] : [];
      existing = all.find(t => (t.name || '').includes('POSTE DE COMMANDE')) || null;
    }
    if (existing) {
      r.panelThreadId = existing.id; saveDB(db);
      const starter = await existing.fetchStarterMessage().catch(() => null);
      if (starter) await starter.edit({ embeds: [_panelEmbed(db)], components: _panelRows() }).catch(() => {});
      return;
    }
    const opts = { name: '🎖️ LE RIPOUX — POSTE DE COMMANDE (ne pas supprimer)', message: { embeds: [_panelEmbed(db)], components: _panelRows() } };
    if (forum.availableTags?.length) opts.appliedTags = [forum.availableTags[0].id];
    let post = await forum.threads.create(opts).catch(() => null);
    if (!post) post = await forum.threads.create({ name: '🎖️ LE RIPOUX — POSTE DE COMMANDE (ne pas supprimer)', message: { embeds: [_panelEmbed(db)], components: _panelRows() } }).catch(() => null);
    if (post) { r.panelThreadId = post.id; saveDB(db); try { await post.pin(); } catch {} }
  } catch (e) { console.log('⚠️ ripoux installerPanel:', e.message); }
}

// ── Tick quotidien : décroissance + fuite spontanée gratuite ──
async function tickQuotidien(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      const forum = _ch(guild, FORUM_RIPOUX);
      if (!forum) continue;
      let db = loadDB(); const r = _ensure(db);
      _decay(db); saveDB(db);
      // Fuite spontanée si l'indic n'est pas au vert et qu'on a de la matière
      if (!_estAuVert(r)) {
        const transcript = await _lireTranscription(guild, _now() - 24 * 3600 * 1000);
        const fuite = await _genererFuite(transcript, r.nom);
        if (fuite && fuite.rapport) {
          db = loadDB(); const r2 = _ensure(db);
          r2.heat = _clamp(r2.heat + (fuite.heatDelta || 0), 0, 100);
          for (const p of fuite.primes) r2.primes.push({ id: `${_now()}${Math.floor(Math.random() * 1000)}`, cible: String(p.cible).slice(0, 60), montant: Number(p.montant) || 0, raison: String(p.raison || '').slice(0, 80), at: _now() });
          if (r2.primes.length > 30) r2.primes = r2.primes.slice(-30);
          _monterSuspicion(db, SUSPICION_AUTO);
          saveDB(db);
          await _posterDossier(guild, `🕯️ Mot de l'indic — ${new Date().toLocaleDateString('fr-FR')}`, _fuiteEmbed(db, fuite.rapport, { auto: true }));
        }
      }
      await _refreshPanel(guild);
    } catch (e) { console.log('⚠️ ripoux tickQuotidien:', e.message); }
  }
}

// ── ROUTAGE DES INTERACTIONS ──
async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('ripoux_')) return false;

    // 🤝 Soutirer une info (gratuit, mais monte la suspicion)
    if (interaction.isButton?.() && cid === 'ripoux_soudoyer') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      let db = loadDB(); const r = _ensure(db);
      if (_estAuVert(r)) { await interaction.reply({ content: `🕳️ *${r.nom} s'est mis au vert — il refuse tout contact pour l'instant. Laisse retomber la pression.*`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.reply({ content: `🤫 *Tu fais passer le mot à ${r.nom}… patiente quelques secondes.*`, flags: MessageFlags.Ephemeral }).catch(() => {});
      const transcript = await _lireTranscription(interaction.guild, _now() - 12 * 3600 * 1000);
      const fuite = await _genererFuite(transcript, r.nom);
      if (!fuite || !fuite.rapport) {
        await interaction.editReply({ content: `🤷 *${r.nom} n'a rien de neuf à vendre pour le moment — la loi est calme, ou rien d'exploitable n'a filtré.*` }).catch(() => {});
        return true;
      }
      db = loadDB(); const r2 = _ensure(db);
      r2.heat = _clamp(r2.heat + (fuite.heatDelta || 0), 0, 100);
      for (const p of fuite.primes) r2.primes.push({ id: `${_now()}${Math.floor(Math.random() * 1000)}`, cible: String(p.cible).slice(0, 60), montant: Number(p.montant) || 0, raison: String(p.raison || '').slice(0, 80), at: _now() });
      if (r2.primes.length > 30) r2.primes = r2.primes.slice(-30);
      const auVert = _monterSuspicion(db, SUSPICION_SOUDO);
      saveDB(db);
      const post = await _posterDossier(interaction.guild, `🤝 Tuyau — ${new Date().toLocaleDateString('fr-FR')}`, _fuiteEmbed(db, fuite.rapport));
      await _refreshPanel(interaction.guild);
      const extra = auVert ? `\n⚠️ *Il a senti le danger : il se met AU VERT un moment. Plus de contact tant que ça n'est pas retombé.*` : (fuite.primes.length ? `\n📜 ${fuite.primes.length} avis de recherche relevé(s).` : '');
      await interaction.editReply({ content: `✅ *${r2.nom} a parlé.*${post ? ` Dossier posté : <#${post.id}>` : ''}${extra}` }).catch(() => {});
      return true;
    }

    // 🔥 État de la traque
    if (interaction.isButton?.() && cid === 'ripoux_traque') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _ensure(db);
      const e = new EmbedBuilder().setColor(0x6B4423).setTitle('🔥 État de la traque')
        .addFields(
          { name: 'Niveau de recherche', value: `${_jauge(r.heat)}\n${_heatLabel(r.heat)}`, inline: false },
          { name: `Avis de recherche (${r.primes.length})`, value: (r.primes.length ? r.primes.slice(0, 12).map(p => `• **${p.cible}** — ${p.montant ? `$${Number(p.montant).toLocaleString('fr-FR')}` : '?'}${p.raison ? ` · *${p.raison}*` : ''}`).join('\n') : '*Aucun pour l\'instant.*').slice(0, 1024), inline: false },
          { name: 'Indic', value: _estAuVert(r) ? '🕳️ Au vert' : `🫣 Suspicion ${r.suspicion}%`, inline: false },
        );
      await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // 📜 Signaler une prime (ajout manuel)
    if (interaction.isButton?.() && cid === 'ripoux_prime_add') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId('ripoux_prime_modal').setTitle('📜 Signaler un avis de recherche');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Qui est recherché ?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant de la prime ($)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : 500')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Motif').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'ripoux_prime_modal') {
      const db = loadDB(); const r = _ensure(db);
      const cible = interaction.fields.getTextInputValue('cible').trim();
      const montant = parseInt((interaction.fields.getTextInputValue('montant') || '').replace(/[^0-9]/g, ''), 10) || 0;
      const raison = (interaction.fields.getTextInputValue('raison') || '').trim();
      r.primes.push({ id: `${_now()}${Math.floor(Math.random() * 1000)}`, cible: cible.slice(0, 60), montant, raison: raison.slice(0, 80), at: _now() });
      if (r.primes.length > 30) r.primes = r.primes.slice(-30);
      r.heat = _clamp(r.heat + 10, 0, 100);
      saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.reply({ content: `📜 Avis de recherche enregistré : **${cible}**${montant ? ` ($${montant.toLocaleString('fr-FR')})` : ''}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // 🧹 Faire disparaître un avis (gros risque → grosse suspicion)
    if (interaction.isButton?.() && cid === 'ripoux_avis_clear') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _ensure(db);
      if (_estAuVert(r)) { await interaction.reply({ content: `🕳️ *${r.nom} est au vert — impossible de lui demander ce genre de faveur maintenant.*`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (!r.primes.length) { await interaction.reply({ content: '✅ Aucun avis de recherche à faire disparaître.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('ripoux_avis_select').setPlaceholder('Quel dossier faire disparaître ?')
        .addOptions(r.primes.slice(0, 25).map(p => ({ label: `${p.cible}`.slice(0, 100), description: `${p.montant ? '$' + p.montant : 'prime ?'}${p.raison ? ' · ' + p.raison : ''}`.slice(0, 100), value: p.id })));
      await interaction.reply({ content: '🧹 *Faire enterrer un dossier par l\'indic — il prendra de gros risques (sa nervosité grimpera).*', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid === 'ripoux_avis_select') {
      const db = loadDB(); const r = _ensure(db);
      if (_estAuVert(r)) { await interaction.update({ content: `🕳️ *${r.nom} s'est mis au vert entre-temps.*`, components: [] }).catch(() => {}); return true; }
      const id = interaction.values[0];
      const prime = r.primes.find(p => p.id === id);
      r.primes = r.primes.filter(p => p.id !== id);
      r.heat = _clamp(r.heat - 18, 0, 100);
      const auVert = _monterSuspicion(db, SUSPICION_AVIS);
      saveDB(db);
      await _posterDossier(interaction.guild, `🧹 Dossier enterré — ${new Date().toLocaleDateString('fr-FR')}`, new EmbedBuilder().setColor(0x2E7D32).setAuthor({ name: `🎖️ ${r.nom}` }).setTitle('🧹 Un dossier a disparu').setDescription(`*« C'est fait. L'avis de recherche sur **${prime?.cible || '—'}** a disparu des registres du shérif. Mais j'ai pris un gros risque… faut que je me fasse oublier un temps. »*`).setFooter({ text: 'La Confrérie • Faveur dangereuse' }).setTimestamp());
      await _refreshPanel(interaction.guild);
      await interaction.update({ content: `✅ Avis sur **${prime?.cible || '—'}** effacé.${auVert ? `\n⚠️ *${r.nom} se met AU VERT — il a pris trop de risques.*` : ''}`, components: [] }).catch(() => {});
      return true;
    }

    // ⚙️ Config (renommer l'indic / réinitialiser la suspicion)
    if (interaction.isButton?.() && cid === 'ripoux_config') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const r = _ensure(db);
      const modal = new ModalBuilder().setCustomId('ripoux_config_modal').setTitle('⚙️ Réglages du Ripoux');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom de l\'indic').setStyle(TextInputStyle.Short).setRequired(true).setValue(r.nom).setMaxLength(60)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('reset').setLabel('Taper OUI pour calmer le jeu (suspicion=0)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('laisser vide pour ne rien réinitialiser')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'ripoux_config_modal') {
      const db = loadDB(); const r = _ensure(db);
      const nom = interaction.fields.getTextInputValue('nom').trim();
      if (nom) r.nom = nom.slice(0, 60);
      if (/^oui$/i.test((interaction.fields.getTextInputValue('reset') || '').trim())) { r.suspicion = 0; r.silentUntil = 0; }
      saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.reply({ content: `⚙️ Réglages enregistrés. Indic : **${r.nom}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 40060].includes(e?.code)) return true;
    console.log('❌ ripoux routeInteraction:', e.message);
    return true;
  }
}

module.exports = { installerPanel, tickQuotidien, routeInteraction, FORUM_RIPOUX };
