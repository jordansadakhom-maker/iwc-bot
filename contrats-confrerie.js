// ═══════════════════════════════════════════════════════════════
// contrats-confrerie.js — Système de contrats clandestins de La Confrérie
// Habillage Confrérie · Niveau de risque + prime · Confidentialité (anonyme + accès restreint)
// Assignation d'agents · Briefing privé en DM · Fin de mission (réussie/échouée) · Rappels d'échéance
// Branchement : voir les 3 lignes à ajouter dans index.js (en bas de ce fichier).
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const path = require('path');
// Texture parchemin jointe aux MP (contrat/briefing/fin de mission) : fichier local du dépôt →
// lien permanent (les liens cdn.discordapp.com expirent au bout de ~24h). Référencée via attachment://.
const PARCHEMIN_IMG = 'attachment://parchemin.png';
function parcheminFichier() { try { return new AttachmentBuilder(path.join(__dirname, 'assets', 'parchemin.png'), { name: 'parchemin.png' }); } catch { return null; } }
// Reformulation IA façon Far West 1904 (réutilise global.reformulerRP : garde les faits/chiffres,
// aucun anachronisme ni emoji). Repli sur le texte original si l'IA est indisponible → jamais de perte.
async function rp1904(txt) {
  const s = (txt || '').trim();
  if (!s) return s;
  try { if (typeof global.reformulerRP === 'function') { const r = await global.reformulerRP(s.slice(0, 1500)); if (r) return r; } } catch {}
  return s;
}
const { loadDB, saveDB, sauvegarderSurGitHub } = require('./db');
// Sauvegarde immédiate sur GitHub : sur Render le disque est éphémère — sans ça, un contrat créé
// est perdu au prochain redéploiement (d'où « Contrat introuvable » au moment de valider).
// Renvoie la promesse pour pouvoir l'ATTENDRE dans les étapes critiques (sinon un redéploiement
// peut tuer le process avant la fin de la sauvegarde Gist → « Contrat introuvable » au prochain clic).
function _persistNow() { try { if (typeof sauvegarderSurGitHub === 'function') return sauvegarderSurGitHub().catch(() => {}); } catch {} return Promise.resolve(); }

// ─── Salons (IDs figés du serveur) ───
const CH_CONTRATS          = '1508756442730074222';
const CH_CONTRATS_REPONSES = '1518392786301227250';
const CH_JOURNAL           = '1508756535407542372';

// ─── Rôles Direction (permissions + ping) ───
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];

// ─── Rôles internes : EXCLUS de la liste « Faire signer » (on n'y propose que des invités externes) ───
// Confrérie (pôle illégal)…
const CONFRERIE_ROLE_NAMES = ['concepteur', 'fléau', 'fleau', 'exécuteur', 'éxécuteur', 'executeur', 'execu', 'condamné', 'condamne', 'maudit', 'confrérie', 'confrerie', 'ombre'];
// …et Iron Wolf Company (pôle légal) — les membres internes ne sont jamais des clients à faire signer.
const IWC_ROLE_NAMES = ['conseil', 'directeur', 'officier', 'agent', 'opérateur', 'operateur', 'recrue', 'iron wolf', 'fondateur'];
const MEMBRE_INTERNE_ROLE_NAMES = [...CONFRERIE_ROLE_NAMES, ...IWC_ROLE_NAMES];
// ─── Rôle des invités (clients externes) : SEULE population proposée à la signature ───
const INVITE_ROLE_MATCH = 'visiteur';

// ─── Types de mission (clandestins) ───
const TYPES_MISSION = [
  { label: 'Contrebande',           value: 'Contrebande',           emoji: '📦' },
  { label: 'Sabotage',              value: 'Sabotage',              emoji: '🧨' },
  { label: 'Vol organisé',          value: 'Vol organisé',          emoji: '💰' },
  { label: 'Élimination',           value: 'Élimination',           emoji: '🗡️' },
  { label: 'Extorsion / Racket',    value: 'Extorsion',             emoji: '✊' },
  { label: 'Espionnage / Filature', value: 'Espionnage',            emoji: '👁️' },
  { label: 'Protection',            value: 'Protection',            emoji: '🛡️' },
  { label: 'Récupération de dette', value: 'Récupération de dette', emoji: '⛓️' },
  { label: 'Autre (à préciser)',    value: 'Autre',                 emoji: '❓' },
];

// ─── Niveaux de risque ───
const RISQUES = {
  discret:  { label: 'Discret',  emoji: '🟢', couleur: 0x4CAF50, prime: 'standard' },
  risque:   { label: 'Risqué',   emoji: '🟠', couleur: 0xE67E22, prime: 'majorée' },
  sanglant: { label: 'Sanglant', emoji: '🔴', couleur: 0x8B1A1A, prime: 'maximale (prime de sang)' },
};

const STATUTS = {
  propose:  { label: '🟡 Proposé',  couleur: 0xF1C40F },
  actif:    { label: '🟢 En cours', couleur: 0x2ECC71 },
  reussie:  { label: '✅ Réussie',  couleur: 0x57F287 },
  echouee:  { label: '💀 Échouée',  couleur: 0xED4245 },
  refuse:   { label: '⛔ Refusé',   couleur: 0x555555 },
};

