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
  AGENDA:              '', // #-agenda
  PLANNING:            '', // #planning (le bon, pas le vide)
  COFFRE_ENTREPRISE:   '', // #coffre-entreprise
  HIERARCHIE_LEGAL:    '', // #hierarchie-iron-wolf-company
  CONTRATS:            '', // #contrats
  HISTOIRE_IWC:        '', // #histoire-iwc
  ABSENCES:            '', // #absences
  AFFAIRES:            '', // #affaires
  INFORMATEURS:        '', // #informateurs
  PLANS:               '', // #plans
  FICHES_PERSONNAGES:  '', // #fiches-personnages
  SURNOM_PSEUDO:       '', // #surnom-pseudo
  GRADE:               '', // #grade (légal)
  PATCH_NOTE:          '', // #patch-note

  // Direction
  LOGS:                '', // #logs
  DOSSIER_RECRUTEMENT: '', // #dossier-recrutement
  RECRUTEMENT_INTERNE: '', // #recrutement-interne
  DASHBOARD:           '', // salon dashboard

  // Illégal
  COFFRE_ILLEGAL:      '', // #coffre-illegal
  GRADE_ILLEGAL:       '', // #grade (illégal)
  HIERARCHIE_OMBRE:    '', // #hierarchie-ombre
  AGENDA_ILLEGAL:      '', // #agenda-illégal
  OPERATIONS:          '', // #operations
};

module.exports = {
  MEMBRES_DISCORD_MAP, DISCORD_TO_IC,
  CH, PARTICIPANTS_MAP,
  ROLE_POLE_LEGAL, ROLE_POLE_ILLEGAL,
  CONTRAT_ROLES, JUNE_MCCALL_ID, ROLE_ABSENT, SALON_IDS,
  NOTION_VERSION,
  LIMITE_SORTIE_LEGAL, LIMITE_SORTIE_ILLEGAL,
  SEUIL_COFFRE_LEGAL, SEUIL_COFFRE_ILLEGAL,
  NOTION_RECRUTEMENT_DB, NOTION_MEMBRES_DB_ID,
};

