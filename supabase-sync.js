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

// Liste des IDs de membres RÉELLEMENT présents sur le serveur Discord.
// Renseignée par index.js (via guild.members.fetch). null = inconnu → on ne
// filtre pas (sécurité : ne jamais vider par erreur si la récupération échoue).
let _membresActuels = null;
function setMembresActuels(ids) {
  if (Array.isArray(ids) && ids.length) _membresActuels = new Set(ids.map(String));
  else _membresActuels = null;
}

// Roster complet construit depuis les rôles Discord (grades) — source de vérité
// des membres affichés sur le site : [{ id, nom, grade, pole, statut, joinedAt }].
// null = non fourni → repli sur db.members.
let _roster = null;
function setMembresRoster(arr) { _roster = (Array.isArray(arr) && arr.length) ? arr : null; }

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

// Libellés des rendez-vous (clés db.rdvplus → texte lisible pour le site).
const RDV_TYPES = { esc: 'Escorte de personne', cnv: 'Escorte de convoi', pro: 'Protection rapprochée', sec: "Sécurisation d'un lieu", enq: 'Enquête / filature', neg: 'Négociation / médiation', rec: 'Récupération de biens', bnt: 'Chasse à la prime', trv: 'Travail discret' };
const RDV_LIEUX = { val: 'Valentine', str: 'Strawberry', rho: 'Rhodes', sd: 'Saint-Denis', bw: 'Blackwater', ann: 'Annesburg', vh: 'Van Horn', tum: 'Tumbleweed', arm: 'Armadillo', emr: 'Emerald Ranch', lag: 'Lagras', col: 'Colter', man: 'Manzanita Post', was: 'Wallace Station', rig: 'Riggs Station', dsc: 'Un lieu discret', aut: 'Autre' };

function _isoOrUndef(v) {
  if (!v) return undefined;
  try { const d = (typeof v === 'number') ? new Date(v) : new Date(v); return isNaN(d.getTime()) ? undefined : d.toISOString(); } catch { return undefined; }
}

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
// Nettoie une valeur : renvoie null si vide ou « — » (placeholder du bot).
function _nn(v, max) { const s = (v == null ? '' : String(v)).trim(); if (!s || s === '—') return null; return max ? s.slice(0, max) : s; }
// Convertit une fiabilité texte du bot en note 0-5 (colonne INTEGER de RapportInfo).
function _fiabiliteNum(v) {
  const s = String(v || '').toLowerCase();
  if (/non\s*confirm|infirm/.test(s)) return 2;   // « Non confirmée » (tester avant « confirm »)
  if (/confirm/.test(s)) return 5;                // « Confirmée »
  if (/bonne|élev|elev|haut/.test(s)) return 4;
  if (/moyen/.test(s)) return 3;
  if (/faible|bas/.test(s)) return 1;
  const n = parseInt(s, 10);
  if (!isNaN(n)) return Math.max(0, Math.min(5, n));
  return 0;
}

