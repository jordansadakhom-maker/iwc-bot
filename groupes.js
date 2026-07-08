// ───────────────────────────────────────────────────────────────────────────
//  groupes.js — Registre des GROUPES / BANDES (renseignement sur les autres organisations)
//  ----------------------------------------------------------------------------
//   • Fiche chaque groupe/bande croisé : nom, meneur, territoire, effectif,
//     renseignements, avec une CATÉGORIE (🔴 Recherché, ⚔️ Ennemi, 🥊 Rival,
//     👁️ Sous surveillance, ⚪ Neutre, 🤝 Allié) et une DANGEROSITÉ.
//   • Panneau + boutons (aucune commande slash — 100/100 atteint). Direction.
//   • Persisté en base (db.registreGroupes) + sauvegarde Gist. Préfixe grp_ :
//     n'écrit RIEN ailleurs.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const SALON_GROUPES = '1517323132317466634';
const DIRECTION = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estGestion(member) { try { return !!member?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n))); } catch { return false; } }

const COULEUR = 0x6B4C2E;
// Catégories : clé → { label, emoji, couleur }
//   • wanted  → fiche présentée comme un AVIS DE RECHERCHE (poster : prime, consigne, dangerosité).
//   • autres  → fiche de renseignement détaillée classique.
const CATS = {
  wanted:       { label: 'Wanted',           emoji: '💰', couleur: 0x8E1B1B },
  recherche:    { label: 'Recherché',        emoji: '🔴', couleur: 0xC0392B },
  ennemi:       { label: 'Ennemi',           emoji: '⚔️', couleur: 0xE67E22 },
  rival:        { label: 'Rival',            emoji: '🥊', couleur: 0xD35400 },
  surveillance: { label: 'Sous surveillance', emoji: '👁️', couleur: 0xF1C40F },
  neutre:       { label: 'Neutre',           emoji: '⚪', couleur: 0x95A5A6 },
  allie:        { label: 'Allié',            emoji: '🤝', couleur: 0x2ECC71 },
};
const CAT_ORDER = ['wanted', 'recherche', 'ennemi', 'rival', 'surveillance', 'neutre', 'allie'];
const DNG = {
  faible:   { label: 'Faible',   emoji: '🟢' },
  moyenne:  { label: 'Moyenne',  emoji: '🟡' },
  elevee:   { label: 'Élevée',   emoji: '🟠' },
  critique: { label: 'Critique', emoji: '🔴' },
};
const DNG_ORDER = ['faible', 'moyenne', 'elevee', 'critique'];

function _catInfo(k) { return CATS[k] || { label: 'Non classé', emoji: '❔', couleur: COULEUR }; }
function _dngInfo(k) { return DNG[k] || null; }

// ─── Analyse d'une photo de groupe par l'IA (renseignement détaillé, façon « wanted ») ───
const PROMPT_GROUPE = `Tu es un officier du renseignement d'une organisation dans un jeu vidéo Far West (RedM / Red Dead Redemption 2). On te montre UNE ou PLUSIEURS captures d'écran d'un MEME GROUPE ou d'une MEME BANDE (une ou plusieurs personnes, parfois une banniere, un campement, une scene) — utilise-les TOUTES ensemble. Personnages fictifs de jeu.
Observe l'image avec minutie et dresse un RENSEIGNEMENT DETAILLE et FACTUEL permettant d'identifier et de jauger ce groupe. Note les COULEURS PRECISES (pas "sombre" mais "brun foncé", "bordeaux"...), les armes visibles, les signes communs (foulards de couleur, insignes, marques). N'invente rien : si un element n'est pas visible, mets "Non visible".
Reponds UNIQUEMENT avec un objet JSON valide, sans texte ni balise autour, au format EXACT :
{"nom":"nom probable du groupe si une banniere/enseigne/indice le donne, sinon Non visible","effectif":"nombre de personnes visibles et leur allure generale","tenues":"style vestimentaire commun et couleurs recurrentes precises, matieres","armement":"armes visibles (types precis) et comment elles sont portees, sinon Aucune visible","signes":"insignes, bannieres, foulards de couleur, marques ou elements distinctifs communs au groupe, sinon Aucun visible","montures":"chevaux/attelages visibles : robes, equipement, sinon Non visible","lieu":"decor, lieu probable, moment de la journee, sinon Non visible","activite":"ce que le groupe semble faire (embuscade, campement, patrouille, transaction...), sinon Non visible","trait_distinctif":"LE signe le plus reconnaissable de ce groupe","dangerosite":"faible|moyenne|elevee|critique","resume":"2 a 3 phrases de synthese, facon rapport de renseignement"}
Ecris en francais, riche et precis.`;

