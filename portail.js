// ═══════════════════════════════════════════════════════════════
//  portail.js — Portail Web IWC (pages interactives, style « carte cliquable »)
//  100% ADDITIF : aucune donnée n'est modifiée par ces pages (vues seule
//  lecture), servies par le serveur HTTP du bot avec un lien privé (token).
//
//  Un seul bouton Discord → un lien personnel → une page d'accueil qui
//  donne accès à tous les outils (chacun garde le même token) :
//   🖼️ Mur des avis de recherche   🕸️ La Toile (tableau d'enquête)
//   🏛️ Organigramme                📈 Trésorerie en graphiques (Direction)
//   🗂️ Kanban des opérations       📇 Registre des membres
//   📜 Frise chronologique         📰 La Gazette de Blackwater
// ═══════════════════════════════════════════════════════════════
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
let dbMod = {}; try { dbMod = require('./db'); } catch {}
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
// Hiérarchie officielle (grades unifiés, résolus par rôle Discord) — source de vérité partagée
let _gradesUnifies = [];
try { _gradesUnifies = require('./notion-modules-v3').GRADES_UNIFIES || []; } catch {}
if (!_gradesUnifies.length) _gradesUnifies = [
  { emoji: '👑', nom: 'Fondateur', match: ['Fondateur'], desc: "Vision d'ensemble, dernière décision." },
  { emoji: '🔴', nom: 'Le Conseil — Directeur / Co-Directeur', match: ['Conseil', 'Directeur'], desc: 'La direction : pilote la compagnie.' },
  { emoji: '🎖️', nom: 'Officier de Terrain', match: ['Officier'], desc: 'Encadre le terrain, organise les opérations.' },
  { emoji: '🔵', nom: 'Agent Confirmé', match: ['Agent Confimé', 'Agent Confirmé', 'Agent'], desc: 'Membre aguerri et autonome.' },
  { emoji: '🟢', nom: 'Opérateur', match: ['Opérateur'], desc: 'Le cœur opérationnel de la compagnie.' },
  { emoji: '⚪', nom: 'Recrue — Probatoire', match: ['Recrue'], desc: "Nouvelle recrue en période d'essai." },
];

// Salon d'accueil du portail (par défaut : le salon de la carte interactive)
const PORTAIL_CHANNEL_ID = process.env.PORTAIL_CHANNEL_ID || '1519308989119074435';

// ── Accréditations (mêmes 3 niveaux que la carte) ──
let _isMembre = () => true, _isDirection = () => false;
function init(opts) { if (opts?.isMembre) _isMembre = opts.isMembre; if (opts?.isDirection) _isDirection = opts.isDirection; }
const _rank = { public: 0, membre: 1, confidentiel: 2 };
function _atLeast(level, min) { return (_rank[level] || 0) >= (_rank[min] || 0); }

// ── Adresse publique (auto-captée par le serveur HTTP → db.carte.baseUrl) ──
function _baseUrl() {
  const e = process.env.PUBLIC_URL || process.env.BASE_URL || process.env.RENDER_EXTERNAL_URL
    || (process.env.RENDER_EXTERNAL_HOSTNAME ? 'https://' + process.env.RENDER_EXTERNAL_HOSTNAME : '')
    || (loadDB().carte?.baseUrl || '');
  return (e || '').replace(/\/$/, '');
}

// ── Token privé (db.portail.tokens) ──
function _ensure(db) { if (!db.portail) db.portail = {}; if (!db.portail.tokens) db.portail.tokens = {}; return db.portail; }
function _rndTok() { return Math.random().toString(36).slice(2) + Math.random().toString(36).slice(2, 8); }
function creerToken(member) {
  const level = _isDirection(member) ? 'confidentiel' : (_isMembre(member) ? 'membre' : 'public');
  const db = loadDB(); const p = _ensure(db); const now = Date.now();
  for (const [t, v] of Object.entries(p.tokens)) if (!v?.exp || v.exp < now) delete p.tokens[t];
  const tok = _rndTok(); p.tokens[tok] = { level, userId: member.id, exp: now + 24 * 3600 * 1000 }; saveDB(db);
  return { tok, level };
}
function _tokInfo(tok) { const v = (loadDB().portail?.tokens || {})[tok]; if (!v || (v.exp && v.exp < Date.now())) return null; return v; }

