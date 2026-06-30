// ───────────────────────────────────────────────────────────────────────────
//  ripoux.js — « Le Ripoux » : OUTIL simple pour le MEMBRE infiltré comme
//  shérif/adjoint corrompu. Ce n'est PAS une IA : c'est LUI qui transmet ses
//  rapports à la Confrérie. Version ÉPURÉE :
//   • Un seul bouton « 📝 Nouveau rapport » → catégorie + petit formulaire.
//   • Chaque rapport = un dossier propre et immersif dans le FORUM dédié.
//   • Un rôle est pingé à chaque rapport (configurable).
//   • Réglages : désigner le membre, son nom de couverture, le rôle à pinger.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, RoleSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const FORUM_RIPOUX = '1519114962738348102'; // FORUM dédié au Ripoux

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function peutGerer(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }
function peutRipoux(member, db) { try { const r = (db || loadDB()).ripoux || {}; return (r.userId && member?.id === r.userId) || peutGerer(member); } catch { return peutGerer(member); } }

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }

// Catégories de rapport → emoji + mots-clés pour retrouver l'étiquette du forum
const CATEGORIES = {
  enquete: { emoji: '🔍', label: 'Enquête / Patrouille', kw: ['enquete', 'patrouille', 'loi'] },
  avis:    { emoji: '📜', label: 'Avis de recherche',    kw: ['avis', 'recherche', 'prime', 'wanted'] },
  info:    { emoji: '🤝', label: 'Deal / Info',           kw: ['deal', 'info', 'tuyau', 'business'] },
  urgent:  { emoji: '⚠️', label: 'Urgent',                kw: ['urgent', 'alerte'] },
};

function _ensure(db) {
  if (!db.ripoux) db.ripoux = {};
  const r = db.ripoux;
  if (typeof r.nom !== 'string' || !r.nom) r.nom = "L'indic dans la loi";
  if (!('userId' in r)) r.userId = null;
  if (!('pingRoleId' in r)) r.pingRoleId = null;
  if (!('panelThreadId' in r)) r.panelThreadId = null;
  return r;
}

