// ═══════════════════════════════════════════════════════════════
// commande-web.js — Applique les commandes CRUD venues du SITE
//
// Le site (espace interne) dépose des commandes dans Supabase (table
// CommandeWeb : créer / modifier / supprimer un dossier, une opération, un
// contrat…). Ce module les relève régulièrement, les applique aux VRAIES
// données du bot (data.json) via des « handlers » par type, puis resynchronise
// le site. Le bot reste la SOURCE DE VÉRITÉ.
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op sans
// les variables Supabase. La table CommandeWeb est neuve et jamais réconciliée.
// Ajouter une capacité = ajouter une entrée dans HANDLERS (rien d'autre à toucher).
// ═══════════════════════════════════════════════════════════════

const supa = require('./supabase-sync');
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
let medical = null; try { medical = require('./medical'); } catch {}

// ── Utilitaires ──
function _s(v, max) { if (v == null) return ''; const s = String(v).trim(); return max ? s.slice(0, max) : s; }
function _dateFR() { try { return new Date().toLocaleDateString('fr-FR'); } catch { return ''; } }
const _STATUTS_MED = new Set(['non_teste', 'apte', 'observation', 'inapte']);
function _statutMed(s) { s = String(s || '').toLowerCase(); return _STATUTS_MED.has(s) ? s : 'non_teste'; }
function _medFiche(db, id) {
  if (!db.suiviMedical) db.suiviMedical = {};
  if (!db.suiviMedical[id]) db.suiviMedical[id] = { statut: 'non_teste', testValide: false, testDate: null, prochainRdv: null, notes: '', blessures: [], suivis: [], ordonnances: [], historique: [] };
  return db.suiviMedical[id];
}
function _medLog(f, action, par) {
  if (!Array.isArray(f.historique)) f.historique = [];
  f.historique.push({ date: _dateFR(), action, par: par || 'Site web' });
  if (f.historique.length > 40) f.historique = f.historique.slice(-40);
}

// ═══════════════════════════════════════════════════════════════
//  HANDLERS — un par type de commande. Signature : (db, payload) => { ok, message, discord? }
//  Ils MUTENT `db` (sauvegardé ensuite par l'appelant). `discord` = reflet à
//  propager côté Discord (best-effort).
// ═══════════════════════════════════════════════════════════════
const HANDLERS = {
  // ── Médical ──────────────────────────────────────────────
  'medical.create': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    if (!db.suiviMedical) db.suiviMedical = {};
    const existe = !!db.suiviMedical[id];
    const f = _medFiche(db, id);
    if (!existe) {
      f.statut = _statutMed(p.statut);
      if (p.notes) f.notes = _s(p.notes, 2000);
      f.majPar = p.auteurNom || 'Site web'; f.majAt = Date.now();
      _medLog(f, `Dossier ouvert depuis le site (statut : ${f.statut})`, p.auteurNom);
    }
    return { ok: true, message: existe ? 'Dossier déjà existant' : 'Dossier créé', discord: { type: 'medical', id } };
  },
  'medical.update': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    if (!db.suiviMedical || !db.suiviMedical[id]) return { ok: false, message: 'Dossier introuvable' };
    const f = db.suiviMedical[id];
    const changes = [];
    if (p.statut !== undefined) { const ancien = f.statut; f.statut = _statutMed(p.statut); if (f.statut !== ancien) changes.push(`statut → ${f.statut}`); }
    if (p.notes !== undefined) { f.notes = _s(p.notes, 2000); changes.push('notes'); }
    if (p.prochainRdv !== undefined) { f.prochainRdv = _s(p.prochainRdv, 200) || null; changes.push('prochain RDV'); }
    if (p.testValide !== undefined) { f.testValide = !!p.testValide; if (f.testValide && !f.testDate) f.testDate = Date.now(); changes.push('test'); }
    f.majPar = p.auteurNom || 'Site web'; f.majAt = Date.now();
    if (changes.length) _medLog(f, `Mise à jour depuis le site (${changes.join(', ')})`, p.auteurNom);
    return { ok: true, message: 'Dossier mis à jour', discord: { type: 'medical', id } };
  },
  'medical.addBlessure': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    const desc = _s(p.desc, 300);
    if (!desc) return { ok: false, message: 'description manquante' };
    const f = _medFiche(db, id);
    if (!Array.isArray(f.blessures)) f.blessures = [];
    f.blessures.push({ date: _dateFR(), desc, localisation: _s(p.localisation, 120), gravite: _s(p.gravite, 40) });
    if (p.statut !== undefined) f.statut = _statutMed(p.statut);
    f.majPar = p.auteurNom || 'Site web'; f.majAt = Date.now();
    _medLog(f, `Blessure signalée depuis le site : ${desc.slice(0, 80)}`, p.auteurNom);
    return { ok: true, message: 'Blessure ajoutée', discord: { type: 'medical', id } };
  },
  'medical.addOrdonnance': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    const medicaments = _s(p.medicaments, 300);
    if (!medicaments) return { ok: false, message: 'médicament manquant' };
    const f = _medFiche(db, id);
    if (!Array.isArray(f.ordonnances)) f.ordonnances = [];
    f.ordonnances.push({ at: Date.now(), medicaments, posologie: _s(p.posologie, 150), duree: _s(p.duree, 80), conseils: _s(p.conseils, 400) });
    f.majPar = p.auteurNom || 'Site web'; f.majAt = Date.now();
    _medLog(f, `Ordonnance depuis le site : ${medicaments.slice(0, 80)}`, p.auteurNom);
    return { ok: true, message: 'Ordonnance ajoutée', discord: { type: 'medical', id } };
  },
  'medical.delete': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id || !db.suiviMedical || !db.suiviMedical[id]) return { ok: false, message: 'Dossier introuvable' };
    delete db.suiviMedical[id];
    return { ok: true, message: 'Dossier supprimé' };
  },
};

