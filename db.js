// ═══════════════════════════════════════════════════════════════
// db.js — Couche d'abstraction base de données
// Cache en mémoire + persistance JSON + sauvegarde GitHub auto
// ═══════════════════════════════════════════════════════════════

const fs = require('fs');
const DB_PATH = './data.json';

// Synchro site web (Supabase) — best-effort, no-op sans variables d'env.
// Requis ici pour pousser les changements en quasi temps réel après chaque écriture.
let _supabaseSync = null;
try { _supabaseSync = require('./supabase-sync'); } catch {}

const DEFAULT_DB = {
  members: {
    "696325126047662081": { "id": "696325126047662081", "name": "Colt Kane",      "status": "actif", "rang": "Le Conseil — Directeur", "pole": "legal",   "joinedAt": "2026-05-01T00:00:00.000Z", "lastActivity": "2026-05-31T00:00:00.000Z" },
    "998581854791798835": { "id": "998581854791798835", "name": "June McCall",    "status": "actif", "rang": "Officier de Terrain",    "pole": "legal",   "joinedAt": "2026-05-01T00:00:00.000Z", "lastActivity": "2026-05-31T00:00:00.000Z" },
    "324627678143578112": { "id": "324627678143578112", "name": "Cyrus Hollow",   "status": "actif", "rang": "Le Concepteur",           "pole": "illegal", "joinedAt": "2026-05-01T00:00:00.000Z", "lastActivity": "2026-05-31T00:00:00.000Z" },
    "944208797084311583": { "id": "944208797084311583", "name": "Jonas Caverly",  "status": "actif", "rang": "Le Fléau",                "pole": "illegal", "joinedAt": "2026-05-01T00:00:00.000Z", "lastActivity": "2026-05-31T00:00:00.000Z" },
    "982201491773354035": { "id": "982201491773354035", "name": "Thomas Galagan", "status": "actif", "rang": "Officier de Terrain",    "pole": "legal",   "joinedAt": "2026-05-01T00:00:00.000Z", "lastActivity": "2026-05-31T00:00:00.000Z" },
  },
  operations: [], sessions: [],
  candidatures: [], contrats: [], sentReminders: {},
  dashboardMsgId: null, reglementMsgId: null, recrutementMsgId: null,
  coffres: { legal: 0, illegal: 0 },
  coffre: 0, // 🏦 coffre commun unique (remplace legal/illegal — démarre à 0)
  fichesCompleteesNotifiees: [],
  anniversairesEnvoyes: {},
  rappelsFiches: {},
  sessionReminders: {},
  alertesEnvoyees: {},
  alertesInactivite: {},
  affaires: [],
  informateurs: [],
  tresorButtonMsgId: null,
  hierarchieMsgId: null,
  affairesPanelMsgId: null,
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
    // Fusion PROFONDE avec les defaults — les membres fondateurs sont toujours présents
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
  // Sauvegarde cloud rapide après tout changement → survit à un redémarrage
  // (conteneur Render éphémère). Debounce ~12s : regroupe les rafales d'écritures.
  scheduleCloudBackup();
  // Synchro site web (Supabase) en quasi temps réel — debounce interne ~15s.
  try { _supabaseSync?.scheduleSync?.(data); } catch {}
}

// ── Sauvegarde cloud rapide (debounce) déclenchée après chaque changement ──
// Garantit que les données (pépites, coffre, etc.) sont sur le Gist en ~12s,
// au lieu d'attendre le cron de 5 min — fenêtre de perte réduite à quelques secondes.
let _cloudTimeout = null;
function scheduleCloudBackup(delay = 12000) {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_GIST_ID) return;
  if (_cloudTimeout) clearTimeout(_cloudTimeout);
  _cloudTimeout = setTimeout(() => {
    _cloudTimeout = null;
    sauvegarderSurGitHub().catch(() => {});
  }, delay);
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

// ── Sauvegarde automatique vers GitHub (vérifiée, avec reprises + instantané quotidien) ──
let _lastPurgeDate = null;
// Coalescing des sauvegardes Gist : pas d'écritures simultanées + saut si contenu identique
let _saving = false, _redo = false, _waiters = [];
let _lastPushedContent = null, _lastBackupDay = null;

