// ═══════════════════════════════════════════════════════════════
// config.js — IWC Bot
// Toutes les constantes centralisées : IDs, mappings, seuils
// Modifier ici = appliqué partout automatiquement
// ═══════════════════════════════════════════════════════════════

// ── Membres IC → Discord ID ──
const MEMBRES_DISCORD_MAP = {
  'Colt Kane':      '696325126047662081',
  'June McCall':    '998581854791798835',
  'Cyrus Hollow':   '324627678143578112',
  'Jonas Caverly':  '944208797084311583',
  'Thomas Galagan': '982201491773354035',
};

// Inverse : Discord ID → Nom IC
const DISCORD_TO_IC = Object.fromEntries(
  Object.entries(MEMBRES_DISCORD_MAP).map(([n, id]) => [id, n])
);

// ── IDs des salons Discord ──
const CH = {
  RECRUTEMENT:          '1508756414779232277',
  RECRUTEMENT_INT_LEGAL:'1509254315712188438',
  RECRUTEMENT_INT_ILLEG:'1508756516830842960',
  DOSSIER_LEGAL:        '1509254295717941278',
  DOSSIER_ILLEG:        '1509252295127466096',
  CONTRATS:             '1508756442730074222',
  FIL_CONTRATS_SIGNE:   '1509340729808388208',
  FIL_CONTRATS_REFUSE:  '1509340853808664627',
  LOGS:                 '1509337860724228137',
};

// ── IDs des rôles Discord ──
const ROLE_POLE_LEGAL   = '1508756436082102303';
const ROLE_POLE_ILLEGAL = '1508756479274913903';
const ROLE_ABSENT       = '1510636619873517648';
const CONTRAT_ROLES     = ['1508289999035039875', '1508290320763195482', '1508292278953836655'];
const JUNE_MCCALL_ID    = '998581854791798835';

// ── Participants map (noms IC + rôles pôle) ──
const PARTICIPANTS_MAP = {
  'Thomas Galagan': '982201491773354035',
  'Jonas Caverly':  '944208797084311583',
  'Cyrus Hollow':   '324627678143578112',
  'June McCall':    '998581854791798835',
  'Colt Kane':      '696325126047662081',
  'Pôle Légal':     `<@&${ROLE_POLE_LEGAL}>`,
  'Pôle Illégal':   `<@&${ROLE_POLE_ILLEGAL}>`,
};

// ── Version Notion API ──
const NOTION_VERSION = '2022-06-28';

// ── Seuils trésorerie (overridables via .env) ──
const LIMITE_SORTIE_LEGAL   = process.env.LIMITE_SORTIE_LEGAL   ? parseInt(process.env.LIMITE_SORTIE_LEGAL)   : 5000;
const LIMITE_SORTIE_ILLEGAL = process.env.LIMITE_SORTIE_ILLEGAL ? parseInt(process.env.LIMITE_SORTIE_ILLEGAL) : 3000;
const SEUIL_COFFRE_LEGAL    = process.env.SEUIL_COFFRE_LEGAL    ? parseInt(process.env.SEUIL_COFFRE_LEGAL)    : 1000;
const SEUIL_COFFRE_ILLEGAL  = process.env.SEUIL_COFFRE_ILLEGAL  ? parseInt(process.env.SEUIL_COFFRE_ILLEGAL)  : 500;

// ── IDs Notion (fallback si .env absent) ──
const NOTION_RECRUTEMENT_DB = process.env.NOTION_RECRUTEMENT_DB || '36ef4436a86c81de9f1acf55c5ad4076';
const NOTION_MEMBRES_DB_ID  = process.env.NOTION_MEMBRES_DB     || '36ef4436a86c818d99a4dd875efec4e3';

// ── IDs des salons Discord (évite les ambiguïtés de recherche par nom) ──
// Remplis ces IDs depuis Discord : clic droit sur le salon → Copier l'identifiant
const SALON_IDS = {
  // Légal
  AGENDA:              '1509638226132996178', // #-agenda
  PLANNING:            '1509719218654941315', // #planning (le bon, pas le vide)
  COFFRE_ENTREPRISE:   '1509719218654941315', // #coffre-entreprise
  HIERARCHIE_LEGAL:    '1508756453354373202', // #hierarchie-iron-wolf-company
  CONTRATS:            '1508756439206985809', // #contrats
  HISTOIRE_IWC:        '1508756442730074222', // #histoire-iwc
  ABSENCES:            '1508756459444502661', // #absences
  AFFAIRES:            '1509718164760563743', // #affaires
  INFORMATEURS:        '1508756508362674337', // #informateurs
  PLANS:               '1509255294184853524', // #plans
  FICHES_PERSONNAGES:  '1508756493845925960', // #fiches-personnages
  SURNOM_PSEUDO:       '1508756528277225512', // #surnom-pseudo
  GRADE:               '1508915628315115581', // #grade (légal)
  PATCH_NOTE:          '1508788467008667819', // #patch-note

  // Direction
  LOGS:                '1509695000441786608', // #logs
  DOSSIER_RECRUTEMENT: '1509337860724228137', // #dossier-recrutement
  RECRUTEMENT_INTERNE: '1509254295717941278', // #recrutement-interne
  DASHBOARD:           '1509252295127466096', // salon dashboard

  // Illégal
  COFFRE_ILLEGAL:      '1508756516830842960', // #coffre-illegal
  GRADE_ILLEGAL:       '1509254315712188438', // #grade (illégal)
  HIERARCHIE_OMBRE:    '1508756490432024636', // #hierarchie-ombre
  AGENDA_ILLEGAL:      '1508788467008667819', // #agenda-illégal
  OPERATIONS:          '1508756483246919690', // #operations
};

// ── Détection du pôle d'un membre depuis ses rôles Discord ──
function _getPole(member) {
  if (!member) return 'both';
  const roles = member.roles?.cache;
  if (!roles) return 'both';
  const illegalRoleNames = ['Concepteur', 'Fléau', 'Exécuteur', 'Condamné', 'Maudit', 'Confrérie', 'Ombre'];
  const legalRoleNames   = ['Conseil', 'Directeur', 'Officier', 'Agent', 'Opérateur', 'Recrue', 'Iron Wolf', 'Fondateur'];
  const hasIllegal = roles.some(r => illegalRoleNames.some(n => r.name.includes(n)));
  const hasLegal   = roles.some(r => legalRoleNames.some(n => r.name.includes(n)));
  if (hasIllegal && !hasLegal) return 'illegal';
  if (hasLegal   && !hasIllegal) return 'legal';
  return 'both';
}

module.exports = {
  MEMBRES_DISCORD_MAP, DISCORD_TO_IC,
  CH, PARTICIPANTS_MAP,
  ROLE_POLE_LEGAL, ROLE_POLE_ILLEGAL,
  CONTRAT_ROLES, JUNE_MCCALL_ID, ROLE_ABSENT, SALON_IDS,
  NOTION_VERSION,
  LIMITE_SORTIE_LEGAL, LIMITE_SORTIE_ILLEGAL,
  SEUIL_COFFRE_LEGAL, SEUIL_COFFRE_ILLEGAL,
  NOTION_RECRUTEMENT_DB, NOTION_MEMBRES_DB_ID,
  _getPole,
};

