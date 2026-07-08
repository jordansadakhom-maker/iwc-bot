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
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

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
const CATS = {
  recherche:    { label: 'Recherché',        emoji: '🔴', couleur: 0xC0392B },
  ennemi:       { label: 'Ennemi',           emoji: '⚔️', couleur: 0xE67E22 },
  rival:        { label: 'Rival',            emoji: '🥊', couleur: 0xD35400 },
  surveillance: { label: 'Sous surveillance', emoji: '👁️', couleur: 0xF1C40F },
  neutre:       { label: 'Neutre',           emoji: '⚪', couleur: 0x95A5A6 },
  allie:        { label: 'Allié',            emoji: '🤝', couleur: 0x2ECC71 },
};
const CAT_ORDER = ['recherche', 'ennemi', 'rival', 'surveillance', 'neutre', 'allie'];
const DNG = {
  faible:   { label: 'Faible',   emoji: '🟢' },
  moyenne:  { label: 'Moyenne',  emoji: '🟡' },
  elevee:   { label: 'Élevée',   emoji: '🟠' },
  critique: { label: 'Critique', emoji: '🔴' },
};
const DNG_ORDER = ['faible', 'moyenne', 'elevee', 'critique'];

function _catInfo(k) { return CATS[k] || { label: 'Non classé', emoji: '❔', couleur: COULEUR }; }
function _dngInfo(k) { return DNG[k] || null; }

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
      new ButtonBuilder().setCustomId('grp_search').setLabel('Rechercher').setEmoji('🔍').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('grp_list').setLabel('Voir tous').setEmoji('📋').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('grp_del').setLabel('Retirer').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('grp_filter::recherche').setLabel('Recherchés').setEmoji('🔴').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('grp_filter::ennemi').setLabel('Ennemis').setEmoji('⚔️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('grp_filter::surveillance').setLabel('Surveillance').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('grp_filter::allie').setLabel('Alliés').setEmoji('🤝').setStyle(ButtonStyle.Success),
    ),
  ];
}

// ─── Fiche détaillée ───
function _ficheEmbed(g) {
  const c = _catInfo(g.categorie);
  const d = _dngInfo(g.dangerosite);
  const e = new EmbedBuilder().setColor(c.couleur).setTitle(`${c.emoji} ${_clip(g.nom, 200)}`)
    .setDescription(`**Catégorie :** ${c.emoji} ${c.label}${d ? `  ·  **Dangerosité :** ${d.emoji} ${d.label}` : ''}`);
  if (g.meneur) e.addFields({ name: '👤 Meneur / chef', value: _clip(g.meneur, 300), inline: true });
  if (g.territoire) e.addFields({ name: '📍 Territoire / secteur', value: _clip(g.territoire, 300), inline: true });
  if (g.effectif) e.addFields({ name: '👥 Effectif & armement', value: _clip(g.effectif, 500), inline: false });
  if (g.notes) e.addFields({ name: '📝 Renseignements', value: _clip(g.notes, 1024), inline: false });
  e.setFooter({ text: `Fiche ${g.id}${g.par ? ' · établie par ' + g.par : ''}` }).setTimestamp(g.createdAt || Date.now());
  return e;
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
function _classementRows(draft) {
  const selCat = new StringSelectMenuBuilder().setCustomId('grp_selcat').setPlaceholder(draft.categorie ? `Catégorie : ${_catInfo(draft.categorie).label}` : '① Catégorie du groupe')
    .addOptions(CAT_ORDER.map(k => ({ label: CATS[k].label, value: k, emoji: CATS[k].emoji, default: draft.categorie === k })));
  const selDng = new StringSelectMenuBuilder().setCustomId('grp_seldng').setPlaceholder(draft.dangerosite ? `Dangerosité : ${_dngInfo(draft.dangerosite).label}` : '② Dangerosité (facultatif)')
    .addOptions(DNG_ORDER.map(k => ({ label: DNG[k].label, value: k, emoji: DNG[k].emoji, default: draft.dangerosite === k })));
  const btn = new ButtonBuilder().setCustomId('grp_save').setLabel('Enregistrer la fiche').setEmoji('✅').setStyle(ButtonStyle.Success).setDisabled(!draft.categorie);
  return [new ActionRowBuilder().addComponents(selCat), new ActionRowBuilder().addComponents(selDng), new ActionRowBuilder().addComponents(btn)];
}
function _classementContenu(draft) {
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
      await interaction.reply({ content: _classementContenu(draft), components: _classementRows(draft), flags: eph }).catch(() => {});
      return true;
    }
    // Selects de classement
    if (interaction.isStringSelectMenu?.() && (id === 'grp_selcat' || id === 'grp_seldng')) {
      const db = loadDB(); const r = _ensure(db);
      const draft = r.drafts[interaction.user.id];
      if (!draft) { await interaction.update({ content: '⏳ Fiche expirée — recommence via ➕.', components: [] }).catch(() => {}); return true; }
      if (id === 'grp_selcat') draft.categorie = interaction.values[0];
      else draft.dangerosite = interaction.values[0];
      persist(db);
      await interaction.update({ content: _classementContenu(draft), components: _classementRows(draft) }).catch(() => {});
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

module.exports = { installerPanneau, routeInteraction, SALON_GROUPES, _test: { _ensure, _filtreGroupes, _norm, CATS, DNG } };
