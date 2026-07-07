// ───────────────────────────────────────────────────────────────────────────
//  armes.js — Registre des armes (numéros de série)
//  ----------------------------------------------------------------------------
//   • Enregistre chaque arme : N° de SÉRIE, TYPE d'arme, CATÉGORIE (liste
//     modifiable) et AFFECTATION « à quoi elle appartient » (liste modifiable).
//   • Piloté par un panneau + boutons (aucune commande slash — 100/100 atteint).
//   • Réservé à la Direction. Persisté en base (db.registreArmes) + sauvegarde Gist.
//   • Tout est préfixé arme_ — n'écrit RIEN ailleurs, aucune autre donnée touchée.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

// Salon où vit le panneau (posé au démarrage). À renseigner une fois connu.
const SALON_ARMES = '';

const DIRECTION = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estGestion(member) { try { return !!member?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n))); } catch { return false; } }

const COULEUR = 0x8C6D3F;
const CATS_DEFAUT = ['Revolver', 'Pistolet', 'Fusil à répétition', 'Fusil à pompe', 'Carabine', 'Fusil de précision', 'Autre'];
const AFF_DEFAUT = ['Iron Wolf Company', 'La Confrérie', 'Coffre commun', 'Personnel'];

function _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }
function _clip(v, n) { return String(v == null ? '' : v).slice(0, n); }
function _norm(x) { return (x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }

function _ensure(db) {
  if (!db.registreArmes) db.registreArmes = {};
  const r = db.registreArmes;
  if (!Array.isArray(r.armes)) r.armes = [];
  if (!Array.isArray(r.categories) || !r.categories.length) r.categories = [...CATS_DEFAUT];
  if (!Array.isArray(r.appartenances) || !r.appartenances.length) r.appartenances = [...AFF_DEFAUT];
  if (!r.drafts || typeof r.drafts !== 'object') r.drafts = {};
  return r;
}
// Ajoute une valeur unique (casse/accents ignorés) à une liste. Renvoie la valeur retenue.
function _ajoutUnique(liste, valeur) {
  const v = String(valeur || '').trim().slice(0, 60);
  if (!v) return null;
  const exist = liste.find(x => _norm(x) === _norm(v));
  if (exist) return exist;
  liste.push(v);
  return v;
}

// ─── Panneau ───
function _panelEmbed(r) {
  const armes = r.armes || [];
  const e = new EmbedBuilder().setColor(COULEUR).setTitle('🔫 REGISTRE DES ARMES')
    .setDescription('*Numéros de série des armes — de la Compagnie comme de la Confrérie.*')
    .setFooter({ text: `${armes.length} arme(s) · ${r.categories.length} catégorie(s) · ${r.appartenances.length} affectation(s)` }).setTimestamp();
  if (!armes.length) {
    e.addFields({ name: '— Registre vide —', value: 'Clique **➕ Ajouter une arme** pour enregistrer la première.', inline: false });
    return e;
  }
  const recapCat = r.categories.map(c => `${c} : **${armes.filter(a => a.categorie === c).length}**`).join(' · ');
  if (recapCat) e.addFields({ name: '📊 Par catégorie', value: recapCat.slice(0, 1024), inline: false });
  // Regroupé par affectation (« à qui/quoi ça appartient »)
  const parAff = {};
  for (const a of armes) { const k = a.appartenance || '—'; (parAff[k] = parAff[k] || []).push(a); }
  let champs = 0;
  for (const [aff, list] of Object.entries(parAff)) {
    if (champs >= 20) break;
    list.sort((a, b) => (a.type || '').localeCompare(b.type || ''));
    let val = list.slice(0, 12).map(a => `• \`${a.serie}\` — **${a.type}**${a.categorie ? ` *(${a.categorie})*` : ''}`).join('\n');
    if (list.length > 12) val += `\n…(+${list.length - 12} autres)`;
    e.addFields({ name: `🏷️ ${_clip(aff, 60)} (${list.length})`, value: val.slice(0, 1024), inline: false });
    champs++;
  }
  return e;
}
function _panelButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('arme_add').setLabel('Ajouter une arme').setEmoji('➕').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('arme_search').setLabel('Rechercher').setEmoji('🔎').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('arme_cats').setLabel('Catégories').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('arme_aff').setLabel('Affectations').setEmoji('🏷️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('arme_del').setLabel('Retirer').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
  )];
}
async function _refreshPanel(client, r) {
  try {
    if (!r.channelId || !r.panelId) return;
    const ch = await client.channels.fetch(r.channelId).catch(() => null); if (!ch) return;
    const msg = await ch.messages.fetch(r.panelId).catch(() => null); if (!msg) return;
    await msg.edit({ embeds: [_panelEmbed(r)], components: _panelButtons() }).catch(() => {});
  } catch {}
}
async function installerPanneau(guild, channelId) {
  try {
    const cid = channelId || SALON_ARMES;
    if (!cid) return;
    const ch = await guild.channels.fetch(cid).catch(() => null);
    if (!ch || typeof ch.send !== 'function') return;
    const db = loadDB(); const r = _ensure(db);
    r.channelId = cid;
    const me = guild.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('REGISTRE DES ARMES');
    let panel = null;
    if (r.panelId) panel = await ch.messages.fetch(r.panelId).catch(() => null);
    if (!panel) { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) panel = [...pins.values()].find(estPanel) || null; }
    if (!panel) { const recent = await ch.messages.fetch({ limit: 30 }).catch(() => null); if (recent) panel = [...recent.values()].find(estPanel) || null; }
    if (panel) { await panel.edit({ embeds: [_panelEmbed(r)], components: _panelButtons() }).catch(() => {}); r.panelId = panel.id; persist(db); return; }
    const sent = await ch.send({ embeds: [_panelEmbed(r)], components: _panelButtons() }).catch(() => null);
    if (sent) { await sent.pin().catch(() => {}); r.panelId = sent.id; persist(db); }
  } catch (e) { console.log('⚠️ armes installerPanneau:', e.message); }
}

