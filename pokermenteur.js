// ───────────────────────────────────────────────────────────────────────────
//  pokermenteur.js — Table de POKER MENTEUR (Liar's Dice, façon Red Dead / Perudo).
//   • 2 à 6 joueurs, 5 dés chacun. Chacun mise un ANTE en s'asseyant ; le dernier
//     survivant rafle le POT (jetons de table, aucune monnaie réelle touchée).
//   • Chaque manche : lancer secret des dés (visibles via pm_peek éphémère).
//     Une enchère = QUANTITÉ × FACE (2..6) sur TOUTE la table. Les 1 sont JOKERS.
//     À son tour : SURENCHÉRIR (pm_bid) ou crier « MENTEUR ! » (pm_challenge).
//   • Résolution : total = (dés à la face) + (dés à 1). total ≥ quantité →
//     l'enchère est VRAIE → le CHALLENGER perd un dé ; sinon l'ENCHÉRISSEUR perd.
//     À 0 dé, éliminé. Dernier en jeu = vainqueur.
//   • Un joueur OUVRE la table (« hôte »). Tout est préfixé pm_ — RIEN en base.
//   • Plateau édité EN DIRECT en image (pokermenteur-image.js). Repli texte sûr.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
let _img = null; try { _img = require('./pokermenteur-image'); } catch { _img = null; }
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }
let _ambiance = {}; try { _ambiance = require('./ambiance-ia'); } catch { _ambiance = {}; }
const _sous = uid => (casino.solde ? casino.solde(uid) : 0);

const PREFIXE = 'pm_';
const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const MAX_JOUEURS = 6, MIN_JOUEURS = 2;
const NB_DES = 5;
const ANTE_MIN = 1, ANTE_MAX = 1000000;
const TOUR_MS = 120000; // 2 min pour parler, sinon auto-action sûre

function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
const _phrasesManche = ['« Secouez, misez, mentez. »', '« Que le meilleur bluffeur gagne. »', '« Les dés roulent, les langues fourchent. »', '« Regardez vos dés… et le visage des autres. »'];

// ── Émotes RP à coller EN JEU (RedM) : garde la scène vivante pendant qu'on joue sur Discord ──
const _EMOTES_SCENE = [
  '/do Les gobelets claquent sur le bois, les enchères montent, personne ne cille.',
  '/do Autour de la table, des dés roulent en secret et les regards se jaugent.',
  '/do Le saloon retient son souffle : un bluff de trop et quelqu\'un perdra un dé.',
  '/me fixe ses adversaires un à un, cherchant le mensonge sur leurs visages.',
];
const _EMOTES_LOBBY = [
  '/me tire une chaise, pose son ante sur le tapis et fait rouler ses dés dans sa paume.',
  '/me secoue son gobelet près de son oreille, l\'air de rien, avant de s\'asseoir.',
  '/me ajuste son chapeau et jauge les autres bluffeurs autour de la table.',
  '/me claque quelques pièces sur le bois en guise de mise et s\'installe.',
];
const _EMOTES_TOUR = [
  '/me secoue son gobelet et jette un œil discret à ses dés à l\'abri des regards.',
  '/me caresse sa moustache, pesant s\'il doit surenchérir ou crier au menteur.',
  '/me tapote le tapis du bout des doigts, le visage fermé, avant d\'annoncer.',
];
const _EMOTES_GAGNE = [
  '/me ramasse le pot d\'un geste ample, un sourire en coin sous le chapeau.',
  '/me rafle les pièces au centre de la table et lève son verre à sa chance.',
];
const _EMOTES_PERDU = [
  '/me repousse un dé sur le côté en grommelant dans sa barbe.',
  '/me lâche un juron étouffé en découvrant les dés retournés.',
];
const _EMOTES_GEN = [
  '/me garde ses dés cachés sous sa paume et observe le jeu des autres.',
  '/me croise les bras, gobelet renversé devant lui, impassible.',
];
function _emotePerso(t, j) {
  if (!j) return _pick(_EMOTES_SCENE);
  if (t.phase === 'fini') { return _pick(t.gagnant && t.gagnant.userId === j.userId ? _EMOTES_GAGNE : _EMOTES_PERDU); }
  if (t.phase === 'entredeux') { const pIdx = t.dernierDefi ? t.dernierDefi.perdantIdx : -1; return _pick(t.joueurs[pIdx]?.userId === j.userId ? _EMOTES_PERDU : _EMOTES_GEN); }
  if (t.phase === 'jeu') { if (t.joueurs[t.tourIdx]?.userId === j.userId) return _pick(_EMOTES_TOUR); if (!j.vivant) return _pick(_EMOTES_PERDU); return _pick(_EMOTES_GEN); }
  return _pick(_EMOTES_LOBBY);
}
// ── Règles : « comment jouer », montrées avant de lancer une partie ──
const _REGLES = [
  '📖 **POKER MENTEUR (LIAR\'S DICE) — COMMENT JOUER**',
  '',
  '**But :** être le **dernier debout**. Chaque joueur a 5 dés secrets ; qui se trompe perd un dé, à 0 il est éliminé.',
  '',
  '**La donne :** chacun mise son **ante** au pot, puis lance ses 5 dés **en secret** (bouton 🫣 **Voir mes dés**).',
  '**Une enchère = QUANTITÉ × FACE** (ex. **3 × 4**) : tu paries qu\'il y a **au moins** 3 dés montrant un **4** sur **toute la table**.',
  '**Les 1 sont des JOKERS** : ils comptent pour n\'importe quelle face. On ne mise donc jamais sur la face 1.',
  '**À ton tour :**',
  '• 🎲 **Surenchérir** — monte la **quantité**, ou garde la quantité avec une **face plus haute**.',
  '• 🗯️ **MENTEUR !** — tu contestes l\'enchère en cours. On révèle alors tous les dés.',
  '**Résolution :** si le vrai total (dés à la face **+** les 1) **atteint** l\'enchère → elle était **VRAIE**, le **contestataire** perd un dé ; sinon l\'**enchérisseur** perd un dé.',
  '**Éliminé à 0 dé.** Le dernier survivant **rafle tout le pot**.',
  '',
  '🎭 **Reste en RP :** appuie sur **Emote RP** à chaque tour et colle la ligne **en jeu** — comme ça, personne ne te prend pour un AFK pendant que tu joues ici.',
  '💰 **Sous :** tes gains/pertes de la soirée sont cumulés dans ton compteur de **sous** du saloon (bouton « Mes sous »).',
];