function _panelEmbed(db) {
  const r = _ensure(db);
  return new EmbedBuilder()
    .setColor(0x6B4423)
    .setTitle('🎖️ LE RIPOUX — notre homme dans la loi')
    .setDescription([
      `*Notre indic, ${r.nom}, transmet ici ce qu'il entend et apprend au bureau du shérif.*`,
      '',
      '**Pour faire un rapport :** clique sur **📝 Nouveau rapport**, choisis la catégorie, écris ce que tu as appris. La Confrérie est prévenue aussitôt.',
      '',
      r.userId ? `🕵️ Indic désigné : <@${r.userId}>` : '⚠️ *Aucun membre désigné — règle-le via ⚙️.*',
      r.pingRoleId ? `🔔 Prévient : <@&${r.pingRoleId}>` : '⚠️ *Aucun rôle à prévenir — règle-le via ⚙️.*',
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • CONFIDENTIEL — à ne jamais ébruiter' })
    .setTimestamp();
}
function _panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ripoux_rapport').setLabel('Nouveau rapport').setEmoji('📝').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ripoux_config').setLabel('Réglages').setEmoji('⚙️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

// Trouve l'étiquette du forum correspondant à une catégorie (si le forum en a)
function _tagPourCategorie(forum, catKey) {
  try {
    const cat = CATEGORIES[catKey]; if (!cat || !forum.availableTags?.length) return null;
    const clean = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const t = forum.availableTags.find(tag => { const tn = clean(tag.name); return cat.kw.some(k => tn.includes(k)); });
    return t?.id || null;
  } catch { return null; }
}

async function _refreshPanel(guild) {
  try {
    const db = loadDB(); const r = _ensure(db);
    if (!r.panelThreadId) return;
    const th = await guild.channels.fetch(r.panelThreadId).catch(() => null);
    if (!th) return;
    const starter = await th.fetchStarterMessage().catch(() => null);
    if (starter) await starter.edit({ embeds: [_panelEmbed(db)], components: _panelRows() }).catch(() => {});
  } catch {}
}

// Crée les étiquettes de catégorie dans le forum (en gardant les existantes)
async function _assurerEtiquettes(forum) {
  try {
    if (!forum?.setAvailableTags) return;
    const clean = s => (s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
    const existing = forum.availableTags || [];
    const voulu = [
      { name: '🔍 Enquête', kw: 'enquete' },
      { name: '📜 Avis de recherche', kw: 'avis' },
      { name: '🤝 Deal / Info', kw: 'deal' },
      { name: '⚠️ Urgent', kw: 'urgent' },
    ];
    const manquants = voulu.filter(v => !existing.some(t => clean(t.name).includes(v.kw)));
    if (!manquants.length || existing.length + manquants.length > 20) return;
    const merged = [
      ...existing.map(t => { const o = { name: t.name, moderated: !!t.moderated }; if (t.id) o.id = t.id; if (t.emoji && (t.emoji.id || t.emoji.name)) o.emoji = { id: t.emoji.id || null, name: t.emoji.name || null }; return o; }),
      ...manquants.map(v => ({ name: v.name })),
    ];
    const _vus = new Set();
    const uniq = merged.filter(t => { const n = (t.name || '').trim().toLowerCase(); if (!n || _vus.has(n)) return false; _vus.add(n); return true; });
    await forum.setAvailableTags(uniq).catch(e => console.log('⚠️ ripoux setAvailableTags:', e.message));
  } catch {}
}
async function installerPanel(guild) {
  try {
    const forum = _ch(guild, FORUM_RIPOUX);
    if (!forum || forum.type !== 15 || !forum.threads?.create) return;
    await _assurerEtiquettes(forum);
    const db = loadDB(); const r = _ensure(db);
    let existing = null;
    if (r.panelThreadId) existing = await guild.channels.fetch(r.panelThreadId).catch(() => null);
    if (!existing) {
      const act = await forum.threads.fetchActive().catch(() => null);
      const all = act?.threads ? [...act.threads.values()] : [];
      existing = all.find(t => (t.name || '').includes('POSTE DE COMMANDE')) || null;
    }
    if (existing) {
      r.panelThreadId = existing.id; saveDB(db);
      const starter = await existing.fetchStarterMessage().catch(() => null);
      if (starter) await starter.edit({ embeds: [_panelEmbed(db)], components: _panelRows() }).catch(() => {});
      return;
    }
    const base = { name: '🎖️ LE RIPOUX — POSTE DE COMMANDE (ne pas supprimer)', message: { embeds: [_panelEmbed(db)], components: _panelRows() } };
    const opts = { ...base };
    if (forum.availableTags?.length) opts.appliedTags = [forum.availableTags[0].id];
    let post = await forum.threads.create(opts).catch(() => null);
    if (!post) post = await forum.threads.create(base).catch(() => null);
    if (post) { r.panelThreadId = post.id; saveDB(db); try { await post.pin(); } catch {} }
  } catch (e) { console.log('⚠️ ripoux installerPanel:', e.message); }
}

// Conservé pour le cron d'index.js : garde juste le panneau à jour (aucune génération auto)
async function tickQuotidien(client) {
  for (const guild of client.guilds.cache.values()) {
    try { if (_ch(guild, FORUM_RIPOUX)) await _refreshPanel(guild); } catch {}
  }
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('ripoux_')) return false;

    // 📝 Nouveau rapport → choix de la catégorie
    if (interaction.isButton?.() && cid === 'ripoux_rapport') {
      const db = loadDB();
      if (!peutRipoux(interaction.member, db)) { await interaction.reply({ content: '🔒 Réservé à l\'indic et à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('ripoux_cat').setPlaceholder('Catégorie du rapport…')
        .addOptions(Object.entries(CATEGORIES).map(([k, c]) => ({ label: c.label, value: k, emoji: c.emoji })));
      await interaction.reply({ content: '🗂️ Quel type de rapport ?', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Catégorie choisie → ouvre le formulaire
    if (interaction.isStringSelectMenu?.() && cid === 'ripoux_cat') {
      const cat = interaction.values[0];
      const c = CATEGORIES[cat] || CATEGORIES.info;
      const modal = new ModalBuilder().setCustomId(`ripoux_rapport_modal::${cat}`).setTitle(`${c.emoji} Rapport — ${c.label}`.slice(0, 45));
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Sujet (court)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex : Patrouille prévue vers Blackwater')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rapport').setLabel('Ce que tu as entendu / appris').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500).setPlaceholder('Enquêtes, patrouilles, qui a parlé, deals, tensions, opportunités…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    // Formulaire soumis → poste le dossier dans le forum + ping
    if (interaction.isModalSubmit?.() && cid.startsWith('ripoux_rapport_modal::')) {
      const cat = cid.split('::')[1] || 'info';
      const c = CATEGORIES[cat] || CATEGORIES.info;
      const db = loadDB(); const r = _ensure(db);
      const titre = interaction.fields.getTextInputValue('titre').trim();
      const rapport = interaction.fields.getTextInputValue('rapport').trim();
      const forum = _ch(interaction.guild, FORUM_RIPOUX);
      if (!forum || forum.type !== 15 || !forum.threads?.create) { await interaction.reply({ content: '⚠️ Forum du Ripoux introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const embed = new EmbedBuilder()
        .setColor(0x6B4423)
        .setAuthor({ name: `🎖️ ${r.nom} — notre homme dans la loi` })
        .setTitle(`${c.emoji} ${titre}`.slice(0, 256))
        .setDescription(rapport.slice(0, 4000))
        .addFields({ name: '✍️ Rapporté par', value: `${interaction.member?.displayName || interaction.user.username}`, inline: true }, { name: '🗂️ Catégorie', value: c.label, inline: true })
        .setFooter({ text: 'La Confrérie • Brûle ce papier après lecture' })
        .setTimestamp();
      const content = r.pingRoleId ? `<@&${r.pingRoleId}> — 🎖️ nouveau rapport de l'indic` : '';
      const msg = { content, embeds: [embed], allowedMentions: { roles: r.pingRoleId ? [r.pingRoleId] : [] } };
      const opts = { name: `${c.emoji} ${titre} — ${new Date().toLocaleDateString('fr-FR')}`.slice(0, 100), message: msg };
      const tagId = _tagPourCategorie(forum, cat);
      if (tagId) opts.appliedTags = [tagId];
      let post = await forum.threads.create(opts).catch(() => null);
      if (!post) post = await forum.threads.create({ name: opts.name, message: msg }).catch(() => null);
      await interaction.reply({ content: `✅ Rapport transmis${post ? ` : <#${post.id}>` : ''}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // ⚙️ Réglages : désigner le membre, le nom de couverture, le rôle à pinger
    if (interaction.isButton?.() && cid === 'ripoux_config') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const selMembre = new UserSelectMenuBuilder().setCustomId('ripoux_set_member').setPlaceholder('Désigner le membre qui joue le ripoux').setMinValues(1).setMaxValues(1);
      const selRole = new RoleSelectMenuBuilder().setCustomId('ripoux_set_role').setPlaceholder('Rôle à prévenir à chaque rapport').setMinValues(1).setMaxValues(1);
      const row3 = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ripoux_set_nom').setLabel('✏️ Nom de couverture').setStyle(ButtonStyle.Secondary));
      await interaction.reply({ content: '⚙️ **Réglages du Ripoux** — choisis le membre, le rôle à prévenir, ou le nom de couverture :', components: [new ActionRowBuilder().addComponents(selMembre), new ActionRowBuilder().addComponents(selRole), row3], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isUserSelectMenu?.() && cid === 'ripoux_set_member') {
      const db = loadDB(); const r = _ensure(db); r.userId = interaction.values[0]; saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.update({ content: `✅ Indic désigné : <@${r.userId}>. Il peut maintenant faire ses rapports.`, components: [] }).catch(() => {});
      return true;
    }
    if (interaction.isRoleSelectMenu?.() && cid === 'ripoux_set_role') {
      const db = loadDB(); const r = _ensure(db); r.pingRoleId = interaction.values[0]; saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.update({ content: `✅ Rôle prévenu à chaque rapport : <@&${r.pingRoleId}>.`, components: [] }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && cid === 'ripoux_set_nom') {
      const db = loadDB(); const r = _ensure(db);
      const modal = new ModalBuilder().setCustomId('ripoux_nom_modal').setTitle('✏️ Nom de couverture');
      modal.addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom RP de l\'indic').setStyle(TextInputStyle.Short).setRequired(true).setValue(r.nom).setMaxLength(60)));
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'ripoux_nom_modal') {
      const db = loadDB(); const r = _ensure(db);
      const nom = interaction.fields.getTextInputValue('nom').trim();
      if (nom) { r.nom = nom.slice(0, 60); saveDB(db); }
      await _refreshPanel(interaction.guild);
      await interaction.reply({ content: `⚙️ Nom de couverture : **${r.nom}**.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 40060].includes(e?.code)) return true;
    console.log('❌ ripoux routeInteraction:', e.message);
    return true;
  }
}

module.exports = { installerPanel, tickQuotidien, routeInteraction, FORUM_RIPOUX };