// ═══════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════
function isDirection(member) {
  return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n)));
}
async function fetchCh(guild, id) {
  let ch = guild.channels.cache.get(id);
  if (!ch) ch = await guild.channels.fetch(id).catch(() => null);
  return ch || null;
}
function journalCh(guild) {
  if (typeof global.getJournalCh === 'function') { try { const c = global.getJournalCh(guild); if (c) return c; } catch {} }
  return guild.channels.cache.get(CH_JOURNAL) || null;
}
function directionMention(guild) {
  return guild.roles.cache.filter(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n))).map(r => `<@&${r.id}>`).join(' ');
}
function fmtDate(d) {
  if (!d) return '—';
  const dt = new Date(d);
  if (isNaN(dt.getTime())) return '—';
  return dt.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric' });
}
function parseDateFR(s) {
  if (!s) return null;
  const m = s.trim().match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!m) { const iso = s.match(/\d{4}-\d{2}-\d{2}/); return iso ? iso[0] : null; }
  let [, d, mo, y] = m;
  if (y.length === 2) y = '20' + y;
  return `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}
function genId() { return 'CF-' + Date.now().toString().slice(-5); }
function findContrat(db, id) { return (db.contrats || []).find(c => c.id === id); }
function riskOf(c) { return RISQUES[c.risque] || RISQUES.discret; }
function emojiType(v) { return (TYPES_MISSION.find(t => t.value === v) || {}).emoji || '📋'; }

// ─── Construction de la fiche contrat (embed) ───
function buildContratEmbed(contrat) {
  const r = riskOf(contrat);
  const closed = ['reussie', 'echouee', 'refuse'].includes(contrat.status);
  const st = STATUTS[contrat.status] || STATUTS.propose;
  const couleur = closed ? st.couleur : r.couleur;
  const confid = !!contrat.confidentiel;

  const commanditaire = confid ? '🕶️ *Anonyme*' : (contrat.commanditaire || '—');
  const objet = confid
    ? '🔒 *Confidentiel — détails transmis aux agents en privé.*'
    : (contrat.objet || '—');

  const agents = (contrat.agents && contrat.agents.length)
    ? contrat.agents.map(id => {
        const s = (contrat.agentsStatus || {})[id];
        const e = s === 'accepte' ? '✅' : s === 'refuse' ? '⛔' : '⏳';
        return `${e} <@${id}>`;
      }).join('\n')
    : '*Aucun agent assigné*';

  const e = new EmbedBuilder()
    .setColor(couleur)
    .setTitle(`🐺 CONTRAT — ${contrat.id}`)
    .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n        LA CONFRÉRIE — CONTRAT\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```')
    .addFields(
      { name: '🆔 Référence', value: `\`${contrat.id}\``, inline: true },
      { name: '🎯 Type', value: `${emojiType(contrat.typeMission)} ${contrat.typeMission || '—'}`, inline: true },
      { name: '⚠️ Risque', value: `${r.emoji} ${r.label}`, inline: true },
      { name: '👤 Commanditaire', value: commanditaire, inline: true },
      { name: '💰 Prime', value: `${contrat.remuneration || '—'}\n*Prime ${r.prime}*`, inline: true },
      { name: '📅 Échéance', value: contrat.dateEcheance ? fmtDate(contrat.dateEcheance) : (contrat.echeanceTexte || 'Aucune'), inline: true },
      { name: '🗡️ Agents assignés', value: agents, inline: false },
      { name: '📋 Objet', value: objet, inline: false },
      { name: '📌 Statut', value: st.label, inline: true },
    )
    .setFooter({ text: `La Confrérie • Contrat clandestin${confid ? ' • CONFIDENTIEL' : ''}` })
    .setTimestamp(new Date(contrat.createdAt || Date.now()));
  // Signature (anonyme : on n'affiche jamais qui a signé sur la fiche publique)
  if (contrat.signe) e.addFields({ name: '🖋️ Signature', value: `✅ Signé${contrat.signeAt ? ' le ' + fmtDate(contrat.signeAt) : ''}`, inline: true });
  else if (contrat.signataireId) e.addFields({ name: '🖋️ Signature', value: '⏳ Envoyé — en attente', inline: true });
  // Infos complémentaires cumulées (notes datées ajoutées à la mission par la Direction ou les agents)
  if (Array.isArray(contrat.infos) && contrat.infos.length) {
    const txt = contrat.infos.slice(-8).map(i => {
      const meta = [i.par, i.date ? fmtDate(i.date) : null].filter(Boolean).join(' · ');
      return `• ${String(i.texte || '').replace(/\s+/g, ' ')}${meta ? ` *(${meta})*` : ''}`;
    }).join('\n').slice(0, 1024);
    e.addFields({ name: `📌 Infos complémentaires (${contrat.infos.length})`, value: txt || '—', inline: false });
  }
  return e;
}

// ─── Boutons selon le statut ───
function buildContratButtons(contrat) {
  const rows = [];
  if (contrat.status === 'propose') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cc_accept::${contrat.id}`).setLabel('✅ Valider le contrat').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cc_refuse::${contrat.id}`).setLabel('⛔ Refuser').setStyle(ButtonStyle.Danger),
    ));
  } else if (contrat.status === 'actif') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cc_assign::${contrat.id}`).setLabel('🎯 Assigner des agents').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`cc_done::${contrat.id}`).setLabel('🏁 Mission réussie').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`cc_fail::${contrat.id}`).setLabel('💀 Mission échouée').setStyle(ButtonStyle.Danger),
    ));
  }
  // Signature + édition + ajout d'infos — tant que le contrat est ouvert
  if (['propose', 'actif'].includes(contrat.status)) {
    const label = contrat.signe ? '✅ Signé' : (contrat.signataireId ? '✍️ Relancer la signature' : '✍️ Faire signer');
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`cc_sign::${contrat.id}`).setLabel(label).setEmoji('🖋️').setStyle(ButtonStyle.Secondary).setDisabled(!!contrat.signe),
      new ButtonBuilder().setCustomId(`cc_edit::${contrat.id}`).setLabel('Modifier').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`cc_addinfo::${contrat.id}`).setLabel('Ajouter une info').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    ));
  }
  return rows; // vide si contrat clôturé
}

// ─── Parchemin envoyé EN MP à la personne pour signature (style Far West 1904, anonyme) ───
function buildSignatureEmbed(contrat) {
  const r = riskOf(contrat);
  const e = new EmbedBuilder()
    .setColor(0xC9A66B) // teinte parchemin / sépia
    .setTitle('📜 ⸺  CONTRAT DE LA CONFRÉRIE  ⸺ 📜')
    .setDescription([
      '```',
      '  ════════════════════════════════════════',
      '        ✦   EN L\'AN DE GRÂCE  1904   ✦',
      '  ════════════════════════════════════════',
      '```',
      '*Il vous est mandé, par le présent parchemin, un pacte scellé dans l\'ombre.*',
      '*Lisez-en les termes avec soin, étranger. Si votre parole est donnée,*',
      '*apposez votre marque au bas de ce document.*',
      '',
      '🕯️ *Discrétion absolue — ce papier ne quitte point vos mains.*',
    ].join('\n'))
    .addFields(
      { name: '⚜️ Référence du pacte', value: `\`${contrat.id}\``, inline: true },
      { name: '🎯 Nature de la besogne', value: `${emojiType(contrat.typeMission)} ${contrat.typeMission || '—'}`, inline: true },
      { name: '⚠️ Péril encouru', value: `${r.emoji} ${r.label}`, inline: true },
      { name: '💰 Récompense promise', value: `${contrat.remuneration || '—'}`, inline: true },
      { name: '📅 Terme échu le', value: contrat.dateEcheance ? fmtDate(contrat.dateEcheance) : (contrat.echeanceTexte || 'À votre convenance'), inline: true },
      { name: '​', value: '​', inline: true },
      { name: '📋 Objet du contrat', value: contrat.objet || '—', inline: false },
    )
    .setFooter({ text: '✒️ La Confrérie — scellé à la cire noire • Document confidentiel' });
  if (contrat.details) e.addFields({ name: '🪶 Consignes & clauses', value: contrat.details.slice(0, 1000) });
  e.addFields({ name: '​', value: '*« Que votre signature vous engage, et que l\'ombre vous garde. »*\n— ✒️ **La Confrérie**, an 1904' });
  e.setImage(PARCHEMIN_IMG);
  return e;
}

// ─── Briefing privé envoyé en DM aux agents (parchemin Far West 1904) ───
function buildBriefingEmbed(contrat) {
  const r = riskOf(contrat);
  const e = new EmbedBuilder()
    .setColor(0xC9A66B) // teinte parchemin / sépia
    .setTitle('📜 ⸺  ORDRE DE MISSION — LA CONFRÉRIE  ⸺ 📜')
    .setDescription([
      '```',
      '  ════════════════════════════════════════',
      '        ✦   EN L\'AN DE GRÂCE  1904   ✦',
      '  ════════════════════════════════════════',
      '```',
      `*Frère, on te confie une besogne. Le pacte porte la référence \`${contrat.id}\`.*`,
      '*Lis ces instructions, grave-les en mémoire, puis brûle ce papier.*',
      '',
      '🕯️ *Discrétion absolue — ce parchemin ne quitte point tes mains.*',
    ].join('\n'))
    .addFields(
      { name: '🎯 Nature de la besogne', value: `${emojiType(contrat.typeMission)} ${contrat.typeMission || '—'}`, inline: true },
      { name: '⚠️ Péril encouru', value: `${r.emoji} ${r.label}`, inline: true },
      { name: '📅 Terme échu le', value: contrat.dateEcheance ? fmtDate(contrat.dateEcheance) : (contrat.echeanceTexte || 'À votre convenance'), inline: true },
      { name: '👤 Commanditaire', value: contrat.commanditaire ? contrat.commanditaire : '🕶️ Anonyme', inline: false },
      { name: '📋 Objet du contrat', value: contrat.objet || '—', inline: false },
      { name: '💰 Récompense promise', value: `${contrat.remuneration || '—'} *(prime ${r.prime})*`, inline: false },
    )
    .setFooter({ text: '✒️ La Confrérie — scellé à la cire noire • Ordre confidentiel' });
  if (contrat.details) e.addFields({ name: '🪶 Consignes & clauses', value: contrat.details.slice(0, 1000) });
  e.addFields({ name: '​', value: '*« Que ta lame soit sûre, et que l\'ombre te garde. »*\n— ✒️ **La Confrérie**, an 1904' });
  e.setImage(PARCHEMIN_IMG);
  return e;
}