// ─── Draft (persisté) : entre le modal texte et le choix des menus ───
function _pruneDrafts(r) { try { const k = Object.keys(r.drafts); if (k.length > 50) for (const key of k.slice(0, k.length - 50)) delete r.drafts[key]; } catch {} }
function _draftMsg(r, d, draftId) {
  const optsCat = r.categories.slice(0, 24).map(c => ({ label: _clip(c, 100), value: c, default: d.categorie === c }));
  optsCat.push({ label: 'Nouvelle catégorie…', value: '__new__', emoji: '➕' });
  const optsAff = r.appartenances.slice(0, 24).map(a => ({ label: _clip(a, 100), value: a, default: d.appartenance === a }));
  optsAff.push({ label: 'Nouvelle affectation…', value: '__new__', emoji: '➕' });
  const rows = [
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`arme_selcat::${draftId}`).setPlaceholder('🗂️ Catégorie de l\'arme…').addOptions(optsCat)),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`arme_selaff::${draftId}`).setPlaceholder('🏷️ À qui / quoi appartient-elle…').addOptions(optsAff)),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`arme_gen::${draftId}`).setLabel('Enregistrer l\'arme').setEmoji('✅').setStyle(ButtonStyle.Success)),
  ];
  const recap = [
    '**🔫 Nouvelle arme**',
    `• N° de série : \`${d.serie}\``,
    `• Type : **${d.type}**`,
    d.notes ? `• Notes : ${_clip(d.notes, 200)}` : null,
    '',
    `🗂️ Catégorie : ${d.categorie || '*à choisir*'}`,
    `🏷️ Appartient à : ${d.appartenance || '*à choisir*'}`,
    '',
    'Choisis la **catégorie** et l\'**affectation**, puis **Enregistrer**.',
  ].filter(x => x != null).join('\n');
  return { content: recap, components: rows };
}