async function _imageBytes(url) { try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; } }
async function _callVisionGroupe(model, imgs, indice) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const hint = (indice && indice.trim()) ? `\n\nINDICATION : le groupe se nomme peut-etre « ${indice.trim()} ».` : '';
    const content = imgs.map(im => ({ type: 'image', source: { type: 'base64', media_type: im.mt || 'image/png', data: im.b64 } }));
    content.push({ type: 'text', text: PROMPT_GROUPE + hint });
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1400, messages: [{ role: 'user', content }] }),
    });
    if (!resp.ok) { if ([401, 402, 429].includes(resp.status)) { try { global.signalerPanneIA?.('analyse de groupe (photo)', resp.status); } catch {} } return null; }
    const data = await resp.json();
    return (data?.content?.[0]?.text || '');
  } catch { return null; }
}
function _parseG(txt) { if (!txt) return null; txt = String(txt).trim().replace(/```json/gi, '').replace(/```/g, '').trim(); const m = txt.match(/\{[\s\S]*\}/); if (!m) return null; try { const o = JSON.parse(m[0]); return (o && typeof o === 'object') ? o : null; } catch { return null; } }
async function _analyserGroupePhoto(imgs, indice) { let t = await _callVisionGroupe('claude-sonnet-4-6', imgs, indice); if (!t) t = await _callVisionGroupe('claude-haiku-4-5-20251001', imgs, indice); return _parseG(t); }
function _okv(v) { return v && !/^(non visible|aucune? visible|aucun visible|non applicable|n\/a|neant|néant)$/i.test(String(v).trim()); }
function _mapDng(v) { const k = _norm(v).replace(/s$/, ''); if (/critiq|extrem/.test(k)) return 'critique'; if (/elev/.test(k)) return 'elevee'; if (/moyen/.test(k)) return 'moyenne'; if (/faibl/.test(k)) return 'faible'; return null; }
function _photoDescTexte(s) {
  const parts = [];
  if (_okv(s.effectif)) parts.push('👥 Effectif : ' + s.effectif);
  if (_okv(s.tenues)) parts.push('👔 Tenues : ' + s.tenues);
  if (_okv(s.armement)) parts.push('🔫 Armement : ' + s.armement);
  if (_okv(s.signes)) parts.push('🎗️ Signes : ' + s.signes);
  if (_okv(s.montures)) parts.push('🐎 Montures : ' + s.montures);
  if (_okv(s.activite)) parts.push('🎯 Activité : ' + s.activite);
  if (_okv(s.trait_distinctif)) parts.push('⭐ Signe distinctif : ' + s.trait_distinctif);
  let t = parts.join('\n');
  if (s.resume && _okv(s.resume)) t = (t ? t + '\n\n' : '') + '📝 ' + s.resume;
  return t.slice(0, 1024);
}

