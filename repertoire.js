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
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, MessageFlags, AttachmentBuilder } = require('discord.js');

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
function _stars(n) { n = Math.max(0, Math.min(5, parseInt(n, 10) || 0)); return n ? "⭐".repeat(n) + "☆".repeat(5 - n) : "—"; }
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

// ═══ /contact — fiche de contact au format exact (formulaire guidé) ═══
const _contactDrafts = new Map(); // draftId -> { champs..., userId, at }
function _cleanupDrafts() { const now = Date.now(); for (const [k, v] of _contactDrafts) { if (now - (v.at || 0) > 3600000) _contactDrafts.delete(k); } }
const _pendingPhoto = new Map(); // userId -> { url, ct, at } : photo jointe à /contact, en attente du formulaire
const SALON_PANEL_CONTACT = '1518385544860667945'; // salon où poser le panneau « Nouvelle fiche »
async function _imageBytes(url) { try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; } }
const C_AFFILIATIONS = ["Civil", "Loi", "Hors-la-loi", "Loups de Fer", "Cartel", "Autre"];
const C_RELATIONS = ["Amicale", "Professionnelle", "Affaire", "Tendue", "Hostile"];
const C_STATUTS = ["Vivant", "Disparu", "Recherché", "Décédé"];

function _richFiche(d) {
  const v = (x, def) => (x && String(x).trim()) ? String(x).trim() : (def || "—");
  return [
    `# 🎴 ${v(d.nomsurnom, "Inconnu")}`,
    `-# Fiche de contact · La Confrérie`,
    ``,
    `📟 **Télégramme** — ${v(d.telegramme)}`,
    `💼 **Métier** — ${v(d.metier)}`,
    `📍 **Secteur** — ${v(d.secteur)}`,
    `🪪 **Affiliation** — ${v(d.affiliation)}`,
    `🤝 **Relation** — ${v(d.relation)}`,
    `⭐ **Fiabilité** — ${_stars(d.fiabilite)}`,
    `🩸 **Statut** — ${v(d.statut)}`,
    `🗓️ **Dernier contact** — ${v(d.dernierContact)}`,
    `👤 **Fiche établie par** — ${v(d.creeParNom)}`,
    ``,
    `📝 **Notes**`,
    v(d.notes, "—"),
  ].join("\n");
}
function _contactFormModal() {
  const m = new ModalBuilder().setCustomId("contact_form").setTitle("🎴 Nouvelle fiche de contact");
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("nomsurnom").setLabel("Nom & surnom").setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(80).setPlaceholder("Cole Bradford « Le Coyote »")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("telegramme").setLabel("Télégramme (numéro)").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(40).setPlaceholder("00000")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("metier").setLabel("Métier").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder("Forgeron, contrebandier, shérif…")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("secteur").setLabel("Secteur / lieu").setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(60).setPlaceholder("Armadillo, Tumbleweed, Fort Mercer, Rio Bravo…")),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId("notes").setLabel("Notes").setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder("Où on l'a croisé, ce qu'il peut fournir, prudences…")),
  );
  return m;
}
function _contactSelectsMsg(d, draftId) {
  const selRow = (cid, ph, opts, chosen) => new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(cid).setPlaceholder(ph).addOptions(opts.map(o => ({ label: o, value: o, default: chosen === o })))
  );
  const fiaOpts = [1, 2, 3, 4, 5].map(n => ({ label: "⭐".repeat(n) + "☆".repeat(5 - n), value: String(n), default: String(d.fiabilite) === String(n) }));
  const rows = [
    selRow(`contact_aff::${draftId}`, "🪪 Affiliation", C_AFFILIATIONS, d.affiliation),
    selRow(`contact_rel::${draftId}`, "🤝 Relation", C_RELATIONS, d.relation),
    new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`contact_fia::${draftId}`).setPlaceholder("⭐ Fiabilité").addOptions(fiaOpts)),
    selRow(`contact_sta::${draftId}`, "🩸 Statut", C_STATUTS, d.statut),
    new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`contact_gen::${draftId}`).setLabel("Générer la fiche").setEmoji("🎴").setStyle(ButtonStyle.Success)),
  ];
  const recap = `**🎴 ${d.nomsurnom}**\nComplète les 4 menus puis clique **Générer la fiche** :\n\n🪪 Affiliation — ${d.affiliation || "*à choisir*"}\n🤝 Relation — ${d.relation || "*à choisir*"}\n⭐ Fiabilité — ${d.fiabilite ? _stars(d.fiabilite) : "*à choisir*"}\n🩸 Statut — ${d.statut || "*à choisir*"}`;
  return { content: recap, components: rows };
}
function _deriveType(d) {
  const aff = _norm(d.affiliation), rel = _norm(d.relation);
  if (/horsla|cartel/.test(aff) || /hostile|tendue/.test(rel)) return 'Ennemi';
  if (/amicale/.test(rel) || /loupsdefer/.test(aff)) return 'Allié';
  if (/affaire|professionnelle/.test(rel)) return 'Client';
  return 'Neutre';
}
const FORUM_REPERTOIRE = '1517505221629050901'; // forum dédié au répertoire de contacts (même principe que les opérations)
function _ficheRow(contactId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`contact_edit::${contactId}`).setLabel("Modifier").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`contact_photo::${contactId}`).setLabel("Photo").setEmoji("📸").setStyle(ButtonStyle.Secondary),
  );
}
// Modal pré-rempli pour MODIFIER une fiche existante (les champs à menus se rechoisissent ensuite).
function _contactEditModal(d, draftId) {
  const m = new ModalBuilder().setCustomId(`contact_form::e::${draftId}`).setTitle("✏️ Modifier la fiche");
  const f = (id, label, val, para, max, ph, req) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(para ? TextInputStyle.Paragraph : TextInputStyle.Short).setRequired(!!req).setMaxLength(max);
    if (ph) t.setPlaceholder(ph);
    const vv = (val == null ? "" : String(val)).slice(0, max);
    if (vv) t.setValue(vv);
    return new ActionRowBuilder().addComponents(t);
  };
  m.addComponents(
    f("nomsurnom", "Nom & surnom", d.nomsurnom, false, 80, "Cole Bradford « Le Coyote »", true),
    f("telegramme", "Télégramme (numéro)", d.telegramme, false, 40, "00000", false),
    f("metier", "Métier", d.metier, false, 60, "Forgeron, contrebandier, shérif…", false),
    f("secteur", "Secteur / lieu", d.secteur, false, 60, "Armadillo, Tumbleweed…", false),
    f("notes", "Notes", d.notes, true, 500, "Où on l'a croisé, ce qu'il peut fournir…", false),
  );
  return m;
}
async function _publierFiche(interaction, d, fiche, contactId, editRefs, opts) {
  try {
    const guild = interaction.guild;
    const withPhoto = !!(opts && opts.withPhoto); // (re)pose la photo sur le message édité
    // ── MODIFICATION en place : édite le message existant (contenu + bouton) ──
    // Par défaut on ne touche pas à la photo ; avec withPhoto on la (re)pose comme portrait.
    if (editRefs) {
      try {
        const corpsE = fiche.slice(0, 1900);
        const boutonsE = contactId ? [_ficheRow(contactId)] : [];
        let msg = null;
        if (editRefs.threadId) {
          const th = await guild.channels.fetch(editRefs.threadId).catch(() => null);
          if (th) msg = await th.fetchStarterMessage().catch(() => null) || (editRefs.msgId ? await th.messages.fetch(editRefs.msgId).catch(() => null) : null);
        } else if (editRefs.channelId && editRefs.msgId) {
          const ch = await guild.channels.fetch(editRefs.channelId).catch(() => null);
          if (ch) msg = await ch.messages.fetch(editRefs.msgId).catch(() => null);
        }
        if (msg) {
          const payload = { content: corpsE, components: boutonsE };
          if (withPhoto) {
            const buf = d.photoUrl ? await _imageBytes(d.photoUrl) : null;
            payload.files = buf ? [new AttachmentBuilder(buf, { name: 'contact.png' })] : [];
            payload.attachments = []; // remplace l'ancienne photo éventuelle
          }
          await msg.edit(payload).catch(() => {});
          return { where: "la fiche", refs: editRefs };
        }
      } catch {}
      return null; // message d'origine introuvable (supprimé ?)
    }
    const clean = s => (s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
    const titre = `🎴 ${(d.nomsurnom || "Contact").slice(0, 90)}`.slice(0, 100);
    const corps = fiche.slice(0, 1900);
    // Photo optionnelle : fichier réuploadé (pas de lien). On recrée la pièce jointe à chaque tentative d'envoi.
    let buf = null;
    if (d.photoUrl) buf = await _imageBytes(d.photoUrl);
    const mkPayload = () => { const p = buf ? { content: corps, files: [new AttachmentBuilder(buf, { name: 'contact.png' })] } : { content: corps }; if (contactId) p.components = [_ficheRow(contactId)]; return p; };
    // 1) Forum dédié (ID fixe), sinon recherche par nom — on crée un POST de forum (comme les opérations)
    let forum = guild.channels.cache.get(FORUM_REPERTOIRE);
    if (!forum || forum.type !== 15) forum = guild.channels.cache.find(c => c.type === 15 && /repertoire|contact|carnet|annuaire/.test(clean(c.name)));
    if (forum && forum.type === 15 && forum.threads?.create) {
      const tags = forum.availableTags || [];
      const veut = [d.relation, _deriveType(d), d.affiliation, d.statut].filter(Boolean).map(clean);
      const appliedTags = tags.filter(t => veut.some(w => w && (clean(t.name).includes(w) || w.includes(clean(t.name))))).map(t => t.id).slice(0, 5);
      const opts = { name: titre, message: mkPayload() };
      if (appliedTags.length) opts.appliedTags = appliedTags;
      let post = await forum.threads.create(opts).catch(() => null);
      if (!post && appliedTags.length) post = await forum.threads.create({ name: titre, message: mkPayload() }).catch(() => null); // repli sans étiquettes
      if (post) return { where: `<#${forum.id}>`, refs: { threadId: post.id, channelId: forum.id } };
    }
    // 2) Salon texte répertoire
    const textCh = guild.channels.cache.find(c => c.type !== 15 && c.isTextBased?.() && /repertoire|contact|carnet|annuaire/.test(clean(c.name)));
    if (textCh) { const m = await textCh.send(mkPayload()).catch(() => null); if (m) return { where: `<#${textCh.id}>`, refs: { channelId: textCh.id, msgId: m.id } }; }
    // 3) Salon courant
    if (interaction.channel && typeof interaction.channel.send === "function") { const m = await interaction.channel.send(mkPayload()).catch(() => null); if (m) return { where: "ce salon", refs: { channelId: interaction.channel.id, msgId: m.id } }; }
    return null;
  } catch { return null; }
}
// ── Panneau « Nouvelle fiche de contact » (salon dédié) ──
function _panelContactEmbed() {
  return new EmbedBuilder().setColor(COULEUR).setTitle("🎴 NOUVELLE FICHE DE CONTACT")
    .setDescription("*Un visage croisé sur la piste ? Inscris-le au carnet.*\n\nClique sur **🎴 Nouvelle fiche** pour remplir le formulaire — la fiche sera publiée proprement dans le répertoire.\n\n📸 *Pour ajouter le portrait de la personne, clique sur* **📸 Photo** *sous la fiche une fois créée (glisse une image), ou crée-la directement avec la commande* `/contact`*.*")
    .setFooter({ text: "Iron Wolf Company • Le Carnet" });
}
function _panelContactButtons() {
  return new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("contact_new").setLabel("Nouvelle fiche").setEmoji("🎴").setStyle(ButtonStyle.Success));
}
async function installerPanelContact(guild) {
  try {
    const ch = guild.channels.cache.get(SALON_PANEL_CONTACT);
    if (!ch || typeof ch.send !== "function") return;
    const uid = guild.client?.user?.id;
    const msgs = await ch.messages.fetch({ limit: 20 }).catch(() => null);
    if (msgs && msgs.find(m => m.author.id === uid && (m.embeds?.[0]?.title || "").includes("NOUVELLE FICHE DE CONTACT"))) return;
    const sent = await ch.send({ embeds: [_panelContactEmbed()], components: [_panelContactButtons()] }).catch(() => null);
    if (sent) await sent.pin().catch(() => {});
  } catch (e) { console.log("⚠️ install panneau contact:", e.message); }
}

