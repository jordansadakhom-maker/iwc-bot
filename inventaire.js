// ───────────────────────────────────────────────────────────────────────────
//  inventaire.js — Coffre commun de l'organisation (hors argent)
//  ----------------------------------------------------------------------------
//  UN SEUL coffre partagé. Catégories : Armes · Munitions · Provisions ·
//  Médecine · Matériel · Commun. Gestion manuelle (boutons) + lecture IA
//  (multi-captures, correction, validation). Alertes de stock bas (au passage
//  sous le seuil seulement). Export. Tous les mouvements → fil « Journal ».
//  Noms consolidés (casse/accents/ponctuation ignorés). « Qui a pris quoi ».
//  Lectures en attente persistées (survivent à un redémarrage).
//
//  /inventaire-installer  /inventaire-photo  /inventaire-seuil
//  /inventaire-export     /inventaire-qui
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

// Normalisation agressive : casse, accents, ponctuation et espaces ignorés
// → « Balles .44 », « Balles.44 », « balles 44 » comptent comme le même objet.
function _norm(x) { return (x || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, ""); }
function _matchCat(input) {
  const ns = _norm(input); if (!ns) return null;
  return CATS.find(c => { const nc = _norm(c); return nc === ns || nc.startsWith(ns) || ns.startsWith(nc); }) || null;
}

