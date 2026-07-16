// ───────────────────────────────────────────────────────────────────────────
//  prestations.js — CATALOGUE DES PRESTATIONS & TARIFS (la « carte » des services)
//  ----------------------------------------------------------------------------
//   • Panneau public listant les prestations de l'Iron Wolf Company avec leur
//     tarif indicatif + des formules/packs. Les clients le consultent, la
//     Direction ajuste les tarifs (modifier / ajouter / retirer / réinitialiser).
//   • Persisté en base (db.prestationsCatalogue). Préfixe presta_ : n'écrit
//     RIEN ailleurs.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

let dbMod = {}; try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const DIRECTION = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Secretaire'];
function estGestion(member) { if (global.aAccesTotal?.(member)) return true; try { return !!member?.roles?.cache?.some(r => DIRECTION.some(n => (r.name || '').includes(n))); } catch { return false; } }
const COULEUR = 0x8B1A1A;
const eph = MessageFlags.Ephemeral;

function _id() { return 'px' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5); }
function _clip(s, n) { s = (s == null ? '' : String(s)); return s.length > n ? s.slice(0, n - 1) + '…' : s; }

// Catalogue par défaut (tarifs RP indicatifs, ajustables par la Direction).
function _defaults() {
  return {
    prestations: [
      { id: 'esc', emoji: '🛡️', nom: 'Escorte de personne', tarif: '100 $ / mission', desc: "Accompagnement protégé d'un point A à un point B." },
      { id: 'cnv', emoji: '🚂', nom: 'Escorte de convoi / diligence', tarif: '150 $ / agent', desc: "Protection d'un convoi de marchandises ou d'une diligence." },
      { id: 'pro', emoji: '💂', nom: 'Protection rapprochée', tarif: '200 $ / jour', desc: 'Garde du corps permanent pour une personne à risque.' },
      { id: 'sec', emoji: '🏠', nom: "Sécurisation d'un lieu", tarif: '250 $ / événement', desc: "Sécurité d'un commerce, d'un ranch ou d'un événement." },
      { id: 'enq', emoji: '🔍', nom: 'Enquête / filature', tarif: '150 $ + prime au résultat', desc: "Recherche d'informations, surveillance, filature discrète." },
      { id: 'neg', emoji: '🤝', nom: 'Négociation / médiation', tarif: '100 $', desc: "Médiation d'un conflit ou négociation en votre nom." },
      { id: 'rec', emoji: '💰', nom: 'Récupération de biens / dette', tarif: '30 % du montant récupéré', desc: "Récupération d'un bien ou d'une dette impayée." },
      { id: 'bnt', emoji: '🪙', nom: 'Chasse à la prime (sur mandat)', tarif: 'Part de la prime', desc: "Capture d'un individu recherché, sur mandat légal." },
    ],
    packs: [
      { id: 'pk1', emoji: '🚂', nom: 'Pack Convoi sécurisé', tarif: '500 $', desc: "Escorte de convoi + 2 éclaireurs + repérage d'itinéraire." },
      { id: 'pk2', emoji: '🏛️', nom: 'Pack Événement', tarif: '800 $', desc: 'Sécurisation du lieu + protection rapprochée des hôtes.' },
      { id: 'pk3', emoji: '📅', nom: 'Protection permanente (semaine)', tarif: '1000 $ / semaine', desc: 'Garde du corps disponible en continu pendant 7 jours.' },
    ],
  };
}
function _ensure(db) {
  if (!db.prestationsCatalogue || typeof db.prestationsCatalogue !== 'object') db.prestationsCatalogue = {};
  const c = db.prestationsCatalogue;
  if (!Array.isArray(c.prestations) || !Array.isArray(c.packs)) {
    const d = _defaults();
    if (!Array.isArray(c.prestations)) c.prestations = d.prestations;
    if (!Array.isArray(c.packs)) c.packs = d.packs;
  }
  return c;
}
function _tousItems(c) { return [...c.prestations.map(p => ({ ...p, cat: 'presta' })), ...c.packs.map(p => ({ ...p, cat: 'pack' }))]; }
function _find(c, id) {
  let item = c.prestations.find(p => p.id === id); if (item) return { item, arr: c.prestations };
  item = c.packs.find(p => p.id === id); if (item) return { item, arr: c.packs };
  return { item: null, arr: null };
}

