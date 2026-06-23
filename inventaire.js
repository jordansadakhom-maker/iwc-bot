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
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, AttachmentBuilder, MessageFlags } = require('discord.js');

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
  e.addFields({ name: "🛠️ Comment gérer le coffre", value: "➕ **Ajouter** — choisis l'objet (ou « 🆕 Nouvel objet ») puis le **nombre à faire ENTRER**\n➖ **Retirer** — choisis l'objet puis le **nombre à faire SORTIR**\n✏️ **Corriger** — *seulement en cas d'erreur* : remets la **quantité exacte** (0 = supprimer)\n📷 *Tu peux aussi déposer une photo du coffre : je la lis et le coffre devient exactement la photo.*", inline: false });
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

function _estTableau(m, clientUserId) {
  if (m.author?.id !== clientUserId) return false;
  const e = m.embeds?.[0]; if (!e) return false;
  const title = e.title || ''; const footer = e.footer?.text || '';
  return title.includes('COFFRE COMMUN') || footer.includes('Journal du coffre');
}
// Retrouve TOUS les tableaux « COFFRE COMMUN » du salon, via les ÉPINGLES (fiable même si le
// tableau a défilé loin) ET l'historique récent. En mode "deep", on remonte plus loin (jusqu'à
// ~300 messages) pour rattraper un VIEUX tableau enfoui qui n'est plus épinglé.
async function _trouverTableaux(client, ch, deep) {
  const found = new Map();
  try { const pins = await ch.messages.fetchPinned().catch(() => null); if (pins) for (const m of pins.values()) if (_estTableau(m, client.user.id)) found.set(m.id, m); } catch {}
  try {
    let before; const pages = deep ? 3 : 1;
    for (let i = 0; i < pages; i++) {
      const batch = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
      if (!batch || !batch.size) break;
      for (const m of batch.values()) if (_estTableau(m, client.user.id)) found.set(m.id, m);
      before = batch.last()?.id;
      if (batch.size < 100) break;
    }
  } catch {}
  return [...found.values()];
}
function _persistPanneau(id) { try { const d = loadDB(); if (d.inventaire) { d.inventaire.panneau = id; saveDB(d); } } catch {} }
// Ne garde qu'UN seul tableau (le référencé, sinon celui qui porte le fil, sinon le plus ancien) ;
// supprime les doublons. Renvoie le tableau conservé (ou null).
async function _dedupeBoards(client, inv, deep) {
  try {
    if (!inv.channelId) return null;
    const ch = await client.channels.fetch(inv.channelId).catch(() => null);
    if (!ch?.messages) return null;
    const boards = await _trouverTableaux(client, ch, deep);
    if (!boards.length) return null;
    const keep = boards.find(m => m.id === inv.panneau) || boards.find(m => m.hasThread) || boards[0];
    for (const m of boards) { if (m.id !== keep.id) await m.delete().catch(() => {}); }
    if (inv.panneau !== keep.id) { inv.panneau = keep.id; _persistPanneau(keep.id); }
    if (!keep.pinned) await keep.pin().catch(() => {});
    return keep;
  } catch { return null; }
}
async function _refreshBoard(client, inv) {
  try {
    if (!inv.channelId) return;
    await _dedupeBoards(client, inv); // retire les tableaux en double avant de rafraîchir
    if (!inv.panneau) return;
    const ch = await client.channels.fetch(inv.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(inv.panneau).catch(() => null);
    if (!msg) return;
    await msg.edit({ embeds: [_boardEmbed(inv)], components: [_boardButtons()] }).catch(() => {});
  } catch {}
}

// Rafraîchit le board au démarrage et le RÉPARE : si le tableau a disparu (message
// supprimé, référence perdue après restauration), on le retrouve par son titre ou on le
// repose entièrement — pour toujours avoir le panneau complet avec ses boutons.
async function rafraichirBoardDemarrage(client) {
  try {
    const db = loadDB(); const inv = db.inventaire;
    if (!inv || !inv.channelId) return;
    const ch = await client.channels.fetch(inv.channelId).catch(() => null);
    if (!ch?.send) return;
    // Cherche le tableau (épingles + historique profond) et supprime les doublons éventuels
    const msg = await _dedupeBoards(client, inv, true);
    if (msg) {
      await msg.edit({ embeds: [_boardEmbed(_ensure(db))], components: [_boardButtons()] }).catch(() => {});
    } else {
      // AUCUN tableau trouvé nulle part → on en pose un (et un seul)
      const sent = await ch.send({ embeds: [_boardEmbed(_ensure(db))], components: [_boardButtons()] }).catch(() => null);
      if (sent) {
        inv.panneau = sent.id; try { await sent.pin(); } catch {}
        if (!inv.threadId) { try { const th = await sent.startThread({ name: "📦 Journal du coffre", autoArchiveDuration: 10080 }); inv.threadId = th.id; await th.send({ content: "📦 Ici s'inscrivent **tous les mouvements** du coffre. Le salon reste propre." }).catch(() => {}); } catch {} }
        persist(db);
      }
    }
  } catch {}
}

// Renvoie le fil « Journal du coffre », en le RÉPARANT si besoin : si le fil a disparu
// (ex. le tableau auquel il était rattaché a été supprimé), on le retrouve sur le tableau
// courant ou on le recrée — pour que les mouvements s'inscrivent toujours dedans.
async function _thread(client, inv) {
  // 1) Fil enregistré et toujours vivant
  if (inv.threadId) { const t = await client.channels.fetch(inv.threadId).catch(() => null); if (t) return t; }
  // 2) Fil rattaché au tableau courant (ou on le crée)
  if (inv.channelId && inv.panneau) {
    const ch = await client.channels.fetch(inv.channelId).catch(() => null);
    const msg = ch ? await ch.messages.fetch(inv.panneau).catch(() => null) : null;
    if (msg) {
      let th = msg.thread || null;
      if (!th && msg.startThread) { th = await msg.startThread({ name: "📦 Journal du coffre", autoArchiveDuration: 10080 }).catch(() => null); if (th) await th.send({ content: "📦 Ici s'inscrivent **tous les mouvements** du coffre (ajouts, retraits, lectures, alertes)." }).catch(() => {}); }
      if (th) { if (inv.threadId !== th.id) { inv.threadId = th.id; try { const d = loadDB(); if (d.inventaire) { d.inventaire.threadId = th.id; saveDB(d); } } catch {} } return th; }
    }
  }
  // 3) Repli : le salon du coffre
  if (inv.channelId) return await client.channels.fetch(inv.channelId).catch(() => null);
  return null;
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

// Sélection en attente entre le menu d'objet et la saisie de quantité (clé : userId)
const _pendingMov = new Map();
function _pendingCleanup() { const now = Date.now(); for (const [k, v] of _pendingMov) if (now - (v.at || 0) > 600000) _pendingMov.delete(k); }
// Liste des objets présents dans le coffre, prête pour un menu déroulant (max 25)
function _itemOptions(inv) {
  const opts = [];
  for (const c of CATS) for (const [nom, q] of Object.entries(inv.stock[c] || {})) {
    opts.push({ label: `${CAT_EMOJI[c] || ''} ${nom} — ${c}`.trim().slice(0, 100), description: `Catégorie : ${c} · en stock : ${q}`.slice(0, 100), value: `${c}|${nom}`.slice(0, 100) });
  }
  return opts.sort((a, b) => a.label.localeCompare(b.label)).slice(0, 25);
}
// Applique un mouvement (add/remove/set) et renvoie {existante, avant, apres}
function _applyMov(inv, action, cat, objet, qte) {
  if (!inv.stock[cat]) inv.stock[cat] = {};
  const bucket = inv.stock[cat];
  const existante = Object.keys(bucket).find(k => _norm(k) === _norm(objet)) || objet;
  const avant = bucket[existante] || 0;
  let apres;
  if (action === 'add') apres = avant + qte;
  else if (action === 'remove') apres = Math.max(0, avant - qte);
  else apres = qte;
  if (apres <= 0) delete bucket[existante]; else bucket[existante] = apres;
  return { existante, avant, apres };
}
// Petit modal ne demandant QUE la quantité (l'objet est déjà choisi dans le menu)
function _modalQuantite(action) {
  const titre = action === 'add' ? "➕ Ajouter — quantité" : action === 'remove' ? "➖ Retirer — quantité" : "✏️ Corriger — quantité exacte";
  const label = action === 'add' ? "Combien en AJOUTER ?" : action === 'remove' ? "Combien en RETIRER ?" : "Nouvelle quantité EXACTE (0 = supprimer)";
  const m = new ModalBuilder().setCustomId(`invq::${action}`).setTitle(titre);
  m.addComponents(new ActionRowBuilder().addComponents(
    new TextInputBuilder().setCustomId("qte").setLabel(label).setStyle(TextInputStyle.Short).setPlaceholder("ex : 5").setRequired(true),
  ));
  return m;
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
const PROMPT_VISION = `Tu es un greffier méticuleux. Tu analyses une capture d'écran de l'inventaire d'un coffre dans un jeu vidéo type Far West (RedM / Red Dead Redemption). Ta priorité ABSOLUE est l'EXACTITUDE.

MÉTHODE (suis-la case par case) :
1. Examine la grille case par case, de gauche à droite puis de haut en bas, SANS en sauter une seule.
2. Pour CHAQUE case occupée : lis le NOM exact de l'objet (souvent affiché au survol ou sous l'icône) et sa QUANTITÉ.
3. La QUANTITÉ est le petit nombre affiché sur l'icône (en général en bas à droite, parfois précédé de « x » : x12, ×3…). Lis-le avec la plus grande attention, chiffre par chiffre. Si AUCUN nombre n'est affiché, la quantité est 1.
4. Ne CONFONDS pas deux objets différents qui se ressemblent (ex. deux revolvers de modèles distincts = deux lignes séparées). Ne FUSIONNE jamais des objets différents.
5. Utilise le nom le plus précis et fidèle possible à ce qui est écrit à l'écran (garde la langue affichée). N'abrège pas, ne traduis pas, ne reformule pas.

Liste ABSOLUMENT TOUS les objets visibles sans en oublier un seul, Y COMPRIS les outils, crochets, cordes, lanternes, pelles, kits et tout équipement utilitaire.
Réponds UNIQUEMENT avec un tableau JSON valide, sans aucun texte autour ni balises de code, au format exact :
[{"nom":"Nom exact lu à l'écran","quantite":12,"categorie":"Armes"}]
La "categorie" doit obligatoirement être l'une de : Armes, Munitions, Provisions, Médecine, Matériel, Commun.
Règles de catégorie : Armes (revolvers, fusils, couteaux) ; Munitions (balles, cartouches, poudre) ; Provisions (nourriture, boissons, alcool) ; Médecine (remèdes, toniques, bandages) ; Matériel (OUTILS, CROCHETS, cordes, lanternes, pelles, pièges, kits, tout objet utilitaire) ; Commun (le reste, ou si tu hésites).
Si tu vois un objet sans réussir à lire son nom, NE L'OMETS PAS : ajoute-le avec "nom":"Objet inconnu" (ou une brève description), "categorie":"Commun", et la quantité visible (1 si tu ne sais pas).
N'omets aucun objet réellement présent, mais n'en invente aucun et ne devine pas une quantité que tu ne vois pas. Ne réponds que la liste. Si aucun objet n'est visible, réponds [].`;

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}
// Toute pièce jointe « photo » est acceptée (le contentType Discord est parfois vide/erroné) :
// on se base aussi sur l'extension, et on laisse _sniffMt corriger le type réel ensuite.
function _estImage(a) {
  if (!a) return false;
  if ((a.contentType || "").startsWith("image")) return true;
  if (/\.(png|jpe?g|gif|webp|bmp|tiff?|heic|heif|jfif|avif)(\?|$)/i.test(a.name || a.url || "")) return true;
  return (a.width != null && a.height != null); // Discord remplit width/height pour toute image
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
    .setDescription("Voici ce que j'ai lu sur la photo. **Vérifie bien les quantités**, puis valide :\n\n" + desc +
      "\n\n**Que faire de cette lecture ?**\n" +
      "📸 **Le coffre = la photo** — le coffre devient EXACTEMENT cette liste *(la photo montre TOUT le coffre)*\n" +
      "✏️ **Corriger un objet** — rectifier une ligne mal lue avant d'enregistrer\n" +
      "❌ **Annuler** — ne rien changer")
    .setFooter({ text: "Pour AJOUTER ou RETIRER un nombre précis d'objets : utilise les boutons ➕ / ➖ du tableau du coffre." });
}
function _proposalRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId("invp_replace").setLabel("Le coffre = la photo").setEmoji("📸").setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId("invp_edit").setLabel("Corriger un objet").setEmoji("✏️").setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId("invp_cancel").setLabel("Annuler").setEmoji("❌").setStyle(ButtonStyle.Secondary),
  );
}
// Poste la proposition, l'enregistre dans db (persistant) et sauvegarde
async function _proposer(channel, items, by, db, inv) {
  try {
    // Retire les anciennes propositions de lecture NON validées (évite l'empilement de doublons)
    inv.lectures = inv.lectures || {};
    for (const oldId of Object.keys(inv.lectures)) {
      const om = await channel.messages.fetch(oldId).catch(() => null);
      if (om) await om.delete().catch(() => {});
      delete inv.lectures[oldId];
    }
    const m = await channel.send({ embeds: [_proposalEmbed(items)], components: [_proposalRow()], allowedMentions: { parse: [] } }).catch(() => null);
    if (m) { _prunePending(inv); inv.lectures[m.id] = { items, by, ts: Date.now() }; persist(db); }
    return m;
  } catch { return null; }
}
// Applique en consolidant les noms ; renvoie les variations {normNom:{avant,apres}}
function _snapshot(inv) {
  const m = {};
  for (const c of CATS) for (const [n, q] of Object.entries(inv.stock[c] || {})) {
    const k = _norm(n); m[k] = { nom: n, qte: (m[k]?.qte || 0) + (q || 0) };
  }
  return m;
}
// Applique la lecture et renvoie un DIFF complet (avant → après) pour vérification.
function _appliquer(inv, items, mode) {
  const before = _snapshot(inv);
  if (mode === 'replace') { for (const c of CATS) inv.stock[c] = {}; }
  for (const it of items) {
    if (!inv.stock[it.categorie]) inv.stock[it.categorie] = {};
    const b = inv.stock[it.categorie];
    const key = Object.keys(b).find(k => _norm(k) === _norm(it.nom)) || it.nom;
    b[key] = (b[key] || 0) + it.quantite;
  }
  const after = _snapshot(inv);
  const keys = new Set([...Object.keys(before), ...Object.keys(after)]);
  const lignes = [];
  for (const k of keys) {
    const av = before[k]?.qte || 0;
    const ap = after[k]?.qte || 0;
    if (av === ap) continue;
    lignes.push({ nom: after[k]?.nom || before[k]?.nom || k, avant: av, apres: ap });
  }
  lignes.sort((a, b) => (b.apres - b.avant) - (a.apres - a.avant));
  const changes = {};
  for (const l of lignes) changes[_norm(l.nom)] = { avant: l.avant, apres: l.apres };
  return { lignes, changes };
}
function _recapDiff(lignes) {
  if (!lignes.length) return "Aucun changement — le coffre correspondait déjà exactement à la lecture. ✅";
  return lignes.slice(0, 40).map(l => {
    const delta = l.apres - l.avant;
    const tag = l.avant === 0 ? "🆕" : l.apres === 0 ? "🗑️" : delta > 0 ? "➕" : "➖";
    const d = delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : "";
    return `${tag} **${l.nom}** : ${l.avant} → **${l.apres}**${d}`;
  }).join("\n").slice(0, 1800);
}
function _recapEmbed(mode, lignes) {
  return new EmbedBuilder().setColor(mode === 'replace' ? 0xC9A66B : 0x2ECC71)
    .setTitle(mode === 'replace' ? "📸 Coffre mis à jour (= la photo)" : "➕ Objets ajoutés au stock")
    .setDescription(_recapDiff(lignes).slice(0, 4000))
    .setFooter({ text: `${lignes.length} changement(s) appliqué(s) au coffre` });
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
      // « Installer » = repartir PROPRE : on supprime TOUS les anciens tableaux (même un vieux
      // design enfoui dans l'historique) et on en pose un NEUF, avec un fil Journal neuf.
      const olds = await _trouverTableaux(interaction.client, interaction.channel, true);
      for (const o of olds) await o.delete().catch(() => {});
      inv.panneau = null; inv.threadId = null;
      const m = await interaction.channel.send({ embeds: [_boardEmbed(inv)], components: [_boardButtons()] }).catch(() => null);
      if (!m) { await interaction.editReply({ content: "❌ Je n'ai pas pu poster ici (vérifie mes permissions d'écriture dans ce salon)." }).catch(() => {}); return true; }
      inv.panneau = m.id; try { await m.pin(); } catch {}
      try { const th = await m.startThread({ name: "📦 Journal du coffre", autoArchiveDuration: 10080 }); inv.threadId = th.id; await th.send({ content: "📦 Ici s'inscrivent **tous les mouvements** du coffre (ajouts, retraits, lectures, alertes). Le salon reste propre." }).catch(() => {}); } catch {}
      persist(db);
      await interaction.editReply({ content: "✅ **Nouveau** tableau du coffre installé (les anciens ont été retirés) : tableau épinglé + fil « 📦 Journal du coffre ». Gère via les boutons (➕ Ajouter / ➖ Retirer / ✏️ Corriger), ou glisse une **photo** du coffre pour le mettre à jour." }).catch(() => {});
      return true;
    }

    // ── Photo : capture(s) épinglée(s) + lecture IA ──
    if (interaction.isChatInputCommand?.() && interaction.commandName === "inventaire-photo") {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const atts = ["image", "image2", "image3"].map(n => interaction.options.getAttachment(n)).filter(a => _estImage(a));
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

    // ── Boutons manuels : panneau « choisis l'objet → indique la quantité » ──
    if (interaction.isButton?.() && ["inv_add", "inv_remove", "inv_set"].includes(interaction.customId)) {
      const action = interaction.customId.replace("inv_", "");
      const db = loadDB(); const inv = _ensure(db);
      const opts = _itemOptions(inv);
      // Ajout d'un objet ABSENT du coffre → formulaire direct (nom + catégorie + quantité)
      if (action === 'add' && !opts.length) { await interaction.showModal(_modal('add')).catch(() => {}); return true; }
      if (action !== 'add' && !opts.length) { await interaction.reply({ content: `Le coffre est vide — rien à ${action === 'remove' ? "retirer" : "corriger"}.`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const ph = action === 'add' ? "Choisis l'objet à réapprovisionner…" : action === 'remove' ? "Choisis l'objet à retirer…" : "Choisis l'objet à corriger…";
      const select = new StringSelectMenuBuilder().setCustomId(`invsel::${action}`).setPlaceholder(ph).addOptions(opts);
      const comps = [new ActionRowBuilder().addComponents(select)];
      if (action === 'add') comps.push(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId("inv_new").setLabel("Nouvel objet (absent de la liste)").setEmoji("🆕").setStyle(ButtonStyle.Secondary)));
      const verbe = action === 'add' ? "➕ **Ajouter** au coffre" : action === 'remove' ? "➖ **Retirer** du coffre" : "✏️ **Corriger** (uniquement en cas d'erreur)";
      await interaction.reply({ content: `${verbe}\nChoisis l'objet dans le menu, puis indique la **quantité**.`, components: comps, flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }
    // Nouvel objet (absent du coffre) → formulaire complet
    if (interaction.isButton?.() && interaction.customId === "inv_new") {
      await interaction.showModal(_modal('add')).catch(() => {});
      return true;
    }
    // Objet choisi dans le menu → on demande la quantité
    if (interaction.isStringSelectMenu?.() && interaction.customId.startsWith("invsel::")) {
      const action = interaction.customId.split("::")[1];
      const raw = interaction.values[0] || "";
      const i = raw.indexOf("|");
      const cat = i >= 0 ? raw.slice(0, i) : "Commun";
      const nom = i >= 0 ? raw.slice(i + 1) : raw;
      _pendingCleanup();
      _pendingMov.set(interaction.user.id, { action, cat, nom, at: Date.now() });
      await interaction.showModal(_modalQuantite(action)).catch(() => {});
      return true;
    }
    // Quantité saisie → application du mouvement
    if (interaction.isModalSubmit?.() && interaction.customId.startsWith("invq::")) {
      // Le menu d'objet (message éphémère) est REMPLACÉ par le résultat → impossible de re-cliquer dessus
      const fromMsg = interaction.isFromMessage?.();
      if (fromMsg) await interaction.deferUpdate().catch(() => {}); else await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const action = interaction.customId.split("::")[1];
      const pend = _pendingMov.get(interaction.user.id); _pendingMov.delete(interaction.user.id);
      if (!pend) { await interaction.editReply({ content: "⏳ Sélection expirée — relance via le bouton du tableau.", components: [], embeds: [] }).catch(() => {}); return true; }
      const qte = parseInt(((interaction.fields.getTextInputValue("qte") || "").replace(/[^0-9]/g, "")), 10);
      if (!Number.isFinite(qte) || qte < 0 || (action !== 'set' && qte <= 0)) { await interaction.editReply({ content: "❌ Quantité invalide (mets un nombre, ex : 5). Relance via le bouton du tableau.", components: [], embeds: [] }).catch(() => {}); return true; }
      const db = loadDB(); const inv = _ensure(db);
      const { existante, avant, apres } = _applyMov(inv, action, pend.cat, pend.nom, qte);
      _journalAdd(inv, interaction.user.id, `${action === 'add' ? "Ajout" : action === 'remove' ? "Retrait" : "Correction"} : ${action === 'set' ? "" : qte + " × "}${existante} (${pend.cat}) → ${apres}`);
      persist(db);
      await _refreshBoard(interaction.client, inv);
      const who = `<@${interaction.user.id}>`;
      let logTxt;
      if (action === 'set') logTxt = `📦 ${who} a recompté **${existante}** : ${avant} → **${apres}** *(${pend.cat})*.`;
      else { const mot = action === 'add' ? "a rangé" : "a sorti"; const fin = action === 'add' ? "total" : "reste"; logTxt = `📦 ${who} ${mot} **${qte} × ${existante}** *(${pend.cat})* · ${fin} : **${apres}**.`; }
      await _log(interaction.client, inv, logTxt);
      await _checkSeuils(interaction.client, inv, { [_norm(existante)]: { avant, apres } });
      await interaction.editReply({ content: `✅ **${action === 'add' ? "Ajouté" : action === 'remove' ? "Retiré" : "Corrigé"}** : ${existante} — ${avant} → **${apres}** *(${pend.cat})*.`, components: [], embeds: [] }).catch(() => {});
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
      const { lignes, changes } = _appliquer(inv, items, mode);
      _journalAdd(inv, interaction.user.id, `📷 ${mode === 'replace' ? "Remplacé" : "Complété"} depuis une capture (${items.length} lu(s) · ${lignes.length} changement(s))`);
      persist(db);
      await _refreshBoard(interaction.client, inv);
      await _log(interaction.client, inv, `📷 <@${interaction.user.id}> a ${mode === 'replace' ? "remplacé tout le coffre par" : "ajouté au coffre"} la lecture (${items.length} objet(s) lu(s)) :\n${_recapDiff(lignes)}`);
      await _checkSeuils(interaction.client, inv, changes);
      await interaction.editReply({ content: `✅ **Coffre mis à jour** — ${lignes.length} changement(s). Vérifie le détail ci-dessous (avant → après) :`, embeds: [_recapEmbed(mode, lignes)], components: [] }).catch(() => {});
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
    console.log("❌ inventaire routeInteraction:", e.message, "\n", (e.stack || "").split("\n").slice(0, 4).join("\n"));
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
    const imgs = message.attachments ? [...message.attachments.values()].filter(a => _estImage(a)) : [];
    if (!imgs.length) return false;
    const inv = _ensure(db);
    await message.react("🔍").catch(() => {});
    // Nettoie d'éventuels tableaux du coffre en double avant de traiter la photo
    await _dedupeBoards(message.client, inv);
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