function _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _clip(v, n) { return String(v == null ? '' : v).slice(0, n); }
function _norm(x) { return (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim(); }

function _ensure(db) {
  if (!db.registreGroupes || typeof db.registreGroupes !== 'object') db.registreGroupes = {};
  const r = db.registreGroupes;
  if (!Array.isArray(r.groupes)) r.groupes = [];
  if (!r.drafts || typeof r.drafts !== 'object') r.drafts = {};
  return r;
}

// ─── Recherche tolérante ───
function _filtreGroupes(groupes, terme) {
  const t = _norm(terme);
  if (!t) return groupes.slice();
  const mots = t.split(' ').filter(Boolean);
  return groupes.filter(g => {
    const foin = _norm([g.nom, g.meneur, g.territoire, g.effectif, g.notes, _catInfo(g.categorie).label].join(' '));
    return mots.every(m => foin.includes(m));
  });
}

// ─── Panneau ───
function _panelEmbed(r) {
  const gs = r.groupes || [];
  const e = new EmbedBuilder().setColor(COULEUR).setTitle('🗂️ REGISTRE DES GROUPES')
    .setDescription('*Renseignements sur les autres bandes et organisations du territoire.*');
  const parCat = {};
  for (const g of gs) parCat[g.categorie] = (parCat[g.categorie] || 0) + 1;
  const lignes = CAT_ORDER.filter(k => parCat[k]).map(k => `${CATS[k].emoji} **${CATS[k].label}** — ${parCat[k]}`);
  if (gs.length) e.addFields({ name: `📊 ${gs.length} groupe(s) fiché(s)`, value: lignes.join('\n') || '—', inline: false });
  else e.addFields({ name: '— Registre vide —', value: 'Clique **➕ Ficher un groupe** pour ajouter le premier.', inline: false });
  e.setFooter({ text: 'Direction · renseignement — Iron Wolf Company / La Confrérie' }).setTimestamp();
  return e;
}
function _panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('grp_add').setLabel('Ficher un groupe').setEmoji('➕').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('grp_photo').setLabel('Par photo (IA)').setEmoji('📸').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('grp_search').setLabel('Rechercher').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('grp_list').setLabel('Voir tous').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('grp_del').setLabel('Retirer').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('grp_filter::wanted').setLabel('Wanted').setEmoji('💰').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('grp_filter::recherche').setLabel('Recherchés').setEmoji('🔴').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('grp_filter::ennemi').setLabel('Ennemis').setEmoji('⚔️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('grp_filter::surveillance').setLabel('Surveillance').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('grp_filter::allie').setLabel('Alliés').setEmoji('🤝').setStyle(ButtonStyle.Success),
    ),
  ];
}

// ─── Affiche par catégorie : chaque catégorie a sa bannière et son ton ───
const BANNERS = {
  wanted:       { titre: 'AVIS DE RECHERCHE', tagline: '☠️ *Groupe recherché. Toute information menant à sa localisation ou sa capture est récompensée.*' },
  recherche:    { titre: 'RECHERCHÉ',         tagline: '🔍 *Groupe activement recherché — signalez toute information utile.*' },
  ennemi:       { titre: 'GROUPE ENNEMI',     tagline: '⚔️ *Hostile déclaré — prudence maximale sur le terrain.*' },
  rival:        { titre: 'GROUPE RIVAL',      tagline: '🥊 *Concurrent sur le territoire — à surveiller de près.*' },
  surveillance: { titre: 'SOUS SURVEILLANCE', tagline: '👁️ *Sous observation — renseignements en cours de collecte.*' },
  neutre:       { titre: 'GROUPE NEUTRE',     tagline: '⚪ *Sans hostilité connue à ce jour.*' },
  allie:        { titre: 'GROUPE ALLIÉ',      tagline: '🤝 *Partenaire de confiance sur le territoire.*' },
};
// Ne garde que les champs IA réellement visibles (issus de l'analyse photo).
function _cleanIA(s) {
  const out = {};
  if (!s || typeof s !== 'object') return out;
  for (const k of ['effectif', 'tenues', 'armement', 'signes', 'montures', 'lieu', 'activite', 'trait_distinctif', 'resume']) {
    if (_okv(s[k])) out[k] = String(s[k]).slice(0, 1024);
  }
  return out;
}