// Garde les 7 instantanés les plus récents, supprime les plus vieux (au plus 1×/jour)
async function _purgerVieuxInstantanes() {
  const today = new Date().toISOString().slice(0, 10);
  if (_lastPurgeDate === today) return;
  _lastPurgeDate = today;
  try {
    const res = await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } });
    if (!res.ok) return;
    const gist = await res.json();
    const noms = Object.keys(gist.files || {}).filter(n => /^backup-\d{4}-\d{2}-\d{2}\.json$/.test(n)).sort();
    if (noms.length <= 7) return;
    const aSupprimer = noms.slice(0, noms.length - 7);
    const files = {}; for (const n of aSupprimer) files[n] = null; // null = supprime le fichier du gist
    await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, { method: 'PATCH', headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ files }) });
    console.log(`🧹 Anciens instantanés supprimés : ${aSupprimer.length}`);
  } catch {}
}

async function _doSauvegardeGitHub() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_GIST_ID) return false;
  try {
    saveDBSync();
    const contenu = _cache
      ? JSON.stringify(_cache, null, 2)
      : (fs.existsSync(DB_PATH) ? fs.readFileSync(DB_PATH, 'utf8') : '{}');

    // ── Garde-fou anti-écrasement : ne JAMAIS remplacer la sauvegarde par des données vides/corrompues ──
    try {
      const d = JSON.parse(contenu);
      // Présence de données « réelles » : plus de membres que les fondateurs par défaut
      // (ceux-ci sont TOUJOURS réinjectés par deepMerge, donc leur seule présence ne prouve rien),
      // OU au moins une collection / un coffre non vide — coffre COMMUN inclus.
      const nbMembres = (d.members && typeof d.members === 'object') ? Object.keys(d.members).length : 0;
      const aDuContenu =
        nbMembres > Object.keys(DEFAULT_DB.members).length ||
        (d.candidatures || []).length || (d.contrats || []).length || (d.operations || []).length ||
        (d.preparations || []).length || Object.keys(d.conversations || {}).length ||
        (d.affaires || []).length || (d.informateurs || []).length ||
        (d.coffre || 0) || (d.coffres?.legal || 0) || (d.coffres?.illegal || 0) ||
        (d.pepites?.total || 0) || (d.pepites?.log || []).length;
      if (!aDuContenu) { console.log('⚠️ Sauvegarde GitHub ANNULÉE : données vides/suspectes (protection anti-écrasement)'); return false; }
    } catch { console.log('⚠️ Sauvegarde GitHub ANNULÉE : JSON invalide'); return false; }

    // Fichier principal + un instantané daté du jour (pour revenir en arrière)
    const jour = new Date().toISOString().slice(0, 10);
    if (contenu === _lastPushedContent && jour === _lastBackupDay) return true; // déjà sauvegardé à l'identique → on évite un appel GitHub inutile
    const files = { 'iwc-data.json': { content: contenu }, [`backup-${jour}.json`]: { content: contenu } };

    // Envoi avec vérification réelle du statut + 2 reprises en cas d'échec
    let ok = false, lastErr = '';
    for (let essai = 1; essai <= 3 && !ok; essai++) {
      try {
        const res = await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, {
          method: 'PATCH',
          headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ files }),
        });
        if (res.ok) ok = true;
        else { lastErr = `HTTP ${res.status}`; await new Promise(r => setTimeout(r, 800 * essai)); }
      } catch (e) { lastErr = e.message; await new Promise(r => setTimeout(r, 800 * essai)); }
    }
    if (ok) {
      _lastPushedContent = contenu; _lastBackupDay = jour;
      console.log(`✅ Sauvegarde GitHub OK (+ instantané ${jour}) — ${new Date().toLocaleString('fr-FR')}`);
      _purgerVieuxInstantanes().catch(() => {});
      return true;
    }
    console.log(`❌ Sauvegarde GitHub ÉCHOUÉE après 3 essais : ${lastErr}`);
    return false;
  } catch (e) {
    console.log('❌ Sauvegarde GitHub error:', e.message);
    return false;
  }
}