// Boutons Accepter / Refuser proposés à l'agent (en DM, ou en secours dans le salon)
function buildBriefingButtons(contrat) {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cc_agok::${contrat.id}`).setLabel('✅ Accepter la mission').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cc_agno::${contrat.id}`).setLabel('⛔ Refuser').setStyle(ButtonStyle.Danger),
  )];
}

async function envoyerBriefings(guild, contrat) {
  const chSecours = await fetchCh(guild, CH_CONTRATS);
  for (const userId of (contrat.agents || [])) {
    // On ne re-sollicite pas un agent qui a déjà répondu
    const dejaRepondu = ['accepte', 'refuse'].includes((contrat.agentsStatus || {})[userId]);
    if (dejaRepondu) continue;
    let dmOk = false;
    try {
      const m = await guild.members.fetch(userId).catch(() => null);
      if (m) {
        const dm = await m.send({ embeds: [buildBriefingEmbed(contrat)], components: buildBriefingButtons(contrat), files: [parcheminFichier()].filter(Boolean) }).catch(() => null);
        if (dm) dmOk = true;
      }
    } catch {}
    // MP fermés → on ping l'agent directement dans le salon (sans dévoiler les détails confidentiels)
    if (!dmOk && chSecours) {
      await chSecours.send({
        content: `<@${userId}> — 🗡️ Tu es assigné au contrat **${contrat.id}** (tes MP sont fermés). Accepte ou refuse la mission ci-dessous :`,
        components: buildBriefingButtons(contrat),
      }).catch(() => {});
    }
  }
}

// ─── Rafraîchit les fiches des contrats encore ouverts (propose/actif) ───
// Appelé au démarrage : permet aux contrats déjà postés d'afficher les nouveaux
// boutons (ex : « ✍️ Faire signer ») sans aucune action manuelle. N'édite QUE
// les messages existants — ne supprime jamais un contrat.
async function rafraichirContratsOuverts(guild) {
  try {
    const db = loadDB();
    const ouverts = (db.contrats || []).filter(c => c.cc && ['propose', 'actif'].includes(c.status) && c.msgId);
    for (const c of ouverts) {
      await rafraichirFiche(guild, c).catch(() => {});
      await new Promise(r => setTimeout(r, 250)); // anti rate-limit
    }
    if (ouverts.length) console.log(`🔄 ${ouverts.length} contrat(s) Confrérie rafraîchi(s) (boutons à jour)`);
  } catch (e) { console.log('⚠️ rafraichirContratsOuverts:', e.message); }
}

// ─── Mise à jour de la fiche déjà postée ───
async function rafraichirFiche(guild, contrat) {
  // 1) Message principal dans #contrats
  if (contrat.channelId && contrat.msgId) {
    const ch = await fetchCh(guild, contrat.channelId);
    const msg = ch && await ch.messages.fetch(contrat.msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [buildContratEmbed(contrat)], components: buildContratButtons(contrat) }).catch(() => {});
  }
  // 2) Copie dans le forum #contrats-réponses (agents, échéance, statut à jour)
  await majForum(guild, contrat);
}

// Met à jour le post de forum (sa fiche reflète agents / statut / échéance en direct)
async function majForum(guild, contrat) {
  try {
    if (!contrat.forumThreadId) return;
    const thread = await guild.channels.fetch(contrat.forumThreadId).catch(() => null);
    if (!thread) return;
    const starter = contrat.forumMsgId
      ? await thread.messages.fetch(contrat.forumMsgId).catch(() => null)
      : await thread.fetchStarterMessage?.().catch(() => null);
    if (starter) await starter.edit({ embeds: [buildContratEmbed(contrat)] }).catch(() => {});
  } catch (e) { console.log('⚠️ majForum contrat:', e.message); }
}

// Liste les INVITÉS (rôle Visiteur) éligibles à la signature d'un contrat.
// On exclut les bots et les membres de la Confrérie. On n'exclut PAS ceux sans nom RP :
// on les garde, mais on signale (aNomRP) et on remonte d'abord ceux qui ont un vrai prénom + nom.
function listerInvites(guild) {
  const out = [];
  for (const m of guild.members.cache.values()) {
    if (m.user.bot) continue;
    const roles = m.roles.cache;
    const estInvite = roles.some(r => r.name.toLowerCase().includes(INVITE_ROLE_MATCH));
    if (!estInvite) continue;
    // Sécurité : si quelqu'un cumule Visiteur + un rôle interne (Confrérie ou Iron Wolf), on l'écarte
    const estInterne = roles.some(r => MEMBRE_INTERNE_ROLE_NAMES.some(n => r.name.toLowerCase().includes(n)));
    if (estInterne) continue;
    const pseudo = (m.displayName || m.user.username || '').trim();
    const aNomRP = pseudo.split(/\s+/).filter(Boolean).length >= 2; // prénom + nom RP renseigné
    out.push({ id: m.id, pseudo: pseudo || m.user.username, username: m.user.username, aNomRP });
  }
  out.sort((a, b) => (Number(b.aNomRP) - Number(a.aNomRP)) || a.pseudo.localeCompare(b.pseudo));
  return out;
}

// Récupère le fil de forum d'un contrat — pour y poster l'activité de la mission (ex : signature)
async function forumThread(guild, contrat) {
  try {
    if (!guild || !contrat.forumThreadId) return null;
    return await guild.channels.fetch(contrat.forumThreadId).catch(() => null);
  } catch { return null; }
}

// ─── Notion (réutilise la synchro existante d'index.js) ───
function syncNotion(contrat, statutTexte) {
  try {
    if (typeof global._syncContratNotion === 'function') {
      // compat champs : la synchro lit clientNom/employeurNom + emetteurIC
      contrat.clientNom = contrat.commanditaire || 'Anonyme';
      global._syncContratNotion(contrat, statutTexte).catch(() => {});
    }
  } catch {}
}

// ─── Archivage dans #contrats-reponses (forum) : on met à jour la fiche en place ───
async function archiver(guild, contrat) {
  // Le salon #contrats-réponses est un FORUM → pas de .send(). On rafraîchit le post existant.
  await majForum(guild, contrat);
}

