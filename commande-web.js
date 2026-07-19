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
let repertoire = null; try { repertoire = require('./repertoire'); } catch {}

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

  // ── Opérations ───────────────────────────────────────────
  // Les opérations vivent dans db.operations (lancées/programmées) ET
  // db.preparations (en préparation). On les retrouve par id dans les deux.
  'operation.create': (db, p) => {
    const cible = _s(p.cible, 200);
    if (!cible) return { ok: false, message: 'titre manquant' };
    if (!Array.isArray(db.operations)) db.operations = [];
    const id = `web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    const pole = String(p.pole || '').toLowerCase().includes('ill') ? 'illegal' : 'legal';
    const status = _phaseOp(p.phase);
    db.operations.push({
      id, name: cible, cible, objectif: _s(p.objectif, 500) || cible,
      categorie: _s(p.categorie, 80) || 'Opération', pole, status,
      participants: [], agents: [], remuneration: _s(p.prime, 120), lieu: _s(p.lieu, 120),
      createdAt: new Date().toISOString(), createurNom: p.auteurNom || 'Site web', source: 'web',
    });
    return { ok: true, message: `Opération « ${cible.slice(0, 60)} » créée` };
  },
  'operation.update': (db, p) => {
    const op = _findOp(db, p.id);
    if (!op) return { ok: false, message: 'Opération introuvable' };
    const ch = [];
    if (p.cible !== undefined) { op.cible = _s(p.cible, 200); ch.push('titre'); }
    if (p.categorie !== undefined) { op.categorie = _s(p.categorie, 80); ch.push('type'); }
    if (p.prime !== undefined) { op.remuneration = _s(p.prime, 120); ch.push('prime'); }
    if (p.objectif !== undefined) { op.objectif = _s(p.objectif, 500); }
    if (p.lieu !== undefined) { op.lieu = _s(p.lieu, 120); }
    if (p.phase !== undefined) { const s = _phaseOp(p.phase); op.status = s; ch.push(`phase → ${s}`); }
    op.majPar = p.auteurNom || 'Site web'; op.majAt = Date.now();
    return { ok: true, message: `Opération mise à jour (${ch.join(', ') || '—'})` };
  },
  'operation.delete': (db, p) => {
    const id = String(p.id || '');
    let i = (db.operations || []).findIndex(o => o && String(o.id) === id);
    if (i >= 0) { db.operations.splice(i, 1); return { ok: true, message: 'Opération supprimée' }; }
    i = (db.preparations || []).findIndex(o => o && String(o.id) === id);
    if (i >= 0) { db.preparations.splice(i, 1); return { ok: true, message: 'Opération supprimée' }; }
    return { ok: false, message: 'Opération introuvable' };
  },

  // ── Contrats ─────────────────────────────────────────────
  'contrat.create': (db, p) => {
    const objet = _s(p.cible, 300);
    if (!objet) return { ok: false, message: 'objet manquant' };
    if (!Array.isArray(db.contrats)) db.contrats = [];
    const id = `web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    db.contrats.push({
      id, objet, commanditaire: _s(p.commanditaire, 200), clientNom: _s(p.commanditaire, 200),
      remuneration: _s(p.remuneration, 120), status: _statutContrat(p.statut),
      pole: _poleC(p.pole), agents: [], createdAt: new Date().toISOString(),
      createurNom: p.auteurNom || 'Site web', source: 'web',
    });
    return { ok: true, message: `Contrat « ${objet.slice(0, 50)} » créé` };
  },
  'contrat.update': (db, p) => {
    const c = (db.contrats || []).find(x => x && String(x.id) === String(p.id));
    if (!c) return { ok: false, message: 'Contrat introuvable' };
    if (p.cible !== undefined) c.objet = _s(p.cible, 300);
    if (p.commanditaire !== undefined) { c.commanditaire = _s(p.commanditaire, 200); c.clientNom = c.commanditaire; }
    if (p.remuneration !== undefined) c.remuneration = _s(p.remuneration, 120);
    if (p.statut !== undefined) c.status = _statutContrat(p.statut);
    if (p.pole !== undefined) c.pole = _poleC(p.pole);
    c.majPar = p.auteurNom || 'Site web'; c.majAt = Date.now();
    return { ok: true, message: 'Contrat mis à jour' };
  },
  'contrat.delete': (db, p) => {
    const i = (db.contrats || []).findIndex(x => x && String(x.id) === String(p.id));
    if (i < 0) return { ok: false, message: 'Contrat introuvable' };
    db.contrats.splice(i, 1);
    return { ok: true, message: 'Contrat supprimé' };
  },

  // ── Coffres (finances) ───────────────────────────────────
  'coffre.ajuster': (db, p) => {
    const cible = String(p.cible || '').toLowerCase();
    const montant = Math.round(Number(p.montant));
    if (!Number.isFinite(montant)) return { ok: false, message: 'montant invalide' };
    const mode = ['depot', 'retrait', 'set'].includes(p.mode) ? p.mode : 'depot';
    const calc = (actuel) => mode === 'set' ? montant : mode === 'retrait' ? actuel - Math.abs(montant) : actuel + Math.abs(montant);
    if (cible === 'commun') {
      db.coffre = Math.max(0, calc(Math.round(Number(db.coffre) || 0)));
    } else if (cible === 'legal' || cible === 'illegal') {
      if (!db.coffres || typeof db.coffres !== 'object') db.coffres = {};
      db.coffres[cible] = Math.max(0, calc(Math.round(Number(db.coffres[cible]) || 0)));
    } else {
      return { ok: false, message: 'coffre inconnu' };
    }
    return { ok: true, message: `Coffre ${cible} — ${mode}` };
  },
};

