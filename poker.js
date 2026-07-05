// ───────────────────────────────────────────────────────────────────────────
//  poker.js — Table de POKER 5-CARD DRAW (poker fermé, classique du saloon).
//   Module 100 % ISOLÉ, tout préfixé pk_.
//   • Un joueur OUVRE la table : il en est l'« hôte ». 2 à 6 joueurs.
//   • Chacun s'assied avec un ANTE (jetons de table) → alimente le POT.
//   • L'hôte DISTRIBUE : 5 cartes PRIVÉES par joueur (pk_peek → image éphémère).
//   • Un tour d'ÉCHANGE : à son tour, chaque joueur défausse 0 à 5 cartes
//     (pk_draw → menu) et pioche autant de remplaçantes.
//   • ABATTAGE (showdown) : la meilleure main rafle le pot. Égalité → partage.
//   • Jeu ENTRE JOUEURS : aucune maison, aucun avantage — équitable par nature.
//   • État EN MÉMOIRE (une table par salon). N'écrit RIEN en base, aucune
//     économie réelle touchée. Compteur de jetons (gains/pertes) par joueur.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
let _img = null; try { _img = require('./poker-image'); } catch { _img = null; }
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }
const _sous = uid => (casino.solde ? casino.solde(uid) : 0);

// ── Émotes RP à coller EN JEU (RedM) : garde la scène vivante pendant qu'on joue sur Discord ──
const _EMOTES_SCENE = [
  '/do Cinq cartes en main, les regards se jaugent autour du tapis.',
  '/do L\'atmosphère feutrée du saloon, entre fumée de cigare et cliquetis des jetons.',
  '/do Le pot grossit au centre de la table, les visages se ferment.',
  '/me réarrange ses cartes contre sa poitrine, visage fermé.',
];
const _EMOTES_LOBBY = [
  '/me tire une chaise et s\'installe à la table de poker, l\'air confiant.',
  '/me pousse son ante au centre du tapis d\'un geste sec.',
  '/me ajuste son chapeau et jauge les autres joueurs du regard.',
  '/me fait tinter quelques jetons entre ses doigts en attendant la donne.',
];
const _EMOTES_TOUR = [
  '/me étudie ses cinq cartes en silence, pesant lesquelles défausser.',
  '/me tapote nerveusement le bord de la table du bout des doigts.',
  '/me glisse deux cartes hors de son jeu, le regard impénétrable.',
  '/me pousse quelques jetons au centre sans un mot.',
];
const _EMOTES_GAGNE = [
  '/me ramasse le pot d\'un large geste, un sourire en coin.',
  '/me abat sa main et empile les jetons raflés d\'un air satisfait.',
];
const _EMOTES_PERDU = [
  '/me repousse ses cartes et grommelle dans sa barbe.',
  '/me jette sa main sur le tapis, dépité, en voyant le jeu du vainqueur.',
];
const _EMOTES_GEN = [
  '/me sirote son verre en surveillant le jeu des autres.',
  '/me croise les bras, cartes serrées contre lui, impassible.',
];
function _emotePerso(t, s) {
  if (!s) return _pick(_EMOTES_SCENE);
  if (t.phase === 'abattage') { const n = s.net || 0; return _pick(s.gagnant || n > 0 ? _EMOTES_GAGNE : n < 0 ? _EMOTES_PERDU : _EMOTES_GEN); }
  if (t.phase === 'echange') { if (t.sieges[t.tourIdx]?.userId === s.userId) return _pick(_EMOTES_TOUR); return _pick(_EMOTES_GEN); }
  if (t.manche > 0 && s.resultat) { const n = s.net || 0; return _pick(n > 0 ? _EMOTES_GAGNE : n < 0 ? _EMOTES_PERDU : _EMOTES_GEN); }
  return _pick(_EMOTES_LOBBY);
}
// ── Règles : « comment jouer », montrées avant de lancer une partie ──
const _REGLES = [
  '📖 **POKER 5-CARD DRAW — COMMENT JOUER**',
  '',
  '**But :** avoir la **meilleure main de 5 cartes** à l\'abattage pour rafler le **pot**.',
  '',
  '**L\'ante :** chacun mise un ante en s\'asseyant — tous les antes forment le **pot**.',
  '**La donne :** l\'hôte distribue **5 cartes privées** à chaque joueur (bouton 👁️ **Voir ma main**).',
  '**L\'échange :** à ton tour, tu **défausses 0 à 5 cartes** (bouton 🔄 **Échanger**) et tu piochies autant de remplaçantes.',
  '**L\'abattage :** on retourne les mains, la meilleure rafle le pot ; **égalité = partage**.',
  '',
  '**Ordre des mains (du plus fort au plus faible) :**',
  '• Quinte flush · Carré · Full · Couleur · Quinte · Brelan · Double paire · Paire · Carte haute.',
  '**Départage :** à catégorie égale, on compare les valeurs (kickers). La roue **A-2-3-4-5** est la plus petite quinte.',
  '',
  '🎭 **Reste en RP :** appuie sur **Emote** à chaque action et colle la ligne **en jeu** — comme ça, personne ne te prend pour un AFK pendant que tu joues ici.',
  '💰 **Sous :** tes gains/pertes sont cumulés dans ton compteur de **sous** du saloon (bouton « Mes sous »).',
];

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const PREFIXE = 'pk_';
const MAX_SIEGES = 6, MIN_JOUEURS = 2;
const MISE_MIN = 1, MISE_MAX = 1000000;
const TOUR_MS = 120000; // 2 min pour échanger, sinon « garde ses 5 cartes » (0 défausse) automatiquement

