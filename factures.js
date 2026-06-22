// ───────────────────────────────────────────────────────────────────────────
//  factures.js — FACTURES = trace écrite (forum)
//  ----------------------------------------------------------------------------
//   • PRINCIPAL : quand un contrat est marqué « Honoré » (le client a payé),
//     une facture est créée AUTOMATIQUEMENT sous forme de POST dans le forum.
//   • BONUS : bouton « ➕ Créer une facture » (post épinglé) pour une facture
//     manuelle (médecin, prestation ad hoc).
//   • C'est juste une trace écrite : pas de MP, pas de crédit de coffre ici
//     (le coffre est déjà crédité par l'action « honoré » du contrat).
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

// Forum des factures
const FACTURES_FORUM = '1518568778198159460';

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }
function _euros(n) { const v = parseFloat(n) || 0; return v.toLocaleString('fr-FR'); }
function _nextNumero(db) { return `FAC-${String((db.factures || []).length + 1).padStart(3, '0')}`; }
function _nomPropre(s) { return String(s || '').replace(/<@!?\d{17,20}>/g, '').trim(); }

function _factureEmbed(f) {
  const e = new EmbedBuilder().setColor(0x3BA55D)
    .setTitle(`🧾 Facture ${f.numero}`)
    .setDescription('✅ **Réglée** — trace écrite')
    .addFields(
      { name: '👤 Client', value: (f.clientNom || '—').slice(0, 200), inline: true },
      { name: '💵 Montant réglé', value: `**$${_euros(f.montant)}**`, inline: true },
      { name: '🏷️ Type', value: f.type || 'Contrat', inline: true },
    );
  if (f.objet) e.addFields({ name: '📋 Prestation', value: String(f.objet).slice(0, 1000), inline: false });
  if (f.remuneration) e.addFields({ name: '💼 Accord convenu', value: String(f.remuneration).slice(0, 500), inline: false });
  const bas = [];
  if (f.ref) bas.push({ name: '🔗 Référence', value: String(f.ref).slice(0, 100), inline: true });
  if (f.par) bas.push({ name: '🤝 Réglé / traité par', value: (f.parId ? `<@${f.parId}>` : f.par).slice(0, 100), inline: true });
  if (bas.length) e.addFields(...bas);
  if (f.note) e.addFields({ name: '📝 Détail', value: String(f.note).slice(0, 1000), inline: false });
  e.setFooter({ text: `Iron Wolf Company • Réglée le ${new Date(f.createdAt).toLocaleDateString('fr-FR')}` }).setTimestamp(f.createdAt);
  return e;
}

// Cœur : crée le post-facture dans le forum
async function creerFacture(guild, data) {
  const forum = _ch(guild, FACTURES_FORUM);
  if (!forum || forum.type !== 15 || !forum.threads?.create) return { erreur: 'forum_introuvable' };
  const db = loadDB(); if (!db.factures) db.factures = [];
  if (data.ref && db.factures.some(x => x.ref === data.ref)) return { dejaExiste: true }; // anti-doublon par contrat
  const f = {
    id: `${Date.now()}${Math.floor(Math.random() * 1000)}`, numero: _nextNumero(db),
    objet: data.objet || 'Prestation', montant: parseFloat(data.montant) || 0,
    clientNom: data.clientNom || 'Client', type: data.type || 'Contrat',
    remuneration: data.remuneration || '', ref: data.ref || null, note: data.note || '',
    par: data.par || null, parId: data.parId || null, createdAt: Date.now(),
  };
  const titre = `${f.numero} · ${_nomPropre(f.clientNom) || 'Client'} · $${_euros(f.montant)}`.slice(0, 100);
  const post = await forum.threads.create({ name: titre, message: { embeds: [_factureEmbed(f)] } }).catch(() => null);
  if (post) f.threadId = post.id;
  db.factures.push(f); saveDB(db);
  return { f, post };
}

// Depuis un contrat honoré
async function creerFactureContrat(guild, c, opts = {}) {
  if (!c) return null;
  const clientNom = c.clientNom || c.employeurNom || c.commanditaire || c.client || 'Client';
  const type = (c.cc || c.type === 'confrerie' || String(c.id || '').startsWith('CF-')) ? 'Contrat — Confrérie' : 'Contrat — IWC';
  return creerFacture(guild, {
    objet: c.objet || c.titre || c.description || 'Contrat rempli',
    montant: opts.montant ?? c.remuVerseAuCoffre ?? 0,
    clientNom, type, remuneration: c.remuneration || '',
    ref: c.id ? `Contrat ${c.id}` : null,
    par: opts.par || null, parId: opts.parId || null, note: c.details || '',
  });
}

// Post-bouton « créer une facture manuelle » (épinglé, idempotent)
async function installerPanel(guild) {
  const forum = _ch(guild, FACTURES_FORUM);
  if (!forum || forum.type !== 15 || !forum.threads?.create) return;
  const moi = guild.members.me?.id;
  const act = await forum.threads.fetchActive().catch(() => null);
  const deja = act?.threads && [...act.threads.values()].some(t => (t.name || '').includes('CRÉER UNE FACTURE'));
  if (deja) return;
  const e = new EmbedBuilder().setColor(0xB8860B).setTitle('➕ CRÉER UNE FACTURE (manuelle)')
    .setDescription(['Les factures des **contrats honorés** arrivent ici automatiquement.', '', 'Pour une facture **manuelle** (soin du médecin, prestation ponctuelle…), clique le bouton ci-dessous.'].join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fac_new').setLabel('Nouvelle facture').setEmoji('🧾').setStyle(ButtonStyle.Primary),
  );
  const post = await forum.threads.create({ name: '➕ CRÉER UNE FACTURE', message: { embeds: [e], components: [row] } }).catch(() => null);
  if (post?.pin) await post.pin().catch(() => {});
}

async function routeInteraction(interaction) {
  try {
    if (interaction.isButton?.() && interaction.customId === 'fac_new') {
      const modal = new ModalBuilder().setCustomId('fac_modal').setTitle('🧾 Nouvelle facture');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('objet').setLabel('Objet / prestation').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(200).setPlaceholder('ex : Consultation + soin d\'une blessure par balle')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant réglé ($)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(12).setPlaceholder('ex : 80')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('client').setLabel('Client (nom)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('ex : Earl le forgeron d\'Armadillo')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Type (Médical / Prestation / Autre)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder('Médical')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Détail (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(800)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId === 'fac_modal') {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const r = await creerFacture(interaction.guild, {
        objet: interaction.fields.getTextInputValue('objet').trim(),
        montant: (interaction.fields.getTextInputValue('montant') || '').replace(/[^0-9.,]/g, '').replace(',', '.'),
        clientNom: interaction.fields.getTextInputValue('client').trim(),
        type: (interaction.fields.getTextInputValue('type') || 'Prestation').trim() || 'Prestation',
        note: (interaction.fields.getTextInputValue('note') || '').trim(),
        par: interaction.member?.displayName || interaction.user.username, parId: interaction.user.id,
      });
      const msg = r?.f ? `✅ Facture **${r.f.numero}** créée dans le forum.` : (r?.erreur === 'forum_introuvable' ? '⚠️ Forum des factures introuvable (vérifie l\'ID / les permissions).' : '⚠️ Création impossible.');
      await interaction.editReply({ content: msg }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ factures routeInteraction:', e.message); return true; }
}

module.exports = { creerFacture, creerFactureContrat, installerPanel, routeInteraction, FACTURES_FORUM };