// ─── Logique des dés (pure, testable) ───
function _lancer(n) { const d = []; for (let i = 0; i < n; i++) d.push(1 + Math.floor(Math.random() * 6)); return d; }
// Compte, sur TOUTE la table, les dés montrant `face` PLUS les 1 (jokers).
function _compterFace(joueurs, face) {
  let t = 0;
  for (const j of joueurs) { if (!j.vivant) continue; for (const d of (j.des || [])) { if (d === face || d === 1) t++; } }
  return t;
}
function _totalDes(joueurs) { let t = 0; for (const j of joueurs) if (j.vivant) t += (j.des || []).length; return t; }
// Validité d'une surenchère : quantité strictement supérieure (face libre),
// OU même quantité avec une face strictement supérieure. Face bornée 2..6.
function _bidValide(prev, qty, face) {
  if (!Number.isFinite(qty) || !Number.isFinite(face)) return false;
  if (face < 2 || face > 6) return false;
  if (qty < 1) return false;
  if (!prev) return true;
  if (qty > prev.qty) return true;
  if (qty === prev.qty && face > prev.face) return true;
  return false;
}
// Résout un défi (challenger vs enchère courante). Renvoie qui perd un dé.
function _resoudreDefi(joueurs, bid, challengerIdx) {
  const total = _compterFace(joueurs, bid.face);
  const vrai = total >= bid.qty; // enchère VRAIE si assez de dés
  const perdantIdx = vrai ? challengerIdx : bid.parIdx;
  return { vrai, total, perdantIdx };
}

// ─── État des tables (mémoire, une par salon) ───
const tables = new Map(); // channelId -> table

function _creerTable(interaction) {
  return {
    channelId: interaction.channelId,
    guildId: interaction.guild?.id,
    hoteId: interaction.user.id,
    hoteNom: interaction.member?.displayName || interaction.user.username,
    phase: 'lobby',            // 'lobby' | 'jeu' | 'entredeux' | 'fini'
    joueurs: [],               // { userId, nom, des:[], nb, vivant, ante }
    pot: 0,
    bid: null,                 // { qty, face, parIdx }
    tourIdx: -1,
    ouvreurIdx: 0,             // qui ouvre la prochaine manche
    historique: [],            // ['Colt: 2×4', ...] de la manche
    reveal: false,             // révéler tous les dés (après un défi)
    dernierDefi: null,         // { txt, perdantIdx }
    manche: 0,
    soldes: {},                // userId -> net jetons de la soirée
    msg: null,
    messageId: null,
    timer: null,
    ambiance: '',
    gagnant: null,
  };
}