function _ensure(db) {
  if (!db.inventaire) db.inventaire = {};
  const inv = db.inventaire;
  if (!inv.stock) inv.stock = {};
  for (const c of CATS) if (!inv.stock[c]) inv.stock[c] = {};
  if (!inv.seuils) inv.seuils = {};
  if (!inv.journal) inv.journal = [];
  if (!inv.lectures) inv.lectures = {};
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
  if (inv.photoMsg) e.addFields({ name: "📷 Photo du coffre", value: "Dernière(s) capture(s) épinglée(s) dans ce salon.", inline: false });
  e.addFields({ name: "🛠️ Comment gérer le coffre", value: "➕ **Ajouter** — ajoute une quantité à un objet\n➖ **Retirer** — enlève une quantité (pour vider ou diminuer)\n✏️ **Corriger** — fixe la quantité exacte d'un objet (mets **0** pour le **supprimer**)", inline: false });
  e.setFooter({ text: "Mouvements dans le fil « 📦 Journal du coffre » · mis à jour automatiquement" });
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

// Rafraîchit le board au démarrage : les boutons (Ajouter / Retirer / Corriger) d'un
// ancien tableau épinglé sont remis à jour automatiquement.
async function rafraichirBoardDemarrage(client) {
  try { const db = loadDB(); const inv = db.inventaire; if (inv && inv.channelId && inv.panneau) await _refreshBoard(client, inv); } catch {}
}

async function _thread(client, inv) {
  const id = inv.threadId || inv.channelId;
  if (!id) return null;
  return await client.channels.fetch(id).catch(() => null);
}
async function _log(client, inv, texte) {
  try { const ch = await _thread(client, inv); if (ch) await ch.send({ content: texte, allowedMentions: { parse: [] } }).catch(() => {}); } catch {}
}
function _journalAdd(inv, who, txt) {
  inv.journal = inv.journal || [];
  inv.journal.unshift({ t: Date.now(), who: who || null, txt });
  if (inv.journal.length > 60) inv.journal.length = 60;
}

// Alerte seulement quand un objet PASSE sous son seuil (anti-spam)
async function _checkSeuils(client, inv, changes) {
  try {
    if (!inv.seuils || !Object.keys(inv.seuils).length || !changes) return;
    const alerts = [];
    for (const c of CATS) for (const [nom, q] of Object.entries(inv.stock[c] || {})) {
      const seuil = inv.seuils[_norm(nom)];
      if (seuil == null) continue;
      const ch = changes[_norm(nom)];
      if (!ch) continue; // pas modifié → pas d'alerte
      if (ch.apres <= seuil && (ch.avant == null || ch.avant > seuil)) alerts.push(`⚠️ **Stock bas** — ${nom} : **${q}** (seuil ${seuil}).`);
    }
    if (alerts.length) await _log(client, inv, alerts.join("\n"));
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
  m.addComponents(new ActionRowBuilder().addComponents(cat), new ActionRowBuilder().addComponents(obj), new ActionRowBuilder().addComponents(qte));
  return m;
}

// ── Lecture d'image(s) par l'IA ────────────────────────────────────────────
const PROMPT_VISION = `Tu analyses une capture d'écran de l'inventaire d'un coffre dans un jeu vidéo type Far West (RedM / Red Dead Redemption).
Liste ABSOLUMENT TOUS les objets visibles sans en oublier un seul, Y COMPRIS les outils, crochets, cordes, lanternes, pelles, kits et tout équipement utilitaire, avec leur quantité exacte.
Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balises de code, au format exact :
[{"nom":"Nom de l'objet","quantite":12,"categorie":"Armes"}]
La "categorie" doit obligatoirement être l'une de : Armes, Munitions, Provisions, Médecine, Matériel, Commun.
Règles de catégorie : Armes (revolvers, fusils, couteaux) ; Munitions (balles, cartouches, poudre) ; Provisions (nourriture, boissons, alcool) ; Médecine (remèdes, toniques, bandages) ; Matériel (OUTILS, CROCHETS, cordes, lanternes, pelles, pièges, kits, tout objet utilitaire) ; Commun (le reste, ou si tu hésites). Si tu vois un objet sans réussir à l'identifier ou à lire son nom, NE L'OMETS PAS : ajoute-le quand même avec "nom":"Objet inconnu" (ou une brève description de ce que tu vois), "categorie":"Commun", et la quantité visible (1 si tu ne sais pas). N'omets aucun objet réellement présent, mais n'en invente aucun. Ne réponds que la liste. Si aucun objet n'est visible, réponds [].`;

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}
const _SUPPORTED_MT = ['image/png', 'image/jpeg', 'image/gif', 'image/webp'];
function _cleanMt(mt) { let m = String(mt || 'image/png').split(';')[0].trim().toLowerCase(); if (m === 'image/jpg') m = 'image/jpeg'; return _SUPPORTED_MT.includes(m) ? m : 'image/png'; }
// Détecte le vrai type d'image d'après les octets (magic bytes). Le contentType annoncé
// par Discord ment parfois (ex : webp déclaré pour des octets PNG) → Anthropic renvoie 400.
function _sniffMt(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) return 'image/png';
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'image/jpeg';
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return 'image/gif';
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50) return 'image/webp';
  return null;
}
async function _callVision(model, b64, mt) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) { console.log('⚠️ inventaire vision: ANTHROPIC_API_KEY absente'); return null; }
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 2000, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: _cleanMt(mt), data: b64 } },
        { type: 'text', text: PROMPT_VISION },
      ] }] }),
    });
    if (!resp.ok) { const body = await resp.text().catch(() => ''); console.log(`❌ inventaire vision ${model} HTTP ${resp.status}: ${body.slice(0, 300)}`); return null; }
    const data = await resp.json();
    const txt = data?.content?.[0]?.text || "";
    if (!txt) console.log(`⚠️ inventaire vision ${model}: réponse sans texte`);
    return txt;
  } catch (e) { console.log(`❌ inventaire vision ${model} exception:`, e.message); return null; }
}
function _parseItems(txt) {
  if (!txt) return null;
  txt = String(txt).trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = txt.match(/\[[\s\S]*\]/); if (!m) { console.log('⚠️ inventaire: pas de tableau JSON dans la réponse IA:', String(txt).slice(0, 200)); return null; }
  try {
    const arr = JSON.parse(m[0]); if (!Array.isArray(arr)) return null;
    const out = [];
    for (const it of arr) {
      if (!it || typeof it !== 'object') continue;
      let nom = String(it.nom || it.name || "").trim().slice(0, 80);
      const rawQ = it.quantite ?? it.quantity ?? it.qte;
      const rawCat = it.categorie || it.category;
      if (!nom && (rawQ === undefined || rawQ === null) && !rawCat) continue; // entrée totalement vide → ignorée
      let q = parseInt(rawQ, 10);
      if (!Number.isFinite(q) || q <= 0) q = 1; // quantité inconnue → 1 (on garde l'objet)
      const cat = _matchCat(rawCat || "") || 'Commun';
      if (!nom) nom = "Objet inconnu"; // l'IA n'a pas su nommer → on garde une ligne quand même
      out.push({ nom, quantite: q, categorie: cat });
    }
    return out;
  } catch { return null; }
}
async function _analyserImage(b64, mt) {
  let txt = await _callVision('claude-sonnet-4-6', b64, mt);
  if (!txt) txt = await _callVision('claude-haiku-4-5-20251001', b64, mt);
  return _parseItems(txt);
}
function _merge(lists) {
  const map = new Map();
  for (const list of lists) for (const it of (list || [])) {
    const k = it.categorie + "|" + _norm(it.nom);
    if (map.has(k)) map.get(k).quantite += it.quantite;
    else map.set(k, { nom: it.nom, quantite: it.quantite, categorie: it.categorie });
  }
  return [...map.values()];
}
// URL à envoyer à l'IA : si l'image est grande, on demande une version redimensionnée
// au proxy Discord (≤1568px, le max utile pour l'IA) pour rester sous la limite Anthropic (~5 Mo).
function _urlPourIA(a) {
  const grande = (a.width && a.width > 1600) || (a.height && a.height > 1600) || (a.size && a.size > 3500000);
  if (grande && a.proxyURL) { const sep = a.proxyURL.includes('?') ? '&' : '?'; return `${a.proxyURL}${sep}width=1568&height=1568`; }
  return a.url;
}
async function _lireImages(atts) {
  const lists = [];
  for (const a of atts) {
    let buf = await _imageBytes(_urlPourIA(a));
    if (!buf) buf = await _imageBytes(a.url); // repli sur l'URL d'origine si le proxy échoue
    if (!buf) { console.log('⚠️ inventaire: téléchargement image échoué'); continue; }
    const mt = _sniffMt(buf) || _cleanMt(a.contentType); // type réel d'après les octets (le contentType Discord ment parfois)
    const items = await _analyserImage(buf.toString('base64'), mt);
    if (items && items.length) lists.push(items);
    else console.log(`⚠️ inventaire: 0 objet lu (${a.name || '?'} · ${a.width || '?'}x${a.height || '?'} · ${Math.round((a.size || 0) / 1024)} Ko)`);
  }
  return _merge(lists);
}

