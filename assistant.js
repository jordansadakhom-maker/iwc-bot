// ─────────────────────────────────────────────────────────────────────────────
//  assistant.js — Assistant IA + Recherche globale (accès : Confrérie + Direction)
//  • 🔎 Recherche : un mot-clé → résultats dans contrats, opérations, avis,
//    contacts, informateurs, membres, avis clients, carte. (sans IA, fiable)
//  • 💬 Question : réponse en français à partir des VRAIES données du serveur.
//  • ✍️ Rédaction RP : annonces, briefs, lettres… ton western ~1904.
//  • 📝 Résumé : résume un texte collé (fil, dossier…).
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
const { loadDB } = require('./db');

const SALON_PANEL = '1518042088879423640';        // #dashboard (choisi par la Direction)
const ROLE_CONFRERIE = '1508898841993281658';      // Pôle Illégal
const ROLES_DIRECTION = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire', 'Conseil'];
const MODELE = 'claude-haiku-4-5-20251001';

const estAcces = (member) => !!member?.roles?.cache?.some(r => r.id === ROLE_CONFRERIE || ROLES_DIRECTION.some(n => (r.name || '').includes(n)));
const estDirection = (member) => !!member?.roles?.cache?.some(r => ROLES_DIRECTION.some(n => (r.name || '').includes(n)));
const _norm = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// ═══════════════════════════ RECHERCHE GLOBALE ═══════════════════════════
// Distance d'édition (cappée) → tolérance aux fautes de frappe.
function _lev(a, b) {
  a = a || ''; b = b || '';
  if (Math.abs(a.length - b.length) > 2) return 3;
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) => { const r = new Array(n + 1).fill(0); r[0] = i; return r; });
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return dp[m][n];
}
// Match tolérant : sous-chaîne OU mot proche (1 faute) si le terme fait ≥ 4 lettres.
function _flou(champ, q) {
  const c = _norm(champ); if (!c || !q) return false;
  if (c.includes(q)) return true;
  if (q.length >= 4) for (const tok of c.split(/[^a-z0-9]+/)) { if (tok && Math.abs(tok.length - q.length) <= 2 && _lev(tok, q) <= 1) return true; }
  return false;
}
const _url = (g, c, m) => (g && c) ? (m ? `https://discord.com/channels/${g}/${c}/${m}` : `https://discord.com/channels/${g}/${c}`) : null;
const _lbl = (txt, url) => (url ? `[${txt}](${url})` : txt);
const _poleC = (c) => (c?.cc || c?.type === 'confrerie' || c?.pole === 'illegal') ? 'confrerie' : 'compagnie';
const _lienContrat = (g, c) => c.forumThreadId ? _url(g, c.forumThreadId) : _url(g, c.channelId, c.msgId);
const _lienOp = (g, o) => o.threadId ? _url(g, o.threadId) : _url(g, o.channelId, o.msgId);
const _lienTraque = (g, t) => (t.channelId && t.messageId) ? _url(g, t.channelId, t.messageId) : (t.threadId ? _url(g, t.threadId) : null);
const _lienInfo = (g, r) => (r.channelId && r.messageId) ? _url(g, r.channelId, r.messageId) : (r.threadId ? _url(g, r.threadId) : null);
function _statutMatch(val, f) {
  if (!f) return true; const v = _norm(val).replace(/[ _-]/g, ''), ff = _norm(f).replace(/[ _-]/g, '');
  const syn = { ouvert: ['chasse', 'reperee', 'ouvert', 'enattente', 'propose'], encours: ['encours', 'prep', 'valide', 'signe', 'accepte', 'actif'], honore: ['honore', 'termine', 'cloture', 'paye'], paye: ['honore'], termine: ['termine', 'cloture', 'honore', 'clos'], ferme: ['cloture', 'clos', 'termine'], cloture: ['cloture', 'clos', 'termine'] };
  const keys = syn[ff]; if (keys) return keys.some(k => v.includes(k));
  return v.includes(ff);
}