function _joueur(t, uid) { return t.joueurs.find(j => j.userId === uid); }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }
function _prochainVivant(t, fromIdx) {
  const n = t.joueurs.length;
  for (let k = 1; k <= n; k++) { const i = (fromIdx + k) % n; if (t.joueurs[i].vivant) return i; }
  return fromIdx;
}
function _pushHist(t, idx, qty, face) { t.historique.push((t.joueurs[idx]?.nom || '?') + ': ' + qty + '×' + face); if (t.historique.length > 6) t.historique.shift(); }

// ─── Déroulé ───
function _armer(t) {
  _clearTimer(t);
  if (t.phase !== 'jeu') return;
  t.timer = setTimeout(async () => {
    try {
      if (t.phase !== 'jeu') return;
      const idx = t.tourIdx;
      const j = t.joueurs[idx];
      if (!j || !j.vivant) return;
      const total = _totalDes(t.joueurs);
      // Auto-action sûre : ouvrir modestement (1×2), sinon +1 en quantité ;
      // et si l'enchère est déjà >= au total de dés de la table (surenchère
      // forcément mensongère), crier « MENTEUR ! » plutôt que de surenchérir.
      if (!t.bid) {
        t.bid = { qty: 1, face: 2, parIdx: idx };
        _pushHist(t, idx, 1, 2);
        t.ambiance = j.nom + ' tarde — enchère d\'office 1×2.';
        t.tourIdx = _prochainVivant(t, idx);
        _armer(t);
      } else if (t.bid.qty >= total) {
        t.ambiance = j.nom + ' tarde — « MENTEUR ! » d\'office.';
        _defi(t, idx);
      } else {
        const q = t.bid.qty + 1, f = t.bid.face;
        t.bid = { qty: q, face: f, parIdx: idx };
        _pushHist(t, idx, q, f);
        t.ambiance = j.nom + ' tarde — surenchère d\'office ' + q + '×' + f + '.';
        t.tourIdx = _prochainVivant(t, idx);
        _armer(t);
      }
      await _refresh(t);
    } catch (e) { console.log('⚠️ pm timer:', e.message); }
  }, TOUR_MS);
}

function _nouvelleManche(t) {
  _clearTimer(t);
  t.manche++;
  t.bid = null;
  t.reveal = false;
  t.dernierDefi = null;
  t.historique = [];
  t.gagnant = null;
  for (const j of t.joueurs) j.des = j.vivant ? _lancer(j.nb) : [];
  if (!t.joueurs[t.ouvreurIdx]?.vivant) t.ouvreurIdx = _prochainVivant(t, t.ouvreurIdx);
  t.tourIdx = t.ouvreurIdx;
  t.phase = 'jeu';
  t.ambiance = _pick(_phrasesManche);
  _armer(t);
}

function _lancerPartie(t) {
  // Les antes sont déjà au pot (réglés à l'assise). On démarre la 1re manche.
  t.manche = 0;
  t.ouvreurIdx = 0;
  for (const j of t.joueurs) { j.nb = NB_DES; j.vivant = true; }
  _nouvelleManche(t);
}

