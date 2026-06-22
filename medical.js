// ───────────────────────────────────────────────────────────────────────────
//  medical.js — Suivi médical & aptitude (CONFIDENTIEL)
//  ----------------------------------------------------------------------------
//   • Une fiche médicale par membre : statut (apte / observation / inapte /
//     non testé), test d'aptitude validé ou non, prochain RDV (date libre),
//     notes du médecin, historique.
//   • Géré par le MÉDECIN (rôle dédié) + la DIRECTION. Privé (interactions
//     éphémères, dans un salon réservé).
//   • Piloté par boutons + sélecteur de membre (aucune commande slash ajoutée).
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

// ⚠️ À DÉFINIR
const MEDICAL_CHANNEL = '1518574479830155355'; // salon privé où vit le panneau
const ROLE_MEDECIN = '1518574549875163136';       // rôle du médecin

const DIRECTION = ['Fondateur', 'Directeur', 'Conseil', 'Concepteur', 'Fléau', 'fleau', 'Opérateur', 'Operateur', 'Officier'];
function peutGerer(member) { try { return !!member?.roles?.cache?.some(r => r.id === ROLE_MEDECIN || DIRECTION.some(n => r.name.includes(n))); } catch { return false; } }

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }
function _dateFR(ts) { try { return new Date(ts).toLocaleDateString('fr-FR'); } catch { return ''; } }

const STATUTS = {
  non_teste:   { label: '⏳ Non testé',      couleur: 0x95A5A6 },
  apte:        { label: '✅ Apte',           couleur: 0x2ECC71 },
  observation: { label: '⚠️ En observation', couleur: 0xF1C40F },
  inapte:      { label: '❌ Inapte',         couleur: 0xE74C3C },
};

function _fiche(db, id) {
  if (!db.suiviMedical) db.suiviMedical = {};
  if (!db.suiviMedical[id]) db.suiviMedical[id] = { statut: 'non_teste', testValide: false, testDate: null, prochainRdv: null, notes: '', historique: [] };
  return db.suiviMedical[id];
}
function _log(f, action, par) { if (!f.historique) f.historique = []; f.historique.push({ date: _dateFR(Date.now()), action, par }); if (f.historique.length > 30) f.historique = f.historique.slice(-30); }

function _embedFiche(f, gm) {
  const st = STATUTS[f.statut] || STATUTS.non_teste;
  const e = new EmbedBuilder().setColor(st.couleur).setTitle('🩺 Suivi médical — confidentiel')
    .setDescription(gm ? `**${gm.displayName}** · <@${gm.id}>` : 'Membre')
    .addFields(
      { name: 'État', value: st.label, inline: true },
      { name: 'Test d\'aptitude', value: f.testValide ? `✅ Validé${f.testDate ? ` (${_dateFR(f.testDate)})` : ''}` : '❌ Non validé', inline: true },
      { name: 'Prochain RDV', value: f.prochainRdv || '—', inline: true },
      { name: '📝 Notes', value: (f.notes || '*Aucune note*').slice(0, 1000), inline: false },
    );
  if (f.historique?.length) e.addFields({ name: '🕓 Historique', value: f.historique.slice(-5).reverse().map(h => `• \`${h.date}\` ${h.action}${h.par ? ` — *${h.par}*` : ''}`).join('\n').slice(0, 1000), inline: false });
  if (gm?.user) e.setThumbnail(gm.user.displayAvatarURL());
  e.setFooter({ text: f.majPar ? `Dernière mise à jour par ${f.majPar}` : 'Dossier médical confidentiel' });
  return e;
}

function _actions(id) {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`med_apte::${id}`).setLabel('Apte').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`med_obs::${id}`).setLabel('En observation').setEmoji('⚠️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`med_inapte::${id}`).setLabel('Inapte').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`med_test::${id}`).setLabel('Test d\'aptitude ✓/✗').setEmoji('🧪').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`med_rdv::${id}`).setLabel('Prochain RDV').setEmoji('📅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`med_note::${id}`).setLabel('Note').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function installerPanel(guild) {
  const ch = _ch(guild, MEDICAL_CHANNEL);
  if (!ch) return;
  const moi = guild.members.me?.id;
  const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Suivi médical & aptitude')
    .setDescription(['Dossier médical **confidentiel** de chaque membre (réservé au médecin et à la Direction).', '', '• **Ouvrir un dossier** : choisis un membre et consulte/édite son suivi.', '• **Vue d\'ensemble** : la liste des statuts.'].join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('med_select').setLabel('Ouvrir un dossier').setEmoji('🩺').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('med_liste').setLabel('Vue d\'ensemble').setEmoji('📋').setStyle(ButtonStyle.Secondary),
  );
  // Forum (type 15) → post épinglé ; sinon salon classique → message
  if (ch.type === 15 && ch.threads?.create) {
    const act = await ch.threads.fetchActive().catch(() => null);
    if (act?.threads && [...act.threads.values()].some(t => (t.name || '').includes('SUIVI MÉDICAL'))) return;
    const post = await ch.threads.create({ name: '🩺 SUIVI MÉDICAL', message: { embeds: [e], components: [row] } }).catch(() => null);
    if (post?.pin) await post.pin().catch(() => {});
    return;
  }
  if (!ch.send) return;
  const existing = await ch.messages.fetch({ limit: 30 }).catch(() => null);
  if (existing && [...existing.values()].some(m => m.author?.id === moi && m.components?.length && (m.embeds?.[0]?.title || '').includes('Suivi médical'))) return;
  await ch.send({ embeds: [e], components: [row] }).catch(() => {});
}

