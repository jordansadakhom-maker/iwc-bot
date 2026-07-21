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
let telegramme = null; try { telegramme = require('./telegramme'); } catch {}
let inventaire = null; try { inventaire = require('./inventaire'); } catch {}
let absences = null; try { absences = require('./absences'); } catch {}
function _normInv(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }

// ── Utilitaires ──
function _s(v, max) { if (v == null) return ''; const s = String(v).trim(); return max ? s.slice(0, max) : s; }
function _dateFR() { try { return new Date().toLocaleDateString('fr-FR'); } catch { return ''; } }
function _isoOrNull(v) { if (!v) return null; try { const d = new Date(v); return isNaN(d.getTime()) ? null : d.toISOString(); } catch { return null; } }
// Reflet d'absence d'un membre (statut + détail) pour la mise à chaud du roster
// mis en cache — la resynchro immédiate reflète le changement sans attendre la
// prochaine reconstruction du roster.
function _absencePatch(m) {
  return {
    statut: (m && m.status) || 'actif',
    absence: (m && (m.status === 'absent' || m.absenceProgrammee))
      ? { jusqu: m.absentJusqu || null, raison: m.absentRaison || null, depuis: m.absentDepuis || null, programmee: m.absenceProgrammee || null }
      : null,
  };
}
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
    if (p.reposJusquAt !== undefined) { f.reposJusquAt = p.reposJusquAt ? new Date(p.reposJusquAt).toISOString() : null; changes.push('convalescence'); }
    if (p.reposMotif !== undefined) { f.reposMotif = _s(p.reposMotif, 300) || null; }
    f.majPar = p.auteurNom || 'Site web'; f.majAt = Date.now();
    if (changes.length) _medLog(f, `Mise à jour depuis le site (${changes.join(', ')})`, p.auteurNom);
    return { ok: true, message: 'Dossier mis à jour', discord: { type: 'medical', id } };
  },
  'medical.addSuivi': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    const soin = _s(p.soin, 300);
    if (!soin) return { ok: false, message: 'soin manquant' };
    const f = _medFiche(db, id);
    if (!Array.isArray(f.suivis)) f.suivis = [];
    f.suivis.push({ date: _dateFR(), soin, soignant: _s(p.soignant, 120), etat: _s(p.etat, 120), traitement: _s(p.traitement, 300) });
    f.majPar = p.auteurNom || 'Site web'; f.majAt = Date.now();
    _medLog(f, `Soin depuis le site : ${soin.slice(0, 80)}`, p.auteurNom);
    return { ok: true, message: 'Soin ajouté', discord: { type: 'medical', id } };
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
  // Assigner des agents à une opération → les inscrit + les prévient en MP.
  'operation.assigner': async (db, p, ctx) => {
    const op = _findOp(db, p.id);
    if (!op) return { ok: false, message: 'Opération introuvable' };
    const ids = (Array.isArray(p.membreIds) ? p.membreIds : []).map(String).filter(Boolean).slice(0, 20);
    const noms = (Array.isArray(p.membresNoms) ? p.membresNoms : []).map(String);
    if (!ids.length) return { ok: false, message: 'Personne à assigner' };
    if (!Array.isArray(op.participants)) op.participants = [];
    if (!Array.isArray(op.participantsIds)) op.participantsIds = [];
    if (!Array.isArray(op.agents)) op.agents = [];
    for (const id of ids) if (!op.participantsIds.includes(id)) { op.participantsIds.push(id); op.agents.push(id); }
    for (const n of noms) if (!op.participants.includes(n)) op.participants.push(n);
    let dm = 0;
    const guild = ctx?.guild;
    if (guild) for (const id of ids) { try { const m = await guild.members.fetch(id).catch(() => null); if (m) { await m.send(`🎯 **Tu es assigné(e) à une opération** — **${op.cible || op.name || 'Opération'}**${op.lieu ? ` · ${op.lieu}` : ''}\n_Assigné par ${p.auteurNom || 'la Direction'} depuis le site._`).catch(() => {}); dm++; } } catch {} }
    op.majPar = p.auteurNom || 'Site web'; op.majAt = Date.now();
    return { ok: true, message: `${ids.length} agent(s) assigné(s) (${dm} MP)` };
  },
  // Terminer une opération : résultat/butin/débrief + versement éventuel de la prime au coffre.
  'operation.terminer': (db, p) => {
    const op = _findOp(db, p.id);
    if (!op) return { ok: false, message: 'Opération introuvable' };
    op.status = 'terminee'; op.endedAt = Date.now();
    op.resultat = _s(p.resultat, 120) || op.resultat || 'Réussite';
    if (p.butin !== undefined) op.butin = _s(p.butin, 120);
    if (p.pertes !== undefined) op.pertes = _s(p.pertes, 300);
    if (p.debrief !== undefined) op.debrief = _s(p.debrief, 800);
    let credit = 0;
    const montant = Math.round(Number(p.montantPrime) || 0);
    if (montant > 0 && !op.primeVerseeCoffre) { db.coffre = (Math.round(Number(db.coffre) || 0)) + montant; op.primeVerseeCoffre = montant; credit = montant; }
    op.majPar = p.auteurNom || 'Site web'; op.majAt = Date.now();
    return { ok: true, message: `Opération terminée${credit ? ` · +${credit}$ au coffre` : ''}` };
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
  // Étape de suivi (pipeline En attente → En cours → Validé → Honoré → Abandonné).
  'contrat.suivi': (db, p) => {
    const c = (db.contrats || []).find(x => x && String(x.id) === String(p.id));
    if (!c) return { ok: false, message: 'Contrat introuvable' };
    const stage = _SUIVI.find(s => s.toLowerCase() === String(p.suivi || '').toLowerCase());
    if (!stage) return { ok: false, message: 'Étape inconnue' };
    if (stage === 'Honoré') return { ok: false, message: 'Utilise « Honorer » (montant requis)' };
    c.suivi = stage;
    if (stage === 'Validé') c.valideAt = Date.now();
    c.majPar = p.auteurNom || 'Site web'; c.majAt = Date.now();
    return { ok: true, message: `Suivi → ${stage}` };
  },
  // Honorer : crédite le coffre + crée une facture (comme sur Discord).
  'contrat.honorer': (db, p) => {
    const c = (db.contrats || []).find(x => x && String(x.id) === String(p.id));
    if (!c) return { ok: false, message: 'Contrat introuvable' };
    if (c.remuVerseAuCoffre) return { ok: false, message: 'Contrat déjà honoré' };
    const montant = Math.round(Number(p.montant) || 0);
    if (!Number.isFinite(montant) || montant <= 0) return { ok: false, message: 'Montant invalide' };
    db.coffre = (Math.round(Number(db.coffre) || 0)) + montant;
    c.suivi = 'Honoré'; c.remuVerseAuCoffre = montant; c.honoreAt = Date.now(); c.status = c.status || 'signe';
    const pole = (c.cc || c.type === 'confrerie' || String(c.id).startsWith('CF-')) ? 'illegal' : 'legal';
    if (!Array.isArray(db.factures)) db.factures = [];
    const n = db.factures.filter(f => f && f.numero && f.numero !== 'FAC-000').length + 1;
    const numero = `FAC-${String(n).padStart(3, '0')}`;
    db.factures.push({
      id: `web-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`, numero,
      objet: _s(c.objet || c.cible, 500) || 'Contrat', montant,
      clientNom: _s(c.commanditaire || c.clientNom, 200) || 'Client',
      type: pole === 'illegal' ? 'Contrat—Confrérie' : 'Contrat—IWC',
      remuneration: _s(c.remuneration, 120), createdAt: Date.now(), source: 'web', contratId: String(c.id),
    });
    c.majPar = p.auteurNom || 'Site web'; c.majAt = Date.now();
    return { ok: true, message: `Contrat honoré : +${montant}$ au coffre · ${numero}` };
  },

  // ── Portefeuilles perso (db.economie) ────────────────────
  // Paiement entre membres (comme /payer) : l'émetteur = le membre connecté.
  'wallet.payer': (db, p) => {
    const deId = String(p.auteurId || '');
    const versId = _s(p.membreId, 40);
    const montant = Math.round(Number(p.montant) || 0);
    if (!deId) return { ok: false, message: 'Connecte-toi pour payer.' };
    if (!versId) return { ok: false, message: 'Destinataire manquant' };
    if (deId === versId) return { ok: false, message: 'Impossible de te payer toi-même.' };
    if (montant <= 0) return { ok: false, message: 'Montant invalide' };
    if (!db.economie) db.economie = {};
    const de = db.economie[deId] || (db.economie[deId] = { solde: 0, historique: [] });
    if ((de.solde || 0) < montant) return { ok: false, message: 'Solde insuffisant' };
    const vers = db.economie[versId] || (db.economie[versId] = { solde: 0, historique: [] });
    const date = new Date().toLocaleDateString('fr-FR');
    const raison = _s(p.raison, 120) || 'Paiement';
    if (!Array.isArray(de.historique)) de.historique = [];
    if (!Array.isArray(vers.historique)) vers.historique = [];
    de.solde = (de.solde || 0) - montant; de.historique.push({ date, montant: -montant, raison: `Vers ${_s(p.versNom, 80) || versId} : ${raison}` });
    vers.solde = (vers.solde || 0) + montant; vers.historique.push({ date, montant, raison: `De ${p.auteurNom || 'Membre'} : ${raison}` });
    return { ok: true, message: `${montant}$ envoyés` };
  },
  // Créditer / débiter un portefeuille (comme /argent — Direction).
  'wallet.ajuster': (db, p) => {
    const id = _s(p.membreId, 40);
    const montant = Math.round(Number(p.montant) || 0); // peut être négatif
    if (!id) return { ok: false, message: 'Membre manquant' };
    if (!montant) return { ok: false, message: 'Montant nul' };
    if (!db.economie) db.economie = {};
    const c = db.economie[id] || (db.economie[id] = { solde: 0, historique: [] });
    if (!Array.isArray(c.historique)) c.historique = [];
    c.solde = Math.max(0, (c.solde || 0) + montant);
    c.historique.push({ date: new Date().toLocaleDateString('fr-FR'), montant, raison: _s(p.raison, 120) || (montant > 0 ? 'Crédit Direction' : 'Débit Direction') });
    return { ok: true, message: `Portefeuille ajusté (${montant > 0 ? '+' : ''}${montant}$)` };
  },

  // ── Coffres (finances) ───────────────────────────────────
  'coffre.ajuster': (db, p) => {
    const cible = String(p.cible || '').toLowerCase();
    const r2 = (x) => Math.round((Number(x) || 0) * 100) / 100; // arrondi au centime
    const montant = r2(p.montant);
    if (!Number.isFinite(montant)) return { ok: false, message: 'montant invalide' };
    const mode = ['depot', 'retrait', 'set'].includes(p.mode) ? p.mode : 'depot';
    const calc = (actuel) => mode === 'set' ? montant : mode === 'retrait' ? actuel - Math.abs(montant) : actuel + Math.abs(montant);
    if (cible === 'commun') {
      db.coffre = Math.max(0, r2(calc(r2(db.coffre))));
    } else if (cible === 'legal' || cible === 'illegal') {
      if (!db.coffres || typeof db.coffres !== 'object') db.coffres = {};
      db.coffres[cible] = Math.max(0, r2(calc(r2(db.coffres[cible]))));
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
// Pipeline de suivi des contrats (5 étapes, comme sur Discord).
const _SUIVI = ['En attente', 'En cours', 'Validé', 'Honoré', 'Abandonné'];
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

  // ── Absences (db.members[id]) — déclarer / lever depuis le site ──
  // Même modèle que le panneau Discord #absences : status='absent' + absentJusqu
  // + absentRaison (immédiate) ou absenceProgrammee (à venir). Le tableau Discord
  // est rafraîchi et le roster mis à chaud pour un reflet immédiat sur le site.
  'absence.declarer': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    if (!db.members || !db.members[id]) return { ok: false, message: 'Membre inconnu du bot' };
    const m = db.members[id];
    const raison = _s(p.raison, 200);
    const jusqu = _isoOrNull(p.jusqu);
    const debut = _isoOrNull(p.debut);
    const debutFutur = debut && new Date(debut).getTime() > Date.now() + 3600000; // > 1 h dans le futur
    if (debutFutur) {
      // Absence PROGRAMMÉE : ne touche pas au statut actuel (le membre reste actif).
      m.absenceProgrammee = { debut, fin: jusqu || null, raison: raison || '' };
      try { supa.majRosterMembre?.(id, _absencePatch(m)); } catch {}
      return { ok: true, message: 'Absence programmée enregistrée', discord: { type: 'absences' } };
    }
    m.status = 'absent';
    m.absentDepuis = new Date().toISOString();
    m.absentJusqu = jusqu || null;
    if (raison) m.absentRaison = raison;
    m.lastActivity = new Date().toISOString();
    try { supa.majRosterMembre?.(id, _absencePatch(m)); } catch {}
    return { ok: true, message: 'Absence déclarée', discord: { type: 'absences' } };
  },
  'absence.retour': (db, p) => {
    const id = _s(p.membreId, 40);
    if (!id) return { ok: false, message: 'membreId manquant' };
    const m = db.members && db.members[id];
    if (!m) return { ok: false, message: 'Membre inconnu du bot' };
    if (m.status !== 'absent' && !m.absenceProgrammee) return { ok: false, message: 'Aucune absence à lever' };
    m.status = 'actif';
    delete m.absentJusqu; delete m.absentRaison; delete m.absentMode; delete m.absentDepuis; delete m.absenceProgrammee;
    m.lastActivity = new Date().toISOString();
    try { supa.majRosterMembre?.(id, _absencePatch(m)); } catch {}
    return { ok: true, message: 'Absence levée — de retour', discord: { type: 'absences' } };
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

  // ── Télégrammes (db.conversations) ────────────────────────
  // Répondre depuis le site → correction IA + MP au client + trace + reflet fil.
  'telegramme.repondre': async (db, p, ctx) => {
    const rdvId = _s(p.rdvId, 80);
    const texte = _s(p.texte, 2000);
    if (!rdvId || !texte) return { ok: false, message: 'rdvId ou texte manquant' };
    if (!telegramme?.repondreDepuisWeb || !ctx?.guild?.client) return { ok: false, message: 'Télégrammes indisponibles' };
    return await telegramme.repondreDepuisWeb(ctx.guild.client, db, rdvId, texte, p.auteurNom || 'Équipe');
  },
  // Marque un télégramme comme ayant donné un RDV (persisté côté bot).
  'telegramme.marquerRdv': (db, p) => {
    if (!telegramme?.marquerRdvCree) return { ok: false, message: 'Indisponible' };
    return telegramme.marquerRdvCree(db, _s(p.rdvId, 80));
  },

  // ── Inventaire du coffre commun (db.inventaire.stock) ─────
  'inventaire.ajuster': (db, p) => {
    const cat = _s(p.categorie, 40) || 'Commun';
    const nom = _s(p.nom, 120);
    if (!nom) return { ok: false, message: 'objet manquant' };
    const mode = ['add', 'remove', 'set'].includes(p.mode) ? p.mode : 'add';
    const qte = Math.abs(parseInt(p.quantite, 10) || 0);
    if (!db.inventaire) db.inventaire = {};
    if (!db.inventaire.stock) db.inventaire.stock = {};
    if (!db.inventaire.stock[cat]) db.inventaire.stock[cat] = {};
    const bucket = db.inventaire.stock[cat];
    const key = Object.keys(bucket).find(k => _normInv(k) === _normInv(nom)) || nom;
    const avant = bucket[key] || 0;
    const apres = mode === 'add' ? avant + qte : mode === 'remove' ? Math.max(0, avant - qte) : qte;
    if (apres <= 0) delete bucket[key]; else bucket[key] = apres;
    if (!Array.isArray(db.inventaire.journal)) db.inventaire.journal = [];
    db.inventaire.journal.unshift({ t: Date.now(), who: p.auteurNom || 'Site web', txt: `${mode === 'remove' ? '−' : mode === 'set' ? '=' : '+'}${qte} ${nom} (${cat}) → ${apres}` });
    if (db.inventaire.journal.length > 60) db.inventaire.journal = db.inventaire.journal.slice(0, 60);
    return { ok: true, message: `Stock : ${nom} → ${apres}`, discord: { type: 'inventaire' } };
  },
  // Lecture IA d'une ou deux photos téléversées (URLs Supabase Storage) → +stock.
  'inventaire.photo': async (db, p) => {
    const urls = Array.isArray(p.urls) ? p.urls : (p.url ? [p.url] : []);
    if (!urls.length) return { ok: false, message: 'aucune photo' };
    if (!inventaire?.traiterPhotosWeb) return { ok: false, message: 'Lecture photo indisponible' };
    const r = await inventaire.traiterPhotosWeb(db, urls, p.auteurNom || 'Site web');
    if (r && r.ok) r.discord = { type: 'inventaire' };
    return r;
  },

  // ── Rendez-vous : assigner / pinguer les concernés sur Discord ─────
  'rdv.assigner': async (db, p, ctx) => {
    const membreIds = Array.isArray(p.membreIds) ? p.membreIds.map(String) : [];
    const guild = ctx?.guild;
    if (!guild) return { ok: false, message: 'Serveur indisponible' };
    if (!membreIds.length && !p.groupe) return { ok: false, message: 'Personne à assigner' };
    const info = `${p.rdvNom ? `**${p.rdvNom}**` : 'Rendez-vous'}${p.rdvLieu ? ` · ${p.rdvLieu}` : ''}${p.rdvCreneau ? ` · ${p.rdvCreneau}` : ''}${p.rdvDuree ? ` · ⏳ ${p.rdvDuree}` : ''}`;
    // MP à chaque agent assigné
    let dm = 0;
    for (const id of membreIds.slice(0, 15)) {
      try { const m = await guild.members.fetch(id).catch(() => null); if (m) { await m.send(`📅 **Tu es assigné(e) à un rendez-vous** — ${info}\n_Assigné par ${p.auteurNom || 'la Direction'} depuis le site._`).catch(() => {}); dm++; } } catch {}
    }
    // Notification VISIBLE sur Discord (salon agenda) : ping des personnes + du pôle
    const roleId = p.groupe === 'illegal' ? '1508898841993281658' : (p.groupe === 'legal' ? '1508756436082102303' : null);
    const ch = guild.channels.cache.get('1509638226132996178')
      || guild.channels.cache.find(c => c.isTextBased?.() && /agenda|planning|rendez|rdv/i.test(c.name))
      || guild.channels.cache.get('1518349707686973470')
      || guild.systemChannel;
    const mentions = [...membreIds.slice(0, 15).map(id => `<@${id}>`), roleId ? `<@&${roleId}>` : ''].filter(Boolean).join(' ');
    let posted = false;
    if (ch?.send) {
      try {
        await ch.send({
          content: `${mentions} 📅 **Rendez-vous à couvrir** — ${info}\n_Assigné par ${p.auteurNom || 'la Direction'} depuis le site._`,
          allowedMentions: { users: membreIds.slice(0, 15), roles: roleId ? [roleId] : [] },
        });
        posted = true;
      } catch {}
    }
    return { ok: true, message: `Assignation transmise (${dm} MP${posted ? ' + notif Discord' : ''}${roleId ? ' + ping pôle' : ''})` };
  },

  // ── Armurerie de Van Horn : envoi d'un contrat de vente au client (MP) ──
  'armurerie.contrat': async (db, p, ctx) => {
    const guild = ctx?.guild;
    const did = _s(p.clientDiscordId, 40);
    if (!guild || !did) return { ok: false, message: 'Client Discord introuvable' };
    const prix = Math.round(Number(p.prix) || 0);
    const lignes = [
      '```', '   ARMURERIE DE VAN HORN   ', '```',
      '📜 **CONTRAT DE VENTE D\'ARME À FEU**',
      '*Conforme au Décret N°2 — État de Louisiane*',
      '',
      `**Acquéreur :** ${_s(p.clientNom, 120) || '—'}`,
      _s(p.arme, 120) ? `**Arme :** ${_s(p.arme, 120)}` : null,
      _s(p.numeroSerie, 80) ? `**N° de série :** ${_s(p.numeroSerie, 80)}` : null,
      prix > 0 ? `**Prix :** ${prix.toLocaleString('fr-FR')}$` : null,
      _s(p.conditions, 1500) ? `\n**Conditions :**\n${_s(p.conditions, 1500)}` : null,
      '',
      'En acceptant ce contrat, vous reconnaissez être l\'acquéreur légal de l\'arme désignée et acceptez son inscription au registre officiel des ventes.',
      '',
      '✍️ *Pour **signer**, répondez « JE SIGNE » à ce message. Pour refuser, répondez « JE REFUSE ».*',
    ].filter(x => x != null);
    try {
      const user = await guild.client.users.fetch(did).catch(() => null);
      if (!user) return { ok: false, message: 'Client introuvable sur Discord' };
      const sent = await user.send(lignes.join('\n')).catch(() => null);
      if (!sent) return { ok: false, message: 'MP du client fermés — envoi impossible' };
      return { ok: true, message: 'Contrat envoyé au client en message privé' };
    } catch (e) { return { ok: false, message: e.message }; }
  },

  // ── Opérations : envoi d'une feuille de contrat au commanditaire (MP) ──
  'operation.contrat': async (db, p, ctx) => {
    const guild = ctx?.guild;
    const did = _s(p.clientDiscordId, 40);
    if (!guild || !did) return { ok: false, message: 'Commanditaire Discord introuvable' };
    const clientPropose = p.sens === 'client_propose'; // le client propose, la Compagnie s'engage
    const lignes = [
      '```', '   IRON WOLF COMPANY   ', '```',
      '📜 **CONTRAT D\'OPÉRATION**',
      _s(p.pole, 40) === 'illegal' ? '*La Confrérie*' : '*Iron Wolf Company — sécurité, escorte & chasse de prime*',
      '',
      `**Commanditaire :** ${_s(p.commanditaire, 120) || '—'}`,
      _s(p.categorie, 120) ? `**Type de mission :** ${_s(p.categorie, 120)}` : null,
      _s(p.objectif, 800) ? `**Objectif :** ${_s(p.objectif, 800)}` : null,
      _s(p.lieu, 200) ? `**Lieu :** ${_s(p.lieu, 200)}` : null,
      _s(p.agentsNoms, 500) ? `**Agents engagés :** ${_s(p.agentsNoms, 500)}` : null,
      _s(p.remuneration, 120) ? `**Rémunération :** ${_s(p.remuneration, 120)}` : null,
      _s(p.conditions, 1500) ? `\n**Conditions :**\n${_s(p.conditions, 1500)}` : null,
      '',
      clientPropose
        ? 'La Iron Wolf Company s\'engage à mener à bien la mission ci-dessus aux conditions convenues.'
        : 'En acceptant ce contrat, vous confiez la mission ci-dessus à la Iron Wolf Company aux conditions convenues.',
      '',
      '✍️ *Pour **signer**, répondez « JE SIGNE » à ce message. Pour refuser, répondez « JE REFUSE ».*',
    ].filter(x => x != null);
    try {
      const user = await guild.client.users.fetch(did).catch(() => null);
      if (!user) return { ok: false, message: 'Commanditaire introuvable sur Discord' };
      const sent = await user.send(lignes.join('\n')).catch(() => null);
      if (!sent) return { ok: false, message: 'MP du commanditaire fermés — envoi impossible' };
      // Persiste l'état du contrat sur l'opération : permet la signature auto en
      // MP (« JE SIGNE ») et garde une trace du statut. (saveDB géré par l'appelant.)
      const op = _findOp(db, p.operationId);
      if (op) {
        op.contrat = {
          statut: 'envoye',
          commanditaire: _s(p.commanditaire, 120),
          clientDiscordId: did,
          sens: p.sens === 'client_propose' ? 'client_propose' : 'client_signe',
          remuneration: _s(p.remuneration, 120),
          envoyeAt: new Date().toISOString(),
        };
      }
      return { ok: true, message: 'Contrat d\'opération envoyé au commanditaire en message privé' };
    } catch (e) { return { ok: false, message: e.message }; }
  },

  // ── Documents : envoyer un document rédigé sur le site à quelqu'un (MP) ──
  'document.envoyer': async (db, p, ctx) => {
    const guild = ctx?.guild;
    const did = _s(p.clientDiscordId, 40);
    if (!guild || !did) return { ok: false, message: 'Destinataire introuvable' };
    const titre = _s(p.titre, 120) || 'Document';
    const texte = _s(p.texte, 3500);
    if (!texte) return { ok: false, message: 'Document vide' };
    try {
      const user = await guild.client.users.fetch(did).catch(() => null);
      if (!user) return { ok: false, message: 'Destinataire introuvable sur Discord' };
      // Discord limite un message à 2000 caractères → on tronçonne proprement.
      const full = `📄 **${titre}**\n_Envoyé par ${p.auteurNom || 'la Iron Wolf Company'}_\n\n${texte}`;
      let rest = full, sent = null;
      while (rest.length > 1900) { let cut = rest.lastIndexOf('\n', 1900); if (cut < 500) cut = 1900; sent = await user.send(rest.slice(0, cut)).catch(() => null); if (!sent) break; rest = rest.slice(cut); }
      if (rest && (sent || full.length <= 1900)) sent = await user.send(rest).catch(() => null);
      if (!sent) return { ok: false, message: 'MP du destinataire fermés — envoi impossible' };
      return { ok: true, message: 'Document envoyé en message privé' };
    } catch (e) { return { ok: false, message: e.message }; }
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
    } else if (ref.type === 'inventaire' && inventaire?.rafraichirBoardDemarrage) {
      await inventaire.rafraichirBoardDemarrage(guild).catch(() => {});
    } else if (ref.type === 'absences' && absences?.rafraichirTableau) {
      await absences.rafraichirTableau(guild).catch(() => {});
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
      if (!payload.auteurId && c.auteurId) payload.auteurId = c.auteurId;
      const db = loadDB();
      const res = await h(db, payload, { guild });
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

// ── Signature d'un contrat par message privé (« JE SIGNE » / « JE REFUSE ») ──
// Le client reçoit son contrat en MP (armurerie ou opération) et répond en MP.
// On repère l'intention, on retrouve SON contrat en attente, on le marque signé
// (ou refusé) et on lui confirme. Ferme la boucle des contrats sans intervention.
function _normSig(s) {
  return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
}
async function traiterSignatureContratMP(message) {
  try {
    // MP uniquement, jamais les messages d'un bot.
    if (!message || message.guild || message.author?.bot) return false;
    const norm = _normSig(message.content);
    if (!norm) return false;
    // Négation ⇒ on ne SIGNE jamais par erreur (« je signe pas », « je ne signe pas »
    // = refus, pas signature).
    const negation = /\b(pas|jamais|non|ne)\b/.test(norm);
    const veutSigner = !negation && (/\bje signe\b/.test(norm) || /\bj accepte\b/.test(norm) || norm === 'signe' || norm === 'signer' || norm === 'accepte' || norm === 'j accepte');
    const veutRefuser = /\bje refuse\b/.test(norm) || /\bje n accepte pas\b/.test(norm) || norm === 'refuse' || norm === 'refuser' || (negation && /\bsigne\b/.test(norm));
    if (!veutSigner && !veutRefuser) return false;
    const did = String(message.author.id);

    // 1) Contrat d'armurerie en attente (table site-native ArmurerieContrat).
    let contratArmu = null;
    try { contratArmu = await supa.lireContratArmurerieEnAttente(did); } catch {}

    // 2) Contrat d'opération en attente (stocké sur l'opération dans data.json).
    const db = loadDB();
    let opAvecContrat = null;
    for (const o of [...(db.operations || []), ...(db.preparations || [])]) {
      if (o && o.contrat && o.contrat.statut === 'envoye' && String(o.contrat.clientDiscordId) === did) {
        if (!opAvecContrat || new Date(o.contrat.envoyeAt || 0) > new Date(opAvecContrat.contrat.envoyeAt || 0)) opAvecContrat = o;
      }
    }

    const tArmu = contratArmu ? new Date(contratArmu.envoyeAt || contratArmu.createdAt || 0).getTime() : -1;
    const tOp = opAvecContrat ? new Date(opAvecContrat.contrat.envoyeAt || 0).getTime() : -1;
    if (tArmu < 0 && tOp < 0) return false; // rien en attente pour cette personne → on ne consomme pas
    const statut = veutSigner ? 'signe' : 'refuse';

    // On agit sur le contrat le plus récemment envoyé.
    if (tArmu >= tOp) {
      try { await supa.marquerContratArmurerie(contratArmu.id, statut); } catch (e) { console.log('⚠️ signature armu:', e.message); return false; }
      const nom = _s(contratArmu.clientNom, 120) || '';
      const txt = veutSigner
        ? `✅ Merci${nom ? ' ' + nom : ''}. Votre **contrat de vente** est **signé** — il est désormais inscrit au registre officiel de l'Armurerie de Van Horn.`
        : `Bien reçu${nom ? ' ' + nom : ''}. Votre **refus** a été enregistré : le contrat est annulé.`;
      await message.reply({ content: txt, allowedMentions: { parse: [] } }).catch(() => {});
    } else {
      opAvecContrat.contrat.statut = statut;
      opAvecContrat.contrat.signeAt = new Date().toISOString();
      saveDB(db);
      const clientPropose = opAvecContrat.contrat.sens === 'client_propose';
      const qui = _s(opAvecContrat.contrat.commanditaire, 120) || '';
      const txt = veutSigner
        ? `✅ Merci${qui ? ' ' + qui : ''}. Le **contrat d'opération** est **signé** — ${clientPropose ? 'la mission est confirmée' : 'la Iron Wolf Company est engagée sur cette mission'}.`
        : `Bien reçu${qui ? ' ' + qui : ''}. Votre **refus** du contrat d'opération a été enregistré.`;
      await message.reply({ content: txt, allowedMentions: { parse: [] } }).catch(() => {});
    }
    return true;
  } catch (e) {
    console.log('⚠️ traiterSignatureContratMP:', e.message);
    return false;
  }
}

module.exports = { appliquerCommandesWeb, HANDLERS, traiterSignatureContratMP };