const RANGS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const COULEURS = ['♠', '♥', '♦', '♣'];

// ─── Cartes ───
function _rval(r) { if (r === 'A') return 14; if (r === 'K') return 13; if (r === 'Q') return 12; if (r === 'J') return 11; return parseInt(r, 10); }
function _fmtCarte(c) { return '`' + c.r + c.s + '`'; }
function _fmtMain(main) { return main.map(_fmtCarte).join(' '); }
function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }

function _construireDeck() { const d = []; for (const c of COULEURS) for (const r of RANGS) d.push({ r, s: c }); for (let i = d.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [d[i], d[j]] = [d[j], d[i]]; } return d; }
function _piocher(t) { if (!t.deck.length) t.deck = _construireDeck(); return t.deck.pop(); }

// ─── ÉVALUATION DE MAIN (cœur du jeu) ───
// Renvoie { cat, tie, nom } où cat = rang de catégorie (8 haut → 0 bas) et
// tie = tableau de valeurs à comparer lexicographiquement (kickers exacts).
const NOMS = ['Carte haute', 'Paire', 'Double paire', 'Brelan', 'Quinte', 'Couleur', 'Full', 'Carré', 'Quinte flush'];
function _evaluer(main) {
  const vals = main.map(c => _rval(c.r)).sort((a, b) => b - a); // décroissant
  const suits = main.map(c => c.s);
  const flush = suits.every(s => s === suits[0]);
  const cnt = {};
  for (const v of vals) cnt[v] = (cnt[v] || 0) + 1;
  // Groupes ordonnés par effectif décroissant puis valeur décroissante.
  const groupes = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a);
  const effectifs = groupes.map(v => cnt[v]);
  // Détection de quinte (suite) + roue A-2-3-4-5.
  const uniq = [...new Set(vals)];
  let quinte = false, quinteHaute = 0;
  if (uniq.length === 5) {
    const mx = Math.max(...uniq), mn = Math.min(...uniq);
    if (mx - mn === 4) { quinte = true; quinteHaute = mx; }
    else if (uniq.includes(14) && uniq.includes(5) && uniq.includes(4) && uniq.includes(3) && uniq.includes(2)) { quinte = true; quinteHaute = 5; } // roue : l'As vaut 1
  }
  let cat, tie;
  if (quinte && flush) { cat = 8; tie = [quinteHaute]; }
  else if (effectifs[0] === 4) { cat = 7; tie = groupes; }                              // carré, kicker
  else if (effectifs[0] === 3 && effectifs[1] === 2) { cat = 6; tie = groupes; }        // full : brelan puis paire
  else if (flush) { cat = 5; tie = vals; }                                              // couleur : 5 kickers
  else if (quinte) { cat = 4; tie = [quinteHaute]; }
  else if (effectifs[0] === 3) { cat = 3; tie = groupes; }                              // brelan + 2 kickers
  else if (effectifs[0] === 2 && effectifs[1] === 2) { cat = 2; tie = groupes; }        // 2 paires (haute, basse) + kicker
  else if (effectifs[0] === 2) { cat = 1; tie = groupes; }                              // paire + 3 kickers
  else { cat = 0; tie = vals; }                                                         // carte haute
  return { cat, tie, nom: NOMS[cat] };
}
// Compare deux évaluations : >0 si a gagne, <0 si b gagne, 0 si parfaite égalité.
function _compare(a, b) {
  if (a.cat !== b.cat) return a.cat - b.cat;
  const n = Math.max(a.tie.length, b.tie.length);
  for (let i = 0; i < n; i++) { const x = a.tie[i] || 0, y = b.tie[i] || 0; if (x !== y) return x - y; }
  return 0;
}