// Lectures en attente (persistées dans db.inventaire.lectures, survivent au redémarrage)
function _prunePending(inv) {
  try { const L = inv.lectures || {}; const now = Date.now(); for (const k of Object.keys(L)) if (now - (L[k]?.ts || 0) > 86400000) delete L[k]; } catch {}
}

function _proposalEmbed(items) {
  const lignes = {};
  for (const it of items) { (lignes[it.categorie] = lignes[it.categorie] || []).push(`${it.nom} × **${it.quantite}**`); }
  let desc = CATS.filter(c => lignes[c]).map(c => `${CAT_EMOJI[c]} **${c}**\n${lignes[c].join("\n")}`).join("\n\n") || "*(aucun objet lu)*";
  if (desc.length > 3600) desc = desc.slice(0, 3600) + "\n…";
  return new EmbedBuilder().setColor(0xC9A66B).setTitle("📷 Lecture de la capture du coffre")
    .setDescription("Voici ce que j'ai lu sur la photo. **Vérifie**, puis choisis quoi en faire :\n\n" + desc +
      "\n\n**Que faire de cette lecture ?**\n" +
      "✅ **Tout remplacer** — le coffre devient EXACTEMENT cette liste (l'ancien contenu est effacé)\n" +
      "🔀 **Ajouter au coffre** — additionne cette liste au contenu déjà présent\n" +
      "✏️ **Corriger un objet** — rectifier une ligne avant d'enregistrer\n" +
      "❌ **Annuler** — ne rien changer")
    .setFooter({ text: "Pour ENLEVER des objets sans photo : utilise ➖ Retirer ou ✏️ Corriger sur le tableau du coffre." });
}
function _proposalRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("invp_replace").setLabel("Tout remplacer").setEmoji("✅").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("invp_add").setLabel("Ajouter au coffre").setEmoji("🔀").setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId("invp_edit").setLabel("Corriger un objet").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("invp_cancel").setLabel("Annuler").setEmoji("❌").setStyle(ButtonStyle.Secondary),
  );
}
// Poste la proposition, l'enregistre dans db (persistant) et sauvegarde
async function _proposer(channel, items, by, db, inv) {
  try {
    const m = await channel.send({ embeds: [_proposalEmbed(items)], components: [_proposalRow()], allowedMentions: { parse: [] } }).catch(() => null);
    if (m) { _prunePending(inv); inv.lectures[m.id] = { items, by, ts: Date.now() }; persist(db); }
    return m;
  } catch { return null; }
}
// Applique en consolidant les noms ; renvoie les variations {normNom:{avant,apres}}
function _appliquer(inv, items, mode) {
  const before = {};
  for (const c of CATS) for (const [n, q] of Object.entries(inv.stock[c] || {})) before[_norm(n)] = (before[_norm(n)] || 0) + (q || 0);
  if (mode === 'replace') { for (const c of CATS) inv.stock[c] = {}; }
  const changes = {};
  for (const it of items) {
    if (!inv.stock[it.categorie]) inv.stock[it.categorie] = {};
    const b = inv.stock[it.categorie];
    const key = Object.keys(b).find(k => _norm(k) === _norm(it.nom)) || it.nom;
    b[key] = (b[key] || 0) + it.quantite;
    changes[_norm(key)] = { avant: before[_norm(key)] ?? 0, apres: b[key] };
  }
  return changes;
}

