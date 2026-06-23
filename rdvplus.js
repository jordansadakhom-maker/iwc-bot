// ───────────────────────────────────────────────────────────────────────────
//  rdvplus.js — Prise de rendez-vous enrichie & jouable (IWC / La Confrérie)
//  ISOLÉ : identifiants « rdvp_* » uniquement → aucune collision avec le flux
//  télégramme actuel (rdvclient_*), qui reste 100% fonctionnel en secours.
//  Tout est enveloppé en try/catch : un souci ici ne peut pas bloquer le reste.
//  Synchronisé avec la MÊME base Notion (mêmes propriétés) → les rappels équipe
//  et l'agenda existants prennent automatiquement en compte ces RDV.
// ───────────────────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, ModalBuilder, TextInputBuilder,
  TextInputStyle, MessageFlags, AttachmentBuilder,
} = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function _persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

// ── Config (avec valeurs de repli sûres) ──
const SALON_DEMANDES = '1512171267560702013';
const SALON_AGENDA = '1509638226132996178';          // #agenda (légal)
const SALON_AGENDA_ILLEGAL = '1510956171958161528';  // #agenda-illégal
const GESTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Opérateur', 'Operateur', 'Secrétaire', 'Secretaire'];
const OPERATEUR_ROLES = ['Opérateur', 'Operateur', 'Secrétaire', 'Secretaire'];

const COL = { or: 0xC8A45C, sepia: 0x8B5A2A, vert: 0x2ECC71, rouge: 0xC0392B, orange: 0xE67E22, bleu: 0x5865F2, gris: 0x555555 };

const TYPES = {
  esc: { label: '🛡️ Escorte de personne', illegal: false },
  cnv: { label: '🚂 Escorte de convoi / diligence', illegal: false },
  pro: { label: '💂 Protection rapprochée', illegal: false },
  sec: { label: '🏠 Sécurisation d\'un lieu', illegal: false },
  enq: { label: '🔍 Enquête / filature', illegal: false },
  neg: { label: '🤝 Négociation / médiation', illegal: false },
  rec: { label: '💰 Récupération de biens / dette', illegal: false },
  bnt: { label: '🪙 Chasse à la prime (sur mandat)', illegal: false },
  trv: { label: '🗡️ Travail discret', illegal: true },
};
const LIEUX = {
  val: '🐎 Valentine',
  str: '⛰️ Strawberry',
  rho: '🌾 Rhodes',
  sd:  '🏙️ Saint-Denis',
  bw:  '⚓ Blackwater',
  ann: '⛏️ Annesburg',
  vh:  '🛶 Van Horn',
  tum: '🌵 Tumbleweed',
  arm: '🤠 Armadillo',
  emr: '🐂 Emerald Ranch',
  lag: '🐊 Lagras',
  col: '❄️ Colter',
  man: '🏕️ Manzanita Post',
  was: '🚉 Wallace Station',
  rig: '🚉 Riggs Station',
  dsc: '🌫️ Un lieu discret',
  aut: '📍 Autre (précisé dans les détails)',
};

// ── Helpers généraux ──
const ref = () => `RDV-${Date.now().toString().slice(-5)}`;
const fmtDate = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtHeure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const peutGerer = (member) => !!member?.roles?.cache?.some(r => GESTION_ROLES.some(n => r.name.includes(n)));

function _store(db) { if (!db.rdvplus) db.rdvplus = { rdvs: {}, clients: {} }; if (!db.rdvplus.rdvs) db.rdvplus.rdvs = {}; if (!db.rdvplus.clients) db.rdvplus.clients = {}; return db.rdvplus; }

function _salonDemandes(guild) {
  return guild.channels.cache.get(SALON_DEMANDES)
    || guild.channels.cache.find(c => c.isTextBased?.() && /demande|rendez|t[ée]l[ée]gramme/i.test(c.name))
    || null;
}
// Tous les RDV vont dans le MÊME salon #agenda (plus de séparation légal/illégal)
function _salonAgenda(guild, illegal) {
  return guild.channels.cache.get(SALON_AGENDA)
    || guild.channels.cache.find(c => c.isTextBased?.() && /agenda|planning/i.test(c.name))
    || _salonDemandes(guild);
}
// Agenda : on prévient le Panseur, les Officiers de Terrain et les Fondateurs dès qu'un RDV arrive.
const AGENDA_PING_ROLES = ['Panseur', 'Officier de Terrain', 'Officier', 'Fondateur'];
function _pingOperateur(guild) {
  const ids = new Set();
  for (const motif of AGENDA_PING_ROLES) {
    const r = guild.roles.cache.find(x => x.name.includes(motif));
    if (r) ids.add(r.id);
  }
  return [...ids].map(id => `<@&${id}>`).join(' ');
}

