// ───────────────────────────────────────────────────────────────────────────
//  creation-rapide.js — Assistant « Création rapide » (IWC / Confrérie)
//  ----------------------------------------------------------------------------
//  Permet de créer, EN SOLO et en quelques secondes, une OPÉRATION complète
//  (ou un contrat) sans passer par tout le circuit contrat → validation.
//
//   • 🎯 Nouvelle opération  — menu du type + mini-formulaire → opération créée
//     avec la BASE standard (mêmes catégories + 5 étapes + cycle en cours/
//     terminées), via un « pseudo-contrat » passé à operations-etapes.
//   • 🧠 Décris ta mission   — une phrase → l'IA remplit le formulaire → op créée.
//   • 🔪 Nouveau contrat     — rouvre le formulaire de mission existant (réutilise
//     le modal `modal_mission` déjà géré par index.js).
//
//  Entrées : commande /creer (assistant éphémère) + /creer-panneau (panneau
//  permanent, Direction). Identifiants ISOLÉS « cr_* » → aucune collision.
//  N'ajoute AUCUNE donnée nouvelle : réutilise db.preparations via
//  operations-etapes.creerOperationDepuisContrat.
// ───────────────────────────────────────────────────────────────────────────
const {
  SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags,
} = require('discord.js');

let opsEtapes = {};
try { opsEtapes = require('./operations-etapes'); } catch { opsEtapes = {}; }

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;
const COL = 0xC8A45C;
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function isDirection(member) {
  if (global.aAccesTotal?.(member)) return true;
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n))); } catch { return false; }
}
function _clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Liste des catégories d'opération (nom + emoji) depuis operations-etapes (source unique).
function _categories() {
  const CATS = opsEtapes.CATEGORIES || {};
  const noms = Object.keys(CATS);
  // Dédoublonne les libellés identiques ; garde l'ordre de déclaration.
  return noms.map(nom => ({ nom, emoji: CATS[nom]?.emoji || '🎯' }));
}

