// ───────────────────────────────────────────────────────────────────────────
//  inventaire.js — Coffre commun de l'organisation (hors argent)
//  ----------------------------------------------------------------------------
//  UN SEUL coffre partagé (Compagnie & Confrérie ensemble).
//  Catégories : Armes · Munitions · Provisions · Médecine · Matériel · Commun.
//  Gestion manuelle (boutons ➕➖✏️) ET lecture d'une capture par l'IA :
//   - via /inventaire-photo  (image jointe)
//   - ou en glissant une image directement dans le salon
//  La lecture IA propose, et l'utilisateur VALIDE avant toute modification.
//
//  /inventaire-installer  → poser le tableau dans CE salon         [Direction]
//  /inventaire-photo      → lire une capture du coffre en jeu      [tous]
//  Identifiants isolés : inv_*  /  invp_*  ·  Données dans db.inventaire
// ───────────────────────────────────────────────────────────────────────────
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, AttachmentBuilder, MessageFlags } = require('discord.js');

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

const CATS = ['Armes', 'Munitions', 'Provisions', 'Médecine', 'Matériel', 'Commun'];
const CAT_EMOJI = { 'Armes': '🔫', 'Munitions': '🧨', 'Provisions': '🥫', 'Médecine': '💊', 'Matériel': '🧰', 'Commun': '🎒' };
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
  const recap = CATS.map(c => `${CAT_EMOJI[c]} ${c} : **${per[c]}**`).join(" · ");
  e.addFields({ name: `📊 Récapitulatif — ${total} article(s) en réserve`, value: recap, inline: false });
  for (const c of CATS) {
    const items = inv.stock[c] || {};
    const noms = Object.keys(items).sort();
    let val = noms.length ? noms.map(n => `${n} × **${items[n]}**`).join("\n") : "*— vide —*";
    if (val.length > 1000) val = val.slice(0, 1000) + "\n…";
    e.addFields({ name: `${CAT_EMOJI[c]} ${c} (${per[c]})`, value: val, inline: false });
  }
  if (inv.photoMsg) e.addFields({ name: "📷 Photo du coffre", value: "Dernière capture épinglée dans ce salon.", inline: false });
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
    .setPlaceholder("Armes / Munitions / Provisions / Médecine / Matériel / Commun").setRequired(true);
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

// ── Lecture d'image par l'IA ──────────────────────────────────────────────
const PROMPT_VISION = `Tu analyses une capture d'écran de l'inventaire d'un coffre dans un jeu vidéo type Far West (RedM / Red Dead Redemption).
Liste ABSOLUMENT TOUS les objets visibles sans en oublier un seul, Y COMPRIS les outils, crochets, cordes, lanternes, pelles, kits et tout équipement utilitaire, avec leur quantité exacte.
Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balises de code, au format exact :
[{"nom":"Nom de l'objet","quantite":12,"categorie":"Armes"}]
La "categorie" doit obligatoirement être l'une de : Armes, Munitions, Provisions, Médecine, Matériel, Commun.
Règles de catégorie : Armes (revolvers, fusils, couteaux) ; Munitions (balles, cartouches, poudre) ; Provisions (nourriture, boissons, alcool) ; Médecine (remèdes, toniques, bandages) ; Matériel (OUTILS, CROCHETS, cordes, lanternes, pelles, pièges, kits, tout objet utilitaire) ; Commun (le reste, ou si tu hésites). N'omets aucun objet réellement présent, mais n'en invente aucun. Ne réponds que la liste. Si aucun objet n'est visible, réponds [].`;

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}

async function _analyserImage(b64, mediaType) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 2000,
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType || 'image/png', data: b64 } },
          { type: 'text', text: PROMPT_VISION },
        ] }],
      }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    let txt = (data?.content?.[0]?.text || "").trim().replace(/```json/gi, "").replace(/```/g, "").trim();
    const m = txt.match(/\[[\s\S]*\]/);
    if (!m) return null;
    const arr = JSON.parse(m[0]);
    if (!Array.isArray(arr)) return null;
    const out = [];
    for (const it of arr) {
      const nom = String(it.nom || it.name || "").trim().slice(0, 80);
      const q = parseInt(it.quantite ?? it.quantity ?? it.qte, 10);
      const cat = _matchCat(it.categorie || it.category || "") || 'Commun';
      if (nom && Number.isFinite(q) && q > 0) out.push({ nom, quantite: q, categorie: cat });
    }
    return out;
  } catch { return null; }
}

