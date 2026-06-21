// ───────────────────────────────────────────────────────────────────────────
//  operations.js — Centre des opérations immersif & interactif (IWC / Confrérie)
//  ----------------------------------------------------------------------------
//  Ce module NE REMPLACE PAS la machinerie d'opérations existante (boutons
//  op_participer_ / op_encours_ / op_terminee_ / op_annulee_ / op_modifier_,
//  gérés par index.js). Il REMPLACE seulement la CRÉATION (avant : taper un
//  message « OPÉRATION » dans #operations) par un vrai flux jouable :
//      panneau → type → lieu → formulaire → ORDRE D'OPÉRATION posté.
//
//  L'opération créée a EXACTEMENT la même forme que l'ancienne (mêmes champs,
//  mêmes boutons, field[0]=Statut, champ « 👥 Participants »), donc toute la
//  suite (inscription, rassemblement, lancement, débrief, Notion) fonctionne.
//
//  Identifiants ISOLÉS : « opnew » / « opnew_* » → aucune collision avec op_*.
//  Notion + journal sont INJECTÉS par index.js via init() (réutilise l'existant).
// ───────────────────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
} = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function _persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

// ── Correction orthographique automatique (IA — ne change pas le sens) ──
async function _corrigerTexte(texte) {
  const t = (texte || '').trim();
  if (t.length < 3) return t;
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return t;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, messages: [{ role: 'user', content:
        "Corrige uniquement l'orthographe, la grammaire, les accents et la ponctuation du texte ci-dessous, en francais. Ne change NI le sens, NI le style, NI le vocabulaire, NI la mise en forme. N'ajoute aucun commentaire ni guillemet. Reponds UNIQUEMENT par le texte corrige.\n\nTexte :\n" + t }] }),
    });
    if (!resp.ok) return t;
    const data = await resp.json();
    const out = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    // Garde-fou : sortie vide ou anormalement longue => on garde l'original
    if (!out || out.length > t.length * 3 + 40) return t;
    return out;
  } catch { return t; }
}

let cfg = {};
try { cfg = require('./config'); } catch { cfg = {}; }
const ROLE_LEGAL = cfg.ROLE_POLE_LEGAL || '1508756436082102303';
const ROLE_ILLEGAL = cfg.ROLE_POLE_ILLEGAL || '1508756479274913903';
const SALON_OPERATIONS = '1518349707686973470';

const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function isDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n))); } catch { return false; }
}

const COL = { or: 0xC8A45C, bleu: 0x3B82F6, rouge: 0x8B1A1A, vert: 0x2ECC71, gris: 0x555555 };

// ── Helpers injectés par index.js (Notion + journal RP) ──
let _inj = {};
function init(opts) { _inj = opts || {}; }

// ── Types d'opérations (Far West RP) — chaque type porte son pôle ──
const TYPES = {
  // ⚖️ Iron Wolf Company (légal)
  esc:   { label: '🛡️ Escorte / convoi',            pole: 'legal' },
  pro:   { label: '💂 Protection rapprochée',        pole: 'legal' },
  pat:   { label: '🐎 Patrouille / reconnaissance',  pole: 'legal' },
  secz:  { label: '🏰 Sécurisation de zone',         pole: 'legal' },
  prime: { label: '🎯 Chasse à la prime (mandat)',   pole: 'legal' },
  extr:  { label: '🔥 Extraction / sauvetage',       pole: 'legal' },
  // 🔪 La Confrérie (illégal)
  braq:  { label: '💰 Braquage (banque/train/diligence)', pole: 'illegal' },
  emb:   { label: '🔫 Embuscade',                    pole: 'illegal' },
  vol:   { label: '🐴 Vol de bétail / cargaison',    pole: 'illegal' },
  contre:{ label: '📦 Contrebande',                  pole: 'illegal' },
  ranc:  { label: '🪢 Enlèvement / rançon',          pole: 'illegal' },
  sab:   { label: '🧨 Sabotage',                     pole: 'illegal' },
  raid:  { label: '⚔️ Raid de camp',                 pole: 'illegal' },
};

