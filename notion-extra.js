// ═══════════════════════════════════════════════════════════════
// notion-extra.js — Extensions Notion pour iwc-bot
// Module 100% autonome. Aucune fonction ne fait planter le bot.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ChannelType } = require('discord.js');
const fs = require('fs');

const DB_PATH = './data.json';
const NOTION_VERSION = '2022-06-28';

const DBS = {
  STATS:      process.env.NOTION_STATS_DB,
  FICHES:     process.env.NOTION_FICHES_DB,
  TRESORERIE: process.env.NOTION_TRESORERIE_DB,
  CONTRATS:   process.env.NOTION_CONTRATS_DB,
  OPERATIONS: process.env.NOTION_OPERATIONS_DB,
};

function fmtShort(d) {
  return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function loadDB() {
  try { return JSON.parse(fs.readFileSync(DB_PATH, 'utf8')); }
  catch { return { members: {}, operations: [], sessions: [], candidatures: [], contrats: [], coffres: { legal: 0, illegal: 0 } }; }
}
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c => c.type === ChannelType.GuildText && clean(c.name).includes(clean(name)));
    if (ch) return ch;
  }
  return null;
}
function getMention(guild) {
  return guild.roles.cache
    .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
    .map(r => `<@&${r.id}>`).join(' ') || '';
}

function checkNotionReady(fnName, dbKey) {
  if (!process.env.NOTION_TOKEN) { console.log(`⚠️ [${fnName}] NOTION_TOKEN manquant`); return false; }
  if (!DBS[dbKey]) { console.log(`⚠️ [${fnName}] Variable d'env NOTION_${dbKey}_DB manquante`); return false; }
  return true;
}

