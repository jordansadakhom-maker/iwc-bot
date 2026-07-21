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
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, UserSelectMenuBuilder, StringSelectMenuBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || null;
const ROLE_CONFRERIE = '1508898841993281658'; // pôle illégal — le médecin ne suit que la Confrérie

// ⚠️ À DÉFINIR
const MEDICAL_CHANNEL = '1518574479830155355'; // salon privé où vit le panneau
const ROLE_MEDECIN = '1518574549875163136';       // rôle du médecin

const DIRECTION = ['Fondateur', 'Directeur', 'Conseil', 'Concepteur', 'Fléau', 'fleau', 'Opérateur', 'Operateur', 'Officier'];
function peutGerer(member) { if (global.aAccesTotal?.(member)) return true; try { return !!member?.roles?.cache?.some(r => r.id === ROLE_MEDECIN || DIRECTION.some(n => r.name.includes(n))); } catch { return false; } }

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

// Emoji d'état pour le TITRE du fil (se met à jour à chaque changement de statut →
// le titre ne peut jamais contredire la fiche). Le tag [id] rend le fil unique/retrouvable.
const _EMOJI_STATUT = { apte: '✅', observation: '⚠️', inapte: '❌', non_teste: '🩺' };
function _nomFil(gm, f, id) {
  const em = _EMOJI_STATUT[f?.statut] || '🩺';
  const nom = (gm?.displayName || f?.nomRP || String(id)).trim();
  return `${em} ${nom} [${id}]`.slice(0, 100);
}

// Durée de convalescence estimée (jours) selon la gravité de la blessure.
function _convalescenceJours(gravite) {
  const g = String(gravite || '').toLowerCase();
  if (g.includes('grave')) return 8;
  if (g.includes('mod')) return 4;
  if (g.includes('bén') || g.includes('ben')) return 2;
  return 3;
}

// Remèdes d'époque (RDR2 ~1904) — pré-remplissage d'ordonnance en un clic.
const REMEDES = {
  laudanum:      { label: 'Laudanum',              emoji: '🧪', desc: 'Douleur, anxiété, insomnie',   medicaments: "Laudanum (teinture d'opium)", posologie: "10 gouttes dans un verre d'eau, le soir", duree: '5 jours',  conseils: "Ne jamais dépasser la dose. Repos. Éviter l'alcool pendant le traitement." },
  tonique:       { label: 'Tonique de santé',      emoji: '🍾', desc: 'Fatigue, convalescence',       medicaments: 'Tonique de santé',            posologie: 'Une rasade le matin et le midi',           duree: '7 jours',  conseils: "Bien s'alimenter et reprendre des forces progressivement." },
  onguent:       { label: 'Onguent cicatrisant',   emoji: '🩹', desc: 'Plaies, coupures',             medicaments: 'Onguent cicatrisant',         posologie: 'Appliquer sur la plaie propre, matin et soir', duree: "Jusqu'à cicatrisation", conseils: 'Nettoyer et désinfecter la plaie avant chaque application. Changer le pansement.' },
  quinine:       { label: 'Quinine',               emoji: '🌡️', desc: 'Fièvre, paludisme',            medicaments: 'Quinine',                     posologie: 'Un cachet trois fois par jour',            duree: '6 jours',  conseils: "Boire abondamment. Rester au repos jusqu'à disparition de la fièvre." },
  arnica:        { label: "Teinture d'arnica",     emoji: '💜', desc: 'Contusions, hématomes',        medicaments: "Teinture d'arnica",           posologie: 'En compresse sur la zone, deux fois par jour', duree: '4 jours', conseils: 'Usage externe. Ne pas appliquer sur une plaie ouverte.' },
  sirop:         { label: 'Sirop pectoral',        emoji: '🤧', desc: 'Toux, refroidissement',        medicaments: 'Sirop pectoral',              posologie: 'Une cuillère au coucher',                  duree: '5 jours',  conseils: "Se couvrir. Éviter le froid et l'humidité." },
  antiseptique:  { label: 'Alcool antiseptique',   emoji: '🥃', desc: 'Désinfection des plaies',      medicaments: 'Alcool / whisky antiseptique', posologie: 'Nettoyer la plaie avant chaque soin',     duree: '—',        conseils: 'Usage externe uniquement.' },
  reconstituant: { label: 'Repos & reconstituant', emoji: '🛌', desc: 'Épuisement, blessure grave',   medicaments: 'Bouillon, repos et reconstituant', posologie: 'Alitement et repas réguliers',        duree: "Selon l'état", conseils: 'Repos strict. Réexamen sous quelques jours.' },
};

// Convertit une durée écrite en nombre de jours (« 5 jours », « 2 semaines »…). null si non chiffrable.
function _dureeJours(duree) {
  const s = String(duree || '').toLowerCase();
  const m = s.match(/(\d+)\s*(jours?|jrs?|semaines?|sem)/);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (!n || n > 60) return null;
  return /sem/.test(m[2]) ? n * 7 : n;
}

// Formulaire d'ordonnance, éventuellement pré-rempli par un remède d'époque.
function _ordoModal(id, p) {
  p = p || {};
  const inp = (cid, label, style, req, max, ph, val) => {
    const t = new TextInputBuilder().setCustomId(cid).setLabel(label).setStyle(style).setRequired(req).setMaxLength(max);
    if (ph) t.setPlaceholder(ph);
    if (val) t.setValue(String(val).slice(0, max));
    return new ActionRowBuilder().addComponents(t);
  };
  return new ModalBuilder().setCustomId(`med_ordo_modal::${id}`).setTitle('💊 Ordonnance médicale').addComponents(
    inp('medicaments', 'Médicament(s)', TextInputStyle.Paragraph, true, 300, 'ex : Laudanum · onguent cicatrisant · tonique', p.medicaments),
    inp('posologie', 'Posologie', TextInputStyle.Short, true, 150, 'ex : 2 gouttes matin et soir', p.posologie),
    inp('duree', 'Durée du traitement', TextInputStyle.Short, false, 80, 'ex : 5 jours', p.duree),
    inp('conseils', 'Conseils / recommandations', TextInputStyle.Paragraph, false, 400, 'ex : repos, éviter les efforts, revenir si fièvre', p.conseils),
  );
}

// Prévient le PATIENT en MP de son changement de statut (discret, best-effort).
// Ne notifie que sur un vrai changement, et jamais pour « non_teste ».
async function _notifierPatientStatut(guild, id, f, ancien) {
  try {
    if (!f || f.statut === 'non_teste' || f.statut === ancien) return;
    const u = await guild.client.users.fetch(id).catch(() => null);
    if (!u) return;
    const repos = f.reposJusquAt ? ` Convalescence estimée jusqu'au **${_dateFR(f.reposJusquAt)}**.` : '';
    const msgs = {
      apte:        '✅ **Tu es déclaré APTE au service.** Le médecin a validé ton état — tu peux reprendre.',
      observation: `⚠️ **Tu es placé EN OBSERVATION.** Service limité, ménage-toi le temps que ça se stabilise.${repos}`,
      inapte:      `❌ **Tu es déclaré INAPTE au service.** Repos et soins nécessaires avant de reprendre.${repos}`,
    };
    const txt = msgs[f.statut]; if (!txt) return;
    await u.send([
      "🩺 **Cabinet médical de l'Iron Wolf Company**",
      '',
      txt,
      '',
      '*Message automatique et confidentiel — inutile d\'y répondre.*',
    ].join('\n')).catch(() => {});
  } catch {}
}

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
// État RP + jauge de vitalité (immersion) selon le statut / la convalescence.
const VITALITE = {
  apte:        { bar: '🟩🟩🟩🟩🟩', txt: 'Sur pied' },
  observation: { bar: '🟩🟩🟩🟨⬜', txt: 'Convalescent' },
  inapte:      { bar: '🟥🟥⬜⬜⬜', txt: 'Alité' },
  non_teste:   { bar: '⬜⬜⬜⬜⬜', txt: 'Non évalué' },
};
function _vitalite(f) {
  const v = VITALITE[f.statut] || VITALITE.non_teste;
  // Blessure « critique » récente + inapte → « Entre la vie et la mort ».
  if (f.statut === 'inapte' && (f.blessures || []).some(b => /critique/i.test(b.gravite || ''))) return { bar: '🟥⬜⬜⬜⬜', txt: 'Entre la vie et la mort' };
  if (f.statut !== 'apte' && f.reposJusquAt && f.reposJusquAt > Date.now()) return { bar: v.bar, txt: 'Convalescent' };
  return v;
}
function _embedFiche(f, gm) {
  const st = STATUTS[f.statut] || STATUTS.non_teste;
  const v = _vitalite(f);
  const e = new EmbedBuilder().setColor(st.couleur).setTitle('🩺 Suivi médical — confidentiel')
    .setDescription(gm ? `**${_clip(gm.displayName, 80)}** · <@${gm.id}>` : 'Membre');
  const fields = [
    { name: 'État', value: _clip(`${st.label}\n${v.bar} *${v.txt}*`, 100), inline: true },
    { name: 'Test d\'aptitude', value: f.testValide ? `✅ Validé${f.testDate ? ` (${_dateFR(f.testDate)})` : ''}` : '❌ Non validé', inline: true },
    { name: 'Prochain RDV', value: _clip((f.prochainRdv || '—') + (f.prochainRdvAt ? ' ⏰' : ''), 200), inline: true },
  ];
  if (f.reposJusquAt) {
    const jours = Math.max(0, Math.ceil((f.reposJusquAt - Date.now()) / 86400000));
    fields.push({ name: '⏳ Convalescence', value: _clip(`Repos jusqu'au **${_dateFR(f.reposJusquAt)}**${jours > 0 ? ` *(dans ${jours} j)*` : ' *(terminée)*'}${f.reposMotif ? `\n${f.reposMotif}` : ''}`, 300), inline: true });
  }
  fields.push({ name: '📝 Notes', value: _clip(f.notes || '*Aucune note*', 1000), inline: false });
  e.addFields(...fields);
  if (f.blessures?.length) e.addFields({ name: '🩹 Blessures / soins', value: _clip(f.blessures.slice(-5).reverse().map(b => `• \`${_clip(b.date, 40)}\` ${_clip(b.desc, 100)}${b.localisation ? ` (${_clip(b.localisation, 40)})` : ''}${b.gravite ? ` — **${_clip(b.gravite, 20)}**` : ''}`).join('\n'), 1024), inline: false });
  if (f.suivis?.length) e.addFields({ name: '🩺 Suivi de soin', value: _clip(f.suivis.slice(-4).reverse().map(s => {
    const det = [s.etat && `état : ${s.etat}`, s.traitement && `traitement : ${s.traitement}`, s.suite && `suite : ${s.suite}`].filter(Boolean).join(' · ');
    return `• \`${_clip(s.date, 40)}\` **${_clip(s.soin, 140)}**${s.soignant ? ` — *${_clip(s.soignant, 50)}*` : ''}${det ? `\n   ${_clip(det, 240)}` : ''}`;
  }).join('\n'), 1024), inline: false });
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
      new ButtonBuilder().setCustomId(`med_ordo::${id}`).setLabel('Ordonnance').setEmoji('💊').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`med_suivi::${id}`).setLabel('Ajouter un suivi de soin').setEmoji('🩺').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`med_cloture::${id}`).setLabel('Clôturer le dossier (rétabli)').setEmoji('🗂️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`med_histo::${id}`).setLabel('Historique complet').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`med_repos::${id}`).setLabel('Convalescence').setEmoji('⏳').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`med_cert::${id}`).setLabel('Certificat d\'aptitude').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`med_dossier::${id}`).setLabel('Dossier complet').setEmoji('📖').setStyle(ButtonStyle.Secondary),
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