// ── Dates / créneaux (heure de Paris, comme le reste du bot) ──
function _parisOffset(date) {
  const tz = date.toLocaleString('en-US', { timeZone: 'Europe/Paris' });
  const utc = date.toLocaleString('en-US', { timeZone: 'UTC' });
  return Math.round((new Date(tz).getTime() - new Date(utc).getTime()) / 3600000);
}
function _slotToDate(slot) { // "YYYY-MM-DD|HHMM"
  try {
    const [d, t] = String(slot).split('|');
    const hh = t.slice(0, 2), mm = t.slice(2, 4);
    const prov = new Date(`${d}T${hh}:${mm}:00Z`);
    return new Date(prov.getTime() - _parisOffset(prov) * 3600000);
  } catch { return null; }
}
// Convertit une saisie libre (« 20/06 à 21h », « le 3/07 vers 14h30 ») en créneau "YYYY-MM-DD|HHMM".
// Renvoie null si aucune date claire n'est trouvée (on garde alors le texte tel quel comme « souhait »).
function _parseSlot(texte) {
  const s = String(texte || '');
  const md = s.match(/(\d{1,2})[\/\-.](\d{1,2})(?:[\/\-.](\d{2,4}))?/);
  if (!md) return null;
  const jj = md[1].padStart(2, '0');
  const mm = md[2].padStart(2, '0');
  let aa = md[3] || String(new Date().getFullYear());
  if (aa.length === 2) aa = '20' + aa;
  if (+mm < 1 || +mm > 12 || +jj < 1 || +jj > 31) return null;
  let hh = '12', mn = '00';
  const hm = s.match(/(\d{1,2})\s*[h:]\s*(\d{1,2})?/);
  if (hm && +hm[1] <= 23) { hh = hm[1].padStart(2, '0'); mn = (hm[2] || '0').padStart(2, '0'); if (+mn > 59) mn = '00'; }
  return `${aa}-${mm}-${jj}|${hh}${mn}`;
}
const tsF = (dt) => `<t:${Math.floor(dt.getTime() / 1000)}:F>`;
const tsR = (dt) => `<t:${Math.floor(dt.getTime() / 1000)}:R>`;

// ── Notion (même base, propriétés existantes) ──
async function _notionCreer(rdv) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return null;
  try {
    const dt = _slotToDate(rdv.slot) || new Date();
    const heure = dt.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    const typeLabel = TYPES[rdv.typeKey]?.label || 'Rendez-vous';
    const lieuLabel = LIEUX[rdv.lieuKey] || rdv.lieuKey || '—';
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: {
        'Titre':  { title: [{ text: { content: `${typeLabel} — ${rdv.nomRP}`.slice(0, 100) } }] },
        'Date':   { date: { start: dt.toISOString() } },
        'Heure':  { rich_text: [{ text: { content: heure } }] },
        'Type':   { select: { name: '🤝 Rendez-vous Client' } },
        'Pôle':   { select: { name: TYPES[rdv.typeKey]?.illegal ? '🔒 Illégal' : '⚖️ Légal' } },
        'Lieu':   { rich_text: [{ text: { content: `${lieuLabel}${rdv.contactId ? '\n📇 ID Discord : ' + rdv.contactId : ''}${!_slotToDate(rdv.slot) && rdv.souhaitTexte ? '\n🕐 Souhait : ' + rdv.souhaitTexte : ''}${rdv.details ? '\n' + rdv.details : ''}`.slice(0, 2000) } }] },
        'Statut': { select: { name: 'Planifié' } },
        // Les rappels des RDV clients sont gérés par checkRappelsClients (MP au client).
        // On laisse ces cases décochées pour éviter que checkAgenda ne re-notifie en double dans #agenda.
        'Notif 24h':   { checkbox: false },
        'Notif 1h':    { checkbox: false },
        'Notif 15min': { checkbox: false },
      } }),
    });
    if (res.ok) { const d = await res.json().catch(() => ({})); return d.id || null; }
    const d = await res.json().catch(() => ({})); console.log('[RDV+] Notion créer:', (d.message || '').slice(0, 160));
    return null;
  } catch (e) { console.log('[RDV+] Notion créer erreur:', e?.message); return null; }
}
async function _notionStatut(notionId, statut) {
  if (!notionId || !process.env.NOTION_TOKEN) return;
  try {
    await fetch(`https://api.notion.com/v1/pages/${notionId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { 'Statut': { select: { name: statut } } } }),
    });
  } catch (e) { console.log('[RDV+] Notion statut erreur:', e?.message); }
}
async function _notionDate(notionId, slot) {
  if (!notionId || !process.env.NOTION_TOKEN) return;
  try {
    const dt = _slotToDate(slot) || new Date();
    const heure = dt.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    await fetch(`https://api.notion.com/v1/pages/${notionId}`, {
      method: 'PATCH',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ properties: { 'Date': { date: { start: dt.toISOString() } }, 'Heure': { rich_text: [{ text: { content: heure } }] } } }),
    });
  } catch (e) { console.log('[RDV+] Notion date erreur:', e?.message); }
}