// ═══════════════════════════════════════════════════════════════
// PANNEAU
// ═══════════════════════════════════════════════════════════════
async function postPanel(channel) {
  const db = loadDB();
  const botId = channel.client.user.id;
  // Nettoyage : supprimer (+ désépingler) TOUT ancien panneau de contrats du salon (épinglé ou non),
  // pour ne pas accumuler. On cible le TITRE du panneau — jamais les fiches de contrat (titre différent).
  try {
    const recent = await channel.messages.fetch({ limit: 50 });
    for (const m of recent.values()) {
      if (m.author.id === botId && (m.embeds[0]?.title || '').includes('CONTRATS — LA CONFRÉRIE')) {
        await m.unpin?.().catch(() => {});
        await m.delete().catch(() => {});
      }
    }
  } catch {}
  // Si l'ancien panneau était dans un autre salon, on le retire aussi via l'ID mémorisé
  if (db.ccPanelMsgId && db.ccPanelChanId && db.ccPanelChanId !== channel.id) {
    const oldCh = channel.guild.channels.cache.get(db.ccPanelChanId);
    if (oldCh) { const old = await oldCh.messages.fetch(db.ccPanelMsgId).catch(() => null); if (old) { await old.unpin?.().catch(() => {}); await old.delete().catch(() => {}); } }
  }
  const embed = new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle('🐺 CONTRATS — LA CONFRÉRIE')
    .setDescription([
      '*Ici se négocient les contrats de la Confrérie. Discrétion absolue.*',
      '',
      '**Fonctionnement :**',
      '→ La Direction crée un contrat (type, risque, prime, échéance).',
      '→ Le contrat est validé, puis des **agents** y sont assignés.',
      '→ Chaque agent reçoit son **briefing en privé** et **accepte ou refuse**.',
      '→ La mission est clôturée : **réussie** ou **échouée**.',
      '',
      '*Un commanditaire laissé vide = contrat **anonyme & confidentiel**.*',
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • Secrétariat clandestin' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cc_new').setLabel('📋 Nouveau contrat').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('cc_mine').setLabel('🗂️ Mes contrats').setStyle(ButtonStyle.Secondary),
  );
  const sent = await channel.send({ embeds: [embed], components: [row] });
  db.ccPanelMsgId = sent.id; db.ccPanelChanId = channel.id; saveDB(db); _persistNow();
  return sent;
}

// ═══════════════════════════════════════════════════════════════
// CRÉATION — type → risque → modal
// ═══════════════════════════════════════════════════════════════
async function onNew(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const menu = new StringSelectMenuBuilder()
    .setCustomId('cc_type')
    .setPlaceholder('Type de mission...')
    .addOptions(TYPES_MISSION.map(t => ({ label: t.label, value: t.value, emoji: t.emoji })));
  return interaction.reply({ content: '🎯 **Type de mission ?**', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
}
async function onTypeSelect(interaction) {
  const type = interaction.values[0];
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cc_risk::${type}`)
    .setPlaceholder('Niveau de risque...')
    .addOptions(
      { label: 'Discret', value: 'discret', emoji: '🟢', description: 'Prime standard' },
      { label: 'Risqué', value: 'risque', emoji: '🟠', description: 'Prime majorée' },
      { label: 'Sanglant', value: 'sanglant', emoji: '🔴', description: 'Prime maximale (prime de sang)' },
    );
  return interaction.update({ content: `🎯 Mission : **${type}**\n⚠️ **Niveau de risque ?**`, components: [new ActionRowBuilder().addComponents(menu)] });
}
async function onRiskSelect(interaction) {
  const type = interaction.customId.split('::')[1] || 'Autre';
  const risk = interaction.values[0];
  const modal = new ModalBuilder().setCustomId(`cc_modal::${type}::${risk}`).setTitle('🐺 Nouveau contrat — Confrérie');
  modal.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('commanditaire').setLabel('Commanditaire (vide = anonyme)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Laisse vide pour un contrat anonyme & confidentiel')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet de la mission').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: récupérer la cargaison volée à Valentine...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Prime / Rémunération').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex: 2000$ + part du butin')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('echeance').setLabel('Échéance (JJ/MM/AAAA) — optionnel').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex: 30/08/2026')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('details').setLabel('Consignes / détails').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900).setPlaceholder('Lieu, cible, méthode, contacts, infos utiles...')),
  );
  return interaction.showModal(modal);
}
// Poste le contrat Confrérie en POST de forum catégorisé (salon partagé des contrats)
const FORUM_CONTRATS = '1518392786301227250';
// ─── Fiche de renseignement : modèle complet posté dans le fil du contrat, à compléter par les agents ───
function buildFicheRenseignementEmbed(contrat) {
  return new EmbedBuilder()
    .setColor(0x8B1A1A)
    .setTitle(`🗂️ FICHE DE RENSEIGNEMENT — ${contrat.id}`)
    .setDescription([
      '*Centralisez ici tout ce qu\'on sait sur la cible. Chaque détail peut faire la différence sur le terrain.*',
      '*Copiez le **modèle** juste en dessous, complétez-le et postez-le dans ce fil. Joignez vos photos & captures.*',
    ].join('\n'))
    .addFields(
      { name: '🎯 Cible / Sujet', value: '*Nom(s), surnom(s), fonction, description générale.*' },
      { name: '👁️ Signes distinctifs', value: '*Tenue habituelle, marque/signe, cicatrices, accent, tics…*\n> ex : long manteau beige · bandana noir · ceinturon argenté gravé d\'un serpent' },
      { name: '🔫 Armement', value: '*Armes observées.*\n> ex : revolver · fusils' },
      { name: '👥 Effectifs / organisation', value: '*Nombre, hiérarchie, complices connus.*\n> ex : bande de 5 à 6 personnes' },
      { name: '📍 Lieux fréquentés / repaires', value: '*Planques, points de RDV, zones d\'activité (joindre une carte si possible).*' },
      { name: '🐴 Montures / déplacements', value: '*Chevaux, attelages, itinéraires, horaires de passage.*' },
      { name: '🤝 Relations', value: '*Alliés, ennemis, indics, protections (loi, autres gangs…).*' },
      { name: '⏰ Habitudes / vulnérabilités', value: '*Routines, points faibles, moments propices à l\'action.*' },
      { name: '📸 Preuves', value: '*Photos, captures, témoignages — déposez-les directement dans ce fil.*' },
    )
    .setFooter({ text: 'La Confrérie • Renseignement de terrain — Confidentiel' });
}
const FICHE_RENSEIGNEMENT_MODELE = [
  '```',
  '🗂️ FICHE DE RENSEIGNEMENT',
  '━━━━━━━━━━━━━━━━━━━━━━━',
  '🎯 CIBLE / SUJET : ',
  '',
  '👁️ SIGNES DISTINCTIFS :',
  '• Tenue : ',
  '• Signe distinctif : ',
  '• Particularités : ',
  '',
  '🔫 ARMEMENT : ',
  '👥 EFFECTIFS / ORGANISATION : ',
  '📍 LIEUX FRÉQUENTÉS / REPAIRES : ',
  '🐴 MONTURES / DÉPLACEMENTS : ',
  '🤝 ALLIÉS / 🗡️ ENNEMIS : ',
  '⏰ HABITUDES / HORAIRES : ',
  '📸 PREUVES / PHOTOS : ',
  '📝 NOTES : ',
  '```',
].join('\n');
async function posterForum(guild, contrat) {
  try {
    const forum = guild.channels.cache.get(FORUM_CONTRATS);
    if (!forum || forum.type !== 15 || !forum.threads?.create) return;
    const clean = s => (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
    const cli = contrat.commanditaire || (contrat.confidentiel ? 'Anonyme' : '');
    const titre = `${contrat.id}${cli ? ' — ' + cli : ''}`.slice(0, 100);
    const veut = ['confrerie', 'illegal', clean(contrat.status === 'propose' ? 'en attente' : contrat.status)].filter(Boolean);
    const tags = forum.availableTags || [];
    const appliedTags = tags.filter(t => { const tn = clean(t.name); return veut.some(w => w && (tn.includes(w) || w.includes(tn))); }).map(t => t.id).slice(0, 5);
    const msg = { embeds: [buildContratEmbed(contrat)] };
    const opts = { name: titre, message: msg };
    if (appliedTags.length) opts.appliedTags = appliedTags;
    let post = await forum.threads.create(opts).catch(() => null);
    if (!post && appliedTags.length) post = await forum.threads.create({ name: titre, message: msg }).catch(() => null); // repli sans étiquettes
    if (post) {
      const starter = await post.fetchStarterMessage?.().catch(() => null);
      const db = loadDB(); const c = findContrat(db, contrat.id);
      if (c) { c.forumThreadId = post.id; c.forumMsgId = starter?.id || null; saveDB(db); }
      contrat.forumThreadId = post.id; contrat.forumMsgId = starter?.id || null;
      // Fiche de renseignement à compléter : un guide stylé + un modèle copiable, postés dans le fil
      await post.send({ embeds: [buildFicheRenseignementEmbed(contrat)] }).catch(() => {});
      await post.send({ content: FICHE_RENSEIGNEMENT_MODELE }).catch(() => {});
    }
  } catch (e) { console.log('⚠️ post contrat Confrérie forum:', e.message); }
}

async function onModalSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const parts = interaction.customId.split('::');
  const typeMission = parts[1] || 'Autre';
  const risque = parts[2] || 'discret';
  const db = loadDB();
  if (!db.contrats) db.contrats = [];

  const commanditaire = (interaction.fields.getTextInputValue('commanditaire') || '').trim();
  const confidentiel = commanditaire.length === 0; // anonyme ⇒ confidentiel
  const emetteurIC = db.members?.[interaction.user.id]?.name || interaction.user.username;

  const contrat = {
    id: genId(),
    cc: true,
    guildId: interaction.guild.id,
    typeMission,
    type: 'confrerie',
    risque,
    commanditaire,
    confidentiel,
    objet: interaction.fields.getTextInputValue('objet'),
    remuneration: interaction.fields.getTextInputValue('remuneration'),
    dateEcheance: parseDateFR(interaction.fields.getTextInputValue('echeance')),
    echeanceTexte: (interaction.fields.getTextInputValue('echeance') || '').trim() || null,
    details: (interaction.fields.getTextInputValue('details') || '').trim(),
    agents: [],
    emetteurId: interaction.user.id,
    emetteurNom: interaction.user.username,
    emetteurIC,
    status: 'propose',
    createdAt: new Date().toISOString(),
  };
  // Reformulation IA façon Far West 1904 du contenu narratif (objet + consignes), en parallèle
  [contrat.objet, contrat.details] = await Promise.all([rp1904(contrat.objet), rp1904(contrat.details)]);
  db.contrats.push(contrat);
  saveDB(db); _persistNow();
  syncNotion(contrat, '🟡 Proposé');

  const ch = await fetchCh(interaction.guild, CH_CONTRATS);
  if (!ch) { await interaction.editReply({ content: '⚠️ Contrat enregistré, mais le salon #contrats est introuvable.' }); return; }
  const sent = await ch.send({
    content: `${directionMention(interaction.guild)} — 🐺 Nouveau contrat à valider.`,
    embeds: [buildContratEmbed(contrat)],
    components: buildContratButtons(contrat),
  });
  contrat.msgId = sent.id;
  contrat.channelId = ch.id;
  saveDB(db); await _persistNow(); // ATTENDRE la sauvegarde Gist : le contrat survit à un redéploiement immédiat
  posterForum(interaction.guild, contrat).catch(() => {});
  await interaction.editReply({ content: `✅ Contrat **${contrat.id}** créé${confidentiel ? ' *(anonyme & confidentiel)*' : ''}.` });
}

// ═══════════════════════════════════════════════════════════════
// VALIDATION / REFUS
// ═══════════════════════════════════════════════════════════════
async function onAccept(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'propose') return interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral });
  c.status = 'actif';
  c.acceptedAt = new Date().toISOString();
  c.acceptePar = db.members?.[interaction.user.id]?.name || interaction.user.username;
  await interaction.update({ embeds: [buildContratEmbed(c)], components: buildContratButtons(c) }); // accusé de réception d'abord
  saveDB(db); await _persistNow(); syncNotion(c, '🟢 En cours');                                     // puis travail lent
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle(`🟢 Contrat validé — ${c.id}`).setDescription(`**${c.typeMission}** · validé par ${c.acceptePar}`).setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()] }).catch(() => {});
}
async function onRefuse(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'propose') return interaction.reply({ content: '❌ Contrat introuvable ou déjà traité.', flags: MessageFlags.Ephemeral });
  c.status = 'refuse';
  c.closedAt = new Date().toISOString();
  await interaction.update({ embeds: [buildContratEmbed(c)], components: [] }); // accusé de réception d'abord
  saveDB(db); await _persistNow(); syncNotion(c, '⛔ Refusé');
}