// Coalescing : si une sauvegarde est déjà en cours, on n'en lance pas une 2e en parallèle ;
// on note qu'il faudra refaire un tour à la fin pour capturer les derniers changements.
// → jamais de perte de données, juste moins d'appels GitHub simultanés.
async function sauvegarderSurGitHub() {
  if (_saving) { _redo = true; return new Promise(res => _waiters.push(res)); }
  _saving = true;
  let result = false;
  try {
    do { _redo = false; result = await _doSauvegardeGitHub(); } while (_redo);
  } finally {
    _saving = false;
    const w = _waiters; _waiters = [];
    w.forEach(r => { try { r(result); } catch {} });
  }
  return result;
}

// ── Restauration depuis GitHub au démarrage ──
async function restaurerDepuisGitHub() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_GIST_ID) return false;
  // Ne restaure que si data.json est absent ou sans données réelles
  if (fs.existsSync(DB_PATH)) {
    try {
      const existing = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
      const nbMembres = (existing.members && typeof existing.members === 'object') ? Object.keys(existing.members).length : 0;
      const hasData = (existing.candidatures || []).length > 0 ||
                      (existing.contrats || []).length > 0 ||
                      (existing.operations || []).length > 0 ||
                      (existing.affaires || []).length > 0 ||
                      (existing.informateurs || []).length > 0 ||
                      (existing.coffre || 0) > 0 ||
                      (existing.coffres?.legal || 0) > 0 ||
                      (existing.coffres?.illegal || 0) > 0 ||
                      (existing.pepites?.total || 0) > 0 ||
                      nbMembres > Object.keys(DEFAULT_DB.members).length;
      if (hasData) return false; // Des données réelles existent → pas besoin de restaurer
    } catch {}
  }
  try {
    const res = await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, {
      headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` }
    });
    const gist = await res.json();
    const contenu = gist.files?.['iwc-data.json']?.content;
    if (!contenu) return false;
    // Merger le Gist avec les membres fondateurs pour ne jamais les perdre
    const gistData = JSON.parse(contenu);
    const merged = deepMerge(JSON.parse(JSON.stringify(DEFAULT_DB)), gistData);
    fs.writeFileSync(DB_PATH, JSON.stringify(merged, null, 2));
    _cache = null;
    console.log('✅ Données restaurées depuis GitHub Gist');
    return true;
  } catch (e) {
    console.log('❌ Restauration GitHub error:', e.message);
    return false;
  }
}

// ── Charge TOUS les instantanés du Gist (iwc-data.json + backup-AAAA-MM-JJ.json) ──
// Sert à récupérer des données perdues (ex : rapports/avis effacés) depuis une
// sauvegarde plus ancienne. Renvoie [{nom, data}] trié du plus récent au plus ancien.
async function chargerTousSnapshots() {
  if (!process.env.GITHUB_TOKEN || !process.env.GITHUB_GIST_ID) return [];
  try {
    const res = await fetch(`https://api.github.com/gists/${process.env.GITHUB_GIST_ID}`, { headers: { 'Authorization': `Bearer ${process.env.GITHUB_TOKEN}` } });
    if (!res.ok) return [];
    const gist = await res.json();
    const out = [];
    for (const [nom, f] of Object.entries(gist.files || {})) {
      if (!/\.json$/i.test(nom)) continue;
      let content = f.content;
      if ((f.truncated || !content) && f.raw_url) { try { const r = await fetch(f.raw_url); content = await r.text(); } catch {} }
      if (!content) continue;
      try { out.push({ nom, data: JSON.parse(content) }); } catch {}
    }
    // iwc-data.json (le principal) en premier, puis backups du plus récent au plus ancien
    out.sort((a, b) => (a.nom === 'iwc-data.json' ? -1 : b.nom === 'iwc-data.json' ? 1 : b.nom.localeCompare(a.nom)));
    return out;
  } catch (e) { console.log('❌ chargerTousSnapshots:', e.message); return []; }
}

module.exports = { loadDB, saveDB, saveDBSync, invalidateCache, sauvegarderSurGitHub, restaurerDepuisGitHub, chargerTousSnapshots };

