// ───────────────────────────────────────────────────────────────────────────
//  inventaire.js — Coffre commun de l'organisation (hors argent)
//  ----------------------------------------------------------------------------
//  UN SEUL coffre partagé (Compagnie & Confrérie ensemble).
//  Catégories : Armes · Munitions · Provisions · Médecine · Matériel.
//  Tout le monde peut ajouter / retirer / corriger. Installation : Direction.
//  Photo du coffre, récapitulatif des quantités, et journal des mouvements.
//
//  /inventaire-installer  → poser le tableau dans CE salon         [Direction]
//  /inventaire-photo      → joindre une capture du coffre en jeu   [tous]
//  Identifiants isolés : inv_*  ·  Données dans db.inventaire
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

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

const CATS = ['Armes', 'Munitions', 'Provisions', 'Médecine', 'Matériel'];
const CAT_EMOJI = { 'Armes': '🔫', 'Munitions': '🧨', 'Provisions': '🥫', 'Médecine': '💊', 'Matériel': '🧰' };
const TITRE = "🤝 COFFRE COMMUN";
const SOUS = "*Réserves de l'organisation (Compagnie & Confrérie) — l'argent, lui, dort dans les coffres.*";
const COULEUR = 0x8C6D3F;

function _norm(x) { return (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""); }
function _matchCat(input) {
  const ns = _norm(input).trim();
  if (!ns) return null;
  return CATS.find(c => { const nc = _norm(c); return nc === ns || nc.startsWith(ns) || ns.startsWith(nc); }) || null;
}

function _ensure(db) {
  if (!db.inventaire) db.inventaire = {};
  const inv = db.inventaire;
  if (!inv.stock) inv.stock = {};
  for (const c of CATS) if (!inv.stock[c]) inv.stock[c] = {};
  return inv;
}

function _counts(inv) {
  const per = {}; let total = 0;
  for (const c of CATS) { const n = Object.values(inv.stock[c] || {}).reduce((s, q) => s + (q || 0), 0); per[c] = n; total += n; }
  return { per, total };
}

function _boardEmbed(inv) {
  const { per, total } = _counts(inv);
  const e = new EmbedBuilder().setColor(COULEUR).setTitle(TITRE).setDescription(SOUS);
  // Récapitulatif (total + compte par catégorie)
  const recap = CATS.map(c => `${CAT_EMOJI[c]} ${c} : **${per[c]}**`).join(" · ");
  e.addFields({ name: `📊 Récapitulatif — ${total} article(s) en réserve`, value: recap, inline: false });
  // Détail par catégorie
  for (const c of CATS) {
    const items = inv.stock[c] || {};
    const noms = Object.keys(items).sort();
    let val = noms.length ? noms.map(n => `${n} × **${items[n]}**`).join("\n") : "*— vide —*";
    if (val.length > 1000) val = val.slice(0, 1000) + "\n…";
    e.addFields({ name: `${CAT_EMOJI[c]} ${c} (${per[c]})`, value: val, inline: false });
  }
  if (inv.photo) e.setImage(inv.photo);
  e.setFooter({ text: "Iron Wolf Company & La Confrérie • mis à jour automatiquement" });
  return e;
}

function _boardButtons() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("inv_add").setLabel("Ajouter").setEmoji("➕").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("inv_remove").setLabel("Retirer").setEmoji("➖").setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId("inv_set").setLabel("Corriger").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
  );
}

async function _refreshBoard(client, inv) {
  try {
    if (!inv.channelId || !inv.panneau) return;
    const ch = await client.channels.fetch(inv.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(inv.panneau).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [_boardEmbed(inv)], components: [_boardButtons()] }).catch(() => {});
  } catch {}
}

async function _log(client, inv, texte) {
  try {
    if (!inv.channelId) return;
    const ch = await client.channels.fetch(inv.channelId).catch(() => null);
    if (ch) await ch.send({ content: texte, allowedMentions: { parse: [] } }).catch(() => {});
  } catch {}
}

function _modal(action) {
  const verbe = action === 'add' ? "Ajouter au coffre" : action === 'remove' ? "Retirer du coffre" : "Corriger le coffre";
  const m = new ModalBuilder().setCustomId(`invm::${action}`).setTitle(verbe);
  const cat = new TextInputBuilder().setCustomId("cat").setLabel("Catégorie").setStyle(TextInputStyle.Short)
    .setPlaceholder("Armes / Munitions / Provisions / Médecine / Matériel").setRequired(true);
  const obj = new TextInputBuilder().setCustomId("objet").setLabel("Objet").setStyle(TextInputStyle.Short)
    .setPlaceholder("ex : Carabine Repeater, Balles .44, Conserves…").setRequired(true);
  const qte = new TextInputBuilder().setCustomId("qte").setLabel(action === 'set' ? "Quantité exacte (0 = retirer)" : "Quantité").setStyle(TextInputStyle.Short)
    .setPlaceholder("ex : 5").setRequired(true);
  m.addComponents(
    new ActionRowBuilder().addComponents(cat),
    new ActionRowBuilder().addComponents(obj),
    new ActionRowBuilder().addComponents(qte),
  );
  return m;
}

