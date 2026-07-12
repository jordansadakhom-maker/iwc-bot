// ───────────────────────────────────────────────────────────────────────────
//  blackjack.js — Table de BLACKJACK immersive (saloon RP). Module 100 % isolé.
//   • Le BOT est le croupier : cartes équitables (sabot 6 jeux), tire jusqu'à 17,
//     blackjack payé 3:2. Un joueur OUVRE la table (il en est l'« hôte »).
//   • Les joueurs S'ASSEYENT avec une mise, puis jouent chacun leur tour
//     (Tirer / Rester / Doubler). Compteur de jetons (gains/pertes) par table.
//   • Tout est préfixé bj_ — n'écrit RIEN en base, aucune économie touchée.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
let _img = null; try { _img = require('./blackjack-image'); } catch { _img = null; }
let _ambiance = {}; try { _ambiance = require('./ambiance-ia'); } catch { _ambiance = {}; }
let _notif = {}; try { _notif = require('./table-notif'); } catch { _notif = {}; }
let _voix = {}; try { _voix = require('./casino-voix'); } catch { _voix = {}; }
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }
const _sous = uid => (casino.solde ? casino.solde(uid) : 0);

// ── Émotes RP à coller EN JEU (RedM) : garde la scène vivante pendant qu'on joue sur Discord ──
const _EMOTES_SCENE = [
  '/do Une partie de blackjack bat son plein : cartes qui claquent, jetons empilés, regards tendus.',
  '/do L\'atmosphère feutrée du saloon, entre fumée de cigare et cliquetis des mises.',
  '/do Autour du tapis vert, la tension monte à chaque carte retournée.',
  '/me distribue un regard circulaire à la table avant de reporter les yeux sur ses cartes.',
];
const _EMOTES_LOBBY = [
  '/me tire une chaise et s\'installe à la table de blackjack, l\'air confiant.',
  '/me fait tinter quelques pièces entre ses doigts en fixant le tapis vert.',
  '/me ajuste son chapeau et jauge les autres joueurs du regard.',
  '/me pose sa mise sur le tapis et attend la donne.',
];
const _EMOTES_TOUR = [
  '/me observe ses cartes en silence, pesant sa décision.',
  '/me tapote nerveusement le bord de la table du bout des doigts.',
  '/me plisse les yeux, hésitant entre tirer et rester.',
];
const _EMOTES_GAGNE = [
  '/me ramasse ses gains avec un sourire en coin.',
  '/me empile ses jetons d\'un geste satisfait.',
];
const _EMOTES_PERDU = [
  '/me repousse ses cartes et grommelle dans sa barbe.',
  '/me lâche un juron étouffé en voyant la main du croupier.',
];
const _EMOTES_GEN = [
  '/me sirote son verre en surveillant le jeu des autres.',
  '/me croise les bras, cartes en main, impassible.',
];
function _emotePerso(t, s) {
  if (!s) return _pick(_EMOTES_SCENE);
  if (t.phase === 'lobby') { if (s.resultat) { const n = s.net || 0; return _pick(n > 0 ? _EMOTES_GAGNE : n < 0 ? _EMOTES_PERDU : _EMOTES_GEN); } return _pick(_EMOTES_LOBBY); }
  if (t.sieges[t.tourIdx]?.userId === s.userId) return _pick(_EMOTES_TOUR);
  if (s.statut === 'bust') return _pick(_EMOTES_PERDU);
  return _pick(_EMOTES_GEN);
}
// ── Règles : « comment jouer », montrées avant de lancer une partie ──
const _REGLES = [
  '📖 **BLACKJACK — COMMENT JOUER**',
  '',
  '**But :** battre le croupier en approchant **21** sans le dépasser.',
  '',
  '**💰 Capital & mise :** tu t\'assieds avec un **capital de départ** (ta cave). À chaque manche tu poses une **mise** : la gagner l\'ajoute à ton capital, la perdre la retire. Quand ton capital tombe à **0 $**, tu ne peux plus jouer — clique **💰 Recaver** pour recharger. *(Mise max 100 $ par manche.)*',
  '',
  '**Valeurs :** figures (V/D/R) = 10 · As = 1 **ou** 11 · les autres = leur chiffre.',
  '**La donne :** chacun mise et reçoit 2 cartes visibles ; le croupier en a 2, dont **une cachée**.',
  '**À ton tour :**',
  '• 🃏 **Tirer** — une carte de plus.',
  '• ✋ **Rester** — tu gardes ta main et passes la main.',
  '• ⏫ **Doubler** — sur tes **2 premières cartes** : tu doubles ta mise et ne reçois **qu\'une** carte de plus.',
  '• 🔀 **Séparer** — si tes 2 cartes sont de **même rang**, sépare-les en **deux mains** (mise égale sur chacune), jouées l\'une après l\'autre. *Deux As séparés reçoivent **une seule carte** chacun. Jusqu\'à 4 mains.*',
  '• 🛡️ **Assurance** — *si le croupier montre un As* : mise annexe (moitié de ta mise) qui paie **2:1** s\'il a un blackjack. Sinon, tu la perds. À toi de juger le risque.',
  '**Brûlé :** dépasser 21 = perdu direct.',
  '**Le croupier** joue en dernier : il **tire jusqu\'à 17** (parfois aussi sur le **17 souple**, selon la table).',
  '🎲 **Difficulté variable :** chaque table est tirée au sort — 🟢 **clémente** · 🟡 **équilibrée** · 🟠 **serrée** · 🔴 **maison**. Le **paiement du blackjack** (3:2 ou 6:5), la **règle du 17 souple** et l\'**égalité à 22** en dépendent. La difficulté est **affichée sur la table** : regarde-la avant de miser.',
  '**Tu gagnes** si tu es plus proche de 21 que le croupier (ou s\'il brûle). Un **Blackjack** (21 en 2 cartes) est payé **3:2 ou 6:5** selon la table.',
  '💵 **Mise maximale : 100 $.**',
  '',
  '🎭 **Reste en RP :** appuie sur **Emote** à chaque action et colle la ligne **en jeu** — comme ça, personne ne te prend pour un AFK pendant que tu joues ici.',
  '💰 **Sous :** tes gains/pertes sont cumulés dans ton compteur de **sous** du saloon (bouton « Mes sous »).',
];

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const MAX_SIEGES = 5;
const MISE_MIN = 1, MISE_MAX = 100; // plafond de mise PAR MANCHE volontairement bas (100)
const CAVE_MIN = 10, CAVE_DEF = 500, CAVE_MAX = 2000; // capital de départ (bankroll) posé en s'asseyant
const TOUR_MS = 120000; // 2 min pour jouer, sinon « Rester » auto