// Exécute un défi lancé par challengerIdx contre l'enchère courante.
function _defi(t, challengerIdx) {
  _clearTimer(t);
  const bid = t.bid;
  const { vrai, total, perdantIdx } = _resoudreDefi(t.joueurs, bid, challengerIdx);
  const perdant = t.joueurs[perdantIdx];
  const bidder = t.joueurs[bid.parIdx];
  const challenger = t.joueurs[challengerIdx];
  perdant.nb -= 1;
  t.reveal = true;
  t.phase = 'entredeux';
  const verdict = vrai
    ? '« MENTEUR ! » de ' + challenger.nom + ' — mais il y avait ' + total + ' dé(s) pour ' + bid.qty + '×' + bid.face + '. Enchère VRAIE : ' + challenger.nom + ' perd un dé.'
    : '« MENTEUR ! » de ' + challenger.nom + ' — seulement ' + total + ' dé(s) pour ' + bid.qty + '×' + bid.face + '. Bluff démasqué : ' + bidder.nom + ' perd un dé.';
  t.dernierDefi = { txt: verdict, perdantIdx };
  t.ambiance = verdict;
  if (perdant.nb <= 0) { perdant.vivant = false; perdant.des = []; t.dernierDefi.txt += ' ' + perdant.nom + ' est ÉLIMINÉ.'; }
  // L'ouvreur de la prochaine manche = le perdant s'il survit, sinon le suivant vivant.
  t.ouvreurIdx = perdant.vivant ? perdantIdx : _prochainVivant(t, perdantIdx);
  const vivants = t.joueurs.filter(j => j.vivant);
  if (vivants.length <= 1) {
    t.phase = 'fini';
    const g = vivants[0] || null;
    if (g) { t.gagnant = g; t.soldes[g.userId] = (t.soldes[g.userId] || 0) + t.pot; }
    // Compteur de « sous » PERSISTANT du saloon : net de la partie (ante réglé à l'assise + pot au vainqueur). Une seule écriture pour toute la table.
    try { if (casino.crediterLot) casino.crediterLot(t.joueurs.map(j => ({ userId: j.userId, montant: t.soldes[j.userId] || 0 }))); } catch {}
  }
  return { vrai, total, perdantIdx };
}