// ═══════════════════════════════════════════════════════════════
// ASSIGNATION D'AGENTS (+ briefing DM)
// ═══════════════════════════════════════════════════════════════
async function onAssign(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'actif') return interaction.reply({ content: '❌ Contrat introuvable ou non actif.', flags: MessageFlags.Ephemeral });
  const menu = new UserSelectMenuBuilder()
    .setCustomId(`cc_assign_go::${id}`)
    .setPlaceholder('Choisis les agents à assigner...')
    .setMinValues(1)
    .setMaxValues(10);
  return interaction.reply({ content: `🎯 **Assignation — contrat ${id}**\nSélectionne les agents (ils recevront leur briefing en DM).`, components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral });
}
async function onAssignGo(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.update({ content: '❌ Contrat introuvable.', components: [] });
  c.agents = Array.from(new Set([...(c.agents || []), ...interaction.values]));
  if (!c.agentsStatus) c.agentsStatus = {};
  for (const uid of c.agents) { if (!c.agentsStatus[uid]) c.agentsStatus[uid] = 'attente'; }
  await interaction.update({ content: `✅ ${interaction.values.length} agent(s) assigné(s) au contrat **${id}**. Briefings envoyés — ils doivent **accepter ou refuser**.`, components: [] }); // accusé de réception d'abord
  saveDB(db); await _persistNow(); // ATTENDRE la sauvegarde : sinon un redémarrage avant la fin = « Contrat introuvable » au clic de l'agent
  await envoyerBriefings(interaction.guild, c);
  await rafraichirFiche(interaction.guild, c);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0x5865F2).setTitle(`🎯 Agents assignés — ${c.id}`).setDescription(`${c.agents.map(a => `<@${a}>`).join(', ')}`).setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()] }).catch(() => {});
}