// ═══════════════════════════════════════════════════════════════
//  Construction des lots à partir de db.js (tolérant aux formes variées)
// ═══════════════════════════════════════════════════════════════
function _construire(db) {
  const now = new Date().toISOString();

  // ── Membres ──
  // Source de vérité = le roster construit depuis les rôles Discord (grades),
  // si fourni : reflète EXACTEMENT la hiérarchie (les 9 gradés, pas seulement
  // ceux présents dans db.members). Sinon repli sur db.members ∩ roster réel.
  let membres;
  if (_roster) {
    membres = _roster.filter(r => r && r.id).map(r => ({
      id: String(r.id),
      nomIC: _str(r.nom, 120) || 'Inconnu',
      pole: _pole(r.pole),
      grade: _str(r.grade, 120),
      statut: _statut(r.statut),
      ancienneteAt: r.joinedAt || null,
      updatedAt: now,
    }));
  } else {
    membres = Object.values(db.members || {})
      .filter(m => m && m.id && (!_membresActuels || _membresActuels.has(String(m.id))))
      .map(m => ({
        id: String(m.id),
        nomIC: _str(m.name || m.nom, 120) || 'Inconnu',
        pole: _pole(m.pole),
        grade: _str(m.rang || m.grade, 120),
        statut: _statut(m.status || m.statut),
        ancienneteAt: m.joinedAt || m.ancienneteAt || null,
        updatedAt: now,
      }));
  }
  const memberIds = new Set(membres.map(m => m.id));

  // ── Coffres (reflet fidèle — 0 reste 0) ──
  const _r2 = (x) => Math.round((Number(x) || 0) * 100) / 100; // conserve les centimes
  const coffres = [
    { id: 'coffre_commun', pole: 'both', solde: _r2(db.coffre), updatedAt: now },
  ];
  if (db.coffres && typeof db.coffres === 'object') {
    coffres.push({ id: 'coffre_legal', pole: 'legal', solde: _r2(db.coffres.legal), updatedAt: now });
    coffres.push({ id: 'coffre_illegal', pole: 'illegal', solde: _r2(db.coffres.illegal), updatedAt: now });
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
      // Suivi / pipeline (colonnes optionnelles — repli automatique si absentes).
      suivi: _nn(c.suivi, 40),
      remuVerseAuCoffre: c.remuVerseAuCoffre != null ? Math.round(Number(c.remuVerseAuCoffre)) : null,
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
      // Détail complet (colonnes optionnelles — repli automatique si absentes).
      objectif: _nn(o.objectif || o.briefing, 2000),
      lieu: _nn(o.lieu || o.lieuTexte, 200),
      pole: o.pole ? _pole(o.pole) : 'both',
      createurNom: _nn(o.createurNom || o.createdByNom, 120),
      resultat: _nn(o.resultat, 120),
      butin: _nn(o.butin, 120),
      debrief: _nn(o.debrief || o.pertes, 800),
    });
  }

  // ── Renseignement : rapports d'informateurs (db.informateurs) ──
  const rapports = (db.informateurs || [])
    .filter(r => r && r.id)
    .map(r => ({
      id: String(r.id),
      source: _nn(r.source, 200),
      cible: _nn(r.cible, 200),
      info: _str(r.info, 4000) || '—',
      fiabilite: _fiabiliteNum(r.fiabilite),
      statut: _str(r.statut || 'nouveau', 40),
      rapporteurId: r.rapporteurId ? String(r.rapporteurId) : null,
      createdAt: r.createdAt || undefined,
    }));

  // ── Renseignement / Avis de recherche : personnes traquées (db.traques) ──
  //    « status » côté bot. Champs riches (affiche WANTED) en colonnes optionnelles.
  const traques = (db.traques || [])
    .filter(t => t && t.id)
    .map(t => ({
      id: String(t.id),
      cible: _str(t.cible, 200) || '—',
      prime: _nn(t.prime, 120),
      dangerosite: _nn(t.dangerosite, 40),
      statut: _str(t.status || t.statut || 'chasse', 40),
      createdAt: t.createdAt || undefined,
      // Affiche « avis de recherche » : colonnes optionnelles (repli auto si absentes).
      photo: _nn(t.photo || t.photoUrl, 500),
      position: _nn(t.position, 200),
      vivantMort: _nn(t.vivantMort, 40),
      commanditaire: _nn(t.commanditaire, 200),
      signalement: _nn(t.signalement || t.resume, 2000),
      chasseurs: Array.isArray(t.chasseurs) ? t.chasseurs.length : 0,
    }));

  // ── Médical : dossiers (db.suiviMedical, indexé par ID Discord du membre) ──
  const dossiers = Object.entries(db.suiviMedical || {})
    .filter(([id, f]) => id && f && typeof f === 'object')
    .map(([id, f]) => ({
      id: String(id),
      membreId: String(id),
      statut: _str(f.statut || 'non_teste', 40),
      blessures: Array.isArray(f.blessures) ? f.blessures : [],
      suivis: Array.isArray(f.suivis) ? f.suivis : [],
      ordonnances: Array.isArray(f.ordonnances) ? f.ordonnances : [],
      historique: Array.isArray(f.historique) ? f.historique : [],
      // Champs détaillés (colonnes optionnelles — repli automatique si absentes).
      notes: _nn(f.notes, 2000),
      testValide: !!f.testValide,
      prochainRdv: _nn(f.prochainRdv, 200),
      reposJusquAt: _isoOrUndef(f.reposJusquAt) || null,
      reposMotif: _nn(f.reposMotif, 300),
      majPar: _nn(f.majPar, 120),
      updatedAt: now,
    }));

  // ── Répertoire : contacts (db.repertoire.contacts) — format complet (Discord) ──
  const contacts = ((db.repertoire && db.repertoire.contacts) || [])
    .filter(c => c && c.id)
    .map(c => ({
      id: String(c.id),
      nom: _str(c.nom, 120) || 'Contact',
      type: _str(c.type || 'Neutre', 40),
      fiabilite: Math.max(0, Math.min(5, parseInt(c.fiabilite, 10) || 0)),
      secteur: _nn(c.secteur, 120),
      notes: _nn(c.notes, 2000),
      photoUrl: _nn(c.photoUrl, 500),
      // Champs détaillés (colonnes optionnelles — repli automatique si absentes).
      telegramme: _nn(c.telegramme, 120),
      metier: _nn(c.metier, 120),
      affiliation: _nn(c.affiliation, 120),
      relation: _nn(c.relation, 120),
      statutRP: _nn(c.statut, 60),
      creeParNom: _nn(c.creeParNom, 120),
    }));

  // ── Rendez-vous du bot (db.rdvplus.rdvs). ⚠️ PAS de réconciliation sur Rdv :
  //    la table Rdv contient AUSSI les demandes du site web (ids distincts).
  const rdvs = Object.values((db.rdvplus && db.rdvplus.rdvs) || {})
    .filter(r => r && r.id)
    .map(r => ({
      id: String(r.id),
      clientId: r.clientId ? String(r.clientId) : null,
      nomRP: _nn(r.nomRP, 120),
      type: RDV_TYPES[r.typeKey] || _nn(r.typeKey, 120) || 'Rendez-vous',
      lieu: RDV_LIEUX[r.lieuKey] || _nn(r.lieuKey, 120),
      creneau: _nn(r.souhaitTexte, 200),
      statut: _str(r.statut || 'Planifié', 40),
      agentId: (Array.isArray(r.agentIds) && r.agentIds[0]) ? String(r.agentIds[0]) : (r.agentId ? String(r.agentId) : null),
      paiement: (r.paiement && typeof r.paiement === 'object') ? r.paiement : null,
      createdAt: _isoOrUndef(r.createdAt),
    }));

  // ── Inventaire : registre d'armes (db.registreArmes.armes) ──
  const armes = ((db.registreArmes && db.registreArmes.armes) || [])
    .filter(a => a && a.id)
    .map(a => {
      const app = String(a.appartenance || '').toLowerCase();
      const pole = /confr/.test(app) ? 'illegal' : (/iron|wolf|loup/.test(app) ? 'legal' : null);
      return {
        id: String(a.id),
        serie: _str(a.serie, 60) || '—',
        type: _nn(a.type, 80),
        categorie: _nn(a.categorie, 80),
        appartenance: _nn(a.appartenance, 80),
        membreId: a.membreId ? String(a.membreId) : null,
        membreNom: _nn(a.membreNom, 120),
        notes: _nn(a.notes, 500),
        pole,
        createdAt: _isoOrUndef(a.at),
      };
    });

  // ── Finances : factures (db.factures) — exclut l'exemple FAC-000 ──
  const factures = (db.factures || [])
    .filter(f => f && (f.id || f.numero) && f.numero !== 'FAC-000')
    .map(f => ({
      id: String(f.id || f.numero),
      numero: _str(f.numero, 40) || '—',
      objet: _str(f.objet, 500) || 'Prestation',
      montant: Math.round(Number(f.montant) || 0),
      clientNom: _nn(f.clientNom, 200),
      type: _nn(f.type, 80),
      remuneration: _nn(f.remuneration, 120),
      ref: _nn(f.ref, 120),
      createdAt: _isoOrUndef(f.createdAt),
    }));

  // ── Télégrammes (db.conversations) → relayés sur le site ──
  const telegrammes = Object.values(db.conversations || {})
    .filter(c => c && c.rdvId)
    .map(c => ({
      id: String(c.rdvId),
      clientId: c.demandeurId ? String(c.demandeurId) : null,
      clientNom: _nn(c.nomRP, 120) || 'Client',
      statut: _str(c.status || 'ouvert', 40),
      messages: Array.isArray(c.messages) ? c.messages : [],
      rdvCree: !!c.rdvCree,
      salonId: c.parentChannelId ? String(c.parentChannelId) : null,
      createdAt: _isoOrUndef(c.createdAt),
      updatedAt: now,
    }));

  // ── Inventaire du coffre commun (db.inventaire.stock) → items + mouvements ──
  const invItems = [];
  const invMouv = [];
  if (db.inventaire && db.inventaire.stock && typeof db.inventaire.stock === 'object') {
    for (const [cat, bucket] of Object.entries(db.inventaire.stock)) {
      if (!bucket || typeof bucket !== 'object') continue;
      for (const [nom, q] of Object.entries(bucket)) {
        const norm = String(nom).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, '');
        const seuil = (db.inventaire.seuils && db.inventaire.seuils[norm] != null) ? Number(db.inventaire.seuils[norm]) : null;
        invItems.push({ id: `inv:${cat}:${norm}`.slice(0, 120), categorie: _str(cat, 40) || 'Commun', nom: _str(nom, 120) || 'Objet', quantite: Math.round(Number(q)) || 0, seuil, updatedAt: now });
      }
    }
    const jr = Array.isArray(db.inventaire.journal) ? db.inventaire.journal.slice(0, 60) : [];
    jr.forEach((j, i) => { if (j) invMouv.push({ id: `invm:${j.t || 'x'}:${i}`.slice(0, 120), texte: _str(j.txt, 300), par: _nn(j.who, 120), createdAt: _isoOrUndef(j.t) }); });
  }

  // ── Portefeuilles perso (db.economie) ──
  const portefeuilles = Object.entries(db.economie || {})
    .filter(([id, w]) => id && w && typeof w === 'object')
    .map(([id, w]) => ({
      id: String(id),
      solde: Math.round(Number(w.solde) || 0),
      historique: Array.isArray(w.historique) ? w.historique.slice(-30) : [],
      updatedAt: now,
    }));

  // ── Journal de trésorerie (db.tresorerieLedger) ──
  const transactions = (Array.isArray(db.tresorerieLedger) ? db.tresorerieLedger : [])
    .slice(-200)
    .map((t, i) => ({
      id: `tx:${t.date || 'x'}:${i}`.slice(0, 120),
      sens: _str(t.sens, 20) || 'entree',
      montant: Math.round(Number(t.montant) || 0),
      poste: _nn(t.posteLabel || t.posteKey, 60),
      motif: _nn(t.motif, 200),
      auteur: _nn(t.auteur, 120),
      createdAt: _isoOrUndef(t.date),
    }));

  return { membres, coffres, contrats, operations, rapports, traques, dossiers, contacts, rdvs, armes, factures, telegrammes, invItems, invMouv, portefeuilles, transactions };
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
      const { membres, coffres, contrats, operations, rapports, traques, dossiers, contacts, rdvs, armes, factures, telegrammes, invItems, invMouv, portefeuilles, transactions } = _construire(db);
      const results = [];
      results.push(await _upsert('Membre', membres));    // 1. aucun FK bloquant (parrainId non fourni)
      results.push(await _upsert('Coffre', coffres));    // 2. indépendant
      // 3. Contrats — tente le suivi complet ; repli si colonnes optionnelles absentes.
      let rCo = await _upsert('Contrat', contrats);
      if (!rCo.ok && rCo.status === 400) {
        const base = contrats.map(({ suivi, remuVerseAuCoffre, ...b }) => b);
        rCo = await _upsert('Contrat', base);
      }
      results.push(rCo);
      // 4. Opérations — FK → Membre + Contrat. Tente le détail complet ; repli si
      //    les colonnes optionnelles (objectif, lieu, pole, createurNom) n'existent pas.
      let rO = await _upsert('Operation', operations);
      if (!rO.ok && rO.status === 400) {
        const base = operations.map(({ objectif, lieu, pole, createurNom, resultat, butin, debrief, ...b }) => b);
        rO = await _upsert('Operation', base);
      }
      results.push(rO);
      results.push(await _upsert('RapportInfo', rapports)); // 5. renseignement — indépendant
      // 6. Traques / avis de recherche — format complet, repli si colonnes riches absentes.
      let rT = await _upsert('Traque', traques);
      if (!rT.ok && rT.status === 400) {
        const base = traques.map(({ photo, position, vivantMort, commanditaire, signalement, chasseurs, ...b }) => b);
        rT = await _upsert('Traque', base);
      }
      results.push(rT);
      // 7. Médical — tente le format complet ; repli sur les champs de base si
      //    les colonnes détaillées (notes, convalescence…) n'existent pas encore.
      let rD = await _upsert('DossierMedical', dossiers);
      if (!rD.ok && rD.status === 400) {
        const base = dossiers.map(({ notes, testValide, prochainRdv, reposJusquAt, reposMotif, majPar, ...b }) => b);
        rD = await _upsert('DossierMedical', base);
      }
      results.push(rD);
      // 8. Contacts — tente le format complet ; si les colonnes détaillées ne
      //    sont pas encore créées (HTTP 400), repli sur les champs de base.
      let rC = await _upsert('Contact', contacts);
      if (!rC.ok && rC.status === 400) {
        const base = contacts.map(({ telegramme, metier, affiliation, relation, statutRP, creeParNom, ...b }) => b);
        rC = await _upsert('Contact', base);
      }
      results.push(rC);
      results.push(await _upsert('Rdv', rdvs));                // 9. rdv du bot (coexiste avec les demandes web)
      results.push(await _upsert('Arme', armes));              // 10. registre d'armes (table optionnelle — ignoré si absente)
      results.push(await _upsert('Facture', factures));        // 11. factures (table optionnelle — ignoré si absente)
      results.push(await _upsert('Telegramme', telegrammes));  // 12. télégrammes (table optionnelle — ignoré si absente)
      results.push(await _upsert('InventaireItem', invItems)); // 13. stock du coffre commun (table optionnelle)
      results.push(await _upsert('InventaireMouvement', invMouv)); // 14. mouvements de stock (table optionnelle)
      results.push(await _upsert('Portefeuille', portefeuilles)); // 15. portefeuilles perso (table optionnelle)
      results.push(await _upsert('Transaction', transactions));    // 16. journal de trésorerie (table optionnelle)
      // Nettoyage des fantômes : membres partis (si roster connu), + entités supprimées localement.
      // ⚠️ On NE réconcilie PAS Rdv (préserve les demandes venues du site web).
      if (_membresActuels || _roster) { try { await _reconcilier('Membre', membres.map(m => m.id)); } catch {} }
      try { await _reconcilier('Contrat', contrats.map(c => c.id)); } catch {}
      try { await _reconcilier('Operation', operations.map(o => o.id)); } catch {}
      try { await _reconcilier('RapportInfo', rapports.map(r => r.id)); } catch {}
      try { await _reconcilier('Traque', traques.map(t => t.id)); } catch {}
      try { await _reconcilier('DossierMedical', dossiers.map(d => d.id)); } catch {}
      try { await _reconcilier('Contact', contacts.map(c => c.id)); } catch {}
      try { await _reconcilier('Arme', armes.map(a => a.id)); } catch {}
      try { await _reconcilier('Facture', factures.map(f => f.id)); } catch {}
      try { await _reconcilier('Telegramme', telegrammes.map(t => t.id)); } catch {}
      try { await _reconcilier('InventaireItem', invItems.map(i => i.id)); } catch {}
      try { await _reconcilier('Portefeuille', portefeuilles.map(w => w.id)); } catch {}
      try { await _reconcilier('Transaction', transactions.map(t => t.id)); } catch {}
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

