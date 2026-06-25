// ───────────────────────────────────────────────────────────────────────────
//  operations-etapes.js — Préparation d'opération PAR ÉTAPES (IWC / Confrérie)
//  ----------------------------------------------------------------------------
//  Déclenché AUTOMATIQUEMENT quand la Direction VALIDE un contrat Confrérie :
//  une « opération » catégorisée d'après le type de mission du contrat est
//  ouverte dans #operations, sous forme d'un fil dédié contenant un panneau
//  d'étapes à préparer puis valider une par une.
//
//  ⚙️ Les ÉTAPES sont ADAPTÉES au type de contrat (chaque catégorie a son
//  propre scénario : Contrebande, Sabotage, Vol, Élimination, Extorsion,
//  Espionnage, Protection, Chasseur de primes, Récupération de dette…), avec
//  un modèle GÉNÉRIQUE par défaut (« Autre »).
//
//  Chaque étape porte des champs (formulaire) + des photos (collectées dans le
//  fil) et un bouton « ✅ Valider l'étape » (Direction). Les étapes se
//  déverrouillent dans l'ordre. Quand tout est validé, un DOSSIER D'OPÉRATION
//  est généré : un fichier .md téléchargeable + un récapitulatif.
//
//  Identifiants ISOLÉS : « opx_* »  →  aucune collision avec op_* / opnew_*.
//  Stockage ISOLÉ : db.preparations  →  ne touche pas db.operations.
//  Notion/journal/pole sont INJECTÉS par index.js via init() (facultatif).
// ───────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder,
} = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function _persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const SALON_OPERATIONS = '1518349707686973470';
const ROLE_LEGAL = '1508756436082102303';
const ROLE_ILLEGAL = '1508898841993281658';
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
const COL = { or: 0xC8A45C, bleu: 0x3B82F6, rouge: 0x8B1A1A, vert: 0x2ECC71, gris: 0x555555 };

let _inj = {};
function init(opts) { _inj = opts || {}; }

function isDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n))); } catch { return false; }
}
function _poleRoleId(guild, pole) {
  if (typeof _inj.poleRoleId === 'function') { try { return _inj.poleRoleId(guild, pole); } catch {} }
  return pole === 'legal' ? ROLE_LEGAL : ROLE_ILLEGAL;
}
function _salonOps(guild) {
  return guild.channels.cache.get(SALON_OPERATIONS)
    || guild.channels.cache.find(c => /op[eé]rations?/i.test(c.name || ''))
    || null;
}
function _clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function _fmtDate(iso) {
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

// ── Catégorie d'opération déduite du type de mission du contrat ──
const CATEGORIES = {
  'Contrebande':           { emoji: '📦',  pole: 'illegal' },
  'Sabotage':              { emoji: '🧨',  pole: 'illegal' },
  'Vol organisé':          { emoji: '💰',  pole: 'illegal' },
  'Élimination':           { emoji: '🗡️',  pole: 'illegal' },
  'Extorsion':             { emoji: '✊',  pole: 'illegal' },
  'Espionnage':            { emoji: '👁️',  pole: 'illegal' },
  'Protection':            { emoji: '🛡️',  pole: 'legal'   },
  'Chasseur de primes':    { emoji: '🎯',  pole: 'legal'   },
  'Récupération de dette': { emoji: '⛓️',  pole: 'illegal' },
  // ── Contrats légaux (Iron Wolf Company) — pôle légal ──
  'Protection rapprochée':   { emoji: '🛡️', pole: 'legal' },
  'Escorte de convoi':       { emoji: '🐎', pole: 'legal' },
  'Surveillance / Filature': { emoji: '👁️', pole: 'legal' },
  'Chasse de prime':         { emoji: '🎯', pole: 'legal' },
  'Intervention armée':      { emoji: '⚔️', pole: 'legal' },
  'Autre':                 { emoji: '❓',  pole: 'illegal' },
};
function _categorie(typeMission) { return CATEGORIES[typeMission] || { emoji: '🎯', pole: 'illegal' }; }

// ═══════════════════════════════════════════════════════════════
//  MODÈLES D'ÉTAPES PAR TYPE DE CONTRAT
//  champ : { id, label, type:'short'|'para', req:bool, max, ph }
//  étape : { key, label, intro, photo:'req'|true|false, champs:[...] (≤4) }
// ═══════════════════════════════════════════════════════════════
function C(id, label, type, req, max, ph) { return { id, label, type, req, max, ph }; }

// Étape « équipe » commune (placeholder de rôles adaptable)
function _equipe(rolesPh) {
  return {
    key: 'equipe', label: '👥 Constitution de l\'équipe', photo: false,
    intro: 'Réunir et répartir les membres de l\'opération.',
    champs: [
      C('effectif', 'Effectif requis (nombre)', 'short', true, 40, 'Ex : 4 membres'),
      C('roles', 'Rôles assignés (qui fait quoi)', 'para', true, 600, rolesPh || 'Qui tient quel rôle…'),
      C('participants', 'Membres confirmés', 'para', false, 500, 'Liste des frères engagés'),
    ],
  };
}

const STEP_TEMPLATES = {
  // ─── 🎯 Chasseur de primes ───
  'Chasseur de primes': [
    { key: 'reperage', label: '🔍 Repérage de la cible', photo: 'req', intro: 'Localiser et observer la cible avant toute action.', champs: [
      C('position', 'Dernière position connue', 'short', true, 120, 'Ex : ferme à l\'est de Valentine'),
      C('effectif', 'Cible + gardes / escorte (nombre)', 'short', true, 80, 'Ex : 1 cible + 3 hommes armés'),
      C('habitudes', 'Habitudes / horaires observés', 'para', false, 500, 'Déplacements, routines, points faibles…'),
      C('notes', 'Notes de repérage', 'para', false, 500, 'Terrain, accès, dangers…'),
    ] },
    { key: 'plan', label: '🗺️ Plan d\'approche', photo: true, intro: 'Comment on approche, on capture, on se replie.', champs: [
      C('ralliement', 'Point de ralliement', 'short', true, 120, 'Ex : vieux moulin au nord'),
      C('itineraire', 'Approche + repli', 'para', true, 600, 'Chemin d\'approche, plan B, repli…'),
      C('equipement', 'Équipement (lasso, armes, chevaux…)', 'para', false, 400, 'Pour ramener la cible vivante de préférence'),
      C('horaire', 'Heure d\'intervention prévue', 'short', false, 80, 'Ex : 22/06 à 21h'),
    ] },
    _equipe('Pisteur, tireur, rabatteur, escorte…'),
    { key: 'execution', label: '🎯 Capture', photo: 'req', intro: 'La capture elle-même : preuve à l\'appui.', champs: [
      C('issue', 'Issue (capturé vivant / mort)', 'short', true, 120, 'Ex : capturé vivant'),
      C('deroulement', 'Déroulement de la capture', 'para', true, 700, 'Compte-rendu de l\'intervention…'),
      C('pertes', 'Pertes / incidents', 'para', false, 400, 'Blessés, fuite, témoins…'),
    ] },
    { key: 'bilan', label: '💰 Livraison & prime', photo: true, intro: 'Remise de la cible et encaissement.', champs: [
      C('lieuRemise', 'Lieu de remise (shérif / commanditaire)', 'short', false, 120, 'Ex : bureau du shérif de Rhodes'),
      C('prime', 'Prime encaissée ($)', 'short', true, 80, 'Ex : 3000$'),
      C('bilan', 'Bilan final', 'para', false, 600, 'Répartition, suites…'),
    ] },
  ],

  // ─── 📦 Contrebande ───
  'Contrebande': [
    { key: 'marchandise', label: '📦 Marchandise & repérage', photo: true, intro: 'Identifier la cargaison et la route.', champs: [
      C('cargaison', 'Nature de la cargaison', 'short', true, 120, 'Ex : caisses d\'alcool, armes, opium…'),
      C('depart', 'Point de départ / récupération', 'short', true, 120, 'Ex : entrepôt de Van Horn'),
      C('destination', 'Destination', 'short', true, 120, 'Ex : Saint-Denis'),
      C('quantite', 'Quantité / valeur estimée', 'short', false, 100, 'Ex : 12 caisses ~ 4000$'),
    ] },
    { key: 'route', label: '🗺️ Route & couverture', photo: true, intro: 'Tracer le trajet et éviter la loi.', champs: [
      C('itineraire', 'Itinéraire prévu', 'para', true, 600, 'Chemins, gués, planques…'),
      C('controles', 'Points de contrôle / patrouilles à éviter', 'para', false, 400, 'Postes de loi, péages, milices…'),
      C('couverture', 'Couverture (déguisement, faux papiers)', 'para', false, 400, 'Comment passer inaperçu…'),
      C('horaire', 'Fenêtre / horaire', 'short', false, 80, 'Ex : nuit du 22/06'),
    ] },
    _equipe('Convoyeur, éclaireur, guetteur, chargement…'),
    { key: 'execution', label: '🚚 Acheminement', photo: 'req', intro: 'Le transport effectif de la marchandise.', champs: [
      C('deroulement', 'Déroulement du transport', 'para', true, 700, 'Compte-rendu du trajet…'),
      C('incidents', 'Contrôles / incidents rencontrés', 'para', false, 500, 'Patrouilles, pertes, avaries…'),
    ] },
    { key: 'bilan', label: '💰 Livraison & paiement', photo: true, intro: 'Remise au destinataire et paiement.', champs: [
      C('destinataire', 'Destinataire / acheteur', 'short', false, 120, 'À qui la marchandise est remise'),
      C('lieuRemise', 'Lieu de remise', 'short', false, 120, 'Ex : arrière-salle du saloon'),
      C('paiement', 'Paiement encaissé ($)', 'short', true, 80, 'Ex : 4000$'),
    ] },
  ],

  // ─── 🧨 Sabotage ───
  'Sabotage': [
    { key: 'reperage', label: '🔍 Repérage de la cible', photo: 'req', intro: 'Repérer ce qui doit être saboté.', champs: [
      C('cible', 'Cible à saboter (structure, matériel…)', 'short', true, 140, 'Ex : pont, voie ferrée, dépôt…'),
      C('position', 'Position / accès', 'short', true, 120, 'Ex : nord de Annesburg'),
      C('surveillance', 'Surveillance présente', 'para', false, 400, 'Gardes, rondes, chiens…'),
      C('notes', 'Notes de repérage', 'para', false, 400, 'Points faibles, matériaux…'),
    ] },
    { key: 'plan', label: '🧨 Plan de sabotage', photo: true, intro: 'Méthode, matériel, accès et repli.', champs: [
      C('methode', 'Méthode (explosifs, feu, mécanique…)', 'short', true, 120, 'Ex : charge de dynamite'),
      C('materiel', 'Matériel nécessaire', 'para', false, 400, 'Dynamite, outils, accélérateur…'),
      C('acces', 'Point d\'accès + repli', 'para', true, 500, 'Entrée discrète, sortie, plan B…'),
      C('horaire', 'Horaire prévu', 'short', false, 80, 'Ex : 03h du matin'),
    ] },
    _equipe('Poseur, guetteur, diversion, repli…'),
    { key: 'execution', label: '💥 Exécution', photo: 'req', intro: 'Le sabotage et ses effets.', champs: [
      C('deroulement', 'Déroulement de l\'action', 'para', true, 700, 'Compte-rendu…'),
      C('degats', 'Dégâts causés', 'para', true, 400, 'Ce qui a été détruit / neutralisé'),
      C('temoins', 'Témoins / incidents', 'para', false, 400, 'Vus ? poursuivis ?'),
    ] },
    { key: 'bilan', label: '💰 Bilan & prime', photo: true, intro: 'Résultat et encaissement.', champs: [
      C('resultat', 'Objectif atteint ?', 'short', true, 120, 'Ex : voie ferrée hors service'),
      C('prime', 'Prime encaissée ($)', 'short', true, 80, 'Ex : 2500$'),
      C('traces', 'Traces laissées / suites', 'para', false, 400, 'Indices, soupçons…'),
    ] },
  ],

  // ─── 💰 Vol organisé ───
  'Vol organisé': [
    { key: 'reperage', label: '🔍 Repérage de la cible', photo: 'req', intro: 'Étudier la cible du coup.', champs: [
      C('cible', 'Cible (banque, train, diligence, coffre…)', 'short', true, 140, 'Ex : banque de Valentine'),
      C('position', 'Position', 'short', true, 120, 'Lieu exact'),
      C('gardes', 'Gardes / sécurité', 'short', true, 100, 'Ex : 2 gardes + shérif proche'),
      C('horaires', 'Horaires / habitudes', 'para', false, 400, 'Ouverture, convois, relèves…'),
    ] },
    { key: 'plan', label: '🗺️ Plan du coup', photo: true, intro: 'Entrée, exécution, fuite.', champs: [
      C('entree', 'Point d\'entrée / méthode', 'short', true, 140, 'Ex : par le toit, à l\'ouverture…'),
      C('fuite', 'Itinéraire de fuite + planque', 'para', true, 500, 'Chemin de repli, planque…'),
      C('materiel', 'Matériel (dynamite, chevaux…)', 'para', false, 400, 'Outils nécessaires'),
      C('horaire', 'Horaire prévu', 'short', false, 80, 'Ex : 22/06 à 14h'),
    ] },
    _equipe('Perceur, guetteur, conducteur, couverture…'),
    { key: 'execution', label: '💰 Exécution du vol', photo: 'req', intro: 'Le casse lui-même.', champs: [
      C('deroulement', 'Déroulement', 'para', true, 700, 'Compte-rendu du coup…'),
      C('butin', 'Butin saisi', 'short', true, 120, 'Ex : 5000$ + bijoux'),
      C('complications', 'Complications', 'para', false, 400, 'Alerte, poursuite, pertes…'),
    ] },
    { key: 'bilan', label: '🪙 Partage & écoulement', photo: true, intro: 'Planque, partage, recel.', champs: [
      C('planque', 'Lieu de planque', 'short', false, 120, 'Où le butin est mis à l\'abri'),
      C('repartition', 'Répartition du butin', 'para', false, 500, 'Parts par membre / Confrérie'),
      C('receleur', 'Receleur / écoulement', 'short', false, 120, 'À qui revendre'),
    ] },
  ],

  // ─── 🗡️ Élimination ───
  'Élimination': [
    { key: 'reperage', label: '🔍 Repérage de la cible', photo: 'req', intro: 'Localiser et observer la cible.', champs: [
      C('position', 'Dernière position connue', 'short', true, 120, 'Lieu exact'),
      C('escorte', 'Escorte / gardes (nombre)', 'short', true, 100, 'Ex : cible + 2 gardes'),
      C('habitudes', 'Habitudes / horaires', 'para', false, 400, 'Routines, lieux fréquentés…'),
      C('notes', 'Notes de repérage', 'para', false, 400, 'Terrain, dangers…'),
    ] },
    { key: 'plan', label: '🗺️ Plan d\'approche', photo: true, intro: 'Méthode, arme, embuscade, repli.', champs: [
      C('methode', 'Méthode (discrète / frontale)', 'short', true, 120, 'Ex : tir à distance'),
      C('arme', 'Arme / moyen', 'short', false, 100, 'Ex : carabine, poison, couteau'),
      C('embuscade', 'Point d\'embuscade + repli', 'para', true, 500, 'Où frapper, comment fuir…'),
      C('horaire', 'Horaire prévu', 'short', false, 80, 'Ex : à l\'aube'),
    ] },
    _equipe('Tireur, guetteur, diversion, repli…'),
    { key: 'execution', label: '🗡️ Exécution', photo: 'req', intro: 'L\'élimination, preuve à l\'appui.', champs: [
      C('confirmation', 'Élimination confirmée ?', 'short', true, 120, 'Ex : confirmé'),
      C('deroulement', 'Déroulement', 'para', true, 700, 'Compte-rendu…'),
      C('temoins', 'Témoins / pertes', 'para', false, 400, 'Vus ? riposte ?'),
    ] },
    { key: 'bilan', label: '💰 Bilan & prime', photo: true, intro: 'Nettoyage et encaissement.', champs: [
      C('nettoyage', 'Nettoyage / traces', 'para', false, 400, 'Corps, indices, alibi…'),
      C('prime', 'Prime encaissée ($)', 'short', true, 80, 'Ex : 4000$'),
      C('bilan', 'Bilan / suites', 'para', false, 400, 'Risques, représailles…'),
    ] },
  ],

  // ─── ✊ Extorsion / Racket ───
  'Extorsion': [
    { key: 'cible', label: '🎯 Cible & levier', photo: false, intro: 'Qui pressuriser, et avec quel levier.', champs: [
      C('cible', 'Cible (personne / commerce)', 'short', true, 140, 'Ex : saloon de Rhodes'),
      C('position', 'Position / lieu', 'short', true, 120, 'Où la trouver'),
      C('montant', 'Montant visé', 'short', true, 100, 'Ex : 500$ / semaine'),
      C('levier', 'Levier / point de pression', 'para', false, 400, 'Dette, secret, menace crédible…'),
    ] },
    { key: 'approche', label: '🗺️ Approche & menace', photo: false, intro: 'Comment faire plier la cible.', champs: [
      C('methode', 'Méthode (intimidation, démonstration…)', 'short', true, 140, 'Ex : visite musclée'),
      C('message', 'Message à faire passer', 'para', true, 500, 'Ce qu\'on exige et les conséquences…'),
      C('horaire', 'Quand', 'short', false, 80, 'Ex : à la fermeture'),
    ] },
    _equipe('Négociateur, gros bras, guetteur…'),
    { key: 'execution', label: '💪 Mise sous pression', photo: 'req', intro: 'La confrontation et son issue.', champs: [
      C('deroulement', 'Déroulement de la confrontation', 'para', true, 700, 'Compte-rendu…'),
      C('reaction', 'Réaction de la cible', 'para', false, 400, 'Cède ? résiste ? prévient la loi ?'),
    ] },
    { key: 'bilan', label: '💰 Encaissement', photo: true, intro: 'Ce qui est obtenu et les suites.', champs: [
      C('montant', 'Montant obtenu ($)', 'short', true, 80, 'Ex : 500$'),
      C('periodicite', 'Récurrent ? (périodicité)', 'short', false, 100, 'Ex : chaque semaine'),
      C('suites', 'Suites / risques', 'para', false, 400, 'Représailles, surveillance…'),
    ] },
  ],

  // ─── 👁️ Espionnage / Filature ───
  'Espionnage': [
    { key: 'cible', label: '🎯 Cible & objectif', photo: false, intro: 'Qui surveiller et quoi obtenir.', champs: [
      C('cible', 'Cible à surveiller', 'short', true, 140, 'Personne / groupe'),
      C('objectif', 'Informations recherchées', 'para', true, 500, 'Ce qu\'on veut découvrir…'),
      C('position', 'Position habituelle', 'short', false, 120, 'Où la trouver'),
    ] },
    { key: 'dispositif', label: '👁️ Dispositif de surveillance', photo: false, intro: 'Comment observer sans se faire voir.', champs: [
      C('observation', 'Points d\'observation', 'para', true, 500, 'Planques, angles, relais…'),
      C('moyens', 'Moyens (planque, taupe, contact…)', 'para', false, 400, 'Ressources mobilisées'),
      C('discretion', 'Mesures de discrétion', 'para', false, 400, 'Déguisements, couverture…'),
      C('horaires', 'Horaires de surveillance', 'short', false, 100, 'Ex : 18h-minuit'),
    ] },
    _equipe('Suiveurs, relais, planque…'),
    { key: 'execution', label: '📋 Recueil d\'informations', photo: 'req', intro: 'Les observations rapportées.', champs: [
      C('observations', 'Observations recueillies', 'para', true, 700, 'Faits, déplacements, échanges…'),
      C('contacts', 'Contacts / rencontres notés', 'para', false, 500, 'Qui voit qui, où, quand'),
    ] },
    { key: 'bilan', label: '📑 Rapport & remise', photo: true, intro: 'Synthèse et remise du renseignement.', champs: [
      C('synthese', 'Synthèse / conclusions', 'para', true, 600, 'Ce qu\'il faut retenir'),
      C('destinataire', 'À qui remettre le rapport', 'short', false, 120, 'Commanditaire / Direction'),
      C('prime', 'Prime encaissée ($)', 'short', false, 80, 'Ex : 1500$'),
    ] },
  ],

  // ─── 🛡️ Protection ───
  'Protection': [
    { key: 'protege', label: '🎯 Protégé & menace', photo: false, intro: 'Qui / quoi protéger et contre quoi.', champs: [
      C('protege', 'Protégé (personne / bien)', 'short', true, 140, 'Qui ou quoi est protégé'),
      C('menace', 'Nature de la menace', 'para', true, 500, 'Qui menace, comment…'),
      C('cadre', 'Durée / lieu de la mission', 'short', false, 120, 'Ex : convoi Valentine→Rhodes'),
    ] },
    { key: 'dispositif', label: '🗺️ Dispositif', photo: true, intro: 'Le plan de protection.', champs: [
      C('itineraires', 'Itinéraires / positions sûrs', 'para', true, 500, 'Trajets, points de garde…'),
      C('sensibles', 'Points sensibles', 'para', false, 400, 'Embuscades possibles, zones à risque'),
      C('riposte', 'Plan en cas d\'attaque', 'para', false, 400, 'Repli, riposte, signal…'),
      C('horaires', 'Horaires / relèves', 'short', false, 100, 'Tours de garde'),
    ] },
    _equipe('Garde rapprochée, éclaireur, arrière-garde…'),
    { key: 'execution', label: '🛡️ Mission de protection', photo: false, intro: 'Le déroulé de la protection.', champs: [
      C('deroulement', 'Déroulement', 'para', true, 700, 'Compte-rendu de la mission…'),
      C('incidents', 'Incidents / attaques repoussées', 'para', false, 500, 'Ce qui s\'est passé'),
    ] },
    { key: 'bilan', label: '💰 Bilan & prime', photo: true, intro: 'État final et encaissement.', champs: [
      C('etat', 'Protégé sain et sauf ?', 'short', true, 120, 'Ex : oui, sans incident'),
      C('bilan', 'Bilan / pertes', 'para', false, 400, 'Blessés, dégâts…'),
      C('prime', 'Prime encaissée ($)', 'short', true, 80, 'Ex : 2000$'),
    ] },
  ],

  // ─── ⛓️ Récupération de dette ───
  'Récupération de dette': [
    { key: 'debiteur', label: '🔍 Débiteur & créance', photo: false, intro: 'Qui doit, combien, et où le trouver.', champs: [
      C('debiteur', 'Débiteur (qui doit)', 'short', true, 140, 'Nom / description'),
      C('montant', 'Montant dû', 'short', true, 100, 'Ex : 1200$'),
      C('position', 'Position / lieu', 'short', true, 120, 'Où le trouver'),
      C('solvabilite', 'Solvabilité / biens saisissables', 'para', false, 400, 'Peut-il payer ? quoi saisir ?'),
    ] },
    { key: 'approche', label: '🗺️ Approche', photo: false, intro: 'Méthode de recouvrement.', champs: [
      C('methode', 'Méthode (rappel, pression, saisie…)', 'short', true, 140, 'Ex : pression musclée'),
      C('leviers', 'Arguments / leviers', 'para', false, 400, 'Comment le faire payer…'),
      C('horaire', 'Quand', 'short', false, 80, 'Ex : au petit matin'),
    ] },
    _equipe('Recouvreur, gros bras, guetteur…'),
    { key: 'execution', label: '⛓️ Recouvrement', photo: 'req', intro: 'La récupération effective.', champs: [
      C('deroulement', 'Déroulement', 'para', true, 700, 'Compte-rendu…'),
      C('recupere', 'Montant / biens récupérés', 'short', true, 120, 'Ex : 1200$ ou cheval + selle'),
      C('resistance', 'Résistance rencontrée', 'para', false, 400, 'Refus, fuite, bagarre…'),
    ] },
    { key: 'bilan', label: '💰 Remise & commission', photo: true, intro: 'Remise au créancier et part.', champs: [
      C('remise', 'Remis au créancier', 'short', false, 120, 'Ce qui revient au commanditaire'),
      C('commission', 'Commission encaissée ($)', 'short', true, 80, 'Notre part'),
      C('reste', 'Reste dû / suites', 'para', false, 400, 'Solde, relance prévue…'),
    ] },
  ],

  // ─── 🐎 Escorte de convoi (légal) ───
  'Escorte de convoi': [
    { key: 'reperage', label: '🔍 Reconnaissance du trajet', photo: true, intro: 'Étudier le trajet et ses dangers.', champs: [
      C('depart', 'Point de départ', 'short', true, 120, 'Ex : Valentine'),
      C('destination', 'Destination', 'short', true, 120, 'Ex : Saint-Denis'),
      C('itineraire', 'Itinéraire prévu', 'para', true, 500, 'Routes, gués, relais…'),
      C('risques', 'Zones à risque', 'para', false, 400, 'Embuscades possibles, passages étroits…'),
    ] },
    { key: 'plan', label: '🗺️ Plan d\'escorte', photo: true, intro: 'Formation et réaction en cas d\'attaque.', champs: [
      C('formation', 'Formation / positions', 'para', true, 500, 'Tête, flancs, arrière-garde…'),
      C('controles', 'Points de contrôle / haltes', 'para', false, 400, 'Où s\'arrêter, vérifier…'),
      C('riposte', 'Plan en cas d\'attaque', 'para', false, 400, 'Repli, riposte, signal…'),
      C('horaire', 'Départ prévu', 'short', false, 80, 'Ex : 22/06 à 9h'),
    ] },
    _equipe('Tête de convoi, flancs, arrière-garde, éclaireur…'),
    { key: 'execution', label: '🐎 Escorte', photo: 'req', intro: 'Le convoi en mouvement.', champs: [
      C('deroulement', 'Déroulement du convoi', 'para', true, 700, 'Compte-rendu du trajet…'),
      C('incidents', 'Incidents / attaques', 'para', false, 500, 'Ce qui s\'est passé'),
    ] },
    { key: 'bilan', label: '💰 Bilan & paiement', photo: true, intro: 'Livraison et règlement.', champs: [
      C('etat', 'Cargaison / protégé livré intact ?', 'short', true, 120, 'Ex : oui, sans perte'),
      C('pertes', 'Pertes / dégâts', 'para', false, 400, 'Blessés, marchandise abîmée…'),
      C('paiement', 'Paiement encaissé ($)', 'short', true, 80, 'Ex : 2000$'),
    ] },
  ],

  // ─── ⚔️ Intervention armée (légal) ───
  'Intervention armée': [
    { key: 'reperage', label: '🔍 Repérage', photo: 'req', intro: 'Reconnaître la cible et l\'opposition.', champs: [
      C('cible', 'Cible / lieu de l\'intervention', 'short', true, 140, 'Ex : camp hors-la-loi au nord'),
      C('position', 'Position', 'short', true, 120, 'Lieu exact'),
      C('ennemis', 'Opposition (nombre, armement)', 'short', true, 100, 'Ex : ~6 hommes armés'),
      C('defenses', 'Défenses / obstacles', 'para', false, 400, 'Barricades, guetteurs, terrain…'),
    ] },
    { key: 'plan', label: '🗺️ Plan d\'assaut', photo: true, intro: 'Entrée, manœuvre, repli.', champs: [
      C('entree', 'Point d\'entrée / approche', 'short', true, 140, 'Par où attaquer'),
      C('manoeuvre', 'Manœuvre / plan d\'assaut', 'para', true, 500, 'Qui fait quoi, dans quel ordre…'),
      C('repli', 'Repli / extraction', 'para', false, 400, 'Comment se retirer'),
      C('equipement', 'Équipement / armement', 'para', false, 400, 'Armes, munitions, dynamite…'),
    ] },
    _equipe('Assaut, couverture, soutien, repli…'),
    { key: 'execution', label: '⚔️ Assaut', photo: 'req', intro: 'L\'intervention elle-même.', champs: [
      C('issue', 'Objectif atteint ?', 'short', true, 120, 'Ex : zone sécurisée'),
      C('deroulement', 'Déroulement de l\'assaut', 'para', true, 700, 'Compte-rendu…'),
      C('pertes', 'Pertes / blessés', 'para', false, 400, 'De notre côté et en face'),
    ] },
    { key: 'bilan', label: '💰 Bilan & prime', photo: true, intro: 'Situation finale et règlement.', champs: [
      C('situation', 'Situation finale', 'short', true, 120, 'Ex : cible neutralisée, otages libérés'),
      C('bilan', 'Bilan / butin récupéré', 'para', false, 400, 'Ce qui a été obtenu'),
      C('prime', 'Prime encaissée ($)', 'short', true, 80, 'Ex : 3500$'),
    ] },
  ],

  // ─── ❓ Modèle GÉNÉRIQUE par défaut (« Autre » et types inconnus) ───
  _default: [
    { key: 'reperage', label: '🔍 Repérage / Reconnaissance', photo: 'req', intro: 'Observer la situation avant d\'agir.', champs: [
      C('position', 'Lieu / position', 'short', true, 120, 'Où ça se passe'),
      C('effectif', 'Personnes en présence (nombre)', 'short', true, 80, 'Ex : cible + 3 hommes'),
      C('habitudes', 'Habitudes / horaires observés', 'para', false, 500, 'Routines, points faibles…'),
      C('notes', 'Notes de repérage', 'para', false, 500, 'Terrain, accès, dangers…'),
    ] },
    { key: 'plan', label: '🗺️ Plan d\'approche', photo: true, intro: 'Comment on entre, on agit, on se replie.', champs: [
      C('ralliement', 'Point de ralliement', 'short', true, 120, 'Ex : vieux moulin au nord'),
      C('itineraire', 'Itinéraire (approche + repli)', 'para', true, 600, 'Chemin d\'approche, plan B, repli…'),
      C('equipement', 'Équipement / matériel', 'para', false, 400, 'Armes, chevaux, outils…'),
      C('horaire', 'Heure d\'intervention prévue', 'short', false, 80, 'Ex : 22/06 à 21h'),
    ] },
    _equipe('Qui tient quel rôle…'),
    { key: 'execution', label: '🎯 Exécution', photo: 'req', intro: 'L\'action elle-même : ce qui s\'est passé.', champs: [
      C('issue', 'Issue / résultat', 'short', true, 120, 'Ex : objectif atteint'),
      C('deroulement', 'Déroulement de l\'action', 'para', true, 700, 'Compte-rendu de l\'intervention…'),
      C('pertes', 'Pertes / incidents', 'para', false, 400, 'Blessés, imprévus, témoins…'),
    ] },
    { key: 'bilan', label: '💰 Bilan & prime', photo: true, intro: 'Encaissement et bilan final.', champs: [
      C('lieuRemise', 'Lieu de remise', 'short', false, 120, 'Ex : arrière-salle du saloon'),
      C('prime', 'Prime encaissée ($)', 'short', true, 80, 'Ex : 3000$'),
      C('bilan', 'Bilan final / butin', 'para', false, 600, 'Ce qui a été récupéré, répartition…'),
    ] },
  ],
};

// Alias : certains contrats légaux réutilisent un scénario déjà défini
STEP_TEMPLATES['Protection rapprochée']   = STEP_TEMPLATES['Protection'];
STEP_TEMPLATES['Surveillance / Filature'] = STEP_TEMPLATES['Espionnage'];
STEP_TEMPLATES['Chasse de prime']         = STEP_TEMPLATES['Chasseur de primes'];

function _defs(cat) { return STEP_TEMPLATES[cat] || STEP_TEMPLATES._default; }

function genId() { return 'OP-' + Date.now().toString().slice(-6); }
function _find(db, id) { return (db.preparations || []).find(o => o.id === id); }
function _currentIdx(op) {
  const i = (op.etapes || []).findIndex(e => !e.valide);
  return i === -1 ? (op.etapes || []).length : i;
}
function _newEtapes(cat) {
  return _defs(cat).map(s => ({ key: s.key, valide: false, valideePar: null, valideeAt: null, champs: {}, photos: [] }));
}

// ── Vérifie les champs requis + photo d'une étape ──
function _manque(et, def) {
  const out = [];
  for (const c of def.champs) {
    if (c.req && !(et.champs && et.champs[c.id] && String(et.champs[c.id]).trim())) out.push(c.label);
  }
  if (def.photo === 'req' && !(et.photos && et.photos.length)) out.push('au moins une photo');
  return out;
}
function _resumeChamps(et, def) {
  const lines = [];
  for (const c of def.champs) {
    const v = et.champs && et.champs[c.id];
    if (v && String(v).trim()) lines.push(`• **${c.label}** : ${_clip(v, 90)}`);
  }
  return lines.length ? lines.join('\n') : '*Rien de renseigné pour l\'instant.*';
}

// ═══════════════════════════════════════════════════════════════
//  PANNEAU D'ÉTAPES (embed + boutons)
// ═══════════════════════════════════════════════════════════════
function _embedPanel(op) {
  const defs = _defs(op.categorie);
  const total = op.etapes.length;
  const done = op.etapes.filter(e => e.valide).length;
  const bar = '🟩'.repeat(done) + '⬜'.repeat(total - done);
  const cur = _currentIdx(op);
  const termine = op.status === 'termine' || done === total;

  const e = new EmbedBuilder()
    .setColor(termine ? COL.vert : (op.pole === 'legal' ? COL.bleu : COL.rouge))
    .setTitle(`${op.emoji} OPÉRATION — « ${_clip(op.cible, 70)} »`)
    .setDescription([
      '```', ' PRÉPARATION D\'OPÉRATION · IRON WOLF / CONFRÉRIE ', '```',
      `Mission **${op.categorie}** — préparez-la **étape par étape**. Chaque étape se remplit puis se **valide** ; la suivante se déverrouille ensuite. Une fois tout validé, le **dossier d\'opération** est généré.`,
    ].join('\n'))
    .addFields(
      { name: 'Statut', value: termine ? '✅ Préparation terminée' : '🟡 En préparation', inline: true },
      { name: 'Catégorie', value: `${op.emoji} ${op.categorie}`, inline: true },
      { name: 'Contrat lié', value: `\`${op.contratId || '—'}\``, inline: true },
      { name: '💰 Prime / rémunération', value: _clip(op.remuneration || '—', 80), inline: true },
      { name: '⚠️ Risque', value: op.risque ? String(op.risque) : '—', inline: true },
      { name: 'Avancement', value: `${bar}  **${done}/${total}**`, inline: false },
    );

  op.etapes.forEach((et, i) => {
    const def = defs[i] || { label: et.key, champs: [] };
    let icon;
    if (et.valide) icon = '✅';
    else if (i === cur) icon = '⏳';
    else icon = '🔒';
    const ph = (et.photos || []).length;
    let body = _resumeChamps(et, def);
    if (ph) body += `\n📷 **${ph} photo(s)** jointe(s)`;
    if (et.valide) body += `\n*✔️ validée par ${et.valideePar || '—'} le ${_fmtDate(et.valideeAt)}*`;
    else if (i === cur) body += `\n*▶️ étape en cours — à compléter puis valider*`;
    else body += `\n*🔒 verrouillée (valide d\'abord les étapes précédentes)*`;
    e.addFields({ name: `${icon} Étape ${i + 1} · ${def.label}`, value: _clip(body, 1020), inline: false });
  });

  e.setFooter({ text: `Réf. ${op.id} • Préparation d'opération` }).setTimestamp();
  return e;
}

function _boutons(op) {
  const rows = [];
  const idx = _currentIdx(op);
  const termine = op.status === 'termine' || idx >= op.etapes.length;
  if (!termine && op.status !== 'annulee') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`opx_fill::${op.id}::${idx}`).setLabel(`📝 Remplir l'étape ${idx + 1}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`opx_photo::${op.id}::${idx}`).setLabel('📷 Ajouter une photo').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`opx_valid::${op.id}::${idx}`).setLabel(`✅ Valider l'étape ${idx + 1}`).setStyle(ButtonStyle.Success),
    ));
  }
  if (op.status !== 'annulee') {
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`opx_doc::${op.id}`).setLabel(termine ? '📄 Régénérer le dossier' : '📄 Dossier (brouillon)').setStyle(ButtonStyle.Secondary),
    );
    if (termine) row2.addComponents(new ButtonBuilder().setCustomId(`opx_recit::${op.id}`).setLabel('📜 Compte-rendu RP').setStyle(ButtonStyle.Secondary));
    if (!termine) row2.addComponents(new ButtonBuilder().setCustomId(`opx_cancel::${op.id}`).setLabel('🗑️ Annuler l\'opération').setStyle(ButtonStyle.Danger));
    rows.push(row2);
  }
  return rows;
}