// opts : { guildId, type, statut, pole } — filtres optionnels.
function _recherche(db, terme, opts = {}) {
  const q = _norm(terme);
  const g = opts.guildId;
  const typeOK = (t) => !opts.type || opts.type === t;
  const m = (...vals) => !q || _flou(vals.filter(Boolean).join(' '), q);
  const groupes = [];
  const add = (titre, items) => { if (items.length) groupes.push({ titre, items: items.slice(0, 8), n: items.length }); };

  if (typeOK('contrat')) {
    let arr = (db.contrats || []).filter(c => m(c.id, c.clientNom, c.commanditaire, c.objet, c.typeMission));
    if (opts.pole) arr = arr.filter(c => _poleC(c) === opts.pole);
    if (opts.statut) arr = arr.filter(c => _statutMatch(`${c.suivi || ''} ${c.status || ''}`, opts.statut));
    add('📜 Contrats', arr.map(c => _lbl(`\`${c.id}\` ${c.clientNom || c.commanditaire || '—'} — ${(c.objet || c.typeMission || '—')}`.slice(0, 80), _lienContrat(g, c))));
  }
  if (typeOK('operation')) {
    let arr = [...(db.preparations || []), ...(db.operations || [])].filter(o => m(o.id, o.cible, o.name, o.categorie, o.objectif));
    if (opts.pole) arr = arr.filter(o => (o.pole === 'illegal' ? 'confrerie' : 'compagnie') === opts.pole);
    if (opts.statut) arr = arr.filter(o => _statutMatch(o.status, opts.statut));
    add('🎯 Opérations', arr.map(o => _lbl(`\`${o.id}\` ${o.cible || o.name || '—'} [${o.status || '—'}]`.slice(0, 80), _lienOp(g, o))));
  }
  if (typeOK('avis') && (!opts.pole || opts.pole === 'confrerie')) {
    let arr = (db.traques || []).filter(t => m(t.id, t.cible, t.position, t.commanditaire));
    if (opts.statut) arr = arr.filter(t => _statutMatch(t.status, opts.statut));
    add('🔎 Avis de recherche', arr.map(t => _lbl(`\`${t.id}\` ${t.cible || '—'} @ ${t.position || '—'} [${t.status || '—'}]`.slice(0, 80), _lienTraque(g, t))));
  }
  if (typeOK('contact')) {
    add('📇 Répertoire', (db.repertoire?.contacts || []).filter(c => m(c.nom, c.nomsurnom, c.telegramme, c.metier, c.notes, c.affiliation))
      .map(c => `${c.nom || c.nomsurnom || '—'}${c.telegramme ? ` · 📨${c.telegramme}` : ''}${c.metier ? ` · ${c.metier}` : ''}`.slice(0, 90)));
  }
  if (typeOK('informateur')) {
    add('🕵️ Informateurs', (db.informateurs || []).filter(r => m(r.id, r.source, r.cible, r.info))
      .map(r => _lbl(`\`${r.id}\` ${r.cible || '—'} — ${(r.info || '').slice(0, 45)}`.slice(0, 80), _lienInfo(g, r))));
  }
  if (typeOK('note')) {
    add('📝 Notes de terrain', (db.notesTerrain || []).filter(n => m(n.texte, n.contenu, n.resume, n.lieu, n.agent, n.titre))
      .map(n => `${n.lieu ? `📍${n.lieu} · ` : ''}${(n.resume || n.texte || n.contenu || '—')}`.slice(0, 90)));
  }
  if (typeOK('facture')) {
    add('🧾 Factures', (db.factures || []).filter(f => m(f.id, f.ref, f.objet, f.clientNom, f.type, f.note))
      .map(f => `${f.ref || f.id || '—'} · ${f.clientNom || '—'} · ${(f.objet || '—')} · ${f.montant || 0}$`.slice(0, 90)));
  }
  if (typeOK('membre')) {
    add('👥 Membres', Object.values(db.members || {}).filter(mb => m(mb.name, mb.rang)).map(mb => `${mb.name || '—'} — ${mb.rang || '—'}`.slice(0, 90)));
  }
  if (typeOK('avisclient')) {
    add('⭐ Avis clients', (db.avisClients || []).filter(a => m(a.clientNom, a.commentaire, a.objet)).map(a => `${a.clientNom || '—'} (${a.note || '?'}/5)${a.commentaire ? ` — « ${a.commentaire.slice(0, 40)} »` : ''}`.slice(0, 90)));
  }
  if (typeOK('carte')) {
    add('🗺️ Carte', (db.carte?.points || []).filter(p => m(p.nom, p.lieu, p.region, p.notes)).map(p => `${p.nom || '—'} — ${p.lieu || p.region || '—'}`.slice(0, 90)));
  }
  return { total: groupes.reduce((s, gr) => s + gr.n, 0), groupes };
}

// Recherche en langage naturel : l'IA extrait des filtres, la recherche reste déterministe.
async function _rechercheIA(db, phrase, guildId) {
  const opts = { guildId };
  let termes = phrase;
  const out = await _callIA([{ role: 'user', content: `Analyse cette requête de recherche (organisation RP western) et renvoie UNIQUEMENT un JSON compact, sans texte autour : {"motsCles":"...","type":"contrat|operation|avis|contact|informateur|note|facture|membre|null","statut":"ouvert|en cours|honoré|null","pole":"compagnie|confrerie|null"}. "motsCles" = noms/lieux/sujets à chercher (peut être vide). Requête : ${phrase}` }], 250);
  if (out) { try { const j = JSON.parse(out.replace(/```json|```/g, '').trim()); if (j.type && j.type !== 'null') opts.type = j.type; if (j.statut && j.statut !== 'null') opts.statut = j.statut; if (j.pole && j.pole !== 'null') opts.pole = j.pole; if (typeof j.motsCles === 'string' && j.motsCles.trim()) termes = j.motsCles.trim(); } catch {} }
  return _recherche(db, termes, opts);
}