// ─── Rendu ───
function _sousTitre(t) {
  if (t.phase === 'jeu') { const j = t.joueurs[t.tourIdx]; return 'À ' + (j ? j.nom : '—') + ' de parler — Surenchérir ou crier « Menteur ! »'; }
  if (t.phase === 'entredeux') return 'Manche révélée — l\'hôte lance la manche suivante';
  if (t.phase === 'fini') return 'Partie terminée';
  return t.manche > 0 ? 'Partie terminée' : 'Chacun mise son ante — puis l\'hôte lance la partie';
}
function _badge(t, i) {
  const j = t.joueurs[i];
  if (!j.vivant) return 'éliminé';
  if (t.phase === 'jeu') { if (i === t.tourIdx) return 'à lui de parler'; if (t.bid && t.bid.parIdx === i) return 'a misé'; return 'en attente'; }
  if (t.phase === 'entredeux' && t.dernierDefi && t.dernierDefi.perdantIdx === i) return 'perd un dé';
  return '';
}
function _imgState(t) {
  return {
    sousTitre: _sousTitre(t),
    pot: _money(t.pot),
    bid: t.bid ? { qty: t.bid.qty, face: t.bid.face, parNom: t.joueurs[t.bid.parIdx]?.nom } : null,
    reveal: t.reveal,
    historique: t.historique.slice(-4),
    defi: (t.phase === 'entredeux' && t.dernierDefi) ? { txt: t.dernierDefi.txt } : null,
    gagnant: t.phase === 'fini' && t.gagnant ? t.gagnant.nom : null,
    joueurs: t.joueurs.map((j, i) => ({ nom: j.nom, nb: j.nb, des: j.des, cache: !t.reveal, actif: t.phase === 'jeu' && i === t.tourIdx, vivant: j.vivant, badge: _badge(t, i) })),
  };
}
// Repli texte (si l'image ne se génère pas).
function _lignesTexte(t) {
  const L = [];
  L.push(t.bid ? '🎲 **Enchère : ' + t.bid.qty + ' × ' + t.bid.face + '**  (' + (t.joueurs[t.bid.parIdx]?.nom || '?') + ')' : '🎲 *Aucune enchère — à l\'ouvreur de parler.*');
  L.push('💰 **Pot :** ' + _money(t.pot));
  L.push('─────────────────────────────');
  if (!t.joueurs.length) L.push('*Personne à la table.*');
  else t.joueurs.forEach((j, i) => {
    const des = t.reveal && j.vivant ? '  ' + (j.des || []).map(d => d === 1 ? '**1**' : d).join(' ') : '';
    const b = _badge(t, i);
    L.push((j.vivant ? (t.phase === 'jeu' && i === t.tourIdx ? '▸ ' : '• ') : '✗ ') + '**' + j.nom + '** — ' + (j.vivant ? j.nb + ' dé(s)' : 'hors jeu') + des + (b ? '  · ' + b : ''));
  });
  L.push('─────────────────────────────');
  if (t.phase === 'entredeux' && t.dernierDefi) L.push('⚖️ *' + t.dernierDefi.txt + '*');
  else if (t.phase === 'fini' && t.gagnant) L.push('★ **' + t.gagnant.nom + ' rafle le pot de ' + _money(t.pot) + ' !**');
  else if (t.ambiance) L.push('💬 *' + t.ambiance + '*');
  if (t.phase === 'lobby' && t.manche === 0) L.push('📖 *Nouveau ? Clique **Comment jouer** avant de lancer.*  🎭 *Pense à **Emote RP** pour rester crédible en jeu.*');
  if (t.historique.length) L.push('🗒️ *Enchères : ' + t.historique.slice(-4).join(' · ') + '*');
  const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => { const j = t.joueurs.find(x => x.userId === u); return '• ' + (j ? j.nom : 'Parti') + ' : ' + _money(n); });
  if (sold.length) L.push('🏦 **Jetons de la soirée**\n' + sold.join('\n'));
  return L;
}
// Rangée commune : Comment jouer / Emote RP / Mes sous (présente sur toutes les phases).
function _rowExtras() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pm_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pm_emote').setLabel('Emote RP').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pm_voix').setLabel('À dire (voix)').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pm_sous').setLabel('Mes sous').setEmoji('💰').setStyle(ButtonStyle.Secondary),
  );
}
function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pm_sit').setLabel('S\'asseoir (miser l\'ante)').setEmoji('🪑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pm_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pm_deal').setLabel('Lancer la partie').setEmoji('🎲').setStyle(ButtonStyle.Primary).setDisabled(t.joueurs.length < MIN_JOUEURS),
      new ButtonBuilder().setCustomId('pm_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else if (t.phase === 'jeu') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pm_peek').setLabel('Voir mes dés').setEmoji('🫣').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pm_bid').setLabel('Surenchérir').setEmoji('🎲').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pm_challenge').setLabel('MENTEUR !').setEmoji('🗯️').setStyle(ButtonStyle.Danger).setDisabled(!t.bid),
    ));
  } else if (t.phase === 'entredeux') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pm_next').setLabel('Manche suivante').setEmoji('🎲').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pm_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else { // fini
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pm_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  }
  rows.push(_rowExtras());
  return rows;
}
async function _screen(t) {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎲  POKER MENTEUR  ·  LIAR\'S DICE')
    .setFooter({ text: 'Hôte : ' + t.hoteNom + '  ·  5 dés chacun  ·  Les 1 sont jokers  ·  Dernier debout rafle le pot' });
  let buf = null;
  try { if (_img?.genererTable) buf = await _img.genererTable(_imgState(t)); } catch { buf = null; }
  if (buf) {
    e.setImage('attachment://pokermenteur.png');
    const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => { const j = t.joueurs.find(x => x.userId === u); return '• ' + (j ? j.nom : 'Parti') + ' : ' + _money(n); });
    let desc = '';
    if (t.phase === 'lobby' && t.manche === 0) desc = '👉 **S\'asseoir** pour miser l\'ante, puis l\'**hôte lance la partie** (≥ ' + MIN_JOUEURS + ' joueurs).\n📖 *Nouveau ? Clique **Comment jouer** avant de lancer.*  🎭 *Pense à **Emote RP** pour rester crédible en jeu.*';
    else if (t.phase === 'jeu') desc = '🫣 **Voir mes dés** (privé) · 🎲 **Surenchérir** · 🗯️ **Menteur !**';
    else if (t.phase === 'entredeux') desc = '⚖️ *' + (t.dernierDefi?.txt || '') + '*';
    else if (t.phase === 'fini') desc = '★ **' + (t.gagnant?.nom || '—') + ' rafle le pot de ' + _money(t.pot) + ' !**';
    if (sold.length) desc += '\n🏦 **Jetons de la soirée**\n' + sold.join('\n');
    if (desc) e.setDescription(desc.slice(0, 4000));
    return { embeds: [e], components: _components(t), files: [new AttachmentBuilder(buf, { name: 'pokermenteur.png' })] };
  }
  e.setDescription(_lignesTexte(t).join('\n').slice(0, 4000));
  return { embeds: [e], components: _components(t), files: [] };
}
async function _refresh(t) { try { if (t.msg) { const p = await _screen(t); await t.msg.edit({ ...p, attachments: [] }); } } catch (e) { console.log('⚠️ pm refresh:', e.message); } }