// ═══════════════════════════════════════════════════════════════
//  Panneau Discord
// ═══════════════════════════════════════════════════════════════
function _panelEmbed() {
  return new EmbedBuilder().setColor(0x8B5A2B).setTitle('🌐 PORTAIL WEB — IRON WOLF COMPANY')
    .setDescription([
      "*Tes outils interactifs, comme la carte cliquable — mais pour toute la maison.*",
      "Clique sur **Ouvrir le portail** : un lien **personnel** s'ouvre sur ton téléphone ou ton ordinateur.",
      '',
      '🗺️ **Carte de la Confrérie** — la carte interactive (planques, cibles, itinéraires).',
      '🖼️ **Mur des avis de recherche** — les affiches WANTED, filtrables.',
      '🕸️ **La Toile** — le tableau d\'enquête (contacts reliés par des fils).',
      '🏛️ **Organigramme** — la hiérarchie de la compagnie, en clair.',
      '🗂️ **Opérations (kanban)** — toutes les opérations par colonne.',
      '📇 **Registre des membres** — l\'annuaire, cherchable et filtrable.',
      '📜 **Frise chronologique** — l\'histoire de la maison, dans l\'ordre.',
      '📰 **La Gazette de Blackwater** — le journal de la semaine.',
      '📈 **Trésorerie en graphiques** *(Direction)* — les chiffres, en images.',
      '',
      '_Lien privé, valable 24h. Ce que tu vois dépend de ton accréditation._',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company • Portail web' });
}
function _panelRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('portail_open').setLabel('Ouvrir le portail').setEmoji('🌐').setStyle(ButtonStyle.Success),
  )];
}
async function installerPanel(guild) {
  try {
    const ch = guild.channels.cache.get(PORTAIL_CHANNEL_ID) || await guild.channels.fetch(PORTAIL_CHANNEL_ID).catch(() => null);
    if (!ch?.send) return;
    const botId = guild.client.user.id;
    const payload = { embeds: [_panelEmbed()], components: _panelRows() };
    const db = loadDB();
    let msg = null;
    if (db.portailPanelId) msg = await ch.messages.fetch(db.portailPanelId).catch(() => null);
    if (!msg) { const msgs = await ch.messages.fetch({ limit: 25 }).catch(() => null); msg = msgs ? [...msgs.values()].find(m => m.author?.id === botId && (m.embeds?.[0]?.title || '').includes('PORTAIL WEB')) : null; }
    if (msg) { await msg.edit(payload).catch(() => {}); if (db.portailPanelId !== msg.id) { const d = loadDB(); d.portailPanelId = msg.id; saveDB(d); } }
    else { const sent = await ch.send(payload).catch(() => null); if (sent) { try { await sent.pin(); } catch {} const d = loadDB(); d.portailPanelId = sent.id; saveDB(d); } }
  } catch (e) { console.log('❌ portail installerPanel:', e.message); }
}
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (interaction.isButton?.() && id === 'portail_open') {
      const base = _baseUrl();
      if (!base) { await interaction.reply({ content: "⚠️ L'adresse web du bot n'est pas encore connue. Ouvre d'abord la **carte cliquable** une fois (elle capte l'adresse), puis réessaie.", flags: MessageFlags.Ephemeral }); return true; }
      const { tok, level } = creerToken(interaction.member);
      const nivTxt = level === 'confidentiel' ? '🔴 Direction' : level === 'membre' ? '🟡 Membre' : '🟢 Public';
      const lien = `${base}/portail?k=${tok}`;
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setStyle(ButtonStyle.Link).setLabel('Ouvrir le portail').setEmoji('🌐').setURL(lien));
      await interaction.reply({ content: `🌐 **Portail Web IWC** — accès ${nivTxt}.\n🖱️ *Clique le bouton : tous tes outils s'ouvrent. Lien personnel, valable 24h.*`, components: [row], flags: MessageFlags.Ephemeral });
      return true;
    }
  } catch (e) {
    if ([10062, 40060, 10008].includes(e?.code)) return true;
    console.log('❌ portail routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur sur le portail.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
  return false;
}

// ═══════════════════════════════════════════════════════════════
//  Helpers HTML
// ═══════════════════════════════════════════════════════════════
function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function jinj(o) { return JSON.stringify(o).replace(/</g, '\\u003c').replace(/-->/g, '--\\u003e').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
function nf(n) { return Number(n || 0).toLocaleString('fr-FR'); }
function _dateFR(d) { if (!d) return ''; const t = new Date(d); return isNaN(t.getTime()) ? '' : t.toLocaleDateString('fr-FR'); }

const DANGER = {
  faible: { label: 'Faible', emoji: '🟢', color: '#3ca03c' },
  moyen: { label: 'Moyen', emoji: '🟡', color: '#e0b028' },
  eleve: { label: 'Élevé', emoji: '🟠', color: '#e0762e' },
  extreme: { label: 'Extrême', emoji: '🔴', color: '#d63a3a' },
};
const AVIS_STATUT = {
  chasse: { label: 'En chasse', emoji: '🟠', color: '#e0762e' },
  reperee: { label: 'Repérée', emoji: '🔵', color: '#3498db' },
  capturee: { label: 'Capturée', emoji: '✅', color: '#3ca03c' },
  eliminee: { label: 'Éliminée', emoji: '💀', color: '#d63a3a' },
  abandonnee: { label: 'Abandonnée', emoji: '⚫', color: '#777' },
};
const OP_STATUT = {
  preparation: { label: '🧩 Préparation', color: '#8a6d3b' },
  programmee: { label: '📅 Programmée', color: '#2e6da4' },
  attente_direction: { label: '⏳ Attente Direction', color: '#7d5aa0' },
  en_cours: { label: '🔥 En cours', color: '#c0392b' },
  terminee: { label: '✅ Terminée', color: '#3ca03c' },
  termine: { label: '✅ Terminée', color: '#3ca03c' },
  annulee: { label: '⚫ Annulée', color: '#777' },
};
const M_STATUT = {
  actif: { label: 'Actif', emoji: '🟢', color: '#3ca03c' },
  absent: { label: 'Absent', emoji: '🟡', color: '#e0b028' },
  inactif: { label: 'Inactif', emoji: '🔴', color: '#d63a3a' },
  visiteur: { label: 'Visiteur', emoji: '👁️', color: '#3498db' },
  parti: { label: 'Parti', emoji: '⚫', color: '#777' },
};

// Niveaux hiérarchiques (organigramme)
function _tier(rang) {
  const r = (rang || '').toLowerCase();
  if (/concepteur|fléau|fleau|fondateur/.test(r)) return 0;
  if (/directeur|conseil|co-?dir/.test(r)) return 1;
  if (/officier|instructeur|secrétaire|secretaire/.test(r)) return 2;
  if (/visiteur/.test(r)) return 4;
  return 3;
}
const TIER_LABEL = ['👑 Haut Commandement', '🎖️ Direction', '⭐ Encadrement', '🤠 Membres', '👁️ Visiteurs'];

// ── Agrégats de données (lecture seule) ──
function _clean(v) { return v && !/^(non visible|aucune? visible|aucun visible|non applicable|non identifiable|n\/a|néant|rasé)$/i.test(String(v).trim()); }
function _montant(s) { const m = String(s || '').replace(/\s/g, '').match(/(\d[\d.,]*)/); return m ? (parseInt(m[1].replace(/[.,]/g, ''), 10) || 0) : 0; }

function _traques(db) {
  return (db.traques || []).map(t => {
    const dg = DANGER[t.dangerosite] ? t.dangerosite : 'moyen';
    const st = AVIS_STATUT[t.status] ? t.status : 'chasse';
    const resume = (t.full && _clean(t.full.resume)) ? String(t.full.resume) : String(t.signalement || '');
    const trait = (t.full && _clean(t.full.trait_distinctif)) ? String(t.full.trait_distinctif) : '';
    return {
      id: t.id, cible: t.cible || 'Cible inconnue', prime: t.prime || '—', primeNum: _montant(t.prime),
      dangerosite: dg, status: st, position: t.position || '—',
      resume: resume.slice(0, 320), trait: trait.slice(0, 200),
      commanditaire: t.commanditaire || '—', vivantMort: t.vivantMort || 'Indifférent',
      chasseurs: (t.chasseurs || []).length, photo: t.photo || t.photoCapture || '',
      createdAt: t.createdAt || null, closedAt: t.closedAt || null,
      actif: st === 'chasse' || st === 'reperee',
    };
  });
}
function _members(db) {
  return Object.values(db.members || {}).map(m => ({
    id: m.id, name: m.name || 'Inconnu', rang: m.rang || '—', pole: m.pole || '',
    status: M_STATUT[m.status] ? m.status : 'actif',
    lastActivity: m.lastActivity || null, joinedAt: m.joinedAt || null, tier: _tier(m.rang),
  }));
}
function _contacts(db) {
  return (db.repertoire?.contacts || []).map(c => ({
    id: c.id, nom: c.nom || c.nomsurnom || '—', type: c.type || 'Neutre',
    telegramme: c.telegramme || '', metier: c.metier || '', secteur: c.secteur || '',
    affiliation: c.affiliation || '', relation: c.relation || '', fiabilite: parseInt(c.fiabilite, 10) || 0,
    statut: c.statut || '', notes: String(c.notes || '').slice(0, 400),
  }));
}
function _operations(db) {
  return (db.operations || []).map(o => ({
    id: o.id, name: o.name || 'Opération', lieu: o.lieu || '—', pole: o.pole || '',
    status: OP_STATUT[o.status] ? o.status : 'preparation',
    objectif: String(o.objectif || '').slice(0, 400), butin: o.butin || '',
    participants: (o.participants || []).length, quand: o.quandTexte || '',
    createdAt: o.createdAt || null, createurNom: o.createurNom || '',
  }));
}

// ═══════════════════════════════════════════════════════════════
//  Coquille commune (thème Far West)
// ═══════════════════════════════════════════════════════════════
function _shell(opts) {
  const { title, tok, body, extraCss, script, back } = opts;
  const backLink = back === false ? '' : `<a class="back" href="/portail?k=${esc(tok)}">← Portail</a>`;
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(title)} — IWC</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cinzel:wght@600;900&family=EB+Garamond:ital@0;1&family=Rye&family=Special+Elite&display=swap" rel="stylesheet">
<style>
*{box-sizing:border-box}html{-webkit-text-size-adjust:100%}
body{margin:0;font-family:'EB Garamond',Georgia,serif;background:radial-gradient(ellipse at 50% -10%,#2a1d12,#140e09 70%);color:#e9dcc2;min-height:100vh}
a{color:#d9a441;text-decoration:none}
.top{position:sticky;top:0;z-index:20;display:flex;align-items:center;gap:12px;padding:12px 16px;background:#1c140dee;border-bottom:1px solid #4a3826;backdrop-filter:blur(4px)}
.top h1{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.1rem,3.6vw,1.6rem);color:#f2e4c4;margin:0;text-shadow:0 2px 0 #000}
.top .crest{font-size:1.5rem}
.back{margin-left:auto;font-family:'Special Elite',monospace;font-size:.82rem;letter-spacing:.06em;border:1px solid #5a4632;border-radius:8px;padding:7px 12px;background:#241a12}
.back:hover{background:#31241a}
.wrap{max-width:1100px;margin:0 auto;padding:18px 16px 60px}
.muted{opacity:.72}.center{text-align:center}
.empty{text-align:center;opacity:.7;font-style:italic;padding:50px 16px}
footer{text-align:center;padding:26px 16px 40px;font-family:'Special Elite',monospace;font-size:.68rem;letter-spacing:.1em;color:#9c8a66}
${extraCss || ''}
</style></head><body>
<div class="top"><span class="crest">🐺</span><h1>${esc(title)}</h1>${backLink}</div>
${body}
<footer>Iron Wolf Company · Blackwater · « La force est dans l'ombre »</footer>
${script ? `<script>\n${script}\n</script>` : ''}
</body></html>`;
}

function _locked(min) {
  const txt = min === 'confidentiel' ? "Cet outil est réservé à la Direction." : "Cet outil est réservé aux membres de la compagnie.";
  return `<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#140e09;color:#e9dcc2;text-align:center;padding:70px 20px"><div style="font-size:48px">🔒</div><h2 style="color:#d9a441">Accès restreint</h2><p>${txt}</p></body>`;
}
function _expired() {
  return `<!doctype html><meta charset="utf-8"><body style="font-family:Georgia,serif;background:#140e09;color:#e9dcc2;text-align:center;padding:70px 20px"><div style="font-size:48px">⌛</div><h2 style="color:#d9a441">Lien expiré ou invalide</h2><p>Génère un nouveau lien depuis Discord (bouton « 🌐 Ouvrir le portail »).</p></body>`;
}

// ═══════════════════════════════════════════════════════════════
//  Page d'accueil du portail
// ═══════════════════════════════════════════════════════════════
function _pageAccueil(tok, level) {
  const db = loadDB();
  const traques = _traques(db), ops = _operations(db), membres = _members(db), contacts = _contacts(db);
  const cAvisActifs = traques.filter(t => t.actif).length;
  const cOpsActives = ops.filter(o => ['preparation', 'programmee', 'en_cours', 'attente_direction'].includes(o.status)).length;
  const cMembres = membres.filter(m => m.status !== 'parti').length;
  const cLieux = (db.carte?.points || []).length;
  const tools = [
    { emoji: '🗺️', titre: 'Carte de la Confrérie', desc: 'La carte interactive : planques, cibles, points d\'intérêt et itinéraires — cliquable et zoomable.', badge: cLieux ? cLieux + ' lieu(x)' : '', min: 'membre', url: 'carte' },
    { href: 'mur', emoji: '🖼️', titre: 'Mur des avis de recherche', desc: 'Les affiches WANTED de la compagnie, filtrables par dangerosité et statut.', badge: cAvisActifs + ' actif(s)', min: 'membre' },
    { href: 'toile', emoji: '🕸️', titre: 'La Toile', desc: "Le tableau d'enquête : les contacts reliés entre eux par des fils rouges.", badge: contacts.length + ' contact(s)', min: 'membre' },
    { href: 'organigramme', emoji: '🏛️', titre: 'Organigramme', desc: 'La hiérarchie de la maison, du haut commandement aux membres.', badge: cMembres + ' membre(s)', min: 'membre' },
    { href: 'kanban', emoji: '🗂️', titre: 'Opérations (kanban)', desc: 'Toutes les opérations rangées par colonne selon leur avancement.', badge: cOpsActives + ' active(s)', min: 'membre' },
    { href: 'registre', emoji: '📇', titre: 'Registre des membres', desc: "L'annuaire complet, cherchable et filtrable par pôle et statut.", badge: cMembres + ' fiche(s)', min: 'membre' },
    { href: 'frise', emoji: '📜', titre: 'Frise chronologique', desc: "L'histoire de la compagnie, tous les faits marquants dans l'ordre.", badge: '', min: 'membre' },
    { href: 'gazette', emoji: '📰', titre: 'La Gazette de Blackwater', desc: "Le journal de la semaine : tout ce qui s'est passé, façon 1899.", badge: '', min: 'membre' },
    { href: 'tresorerie', emoji: '📈', titre: 'Trésorerie en graphiques', desc: 'Les chiffres de la maison en images : coffre, pépites, contrats.', badge: 'Direction', min: 'confidentiel' },
  ];
  const cards = tools.map(t => {
    const ok = _atLeast(level, t.min);
    const inner = `<div class="pc-em">${t.emoji}</div><div class="pc-t">${esc(t.titre)}</div><div class="pc-d">${esc(t.desc)}</div>${t.badge ? `<div class="pc-b">${esc(t.badge)}</div>` : ''}`;
    if (!ok) return `<div class="pc locked"><div class="pc-lock">🔒</div>${inner}</div>`;
    // Outil « externe » (ex : la carte, servie sur /carte) → lien direct ; sinon page du portail.
    const href = t.url ? `/${t.url}?k=${esc(tok)}` : `/portail/${t.href}?k=${esc(tok)}`;
    return `<a class="pc" href="${href}">${inner}</a>`;
  }).join('');
  const nivTxt = level === 'confidentiel' ? '🔴 Direction' : level === 'membre' ? '🟡 Membre' : '🟢 Public';
  const body = `<div class="wrap">
  <div class="hero">
    <div class="hero-c">🐺</div>
    <div class="hero-t">Portail Iron Wolf Company</div>
    <div class="hero-s">Tous tes outils, au même endroit — accès ${esc(nivTxt)}</div>
  </div>
  <div class="grid">${cards}</div>
  </div>`;
  const extraCss = `
.hero{text-align:center;padding:20px 10px 26px}
.hero-c{font-size:56px;filter:drop-shadow(0 4px 12px #0009)}
.hero-t{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.6rem,5.5vw,2.6rem);color:#f2e4c4;text-shadow:0 2px 0 #000}
.hero-s{font-family:'Special Elite',monospace;font-size:.78rem;letter-spacing:.16em;text-transform:uppercase;color:#c8a45c;margin-top:8px}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(230px,1fr));gap:16px}
.pc{display:block;position:relative;background:linear-gradient(160deg,#241a12,#191109);border:1px solid #b8893b55;border-radius:12px;padding:20px 18px;box-shadow:0 8px 22px #0006;transition:transform .12s,border-color .12s;color:#e9dcc2}
.pc:hover{transform:translateY(-3px);border-color:#d9a441}
.pc.locked{opacity:.5;filter:grayscale(.5)}
.pc-lock{position:absolute;top:12px;right:14px;font-size:1rem}
.pc-em{font-size:2rem}
.pc-t{font-family:'Cinzel',serif;font-weight:700;font-size:1.12rem;color:#f0d89a;margin:8px 0 4px}
.pc-d{font-size:.98rem;line-height:1.4;opacity:.85}
.pc-b{margin-top:10px;display:inline-block;font-family:'Special Elite',monospace;font-size:.68rem;letter-spacing:.08em;text-transform:uppercase;background:#3a2c1e;border:1px solid #5a4632;border-radius:20px;padding:3px 10px;color:#d9a441}`;
  return _shell({ title: 'Portail IWC', tok, body, extraCss, back: false });
}

// ═══════════════════════════════════════════════════════════════
//  🖼️ Mur des avis de recherche
// ═══════════════════════════════════════════════════════════════
function _pageMur(tok) {
  const db = loadDB();
  const list = _traques(db).sort((a, b) => (b.actif - a.actif) || (b.primeNum - a.primeNum));
  const posters = list.map(t => {
    const dg = DANGER[t.dangerosite]; const st = AVIS_STATUT[t.status];
    const pic = t.photo ? `<img class="wp-img" src="${esc(t.photo)}" alt="" onerror="this.remove()">` : '';
    const infos = [
      t.trait ? `<div class="wp-line">⭐ <b>Signe :</b> ${esc(t.trait)}</div>` : '',
      `<div class="wp-line">📍 ${esc(t.position)}</div>`,
      `<div class="wp-line">🎯 ${esc(t.vivantMort)}</div>`,
      t.commanditaire && t.commanditaire !== '—' ? `<div class="wp-line">👤 ${esc(t.commanditaire)}</div>` : '',
      t.chasseurs ? `<div class="wp-line">🤠 ${t.chasseurs} chasseur(s)</div>` : '',
    ].filter(Boolean).join('');
    return `<div class="wp" data-name="${esc((t.cible || '').toLowerCase())}" data-danger="${t.dangerosite}" data-status="${t.actif ? 'actif' : 'clos'}">
      <div class="wp-top">WANTED</div>
      <div class="wp-sub">${esc(t.vivantMort.toLowerCase().includes('mort') ? 'MORT OU VIF' : 'RECHERCHÉ')}</div>
      ${pic || '<div class="wp-img nopic">👤</div>'}
      <div class="wp-name">${esc(t.cible)}</div>
      ${t.resume ? `<div class="wp-res">${esc(t.resume)}</div>` : ''}
      <div class="wp-info">${infos}</div>
      <div class="wp-foot"><span class="wp-prime">${esc(t.prime)}</span></div>
      <div class="wp-badges"><span class="wp-badge" style="background:${dg.color}">${dg.emoji} ${dg.label}</span><span class="wp-badge" style="background:${st.color}">${st.emoji} ${st.label}</span></div>
    </div>`;
  }).join('');
  const body = `<div class="wrap">
    <div class="bar">
      <input id="q" placeholder="🔎 Chercher une cible…">
      <span class="chips">
        <button class="chip" data-fd="faible">🟢 Faible</button>
        <button class="chip" data-fd="moyen">🟡 Moyen</button>
        <button class="chip" data-fd="eleve">🟠 Élevé</button>
        <button class="chip" data-fd="extreme">🔴 Extrême</button>
      </span>
      <span class="chips">
        <button class="chip" data-fs="actif">🟠 En cours</button>
        <button class="chip" data-fs="clos">🔒 Clôturés</button>
      </span>
      <span id="count" class="count">${list.length} avis</span>
    </div>
    ${list.length ? `<div class="board">${posters}</div>` : '<div class="empty">Aucun avis de recherche pour le moment.</div>'}
  </div>`;
  const extraCss = `
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px}
.bar input{flex:1;min-width:180px;background:#241a12;color:#e9dcc2;border:1px solid #5a4632;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:1rem}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-family:'Special Elite',monospace;font-size:.72rem;background:#241a12;color:#e9dcc2;border:1px solid #5a4632;border-radius:20px;padding:6px 11px;cursor:pointer}
.chip.on{background:#d9a441;color:#1a1208;border-color:#d9a441;font-weight:bold}
.count{margin-left:auto;font-family:'Special Elite',monospace;font-size:.74rem;opacity:.8}
.board{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:18px}
.wp{background:linear-gradient(#efe2c4,#e3d2ab);color:#2a1c10;border-radius:6px;padding:16px 16px 14px;box-shadow:0 8px 20px #0007;border:1px solid #b89a63;position:relative;font-family:'Special Elite',monospace;text-align:center;filter:sepia(.15)}
.wp-top{font-family:'Rye',serif;font-size:1.7rem;letter-spacing:.06em;color:#3a260f;line-height:1}
.wp-sub{font-size:.66rem;letter-spacing:.28em;margin:2px 0 10px;color:#5a3f22}
.wp-img{width:100%;height:150px;object-fit:cover;border:3px solid #3a260f;background:#c9b485;display:block}
.wp-img.nopic{display:flex;align-items:center;justify-content:center;font-size:64px;color:#8a6f47;filter:none}
.wp-name{font-family:'Rye',serif;font-size:1.15rem;margin:10px 0 4px;color:#2a1c10;word-break:break-word}
.wp-res{font-family:'EB Garamond',serif;font-size:.9rem;font-style:italic;line-height:1.35;margin-bottom:8px;color:#4a3420}
.wp-info{text-align:left;font-family:'EB Garamond',serif;font-size:.9rem}
.wp-line{margin:2px 0;color:#3a2a18}
.wp-foot{margin-top:10px;border-top:2px dashed #8a6f47;padding-top:8px}
.wp-prime{font-family:'Rye',serif;font-size:1.4rem;color:#7a1f12}
.wp-badges{display:flex;gap:6px;justify-content:center;margin-top:10px;flex-wrap:wrap}
.wp-badge{font-size:.66rem;color:#fff;border-radius:20px;padding:3px 9px;font-family:'Special Elite',monospace;text-shadow:0 1px 1px #0006}`;
  const script = `
(function(){
var q='',dg='',st='';
function apply(){
  var cards=document.querySelectorAll('.wp'),n=0;
  for(var i=0;i<cards.length;i++){var c=cards[i],ok=true;
    if(q && c.getAttribute('data-name').indexOf(q)<0)ok=false;
    if(dg && c.getAttribute('data-danger')!==dg)ok=false;
    if(st && c.getAttribute('data-status')!==st)ok=false;
    c.style.display=ok?'':'none';if(ok)n++;}
  var cc=document.getElementById('count');if(cc)cc.textContent=n+' avis';
}
var s=document.getElementById('q');if(s)s.addEventListener('input',function(e){q=(e.target.value||'').toLowerCase();apply();});
function wire(attr,cur,setter){var els=document.querySelectorAll('['+'data-'+attr+']');for(var i=0;i<els.length;i++){(function(el){el.addEventListener('click',function(){var v=el.getAttribute('data-'+attr);setter(cur()===v?'':v);for(var k=0;k<els.length;k++)els[k].classList.toggle('on',els[k].getAttribute('data-'+attr)===cur());apply();});})(els[i]);}}
wire('fd',function(){return dg;},function(v){dg=v;});
wire('fs',function(){return st;},function(v){st=v;});
})();`;
  return _shell({ title: 'Mur des avis de recherche', tok, body, extraCss, script });
}

// ═══════════════════════════════════════════════════════════════
//  🕸️ La Toile — tableau d'enquête (graphe force-dirigé sur canvas)
// ═══════════════════════════════════════════════════════════════
function _pageToile(tok) {
  const db = loadDB();
  const contacts = _contacts(db);
  const TC = { 'Allié': '#3ca03c', 'Client': '#2870c8', 'Indic': '#b8892e', 'Ennemi': '#c82828', 'Neutre': '#8a7a5a' };
  const nodes = contacts.map((c, i) => ({
    i, nom: c.nom, type: c.type, tel: c.telegramme, metier: c.metier, aff: c.affiliation,
    rel: c.relation, fia: c.fiabilite, statut: c.statut, notes: c.notes,
    color: TC[c.type] || '#8a7a5a',
  }));
  // Liens : contacts partageant une affiliation OU un métier (hors valeurs vides / génériques)
  const edges = [];
  const key = s => (s || '').trim().toLowerCase();
  const groupBy = (field, ignore) => {
    const g = {};
    nodes.forEach(n => { const k = key(n[field]); if (!k || ignore.includes(k)) return; (g[k] = g[k] || []).push(n.i); });
    Object.entries(g).forEach(([k, arr]) => { for (let a = 0; a < arr.length; a++) for (let b = a + 1; b < arr.length; b++) edges.push({ s: arr[a], t: arr[b], k }); });
  };
  groupBy('aff', ['civil', 'autre', '']);
  groupBy('metier', ['']);
  const data = { nodes, edges };
  const body = `<div id="corkwrap"><canvas id="cork"></canvas></div>
  <div id="tip" class="tip"></div>
  <div class="legend">
    <div class="lg"><span class="dot" style="background:#3ca03c"></span>Allié</div>
    <div class="lg"><span class="dot" style="background:#2870c8"></span>Client</div>
    <div class="lg"><span class="dot" style="background:#b8892e"></span>Indic</div>
    <div class="lg"><span class="dot" style="background:#c82828"></span>Ennemi</div>
    <div class="lg"><span class="dot" style="background:#8a7a5a"></span>Neutre</div>
    <div class="lg" style="opacity:.8">🧵 fil = affiliation / métier commun</div>
  </div>
  ${nodes.length ? '' : '<div class="empty" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center">Aucun contact dans le carnet pour l\'instant.</div>'}`;
  const extraCss = `
body{overflow:hidden}
#corkwrap{position:fixed;inset:52px 0 0 0;background:#6b4a2a url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='60'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='60' height='60' filter='url(%23n)' opacity='0.08'/%3E%3C/svg%3E");touch-action:none;cursor:grab}
#corkwrap.drag{cursor:grabbing}
#cork{display:block;width:100%;height:100%}
.tip{position:fixed;z-index:40;max-width:280px;background:#efe2c4;color:#2a1c10;border:1px solid #8a6f47;border-radius:6px;padding:11px 13px;box-shadow:0 8px 22px #0008;font-size:.9rem;display:none;transform:rotate(-1deg);font-family:'Special Elite',monospace}
.tip h3{margin:0 0 5px;font-family:'Rye',serif;font-size:1.05rem;color:#3a260f}
.tip .t-line{margin:2px 0;font-family:'EB Garamond',serif}
.legend{position:fixed;bottom:12px;left:12px;z-index:30;background:#1c140dcc;border:1px solid #5a4632;border-radius:8px;padding:9px 11px;font-size:.8rem;font-family:'Special Elite',monospace}
.legend .lg{display:flex;align-items:center;gap:7px;margin:3px 0}
.legend .dot{width:11px;height:11px;border-radius:50%;display:inline-block}`;
  const script = `
var DATA=${jinj(data)};
var cv=document.getElementById('cork'),ctx=cv&&cv.getContext('2d'),tip=document.getElementById('tip');
if(cv&&ctx&&DATA.nodes.length){
var DPR=Math.min(2,window.devicePixelRatio||1),W=0,H=0;
function size(){var r=cv.parentNode.getBoundingClientRect();W=r.width;H=r.height;cv.width=W*DPR;cv.height=H*DPR;ctx.setTransform(DPR,0,0,DPR,0,0);}
size();window.addEventListener('resize',function(){size();});
var N=DATA.nodes;
for(var i=0;i<N.length;i++){N[i].x=W/2+(Math.random()-0.5)*W*0.7;N[i].y=H/2+(Math.random()-0.5)*H*0.7;N[i].vx=0;N[i].vy=0;}
var OX=0,OY=0,SC=1;
function tick(){
  for(var i=0;i<N.length;i++){for(var j=i+1;j<N.length;j++){
    var a=N[i],b=N[j],dx=a.x-b.x,dy=a.y-b.y,d2=dx*dx+dy*dy+0.01,d=Math.sqrt(d2);
    var f=2600/d2;var ux=dx/d,uy=dy/d;a.vx+=ux*f;a.vy+=uy*f;b.vx-=ux*f;b.vy-=uy*f;
  }}
  for(var e=0;e<DATA.edges.length;e++){var s=N[DATA.edges[e].s],t=N[DATA.edges[e].t];if(!s||!t)continue;var dx=t.x-s.x,dy=t.y-s.y,d=Math.sqrt(dx*dx+dy*dy)||1;var f=(d-140)*0.008;var ux=dx/d,uy=dy/d;s.vx+=ux*f;s.vy+=uy*f;t.vx-=ux*f;t.vy-=uy*f;}
  var cx=W/2,cy=H/2;
  for(var i=0;i<N.length;i++){var n=N[i];if(n===drag)continue;n.vx+=(cx-n.x)*0.0016;n.vy+=(cy-n.y)*0.0016;n.vx*=0.86;n.vy*=0.86;n.x+=n.vx;n.y+=n.vy;}
}
function draw(){
  ctx.clearRect(0,0,W,H);ctx.save();ctx.translate(OX,OY);ctx.scale(SC,SC);
  ctx.lineWidth=1.1;ctx.strokeStyle='rgba(150,30,25,0.5)';
  for(var e=0;e<DATA.edges.length;e++){var s=N[DATA.edges[e].s],t=N[DATA.edges[e].t];if(!s||!t)continue;ctx.beginPath();ctx.moveTo(s.x,s.y);ctx.lineTo(t.x,t.y);ctx.stroke();}
  for(var i=0;i<N.length;i++){var n=N[i];
    ctx.beginPath();ctx.arc(n.x,n.y,15,0,6.2832);ctx.fillStyle=n.color;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#efe2c4';ctx.stroke();
    ctx.fillStyle='#efe2c4';ctx.font='13px Special Elite, monospace';ctx.textAlign='center';ctx.textBaseline='top';
    var nm=n.nom.length>18?n.nom.slice(0,17)+'…':n.nom;ctx.fillText(nm,n.x,n.y+19);
  }
  ctx.restore();
}
function loop(){tick();draw();requestAnimationFrame(loop);}loop();
function toWorld(px,py){return {x:(px-OX)/SC,y:(py-OY)/SC};}
function hit(px,py){var w=toWorld(px,py);for(var i=N.length-1;i>=0;i--){var dx=N[i].x-w.x,dy=N[i].y-w.y;if(dx*dx+dy*dy<=17*17)return N[i];}return null;}
var drag=null,dox=0,doy=0,panning=false,psx=0,psy=0,pox=0,poy=0,moved=false;
function rel(ev){var r=cv.getBoundingClientRect();return {x:ev.clientX-r.left,y:ev.clientY-r.top};}
cv.addEventListener('pointerdown',function(ev){var p=rel(ev);var n=hit(p.x,p.y);moved=false;if(n){drag=n;var w=toWorld(p.x,p.y);dox=n.x-w.x;doy=n.y-w.y;}else{panning=true;psx=ev.clientX;psy=ev.clientY;pox=OX;poy=OY;cv.parentNode.classList.add('drag');}cv.setPointerCapture&&cv.setPointerCapture(ev.pointerId);});
window.addEventListener('pointermove',function(ev){var p=rel(ev);if(drag){var w=toWorld(p.x,p.y);drag.x=w.x+dox;drag.y=w.y+doy;drag.vx=0;drag.vy=0;moved=true;showTip(drag,ev.clientX,ev.clientY);}else if(panning){OX=pox+(ev.clientX-psx);OY=poy+(ev.clientY-psy);moved=true;}else{var n=hit(p.x,p.y);if(n)showTip(n,ev.clientX,ev.clientY);else tip.style.display='none';cv.style.cursor=n?'pointer':'';}});
window.addEventListener('pointerup',function(){drag=null;panning=false;cv.parentNode.classList.remove('drag');});
cv.addEventListener('wheel',function(ev){ev.preventDefault();var p=rel(ev);var ds=ev.deltaY<0?1.12:1/1.12;var ns=Math.min(3,Math.max(0.4,SC*ds));var k=ns/SC;OX=p.x-(p.x-OX)*k;OY=p.y-(p.y-OY)*k;SC=ns;},{passive:false});
function esc2(s){var d=document.createElement('div');d.textContent=s==null?'':String(s);return d.innerHTML;}
function showTip(n,cx,cy){var h='<h3>'+esc2(n.nom)+'</h3>';h+='<div class="t-line">🏷️ '+esc2(n.type)+(n.rel?(' · '+esc2(n.rel)):'')+'</div>';if(n.metier)h+='<div class="t-line">💼 '+esc2(n.metier)+'</div>';if(n.aff)h+='<div class="t-line">🪪 '+esc2(n.aff)+'</div>';if(n.tel)h+='<div class="t-line">📟 '+esc2(n.tel)+'</div>';if(n.fia)h+='<div class="t-line">⭐ '+n.fia+'/5</div>';if(n.statut)h+='<div class="t-line">🩸 '+esc2(n.statut)+'</div>';if(n.notes)h+='<div class="t-line" style="margin-top:5px;font-style:italic">'+esc2(n.notes)+'</div>';tip.innerHTML=h;tip.style.display='block';var tw=tip.offsetWidth,th=tip.offsetHeight;var x=cx+14,y=cy+14;if(x+tw>window.innerWidth)x=cx-tw-14;if(y+th>window.innerHeight)y=cy-th-14;tip.style.left=x+'px';tip.style.top=y+'px';}
cv.addEventListener('pointerleave',function(){tip.style.display='none';});
}`;
  return _shell({ title: "La Toile — tableau d'enquête", tok, body, extraCss, script });
}

// ═══════════════════════════════════════════════════════════════
//  🏛️ Organigramme — hiérarchie unifiée officielle (rôles Discord)
// ═══════════════════════════════════════════════════════════════
// Construit les mêmes grades que la commande /hierarchie : grades unifiés
// résolus par les VRAIS rôles Discord (source de vérité). Repli sur le champ
// « rang » stocké si la guild n'est pas disponible.
async function _orgaTiers(db, guild) {
  const clean = s => (s || '').toLowerCase();
  // 1) Source de vérité : rôles Discord
  if (guild && guild.roles && guild.members) {
    try {
      const all = await guild.members.fetch();
      const roleDuGrade = g =>
        guild.roles.cache.find(r => g.match.some(m => clean(r.name) === clean(m)))
        || guild.roles.cache.find(r => g.match.some(m => clean(r.name).includes(clean(m))));
      const deja = new Set();
      const tiers = [];
      for (const g of _gradesUnifies) {
        const role = roleDuGrade(g);
        const mems = role ? [...all.values()].filter(m => !m.user.bot && m.roles.cache.has(role.id) && !deja.has(m.id)) : [];
        mems.forEach(m => deja.add(m.id));
        tiers.push({ emoji: g.emoji, nom: g.nom, desc: g.desc || '', membres: mems.map(m => ({ name: m.displayName, status: (db.members[m.id] && db.members[m.id].status) || 'actif' })).sort((a, b) => a.name.localeCompare(b.name)) });
      }
      return { tiers, source: 'roles' };
    } catch {}
  }
  // 2) Repli : champ « rang » stocké, mappé sur les mêmes grades
  const membres = _members(db).filter(m => m.status !== 'parti' && m.status !== 'visiteur');
  const deja = new Set();
  const tiers = _gradesUnifies.map(g => {
    const mems = membres.filter(m => !deja.has(m.id) && g.match.some(k => clean(m.rang).includes(clean(k))));
    mems.forEach(m => deja.add(m.id));
    return { emoji: g.emoji, nom: g.nom, desc: g.desc || '', membres: mems.map(m => ({ name: m.name, status: m.status })).sort((a, b) => a.name.localeCompare(b.name)) };
  });
  const reste = membres.filter(m => !deja.has(m.id));
  if (reste.length) tiers.push({ emoji: '•', nom: 'Autres membres', desc: '', membres: reste.map(m => ({ name: m.name, status: m.status })).sort((a, b) => a.name.localeCompare(b.name)) });
  return { tiers, source: 'db' };
}
async function _pageOrga(tok, level, guild) {
  const db = loadDB();
  const { tiers, source } = await _orgaTiers(db, guild);
  const memCard = m => { const st = M_STATUT[m.status] || M_STATUT.actif; return `<div class="oc" style="border-left:4px solid ${st.color}"><div class="oc-n">${esc(m.name)}</div><div class="oc-s">${st.emoji} ${st.label}</div></div>`; };
  const totalGrades = tiers.reduce((s, t) => s + t.membres.length, 0);
  let actifs = 0, absents = 0, inactifs = 0;
  tiers.forEach(t => t.membres.forEach(m => { if (m.status === 'absent') absents++; else if (m.status === 'inactif') inactifs++; else actifs++; }));
  const blocks = tiers.map((t, i) => {
    const cards = t.membres.length ? t.membres.map(memCard).join('') : '<div class="oc-empty">— personne —</div>';
    const conn = i < tiers.length - 1 ? '<div class="conn">│</div>' : '';
    return `<div class="tier"><div class="tier-h">${t.emoji} ${esc(t.nom)} <span class="tier-c">${t.membres.length}</span></div>${t.desc ? `<div class="tier-d">${esc(t.desc)}</div>` : ''}<div class="tier-row">${cards}</div></div>${conn}`;
  }).join('');
  const sum = `<span class="og-b" style="background:#3ca03c">✅ ${actifs} actifs</span><span class="og-b" style="background:#e0b028">🟡 ${absents} absents</span><span class="og-b" style="background:#d63a3a">🔴 ${inactifs} inactifs</span>`;
  const body = `<div class="wrap">
    <div class="orga-sum">${sum}</div>
    ${totalGrades || tiers.length ? blocks : '<div class="empty">Aucun membre gradé.</div>'}
    <div class="og-note">${source === 'roles' ? 'Basé sur les vrais rôles Discord — comme la commande /hierarchie.' : 'Basé sur les grades enregistrés (rôles Discord indisponibles au chargement).'}</div>
  </div>`;
  const extraCss = `
.orga-sum{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-bottom:20px}
.og-b{color:#fff;font-family:'Special Elite',monospace;font-size:.74rem;border-radius:20px;padding:5px 12px;text-shadow:0 1px 1px #0006}
.tier{background:linear-gradient(160deg,#241a12,#191109);border:1px solid #b8893b44;border-radius:12px;padding:14px 16px;margin:0 auto;max-width:960px}
.tier-h{font-family:'Cinzel',serif;font-weight:700;color:#f0d89a;text-align:center;font-size:1.15rem;letter-spacing:.03em}
.tier-c{background:#3a2c1e;border:1px solid #5a4632;border-radius:20px;font-size:.72rem;padding:1px 9px;font-family:'Special Elite',monospace;vertical-align:middle}
.tier-d{text-align:center;font-size:.9rem;opacity:.7;font-style:italic;margin:4px 0 12px}
.tier-row{display:flex;flex-wrap:wrap;gap:12px;justify-content:center}
.oc{background:#15100a;border:1px solid #5a4632;border-radius:9px;padding:11px 14px;min-width:160px;box-shadow:0 4px 10px #0005}
.oc-n{font-family:'Cinzel',serif;font-weight:700;color:#f2e4c4;font-size:1.02rem}
.oc-s{font-family:'Special Elite',monospace;font-size:.7rem;opacity:.82;margin-top:3px}
.oc-empty{opacity:.4;font-style:italic;padding:6px 0}
.conn{text-align:center;color:#7a5c3a;font-size:1.6rem;line-height:1;margin:2px 0}
.og-note{text-align:center;font-family:'Special Elite',monospace;font-size:.66rem;opacity:.55;margin-top:20px}`;
  return _shell({ title: 'Organigramme', tok, body, extraCss });
}

// ═══════════════════════════════════════════════════════════════
//  🗂️ Kanban des opérations
// ═══════════════════════════════════════════════════════════════
function _pageKanban(tok) {
  const db = loadDB();
  const ops = _operations(db);
  const cols = [
    { key: ['preparation'], label: '🧩 Préparation' },
    { key: ['programmee', 'attente_direction'], label: '📅 Programmées' },
    { key: ['en_cours'], label: '🔥 En cours' },
    { key: ['terminee', 'termine', 'annulee'], label: '🏁 Terminées' },
  ];
  const poleEmoji = { legal: '⚖️', illegal: '🎭', '': '🐺' };
  function opCard(o) {
    const st = OP_STATUT[o.status];
    return `<details class="kc" style="border-left:4px solid ${st.color}">
      <summary><span class="kc-n">${poleEmoji[o.pole] || '🐺'} ${esc(o.name)}</span><span class="kc-meta">📍 ${esc(o.lieu)}${o.participants ? ' · 👥 ' + o.participants : ''}</span></summary>
      <div class="kc-body">
        ${o.quand ? `<div>🕐 ${esc(o.quand)}</div>` : ''}
        ${o.objectif ? `<div class="kc-obj">${esc(o.objectif)}</div>` : ''}
        ${o.butin ? `<div>💰 ${esc(o.butin)}</div>` : ''}
        ${o.createurNom ? `<div class="muted">Par ${esc(o.createurNom)}${o.createdAt ? ' · ' + esc(_dateFR(o.createdAt)) : ''}</div>` : ''}
      </div>
    </details>`;
  }
  const columns = cols.map(c => {
    const list = ops.filter(o => c.key.includes(o.status));
    return `<div class="kcol"><div class="kcol-h">${c.label}<span class="kcol-c">${list.length}</span></div>${list.length ? list.map(opCard).join('') : '<div class="kcol-e">—</div>'}</div>`;
  }).join('');
  const body = `<div class="wrap wide">${ops.length ? `<div class="kanban">${columns}</div>` : '<div class="empty">Aucune opération enregistrée.</div>'}</div>`;
  const extraCss = `
.wrap.wide{max-width:1300px}
.kanban{display:grid;grid-template-columns:repeat(4,1fr);gap:14px}
@media(max-width:820px){.kanban{grid-template-columns:repeat(2,1fr)}}
@media(max-width:520px){.kanban{grid-template-columns:1fr}}
.kcol{background:#1c140d99;border:1px solid #4a3826;border-radius:12px;padding:10px}
.kcol-h{font-family:'Cinzel',serif;font-weight:700;color:#f0d89a;text-align:center;padding:6px 0 10px;display:flex;justify-content:center;align-items:center;gap:8px;font-size:.98rem}
.kcol-c{background:#3a2c1e;border:1px solid #5a4632;border-radius:20px;font-size:.72rem;padding:1px 9px;font-family:'Special Elite',monospace}
.kcol-e{text-align:center;opacity:.4;padding:14px 0}
.kc{background:#15100a;border:1px solid #5a4632;border-radius:8px;margin-bottom:10px;overflow:hidden}
.kc summary{cursor:pointer;padding:10px 12px;list-style:none;display:flex;flex-direction:column;gap:3px}
.kc summary::-webkit-details-marker{display:none}
.kc-n{font-family:'Cinzel',serif;font-weight:700;color:#f2e4c4;font-size:1rem}
.kc-meta{font-family:'Special Elite',monospace;font-size:.72rem;opacity:.82}
.kc-body{padding:0 12px 12px;font-size:.94rem;line-height:1.5;border-top:1px solid #3a2c1e;margin-top:2px;padding-top:8px}
.kc-obj{font-style:italic;color:#e0d3b8;margin:4px 0}`;
  return _shell({ title: 'Opérations — Kanban', tok, body, extraCss });
}

// ═══════════════════════════════════════════════════════════════
//  📇 Registre des membres
// ═══════════════════════════════════════════════════════════════
function _pageRegistre(tok) {
  const db = loadDB();
  const membres = _members(db).sort((a, b) => (a.tier - b.tier) || a.name.localeCompare(b.name));
  const poleEmoji = { legal: '⚖️ Légal', illegal: '🎭 Illégal', '': '—' };
  const rows = membres.map(m => {
    const st = M_STATUT[m.status];
    return `<div class="rc" data-name="${esc(m.name.toLowerCase())}" data-pole="${m.pole}" data-status="${m.status}">
      <div class="rc-main"><div class="rc-n">${esc(m.name)}</div><div class="rc-r">${esc(m.rang)}</div></div>
      <div class="rc-tags">
        <span class="rc-tag">${esc(poleEmoji[m.pole] || m.pole)}</span>
        <span class="rc-tag" style="color:${st.color}">${st.emoji} ${st.label}</span>
        ${m.lastActivity ? `<span class="rc-tag muted">🕐 ${esc(_dateFR(m.lastActivity))}</span>` : ''}
      </div>
    </div>`;
  }).join('');
  const body = `<div class="wrap">
    <div class="bar">
      <input id="q" placeholder="🔎 Chercher un membre…">
      <span class="chips">
        <button class="chip" data-fp="legal">⚖️ Légal</button>
        <button class="chip" data-fp="illegal">🎭 Illégal</button>
      </span>
      <span class="chips">
        <button class="chip" data-fst="actif">🟢 Actifs</button>
        <button class="chip" data-fst="absent">🟡 Absents</button>
        <button class="chip" data-fst="inactif">🔴 Inactifs</button>
        <button class="chip" data-fst="visiteur">👁️ Visiteurs</button>
      </span>
      <span id="count" class="count">${membres.length} membre(s)</span>
    </div>
    ${membres.length ? `<div class="reg">${rows}</div>` : '<div class="empty">Aucun membre enregistré.</div>'}
  </div>`;
  const extraCss = `
.bar{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-bottom:18px}
.bar input{flex:1;min-width:180px;background:#241a12;color:#e9dcc2;border:1px solid #5a4632;border-radius:8px;padding:9px 12px;font-family:inherit;font-size:1rem}
.chips{display:flex;gap:6px;flex-wrap:wrap}
.chip{font-family:'Special Elite',monospace;font-size:.72rem;background:#241a12;color:#e9dcc2;border:1px solid #5a4632;border-radius:20px;padding:6px 11px;cursor:pointer}
.chip.on{background:#d9a441;color:#1a1208;border-color:#d9a441;font-weight:bold}
.count{margin-left:auto;font-family:'Special Elite',monospace;font-size:.74rem;opacity:.8}
.reg{display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:12px}
.rc{background:linear-gradient(160deg,#241a12,#191109);border:1px solid #b8893b44;border-radius:10px;padding:13px 15px}
.rc-n{font-family:'Cinzel',serif;font-weight:700;color:#f2e4c4;font-size:1.08rem}
.rc-r{color:#d9a441;font-size:.94rem;margin-top:1px}
.rc-tags{display:flex;flex-wrap:wrap;gap:6px;margin-top:9px}
.rc-tag{font-family:'Special Elite',monospace;font-size:.7rem;background:#15100a;border:1px solid #5a4632;border-radius:20px;padding:3px 9px}`;
  const script = `
(function(){
var q='',fp='',fst='';
function apply(){var cards=document.querySelectorAll('.rc'),n=0;
  for(var i=0;i<cards.length;i++){var c=cards[i],ok=true;
    if(q && c.getAttribute('data-name').indexOf(q)<0)ok=false;
    if(fp && c.getAttribute('data-pole')!==fp)ok=false;
    if(fst && c.getAttribute('data-status')!==fst)ok=false;
    c.style.display=ok?'':'none';if(ok)n++;}
  var cc=document.getElementById('count');if(cc)cc.textContent=n+' membre(s)';}
var s=document.getElementById('q');if(s)s.addEventListener('input',function(e){q=(e.target.value||'').toLowerCase();apply();});
function wire(attr,cur,setter){var els=document.querySelectorAll('['+'data-'+attr+']');for(var i=0;i<els.length;i++){(function(el){el.addEventListener('click',function(){var v=el.getAttribute('data-'+attr);setter(cur()===v?'':v);for(var k=0;k<els.length;k++)els[k].classList.toggle('on',els[k].getAttribute('data-'+attr)===cur());apply();});})(els[i]);}}
wire('fp',function(){return fp;},function(v){fp=v;});
wire('fst',function(){return fst;},function(v){fst=v;});
})();`;
  return _shell({ title: 'Registre des membres', tok, body, extraCss, script });
}

// ═══════════════════════════════════════════════════════════════
//  📜 Frise chronologique (dérivée des vraies données)
// ═══════════════════════════════════════════════════════════════
function _pageFrise(tok) {
  const db = loadDB();
  const ev = [];
  _members(db).forEach(m => { if (m.joinedAt) ev.push({ at: m.joinedAt, emoji: '🤝', txt: `<b>${esc(m.name)}</b> rejoint la compagnie${m.pole ? ' (' + (m.pole === 'legal' ? 'Iron Wolf Company' : 'La Confrérie') + ')' : ''}.` }); });
  _operations(db).forEach(o => { if (o.createdAt) ev.push({ at: o.createdAt, emoji: '🎯', txt: `Opération <b>« ${esc(o.name)} »</b> ouverte — ${esc(o.lieu)}.` }); });
  _traques(db).forEach(t => {
    if (t.createdAt) ev.push({ at: t.createdAt, emoji: '🔫', txt: `Avis de recherche lancé contre <b>${esc(t.cible)}</b> (prime ${esc(t.prime)}).` });
    if (t.closedAt) ev.push({ at: t.closedAt, emoji: (AVIS_STATUT[t.status] || {}).emoji || '📌', txt: `Traque de <b>${esc(t.cible)}</b> clôturée — ${(AVIS_STATUT[t.status] || {}).label || t.status}.` });
  });
  (db.contrats || []).forEach(c => { if (c.createdAt) ev.push({ at: c.createdAt, emoji: '📜', txt: `Contrat <b>${esc(c.objet || c.titre || 'sans titre')}</b>${c.clientNom ? ' — client ' + esc(c.clientNom) : ''}.` }); });
  ev.sort((a, b) => new Date(a.at) - new Date(b.at));
  // Groupe par mois
  const groups = {};
  ev.forEach(e => {
    const d = new Date(e.at); if (isNaN(d.getTime())) return;
    const key = d.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
    (groups[key] = groups[key] || []).push(e);
  });
  const html = Object.entries(groups).map(([mois, arr]) => {
    const items = arr.map(e => `<div class="fi"><div class="fi-dot">${e.emoji}</div><div class="fi-b"><div class="fi-d">${esc(_dateFR(e.at))}</div><div class="fi-t">${e.txt}</div></div></div>`).join('');
    return `<div class="fmonth"><div class="fmonth-h">${esc(mois.charAt(0).toUpperCase() + mois.slice(1))}</div>${items}</div>`;
  }).join('');
  const body = `<div class="wrap">${ev.length ? `<div class="frise">${html}</div>` : '<div class="empty">Pas encore assez d\'histoire à raconter… reviens plus tard.</div>'}</div>`;
  const extraCss = `
.frise{max-width:720px;margin:0 auto;position:relative}
.fmonth{margin-bottom:26px}
.fmonth-h{font-family:'Rye',serif;color:#d9a441;font-size:1.3rem;text-align:center;margin-bottom:14px;letter-spacing:.02em}
.fi{display:flex;gap:14px;position:relative;padding-bottom:16px}
.fi::before{content:'';position:absolute;left:17px;top:34px;bottom:-2px;width:2px;background:#4a3826}
.fi:last-child::before{display:none}
.fi-dot{flex:none;width:36px;height:36px;border-radius:50%;background:#241a12;border:2px solid #8a6d3b;display:flex;align-items:center;justify-content:center;font-size:1.05rem;z-index:1}
.fi-b{background:linear-gradient(160deg,#241a12,#191109);border:1px solid #b8893b33;border-radius:9px;padding:10px 13px;flex:1}
.fi-d{font-family:'Special Elite',monospace;font-size:.68rem;color:#c8a45c;letter-spacing:.06em}
.fi-t{font-size:1rem;line-height:1.4;margin-top:2px}`;
  return _shell({ title: 'Frise chronologique', tok, body, extraCss });
}

// ═══════════════════════════════════════════════════════════════
//  📰 La Gazette de Blackwater (activité des 7 derniers jours)
// ═══════════════════════════════════════════════════════════════
function _pageGazette(tok) {
  const db = loadDB();
  const now = Date.now(), since = now - 7 * 24 * 3600 * 1000;
  const recent = d => { const t = new Date(d).getTime(); return t && t >= since; };
  const traques = _traques(db), ops = _operations(db), membres = _members(db);
  const nouvAvis = traques.filter(t => recent(t.createdAt));
  const closAvis = traques.filter(t => t.closedAt && recent(t.closedAt));
  const nouvOps = ops.filter(o => recent(o.createdAt));
  const nouvMembres = membres.filter(m => recent(m.joinedAt) && m.status !== 'parti');
  const nouvContrats = (db.contrats || []).filter(c => recent(c.createdAt));

  const arts = [];
  if (nouvAvis.length) {
    const t = nouvAvis.sort((a, b) => b.primeNum - a.primeNum)[0];
    arts.push({ big: true, titre: `MISE À PRIX SUR LA TÊTE DE ${t.cible.toUpperCase()}`, corps: `La compagnie a placardé ${nouvAvis.length > 1 ? nouvAvis.length + ' nouveaux avis de recherche' : 'un nouvel avis de recherche'} cette semaine. La prime la plus élevée, ${esc(t.prime)}, est offerte pour ${esc(t.cible)}${t.position && t.position !== '—' ? ', aperçu du côté de ' + esc(t.position) : ''}. ${t.resume ? esc(t.resume) : 'Tout chasseur digne de ce nom est invité à prendre la piste.'}` });
  }
  if (closAvis.length) {
    const captures = closAvis.filter(t => t.status === 'capturee' || t.status === 'eliminee');
    arts.push({ titre: 'JUSTICE EST FAITE', corps: `${closAvis.length} traque(s) ont été clôturées. ${captures.length ? captures.map(t => `<b>${esc(t.cible)}</b> a été ${t.status === 'eliminee' ? 'abattu' : 'capturé'}` ).join(', ') + '.' : 'Certaines cibles ont su se faire oublier.'}` });
  }
  if (nouvOps.length) {
    arts.push({ titre: 'LA COMPAGNIE SUR LE PIED DE GUERRE', corps: `${nouvOps.length} opération(s) ont été lancées : ${nouvOps.slice(0, 5).map(o => `<b>« ${esc(o.name)} »</b> (${esc(o.lieu)})`).join(', ')}. Les hommes s'affairent, l'Ouest n'attend pas.` });
  }
  if (nouvContrats.length) {
    arts.push({ titre: 'AFFAIRES ET CONTRATS', corps: `${nouvContrats.length} contrat(s) ont rejoint les registres cette semaine. Les affaires prospèrent pour qui sait tenir sa parole — et son revolver.` });
  }
  if (nouvMembres.length) {
    arts.push({ titre: 'DU SANG NEUF', corps: `${nouvMembres.map(m => `<b>${esc(m.name)}</b>`).join(', ')} ${nouvMembres.length > 1 ? 'ont' : 'a'} rejoint les rangs. Qu'on leur serve un whisky — et qu'on leur montre le travail.` });
  }
  const coffre = Number(db.coffre || 0);
  const pep = db.pepites || {};
  arts.push({ titre: 'ÉTAT DES CAISSES', corps: `Le coffre commun affiche <b>$${nf(coffre)}</b>${pep.total ? `, et la maison garde ${nf(pep.total)} pépite(s) en réserve` : ''}. La prudence reste de mise : l'Ouest est plein de mains lestes.` });

  const dateStr = new Date().toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const cols = arts.map((a, i) => `<article class="gz-art${a.big ? ' big' : ''}">
    <h2>${esc(a.titre)}</h2>
    <div class="gz-rule"></div>
    <p>${a.corps}</p>
  </article>`).join('');
  const body = `<div class="wrap gz">
    <div class="gz-masthead">
      <div class="gz-sub">Édition hebdomadaire · Territoire du Texas</div>
      <div class="gz-title">La Gazette de Blackwater</div>
      <div class="gz-date">${esc(dateStr.charAt(0).toUpperCase() + dateStr.slice(1))} · Prix : 5 cents</div>
    </div>
    <div class="gz-cols">${cols}</div>
  </div>`;
  const extraCss = `
.gz{max-width:900px}
.gz-masthead{text-align:center;border-top:3px double #cdb98e;border-bottom:3px double #cdb98e;padding:14px 0;margin-bottom:20px}
.gz-sub{font-family:'Special Elite',monospace;font-size:.68rem;letter-spacing:.28em;text-transform:uppercase;color:#c8a45c}
.gz-title{font-family:'Rye',serif;font-size:clamp(2rem,8vw,3.6rem);color:#f2e4c4;line-height:1.05;margin:6px 0;text-shadow:0 2px 0 #000}
.gz-date{font-family:'Special Elite',monospace;font-size:.72rem;letter-spacing:.1em;color:#b7a077}
.gz-cols{column-width:300px;column-gap:26px}
.gz-art{break-inside:avoid;margin:0 0 22px;padding-bottom:16px;border-bottom:1px solid #4a382655}
.gz-art.big{column-span:all;text-align:center;border-bottom:3px double #4a3826;margin-bottom:24px}
.gz-art h2{font-family:'Rye',serif;font-weight:400;font-size:1.25rem;color:#e6cf9e;line-height:1.15;margin:0 0 6px}
.gz-art.big h2{font-size:clamp(1.5rem,5vw,2.4rem);color:#f2e4c4}
.gz-rule{height:1px;background:#4a3826;margin:0 0 8px}
.gz-art p{font-size:1.02rem;line-height:1.6;margin:0;text-align:justify}
.gz-art p::first-letter{font-family:'Rye',serif;font-size:2.6rem;float:left;line-height:.8;padding:4px 8px 0 0;color:#d9a441}
.gz-art.big p::first-letter{float:none;font-size:1.02rem;padding:0}`;
  return _shell({ title: 'La Gazette de Blackwater', tok, body, extraCss });
}

// ═══════════════════════════════════════════════════════════════
//  📈 Trésorerie en graphiques (Direction) — SVG rendu côté serveur
// ═══════════════════════════════════════════════════════════════
function _svgDonut(segs, size) {
  const total = segs.reduce((s, x) => s + x.value, 0);
  const r = size / 2, cx = r, cy = r, inner = r * 0.58;
  if (!total) return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}"><circle cx="${cx}" cy="${cy}" r="${r - 2}" fill="none" stroke="#4a3826" stroke-width="2"/><text x="${cx}" y="${cy}" fill="#9c8a66" font-size="13" text-anchor="middle" dominant-baseline="middle" font-family="monospace">aucune donnée</text></svg>`;
  let a0 = -Math.PI / 2; let paths = '';
  segs.forEach(s => {
    const frac = s.value / total; const a1 = a0 + frac * 2 * Math.PI;
    const large = (a1 - a0) > Math.PI ? 1 : 0;
    const x0 = cx + r * Math.cos(a0), y0 = cy + r * Math.sin(a0);
    const x1 = cx + r * Math.cos(a1), y1 = cy + r * Math.sin(a1);
    paths += `<path d="M ${cx} ${cy} L ${x0.toFixed(2)} ${y0.toFixed(2)} A ${r} ${r} 0 ${large} 1 ${x1.toFixed(2)} ${y1.toFixed(2)} Z" fill="${s.color}" stroke="#191109" stroke-width="1.5"/>`;
    a0 = a1;
  });
  return `<svg viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${paths}<circle cx="${cx}" cy="${cy}" r="${inner}" fill="#191109"/><text x="${cx}" y="${cy - 6}" fill="#f2e4c4" font-size="22" text-anchor="middle" font-family="Cinzel,serif" font-weight="900">${total}</text><text x="${cx}" y="${cy + 16}" fill="#9c8a66" font-size="11" text-anchor="middle" font-family="monospace">TOTAL</text></svg>`;
}
function _svgBars(items, w, h) {
  const max = Math.max(1, ...items.map(i => i.value));
  const pad = 30, bw = (w - pad) / items.length;
  let bars = '';
  items.forEach((it, i) => {
    const bh = Math.round((h - 40) * (it.value / max));
    const x = pad + i * bw + bw * 0.15, y = h - 24 - bh, ww = bw * 0.7;
    bars += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${ww.toFixed(1)}" height="${bh}" fill="${it.color}" rx="3"/>`;
    bars += `<text x="${(x + ww / 2).toFixed(1)}" y="${(y - 5).toFixed(1)}" fill="#f2e4c4" font-size="12" text-anchor="middle" font-family="monospace">${it.value}</text>`;
    bars += `<text x="${(x + ww / 2).toFixed(1)}" y="${h - 8}" fill="#c8a45c" font-size="10" text-anchor="middle" font-family="monospace">${esc(it.label)}</text>`;
  });
  return `<svg viewBox="0 0 ${w} ${h}" width="100%" height="${h}">${bars}</svg>`;
}
function _pageTresorerie(tok) {
  const db = loadDB();
  const coffre = Number(db.coffre || 0);
  const pep = db.pepites || { total: 0, prix: 0 };
  const pepVal = (pep.prix > 0) ? Math.round(pep.total * pep.prix) : 0;
  const cs = db.contrats || [];
  const suiviOf = c => c.suivi || '';
  const cAtt = cs.filter(c => /attente/i.test(suiviOf(c))).length;
  const cCours = cs.filter(c => /en cours/i.test(suiviOf(c))).length;
  const cVal = cs.filter(c => /valid/i.test(suiviOf(c))).length;
  const cHon = cs.filter(c => /honor/i.test(suiviOf(c))).length;
  const contratSegs = [
    { label: 'En attente', value: cAtt, color: '#e0b028' },
    { label: 'En cours', value: cCours, color: '#2e6da4' },
    { label: 'Validés', value: cVal, color: '#3ca03c' },
    { label: 'Honorés', value: cHon, color: '#8a6d3b' },
  ].filter(s => s.value > 0);
  const ops = _operations(db);
  const opBars = [
    { label: 'Prép.', value: ops.filter(o => o.status === 'preparation').length, color: '#8a6d3b' },
    { label: 'Prog.', value: ops.filter(o => ['programmee', 'attente_direction'].includes(o.status)).length, color: '#2e6da4' },
    { label: 'Cours', value: ops.filter(o => o.status === 'en_cours').length, color: '#c0392b' },
    { label: 'Fini', value: ops.filter(o => ['terminee', 'termine', 'annulee'].includes(o.status)).length, color: '#3ca03c' },
  ];
  const traques = _traques(db);
  const primesEnJeu = traques.filter(t => t.actif).reduce((s, t) => s + t.primeNum, 0);
  const contratsVal = cs.reduce((s, c) => s + (Number(c.montant) || _montant(c.remuneration)), 0);
  const legend = contratSegs.length ? contratSegs.map(s => `<div class="lg"><span class="dot" style="background:${s.color}"></span>${esc(s.label)} <b>${s.value}</b></div>`).join('') : '<div class="muted">Aucun contrat.</div>';
  const kpi = (emoji, val, lbl, sub) => `<div class="kpi"><div class="k-e">${emoji}</div><div class="k-v">${val}</div><div class="k-l">${esc(lbl)}</div>${sub ? `<div class="k-s">${sub}</div>` : ''}</div>`;
  const body = `<div class="wrap">
    <div class="kpis">
      ${kpi('💰', '$' + nf(coffre), 'Coffre commun')}
      ${kpi('⛏️', nf(pep.total), 'Pépites', pepVal ? '≈ $' + nf(pepVal) : '')}
      ${kpi('📜', nf(cs.length), 'Contrats', contratsVal ? '≈ $' + nf(contratsVal) : '')}
      ${kpi('🔫', nf(primesEnJeu ? '$' + nf(primesEnJeu) : 0), 'Primes en jeu')}
    </div>
    <div class="charts">
      <div class="chart"><div class="chart-h">📜 Répartition des contrats</div><div class="chart-b">${_svgDonut(contratSegs, 200)}<div class="legend2">${legend}</div></div></div>
      <div class="chart"><div class="chart-h">🎯 Opérations par état</div><div class="chart-b">${_svgBars(opBars, 380, 200)}</div></div>
    </div>
  </div>`;
  const extraCss = `
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px}
@media(max-width:640px){.kpis{grid-template-columns:repeat(2,1fr)}}
.kpi{background:linear-gradient(160deg,#241a12,#191109);border:1px solid #b8893b55;border-radius:12px;padding:18px 14px;text-align:center;box-shadow:0 8px 22px #0005}
.k-e{font-size:1.6rem}.k-v{font-family:'Cinzel',serif;font-weight:900;font-size:clamp(1.2rem,4vw,1.9rem);color:#d8a94e;margin:4px 0 2px}
.k-l{font-family:'Special Elite',monospace;font-size:.68rem;letter-spacing:.1em;text-transform:uppercase;opacity:.85}
.k-s{margin-top:6px;font-size:.86rem;opacity:.8}
.charts{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:16px}
.chart{background:#1c140d99;border:1px solid #4a3826;border-radius:12px;padding:14px}
.chart-h{font-family:'Cinzel',serif;font-weight:700;color:#f0d89a;text-align:center;margin-bottom:12px}
.chart-b{display:flex;flex-direction:column;align-items:center;gap:12px}
.legend2{display:flex;flex-wrap:wrap;gap:8px 16px;justify-content:center}
.legend2 .lg{display:flex;align-items:center;gap:6px;font-family:'Special Elite',monospace;font-size:.78rem}
.legend2 .dot{width:12px;height:12px;border-radius:3px}`;
  return _shell({ title: 'Trésorerie en graphiques', tok, body, extraCss });
}

// ═══════════════════════════════════════════════════════════════
//  Routeur HTTP
// ═══════════════════════════════════════════════════════════════
const PAGES = {
  '': { fn: _pageAccueil, min: 'public', passLevel: true },
  'mur': { fn: _pageMur, min: 'membre' },
  'toile': { fn: _pageToile, min: 'membre' },
  'organigramme': { fn: _pageOrga, min: 'membre' },
  'kanban': { fn: _pageKanban, min: 'membre' },
  'registre': { fn: _pageRegistre, min: 'membre' },
  'frise': { fn: _pageFrise, min: 'membre' },
  'gazette': { fn: _pageGazette, min: 'membre' },
  'tresorerie': { fn: _pageTresorerie, min: 'confidentiel' },
};
async function httpHandle(req, res, client) {
  let u; try { u = new URL(req.url, 'http://x'); } catch { return false; }
  if (u.pathname !== '/portail' && !u.pathname.startsWith('/portail/')) return false;
  try {
    const tok = u.searchParams.get('k') || '';
    const info = _tokInfo(tok); const level = info?.level || null;
    const sub = u.pathname === '/portail' ? '' : decodeURIComponent(u.pathname.slice('/portail/'.length)).replace(/\/+$/, '');
    const page = PAGES[sub];
    const guild = client?.guilds?.cache?.first?.() || null;
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    if (!level) { res.end(_expired()); return true; }
    if (!page) { res.end(_shell({ title: 'Introuvable', tok, body: '<div class="empty">Cet outil n\'existe pas. <a href="/portail?k=' + esc(tok) + '">← Retour au portail</a></div>' })); return true; }
    if (!_atLeast(level, page.min)) { res.end(_locked(page.min)); return true; }
    res.end(await page.fn(tok, level, guild));
    return true;
  } catch (e) {
    console.log('❌ portail httpHandle:', e.message);
    try { res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' }); res.end('Erreur'); } catch {}
    return true;
  }
}

module.exports = { init, installerPanel, routeInteraction, httpHandle, creerToken, PORTAIL_CHANNEL_ID };
module.exports.__test = { _pageAccueil }; // tests uniquement