// ═══════════════════════════════════════════════════════════════
// RÉPONSE D'UN AGENT (accepte / refuse — depuis son DM ou le salon)
// ═══════════════════════════════════════════════════════════════
async function onAgentReponse(interaction, accepte) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral });
  const uid = interaction.user.id;
  if (!(c.agents || []).includes(uid)) return interaction.reply({ content: "❌ Tu n'es pas assigné à ce contrat.", flags: MessageFlags.Ephemeral });
  if (!c.agentsStatus) c.agentsStatus = {};
  c.agentsStatus[uid] = accepte ? 'accepte' : 'refuse';
  saveDB(db);
  const txt = accepte
    ? '✅ Tu as **accepté** la mission. La Confrérie compte sur toi.'
    : "⛔ Tu as **refusé** la mission. C'est noté.";
  try { await interaction.update({ embeds: interaction.message.embeds, components: [], content: txt }); } // accusé de réception (< 3 s) d'abord
  catch { try { await interaction.reply({ content: txt, flags: MessageFlags.Ephemeral }); } catch {} }
  await _persistNow(); // puis on attend la sauvegarde durable (l'accusé est déjà parti)
  // Retrouver le serveur : un agent peut cliquer depuis ses MP, où interaction.guild est null
  const guild = interaction.guild || interaction.client.guilds.cache.get(c.guildId);
  if (guild) {
    const jc = journalCh(guild);
    if (jc) await jc.send({
      content: accepte ? undefined : (directionMention(guild) || undefined), // on prévient la Direction surtout en cas de refus
      embeds: [new EmbedBuilder()
        .setColor(accepte ? 0x57F287 : 0xED4245)
        .setTitle(`${accepte ? '✅ Mission acceptée par un agent' : '⛔ Mission refusée par un agent'} · ${c.id}`)
        .setDescription(`<@${uid}> a **${accepte ? 'accepté' : 'refusé'}** le contrat **${c.id}** (${emojiType(c.typeMission)} ${c.typeMission}).`)
        .setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()],
    }).catch(() => {});
    await rafraichirFiche(guild, c);
  }
}

// ═══════════════════════════════════════════════════════════════
// FIN DE MISSION
// ═══════════════════════════════════════════════════════════════
async function cloturer(interaction, succes) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c || c.status !== 'actif') return interaction.reply({ content: '❌ Contrat introuvable ou non actif.', flags: MessageFlags.Ephemeral });
  c.status = succes ? 'reussie' : 'echouee';
  c.closedAt = new Date().toISOString();
  c.clôturePar = db.members?.[interaction.user.id]?.name || interaction.user.username;
  // Montant de la prime (best effort depuis le champ rémunération en texte libre)
  const montant = succes ? (parseFloat(String(c.remuneration || '').replace(/[^0-9.,]/g, '').replace(',', '.')) || 0) : 0;
  // 💰 Créditer le coffre commun UNE SEULE FOIS (anti-double-encaissement) — corrige la désync CA↔coffre
  if (succes && montant > 0 && !c.remuVerseAuCoffre) {
    if (typeof db.coffre !== 'number') db.coffre = 0;
    db.coffre += montant;
    c.remuVerseAuCoffre = montant;
    c.honoreAt = new Date().toISOString();
  }
  await interaction.update({ embeds: [buildContratEmbed(c)], components: [] }); // accusé de réception d'abord
  saveDB(db); await _persistNow(); syncNotion(c, succes ? '✅ Réussie' : '💀 Échouée');
  await archiver(interaction.guild, c);
  // Facture : un contrat Confrérie réussi est aussi répertorié dans le forum factures
  if (succes) {
    try {
      const fact = require('./factures');
      await fact.creerFactureContrat?.(interaction.guild, c, { montant, par: c.clôturePar, parId: interaction.user.id });
    } catch (e) { console.log('⚠️ facture contrat Confrérie:', e.message); }
  }
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(succes ? 0x57F287 : 0xED4245).setTitle(`${succes ? '✅' : '💀'} Contrat ${succes ? 'réussi' : 'échoué'} — ${c.id}`).setDescription(`**${c.typeMission}** · clôturé par ${c.clôturePar}`).setFooter({ text: 'La Confrérie • Contrats' }).setTimestamp()] }).catch(() => {});
  // prévenir les agents
  for (const userId of (c.agents || [])) {
    try {
      const m = await interaction.guild.members.fetch(userId).catch(() => null);
      if (m) await m.send({ embeds: [new EmbedBuilder()
        .setColor(0xC9A66B) // parchemin
        .setTitle(`📜 ⸺  ${succes ? 'MISSION ACCOMPLIE' : 'MISSION ÉCHOUÉE'}  ⸺ 📜`)
        .setDescription([
          '```',
          '  ════════════════════════════════════════',
          '        ✦   EN L\'AN DE GRÂCE  1904   ✦',
          '  ════════════════════════════════════════',
          '```',
          `*Concernant le pacte \`${c.id}\` (${emojiType(c.typeMission)} ${c.typeMission})…*`,
          '',
          succes
            ? '✒️ *Belle besogne, frère. La Confrérie n\'oublie jamais les siens — ta part te reviendra.*'
            : '🩸 *La besogne a tourné court. On en tire les leçons, et l\'on remet l\'ouvrage sur le métier.*',
        ].join('\n'))
        .setFooter({ text: '✒️ La Confrérie — an 1904 • Confidentiel' })
        .setImage(PARCHEMIN_IMG)], files: [parcheminFichier()].filter(Boolean) }).catch(() => {});
    } catch {}
  }
}

// ═══════════════════════════════════════════════════════════════
// SIGNATURE PAR UNE PERSONNE (via son ID Discord, en MP) — contrat anonyme
// ═══════════════════════════════════════════════════════════════
// 1) Direction clique « ✍️ Faire signer » → menu des INVITÉS (rôle Visiteur), aucun ID à copier
async function onFaireSigner(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const c = findContrat(loadDB(), id);
  if (!c) return interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral });
  if (c.signe) return interaction.reply({ content: '✅ Ce contrat est déjà signé.', flags: MessageFlags.Ephemeral });
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  try { await interaction.guild.members.fetch(); } catch {} // s'assurer que tous les membres sont en cache
  const invites = listerInvites(interaction.guild);
  if (!invites.length) return interaction.editReply({ content: '❌ Aucun **invité** (rôle Visiteur) trouvé. Vérifie que la personne a bien le rôle Visiteur sur le serveur.' });
  const tronque = invites.length > 25;
  const options = invites.slice(0, 25).map(v => ({
    label: v.pseudo.slice(0, 100),
    value: v.id,
    description: (v.aNomRP ? '🎭 Nom RP renseigné' : '👤 Pseudo sans nom RP complet') + ` · @${v.username}`.slice(0, 100),
    default: v.id === c.signataireId,
  }));
  const menu = new StringSelectMenuBuilder()
    .setCustomId(`cc_sign_pick::${id}`)
    .setPlaceholder('Choisis l\'invité qui doit signer...')
    .setMinValues(1).setMaxValues(1)
    .addOptions(options);
  return interaction.editReply({ content: `✍️ **Faire signer — contrat ${id}**\nSélectionne l'invité (rôle **Visiteur**) qui recevra le contrat en MP${tronque ? `\n*(${invites.length} invités trouvés — 25 premiers affichés, ceux avec un nom RP en tête)*` : ''} :`, components: [new ActionRowBuilder().addComponents(menu)] });
}
// 2) Sélection de l'invité → on envoie le contrat en MP avec un bouton « Signer »
async function onSignPick(interaction) {
  await interaction.deferUpdate();
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.editReply({ content: '❌ Contrat introuvable.', components: [] });
  if (c.signe) return interaction.editReply({ content: '✅ Ce contrat est déjà signé.', components: [] });
  const uid = interaction.values[0];
  const user = await interaction.client.users.fetch(uid).catch(() => null);
  if (!user) return interaction.editReply({ content: '❌ Utilisateur introuvable.', components: [] });
  const btn = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`cc_dosign::${id}`).setLabel('Apposer ma marque').setEmoji('✒️').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`cc_norefuse::${id}`).setLabel('Décliner').setEmoji('✖️').setStyle(ButtonStyle.Danger),
  );
  const dm = await user.send({ embeds: [buildSignatureEmbed(c)], components: [btn], files: [parcheminFichier()].filter(Boolean) }).catch(() => null);
  if (!dm) return interaction.editReply({ content: `⚠️ Impossible d'envoyer le MP à <@${uid}> (ses messages privés sont fermés, ou le bot n'a aucun serveur en commun avec cette personne).`, components: [] });
  c.signataireId = uid;
  c.signatureEnvoyeeAt = new Date().toISOString();
  c.signe = false;
  saveDB(db); await _persistNow();
  await rafraichirFiche(interaction.guild, c).catch(() => {});
  return interaction.editReply({ content: `✅ Contrat **${c.id}** envoyé en MP à <@${uid}> pour signature. Tu seras prévenu dès qu'il signe.`, components: [] });
}
// 3) La personne clique « Signer » (depuis son MP) → on enregistre la signature
async function onDoSign(interaction, accepte) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral });
  if (c.signataireId && interaction.user.id !== c.signataireId) return interaction.reply({ content: '❌ Ce contrat ne t\'est pas destiné.', flags: MessageFlags.Ephemeral });
  if (c.signe) return interaction.reply({ content: 'ℹ️ Ce contrat est déjà signé.', flags: MessageFlags.Ephemeral });
  if (accepte) { c.signe = true; c.signeAt = new Date().toISOString(); c.signeParId = interaction.user.id; }
  else { c.signe = false; c.signatureRefuseeAt = new Date().toISOString(); }
  saveDB(db);
  const txt = accepte ? '✒️ *Votre marque est apposée au bas du parchemin.* La Confrérie a reçu votre parole — qu\'elle vous engage.' : '🚫 *Vous avez décliné de sceller ce pacte.* C\'est entendu.';
  try { await interaction.update({ embeds: interaction.message.embeds, components: [], content: txt }); } // accusé de réception (< 3 s) d'abord
  catch { try { await interaction.reply({ content: txt, flags: MessageFlags.Ephemeral }); } catch {} }
  await _persistNow(); // puis on attend la sauvegarde durable
  const guild = interaction.guild || interaction.client.guilds.cache.get(c.guildId);
  if (guild) {
    const embedSig = new EmbedBuilder()
      .setColor(accepte ? 0x57F287 : 0xED4245)
      .setTitle(`${accepte ? '🖋️ Contrat signé' : '❌ Signature refusée'} — ${c.id}`)
      .setDescription(`<@${interaction.user.id}> a **${accepte ? 'signé' : 'refusé de signer'}** le contrat **${c.id}** (${emojiType(c.typeMission)} ${c.typeMission}).`)
      .setFooter({ text: 'La Confrérie • Signature' }).setTimestamp();
    // L'alerte de signature est postée dans le FIL DU FORUM du contrat (avec l'activité de la mission),
    // et non plus dans le journal de bord. Repli sur le journal si le fil est introuvable → jamais perdue.
    const cible = (await forumThread(guild, c)) || journalCh(guild);
    if (cible) await cible.send({ embeds: [embedSig] }).catch(() => {});
    await rafraichirFiche(guild, c).catch(() => {});
  }
}

