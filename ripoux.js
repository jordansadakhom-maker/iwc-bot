// ───────────────────────────────────────────────────────────────────────────
//  ripoux.js — « Le Ripoux » : OUTIL pour le MEMBRE de l'équipe infiltré comme
//  shérif/adjoint corrompu. Ce n'est PAS une IA : c'est LUI qui rédige ses
//  rapports (ce qu'il a entendu/appris au bureau du shérif) et les partage à la
//  Confrérie, avec les fonctionnalités autour : avis de recherche, niveau de
//  recherche (heat), faire disparaître un dossier, et une jauge d'exposition de
//  sa couverture (plus il agit, plus il se met en danger).
//  ----------------------------------------------------------------------------
//   • Salon : FORUM dédié (chaque rapport = un post/dossier).
//   • Panneau de commande épinglé avec les boutons.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, UserSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});

const FORUM_RIPOUX = '1519114962738348102'; // FORUM dédié au Ripoux

const EXPO_MAX     = 100;
const EXPO_RAPPORT = 8;   // un rapport = un petit risque
const EXPO_AVIS    = 22;  // faire disparaître un avis = gros risque
const EXPO_DECAY   = 10;  // par jour (la couverture se referme avec le temps)
const HEAT_DECAY   = 6;   // par jour

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function peutGerer(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }
// Le membre ripoux désigné OU l'équipe de gestion
function peutRipoux(member, db) { try { const r = (db || loadDB()).ripoux || {}; return (r.userId && member?.id === r.userId) || peutGerer(member); } catch { return peutGerer(member); } }

function _ch(guild, id) { try { return guild.channels.cache.get(id) || null; } catch { return null; } }
function _now() { return Date.now(); }
const _clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Math.round(n)));

function _ensure(db) {
  if (!db.ripoux) db.ripoux = {};
  const r = db.ripoux;
  if (typeof r.nom !== 'string' || !r.nom) r.nom = "L'indic dans la loi";
  if (!('userId' in r)) r.userId = null;
  if (typeof r.exposition !== 'number') r.exposition = 0;
  if (typeof r.heat !== 'number') r.heat = 0;
  if (!Array.isArray(r.primes)) r.primes = [];
  if (!('panelThreadId' in r)) r.panelThreadId = null;
  return r;
}

function _jauge(val) {
  const v = _clamp(val, 0, 100); const plein = Math.round(v / 10);
  return `\`${'█'.repeat(plein)}${'░'.repeat(10 - plein)}\` ${v}%`;
}
function _heatLabel(h) {
  if (h < 20) return '🟢 Calme — la loi vous laisse tranquilles';
  if (h < 50) return '🟡 Surveillés — gardez profil bas';
  if (h < 80) return '🟠 Recherchés activement — prudence';
  return '🔴 Chasse à l\'homme — la corde n\'est pas loin';
}
function _expoLabel(e) {
  if (e < 30) return '🟢 Couverture solide';
  if (e < 60) return '🟡 Quelques regards de travers';
  if (e < 85) return '🟠 On commence à le soupçonner — qu\'il se calme';
  return '🔴 Couverture en danger — il doit disparaître un moment';
}

function _panelEmbed(db) {
  const r = _ensure(db);
  const primesTxt = r.primes.length
    ? r.primes.slice(0, 8).map(p => `• **${p.cible}** — ${p.montant ? `$${Number(p.montant).toLocaleString('fr-FR')}` : 'prime inconnue'}${p.raison ? ` · *${p.raison}*` : ''}`).join('\n')
    : '*Aucun avis de recherche connu pour l\'instant.*';
  return new EmbedBuilder()
    .setColor(0x6B4423)
    .setTitle(`🎖️ LE RIPOUX — ${r.nom}`)
    .setDescription([
      '*Notre homme à l\'intérieur de la loi. Il rapporte ici ce qu\'il entend et apprend au bureau du shérif.*',
      r.userId ? `\n🕵️ Indic : <@${r.userId}>` : '\n*(Aucun membre désigné — règle-le via ⚙️.)*',
    ].join('\n'))
    .addFields(
      { name: '🔥 Niveau de recherche de la bande', value: `${_jauge(r.heat)}\n${_heatLabel(r.heat)}`, inline: false },
      { name: '🎭 Exposition de la couverture', value: `${_jauge(r.exposition)}\n${_expoLabel(r.exposition)}`, inline: false },
      { name: `📜 Avis de recherche connus (${r.primes.length})`, value: primesTxt.slice(0, 1024), inline: false },
    )
    .setFooter({ text: 'La Confrérie • CONFIDENTIEL — à ne jamais ébruiter' })
    .setTimestamp();
}
function _panelRows() {
  return [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ripoux_rapport').setLabel('Faire un rapport').setEmoji('📝').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('ripoux_traque').setLabel('État de la traque').setEmoji('🔥').setStyle(ButtonStyle.Secondary),
    ),
    new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ripoux_prime_add').setLabel('Signaler un avis').setEmoji('📜').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ripoux_avis_clear').setLabel('Faire disparaître un avis').setEmoji('🧹').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId('ripoux_heat_set').setLabel('Régler la pression').setEmoji('🔥').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('ripoux_config').setLabel('⚙️').setStyle(ButtonStyle.Secondary),
    ),
  ];
}

