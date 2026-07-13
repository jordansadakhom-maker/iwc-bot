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
// Facturation (facultative : si le module est là, l'encaissement d'un RDV génère une facture).
let facturesMod = null; try { facturesMod = require('./factures'); } catch { facturesMod = null; }

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

// ── Champs spécifiques par prestation (chaque prestation pose SES bonnes questions) ──
// Format : [id, label(≤45), 'short'|'para', requis, maxLength, placeholder]
const CHAMPS_PRESTATION = {
  esc: [['trajet', 'Trajet (départ → arrivée)', 'short', true, 120, 'Ex : Valentine → Saint-Denis'], ['duree', 'Durée estimée', 'short', false, 60, 'Ex : ~2h, une demi-journée…']],
  cnv: [['trajet', 'Trajet (départ → arrivée)', 'short', true, 120, 'Ex : Valentine → Saint-Denis'], ['duree', 'Durée estimée', 'short', false, 60, 'Ex : ~2h, une demi-journée…']],
  pro: [['proteger', 'Qui / quoi protéger ?', 'short', true, 120, 'Ex : un marchand et sa cargaison'], ['menace', 'Contre quelle menace ?', 'short', false, 120, 'Ex : bandits, un rival…']],
  sec: [['lieu_precis', 'Quel lieu sécuriser ?', 'short', true, 120, 'Ex : un entrepôt à Saint-Denis'], ['menace', 'Menace / risque connu', 'short', false, 120, 'Ex : cambriolage, intrusion…']],
  enq: [['cible', 'Sur qui / quoi enquêter ?', 'short', true, 120, 'Ex : un associé douteux'], ['objectif', 'Ce que vous cherchez à savoir', 'para', true, 400, 'Ex : est-il en train de nous trahir ?']],
  neg: [['parties', 'Entre qui ? (parties concernées)', 'short', true, 120, 'Ex : nous et la famille Braithwaite'], ['enjeu', 'Objet / enjeu du différend', 'para', true, 400, 'Ex : partage d\'un territoire']],
  rec: [['objet', 'Bien / montant à récupérer', 'short', true, 120, 'Ex : une dette de 500 $'], ['debiteur', 'Auprès de qui ? (le débiteur)', 'short', true, 120, 'Ex : un joueur de Saint-Denis']],
  bnt: [['cible', 'Nom de la cible', 'short', true, 120, 'Ex : « Le Serpent » Callahan'], ['mandat', 'Mandat / prime / conditions', 'para', false, 400, 'Ex : vivant, 800 $, mandat officiel']],
  trv: [['nature', 'Nature du travail', 'para', true, 400, 'Décris ce qu\'il faut faire'], ['contraintes', 'Contraintes / discrétion', 'short', false, 150, 'Ex : sans témoin, de nuit…']],
};

function _satLabel(n) { return n === 'bien' ? '👍 Satisfait' : n === 'moyen' ? '😐 Mitigé' : n === 'mauvais' ? '👎 Mécontent' : '—'; }

// ── Helpers généraux ──
const ref = () => `RDV-${Date.now().toString().slice(-5)}`;
const fmtDate = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtHeure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const peutGerer = (member) => global.aAccesTotal?.(member) || !!member?.roles?.cache?.some(r => GESTION_ROLES.some(n => r.name.includes(n)));

function _store(db) { if (!db.rdvplus) db.rdvplus = { rdvs: {}, clients: {} }; if (!db.rdvplus.rdvs) db.rdvplus.rdvs = {}; if (!db.rdvplus.clients) db.rdvplus.clients = {}; return db.rdvplus; }

