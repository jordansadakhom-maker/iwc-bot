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

// Brouillons du test d'aptitude entre l'étape 1 et l'étape 2 (clé : `${id}::${userId}`).
// Persistés EN BASE → ne périment jamais et survivent aux redémarrages du bot (plus de « examen expiré »).
const _aptDrafts = new Map();
function _aptSet(key, val) {
  _aptDrafts.set(key, val);
  try {
    const db = loadDB(); db.aptDrafts = db.aptDrafts || {}; db.aptDrafts[key] = val;
    const keys = Object.keys(db.aptDrafts); if (keys.length > 200) delete db.aptDrafts[keys[0]]; // garde-fou anti-fuite (pas d'expiration temporelle)
    saveDB(db);
  } catch {}
}
function _aptGet(key) {
  if (_aptDrafts.has(key)) return _aptDrafts.get(key);
  try { const db = loadDB(); return db.aptDrafts?.[key] || null; } catch { return null; }
}
function _aptDel(key) {
  _aptDrafts.delete(key);
  try { const db = loadDB(); if (db.aptDrafts && db.aptDrafts[key]) { delete db.aptDrafts[key]; saveDB(db); } } catch {}
}
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

// Tronque proprement toute valeur dynamique avant de la donner à un builder Discord
// (évite les RangeError « Invalid string length » de la validation discord.js).
function _clip(v, n) { return String(v == null ? '' : v).slice(0, n); }
function _idDmd() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _embedFiche(f, gm) {
  const st = STATUTS[f.statut] || STATUTS.non_teste;
  const e = new EmbedBuilder().setColor(st.couleur).setTitle('🩺 Suivi médical — confidentiel')
    .setDescription(gm ? `**${_clip(gm.displayName, 80)}** · <@${gm.id}>` : 'Membre')
    .addFields(
      { name: 'État', value: _clip(st.label, 100), inline: true },
      { name: 'Test d\'aptitude', value: f.testValide ? `✅ Validé${f.testDate ? ` (${_dateFR(f.testDate)})` : ''}` : '❌ Non validé', inline: true },
      { name: 'Prochain RDV', value: _clip((f.prochainRdv || '—') + (f.prochainRdvAt ? ' ⏰' : ''), 200), inline: true },
      { name: '📝 Notes', value: _clip(f.notes || '*Aucune note*', 1000), inline: false },
    );
  if (f.blessures?.length) e.addFields({ name: '🩹 Blessures / soins', value: _clip(f.blessures.slice(-5).reverse().map(b => `• \`${_clip(b.date, 40)}\` ${_clip(b.desc, 100)}${b.localisation ? ` (${_clip(b.localisation, 40)})` : ''}${b.gravite ? ` — **${_clip(b.gravite, 20)}**` : ''}`).join('\n'), 1024), inline: false });
  if (f.historique?.length) e.addFields({ name: '🕓 Historique', value: _clip(f.historique.slice(-8).reverse().map(h => `• \`${_clip(h.date, 40)}\` ${_clip(h.action, 120)}${h.par ? ` — *${_clip(h.par, 60)}*` : ''}`).join('\n'), 1024), inline: false });
  if (gm?.user) e.setThumbnail(gm.user.displayAvatarURL());
  e.setFooter({ text: _clip(f.majPar ? `Dernière mise à jour par ${f.majPar}` : 'Dossier médical confidentiel', 200) });
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
  const line = pairs.filter(([, v]) => v).map(([k, v]) => `**${k} :** ${String(v).slice(0, 200)}`).join(' · ');
  return ((line || '—') + (obs ? `\n*${String(obs).slice(0, 600)}*` : '')).slice(0, 1024);
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
      new ButtonBuilder().setCustomId(`med_blessure::${id}`).setLabel('Signaler une blessure / un soin').setEmoji('🩹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`med_aptitude::${id}`).setLabel('Rédiger le test d\'aptitude').setEmoji('🧪').setStyle(ButtonStyle.Primary),
    ),
  ];
}