async function notionCreate(databaseId, properties, children) {
  if (!process.env.NOTION_TOKEN) { console.log('⚠️ NOTION_TOKEN manquant'); return null; }
  if (!databaseId) { console.log('⚠️ ID de base Notion manquant'); return null; }
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

async function notionQuery(dbId, filter = {}, sorts = []) {
  if (!process.env.NOTION_TOKEN || !dbId) return [];
  try {
    const body = { sorts };
    if (Object.keys(filter).length) body.filter = filter;
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const j = await res.json();
    return j.results || [];
  } catch { return []; }
}

async function notionFindByText(dbId, propName, value) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  try {
    const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.NOTION_TOKEN}`, 'Notion-Version': NOTION_VERSION, 'Content-Type': 'application/json' },
      body: JSON.stringify({ filter: { property: propName, rich_text: { equals: value } } }),
    });
    const j = await res.json();
    return j.results?.[0]?.id || null;
  } catch { return null; }
}

// ═══════════════════════════════════════════════════════════════
// 1. STATS HEBDO
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
      soldeLegal:   db.coffres?.legal   || 0,
      soldeIlleg:   db.coffres?.illegal || 0,
    };

    const opsDetail = (db.operations || [])
      .filter(o => o.status === 'terminee' && inWeek(o.endedAt))
      .map(o => `→ *${o.name}* — ${o.resultat || '—'}`)
      .join('\n') || '*Aucune*';

    const contratsDetail = (db.contrats || [])
      .filter(c => c.status === 'signe' && inWeek(c.signedAt))
      .map(c => `→ \`${c.id}\` — ${c.objet}`)
      .join('\n') || '*Aucun*';

    const semaine = `${fmtShort(new Date(weekAgo))} → ${fmtShort(new Date())}`;

    if (checkNotionReady('postStatsHebdo', 'STATS')) {
      await notionCreate(DBS.STATS, {
        'Semaine':            { title: [{ text: { content: semaine } }] },
        'Date':               { date: { start: new Date().toISOString().split('T')[0] } },
        'Recrues':            { number: stats.recrues },
        'Candidatures':       { number: stats.candidatures },
        'Contrats signés':    { number: stats.contrats },
        'Opérations menées':  { number: stats.operations },
        'Nouveaux arrivants': { number: stats.nouveaux },
        'Départs':            { number: stats.departs },
        'Solde légal':        { number: stats.soldeLegal },
        'Solde illégal':      { number: stats.soldeIlleg },
      });
    }

    const ch = getCh(guild, 'planning-sessions', 'agenda', 'planning', 'annonces-generales', 'annonces', 'dashboard', 'logs');
    if (ch) {
      await ch.send({ embeds: [new EmbedBuilder()
        .setColor(0x8B1A1A)
        .setTitle('📊 Bilan de la semaine — Iron Wolf Company')
        .setDescription(`*${semaine}*\n*La meute avance. Voici le bilan de la semaine.*`)
        .addFields(
          { name: '👥 MEMBRES',       value: [`🆕 Arrivants : **${stats.nouveaux}**`, `🚪 Départs : **${stats.departs}**`].join('\n'), inline: true },
          { name: '📋 RECRUTEMENT',   value: [`📥 Candidatures : **${stats.candidatures}**`, `✅ Recrues : **${stats.recrues}**`].join('\n'), inline: true },
          { name: '💰 TRÉSORERIE',    value: [`⚖️ Légal : **$${stats.soldeLegal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${stats.soldeIlleg.toLocaleString('fr-FR')}**`].join('\n'), inline: true },
          { name: `🎯 OPÉRATIONS (${stats.operations})`, value: opsDetail },
          { name: `📜 CONTRATS (${stats.contrats})`,     value: contratsDetail },
        )
        .setFooter({ text: 'IWC • Bilan hebdomadaire automatique' })
      ] });
    }
    console.log('✅ Stats hebdo publiées');
  } catch (e) { console.log('❌ Stats hebdo error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 2. FICHE PERSONNAGE — complète avec tous les nouveaux champs
// ═══════════════════════════════════════════════════════════════
async function creerFichePersonnageNotion(cand) {
  if (!checkNotionReady('creerFichePersonnageNotion', 'FICHES')) return;
  try {
    const metierSpe = cand.type === 'illegal' ? (cand.specialite || '—') : (cand.metier || '—');
    const pole = cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal';

    const page = await notionCreate(DBS.FICHES, {
      'Personnage':             { title: [{ text: { content: cand.nomPerso || '—' } }] },
      'Âge':                    { rich_text: [{ text: { content: cand.agePerso || '—' } }] },
      'Pôle':                   { select: { name: pole } },
      'Métier / Spécialité':    { rich_text: [{ text: { content: metierSpe } }] },
      'Disponibilités':         { rich_text: [{ text: { content: cand.dispos || '—' } }] },
      "Date d'entrée":          { date: { start: new Date().toISOString().split('T')[0] } },
      'Discord ID':             { rich_text: [{ text: { content: cand.userId || '—' } }] },
      'Discord Username':       { rich_text: [{ text: { content: cand.username || '—' } }] },
      'Statut fiche':           { select: { name: '🟡 À compléter' } },
      'Statut activité':        { select: { name: '✅ Actif' } },
      'Relations':              { rich_text: [{ text: { content: '' } }] },
      'Opérations participées': { rich_text: [{ text: { content: '' } }] },
      'Objectifs IC':           { rich_text: [{ text: { content: '' } }] },
    }, [
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '📖 Background' } }] } },
      { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: (cand.background || '—').slice(0, 2000) } }] } },
      { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: '✍️ À compléter par le membre' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Apparence physique' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Relations / contacts dans la Compagnie' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Objectifs personnels IC' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Opérations marquantes' } }] } },
    ]);

    // Stocker l'ID de la page Notion dans data.json pour les mises à jour futures
    if (page?.id && cand.userId) {
      const db = loadDB();
      if (db.members[cand.userId]) {
        db.members[cand.userId].notionFicheId = page.id;
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      }
    }

    console.log(`✅ Fiche personnage créée : ${cand.nomPerso}`);
    return page?.id || null;
  } catch (e) { console.log('❌ Fiche perso error:', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════════
// 3. STATUT ACTIVITÉ — mise à jour automatique
// Appelé depuis index.js quand absence/retour détecté
// ═══════════════════════════════════════════════════════════════
async function majStatutActiviteNotion(userId, statut) {
  if (!checkNotionReady('majStatutActiviteNotion', 'FICHES')) return;
  try {
    // Retrouver la page via Discord ID
    let pageId = null;
    const db = loadDB();
    if (db.members[userId]?.notionFicheId) {
      pageId = db.members[userId].notionFicheId;
    } else {
      pageId = await notionFindByText(DBS.FICHES, 'Discord ID', userId);
      if (pageId && db.members[userId]) {
        db.members[userId].notionFicheId = pageId;
        fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
      }
    }
    if (!pageId) return;

    const statutLabel = statut === 'absent' ? '⚠️ Absent' : statut === 'inactif' ? '💤 Inactif' : '✅ Actif';
    await notionPatch(pageId, { 'Statut activité': { select: { name: statutLabel } } });
    console.log(`✅ Statut activité mis à jour : ${userId} → ${statutLabel}`);
  } catch (e) { console.log('❌ majStatutActivite error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 4. OPÉRATIONS PARTICIPÉES — mise à jour automatique
// Appelé quand une opération est terminée
// ═══════════════════════════════════════════════════════════════
async function majOperationsParticipees(op) {
  if (!checkNotionReady('majOperationsParticipees', 'FICHES')) return;
  if (!op.participants || op.participants.length === 0) return;

  // Map Nom IC → Discord ID
  const MEMBRES_MAP = {
    'Colt Kane':      '696325126047662081',
    'June McCall':    '998581854791798835',
    'Cyrus Hollow':   '324627678143578112',
    'Jonas Caverly':  '944208797084311583',
    'Thomas Galagan': '982201491773354035',
  };

  try {
    for (const nomParticipant of op.participants) {
      const discordId = MEMBRES_MAP[nomParticipant];
      if (!discordId) continue;

      // Retrouver la page Notion du membre
      const db = loadDB();
      let pageId = db.members[discordId]?.notionFicheId;
      if (!pageId) {
        pageId = await notionFindByText(DBS.FICHES, 'Discord ID', discordId);
        if (pageId && db.members[discordId]) {
          db.members[discordId].notionFicheId = pageId;
          fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
        }
      }
      if (!pageId) continue;

      // Récupérer les opérations existantes et ajouter la nouvelle
      const pages = await notionQuery(DBS.FICHES, { property: 'Discord ID', rich_text: { equals: discordId } });
      const existant = pages[0]?.properties['Opérations participées']?.rich_text?.[0]?.plain_text || '';
      const nouveau = existant ? `${existant}\n→ ${op.name} (${fmtShort(new Date())}) — ${op.resultat || '—'}` : `→ ${op.name} (${fmtShort(new Date())}) — ${op.resultat || '—'}`;

      await notionPatch(pageId, {
        'Opérations participées': { rich_text: [{ text: { content: nouveau.slice(0, 2000) } }] }
      });
      console.log(`✅ Opérations participées MàJ : ${nomParticipant}`);
    }
  } catch (e) { console.log('❌ majOperationsParticipees error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 5. RAPPEL DM — 48h après acceptation
// Appelé depuis index.js avec un setTimeout
// ═══════════════════════════════════════════════════════════════
async function envoyerRappelFiche(guild, cand) {
  try {
    await new Promise(r => setTimeout(r, 48 * 3600000)); // 48h
    const member = await guild.members.fetch(cand.userId).catch(() => null);
    if (!member) return;
    await member.send({ embeds: [new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('📋 Rappel — Ta fiche personnage')
      .setDescription(`Bienvenue dans la Compagnie, **${cand.nomPerso}** !\n\nTa fiche personnage a été créée dans Notion. Il te reste à compléter :\n\n→ **Apparence physique**\n→ **Relations / contacts**\n→ **Objectifs IC**\n\n*Contacte la Direction pour obtenir le lien.*\n— La Direction`)
      .setFooter({ text: 'IWC • Rappel automatique 48h' })
    ] });
    console.log(`✅ Rappel fiche envoyé à ${cand.nomPerso}`);
  } catch (e) { console.log('❌ Rappel fiche error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 6. ALERTE FICHE COMPLÉTÉE — check toutes les heures
// Vérifie si des fiches sont passées de "À compléter" à "Complète"
// ═══════════════════════════════════════════════════════════════
async function checkFichesCompletees(guild) {
  if (!checkNotionReady('checkFichesCompletees', 'FICHES')) return;
  try {
    const pages = await notionQuery(DBS.FICHES, {
      property: 'Statut fiche',
      select: { equals: '✅ Complète' }
    });

    const db = loadDB();
    if (!db.fichesCompleteesNotifiees) db.fichesCompleteesNotifiees = [];

    const nouvelles = pages.filter(p => !db.fichesCompleteesNotifiees.includes(p.id));
    if (nouvelles.length === 0) return;

    const logsCh = await guild.channels.cache.find(c => c.name?.includes('logs') || c.name?.includes('direction'));
    if (!logsCh) return;

    for (const page of nouvelles) {
      const nom = page.properties['Personnage']?.title?.[0]?.plain_text || '—';
      const discordId = page.properties['Discord ID']?.rich_text?.[0]?.plain_text;
      await logsCh.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle('✅ Fiche complétée — ' + nom)
        .setDescription(`**${nom}** vient de compléter sa fiche personnage dans Notion.${discordId ? `\n\n<@${discordId}>` : ''}`)
        .setFooter({ text: 'IWC • Notification automatique' })
      ] });
      db.fichesCompleteesNotifiees.push(page.id);
    }
    fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
  } catch (e) { console.log('❌ checkFichesCompletees error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 7. TRÉSORERIE
// ═══════════════════════════════════════════════════════════════
async function enregistrerTransactionNotion(tx) {
  if (!checkNotionReady('enregistrerTransactionNotion', 'TRESORERIE')) return;
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
// 8. CONTRATS
// ═══════════════════════════════════════════════════════════════
async function ajouterContratNotion(contrat) {
  if (!checkNotionReady('ajouterContratNotion', 'CONTRATS')) return;
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
      'Signé par':    { rich_text: [{ text: { content: contrat.signedBy || contrat.signataire || '—' } }] },
    });
    console.log(`✅ Contrat ${contrat.id} ajouté au calendrier Notion`);
  } catch (e) { console.log('❌ Contrat Notion error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// 9. OPÉRATIONS
// ═══════════════════════════════════════════════════════════════
const OP_STATUT = {
  preparation: '🟡 Préparation',
  en_cours:    '🟢 En cours',
  terminee:    '✅ Terminée',
  annulee:     '❌ Annulée',
};

async function creerOperationNotion(op) {
  if (!checkNotionReady('creerOperationNotion', 'OPERATIONS')) return null;
  try {
    const j = await notionCreate(DBS.OPERATIONS, {
      'Nom':          { title: [{ text: { content: op.name || '—' } }] },
      'Lieu IC':      { rich_text: [{ text: { content: op.lieu || '—' } }] },
      'Objectif':     { rich_text: [{ text: { content: op.objectif || '—' } }] },
      'Pôle':         { select: { name: op.pole === 'legal' ? '⚖️ Légal' : '🔪 Illégal' } },
      'Participants': { rich_text: [{ text: { content: (op.participants || []).join(', ') || '—' } }] },
      'Notes':        { rich_text: [{ text: { content: op.equipe ? `Équipe : ${op.equipe}` : '—' } }] },
      'Statut':       { select: { name: OP_STATUT[op.status] || '🟡 Préparation' } },
      'ID Discord':   { rich_text: [{ text: { content: op.id || '—' } }] },
    });
    if (j) { console.log(`✅ Opération "${op.name}" ajoutée à Notion`); return j.id; }
    return null;
  } catch (e) { console.log('❌ Opération Notion error:', e.message); return null; }
}

async function majOperationNotion(op) {
  if (!checkNotionReady('majOperationNotion', 'OPERATIONS')) return;
  try {
    if (!op.notionPageId && op.id) {
      op.notionPageId = await notionFindByText(DBS.OPERATIONS, 'ID Discord', op.id);
      if (!op.notionPageId) { console.log(`⚠️ majOperationNotion : page introuvable pour ${op.id}`); return; }
    }
    const props = {
      'Statut':       { select: { name: OP_STATUT[op.status] || op.status } },
      'Participants': { rich_text: [{ text: { content: (op.participants || []).join(', ') || '—' } }] },
    };
    if (op.endedAt)  props['Date fin']  = { date: { start: new Date(op.endedAt).toISOString().split('T')[0] } };
    if (op.resultat) {
      const resTxt = [op.resultat, op.butin && op.butin !== '—' ? `Butin : ${op.butin}` : null, op.debrief && op.debrief !== '—' ? `Débrief : ${op.debrief}` : null].filter(Boolean).join(' · ');
      props['Résultat'] = { rich_text: [{ text: { content: resTxt.slice(0, 2000) } }] };
    }
    await notionPatch(op.notionPageId, props);

    // Si opération terminée → mettre à jour les fiches des participants
    if (op.status === 'terminee') {
      await majOperationsParticipees(op);
    }

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
  majStatutActiviteNotion,
  majOperationsParticipees,
  envoyerRappelFiche,
  checkFichesCompletees,
};