// ═══════════════════════════ IA ═══════════════════════════
async function _callIA(messages, maxTokens = 800) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: MODELE, max_tokens: maxTokens, messages }),
    });
    if (!resp.ok) { console.log('❌ assistant IA HTTP', resp.status); return null; }
    const data = await resp.json();
    const txt = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('').trim();
    return txt || null;
  } catch (e) { console.log('❌ assistant IA:', e.message); return null; }
}

// Digest compact des données pour le Q&A
function _digest(db) {
  const eco = db.economie || {};
  const soldes = Object.entries(eco).map(([id, w]) => ({ id, solde: Number(w?.solde) || 0 }));
  const totalComptes = soldes.reduce((s, x) => s + x.solde, 0);
  const contrats = db.contrats || [];
  const parStatut = {}; contrats.forEach(c => { const k = c.suivi || c.status || 'inconnu'; parStatut[k] = (parStatut[k] || 0) + 1; });
  const ops = [...(db.preparations || []), ...(db.operations || [])];
  const traques = db.traques || [];
  const membres = Object.values(db.members || {});
  const avis = (db.avisClients || []).filter(a => a.note);
  const moyAvis = avis.length ? (avis.reduce((s, a) => s + a.note, 0) / avis.length).toFixed(1) : 'n/a';
  const lignes = [];
  lignes.push(`COFFRE COMMUN: ${db.coffre || 0} $`);
  lignes.push(`COMPTES MEMBRES (total): ${totalComptes} $`);
  lignes.push(`CONTRATS: ${contrats.length} total — ` + Object.entries(parStatut).map(([k, v]) => `${k}:${v}`).join(', '));
  lignes.push('Derniers contrats: ' + contrats.slice(-8).map(c => `${c.id}[${c.suivi || c.status || '?'}] ${c.clientNom || c.commanditaire || ''} ${(c.objet || '').slice(0, 40)}`).join(' | '));
  lignes.push(`OPÉRATIONS: ${ops.length} — ` + ops.slice(-8).map(o => `${o.id}[${o.status || '?'}] ${o.cible || o.name || ''}`).join(' | '));
  lignes.push(`AVIS DE RECHERCHE: ${traques.length} (ouverts: ${traques.filter(t => ['chasse', 'reperee'].includes(t.status)).length}) — ` + traques.slice(-8).map(t => `${t.cible}@${t.position}[${t.status}]`).join(' | '));
  lignes.push(`MEMBRES (${membres.length}): ` + membres.map(m => `${m.name}(${m.rang || '?'},${m.pole || '?'},${m.status || '?'})`).join(' | '));
  lignes.push(`CONTACTS RÉPERTOIRE: ${(db.repertoire?.contacts || []).length}`);
  lignes.push(`AVIS CLIENTS: ${avis.length} (moyenne ${moyAvis}/5)`);
  return lignes.join('\n').slice(0, 6000);
}

async function _repondreQuestion(db, question) {
  const digest = _digest(db);
  return _callIA([{ role: 'user', content: `Tu es l'assistant de gestion d'une organisation RP (Iron Wolf Company / La Confrérie). Réponds en FRANÇAIS, de façon BRÈVE, claire et factuelle, en te basant UNIQUEMENT sur les données ci-dessous. Si l'information n'y figure pas, dis-le simplement. Ne fais pas de tableau.\n\n=== DONNÉES ===\n${digest}\n\n=== QUESTION ===\n${question}` }], 700);
}
async function _redigerRP(demande) {
  return _callIA([{ role: 'user', content: `Tu écris pour un univers RP western (~1904, État du Texas/Louisiane) : l'Iron Wolf Company (légal) et La Confrérie (clandestin). Rédige en FRANÇAIS, ton immersif et crédible, SANS anachronisme ni emoji superflu. Va à l'essentiel. Voici la demande de rédaction :\n\n${demande}` }], 1000);
}
async function _resumer(texte) {
  return _callIA([{ role: 'user', content: `Résume en FRANÇAIS, de façon claire et concise (puces si utile), le texte suivant. Garde les faits, chiffres, noms et décisions importantes :\n\n${texte.slice(0, 8000)}` }], 700);
}