// Propositions de lecture en attente de validation (en mémoire, clé = id du message)
const _pending = new Map();

async function _proposer(channel, items, byUserId) {
  try {
    const lignes = {};
    for (const it of items) { (lignes[it.categorie] = lignes[it.categorie] || []).push(`${it.nom} × **${it.quantite}**`); }
    let desc = CATS.filter(c => lignes[c]).map(c => `${CAT_EMOJI[c]} **${c}**\n${lignes[c].join("\n")}`).join("\n\n") || "*(aucun objet lu)*";
    if (desc.length > 3800) desc = desc.slice(0, 3800) + "\n…";
    const e = new EmbedBuilder().setColor(0xC9A66B).setTitle("📷 Lecture de la capture du coffre")
      .setDescription("Voici ce que j'ai lu sur l'image. **Vérifie bien**, puis choisis ci-dessous :\n\n" + desc)
      .setFooter({ text: "« Remplacer » écrase le coffre · « Ajouter » complète l'existant · « Annuler » ne change rien" });
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId("invp_replace").setLabel("Remplacer le coffre").setEmoji("✅").setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId("invp_add").setLabel("Ajouter au coffre").setEmoji("🔀").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId("invp_cancel").setLabel("Annuler").setEmoji("❌").setStyle(ButtonStyle.Secondary),
    );
    const m = await channel.send({ embeds: [e], components: [row], allowedMentions: { parse: [] } }).catch(() => null);
    if (m) _pending.set(m.id, { items, by: byUserId, ts: Date.now() });
    return m;
  } catch { return null; }
}

function _appliquer(inv, items, mode) {
  if (mode === 'replace') { for (const c of CATS) inv.stock[c] = {}; }
  for (const it of items) {
    if (!inv.stock[it.categorie]) inv.stock[it.categorie] = {};
    const b = inv.stock[it.categorie];
    const key = Object.keys(b).find(k => _norm(k) === _norm(it.nom)) || it.nom;
    b[key] = (b[key] || 0) + it.quantite;
  }
}