// ═══════════════════════════ AFFICHAGE ═══════════════════════════
function _catalogueEmbed(db) {
  const c = _ensure(db);
  const e = new EmbedBuilder().setColor(COULEUR).setTitle('📜 NOS PRESTATIONS & TARIFS — Iron Wolf Company')
    .setDescription('```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n  IRON WOLF COMPANY — SERVICES\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```\n*Sécurité, escorte, enquête — la Compagnie s\'engage par contrat.*');
  const fmt = a => a.map(p => `${p.emoji || '•'} **${p.nom}** — \`${p.tarif}\`${p.desc ? `\n　${p.desc}` : ''}`).join('\n');
  if (c.prestations.length) e.addFields({ name: '🛡️ Prestations à la carte', value: _clip(fmt(c.prestations), 1024) });
  if (c.packs.length) e.addFields({ name: '📦 Formules & packs', value: _clip(fmt(c.packs), 1024) });
  e.addFields({ name: '📝 Pour commander', value: 'Prends rendez-vous via le **panneau client** ou contacte le **Secrétariat**. Tarifs indicatifs, ajustables selon la mission et le risque.' });
  return e.setFooter({ text: 'Iron Wolf Company • Tarifs indicatifs — devis sur demande' }).setTimestamp();
}
function _rows() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('presta_edit').setLabel('Modifier un tarif').setEmoji('✏️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('presta_add').setLabel('Ajouter').setEmoji('➕').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('presta_del').setLabel('Retirer').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('presta_reset').setLabel('Réinitialiser').setEmoji('♻️').setStyle(ButtonStyle.Secondary),
  )];
}

// ═══════════════════════════ SALON + PANNEAU ═══════════════════════════
async function _resoudreSalon(guild) {
  try {
    const db = loadDB(); const c = _ensure(db);
    if (c.salonId) { const ch = await guild.channels.fetch(c.salonId).catch(() => null); if (ch) return ch; }
    const parNom = guild.channels.cache.find(ch => ch.type === 0 && /prestation|tarif|nos.?service|carte.?des.?service/i.test(ch.name || ''));
    if (parNom) { c.salonId = parNom.id; persist(db); return parNom; }
    // Salon public (visible des clients) → on calque un salon d'accueil/règlement.
    const refCh = guild.channels.cache.find(ch => ch.type === 0 && /accueil|reglement|règlement|bienvenue|informations|infos|annonce/i.test(ch.name || ''));
    const overwrites = refCh ? [...refCh.permissionOverwrites.cache.values()].map(o => ({ id: o.id, allow: o.allow.bitfield, deny: o.deny.bitfield })) : undefined;
    const cree = await guild.channels.create({
      name: '📜・nos-prestations', type: 0, parent: refCh?.parentId || null,
      topic: '📜 Nos prestations et tarifs — Iron Wolf Company.',
      permissionOverwrites: overwrites, reason: 'Catalogue des prestations & tarifs',
    }).catch(e => { console.log('⚠️ prestations création salon:', e.message); return null; });
    if (cree) { c.salonId = cree.id; persist(db); console.log('📜 Salon nos-prestations créé'); }
    return cree;
  } catch (e) { console.log('⚠️ prestations _resoudreSalon:', e.message); return null; }
}
async function installerPanneau(guild) {
  try {
    const ch = await _resoudreSalon(guild);
    if (!ch || typeof ch.send !== 'function') { console.log('⚠️ prestations: aucun salon'); return false; }
    const db = loadDB(); const c = _ensure(db);
    const payload = { embeds: [_catalogueEmbed(db)], components: _rows() };
    if (c.msgId) { const m = await ch.messages.fetch(c.msgId).catch(() => null); if (m) { await m.edit(payload).catch(() => {}); if (!m.pinned) await m.pin().catch(() => {}); return true; } }
    const recents = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    const deja = recents && [...recents.values()].find(m => m.author?.id === guild.members.me?.id && /NOS PRESTATIONS/i.test(m.embeds?.[0]?.title || ''));
    if (deja) { await deja.edit(payload).catch(() => {}); c.msgId = deja.id; persist(db); if (!deja.pinned) await deja.pin().catch(() => {}); return true; }
    const sent = await ch.send(payload).catch(() => null);
    if (sent) { c.msgId = sent.id; persist(db); await sent.pin().catch(() => {}); }
    return !!sent;
  } catch (e) { console.log('⚠️ prestations installerPanneau:', e.message); return false; }
}
async function _rafraichir(client) {
  try { const db = loadDB(); const c = _ensure(db); if (!c.salonId || !c.msgId) return; const ch = await client.channels.fetch(c.salonId).catch(() => null); if (!ch) return; const m = await ch.messages.fetch(c.msgId).catch(() => null); if (m) await m.edit({ embeds: [_catalogueEmbed(db)], components: _rows() }).catch(() => {}); } catch {}
}

