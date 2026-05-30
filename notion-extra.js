// ═══════════════════════════════════════════════════════════════
// notion-extra.js — Extensions Notion pour iwc-bot v3.0
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder, ChannelType } = require('discord.js');
const { loadDB, saveDB } = require('./db');

const NOTION_VERSION = '2022-06-28';
const NOTION_BASE_URL = 'https://api.notion.com/v1';

// Correspondance Nom IC → Discord ID
const MEMBRES_MAP = {
  'Colt Kane':      '696325126047662081',
  'June McCall':    '998581854791798835',
  'Cyrus Hollow':   '324627678143578112',
  'Jonas Caverly':  '944208797084311583',
  'Thomas Galagan': '982201491773354035',
};

const DBS = {
  STATS:      process.env.NOTION_STATS_DB,
  FICHES:     process.env.NOTION_FICHES_DB,
  TRESORERIE: process.env.NOTION_TRESORERIE_DB,
  CONTRATS:   process.env.NOTION_CONTRATS_DB,
  OPERATIONS: process.env.NOTION_OPERATIONS_DB,
};

// ── Rate limiter simple pour l'API Notion ──
const _queue = [];
let _running = false;

async function notionRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    _queue.push({ method, endpoint, body, resolve, reject });
    if (!_running) processQueue();
  });
}