// ═══════════════════════════════════════════════════════════════
// MODIFIER LE CONTRAT (tous les champs) + AJOUTER UNE INFO (notes datées)
// ═══════════════════════════════════════════════════════════════
async function onEdit(interaction) {
  if (!isDirection(interaction.member)) return interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const c = findContrat(loadDB(), id);
  if (!c) return interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral });
  const modal = new ModalBuilder().setCustomId(`cc_edit_modal::${id}`).setTitle(`✏️ Modifier ${id}`.slice(0, 45));
  const champ = (cid, label, val, style, req, max) => { const t = new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style).setRequired(!!req); if (max) t.setMaxLength(max); if (val) t.setValue(String(val).slice(0, max || 100)); return new ActionRowBuilder().addComponents(t); };
  modal.addComponents(
    champ('commanditaire', 'Commanditaire (vide = anonyme)', c.commanditaire, TextInputStyle.Short, false, 100),
    champ('objet', 'Objet de la mission', c.objet, TextInputStyle.Short, true, 200),
    champ('remuneration', 'Prime / Rémunération', c.remuneration, TextInputStyle.Short, true, 200),
    champ('echeance', 'Échéance (JJ/MM/AAAA ou texte)', c.echeanceTexte || (c.dateEcheance ? fmtDate(c.dateEcheance) : ''), TextInputStyle.Short, false, 60),
    champ('details', 'Consignes / détails', c.details, TextInputStyle.Paragraph, false, 900),
  );
  return interaction.showModal(modal);
}
async function onEditSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.editReply({ content: '❌ Contrat introuvable.' });
  c.commanditaire = (interaction.fields.getTextInputValue('commanditaire') || '').trim();
  c.confidentiel = c.commanditaire.length === 0; // anonyme ⇒ confidentiel
  c.objet = (interaction.fields.getTextInputValue('objet') || '').trim();
  c.remuneration = (interaction.fields.getTextInputValue('remuneration') || '').trim();
  const ech = (interaction.fields.getTextInputValue('echeance') || '').trim();
  c.dateEcheance = parseDateFR(ech);
  c.echeanceTexte = ech || null;
  c.details = (interaction.fields.getTextInputValue('details') || '').trim();
  // Reformulation IA façon Far West 1904 du contenu narratif modifié
  [c.objet, c.details] = await Promise.all([rp1904(c.objet), rp1904(c.details)]);
  saveDB(db); await _persistNow();
  await rafraichirFiche(interaction.guild, c).catch(() => {});
  return interaction.editReply({ content: `✅ Contrat **${id}** mis à jour.` });
}
async function onAddInfo(interaction) {
  const id = interaction.customId.split('::')[1];
  const c = findContrat(loadDB(), id);
  if (!c) return interaction.reply({ content: '❌ Contrat introuvable.', flags: MessageFlags.Ephemeral });
  // Direction OU un agent assigné à ce contrat peut enrichir la mission
  const autorise = isDirection(interaction.member) || (c.agents || []).includes(interaction.user.id);
  if (!autorise) return interaction.reply({ content: '❌ Réservé à la Direction et aux agents assignés à ce contrat.', flags: MessageFlags.Ephemeral });
  const modal = new ModalBuilder().setCustomId(`cc_addinfo_modal::${id}`).setTitle('➕ Ajouter une info');
  modal.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId('info').setLabel('Information à ajouter à la mission').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('Nouveau repère, mise à jour, contact, danger...'),
  ));
  return interaction.showModal(modal);
}
async function onAddInfoSubmit(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const c = findContrat(db, id);
  if (!c) return interaction.editReply({ content: '❌ Contrat introuvable.' });
  const autorise = isDirection(interaction.member) || (c.agents || []).includes(interaction.user.id);
  if (!autorise) return interaction.editReply({ content: '❌ Réservé à la Direction et aux agents assignés à ce contrat.' });
  let txt = (interaction.fields.getTextInputValue('info') || '').trim();
  if (!txt) return interaction.editReply({ content: '❌ Information vide.' });
  txt = await rp1904(txt); // reformulation IA façon Far West 1904
  if (!Array.isArray(c.infos)) c.infos = [];
  c.infos.push({ texte: txt.slice(0, 500), date: new Date().toISOString(), parId: interaction.user.id, par: interaction.member?.displayName || interaction.user.username });
  saveDB(db); await _persistNow();
  await rafraichirFiche(interaction.guild, c).catch(() => {});
  return interaction.editReply({ content: `✅ Info ajoutée au contrat **${id}**.` });
}