// ═══════════════════════════════════════════════════════════════
//  Lecture (pull) — utilisé pour relever les demandes de RDV du site web
// ═══════════════════════════════════════════════════════════════
async function _get(pathAndQuery) {
  if (!estActif()) return null;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) { console.log(`⚠️ Supabase GET ${pathAndQuery}: HTTP ${res.status}`); return null; }
    return await res.json();
  } catch (e) { console.log(`⚠️ Supabase GET ${pathAndQuery}: ${e.message}`); return null; }
}

async function _patch(pathAndQuery, body) {
  if (!estActif()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      method: 'PATCH',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (e) { console.log(`⚠️ Supabase PATCH ${pathAndQuery}: ${e.message}`); return false; }
}

async function _del(pathAndQuery) {
  if (!estActif()) return false;
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, {
      method: 'DELETE',
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, Prefer: 'return=minimal' },
    });
    return res.ok;
  } catch (e) { console.log(`⚠️ Supabase DELETE ${pathAndQuery}: ${e.message}`); return false; }
}

// Supprime de Supabase les lignes d'une table dont l'ID n'est plus présent
// localement → la base reflète EXACTEMENT l'état actuel (plus de fantômes).
async function _reconcilier(table, idsGardes) {
  // Sécurité : ne jamais tout supprimer si la liste à garder est vide
  // (état transitoire suspect) — évite un vidage accidentel de la table.
  if (!Array.isArray(idsGardes) || idsGardes.length === 0) return 0;
  const enBase = await _get(`${table}?select=id`);
  if (!Array.isArray(enBase)) return 0;
  const garder = new Set(idsGardes.map(String));
  const aSupprimer = enBase.map(r => r && r.id).filter(id => id != null && !garder.has(String(id)));
  for (const id of aSupprimer) await _del(`${table}?id=eq.${encodeURIComponent(id)}`);
  if (aSupprimer.length) console.log(`🧹 Supabase ${table}: ${aSupprimer.length} obsolète(s) supprimé(s)`);
  return aSupprimer.length;
}