// ─── L'AFFICHE : même style que le wanted, adaptée à la catégorie sélectionnée, avec les détails IA répartis ───
function _afficheEmbed(g) {
  const c = _catInfo(g.categorie);
  const b = BANNERS[g.categorie] || { titre: 'FICHE GROUPE', tagline: '' };
  const d = _dngInfo(g.dangerosite);
  const ia = g.ia && typeof g.ia === 'object' ? g.ia : {};
  const wanted = g.categorie === 'wanted';
  const e = new EmbedBuilder().setColor(c.couleur).setTitle(`${c.emoji} ${b.titre} — ${_clip(g.nom, 180)}`);
  if (b.tagline) e.setDescription(b.tagline);
  // En-tête : le wanted met prime/consigne ; les autres mettent la dangerosité en avant.
  if (wanted) {
    e.addFields(
      { name: '💰 Prime', value: _clip(g.prime || '—', 100), inline: true },
      { name: '⚠️ Dangerosité', value: d ? `${d.emoji} ${d.label}` : '—', inline: true },
      { name: '🎯 Consigne', value: _clip(g.consigne || 'Indifférent', 100), inline: true },
    );
    if (g.commanditaire) e.addFields({ name: '🧾 Commanditaire', value: _clip(g.commanditaire, 200), inline: true });
  } else if (d) {
    e.addFields({ name: '⚠️ Dangerosité', value: `${d.emoji} ${d.label}`, inline: true });
  }
  if (g.meneur) e.addFields({ name: '👤 Meneur / chef', value: _clip(g.meneur, 300), inline: true });
  const lieu = g.territoire || ia.lieu;
  if (lieu) e.addFields({ name: wanted ? '📍 Dernière position / secteur' : '📍 Territoire / secteur', value: _clip(lieu, 300), inline: true });
  const effectif = g.effectif || ia.effectif;
  if (effectif) e.addFields({ name: '👥 Effectif & allure', value: _clip(effectif, 500), inline: false });
  // Détails IA répartis, chacun dans son champ.
  if (ia.tenues)   e.addFields({ name: '👔 Tenues / couleurs', value: _clip(ia.tenues, 500), inline: true });
  if (ia.armement) e.addFields({ name: '🔫 Armement', value: _clip(ia.armement, 500), inline: true });
  if (ia.signes)   e.addFields({ name: '🎗️ Signes / insignes', value: _clip(ia.signes, 500), inline: true });
  if (ia.montures) e.addFields({ name: '🐎 Montures', value: _clip(ia.montures, 400), inline: true });
  if (ia.activite) e.addFields({ name: '🎯 Activité observée', value: _clip(ia.activite, 400), inline: true });
  if (ia.trait_distinctif) e.addFields({ name: '⭐ Signe le plus reconnaissable', value: _clip(ia.trait_distinctif, 256), inline: false });
  // Renseignements : résumé IA si l'analyse a servi, sinon les notes manuelles.
  const rens = ia.resume || (!g.ia ? g.notes : '');
  if (rens) e.addFields({ name: '📝 Renseignements', value: _clip(rens, 1024), inline: false });
  if (g.photo) e.setImage(g.photo);
  e.setFooter({ text: `${wanted ? 'Avis' : 'Fiche'} ${g.id}${g.par ? ` · ${wanted ? 'établi' : 'établie'} par ${g.par}` : ''}` }).setTimestamp(g.createdAt || Date.now());
  return e;
}

// Fiche définitive = l'affiche (utilisée à l'enregistrement et pour « voir une fiche »).
function _ficheEmbed(g) { return _afficheEmbed(g); }

// Aperçu d'un brouillon pendant le classement : dès qu'une catégorie est choisie → l'affiche correspondante.
function _previewEmbed(draft) {
  if (draft.categorie) return _afficheEmbed(draft);
  // Catégorie pas encore choisie : aperçu neutre de ce que l'IA / la saisie a déjà rempli.
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(`🕵️ ${_clip(draft.nom, 200)}`)
    .setDescription('*(choisis une catégorie pour générer l\'affiche)*');
  if (draft.territoire) e.addFields({ name: '📍 Territoire / secteur', value: _clip(draft.territoire, 300), inline: true });
  if (draft.effectif) e.addFields({ name: '👥 Effectif & allure', value: _clip(draft.effectif, 500), inline: false });
  if (draft.notes) e.addFields({ name: '📝 Renseignements', value: _clip(draft.notes, 1024), inline: false });
  if (draft.photo) e.setImage(draft.photo);
  return e;
}
function _classementPayload(draft) {
  const p = { content: _classementContenu(draft), components: _classementRows(draft) };
  if (draft.photo || draft.notes || draft.effectif || draft.categorie) p.embeds = [_previewEmbed(draft)];
  return p;
}

// Liste (embed + menu de sélection pour voir une fiche)
function _listePayload(groupes, titre) {
  const gs = groupes.slice(0, 25);
  if (!gs.length) return { content: 'Aucun groupe fiché ici pour le moment.', flags: MessageFlags.Ephemeral };
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(titre || '📋 Groupes fichés')
    .setDescription(gs.map(g => { const c = _catInfo(g.categorie); return `${c.emoji} **${_clip(g.nom, 80)}**${g.territoire ? ` — ${_clip(g.territoire, 40)}` : ''}${g.meneur ? ` · 👤 ${_clip(g.meneur, 40)}` : ''}`; }).join('\n').slice(0, 3800))
    .setFooter({ text: `${groupes.length} groupe(s)` });
  const sel = new StringSelectMenuBuilder().setCustomId('grp_voir').setPlaceholder('Voir la fiche d\'un groupe…')
    .addOptions(gs.map(g => ({ label: _clip(g.nom, 90) || 'Sans nom', description: _clip(_catInfo(g.categorie).label + (g.territoire ? ' · ' + g.territoire : ''), 90), value: g.id, emoji: _catInfo(g.categorie).emoji })));
  return { embeds: [e], components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral };
}