// ─── Panneau d'ouverture ───
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎲 SALOON — TABLE DE POKER MENTEUR')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║  POKER MENTEUR · LIAR\'S DICE  ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Cinq dés sous le gobelet, un visage de marbre, et le culot d\'annoncer plus haut que la vérité. Bluffez, surenchérissez… ou démasquez le menteur.*',
      '',
      '🎲 **Règle** — annoncez « QUANTITÉ × FACE » : le nombre de dés (toute la table) montrant cette face. **Les 1 sont jokers.** À votre tour : surenchérir ou crier **« MENTEUR ! »**. Qui se trompe perd un dé ; à zéro, éliminé.',
      '',
      '👉 **Ouvrir une table** ci-dessous : vous en devenez l\'**hôte**. Chacun mise son ante, le dernier debout rafle le pot.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pm_open').setLabel('Ouvrir une table de Poker Menteur').setEmoji('🎲').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}
async function installerPanelPokerMenteur(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('POKER MENTEUR');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ pm panel:', e.message); return null; }
}

// ─── Routeur d'interactions ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table (depuis le panneau)
    if (interaction.isButton() && id === 'pm_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) { await interaction.reply({ content: '🎲 Une table est déjà ouverte dans ce salon. Rejoins-la un peu plus haut !', flags: eph }); return true; }
      await interaction.deferReply({ flags: eph });
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(await _screen(t)).catch(() => null);
      if (!msg) { await interaction.editReply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).' }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.editReply({ content: '🎲 Table ouverte — tu en es l\'**hôte**. Assieds-toi 👇 (mise l\'ante), puis clique **Lancer la partie** quand tout le monde est prêt.' });
      return true;
    }

    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🎲.', flags: eph }).catch(() => {}); } return true; }

    // S'asseoir → modal d'ante
    if (interaction.isButton() && id === 'pm_sit') {
      if (t.phase !== 'lobby') { await interaction.reply({ content: '⏳ Une partie est en cours — assieds-toi à la prochaine table.', flags: eph }); return true; }
      if (_joueur(t, interaction.user.id)) { await interaction.reply({ content: 'Tu es déjà assis. Tu peux ajuster ton ante en te rasseyant.', flags: eph }); return true; }
      if (t.joueurs.length >= MAX_JOUEURS) { await interaction.reply({ content: '🈵 La table est complète (' + MAX_JOUEURS + ' joueurs).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('pm_sit_modal').setTitle('🪑 S\'asseoir — miser l\'ante')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ante').setLabel('Votre ante (jetons)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setPlaceholder('Ex : 50')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pm_sit_modal') {
      if (t.phase !== 'lobby') { await interaction.reply({ content: '⏳ Partie en cours, patiente.', flags: eph }); return true; }
      if (_joueur(t, interaction.user.id)) { await interaction.reply({ content: 'Tu es déjà assis.', flags: eph }); return true; }
      if (t.joueurs.length >= MAX_JOUEURS) { await interaction.reply({ content: '🈵 Table complète.', flags: eph }); return true; }
      let ante = parseInt((interaction.fields.getTextInputValue('ante') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(ante) || ante < ANTE_MIN) ante = ANTE_MIN;
      if (ante > ANTE_MAX) ante = ANTE_MAX;
      const j = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, des: [], nb: NB_DES, vivant: true, ante };
      t.joueurs.push(j);
      t.pot += ante;
      t.soldes[j.userId] = (t.soldes[j.userId] || 0) - ante;
      await interaction.reply({ content: '✅ Tu es assis, ante de **' + _money(ante) + '** au pot. Bonne chance, et bon bluff !', flags: eph });
      await _refresh(t); return true;
    }

    // Se lever (lobby seulement, ante remboursé)
    if (interaction.isButton() && id === 'pm_leave') {
      if (t.phase !== 'lobby') { await interaction.reply({ content: '⏳ Impossible de quitter en pleine partie — joue le coup.', flags: eph }); return true; }
      const idx = t.joueurs.findIndex(j => j.userId === interaction.user.id);
      if (idx < 0) { await interaction.reply({ content: 'Tu n\'es pas assis à cette table.', flags: eph }); return true; }
      const j = t.joueurs[idx];
      t.pot -= j.ante;
      t.soldes[j.userId] = (t.soldes[j.userId] || 0) + j.ante;
      if (t.soldes[j.userId] === 0) delete t.soldes[j.userId];
      t.joueurs.splice(idx, 1);
      await interaction.reply({ content: '🚪 Tu quittes la table, ante de **' + _money(j.ante) + '** rendu.', flags: eph });
      await _refresh(t); return true;
    }

    // Lancer la partie (hôte)
    if (interaction.isButton() && id === 'pm_deal') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut lancer la partie.', flags: eph }); return true; }
      if (t.phase !== 'lobby') { await interaction.reply({ content: 'Une partie est déjà en cours.', flags: eph }); return true; }
      if (t.joueurs.length < MIN_JOUEURS) { await interaction.reply({ content: 'Il faut au moins ' + MIN_JOUEURS + ' joueurs.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _lancerPartie(t);
      await _refresh(t); return true;
    }

    // Manche suivante (hôte)
    if (interaction.isButton() && id === 'pm_next') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut lancer la manche suivante.', flags: eph }); return true; }
      if (t.phase !== 'entredeux') { await interaction.reply({ content: 'Aucune manche à relancer maintenant.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _nouvelleManche(t);
      await _refresh(t); return true;
    }

    // Voir mes dés (éphémère, privé)
    if (interaction.isButton() && id === 'pm_peek') {
      const j = _joueur(t, interaction.user.id);
      if (!j) { await interaction.reply({ content: 'Tu n\'es pas à cette table.', flags: eph }); return true; }
      if (!j.vivant || !(j.des || []).length) { await interaction.reply({ content: '🎲 Tu n\'as pas de dés en main pour l\'instant.', flags: eph }); return true; }
      await interaction.deferReply({ flags: eph }); // accuse réception avant de générer l'image
      let buf = null;
      try { if (_img?.genererMain) buf = await _img.genererMain(j.des, j.nom); } catch { buf = null; }
      if (buf) { await interaction.editReply({ content: '🫣 Tes dés (les **1** sont jokers) :', files: [new AttachmentBuilder(buf, { name: 'mesdes.png' })] }); }
      else { await interaction.editReply({ content: '🫣 Tes dés : **' + (j.des || []).join(' · ') + '**  _(les 1 sont jokers)_' }); }
      return true;
    }

    // Surenchérir → modal quantité + face
    if (interaction.isButton() && id === 'pm_bid') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const cur = t.joueurs[t.tourIdx];
      if (!cur || cur.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + (cur ? cur.nom : '—') + '** de parler.', flags: eph }); return true; }
      const min = t.bid ? ('Actuel : ' + t.bid.qty + '×' + t.bid.face + ' — monte la quantité, ou même quantité + face plus haute.') : 'Ouvre l\'enchère.';
      const modal = new ModalBuilder().setCustomId('pm_bid_modal').setTitle('🎲 Surenchérir')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('qty').setLabel('Quantité').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setPlaceholder('Ex : 3')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('face').setLabel('Face (2 à 6) — le 1 est joker').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(1).setPlaceholder('Ex : 4  · ' + min)),
        );
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pm_bid_modal') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'La manche est terminée.', flags: eph }); return true; }
      const cur = t.joueurs[t.tourIdx];
      if (!cur || cur.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est plus ton tour.', flags: eph }); return true; }
      const qty = parseInt((interaction.fields.getTextInputValue('qty') || '').replace(/[^0-9]/g, ''), 10);
      const face = parseInt((interaction.fields.getTextInputValue('face') || '').replace(/[^0-9]/g, ''), 10);
      if (!_bidValide(t.bid, qty, face)) {
        const raison = (face < 2 || face > 6) ? 'La face doit être entre **2 et 6** (le 1 est joker, on ne l\'annonce pas).'
          : t.bid ? 'Il faut **surenchérir** : quantité plus haute, ou même quantité avec une face plus haute (actuel ' + t.bid.qty + '×' + t.bid.face + ').'
            : 'Enchère invalide.';
        await interaction.reply({ content: '🚫 ' + raison, flags: eph }); return true;
      }
      _clearTimer(t);
      t.bid = { qty, face, parIdx: t.tourIdx };
      _pushHist(t, t.tourIdx, qty, face);
      t.ambiance = cur.nom + ' annonce ' + qty + '×' + face + '.';
      t.tourIdx = _prochainVivant(t, t.tourIdx);
      _armer(t);
      await interaction.reply({ content: '✅ Enchère posée : **' + qty + ' × ' + face + '**.', flags: eph });
      await _refresh(t); return true;
    }

    // MENTEUR ! (défi)
    if (interaction.isButton() && id === 'pm_challenge') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const cur = t.joueurs[t.tourIdx];
      if (!cur || cur.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + (cur ? cur.nom : '—') + '** de parler.', flags: eph }); return true; }
      if (!t.bid) { await interaction.reply({ content: '🚫 Aucune enchère à contester — c\'est à toi d\'ouvrir.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _defi(t, t.tourIdx);
      await _refresh(t); return true;
    }

    // Fermer la table (hôte)
    if (interaction.isButton() && id === 'pm_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      const bilan = Object.keys(t.soldes).length ? Object.entries(t.soldes).map(([uid, n]) => '• <@' + uid + '> : ' + _money(n)).join('\n') : '';
      const e = new EmbedBuilder().setColor(0x8a6d3b).setTitle('🎲 Table fermée')
        .setDescription('On ramasse les dés et le gobelet. Merci d\'avoir bluffé à la maison.' + (bilan ? '\n\n**Bilan des jetons :**\n' + bilan : ''))
        .setFooter({ text: 'Iron Wolf Company · Saloon' });
      try { await t.msg?.edit({ embeds: [e], components: [], files: [], attachments: [] }); } catch {}
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    // Comment jouer (règles, avant de lancer)
    if (interaction.isButton() && id === 'pm_regles') {
      await interaction.reply({ content: _REGLES.join('\n'), flags: eph });
      return true;
    }
    // Emote RP à coller en jeu (anti-AFK)
    if (interaction.isButton() && id === 'pm_emote') {
      const j = _joueur(t, interaction.user.id);
      const lignes = _emotePerso(t, j) + '\n' + _pick(_EMOTES_SCENE);
      await interaction.reply({ content: '🎭 **Reste dans la scène !** Colle une de ces lignes **en jeu** (RedM) pour ne pas passer pour AFK :\n```\n' + lignes + '\n```\n*Astuce : garde le jeu en fenêtre, alterne vite, et remets une émote à chaque tour.*', flags: eph });
      return true;
    }
    // Compteur de sous du saloon (persistant)
    // Réplique à DIRE À VOIX HAUTE en jeu (ambiance IA)
    if (interaction.isButton() && id === 'pm_voix') {
      await interaction.deferReply({ flags: eph });
      const _arr = t.joueurs || t.sieges || [];
      const _cur = _arr[t.tourIdx];
      const _role = _estHote(t, interaction) ? 'croupier' : 'joueur';
      const _sit = (_cur && _cur.userId === interaction.user.id) ? 'bluff' : 'general';
      const _ligne = await _ambiance.repliqueVocale?.({ jeu: 'poker menteur', role: _role, situation: _sit }) || '';
      await interaction.editReply({ content: '🎙️ **À dire à voix haute (en jeu)** :\n> ' + _ligne + '\n\n*Dis-le au micro pour animer la table — pas besoin de le taper.*' });
      return true;
    }
    if (interaction.isButton() && id === 'pm_sous') {
      const total = _sous(interaction.user.id);
      const j = _joueur(t, interaction.user.id);
      const sess = j ? (t.soldes[interaction.user.id] || 0) : 0;
      const top = casino.classement ? casino.classement(3) : [];
      const topTxt = top.length ? '\n\n🏆 **Gros joueurs du saloon**\n' + top.map(([u, n], i) => (i + 1) + '. <@' + u + '> — ' + _money(n)).join('\n') : '';
      await interaction.reply({ content: '💰 **Tes sous au saloon : ' + _money(total) + '**' + (j ? '\n*(à cette table : ' + _money(sess) + ')*' : '') + topTxt, flags: eph, allowedMentions: { parse: [] } });
      return true;
    }

    return true; // customId pm_* pris en charge
  } catch (e) {
    console.log('❌ pokermenteur routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de Poker Menteur.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelPokerMenteur,
  _test: { _compterFace, _totalDes, _bidValide, _resoudreDefi, _defi, _lancer, _nouvelleManche, _lancerPartie, _creerTable, _prochainVivant, tables },
};