async function _posterDossier(guild, titre, embed) {
  const forum = _ch(guild, FORUM_RIPOUX);
  if (!forum || forum.type !== 15 || !forum.threads?.create) return null;
  const opts = { name: titre.slice(0, 100), message: { embeds: [embed], allowedMentions: { parse: [] } } };
  if (forum.availableTags?.length) opts.appliedTags = [forum.availableTags[0].id];
  let post = await forum.threads.create(opts).catch(() => null);
  if (!post) post = await forum.threads.create({ name: titre.slice(0, 100), message: { embeds: [embed], allowedMentions: { parse: [] } } }).catch(() => null);
  return post;
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

function _decay(db) {
  const r = _ensure(db);
  r.exposition = _clamp(r.exposition - EXPO_DECAY, 0, EXPO_MAX);
  r.heat = _clamp(r.heat - HEAT_DECAY, 0, 100);
}

async function installerPanel(guild) {
  try {
    const forum = _ch(guild, FORUM_RIPOUX);
    if (!forum || forum.type !== 15 || !forum.threads?.create) return;
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
    const opts = { name: '🎖️ LE RIPOUX — POSTE DE COMMANDE (ne pas supprimer)', message: { embeds: [_panelEmbed(db)], components: _panelRows() } };
    if (forum.availableTags?.length) opts.appliedTags = [forum.availableTags[0].id];
    let post = await forum.threads.create(opts).catch(() => null);
    if (!post) post = await forum.threads.create({ name: '🎖️ LE RIPOUX — POSTE DE COMMANDE (ne pas supprimer)', message: { embeds: [_panelEmbed(db)], components: _panelRows() } }).catch(() => null);
    if (post) { r.panelThreadId = post.id; saveDB(db); try { await post.pin(); } catch {} }
  } catch (e) { console.log('⚠️ ripoux installerPanel:', e.message); }
}

// Tick quotidien : la couverture se referme + la pression retombe (aucune génération auto)
async function tickQuotidien(client) {
  for (const guild of client.guilds.cache.values()) {
    try {
      if (!_ch(guild, FORUM_RIPOUX)) continue;
      const db = loadDB(); _ensure(db); _decay(db); saveDB(db);
      await _refreshPanel(guild);
    } catch (e) { console.log('⚠️ ripoux tickQuotidien:', e.message); }
  }
}

const HEAT_NIVEAUX = { calme: 10, surveilles: 40, recherches: 70, chasse: 95 };

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('ripoux_')) return false;

    // 📝 Faire un rapport (le membre rédige ce qu'il a entendu/appris)
    if (interaction.isButton?.() && cid === 'ripoux_rapport') {
      const db = loadDB();
      if (!peutRipoux(interaction.member, db)) { await interaction.reply({ content: '🔒 Réservé à l\'indic et à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId('ripoux_rapport_modal').setTitle('📝 Rapport de l\'indic');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('titre').setLabel('Sujet (court)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder('Ex : Patrouille prévue vers Blackwater')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rapport').setLabel('Ce que tu as entendu / appris').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(1500).setPlaceholder('Tout ce qui peut servir : enquêtes, patrouilles, qui a parlé, deals, tensions, opportunités…')),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'ripoux_rapport_modal') {
      const db = loadDB(); const r = _ensure(db);
      const titre = interaction.fields.getTextInputValue('titre').trim();
      const rapport = interaction.fields.getTextInputValue('rapport').trim();
      r.exposition = _clamp(r.exposition + EXPO_RAPPORT, 0, EXPO_MAX);
      saveDB(db);
      const embed = new EmbedBuilder()
        .setColor(0x6B4423)
        .setAuthor({ name: `🎖️ ${r.nom} — notre homme dans la loi` })
        .setTitle(`📝 ${titre}`.slice(0, 256))
        .setDescription(rapport.slice(0, 4000))
        .addFields(
          { name: '🔥 Niveau de recherche', value: `${_jauge(r.heat)} · ${_heatLabel(r.heat)}`, inline: false },
          { name: '✍️ Rapporté par', value: `${interaction.member?.displayName || interaction.user.username}`, inline: true },
        )
        .setFooter({ text: 'La Confrérie • Brûle ce papier après lecture' })
        .setTimestamp();
      const post = await _posterDossier(interaction.guild, `📝 ${titre} — ${new Date().toLocaleDateString('fr-FR')}`, embed);
      await _refreshPanel(interaction.guild);
      const alerte = r.exposition >= 85 ? '\n⚠️ *Attention : ta couverture est très exposée — fais profil bas un moment.*' : '';
      await interaction.reply({ content: `✅ Rapport transmis à la Confrérie.${post ? ` Dossier : <#${post.id}>` : ''}${alerte}`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // 🔥 État de la traque (lecture)
    if (interaction.isButton?.() && cid === 'ripoux_traque') {
      const db = loadDB(); const r = _ensure(db);
      const e = new EmbedBuilder().setColor(0x6B4423).setTitle('🔥 État de la traque')
        .addFields(
          { name: 'Niveau de recherche', value: `${_jauge(r.heat)}\n${_heatLabel(r.heat)}`, inline: false },
          { name: `Avis de recherche (${r.primes.length})`, value: (r.primes.length ? r.primes.slice(0, 12).map(p => `• **${p.cible}** — ${p.montant ? `$${Number(p.montant).toLocaleString('fr-FR')}` : '?'}${p.raison ? ` · *${p.raison}*` : ''}`).join('\n') : '*Aucun pour l\'instant.*').slice(0, 1024), inline: false },
          { name: 'Couverture de l\'indic', value: `${_jauge(r.exposition)} · ${_expoLabel(r.exposition)}`, inline: false },
        );
      await interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // 📜 Signaler un avis de recherche
    if (interaction.isButton?.() && cid === 'ripoux_prime_add') {
      const db = loadDB();
      if (!peutRipoux(interaction.member, db)) { await interaction.reply({ content: '🔒 Réservé à l\'indic et à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId('ripoux_prime_modal').setTitle('📜 Signaler un avis de recherche');
      modal.addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cible').setLabel('Qui est recherché ?').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant de la prime ($)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : 500')),
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('raison').setLabel('Motif').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(80)),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && cid === 'ripoux_prime_modal') {
      const db = loadDB(); const r = _ensure(db);
      const cible = interaction.fields.getTextInputValue('cible').trim();
      const montant = parseInt((interaction.fields.getTextInputValue('montant') || '').replace(/[^0-9]/g, ''), 10) || 0;
      const raison = (interaction.fields.getTextInputValue('raison') || '').trim();
      r.primes.push({ id: `${_now()}${Math.floor(Math.random() * 1000)}`, cible: cible.slice(0, 60), montant, raison: raison.slice(0, 80), at: _now() });
      if (r.primes.length > 30) r.primes = r.primes.slice(-30);
      r.heat = _clamp(r.heat + 10, 0, 100);
      saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.reply({ content: `📜 Avis de recherche enregistré : **${cible}**${montant ? ` ($${montant.toLocaleString('fr-FR')})` : ''}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // 🔥 Régler la pression (niveau de recherche)
    if (interaction.isButton?.() && cid === 'ripoux_heat_set') {
      const db = loadDB();
      if (!peutRipoux(interaction.member, db)) { await interaction.reply({ content: '🔒 Réservé à l\'indic et à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('ripoux_heat_select').setPlaceholder('Quel est le niveau de recherche actuel ?').addOptions(
        { label: 'Calme', value: 'calme', emoji: '🟢', description: 'La loi vous laisse tranquilles' },
        { label: 'Surveillés', value: 'surveilles', emoji: '🟡', description: 'Profil bas conseillé' },
        { label: 'Recherchés activement', value: 'recherches', emoji: '🟠', description: 'La loi est sur vos traces' },
        { label: 'Chasse à l\'homme', value: 'chasse', emoji: '🔴', description: 'Danger maximal' },
      );
      await interaction.reply({ content: '🔥 Indique le niveau de pression de la loi en ce moment :', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid === 'ripoux_heat_select') {
      const db = loadDB(); const r = _ensure(db);
      r.heat = HEAT_NIVEAUX[interaction.values[0]] ?? r.heat;
      saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.update({ content: `🔥 Niveau de recherche mis à jour : ${_heatLabel(r.heat)}`, components: [] }).catch(() => {});
      return true;
    }

    // 🧹 Faire disparaître un avis (gros risque pour la couverture)
    if (interaction.isButton?.() && cid === 'ripoux_avis_clear') {
      const db = loadDB(); const r = _ensure(db);
      if (!peutRipoux(interaction.member, db)) { await interaction.reply({ content: '🔒 Réservé à l\'indic et à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (!r.primes.length) { await interaction.reply({ content: '✅ Aucun avis de recherche à faire disparaître.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('ripoux_avis_select').setPlaceholder('Quel dossier faire disparaître ?')
        .addOptions(r.primes.slice(0, 25).map(p => ({ label: `${p.cible}`.slice(0, 100), description: `${p.montant ? '$' + p.montant : 'prime ?'}${p.raison ? ' · ' + p.raison : ''}`.slice(0, 100), value: p.id })));
      await interaction.reply({ content: '🧹 *Faire enterrer un dossier depuis le bureau du shérif — gros risque pour ta couverture.*', components: [new ActionRowBuilder().addComponents(menu)], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && cid === 'ripoux_avis_select') {
      const db = loadDB(); const r = _ensure(db);
      const id = interaction.values[0];
      const prime = r.primes.find(p => p.id === id);
      r.primes = r.primes.filter(p => p.id !== id);
      r.heat = _clamp(r.heat - 18, 0, 100);
      r.exposition = _clamp(r.exposition + EXPO_AVIS, 0, EXPO_MAX);
      saveDB(db);
      await _posterDossier(interaction.guild, `🧹 Dossier enterré — ${new Date().toLocaleDateString('fr-FR')}`, new EmbedBuilder().setColor(0x2E7D32).setAuthor({ name: `🎖️ ${r.nom}` }).setTitle('🧹 Un dossier a disparu').setDescription(`*L'avis de recherche sur **${prime?.cible || '—'}** a disparu des registres du shérif. Une faveur risquée — la couverture en prend un coup.*`).setFooter({ text: 'La Confrérie • Faveur dangereuse' }).setTimestamp());
      await _refreshPanel(interaction.guild);
      const alerte = r.exposition >= 85 ? '\n⚠️ *Ta couverture est très exposée maintenant — disparais un moment.*' : '';
      await interaction.update({ content: `✅ Avis sur **${prime?.cible || '—'}** effacé.${alerte}`, components: [] }).catch(() => {});
      return true;
    }

    // ⚙️ Config : désigner le membre + nom de couverture + reset exposition
    if (interaction.isButton?.() && cid === 'ripoux_config') {
      if (!peutGerer(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Confrérie.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const sel = new UserSelectMenuBuilder().setCustomId('ripoux_set_member').setPlaceholder('Désigner le membre qui joue le ripoux').setMinValues(1).setMaxValues(1);
      const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ripoux_set_nom').setLabel('✏️ Nom de couverture').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('ripoux_reset_expo').setLabel('🧊 Calmer le jeu (exposition 0)').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: '⚙️ **Réglages du Ripoux**\nChoisis le membre qui incarne l\'indic, son nom de couverture, ou réinitialise son exposition.', components: [new ActionRowBuilder().addComponents(sel), row2], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isUserSelectMenu?.() && cid === 'ripoux_set_member') {
      const db = loadDB(); const r = _ensure(db);
      r.userId = interaction.values[0]; saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.update({ content: `✅ Indic désigné : <@${r.userId}>. Il peut maintenant faire ses rapports.`, components: [] }).catch(() => {});
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
    if (interaction.isButton?.() && cid === 'ripoux_reset_expo') {
      const db = loadDB(); const r = _ensure(db);
      r.exposition = 0; saveDB(db);
      await _refreshPanel(interaction.guild);
      await interaction.update({ content: '🧊 Exposition réinitialisée — la couverture est de nouveau solide.', components: [] }).catch(() => {});
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