async function _afficherFiche(interaction, id, viaUpdate) {
  const gm = await interaction.guild.members.fetch(id).catch(() => null);
  const db = loadDB(); const f = _fiche(db, id); saveDB(db);
  const payload = { content: `Dossier de <@${id}> :`, embeds: [_embedFiche(f, gm)], components: _actions(id), flags: MessageFlags.Ephemeral };
  if (viaUpdate) await interaction.update(payload).catch(() => {});
  else await interaction.reply(payload).catch(() => {});
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';

    // Ouvrir le sélecteur de membre
    if (interaction.isButton?.() && cid === 'med_select') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Dossier confidentiel — réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const row = new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('med_pick').setPlaceholder('Choisis le membre').setMaxValues(1));
      await interaction.reply({ content: '🩺 De quel membre veux-tu ouvrir le dossier médical ?', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // Membre sélectionné
    if (interaction.isUserSelectMenu?.() && cid === 'med_pick') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = interaction.values?.[0];
      if (!id) return true;
      await _afficherFiche(interaction, id, true);
      return true;
    }

    // Vue d'ensemble
    if (interaction.isButton?.() && cid === 'med_liste') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const sm = db.suiviMedical || {};
      const ids = Object.keys(sm);
      if (!ids.length) { await interaction.editReply({ content: 'Aucun dossier médical pour le moment. Ouvre-en un via **Ouvrir un dossier**.' }).catch(() => {}); return true; }
      const lignes = ids.slice(0, 40).map(id => { const f = sm[id]; const st = STATUTS[f.statut] || STATUTS.non_teste; return `${st.label.split(' ')[0]} <@${id}> — ${st.label.replace(/^[^ ]+ /, '')}${f.testValide ? ' · 🧪✅' : ''}${f.prochainRdv ? ` · 📅 ${f.prochainRdv}` : ''}`; });
      const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('📋 Suivi médical — vue d\'ensemble').setDescription(lignes.join('\n').slice(0, 4000)).setFooter({ text: `${ids.length} dossier(s)` });
      await interaction.editReply({ embeds: [e] }).catch(() => {});
      return true;
    }

    // Changements de statut
    if (interaction.isButton?.() && (cid.startsWith('med_apte::') || cid.startsWith('med_obs::') || cid.startsWith('med_inapte::'))) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const statut = cid.startsWith('med_apte::') ? 'apte' : (cid.startsWith('med_obs::') ? 'observation' : 'inapte');
      const db = loadDB(); const f = _fiche(db, id);
      f.statut = statut; f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, `Statut → ${STATUTS[statut].label}`, f.majPar); saveDB(db);
      await _afficherFiche(interaction, id, true);
      return true;
    }

    // Test d'aptitude (bascule)
    if (interaction.isButton?.() && cid.startsWith('med_test::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      f.testValide = !f.testValide; f.testDate = f.testValide ? Date.now() : null;
      f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, f.testValide ? 'Test d\'aptitude validé ✅' : 'Test d\'aptitude annulé ❌', f.majPar); saveDB(db);
      await _afficherFiche(interaction, id, true);
      return true;
    }

    // Prochain RDV (modal)
    if (interaction.isButton?.() && cid.startsWith('med_rdv::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const modal = new ModalBuilder().setCustomId(`med_rdv_modal::${id}`).setTitle('📅 Prochain RDV médical');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rdv').setLabel('Date / créneau du RDV').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setValue(f.prochainRdv || '').setPlaceholder('ex : Samedi 14h au cabinet d\'Armadillo')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_rdv_modal::')) {
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const v = (interaction.fields.getTextInputValue('rdv') || '').trim();
      f.prochainRdv = v || null; f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, v ? `RDV fixé : ${v}` : 'RDV retiré', f.majPar); saveDB(db);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      await interaction.editReply({ content: '✅ RDV mis à jour.', embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
      return true;
    }

    // Note (modal, pré-rempli)
    if (interaction.isButton?.() && cid.startsWith('med_note::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const modal = new ModalBuilder().setCustomId(`med_note_modal::${id}`).setTitle('📝 Notes médicales');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Notes (remplace les notes actuelles)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(f.notes || '')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_note_modal::')) {
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      f.notes = (interaction.fields.getTextInputValue('note') || '').trim();
      f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, 'Notes mises à jour', f.majPar); saveDB(db);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      await interaction.editReply({ content: '✅ Notes enregistrées.', embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ medical routeInteraction:', e.message); return true; }
}

module.exports = { installerPanel, routeInteraction, MEDICAL_CHANNEL, ROLE_MEDECIN };