// Capital (bankroll) courant d'un joueur — porté par son siège principal (pas les mains séparées).
function _stackDe(t, s) { const p = t.sieges.find(x => x.userId === s.userId && !x.isSplitHand); return ((p ? p.stack : s.stack) || 0); }

const RANGS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const COULEURS = ['♠', '♥', '♦', '♣'];
const DOS = '🂠';

// ─── Cartes / totaux ───
function _val(r) { if (r === 'A') return 11; if (r === 'J' || r === 'Q' || r === 'K') return 10; return parseInt(r, 10); }
function _total(main) { let t = 0, as = 0; for (const c of main) { t += _val(c.r); if (c.r === 'A') as++; } while (t > 21 && as > 0) { t -= 10; as--; } return t; }
function _estBJ(main) { return main.length === 2 && _total(main) === 21; }
// Vrai si la main vaut 17 avec un As encore compté 11 (« 17 souple »).
function _estSoft17(main) {
  if (_total(main) !== 17) return false;
  let raw = 0, as = 0; for (const c of main) { raw += _val(c.r); if (c.r === 'A') as++; }
  const reduits = Math.round((raw - 17) / 10); // nb d'As ramenés à 1 pour ne pas dépasser
  return as - reduits > 0;                     // il reste au moins un As compté 11
}
// ─── Difficulté (réglages de repli) ─────────────────────────────────────
const CROUPIER_H17 = true;  // repli : le croupier TIRE sur le 17 souple
const BJ_PAIEMENT  = 1.2;   // repli : blackjack payé 6:5
const PUSH_22      = true;  // repli : croupier brûlé à EXACTEMENT 22 → égalité
// ─── Difficulté VARIABLE : chaque table tire un profil au sort ───────────
//   parfois clémente, souvent honnête, parfois rude, rarement impitoyable.
const DIFFICULTES = [
  { key: 'clemente',   emoji: '🟢', label: 'Table clémente',     bjPay: 1.5, h17: false, push22: false, poids: 26, desc: 'Blackjack payé **3:2**, le croupier **reste sur 17**. Les vents te sont favorables.' },
  { key: 'equilibree', emoji: '🟡', label: 'Table équilibrée',   bjPay: 1.5, h17: true,  push22: false, poids: 34, desc: 'Blackjack payé **3:2**, le croupier **tire sur le 17 souple**. Une partie honnête.' },
  { key: 'serree',     emoji: '🟠', label: 'Table serrée',       bjPay: 1.2, h17: true,  push22: false, poids: 26, desc: 'Blackjack payé **6:5**, le croupier **tire sur le 17 souple**. La maison serre la vis.' },
  { key: 'maison',     emoji: '🔴', label: 'Table de la maison', bjPay: 1.2, h17: true,  push22: true,  poids: 14, desc: 'Blackjack payé **6:5**, **H17**, et **croupier brûlé à 22 = égalité**. Impitoyable.' },
];
function _rollDifficulte() {
  const total = DIFFICULTES.reduce((n, d) => n + d.poids, 0);
  let r = Math.random() * total;
  for (const d of DIFFICULTES) { r -= d.poids; if (r < 0) return d; }
  return DIFFICULTES[1];
}
function _reglesTxt(d) { return `BJ ${d.bjPay === 1.5 ? '3:2' : '6:5'} · ${d.h17 ? 'H17' : 'S17'}${d.push22 ? ' · 22=égalité' : ''}`; }
// Double autorisé sur les 2 premières cartes (règle standard / Washington Post).
function _doublable(main) { return Array.isArray(main) && main.length === 2; }
// Séparer (split) : 2 cartes de MÊME RANG, main initiale, dans la limite de 4 mains par joueur.
function _splittable(t, s) {
  if (!s || !Array.isArray(s.main) || s.main.length !== 2) return false;
  if (s.main[0].r !== s.main[1].r) return false;
  if (s.aceSplitLock) return false;
  const nbMains = t.sieges.filter(x => x.userId === s.userId).length;
  return nbMains < 4;
}
// Sépare la main du siège `idx` en deux : la 2ᵉ carte part dans une nouvelle main
// (pseudo-siège inséré juste après), chacune reçoit une carte. Deux As → 1 carte
// chacun puis on reste (règle standard).
function _split(t, idx) {
  const s = t.sieges[idx];
  const estAs = s.main[0].r === 'A';
  const c2 = s.main.pop();
  const nouveau = { userId: s.userId, nom: s.nom, mise: s.mise, main: [c2], statut: 'jeu', resultat: '', net: 0, assurance: 0, isSplitHand: true };
  s.main.push(_piocher(t));
  nouveau.main.push(_piocher(t));
  t.sieges.splice(idx + 1, 0, nouveau);
  if (estAs) {
    s.statut = 'stand'; s.aceSplitLock = true;
    nouveau.statut = 'stand'; nouveau.aceSplitLock = true;
    _avancer(t);
  } else if (_total(s.main) === 21) {
    s.statut = 'stand'; _avancer(t);
  } else { _armer(t); }
}
// ────────────────────────────────────────────────────────────────────────
function _fmtCarte(c) { return '`' + c.r + c.s + '`'; }
function _fmtMain(main) { return main.map(_fmtCarte).join(' '); }
function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }

function _construireSabot(nJeux) { const s = []; for (let d = 0; d < nJeux; d++) for (const c of COULEURS) for (const r of RANGS) s.push({ r, s: c }); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; }
function _piocher(t) { if (t.sabot.length < 15) { t.sabot = _construireSabot(6); t.reshuffle = true; } return t.sabot.pop(); }

// ─── Ambiance croupier ───
const _phrasesDeal = ['« Faites vos jeux, messieurs-dames. »', '« Les cartes parlent, pas les hommes. »', '« Que la chance soit avec vous ce soir. »', '« On distribue. Regardez bien. »'];
const _phrasesTire = ['Le croupier tire…', 'La maison complète sa main…', 'Le croupier retourne son jeu…'];
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ─── État des tables (en mémoire, une par salon) ───
const tables = new Map(); // channelId -> table

function _creerTable(interaction) {
  return {
    channelId: interaction.channelId,
    guildId: interaction.guild?.id,
    hoteId: interaction.user.id,
    hoteNom: interaction.member?.displayName || interaction.user.username,
    phase: 'lobby',            // 'lobby' | 'jeu'
    sieges: [],                // { userId, nom, mise, main, statut, resultat, net }
    croupier: { main: [] },
    sabot: _construireSabot(6),
    tourIdx: -1,
    soldes: {},                // userId -> jetons cumulés (gains/pertes)
    manche: 0,
    msg: null,
    timer: null,
    ambiance: '',
    reshuffle: false,
    diff: _rollDifficulte(),     // difficulté tirée au sort pour toute la durée de la table
  };
}

function _siege(t, uid) { return t.sieges.find(s => s.userId === uid); }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }

