// ───────────────────────────────────────────────────────────────────────────
//  rumeurs.js — Rumeurs & événements : le bot lâche des accroches RP
//  ----------------------------------------------------------------------------
//  Auto : 2 rumeurs/jour (13h et 20h, heure de Paris) dans le salon choisi.
//  /rumeur          → lâcher une rumeur tout de suite (ici)        [Direction]
//  /rumeurs-salon   → définir CE salon pour les rumeurs auto        [Direction]
//
//  Identifiants isolés : rum_*  ·  Salon stocké dans db.rumeursChannelId
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const COL = 0x6B4F2A;
const DIRECTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}

// ── Lieux (RDR2) ──
const LIEUX = [
  'Valentine', 'Saint-Denis', 'Rhodes', 'Strawberry', 'Blackwater', 'Annesburg', 'Van Horn',
  'Armadillo', 'Tumbleweed', 'Emerald Ranch', 'Lagras', 'Thieves Landing', 'la route de Scarlett Meadows',
  'le bayou de Lemoyne', 'les hauteurs de Roanoke', 'Flatneck Station', 'les plaines du Heartland',
  'Manzanita Post', 'Fort Mercer', 'les abords de Cumberland Forest',
];

// ── Attributions (saveur, en bas de la rumeur) ──
const SOURCES = [
  'murmure entendu au saloon', 'confidence d\'un voyageur', 'ragot de comptoir',
  'bruit qui court en ville', 'tuyau d\'un éclaireur', 'rumeur colportée sur la route',
  'on-dit d\'un palefrenier', 'racontar d\'un joueur de cartes', 'chuchotement de fin de soirée',
];

// ── Rumeurs (le {lieu} est tiré au sort) ──
const RUMEURS = [
  // 💰 Argent / convois
  'Un convoi d\'or quitterait {lieu} avant l\'aube, et l\'escorte serait bien maigre pour une telle cargaison.',
  'La banque de {lieu} aurait reçu une livraison peu commune. Ses coffres n\'auraient jamais été aussi pleins.',
  'La paie des mineurs serait acheminée vers {lieu} cette semaine. Beaucoup de billets, bien peu de fusils.',
  // 🃏 Étrangers / danger
  'Un étranger au regard de glace rôde autour de {lieu} depuis deux jours. Personne ne sait ce qu\'il attend.',
  'Des cavaliers masqués auraient été aperçus près de {lieu}, à la tombée de la nuit.',
  'Méfiance sur la route de {lieu} : des hommes armés s\'y tiendraient tapis dans les rochers.',
  // 🐎 Bétail / chevaux
  'Tout un troupeau se serait volatilisé près de {lieu}. Voleurs, ou pire ?',
  'Les plus belles montures du coin auraient disparu des écuries de {lieu}. Curieux, non ?',
  // 👮 Loi / primes
  'Le bureau du shérif de {lieu} s\'apprêterait à afficher une prime juteuse. De quoi tenter les audacieux.',
  'Un homme recherché aurait été reconnu en ville à {lieu}. La récompense ferait tourner des têtes.',
  'Un marshal serait en route pour {lieu}. Certains feraient mieux de se faire oublier.',
  // 🤝 Alliances / trahisons
  'On murmure qu\'un pacte se négocie à {lieu}… et que quelqu\'un compte bien le faire capoter.',
  'Une poignée de main à {lieu} cacherait un couteau dans le dos. Reste à savoir pour qui.',
  // 🥃 Contrebande
  'Des caisses de whisky de contrebande passeraient par {lieu} cette nuit. Le genre de cargaison qui attire les ennuis.',
  'Une cargaison de marchandise interdite changerait de mains à {lieu}. Discrètement. Trop, peut-être.',
  // 💎 Trésor / mystère
  'Un vieux mineur éméché jurait à {lieu} connaître l\'emplacement d\'un magot enterré.',
  'Une carte déchirée circulerait à {lieu}. Sa moitié manquante vaudrait une fortune.',
  'Une lettre cachetée passerait de main en main à {lieu}, promettant monts et merveilles.',
  // 🚂 Train / diligence
  'La diligence de {lieu} transporterait bien plus que du courrier ce soir.',
  'Le prochain train à quitter {lieu} aurait un wagon qu\'on surveille de très près.',
  // ⚔️ Tensions / ambiance
  'Deux familles se regarderaient en chiens de faïence à {lieu}. Ça pourrait éclater d\'un instant à l\'autre.',
  'Le saloon de {lieu} serait devenu le repaire d\'une bande peu recommandable.',
  'On raconte qu\'à {lieu}, quelqu\'un paierait grassement pour une besogne qu\'on ne raconte pas.',
  'Un incendie de grange à {lieu} n\'aurait rien d\'un accident, à en croire les mauvaises langues.',
  // ⚖️ Iron Wolf Company (légal — mercenaires : escorte, protection, traque, sécurité d\'événement)
  'Un riche notable de {lieu} chercherait des fusils sûrs pour escorter un chargement — l\'Iron Wolf Company serait sur les rangs.',
  'On dit qu\'un marchand de {lieu} dort mieux depuis qu\'un Loup de Fer veille sur sa cargaison.',
  'Une prime déposée à {lieu} attendrait preneur pour la capture d\'un homme recherché — du travail taillé pour la Compagnie.',
  'Le comptoir de {lieu} murmure que l\'Iron Wolf Company aurait décroché un contrat qui fera parler.',
  'Un convoi cherche escorte du côté de {lieu} : beaucoup de risques, et un seul nom revient — Iron Wolf Company.',
  'On raconte qu\'à {lieu}, un événement se prépare, et que la sécurité serait confiée aux Loups de Fer.',
  'Des concurrents jaloux colporteraient des ragots sur l\'Iron Wolf Company à {lieu}. Signe qu\'elle dérange.',
  // 🐺 La Confrérie (illégal — ombre, contrebande, renseignement)
  'On chuchote qu\'un homme cherche à entrer en contact avec La Confrérie du côté de {lieu}. À ses risques et périls.',
  'Une cargaison sensible changerait de mains à {lieu} — certains y voient déjà la patte de La Confrérie.',
  'À {lieu}, on jure que rien ne se trame dans l\'ombre sans que La Confrérie n\'en touche un mot.',
  'Un indic trop bavard aurait disparu près de {lieu}. La Confrérie n\'aime pas les langues qui claquent.',
  'Des hommes de loi fureteraient autour de {lieu}, persuadés d\'y trouver une piste vers La Confrérie.',
  'On murmure qu\'un rival monterait un coup contre La Confrérie à {lieu}. Mauvaise idée, dit-on.',
  'Une vieille dette se réglerait à {lieu} cette nuit — et le créancier porterait les couleurs de La Confrérie.',
];