// Demandes de RDV « nouvelles » (créées par le site). On filtre la source côté
// bot (paiement.source === 'web') pour rester robuste. La table Rdv n'est
// alimentée que par le site aujourd'hui.
async function lireDemandesRdvWeb() {
  const rows = await _get('Rdv?statut=eq.nouveau&order=createdAt.asc&limit=25');
  if (!Array.isArray(rows)) return [];
  return rows.filter(r => r && r.paiement && r.paiement.source === 'web');
}

// Marque une demande comme transmise à Discord (évite de re-notifier).
async function marquerRdvTransmis(id) {
  return await _patch(`Rdv?id=eq.${encodeURIComponent(id)}`, { statut: 'transmis' });
}

// ── Demandes d'ajout de contact venues du site (table DemandeContact) ──
// Le site (espace interne) insère une fiche à créer ; le bot la relève, crée la
// vraie fiche (répertoire + forum Discord) puis la marque « cree ». La table est
// NEUVE et n'est jamais réconciliée → aucune donnée existante n'est touchée.
async function lireDemandesContactWeb() {
  const rows = await _get('DemandeContact?statut=eq.nouveau&order=createdAt.asc&limit=25');
  return Array.isArray(rows) ? rows : [];
}
async function marquerDemandeContactTraitee(id, contactId) {
  const body = { statut: 'cree' };
  if (contactId) body.contactId = String(contactId);
  let ok = await _patch(`DemandeContact?id=eq.${encodeURIComponent(id)}`, body);
  // Repli si la colonne contactId n'existe pas encore.
  if (!ok && contactId) ok = await _patch(`DemandeContact?id=eq.${encodeURIComponent(id)}`, { statut: 'cree' });
  return ok;
}
async function marquerDemandeContactEchec(id) {
  return await _patch(`DemandeContact?id=eq.${encodeURIComponent(id)}`, { statut: 'echec' });
}