// ─── Rendu du plateau ───
// Lignes « cartes » en texte (repli si l'image ne se génère pas).
function _lignesCartes(t) {
  const L = [];
  if (t.phase === 'jeu') {
    const up = t.croupier.main[0];
    L.push('🎩 **Croupier** — ' + (up ? _fmtCarte(up) + '  ' + DOS : '—') + '   *(carte cachée)*');
  } else if (t.croupier.main.length) {
    const dt = _total(t.croupier.main);
    L.push('🎩 **Croupier** — ' + _fmtMain(t.croupier.main) + '   **= ' + dt + '**' + (dt > 21 ? '  · brûlé' : (_estBJ(t.croupier.main) ? '  · blackjack' : '')));
  } else L.push('🎩 **Croupier** — *prêt à distribuer.*');
  L.push('─────────────────────────────');
  if (!t.sieges.length) L.push('*Aucun joueur assis. Cliquez sur* **🪑 S\'asseoir** *pour rejoindre la table.*');
  else t.sieges.forEach((s, i) => {
    const tot = s.main.length ? _total(s.main) : null;
    let st = '';
    if (t.phase === 'jeu') { if (s.statut === 'sec') st = '· 💤 à sec'; else if (s.statut === 'bust') st = '· brûlé'; else if (s.statut === 'blackjack') st = '· BLACKJACK'; else if (s.statut === 'stand') st = '· reste'; else if (i === t.tourIdx) st = '· **à lui de jouer**'; else st = '· ⏳'; }
    else if (s.resultat) st = s.resultat;
    const mains = s.main.length ? '  ' + _fmtMain(s.main) + (tot != null ? '  **= ' + tot + '**' : '') : '';
    const chaise = s.isSplitHand ? '↳' : '🪑';
    const nomAff = s.nom + (s.isSplitHand ? ' *(main séparée)*' : '');
    // capital (bankroll) affiché sur le siège principal ; les mains séparées n'en montrent pas
    const cap = s.isSplitHand ? '' : ((s.stack ?? 0) <= 0 ? '💰 **0 $ (à sec)** · ' : '💰 ' + _money(s.stack ?? 0) + ' · ');
    L.push(chaise + ' **' + nomAff + '** — ' + cap + 'mise ' + _money(s.mise) + mains + (st ? '  ' + st : ''));
  });
  return L;
}
// Lignes « état » (invite / tour / soldes) — toujours affichées.
function _lignesStatut(t) {
  const L = [];
  if (t.phase === 'jeu') {
    const s = t.sieges[t.tourIdx];
    L.push('➡️ **À ' + (s ? s.nom : '—') + ' de jouer** — 🃏 Tirer · ✋ Rester' + (s && _doublable(s.main) ? ' · ⏫ Doubler' : '') + (s && _splittable(t, s) ? ' · 🔀 Séparer' : ''));
    if (t.ambiance) L.push('💬 *' + t.ambiance + '*');
  } else if (t.manche > 0) {
    L.push('🔚 **Manche terminée.** L\'hôte peut **relancer une manche** ou **fermer la table**.');
    if (t.ambiance) L.push('💬 *' + t.ambiance + '*');
  } else {
    if (t.diff) L.push(`${t.diff.emoji} **Difficulté de la table : ${t.diff.label}** — ${t.diff.desc}`);
    L.push('💬 *' + (t.ambiance || _pick(_phrasesDeal)) + '*');
    L.push('👉 **S\'asseoir** (capital de départ). **Avant chaque manche**, chacun choisit sa **mise** (💵 Ma mise), puis l\'**hôte distribue**.');
    L.push('💰 *Chaque manche gagnée/perdue augmente ou diminue ton capital. À **0**, tu ne peux plus jouer — clique **💰 Recaver** pour recharger.*');
    L.push('📖 *Nouveau ? Clique **Comment jouer** avant de lancer.*  🎭 *Pense à **Emote RP** pour rester crédible en jeu.*');
  }
  const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => { const s = t.sieges.find(x => x.userId === u); return '• ' + (s ? s.nom : 'Parti') + ' : ' + _money(n); });
  if (sold.length) L.push('💰 **Jetons de la soirée**\n' + sold.join('\n'));
  if (t.reshuffle) L.push('🔀 *(sabot rebattu)*');
  return L;
}
function _imgState(t) {
  return {
    sousTitre: t.phase === 'jeu'
      ? ('À ' + (t.sieges[t.tourIdx]?.nom || '—') + ' de jouer — Tirer, Rester' + (_doublable(t.sieges[t.tourIdx]?.main) ? ', Doubler' : '') + (_splittable(t, t.sieges[t.tourIdx]) ? ', Séparer' : ''))
      : (t.manche > 0 ? 'Manche terminée — l\'hôte peut relancer ou fermer' : 'Faites vos jeux — misez, puis l\'hôte distribue'),
    croupier: {
      cards: (t.croupier.main || []).map(c => ({ r: c.r, s: c.s })),
      hidden: t.phase === 'jeu',
      total: t.croupier.main.length ? _total(t.croupier.main) : null,
      bust: t.croupier.main.length ? _total(t.croupier.main) > 21 : false,
      bj: _estBJ(t.croupier.main || []),
    },
    joueurs: t.sieges.map((s, i) => {
      let badge = '';
      if (t.phase === 'jeu') { badge = s.statut === 'bust' ? 'brûlé' : s.statut === 'blackjack' ? 'BLACKJACK' : s.statut === 'stand' ? 'reste' : (i === t.tourIdx ? 'à lui de jouer' : 'en attente'); }
      else if (s.resultat) badge = s.resultat;
      return { nom: s.nom, mise: _money(s.mise), sous: _money(_sous(s.userId)), cards: (s.main || []).map(c => ({ r: c.r, s: c.s })), total: s.main.length ? _total(s.main) : 0, actif: t.phase === 'jeu' && i === t.tourIdx, badge };
    }),
  };
}
// Rangée commune : Comment jouer / Emote RP / Mes sous (présente sur toutes les phases).
function _rowExtras() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bj_emote').setLabel('Emote RP').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bj_voix').setLabel('À dire (voix)').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('bj_sous').setLabel('Mes sous').setEmoji('💰').setStyle(ButtonStyle.Secondary),
  );
}
function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_sit').setLabel('S\'asseoir').setEmoji('🪑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bj_mise').setLabel('Ma mise').setEmoji('💵').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bj_recave').setLabel('Recaver').setEmoji('💰').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('bj_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_deal').setLabel(t.manche > 0 ? 'Relancer une manche' : 'Distribuer').setEmoji('🎴').setStyle(ButtonStyle.Primary).setDisabled(!t.sieges.length),
      new ButtonBuilder().setCustomId('bj_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else {
    const s = t.sieges[t.tourIdx];
    const asVisible = t.croupier.main[0]?.r === 'A';
    const comp = [
      new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setEmoji('🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bj_double').setLabel('Doubler').setEmoji('⏫').setStyle(ButtonStyle.Secondary).setDisabled(!(s && _doublable(s.main) && _stackDe(t, s) >= 2 * s.mise)),
      new ButtonBuilder().setCustomId('bj_split').setLabel('Séparer').setEmoji('🔀').setStyle(ButtonStyle.Secondary).setDisabled(!(s && _splittable(t, s) && _stackDe(t, s) >= 2 * s.mise)),
    ];
    // Assurance : proposée uniquement si le croupier montre un As, avant d'avoir agi.
    // Jamais sur une main issue d'un split ; et seulement si le capital la couvre.
    if (asVisible && s && s.main.length === 2 && !s.assurance && !s.isSplitHand && _stackDe(t, s) >= s.mise + Math.ceil(s.mise / 2)) {
      comp.push(new ButtonBuilder().setCustomId('bj_assur').setLabel('Assurance').setEmoji('🛡️').setStyle(ButtonStyle.Secondary));
    }
    rows.push(new ActionRowBuilder().addComponents(...comp));
  }
  rows.push(_rowExtras());
  return rows;
}
// Ligne TOUJOURS visible au-dessus de la table (marche même sans image) :
// à qui le tour pendant le jeu, résultats à la fin.
function _contentLigne(t) {
  if (t.phase === 'jeu') {
    const s = t.sieges[t.tourIdx];
    return s ? '🎯 **Au tour de ' + s.nom + '** — 🃏 Tirer · ✋ Rester' + (_doublable(s.main) ? ' · ⏫ Doubler' : '') + (_splittable(t, s) ? ' · 🔀 Séparer' : '') : '';
  }
  if (t.manche > 0) {
    const res = t.sieges.filter(s => s.resultat).map(s => (s.net > 0 ? '🟢' : s.net < 0 ? '🔴' : '⚪') + ' **' + s.nom + '** ' + (s.net > 0 ? '+' : '') + _money(s.net)).join('   ·   ');
    return '🏁 **Manche terminée** — ' + (res || 'aucun joueur') + '   *(relancez ou fermez)*';
  }
  return '💰 **Réglez vos mises** (bouton 💵 Ma mise), puis l\'hôte distribue.';
}
// Construit le message complet (image si possible, sinon texte). Renvoie { content, embeds, components, files }.
async function _screen(t) {
  const d = t.diff || DIFFICULTES[1];
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎰  TABLE DE BLACKJACK  🃏')
    .setFooter({ text: `Hôte : ${t.hoteNom}  ·  ${d.emoji} ${d.label} · ${_reglesTxt(d)} · mise max 100 $` });
  const content = (_contentLigne(t) || '').slice(0, 2000);
  let buf = null;
  try { if (_img?.genererTable) buf = await _img.genererTable(_imgState(t)); } catch { buf = null; }
  if (buf) {
    e.setImage('attachment://blackjack.png');
    e.setDescription(_lignesStatut(t).join('\n').slice(0, 4000));
    return { content, embeds: [e], components: _components(t), files: [new AttachmentBuilder(buf, { name: 'blackjack.png' })] };
  }
  e.setDescription(_lignesCartes(t).concat(['─────────────────────────────']).concat(_lignesStatut(t)).join('\n').slice(0, 4000));
  return { content, embeds: [e], components: _components(t), files: [] };
}

async function _refresh(t) {
  try {
    if (t.msg) { const p = await _screen(t); await t.msg.edit({ ...p, attachments: [], allowedMentions: { parse: [] } }); }
    // Pingue le joueur courant quand le tour change (une seule notif vivante).
    const cur = t.phase === 'jeu' ? t.sieges[t.tourIdx] : null;
    await _notif.majPingTour?.(t, t.msg?.channel, cur?.userId);
  } catch (e) { console.log('⚠️ bj refresh:', e.message); }
}