const inventaireCommands = [
  new SlashCommandBuilder().setName("inventaire-installer").setDescription("📦 Poser le tableau du coffre commun dans CE salon (Direction)"),
  new SlashCommandBuilder().setName("inventaire-photo").setDescription("📷 Joindre une capture de l'état réel du coffre")
    .addAttachmentOption(o => o.setName("image").setDescription("Capture de l'inventaire en jeu").setRequired(true)),
];

async function routeInteraction(interaction) {
  try {
    // ── Installation du tableau ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-installer") {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: "🔒 Réservé à la Direction.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const inv = _ensure(db);
      inv.channelId = interaction.channelId;
      const m = await interaction.channel.send({ embeds: [_boardEmbed(inv)], components: [_boardButtons()] }).catch(() => null);
      if (!m) { await interaction.editReply({ content: "❌ Je n'ai pas pu poster ici (vérifie mes permissions d'écriture dans ce salon)." }).catch(() => {}); return true; }
      inv.panneau = m.id; try { await m.pin(); } catch {}
      persist(db);
      await interaction.editReply({ content: "✅ Tableau du coffre commun installé. Tout le monde peut ajouter / retirer / corriger via les boutons, et joindre une photo avec /inventaire-photo." }).catch(() => {});
      return true;
    }

    // ── Photo du coffre ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-photo") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const att = interaction.options.getAttachment("image");
      if (!att || !((att.contentType || "").startsWith("image"))) { await interaction.editReply({ content: "❌ Joins bien une image (capture de l'inventaire en jeu)." }).catch(() => {}); return true; }
      const db = loadDB(); const inv = _ensure(db);
      inv.photo = att.url; persist(db);
      await _refreshBoard(interaction.client, inv);
      await _log(interaction.client, inv, `📷 <@${interaction.user.id}> a mis à jour la **photo du coffre**.`);
      await interaction.editReply({ content: "✅ Photo du coffre mise à jour (visible sur le tableau)." }).catch(() => {});
      return true;
    }

    // ── Boutons : ouvrir le formulaire ──
    if (interaction.isButton?.() && ["inv_add", "inv_remove", "inv_set"].includes(interaction.customId)) {
      const action = interaction.customId.replace("inv_", "");
      await interaction.showModal(_modal(action)).catch(() => {});
      return true;
    }

    // ── Soumission du formulaire ──
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith("invm::")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const action = interaction.customId.split("::")[1];
      const cat = _matchCat(interaction.fields.getTextInputValue("cat"));
      const objet = (interaction.fields.getTextInputValue("objet") || "").trim().slice(0, 80);
      const qte = parseInt(((interaction.fields.getTextInputValue("qte") || "").replace(/[^0-9]/g, "")), 10);
      if (!cat) { await interaction.editReply({ content: `❌ Catégorie inconnue. Choisis parmi : ${CATS.join(", ")}.` }).catch(() => {}); return true; }
      if (!objet) { await interaction.editReply({ content: "❌ Objet manquant." }).catch(() => {}); return true; }
      if (!Number.isFinite(qte) || qte < 0 || (action !== 'set' && qte <= 0)) { await interaction.editReply({ content: "❌ Quantité invalide (mets un nombre, ex : 5)." }).catch(() => {}); return true; }

      const db = loadDB(); const inv = _ensure(db);
      const bucket = inv.stock[cat];
      const existante = Object.keys(bucket).find(k => _norm(k) === _norm(objet)) || objet;
      const avant = bucket[existante] || 0;
      let apres;
      if (action === 'add') apres = avant + qte;
      else if (action === 'remove') apres = Math.max(0, avant - qte);
      else apres = qte; // set
      if (apres <= 0) delete bucket[existante];
      else bucket[existante] = apres;
      persist(db);
      await _refreshBoard(interaction.client, inv);

      // Mise à jour visible dans le salon
      const who = `<@${interaction.user.id}>`;
      let logTxt;
      if (action === 'set') logTxt = `📦 ${who} a recompté **${existante}** → **${apres}** *(${cat})*.`;
      else { const mot = action === 'add' ? "a rangé" : "a sorti"; const fin = action === 'add' ? "total" : "reste"; logTxt = `📦 ${who} ${mot} **${qte} × ${existante}** *(${cat})* · ${fin} : **${apres}**.`; }
      await _log(interaction.client, inv, logTxt);
      await interaction.editReply({ content: "✅ Mouvement enregistré." }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log("❌ inventaire routeInteraction:", e.message);
    return true;
  }
}

module.exports = { inventaireCommands, routeInteraction };