// ═══════════════════════════════════════════════════════════════
// MES CONTRATS
// ═══════════════════════════════════════════════════════════════
async function onMine(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const uid = interaction.user.id;
  const mine = (db.contrats || []).filter(c => c.cc && (c.emetteurId === uid || (c.agents || []).includes(uid)));
  if (!mine.length) return interaction.editReply({ content: '🗂️ Aucun contrat à ton nom pour l\'instant.' });
  const actifs = mine.filter(c => c.status === 'actif' || c.status === 'propose');
  const clos = mine.filter(c => ['reussie', 'echouee', 'refuse'].includes(c.status)).slice(-8);
  const ligne = c => `${(STATUTS[c.status] || STATUTS.propose).label} \`${c.id}\` — ${emojiType(c.typeMission)} ${c.typeMission}${c.dateEcheance ? ` · ⏳ ${fmtDate(c.dateEcheance)}` : ''}`;
  const e = new EmbedBuilder().setColor(0x8B1A1A).setTitle('🗂️ Mes contrats — La Confrérie')
    .addFields(
      { name: `🟢 En cours / proposés (${actifs.length})`, value: actifs.length ? actifs.map(ligne).join('\n') : '*Aucun*', inline: false },
      { name: `📁 Clôturés récents (${clos.length})`, value: clos.length ? clos.map(ligne).join('\n') : '*Aucun*', inline: false },
    ).setFooter({ text: 'La Confrérie • Contrats' });
  return interaction.editReply({ embeds: [e] });
}

// ═══════════════════════════════════════════════════════════════
// RAPPELS D'ÉCHÉANCE (J-3, J-1, dépassement) — à appeler toutes les heures
// ═══════════════════════════════════════════════════════════════
async function checkEcheances(guild) {
  try {
    const db = loadDB();
    if (!db.contrats?.length) return;
    let changed = false;
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const jc = journalCh(guild);
    if (!jc) return;
    for (const c of db.contrats) {
      if (!c.cc || c.status !== 'actif' || !c.dateEcheance) continue;
      const d = new Date(c.dateEcheance + 'T00:00:00');
      if (isNaN(d.getTime())) continue;
      const jours = Math.round((d - today) / 86400000);
      const ping = [directionMention(guild), ...(c.agents || []).map(a => `<@${a}>`)].filter(Boolean).join(' ');
      const envoyer = (titre, couleur, txt) => jc.send({ content: ping || undefined, embeds: [new EmbedBuilder().setColor(couleur).setTitle(titre).setDescription(txt).addFields({ name: '🎯 Mission', value: `${emojiType(c.typeMission)} ${c.typeMission}`, inline: true }, { name: '📅 Échéance', value: fmtDate(c.dateEcheance), inline: true }).setFooter({ text: 'La Confrérie • Rappel d\'échéance' })] }).catch(() => {});
      if (jours < 0 && !c.relanceDepasse) {
        await envoyer(`🔴 Contrat DÉPASSÉ — ${c.id}`, 0x8B1A1A, `L'échéance du contrat **${c.id}** est **dépassée**. À clôturer ou relancer.`);
        c.relanceDepasse = true; changed = true;
      } else if (jours === 1 && !c.relance1j) {
        await envoyer(`🟠 Échéance demain — ${c.id}`, 0xE67E22, `Le contrat **${c.id}** arrive à échéance **demain**.`);
        c.relance1j = true; changed = true;
      } else if (jours <= 3 && jours > 1 && !c.relance3j) {
        await envoyer(`🟡 Échéance dans ${jours}j — ${c.id}`, 0xF1C40F, `Le contrat **${c.id}** arrive à échéance dans **${jours} jours**.`);
        c.relance3j = true; changed = true;
      }
    }
    if (changed) saveDB(db); _persistNow();
  } catch (e) { console.log('❌ checkEcheances error:', e.message); }
}

// ═══════════════════════════════════════════════════════════════
// ROUTEUR D'INTERACTIONS — renvoie true si l'interaction a été gérée
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'contrat-panel') {
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '❌ Réservé à la Direction.', flags: MessageFlags.Ephemeral }); return true; }
      await postPanel(interaction.channel);
      await interaction.reply({ content: '✅ Panneau des contrats publié.', flags: MessageFlags.Ephemeral });
      return true;
    }
    if (interaction.isButton?.()) {
      const id = interaction.customId;
      if (id === 'cc_new') { await onNew(interaction); return true; }
      if (id === 'cc_mine') { await onMine(interaction); return true; }
      if (id.startsWith('cc_accept::')) { await onAccept(interaction); return true; }
      if (id.startsWith('cc_refuse::')) { await onRefuse(interaction); return true; }
      if (id.startsWith('cc_assign::')) { await onAssign(interaction); return true; }
      if (id.startsWith('cc_done::')) { await cloturer(interaction, true); return true; }
      if (id.startsWith('cc_fail::')) { await cloturer(interaction, false); return true; }
      if (id.startsWith('cc_agok::')) { await onAgentReponse(interaction, true); return true; }
      if (id.startsWith('cc_agno::')) { await onAgentReponse(interaction, false); return true; }
      if (id.startsWith('cc_sign::')) { await onFaireSigner(interaction); return true; }
      if (id.startsWith('cc_dosign::')) { await onDoSign(interaction, true); return true; }
      if (id.startsWith('cc_norefuse::')) { await onDoSign(interaction, false); return true; }
      if (id.startsWith('cc_edit::')) { await onEdit(interaction); return true; }
      if (id.startsWith('cc_addinfo::')) { await onAddInfo(interaction); return true; }
    }
    if (interaction.isStringSelectMenu?.()) {
      if (interaction.customId === 'cc_type') { await onTypeSelect(interaction); return true; }
      if (interaction.customId.startsWith('cc_risk::')) { await onRiskSelect(interaction); return true; }
      if (interaction.customId.startsWith('cc_sign_pick::')) { await onSignPick(interaction); return true; }
    }
    if (interaction.isUserSelectMenu?.()) {
      if (interaction.customId.startsWith('cc_assign_go::')) { await onAssignGo(interaction); return true; }
    }
    if (interaction.isModalSubmit?.()) {
      if (interaction.customId.startsWith('cc_edit_modal::')) { await onEditSubmit(interaction); return true; }
      if (interaction.customId.startsWith('cc_addinfo_modal::')) { await onAddInfoSubmit(interaction); return true; }
      if (interaction.customId.startsWith('cc_modal::')) { await onModalSubmit(interaction); return true; }
    }
  } catch (e) {
    // Erreurs « bénignes » : clic arrivé trop tard pour la fenêtre de 3 s de Discord (10062),
    // message disparu (10008), ou interaction déjà traitée (40060) → on ignore : rien n'a cassé.
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ contrats-confrerie routeInteraction error:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
  return false;
}

module.exports = { routeInteraction, checkEcheances, postPanel, rafraichirContratsOuverts };

/* ═══════════════════════════════════════════════════════════════
   BRANCHEMENT DANS index.js (3 ajouts) :

   1) En haut du fichier, avec les autres require :
        const contratsConf = require('./contrats-confrerie');

   2) Tout en haut du handler d'interactions
      (juste après la ligne  client.on('interactionCreate', async interaction => {  ) :
        if (await contratsConf.routeInteraction(interaction)) return;

   3) Dans le cron horaire  cron.schedule('0 * * * *', ...)  :
        for (const g of client.guilds.cache.values()) await contratsConf.checkEcheances(g).catch(() => {});

   4) (commande) Ajouter dans le tableau des SlashCommandBuilder :
        new SlashCommandBuilder().setName('contrat-panel').setDescription('📋 Publier le panneau des contrats (Direction)'),
   ═══════════════════════════════════════════════════════════════ */