// ── Panneau / assistant ──
function _panelPayload() {
  const e = new EmbedBuilder().setColor(COL).setTitle('⚡ Création rapide')
    .setDescription([
      'Crée une **opération** (ou un **contrat**) en solo, en quelques secondes — sans perdre la base habituelle (mêmes catégories, mêmes 5 étapes).',
      '',
      '🎯 **Nouvelle opération** — choisis un type, remplis un mini-formulaire, l\'opération complète est ouverte dans #operations.',
      '🧠 **Décris ta mission** — écris une phrase, l\'IA construit l\'opération pour toi *(modifiable ensuite)*.',
      '🔪 **Nouveau contrat** — le formulaire de contrat de mission habituel.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Création rapide' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('cr_op').setLabel('Nouvelle opération').setEmoji('🎯').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('cr_ia').setLabel('Décris ta mission (IA)').setEmoji('🧠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('cr_contrat').setLabel('Nouveau contrat').setEmoji('🔪').setStyle(ButtonStyle.Secondary),
  );
  return { embeds: [e], components: [row] };
}

// Modal du mini-formulaire d'opération (éventuellement pré-rempli par l'IA).
function _opModal(type, pref) {
  pref = pref || {};
  const inp = (id, label, style, req, max, ph, val) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(req).setMaxLength(max);
    if (ph) t.setPlaceholder(ph);
    if (val) t.setValue(String(val).slice(0, max));
    return new ActionRowBuilder().addComponents(t);
  };
  return new ModalBuilder().setCustomId(`cr_op_modal::${type}`).setTitle(_clip(`🎯 ${type}`, 45)).addComponents(
    inp('cible', 'Cible / objet de l\'opération', TextInputStyle.Short, true, 120, 'Ex : banque de Valentine · Mr. Mercer', pref.objet),
    inp('details', 'Détails / contexte', TextInputStyle.Paragraph, false, 700, 'Ce qu\'il faut savoir, le pourquoi, les contraintes…', pref.details),
    inp('remuneration', 'Prime / rémunération', TextInputStyle.Short, false, 100, 'Ex : 5000$', pref.remuneration),
    inp('echeance', 'Échéance (quand)', TextInputStyle.Short, false, 80, 'Ex : ce week-end · 22/06 au soir', pref.echeance),
  );
}

// Construit le « pseudo-contrat » attendu par operations-etapes et crée l'opération.
async function _creerOperation(interaction, type, champs) {
  if (typeof opsEtapes.creerOperationDepuisContrat !== 'function') {
    await interaction.editReply({ content: '⚠️ Le module des opérations est indisponible.' }).catch(() => {});
    return null;
  }
  const pseudo = {
    id: `CR-${Date.now().toString().slice(-6)}`,
    typeMission: type || 'Autre',
    objet: champs.cible || 'Opération',
    commanditaire: interaction.member?.displayName || interaction.user.username,
    details: champs.details || '',
    remuneration: champs.remuneration || '—',
    echeanceTexte: champs.echeance || null,
  };
  let op = null;
  try { op = await opsEtapes.creerOperationDepuisContrat(interaction.guild, pseudo, { parId: interaction.user.id }); }
  catch (e) { console.log('❌ creation-rapide _creerOperation:', e.message); }
  return op;
}

// L'IA extrait les champs d'opération à partir d'une description libre.
async function _extraireIA(texte) {
  if (!ANTHROPIC_API_KEY) return null;
  const cats = _categories().map(c => c.nom);
  const prompt = `Tu assistes une compagnie (RP western, ~1904). À partir d'une mission décrite librement, extrais les infos pour ouvrir une opération.

Description : ${texte}

Choisis le TYPE parmi EXACTEMENT cette liste (recopie à l'identique) : ${cats.join(' | ')}.
Si rien ne colle, mets "Autre".

Réponds STRICTEMENT en JSON, rien d'autre :
{"typeMission":"<un des types ci-dessus>","objet":"cible/objet en quelques mots","details":"contexte utile en 1-2 phrases","remuneration":"montant si mentionné sinon —","echeance":"quand si mentionné sinon vide"}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 500, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    if (data?.error) { console.log('❌ creation-rapide IA:', data.error.message || data.error); return null; }
    let txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    txt = txt.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const r = JSON.parse(txt);
    if (!cats.includes(r.typeMission)) r.typeMission = 'Autre';
    return r;
  } catch (e) { console.log('❌ creation-rapide _extraireIA:', e.message); return null; }
}

// Modal de contrat de mission — MÊME customId/champs que /mission → géré par index.js.
function _missionModal() {
  return new ModalBuilder().setCustomId('modal_mission').setTitle('🔪 Nouveau contrat de mission').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Cible (nom + qui c\'est)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120).setPlaceholder('Ex : Mercer — propriétaire de la distillerie')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu / repères').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Ex : Blackwater, autour de la distillerie')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('Motif du contrat').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Pourquoi cette cible ? Ce qu\'elle a fait...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('remuneration').setLabel('Rémunération').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('Ex : À confirmer avec William')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('contact').setLabel('Contact / intermédiaire').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('Ex : William — Télégramme 11-529')),
  );
}

const REFUS = { content: '🔒 Réservé à la Direction / Confrérie.', flags: MessageFlags.Ephemeral };

async function installerPanneau(channel) {
  if (!channel?.send) return false;
  const sent = await channel.send(_panelPayload()).catch(() => null);
  if (sent?.pin) await sent.pin().catch(() => {});
  return !!sent;
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';

    // ── Commandes ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'creer') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      await interaction.reply({ ..._panelPayload(), flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isChatInputCommand?.() && interaction.commandName === 'creer-panneau') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const ok = await installerPanneau(interaction.channel);
      await interaction.editReply({ content: ok ? '✅ Panneau **Création rapide** installé ici (épinglé).' : '❌ Impossible d\'installer le panneau ici (vérifie mes permissions).' }).catch(() => {});
      return true;
    }

    // ── 🎯 Nouvelle opération (guidée) → menu du type ──
    if (interaction.isButton?.() && cid === 'cr_op') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      const opts = _categories().slice(0, 25).map(c => ({ label: _clip(c.nom, 100), value: c.nom, emoji: c.emoji }));
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('cr_op_type').setPlaceholder('Choisis le type d\'opération…').addOptions(opts));
      await interaction.reply({ content: '🎯 **Nouvelle opération** — quel type ?', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid === 'cr_op_type') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      const type = interaction.values?.[0] || 'Autre';
      await interaction.showModal(_opModal(type)).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('cr_op_modal::')) {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const type = cid.split('::')[1] || 'Autre';
      const gv = k => (interaction.fields.getTextInputValue(k) || '').trim();
      const op = await _creerOperation(interaction, type, { cible: gv('cible'), details: gv('details'), remuneration: gv('remuneration'), echeance: gv('echeance') });
      await interaction.editReply({ content: op ? `✅ **Opération créée** dans #operations : « ${_clip(op.cible || gv('cible'), 70)} » *(${type})*.\nRemplis puis valide chaque étape sur le panneau. À l'étape 3, elle partira dans « opérations en cours ».` : '⚠️ Impossible de créer l\'opération (réessaie).' }).catch(() => {});
      return true;
    }

    // ── 🧠 Décris ta mission (IA) ──
    if (interaction.isButton?.() && cid === 'cr_ia') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId('cr_ia_modal').setTitle('🧠 Décris ta mission').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Ta mission en une phrase ou deux').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Ex : braquage de la banque de Valentine à 3, prime 5000, ce week-end')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'cr_ia_modal') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const desc = (interaction.fields.getTextInputValue('desc') || '').trim();
      if (!ANTHROPIC_API_KEY) { await interaction.editReply({ content: '⚠️ L\'assistant IA n\'est pas disponible (clé manquante). Utilise **🎯 Nouvelle opération** à la place.' }).catch(() => {}); return true; }
      const r = await _extraireIA(desc);
      if (!r) { await interaction.editReply({ content: '⚠️ L\'IA n\'a pas pu analyser la description. Réessaie, ou utilise **🎯 Nouvelle opération**.' }).catch(() => {}); return true; }
      const op = await _creerOperation(interaction, r.typeMission, { cible: r.objet, details: r.details, remuneration: r.remuneration, echeance: r.echeance });
      await interaction.editReply({ content: op ? `✅ **Opération créée par l'IA** dans #operations : « ${_clip(op.cible || r.objet, 70)} » *(${r.typeMission})*.\nVérifie/complète les étapes sur le panneau — tout est modifiable.` : '⚠️ Impossible de créer l\'opération (réessaie).' }).catch(() => {});
      return true;
    }

    // ── 🔪 Nouveau contrat → réutilise le formulaire de mission existant ──
    if (interaction.isButton?.() && cid === 'cr_contrat') {
      if (!isDirection(interaction.member)) { await interaction.reply(REFUS).catch(() => {}); return true; }
      await interaction.showModal(_missionModal()).catch(() => {});
      return true; // la soumission `modal_mission` est traitée par index.js
    }

    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ creation-rapide routeInteraction:', e.message); return true; }
}

const creationCommands = [
  new SlashCommandBuilder().setName('creer').setDescription('⚡ Créer une opération ou un contrat en solo (assistant rapide)'),
  new SlashCommandBuilder().setName('creer-panneau').setDescription('⚡ Installer ici le panneau permanent « Création rapide » (Direction)'),
].map(c => c.toJSON());

module.exports = { installerPanneau, routeInteraction, creationCommands };
module.exports.__test = { _categories, _panelPayload, _opModal, _missionModal }; // tests uniquement
