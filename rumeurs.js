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
  // ── Lancement / on commence à parler de vous ──
  'Une nouvelle compagnie de fusils à louer ferait parler d\'elle dans tout l\'Ouest — l\'Iron Wolf Company, qu\'on dit réglée comme du papier à musique.',
  'À {lieu}, on commence à murmurer le nom d\'une bande d\'hommes en règle qui loue ses services : escorte, protection, traque. Des professionnels, paraît-il.',
  'Le nom de l\'Iron Wolf Company circule de saloon en saloon depuis peu. On les dit sérieux, et chers.',
  'Un marchand de {lieu} se vante d\'avoir engagé ces fameux Loups de Fer. Très satisfait du travail, à ce qu\'il raconte.',
  'Certains chuchotent que derrière la respectable Iron Wolf Company se cacherait une autre organisation, bien plus discrète. Sornettes, sans doute.',
  'On dit qu\'une nouvelle force s\'organise dans la région. Deux visages : l\'un au grand jour, l\'autre dans l\'ombre.',
  'Les premiers contrats de l\'Iron Wolf Company feraient déjà jaser à {lieu}. Du travail propre, à ce qu\'on entend.',
  'À {lieu}, on se demande qui sont ces Loups de Fer apparus récemment. Des fusils à louer, mais avec un code, dit-on.',
  'Une compagnie flambant neuve aurait planté son drapeau dans l\'Ouest. On parle déjà de ses services jusqu\'à {lieu}.',
  'Le bouche-à-oreille va bon train : l\'Iron Wolf Company chercherait à se faire un nom, et les premiers clients suivraient.',
  // ── Compagnie — ce qu'ils ont fait ──
  'On raconte que l\'Iron Wolf Company a mené un convoi jusqu\'à {lieu} sans perdre un seul homme ni une seule caisse.',
  'Un notable de {lieu} dormirait sur ses deux oreilles depuis qu\'il a confié sa protection aux Loups de Fer.',
  'La traque d\'un hors-la-loi près de {lieu} aurait été bouclée en deux jours par l\'Iron Wolf Company. Du travail rapide.',
  'Une fête à {lieu} se serait déroulée sans le moindre incident — la sécurité était assurée par les Loups de Fer.',
  'On dit que pas un bandit n\'a osé approcher la diligence escortée par l\'Iron Wolf Company jusqu\'à {lieu}.',
  'Un commerçant de {lieu} jure que les Loups de Fer ont récupéré son dû sans casse ni esclandre. Du travail de pro.',
  'Depuis que l\'Iron Wolf Company veille sur les abords de {lieu}, les rôdeurs se feraient bien plus rares.',
  'Une prime réclamée à {lieu} aurait été honorée par les Loups de Fer — l\'homme recherché livré vivant, comme convenu.',
  'On murmure que l\'Iron Wolf Company refuse certains contrats. Une question de principes, paraît-il. Ça force le respect.',
  'Un convoi d\'or serait passé par {lieu} sous escorte des Loups de Fer. Personne n\'a tenté sa chance.',
  'Un éleveur de {lieu} aurait retrouvé son troupeau volé grâce à l\'Iron Wolf Company. Les voleurs, eux, n\'ont pas eu cette chance.',
  'On raconte qu\'un riche voyageur a traversé tout le comté sous la garde des Loups de Fer. Pas une éraflure.',
  // ── Confrérie — ce qu'ils ont fait ──
  'On chuchote qu\'une affaire trouble à {lieu} s\'est réglée en une seule nuit. La Confrérie n\'y serait pas étrangère.',
  'Un homme qui parlait trop fort à {lieu} aurait soudain appris à se taire. La Confrérie n\'aime pas le bruit.',
  'Une cargaison aurait disparu d\'un entrepôt de {lieu} sans laisser la moindre trace. Du travail d\'orfèvre.',
  'On raconte qu\'à {lieu}, une dette qu\'on croyait oubliée a retrouvé son créancier. La Confrérie a la mémoire longue.',
  'Des renseignements précieux auraient changé de mains du côté de {lieu}. Derrière, l\'ombre de La Confrérie.',
  'Un rival qui visait trop haut à {lieu} aurait été remis à sa place. Discrètement. Définitivement.',
  'On murmure que rien n\'entre ni ne sort de {lieu} sans que La Confrérie ne finisse par le savoir.',
  'Une caravane de marchandises sans papiers serait passée par {lieu} sous une protection bien silencieuse.',
  'Un indic du shérif de {lieu} aurait brusquement changé d\'avis. On dit que La Confrérie sait se montrer convaincante.',
  'À {lieu}, on parle à voix basse d\'une main qui tire les ficelles sans jamais se montrer.',
  'Une porte fermée à clé n\'aurait pas suffi à arrêter La Confrérie du côté de {lieu}. Étonnant, non ?',
  'On dit qu\'à {lieu}, ceux qui doivent de l\'argent à la mauvaise personne finissent toujours par payer. D\'une façon ou d\'une autre.',
  // ── La loi face à eux ──
  'Le shérif de {lieu} enrage : il sait qu\'une organisation opère dans l\'ombre, mais ne trouve pas la moindre preuve.',
  'Des marshals poseraient des questions à {lieu} au sujet d\'une certaine Confrérie. Ils repartiraient les mains vides.',
  'On dit qu\'à {lieu}, même les hommes de loi hésitent à s\'en prendre aux Loups de Fer — tout est bien trop en règle.',
  'Un agent de la loi aurait juré de démanteler La Confrérie. On ne l\'aurait plus beaucoup entendu depuis.',
  // ── Réputation qui grandit ──
  'Le nom des Loups de Fer commence à inspirer le respect, de {lieu} jusqu\'aux montagnes.',
  'On dit qu\'à {lieu}, quand on a un problème qu\'on ne peut régler seul, il y a deux noms qu\'on murmure tout bas.',
  'La réputation de l\'Iron Wolf Company grandit : on les dit chers, mais on les dit fiables. Rare, par les temps qui courent.',
  'À {lieu}, certains préfèrent payer les Loups de Fer plutôt que de risquer leur peau. Sage décision.',
  'On raconte que les ennemis de La Confrérie ont une fâcheuse tendance à disparaître des conversations.',
  'De {lieu} aux comtés voisins, on commence à dire qu\'il vaut mieux avoir les Loups de Fer avec soi que contre soi.',
  // ── Clients qui les cherchent ──
  'Un riche propriétaire de {lieu} chercherait à s\'attacher les services des Loups de Fer pour toute la saison.',
  'On dit qu\'à {lieu}, quelqu\'un aurait laissé un message à l\'attention de La Confrérie. Reste à savoir s\'ils daigneront répondre.',
  'Une banque de {lieu} envisagerait d\'engager l\'Iron Wolf Company pour ses transferts. Prudence bien légitime.',
  'Un homme aux abois à {lieu} aurait sollicité La Confrérie pour un service que la loi ne pouvait pas lui rendre.',
  'Un convoi important quitterait bientôt {lieu}, et son propriétaire chercherait des fusils sûrs. Les Loups de Fer seraient sur les rangs.',
  'On murmure qu\'un notable de {lieu} aurait pris contact avec l\'ombre. Ce qu\'il cherche à régler, nul ne le sait.',
  // ── Mélange / ambiance ──
  'Un différend entre deux familles de {lieu} se serait éteint du jour au lendemain. Certains parlent d\'une médiation... musclée.',
  'On raconte que les Loups de Fer auraient escorté un chargement de médicaments jusqu\'à {lieu}, malgré les routes peu sûres.',
  'Un joueur ruiné à {lieu} aurait juré que La Confrérie tenait la moitié des tables de la ville. Il a vite changé de sujet.',
  'Des hommes en règle auraient monté la garde toute une nuit devant une demeure de {lieu}. Au matin, tout était intact.',
  'On dit qu\'une lettre de menace reçue à {lieu} aurait trouvé une réponse. La Confrérie sait répondre au courrier.',
  'Un prisonnier en transfert près de {lieu} serait arrivé à bon port grâce aux Loups de Fer. La loi leur en serait presque reconnaissante.',
  'À {lieu}, on raconte qu\'un entrepôt change de propriétaire chaque fois que La Confrérie passe par là. Coïncidence ?',
  'Un marchand qui refusait de payer sa protection à {lieu} aurait soudain reconsidéré la question. Sans qu\'on ait à hausser le ton.',
  'On dit que les Loups de Fer auraient sécurisé toute une foire à {lieu}. Pas un vol, pas une bagarre. Du jamais-vu.',
  'Une cargaison interceptée par la loi près de {lieu} aurait mystérieusement disparu du dépôt des preuves. La Confrérie a le bras long.',
  'On murmure qu\'à {lieu}, une vieille rancune s\'est éteinte dans le silence. Personne ne pose de questions.',
  'Un homme d\'affaires de {lieu} dormirait mieux depuis qu\'il a réglé ses comptes avec l\'ombre. Ou depuis qu\'elle a réglé les siens.',
  'On raconte que l\'Iron Wolf Company aurait retrouvé une personne disparue du côté de {lieu}. Discrétion et efficacité, comme toujours.',
  'Le saloon de {lieu} bruisse d\'une histoire : deux organisations, un seul drapeau, et bien des secrets entre les deux.',
  'On dit qu\'à {lieu}, mieux vaut ne pas demander d\'où viennent certaines marchandises ni où vont certains hommes.',
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
//  Robuste : rattrapage si le bot était hors-ligne à l'heure pile, anti-doublon
//  persistant (db.rumeursLastSlot) qui survit aux redémarrages, et vérif au démarrage.
let _interval = null;
const HEURES = [13, 20];

function _maybePost(client) {
  try {
    const db = loadDB();
    if (!db.rumeursChannelId) return; // aucun salon défini → rien à poster
    const now = new Date();
    const h = parseInt(now.toLocaleString('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', hour12: false }), 10);
    const jour = now.toLocaleString('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit' });
    const passes = HEURES.filter(x => h >= x);  // créneaux déjà atteints aujourd'hui
    if (passes.length === 0) return;            // aucun créneau encore passé
    const slot = Math.max(...passes);           // le plus récent (= rattrapage)
    const key = `${jour}-${slot}`;
    if (db.rumeursLastSlot === key) return;     // créneau déjà posté (anti-doublon persistant)
    db.rumeursLastSlot = key;
    persist(db);
    posterRumeur(client);
  } catch {}
}

function init(client) {
  if (_interval) clearInterval(_interval);
  try { _maybePost(client); } catch {}        // vérif immédiate au démarrage
  _interval = setInterval(() => _maybePost(client), 15 * 60 * 1000);
  console.log('✅ Rumeurs : planification active (13h & 20h, avec rattrapage)');
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