// Propage un changement vers Discord (best-effort, ne bloque jamais).
async function _refletDiscord(guild, ref) {
  try {
    if (!guild || !ref) return;
    if (ref.type === 'medical' && medical?.rafraichirDossierWeb) {
      await medical.rafraichirDossierWeb(guild, ref.id).catch(() => {});
    }
  } catch {}
}

// Relève et applique les commandes en attente.
async function appliquerCommandesWeb(guild) {
  if (!supa.lireCommandesWeb || !supa.marquerCommandeWeb) return;
  let cmds;
  try { cmds = await supa.lireCommandesWeb(); } catch { return; }
  if (!Array.isArray(cmds) || !cmds.length) return;

  let didChange = false;
  for (const c of cmds) {
    try {
      const h = HANDLERS[c.type];
      if (!h) { await supa.marquerCommandeWeb(c.id, 'echec', `type inconnu : ${c.type}`); continue; }
      const payload = (c.payload && typeof c.payload === 'object') ? { ...c.payload } : {};
      if (!payload.auteurNom && c.auteurNom) payload.auteurNom = c.auteurNom;
      const db = loadDB();
      const res = h(db, payload, { guild });
      if (res && res.ok) {
        saveDB(db);
        didChange = true;
        await supa.marquerCommandeWeb(c.id, 'applique', res.message || 'ok');
        if (res.discord) await _refletDiscord(guild, res.discord).catch(() => {});
      } else {
        await supa.marquerCommandeWeb(c.id, 'echec', (res && res.message) || 'échec');
      }
    } catch (e) {
      console.log('⚠️ commande-web:', e.message);
      try { await supa.marquerCommandeWeb(c.id, 'echec', e.message); } catch {}
    }
  }
  // Resynchronise tout de suite pour que le site reflète le changement sans attendre.
  if (didChange) { try { await supa.syncAll(loadDB()); } catch {} }
}

module.exports = { appliquerCommandesWeb, HANDLERS };