// ── Dossier = UN seul fil de forum par patient (réutilisé, jamais recréé) ──
// Retourne le fil du patient : celui mémorisé sur la fiche, sinon retrouvé par son
// tag [id], sinon créé une seule fois. Mémorise l'identifiant du fil sur f.threadId.
async function _dossierThread(guild, id, f) {
  try {
    const ch = _ch(guild, MEDICAL_CHANNEL);
    if (!ch || ch.type !== 15 || !ch.threads?.create) return null; // seulement en mode forum
    const tag = `[${id}]`;
    if (f.threadId) {
      const t = await ch.threads.fetch(f.threadId).catch(() => null);
      if (t) { if (t.archived) await t.setArchived(false).catch(() => {}); return t; }
    }
    // Retrouve le fil du patient : par tag [id] OU par son nom (rattrape les anciens fils « En observation — X »).
    const gm = await guild.members.fetch(id).catch(() => null);
    const nom = (gm?.displayName || '').trim();
    const _match = (t) => { const nm = t.name || ''; return nm.includes(tag) || (nom && nm.toLowerCase().includes(nom.toLowerCase())); };
    let found = null;
    try { const act = await ch.threads.fetchActive().catch(() => null); if (act?.threads) found = [...act.threads.values()].find(_match); } catch {}
    if (!found) { try { const arc = await ch.threads.fetchArchived().catch(() => null); if (arc?.threads) found = [...arc.threads.values()].find(_match); } catch {} }
    if (found) { if (found.archived) await found.setArchived(false).catch(() => {}); f.threadId = found.id; return found; }
    const t = await ch.threads.create({ name: _nomFil(gm, f, id), message: { content: `<@&${ROLE_MEDECIN}>`, embeds: [_embedFiche(f, gm)], allowedMentions: { roles: [ROLE_MEDECIN] } } }).catch(() => null);
    if (t) f.threadId = t.id;
    return t;
  } catch { return null; }
}
// Ajoute une entrée AU dossier existant du patient (fil unique), avec repli salon simple.
async function _posterAuDossier(guild, id, f, embed, ping) {
  try {
    const t = await _dossierThread(guild, id, f);
    const cible = t?.send ? t : _ch(guild, MEDICAL_CHANNEL);
    if (cible?.send) { await cible.send({ content: ping || '', embeds: [embed], allowedMentions: ping ? { roles: [ROLE_MEDECIN] } : { parse: [] } }).catch(() => {}); await _rafraichirDossier(guild, id, f).catch(() => {}); return true; }
    return false;
  } catch { return false; }
}
// LE dossier vivant = le message d'ouverture du fil patient (un seul par personne).
// On le maintient toujours à jour (état, blessures, soins, ordonnances, notes) et on
// crée le fil au besoin — ainsi chaque dossier existe et se met à jour tout seul.
async function _rafraichirDossier(guild, id, f) {
  try {
    const t = await _dossierThread(guild, id, f);
    if (!t) return false;
    const gm = await guild.members.fetch(id).catch(() => null);
    // Titre du fil = état courant → il ne peut plus « mentir » (ex : rester « En observation »
    // alors que le patient est rétabli). On ne renomme que si le titre a réellement changé.
    const voulu = _nomFil(gm, f, id);
    const nm = t.name || '';
    if (t.setName && nm !== voulu && !nm.includes('SUIVI MÉDICAL') && !nm.includes('EXEMPLE')) {
      await t.setName(voulu).catch(() => {});
    }
    if (!t.fetchStarterMessage) return false;
    const starter = await t.fetchStarterMessage().catch(() => null);
    if (starter) { await starter.edit({ embeds: [_embedFiche(f, gm)] }).catch(() => {}); return true; }
    return false;
  } catch { return false; }
}

// Corrige UNIQUEMENT le titre d'un fil de dossier clôturé/archivé (sans le rouvrir) :
// renomme selon l'état courant puis ré-archive. Rattrape les anciens titres périmés.
async function _corrigerNomFilArchive(guild, id, f) {
  try {
    const ch = _ch(guild, MEDICAL_CHANNEL);
    if (!ch || ch.type !== 15) return false;
    const gm = await guild.members.fetch(id).catch(() => null);
    const voulu = _nomFil(gm, f, id);
    const tag = `[${id}]`; const nom = (gm?.displayName || '').trim().toLowerCase();
    const _match = (t) => { const nm = t.name || ''; return nm.includes(tag) || (nom && nm.toLowerCase().includes(nom)); };
    let t = null;
    if (f.threadId) t = await ch.threads.fetch(f.threadId).catch(() => null);
    if (!t) { const act = await ch.threads.fetchActive().catch(() => null); if (act?.threads) t = [...act.threads.values()].find(_match); }
    if (!t) { const arc = await ch.threads.fetchArchived().catch(() => null); if (arc?.threads) t = [...arc.threads.values()].find(_match); }
    if (!t || !t.setName) return false;
    f.threadId = t.id;
    if ((t.name || '') === voulu) return false; // déjà bon
    const etaitArchive = t.archived;
    await t.setName(voulu).catch(() => {}); // renommer (peut désarchiver)
    if (etaitArchive) await t.setArchived(true).catch(() => {}); // on le laisse archivé comme avant
    return true;
  } catch { return false; }
}

// Au démarrage : garantit que CHAQUE dossier déjà existant a son fil « fiche complète »
// visible dans le salon (créé s'il manque, message d'ouverture rafraîchi). Idempotent,
// paisible (petite pause entre chaque) — ne recrée jamais un fil déjà présent.
async function installerDossiers(guild) {
  try {
    const ch = _ch(guild, MEDICAL_CHANNEL);
    if (!ch || ch.type !== 15) return 0; // seulement en mode forum
    const db = loadDB(); const sm = db.suiviMedical || {};
    const ids = Object.keys(sm);
    let n = 0;
    for (const id of ids.slice(0, 60)) { // garde-fou anti-flood
      try {
        const f = sm[id];
        // Dossier clôturé/archivé : on NE le rouvre PAS — on corrige seulement un titre périmé.
        if (f.clotureAt && f.statut === 'apte') {
          await _corrigerNomFilArchive(guild, id, f);
        } else {
          const before = f.threadId;
          await _rafraichirDossier(guild, id, f);
          if (f.threadId && f.threadId !== before) n++; // nouveau fil créé
        }
      } catch {}
      await new Promise(r => setTimeout(r, 450)); // pacing doux (rate limits)
    }
    saveDB(db); // persiste les f.threadId éventuellement créés
    return n;
  } catch (e) { console.log('❌ installerDossiers:', e.message); return 0; }
}

// Archive TOUS les fils du patient dans le forum (le fil mémorisé + les anciens
// « En observation — X »), pour qu'ils disparaissent de la liste active. Réversible.
async function _archiverFilsPatient(guild, id, gm) {
  let n = 0;
  try {
    const ch = _ch(guild, MEDICAL_CHANNEL);
    if (!ch || ch.type !== 15 || !ch.threads?.fetchActive) return 0;
    const tag = `[${id}]`;
    const nom = (gm?.displayName || '').trim().toLowerCase();
    const act = await ch.threads.fetchActive().catch(() => null);
    const list = act?.threads ? [...act.threads.values()] : [];
    for (const t of list) {
      const nm = (t.name || '');
      const match = nm.includes(tag) || (nom && nm.toLowerCase().includes(nom));
      if (match && t.setArchived && !t.archived) { await t.setArchived(true).catch(() => {}); n++; }
    }
  } catch {}
  return n;
}

// SUPPRIME les fils du patient (actifs ET archivés) pour qu'ils DISPARAISSENT
// vraiment du forum — dans un forum, un fil archivé reste visible. Sûr : la fiche
// complète vit en base (db.suiviMedical) et le fil se recrée seul à la réouverture
// ou à la prochaine blessure. Repli sur l'archivage si la suppression est refusée.
async function _supprimerFilsPatient(guild, id, gm) {
  let n = 0;
  try {
    const ch = _ch(guild, MEDICAL_CHANNEL);
    if (!ch || ch.type !== 15 || !ch.threads?.fetchActive) return 0;
    const tag = `[${id}]`;
    const nom = (gm?.displayName || '').trim().toLowerCase();
    const _match = (t) => { const nm = t.name || ''; return nm.includes(tag) || (nom && nm.toLowerCase().includes(nom)); };
    const cibles = [];
    try { const act = await ch.threads.fetchActive().catch(() => null); if (act?.threads) cibles.push(...[...act.threads.values()].filter(_match)); } catch {}
    try { const arc = await ch.threads.fetchArchived().catch(() => null); if (arc?.threads) cibles.push(...[...arc.threads.values()].filter(_match)); } catch {}
    const vus = new Set();
    for (const t of cibles) {
      if (vus.has(t.id)) continue; vus.add(t.id);
      const nm = t.name || '';
      if (nm.includes('SUIVI MÉDICAL') || nm.includes('EXEMPLE')) continue; // jamais le panneau ni l'exemple
      let supprime = false;
      if (t.delete) { try { await t.delete('Dossier médical clôturé (patient rétabli)'); supprime = true; } catch {} }
      if (!supprime && t.setArchived && !t.archived) { await t.setArchived(true).catch(() => {}); } // repli : au moins l'archiver
      if (supprime) n++;
    }
  } catch {}
  return n;
}