// L'IA évalue une blessure / un événement médical et décide du statut d'aptitude
async function _evaluerBlessure(desc, localisation, contexteNotes) {
  if (!ANTHROPIC_API_KEY) return null;
  const prompt = `Tu es le médecin de la compagnie (RP western, ~1904). Un membre vient de subir une blessure ou un événement médical. Évalue son aptitude au service.

Blessure / événement : ${desc}
Localisation : ${localisation || '—'}
Notes médicales actuelles : ${contexteNotes || 'aucune'}

Décide du STATUT d'aptitude :
- "apte" : blessure bénigne, peut servir normalement.
- "observation" : blessure modérée, à surveiller, service limité.
- "inapte" : blessure grave (balle dans un organe/membre handicapant, fracture, hémorragie, coup de couteau profond…), ne peut pas servir tant qu'il n'est pas soigné/rétabli.

Réponds STRICTEMENT en JSON, rien d'autre :
{"statut":"apte|observation|inapte","gravite":"bénigne|modérée|grave","resume":"1 phrase clinique factuelle","recommandation":"soin/repos recommandé en 1 phrase"}`;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers: { 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 400, messages: [{ role: 'user', content: prompt }] }),
    });
    const data = await res.json();
    let txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    txt = txt.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/```\s*$/i, '').trim();
    const r = JSON.parse(txt);
    if (!['apte', 'observation', 'inapte'].includes(r.statut)) r.statut = 'observation';
    return r;
  } catch (e) { console.log('❌ medical evaluerBlessure:', e.message); return null; }
}

// ── Alerte quand un membre devient INAPTE ou EN OBSERVATION (prévient le médecin) ──
async function _alerteStatut(guild, id, f) {
  try {
    if (f.statut !== 'inapte' && f.statut !== 'observation') return;
    const ch = _ch(guild, MEDICAL_CHANNEL); if (!ch) return;
    const gm = await guild.members.fetch(id).catch(() => null);
    const st = STATUTS[f.statut] || STATUTS.non_teste;
    const e = new EmbedBuilder().setColor(st.couleur)
      .setTitle(`🚨 Alerte médicale — ${st.label}`)
      .setDescription(`${gm ? `**${_clip(gm.displayName, 80)}** (<@${id}>)` : `<@${id}>`} est désormais **${st.label.replace(/^\S+\s/, '')}**.`)
      .addFields(
        { name: "Test d'aptitude", value: f.testValide ? '✅ Validé' : '❌ Non validé', inline: true },
        { name: 'Mis à jour par', value: _clip(f.majPar || '—', 60), inline: true },
        ...(f.prochainRdv ? [{ name: 'Prochain RDV', value: _clip(f.prochainRdv, 100), inline: true }] : []),
      )
      .setFooter({ text: 'Iron Wolf Company · Suivi médical' }).setTimestamp();
    if (f.notes) e.addFields({ name: '📝 Notes', value: _clip(f.notes, 500), inline: false });
    const ping = `<@&${ROLE_MEDECIN}>`;
    if (ch.type === 15 && ch.threads?.create) {
      await ch.threads.create({ name: `🚨 ${st.label} — ${(gm?.displayName || id)}`.slice(0, 100), message: { content: ping, embeds: [e], allowedMentions: { roles: [ROLE_MEDECIN] } } }).catch(() => {});
    } else if (ch.send) {
      await ch.send({ content: ping, embeds: [e], allowedMentions: { roles: [ROLE_MEDECIN] } }).catch(() => {});
    }
  } catch {}
}
// Extrait une date/heure d'un texte libre de RDV (best-effort) → timestamp ms ou null
function _parseRdvDate(txt) {
  if (!txt) return null;
  const s = String(txt);
  const dm = s.match(/(\d{1,2})\s*[\/\-.]\s*(\d{1,2})(?:\s*[\/\-.]\s*(\d{2,4}))?/);
  if (!dm) return null;
  const jour = parseInt(dm[1], 10); const mois = parseInt(dm[2], 10) - 1;
  let annee = dm[3] ? parseInt(dm[3], 10) : new Date().getFullYear();
  if (annee < 100) annee += 2000;
  const hm = s.match(/(\d{1,2})\s*[h:]\s*(\d{0,2})/i);
  const hh = hm ? parseInt(hm[1], 10) : 12; const mn = (hm && hm[2]) ? parseInt(hm[2], 10) : 0;
  const d = new Date(annee, mois, jour, hh, mn, 0);
  return isNaN(d.getTime()) ? null : d.getTime();
}
// Rappel MP au médecin ~1h avant un RDV médical dont la date est connue
async function checkRappelsMedicaux(guild) {
  try {
    const db = loadDB(); const sm = db.suiviMedical || {}; let changed = false;
    const role = guild.roles.cache.get(ROLE_MEDECIN);
    const docs = role ? [...role.members.values()].filter(m => !m.user.bot) : [];
    for (const id of Object.keys(sm)) {
      const f = sm[id];
      if (!f.prochainRdvAt) continue;
      const mins = Math.floor((f.prochainRdvAt - Date.now()) / 60000);
      if (mins > 2 && mins <= 60 && !f.sentRappelMed) {
        const gm = await guild.members.fetch(id).catch(() => null);
        const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Rappel — RDV médical dans 1 heure')
          .setDescription(`Rendez-vous avec ${gm ? `**${gm.displayName}**` : `<@${id}>`}\n📅 ${_clip(f.prochainRdv || '—', 100)}`)
          .setFooter({ text: 'Iron Wolf Company · Secrétariat médical' }).setTimestamp();
        for (const doc of docs) await doc.send({ embeds: [e] }).catch(() => {});
        f.sentRappelMed = true; changed = true;
      }
      if (mins < -120) { f.sentRappelMed = false; f.prochainRdvAt = null; changed = true; }
    }
    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkRappelsMedicaux:', e.message); }
}

async function installerPanel(guild) {
  const ch = _ch(guild, MEDICAL_CHANNEL);
  if (!ch) return;
  const moi = guild.members.me?.id;
  const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Suivi médical & aptitude')
    .setDescription([
      'Dossier médical **confidentiel** de chaque membre.',
      '',
      '• **Ouvrir un dossier** — consulter/éditer le suivi d\'un membre *(médecin & Direction)*.',
      '• **Vue d\'ensemble** — la liste des statuts *(médecin & Direction)*.',
      '• **📨 Demandes en attente** — les demandes de RDV à traiter *(médecin & Direction)*.',
      '• **🆘 Demander un RDV** — besoin de soins ? Décris ton motif, le médecin te recontacte *(tout le monde)*.',
    ].join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('med_select').setLabel('Ouvrir un dossier').setEmoji('🩺').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('med_liste').setLabel('Vue d\'ensemble').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('med_demandes').setLabel('Demandes en attente').setEmoji('📨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('med_demande::open').setLabel('Demander un RDV').setEmoji('🆘').setStyle(ButtonStyle.Success),
  );
  // Forum (type 15) → post épinglé ; sinon salon classique → message. Mise à jour EN PLACE si déjà présent.
  if (ch.type === 15 && ch.threads?.create) {
    const act = await ch.threads.fetchActive().catch(() => null);
    const existing = act?.threads ? [...act.threads.values()].find(t => (t.name || '').includes('SUIVI MÉDICAL')) : null;
    if (existing) { const st = await existing.fetchStarterMessage().catch(() => null); if (st) await st.edit({ embeds: [e], components: [row] }).catch(() => {}); return; }
    const post = await ch.threads.create({ name: '🩺 SUIVI MÉDICAL', message: { embeds: [e], components: [row] } }).catch(() => null);
    if (post?.pin) await post.pin().catch(() => {});
    return;
  }
  if (!ch.send) return;
  const existing = await ch.messages.fetch({ limit: 30 }).catch(() => null);
  const panel = existing ? [...existing.values()].find(m => m.author?.id === moi && m.components?.length && (m.embeds?.[0]?.title || '').includes('Suivi médical')) : null;
  if (panel) { await panel.edit({ embeds: [e], components: [row] }).catch(() => {}); return; }
  await ch.send({ embeds: [e], components: [row] }).catch(() => {});
}

async function _afficherFiche(interaction, id, viaUpdate) {
  const gm = await interaction.guild.members.fetch(id).catch(() => null);
  const db = loadDB(); const f = _fiche(db, id); saveDB(db);
  let payload;
  try { payload = { content: `Dossier de <@${id}> :`, embeds: [_embedFiche(f, gm)], components: _actions(id), flags: MessageFlags.Ephemeral }; }
  catch (e) { console.log('❌ medical _embedFiche:', e.message); payload = { content: `🩺 Dossier de <@${id}> — État : **${_clip((STATUTS[f.statut] || STATUTS.non_teste).label, 60)}**.`, components: _actions(id), flags: MessageFlags.Ephemeral }; }
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
      // Persiste la demande (consultable via « Demandes en attente » même si la notif de salon disparaît).
      try { const db = loadDB(); if (!Array.isArray(db.demandesRdvMed)) db.demandesRdvMed = []; db.demandesRdvMed.push({ id: _idDmd(), patientId: interaction.user.id, nomRP, motif: motif.slice(0, 1024), dispos, at: Date.now(), statut: 'en_attente' }); if (db.demandesRdvMed.length > 100) db.demandesRdvMed = db.demandesRdvMed.slice(-100); saveDB(db); } catch {}
      // MP à chaque médecin : un message privé ne disparaît pas quand on ouvre une notif de salon.
      try {
        const roleMed = interaction.guild.roles.cache.get(ROLE_MEDECIN);
        const docs = roleMed ? [...roleMed.members.values()].filter(m => !m.user.bot) : [];
        for (const doc of docs) await doc.send({ content: '🩺 **Nouvelle demande de RDV médical à traiter** — tu peux aussi la retrouver via **« Demandes en attente »** sur le panneau médical.', embeds: [embed] }).catch(() => {});
      } catch {}
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
      const dbM = loadDB();
      const statutEmoji = { actif: '✅', absent: '⚠️', inactif: '💤', visiteur: '👁️' };
      const statutTxt = { actif: 'Présent', absent: 'Absent', inactif: 'Inactif', visiteur: 'Visiteur' };
      const options = membres.slice(0, 25).map(m => {
        const mm = (dbM.members && dbM.members[m.id]) || {};
        return { label: m.displayName.slice(0, 100), value: m.id, description: (statutTxt[mm.status] || 'Présent'), emoji: statutEmoji[mm.status] || '✅' };
      });
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
      // Regroupé par statut (inapte/observation d'abord = ce qui demande de l'attention)
      const ordre = ['inapte', 'observation', 'apte', 'non_teste'];
      const ligne = id => { const f = sm[id]; return `<@${id}>${f.testValide ? ' · 🧪✅' : ' · 🧪✗'}${f.prochainRdv ? ` · 📅 ${_clip(f.prochainRdv, 40)}${f.prochainRdvAt ? '⏰' : ''}` : ''}`; };
      const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('📋 Suivi médical — vue d\'ensemble');
      const cnt = {};
      for (const st of ordre) {
        const grp = ids.filter(id => (sm[id].statut || 'non_teste') === st);
        cnt[st] = grp.length;
        if (grp.length) e.addFields({ name: `${(STATUTS[st] || STATUTS.non_teste).label} (${grp.length})`, value: _clip(grp.slice(0, 25).map(ligne).join('\n'), 1024), inline: false });
      }
      e.setDescription(`👥 **${ids.length}** dossier(s) · ✅ ${cnt.apte || 0} apte(s) · ⚠️ ${cnt.observation || 0} en observation · ❌ ${cnt.inapte || 0} inapte(s)`);
      e.setFooter({ text: '🧪 = test d\'aptitude · 📅 = prochain RDV · ⏰ = rappel auto activé' });
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
      await _afficherFiche(interaction, id, true); // accuse réception du bouton d'abord (évite « interaction a échoué »)
      await _alerteStatut(interaction.guild, id, f); // alerte si inapte / observation
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
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rdv').setLabel('Date / créneau du RDV').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setValue(_clip(f.prochainRdv || '', 80)).setPlaceholder('ex : 28/06 14h — cabinet de Blackwater')));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_rdv_modal::')) {
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const v = (interaction.fields.getTextInputValue('rdv') || '').trim();
      f.prochainRdv = v || null; f.prochainRdvAt = v ? _parseRdvDate(v) : null; f.sentRappelMed = false;
      f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, v ? `RDV fixé : ${v}${f.prochainRdvAt ? ' (rappel auto activé)' : ''}` : 'RDV retiré', f.majPar); saveDB(db);
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
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('note').setLabel('Notes (remplace les notes actuelles)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(1000).setValue(_clip(f.notes || '', 1000))));
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

    // ── Signaler une blessure / un soin → l'IA met le dossier à jour (statut auto) ──
    if (interaction.isButton?.() && cid.startsWith('med_blessure::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const modal = new ModalBuilder().setCustomId(`med_blessure_modal::${id}`).setTitle('🩹 Blessure / événement médical');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Que s\'est-il passé ?').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('ex : a pris une balle dans l\'épaule · coup de couteau au bras · jambe cassée…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('localisation').setLabel('Localisation (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('ex : épaule droite, abdomen…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_blessure_modal::')) {
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const desc = (interaction.fields.getTextInputValue('desc') || '').trim();
      const localisation = (interaction.fields.getTextInputValue('localisation') || '').trim();
      const par = interaction.member?.displayName || interaction.user.username;
      // L'IA évalue la gravité et décide du statut d'aptitude
      const evalRes = await _evaluerBlessure(desc, localisation, f.notes);
      if (!f.blessures) f.blessures = [];
      f.blessures.push({ date: _dateFR(Date.now()), desc, localisation, gravite: evalRes?.gravite || null, par });
      if (f.blessures.length > 20) f.blessures = f.blessures.slice(-20);
      // Mise à jour automatique du statut (l'IA fait la vérification)
      const ancien = f.statut;
      if (evalRes?.statut) f.statut = evalRes.statut;
      f.majPar = par; f.majAt = Date.now();
      const noteLigne = `🩹 ${_dateFR(Date.now())} — ${desc}${localisation ? ` (${localisation})` : ''}${evalRes ? ` → ${evalRes.gravite}, ${evalRes.recommandation}` : ""}`;
      f.notes = ((f.notes ? f.notes + '\n' : '') + noteLigne).slice(0, 1000);
      _log(f, `Blessure signalée${evalRes ? ` → ${STATUTS[f.statut]?.label || f.statut}` : ''}`, par);
      saveDB(db);
      if (evalRes?.statut && evalRes.statut !== ancien) await _alerteStatut(interaction.guild, id, f).catch(() => {});
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const verdict = evalRes
        ? `🧠 **Évaluation automatique :** blessure **${evalRes.gravite}**.\n→ Statut mis à jour : **${STATUTS[f.statut]?.label || f.statut}**\n💊 *${evalRes.recommandation}*`
        : '⚠️ Blessure enregistrée (l\'évaluation IA est indisponible — ajuste le statut à la main si besoin).';
      await interaction.editReply({ content: verdict, embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
      return true;
    }

    // ── Rédiger le test d'aptitude (formulaire court → rapport généré) ──
    if (interaction.isButton?.() && cid.startsWith('med_aptitude::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const modal = new ModalBuilder().setCustomId(`med_apt_modal::${id}`).setTitle('🧪 Test d\'aptitude (1/2)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('patient').setLabel('Nom du patient (RP)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(_clip(gm?.displayName || '', 80))),
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
      const id = cid.split('::')[1];
      _aptSet(`${id}::${interaction.user.id}`, {
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
      // Plus de péremption : on ouvre toujours l'étape 2 (le brouillon, persisté en base, est relu à la soumission).
      const modal = new ModalBuilder().setCustomId(`med_apt_modal2::${id}`).setTitle('🧪 Test d\'aptitude (2/2)');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('corps').setLabel(_clip('Physique (force, endurance, coordination)', 45)).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(_clip(APT_DEF.corps, 300))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sensoriel').setLabel(_clip('Sensoriel (vue, ouïe, odorat, réactivité)', 45)).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(_clip(APT_DEF.sensoriel, 300))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('sante').setLabel(_clip('Santé (constitution, respiration, pouls)', 45)).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(_clip(APT_DEF.sante, 300))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('habitudes').setLabel(_clip('Habitudes, antécédents, allergies', 45)).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(_clip(APT_DEF.habitudes, 300))),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('intellect').setLabel(_clip('Intellect (lecture, écriture, calcul)', 45)).setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setValue(_clip(APT_DEF.intellect, 300))),
      );
      try { await interaction.showModal(modal); }
      catch (e) { console.log('❌ medical med_apt_next showModal:', e.message); await interaction.reply({ content: '⚠️ Impossible d\'ouvrir l\'étape 2. Réessaie le test.', flags: MessageFlags.Ephemeral }).catch(() => {}); }
      return true;
    }
    // Étape 2 soumise → génération + publication du test
    if (interaction.isModalSubmit?.() && cid.startsWith('med_apt_modal2::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const draft = _aptGet(`${id}::${interaction.user.id}`) || {};
      _aptDel(`${id}::${interaction.user.id}`);
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
      const forum = _ch(interaction.guild, MEDICAL_CHANNEL);
      let posted = false;
      let payload;
      try { payload = { embeds: [_embedTest(input, r, gm)] }; }
      catch (e) { console.log('❌ medical _embedTest:', e.message); payload = { content: `🩺 **Test d'aptitude — ${String(input.patient).slice(0,80)}**\nVerdict : **${String(input.verdict).slice(0,40)}**\n\n${resume}`.slice(0, 1900) }; }
      if (forum?.type === 15 && forum.threads?.create) {
        const post = await forum.threads.create({ name: `🧪 ${input.patient} — ${input.verdict}`.slice(0, 100), message: payload }).catch(() => null);
        posted = !!post;
      } else if (forum?.send) { posted = !!(await forum.send(payload).catch(() => null)); }
      const db = loadDB(); const f = _fiche(db, id);
      f.statut = /inapte/i.test(input.verdict) ? 'inapte' : (/r[ée]serve/i.test(input.verdict) ? 'observation' : 'apte');
      f.testValide = true; f.testDate = Date.now();
      f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, `Test d'aptitude rédigé — ${input.verdict}`, f.majPar); saveDB(db);
      await _alerteStatut(interaction.guild, id, f); // alerte si le verdict rend inapte / en observation
      await interaction.editReply({ content: posted ? `✅ Test d'aptitude de **${input.patient}** rédigé et posté dans le forum. Statut → **${f.statut}**, test validé.` : '⚠️ Test généré mais impossible de le poster (vérifie les permissions du bot sur le forum).' }).catch(() => {});
      return true;
    }

    // ── Demandes de RDV en attente (médecin / Direction) ──
    if (interaction.isButton?.() && cid === 'med_demandes') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB(); const list = (db.demandesRdvMed || []).filter(d => d.statut === 'en_attente').slice().reverse();
      if (!list.length) { await interaction.reply({ content: '📭 Aucune demande de RDV en attente.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('📨 Demandes de RDV en attente (' + list.length + ')')
        .setDescription(list.slice(0, 15).map(d => `• **${_clip(d.nomRP || 'Patient', 60)}** (<@${d.patientId}>) — *${_clip(d.motif, 80)}*  ·  ${_dateFR(d.at)}`).join('\n').slice(0, 4000))
        .setFooter({ text: 'Choisis une demande pour la traiter.' });
      const menu = new StringSelectMenuBuilder().setCustomId('med_dmd_sel').setPlaceholder('Traiter une demande…')
        .addOptions(list.slice(0, 25).map(d => ({ label: _clip(d.nomRP || 'Patient', 100) || 'Patient', description: _clip(d.motif, 100) || '—', value: d.id })));
      await interaction.reply({ embeds: [e], components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Sélection d'une demande → détail + actions
    if (interaction.isStringSelectMenu?.() && cid === 'med_dmd_sel') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const did = interaction.values?.[0];
      const db = loadDB(); const d = (db.demandesRdvMed || []).find(x => x.id === did);
      if (!d) { await interaction.reply({ content: '⚠️ Demande introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Demande de RDV — ' + _clip(d.nomRP || 'Patient', 60))
        .addFields(
          { name: '👤 Patient', value: `${_clip(d.nomRP || '—', 80)} (<@${d.patientId}>)`, inline: false },
          { name: '📝 Motif', value: _clip(d.motif || '—', 1024), inline: false },
          { name: '🕐 Disponibilités', value: _clip(d.dispos || '—', 200), inline: true },
          { name: '📅 Reçue le', value: _dateFR(d.at), inline: true },
        );
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('med_dmd_rep::' + d.id).setLabel('Répondre au patient (MP)').setEmoji('✉️').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('med_dmd_ok::' + d.id).setLabel('Marquer traitée').setEmoji('✅').setStyle(ButtonStyle.Success),
      );
      await interaction.reply({ embeds: [e], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Marquer une demande comme traitée
    if (interaction.isButton?.() && cid.startsWith('med_dmd_ok::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const did = cid.split('::')[1];
      const db = loadDB(); const d = (db.demandesRdvMed || []).find(x => x.id === did);
      if (d) { d.statut = 'traitee'; d.traiteePar = interaction.user.id; d.traiteeAt = Date.now(); saveDB(db); }
      await interaction.update({ content: d ? '✅ Demande marquée comme traitée.' : '⚠️ Demande introuvable.', embeds: [], components: [] }).catch(() => {});
      return true;
    }
    // Répondre au patient (MP) — ouvre un modal
    if (interaction.isButton?.() && cid.startsWith('med_dmd_rep::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const did = cid.split('::')[1];
      const modal = new ModalBuilder().setCustomId('med_dmd_repm::' + did).setTitle('✉️ Répondre au patient');
      modal.addComponents(new ActionRowBuilder().addComponents(
        new TextInputBuilder().setCustomId('msg').setLabel('Message envoyé au patient (en MP)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1000).setPlaceholder('Ex : RDV fixé demain 21h au cabinet de Valentine.')
      ));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    // Envoi de la réponse en MP au patient + demande marquée traitée
    if (interaction.isModalSubmit?.() && cid.startsWith('med_dmd_repm::')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const did = cid.split('::')[1];
      const db = loadDB(); const d = (db.demandesRdvMed || []).find(x => x.id === did);
      if (!d) { await interaction.editReply({ content: '⚠️ Demande introuvable.' }).catch(() => {}); return true; }
      const msg = (interaction.fields.getTextInputValue('msg') || '').trim();
      let envoye = false;
      try { const u = await interaction.client.users.fetch(d.patientId); await u.send(['🩺 **Cabinet médical de l\'Iron Wolf Company — réponse à ta demande de RDV**', '', msg, '', '— *Le médecin*'].join('\n')); envoye = true; } catch {}
      d.statut = 'traitee'; d.traiteePar = interaction.user.id; d.traiteeAt = Date.now(); d.reponse = msg.slice(0, 1000); saveDB(db);
      await interaction.editReply({ content: envoye ? '✅ Réponse envoyée au patient en MP — demande marquée traitée.' : '⚠️ Le patient a sans doute fermé ses MP : réponse non délivrée. Demande marquée traitée — recontacte-le en jeu.' }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ medical routeInteraction [', (interaction.customId || interaction.commandName || '?'), ']:', e.message, '\n', (e.stack || '').split('\n').slice(0, 4).join('\n')); return true; }
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

module.exports = { installerPanel, installerExemple, installerPanelDemande, routeInteraction, checkRappelsMedicaux, MEDICAL_CHANNEL, ROLE_MEDECIN };