// ═══════════════════════════ INTERACTIONS ═══════════════════════════
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith('presta_')) return false;
    const guard = async () => { if (estGestion(interaction.member)) return true; await interaction.reply({ content: '🔒 Réservé à la Direction / au Secrétariat.', flags: eph }).catch(() => {}); return false; };

    // ✏️ Modifier → choisir l'item
    if (interaction.isButton?.() && id === 'presta_edit') {
      if (!await guard()) return true;
      const c = _ensure(loadDB()); const items = _tousItems(c);
      if (!items.length) { await interaction.reply({ content: '📭 Catalogue vide.', flags: eph }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('presta_editsel').setPlaceholder('Quelle prestation modifier ?')
        .addOptions(items.slice(0, 25).map(p => ({ label: _clip(p.nom, 90), value: p.id, description: _clip(p.tarif, 90), emoji: p.emoji || undefined })));
      await interaction.reply({ content: '✏️ Choisis la prestation à modifier :', components: [new ActionRowBuilder().addComponents(menu)], flags: eph }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'presta_editsel') {
      if (!await guard()) return true;
      const { item } = _find(_ensure(loadDB()), interaction.values[0]);
      if (!item) { await interaction.reply({ content: '⚠️ Introuvable.', flags: eph }).catch(() => {}); return true; }
      const modal = new ModalBuilder().setCustomId(`presta_editmodal::${item.id}`).setTitle(_clip(`✏️ ${item.nom}`, 45))
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setValue(item.nom || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tarif').setLabel('Tarif').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setValue(item.tarif || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200).setValue(item.desc || '')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4).setValue(item.emoji || '')),
        );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && id.startsWith('presta_editmodal::')) {
      if (!await guard()) return true;
      const pid = id.split('::')[1]; const db = loadDB(); const { item } = _find(_ensure(db), pid);
      if (!item) { await interaction.reply({ content: '⚠️ Introuvable.', flags: eph }).catch(() => {}); return true; }
      item.nom = (interaction.fields.getTextInputValue('nom') || item.nom).trim();
      item.tarif = (interaction.fields.getTextInputValue('tarif') || item.tarif).trim();
      item.desc = (interaction.fields.getTextInputValue('desc') || '').trim();
      const em = (interaction.fields.getTextInputValue('emoji') || '').trim(); if (em) item.emoji = em;
      persist(db); await _rafraichir(interaction.client);
      await interaction.reply({ content: `✅ **${item.nom}** mis à jour — \`${item.tarif}\`.`, flags: eph }).catch(() => {});
      return true;
    }

    // ➕ Ajouter
    if (interaction.isButton?.() && id === 'presta_add') {
      if (!await guard()) return true;
      const modal = new ModalBuilder().setCustomId('presta_addmodal').setTitle('➕ Nouvelle prestation')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nom').setLabel('Nom').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('tarif').setLabel('Tarif').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : 150 $ / mission')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('desc').setLabel('Description').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(200)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('emoji').setLabel('Emoji (facultatif)').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(4)),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cat').setLabel('Catégorie : presta ou pack').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(10).setPlaceholder('presta')),
        );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && id === 'presta_addmodal') {
      if (!await guard()) return true;
      const db = loadDB(); const c = _ensure(db);
      const item = { id: _id(), emoji: (interaction.fields.getTextInputValue('emoji') || '•').trim() || '•', nom: (interaction.fields.getTextInputValue('nom') || '').trim(), tarif: (interaction.fields.getTextInputValue('tarif') || '').trim(), desc: (interaction.fields.getTextInputValue('desc') || '').trim() };
      const cat = (interaction.fields.getTextInputValue('cat') || 'presta').trim().toLowerCase();
      (cat.startsWith('pack') ? c.packs : c.prestations).push(item);
      persist(db); await _rafraichir(interaction.client);
      await interaction.reply({ content: `✅ Ajouté : ${item.emoji} **${item.nom}** — \`${item.tarif}\`.`, flags: eph }).catch(() => {});
      return true;
    }

    // 🗑️ Retirer
    if (interaction.isButton?.() && id === 'presta_del') {
      if (!await guard()) return true;
      const c = _ensure(loadDB()); const items = _tousItems(c);
      if (!items.length) { await interaction.reply({ content: '📭 Catalogue vide.', flags: eph }).catch(() => {}); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('presta_delsel').setPlaceholder('Quelle prestation retirer ?')
        .addOptions(items.slice(0, 25).map(p => ({ label: _clip(p.nom, 90), value: p.id, description: _clip(p.tarif, 90), emoji: p.emoji || undefined })));
      await interaction.reply({ content: '🗑️ Choisis la prestation à retirer :', components: [new ActionRowBuilder().addComponents(menu)], flags: eph }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && id === 'presta_delsel') {
      if (!await guard()) return true;
      const db = loadDB(); const c = _ensure(db); const pid = interaction.values[0];
      const before = c.prestations.length + c.packs.length;
      c.prestations = c.prestations.filter(p => p.id !== pid); c.packs = c.packs.filter(p => p.id !== pid);
      persist(db); await _rafraichir(interaction.client);
      await interaction.update({ content: before > c.prestations.length + c.packs.length ? '🗑️ Prestation retirée.' : '⚠️ Introuvable.', components: [] }).catch(() => {});
      return true;
    }

    // ♻️ Réinitialiser
    if (interaction.isButton?.() && id === 'presta_reset') {
      if (!await guard()) return true;
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('presta_reset_go').setLabel('Oui, réinitialiser').setEmoji('♻️').setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId('presta_reset_no').setLabel('Annuler').setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: '♻️ Réinitialiser le catalogue aux tarifs par défaut ? *(tes modifications seront perdues)*', components: [row], flags: eph }).catch(() => {});
      return true;
    }
    if (interaction.isButton?.() && id === 'presta_reset_no') { await interaction.update({ content: 'Annulé.', components: [] }).catch(() => {}); return true; }
    if (interaction.isButton?.() && id === 'presta_reset_go') {
      if (!await guard()) return true;
      const db = loadDB(); const c = _ensure(db); const d = _defaults(); c.prestations = d.prestations; c.packs = d.packs;
      persist(db); await _rafraichir(interaction.client);
      await interaction.update({ content: '♻️ Catalogue réinitialisé aux tarifs par défaut.', components: [] }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) { if ([10062, 40060].includes(e?.code)) return true; console.log('❌ prestations routeInteraction:', e.message); return true; }
}

module.exports = { installerPanneau, routeInteraction, _test: { _defaults, _ensure, _find, _tousItems } };