// ─── Déroulé d'une manche ───
function _armer(t) {
  _clearTimer(t);
  const s = t.sieges[t.tourIdx];
  if (!s) return;
  t.timer = setTimeout(async () => {
    try {
      if (t.phase !== 'jeu') return;
      const cur = t.sieges[t.tourIdx];
      if (!cur || cur.statut !== 'jeu') return;
      cur.statut = 'stand';
      t.ambiance = cur.nom + ' a trop tardé — le croupier le fait rester.';
      _avancer(t);
      await _refresh(t);
    } catch (e) { console.log('⚠️ bj timer:', e.message); }
  }, TOUR_MS);
}

function _avancer(t) {
  let n = t.tourIdx + 1;
  while (n < t.sieges.length && t.sieges[n].statut !== 'jeu') n++;
  if (n < t.sieges.length) { t.tourIdx = n; _armer(t); return; }
  _clearTimer(t);
  _croupierEtResolution(t);
}

function _croupierEtResolution(t) {
  const enJeu = t.sieges.some(s => s.statut === 'stand' || s.statut === 'blackjack');
  const H17 = t.diff ? t.diff.h17 : CROUPIER_H17;
  if (enJeu) { while (_total(t.croupier.main) < 17 || (H17 && _estSoft17(t.croupier.main))) t.croupier.main.push(_piocher(t)); }
  const dt = _total(t.croupier.main);
  const dBJ = _estBJ(t.croupier.main);
  const gainManche = {}; // userId -> net de CETTE manche (pour l'appliquer au capital)
  for (const s of t.sieges) {
    if (s.statut === 'sec') { s.resultat = '💤 à sec (n\'a pas joué)'; s.net = 0; continue; } // pas de mise
    const pt = _total(s.main);
    let net = 0, label = '';
    if (s.statut === 'bust') { net = -s.mise; label = '❌ Perdu (brûlé)'; }
    else if (s.statut === 'blackjack') { if (dBJ) { net = 0; label = '➖ Égalité (double blackjack)'; } else { net = Math.round(s.mise * (t.diff ? t.diff.bjPay : BJ_PAIEMENT)); label = '✦ BLACKJACK ! +' + _money(net); } }
    else { // stand
      if (dBJ) { net = -s.mise; label = '❌ Perdu (blackjack croupier)'; }
      else if ((t.diff ? t.diff.push22 : PUSH_22) && dt === 22) { net = 0; label = '➖ Égalité — le croupier brûle à 22 (règle de la maison)'; }
      else if (dt > 21) { net = s.mise; label = '✅ Gagné (croupier brûlé) +' + _money(net); }
      else if (pt > dt) { net = s.mise; label = '✅ Gagné +' + _money(net); }
      else if (pt < dt) { net = -s.mise; label = '❌ Perdu'; }
      else { net = 0; label = '➖ Égalité'; }
    }
    // Assurance (pari annexe pris quand le croupier montrait un As) : paie 2:1 si BJ croupier.
    if (s.assurance > 0) {
      if (dBJ) { net += s.assurance * 2; label += '  ·  🛡️ assurance +' + _money(s.assurance * 2); }
      else { net -= s.assurance; label += '  ·  🛡️ assurance −' + _money(s.assurance); }
    }
    s.resultat = label; s.net = net; s.statut = 'fini';
    t.soldes[s.userId] = (t.soldes[s.userId] || 0) + net;
    gainManche[s.userId] = (gainManche[s.userId] || 0) + net;
  }
  // Applique le résultat de la manche au CAPITAL (bankroll) de chaque siège réel.
  // Le capital ne peut jamais devenir négatif (on ne perd pas plus que sa cave).
  for (const s of t.sieges) {
    if (s.isSplitHand) continue;
    s.stack = Math.max(0, (s.stack || 0) + (gainManche[s.userId] || 0));
    if (s.stack <= 0) s.resultat = (s.resultat ? s.resultat + '  ·  ' : '') + '💰 **à sec** — recave pour rejouer';
  }
  // Compteur de « sous » PERSISTANT du saloon (une seule écriture pour toute la table).
  try { if (casino.crediterLot) casino.crediterLot(t.sieges.map(s => ({ userId: s.userId, montant: s.net || 0 }))); } catch {}
  t.phase = 'lobby';
  t.ambiance = _pick(_phrasesTire);
}

function _distribuer(t) {
  t.manche++;
  t.reshuffle = false;
  t.sieges = t.sieges.filter(s => !s.isSplitHand); // retire les mains séparées de la manche précédente
  t.croupier.main = [];
  for (const s of t.sieges) {
    s.main = []; s.resultat = ''; s.net = 0; s.assurance = 0; s.aceSplitLock = false;
    if (s.stack == null) s.stack = s.mise || MISE_MIN;                 // sécurité (anciens sièges)
    if ((s.stack || 0) < MISE_MIN) { s.statut = 'sec'; continue; }     // à sec → ne reçoit pas de cartes
    s.mise = Math.max(MISE_MIN, Math.min(s.mise || MISE_MIN, s.stack, MISE_MAX)); // la mise ne dépasse jamais le capital
    s.statut = 'jeu';
  }
  const actifs = t.sieges.filter(s => s.statut === 'jeu');
  // 2 cartes à chaque joueur ACTIF, puis 2 au croupier
  for (let k = 0; k < 2; k++) { for (const s of actifs) s.main.push(_piocher(t)); t.croupier.main.push(_piocher(t)); }
  for (const s of actifs) { if (_estBJ(s.main)) s.statut = 'blackjack'; }
  t.phase = 'jeu';
  t.tourIdx = -1;
  t.ambiance = _pick(_phrasesDeal);
  _avancer(t); // place sur le 1er joueur en jeu, ou résout si tous en blackjack
}