// Selects de classement (catégorie + dangerosité) + bouton enregistrer, pour un brouillon.
// Si la catégorie choisie est « wanted », on ajoute un bouton pour fixer prime / consigne / commanditaire.
function _classementRows(draft) {
  const selCat = new StringSelectMenuBuilder().setCustomId('grp_selcat').setPlaceholder(draft.categorie ? `Catégorie : ${_catInfo(draft.categorie).label}` : '① Catégorie du groupe')
    .addOptions(CAT_ORDER.map(k => ({ label: CATS[k].label, value: k, emoji: CATS[k].emoji, default: draft.categorie === k })));
  const selDng = new StringSelectMenuBuilder().setCustomId('grp_seldng').setPlaceholder(draft.dangerosite ? `Dangerosité : ${_dngInfo(draft.dangerosite).label}` : '② Dangerosité (facultatif)')
    .addOptions(DNG_ORDER.map(k => ({ label: DNG[k].label, value: k, emoji: DNG[k].emoji, default: draft.dangerosite === k })));
  const btnRow = new ActionRowBuilder();
  if (draft.categorie === 'wanted') {
    btnRow.addComponents(new ButtonBuilder().setCustomId('grp_prime').setEmoji('💰').setLabel(draft.prime ? `Prime : ${_clip(draft.prime, 40)}` : 'Prime & consigne').setStyle(ButtonStyle.Secondary));
  }
  btnRow.addComponents(new ButtonBuilder().setCustomId('grp_save').setLabel('Enregistrer la fiche').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!draft.categorie));
  return [new ActionRowBuilder().addComponents(selCat), new ActionRowBuilder().addComponents(selDng), btnRow];
}
function _classementContenu(draft) {
  if (draft.categorie === 'wanted') return `💰 **Avis de recherche : ${_clip(draft.nom, 100)}**\nFixe la **prime & la consigne** (bouton 💰), ajuste la **dangerosité**, puis **Enregistrer**.`;
  return `🗂️ **Nouveau groupe : ${_clip(draft.nom, 100)}**\nChoisis la **catégorie**${draft.categorie ? ' ✅' : ''} (et la dangerosité), puis **Enregistrer**.`;
}

// ─── Installation du panneau ───
async function installerPanneau(guild) {
  try {
    let ch = await guild.channels.fetch(SALON_GROUPES).catch(() => null);
    if (!ch) ch = guild.channels.cache.get(SALON_GROUPES) || null;
    if (!ch) { console.log('⚠️ groupes: salon introuvable', SALON_GROUPES); return false; }
    const db = loadDB(); const r = _ensure(db);
    const payload = { embeds: [_panelEmbed(r)], components: _panelRows() };
    // Forum → fil épinglé ; sinon salon texte.
    if (ch.type === 15 && ch.threads?.create) {
      const act = await ch.threads.fetchActive().catch(() => null);
      const ex = act?.threads ? [...act.threads.values()].find(t => /REGISTRE DES GROUPES/i.test(t.name || '')) : null;
      if (ex) return true;
      await ch.threads.create({ name: '🗂️ REGISTRE DES GROUPES', message: payload }).catch(() => {});
      return true;
    }
    if (typeof ch.send !== 'function') { console.log('⚠️ groupes: salon non textuel', ch.type); return false; }
    // Évite les doublons : si un panneau existe déjà, on ne re-poste pas.
    const recents = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    const deja = recents && [...recents.values()].find(m => m.author?.id === guild.members.me?.id && /REGISTRE DES GROUPES/i.test(m.embeds?.[0]?.title || ''));
    if (deja) return true;
    const msg = await ch.send(payload).catch(e => { console.log('⚠️ groupes: envoi panneau échoué', e.message); return null; });
    if (msg) await msg.pin().catch(() => {});
    return !!msg;
  } catch (e) { console.log('⚠️ groupes installerPanneau:', e.message); return false; }
}

async function _rafraichirPanneau(interaction) {
  try {
    const db = loadDB(); const r = _ensure(db);
    if (interaction.message?.embeds?.[0]?.title && /REGISTRE DES GROUPES/i.test(interaction.message.embeds[0].title)) {
      await interaction.message.edit({ embeds: [_panelEmbed(r)], components: _panelRows() }).catch(() => {});
    }
  } catch {}
}

