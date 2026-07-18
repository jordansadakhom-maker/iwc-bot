// ═══════════════════════════════════════════════════════════════
// supabase-sync.js — Pont bot → Supabase (plateforme web IWC)
//
// Pousse les VRAIES données du bot (db.js) vers Supabase via l'API REST
// PostgREST (HTTPS, autorisé depuis Render). AUCUNE donnée inventée : on
// reflète fidèlement ce qui est dans data.json (membres, coffres, contrats,
// opérations). Si un coffre vaut 0, on écrit 0.
//
// « Ne rien dérégler » : module 100 % additif, best-effort, jamais bloquant.
// Sans les variables d'env SUPABASE_URL + SUPABASE_SERVICE_KEY, il ne fait
// simplement rien (no-op silencieux) et le bot fonctionne comme avant.
//
// Sécurité : utilise la clé service_role (secret) — à ne jamais exposer côté
// web. Écrit uniquement (upsert), ne lit pas de données sensibles.
// ═══════════════════════════════════════════════════════════════

const SUPABASE_URL = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '');
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '';

function estActif() { return !!(SUPABASE_URL && SUPABASE_KEY); }

// ── Upsert générique d'un lot de lignes dans une table PostgREST ──
// Prefer: resolution=merge-duplicates → insère ou met à jour sur la clé primaire.
async function _upsert(table, rows) {
  if (!rows || !rows.length) return { table, count: 0, ok: true };
  const url = `${SUPABASE_URL}/rest/v1/${table}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'resolution=merge-duplicates,return=minimal',
      },
      body: JSON.stringify(rows),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => '');
      console.log(`⚠️ Supabase ${table}: HTTP ${res.status} ${t.slice(0, 240)}`);
      return { table, count: 0, ok: false, status: res.status };
    }
    return { table, count: rows.length, ok: true };
  } catch (e) {
    console.log(`⚠️ Supabase ${table}: ${e.message}`);
    return { table, count: 0, ok: false, error: e.message };
  }
}

// ── Normalisations vers les enums Postgres ──
const _POLES = new Set(['legal', 'illegal', 'both']);
function _pole(p) { p = String(p || '').toLowerCase(); return _POLES.has(p) ? p : 'legal'; }

const _STATUTS = new Set(['actif', 'absent', 'inactif', 'parti', 'visiteur']);
function _statut(s) { s = String(s || '').toLowerCase(); return _STATUTS.has(s) ? s : 'actif'; }

function _contratPole(c) {
  const p = String(c.pole || '').toLowerCase();
  if (p === 'legal' || p === 'illegal') return p;
  if (c.cc || c.type === 'confrerie') return 'illegal';
  return 'legal';
}

function _phase(s) {
  s = String(s || '').toLowerCase();
  if (/annul/.test(s)) return 'annulee';
  if (/termin|fini|clotur|fin\b/.test(s)) return 'terminee';
  if (/cours|encours|demarr|publi|lanc|actif|active/.test(s)) return 'en_cours';
  return 'preparation';
}

function _str(v, max) { if (v == null) return null; const s = String(v); return max ? s.slice(0, max) : s; }

// ═══════════════════════════════════════════════════════════════
//  Construction des lots à partir de db.js (tolérant aux formes variées)
// ═══════════════════════════════════════════════════════════════
function _construire(db) {
  const now = new Date().toISOString();

  // ── Membres ──
  const membres = Object.values(db.members || {})
    .filter(m => m && m.id)
    .map(m => ({
      id: String(m.id),
      nomIC: _str(m.name || m.nom, 120) || 'Inconnu',
      pole: _pole(m.pole),
      grade: _str(m.rang || m.grade, 120),
      statut: _statut(m.status || m.statut),
      ancienneteAt: m.joinedAt || m.ancienneteAt || null,
      updatedAt: now,
    }));
  const memberIds = new Set(membres.map(m => m.id));

  // ── Coffres (reflet fidèle — 0 reste 0) ──
  const coffres = [
    { id: 'coffre_commun', pole: 'both', solde: Math.round(Number(db.coffre) || 0), updatedAt: now },
  ];
  if (db.coffres && typeof db.coffres === 'object') {
    coffres.push({ id: 'coffre_legal', pole: 'legal', solde: Math.round(Number(db.coffres.legal) || 0), updatedAt: now });
    coffres.push({ id: 'coffre_illegal', pole: 'illegal', solde: Math.round(Number(db.coffres.illegal) || 0), updatedAt: now });
  }

  // ── Contrats ──
  const contrats = (db.contrats || [])
    .filter(c => c && c.id)
    .map(c => ({
      id: String(c.id),
      cible: _str(c.objet || c.cible || c.titre || c.commanditaire || 'Contrat', 300),
      motif: _str(c.details, 2000),
      remuneration: c.remuneration != null ? _str(c.remuneration, 120)
        : (c.montant != null ? `$${Number(c.montant).toLocaleString('fr-FR')}` : null),
      statut: _str(c.status || c.statut || 'en_attente', 60),
      pole: _contratPole(c),
      commanditaire: _str(c.commanditaire || c.clientNom, 200),
      agents: Array.isArray(c.agents) ? c.agents.map(String) : [],
      createdAt: c.createdAt || undefined,
    }));
  const contratIds = new Set(contrats.map(c => c.id));

  // ── Opérations (préparations par étapes + anciennes opérations) ──
  const opsSrc = [...(db.preparations || []), ...(db.operations || [])].filter(o => o && o.id);
  const seen = new Set();
  const usedContrat = new Set();
  const operations = [];
  for (const o of opsSrc) {
    const id = String(o.id);
    if (seen.has(id)) continue;
    seen.add(id);
    // FK contratId (UNIQUE) : uniquement si le contrat est bien synchronisé et pas déjà pris
    let contratId = null;
    if (o.contratId && contratIds.has(String(o.contratId)) && !usedContrat.has(String(o.contratId))) {
      contratId = String(o.contratId);
      usedContrat.add(contratId);
    }
    // FK createurId : uniquement si c'est un membre connu (sinon violation de clé étrangère)
    const createurId = (o.createurId && memberIds.has(String(o.createurId))) ? String(o.createurId) : null;
    const agents = (Array.isArray(o.agents) && o.agents.length) ? o.agents
      : Array.isArray(o.membres) ? o.membres
      : Array.isArray(o.participants) ? o.participants : [];
    operations.push({
      id,
      categorie: _str(o.categorie || o.typeKey || o.type || 'Opération', 120),
      cible: _str(o.cible || o.name || o.objectif || 'Opération', 300),
      phase: _phase(o.status),
      prime: o.remuneration != null ? _str(o.remuneration, 120) : (o.prime != null ? _str(o.prime, 120) : null),
      contratId,
      createurId,
      agentsAssignes: agents.map(String),
      etapes: o.etapes || null,
      createdAt: o.createdAt || undefined,
      updatedAt: now,
    });
  }

  return { membres, coffres, contrats, operations };
}

// ═══════════════════════════════════════════════════════════════
//  Synchronisation complète (ordre respectant les clés étrangères)
// ═══════════════════════════════════════════════════════════════
let _running = false, _redo = false;

async function syncAll(db) {
  if (!estActif()) return { skipped: true };
  if (!db || typeof db !== 'object') return { skipped: true };
  if (_running) { _redo = true; return { deferred: true }; } // évite deux syncs en parallèle
  _running = true;
  try {
    let out;
    do {
      _redo = false;
      const { membres, coffres, contrats, operations } = _construire(db);
      const results = [];
      results.push(await _upsert('Membre', membres));    // 1. aucun FK bloquant (parrainId non fourni)
      results.push(await _upsert('Coffre', coffres));    // 2. indépendant
      results.push(await _upsert('Contrat', contrats));  // 3. indépendant
      results.push(await _upsert('Operation', operations)); // 4. FK → Membre + Contrat (déjà poussés)
      const summary = results.map(r => `${r.table} ${r.ok ? r.count : '✗' + (r.status || '')}`).join(' · ');
      console.log(`🔄 Sync Supabase → ${summary}`);
      out = { ok: true, results };
    } while (_redo);
    return out;
  } finally {
    _running = false;
  }
}

// ── Sync différée (debounce) — appelable après une écriture sans spammer l'API ──
let _timer = null;
function scheduleSync(db, delay = 15000) {
  if (!estActif()) return;
  if (_timer) clearTimeout(_timer);
  _timer = setTimeout(() => { _timer = null; syncAll(db).catch(() => {}); }, delay);
}

module.exports = { estActif, syncAll, scheduleSync };
