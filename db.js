// ═══════════════════════════════════════════════════════════════
// db.js — Couche d'abstraction base de données
// Cache en mémoire + persistance JSON + sauvegarde GitHub auto
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const DB_PATH = './data.json';

const DEFAULT_DB = {
  members: {}, operations: [], sessions: [],
  candidatures: [], contrats: [], sentReminders: {},
  dashboardMsgId: null, reglementMsgId: null, recrutementMsgId: null,
  coffres: { legal: 0, illegal: 0 },
  fichesCompleteesNotifiees: [],
  anniversairesEnvoyes: {},
  rappelsFiches: {},
  sessionReminders: {},
  alertesEnvoyees: {},
  alertesInactivite: {},
};

// ── Cache en mémoire (évite les lectures disque répétées) ──
let _cache = null;
let _saveTimeout = null;

// ── Deep-merge : conserve les clés par défaut manquantes même imbriquées ──
function isPlainObject(v) { return v && typeof v === 'object' && !Array.isArray(v); }
function deepMerge(base, over) {
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(over || {})) {
    if (isPlainObject(base?.[k]) && isPlainObject(over[k])) out[k] = deepMerge(base[k], over[k]);
    else out[k] = over[k];
  }
  return out;
}

function loadDB() {
  if (_cache) return _cache;
  try {
    if (!fs.existsSync(DB_PATH)) {
      _cache = JSON.parse(JSON.stringify(DEFAULT_DB));
      fs.writeFileSync(DB_PATH, JSON.stringify(_cache, null, 2));
      return _cache;
    }
    const raw = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    // Fusion PROFONDE avec les defaults (récupère les clés imbriquées manquantes)
    _cache = deepMerge(JSON.parse(JSON.stringify(DEFAULT_DB)), raw);
    return _cache;
  } catch (e) {
    console.log('❌ loadDB error:', e.message);
    _cache = JSON.parse(JSON.stringify(DEFAULT_DB));
    return _cache;
  }
}

// Écriture différée (debounce 500ms) pour éviter les écritures en rafale
function saveDB(data) {
  _cache = data;
  if (_saveTimeout) clearTimeout(_saveTimeout);
  _saveTimeout = setTimeout(() => {
    try {
      fs.writeFileSync(DB_PATH, JSON.stringify(_cache, null, 2));
    } catch (e) {
      console.log('❌ saveDB error:', e.message);
    }
  }, 500);
}

// Sauvegarde forcée immédiate (utilisée avant shutdown ou backup GitHub)
function saveDBSync() {
  if (!_cache) return;
  if (_saveTimeout) { clearTimeout(_saveTimeout); _saveTimeout = null; }
  try { fs.writeFileSync(DB_PATH, JSON.stringify(_cache, null, 2)); }
  catch (e) { console.log('❌ saveDBSync error:', e.message); }
}

// Invalide le cache (utile après une mise à jour externe)
function invalidateCache() { _cache = null; }

// ── Sauvegarde automatique vers GitHub ──
// Sauvegarde data.json dans un Gist GitHub toutes les heures
async function sauvegarderSurGitHub() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_GIST_ID) return;
  try {
    // On flush d'abord le cache en attente pour ne jamais sauvegarder de données périmées
    saveDBSync();
    const contenu = _cache
      ? JSON.stringify(_cache, null, 2)
      : (fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH, 'utf8') : '{}');
    await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, {
      method: 'PATCH',
      headers: {
        'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        files: {
          'iwc-data.json': { content: contenu }
        }
      }),
    });
    console.log(`✅ Sauvegarde GitHub effectuée — ${new Date().toLocaleString('fr-FR')}`);
  } catch (e) {
    console.log('❌ Sauvegarde GitHub error:', e.message);
  }
}

// ── Restauration depuis GitHub au démarrage ──
async function restaurerDepuisGitHub() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_GIST_ID) return false;
  // Ne restaure que si data.json est absent, vide, ou sans données membres
  if (fs.existsSync(DB_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const hasData = Object.keys(existing.members || {}).length > 0 ||
                      (existing.candidatures || []).length > 0 ||
                      (existing.contrats || []).length > 0 ||
                      (existing.coffres?.legal || 0) > 0 ||
                      (existing.coffres?.illegal || 0) > 0;
      if (hasData) return false; // Des données existent déjà → pas besoin de restaurer
    } catch { } // JSON invalide → on restaure
  }
  try {
    const res = await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, {
      headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    const gist = await res.json();
    const contenu = gist.files?.['iwc-data.json']?.content;
    if (!contenu) return false;
    fs.writeFileSync(DB_PATH, contenu);
    _cache = null; // Invalide le cache pour forcer la relecture
    console.log('✅ Données restaurées depuis GitHub Gist');
    return true;
  } catch (e) {
    console.log('❌ Restauration GitHub error:', e.message);
    return false;
  }
}

module.exports = { loadDB, saveDB, saveDBSync, invalidateCache, sauvegarderSurGitHub, restaurerDepuisGitHub };