const inventaireCommands = [
  new SlashCommandBuilder().setName("inventaire-installer").setDescription("📦 Poser le tableau du coffre commun dans CE salon (Direction)"),
  new SlashCommandBuilder().setName("inventaire-photo").setDescription("📷 Lire une capture (fichier) de l'état réel du coffre")
    .addAttachmentOption(o => o.setName("image").setDescription("Capture d'écran de l'inventaire en jeu").setRequired(true)),
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
      await interaction.editReply({ content: "✅ Tableau du coffre commun installé. Boutons pour gérer à la main, ou /inventaire-photo (ou glisse une image ici) pour que le bot lise une capture." }).catch(() => {});
      return true;
    }

    // ── Photo du coffre : capture épinglée + lecture IA ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-photo") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const att = interaction.options.getAttachment("image");
      if (!att || !((att.contentType || "").startsWith("image"))) { await interaction.editReply({ content: "❌ Joins bien une image (capture d'écran de l'inventaire en jeu)." }).catch(() => {}); return true; }
      const db = loadDB(); const inv = _ensure(db);
      if (!inv.channelId) { await interaction.editReply({ content: "❌ Installe d'abord le tableau avec /inventaire-installer." }).catch(() => {}); return true; }
      const ch = await interaction.client.channels.fetch(inv.channelId).catch(() => null);
      if (!ch) { await interaction.editReply({ content: "❌ Salon du coffre introuvable." }).catch(() => {}); return true; }
      // (1) garder la capture comme vrai fichier épinglé
      const ext = (((att.name || "").match(/\.(png|jpe?g|webp|gif)$/i)) || [".png"])[0];
      const file = new AttachmentBuilder(att.url, { name: `coffre-commun${ext}` });
      const cap = `📷 **État réel du coffre commun** — capture par <@${interaction.user.id}>.`;
      let msg = inv.photoMsg ? await ch.messages.fetch(inv.photoMsg).catch(() => null) : null;
      if (msg) { await msg.edit({ content: cap, files: [file], attachments: [], allowedMentions: { parse: [] } }).catch(() => {}); }
      else { const mm = await ch.send({ content: cap, files: [file], allowedMentions: { parse: [] } }).catch(() => null); if (mm) { inv.photoMsg = mm.id; try { await mm.pin(); } catch {} } }
      persist(db);
      await _refreshBoard(interaction.client, inv);
      // (2) lecture IA + proposition
      const buf = await _imageBytes(att.url);
      const items = buf ? await _analyserImage(buf.toString('base64'), att.contentType || 'image/png') : null;
      if (!items || !items.length) { await interaction.editReply({ content: "📷 Capture épinglée ✅. En revanche je n'ai pas réussi à lire les objets dessus (image peu nette, ou clé IA absente) — tu peux saisir les quantités avec les boutons." }).catch(() => {}); return true; }
      await _proposer(ch, items, interaction.user.id);
      await interaction.editReply({ content: "📷 Capture épinglée ✅ et lue ! **Vérifie et valide** sur le message que je viens de poster dans le salon." }).catch(() => {});
      return true;
    }

    // ── Boutons : ouvrir le formulaire manuel ──
    if (interaction.isButton?.() && ["inv_add", "inv_remove", "inv_set"].includes(interaction.customId)) {
      const action = interaction.customId.replace("inv_", "");
      await interaction.showModal(_modal(action)).catch(() => {});
      return true;
    }

    // ── Validation d'une lecture IA ──
    if (interaction.isButton?.() && ["invp_replace", "invp_add", "invp_cancel"].includes(interaction.customId)) {
      const pend = _pending.get(interaction.message.id);
      if (!pend) { await interaction.reply({ content: "⏳ Cette lecture a expiré (ou le bot a redémarré). Renvoie la capture.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferUpdate().catch(() => {});
      _pending.delete(interaction.message.id);
      if (interaction.customId === "invp_cancel") { await interaction.editReply({ content: "❌ Lecture annulée — rien n'a changé dans le coffre.", embeds: [], components: [] }).catch(() => {}); return true; }
      const db = loadDB(); const inv = _ensure(db);
      const mode = interaction.customId === "invp_replace" ? "replace" : "add";
      _appliquer(inv, pend.items, mode);
      persist(db);
      await _refreshBoard(interaction.client, inv);
      await _log(interaction.client, inv, `📷 <@${interaction.user.id}> a ${mode === 'replace' ? "remplacé" : "complété"} le coffre depuis une capture (${pend.items.length} objet(s) lu(s)).`);
      await interaction.editReply({ content: `✅ Coffre ${mode === 'replace' ? "remplacé" : "complété"} depuis la capture.`, embeds: [], components: [] }).catch(() => {});
      return true;
    }

    // ── Soumission du formulaire manuel ──
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
      else apres = qte;
      if (apres <= 0) delete bucket[existante];
      else bucket[existante] = apres;
      persist(db);
      await _refreshBoard(interaction.client, inv);

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

// ── Image glissée directement dans le salon → lecture IA + proposition ──
async function onMessage(message) {
  try {
    if (!message || message.author?.bot) return false;
    const db = loadDB();
    if (!db.inventaire || !db.inventaire.channelId || message.channelId !== db.inventaire.channelId) return false;
    const img = message.attachments?.find?.(a => (a.contentType || "").startsWith("image"));
    if (!img) return false;
    await message.react("🔍").catch(() => {});
    const buf = await _imageBytes(img.url);
    const items = buf ? await _analyserImage(buf.toString('base64'), img.contentType || 'image/png') : null;
    if (!items || !items.length) { await message.reply({ content: "📷 Je n'ai pas réussi à lire d'objets sur cette image. Essaie une capture plus nette, ou utilise les boutons du tableau.", allowedMentions: { parse: [] } }).catch(() => {}); return true; }
    await _proposer(message.channel, items, message.author.id);
    return true;
  } catch { return false; }
}

module.exports = { inventaireCommands, routeInteraction, onMessage };