// ─── Recherche ───
function _filtreArmes(armes, terme) {
  const n = _norm(terme); if (!n) return [];
  return (armes || []).filter(a =>
    _norm(a.serie).includes(n) || _norm(a.type).includes(n) || _norm(a.categorie).includes(n) ||
    _norm(a.appartenance).includes(n) || _norm(a.notes).includes(n)
  );
}
function _resultsEmbed(list, terme) {
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(`🔎 Registre des armes — « ${terme} »`).setFooter({ text: 'Iron Wolf Company • registre des armes' });
  if (!list.length) { e.setDescription(`Aucune arme ne correspond à **${terme}**.\n*Essaie un n° de série, un type, une catégorie ou une affectation.*`); return e; }
  const lignes = list.slice(0, 25).map(a => `• \`${a.serie}\` — **${a.type}**${a.categorie ? ` *(${a.categorie})*` : ''}  ·  🏷️ ${a.appartenance || '—'}${a.notes ? `\n   ↳ ${_clip(a.notes, 100)}` : ''}`);
  e.setDescription(lignes.join('\n').slice(0, 4000));
  e.addFields({ name: '​', value: `**${list.length}** résultat(s)${list.length > 25 ? ' — 25 premiers affichés' : ''}`, inline: false });
  return e;
}
function _selectArmes(list, action) {
  const opts = list.slice(0, 25).map(a => ({ label: `${_clip(a.serie, 40)} · ${_clip(a.type, 50)}`.slice(0, 100), description: `${_clip(a.categorie || '', 40)}${a.appartenance ? ' · ' + _clip(a.appartenance, 50) : ''}`.slice(0, 100) || '—', value: a.id }));
  if (!opts.length) return null;
  return new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`arme_${action}::`).setPlaceholder('Choisis une arme…').addOptions(opts));
}
// Gestion d'une liste (catégories / affectations)
function _gestionListe(r, quoi) {
  const liste = quoi === 'cat' ? r.categories : r.appartenances;
  const titre = quoi === 'cat' ? '🗂️ Catégories' : '🏷️ Affectations';
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(titre)
    .setDescription(liste.length ? liste.map((x, i) => `${i + 1}. ${x}`).join('\n').slice(0, 3800) : '*Liste vide.*');
  const rows = [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`arme_${quoi}add`).setLabel('Ajouter').setEmoji('➕').setStyle(ButtonStyle.Success),
  )];
  if (liste.length) {
    rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`arme_${quoi}del::`).setPlaceholder('Retirer un élément…')
      .addOptions(liste.slice(0, 25).map(x => ({ label: _clip(x, 100), value: x })))));
  }
  return { embeds: [e], components: rows, flags: MessageFlags.Ephemeral };
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('arme_')) return false;
    const eph = MessageFlags.Ephemeral;
    const refuse = async () => { await interaction.reply({ content: '🔒 Registre réservé à la Direction.', flags: eph }).catch(() => {}); return true; };

    // ── Ajouter une arme → modal texte ──
    if (interaction.isButton?.() && cid === 'arme_add') {
      if (!estGestion(interaction.member)) return refuse();
      const m = new ModalBuilder().setCustomId('arme_add_modal').setTitle('🔫 Nouvelle arme');
      m.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('serie').setLabel('Numéro de série').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : SN-4471-A')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('type').setLabel('Type / modèle d\'arme').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex : Cattleman, Lancaster, Fusil Litchfield…')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('notes').setLabel('Notes (optionnel)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setPlaceholder('État, provenance, remarques…')),
      );
      await interaction.showModal(m).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'arme_add_modal') {
      if (!estGestion(interaction.member)) return refuse();
      const db = loadDB(); const r = _ensure(db);
      const draftId = _id();
      r.drafts[draftId] = {
        serie: (interaction.fields.getTextInputValue('serie') || '').trim().slice(0, 60),
        type: (interaction.fields.getTextInputValue('type') || '').trim().slice(0, 80),
        notes: (interaction.fields.getTextInputValue('notes') || '').trim().slice(0, 300),
        categorie: '', appartenance: '', by: interaction.user.id, at: Date.now(),
      };
      _pruneDrafts(r); persist(db);
      await interaction.reply({ ..._draftMsg(r, r.drafts[draftId], draftId), flags: eph }).catch(() => {});
      return true;
    }
    // ── Choix catégorie / affectation d'un draft ──
    if (interaction.isStringSelectMenu?.() && (cid.startsWith('arme_selcat::') || cid.startsWith('arme_selaff::'))) {
      if (!estGestion(interaction.member)) return refuse();
      const estCat = cid.startsWith('arme_selcat::');
      const draftId = cid.split('::')[1];
      const db = loadDB(); const r = _ensure(db);
      const d = r.drafts[draftId];
      if (!d) { await interaction.update({ content: '⌛ Saisie expirée — reclique **➕ Ajouter une arme**.', components: [] }).catch(() => {}); return true; }
      const val = interaction.values[0];
      if (val === '__new__') {
        // Ouvre un modal pour créer une nouvelle valeur
        const m = new ModalBuilder().setCustomId(`arme_newval::${estCat ? 'cat' : 'aff'}::${draftId}`).setTitle(estCat ? '➕ Nouvelle catégorie' : '➕ Nouvelle affectation');
        m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('valeur').setLabel(estCat ? 'Nom de la catégorie' : 'Nom de l\'affectation').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder(estCat ? 'Ex : Arme de poing' : 'Ex : Planque de Rhodes')));
        await interaction.showModal(m).catch(() => {});
        return true;
      }
      if (estCat) d.categorie = val; else d.appartenance = val;
      persist(db);
      await interaction.update(_draftMsg(r, d, draftId)).catch(() => {});
      return true;
    }
    // ── Création d'une nouvelle valeur (catégorie/affectation) depuis le draft ──
    if (interaction.isModalSubmit?.() && cid.startsWith('arme_newval::')) {
      if (!estGestion(interaction.member)) return refuse();
      const [, quoi, draftId] = cid.split('::');
      const db = loadDB(); const r = _ensure(db);
      const d = r.drafts[draftId];
      if (!d) { await interaction.reply({ content: '⌛ Saisie expirée — reclique **➕ Ajouter une arme**.', flags: eph }).catch(() => {}); return true; }
      const val = _ajoutUnique(quoi === 'cat' ? r.categories : r.appartenances, interaction.fields.getTextInputValue('valeur'));
      if (val) { if (quoi === 'cat') d.categorie = val; else d.appartenance = val; }
      persist(db);
      await interaction.update(_draftMsg(r, d, draftId)).catch(() => {});
      return true;
    }
    // ── Enregistrer l'arme ──
    if (interaction.isButton?.() && cid.startsWith('arme_gen::')) {
      if (!estGestion(interaction.member)) return refuse();
      const draftId = cid.split('::')[1];
      const db = loadDB(); const r = _ensure(db);
      const d = r.drafts[draftId];
      if (!d) { await interaction.update({ content: '⌛ Saisie expirée — reclique **➕ Ajouter une arme**.', components: [] }).catch(() => {}); return true; }
      if (!d.categorie || !d.appartenance) { await interaction.reply({ content: '⚠️ Choisis d\'abord la **catégorie** ET l\'**affectation**.', flags: eph }).catch(() => {}); return true; }
      const arme = { id: _id(), serie: d.serie, type: d.type, categorie: d.categorie, appartenance: d.appartenance, notes: d.notes || '', par: interaction.user.id, at: Date.now() };
      r.armes.push(arme);
      delete r.drafts[draftId];
      persist(db);
      await _refreshPanel(interaction.client, r);
      await interaction.update({ content: `✅ Arme enregistrée : \`${arme.serie}\` — **${arme.type}** *(${arme.categorie})* · 🏷️ ${arme.appartenance}.`, components: [] }).catch(() => {});
      return true;
    }

    // ── Rechercher ──
    if (interaction.isButton?.() && cid === 'arme_search') {
      if (!estGestion(interaction.member)) return refuse();
      const m = new ModalBuilder().setCustomId('arme_search_modal').setTitle('🔎 Rechercher une arme');
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('terme').setLabel('N° série, type, catégorie ou affectation').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : SN-4471, Cattleman, Confrérie…')));
      await interaction.showModal(m).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'arme_search_modal') {
      if (!estGestion(interaction.member)) return refuse();
      await interaction.deferReply({ flags: eph }).catch(() => {});
      const db = loadDB(); const r = _ensure(db);
      const terme = (interaction.fields.getTextInputValue('terme') || '').trim();
      await interaction.editReply({ embeds: [_resultsEmbed(_filtreArmes(r.armes, terme), terme)] }).catch(() => {});
      return true;
    }

    // ── Retirer une arme ──
    if (interaction.isButton?.() && cid === 'arme_del') {
      if (!estGestion(interaction.member)) return refuse();
      const db = loadDB(); const r = _ensure(db);
      if (!r.armes.length) { await interaction.reply({ content: '📭 Le registre est vide.', flags: eph }).catch(() => {}); return true; }
      const row = _selectArmes([...r.armes].reverse(), 'delsel');
      const extra = r.armes.length > 25 ? `\n*(${r.armes.length} armes — 25 dernières listées ; utilise 🔎 sinon)*` : '';
      await interaction.reply({ content: `🗑️ Quelle arme retirer du registre ?${extra}`, components: [row], flags: eph }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid.startsWith('arme_delsel::')) {
      if (!estGestion(interaction.member)) return refuse();
      const aid = interaction.values?.[0];
      const db = loadDB(); const r = _ensure(db);
      const a = r.armes.find(x => x.id === aid);
      if (!a) { await interaction.update({ content: '⚠️ Arme introuvable (déjà retirée ?).', components: [] }).catch(() => {}); return true; }
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`arme_delok::${a.id}`).setLabel('Retirer').setEmoji('🗑️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('arme_delno').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      await interaction.update({ content: `⚠️ Retirer \`${a.serie}\` — **${a.type}** *(${a.categorie})* du registre ? C'est définitif.`, components: [row], embeds: [] }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'arme_delno') { await interaction.update({ content: '❌ Retrait annulé.', components: [] }).catch(() => {}); return true; }
    if (interaction.isButton?.() && cid.startsWith('arme_delok::')) {
      if (!estGestion(interaction.member)) return refuse();
      const aid = cid.split('::')[1];
      const db = loadDB(); const r = _ensure(db);
      const i = r.armes.findIndex(x => x.id === aid);
      if (i < 0) { await interaction.update({ content: '⚠️ Arme déjà retirée.', components: [] }).catch(() => {}); return true; }
      const s = r.armes[i].serie; r.armes.splice(i, 1); persist(db);
      await _refreshPanel(interaction.client, r);
      await interaction.update({ content: `🗑️ Arme \`${s}\` retirée du registre.`, components: [] }).catch(() => {});
      return true;
    }

    // ── Gérer les catégories / affectations ──
    if (interaction.isButton?.() && (cid === 'arme_cats' || cid === 'arme_aff')) {
      if (!estGestion(interaction.member)) return refuse();
      const db = loadDB(); const r = _ensure(db);
      await interaction.reply(_gestionListe(r, cid === 'arme_cats' ? 'cat' : 'aff')).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && (cid === 'arme_catadd' || cid === 'arme_affadd')) {
      if (!estGestion(interaction.member)) return refuse();
      const quoi = cid === 'arme_catadd' ? 'cat' : 'aff';
      const m = new ModalBuilder().setCustomId(`arme_listadd::${quoi}`).setTitle(quoi === 'cat' ? '➕ Nouvelle catégorie' : '➕ Nouvelle affectation');
      m.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('valeur').setLabel(quoi === 'cat' ? 'Nom de la catégorie' : 'Nom de l\'affectation').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)));
      await interaction.showModal(m).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid.startsWith('arme_listadd::')) {
      if (!estGestion(interaction.member)) return refuse();
      const quoi = cid.split('::')[1];
      const db = loadDB(); const r = _ensure(db);
      const val = _ajoutUnique(quoi === 'cat' ? r.categories : r.appartenances, interaction.fields.getTextInputValue('valeur'));
      persist(db);
      await _refreshPanel(interaction.client, r);
      await interaction.reply({ content: val ? `✅ Ajouté : **${val}**.` : '⚠️ Valeur vide.', flags: eph }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && (cid.startsWith('arme_catdel::') || cid.startsWith('arme_affdel::'))) {
      if (!estGestion(interaction.member)) return refuse();
      const quoi = cid.startsWith('arme_catdel::') ? 'cat' : 'aff';
      const val = interaction.values?.[0];
      const db = loadDB(); const r = _ensure(db);
      const liste = quoi === 'cat' ? r.categories : r.appartenances;
      const i = liste.findIndex(x => x === val);
      if (i >= 0) liste.splice(i, 1);
      persist(db);
      await _refreshPanel(interaction.client, r);
      await interaction.update({ ..._gestionListe(r, quoi) }).catch(() => {});
      return true;
    }

    return true; // customId arme_* pris en charge
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ armes routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '⚠️ Erreur sur le registre des armes.', flags: MessageFlags.Ephemeral }).catch(() => {}); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction, installerPanneau, SALON_ARMES,
  _test: { _ensure, _ajoutUnique, _filtreArmes, _norm },
};
