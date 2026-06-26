// ─────────────────────────────────────────────────────────────────────────────
//  bilan.js — Export « Google Sheet » (.xlsx) des VRAIES données du bot
//  Génère un classeur multi-onglets (Tableau de bord, Contrats, Argent,
//  Opérations, Traques, Répertoire, Membres) à partir de la base (db.js).
//  Aucune double saisie : c'est un instantané fidèle, à ouvrir dans Google Sheets.
// ─────────────────────────────────────────────────────────────────────────────
const ExcelJS = require('exceljs');

// Palette parchemin / encre (cohérente avec l'univers RP)
const C = {
  noir: 'FF2B2118', encre: 'FF4A3B2A', parch: 'FFF3E9D2', parch2: 'FFE8D8B5',
  legal: 'FF2E5A88', illegal: 'FF7A2E2E', or: 'FFB8860B', vert: 'FF1F6E43',
  gris: 'FF6B5D4A', blanc: 'FFFFFFFF',
};
const MONEY = '#,##0" $"';

// ── Tables de correspondance (codes internes → libellés lisibles) ──
const STATUT_CONTRAT = {
  en_attente: 'En attente', propose: 'Proposé', proposee: 'Proposé',
  accepte: 'Accepté', acceptee: 'Accepté', signe: 'Signé', signee: 'Signé',
  refuse: 'Refusé', refusee: 'Refusé', valide: 'Validé', validee: 'Validé',
  en_cours: 'En cours', honore: 'Honoré', termine: 'Terminé', termine_e: 'Terminé',
  cloture: 'Clôturé', annule: 'Annulé', annulee: 'Annulé', expire: 'Expiré',
};
const TYPE_CONTRAT = { offre: 'Offre client', confrerie: 'Confrérie', engagement: 'Engagement', mission: 'Mission' };
const STATUT_OP = { prep: 'Préparation', en_cours: 'En cours', actif: 'En cours', termine: 'Terminée', cloture: 'Clôturée', annule: 'Annulée' };
const STATUT_TRAQUE = { chasse: 'Ouvert', reperee: 'Repérée', capturee: 'Capturée', cloture: 'Clôturé', clos: 'Clôturé', abandon: 'Abandonné' };

const lib = (map, v) => map[String(v || '').toLowerCase()] || (v ? String(v) : '—');
const poleContrat = (c) => c?.pole === 'illegal' || c?.type === 'confrerie' || c?.cc ? 'Confrérie' : 'Compagnie';
const poleOp = (o) => (o?.pole === 'illegal' ? 'Confrérie' : 'Compagnie');
const dateCourte = (iso) => { if (!iso) return '—'; const s = String(iso); const m = s.match(/(\d{4})-(\d{2})-(\d{2})/); return m ? `${m[3]}/${m[2]}/${m[1]}` : s; };
const nomMembre = (db, id) => db?.members?.[id]?.name || (id ? String(id) : '—');

// ── Helpers de mise en forme ──
function setW(ws, arr) { arr.forEach((w, i) => ws.getColumn(i + 1).width = w); }
function paint(ws, rows, cols) {
  for (let r = 1; r <= rows; r++) for (let c = 1; c <= cols; c++) {
    const cell = ws.getCell(r, c);
    if (!cell.fill || !cell.fill.fgColor) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.parch } };
  }
}
function titre(ws, text, span, color) {
  const r = ws.addRow([text]); ws.mergeCells(r.number, 1, r.number, span);
  const c = r.getCell(1);
  c.font = { name: 'Georgia', size: 16, bold: true, color: { argb: C.blanc } };
  c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color || C.noir } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 };
  r.height = 30; return r;
}
function sous(ws, text, span) {
  const r = ws.addRow([text]); ws.mergeCells(r.number, 1, r.number, span);
  const c = r.getCell(1);
  c.font = { name: 'Georgia', italic: true, size: 10, color: { argb: C.gris } };
  c.alignment = { vertical: 'middle', horizontal: 'left', indent: 1 }; r.height = 18; return r;
}
function entetes(ws, headers, color) {
  const r = ws.addRow(headers);
  r.eachCell(c => {
    c.font = { bold: true, size: 11, color: { argb: C.blanc } };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: color || C.encre } };
    c.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    c.border = { bottom: { style: 'thin', color: { argb: C.noir } } };
  });
  r.height = 26; return r;
}
function ligne(ws, values, alt) {
  const r = ws.addRow(values);
  r.eachCell({ includeEmpty: true }, c => {
    c.font = { size: 10, color: { argb: C.encre } };
    c.alignment = { vertical: 'middle', horizontal: 'left', wrapText: true, indent: 1 };
    c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: alt ? C.parch : C.parch2 } };
    c.border = { bottom: { style: 'hair', color: { argb: C.parch2 } } };
  });
  r.height = 20; return r;
}
function moneyCol(ws, colIndex, fromRow) {
  ws.getColumn(colIndex).eachCell((c, n) => { if (n >= fromRow && typeof c.value === 'number') c.numFmt = MONEY; });
}

