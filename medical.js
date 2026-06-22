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

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;

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

// Génère le contenu détaillé du test (IA) à partir d'un résumé court + verdict
async function _genererTest(input) {
  if (!ANTHROPIC_API_KEY) return null;
  const prompt = `Tu es le Dr. June McCall, médecin praticien agréé (RP western, ~1899, État de Louisiane — Bureau Médical de Rhodes). Tu rédiges un TEST D'APTITUDE MÉDICALE complet et cohérent.

À partir des infos patient, du RÉSUMÉ d'examen du praticien et du VERDICT, génère le contenu détaillé des 7 sections, COHÉRENT avec le résumé et le verdict (un patient APTE a de bons résultats ; un INAPTE présente des faiblesses qui collent au résumé). Ton sérieux, médical, à la première personne du praticien pour les observations.

Patient : ${input.patient}
Données physiques : ${input.physique || '—'}
Résumé d'examen : ${input.resume}
Verdict : ${input.verdict}

Réponds STRICTEMENT en JSON, rien d'autre :
{
 "apparence": {"posture":"Droite/Voûtée/…","aspect":"courte description","obs":"observation"},
 "physique": {"force":"Faible/Moyenne/Bonne","endurance":"Faible/Moyenne/Bonne","coordination":"Normale/Altérée","obs":"…"},
 "sensoriel": {"vue":"Normale/Altérée","ouie":"Normale/Altérée","odorat":"Normal/Altéré","toucher":"Normal/Altéré","reactivite":"Vive/Normale/Lente","obs":"…"},
 "sante": {"constitution":"Robuste/Moyenne/Fragile","fatigue":"Oui/Non","respiration":"Normale/Difficultés","pouls":"Régulier/Irrégulier","obs":"…"},
 "habitudes": {"regime":"…","consommation":"…","antecedents":"…","obs":"…"},
 "maladies": {"actuelles":"Aucune/…","passees":"…","allergies":"Aucune/…","traitements":"…","obs":"…"},
 "intellect": {"lecture":"Bonne/Moyenne/Faible/Nulle","ecriture":"Bonne/Moyenne/Faible/Nulle","calcul":"Bon/Moyen/Faible/Nul","comprehension":"Bon/Moyen/Faible","obs":"…"},
 "conclusion": "2-3 phrases de motivation du verdict, style praticien"
}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 1600, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    let txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    txt = txt.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    return JSON.parse(txt);
  } catch (e) { console.log('❌ medical genererTest:', e.message); return null; }
}

function _sec(pairs, obs) {
  const line = pairs.filter(([, v]) => v).map(([k, v]) => `**${k} :** ${v}`).join(' · ');
  return ((line || '—') + (obs ? `\n*${obs}*` : '')).slice(0, 1024);
}

function _embedTest(input, r, gm) {
  const col = /inapte/i.test(input.verdict) ? 0xE74C3C : (/r[ée]serve/i.test(input.verdict) ? 0xF1C40F : 0x2ECC71);
  const e = new EmbedBuilder().setColor(col).setTitle('🩺 TEST D\'APTITUDE MÉDICALE')
    .setDescription([
      '*Examen complet de l\'état physique, sensoriel et intellectuel du sujet*',
      '__**État de Louisiane — Bureau Médical de Rhodes**__',
      '✦✦✦',
      `**Patient :** ${input.patient}`,
      `**Date & lieu :** ${input.dateLieu || '—'}`,
      input.physique ? `**Données :** ${input.physique}` : '',
    ].filter(Boolean).join('\n').slice(0, 4000));
  const s = r || {};
  if (s.apparence) e.addFields({ name: '§ I — Apparence générale', value: _sec([['Posture', s.apparence.posture], ['Aspect', s.apparence.aspect]], s.apparence.obs) });
  if (s.physique) e.addFields({ name: '§ II — État physique', value: _sec([['Force', s.physique.force], ['Endurance', s.physique.endurance], ['Coordination', s.physique.coordination]], s.physique.obs) });
  if (s.sensoriel) e.addFields({ name: '§ III — Capacités sensorielles', value: _sec([['Vue', s.sensoriel.vue], ['Ouïe', s.sensoriel.ouie], ['Odorat', s.sensoriel.odorat], ['Toucher', s.sensoriel.toucher], ['Réactivité', s.sensoriel.reactivite]], s.sensoriel.obs) });
  if (s.sante) e.addFields({ name: '§ IV — État général de santé', value: _sec([['Constitution', s.sante.constitution], ['Fatigue', s.sante.fatigue], ['Respiration', s.sante.respiration], ['Pouls', s.sante.pouls]], s.sante.obs) });
  if (s.habitudes) e.addFields({ name: '§ V — Habitudes & antécédents', value: _sec([['Régime', s.habitudes.regime], ['Consommation', s.habitudes.consommation], ['Antécédents', s.habitudes.antecedents]], s.habitudes.obs) });
  if (s.maladies) e.addFields({ name: '§ VI — Maladies & allergies', value: _sec([['Actuelles', s.maladies.actuelles], ['Passées', s.maladies.passees], ['Allergies', s.maladies.allergies], ['Traitements', s.maladies.traitements]], s.maladies.obs) });
  if (s.intellect) e.addFields({ name: '§ VII — Capacités intellectuelles', value: _sec([['Lecture', s.intellect.lecture], ['Écriture', s.intellect.ecriture], ['Calcul', s.intellect.calcul], ['Compréhension', s.intellect.comprehension]], s.intellect.obs) });
  e.addFields({ name: '✦ CONCLUSION — Verdict d\'aptitude', value: `**${(input.verdict || '').toUpperCase()}**\n${s.conclusion || (r ? '' : '_Détails de l\'examen à compléter._')}`.slice(0, 1024) });
  e.setFooter({ text: 'Dr. June McCall, praticien agréé • Établi de bonne foi, fait foi auprès des autorités. Toute falsification est passible de poursuites (loi fédérale des É.-U.).' });
  if (gm?.user) e.setThumbnail(gm.user.displayAvatarURL());
  e.setTimestamp();
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
      new ButtonBuilder().setCustomId(`med_test::${id}`).setLabel('Marquer test ✓/✗').setEmoji('✔️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`med_rdv::${id}`).setLabel('Prochain RDV').setEmoji('📅').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`med_note::${id}`).setLabel('Note').setEmoji('📝').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`med_aptitude::${id}`).setLabel('Rédiger le test d\'aptitude').setEmoji('🧪').setStyle(ButtonStyle.Primary),
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

    // ── Rédiger le test d'aptitude (formulaire court → rapport généré) ──
    if (interaction.isButton?.() && cid.startsWith('med_aptitude::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const modal = new ModalBuilder().setCustomId(`med_apt_modal::${id}`).setTitle('🧪 Test d\'aptitude');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('patient').setLabel('Nom du patient (RP)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(gm?.displayName || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('datelieu').setLabel('Date & lieu d\'examen').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('ex : 6 Septembre 1879 — Rhodes')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('physique').setLabel('Taille · Poids · apparence').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('ex : 180 · 79 · cheveux rouges, yeux verts')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('resume').setLabel('Résumé de l\'examen (l\'essentiel)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(900).setPlaceholder('Forme physique, sens, santé, état mental, antécédents…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('verdict').setLabel('Verdict : APTE / AVEC RÉSERVES / INAPTE').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setValue('APTE')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_apt_modal::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const input = {
        patient: interaction.fields.getTextInputValue('patient').trim(),
        dateLieu: (interaction.fields.getTextInputValue('datelieu') || '').trim(),
        physique: (interaction.fields.getTextInputValue('physique') || '').trim(),
        resume: interaction.fields.getTextInputValue('resume').trim(),
        verdict: (interaction.fields.getTextInputValue('verdict') || 'APTE').trim(),
      };
      const r = await _genererTest(input);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const embed = _embedTest(input, r, gm);
      const forum = _ch(interaction.guild, MEDICAL_CHANNEL);
      let posted = false;
      if (forum?.type === 15 && forum.threads?.create) {
        const post = await forum.threads.create({ name: `🧪 ${input.patient} — ${input.verdict}`.slice(0, 100), message: { embeds: [embed] } }).catch(() => null);
        posted = !!post;
      } else if (forum?.send) { posted = !!(await forum.send({ embeds: [embed] }).catch(() => null)); }
      const db = loadDB(); const f = _fiche(db, id);
      f.statut = /inapte/i.test(input.verdict) ? 'inapte' : (/r[ée]serve/i.test(input.verdict) ? 'observation' : 'apte');
      f.testValide = true; f.testDate = Date.now();
      f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, `Test d'aptitude rédigé — ${input.verdict}`, f.majPar); saveDB(db);
      await interaction.editReply({ content: posted ? `✅ Test d'aptitude de **${input.patient}** rédigé et posté dans le forum. Statut → **${f.statut}**, test validé.` : '⚠️ Test généré mais impossible de le poster (vérifie les permissions du bot sur le forum).' }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ medical routeInteraction:', e.message); return true; }
}

module.exports = { installerPanel, routeInteraction, MEDICAL_CHANNEL, ROLE_MEDECIN };