const repertoireCommands = [
  new SlashCommandBuilder().setName("repertoire-installer").setDescription("📇 Poser le panneau du répertoire de contacts dans CE salon (Direction)"),
  new SlashCommandBuilder().setName("repertoire").setDescription("📇 Voir ou rechercher dans le carnet de contacts (en privé)")
    .addStringOption(o => o.setName("recherche").setDescription("Nom, télégramme, type ou mot-clé").setRequired(false)),
  new SlashCommandBuilder().setName("contact").setDescription("🎴 Créer une fiche de contact (formulaire, photo en option)")
    .addAttachmentOption(o => o.setName("photo").setDescription("Photo du contact (optionnel — glisse un fichier image)").setRequired(false)),
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

    // ═══ /contact — formulaire guidé → fiche au format exact ═══
    if (interaction.isChatInputCommand?.() && interaction.commandName === "contact") {
      const photo = interaction.options.getAttachment?.("photo");
      if (photo && (photo.contentType || "").startsWith("image")) _pendingPhoto.set(interaction.user.id, { url: photo.url, ct: photo.contentType, at: Date.now() });
      else _pendingPhoto.delete(interaction.user.id);
      await interaction.showModal(_contactFormModal()).catch(() => {});
      return true;
    }
    // Bouton du panneau « Nouvelle fiche » (flux rapide, sans photo)
    if (interaction.isButton?.() && interaction.customId === "contact_new") {
      _pendingPhoto.delete(interaction.user.id);
      await interaction.showModal(_contactFormModal()).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && (interaction.customId || "").startsWith("contact_form::e::")) {
      _cleanupDrafts();
      const editDraftId = interaction.customId.split("::")[2];
      const d = _contactDrafts.get(editDraftId);
      if (!d) { await interaction.reply({ content: "⌛ Modification expirée — rouvre la fiche et reclique **✏️ Modifier**.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      d.nomsurnom = (interaction.fields.getTextInputValue("nomsurnom") || "").trim();
      d.telegramme = (interaction.fields.getTextInputValue("telegramme") || "").trim();
      d.metier = (interaction.fields.getTextInputValue("metier") || "").trim();
      d.secteur = (interaction.fields.getTextInputValue("secteur") || "").trim();
      d.notes = (interaction.fields.getTextInputValue("notes") || "").trim();
      d.at = Date.now();
      await interaction.reply({ ..._contactSelectsMsg(d, editDraftId), flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isModalSubmit?.() && interaction.customId === "contact_form") {
      _cleanupDrafts();
      const draftId = _id();
      const pend = _pendingPhoto.get(interaction.user.id);
      const photoUrl = (pend && (Date.now() - pend.at) < 600000) ? pend.url : null;
      _pendingPhoto.delete(interaction.user.id);
      _contactDrafts.set(draftId, {
        nomsurnom: (interaction.fields.getTextInputValue("nomsurnom") || "").trim(),
        telegramme: (interaction.fields.getTextInputValue("telegramme") || "").trim(),
        metier: (interaction.fields.getTextInputValue("metier") || "").trim(),
        secteur: (interaction.fields.getTextInputValue("secteur") || "").trim(),
        notes: (interaction.fields.getTextInputValue("notes") || "").trim(),
        affiliation: "", relation: "", fiabilite: "", statut: "",
        dernierContact: new Date().toLocaleDateString("fr-FR"),
        photoUrl,
        creeParNom: interaction.member?.displayName || interaction.user.username,
        userId: interaction.user.id, at: Date.now(),
      });
      const d = _contactDrafts.get(draftId);
      await interaction.reply({ ..._contactSelectsMsg(d, draftId), flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    if (interaction.isStringSelectMenu?.() && /^contact_(aff|rel|fia|sta)::/.test(interaction.customId || "")) {
      const [key, draftId] = interaction.customId.split("::");
      const d = _contactDrafts.get(draftId);
      if (!d) { await interaction.update({ content: "⌛ Fiche expirée — relance `/contact`.", components: [] }).catch(() => {}); return true; }
      const val = interaction.values[0];
      if (key === "contact_aff") d.affiliation = val;
      else if (key === "contact_rel") d.relation = val;
      else if (key === "contact_fia") d.fiabilite = val;
      else if (key === "contact_sta") d.statut = val;
      d.at = Date.now();
      await interaction.update(_contactSelectsMsg(d, draftId)).catch(() => {});
      return true;
    }
    // ── Ouvrir la modification d'une fiche publiée (bouton ✏️ sur la fiche) ──
    if (interaction.isButton?.() && (interaction.customId || "").startsWith("contact_edit::")) {
      const cid = interaction.customId.split("::")[1];
      const db = loadDB(); const rep = _ensure(db);
      const c = (rep.contacts || []).find(x => x.id === cid);
      if (!c) { await interaction.reply({ content: "⚠️ Fiche introuvable (peut-être supprimée du carnet).", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (!estDirection(interaction.member) && c.par !== interaction.user.id) { await interaction.reply({ content: "🔒 Seuls la Direction ou le créateur de la fiche peuvent la modifier.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      _cleanupDrafts();
      const draftId = _id();
      _contactDrafts.set(draftId, {
        nomsurnom: c.nom || c.nomsurnom || "", telegramme: c.telegramme || "", metier: c.metier || "", secteur: c.secteur || "", notes: c.notes || "",
        affiliation: c.affiliation || "", relation: c.relation || "", fiabilite: c.fiabilite ? String(c.fiabilite) : "", statut: c.statut || "",
        dernierContact: new Date().toLocaleDateString("fr-FR"),
        photoUrl: c.photoUrl || null,
        editContactId: c.id, ficheRefs: c.ficheRefs || null,
        creeParNom: c.creeParNom || "—",
        userId: interaction.user.id, at: Date.now(),
      });
      await interaction.showModal(_contactEditModal(_contactDrafts.get(draftId), draftId)).catch(() => {});
      return true;
    }
    // ── Ajouter / changer la photo (portrait) d'une fiche publiée (bouton 📸) ──
    // Les modals Discord n'acceptent pas de fichier : on capture la prochaine image déposée par l'auteur.
    if (interaction.isButton?.() && (interaction.customId || "").startsWith("contact_photo::")) {
      const cid = interaction.customId.split("::")[1];
      const db = loadDB(); const rep = _ensure(db);
      const c = (rep.contacts || []).find(x => x.id === cid);
      if (!c) { await interaction.reply({ content: "⚠️ Fiche introuvable (peut-être supprimée du carnet).", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (!estDirection(interaction.member) && c.par !== interaction.user.id) { await interaction.reply({ content: "🔒 Seuls la Direction ou le créateur de la fiche peuvent changer la photo.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const ch = interaction.channel;
      if (!ch || typeof ch.createMessageCollector !== "function") { await interaction.reply({ content: "❌ Impossible d'attendre une photo ici. Utilise plutôt `/contact` avec une photo jointe.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const _estImg = a => (a?.contentType || "").startsWith("image") || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(a?.name || a?.url || "");
      await interaction.reply({ content: `📸 **Glisse une image dans ce salon dans les 2 minutes** pour l'ajouter à la fiche de **${c.nom || "ce contact"}** — ce sera son portrait.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      const collector = ch.createMessageCollector({
        filter: m => m.author?.id === interaction.user.id && [...(m.attachments?.values?.() || [])].some(_estImg),
        time: 120000, max: 1,
      });
      collector.on("collect", async (m) => {
        try {
          const img = [...m.attachments.values()].find(_estImg);
          if (!img) return;
          const db2 = loadDB(); const rep2 = _ensure(db2);
          const c2 = (rep2.contacts || []).find(x => x.id === cid);
          if (!c2) { await interaction.followUp({ content: "⚠️ Fiche introuvable entre-temps.", flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
          c2.photoUrl = img.url; c2.maj = Date.now();
          persist(db2);
          const d = { nomsurnom: c2.nom, telegramme: c2.telegramme, metier: c2.metier, secteur: c2.secteur, affiliation: c2.affiliation, relation: c2.relation, fiabilite: c2.fiabilite, statut: c2.statut, dernierContact: c2.dernierContact, creeParNom: c2.creeParNom, notes: c2.notes, photoUrl: c2.photoUrl };
          const fiche = _richFiche(d);
          let res = null;
          if (c2.ficheRefs) res = await _publierFiche(interaction, d, fiche, c2.id, c2.ficheRefs, { withPhoto: true });
          if (!res) { res = await _publierFiche(interaction, d, fiche, c2.id, null); if (res && res.refs) { c2.ficheRefs = res.refs; persist(db2); } }
          await m.delete().catch(() => {});
          await interaction.followUp({ content: res ? `📸 Photo ajoutée à la fiche de **${c2.nom}**.` : `📸 Photo enregistrée pour **${c2.nom}** (mais le message de la fiche n'a pas pu être mis à jour).`, flags: MessageFlags.Ephemeral }).catch(() => {});
        } catch (e) { console.log("⚠️ contact_photo collect:", e.message); }
      });
      collector.on("end", async (collected) => {
        if (!collected.size) await interaction.followUp({ content: "⌛ Aucune image reçue — réessaie en cliquant **📸 Photo** sous la fiche.", flags: MessageFlags.Ephemeral }).catch(() => {});
      });
      return true;
    }
    if (interaction.isButton?.() && (interaction.customId || "").startsWith("contact_gen::")) {
      const draftId = interaction.customId.split("::")[1];
      const d = _contactDrafts.get(draftId);
      if (!d) { await interaction.update({ content: "⌛ Fiche expirée — relance `/contact`.", components: [] }).catch(() => {}); return true; }
      await interaction.deferUpdate().catch(() => {});
      const fiche = _richFiche(d);
      const db = loadDB(); const rep = _ensure(db);
      // ── MODIFICATION d'une fiche existante ──
      if (d.editContactId) {
        const c = (rep.contacts || []).find(x => x.id === d.editContactId);
        if (c) {
          Object.assign(c, { nom: d.nomsurnom, type: _deriveType(d), telegramme: d.telegramme, fiabilite: parseInt(d.fiabilite, 10) || 0, notes: d.notes, metier: d.metier, secteur: d.secteur, affiliation: d.affiliation, relation: d.relation, statut: d.statut, maj: Date.now(), par: c.par || interaction.user.id });
          persist(db);
          await _refreshPanel(interaction.client, rep);
        }
        const refs = d.ficheRefs || (c && c.ficheRefs) || null;
        const edited = await _publierFiche(interaction, d, fiche, d.editContactId, refs);
        _contactDrafts.delete(draftId);
        await interaction.editReply({ content: edited ? `✏️ Fiche de **${d.nomsurnom}** mise à jour.` : `✏️ Fiche **${d.nomsurnom}** mise à jour dans le carnet (le message d'origine n'a pas pu être édité — il a peut-être été supprimé).`, components: [] }).catch(() => {});
        return true;
      }
      // ── CRÉATION ──
      const contactId = _id();
      const contact = { id: contactId, nom: d.nomsurnom, type: _deriveType(d), telegramme: d.telegramme, fiabilite: parseInt(d.fiabilite, 10) || 0, notes: d.notes, metier: d.metier, secteur: d.secteur, affiliation: d.affiliation, relation: d.relation, statut: d.statut, dernierContact: d.dernierContact, photoUrl: d.photoUrl || null, creeParNom: d.creeParNom || (interaction.member?.displayName || interaction.user.username), par: interaction.user.id, maj: Date.now() };
      try { rep.contacts.push(contact); } catch {}
      const posted = await _publierFiche(interaction, d, fiche, contactId, null);
      if (posted && posted.refs) contact.ficheRefs = posted.refs;
      try { persist(db); await _refreshPanel(interaction.client, rep); } catch {}
      _contactDrafts.delete(draftId);
      const okMsg = `✅ Fiche de **${d.nomsurnom}** publiée dans ${posted ? posted.where : "—"} et ajoutée au carnet (recherchable avec \`/repertoire\`). Clique **✏️ Modifier** sur la fiche pour la mettre à jour plus tard.`;
      const koMsg = `⚠️ Je n'ai pas trouvé de salon où publier (répertoire/contacts). La fiche est ajoutée au carnet ; copie-la si besoin :\n\n${fiche}`.slice(0, 1900);
      await interaction.editReply({ content: posted ? okMsg : koMsg, components: [] }).catch(() => {});
      return true;
    }

    return false;
  } catch (err) {
    if ([10062, 10008, 40060].includes(err?.code)) return true;
    console.log("❌ repertoire routeInteraction:", err.message);
    return true;
  }
}

module.exports = { repertoireCommands, routeInteraction, installerPanelContact };