async function _refreshPanel(guild, op) {
  try {
    if (!op.channelId || !op.msgId) return;
    const ch = await guild.channels.fetch(op.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(op.msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [_embedPanel(op)], components: _boutons(op) }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  CRÉATION DEPUIS UN CONTRAT VALIDÉ (appelée par index.js → contrats)
// ═══════════════════════════════════════════════════════════════
async function creerOperationDepuisContrat(guild, contrat, opts = {}) {
  if (!guild || !contrat) return null;
  const db = loadDB();
  if (!db.preparations) db.preparations = [];

  // anti-doublon : un contrat = une opération
  const exist = db.preparations.find(o => o.contratId === contrat.id);
  if (exist) return exist;

  const cat = _categorie(contrat.typeMission);
  const op = {
    id: genId(),
    contratId: contrat.id,
    guildId: guild.id,
    categorie: contrat.typeMission || 'Autre',
    emoji: cat.emoji,
    pole: opts.pole || cat.pole,
    cible: contrat.objet || contrat.commanditaire || 'Mission',
    risque: contrat.risque || null,
    remuneration: contrat.remuneration || '—',
    echeance: contrat.echeanceTexte || null,
    details: contrat.details || '',
    status: 'prep',
    etapes: _newEtapes(contrat.typeMission),
    createdAt: new Date().toISOString(),
    createurId: opts.parId || null,
  };

  // mémorise le lien côté contrat (dans la même sauvegarde)
  const c = (db.contrats || []).find(x => x.id === contrat.id);
  if (c) c.operationId = op.id;
  db.preparations.push(op);
  _persist(db);

  // Poste le panneau dans #operations (forum → post / texte → message + fil)
  const opsCh = _salonOps(guild);
  const rid = _poleRoleId(guild, op.pole);
  const payload = {
    content: `${rid ? `<@&${rid}> — ` : ''}${op.emoji} Nouvelle **opération à préparer** : « **${_clip(op.cible, 80)}** » *(${op.categorie})*.\nIssue du contrat \`${op.contratId}\`. Préparez-la **étape par étape** ci-dessous.`,
    embeds: [_embedPanel(op)],
    components: _boutons(op),
    allowedMentions: { roles: rid ? [rid] : [] },
  };
  const coord = `🧭 **Fil de coordination — opération « ${_clip(op.cible, 60)} »**\nPostez ici vos infos, repérages et photos. Pour rattacher une photo à une étape, cliquez « 📷 Ajouter une photo » sur le panneau puis envoyez l'image dans ce fil.`;

  try {
    if (opsCh && opsCh.type === 15 && opsCh.threads?.create) {
      const post = await opsCh.threads.create({ name: `${op.emoji} ${_clip(op.cible, 70)}`.slice(0, 100), message: payload }).catch(() => null);
      if (post) {
        op.channelId = post.id; op.threadId = post.id;
        const starter = await post.fetchStarterMessage().catch(() => null);
        if (starter) { op.msgId = starter.id; await starter.pin().catch(() => {}); }
        await post.send({ content: coord }).catch(() => {});
      }
    } else if (opsCh && typeof opsCh.send === 'function') {
      const sent = await opsCh.send(payload).catch(() => null);
      if (sent) {
        op.channelId = opsCh.id; op.msgId = sent.id;
        await sent.pin().catch(() => {});
        const fil = await sent.startThread({ name: `${op.emoji} ${_clip(op.cible, 70)}`.slice(0, 100), autoArchiveDuration: 10080 }).catch(() => null);
        if (fil) { op.threadId = fil.id; await fil.send({ content: coord }).catch(() => {}); }
      }
    }
  } catch (e) { console.log('⚠️ post opération-étapes:', e.message); }

  _persist(db);
  try { if (typeof _inj.journalHook === 'function') await _inj.journalHook(guild, op); } catch {}
  return op;
}

// ═══════════════════════════════════════════════════════════════
//  DOSSIER D'OPÉRATION (fichier .md + embed récap)
// ═══════════════════════════════════════════════════════════════
function _genererMarkdown(op) {
  const defs = _defs(op.categorie);
  const L = [];
  L.push(`# ${op.emoji} DOSSIER D'OPÉRATION`);
  L.push('');
  L.push(`**Objet / cible :** ${op.cible}`);
  L.push(`**Catégorie :** ${op.emoji} ${op.categorie}`);
  L.push(`**Référence opération :** ${op.id}`);
  L.push(`**Contrat lié :** ${op.contratId || '—'}`);
  L.push(`**Pôle :** ${op.pole === 'legal' ? '⚖️ Iron Wolf Company' : '🔪 La Confrérie'}`);
  if (op.risque) L.push(`**Risque :** ${op.risque}`);
  L.push(`**Prime / rémunération :** ${op.remuneration || '—'}`);
  if (op.echeance) L.push(`**Échéance :** ${op.echeance}`);
  L.push(`**Établi le :** ${_fmtDate(new Date().toISOString())}`);
  L.push('');
  if (op.details) { L.push('> ' + String(op.details).replace(/\n/g, '\n> ')); L.push(''); }
  L.push('---');
  op.etapes.forEach((et, i) => {
    const def = defs[i] || { label: et.key, intro: '', champs: [] };
    L.push('');
    L.push(`## Étape ${i + 1} — ${def.label}`);
    if (def.intro) L.push(`*${def.intro}*`);
    L.push('');
    L.push(`**Statut :** ${et.valide ? `✅ validée par ${et.valideePar || '—'} le ${_fmtDate(et.valideeAt)}` : '⬜ non validée'}`);
    for (const c of def.champs) {
      const v = et.champs && et.champs[c.id];
      if (v && String(v).trim()) L.push(`- **${c.label} :** ${v}`);
    }
    if ((et.photos || []).length) {
      L.push('');
      L.push('**Photos :**');
      et.photos.forEach((p, n) => L.push(`- [Photo ${n + 1}](${p.url || p})`));
    }
  });
  L.push('');
  L.push('---');
  L.push('*Dossier généré automatiquement par le Centre des opérations — Iron Wolf Company.*');
  return L.join('\n');
}

function _embedDossier(op) {
  const defs = _defs(op.categorie);
  const e = new EmbedBuilder()
    .setColor(COL.or)
    .setTitle(`📄 DOSSIER D'OPÉRATION — « ${_clip(op.cible, 70)} »`)
    .setDescription(`${op.emoji} **${op.categorie}** · contrat \`${op.contratId || '—'}\` · réf. \`${op.id}\``)
    .addFields(
      { name: '💰 Prime / rémunération', value: _clip(op.remuneration || '—', 100), inline: true },
      { name: '🗂️ Pôle', value: op.pole === 'legal' ? '⚖️ Iron Wolf' : '🔪 Confrérie', inline: true },
    );
  op.etapes.forEach((et, i) => {
    const def = defs[i] || { label: et.key, champs: [] };
    let body = _resumeChamps(et, def);
    const ph = (et.photos || []).length;
    if (ph) body += `\n📷 ${ph} photo(s)`;
    e.addFields({ name: `${et.valide ? '✅' : '⬜'} Étape ${i + 1} · ${def.label}`, value: _clip(body, 1020), inline: false });
  });
  e.setFooter({ text: `Dossier ${op.id} • Iron Wolf Company` }).setTimestamp();
  return e;
}

async function _posterDossier(guild, op) {
  const md = _genererMarkdown(op);
  const file = new AttachmentBuilder(Buffer.from(md, 'utf8'), { name: `dossier-${op.id}.md` });
  const target = op.threadId || op.channelId;
  const ch = target ? await guild.channels.fetch(target).catch(() => null) : null;
  if (ch && typeof ch.send === 'function') {
    await ch.send({ content: '📄 **Dossier d\'opération** — compilation des étapes validées :', embeds: [_embedDossier(op)], files: [file] }).catch(() => {});
  }
  return file;
}

// ═══════════════════════════════════════════════════════════════
//  PRIME → COFFRE (à l'achèvement, via le hook global de index.js)
// ═══════════════════════════════════════════════════════════════
function _montant(s) { const m = String(s || '').replace(/\s/g, '').match(/(\d[\d.]*)/); return m ? (parseInt(m[1].replace(/\./g, ''), 10) || 0) : 0; }
async function _crediterPrime(guild, op) {
  try {
    if (op.primeVerseeCoffre) return;
    const defs = _defs(op.categorie);
    const bilan = op.etapes[op.etapes.length - 1];
    const bdef = defs[defs.length - 1] || { champs: [] };
    // Champ « montant » du bilan selon le scénario : prime / paiement / commission / montant
    let raw = null;
    for (const id of ['prime', 'paiement', 'commission', 'montant']) {
      if (bilan?.champs?.[id]) { raw = bilan.champs[id]; break; }
    }
    if (raw == null) for (const c of bdef.champs) { const v = bilan?.champs?.[c.id]; if (v && /(\$|prime|paiement|commission|montant)/i.test(c.label + ' ' + v)) { raw = v; break; } }
    const montant = _montant(raw);
    if (!montant) return;
    if (typeof global.crediterCoffrePrime !== 'function') return;
    const solde = await global.crediterCoffrePrime({
      guild, montant, pole: op.pole,
      objet: `Opération ${op.id} — ${op.categorie} (${_clip(op.cible, 60)})`,
      responsable: 'Opération', responsableId: op.createurId || null,
    });
    const d2 = loadDB(); const o2 = _find(d2, op.id); if (o2) { o2.primeVerseeCoffre = montant; _persist(d2); }
    op.primeVerseeCoffre = montant;
    const ch = await guild.channels.fetch(op.threadId || op.channelId).catch(() => null);
    if (ch?.send) await ch.send({ content: `💰 **Prime versée au coffre** : +$${montant.toLocaleString('fr-FR')}${solde != null ? ` · nouveau solde : **$${solde.toLocaleString('fr-FR')}**` : ''}.`, allowedMentions: { parse: [] } }).catch(() => {});
  } catch (e) { console.log('⚠️ crédit prime opération:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
//  COMPTE-RENDU RP (IA) — généré à partir des étapes validées
// ═══════════════════════════════════════════════════════════════
async function _recitRP(op) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const defs = _defs(op.categorie);
  const faits = [];
  op.etapes.forEach((et, i) => {
    const def = defs[i]; if (!def) return;
    const parts = [];
    for (const c of def.champs) { const v = et.champs && et.champs[c.id]; if (v && String(v).trim()) parts.push(`${c.label} : ${v}`); }
    if ((et.photos || []).length) parts.push(`${et.photos.length} photo(s)`);
    if (parts.length) faits.push(`• ${def.label} — ${parts.join(' ; ')}`);
  });
  const contenu = [
    `Type de mission : ${op.categorie}`,
    `Objet / cible : ${op.cible}`,
    op.remuneration ? `Prime : ${op.remuneration}` : null,
    '', 'Déroulé (étapes) :', ...faits,
  ].filter(Boolean).join('\n');
  const prompt = `Tu es le chroniqueur de la Iron Wolf Company et de La Confrérie, dans l'Ouest américain de 1899. À partir des FAITS ci-dessous, rédige un COMPTE-RENDU d'opération immersif, à la troisième personne, en français, d'un ton western sobre et crédible (sans fioritures excessives). 1 à 3 courts paragraphes. Reste FIDÈLE aux faits, n'invente aucun détail majeur. Ne mets ni titre, ni listes, ni guillemets : seulement un texte suivi.\n\nFAITS :\n${contenu}`;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 900, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!resp.ok) { const b = await resp.text().catch(() => ''); console.log(`❌ récit op HTTP ${resp.status}: ${b.slice(0, 200)}`); return null; }
    const data = await resp.json();
    const txt = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return txt || null;
  } catch (e) { console.log('❌ récit op exception:', e.message); return null; }
}
async function _genererEtPosterRecit(guild, op) {
  try {
    const recit = await _recitRP(op);
    if (!recit) return;
    const d2 = loadDB(); const o2 = _find(d2, op.id); if (o2) { o2.recit = recit; _persist(d2); }
    const ch = await guild.channels.fetch(op.threadId || op.channelId).catch(() => null);
    if (ch?.send) {
      const e = new EmbedBuilder().setColor(COL.or)
        .setTitle(`📜 Compte-rendu d'opération — « ${_clip(op.cible, 60)} »`)
        .setDescription(recit.slice(0, 4000))
        .setFooter({ text: `Récit RP rédigé par l'IA d'après les étapes · ${op.id}` });
      await ch.send({ embeds: [e], allowedMentions: { parse: [] } }).catch(() => {});
    }
  } catch (e) { console.log('⚠️ récit op:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
//  TABLEAU DE SUIVI DES OPÉRATIONS (toutes les préparations)
// ═══════════════════════════════════════════════════════════════
function tableauEmbed() {
  const db = loadDB();
  const preps = (db.preparations || []).filter(o => o.status !== 'annulee');
  const e = new EmbedBuilder().setColor(COL.or).setTitle('🗂️ SUIVI DES OPÉRATIONS').setTimestamp();
  if (!preps.length) { e.setDescription('*Aucune opération en préparation pour l\'instant.*'); return e; }
  preps.sort((a, b) => (a.status === 'termine' ? 1 : 0) - (b.status === 'termine' ? 1 : 0));
  const lignes = preps.slice(0, 25).map(op => {
    const total = (op.etapes || []).length;
    const done = (op.etapes || []).filter(x => x.valide).length;
    const bar = '🟩'.repeat(done) + '⬜'.repeat(Math.max(0, total - done));
    const st = op.status === 'termine' ? '✅ Terminée' : '🟡 En préparation';
    const prime = op.primeVerseeCoffre ? ` · 💰 +$${Number(op.primeVerseeCoffre).toLocaleString('fr-FR')}` : '';
    return `${op.emoji || '🎯'} **${_clip(op.cible, 48)}** — *${op.categorie}*\n${bar} ${done}/${total} · ${st} · contrat \`${op.contratId || '—'}\`${prime}`;
  });
  e.setDescription(lignes.join('\n\n').slice(0, 4000));
  e.setFooter({ text: `${preps.length} opération(s) · /op suivi` });
  return e;
}

// ═══════════════════════════════════════════════════════════════
//  ROUTEUR D'INTERACTIONS  (préfixe opx_ )
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('opx_')) return false;

    // ── Remplir une étape → formulaire ──
    if (interaction.isButton?.() && cid.startsWith('opx_fill::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (idx !== _currentIdx(op)) { await interaction.reply({ content: '⛔ Cette étape n\'est pas l\'étape en cours.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const def = _defs(op.categorie)[idx];
      const et = op.etapes[idx];
      const modal = new ModalBuilder().setCustomId(`opx_fillm::${id}::${idx}`).setTitle(_clip(`Étape ${idx + 1} · ${def.label.replace(/^[^ ]+ /, '')}`, 45));
      for (const c of def.champs) {
        const ti = new TextInputBuilder().setCustomId(c.id).setLabel(_clip(c.label, 45))
          .setStyle(c.type === 'para' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(!!c.req).setMaxLength(c.max || 300).setPlaceholder(_clip(c.ph || '', 100));
        const cur = et.champs && et.champs[c.id];
        if (cur) ti.setValue(_clip(String(cur), c.max || 300));
        modal.addComponents(new ActionRowBuilder().addComponents(ti));
      }
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    // ── Soumission du formulaire ──
    if (interaction.isModalSubmit?.() && cid.startsWith('opx_fillm::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const def = _defs(op.categorie)[idx];
      const et = op.etapes[idx];
      if (!et.champs) et.champs = {};
      for (const c of def.champs) {
        const v = (interaction.fields.getTextInputValue(c.id) || '').trim();
        if (v) et.champs[c.id] = v; else delete et.champs[c.id];
      }
      _persist(db);
      await interaction.reply({ content: `✅ Étape **${idx + 1}** mise à jour.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      await _refreshPanel(interaction.guild, op);
      return true;
    }

    // ── Ajouter une / des photo(s) → collecte dans le fil ──
    if (interaction.isButton?.() && cid.startsWith('opx_photo::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (idx !== _currentIdx(op)) { await interaction.reply({ content: '⛔ Cette étape n\'est pas l\'étape en cours.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const ch = interaction.channel;
      if (!ch || typeof ch.createMessageCollector !== 'function') { await interaction.reply({ content: '❌ Impossible de collecter une photo ici (utilise le fil de l\'opération).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.reply({ content: `📷 **Envoie ta/tes photo(s) dans ce fil dans les 2 minutes** (étape ${idx + 1}). Je les rattacherai automatiquement.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      const userId = interaction.user.id;
      const isImg = (a) => ((a.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || ''));
      const collector = ch.createMessageCollector({
        filter: (m) => m.author.id === userId && m.attachments.some(isImg),
        time: 120000, max: 6,
      });
      collector.on('collect', async (m) => {
        const imgs = [...m.attachments.values()].filter(isImg).map(a => ({ url: a.url, name: a.name || 'photo' }));
        if (!imgs.length) return;
        const db2 = loadDB();
        const op2 = _find(db2, id);
        if (!op2) return;
        if (!op2.etapes[idx].photos) op2.etapes[idx].photos = [];
        op2.etapes[idx].photos.push(...imgs);
        _persist(db2);
        await m.react('✅').catch(() => {});
        await _refreshPanel(interaction.guild, op2);
      });
      collector.on('end', (collected) => {
        if (collected.size === 0) interaction.followUp({ content: '⏳ Aucune photo reçue (délai écoulé).', flags: MessageFlags.Ephemeral }).catch(() => {});
      });
      return true;
    }

    // ── Valider une étape (Direction) ──
    if (interaction.isButton?.() && cid.startsWith('opx_valid::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Seule la Direction peut valider une étape.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (idx !== _currentIdx(op)) { await interaction.reply({ content: '⛔ Étape déjà validée ou verrouillée.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const def = _defs(op.categorie)[idx];
      const et = op.etapes[idx];
      const manque = _manque(et, def);
      if (manque.length) { await interaction.reply({ content: `⛔ Impossible de valider l'étape ${idx + 1} — il manque :\n• ${manque.join('\n• ')}`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      et.valide = true;
      et.valideePar = interaction.member?.displayName || interaction.user.username;
      et.valideeAt = new Date().toISOString();
      const fini = _currentIdx(op) >= op.etapes.length;
      if (fini) op.status = 'termine';
      _persist(db);
      await interaction.reply({ content: fini ? `✅ Étape ${idx + 1} validée. **Toutes les étapes sont validées** — je génère le dossier.` : `✅ Étape ${idx + 1} validée. L'étape ${idx + 2} est déverrouillée.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      await _refreshPanel(interaction.guild, op);
      if (fini) {
        op.dossierGenere = true; _persist(db);
        await _posterDossier(interaction.guild, op).catch(() => {});
        await _crediterPrime(interaction.guild, op).catch(() => {});       // 💰 prime → coffre
        await _genererEtPosterRecit(interaction.guild, op).catch(() => {}); // 📜 compte-rendu RP
      }
      return true;
    }

    // ── (Re)générer le compte-rendu RP ──
    if (interaction.isButton?.() && cid.startsWith('opx_recit::')) {
      const id = cid.split('::')[1];
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await _genererEtPosterRecit(interaction.guild, op).catch(() => {});
      await interaction.editReply({ content: '📜 Compte-rendu RP généré dans le fil.' }).catch(() => {});
      return true;
    }

    // ── Générer / régénérer le dossier ──
    if (interaction.isButton?.() && cid.startsWith('opx_doc::')) {
      const id = cid.split('::')[1];
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await _posterDossier(interaction.guild, op).catch(() => {});
      await interaction.editReply({ content: '📄 Dossier généré dans le fil.' }).catch(() => {});
      return true;
    }

    // ── Annuler l'opération (Direction) ──
    if (interaction.isButton?.() && cid.startsWith('opx_cancel::')) {
      const id = cid.split('::')[1];
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      op.status = 'annulee';
      _persist(db);
      await interaction.reply({ content: `🗑️ Opération **${op.id}** annulée.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      await _refreshPanel(interaction.guild, op);
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ operations-etapes routeInteraction error:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { init, routeInteraction, creerOperationDepuisContrat, tableauEmbed, STEP_TEMPLATES };