function pick(a) { return a[Math.floor(Math.random() * a.length)]; }

function genererRumeur() {
  const texte = pick(RUMEURS).replace('{lieu}', pick(LIEUX));
  const source = pick(SOURCES);
  return { texte, source };
}

function embedRumeur() {
  const { texte, source } = genererRumeur();
  return new EmbedBuilder()
    .setColor(COL)
    .setTitle('🃏 ON RACONTE QUE…')
    .setDescription(`*« ${texte} »*\n\n— ${source}`)
    .setFooter({ text: 'Iron Wolf Company • une piste à creuser, pour qui ose' });
}

async function posterRumeur(client) {
  try {
    const db = loadDB();
    const chId = db.rumeursChannelId;
    if (!chId) return false;
    const ch = await client.channels.fetch(chId).catch(() => null);
    if (!ch) return false;
    await ch.send({ embeds: [embedRumeur()] }).catch(() => {});
    return true;
  } catch { return false; }
}

// ── Planification interne : vérifie toutes les 15 min, poste à 13h et 20h (Paris) ──
let _interval = null;
let _lastKey = null;
const HEURES = [13, 20];

function _maybePost(client) {
  try {
    const now = new Date();
    const h = Number(now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', hour: 'numeric', hour12: false }));
    if (!HEURES.includes(h)) return;
    const jour = now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
    const key = `${jour}-${h}`;
    if (_lastKey === key) return; // déjà posté à cette heure aujourd'hui
    _lastKey = key;
    posterRumeur(client);
  } catch {}
}

function init(client) {
  if (_interval) clearInterval(_interval);
  _interval = setInterval(() => _maybePost(client), 15 * 60 * 1000);
  console.log('✅ Rumeurs : planification active (13h & 20h)');
}

const rumeursCommands = [
  new SlashCommandBuilder().setName('rumeur').setDescription('🃏 Lâcher une rumeur maintenant dans ce salon (Direction)'),
  new SlashCommandBuilder().setName('rumeurs-salon').setDescription('🃏 Définir CE salon pour les rumeurs automatiques (Direction)'),
];

async function routeInteraction(interaction) {
  try {
    if (!interaction.isChatInputCommand?.()) return false;

    if (interaction.commandName === 'rumeurs-salon') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      db.rumeursChannelId = interaction.channelId;
      persist(db);
      await interaction.reply({ content: '✅ Les rumeurs automatiques seront postées **ici** (2 fois par jour, à 13h et 20h).', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    if (interaction.commandName === 'rumeur') {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.channel?.send({ embeds: [embedRumeur()] }).catch(() => {});
      await interaction.reply({ content: '🃏 Rumeur lâchée.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ rumeurs routeInteraction:', e.message);
    return true;
  }
}

module.exports = { rumeursCommands, routeInteraction, init, posterRumeur };