// ─── Panneau d'ouverture (installable dans le salon casino) ───
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎰 SALOON — TABLE DE JEU')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   BLACKJACK  ·  LA MAISON     ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Approchez, tentez votre chance à la table de Blackjack. Le croupier de la maison distribue — à vous de savoir vous arrêter à temps.*',
      '',
      '🃏 **Blackjack** — battez le croupier sans dépasser 21. **Chaque table a sa difficulté**, tirée au sort à l\'ouverture : 🟢 clémente · 🟡 équilibrée · 🟠 serrée · 🔴 maison — parfois clémente, parfois impitoyable. L\'**assurance** reste possible si le croupier montre un As.',
      '',
      '👉 **Ouvrir une table** ci-dessous : vous en devenez l\'**hôte**. Les autres joueurs s\'asseyent avec leur mise, et la partie commence.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bj_open').setLabel('Ouvrir une table de Blackjack').setEmoji('🎰').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}

async function installerPanelBlackjack(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('TABLE DE JEU');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ bj panel:', e.message); return null; }
}

// Salon propre : supprime les anciens messages du bot (tables, tables fermées, pings)
// pour ne garder que le panneau (épinglé) + le message qu'on vient de créer.
async function _nettoyerSalon(channel, gardeId) {
  try {
    if (!channel?.messages?.fetch) return;
    const me = channel.client.user.id;
    const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null);
    if (!msgs) return;
    for (const m of msgs.values()) {
      if (m.author?.id !== me) continue;                 // seulement les messages du bot
      if (gardeId && m.id === gardeId) continue;          // garder le message courant
      if (m.pinned) continue;                             // ne jamais toucher au panneau (épinglé)
      if (/TABLES DE JEU|TABLE DE JEU/i.test(m.embeds?.[0]?.title || '')) continue; // sécurité anti-panneau
      await m.delete().catch(() => {});
    }
  } catch {}
}