const inventaireCommands = [
  new SlashCommandBuilder().setName("inventaire-installer").setDescription("📦 Poser le tableau du coffre commun dans CE salon (Direction)"),
  new SlashCommandBuilder().setName("inventaire-photo").setDescription("📷 Lire une ou plusieurs captures du coffre en jeu")
    .addAttachmentOption(o => o.setName("image").setDescription("Capture (1)").setRequired(true))
    .addAttachmentOption(o => o.setName("image2").setDescription("Capture (2, optionnel)").setRequired(false))
    .addAttachmentOption(o => o.setName("image3").setDescription("Capture (3, optionnel)").setRequired(false)),
  new SlashCommandBuilder().setName("inventaire-seuil").setDescription("⚠️ Définir une alerte de stock bas pour un objet (Direction)")
    .addStringOption(o => o.setName("objet").setDescription("Nom de l'objet").setRequired(true))
    .addIntegerOption(o => o.setName("seuil").setDescription("Alerter quand la quantité descend à ce nombre (0 = enlever l'alerte)").setRequired(true)),
  new SlashCommandBuilder().setName("inventaire-export").setDescription("📜 Exporter l'état du coffre + derniers mouvements (fichier)"),
  new SlashCommandBuilder().setName("inventaire-qui").setDescription("👤 Voir qui a bougé quoi dans le coffre (activité récente)"),
];