// ─── Routeur ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith('grp_')) return false;
    const eph = MessageFlags.Ephemeral;
    if (!estGestion(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: eph }).catch(() => {}); return true; }

    // ➕ Ficher un groupe → modale
    if (interaction.isButton?.() && id === 'grp_add') {
      const modal = new ModalBuilder().setCustomId('grp_add_modal').setTitle('🗂️ Ficher un groupe');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom du groupe / de la bande').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100).setPlaceholder('Ex : Les Fils de Rhodes')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('meneur').setLabel('Meneur / chef connu').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Ex : « Le Corbeau » Malone')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('territoire').setLabel('Territoire / secteur').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Ex : Rhodes et ses environs')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('effectif').setLabel('Effectif & armement').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(200).setPlaceholder('Ex : ~8 hommes, fusils à répétition')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Renseignements / notes').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(900).setPlaceholder('Habitudes, alliances, faits marquants, dangers connus…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && id === 'grp_add_modal') {
      const gf = (k) => { try { return (interaction.fields.getTextInputValue(k) || '').trim(); } catch { return ''; } };
      const db = loadDB(); const r = _ensure(db);
      const draft = { id: _id(), nom: gf('nom') || 'Sans nom', meneur: gf('meneur'), territoire: gf('territoire'), effectif: gf('effectif'), notes: gf('notes'), categorie: null, dangerosite: null, par: interaction.member?.displayName || interaction.user.username, createdAt: Date.now() };
      r.drafts[interaction.user.id] = draft; persist(db);
      await interaction.reply({ ..._classementPayload(draft), flags: eph }).catch(() => {});
      return true;
    }
    // Selects de classement
    if (interaction.isStringSelectMenu?.() && (id === 'grp_selcat' || id === 'grp_seldng')) {
      const db = loadDB(); const r = _ensure(db);
      const draft = r.drafts[interaction.user.id];
      if (!draft) { await interaction.update({ content: '⏳ Fiche expirée — recommence via ➕.', embeds: [], components: [] }).catch(() => {}); return true; }
      if (id === 'grp_selcat') draft.categorie = interaction.values[0];
      else draft.dangerosite = interaction.values[0];
      persist(db);
      await interaction.update(_classementPayload(draft)).catch(() => {});
      return true;
    }
    // ✅ Enregistrer
    if (interaction.isButton?.() && id === 'grp_save') {
      const db = loadDB(); const r = _ensure(db);
      const draft = r.drafts[interaction.user.id];
      if (!draft) { await interaction.update({ content: '⏳ Fiche expirée — recommence via ➕.', components: [] }).catch(() => {}); return true; }
      if (!draft.categorie) { await interaction.reply({ content: '⚠️ Choisis d\'abord une catégorie.', flags: eph }).catch(() => {}); return true; }
      r.groupes.push(draft); delete r.drafts[interaction.user.id]; persist(db);
      await interaction.update({ content: `✅ **${_clip(draft.nom, 100)}** fiché (${_catInfo(draft.categorie).emoji} ${_catInfo(draft.categorie).label}).`, embeds: [_ficheEmbed(draft)], components: [] }).catch(() => {});
      // met à jour le panneau si on peut le retrouver
      try { const ch = await interaction.guild.channels.fetch(SALON_GROUPES).catch(() => null); if (ch?.messages?.fetch) { const recents = await ch.messages.fetch({ limit: 30 }).catch(() => null); const panel = recents && [...recents.values()].find(m => /REGISTRE DES GROUPES/i.test(m.embeds?.[0]?.title || '')); if (panel) await panel.edit({ embeds: [_panelEmbed(r)], components: _panelRows() }).catch(() => {}); } } catch {}
      return true;
    }

    // 💰 Prime & consigne (uniquement pour un avis de recherche « wanted ») → modale
    if (interaction.isButton?.() && id === 'grp_prime') {
      const db = loadDB(); const r = _ensure(db);
      const draft = r.drafts[interaction.user.id];
      if (!draft) { await interaction.reply({ content: '⏳ Fiche expirée — recommence via ➕.', flags: eph }).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId('grp_prime_modal').setTitle('💰 Avis de recherche');
      const tPrime = new TextInputBuilder().setCustomId('prime').setLabel('Prime / récompense').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('Ex : 500 $ · une info précise');
      const tConsigne = new TextInputBuilder().setCustomId('consigne').setLabel('Consigne').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(100).setPlaceholder('Mort ou vif · Vif uniquement · Indifférent');
      const tComm = new TextInputBuilder().setCustomId('commanditaire').setLabel('Commanditaire (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('Qui lance l\'avis');
      if (draft.prime) tPrime.setValue(_clip(draft.prime, 100));
      if (draft.consigne) tConsigne.setValue(_clip(draft.consigne, 100));
      if (draft.commanditaire) tComm.setValue(_clip(draft.commanditaire, 120));
      modal.addComponents(
        new ActionRowBuilder().addComponents(tPrime),
        new ActionRowBuilder().addComponents(tConsigne),
        new ActionRowBuilder().addComponents(tComm),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && id === 'grp_prime_modal') {
      const gf = (k) => { try { return (interaction.fields.getTextInputValue(k) || '').trim(); } catch { return ''; } };
      const db = loadDB(); const r = _ensure(db);
      const draft = r.drafts[interaction.user.id];
      if (!draft) { await interaction.reply({ content: '⏳ Fiche expirée — recommence via ➕.', flags: eph }).catch(() => {}); return true; }
      draft.prime = gf('prime'); draft.consigne = gf('consigne'); draft.commanditaire = gf('commanditaire'); persist(db);
      if (interaction.isFromMessage?.()) await interaction.update(_classementPayload(draft)).catch(() => {});
      else await interaction.reply({ content: '✅ Prime & consigne enregistrées — clique **Enregistrer la fiche**.', flags: eph }).catch(() => {});
      return true;
    }

    // 📸 Analyser par photo (IA) → guide : il suffit de poster la photo dans le salon
    if (interaction.isButton?.() && id === 'grp_photo') {
      await interaction.reply({ content: '📸 **Renseignement par photo** — poste directement la ou les **captures du groupe dans ce salon** (mets le **nom** du groupe en légende si tu le connais). Le renseignement analysera l\'image en détail et te proposera de l\'enregistrer au registre.', flags: eph }).catch(() => {});
      return true;
    }

    // 🔍 Rechercher
    if (interaction.isButton?.() && id === 'grp_search') {
      const modal = new ModalBuilder().setCustomId('grp_search_modal').setTitle('🔍 Rechercher un groupe')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('terme').setLabel('Nom, meneur, territoire, mot-clé…').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(100)));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && id === 'grp_search_modal') {
      const db = loadDB(); const r = _ensure(db);
      const terme = (interaction.fields.getTextInputValue('terme') || '').trim();
      const res = _filtreGroupes(r.groupes, terme);
      await interaction.reply(_listePayload(res, `🔍 Résultats pour « ${_clip(terme, 60)} »`)).catch(() => {});
      return true;
    }

    // 📋 Voir tous / filtre par catégorie
    if (interaction.isButton?.() && id === 'grp_list') {
      const db = loadDB(); const r = _ensure(db);
      const tri = r.groupes.slice().sort((a, b) => CAT_ORDER.indexOf(a.categorie) - CAT_ORDER.indexOf(b.categorie));
      await interaction.reply(_listePayload(tri, '📋 Tous les groupes fichés')).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && id.startsWith('grp_filter::')) {
      const cat = id.split('::')[1];
      const db = loadDB(); const r = _ensure(db);
      const res = r.groupes.filter(g => g.categorie === cat);
      await interaction.reply(_listePayload(res, `${_catInfo(cat).emoji} ${_catInfo(cat).label}`)).catch(() => {});
      return true;
    }

    // 👁️ Voir une fiche
    if (interaction.isStringSelectMenu?.() && id === 'grp_voir') {
      const db = loadDB(); const r = _ensure(db);
      const g = r.groupes.find(x => x.id === interaction.values[0]);
      if (!g) { await interaction.reply({ content: '⚠️ Fiche introuvable.', flags: eph }).catch(() => {}); return true; }
      await interaction.reply({ embeds: [_ficheEmbed(g)], flags: eph }).catch(() => {});
      return true;
    }

    // 🗑️ Retirer
    if (interaction.isButton?.() && id === 'grp_del') {
      const db = loadDB(); const r = _ensure(db);
      if (!r.groupes.length) { await interaction.reply({ content: 'Aucun groupe à retirer.', flags: eph }).catch(() => {}); return true; }
      const gs = r.groupes.slice(-25).reverse();
      const sel = new StringSelectMenuBuilder().setCustomId('grp_del_sel').setPlaceholder('Retirer un groupe du registre…')
        .addOptions(gs.map(g => ({ label: _clip(g.nom, 90) || 'Sans nom', description: _clip(_catInfo(g.categorie).label, 90), value: g.id, emoji: _catInfo(g.categorie).emoji })));
      await interaction.reply({ content: '🗑️ Quel groupe retirer ?', components: [new ActionRowBuilder().addComponents(sel)], flags: eph }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'grp_del_sel') {
      const db = loadDB(); const r = _ensure(db);
      const gid = interaction.values[0];
      const g = r.groupes.find(x => x.id === gid);
      r.groupes = r.groupes.filter(x => x.id !== gid); persist(db);
      await interaction.update({ content: g ? `🗑️ **${_clip(g.nom, 100)}** retiré du registre.` : 'Retiré.', components: [] }).catch(() => {});
      return true;
    }

    return true;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ groupes routeInteraction:', e.message); return true; }
}