// 🧠 Profil de cible : compile une fiche de renseignement à partir de TOUT ce que la base sait.
async function _profilCible(db, nom) {
  const q = _norm(nom);
  const rapports = (db.informateurs || []).filter(r => _norm(`${r.source || ''} ${r.cible || ''} ${r.info || ''}`).includes(q)).slice(-15)
    .map(r => `[informateur ${r.id}] cible:${r.cible || '—'} fiab:${r.fiabilite || '—'}${r.quand ? ` quand:${r.quand}` : ''} — ${(r.info || '').slice(0, 400)}`);
  const notes = (db.notesTerrain || []).filter(n => _norm(`${n.cible || ''} ${n.info || ''} ${n.lieu || ''} ${n.agent || ''} ${(n.tags || []).join(' ')}`).includes(q)).slice(-15)
    .map(n => `[note terrain${n.date ? ' ' + String(n.date).slice(0, 10) : ''}] ${n.agent ? 'agent:' + n.agent + ' ' : ''}${n.lieu ? 'lieu:' + n.lieu + ' ' : ''}— ${(n.info || '').replace(/\s+/g, ' ').slice(0, 400)}`);
  const avis = (db.traques || []).filter(t => _norm(`${t.cible || ''} ${t.position || ''}`).includes(q))
    .map(t => `Avis ${t.id}: ${t.cible} @ ${t.position || '—'} · prime ${t.prime || '—'} · ${t.dangerosite || '—'} [${t.status || '—'}]`);
  const contacts = (db.repertoire?.contacts || []).filter(c => _norm(`${c.nom || ''} ${c.nomsurnom || ''} ${c.metier || ''} ${c.notes || ''} ${c.affiliation || ''}`).includes(q))
    .map(c => `Contact: ${c.nom || c.nomsurnom} · métier ${c.metier || '—'} · affil ${c.affiliation || '—'} · ${(c.notes || '').slice(0, 200)}`);
  const contrats = (db.contrats || []).filter(c => _norm(`${c.clientNom || ''} ${c.commanditaire || ''} ${c.objet || ''} ${c.cible || ''}`).includes(q)).slice(-10)
    .map(c => `Contrat ${c.id}: ${c.clientNom || c.commanditaire || '—'} — ${(c.objet || '').slice(0, 120)} [${c.suivi || c.status || '?'}]`);
  const lieux = (db.carte?.points || []).filter(p => _norm(`${p.nom || ''} ${p.notes || ''} ${p.lieu || ''} ${p.region || ''}`).includes(q))
    .map(p => `Lieu connu: ${p.nom} (${p.type}) · ${p.region || ''} ${p.lieu || ''} · ${(p.notes || '').slice(0, 150)}`);
  const contexte = [...rapports, ...notes, ...avis, ...contacts, ...contrats, ...lieux].join('\n').slice(0, 7000);
  if (!contexte.trim()) return { vide: true };
  const txt = await _callIA([{ role: 'user', content: `Tu es l'analyste du renseignement de La Confrérie (RP western, Texans basés à Blackwater, ~1899-1904). À partir UNIQUEMENT des éléments ci-dessous, rédige une **FICHE DE RENSEIGNEMENT consolidée** en français sur « ${nom} ». Sections : 🪪 Identité · 📍 Lieux & habitudes · 🤝 Relations & affiliations · 📑 Faits connus (avec dates si dispo) · 💰 Contrats / avis liés · ⚠️ Dangerosité · 🎯 Recommandations d'action. Reste factuel, n'invente RIEN ; si une section manque d'infos, écris « inconnu ». Termine par une ligne « 📊 Fiabilité globale : faible / moyenne / élevée » selon le nombre et la concordance des sources.\n\n=== ÉLÉMENTS ===\n${contexte}` }], 1400);
  return { txt, n: { rapports: rapports.length, notes: notes.length, avis: avis.length, contacts: contacts.length, contrats: contrats.length, lieux: lieux.length } };
}