// ── Lieux (toutes les villes de Red Dead) ──
const LIEUX = {
  val: '🐎 Valentine', str: '⛰️ Strawberry', rho: '🌾 Rhodes', sd: '🏙️ Saint-Denis',
  bw: '⚓ Blackwater', ann: '⛏️ Annesburg', vh: '🛶 Van Horn', tum: '🌵 Tumbleweed',
  arm: '🤠 Armadillo', emr: '🐂 Emerald Ranch', lag: '🐊 Lagras', col: '❄️ Colter',
  man: '🏕️ Manzanita Post', was: '🚉 Wallace Station', rig: '🚉 Riggs Station',
  sec: '🌫️ Un lieu tenu secret', aut: '📍 Autre (précisé dans l\'objectif)',
};

// ── Noms de code (générés si laissé vide) ──
const CN_NOM = ['Corbeau', 'Loup', 'Serpent', 'Faucon', 'Orage', 'Cheval Pâle', 'Coyote', 'Vautour', 'Tonnerre', 'Lynx', 'Aigle', 'Renard'];
const CN_ADJ = ['Rouge', 'Noir', 'Silencieux', 'Sauvage', 'Dernier', 'Sombre', 'Fauve', 'Maudit', 'Sanglant', 'Fantôme', 'Solitaire', 'de Cendres'];
function genCodeName() { return `${CN_NOM[Math.floor(Math.random() * CN_NOM.length)]} ${CN_ADJ[Math.floor(Math.random() * CN_ADJ.length)]}`; }

// ── Date / créneau (saisie libre → instant Paris), comme la prise de RDV ──
function _parisOffset(date) {
  const tz = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const utc = date.toLocaleString('en-US', { timeZone: 'UTC' });
  return Math.round((new Date(tz).getTime() - new Date(utc).getTime()) / 3600000);
}
function _slotToDate(slot) {
  try {
    const [d, t] = String(slot).split('|');
    const prov = new Date(`${d}T${t.slice(0, 2)}:${t.slice(2, 4)}:00Z`);
    return new Date(prov.getTime() - _parisOffset(prov) * 3600000);
  } catch { return null; }
}
function _parseSlot(texte) {
  const s = String(texte || '');
  const md = s.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (!md) return null;
  const jj = md[1].padStart(2, '0'); const mm = md[2].padStart(2, '0');
  let aa = md[3] || String(new Date().getFullYear()); if (aa.length === 2) aa = '20' + aa;
  if (+mm < 1 || +mm > 12 || +jj < 1 || +jj > 31) return null;
  let hh = '12', mn = '00';
  const hm = s.match(/(\d{1,2})\s*[h:]\s*(\d{1,2})?/);
  if (hm && +hm[1] <= 23) { hh = hm[1].padStart(2, '0'); mn = (hm[2] || '0').padStart(2, '0'); if (+mn > 59) mn = '00'; }
  return `${aa}-${mm}-${jj}|${hh}${mn}`;
}
const tsF = (dt) => `<t:${Math.floor(dt.getTime() / 1000)}:F>`;
const tsR = (dt) => `<t:${Math.floor(dt.getTime() / 1000)}:R>`;

function _poleRoleId(guild, pole) {
  if (typeof _inj.poleRoleId === 'function') { try { return _inj.poleRoleId(guild, pole); } catch {} }
  return pole === 'legal' ? ROLE_LEGAL : ROLE_ILLEGAL;
}
function _salonOps(guild) {
  return guild.channels.cache.get(SALON_OPERATIONS)
    || guild.channels.cache.find(c => /op[eé]rations?/i.test(c.name || ''))
    || null;
}