// ════════════════════════════════════════════════════════════════════════════
//  GÉNÉRATION DU CLASSEUR — renvoie un Buffer (.xlsx)
// ════════════════════════════════════════════════════════════════════════════
async function genererClasseur(db, guild) {
  db = db || {};
  const wb = new ExcelJS.Workbook();
  wb.creator = 'IWC Setup'; wb.created = new Date();

  const contrats = Array.isArray(db.contrats) ? db.contrats : [];
  const operations = [...(Array.isArray(db.preparations) ? db.preparations : []), ...(Array.isArray(db.operations) ? db.operations : [])];
  const traques = Array.isArray(db.traques) ? db.traques : [];
  const contacts = Array.isArray(db.repertoire?.contacts) ? db.repertoire.contacts : [];
  const membres = db.members && typeof db.members === 'object' ? Object.values(db.members) : [];
  const economie = db.economie && typeof db.economie === 'object' ? db.economie : {};
  const coffre = Number(db.coffre || 0) || ((db.coffres?.legal || 0) + (db.coffres?.illegal || 0));

  const totalComptes = Object.values(economie).reduce((s, w) => s + (Number(w?.solde) || 0), 0);
  const contratsEnCours = contrats.filter(c => ['en_cours', 'valide', 'validee', 'accepte', 'acceptee', 'signe'].includes(String(c.status || '').toLowerCase())).length;
  const opsEnCours = operations.filter(o => ['prep', 'en_cours', 'actif'].includes(String(o.status || '').toLowerCase())).length;
  const avisOuverts = traques.filter(t => ['chasse', 'reperee'].includes(String(t.status || '').toLowerCase())).length;
  const membresActifs = membres.filter(m => String(m.status || '').toLowerCase() === 'actif').length;

  // ── 1) TABLEAU DE BORD ──
  const d = wb.addWorksheet('🏠 Tableau de bord', { properties: { tabColor: { argb: C.or } }, views: [{ showGridLines: false }] });
  setW(d, [4, 32, 20, 6]);
  titre(d, '🐺  IRON WOLF COMPANY & LA CONFRÉRIE — BILAN', 4, C.noir);
  sous(d, `Instantané généré le ${new Date().toLocaleString('fr-FR')} — données réelles du bot.`, 4);
  d.addRow([]);
  const bloc = (label, color) => { const r = d.addRow(['', label, '', '']); d.mergeCells(r.number, 2, r.number, 4); r.getCell(2).font = { name: 'Georgia', bold: true, size: 13, color: { argb: color } }; r.height = 24; };
  const stat = (label, val, color, money) => {
    const r = d.addRow(['', label, val, '']);
    r.getCell(2).font = { size: 11, color: { argb: C.encre } };
    r.getCell(3).font = { bold: true, size: 13, color: { argb: color } };
    r.getCell(3).alignment = { horizontal: 'left', indent: 1 };
    if (money) r.getCell(3).numFmt = MONEY;
    r.height = 22;
  };
  bloc('💰 FINANCES', C.or);
  stat('Coffre commun (solde)', coffre, C.vert, true);
  stat('Total des comptes membres', totalComptes, C.vert, true);
  stat('Patrimoine total (coffre + comptes)', coffre + totalComptes, C.vert, true);
  d.addRow([]);
  bloc('📋 ACTIVITÉ', C.legal);
  stat('Contrats — total', contrats.length, C.legal);
  stat('Contrats — actifs', contratsEnCours, C.legal);
  stat('Opérations — total', operations.length, C.illegal);
  stat('Opérations — en cours', opsEnCours, C.illegal);
  stat('Avis de recherche — ouverts', avisOuverts, C.noir);
  stat('Contacts au répertoire', contacts.length, C.vert);
  stat('Membres — actifs', membresActifs, C.legal);
  d.addRow([]);
  sous(d, 'Relance /bilan quand tu veux pour régénérer un instantané à jour.', 4);
  d.views = [{ state: 'frozen', ySplit: 2, showGridLines: false }];
  paint(d, d.rowCount + 4, 4);

  // ── 2) CONTRATS ──
  const ct = wb.addWorksheet('📜 Contrats', { properties: { tabColor: { argb: C.legal } }, views: [{ showGridLines: false }] });
  setW(ct, [16, 12, 16, 14, 28, 24, 16, 14, 16]);
  titre(ct, '📜  REGISTRE DES CONTRATS', 9, C.legal);
  sous(ct, 'Offres clients, engagements et contrats de la Confrérie.', 9);
  entetes(ct, ['ID', 'Date', 'Type', 'Pôle', 'Client / Cible', 'Objet / Mission', 'Rémunération', 'Statut', 'Opération liée'], C.legal);
  if (!contrats.length) ligne(ct, ['—', '—', '—', '—', 'Aucun contrat pour le moment', '', '', '', ''], true);
  contrats.forEach((c, i) => ligne(ct, [
    c.id || '—', dateCourte(c.createdAt), lib(TYPE_CONTRAT, c.type), poleContrat(c),
    c.clientNom || c.commanditaire || (c.confidentiel ? 'Anonyme' : '—'),
    c.objet || c.typeMission || '—', c.remuneration || c.prime || '—',
    lib(STATUT_CONTRAT, c.status), c.operationId || '—',
  ], i % 2 === 0));
  ct.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  paint(ct, ct.rowCount + 2, 9);

  // ── 3) ARGENT ──
  const ar = wb.addWorksheet('💰 Argent', { properties: { tabColor: { argb: C.or } }, views: [{ showGridLines: false }] });
  setW(ar, [28, 18, 6, 26, 16, 18]);
  titre(ar, '💰  ARGENT — COFFRE & COMPTES', 6, C.or);
  sous(ar, 'Coffre commun et portefeuilles RP des membres (instantané).', 6);
  const hdr = ar.addRow(['🏦 Coffre commun', coffre, '', '👤 Comptes des membres', '', '']);
  hdr.getCell(1).font = { name: 'Georgia', bold: true, size: 12, color: { argb: C.or } };
  hdr.getCell(2).font = { bold: true, size: 16, color: { argb: C.vert } }; hdr.getCell(2).numFmt = MONEY;
  hdr.getCell(4).font = { name: 'Georgia', bold: true, size: 12, color: { argb: C.vert } };
  ar.mergeCells(hdr.number, 4, hdr.number, 5); hdr.height = 26;
  const sub = ar.addRow(['', '', '', 'Membre', 'Solde', 'Dernier mouvement']);
  [4, 5, 6].forEach(n => { const c = sub.getCell(n); c.font = { bold: true, size: 10, color: { argb: C.blanc } }; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: C.encre } }; c.alignment = { horizontal: 'center' }; });
  sub.height = 22;
  const ids = Object.keys(economie);
  const lignesArgent = ids.length ? ids : [];
  if (!lignesArgent.length) { const r = ar.addRow(['', '', '', 'Aucun compte crédité', 0, '—']); r.getCell(4).font = { italic: true, size: 10, color: { argb: C.gris } }; r.getCell(5).numFmt = MONEY; }
  lignesArgent.forEach((id, i) => {
    const w = economie[id] || {};
    const last = Array.isArray(w.historique) && w.historique.length ? w.historique[w.historique.length - 1] : null;
    const lastTxt = last ? `${last.montant >= 0 ? '+' : ''}${last.montant} — ${last.raison || ''}` : '—';
    const r = ar.addRow(['', '', '', nomMembre(db, id), Number(w.solde) || 0, lastTxt]);
    r.eachCell({ includeEmpty: true }, (c, n) => {
      c.font = { size: 10, color: { argb: C.encre } };
      c.alignment = { horizontal: n === 5 ? 'right' : 'left', indent: 1, wrapText: true };
      c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: i % 2 ? C.parch : C.parch2 } };
    });
    r.getCell(5).numFmt = MONEY; r.height = 20;
  });
  ar.views = [{ state: 'frozen', ySplit: 4, showGridLines: false }];
  paint(ar, ar.rowCount + 2, 6);

  // ── 4) OPÉRATIONS ──
  const op = wb.addWorksheet('🎯 Opérations', { properties: { tabColor: { argb: C.illegal } }, views: [{ showGridLines: false }] });
  setW(op, [16, 16, 22, 14, 30, 14, 26, 16]);
  titre(op, '🎯  OPÉRATIONS PAR ÉTAPES', 8, C.illegal);
  sous(op, 'Chaque opération naît d\'un contrat. Avancement = étapes validées / total.', 8);
  entetes(op, ['ID', 'Contrat', 'Catégorie', 'Pôle', 'Objectif', 'Avancement', 'Assignés', 'Statut'], C.illegal);
  if (!operations.length) ligne(op, ['—', '—', '—', '—', 'Aucune opération', '', '', ''], true);
  operations.forEach((o, i) => {
    const et = Array.isArray(o.etapes) ? o.etapes : [];
    const done = et.filter(e => e && e.valide).length;
    const assignes = [...new Set([...(o.membres || []), ...(o.agents || [])])].map(id => nomMembre(db, id)).join(', ') || '—';
    ligne(op, [
      o.id || '—', o.contratId || '—', o.categorie || '—', poleOp(o),
      o.cible || '—', et.length ? `${done}/${et.length}` : '—', assignes, lib(STATUT_OP, o.status),
    ], i % 2 === 0);
  });
  op.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  paint(op, op.rowCount + 2, 8);

  // ── 5) TRAQUES / AVIS DE RECHERCHE ──
  const tr = wb.addWorksheet('🔎 Traques', { properties: { tabColor: { argb: C.noir } }, views: [{ showGridLines: false }] });
  setW(tr, [14, 24, 16, 22, 16, 26, 14, 14]);
  titre(tr, '🔎  AVIS DE RECHERCHE / TRAQUES', 8, C.noir);
  sous(tr, 'Cibles recherchées, primes et chasseurs assignés.', 8);
  entetes(tr, ['ID', 'Cible', 'Dangerosité', 'Dernier lieu', 'Prime', 'Chasseurs', 'Date', 'Statut'], C.noir);
  if (!traques.length) ligne(tr, ['—', 'Aucun avis', '—', '—', '—', '', '', ''], true);
  traques.forEach((t, i) => {
    const chasseurs = (Array.isArray(t.chasseurs) ? t.chasseurs : []).map(x => x?.nom || nomMembre(db, x?.id || x)).join(', ') || '—';
    ligne(tr, [
      t.id || '—', t.cible || '—', t.dangerosite || '—', t.position || '—',
      t.prime || '—', chasseurs, dateCourte(t.createdAt), lib(STATUT_TRAQUE, t.status),
    ], i % 2 === 0);
  });
  tr.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  paint(tr, tr.rowCount + 2, 8);

  // ── 6) RÉPERTOIRE ──
  const rp = wb.addWorksheet('📇 Répertoire', { properties: { tabColor: { argb: C.vert } }, views: [{ showGridLines: false }] });
  setW(rp, [22, 18, 22, 18, 30, 12]);
  titre(rp, '📇  RÉPERTOIRE DES CONTACTS', 6, C.vert);
  sous(rp, 'Contacts validés : télégramme, métier, affiliation, relations.', 6);
  entetes(rp, ['Nom / Surnom', 'Télégramme', 'Métier', 'Affiliation', 'Relation / Notes', 'Fiabilité'], C.vert);
  if (!contacts.length) ligne(rp, ['Aucun contact', '—', '—', '—', '', ''], true);
  contacts.forEach((c, i) => ligne(rp, [
    c.nom || c.nomsurnom || '—', c.telegramme || '—', c.metier || '—',
    c.affiliation || c.type || '—',
    [c.relation, c.notes].filter(Boolean).join(' — ') || '—',
    c.fiabilite ? '⭐'.repeat(Math.min(5, Number(c.fiabilite) || 0)) : '—',
  ], i % 2 === 0));
  rp.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  paint(rp, rp.rowCount + 2, 6);

  // ── 7) MEMBRES ──
  const mb = wb.addWorksheet('👥 Membres', { properties: { tabColor: { argb: C.legal } }, views: [{ showGridLines: false }] });
  setW(mb, [24, 28, 14, 12, 16]);
  titre(mb, '👥  MEMBRES DE L\'ORGANISATION', 5, C.legal);
  sous(mb, 'Pôle : Compagnie (légal) / Confrérie (illégal).', 5);
  entetes(mb, ['Nom RP', 'Rang', 'Pôle', 'Statut', 'Arrivée'], C.legal);
  if (!membres.length) ligne(mb, ['Aucun membre', '—', '—', '—', '—'], true);
  membres.forEach((m, i) => ligne(mb, [
    m.name || '—', m.rang || '—',
    m.pole === 'illegal' ? 'Confrérie' : (m.pole === 'legal' ? 'Compagnie' : '—'),
    m.status || '—', dateCourte(m.joinedAt),
  ], i % 2 === 0));
  mb.views = [{ state: 'frozen', ySplit: 3, showGridLines: false }];
  paint(mb, mb.rowCount + 2, 5);

  return await wb.xlsx.writeBuffer();
}

module.exports = { genererClasseur };
