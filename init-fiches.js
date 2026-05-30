// ═══════════════════════════════════════════════════════════════
// init-fiches.js — Initialisation des fiches personnages Notion
// Crée les fiches des membres existants qui n'en ont pas encore
// À exécuter UNE SEULE FOIS : node init-fiches.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const fs = require('fs');

const NOTION_TOKEN    = process.env.NOTION_TOKEN;
const NOTION_FICHES_DB = process.env.NOTION_FICHES_DB;
const DB_PATH         = './data.json';
const NOTION_VERSION  = '2022-06-28';

// ── Membres fondateurs — à compléter avec les vraies infos IC ──
const MEMBRES_FONDATEURS = [
  { nomPerso: 'Colt Kane',      agePerso: '—', metier: '—', pole: '⚖️ Légal',   dispos: '—', userId: '696325126047662081',  username: 'elromino' },
  { nomPerso: 'June McCall',    agePerso: '—', metier: '—', pole: '⚖️ Légal',   dispos: '—', userId: '998581854791798835',  username: 'dianalou34' },
  { nomPerso: 'Cyrus Hollow',   agePerso: '—', metier: '—', pole: '🔪 Illégal', dispos: '—', userId: '324627678143578112',  username: 'cyrus' },
  { nomPerso: 'Jonas Caverly',  agePerso: '—', metier: '—', pole: '⚖️ Légal',   dispos: '—', userId: '944208797084311583',  username: 'jonas' },
  { nomPerso: 'Thomas Galagan', agePerso: '—', metier: '—', pole: '⚖️ Légal',   dispos: '—', userId: '982201491773354035',  username: 'thomas' },
];

function today() { return new Date().toISOString().split('T')[0]; }

async function notionQuery(filter) {
  const res = await fetch(`https://api.notion.com/v1/databases/${NOTION_FICHES_DB}/query`, {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({ filter }),
  });
  const j = await res.json();
  return j.results || [];
}

async function creerFiche(membre) {
  // Vérifier si la fiche existe déjà
  const existing = await notionQuery({ property: 'Discord ID', rich_text: { equals: membre.userId } });
  if (existing.length > 0) {
    console.log(`⏭️  Fiche déjà existante : ${membre.nomPerso}`);
    return existing[0].id;
  }

  const res = await fetch('https://api.notion.com/v1/pages', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parent: { database_id: NOTION_FICHES_DB },
      properties: {
        'Personnage':             { title: [{ text: { content: membre.nomPerso } }] },
        'Âge':                    { rich_text: [{ text: { content: membre.agePerso || '—' } }] },
        'Pôle':                   { select: { name: membre.pole } },
        'Métier / Spécialité':    { rich_text: [{ text: { content: membre.metier || '—' } }] },
        'Disponibilités':         { rich_text: [{ text: { content: membre.dispos || '—' } }] },
        "Date d'entrée":          { date: { start: today() } },
        'Discord ID':             { rich_text: [{ text: { content: membre.userId } }] },
        'Discord Username':       { rich_text: [{ text: { content: membre.username || '—' } }] },
        'Statut fiche':           { select: { name: '🟡 À compléter' } },
        'Statut activité':        { select: { name: '✅ Actif' } },
        'Relations':              { rich_text: [{ text: { content: '' } }] },
        'Opérations participées': { rich_text: [{ text: { content: '' } }] },
        'Objectifs IC':           { rich_text: [{ text: { content: '' } }] },
      },
      children: [
        { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📖 Background' } }] } },
        { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: '— À compléter —' } }] } },
        { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '✍️ À compléter par le membre' } }] } },
        { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Apparence physique' } }] } },
        { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Relations / contacts dans la Compagnie' } }] } },
        { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Objectifs personnels IC' } }] } },
        { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Opérations marquantes' } }] } },
      ],
    }),
  });
  const j = await res.json();
  if (!res.ok) { console.log(`❌ Erreur pour ${membre.nomPerso}:`, j.message); return null; }
  console.log(`✅ Fiche créée : ${membre.nomPerso}`);

  // Sauvegarder le notionFicheId dans data.json
  if (j.id && fs.existsSync(DB_PATH)) {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    if (db.members[membre.userId]) {
      db.members[membre.userId].notionFicheId = j.id;
      fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
    }
  }
  return j.id;
}

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

(async () => {
  if (!NOTION_TOKEN)     { console.log('❌ NOTION_TOKEN manquant'); process.exit(1); }
  if (!NOTION_FICHES_DB) { console.log('❌ NOTION_FICHES_DB manquant'); process.exit(1); }

  console.log('🚀 Initialisation des fiches personnages...\n');

  // Créer les fiches des membres fondateurs
  for (const membre of MEMBRES_FONDATEURS) {
    await creerFiche(membre);
    await sleep(400); // Respecter le rate limit Notion
  }

  // Créer les fiches des membres dans data.json qui n'en ont pas
  if (fs.existsSync(DB_PATH)) {
    const db = JSON.parse(fs.readFileSync(DB_PATH, 'utf8'));
    const membres = Object.values(db.members || {}).filter(m =>
      m.status !== 'visiteur' && m.status !== 'parti' && !m.notionFicheId
    );

    if (membres.length > 0) {
      console.log(`\n📋 ${membres.length} membre(s) supplémentaire(s) trouvé(s) dans data.json...\n`);
      for (const m of membres) {
        await creerFiche({
          nomPerso:  m.name || m.username || '—',
          agePerso:  '—',
          metier:    '—',
          pole:      '⚖️ Légal',
          dispos:    '—',
          userId:    m.id,
          username:  m.name || '—',
        });
        await sleep(400);
      }
    }
  }

  console.log('\n✅ Initialisation terminée !');
  console.log('📌 Les fiches créées sont en statut "🟡 À compléter"');
  console.log('📌 Chaque membre doit compléter son background, apparence et relations dans Notion');
})();

