// ───────────────────────────────────────────────────────────────────────────
//  repertoire.js — Carnet de contacts (RP)
//  ----------------------------------------------------------------------------
//  Un seul but : garder ses contacts, simplement et proprement.
//  Beau panneau épinglé, contacts groupés par type, et surtout une RECHERCHE
//  intuitive pour les retrouver vite (bouton 🔎 + option /repertoire recherche).
//  Système NEUF et ISOLÉ (db.repertoire) — ne touche à rien d'existant.
//
//  /repertoire-installer  (Direction → pose le panneau ici)
//  /repertoire [recherche]  (tout le monde → voir / chercher, en privé)
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags } = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const DIRECTION_ROLES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
function estDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLES.some(n => r.name.includes(n))); } catch { return false; }
}

// Types de contact (ordre d'affichage)
const TYPES = ['Allié', 'Client', 'Indic', 'Ennemi', 'Neutre'];
const TYPE_EMOJI = { 'Allié': '🤝', 'Client': '💰', 'Indic': '🕵️', 'Ennemi': '🎯', 'Neutre': '👤' };
const TYPE_PLURIEL = { 'Allié': 'Alliés', 'Client': 'Clients', 'Indic': 'Indics', 'Ennemi': 'Ennemis', 'Neutre': 'Neutres' };
const TYPE_ALIAS = {
  'Allié': ['allie', 'ami', 'amie', 'partenaire', 'allies'],
  'Client': ['client', 'donneur', 'commanditaire', 'cliente'],
  'Indic': ['indic', 'informateur', 'mouchard', 'source', 'espion', 'taupe'],
  'Ennemi': ['ennemi', 'cible', 'menace', 'hostile', 'rival', 'horsla', 'banni'],
  'Neutre': ['neutre', 'pnj', 'inconnu', 'autre', 'contact'],
};
const COULEUR = 0x6B4F2A;
const TITRE = "📇 RÉPERTOIRE DES CONTACTS";

function _norm(x) { return (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function _matchType(input) {
  const n = _norm(input); if (!n) return 'Neutre';
  for (const t of TYPES) { if (_norm(t) === n) return t; if (TYPE_ALIAS[t].some(a => n.includes(a))) return t; }
  return 'Neutre';
}
function _stars(n) { n = Math.max(0, Math.min(5, parseInt(n, 10) || 0)); return n ? "★".repeat(n) + "☆".repeat(5 - n) : "—"; }
function _id() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 6); }

function _ensure(db) {
  if (!db.repertoire) db.repertoire = {};
  const r = db.repertoire;
  if (!Array.isArray(r.contacts)) r.contacts = [];
  return r;
}

function _ligneContact(c) {
  const tg = c.telegramme ? `  ·  📨 ${c.telegramme}` : "";
  const fia = c.fiabilite ? `  ${_stars(c.fiabilite)}` : "";
  const note = c.notes ? `\n   ↳ ${String(c.notes).slice(0, 120)}` : "";
  return `**${c.nom}**${tg}${fia}${note}`;
}

function _panelEmbed(rep) {
  const contacts = rep.contacts || [];
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(TITRE)
    .setDescription("*Carnet de l'Iron Wolf Company & de La Confrérie.*\n*Alliés, clients, indics et menaces — de New Austin à la frontière du Rio Bravo.*")
    .setTimestamp().setFooter({ text: `Iron Wolf Company • ${contacts.length} contact(s) • 🔎 pour rechercher` });

  if (!contacts.length) {
    e.addFields({ name: "— Carnet vide —", value: "Clique sur **➕ Ajouter** pour inscrire ton premier contact.", inline: false });
    return e;
  }
  const recap = TYPES.map(t => `${TYPE_EMOJI[t]} ${TYPE_PLURIEL[t]} : **${contacts.filter(c => c.type === t).length}**`).join(" · ");
  e.addFields({ name: "📊 Aperçu", value: recap, inline: false });

  for (const t of TYPES) {
    const list = contacts.filter(c => c.type === t).sort((a, b) => (a.nom || '').localeCompare(b.nom || ''));
    if (!list.length) continue;
    let val = list.map(_ligneContact).join("\n");
    if (val.length > 1024) val = val.slice(0, 1000) + "\n…";
    e.addFields({ name: `${TYPE_EMOJI[t]} ${TYPE_PLURIEL[t]} (${list.length})`, value: val, inline: false });
  }
  return e;
}