// 🧬 Synthèse du renseignement : recoupe TOUS les rapports récents → brief stratégique.
async function _syntheseRenseignement(db) {
  const reports = (db.informateurs || []).slice(-45).map(r => `[info ${r.id || ''}] cible:${r.cible || '—'} source:${r.source || '—'} fiab:${r.fiabilite || '—'}${r.quand ? ' quand:' + r.quand : ''} — ${(r.info || '').replace(/\s+/g, ' ').slice(0, 300)}`);
  const notes = (db.notesTerrain || []).slice(-25).map(n => `[note${n.date ? ' ' + String(n.date).slice(0, 10) : ''}] ${n.agent ? 'agent:' + n.agent + ' ' : ''}${n.lieu ? 'lieu:' + n.lieu + ' ' : ''}cible:${n.cible || '—'} — ${(n.info || '').replace(/\s+/g, ' ').slice(0, 280)}`);
  const avis = (db.traques || []).filter(t => ['chasse', 'reperee', 'ouvert'].includes(t.status)).slice(-12).map(t => `Avis ${t.id}: ${t.cible} @ ${t.position || '—'} [${t.status}] prime ${t.prime || '—'}`);
  const contexte = [...reports, ...notes, ...avis].join('\n').slice(0, 8000);
  if (!contexte.trim()) return { vide: true };
  const txt = await _callIA([{ role: 'user', content: `Tu es l'analyste en chef du renseignement de La Confrérie (RP western, Texans à Blackwater, ~1899-1904). À partir UNIQUEMENT des rapports d'informateurs, notes de terrain et avis ci-dessous, produis une **SYNTHÈSE DU RENSEIGNEMENT** en français, structurée :\n🔗 Recoupements (faits confirmés par plusieurs sources)\n🎯 Personnes / cibles à surveiller\n📍 Zones chaudes (lieux qui reviennent)\n⚠️ Menaces pour la maison\n🧭 Pistes & actions recommandées (priorisées)\n❓ Zones d'ombre à creuser\nReste factuel, signale explicitement les contradictions entre sources, n'invente RIEN. Sois synthétique et opérationnel.\n\n=== RAPPORTS (${reports.length}) · NOTES (${notes.length}) · AVIS (${avis.length}) ===\n${contexte}` }], 1500);
  return { txt, n: { reports: reports.length, notes: notes.length, avis: avis.length } };
}

// 🎯 Avis de recherche (IA) : affiche « wanted » à partir du nom + contexte + données connues.
async function _genererAvis(db, nom, contexte) {
  const q = _norm(nom);
  const connus = [];
  (db.informateurs || []).filter(r => _norm(`${r.cible || ''} ${r.info || ''}`).includes(q)).slice(-8).forEach(r => connus.push(`info: ${(r.info || '').slice(0, 200)}`));
  (db.notesTerrain || []).filter(n => _norm(`${n.cible || ''} ${n.info || ''} ${n.lieu || ''}`).includes(q)).slice(-6).forEach(n => connus.push(`terrain${n.lieu ? ' @' + n.lieu : ''}: ${(n.info || '').slice(0, 180)}`));
  (db.traques || []).filter(t => _norm(`${t.cible || ''} ${t.position || ''}`).includes(q)).slice(-4).forEach(t => connus.push(`avis: ${t.cible} @ ${t.position || '—'} prime ${t.prime || '—'} [${t.status || '—'}]`));
  (db.repertoire?.contacts || []).filter(c => _norm(`${c.nom || ''} ${c.nomsurnom || ''} ${c.affiliation || ''} ${c.notes || ''}`).includes(q)).slice(-4).forEach(c => connus.push(`contact: ${c.nom || c.nomsurnom} ${c.affiliation ? '(' + c.affiliation + ')' : ''} ${(c.notes || '').slice(0, 120)}`));
  const base = connus.join('\n').slice(0, 3500);
  const txt = await _callIA([{ role: 'user', content: `Rédige un **AVIS DE RECHERCHE** (style affiche « WANTED » de l'Ouest, ~1899-1904, en français) pour « ${nom} ».\nUtilise les informations connues ci-dessous et le contexte fourni. Tu peux soigner le ton, mais n'invente pas de faits précis vérifiables (dates, chiffres exacts) absents des données — reste plausible et sobre.\nFormat :\n🪪 **Identité & signalement** (nom, alias éventuels, description)\n⚖️ **Chefs d'accusation**\n📍 **Dernière position connue**\n⚠️ **Dangerosité** (Faible / Moyenne / Élevée / Extrême)\n💰 **Prime recommandée** (un montant en $ cohérent)\n📋 **Consignes aux chasseurs**\n\n=== CONTEXTE FOURNI ===\n${contexte || '(aucun)'}\n\n=== INFORMATIONS CONNUES ===\n${base || '(aucune dans nos dossiers)'}` }], 1100);
  return { txt, n: connus.length };
}

// 📑 Analyse de contrat (IA)
async function _analyserContrat(texte) {
  return _callIA([{ role: 'user', content: `Tu es le conseiller de La Confrérie (RP western). Analyse le **contrat** ci-dessous et renvoie une fiche claire en français :\n📌 **Résumé** (1-2 phrases)\n👤 **Commanditaire**\n🎯 **Objet / cible**\n💰 **Paiement** (montant, modalités, acompte)\n⏳ **Échéance / délais**\n⚠️ **Risques** (sécurité, légal, réputation)\n📊 **Niveau de risque global** : Faible / Moyen / Élevé\n🔎 **Points de vigilance** (clauses floues, pièges, infos manquantes)\n✅ **Recommandation** : Accepter / Négocier / Refuser — avec une justification courte.\nSi une information manque, écris « non précisé ». Reste factuel, ne romance pas.\n\n=== CONTRAT ===\n${(texte || '').slice(0, 6000)}` }], 1200);
}

