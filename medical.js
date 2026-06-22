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
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;
const ROLE_CONFRERIE = '1508898841993281658'; // pôle illégal — le médecin ne suit que la Confrérie

// ⚠️ À DÉFINIR
const MEDICAL_CHANNEL = '1518574479830155355'; // salon privé où vit le panneau
const ROLE_MEDECIN = '1518574549875163136';       // rôle du médecin

const DIRECTION = ['Fondateur', 'Directeur', 'Conseil', 'Concepteur', 'Fléau', 'fleau', 'Opérateur', 'Operateur', 'Officier'];
function peutGerer(member) { try { return !!member?.roles?.cache?.some(r => r.id === ROLE_MEDECIN || DIRECTION.some(n => r.name.includes(n))); } catch { return false; } }

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }
function _dateFR(ts) { try { return new Date(ts).toLocaleDateString('fr-FR'); } catch { return ''; } }

// Brouillons du test d'aptitude entre l'étape 1 et l'étape 2 (clé : `${id}::${userId}`)
const _aptDrafts = new Map();
function _aptCleanup() { const now = Date.now(); for (const [k, v] of _aptDrafts) if (now - (v.at || 0) > 3600000) _aptDrafts.delete(k); }
// Valeurs par défaut (patient en bonne santé) — le médecin n'a qu'à ajuster ce qui cloche.
const APT_DEF = {
  apparence: "Posture droite · allure soignée · esprit clair et présent",
  corps:     "Force bonne · endurance bonne · coordination normale",
  sensoriel: "Vue normale · ouïe normale · odorat normal · réactivité vive",
  sante:     "Constitution robuste · pas de fatigue anormale · respiration normale · pouls régulier",
  habitudes: "Régime correct · consommation modérée · aucun antécédent ni allergie connus",
  intellect: "Lecture bonne · écriture bonne · calcul bon · compréhension bonne",
};

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
  const prompt = `Tu es le Dr. June McCall, médecin praticien agréé (RP western, ~1904, État du Texas — Bureau Médical de Blackwater). Tu rédiges un TEST D'APTITUDE MÉDICALE complet et cohérent.

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
      '__**État du Texas — Bureau Médical de Blackwater**__',
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
      new ButtonBuilder().setCustomId(`med_rdv::${id}`).setLabel('Prendre RDV avec le médecin').setEmoji('📅').setStyle(ButtonStyle.Secondary),
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

    // ── Demande de RDV médical (PUBLIC : tout membre peut demander) ──
    // Trace + discussion interne dans le salon médical privé ; le patient n'est
    // PAS ajouté au fil → il ne peut ni voir ni répondre. Accusé de réception en MP.
    if (interaction.isButton?.() && cid === 'med_demande::open') {
      const modal = new ModalBuilder().setCustomId('med_demande_modal').setTitle('🩺 Demande de RDV médical');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nomrp').setLabel('Nom de ton personnage').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('Motif de la consultation').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(800).setPlaceholder("Décris brièvement ce qui t'amène...")),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dispos').setLabel('Tes disponibilités').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('ex : en soirée la semaine, week-end...')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'med_demande_modal') {
      await interaction.reply({ content: '🩺 Ta demande de rendez-vous médical a bien été transmise au médecin. Il te recontactera en jeu.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const nomRP  = (interaction.fields.getTextInputValue('nomrp')  || '').trim() || interaction.member?.displayName || interaction.user.username;
      const motif  = (interaction.fields.getTextInputValue('motif')  || '').trim() || '—';
      const dispos = (interaction.fields.getTextInputValue('dispos') || '').trim() || '—';
      const embed = new EmbedBuilder()
        .setColor(0x2ECC71)
        .setTitle('🩺 Nouvelle demande de RDV médical')
        .addFields(
          { name: '👤 Patient', value: `${nomRP} (<@${interaction.user.id}>)`, inline: false },
          { name: '📝 Motif', value: motif.slice(0, 1024), inline: false },
          { name: '🕐 Disponibilités', value: dispos, inline: true },
          { name: '📅 Reçue le', value: _dateFR(Date.now()), inline: true },
        )
        .setFooter({ text: "Discussion interne équipe médicale — le patient n'a pas accès à ce fil." })
        .setTimestamp();
      try {
        const forum = _ch(interaction.guild, MEDICAL_CHANNEL);
        const titre = `🩺 Demande RDV — ${nomRP}`.slice(0, 100);
        const contenu = `<@&${ROLE_MEDECIN}> — nouvelle demande de RDV médical à traiter.`;
        if (forum?.type === 15 && forum.threads?.create) {
          await forum.threads.create({ name: titre, message: { content: contenu, embeds: [embed], allowedMentions: { roles: [ROLE_MEDECIN] } } }).catch(() => {});
        } else if (forum?.send) {
          await forum.send({ content: contenu, embeds: [embed], allowedMentions: { roles: [ROLE_MEDECIN] } }).catch(() => {});
        }
      } catch (e) { console.log('❌ med_demande fil:', e.message); }
      // Accusé de réception en MP (le patient ne peut pas répondre)
      try {
        const u = await interaction.client.users.fetch(interaction.user.id);
        await u.send([
          '🩺 **Iron Wolf Company — Demande de rendez-vous médical**',
          '',
          'Bonjour, ta demande de rendez-vous avec le médecin a bien été **transmise**.',
          `📝 Motif : ${motif.slice(0, 500)}`,
          `🕐 Disponibilités : ${dispos}`,
          '',
          "Le médecin te recontactera **en jeu**. (Message automatique — inutile d'y répondre.)",
          "— *Cabinet médical de l'Iron Wolf Company*",
        ].join('\n')).catch(() => {});
      } catch {}
      return true;
    }

    // Ouvrir le sélecteur de membre (Confrérie uniquement)
    if (interaction.isButton?.() && cid === 'med_select') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Dossier confidentiel — réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await interaction.guild.members.fetch().catch(() => {});
      const role = interaction.guild.roles.cache.get(ROLE_CONFRERIE);
      const membres = role ? [...role.members.values()].filter(m => !m.user.bot) : [];
      if (!membres.length) { await interaction.editReply({ content: '⚠️ Aucun membre de la Confrérie trouvé (vérifie le rôle).' }).catch(() => {}); return true; }
      const options = membres.slice(0, 25).map(m => ({ label: m.displayName.slice(0, 100), value: m.id }));
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('med_pick').setPlaceholder('Choisis un membre de la Confrérie').addOptions(options));
      await interaction.editReply({ content: `🩺 Dossier médical — choisis un membre de la **Confrérie**${membres.length > 25 ? ' *(25 premiers affichés)*' : ''} :`, components: [row] }).catch(() => {});
      return true;
    }

    // Membre sélectionné
    if (interaction.isStringSelectMenu?.() && cid === 'med_pick') {
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
      // On prévient LE MÉDECIN (c'est nous qui prenons rendez-vous avec elle)
      let notif = '';
      if (v) {
        const role = interaction.guild.roles.cache.get(ROLE_MEDECIN);
        const docs = role ? [...role.members.values()].filter(m => !m.user.bot) : [];
        const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Rendez-vous médical demandé')
          .setDescription([`La compagnie souhaite te voir${gm ? ` concernant **${gm.displayName}**` : ''}.`, '', `**📅 Quand :** ${v}`, '', `*Fixé par ${f.majPar}.*`].join('\n')).setFooter({ text: 'Iron Wolf Company' }).setTimestamp();
        let sent = 0; for (const doc of docs) { const dm = await doc.send({ embeds: [e] }).catch(() => null); if (dm) sent++; }
        notif = sent ? ` Le médecin a été **prévenu en MP**.` : ' *(Aucun médecin trouvé à prévenir, ou MP fermés.)*';
      }
      await interaction.editReply({ content: `✅ RDV noté.${notif}`, embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
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
      const modal = new ModalBuilder().setCustomId(`med_apt_modal::${id}`).setTitle('🧪 Test d\'aptitude (1/2)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('patient').setLabel('Nom du patient (RP)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(gm?.displayName || '')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('datelieu').setLabel('Date & lieu d\'examen').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('ex : 6 Septembre 1904 — Blackwater')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('physique').setLabel('Taille · Poids · Signes particuliers').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('ex : 180 cm · 79 kg · cheveux roux, yeux verts')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('apparence').setLabel('Apparence & état général').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(APT_DEF.apparence)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('verdict').setLabel('Verdict : APTE / AVEC RÉSERVES / INAPTE').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(40).setValue('APTE')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    // Étape 1 → on enregistre, puis on propose l'étape 2 (examen détaillé)
    if (interaction.isModalSubmit?.() && cid.startsWith('med_apt_modal::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      _aptCleanup();
      const id = cid.split('::')[1];
      _aptDrafts.set(`${id}::${interaction.user.id}`, {
        patient: interaction.fields.getTextInputValue('patient').trim(),
        dateLieu: (interaction.fields.getTextInputValue('datelieu') || '').trim(),
        physique: (interaction.fields.getTextInputValue('physique') || '').trim(),
        apparence: (interaction.fields.getTextInputValue('apparence') || '').trim() || APT_DEF.apparence,
        verdict: (interaction.fields.getTextInputValue('verdict') || 'APTE').trim(),
        at: Date.now(),
      });
      const row = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`med_apt_next::${id}`).setLabel('Étape 2 — examen détaillé').setEmoji('➡️').setStyle(ButtonStyle.Primary));
      await interaction.reply({ content: '🧪 **Étape 1 enregistrée.** Clique pour remplir l\'examen détaillé (physique, sens, santé, habitudes, intellect). Tout est pré-rempli — n\'ajuste que ce qui cloche.', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Étape 2 → ouvre le second formulaire (5 cases détaillées, pré-remplies)
    if (interaction.isButton?.() && cid.startsWith('med_apt_next::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const draft = _aptDrafts.get(`${id}::${interaction.user.id}`);
      if (!draft) { await interaction.reply({ content: '⌛ Examen expiré — relance le test (bouton 🧪).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId(`med_apt_modal2::${id}`).setTitle('🧪 Test d\'aptitude (2/2)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('corps').setLabel('Physique (force · endurance · coordination)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(APT_DEF.corps)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sensoriel').setLabel('Sensoriel (vue · ouïe · odorat · réactivité)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(APT_DEF.sensoriel)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sante').setLabel('Santé (constitution · respiration · pouls)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(APT_DEF.sante)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('habitudes').setLabel('Habitudes · antécédents · maladies · allergies').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(APT_DEF.habitudes)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('intellect').setLabel('Intellect (lecture · écriture · calcul)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(APT_DEF.intellect)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    // Étape 2 soumise → génération + publication du test
    if (interaction.isModalSubmit?.() && cid.startsWith('med_apt_modal2::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const draft = _aptDrafts.get(`${id}::${interaction.user.id}`) || {};
      _aptDrafts.delete(`${id}::${interaction.user.id}`);
      const g = (k, def) => (interaction.fields.getTextInputValue(k) || '').trim() || def;
      const resume = [
        `Apparence & état général : ${draft.apparence || APT_DEF.apparence}`,
        `Physique : ${g('corps', APT_DEF.corps)}`,
        `Sensoriel : ${g('sensoriel', APT_DEF.sensoriel)}`,
        `Santé : ${g('sante', APT_DEF.sante)}`,
        `Habitudes & antécédents : ${g('habitudes', APT_DEF.habitudes)}`,
        `Intellect : ${g('intellect', APT_DEF.intellect)}`,
      ].join('\n');
      const input = { patient: draft.patient || (await interaction.guild.members.fetch(id).catch(() => null))?.displayName || 'Patient', dateLieu: draft.dateLieu || '', physique: draft.physique || '', resume, verdict: draft.verdict || 'APTE' };
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

// Post d'exemple (idempotent) — montre à quoi ressemble un test d'aptitude
async function installerExemple(guild) {
  const ch = _ch(guild, MEDICAL_CHANNEL);
  if (!ch || ch.type !== 15 || !ch.threads?.create) return;
  const act = await ch.threads.fetchActive().catch(() => null);
  if (act?.threads && [...act.threads.values()].some(t => (t.name || '').includes('EXEMPLE'))) return;
  const input = { patient: 'Sidjay Kelton (EXEMPLE)', dateLieu: '6 Septembre 1904 — Blackwater', physique: '180 · 79 · cheveux rouges, yeux verts', verdict: 'APTE' };
  const r = {
    apparence: { posture: 'Droite', aspect: 'Bonne forme, aucun signe distinctif', obs: 'Patient en bonne forme générale.' },
    physique: { force: 'Bonne', endurance: 'Moyenne', coordination: 'Normale', obs: 'Bonnes capacités physiques, bons réflexes.' },
    sensoriel: { vue: 'Normale', ouie: 'Normale', odorat: 'Normal', toucher: 'Normal', reactivite: 'Vive', obs: 'Sens normaux, bonne réaction aux tests.' },
    sante: { constitution: 'Robuste', fatigue: 'Non', respiration: 'Normale', pouls: 'Régulier', obs: 'Bon état de santé général.' },
    habitudes: { regime: 'Repas équilibré, bon sommeil', consommation: 'Aucune dépendance', antecedents: 'RAS', obs: 'Habitudes de vie saines.' },
    maladies: { actuelles: 'Aucune', passees: 'Pneumonie (guérie)', allergies: 'Aucune', traitements: 'Aucun', obs: 'RAS.' },
    intellect: { lecture: 'Bonne', ecriture: 'Bonne', calcul: 'Bon', comprehension: 'Bon', obs: 'Facultés intellectuelles bonnes, raisonne et réagit vite.' },
    conclusion: 'M. Kelton est apte à exercer les fonctions qui lui seront demandées.',
  };
  const embed = _embedTest(input, r, null); embed.setColor(0x999999);
  const post = await ch.threads.create({ name: '📋 EXEMPLE — Test d\'aptitude (ne pas supprimer)', message: { content: '*Exemple : voici à quoi ressemble un test d\'aptitude. Les vrais sont rédigés depuis la fiche d\'un membre (bouton 🧪).*', embeds: [embed] } }).catch(() => null);
  if (post?.pin) await post.pin().catch(() => {});
}

// Panneau public « Demander un RDV médical » (à installer dans un salon accessible aux membres)
async function installerPanelDemande(channel) {
  if (!channel?.send) return false;
  const e = new EmbedBuilder()
    .setColor(0x2ECC71)
    .setTitle('🩺 Cabinet médical — Iron Wolf Company')
    .setDescription([
      '*Besoin de voir le médecin ?*',
      '',
      'Clique sur le bouton ci-dessous pour **demander un rendez-vous médical**.',
      'Indique le motif et tes disponibilités — le médecin sera prévenu et te recontactera **en jeu**.',
      '',
      '*Ta demande est confidentielle.*',
    ].join('\n'))
    .setFooter({ text: 'Suivi médical · IWC' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('med_demande::open').setLabel('Demander un RDV médical').setEmoji('🩺').setStyle(ButtonStyle.Success),
  );
  await channel.send({ embeds: [e], components: [row] }).catch(() => {});
  return true;
}

module.exports = { installerPanel, installerExemple, installerPanelDemande, routeInteraction, MEDICAL_CHANNEL, ROLE_MEDECIN };