// ── File de commandes venues du site (table CommandeWeb) ──
// Le site dépose des commandes (créer/modifier/supprimer) ; le bot les applique
// à data.json puis resynchronise. Table NEUVE, jamais réconciliée.
async function lireCommandesWeb() {
  const rows = await _get('CommandeWeb?statut=eq.nouveau&order=createdAt.asc&limit=50');
  return Array.isArray(rows) ? rows : [];
}
async function marquerCommandeWeb(id, statut, resultat) {
  const body = { statut };
  if (resultat != null) body.resultat = String(resultat).slice(0, 500);
  return await _patch(`CommandeWeb?id=eq.${encodeURIComponent(id)}`, body);
}

// ── Télégrammes envoyés depuis le site (table TelegrammeWeb) ──
async function lireTelegrammesWeb() {
  const rows = await _get('TelegrammeWeb?statut=eq.nouveau&order=createdAt.asc&limit=25');
  return Array.isArray(rows) ? rows : [];
}
async function marquerTelegrammeWebTransmis(id) {
  return await _patch(`TelegrammeWeb?id=eq.${encodeURIComponent(id)}`, { statut: 'transmis' });
}

module.exports = { estActif, syncAll, scheduleSync, setMembresActuels, setMembresRoster, lireDemandesRdvWeb, marquerRdvTransmis, lireDemandesContactWeb, marquerDemandeContactTraitee, marquerDemandeContactEchec, lireCommandesWeb, marquerCommandeWeb, lireTelegrammesWeb, marquerTelegrammeWebTransmis };