// ═══════════════════════════════════════════════════════════════
//  EMBED « ORDRE D'OPÉRATION » (compatible handlers op_* existants)
//  → field[0] DOIT être « Statut »  ·  un champ DOIT commencer par « 👥 Participants »
// ═══════════════════════════════════════════════════════════════
function _embedOrdre(op) {
  const t = TYPES[op.typeKey] || {};
  const dt = _slotToDate(op.quandSlot);
  const col = op.pole === 'legal' ? COL.bleu : COL.rouge;
  const e = new EmbedBuilder()
    .setColor(col)
    .setTitle(`🎯 ORDRE D'OPÉRATION — « ${op.name} »`)
    .setDescription([
      '```', ' COMMANDEMENT · IRON WOLF COMPANY ', '```',
      'Par ordre du Commandement, l\'opération ci-dessous est **ouverte aux engagements**.',
      'Tout membre concerné peut s\'enrôler avec **✋ Je participe**.',
    ].join('\n'))
    .addFields(
      { name: 'Statut', value: '🟡 En préparation', inline: true },
      { name: 'Pôle', value: op.pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 La Confrérie', inline: true },
      { name: '🎯 Type', value: t.label || 'Opération', inline: true },
      { name: '🤠 Organisé par', value: op.createurId ? `<@${op.createurId}>` : (op.createurNom || '—'), inline: true },
      { name: '📍 Lieu', value: op.lieu || '—', inline: true },
      { name: '🕐 Quand', value: dt ? `${tsF(dt)}\n${tsR(dt)}` : (op.quandTexte ? `*${op.quandTexte}* (à fixer)` : '*À définir*'), inline: true },
      ...(op.butin ? [{ name: '💰 Butin / prime visé', value: op.butin, inline: true }] : []),
      { name: '📋 Objectif', value: (op.objectif || '—').slice(0, 1000), inline: false },
      ...(op.briefing ? [{ name: '📜 Briefing', value: op.briefing.slice(0, 1000), inline: false }] : []),
      { name: '👥 Participants (0)', value: '*Personne pour l\'instant. Clique « ✋ Je participe » ci-dessous.*', inline: false },
    )
    .setFooter({ text: `Réf. ${op.id} • Iron Wolf Company` })
    .setTimestamp();
  return e;
}
function _boutons(op) {
  const rowP = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary),
  );
  const rowG = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
  );
  const rowM = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_modifier_${op.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary),
  );
  return [rowP, rowG, rowM];
}