const _POLES_C = new Set(['legal', 'illegal']);
function _poleC(p) { p = String(p || '').toLowerCase(); return _POLES_C.has(p) ? p : (p.includes('ill') ? 'illegal' : 'legal'); }
const _STATUTS_C = new Set(['en_attente', 'valide', 'signe', 'termine', 'annule', 'refuse']);
function _statutContrat(s) { s = String(s || '').toLowerCase(); return _STATUTS_C.has(s) ? s : 'en_attente'; }
function _fiab05(v) { return Math.max(0, Math.min(5, parseInt(v, 10) || 0)); }
const _STATUTS_T = new Set(['chasse', 'capturee', 'eliminee', 'abandonnee']);
function _statutTraque(s) { s = String(s || '').toLowerCase(); return _STATUTS_T.has(s) ? s : 'chasse'; }

// ── Renseignement + Contacts : handlers additionnels ──
Object.assign(HANDLERS, {
  // Rapports d'informateurs (db.informateurs)
  'rapport.create': (db, p) => {
    const info = _s(p.info, 4000);
    if (!info) return { ok: false, message: 'info manquante' };
    if (!Array.isArray(db.informateurs)) db.informateurs = [];
    const id = `web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    db.informateurs.push({ id, source: _s(p.source, 200), cible: _s(p.cible, 200), info, fiabilite: _fiab05(p.fiabilite), statut: _s(p.statut, 40) || 'nouveau', createdAt: new Date().toISOString(), source_web: true });
    return { ok: true, message: 'Rapport ajouté' };
  },
  'rapport.update': (db, p) => {
    const r = (db.informateurs || []).find(x => x && String(x.id) === String(p.id));
    if (!r) return { ok: false, message: 'Rapport introuvable' };
    if (p.source !== undefined) r.source = _s(p.source, 200);
    if (p.cible !== undefined) r.cible = _s(p.cible, 200);
    if (p.info !== undefined) r.info = _s(p.info, 4000);
    if (p.fiabilite !== undefined) r.fiabilite = _fiab05(p.fiabilite);
    if (p.statut !== undefined) r.statut = _s(p.statut, 40);
    return { ok: true, message: 'Rapport mis à jour' };
  },
  'rapport.delete': (db, p) => {
    const i = (db.informateurs || []).findIndex(x => x && String(x.id) === String(p.id));
    if (i < 0) return { ok: false, message: 'Rapport introuvable' };
    db.informateurs.splice(i, 1);
    return { ok: true, message: 'Rapport supprimé' };
  },
  // Personnes traquées (db.traques)
  'traque.create': (db, p) => {
    const cible = _s(p.cible, 200);
    if (!cible) return { ok: false, message: 'cible manquante' };
    if (!Array.isArray(db.traques)) db.traques = [];
    const id = `AR-${Date.now().toString().slice(-6)}`;
    db.traques.push({
      id, cible, prime: _s(p.prime, 120) || '—', dangerosite: _s(p.dangerosite, 40) || 'moyen',
      status: _statutTraque(p.statut), position: _s(p.position, 200) || '—',
      vivantMort: _s(p.vivantMort, 40) || 'Indifférent', commanditaire: _s(p.commanditaire, 200) || '—',
      signalement: _s(p.signalement, 2000), photo: _s(p.photo, 500) || null,
      chasseurs: [], pistes: [], createdAt: new Date().toISOString(), source: 'web',
    });
    return { ok: true, message: `Avis de recherche émis : ${cible.slice(0, 50)}` };
  },
  'traque.update': (db, p) => {
    const t = (db.traques || []).find(x => x && String(x.id) === String(p.id));
    if (!t) return { ok: false, message: 'Traque introuvable' };
    if (p.cible !== undefined) t.cible = _s(p.cible, 200);
    if (p.prime !== undefined) t.prime = _s(p.prime, 120);
    if (p.dangerosite !== undefined) t.dangerosite = _s(p.dangerosite, 40);
    if (p.statut !== undefined) t.status = _statutTraque(p.statut);
    if (p.position !== undefined) t.position = _s(p.position, 200);
    if (p.vivantMort !== undefined) t.vivantMort = _s(p.vivantMort, 40);
    if (p.commanditaire !== undefined) t.commanditaire = _s(p.commanditaire, 200);
    if (p.signalement !== undefined) t.signalement = _s(p.signalement, 2000);
    if (p.photo !== undefined) t.photo = _s(p.photo, 500) || null;
    return { ok: true, message: 'Avis de recherche mis à jour' };
  },
  'traque.delete': (db, p) => {
    const i = (db.traques || []).findIndex(x => x && String(x.id) === String(p.id));
    if (i < 0) return { ok: false, message: 'Traque introuvable' };
    db.traques.splice(i, 1);
    return { ok: true, message: 'Traque supprimée' };
  },
  // Contacts (db.repertoire.contacts) — édition / suppression (l'ajout passe par DemandeContact)
  'contact.update': (db, p) => {
    const r = db.repertoire; const c = (r && Array.isArray(r.contacts)) ? r.contacts.find(x => x && String(x.id) === String(p.id)) : null;
    if (!c) return { ok: false, message: 'Contact introuvable' };
    if (p.nom !== undefined) c.nom = _s(p.nom, 120);
    if (p.type !== undefined) c.type = _s(p.type, 40);
    if (p.telegramme !== undefined) c.telegramme = _s(p.telegramme, 120);
    if (p.metier !== undefined) c.metier = _s(p.metier, 120);
    if (p.secteur !== undefined) c.secteur = _s(p.secteur, 120);
    if (p.affiliation !== undefined) c.affiliation = _s(p.affiliation, 120);
    if (p.relation !== undefined) c.relation = _s(p.relation, 120);
    if (p.statutRP !== undefined) c.statut = _s(p.statutRP, 60);
    if (p.notes !== undefined) c.notes = _s(p.notes, 2000);
    if (p.fiabilite !== undefined) c.fiabilite = _fiab05(p.fiabilite);
    c.maj = Date.now();
    return { ok: true, message: 'Contact mis à jour', discord: { type: 'contact', id: String(c.id) } };
  },
  'contact.delete': (db, p) => {
    const r = db.repertoire;
    if (!r || !Array.isArray(r.contacts)) return { ok: false, message: 'Contact introuvable' };
    const i = r.contacts.findIndex(x => x && String(x.id) === String(p.id));
    if (i < 0) return { ok: false, message: 'Contact introuvable' };
    const [removed] = r.contacts.splice(i, 1);
    return { ok: true, message: 'Contact supprimé', discord: { type: 'contact-del', contact: removed } };
  },

  // ── Armes (db.registreArmes.armes) ───────────────────────
  'arme.create': (db, p) => {
    const serie = _s(p.serie, 60);
    if (!serie) return { ok: false, message: 'n° de série manquant' };
    if (!db.registreArmes || typeof db.registreArmes !== 'object') db.registreArmes = {};
    if (!Array.isArray(db.registreArmes.armes)) db.registreArmes.armes = [];
    const id = `web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    db.registreArmes.armes.push({
      id, serie, type: _s(p.type, 80) || '—', categorie: _s(p.categorie, 80) || 'Autre',
      appartenance: _s(p.appartenance, 80), membreId: null, membreNom: _s(p.membreNom, 120),
      notes: _s(p.notes, 500), par: null, at: Date.now(), source: 'web',
    });
    return { ok: true, message: `Arme ${serie} enregistrée` };
  },
  'arme.update': (db, p) => {
    const a = (db.registreArmes && Array.isArray(db.registreArmes.armes) ? db.registreArmes.armes : []).find(x => x && String(x.id) === String(p.id));
    if (!a) return { ok: false, message: 'Arme introuvable' };
    if (p.serie !== undefined) a.serie = _s(p.serie, 60) || a.serie;
    if (p.type !== undefined) a.type = _s(p.type, 80);
    if (p.categorie !== undefined) a.categorie = _s(p.categorie, 80);
    if (p.appartenance !== undefined) a.appartenance = _s(p.appartenance, 80);
    if (p.membreNom !== undefined) a.membreNom = _s(p.membreNom, 120);
    if (p.notes !== undefined) a.notes = _s(p.notes, 500);
    return { ok: true, message: 'Arme mise à jour' };
  },
  'arme.delete': (db, p) => {
    const arr = (db.registreArmes && Array.isArray(db.registreArmes.armes)) ? db.registreArmes.armes : null;
    if (!arr) return { ok: false, message: 'Arme introuvable' };
    const i = arr.findIndex(x => x && String(x.id) === String(p.id));
    if (i < 0) return { ok: false, message: 'Arme introuvable' };
    arr.splice(i, 1);
    return { ok: true, message: 'Arme supprimée' };
  },

  // ── Factures (db.factures) ───────────────────────────────
  'facture.create': (db, p) => {
    const objet = _s(p.objet, 500);
    if (!objet) return { ok: false, message: 'objet manquant' };
    if (!Array.isArray(db.factures)) db.factures = [];
    const n = db.factures.filter(f => f && f.numero && f.numero !== 'FAC-000').length + 1;
    const numero = `FAC-${String(n).padStart(3, '0')}`;
    const id = `web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    db.factures.push({
      id, numero, objet, montant: Math.round(Number(p.montant) || 0),
      clientNom: _s(p.clientNom, 200) || 'Client', type: _s(p.type, 80) || 'Manuelle',
      remuneration: _s(p.remuneration, 120), createdAt: Date.now(), source: 'web',
    });
    return { ok: true, message: `Facture ${numero} créée` };
  },
  'facture.delete': (db, p) => {
    if (!Array.isArray(db.factures)) return { ok: false, message: 'Facture introuvable' };
    const i = db.factures.findIndex(x => x && (String(x.id) === String(p.id) || x.numero === p.id));
    if (i < 0) return { ok: false, message: 'Facture introuvable' };
    db.factures.splice(i, 1);
    return { ok: true, message: 'Facture supprimée' };
  },
});

// Trouve une opération par id dans db.operations puis db.preparations.
function _findOp(db, id) {
  id = String(id || '');
  return (db.operations || []).find(o => o && String(o.id) === id)
    || (db.preparations || []).find(o => o && String(o.id) === id)
    || null;
}
// Normalise une phase web vers un `status` reconnu par le bot (voir supabase-sync _phase).
const _PHASES_OP = new Set(['preparation', 'en_cours', 'terminee', 'annulee']);
function _phaseOp(s) { s = String(s || '').toLowerCase(); return _PHASES_OP.has(s) ? s : 'preparation'; }

// Propage un changement vers Discord (best-effort, ne bloque jamais).
async function _refletDiscord(guild, ref) {
  try {
    if (!guild || !ref) return;
    if (ref.type === 'medical' && medical?.rafraichirDossierWeb) {
      await medical.rafraichirDossierWeb(guild, ref.id).catch(() => {});
    } else if (ref.type === 'contact' && repertoire?.rafraichirFicheContact) {
      await repertoire.rafraichirFicheContact(guild, ref.id).catch(() => {});
    } else if (ref.type === 'contact-del' && repertoire?.supprimerFicheContactWeb && ref.contact) {
      await repertoire.supprimerFicheContactWeb(guild, ref.contact).catch(() => {});
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
