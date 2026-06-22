require('dotenv').config();
const {
  Client, GatewayIntentBits, Partials,
  EmbedBuilder, ChannelType, ActivityType,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, MessageFlags,
  PermissionFlagsBits,
} = require('discord.js');
const cron = require('node-cron');

const { loadDB, saveDB, saveDBSync, sauvegarderSurGitHub, restaurerDepuisGitHub } = require('./db');
const { initPapiers, papiersCommands } = require('./papiers');
const securite = require('./securite');
const rdvplus = require('./rdvplus');

let notionExtra = {};
try { notionExtra = require('./notion-extra'); console.log('✅ Module notion-extra chargé'); }
catch (e) { console.log('⚠️ notion-extra non chargé:', e.message); }

let notionModules = {};
try { notionModules = require('./notion-modules-v2'); console.log('✅ Module notion-modules-v2 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v2 non chargé:', e.message); }

let notionV3 = {};
try { notionV3 = require('./notion-modules-v3'); console.log('✅ Module notion-modules-v3 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v3 non chargé:', e.message); }

let contratsConf = {};
try { contratsConf = require('./contrats-confrerie'); console.log('✅ Module contrats-confrerie chargé'); }
catch (e) { console.log('⚠️ contrats-confrerie non chargé:', e.message); }

let notionV4 = {};
try { notionV4 = require('./notion-modules-v4'); console.log('✅ Module notion-modules-v4 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v4 non chargé:', e.message); }

let notionV5 = {};
try { notionV5 = require('./notion-modules-v5'); console.log('✅ Module notion-modules-v5 chargé'); }
catch (e) { console.log('⚠️ notion-modules-v5 non chargé:', e.message); }

let operations = {};
try { operations = require('./operations'); console.log('✅ Module opérations chargé'); }
catch (e) { console.log('⚠️ operations non chargé:', e.message); }

let rumeurs = {};
try { rumeurs = require('./rumeurs'); console.log('✅ Module rumeurs chargé'); }
catch (e) { console.log('⚠️ rumeurs non chargé:', e.message); }

let inventaire = {};
try { inventaire = require('./inventaire'); console.log('✅ Module inventaire chargé'); }
catch (e) { console.log('⚠️ inventaire non chargé:', e.message); }

let diagnostic = {};
try { diagnostic = require('./diagnostic'); console.log('✅ Module diagnostic chargé'); }
catch (e) { console.log('⚠️ diagnostic non chargé:', e.message); }

let absences = {};
try { absences = require('./absences'); console.log('✅ Module absences chargé'); }
catch (e) { console.log('⚠️ absences non chargé:', e.message); }

let repertoire = {};
try { repertoire = require('./repertoire'); console.log('✅ Module répertoire chargé'); }
catch (e) { console.log('⚠️ répertoire non chargé:', e.message); }

let telegramme = {};
try { telegramme = require('./telegramme'); console.log('✅ Module télégrammes (conversations) chargé'); }
catch (e) { console.log('⚠️ telegramme non chargé:', e.message); }

let monitoring = {};
try { monitoring = require('./monitoring'); console.log('✅ Module monitoring chargé'); }
catch (e) { console.log('⚠️ monitoring non chargé:', e.message); }

let tableaubord = {};
try { tableaubord = require('./tableaubord'); console.log('✅ Module tableau de bord chargé'); }
catch (e) { console.log('⚠️ tableaubord non chargé:', e.message); }

let traque = {};
try { traque = require('./traque'); console.log('✅ Module traque (avis de recherche) chargé'); }
catch (e) { console.log('⚠️ traque non chargé:', e.message); }

let tenue = {};
try { tenue = require('./tenue'); console.log('✅ Module tenue (Le Vestiaire) chargé'); }
catch (e) { console.log('⚠️ tenue non chargé:', e.message); }

let reseau = {};
try { reseau = require('./reseau'); console.log('✅ Module reseau (Le Réseau d\'informateurs) chargé'); }
catch (e) { console.log('⚠️ reseau non chargé:', e.message); }

let factures = {};
try { factures = require('./factures'); console.log('✅ Module factures (Facturation) chargé'); }
catch (e) { console.log('⚠️ factures non chargé:', e.message); }

const { fmtLong, fmtShort, daysSince, parisOffsetHours, _fmtDollars } = require('./utils');
const parrainage = require('./parrainage');
parrainage.init({ isDirection, isMembre });

process.on('unhandledRejection', (reason, promise) => {
  console.log('⚠️ Unhandled Rejection:', reason?.message || reason);
  if (reason?.stack) console.log(reason.stack.split('\n').slice(0,5).join('\n'));
  try { monitoring.logTech?.(client, 'error', '⚠️ Erreur non gérée', (reason?.message || String(reason)) + (reason?.stack ? '\n```\n' + reason.stack.split('\n').slice(0, 4).join('\n') + '\n```' : '')); } catch {}
});
process.on('uncaughtException', err => {
  console.log('⚠️ Uncaught Exception:', err?.message || err);
  if (err?.stack) console.log(err.stack.split('\n').slice(0,8).join('\n'));
});
process.on('SIGTERM', () => { saveDBSync(); process.exit(0); });
process.on('SIGINT',  () => { saveDBSync(); process.exit(0); });

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers, GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions, GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildModeration, GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildPresences, GatewayIntentBits.GuildInvites,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Message, Partials.Reaction, Partials.User, Partials.Channel, Partials.GuildMember],
});
initPapiers(client);
securite.initSecurite(client);
operations.init?.({
  creerOperationNotion: (op) => notionExtra.creerOperationNotion?.(op),
  poleRoleId: (guild, pole) => _poleRoleId(guild, pole),
  journalHook: async (guild, op) => {
    try { await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' }); } catch {}
    try { await ajouterJournalIC(guild, { type: 'operation', titre: `Nouvelle opération — ${op.name}`, description: `📍 ${op.lieu} · Objectif : ${op.objectif} · Pôle : ${op.pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`, auteur: 'Commandement' }); } catch {}
  },
});

const {
  CH, PARTICIPANTS_MAP, CONTRAT_ROLES, JUNE_MCCALL_ID,
  ROLE_POLE_LEGAL, ROLE_POLE_ILLEGAL, ROLE_ABSENT,
  MEMBRES_DISCORD_MAP, DISCORD_TO_IC,
  NOTION_RECRUTEMENT_DB, NOTION_MEMBRES_DB_ID: NOTION_MEMBRES_DB,
  SALON_IDS, _getPole,
} = require('./config');

function getChById(guild, salonKey, ...fallbackNames) {
  // D'abord chercher dans SALON_IDS (config.js)
  const id = SALON_IDS?.[salonKey];
  if (id) { const ch = guild.channels.cache.get(id); if (ch) return ch; }
  // Ensuite dans SALON_HARDCODED (IDs hardcodés IWC)
  if (typeof SALON_HARDCODED !== 'undefined' && SALON_HARDCODED[salonKey]) {
    const ch = guild.channels.cache.get(SALON_HARDCODED[salonKey]);
    if (ch) return ch;
  }
  // Fallback par nom
  for (const name of fallbackNames) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

// ── IDs Rôles hardcodés (fallback si config.js incomplet) ──
const ROLE_ABSENT_ID = '1511134028474876035';
// Surcharger ROLE_ABSENT si non défini dans config.js
const _ROLE_ABSENT_FINAL = ROLE_ABSENT || ROLE_ABSENT_ID;

// ── IDs Salons hardcodés (source: config Discord IWC) ──
const SALON_HARDCODED = {
  JOURNAL_DE_BORD:      '1508756535407542372',
  CONTRATS:             '1508756442730074222',
  CONTRATS_REPONSES:    '1518392786301227250',
  OPERATIONS:           '1508756486892027904',
  COFFRE_ENTREPRISE:    '1508756453354373202',
  COFFRE_ILLEGAL:       '1508756490432024636',
  ABSENCES:             '1509718164760563743',
  AFFAIRES_LEGAL:       '1508756508362674337',
  AFFAIRES_ILLEGAL:     '1509254234413994004',
  DOSSIER_RECRUTEMENT:  '1509252295127466096',
  PLANS:                '1508756493845925960',   // #plans (séparé d'informateurs)
  INFORMATEURS:         '1509255294184853524',   // #informateurs
};
const NOTION_TRANSACTIONS_DB = '36ff4436a86c80ecb4a9ebcabc104a07';

const REGLEMENT_CHUNKS = [
  `# 🐺 RÈGLEMENT — LA CONFRÉRIE

> *Ici, on ne hausse pas le ton. On agit. Et on joue le jeu — tous, sans exception.*

Bienvenue dans **La Confrérie**. Ce règlement protège deux choses : le **respect entre nous** et la **qualité de nos histoires**. Le lire et l'appliquer, c'est la première preuve de sérieux qu'on attend de toi.

Il se divise en deux blocs : **la vie sur le serveur** et **les règles du RP**.

**Petit rappel :**
- **RP** *(RolePlay)* → tu **incarnes ton personnage**, dans l'Ouest, à son époque.
- **HRP** *(Hors-RP)* → toi, le joueur, **en dehors** du personnage. Réservé aux salons et marqueurs prévus.

**En restant sur ce serveur et en validant ce règlement (réaction ✅), tu en acceptes chaque point.**

# 🏛️ PARTIE I — LA VIE SUR LE SERVEUR

## Article 1 — Respect & savoir-vivre
- Le respect est la règle n°1, sans exception : pas d'insultes, de harcèlement, de menaces ni de mépris envers qui que ce soit.
- Aucune discrimination tolérée (origine, religion, genre, orientation, handicap…) → exclusion immédiate.
- Les conflits personnels se règlent en privé ou avec le Staff, **jamais** en public. On ne ramène pas le drama dans les salons.
- On reste courtois même en désaccord. La Confrérie se reconnaît à son sang-froid.

## Article 2 — Contenu interdit
- Aucun contenu choquant, violent gratuit, gore ou à caractère sexuel (NSFW).
- Aucun contenu illégal dans la vraie vie, ni incitation à la haine ou à la violence réelle.
- Pas de sujets sensibles hors-jeu (politique réelle, religion, débats clivants).
- Pas de partage d'informations personnelles d'autrui (doxxing) → sanction lourde et définitive.`,
  `## Article 3 — Spam & publicité
- Pas de spam : flood, messages répétés, abus de mentions (@everyone, @here) ou de réactions.
- Aucune publicité (autre serveur, chaîne, projet) sans accord écrit du Staff.
- Pas de pub ni de démarchage dans les messages privés des membres.
- On poste dans le bon salon, en restant dans le sujet du canal.

## Article 4 — Pseudo & identité
- Pseudo Discord lisible et mentionnable. Rien de provocant, offensant ou imprononçable.
- Interdiction d'usurper l'identité d'un membre, du Staff ou du bot.
- Ton identité de personnage (IC) se déclare là où c'est prévu — on ne mélange pas les comptes.

## Article 5 — Vocal (Discord)
- Mêmes règles qu'à l'écrit : respect, pas d'insultes, pas de propos déplacés.
- Pas de gêne sonore : larsen, musique non désirée, cris, soundboard abusif.
- **Aucun enregistrement** d'un vocal sans l'accord clair de tous les participants.
- On ne sature pas un salon et on évite de couper la parole.

## Article 6 — Engagement & activité
- La Confrérie est vivante : présence et implication régulières attendues.
- Toute absence prolongée se signale dans **#absences** — c'est respectueux et ça évite les mauvaises surprises.
- Une inactivité trop longue sans nouvelle peut entraîner un passage en statut inactif, voire un retrait des rangs.
- On prévient quand on ne peut pas honorer un rendez-vous ou une opération.

## Article 7 — Hiérarchie & Staff
- La hiérarchie se respecte, en RP comme sur le serveur.
- Les décisions du Staff s'appliquent. Un désaccord se discute calmement, en privé, **après** application.
- Pour toute question, signalement ou litige : on contacte le Staff via les canaux prévus, sans spam.
- Le Staff peut intervenir, trancher et adapter le règlement selon les situations, dans l'intérêt du serveur.`,
  `# 🎭 PARTIE II — LES RÈGLES DU RP (FAIR-PLAY)

*Enfreindre ces règles, ce n'est pas « gagner » — c'est gâcher la scène des autres.*

## Article 8 — Séparation RP / HRP
- En zone ou vocal **RP**, tu restes **en personnage**, tout le temps.
- Le hors-RP passe par les **salons HRP** ou un marqueur clair (ex. \`(( ... ))\`), et reste rare et bref.
- On ne « casse » jamais une scène pour un détail HRP (voir Article 17).

## Article 9 — Metagaming INTERDIT *(infos HRP ≠ RP)*
- **Aucune information apprise en HRP** (Discord, stream, vocal externe, message privé…) ne peut être utilisée par ton personnage en jeu.
- Ton perso **ne sait que ce qu'il a vu ou entendu EN RP**, de ses propres yeux et oreilles.
- Exemple interdit : apprendre une planque sur Discord, puis « comme par hasard » y débarquer en RP.

## Article 10 — Double VOC INTERDIT
- Pendant le RP, tu ne peux être connecté qu'à **UNE seule communication vocale** : celle du jeu.
- **Interdiction d'être en parallèle sur un autre vocal** (Discord, TeamSpeak, appel privé…) avec d'autres joueurs pendant une scène.
- Pourquoi : le double VOC sert quasi toujours à faire passer des **infos hors-RP** (metagaming) — un perso « muet » en jeu qui balance tout à ses alliés à côté. C'est de la triche → sanction directe.

## Article 11 — Powergaming INTERDIT
- On **n'impose pas** ses actions aux autres : on laisse toujours une **chance de réagir** (\`/me\`, \`/do\`).
- Pas d'actions **irréalistes** ou impossibles pour la force/époque de ton personnage.
- Une action subie se **négocie en RP**, elle ne se décrète pas.

## Article 12 — God-mode & No-life RP
- Ton personnage **n'est pas invincible** : il saigne, il a peur, il peut mourir.
- On **assume les conséquences** de ses actes (blessure, capture, mort) sans pleurnicher en HRP.
- Ignorer une blessure grave ou « oublier » qu'on est menacé = God-mode, interdit.`,
  `## Article 13 — Value of Life / Peur RP
- Ton personnage **tient à sa vie**. Face à une arme braquée sur lui, il a **peur** et réagit en conséquence.
- On ne se jette pas bêtement dans la mort, on ne joue pas les héros suicidaires.
- Un adversaire armé ou un groupe en supériorité, **ça se respecte** en RP.

## Article 14 — RDM / Initiation obligatoire
- **RDM interdit** : pas de tir ni de meurtre **sans raison RP valable**.
- **Initiation obligatoire** : toute action hostile (braquage, agression, kidnapping) commence par une **interaction RP** (menace, sommation) — jamais un kill instantané « sorti de nulle part ».
- Pas de **charge au cheval / écrasement** gratuit pour tuer sans RP.

## Article 15 — Cohérence : époque & lore
- On reste dans l'**Ouest, fin du XIXᵉ** : pas d'anachronismes, pas de références modernes.
- Comportement, langage et tenue **collent au décor** et à l'univers de la Confrérie.

## Article 16 — Mort & conséquences
- En cas de mort RP, ton personnage **oublie les circonstances exactes** de sa mort (sauf décision RP / CK validée).
- On respecte **en plus** les règles de mort du serveur sur lequel on joue.
- Pas de « revenge kill » HRP juste après une mort.

## Article 17 — Un souci en pleine scène ?
- On **ne casse pas le RP** en plein milieu. On termine la scène proprement.
- Un problème HRP (triche, litige) se note **discrètement** et se règle **après**, avec le Staff — preuves à l'appui (clips, captures).

# 🔪 PARTIE III — L'OMBRE DE LA CONFRÉRIE

## Article 18 — Discrétion & confidentialité
- Ce qui se joue dans les opérations **reste dans la Confrérie**. Aucune fuite d'info en HRP, aucune capture partagée à l'extérieur sans aval de la Direction.
- La force de la Confrérie, c'est l'**ombre, la tête froide et la pression** — pas la violence gratuite.
- Toute trahison de cette confidentialité est traitée avec la plus grande sévérité.`,
  `# ⚠️ SANCTIONS

Le non-respect du règlement entraîne, selon la gravité :

1. **Avertissement** — rappel à l'ordre officiel.
2. **Exclusion temporaire** (mute / mise à l'écart).
3. **Expulsion** du serveur.
4. **Bannissement** définitif.

- Les fautes graves (discrimination, doxxing, raid, triche, fuite Confrérie…) peuvent **sauter les étapes** et mener directement au bannissement.
- Le cumul d'avertissements entraîne une **montée automatique** des sanctions.
- Le Staff apprécie chaque situation **au cas par cas** — l'esprit du règlement prime sur sa lettre.

## ✅ Acceptation

En validant ce règlement (réaction ✅) et en jouant parmi nous, tu reconnais l'avoir **lu, compris et accepté dans son intégralité**.
Le fair-play n'est pas une contrainte : c'est ce qui rend nos histoires inoubliables.

> *La Confrérie n'oublie rien. Elle n'oublie personne.*
> **— La Direction**`,
];


function getChHard(guild, key) {
  const id = SALON_HARDCODED[key];
  if (!id) return null;
  return guild.channels.cache.get(id) || null;
}

// Retourne le salon #absences (salon unique pour tous)
function getAbsencesCh(guild, member) {
  // Salon ABSENCES unique pour tout le monde
  const ch = guild.channels.cache.get(SALON_HARDCODED.ABSENCES);
  if (ch) return ch;
  // Filets de sécurité : chercher par nom si l'ID ne correspond pas
  return getChById(guild, 'ABSENCES', 'absences', 'absence', 'congés', 'conges') || null;
}

// Archive un contrat signé/refusé dans #contrats-reponses avec un thread par contrat
async function archiverContratReponses(guild, contrat, statut, embed) {
  try {
    const ch = getChHard(guild, 'CONTRATS_REPONSES') || guild.channels.cache.get('1518392786301227250');
    if (!ch) return;
    const threadName = `${statut === 'signe' ? '✅' : '❌'} ${contrat.id} — ${(contrat.objet || '').slice(0, 50)}`;
    // Chercher si un thread existe déjà pour ce contrat
    let thread = ch.threads?.cache.find(t => t.name.includes(contrat.id));
    if (!thread) {
      try {
        // Chercher dans les threads archivés aussi
        const archived = await ch.threads.fetchArchived().catch(() => null);
        if (archived) thread = archived.threads.find(t => t.name.includes(contrat.id));
      } catch {}
    }
    if (!thread) {
      // Créer un thread sans message parent épinglé
      try {
        thread = await ch.threads.create({
          name: threadName,
          autoArchiveDuration: 10080,
          type: 12, // PRIVATE_THREAD ou PUBLIC_THREAD selon le salon
          reason: `Contrat ${contrat.id}`,
        });
      } catch {
        // Fallback si threads.create non supporté → message + thread
        const msg = await ch.send({ content: `📋 **${threadName}**` });
        try { thread = await msg.startThread({ name: threadName, autoArchiveDuration: 10080 }); } catch {}
      }
    }
    if (thread) {
      await thread.send({ embeds: [embed] });
    } else {
      // Dernier fallback : envoyer directement dans le salon
      await ch.send({ embeds: [embed] });
    }
  } catch (e) { console.log('❌ archiverContratReponses error:', e.message); }
}

const SLASH_COMMANDS = [
  new SlashCommandBuilder().setName('stats').setDescription('Affiche les statistiques de la Compagnie'),
  new SlashCommandBuilder().setName('solde').setDescription('Affiche les soldes des coffres'),
  new SlashCommandBuilder().setName('fiche').setDescription("Affiche le dossier complet d'un membre").addUserOption(o => o.setName('membre').setDescription('Membre dont tu veux le dossier complet').setRequired(false)).addStringOption(o => o.setName('nom').setDescription('Ou recherche par nom de personnage').setRequired(false)),
  new SlashCommandBuilder().setName('ops').setDescription('Liste les opérations actives'),
  new SlashCommandBuilder().setName('absent').setDescription('🟡 Déclarer une absence'),
  new SlashCommandBuilder().setName('notes').setDescription('🕵️ Voir les dernières notes de terrain')
    .addStringOption(o => o.setName('filtre').setDescription('Filtrer par catégorie ou agent').setRequired(false))
    .addIntegerOption(o => o.setName('nombre').setDescription('Combien de notes (défaut 10)').setRequired(false)),
  new SlashCommandBuilder().setName('synthese').setDescription('🧠 Synthèse IA des infos sur un sujet ou une personne')
    .addStringOption(o => o.setName('sujet').setDescription('Nom de personne, lieu, ou thème').setRequired(true)),
  new SlashCommandBuilder().setName('rapport').setDescription('Envoie le rapport quotidien en DM (Direction)'),
  new SlashCommandBuilder().setName('promo').setDescription('Ouvre la gestion du grade d\'un membre (Concepteur/Fléau)').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('retro').setDescription('Ouvre la gestion du grade d\'un membre (Concepteur/Fléau)').addUserOption(o => o.setName('membre').setDescription('Membre').setRequired(true)),
  new SlashCommandBuilder().setName('tresor').setDescription('💰 Enregistrer une transaction'),
  new SlashCommandBuilder().setName('dashboard').setDescription('🐺 Tableau de bord complet de la faction'),
  new SlashCommandBuilder().setName('suivi').setDescription('📋 Vue globale : candidatures, contrats, opérations, RDV, trésorerie (Direction)'),
  new SlashCommandBuilder().setName('grade-set').setDescription('🎖️ Attribuer un grade à un membre (Direction)'),
  new SlashCommandBuilder().setName('hierarchie').setDescription('⚔️ Afficher le tableau hiérarchique'),
  new SlashCommandBuilder().setName('affaire').setDescription('📋 Soumettre une affaire à la Direction'),
  new SlashCommandBuilder().setName('journal').setDescription('📖 Journal IC de la Compagnie')
    .addStringOption(o => o.setName('type').setDescription('Filtrer par type').setRequired(false)
      .addChoices({ name: 'Tous', value: 'all' }, { name: 'Opérations', value: 'operation' }, { name: 'Contrats', value: 'contrat' }, { name: 'Recrutement', value: 'recrutement' }, { name: 'Trésorerie', value: 'tresorerie' }, { name: 'Promotions', value: 'promotion' }))
    .addIntegerOption(o => o.setName('page').setDescription('Numéro de page').setRequired(false)),
  new SlashCommandBuilder().setName('contrats-archives').setDescription('📜 Archives de tous les contrats')
    .addStringOption(o => o.setName('statut').setDescription('Filtrer par statut').setRequired(false)
      .addChoices({ name: 'Tous', value: 'tous' }, { name: 'Actifs', value: 'actif' }, { name: 'Refusés', value: 'refuse' }, { name: 'Expirés', value: 'expire' }))
    .addIntegerOption(o => o.setName('page').setDescription('Numéro de page').setRequired(false)),
  new SlashCommandBuilder().setName('profil').setDescription('👤 Affiche le profil d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel)').setRequired(false)),
  new SlashCommandBuilder().setName('bilan').setDescription('📊 Résumé trésorerie 7 derniers jours').addStringOption(o => o.setName('coffre').setDescription('Quel coffre ?').setRequired(false).addChoices({ name: '⚖️ Légal', value: 'legal' }, { name: '🔒 Illégal', value: 'illegal' })),
  new SlashCommandBuilder().setName('rdv').setDescription('📅 Créer un rendez-vous'),
  new SlashCommandBuilder().setName('agenda').setDescription('📅 Voir ou créer un RDV')
    .addSubcommand(s => s.setName('voir').setDescription('Voir les prochains RDV'))
    .addSubcommand(s => s.setName('creer').setDescription('Créer un nouveau RDV dans Notion')),
  new SlashCommandBuilder().setName('op-programmer').setDescription('🕐 Programmer une opération avec lancement automatique (Direction)'),
  new SlashCommandBuilder().setName('op-creer').setDescription('🎯 Créer une nouvelle opération (Direction)'),
  new SlashCommandBuilder().setName('setup-serveur').setDescription('🔧 Réorganiser la structure du serveur Discord (Fondateur uniquement)'),
  new SlashCommandBuilder().setName('aide').setDescription('📖 Guide des commandes disponibles'),
  new SlashCommandBuilder().setName('patch').setDescription('Deployer le patch note'),
  new SlashCommandBuilder().setName('version').setDescription('🔢 Version du bot et statut des connexions'),
  new SlashCommandBuilder().setName('sync').setDescription('🔄 Forcer une synchronisation manuelle (Direction)'),
  new SlashCommandBuilder().setName('avertir').setDescription('⚠️ Avertir un membre (Direction)').addUserOption(o => o.setName('membre').setDescription('Membre à avertir').setRequired(true)).addStringOption(o => o.setName('raison').setDescription('Raison de l\'avertissement').setRequired(true)),
  new SlashCommandBuilder().setName('avertissements').setDescription('📋 Voir les avertissements d\'un membre').addUserOption(o => o.setName('membre').setDescription('Membre (optionnel, défaut: toi)').setRequired(false)),
  new SlashCommandBuilder().setName('retour').setDescription('✅ Déclarer son retour d\'absence').addUserOption(o => o.setName('membre').setDescription('Membre (Direction uniquement — laisser vide pour soi-même)').setRequired(false)),
  new SlashCommandBuilder().setName('purge').setDescription('🗑️ Effacer les messages d\'un salon (Direction)').addIntegerOption(o => o.setName('nombre').setDescription('Nombre de messages à supprimer (1-100, défaut: tous)').setRequired(false).setMinValue(1).setMaxValue(100)),
  new SlashCommandBuilder().setName('annuler-absence').setDescription('🔓 Lever l\'absence d\'un membre (Direction)').addUserOption(o => o.setName('membre').setDescription('Membre dont lever l\'absence').setRequired(true)),
  new SlashCommandBuilder().setName('contrats').setDescription('📜 Voir mes contrats en cours'),
  new SlashCommandBuilder().setName('contrat-suivi').setDescription('🎮 Gérer une étape de contrat (en cours, honoré…) + coffre (Direction)'),
  new SlashCommandBuilder().setName('contrat-suivi-panneau').setDescription('📌 Installer le panneau permanent de gestion des contrats (Direction)'),
  new SlashCommandBuilder().setName('contrats-importer').setDescription('📥 Importer dans Discord les contrats ajoutés sur Notion (Direction)'),
  new SlashCommandBuilder().setName('recap').setDescription('📊 Ton récap : ce qui demande ton attention (Direction)'),
  new SlashCommandBuilder().setName('contrat-panel').setDescription('📋 Publier le panneau des contrats (Direction)'),
  new SlashCommandBuilder().setName('contrats-sync').setDescription('🔄 Resynchroniser tous les contrats avec Notion (Direction)'),
  new SlashCommandBuilder().setName('notion-test').setDescription('🔍 Tester la connexion Notion des contrats (Direction)'),
  new SlashCommandBuilder().setName('connecter-notion-contrats').setDescription('🔗 Connecter une base Notion aux contrats — coller le lien (Direction)').addStringOption(o => o.setName('lien').setDescription('Lien de ta base Notion (··· en haut à droite → Copier le lien)').setRequired(true)),
  new SlashCommandBuilder().setName('stats-agent').setDescription('📊 Statistiques de renseignement par agent')
    .addStringOption(o => o.setName('agent').setDescription('Nom d\'un agent précis (optionnel)').setRequired(false)),
  new SlashCommandBuilder().setName('panel-rdv-client').setDescription('📅 Installer le panneau de prise de RDV client (Direction)'),
  new SlashCommandBuilder().setName('rdv-nettoyer').setDescription('🧹 Désépingler tous les vieux télégrammes du salon demandes (Direction)'),
  new SlashCommandBuilder().setName('engagement').setDescription("✒️ Envoyer un contrat d'engagement à signer (Direction)").addUserOption(o => o.setName('membre').setDescription('Membre qui doit signer').setRequired(true)),
  new SlashCommandBuilder().setName('synchroniser').setDescription('🔄 Synchroniser tous les membres dans Notion (Direction)'),
  new SlashCommandBuilder().setName('mission').setDescription('🔪 Créer un contrat de mission (Confrérie / pôle illégal)'),
  new SlashCommandBuilder().setName('mission-statut').setDescription('🔄 Changer le statut d\'un contrat de mission (Direction)')
    .addStringOption(o => o.setName('reference').setDescription('Ex : Contrat-001').setRequired(true).setAutocomplete(true))
    .addStringOption(o => o.setName('statut').setDescription('Nouveau statut').setRequired(true)
      .addChoices(
        { name: '⏳ En attente', value: 'En attente' },
        { name: '🔫 En cours', value: 'En cours' },
        { name: '✅ Clôturé', value: 'Clôturé' },
      )),
  new SlashCommandBuilder().setName('descriptions').setDescription('📝 Ajouter/mettre à jour la description de chaque salon (Direction)'),
  new SlashCommandBuilder().setName('installer-menu').setDescription('🎛️ Installer le menu principal + Commencer ici dans leurs salons (Direction)'),
  new SlashCommandBuilder().setName('mon-dossier').setDescription('📋 Voir ton parcours et ta progression vers le grade suivant'),
  new SlashCommandBuilder().setName('mon-journal').setDescription('📖 Voir et écrire le journal de ton personnage'),
  new SlashCommandBuilder().setName('ma-fiche').setDescription('✏️ Voir et modifier ta fiche de personnage'),
  new SlashCommandBuilder().setName('guide-membres').setDescription('📣 Envoyer à chaque membre le guide des outils perso (Direction)'),
  new SlashCommandBuilder().setName('portefeuille').setDescription('💰 Voir ton portefeuille (dollars RP)'),
  new SlashCommandBuilder().setName('payer').setDescription('💸 Envoyer des dollars RP à un autre membre')
    .addUserOption(o => o.setName('membre').setDescription('À qui envoyer l\'argent').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Montant en dollars').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Motif du paiement').setRequired(false)),
  new SlashCommandBuilder().setName('argent').setDescription('💵 Créditer/retirer des dollars à un membre (Direction)')
    .addUserOption(o => o.setName('membre').setDescription('Membre concerné').setRequired(true))
    .addIntegerOption(o => o.setName('montant').setDescription('Positif = créditer, négatif = retirer').setRequired(true))
    .addStringOption(o => o.setName('raison').setDescription('Motif (récompense, amende...)').setRequired(false)),
  new SlashCommandBuilder().setName('parrainage').setDescription('🤝 Attribuer un parrain à un nouveau (Direction)')
    .addUserOption(o => o.setName('parrain').setDescription('Le parrain (ancien)').setRequired(true))
    .addUserOption(o => o.setName('filleul').setDescription('Le filleul (nouveau)').setRequired(true)),
  new SlashCommandBuilder().setName('mon-parrainage').setDescription('🤝 Voir ton parrain et tes filleuls'),
  new SlashCommandBuilder().setName('registre').setDescription('📋 Liste des membres actifs (Direction)').addStringOption(o => o.setName('pole').setDescription('Filtrer par pôle').setRequired(false).addChoices({ name: 'Tous', value: 'tous' }, { name: '⚖️ Légal', value: 'legal' }, { name: '🔒 Illégal', value: 'illegal' })).addIntegerOption(o => o.setName('page').setDescription('Page').setRequired(false)),
  new SlashCommandBuilder().setName('op').setDescription('🎯 Détail d\'une opération').addStringOption(o => o.setName('id').setDescription('ID de l\'opération').setRequired(false)),
].map(c => c.toJSON());

async function registerSlashCommands(guild) {
  const cmds = [...SLASH_COMMANDS, ...(papiersCommands || []), ...(securite.securiteCommands || []), ...(rdvplus.rdvplusCommands || []), ...(operations.operationsCommands || []), ...(rumeurs.rumeursCommands || []), ...(inventaire.inventaireCommands || []), ...(diagnostic.diagnosticCommands || []), ...(absences.absencesCommands || []), ...(repertoire.repertoireCommands || []), ...(monitoring.monitoringCommands || []), ...(telegramme.telegrammeCommands || []), ...(tableaubord.tableauCommands || []), ...(traque.traqueCommands || [])];
  try {
    const noms = cmds.map(c => c?.name || c?.toJSON?.()?.name).filter(Boolean);
    client._cmdNames = noms;
    const vus = new Set(); const doublons = [];
    for (const n of noms) { if (vus.has(n)) { if (!doublons.includes(n)) doublons.push(n); } else vus.add(n); }
    if (doublons.length) { console.log('❌ Commandes en double:', doublons.join(', ')); try { monitoring.logTech?.(client, 'error', '❌ Commandes en double', 'Discord rejette TOUT le lot tant que ce n\'est pas corrigé :\n' + doublons.join(', ')); } catch {} }
    if (cmds.length > 100) { console.log(`❌ Trop de commandes (${cmds.length}/100) — Discord va en refuser.`); try { monitoring.logTech?.(client, 'error', '❌ Limite de commandes dépassée', `${cmds.length}/100 commandes — Discord rejette le surplus, il faut en retirer.`); } catch {} }
    await guild.commands.set(cmds);
    console.log('✅ Slash commands enregistrées (+ modules + monitoring)');
  }
  catch (e) { console.log('❌ Slash commands error:', e.message); try { monitoring.logTech?.(client, 'error', '❌ Échec d\'enregistrement des commandes', e.message); } catch {} }
}

function nomParticipant(member) { return DISCORD_TO_IC[member.id] || member.user?.username || member.displayName || 'Inconnu'; }
// (déplacé dans utils.js)
// fmtLong / fmtShort → déplacés dans utils.js (importés en haut du fichier)
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const cleanName = clean(name);
    // 1. Cherche exact en priorité
    const exact = guild.channels.cache.find(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      clean(c.name) === cleanName
    );
    if (exact) return exact;
    // 2. Fallback includes — mais évite les faux positifs (ex: "logs" dans "patch-note-logs")
    const partial = guild.channels.cache.find(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      clean(c.name).includes(cleanName) &&
      !clean(c.name).includes('patchnote') &&
      !clean(c.name).includes('patch')
    );
    if (partial) return partial;
  }
  return null;
}
function getChExact(guild, name) {
  const clean = s => s.toLowerCase().replace(/[^a-z0-9-]/g, '');
  return guild.channels.cache.find(c => [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) && clean(c.name) === clean(name)) || null;
}
function getMention(guild) { return guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ') || ''; }
// Retourne les options allowedMentions sécurisées (jamais @everyone/@here)
function safeMentions(roleIds = [], userIds = []) {
  return { parse: [], roles: roleIds.filter(Boolean), users: userIds.filter(Boolean) };
}
function getContratMention(guild) { const roles = CONTRAT_ROLES.map(id => guild.roles.cache.get(id)).filter(Boolean).map(r => `<@&${r.id}>`); return [...roles, `<@${JUNE_MCCALL_ID}>`].join(' '); }
function isDirection(member) { return member?.roles.cache.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'].some(n => r.name.includes(n))); }
function isMembre(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => r.name !== '@everyone' && !r.name.toLowerCase().includes('visiteur')) || false;
}
function isFondateurOuFleau(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => ['Fondateur', 'Fléau'].some(n => r.name.includes(n))) || false;
}
function isOfficierOuDirection(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Co-Directeur'].some(n => r.name.includes(n))) || false;
}
// #journal-de-bord = destination pour TOUS les logs IC
async function getLogsCh(guild) {
  // Journal de bord = destination de TOUS les logs/alertes (inactivité comprise)
  const JOURNAL_ID = '1508756535407542372';
  let journalCh = guild.channels.cache.get(JOURNAL_ID);
  if (!journalCh) journalCh = await guild.channels.fetch(JOURNAL_ID).catch(() => null);
  if (journalCh) return journalCh;
  // Dernier recours seulement si le Journal est introuvable
  let ch = guild.channels.cache.get(CH.LOGS);
  if (!ch) ch = await guild.channels.fetch(CH.LOGS).catch(() => null);
  return ch;
}
function getJournalCh(guild) { return guild.channels.cache.get('1508756535407542372') || null; }

async function sendToThread(guild, threadId, payload) {
  try {
    const direct = await guild.channels.fetch(threadId).catch(() => null);
    if (direct) { await direct.send(payload); return true; }
    for (const channel of guild.channels.cache.values()) {
      if (!channel.isTextBased?.()) continue;
      try { const fetched = await channel.threads.fetch().catch(() => null); if (!fetched) continue; const thread = fetched.threads?.get(threadId) || channel.threads.cache.get(threadId); if (thread) { await thread.send(payload); return true; } } catch {}
    }
  } catch (e) { console.log('sendToThread error:', e.message); }
  return false;
}

// ── Suivi des invitations : détecter qui a invité un nouveau membre ──
const _inviteCache = new Map(); // guildId -> Map(code -> { uses, inviterTag, inviterId })
async function _snapshotInvites(guild) {
  const m = new Map();
  try {
    const invites = await guild.invites.fetch();
    for (const inv of invites.values()) m.set(inv.code, { uses: inv.uses || 0, inviterTag: inv.inviter?.username || null, inviterId: inv.inviter?.id || null });
  } catch {}
  return m;
}
async function _cacheInvites(guild) { _inviteCache.set(guild.id, await _snapshotInvites(guild)); }
async function _detecterInviteur(guild) {
  const avant = _inviteCache.get(guild.id) || new Map();
  const apres = await _snapshotInvites(guild);
  let res = null;
  for (const [code, info] of apres.entries()) {
    const a = avant.get(code);
    if (a && info.uses > a.uses) { res = { code, ...info }; break; }
    if (!a && info.uses > 0 && !res) res = { code, ...info };
  }
  if (!res) {
    for (const [code, info] of avant.entries()) {
      if (!apres.has(code)) { res = { code, ...info, disparue: true }; break; }
    }
  }
  _inviteCache.set(guild.id, apres);
  return res;
}

async function sendLog(guild, type, data) {
  // Tout va dans #journal-de-bord
  const ch = await getLogsCh(guild);
  if (!ch) return;
  const cfgs = {
    ARRIVEE: { color: 0x57F287, title: 'ARRIVÉE — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '🔢 Âge du compte', value: data.accountAge + ' jours', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '🤝 Invité par', value: data.inviteur ? (data.inviteur.inviterId ? `<@${data.inviteur.inviterId}> \`${data.inviteur.code}\`` : `\`${data.inviteur.code}\``) : 'Lien public / inconnu', inline: false }] },
    DEPART: { color: 0x555555, title: 'DÉPART — ' + data.username, fields: [{ name: '👤 Membre', value: data.username, inline: true }, { name: '🎖️ Rang', value: data.rang || '—', inline: true }, { name: '⏱️ Durée', value: data.duree || '—', inline: true }] },
    REGLEMENT_VALIDE: { color: 0x3B82F6, title: 'RÈGLEMENT VALIDÉ — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}> (${data.username})`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_RECUE: { color: 0xFFA500, title: 'CANDIDATURE REÇUE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CANDIDATURE_ACCEPTEE: { color: 0x57F287, title: 'CANDIDATURE ACCEPTÉE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }, { name: '✅ Par', value: data.validePar || '—', inline: true }] },
    CANDIDATURE_REFUSEE: { color: 0xED4245, title: 'CANDIDATURE REFUSÉE — ' + data.nomPerso, fields: [{ name: '👤 Joueur', value: `<@${data.userId}>`, inline: true }, { name: '⚖️ Type', value: data.type || '—', inline: true }] },
    ABSENCE: { color: 0xFFA500, title: 'ABSENCE — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }] },
    CONTRAT_SIGNE: { color: 0x57F287, title: 'CONTRAT SIGNÉ — ' + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }, { name: '✍️ Signé par', value: data.signe, inline: true }] },
    CONTRAT_REFUSE: { color: 0xED4245, title: 'CONTRAT REFUSÉ — ' + data.contratId, fields: [{ name: '🆔 Réf', value: '`' + data.contratId + '`', inline: true }, { name: '📋 Objet', value: data.objet, inline: true }] },
    OPERATION: { color: 0xFFA500, title: 'OPÉRATION — ' + data.nom, fields: [{ name: '🎯 Nom', value: data.nom, inline: true }, { name: '📍 Lieu', value: data.lieu || '—', inline: true }, { name: '📋 Statut', value: data.statut || '—', inline: true }] },
    PROMOTION: { color: 0x57F287, title: 'PROMOTION — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📉 Ancien rang', value: data.ancienRang || '—', inline: true }, { name: '📈 Nouveau rang', value: data.nouveauRang || '—', inline: true }, { name: '✅ Décidé par', value: data.validePar || '—', inline: true }] },
    RETROGRADATION: { color: 0xED4245, title: 'RÉTROGRADATION — ' + data.username, fields: [{ name: '👤 Membre', value: `<@${data.userId}>`, inline: true }, { name: '📉 Ancien rang', value: data.ancienRang || '—', inline: true }, { name: '📈 Nouveau rang', value: data.nouveauRang || '—', inline: true }, { name: '📝 Raison', value: data.raison || '—', inline: true }] },
  };
  const cfg = cfgs[type]; if (!cfg) return;
  await ch.send({ embeds: [new EmbedBuilder().setColor(cfg.color).setTitle(cfg.emoji + ' ' + cfg.title).addFields(...cfg.fields).setFooter({ text: 'IWC • Logs • ' + new Date().toLocaleString('fr-FR') })] }).catch(e => console.log('Log error:', e.message));
}

async function archiverCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN) return;
  try { await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: NOTION_RECRUTEMENT_DB }, properties: { 'Nom personnage': { title: [{ text: { content: cand.nomPerso || '—' } }] }, 'Date réception': { date: { start: cand.receivedAt ? new Date(cand.receivedAt).toISOString().split('T')[0] : new Date().toISOString().split('T')[0] } }, 'Statut': { select: { name: statut === 'acceptee' ? '✅ Accepté' : '❌ Refusé' } }, 'Type': { select: { name: cand.type === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } }, 'Disponibilités': { rich_text: [{ text: { content: cand.dispos || '—' } }] }, 'Expérience RP': { rich_text: [{ text: { content: (cand.background || '—').slice(0, 2000) } }] }, 'Vote Direction': { rich_text: [{ text: { content: validePar || '—' } }] }, 'Notes': { rich_text: [{ text: { content: statut === 'acceptee' ? `Accepté par ${validePar} le ${fmtShort(new Date())}` : `Refusé le ${fmtShort(new Date())}` } }] }, 'Discord ID': { rich_text: [{ text: { content: cand.userId || '—' } }] }, 'Discord Username': { rich_text: [{ text: { content: cand.username || '—' } }] } } }) }); console.log(`✅ Candidature ${cand.nomPerso} archivée`); } catch (e) { console.log('❌ Archivage candidature error:', e.message); }
}

async function ajouterMembreNotion(cand, type) {
  if (!process.env.NOTION_TOKEN) return;
  try { await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: NOTION_MEMBRES_DB }, properties: { 'Nom': { title: [{ text: { content: cand.nomPerso || '—' } }] }, 'Personnage': { rich_text: [{ text: { content: cand.nomPerso || '—' } }] }, "Date d'entrée": { date: { start: new Date().toISOString().split('T')[0] } }, 'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } }, 'Pôle': { select: { name: type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } }, 'Rang': { select: { name: type === 'illegal' ? 'Loup Confirmé' : 'Recrue' } }, 'Statut': { select: { name: '✅ Actif' } }, 'Notes': { rich_text: [{ text: { content: `Accepté le ${fmtShort(new Date())}` } }] } } }) }); console.log(`✅ Registre Notion: ${cand.nomPerso} ajouté`); } catch (e) { console.log('❌ Registre Notion error:', e.message); }
}

async function syncRegistreNotion(guild) {
  if (!process.env.NOTION_TOKEN) return;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_MEMBRES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ sorts: [{ property: 'Nom', direction: 'ascending' }] }) });
    const data = await res.json(); if (!data.results) return;
    const logsCh = await getLogsCh(guild); const today = new Date();
    for (const page of data.results) {
      const nomIC = page.properties['Nom']?.title?.[0]?.plain_text || page.properties['Personnage']?.rich_text?.[0]?.plain_text;
      const statut = page.properties['Statut']?.select?.name; const derniereActivite = page.properties['Dernière activité']?.date?.start;
      const discordId = MEMBRES_DISCORD_MAP[nomIC]; if (!discordId) continue;
      const member = await guild.members.fetch(discordId).catch(() => null); if (!member) continue;
      if (derniereActivite && logsCh) {
        const jours = Math.floor((today - new Date(derniereActivite)) / 86400000);
        const db2 = loadDB(); if (!db2.alertesInactivite) db2.alertesInactivite = {};
        const keyAlerte = `inactif_${discordId}_${Math.floor(jours / 7)}`;
        if (jours >= 7 && statut === '✅ Actif' && !db2.alertesInactivite[keyAlerte]) {
          await logsCh.send({ content: getMention(guild), embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle(`⚠️ Inactivité Notion — ${nomIC}`).setDescription(`**${nomIC}** est inactif depuis **${jours} jours** selon le Registre Notion.`).addFields({ name: '📅 Dernière activité', value: fmtShort(derniereActivite), inline: true }, { name: '📋 Statut', value: statut, inline: true }).setFooter({ text: 'IWC • Sync Registre Notion' })] });
          db2.alertesInactivite[keyAlerte] = true; saveDB(db2);
        }
      }
    }
  } catch (e) { console.log('❌ Sync registre error:', e.message); }
}

async function updateDashboard(guild) {
  const db = loadDB();
  const ch = getChById(guild, 'DASHBOARD', 'dashboard');
  if (!ch) return;
  // Sécurité: ne jamais poster le dashboard dans dossier-recrutement
  if (ch.id === SALON_HARDCODED.DOSSIER_RECRUTEMENT) { console.log('⚠️ updateDashboard: salon dossier-recrutement ignoré'); return; }
  const members = Object.values(db.members); const contrats = db.contrats || [];
  const alertes = members.filter(m => m.status !== 'parti' && daysSince(m.lastActivity) > 7);
  const nextSess = (db.sessions || []).filter(s => s.status === 'planifiee' && new Date(s.date) > new Date()).sort((a, b) => new Date(a.date) - new Date(b.date))[0];
  const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 IRON WOLF COMPANY — TABLEAU DE BORD').setDescription('*Mise à jour automatique toutes les heures*')
    .addFields(
      { name: '👥 MEMBRES', value: [`✅ Actifs : **${members.filter(m => m.status === 'actif').length}**`, `⚠️ Absents : **${members.filter(m => m.status === 'absent').length}**`, `❌ Inactifs : **${members.filter(m => m.status === 'inactif').length}**`, `👁️ Total : **${members.filter(m => m.status !== 'parti').length}**`].join('\n'), inline: true },
      { name: '🎯 OPÉRATIONS', value: [`🟢 En cours : **${(db.operations || []).filter(o => o.status === 'en_cours').length}**`, `🟡 Préparation : **${(db.operations || []).filter(o => o.status === 'preparation').length}**`, `✅ Terminées : **${(db.operations || []).filter(o => o.status === 'terminee').length}**`].join('\n'), inline: true },
      { name: '📝 RECRUTEMENT', value: [`📥 En attente : **${(db.candidatures || []).filter(c => ['reçue', 'examen'].includes(c.status)).length}**`, `✅ Acceptés : **${(db.candidatures || []).filter(c => c.status === 'acceptee').length}**`].join('\n'), inline: true },
      { name: '📜 CONTRATS', value: [`🟡 En attente : **${contrats.filter(c => c.status === 'en_attente').length}**`, `✅ Signés : **${contrats.filter(c => c.status === 'signe').length}**`, `❌ Refusés : **${contrats.filter(c => c.status === 'refuse').length}**`].join('\n'), inline: true },
      { name: '📅 PROCHAINE SESSION', value: nextSess ? `**${nextSess.name}**\n📍 ${nextSess.lieu || '—'}\n🗓️ ${fmtShort(nextSess.date)}` : '*Aucune session planifiée*', inline: true },
      { name: alertes.length > 0 ? `⚠️ ALERTES (${alertes.length})` : '✅ AUCUNE ALERTE', value: alertes.length > 0 ? alertes.slice(0, 5).map(m => `→ **${m.name}** — ${daysSince(m.lastActivity)}j`).join('\n') : '*Tous les membres sont actifs*', inline: true },
    ).setFooter({ text: `Dernière MàJ : ${new Date().toLocaleString('fr-FR')} • IWC 1895` });
  try {
    const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
    if (msgs) {
      const botMsgs = [...msgs.values()].filter(m => m.author.id === ch.guild.members.me?.id && m.embeds?.length > 0).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      for (let i = 1; i < botMsgs.length; i++) await botMsgs[i].delete().catch(() => {});
      if (botMsgs.length > 0) {
        try { await botMsgs[0].edit({ embeds: [embed] }); db.dashboardMsgId = botMsgs[0].id; saveDB(db); return; }
        catch { await botMsgs[0].delete().catch(() => {}); }
      }
    }
    if (db.dashboardMsgId) { const msg = await ch.messages.fetch(db.dashboardMsgId).catch(() => null); if (msg) { await msg.edit({ embeds: [embed] }); return; } }
    const sent = await ch.send({ embeds: [embed] }); db.dashboardMsgId = sent.id; saveDB(db);
  } catch (e) { console.log('Dashboard error:', e.message); }
}

const JOURS_AVANT_KICK = 5;
async function autoKickVisiteurs(guild) {
  // ⛔ DÉSACTIVÉ à la demande de la Direction : plus aucun kick automatique
  // pour « règlement non validé ». La fonction ne fait plus rien.
  return;
  // eslint-disable-next-line no-unreachable
  try {
    const db = loadDB(); const logsCh = await getLogsCh(guild); const maintenant = Date.now(); let kicked = 0;
    for (const [id, membre] of Object.entries(db.members || {})) {
      if (membre.status !== 'visiteur') continue;
      const joursDepuis = Math.floor((maintenant - new Date(membre.joinedAt).getTime()) / 86400000);
      if (joursDepuis < JOURS_AVANT_KICK) continue;
      try {
        const member = await guild.members.fetch(id).catch(() => null);
        if (!member) { delete db.members[id]; continue; }
        if (!member.roles.cache.some(r => r.name.includes('Visiteur'))) { db.members[id].status = 'actif'; continue; }
        await member.send({ embeds: [new EmbedBuilder()
          .setColor(0xED4245)
          .setTitle('🚪 Iron Wolf Company — Exclusion automatique')
          .setDescription([
            `Bonjour,`,
            ``,
            `Ce message est automatique : tu as été **retiré du serveur Iron Wolf Company** par notre système.`,
            ``,
            `**📋 Raison :** règlement non validé.`,
            `**⏱️ Détail :** tu n'as pas validé le règlement dans les **${JOURS_AVANT_KICK} jours** suivant ton arrivée. La validation (réaction ✅ dans le salon règlement) est obligatoire pour rester sur le serveur.`,
            ``,
            `Si tu souhaites nous rejoindre à nouveau, tu peux revenir sur le serveur et **valider le règlement dès ton arrivée**.`,
            ``,
            `— La Direction, Iron Wolf Company`,
          ].join('\n'))
          .setFooter({ text: 'IWC • Message automatique du bot' })] }).catch(() => {});
        const ok = await member.kick(`Visiteur inactif depuis ${joursDepuis} jours`).then(() => true).catch(() => false);
        if (!ok) continue;
        delete db.members[id]; kicked++;
        if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`🚪 AUTO-KICK — ${member.user.username}`).addFields({ name: '👤 Membre', value: member.user.username, inline: true }, { name: '⏱️ Arrivé il y a', value: `${joursDepuis} jours`, inline: true }, { name: '📋 Raison', value: 'Règlement non validé', inline: true }).setFooter({ text: `IWC • Auto-kick • ${fmtShort(new Date())}` })] });
      } catch (e) { console.log(`❌ Auto-kick error ${id}:`, e.message); }
    }
    if (kicked > 0) saveDB(db);
    console.log(`✅ Auto-kick : ${kicked} visiteur(s) kické(s)`);
  } catch (e) { console.log('❌ autoKickVisiteurs error:', e.message); }
}

async function envoyerRapportDirection(guild) {
  try {
    const db = loadDB(); const hier = Date.now() - 86400000; const depuisHier = d => d && new Date(d).getTime() >= hier;
    const nouveaux = Object.values(db.members || {}).filter(m => depuisHier(m.joinedAt));
    const departs = Object.values(db.members || {}).filter(m => m.status === 'parti' && depuisHier(m.leftAt));
    const candsRecues = (db.candidatures || []).filter(c => depuisHier(c.receivedAt));
    const candsAccept = (db.candidatures || []).filter(c => c.status === 'acceptee' && depuisHier(c.acceptedAt));
    const candsRefus = (db.candidatures || []).filter(c => c.status === 'refusee' && depuisHier(c.refusedAt || c.receivedAt));
    const contratsSign = (db.contrats || []).filter(c => c.status === 'signe' && depuisHier(c.signedAt));
    const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours');
    const opsTermHier = (db.operations || []).filter(o => o.status === 'terminee' && depuisHier(o.endedAt));
    const alertes = Object.values(db.members || {}).filter(m => m.status !== 'parti' && daysSince(m.lastActivity) > 7);
    const visiteurs = Object.values(db.members || {}).filter(m => m.status === 'visiteur');
    const soldeLegal = db.coffres?.legal || 0; const soldeIlleg = db.coffres?.illegal || 0;
    const embed = new EmbedBuilder().setColor(0x8B1A1A)
      .setTitle(`📋 Rapport hebdomadaire — Semaine du ${new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' })}`)
      .setDescription('*Résumé des dernières 24 heures — Iron Wolf Company*')
      .addFields(
        { name: '👥 MEMBRES', value: [`🆕 Arrivées : **${nouveaux.length}**`, `🚪 Départs : **${departs.length}**`, `👁️ Visiteurs : **${visiteurs.length}**`, alertes.length > 0 ? `⚠️ Inactifs : **${alertes.length}**` : '✅ Aucune inactivité'].join('\n'), inline: false },
        { name: '📋 RECRUTEMENT', value: candsRecues.length > 0 ? [`📥 Reçues : **${candsRecues.length}**`, `✅ Acceptées : **${candsAccept.length}**`, `❌ Refusées : **${candsRefus.length}**`].join('\n') : '*Aucune candidature hier*', inline: true },
        { name: '📜 CONTRATS', value: contratsSign.length > 0 ? contratsSign.map(c => `→ \`${c.id}\` — ${c.objet}`).join('\n') : '*Aucun contrat signé hier*', inline: true },
        { name: '🎯 OPÉRATIONS', value: [opsEnCours.length > 0 ? `🟢 En cours : **${opsEnCours.length}**` : '🟢 Aucune', opsTermHier.length > 0 ? `✅ Terminées hier : **${opsTermHier.length}**` : ''].filter(Boolean).join('\n') || '*Aucune activité*', inline: false },
        { name: '💰 TRÉSORERIE', value: [`⚖️ Légal : **$${soldeLegal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${soldeIlleg.toLocaleString('fr-FR')}**`, `💎 Total : **$${(soldeLegal + soldeIlleg).toLocaleString('fr-FR')}**`].join('\n'), inline: false },
      ).setFooter({ text: `IWC • Rapport automatique • ${new Date().toLocaleString('fr-FR')}` });
    const rolesCibles = ['Fléau', 'Concepteur'];
    let envoyes = 0;
    const membres = await guild.members.fetch().catch(() => null);
    if (membres) { for (const [, member] of membres) { if (!member.roles.cache.some(r => rolesCibles.some(n => r.name.includes(n)))) continue; try { await member.send({ embeds: [embed] }); envoyes++; } catch {} } }
    console.log(`✅ Rapport hebdo envoyé à ${envoyes} membre(s)`);
  } catch (e) { console.log('❌ Rapport quotidien error:', e.message); }
}

// ── [CORRECTION] Journal IC → poste dans #journal-de-bord ──
async function ajouterJournalIC(guild, entry) {
  try {
    const ch = guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD) || getChById(guild, 'JOURNAL_DE_BORD', 'journal-de-bord', 'journal');
    if (!ch) return;
    const emojiMap = { operation: '🎯', contrat: '📜', recrutement: '🐺', tresorerie: '💰', promotion: '⬆️', autre: '📋' };
    const emoji = entry.emoji || emojiMap[entry.type] || '📋';
    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle(`${emoji} ${entry.titre}`)
      .setDescription(entry.description || '')
      .addFields({ name: '✍️ Auteur', value: entry.auteur || '—', inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true })
      .setFooter({ text: `IWC • Journal IC • ${new Date().toLocaleString('fr-FR')}` })
      .setTimestamp();
    await ch.send({ embeds: [embed] });
  } catch (e) { console.log('❌ ajouterJournalIC error:', e.message); }
}

// Wrapper pour compatibilité avec notionModules.ajouterJournalIC
const _ajouterJournalICOriginal = notionModules.ajouterJournalIC;
notionModules.ajouterJournalIC = async (guild, entry) => {
  await ajouterJournalIC(guild, entry);
  // Ne pas appeler l'original pour éviter les doublons dans d'autres salons
};

async function handleSlashCommand(interaction) {
  const { commandName, guild } = interaction; const db = loadDB();
  if (commandName === 'grade-set')         { return notionV3.handleGradeSetCommand?.(interaction); }
  if (commandName === 'hierarchie')        { if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 La hiérarchie est réservée aux membres. Rejoins-nous via une candidature pour y accéder !', flags: MessageFlags.Ephemeral }); return notionV3.handleHierarchieCommand?.(interaction); }
  if (commandName === 'affaire') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('modal_affaire').setTitle('📋 Soumettre une affaire');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel("Titre de l'affaire").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Proposition alliance, Demande de contrat...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description détaillée').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Détails, contexte, personnes impliquées...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('urgence').setLabel('Urgence (faible / normale / haute)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('normale')),
    );
    return interaction.showModal(modal);
  }
  if (commandName === 'contrat-suivi') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const payload = _contratSuiviMenu();
    if (!payload) return interaction.reply({ content: "Aucun contrat enregistré pour le moment.", flags: MessageFlags.Ephemeral });
    return interaction.reply(payload);
  }
  if (commandName === 'contrat-suivi-panneau') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const rowP = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('csuivi_open').setLabel('🎮 Gérer les contrats').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('csuivi_archives').setLabel('📁 Archives').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('csuivi_import').setLabel('📥 Importer depuis Notion').setStyle(ButtonStyle.Secondary),
    );
    const sentP = await interaction.channel.send({ embeds: [_contratPanelEmbed(loadDB())], components: [rowP] });
    sentP.pin().catch(() => {});
    const dbPan = loadDB(); dbPan.contratPanel = { channelId: interaction.channel.id, messageId: sentP.id }; saveDB(dbPan);
    return interaction.reply({ content: "✅ Panneau installé et épinglé, avec **compteur live** (il se met à jour tout seul). Utilisable en permanence.", flags: MessageFlags.Ephemeral });
  }
  if (commandName === 'recap') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    return interaction.reply({ embeds: [_genererRecapEmbed(loadDB())], flags: MessageFlags.Ephemeral });
  }
  if (commandName === 'contrats-importer') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const n = await _importContratsDepuisNotion(interaction.guild);
    return interaction.editReply({ content: n > 0 ? `✅ ${n} contrat(s) importé(s) depuis Notion. Ils sont maintenant dans \`/contrat-suivi\`.` : "Aucun nouveau contrat à importer — tout est déjà synchronisé. 👍" });
  }
  if (commandName === 'tresor')            { if (!isOfficierOuDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction et aux Officiers de Terrain.', flags: MessageFlags.Ephemeral }); return notionModules.handleTresorCommand?.(interaction); }
  if (commandName === 'dashboard')         { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return notionModules.handleDashboard?.(interaction); }
  if (commandName === 'journal')           { if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); return notionModules.handleJournalCommand?.(interaction); }
  if (commandName === 'contrats-archives') { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleContratsArchives?.(interaction); }
  if (commandName === 'contrats')          return _handleMesContrats(interaction);
  if (commandName === 'suivi') { if (!isDirection(interaction.member)) return interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return interaction.reply({ embeds: [_buildSuivi(loadDB())], flags: MessageFlags.Ephemeral }); }
  if (commandName === 'rdv-nettoyer') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const salon = interaction.guild.channels.cache.get('1512175624176009348');
    if (!salon) return interaction.editReply({ content: '❌ Salon des demandes introuvable.' });
    let n = 0;
    try {
      const pins = await salon.messages.fetchPinned();
      for (const [, msg] of pins) {
        if (msg.author.id === client.user.id) { await msg.unpin().catch(() => {}); n++; }
      }
    } catch (e) { return interaction.editReply({ content: `❌ Erreur : ${e.message}` }); }
    return interaction.editReply({ content: `🧹 ${n} télégramme(s) désépinglé(s) dans le salon des demandes.` });
  }

  if (commandName === 'synchroniser') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    // Répondre TOUT DE SUITE (sinon l'interaction expire pendant la synchro)
    await interaction.reply({ content: '🔄 Synchronisation lancée ! Fiches_personnages puis Registre des membres. Suis l\'avancement dans les logs (🆕 créations, ✅ mises à jour). Ça prend ~1 minute.', flags: MessageFlags.Ephemeral });
    // Lancer les synchros en arrière-plan (l'une après l'autre)
    (async () => {
      try {
        const guild = interaction.guild;
        await _syncTousMembresNotion(guild);
        await _syncRegistreTousMembres(guild);
        console.log('✅ /synchroniser : les deux synchros sont terminées.');
      } catch (e) { console.log('❌ /synchroniser erreur:', e.message); }
    })();
    return;
  }

  if (commandName === 'mission') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction / Confrérie.', flags: MessageFlags.Ephemeral });
    try {
      const modal = new ModalBuilder().setCustomId('modal_mission').setTitle('🔪 Nouveau contrat de mission');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Cible (nom + qui c\'est)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120).setPlaceholder('Ex : Mercer — propriétaire de la distillerie, médecin de Blackwater')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu / repères').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Ex : Blackwater, autour de la distillerie')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('Motif du contrat').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Pourquoi cette cible ? Ce qu\'elle a fait...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('Ex : À confirmer avec William')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Contact / intermédiaire').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('Ex : William — Télégramme 11-529')),
      );
      await interaction.showModal(modal);
    } catch (e) { console.log('⚠️ Ouverture modal mission:', e.message); try { await interaction.reply({ content: '⚠️ Erreur à l\'ouverture du formulaire.', flags: MessageFlags.Ephemeral }); } catch {} }
    return;
  }

  if (commandName === 'mission-statut') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction / Confrérie.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ref = interaction.options.getString('reference');
    const statut = interaction.options.getString('statut');
    const emojiStatut = statut === 'Clôturé' ? '✅ Clôturé' : statut === 'En cours' ? '🔫 En cours' : '⏳ En attente';

    const db = loadDB();
    db.missions = db.missions || {};
    const m = db.missions[ref];

    // 1) Éditer l'embed Discord d'origine (si on connaît le message)
    let discordOK = false;
    if (m && m.messageId && m.channelId) {
      try {
        const ch = await interaction.guild.channels.fetch(m.channelId).catch(() => null);
        const msg = ch ? await ch.messages.fetch(m.messageId).catch(() => null) : null;
        if (msg && msg.embeds[0]) {
          const eb = EmbedBuilder.from(msg.embeds[0]);
          // Remplacer le champ Statut
          const fields = (msg.embeds[0].fields || []).map(f => f.name.includes('Statut') ? { name: f.name, value: emojiStatut, inline: f.inline } : f);
          eb.setFields(fields);
          if (statut === 'Clôturé') eb.setColor(0x2ECC71);
          else if (statut === 'En cours') eb.setColor(0xE67E22);
          await msg.edit({ embeds: [eb] });
          discordOK = true;
        }
      } catch (e) { console.log('⚠️ Mission-statut édition Discord:', e.message); }
    }
    if (m) { m.statut = statut; saveDB(db); }

    // 2) Mettre à jour Notion (chercher la page par Référence)
    let notionOK = false; let notionInfo = '— (non configuré)';
    const DB = process.env.NOTION_MISSIONS_DB || null;
    if (process.env.NOTION_TOKEN && DB) {
      notionInfo = '⚠️';
      try {
        const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
        const q = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Référence', title: { equals: ref } }, page_size: 1 }) });
        const data = await q.json().catch(() => ({}));
        const page = data.results && data.results[0];
        if (page) {
          const upd = await fetch(`https://api.notion.com/v1/pages/${page.id}`, { method: 'PATCH', headers, body: JSON.stringify({ properties: { 'Statut': { select: { name: statut } } } }) });
          if (upd.ok) { notionOK = true; notionInfo = '✅'; }
        } else { notionInfo = '⚠️ contrat introuvable dans Notion'; }
      } catch (e) { console.log('❌ Mission-statut Notion:', e.message); }
    }

    if (!m && !notionOK) {
      return interaction.editReply({ content: `⚠️ Contrat **${ref}** introuvable (ni en mémoire, ni dans Notion). Vérifie la référence.` });
    }
    await interaction.editReply({ content: [
      `✅ **${ref}** → statut mis à jour : **${emojiStatut}**`,
      '',
      `📁 Embed Discord : ${discordOK ? '✅ modifié' : '⚠️ (message introuvable)'}`,
      `📓 Notion : ${notionInfo}`,
    ].join('\n') });
    return;
  }

  if (commandName === 'mon-dossier') return _handleMonDossier(interaction);
  if (commandName === 'mon-journal') return _handleJournalVoir(interaction);
  if (commandName === 'ma-fiche')    return _handleMaFiche(interaction);
  if (commandName === 'guide-membres') return _handleGuideMembres(interaction);
  if (commandName === 'portefeuille')  return _handlePortefeuille(interaction);
  if (commandName === 'payer')         return _handlePayer(interaction);
  if (commandName === 'argent')        return _handleArgent(interaction);

  if (commandName === 'installer-menu') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: '🎛️ Installation du menu et du salon « Commencer ici »…', flags: MessageFlags.Ephemeral });
    const r = await _installerMenu(interaction.guild, true); // force le repost
    return interaction.followUp({ content: `Menu principal : ${r.okMenu ? '✅ posé + épinglé' : '⚠️ salon introuvable/permission'}\nCommencer ici : ${r.okStart ? '✅ posé + épinglé' : '⚠️ salon introuvable/permission'}`, flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  if (commandName === 'descriptions') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.reply({ content: '📝 Mise à jour des descriptions de salons en cours… (ça prend ~30 sec). Regarde les logs pour le détail.', flags: MessageFlags.Ephemeral });
    (async () => {
      try {
        const n = await _definirDescriptionsSalons(interaction.guild);
        const msg = n > 0
          ? `✅ ${n} salon(s) mis à jour.\n📱 Sur téléphone, appuie sur le **nom du salon** pour voir sa description (elle ne s'affiche pas en haut sur mobile).`
          : `⚠️ 0 salon reconnu. Mes noms de salons ne correspondent peut-être pas aux tiens — envoie-moi la liste de tes salons et j'ajuste.`;
        await interaction.followUp({ content: msg, flags: MessageFlags.Ephemeral });
      }
      catch (e) { await interaction.followUp({ content: `⚠️ Souci : ${e.message}. Vérifie que le bot a la permission « Gérer les salons ».`, flags: MessageFlags.Ephemeral }).catch(() => {}); }
    })();
    return;
  }

  if (commandName === 'engagement') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    const cible = interaction.options.getUser('membre');
    if (!cible) return interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`engagement_signer_${cible.id}`).setLabel('✒️ Signer mon contrat d\'engagement').setStyle(ButtonStyle.Success),
    );
    const embedInvit = new EmbedBuilder()
      .setColor(0x8B5A2A)
      .setTitle('📜 RÈGLEMENT INTÉRIEUR & CONTRAT D\'ENGAGEMENT')
      .setDescription([
        '*Iron Wolf Company — Anno 1895*',
        '',
        'Messieurs,',
        '',
        'Rejoindre l\'**Iron Wolf Company** n\'est pas un emploi ordinaire : c\'est un serment. Avant d\'y apposer votre nom, lisez ce règlement avec attention. Votre signature engagera votre parole — et ici, la parole vaut la vie.',
        '',
        '**▌ ARTICLE I · DE NOTRE COMPAGNIE**',
        'L\'Iron Wolf Company est une **compagnie de sécurité privée**. Nous protégeons et escortons convois, marchandises et personnes ; nous défendons les intérêts que l\'on nous confie. Ce métier se mène **au grand jour** : votre visage et votre nom seront connus de tous, des alliés comme des ennemis.',
        '',
        '**▌ ARTICLE II · DES RISQUES DU MÉTIER**',
        'Que nul ne se présente sans le savoir : notre travail est **dangereux**. Vous porterez une arme et devrez parfois vous en servir. Vous essuierez des tirs. Vous pourrez être blessé(e), capturé(e), ou tomber pour de bon. La Compagnie veille sur les siens, mais **nul ne peut garantir votre vie**. En signant, vous acceptez ce péril en toute lucidité.',
        '',
        '**▌ ARTICLE III · DU TRAVAIL DE L\'OMBRE**',
        'Toutes nos affaires ne se traitent pas en pleine lumière. La Compagnie mène parfois des opérations d\'une **autre nature**, qui ne regardent qu\'elle. Ce qui se décide et s\'accomplit dans l\'ombre y demeure. Une bouche cousue est la première vertu de l\'homme de confiance.',
        '',
        '**▌ ARTICLE IV · DE LA LOYAUTÉ**',
        'On n\'entre pas chez nous à moitié. Vous devez **fidélité** à la Compagnie et à vos frères d\'armes, en toute circonstance. On ne laisse pas un frère derrière. On ne vend pas les siens. La parole donnée se tient jusqu\'au dernier souffle.',
        '',
        '**▌ ARTICLE V · DE LA DISCIPLINE**',
        'Vous respecterez la **hiérarchie** et les ordres de la Direction. Sur le terrain, sang-froid et tempérance sont de rigueur : un homme ivre ou imprudent met toute la Compagnie en danger.',
        '',
        '**▌ ARTICLE VI · DE L\'ÉPREUVE & DE LA SOLDE**',
        'Tout nouveau venu sert d\'abord une **période d\'épreuve**, le temps de prouver sa valeur et sa fiabilité. Votre travail sera **rétribué** selon les missions accomplies et le rang atteint.',
        '',
        '**▌ ARTICLE VII · DES SANCTIONS**',
        'La **trahison**, la désertion et la langue trop longue ne se pardonnent pas. Qui manque à son serment en répond devant la Direction — et la Compagnie a la mémoire longue.',
        '',
        '**▌ ARTICLE VIII · DU SERMENT**',
        'Par votre signature, vous reconnaissez sur l\'honneur :',
        '› avoir lu et compris le présent règlement ;',
        '› connaître les risques encourus et les accepter pleinement ;',
        '› jurer loyauté, discrétion et fidélité à l\'Iron Wolf Company.',
        '',
        '*Serment à recopier dans le formulaire :*',
        '> *« Moi, [mon nom], je jure loyauté à l\'Iron Wolf Company. Je connais les risques du métier et les accepte. Je garderai le silence sur ses affaires et tiendrai parole jusqu\'au bout. »*',
        '',
        '─────────────────────────',
        'Lisez attentivement avant de signer, et adressez-nous toute question si besoin. Lorsque vous serez prêt(e), cliquez ci-dessous pour **renseigner vos informations et apposer votre signature**.',
        '',
        '*Que la force reste dans l\'ombre.*',
        '**— La Direction, Iron Wolf Company**',
      ].join('\n'))
      .setFooter({ text: 'Iron Wolf Company • 1895 • Document officiel' });
    try {
      await cible.send({ embeds: [embedInvit], components: [row] });
      return interaction.reply({ content: `✅ Contrat d'engagement envoyé en MP à **${cible.username}**. Il pourra le signer directement.`, flags: MessageFlags.Ephemeral });
    } catch {
      return interaction.reply({ content: `⚠️ Impossible d'envoyer un MP à **${cible.username}** (ses messages privés sont peut-être fermés). Demande-lui d'ouvrir ses MP, ou je peux poster le contrat dans un salon à la place.`, flags: MessageFlags.Ephemeral });
    }
  }

  if (commandName === 'panel-rdv-client') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    const embed = new EmbedBuilder()
      .setColor(0xC8A45C)
      .setTitle('🤠  IRON WOLF COMPANY  🐺')
      .setDescription([
        '```',
        '╔═══════════════════════════════╗',
        '║   ✉  BUREAU DES RENDEZ-VOUS  ✉  ║',
        '╚═══════════════════════════════╝',
        '```',
        '*Vous souhaitez faire appel à nos services ?*',
        '*Protection, escorte, enquête, négociation...*',
        '',
        '📜 Laissez-nous un **télégramme** en cliquant ci-dessous.',
        'La Direction étudiera votre demande et vous répondra.',
        '',
        '— *« La force est dans l\'ombre. »*',
      ].join('\n'))
      .setFooter({ text: 'Iron Wolf Company · Bureau de Saint-Denis' });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rdvclient_demande').setLabel('✉ Envoyer un télégramme').setStyle(ButtonStyle.Primary),
    );
    // Toujours installer le panneau dans le salon dédié aux demandes clients
    const salonForm = interaction.guild.channels.cache.get('1512171267560702013') || interaction.channel;
    await salonForm.send({ embeds: [embed], components: [row] });
    return interaction.reply({ content: `✅ Panneau de prise de RDV installé dans ${salonForm}.`, flags: MessageFlags.Ephemeral });
  }

  if (commandName === 'stats-agent') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const db = loadDB();
    const notes = db.notesTerrain || [];
    if (notes.length === 0) return interaction.editReply({ content: '📭 Aucune note de terrain enregistrée.' });

    const filtreAgent = (interaction.options.getString('agent') || '').toLowerCase().trim();

    // Agréger par agent
    const stats = {};
    for (const n of notes) {
      const ag = n.agent || 'Inconnu';
      if (filtreAgent && !ag.toLowerCase().includes(filtreAgent)) continue;
      if (!stats[ag]) stats[ag] = { total: 0, cats: {}, lieux: {}, derniere: null };
      stats[ag].total++;
      for (const t of (n.tags || [])) stats[ag].cats[t] = (stats[ag].cats[t] || 0) + 1;
      if (n.lieu) stats[ag].lieux[n.lieu] = (stats[ag].lieux[n.lieu] || 0) + 1;
      const d = new Date(n.date).getTime();
      if (!stats[ag].derniere || d > stats[ag].derniere) stats[ag].derniere = d;
    }
    const agents = Object.entries(stats).sort((a, b) => b[1].total - a[1].total);
    if (agents.length === 0) return interaction.editReply({ content: `📭 Aucune note pour « ${filtreAgent} ».` });

    const lignes = agents.map(([ag, s]) => {
      const topCat = Object.entries(s.cats).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([c]) => c).join(' ');
      const topLieu = Object.entries(s.lieux).sort((a, b) => b[1] - a[1])[0];
      const quand = s.derniere ? new Date(s.derniere).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) : '—';
      return `**${ag}** — ${s.total} note(s)\n${topCat ? '🏷️ ' + topCat + '\n' : ''}${topLieu ? '📍 Surtout : ' + topLieu[0] + '\n' : ''}🕐 Dernière : ${quand}`;
    });

    const totalGlobal = notes.length;
    const embed = new EmbedBuilder()
      .setColor(0x8B4513)
      .setTitle('📊 Statistiques de renseignement par agent')
      .setDescription(lignes.join('\n\n').slice(0, 4000))
      .setFooter({ text: `IWC · ${agents.length} agent(s) · ${totalGlobal} note(s) au total` })
      .setTimestamp();
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'connecter-notion-contrats') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!process.env.NOTION_TOKEN) return interaction.editReply({ content: "❌ NOTION_TOKEN manquant dans Render — impossible de connecter Notion sans le token de l'intégration." });
    const lien = interaction.options.getString('lien') || '';
    const sansQuery = lien.split('?')[0];
    const matches = sansQuery.replace(/-/g, '').match(/[0-9a-fA-F]{32}/g);
    if (!matches || !matches.length) {
      return interaction.editReply({ content: "❌ Je n'ai pas trouvé d'identifiant de base dans ce lien.\n\nDans Notion : ouvre ta base de contrats → clique sur **···** (en haut à droite) → **Copier le lien**, puis recolle-le ici." });
    }
    const id = matches[matches.length - 1].toLowerCase();
    const idTirets = id.replace(/(.{8})(.{4})(.{4})(.{4})(.{12})/, '$1-$2-$3-$4-$5');
    let dbData = null;
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${idTirets}`, { headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' } });
      if (res.ok) { dbData = await res.json(); }
      else {
        const err = await res.json().catch(() => ({}));
        if (res.status === 404) return interaction.editReply({ content: "❌ **Lien lu, mais le bot n'a pas accès à cette base (404).**\n\nIl manque le partage : dans Notion, ouvre ta base → **···** → **Connexions** (ou *Connections*) → ajoute l'intégration du bot. Puis relance `/connecter-notion-contrats`." });
        if (res.status === 401) return interaction.editReply({ content: "❌ Token Notion refusé (401) : le NOTION_TOKEN dans Render n'est pas valide." });
        return interaction.editReply({ content: `❌ Erreur Notion ${res.status} : ${err.message || 'inconnue'}.` });
      }
    } catch (e) { return interaction.editReply({ content: `❌ Erreur réseau en contactant Notion : ${e.message}` }); }
    const db = loadDB();
    db.notionContratsDbId = idTirets;
    saveDB(db);
    const cols = Object.keys(dbData.properties || {});
    const aSuivi = cols.includes('Suivi');
    const contrats = db.contrats || [];
    let ok = 0;
    for (const c of contrats) {
      try {
        const signePar = c.status === 'signe' ? (c.signePar || c.clientNom || c.signataire || '') : null;
        await _syncContratNotion(c, c.status || 'en_attente', signePar);
        ok++;
      } catch {}
    }
    const titre = (dbData.title && dbData.title[0] && dbData.title[0].plain_text) ? dbData.title[0].plain_text : 'ta base';
    let msg = `✅ **Base Notion connectée : « ${titre} »**\n`;
    msg += `🔄 ${ok}/${contrats.length} contrat(s) existant(s) envoyé(s) vers Notion.\n`;
    msg += aSuivi ? "✅ Colonne **Suivi** détectée — parfait pour le tableau.\n" : "⚠️ Pas de colonne **Suivi** (type *Sélection*) : ajoute-la dans Notion pour grouper le tableau par étape.\n";
    msg += "\n📌 **Dernière étape dans Notion** : crée une vue **Tableau / Board** groupée par **Suivi** → tu pourras glisser-déposer. Les nouveaux contrats du bot apparaîtront tout seuls.";
    return interaction.editReply({ content: msg });
  }

  if (commandName === 'notion-test') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const lignes = [];
    lignes.push(process.env.NOTION_TOKEN ? '✅ NOTION_TOKEN présent' : '❌ NOTION_TOKEN MANQUANT dans Render');
    const _dbid = loadDB().notionContratsDbId || process.env.NOTION_CONTRATS_DB;
    const _src = loadDB().notionContratsDbId ? 'lien (/connecter-notion-contrats)' : (process.env.NOTION_CONTRATS_DB ? 'variable Render (NOTION_CONTRATS_DB)' : null);
    lignes.push(_src ? `✅ Base liée via ${_src}` : '❌ Aucune base liée');
    if (_dbid) lignes.push(`🆔 Base utilisée : ${_dbid}`);
    if (process.env.NOTION_TOKEN && _dbid) {
      try {
        const res = await fetch(`https://api.notion.com/v1/databases/${_dbid}`, {
          headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
        });
        if (res.ok) {
          const d = await res.json();
          const cols = Object.keys(d.properties || {});
          lignes.push('✅ Base Notion accessible !');
          lignes.push(`📋 Colonnes trouvées : ${cols.join(', ')}`);
          const attendues = ['Référence','Objet','Type','Statut','Rémunération','Partenaire','Émetteur','Date création'];
          const manquantes = attendues.filter(c => !cols.includes(c));
          if (manquantes.length) lignes.push(`⚠️ Colonnes manquantes : ${manquantes.join(', ')}`);
          else lignes.push('✅ Toutes les colonnes essentielles sont présentes.');
        } else {
          const err = await res.json().catch(() => ({}));
          if (res.status === 404) lignes.push('❌ Base introuvable (404) : soit l\'ID est faux, soit la base n\'est PAS partagée avec l\'intégration Notion.');
          else if (res.status === 401) lignes.push('❌ Token refusé (401) : le NOTION_TOKEN est invalide.');
          else lignes.push(`❌ Erreur ${res.status} : ${err.message || 'inconnue'}`);
        }
      } catch (e) { lignes.push(`❌ Erreur réseau : ${e.message}`); }
    }
    return interaction.editReply({ content: '🔍 **Diagnostic Notion (contrats)**\n\n' + lignes.join('\n') });
  }

  if (commandName === 'contrats-sync') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const _dbid = loadDB().notionContratsDbId || process.env.NOTION_CONTRATS_DB;
    if (!_dbid) return interaction.editReply({ content: "⚠️ Aucune base Notion liée. Utilise d'abord `/connecter-notion-contrats` en collant le lien de ta base." });
    const db = loadDB();
    const contrats = db.contrats || [];
    if (!contrats.length) return interaction.editReply({ content: '📭 Aucun contrat à synchroniser.' });
    let ok = 0;
    for (const c of contrats) {
      try {
        const signePar = c.status === 'signe' ? (c.signePar || c.clientNom || c.signataire || '') : null;
        await _syncContratNotion(c, c.status || 'en_attente', signePar);
        ok++;
      } catch {}
    }
    return interaction.editReply({ content: `🔄 Synchronisation lancée pour **${ok}/${contrats.length}** contrat(s).\nVérifie ta base Notion. Si certains manquent, regarde les logs Render pour le détail.` });
  }
  if (commandName === 'registre') { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); }
  if (commandName === 'registre')         return _handleRegistre(interaction);
  if (commandName === 'op')               return _handleOpDetail(interaction);
  if (commandName === 'profil')            return handleProfilEnhanced(interaction);
  if (commandName === 'bilan')             { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleBilanCommand?.(interaction); }
  if (commandName === 'rdv')               { if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); return _ouvrirMenuRdvSlash(interaction); }
  if (commandName === 'agenda') { if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); }
  if (commandName === 'agenda') {
    const subCmd = interaction.options?.getSubcommand(false);
    if (subCmd === 'creer') return _ouvrirModalAgendaSimple(interaction);
    if (subCmd === 'rdv') return _ouvrirMenuRdvSlash(interaction);
    return notionV3.handleAgendaCommand?.(interaction);
  }
  if (commandName === 'op-programmer')     { if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return _ouvrirModalOpProgrammee(interaction); }
  if (commandName === 'op-creer')          return _ouvrirModalOpCreer(interaction);
  if (commandName === 'setup-serveur')     return _handleSetupServeur(interaction);
  if (commandName === 'aide')              return _handleAide(interaction);
  if (commandName === 'patch')             { if (!isFondateurOuFleau(interaction.member)) return interaction.reply({ content: '❌ Réservé au Fondateur et au Fléau.', flags: MessageFlags.Ephemeral }); return _handlePatchDeploy(interaction); }
  if (commandName === 'version')           return _handleVersion(interaction);
  if (commandName === 'sync')              return _handleSync(interaction);
  if (commandName === 'avertir')           return _handleAvertir(interaction);
  if (commandName === 'avertissements')    return _handleAvertissements(interaction);
  if (commandName === 'retour')            return _handleRetour(interaction);
  if (commandName === 'annuler-absence')   return _handleAnnulerAbsence(interaction);
  if (commandName === 'purge')             return _handlePurge(interaction);

  if (commandName === 'stats') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral }); await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV5.handleStatsAvancees?.(interaction); }
  if (commandName === 'solde') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    const soldeLegal = db.coffres?.legal || 0; const soldeIlleg = db.coffres?.illegal || 0;
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('💰 Soldes des coffres — IWC').addFields({ name: '⚖️ Coffre Légal', value: `**$${soldeLegal.toLocaleString('fr-FR')}**`, inline: true }, { name: '🔒 Coffre Illégal', value: `**$${soldeIlleg.toLocaleString('fr-FR')}**`, inline: true }, { name: '💎 Total', value: `**$${(soldeLegal + soldeIlleg).toLocaleString('fr-FR')}**`, inline: true }).setFooter({ text: `IWC • ${fmtShort(new Date())}` })], flags: isDirection(interaction.member) ? undefined : MessageFlags.Ephemeral });
    return;
  }
  if (commandName === 'fiche') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    const membreOpt = interaction.options.getUser('membre');
    if (membreOpt) {
      const gm = await interaction.guild.members.fetch(membreOpt.id).catch(() => null);
      if (!gm) return interaction.reply({ content: '❌ Membre introuvable sur le serveur.', flags: MessageFlags.Ephemeral });
      return interaction.reply({ embeds: [_ficheMembreEmbed(gm, db)], flags: MessageFlags.Ephemeral });
    }
    const nomRaw = interaction.options.getString('nom');
    if (!nomRaw) return interaction.reply({ content: 'Indique un **membre** (mention @) ou un **nom** de personnage.', flags: MessageFlags.Ephemeral });
    const nom = nomRaw.toLowerCase();
    const cand = (db.candidatures || []).find(c => c.status === 'acceptee' && c.nomPerso?.toLowerCase().includes(nom));
    if (!cand) { const nomIC = Object.keys(MEMBRES_DISCORD_MAP).find(n => n.toLowerCase().includes(nom)); if (nomIC) { const discordId = MEMBRES_DISCORD_MAP[nomIC]; const membre = db.members[discordId]; await interaction.reply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`👤 Fiche — ${nomIC}`).setDescription('*Membre fondateur — fiche à compléter dans Notion*').addFields({ name: '🎭 Personnage', value: nomIC, inline: true }, { name: '📋 Statut', value: membre?.status === 'absent' ? '⚠️ Absent' : '✅ Actif', inline: true }, { name: '🎖️ Rang', value: membre?.rang || '—', inline: true }).setFooter({ text: 'IWC • Fiche personnage' })], flags: MessageFlags.Ephemeral }); return; } await interaction.reply({ content: `❌ Aucune fiche trouvée pour **${interaction.options.getString('nom')}**.`, flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(cand.type === 'illegal' ? 0x8B1A1A : 0x3B82F6).setTitle(`👤 Fiche — ${cand.nomPerso}`).addFields({ name: '🎭 Personnage', value: cand.nomPerso, inline: true }, { name: '🎂 Âge', value: cand.agePerso || '—', inline: true }, { name: '⚖️ Pôle', value: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal', inline: true }, { name: '💼 Métier', value: cand.metier || cand.specialite || '—', inline: true }, { name: '🕐 Disponibilités', value: cand.dispos || '—', inline: true }, { name: '📅 Entrée', value: fmtShort(cand.acceptedAt), inline: true }, { name: '📖 Background', value: (cand.background || '—').slice(0, 500) + ((cand.background?.length || 0) > 500 ? '...' : '') }).setFooter({ text: 'IWC • Fiche personnage' })], flags: MessageFlags.Ephemeral });
    return;
  }
  if (commandName === 'ops') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    const opsActives = (db.operations || []).filter(o => ['preparation', 'en_cours'].includes(o.status));
    if (!opsActives.length) { await interaction.reply({ content: '*Aucune opération en cours ou en préparation.*', flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🎯 Opérations actives — IWC').setDescription(opsActives.map(o => [`**${o.name}** — ${o.status === 'en_cours' ? '🟢 En cours' : '🟡 Préparation'}`, `📍 ${o.lieu || '—'} · 👥 ${(o.participants || []).join(', ') || 'Aucun'}`].join('\n')).join('\n\n')).setFooter({ text: `IWC • ${fmtShort(new Date())}` })] });
    return;
  }

  if (commandName === 'synthese') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!process.env.ANTHROPIC_API_KEY) {
      return interaction.editReply({ content: '⚠️ La synthèse IA nécessite une clé API (ANTHROPIC_API_KEY) configurée sur le serveur.' });
    }
    const sujet = interaction.options.getString('sujet').trim();
    const db = loadDB();
    const notes = [...(db.notesTerrain || []), ...(db.notesArchive || [])];
    if (notes.length === 0) return interaction.editReply({ content: '📭 Aucune note de terrain enregistrée.' });

    const sujetNorm = sujet.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const pertinentes = notes.filter(n => {
      const blob = `${n.info || ''} ${n.cible || ''} ${n.lieu || ''} ${n.agent || ''}`.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
      return blob.includes(sujetNorm);
    });
    if (pertinentes.length === 0) return interaction.editReply({ content: `📭 Aucune note ne mentionne « ${sujet} ».` });

    // Construire le corpus pour l'IA
    const corpus = pertinentes.slice(-40).map(n => {
      const d = new Date(n.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      return `[${d}] (agent ${n.agent}${n.lieu ? ', ' + n.lieu : ''}) ${(n.info || '').replace(/\*\*/g, '').replace(/▸/g, '').replace(/🔑.*/s, '').trim()}`;
    }).join('\n');

    try {
      const prompt = `Tu es un officier de renseignement de la compagnie Iron Wolf (western RP, 1895).
Voici toutes les notes de terrain mentionnant « ${sujet} » :

${corpus}

Rédige une SYNTHÈSE de renseignement claire et structurée sur ${sujet}. Format en texte simple (pas de markdown lourd) :
- Qui/Quoi c'est (si identifiable)
- Faits marquants observés (les plus importants)
- Personnes/lieux associés
- Niveau de menace estimé (faible / moyen / élevé) avec justification courte
Sois concis et factuel, base-toi UNIQUEMENT sur les notes. Maximum 250 mots.`;

      const resp = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 700, messages: [{ role: 'user', content: prompt }] }),
      });
      const data = await resp.json();
      const synthese = data?.content?.[0]?.text || 'Synthèse indisponible.';

      const embed = new EmbedBuilder()
        .setColor(0x8B5A2A)
        .setTitle(`🧠 Synthèse de renseignement — ${sujet}`)
        .setDescription(synthese.slice(0, 4000))
        .setFooter({ text: `IWC · Basé sur ${pertinentes.length} note(s)` })
        .setTimestamp();
      return interaction.editReply({ embeds: [embed] });
    } catch (e) {
      console.log('❌ /rapport IA:', e.message);
      return interaction.editReply({ content: '❌ Erreur lors de la génération de la synthèse.' });
    }
  }

  if (commandName === 'notes') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const db = loadDB();
    let notes = (db.notesTerrain || []).slice();
    if (notes.length === 0) return interaction.editReply({ content: '📭 Aucune note de terrain enregistrée pour le moment.' });

    const filtre = (interaction.options.getString('filtre') || '').toLowerCase().trim();
    const nombre = interaction.options.getInteger('nombre') || 10;

    if (filtre) {
      notes = notes.filter(n =>
        (n.agent || '').toLowerCase().includes(filtre) ||
        (n.lieu  || '').toLowerCase().includes(filtre) ||
        (n.info  || '').toLowerCase().includes(filtre) ||
        (n.cible || '').toLowerCase().includes(filtre) ||
        (n.tags  || []).some(t => t.toLowerCase().includes(filtre))
      );
    }
    if (notes.length === 0) return interaction.editReply({ content: `📭 Aucune note ne correspond à « ${filtre} ».` });

    notes = notes.slice(-nombre).reverse();
    const prioEmoji = { normale: '⬜', importante: '🟡', urgente: '🔴' };
    const lignes = notes.map(n => {
      const d = new Date(n.date);
      const quand = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }) + ' ' + d.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
      const tags = (n.tags || []).length ? '  ' + n.tags.join(' ') : '';
      const lieu = n.lieu ? ` 📍${n.lieu}` : '';
      const cible = n.cible ? ` 🎯${n.cible}` : '';
      return `${prioEmoji[n.priorite] || '⬜'} **${quand}** · ${n.agent}${cible}${lieu}${tags}\n> ${n.info}`;
    });

    const embed = new EmbedBuilder()
      .setColor(0x8B5A2A)
      .setTitle(`🕵️ Notes de terrain ${filtre ? '— « ' + filtre + ' »' : ''}`)
      .setDescription(lignes.join('\n\n').slice(0, 4000))
      .setFooter({ text: `IWC · ${notes.length} note(s) affichée(s) sur ${(db.notesTerrain || []).length} total` });
    return interaction.editReply({ embeds: [embed] });
  }

  if (commandName === 'absent') {
    if (!isMembre(interaction.member)) return interaction.reply({ content: '❌ Commande réservée aux membres IWC.', flags: MessageFlags.Ephemeral });
    // Ouvrir un modal pour saisie libre de la durée + options
    const modal = new ModalBuilder().setCustomId('modal_absent').setTitle('🟡 Déclarer une absence');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('duree')
          .setLabel('Durée')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 2 jours · 1 semaine · jusqu\'au 10 juin · ce soir 22h · Indéterminé')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('raison')
          .setLabel('Raison (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Ex: vacances, travail, IRL...')
      ),
    );
    await interaction.showModal(modal);
    return;
  }

  if (commandName === 'rapport') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    await interaction.reply({ content: '📋 Rapport en cours d\'envoi en DM...', flags: MessageFlags.Ephemeral });
    await envoyerRapportDirection(guild); return;
  }
  if (commandName === 'promo' || commandName === 'retro') {
    const cible = interaction.options.getUser('membre');
    if (!cible) { await interaction.reply({ content: '❌ Précise un membre.', flags: MessageFlags.Ephemeral }); return; }
    return notionV3.showGradeMembre?.(interaction, cible.id);
  }
}

async function cleanBotPinnedMessages(guild, ...channelNames) {
  const botId = guild.members.me?.id; if (!botId) return;
  for (const name of channelNames) {
    try {
      const ch = getCh(guild, name); if (!ch) continue;
      const pinnedRaw = await ch.messages.fetchPins().catch(() => null);
      if (pinnedRaw) {
        const pinnedList = pinnedRaw.values ? [...pinnedRaw.values()] : (Array.isArray(pinnedRaw) ? pinnedRaw : []);
        for (const msg of pinnedList) { if (msg.author.id !== botId) continue; await msg.unpin().catch(() => {}); await msg.delete().catch(() => {}); }
      }
      const msgs = await ch.messages.fetch({ limit: 50 }).catch(() => null);
      if (!msgs) continue;
      for (const [, msg] of msgs) { if (msg.type === 6) await msg.delete().catch(() => {}); }
      const botMsgs = [...msgs.values()].filter(m => m.author.id === botId && m.embeds?.length > 0).sort((a, b) => b.createdTimestamp - a.createdTimestamp);
      for (let i = 1; i < botMsgs.length; i++) { await botMsgs[i].delete().catch(() => {}); }
    } catch (e) { console.log(`❌ cleanBotPinnedMessages error dans ${name}:`, e.message); }
  }
}

async function _cleanTransactionMessages(guild, channelName) {
  try {
    const ch = getCh(guild, channelName); if (!ch) return;
    const botId = guild.members.me?.id; if (!botId) return;
    const msgs = await ch.messages.fetch({ limit: 100 }).catch(() => null); if (!msgs) return;
    const orphelins = [...msgs.values()].filter(m => m.author.id === botId && m.embeds?.length > 0 && !(m.components?.length > 0) && m.type === 0);
    for (const m of orphelins) await m.delete().catch(() => {});
    if (orphelins.length > 0) console.log(`🧹 ${orphelins.length} transaction(s) orpheline(s) supprimée(s) dans #${ch.name}`);
  } catch (e) { console.log('❌ _cleanTransactionMessages error:', e.message); }
}

const GUIDE_PAPIERS_CHUNKS = [
  `# 📒 LES PAPIERS — GUIDE DES COMMANDES
*Tous les documents officiels de La Confrérie. Chaque papier reçoit une référence unique et est archivé automatiquement au registre.*

## ✍️ Créer un document
Chaque commande ci-dessous ouvre un **formulaire** à remplir ; le document est ensuite posté, mis en page proprement, puis archivé.

**\`/recu\`** 🧾 — un reçu / une quittance (preuve de paiement ou de remise).
**\`/dette\`** 📜 — une reconnaissance de dette (signable et soldable).
**\`/casier\`** 🗂️ — une fiche sur un membre ou sur une cible.
**\`/ordre\`** 🎖️ — un ordre de mission destiné à des agents.
**\`/carte\`** 🎴 — une carte de membre officielle.
**\`/billet\`** 🃏 — le billet de La Confrérie, laissé après un coup.`,
  `## 🩸 Le Code
**\`/code\`** 📖 — affiche le Code de La Confrérie.
> • Option \`membre\` → l'envoie en privé (MP) à quelqu'un.
> • Option \`tous\` → l'envoie à tous les membres en MP *(Direction)*.
> • Bouton **« 🩸 Apposer ma marque de sang »** : le nouveau prête serment, le scelle dans le sang, et son **nom RP** est inscrit au registre.

## 🔫 Avis de recherche
**\`/wanted\`** 🔫 *(Direction)* — émet un avis de recherche : nom, chef d'accusation, prime, dernière position connue, et un **portrait**. Tout le pôle Confrérie est **ping** et l'avis est **épinglé** automatiquement.
> Bouton **« 💀 Capturé / Abattu »** → clôture l'avis (qui a touché la prime, vivant ou mort).
**\`/wanted-liste\`** 📋 — affiche tous les avis de recherche **encore actifs** du salon.

## 📂 Consulter les archives
**\`/papiers\`** 📒 — affiche les derniers documents archivés.
> • Option \`type\` → filtre par type (dettes, avis, reçus…).
> • Option \`recherche\` → cherche par nom ou mot-clé.`,
  `## 🔘 Les actions sur un document
Selon le type de papier, des boutons apparaissent dessous :

**📨 Envoyer à une personne** — *(reçu, dette, ordre, carte)*
Envoie le document **en MP** à un **membre du serveur**, OU à n'importe quel **ID Discord** (même quelqu'un hors du serveur). Le destinataire doit **valider la réception** (ou **signer**, pour une dette). Dès qu'il valide, le document passe en « ✅ Validé » et **tu es prévenu automatiquement** dans le salon.

**✍️ Signer la dette** / **💰 Marquer soldée** — *(dette)*
Faire signer la reconnaissance de dette, ou la clôturer une fois réglée.

**🚫 Révoquer** — *(tous, Direction)*
Annule un document (devenu caduc) sans le supprimer du registre.

**📤 Transmettre à un allié**
Laisse une copie du papier sur un serveur allié, **anonymement**, signée « La Confrérie ».

*ℹ️ Chaque document conserve une référence unique (ex. \`DETTE-04821\`) pour le retrouver facilement via \`/papiers\`.*

*— L'Administration de La Confrérie*`,
];

async function autoSetup(guild) {
  const db = loadDB(); console.log('🔧 Auto-setup en cours...');
  await cleanBotPinnedMessages(guild, 'planning', 'grade', 'coffre-entreprise', 'coffre-illegal', 'affaires');
  // Nettoyer le format "PLANS TACTIQUES" s'il a été posté par erreur dans #informateurs
  try {
    const infosCh2 = getChById(guild, 'INFORMATEURS', 'informateurs');
    if (infosCh2) {
      const msgs = await infosCh2.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) {
        if (m.author.id === guild.members.me?.id && m.embeds?.[0]?.title?.includes('PLANS TACTIQUES')) {
          await m.delete().catch(() => {});
        }
      }
    }
  } catch {}
  // Nettoyer le dashboard des salons dossier-recrutement
  try {
    const dossCh = guild.channels.cache.get(SALON_HARDCODED.DOSSIER_RECRUTEMENT);
    if (dossCh) {
      const msgs = await dossCh.messages.fetch({ limit: 20 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) {
        if (m.author.id === guild.members.me?.id && m.embeds?.[0]?.title?.includes('TABLEAU DE BORD')) {
          await m.delete().catch(() => {});
        }
      }
    }
  } catch {}
  notionModules.nettoyerTransactionsFantomes?.();
  await _cleanTransactionMessages(guild, 'coffre-entreprise');
  await _cleanTransactionMessages(guild, 'coffre-illegal');
  await updateDashboard(guild);
  await notionModules.setupTresorButton?.(guild);
  // Nettoyer les mauvais messages dans #absences (le panel affaires ne doit pas être là)
  try {
    // Nettoyer les deux salons absences (légal + illégal)
    for (const absId of [SALON_HARDCODED.ABSENCES_LEGAL, SALON_HARDCODED.ABSENCES_ILLEGAL]) {
      const absCh = guild.channels.cache.get(absId);
      if (!absCh) continue;
      const msgs = await absCh.messages.fetch({ limit: 50 }).catch(() => null);
      if (msgs) for (const [, m] of msgs) {
        if (m.author.id === guild.members.me?.id && m.embeds?.[0]?.title?.includes('AFFAIRES')) {
          await m.delete().catch(() => {});
        }
      }
    }
  } catch {}
  // Panel affaires dans les bons salons uniquement
  await notionV3.setupAffairesPanel?.(guild);
  await notionV3.updateHierarchieEmbed?.(guild);
  await notionV3.setupInformateursPanel?.(guild);
  await setupFicheFormat(guild);
  await setupPlansFormat(guild);
  await setupPlanningFormat(guild);
  await setupSurnomFormat(guild);
  await setupCommandesSlash(guild);
  await setupPanelDirection(guild);
  if (typeof setupOperationsGuide === 'function') await setupOperationsGuide(guild);
  // Sync statut + pôle de tous les membres dans Fiches_personnages au démarrage
  _syncTousMembresNotion(guild).catch(() => {});
  // Sync de tous les membres dans le Registre des membres (création + MàJ)
  _syncRegistreTousMembres(guild).catch(() => {});

  // Salon du règlement : on cible le salon précis fourni par la Direction (le règlement y est déjà rédigé)
  const reglCh = guild.channels.cache.get('1511135557143629926') || getChById(guild, 'REGLEMENT', 'reglement', 'règlement');
  if (reglCh) {
    const msgs = await reglCh.messages.fetch({ limit: 30 }).catch(() => null);
    // Le règlement complet est-il déjà posté par le bot ? (marqueur = titre du règlement)
    const reglDejaPoste = msgs ? msgs.some(m => m.author.id === client.user.id && m.content.includes('RÈGLEMENT — LA CONFRÉRIE')) : false;
    if (!reglDejaPoste) {
      const _ids = [];
      for (const _chunk of REGLEMENT_CHUNKS) { const _m = await reglCh.send(_chunk).catch(() => null); if (_m) _ids.push(_m.id); }
      db.reglementChunkIds = _ids;
      console.log('✅ Règlement complet posté dans #' + reglCh.name + ' (' + _ids.length + ' messages)');
    }
    const existing = msgs ? msgs.find(m => m.author.id === client.user.id && m.content.includes('VALIDATION')) : null;
    if (existing) { db.reglementMsgId = existing.id; }
    else if (!(db.reglementMsgId && (await reglCh.messages.fetch(db.reglementMsgId).catch(() => null)))) {
      // Le règlement est déjà écrit par la Direction dans ce salon.
      // Le bot ajoute SEULEMENT le message de validation avec la réaction ✅.
      const sent = await reglCh.send('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n✅ VALIDATION DU RÈGLEMENT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\nLe règlement ci-dessus est affiché en plusieurs parties, mais il forme **un seul et même règlement**.\n\n➡️ **Une seule réaction ✅ sur CE message** valide l\'intégralité (toutes les parties). Pas besoin de réagir partie par partie.\n\n*En réagissant, vous confirmez avoir lu, compris et accepté chaque article.*\n— La Direction');
      await sent.react('✅'); db.reglementMsgId = sent.id;
      console.log('✅ Message de validation du règlement posté dans #' + reglCh.name);
    }
    saveDB(db);
  }

  // Salon « guide des commandes Papiers » : le bot poste le guide s'il n'y est pas déjà (anti-doublon par titre)
  const guideCh = guild.channels.cache.get('1510212339285360781');
  if (guideCh) {
    const gmsgs = await guideCh.messages.fetch({ limit: 30 }).catch(() => null);
    const guideDejaPoste = gmsgs ? gmsgs.some(m => m.author.id === client.user.id && m.content.includes('LES PAPIERS — GUIDE DES COMMANDES')) : false;
    if (!guideDejaPoste) {
      const _gids = [];
      for (const _g of GUIDE_PAPIERS_CHUNKS) { const _m = await guideCh.send(_g).catch(() => null); if (_m) _gids.push(_m.id); }
      db.guidePapiersIds = _gids;
      saveDB(db);
      console.log('✅ Guide des commandes Papiers posté dans #' + guideCh.name + ' (' + _gids.length + ' messages)');
    }
  }

  // S'assurer que les visiteurs ont accès aux salons d'entrée (recrutement, règlement)
  await _assurerAccesVisiteur(guild).catch(() => {});
  // Définir la description (sujet) de chaque salon — en arrière-plan pour ne pas ralentir le démarrage
  _definirDescriptionsSalons(guild).catch(() => {});
  // Installer le menu principal + « Commencer ici » s'ils ne sont pas déjà posés (anti-doublon)
  _installerMenu(guild, false).then(r => console.log(`🎛️ Menu auto-installé (menu:${r.okMenu} · commencer-ici:${r.okStart})`)).catch(() => {});

  const recrutCh = guild.channels.cache.get(CH.RECRUTEMENT);
  if (recrutCh) {
    const msgs = await recrutCh.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('CANDIDATURE') && m.components.length > 0 && m.components[0]?.components?.length >= 1);
    if (existing) { db.recrutementMsgId = existing.id; }
    else {
      for (const [, mm] of msgs) { if (mm.author.id === client.user.id && /RECRUTEMENT|CANDIDATURE/i.test(mm.embeds[0]?.title || '') && (mm.components?.length || 0) > 0) await mm.delete().catch(() => {}); }
      if (db.recrutementMsgId) { const old = await recrutCh.messages.fetch(db.recrutementMsgId).catch(() => null); if (old) await old.delete().catch(() => {}); db.recrutementMsgId = null; }
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('📋 CANDIDATURE — IRON WOLF COMPANY').setDescription('*On ne demande pas à rejoindre la Compagnie. On y est invité.*\n*Si vous êtes ici, c\'est qu\'on vous en juge digne.*').addFields({ name: '📝 Rejoindre la Compagnie', value: '→ Clique sur **📋 Candidature** et remplis le formulaire.\n→ Présente ton personnage, son parcours, tes disponibilités.' }, { name: '⚠️ Important', value: '→ Réponse en DM sous 48h\n→ Aucune justification en cas de refus\n→ *La porte est ouverte une fois. Une seule.*' }).setFooter({ text: 'Iron Wolf Company • Recrutement officiel' });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('open_candidature_legal').setLabel('📋 Candidature').setStyle(ButtonStyle.Primary));
      const sent = await recrutCh.send({ embeds: [embed], components: [row] }); db.recrutementMsgId = sent.id;
    }
    saveDB(db);
  }

  const contratsCh = guild.channels.cache.get(SALON_HARDCODED.CONTRATS) || guild.channels.cache.get(CH.CONTRATS);
  if (contratsCh) {
    const msgs = await contratsCh.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) {
      if (m.author.id === client.user.id && m.embeds[0]?.title?.includes('IRON WOLF COMPANY — CONTRATS')) {
        const hasRdvBtn = m.components?.[0]?.components?.some(c => c.customId === 'btn_rdv_creer_contrat_panel');
        if (!hasRdvBtn) await m.delete().catch(() => {});
      }
    }
    const msgs2 = await contratsCh.messages.fetch({ limit: 10 });
    if (!msgs2.find(m => m.author.id === client.user.id && m.embeds[0]?.title?.includes('IRON WOLF COMPANY — CONTRATS'))) {
      const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 IRON WOLF COMPANY — CONTRATS').setDescription('*Tout accord entre la Compagnie et ses partenaires doit être formalisé.*\n*Un contrat signé engage les deux parties sans exception.*').addFields({ name: '📥 Recevoir nos conditions', value: '→ Le client reçoit tes tarifs & conditions\n→ Il signe → tu reçois la notification' }, { name: '📥 Signer un contrat employeur', value: '→ Une entreprise vous engage\n→ Tu rentres ses infos & ses conditions\n→ Tu signes → ils reçoivent la notification' }).setFooter({ text: 'Iron Wolf Company • Secrétariat officiel' });
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('open_contrat_offre').setLabel('📥 Recevoir nos conditions').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('open_contrat_emploi').setLabel('📥 Signer un contrat employeur').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('btn_rdv_creer_contrat_panel').setLabel('📅 Planifier un RDV').setStyle(ButtonStyle.Secondary),
      );
      await contratsCh.send({ embeds: [embed], components: [row] });
    }
    // Panneau « 🐺 CONTRATS — LA CONFRÉRIE » (module contrats-confrerie) — permanent, posté seulement s'il manque
    try {
      const msgs3 = await contratsCh.messages.fetch({ limit: 20 });
      const dejaConf = msgs3.find(m => m.author.id === client.user.id && (m.embeds[0]?.title || '').includes('CONTRATS — LA CONFRÉRIE'));
      if (!dejaConf && typeof contratsConf.postPanel === 'function') await contratsConf.postPanel(contratsCh).catch(() => {});
    } catch (e) { console.log('⚠️ auto-post panneau Confrérie:', e.message); }
  }

  // Panneau « 🎯 CENTRE DES OPÉRATIONS » (module operations) — permanent, posté seulement s'il manque
  try {
    const opsCh = guild.channels.cache.get(SALON_HARDCODED.OPERATIONS)
      || getChById(guild, 'OPERATIONS', 'operations', 'operations-en-cours');
    if (opsCh && typeof operations.postPanel === 'function') {
      const msgsOps = await opsCh.messages.fetch({ limit: 20 });
      const dejaOps = msgsOps.find(m => m.author.id === client.user.id && (m.embeds[0]?.title || '').includes('CENTRE DES OPÉRATIONS'));
      if (!dejaOps) await operations.postPanel(opsCh).catch(() => {});
    }
  } catch (e) { console.log('⚠️ auto-post panneau opérations:', e.message); }

  // Tableau immersif des échéances de contrats dans le salon planning/agenda
  _installerPlanningContrats(guild).then(() => console.log('📜 Tableau des échéances de contrats installé')).catch(() => {});
  // Panneau d'accueil du salon Vestiaire / Tenue
  _installerTenuePanel(guild).then(() => console.log('🤠 Panneau Vestiaire installé')).catch(() => {});
  // Panneau « Nouvelle fiche de contact »
  repertoire.installerPanelContact?.(guild).then(() => console.log('🎴 Panneau Contact installé')).catch(() => {});
  // Registre forum — une fiche (post) par membre
  _syncRegistreForum(guild).then(() => console.log('🗂️ Registre forum synchronisé')).catch(() => {});
  // Le Réseau — panneau du salon informateur
  reseau.installerPanel?.(guild).then(() => console.log('🕵️ Panneau Le Réseau installé')).catch(() => {});
  // Facturation — panneau du salon factures
  factures.installerPanel?.(guild).then(() => console.log('🧾 Panneau Facturation installé')).catch(() => {});

  console.log('✅ Auto-setup terminé\n');
}

async function notionQueryAgenda() {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return [];
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_AGENDA_DB_ID}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Date', date: { on_or_after: new Date().toISOString() } }, sorts: [{ property: 'Date', direction: 'ascending' }] }) });
    const data = await res.json();
    return (data.results || []).map(p => ({ id: p.id, titre: p.properties.Titre?.title?.[0]?.plain_text || '—', date: p.properties.Date?.date?.start, heure: p.properties.Heure?.rich_text?.[0]?.plain_text, type: p.properties.Type?.select?.name || 'Réunion', participants: p.properties.Participants?.multi_select?.map(x => x.name) || [], lieu: p.properties.Lieu?.rich_text?.[0]?.plain_text || '—', notes: p.properties.Notes?.rich_text?.[0]?.plain_text, notif24: p.properties['Notif 24h']?.checkbox, notif1h: p.properties['Notif 1h']?.checkbox, notif15: p.properties['Notif 15min']?.checkbox, statut: p.properties['Statut']?.select?.name || '', url: p.url }));
  } catch { return []; }
}

// (déplacé dans utils.js)
function buildRdvDate(dateStr, heureStr) {
  if (!dateStr) return null; const jour = dateStr.split('T')[0]; let hh = 0, mm = 0;
  if (heureStr && /\d{1,2}[:hH]\d{2}/.test(heureStr)) { const m = heureStr.match(/(\d{1,2})[:hH](\d{2})/); hh = parseInt(m[1], 10); mm = parseInt(m[2], 10); }
  else if (dateStr.includes('T')) { const t = dateStr.split('T')[1]; hh = parseInt(t.slice(0, 2), 10); mm = parseInt(t.slice(3, 5), 10); }
  const provisoire = new Date(`${jour}T${String(hh).padStart(2,'0')}:${String(mm).padStart(2,'0')}:00Z`);
  return new Date(provisoire.getTime() - parisOffsetHours(provisoire) * 3600000);
}
function buildParticipantMentions(participants) {
  const EXCLUS_PING = ['982201491773354035']; // Thomas Galagan — ne plus pinger sur les RDV
  return participants.map(name => { const val = PARTICIPANTS_MAP[name]; if (!val) return null; const m = val.startsWith('<@') ? val : `<@${val}>`; if (EXCLUS_PING.some(id => m.includes(id))) return null; return m; }).filter(Boolean).join(' ');
}

async function checkAgenda(guild) {
  const appts = await notionQueryAgenda();
  const ch = getChById(guild, 'AGENDA', 'agenda') || getChById(guild, 'PLANNING', 'planning');
  if (!ch || !appts.length) return;
  const mention = getMention(guild);
  const db = loadDB();
  if (!db.sentReminders) db.sentReminders = {};
  if (!db.reminderMsgIds) db.reminderMsgIds = {};
  let changed = false;
  for (const a of appts) {
    if (a.statut === 'Annulé' || !a.date) continue;
    const dt = buildRdvDate(a.date, a.heure); if (!dt) continue;
    const mins = Math.floor((dt.getTime() - Date.now()) / 60000);
    const ping = buildParticipantMentions(a.participants) || mention;
    const heureAff = dt.toLocaleTimeString('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' });
    const mkEmbed = (t, c) => new EmbedBuilder().setColor(c).setTitle(t).setDescription(`## 📅 ${a.titre}`).addFields({ name: 'Quand', value: `${fmtLong(a.date)}${heureAff ? ` à **${heureAff}**` : ''}`, inline: true }, { name: 'Lieu', value: a.lieu || '—', inline: true }, { name: 'Participants', value: a.participants?.length > 0 ? a.participants.join(', ') : '—' }, ...(a.notes ? [{ name: 'Notes', value: a.notes }] : []), { name: 'Modifier', value: `[Notion](${a.url})` }).setFooter({ text: 'IWC • Secrétariat automatique' });
    const sent = k => db.sentReminders[`${a.id}_${k}`];
    const getMsgId = k => db.reminderMsgIds[`${a.id}_${k}`];
    const envoyerRappel = async (key, prevKey, pingText, embed, dmTitle, dmColor) => {
      if (sent(key)) return;
      if (prevKey && getMsgId(prevKey)) { const prevMsg = await ch.messages.fetch(getMsgId(prevKey)).catch(() => null); if (prevMsg) await prevMsg.delete().catch(() => {}); delete db.reminderMsgIds[`${a.id}_${prevKey}`]; }
      const msg = await ch.send({ content: pingText, embeds: [embed] }).catch(() => null);
      if (msg) db.reminderMsgIds[`${a.id}_${key}`] = msg.id;
      for (const name of (a.participants || [])) { const uid = PARTICIPANTS_MAP[name]; if (uid && !uid.startsWith('<@&') && uid !== '982201491773354035') { await envoyerDMRecap(guild, uid, 'rappel', { titre: a.titre, dans: dmTitle, date: fmtLong(a.date), heure: a.heure || '', lieu: a.lieu || '—' }).catch(() => {}); } }
      db.sentReminders[`${a.id}_${key}`] = true; changed = true;
    };
    if (mins > 0) {
      if (a.notif24 && !sent('24h') && mins <= 1440 && mins > 60) await envoyerRappel('24h', null, `${ping} — 📅 RDV dans 24h`, mkEmbed('📅 Rappel — 24 heures', 0x5865F2), '📅 Rappel — RDV dans 24h', 0x5865F2);
      if (a.notif1h && !sent('1h') && mins <= 60 && mins > 15) await envoyerRappel('1h', '24h', `${ping} — ⏰ RDV dans 1 heure`, mkEmbed('⏰ Rappel — 1 heure', 0xFFA500), '⏰ Rappel — RDV dans 1 heure', 0xFFA500);
      if (a.notif15 && !sent('15min') && mins <= 15) await envoyerRappel('15min', '1h', `${ping} — 🚨 15 minutes !`, mkEmbed('🚨 URGENT — 15 min', 0xED4245), '🚨 URGENT — RDV dans 15 minutes !', 0xED4245);
    }
    if (mins < -120) { ['24h','1h','15min'].forEach(k => { delete db.sentReminders[`${a.id}_${k}`]; delete db.reminderMsgIds[`${a.id}_${k}`]; }); changed = true; }
  }
  if (changed) saveDB(db);
}

async function postDailyAgenda(guild) {
  const ch = getChById(guild, 'AGENDA', 'agenda') || getChById(guild, 'PLANNING', 'planning'); if (!ch) return;
  const appts = await notionQueryAgenda(); const today = new Date().toISOString().split('T')[0];
  const todayA = appts.filter(a => a.date?.startsWith(today) && a.statut !== 'Annulé'); if (!todayA.length) return;
  const weekA = appts.filter(a => { if (!a.date || a.statut === 'Annulé') return false; const d = new Date(a.date); return d >= new Date() && d <= new Date(Date.now() + 7*86400000); });
  const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📅 Agenda — ${fmtLong(new Date())}`).setDescription(todayA.map(a => `📅 **${a.titre}**\n🕐 ${a.heure || '—'} · 📍 ${a.lieu} · 👥 ${a.participants.join(', ') || '—'}`).join('\n\n'));
  const nw = weekA.filter(a => !a.date?.startsWith(today)).slice(0, 5);
  if (nw.length) embed.addFields({ name: '📆 Cette semaine', value: nw.map(a => `📅 **${a.titre}** — ${fmtShort(a.date)} ${a.heure || ''}`).join('\n') });
  embed.setFooter({ text: 'IWC • Secrétariat automatique' });
  const _mentionIds = guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => r.id);
  await ch.send({ content: getMention(guild) || undefined, embeds: [embed], allowedMentions: { parse: [], roles: _mentionIds } });
}

client.on('guildMemberAdd', async member => {
  const db = loadDB(); const guild = member.guild;
  const inviteur = await _detecterInviteur(guild);
  const visiteurRole = guild.roles.cache.find(r => r.name.includes('Visiteur'));
  if (visiteurRole) await member.roles.add(visiteurRole).catch(() => {});
  // Garantir que le rôle Visiteur a bien accès aux salons d'entrée (recrutement, règlement)
  await _assurerAccesVisiteur(guild).catch(() => {});
  db.members[member.id] = { id: member.id, name: member.user.username, status: 'visiteur', rang: 'Visiteur', joinedAt: new Date().toISOString(), lastActivity: new Date().toISOString() };
  saveDB(db);

  const arriveesCh = getChById(guild, 'ARRIVEES', 'arrivees', 'arrivée');
  if (arriveesCh) {
    await arriveesCh.send({
      content: `👋 <@${member.id}> bienvenue à l'**Iron Wolf Company** ! Voici comment bien commencer 👇`,
      embeds: [_buildCommencerIci()],
      allowedMentions: { users: [member.id] },
    });
  }
  await sendLog(guild, 'ARRIVEE', { userId: member.id, username: member.user.username, accountAge: daysSince(member.user.createdAt), inviteur });
  await notionExtra.alerteCompteSuspect?.(guild, member);
  await envoyerDMRecap(guild, member.id, 'candidature', { message: '🐺 Bienvenue sur **Iron Wolf Company** !\n\nLis le **#règlement** et postule dans **#recrutement**.\n\n*La porte est ouverte une fois. Une seule.*\n— La Direction' }).catch(() => {});
});

client.on('inviteCreate', invite => { try { const m = _inviteCache.get(invite.guild.id) || new Map(); m.set(invite.code, { uses: invite.uses || 0, inviterTag: invite.inviter?.username || null, inviterId: invite.inviter?.id || null }); _inviteCache.set(invite.guild.id, m); } catch {} });
client.on('inviteDelete', invite => { try { const m = _inviteCache.get(invite.guild.id); if (m) { m.delete(invite.code); _inviteCache.set(invite.guild.id, m); } } catch {} });

function _gradeDepuisRoles(member) {
  try {
    const v3 = require('./notion-modules-v3');
    const ROLES = v3.ROLES || {};
    const ordered = [...(v3.GRADES_LEGAL || []), ...(v3.GRADES_ILLEGAL || [])]; // index 0 = grade le plus élevé
    for (const g of ordered) { const rid = ROLES[g.roleKey]; if (rid && member.roles.cache.has(rid)) return g.nom; }
  } catch {}
  return 'Visiteur';
}
client.on('guildMemberUpdate', async (oldMember, newMember) => {
  const oldRoles = oldMember.roles.cache.map(r => r.id).sort().join(',');
  const newRoles = newMember.roles.cache.map(r => r.id).sort().join(',');
  const rolesChanged = oldRoles !== newRoles;
  // Détecter aussi un changement de surnom (= nom RP affiché sur le serveur)
  const nomChanged = (oldMember.displayName || '') !== (newMember.displayName || '') || (oldMember.nickname || '') !== (newMember.nickname || '');

  // Si SEUL le nom a changé (pas les rôles) → on resynchronise juste le nom RP dans Notion
  if (nomChanged && !rolesChanged) {
    const nouveauNom = newMember.displayName || newMember.user.username;
    console.log(`🔄 Surnom changé : ${oldMember.displayName} → ${nouveauNom} · resync Notion`);
    // MàJ du nom dans Fiches_personnages
    _syncStatutFicheNotion(newMember.id, null, { nom: nouveauNom }).catch(() => {});
    // MàJ du nom RP (Personnage) dans le Registre des membres ; le Nom reste le pseudo Discord
    _majNomRegistre(newMember.id, nouveauNom, newMember.user.username).catch(() => {});
    // MàJ DB locale
    try { const dbN = loadDB(); if (dbN.members[newMember.id]) { dbN.members[newMember.id].name = nouveauNom; saveDB(dbN); } } catch {}
    return;
  }

  if (!rolesChanged) return;
  const db = loadDB();
  const gradeRoleIds = Object.values(require('./notion-modules-v3').ROLES || {});
  const gradeChange = gradeRoleIds.some(id => oldMember.roles.cache.has(id) !== newMember.roles.cache.has(id));

  // Détecter changement de pôle (légal ↔ illégal)
  const illegalRoleNames = ['Concepteur', 'Fléau', 'fleau', 'Exécuteur', 'éxécuteur', 'execu', 'Condamné', 'condamne', 'Maudit', 'Confrérie', 'confrerie'];
  const legalRoleNames   = ['Le Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent Conf', 'Opérateur', 'Operateur', 'Recrue', 'Probatoire', 'Panseur', 'Penseur'];
  const wasIlleg = oldMember.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const isIlleg  = newMember.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const wasLegal = oldMember.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)));
  const isLegal  = newMember.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)));
  const poleChange = wasIlleg !== isIlleg || wasLegal !== isLegal;

  if (gradeChange || poleChange) {
    if (global._hierUpdating) return;
    global._hierUpdating = true;
    setTimeout(async () => {
      global._hierUpdating = false;
      if (gradeChange) {
        await require('./notion-modules-v3').updateHierarchieEmbed?.(newMember.guild).catch(() => {});
        console.log(`✅ Hiérarchie mise à jour suite au changement de rôle de ${newMember.displayName}`);
      }
      const nouveauGrade = _gradeDepuisRoles(newMember);
      // Calculer le nouveau pôle
      const nouveauPole = isIlleg ? 'illegal' : 'legal'; // illégal prioritaire
      const poleLabel   = nouveauPole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal';
      // Sync Registre des Membres (Nom = pseudo Discord, Personnage = nom RP)
      _syncMembreNotion(newMember.id, { rang: nouveauGrade, pole: nouveauPole, nom: newMember.displayName || newMember.user.username, username: newMember.user.username }).catch(() => {});
      // Sync Fiches_personnages si changement de pôle
      if (poleChange) {
        console.log(`🔄 Changement de pôle pour ${newMember.displayName} → ${poleLabel}`);
        _syncStatutFicheNotion(newMember.id, null, { pole: poleLabel, nom: newMember.displayName || newMember.user.username }).catch(() => {});
      }
      // Mettre à jour la DB locale
      const dbFresh = loadDB();
      if (!dbFresh.members[newMember.id]) {
        // Nouveau membre qui vient de recevoir son premier rôle de pôle → l'enregistrer
        dbFresh.members[newMember.id] = {
          id: newMember.id,
          name: newMember.user.username,
          status: 'actif',
          rang: nouveauGrade,
          pole: nouveauPole,
          joinedAt: new Date().toISOString(),
          lastActivity: new Date().toISOString(),
        };
      } else {
        dbFresh.members[newMember.id].pole = nouveauPole;
        dbFresh.members[newMember.id].rang = nouveauGrade;
        if (dbFresh.members[newMember.id].status === 'visiteur') {
          dbFresh.members[newMember.id].status = 'actif';
        }
      }
      saveDB(dbFresh);
      // Sync immédiate dans Notion Fiches_personnages
      const statutNotion = dbFresh.members[newMember.id].status === 'absent' ? 'Absent' : 'Actif';
      _syncStatutFicheNotion(newMember.id, statutNotion, { pole: poleLabel, nom: newMember.displayName || newMember.user.username }).catch(() => {});
      // Sync Registre des Membres (Nom = pseudo Discord, Personnage = nom RP)
      _syncMembreNotion(newMember.id, {
        rang: nouveauGrade,
        pole: nouveauPole,
        nom: newMember.displayName || newMember.user.username,
        username: newMember.user.username,
        status: dbFresh.members[newMember.id].status,
        lastActivity: new Date().toISOString(),
      }).catch(() => {});
      console.log(`✅ Membre ${newMember.user.username} → pôle ${poleLabel} · grade ${nouveauGrade}`);
    }, 2000);
  }
});

client.on('guildMemberRemove', async member => {
  const db = loadDB(); const m = db.members[member.id];
  await sendLog(member.guild, 'DEPART', { username: member.user.username, rang: m?.rang, duree: m ? daysSince(m.joinedAt) + ' jours' : '—' });
  if (db.members[member.id]) { db.members[member.id].status = 'parti'; db.members[member.id].leftAt = new Date().toISOString(); saveDB(db); }
  _syncMembreNotion(member.id, { status: 'parti', leftAt: new Date().toISOString() }).catch(() => {});
  await ajouterJournalIC(member.guild, { type: 'autre', titre: `Départ — ${member.user.username}`, description: `${member.user.username} a quitté la Compagnie.`, auteur: 'Système' });
});

client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  try { if (reaction.partial) await reaction.fetch(); } catch { return; }
  const db = loadDB(); const guild = reaction.message.guild; if (!guild) return;

  // ── 📜 sur une note du micro → proposer un contrat (Direction uniquement) ──
  if (reaction.emoji.name === '📜') {
    const msg = reaction.message;
    const estNote = msg.webhookId && (msg.embeds?.[0]?.title || '').includes('Rapport de terrain');
    if (!estNote) return;
    const member = await guild.members.fetch(user.id).catch(() => null);
    if (!member || !isDirection(member)) return; // réservé Direction / Confrérie
    try {
      const att = msg.channel;
      const notice = await att.send('🔎 Analyse de la note en cours…').catch(() => null);
      const texte = await _lireTexteNote(msg);
      const analyse = await _analyserNoteContrat(texte);
      if (notice) notice.delete().catch(() => {});
      if (!analyse) { const m = await att.send('⚠️ Impossible d\'analyser la note (IA indisponible ou clé manquante).'); setTimeout(() => m.delete().catch(() => {}), 15000); return; }
      if (!analyse.est_contrat) { const m = await att.send('🤔 Cette note ne ressemble pas à un contrat/mission. Aucun brouillon créé.'); setTimeout(() => m.delete().catch(() => {}), 15000); return; }
      const type = (analyse.type === 'illegal') ? 'illegal' : 'legal';
      const id = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
      _draftStore.set(id, { type, cible: analyse.cible || '?', lieu: analyse.lieu || '', motif: analyse.motif || '', contact: analyse.contact || '', userId: user.id });
      await att.send({ embeds: [_embedBrouillonContrat(_draftStore.get(id), analyse.confiance)], components: _rowsBrouillonContrat(id, type) });
    } catch (e) { console.log('❌ 📜 note→contrat:', e.message); }
    return;
  }

  if (reaction.message.id === db.reglementMsgId && reaction.emoji.name === '✅') {
    await sendLog(guild, 'REGLEMENT_VALIDE', { userId: user.id, username: user.username });
    const logsCh = await getLogsCh(guild);
      if (logsCh) {
        const _reglMentionIds = guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => r.id);
        await logsCh.send({ content: `${getMention(guild)} — **${user.username}** a validé le règlement.`, allowedMentions: { parse: [], roles: _reglMentionIds } });
      }
    return;
  }
  if (reaction.emoji.name === '✅' || reaction.emoji.name === '❌') {
    const title = reaction.message.embeds[0]?.title || ''; if (!title.includes('DOSSIER')) return;
    const isIllegal = title.includes('ILLÉGAL'); const isAccept = reaction.emoji.name === '✅';
    const nom = title.replace(/📁 \[.*?\] DOSSIER (LÉGAL|ILLÉGAL) — /, '').replace(/✅ ACCEPTÉ — /, '').trim();
    const cand = (db.candidatures || []).find(c => c.nomPerso === nom && c.status === 'reçue'); if (!cand) return;
    const reactUsers = await reaction.users.fetch(); const voteCount = reactUsers.filter(u => !u.bot).size; const VOTES_REQUIS = 2;
    if (voteCount < VOTES_REQUIS) { const msg = await reaction.message.channel.send({ content: `⏳ **${voteCount}/${VOTES_REQUIS} votes** pour ${isAccept ? 'accepter' : 'refuser'} **${cand.nomPerso}**. Il manque **${VOTES_REQUIS - voteCount} vote(s)**.` }); setTimeout(() => msg.delete().catch(() => {}), 10000); return; }
    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (isAccept) {
      if (member) {
        if (isIllegal) {
          const role = guild.roles.cache.find(r => r.name.includes('Maudit') || r.name.includes('Ombre')); if (role) await member.roles.add(role).catch(() => {});
          member.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle("🔪 Bienvenue dans l'ombre — La Confrérie").setDescription("Tu as été **accepté** au sein de la Confrérie.\n\nDiscrétion absolue.\n\n*Ne fais confiance qu'à ceux que la Direction te désignera.*\n— La Direction").setFooter({ text: 'La Confrérie • Confidentiel' })] }).catch(() => {});
          const annCh = guild.channels.cache.get(CH.DOSSIER_ILLEG); if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle("🔪 La Confrérie — Nouveau visage dans l'ombre").setDescription(`**${cand.nomPerso}** a intégré la Confrérie.\n*Certains chemins ne se montrent pas à la lumière.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` })] });
        } else {
          const role = guild.roles.cache.find(r => r.name.includes('Recrue') || r.name.includes('Employé')); if (role) await member.roles.add(role).catch(() => {});
          member.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Candidature acceptée — Iron Wolf Company').setDescription("Ta candidature a été **acceptée**.\n\nLa période d'observation commence maintenant.\n\n*Tu connais les règles. Tu connais les attentes.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Légal' })] }).catch(() => {});
          const annCh = guild.channels.cache.get(CH.DOSSIER_LEGAL); if (annCh) await annCh.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('⚖️ Nouveau membre — Iron Wolf Company').setDescription(`**${cand.nomPerso}** rejoint la Compagnie.\n*Bienvenue dans la meute.*`).setThumbnail(member.user.displayAvatarURL()).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` })] });
        }
      }
      cand.status = 'acceptee'; cand.acceptedAt = new Date().toISOString(); saveDB(db);
      await archiverCandidatureNotion(cand, 'acceptee', user.username); await ajouterMembreNotion(cand, cand.type);
      _syncCandidatureNotion(cand, 'acceptee', user.username).catch(() => {});
      notionV5.archiverThreadCandidature?.(guild, cand, 'acceptee', user.username).catch(() => {});
      await notionExtra.creerFichePersonnageNotion?.(cand); notionExtra.planifierRappelFiche?.(guild, cand);
      await sendLog(guild, 'CANDIDATURE_ACCEPTEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal', validePar: user.username });
      await ajouterJournalIC(guild, { type: 'recrutement', titre: `Nouveau membre — ${cand.nomPerso}`, description: `${cand.nomPerso} rejoint la Compagnie · Pôle : ${isIllegal ? '🔪 Illégal' : '⚖️ Légal'} · Accepté par ${user.username}`, auteur: user.username });
      try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(isIllegal ? 0x8B1A1A : 0x3B82F6).setTitle(`✅ ACCEPTÉ — ${cand.nomPerso}`)] }); } catch {}
    } else {
      cand.status = 'refusee'; cand.refusedAt = new Date().toISOString(); saveDB(db);
      _syncCandidatureNotion(cand, 'refusee', user.username).catch(() => {});
      await archiverCandidatureNotion(cand, 'refusee', user.username);
      notionV5.archiverThreadCandidature?.(guild, cand, 'refusee', user.username).catch(() => {});
      await sendLog(guild, 'CANDIDATURE_REFUSEE', { userId: cand.userId, nomPerso: cand.nomPerso, type: isIllegal ? '🔪 Illégal' : '⚖️ Légal' });
      if (member) { const embedRefus = isIllegal ? new EmbedBuilder().setColor(0x555555).setTitle('La Confrérie').setDescription("Ta demande n'a pas été retenue.\n\n*On ne donne pas d'explication.*\n— La Direction").setFooter({ text: 'La Confrérie • Confidentiel' }) : new EmbedBuilder().setColor(0xED4245).setTitle('Iron Wolf Company').setDescription("Ta candidature n'a pas été retenue.\n\n*La Direction se réserve le droit de refuser sans justification.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Légal' }); member.send({ embeds: [embedRefus] }).catch(() => {}); }
      try { await reaction.message.edit({ embeds: [EmbedBuilder.from(reaction.message.embeds[0]).setColor(0xED4245).setTitle(`❌ REFUSÉ — ${cand.nomPerso}`)] }); } catch {}
    }
  }
});

// ── Crée un RDV dans l'agenda Notion (réutilisable, ex: RDV client accepté) ──
async function archiverRdvNotion(titre, dateSouhait, lieu, notes, isIlleg, lieuNotionKey) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_AGENDA_DB_ID) return;
  // Tenter de convertir une date JJ/MM ou JJ/MM/AAAA en ISO, sinon aujourd'hui
  let dateISO = new Date().toISOString();
  const m = (dateSouhait || '').match(/(\d{1,2})[\/\-](\d{1,2})(?:[\/\-](\d{2,4}))?/);
  if (m) {
    const jour = m[1].padStart(2, '0');
    const mois = m[2].padStart(2, '0');
    let annee = m[3] || String(new Date().getFullYear());
    if (annee.length === 2) annee = '20' + annee;
    dateISO = `${annee}-${mois}-${jour}T12:00:00.000Z`;
  }
  const RDV_VILLE = (typeof RDV_VILLE_NOTION_MAP !== 'undefined') ? RDV_VILLE_NOTION_MAP : {};
  try {
    const res = await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: {
        'Titre':  { title: [{ text: { content: titre.slice(0, 100) } }] },
        'Date':   { date: { start: dateISO } },
        'Lieu':   { rich_text: [{ text: { content: ((lieu ? lieu + '\n' : '') + (notes || '')).slice(0, 2000) } }] },
        'Statut': { select: { name: 'Planifié' } },
        'Type':   { select: { name: '🤝 Rendez-vous Client' } },
        'Pôle':   { select: { name: isIlleg ? '🔒 Illégal' : '⚖️ Légal' } },
        ...(lieuNotionKey && RDV_VILLE[lieuNotionKey] ? { 'Villes RDR2': { select: { name: RDV_VILLE[lieuNotionKey] } } } : {}),
      } }),
    });
    if (res.ok) console.log(`✅ RDV client archivé Notion : ${titre}`);
    else { const d = await res.json().catch(() => ({})); console.log('❌ RDV client Notion:', (d.message || '').slice(0, 200)); }
  } catch (e) { console.log('❌ RDV client Notion error:', e.message); }
}

// ── Briefing renseignement quotidien (synthèse IA de la journée) ──
async function postBriefingRenseignement(guild) {
  if (!process.env.ANTHROPIC_API_KEY) return;
  const db = loadDB();
  const notes = db.notesTerrain || [];
  // Notes des dernières 24h
  const depuis = Date.now() - 24 * 60 * 60 * 1000;
  const dujour = notes.filter(n => new Date(n.date).getTime() >= depuis);
  if (dujour.length === 0) return; // rien à rapporter

  const corpus = dujour.map(n => {
    const h = new Date(n.date).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
    return `[${h}] (${n.agent}${n.lieu ? ', ' + n.lieu : ''}) ${(n.info || '').replace(/\*\*/g, '').replace(/▸/g, '').replace(/🔑.*/s, '').trim()}`;
  }).join('\n');

  let synthese = '';
  try {
    const prompt = `Tu es l'officier de renseignement en chef de la compagnie Iron Wolf (western RP, 1895).
Voici toutes les notes de terrain des dernières 24h :

${corpus}

Rédige le BRIEFING QUOTIDIEN de renseignement. Texte simple, structuré et concis :
- Résumé de la journée (1-2 phrases)
- Événements clés (les plus importants)
- Personnes à surveiller
- Menaces / points d'attention
Base-toi UNIQUEMENT sur les notes. Maximum 300 mots.`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 800, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await resp.json();
    synthese = data?.content?.[0]?.text || '';
  } catch (e) { console.log('❌ Briefing IA:', e.message); return; }
  if (!synthese) return;

  const embed = new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle('📰 BRIEFING QUOTIDIEN — Renseignement')
    .setDescription(synthese.slice(0, 4000))
    .setFooter({ text: `IWC · ${dujour.length} note(s) sur 24h · ${fmtShort(new Date())}` })
    .setTimestamp();

  // Poster dans le salon notes vocales (ou #informateurs en secours)
  const ch = guild.channels.cache.get('1511491314351472701') || guild.channels.cache.get(SALON_HARDCODED.INFORMATEURS);
  if (ch) await ch.send({ embeds: [embed] }).catch(() => {});
}

// ── Génère un rapport structuré via Claude (si clé API présente) ──
async function genererRapportIA(transcription, agent, lieu) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null; // pas de clé -> on garde la mise en forme classique
  try {
    const prompt = `Tu es un officier de renseignement de la compagnie Iron Wolf (univers western RP, 1895).
On te donne une transcription d'écoute de terrain. Chaque ligne (🗨️ ou 💬) est une intervention distincte, possiblement d'une personne différente.
Transforme-la en RAPPORT DE TERRAIN clair, concis et bien structuré.

Transcription : "${transcription}"

Réponds UNIQUEMENT en JSON valide, sans markdown, ce format exact :
{"resume":"1 phrase qui résume l'essentiel","details":"les faits reformulés proprement et brièvement en français correct. Si plusieurs personnes parlent, structure par tirets courts (- ...). Reste factuel et synthétique.","personnes":["noms cités"],"lieu":"lieu si mentionné sinon vide","categories":["mots parmi: Armes, Violence, Trafic, Alliance, Argent, Bétail, Loi, Danger"],"menace":"un seul mot parmi: faible, moyen, eleve"}
Si la transcription est incompréhensible ou vide, mets resume="(inaudible)".`;

    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 500,
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    // Lire la réponse en texte d'abord pour diagnostiquer les erreurs
    const brut = await resp.text();
    if (!resp.ok) {
      let raison = brut.slice(0, 300);
      try { const e = JSON.parse(brut); raison = e.error?.message || raison; } catch {}
      if (resp.status === 401) console.log('⚠️ Rapport IA : clé API invalide (401).');
      else if (resp.status === 400 && /credit|balance|quota/i.test(raison)) console.log('⚠️ Rapport IA : crédit Anthropic épuisé. Recharge le compte.');
      else if (resp.status === 429) console.log('⚠️ Rapport IA : trop de requêtes (429), réessaie plus tard.');
      else console.log(`⚠️ Rapport IA : erreur API ${resp.status} — ${raison}`);
      return null;
    }
    let data;
    try { data = JSON.parse(brut); } catch { console.log('⚠️ Rapport IA : réponse API illisible.'); return null; }
    const txt = data?.content?.[0]?.text || '';
    if (!txt) { console.log('⚠️ Rapport IA : réponse vide de l\'API.'); return null; }
    const clean = txt.replace(/```json|```/g, '').trim();
    try { return JSON.parse(clean); }
    catch { console.log('⚠️ Rapport IA : le JSON renvoyé par l\'IA est mal formé, on garde le format classique.'); return null; }
  } catch (e) {
    console.log('⚠️ Rapport IA échec:', e.message);
    return null;
  }
}

client.on('messageCreate', async message => {
  // Conversations sur télégrammes : relais MP ↔ fil (avant tout le reste)
  try { if (await telegramme.onMessage?.(message)) return; } catch {}
  try { if (await inventaire.onMessage?.(message)) return; } catch {}
  try { if (await traque.onMessage?.(message)) return; } catch {}
  try { if (await tenue.onMessage?.(message)) return; } catch {}
  // ── Note du micro de terrain → réaction 📜 (contrat) + RÉSUMÉ automatique ──
  if (message.webhookId && (message.embeds?.[0]?.title || '').includes('Rapport de terrain')) {
    try { await message.react('📜'); } catch (e) { console.log('⚠️ Réaction note:', e.message); }
    // ── Longue scène (fichier .txt joint) → conversation COMPLÈTE dans un FIL sous le rapport ──
    // Le salon reste propre : seul le rapport y apparaît, le détail est dans le fil (lisible sans télécharger).
    (async () => {
      try {
        const aFichier = message.attachments?.some?.(a => (a.name || '').toLowerCase().endsWith('.txt'));
        if (!aFichier) return; // scène courte : tout est déjà affiché dans le rapport, pas besoin de fil
        const texteComplet = await _lireTexteNote(message);
        if (!texteComplet || texteComplet.length < 50) return;
        // On retire l'en-tête technique du fichier (jusqu'à la ligne de ===) pour ne garder que la conversation
        const sep = '='.repeat(50);
        let corps = texteComplet;
        const iSep = texteComplet.indexOf(sep);
        if (iSep !== -1) corps = texteComplet.slice(iSep + sep.length).replace(/^\s+/, '');
        if (!corps) corps = texteComplet;
        const agent = message.embeds?.[0]?.author?.name || 'Agent';
        let fil;
        try { fil = await message.startThread({ name: `📜 Transcription — ${agent}`.slice(0, 100), autoArchiveDuration: 1440 }); }
        catch (e) { console.log('⚠️ Création du fil de transcription:', e.message); return; }
        if (!fil) return;
        const blocs = corps.match(/[\s\S]{1,1850}/g) || [];
        for (let i = 0; i < blocs.length; i++) await fil.send({ content: blocs[i] }).catch(() => {});
      } catch (e) { console.log('❌ Fil transcription:', e.message); }
    })();
    // Résumé automatique en arrière-plan (pour ne pas avoir à tout lire)
    (async () => {
      try {
        const texte = await _lireTexteNote(message);
        if ((texte || '').length < 250) return; // trop court → pas besoin de résumer
        const resume = await _resumerNote(texte);
        if (!resume) return;
        const agent = message.embeds?.[0]?.author?.name || 'Agent';
        const emb = new EmbedBuilder()
          .setColor(0xC9A227)
          .setTitle('📋 Résumé de la note')
          .setDescription(resume.slice(0, 4000))
          .setFooter({ text: `${agent} • résumé automatique` });
        await message.reply({ embeds: [emb], allowedMentions: { repliedUser: false } }).catch(() => {});
      } catch (e) { console.log('❌ Auto-résumé:', e.message); }
    })();
    // on continue (pas de return)
  }

  // ── Salon d'alerte : tout message → ping tout le monde SAUF Thomas Galagan ──
  if (message.guild && !message.author.bot && message.channel.id === '1512913726494216222') {
    try {
      const THOMAS_ID = '982201491773354035'; // Thomas Galagan — exclu
      const membres = await message.guild.members.fetch().catch(() => null);
      if (membres) {
        const aPinger = [...membres.values()]
          .filter(m => !m.user.bot && m.id !== THOMAS_ID && m.id !== message.author.id)
          .map(m => m.id);
        if (aPinger.length) {
          // Discord limite les mentions ; on découpe en paquets pour ne perdre personne
          const mentionsTxt = aPinger.map(id => `<@${id}>`).join(' ');
          await message.reply({
            content: `🔔 **Nouveau message à traiter** (posté par <@${message.author.id}>)\n${mentionsTxt}`,
            allowedMentions: { parse: [], users: aPinger.slice(0, 100), repliedUser: false },
          }).catch(() => {});
        }
      }
    } catch (e) { console.log('❌ Alerte salon error:', e.message); }
    return;
  }

  // ── Réponses des clients en MP → réacheminées dans le salon des demandes ──
  if (!message.guild && !message.author.bot) {
    try {
      const db = loadDB();
      // Chercher si cet utilisateur a une demande de RDV en cours
      const rdvs = (db.rdvClients || []).filter(r => r.demandeurId === message.author.id);
      if (rdvs.length > 0) {
        const rdv = rdvs[rdvs.length - 1]; // la plus récente
        const salonDemandes = client.channels.cache.get('1512175624176009348');
        if (salonDemandes) {
          const operateur = salonDemandes.guild.roles.cache.find(r => r.name.includes('Opérateur') || r.name.includes('Operateur'));
          const ping = operateur ? `<@&${operateur.id}>` : '';
          const mentionIds = operateur ? [operateur.id] : [];
          const embed = new EmbedBuilder()
            .setColor(0x5865F2)
            .setAuthor({ name: `💬 Réponse de ${rdv.nom}` })
            .setDescription(message.content.slice(0, 2000))
            .addFields(
              { name: '📋 Demande concernée', value: rdv.objet, inline: true },
              { name: '🔖 Réf.', value: rdv.id, inline: true },
            )
            .setFooter({ text: `Client : ${message.author.tag} · Réponds avec « 💬 Répondre au client »` })
            .setTimestamp();
          await salonDemandes.send({
            content: `${ping ? ping + ' — ' : ''}📨 **Un client a répondu**`,
            embeds: [embed],
            allowedMentions: { roles: mentionIds },
          }).catch(() => {});
          // Accusé de réception au client
          await message.react('✅').catch(() => {});
        }
      }
    } catch (e) { console.log('❌ MP client RDV:', e.message); }
    return;
  }

  // ── Traitement des notes vocales via webhook (AVANT le filtre bot) ──
  if (message.webhookId && message.guild && message.channel.id === '1511491314351472701') {
    try {
      const raw = message.content;
      // Format attendu : 🎙️||cible||lieu||info||priorite||agent
      if (raw.startsWith('🎙️||')) {
        const parts = raw.replace('🎙️||', '').split('||');
        let cible   = (parts[0] || '').trim();
        let lieu    = (parts[1] || '').trim();
        const info  = (parts[2] || '').trim();
        let priorite = (parts[3] || 'normale').trim();
        const agent = (parts[4] || 'Agent inconnu').trim();

        // ── Détection automatique des tags par mots-clés ──
        const TAGS = {
          '🔫 Armes':       ['arme', 'fusil', 'pistolet', 'revolver', 'munition', 'gatling', 'carabine', 'dynamite'],
          '🩸 Violence':    ['meurtre', 'tué', 'tuer', 'mort', 'bagarre', 'agression', 'tabassé', 'sang', 'cadavre', 'assassin'],
          '🥃 Trafic':      ['alcool', 'whisky', 'contrebande', 'trafic', 'moonshine', 'drogue', 'opium'],
          '🤝 Alliance':    ['alliance', 'accord', 'pacte', 'collaboration', 'deal', 'négociation', 'allié'],
          '💰 Argent':      ['argent', 'dollars', 'rançon', 'braquage', 'banque', "l'or", ' or ', 'magot', 'butin'],
          '🐎 Bétail':      ['cheval', 'chevaux', 'bétail', 'vache', 'ranch', 'troupeau'],
          '👮 Loi':         ['shérif', 'sherif', 'marshal', 'prison', 'arrestation', 'mandat', 'agent de loi'],
          '🕴️ Suspect':    ['suspect', 'louche', 'méfiant', 'caché', 'espionne', 'surveille'],
        };
        const infoLower = ' ' + info.toLowerCase() + ' ';
        const tagsDetectes = [];
        for (const [tag, mots] of Object.entries(TAGS)) {
          if (mots.some(m => infoLower.includes(m))) tagsDetectes.push(tag);
        }

        // ── Priorité auto si mots urgents détectés ──
        if (/urgent|vite|danger|attaque|maintenant|imm[ée]diat/i.test(info)) priorite = 'urgente';
        else if (tagsDetectes.includes('🩸 Violence') || tagsDetectes.includes('🔫 Armes')) {
          if (priorite === 'normale') priorite = 'importante';
        }

        const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
        const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
        const colors = { normale: 0x8B5A2A, importante: 0xFFA500, urgente: 0xED4245 };

        // ── Tenter un rapport IA structuré (transcription brute = info sans le balisage) ──
        const transcriptionBrute = info.replace(/\*\*/g, '').replace(/▸/g, '').replace(/🔑.*/s, '').trim();
        const rapport = await genererRapportIA(transcriptionBrute, agent, lieu);

        let embed;
        if (rapport && rapport.resume && rapport.resume !== '(inaudible)') {
          // Catégories IA -> emojis
          const catEmoji = { Armes: '🔫 Armes', Violence: '🩸 Violence', Trafic: '🥃 Trafic', Alliance: '🤝 Alliance', Argent: '💰 Argent', 'Bétail': '🐎 Bétail', Loi: '👮 Loi', Danger: '🔥 Danger' };
          const catsR = (rapport.categories || []).map(c => catEmoji[c] || c);
          const lieuFinal = rapport.lieu || lieu;
          // Niveau de menace -> priorité + couleur
          const menace = (rapport.menace || '').toLowerCase();
          const menaceAffiche = { faible: '🟢 Faible', moyen: '🟡 Moyen', eleve: '🔴 Élevé' }[menace] || '';
          if (menace === 'eleve') priorite = 'urgente';
          else if (menace === 'moyen' && priorite === 'normale') priorite = 'importante';
          else if (catsR.includes('🩸 Violence') || catsR.includes('🔫 Armes') || catsR.includes('🔥 Danger')) {
            if (priorite === 'normale') priorite = 'importante';
          }
          embed = new EmbedBuilder()
            .setColor(colors[priorite] || colors.normale)
            .setTitle('📋 RAPPORT DE TERRAIN')
            .setAuthor({ name: `🕵️ ${agent} · ${heure} · ${dateStr}` })
            .setDescription(`*${rapport.resume}*`)
            .addFields(
              { name: '📝 Résumé des faits', value: (rapport.details || transcriptionBrute).slice(0, 1000) },
              ...(rapport.personnes && rapport.personnes.length ? [{ name: '👤 Personnes', value: rapport.personnes.join(', '), inline: true }] : []),
              ...(lieuFinal ? [{ name: '📍 Lieu', value: lieuFinal, inline: true }] : []),
              ...(menaceAffiche ? [{ name: '⚠️ Menace', value: menaceAffiche, inline: true }] : []),
              ...(catsR.length ? [{ name: '🏷️ Catégories', value: catsR.join('  '), inline: false }] : []),
              { name: '🎙️ Transcription complète', value: ((transcriptionBrute || '—').length > 980 ? '🎙️ *Transcription intégrale postée ci-dessous ⬇️*' : ('||' + (transcriptionBrute || '—') + '||')) },
            )
            .setFooter({ text: `IWC · Renseignement · Priorité : ${priorite}` })
            .setTimestamp();
          if (rapport.lieu) lieu = rapport.lieu;
        } else {
          // Pas d'IA -> mise en forme classique soignée
          // On retire la ligne mots-clés et le gras, mais on GARDE les sauts de ligne (aération)
          let infoBrute = info.replace(/\*\*/g, '').replace(/🔑.*/s, '').trim();
          // Si le texte est un gros pavé (pas de puces/sauts), on l'aère phrase par phrase
          if (!/[🗨️💬\n]/.test(infoBrute)) {
            infoBrute = infoBrute
              .replace(/([.!?])\s+/g, '$1\n')   // un saut de ligne après chaque phrase
              .replace(/\n{2,}/g, '\n')
              .trim();
          }
          // Mini-aperçu : la 1ère phrase (ou les ~140 premiers caractères)
          const apercu = (() => {
            const phrase = infoBrute.replace(/[🗨️💬▸]/g, '').split(/[.!?\n]/)[0].trim();
            if (phrase.length >= 15 && phrase.length <= 150) return phrase + '…';
            return infoBrute.replace(/[🗨️💬▸]/g, '').slice(0, 140).trim() + (infoBrute.length > 140 ? '…' : '');
          })();
          embed = new EmbedBuilder()
            .setColor(colors[priorite] || colors.normale)
            .setTitle('📋 NOTE DE TERRAIN')
            .setAuthor({ name: `🕵️ ${agent} · ${heure} · ${dateStr}` })
            .setDescription(`*« ${apercu} »*`)
            .addFields(
              ...(cible ? [{ name: '🎯 Cible', value: cible, inline: true }] : []),
              ...(lieu  ? [{ name: '📍 Lieu',  value: lieu,  inline: true }] : []),
              ...(tagsDetectes.length ? [{ name: '🏷️ Mots-clés', value: tagsDetectes.join('  '), inline: false }] : []),
              { name: '🎙️ Transcription complète', value: ((transcriptionBrute || '—').length > 980 ? '🎙️ *Transcription intégrale postée ci-dessous ⬇️*' : ('||' + (transcriptionBrute || '—') + '||')) },
            )
            .setFooter({ text: `IWC · Renseignement de terrain · Priorité : ${priorite}` })
            .setTimestamp();
        }

        // ── Cible : priorité aux noms extraits par l'IA (plus fiable) ──
        let cibleDetectee = cible;
        if (!cibleDetectee && rapport && rapport.personnes && rapport.personnes.length) {
          // Prendre le premier nom valable (>= 3 lettres)
          const nomIA = rapport.personnes.find(p => p && p.trim().length >= 3);
          if (nomIA) cibleDetectee = nomIA.trim();
        }
        if (!cibleDetectee) {
          try {
            const norm = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '');
            const infoNorm = ' ' + norm(info) + ' ';
            // Construire la liste des noms depuis les membres du serveur
            const membres = await message.guild.members.fetch().catch(() => null);
            if (membres) {
              let meilleurNom = null;
              let meilleureLongueur = 0;
              for (const [, mem] of membres) {
                if (mem.user.bot) continue;
                const displayName = mem.displayName || mem.user.username;
                // Nettoyer le nom (enlever les grades/préfixes entre crochets ou avant un tiret)
                const nomClean = displayName.replace(/^\[[^\]]*\]\s*/, '').replace(/^[^|]*\|\s*/, '').trim();
                const nomNorm = norm(nomClean);
                if (nomNorm.length < 3) continue;
                // Vérifier le nom complet
                if (infoNorm.includes(' ' + nomNorm + ' ') && nomNorm.length > meilleureLongueur) {
                  meilleurNom = nomClean; meilleureLongueur = nomNorm.length;
                }
                // Vérifier chaque partie du nom (prénom seul, nom seul) si >= 4 lettres
                for (const partie of nomNorm.split(' ')) {
                  if (partie.length >= 4 && infoNorm.includes(' ' + partie + ' ') && partie.length > meilleureLongueur) {
                    meilleurNom = nomClean; meilleureLongueur = partie.length;
                  }
                }
              }
              if (meilleurNom) cibleDetectee = meilleurNom;
            }
          } catch(e) { console.log('⚠️ Détection nom:', e.message); }
        }

        // ── Détection de doublon : note très similaire dans les 10 dernières minutes ? ──
        let estDoublon = false;
        try {
          const dbDup = loadDB();
          const recent = (dbDup.notesTerrain || []).filter(n => Date.now() - new Date(n.date).getTime() < 10 * 60 * 1000);
          const normTxt = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter(w => w.length > 3);
          const motsNouveau = new Set(normTxt(info));
          for (const n of recent) {
            if (n.agent === agent) continue; // un même agent peut répéter, on cible les doublons inter-agents
            const motsAncien = normTxt(n.info);
            if (motsAncien.length === 0) continue;
            const communs = motsAncien.filter(w => motsNouveau.has(w)).length;
            const ratio = communs / Math.max(motsAncien.length, motsNouveau.size);
            if (ratio > 0.6) { estDoublon = true; break; } // >60% de mots communs = doublon probable
          }
        } catch {}

        if (estDoublon) {
          // Ajouter une mention discrète plutôt qu'un nouveau rapport complet
          embed.setFooter({ text: `IWC · Renseignement · Priorité : ${priorite} · ⚠️ Recoupe une info déjà signalée` });
        }

        // ── Poster dans un fil si une cible est detectee, sinon dans le salon ──
        let destNote = message.channel;
        if (cibleDetectee) {
          // Ajouter la cible à l'embed si pas deja presente
          if (!cible) {
            embed.spliceFields(0, 0, { name: '🎯 Cible détectée', value: cibleDetectee, inline: true });
          }
          const ch = message.channel;
          const threadName = `🎯 ${cibleDetectee}`.slice(0, 100);
          let thread = null;
          try {
            const active = await ch.threads.fetchActive().catch(() => null);
            if (active) thread = active.threads.find(t => t.name === threadName);
          } catch {}
          if (!thread) {
            try {
              const archived = await ch.threads.fetchArchived().catch(() => null);
              if (archived) thread = archived.threads.find(t => t.name === threadName);
            } catch {}
          }
          if (!thread) {
            try {
              thread = await ch.threads.create({ name: threadName, autoArchiveDuration: 10080, reason: `Dossier : ${cibleDetectee}` });
            } catch { thread = ch; }
          } else if (thread.archived) {
            await thread.setArchived(false).catch(() => {});
          }
          destNote = thread;
        }
        await destNote.send({ embeds: [embed] });
        // ── Transcription COMPLÈTE sans coupure (un champ Discord est limité à 1024 caractères) ──
        // Au-delà de ~980 caractères, on poste l'intégralité en messages complémentaires (spoiler), par blocs de 1850.
        const _txtComplet = (transcriptionBrute || '').trim();
        if (_txtComplet.length > 980) {
          const blocs = _txtComplet.match(/[\s\S]{1,1850}/g) || [];
          for (let i = 0; i < blocs.length; i++) {
            const entete = i === 0 ? `🎙️ **Transcription complète (intégrale — ${blocs.length} partie${blocs.length > 1 ? 's' : ''}) :**\n` : '';
            await destNote.send({ content: entete + '||' + blocs[i] + '||' }).catch(() => {});
          }
        }

        // ── Stockage local de la note (pour /notes) ──
        try {
          const db = loadDB();
          if (!db.notesTerrain) db.notesTerrain = [];
          db.notesTerrain.push({
            agent, lieu, info, priorite,
            cible: cibleDetectee || '',
            tags: tagsDetectes,
            date: new Date().toISOString(),
          });
          // Garder les 200 dernières
          if (db.notesTerrain.length > 200) db.notesTerrain = db.notesTerrain.slice(-200);
          saveDB(db);
        } catch(e) { console.log('❌ Stockage note:', e.message); }

        // ── Synthèse Notion (si base configurée) ──
        if (process.env.NOTION_RENSEIGNEMENTS_DB) {
          try {
            const catsTexte = (rapport && rapport.categories ? rapport.categories : tagsDetectes).join(', ');
            const resumeTexte = (rapport && rapport.resume) ? rapport.resume : info.slice(0, 200);
            const detailsTexte = (rapport && rapport.details) ? rapport.details : info;
            await _notionCreate(process.env.NOTION_RENSEIGNEMENTS_DB, {
              'Titre':    { title: [{ text: { content: (resumeTexte || 'Note de terrain').slice(0, 100) } }] },
              'Agent':    { rich_text: [{ text: { content: agent } }] },
              'Cible':    { rich_text: [{ text: { content: cibleDetectee || '—' } }] },
              'Lieu':     { rich_text: [{ text: { content: lieu || '—' } }] },
              'Détails':  { rich_text: [{ text: { content: (detailsTexte || '—').slice(0, 1900) } }] },
              'Catégories': { rich_text: [{ text: { content: catsTexte || '—' } }] },
              'Priorité': { select: { name: priorite } },
              'Date':     { date: { start: new Date().toISOString() } },
            });
            console.log('✅ Renseignement synchronisé sur Notion');
          } catch(e) { console.log('❌ Sync Notion renseignement:', e.message); }
        }

        console.log(`✅ Note vocale postée par ${agent} ${tagsDetectes.length ? '[' + tagsDetectes.join(',') + ']' : ''}`);
        await message.delete().catch(() => {});
      }
    } catch(e) { console.log('❌ Webhook note error:', e.message); }
    return;
  }

  if (message.author.bot || !message.guild) return;
  const absenceHandled = await notionV3.handleAbsenceDetection?.(message);
  if (absenceHandled) return;
  const db = loadDB(); const guild = message.guild;
  if (db.members[message.author.id]) {
    const wasAbsent = db.members[message.author.id].status === 'absent'; const wasInactif = db.members[message.author.id].status === 'inactif';
    db.members[message.author.id].lastActivity = new Date().toISOString();
    if (wasAbsent || wasInactif) {
      db.members[message.author.id].status = 'actif';
      _syncMembreNotion(message.author.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
      // [CORRECTION] Débloquer écriture si absent
      if (wasAbsent) {
        const membreRetourMsg = await guild.members.fetch(message.author.id).catch(() => null);
        if (membreRetourMsg) {
          const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
          if (roleAbsent) await membreRetourMsg.roles.remove(roleAbsent).catch(() => {});
          await _debloquerEcritureAbsent(guild, membreRetourMsg);
        }
      }
      const absCh2 = getAbsencesCh(guild, message.member);
      if (absCh2 && wasAbsent) {
        const mData = db.members[message.author.id];
        absCh2.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
          .setAuthor({ name: `${message.member?.displayName || message.author.username} — Retour`, iconURL: message.author.displayAvatarURL() })
          .setTitle('✅ Retour d\'absence')
          .addFields({ name: '👤 Membre', value: `<@${message.author.id}>`, inline: true }, { name: '🎖️ Grade', value: mData?.rang || '—', inline: true }, { name: '📅 Retour', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true })
          .setFooter({ text: 'IWC • Retour automatique détecté' }).setTimestamp()] }).catch(() => {});
      }
      await notionExtra.majStatutActiviteNotion?.(message.author.id, 'actif');
      if (wasInactif) { const logsCh = await getLogsCh(guild); if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Retour activité — ${message.author.username}`).setDescription(`**${message.author.username}** est de retour après une période d'inactivité.`).addFields({ name: '📅 Date retour', value: fmtShort(new Date()), inline: true }).setFooter({ text: 'IWC • Activité automatique' })] }).catch(() => {}); }
    }
    saveDB(db);
  }

  // Détecter si le message est dans l'un des deux salons absences
  const _absLegal = guild.channels.cache.get(SALON_HARDCODED.ABSENCES_LEGAL);
  const _absIlleg = guild.channels.cache.get(SALON_HARDCODED.ABSENCES_ILLEGAL);
  const _isInAbsSalon = (message.channel.id === _absLegal?.id || message.channel.id === _absIlleg?.id);
  if (_isInAbsSalon) {
    if (db.members[message.author.id]) { db.members[message.author.id].status = 'absent'; saveDB(db); await message.react('✅'); await notionExtra.majStatutActiviteNotion?.(message.author.id, 'absent'); }
    await notionV3.syncAbsenceNotion?.(message.author.id, 'absent').catch(() => {});
    await notionV4.posterAbsencePropre?.(guild, message.member, message.content, `#${message.channel.name}`).catch(() => {});
    await sendLog(guild, 'ABSENCE', { userId: message.author.id, username: message.author.username }); return;
  }

  // #informateurs avec ID hardcodé
  const infosCh = guild.channels.cache.get(SALON_HARDCODED.INFORMATEURS) || getChById(guild, 'INFORMATEURS', 'informateurs');
  if (infosCh && message.channel.id === infosCh.id) { await notionV3.handleInformateurMessage?.(message); return; }

  const ficheCh = getChById(guild, 'FICHES_PERSONNAGES', 'fiches-personnages', 'fiches-perso', 'fiches');
  if (ficheCh && message.channel.id === ficheCh.id) { await notionModules.handleFichePersonnage?.(message); return; }

  const suggCh = getChById(guild, 'SUGGESTION_IDEE', 'suggestion-idee', 'suggestions', 'suggestion');
  if (suggCh && message.channel.id === suggCh.id) { await message.react('✅').catch(() => {}); await message.react('❌').catch(() => {}); return; }

  const clipCh = getChById(guild, 'CLIPS_TEMPS_FORT', 'clips-temps-fort', 'clips-highlights', 'clips');
  if (clipCh && message.channel.id === clipCh.id && message.attachments.size > 0) { await message.react('🔥').catch(() => {}); await message.react('❤️').catch(() => {}); return; }

  const coffreIllegCh = guild.channels.cache.get(SALON_HARDCODED.COFFRE_ILLEGAL) || getChExact(guild, 'coffre-illegal');
  if (coffreIllegCh && message.channel.id === coffreIllegCh.id) {
    const up = message.content.toUpperCase();
    if (up.includes('TYPE') && up.includes('MONTANT')) {
      const lines = message.content.split('\n');
      const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() : ''; };
      const type = get('TYPE').toLowerCase().includes('sort') ? 'Sortie' : 'Entrée';
      const montant = (() => { const n = parseInt((get('MONTANT') || '').replace(/[^0-9]/g, ''), 10); return isNaN(n) ? 0 : n; })();
      const objet = get('OBJET') || '—'; const responsable = get('RESPONSABLE') || message.author.username;
      const dbFresh = loadDB(); if (!dbFresh.coffres) dbFresh.coffres = { legal: 0, illegal: 0 };
      dbFresh.coffres.illegal += (type === 'Sortie' ? -montant : montant);
      const solde = dbFresh.coffres.illegal; saveDB(dbFresh);
      // Sync Notion DB transactions
      await notionExtra.enregistrerTransactionNotion?.({ type, coffre: '🔒 Illégal', montant, objet, responsable, solde });
      _syncTransactionNotion({ type, coffre: 'illegal', montant, objet, responsable, solde, date: new Date().toISOString(), discordId: message.author.id, userId: message.author.id }).catch(() => {});
      await ajouterJournalIC(guild, { type: 'tresorerie', emoji: type === 'Entrée' ? '💵' : '💸', titre: `${type} — Coffre Illégal`, description: `**${objet}** · $${montant.toLocaleString('fr-FR')} · par ${responsable}`, auteur: responsable });
      await message.react('✅').catch(() => {});
      const isEntree = type === 'Entrée';
      await message.channel.send({ embeds: [new EmbedBuilder().setColor(isEntree ? 0x57F287 : 0xED4245).setAuthor({ name: '🔒 La Confrérie • Trésorerie Illégale' }).setTitle(`${isEntree ? '📈 ENTRÉE' : '📉 SORTIE'} — $${montant.toLocaleString('fr-FR')}`).addFields({ name: '📋 Objet', value: objet, inline: true }, { name: '👤 Responsable', value: responsable, inline: true }, { name: '\u200b', value: '\u200b', inline: true }, { name: `${isEntree ? '📥' : '📤'} Mouvement`, value: `**${isEntree ? '+' : '-'}$${montant.toLocaleString('fr-FR')}**`, inline: true }, { name: '💰 Solde illégal', value: `**$${solde.toLocaleString('fr-FR')}**`, inline: true }, { name: '\u200b', value: '\u200b', inline: true }).setFooter({ text: `La Confrérie • ${fmtShort(new Date())}` }).setTimestamp()] });
    }
    return;
  }

  const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
  if (opsCh && !message.author.bot && message.channel.id === opsCh.id && isDirection(message.member)) {
    if (message.content.toUpperCase().includes('OPÉRATION') || message.content.toUpperCase().includes('OPERATION')) {
      const lines = message.content.split('\n'); const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase())); return l ? l.split(':').slice(1).join(':').trim() || '—' : '—'; };
      const poleRaw = get('PÔLE') !== '—' ? get('PÔLE') : get('POLE'); const pole = poleRaw.toLowerCase().includes('lég') || poleRaw.toLowerCase().includes('leg') ? 'legal' : 'illegal';
      const op = { id: Date.now().toString(), name: get('NOM'), lieu: get('LIEU'), objectif: get('OBJECTIF'), equipe: get('ÉQUIPE') || get('EQUIPE'), pole, participants: [], status: 'preparation', createdAt: new Date().toISOString() };
      db.operations.push(op); op.notionPageId = await notionExtra.creerOperationNotion?.(op); saveDB(db);
      await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' });
      await ajouterJournalIC(guild, { type: 'operation', titre: `Nouvelle opération — ${op.name}`, description: `📍 ${op.lieu} · Objectif : ${op.objectif} · Pôle : ${pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`, auteur: message.author.username });
      const embed = new EmbedBuilder().setColor(0xFFA500).setTitle(`🎯 OPÉRATION — ${op.name}`).addFields({ name: 'Statut', value: '🟡 En préparation', inline: true }, { name: 'Pôle', value: pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal', inline: true }, { name: 'Lieu', value: op.lieu, inline: true }, { name: 'Objectif', value: op.objectif }, { name: 'Équipe', value: op.equipe }, { name: '👥 Participants (0)', value: '*Personne pour l\'instant. Clique « ✋ Je participe » ci-dessous.*' }).setFooter({ text: `ID: ${op.id} • ${fmtShort(new Date())}` });
      const rowP = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary), new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary));
      const rowG = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary), new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger));
      const rowModif2 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_modifier_${op.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary));
      const _ridOp1 = _poleRoleId(guild, pole);
      await opsCh.send({ content: `${_ridOp1 ? `<@&${_ridOp1}> ` : ''}— 🎯 Nouvelle opération **${op.name}**. Inscrivez-vous via « ✋ Je participe ».`, embeds: [embed], components: [rowP, rowG, rowModif2], allowedMentions: { parse: [], roles: _ridOp1 ? [_ridOp1] : [] } });
      await message.react('✅');
    }
    return;
  }

  const planCh = getChById(guild, 'PLANNING', 'planning');
  if (planCh && message.channel.id === planCh.id) { if (message.attachments.size > 0) await notionV3.handlePlanningScreenshot?.(message); return; }

  // #plans avec ID hardcodé
  const plansTactCh = guild.channels.cache.get(SALON_HARDCODED.PLANS);
  if (plansTactCh && message.channel.id === plansTactCh.id) { await _archiverPlanNotion(message); return; }
});

// ── Archive une photo de lieu RDR2 dans Notion (salon #plans) — fiabilisé ──
async function _archiverPlanNotion(message) {
  if (message.author.bot || !message.guild) return false;
  const images = message.attachments.filter(a => a.contentType?.startsWith('image/') || /\.(png|jpg|jpeg|gif|webp)$/i.test(a.url));
  if (!images.size) return false;
  const lieu = message.content.trim() || 'Lieu non précisé';
  const DB = process.env.NOTION_PLANS_DB || process.env.NOTION_AGENDA_DB_ID || null;

  let notionOK = false;
  let raison = '';

  if (!process.env.NOTION_TOKEN) raison = 'NOTION_TOKEN manquant';
  else if (!DB) raison = 'NOTION_PLANS_DB (ou NOTION_AGENDA_DB_ID) manquant dans Render';
  else {
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    for (const [, att] of images) {
      try {
        const propsComplet = {
          'Titre':     { title:     [{ text: { content: `Plan — ${lieu}`.slice(0, 100) } }] },
          'Lieu':      { rich_text: [{ text: { content: lieu.slice(0, 1900) } }] },
          'Date':      { date:      { start: new Date().toISOString().split('T')[0] } },
          'Auteur':    { rich_text: [{ text: { content: message.author.username } }] },
          'Type':      { select:    { name: '🗺️ Plan tactique' } },
          'URL Image': { url: att.url },
        };
        const children = [
          { object: 'block', type: 'image', image: { type: 'external', external: { url: att.url } } },
          { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `📸 ${lieu} — ${fmtShort(new Date())} · ${message.author.username}`, link: { url: att.url } } }] } },
        ];
        let res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: propsComplet, children }) });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          console.log(`⚠️ Plan Notion: écriture complète refusée (${res.status}) : ${(err.message || '').slice(0, 200)}`);
          // Retry minimal : juste Titre + image dans la page
          res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: { 'Titre': { title: [{ text: { content: `Plan — ${lieu}`.slice(0, 100) } }] } }, children: [{ object: 'block', type: 'image', image: { type: 'external', external: { url: att.url } } }] }) });
          if (res.ok) { notionOK = true; console.log(`✅ Plan "${lieu}" écrit en mode minimal (vérifie les noms de colonnes).`); }
          else { const e2 = await res.json().catch(() => ({})); raison = `${res.status} — ${(e2.message || '').slice(0, 150)}`; console.log(`❌ Plan Notion échec total : ${raison}`); }
        } else { notionOK = true; console.log(`✅ Plan archivé Notion : ${lieu}`); }
      } catch (e) { raison = e.message; console.log('❌ Plan Notion error:', e.message); }
    }
  }

  await message.react(notionOK ? '🗺️' : '⚠️').catch(() => {});
  const reply = await message.reply({
    embeds: [new EmbedBuilder()
      .setColor(notionOK ? 0x5865F2 : 0xFFA500)
      .setTitle(`🗺️ Plan — ${lieu}`)
      .addFields(
        { name: '📍 Lieu', value: lieu, inline: true },
        { name: '👤 Par', value: message.author.username, inline: true },
        { name: '📅 Date', value: fmtShort(new Date()), inline: true },
        { name: '📓 Notion', value: notionOK ? '✅ Archivé' : `⚠️ ${raison || 'voir logs'}`, inline: true },
      )
      .setDescription(`${images.size} image(s) — repérage de terrain.`)
      .setFooter({ text: 'IWC • Plans tactiques' })],
    allowedMentions: { repliedUser: false },
  }).catch(() => null);
  if (reply) setTimeout(() => reply.delete().catch(() => {}), 15000);
  return true;
}

// ── Auto-fermeture des menus éphémères (anti-encombrement) ──
// Second écouteur indépendant : ne touche PAS au routage ci-dessous, ne supprime QUE des messages éphémères (jamais du public).
// Logique : un message TERMINÉ (sans boutons : confirmation, résultat) se ferme vite ; un menu ENCORE OUVERT (avec boutons) reste, puis filet de sécurité.
const _ephCleanup = new Map(); // userId -> { timer }
const EPH_DONE_MS = 15 * 1000;     // résultat/confirmation sans boutons => fermeture rapide
const EPH_MENU_MS = 3 * 60 * 1000; // menu avec boutons encore ouvert => filet de sécurité
function _estEphemere(it) {
  try { if (it.ephemeral === true) return true; } catch {}
  try { if (it.message?.flags?.has?.(MessageFlags.Ephemeral)) return true; } catch {}
  return false;
}
function _planEphClose(interaction, delay, finalPass) {
  const uid = interaction.user.id;
  const prev = _ephCleanup.get(uid);
  if (prev?.timer) clearTimeout(prev.timer); // remise à zéro à chaque action => jamais en plein flux
  const timer = setTimeout(async () => {
    _ephCleanup.delete(uid);
    try {
      if (!_estEphemere(interaction)) return;
      const msg = await interaction.fetchReply().catch(() => null);
      if (!msg) return;
      const aDesBoutons = Array.isArray(msg.components) && msg.components.length > 0;
      if (finalPass || !aDesBoutons) await interaction.deleteReply().catch(() => {}); // terminé => on ferme
      else _planEphClose(interaction, EPH_MENU_MS, true); // menu encore ouvert => on attend le filet de sécurité
    } catch {}
  }, delay);
  _ephCleanup.set(uid, { timer });
}
client.on('interactionCreate', interaction => {
  try {
    if (!interaction?.user) return;
    if (!(interaction.isChatInputCommand?.() || interaction.isMessageComponent?.() || interaction.isModalSubmit?.())) return;
    _planEphClose(interaction, EPH_DONE_MS, false);
  } catch {}
});

client.on('interactionCreate', async interaction => {
  const guild = interaction.guild; const db = loadDB();
  if (await contratsConf.routeInteraction?.(interaction)) return;
  if (await operations.routeInteraction?.(interaction)) return;
  if (await rumeurs.routeInteraction?.(interaction)) return;
  if (await inventaire.routeInteraction?.(interaction)) return;
  if (await diagnostic.routeInteraction?.(interaction)) return;
  if (await absences.routeInteraction?.(interaction)) return;
  if (await repertoire.routeInteraction?.(interaction)) return;
  if (await monitoring.routeInteraction?.(interaction)) return;
  if (await telegramme.routeInteraction?.(interaction)) return;
  if (await securite.routeInteraction?.(interaction)) return;
  if (await rdvplus.routeInteraction?.(interaction)) return;
  if (await parrainage.routeInteraction?.(interaction)) return;
  if (await tableaubord.routeInteraction?.(interaction)) return;
  if (await traque.routeInteraction?.(interaction)) return;
  if (await reseau.routeInteraction?.(interaction)) return;
  if (await factures.routeInteraction?.(interaction)) return;

  if (interaction.isAutocomplete()) {
    if (['promo','retro'].includes(interaction.commandName)) return handleAutocompleteGrades(interaction);
    if (interaction.commandName === 'mission-statut') {
      const db = loadDB();
      const refs = Object.keys(db.missions || {});
      const focus = (interaction.options.getFocused() || '').toLowerCase();
      const choix = refs
        .filter(r => r.toLowerCase().includes(focus))
        .slice(-25).reverse()
        .map(r => ({ name: `${r}${db.missions[r]?.cible ? ' — ' + String(db.missions[r].cible).slice(0, 60) : ''}`.slice(0, 100), value: r }));
      return interaction.respond(choix).catch(() => {});
    }
    return;
  }
  if (interaction.isChatInputCommand()) {
    await handleSlashCommand(interaction).catch(e => {
      console.log('❌ Slash command error:', e.message);
      // Répondre proprement selon l'état de l'interaction (évite "already sent or deferred")
      const msg = { content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred) { interaction.editReply(msg).catch(() => {}); }
      else if (interaction.replied) { interaction.followUp(msg).catch(() => {}); }
      else { interaction.reply(msg).catch(() => {}); }
    });
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'modal_affaire')          return notionV3.handleAffaireModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_absent')           return _validerModalAbsent(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_absent_programmer') return _validerModalAbsentProgramme(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_agenda_rdv')        return notionV3.handleAgendaModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_op_programmee')     return notionV5.handleOpProgrammeeModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_op_creer'))   return _validerModalOpCreer(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_op_modifier_')) {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const parts2 = interaction.customId.replace('modal_op_modifier_', '').split('_');
    const lieuVal2 = parts2.pop();
    const opIdMod = parts2.join('_');
    const opMod = db.operations.find(o => o.id === opIdMod);
    if (!opMod) return interaction.editReply({ content: '❌ Opération introuvable.' });
    const lieuVille2 = VILLES_RDR2.find(v => v.value === lieuVal2);
    opMod.lieu      = lieuVille2 ? `${lieuVille2.emoji || ''} ${lieuVille2.label}`.trim() : lieuVal2;
    opMod.lieuId    = lieuVal2;
    opMod.objectif  = interaction.fields.getTextInputValue('objectif').trim();
    const newDetails = interaction.fields.getTextInputValue('details')?.trim();
    if (newDetails) opMod.equipe = newDetails;
    opMod.updatedAt = new Date().toISOString();
    saveDB(db);
    // Sync Notion
    if (opMod.notionPageId && process.env.NOTION_TOKEN) {
      _notionPatch(opMod.notionPageId, {
        'Lieu IC':   { rich_text: [{ text: { content: opMod.lieu } }] },
        'Objectif':  { rich_text: [{ text: { content: opMod.objectif } }] },
        'Notes':     { rich_text: [{ text: { content: opMod.equipe || '—' } }] },
      }).catch(() => {});
    }
    // Mettre à jour l'embed dans #operations
    const opsCh3 = getChById(interaction.guild, 'OPERATIONS', 'operations');
    if (opsCh3) {
      const msgs3 = await opsCh3.messages.fetch({ limit: 50 }).catch(() => null);
      const msgOp = msgs3?.find(m => m.embeds[0]?.footer?.text?.includes(opIdMod));
      if (msgOp) {
        const newEmbed = EmbedBuilder.from(msgOp.embeds[0])
          .spliceFields(2, 1, { name: 'Lieu', value: opMod.lieu, inline: true })
          .spliceFields(3, 1, { name: 'Objectif', value: opMod.objectif, inline: false });
        await msgOp.edit({ embeds: [newEmbed] }).catch(() => {});
      }
    }
    await interaction.editReply({ content: `✅ Opération **${opMod.name}** modifiée — Lieu: ${opMod.lieu} · Objectif: ${opMod.objectif}` });
    return;
  }
  if (interaction.isModalSubmit() && interaction.customId === 'modal_surnom_identite')   return _validerModalSurnom(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_agenda_simple')) return _validerModalAgendaSimple(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('dc_modal_')) return _validerModalBrouillon(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_journal') return _validerJournal(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_mafiche') return _validerMaFiche(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_mission') return _validerModalMission(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_engagement_')) return _validerModalEngagement(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rdv_individuel_')) return _validerModalRdvIndividuel(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rdv_comm_')) return _validerModalRdvCommunaute(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_rdv_'))      return _validerModalRdv(interaction);
  if (interaction.isModalSubmit() && interaction.customId === 'modal_informateur')       return notionV3.handleInformateurModal?.(interaction);
  if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_tresor_'))   return notionModules.handleTresorModal?.(interaction);

  if (interaction.isButton()) {
    // ── Boutons des utilités membres (journal / fiche) ──
    if (interaction.customId === 'journal_ajouter') return interaction.showModal(_modalJournal());
    if (interaction.customId === 'mafiche_modifier') {
      const dbf = loadDB();
      const fiche = (dbf.fichesPerso && dbf.fichesPerso[interaction.member.id]) || {};
      return interaction.showModal(_modalMaFiche(fiche));
    }
    // ── Boutons du menu principal ──
    if (interaction.customId.startsWith('menu_')) return _gererBoutonMenu(interaction);
    // ── Boutons du brouillon de contrat (note → contrat) ──
    if (interaction.customId.startsWith('dc_')) return _gererBoutonBrouillon(interaction);
    if (interaction.customId.startsWith('engagement_signer_'))  return _ouvrirModalEngagement(interaction);
    if (interaction.customId === 'btn_grade_panel')            return notionV3.handleGradePanelButton?.(interaction);
    if (interaction.customId === 'btn_agenda_nouveau')         return notionV3.handleAgendaNouveauButton?.(interaction);
    if (interaction.customId === 'btn_hierarchie_refresh')     { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); await notionV3.updateHierarchieEmbed?.(interaction.guild); return interaction.editReply({ content: '✅ Hiérarchie mise à jour.' }); }
    if (interaction.customId === 'btn_affaire_nouvelle') {
      const modal = new ModalBuilder().setCustomId('modal_affaire').setTitle('📋 Soumettre une affaire');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel("Titre de l'affaire").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Proposition alliance, Demande de contrat...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('description').setLabel('Description détaillée').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Détails, contexte, personnes impliquées...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('urgence').setLabel('Urgence (faible / normale / haute)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('normale')),
      );
      return interaction.showModal(modal);
    }
    if (interaction.customId === 'btn_affaires_resume')        return notionV3.handleAffairesResumeButton?.(interaction);
    if (interaction.customId === 'btn_informateur_rapport')    return notionV3.handleInformateurRapportButton?.(interaction);
    if (interaction.customId === 'setup_appliquer')             return _handleSetupServeur({ ...interaction, options: { getString: () => 'appliquer' } });
    if (interaction.customId === 'setup_annuler')               return interaction.update({ content: '❌ Annulé — aucune modification effectuée.', components: [] });
    if (interaction.customId === 'btn_informateur_historique') { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV3.handleInformateurHistorique?.(interaction); }
    if (interaction.customId.startsWith('info_confirmer_'))    return notionV3.handleInformateurConfirmer?.(interaction);
    if (interaction.customId === 'btn_absent_programmer')         return _ouvrirModalAbsentProgrammer(interaction);
    if (interaction.customId.startsWith('btn_absent_confirmer_')) return _confirmerAbsence(interaction);
    if (interaction.customId === 'btn_absent_annuler')             return interaction.update({ content: '↩️ Absence annulée.', embeds: [], components: [] });
    if (interaction.customId === 'btn_surnom_ouvrir')              return _ouvrirModalSurnom(interaction);
    if (interaction.customId === 'dir_btn_candidatures')       return interaction.reply({ flags: MessageFlags.Ephemeral, content: _buildCandidaturesResume(db) });
    if (interaction.customId === 'dir_btn_ops')                return notionV5.handleStatsAvancees?.(interaction) || interaction.reply({ flags: MessageFlags.Ephemeral, content: '`/stats` pour plus de détails.' });
    if (interaction.customId === 'dir_btn_bilan')              { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionModules.handleBilanCommand?.(interaction); }
    if (interaction.customId === 'dir_btn_registre')           return _handleRegistre(interaction);
    if (interaction.customId === 'dir_btn_refresh')            { await updateDirectionPanel(interaction.guild).catch(() => {}); return interaction.reply({ flags: MessageFlags.Ephemeral, content: '✅ Panel mis à jour.' }); }
    if (interaction.customId.startsWith('purge_confirm_'))     return _executerPurge(interaction);
    if (interaction.customId === 'purge_annuler')              return interaction.update({ content: '↩️ Suppression annulée.', embeds: [], components: [] });
    if (interaction.customId === 'btn_rdv_creer_contrat_panel') return _ouvrirMenuRdv(interaction);
    if (interaction.customId.startsWith('btn_rdv_creer_'))     return _ouvrirMenuRdv(interaction);
    // [CORRECTION] btn_rdv_modal_ est un bouton, pas un select menu
    if (interaction.customId.startsWith('btn_rdv_modal_'))     return _handleRdvModalBtn(interaction);
    if (interaction.customId.startsWith('btn_grade_maj_'))     return notionV3.handleGradeMajButton?.(interaction);
    if (interaction.customId.startsWith('grade_up_'))          return notionV3.handleGradeUp?.(interaction);
    if (interaction.customId.startsWith('grade_down_'))        return notionV3.handleGradeDown?.(interaction);
    if (interaction.customId.startsWith('grade_fiche_'))       return notionV3.handleGradeFiche?.(interaction);
    if (interaction.customId === 'grade_eligibles')            return notionV3.handleGradeEligibles?.(interaction);
    if (interaction.customId.startsWith('info_infirmer_'))     return notionV3.handleInformateurInfirmer?.(interaction);
    if (interaction.customId.startsWith('affaire_oui_'))       return notionV3.handleAffaireVote?.(interaction, 'oui');
    if (interaction.customId.startsWith('affaire_non_'))       return notionV3.handleAffaireVote?.(interaction, 'non');
    if (interaction.customId.startsWith('affaire_detail_'))    { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV3.handleAffaireDetail?.(interaction); }
    if (interaction.customId === 'btn_nouvelle_transaction')   return notionModules.handleTresorCommand?.(interaction);
    if (interaction.customId === 'btn_tresor_config') {
      if (!isFondateurOuFleau(interaction.member) && !isOfficierOuDirection(interaction.member)) {
        return interaction.reply({ content: '❌ Accès réservé à la Direction.', flags: MessageFlags.Ephemeral });
      }
      return notionModules.handleTresorConfigButton?.(interaction);
    }
    if (interaction.customId.startsWith('tresor_valider_'))    return notionModules.handleTresorValidation?.(interaction, 'valider');
    if (interaction.customId.startsWith('op_stop_'))           return notionV5.handleOpStop?.(interaction);
    if (interaction.customId.startsWith('op_lancer_force_')) {
      const opId4 = interaction.customId.replace('op_lancer_force_', '');
      const op4   = db.operations.find(o => o.id === opId4);
      if (!op4) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
      const presentsText = (op4.presents || []).length > 0 ? (op4.presents || []).join(', ') : '*Aucune présence enregistrée*';
      // Afficher confirmation finale avec mode ping
      const roleLabel4 = op4.pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal';
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [new EmbedBuilder()
          .setColor(0x00AA00)
          .setTitle(`🚀 Lancer — ${op4.name}`)
          .setDescription('Tout le monde est là. Choisis le mode de notification pour le lancement.')
          .addFields(
            { name: '✋ Présents', value: presentsText, inline: true },
            { name: '❌ Absents', value: (op4.absents || []).length > 0 ? (op4.absents || []).join(', ') : '*—*', inline: true },
          )
          .setFooter({ text: 'IWC • Lancement imminent' })
        ],
        components: [new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId(`op_lancer_ping_pole_${opId4}`).setLabel(`📢 Ping ${roleLabel4}`).setStyle(ButtonStyle.Success),
          new ButtonBuilder().setCustomId(`op_lancer_ping_participants_${opId4}`).setLabel('📢 Ping Participants').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(`op_lancer_silencieux_${opId4}`).setLabel('🔇 Sans ping').setStyle(ButtonStyle.Secondary),
        )],
      });
      return;
    }
    if (interaction.customId === 'btn_stats_refresh')          { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); return notionV5.handleStatsAvancees?.(interaction); }
    if (interaction.customId.startsWith('op_annulee_confirm_')) {
      const opId = interaction.customId.replace('op_annulee_confirm_', '');
      const op = db.operations.find(o => o.id === opId); if (!op) return;
      op.status = 'annulee'; op.updatedAt = new Date().toISOString(); saveDB(db);
      await interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Opération annulée — ${op.name}`).setDescription(`Annulée par **${interaction.user.username}**.`).setTimestamp()], components: [] });
      const opsCh = getChById(guild, 'OPERATIONS', 'operations-en-cours', 'operations');
      if (opsCh) await opsCh.send({ content: `❌ L'opération **${op.name}** a été annulée par ${interaction.user.username}.` }).catch(() => {});
      return;
    }
    if (interaction.customId === 'op_annulee_cancel')         return interaction.update({ content: '↩️ Annulation annulée.', embeds: [], components: [] });

    // ── Handler ✏️ Modifier opération ──
    if (interaction.customId.startsWith('op_modifier_')) {
      if (!isDirection(interaction.member)) {
        return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
      }
      const opIdM = interaction.customId.replace('op_modifier_', '');
      const opM   = db.operations.find(o => o.id === opIdM);
      if (!opM) return interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral });
      if (opM.status === 'en_cours') {
        return interaction.reply({ content: '❌ Impossible de modifier une opération en cours.', flags: MessageFlags.Ephemeral });
      }
      if (opM.status === 'terminee' || opM.status === 'annulee') {
        return interaction.reply({ content: '❌ Impossible de modifier une opération terminée ou annulée.', flags: MessageFlags.Ephemeral });
      }
      // Ouvrir le menu de sélection de lieu
      const { StringSelectMenuBuilder } = require('discord.js');
      const villesOptions = VILLES_RDR2.map(v => ({ label: v.label, value: v.value, emoji: v.emoji || undefined, default: v.value === opM.lieuId }));
      await interaction.reply({
        flags: MessageFlags.Ephemeral,
        embeds: [new EmbedBuilder()
          .setColor(0xFFA500)
          .setTitle(`✏️ Modifier — ${opM.name}`)
          .setDescription('Choisis le nouveau lieu. Le formulaire de détails s\'ouvrira ensuite.')
          .addFields(
            { name: '📍 Lieu actuel',     value: opM.lieu    || '—', inline: true },
            { name: '🎯 Objectif actuel', value: opM.objectif || '—', inline: true },
          )
        ],
        components: [new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId(`op_modifier_lieu_${opIdM}`)
            .setPlaceholder('Choisir un nouveau lieu...')
            .addOptions(villesOptions.slice(0, 25))
        )],
      });
      return;
    }

    // ── Handler sélection lieu modification ──
    if (interaction.isStringSelectMenu() && interaction.customId.startsWith('op_modifier_lieu_')) {
      const opIdML = interaction.customId.replace('op_modifier_lieu_', '');
      const lieuVal = interaction.values[0];
      const lieuVille = VILLES_RDR2.find(v => v.value === lieuVal);
      const modal = new ModalBuilder()
        .setCustomId(`modal_op_modifier_${opIdML}_${lieuVal}`)
        .setTitle(`✏️ Modifier opération`);
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objectif').setLabel('Objectif').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Neutraliser les gardes...')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Équipe / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Membres impliqués, matériel, heure...')),
      );
      return interaction.showModal(modal);
    }

    // ── Handler présence ✋ ──
    if (interaction.customId.startsWith('op_present_')) {
      const opId3 = interaction.customId.replace('op_present_', '');
      const op3   = db.operations.find(o => o.id === opId3);
      if (!op3) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
      if (!op3.presents) op3.presents = [];
      const username = interaction.member?.displayName || interaction.user.username;
      if (!op3.presents.includes(username)) {
        op3.presents.push(username);
        saveDB(db);
      }
      // Retirer de la liste absents si présent
      if (!op3.absents) op3.absents = [];
      op3.absents = op3.absents.filter(p => p !== username);
      saveDB(db);
      // Mettre à jour l'embed
      const presentsText = op3.presents.map(p => `✅ ${p}`).join('\n') || '*En attente...*';
      const absentsText  = op3.absents.map(p => `❌ ${p}`).join('\n') || '*—*';
      const nbPresents = op3.presents.length;
      const nbAbsents  = op3.absents.length;
      const nbInscrits = (op3.participants || []).length;
      const allPresent = nbInscrits > 0 && nbPresents >= nbInscrits;
      try {
        const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
          .spliceFields(4, 2,
            { name: `✋ Présents (${nbPresents}${nbInscrits > 0 ? `/${nbInscrits}` : ''})${allPresent ? ' ✅' : ''}`, value: presentsText, inline: true },
            { name: `❌ Absents (${nbAbsents})`, value: absentsText, inline: true },
          );
        await interaction.update({ embeds: [newEmbed] });
      } catch { await interaction.reply({ content: `✅ **${username}** est enregistré présent !`, flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ── Handler absent ❌ ──
    if (interaction.customId.startsWith('op_absent_op_')) {
      const opId5  = interaction.customId.replace('op_absent_op_', '');
      const op5    = db.operations.find(o => o.id === opId5);
      if (!op5) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
      if (!op5.absents)  op5.absents  = [];
      if (!op5.presents) op5.presents = [];
      const username5 = interaction.member?.displayName || interaction.user.username;
      if (!op5.absents.includes(username5)) {
        op5.absents.push(username5);
        op5.presents = op5.presents.filter(p => p !== username5);
        saveDB(db);
      }
      const presentsText5 = op5.presents.map(p => `✅ ${p}`).join('\n') || '*En attente...*';
      const absentsText5  = op5.absents.map(p => `❌ ${p}`).join('\n') || '*—*';
      const nbPresents5 = op5.presents.length;
      const nbAbsents5  = op5.absents.length;
      const nbInscrits5 = (op5.participants || []).length;
      try {
        const newEmbed5 = EmbedBuilder.from(interaction.message.embeds[0])
          .spliceFields(4, 2,
            { name: `✋ Présents (${nbPresents5}${nbInscrits5 > 0 ? `/${nbInscrits5}` : ''})`, value: presentsText5, inline: true },
            { name: `❌ Absents (${nbAbsents5})`, value: absentsText5, inline: true },
          );
        await interaction.update({ embeds: [newEmbed5] });
      } catch { await interaction.reply({ content: `❌ **${username5}** enregistré absent.`, flags: MessageFlags.Ephemeral }); }
      return;
    }

    // ── Handlers lancement avec/sans ping ──
    if (interaction.customId.startsWith('op_lancer_ping_pole_') ||
        interaction.customId.startsWith('op_lancer_ping_participants_') ||
        interaction.customId.startsWith('op_lancer_silencieux_')) {
      const parts   = interaction.customId.split('_');
      const opId2   = parts[parts.length - 1];
      const pingMode = interaction.customId.includes('ping_pole') ? 'pole'
                     : interaction.customId.includes('ping_participants') ? 'participants'
                     : 'silencieux';
      const op2 = db.operations.find(o => o.id === opId2);
      if (!op2) { await interaction.update({ content: '❌ Opération introuvable.', embeds: [], components: [] }); return; }

      op2.status = 'en_cours'; saveDB(db);
      await notionExtra.majOperationNotion?.(op2);
      if (op2.notionPageId && process.env.NOTION_TOKEN) {
        _notionPatch(op2.notionPageId, {
          'Statut': { select: { name: '🟢 En cours' } },
          'Participants': { multi_select: (op2.participants || []).map(n => ({ name: n })) },
        }).catch(() => {});
      }
      await sendLog(guild, 'OPERATION', { nom: op2.name, lieu: op2.lieu, equipe: op2.equipe, statut: '🟢 En cours' });

      // Mettre à jour l'embed de confirmation
      await interaction.update({ content: `✅ Opération **${op2.name}** lancée.`, embeds: [], components: [] });

      // Poster dans le salon opérations
      const opsCh = getChById(guild, 'OPERATIONS', 'operations');
      if (opsCh) {
        let pingContent = '';
        if (pingMode === 'pole') {
          const roleId = op2.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL;
          pingContent = `<@&${roleId}> — 🟢 L'opération **${op2.name}** est **LANCÉE**. À vos postes.`;
          await opsCh.send({ content: pingContent, allowedMentions: { parse: [], roles: [roleId] } });
        } else if (pingMode === 'participants' && (op2.participants || []).length > 0) {
          const mentions = op2.participants.map(n => { const id = MEMBRES_DISCORD_MAP?.[n]; return id ? `<@${id}>` : `**${n}**`; }).join(' ');
          pingContent = `${mentions} — 🟢 L'opération **${op2.name}** est **LANCÉE**. À vos postes.`;
          await opsCh.send({ content: pingContent, allowedMentions: { parse: ['users'] } });
        } else if (pingMode === 'silencieux') {
          await opsCh.send({ content: `🟢 L'opération **${op2.name}** est **LANCÉE**.` });
        }
      }
      // ── Fil de coordination sous l'ordre d'opération (salon propre, coordination dans le fil) ──
      try {
        let ancreOp = null;
        if (op2.channelId && op2.msgId) {
          const chOp = await interaction.client.channels.fetch(op2.channelId).catch(() => null);
          ancreOp = chOp && await chOp.messages.fetch(op2.msgId).catch(() => null);
        }
        if (!ancreOp && opsCh) ancreOp = await opsCh.send({ content: `🎯 Coordination — **${op2.name}**` }).catch(() => null);
        if (ancreOp && !ancreOp.hasThread) {
          const filOp = await ancreOp.startThread({ name: `🎯 ${op2.name}`.slice(0, 100), autoArchiveDuration: 1440 }).catch(() => null);
          if (filOp) {
            op2.threadId = filOp.id; saveDB(db);
            await filOp.send({ content: `🎯 **Coordination — ${op2.name}**\n📍 ${op2.lieu || '—'} · 🎯 ${op2.objectif || '—'}\n\nServez-vous de ce fil pour vous organiser, partager les infos et faire les comptes-rendus. Le salon reste propre.` }).catch(() => {});
          }
        }
      } catch (e) { console.log('⚠️ Fil coordination opération:', e.message); }
      notionV4.envoyerBriefingOp?.(guild, op2).catch(() => {});
      return;
    }
    if (interaction.customId.startsWith('tresor_refuser_'))   return notionModules.handleTresorValidation?.(interaction, 'refuser');
    if (interaction.customId.startsWith('tresor_'))           return notionModules.handleTresorFlow?.(interaction);
    if (interaction.customId === 'btn_solde')                 return notionModules.handleSoldeButton?.(interaction);
    if (interaction.customId === 'btn_dashboard_refresh')     { return notionModules.handleDashboard?.(interaction); }
    if (interaction.customId.startsWith('journal_'))          return notionModules.handleJournalPagination?.(interaction);
  }

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'op_lieu_select')               return _handleOpLieuSelect(interaction);
    if (interaction.customId === 'agenda_lieu_select')           return _handleAgendaLieuSelect(interaction);
    // [CORRECTION] btn_rdv_modal_ retiré d'ici — c'est un bouton pas un select
    if (interaction.customId === 'tresor_config_limite_legal') {
      if (!isFondateurOuFleau(interaction.member) && !isOfficierOuDirection(interaction.member)) return;
      return notionModules.handleTresorConfigSelect?.(interaction);
    }
    if (interaction.customId.startsWith('rdv_type_select_'))     return _handleRdvTypeSelect(interaction);
    if (interaction.customId.startsWith('rdv_mode_select_'))     return _handleRdvModeSelect(interaction);
    if (interaction.customId.startsWith('rdv_individuel_select_')) return _handleRdvIndividuelSelect(interaction);
    if (interaction.customId.startsWith('rdv_pole_select_'))     return _handleRdvPoleSelect(interaction);
    if (interaction.customId.startsWith('rdv_comm_person_'))     return _handleRdvCommPersonSelect(interaction);
    if (interaction.customId.startsWith('rdv_lieu_select_'))     return _handleRdvLieuSelect(interaction);
    if (interaction.customId === 'tresor_config_limite_illegal') {
      if (!isFondateurOuFleau(interaction.member) && !isOfficierOuDirection(interaction.member)) return;
      return notionModules.handleTresorConfigSelect?.(interaction);
    }
    if (interaction.customId === 'absent_duree_select')           return _handleAbsentDureeSelect(interaction);
    if (interaction.customId === 'grade_select_membre')          return notionV3.handleGradeMembreSelect?.(interaction);
    if (interaction.customId === 'grade_select_grade')           return notionV3.handleGradeGradeSelect?.(interaction);
  }

  if (interaction.isButton() && interaction.customId === 'open_candidature_legal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_legal').setTitle('📋 Candidature — Iron Wolf Company');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom IC · Âge (Ex: Jonas Caverly, 34 ans)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Jonas Caverly, 34 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('metier').setLabel('Métier / Compétences').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Médecin, Avocat, Ingénieur...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800).setPlaceholder('Qui est ton personnage ? Son histoire, ce qui l\'amène ici...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivation').setLabel('Pourquoi rejoindre IWC ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Qu\'est-ce que tu apportes à la Compagnie ? Tes objectifs IC...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités · Niveau RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine + week-end · Confirmé 2 ans')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isButton() && interaction.customId === 'open_candidature_illegal') {
    const modal = new ModalBuilder().setCustomId('candidature_modal_illegal').setTitle('🔪 La Confrérie — Illégal');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_perso').setLabel('Nom IC · Âge (Ex: Viktor Crane, 29 ans)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Viktor Crane, 29 ans')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('specialite').setLabel('Spécialité / Activités').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Contrebande, Sécurité, Renseignement...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('background').setLabel('Background du personnage').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800).setPlaceholder("Ce qui t'a amené dans l'ombre... Ton passé, tes actes...")),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motivation').setLabel('Pourquoi rejoindre la Confrérie ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Ce que tu apportes, tes intentions IC...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Disponibilités · Niveau RP').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Soir semaine + week-end · Confirmé 2 ans')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_legal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const nomAgeL = interaction.fields.getTextInputValue('nom_perso').split(',');
    const nomPersoL = nomAgeL[0]?.trim() || '—'; const agePersoL = nomAgeL[1]?.trim() || '—';
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: nomPersoL, agePerso: agePersoL, metier: interaction.fields.getTextInputValue('metier'), background: interaction.fields.getTextInputValue('background'), motivation: interaction.fields.getTextInputValue('motivation'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'legal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    _syncCandidatureNotion(cand, 'reçue').catch(() => {});
    await interaction.editReply({ content: '✅ **Candidature légale transmise.**\nRéponse en DM sous 48h.\n*La Compagnie ne recrute pas au hasard.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '⚖️ Légal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x3B82F6).setTitle('📥 Candidature légale reçue — IWC').setDescription("Ta candidature a bien été transmise à la Direction.\n\nUne réponse en DM sous 48h.\n\n*La Compagnie choisit ses membres avec soin.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Recrutement Légal' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_LEGAL);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x3B82F6).setTitle(`📁 [IRON WOLF COMPANY] DOSSIER LÉGAL — ${cand.nomPerso}`).setDescription(`> *"Chaque talent a sa place au sein de la Compagnie."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**⚖️ TYPE : RECRUTEMENT LÉGAL**`).addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '💼 Métier', value: cand.metier }, { name: '📖 Background', value: cand.background.slice(0, 800) }, { name: '💡 Motivation', value: (cand.motivation || '—').slice(0, 500) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' }).setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `IWC • Légal • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 📋 Nouveau dossier **LÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[LÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** ⚖️\n\nÉchangez ici avant de voter.`); } catch {}
    }
    return;
  }

  if (interaction.isModalSubmit() && interaction.customId === 'candidature_modal_illegal') {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const nomAgeI = interaction.fields.getTextInputValue('nom_perso').split(',');
    const nomPersoI = nomAgeI[0]?.trim() || '—'; const agePersoI = nomAgeI[1]?.trim() || '—';
    const cand = { id: Date.now().toString(), userId: interaction.user.id, username: interaction.user.username, nomPerso: nomPersoI, agePerso: agePersoI, specialite: interaction.fields.getTextInputValue('specialite'), background: interaction.fields.getTextInputValue('background'), motivation: interaction.fields.getTextInputValue('motivation'), dispos: interaction.fields.getTextInputValue('dispos'), type: 'illegal', status: 'reçue', receivedAt: new Date().toISOString() };
    db.candidatures.push(cand); saveDB(db);
    _syncCandidatureNotion(cand, 'reçue').catch(() => {});
    await interaction.editReply({ content: '🔒 **Dossier transmis.**\nReste discret.\n*On te contactera si tu es jugé digne.*' });
    await sendLog(guild, 'CANDIDATURE_RECUE', { userId: cand.userId, nomPerso: cand.nomPerso, type: '🔪 Illégal' });
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🔒 Dossier transmis — IWC').setDescription("Ton dossier a été acheminé aux bonnes personnes.\n\nUne réponse en DM sous 48h.\n\n*Ne parle de cela à personne.*\n— La Direction").setFooter({ text: 'Iron Wolf Company • Confidentiel' })] }).catch(() => {});
    const dossierCh = guild.channels.cache.get(CH.RECRUTEMENT_INT_ILLEG);
    if (dossierCh) {
      const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📁 [LA CONFRÉRIE] DOSSIER ILLÉGAL — ${cand.nomPerso}`).setDescription(`> *"L'ombre protège ceux qui savent s'y fondre."*\n\nCandidature de <@${cand.userId}> (**${cand.username}**)\n**🔪 TYPE : RECRUTEMENT ILLÉGAL**`).addFields({ name: '👤 Personnage', value: `**${cand.nomPerso}**, ${cand.agePerso}`, inline: true }, { name: '📅 Reçue le', value: fmtShort(new Date()), inline: true }, { name: '🆔 ID', value: `\`${cand.id}\``, inline: true }, { name: '🔪 Spécialité', value: cand.specialite }, { name: '📖 Background', value: cand.background.slice(0, 800) }, { name: '💡 Motivation', value: (cand.motivation || '—').slice(0, 500) }, { name: '🕐 Disponibilités', value: cand.dispos, inline: true }, { name: '📋 Statut', value: '🟡 En attente', inline: true }, { name: '\u200b', value: '**Réagissez :** ✅ Accepter · ❌ Refuser · 🤔 À revoir' }).setThumbnail(interaction.user.displayAvatarURL()).setFooter({ text: `La Confrérie • CONFIDENTIEL • ${fmtShort(new Date())}` });
      const dossierMsg = await dossierCh.send({ content: `${getMention(guild)} — 🔪 Nouveau dossier **ILLÉGAL**`, embeds: [embed] });
      await dossierMsg.react('✅'); await dossierMsg.react('❌'); await dossierMsg.react('🤔');
      try { const t = await dossierMsg.startThread({ name: `[ILLÉGAL] Discussion — ${cand.nomPerso}`, autoArchiveDuration: 10080 }); await t.send(`**Discussion interne — ${cand.nomPerso}** 🔪\n\nÉchangez ici avant de voter.`); } catch {}
    }
    return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith('op_participer_') || interaction.customId.startsWith('op_retrait_'))) {
    const retrait = interaction.customId.startsWith('op_retrait_'); const opId = interaction.customId.replace(retrait ? 'op_retrait_' : 'op_participer_', '');
    const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    if (['terminee', 'annulee'].includes(op.status)) { await interaction.reply({ content: '❌ Cette opération est clôturée.', flags: MessageFlags.Ephemeral }); return; }
    op.participants = op.participants || []; op.participantsIds = op.participantsIds || []; const nom = nomParticipant(interaction.member); const uid = interaction.user.id;
    if (retrait) { op.participants = op.participants.filter(p => p !== nom); op.participantsIds = op.participantsIds.filter(i => i !== uid); }
    else { if (!op.participants.includes(nom)) op.participants.push(nom); if (!op.participantsIds.includes(uid)) op.participantsIds.push(uid); }
    saveDB(db); await notionExtra.majOperationNotion?.(op);
    // Sync participants Notion
    if (op.notionPageId && process.env.NOTION_TOKEN) {
      _notionPatch(op.notionPageId, { 'Participants': { multi_select: (op.participants || []).map(n => ({ name: n })) } }).catch(() => {});
    }
    const liste = (op.participantsIds && op.participantsIds.length) ? op.participantsIds.map(i => `<@${i}>`).join(', ') : (op.participants.length ? op.participants.join(', ') : '*Personne pour l\'instant.*');
    const updated = EmbedBuilder.from(interaction.message.embeds[0]); const idx = interaction.message.embeds[0].fields.findIndex(f => f.name.startsWith('👥 Participants'));
    if (idx >= 0) updated.spliceFields(idx, 1, { name: `👥 Participants (${(op.participantsIds && op.participantsIds.length) ? op.participantsIds.length : op.participants.length})`, value: liste });
    await interaction.update({ embeds: [updated] }); return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('op_terminee_')) {
    const opId = interaction.customId.replace('op_terminee_', ''); const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    const modal = new ModalBuilder().setCustomId(`op_resultat_modal_${opId}`).setTitle('✅ Compte-rendu opération');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('resultat').setLabel('Résultat').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Réussite complète / Échec / Réussite partielle / Abandonnée')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('butin').setLabel('Butin / Gains ($)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: $5 000 cash + véhicule')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pertes').setLabel('Pertes / Dommages').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Aucune / 2 blessés / matériel perdu')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('debrief').setLabel('Débrief complet').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Déroulement, points positifs, erreurs à éviter...')),
    );
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('op_resultat_modal_')) {
    const opId = interaction.customId.replace('op_resultat_modal_', ''); const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }
    await interaction.deferUpdate();
    op.status = 'terminee'; op.endedAt = new Date().toISOString(); op.deleteAt = Date.now() + 24 * 60 * 60 * 1000; op.resultat = interaction.fields.getTextInputValue('resultat'); op.butin = interaction.fields.getTextInputValue('butin') || '—'; op.pertes = interaction.fields.getTextInputValue('pertes') || '—'; op.debrief = interaction.fields.getTextInputValue('debrief') || '—'; saveDB(db);
    await notionExtra.majOperationNotion?.(op);
    await notionV3.syncOperationTermineeNotion?.(op).catch(() => {});
    // Sync directe Notion si notionPageId existe
    if (op.notionPageId && process.env.NOTION_TOKEN) {
      _notionPatch(op.notionPageId, {
        'Statut': { select: { name: '✅ Terminée' } },
        'Résultat': { rich_text: [{ text: { content: op.resultat || '—' } }] },
        'Butin': { rich_text: [{ text: { content: op.butin || '—' } }] },
        'Débrief': { rich_text: [{ text: { content: (op.debrief || '—').slice(0, 2000) } }] },
        'Date fin': { date: { start: new Date().toISOString().split('T')[0] } },
      }).catch(() => {});
    }
    await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '✅ Terminée — ' + op.resultat });
    await ajouterJournalIC(guild, { type: 'operation', titre: `Opération terminée — ${op.name}`, description: `Résultat : **${op.resultat}** · Butin : ${op.butin}`, auteur: interaction.user.username });
    const updated = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(0, 1, { name: 'Statut', value: '✅ Terminée', inline: true }).addFields({ name: '🏁 Résultat', value: op.resultat, inline: true }, { name: '💰 Butin', value: op.butin, inline: true }, { name: '⚠️ Pertes', value: op.pertes, inline: true }, { name: '📝 Débrief', value: op.debrief }, { name: '🗑️ Archivage', value: `Compte-rendu visible pour tous, puis supprimé automatiquement <t:${Math.floor(op.deleteAt / 1000)}:R>.`, inline: false });
    await interaction.editReply({ embeds: [updated], components: [] }); return;
  }

  if (interaction.isButton() && (interaction.customId.startsWith('op_encours_') || interaction.customId.startsWith('op_annulee_'))) {
    const isLancer = interaction.customId.startsWith('op_encours_'); const opId = interaction.customId.replace(isLancer ? 'op_encours_' : 'op_annulee_', '');
    if (!isLancer) {
      const op = db.operations.find(o => o.id === opId); if (!op) return;
      return interaction.reply({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Confirmer l\'annulation').setDescription(`Vous allez annuler l'opération **${op.name}**.\n\nCette action est **irréversible**.`)], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`op_annulee_confirm_${opId}`).setLabel('✅ Confirmer l\'annulation').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('op_annulee_cancel').setLabel('↩️ Retour').setStyle(ButtonStyle.Secondary))] });
    }
    const op = db.operations.find(o => o.id === opId);
    if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }); return; }

    // ── Étape 1 : Rassemblement — avertir les membres avant de lancer ──
    const roleId  = op.pole === 'legal' ? ROLE_POLE_LEGAL : ROLE_POLE_ILLEGAL;
    const roleLabel = op.pole === 'legal' ? '⚖️ Pôle Légal' : '🔪 Pôle Illégal';
    const participantsText = (op.participants || []).length > 0
      ? op.participants.join(', ')
      : '*Aucun inscrit*';

    // Poster le message de rassemblement dans le salon opérations
    const opsCh2 = getChById(guild, 'OPERATIONS', 'operations');
    if (!opsCh2) { await interaction.reply({ content: '❌ Salon #operations introuvable.', flags: MessageFlags.Ephemeral }); return; }

    const embedRassemblement = new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(`⚠️ RASSEMBLEMENT — ${op.name}`)
      .setDescription(`L'opération **${op.name}** est sur le point de commencer.

**Cliquez sur ✋ Je suis là** pour signaler votre présence.

La Direction lancera l'opération quand tout le monde sera prêt.`)
      .addFields(
        { name: '📍 Lieu',         value: op.lieu || '—',    inline: true },
        { name: '🎯 Objectif',     value: op.objectif || '—', inline: true },
        { name: '📂 Pôle',         value: roleLabel,           inline: true },
        { name: '👥 Participants inscrits', value: participantsText, inline: false },
        { name: '✋ Présents (0)', value: '*En attente...*', inline: true },
        { name: '❌ Absents (0)', value: '*—*', inline: true },
      )
      .setFooter({ text: `IWC • Opérations • Rassemblement en cours` })
      .setTimestamp();

    const rowRassemblement = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`op_present_${opId}`).setLabel('✋ Je suis là').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`op_absent_op_${opId}`).setLabel('❌ Pas disponible').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`op_lancer_force_${opId}`).setLabel('🚀 Lancer').setStyle(ButtonStyle.Primary),
    );

    // Pinger le pôle pour le rassemblement
    await opsCh2.send({
      content: `<@&${roleId}> ⚠️ Rassemblement pour **${op.name}** — Cliquez ✋ pour confirmer votre présence !`,
      allowedMentions: { parse: [], roles: [roleId] },
    });
    await opsCh2.send({ embeds: [embedRassemblement], components: [rowRassemblement] });

    await interaction.reply({ content: `✅ Message de rassemblement posté dans #operations.`, flags: MessageFlags.Ephemeral });
    return;
  }

  // ══════════ PRISE DE RDV CLIENT (façon télégramme) ══════════
  if (interaction.isButton() && interaction.customId === 'rdvclient_demande') {
    // Étape 1 : choix du moment souhaité (plus ergonomique qu'une date tapée)
    const menu = new StringSelectMenuBuilder()
      .setCustomId('rdvclient_quand')
      .setPlaceholder('Quand souhaitez-vous le rendez-vous ?')
      .addOptions(
        { label: "Aujourd'hui", value: 'aujourdhui', emoji: '⚡', description: 'Le plus tôt possible' },
        { label: 'Demain', value: 'demain', emoji: '🌅' },
        { label: 'Dans 2-3 jours', value: '3jours', emoji: '📅' },
        { label: 'Cette semaine', value: 'semaine', emoji: '🗓️' },
        { label: 'La semaine prochaine', value: 'semaine_pro', emoji: '📆' },
        { label: 'À convenir avec vous', value: 'a_convenir', emoji: '🤝', description: 'La Direction proposera un créneau' },
      );
    await interaction.reply({ content: '🕐 **Première étape** — quand souhaitez-vous être reçu ?', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    return;
  }

  // Étape 2 : après le choix du moment, ouvrir le formulaire
  if (interaction.isStringSelectMenu() && interaction.customId === 'rdvclient_quand') {
    const quand = interaction.values[0];
    setTimeout(() => { interaction.message?.delete?.().catch(() => {}); }, 300);
    const modal = new ModalBuilder().setCustomId(`rdvclient_modal::${quand}`).setTitle('✉ Télégramme — Demande de RDV');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Votre nom / votre maison').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: M. Hawthorne, Famille Reyes...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de votre demande').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection de convoi, enquête...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu souhaité').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Saint-Denis, Valentine...')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('moment').setLabel('Moment de la journée (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: matin, après-midi, soir, nuit')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails (le télégramme)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Votre besoin, vos conditions, la rémunération proposée...')),
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('rdvclient_modal')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const quandCode = interaction.customId.includes('::') ? interaction.customId.split('::')[1] : 'a_convenir';
    const quandLabel = { aujourdhui: "Aujourd'hui", demain: 'Demain', '3jours': 'Dans 2-3 jours', semaine: 'Cette semaine', semaine_pro: 'La semaine prochaine', a_convenir: 'À convenir' }[quandCode] || 'À convenir';
    // Calculer une date approximative pour Notion
    const now = new Date();
    const addDays = d => { const x = new Date(now); x.setDate(x.getDate() + d); return x.toISOString().split('T')[0]; };
    const dateMap = { aujourdhui: addDays(0), demain: addDays(1), '3jours': addDays(3), semaine: addDays(5), semaine_pro: addDays(8), a_convenir: '' };
    const dateNotion = dateMap[quandCode] || '';

    const nom = interaction.fields.getTextInputValue('nom');
    const objet = interaction.fields.getTextInputValue('objet');
    const lieu = interaction.fields.getTextInputValue('lieu') || '';
    const moment = interaction.fields.getTextInputValue('moment') || '';
    const details = interaction.fields.getTextInputValue('details') || '';
    const dateSouhait = `${quandLabel}${moment ? ' (' + moment + ')' : ''}`;

    const db = loadDB();
    if (!db.rdvClients) db.rdvClients = [];
    const rdvId = 'RDVC-' + Date.now().toString().slice(-6);
    const rdv = { id: rdvId, nom, objet, lieu, dateSouhait, dateNotion, details, demandeurId: interaction.user.id, statut: 'en_attente', createdAt: new Date().toISOString() };
    db.rdvClients.push(rdv);
    if (db.rdvClients.length > 200) db.rdvClients = db.rdvClients.slice(-200);
    saveDB(db);
    sauvegarderSurGitHub().catch(() => {}); // sauvegarde immédiate pour survivre à un redémarrage

    // Télégramme stylé envoyé à la Direction
    const embed = new EmbedBuilder()
      .setColor(0xC8A45C)
      .setTitle('✉  TÉLÉGRAMME REÇU  ✉')
      .setDescription([
        '```',
        '═══ WESTERN UNION ═══',
        '```',
        `**De :** ${nom}`,
        `**Objet :** ${objet}`,
        ...(lieu ? [`**Lieu :** ${lieu}`] : []),
        ...(dateSouhait ? [`**Créneau souhaité :** ${dateSouhait}`] : []),
        ...(details ? ['', `> ${details.replace(/\n/g, '\n> ')}`] : []),
        '',
        `*Demandeur Discord :* <@${interaction.user.id}>`,
      ].join('\n'))
      .setFooter({ text: `Réf. ${rdvId} · En attente de décision` })
      .setTimestamp();
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rdvclient_fixer_${rdvId}`).setLabel('📅 Fixer le rendez-vous').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`rdvclient_repondre_${rdvId}`).setLabel('💬 Répondre au client').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rdvclient_refuse_${rdvId}`).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger),
    );
    // Envoyer le télégramme dans le salon des demandes, avec PING Opérateur + Homme de main + Fondateur
    const dest = interaction.guild.channels.cache.get('1512175624176009348') || interaction.channel;
    let msgTele = null;
    if (dest) {
      const rolesPing = interaction.guild.roles.cache.filter(r => { const n = (r.name || '').toLowerCase(); return n.includes('opérateur') || n.includes('operateur') || n.includes('homme de main') || n.includes('fondateur'); });
      const mentionIds = [...rolesPing.values()].map(r => r.id);
      const ping = mentionIds.map(id => `<@&${id}>`).join(' ');
      msgTele = await dest.send({
        content: `${ping ? ping + ' — ' : ''}📨 **Nouveau télégramme à traiter, un client demande un rendez-vous.**`,
        embeds: [embed],
        components: [row],
        allowedMentions: { roles: mentionIds },
      }).catch(() => null);
      // Épingler le télégramme en attente (tâche à traiter)
      if (msgTele) await msgTele.pin().catch(() => {});
      // Ouvrir une conversation suivie (fil + relais MP) sur ce télégramme
      if (msgTele) { try { await telegramme.ouvrirConversation?.(msgTele, { rdvId, demandeurId: interaction.user.id, nomRP: nom }); } catch {} }
    }
    if (!msgTele) {
      console.log('❌ Télégramme non transmis (salon 1512175624176009348 introuvable ou bot sans permission d écrire).');
      try { monitoring.logTech?.(interaction.client, 'error', '❌ Télégramme non transmis', 'Le bot n a pas pu poster le télégramme dans le salon des demandes (1512175624176009348). Vérifier que le salon existe et que le bot peut y écrire.'); } catch {}
      return interaction.editReply({ content: "⚠️ Votre télégramme n'a pas pu être transmis pour un souci technique. Prévenez directement un responsable, désolé." });
    }
    return interaction.editReply({ content: '✅ Votre télégramme a bien été transmis à la Direction. Vous recevrez une réponse prochainement.' });
  }

  // Décisions de la Direction sur une demande RDV client
  // Vérif rôle : Opérateur (la secrétaire) OU Direction
  function _peutGererRdv(member) {
    return member?.roles.cache.some(r => ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'Fondateur', 'Directeur'].some(n => r.name.includes(n)));
  }

  // Reconstruit une demande depuis l'embed du télégramme (si absente de la base après un redémarrage)
  function _rdvDepuisEmbed(interaction, rdvId) {
    try {
      const emb = interaction.message?.embeds?.[0];
      if (!emb) return null;
      const desc = emb.description || '';
      const nomM = desc.match(/\*\*De :\*\*\s*(.+)/);
      const objM = desc.match(/\*\*Objet :\*\*\s*(.+)/);
      const lieuM = desc.match(/\*\*Lieu :\*\*\s*(.+)/);
      const demM = desc.match(/<@(\d+)>/);
      return {
        id: rdvId,
        nom: nomM ? nomM[1].trim() : 'Client',
        objet: objM ? objM[1].trim() : '(demande)',
        lieu: lieuM ? lieuM[1].trim() : '',
        details: '', dateSouhait: '', dateNotion: '',
        demandeurId: demM ? demM[1] : null,
        statut: 'en_attente', createdAt: new Date().toISOString(),
      };
    } catch { return null; }
  }

  // ── FIXER LE RENDEZ-VOUS (la secrétaire fixe date/heure/lieu) ──
  if (interaction.isButton() && interaction.customId.startsWith('rdvclient_fixer_')) {
    if (!_peutGererRdv(interaction.member)) return interaction.reply({ content: '❌ Réservé aux Opérateurs.', flags: MessageFlags.Ephemeral });
    const rdvId = interaction.customId.replace('rdvclient_fixer_', '');
    const modal = new ModalBuilder().setCustomId(`rdvclient_fixer_modal_${rdvId}`).setTitle('📅 Fixer le rendez-vous');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date du RDV (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 15/08/1895')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu du rendez-vous').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Saloon de Valentine')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Mot pour le client (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setPlaceholder('Ex: Présentez-vous à l\'accueil, demandez la secrétaire...')),
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('rdvclient_fixer_modal_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const rdvId = interaction.customId.replace('rdvclient_fixer_modal_', '');
    const dateRdv = interaction.fields.getTextInputValue('date');
    const heure = interaction.fields.getTextInputValue('heure');
    const lieuRdv = interaction.fields.getTextInputValue('lieu');
    const mot = interaction.fields.getTextInputValue('message') || '';
    const db = loadDB();
    let rdv = (db.rdvClients || []).find(r => r.id === rdvId);
    if (!rdv) {
      rdv = _rdvDepuisEmbed(interaction, rdvId);
      if (!rdv) return interaction.editReply({ content: '❌ Demande introuvable.' });
      if (!db.rdvClients) db.rdvClients = [];
      db.rdvClients.push(rdv);
    }
    if (rdv.statut === 'fixe' || rdv.statut === 'refuse') return interaction.editReply({ content: `⚠️ Ce rendez-vous a déjà été traité (statut : ${rdv.statut}).` });
    rdv.statut = 'fixe';
    rdv.dateFixee = dateRdv; rdv.heureFixee = heure; rdv.lieuFixe = lieuRdv;
    saveDB(db);

    // Synchro agenda Notion avec la date exacte fixée
    if (typeof archiverRdvNotion === 'function') {
      archiverRdvNotion(`RDV Client — ${rdv.nom}`, dateRdv, lieuRdv, `${rdv.objet}\nHeure : ${heure}\n${rdv.details}`, false, rdv.lieu).catch(() => {});
    }

    // Confirmation au client en MP (ton secrétaire)
    try {
      const u = await client.users.fetch(rdv.demandeurId);
      await u.send([
        `📅 **Iron Wolf Company — Confirmation de rendez-vous**`,
        ``,
        `Bonjour, votre rendez-vous concernant « **${rdv.objet}** » est confirmé :`,
        `🗓️ **Date :** ${dateRdv}`,
        `🕐 **Heure :** ${heure}`,
        `📍 **Lieu :** ${lieuRdv}`,
        ...(mot ? ['', mot] : []),
        ``,
        `Au plaisir de vous recevoir.`,
        `— *Le secrétariat de l'Iron Wolf Company*`,
      ].join('\n')).catch(() => {});
    } catch {}

    const emb = EmbedBuilder.from(interaction.message.embeds[0])
      .setColor(0x57F287)
      .setFooter({ text: `Réf. ${rdvId} · 📅 RDV FIXÉ le ${dateRdv} à ${heure} · par ${interaction.member.displayName}` });
    await interaction.message?.edit({ embeds: [emb], components: [] }).catch(() => {});
    await interaction.message?.unpin().catch(() => {}); // désépingler : tâche terminée
    // Notion garde la traçabilité : on nettoie le salon en supprimant le télégramme traité
    const msgFixe = interaction.message;
    setTimeout(() => { msgFixe?.delete?.().catch(() => {}); }, 8000);
    return interaction.editReply({ content: `✅ Rendez-vous fixé et confirmé au client : **${dateRdv} à ${heure}** (${lieuRdv}). Ajouté à l'agenda Notion.` });
  }

  // ── RÉPONDRE AU CLIENT (échange libre, façon secrétaire) ──
  if (interaction.isButton() && interaction.customId.startsWith('rdvclient_repondre_')) {
    if (!_peutGererRdv(interaction.member)) return interaction.reply({ content: '❌ Réservé aux Opérateurs.', flags: MessageFlags.Ephemeral });
    const rdvId = interaction.customId.replace('rdvclient_repondre_', '');
    const modal = new ModalBuilder().setCustomId(`rdvclient_repondre_modal_${rdvId}`).setTitle('💬 Répondre au client');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('message').setLabel('Votre message au client').setStyle(TextInputStyle.Paragraph).setRequired(true).setPlaceholder('Ex: Pourriez-vous préciser le nombre de personnes à protéger ? Quel budget prévoyez-vous ?')),
    );
    return interaction.showModal(modal);
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('rdvclient_repondre_modal_')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const rdvId = interaction.customId.replace('rdvclient_repondre_modal_', '');
    const message = interaction.fields.getTextInputValue('message');
    const db = loadDB();
    let rdv = (db.rdvClients || []).find(r => r.id === rdvId);
    if (!rdv) { rdv = _rdvDepuisEmbed(interaction, rdvId); if (!rdv) return interaction.editReply({ content: '❌ Demande introuvable.' }); }
    try {
      const u = await client.users.fetch(rdv.demandeurId);
      await u.send([
        `💬 **Iron Wolf Company — Le secrétariat vous répond**`,
        `*(au sujet de votre demande : ${rdv.objet})*`,
        ``,
        message,
        ``,
        `— *Le secrétariat de l'Iron Wolf Company*`,
      ].join('\n')).catch(() => {});
    } catch {}
    return interaction.editReply({ content: '✅ Message envoyé au client. Il pourra vous répondre, et vous pourrez fixer le RDV quand vous serez d\'accord.' });
  }

  // ── DÉCLINER ──
  if (interaction.isButton() && interaction.customId.startsWith('rdvclient_refuse_')) {
    if (!_peutGererRdv(interaction.member)) return interaction.reply({ content: '❌ Réservé aux Opérateurs.', flags: MessageFlags.Ephemeral });
    const rdvId = interaction.customId.replace('rdvclient_refuse_', '');
    const db = loadDB();
    let rdv = (db.rdvClients || []).find(r => r.id === rdvId);
    if (!rdv) {
      rdv = _rdvDepuisEmbed(interaction, rdvId);
      if (!rdv) return interaction.reply({ content: '❌ Demande introuvable.', flags: MessageFlags.Ephemeral });
      if (!db.rdvClients) db.rdvClients = [];
      db.rdvClients.push(rdv);
    }
    if (rdv.statut === 'fixe' || rdv.statut === 'refuse') return interaction.reply({ content: `⚠️ Déjà traité (${rdv.statut}).`, flags: MessageFlags.Ephemeral });
    rdv.statut = 'refuse';
    saveDB(db);
    try {
      const u = await client.users.fetch(rdv.demandeurId);
      await u.send([
        `📜 **Iron Wolf Company — Réponse du secrétariat**`,
        ``,
        `Bonjour, nous vous remercions de votre demande concernant « ${rdv.objet} ».`,
        `Malheureusement, nous ne pouvons y donner suite pour le moment.`,
        `N'hésitez pas à nous recontacter ultérieurement.`,
        ``,
        `— *Le secrétariat de l'Iron Wolf Company*`,
      ].join('\n')).catch(() => {});
    } catch {}
    const emb = EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).setFooter({ text: `Réf. ${rdvId} · ❌ DÉCLINÉ par ${interaction.member.displayName}` });
    await interaction.update({ embeds: [emb], components: [] });
    await interaction.message?.unpin().catch(() => {}); // désépingler : tâche terminée
    const msgRef = interaction.message;
    setTimeout(() => { msgRef?.delete?.().catch(() => {}); }, 8000);
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_offre') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    // Menu Type de mission AVANT le formulaire
    const menu = new StringSelectMenuBuilder()
      .setCustomId('contrat_type_offre')
      .setPlaceholder('Choisis le type de mission...')
      .addOptions(
        { label: 'Protection rapprochée', value: 'Protection rapprochée', emoji: '🛡️' },
        { label: 'Escorte de convoi',     value: 'Escorte de convoi',     emoji: '🐎' },
        { label: 'Surveillance / Filature', value: 'Surveillance / Filature', emoji: '👁️' },
        { label: 'Chasse de prime',       value: 'Chasse de prime',       emoji: '🎯' },
        { label: 'Récupération de dette', value: 'Récupération de dette', emoji: '💰' },
        { label: 'Intervention armée',    value: 'Intervention armée',    emoji: '⚔️' },
        { label: 'Autre (à préciser)',    value: 'Autre',                 emoji: '📦' },
      );
    await interaction.reply({ content: '📤 **Type de mission ?**\nChoisis dans la liste, le formulaire s\'ouvrira ensuite.', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    return;
  }

  // Après choix du type (offre) -> ouvrir le formulaire avec le type pré-rempli
  if (interaction.isStringSelectMenu() && interaction.customId === 'contrat_type_offre') {
    const typeMission = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`contrat_offre_modal::${typeMission}`).setTitle('📤 Nos conditions — Contrat client');
    setTimeout(() => { interaction.message?.delete?.().catch(() => {}); }, 300);
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('client_nom').setLabel("Nom / Entreprise du client").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Famille Moreau...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection rapprochée...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Notre rémunération souhaitée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 1500$ + 500$/jour')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel('ID Discord du client').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Clic droit → Copier l\'identifiant')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails / conditions / échéance').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Échéance (ex: 2026-08-30), conditions, lieu, nb d\'agents, infos utiles...')));
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('contrat_offre_modal')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-OF-' + Date.now().toString().slice(-5);
    const emetteurICOffre = db.members[interaction.user.id]?.name || interaction.user.username;
    const typeMissionOffre = interaction.customId.includes('::') ? interaction.customId.split('::')[1] : '';
    const objetSaisiOffre = interaction.fields.getTextInputValue('objet');
    const objetFinalOffre = typeMissionOffre && typeMissionOffre !== 'Autre' ? `${typeMissionOffre} — ${objetSaisiOffre}` : objetSaisiOffre;
    const contrat = { id: contratId, type: 'offre', typeMission: typeMissionOffre, clientNom: interaction.fields.getTextInputValue('client_nom'), emetteurIC: emetteurICOffre, objet: objetFinalOffre, remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), details: interaction.fields.getTextInputValue('details') || '', dateEcheance: (interaction.fields.getTextInputValue('details') || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || null, emetteurId: interaction.user.id, emetteurNom: interaction.user.username, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    _syncContratNotion(contrat, 'en_attente').catch(() => {});
    await interaction.editReply({ content: `✅ Contrat **${contratId}** envoyé au client.` });
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📤 CONTRAT DE PRESTATION — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — OFFRE DE PRESTATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '✍️ Émis par', value: emetteurICOffre, inline: true }, { name: '📋 Objet', value: contrat.objet }, { name: '📅 Échéance', value: contrat.dateEcheance ? fmtShort(contrat.dateEcheance) : 'Aucune', inline: true }, { name: '💰 Rémunération souhaitée', value: contrat.remuneration }, { name: '📌 Statut', value: '🟡 En attente de signature', inline: true }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`signer_offre_${contratId}`).setLabel("✍️ J'accepte les termes").setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`refuser_offre_${contratId}`).setLabel('❌ Refuser').setStyle(ButtonStyle.Danger));
    const ch = guild.channels.cache.get(SALON_HARDCODED.CONTRATS) || guild.channels.cache.get(CH.CONTRATS); if (ch) await ch.send({ content: `<@${contrat.userId}> — Iron Wolf Company vous soumet un contrat.`, embeds: [embed], components: [row] });
    _posterContratForum(guild, contrat, embed).catch(() => {});
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📤 Contrat — IWC').setDescription(`L'IWC vous soumet le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}\n\nRépondez dans **#contrats**.`).setFooter({ text: 'Iron Wolf Company' })] }); } catch {}
    return;
  }

  if (interaction.isButton() && interaction.customId === 'csuivi_open') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const payload = _contratSuiviMenu();
    if (!payload) return interaction.reply({ content: "Aucun contrat enregistré pour le moment.", flags: MessageFlags.Ephemeral });
    return interaction.reply(payload);
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_import') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const n = await _importContratsDepuisNotion(interaction.guild);
    return interaction.editReply({ content: n > 0 ? `✅ ${n} contrat(s) importé(s) depuis Notion.` : "Aucun nouveau contrat à importer — tout est déjà synchronisé. 👍" });
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_archives') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const payload = _contratSuiviMenu(true);
    if (!payload) return interaction.reply({ content: "Aucun contrat archivé (honoré ou abandonné) pour le moment.", flags: MessageFlags.Ephemeral });
    return interaction.reply(payload);
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_reset') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const n = (loadDB().contrats || []).length;
    if (!n) return interaction.reply({ content: "Il n'y a aucun contrat à supprimer — c'est déjà vide. 👍", flags: MessageFlags.Ephemeral });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('csuivi_reset_go').setLabel(`Oui, supprimer les ${n} contrat(s)`).setEmoji('🗑️').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('csuivi_reset_cancel').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
    );
    return interaction.reply({ content: `⚠️ **Réinitialisation des contrats**\nCeci va **supprimer définitivement les ${n} contrat(s)** de la base. Le tableau **#planning** et le **forum des contrats** repartiront à zéro.\n\n*(À n'utiliser que pour effacer des tests. Les fiches déjà envoyées dans Notion ne sont pas touchées.)*\n\nConfirmer ?`, components: [row], flags: MessageFlags.Ephemeral });
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_reset_cancel') {
    return interaction.update({ content: "✅ Annulé — rien n'a été supprimé.", components: [] });
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_reset_go') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const dbR = loadDB();
    const n = (dbR.contrats || []).length;
    dbR.contrats = [];
    saveDB(dbR);
    try { await _updatePlanningContrats(interaction.client); } catch {}
    try { await _updateContratPanel(interaction.client); } catch {}
    return interaction.update({ content: `🗑️ **${n} contrat(s) supprimé(s).** Le tableau des échéances et le panneau sont remis à zéro. Tu peux repartir sur du propre. ✅`, components: [] });
  }
  if (interaction.isButton() && interaction.customId.startsWith('csuivi_filtre::')) {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const f = interaction.customId.split('::')[1];
    const m = _contratSuiviMenu(false, f === 'tous' ? null : f, null);
    if (!m) return interaction.update({ content: "Aucun contrat actif.", embeds: [], components: [] });
    return interaction.update({ content: m.content, embeds: m.embeds || [], components: m.components });
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_search') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const modal = new ModalBuilder().setCustomId('csuivi_search_modal').setTitle('🔍 Chercher un contrat');
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('q').setLabel('Nom du client, objet ou code').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex : Callahan')));
    return interaction.showModal(modal);
  }
  if (interaction.isModalSubmit() && interaction.customId === 'csuivi_search_modal') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const q = (interaction.fields.getTextInputValue('q') || '').trim();
    const m = _contratSuiviMenu(false, null, q);
    if (!m) return interaction.reply({ content: `Aucun contrat ne correspond à « ${q} ».`, flags: MessageFlags.Ephemeral });
    return interaction.reply(m);
  }
  if (interaction.isButton() && interaction.customId === 'csuivi_retour') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const m = _contratSuiviMenu();
    if (!m) return interaction.update({ content: "Aucun contrat actif pour le moment.", embeds: [], components: [] });
    return interaction.update({ content: m.content, embeds: m.embeds || [], components: m.components });
  }
  if (interaction.isStringSelectMenu() && interaction.customId === 'csuivi_select') {
    const c = (loadDB().contrats || []).find(x => String(x.id) === interaction.values[0]);
    if (!c) return interaction.update({ content: "❌ Contrat introuvable.", embeds: [], components: [] });
    return interaction.update(_contratSuiviPayload(c));
  }
  if (interaction.isButton() && interaction.customId.startsWith('csuivi::')) {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    const parts = interaction.customId.split('::'); const stageKey = parts[1]; const ref = parts.slice(2).join('::');
    const stageMap = { attente: 'En attente', cours: 'En cours', valide: 'Validé', honore: 'Honoré', abandon: 'Abandonné' };
    const stage = stageMap[stageKey];
    const dbX = loadDB(); const c = (dbX.contrats || []).find(x => String(x.id) === ref);
    if (!c || !stage) return interaction.reply({ content: "❌ Contrat introuvable.", flags: MessageFlags.Ephemeral });
    if (stageKey === 'honore') {
      if (c.remuVerseAuCoffre) return interaction.reply({ content: `⚠️ Ce contrat a déjà été honoré et encaissé ($${Number(c.remuVerseAuCoffre).toLocaleString('fr-FR')} versés au coffre).`, flags: MessageFlags.Ephemeral });
      const detecte = _montantDetecte(c.remuneration);
      const modal = new ModalBuilder().setCustomId(`csuivi_montant::${ref}`).setTitle(`Honorer ${ref}`.slice(0, 45));
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant à verser au coffre ($)').setStyle(TextInputStyle.Short).setRequired(true).setValue(detecte ? String(detecte) : '').setPlaceholder('Ex : 1500')));
      return interaction.showModal(modal);
    }
    c.suivi = stage; saveDB(dbX);
    _setContratSuiviNotion(c, stage).catch(() => {});
    ajouterJournalIC(interaction.guild, { type: 'contrat', emoji: '📜', titre: `Contrat ${c.id} → ${stage}`, description: String(c.objet || c.clientNom || c.commanditaire || '').slice(0, 200), auteur: interaction.user.username }).catch(() => {});
    _updateContratPanel(interaction.client).catch(() => {});
    _updatePlanningContrats(interaction.client).catch(() => {});
    return interaction.update(_contratSuiviPayload(c, `✅ Étape mise à jour : **${stage}** — synchronisé dans Notion.`));
  }
  if (interaction.isModalSubmit() && interaction.customId.startsWith('csuivi_montant::')) {
    if (!isDirection(interaction.member)) return interaction.reply({ content: "❌ Réservé à la Direction.", flags: MessageFlags.Ephemeral });
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const ref = interaction.customId.split('::')[1];
    const dbX = loadDB(); const c = (dbX.contrats || []).find(x => String(x.id) === ref);
    if (!c) return interaction.editReply({ content: "❌ Contrat introuvable." });
    if (c.remuVerseAuCoffre) return interaction.editReply({ content: "⚠️ Ce contrat a déjà été encaissé." });
    const montant = _montantDetecte(interaction.fields.getTextInputValue('montant'));
    if (!montant || montant <= 0) return interaction.editReply({ content: "❌ Montant invalide. Relance et entre un nombre (ex : 1500)." });
    const pole = (c.cc || c.type === 'confrerie' || String(c.id).startsWith('CF-')) ? 'illegal' : 'legal';
    if (!dbX.coffres) dbX.coffres = { legal: 0, illegal: 0 };
    dbX.coffres[pole] += montant;
    const solde = dbX.coffres[pole];
    c.suivi = 'Honoré'; c.remuVerseAuCoffre = montant; c.honoreAt = new Date().toISOString();
    saveDB(dbX);
    // 🧾 Trace écrite : facture automatique dans le forum des factures
    factures.creerFactureContrat?.(interaction.guild, c, { montant, par: interaction.user.username, parId: interaction.user.id }).catch(() => {});
    _setContratSuiviNotion(c, 'Honoré').catch(() => {});
    const coffreLabel = pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal';
    try { await ajouterJournalIC(interaction.guild, { type: 'tresorerie', emoji: '💵', titre: `Entrée — Coffre ${pole === 'illegal' ? 'Illégal' : 'Légal'}`, description: `Contrat **${c.id}** honoré · +$${montant.toLocaleString('fr-FR')} · ${String(c.clientNom || c.commanditaire || '')}`.slice(0, 300), auteur: interaction.user.username }); } catch {}
    try { await notionExtra.enregistrerTransactionNotion?.({ type: 'Entrée', coffre: coffreLabel, montant, objet: `Contrat ${c.id} honoré`, responsable: interaction.user.username, solde }); } catch {}
    _syncTransactionNotion({ type: 'Entrée', coffre: pole, montant, objet: `Contrat ${c.id} honoré`, responsable: interaction.user.username, solde, date: new Date().toISOString(), discordId: interaction.user.id, userId: interaction.user.id }).catch(() => {});
    _updateContratPanel(interaction.client).catch(() => {});
    _updatePlanningContrats(interaction.client).catch(() => {});
    return interaction.editReply({ content: `🏁 **Contrat ${c.id} honoré !**\n💰 **+$${montant.toLocaleString('fr-FR')}** versés au coffre ${coffreLabel}.\n💼 Nouveau solde : **$${solde.toLocaleString('fr-FR')}**\n🧾 Facture créée dans le forum (trace écrite).\n📒 Étape passée à **Honoré** (Notion + journal de bord).` });
  }
  if (interaction.isButton() && interaction.customId.startsWith('signer_offre_')) {
    const contratId = interaction.customId.replace('signer_offre_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat) { await interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral }); return; }
    if (contrat.userId !== interaction.user.id) { await interaction.reply({ content: '❌ Ce contrat ne vous est pas destiné.', flags: MessageFlags.Ephemeral }); return; }
    if (contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    const clientIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'signe', clientIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${clientIC} (${contrat.clientNom})` });
    await ajouterJournalIC(guild, { type: 'contrat', titre: `Contrat signé — ${contratId}`, description: `Client : **${contrat.clientNom}** · Mission : ${contrat.objet}`, auteur: interaction.user.username });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    const _embedContratSigne = new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT ACCEPTÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé le', value: fmtShort(new Date()), inline: true }, { name: '✍️ Client', value: contrat.clientNom || interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'signe', _embedContratSigne);
    try { const em = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (em) await em.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle(`✅ Contrat signé — ${contratId}`).setDescription(`**${contrat.clientNom}** a accepté le contrat.\n\n**Mission :** ${contrat.objet}`).setFooter({ text: 'IWC • Notification contrat' })] }); } catch {}
    interaction.user.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — IWC').setDescription(`Vous avez accepté le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Document Officiel' })] }).catch(() => {});
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('refuser_offre_')) {
    const contratId = interaction.customId.replace('refuser_offre_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.userId !== interaction.user.id || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Action impossible.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    const refuseurIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'refuse', refuseurIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: `❌ Refusé le ${fmtShort(new Date())}`, inline: true })], components: [] });
    const _embedContratRefuse = new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT REFUSÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Refusé par', value: interaction.user.username, inline: true }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'refuse', _embedContratRefuse);
    try { const em = await guild.members.fetch(contrat.emetteurId).catch(() => null); if (em) await em.send({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle(`❌ Contrat refusé — ${contratId}`).setDescription(`**${contrat.clientNom}** a refusé le contrat pour **${contrat.objet}**.`).setFooter({ text: 'IWC • Notification' })] }); } catch {}
    return;
  }

  if (interaction.isButton() && interaction.customId === 'open_contrat_emploi') {
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return; }
    const menu = new StringSelectMenuBuilder()
      .setCustomId('contrat_type_emploi')
      .setPlaceholder('Choisis le type de mission...')
      .addOptions(
        { label: 'Protection rapprochée', value: 'Protection rapprochée', emoji: '🛡️' },
        { label: 'Escorte de convoi',     value: 'Escorte de convoi',     emoji: '🐎' },
        { label: 'Surveillance / Filature', value: 'Surveillance / Filature', emoji: '👁️' },
        { label: 'Chasse de prime',       value: 'Chasse de prime',       emoji: '🎯' },
        { label: 'Récupération de dette', value: 'Récupération de dette', emoji: '💰' },
        { label: 'Intervention armée',    value: 'Intervention armée',    emoji: '⚔️' },
        { label: 'Autre (à préciser)',    value: 'Autre',                 emoji: '📦' },
      );
    await interaction.reply({ content: '📥 **Type de mission ?**\nChoisis dans la liste, le formulaire s\'ouvrira ensuite.', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'contrat_type_emploi') {
    const typeMission = interaction.values[0];
    const modal = new ModalBuilder().setCustomId(`contrat_emploi_modal::${typeMission}`).setTitle('📥 Contrat employeur — À signer');
    setTimeout(() => { interaction.message?.delete?.().catch(() => {}); }, 300);
    modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('employeur_nom').setLabel("Nom de l'employeur").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Société Moreau...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Protection du convoi...')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération proposée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 2000$ à la livraison')), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('user_id').setLabel("ID Discord de l'employeur").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder("Clic droit → Copier l'identifiant")), new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails / conditions / échéance').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800).setPlaceholder('Échéance (ex: 2026-08-30), conditions, lieu, infos utiles...')));
    await interaction.showModal(modal); return;
  }

  if (interaction.isModalSubmit() && interaction.customId.startsWith('contrat_emploi_modal')) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    if (!db.contrats) db.contrats = [];
    const contratId = 'IWC-EM-' + Date.now().toString().slice(-5);
    const signataireICEmploi = db.members[interaction.user.id]?.name || interaction.user.username;
    const typeMissionEmploi = interaction.customId.includes('::') ? interaction.customId.split('::')[1] : '';
    const objetSaisiEmploi = interaction.fields.getTextInputValue('objet');
    const objetFinalEmploi = typeMissionEmploi && typeMissionEmploi !== 'Autre' ? `${typeMissionEmploi} — ${objetSaisiEmploi}` : objetSaisiEmploi;
    const contrat = { id: contratId, type: 'emploi', typeMission: typeMissionEmploi, employeurNom: interaction.fields.getTextInputValue('employeur_nom'), emetteurIC: signataireICEmploi, objet: objetFinalEmploi, remuneration: interaction.fields.getTextInputValue('remuneration'), userId: interaction.fields.getTextInputValue('user_id').trim(), details: interaction.fields.getTextInputValue('details') || '', dateEcheance: (interaction.fields.getTextInputValue('details') || '').match(/\d{4}-\d{2}-\d{2}/)?.[0] || null, signataire: interaction.user.username, signataireId: interaction.user.id, status: 'en_attente', createdAt: new Date().toISOString() };
    db.contrats.push(contrat); saveDB(db);
    _syncContratNotion(contrat, 'en_attente').catch(() => {});
    await interaction.editReply({ content: `📋 Contrat **${contratId}** créé.` });
    const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📥 CONTRAT EMPLOYEUR — ${contratId}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  CONTRAT PROPOSÉ À IRON WOLF COMPANY\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```').addFields({ name: '🆔 Référence', value: `\`${contratId}\``, inline: true }, { name: '📅 Date', value: fmtShort(new Date()), inline: true }, { name: '✍️ Soumis par', value: signataireICEmploi, inline: true }, { name: `🏭 Employeur — ${contrat.employeurNom}`, value: contrat.dateEcheance ? `📅 Échéance : ${fmtShort(contrat.dateEcheance)}` : '—' }, { name: '💰 Rémunération', value: contrat.remuneration }, { name: '📋 Objet', value: contrat.objet }, { name: '📌 Statut', value: '🟡 En attente de notre signature', inline: true }).setFooter({ text: `Iron Wolf Company • Secrétariat officiel • ${fmtShort(new Date())}` });
    const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`signer_emploi_${contratId}`).setLabel('✍️ Signer & Accepter').setStyle(ButtonStyle.Success), new ButtonBuilder().setCustomId(`refuser_emploi_${contratId}`).setLabel('❌ Décliner').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId(`btn_rdv_creer_contrat_${contratId}`).setLabel('📅 Planifier un RDV').setStyle(ButtonStyle.Secondary));
    const ch = guild.channels.cache.get(SALON_HARDCODED.CONTRATS) || guild.channels.cache.get(CH.CONTRATS); if (ch) await ch.send({ content: `${getContratMention(guild)} — 📥 Nouveau contrat employeur à examiner.`, embeds: [embed], components: [row] });
    _posterContratForum(guild, contrat, embed).catch(() => {});
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('signer_emploi_')) {
    const contratId = interaction.customId.replace('signer_emploi_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut signer.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'signe'; contrat.signedAt = new Date().toISOString(); contrat.signedBy = interaction.user.username; saveDB(db);
    await notionExtra.ajouterContratNotion?.(contrat);
    const signataireDirIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'signe', signataireDirIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_SIGNE', { contratId, objet: contrat.objet, signe: `${signataireDirIC} — IWC` });
    await ajouterJournalIC(guild, { type: 'contrat', titre: `Contrat employeur signé — ${contratId}`, description: `Employeur : **${contrat.employeurNom}** · Mission : ${contrat.objet}`, auteur: interaction.user.username });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0x57F287).spliceFields(5, 1, { name: '📌 Statut', value: `✅ Signé le ${fmtShort(new Date())} par ${interaction.user.username}`, inline: true })], components: [] });
    const _embedEmploiSigne = new EmbedBuilder().setColor(0x57F287).setTitle(`✅ CONTRAT EMPLOYEUR SIGNÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '📅 Signé le', value: fmtShort(new Date()), inline: true }, { name: '✍️ Signé par', value: signataireDirIC, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }, { name: '💰 Rémunération', value: contrat.remuneration }).setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'signe', _embedEmploiSigne);
    try { const m = await guild.members.fetch(contrat.userId).catch(() => null); if (m) await m.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Contrat signé — IWC').setDescription(`Iron Wolf Company a **signé** le contrat **${contratId}**.\n\n**Mission :** ${contrat.objet}\n**Rémunération :** ${contrat.remuneration}`).setFooter({ text: 'IWC • Notification' })] }); } catch {}
    return;
  }

  if (interaction.isButton() && interaction.customId.startsWith('refuser_emploi_')) {
    const contratId = interaction.customId.replace('refuser_emploi_', ''); const contrat = (db.contrats || []).find(c => c.id === contratId);
    if (!contrat || contrat.status !== 'en_attente') { await interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral }); return; }
    if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Seule la Direction peut décliner.', flags: MessageFlags.Ephemeral }); return; }
    contrat.status = 'refuse'; contrat.refusedAt = new Date().toISOString(); saveDB(db);
    const refuseurDirIC = db.members[interaction.user.id]?.name || interaction.user.username;
    _syncContratNotion(contrat, 'refuse', refuseurDirIC).catch(() => {});
    await sendLog(guild, 'CONTRAT_REFUSE', { contratId, objet: contrat.objet });
    await interaction.update({ embeds: [EmbedBuilder.from(interaction.message.embeds[0]).setColor(0xED4245).spliceFields(5, 1, { name: '📌 Statut', value: `❌ Décliné le ${fmtShort(new Date())}`, inline: true })], components: [] });
    const _embedEmploiRefuse = new EmbedBuilder().setColor(0xED4245).setTitle(`❌ CONTRAT EMPLOYEUR DÉCLINÉ — ${contratId}`).addFields({ name: '🆔 Réf', value: `\`${contratId}\``, inline: true }, { name: '👤 Décliné par', value: interaction.user.username, inline: true }, { name: '🏭 Employeur', value: contrat.employeurNom }, { name: '📋 Mission', value: contrat.objet }).setFooter({ text: `IWC • ${fmtShort(new Date())}` });
    await archiverContratReponses(guild, contrat, 'refuse', _embedEmploiRefuse);
    return;
  }
}); // fin interactionCreate

client.once('clientReady', async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);
  console.log('🏷️  VERSION : 5.2 — 15 juin 2026 (économie RP : portefeuille/payer/argent + parrainage des nouveaux)');
  client.user.setActivity('la meute • IWC 1895', { type: ActivityType.Watching });
  try { rumeurs.init?.(client); } catch (e) { console.log('⚠️ rumeurs.init:', e.message); }
  try { reseau.init?.(client); } catch (e) { console.log('⚠️ reseau.init:', e.message); }
  await restaurerDepuisGitHub();
  for (const guild of client.guilds.cache.values()) {
    await registerSlashCommands(guild).catch(e => console.log('registerSlashCommands error:', e.message));
    await autoSetup(guild).catch(e => console.log('autoSetup error:', e.message));
    await traque.ensureWantedPanel?.(guild).catch(() => {});
    await buildMembresDiscordMap(guild).catch(() => {});
    await _cacheInvites(guild).catch(() => {});
  }
  try { await monitoring.autoCheck?.(client, client._cmdNames); } catch {}
  for (const guild of client.guilds.cache.values()) {
    await notionExtra.envoyerRappelsFiches?.(guild).catch(() => {});
  }

  cron.schedule('* * * * *', async () => {
    for (const g of client.guilds.cache.values()) await notionV5.checkOpsProgrammees?.(g).catch(() => {});
  });
  cron.schedule('*/5 * * * *', async () => {
    for (const g of client.guilds.cache.values()) await checkAgenda(g).catch(() => {});
    for (const g of client.guilds.cache.values()) await rdvplus.checkRappelsClients?.(g).catch(() => {});
  });
  cron.schedule('* * * * *', async () => {
    try { await _importContratsDepuisNotion(client.guilds.cache.first()); } catch {}
  });
  cron.schedule('*/5 * * * *', async () => { try { await _updateContratPanel(client); } catch {} try { await _updatePlanningContrats(client); } catch {} });
  cron.schedule('0 18 * * *', async () => {
    try { const u = await client.users.fetch('944208797084311583').catch(() => null); if (u) await u.send({ embeds: [_genererRecapEmbed(loadDB())] }).catch(() => {}); } catch {}
  }, { timezone: 'Europe/Paris' });
  cron.schedule('*/15 * * * *', async () => {
    for (const g of client.guilds.cache.values()) await syncRegistreNotion(g).catch(() => {});
  });
  // Purge auto des opérations terminées après 24h de visibilité (supprime le post/forum + le fil)
  cron.schedule('*/15 * * * *', async () => {
    try {
      const db = loadDB();
      if (!Array.isArray(db.operations) || db.operations.length === 0) return;
      const now = Date.now();
      const restantes = [];
      let changed = false;
      for (const op of db.operations) {
        if (op.status === 'terminee' && op.deleteAt && now >= op.deleteAt) {
          try {
            // Forum : op.threadId == le post lui-même (un thread) → le supprimer efface tout
            if (op.threadId) {
              const th = await client.channels.fetch(op.threadId).catch(() => null);
              if (th && typeof th.delete === 'function') await th.delete('Opération terminée — purge auto 24h').catch(() => {});
            }
            // Salon texte : supprimer aussi le message d'ancrage s'il est distinct du fil
            if (op.channelId && op.msgId && op.channelId !== op.threadId) {
              const ch = await client.channels.fetch(op.channelId).catch(() => null);
              if (ch && ch.messages) { const m = await ch.messages.fetch(op.msgId).catch(() => null); if (m) await m.delete().catch(() => {}); }
            }
          } catch {}
          changed = true; // retirée de la liste active
        } else {
          restantes.push(op);
        }
      }
      if (changed) { db.operations = restantes; saveDB(db); }
    } catch (e) { console.log('⚠️ purge opérations terminées:', e.message); }
  });
  cron.schedule('*/30 * * * *', async () => {
    for (const g of client.guilds.cache.values()) {
      await notionExtra.envoyerRappelsFiches?.(g).catch(() => {});
      await notionModules.checkAlerteCoffre?.(g).catch(() => {});
    }
  });
  cron.schedule('0 * * * *', async () => {
    for (const g of client.guilds.cache.values()) {
      await updateDashboard(g).catch(() => {});
      await notionExtra.checkFichesCompletees?.(g).catch(() => {});
      await notionExtra.checkEcheancesContrats?.(g).catch(() => {});
      await notionV3.checkInactivite?.(g).catch(() => {});
      await notionV3.updateHierarchieEmbed?.(g).catch(() => {});
      await notionV3.checkAffairesTimeout?.(g).catch(() => {});
      await contratsConf.checkEcheances?.(g).catch(() => {});
      await _checkRetoursAbsence(g).catch(() => {});
      await updateDirectionPanel(g).catch(() => {});
      try {
        const db = loadDB(); const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
        const before = (db.transactions || []).length;
        db.transactions = (db.transactions || []).filter(t => new Date(t.date || t.createdAt || 0).getTime() > cutoff);
        if (db.transactions.length < before) { saveDB(db); console.log(`🧹 Purge: ${before - db.transactions.length} transactions > 90j supprimées`); }
      } catch {}
      await notionV4.checkRecrutementSuivi?.(g).catch(() => {});
      await notionV4.checkEcheancesContrats?.(g).catch(() => {});
      try {
        const db = loadDB(); const demain = new Date(); demain.setDate(demain.getDate() + 1); const ds = demain.toISOString().split('T')[0];
        for (const ct of (db.contrats || [])) {
          if (ct.status !== 'signe' || !ct.dateEcheance || ct.notifExpirDemain) continue;
          if (ct.dateEcheance.startsWith(ds)) { ct.notifExpirDemain = true; if (ct.userId) await envoyerDMRecap(g, ct.userId, 'contrat', { id: ct.id, objet: 'Expire demain: ' + (ct.objet||'') }).catch(() => {}); }
        }
        saveDB(db);
      } catch(e) { console.log('notifExpirDemain error:', e.message); }
      await notionV4.checkOperationsTimeout?.(g).catch(() => {});
    }
    await sauvegarderSurGitHub().catch(() => {});
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 */2 * * *', async () => {
    for (const g of client.guilds.cache.values()) await notionV4.checkDashboardAlertes?.(g).catch(() => {});
  });
  cron.schedule('0 9 * * *',  async () => { for (const g of client.guilds.cache.values()) await postDailyAgenda(g).catch(() => {}); }, { timezone: 'Europe/Paris' });

  // ── Briefing renseignement quotidien (20h) ──
  cron.schedule('0 20 * * *', async () => {
    for (const g of client.guilds.cache.values()) await postBriefingRenseignement(g).catch(() => {});
  }, { timezone: 'Europe/Paris' });

  // ── Archivage automatique des vieilles notes (chaque nuit à 3h) ──
  cron.schedule('0 3 * * *', async () => {
    try {
      const db = loadDB();
      const notes = db.notesTerrain || [];
      const limite = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 jours
      const recentes = notes.filter(n => new Date(n.date).getTime() >= limite);
      const vieilles = notes.filter(n => new Date(n.date).getTime() < limite);
      if (vieilles.length > 0) {
        if (!db.notesArchive) db.notesArchive = [];
        db.notesArchive.push(...vieilles);
        if (db.notesArchive.length > 1000) db.notesArchive = db.notesArchive.slice(-1000);
        db.notesTerrain = recentes;
        saveDB(db);
        console.log(`📦 Archivage : ${vieilles.length} note(s) > 30j déplacée(s) dans les archives`);
      }
    } catch (e) { console.log('❌ Archivage notes:', e.message); }
  }, { timezone: 'Europe/Paris' });
  cron.schedule('0 12 * * *', async () => { for (const g of client.guilds.cache.values()) await autoKickVisiteurs(g).catch(() => {}); }, { timezone: 'Europe/Paris' });

  // [CORRECTION] Résumés hebdo → #journal-de-bord via ajouterJournalIC
  cron.schedule('0 8 * * 1', async () => {
    for (const g of client.guilds.cache.values()) {
      // Résumé affaires → uniquement dans #journal-de-bord
      const affairesJournalCh = g.channels.cache.get('1508756535407542372');
      if (affairesJournalCh) await notionV3.postResumeAffaires?.(g, affairesJournalCh).catch(() => {});
    }
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 9 * * 1', async () => {
    for (const g of client.guilds.cache.values()) {
      // Résumé journal IC → #journal-de-bord (ID hardcodé forcé)
      const journalCh = g.channels.cache.get('1508756535407542372');
      if (journalCh) await notionV5.posterResumeJournalIC?.(g, journalCh).catch(() => {});
    }
  }, { timezone: 'Europe/Paris' });

  cron.schedule('0 20 * * 0', async () => { for (const g of client.guilds.cache.values()) await notionExtra.postStatsHebdo?.(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
  cron.schedule('0 20 * * 5', async () => { for (const g of client.guilds.cache.values()) await envoyerRapportDirection(g).catch(() => {}); }, { timezone: 'Europe/Paris' });
});

const http = require('http');
const PORT = process.env.PORT || 3000;

const NOTE_SECRET = process.env.NOTE_SECRET || 'iwc-secret-1895';

http.createServer(async (req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Keepalive
  if (req.method === 'GET' && req.url === '/') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    res.end('IWC Bot OK');
    return;
  }

  // Endpoint note rapide
  if (req.method === 'POST' && req.url === '/api/note-rapide') {
    // Auth
    const auth = req.headers['authorization'];
    if (auth !== `Bearer ${NOTE_SECRET}`) {
      res.writeHead(401); res.end('Unauthorized'); return;
    }
    let body = '';
    req.on('data', d => body += d);
    req.on('end', async () => {
      try {
        const data = JSON.parse(body);
        const { cible, lieu, info, priorite, agent } = data;
        if (!info) { res.writeHead(400); res.end('info requis'); return; }
        // Trouver le salon #informateurs
        const guild = client.guilds.cache.first();
        if (!guild) { res.writeHead(500); res.end('Guild introuvable'); return; }
        const infosCh = guild.channels.cache.get(SALON_HARDCODED.INFORMATEURS);
        if (!infosCh) { res.writeHead(500); res.end('Salon introuvable'); return; }

        // Couleur selon priorité
        const colors = { urgente: 0xED4245, importante: 0xFFA500, normale: 0x8B1A1A };
        const color = colors[priorite] || 0x8B1A1A;
        const prioLabel = { urgente: '🔴 URGENTE', importante: '🟡 Importante', normale: '⬜ Normale' }[priorite] || '⬜ Normale';
        const heure = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/Paris' });

        const fields = [];
        if (cible) fields.push({ name: '🎯 Cible', value: cible, inline: true });
        if (lieu)  fields.push({ name: '📍 Lieu',  value: lieu,  inline: true });
        fields.push({ name: '📋 Information', value: info, inline: false });

        const embed = new EmbedBuilder()
          .setColor(color)
          .setAuthor({ name: `🕵️ Rapport — ${agent || 'Agent'} · ${heure}` })
          .addFields(...fields)
          .setFooter({ text: `IWC · Priorité : ${prioLabel}` })
          .setTimestamp();

        // Chercher ou créer un thread pour cette cible
        let thread = null;
        if (cible) {
          const threadName = `🎯 ${cible}`;
          // Chercher thread actif
          await infosCh.threads.fetchActive().catch(() => null);
          thread = infosCh.threads.cache.find(t => t.name === threadName);
          // Chercher thread archivé
          if (!thread) {
            const archived = await infosCh.threads.fetchArchived().catch(() => null);
            if (archived) thread = archived.threads.find(t => t.name === threadName);
          }
          // Créer si inexistant
          if (!thread) {
            try {
              thread = await infosCh.threads.create({
                name: threadName,
                autoArchiveDuration: 10080,
                reason: `Dossier informateur: ${cible}`,
              });
              // Message d'en-tête dans le thread
              await thread.send({ embeds: [new EmbedBuilder()
                .setColor(0x8B1A1A)
                .setTitle(`🎯 Dossier — ${cible}`)
                .setDescription('*Toutes les informations concernant cette cible sont regroupées ici.*')
                .setFooter({ text: 'IWC · La Confrérie · Informateurs' })
              ]});
            } catch(e) { console.log('❌ Thread création:', e.message); }
          }
          // Désarchiver si nécessaire
          if (thread?.archived) await thread.setArchived(false).catch(() => {});
        }

        // Envoyer l'embed
        if (thread) {
          await thread.send({ embeds: [embed] });
        } else {
          await infosCh.send({ embeds: [embed] });
        }

        console.log(`✅ Note rapide reçue — cible: ${cible || '—'} · agent: ${agent || '—'}`);
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, thread: thread?.name || null }));
      } catch(e) {
        console.log('❌ /api/note-rapide error:', e.message);
        res.writeHead(500); res.end(e.message);
      }
    });
    return;
  }

  res.writeHead(404); res.end('Not found');
}).listen(PORT, () => console.log(`🌐 Serveur keepalive en écoute sur le port ${PORT}`));

async function handleProfilEnhanced(interaction) {
  await interaction.deferReply();
  const cible = interaction.options?.getUser('membre') || interaction.user;
  const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
  const db = loadDB(); const data = db.members[cible.id];
  let ficheNotion = null;
  if (process.env.NOTION_TOKEN && process.env.NOTION_FICHES_DB) {
    try {
      const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_FICHES_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: cible.id } }, page_size: 1 }) });
      const d = await res.json(); ficheNotion = d.results?.[0];
    } catch {}
  }
  const nomPerso = ficheNotion?.properties?.['Nom du personnage']?.title?.[0]?.plain_text || data?.name || cible.username;
  const profession = ficheNotion?.properties?.['Profession']?.rich_text?.[0]?.plain_text || '—';
  const reputation = ficheNotion?.properties?.['Réputation']?.rich_text?.[0]?.plain_text || '—';
  const pole = ficheNotion?.properties?.['Pôle']?.select?.name || (data?.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal');
  const rang = data?.rang || membre?.roles.cache.filter(r => !r.managed && r.name !== '@everyone').sort((a, b) => b.position - a.position).first()?.name || '—';
  const statut = data?.status || 'actif';
  const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', parti: '🚪', visiteur: '👁️' }[statut] || '❓';
  const color = pole.includes('Illégal') ? 0x8B1A1A : 0x3B82F6;
  const contratsSigned = (db.contrats || []).filter(c => c.status === 'signe' && (c.emetteurId === cible.id || c.signataireId === cible.id)).length;
  const opsHisto = await notionV4.getHistoriqueOpsProfilMembre?.(cible.id, cible.username) || null;
  const embed = new EmbedBuilder().setColor(color).setAuthor({ name: pole.includes('Illégal') ? '🔒 La Confrérie' : '⚖️ Iron Wolf Company', iconURL: interaction.guild.iconURL() || undefined }).setTitle(`👤 ${nomPerso}`).setThumbnail(cible.displayAvatarURL({ size: 256 })).addFields({ name: '🎖️ Grade', value: rang, inline: true }, { name: '📂 Pôle', value: pole, inline: true }, { name: `${statutEmoji} Statut`, value: statut.charAt(0).toUpperCase() + statut.slice(1), inline: true });
  if (profession !== '—') embed.addFields({ name: '💼 Profession', value: profession, inline: true });
  if (reputation !== '—') embed.addFields({ name: '⭐ Réputation', value: reputation, inline: true });
  const daysSinceActivity = data?.lastActivity ? Math.floor((Date.now() - new Date(data.lastActivity).getTime()) / 86400000) : null;
  embed.addFields({ name: '📅 Dernière activité', value: data?.lastActivity ? `${fmtShort(data.lastActivity)} *(${daysSinceActivity}j)*` : '—', inline: true }, { name: '📜 Contrats', value: `**${contratsSigned}** signé(s)`, inline: true }, { name: '👤 Discord', value: `<@${cible.id}>`, inline: true });
  if (opsHisto) embed.addFields({ name: '🎯 Dernières opérations', value: opsHisto, inline: false });
  const threadUrl = ficheNotion?.properties?.['Thread Discord']?.rich_text?.[0]?.plain_text;
  if (threadUrl?.startsWith('http')) embed.addFields({ name: '📋 Fiche complète', value: `[Voir le thread](${threadUrl})`, inline: true });
  embed.setFooter({ text: `IWC • Profil • ${new Date().toLocaleDateString('fr-FR')}` }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

// Villes RDR2 pour le menu opérations
const VILLES_RDR2 = [
  { label: 'Saint Denis', value: 'Saint Denis', description: 'Grande ville du sud — Lemoyne' },
  { label: 'Valentine', value: 'Valentine', description: 'Ville du nord — New Hanover' },
  { label: 'Armadillo', value: 'Armadillo', description: 'Ville désertique — New Austin' },
  { label: 'Annesburg', value: 'Annesburg', description: 'Ville minière du nord-est' },
  { label: 'Strawberry', value: 'Strawberry', description: 'Ville des montagnes — West Elizabeth' },
  { label: 'Emerald Ranch', value: 'Emerald Ranch', description: 'Ranch à l\'est — Heartlands' },
  { label: 'Tumbleweed', value: 'Tumbleweed', description: 'Ville fantôme — Gaptooth Ridge' },
  { label: 'Lagras', value: 'Lagras', description: 'Village des marais — Bluewater Marsh' },
  { label: 'Flatneck Station', value: 'Flatneck Station', description: 'Station ferroviaire' },
  { label: 'Roanoke Ridge', value: 'Roanoke Ridge', description: 'Région sauvage du nord-est' },
  { label: 'Tall Trees', value: 'Tall Trees', description: 'Forêt dense — West Elizabeth' },
  { label: 'Rhodes', value: 'Rhodes', description: 'Ville du comté de Lemoyne' },
  { label: 'Blackwater', value: 'Blackwater', description: 'Ville moderne — West Elizabeth' },
  { label: 'Thieves Landing', value: 'Thieves Landing', description: 'Port des hors-la-loi' },
  { label: 'Banque Saint Denis', value: 'Banque Saint Denis', description: 'Cible principale — Saint Denis' },
  { label: 'Banque Valentine', value: 'Banque Valentine', description: 'Cible principale — Valentine' },
  { label: 'Train en mouvement', value: 'Train en mouvement', description: 'Attaque / Braquage de train' },
  { label: 'Port fluvial', value: 'Port fluvial', description: 'Port ou convoi maritime' },
  { label: 'Autre lieu', value: 'Autre', description: 'Lieu personnalisé à préciser' },
];

async function _ouvrirModalOpCreer(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  // Étape 1 : choisir la ville
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🎯 Nouvelle Opération — Étape 1/2').setDescription('**Choisissez le lieu de l\'opération**')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('op_lieu_select')
        .setPlaceholder('📍 Sélectionner un lieu RDR2...')
        .addOptions(VILLES_RDR2)
    )],
  });
}

async function _handleOpLieuSelect(interaction) {
  const lieu = interaction.values[0];
  const lieuEnc = encodeURIComponent(lieu);
  const modal = new ModalBuilder().setCustomId(`modal_op_creer_${lieuEnc}`).setTitle(`🎯 Opération — ${lieu === 'Autre' ? 'Lieu à préciser' : lieu}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('nom').setLabel("Nom de l'opération").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Opération Lumière Noire, Braquage Fleeca...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('lieu_detail').setLabel(lieu === 'Autre' ? 'Lieu précis' : `Détail du lieu (optionnel)`).setStyle(TextInputStyle.Short).setRequired(lieu === 'Autre').setValue(lieu !== 'Autre' ? lieu : '').setPlaceholder(`Ex: Entrepôt nord de ${lieu}...`)
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('objectif').setLabel('Objectif').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Neutraliser les gardes, Récupérer le butin...')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('pole').setLabel('Pôle : légal ou illégal').setStyle(TextInputStyle.Short).setRequired(true).setValue('illégal').setPlaceholder('légal ou illégal')
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder().setCustomId('details').setLabel('Équipe / Notes (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Membres impliqués, matériel nécessaire, heure prévue...')
    ),
  );
  await interaction.showModal(modal);
}

async function _validerModalOpCreer(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild; const db = loadDB();
  const nom        = interaction.fields.getTextInputValue('nom').trim();
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim();
  // Récupérer la ville depuis le customId (modal_op_creer_VILLE_ENCODEE)
  const lieuVille  = decodeURIComponent(interaction.customId.replace('modal_op_creer_', ''));
  const lieu       = lieuDetail || lieuVille || '—';
  const objectif   = interaction.fields.getTextInputValue('objectif').trim();
  const poleRaw    = interaction.fields.getTextInputValue('pole').trim().toLowerCase();
  const details    = interaction.fields.getTextInputValue('details').trim() || '—';
  const pole     = poleRaw.includes('lég') || poleRaw.includes('leg') ? 'legal' : 'illegal';
  const createur = db.members[interaction.user.id]?.name || interaction.user.username;

  const op = {
    id: Date.now().toString(),
    name: nom, lieu, objectif,
    equipe: details, pole,
    createdBy: createur,
    createdById: interaction.user.id,
    participants: [], status: 'preparation',
    createdAt: new Date().toISOString(),
  };
  if (!db.operations) db.operations = [];
  db.operations.push(op);

  // Sync Notion
  let notionPageId = null;
  if (process.env.NOTION_TOKEN && process.env.NOTION_OPERATIONS_DB) {
    try {
      const res = await fetch('https://api.notion.com/v1/pages', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
        body: JSON.stringify({ parent: { database_id: process.env.NOTION_OPERATIONS_DB }, properties: {
          'Nom': { title: [{ text: { content: nom } }] },
          'Lieu IC': { rich_text: [{ text: { content: lieu } }] },
          'Objectif': { rich_text: [{ text: { content: objectif } }] },
          'Pôle': { select: { name: pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } },
          'Statut': { select: { name: '🟡 En préparation' } },
          'Notes': { rich_text: [{ text: { content: details.slice(0, 2000) } }] },
          'Type': { select: { name: pole === 'legal' ? 'Légal' : 'Illégal' } },
          'Date prévue': { date: { start: new Date().toISOString().split('T')[0] } },
        }})
      });
      const data = await res.json();
      notionPageId = data.id;
      console.log(`✅ Opération Notion créée: ${nom}`);
    } catch(e) { console.log('❌ Notion op créer:', e.message); }
  }
  op.notionPageId = notionPageId;
  saveDB(db);

  await sendLog(guild, 'OPERATION', { nom: op.name, lieu: op.lieu, equipe: op.equipe, statut: '🟡 En préparation' });
  await ajouterJournalIC(guild, { type: 'operation', titre: `Nouvelle opération — ${nom}`, description: `📍 ${lieu} · ${objectif} · Pôle : ${pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal'}`, auteur: createur });

  const embed = new EmbedBuilder().setColor(0xFFA500)
    .setTitle(`🎯 OPÉRATION — ${nom}`)
    .setDescription(`*Créée par **${createur}** · ${fmtShort(new Date())}*`)
    .addFields(
      { name: '📌 Statut', value: '🟡 En préparation', inline: true },
      { name: '🗂️ Pôle', value: pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal', inline: true },
      { name: '🆔 ID', value: `\`${op.id}\``, inline: true },
      { name: '📍 Lieu', value: lieu, inline: true },
      { name: '🎯 Objectif', value: objectif, inline: true },
      { name: '👥 Participants (0)', value: '*Clique ✋ pour rejoindre*', inline: false },
      { name: '📋 Détails', value: details, inline: false },
      ...(notionPageId ? [{ name: '🔗 Notion', value: `[Voir la fiche](https://notion.so/${notionPageId.replace(/-/g, '')})`, inline: true }] : []),
    )
    .setFooter({ text: `IWC • Opération • ${fmtShort(new Date())}` })
    .setTimestamp();

  const rowP = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_participer_${op.id}`).setLabel('✋ Je participe').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`op_retrait_${op.id}`).setLabel('🚪 Me retirer').setStyle(ButtonStyle.Secondary),
  );
  const rowG = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_encours_${op.id}`).setLabel('🟢 Lancer').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`op_terminee_${op.id}`).setLabel('✅ Terminer').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`op_annulee_${op.id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
  );
  const rowModif = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`op_modifier_${op.id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Secondary),
  );

  const opsCh = guild.channels.cache.get(SALON_IDS.OPERATIONS) || getChById(guild, 'OPERATIONS', 'operations');
  if (opsCh) {
    const _ridOp2 = _poleRoleId(guild, pole);
    const mention = _ridOp2 ? `<@&${_ridOp2}>` : '';
    await opsCh.send({ content: `${mention} — 🎯 Nouvelle opération **${nom}** · Inscrivez-vous ci-dessous.`, embeds: [embed], components: [rowP, rowG, rowModif], allowedMentions: { parse: [], roles: _ridOp2 ? [_ridOp2] : [] } });
  }
  await interaction.editReply({ content: `✅ Opération **${nom}** créée${notionPageId ? ' et synchronisée avec Notion' : ''}.` });
}

async function _ouvrirModalOpProgrammee(interaction) {
  if (!interaction.member?.roles.cache.some(r => ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier'].some(n => r.name.includes(n)))) {
    return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  }
  const modal = new ModalBuilder().setCustomId('modal_op_programmee').setTitle('🕐 Programmer une opération');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel("Nom de l'opération").setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Braquage Fleeca Grapeseed')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_heure').setLabel('Date et heure de lancement').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Fleeca Grapeseed...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Détails (Objectif / Pôle: légal ou illégal)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Objectif: Neutraliser les gardes\nPôle: illégal')),
  );
  await interaction.showModal(modal);
}

async function _notionPatch(pageId, properties) {
  if (!process.env.NOTION_TOKEN) return;
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ properties }) }).catch(e => console.log('❌ _notionPatch error:', e.message));
}
async function _notionCreate(dbId, properties) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: dbId }, properties }) }).catch(e => { console.log('❌ _notionCreate error:', e.message); return null; });
  return res ? await res.json().catch(() => null) : null;
}
async function _notionFindByDiscordId(dbId, discordId) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  return data?.results?.[0] || null;
}

async function _syncSurnomNotion(message) {
  try {
    const lines = message.content.split('\n');
    const get = k => { const l = lines.find(l => l.toUpperCase().includes(k.toUpperCase()) && l.includes(':')); return l ? l.split(':').slice(1).join(':').trim() : ''; };
    const nomIC = get('NOM IC'); const surnomIC = get('SURNOM IC'); const appart = get('APPARTENANCE');
    const userId = message.discordId || message.author?.id;
    const pseudoDiscord = message.pseudoDiscord || message.author?.username || '';
    if (!userId) return;
    let page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, userId);
    if (!page && process.env.NOTION_TOKEN && process.env.NOTION_MEMBRES_DB) {
      const created = await _notionCreate(process.env.NOTION_MEMBRES_DB, { 'Nom': { title: [{ text: { content: nomIC || pseudoDiscord } }] }, 'Discord ID': { rich_text: [{ text: { content: userId } }] }, 'Pseudo': { rich_text: [{ text: { content: pseudoDiscord } }] } });
      page = created; console.log(`✅ Nouveau membre créé dans Notion : ${nomIC}`);
    }
    if (!page) { if (typeof message.react === 'function') await message.react('⚠️').catch(() => {}); return; }
    const props = {};
    if (nomIC)         props['Personnage']        = { rich_text: [{ text: { content: nomIC } }] };
    if (surnomIC)      props['Surnom']             = { rich_text: [{ text: { content: surnomIC } }] };
    if (pseudoDiscord) props['Pseudo']             = { rich_text: [{ text: { content: pseudoDiscord } }] };
    if (userId)        props['Discord ID']         = { rich_text: [{ text: { content: userId } }] };
    if (appart)        props['Pôle']               = { select: { name: appart.toLowerCase().includes('ill') ? '🔒 Illégal' : '⚖️ Légal' } };
    props['Dernière activité'] = { date: { start: new Date().toISOString().split('T')[0] } };
    await _notionPatch(page.id, props);
    if (typeof message.react === 'function') await message.react('✅').catch(() => {});
    console.log(`✅ Identité IC synced : ${nomIC} — ID: ${userId}`);
  } catch (e) { console.log('❌ _syncSurnomNotion error:', e.message); }
}

async function _syncCandidatureNotion(cand, statut, validePar) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_RECRUTEMENT_DB) return;
  const DB = process.env.NOTION_RECRUTEMENT_DB;
  const statutMap = { 'reçue': '🟡 En attente', 'recue': '🟡 En attente', 'acceptee': '✅ Acceptée', 'refusee': '❌ Refusée' };
  const props = { 'Nom du personnage': { title: [{ text: { content: cand.nomPerso || '—' } }] }, 'Statut': { select: { name: statutMap[statut] || statut } }, 'Type': { select: { name: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } }, 'Discord ID': { rich_text: [{ text: { content: cand.userId || cand.discordId || '—' } }] }, 'Date candidature': { date: { start: new Date(cand.receivedAt || Date.now()).toISOString().split('T')[0] } } };
  if (validePar) { props['Décidé par'] = { rich_text: [{ text: { content: validePar } }] }; props['Date décision'] = { date: { start: new Date().toISOString().split('T')[0] } }; }
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Nom du personnage', title: { equals: cand.nomPerso || '' } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null;
  const existing = data?.results?.[0];
  if (existing) await _notionPatch(existing.id, props); else await _notionCreate(DB, props);
  console.log(`✅ Candidature Notion : ${cand.nomPerso} → ${statut}`);
}

async function _syncMembreNotion(discordId, updates) {
  const REGISTRE_DB = process.env.NOTION_MEMBRES_DB || NOTION_MEMBRES_DB;
  const page = await _notionFindByDiscordId(REGISTRE_DB, discordId); if (!page) return;
  const props = {};
  if (updates.nom)      props['Personnage'] = { rich_text: [{ text: { content: String(updates.nom) } }] };
  if (updates.username) props['Nom'] = { title: [{ text: { content: String(updates.username) } }] };
  if (updates.rang) props['Rang'] = { select: { name: updates.rang } };
  if (updates.status) { const map = { actif: '✅ Actif', absent: '⚠️ Absent', inactif: '💤 Inactif', parti: '🚪 Parti', visiteur: '👁️ Visiteur' }; props['Statut'] = { select: { name: map[updates.status] || updates.status } }; }
  if (updates.lastActivity) props['Dernière activité'] = { date: { start: new Date(updates.lastActivity).toISOString().split('T')[0] } };
  if (Object.keys(props).length) { await _notionPatch(page.id, props); console.log(`✅ Registre MàJ : ${discordId}`); }
}

// ---- Gestion de l'étape (Suivi) d'un contrat depuis Discord + crédit du coffre ----
function _montantDetecte(str) {
  const s = String(str || '').replace(/\s/g, '');
  const m = s.match(/\d+(?:[.,]\d{3})*/);
  if (!m) return null;
  const n = parseInt(m[0].replace(/[.,]/g, ''), 10);
  return Number.isFinite(n) ? n : null;
}
function _suiviDepuisStatut(c) {
  if (c && c.suivi) return c.suivi;
  const s = c ? c.status : null;
  if (s === 'signe' || s === 'actif') return 'En cours';
  if (s === 'refuse' || s === 'echouee') return 'Abandonné';
  if (s === 'reussie') return 'Validé';
  return 'En attente';
}
function _contratSuiviPayload(c, note) {
  const stade = c.suivi || _suiviDepuisStatut(c);
  const emo = { 'En attente': '🟡', 'En cours': '🔵', 'Validé': '✅', 'Honoré': '🏁', 'Abandonné': '✖️' }[stade] || '⚪';
  const pole = (c.cc || c.type === 'confrerie' || String(c.id).startsWith('CF-')) ? '🔒 Confrérie (coffre illégal)' : '⚖️ IWC (coffre légal)';
  const ech = c.dateEcheance ? (() => { const d = new Date(c.dateEcheance); return isNaN(d.getTime()) ? String(c.dateEcheance) : d.toLocaleDateString('fr-FR'); })() : '—';
  const emisPar = c.emetteurIC || c.emetteurNom || (c.emetteurId ? `<@${c.emetteurId}>` : '—');
  const signePar = c.signePar || (c.status === 'signe' && c.userId ? `<@${c.userId}>` : (c.status === 'signe' ? (c.clientNom || '—') : '—'));
  const cree = c.createdAt ? fmtShort(new Date(c.createdAt)) : '—';
  const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📜 Contrat ${c.id}`).addFields(
    { name: 'Objet', value: String(c.objet || '—').slice(0, 1024), inline: false },
    { name: 'Client / Commanditaire', value: String(c.clientNom || c.commanditaire || '—').slice(0, 256), inline: true },
    { name: 'Rémunération', value: String(c.remuneration || '—').slice(0, 256), inline: true },
    { name: 'Pôle', value: pole, inline: true },
    { name: '📅 Échéance', value: ech, inline: true },
    { name: '🗓️ Créé le', value: cree, inline: true },
    { name: '✍️ Émis par', value: String(emisPar).slice(0, 256), inline: true },
    { name: '🖋️ Signé par', value: String(signePar).slice(0, 256), inline: true },
    { name: 'Étape actuelle', value: `${emo} **${stade}**`, inline: true },
  );
  const montant = _montantDetecte(c.remuneration);
  if (!c.remuVerseAuCoffre && montant) embed.addFields({ name: '💰 Montant détecté', value: `$${montant.toLocaleString('fr-FR')} (irait au coffre si tu honores)`, inline: false });
  if (c.remuVerseAuCoffre) embed.addFields({ name: '💰 Déjà encaissé', value: `$${Number(c.remuVerseAuCoffre).toLocaleString('fr-FR')} versés au coffre`, inline: false });
  if (note) embed.setDescription(note);
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`csuivi::attente::${c.id}`).setLabel('🟡 En attente').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`csuivi::cours::${c.id}`).setLabel('🔵 En cours').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`csuivi::valide::${c.id}`).setLabel('✅ Validé').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`csuivi::honore::${c.id}`).setLabel('🏁 Honoré (encaisser)').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`csuivi::abandon::${c.id}`).setLabel('✖️ Abandonné').setStyle(ButtonStyle.Danger),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('csuivi_retour').setLabel('↩️ Retour à la liste').setStyle(ButtonStyle.Secondary),
  );
  return { content: '', embeds: [embed], components: [row1, row2, row3] };
}
function _contratSuiviMenu(archived, filtre, recherche) {
  const clos = ['Honoré', 'Abandonné'];
  const now = new Date();
  const emo = { 'En attente': '🟡', 'En cours': '🔵', 'Validé': '✅', 'Honoré': '🏁', 'Abandonné': '✖️' };
  const stadeOf = c => c.suivi || _suiviDepuisStatut(c);
  const joursEch = c => { if (!c.dateEcheance) return Infinity; const d = new Date(c.dateEcheance); if (isNaN(d.getTime())) return Infinity; return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000); };
  const ordre = { 'En attente': 0, 'En cours': 1, 'Validé': 2, 'Honoré': 3, 'Abandonné': 4 };
  let liste = (loadDB().contrats || []).slice().filter(c => { const s = stadeOf(c); return archived ? clos.includes(s) : !clos.includes(s); });
  if (filtre) liste = liste.filter(c => stadeOf(c) === filtre);
  if (recherche) { const q = recherche.toLowerCase(); liste = liste.filter(c => [c.clientNom, c.commanditaire, c.objet, c.id].some(v => String(v || '').toLowerCase().includes(q))); }
  liste.sort((a, b) => { const ja = joursEch(a), jb = joursEch(b); if (ja !== jb) return ja - jb; const sa = ordre[stadeOf(a)] ?? 9, sb = ordre[stadeOf(b)] ?? 9; if (sa !== sb) return sa - sb; return new Date(b.createdAt || 0) - new Date(a.createdAt || 0); });
  const total = liste.length;
  liste = liste.slice(0, 25);
  const fmtEch = c => { const j = joursEch(c); if (j === Infinity) return ''; if (j < 0) return '⏰ en retard'; if (j === 0) return "⏰ auj."; if (j === 1) return '⏰ demain'; if (j <= 3) return `⏰ ${j}j`; return `${j}j`; };
  const opts = liste.map(c => {
    const stade = stadeOf(c);
    const nom = c.clientNom || c.commanditaire || '';
    const objet = c.objet || '';
    const label = ([nom, objet].filter(Boolean).join(' — ') || String(c.id)).slice(0, 100);
    const desc = [stade, fmtEch(c), String(c.id)].filter(Boolean).join(' · ').slice(0, 100);
    return { label, description: desc, value: String(c.id), emoji: emo[stade] || '⚪' };
  });
  if (!opts.length) {
    if (archived || (!filtre && !recherche)) return null;
    const vide = recherche ? `Aucun contrat ne correspond à « ${recherche} ».` : `Aucun contrat à l'étape « ${filtre} ».`;
    return { content: `📋 ${vide}`, embeds: [], components: _contratFiltreRows(filtre), flags: MessageFlags.Ephemeral };
  }
  const menu = new StringSelectMenuBuilder().setCustomId('csuivi_select').setPlaceholder(archived ? 'Contrat archivé à rouvrir' : 'Choisis un contrat à gérer').addOptions(opts);
  const rows = [new ActionRowBuilder().addComponents(menu)];
  if (!archived) rows.push(..._contratFiltreRows(filtre));
  if (!archived) rows.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('csuivi_reset').setLabel('Tout réinitialiser (tests)').setEmoji('🗑️').setStyle(ButtonStyle.Danger)));
  let head = archived ? "📁 **Archives** — contrats honorés / abandonnés (tu peux les rouvrir) :" : "📋 **Gestion des contrats** — choisis le contrat à gérer (les plus urgents en haut) :";
  if (filtre) head += `\n*Filtre : ${emo[filtre] || ''} ${filtre}*`;
  if (recherche) head += `\n*Recherche : « ${recherche} »*`;
  if (total > 25) head += `\n*(${total} contrats au total — 25 affichés, affine avec un filtre ou 🔍)*`;
  return { content: head, embeds: [], components: rows, flags: MessageFlags.Ephemeral };
}
function _contratFiltreRows(filtre) {
  const B = (id, emoji, label, f) => { const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(filtre === f ? ButtonStyle.Primary : ButtonStyle.Secondary); if (emoji) b.setEmoji(emoji); return b; };
  return [new ActionRowBuilder().addComponents(
    B('csuivi_filtre::tous', null, 'Tous', null),
    B('csuivi_filtre::En attente', '🟡', 'Attente', 'En attente'),
    B('csuivi_filtre::En cours', '🔵', 'Cours', 'En cours'),
    B('csuivi_filtre::Validé', '✅', 'Validé', 'Validé'),
    new ButtonBuilder().setCustomId('csuivi_search').setLabel('Chercher').setEmoji('🔍').setStyle(ButtonStyle.Secondary),
  )];
}
function _contratStats(db) {
  const cs = (db.contrats || []);
  const by = (s) => cs.filter(c => (c.suivi || _suiviDepuisStatut(c)) === s).length;
  return { attente: by('En attente'), cours: by('En cours'), valide: by('Validé'), honore: by('Honoré'), abandon: by('Abandonné'), total: cs.length };
}
function _contratPanelEmbed(db) {
  const st = _contratStats(db);
  return new EmbedBuilder().setColor(0x8B1A1A).setTitle('📜 GESTION DES CONTRATS')
    .setDescription("Faites avancer chaque contrat et encaissez les primes, directement depuis ce salon.\n\nCliquez sur **🎮 Gérer les contrats** — la gestion s'ouvre **pour vous seul**, liste toujours à jour.")
    .addFields(
      { name: 'Contrats actifs', value: `🟡 **${st.attente}** en attente\n🔵 **${st.cours}** en cours\n✅ **${st.valide}** à encaisser`, inline: true },
      { name: 'Clôturés', value: `🏁 **${st.honore}** honorés\n✖️ **${st.abandon}** abandonnés`, inline: true },
    )
    .setFooter({ text: `Iron Wolf Company • Direction • maj ${fmtShort(new Date())}` });
}
function _genererRecapEmbed(db) {
  const st = _contratStats(db);
  const now = new Date();
  const cs = (db.contrats || []);
  const joursRestants = (dateStr) => { const d = new Date(dateStr); if (isNaN(d.getTime())) return null; const a = Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()); const b = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()); return Math.round((a - b) / 86400000); };
  const proches = cs.filter(c => {
    const stade = c.suivi || _suiviDepuisStatut(c);
    if (['Honoré', 'Abandonné'].includes(stade)) return false;
    if (!c.dateEcheance) return false;
    const j = joursRestants(c.dateEcheance);
    return j !== null && j >= 0 && j <= 3;
  }).sort((a, b) => new Date(a.dateEcheance) - new Date(b.dateEcheance));
  const rdvAttente = (db.rdvClients || []).filter(r => r.statut === 'en_attente').length;
  const inactifs = Object.values(db.members || {}).filter(m => m.status === 'inactif').length;
  const lignesEch = proches.length
    ? proches.slice(0, 8).map(c => { const j = joursRestants(c.dateEcheance); return `• **${c.id}** — ${j === 0 ? "aujourd'hui" : j === 1 ? 'demain' : 'dans ' + j + 'j'}${c.clientNom ? ' · ' + c.clientNom : ''}`; }).join('\n')
    : "*Aucune échéance proche* ✅";
  const embed = new EmbedBuilder().setColor(0xC49A4A).setTitle("📊 Ton récap — ce qui t'attend")
    .setDescription(`*${fmtShort(now)} · Iron Wolf Company*`)
    .addFields(
      { name: '📜 Contrats', value: `🟡 **${st.attente}** en attente · 🔵 **${st.cours}** en cours · ✅ **${st.valide}** à encaisser`, inline: false },
      { name: '⏰ Échéances sous 3 jours', value: lignesEch, inline: false },
      { name: '🗓️ RDV à traiter', value: rdvAttente > 0 ? `**${rdvAttente}** demande(s) en attente` : "*Aucun* ✅", inline: true },
      { name: '💤 Membres inactifs', value: inactifs > 0 ? `**${inactifs}**` : "*Aucun* ✅", inline: true },
    )
    .setFooter({ text: 'Tape /recap quand tu veux • IWC' });
  if (st.valide > 0) embed.addFields({ name: '💰 Rappel', value: `Tu as **${st.valide}** contrat(s) validé(s) **pas encore encaissé(s)** — pense à les honorer (→ coffre).`, inline: false });
  return embed;
}
async function _updateContratPanel(client) {
  const ref = loadDB().contratPanel;
  if (!ref || !ref.channelId || !ref.messageId) return;
  try {
    const ch = await client.channels.fetch(ref.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [_contratPanelEmbed(loadDB())] }).catch(() => {});
  } catch {}
}

// ═══ TABLEAU IMMERSIF DES ÉCHÉANCES DE CONTRATS (planning) ═══
function _planningContratsEmbed(db) {
  const now = new Date();
  const joursEch = c => { if (!c.dateEcheance) return Infinity; const d = new Date(c.dateEcheance); if (isNaN(d.getTime())) return Infinity; return Math.round((Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()) - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86400000); };
  const stadeOf = c => c.suivi || _suiviDepuisStatut(c);
  const stadeEmoji = { 'En attente': '🟡', 'En cours': '🔵', 'Validé': '✅', 'Honoré': '🏁', 'Abandonné': '✖️' };
  const nomClient = c => c.clientNom || c.employeurNom || c.commanditaire || c.clientIC || '—';
  const objetCourt = c => (c.objet || '—').replace(/\s+/g, ' ').slice(0, 40);
  const dateFr = c => { if (!c.dateEcheance) return null; const d = new Date(c.dateEcheance); return isNaN(d.getTime()) ? String(c.dateEcheance).slice(0, 12) : d.toLocaleDateString('fr-FR', { day: '2-digit', month: 'short' }); };
  const cd = c => { const j = joursEch(c); if (j === Infinity) return ''; if (j < 0) return ` · ⏰ retard ${Math.abs(j)}j`; if (j === 0) return " · ⏰ aujourd'hui"; if (j === 1) return ' · ⏰ demain'; if (j <= 7) return ` · ⏰ ${j}j`; return ` · 🗓️ ${j}j`; };
  const ligne = c => { const dt = dateFr(c); return `${stadeEmoji[stadeOf(c)] || '•'} \`${c.id}\` — **${nomClient(c)}** · ${objetCourt(c)}${dt ? ` · 📅 ${dt}` : ''}${cd(c)}`; };
  const actifs = (db.contrats || []).filter(c => !['Honoré', 'Abandonné'].includes(stadeOf(c)));
  actifs.sort((a, b) => joursEch(a) - joursEch(b));
  const retard  = actifs.filter(c => { const j = joursEch(c); return j !== Infinity && j < 0; });
  const proche  = actifs.filter(c => { const j = joursEch(c); return j >= 0 && j <= 1; });
  const semaine = actifs.filter(c => { const j = joursEch(c); return j >= 2 && j <= 7; });
  const avenir  = actifs.filter(c => { const j = joursEch(c); return j > 7 && j !== Infinity; });
  const sansEch = actifs.filter(c => joursEch(c) === Infinity);
  const bloc = (titre, arr) => arr.length ? { name: `${titre} (${arr.length})`, value: arr.slice(0, 10).map(ligne).join('\n').slice(0, 1024), inline: false } : null;
  const fields = [
    bloc('🔴 EN RETARD', retard),
    bloc('🔥 AUJOURD’HUI / DEMAIN', proche),
    bloc('📅 CETTE SEMAINE', semaine),
    bloc('🗓️ À VENIR', avenir),
    bloc('♾️ SANS ÉCHÉANCE', sansEch),
  ].filter(Boolean);
  const e = new EmbedBuilder()
    .setColor(0x8B5A2B)
    .setTitle('📜 REGISTRE DES AFFAIRES — TABLEAU DES ÉCHÉANCES')
    .setDescription('```\n  IRON WOLF COMPANY · BUREAU DES CONTRATS · TEXAS \n```\nLes affaires en cours, classées par échéance. Le secrétariat tient ce registre à jour à mesure que les contrats avancent.\n\n🟡 *en attente* · 🔵 *en cours* · ✅ *à encaisser*');
  if (fields.length) e.addFields(fields);
  else e.addFields({ name: '— Registre vide —', value: "*Aucune affaire en cours, cow-boy. Le tableau est propre.*", inline: false });
  e.setFooter({ text: `Iron Wolf Company • ${actifs.length} affaire(s) en cours • à jour le ${fmtShort(new Date())}` }).setTimestamp();
  return e;
}
function _planningResetRow() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('csuivi_reset').setLabel('Réinitialiser les contrats (Direction)').setEmoji('🗑️').setStyle(ButtonStyle.Danger));
}
async function _updatePlanningContrats(client) {
  const ref = loadDB().planningContratsPanel;
  if (!ref || !ref.channelId || !ref.messageId) return;
  try {
    const ch = await client.channels.fetch(ref.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(ref.messageId).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [_planningContratsEmbed(loadDB())], components: [_planningResetRow()] }).catch(() => {});
  } catch {}
}
// Poste un nouveau contrat en POST de forum catégorisé (salon 1518392786301227250) — même principe que les opérations
const FORUM_CONTRATS = '1518392786301227250';
async function _posterContratForum(guild, contrat, embed) {
  try {
    const forum = guild.channels.cache.get(FORUM_CONTRATS);
    if (!forum || forum.type !== 15 || !forum.threads?.create) return;
    const clean = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const client = contrat.clientNom || contrat.employeurNom || contrat.commanditaire || '';
    const titre = `${contrat.id}${client ? ' — ' + client : ''}`.slice(0, 100);
    // Catégorisation par étiquettes du forum (type de contrat + statut)
    const cf = String(contrat.id).startsWith('CF-') || contrat.type === 'confrerie' || contrat.cc;
    const typeKw = cf ? ['confrerie', 'illegal'] : (contrat.type === 'emploi' ? ['employeur', 'emploi'] : ['prestation', 'offre']);
    const veut = [...typeKw, clean(contrat.suivi || contrat.status || 'en attente')].filter(Boolean);
    const tags = forum.availableTags || [];
    const appliedTags = tags.filter(t => { const tn = clean(t.name); return veut.some(w => w && (tn.includes(w) || w.includes(tn))); }).map(t => t.id).slice(0, 5);
    const msg = embed ? { embeds: [embed] } : { content: `📜 Contrat ${contrat.id}` };
    const opts = { name: titre, message: msg };
    if (appliedTags.length) opts.appliedTags = appliedTags;
    let post = await forum.threads.create(opts).catch(() => null);
    if (!post && appliedTags.length) post = await forum.threads.create({ name: titre, message: msg }).catch(() => null); // repli sans étiquettes
  } catch (e) { console.log('⚠️ post contrat forum:', e.message); }
}
async function _installerPlanningContrats(guild) {
  try {
    const ch = getChById(guild, 'PLANNING', 'planning') || getChById(guild, 'AGENDA', 'agenda');
    if (!ch) return;
    const db = loadDB();
    // Déjà posé au bon endroit et toujours présent ? on garde
    if (db.planningContratsPanel?.channelId === ch.id && db.planningContratsPanel?.messageId) {
      const old = await ch.messages.fetch(db.planningContratsPanel.messageId).catch(() => null);
      if (old) { await old.edit({ embeds: [_planningContratsEmbed(db)], components: [_planningResetRow()] }).catch(() => {}); return; }
    }
    // Le tableau était dans un autre salon (ex. agenda) ? on supprime l'ancien pour éviter le doublon
    if (db.planningContratsPanel?.channelId && db.planningContratsPanel?.messageId && db.planningContratsPanel.channelId !== ch.id) {
      const oldCh = await client.channels.fetch(db.planningContratsPanel.channelId).catch(() => null);
      if (oldCh) { const oldMsg = await oldCh.messages.fetch(db.planningContratsPanel.messageId).catch(() => null); if (oldMsg) await oldMsg.delete().catch(() => {}); }
    }
    // Nettoyer un éventuel ancien tableau du bot
    const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    if (recent) for (const [, m] of recent) { if (m.author.id === client.user.id && (m.embeds[0]?.title || '').includes('TABLEAU DES ÉCHÉANCES')) await m.delete().catch(() => {}); }
    const sent = await ch.send({ embeds: [_planningContratsEmbed(db)], components: [_planningResetRow()] }).catch(() => null);
    if (sent) { await sent.pin().catch(() => {}); const d2 = loadDB(); d2.planningContratsPanel = { channelId: ch.id, messageId: sent.id }; saveDB(d2); }
  } catch (e) { console.log('⚠️ install tableau planning contrats:', e.message); }
}
async function _installerTenuePanel(guild) {
  try {
    const ch = getChById(guild, 'TENUE', 'tenue', 'vestiaire', 'allure', 'dressing');
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    if (msgs && msgs.find(m => m.author.id === client.user.id && (m.embeds?.[0]?.title || '').includes('VESTIAIRE'))) return; // déjà posé
    const embed = new EmbedBuilder()
      .setColor(0x8B5A2B)
      .setTitle('🤠 LE VESTIAIRE — ALLURE & TENUES')
      .setDescription('```\n  IRON WOLF COMPANY · NEW AUSTIN, TEXAS \n```\n*Dans le Far West, l\'allure d\'un homme en dit long avant même qu\'il ne dégaine.*\nIci, on expose **sa tenue, son style, son personnage**.')
      .addFields(
        { name: '📸 Comment faire', value: '→ Poste une **photo** de ta tenue (capture en jeu).\n→ Ajoute le **nom de ton personnage** en légende.\n→ Affirme ton style et inspire les autres.' },
        { name: '🎩 Conseil d\'allure', value: 'Chapeau, manteau, foulard, bottes, ceinturon… chaque détail raconte qui tu es dans l\'Ouest.' },
      )
      .setFooter({ text: 'Iron Wolf Company • Le Vestiaire' });
    const sent = await ch.send({ embeds: [embed] }).catch(() => null);
    if (sent) await sent.pin().catch(() => {});
  } catch (e) { console.log('⚠️ install panneau tenue:', e.message); }
}
async function _setContratSuiviNotion(contrat, stage) {
  if (!process.env.NOTION_TOKEN) return;
  const DB = loadDB().notionContratsDbId || process.env.NOTION_CONTRATS_DB;
  if (!DB) return;
  const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
  async function findPage() {
    const r = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Référence', title: { equals: String(contrat.id) } }, page_size: 1 }) });
    if (!r.ok) return null;
    const d = await r.json().catch(() => null);
    return (d && d.results && d.results[0]) || null;
  }
  try {
    let page = await findPage();
    if (!page) { await _syncContratNotion(contrat, contrat.status || 'en_attente', null); page = await findPage(); }
    if (!page) return;
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, { method: 'PATCH', headers, body: JSON.stringify({ properties: { 'Suivi': { select: { name: stage } } } }) });
  } catch (e) { console.log('Suivi Notion:', e.message); }
}
function _notionPropText(prop) {
  if (!prop) return '';
  if (prop.title) return prop.title.map(t => t.plain_text || '').join('');
  if (prop.rich_text) return prop.rich_text.map(t => t.plain_text || '').join('');
  if (prop.select) return prop.select.name || '';
  if (prop.number != null) return String(prop.number);
  if (prop.date) return prop.date.start || '';
  return '';
}
async function _importContratsDepuisNotion(guild) {
  if (!process.env.NOTION_TOKEN) return 0;
  const DB = loadDB().notionContratsDbId || process.env.NOTION_CONTRATS_DB;
  if (!DB) return 0;
  const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
  let pages = []; let cursor = undefined;
  try {
    do {
      const body = { page_size: 100 };
      if (cursor) body.start_cursor = cursor;
      const r = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers, body: JSON.stringify(body) });
      if (!r.ok) return 0;
      const d = await r.json();
      pages = pages.concat(d.results || []);
      cursor = d.has_more ? d.next_cursor : undefined;
    } while (cursor);
  } catch (e) { console.log('Import Notion query:', e.message); return 0; }
  const db = loadDB();
  if (!db.contrats) db.contrats = [];
  const existingIds = new Set(db.contrats.map(c => String(c.id)));
  let imported = 0; const nouveaux = [];
  for (const page of pages) {
    const p = page.properties || {};
    let ref = _notionPropText(p['Référence']).trim();
    if (/^EX-00[1-5]$/.test(ref)) continue; // ignorer les exemples fournis
    if (!ref) {
      ref = 'NOT-' + Date.now().toString().slice(-5) + Math.floor(Math.random() * 10);
      try { await fetch(`https://api.notion.com/v1/pages/${page.id}`, { method: 'PATCH', headers, body: JSON.stringify({ properties: { 'Référence': { title: [{ text: { content: ref } }] } } }) }); } catch {}
    }
    if (existingIds.has(ref)) continue;
    const contrat = {
      id: ref, source: 'notion', type: 'notion',
      objet: _notionPropText(p['Objet']).trim() || ref,
      clientNom: _notionPropText(p['Partenaire']).trim(),
      remuneration: _notionPropText(p['Rémunération']).trim(),
      typeMission: _notionPropText(p['Type de mission']).trim(),
      details: _notionPropText(p['Détails']).trim(),
      dateEcheance: _notionPropText(p['Échéance']).trim() || null,
      emetteurNom: _notionPropText(p['Émetteur']).trim(),
      suivi: _notionPropText(p['Suivi']).trim() || 'En attente',
      status: 'en_attente', createdAt: new Date().toISOString(), notionPageId: page.id,
    };
    db.contrats.push(contrat); existingIds.add(ref); nouveaux.push(contrat); imported++;
  }
  if (imported > 0) {
    saveDB(db);
    if (guild) { try { await ajouterJournalIC(guild, { type: 'contrat', emoji: '📥', titre: `${imported} contrat(s) importé(s) depuis Notion`, description: nouveaux.map(c => `• ${c.id}${c.clientNom ? ' — ' + c.clientNom : ''}`).join('\n').slice(0, 800), auteur: 'Notion' }); } catch {} }
  }
  return imported;
}
let _contratsSchemaCache = { db: null, cols: null };
async function _syncContratNotion(contrat, statut, signePar) {
  if (contrat && contrat.source === 'notion') return; // contrat venu de Notion : on ne le réécrit pas vers Notion (évite d'écraser tes saisies)
  if (!process.env.NOTION_TOKEN) { console.log('⚠️ Contrat Notion: NOTION_TOKEN manquant'); return; }
  const DB = loadDB().notionContratsDbId || process.env.NOTION_CONTRATS_DB;
  if (!DB) { console.log('⚠️ Contrat Notion: aucune base liée (NOTION_CONTRATS_DB ou /connecter-notion-contrats)'); return; }

  const statutMap = { en_attente: '🟡 En attente', signe: '✅ Signé', refuse: '❌ Refusé', expire: '📁 Expiré' };
  // Types adaptés à la base réelle :
  // Tout en TEXTE sauf Référence (Titre) et Suivi (Sélection) — pour matcher un import CSV simple
  const propsComplet = {
    'Référence':     { title: [{ text: { content: String(contrat.id || '—') } }] },
    'Objet':         { rich_text: [{ text: { content: (contrat.objet || '—').slice(0, 1900) } }] },
    'Type':          { rich_text: [{ text: { content: contrat.type === 'emploi' ? '📥 Employeur' : '📤 Prestation' } }] },
    ...(contrat.typeMission ? { 'Type de mission': { rich_text: [{ text: { content: contrat.typeMission } }] } } : {}),
    'Statut':        { rich_text: [{ text: { content: statutMap[statut] || statut } }] },
    'Rémunération':  { rich_text: [{ text: { content: (contrat.remuneration || '—').slice(0, 1900) } }] },
    'Partenaire':    { rich_text: [{ text: { content: (contrat.clientNom || contrat.employeurNom || '—').slice(0, 1900) } }] },
    'Émetteur':      { rich_text: [{ text: { content: (contrat.emetteurIC || contrat.emetteurNom || contrat.signataire || '—').slice(0, 1900) } }] },
    'Date création': { rich_text: [{ text: { content: new Date(contrat.createdAt || Date.now()).toISOString().split('T')[0] } }] },
    ...(contrat.details ? { 'Détails': { rich_text: [{ text: { content: contrat.details.slice(0, 1900) } }] } } : {}),
  };
  if (statut === 'signe' && signePar) {
    propsComplet['Signé par'] = { rich_text: [{ text: { content: String(signePar).slice(0, 200) } }] };
    propsComplet['Date signature'] = { rich_text: [{ text: { content: new Date().toISOString().split('T')[0] } }] };
  }
  if (contrat.dateEcheance) propsComplet['Échéance'] = { rich_text: [{ text: { content: String(contrat.dateEcheance) } }] };

  const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

  // Trouver une page existante pour ce contrat
  let existing = null;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Référence', title: { equals: String(contrat.id) } }, page_size: 1 }) });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      console.log(`❌ Contrat Notion: requête base échouée (${res.status}) : ${err.message || ''}`);
      console.log('   → Vérifie que la base a bien une colonne TITRE nommée "Référence" et qu\'elle est partagée avec l\'intégration.');
      return;
    }
    const data = await res.json().catch(() => null);
    existing = data?.results?.[0] || null;
  } catch (e) { console.log('❌ Contrat Notion query:', e.message); return; }

  // Helper d'écriture avec retry minimal si une colonne pose problème
  async function ecrire(props) {
    const url = existing ? `https://api.notion.com/v1/pages/${existing.id}` : 'https://api.notion.com/v1/pages';
    const method = existing ? 'PATCH' : 'POST';
    const body = existing ? { properties: props } : { parent: { database_id: DB }, properties: props };
    const res = await fetch(url, { method, headers, body: JSON.stringify(body) });
    return res;
  }

  // Suivi (Kanban) : à la création, OU sur une page existante encore SANS Suivi (rattrapage) — sans JAMAIS écraser un classement fait à la main dans Notion
  if (!existing || !existing.properties?.Suivi?.select) propsComplet['Suivi'] = { select: { name: 'En attente' } };
  // Robustesse : n'écrire QUE les colonnes réellement présentes dans la base (sinon une colonne absente ferait échouer toute l'écriture)
  if (_contratsSchemaCache.db !== DB) {
    try {
      const sres = await fetch(`https://api.notion.com/v1/databases/${DB}`, { headers });
      if (sres.ok) { const sd = await sres.json(); _contratsSchemaCache = { db: DB, cols: Object.keys(sd.properties || {}) }; }
    } catch {}
  }
  if (Array.isArray(_contratsSchemaCache.cols) && _contratsSchemaCache.cols.length) {
    for (const k of Object.keys(propsComplet)) { if (k !== 'Référence' && !_contratsSchemaCache.cols.includes(k)) delete propsComplet[k]; }
  }
  let res = await ecrire(propsComplet);
  if (!res.ok && propsComplet['Suivi']) {
    // La colonne « Suivi » n'existe peut-être pas encore → on réessaie sans elle (sans rien perdre d'autre)
    const sansSuivi = { ...propsComplet }; delete sansSuivi['Suivi'];
    res = await ecrire(sansSuivi);
  }
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    console.log(`⚠️ Contrat Notion: écriture complète refusée (${res.status}) : ${err.message || ''}`);
    // Retry avec seulement les colonnes essentielles (Référence + Statut)
    const propsMini = { 'Référence': propsComplet['Référence'], 'Statut': propsComplet['Statut'] };
    res = await ecrire(propsMini);
    if (!res.ok) {
      const err2 = await res.json().catch(() => ({}));
      console.log(`❌ Contrat Notion: échec total (${res.status}) : ${err2.message || ''}`);
      console.log('   → Cause probable : noms de colonnes différents OU base non partagée avec l\'intégration.');
      return;
    }
    console.log(`✅ Contrat ${contrat.id} écrit en mode minimal (vérifie les noms de colonnes pour le détail complet).`);
    return;
  }
  console.log(`✅ Contrat Notion synchronisé : ${contrat.id} → ${statut}`);
}

async function _syncAffaireNotion(affaire, decision) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  const DB = process.env.NOTION_AFFAIRES_DB || process.env.NOTION_MEMBRES_DB;
  const statutMap = { approuvee: '✅ Approuvée', rejetee: '❌ Rejetée', en_cours: '🗳️ En vote' };
  const res = await fetch(`https://api.notion.com/v1/databases/${DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Titre', title: { equals: affaire.titre || affaire.title || '' } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null; const existing = data?.results?.[0];
  const props = { 'Statut': { select: { name: statutMap[decision] || decision } }, 'Décision': { rich_text: [{ text: { content: decision === 'approuvee' ? '✅ Approuvée' : '❌ Rejetée' } }] }, 'Date décision': { date: { start: new Date().toISOString().split('T')[0] } } };
  if (existing) await _notionPatch(existing.id, props);
}

async function _syncInformateurNotion(info, statut, validePar) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_INFOS_DB) return;
  const statutMap = { confirme: '✅ Confirmé', infirme: '❌ Infirmé', nouveau: '🆕 Nouveau' };
  const res = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_INFOS_DB}/query`, { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ filter: { property: 'Source', title: { equals: info.source || info.id || '' } }, page_size: 1 }) }).catch(() => null);
  const data = res ? await res.json().catch(() => null) : null; const existing = data?.results?.[0];
  const props = { 'Statut': { select: { name: statutMap[statut] || statut } }, 'Validé par': { rich_text: [{ text: { content: validePar || '—' } }] }, 'Date décision': { date: { start: new Date().toISOString().split('T')[0] } } };
  if (existing) { await _notionPatch(existing.id, props); console.log(`✅ Informateur Notion MàJ : ${info.titre || info.id} → ${statut}`); }
}

async function _syncAvertissementNotion(userId, username, avt, total) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_MEMBRES_DB) return;
  const page = await _notionFindByDiscordId(process.env.NOTION_MEMBRES_DB, userId); if (!page) return;
  await _notionPatch(page.id, { 'Avertissements': { number: total }, 'Dernier avertissement': { rich_text: [{ text: { content: avt.raison } }] } });
}

async function handleAutocompleteGrades(interaction) {
  const { GRADES_LEGAL, GRADES_ILLEGAL } = notionV3;
  const input = (interaction.options.getFocused() || '').toLowerCase();
  const db = loadDB(); const cible = interaction.options.getUser('membre');
  const membre = cible ? await interaction.guild.members.fetch(cible.id).catch(() => null) : null;
  let grades = [...(GRADES_LEGAL || []), ...(GRADES_ILLEGAL || [])];
  if (membre) {
    const pole = membre.roles.cache.some(r => ['Exécuteur','Condamné','Maudit','Fléau','Confrérie','Ombre','Concepteur'].some(n => r.name.includes(n))) ? 'illegal' : 'legal';
    grades = pole === 'illegal' ? (GRADES_ILLEGAL || []) : (GRADES_LEGAL || []);
  }
  const filtered = grades.filter(g => g.toLowerCase().includes(input)).slice(0, 25).map(g => ({ name: g, value: g }));
  await interaction.respond(filtered).catch(() => {});
}

// Dossier complet d'un membre (utilisé par /fiche @membre et le registre forum)
function _ficheMembreEmbed(guildMember, db) {
  const id = guildMember.id;
  const m = (db.members && db.members[id]) || {};
  const cand = (db.candidatures || []).find(c => c.userId === id && c.status === 'acceptee')
            || (db.candidatures || []).find(c => c.userId === id) || {};
  const perso = cand.nomPerso || m.nomRP || guildMember.displayName || guildMember.user.username;
  const pole = m.pole === 'illegal' ? '🔪 La Confrérie' : (m.pole === 'legal' ? '⚖️ Pôle Légal' : '—');
  const statut = m.status === 'absent' ? '⚠️ Absent' : (m.status === 'visiteur' ? '👁️ Visiteur' : '✅ Actif');
  const entree = m.joinedAt || cand.acceptedAt;
  const histo = (Array.isArray(m.historiqueGrades) && m.historiqueGrades.length)
    ? m.historiqueGrades.slice(-6).map(h => `• ${fmtShort(h.at)} — ${h.de || '—'} → **${h.vers}**`).join('\n').slice(0, 1024)
    : '*Aucun changement de grade enregistré.*';
  const nbContrats = (db.contrats || []).filter(c => c.emetteurId === id || c.signataireId === id).length;
  const color = m.pole === 'illegal' ? 0x8B1A1A : 0x3B82F6;
  const e = new EmbedBuilder()
    .setColor(color)
    .setTitle(`🪪 DOSSIER — ${perso}`)
    .addFields(
      { name: '👤 Joueur', value: `<@${id}>`, inline: true },
      { name: '🎖️ Grade', value: m.rang || '—', inline: true },
      { name: '🏛️ Pôle', value: pole, inline: true },
      { name: '📋 Statut', value: statut, inline: true },
      { name: '📅 Entrée', value: entree ? fmtShort(entree) : '—', inline: true },
      { name: '💼 Métier', value: cand.metier || cand.specialite || '—', inline: true },
    );
  if (cand.agePerso) e.addFields({ name: '🎂 Âge du perso', value: String(cand.agePerso), inline: true });
  if (cand.specialite && cand.specialite !== (cand.metier || '')) e.addFields({ name: '🎯 Spécialité', value: String(cand.specialite).slice(0, 200), inline: true });
  if (cand.dispos) e.addFields({ name: '🕒 Disponibilités', value: String(cand.dispos).slice(0, 200), inline: true });
  if (m.lastActivity) e.addFields({ name: '⚡ Dernière activité', value: fmtShort(m.lastActivity), inline: true });
  e.addFields({ name: '📜 Contrats émis', value: String(nbContrats), inline: true });
  if (m.status === 'absent' && (m.absentRaison || m.absentJusqu)) e.addFields({ name: '⚠️ Absence', value: (`${m.absentRaison ? String(m.absentRaison).slice(0, 150) : ''}${m.absentJusqu ? ` — jusqu'au ${fmtShort(m.absentJusqu)}` : ''}`).trim() || '—', inline: false });
  e.addFields({ name: '📈 Historique de grades', value: histo, inline: false });
  if (cand.motivation) e.addFields({ name: '💬 Motivation', value: String(cand.motivation).slice(0, 400) + (cand.motivation.length > 400 ? '…' : ''), inline: false });
  if (cand.background) e.addFields({ name: '📖 Background', value: String(cand.background).slice(0, 600) + (cand.background.length > 600 ? '…' : ''), inline: false });
  const av = guildMember.user.displayAvatarURL ? guildMember.user.displayAvatarURL() : null;
  if (av) e.setThumbnail(av);
  e.setFooter({ text: `IWC • Dossier membre • ${fmtShort(new Date())}` });
  return e;
}
// Forum registre — un post par membre (réutilise le dossier /fiche)
const FORUM_REGISTRE = '1518409832892469450';
async function _posterOuMajFiche(guild, forum, gm, db) {
  const id = gm.id;
  if (!db.ficheForumPosts) db.ficheForumPosts = {};
  const embed = _ficheMembreEmbed(gm, db);
  const cand = (db.candidatures || []).find(c => c.userId === id && c.status === 'acceptee');
  const perso = (cand && cand.nomPerso) || (db.members[id] && db.members[id].nomRP) || gm.displayName || gm.user.username;
  const titre = `🪪 ${perso}`.slice(0, 100);
  const existingId = db.ficheForumPosts[id];
  if (existingId) {
    const thread = await guild.channels.fetch(existingId).catch(() => null);
    if (thread && thread.fetchStarterMessage) {
      if (thread.archived && thread.setArchived) await thread.setArchived(false).catch(() => {});
      const starter = await thread.fetchStarterMessage().catch(() => null);
      if (starter) { await starter.edit({ embeds: [embed] }).catch(() => {}); return 'updated'; }
    }
    if (thread) return 'updated'; // existe → pas de doublon
  }
  const post = await forum.threads.create({ name: titre, message: { embeds: [embed] } }).catch(() => null);
  if (post) { db.ficheForumPosts[id] = post.id; return 'created'; }
  return null;
}
async function _syncRegistreForum(guild) {
  try {
    const forum = guild.channels.cache.get(FORUM_REGISTRE);
    if (!forum || forum.type !== 15 || !forum.threads?.create) return;
    const db = loadDB();
    if (!db.ficheForumPosts) db.ficheForumPosts = {};
    // 1) DÉDOUBLONNAGE : on scanne les posts existants (actifs + archivés), on garde 1 seul post par membre, on supprime les doublons.
    let posts = [];
    const act = await forum.threads.fetchActive().catch(() => null);
    if (act?.threads) posts = posts.concat([...act.threads.values()]);
    const arch = await forum.threads.fetchArchived({ limit: 100 }).catch(() => null);
    if (arch?.threads) posts = posts.concat([...arch.threads.values()]);
    const garde = {}; // memberId -> threadId conservé
    for (const th of posts) {
      const starter = await th.fetchStarterMessage().catch(() => null);
      const fld = starter?.embeds?.[0]?.fields?.find(f => /Joueur/i.test(f.name || ''));
      const mid = (fld?.value || '').match(/(\d{17,20})/)?.[1];
      if (!mid) continue;
      if (garde[mid]) { await th.delete().catch(() => {}); } // déjà un post pour ce membre → doublon supprimé
      else garde[mid] = th.id;
      await new Promise(r => setTimeout(r, 250));
    }
    db.ficheForumPosts = { ...garde }; // mapping reconstruit depuis l'état RÉEL du forum (plus de fantômes)
    saveDB(db);
    // 2) CRÉER/METTRE À JOUR une fiche par membre — tout le monde sauf les visiteurs (on ne filtre plus sur le grade).
    const membres = Object.values(db.members || {}).filter(m => m && m.id && m.status !== 'visiteur');
    let n = 0;
    for (const m of membres) {
      if (n >= 80) break;
      const gm = await guild.members.fetch(m.id).catch(() => null);
      if (!gm) continue; // a quitté le serveur → ignoré
      const res = await _posterOuMajFiche(guild, forum, gm, db);
      if (res === 'created') saveDB(db); // on persiste tout de suite : si Render redémarre en plein milieu, pas de doublon
      n++;
      await new Promise(r => setTimeout(r, 450)); // throttle anti rate-limit
    }
    saveDB(db);
  } catch (e) { console.log('⚠️ sync registre forum:', e.message); }
}
async function _handleRegistre(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const pole = interaction.options?.getString('pole') || 'tous'; const page = Math.max(1, interaction.options?.getInteger('page') || 1); const PAR_PAGE = 10;
  let membres = Object.values(db.members || {}).filter(m => m.status !== 'parti');
  if (pole !== 'tous') membres = membres.filter(m => m.pole === pole);
  membres.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
  const total = membres.length; const pages = Math.ceil(total / PAR_PAGE) || 1; const pageActuelle = Math.min(page, pages);
  const slice = membres.slice((pageActuelle - 1) * PAR_PAGE, pageActuelle * PAR_PAGE);
  const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', visiteur: '👁️' };
  const lignes = slice.map((m, i) => { const idx = (pageActuelle - 1) * PAR_PAGE + i + 1; const emoji = statutEmoji[m.status] || '❓'; const pole_e = m.pole === 'illegal' ? '🔒' : '⚖️'; const rang = m.rang ? ` · *${m.rang}*` : ''; const activ = m.lastActivity ? ` · ${daysSince(m.lastActivity)}j` : ''; return `\`${String(idx).padStart(2, '0')}\` ${emoji} ${pole_e} **${m.name || m.username || '—'}**${rang}${activ}`; }).join('\n');
  const poleLabel = pole === 'legal' ? '⚖️ Légal' : pole === 'illegal' ? '🔒 Illégal' : 'Tous les pôles';
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`📋 Registre — ${poleLabel}`).setDescription(lignes || '*Aucun membre trouvé.*').addFields({ name: '📊 Total', value: `**${total}** membre(s)`, inline: true }).setFooter({ text: `Page ${pageActuelle}/${pages} • IWC` }).setTimestamp()] });
}

async function _handleOpDetail(interaction) {
  await interaction.deferReply();
  const db = loadDB(); const id = interaction.options?.getString('id'); const ops = db.operations || [];
  let op;
  if (id) { op = ops.find(o => o.id === id || o.name?.toLowerCase().includes(id.toLowerCase())); }
  else { op = ops.find(o => o.status === 'en_cours') || ops.find(o => o.status === 'programmee') || [...ops].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))[0]; }
  if (!op) return interaction.editReply({ content: '❌ Aucune opération trouvée.' });
  const statutMap = { en_cours: '🟢 En cours', programmee: '🕐 Programmée', terminee: '✅ Terminée', annulee: '❌ Annulée', preparation: '🟡 Préparation' };
  const color = op.status === 'en_cours' ? 0x57F287 : op.status === 'terminee' ? 0x8B1A1A : op.status === 'annulee' ? 0x555555 : 0xFFA500;
  const embed = new EmbedBuilder().setColor(color).setTitle(`🎯 ${op.name}`).addFields({ name: '📌 Statut', value: statutMap[op.status] || op.status, inline: true }, { name: '📂 Pôle', value: op.pole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal', inline: true }, { name: '🆔 ID', value: `\`${op.id}\``, inline: true }, { name: '📍 Lieu', value: op.lieu || '—', inline: true }, { name: '🎯 Objectif', value: op.objectif || '—', inline: true }, { name: '👤 Créé par', value: op.createdBy || '—', inline: true });
  if (op.participants?.length) embed.addFields({ name: `👥 Participants (${op.participants.length})`, value: op.participants.join(', '), inline: false });
  if (op.status === 'terminee') { embed.addFields({ name: '📊 Résultat', value: op.resultat || '—', inline: true }, { name: '💰 Butin', value: op.butin || '—', inline: true }); if (op.debrief) embed.addFields({ name: '📝 Débrief', value: op.debrief.slice(0, 500), inline: false }); }
  if (op.status === 'programmee' && op.lancementAt) embed.addFields({ name: '⏰ Lancement prévu', value: new Date(op.lancementAt).toLocaleString('fr-FR'), inline: false });
  embed.addFields({ name: '📅 Créée le', value: fmtShort(op.createdAt), inline: true }).setFooter({ text: 'IWC • Opérations' }).setTimestamp();
  await interaction.editReply({ embeds: [embed] });
}

function _buildSuivi(db) {
  const cands = (db.candidatures || []).filter(c => ['reçue', 'examen'].includes(c.status));
  const contratsAtt = (db.contrats || []).filter(c => c.status === 'en_attente');
  const ops = db.operations || [];
  const opsEnCours = ops.filter(o => o.status === 'en_cours');
  const opsPrep = ops.filter(o => o.status === 'preparation');
  const members = Object.values(db.members || {});
  const absents = members.filter(m => m.status === 'absent');
  const inactifs = members.filter(m => m.status !== 'parti' && daysSince(m.lastActivity) > 7);
  const rdvs = Object.values(db.rdvplus?.rdvs || {}).filter(r => ['Planifié', 'Confirmé'].includes(r.statut));
  const coffreL = db.coffres?.legal || 0, coffreI = db.coffres?.illegal || 0;
  const li = (arr, fn, max = 6) => {
    if (!arr.length) return '*Aucun*';
    const out = arr.slice(0, max).map(fn).join('\n');
    return arr.length > max ? `${out}\n*…+${arr.length - max} autre(s)*` : out;
  };
  return new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('📋 SUIVI — IRON WOLF COMPANY')
    .setDescription('*Tout ce qui demande ton attention, en temps réel.*')
    .addFields(
      { name: `📥 Candidatures en attente (${cands.length})`, value: li(cands, c => `→ **${c.nomPerso || '—'}**${c.type === 'illegal' ? ' · 🔪' : ''}`).slice(0, 1024), inline: false },
      { name: `📜 Contrats à traiter (${contratsAtt.length})`, value: li(contratsAtt, c => `→ \`${c.id}\` · ${(c.objet || '—').slice(0, 60)}`).slice(0, 1024), inline: false },
      { name: '🎯 Opérations', value: [`🟢 En cours : **${opsEnCours.length}**`, opsEnCours.length ? li(opsEnCours, o => `· ${o.name || 'Opération'} (${o.lieu || '—'})`, 5) : null, `🟡 En préparation : **${opsPrep.length}**`].filter(v => v !== null).join('\n').slice(0, 1024), inline: true },
      { name: `📅 RDV à venir (${rdvs.length})`, value: (rdvs.length ? li(rdvs, r => `→ ${r.nomRP || 'Client'}`, 5) : '*Aucun*').slice(0, 1024), inline: true },
      { name: '💰 Trésorerie', value: `⚖️ Légal : **${coffreL.toLocaleString('fr-FR')} $**\n🔪 Illégal : **${coffreI.toLocaleString('fr-FR')} $**`, inline: true },
      { name: '👥 Membres', value: `✅ Actifs : **${members.filter(m => m.status === 'actif').length}**\n⚠️ Absents : **${absents.length}**\n❌ Inactifs : **${members.filter(m => m.status === 'inactif').length}**`, inline: true },
      { name: absents.length ? `🟡 Absents (${absents.length})` : '🟡 Absents', value: (absents.length ? li(absents, m => `→ ${m.name}`, 6) : '*Personne*').slice(0, 1024), inline: true },
      { name: inactifs.length ? `⚠️ Inactifs +7j (${inactifs.length})` : '✅ Activité', value: (inactifs.length ? li(inactifs, m => `→ ${m.name} (${daysSince(m.lastActivity)}j)`, 6) : '*Tout le monde est actif*').slice(0, 1024), inline: true },
    )
    .setFooter({ text: `IWC • ${new Date().toLocaleString('fr-FR')}` });
}

function _buildCandidaturesResume(db) {
  const cands = (db.candidatures || []).filter(c => c.status === 'reçue');
  if (!cands.length) return '✅ Aucune candidature en attente.';
  return cands.map((c, i) => { const h = Math.floor((Date.now() - new Date(c.receivedAt).getTime()) / 3600000); const urgent = h >= 48 ? ' 🔴' : h >= 24 ? ' ⚠️' : ''; return `**${i+1}.** ${c.nomPerso} — ${c.type === 'legal' ? '⚖️' : '🔒'} — ${h}h${urgent}`; }).join('\n');
}

async function envoyerDMRecap(guild, userId, type, data) {
  try {
    const db = loadDB(); if (!db._dmRecap) db._dmRecap = {}; if (!db._dmRecap[userId]) db._dmRecap[userId] = {};
    const membre = await guild.members.fetch(userId).catch(() => null); if (!membre) return;
    const events = db._dmRecap[userId].events || [];
    events.unshift({ type, data, date: new Date().toISOString() });
    db._dmRecap[userId].events = events.slice(0, 5);
    const embed = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🐺 Iron Wolf Company — Vos notifications').setDescription('*Récapitulatif de vos dernières notifications IWC.*').setTimestamp();
    for (const ev of db._dmRecap[userId].events) {
      const date = new Date(ev.date).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      if (ev.type === 'grade') embed.addFields({ name: `🎖️ Grade — ${date}`, value: `**${ev.data.ancien}** → **${ev.data.nouveau}**`, inline: false });
      else if (ev.type === 'rdv') embed.addFields({ name: `📅 Convocation — ${date}`, value: `**${ev.data.titre}** — ${ev.data.date} à ${ev.data.heure}\n📍 ${ev.data.lieu}`, inline: false });
      else if (ev.type === 'contrat') embed.addFields({ name: `📜 Contrat — ${date}`, value: `**${ev.data.id}** — ${ev.data.objet}`, inline: false });
      else if (ev.type === 'candidature') embed.addFields({ name: `🐺 Candidature — ${date}`, value: ev.data.message, inline: false });
      else if (ev.type === 'rappel') embed.addFields({ name: `⏰ Rappel RDV — ${date}`, value: `**${ev.data.titre}** dans ${ev.data.dans}`, inline: false });
      else if (ev.type === 'absence') embed.addFields({ name: `🟡 Absence — ${date}`, value: ev.data.message, inline: false });
    }
    embed.setFooter({ text: 'IWC • Secrétariat automatique • Ce message est mis à jour automatiquement' });
    const dmChannel = await membre.createDM().catch(() => null); if (!dmChannel) return;
    const lastMsgId = db._dmRecap[userId].msgId;
    if (lastMsgId) { const lastMsg = await dmChannel.messages.fetch(lastMsgId).catch(() => null); if (lastMsg) { await lastMsg.edit({ embeds: [embed] }); saveDB(db); return; } }
    const sent = await dmChannel.send({ embeds: [embed] }).catch(() => null);
    if (sent) { db._dmRecap[userId].msgId = sent.id; saveDB(db); }
  } catch(e) { console.log('❌ envoyerDMRecap error:', e.message); }
}

async function buildMembresDiscordMap(guild) {
  try {
    const allMembers = await guild.members.fetch().catch(() => null);
    if (allMembers) {
      const db = loadDB(); let changed = false;
      for (const [id, m] of allMembers) {
        if (m.user.bot) continue;
        if (!db.members[id]) { db.members[id] = { discordId: id, username: m.user.username, status: 'visiteur', joinedAt: new Date().toISOString(), lastActivity: new Date().toISOString() }; changed = true; }
        else if (!db.members[id].username) { db.members[id].username = m.user.username; changed = true; }
      }
      if (changed) { saveDB(db); console.log('✅ MEMBRES_DISCORD_MAP auto-refresh'); }
    }
  } catch(e) { console.log('❌ buildMembresDiscordMap refresh:', e.message); }
  try {
    const { ROLES } = require('./notion-modules-v3'); const allRoleIds = Object.values(ROLES || {});
    const members = await guild.members.fetch().catch(() => null); if (!members) return;
    const db = loadDB(); let updated = 0;
    for (const [, m] of members) {
      if (m.user.bot) continue; if (!m.roles.cache.some(r => allRoleIds.includes(r.id))) continue;
      const nomIC = db.members[m.id]?.name;
      if (nomIC && nomIC !== m.user.username) { const cfg = require('./config'); if (!cfg.MEMBRES_DISCORD_MAP[nomIC]) { cfg.MEMBRES_DISCORD_MAP[nomIC] = m.id; cfg.DISCORD_TO_IC[m.id] = nomIC; updated++; } }
    }
    if (updated > 0) console.log(`✅ MEMBRES_DISCORD_MAP enrichi : +${updated} entrées`);
  } catch (e) { console.log('❌ buildMembresDiscordMap:', e.message); }
}

async function _handleVersion(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const BOT_VERSION = '5.2 (15 juin — économie RP + parrainage des nouveaux)'; const uptime = Math.floor(process.uptime()); const h = Math.floor(uptime / 3600); const m = Math.floor((uptime % 3600) / 60); const s = uptime % 60;
  let notionOk = false;
  try { const r = await fetch('https://api.notion.com/v1/users/me', { headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' } }); notionOk = r.ok; } catch {}
  const db = loadDB();
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle(`🤖 IWC Bot — v${BOT_VERSION}`).addFields({ name: '⏱️ Uptime', value: `${h}h ${m}m ${s}s`, inline: true }, { name: '🔗 Notion', value: notionOk ? '✅ Connecté' : '❌ Déconnecté', inline: true }, { name: '💾 Mémoire', value: `${Math.round(process.memoryUsage().heapUsed / 1024 / 1024)} MB`, inline: true }, { name: '👥 Membres en DB', value: `${Object.keys(db.members || {}).length}`, inline: true }, { name: '🎯 Opérations', value: `${(db.operations || []).length}`, inline: true }, { name: '📜 Contrats', value: `${(db.contrats || []).length}`, inline: true }).setFooter({ text: `IWC Bot v${BOT_VERSION} • Node ${process.version}` }).setTimestamp()] });
}

async function _handleSync(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild; const start = Date.now();
  await registerSlashCommands(guild).catch(() => {});
  await syncRegistreNotion(guild).catch(() => {}); await updateDashboard(guild).catch(() => {}); await notionV3.updateHierarchieEmbed?.(guild).catch(() => {}); await buildMembresDiscordMap(guild).catch(() => {});
  const ms = Date.now() - start;
  const nbCmds = (client._cmdNames || []).length;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('🔄 Synchronisation terminée').addFields({ name: '✅ Commandes', value: `**${nbCmds}** réenregistrées`, inline: true }, { name: '✅ Registre Notion', value: 'Synchronisé', inline: true }, { name: '✅ Dashboard', value: 'Mis à jour', inline: true }, { name: '✅ Hiérarchie', value: 'Actualisée', inline: true }).setFooter({ text: `Durée : ${ms}ms • Si une commande manque, ferme et rouvre Discord` }).setTimestamp()] });
}

async function _handleAvertir(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply();
  const cible = interaction.options.getUser('membre'); const raison = interaction.options.getString('raison');
  const membre = await interaction.guild.members.fetch(cible.id).catch(() => null);
  const db = loadDB(); if (!db.avertissements) db.avertissements = {}; if (!db.avertissements[cible.id]) db.avertissements[cible.id] = [];
  const avertissement = { id: `AVT-${Date.now().toString().slice(-5)}`, raison, parId: interaction.user.id, par: interaction.user.username, date: new Date().toISOString() };
  db.avertissements[cible.id].push(avertissement); saveDB(db);
  const total = db.avertissements[cible.id].length; const color = total >= 3 ? 0xED4245 : total === 2 ? 0xFFA500 : 0xFFCC00;
  const embed = new EmbedBuilder().setColor(color).setTitle(`⚠️ Avertissement — ${cible.username}`).addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '📋 Raison', value: raison, inline: false }, { name: '🔢 Total', value: `**${total}/3**`, inline: true }, { name: '✅ Émis par', value: interaction.user.username, inline: true }).setFooter({ text: `IWC • Réf. ${avertissement.id}` }).setTimestamp();
  if (total >= 3) embed.addFields({ name: '🚨 Attention', value: '**3 avertissements atteints.** Une décision de la Direction est requise.', inline: false });
  await interaction.editReply({ embeds: [embed] });
  try { const isIlleg = db.members[cible.id]?.pole === 'illegal'; await membre?.send({ embeds: [new EmbedBuilder().setColor(color).setTitle(`⚠️ Avertissement — ${isIlleg ? 'La Confrérie' : 'Iron Wolf Company'}`).setDescription(`Tu as reçu un avertissement de la Direction.\n\n**Raison :** ${raison}\n\n*${total >= 3 ? '🚨 Tu as atteint 3 avertissements. La Direction va délibérer.' : `Avertissement ${total}/3.`}*`).setFooter({ text: isIlleg ? 'La Confrérie • Confidentiel' : 'Iron Wolf Company • Légal' })] }); } catch {}
  if (total >= 3) { const logsCh = getCh(interaction.guild, 'logs'); const mention = interaction.guild.roles.cache.filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' '); if (logsCh) await logsCh.send({ content: `${mention} — 🚨 **${cible.username} a atteint 3 avertissements**`, embeds: [embed] }).catch(() => {}); }
  _syncAvertissementNotion(cible.id, cible.username, avertissement, total).catch(() => {});
}

async function _handleAvertissements(interaction) {
  const cible = interaction.options?.getUser('membre') || interaction.user; const db = loadDB(); const liste = db.avertissements?.[cible.id] || [];
  const embed = new EmbedBuilder().setColor(liste.length >= 3 ? 0xED4245 : liste.length > 0 ? 0xFFA500 : 0x57F287).setTitle(`⚠️ Avertissements — ${cible.username}`).setDescription(liste.length === 0 ? '✅ Aucun avertissement.' : `**${liste.length}/3 avertissement(s)**`).setThumbnail(cible.displayAvatarURL());
  for (const a of liste.slice(-5).reverse()) embed.addFields({ name: `${fmtShort(a.date)} — ${a.id}`, value: `${a.raison}\n*Par ${a.par}*`, inline: false });
  embed.setFooter({ text: 'IWC • Historique des sanctions' }).setTimestamp();
  await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// [FIX] _handleRetour — membres déclarent leur retour, Direction peut choisir un membre
async function _handleRetour(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const guild = interaction.guild;
  // La Direction peut passer un membre en option
  const cibleUser = isDirection(interaction.member) ? interaction.options?.getUser('membre') : null;
  const targetId   = cibleUser ? cibleUser.id : interaction.user.id;
  const targetUser = cibleUser || interaction.user;
  const m = db.members[targetId];
  if (!m) return interaction.editReply({ content: `❌ <@${targetId}> n'est pas enregistré dans le système.` });
  if (m.status === 'actif') return interaction.editReply({ content: `✅ <@${targetId}> est déjà actif.` });
  // Forcer le retour même si statut inconnu
  console.log(`🔄 Retour de ${targetId} — statut: ${m.status}`);
  const ancienStatut = m.status;
  m.status = 'actif'; m.lastActivity = new Date().toISOString(); m.absentJusqu = null; m.absentRaison = null; saveDB(db);
  const membreRetour = await guild.members.fetch(targetId).catch(() => null);
  if (membreRetour) {
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreRetour.roles.remove(roleAbsent).catch(() => {});
    await _debloquerEcritureAbsent(guild, membreRetour);
  }
  _syncMembreNotion(targetId, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
  // Mettre à jour Fiches_personnages aussi
  _syncStatutFicheNotion(targetId, 'Actif').catch(() => {});
  const absCh = getAbsencesCh(guild, membreRetour);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
    .setAuthor({ name: `${membreRetour?.displayName || targetUser.username} — Retour`, iconURL: targetUser.displayAvatarURL?.() || undefined })
    .setTitle('✅ Retour déclaré')
    .addFields(
      { name: '👤 Membre', value: `<@${targetId}>`, inline: true },
      { name: '🎖️ Grade', value: m.rang || '—', inline: true },
      { name: '📅 Retour le', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true },
      ...(cibleUser ? [{ name: '✅ Levé par', value: interaction.user.username, inline: true }] : []),
    ).setFooter({ text: cibleUser ? 'IWC • Levé par la Direction' : 'IWC • Retour déclaré manuellement' }).setTimestamp()] }).catch(() => {});
  if (cibleUser) {
    await interaction.editReply({ content: `✅ Retour de <@${targetId}> enregistré. Permissions rétablies.` });
  } else {
    await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Retour enregistré').setDescription(`Tu es de retour !\n\nAncien statut : **${ancienStatut}** → **Actif**\n*Tes permissions d'écriture sont rétablies.*`).setFooter({ text: 'IWC • Bienvenue de retour' })] });
  }
}

// [CORRECTION] _handleAnnulerAbsence avec déblocage écriture
async function _handleAnnulerAbsence(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const cible = interaction.options.getUser('membre');
  if (!cible) return interaction.editReply({ content: '❌ Membre introuvable. Utilise l\'option @membre.' });
  const db = loadDB(); const m = db.members[cible.id];
  if (!m) return interaction.editReply({ content: `❌ <@${cible.id}> n'est pas enregistré dans le système. Vérifie que le membre a bien utilisé /absent.` });
  if (m.status !== 'absent') {
    // Forcer quand même le retrait du rôle au cas où
    const membreForce = await interaction.guild.members.fetch(cible.id).catch(() => null);
    if (membreForce) await _debloquerEcritureAbsent(interaction.guild, membreForce);
    return interaction.editReply({ content: `⚠️ <@${cible.id}> n'était pas marqué absent (statut : ${m.status}) mais les permissions ont été rétablies.` });
  }
  m.status = 'actif'; m.lastActivity = new Date().toISOString(); m.absentJusqu = null; m.absentRaison = null; saveDB(db);
  const membreD = await interaction.guild.members.fetch(cible.id).catch(() => null);
  if (membreD) {
    const roleAbsent = interaction.guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreD.roles.remove(roleAbsent).catch(() => {});
    await _debloquerEcritureAbsent(interaction.guild, membreD);
  }
  _syncMembreNotion(cible.id, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
  _syncStatutFicheNotion(cible.id, 'Actif').catch(() => {});
  const absCh = getAbsencesCh(interaction.guild, membreD);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Absence levée par la Direction').addFields({ name: '👤 Membre', value: `<@${cible.id}>`, inline: true }, { name: '✅ Levé par', value: interaction.user.username, inline: true }, { name: '📅 Date', value: new Date().toLocaleDateString('fr-FR'), inline: true }).setFooter({ text: 'IWC • Absence annulée par la Direction' }).setTimestamp()] }).catch(() => {});
  try { await membreD?.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Absence levée').setDescription(`Ton absence a été levée par **${interaction.user.username}**.\nTes permissions d'écriture sont rétablies.`).setFooter({ text: 'IWC' })] }); } catch {}
  await interaction.editReply({ content: `✅ Absence de <@${cible.id}> levée.` });
}

async function _executerPurge(interaction) {
  if (!isDirection(interaction.member)) return interaction.update({ content: '❌ Accès refusé.', embeds: [], components: [] });
  const parts = interaction.customId.replace('purge_confirm_', '').split('_'); const salonId = parts[0]; const nbRaw = parts[1]; const nombre = nbRaw === 'all' ? null : parseInt(nbRaw);
  const salon = interaction.guild.channels.cache.get(salonId); if (!salon) return interaction.update({ content: '❌ Salon introuvable.', embeds: [], components: [] });
  await interaction.update({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🗑️ Suppression en cours...').setDescription('Patience, le bot supprime les messages.')], components: [] });
  let total = 0; let continuer = true;
  while (continuer) {
    const limit = nombre ? Math.min(nombre - total, 100) : 100;
    const msgs = await salon.messages.fetch({ limit }).catch(() => null); if (!msgs || msgs.size === 0) break;
    const maintenant = Date.now(); const limite14j = maintenant - 13 * 24 * 60 * 60 * 1000;
    const recents = msgs.filter(m => m.createdTimestamp > limite14j); const anciens = msgs.filter(m => m.createdTimestamp <= limite14j);
    if (recents.size >= 2) { await salon.bulkDelete(recents).catch(() => {}); total += recents.size; }
    else if (recents.size === 1) { await recents.first().delete().catch(() => {}); total += 1; }
    for (const [, m] of anciens) { await m.delete().catch(() => {}); total++; await new Promise(r => setTimeout(r, 300)); if (nombre && total >= nombre) { continuer = false; break; } }
    if (nombre && total >= nombre) break; if (msgs.size < 100) break;
  }
  try { await interaction.followUp({ flags: MessageFlags.Ephemeral, embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Purge terminée').addFields({ name: '🗑️ Messages supprimés', value: `**${total}**`, inline: true }, { name: '📋 Salon', value: `#${salon.name}`, inline: true }, { name: '👤 Exécuté par', value: interaction.user.username, inline: true }).setFooter({ text: 'IWC • Purge automatique' }).setTimestamp()] }); } catch {}
  console.log(`✅ Purge : ${total} messages supprimés dans #${salon.name}`);
}

async function _handlePatchDeploy(interaction) {
  const isFondateur = interaction.member.roles.cache.some(r => r.name.includes('Fondateur'));
  const isFleau = interaction.member.roles.cache.some(r => r.name.includes('Fl\u00e9au') || r.name.includes('Fleau'));
  if (!isFondateur && !isFleau) return interaction.reply({ flags: MessageFlags.Ephemeral, content: '\u274c R\u00e9serv\u00e9 au Fondateur et au Fl\u00e9au.' });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const patchCh = getChById(interaction.guild, 'PATCH_NOTE', 'patch-note', 'patch');
  if (!patchCh) return interaction.editReply({ content: '\u274c Salon #patch-note introuvable.' });
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const embed1 = new EmbedBuilder()
    .setColor(0x8B4513)
    .setAuthor({ name: 'Iron Wolf Company \u00b7 IWC Setup', iconURL: interaction.guild.iconURL() || undefined })
    .setTitle('\uD83D\uDC3A IWC Bot \u2014 Mise \u00e0 jour majeure \u00b7 Version 6.0')
    .setDescription('*D\u00e9ploy\u00e9 le **' + dateStr + '** \u2014 Le Renseignement de terrain*')
    .addFields(
      { name: '\uD83C\uDF99\uFE0F MICRO DE TERRAIN (NOUVEAU)', value: '\u2192 Programme PC qui \u00e9coute le son du jeu et transcrit les voix RP\n\u2192 Maintiens une touche \u2192 la conversation est transcrite et envoy\u00e9e\n\u2192 Transcription locale haute qualit\u00e9 (Whisper) avec ponctuation\n\u2192 D\u00e9coupage automatique par interventions (qui dit quoi)\n\u2192 D\u00e9tection auto des lieux Red Dead + mots-cl\u00e9s en gras\n\u2192 File d\'attente hors-ligne \u2014 aucune info perdue', inline: false },
      { name: '\uD83E\uDDE0 RAPPORTS IA (NOUVEAU)', value: '\u2192 Chaque note vocale transform\u00e9e en RAPPORT DE TERRAIN propre\n\u2192 R\u00e9sum\u00e9, d\u00e9tails reformul\u00e9s, personnes, lieu, niveau de menace\n\u2192 Classement automatique par cat\u00e9gorie (armes, argent, loi...)\n\u2192 Fils par personne \u2014 dossier automatique sur chaque individu', inline: false },
    )
    .setFooter({ text: 'IWC Bot v6.0 \u00b7 1/3' });

  const embed2 = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .addFields(
      { name: '\uD83D\uDD0D COMMANDES RENSEIGNEMENT (NOUVEAU)', value: '\u2192 /notes \u2014 consulter les derni\u00e8res notes de terrain (filtres)\n\u2192 /synthese [sujet] \u2014 l\'IA compile tout ce qu\'on sait sur une personne ou un lieu\n\u2192 Briefing quotidien automatique \u2014 synth\u00e8se IA chaque soir \u00e0 20h\n\u2192 D\u00e9tection de doublons \u2014 recoupement des infos entre agents', inline: false },
      { name: '\uD83D\uDCDC CONTRATS AM\u00c9LIOR\u00c9S', value: '\u2192 Menu Type de mission \u2014 Protection, Escorte, Surveillance, Chasse de prime...\n\u2192 Nouveau champ D\u00e9tails \u2014 conditions, lieu, infos en plus\n\u2192 Synchronisation Notion fiabilis\u00e9e + auto-diagnostic\n\u2192 /contrats-sync \u2014 resynchroniser tous les contrats d\'un coup\n\u2192 /notion-test \u2014 v\u00e9rifier la connexion Notion', inline: false },
    )
    .setFooter({ text: 'IWC Bot v6.0 \u00b7 2/3' });

  const embed3 = new EmbedBuilder()
    .setColor(0x2C3E50)
    .addFields(
      { name: '\uD83D\uDC1B CORRECTIONS', value: '\u2192 /dashboard \u2014 bug de double r\u00e9ponse corrig\u00e9\n\u2192 Bouton Rafra\u00eechir du dashboard corrig\u00e9\n\u2192 Gestion d\'erreur des commandes fiabilis\u00e9e\n\u2192 Menus d\u00e9roulants nettoy\u00e9s automatiquement apr\u00e8s usage\n\u2192 Synchro Notion contrats \u2014 types de colonnes adapt\u00e9s', inline: false },
      { name: '\uD83D\uDD2E PROCHAINES MISES \u00c0 JOUR', value: '\u2192 Toujours plus de pr\u00e9cision sur la transcription\n\u2192 Statistiques de renseignement par agent\n\u2192 Archivage automatique des vieux rapports', inline: false },
    )
    .setFooter({ text: 'IWC Bot v6.0 \u00b7 3/3 \u00b7 La force est dans l\'ombre. \u2014 La Compagnie' })
    .setTimestamp();

  await patchCh.send({ embeds: [embed1] });
  await patchCh.send({ embeds: [embed2] });
  await patchCh.send({ embeds: [embed3] });
  await interaction.editReply({ content: '\u2705 Patch note v6.0 post\u00e9 dans ' + patchCh + ' (3 embeds).' });
}
async function _handlePurge(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const nombre = interaction.options?.getInteger('nombre') || null; const salon = interaction.channel;
  const label = nombre ? `les **${nombre} derniers messages**` : `**tous les messages récents**`;
  await interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🗑️ Confirmer la suppression').setDescription(`Tu vas supprimer ${label} dans **#${salon.name}**.\n\n⚠️ **Cette action est irréversible.**`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`purge_confirm_${salon.id}_${nombre || 'all'}`).setLabel('🗑️ Confirmer la suppression').setStyle(ButtonStyle.Danger), new ButtonBuilder().setCustomId('purge_annuler').setLabel('↩️ Annuler').setStyle(ButtonStyle.Secondary))],
  });
}

async function _handleMesContrats(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const uid = interaction.user.id;
  const mesContrats = (db.contrats || []).filter(c => c.userId === uid || c.emetteurId === uid || c.signataireId === uid).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  if (!mesContrats.length) return interaction.editReply({ content: '📭 Tu n\'as aucun contrat enregistré.' });
  const statutMap = { en_attente: '🟡 En attente', signe: '✅ Signé', refuse: '❌ Refusé', expire: '📁 Expiré' };
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📜 Mes contrats — Iron Wolf Company').setDescription(`*${mesContrats.length} contrat(s) trouvé(s).*`);
  for (const c of mesContrats.slice(0, 10)) { const partenaire = c.clientNom || c.employeurNom || '—'; const echeance = c.dateEcheance ? ` · 📅 ${fmtShort(c.dateEcheance)}` : ''; embed.addFields({ name: `${statutMap[c.status] || c.status} — ${c.id}`, value: `📋 ${c.objet}\n🤝 ${partenaire} · 💰 ${c.remuneration || '—'}${echeance}`, inline: false }); }
  if (mesContrats.length > 10) embed.setFooter({ text: `... et ${mesContrats.length - 10} autre(s) • IWC` }); else embed.setFooter({ text: 'IWC • Mes contrats' });
  await interaction.editReply({ embeds: [embed] });
}

async function _handleAide(interaction) {
  const member = interaction.member; const isDir = isDirection(member); const isIll = member.roles.cache.has(ROLE_POLE_ILLEGAL); const isLeg = member.roles.cache.has(ROLE_POLE_LEGAL);
  const isFleau = member.roles.cache.some(r => ['Fléau','Fleau','Concepteur','Fondateur'].some(n => r.name.toLowerCase().includes(n.toLowerCase())));
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📖 Guide des commandes — IWC');
  embed.addFields({ name: '👤 Profil & Info', value: isMembre(member) ? '`/profil` · `/hierarchie` · `/registre` · `/fiche`' : '`/profil` · `/registre` · `/fiche`', inline: false });
  embed.addFields({ name: '📅 RDV & Agenda', value: '`/rdv` — Créer un RDV\n`/agenda creer` — RDV rapide\n`/agenda voir` — Prochains RDV', inline: false });
  embed.addFields({ name: '🟡 Absences', value: '`/absent [durée]` · `/retour` · `/avertissements`', inline: false });
  embed.addFields({ name: '📜 Contrats', value: '`/contrats` — Tes contrats en cours', inline: false });
  embed.addFields({ name: '🕵️ Renseignement', value: '`/notes` — Dernières notes de terrain\n`/synthese [sujet]` — Synthèse IA sur une personne/lieu\n`/stats-agent` — Statistiques par agent', inline: false });
  if (isLeg || isDir) embed.addFields({ name: '⚖️ Pôle Légal', value: '`/solde` · `/stats` · `/ops` · `/op`', inline: false });
  if (isIll || isDir) embed.addFields({ name: '🔒 Confrérie', value: '`/solde` · `/stats` · `/ops`', inline: false });
  if (isDir) embed.addFields({ name: '🎖️ Direction', value: '`/promo` · `/retro` · `/grade-set` · `/avertir` · `/annuler-absence`\n`/dashboard` · `/bilan` · `/contrats-archives` · `/rapport`\n`/contrats-sync` · `/notion-test` · `/synchroniser` · `/purge` · `/sync` · `/version`', inline: false });
  if (isDir) embed.addFields({ name: '🤝 RDV Client', value: '`/panel-rdv-client` — Installer le panneau\n`/rdv-nettoyer` — Nettoyer les vieux télégrammes', inline: false });
  if (isFleau) embed.addFields({ name: '💀 Fléau & Concepteur', value: '`/op-programmer` · `/patch` · ⚙️ config coffre', inline: false });
  embed.addFields({ name: '🎙️ Micro de terrain', value: 'Programme PC : capture les voix RP et les envoie ici en rapports', inline: false });
  embed.addFields({ name: '🤖 Automatismes', value: 'Trésorerie · Fiches · Identité IC · Plans · Rappels RDV · Absences auto · Briefing 20h · Archivage', inline: false });
  embed.setFooter({ text: 'IWC Bot • Commandes adaptées à ton rôle' });
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

async function _handleSetupServeur(interaction) {
  if (!isFondateurOuFleau(interaction.member)) {
    return interaction.reply({ content: '❌ Réservé au Fondateur uniquement.', flags: MessageFlags.Ephemeral });
  }
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const me = guild.members.me;
  await interaction.editReply({ content: '⏳ Réorganisation en cours... (~60 secondes)' });

  // ── IDs des rôles ──
  const EVERYONE  = guild.roles.everyone.id;
  const VISITEUR  = '1508756369258578070';
  const R_LEGAL   = '1509251285264761053';
  const R_ILLEG   = '1508898841993281658';
  const R_ABSENT  = '1511134028474876035';
  const BOT_ROLE  = me.roles.cache.find(r => r.managed)?.id;
  const DIR_ROLES = guild.roles.cache
    .filter(r => ['Concepteur','Fléau','Fondateur','Directeur','Officier','Co-Directeur'].some(n => r.name.includes(n)))
    .map(r => r.id);

  // Permission bot
  const bot = BOT_ROLE ? [{ id: BOT_ROLE, allow: ['ViewChannel','SendMessages','ManageMessages','EmbedLinks','ReadMessageHistory','AttachFiles','ManageThreads'] }] : [];
  const dir = [...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel','SendMessages','ManageMessages','EmbedLinks','ReadMessageHistory'] })), ...bot];

  // ── Helpers permissions ──
  const p = {
    public:    [{ id: EVERYONE, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...bot],
    visiteurs: [{ id: EVERYONE, deny: ['ViewChannel','SendMessages'] }, { id: VISITEUR, allow: ['ViewChannel','SendMessages'] }, ...bot],
    membres:   [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel','SendMessages'] }, { id: R_ILLEG, allow: ['ViewChannel','SendMessages'] }, ...dir],
    legal:     [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel','SendMessages'] }, ...dir],
    illeg:     [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel','SendMessages'] }, ...dir],
    dir:       [{ id: EVERYONE, deny: ['ViewChannel'] }, ...dir],
    absLegal:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel','SendMessages'] }, { id: R_ABSENT, allow: ['ViewChannel','SendMessages'] }, ...dir],
    absIlleg:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel','SendMessages'] }, { id: R_ABSENT, allow: ['ViewChannel','SendMessages'] }, ...dir],
    legalRO:   [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...dir],
    illegRO:   [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...dir],
    membresRO: [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'], deny: ['SendMessages'] }, { id: R_ILLEG, allow: ['ViewChannel'], deny: ['SendMessages'] }, ...dir],
    catPublic: [{ id: EVERYONE, allow: ['ViewChannel'] }],
    catVisit:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: VISITEUR, allow: ['ViewChannel'] }],
    catMembres:[{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
    catLegal:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_LEGAL, allow: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
    catIlleg:  [{ id: EVERYONE, deny: ['ViewChannel'] }, { id: R_ILLEG, allow: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
    catDir:    [{ id: EVERYONE, deny: ['ViewChannel'] }, ...DIR_ROLES.map(id => ({ id, allow: ['ViewChannel'] }))],
  };

  // ── Structure complète ──
  const STRUCTURE = [
    { name: '📢 GÉNÉRAL', catPerms: p.catPublic, channels: [
      { name: '📣・annonces',    type: 0, perms: p.public,    id: null },
      { name: '📜・règlement',   type: 0, perms: p.public,    id: null },
      { name: '👋・arrivée',     type: 0, perms: p.membresRO, id: null },
      { name: '📅・événements',  type: 0, perms: p.public,    id: null },
    ]},
    { name: '👁️ VISITEURS', catPerms: p.catVisit, channels: [
      { name: '💬・discussion-hrp', type: 0, perms: p.visiteurs, id: null },
      { name: '🔊・attente-vocal',  type: 2, perms: p.visiteurs, id: null },
    ]},
    { name: '💬 COMMUNAUTÉ', catPerms: p.catMembres, channels: [
      { name: '💬・discussion-hrp',   type: 0, perms: p.membres, id: null },
      { name: '💬・discussion-rp',    type: 0, perms: p.membres, id: null },
      { name: '💡・suggestion-idée',  type: 0, perms: p.membres, id: null },
      { name: '📸・screenshots',      type: 0, perms: p.membres, id: null },
      { name: '🎬・clips-temps-fort', type: 0, perms: p.membres, id: null },
      { name: '📋・planning',         type: 0, perms: p.membres, id: null },
    ]},
    { name: '⚖️ PÔLE LÉGAL', catPerms: p.catLegal, channels: [
      { name: '🏛️・hierarchie-iron-wolf-company', type: 0, perms: p.legalRO,  id: null },
      { name: '📜・contrats',                      type: 0, perms: p.legal,    id: null },
      { name: '📁・contrats-reponses',             type: 0, perms: p.dir,      id: null },
      { name: '💰・coffre-entreprise',             type: 0, perms: p.dir,      id: null },
      { name: '📅・agenda',                        type: 0, perms: p.legal,    id: null },
      { name: '📖・histoire-iwc',                  type: 0, perms: p.legalRO,  id: null },
      { name: '🟡・absences',                      type: 0, perms: p.absLegal, id: SALON_HARDCODED.ABSENCES_LEGAL },
      { name: '💬・parlote',                       type: 0, perms: p.legal,    id: null },
      { name: '💬・parlote-hrp',                   type: 0, perms: p.legal,    id: null },
      { name: '🎓・formation',                     type: 0, perms: p.legal,    id: null },
      { name: '🔊・Salon vocal — Légal',            type: 2, perms: p.legal,    id: null },
    ]},
    { name: '🔪 PÔLE ILLÉGAL', catPerms: p.catIlleg, channels: [
      { name: '💀・hierarchie-ombre',        type: 0, perms: p.illegRO,  id: null },
      { name: '📣・annonces-illégal',        type: 0, perms: p.illegRO,  id: null },
      { name: '📜・règlement-illégal',       type: 0, perms: p.illegRO,  id: null },
      { name: '🎖️・grade',                   type: 0, perms: p.illegRO,  id: null },
      { name: '✏️・surnom-pseudo',            type: 0, perms: p.illeg,    id: null },
      { name: '🔒・coffre-illegal',          type: 0, perms: p.dir,      id: null },
      { name: '📅・agenda-illégal',          type: 0, perms: p.illeg,    id: null },
      { name: '📖・histoire-de-la-confrérie',type: 0, perms: p.illegRO,  id: null },
      { name: '🎯・operations',              type: 0, perms: p.illeg,    id: null },
      { name: '🕵️・informateurs',            type: 0, perms: p.dir,      id: null },
      { name: '🗺️・plans',                   type: 0, perms: p.illeg,    id: null },
      { name: '🟡・absences',               type: 0, perms: p.absIlleg, id: SALON_HARDCODED.ABSENCES_ILLEGAL },
      { name: '💬・parlote-ombre',           type: 0, perms: p.illeg,    id: null },
      { name: '💬・parlote-hrp-ombre',       type: 0, perms: p.illeg,    id: null },
      { name: '🔊・Opérations — vocal',      type: 2, perms: p.illeg,    id: null },
    ]},
    { name: '🔒 DIRECTION LÉGAL', catPerms: p.catDir, channels: [
      { name: '⚔️・affaires',            type: 0, perms: p.dir, id: null },
      { name: '👥・backgrounds-membres', type: 0, perms: p.dir, id: null },
      { name: '📁・dossier-recrutement', type: 0, perms: p.dir, id: null },
      { name: '📋・recrutement-interne', type: 0, perms: p.dir, id: null },
      { name: '🔊・Conseil vocal Légal', type: 2, perms: p.dir, id: null },
    ]},
    { name: '🔒 DIRECTION ILLÉGAL', catPerms: p.catDir, channels: [
      { name: '⚔️・affaires',              type: 0, perms: p.dir, id: null },
      { name: '👥・backgrounds-membres',   type: 0, perms: p.dir, id: null },
      { name: '📁・dossier-recrutement',   type: 0, perms: p.dir, id: null },
      { name: '📋・recrutement-interne',   type: 0, perms: p.dir, id: null },
      { name: '🔊・Conseil vocal Illégal', type: 2, perms: p.dir, id: null },
    ]},
    { name: '🎭 ROLEPLAY HRP', catPerms: p.catMembres, channels: [
      { name: '🧑・fiches-personnages',         type: 0, perms: p.membres,   id: null },
      { name: '📖・journal-de-bord',            type: 0, perms: p.dir,       id: SALON_HARDCODED.JOURNAL_DE_BORD },
      { name: '🌍・lore-et-univers',            type: 0, perms: p.membresRO, id: null },
      { name: '⌨️・commandes-slash',            type: 0, perms: p.membres,   id: null },
      { name: '💬・conversation-direction-hrp', type: 0, perms: p.dir,       id: null },
    ]},
    { name: '🔧 BOT', catPerms: p.catDir, channels: [
      { name: '🔇・patch-note', type: 0, perms: p.dir, id: null },
      { name: '📊・logs',       type: 0, perms: p.dir, id: null },
    ]},
  ];

  const clean = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/g,'');
  let created = 0, moved = 0, permsOk = 0, errors = 0;

  for (const catDef of STRUCTURE) {
    try {
      // Trouver ou créer la catégorie
      const catClean = clean(catDef.name.replace(/[^a-z\s]/gi,'').trim());
      let category = guild.channels.cache.find(c =>
        c.type === 4 && clean(c.name).includes(catClean.slice(2))
      );
      if (!category) {
        category = await guild.channels.create({
          name: catDef.name, type: 4,
          permissionOverwrites: catDef.catPerms,
        });
        created++;
      } else {
        await category.permissionOverwrites.set(catDef.catPerms).catch(() => {});
        permsOk++;
      }

      for (const chDef of catDef.channels) {
        await new Promise(r => setTimeout(r, 300));
        try {
          // Trouver le salon : par ID hardcodé en priorité, sinon par nom
          let salon = null;
          if (chDef.id) {
            salon = guild.channels.cache.get(chDef.id);
          }
          if (!salon) {
            const chClean = clean(chDef.name.replace(/[^a-z0-9\s]/gi,'').trim());
            salon = guild.channels.cache.find(c =>
              c.type !== 4 &&
              clean(c.name).includes(chClean.slice(0, Math.min(chClean.length, 12))) &&
              !chDef.name.toLowerCase().includes('illegal') === !c.name.toLowerCase().includes('illegal')
            );
          }

          if (salon) {
            // Déplacer + appliquer permissions
            if (salon.parentId !== category.id) {
              await salon.setParent(category.id, { lockPermissions: false }).catch(() => {});
              moved++;
            }
            await salon.permissionOverwrites.set(chDef.perms).catch(() => {});
            permsOk++;
          } else {
            // Créer le salon
            await guild.channels.create({
              name: chDef.name,
              type: chDef.type,
              parent: category.id,
              permissionOverwrites: chDef.perms,
            });
            created++;
          }
        } catch(e) { errors++; console.log(`❌ Salon ${chDef.name}:`, e.message); }
      }
    } catch(e) { errors++; console.log(`❌ Catégorie ${catDef.name}:`, e.message); }
  }

  const result = `✅ Réorganisation terminée\n\n→ **${created}** créés\n→ **${moved}** déplacés\n→ **${permsOk}** permissions appliquées\n→ **${errors}** erreurs`;
  await interaction.editReply({ content: result });

  const jCh = guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD);
  if (jCh) await jCh.send({ embeds: [new EmbedBuilder()
    .setColor(0x57F287)
    .setTitle('🔧 Réorganisation serveur effectuée')
    .setDescription(`Par **${interaction.user.username}** · ${created} créés · ${moved} déplacés · ${permsOk} permissions · ${errors} erreurs`)
    .setTimestamp()] }).catch(() => {});
}


async function setupPanelDirection(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && (clean(c.name).includes('direction') && (clean(c.name).includes('5') || clean(c.name).includes('nous')))) || guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes('directionnous'));
    if (!ch) return;
    const db = loadDB();
    const msgs = await ch.messages.fetch({ limit: 20 });
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id && m.components?.length > 0) await m.delete().catch(() => {}); }
    const embed = _buildDirectionPanelEmbed(guild, db); const row = _buildDirectionPanelRow();
    const sent = await ch.send({ embeds: [embed], components: [row] });
    db.directionPanelMsgId = sent.id; db.directionPanelChanId = ch.id; saveDB(db);
    console.log('✅ Panel Direction posté');
  } catch(e) { console.log('❌ setupPanelDirection error:', e.message); }
}

function _buildDirectionPanelEmbed(guild, db) {
  const membres = Object.values(db.members || {}); const cands = (db.candidatures || []).filter(c => c.status === 'reçue'); const opsEnCours = (db.operations || []).filter(o => o.status === 'en_cours'); const opsProg = (db.operations || []).filter(o => o.status === 'programmee'); const absents = membres.filter(m => m.status === 'absent');
  const contrats3j = (db.contrats || []).filter(c => { if (c.status !== 'signe' || !c.dateEcheance) return false; const j = Math.floor((new Date(c.dateEcheance) - new Date()) / 86400000); return j >= 0 && j <= 3; });
  const legal = db.coffres?.legal || 0; const illeg = db.coffres?.illegal || 0;
  const ligne = (emoji, label, val, urgent) => `${urgent && val > 0 ? '🔴' : '🟢'} ${emoji} **${label}** — ${val}`;
  return new EmbedBuilder().setColor(0x8B1A1A).setAuthor({ name: 'IWC Setup • Panel Direction', iconURL: guild.iconURL() || undefined }).setTitle('🐺 Tableau de bord — Iron Wolf Company')
    .addFields({ name: '📋 RECRUTEMENT', value: ligne('📥', 'Candidatures en attente', cands.length, true), inline: true }, { name: '🎯 OPÉRATIONS', value: [ligne('🟢', 'En cours', opsEnCours.length, false), ligne('🕐', 'Programmées', opsProg.length, false)].join('\n'), inline: true }, { name: '💰 TRÉSORERIE', value: [`⚖️ Légal : **$${legal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${illeg.toLocaleString('fr-FR')}**`].join('\n'), inline: true }, { name: '👥 MEMBRES', value: [ligne('⚠️', 'Absents', absents.length, false), ligne('📜', 'Contrats expirent ≤3j', contrats3j.length, true)].join('\n'), inline: true })
    .setFooter({ text: `IWC • Panel Direction • MàJ ${new Date().toLocaleString('fr-FR')}` }).setTimestamp();
}

function _buildDirectionPanelRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dir_btn_candidatures').setLabel('📋 Candidatures').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dir_btn_ops').setLabel('🎯 Opérations').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('dir_btn_bilan').setLabel('💰 Bilan').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dir_btn_registre').setLabel('👥 Membres').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dir_btn_refresh').setLabel('🔄').setStyle(ButtonStyle.Secondary),
  );
}

async function updateDirectionPanel(guild) {
  try {
    const db = loadDB(); if (!db.directionPanelMsgId || !db.directionPanelChanId) { await setupPanelDirection(guild); return; }
    const ch = guild.channels.cache.get(db.directionPanelChanId); const msg = await ch?.messages.fetch(db.directionPanelMsgId).catch(() => null);
    if (!msg) { await setupPanelDirection(guild); return; }
    await msg.edit({ embeds: [_buildDirectionPanelEmbed(guild, db)], components: [_buildDirectionPanelRow()] });
  } catch(e) { console.log('❌ updateDirectionPanel:', e.message); }
}

async function setupCommandesSlash(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && clean(c.name).includes(clean('commandes-slash')));
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const botMsgs = msgs.filter(m => m.author.id === guild.members.me?.id && m.embeds.length > 0);
    if (botMsgs.size >= 4) { console.log('✅ #commandes-slash déjà à jour — skip'); return; }
    for (const [, m] of botMsgs) await m.delete().catch(() => {});
    const e1 = new EmbedBuilder().setColor(0x3B82F6).setTitle('📖 COMMANDES — Membres').setDescription('*Commandes accessibles à tous les membres IWC.*').addFields({ name: '👤 Profil & Identité', value: '`/profil` · `/fiche` · `/hierarchie` · `/registre`', inline: false }, { name: '📅 Agenda & RDV', value: '`/rdv` · `/agenda creer` · `/agenda voir`', inline: false }, { name: '🟡 Absences', value: '`/absent [durée]` · `/retour` · `/avertissements`', inline: false }, { name: '📜 Contrats', value: '`/contrats` — Tes contrats en cours', inline: false }, { name: '📊 Stats & Info', value: '`/stats` · `/solde` · `/journal` · `/aide`', inline: false }).setFooter({ text: 'IWC Bot • Commandes membres' });
    const e2 = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🎖️ COMMANDES — Direction').setDescription('*Réservées à la Direction.*').addFields({ name: '⚙️ Gestion membres', value: '`/promo` · `/retro` · `/grade-set` · `/avertir` · `/annuler-absence`', inline: false }, { name: '💰 Trésorerie', value: '`/bilan` · `/contrats-archives` · ⚙️ dans coffre-entreprise', inline: false }, { name: '🎯 Opérations', value: '`/op-programmer` — Lancement automatique', inline: false }, { name: '📊 Rapports', value: '`/dashboard` · `/rapport` · `/stats`', inline: false }, { name: '🛠️ Administration', value: '`/purge` · `/sync` · `/version`', inline: false }).setFooter({ text: 'IWC Bot • Commandes Direction' });
    const e3 = new EmbedBuilder().setColor(0xED4245).setTitle('💀 COMMANDES — Fléau & Concepteur').addFields({ name: '⚙️ Configuration', value: '`/op-programmer` · `/patch` · `/rapport` (auto vendredi 20h)', inline: false }).setFooter({ text: 'IWC Bot • Fléau & Concepteur' });
    const e4 = new EmbedBuilder().setColor(0x555555).setTitle('🤖 AUTOMATISMES — Le bot fait ça tout seul').addFields({ name: '📖 Journal de bord', value: 'Ops, contrats, promos, recrutements → **#journal-de-bord** auto\nRésumé hebdo chaque lundi à 9h', inline: false }, { name: '💰 Trésorerie', value: 'Bouton 💰 → validation Direction si > limite', inline: false }, { name: '🟡 Absences', value: 'Rôle Absent → permissions bloquées → levée auto + DM', inline: false }, { name: '⏰ Rappels', value: 'Rappels 24h + 1h avant RDV Notion · Rappel 30min avant op', inline: false }, { name: '🎭 Identité IC', value: 'Bouton ✏️ dans #surnom-pseudo → Notion auto', inline: false }).setFooter({ text: 'IWC Bot • Automatismes' });
    await ch.send({ embeds: [e1] }); await ch.send({ embeds: [e2] }); await ch.send({ embeds: [e3] }); await ch.send({ embeds: [e4] });
    console.log('✅ Commandes slash postées');
  } catch(e) { console.log('❌ setupCommandesSlash error:', e.message); }
}

// [CORRECTION] setupSurnomFormat — skip si panel avec bouton déjà présent
async function setupSurnomFormat(guild) {
  try {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.isTextBased?.() && (clean(c.name).includes('surnompseudo') || clean(c.name).includes('surnom')));
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.components?.length > 0 && m.embeds[0]?.title?.includes('IDENTITÉ'));
    if (existing) { console.log('✅ Panel surnom-pseudo déjà présent — skip'); return; }
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    await ch.send({
      embeds: [new EmbedBuilder().setColor(0x8B1A1A).setTitle('🎭 IDENTITÉ IC — Iron Wolf Company').setDescription(['*Renseignez votre identité In Character pour faciliter les interactions RP.*', '*Notion et le Registre des Membres sont mis à jour automatiquement.*', '', '**Cliquez le bouton ci-dessous pour renseigner votre identité.**', '*Un formulaire s\'ouvre avec les champs à remplir.*'].join('\n')).setFooter({ text: 'IWC • Identité IC • Mis à jour automatiquement dans Notion' })],
      components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_surnom_ouvrir').setLabel('✏️ Renseigner mon identité IC').setStyle(ButtonStyle.Primary))],
    });
    console.log('✅ Panel surnom-pseudo posté');
  } catch(e) { console.log('❌ setupSurnomFormat error:', e.message); }
}

async function _ouvrirModalAgendaSimple(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau RDV — IWC').setDescription('**Étape 1/2** — Choisis le lieu du rendez-vous')],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('agenda_lieu_select').setPlaceholder('Choisir un lieu...').addOptions([
      { label: 'Saint Denis', value: 'Saint Denis', description: 'La grande ville du sud' },
      { label: 'Valentine', value: 'Valentine', description: 'Ville du nord-ouest' },
      { label: 'Armadillo', value: 'Armadillo', description: 'Ville désertique du sud' },
      { label: 'Annesburg', value: 'Annesburg', description: 'Ville minière du nord-est' },
      { label: 'Strawberry', value: 'Strawberry', description: 'Ville des montagnes' },
      { label: 'Emerald Ranch', value: 'Emerald Ranch', description: 'Ranch a l\'est' },
      { label: 'Tumbleweed', value: 'Tumbleweed', description: 'Ville fantôme du désert' },
      { label: 'Lagras', value: 'Lagras', description: 'Village des marais' },
      { label: 'Flatneck Station', value: 'Flatneck Station', description: 'Station ferroviaire' },
      { label: 'Roanoke Ridge', value: 'Roanoke Ridge', description: 'Région sauvage du nord' },
      { label: 'Tall Trees', value: 'Tall Trees', description: 'Foret de l\'ouest' },
      { label: 'Rhodes', value: 'Rhodes', description: 'Ville du comté de Lemoyne' },
      { label: 'Blackwater', value: 'Blackwater', description: 'Ville moderne de West Elizabeth' },
      { label: 'Thieves Landing', value: 'Thieves Landing', description: 'Port des hors-la-loi' },
      { label: 'Autre lieu', value: 'Autre', description: 'Lieu personnalisé à préciser' },
    ]))],
  });
}

async function _handleAgendaLieuSelect(interaction) {
  const lieu = interaction.values[0];
  const lieuEnc = encodeURIComponent(lieu);
  await interaction.update({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau RDV — IWC').setDescription(`**📍 Lieu sélectionné : ${lieu}**\n\nClique sur le bouton ci-dessous pour remplir les détails du RDV.`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`btn_rdv_modal_${lieuEnc}`).setLabel('📝 Remplir les détails du RDV').setStyle(ButtonStyle.Primary))],
  });
}

// [CORRECTION] _handleRdvModalBtn — était dans isStringSelectMenu, maintenant dans isButton
async function _handleRdvModalBtn(interaction) {
  const lieu = decodeURIComponent(interaction.customId.replace('btn_rdv_modal_', ''));
  const modal = new ModalBuilder().setCustomId(`modal_agenda_simple_${encodeURIComponent(lieu)}`).setTitle(`📅 RDV — ${lieu === 'Autre' ? 'Lieu personnalisé' : lieu}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre du RDV').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: Réunion Direction, Entretien...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu_detail').setLabel(lieu === 'Autre' ? 'Lieu précis' : `Détail du lieu (optionnel)`).setStyle(TextInputStyle.Short).setRequired(lieu === 'Autre').setValue(lieu !== 'Autre' ? lieu : '').setPlaceholder(`Ex: Mairie de ${lieu}...`)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes / Ordre du jour (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('Points à aborder, informations importantes...')),
  );
  await interaction.showModal(modal);
}

// [CORRECTION] _validerModalAgendaSimple — collecteurs corrects + photo optionnelle

// Map clés internes → libellés exacts Notion (colonne Taper/Type)
const RDV_TYPE_NOTION_MAP = {
  'reunion_direction':  '👑 Direction de la réunion',
  'rdv_client':         '🤝 Rendez-vous Client',
  'briefing_op':        '🎯 Opération de briefing',
  'debrief_op':         '📊 Opération de débriefing',
  'entretien_recru':    '🎯 Entretien Recrutement',
  'reunion_legal':      '⚖️ Pôle de réunion légal',
  'reunion_confrerie':  '🔒 Réunion Confrérie',
  'formation':          '🎓 Membres de la formation',
  'negociation':        '🤝 Négociation',
  'rdv_medical':        '🏥 Rendez-vous Médical',
  'rdv_juridique':      '⚖️ Rendez-vous Juridique',
  'autre':              '📋 Autre',
  'RDV':                '📋 Autre',
  'Convocation individuelle': '📋 Autre',
};

const RDV_VILLE_NOTION_MAP = {
  'Saint Denis':      '🏛️ Saint Denis',
  'Valentine':        '🤠 Valentin',
  'Armadillo':        '🌿 Tatou',
  'Annesburg':        '⛏️ Annesburg',
  'Strawberry':       '🍓 Fraise',
  'Emerald Ranch':    '🐃 Emerald Ranch',
  'Tumbleweed':       '🌵 Tumbleweed',
  'Lagras':           '🐊 Lagras',
  'Flatneck Station': '🚂 Gare de Flatneck',
  'Roanoke Ridge':    '🏔️ Crête de Roanoke',
  'Tall Trees':       '🌲 Grands arbres',
  'Rhodes':           '🐎 Rhodes',
  'Blackwater':       '🌆 Blackwater',
  'Thieves Landing':  '🔥 Le Débarquement des Voleurs',
  'Autre':            '❗ Autre lieu',
};

const RDV_MODE_NOTION_MAP = {
  'role':        '📢 Par rôle - tout le pôle',
  'individuel':  '👤 Par nom IC individuel',
};

async function _validerModalAgendaSimple(interaction) {
  await interaction.deferReply();
  const titre      = interaction.fields.getTextInputValue('titre');
  const dateRaw    = interaction.fields.getTextInputValue('date');
  const heure      = interaction.fields.getTextInputValue('heure');
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim() || '';
  const lieuVille  = interaction.customId.replace('modal_agenda_simple_', '').replace('modal_agenda_simple', '');
  const lieu       = lieuDetail || (lieuVille ? decodeURIComponent(lieuVille) : '—');
  const notes      = interaction.fields.getTextInputValue('notes') || '';
  let dateISO = null;
  try {
    const p = dateRaw.trim().split(/[\/\-.]/).map(x => x.trim());
    if (p.length >= 2) {
      const jour = p[0].padStart(2, '0');
      const mois = p[1].padStart(2, '0');
      let annee = p[2] || String(new Date().getFullYear());
      if (annee.length === 2) annee = '20' + annee;
      const candidat = `${annee}-${mois}-${jour}`;
      // Vérifier que la date est réellement valide
      const test = new Date(candidat + 'T12:00:00');
      if (!isNaN(test.getTime())) dateISO = candidat;
    }
  } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA (ex: 15/08/2026).' });
  const db = loadDB();
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const dateObj = new Date(dateISO + 'T12:00:00');
  const dateAffiche = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = isNaN(dateObj.getTime()) ? dateRaw : (dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1));
  const skipId = `rdv_skip_photo_${interaction.id}`;
  await interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📸 Photo de repérage — optionnelle').setDescription(`**📅 ${titre}** — ${heure} à ${lieu}\n\n**Option 1 :** Envoie une capture d\'écran du lieu dans ce salon\n**Option 2 :** Clique **Ignorer** pour poster le RDV sans photo\n\n*Tu as 2 minutes.*`)],
    components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(skipId).setLabel('⏭️ Ignorer la photo').setStyle(ButtonStyle.Secondary))],
  });
  let photoUrl = null;
  try {
    const photoFilter = m => m.author.id === interaction.user.id && m.attachments.size > 0 && m.channel.id === interaction.channel.id;
    const btnFilter   = i => i.user.id === interaction.user.id && i.customId === skipId;
    await new Promise((resolve) => {
      const msgCollector = interaction.channel.createMessageCollector({ filter: photoFilter, max: 1, time: 120000 });
      const btnCollector = interaction.channel.createMessageComponentCollector({ filter: btnFilter, max: 1, time: 120000 });
      msgCollector.on('collect', async msg => { photoUrl = msg.attachments.first().url; btnCollector.stop('photo'); resolve(); });
      btnCollector.on('collect', async i => { await i.deferUpdate().catch(() => {}); msgCollector.stop('skip'); resolve(); });
      msgCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
      btnCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
    });
  } catch {}
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📅 ${titre.toUpperCase()}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — AVIS DE RENDEZ-VOUS\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields({ name: '🆔 Référence', value: '`' + rdvId + '`', inline: true }, { name: '📅 Date', value: dateCapital, inline: true }, { name: '🕐 Heure', value: `**${heure}**`, inline: true }, { name: '📍 Lieu', value: lieu, inline: true }, { name: '✍️ Créé par', value: emetteurIC, inline: true });
  if (notes) embed.addFields({ name: '📋 Notes', value: notes });
  if (photoUrl) embed.setImage(photoUrl);
  embed.setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();
  // Poster dans le bon salon selon le pôle du membre
  const isIlleg = interaction.member?.roles?.cache?.has(ROLE_POLE_ILLEGAL);
  const poleLabel = isIlleg ? '🔒 Illégal' : '⚖️ Légal';
  // Ne pinger que si le rôle existe VRAIMENT sur le serveur (évite "@rôle inconnu")
  const roleIdCible = isIlleg ? ROLE_POLE_ILLEGAL : ROLE_POLE_LEGAL;
  const roleExiste  = interaction.guild.roles.cache.has(roleIdCible);
  const pingRole    = roleExiste ? `<@&${roleIdCible}>` : '';
  let agendaCh;
  if (isIlleg) {
    agendaCh = interaction.guild.channels.cache.get(SALON_HARDCODED.AGENDA_ILLEGAL)
      || getChById(interaction.guild, 'AGENDA_ILLEGAL', 'agenda-illegal', 'agenda-illégal');
  } else {
    agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  }
  if (agendaCh) await agendaCh.send({ content: `${pingRole ? pingRole + ' — ' : ''}📅 **${titre}** · ${heure} à ${lieu}`, embeds: [embed], allowedMentions: { parse: [], roles: roleExiste ? [roleIdCible] : [] } }).catch(() => {});
  const salonLabel = isIlleg ? '#agenda-illégal' : '#agenda';
  const confirmMsg = await interaction.editReply({ content: photoUrl ? '✅ RDV créé avec photo de repérage !' : `✅ RDV créé et posté dans ${salonLabel} !`, embeds: [], components: [] });
  // Supprimer le message intermédiaire "Nouveau RDV — Étape 1/2" dans #contrats
  try {
    const ch = interaction.channel;
    const msgs = await ch.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id === interaction.client.user.id &&
          (m.embeds[0]?.title?.includes('Nouveau RDV') || m.embeds[0]?.description?.includes('Étape'))) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    const propsBase = {
      'Titre':    { title:     [{ text: { content: titre } }] },
      'Date':     { date:      { start: dateISO } },
      'Lieu':             { rich_text: [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':           { select:    { name: 'Planifié' } },
      'Type':             { select:    { name: RDV_TYPE_NOTION_MAP['RDV'] || '📋 Autre' } },
      'Pôle':             { select:    { name: isIlleg ? '🔒 Illégal' : '⚖️ Légal' } },
      'Mode de convocation': { select: { name: RDV_MODE_NOTION_MAP['role'] } },
      'Villes RDR2':      { select:    { name: RDV_VILLE_NOTION_MAP[lieuVille ? decodeURIComponent(lieuVille) : 'Autre'] || RDV_VILLE_NOTION_MAP['Autre'] } },
    };
    // L'image va TOUJOURS dans le contenu de la page (marche même sans colonne Photo)
    const children = photoUrl ? [
      { object: 'block', type: 'image', image: { type: 'external', external: { url: photoUrl } } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '📸 Photo de repérage', link: { url: photoUrl } } }] } },
    ] : [];
    // Tentative 1 : avec la colonne Photo
    const propsAvecPhoto = { ...propsBase, ...(photoUrl ? { 'Photo': { files: [{ name: 'reperage.jpg', type: 'external', external: { url: photoUrl } }] } } : {}) };
    (async () => {
      let res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: propsAvecPhoto, children }) });
      if (res.ok) { console.log(`✅ RDV archivé Notion : ${titre}`); return; }
      const err = await res.json().catch(() => ({}));
      console.log(`⚠️ RDV Notion: 1ère tentative refusée (${res.status}) : ${(err.message || '').slice(0, 200)}`);
      // Tentative 2 : SANS la colonne Photo (l'image reste dans le contenu de la page)
      res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: propsBase, children }) });
      if (res.ok) { console.log(`✅ RDV archivé Notion (sans colonne Photo, image dans la page) : ${titre}`); return; }
      const err2 = await res.json().catch(() => ({}));
      console.log(`❌ RDV Notion échec total (${res.status}) : ${(err2.message || '').slice(0, 200)}`);
    })().catch(e => console.log('❌ Notion RDV error:', e.message));
  }
}

async function _ouvrirMenuRdvSlash(interaction) {
  await interaction.reply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau RDV — Iron Wolf Company').setDescription('**Étape 1/2** — Choisis le lieu du rendez-vous')],
    components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('agenda_lieu_select').setPlaceholder('📍 Choisir un lieu RDR2...').addOptions([
      { label: '🏛 Saint Denis', value: 'Saint Denis', description: 'La grande ville du Sud' },
      { label: '🤠 Valentine', value: 'Valentine', description: 'Ville du Nord' },
      { label: '🌵 Armadillo', value: 'Armadillo', description: 'Village du désert' },
      { label: '⛏ Annesburg', value: 'Annesburg', description: 'Ville minière du Nord-Est' },
      { label: '🏔 Strawberry', value: 'Strawberry', description: 'Ville de montagne' },
      { label: '🌾 Emerald Ranch', value: 'Emerald Ranch', description: 'Ranch du Heartlands' },
      { label: '🏜 Tumbleweed', value: 'Tumbleweed', description: 'Ville fantôme de Gaptooth' },
      { label: '🌊 Lagras', value: 'Lagras', description: 'Village des marais' },
      { label: '🏕 Flatneck Station', value: 'Flatneck Station', description: 'Station du Heartlands' },
      { label: '🏞 Roanoke Ridge', value: 'Roanoke Ridge', description: 'Region sauvage du Nord' },
      { label: '🗻 Tall Trees', value: 'Tall Trees', description: 'Foret de West Elizabeth' },
      { label: '🏘 Rhodes', value: 'Rhodes', description: 'Ville du Lemoyne' },
      { label: '🌁 Blackwater', value: 'Blackwater', description: 'Ville moderne du Sud' },
      { label: '⛪ Thieves Landing', value: 'Thieves Landing', description: 'Port du Flat Iron Lake' },
      { label: '📍 Autre lieu', value: 'Autre', description: 'Preciser le lieu manuellement' },
    ]))],
  });
}

async function _ouvrirMenuRdv(interaction) {
  const msgId = interaction.customId ? interaction.customId.replace('btn_rdv_creer_', '') : interaction.id;
  const options = [
    { label: '👑 Reunion Direction', value: 'reunion_direction', description: 'Réunion interne Direction' },
    { label: '🤝 Rendez-vous Client', value: 'rdv_client', description: 'RDV avec un client externe' },
    { label: '🎯 Briefing Operation', value: 'briefing_op', description: 'Brief avant une opération' },
    { label: '📊 Debrief Operation', value: 'debrief_op', description: 'Retour après opération' },
    { label: '🔍 Entretien Recrutement', value: 'entretien_recru', description: 'Entretien candidat' },
    { label: '⚖ Reunion Pole Legal', value: 'reunion_legal', description: 'Réunion Iron Wolf Company' },
    { label: '🔒 Reunion Confrerie', value: 'reunion_confrerie', description: 'Réunion La Confrérie' },
    { label: '🎓 Formation Membres', value: 'formation', description: 'Session de formation' },
    { label: '🤝 Negociation', value: 'negociation', description: 'Négociation commerciale' },
    { label: '🏥 Rendez-vous Medical', value: 'rdv_medical', description: 'Consultation médicale IC' },
    { label: '📋 Rendez-vous Juridique', value: 'rdv_juridique', description: 'Consultation juridique IC' },
    { label: '📝 Autre', value: 'autre', description: 'Autre type de rendez-vous' },
  ];
  return interaction.reply({
    flags: MessageFlags.Ephemeral,
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 1/2** — Sélectionne le type de rendez-vous.')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rdv_type_select_${msgId}`)
        .setPlaceholder('Type de rendez-vous...')
        .addOptions(options)
    )],
  });
}

async function _handleRdvTypeSelect(interaction) {
  await interaction.deferUpdate();
  const typeRdv = interaction.values[0];
  const msgId = interaction.customId.replace('rdv_type_select_', '');
  return interaction.editReply({
    embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 2/3** — Comment convoquer ?')],
    components: [new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId(`rdv_mode_select_${typeRdv}_${msgId}`)
        .setPlaceholder('Mode de convocation...')
        .addOptions([
          { label: '📢 Par role - tout le pole', value: 'role', description: 'Convoque tout le pôle légal ou illégal' },
          { label: '👤 Par nom IC individuel', value: 'individuel', description: 'Sélectionne des membres spécifiques' },
        ])
    )],
  });
}

async function _handleRdvModeSelect(interaction) {
  await interaction.deferUpdate();
  const mode = interaction.values[0]; const allParts = interaction.customId.replace('rdv_mode_select_', '').split('_'); const typeRdv = allParts.slice(0, -1).join('_'); const msgId = allParts[allParts.length - 1];
  if (mode === 'role') {
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 3/3** — Quel groupe convoquer ?')],
      components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rdv_pole_select_${typeRdv}_${msgId}`).setPlaceholder('Choisir le groupe...').addOptions([
        { label: '⚖ Pole Legal Iron Wolf', value: 'legal', description: 'Convoque tout le pôle légal' },
        { label: '🔒 La Confrerie', value: 'illegal', description: 'Convoque tout le pôle illégal' },
        { label: '👥 Tout le monde', value: 'tous', description: 'Convoque les deux pôles' },
        { label: '👑 Direction seule', value: 'direction', description: 'Convoque la Direction uniquement' },
        { label: '🤝 Communauté / Visiteur', value: 'communaute', description: 'RDV avec une personne précise (hors compagnie)' },
      ]))],
    });
  } else {
    const db = loadDB();
    const membres = Object.entries(db.members || {})
      .filter(([, m]) => m.name && m.status !== 'parti')
      .map(([id, m]) => ({
        label: String(m.name || m.username || id).slice(0, 100),
        value: String(id).slice(0, 100),
        description: m.username ? String(m.username).slice(0, 100) : undefined,
      }))
      .filter(o => o.label.length > 0 && o.value.length > 0)
      .slice(0, 25);
    if (!membres.length) { await interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('❌ Aucun membre IC enregistré')], components: [] }); return; }
    await interaction.editReply({
      embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 Nouveau Rendez-vous — IWC').setDescription('**Étape 3/3** — Sélectionne les participants (max 25)')],
      components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rdv_individuel_select_${typeRdv}_${msgId}`).setPlaceholder('Choisir les participants...').setMinValues(1).setMaxValues(Math.min(membres.length, 25)).addOptions(membres))],
    });
  }
}

async function _handleRdvIndividuelSelect(interaction) {
  const selectedIds = interaction.values; const allParts = interaction.customId.replace('rdv_individuel_select_', '').split('_'); const typeRdv = allParts.slice(0, -1).join('_');
  const db = loadDB(); if (!db._rdvPending) db._rdvPending = {}; db._rdvPending[interaction.id] = { type: 'individuel', ids: selectedIds }; saveDB(db);
  const typeLabels = { reunion_direction: 'Réunion Direction', rdv_client: 'Rendez-vous Client', briefing_op: 'Briefing Opération', debrief_op: 'Débrief Opération', entretien_recru: 'Entretien Recrutement', reunion_legal: 'Réunion Pôle Légal', reunion_confrerie: 'Réunion Confrérie', formation: 'Formation Membres', negociation: 'Négociation', rdv_medical: 'Rendez-vous Médical', rdv_juridique: 'Rendez-vous Juridique', autre: 'Autre' };
  const typeLabel = typeLabels[typeRdv] || 'Rendez-vous';
  const modal = new ModalBuilder().setCustomId(`modal_rdv_individuel_${interaction.id}`).setTitle(`📅 ${typeLabel}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre / Objet du RDV').setStyle(TextInputStyle.Short).setRequired(true).setValue(typeLabel).setPlaceholder('Ex: Réunion stratégique...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure de convocation').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Mairie de Saint Denis...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Ordre du jour / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('Points à aborder...')),
  );
  await interaction.showModal(modal);
}

async function _handleRdvPoleSelect(interaction) {
  const pole = interaction.values[0]; const allParts = interaction.customId.replace('rdv_pole_select_', '').split('_'); const typeRdv = allParts.slice(0, -1).join('_');
  const typeLabels = { reunion_direction: 'Réunion Direction', rdv_client: 'Rendez-vous Client', briefing_op: 'Briefing Opération', debrief_op: 'Débrief Opération', entretien_recru: 'Entretien Recrutement', reunion_legal: 'Réunion Pôle Légal', reunion_confrerie: 'Réunion Confrérie', formation: 'Formation Membres', negociation: 'Négociation', rdv_medical: 'Rendez-vous Médical', rdv_juridique: 'Rendez-vous Juridique', autre: 'Autre' };
  const typeLabel = typeLabels[typeRdv] || 'Rendez-vous';

  // ── Cas spécial Communauté / Visiteur : choisir une personne précise ──
  if (pole === 'communaute') {
    const membresComm = interaction.guild.members.cache.filter(m =>
      !m.user.bot && m.roles.cache.some(r => /visiteur|communaut/i.test(r.name))
    );
    if (!membresComm.size) {
      return interaction.update({ embeds: [new EmbedBuilder().setColor(0xED4245).setTitle('🤝 Communauté / Visiteur').setDescription('Aucun membre avec un rôle **Visiteur** ou **Communauté** trouvé sur le serveur.')], components: [] });
    }
    const options = [...membresComm.values()].slice(0, 25).map(m => ({ label: (m.displayName || m.user.username).slice(0, 100), value: m.id, description: `@${m.user.username}`.slice(0, 100), emoji: '🤝' }));
    return interaction.update({
      embeds: [new EmbedBuilder().setColor(0x2C3E50).setTitle('🤝 Rendez-vous Communauté').setDescription('**Personne à convoquer** — choisis qui recevra ce rendez-vous.')],
      components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`rdv_comm_person_${typeRdv}`).setPlaceholder('Choisir la personne...').addOptions(options))],
    });
  }

  const modal = new ModalBuilder().setCustomId(`modal_rdv_${pole}_${typeRdv}`).setTitle(`📅 ${typeLabel}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre / Objet du RDV').setStyle(TextInputStyle.Short).setRequired(true).setValue(typeLabel).setPlaceholder('Ex: Réunion stratégique...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 05/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure de convocation').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu de rendez-vous').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Mairie de Saint Denis...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Ordre du jour / Notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('Points à aborder...')),
  );
  await interaction.showModal(modal);
}

// ═══ CONTRAT D'ENGAGEMENT (système séparé) ═══
const ENGAGEMENT_ARCHIVE_CH = '1513253567119495368';
const ENGAGEMENT_ROLE_ID = '1513255402031022142';

// ═══ CONTRAT DE MISSION (Confrérie / pôle illégal) — /mission ═══
async function _validerModalMission(interaction) {
  try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); }
  catch (e) { console.log('⚠️ Mission defer impossible:', e.message); return; }

  const cible = interaction.fields.getTextInputValue('cible');
  const lieu = interaction.fields.getTextInputValue('lieu') || '—';
  const motif = interaction.fields.getTextInputValue('motif');
  const remuneration = interaction.fields.getTextInputValue('remuneration') || 'À confirmer.';
  const contact = interaction.fields.getTextInputValue('contact') || '—';

  // Référence auto-incrémentée
  const db = loadDB();
  db.missionCounter = (db.missionCounter || 0) + 1;
  const ref = `Contrat-${String(db.missionCounter).padStart(3, '0')}`;
  saveDB(db);

  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });

  const embed = new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('📜 CONTRAT — DOSSIER CLASSÉ')
    .setDescription('🔒 **CONFIDENTIEL — CONFRÉRIE UNIQUEMENT**\n*Ne pas diffuser. Silence exigé, même en cas de refus.*')
    .addFields(
      { name: '🏷️ Référence', value: ref, inline: true },
      { name: '📅 Ouvert le', value: dateStr, inline: true },
      { name: '⚖️ Statut', value: 'En attente de validation', inline: true },
      { name: '🎯 Cible', value: `**${cible}**` },
      { name: '📍 Lieu / repères', value: lieu, inline: true },
      { name: '✍️ Ouvert par', value: `<@${interaction.user.id}>`, inline: true },
      { name: '⚖️ Motif', value: motif.slice(0, 1000) },
      { name: '📋 Conditions', value: '• Méthode physique, sanction marquante.\n• ⚠️ **PAS DE BAVURE — la cible ne doit PAS y rester.**\n• Une seule cible, aucune erreur tolérée.\n• Escalade possible si récidive.' },
      { name: '📸 Notre condition', value: 'Une **photographie de la cible entre nos mains** = preuve que le message est passé.' },
      { name: '💵 Rémunération', value: remuneration },
      { name: '🚫 SECRET ABSOLU', value: '**Bouche cousue. On n\'en parle À PERSONNE.**\nNi aux proches, ni aux frères hors contrat, **ni aux shérifs**.\nLe moindre mot qui sort = trahison. Et la trahison se règle.' },
      { name: '🤫 Règles d\'opération', value: '⛔ **Bandana relevé en permanence** — aucun visage à découvert.\n👕 **Tenue neutre** — rien qui rattache à la Confrérie / IWC.\n🐎 Monture & matériel sans signe distinctif.\n🗣️ Aucun nom ni affiliation prononcés sur le terrain.' },
      { name: '📨 Contact', value: contact },
      { name: '✅ Marche à suivre', value: '1️⃣ Validation des frères\n2️⃣ Réception des repères\n3️⃣ Préparation discrète (tenue, bandana, matériel propre)\n4️⃣ Exécution → photographie de la cible\n5️⃣ Retour par télégramme → RDV de clôture' },
    )
    .setFooter({ text: 'Les choses vont vite. On ne traîne pas. — God bless Texas.' })
    .setTimestamp();

  // 1) Publier dans le salon où la commande a été tapée (et mémoriser le message)
  let salonOK = false;
  try {
    const msg = await interaction.channel.send({ embeds: [embed] });
    salonOK = true;
    // Mémoriser pour pouvoir éditer l'embed plus tard via /mission-statut
    db.missions = db.missions || {};
    db.missions[ref] = { messageId: msg.id, channelId: interaction.channel.id, cible, statut: 'En attente', createdAt: new Date().toISOString() };
    saveDB(db);
  } catch (e) { console.log('⚠️ Mission publication:', e.message); }

  // 2) Archiver dans Notion (optionnel — base NOTION_MISSIONS_DB)
  let notionOK = false;
  const DB = process.env.NOTION_MISSIONS_DB || null;
  if (process.env.NOTION_TOKEN && DB) {
    try {
      const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
      const props = {
        'Référence':    { title: [{ text: { content: ref } }] },
        'Cible':        { rich_text: [{ text: { content: cible } }] },
        'Lieu':         { rich_text: [{ text: { content: lieu } }] },
        'Motif':        { rich_text: [{ text: { content: motif.slice(0, 1900) } }] },
        'Rémunération': { rich_text: [{ text: { content: remuneration } }] },
        'Contact':      { rich_text: [{ text: { content: contact } }] },
        'Statut':       { select: { name: 'En attente' } },
        'Date':         { date: { start: new Date().toISOString().split('T')[0] } },
      };
      let res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: props }) });
      if (res.ok) notionOK = true;
      else {
        const e1 = await res.json().catch(() => ({}));
        console.log(`⚠️ Mission Notion: ${(e1.message || '').slice(0, 150)}`);
        // retry minimal
        res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: { 'Référence': props['Référence'], 'Cible': props.Cible, 'Statut': props.Statut, 'Date': props.Date } }) });
        if (res.ok) notionOK = true;
      }
    } catch (e) { console.log('❌ Mission Notion error:', e.message); }
  }

  await interaction.editReply({ content: [
    `✅ **Contrat ${ref} publié !**`,
    '',
    `📁 Salon : ${salonOK ? '✅' : '⚠️'}`,
    `📓 Notion : ${notionOK ? '✅' : (DB ? '⚠️' : '— (non configuré)')}`,
  ].join('\n') });
}

async function _ouvrirModalEngagement(interaction) {
  try {
  const cibleId = interaction.customId.replace('engagement_signer_', '');
  // Seule la personne destinataire peut signer (ou la signature libre via son propre clic)
  const modal = new ModalBuilder().setCustomId(`modal_engagement_${cibleId}`).setTitle('✒️ Contrat d\'Engagement — IWC');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Identité — Nom & Prénom du personnage').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : Viktor Crane')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('alias').setLabel('Surnom / Nom de rue (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder('Ex : « Le Corbeau »')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('fonction').setLabel('Affectation souhaitée — pôle & poste').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex : Pôle Légal — Agent de terrain')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('parrain').setLabel('Membre qui vous présente (parrain)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder('Ex : June McCall')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('serment').setLabel('Serment — recopiez le texte ci-dessous').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Recopiez ici le serment affiche dans le contrat (Article VIII).')),
  );
  await interaction.showModal(modal);
  } catch (e) {
    console.log('⚠️ Ouverture formulaire engagement impossible:', e.message);
    try { await interaction.reply({ content: '⚠️ Une erreur est survenue à l\'ouverture du contrat. Préviens la Direction.', flags: MessageFlags.Ephemeral }); } catch {}
  }
}

async function _validerModalEngagement(interaction) {
  try { await interaction.deferReply({ flags: MessageFlags.Ephemeral }); }
  catch (e) { console.log('⚠️ Engagement defer impossible (interaction expirée):', e.message); return; }
  const nom = interaction.fields.getTextInputValue('nom');
  const alias = interaction.fields.getTextInputValue('alias') || '—';
  const fonction = interaction.fields.getTextInputValue('fonction');
  const parrain = interaction.fields.getTextInputValue('parrain') || '—';
  const serment = interaction.fields.getTextInputValue('serment');
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  const heureStr = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

  const embed = new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle('📜 CONTRAT D\'ENGAGEMENT — IRON WOLF COMPANY')
    .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   ENGAGEMENT OFFICIEL — COMPAGNIE IRON WOLF\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields(
      { name: '👤 Recrue', value: nom, inline: true },
      { name: '🎭 Alias', value: alias, inline: true },
      { name: '⚖️ Pôle & Fonction', value: fonction, inline: true },
      { name: '🤝 Présenté par', value: parrain, inline: true },
      { name: '🖋️ Signature Discord', value: `<@${interaction.user.id}>`, inline: true },
      { name: '📅 Signé le', value: `${dateStr} à ${heureStr}`, inline: true },
      { name: '✒️ Serment prêté', value: `*« ${serment.slice(0, 900)} »*` },
    )
    .setFooter({ text: 'Iron Wolf Company • Document officiel archivé' })
    .setTimestamp();

  // 1. Archiver dans le salon dédié
  let salonOK = false;
  try {
    const ch = await client.channels.fetch(ENGAGEMENT_ARCHIVE_CH).catch(() => null);
    if (ch) { await ch.send({ embeds: [embed] }); salonOK = true; }
  } catch (e) { console.log('❌ Engagement salon error:', e.message); }

  // 2. Archiver dans Notion (base contrats d'engagement, optionnelle)
  let notionOK = false;
  const DB = process.env.NOTION_ENGAGEMENTS_DB || null;
  if (process.env.NOTION_TOKEN && DB) {
    try {
      const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
      const propsBase = {
        'Nom': { title: [{ text: { content: nom } }] },
        'Alias': { rich_text: [{ text: { content: alias } }] },
        'Pôle & Fonction': { rich_text: [{ text: { content: fonction } }] },
        'Présenté par': { rich_text: [{ text: { content: parrain } }] },
        'Serment': { rich_text: [{ text: { content: serment.slice(0, 1900) } }] },
        'Date': { date: { start: new Date().toISOString().split('T')[0] } },
      };
      // L'ID Discord est mis dans le contenu de la page (toujours), et tenté en colonne texte
      const childrenPage = [{ object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: `Discord ID : ${interaction.user.id} · Pseudo : ${interaction.user.username}` } }] } }];
      // Tentative 1 : avec Discord ID en colonne texte
      let res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: { ...propsBase, 'Discord ID': { rich_text: [{ text: { content: interaction.user.id } }] } }, children: childrenPage }) });
      if (res.ok) notionOK = true;
      else {
        const e1 = await res.json().catch(() => ({}));
        console.log(`⚠️ Engagement Notion (tentative 1): ${(e1.message || '').slice(0, 150)}`);
        // Tentative 2 : SANS la colonne Discord ID (au cas où elle est mal typée) — l'ID reste dans la page
        res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: propsBase, children: childrenPage }) });
        if (res.ok) { notionOK = true; console.log('✅ Engagement archivé (sans colonne Discord ID — mets-la en type Texte dans Notion).'); }
        else { const e2 = await res.json().catch(() => ({})); console.log(`❌ Engagement Notion échec: ${(e2.message || '').slice(0, 150)}`); }
      }
    } catch (e) { console.log('❌ Engagement Notion error:', e.message); }
  }

  // 3. Attribuer le rôle "Engagé"
  let roleOK = false;
  try {
    const guildId = process.env.GUILD_ID || interaction.guild?.id || client.guilds.cache.first()?.id;
    const guild = client.guilds.cache.get(guildId);
    if (guild) {
      const membre = await guild.members.fetch(interaction.user.id).catch(() => null);
      const role = guild.roles.cache.get(ENGAGEMENT_ROLE_ID);
      if (membre && role) { await membre.roles.add(role); roleOK = true; }
    }
  } catch (e) { console.log('❌ Engagement rôle error:', e.message); }

  await interaction.editReply({ content: [
    '✅ **Contrat d\'engagement signé !** Bienvenue dans l\'Iron Wolf Company.',
    '',
    `📁 Archivé dans le salon : ${salonOK ? '✅' : '⚠️'}`,
    `📓 Notion : ${notionOK ? '✅' : (DB ? '⚠️' : '— (non configuré)')}`,
    `🎖️ Rôle « Engagé » : ${roleOK ? '✅' : '⚠️ (vérifie que le bot peut gérer ce rôle)'}`,
  ].join('\n') });
}

async function _handleRdvCommPersonSelect(interaction) {
  const personId = interaction.values[0];
  const typeRdv = interaction.customId.replace('rdv_comm_person_', '');
  const typeLabels = { reunion_direction: 'Réunion Direction', rdv_client: 'Rendez-vous Client', briefing_op: 'Briefing Opération', debrief_op: 'Débrief Opération', entretien_recru: 'Entretien Recrutement', formation: 'Formation Membres', negociation: 'Négociation', rdv_medical: 'Rendez-vous Médical', rdv_juridique: 'Rendez-vous Juridique', autre: 'Autre' };
  const typeLabel = typeLabels[typeRdv] || 'Rendez-vous';
  const modal = new ModalBuilder().setCustomId(`modal_rdv_comm_${personId}`).setTitle(`🤝 ${typeLabel}`.slice(0, 45));
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Titre / Objet du RDV').setStyle(TextInputStyle.Short).setRequired(true).setValue(typeLabel).setPlaceholder('Ex: Rencontre, négociation...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 15/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('heure').setLabel('Heure').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 21h00')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu de rendez-vous').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: Saloon de Valentine...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes / Détails').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400)),
  );
  await interaction.showModal(modal);
}

async function _validerModalRdvCommunaute(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const personId = interaction.customId.replace('modal_rdv_comm_', '');
  const titre = interaction.fields.getTextInputValue('titre');
  const dateRaw = interaction.fields.getTextInputValue('date');
  const heure = interaction.fields.getTextInputValue('heure');
  const lieu = interaction.fields.getTextInputValue('lieu') || '—';
  const notes = interaction.fields.getTextInputValue('notes') || '';

  // Date robuste
  let dateISO = null;
  try {
    const p = dateRaw.trim().split(/[\/\-.]/).map(x => x.trim());
    if (p.length >= 2) { const j = p[0].padStart(2,'0'); const m = p[1].padStart(2,'0'); let a = p[2] || String(new Date().getFullYear()); if (a.length === 2) a = '20'+a; const cand = `${a}-${m}-${j}`; if (!isNaN(new Date(cand+'T12:00:00').getTime())) dateISO = cand; }
  } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA (ex: 15/06/2026).' });

  const dateObj = new Date(dateISO + 'T12:00:00');
  const dateAffiche = dateObj.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const db = loadDB();
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;

  const personne = await interaction.guild.members.fetch(personId).catch(() => null);
  const personLabel = personne ? (personne.displayName || personne.user.username) : 'Invité';

  const embed = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`🤝 ${titre.toUpperCase()}`)
    .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — INVITATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields(
      { name: '🆔 Référence', value: '`' + rdvId + '`', inline: true },
      { name: '👤 Invité', value: personne ? `<@${personId}>` : personLabel, inline: true },
      { name: '📅 Date', value: dateCapital, inline: true },
      { name: '🕐 Heure', value: `**${heure}**`, inline: true },
      { name: '📍 Lieu', value: lieu, inline: true },
      { name: '✍️ Organisé par', value: emetteurIC, inline: true },
    );
  if (notes) embed.addFields({ name: '📋 Notes', value: notes });
  embed.setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();

  // Poster dans l'agenda communauté dédié + ping la personne
  const agendaComm = interaction.guild.channels.cache.get('1512717271313944678');
  if (agendaComm) {
    await agendaComm.send({ content: `<@${personId}> — 🤝 **${titre}** · ${heure} à ${lieu}`, embeds: [embed], allowedMentions: { users: [personId] } }).catch(() => {});
  }

  // Archiver dans Notion (agenda)
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    const props = {
      'Titre': { title: [{ text: { content: `${titre} — ${personLabel}` } }] },
      'Date':  { date: { start: dateISO } },
      'Lieu':  { rich_text: [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':{ select: { name: 'Planifié' } },
      'Pôle':  { select: { name: '🤝 Communauté' } },
    };
    (async () => {
      let res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: props }) });
      if (res.ok) { console.log(`✅ RDV communauté archivé Notion : ${titre}`); return; }
      // Retry minimal si une colonne manque (ex: Pôle sans option Communauté)
      res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: { 'Titre': props.Titre, 'Date': props.Date, 'Lieu': props.Lieu, 'Statut': props.Statut } }) });
      if (res.ok) console.log(`✅ RDV communauté archivé (sans Pôle) : ${titre}`);
      else { const e = await res.json().catch(() => ({})); console.log(`❌ RDV communauté Notion échec : ${(e.message||'').slice(0,150)}`); }
    })().catch(e => console.log('❌ RDV communauté Notion error:', e.message));
  }

  // MP à l'invité
  if (personne) {
    await personne.send({ embeds: [new EmbedBuilder().setColor(0x8B5A2A).setTitle('🤝 Invitation — Iron Wolf Company').setDescription(`Vous êtes convié(e) à un rendez-vous.\n\n**${titre}**\n📅 ${dateCapital}\n🕐 ${heure}\n📍 ${lieu}${notes ? '\n\n📋 ' + notes : ''}`).setFooter({ text: 'Iron Wolf Company' })] }).catch(() => {});
  }

  await interaction.editReply({ content: `✅ Rendez-vous **${rdvId}** créé pour **${personLabel}** et posté dans l'agenda communauté.` });
}

async function _validerModalRdvIndividuel(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB(); const pendingId = interaction.customId.replace('modal_rdv_individuel_', '');
  const pending = db._rdvPending?.[pendingId]; if (!pending) return interaction.editReply({ content: '❌ Session expirée. Recommence avec /rdv.' });
  const titre = interaction.fields.getTextInputValue('titre'); const dateRaw = interaction.fields.getTextInputValue('date'); const heure = interaction.fields.getTextInputValue('heure'); const lieu = interaction.fields.getTextInputValue('lieu') || '—'; const notes = interaction.fields.getTextInputValue('notes') || '';
  let dateISO = null; try { const p = dateRaw.split('/'); if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);
  const participants = pending.ids.map(id => db.members[id]?.name || id);
  const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle(`📅 ${titre.toUpperCase()}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — CONVOCATION PRIVÉE\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields({ name: '🆔 Référence', value: '`' + rdvId + '`', inline: true }, { name: '📅 Date', value: dateCapital, inline: true }, { name: '🕐 Heure', value: `**${heure}**`, inline: true }, { name: '📍 Lieu', value: lieu, inline: true }, { name: '✍️ Convoqué par', value: emetteurIC, inline: true }, { name: `👥 Participants (${participants.length})`, value: participants.join(', ') || '—' })
    .setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();
  if (notes) embed.addFields({ name: '📋 Ordre du jour', value: notes });
  // Détecter le pôle de l'émetteur pour poster dans le bon salon
  const emetteurPole = db.members[interaction.user.id]?.pole || 'legal';
  let agendaCh;
  if (emetteurPole === 'illegal') {
    agendaCh = interaction.guild.channels.cache.get(SALON_HARDCODED.AGENDA_ILLEGAL)
      || getChById(interaction.guild, 'AGENDA_ILLEGAL', 'agenda-illegal', 'agenda-illégal');
  } else {
    agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  }
  const mentionsMembres = pending.ids.map(id => `<@${id}>`).join(' ');
  if (agendaCh) await agendaCh.send({ content: `${mentionsMembres} — 📅 Convocation : **${titre}** · ${heure} à ${lieu}`, embeds: [embed] }).catch(() => {});
  for (const uid of pending.ids) { await envoyerDMRecap(interaction.guild, uid, 'rdv', { titre, date: dateCapital, heure, lieu, notes }).catch(() => {}); }
  delete db._rdvPending[pendingId]; saveDB(db);
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    fetch('https://api.notion.com/v1/pages', { method: 'POST', headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' }, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: {
      'Titre':        { title:        [{ text: { content: titre } }] },
      'Date':         { date:         { start: dateISO } },
      'Lieu':             { rich_text:    [{ text: { content: lieu !== '—' ? lieu : '' } }] },
      'Lieu':             { rich_text:    [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':           { select:       { name: 'Planifié' } },
      'Type':             { select:       { name: RDV_TYPE_NOTION_MAP['Convocation individuelle'] || '📋 Autre' } },
      'Pôle':             { select:       { name: emetteurPole === 'illegal' ? '🔒 Illégal' : '⚖️ Légal' } },
      'Mode de convocation': { select:    { name: RDV_MODE_NOTION_MAP['individuel'] } },
      'Villes RDR2':      { select:       { name: RDV_VILLE_NOTION_MAP[lieu] || RDV_VILLE_NOTION_MAP['Autre'] } },
      'Participants':     { multi_select: participants.map(n => ({ name: n })) },
      'Notif 1h':     { checkbox: true },
      'Notif 15min':  { checkbox: true },
    } }) }).then(async res => {
      const data = await res.json().catch(() => ({}));
      if (res.ok) console.log(`✅ RDV individuel archivé Notion : ${titre}`);
      else console.log(`❌ Notion RDV individuel erreur complet:`, JSON.stringify(data).slice(0, 500));
    }).catch(e => console.log('❌ Notion RDV individuel error:', e.message));
  }
  await interaction.editReply({ content: `✅ Convocation envoyée à ${participants.join(', ')} !`, embeds: [], components: [] });
  try {
    const ch = interaction.channel;
    const msgs = await ch.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id === interaction.client.user.id &&
          (m.embeds[0]?.title?.includes('Nouveau Rendez-vous') || m.embeds[0]?.description?.includes('Étape'))) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
}

async function _validerModalRdv(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const rawId = interaction.customId.replace('modal_rdv_', '');
  const parts = rawId.split('_');
  const pole = parts[0];
  // Le lieu est encodé en dernier si vient de _handleRdvLieuSelect
  let lieuFromMenu = null;
  try { lieuFromMenu = decodeURIComponent(parts[parts.length - 1]); } catch {}
  const knownVilles = ['Saint Denis','Valentine','Armadillo','Annesburg','Strawberry','Emerald Ranch','Tumbleweed','Lagras','Flatneck Station','Roanoke Ridge','Tall Trees','Rhodes','Blackwater','Thieves Landing','Autre'];
  const hasLieuInId = knownVilles.includes(lieuFromMenu);
  const typeRdv = hasLieuInId ? parts.slice(1, -1).join('_') : parts.slice(1).join('_');
  const titre = interaction.fields.getTextInputValue('titre'); const dateRaw = interaction.fields.getTextInputValue('date'); const heure = interaction.fields.getTextInputValue('heure');
  const lieuDetail = interaction.fields.getTextInputValue('lieu_detail').trim();
  const lieu = lieuDetail || (hasLieuInId && lieuFromMenu !== 'Autre' ? lieuFromMenu : '—');
  const notes = interaction.fields.getTextInputValue('notes') || '';
  const lieuNotionKey = hasLieuInId ? lieuFromMenu : lieu;
  let dateISO = null; try { const p = dateRaw.split('/'); if (p.length === 3) dateISO = `${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`; } catch {}
  if (!dateISO) return interaction.editReply({ content: '❌ Format de date invalide. Utilise JJ/MM/AAAA.' });
  const rdvId = `RDV-${Date.now().toString().slice(-5)}`;
  const db = loadDB(); const emetteurIC = db.members[interaction.user.id]?.name || interaction.user.username;
  const dateAffiche = new Date(dateISO).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
  const dateCapital = dateAffiche.charAt(0).toUpperCase() + dateAffiche.slice(1);
  const poleMap = { legal: { label: 'Pole Legal', roleId: ROLE_POLE_LEGAL, color: 0x3B82F6 }, illegal: { label: 'La Confrerie', roleId: ROLE_POLE_ILLEGAL, color: 0x8B1A1A }, tous: { label: 'Tous les membres', roleId: null, color: 0x2C3E50 }, direction: { label: 'Direction', roleId: null, color: 0xFFD700 } };
  const poleCfg = poleMap[pole] || poleMap.tous;
  const embed = new EmbedBuilder().setColor(poleCfg.color).setTitle(`📅 ${titre.toUpperCase()}`).setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n   IRON WOLF COMPANY — CONVOCATION\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields({ name: '🆔 Référence', value: '`' + rdvId + '`', inline: true }, { name: '📅 Date', value: dateCapital, inline: true }, { name: '🕐 Heure', value: `**${heure}**`, inline: true }, { name: '📍 Lieu', value: lieu, inline: true }, { name: '👥 Destinataires', value: poleCfg.label, inline: true }, { name: '✍️ Convoqué par', value: emetteurIC, inline: true })
    .setFooter({ text: `Iron Wolf Company • ${fmtShort(new Date())}` }).setTimestamp();
  if (notes) embed.addFields({ name: '📋 Ordre du jour', value: notes });
  // Poster dans le bon salon selon le pôle
  let agendaCh;
  if (pole === 'illegal') {
    agendaCh = interaction.guild.channels.cache.get(SALON_HARDCODED.AGENDA_ILLEGAL)
      || getChById(interaction.guild, 'AGENDA_ILLEGAL', 'agenda-illegal', 'agenda-illégal');
  } else {
    agendaCh = getChById(interaction.guild, 'AGENDA', 'agenda');
  }
  let mention = ''; if (poleCfg.roleId) mention = `<@&${poleCfg.roleId}>`; else if (pole === 'direction') mention = getMention(interaction.guild); else mention = `<@&${ROLE_POLE_LEGAL}> <@&${ROLE_POLE_ILLEGAL}>`;
  if (agendaCh) await agendaCh.send({ content: `${mention} — 📅 **${titre}** · ${heure} à ${lieu}`, embeds: [embed] }).catch(() => {});
  if (poleCfg.roleId) {
    const roleMembers = interaction.guild.members.cache.filter(m => m.roles.cache.has(poleCfg.roleId) && !m.user.bot);
    for (const [uid] of roleMembers) { await envoyerDMRecap(interaction.guild, uid, 'rdv', { titre, date: dateCapital, heure, lieu }).catch(() => {}); }
  } else if (pole === 'direction') {
    const dirs = interaction.guild.members.cache.filter(m => isDirection(m) && !m.user.bot);
    for (const [uid] of dirs) { await envoyerDMRecap(interaction.guild, uid, 'rdv', { titre, date: dateCapital, heure, lieu }).catch(() => {}); }
  }
  if (process.env.NOTION_TOKEN && process.env.NOTION_AGENDA_DB_ID) {
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    const propsBase = {
      'Titre':    { title:     [{ text: { content: titre } }] },
      'Date':     { date:      { start: dateISO } },
      'Lieu':             { rich_text: [{ text: { content: (`${lieu !== '—' ? lieu + '\n' : ''}${heure ? 'Heure : ' + heure + '\n' : ''}${notes}`).slice(0, 2000) } }] },
      'Statut':           { select:    { name: 'Planifié' } },
      'Type':             { select:    { name: RDV_TYPE_NOTION_MAP[typeRdv] || '📋 Autre' } },
      'Pôle':             { select:    { name: pole === 'illegal' ? '🔒 Illégal' : pole === 'direction' ? '👑 Direction' : pole === 'tous' ? '👑 Tous' : '⚖️ Légal' } },
      'Mode de convocation': { select: { name: RDV_MODE_NOTION_MAP['role'] } },
      'Villes RDR2':      { select:    { name: RDV_VILLE_NOTION_MAP[lieu] || RDV_VILLE_NOTION_MAP['Autre'] } },
      'Notif 24h':  { checkbox: true },
      'Notif 1h':   { checkbox: true },
      'Notif 15min':{ checkbox: true },
    };
    const children = photoUrl ? [
      { object: 'block', type: 'image', image: { type: 'external', external: { url: photoUrl } } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ type: 'text', text: { content: '📸 Photo de repérage', link: { url: photoUrl } } }] } },
    ] : [];
    const propsAvecPhoto = { ...propsBase, ...(photoUrl ? { 'Photo': { files: [{ name: 'reperage.jpg', type: 'external', external: { url: photoUrl } }] } } : {}) };
    (async () => {
      let res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: propsAvecPhoto, children }) });
      if (res.ok) { console.log(`✅ RDV pôle archivé Notion : ${titre}`); return; }
      const err = await res.json().catch(() => ({}));
      console.log(`⚠️ RDV pôle Notion: 1ère tentative refusée (${res.status}) : ${(err.message || '').slice(0, 200)}`);
      res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_AGENDA_DB_ID }, properties: propsBase, children }) });
      if (res.ok) { console.log(`✅ RDV pôle archivé Notion (sans colonne Photo, image dans la page) : ${titre}`); return; }
      const err2 = await res.json().catch(() => ({}));
      console.log(`❌ RDV pôle Notion échec total (${res.status}) : ${(err2.message || '').slice(0, 200)}`);
    })().catch(e => console.log('❌ Notion RDV pôle error:', e.message));
  }
  const salonLabel = pole === 'illegal' ? '#agenda-illégal' : '#agenda';

  // ── Attente photo optionnelle ──
  const skipPhotoId = `rdv_skip_photo_${interaction.id}`;
  await interaction.editReply({
    content: `✅ RDV **${titre}** posté dans ${salonLabel} !

📸 **Photo de repérage optionnelle** — envoie une image dans ce salon ou clique **Ignorer**.`,
    embeds: [],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(skipPhotoId).setLabel('⏭️ Ignorer la photo').setStyle(ButtonStyle.Secondary)
    )],
  });

  let photoUrl = null;
  try {
    const photoFilter = m => m.author.id === interaction.user.id && m.attachments.size > 0 && m.channel.id === interaction.channel.id;
    const btnFilter   = i => i.user.id === interaction.user.id && i.customId === skipPhotoId;
    await new Promise((resolve) => {
      const msgCollector = interaction.channel.createMessageCollector({ filter: photoFilter, max: 1, time: 60000 });
      const btnCollector = interaction.channel.createMessageComponentCollector({ filter: btnFilter, max: 1, time: 60000 });
      msgCollector.on('collect', async msg => { photoUrl = msg.attachments.first().url; btnCollector.stop('photo'); resolve(); });
      btnCollector.on('collect', async i => { await i.deferUpdate().catch(() => {}); msgCollector.stop('skip'); resolve(); });
      msgCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
      btnCollector.on('end', (_, reason) => { if (reason !== 'photo') resolve(); });
    });
  } catch {}

  // Si photo → mettre à jour l'embed dans #agenda avec la photo
  if (photoUrl && agendaCh) {
    try {
      const msgs = await agendaCh.messages.fetch({ limit: 5 });
      const rdvMsg = msgs.find(m => m.author.id === interaction.client.user.id && m.embeds[0]?.title?.includes(titre.toUpperCase()));
      if (rdvMsg) {
        const newEmbed = EmbedBuilder.from(rdvMsg.embeds[0]).setImage(photoUrl);
        await rdvMsg.edit({ embeds: [newEmbed] });
      }
    } catch {}
  }

  await interaction.editReply({
    content: photoUrl ? `✅ RDV **${titre}** posté avec photo dans ${salonLabel} !` : `✅ RDV **${titre}** planifié dans ${salonLabel} !`,
    components: [],
  });

  // Nettoyer les messages intermédiaires dans le salon
  try {
    const ch = interaction.channel;
    const msgs = await ch.messages.fetch({ limit: 10 });
    for (const [, m] of msgs) {
      if (m.author.id === interaction.client.user.id &&
          (m.embeds[0]?.title?.includes('Nouveau Rendez-vous') || m.embeds[0]?.description?.includes('Étape'))) {
        await m.delete().catch(() => {});
      }
    }
  } catch {}
}

async function _ouvrirModalSurnom(interaction) {
  const db = loadDB(); const m = db.members[interaction.user.id];
  const modal = new ModalBuilder().setCustomId('modal_surnom_identite').setTitle('🎭 Identité IC — Iron Wolf Company');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom_ic').setLabel('Nom IC').setStyle(TextInputStyle.Short).setRequired(true).setValue(m?.name || '').setPlaceholder('Ex: Jonas Caverly')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('surnom_ic').setLabel('Surnom IC (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setValue(m?.surnom || '').setPlaceholder('Ex: Le Loup, L\'Ombre...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('pseudo_discord').setLabel('Pseudo Discord').setStyle(TextInputStyle.Short).setRequired(true).setValue(interaction.user.username).setPlaceholder('Ton pseudo Discord actuel')),
  );
  await interaction.showModal(modal);
}

async function _validerModalSurnom(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const nomIC = interaction.fields.getTextInputValue('nom_ic').trim(); const surnomIC = interaction.fields.getTextInputValue('surnom_ic').trim(); const pseudoDiscord = interaction.fields.getTextInputValue('pseudo_discord').trim();
  if (!nomIC) return interaction.editReply({ content: '❌ Le nom IC est obligatoire.' });
  const db = loadDB(); if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  db.members[interaction.user.id].name     = nomIC;
  db.members[interaction.user.id].surnom   = surnomIC || null;
  db.members[interaction.user.id].username = pseudoDiscord;
  db.members[interaction.user.id].lastActivity = new Date().toISOString();
  saveDB(db);
  await _syncSurnomNotion({ content: `NOM IC: ${nomIC}\nSURNOM IC: ${surnomIC || ''}\nPSEUDO DISCORD: ${pseudoDiscord}`, discordId: interaction.user.id, pseudoDiscord });
  const nomComplet = surnomIC ? `${nomIC} dit « ${surnomIC} »` : nomIC;
  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Identité IC enregistrée').addFields({ name: '🎭 Nom IC', value: nomIC, inline: true }, ...(surnomIC ? [{ name: '🐺 Surnom', value: surnomIC, inline: true }] : []), { name: '💬 Pseudo Discord', value: pseudoDiscord, inline: true }).setDescription('*Ton identité IC a été synchronisée avec Notion.*').setFooter({ text: 'IWC • Registre des Membres' })] });
  try {
    await interaction.member?.setNickname(nomComplet).catch(() => {});
  } catch {}
  console.log(`✅ Identité IC : ${nomIC} (${interaction.user.username})`);
}


// ── Handler sélection durée absence ──
async function _handleAbsentDureeSelect(interaction) {
  await interaction.deferUpdate();
  const valeur = interaction.values[0];

  // Cas "programmer" → ouvrir modal avec dates début/fin
  if (valeur === 'programmer') {
    const modal = new ModalBuilder()
      .setCustomId('modal_absent_programmer')
      .setTitle('📅 Programmer une absence');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date_debut')
          .setLabel('Date de début (JJ/MM/AAAA)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 10/06/2026')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('date_fin')
          .setLabel('Date de fin (JJ/MM/AAAA)')
          .setStyle(TextInputStyle.Short)
          .setRequired(true)
          .setPlaceholder('Ex: 17/06/2026')
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('raison')
          .setLabel('Raison (optionnel)')
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder('Ex: vacances, travail, IRL...')
      ),
    );
    await interaction.followUp({ flags: MessageFlags.Ephemeral, content: '📅 Remplis les dates de ton absence :' });
    // showModal nécessite interaction originale → on ne peut pas après deferUpdate
    // Workaround : bouton intermédiaire
    await interaction.editReply({
      embeds: [new EmbedBuilder()
        .setColor(0xFFA500)
        .setTitle('📅 Programmer une absence')
        .setDescription('Clique le bouton ci-dessous pour saisir tes dates.')
      ],
      components: [new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_absent_programmer')
          .setLabel('📅 Saisir mes dates')
          .setStyle(ButtonStyle.Primary)
      )],
    });
    return;
  }

  // Calculer la date de fin selon la valeur choisie
  const maintenant = new Date();
  let dureeLabel = '';
  let finAbsence = null;

  switch (valeur) {
    case '1_soir':
      dureeLabel = 'Ce soir';
      finAbsence = new Date(maintenant);
      finAbsence.setHours(23, 59, 0, 0);
      break;
    case '1_jour':
      dureeLabel = '1 jour';
      finAbsence = new Date(maintenant.getTime() + 1 * 86400000);
      break;
    case '2_jours':
      dureeLabel = '2 jours';
      finAbsence = new Date(maintenant.getTime() + 2 * 86400000);
      break;
    case '3_jours':
      dureeLabel = '3 jours';
      finAbsence = new Date(maintenant.getTime() + 3 * 86400000);
      break;
    case '1_semaine':
      dureeLabel = '1 semaine';
      finAbsence = new Date(maintenant.getTime() + 7 * 86400000);
      break;
    case '2_semaines':
      dureeLabel = '2 semaines';
      finAbsence = new Date(maintenant.getTime() + 14 * 86400000);
      break;
    case '1_mois':
      dureeLabel = '1 mois';
      finAbsence = new Date(maintenant.getTime() + 30 * 86400000);
      break;
    case 'indetermine':
      dureeLabel = 'Indéterminée';
      finAbsence = null;
      break;
  }

  // Demander la raison via modal léger
  const modal = new ModalBuilder()
    .setCustomId(`modal_absent_${valeur}`)
    .setTitle(`🟡 Absence — ${dureeLabel}`);
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId('raison')
        .setLabel('Raison (optionnel)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder('Ex: vacances, travail, IRL...')
    ),
  );

  // Stocker la durée en attente
  const db = loadDB();
  if (!db._absencePending) db._absencePending = {};
  db._absencePending[interaction.user.id] = {
    dureeLabel,
    finAbsence: finAbsence ? finAbsence.toISOString() : null,
  };
  saveDB(db);

  // Afficher bouton pour ouvrir le modal raison
  await interaction.editReply({
    embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle(`🟡 Absence — ${dureeLabel}`)
      .setDescription(finAbsence
        ? `Retour prévu : **${finAbsence.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })}**

Clique pour confirmer.`
        : `Durée **indéterminée** — tu utiliseras \`/retour\` quand tu reviens.

Clique pour confirmer.`
      )
    ],
    components: [new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`btn_absent_confirmer_${valeur}`)
        .setLabel('✅ Confirmer mon absence')
        .setStyle(ButtonStyle.Danger),
      new ButtonBuilder()
        .setCustomId('btn_absent_annuler')
        .setLabel('↩️ Annuler')
        .setStyle(ButtonStyle.Secondary),
    )],
  });
}

// ── Handler bouton confirmation absence ──
// Routing dans isButton()
// btn_absent_confirmer_VALEUR → confirmer
// btn_absent_programmer → ouvrir modal dates

// ── Handler modal absence programmée ──
async function _validerModalAbsentProgramme(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const dateDebutRaw = interaction.fields.getTextInputValue('date_debut').trim();
  const dateFinRaw   = interaction.fields.getTextInputValue('date_fin').trim();
  const raison       = interaction.fields.getTextInputValue('raison').trim() || '—';

  // Parser les dates JJ/MM/AAAA
  const parseDate = (s) => {
    const p = s.split('/');
    if (p.length !== 3) return null;
    const d = new Date(`${p[2]}-${p[1].padStart(2,'0')}-${p[0].padStart(2,'0')}`);
    return isNaN(d.getTime()) ? null : d;
  };

  const dateDebut = parseDate(dateDebutRaw);
  const dateFin   = parseDate(dateFinRaw);

  if (!dateDebut || !dateFin) {
    return interaction.editReply({ content: '❌ Dates invalides. Utilise le format JJ/MM/AAAA.' });
  }
  if (dateFin <= dateDebut) {
    return interaction.editReply({ content: '❌ La date de fin doit être après la date de début.' });
  }

  const debutLabel = dateDebut.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  const finLabel   = dateFin.toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
  const nbJours    = Math.ceil((dateFin - dateDebut) / 86400000);
  const dureeLabel = `Du ${debutLabel} au ${finLabel} (${nbJours} jour${nbJours > 1 ? 's' : ''})`;

  // Si l'absence est dans le futur → programmer (pas encore absent)
  const estFuture = dateDebut > new Date();

  await _enregistrerAbsence(interaction, guild, dureeLabel, dateFin.toISOString(), raison, estFuture ? dateDebut.toISOString() : null);
}

// ── Fonction centrale enregistrement absence ──
async function _enregistrerAbsence(interaction, guild, dureeLabel, finAbsence, raison, debutProgramme = null) {
  const db = loadDB();
  if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  const m = db.members[interaction.user.id];

  const estProgrammee = debutProgramme && new Date(debutProgramme) > new Date();

  if (estProgrammee) {
    // Absence programmée → enregistrer pour activation future
    m.absenceProgrammee = {
      debut: debutProgramme,
      fin: finAbsence,
      raison,
      dureeLabel,
    };
    saveDB(db);
    const debutAff = new Date(debutProgramme).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' });
    const finAff   = finAbsence ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Indéterminé';
    await interaction.editReply({ embeds: [new EmbedBuilder()
      .setColor(0x5865F2)
      .setTitle('📅 Absence programmée')
      .addFields(
        { name: '📅 Début', value: debutAff, inline: true },
        { name: '📅 Fin prévue', value: finAff, inline: true },
        { name: '📝 Raison', value: raison, inline: false },
      )
      .setDescription('*Ton absence sera activée automatiquement à la date de début.*')
      .setFooter({ text: 'IWC • /retour pour revenir à tout moment' })
    ]});
    return;
  }

  // Absence immédiate
  m.status       = 'absent';
  m.absentJusqu  = finAbsence;
  m.absentRaison = raison;
  m.lastActivity = new Date().toISOString();
  saveDB(db);

  const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (membreDiscord) {
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(() => {});
  }

  await notionExtra.majStatutActiviteNotion?.(interaction.user.id, 'absent');
  _syncMembreNotion(interaction.user.id, { status: 'absent', lastActivity: new Date().toISOString() }).catch(() => {});
  _syncStatutFicheNotion(interaction.user.id, 'Absent').catch(() => {});
  await sendLog(guild, 'ABSENCE', { userId: interaction.user.id, username: interaction.user.username });

  const retourStr = finAbsence
    ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
    : 'Indéterminé';

  await interaction.editReply({ embeds: [new EmbedBuilder()
    .setColor(0xFFA500)
    .setTitle('🟡 Absence enregistrée')
    .addFields(
      { name: '⏱️ Durée', value: dureeLabel, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setDescription('*Tu peux encore lire les salons. Utilise `/retour` pour revenir à tout moment.*')
    .setFooter({ text: 'IWC • /retour pour revenir à tout moment' })
  ]});

  // Poster dans #absences
  const absCh = getAbsencesCh(guild, membreDiscord);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
    .setColor(0xFFA500)
    .setAuthor({ name: `${membreDiscord?.displayName || interaction.user.username} — Absence`, iconURL: interaction.user.displayAvatarURL() })
    .setTitle(`🟡 Déclaration d'absence`)
    .addFields(
      { name: '👤 Membre', value: `<@${interaction.user.id}>`, inline: true },
      { name: '⏱️ Durée', value: dureeLabel, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setFooter({ text: `IWC • ${fmtShort(new Date())}` }).setTimestamp()
  ]}).catch(() => {});
}


async function _ouvrirModalAbsentProgrammer(interaction) {
  const modal = new ModalBuilder().setCustomId('modal_absent_programmer').setTitle('📅 Programmer une absence');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_debut').setLabel('Date de début (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 10/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date_fin').setLabel('Date de fin (JJ/MM/AAAA)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 17/06/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Raison (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: vacances, travail, IRL...')),
  );
  await interaction.showModal(modal);
}

async function _confirmerAbsence(interaction) {
  await interaction.deferUpdate();
  const valeur = interaction.customId.replace('btn_absent_confirmer_', '');
  const db = loadDB();
  const pending = db._absencePending?.[interaction.user.id];
  if (!pending) return interaction.editReply({ content: '❌ Session expirée. Recommence avec /absent.' });
  delete db._absencePending[interaction.user.id];
  saveDB(db);
  await _enregistrerAbsence(interaction, interaction.guild, pending.dureeLabel, pending.finAbsence, '—');
}

// ── Validation modal absence ──
async function _validerModalAbsent(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const guild = interaction.guild;
  const dureeRaw = interaction.fields.getTextInputValue('duree').trim();
  const raison   = interaction.fields.getTextInputValue('raison').trim() || '—';
  // Mode lecture-seule par défaut : la personne peut lire mais pas écrire
  const modeLectureSeule = true;

  // Calculer la date de retour depuis la durée saisie
  let finAbsence = null;
  const d = dureeRaw.toLowerCase();
  if (d.includes('indét') || d.includes('indeter')) finAbsence = null;
  else if (d.match(/(\d+)\s*jour/)) finAbsence = new Date(Date.now() + parseInt(d.match(/(\d+)/)[1]) * 86400000).toISOString();
  else if (d.match(/(\d+)\s*semaine/)) finAbsence = new Date(Date.now() + parseInt(d.match(/(\d+)/)[1]) * 7 * 86400000).toISOString();
  else if (d.match(/(\d+)\s*mois/)) finAbsence = new Date(Date.now() + parseInt(d.match(/(\d+)/)[1]) * 30 * 86400000).toISOString();
  else if (d.includes('jusqu')) {
    // "jusqu'au 15 juin" → chercher une date
    const dateMatch = dureeRaw.match(/(\d{1,2})[\/\s]([a-zéûôàèù]+|\d{1,2})(?:[\/\s](\d{4}))?/i);
    if (dateMatch) {
      const months = { jan: 0, fév: 1, fev: 1, mar: 2, avr: 3, mai: 4, juin: 5, jul: 6, aoû: 7, aou: 7, sep: 8, oct: 9, nov: 10, déc: 11, dec: 11 };
      const day = parseInt(dateMatch[1]);
      const monthRaw = dateMatch[2].toLowerCase().slice(0, 3);
      const month = months[monthRaw] ?? (parseInt(dateMatch[2]) - 1);
      const year = dateMatch[3] ? parseInt(dateMatch[3]) : new Date().getFullYear();
      finAbsence = new Date(year, isNaN(month) ? 0 : month, day).toISOString();
    }
  }

  const db = loadDB();
  if (!db.members[interaction.user.id]) db.members[interaction.user.id] = {};
  db.members[interaction.user.id].status       = 'absent';
  db.members[interaction.user.id].absentJusqu  = finAbsence;
  db.members[interaction.user.id].absentRaison = raison;
  db.members[interaction.user.id].absentMode   = modeLectureSeule ? 'lecture-seule' : 'absent-total';
  db.members[interaction.user.id].lastActivity = new Date().toISOString();
  saveDB(db);

  const membreDiscord = await guild.members.fetch(interaction.user.id).catch(() => null);
  if (membreDiscord) {
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent) await membreDiscord.roles.add(roleAbsent).catch(() => {});
    if (!modeLectureSeule) {
      // Mode absent-total : bloquer aussi la lecture
      await _bloquerEcritureAbsent(guild, membreDiscord);
    }
    // Mode lecture-seule (défaut) : le rôle Absent gère les perms d'écriture via les permissions du rôle
    // La personne peut encore lire tous les salons
  }

  await notionExtra.majStatutActiviteNotion?.(interaction.user.id, 'absent');
  _syncMembreNotion(interaction.user.id, { status: 'absent', lastActivity: new Date().toISOString() }).catch(() => {});
  _syncStatutFicheNotion(interaction.user.id, 'Absent').catch(() => {});
  await sendLog(guild, 'ABSENCE', { userId: interaction.user.id, username: interaction.user.username });

  const retourStr = finAbsence
    ? new Date(finAbsence).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' })
    : 'Indéterminé';

  await interaction.editReply({ embeds: [new EmbedBuilder().setColor(0xFFA500).setTitle('🟡 Absence enregistrée')
    .addFields(
      { name: '⏱️ Durée', value: dureeRaw, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setDescription("*Tu peux encore lire les salons. L'écriture sera bloquée selon les permissions du rôle Absent.*")
    .setFooter({ text: 'IWC • /retour pour revenir à tout moment' })] });

  // Poster dans #absences
  const absCh = getAbsencesCh(guild, interaction.member);
  if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0xFFA500)
    .setAuthor({ name: `${interaction.member?.displayName || interaction.user.username} — Absence`, iconURL: interaction.user.displayAvatarURL() })
    .setTitle('🟡 Déclaration d\'absence')
    .addFields(
      { name: '👤 Membre', value: `<@${interaction.user.id}>`, inline: true },
      { name: '⏱️ Durée', value: dureeRaw, inline: true },
      { name: '📅 Retour prévu', value: retourStr, inline: true },
      { name: '📝 Raison', value: raison, inline: false },
    )
    .setFooter({ text: `IWC • ${fmtShort(new Date())}` }).setTimestamp()] }).catch(() => {});

  // Sync Notion absences
  if (process.env.NOTION_TOKEN && process.env.NOTION_MEMBRES_DB) {
    _syncMembreNotion(interaction.user.id, {
      status: 'absent',
      lastActivity: new Date().toISOString(),
    }).catch(() => {});
  }
}

// [CORRECTION] _checkRetoursAbsence — avec _debloquerEcritureAbsent
async function _checkRetoursAbsence(guild) {
  const db = loadDB(); const maintenant = new Date(); let changed = false;

  // Activer les absences programmées dont la date de début est arrivée
  for (const [uid, m] of Object.entries(db.members || {})) {
    if (!m.absenceProgrammee) continue;
    const debut = new Date(m.absenceProgrammee.debut);
    if (debut > maintenant) continue;
    // Heure venue → activer l'absence
    console.log(`🔄 Activation absence programmée : ${m.name || uid}`);
    m.status = 'absent';
    m.absentJusqu = m.absenceProgrammee.fin;
    m.absentRaison = m.absenceProgrammee.raison;
    delete m.absenceProgrammee;
    changed = true;
    const membreD = await guild.members.fetch(uid).catch(() => null);
    if (membreD) {
      const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
      if (roleAbsent) await membreD.roles.add(roleAbsent).catch(() => {});
    }
    _syncStatutFicheNotion(uid, 'Absent').catch(() => {});
    const absCh = getAbsencesCh(guild, membreD);
    if (absCh) await absCh.send({ embeds: [new EmbedBuilder()
      .setColor(0xFFA500)
      .setTitle('🟡 Absence activée automatiquement')
      .addFields(
        { name: '👤 Membre', value: `<@${uid}>`, inline: true },
        { name: '📅 Retour prévu', value: m.absentJusqu ? new Date(m.absentJusqu).toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }) : 'Indéterminé', inline: true },
      ).setFooter({ text: 'IWC • Absence programmée activée' }).setTimestamp()
    ]}).catch(() => {});
  }

  for (const [uid, m] of Object.entries(db.members || {})) {
    if (m.status !== 'absent' || !m.absentJusqu) continue;
    if (new Date(m.absentJusqu) > maintenant) continue;
    m.status = 'actif'; m.lastActivity = new Date().toISOString(); m.absentJusqu = null; m.absentRaison = null; changed = true;
    const membreD = await guild.members.fetch(uid).catch(() => null);
    if (membreD) {
      const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
      if (roleAbsent) await membreD.roles.remove(roleAbsent).catch(() => {});
      await _debloquerEcritureAbsent(guild, membreD);
    }
    _syncMembreNotion(uid, { status: 'actif', lastActivity: new Date().toISOString() }).catch(() => {});
    const membreAbsent3 = await guild.members.fetch(uid).catch(() => null);
    const absCh = getAbsencesCh(guild, membreAbsent3);
    if (absCh) await absCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287).setTitle('✅ Retour automatique').setDescription(`<@${uid}> est revenu automatiquement d'absence.`).addFields({ name: '📅 Date de retour', value: new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: '2-digit', month: 'long' }), inline: true }, { name: '🎖️ Grade', value: m.rang || '—', inline: true }).setFooter({ text: 'IWC • Retour automatique' }).setTimestamp()] }).catch(() => {});
    const membre2 = await guild.members.fetch(uid).catch(() => null);
    if (membre2) { await envoyerDMRecap(guild, uid, 'absence', { message: '✅ Ton absence est terminée. Tu es de retour !\n\nTes permissions d\'écriture sont rétablies.' }).catch(() => {}); }
    await notionExtra.majStatutActiviteNotion?.(uid, 'actif');
    console.log(`✅ Retour automatique : ${m.name || uid}`);
  }
  if (changed) saveDB(db);
}

// ─────────────────────────────────────────────────────────────────────────────
// [NOUVELLES FONCTIONS] Blocage / Déblocage écriture pour absences
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Retire les permissions d'écriture dans tous les salons texte accessibles
 * au membre absent, sauf #absences et #général.
 */
async function _bloquerEcritureAbsent(guild, member) {
  try {
    // Approche par rôle : on modifie les perms du rôle Absent sur tous les salons
    // Plus robuste que par membre individuel
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (!roleAbsent) {
      // Fallback : bloquer par membre directement
      for (const [, ch] of guild.channels.cache) {
        if (!ch.isTextBased?.() || ch.type === 4) continue;
        if (ch.id === SALON_HARDCODED.ABSENCES_LEGAL || ch.id === SALON_HARDCODED.ABSENCES_ILLEGAL) continue; // laisser écrire dans #absences
        await ch.permissionOverwrites.edit(member, { SendMessages: false }).catch(() => {});
      }
      console.log(`🔒 Écriture bloquée (membre) pour ${member.user?.username || member.id}`);
      return;
    }
    // Les perms du rôle Absent sont déjà configurées sur le serveur
    // On s'assure juste que le rôle est attribué (fait dans handleSlashCommand)
    console.log(`🔒 Rôle Absent attribué → permissions bloquées pour ${member.user?.username || member.id}`);
  } catch (e) { console.log('❌ _bloquerEcritureAbsent error:', e.message); }
}

async function _debloquerEcritureAbsent(guild, member) {
  try {
    if (!member) { console.log('⚠️ _debloquerEcritureAbsent: member null, skip'); return; }
    if (!guild) { console.log('⚠️ _debloquerEcritureAbsent: guild null, skip'); return; }
    const memberId = member.id || member;
    // Récupérer le membre si nécessaire (au cas où c'est juste un ID)
    let m = member;
    if (typeof member === 'string' || !member.roles) {
      m = await guild.members.fetch(memberId).catch(() => null);
    }
    // 1. Retirer le rôle Absent
    const roleAbsent = guild.roles.cache.get(_ROLE_ABSENT_FINAL);
    if (roleAbsent && m?.roles?.cache?.has(roleAbsent.id)) {
      await m.roles.remove(roleAbsent).catch(() => {});
      console.log(`🔓 Rôle Absent retiré pour ${m?.user?.username || memberId}`);
    }
    // 2. Retirer les overrides par membre (fallback)
    if (m) {
      for (const [, ch] of guild.channels.cache) {
        if (!ch.isTextBased?.()) continue;
        const perm = ch.permissionOverwrites.cache.get(memberId);
        if (perm?.deny?.has('SendMessages') || perm?.deny?.has('ViewChannel')) {
          await ch.permissionOverwrites.delete(m).catch(() => {});
        }
      }
    }
    // 3. Nettoyer la DB
    const db = loadDB();
    if (db._absenceOverrides?.[memberId]) { delete db._absenceOverrides[memberId]; saveDB(db); }
    if (db.members[memberId]) {
      db.members[memberId].status = 'actif';
      db.members[memberId].absentJusqu = null;
      db.members[memberId].absentRaison = null;
      saveDB(db);
    }
    console.log(`🔓 Écriture débloquée pour ${m?.user?.username || memberId}`);
  } catch (e) { console.log('❌ _debloquerEcritureAbsent error:', e.message); }
}

async function setupFicheFormat(guild) {
  try {
    const ch = getChById(guild, 'FICHES_PERSONNAGES', 'fiches-personnages', 'fiches-perso', 'fiches'); if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    // Chercher si le format est déjà posté (vérifier plusieurs titres possibles)
    const existing = msgs.find(m =>
      m.author.id === guild.members.me?.id &&
      (m.embeds[0]?.title?.includes('FORMAT') ||
       m.embeds[0]?.title?.includes('FORMULAIRE') ||
       m.embeds[0]?.title?.includes('DOSSIERS') ||
       m.embeds[0]?.title?.includes('FICHES'))
    );
    if (existing) {
      // Vérifier si le TÉLÉGRAMME IC est déjà présent dans n'importe quel embed du message
      const allDescs = existing.embeds.map(e => e.description || '').join('');
      if (allDescs.includes('TÉLÉGRAMME IC')) {
        console.log('✅ Format fiches déjà à jour — skip');
        return;
      }
      // Format obsolète → supprimer tous les messages bot et recréer
      for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    } else {
      // Pas de format trouvé → supprimer les éventuels anciens messages bot orphelins
      for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    }

    const format = [
      '✦ NOM COMPLET :',
      '✦ SURNOM(S) :',
      '✦ ÂGE :',
      '✦ LIEU DE NAISSANCE :',
      '✦ NATIONALITÉ :',
      '✦ TAILLE / CORPULENCE :',
      '✦ YEUX / CHEVEUX :',
      '✦ SIGNES PARTICULIERS :',
      '✦ TÉLÉGRAMME IC :',
      '✦ PROFESSION :',
      '✦ RÉPUTATION :',
      '',
      '"Citation du personnage."',
      '',
      '─ ─ ─ HISTOIRE ─ ─ ─',
      '[5 à 15 lignes minimum]',
      '',
      '─ ─ ─ PERSONNALITÉ ─ ─ ─',
      '› Trait 1',
      '› Trait 2',
      '› Trait 3',
      '',
      '─ ─ ─ COMPÉTENCES ─ ─ ─',
      '⬡ Compétence : ◆◆◆◆◇',
      '⬡ Compétence : ◆◆◆◆◆',
      '',
      '─ ─ ─ FAIBLESSES ─ ─ ─',
      '› Faiblesse 1',
      '› Faiblesse 2',
      '',
      '─ ─ ─ LIENS IMPORTANTS ─ ─ ─',
      '[Nom] — [Relation] — [Description courte]',
      '',
      '─ ─ ─ OBJECTIF ─ ─ ─',
      '[Ce que le personnage cherche à accomplir]',
      '',
      '⋆ ─────────────────── ⋆',
      '     I W C  ·  1 8 9 5',
      '⋆ ─────────────────── ⋆',
    ].join('\n');

    await ch.send({ embeds: [
      new EmbedBuilder()
        .setColor(0x8B4513)
        .setTitle('🤠 DOSSIERS — Iron Wolf Company')
        .setDescription([
          '```',
          '╔═══════════════════════════════════╗',
          '║   FICHES OFFICIELLES DES AGENTS   ║',
          '║       Iron Wolf Company · 1895    ║',
          '╚═══════════════════════════════════╝',
          '```',
          '*Un dossier par agent. Rédigez le vôtre ci-dessous.*',
        ].join('\n'))
        .addFields(
          { name: '📜 Procédure', value: ['**1.** Copiez le formulaire ci-dessous', '**2.** Remplissez chaque rubrique', '**3.** Envoyez dans ce salon', '**4.** Le bureau génère automatiquement votre dossier ✅'].join('\n'), inline: false },
        )
        .setFooter({ text: 'Iron Wolf Company · Bureau des Archives · 1895' }),
      new EmbedBuilder()
        .setColor(0x5C3317)
        .setTitle('📋 FORMULAIRE — À copier/coller')
        .setDescription('```\n' + format + '\n```')
        .addFields(
          { name: '⚠️ Règlement', value: 'Tous les champs sont libres.\nSeul **NOM COMPLET** est obligatoire pour que le bureau reconnaisse votre dossier.\nChaque agent ne peut déposer **qu\'un seul dossier**.' },
          { name: '🔄 Mise à jour', value: 'Pour modifier votre dossier, repostez-le complet dans ce salon.\nL\'ancien sera archivé et Notion mis à jour automatiquement.' },
        )
        .setFooter({ text: '« La vérité a un prix. Nous le faisons payer aux autres. » — La Compagnie' }),
    ] });
    console.log('✅ Format fiches posté (avec TÉLÉGRAMME IC)');
  } catch (e) { console.log('❌ setupFicheFormat:', e.message); }
}

async function setupPlansFormat(guild) {
  try {
    // Utiliser l'ID hardcodé pour #plans
    const ch = guild.channels.cache.get(SALON_HARDCODED.PLANS) || guild.channels.cache.find(c => {
      const n = c.name?.toLowerCase().replace(/[^a-z0-9]/g,'');
      return c.isTextBased?.() && n === 'plans' && !c.name.includes('informateur');
    });
    if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.embeds[0]?.title?.includes('PLANS'));
    if (existing) return;
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    await ch.send({ embeds: [new EmbedBuilder().setColor(0x8B5A2A).setTitle('🗺️ PLANS TACTIQUES — IWC').setDescription(['*Partagez vos plans et cartes tactiques ici.*', '', '**Format recommandé :**', '```', '━━━━━━━━━━━━━━━━━━━━━━━━', 'PLAN TACTIQUE', '━━━━━━━━━━━━━━━━━━━━━━━━', 'OPÉRATION: ', 'LIEU: ', 'OBJECTIF: ', 'POINT DE RASSEMBLEMENT: ', 'PLAN D\'ATTAQUE: ', 'PLAN DE REPLI: ', 'NOTES: ', '━━━━━━━━━━━━━━━━━━━━━━━━', '```'].join('\n')).setFooter({ text: 'IWC • Plans tactiques' })] });
    console.log('✅ Format plans posté');
  } catch (e) { console.log('❌ setupPlansFormat:', e.message); }
}

async function setupPlanningFormat(guild) {
  try {
    const ch = getChById(guild, 'PLANNING', 'planning'); if (!ch) return;
    const msgs = await ch.messages.fetch({ limit: 20 });
    const existing = msgs.find(m => m.author.id === guild.members.me?.id && m.embeds[0]?.title?.includes('PLANNING'));
    if (existing) return;
    for (const [, m] of msgs) { if (m.author.id === guild.members.me?.id) await m.delete().catch(() => {}); }
    const embed = new EmbedBuilder().setColor(0x2C3E50).setTitle('📅 PLANNING — Iron Wolf Company').setDescription('*Planning hebdomadaire de la Compagnie.*\n\nPartagez ici les screenshots de planning ou utilisez la commande `/rdv` pour créer un rendez-vous.').addFields({ name: '📌 Utilisation', value: ['→ Postez un screenshot → automatiquement archivé', '→ `/rdv` pour créer un RDV officiel', '→ `/agenda voir` pour voir les prochains RDV'].join('\n') }).setFooter({ text: 'IWC • Planning • Mis à jour automatiquement' });
    await ch.send({ embeds: [embed] });
    console.log('✅ Format planning posté');
  } catch (e) { console.log('❌ setupPlanningFormat:', e.message); }
}

// Sync transactions dans la DB Notion IWC
async function _syncTransactionNotion(t) {
  if (!process.env.NOTION_TOKEN) return;
  const dbId = process.env.NOTION_TRESORERIE_DB || NOTION_TRANSACTIONS_DB;
  if (!dbId) return;
  try {
    await fetch('https://api.notion.com/v1/pages', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ parent: { database_id: dbId }, properties: {
        'Objet': { title: [{ text: { content: t.objet || '—' } }] },
        'Type': { select: { name: t.type || 'Entrée' } },
        'Coffre': { select: { name: t.coffre === 'illegal' ? '🔒 Illégal' : '⚖️ Légal' } },
        'Montant': { number: t.montant || 0 },
        'Responsable': { rich_text: [{ text: { content: t.responsable || '—' } }] },
        'Discord ID': { rich_text: [{ text: { content: t.discordId || t.userId || '—' } }] },
        'Solde après': { number: t.solde || 0 },
        'Date': { date: { start: (t.date || new Date().toISOString()).split('T')[0] } },
      }})
    });
    console.log(`✅ Transaction Notion: ${t.type} ${t.coffre} $${t.montant} par ${t.responsable}`);
  } catch (e) { console.log('❌ _syncTransactionNotion error:', e.message); }
}

// Exposer les IDs hardcodés et fonctions aux modules notionV3/V4/V5
global.SALON_HARDCODED = SALON_HARDCODED;
global.NOTION_TRANSACTIONS_DB = NOTION_TRANSACTIONS_DB;
global._syncTransactionNotion = _syncTransactionNotion;
global.archiverContratReponses = archiverContratReponses;
global.getChHard = getChHard;
// Surcharge enregistrerTransactionNotion pour ajouter Discord ID et sync DB transactions
const _origEnregistrerTransaction = notionExtra.enregistrerTransactionNotion;
notionExtra.enregistrerTransactionNotion = async (data) => {
  // Ajouter sync dans la DB transactions IWC
  _syncTransactionNotion({
    type: data.type || '—',
    coffre: data.coffre?.includes('llé') ? 'illegal' : 'legal',
    montant: data.montant || 0,
    objet: data.objet || '—',
    responsable: data.responsable || '—',
    discordId: data.discordId || data.userId || '—',
    solde: data.solde || 0,
    date: new Date().toISOString(),
  }).catch(() => {});
  if (_origEnregistrerTransaction) return _origEnregistrerTransaction(data);
};
global._syncInformateurNotion = _syncInformateurNotion;
global._syncAvertissementNotion = _syncAvertissementNotion;
global._syncMembreNotion = _syncMembreNotion;
global._syncContratNotion = _syncContratNotion;
global.archiverRdvNotion = archiverRdvNotion;
global._syncCandidatureNotion = _syncCandidatureNotion;
global._syncAffaireNotion = _syncAffaireNotion;
global._syncSurnomNotion = _syncSurnomNotion;
global.ajouterJournalIC = ajouterJournalIC;
global.envoyerDMRecap = envoyerDMRecap;
global.getChById = getChById;
global.sendLog = sendLog;
global.isDirection = isDirection;

// Créer la DB Informateurs dans Notion si elle n'existe pas
async function _initDBInformateursNotion(guild) {
  if (!process.env.NOTION_TOKEN) return;
  if (process.env.NOTION_INFOS_DB) return; // déjà configurée
  
  // Trouver la page parent IWC depuis une DB existante
  const parentId = process.env.NOTION_MEMBRES_DB || process.env.NOTION_RECRUTEMENT_DB;
  if (!parentId) return;
  
  try {
    // Récupérer l'ID de la page parent depuis une DB existante
    const res = await fetch(`https://api.notion.com/v1/databases/${parentId}`, {
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' }
    }).catch(() => null);
    if (!res?.ok) return;
    const dbData = await res.json().catch(() => null);
    const parentPageId = dbData?.parent?.page_id;
    if (!parentPageId) return;
    
    // Créer la DB Informateurs
    const createRes = await fetch('https://api.notion.com/v1/databases', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        parent: { type: 'page_id', page_id: parentPageId },
        icon: { type: 'emoji' },
        title: [{ type: 'text', text: { content: 'Informateurs' } }],
        properties: {
          'Source':               { title: {} },
          'Cible / Lieu':         { rich_text: {} },
          'Information':          { rich_text: {} },
          'Fiabilité':            { select: { options: [{ name: '✅ Confirmée', color: 'green' }, { name: '❌ Non confirmée', color: 'red' }] } },
          'Statut':               { select: { options: [{ name: '🆕 Nouveau', color: 'yellow' }, { name: '✅ Confirmé', color: 'green' }, { name: '❌ Infirmé', color: 'red' }] } },
          'Validé par':           { rich_text: {} },
          'Rapporteur Discord ID':{ rich_text: {} },
          'Date décision':        { date: {} },
          'Date rapport':         { date: {} },
        }
      })
    });
    
    if (createRes.ok) {
      const dbCreated = await createRes.json();
      const newId = dbCreated.id;
      console.log(`✅ DB Informateurs Notion créée automatiquement : ${newId}`);
      console.log(`⚠️  IMPORTANT : Ajoute dans Render → NOTION_INFOS_DB = ${newId}`);
      // Poster l'ID dans le salon logs pour que l'admin puisse le récupérer
      const logsCh = await getLogsCh(guild).catch(() => null);
      if (logsCh) await logsCh.send({ embeds: [new EmbedBuilder().setColor(0x57F287)
        .setTitle('✅ Base Notion "Informateurs" créée automatiquement')
        .setDescription(`**Ajoute cette variable dans Render :**
\`\`\`
NOTION_INFOS_DB = ${newId}
\`\`\`
Ensuite redémarre le bot.`)
        .setFooter({ text: 'IWC • Configuration Notion' })] }).catch(() => {});
    } else {
      const errData = await createRes.json().catch(() => ({}));
      console.log('❌ Création DB Informateurs échouée:', errData?.message || createRes.status);
    }
  } catch(e) { console.log('❌ _initDBInformateursNotion:', e.message); }
}
global.getLogsCh = getLogsCh;
global.getJournalCh = getJournalCh;
// notionV3 utilise global.getLogsCh — on le surcharge pour rediriger vers journal-de-bord
// pour les alertes informateurs et affaires
const _origGetLogsCh = getLogsCh;
global.getInformateurCh = (guild) => getJournalCh(guild) || guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD);
// Forcer toutes les alertes (inactivité, etc.) du module vers le Journal de bord
global.getInactiviteCh = (guild) => getJournalCh(guild) || guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD);
global.getAlerteCh = (guild) => getJournalCh(guild) || guild.channels.cache.get(SALON_HARDCODED.JOURNAL_DE_BORD);
global.JOURNAL_CH_ID = '1508756535407542372';

// Mettre à jour le statut activité dans Fiches_personnages
async function _syncTousMembresNotion(guild) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_FICHES_DB) return;
  try {
    const illegalRoleNames = ['Concepteur', 'Fléau', 'fleau', 'Exécuteur', 'éxécuteur', 'execu', 'Condamné', 'condamne', 'Maudit', 'Confrérie', 'confrerie'];
    const legalRoleNames   = ['Le Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent Conf', 'Opérateur', 'Operateur', 'Recrue', 'Probatoire', 'Panseur', 'Penseur'];
    const db = loadDB();
    // On scanne TOUS les membres du serveur ayant un rôle de pôle (légal ou illégal),
    // pas seulement ceux déjà connus → les nouveaux arrivants sont inclus.
    const tous = await guild.members.fetch().catch(() => null);
    if (!tous) return;
    const concernes = [...tous.values()].filter(member => !member.user.bot && (
      member.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n))) ||
      member.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)))
    ));
    if (!concernes.length) return;
    console.log(`🔄 Sync Notion — ${concernes.length} membres (rôles de pôle)...`);
    let synced = 0;
    for (const member of concernes) {
      try {
        const discordId = member.id;
        const m = (db.members || {})[discordId] || {};
        const isIlleg = member.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
        const pole    = _detecterPole(member); // gère légal / illégal / les deux
        const statut  = m.status === 'absent' ? 'Absent' : m.status === 'inactif' ? 'Inactif' : 'Actif';
        const nomIC   = member.displayName || m.name || (typeof DISCORD_TO_IC !== 'undefined' && DISCORD_TO_IC[discordId]) || member.user.username;
        await _syncStatutFicheNotion(discordId, statut, { pole, nom: nomIC, username: member.user.username });
        synced++;
        await new Promise(r => setTimeout(r, 400)); // pause anti rate-limit Notion
      } catch(e) { console.log(`❌ Sync membre ${member.id}:`, e.message); }
    }
    console.log(`✅ Sync Notion terminée — ${synced}/${concernes.length} membres mis à jour`);
  } catch(e) { console.log('❌ _syncTousMembresNotion:', e.message); }
}

async function _syncStatutFicheNotion(discordId, statut, extras = {}) {
  if (!process.env.NOTION_TOKEN || !process.env.NOTION_FICHES_DB) return;
  try {
    const search = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_FICHES_DB}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }),
    });
    const data = await search.json();
    const page = data.results?.[0];
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };

    if (!page) {
      // La fiche n'existe pas encore → on la CRÉE (nouveau membre)
      const nomIC = (extras.nom) || (typeof DISCORD_TO_IC !== 'undefined' && DISCORD_TO_IC[discordId]) || extras.username || discordId;
      const propsNew = {
        'Personnage':       { title:     [{ text: { content: String(nomIC) } }] },
        'Discord ID':       { rich_text: [{ text: { content: discordId } }] },
        'Statut activité':  { select:    { name: statut || 'Actif' } },
        'Statut fiche':     { select:    { name: 'À compléter' } },
        "Date d'entrée":    { date:      { start: new Date().toISOString().split('T')[0] } },
      };
      if (extras.pole) propsNew['Pôle'] = { select: { name: extras.pole } };
      const resC = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_FICHES_DB }, properties: propsNew }) });
      if (resC.ok) { console.log(`🆕 Fiches_personnages CRÉÉE : ${discordId} (${nomIC})`); return; }
      const e1 = await resC.json().catch(() => ({}));
      console.log(`⚠️ Création fiche (complète) refusée: ${(e1.message || '').slice(0, 150)}`);
      // Retry minimal : juste Personnage + Discord ID
      const resC2 = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: process.env.NOTION_FICHES_DB }, properties: { 'Personnage': { title: [{ text: { content: String(nomIC) } }] }, 'Discord ID': { rich_text: [{ text: { content: discordId } }] } } }) });
      if (resC2.ok) console.log(`🆕 Fiches_personnages CRÉÉE (minimal) : ${discordId}`);
      else { const e2 = await resC2.json().catch(() => ({})); console.log(`❌ Création fiche ${discordId}: ${(e2.message || '').slice(0, 150)}`); }
      return;
    }

    const props = {};
    if (extras.nom) props['Personnage'] = { title: [{ text: { content: String(extras.nom) } }] };
    if (statut) props['Statut activité'] = { select: { name: statut } };
    if (extras.pole) props['Pôle'] = { select: { name: extras.pole } };
    if (Object.keys(props).length === 0) return;
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: 'PATCH',
      headers,
      body: JSON.stringify({ properties: props }),
    });
    const changes = [statut && `statut → ${statut}`, extras.pole && `pôle → ${extras.pole}`].filter(Boolean).join(', ');
    console.log(`✅ Fiches_personnages MàJ : ${discordId} — ${changes}`);
  } catch(e) { console.log('❌ _syncStatutFicheNotion:', e.message); }
}

// ═══ SYNC REGISTRE DES MEMBRES (base Notion séparée) ═══
// Crée/MàJ une ligne pour CHAQUE membre ayant un rôle de pôle.
// Colonnes : Nom (titre), Personnage, Pôle, Rang, Statut, Date d'entrée, Dernière activité, Notes, Absent jusqu'au
async function _syncRegistreTousMembres(guild) {
  const REGISTRE_DB = process.env.NOTION_MEMBRES_DB || NOTION_MEMBRES_DB; // variable Render OU fallback config.js
  if (!process.env.NOTION_TOKEN) { console.log('⚠️ Sync Registre ignorée : NOTION_TOKEN manquant.'); return; }
  if (!REGISTRE_DB) { console.log('⚠️ Sync Registre ignorée : aucun ID de base Registre (NOTION_MEMBRES_DB).'); return; }
  console.log(`📒 Base Registre utilisée : ${REGISTRE_DB.slice(0, 8)}...`);
  try {
    const illegalRoleNames = ['Concepteur', 'Fléau', 'fleau', 'Exécuteur', 'éxécuteur', 'execu', 'Condamné', 'condamne', 'Maudit', 'Confrérie', 'confrerie'];
    const legalRoleNames   = ['Le Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent Conf', 'Opérateur', 'Operateur', 'Recrue', 'Probatoire', 'Panseur', 'Penseur'];
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    const db = loadDB();

    // Petite pause pour laisser Discord respirer après le fetch de la sync Fiches
    await new Promise(r => setTimeout(r, 1500));
    let tous = guild.members.cache; // d'abord le cache (déjà rempli par la sync Fiches juste avant)
    if (!tous || tous.size < 2) {
      tous = await guild.members.fetch().catch(e => { console.log('⚠️ Registre: échec fetch membres:', e.message); return null; });
    }
    if (!tous || !tous.size) { console.log('⚠️ Sync Registre: impossible de récupérer les membres du serveur.'); return; }
    console.log(`📒 Registre: ${tous.size} membres récupérés, analyse en cours...`);
    const concernes = [...tous.values()].filter(m => !m.user.bot && (
      m.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n))) ||
      m.roles.cache.some(r => legalRoleNames.some(n => r.name.includes(n)))
    ));
    if (!concernes.length) { console.log('⚠️ Sync Registre: aucun membre avec un rôle de pôle trouvé.'); return; }
    console.log(`🔄 Sync Registre — ${concernes.length} membres...`);

    let ok = 0;
    for (const member of concernes) {
      try {
        const discordId = member.id;
        const m = (db.members || {})[discordId] || {};
        const isIlleg = member.roles.cache.some(r => illegalRoleNames.some(n => r.name.includes(n)));
        const pole = _detecterPole(member); // gère légal / illégal / les deux
        const statut = m.status === 'absent' ? '⚠️ Absent' : m.status === 'inactif' ? '💤 Inactif' : '✅ Actif';
        const nomIC = member.displayName || m.name || (typeof DISCORD_TO_IC !== 'undefined' && DISCORD_TO_IC[discordId]) || member.user.username;
        // Rang = nom du/des rôle(s) de grade que la personne porte RÉELLEMENT sur Discord
        let rang;
        rang = _detecterRang(member);

        // Chercher la ligne existante : par Discord ID (si la colonne existe), sinon par Nom/Personnage
        let page = null;
        // Tentative par Discord ID (ignorée proprement si la colonne n'existe pas)
        try {
          const sId = await fetch(`https://api.notion.com/v1/databases/${REGISTRE_DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }) });
          if (sId.ok) { const dId = await sId.json().catch(() => ({})); page = dId.results?.[0] || null; }
        } catch {}
        // Sinon par Nom (titre)
        if (!page) {
          try {
            const search = await fetch(`https://api.notion.com/v1/databases/${REGISTRE_DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Nom', title: { equals: member.user.username } }, page_size: 1 }) });
            if (search.ok) { const data = await search.json().catch(() => ({})); page = data.results?.[0] || null; }
          } catch {}
        }

        if (page) {
          // MàJ : pôle, rang, statut, dernière activité
          await fetch(`https://api.notion.com/v1/pages/${page.id}`, { method: 'PATCH', headers, body: JSON.stringify({ properties: {
            'Nom':        { title:     [{ text: { content: member.user.username } }] },
            'Personnage': { rich_text: [{ text: { content: String(nomIC) } }] },
            'Pôle':   { select: { name: pole } },
            'Rang':   { select: { name: rang } },
            'Statut': { select: { name: statut } },
            'Discord ID': { rich_text: [{ text: { content: discordId } }] },
            'Dernière activité': { date: { start: new Date().toISOString().split('T')[0] } },
          } }) });
          ok++;
        } else {
          // Création de la ligne
          const propsNew = {
            'Nom':        { title:     [{ text: { content: member.user.username } }] },
            'Personnage': { rich_text: [{ text: { content: String(nomIC) } }] },
            'Discord ID': { rich_text: [{ text: { content: discordId } }] },
            'Pôle':       { select:    { name: pole } },
            'Rang':       { select:    { name: rang } },
            'Statut':     { select:    { name: statut } },
            "Date d'entrée":      { date: { start: (member.joinedAt ? member.joinedAt.toISOString() : new Date().toISOString()).split('T')[0] } },
            'Dernière activité':  { date: { start: new Date().toISOString().split('T')[0] } },
            'Notes':      { rich_text: [{ text: { content: `Ajouté automatiquement le ${fmtShort(new Date())}` } }] },
          };
          const resC = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: REGISTRE_DB }, properties: propsNew }) });
          if (resC.ok) { console.log(`🆕 Registre CRÉÉ : ${nomIC} (${member.user.username})`); ok++; }
          else {
            const e1 = await resC.json().catch(() => ({}));
            console.log(`⚠️ Registre création refusée: ${(e1.message || '').slice(0, 150)}`);
            // Retry minimal : juste le Nom
            const resC2 = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: REGISTRE_DB }, properties: { 'Nom': { title: [{ text: { content: member.user.username } }] } } }) });
            if (resC2.ok) { console.log(`🆕 Registre CRÉÉ (minimal) : ${member.user.username}`); ok++; }
            else { const e2 = await resC2.json().catch(() => ({})); console.log(`❌ Registre ${member.user.username}: ${(e2.message || '').slice(0, 150)}`); }
          }
        }
        await new Promise(r => setTimeout(r, 400)); // pause anti rate-limit
      } catch(e) { console.log(`❌ Sync registre ${member.id}:`, e.message); }
    }
    console.log(`✅ Sync Registre terminée — ${ok}/${concernes.length} membres`);
  } catch(e) { console.log('❌ _syncRegistreTousMembres:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
//  NOTE → CONTRAT (assisté par IA) — le bot propose, la Direction valide
// ═══════════════════════════════════════════════════════════════
const _draftStore = new Map(); // brouillons de contrats en cours (mémoire)

// Lit le texte d'une note du micro (pièce jointe .txt si longue, sinon embed)
async function _lireTexteNote(message) {
  try {
    const att = message.attachments?.find?.(a => (a.name || '').toLowerCase().endsWith('.txt'));
    if (att) { const r = await fetch(att.url); const t = await r.text(); if (t) return t; }
  } catch (e) { console.log('⚠️ Lecture note (fichier):', e.message); }
  const emb = message.embeds?.[0];
  if (emb?.description) return emb.description;
  return message.content || '';
}

// Demande à l'IA d'extraire les infos d'un contrat depuis une note
async function _analyserNoteContrat(texte) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const note = (texte || '').slice(0, 4000);
  const prompt = `Tu es un assistant pour un serveur de jeu de role Far West (RedM, univers Red Dead Redemption 2). Analyse cette note de terrain (conversation transcrite) et determine si elle decrit un CONTRAT / MISSION potentiel (une personne a cibler, escorter, surveiller, intimider, proteger, voler, enqueter, livrer...).

NOTE DE TERRAIN :
<<<${note}>>>

Reponds UNIQUEMENT avec un objet JSON, sans aucun texte avant ou apres, sans backticks. Format EXACT :
{"est_contrat": true, "type": "legal", "cible": "", "lieu": "", "motif": "", "contact": "", "confiance": "moyenne"}

Regles :
- "type": "illegal" si intimidation, violence, vol, elimination, chantage, contrebande, action clandestine. "legal" si escorte, protection, securite, enquete legitime, livraison, garde.
- "cible": le nom ou une description courte de la personne/objet vise.
- "motif": la raison en une phrase courte.
- "contact": l'intermediaire/commanditaire si mentionne, sinon vide.
- "confiance": "haute", "moyenne" ou "faible" selon la clarte de la note.
- Si la note ne decrit AUCUNE mission claire, mets "est_contrat": false.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await resp.json();
    let txt = data.content?.[0]?.text || '';
    txt = txt.replace(/```json|```/g, '').trim();
    const m = txt.match(/\{[\s\S]*\}/);
    if (m) txt = m[0];
    return JSON.parse(txt);
  } catch (e) { console.log('❌ Analyse note IA:', e.message); return null; }
}

// Résume une note de terrain en quelques points clés (IA) — pour ne pas tout lire
async function _resumerNote(texte) {
  if (!process.env.ANTHROPIC_API_KEY) return null;
  const note = (texte || '').slice(0, 5000);
  const prompt = `Tu es un assistant de renseignement pour un serveur de jeu de role Far West (RedM). Voici une conversation transcrite captee sur le terrain. Resume-la de facon COURTE en francais, pour quelqu'un qui n'a pas le temps de tout lire.

REGLE IMPORTANTE : tu dois TOUJOURS conserver dans ton resume, sans jamais les oublier, TOUTES ces infos si elles apparaissent :
- les NOMS de personnes et de groupes/bandes
- les LIEUX (villes, saloons, etc.)
- les TELEGRAMMES / numeros
- les CONTRATS, missions, demandes, deals proposes
- les MENACES, cibles, ennemis, alliances
- les SOMMES d'argent / paiements
- les ARMES, ressources, livraisons

Tu ne coupes QUE le remplissage inutile (politesses, repetitions, hesitations, bavardage). Si une info ci-dessus est presente, elle DOIT figurer dans le resume.

Format : des puces courtes commencant par "• ", regroupees par theme si besoin. Pas d'introduction ni de conclusion. Si vraiment rien d'important, ecris "• Rien de notable.".

CONVERSATION :
${note}`;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': process.env.ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await resp.json();
    return (data.content?.[0]?.text || '').trim() || null;
  } catch (e) { console.log('❌ Résumé note:', e.message); return null; }
}

// Embed du BROUILLON (ce que la Direction relit avant de valider)
function _embedBrouillonContrat(d, confiance) {
  const illegal = d.type === 'illegal';
  return new EmbedBuilder()
    .setColor(illegal ? 0x8B0000 : 0x1F6FB2)
    .setTitle('📝 BROUILLON DE CONTRAT — à valider')
    .setDescription(`Type proposé par l'IA : **${illegal ? '🔒 Illégal (Confrérie)' : '⚖️ Légal'}**` + (confiance ? `\n*Confiance : ${confiance}*` : ''))
    .addFields(
      { name: '🎯 Cible', value: (d.cible || '?').slice(0, 1000) },
      { name: '📍 Lieu', value: (d.lieu || '—').slice(0, 1000), inline: true },
      { name: '📨 Contact', value: (d.contact || '—').slice(0, 1000), inline: true },
      { name: '⚖️ Motif', value: (d.motif || '—').slice(0, 1000) },
    )
    .setFooter({ text: 'Vérifie les infos, change le type si besoin, puis valide.' });
}

// Boutons du brouillon
function _rowsBrouillonContrat(id, type) {
  const illegal = type === 'illegal';
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`dc_valider_${id}`).setLabel('✅ Valider le contrat').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`dc_type_${id}`).setLabel(illegal ? '⚖️ Basculer en Légal' : '🔒 Basculer en Illégal').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`dc_modifier_${id}`).setLabel('✏️ Modifier').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`dc_annuler_${id}`).setLabel('❌ Annuler').setStyle(ButtonStyle.Danger),
  )];
}

// Contrat ILLÉGAL final (format Confrérie)
function _embedContratIllegalFinal(d, ref, auteurId) {
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return new EmbedBuilder()
    .setColor(0x8B0000)
    .setTitle('📜 CONTRAT — DOSSIER CLASSÉ')
    .setDescription('🔒 **CONFIDENTIEL — CONFRÉRIE UNIQUEMENT**\n*Ne pas diffuser. Silence exigé, même en cas de refus.*')
    .addFields(
      { name: '🏷️ Référence', value: ref, inline: true },
      { name: '📅 Ouvert le', value: dateStr, inline: true },
      { name: '⚖️ Statut', value: 'En attente de validation', inline: true },
      { name: '🎯 Cible', value: `**${(d.cible || '?').slice(0, 1000)}**` },
      { name: '📍 Lieu / repères', value: (d.lieu || '—').slice(0, 1000), inline: true },
      { name: '✍️ Ouvert par', value: `<@${auteurId}>`, inline: true },
      { name: '⚖️ Motif', value: (d.motif || '—').slice(0, 1000) },
      { name: '📋 Conditions', value: '• Méthode physique, sanction marquante.\n• ⚠️ **PAS DE BAVURE — la cible ne doit PAS y rester.**\n• Une seule cible, aucune erreur tolérée.\n• Escalade possible si récidive.' },
      { name: '📸 Notre condition', value: 'Une **photographie de la cible entre nos mains** = preuve que le message est passé.' },
      { name: '🚫 SECRET ABSOLU', value: '**Bouche cousue. On n\'en parle À PERSONNE.**\nNi aux proches, ni aux frères hors contrat, **ni aux shérifs**.' },
      { name: '🤫 Règles d\'opération', value: '⛔ **Bandana relevé en permanence**.\n👕 **Tenue neutre** (rien d\'IWC/Confrérie).\n🐎 Monture & matériel neutres.\n🗣️ Aucun nom ni affiliation sur le terrain.' },
      { name: '📨 Contact', value: (d.contact || '—').slice(0, 1000) },
    )
    .setFooter({ text: 'Les choses vont vite. On ne traîne pas. — God bless Texas.' })
    .setTimestamp();
}

// Contrat LÉGAL final (format société de sécurité)
function _embedContratLegalFinal(d, ref, auteurId) {
  const dateStr = new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
  return new EmbedBuilder()
    .setColor(0x1F6FB2)
    .setTitle('📋 CONTRAT — IRON WOLF COMPANY')
    .setDescription('⚖️ **Contrat officiel — Sécurité & Protection**\n*Iron Wolf Company, services professionnels.*')
    .addFields(
      { name: '🏷️ Référence', value: ref, inline: true },
      { name: '📅 Établi le', value: dateStr, inline: true },
      { name: '⚖️ Statut', value: 'En attente de validation', inline: true },
      { name: '🎯 Objet / Client', value: `**${(d.cible || '?').slice(0, 1000)}**` },
      { name: '📍 Lieu', value: (d.lieu || '—').slice(0, 1000), inline: true },
      { name: '✍️ Établi par', value: `<@${auteurId}>`, inline: true },
      { name: '📋 Mission', value: (d.motif || '—').slice(0, 1000) },
      { name: '✅ Cadre', value: '• Mission menée dans le respect de la loi.\n• Professionnalisme et discrétion.\n• Compte-rendu en fin de mission.' },
      { name: '💵 Rémunération', value: 'À convenir.' },
      { name: '📨 Contact', value: (d.contact || '—').slice(0, 1000) },
    )
    .setFooter({ text: 'Iron Wolf Company — La sécurité avant tout.' })
    .setTimestamp();
}

// Gère les 4 boutons du brouillon de contrat
async function _gererBoutonBrouillon(interaction) {
  const cid = interaction.customId; // dc_<action>_<id>
  const action = cid.split('_')[1];
  const id = cid.split('_').slice(2).join('_');
  const d = _draftStore.get(id);

  if (!d) {
    return interaction.reply({ content: '⚠️ Ce brouillon a expiré (le bot a peut-être redémarré). Reclique sur 📜 sous la note pour en générer un nouveau.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }

  // ❌ Annuler
  if (action === 'annuler') {
    _draftStore.delete(id);
    await interaction.update({ content: '❌ Brouillon annulé.', embeds: [], components: [] }).catch(() => {});
    return;
  }

  // 🔄 Basculer le type légal/illégal
  if (action === 'type') {
    d.type = (d.type === 'illegal') ? 'legal' : 'illegal';
    _draftStore.set(id, d);
    await interaction.update({ embeds: [_embedBrouillonContrat(d, null)], components: _rowsBrouillonContrat(id, d.type) }).catch(() => {});
    return;
  }

  // ✏️ Modifier → ouvrir un formulaire pré-rempli
  if (action === 'modifier') {
    const modal = new ModalBuilder().setCustomId(`dc_modal_${id}`).setTitle('✏️ Modifier le contrat');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Cible / objet').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120).setValue((d.cible || '').slice(0, 120))),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setValue((d.lieu || '').slice(0, 120))),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('Motif').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setValue((d.motif || '').slice(0, 600))),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Contact').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setValue((d.contact || '').slice(0, 100))),
    );
    await interaction.showModal(modal).catch(e => console.log('⚠️ Modal modif brouillon:', e.message));
    return;
  }

  // ✅ Valider → publier le contrat final + archiver Notion
  if (action === 'valider') {
    await interaction.deferUpdate().catch(() => {});
    const illegal = d.type === 'illegal';
    const db = loadDB();
    db.missionCounter = (db.missionCounter || 0) + 1;
    const ref = `Contrat-${String(db.missionCounter).padStart(3, '0')}`;

    const embed = illegal ? _embedContratIllegalFinal(d, ref, d.userId) : _embedContratLegalFinal(d, ref, d.userId);

    // Publier dans le salon du brouillon
    let salonOK = false; let publishedMsgId = null;
    try { const sent = await interaction.channel.send({ embeds: [embed] }); salonOK = true; publishedMsgId = sent.id; } catch (e) { console.log('⚠️ Publication contrat:', e.message); }

    db.missions = db.missions || {};
    db.missions[ref] = { messageId: publishedMsgId, channelId: interaction.channel.id, cible: d.cible, type: d.type, statut: 'En attente', createdAt: new Date().toISOString() };
    saveDB(db);

    // Archiver Notion (optionnel)
    let notionOK = false; const DB = process.env.NOTION_MISSIONS_DB || null;
    if (process.env.NOTION_TOKEN && DB) {
      try {
        const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
        const props = {
          'Référence':    { title: [{ text: { content: ref } }] },
          'Cible':        { rich_text: [{ text: { content: d.cible || '?' } }] },
          'Lieu':         { rich_text: [{ text: { content: d.lieu || '' } }] },
          'Motif':        { rich_text: [{ text: { content: (d.motif || '').slice(0, 1900) } }] },
          'Contact':      { rich_text: [{ text: { content: d.contact || '' } }] },
          'Statut':       { select: { name: 'En attente' } },
          'Date':         { date: { start: new Date().toISOString().split('T')[0] } },
        };
        const res = await fetch('https://api.notion.com/v1/pages', { method: 'POST', headers, body: JSON.stringify({ parent: { database_id: DB }, properties: props }) });
        if (res.ok) notionOK = true; else console.log('⚠️ Contrat Notion:', (await res.json().catch(() => ({}))).message);
      } catch (e) { console.log('❌ Contrat Notion:', e.message); }
    }

    _draftStore.delete(id);
    await interaction.editReply({ content: `✅ **Contrat ${ref} publié** (${illegal ? '🔒 Illégal' : '⚖️ Légal'}) · Salon : ${salonOK ? '✅' : '⚠️'} · Notion : ${notionOK ? '✅' : (DB ? '⚠️' : '—')}`, embeds: [], components: [] }).catch(() => {});
    return;
  }
}

// Validation du formulaire de modification d'un brouillon
async function _validerModalBrouillon(interaction) {
  const id = interaction.customId.replace('dc_modal_', '');
  const d = _draftStore.get(id);
  if (!d) return interaction.reply({ content: '⚠️ Brouillon expiré.', flags: MessageFlags.Ephemeral }).catch(() => {});
  d.cible = interaction.fields.getTextInputValue('cible');
  d.lieu = interaction.fields.getTextInputValue('lieu') || '';
  d.motif = interaction.fields.getTextInputValue('motif');
  d.contact = interaction.fields.getTextInputValue('contact') || '';
  _draftStore.set(id, d);
  await interaction.update({ embeds: [_embedBrouillonContrat(d, null)], components: _rowsBrouillonContrat(id, d.type) }).catch(() => {});
}

async function _runDiagnostic(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    const oui = '✅', non = '❌', opt = '➖';
    const v = (x) => x ? oui : non;

    // 1) Variables d'environnement (présence seulement, jamais la valeur)
    const env = [
      `${v(process.env.DISCORD_TOKEN)} Token Discord`,
      `${v(process.env.GUILD_ID)} GUILD_ID`,
      `${v(process.env.NOTION_TOKEN)} Token Notion`,
      `${v(process.env.ANTHROPIC_API_KEY)} Clé IA (résumés + contrats)`,
      `${process.env.NOTION_MEMBRES_DB ? oui : opt} Base Registre membres`,
      `${process.env.NOTION_FICHES_DB ? oui : opt} Base Fiches personnages`,
      `${process.env.NOTION_ENGAGEMENTS_DB ? oui : opt} Base Engagements`,
      `${process.env.NOTION_MISSIONS_DB ? oui : opt} Base Missions/Contrats`,
    ].join('\n');

    // 2) Permissions du bot sur le serveur
    const me = interaction.guild.members.me;
    const p = me?.permissions;
    const perms = [
      `${v(p?.has(PermissionFlagsBits.ManageRoles))} Gérer les rôles`,
      `${v(p?.has(PermissionFlagsBits.ManageChannels))} Gérer les salons`,
      `${v(p?.has(PermissionFlagsBits.KickMembers))} Expulser des membres`,
      `${v(p?.has(PermissionFlagsBits.ManageMessages))} Gérer les messages`,
      `${v(p?.has(PermissionFlagsBits.AddReactions))} Ajouter des réactions`,
      `${v(p?.has(PermissionFlagsBits.MentionEveryone))} Mentionner les rôles`,
    ].join('\n');

    // 3) Position du rôle du bot (doit être au-dessus des rôles qu'il gère)
    const botPos = me?.roles?.highest?.position ?? 0;
    const visiteur = interaction.guild.roles.cache.find(r => r.name.includes('Visiteur'));
    const ironwolf = interaction.guild.roles.cache.find(r => r.name.includes('Iron Wolf'));
    const confrerie = interaction.guild.roles.cache.find(r => r.name.includes('Confrérie') || r.name.includes('Confrerie'));
    const posCheck = [
      `${visiteur ? (botPos > visiteur.position ? oui : non) : opt} Au-dessus de « Visiteur »`,
      `${ironwolf ? oui : non} Rôle « Iron Wolf Company » trouvé (ping ops légal)`,
      `${confrerie ? oui : non} Rôle « La Confrérie » trouvé (ping ops illégal)`,
    ].join('\n');

    // 4) Test rapide de connexion Notion (si configuré)
    let notionTest = '➖ Non testé (pas de token)';
    if (process.env.NOTION_TOKEN && (process.env.NOTION_MEMBRES_DB)) {
      try {
        const r = await fetch(`https://api.notion.com/v1/databases/${process.env.NOTION_MEMBRES_DB}`, {
          headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28' },
        });
        notionTest = r.ok ? '✅ Connexion Notion OK (base Registre accessible)' : `❌ Notion répond mais base inaccessible (${r.status} — intégration connectée ?)`;
      } catch (e) { notionTest = `❌ Notion injoignable (${e.message})`; }
    }

    const embed = new EmbedBuilder()
      .setColor(0x4E9F3D)
      .setTitle('🩺 Diagnostic du bot IWC')
      .setDescription('Bilan de ce qui est configuré. ✅ = OK · ❌ = à régler · ➖ = optionnel/non configuré')
      .addFields(
        { name: '🔑 Configuration (Render)', value: env },
        { name: '🛡️ Permissions du bot', value: perms },
        { name: '📊 Rôles & hiérarchie', value: posCheck },
        { name: '🔗 Test Notion', value: notionTest },
      )
      .setFooter({ text: 'Astuce : un ❌ en permissions = beaucoup de fonctions cassées.' })
      .setTimestamp();

    return interaction.editReply({ embeds: [embed] });
}

// ═══════════════════════════════════════════════════════════════
//  MENU PRINCIPAL À BOUTONS (tout accessible sans taper de commande)
// ═══════════════════════════════════════════════════════════════
const MENU_SALON_ID = '1510212339285360781';      // salon du menu principal
const COMMENCER_SALON_ID = '1509243971472195584'; // salon « commencer ici »

function _buildMenuPrincipal() {
  const embed = new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle('🐺 MENU PRINCIPAL — IRON WOLF COMPANY')
    .setDescription([
      'Bienvenue. Clique sur un bouton pour agir — **pas besoin de retenir les commandes**.',
      '',
      '👤 **Profil** — voir ta fiche et ton grade',
      '📅 **RDV** — prendre un rendez-vous',
      '🟡 **Absence** — déclarer une absence · ↩️ **Retour** — signaler ton retour',
      '📜 **Contrats** — tes contrats en cours',
      '🏛️ **Hiérarchie** — voir l\'organigramme',
      '❓ **Toutes les commandes** — la liste complète',
      '🎖️ **Outils Direction** — réservé au staff',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company • Clique, c\'est tout' });

  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_profil').setLabel('Profil').setEmoji('👤').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_dossier').setLabel('Mon dossier').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_rdv').setLabel('Prendre un RDV').setEmoji('📅').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_absence').setLabel('Absence').setEmoji('🟡').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_retour').setLabel('Retour').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_contrats').setLabel('Mes contrats').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_journal').setLabel('Journal').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_fiche').setLabel('Ma fiche').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_hierarchie').setLabel('Hiérarchie').setEmoji('🏛️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_aide').setLabel('Toutes les commandes').setEmoji('❓').setStyle(ButtonStyle.Secondary),
  );
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_portefeuille').setLabel('Portefeuille').setEmoji('💰').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('menu_parrainage').setLabel('Mon parrainage').setEmoji('🤝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_direction').setLabel('Outils Direction').setEmoji('🎖️').setStyle(ButtonStyle.Danger),
  );
  return { embeds: [embed], components: [row1, row2, row3] };
}

// Sous-panneau Direction (éphémère)
function _buildPanneauDirection() {
  const embed = new EmbedBuilder()
    .setColor(0xC0392B)
    .setTitle('🎖️ Outils Direction')
    .setDescription('Actions réservées au staff. Clique pour agir.')
    .setFooter({ text: 'Réservé à la Direction / Confrérie' });
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_op').setLabel('Créer une opération').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('menu_mission').setLabel('Créer un contrat').setEmoji('🔪').setStyle(ButtonStyle.Danger),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('menu_guide').setLabel('Prévenir les membres').setEmoji('📣').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_sync').setLabel('Synchroniser Notion').setEmoji('🔄').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_desc').setLabel('MAJ descriptions salons').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('menu_diag').setLabel('Diagnostic').setEmoji('🩺').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [embed], components: [row1, row2] };
}

// Message « Commencer ici » pour les nouveaux
function _buildCommencerIci() {
  return new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle('📌 BIENVENUE — COMMENCE ICI')
    .setDescription([
      'Heureux de t\'accueillir à l\'Iron Wolf Company ! Voici comment démarrer en **4 étapes** :',
      '',
      '**1️⃣ Définis ton pseudo RP**',
      'Clique sur **✏️ Définir mon pseudo RP** (bouton ci-dessous) : ton pseudo Discord prendra le nom de ton personnage. C\'est la base du RP.',
      '',
      '**2️⃣ Lis et valide le règlement**',
      'Va dans le salon <#1511135557143629926>, lis-le, puis réagis avec ✅ sur le message de validation. C\'est obligatoire pour accéder au serveur.',
      '',
      '**3️⃣ Utilise le menu principal**',
      'Tout se fait avec des boutons dans le salon du **menu** — pas besoin de retenir des commandes. Profil, RDV, absences, contrats... tout est là.',
      '',
      '**4️⃣ Présente-toi et lance-toi**',
      'Si tu veux nous rejoindre officiellement, clique sur **Candidature** dans le salon de recrutement. La Direction te recontactera.',
      '',
      '**📞 Besoin de nos services ?**',
      'Dans la section **Rendez-vous client**, tu peux solliciter la Compagnie et demander un rendez-vous (escorte, protection, contrat…). Remplis la demande : un opérateur te recontactera rapidement.',
      '',
      '*Une question ? Clique sur ❓ Toutes les commandes dans le menu, ou demande à un membre du staff.*',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company • 1895' });
}

// Vérifie si un message du bot avec ce titre existe déjà dans le salon
async function _menuDejaPresent(channel, titrePartiel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 30 });
    return msgs.some(m => m.author.id === client.user.id && (m.embeds[0]?.title || '').includes(titrePartiel));
  } catch { return false; }
}

// Supprime (et désépingle) les anciens panneaux du bot portant ce titre, pour éviter l'accumulation
async function _nettoyerAnciensPanneaux(channel, titrePartiel) {
  try {
    const msgs = await channel.messages.fetch({ limit: 50 });
    for (const m of msgs.values()) {
      if (m.author.id === client.user.id && (m.embeds[0]?.title || '').includes(titrePartiel)) {
        await m.unpin().catch(() => {});
        await m.delete().catch(() => {});
      }
    }
  } catch {}
}

// Installe le menu + le message « commencer ici » dans leurs salons.
// forcer=false : ne poste que si absent (pour le démarrage auto, évite les doublons).
// forcer=true  : reposte toujours (commande /installer-menu).
async function _installerMenu(guild, forcer = false) {
  let okMenu = false, okStart = false;
  try {
    const chMenu = await guild.channels.fetch(MENU_SALON_ID).catch(() => null);
    if (chMenu) {
      if (forcer) await _nettoyerAnciensPanneaux(chMenu, 'MENU PRINCIPAL');
      const present = forcer ? false : await _menuDejaPresent(chMenu, 'MENU PRINCIPAL');
      if (forcer || !present) { const m = await chMenu.send(_buildMenuPrincipal()); await m.pin().catch(() => {}); }
      okMenu = true;
    }
  } catch (e) { console.log('⚠️ Install menu:', e.message); }
  try {
    const chStart = await guild.channels.fetch(COMMENCER_SALON_ID).catch(() => null);
    if (chStart) {
      if (forcer) { await _nettoyerAnciensPanneaux(chStart, 'COMMENCE ICI'); await _nettoyerAnciensPanneaux(chStart, 'MENU PRINCIPAL'); }
      const present = forcer ? false : await _menuDejaPresent(chStart, 'COMMENCE ICI');
      if (forcer || !present) {
        const m1 = await chStart.send({ embeds: [_buildCommencerIci()], components: [new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('btn_surnom_ouvrir').setLabel('✏️ Définir mon pseudo RP').setStyle(ButtonStyle.Primary))] }); await m1.pin().catch(() => {});
        const m2 = await chStart.send(_buildMenuPrincipal()); await m2.pin().catch(() => {});
      }
      okStart = true;
    }
  } catch (e) { console.log('⚠️ Install commencer-ici:', e.message); }
  return { okMenu, okStart };
}

// Gère les boutons du menu
async function _gererBoutonMenu(interaction) {
  const id = interaction.customId;
  // Actions membres
  if (id === 'menu_profil')     return handleProfilEnhanced(interaction);
  if (id === 'menu_retour')     return _handleRetour(interaction);
  if (id === 'menu_contrats')   return _handleMesContrats(interaction);
  if (id === 'menu_hierarchie') { if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 La hiérarchie est réservée aux membres. Rejoins-nous via une candidature pour y accéder !', flags: MessageFlags.Ephemeral }); return notionV3.handleHierarchieCommand?.(interaction); }
  if (id === 'menu_aide')       return _handleAide(interaction);
  if (id === 'menu_dossier')    return _handleMonDossier(interaction);
  if (id === 'menu_journal')    return _handleJournalVoir(interaction);
  if (id === 'menu_fiche')      return _handleMaFiche(interaction);
  if (id === 'menu_portefeuille') return _handlePortefeuille(interaction);
  if (id === 'menu_rdv')        return _ouvrirMenuRdvSlash(interaction);
  if (id === 'menu_absence') {
    const modal = new ModalBuilder().setCustomId('modal_absent').setTitle('🟡 Déclarer une absence');
    modal.addComponents(
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('duree').setLabel('Durée').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex : 2 jours, 1 semaine, jusqu\'au 10 juin')),
      new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Raison (optionnel)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : vacances, travail, IRL...')),
    );
    return interaction.showModal(modal);
  }
  // Sous-panneau Direction
  if (id === 'menu_direction') {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    return interaction.reply({ ..._buildPanneauDirection(), flags: MessageFlags.Ephemeral });
  }
  // Actions Direction
  if (['menu_op', 'menu_mission', 'menu_sync', 'menu_desc', 'menu_diag', 'menu_guide'].includes(id)) {
    if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
    if (id === 'menu_op')      return _ouvrirModalOpCreer(interaction);
    if (id === 'menu_guide')   return _handleGuideMembres(interaction);
    if (id === 'menu_diag')    return _runDiagnostic(interaction);
    if (id === 'menu_mission') {
      const modal = new ModalBuilder().setCustomId('modal_mission').setTitle('🔪 Nouveau contrat de mission');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Cible (nom + qui c\'est)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu / repères').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('Motif du contrat').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Contact / intermédiaire').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
      );
      return interaction.showModal(modal);
    }
    if (id === 'menu_sync') {
      await interaction.reply({ content: '🔄 Synchronisation Notion en cours… (regarde les logs)', flags: MessageFlags.Ephemeral });
      try { await _syncTousMembresNotion(interaction.guild); await _syncRegistreTousMembres(interaction.guild); await interaction.followUp({ content: '✅ Synchronisation terminée.', flags: MessageFlags.Ephemeral }); }
      catch (e) { await interaction.followUp({ content: `⚠️ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {}); }
      return;
    }
    if (id === 'menu_desc') {
      await interaction.reply({ content: '📝 Mise à jour des descriptions… (~30 sec)', flags: MessageFlags.Ephemeral });
      try { await _definirDescriptionsSalons(interaction.guild); await interaction.followUp({ content: '✅ Descriptions mises à jour.', flags: MessageFlags.Ephemeral }); }
      catch (e) { await interaction.followUp({ content: `⚠️ ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {}); }
      return;
    }
  }
}

// Trouve l'ID du rôle à pinger pour un pôle (le rôle commun à tous les membres du pôle).
// Légal → rôle « Iron Wolf Company » · Illégal → rôle « La Confrérie ».
// Cherche par NOM (robuste), avec repli sur la config si besoin.
function _poleRoleId(guild, pole) {
  const illegal = (pole === 'illegal' || pole === 'illégal' || pole === '🔒 Illégal');
  const motifs = illegal ? ['Confrérie', 'confrerie'] : ['Iron Wolf', 'iron wolf'];
  const role = guild.roles.cache.find(r => motifs.some(m => r.name.includes(m)));
  if (role) return role.id;
  // repli : constantes de config (si jamais elles sont correctes)
  return illegal ? ROLE_POLE_ILLEGAL : ROLE_POLE_LEGAL;
}

// Détecte le PÔLE d'un membre à partir de ses rôles Discord réels.
// Un membre peut appartenir aux DEUX pôles (légal + illégal) → renvoie « Les deux ».
// ═══════════════════════════════════════════════════════════════
//  UTILITÉS MEMBRES : Mon dossier · Journal de personnage · Ma fiche
// ═══════════════════════════════════════════════════════════════

// Échelles de grades (du plus BAS au plus HAUT) pour la progression.
const ECHELLE_LEGAL = [
  { nom: 'Recrue / Probatoire', motifs: ['recrue', 'probatoire'] },
  { nom: 'Panseur', motifs: ['panseur', 'penseur'] },
  { nom: 'Opérateur', motifs: ['opérateur', 'operateur'] },
  { nom: 'Agent', motifs: ['agent'] },
  { nom: 'Officier', motifs: ['officier'] },
  { nom: 'Direction (Le Conseil)', motifs: ['conseil', 'directeur'] },
];
const ECHELLE_ILLEGAL = [
  { nom: 'Confrérie', motifs: ['confrérie', 'confrerie'] },
  { nom: 'Maudit', motifs: ['maudit'] },
  { nom: 'Condamné', motifs: ['condamné', 'condamne'] },
  { nom: 'Exécuteur', motifs: ['exécuteur', 'execu', 'xécu'] },
  { nom: 'Fléau', motifs: ['fléau', 'fleau'] },
  { nom: 'Concepteur', motifs: ['concepteur'] },
];

function _ageTexte(dateIso) {
  if (!dateIso) return 'inconnue';
  const j = Math.floor((Date.now() - new Date(dateIso).getTime()) / 86400000);
  if (j <= 0) return "aujourd'hui";
  if (j < 31) return `${j} jour${j > 1 ? 's' : ''}`;
  const mois = Math.floor(j / 30);
  if (mois < 12) return `${mois} mois`;
  const ans = Math.floor(j / 365);
  return `${ans} an${ans > 1 ? 's' : ''}`;
}

// ─────────── 📋 MON DOSSIER ───────────
async function _handleMonDossier(interaction) {
  if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres. Rejoins-nous via une candidature !', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const m = interaction.member; const id = m.id;
  const info = (db.members && db.members[id]) || {};
  const grade = _detecterRang(m);
  const pole = _detecterPole(m);
  const arrivee = info.joinedAt || (m.joinedAt ? m.joinedAt.toISOString() : null);
  const nbJournal = ((db.journaux && db.journaux[id]) || []).length;

  const noms = m.roles.cache.map(r => r.name.toLowerCase());
  const aMatch = (motifs) => motifs.some(mt => noms.some(n => n.includes(mt.toLowerCase())));
  const estIlleg = ECHELLE_ILLEGAL.some(g => aMatch(g.motifs)) && !ECHELLE_LEGAL.some(g => aMatch(g.motifs));
  const echelle = estIlleg ? ECHELLE_ILLEGAL : ECHELLE_LEGAL;
  let idx = -1;
  echelle.forEach((g, i) => { if (aMatch(g.motifs)) idx = i; });
  const prochain = (idx >= 0 && idx < echelle.length - 1) ? echelle[idx + 1].nom : (idx < 0 ? echelle[0].nom : null);

  const total = echelle.length;
  const pos = idx >= 0 ? idx + 1 : 0;
  const remplies = Math.max(0, Math.round((pos / total) * 10));
  const barre = '🟩'.repeat(remplies) + '⬜'.repeat(10 - remplies);

  const ladder = echelle.map((g, i) => {
    if (i === idx) return `**➤ ${g.nom}**  ← tu es ici`;
    if (i === idx + 1) return `▫️ ${g.nom}  *(prochain)*`;
    return `▫️ ${g.nom}`;
  }).reverse().join('\n');

  const embed = new EmbedBuilder()
    .setColor(estIlleg ? 0x8B1A1A : 0x3B82F6)
    .setTitle(`📋 Mon dossier — ${m.displayName}`)
    .setThumbnail(m.user.displayAvatarURL())
    .addFields(
      { name: '🎖️ Grade', value: grade || '—', inline: true },
      { name: '⚖️ Pôle', value: pole || '—', inline: true },
      { name: '📅 Membre depuis', value: _ageTexte(arrivee), inline: true },
      { name: `📊 Progression (${pos}/${total})`, value: `${barre}${prochain ? `\n🎯 Prochain grade : **${prochain}**` : '\n🏆 Tu es au sommet de la hiérarchie !'}`, inline: false },
      { name: '🪜 Hiérarchie de ton pôle', value: ladder.slice(0, 1024), inline: false },
      { name: '📖 Entrées de journal', value: `${nbJournal} entrée${nbJournal > 1 ? 's' : ''}`, inline: true },
    )
    .setFooter({ text: 'Iron Wolf Company • Ton parcours' })
    .setTimestamp();
  return interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
}

// ─────────── 📖 JOURNAL DE PERSONNAGE ───────────
function _embedJournal(member, entrees) {
  const e = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`📖 Journal de ${member.displayName}`).setThumbnail(member.user.displayAvatarURL());
  if (!entrees.length) {
    e.setDescription("*Ton journal est vide.*\nClique sur **« ➕ Ajouter une entrée »** pour écrire le premier chapitre de l'histoire de ton personnage.");
  } else {
    const recent = entrees.slice(-10).reverse();
    let desc = recent.map(en => `**📅 ${en.date} — ${en.titre}**\n${en.texte}`).join('\n\n');
    if (desc.length > 4000) desc = desc.slice(0, 4000) + '…';
    e.setDescription(desc);
    e.setFooter({ text: entrees.length > 10 ? `${entrees.length} entrées au total (10 dernières affichées)` : `${entrees.length} entrée${entrees.length > 1 ? 's' : ''}` });
  }
  return e;
}

async function _handleJournalVoir(interaction) {
  if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres.', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const entrees = (db.journaux && db.journaux[interaction.member.id]) || [];
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('journal_ajouter').setLabel('Ajouter une entrée').setEmoji('➕').setStyle(ButtonStyle.Primary),
  );
  return interaction.reply({ embeds: [_embedJournal(interaction.member, entrees)], components: [row], flags: MessageFlags.Ephemeral });
}

function _modalJournal() {
  const modal = new ModalBuilder().setCustomId('modal_journal').setTitle('📖 Nouvelle entrée de journal');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel("Titre de l'entrée").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex : La fusillade de Valentine')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('texte').setLabel("Ce qui s'est passé").setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500).setPlaceholder('Raconte ce qu\'a vécu ton personnage...')),
  );
  return modal;
}

async function _validerJournal(interaction) {
  const titre = interaction.fields.getTextInputValue('titre').trim();
  const texte = interaction.fields.getTextInputValue('texte').trim();
  const db = loadDB();
  db.journaux = db.journaux || {};
  db.journaux[interaction.member.id] = db.journaux[interaction.member.id] || [];
  db.journaux[interaction.member.id].push({ date: new Date().toLocaleDateString('fr-FR'), titre, texte });
  saveDB(db);
  return interaction.reply({ content: `✅ Entrée ajoutée à ton journal : **${titre}**\nReviens sur **📖 Journal** pour la relire.`, flags: MessageFlags.Ephemeral });
}

// ─────────── ✏️ MA FICHE DE PERSONNAGE ───────────
function _embedMaFiche(member, fiche) {
  const e = new EmbedBuilder().setColor(0x6B4423).setTitle(`📇 Fiche de personnage — ${member.displayName}`).setThumbnail(member.user.displayAvatarURL());
  fiche = fiche || {};
  const rempli = ['nom', 'age', 'apparence', 'histoire', 'traits'].some(k => fiche[k]);
  if (!rempli) {
    e.setDescription("*Ta fiche est vide.*\nClique sur **« ✏️ Modifier ma fiche »** pour la remplir toi-même.");
  } else {
    if (fiche.nom) e.addFields({ name: '👤 Nom', value: fiche.nom.slice(0, 256), inline: true });
    if (fiche.age) e.addFields({ name: '🎂 Âge / origine', value: fiche.age.slice(0, 256), inline: true });
    if (fiche.apparence) e.addFields({ name: '🧥 Apparence', value: fiche.apparence.slice(0, 1024), inline: false });
    if (fiche.histoire) e.addFields({ name: '📜 Histoire', value: fiche.histoire.slice(0, 1024), inline: false });
    if (fiche.traits) e.addFields({ name: '🎭 Caractère', value: fiche.traits.slice(0, 1024), inline: false });
  }
  e.setFooter({ text: 'Iron Wolf Company • Ta fiche, modifiable quand tu veux' });
  return e;
}

async function _handleMaFiche(interaction) {
  if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres.', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const fiche = (db.fichesPerso && db.fichesPerso[interaction.member.id]) || {};
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('mafiche_modifier').setLabel('Modifier ma fiche').setEmoji('✏️').setStyle(ButtonStyle.Primary),
  );
  return interaction.reply({ embeds: [_embedMaFiche(interaction.member, fiche)], components: [row], flags: MessageFlags.Ephemeral });
}

function _modalMaFiche(fiche) {
  fiche = fiche || {};
  const modal = new ModalBuilder().setCustomId('modal_mafiche').setTitle('✏️ Ma fiche de personnage');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom du personnage').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setValue((fiche.nom || '').slice(0, 80))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('age').setLabel('Âge / origine').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setValue((fiche.age || '').slice(0, 80))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('apparence').setLabel('Apparence').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue((fiche.apparence || '').slice(0, 300))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('histoire').setLabel('Histoire / background').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue((fiche.histoire || '').slice(0, 1000))),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('traits').setLabel('Caractère / traits').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue((fiche.traits || '').slice(0, 300))),
  );
  return modal;
}

async function _validerMaFiche(interaction) {
  const db = loadDB();
  db.fichesPerso = db.fichesPerso || {};
  const f = {
    nom: interaction.fields.getTextInputValue('nom').trim(),
    age: interaction.fields.getTextInputValue('age').trim(),
    apparence: interaction.fields.getTextInputValue('apparence').trim(),
    histoire: interaction.fields.getTextInputValue('histoire').trim(),
    traits: interaction.fields.getTextInputValue('traits').trim(),
  };
  db.fichesPerso[interaction.member.id] = f;
  saveDB(db);
  return interaction.reply({ content: '✅ Ta fiche de personnage a été mise à jour !', embeds: [_embedMaFiche(interaction.member, f)], flags: MessageFlags.Ephemeral });
}

// ─────────── 📣 GUIDE MEMBRES : prévenir chaque membre en MP ───────────
function _embedGuideMembre() {
  return new EmbedBuilder()
    .setColor(0x8B5A2A)
    .setTitle('🐺 Tes outils perso — Iron Wolf Company')
    .setDescription([
      'Salut ! Ton serveur dispose maintenant **d\'outils rien que pour toi**. Voici comment t\'en servir 👇',
      '',
      '📇 **Crée ta fiche de personnage**',
      'Tape **`/ma-fiche`** → clique **« ✏️ Modifier »** → remplis ton nom, âge, apparence, histoire et caractère. Modifiable quand tu veux.',
      '',
      '📖 **Écris l\'histoire de ton perso**',
      'Tape **`/mon-journal`** → clique **« ➕ Ajouter une entrée »** → raconte ce que vit ton personnage. Tu construis son background au fil du temps.',
      '',
      '📋 **Suis ta progression**',
      'Tape **`/mon-dossier`** → vois ton grade, ton ancienneté et ta progression vers le grade suivant.',
      '',
      '💡 Tu peux aussi tout faire depuis le **menu principal** (les boutons) !',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company • Message automatique' });
}

async function _handleGuideMembres(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  await interaction.reply({ content: '📣 Envoi du guide à chaque membre en cours… (ça peut prendre une minute selon le nombre de membres). Je te fais un récap à la fin.', flags: MessageFlags.Ephemeral });

  let membres;
  try { membres = await interaction.guild.members.fetch(); }
  catch (e) { return interaction.followUp({ content: `⚠️ Impossible de récupérer les membres : ${e.message}`, flags: MessageFlags.Ephemeral }).catch(() => {}); }

  const cibles = membres.filter(m => !m.user.bot && isMembre(m));
  const embed = _embedGuideMembre();
  let ok = 0, fermes = 0;
  for (const m of cibles.values()) {
    try { await m.send({ embeds: [embed] }); ok++; }
    catch { fermes++; }
    await new Promise(r => setTimeout(r, 1200)); // pause anti rate-limit Discord
  }

  return interaction.followUp({
    content: `✅ Guide envoyé à **${ok}** membre(s).${fermes ? `\n📪 **${fermes}** n'ont pas pu le recevoir (leurs MP sont fermés — ils devront ouvrir leurs messages privés du serveur).` : ''}`,
    flags: MessageFlags.Ephemeral,
  }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
//  💰 ÉCONOMIE RP (portefeuille perso + transferts)  &  🤝 PARRAINAGE
// ═══════════════════════════════════════════════════════════════
function _getCompte(db, id) {
  db.economie = db.economie || {};
  const cur = db.economie[id];
  if (typeof cur !== 'object' || cur === null) {
    db.economie[id] = { solde: (typeof cur === 'number' ? cur : 0), historique: [] };
  }
  if (!Array.isArray(db.economie[id].historique)) db.economie[id].historique = [];
  return db.economie[id];
}
// (déplacé dans utils.js)

function _embedPortefeuille(member, compte) {
  const e = new EmbedBuilder().setColor(0x2E8B57)
    .setTitle(`💰 Portefeuille — ${member.displayName}`)
    .setThumbnail(member.user.displayAvatarURL())
    .addFields({ name: '💵 Solde actuel', value: `**${_fmtDollars(compte.solde || 0)}**`, inline: false });
  const hist = (compte.historique || []).slice(-5).reverse();
  if (hist.length) {
    e.addFields({ name: '🧾 Dernières opérations', value: hist.map(h =>
      `${h.montant >= 0 ? '🟢 +' : '🔴 −'}${_fmtDollars(Math.abs(h.montant))} — ${h.raison || ''} *(${h.date})*`
    ).join('\n').slice(0, 1024) });
  }
  e.setFooter({ text: 'Iron Wolf Company • Dollars RP' });
  return e;
}

async function _handlePortefeuille(interaction) {
  if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres.', flags: MessageFlags.Ephemeral });
  const db = loadDB(); const compte = _getCompte(db, interaction.member.id); saveDB(db);
  return interaction.reply({ embeds: [_embedPortefeuille(interaction.member, compte)], flags: MessageFlags.Ephemeral });
}

async function _handlePayer(interaction) {
  if (!isMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres.', flags: MessageFlags.Ephemeral });
  const dest = interaction.options.getUser('membre');
  const montant = Math.floor(interaction.options.getInteger('montant'));
  const raison = (interaction.options.getString('raison') || 'Paiement').slice(0, 100);
  if (!dest || dest.id === interaction.user.id) return interaction.reply({ content: '❌ Choisis un autre membre que toi.', flags: MessageFlags.Ephemeral });
  if (dest.bot) return interaction.reply({ content: '❌ Tu ne peux pas payer un bot.', flags: MessageFlags.Ephemeral });
  if (!montant || montant <= 0) return interaction.reply({ content: '❌ Le montant doit être un nombre positif.', flags: MessageFlags.Ephemeral });
  const destMember = await interaction.guild.members.fetch(dest.id).catch(() => null);
  if (!destMember || !isMembre(destMember)) return interaction.reply({ content: '❌ Le destinataire doit être un membre IWC.', flags: MessageFlags.Ephemeral });

  const db = loadDB();
  const moi = _getCompte(db, interaction.member.id);
  if ((moi.solde || 0) < montant) return interaction.reply({ content: `❌ Solde insuffisant. Tu possèdes ${_fmtDollars(moi.solde || 0)}.`, flags: MessageFlags.Ephemeral });
  const lui = _getCompte(db, dest.id);
  const date = new Date().toLocaleDateString('fr-FR');
  moi.solde -= montant; moi.historique.push({ date, montant: -montant, raison: `Vers ${destMember.displayName} : ${raison}` });
  lui.solde = (lui.solde || 0) + montant; lui.historique.push({ date, montant, raison: `De ${interaction.member.displayName} : ${raison}` });
  moi.historique = moi.historique.slice(-30); lui.historique = lui.historique.slice(-30);
  saveDB(db);
  destMember.send({ content: `💰 **${interaction.member.displayName}** t'a envoyé **${_fmtDollars(montant)}** (${raison}). Nouveau solde : ${_fmtDollars(lui.solde)}.` }).catch(() => {});
  return interaction.reply({ content: `✅ Tu as envoyé **${_fmtDollars(montant)}** à **${destMember.displayName}**.\nTon nouveau solde : **${_fmtDollars(moi.solde)}**.`, flags: MessageFlags.Ephemeral });
}

async function _handleArgent(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const dest = interaction.options.getUser('membre');
  const montant = Math.floor(interaction.options.getInteger('montant')); // peut être négatif (amende)
  const raison = (interaction.options.getString('raison') || 'Ajustement Direction').slice(0, 100);
  if (!dest) return interaction.reply({ content: '❌ Membre introuvable.', flags: MessageFlags.Ephemeral });
  if (!montant) return interaction.reply({ content: '❌ Indique un montant (positif pour créditer, négatif pour retirer).', flags: MessageFlags.Ephemeral });
  const db = loadDB(); const c = _getCompte(db, dest.id);
  c.solde = Math.max(0, (c.solde || 0) + montant);
  c.historique.push({ date: new Date().toLocaleDateString('fr-FR'), montant, raison });
  c.historique = c.historique.slice(-30);
  saveDB(db);
  const dm = await interaction.guild.members.fetch(dest.id).catch(() => null);
  if (dm) dm.send({ content: `💰 ${montant >= 0 ? 'Tu as reçu' : "On t'a retiré"} **${_fmtDollars(Math.abs(montant))}** (${raison}). Nouveau solde : ${_fmtDollars(c.solde)}.` }).catch(() => {});
  return interaction.reply({ content: `✅ Solde de **${dest.username}** : **${montant >= 0 ? '+' : '−'}${_fmtDollars(Math.abs(montant))}** → nouveau solde **${_fmtDollars(c.solde)}**.`, flags: MessageFlags.Ephemeral });
}


function _detecterPole(member) {
  const legalNames   = ['Le Conseil', 'Directeur', 'Co-Directeur', 'Officier', 'Agent', 'Opérateur', 'Operateur', 'Recrue', 'Probatoire', 'Panseur', 'Penseur'];
  const illegalNames = ['Concepteur', 'Fléau', 'fleau', 'Exécuteur', 'éxécuteur', 'execu', 'Condamné', 'condamne', 'Maudit', 'Confrérie', 'confrerie'];
  const noms = member.roles.cache.map(r => r.name);
  const estLegal = noms.some(n => legalNames.some(x => n.includes(x)));
  const estIlleg = noms.some(n => illegalNames.some(x => n.includes(x)));
  if (estLegal && estIlleg) return '⚖️🔒 Les deux';
  if (estIlleg) return '🔒 Illégal';
  if (estLegal) return '⚖️ Légal';
  return '⚖️ Légal'; // par défaut
}

// Détecte le RANG d'un membre à partir des NOMS de ses rôles Discord réels.
// Renvoie le grade le plus élevé qu'il porte (priorité du plus haut au plus bas).
function _detecterRang(member) {
  const noms = member.roles.cache.map(r => r.name);
  const a = (motifs) => noms.find(n => motifs.some(mt => n.toLowerCase().includes(mt.toLowerCase())));

  // Grade légal (le plus haut porté), s'il y en a un
  const gradeLegal =
    a(['Conseil', 'Directeur']) ||
    a(['Officier']) ||
    a(['Agent']) ||
    a(['Opérateur', 'operateur']) ||
    a(['Panseur', 'Penseur']) ||
    a(['Recrue', 'Probatoire']);

  // Grade illégal (le plus haut porté), s'il y en a un
  const gradeIlleg =
    a(['Concepteur']) ||
    a(['Fléau', 'fleau']) ||
    a(['Exécuteur', 'execu', 'éxécu']) ||
    a(['Condamné', 'condamne']) ||
    a(['Maudit']) ||
    a(['Confrérie', 'confrerie']);

  // Membre des DEUX pôles → on montre les deux grades
  if (gradeLegal && gradeIlleg) return `${gradeLegal} / ${gradeIlleg}`;
  if (gradeIlleg) return gradeIlleg;
  if (gradeLegal) return gradeLegal;
  return 'Recrue – Probatoire';
}

// Met à jour le NOM (RP) d'un membre dans le Registre des membres
async function _majNomRegistre(discordId, nouveauNom, username) {
  const REGISTRE_DB = process.env.NOTION_MEMBRES_DB || NOTION_MEMBRES_DB;
  if (!process.env.NOTION_TOKEN || !REGISTRE_DB) return;
  try {
    const headers = { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
    // Retrouver la ligne par Discord ID, sinon par Nom (= ancien nom ou username)
    let page = null;
    try {
      const sId = await fetch(`https://api.notion.com/v1/databases/${REGISTRE_DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Discord ID', rich_text: { equals: discordId } }, page_size: 1 }) });
      if (sId.ok) { const d = await sId.json().catch(() => ({})); page = d.results?.[0] || null; }
    } catch {}
    if (!page && username) {
      try {
        const s2 = await fetch(`https://api.notion.com/v1/databases/${REGISTRE_DB}/query`, { method: 'POST', headers, body: JSON.stringify({ filter: { property: 'Nom', title: { equals: username } }, page_size: 1 }) });
        if (s2.ok) { const d2 = await s2.json().catch(() => ({})); page = d2.results?.[0] || null; }
      } catch {}
    }
    if (!page) { console.log(`⚠️ MàJ nom Registre : ligne introuvable pour ${nouveauNom}`); return; }
    const propsMaj = { 'Personnage': { rich_text: [{ text: { content: String(nouveauNom) } }] }, 'Discord ID': { rich_text: [{ text: { content: discordId } }] } };
    // Le Nom (titre) reste le pseudo Discord
    if (username) propsMaj['Nom'] = { title: [{ text: { content: String(username) } }] };
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, { method: 'PATCH', headers, body: JSON.stringify({ properties: propsMaj }) });
    console.log(`✅ Registre : personnage mis à jour → ${nouveauNom}`);
  } catch (e) { console.log('❌ _majNomRegistre:', e.message); }
}

// Définit la description (sujet) de chaque salon : à quoi il sert + comment l'utiliser.
// Les salons sont reconnus par leur nom (insensible aux accents/emojis).
async function _definirDescriptionsSalons(guild) {
  try {
    const clean = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');

    // Liste : [motifs de nom] => description
    const DESCRIPTIONS = [
      [['annoncesillegal'], "📣 Annonces réservées au pôle illégal (La Confrérie). Lecture seule — seule la Direction publie ici."],
      [['annonces'], "📣 Annonces officielles de la Compagnie. Lecture seule — seule la Direction publie ici. Active les notifications pour ne rien rater."],
      [['reglementillegal'], "📜 Règles propres au pôle illégal. À lire et respecter."],
      [['reglement'], "📜 Règlement de la Compagnie (Discord + RP). Lis-le entièrement, puis réagis avec ✅ sur le message de validation pour accéder au reste du serveur."],
      [['arrivee'], "👋 Arrivée des nouveaux visiteurs (automatique). C'est ici qu'on souhaite la bienvenue."],
      [['evenements'], "📅 Événements à venir de la communauté. Garde un œil ici pour les dates importantes."],
      [['discussionhrp'], "💬 Discussion hors-RP (entre joueurs). On parle ici en tant que personnes, pas en personnage."],
      [['discussionrp'], "💬 Discussion en RP (dans la peau de ton personnage). Reste immersif."],
      [['attentevocal'], "🔊 Salon vocal d'attente pour les visiteurs."],
      [['suggestionidee'], "💡 Propose tes idées et suggestions pour améliorer la communauté."],
      [['screenshots'], "📸 Partage tes plus belles captures d'écran en jeu."],
      [['clipstempsfort'], "🎬 Partage tes clips et moments forts en jeu."],
      [['planning'], "📋 Planning des sessions et activités. Consulte-le pour t'organiser."],
      [['hierarchieironwolf', 'hierarchieiron'], "🏛️ Organigramme du pôle légal (qui est qui). Lecture seule, mis à jour automatiquement."],
      [['hierarchieombre'], "💀 Organigramme du pôle illégal (La Confrérie). Lecture seule."],
      [['contratsreponses'], "📁 Suivi des réponses aux contrats (Direction). Usage interne."],
      [['contrats'], "📜 Contrats de mission de la Compagnie. Consulte les offres ; utilise les commandes /contrats pour voir les tiens."],
      [['coffreentreprise', 'coffreillegal', 'coffre'], "💰 Suivi de la trésorerie / du coffre. Utilise /tresor pour enregistrer une transaction et /solde pour voir l'état."],
      [['agendaillegal'], "📅 Agenda du pôle illégal. Les rendez-vous y sont publiés ; crée-en avec /rdv."],
      [['agenda'], "📅 Agenda des rendez-vous. Crée un RDV avec /rdv ; consulte avec /agenda voir."],
      [['histoireiwc', 'histoireiron'], "📖 L'histoire et le lore de l'Iron Wolf Company. Lecture seule."],
      [['histoiredelaconfrerie'], "📖 L'histoire du pôle illégal (La Confrérie). Lecture seule."],
      [['absences'], "🟡 Déclare tes absences ici avec /absent, et ton retour avec /retour. Préviens toujours avant de t'absenter."],
      [['parlotehrpombre'], "💬 Discussion hors-RP du pôle illégal."],
      [['parloteombre'], "💬 Discussion en RP du pôle illégal."],
      [['parlotehrp'], "💬 Discussion hors-RP du pôle légal."],
      [['parlote'], "💬 Discussion détendue du pôle légal."],
      [['formation'], "🎓 Formations et entraînements des membres. Consulte les sessions ici."],
      [['grade'], "🎖️ Tes grades et promotions. Mis à jour automatiquement selon tes rôles."],
      [['surnompseudo'], "✏️ Définis ton nom RP ici avec la commande /nom. Ton surnom serveur doit être ton nom de personnage."],
      [['operations'], "🎯 Opérations en cours et à venir. La Direction crée les opérations avec /op-creer ; consulte avec /ops."],
      [['informateurs'], "🕵️ Gestion des informateurs et de leurs renseignements (Direction). Usage interne."],
      [['plans'], "🗺️ Partage ici les plans et photos de repérage. Les images sont archivées automatiquement dans Notion."],
      [['affaires'], "⚔️ Affaires soumises au vote de la Direction. Utilise /affaire pour en proposer une."],
      [['backgroundsmembres'], "👥 Histoires (backgrounds) des personnages des membres. Usage interne Direction."],
      [['dossierrecrutement'], "📁 Dossiers de recrutement reçus (Direction). Usage interne."],
      [['recrutementinterne'], "📋 Suivi interne des candidatures (Direction)."],
      [['fichespersonnages'], "🧑 Fiches des personnages. Synchronisées automatiquement avec Notion."],
      [['journaldebord'], "📖 Journal de bord : toutes les actions importantes et alertes du bot sont enregistrées ici (Direction)."],
      [['loreetunivers', 'loreunivers'], "🌍 Le lore et l'univers du serveur (époque, contexte, factions). Lecture seule."],
      [['commandesslash'], "⌨️ Liste de toutes les commandes du bot et leur usage. Tape / pour voir les commandes disponibles."],
      [['conversationdirectionhrp', 'conversationdirection'], "💬 Salon de discussion hors-RP de la Direction. Usage interne."],
      [['patchnote'], "🔇 Notes de mises à jour du bot. Lecture seule."],
      [['logs'], "📊 Journal technique du bot (Direction). Usage interne."],
    ];

    const salons = guild.channels.cache.filter(c => c.type === 0 || c.type === 5); // textuels + annonces
    let ok = 0;
    for (const ch of salons.values()) {
      const nomClean = clean(ch.name);
      const match = DESCRIPTIONS.find(([motifs]) => motifs.some(m => nomClean.includes(m)));
      if (!match) continue;
      const desc = match[1];
      if ((ch.topic || '') === desc) continue; // déjà à jour
      try { await ch.setTopic(desc); ok++; await new Promise(r => setTimeout(r, 300)); }
      catch (e) { /* permissions ou salon spécial */ }
    }
    console.log(`✅ Descriptions de salons mises à jour : ${ok}`);
    return ok;
  } catch (e) { console.log('❌ _definirDescriptionsSalons:', e.message); return 0; }
}

// Donne au rôle Visiteur l'accès aux salons d'entrée (recrutement, règlement, arrivées)
// pour que les nouveaux arrivants tombent bien sur le formulaire de candidature.
async function _assurerAccesVisiteur(guild) {
  try {
    const visiteurRole = guild.roles.cache.find(r => r.name.includes('Visiteur'));
    if (!visiteurRole) { console.log('⚠️ Accès Visiteur : rôle Visiteur introuvable.'); return; }

    // Salons d'entrée à rendre visibles pour les visiteurs
    const salonsEntree = [
      { id: CH.RECRUTEMENT, nom: 'recrutement', ecrire: false },         // voir le panneau (les boutons suffisent)
      { id: '1511135557143629926', nom: 'règlement', ecrire: false },    // le salon règlement précis (pour lire + réagir ✅)
      { id: '1509243971472195584', nom: 'commencer-ici', ecrire: false },// le salon « Commencer ici » (pour lire le guide d'arrivée)
      { ch: getChById(guild, 'ARRIVEES', 'arrivees', 'arrivée'), nom: 'arrivée', ecrire: false }, // voir le message de bienvenue + lien règlement
    ].filter(Boolean);

    for (const s of salonsEntree) {
      const ch = s.ch || guild.channels.cache.get(s.id);
      if (!ch) continue;
      try {
        await ch.permissionOverwrites.edit(visiteurRole, {
          ViewChannel: true,           // voir le salon
          ReadMessageHistory: true,    // lire les messages (le panneau)
          SendMessages: false,         // pas besoin d'écrire (juste cliquer les boutons)
          AddReactions: true,          // pour valider le règlement avec ✅
        });
        console.log(`✅ Accès Visiteur assuré : #${ch.name}`);
      } catch (e) { console.log(`⚠️ Accès Visiteur #${ch?.name}: ${e.message}`); }
    }

    // Salon VOCAL d'attente : le visiteur doit pouvoir le voir, le rejoindre et parler
    const cleanV = x => (x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const vocalAttente = guild.channels.cache.find(c =>
      (c.type === 2 || c.type === 13) && cleanV(c.name).includes('attente'));
    if (vocalAttente) {
      try {
        await vocalAttente.permissionOverwrites.edit(visiteurRole, {
          ViewChannel: true,   // voir le salon vocal
          Connect: true,       // pouvoir le rejoindre
          Speak: true,         // pouvoir parler dedans
        });
        console.log(`✅ Accès Visiteur (vocal) assuré : 🔊 ${vocalAttente.name}`);
      } catch (e) { console.log(`⚠️ Accès Visiteur vocal: ${e.message}`); }
    } else {
      console.log('⚠️ Salon vocal d\'attente introuvable (nom contenant « attente »).');
    }
  } catch (e) { console.log('❌ _assurerAccesVisiteur:', e.message); }
}

client.login(process.env.DISCORD_TOKEN)
  .then(() => console.log('🔑 Login OK'))
  .catch(e => { console.error('❌ Login failed:', e.message); process.exit(1); });