// ═══════════════════════════════════════════════════════════════
//  PANNEAU (auto-posté par index.js, idempotent)
// ═══════════════════════════════════════════════════════════════
async function postPanel(channel) {
  if (!channel) return null;
  try {
    const recent = await channel.messages.fetch({ limit: 30 });
    for (const m of recent.values()) {
      if (m.author.id === channel.client.user.id && (m.embeds[0]?.title || '').includes('CENTRE DES OPÉRATIONS')) {
        await m.unpin?.().catch(() => {});
        await m.delete().catch(() => {});
      }
    }
  } catch {}
  const embed = new EmbedBuilder().setColor(COL.or)
    .setTitle('🎯 CENTRE DES OPÉRATIONS — IRON WOLF COMPANY')
    .setDescription([
      '*Ici se planifient les opérations de la Compagnie et de la Confrérie.*',
      '',
      '**La Direction** clique ci-dessous pour ouvrir un **ordre d\'opération** :',
      '→ type de mission → lieu → objectif, créneau, butin visé.',
      '',
      'Les membres concernés pourront alors **s\'enrôler**, puis l\'opération sera **lancée** et **débriefée**.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Commandement' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('opnew').setLabel('🎯 Planifier une opération').setStyle(ButtonStyle.Primary),
  );
  return channel.send({ embeds: [embed], components: [row] }).catch(() => null);
}

// ═══════════════════════════════════════════════════════════════
//  COMMANDE
// ═══════════════════════════════════════════════════════════════
const operationsCommands = [
  new SlashCommandBuilder().setName('operation').setDescription('🎯 Planifier une opération (Direction)'),
  new SlashCommandBuilder().setName('panel-operations').setDescription('🎯 (Ré)installer le panneau des opérations (Direction)'),
];

function _menuType() {
  return new StringSelectMenuBuilder().setCustomId('opnew_type').setPlaceholder('1️⃣ Type de mission')
    .addOptions(Object.entries(TYPES).map(([k, v]) => ({
      label: v.label.slice(0, 100),
      value: k,
      description: v.pole === 'legal' ? '⚖️ Iron Wolf Company' : '🔪 La Confrérie',
    })));
}

// ═══════════════════════════════════════════════════════════════
//  ROUTEUR D'INTERACTIONS
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    // Commandes
    if (interaction.isChatInputCommand?.()) {
      if (interaction.commandName === 'panel-operations') {
        if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const ch = _salonOps(interaction.guild) || interaction.channel;
        await postPanel(ch);
        await interaction.reply({ content: '✅ Panneau des opérations (ré)installé.', flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      if (interaction.commandName === 'operation') {
        if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await interaction.reply({ content: '🎯 **Nouvelle opération** — étape 1/2 : le type de mission.', components: [new ActionRowBuilder().addComponents(_menuType())], flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
    }

    // Bouton du panneau
    if (interaction.isButton?.() && interaction.customId === 'opnew') {
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Seule la Direction peut planifier une opération.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.reply({ content: '🎯 **Nouvelle opération** — étape 1/2 : le type de mission.', components: [new ActionRowBuilder().addComponents(_menuType())], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // Type choisi → lieu
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'opnew_type') {
      const typeKey = interaction.values[0];
      const sel = new StringSelectMenuBuilder().setCustomId(`opnew_lieu::${typeKey}`).setPlaceholder('2️⃣ Lieu de l\'opération')
        .addOptions(Object.entries(LIEUX).map(([k, v]) => ({ label: v, value: k })));
      await interaction.update({ content: `🎯 Type : **${TYPES[typeKey]?.label || typeKey}** — étape 2/2 : le lieu, puis un court formulaire.`, components: [new ActionRowBuilder().addComponents(sel)] }).catch(() => {});
      return true;
    }

    // Lieu choisi → formulaire
    if (interaction.isStringSelectMenu?.() && interaction.customId?.startsWith('opnew_lieu::')) {
      const typeKey = interaction.customId.split('::')[1];
      const lieuKey = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`opnew_modal::${typeKey}::${lieuKey}`).setTitle('🎯 Ordre d\'opération');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('code').setLabel('Nom de code (vide = généré)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(50).setPlaceholder('Ex : Corbeau Rouge')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objectif').setLabel('Objectif de la mission').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setPlaceholder('Ex : intercepter le convoi près de Rhodes')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quand').setLabel('Quand ? (jour + heure)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder('Ex : 22/06 à 21h')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('butin').setLabel('Butin / prime visé (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Ex : 3000$ + cargaison')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('briefing').setLabel('Briefing / consignes (facultatif)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900).setPlaceholder('Plan, rôles, point de ralliement, infos utiles…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    // Formulaire soumis → création + ORDRE D'OPÉRATION
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('opnew_modal::')) {
      // Nettoyage : on transforme le menu éphémère existant en confirmation (au lieu d'en empiler un nouveau)
      if (interaction.isFromMessage?.()) await interaction.update({ content: '⏳ Création de l\'opération en cours (correction du texte…)', components: [], embeds: [] }).catch(() => {});
      else await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const [, typeKey, lieuKey] = interaction.customId.split('::');
      const t = TYPES[typeKey] || { pole: 'legal' };
      const code = (interaction.fields.getTextInputValue('code') || '').trim() || genCodeName();
      const quand = (interaction.fields.getTextInputValue('quand') || '').trim();
      // Correction orthographique automatique (objectif, butin, briefing — pas le nom de code ni la date)
      const [objectifC, butin, briefing] = await Promise.all([
        _corrigerTexte((interaction.fields.getTextInputValue('objectif') || '').trim()),
        _corrigerTexte((interaction.fields.getTextInputValue('butin') || '').trim()),
        _corrigerTexte((interaction.fields.getTextInputValue('briefing') || '').trim()),
      ]);
      const objectif = objectifC || '—';

      const op = {
        id: Date.now().toString(),
        name: code,
        lieu: LIEUX[lieuKey] || lieuKey,
        objectif,
        equipe: '—',
        pole: t.pole,
        participants: [],
        status: 'preparation',
        createdAt: new Date().toISOString(),
        createurId: interaction.user?.id || null,
        createurNom: interaction.member?.displayName || interaction.user?.username || 'Inconnu',
        // extras immersifs (ignorés par l'ancien système, sans risque)
        typeKey,
        quandSlot: _parseSlot(quand),
        quandTexte: quand,
        butin,
        briefing,
      };

      const db = loadDB();
      if (!db.operations) db.operations = [];
      db.operations.push(op);

      // Notion (réutilise la fonction existante injectée par index.js)
      try { if (typeof _inj.creerOperationNotion === 'function') op.notionPageId = await _inj.creerOperationNotion(op); } catch {}
      _persist(db);

      // Poster l'ordre d'opération (gère salon TEXTE et salon FORUM)
      const opsCh = _salonOps(interaction.guild) || interaction.channel;
      const rid = _poleRoleId(interaction.guild, op.pole);
      const coordTxt = `🎯 **${op.name}** — espace de coordination.\n\nTout le monde peut **ajouter ici ses infos complémentaires** : repérages, plan, rôles, horaires, comptes-rendus… On s'organise dans ce fil, le salon reste propre.`;
      const payloadMsg = {
        content: `${rid ? `<@&${rid}> — ` : ''}🎯 Nouvel **ordre d'opération** : « **${op.name}** ». Inscrivez-vous via **✋ Je participe**.`,
        embeds: [_embedOrdre(op)],
        components: _boutons(op),
        allowedMentions: { roles: rid ? [rid] : [] },
      };
      let sent = null;
      try {
        if (opsCh && opsCh.type === 15 && opsCh.threads?.create) {
          // Salon FORUM → créer un post (le post est lui-même le fil de contribution)
          const post = await opsCh.threads.create({ name: `🎯 ${op.name}`.slice(0, 100), message: payloadMsg }).catch(() => null);
          if (post) {
            op.channelId = post.id; op.threadId = post.id;
            const starter = await post.fetchStarterMessage().catch(() => null);
            if (starter) { op.msgId = starter.id; await starter.pin().catch(() => {}); }
            sent = starter || post;
            await post.send({ content: coordTxt }).catch(() => {});
          }
        } else if (opsCh && typeof opsCh.send === 'function') {
          // Salon TEXTE → message épinglé + fil de contribution
          sent = await opsCh.send(payloadMsg).catch(() => null);
          if (sent) {
            op.channelId = opsCh.id; op.msgId = sent.id;
            await sent.pin().catch(() => {});
            if (!sent.hasThread) {
              const fil = await sent.startThread({ name: `🎯 ${op.name}`.slice(0, 100), autoArchiveDuration: 10080 }).catch(() => null);
              if (fil) { op.threadId = fil.id; await fil.send({ content: coordTxt }).catch(() => {}); }
            }
          }
        }
      } catch (e) { console.log('⚠️ post opération:', e.message); }
      if (sent) _persist(db);

      // Journal RP + log (réutilise les hooks injectés)
      try { if (typeof _inj.journalHook === 'function') await _inj.journalHook(interaction.guild, op); } catch {}

      if (sent) await interaction.editReply({ content: `✅ Opération « **${op.name}** » ouverte dans <#${opsCh.id}> (réf. \`${op.id}\`).` }).catch(() => {});
      else await interaction.editReply({ content: `⚠️ L'opération « **${op.name}** » est créée (réf. \`${op.id}\`) mais je n'ai pas pu la poster dans <#${opsCh.id}> — ce salon n'accepte peut-être pas les messages (une **catégorie** ?). Indique-moi un salon **texte** ou **forum** valide.` }).catch(() => {});
      return true;
    }
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true; // clic trop tardif / message disparu / déjà traité
    console.log('❌ operations routeInteraction error:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
  return false;
}

module.exports = { init, routeInteraction, postPanel, operationsCommands };
