// ═══════════════════════════════════════════════════════════════
// notion-extra.js — Extensions Notion pour iwc-bot
// Module 100% autonome. Aucune fonction ne fait planter le bot :
// si un token / ID de base manque, la fonction log et s'arrête.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');

const DB_PATH = './data.json';
const NOTION_VERSION = '2022-06-28';

// IDs des bases Notion (depuis les variables d'environnement)
const DBS = {
  STATS:      process.env.NOTION_STATS_DB,
  FICHES:     process.env.NOTION_FICHES_DB,
  TRESORERIE: process.env.NOTION_TRESORERIE_DB,
  CONTRATS:   process.env.NOTION_CONTRATS_DB,
  OPERATIONS: process.env.NOTION_OPERATIONS_DB,
};

// ---- Helpers internes (copies autonomes, zéro couplage avec index.js) ----
function fmtShort(d) {
  return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { members: {}, operations: [], sessions: [], candidatures: [], contrats: [] }; }
}
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}

async function notionCreate(databaseId, properties, children) {
  if (!process.env.NOTION_TOKEN) { console.log('⚠️ NOTION_TOKEN manquant'); return null; }
  if (!databaseId) { console.log('⚠️ ID de base Notion manquant (vérifie tes variables d\'env)'); return null; }
  const body = { parent: { database_id: databaseId }, properties };
  if (children) body.children = children;
  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await res.json();
  if (!res.ok) { console.log('❌ Notion CREATE échec:', JSON.stringify(j)); return null; }
  return j;
}

async function notionPatch(pageId, properties) {
  if (!process.env.NOTION_TOKEN || !pageId) return null;
  const res = await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ properties }),
  });
  const j = await res.json();
  if (!res.ok) { console.log('❌ Notion PATCH échec:', JSON.stringify(j)); return null; }
  return j;
}