// Prestation (RDV) → catégorie d'opération, pour la création automatique d'opération.
const PRESTA_TO_CAT = {
  esc: 'Protection rapprochée', cnv: 'Escorte de convoi', pro: 'Protection rapprochée',
  sec: 'Protection', enq: 'Surveillance / Filature', neg: 'Autre',
  rec: 'Récupération de dette', bnt: 'Chasse de prime', trv: 'Autre',
};
// Membres connectés au salon vocal « HRP » (repéré par son nom), sinon au vocal du cliqueur.
function _membresVocalHRP(interaction) {
  try {
    const guild = interaction.guild;
    let cible = guild.channels?.cache?.find(c => c.type === 2 && /hrp/i.test(c.name || '') && (c.members?.size || 0) > 0);
    if (!cible) cible = interaction.member?.voice?.channel || null;
    if (!cible?.members) return { ids: [], salon: cible?.name || null };
    return { ids: [...cible.members.values()].filter(m => !m.user?.bot).map(m => m.id), salon: cible.name };
  } catch { return { ids: [], salon: null }; }
}

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
      ...(Array.isArray(rdv.reponses) ? rdv.reponses.slice(0, 4).map(rp => ({ name: '• ' + String(rp.label).slice(0, 100), value: String(rp.value).slice(0, 300), inline: true })) : []),
      ...(!rdv.reponses && rdv.trajet ? [{ name: '🗺️ Trajet', value: String(rdv.trajet).slice(0, 200), inline: true }] : []),
      ...(!rdv.reponses && rdv.duree ? [{ name: '⏱️ Durée estimée', value: String(rdv.duree).slice(0, 100), inline: true }] : []),
      { name: '🕐 Créneau', value: dt ? `${tsF(dt)}\n${tsR(dt)}` : (rdv.souhaitTexte ? `*Souhait : ${rdv.souhaitTexte}* (à fixer)` : '—'), inline: false },
      { name: '📇 Contact (pour le contrat)', value: `<@${rdv.contactId || rdv.clientId}> · ID : \`${rdv.contactId || rdv.clientId}\``, inline: false },
      ...(rdv.agentId ? [{ name: '🤝 Agent assigné', value: `<@${rdv.agentId}>`, inline: true }] : []),
      ...(rdv.details ? [{ name: '📝 Détails', value: rdv.details.slice(0, 1000), inline: false }] : []),
      ...(rdv.satisfaction ? [{ name: '⭐ Satisfaction client', value: _satLabel(rdv.satisfaction) + (rdv.satisfactionComment ? `\n*« ${String(rdv.satisfactionComment).slice(0, 300)} »*` : ''), inline: false }] : []),
      ...(rdv.paiement ? [{ name: '💰 Paiement', value: `Encaissé : **$${Number(rdv.paiement.montant || 0).toLocaleString('fr-FR')}**${rdv.paiement.facture ? ` · Facture \`${rdv.paiement.facture}\`` : ''}${rdv.paiement.par ? `\n*par ${rdv.paiement.par}*` : ''}`, inline: false }] : []),
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
        new ButtonBuilder().setCustomId(`rdvp_operation::${rdv.id}`).setLabel('🎯 Créer l\'opération').setStyle(ButtonStyle.Primary),
      ),
    ];
  }
  if (rdv.statut === 'Honoré') {
    // Mission validée → on encaisse le paiement (marque payé + coffre + facture). Une fois payé, bouton verrouillé.
    if (rdv.paiement) {
      return [new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`rdvp_paid_noop::${rdv.id}`).setLabel(`💰 Payé — $${Number(rdv.paiement.montant || 0).toLocaleString('fr-FR')}`).setStyle(ButtonStyle.Success).setDisabled(true),
        new ButtonBuilder().setCustomId(`rdvp_operation::${rdv.id}`).setLabel('🎯 Créer l\'opération').setStyle(ButtonStyle.Primary),
      )];
    }
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rdvp_encaisser::${rdv.id}`).setLabel('💰 Encaisser le paiement').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rdvp_operation::${rdv.id}`).setLabel('🎯 Créer l\'opération').setStyle(ButtonStyle.Primary),
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
  new SlashCommandBuilder().setName('recap-rdv').setDescription('📊 Récap des RDV : encaissements du mois + stats des agents (Direction)'),
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
    new ButtonBuilder().setCustomId('rdvp_mesdemandes').setLabel('Mes demandes').setEmoji('📋').setStyle(ButtonStyle.Secondary),
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

      if (cmd === 'recap-rdv') {
        if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const eur = n => '$' + (Math.round(n) || 0).toLocaleString('fr-FR');
        const store = _store(loadDB());
        const rdvs = Object.values(store.rdvs);
        const now = new Date();
        const memeMois = d => d && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
        const payes = rdvs.filter(r => r.paiement && memeMois(new Date(r.paiement.at)));
        const totalMois = payes.reduce((n, r) => n + (r.paiement.montant || 0), 0);
        // Encaissements du mois par prestation
        const parType = {};
        for (const r of payes) { const k = r.typeKey || 'autre'; if (!parType[k]) parType[k] = { n: 0, m: 0 }; parType[k].n++; parType[k].m += r.paiement.montant || 0; }
        const lignesType = Object.entries(parType).sort((a, b) => b[1].m - a[1].m).map(([k, v]) => `${TYPES[k]?.label || k} — **${eur(v.m)}** (${v.n})`);
        // Stats agents (tout temps) : missions honorées + total encaissé
        const parAgent = {};
        for (const r of rdvs) { if (!r.agentId) continue; if (r.statut !== 'Honoré' && !r.paiement) continue; if (!parAgent[r.agentId]) parAgent[r.agentId] = { miss: 0, enc: 0 }; parAgent[r.agentId].miss++; parAgent[r.agentId].enc += r.paiement?.montant || 0; }
        const topAgents = Object.entries(parAgent).sort((a, b) => b[1].miss - a[1].miss).slice(0, 6).map(([uid, v]) => `<@${uid}> — **${v.miss}** mission(s) · ${eur(v.enc)}`);
        let moisNom = ''; try { moisNom = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' }); } catch { moisNom = `${now.getMonth() + 1}/${now.getFullYear()}`; }
        const e = new EmbedBuilder().setColor(COL.or).setTitle('📊 Récap des rendez-vous')
          .addFields(
            { name: `💰 Encaissé — ${moisNom}`, value: `**${eur(totalMois)}**  ·  ${payes.length} paiement(s)`, inline: false },
            { name: '🧰 Par prestation (ce mois)', value: lignesType.length ? lignesType.join('\n').slice(0, 1024) : '*Aucun encaissement ce mois.*', inline: false },
            { name: '🤝 Agents — missions honorées', value: topAgents.length ? topAgents.join('\n').slice(0, 1024) : '*Aucune mission honorée pour le moment.*', inline: false },
          )
          .setFooter({ text: 'Iron Wolf Company · Bureau des Rendez-vous' }).setTimestamp();
        await interaction.editReply({ embeds: [e] }).catch(() => {});
        return true;
      }

      if (cmd === 'dossier-client') {
        if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const membre = interaction.options.getUser('membre');
        const idOpt = (interaction.options.getString('id') || '').replace(/\D/g, '');
        const clientId = membre?.id || idOpt;
        if (!clientId) { await interaction.reply({ content: '⚠️ Indique un membre ou un ID Discord.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const db = loadDB(); const store = _store(db);
        const c = store.clients[clientId];
        const rdvs = Object.values(store.rdvs).filter(r => r.clientId === clientId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 6);
        // Historique unifié : télégrammes (ancien flux) + conversations suivies.
        const telegrammes = (db.rdvClients || []).filter(r => r.demandeurId === clientId).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
        const convs = Object.values(db.conversations || {}).filter(cv => cv.demandeurId === clientId);
        if (!c && !rdvs.length && !telegrammes.length && !convs.length) { await interaction.reply({ content: `📭 Aucun dossier pour <@${clientId}>.`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const teleLignes = telegrammes.slice(0, 4).map(r => { const st = r.statut === 'fixe' ? '📅 fixé' : r.statut === 'refuse' ? '❌ décliné' : '🟡 en attente'; return `${st} · ${String(r.objet || '—')}`.slice(0, 90); }).join('\n');
        const convOuvertes = convs.filter(cv => cv.status === 'ouvert').length;
        const derniereConv = convs.slice().sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))[0];
        const convLien = derniereConv?.threadId && interaction.guild ? `\n[Ouvrir la dernière conversation](https://discord.com/channels/${interaction.guild.id}/${derniereConv.threadId})` : '';
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
            ...(c?.avis && (c.avis.bien || c.avis.moyen || c.avis.mauvais) ? [{ name: '⭐ Satisfaction', value: `👍 ${c.avis.bien || 0} · 😐 ${c.avis.moyen || 0} · 👎 ${c.avis.mauvais || 0}`, inline: false }] : []),
            { name: '🕘 Derniers RDV', value: hist, inline: false },
            ...(telegrammes.length ? [{ name: `📨 Télégrammes (${telegrammes.length})`, value: (teleLignes || '—').slice(0, 1024), inline: false }] : []),
            ...(convs.length ? [{ name: `🧵 Conversations (${convs.length})`, value: `${convs.length} au total · ${convOuvertes} ouverte(s)${convLien}`.slice(0, 1024), inline: false }] : []),
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

    // ===== CLIENT : voir MES demandes (+ annuler une demande en attente) =====
    if (interaction.isButton?.() && interaction.customId === 'rdvp_mesdemandes') {
      const store = _store(loadDB());
      const mine = Object.values(store.rdvs).filter(r => r.clientId === interaction.user.id).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 8);
      if (!mine.length) { await interaction.reply({ content: '📭 Tu n\'as aucune demande en cours. Clique sur **« Besoin de nos services »** pour en faire une.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const lignes = mine.map(r => { const si = STATUT_INFO[r.statut] || STATUT_INFO['Planifié']; const dt = _slotToDate(r.slot); return `${si.icone} **${TYPES[r.typeKey]?.label || 'RDV'}** · \`${r.id}\` — ${si.texte}${dt ? ` · ${tsF(dt)}` : (r.souhaitTexte ? ` · souhait : ${r.souhaitTexte}` : '')}`; });
      const annulables = mine.filter(r => ['Planifié', 'Confirmé'].includes(r.statut));
      const comps = [];
      if (annulables.length) {
        const sel = new StringSelectMenuBuilder().setCustomId('rdvp_annuler_sel').setPlaceholder('Annuler une demande en attente…')
          .addOptions(annulables.map(r => ({ label: `${String(TYPES[r.typeKey]?.label || 'RDV').replace(/[^\p{L}\p{N} ]/gu, '').trim().slice(0, 70)} · ${r.id}`, value: r.id })));
        comps.push(new ActionRowBuilder().addComponents(sel));
      }
      await interaction.reply({ embeds: [new EmbedBuilder().setColor(COL.sepia).setTitle('📋 Mes demandes').setDescription(lignes.join('\n')).setFooter({ text: 'Iron Wolf Company · Bureau des Rendez-vous' })], components: comps, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && interaction.customId === 'rdvp_annuler_sel') {
      const rdvId = interaction.values[0];
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv || rdv.clientId !== interaction.user.id) { await interaction.update({ content: '⚠️ Demande introuvable.', embeds: [], components: [] }).catch(() => {}); return true; }
      if (!['Planifié', 'Confirmé'].includes(rdv.statut)) { await interaction.update({ content: 'Cette demande ne peut plus être annulée.', embeds: [], components: [] }).catch(() => {}); return true; }
      rdv.statut = 'Annulé'; store.rdvs[rdvId] = rdv; _persist(db);
      try { await _notionStatut(rdv.notionId, 'Annulé'); } catch {}
      await _rafraichirTelegramme(interaction.client, rdv).catch(() => {});
      try { const ch = rdv.channelId && await interaction.client.channels.fetch(rdv.channelId).catch(() => null); if (ch?.send) await ch.send({ content: `🚫 Le client <@${rdv.clientId}> a **annulé lui-même** sa demande \`${rdv.id}\` (${TYPES[rdv.typeKey]?.label || 'RDV'}).` }).catch(() => {}); } catch {}
      await interaction.update({ content: `🚫 Ta demande \`${rdvId}\` a bien été annulée. Merci de nous avoir prévenus !`, embeds: [], components: [] }).catch(() => {});
      return true;
    }

    // ===== CLIENT : retour de satisfaction (après une prestation honorée) =====
    if (interaction.isButton?.() && interaction.customId?.startsWith('rdvp_sat::')) {
      const [, rdvId, note] = interaction.customId.split('::');
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Demande introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (rdv.clientId && interaction.user.id !== rdv.clientId) { await interaction.reply({ content: '🔒 Seul le client concerné peut répondre.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      rdv.satisfaction = note; store.rdvs[rdvId] = rdv;
      const c = store.clients[rdv.clientId]; if (c) { c.avis = c.avis || { bien: 0, moyen: 0, mauvais: 0 }; c.avis[note] = (c.avis[note] || 0) + 1; store.clients[rdv.clientId] = c; }
      _persist(db);
      await _rafraichirTelegramme(interaction.client, rdv).catch(() => {});
      const rowC = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`rdvp_satmot::${rdvId}`).setLabel('Laisser un mot (facultatif)').setEmoji('✍️').setStyle(ButtonStyle.Secondary));
      try { await interaction.update({ content: `Merci pour votre retour ! ${_satLabel(note)}`, embeds: [], components: [rowC] }); }
      catch { try { await interaction.reply({ content: `Merci pour votre retour ! ${_satLabel(note)}`, flags: MessageFlags.Ephemeral }); } catch {} }
      return true;
    }
    if (interaction.isButton?.() && interaction.customId?.startsWith('rdvp_satmot::')) {
      const rdvId = interaction.customId.split('::')[1];
      const modal = new ModalBuilder().setCustomId(`rdvp_satmot_modal::${rdvId}`).setTitle('✍️ Votre retour')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mot').setLabel('Un mot sur la prestation (facultatif)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500)));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('rdvp_satmot_modal::')) {
      const rdvId = interaction.customId.split('::')[1];
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (rdv) { rdv.satisfactionComment = (interaction.fields.getTextInputValue('mot') || '').trim(); store.rdvs[rdvId] = rdv; _persist(db); await _rafraichirTelegramme(interaction.client, rdv).catch(() => {}); }
      await interaction.reply({ content: '🙏 Merci, votre retour a bien été transmis à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // Ajout d'une photo du lieu EN PIÈCE JOINTE : on attend le prochain message-image du client
    if (interaction.isButton?.() && interaction.customId?.startsWith('rdvp_addphoto::')) {
      const rdvId = interaction.customId.split('::')[1];
      const store = _store(loadDB()); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Demande introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (interaction.user.id !== rdv.clientId) { await interaction.reply({ content: '🔒 Seul l\'auteur de la demande peut ajouter une photo.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      // Photo demandée EN MESSAGE PRIVÉ → rien ne transite par le salon public (confidentiel)
      let dm = null;
      try { dm = await interaction.user.createDM(); } catch {}
      if (!dm || typeof dm.createMessageCollector !== 'function') { await interaction.reply({ content: '⚠️ Je n\'arrive pas à t\'écrire en privé (tes MP sont sûrement fermés). Ouvre tes MP puis réessaie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await dm.send('📎 **Envoie-moi ici, en message privé, la photo du lieu** (en pièce jointe). Tu as 2 minutes.').catch(() => {});
      await interaction.reply({ content: '📬 Je t\'ai écrit **en message privé** pour la photo — envoie-la là, en toute discrétion.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const collector = dm.createMessageCollector({ filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0, time: 120000, max: 1 });
      collector.on('collect', async (m) => {
        try {
          const att = m.attachments.first();
          const estImage = (att?.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(att?.url || '');
          if (!att || !estImage) { await dm.send('⚠️ Ce n\'est pas une image — reclique sur « Ajouter une photo » pour réessayer.').catch(() => {}); return; }
          const db2 = loadDB(); const store2 = _store(db2); const rdv2 = store2.rdvs[rdvId];
          if (!rdv2) return;
          rdv2.photo = 'attachment://lieu.png'; // référence pour l'édition ci-dessous (fichier joint)
          // On recopie l'image SUR le télégramme (salon staff) et on garde son URL CDN permanente
          let urlPermanente = null;
          try {
            const tch = await interaction.client.channels.fetch(rdv2.channelId).catch(() => null);
            const tmsg = tch && await tch.messages.fetch(rdv2.msgId).catch(() => null);
            if (tmsg) {
              const posted = await tmsg.edit({ embeds: [_embedRdv(rdv2)], files: [new AttachmentBuilder(att.url, { name: 'lieu.png' })], components: _boutonsTelegramme(rdv2) }).catch(() => null);
              urlPermanente = posted?.attachments?.first()?.url || null;
            }
          } catch {}
          // On persiste l'URL http permanente (pas 'attachment://…') → l'image survit aux ré-éditions du télégramme
          rdv2.photo = urlPermanente || rdv2.photo; store2.rdvs[rdvId] = rdv2; _persist(db2);
          await dm.send('✅ Photo bien reçue et ajoutée à ta demande. Merci !').catch(() => {});
        } catch {}
      });
      collector.on('end', async (collected) => {
        if (collected.size === 0) { try { await dm.send('⏱️ Temps écoulé — aucune photo reçue. Reclique sur « Ajouter une photo » quand tu veux.'); } catch {} }
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
      // Formulaire adapté à la prestation : Nom + questions spécifiques + Quand + Détails (≤ 5 champs).
      // L'ID Discord n'est plus redemandé : on récupère automatiquement celui du demandeur.
      const modal = new ModalBuilder().setCustomId(`rdvp_modal::${typeKey}::${lieuKey}`).setTitle('✉ Votre demande de rendez-vous');
      const _ti = (id, label, style, req, max, ph) => new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId(id).setLabel(String(label).slice(0, 45))
          .setStyle(style === 'para' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(!!req).setMaxLength(max).setPlaceholder(String(ph || '').slice(0, 100)));
      const rows = [_ti('nom', 'Votre nom (personnage)', 'short', true, 60, 'Ex : Mr. Abberline')];
      for (const [cid, label, style, req, max, ph] of (CHAMPS_PRESTATION[typeKey] || [])) rows.push(_ti('sp_' + cid, label, style, req, max, ph));
      rows.push(_ti('quand', 'Quand ? (jour + heure souhaités)', 'short', true, 60, 'Ex : 20/06 à 21h, ou samedi soir'));
      if (rows.length < 5) rows.push(_ti('details', 'Votre demande (détails)', 'para', false, 800, 'Le besoin, le contexte…'));
      modal.addComponents(...rows.slice(0, 5));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('rdvp_modal::')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const [, typeKey, lieuKey] = interaction.customId.split('::');
      const gf = (k) => { try { return (interaction.fields.getTextInputValue(k) || '').trim(); } catch { return ''; } }; // lecture tolérante (champ absent selon la prestation)
      const nomRP = gf('nom') || (interaction.member?.displayName || interaction.user.username);
      const quand = gf('quand');
      const details = gf('details');
      const reponses = []; // réponses aux questions spécifiques de la prestation
      for (const [cid, label] of (CHAMPS_PRESTATION[typeKey] || [])) { const v = gf('sp_' + cid); if (v) reponses.push({ id: cid, label, value: v }); }
      const contactRaw = gf('contact').replace(/[^0-9]/g, '');
      const contactId = /^\d{16,21}$/.test(contactRaw) ? contactRaw : interaction.user.id;
      const slot = _parseSlot(quand); // créneau précis si on a pu le lire, sinon null (on garde le texte)
      const db = loadDB(); const store = _store(db);
      const id = ref();
      const rdv = { id, clientId: interaction.user.id, contactId, nomRP, typeKey, lieuKey, slot, souhaitTexte: quand, reponses, photo: '', details, statut: 'Planifié', notionId: null, channelId: null, msgId: null, agentId: null, sent: {}, createdAt: Date.now() };
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
          ...reponses.map(rp => `${String(rp.label).toUpperCase()} ${rp.value} STOP`),
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

    // ===== Encaisser le paiement d'un RDV honoré : marque payé → crédite le coffre → génère une facture =====
    if (interaction.isButton?.() && /^rdvp_encaisser::/.test(interaction.customId || '')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction / aux opérateurs.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const rdvId = interaction.customId.split('::')[1];
      const store = _store(loadDB()); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Rendez-vous introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (rdv.paiement) { await interaction.reply({ content: `✅ Déjà encaissé : $${Number(rdv.paiement.montant || 0).toLocaleString('fr-FR')}.`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const typeLabel = TYPES[rdv.typeKey]?.label || 'Prestation';
      const modal = new ModalBuilder().setCustomId(`rdvp_encaisser_modal::${rdvId}`).setTitle('💰 Encaisser le paiement');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant reçu ($)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex : 1500')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Note (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setPlaceholder(`${typeLabel} — ${rdv.nomRP || ''}`.slice(0, 100))),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && /^rdvp_encaisser_modal::/.test(interaction.customId || '')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction / aux opérateurs.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const rdvId = interaction.customId.split('::')[1];
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.reply({ content: '⚠️ Rendez-vous introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (rdv.paiement) { await interaction.reply({ content: '✅ Déjà encaissé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const mRaw = String(interaction.fields.getTextInputValue('montant') || '').replace(/\s/g, '').match(/\d+/);
      const montant = mRaw ? parseInt(mRaw[0], 10) : 0;
      if (!montant) { await interaction.reply({ content: '⚠️ Montant invalide — indique un nombre (ex : 1500).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const note = (interaction.fields.getTextInputValue('note') || '').trim();
      const par = interaction.member?.displayName || interaction.user.username;
      const typeLabel = TYPES[rdv.typeKey]?.label || 'Prestation';
      const objet = `RDV ${typeLabel} — ${rdv.nomRP || 'client'} (${rdv.id})`.slice(0, 200);
      rdv.paiement = { montant, par, parId: interaction.user.id, at: new Date().toISOString(), note, facture: null };
      // 1) Crédite le coffre commun (journal + Notion + rafraîchit le bilan compta)
      let solde = null;
      try { solde = await global.crediterCoffrePrime?.({ guild: interaction.guild, montant, objet, responsable: par, responsableId: interaction.user.id }); } catch {}
      // 2) Génère une facture (anti-doublon par réf. RDV)
      let facNum = null;
      try {
        const res = await facturesMod?.creerFacture?.(interaction.guild, { objet, montant, clientNom: rdv.nomRP || 'Client', type: 'RDV — ' + typeLabel, remuneration: `$${montant}`, ref: `RDV ${rdv.id}`, note, par, parId: interaction.user.id });
        if (res && res.f && res.f.numero) { facNum = res.f.numero; rdv.paiement.facture = facNum; }
      } catch {}
      store.rdvs[rdvId] = rdv; _persist(db);
      // 3) Met à jour la fiche du RDV
      let acked = false;
      try { await interaction.update({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }); acked = true; } catch {}
      if (!acked) { try { const ch = await interaction.client.channels.fetch(rdv.channelId).catch(() => null); const msg = ch && await ch.messages.fetch(rdv.msgId).catch(() => null); if (msg) await msg.edit({ embeds: [_embedRdv(rdv)], components: _boutonsTelegramme(rdv) }).catch(() => {}); } catch {} }
      const conf = `💰 **Paiement encaissé** : $${montant.toLocaleString('fr-FR')}${solde != null ? ` · coffre : $${Number(solde).toLocaleString('fr-FR')}` : ''}${facNum ? ` · facture \`${facNum}\`` : ''}.`;
      try { if (acked) await interaction.followUp({ content: conf, flags: MessageFlags.Ephemeral }); else await interaction.reply({ content: conf, flags: MessageFlags.Ephemeral }); } catch {}
      return true;
    }

    // ===== CRÉER UNE OPÉRATION à partir du rendez-vous (auto : catégorie, lieu, équipe du vocal HRP) =====
    if (interaction.isButton?.() && (interaction.customId || '').startsWith('rdvp_operation::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction / aux opérateurs.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const rdvId = interaction.customId.split('::')[1];
      const db = loadDB(); const store = _store(db); const rdv = store.rdvs[rdvId];
      if (!rdv) { await interaction.editReply({ content: '⚠️ Rendez-vous introuvable (peut-être trop ancien).' }).catch(() => {}); return true; }
      if (typeof global.creerOpDepuisContrat !== 'function') { await interaction.editReply({ content: '⚠️ Le module des opérations n\'est pas disponible.' }).catch(() => {}); return true; }
      // Équipe = membres connectés au vocal HRP (ou au vocal du cliqueur) + l'agent assigné.
      const { ids: vocal, salon } = _membresVocalHRP(interaction);
      const membres = [...new Set([...(vocal || []), ...(rdv.agentId ? [rdv.agentId] : [])])];
      const typeMission = PRESTA_TO_CAT[rdv.typeKey] || 'Autre';
      const pole = TYPES[rdv.typeKey]?.illegal ? 'illegal' : 'legal';
      const lieu = LIEUX[rdv.lieuKey] || rdv.lieuKey || '';
      const dt = _slotToDate(rdv.slot);
      const creneau = dt ? tsF(dt) : (rdv.souhaitTexte || '');
      const objetLabel = (TYPES[rdv.typeKey]?.label || 'Mission').replace(/^[^\p{L}]+/u, '').trim();
      const contrat = {
        id: 'RDVOP-' + rdvId,
        typeMission,
        objet: `${objetLabel} — ${rdv.nomRP || 'client'}${lieu ? ` · ${lieu}` : ''}`.slice(0, 100),
        commanditaire: rdv.nomRP || '',
        remuneration: rdv.paiement?.montant ? `$${Number(rdv.paiement.montant).toLocaleString('fr-FR')}` : '—',
        echeanceTexte: creneau || null,
        details: [rdv.details, lieu ? `📍 Lieu : ${lieu}` : '', creneau ? `🕐 Créneau : ${creneau}` : '', (rdv.contactId || rdv.clientId) ? `📇 Client : <@${rdv.contactId || rdv.clientId}>` : ''].filter(Boolean).join('\n').slice(0, 900),
      };
      let op = null;
      try { op = await global.creerOpDepuisContrat(interaction.guild, contrat, { pole, parId: interaction.user.id, membres }); } catch (e) { console.log('❌ rdvp_operation create:', e.message); }
      if (!op) { await interaction.editReply({ content: '⚠️ La création de l\'opération a échoué (voir logs). Tu peux la créer manuellement au besoin.' }).catch(() => {}); return true; }
      rdv.operationId = op.id; store.rdvs[rdvId] = rdv; _persist(db);
      // Prévient l'équipe (les participants du vocal) dans le fil de l'opération.
      if (membres.length && op.threadId) {
        try { const th = await interaction.client.channels.fetch(op.threadId).catch(() => null); if (th?.send) await th.send({ content: `👥 ${membres.map(m => `<@${m}>`).join(' ')} — vous êtes **assignés** à cette opération (équipe présente sur le vocal${salon ? ` « ${salon} »` : ''}). Préparez-la étape par étape ci-dessus.`, allowedMentions: { users: membres.slice(0, 50) } }).catch(() => {}); } catch {}
      }
      const lien = op.threadId ? `<#${op.threadId}>` : '#opérations';
      await interaction.editReply({ content: [
        `✅ **Opération créée** depuis le rendez-vous \`${rdvId}\` :`,
        `${op.emoji || '🎯'} **${String(op.cible || objetLabel).slice(0, 80)}** *(${op.categorie})*`,
        `📍 ${lieu || '—'}${creneau ? ` · 🕐 ${creneau}` : ''}`,
        `👥 **${membres.length}** participant(s)${salon ? ` (vocal « ${salon} »)` : (membres.length ? '' : ' — *personne en vocal, ajoute l\'équipe à la main*')}`,
        `➡️ Préparez-la dans ${lien}.`,
      ].join('\n') }).catch(() => {});
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
        // Retour client : on lui demande son avis en MP (suivi qualité / réputation).
        if (rdv.clientId && !rdv.satisfaction) {
          const rowSat = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId(`rdvp_sat::${rdvId}::bien`).setEmoji('👍').setLabel('Satisfait').setStyle(ButtonStyle.Success),
            new ButtonBuilder().setCustomId(`rdvp_sat::${rdvId}::moyen`).setEmoji('😐').setLabel('Mitigé').setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`rdvp_sat::${rdvId}::mauvais`).setEmoji('👎').setLabel('Mécontent').setStyle(ButtonStyle.Danger),
          );
          const embSat = new EmbedBuilder().setColor(COL.or).setTitle('✦ Votre avis nous intéresse')
            .setDescription(`Merci d'avoir fait appel à l'**Iron Wolf Company** (réf. \`${rdv.id}\`).\nComment s'est passée la prestation ? Un simple clic nous aide à nous améliorer.`)
            .setFooter({ text: 'Iron Wolf Company · Bureau des Rendez-vous' });
          try { const u = await interaction.client.users.fetch(rdv.clientId); await u.send({ embeds: [embSat], components: [rowSat] }); } catch {}
        }
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
      // Rappel à l'AGENT assigné, 1 h avant la mission.
      if (rdv.agentId && mins > 5 && mins <= 60 && !rdv.sent['agent1h']) {
        try {
          const ag = await guild.client.users.fetch(rdv.agentId);
          await ag.send({ embeds: [new EmbedBuilder().setColor(COL.vert).setTitle('🤝 Ta mission commence dans 1 heure').setDescription([`RÉF **${rdv.id}** STOP TU ES L'AGENT ASSIGNÉ STOP`, `PRESTATION ${TYPES[rdv.typeKey]?.label || '—'} STOP LIEU ${LIEUX[rdv.lieuKey] || '—'} STOP`, `CLIENT ${rdv.nomRP || '—'} STOP QUAND ${tsR(dt)} STOP`].join('\n')).setFooter({ text: 'Iron Wolf Company · Bureau des Rendez-vous' })] });
        } catch {}
        rdv.sent['agent1h'] = true; changed = true;
      }
    }
    if (changed) _persist(db);
  } catch (e) { console.log('[RDV+] checkRappelsClients erreur:', e?.message); }
}

module.exports = { routeInteraction, checkRappelsClients, rdvplusCommands, panelPayload, _test: { CHAMPS_PRESTATION, _satLabel } };
module.exports.__test = { PRESTA_TO_CAT, _membresVocalHRP, TYPES, LIEUX }; // tests uniquement