// ── Alerte statut (INAPTE / OBSERVATION) — postée DANS le dossier du patient ──
async function _alerteStatut(guild, id, f) {
  try {
    if (f.statut !== 'inapte' && f.statut !== 'observation') return;
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
    await _posterAuDossier(guild, id, f, e, `<@&${ROLE_MEDECIN}>`);
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
// Rappel ~1h avant un RDV médical (au médecin ET au patient) + fin de convalescence.
async function checkRappelsMedicaux(guild) {
  try {
    const db = loadDB(); const sm = db.suiviMedical || {}; let changed = false;
    const role = guild.roles.cache.get(ROLE_MEDECIN);
    const docs = role ? [...role.members.values()].filter(m => !m.user.bot) : [];
    for (const id of Object.keys(sm)) {
      const f = sm[id];
      // ── Rappel de RDV (médecin + patient) ──
      if (f.prochainRdvAt) {
        const mins = Math.floor((f.prochainRdvAt - Date.now()) / 60000);
        if (mins > 2 && mins <= 60 && !f.sentRappelMed) {
          const gm = await guild.members.fetch(id).catch(() => null);
          const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Rappel — RDV médical dans 1 heure')
            .setDescription(`Rendez-vous avec ${gm ? `**${gm.displayName}**` : `<@${id}>`}\n📅 ${_clip(f.prochainRdv || '—', 100)}`)
            .setFooter({ text: 'Iron Wolf Company · Secrétariat médical' }).setTimestamp();
          for (const doc of docs) await doc.send({ embeds: [e] }).catch(() => {});
          // Rappel AUSSI au patient concerné.
          try {
            const u = await guild.client.users.fetch(id).catch(() => null);
            if (u) await u.send({ embeds: [new EmbedBuilder().setColor(0x2ECC71).setTitle('🩺 Rappel — ton rendez-vous médical est dans 1 heure')
              .setDescription(`📅 ${_clip(f.prochainRdv || '—', 100)}\n\nPense à t'y rendre. — *Cabinet médical de l'Iron Wolf Company*`).setTimestamp()] }).catch(() => {});
          } catch {}
          f.sentRappelMed = true; changed = true;
        }
        if (mins < -120) { f.sentRappelMed = false; f.prochainRdvAt = null; changed = true; }
      }
      // ── Fin de convalescence : on repasse le patient APTE automatiquement + on prévient ──
      if (f.reposJusquAt && Date.now() >= f.reposJusquAt && !f.reposNotifie && (f.statut === 'inapte' || f.statut === 'observation')) {
        const ancien = f.statut;
        f.statut = 'apte'; f.reposNotifie = true; const finRepos = f.reposJusquAt; f.reposJusquAt = null; f.reposMotif = null;
        f.majPar = 'Convalescence terminée'; f.majAt = Date.now();
        _log(f, '⏳ Convalescence terminée → ✅ Apte (automatique)', 'Système médical');
        changed = true;
        const gm = await guild.members.fetch(id).catch(() => null);
        // Trace dans le dossier + ping médecin (à réexaminer si besoin).
        const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('⏳ Convalescence terminée')
          .setDescription(`${gm ? `**${_clip(gm.displayName, 80)}**` : `<@${id}>`} a fini sa convalescence (prévue jusqu'au ${_dateFR(finRepos)}).\nStatut remis à **✅ Apte** automatiquement — réexamine-le si tu as un doute.`)
          .setFooter({ text: 'Iron Wolf Company · Suivi médical' }).setTimestamp();
        try { await _posterAuDossier(guild, id, f, e, `<@&${ROLE_MEDECIN}>`); } catch {}
        try { await _notifierPatientStatut(guild, id, f, ancien); } catch {}
      }
      // ── 💉 Rappel de traitement au patient (une fois par jour tant que l'ordonnance est active) ──
      const ordo = (f.ordonnances && f.ordonnances.length) ? f.ordonnances[f.ordonnances.length - 1] : null;
      if (ordo && ordo.at) {
        const jours = _dureeJours(ordo.duree);
        const finTraitement = jours ? ordo.at + jours * 86400000 : null;
        const now = Date.now(); const heure = new Date(now).getHours();
        const jourCle = _dateFR(now); // clé « jour » (une seule notif / jour)
        // Seulement pendant la fenêtre de traitement chiffrable, en journée, et pas déjà envoyé aujourd'hui.
        if (finTraitement && now < finTraitement && now > ordo.at + 3600000 && heure >= 8 && heure <= 22 && f.rappelTraitementJour !== jourCle) {
          const u = await guild.client.users.fetch(id).catch(() => null);
          if (u) {
            await u.send([
              "🩺 **Cabinet médical de l'Iron Wolf Company — rappel de traitement**",
              '',
              `💊 Pense à prendre ton traitement : **${_clip(ordo.medicaments || 'ton remède', 150)}**`,
              ordo.posologie ? `📋 Posologie : ${_clip(ordo.posologie, 150)}` : '',
              ordo.duree ? `⏳ Durée : ${_clip(ordo.duree, 80)}` : '',
              '',
              "*Message automatique et confidentiel — inutile d'y répondre. Bon rétablissement.*",
            ].filter(Boolean).join('\n')).catch(() => {});
            f.rappelTraitementJour = jourCle; changed = true;
          }
        }
      }
    }
    if (changed) saveDB(db);
  } catch (e) { console.log('❌ checkRappelsMedicaux:', e.message); }
}

// 📊 Bilan médical (statistiques, lecture seule).
function _bilanEmbed(db) {
  const sm = db.suiviMedical || {};
  const ids = Object.keys(sm);
  const now = Date.now(); const J30 = 30 * 86400000;
  let apte = 0, obs = 0, inapte = 0, nonTeste = 0, testValides = 0, enRepos = 0;
  let blTot = 0, bl30 = 0, gBenigne = 0, gModeree = 0, gGrave = 0, soinsTot = 0, soins30 = 0;
  const aSurveiller = [], prochainsRdv = [];
  for (const id of ids) {
    const f = sm[id]; const st = f.statut || 'non_teste';
    if (st === 'apte') apte++; else if (st === 'observation') obs++; else if (st === 'inapte') inapte++; else nonTeste++;
    if (f.testValide) testValides++;
    if (f.reposJusquAt && f.reposJusquAt > now) enRepos++;
    if (st === 'inapte' || st === 'observation') aSurveiller.push(`${(STATUTS[st] || STATUTS.non_teste).label.split(' ')[0]} <@${id}>${f.reposJusquAt && f.reposJusquAt > now ? ` ⏳ ${_dateFR(f.reposJusquAt)}` : ''}`);
    if (f.prochainRdvAt && f.prochainRdvAt > now) prochainsRdv.push({ id, at: f.prochainRdvAt, txt: f.prochainRdv });
    for (const b of (f.blessures || [])) {
      blTot++;
      const t = b.at || _parseRdvDate(b.date) || 0;
      if (t && now - t <= J30) bl30++;
      const g = String(b.gravite || '').toLowerCase();
      if (g.includes('grave')) gGrave++; else if (g.includes('mod')) gModeree++; else if (g.includes('bén') || g.includes('ben')) gBenigne++;
    }
    for (const s of (f.suivis || [])) { soinsTot++; if (s.at && now - s.at <= J30) soins30++; }
  }
  const e = new EmbedBuilder().setColor(0x2ECC71).setTitle('📊 Bilan médical — La Confrérie')
    .setDescription(`👥 **${ids.length}** dossier(s) suivi(s)`).setTimestamp()
    .addFields(
      { name: '🩺 Aptitude', value: `✅ ${apte} apte(s)\n⚠️ ${obs} en observation\n❌ ${inapte} inapte(s)\n⏳ ${nonTeste} non testé(s)`, inline: true },
      { name: '🧪 Tests validés', value: `${testValides} / ${ids.length || 0}`, inline: true },
      { name: '⏳ En convalescence', value: `${enRepos}`, inline: true },
      { name: '🩹 Blessures', value: `Total : **${blTot}** · 30 j : **${bl30}**\n🟢 ${gBenigne} bénigne(s) · 🟡 ${gModeree} modérée(s) · 🔴 ${gGrave} grave(s)`, inline: false },
      { name: '💊 Soins enregistrés', value: `Total : **${soinsTot}** · 30 j : **${soins30}**`, inline: false },
    );
  if (aSurveiller.length) e.addFields({ name: `👁️ À surveiller (${aSurveiller.length})`, value: _clip(aSurveiller.slice(0, 15).join('\n'), 1024), inline: false });
  if (prochainsRdv.length) { prochainsRdv.sort((a, b) => a.at - b.at); e.addFields({ name: '📅 Prochains RDV', value: _clip(prochainsRdv.slice(0, 8).map(r => `<@${r.id}> — ${_clip(r.txt || _dateFR(r.at), 60)}`).join('\n'), 1024), inline: false }); }
  e.setFooter({ text: '📊 « 30 j » = entrées horodatées récentes · à la demande' });
  return e;
}

// 📜 Certificat d'aptitude en HTML autonome (imprimable → PDF). Renvoie null si aucun test.
function _certificatHTML(f, gm) {
  const t = f.dernierTest; if (!t || !t.input) return null;
  const inp = t.input; const r = t.r || {};
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const verdict = String(inp.verdict || '').toUpperCase();
  const vColor = /INAPTE/.test(verdict) ? '#a11' : (/R[ÉE]SERVE/.test(verdict) ? '#a80' : '#2a7a2a');
  const sec = (titre, pairs, obs) => {
    const lignes = pairs.filter(([, v]) => v).map(([k, v]) => `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>`).join('');
    if (!lignes && !obs) return '';
    return `<div class="sec"><h3>${esc(titre)}</h3>${lignes}${obs ? `<p class="obs">${esc(obs)}</p>` : ''}</div>`;
  };
  const body = [
    r.apparence && sec('§ I — Apparence générale', [['Posture', r.apparence.posture], ['Aspect', r.apparence.aspect]], r.apparence.obs),
    r.physique && sec('§ II — État physique', [['Force', r.physique.force], ['Endurance', r.physique.endurance], ['Coordination', r.physique.coordination]], r.physique.obs),
    r.sensoriel && sec('§ III — Capacités sensorielles', [['Vue', r.sensoriel.vue], ['Ouïe', r.sensoriel.ouie], ['Odorat', r.sensoriel.odorat], ['Toucher', r.sensoriel.toucher], ['Réactivité', r.sensoriel.reactivite]], r.sensoriel.obs),
    r.sante && sec('§ IV — État général de santé', [['Constitution', r.sante.constitution], ['Fatigue', r.sante.fatigue], ['Respiration', r.sante.respiration], ['Pouls', r.sante.pouls]], r.sante.obs),
    r.habitudes && sec('§ V — Habitudes & antécédents', [['Régime', r.habitudes.regime], ['Consommation', r.habitudes.consommation], ['Antécédents', r.habitudes.antecedents]], r.habitudes.obs),
    r.maladies && sec('§ VI — Maladies & allergies', [['Actuelles', r.maladies.actuelles], ['Passées', r.maladies.passees], ['Allergies', r.maladies.allergies], ['Traitements', r.maladies.traitements]], r.maladies.obs),
    r.intellect && sec('§ VII — Capacités intellectuelles', [['Lecture', r.intellect.lecture], ['Écriture', r.intellect.ecriture], ['Calcul', r.intellect.calcul], ['Compréhension', r.intellect.comprehension]], r.intellect.obs),
  ].filter(Boolean).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Certificat d'aptitude — ${esc(inp.patient)}</title>
<style>
@media print{body{background:#fff;padding:0}.paper{box-shadow:none;margin:0}.print{display:none}}
body{margin:0;background:#3a2c1c;font-family:Georgia,'Times New Roman',serif;color:#2a1c10;padding:24px}
.paper{max-width:820px;margin:0 auto;background:#f3e6c8;border:2px solid #7a5a34;box-shadow:0 12px 40px #0008;padding:44px 48px;position:relative}
.paper::before{content:'';position:absolute;inset:10px;border:1px double #9a7a4a;pointer-events:none}
h1{text-align:center;font-size:1.9rem;letter-spacing:.04em;margin:.2em 0;color:#3a260f}
.sub{text-align:center;font-style:italic;color:#5a4326;margin-bottom:4px}
.gov{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.14em;font-size:.8rem;color:#6a4e2a;border-top:1px solid #9a7a4a;border-bottom:1px solid #9a7a4a;padding:6px 0;margin:14px 0}
.pat{margin:14px 0;font-size:1.05rem}
.verdict{text-align:center;font-size:1.4rem;font-weight:bold;letter-spacing:.08em;margin:18px 0;padding:10px;border:2px solid ${vColor};color:${vColor};border-radius:6px}
.sec{margin:14px 0;break-inside:avoid}
.sec h3{font-size:1rem;color:#5a3f22;border-bottom:1px dashed #b89a63;padding-bottom:3px;margin-bottom:6px}
.row{display:flex;gap:8px;margin:2px 0;font-size:.95rem}
.row .k{font-weight:bold;min-width:130px;color:#4a3420}
.obs{font-style:italic;color:#4a3420;margin:5px 0 0}
.concl{margin-top:16px;padding:12px;background:#e9d9b4;border-left:4px solid ${vColor};font-style:italic}
.sign{margin-top:28px;text-align:right;font-style:italic;color:#4a3420}
.foot{margin-top:18px;font-size:.7rem;text-align:center;color:#6a4e2a}
.print{position:fixed;top:14px;right:14px;background:#7a5a34;color:#f3e6c8;border:0;padding:9px 14px;border-radius:6px;font-family:inherit;cursor:pointer}
</style></head><body>
<button class="print" onclick="window.print()">🖨️ Imprimer / PDF</button>
<div class="paper">
  <h1>Certificat d'Aptitude Médicale</h1>
  <div class="sub">Examen complet de l'état physique, sensoriel et intellectuel</div>
  <div class="gov">État du Texas — Bureau Médical de Blackwater</div>
  <div class="pat"><b>Patient :</b> ${esc(inp.patient)}<br>
  ${inp.dateLieu ? `<b>Date &amp; lieu :</b> ${esc(inp.dateLieu)}<br>` : ''}
  ${inp.physique ? `<b>Données :</b> ${esc(inp.physique)}` : ''}</div>
  <div class="verdict">VERDICT : ${esc(verdict)}</div>
  ${body}
  ${r.conclusion ? `<div class="concl">${esc(r.conclusion)}</div>` : ''}
  <div class="sign">Dr. June McCall,<br>praticien agréé — Bureau Médical de Blackwater</div>
  <div class="foot">Établi de bonne foi, fait foi auprès des autorités. Toute falsification est passible de poursuites (loi fédérale des É.-U.).<br>Iron Wolf Company · Suivi médical confidentiel</div>
</div>
</body></html>`;
}

// Ordonnance médicale téléchargeable (parchemin, même style que le certificat).
function _ordonnanceHTML(f, gm, data) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nom = gm?.displayName || f.nomRP || 'Patient';
  const medecin = data.medecin || 'Dr. June McCall';
  const row = (k, v) => v ? `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ordonnance — ${esc(nom)}</title>
<style>
@media print{body{background:#fff;padding:0}.paper{box-shadow:none;margin:0}.print{display:none}}
body{margin:0;background:#3a2c1c;font-family:Georgia,'Times New Roman',serif;color:#2a1c10;padding:24px}
.paper{max-width:760px;margin:0 auto;background:#f3e6c8;border:2px solid #7a5a34;box-shadow:0 12px 40px #0008;padding:44px 48px;position:relative}
.paper::before{content:'';position:absolute;inset:10px;border:1px double #9a7a4a;pointer-events:none}
h1{text-align:center;font-size:1.9rem;letter-spacing:.04em;margin:.2em 0;color:#3a260f}
.sub{text-align:center;font-style:italic;color:#5a4326;margin-bottom:4px}
.gov{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.14em;font-size:.8rem;color:#6a4e2a;border-top:1px solid #9a7a4a;border-bottom:1px solid #9a7a4a;padding:6px 0;margin:14px 0}
.pat{margin:14px 0;font-size:1.05rem}
.rx{font-size:2.6rem;color:#5a3f22;margin:6px 0 0;font-weight:bold}
.sec{margin:6px 0}
.row{display:flex;gap:8px;margin:4px 0;font-size:1rem}
.row .k{font-weight:bold;min-width:150px;color:#4a3420}
.concl{margin-top:16px;padding:12px;background:#e9d9b4;border-left:4px solid #7a5a34;font-style:italic}
.sign{margin-top:36px;text-align:right;font-style:italic;color:#4a3420}
.foot{margin-top:18px;font-size:.7rem;text-align:center;color:#6a4e2a}
.print{position:fixed;top:14px;right:14px;background:#7a5a34;color:#f3e6c8;border:0;padding:9px 14px;border-radius:6px;font-family:inherit;cursor:pointer}
</style></head><body>
<button class="print" onclick="window.print()">🖨️ Imprimer / PDF</button>
<div class="paper">
  <h1>Ordonnance Médicale</h1>
  <div class="sub">Prescription nominative à présenter en pharmacie</div>
  <div class="gov">État du Texas — Bureau Médical de Blackwater</div>
  <div class="pat"><b>Patient :</b> ${esc(nom)}<br><b>Date :</b> ${esc(_dateFR(Date.now()))}</div>
  <div class="rx">℞</div>
  <div class="sec">
    ${row('Médicament(s)', data.medicaments)}
    ${row('Posologie', data.posologie)}
    ${row('Durée du traitement', data.duree)}
  </div>
  ${data.conseils ? `<div class="concl">${esc(data.conseils)}</div>` : ''}
  <div class="sign">${esc(medecin)},<br>praticien agréé — Bureau Médical de Blackwater</div>
  <div class="foot">Ordonnance nominative. Toute falsification est passible de poursuites.<br>Iron Wolf Company · Suivi médical confidentiel</div>
</div>
</body></html>`;
}

// Dossier médical COMPLET téléchargeable (parchemin) — consolide tout le suivi du patient.
function _dossierMedicalHTML(f, gm) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nom = gm?.displayName || f.nomRP || 'Patient';
  const st = STATUTS[f.statut] || STATUTS.non_teste;
  const GAUGE = { apte: { bar: '▰▰▰▰▰', txt: 'Bonne santé' }, observation: { bar: '▰▰▰▱▱', txt: 'Sous surveillance' }, inapte: { bar: '▰▱▱▱▱', txt: 'État préoccupant' }, non_teste: { bar: '▱▱▱▱▱', txt: 'Non évalué' } };
  const g = GAUGE[f.statut] || GAUGE.non_teste;
  const conv = f.reposJusquAt ? `Convalescence jusqu'au ${_dateFR(f.reposJusquAt)}${f.reposMotif ? ` — ${f.reposMotif}` : ''}` : '';
  const sec = (titre, inner) => inner ? `<div class="sec"><h3>${esc(titre)}</h3>${inner}</div>` : '';
  const li = arr => `<ul>${arr.map(x => `<li>${x}</li>`).join('')}</ul>`;
  const blessures = (f.blessures || []).slice().reverse().map(b => `<b>${esc(b.date || '')}</b> — ${esc(b.desc || '')}${b.localisation ? ` <i>(${esc(b.localisation)})</i>` : ''}${b.gravite ? ` — gravité <b>${esc(b.gravite)}</b>` : ''}${b.par ? ` <span class="by">— ${esc(b.par)}</span>` : ''}`);
  const soins = (f.suivis || []).slice().reverse().map(s => `<b>${esc(s.date || '')}</b> — ${esc(s.soin || '')}${s.etat ? `<br><i>État :</i> ${esc(s.etat)}` : ''}${s.traitement ? `<br><i>Traitement :</i> ${esc(s.traitement)}` : ''}${s.suite ? `<br><i>Suite :</i> ${esc(s.suite)}` : ''}${s.soignant ? ` <span class="by">— ${esc(s.soignant)}</span>` : ''}`);
  const ordos = (f.ordonnances || []).slice().reverse().map(o => `<b>${esc(o.date || '')}</b> — ${esc(o.medicaments || '')}${o.posologie ? ` · <i>${esc(o.posologie)}</i>` : ''}${o.duree ? ` · ${esc(o.duree)}` : ''}${o.medecin ? ` <span class="by">— ${esc(o.medecin)}</span>` : ''}`);
  const test = f.dernierTest?.input ? `<div class="row"><span class="k">Verdict</span><span class="v"><b>${esc(String(f.dernierTest.input.verdict || '—').toUpperCase())}</b></span></div><div class="row"><span class="k">Date &amp; lieu</span><span class="v">${esc(f.dernierTest.input.dateLieu || '—')}</span></div>` : '';
  const body = [
    sec('§ I — État de santé actuel', `<div class="row"><span class="k">Statut</span><span class="v">${esc(st.label)}</span></div><div class="row"><span class="k">Vitalité</span><span class="v">${g.bar} — ${esc(g.txt)}</span></div>${conv ? `<div class="row"><span class="k">Repos</span><span class="v">${esc(conv)}</span></div>` : ''}`),
    sec('§ II — Antécédents & blessures', blessures.length ? li(blessures) : '<p class="obs">Aucune blessure consignée.</p>'),
    sec('§ III — Soins & traitements reçus', soins.length ? li(soins) : '<p class="obs">Aucun soin consigné.</p>'),
    sec('§ IV — Ordonnances délivrées', ordos.length ? li(ordos) : '<p class="obs">Aucune ordonnance délivrée.</p>'),
    test ? sec('§ V — Examen d\'aptitude', test) : '',
    f.notes ? sec('§ VI — Notes du praticien', `<p class="obs">${esc(f.notes)}</p>`) : '',
  ].filter(Boolean).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Dossier médical — ${esc(nom)}</title>
<style>
@media print{body{background:#fff;padding:0}.paper{box-shadow:none;margin:0}.print{display:none}}
body{margin:0;background:#3a2c1c;font-family:Georgia,'Times New Roman',serif;color:#2a1c10;padding:24px}
.paper{max-width:840px;margin:0 auto;background:#f3e6c8;border:2px solid #7a5a34;box-shadow:0 12px 40px #0008;padding:44px 48px;position:relative}
.paper::before{content:'';position:absolute;inset:10px;border:1px double #9a7a4a;pointer-events:none}
h1{text-align:center;font-size:1.8rem;letter-spacing:.04em;margin:.2em 0;color:#3a260f}
.sub{text-align:center;font-style:italic;color:#5a4326;margin-bottom:4px}
.gov{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.14em;font-size:.78rem;color:#6a4e2a;border-top:1px solid #9a7a4a;border-bottom:1px solid #9a7a4a;padding:6px 0;margin:14px 0}
.pat{margin:14px 0;font-size:1.05rem}
.sec{margin:16px 0;break-inside:avoid}
.sec h3{font-size:1rem;color:#5a3f22;border-bottom:1px dashed #b89a63;padding-bottom:3px;margin-bottom:6px}
.row{display:flex;gap:8px;margin:2px 0;font-size:.95rem}
.row .k{font-weight:bold;min-width:120px;color:#4a3420}
.sec ul{margin:4px 0;padding-left:20px}.sec li{margin:6px 0;font-size:.94rem;line-height:1.4}
.by{color:#6a4e2a;font-style:italic;font-size:.85em}
.obs{font-style:italic;color:#4a3420;margin:4px 0}
.sign{margin-top:28px;text-align:right;font-style:italic;color:#4a3420}
.foot{margin-top:18px;font-size:.7rem;text-align:center;color:#6a4e2a}
.print{position:fixed;top:14px;right:14px;background:#7a5a34;color:#f3e6c8;border:0;padding:9px 14px;border-radius:6px;font-family:inherit;cursor:pointer}
</style></head><body>
<button class="print" onclick="window.print()">🖨️ Imprimer / PDF</button>
<div class="paper">
  <h1>Dossier Médical Confidentiel</h1>
  <div class="sub">Suivi complet du patient — usage réservé au praticien</div>
  <div class="gov">État du Texas — Bureau Médical de Blackwater</div>
  <div class="pat"><b>Patient :</b> ${esc(nom)}<br><b>Dossier établi le :</b> ${esc(_dateFR(Date.now()))}</div>
  ${body}
  <div class="sign">Bureau Médical de Blackwater<br>Iron Wolf Company — Suivi médical</div>
  <div class="foot">Document strictement confidentiel. La divulgation à un tiers non autorisé est passible de poursuites.<br>Iron Wolf Company · Suivi médical</div>
</div>
</body></html>`;
}

// ⚰️ Acte de décès en HTML autonome (parchemin solennel, imprimable → PDF).
function _acteDecesHTML(f, gm, data) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nom = gm?.displayName || f.nomRP || 'Défunt';
  const row = (k, v) => v ? `<div class="row"><span class="k">${esc(k)}</span><span class="v">${esc(v)}</span></div>` : '';
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Acte de décès — ${esc(nom)}</title>
<style>
@media print{body{background:#fff;padding:0}.paper{box-shadow:none;margin:0}.print{display:none}}
body{margin:0;background:#241a11;font-family:Georgia,'Times New Roman',serif;color:#241610;padding:24px}
.paper{max-width:760px;margin:0 auto;background:#efe2c4;border:2px solid #3a2c1c;box-shadow:0 12px 40px #000a;padding:44px 48px;position:relative}
.paper::before{content:'';position:absolute;inset:10px;border:1px double #5a4326;pointer-events:none}
.cross{text-align:center;font-size:1.6rem;color:#3a2c1c;margin:0 0 4px}
h1{text-align:center;font-size:1.8rem;letter-spacing:.08em;margin:.2em 0;color:#241610}
.sub{text-align:center;font-style:italic;color:#4a3826;margin-bottom:4px}
.gov{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.14em;font-size:.78rem;color:#4a3826;border-top:1px solid #5a4326;border-bottom:1px solid #5a4326;padding:6px 0;margin:14px 0}
.pat{margin:16px 0;font-size:1.1rem;text-align:center}
.pat .nom{font-size:1.5rem;font-weight:bold;letter-spacing:.04em;display:block;margin:6px 0}
.sec{margin:10px 0}
.row{display:flex;gap:8px;margin:5px 0;font-size:1rem}
.row .k{font-weight:bold;min-width:170px;color:#3a2820}
.concl{margin-top:16px;padding:12px;background:#e2d3ae;border-left:4px solid #3a2c1c;font-style:italic}
.sign{margin-top:34px;text-align:right;font-style:italic;color:#3a2820}
.foot{margin-top:18px;font-size:.7rem;text-align:center;color:#4a3826}
.print{position:fixed;top:14px;right:14px;background:#3a2c1c;color:#efe2c4;border:0;padding:9px 14px;border-radius:6px;font-family:inherit;cursor:pointer}
</style></head><body>
<button class="print" onclick="window.print()">🖨️ Imprimer / PDF</button>
<div class="paper">
  <div class="cross">✝</div>
  <h1>Acte de Décès</h1>
  <div class="sub">Certificat officiel constatant le décès</div>
  <div class="gov">État du Texas — Bureau Médical de Blackwater</div>
  <div class="pat">Il est ici constaté le décès de<span class="nom">${esc(nom)}</span></div>
  <div class="sec">
    ${row('Date & lieu du décès', data.dateLieu)}
    ${row('Cause du décès', data.cause)}
    ${row('Circonstances', data.circonstances)}
    ${row('Déclarant / témoin', data.temoin)}
    ${row('Lieu de sépulture', data.inhumation)}
  </div>
  ${data.circonstances ? '' : ''}
  <div class="concl">Le praticien soussigné atteste avoir constaté le décès et en avoir dressé le présent acte, conformément à la loi.</div>
  <div class="sign">${esc(data.medecin || 'Dr. June McCall')},<br>praticien agréé — Bureau Médical de Blackwater</div>
  <div class="foot">Acte officiel faisant foi auprès des autorités. Toute falsification est passible de poursuites (loi fédérale des É.-U.).<br>Iron Wolf Company · Suivi médical</div>
</div>
</body></html>`;
}

// Découpe les lignes de prestations « libellé — montant » et calcule le total.
function _parseHonoLignes(txt) {
  const lignes = []; let total = 0;
  for (const raw of String(txt || '').split('\n')) {
    const l = raw.trim(); if (!l) continue;
    const m = l.match(/(\d+(?:[.,]\d{1,2})?)\s*\$?\s*$/);
    let libelle = l, montant = null;
    if (m) { montant = parseFloat(m[1].replace(',', '.')); libelle = l.slice(0, m.index).replace(/[—\-–:=·]\s*$/, '').trim() || l; if (!isNaN(montant)) total += montant; }
    lignes.push({ libelle, montant });
  }
  return { lignes, total };
}

// 🧾 Note d'honoraires (facture d'époque, parchemin imprimable → PDF).
function _honorairesHTML(f, gm, data) {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const nom = gm?.displayName || f.nomRP || 'Patient';
  const { lignes, total } = _parseHonoLignes(data.prestations);
  const totalAff = (data.total && String(data.total).trim()) ? String(data.total).trim().replace(/\$/g, '') : total.toFixed(2).replace(/\.00$/, '');
  const rows = lignes.map(x => `<tr><td>${esc(x.libelle)}</td><td class="mt">${x.montant != null ? esc(x.montant.toFixed(2).replace(/\.00$/, '')) + ' $' : '—'}</td></tr>`).join('');
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Note d'honoraires — ${esc(nom)}</title>
<style>
@media print{body{background:#fff;padding:0}.paper{box-shadow:none;margin:0}.print{display:none}}
body{margin:0;background:#3a2c1c;font-family:Georgia,'Times New Roman',serif;color:#2a1c10;padding:24px}
.paper{max-width:760px;margin:0 auto;background:#f3e6c8;border:2px solid #7a5a34;box-shadow:0 12px 40px #0008;padding:44px 48px;position:relative}
.paper::before{content:'';position:absolute;inset:10px;border:1px double #9a7a4a;pointer-events:none}
h1{text-align:center;font-size:1.9rem;letter-spacing:.04em;margin:.2em 0;color:#3a260f}
.sub{text-align:center;font-style:italic;color:#5a4326;margin-bottom:4px}
.gov{text-align:center;font-weight:bold;text-transform:uppercase;letter-spacing:.14em;font-size:.8rem;color:#6a4e2a;border-top:1px solid #9a7a4a;border-bottom:1px solid #9a7a4a;padding:6px 0;margin:14px 0}
.pat{margin:14px 0;font-size:1rem;display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px}
table{width:100%;border-collapse:collapse;margin:16px 0}
th,td{text-align:left;padding:8px 6px;border-bottom:1px solid #c9ad78;font-size:.98rem}
th{text-transform:uppercase;letter-spacing:.08em;font-size:.72rem;color:#6a4e2a}
.mt{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}
.total{text-align:right;font-size:1.25rem;font-weight:bold;margin-top:10px;color:#3a260f}
.total span{border-top:3px double #7a5a34;padding-top:6px}
.pay{margin-top:8px;font-style:italic;color:#5a4326}
.concl{margin-top:16px;padding:12px;background:#e9d9b4;border-left:4px solid #7a5a34;font-style:italic}
.sign{margin-top:32px;text-align:right;font-style:italic;color:#4a3420}
.foot{margin-top:18px;font-size:.7rem;text-align:center;color:#6a4e2a}
.print{position:fixed;top:14px;right:14px;background:#7a5a34;color:#f3e6c8;border:0;padding:9px 14px;border-radius:6px;font-family:inherit;cursor:pointer}
</style></head><body>
<button class="print" onclick="window.print()">🖨️ Imprimer / PDF</button>
<div class="paper">
  <h1>Note d'Honoraires</h1>
  <div class="sub">Mémoire des soins et prestations médicales</div>
  <div class="gov">Cabinet Médical — Iron Wolf Company</div>
  <div class="pat"><span><b>Patient :</b> ${esc(nom)}</span><span><b>Date :</b> ${esc(_dateFR(Date.now()))}</span></div>
  <table><thead><tr><th>Prestation</th><th class="mt">Montant</th></tr></thead><tbody>${rows || '<tr><td>—</td><td class="mt">—</td></tr>'}</tbody></table>
  <div class="total"><span>TOTAL À RÉGLER : ${esc(totalAff)} $</span></div>
  ${data.paiement ? `<div class="pay">Règlement : ${esc(data.paiement)}</div>` : ''}
  ${data.notes ? `<div class="concl">${esc(data.notes)}</div>` : ''}
  <div class="sign">${esc(data.medecin || 'Dr. June McCall')},<br>praticien agréé — Cabinet médical de l'Iron Wolf Company</div>
  <div class="foot">Note à régler au cabinet. Merci de votre confiance.<br>Iron Wolf Company · Suivi médical</div>
</div>
</body></html>`;
}

// Sélecteur de membre de la Confrérie (réutilisé par l'acte de décès & la note d'honoraires).
async function _envoyerSelecteurMembre(interaction, selectId, intro) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
  await interaction.guild.members.fetch().catch(() => {});
  const role = interaction.guild.roles.cache.get(ROLE_CONFRERIE);
  const membres = role ? [...role.members.values()].filter(m => !m.user.bot) : [];
  if (!membres.length) { await interaction.editReply({ content: '⚠️ Aucun membre de la Confrérie trouvé (vérifie le rôle).' }).catch(() => {}); return false; }
  const options = membres.slice(0, 25).map(m => ({ label: m.displayName.slice(0, 100), value: m.id }));
  const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(selectId).setPlaceholder('Choisis un membre de la Confrérie').addOptions(options));
  await interaction.editReply({ content: `${intro}${membres.length > 25 ? ' *(25 premiers affichés)*' : ''} :`, components: [row] }).catch(() => {});
  return true;
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
      '• **📊 Bilan** — statistiques médicales de la Confrérie *(médecin & Direction)*.',
      '• **🆘 Demander un RDV** — besoin de soins ? Décris ton motif, le médecin te recontacte *(tout le monde)*.',
      '',
      '📄 **Documents officiels** *(médecin & Direction)* :',
      '• **⚰️ Acte de décès** — établir l\'acte officiel d\'un membre décédé.',
      '• **🧾 Note d\'honoraires** — facturer les soins prodigués à un membre.',
    ].join('\n'));
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('med_select').setLabel('Ouvrir un dossier').setEmoji('🩺').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('med_liste').setLabel('Vue d\'ensemble').setEmoji('📋').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('med_demandes').setLabel('Demandes en attente').setEmoji('📨').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('med_bilan').setLabel('Bilan').setEmoji('📊').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('med_demande::open').setLabel('Demander un RDV').setEmoji('🆘').setStyle(ButtonStyle.Success),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('med_deces::open').setLabel('Acte de décès').setEmoji('⚰️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('med_honos::open').setLabel('Note d\'honoraires').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
  );
  // Forum (type 15) → post épinglé ; sinon salon classique → message. Mise à jour EN PLACE si déjà présent.
  if (ch.type === 15 && ch.threads?.create) {
    const act = await ch.threads.fetchActive().catch(() => null);
    const existing = act?.threads ? [...act.threads.values()].find(t => (t.name || '').includes('SUIVI MÉDICAL')) : null;
    if (existing) { const st = await existing.fetchStarterMessage().catch(() => null); if (st) await st.edit({ embeds: [e], components: [row, row2] }).catch(() => {}); return; }
    const post = await ch.threads.create({ name: '🩺 SUIVI MÉDICAL', message: { embeds: [e], components: [row, row2] } }).catch(() => null);
    if (post?.pin) await post.pin().catch(() => {});
    return;
  }
  if (!ch.send) return;
  const existing = await ch.messages.fetch({ limit: 30 }).catch(() => null);
  const panel = existing ? [...existing.values()].find(m => m.author?.id === moi && m.components?.length && (m.embeds?.[0]?.title || '').includes('Suivi médical')) : null;
  if (panel) { await panel.edit({ embeds: [e], components: [row, row2] }).catch(() => {}); return; }
  await ch.send({ embeds: [e], components: [row, row2] }).catch(() => {});
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
      const ancienStatut = f.statut;
      f.statut = statut; f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      if (statut === 'apte') { f.reposJusquAt = null; f.reposMotif = null; } // rétabli → plus de convalescence
      _log(f, `Statut → ${STATUTS[statut].label}`, f.majPar); saveDB(db);
      await _afficherFiche(interaction, id, true); // accuse réception du bouton d'abord (évite « interaction a échoué »)
      await _alerteStatut(interaction.guild, id, f); // alerte si inapte / observation (dans le dossier du patient)
      await _notifierPatientStatut(interaction.guild, id, f, ancienStatut); // prévient le patient du changement
      await _rafraichirDossier(interaction.guild, id, f).catch(() => {}); // dossier vivant maintenu à jour
      saveDB(db); // persiste le fil du dossier (f.threadId) éventuellement créé
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
      await _rafraichirDossier(interaction.guild, id, f).catch(() => {});
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      await interaction.editReply({ content: '✅ Notes enregistrées.', embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
      return true;
    }

    // ── Ajouter un suivi de soin → journal de soins chronologique (n'affecte PAS le statut) ──
    if (interaction.isButton?.() && cid.startsWith('med_suivi::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const modal = new ModalBuilder().setCustomId(`med_suivi_modal::${id}`).setTitle('🩺 Suivi de soin');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('soin').setLabel('Soin / acte réalisé').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(500).setPlaceholder('ex : pansement changé, points retirés, désinfection de la plaie…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('etat').setLabel('État / évolution du patient').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400).setPlaceholder('ex : cicatrise bien, douleur en baisse, fièvre tombée…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('traitement').setLabel('Traitement / prescription (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setPlaceholder('ex : laudanum 2×/jour, repos 3 jours…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('suite').setLabel('Prochaine étape / suivi (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(150).setPlaceholder('ex : recontrôle dans 3 jours')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('date').setLabel('Date (vide = aujourd\'hui)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder('ex : 8 Septembre 1904')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_suivi_modal::')) {
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const soin = (interaction.fields.getTextInputValue('soin') || '').trim();
      const etat = (interaction.fields.getTextInputValue('etat') || '').trim();
      const traitement = (interaction.fields.getTextInputValue('traitement') || '').trim();
      const suite = (interaction.fields.getTextInputValue('suite') || '').trim();
      const dateSaisie = (interaction.fields.getTextInputValue('date') || '').trim();
      const par = interaction.member?.displayName || interaction.user.username;
      if (!soin) { await interaction.editReply({ content: '⚠️ Il faut au moins décrire le soin réalisé.' }).catch(() => {}); return true; }
      if (!f.suivis) f.suivis = [];
      f.suivis.push({ date: dateSaisie || _dateFR(Date.now()), at: Date.now(), soin, etat, traitement, suite, soignant: par });
      if (f.suivis.length > 20) f.suivis = f.suivis.slice(-20);
      f.majPar = par; f.majAt = Date.now();
      _log(f, `Suivi de soin ajouté : ${soin.slice(0, 80)}`, par);
      saveDB(db);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      // Le suivi s'AJOUTE au dossier existant du patient (fil unique).
      const embSuivi = new EmbedBuilder().setColor((STATUTS[f.statut] || STATUTS.non_teste).couleur)
        .setTitle('🩺 Suivi de soin')
        .setDescription(`Patient : ${gm ? `**${_clip(gm.displayName, 80)}**` : `<@${id}>`} · ${_clip(dateSaisie || _dateFR(Date.now()), 40)}`)
        .addFields(
          { name: 'Soin réalisé', value: _clip(soin, 900), inline: false },
          ...(etat ? [{ name: 'État / évolution', value: _clip(etat, 500), inline: false }] : []),
          ...(traitement ? [{ name: 'Traitement', value: _clip(traitement, 300), inline: true }] : []),
          ...(suite ? [{ name: 'Prochaine étape', value: _clip(suite, 200), inline: true }] : []),
          { name: 'Soignant', value: _clip(par, 60), inline: true },
        ).setFooter({ text: 'Iron Wolf Company · Suivi médical' }).setTimestamp();
      await _posterAuDossier(interaction.guild, id, f, embSuivi, '');
      saveDB(db); // persiste le fil du dossier (f.threadId)
      await interaction.editReply({ content: '✅ Suivi de soin enregistré.', embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
      return true;
    }

    // ── Archiver le dossier : le fil disparaît du forum, l'historique reste consultable ici ──
    if (interaction.isButton?.() && cid.startsWith('med_cloture::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const par = interaction.member?.displayName || interaction.user.username;
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      f.statut = 'apte'; f.clotureAt = Date.now(); f.majPar = par; f.majAt = Date.now();
      _log(f, '🗂️ Dossier clôturé (patient rétabli)', par);
      saveDB(db); // persiste le statut
      // On SUPPRIME le fil du forum (dans un forum, un fil archivé reste visible).
      // La fiche complète reste en base → rien de perdu, elle se recrée à la réouverture.
      const nb = await _supprimerFilsPatient(interaction.guild, id, gm);
      f.threadId = null; // le fil a disparu ; il sera recréé au besoin
      saveDB(db);
      await interaction.editReply({
        content: `🗂️ **Dossier clôturé.**${nb ? ` Le fil a été **retiré** du forum « suivi-médical ».` : ' *(aucun fil ouvert à retirer.)*'} Le patient est marqué **✅ Apte** et **tout l'historique reste consultable** en rouvrant son dossier ici. Le fil se recrée tout seul si une nouvelle blessure survient.`,
        embeds: [_embedFiche(f, gm)], components: _actions(id),
      }).catch(() => {});
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
      f.blessures.push({ date: _dateFR(Date.now()), at: Date.now(), desc, localisation, gravite: evalRes?.gravite || null, par });
      if (f.blessures.length > 20) f.blessures = f.blessures.slice(-20);
      // Mise à jour automatique du statut (l'IA fait la vérification)
      const ancien = f.statut;
      if (evalRes?.statut) f.statut = evalRes.statut;
      // Convalescence auto : si la blessure rend inapte / en observation, on fixe un repos estimé.
      if ((f.statut === 'inapte' || f.statut === 'observation') && evalRes) {
        const j = _convalescenceJours(evalRes.gravite);
        f.reposJusquAt = Date.now() + j * 86400000;
        f.reposMotif = `Repos ~${j} j après : ${desc.slice(0, 80)}`;
        f.reposNotifie = false;
      } else if (f.statut === 'apte') { f.reposJusquAt = null; f.reposMotif = null; }
      f.majPar = par; f.majAt = Date.now();
      const noteLigne = `🩹 ${_dateFR(Date.now())} — ${desc}${localisation ? ` (${localisation})` : ''}${evalRes ? ` → ${evalRes.gravite}, ${evalRes.recommandation}` : ""}`;
      f.notes = ((f.notes ? f.notes + '\n' : '') + noteLigne).slice(0, 1000);
      _log(f, `Blessure signalée${evalRes ? ` → ${STATUTS[f.statut]?.label || f.statut}` : ''}`, par);
      saveDB(db);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      // La déclaration s' AJOUTE au dossier existant du patient (fil unique) — plus de doublon.
      const embBless = new EmbedBuilder().setColor((STATUTS[f.statut] || STATUTS.non_teste).couleur)
        .setTitle('🩹 Blessure / soin déclaré')
        .setDescription(`Patient : ${gm ? `**${_clip(gm.displayName, 80)}**` : `<@${id}>`} · ${_dateFR(Date.now())}`)
        .addFields(
          { name: 'Ce qui s\'est passé', value: _clip(desc, 900), inline: false },
          ...(localisation ? [{ name: 'Localisation', value: _clip(localisation, 100), inline: true }] : []),
          ...(evalRes ? [{ name: 'Évaluation', value: `gravité **${_clip(evalRes.gravite, 40)}** · statut → **${STATUTS[f.statut]?.label || f.statut}**`, inline: false }, { name: '💊 Recommandation', value: _clip(evalRes.recommandation, 400), inline: false }] : []),
          { name: 'Déclaré par', value: _clip(par, 60), inline: true },
        ).setFooter({ text: 'Iron Wolf Company · Suivi médical' }).setTimestamp();
      await _posterAuDossier(interaction.guild, id, f, embBless, (f.statut === 'inapte' || f.statut === 'observation') ? `<@&${ROLE_MEDECIN}>` : '');
      saveDB(db); // persiste le fil du dossier (f.threadId)
      await _notifierPatientStatut(interaction.guild, id, f, ancien); // prévient le patient si son statut a changé
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
      const ancienApt = f.statut;
      f.statut = /inapte/i.test(input.verdict) ? 'inapte' : (/r[ée]serve/i.test(input.verdict) ? 'observation' : 'apte');
      if (f.statut === 'apte') { f.reposJusquAt = null; f.reposMotif = null; }
      f.testValide = true; f.testDate = Date.now();
      f.dernierTest = { input, r: r || null, at: Date.now(), par: interaction.member?.displayName || interaction.user.username }; // pour le certificat téléchargeable
      f.majPar = interaction.member?.displayName || interaction.user.username; f.majAt = Date.now();
      _log(f, `Test d'aptitude rédigé — ${input.verdict}`, f.majPar); saveDB(db);
      await _alerteStatut(interaction.guild, id, f); // alerte si le verdict rend inapte / en observation
      await _notifierPatientStatut(interaction.guild, id, f, ancienApt); // prévient le patient du verdict
      await interaction.editReply({ content: posted ? `✅ Test d'aptitude de **${input.patient}** rédigé et posté dans le forum. Statut → **${f.statut}**, test validé. Un certificat téléchargeable est dispo via 📜 sur la fiche.` : '⚠️ Test généré mais impossible de le poster (vérifie les permissions du bot sur le forum).' }).catch(() => {});
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

    // ── Convalescence : fixer / ajuster / lever un repos ──
    if (interaction.isButton?.() && cid.startsWith('med_repos::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const restant = f.reposJusquAt ? Math.max(0, Math.ceil((f.reposJusquAt - Date.now()) / 86400000)) : '';
      const modal = new ModalBuilder().setCustomId(`med_repos_modal::${id}`).setTitle('⏳ Convalescence');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('jours').setLabel('Durée de repos en jours (0 = lever)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setValue(String(restant)).setPlaceholder('ex : 3')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('motif').setLabel('Motif (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setValue(_clip(f.reposMotif || '', 120))),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_repos_modal::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const j = parseInt((interaction.fields.getTextInputValue('jours') || '').replace(/[^0-9]/g, ''), 10);
      const motif = (interaction.fields.getTextInputValue('motif') || '').trim();
      const par = interaction.member?.displayName || interaction.user.username;
      if (!Number.isFinite(j) || j <= 0) {
        f.reposJusquAt = null; f.reposMotif = null; f.reposNotifie = false;
        _log(f, 'Convalescence levée', par);
      } else {
        f.reposJusquAt = Date.now() + j * 86400000; f.reposMotif = motif || `Repos ${j} j`; f.reposNotifie = false;
        if (f.statut === 'apte' || f.statut === 'non_teste') f.statut = 'observation'; // en repos → au moins « en observation »
        _log(f, `Convalescence fixée : ${j} j (jusqu'au ${_dateFR(f.reposJusquAt)})`, par);
      }
      f.majPar = par; f.majAt = Date.now(); saveDB(db);
      await _rafraichirDossier(interaction.guild, id, f).catch(() => {});
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      await interaction.editReply({ content: f.reposJusquAt ? `⏳ Convalescence fixée jusqu'au **${_dateFR(f.reposJusquAt)}**. Le patient repassera **apte** automatiquement à la fin.` : '✅ Convalescence levée.', embeds: [_embedFiche(f, gm)], components: _actions(id) }).catch(() => {});
      return true;
    }

    // ── Certificat d'aptitude téléchargeable (HTML imprimable → PDF) ──
    if (interaction.isButton?.() && cid.startsWith('med_cert::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const f = _fiche(db, id);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const html = _certificatHTML(f, gm);
      if (!html) { await interaction.editReply({ content: '📜 Aucun test d\'aptitude enregistré pour ce membre. Rédige d\'abord le test (bouton 🧪 « Rédiger le test d\'aptitude »), puis reviens générer le certificat.' }).catch(() => {}); return true; }
      const nom = (gm?.displayName || f.dernierTest?.input?.patient || 'patient').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'patient';
      const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `certificat-aptitude-${nom}.html` });
      await interaction.editReply({ content: `📜 **Certificat d'aptitude** de ${gm ? `**${_clip(gm.displayName, 60)}**` : 'ce membre'} — télécharge le fichier, ouvre-le dans un navigateur, puis clique **🖨️ Imprimer / PDF**.`, files: [file] }).catch(() => {});
      return true;
    }

    // ── 📖 Dossier médical complet (parchemin téléchargeable) ──
    if (interaction.isButton?.() && cid.startsWith('med_dossier::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const html = _dossierMedicalHTML(f, gm);
      const nom = (gm?.displayName || 'patient').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'patient';
      const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `dossier-medical-${nom}.html` });
      await interaction.editReply({ content: `📖 **Dossier médical complet** de ${gm ? `**${_clip(gm.displayName, 60)}**` : 'ce patient'} — blessures, soins, ordonnances, aptitude et notes consolidés. Télécharge, ouvre dans un navigateur, puis **🖨️ Imprimer / PDF**.`, files: [file] }).catch(() => {});
      return true;
    }

    // ── 📋 Historique médical complet ──
    if (interaction.isButton?.() && cid.startsWith('med_histo::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const hist = Array.isArray(f.historique) ? f.historique : [];
      const e = new EmbedBuilder().setColor(0x8B5A2A).setTitle(`🕓 Historique médical — ${gm ? _clip(gm.displayName, 60) : id}`);
      if (!hist.length) e.setDescription('*Aucun événement enregistré pour ce dossier.*');
      else e.setDescription(_clip(hist.slice().reverse().map(h => `• \`${_clip(h.date, 40)}\` ${_clip(h.action, 150)}${h.par ? ` — *${_clip(h.par, 60)}*` : ''}`).join('\n'), 4000));
      e.setFooter({ text: `${hist.length} événement(s) · Suivi médical confidentiel` });
      await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // ── 💊 Ordonnance → choix d'un remède d'époque (pré-remplissage) ou rédaction libre ──
    if (interaction.isButton?.() && cid.startsWith('med_ordo::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const options = [
        { label: 'Rédaction libre', value: 'libre', emoji: '✍️', description: "Ordonnance vierge, à remplir soi-même" },
        ...Object.entries(REMEDES).map(([k, r]) => ({ label: r.label.slice(0, 100), value: k, emoji: r.emoji, description: _clip(r.desc, 100) })),
      ];
      const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`med_ordo_pick::${id}`).setPlaceholder('Choisis un remède d\'époque (ou rédaction libre)').addOptions(options));
      await interaction.reply({ content: '💊 **Ordonnance** — choisis un remède pré-rempli (modifiable ensuite) ou pars d\'une page blanche :', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Remède choisi → ouvre le formulaire, éventuellement pré-rempli.
    if (interaction.isStringSelectMenu?.() && cid.startsWith('med_ordo_pick::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = cid.split('::')[1];
      const choix = interaction.values?.[0];
      const preset = (choix && choix !== 'libre') ? REMEDES[choix] : null;
      await interaction.showModal(_ordoModal(id, preset)).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_ordo_modal::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const gv = k => (interaction.fields.getTextInputValue(k) || '').trim();
      const data = { medicaments: gv('medicaments'), posologie: gv('posologie'), duree: gv('duree'), conseils: gv('conseils'), medecin: interaction.member?.displayName || 'Dr. June McCall' };
      const html = _ordonnanceHTML(f, gm, data);
      const nom = (gm?.displayName || 'patient').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'patient';
      const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `ordonnance-${nom}.html` });
      if (!f.ordonnances) f.ordonnances = [];
      f.ordonnances.push({ date: _dateFR(Date.now()), at: Date.now(), medicaments: data.medicaments, posologie: data.posologie, duree: data.duree, conseils: data.conseils, medecin: data.medecin });
      if (f.ordonnances.length > 20) f.ordonnances = f.ordonnances.slice(-20);
      _log(f, `Ordonnance : ${_clip(data.medicaments, 60)}${data.posologie ? ` (${_clip(data.posologie, 40)})` : ''}`, interaction.member?.displayName);
      saveDB(db);
      await _rafraichirDossier(interaction.guild, id, f).catch(() => {});
      await interaction.editReply({ content: `💊 **Ordonnance** pour ${gm ? `**${_clip(gm.displayName, 60)}**` : 'ce patient'} — télécharge le fichier, ouvre-le dans un navigateur, puis **🖨️ Imprimer / PDF**.`, files: [file] }).catch(() => {});
      return true;
    }

    // ── Bilan médical (statistiques) ──
    if (interaction.isButton?.() && cid === 'med_bilan') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.reply({ embeds: [_bilanEmbed(loadDB())], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // ── ⚰️ Acte de décès : sélection du membre → formulaire → parchemin ──
    if (interaction.isButton?.() && cid === 'med_deces::open') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await _envoyerSelecteurMembre(interaction, 'med_deces_pick', '⚰️ **Acte de décès** — pour quel membre ?');
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid === 'med_deces_pick') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = interaction.values?.[0]; if (!id) return true;
      const modal = new ModalBuilder().setCustomId(`med_deces_modal::${id}`).setTitle('⚰️ Acte de décès').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('dateLieu').setLabel('Date et lieu du décès').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(120).setPlaceholder('ex : 14 Septembre 1904 — Blackwater')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cause').setLabel('Cause du décès').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(150).setPlaceholder('ex : blessure par balle · maladie · vieillesse')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('circonstances').setLabel('Circonstances').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Récit bref des circonstances (facultatif)')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('temoin').setLabel('Déclarant / témoin').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('inhumation').setLabel('Lieu de sépulture').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_deces_modal::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const gv = k => (interaction.fields.getTextInputValue(k) || '').trim();
      const data = { dateLieu: gv('dateLieu'), cause: gv('cause'), circonstances: gv('circonstances'), temoin: gv('temoin'), inhumation: gv('inhumation'), medecin: interaction.member?.displayName || 'Dr. June McCall' };
      const html = _acteDecesHTML(f, gm, data);
      const nom = (gm?.displayName || 'defunt').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'defunt';
      const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `acte-deces-${nom}.html` });
      _log(f, `⚰️ Acte de décès établi — ${_clip(data.cause, 60)} (${_clip(data.dateLieu, 40)})`, data.medecin);
      saveDB(db);
      try {
        const e = new EmbedBuilder().setColor(0x3a2c1c).setTitle('⚰️ Acte de décès établi')
          .setDescription(`Le décès de ${gm ? `**${_clip(gm.displayName, 80)}**` : `<@${id}>`} a été constaté.`)
          .addFields(
            { name: '📅 Date & lieu', value: _clip(data.dateLieu || '—', 200), inline: false },
            { name: '⚰️ Cause', value: _clip(data.cause || '—', 200), inline: false },
          ).setFooter({ text: 'Iron Wolf Company · Suivi médical' }).setTimestamp();
        await _posterAuDossier(interaction.guild, id, f, e, `<@&${ROLE_MEDECIN}>`);
        await _rafraichirDossier(interaction.guild, id, f).catch(() => {});
      } catch {}
      await interaction.editReply({ content: `⚰️ **Acte de décès** de ${gm ? `**${_clip(gm.displayName, 60)}**` : 'ce membre'} — télécharge le fichier, ouvre-le dans un navigateur, puis **🖨️ Imprimer / PDF**.`, files: [file] }).catch(() => {});
      return true;
    }

    // ── 🧾 Note d'honoraires : sélection du membre → formulaire → parchemin ──
    if (interaction.isButton?.() && cid === 'med_honos::open') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé au médecin et à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await _envoyerSelecteurMembre(interaction, 'med_honos_pick', '🧾 **Note d\'honoraires** — pour quel patient ?');
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid === 'med_honos_pick') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const id = interaction.values?.[0]; if (!id) return true;
      const modal = new ModalBuilder().setCustomId(`med_honos_modal::${id}`).setTitle('🧾 Note d\'honoraires').addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prestations').setLabel('Prestations (une par ligne : soin — prix)').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(600).setPlaceholder('Consultation — 5\nExtraction de balle — 20\nOnguent — 3')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('total').setLabel('Montant total ($) — vide = calcul auto').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(20).setPlaceholder('ex : 28')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('paiement').setLabel('Règlement').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80).setPlaceholder('ex : réglé comptant · à crédit · acompte de 10 $')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes / mentions').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('med_honos_modal::')) {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const id = cid.split('::')[1];
      const db = loadDB(); const f = _fiche(db, id);
      const gm = await interaction.guild.members.fetch(id).catch(() => null);
      const gv = k => (interaction.fields.getTextInputValue(k) || '').trim();
      const data = { prestations: gv('prestations'), total: gv('total'), paiement: gv('paiement'), notes: gv('notes'), medecin: interaction.member?.displayName || 'Dr. June McCall' };
      const html = _honorairesHTML(f, gm, data);
      const totalCalc = (data.total && data.total.trim()) ? data.total.trim() : (_parseHonoLignes(data.prestations).total.toFixed(2).replace(/\.00$/, '') + ' $');
      const nom = (gm?.displayName || 'patient').replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'patient';
      const file = new AttachmentBuilder(Buffer.from(html, 'utf8'), { name: `note-honoraires-${nom}.html` });
      _log(f, `🧾 Note d'honoraires établie — total ${_clip(totalCalc, 30)}`, data.medecin);
      saveDB(db);
      await interaction.editReply({ content: `🧾 **Note d'honoraires** de ${gm ? `**${_clip(gm.displayName, 60)}**` : 'ce patient'} — télécharge le fichier, ouvre-le dans un navigateur, puis **🖨️ Imprimer / PDF**.`, files: [file] }).catch(() => {});
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

// Rafraîchit le fil de forum d'UN dossier (après une modif venue du site).
async function rafraichirDossierWeb(guild, id) {
  try {
    const db = loadDB();
    const f = db.suiviMedical && db.suiviMedical[String(id)];
    if (!f) return false;
    return await _rafraichirDossier(guild, String(id), f);
  } catch { return false; }
}

// ═══════════════════════════════════════════════════════════════
//  IMPORT : reconstruit les dossiers médicaux à partir des fils du salon
//  (forum = un fil par patient). Récupère les dossiers de June « perdus »
//  (pas dans db.suiviMedical) sans rien inventer : nom + statut depuis le
//  titre du fil, détail (résumé, blessures, ordonnances) extrait par l'IA
//  du contenu réel du fil. Additif : ne SUPPRIME rien, ne fait que compléter.
// ═══════════════════════════════════════════════════════════════
async function _iaDossier(nom, corpus) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-sonnet-5', max_tokens: 700,
        system: "Tu lis le dossier médical d'un patient (compagnie de l'Ouest, RDR2). Extrais UNIQUEMENT ce qui est écrit, sans rien inventer. Réponds en JSON compact et RIEN d'autre : {\"resume\":\"synthèse en 1-3 phrases\",\"blessures\":[{\"desc\":\"\",\"gravite\":\"\"}],\"ordonnances\":[{\"medicaments\":\"\",\"posologie\":\"\"}]}. Listes vides si rien n'est mentionné.",
        messages: [{ role: 'user', content: `PATIENT : ${nom}\n\nCONTENU DU DOSSIER :\n${corpus}\n\nDonne le JSON.` }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    const txt = (data?.content || []).filter(c => c.type === 'text').map(c => c.text).join('');
    const m = txt.match(/\{[\s\S]*\}/);
    return m ? JSON.parse(m[0]) : null;
  } catch { return null; }
}

const _STAT_EMOJI = { '✅': 'apte', '⚠️': 'observation', '❌': 'inapte', '🩺': 'non_teste', '⏳': 'non_teste' };

async function importerDossiersDuSalon(guild) {
  const ch = _ch(guild, MEDICAL_CHANNEL);
  if (!ch) return { ok: false, message: 'Salon médical introuvable.' };
  if (ch.type !== 15) return { ok: false, message: "Le salon médical n'est pas un forum : import automatique impossible." };
  // Tous les fils (actifs + archivés).
  const fils = [];
  try { const a = await ch.threads.fetchActive().catch(() => null); if (a?.threads) fils.push(...a.threads.values()); } catch {}
  try {
    let before;
    for (let i = 0; i < 15; i++) {
      const arc = await ch.threads.fetchArchived({ limit: 100, before }).catch(() => null);
      if (!arc?.threads?.size) break;
      const arr = [...arc.threads.values()];
      fils.push(...arr);
      before = arr[arr.length - 1]?.id;
      if (!arc.hasMore) break;
    }
  } catch {}
  const vus = new Set();
  const uniques = fils.filter(t => { if (vus.has(t.id)) return false; vus.add(t.id); return true; });

  const db = loadDB();
  if (!db.suiviMedical) db.suiviMedical = {};
  let cree = 0, complete = 0;
  for (const t of uniques) {
    try {
      const nom0 = String(t.name || '');
      const tag = nom0.match(/\[(\d{5,25})\]/);
      const emoji = Object.keys(_STAT_EMOJI).find(e => nom0.startsWith(e));
      const statut = _STAT_EMOJI[emoji] || 'non_teste';
      const nomRP = nom0.replace(/\[[^\]]*\]/g, '').replace(/^[^\p{L}]+/u, '').trim().slice(0, 120) || 'Patient';
      const key = tag ? tag[1] : ('med-' + t.id);
      const dejaLa = !!db.suiviMedical[key];

      // Corpus = message d'ouverture + jusqu'à 30 messages du fil.
      let corpus = '';
      const push = (msg) => { if (!msg) return; if (msg.content) corpus += '\n' + msg.content; (msg.embeds || []).forEach(e => { corpus += '\n' + (e.title || '') + '\n' + (e.description || '') + '\n' + (e.fields || []).map(f => `${f.name}: ${f.value}`).join('\n'); }); };
      push(await t.fetchStarterMessage().catch(() => null));
      try { const msgs = await t.messages.fetch({ limit: 30 }).catch(() => null); if (msgs) [...msgs.values()].reverse().forEach(push); } catch {}
      corpus = corpus.trim().slice(0, 5000);

      const f = db.suiviMedical[key] || { statut: 'non_teste', testValide: false, testDate: null, prochainRdv: null, notes: '', historique: [], blessures: [], ordonnances: [], suivis: [] };
      if (!f.nomRP) f.nomRP = nomRP;
      if (!f.statut || f.statut === 'non_teste') f.statut = statut;
      if (!f.threadId) f.threadId = t.id;

      if (corpus.length > 20) {
        const ex = await _iaDossier(nomRP, corpus);
        if (ex) {
          if ((!f.notes || !f.notes.trim()) && ex.resume) f.notes = String(ex.resume).slice(0, 2000);
          if ((!f.blessures || !f.blessures.length) && Array.isArray(ex.blessures)) f.blessures = ex.blessures.filter(b => b && b.desc).slice(0, 15).map(b => ({ date: _dateFR(Date.now()), desc: String(b.desc).slice(0, 200), gravite: String(b.gravite || '').slice(0, 40) }));
          if ((!f.ordonnances || !f.ordonnances.length) && Array.isArray(ex.ordonnances)) f.ordonnances = ex.ordonnances.filter(o => o && o.medicaments).slice(0, 15).map(o => ({ date: _dateFR(Date.now()), medicaments: String(o.medicaments).slice(0, 200), posologie: String(o.posologie || '').slice(0, 200) }));
        }
      }

      if (!dejaLa) { _log(f, 'Dossier importé du salon médical', 'Import'); db.suiviMedical[key] = f; cree++; }
      else { complete++; }
    } catch {}
  }
  saveDB(db);
  return { ok: true, message: `Import terminé : ${cree} nouveau(x) dossier(s), ${complete} déjà présent(s) complété(s) · ${uniques.length} fils scannés.`, cree, complete, scannes: uniques.length };
}

module.exports = { installerPanel, installerExemple, installerPanelDemande, installerDossiers, routeInteraction, checkRappelsMedicaux, rafraichirDossierWeb, importerDossiersDuSalon, MEDICAL_CHANNEL, ROLE_MEDECIN, _test: { _dossierThread, _posterAuDossier, _archiverFilsPatient, _supprimerFilsPatient } };
module.exports.__test = { _convalescenceJours, _bilanEmbed, _certificatHTML, _embedFiche, _dureeJours, _parseHonoLignes, _acteDecesHTML, _honorairesHTML, _ordonnanceHTML, _ordoModal, REMEDES, _nomFil }; // tests uniquement