// ═══════════════════════════════════════════════════════════════
// 1. STATS HEBDO — auto-suffisant : lit data.json, écrit Notion + Discord
// ═══════════════════════════════════════════════════════════════
async function postStatsHebdo(guild) {
  try {
    const db = loadDB();
    const weekAgo = Date.now() - 7 * 86400000;
    const inWeek = d => d && new Date(d).getTime() >= weekAgo;
    const stats = {
      recrues:      (db.candidatures || []).filter(c => c.status === 'acceptee' && inWeek(c.acceptedAt)).length,
      candidatures: (db.candidatures || []).filter(c => inWeek(c.receivedAt)).length,
      contrats:     (db.contrats || []).filter(c => c.status === 'signe' && inWeek(c.signedAt)).length,
      operations:   (db.operations || []).filter(o => o.status === 'terminee' && inWeek(o.endedAt)).length,
      nouveaux:     Object.values(db.members || {}).filter(m => inWeek(m.joinedAt)).length,
      departs:      Object.values(db.members || {}).filter(m => m.status === 'parti' && inWeek(m.leftAt)).length,
    };
    const semaine = `${fmtShort(new Date(weekAgo))} → ${fmtShort(new Date())}`;
    await notionCreate(DBS.STATS, {
      'Semaine':            { title: [{ text: { content: semaine } }] },
      'Date':               { date: { start: new Date().toISOString().split('T')[0] } },
      'Recrues':            { number: stats.recrues },
      'Candidatures':       { number: stats.candidatures },
      'Contrats signés':    { number: stats.contrats },
      'Opérations menées':  { number: stats.operations },
      'Nouveaux arrivants': { number: stats.nouveaux },
      'Départs':            { number: stats.departs },
    });
    const ch = getCh(guild, 'annonces', 'dashboard', 'logs');
    if (ch) await ch.send({ embeds: [new EmbedBuilder().setColor(0x8B1A1A)
      .setTitle(`📊 Bilan de la semaine — ${semaine}`)
      .addFields(
        { name: '🆕 Arrivants', value: String(stats.nouveaux), inline: true },
        { name: '📥 Candidatures', value: String(stats.candidatures), inline: true },
        { name: '✅ Recrues', value: String(stats.recrues), inline: true },
        { name: '📜 Contrats signés', value: String(stats.contrats), inline: true },
        { name: '🎯 Opérations', value: String(stats.operations), inline: true },
        { name: '🚪 Départs', value: String(stats.departs), inline: true },
      ).setFooter({ text: 'IWC • Bilan hebdomadaire automatique' })] });
    console.log('✅ Stats hebdo publiées');
  } catch (e) { console.log('❌ Stats hebdo error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 2. FICHE PERSONNAGE — appelée à l'acceptation d'une candidature
// ═══════════════════════════════════════════════════════════════
async function creerFichePersonnageNotion(cand) {
  try {
    const metierSpe = cand.type === 'illegal' ? (cand.specialite || '—') : (cand.metier || '—');
    await notionCreate(DBS.FICHES, {
      'Personnage':          { title: [{ text: { content: cand.nomPerso || '—' } }] },
      'Âge':                 { rich_text: [{ text: { content: cand.agePerso || '—' } }] },
      'Pôle':                { select: { name: cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal' } },
      'Métier / Spécialité': { rich_text: [{ text: { content: metierSpe } }] },
      'Disponibilités':      { rich_text: [{ text: { content: cand.dispos || '—' } }] },
    }, [
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📖 Background' } }] } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: (cand.background || '—').slice(0, 2000) } }] } },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '✍️ À compléter par le membre' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Apparence physique' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Relations / contacts' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Objectifs personnels' } }] } },
    ]);
    console.log(`✅ Fiche personnage créée : ${cand.nomPerso}`);
  } catch (e) { console.log('❌ Fiche perso error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 3. TRÉSORERIE — reçoit une transaction déjà calculée par index.js
// ═══════════════════════════════════════════════════════════════
async function enregistrerTransactionNotion(tx) {
  try {
    await notionCreate(DBS.TRESORERIE, {
      'Objet':       { title: [{ text: { content: tx.objet || '—' } }] },
      'Date':        { date: { start: new Date().toISOString().split('T')[0] } },
      'Type':        { select: { name: tx.type } },
      'Coffre':      { select: { name: tx.coffre } },
      'Montant':     { number: tx.montant },
      'Responsable': { rich_text: [{ text: { content: tx.responsable || '—' } }] },
      'Solde':       { number: tx.solde },
    });
  } catch (e) { console.log('❌ Trésorerie error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 4. CALENDRIER CONTRATS — appelée à la signature d'un contrat
// ═══════════════════════════════════════════════════════════════
async function ajouterContratNotion(contrat) {
  try {
    const partenaire = contrat.type === 'emploi' ? (contrat.employeurNom || '—') : (contrat.clientNom || '—');
    await notionCreate(DBS.CONTRATS, {
      'Référence':    { title: [{ text: { content: contrat.id } }] },
      'Objet':        { rich_text: [{ text: { content: contrat.objet || '—' } }] },
      'Type':         { select: { name: contrat.type === 'emploi' ? '📥 Employeur' : '📤 Prestation' } },
      'Partenaire':   { rich_text: [{ text: { content: partenaire } }] },
      'Rémunération': { rich_text: [{ text: { content: contrat.remuneration || '—' } }] },
      'Statut':       { select: { name: '✅ Actif' } },
      'Date début':   { date: { start: new Date().toISOString().split('T')[0] } },
    });
    console.log(`✅ Contrat ${contrat.id} ajouté au calendrier Notion`);
  } catch (e) { console.log('❌ Contrat Notion error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 5. OPÉRATIONS — création (renvoie l'ID de page) + mise à jour
// ═══════════════════════════════════════════════════════════════
const OP_STATUT = { preparation: '🟡 Préparation', en_cours: '🟢 En cours', terminee: '✅ Terminée', annulee: '❌ Annulée' };

async function creerOperationNotion(op) {
  try {
    const j = await notionCreate(DBS.OPERATIONS, {
      'Nom':      { title: [{ text: { content: op.name || '—' } }] },
      'Lieu IC':  { rich_text: [{ text: { content: op.lieu || '—' } }] },
      'Objectif': { rich_text: [{ text: { content: op.objectif || '—' } }] },
      'Notes':    { rich_text: [{ text: { content: op.equipe ? `Équipe : ${op.equipe}` : '—' } }] },
      'Statut':   { select: { name: OP_STATUT[op.status] || '🟡 Préparation' } },
    });
    if (j) { console.log(`✅ Opération "${op.name}" ajoutée à Notion`); return j.id; }
    return null;
  } catch (e) { console.log('❌ Opération Notion error:', e.message); return null; }
}

async function majOperationNotion(op) {
  try {
    if (!op.notionPageId) return;
    const props = { 'Statut': { select: { name: OP_STATUT[op.status] || op.status } } };
    if (op.endedAt) props['Date fin'] = { date: { start: new Date(op.endedAt).toISOString().split('T')[0] } };
    await notionPatch(op.notionPageId, props);
    console.log(`✅ Opération "${op.name}" mise à jour (${op.status})`);
  } catch (e) { console.log('❌ MAJ opération error:', e.message); }
}

module.exports = {
  postStatsHebdo,
  creerFichePersonnageNotion,
  enregistrerTransactionNotion,
  ajouterContratNotion,
  creerOperationNotion,
  majOperationNotion,
};