// ─── Routeur d'interactions ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith('bj_')) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table (depuis le panneau)
    if (interaction.isButton() && id === 'bj_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) { await interaction.reply({ content: '🎰 Une table est déjà ouverte dans ce salon. Rejoins-la un peu plus haut !', flags: eph }); return true; }
      await interaction.deferReply({ flags: eph }); // accuse réception AVANT de générer l'image (sinon timeout 3 s)
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(await _screen(t)).catch(() => null);
      if (!msg) { await interaction.editReply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).' }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await _nettoyerSalon(interaction.channel, msg.id); // salon propre : retire les anciennes tables
      await interaction.editReply({ content: '🎰 Table ouverte — tu en es l\'**hôte**. Assieds-toi 👇 puis clique **Distribuer** quand tout le monde a misé.' });
      return true;
    }

    // À partir d'ici il faut une table active dans ce salon
    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🎰.', flags: eph }).catch(() => {}); } return true; }

    // S'asseoir (nouveau joueur) → uniquement le capital de départ.
    // La mise, elle, se choisit AVANT CHAQUE MANCHE (bouton 💵 Ma mise).
    if (interaction.isButton() && id === 'bj_sit') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une manche est en cours — assieds-toi à la fin de celle-ci.', flags: eph }); return true; }
      if (_siege(t, interaction.user.id)) { await interaction.reply({ content: '🪑 Tu es déjà assis. Règle ta mise avec **💵 Ma mise** avant chaque manche, ou **💰 Recaver**.', flags: eph }); return true; }
      if (t.sieges.filter(s => !s.isSplitHand).length >= MAX_SIEGES) { await interaction.reply({ content: '🈵 La table est complète (' + MAX_SIEGES + ' joueurs).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('bj_sit_modal').setTitle('🪑 S\'asseoir à la table')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('cave').setLabel('Ton capital de départ (' + CAVE_MIN + '–' + CAVE_MAX + ' $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setPlaceholder('Ex : ' + CAVE_DEF)));
      await interaction.showModal(modal); return true;
    }
    // Changer sa mise par manche
    if (interaction.isButton() && id === 'bj_mise') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Manche en cours — change ta mise à la fin.', flags: eph }); return true; }
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: 'Assieds-toi d\'abord (bouton 🪑) pour poser une mise.', flags: eph }); return true; }
      const plafond = Math.max(MISE_MIN, Math.min(MISE_MAX, s.stack || MISE_MAX));
      const modal = new ModalBuilder().setCustomId('bj_mise_modal').setTitle('💵 Ma mise par manche')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mise').setLabel('Mise (max ' + plafond + ' $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setValue(String(s.mise || MISE_MIN))));
      await interaction.showModal(modal); return true;
    }
    // Recaver : ajouter du capital (obligatoire une fois à sec)
    if (interaction.isButton() && id === 'bj_recave') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Manche en cours — recave à la fin.', flags: eph }); return true; }
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: 'Assieds-toi d\'abord (bouton 🪑).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('bj_recave_modal').setTitle('💰 Recaver (ajouter du capital)')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ajout').setLabel('Montant à ajouter (max ' + CAVE_MAX + ' $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(4).setPlaceholder('Ex : 200')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'bj_sit_modal') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Manche en cours, patiente.', flags: eph }); return true; }
      if (_siege(t, interaction.user.id)) { await interaction.reply({ content: 'Tu es déjà assis.', flags: eph }); return true; }
      if (t.sieges.filter(x => !x.isSplitHand).length >= MAX_SIEGES) { await interaction.reply({ content: '🈵 Table complète.', flags: eph }); return true; }
      let cave = parseInt((interaction.fields.getTextInputValue('cave') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(cave) || cave < CAVE_MIN) cave = CAVE_DEF;
      if (cave > CAVE_MAX) cave = CAVE_MAX;
      // mise de départ raisonnable (modifiable avant chaque manche via 💵 Ma mise)
      const mise = Math.max(MISE_MIN, Math.min(MISE_MAX, cave, 25));
      const s = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, cave, stack: cave, mise, main: [], statut: 'attente', resultat: '', net: 0 };
      t.sieges.push(s);
      await interaction.reply({ content: '✅ Tu t\'assieds avec **' + _money(cave) + '** de capital.\n💵 **Avant chaque manche, choisis ta mise** avec le bouton **Ma mise** (par défaut ' + _money(mise) + ').', flags: eph });
      await _refresh(t); return true;
    }
    if (interaction.isModalSubmit() && id === 'bj_mise_modal') {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: 'Tu n\'es plus à la table.', flags: eph }); return true; }
      let mise = parseInt((interaction.fields.getTextInputValue('mise') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(mise) || mise < MISE_MIN) mise = MISE_MIN;
      mise = Math.min(mise, MISE_MAX, Math.max(MISE_MIN, s.stack || MISE_MIN));
      s.mise = mise;
      await interaction.reply({ content: '💵 Mise réglée à **' + _money(mise) + '** par manche.' + ((s.stack || 0) < MISE_MIN ? ' ⚠️ Tu es **à sec** — clique **💰 Recaver** pour rejouer.' : ''), flags: eph });
      await _refresh(t); return true;
    }
    if (interaction.isModalSubmit() && id === 'bj_recave_modal') {
      const s = _siege(t, interaction.user.id);
      if (!s) { await interaction.reply({ content: 'Tu n\'es plus à la table.', flags: eph }); return true; }
      let ajout = parseInt((interaction.fields.getTextInputValue('ajout') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(ajout) || ajout < 1) ajout = CAVE_DEF;
      if (ajout > CAVE_MAX) ajout = CAVE_MAX;
      s.stack = (s.stack || 0) + ajout; s.cave = (s.cave || 0) + ajout;
      if (!s.mise || s.mise < MISE_MIN) s.mise = Math.min(MISE_MAX, s.stack);
      await interaction.reply({ content: '💰 Tu recaves **+' + _money(ajout) + '**. Capital : **' + _money(s.stack) + '**.', flags: eph });
      await _refresh(t); return true;
    }

    // Se lever
    if (interaction.isButton() && id === 'bj_leave') {
      if (t.phase === 'jeu' && _siege(t, interaction.user.id)) { await interaction.reply({ content: '⏳ Tu ne peux pas quitter en pleine manche — finis le coup.', flags: eph }); return true; }
      const idx = t.sieges.findIndex(s => s.userId === interaction.user.id);
      if (idx < 0) { await interaction.reply({ content: 'Tu n\'es pas assis à cette table.', flags: eph }); return true; }
      const solde = t.soldes[interaction.user.id] || 0;
      t.sieges = t.sieges.filter(s => s.userId !== interaction.user.id); // retire toutes ses mains
      await interaction.reply({ content: '🚪 Tu quittes la table. Bilan de la soirée : **' + _money(solde) + '** de jetons.', flags: eph });
      await _refresh(t); return true;
    }

    // Distribuer (hôte)
    if (interaction.isButton() && id === 'bj_deal') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut distribuer.', flags: eph }); return true; }
      if (t.phase === 'jeu') { await interaction.reply({ content: 'Une manche est déjà en cours.', flags: eph }); return true; }
      if (!t.sieges.length) { await interaction.reply({ content: 'Personne n\'est assis à la table.', flags: eph }); return true; }
      if (!t.sieges.some(s => (s.stack ?? 0) >= MISE_MIN)) { await interaction.reply({ content: '💰 Tous les joueurs sont **à sec** — cliquez **💰 Recaver** pour recharger votre capital avant de distribuer.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _distribuer(t);
      try { _voix.jouer?.(interaction.member?.voice?.channel, 'battage'); } catch {}
      await _refresh(t); return true;
    }

    // Actions de jeu : Tirer / Rester / Doubler
    // Assurance (pari annexe) — se prend à ton tour quand le croupier montre un As.
    if (interaction.isButton() && id === 'bj_assur') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const s = t.sieges[t.tourIdx];
      if (!s || s.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ L\'assurance se prend à ton tour.', flags: eph }); return true; }
      if (t.croupier.main[0]?.r !== 'A') { await interaction.reply({ content: 'Assurance possible seulement si le croupier montre un As.', flags: eph }); return true; }
      if (s.isSplitHand) { await interaction.reply({ content: 'L\'assurance ne se prend qu\'une fois, sur la main de départ (pas sur une main séparée).', flags: eph }); return true; }
      if (s.main.length !== 2 || s.assurance) { await interaction.reply({ content: 'Trop tard pour t\'assurer sur cette main.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      s.assurance = Math.max(1, Math.round(s.mise / 2));
      t.ambiance = s.nom + ' prend une assurance (' + _money(s.assurance) + ').';
      await _refresh(t); return true;
    }

    if (interaction.isButton() && (id === 'bj_hit' || id === 'bj_stand' || id === 'bj_double')) {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const s = t.sieges[t.tourIdx];
      if (!s) { await interaction.reply({ content: 'Aucun joueur à jouer.', flags: eph }); return true; }
      if (s.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + s.nom + '** de jouer.', flags: eph }); return true; }
      _clearTimer(t); // évite que le timer AFK ne se déclenche pendant le round-trip de l'action
      await interaction.deferUpdate().catch(() => {});
      if (id === 'bj_hit') {
        s.main.push(_piocher(t));
        const tot = _total(s.main);
        if (tot > 21) { s.statut = 'bust'; t.ambiance = s.nom + ' dépasse 21 — brûlé !'; _avancer(t); }
        else if (tot === 21) { s.statut = 'stand'; t.ambiance = s.nom + ' atteint 21.'; _avancer(t); }
        else { _armer(t); }
      } else if (id === 'bj_stand') {
        s.statut = 'stand'; t.ambiance = s.nom + ' reste à ' + _total(s.main) + '.'; _avancer(t);
      } else { // double
        if (!_doublable(s.main) || _stackDe(t, s) < 2 * s.mise) { await _refresh(t); return true; } // besoin de 2× la mise en capital
        s.mise *= 2; s.main.push(_piocher(t));
        const tot = _total(s.main);
        s.statut = tot > 21 ? 'bust' : 'stand';
        t.ambiance = s.nom + ' double la mise et tire une carte' + (tot > 21 ? ' — brûlé !' : '.');
        _avancer(t);
      }
      await _refresh(t); return true;
    }

    // Séparer (split)
    if (interaction.isButton() && id === 'bj_split') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const s = t.sieges[t.tourIdx];
      if (!s) { await interaction.reply({ content: 'Aucun joueur à jouer.', flags: eph }); return true; }
      if (s.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + s.nom + '** de jouer.', flags: eph }); return true; }
      if (!_splittable(t, s)) { await interaction.reply({ content: '🔀 Séparation impossible : il faut **2 cartes de même rang** (max 4 mains).', flags: eph }); return true; }
      if (_stackDe(t, s) < 2 * s.mise) { await interaction.reply({ content: '💰 Capital insuffisant pour séparer (il faut couvrir une 2ᵉ mise).', flags: eph }); return true; }
      _clearTimer(t);
      await interaction.deferUpdate().catch(() => {});
      const rang = s.main[0].r;
      t.ambiance = s.nom + ' sépare ses ' + rang + ' en deux mains.';
      _split(t, t.tourIdx);
      await _refresh(t); return true;
    }

    // Fermer la table (hôte)
    if (interaction.isButton() && id === 'bj_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      await _notif.majPingTour?.(t, t.msg?.channel, null); // retire la notif « à toi de jouer »
      tables.delete(interaction.channelId);
      const bilan = t.sieges.length || Object.keys(t.soldes).length
        ? Object.entries(t.soldes).map(([uid, n]) => '• <@' + uid + '> : ' + _money(n)).join('\n')
        : '';
      const chan = t.msg?.channel || interaction.channel;
      // Salon propre : on SUPPRIME le message de la table (au lieu de le laisser) + les anciens résidus.
      try { await t.msg?.delete(); } catch {}
      try { await _nettoyerSalon(chan, null); } catch {}
      await interaction.reply({ content: '🎰 **Table fermée.** Le croupier ramasse les cartes.' + (bilan ? '\n\n**Bilan des jetons :**\n' + bilan : ''), flags: eph, allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }

    // Comment jouer (règles, avant de lancer)
    if (interaction.isButton() && id === 'bj_regles') {
      // Règles en EMBED (description ≤ 4096) : le contenu texte est limité à 2000
      // et les règles dépassent — d'où l'erreur « Invalid Form Body » sinon.
      const eReg = new EmbedBuilder().setColor(0xC8A45C).setTitle('🃏 Blackjack — comment jouer').setDescription(_REGLES.join('\n').replace(/^📖 \*\*BLACKJACK.*\*\*\n\n/, '').slice(0, 4090));
      await interaction.reply({ embeds: [eReg], flags: eph });
      return true;
    }
    // Emote RP à coller en jeu (anti-AFK)
    if (interaction.isButton() && id === 'bj_emote') {
      const s = _siege(t, interaction.user.id);
      const lignes = _emotePerso(t, s) + '\n' + _pick(_EMOTES_SCENE);
      await interaction.reply({ content: '🎭 **Reste dans la scène !** Colle une de ces lignes **en jeu** (RedM) pour ne pas passer pour AFK :\n```\n' + lignes + '\n```\n*Astuce : garde le jeu en fenêtre, alterne vite, et remets une émote à chaque action.*', flags: eph });
      return true;
    }
    // Réplique à DIRE À VOIX HAUTE en jeu (ambiance IA)
    if (interaction.isButton() && id === 'bj_voix') {
      await interaction.deferReply({ flags: eph }); // l'IA peut prendre 1-2 s
      const s = _siege(t, interaction.user.id);
      const role = (_estHote(t, interaction) && !s) ? 'croupier' : 'joueur';
      let situation = 'general';
      if (t.phase === 'jeu' && s) { situation = s.statut === 'bust' ? 'perd' : s.statut === 'blackjack' ? 'gagne' : (t.sieges[t.tourIdx]?.userId === interaction.user.id ? 'tour' : 'attente'); }
      else if (s?.resultat) { const n = s.net || 0; situation = n > 0 ? 'gagne' : n < 0 ? 'perd' : 'general'; }
      const detail = s?.main?.length ? ('main à ' + _total(s.main)) : '';
      const ligne = await _ambiance.repliqueVocale?.({ jeu: 'blackjack', role, situation, detail }) || '';
      await interaction.editReply({ content: '🎙️ **À dire à voix haute (en jeu)** :\n> ' + ligne + '\n\n*Dis-le au micro pour animer la table — pas besoin de le taper.*' });
      return true;
    }
    // Compteur de sous du saloon (persistant)
    if (interaction.isButton() && id === 'bj_sous') {
      const total = _sous(interaction.user.id);
      const s = _siege(t, interaction.user.id);
      const sess = s ? (t.soldes[interaction.user.id] || 0) : 0;
      const top = casino.classement ? casino.classement(3) : [];
      const topTxt = top.length ? '\n\n🏆 **Gros joueurs du saloon**\n' + top.map(([u, n], i) => (i + 1) + '. <@' + u + '> — ' + _money(n)).join('\n') : '';
      await interaction.reply({ content: '💰 **Tes sous au saloon : ' + _money(total) + '**' + (s ? '\n*(à cette table : ' + _money(sess) + ')*' : '') + topTxt, flags: eph, allowedMentions: { parse: [] } });
      return true;
    }

    // filet de sécurité : tout bj_* non géré est quand même acquitté (jamais « interaction failed »)
    if ((interaction.isButton?.() || interaction.isModalSubmit?.()) && !interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate().catch(() => {});
    }
    return true; // customId bj_* pris en charge
  } catch (e) {
    console.log('❌ blackjack routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de jeu.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerPanelBlackjack, _test: { _total, _estBJ, _estSoft17, _construireSabot, _distribuer, _croupierEtResolution, _creerTable, tables, BJ_PAIEMENT, CROUPIER_H17, _doublable, _splittable, _split, _avancer, _piocher, _val, _stackDe } };