// ─── Renseignement par photo : une capture postée dans le salon → analyse IA détaillée ───
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    if (message.channel?.id !== SALON_GROUPES) return false;
    if (!estGestion(message.member)) return false;
    const atts = message.attachments ? [...message.attachments.values()].filter(a => (a.contentType || '').startsWith('image')).slice(0, 4) : [];
    if (!atts.length) return false;

    const cap = (message.content || '').trim();
    const wait = await message.channel.send({ content: `🕵️ Le renseignement analyse ${atts.length > 1 ? `les ${atts.length} photos` : 'le groupe'}…`, allowedMentions: { parse: [] } }).catch(() => null);
    const bufs = [];
    for (const a of atts) { const b = await _imageBytes(a.url); if (b) bufs.push({ buf: b, mt: a.contentType || 'image/png' }); }
    const s = bufs.length ? await _analyserGroupePhoto(bufs.map(x => ({ b64: x.buf.toString('base64'), mt: x.mt })), cap) : null;
    const buf = bufs[0]?.buf || null;
    if (!s) {
      if (wait) await wait.edit({ content: '⚠️ Analyse indisponible pour le moment — tu peux ficher le groupe à la main via ➕.' }).catch(() => {});
      return true;
    }

    const db = loadDB(); const r = _ensure(db);
    const nom = (cap && cap.length <= 100 ? cap : '') || (_okv(s.nom) ? String(s.nom).slice(0, 100) : 'Groupe non identifié');
    const draft = {
      id: _id(), nom, meneur: '',
      territoire: _okv(s.lieu) ? String(s.lieu).slice(0, 120) : '',
      effectif: _okv(s.effectif) ? String(s.effectif).slice(0, 200) : '',
      notes: _photoDescTexte(s), ia: _cleanIA(s), categorie: null, dangerosite: _mapDng(s.dangerosite),
      photo: null, par: message.member?.displayName || message.author.username, createdAt: Date.now(),
    };

    let card = null;
    if (buf) {
      const emb = _previewEmbed(draft).setImage('attachment://groupe.png');
      const payload = { content: `${_classementContenu(draft)}  ·  📸 photo jointe`, embeds: [emb], components: _classementRows(draft), files: [new AttachmentBuilder(buf, { name: 'groupe.png' })], allowedMentions: { parse: [] } };
      card = wait ? await wait.edit(payload).catch(() => null) : await message.channel.send(payload).catch(() => null);
      if (card) { const u = [...card.attachments.values()][0]?.url; if (u) draft.photo = u; }
    } else {
      card = wait ? await wait.edit(_classementPayload(draft)).catch(() => null) : await message.channel.send(_classementPayload(draft)).catch(() => null);
    }
    r.drafts[message.author.id] = draft; persist(db);
    await message.delete().catch(() => {});
    return true;
  } catch (e) { console.log('❌ groupes onMessage:', e.message); return true; }
}

module.exports = { installerPanneau, routeInteraction, onMessage, SALON_GROUPES, _test: { _ensure, _filtreGroupes, _norm, _mapDng, _photoDescTexte, _cleanIA, _afficheEmbed, _ficheEmbed, _previewEmbed, _classementRows, BANNERS, CATS, DNG } };