function _panelButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("rep_add").setLabel("Ajouter").setEmoji("➕").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("rep_search").setLabel("Rechercher").setEmoji("🔎").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("rep_edit").setLabel("Modifier").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("rep_del").setLabel("Retirer").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
  );
}

async function _refreshPanel(client, rep) {
  try {
    if (!rep.channelId || !rep.panneau) return;
    const ch = await client.channels.fetch(rep.channelId).catch(() => null); if (!ch) return;
    const msg = await ch.messages.fetch(rep.panneau).catch(() => null); if (!msg) return;
    await msg.edit({ embeds: [_panelEmbed(rep)], components: [_panelButtons()] }).catch(() => {});
  } catch {}
}

// ── Recherche ──
function _filter(contacts, terme) {
  const n = _norm(terme); if (!n) return [];
  return (contacts || []).filter(c =>
    _norm(c.nom).includes(n) ||
    _norm(c.telegramme).includes(n) ||
    _norm(c.notes).includes(n) ||
    _norm(c.type).includes(n) ||
    _norm(TYPE_PLURIEL[c.type] || '').includes(n)
  );
}
function _resultsEmbed(matches, terme) {
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(`🔎 Recherche — « ${terme} »`)
    .setFooter({ text: "Iron Wolf Company • répertoire" });
  if (!matches.length) { e.setDescription(`Aucun contact ne correspond à **${terme}**.\n*Essaie un nom, un télégramme, un type (allié, client, indic…) ou un mot des notes.*`); return e; }
  const sorted = matches.slice().sort((a, b) => {
    const ti = TYPES.indexOf(a.type) - TYPES.indexOf(b.type); return ti !== 0 ? ti : (a.nom || '').localeCompare(b.nom || '');
  });
  const lignes = sorted.slice(0, 25).map(c => `${TYPE_EMOJI[c.type] || '👤'} ${_ligneContact(c)}`);
  e.setDescription(lignes.join("\n\n").slice(0, 4000));
  e.addFields({ name: "\u200b", value: `**${matches.length}** résultat(s)${matches.length > 25 ? " — affiche les 25 premiers" : ""}`, inline: false });
  return e;
}