// ─── Ambiance ───
const _phrasesDeal = ['« Cartes en main, messieurs. Que le meilleur bluff gagne. »', '« Cinq cartes chacun. Regardez, mais ne montrez rien. »', '« Le saloon retient son souffle… »', '« Faites parler vos cartes, pas votre visage. »'];
const _phrasesShow = ['On abat les cartes.', 'Le moment de vérité — cartes sur table.', 'On retourne les mains.'];
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ─── État des tables (en mémoire, une par salon) ───
const tables = new Map(); // channelId -> table

function _creerTable(interaction) {
  return {
    channelId: interaction.channelId,
    guildId: interaction.guild?.id,
    hoteId: interaction.user.id,
    hoteNom: interaction.member?.displayName || interaction.user.username,
    phase: 'lobby',        // 'lobby' | 'echange' | 'abattage'
    sieges: [],            // { userId, nom, mise(ante), main[], drew, statut, resultat, net }
    deck: _construireDeck(),
    tourIdx: -1,
    pot: 0,
    soldes: {},            // userId -> jetons cumulés
    manche: 0,
    msg: null,
    timer: null,
    ambiance: '',
  };
}

function _siege(t, uid) { return t.sieges.find(s => s.userId === uid); }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }

// ─── Rendu texte (repli si l'image ne se génère pas) ───
function _lignesCartes(t) {
  const L = [];
  if (!t.sieges.length) { L.push('*Aucun joueur assis. Cliquez sur* **🪑 S\'asseoir** *pour rejoindre la table.*'); return L; }
  t.sieges.forEach((s, i) => {
    let etat = '';
    if (t.phase === 'echange') { if (s.drew) etat = '· a échangé'; else if (i === t.tourIdx) etat = '· **à lui d\'échanger**'; else etat = '· ⏳'; }
    else if (t.phase === 'abattage') etat = s.resultat || (s.eval ? '· ' + s.eval.nom : '');
    const cartes = t.phase === 'abattage' ? '  ' + _fmtMain(s.main) : (t.phase === 'echange' ? '  🂠 🂠 🂠 🂠 🂠' : '');
    L.push('🪑 **' + s.nom + '** — ante ' + _money(s.mise) + cartes + (etat ? '  ' + etat : ''));
  });
  return L;
}
function _lignesStatut(t) {
  const L = [];
  if (t.phase === 'echange') {
    const s = t.sieges[t.tourIdx];
    L.push('➡️ **À ' + (s ? s.nom : '—') + ' d\'échanger** — 👁️ Voir ma main · 🔄 Échanger mes cartes (0 à 5)');
  } else if (t.phase === 'abattage') {
    L.push('🏆 **Abattage !** ' + (t.ambiance || ''));
  } else if (t.manche > 0) {
    L.push('🔚 **Main terminée.** L\'hôte peut **relancer une main** ou **fermer la table**.');
    if (t.ambiance) L.push('💬 *' + t.ambiance + '*');
  } else {
    L.push('💬 *' + (t.ambiance || _pick(_phrasesDeal)) + '*');
    L.push('👉 **S\'asseoir** (régler son ante), puis l\'**hôte distribue** (2 à 6 joueurs).');
    L.push('📖 *Nouveau ? Clique **Comment jouer** avant de lancer.*  🎭 *Pense à **Emote RP** pour rester crédible en jeu.*');
  }
  L.push('💵 **Pot : ' + _money(t.pot) + '**');
  const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => { const s = t.sieges.find(x => x.userId === u); return '• ' + (s ? s.nom : 'Parti') + ' : ' + _money(n); });
  if (sold.length) L.push('💰 **Jetons de la soirée**\n' + sold.join('\n'));
  return L;
}
function _imgState(t) {
  return {
    sousTitre: t.phase === 'echange'
      ? ('À ' + (t.sieges[t.tourIdx]?.nom || '—') + ' d\'échanger — 0 à 5 cartes')
      : t.phase === 'abattage' ? 'Abattage — la meilleure main rafle le pot'
        : (t.manche > 0 ? 'Main terminée — l\'hôte peut relancer ou fermer' : 'Asseyez-vous et misez votre ante, puis l\'hôte distribue'),
    pot: _money(t.pot),
    joueurs: t.sieges.map((s, i) => {
      let badge = '';
      if (t.phase === 'echange') badge = s.drew ? 'a échangé' : (i === t.tourIdx ? 'à lui d\'échanger' : 'en attente');
      else if (t.phase === 'abattage') badge = (s.eval ? s.eval.nom : '') + (s.resultat ? ' — ' + s.resultat : '');
      return {
        nom: s.nom, ante: _money(s.mise),
        cards: (s.main || []).map(c => ({ r: c.r, s: c.s })),
        reveal: t.phase === 'abattage',
        actif: t.phase === 'echange' && i === t.tourIdx,
        gagnant: t.phase === 'abattage' && s.gagnant,
        badge,
      };
    }),
  };
}
// Rangée commune : Comment jouer / Emote RP / Mes sous (présente sur toutes les phases).
function _rowExtras() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pk_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pk_emote').setLabel('Emote RP').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('pk_sous').setLabel('Mes sous').setEmoji('💰').setStyle(ButtonStyle.Secondary),
  );
}
function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pk_sit').setLabel('S\'asseoir').setEmoji('🪑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('pk_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pk_deal').setLabel(t.manche > 0 ? 'Relancer une main' : 'Distribuer').setEmoji('🎴').setStyle(ButtonStyle.Primary).setDisabled(t.sieges.length < MIN_JOUEURS),
      new ButtonBuilder().setCustomId('pk_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else if (t.phase === 'echange') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pk_peek').setLabel('Voir ma main').setEmoji('👁️').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('pk_draw').setLabel('Échanger mes cartes').setEmoji('🔄').setStyle(ButtonStyle.Primary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pk_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else { // abattage
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('pk_deal').setLabel('Relancer une main').setEmoji('🎴').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('pk_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  }
  rows.push(_rowExtras());
  return rows;
}
async function _screen(t) {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🃏  TABLE DE POKER — 5-CARD DRAW  🎴')
    .setFooter({ text: 'Hôte : ' + t.hoteNom + '  ·  Ante → pot  ·  Meilleure main rafle le pot  ·  Entre joueurs, sans maison' });
  let buf = null;
  try { if (_img?.genererTable) buf = await _img.genererTable(_imgState(t)); } catch { buf = null; }
  if (buf) {
    e.setImage('attachment://poker.png');
    e.setDescription(_lignesStatut(t).join('\n').slice(0, 4000));
    return { embeds: [e], components: _components(t), files: [new AttachmentBuilder(buf, { name: 'poker.png' })] };
  }
  e.setDescription(_lignesCartes(t).concat(['─────────────────────────────']).concat(_lignesStatut(t)).join('\n').slice(0, 4000));
  return { embeds: [e], components: _components(t), files: [] };
}
async function _refresh(t) { try { if (t.msg) { const p = await _screen(t); await t.msg.edit({ ...p, attachments: [] }); } } catch (e) { console.log('⚠️ pk refresh:', e.message); } }

// ─── Déroulé d'une main ───
function _armer(t) {
  _clearTimer(t);
  const s = t.sieges[t.tourIdx];
  if (!s) return;
  t.timer = setTimeout(async () => {
    try {
      if (t.phase !== 'echange') return;
      const cur = t.sieges[t.tourIdx];
      if (!cur || cur.drew) return;
      cur.drew = true; // auto-action sûre : le joueur GARDE ses 5 cartes (0 défausse)
      t.ambiance = cur.nom + ' a trop tardé — il garde ses cartes.';
      _avancer(t);
      await _refresh(t);
    } catch (e) { console.log('⚠️ pk timer:', e.message); }
  }, TOUR_MS);
}

function _avancer(t) {
  let n = t.tourIdx + 1;
  while (n < t.sieges.length && t.sieges[n].drew) n++;
  if (n < t.sieges.length) { t.tourIdx = n; _armer(t); return; }
  _clearTimer(t);
  _showdown(t);
}

// Applique l'échange : défausse les indices choisis, pioche autant de cartes.
function _echanger(t, s, indices) {
  const set = [...new Set(indices)].filter(i => Number.isInteger(i) && i >= 0 && i < s.main.length);
  const garde = s.main.filter((_, i) => !set.includes(i));
  const nb = s.main.length - garde.length;
  const neuves = [];
  for (let k = 0; k < nb; k++) neuves.push(_piocher(t));
  s.main = garde.concat(neuves);
  s.drew = true;
  s.nbEchange = nb;
  return nb;
}

// Abattage : évalue toutes les mains, attribue le pot à la (aux) meilleure(s).
function _showdown(t) {
  t.phase = 'abattage';
  for (const s of t.sieges) s.eval = _evaluer(s.main);
  // Meilleure évaluation
  let best = null;
  for (const s of t.sieges) { if (!best || _compare(s.eval, best) > 0) best = s.eval; }
  const gagnants = t.sieges.filter(s => _compare(s.eval, best) === 0);
  // Partage du pot (le reste éventuel va au premier gagnant, table sans maison).
  const part = Math.floor(t.pot / gagnants.length);
  const reste = t.pot - part * gagnants.length;
  for (const s of t.sieges) {
    const gagne = gagnants.includes(s);
    s.gagnant = gagne;
    let recu = 0;
    if (gagne) { recu = part + (s === gagnants[0] ? reste : 0); }
    s.net = recu - s.mise; // mise = ante déjà versé au pot
    s.resultat = gagne
      ? (gagnants.length > 1 ? '🤝 Partage du pot +' + _money(recu) : '🏆 Rafle le pot +' + _money(recu))
      : '❌ Perdu';
    t.soldes[s.userId] = (t.soldes[s.userId] || 0) + s.net;
  }
  // Compteur de « sous » PERSISTANT du saloon (une seule écriture pour toute la table).
  try { if (casino.crediterLot) casino.crediterLot(t.sieges.map(s => ({ userId: s.userId, montant: s.net || 0 }))); } catch {}
  t.ambiance = _pick(_phrasesShow) + (gagnants.length > 1 ? ' Pot partagé (' + gagnants[0].eval.nom + ').' : ' ' + gagnants[0].nom + ' l\'emporte avec : ' + gagnants[0].eval.nom + '.');
}

function _distribuer(t) {
  if (t.sieges.length < MIN_JOUEURS) return false;
  t.manche++;
  t.deck = _construireDeck();
  t.pot = 0;
  for (const s of t.sieges) {
    s.main = []; s.drew = false; s.statut = 'jeu'; s.resultat = ''; s.net = 0; s.eval = null; s.gagnant = false; s.nbEchange = 0;
    t.pot += s.mise; // chaque ante alimente le pot
  }
  for (let k = 0; k < 5; k++) for (const s of t.sieges) s.main.push(_piocher(t));
  t.phase = 'echange';
  t.tourIdx = -1;
  t.ambiance = _pick(_phrasesDeal);
  _avancer(t); // place sur le 1er joueur
  return true;
}

// ─── Panneau d'ouverture ───
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎰 SALOON — TABLE DE POKER')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   POKER · 5-CARD DRAW         ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Approchez, tirez une chaise. Cinq cartes, un tour d\'échange, et l\'on abat les mains — le meilleur jeu rafle le pot.*',
      '',
      '🃏 **5-Card Draw** — chacun mise un **ante** (jetons de table), reçoit 5 cartes, échange 0 à 5 cartes, puis on compare. Jeu **entre joueurs**, sans maison.',
      '',
      '👉 **Ouvrir une table** ci-dessous : vous en devenez l\'**hôte**. Les autres s\'asseyent avec leur ante, et la partie commence.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('pk_open').setLabel('Ouvrir une table de Poker').setEmoji('🃏').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}

async function installerPanelPoker(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('TABLE DE POKER');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ pk panel:', e.message); return null; }
}

// Envoie la main privée du joueur (image éphémère, repli texte).
async function _envoyerMain(interaction, t, s) {
  const eph = MessageFlags.Ephemeral;
  const ev = _evaluer(s.main);
  let buf = null;
  try { if (_img?.genererMain) buf = await _img.genererMain({ nom: s.nom, cards: s.main.map(c => ({ r: c.r, s: c.s })), evalNom: ev.nom, sousTitre: t.phase === 'echange' ? 'Choisissez 0 à 5 cartes à échanger' : 'Vos cartes' }); } catch { buf = null; }
  if (buf) { await interaction.reply({ content: '👁️ **Votre main** — ' + ev.nom, files: [new AttachmentBuilder(buf, { name: 'main.png' })], flags: eph }).catch(() => {}); }
  else { await interaction.reply({ content: '👁️ **Votre main** : ' + _fmtMain(s.main) + '\n➡️ ' + ev.nom, flags: eph }).catch(() => {}); }
}

// ─── Routeur d'interactions ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table (depuis le panneau)
    if (interaction.isButton() && id === 'pk_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) { await interaction.reply({ content: '🃏 Une table est déjà ouverte dans ce salon. Rejoins-la un peu plus haut !', flags: eph }); return true; }
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(await _screen(t)).catch(() => null);
      if (!msg) { await interaction.reply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).', flags: eph }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.reply({ content: '🃏 Table ouverte — tu en es l\'**hôte**. Assieds-toi 👇 puis clique **Distribuer** quand au moins 2 joueurs ont misé.', flags: eph });
      return true;
    }

    // À partir d'ici il faut une table active dans ce salon
    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🃏.', flags: eph }).catch(() => {}); } return true; }

    // S'asseoir → modal d'ante
    if (interaction.isButton() && id === 'pk_sit') {
      if (t.phase !== 'lobby') { await interaction.reply({ content: '⏳ Une main est en cours — assieds-toi à la fin de celle-ci.', flags: eph }); return true; }
      if (_siege(t, interaction.user.id)) { await interaction.reply({ content: 'Tu es déjà assis. Tu peux ajuster ton ante en te rasseyant.', flags: eph }); return true; }
      if (t.sieges.length >= MAX_SIEGES) { await interaction.reply({ content: '🈵 La table est complète (' + MAX_SIEGES + ' joueurs).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('pk_sit_modal').setTitle('🪑 S\'asseoir à la table')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ante').setLabel('Votre ante (en $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setPlaceholder('Ex : 50')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'pk_sit_modal') {
      if (t.phase !== 'lobby') { await interaction.reply({ content: '⏳ Main en cours, patiente.', flags: eph }); return true; }
      let ante = parseInt((interaction.fields.getTextInputValue('ante') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(ante) || ante < MISE_MIN) ante = MISE_MIN;
      if (ante > MISE_MAX) ante = MISE_MAX;
      let s = _siege(t, interaction.user.id);
      if (s) { s.mise = ante; }
      else {
        if (t.sieges.length >= MAX_SIEGES) { await interaction.reply({ content: '🈵 Table complète.', flags: eph }); return true; }
        s = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, mise: ante, main: [], drew: false, statut: 'attente', resultat: '', net: 0 };
        t.sieges.push(s);
      }
      await interaction.reply({ content: '✅ Tu es assis, ante réglé à **' + _money(ante) + '**. Bonne chance !', flags: eph });
      await _refresh(t); return true;
    }

    // Se lever
    if (interaction.isButton() && id === 'pk_leave') {
      if (t.phase !== 'lobby' && _siege(t, interaction.user.id)) { await interaction.reply({ content: '⏳ Tu ne peux pas quitter en pleine main — finis le coup.', flags: eph }); return true; }
      const idx = t.sieges.findIndex(s => s.userId === interaction.user.id);
      if (idx < 0) { await interaction.reply({ content: 'Tu n\'es pas assis à cette table.', flags: eph }); return true; }
      const solde = t.soldes[t.sieges[idx].userId] || 0;
      t.sieges.splice(idx, 1);
      await interaction.reply({ content: '🚪 Tu quittes la table. Bilan de la soirée : **' + _money(solde) + '** de jetons.', flags: eph });
      await _refresh(t); return true;
    }

    // Distribuer / Relancer (hôte)
    if (interaction.isButton() && id === 'pk_deal') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut distribuer.', flags: eph }); return true; }
      if (t.phase === 'echange') { await interaction.reply({ content: 'Une main est déjà en cours.', flags: eph }); return true; }
      if (t.sieges.length < MIN_JOUEURS) { await interaction.reply({ content: 'Il faut au moins ' + MIN_JOUEURS + ' joueurs assis pour distribuer.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _distribuer(t);
      await _refresh(t); return true;
    }

    // Voir sa main (éphémère) — tout joueur assis, pendant échange/abattage
    if (interaction.isButton() && id === 'pk_peek') {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: 'Tu n\'es pas assis à cette table.', flags: eph }); return true; }
      if (!s.main.length) { await interaction.reply({ content: 'Aucune carte en main — attends la distribution.', flags: eph }); return true; }
      await _envoyerMain(interaction, t, s); return true;
    }

    // Échanger ses cartes → menu de sélection (éphémère)
    if (interaction.isButton() && id === 'pk_draw') {
      if (t.phase !== 'echange') { await interaction.reply({ content: 'Ce n\'est pas la phase d\'échange.', flags: eph }); return true; }
      const s = t.sieges[t.tourIdx];
      if (!s) { await interaction.reply({ content: 'Aucun joueur à jouer.', flags: eph }); return true; }
      if (s.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + s.nom + '** d\'échanger.', flags: eph }); return true; }
      if (s.drew) { await interaction.reply({ content: 'Tu as déjà échangé pour cette main.', flags: eph }); return true; }
      const menu = new StringSelectMenuBuilder().setCustomId('pk_draw_select').setPlaceholder('Cartes à défausser (aucune = garder tout)').setMinValues(0).setMaxValues(5)
        .addOptions(s.main.map((c, i) => ({ label: c.r + ' ' + c.s, description: 'Défausser cette carte', value: String(i) })));
      await interaction.reply({ content: '🔄 **Ta main** : ' + _fmtMain(s.main) + '\nChoisis 0 à 5 cartes à défausser, puis valide.', components: [new ActionRowBuilder().addComponents(menu)], flags: eph });
      return true;
    }
    if (interaction.isStringSelectMenu() && id === 'pk_draw_select') {
      if (t.phase !== 'echange') { await interaction.update({ content: 'La phase d\'échange est terminée.', components: [] }).catch(() => {}); return true; }
      const s = t.sieges[t.tourIdx];
      if (!s || s.userId !== interaction.user.id) { await interaction.update({ content: '⏳ Ce n\'est plus ton tour.', components: [] }).catch(() => {}); return true; }
      if (s.drew) { await interaction.update({ content: 'Tu as déjà échangé.', components: [] }).catch(() => {}); return true; }
      const indices = (interaction.values || []).map(v => parseInt(v, 10));
      const nb = _echanger(t, s, indices);
      const ev = _evaluer(s.main);
      t.ambiance = s.nom + (nb ? ' échange ' + nb + ' carte' + (nb > 1 ? 's' : '') + '.' : ' garde ses cartes.');
      await interaction.update({ content: '✅ Tu as échangé **' + nb + '** carte' + (nb === 1 ? '' : 's') + '.\n👁️ Ta nouvelle main : ' + _fmtMain(s.main) + '\n➡️ ' + ev.nom, components: [] }).catch(() => {});
      _avancer(t);
      await _refresh(t); return true;
    }

    // Fermer la table (hôte)
    if (interaction.isButton() && id === 'pk_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      const bilan = t.sieges.length || Object.keys(t.soldes).length
        ? Object.entries(t.soldes).map(([uid, n]) => '• <@' + uid + '> : ' + _money(n)).join('\n')
        : '';
      const e = new EmbedBuilder().setColor(0x8a6d3b).setTitle('🃏 Table fermée')
        .setDescription('Le croupier ramasse les cartes. Merci d\'avoir joué au saloon.' + (bilan ? '\n\n**Bilan des jetons :**\n' + bilan : ''))
        .setFooter({ text: 'Iron Wolf Company · Saloon' });
      try { await t.msg?.edit({ embeds: [e], components: [], files: [], attachments: [] }); } catch {}
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    // Comment jouer (règles, avant de lancer)
    if (interaction.isButton() && id === 'pk_regles') {
      await interaction.reply({ content: _REGLES.join('\n'), flags: eph });
      return true;
    }
    // Emote RP à coller en jeu (anti-AFK)
    if (interaction.isButton() && id === 'pk_emote') {
      const s = _siege(t, interaction.user.id);
      const lignes = _emotePerso(t, s) + '\n' + _pick(_EMOTES_SCENE);
      await interaction.reply({ content: '🎭 **Reste dans la scène !** Colle une de ces lignes **en jeu** (RedM) pour ne pas passer pour AFK :\n```\n' + lignes + '\n```\n*Astuce : garde le jeu en fenêtre, alterne vite, et remets une émote à chaque action.*', flags: eph });
      return true;
    }
    // Compteur de sous du saloon (persistant)
    if (interaction.isButton() && id === 'pk_sous') {
      const total = _sous(interaction.user.id);
      const s = _siege(t, interaction.user.id);
      const sess = s ? (t.soldes[interaction.user.id] || 0) : 0;
      const top = casino.classement ? casino.classement(3) : [];
      const topTxt = top.length ? '\n\n🏆 **Gros joueurs du saloon**\n' + top.map(([u, n], i) => (i + 1) + '. <@' + u + '> — ' + _money(n)).join('\n') : '';
      await interaction.reply({ content: '💰 **Tes sous au saloon : ' + _money(total) + '**' + (s ? '\n*(à cette table : ' + _money(sess) + ')*' : '') + topTxt, flags: eph, allowedMentions: { parse: [] } });
      return true;
    }

    return true; // customId pk_* pris en charge
  } catch (e) {
    console.log('❌ poker routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de poker.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerPanelPoker, _test: { _evaluer, _compare, _rval, _construireDeck, _echanger, _distribuer, _showdown, _creerTable, tables, NOMS } };