async function routeInteraction(interaction) {
  try {
    // ── Installation ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-installer") {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: "🔒 Réservé à la Direction.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const inv = _ensure(db);
      inv.channelId = interaction.channelId;
      const m = await interaction.channel.send({ embeds: [_boardEmbed(inv)], components: [_boardButtons()] }).catch(() => null);
      if (!m) { await interaction.editReply({ content: "❌ Je n'ai pas pu poster ici (vérifie mes permissions d'écriture dans ce salon)." }).catch(() => {}); return true; }
      inv.panneau = m.id; try { await m.pin(); } catch {}
      try { const th = await m.startThread({ name: "📦 Journal du coffre", autoArchiveDuration: 10080 }); inv.threadId = th.id; await th.send({ content: "📦 Ici s'inscrivent **tous les mouvements** du coffre (ajouts, retraits, lectures, alertes). Le salon reste propre." }).catch(() => {}); } catch {}
      persist(db);
      await interaction.editReply({ content: "✅ Coffre installé : tableau épinglé + fil « 📦 Journal du coffre ». Gère via les boutons, /inventaire-photo (ou glisse des images), /inventaire-seuil, /inventaire-export, /inventaire-qui." }).catch(() => {});
      return true;
    }

    // ── Photo : capture(s) épinglée(s) + lecture IA ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-photo") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const atts = ["image", "image2", "image3"].map(n => interaction.options.getAttachment(n)).filter(a => a && (a.contentType || "").startsWith("image"));
      if (!atts.length) { await interaction.editReply({ content: "❌ Joins au moins une image (capture d'écran de l'inventaire)." }).catch(() => {}); return true; }
      const db = loadDB(); const inv = _ensure(db);
      if (!inv.channelId) { await interaction.editReply({ content: "❌ Installe d'abord le tableau avec /inventaire-installer." }).catch(() => {}); return true; }
      const ch = await interaction.client.channels.fetch(inv.channelId).catch(() => null);
      if (!ch) { await interaction.editReply({ content: "❌ Salon du coffre introuvable." }).catch(() => {}); return true; }
      const files = atts.map((a, i) => { const ext = (((a.name || "").match(/\.(png|jpe?g|webp|gif)$/i)) || [".png"])[0]; return new AttachmentBuilder(a.url, { name: `coffre-${i + 1}${ext}` }); });
      const cap = `📷 **État réel du coffre commun** — ${atts.length} capture(s) par <@${interaction.user.id}>.`;
      // Une seule photo dans le salon : on supprime la précédente puis on poste la nouvelle
      await _purgerPhotoPrecedente(ch, inv, null);
      const mm = await ch.send({ content: cap, files, allowedMentions: { parse: [] } }).catch(() => null);
      if (mm) { inv.photoMsg = mm.id; try { await mm.pin(); } catch {} }
      persist(db);
      await _refreshBoard(interaction.client, inv);
      const items = await _lireImages(atts);
      if (!items || !items.length) { await interaction.editReply({ content: "📷 Capture(s) épinglée(s) ✅. Mais je n'ai pas réussi à lire d'objets dessus (peu net, ou clé IA absente) — saisis avec les boutons." }).catch(() => {}); return true; }
      await _proposer(ch, items, interaction.user.id, db, inv);
      await interaction.editReply({ content: "📷 Capture(s) épinglée(s) ✅ et lue(s) ! **Vérifie / corrige / valide** sur le message que je viens de poster." }).catch(() => {});
      return true;
    }

    // ── Seuil ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-seuil") {
      if (!estDirection(interaction.member)) { await interaction.reply({ content: "🔒 Réservé à la Direction.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const objet = (interaction.options.getString("objet") || "").trim().slice(0, 80);
      const seuil = interaction.options.getInteger("seuil");
      if (!objet) { await interaction.editReply({ content: "❌ Objet manquant." }).catch(() => {}); return true; }
      const db = loadDB(); const inv = _ensure(db);
      if (seuil > 0) inv.seuils[_norm(objet)] = seuil; else delete inv.seuils[_norm(objet)];
      persist(db);
      await interaction.editReply({ content: seuil > 0 ? `✅ Alerte réglée : **${objet}** → je préviens dans le fil quand la quantité passe à **${seuil}** ou moins.` : `✅ Alerte retirée pour **${objet}**.` }).catch(() => {});
      return true;
    }

    // ── Export ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-export") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const inv = _ensure(db);
      const { per, total } = _counts(inv);
      let txt = `COFFRE COMMUN — Iron Wolf Company & La Confrérie\nÉtat au ${new Date().toLocaleString('fr-FR')}\nTotal : ${total} article(s)\n`;
      for (const c of CATS) {
        txt += `\n=== ${c} (${per[c]}) ===\n`;
        const items = inv.stock[c] || {}; const noms = Object.keys(items).sort();
        txt += noms.length ? noms.map(n => `  - ${n} x ${items[n]}`).join("\n") : "  (vide)";
        txt += "\n";
      }
      if (inv.journal && inv.journal.length) {
        txt += `\n\n=== Derniers mouvements ===\n` + inv.journal.slice(0, 60).map(e => `  [${new Date(e.t).toLocaleString('fr-FR')}] ${e.txt}`).join("\n");
      }
      const file = new AttachmentBuilder(Buffer.from(txt, 'utf-8'), { name: 'coffre-commun.txt' });
      await interaction.editReply({ content: "📜 Voici l'export complet du coffre.", files: [file] }).catch(() => {});
      return true;
    }

    // ── Qui a bougé quoi ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-qui") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const db = loadDB(); const inv = _ensure(db);
      const j = inv.journal || [];
      if (!j.length) { await interaction.editReply({ content: "Aucun mouvement enregistré pour l'instant." }).catch(() => {}); return true; }
      const parUser = {};
      for (const e of j) { if (e.who) parUser[e.who] = (parUser[e.who] || 0) + 1; }
      const top = Object.entries(parUser).sort((a, b) => b[1] - a[1]).slice(0, 15).map(([id, n]) => `<@${id}> — **${n}** mouvement(s)`);
      const recent = j.slice(0, 12).map(e => `• ${e.who ? `<@${e.who}> ` : ""}${e.txt}`).join("\n").slice(0, 1024);
      const e2 = new EmbedBuilder().setColor(0x4A7C59).setTitle("👤 Activité du coffre")
        .addFields(
          { name: "Par membre (sur les mouvements récents)", value: top.join("\n") || "—", inline: false },
          { name: "Derniers mouvements", value: recent || "—", inline: false },
        );
      await interaction.editReply({ embeds: [e2] }).catch(() => {});
      return true;
    }

    // ── Boutons manuels ──
    if (interaction.isButton?.() && ["inv_add", "inv_remove", "inv_set"].includes(interaction.customId)) {
      const action = interaction.customId.replace("inv_", "");
      await interaction.showModal(_modal(action)).catch(() => {});
      return true;
    }

    // ── Validation / correction d'une lecture IA ──
    if (interaction.isButton?.() && ["invp_replace", "invp_add", "invp_cancel", "invp_edit"].includes(interaction.customId)) {
      const db = loadDB(); const inv = _ensure(db); _prunePending(inv);
      const pend = inv.lectures[interaction.message.id];
      if (!pend) { await interaction.reply({ content: "⏳ Cette lecture a expiré. Renvoie la capture.", flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (interaction.customId === "invp_edit") {
        const mm = new ModalBuilder().setCustomId(`invpc::${interaction.message.id}`).setTitle("Corriger / ajouter un objet");
        const obj = new TextInputBuilder().setCustomId("objet").setLabel("Objet").setStyle(TextInputStyle.Short).setPlaceholder("Nom exact de l'objet").setRequired(true);
        const qte = new TextInputBuilder().setCustomId("qte").setLabel("Quantité (0 = retirer de la lecture)").setStyle(TextInputStyle.Short).setPlaceholder("ex : 5").setRequired(true);
        const cat = new TextInputBuilder().setCustomId("cat").setLabel("Catégorie (si nouvel objet, sinon vide)").setStyle(TextInputStyle.Short).setPlaceholder("Armes / Munitions / Provisions / Médecine / Matériel / Commun").setRequired(false);
        mm.addComponents(new ActionRowBuilder().addComponents(obj), new ActionRowBuilder().addComponents(qte), new ActionRowBuilder().addComponents(cat));
        await interaction.showModal(mm).catch(() => {});
        return true;
      }
      await interaction.deferUpdate().catch(() => {});
      const items = pend.items;
      delete inv.lectures[interaction.message.id];
      if (interaction.customId === "invp_cancel") { persist(db); await interaction.editReply({ content: "❌ Lecture annulée — rien n'a changé.", embeds: [], components: [] }).catch(() => {}); return true; }
      const mode = interaction.customId === "invp_replace" ? "replace" : "add";
      const changes = _appliquer(inv, items, mode);
      _journalAdd(inv, interaction.user.id, `📷 ${mode === 'replace' ? "Remplacé" : "Complété"} depuis une capture (${items.length} objet(s))`);
      persist(db);
      await _refreshBoard(interaction.client, inv);
      await _log(interaction.client, inv, `📷 <@${interaction.user.id}> a ${mode === 'replace' ? "remplacé" : "complété"} le coffre depuis une capture (${items.length} objet(s) lu(s)).`);
      await _checkSeuils(interaction.client, inv, changes);
      await interaction.editReply({ content: `✅ Coffre ${mode === 'replace' ? "remplacé" : "complété"} — détails dans le fil 📦.`, embeds: [], components: [] }).catch(() => {});
      return true;
    }

    // ── Soumission correction de lecture ──
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith("invpc::")) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const msgId = interaction.customId.split("::")[1];
      const db = loadDB(); const inv = _ensure(db); _prunePending(inv);
      const pend = inv.lectures[msgId];
      if (!pend) { await interaction.editReply({ content: "⏳ Cette lecture a expiré." }).catch(() => {}); return true; }
      const objet = (interaction.fields.getTextInputValue("objet") || "").trim().slice(0, 80);
      const qte = parseInt(((interaction.fields.getTextInputValue("qte") || "").replace(/[^0-9]/g, "")), 10);
      const cat = _matchCat(interaction.fields.getTextInputValue("cat") || "");
      const idx = pend.items.findIndex(it => _norm(it.nom) === _norm(objet));
      if (idx >= 0) {
        if (!Number.isFinite(qte) || qte <= 0) pend.items.splice(idx, 1);
        else { pend.items[idx].quantite = qte; if (cat) pend.items[idx].categorie = cat; }
      } else if (objet && Number.isFinite(qte) && qte > 0) {
        pend.items.push({ nom: objet, quantite: qte, categorie: cat || 'Commun' });
      }
      persist(db);
      const ch = interaction.channel;
      const msg = ch ? await ch.messages.fetch(msgId).catch(() => null) : null;
      if (msg) await msg.edit({ embeds: [_proposalEmbed(pend.items)], components: [_proposalRow()] }).catch(() => {});
      await interaction.editReply({ content: "✏️ Correction appliquée à la lecture. Vérifie le message, puis valide quand c'est bon." }).catch(() => {});
      return true;
    }

    // ── Soumission formulaire manuel ──
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
      _journalAdd(inv, interaction.user.id, `${action === 'add' ? "Ajout" : action === 'remove' ? "Retrait" : "Correction"} : ${action === 'set' ? "" : qte + " × "}${existante} (${cat}) → ${apres}`);
      persist(db);
      await _refreshBoard(interaction.client, inv);

      const who = `<@${interaction.user.id}>`;
      let logTxt;
      if (action === 'set') logTxt = `📦 ${who} a recompté **${existante}** → **${apres}** *(${cat})*.`;
      else { const mot = action === 'add' ? "a rangé" : "a sorti"; const fin = action === 'add' ? "total" : "reste"; logTxt = `📦 ${who} ${mot} **${qte} × ${existante}** *(${cat})* · ${fin} : **${apres}**.`; }
      await _log(interaction.client, inv, logTxt);
      await _checkSeuils(interaction.client, inv, { [_norm(existante)]: { avant, apres } });
      await interaction.editReply({ content: "✅ Mouvement enregistré (détail dans le fil 📦)." }).catch(() => {});
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log("❌ inventaire routeInteraction:", e.message);
    return true;
  }
}