async function processQueue() {
  if (_queue.length === 0) { _running = false; return; }
  _running = true;
  const { method, endpoint, body, resolve, reject } = _queue.shift();
  try {
    const res = await fetch(`${NOTION_BASE_URL}/${endpoint}`, {
      method,
      headers: {
        'Authorization': `Bearer ${process.env.NOTION_TOKEN}`,
        'Notion-Version': NOTION_VERSION,
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });

    // Gestion du rate limiting Notion (429)
    if (res.status === 429) {
      const retryAfter = parseInt(res.headers.get('Retry-After') || '1', 10) * 1000;
      console.log(`⏳ Notion rate limit — retry dans ${retryAfter}ms`);
      _queue.unshift({ method, endpoint, body, resolve, reject });
      setTimeout(() => processQueue(), retryAfter);
      return;
    }

    const j = await res.json();
    if (!res.ok) { console.log(`❌ Notion ${method} /${endpoint}:`, j.message); resolve(null); }
    else resolve(j);
  } catch (e) {
    console.log(`❌ Notion request error:`, e.message);
    resolve(null);
  }
  setTimeout(() => processQueue(), 334); // ~3 req/s max
}

// ── Helpers ──
function fmtShort(d) {
  return !d ? '—' : new Date(d).toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function today() { return new Date().toISOString().split('T')[0]; }
function getCh(guild, ...names) {
  for (const name of names) {
    const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
    const ch = guild.channels.cache.find(c =>
      [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
      clean(c.name).includes(clean(name))
    );
    if (ch) return ch;
  }
  return null;
}
function getMention(guild) {
  return guild.roles.cache
    .filter(r => ['Concepteur', 'Fléau', 'Fondateur'].some(n => r.name.includes(n)))
    .map(r => `<@&${r.id}>`).join(' ') || '';
}
function checkReady(fnName, dbKey) {
  if (!process.env.NOTION_TOKEN) { console.log(`⚠️ [${fnName}] NOTION_TOKEN manquant`); return false; }
  if (dbKey && !DBS[dbKey]) { console.log(`⚠️ [${fnName}] NOTION_${dbKey}_DB manquant`); return false; }
  return true;
}

// ── CRUD Notion ──
async function notionCreate(dbId, properties, children) {
  if (!process.env.NOTION_TOKEN || !dbId) return null;
  const body = { parent: { database_id: dbId }, properties };
  if (children?.length) body.children = children;
  return notionRequest('POST', 'pages', body);
}

async function notionPatch(pageId, properties) {
  if (!process.env.NOTION_TOKEN || !pageId) return null;
  return notionRequest('PATCH', `pages/${pageId}`, { properties });
}

async function notionQueryDB(dbId, filter, sorts = []) {
  if (!process.env.NOTION_TOKEN || !dbId) return [];
  const body = { sorts };
  if (filter) body.filter = filter;
  const j = await notionRequest('POST', `databases/${dbId}/query`, body);
  return j?.results || [];
}

async function notionFindByText(dbId, propName, value) {
  const results = await notionQueryDB(dbId, {
    property: propName,
    rich_text: { equals: value },
  });
  return results[0]?.id || null;
}

// Récupère ou met en cache le notionFicheId d'un membre
async function getFicheId(userId) {
  const db = loadDB();
  if (db.members[userId]?.notionFicheId) return db.members[userId].notionFicheId;
  const pageId = await notionFindByText(DBS.FICHES, 'Discord ID', userId);
  if (pageId && db.members[userId]) {
    db.members[userId].notionFicheId = pageId;
    saveDB(db);
  }
  return pageId;
}

// ═══════════════════════════════════════════════════════════════
// STATS HEBDO
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
      soldeLegal:   db.coffres?.legal  || 0,
      soldeIlleg:   db.coffres?.illegal || 0,
    };

    const opsDetail      = (db.operations || []).filter(o => o.status === 'terminee' && inWeek(o.endedAt)).map(o => `→ *${o.name}* — ${o.resultat || '—'}`).join('\n') || '*Aucune*';
    const contratsDetail = (db.contrats  || []).filter(c => c.status === 'signe'    && inWeek(c.signedAt)).map(c => `→ \`${c.id}\` — ${c.objet}`).join('\n') || '*Aucun*';
    const semaine = `${fmtShort(new Date(weekAgo))} → ${fmtShort(new Date())}`;

    if (checkReady('postStatsHebdo', 'STATS')) {
      await notionCreate(DBS.STATS, {
        'Semaine':            { title: [{ text: { content: semaine } }] },
        'Date':               { date: { start: today() } },
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

    const ch = getCh(guild, 'planning-sessions', 'agenda', 'planning', 'annonces-generales', 'annonces', 'logs');
    if (ch) await ch.send({ embeds: [new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setTitle('📊 Bilan de la semaine — Iron Wolf Company')
      .setDescription(`*${semaine}*\n*La meute avance. Voici le bilan de la semaine.*`)
      .addFields(
        { name: '👥 MEMBRES',     value: [`🆕 Arrivants : **${stats.nouveaux}**`, `🚪 Départs : **${stats.departs}**`].join('\n'), inline: true },
        { name: '📋 RECRUTEMENT', value: [`📥 Candidatures : **${stats.candidatures}**`, `✅ Recrues : **${stats.recrues}**`].join('\n'), inline: true },
        { name: '💰 TRÉSORERIE',  value: [`⚖️ Légal : **$${stats.soldeLegal.toLocaleString('fr-FR')}**`, `🔒 Illégal : **$${stats.soldeIlleg.toLocaleString('fr-FR')}**`].join('\n'), inline: true },
        { name: `🎯 OPÉRATIONS (${stats.operations})`, value: opsDetail },
        { name: `📜 CONTRATS (${stats.contrats})`,     value: contratsDetail },
      )
      .setFooter({ text: 'IWC • Bilan hebdomadaire automatique' })
    ] });
    console.log('✅ Stats hebdo publiées');
  } catch (e) { console.log('❌ Stats hebdo error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// FICHE PERSONNAGE
// ═══════════════════════════════════════════════════════════════
async function creerFichePersonnageNotion(cand) {
  if (!checkReady('creerFichePersonnageNotion', 'FICHES')) return null;
  try {
    const metierSpe = cand.type === 'illegal' ? (cand.specialite || '—') : (cand.metier || '—');
    const pole = cand.type === 'illegal' ? '🔪 Illégal' : '⚖️ Légal';

    const page = await notionCreate(DBS.FICHES, {
      'Personnage':             { title: [{ text: { content: cand.nomPerso || '—' } }] },
      'Âge':                    { rich_text: [{ text: { content: cand.agePerso || '—' } }] },
      'Pôle':                   { select: { name: pole } },
      'Métier / Spécialité':    { rich_text: [{ text: { content: metierSpe } }] },
      'Disponibilités':         { rich_text: [{ text: { content: cand.dispos || '—' } }] },
      "Date d'entrée":          { date: { start: today() } },
      'Discord ID':             { rich_text: [{ text: { content: cand.userId || '—' } }] },
      'Discord Username':       { rich_text: [{ text: { content: cand.username || '—' } }] },
      'Statut fiche':           { select: { name: '🟡 À compléter' } },
      'Statut activité':        { select: { name: '✅ Actif' } },
      'Relations':              { rich_text: [{ text: { content: '' } }] },
      'Opérations participées': { rich_text: [{ text: { content: '' } }] },
      'Objectifs IC':           { rich_text: [{ text: { content: '' } }] },
    }, [
      { object: 'block', type: 'heading_2',          heading_2:          { rich_text: [{ text: { content: '📖 Background' } }] } },
      { object: 'block', type: 'paragraph',          paragraph:          { rich_text: [{ text: { content: (cand.background || '—').slice(0, 2000) } }] } },
      { object: 'block', type: 'heading_2',          heading_2:          { rich_text: [{ text: { content: '✍️ À compléter par le membre' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Apparence physique' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Relations / contacts dans la Compagnie' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Objectifs personnels IC' } }] } },
      { object: 'block', type: 'bulleted_list_item', bulleted_list_item: { rich_text: [{ text: { content: 'Opérations marquantes' } }] } },
    ]);

    if (page?.id && cand.userId) {
      const db = loadDB();
      if (db.members[cand.userId]) { db.members[cand.userId].notionFicheId = page.id; saveDB(db); }
    }
    console.log(`✅ Fiche personnage créée : ${cand.nomPerso}`);
    return page?.id || null;
  } catch (e) { console.log('❌ Fiche perso error:', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════════
// STATUT ACTIVITÉ
// ═══════════════════════════════════════════════════════════════
async function majStatutActiviteNotion(userId, statut) {
  if (!checkReady('majStatutActiviteNotion', 'FICHES')) return;
  try {
    const pageId = await getFicheId(userId);
    if (!pageId) return;
    const label = statut === 'absent' ? '⚠️ Absent' : statut === 'inactif' ? '💤 Inactif' : '✅ Actif';
    await notionPatch(pageId, { 'Statut activité': { select: { name: label } } });
    console.log(`✅ Statut activité : ${userId} → ${label}`);
  } catch (e) { console.log('❌ majStatutActivite error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// OPÉRATIONS PARTICIPÉES
// ═══════════════════════════════════════════════════════════════
async function majOperationsParticipees(op) {
  if (!checkReady('majOperationsParticipees', 'FICHES')) return;
  if (!op.participants?.length) return;
  try {
    for (const nomParticipant of op.participants) {
      const discordId = MEMBRES_MAP[nomParticipant];
      if (!discordId) continue;
      const pageId = await getFicheId(discordId);
      if (!pageId) continue;
      const pages = await notionQueryDB(DBS.FICHES, { property: 'Discord ID', rich_text: { equals: discordId } });
      const existant = pages[0]?.properties['Opérations participées']?.rich_text?.[0]?.plain_text || '';
      const ligne = `→ ${op.name} (${fmtShort(new Date())}) — ${op.resultat || '—'}`;
      const nouveau = existant ? `${existant}\n${ligne}` : ligne;
      await notionPatch(pageId, { 'Opérations participées': { rich_text: [{ text: { content: nouveau.slice(0, 2000) } }] } });
      console.log(`✅ Opérations participées MàJ : ${nomParticipant}`);
    }
  } catch (e) { console.log('❌ majOperationsParticipees error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// RAPPEL FICHE 48H — persistant dans data.json
// ═══════════════════════════════════════════════════════════════
function planifierRappelFiche(guild, cand) {
  // Stocker le rappel dans data.json pour survivre aux redémarrages
  const db = loadDB();
  if (!db.rappelsFiches) db.rappelsFiches = {};
  db.rappelsFiches[cand.userId] = {
    userId: cand.userId,
    nomPerso: cand.nomPerso,
    envoiAt: Date.now() + 48 * 3600000,
  };
  saveDB(db);
  console.log(`⏰ Rappel fiche planifié pour ${cand.nomPerso} dans 48h`);
}

async function envoyerRappelsFiches(guild) {
  const db = loadDB();
  if (!db.rappelsFiches) return;
  const maintenant = Date.now();
  let changed = false;
  for (const [userId, rappel] of Object.entries(db.rappelsFiches)) {
    if (rappel.envoiAt <= maintenant) {
      try {
        const member = await guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.send({ embeds: [new EmbedBuilder()
            .setColor(0x8B1A1A)
            .setTitle('📋 Rappel — Ta fiche personnage')
            .setDescription(`Bienvenue dans la Compagnie, **${rappel.nomPerso}** !\n\nTa fiche personnage a été créée dans Notion. Il te reste à compléter :\n\n→ **Apparence physique**\n→ **Relations / contacts**\n→ **Objectifs IC**\n\n*Contacte la Direction pour obtenir le lien.*\n— La Direction`)
            .setFooter({ text: 'IWC • Rappel automatique 48h' })
          ] });
          console.log(`✅ Rappel fiche envoyé à ${rappel.nomPerso}`);
        }
      } catch (e) { console.log('❌ Rappel fiche error:', e.message); }
      delete db.rappelsFiches[userId];
      changed = true;
    }
  }
  if (changed) saveDB(db);
}

// ═══════════════════════════════════════════════════════════════
// ALERTE FICHE COMPLÉTÉE
// ═══════════════════════════════════════════════════════════════
async function checkFichesCompletees(guild) {
  if (!checkReady('checkFichesCompletees', 'FICHES')) return;
  try {
    const pages = await notionQueryDB(DBS.FICHES, { property: 'Statut fiche', select: { equals: '✅ Complète' } });
    const db = loadDB();
    const nouvelles = pages.filter(p => !db.fichesCompleteesNotifiees?.includes(p.id));
    if (!nouvelles.length) return;
    const logsCh = guild.channels.cache.find(c => c.name?.includes('logs'));
    if (!logsCh) return;
    for (const page of nouvelles) {
      const nom       = page.properties['Personnage']?.title?.[0]?.plain_text || '—';
      const discordId = page.properties['Discord ID']?.rich_text?.[0]?.plain_text;
      await logsCh.send({ embeds: [new EmbedBuilder()
        .setColor(0x57F287)
        .setTitle(`✅ Fiche complétée — ${nom}`)
        .setDescription(`**${nom}** vient de compléter sa fiche personnage dans Notion.${discordId ? `\n\n<@${discordId}>` : ''}`)
        .setFooter({ text: 'IWC • Notification automatique' })
      ] });
      if (!db.fichesCompleteesNotifiees) db.fichesCompleteesNotifiees = [];
      db.fichesCompleteesNotifiees.push(page.id);
    }
    saveDB(db);
  } catch (e) { console.log('❌ checkFichesCompletees error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// ALERTE COMPTE SUSPECT — 3 niveaux
// ═══════════════════════════════════════════════════════════════
function daysSince(d) { return !d ? 999 : Math.floor((Date.now() - new Date(d).getTime()) / 86400000); }

async function alerteCompteSuspect(guild, member) {
  try {
    const age = daysSince(member.user.createdAt);
    if (age >= 30) return; // Pas d'alerte pour les comptes de plus de 30 jours
    const logsCh = guild.channels.cache.get(
      guild.channels.cache.find(c => c.name?.includes('logs'))?.id
    ) || guild.channels.cache.find(c => c.name?.includes('logs'));
    if (!logsCh) return;

    let niveau, color, action;
    if      (age < 1)  { niveau = '🔴 CRITIQUE'; color = 0xED4245; action = '❗ Expulsion immédiate recommandée'; }
    else if (age < 7)  { niveau = '🟠 ÉLEVÉ';    color = 0xFF6B35; action = '⚠️ Surveiller et interroger'; }
    else               { niveau = '🟡 MODÉRÉ';   color = 0xFFA500; action = '👁️ Garder un œil'; }

    const mention = getMention(guild);
    await logsCh.send({
      content: `${mention} — ⚠️ Compte suspect détecté`,
      embeds: [new EmbedBuilder()
        .setColor(color)
        .setTitle(`⚠️ COMPTE SUSPECT — ${member.user.username}`)
        .addFields(
          { name: '👤 Membre',        value: `<@${member.id}>`,          inline: true },
          { name: '⏱️ Âge du compte', value: `**${age} jour(s)**`,       inline: true },
          { name: '🚨 Niveau',        value: niveau,                      inline: true },
          { name: '🔍 Action',        value: action },
        )
        .setThumbnail(member.user.displayAvatarURL())
        .setFooter({ text: 'IWC • Sécurité automatique' })
      ],
    });
  } catch (e) { console.log('❌ alerteCompteSuspect error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// TRÉSORERIE
// ═══════════════════════════════════════════════════════════════
async function enregistrerTransactionNotion(tx) {
  if (!checkReady('enregistrerTransactionNotion', 'TRESORERIE')) return;
  try {
    await notionCreate(DBS.TRESORERIE, {
      'Objet':       { title: [{ text: { content: tx.objet || '—' } }] },
      'Date':        { date: { start: today() } },
      'Type':        { select: { name: tx.type } },
      'Coffre':      { select: { name: tx.coffre } },
      'Montant':     { number: tx.montant },
      'Responsable': { rich_text: [{ text: { content: tx.responsable || '—' } }] },
      'Solde':       { number: tx.solde },
    });
  } catch (e) { console.log('❌ Trésorerie error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// CONTRATS
// ═══════════════════════════════════════════════════════════════
async function ajouterContratNotion(contrat) {
  if (!checkReady('ajouterContratNotion', 'CONTRATS')) return;
  try {
    const partenaire = contrat.type === 'emploi' ? (contrat.employeurNom || '—') : (contrat.clientNom || '—');
    await notionCreate(DBS.CONTRATS, {
      'Référence':    { title: [{ text: { content: contrat.id } }] },
      'Objet':        { rich_text: [{ text: { content: contrat.objet || '—' } }] },
      'Type':         { select: { name: contrat.type === 'emploi' ? '📥 Employeur' : '📤 Prestation' } },
      'Partenaire':   { rich_text: [{ text: { content: partenaire } }] },
      'Rémunération': { rich_text: [{ text: { content: contrat.remuneration || '—' } }] },
      'Statut':       { select: { name: '✅ Actif' } },
      'Date début':   { date: { start: today() } },
      'Signé par':    { rich_text: [{ text: { content: contrat.signedBy || contrat.signataire || '—' } }] },
    });
    console.log(`✅ Contrat ${contrat.id} ajouté à Notion`);
  } catch (e) { console.log('❌ Contrat Notion error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// OPÉRATIONS
// ═══════════════════════════════════════════════════════════════
const OP_STATUT = {
  preparation: '🟡 Préparation',
  en_cours:    '🟢 En cours',
  terminee:    '✅ Terminée',
  annulee:     '❌ Annulée',
};

async function creerOperationNotion(op) {
  if (!checkReady('creerOperationNotion', 'OPERATIONS')) return null;
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
    if (j) { console.log(`✅ Opération "${op.name}" créée dans Notion`); return j.id; }
    return null;
  } catch (e) { console.log('❌ Opération Notion error:', e.message); return null; }
}

async function majOperationNotion(op) {
  if (!checkReady('majOperationNotion', 'OPERATIONS')) return;
  try {
    // Fallback : retrouver la page via ID Discord si pageId absent
    if (!op.notionPageId && op.id) {
      op.notionPageId = await notionFindByText(DBS.OPERATIONS, 'ID Discord', op.id);
      if (!op.notionPageId) { console.log(`⚠️ Page Notion introuvable pour op ${op.id}`); return; }
    }
    const props = {
      'Statut':       { select: { name: OP_STATUT[op.status] || op.status } },
      'Participants': { rich_text: [{ text: { content: (op.participants || []).join(', ') || '—' } }] },
    };
    if (op.endedAt)  props['Date fin']  = { date: { start: new Date(op.endedAt).toISOString().split('T')[0] } };
    if (op.resultat) {
      const txt = [op.resultat, op.butin !== '—' ? `Butin : ${op.butin}` : null, op.debrief !== '—' ? `Débrief : ${op.debrief}` : null].filter(Boolean).join(' · ');
      props['Résultat'] = { rich_text: [{ text: { content: txt.slice(0, 2000) } }] };
    }
    await notionPatch(op.notionPageId, props);
    if (op.status === 'terminee') await majOperationsParticipees(op);
    console.log(`✅ Opération "${op.name}" MàJ (${op.status})`);
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
  planifierRappelFiche,
  envoyerRappelsFiches,
  checkFichesCompletees,
  alerteCompteSuspect,
};

