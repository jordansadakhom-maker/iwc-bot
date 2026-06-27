// ─────────────────────────────────────────────────────────────────────────────
//  assistant.js — Assistant IA + Recherche globale (accès : Confrérie + Direction)
//  • 🔎 Recherche : un mot-clé → résultats dans contrats, opérations, avis,
//    contacts, informateurs, membres, avis clients, carte. (sans IA, fiable)
//  • 💬 Question : réponse en français à partir des VRAIES données du serveur.
//  • ✍️ Rédaction RP : annonces, briefs, lettres… ton western ~1904.
//  • 📝 Résumé : résume un texte collé (fil, dossier…).
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
const { loadDB } = require('./db');

const SALON_PANEL = '1518042088879423640';        // #dashboard (choisi par la Direction)
const ROLE_CONFRERIE = '1508898841993281658';      // Pôle Illégal
const ROLES_DIRECTION = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire', 'Conseil'];
const MODELE = 'claude-haiku-4-5-20251001';

const estAcces = (member) => !!member?.roles?.cache?.some(r => r.id === ROLE_CONFRERIE || ROLES_DIRECTION.some(n => r.name.includes(n)));
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
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company & La Confrérie' });
}
function _panneauRows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('asst_search').setLabel('Rechercher').setEmoji('🔎').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('asst_ask').setLabel('Poser une question').setEmoji('💬').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('asst_write').setLabel('Rédiger (RP)').setEmoji('✍️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('asst_sum').setLabel('Résumer').setEmoji('📝').setStyle(ButtonStyle.Secondary),
  )];
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
