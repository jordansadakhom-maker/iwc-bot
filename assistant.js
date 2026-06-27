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
function _recherche(db, terme) {
  const q = _norm(terme); if (!q) return { total: 0, groupes: [] };
  const match = (...vals) => vals.some(v => _norm(v).includes(q));
  const groupes = [];
  const add = (titre, items) => { if (items.length) groupes.push({ titre, items: items.slice(0, 8), n: items.length }); };

  add('📜 Contrats', (db.contrats || []).filter(c => match(c.id, c.clientNom, c.commanditaire, c.objet, c.typeMission, c.suivi, c.status))
    .map(c => `\`${c.id}\` ${c.clientNom || c.commanditaire || '—'} — ${(c.objet || c.typeMission || '—')}`.slice(0, 90)));

  const ops = [...(db.preparations || []), ...(db.operations || [])];
  add('🎯 Opérations', ops.filter(o => match(o.id, o.cible, o.name, o.categorie, o.objectif))
    .map(o => `\`${o.id}\` ${o.cible || o.name || '—'} — ${o.categorie || ''} [${o.status || '—'}]`.slice(0, 90)));

  add('🔎 Avis de recherche', (db.traques || []).filter(t => match(t.id, t.cible, t.position, t.commanditaire))
    .map(t => `\`${t.id}\` ${t.cible || '—'} @ ${t.position || '—'} [${t.status || '—'}]`.slice(0, 90)));

  add('📇 Répertoire', (db.repertoire?.contacts || []).filter(c => match(c.nom, c.nomsurnom, c.telegramme, c.metier, c.notes, c.affiliation))
    .map(c => `${c.nom || c.nomsurnom || '—'}${c.telegramme ? ` · 📨${c.telegramme}` : ''}${c.metier ? ` · ${c.metier}` : ''}`.slice(0, 90)));

  add('🕵️ Informateurs', (db.informateurs || []).filter(r => match(r.id, r.source, r.cible, r.info))
    .map(r => `\`${r.id}\` ${r.cible || '—'} — ${(r.info || '').slice(0, 50)}`.slice(0, 90)));

  add('👥 Membres', Object.values(db.members || {}).filter(m => match(m.name, m.rang))
    .map(m => `${m.name || '—'} — ${m.rang || '—'}`.slice(0, 90)));

  add('⭐ Avis clients', (db.avisClients || []).filter(a => match(a.clientNom, a.commentaire, a.objet))
    .map(a => `${a.clientNom || '—'} (${a.note || '?'}/5)${a.commentaire ? ` — « ${a.commentaire.slice(0, 50)} »` : ''}`.slice(0, 90)));

  add('🗺️ Carte', (db.carte?.points || []).filter(p => match(p.nom, p.lieu, p.region, p.notes))
    .map(p => `${p.nom || '—'} — ${p.lieu || p.region || '—'}`.slice(0, 90)));

  return { total: groupes.reduce((s, g) => s + g.n, 0), groupes };
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
  const rapports = (db.informateurs || []).filter(r => _norm(`${r.source} ${r.cible} ${r.info}`).includes(q)).slice(-15)
    .map(r => `[${r.id}] cible:${r.cible || '—'} fiab:${r.fiabilite || '—'}${r.quand ? ` quand:${r.quand}` : ''} — ${(r.info || '').slice(0, 400)}`);
  const avis = (db.traques || []).filter(t => _norm(`${t.cible} ${t.position}`).includes(q))
    .map(t => `Avis ${t.id}: ${t.cible} @ ${t.position || '—'} · prime ${t.prime || '—'} · ${t.dangerosite || '—'} [${t.status || '—'}]`);
  const contacts = (db.repertoire?.contacts || []).filter(c => _norm(`${c.nom || ''} ${c.nomsurnom || ''} ${c.metier || ''} ${c.notes || ''}`).includes(q))
    .map(c => `Contact: ${c.nom || c.nomsurnom} · métier ${c.metier || '—'} · affil ${c.affiliation || '—'} · ${c.notes || ''}`);
  const contexte = [...rapports, ...avis, ...contacts].join('\n').slice(0, 6000);
  if (!contexte.trim()) return { vide: true };
  const txt = await _callIA([{ role: 'user', content: `Tu es l'analyste du renseignement de La Confrérie (RP western ~1904). À partir UNIQUEMENT des éléments ci-dessous, rédige une **FICHE DE RENSEIGNEMENT consolidée** en français sur « ${nom} ». Structure claire avec ces sections : 🪪 Identité · 📍 Lieux & habitudes · 🤝 Relations · 📑 Faits connus · ⚠️ Dangerosité · 🎯 Recommandations. Reste factuel, ne invente rien ; si une section manque d'infos, écris « inconnu ».\n\n=== ÉLÉMENTS (${rapports.length} rapport(s), ${avis.length} avis, ${contacts.length} contact(s)) ===\n${contexte}` }], 1100);
  return { txt, n: { rapports: rapports.length, avis: avis.length, contacts: contacts.length } };
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
      '🧠 **Profil de cible** — fiche de renseignement consolidée sur quelqu\'un (depuis tous les rapports/avis/contacts).',
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
      new ButtonBuilder().setCustomId('asst_image').setLabel('Générer une image').setEmoji('🖼️').setStyle(ButtonStyle.Secondary),
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
      if (cid === 'asst_image') {
        if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 La génération d\'images est réservée à la Direction (coût par image).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        await interaction.showModal(_modal('asst_image_modal', '🖼️ Générer une image', 'Décris l\'image voulue', TextInputStyle.Paragraph, 'Ex : portrait d\'un hors-la-loi balafré, chapeau noir…')).catch(() => {});
        return true;
      }
      return false;
    }

    // Modals
    if (interaction.isModalSubmit?.()) {
      const val = (interaction.fields.getTextInputValue('q') || '').trim();
      if (cid === 'asst_search_modal') {
        const res = _recherche(loadDB(), val);
        if (!res.total) { await interaction.reply({ content: `🔎 Aucun résultat pour **${val}**.`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
        const e = new EmbedBuilder().setColor(0x2B2118).setTitle(`🔎 Recherche — « ${val} »`).setDescription(`**${res.total}** résultat(s) :`);
        for (const g of res.groupes) e.addFields({ name: `${g.titre} (${g.n})`, value: g.items.map(i => `• ${i}`).join('\n').slice(0, 1024) });
        await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(() => {});
        return true;
      }
      // 🧠 Profil de cible (depuis les données)
      if (cid === 'asst_profil_modal') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
        const res = await _profilCible(loadDB(), val);
        if (res.vide) { await interaction.editReply({ content: `🧠 Aucune information sur **${val}** dans nos données.` }).catch(() => {}); return true; }
        if (!res.txt) { await interaction.editReply({ content: '❌ Assistant IA indisponible (clé API absente ou erreur).' }).catch(() => {}); return true; }
        const e = new EmbedBuilder().setColor(0x7A2E2E).setTitle(`🧠 Fiche de renseignement — ${val}`.slice(0, 256)).setDescription(res.txt.slice(0, 4096)).setFooter({ text: `Sources : ${res.n.rapports} rapport(s) · ${res.n.avis} avis · ${res.n.contacts} contact(s) — à vérifier` });
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