// ── Embeds ──
const STATUT_INFO = {
  'Planifié':  { icone: '📨', couleur: COL.or,     texte: 'Reçu — en attente de confirmation' },
  'Confirmé':  { icone: '📅', couleur: COL.bleu,   texte: 'Confirmé' },
  'Honoré':    { icone: '✅', couleur: COL.vert,   texte: 'Honoré' },
  'Lapin':     { icone: '👻', couleur: COL.gris,   texte: 'Client absent (lapin)' },
  'Annulé':    { icone: '🚫', couleur: COL.gris,   texte: 'Annulé' },
  'Décliné':   { icone: '❌', couleur: COL.rouge,  texte: 'Décliné' },
};
function _embedRdv(rdv) {
  const dt = _slotToDate(rdv.slot);
  const typeLabel = TYPES[rdv.typeKey]?.label || 'Rendez-vous';
  const lieuLabel = LIEUX[rdv.lieuKey] || rdv.lieuKey || '—';
  const si = STATUT_INFO[rdv.statut] || STATUT_INFO['Planifié'];
  const e = new EmbedBuilder().setColor(si.couleur)
    .setTitle('✉  TÉLÉGRAMME — DEMANDE DE RENDEZ-VOUS')
    .setDescription([
      '```',
      ' WESTERN UNION · IRON WOLF COMPANY ',
      '```',
      `**Réf.** \`${rdv.id}\` · ${si.icone} **${si.texte}**`,
    ].join('\n'))
    .addFields(
      { name: '👤 Demandeur', value: `${rdv.nomRP}${rdv.clientId ? ` (<@${rdv.clientId}>)` : ''}`, inline: false },
      { name: '🧰 Prestation', value: typeLabel, inline: true },
      { name: '📍 Lieu', value: lieuLabel, inline: true },
      { name: '🕐 Créneau', value: dt ? `${tsF(dt)}\n${tsR(dt)}` : (rdv.souhaitTexte ? `*Souhait : ${rdv.souhaitTexte}* (à fixer)` : '—'), inline: false },
      { name: '📇 Contact (pour le contrat)', value: `<@${rdv.contactId || rdv.clientId}> · ID : \`${rdv.contactId || rdv.clientId}\``, inline: false },
      ...(rdv.agentId ? [{ name: '🤝 Agent assigné', value: `<@${rdv.agentId}>`, inline: true }] : []),
      ...(rdv.details ? [{ name: '📝 Détails', value: rdv.details.slice(0, 1000), inline: false }] : []),
    )
    .setFooter({ text: `Iron Wolf Company · Bureau des Rendez-vous` })
    .setTimestamp();
  if (rdv.photo) e.setImage(rdv.photo);
  return e;
}
function _boutonsTelegramme(rdv) {
  // Phase « en attente » vs « confirmé »
  if (rdv.statut === 'Confirmé') {
    return [
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rdvp_honored::${rdv.id}`).setLabel('✅ Honoré').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId(`rdvp_noshow::${rdv.id}`).setLabel('👻 Lapin (absent)').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rdvp_reschedule::${rdv.id}`).setLabel('🔁 Reprogrammer').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId(`rdvp_cancel::${rdv.id}`).setLabel('🚫 Annuler').setStyle(ButtonStyle.Danger),
      ),
      new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rdvp_assign::${rdv.id}`).setLabel('👤 Assigner un agent').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId(`rdvp_reply::${rdv.id}`).setLabel('💬 Répondre au client').setStyle(ButtonStyle.Secondary),
      ),
    ];
  }
  if (rdv.statut === 'Honoré') {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rdvp_contrat::${rdv.id}`).setLabel('📜 Établir le contrat').setStyle(ButtonStyle.Primary),
    )];
  }
  if (['Annulé', 'Décliné', 'Lapin'].includes(rdv.statut)) return []; // clôturé
  // En attente
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rdvp_confirm::${rdv.id}`).setLabel('✅ Confirmer le RDV').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rdvp_assign::${rdv.id}`).setLabel('👤 Assigner un agent').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`rdvp_reply::${rdv.id}`).setLabel('💬 Répondre').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rdvp_decline::${rdv.id}`).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger),
    ),
  ];
}

// Met à jour le message du télégramme dans le salon
async function _rafraichirTelegramme(client, rdv) {
  try {
    if (!rdv.channelId || !rdv.msgId) return;
    const ch = await client.channels.fetch(rdv.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(rdv.msgId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {});
  } catch {}
}

// MP au client (accusé, confirmation, etc.)
async function _mpClient(client, clientId, contenu, embed) {
  try { const u = await client.users.fetch(clientId); await u.send(embed ? { content: contenu, embeds: [embed] } : { content: contenu }); return true; }
  catch { return false; }
}

// Dossier client
function _majDossier(store, rdv, champ) {
  if (!rdv.clientId) return;
  const c = store.clients[rdv.clientId] || { nomRP: rdv.nomRP, total: 0, honored: 0, noshow: 0, derniers: [] };
  c.nomRP = rdv.nomRP || c.nomRP;
  if (champ) c[champ] = (c[champ] || 0) + 1;
  store.clients[rdv.clientId] = c;
}

// ───────────────────────── Commandes ─────────────────────────
const rdvplusCommands = [
  new SlashCommandBuilder().setName('panel-rdv-plus').setDescription('📅 Installer le NOUVEAU panneau de prise de RDV (immersif) — Direction'),
  new SlashCommandBuilder().setName('agenda-plus').setDescription('📅 Voir les rendez-vous à venir (vue enrichie)'),
  new SlashCommandBuilder().setName('dossier-client').setDescription('🗂️ Consulter le dossier RDV d\'un client')
    .addUserOption(o => o.setName('membre').setDescription('Le client (s\'il est sur le serveur)').setRequired(false))
    .addStringOption(o => o.setName('id').setDescription('Ou son ID Discord').setRequired(false)),
];

// Panneau « Besoin de nos services » (réserver une prestation) — builder réutilisable
function panelPayload() {
  const embed = new EmbedBuilder().setColor(COL.or)
    .setTitle('🤠  IRON WOLF COMPANY  🐺')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║    🤝  BESOIN DE NOS SERVICES  🤝   ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Un besoin précis ? Protection, escorte, enquête, négociation… ou un travail plus discret ?*',
      '',
      '🤝 Clique sur **« Besoin de nos services »** : tu choisis la **prestation**, le **lieu** et un **créneau** qui t\'arrange.',
      'La Direction confirme ton rendez-vous, et tu reçois un **télégramme de confirmation**.',
      '',
      '*(Tu préfères juste nous exposer ton affaire librement ? Utilise « 📨 Contacter la compagnie » au-dessus.)*',
      '',
      '— *« La force est dans l\'ombre. »*',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Bureau de Saint-Denis' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rdvp_book').setLabel('Besoin de nos services').setEmoji('🤝').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [embed], components: [row] };
}

// ───────────────────────── Routeur d'interactions ─────────────────────────
async function routeInteraction(interaction) {
  try {
    // ===== COMMANDES =====
    if (interaction.isChatInputCommand?.()) {
      const cmd = interaction.commandName;

      if (cmd === 'panel-rdv-plus') {
        if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const salon = _salonDemandes(interaction.guild) || interaction.channel;
        await salon.send(panelPayload()).catch(() => {});
        await interaction.reply({ content: `✅ Nouveau panneau de RDV installé dans ${salon}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }

      if (cmd === 'agenda-plus') {
        if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const store = _store(loadDB());
        const list = Object.values(store.rdvs)
          .filter(r => ['Planifié', 'Confirmé'].includes(r.statut))
          .map(r => ({ r, dt: _slotToDate(r.slot) }))
          .filter(x => x.dt && x.dt.getTime() > Date.now() - 3600000)
          .sort((a, b) => a.dt - b.dt)
          .slice(0, 12);
        if (!list.length) { await interaction.editReply({ content: '📭 Aucun rendez-vous à venir.' }).catch(() => {}); return true; }
        const lignes = list.map(({ r, dt }) => {
          const si = STATUT_INFO[r.statut] || STATUT_INFO['Planifié'];
          const type = TYPES[r.typeKey]?.label || 'RDV';
          const lieu = LIEUX[r.lieuKey] || r.lieuKey || '—';
          return `${si.icone} **${type} — ${r.nomRP}**\n${tsF(dt)} · ${tsR(dt)} · 📍 ${lieu}${r.agentId ? ` · 🤝 <@${r.agentId}>` : ''}`;
        });
        await interaction.editReply({ embeds: [new EmbedBuilder().setColor(COL.sepia).setTitle('📅 Rendez-vous à venir').setDescription(lignes.join('\n\n')).setFooter({ text: `${list.length} RDV · Bureau des Rendez-vous` })] }).catch(() => {});
        return true;
      }

      if (cmd === 'dossier-client') {
        if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const membre = interaction.options.getUser('membre');
        const idOpt = (interaction.options.getString('id') || '').replace(/\D/g, '');
        const clientId = membre?.id || idOpt;
        if (!clientId) { await interaction.reply({ content: '⚠️ Indique un membre ou un ID Discord.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const store = _store(loadDB());
        const c = store.clients[clientId];
        const rdvs = Object.values(store.rdvs).filter(r => r.clientId === clientId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
        if (!c && !rdvs.length) { await interaction.reply({ content: `📭 Aucun dossier pour <@${clientId}>.`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const honored = c?.honored || 0, noshow = c?.noshow || 0, total = c?.total || rdvs.length;
        let fiab = '🆕 Nouveau client';
        if (total >= 1) {
          if (noshow === 0 && honored >= 2) fiab = '✅ Client fiable (habitué)';
          else if (noshow >= 2 && noshow >= honored) fiab = '👻 Poseur de lapins — à surveiller';
          else if (noshow >= 1) fiab = '⚠️ À surveiller';
          else fiab = '🙂 Correct';
        }
        const hist = rdvs.map(r => {
          const dt = _slotToDate(r.slot);
          const si = STATUT_INFO[r.statut] || STATUT_INFO['Planifié'];
          return `${si.icone} ${TYPES[r.typeKey]?.label || 'RDV'} · ${dt ? dt.toLocaleDateString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: 'short' }) : '—'} · ${si.texte}`;
        }).join('\n') || '—';
        await interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(COL.sepia)
          .setTitle(`🗂️ Dossier client — ${c?.nomRP || rdvs[0]?.nomRP || 'Inconnu'}`)
          .setDescription(`Client : <@${clientId}>`)
          .addFields(
            { name: '📊 Fiabilité', value: fiab, inline: false },
            { name: '📅 Total RDV', value: String(total), inline: true },
            { name: '✅ Honorés', value: String(honored), inline: true },
            { name: '👻 Lapins', value: String(noshow), inline: true },
            { name: '🕘 Derniers RDV', value: hist, inline: false },
          )] }).catch(() => {});
        return true;
      }
    }

    // ===== BOOKING CLIENT (ephemeral, étape par étape) =====
    if (interaction.isButton?.() && interaction.customId === 'rdvp_book') {
      const sel = new StringSelectMenuBuilder().setCustomId('rdvp_type').setPlaceholder('1️⃣ Choisis la prestation')
        .addOptions(Object.entries(TYPES).map(([k, v]) => ({ label: v.label, value: k })));
      await interaction.reply({ content: '✉ **Prise de rendez-vous** — étape 1/2 : la prestation.', components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // Ajout d'une photo du lieu EN PIÈCE JOINTE : on attend le prochain message-image du client
    if (interaction.isButton?.() && interaction.customId?.startsWith('rdvp_addphoto::')) {
      const rdvId = interaction.customId.split('::')[1];
      const store = _store(loadDB()); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Demande introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (interaction.user.id !== rdv.clientId) { await interaction.reply({ content: '🔒 Seul l\'auteur de la demande peut ajouter une photo.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.reply({ content: '📎 **Envoie maintenant ta photo** (en pièce jointe) ici même, dans ce salon. Tu as 2 minutes — ton message sera nettoyé automatiquement après.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const ch = interaction.channel;
      if (!ch || typeof ch.createMessageCollector !== 'function') { await interaction.followUp({ content: '⚠️ Impossible d\'attendre une photo dans ce salon.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const collector = ch.createMessageCollector({ filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0, time: 120000, max: 1 });
      collector.on('collect', async (m) => {
        try {
          const att = m.attachments.first();
          const estImage = (att?.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(att?.url || '');
          if (!att || !estImage) { await interaction.followUp({ content: '⚠️ Ce n\'est pas une image — réessaie avec une photo.', flags: MessageFlags.Ephemeral }).catch(() => {}); await m.delete().catch(() => {}); return; }
          const db2 = loadDB(); const store2 = _store(db2); const rdv2 = store2.rdvs[rdvId];
          if (!rdv2) return;
          rdv2.photo = 'attachment://lieu.png'; store2.rdvs[rdvId] = rdv2; _persist(db2);
          // On recopie l'image SUR le télégramme : elle y reste même après suppression du message d'origine
          try {
            const tch = await interaction.client.channels.fetch(rdv2.channelId).catch(() => null);
            const tmsg = tch && await tch.messages.fetch(rdv2.msgId).catch(() => null);
            if (tmsg) await tmsg.edit({ embeds: [_embedRdv(rdv2)], files: [new AttachmentBuilder(att.url, { name: 'lieu.png' })], components: _boutonsTelegramme(rdv2) }).catch(() => {});
          } catch {}
          await m.delete().catch(() => {});
          await interaction.followUp({ content: '✅ Photo ajoutée à ta demande.', flags: MessageFlags.Ephemeral }).catch(() => {});
        } catch {}
      });
      collector.on('end', async (collected) => {
        if (collected.size === 0) { await interaction.followUp({ content: '⏱️ Temps écoulé — aucune photo reçue. Tu pourras réessayer plus tard.', flags: MessageFlags.Ephemeral }).catch(() => {}); }
      });
      return true;
    }
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'rdvp_type') {
      const typeKey = interaction.values[0];
      const sel = new StringSelectMenuBuilder().setCustomId(`rdvp_lieu::${typeKey}`).setPlaceholder('2️⃣ Choisis le lieu')
        .addOptions(Object.entries(LIEUX).map(([k, v]) => ({ label: v, value: k })));
      await interaction.update({ content: `✉ Prestation : **${TYPES[typeKey]?.label || typeKey}** — étape 2/2 : le lieu, puis un court formulaire.`, components: [new ActionRowBuilder().addComponents(sel)] }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && interaction.customId?.startsWith('rdvp_lieu::')) {
      const typeKey = interaction.customId.split('::')[1];
      const lieuKey = interaction.values[0];
      const modal = new ModalBuilder().setCustomId(`rdvp_modal::${typeKey}::${lieuKey}`).setTitle('✉ Votre demande de rendez-vous');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Votre nom (personnage)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : Mr. Abberline')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quand').setLabel('Quand ? (jour + heure souhaités)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : 20/06 à 21h, ou samedi soir')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Votre ID Discord (pour le contrat)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(25).setValue(interaction.user.id).setPlaceholder('Identifiant numérique — laissez tel quel')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Votre demande (détails)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Le besoin, le contexte…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('rdvp_modal::')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const [, typeKey, lieuKey] = interaction.customId.split('::');
      const nomRP = (interaction.fields.getTextInputValue('nom') || '').trim() || (interaction.member?.displayName || interaction.user.username);
      const quand = (interaction.fields.getTextInputValue('quand') || '').trim();
      const details = (interaction.fields.getTextInputValue('details') || '').trim();
      const contactRaw = (interaction.fields.getTextInputValue('contact') || '').replace(/[^0-9]/g, '');
      const contactId = /^\d{16,21}$/.test(contactRaw) ? contactRaw : interaction.user.id;
      const slot = _parseSlot(quand); // créneau précis si on a pu le lire, sinon null (on garde le texte)
      const db = loadDB(); const store = _store(db);
      const id = ref();
      const rdv = { id, clientId: interaction.user.id, contactId, nomRP, typeKey, lieuKey, slot, souhaitTexte: quand, photo: '', details, statut: 'Planifié', notionId: null, channelId: null, msgId: null, agentId: null, sent: {}, createdAt: Date.now() };
      // Notion (best-effort)
      rdv.notionId = await _notionCreer(rdv);
      // Dossier client
      _majDossier(store, rdv, 'total');
      // La demande part dans l'AGENDA (légal ou illégal selon la prestation) pour validation par l'équipe
      const salon = _salonAgenda(interaction.guild, TYPES[typeKey]?.illegal);
      if (salon) {
        const ping = _pingOperateur(interaction.guild);
        const msg = await salon.send({ content: `${ping ? ping + ' — ' : ''}📨 **Nouvelle demande de rendez-vous à valider.**`, embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => null);
        if (msg) { rdv.channelId = salon.id; rdv.msgId = msg.id; await msg.pin().catch(() => {}); }
      }
      store.rdvs[id] = rdv; _persist(db);
      // Accusé de réception (télégramme MP)
      const dt = _slotToDate(slot);
      const accuse = new EmbedBuilder().setColor(COL.or).setTitle('✉ ACCUSÉ DE RÉCEPTION — IRON WOLF COMPANY')
        .setDescription([
          '```', ' WESTERN UNION ', '```',
          `REÇU STOP DEMANDE ENREGISTRÉE STOP RÉF **${id}** STOP`,
          `PRESTATION ${TYPES[typeKey]?.label || '—'} STOP LIEU ${LIEUX[lieuKey] || '—'} STOP`,
          dt ? `CRÉNEAU SOUHAITÉ ${tsF(dt)} STOP` : (quand ? `CRÉNEAU SOUHAITÉ ${quand} STOP` : ''),
          'LA DIRECTION ÉTUDIE VOTRE DEMANDE STOP RÉPONSE À SUIVRE STOP',
          'UN CONTRAT POURRA VOUS ÊTRE ENVOYÉ À SIGNER STOP',
        ].filter(Boolean).join('\n'))
        .setFooter({ text: 'Bureau des Rendez-vous · Saint-Denis' });
      await _mpClient(interaction.client, interaction.user.id, '', accuse);
      const photoBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rdvp_addphoto::${id}`).setLabel('📎 Ajouter une photo du lieu').setStyle(ButtonStyle.Secondary));
      await interaction.editReply({ content: `✅ Votre demande a été transmise à la Direction (réf. \`${id}\`). Vous recevrez une réponse prochainement.\n\n📎 *Facultatif : vous pouvez joindre une photo du lieu.*`, components: [photoBtn] }).catch(() => {});
      return true;
    }

    // ===== Établir un contrat à partir d'un RDV honoré (pré-remplit le formulaire de contrat existant) =====
    if (interaction.isButton?.() && /^rdvp_contrat::/.test(interaction.customId || '')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction / aux opérateurs.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const rdvId = interaction.customId.split('::')[1];
      const store = _store(loadDB()); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Rendez-vous introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const lieuLabel = LIEUX[rdv.lieuKey] || rdv.lieuKey || '';
      const typeLabel = TYPES[rdv.typeKey]?.label || 'Prestation';
      const detailsPre = [lieuLabel ? `Lieu : ${lieuLabel}` : '', rdv.souhaitTexte ? `Souhait du client : ${rdv.souhaitTexte}` : '', rdv.details || ''].filter(Boolean).join('\n').slice(0, 800);
      const modal = new ModalBuilder().setCustomId('contrat_offre_modal::Autre').setTitle('📜 Contrat — suite au RDV');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('client_nom').setLabel('Nom / Entreprise du client').setStyle(TextInputStyle.Short).setRequired(true).setValue((rdv.nomRP || '').toString().slice(0, 100))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setValue(typeLabel.toString().slice(0, 100))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Notre rémunération souhaitée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1500$ + 500$/jour')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord du client').setStyle(TextInputStyle.Short).setRequired(true).setValue((rdv.contactId || rdv.clientId || '').toString())),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails / conditions / échéance').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setValue(detailsPre)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    // ===== GESTION (Direction) =====
    const mGere = interaction.isButton?.() && /^rdvp_(confirm|assign|reply|decline|honored|noshow|reschedule|cancel)::/.test(interaction.customId || '');
    if (mGere) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction / aux opérateurs.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const [action, rdvId] = interaction.customId.split('::');
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Rendez-vous introuvable (peut-être trop ancien).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

      if (action === 'rdvp_confirm') {
        rdv.statut = 'Confirmé'; store.rdvs[rdvId] = rdv; _persist(db);
        await _notionStatut(rdv.notionId, 'Confirmé');
        await interaction.update({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {});
        const dt = _slotToDate(rdv.slot);
        const conf = new EmbedBuilder().setColor(COL.bleu).setTitle('✉ RENDEZ-VOUS CONFIRMÉ — IRON WOLF COMPANY')
          .setDescription([`RÉF **${rdv.id}** STOP RENDEZ-VOUS CONFIRMÉ STOP`, `PRESTATION ${TYPES[rdv.typeKey]?.label || '—'} STOP LIEU ${LIEUX[rdv.lieuKey] || '—'} STOP`, dt ? `QUAND ${tsF(dt)} (${tsR(dt)}) STOP` : '', 'SOYEZ À L\'HEURE STOP'].filter(Boolean).join('\n'))
          .setFooter({ text: 'Bureau des Rendez-vous' });
        if (rdv.clientId) await _mpClient(interaction.client, rdv.clientId, '', conf);
        return true;
      }

      if (action === 'rdvp_decline') {
        rdv.statut = 'Décliné'; store.rdvs[rdvId] = rdv; _persist(db);
        await _notionStatut(rdv.notionId, 'Décliné');
        await interaction.update({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {});
        try { const ch = await interaction.client.channels.fetch(rdv.channelId).catch(() => null); const msg = ch && await ch.messages.fetch(rdv.msgId).catch(() => null); if (msg) await msg.unpin().catch(() => {}); } catch {}
        if (rdv.clientId) await _mpClient(interaction.client, rdv.clientId, `✉ RÉF **${rdv.id}** — votre demande de rendez-vous n'a pas pu être retenue. Merci de votre compréhension. — Iron Wolf Company`);
        return true;
      }

      if (action === 'rdvp_cancel') {
        rdv.statut = 'Annulé'; store.rdvs[rdvId] = rdv; _persist(db);
        await _notionStatut(rdv.notionId, 'Annulé');
        await interaction.update({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {});
        try { const ch = await interaction.client.channels.fetch(rdv.channelId).catch(() => null); const msg = ch && await ch.messages.fetch(rdv.msgId).catch(() => null); if (msg) await msg.unpin().catch(() => {}); } catch {}
        if (rdv.clientId) await _mpClient(interaction.client, rdv.clientId, `✉ RÉF **${rdv.id}** — votre rendez-vous a été annulé. Contactez-nous pour en reprogrammer un. — Iron Wolf Company`);
        return true;
      }

      if (action === 'rdvp_honored') {
        rdv.statut = 'Honoré'; _majDossier(store, rdv, 'honored'); store.rdvs[rdvId] = rdv; _persist(db);
        await _notionStatut(rdv.notionId, 'Honoré');
        await interaction.update({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {});
        try { const ch = await interaction.client.channels.fetch(rdv.channelId).catch(() => null); const msg = ch && await ch.messages.fetch(rdv.msgId).catch(() => null); if (msg) await msg.unpin().catch(() => {}); } catch {}
        return true;
      }

      if (action === 'rdvp_noshow') {
        rdv.statut = 'Lapin'; _majDossier(store, rdv, 'noshow'); store.rdvs[rdvId] = rdv; _persist(db);
        await _notionStatut(rdv.notionId, 'Lapin (absent)');
        await interaction.update({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {});
        try { const ch = await interaction.client.channels.fetch(rdv.channelId).catch(() => null); const msg = ch && await ch.messages.fetch(rdv.msgId).catch(() => null); if (msg) await msg.unpin().catch(() => {}); } catch {}
        return true;
      }

      if (action === 'rdvp_assign') {
        const sel = new UserSelectMenuBuilder().setCustomId(`rdvp_assign_go::${rdvId}`).setPlaceholder('Quel agent s\'occupe de ce RDV ?').setMinValues(1).setMaxValues(1);
        await interaction.reply({ content: '👤 Choisis l\'agent à assigner :', components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }

      if (action === 'rdvp_reply') {
        const modal = new ModalBuilder().setCustomId(`rdvp_reply_modal::${rdvId}`).setTitle('💬 Répondre au client')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('msg').setLabel('Votre message (envoyé en MP)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900)));
        await interaction.showModal(modal).catch(() => {});
        return true;
      }

      if (action === 'rdvp_reschedule') {
        const modal = new ModalBuilder().setCustomId(`rdvp_resch_modal::${rdvId}`).setTitle('🔁 Reprogrammer le rendez-vous')
          .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('quand').setLabel('Nouveau créneau (jour + heure)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : 20/06 à 21h')));
        await interaction.showModal(modal).catch(() => {});
        return true;
      }
    }

    // Assignation : sélection de l'agent
    if (interaction.isUserSelectMenu?.() && interaction.customId?.startsWith('rdvp_assign_go::')) {
      if (!peutGerer(interaction.member)) { await interaction.update({ content: '🔒 Réservé.', components: [] }).catch(() => {}); return true; }
      const rdvId = interaction.customId.split('::')[1];
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.update({ content: '⚠️ RDV introuvable.', components: [] }).catch(() => {}); return true; }
      const agentId = interaction.values[0];
      rdv.agentId = agentId; store.rdvs[rdvId] = rdv; _persist(db);
      await interaction.update({ content: `✅ Agent <@${agentId}> assigné au RDV \`${rdvId}\`.`, components: [] }).catch(() => {});
      await _rafraichirTelegramme(interaction.client, rdv);
      const dt = _slotToDate(rdv.slot);
      const brief = new EmbedBuilder().setColor(COL.bleu).setTitle('🤝 Mission — Rendez-vous assigné')
        .setDescription(`Tu es chargé d'un rendez-vous client (réf. \`${rdv.id}\`).`)
        .addFields(
          { name: '🧰 Prestation', value: TYPES[rdv.typeKey]?.label || '—', inline: true },
          { name: '📍 Lieu', value: LIEUX[rdv.lieuKey] || '—', inline: true },
          { name: '🕐 Quand', value: dt ? `${tsF(dt)} (${tsR(dt)})` : (rdv.souhaitTexte ? `*Souhait : ${rdv.souhaitTexte}* (à fixer)` : '—'), inline: false },
          { name: '👤 Client', value: rdv.nomRP, inline: true },
          ...(rdv.details ? [{ name: '📝 Détails', value: rdv.details.slice(0, 1000), inline: false }] : []),
        ).setFooter({ text: 'Iron Wolf Company · Bureau des Rendez-vous' });
      await _mpClient(interaction.client, agentId, '', brief);
      return true;
    }

    // Réponse au client (modal)
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('rdvp_reply_modal::')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const rdvId = interaction.customId.split('::')[1];
      const store = _store(loadDB()); const rdv = store.rdvs[rdvId];
      if (!rdv || !rdv.clientId) { await interaction.editReply({ content: '⚠️ Impossible (RDV ou client introuvable).' }).catch(() => {}); return true; }
      const msg = (interaction.fields.getTextInputValue('msg') || '').trim();
      const ok = await _mpClient(interaction.client, rdv.clientId, '', new EmbedBuilder().setColor(COL.or).setTitle('✉ Message — Iron Wolf Company').setDescription(msg).setFooter({ text: `Réf. ${rdv.id} · Bureau des Rendez-vous` }));
      await interaction.editReply({ content: ok ? `✅ Message envoyé en MP au client.` : '⚠️ Le client a ses MP fermés — impossible de le joindre.' }).catch(() => {});
      return true;
    }

    // Reprogrammation : nouveau créneau saisi librement
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('rdvp_resch_modal::')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      if (!peutGerer(interaction.member)) { await interaction.editReply({ content: '🔒 Réservé.' }).catch(() => {}); return true; }
      const rdvId = interaction.customId.split('::')[1];
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.editReply({ content: '⚠️ RDV introuvable.' }).catch(() => {}); return true; }
      const quand = (interaction.fields.getTextInputValue('quand') || '').trim();
      const slot = _parseSlot(quand);
      if (!slot) { await interaction.editReply({ content: '⚠️ Je n\'ai pas reconnu de date. Réessaie en indiquant le jour, ex : `20/06 à 21h`.' }).catch(() => {}); return true; }
      rdv.slot = slot; rdv.souhaitTexte = quand; rdv.sent = {}; store.rdvs[rdvId] = rdv; _persist(db);
      await _notionDate(rdv.notionId, rdv.slot);
      const dt = _slotToDate(rdv.slot);
      await interaction.editReply({ content: `✅ RDV \`${rdvId}\` reprogrammé : ${dt ? tsF(dt) : quand}.` }).catch(() => {});
      await _rafraichirTelegramme(interaction.client, rdv);
      if (rdv.clientId) await _mpClient(interaction.client, rdv.clientId, '', new EmbedBuilder().setColor(COL.orange).setTitle('✉ RENDEZ-VOUS REPROGRAMMÉ').setDescription([`RÉF **${rdv.id}** STOP NOUVEAU CRÉNEAU STOP`, dt ? `QUAND ${tsF(dt)} (${tsR(dt)}) STOP` : ''].filter(Boolean).join('\n')).setFooter({ text: 'Bureau des Rendez-vous' }));
      return true;
    }

    return false;
  } catch (e) { console.log('[RDV+] routeInteraction erreur:', e?.message); return false; }
}

// ───────────────────────── Rappels CLIENT (cron) ─────────────────────────
async function checkRappelsClients(guild) {
  try {
    const db = loadDB(); const store = _store(db); let changed = false;
    for (const rdv of Object.values(store.rdvs)) {
      if (rdv.statut !== 'Confirmé' || !rdv.clientId) continue;
      const dt = _slotToDate(rdv.slot); if (!dt) continue;
      const mins = Math.floor((dt.getTime() - Date.now()) / 60000);
      if (!rdv.sent) rdv.sent = {};
      if (mins > 60 && mins <= 1440 && !rdv.sent['24h']) {
        await _mpClient(guild.client, rdv.clientId, '', new EmbedBuilder().setColor(COL.bleu).setTitle('📅 Rappel — votre rendez-vous est demain').setDescription([`RÉF **${rdv.id}** STOP`, `PRESTATION ${TYPES[rdv.typeKey]?.label || '—'} STOP LIEU ${LIEUX[rdv.lieuKey] || '—'} STOP`, `QUAND ${tsF(dt)} (${tsR(dt)}) STOP`].join('\n')).setFooter({ text: 'Iron Wolf Company' }));
        rdv.sent['24h'] = true; changed = true;
      }
      if (mins > 5 && mins <= 60 && !rdv.sent['1h']) {
        await _mpClient(guild.client, rdv.clientId, '', new EmbedBuilder().setColor(COL.orange).setTitle('⏰ Rappel — votre rendez-vous dans 1 heure').setDescription([`RÉF **${rdv.id}** STOP`, `LIEU ${LIEUX[rdv.lieuKey] || '—'} STOP`, `QUAND ${tsR(dt)} STOP`].join('\n')).setFooter({ text: 'Iron Wolf Company' }));
        rdv.sent['1h'] = true; changed = true;
      }
    }
    if (changed) _persist(db);
  } catch (e) { console.log('[RDV+] checkRappelsClients erreur:', e?.message); }
}

module.exports = { routeInteraction, checkRappelsClients, rdvplusCommands, panelPayload };