// 🖼️ Génération d'image (OpenAI). Renvoie { buffer } ou { err }.
async function _genererImageIA(prompt) {
  const key = process.env.OPENAI_API_KEY; if (!key) return { err: 'no_key' };
  try {
    const resp = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${key}` },
      body: JSON.stringify({ model: 'gpt-image-1', prompt: prompt.slice(0, 3500), size: '1024x1024', n: 1 }),
    });
    if (!resp.ok) { const b = await resp.text().catch(() => ''); return { err: `HTTP ${resp.status}: ${b.slice(0, 200)}` }; }
    const data = await resp.json();
    const d = data?.data?.[0];
    if (d?.b64_json) return { buffer: Buffer.from(d.b64_json, 'base64') };
    if (d?.url) { const r = await fetch(d.url); return { buffer: Buffer.from(await r.arrayBuffer()) }; }
    return { err: 'réponse vide' };
  } catch (e) { return { err: e.message }; }
}

// ═══════════════════════════ PANNEAU ═══════════════════════════
function _panneauEmbed() {
  return new EmbedBuilder().setColor(0x2B2118).setTitle('🤖 ASSISTANT IA & RECHERCHE')
    .setDescription([
      '*Tes outils intelligents — réponses privées (visibles de toi seul).*',
      '',
      '🔎 **Rechercher** — un mot-clé, retrouve tout (contrats, opérations, avis, contacts, informateurs, membres, carte).',
      '💬 **Poser une question** — « combien on a gagné ? », « quelles opérations sont en cours ? »… réponse à partir des vraies données.',
      '✍️ **Rédiger (RP)** — annonces, briefs d\'opération, lettres… ton western.',
      '📝 **Résumer** — colle un long texte, je le résume.',
      '🧠 **Profil de cible** — dossier consolidé sur quelqu\'un, recoupé depuis informateurs, notes de terrain, avis, contacts, contrats et lieux.',
      '🧬 **Synthèse du renseignement** — recoupe TOUS les rapports récents → recoupements, cibles à surveiller, zones chaudes, menaces et pistes d\'action.',
      '🎯 **Avis de recherche (IA)** — génère une affiche « wanted » prête à publier (signalement, chefs d\'accusation, dangerosité, prime).',
      '📑 **Analyser un contrat** — colle un contrat, j\'en sors commanditaire, paiement, **risques**, niveau de risque et reco (accepter/négocier/refuser).',
      '🖼️ **Générer une image** — portrait / affiche « wanted » *(Direction)*.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company & La Confrérie' });
}
function _panneauRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('asst_search').setLabel('Rechercher').setEmoji('🔎').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('asst_ask').setLabel('Poser une question').setEmoji('💬').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('asst_write').setLabel('Rédiger (RP)').setEmoji('✍️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('asst_sum').setLabel('Résumer').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('asst_profil').setLabel('Profil de cible').setEmoji('🧠').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('asst_synth').setLabel('Synthèse rens.').setEmoji('🧬').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('asst_avis').setLabel('Avis de recherche').setEmoji('🎯').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('asst_contrat').setLabel('Analyser un contrat').setEmoji('📑').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('asst_image').setLabel('Image').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}
// Rangée de boutons à greffer sur le Poste de Commandement (Direction)
function rowPourCommandement() { return _panneauRows()[0]; }

async function installerPanneau(guild) {
  try {
    const ch = await guild.channels.fetch(SALON_PANEL).catch(() => null);
    if (!ch || typeof ch.send !== 'function') return;
    const botId = guild.client.user.id;
    let exists = null;
    try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) exists = pins.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('ASSISTANT IA')); } catch {}
    if (!exists) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) exists = recent.find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('ASSISTANT IA')); }
    if (exists) { await exists.edit({ embeds: [_panneauEmbed()], components: _panneauRows() }).catch(() => {}); return; }
    const m = await ch.send({ embeds: [_panneauEmbed()], components: _panneauRows() }).catch(() => null);
    if (m) await m.pin().catch(() => {});
  } catch (e) { console.log('⚠️ assistant installerPanneau:', e.message); }
}

// ═══════════════════════════ ROUTEUR ═══════════════════════════
function _modal(id, titre, label, style, ph) {
  const m = new ModalBuilder().setCustomId(id).setTitle(titre);
  m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('q').setLabel(label).setStyle(style).setRequired(true).setMaxLength(style === TextInputStyle.Paragraph ? 4000 : 200).setPlaceholder(ph || ''),
  ));
  return m;
}
function _modalAvis() {
  const m = new ModalBuilder().setCustomId('asst_avis_modal').setTitle('🎯 Avis de recherche (IA)');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom / cible').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120).setPlaceholder('Ex : Silas Grimshaw')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ctx').setLabel('Crime / contexte (facultatif)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1500).setPlaceholder('Ex : a trahi la Confrérie, vol d\'or à Blackwater…')),
  );
  return m;
}

async function routeInteraction(interaction) {
  const cid = interaction.customId || '';
  if (!cid.startsWith('asst_')) return false;
  try {
    if (!estAcces(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

    // Boutons → modals
    if (interaction.isButton?.()) {
      if (cid === 'asst_search') { await interaction.showModal(_modal('asst_search_modal', '🔎 Recherche globale', 'Mot-clé à chercher', TextInputStyle.Short, 'Ex : Grimshaw, Rhodes, contrat…')).catch(() => {}); return true; }
      if (cid === 'asst_ask') { await interaction.showModal(_modal('asst_ask_modal', '💬 Poser une question', 'Ta question', TextInputStyle.Paragraph, 'Ex : combien on a gagné ? quelles opérations en cours ?')).catch(() => {}); return true; }
      if (cid === 'asst_write') { await interaction.showModal(_modal('asst_write_modal', '✍️ Rédaction RP', 'Qu\'est-ce que je rédige ?', TextInputStyle.Paragraph, 'Ex : une annonce de recrutement Confrérie…')).catch(() => {}); return true; }
      if (cid === 'asst_sum') { await interaction.showModal(_modal('asst_sum_modal', '📝 Résumer un texte', 'Colle le texte à résumer', TextInputStyle.Paragraph, 'Colle ici le fil / dossier / message long…')).catch(() => {}); return true; }
      if (cid === 'asst_profil') { await interaction.showModal(_modal('asst_profil_modal', '🧠 Profil de cible', 'Nom de la personne / cible', TextInputStyle.Short, 'Ex : Silas Grimshaw')).catch(() => {}); return true; }
      if (cid === 'asst_avis') { await interaction.showModal(_modalAvis()).catch(() => {}); return true; }
      if (cid === 'asst_contrat') { await interaction.showModal(_modal('asst_contrat_modal', '📑 Analyser un contrat', 'Colle le texte du contrat', TextInputStyle.Paragraph, 'Colle ici le contrat / la proposition…')).catch(() => {}); return true; }
      if (cid === 'asst_synth') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const res = await _syntheseRenseignement(loadDB());
        if (res.vide) { await interaction.editReply({ content: '🧬 Aucun rapport d\'informateur / note de terrain à synthétiser pour l\'instant.' }).catch(() => {}); return true; }
        if (!res.txt) { await interaction.editReply({ content: '❌ Assistant IA indisponible (clé API absente ou erreur).' }).catch(() => {}); return true; }
        const e = new EmbedBuilder().setColor(0x4A3B2A).setTitle('🧬 Synthèse du renseignement').setDescription(res.txt.slice(0, 4096)).setFooter({ text: `Basé sur ${res.n.reports} rapport(s) · ${res.n.notes} note(s) · ${res.n.avis} avis — à recouper` });
        await interaction.editReply({ embeds: [e] }).catch(() => {});
        return true;
      }
      if (cid === 'asst_image') {
        if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 La génération d\'images est réservée à la Direction (coût par image).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await interaction.showModal(_modal('asst_image_modal', '🖼️ Générer une image', 'Décris l\'image voulue', TextInputStyle.Paragraph, 'Ex : portrait d\'un hors-la-loi balafré, chapeau noir…')).catch(() => {});
        return true;
      }
      return false;
    }

    // Modals
    if (interaction.isModalSubmit?.()) {
      // 🎯 Avis de recherche (IA) — champs dédiés (nom + contexte)
      if (cid === 'asst_avis_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const nom = (interaction.fields.getTextInputValue('nom') || '').trim();
        const ctx = (interaction.fields.getTextInputValue('ctx') || '').trim();
        const res = await _genererAvis(loadDB(), nom, ctx);
        if (!res.txt) { await interaction.editReply({ content: '❌ Assistant IA indisponible (clé API absente ou erreur).' }).catch(() => {}); return true; }
        const e = new EmbedBuilder().setColor(0x7A2E2E).setTitle(`🎯 AVIS DE RECHERCHE — ${nom}`.slice(0, 256)).setDescription(res.txt.slice(0, 4096)).setFooter({ text: res.n ? `Recoupé avec ${res.n} élément(s) du dossier — à valider avant publication` : 'Généré sans données internes — à valider avant publication' });
        await interaction.editReply({ embeds: [e] }).catch(() => {});
        return true;
      }
      const val = (interaction.fields.getTextInputValue('q') || '').trim();
      if (cid === 'asst_search_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const gid = interaction.guild?.id;
        // Phrase (≥3 mots ou mots-filtres) → recherche IA ; sinon recherche mot-clé directe.
        const phrase = /\s/.test(val) && (val.trim().split(/\s+/).length >= 3 || /non *pay|en cours|ouvert|ferm|honor|confr|compagnie|protection|prime|pay[ée]|cloti?ur/i.test(val));
        const res = phrase ? await _rechercheIA(loadDB(), val, gid) : _recherche(loadDB(), val, { guildId: gid });
        if (!res.total) { await interaction.editReply({ content: `🔎 Aucun résultat pour **${val}**.` }).catch(() => {}); return true; }
        const e = new EmbedBuilder().setColor(0x2B2118).setTitle(`🔎 Recherche — « ${val.slice(0, 80)} »`).setDescription(`**${res.total}** résultat(s)${phrase ? ' *(comprise par l\'IA)*' : ''} :`);
        for (const grp of res.groupes) e.addFields({ name: `${grp.titre} (${grp.n})`, value: grp.items.map(i => `• ${i}`).join('\n').slice(0, 1024) });
        await interaction.editReply({ embeds: [e] }).catch(() => {});
        return true;
      }
      // 🧠 Profil de cible (depuis les données)
      if (cid === 'asst_profil_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const res = await _profilCible(loadDB(), val);
        if (res.vide) { await interaction.editReply({ content: `🧠 Aucune information sur **${val}** dans nos données.` }).catch(() => {}); return true; }
        if (!res.txt) { await interaction.editReply({ content: '❌ Assistant IA indisponible (clé API absente ou erreur).' }).catch(() => {}); return true; }
        const _n = res.n;
        const _src = [
          _n.rapports ? `${_n.rapports} informateur(s)` : null,
          _n.notes ? `${_n.notes} note(s) terrain` : null,
          _n.avis ? `${_n.avis} avis` : null,
          _n.contacts ? `${_n.contacts} contact(s)` : null,
          _n.contrats ? `${_n.contrats} contrat(s)` : null,
          _n.lieux ? `${_n.lieux} lieu(x)` : null,
        ].filter(Boolean).join(' · ') || 'sources limitées';
        const e = new EmbedBuilder().setColor(0x7A2E2E).setTitle(`🧠 Fiche de renseignement — ${val}`.slice(0, 256)).setDescription(res.txt.slice(0, 4096)).setFooter({ text: `Sources : ${_src} — à recouper/vérifier` });
        await interaction.editReply({ embeds: [e] }).catch(() => {});
        return true;
      }
      // 🖼️ Génération d'image (Direction)
      if (cid === 'asst_image_modal') {
        if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const prompt = `Illustration western, État du Texas / Louisiane vers 1899, ambiance Red Dead Redemption 2. ${val}. Style réaliste, lumière naturelle, ton sépia légèrement désaturé, sans aucun texte ni lettrage.`;
        const res = await _genererImageIA(prompt);
        if (res.err === 'no_key') { await interaction.editReply({ content: '🖼️ Génération d\'images **non configurée**. Ajoute la clé `OPENAI_API_KEY` au bot (Render → Environment) pour l\'activer.' }).catch(() => {}); return true; }
        if (res.err) { await interaction.editReply({ content: `❌ Échec de la génération : ${res.err}` }).catch(() => {}); return true; }
        await interaction.editReply({ content: `🖼️ Image générée pour : *${val.slice(0, 200)}*`, files: [new AttachmentBuilder(res.buffer, { name: 'iwc-image.png' })] }).catch(() => {});
        return true;
      }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      let out = null, titre = '';
      if (cid === 'asst_ask_modal') { out = await _repondreQuestion(loadDB(), val); titre = '💬 Réponse'; }
      else if (cid === 'asst_write_modal') { out = await _redigerRP(val); titre = '✍️ Rédaction'; }
      else if (cid === 'asst_sum_modal') { out = await _resumer(val); titre = '📝 Résumé'; }
      else if (cid === 'asst_contrat_modal') { out = await _analyserContrat(val); titre = '📑 Analyse de contrat'; }
      else return true;
      if (!out) { await interaction.editReply({ content: '❌ Assistant IA indisponible (clé API absente ou erreur). Réessaie plus tard.' }).catch(() => {}); return true; }
      const e = new EmbedBuilder().setColor(0x2B2118).setTitle(titre).setDescription(out.slice(0, 4096)).setFooter({ text: 'Assistant IA — à vérifier avant usage' });
      await interaction.editReply({ embeds: [e] }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ assistant routeInteraction:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerPanneau, rowPourCommandement, estAcces, SALON_PANEL };