// Garde UNE SEULE photo dans le salon du coffre : supprime la photo précédemment suivie.
async function _purgerPhotoPrecedente(ch, inv, saufId) {
  try {
    if (!ch || !inv?.photoMsg || inv.photoMsg === saufId) return;
    const old = await ch.messages.fetch(inv.photoMsg).catch(() => null);
    if (old) await old.delete().catch(() => {});
  } catch {}
  if (inv && inv.photoMsg !== saufId) inv.photoMsg = null;
}

// ── Image(s) glissée(s) dans le salon → lecture IA + proposition ──
async function onMessage(message) {
  try {
    if (!message || message.author?.bot) return false;
    const db = loadDB();
    if (!db.inventaire || !db.inventaire.channelId || message.channelId !== db.inventaire.channelId) return false;
    const imgs = message.attachments ? [...message.attachments.values()].filter(a => (a.contentType || "").startsWith("image")) : [];
    if (!imgs.length) return false;
    const inv = _ensure(db);
    await message.react("🔍").catch(() => {});
    // Une seule photo dans le salon : on supprime la précédente et ce dépôt devient la photo courante
    await _purgerPhotoPrecedente(message.channel, inv, message.id);
    inv.photoMsg = message.id; persist(db);
    const items = await _lireImages(imgs);
    if (!items || !items.length) { await message.reply({ content: "📷 Je n'ai pas réussi à lire d'objets sur cette/ces image(s). Essaie une capture plus nette, ou les boutons du tableau.", allowedMentions: { parse: [] } }).catch(() => {}); return true; }
    await _proposer(message.channel, items, message.author.id, db, inv);
    return true;
  } catch { return false; }
}

module.exports = { inventaireCommands, routeInteraction, onMessage, rafraichirBoardDemarrage };