function _formModal(customId, titre, c) {
  c = c || {};
  const m = new ModalBuilder().setCustomId(customId).setTitle(titre);
  const nom = new TextInputBuilder().setCustomId("nom").setLabel("Nom du contact").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80);
  const type = new TextInputBuilder().setCustomId("type").setLabel("Type").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(20)
    .setPlaceholder("Allié / Client / Indic / Ennemi / Neutre");
  const tg = new TextInputBuilder().setCustomId("telegramme").setLabel("Télégramme de la personne (optionnel)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder("n° ou adresse de télégramme");
  const fiab = new TextInputBuilder().setCustomId("fiabilite").setLabel("Fiabilité de 1 à 5 (optionnel)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(1).setPlaceholder("ex : 4");
  const notes = new TextInputBuilder().setCustomId("notes").setLabel("Notes (optionnel)").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(400);
  if (c.nom) nom.setValue(c.nom);
  if (c.type) type.setValue(c.type);
  if (c.telegramme) tg.setValue(String(c.telegramme));
  if (c.fiabilite) fiab.setValue(String(c.fiabilite));
  if (c.notes) notes.setValue(String(c.notes));
  m.addComponents(
    new ActionRowBuilder().addComponents(nom),
    new ActionRowBuilder().addComponents(type),
    new ActionRowBuilder().addComponents(tg),
    new ActionRowBuilder().addComponents(fiab),
    new ActionRowBuilder().addComponents(notes),
  );
  return m;
}

function _selectMenu(rep, action) {
  const contacts = (rep.contacts || []).slice().sort((a, b) => {
    const ti = TYPES.indexOf(a.type) - TYPES.indexOf(b.type); return ti !== 0 ? ti : (a.nom || '').localeCompare(b.nom || '');
  }).slice(0, 25);
  const menu = new StringSelectMenuBuilder().setCustomId(`repsel::${action}`).setPlaceholder("Choisis un contact…")
    .addOptions(contacts.map(c => ({
      label: (c.nom || 'Sans nom').slice(0, 100),
      description: `${TYPE_PLURIEL[c.type] || c.type}${c.telegramme ? ' · 📨 ' + c.telegramme : ''}`.slice(0, 100),
      value: c.id,
    })));
  return { row: new ActionRowBuilder().addComponents(menu) };
}

const repertoireCommands = [
  new SlashCommandBuilder().setName("repertoire-installer").setDescription("📇 Poser le panneau du répertoire de contacts dans CE salon (Direction)"),
  new SlashCommandBuilder().setName("repertoire").setDescription("📇 Voir ou rechercher dans le carnet de contacts (en privé)")
    .addStringOption(o => o.setName("recherche").setDescription("Nom, télégramme, type ou mot-clé").setRequired(false)),
];

async function routeInteraction(interaction) {
  try {
    // ── Installer le panneau ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "repertoire-installer") {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: "🔒 Réservé à la Direction.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const rep = _ensure(db);
      rep.channelId = interaction.channelId;
      const m = await interaction.channel.send({ embeds: [_panelEmbed(rep)], components: [_panelButtons()] }).catch(() => null);
      if (!m) { await interaction.editReply({ content: "❌ Je n'ai pas pu poster ici (vérifie mes permissions d'écriture)." }).catch(() => {}); return true; }
      rep.panneau = m.id; try { await m.pin(); } catch {}
      persist(db);
      await interaction.editReply({ content: "✅ Répertoire installé : panneau épinglé. Ajoute avec ➕, retrouve avec 🔎 — c'est un carnet à part, rien d'autre n'est touché." }).catch(() => {});
      return true;
    }

    // ── Voir / rechercher (commande) ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "repertoire") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const rep = _ensure(db);
      const terme = (interaction.options.getString("recherche") || "").trim();
      if (terme) { await interaction.editReply({ embeds: [_resultsEmbed(_filter(rep.contacts, terme), terme)], components: [_panelButtons()] }).catch(() => {}); return true; }
      await interaction.editReply({ embeds: [_panelEmbed(rep)], components: [_panelButtons()] }).catch(() => {});
      return true;
    }

    // ── Bouton Ajouter ──
    if (interaction.isButton?.() && interaction.customId === "rep_add") {
      await interaction.showModal(_formModal("repm::add", "➕ Nouveau contact")).catch(() => {});
      return true;
    }

    // ── Bouton Rechercher → modal ──
    if (interaction.isButton?.() && interaction.customId === "rep_search") {
      const m = new ModalBuilder().setCustomId("repm_search").setTitle("🔎 Rechercher un contact");
      const terme = new TextInputBuilder().setCustomId("terme").setLabel("Nom, télégramme, type ou mot-clé").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60)
        .setPlaceholder("ex : Colt, Del Lobos, indic, Armadillo…");
      m.addComponents(new ActionRowBuilder().addComponents(terme));
      await interaction.showModal(m).catch(() => {});
      return true;
    }

    // ── Soumission recherche ──
    if (interaction.isModalSubmit?.() && interaction.customId === "repm_search") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const rep = _ensure(db);
      const terme = (interaction.fields.getTextInputValue("terme") || "").trim();
      await interaction.editReply({ embeds: [_resultsEmbed(_filter(rep.contacts, terme), terme)] }).catch(() => {});
      return true;
    }

    // ── Boutons Modifier / Retirer → menu de sélection ──
    if (interaction.isButton?.() && (interaction.customId === "rep_edit" || interaction.customId === "rep_del")) {
      const db = loadDB(); const rep = _ensure(db);
      if (!rep.contacts.length) { await interaction.reply({ content: "📭 Le carnet est vide — ajoute d'abord un contact.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const action = interaction.customId === "rep_edit" ? "edit" : "del";
      const { row } = _selectMenu(rep, action);
      const extra = rep.contacts.length > 25 ? `\n*(${rep.contacts.length} contacts — les 25 premiers sont listés ; utilise 🔎 sinon)*` : "";
      await interaction.reply({ content: `${action === "edit" ? "✏️ Quel contact modifier ?" : "🗑️ Quel contact retirer ?"}${extra}`, components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // ── Sélection d'un contact (modifier → modal / retirer → confirmation) ──
    if (interaction.isStringSelectMenu?.() && interaction.customId.startsWith("repsel::")) {
      const action = interaction.customId.split("::")[1];
      const cid = interaction.values?.[0];
      const db = loadDB(); const rep = _ensure(db);
      const c = rep.contacts.find(x => x.id === cid);
      if (!c) { await interaction.reply({ content: "⚠️ Contact introuvable (déjà supprimé ?).", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (action === "edit") {
        await interaction.showModal(_formModal(`repm::edit::${c.id}`, "✏️ Modifier le contact", c)).catch(() => {});
        return true;
      }
      // del → confirmation
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`repdel::y::${c.id}`).setLabel("Supprimer").setEmoji("🗑️").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId("repdel::n").setLabel("Annuler").setStyle(ButtonStyle.Secondary),
      );
      await interaction.reply({ content: `⚠️ Supprimer **${c.nom}** (${TYPE_PLURIEL[c.type] || c.type}) du carnet ? Cette action est définitive.`, components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    // ── Confirmation de suppression ──
    if (interaction.isButton?.() && interaction.customId.startsWith("repdel::")) {
      const [, verdict, cid] = interaction.customId.split("::");
      await interaction.deferUpdate().catch(() => {});
      if (verdict === "n") { await interaction.editReply({ content: "❌ Suppression annulée.", components: [] }).catch(() => {}); return true; }
      const db = loadDB(); const rep = _ensure(db);
      const idx = rep.contacts.findIndex(x => x.id === cid);
      if (idx < 0) { await interaction.editReply({ content: "⚠️ Contact déjà supprimé.", components: [] }).catch(() => {}); return true; }
      const nom = rep.contacts[idx].nom;
      rep.contacts.splice(idx, 1);
      persist(db);
      await _refreshPanel(interaction.client, rep);
      await interaction.editReply({ content: `🗑️ **${nom}** retiré du carnet.`, components: [] }).catch(() => {});
      return true;
    }

    // ── Soumission du formulaire (ajout ou modification) ──
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith("repm::")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const parts = interaction.customId.split("::"); // repm::add | repm::edit::<id>
      const mode = parts[1]; const cid = parts[2] || null;
      const nom = (interaction.fields.getTextInputValue("nom") || "").trim().slice(0, 80);
      const type = _matchType(interaction.fields.getTextInputValue("type"));
      const telegramme = (interaction.fields.getTextInputValue("telegramme") || "").trim().slice(0, 60);
      const fiabRaw = parseInt((interaction.fields.getTextInputValue("fiabilite") || "").replace(/[^0-9]/g, ""), 10);
      const fiabilite = Number.isFinite(fiabRaw) ? Math.max(0, Math.min(5, fiabRaw)) : 0;
      const notes = (interaction.fields.getTextInputValue("notes") || "").trim().slice(0, 400);
      if (!nom) { await interaction.editReply({ content: "❌ Le nom est obligatoire." }).catch(() => {}); return true; }

      const db = loadDB(); const rep = _ensure(db);
      if (mode === "edit" && cid) {
        const c = rep.contacts.find(x => x.id === cid);
        if (!c) { await interaction.editReply({ content: "⚠️ Contact introuvable (déjà supprimé ?)." }).catch(() => {}); return true; }
        c.nom = nom; c.type = type; c.telegramme = telegramme; c.fiabilite = fiabilite; c.notes = notes; c.maj = Date.now(); c.par = interaction.user.id;
        persist(db);
        await _refreshPanel(interaction.client, rep);
        await interaction.editReply({ content: `✏️ **${nom}** mis à jour dans le carnet.` }).catch(() => {});
        return true;
      }
      rep.contacts.push({ id: _id(), nom, type, telegramme, fiabilite, notes, par: interaction.user.id, maj: Date.now() });
      persist(db);
      await _refreshPanel(interaction.client, rep);
      await interaction.editReply({ content: `✅ **${nom}** ajouté au carnet (${TYPE_EMOJI[type]} ${TYPE_PLURIEL[type]}).` }).catch(() => {});
      return true;
    }

    return false;
  } catch (err) {
    if ([10062, 10008, 40060].includes(err?.code)) return true;
    console.log("❌ repertoire routeInteraction:", err.message);
    return true;
  }
}

module.exports = { repertoireCommands, routeInteraction };
