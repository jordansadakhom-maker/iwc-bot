// ───────────────────────────────────────────────────────────────────────────
//  dominos.js — Table de DOMINOS bloqués (double-six) immersive (saloon RP).
//   • Jeu de 28 tuiles (0-0 à 6-6). 2 à 4 joueurs. Chacun mise un ANTE ; le
//     vainqueur ramasse le POT. AUCUNE maison → équitable entre joueurs.
//   • Un joueur OUVRE la table (il en est l'« hôte »). Distribution : 7 tuiles
//     à 2 joueurs, 6 à 3 joueurs, 5 à 4 joueurs ; le reste = pioche (boneyard).
//   • À son tour, raccorder une tuile à une des deux extrémités (pips égaux),
//     sinon PIOCHER jusqu'à pouvoir, sinon PASSER (variante BLOQUÉE).
//   • Premier à vider sa main = gagne. Blocage général → plus petit total de
//     pips gagne. Info cachée : dom_peek → image ÉPHÉMÈRE de votre main.
//   • Tout est préfixé dom_ — n'écrit RIEN en base, aucune économie touchée.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
let _img = null; try { _img = require('./dominos-image'); } catch { _img = null; }
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }
let _ambiance = {}; try { _ambiance = require('./ambiance-ia'); } catch { _ambiance = {}; }
let _notif = {}; try { _notif = require('./table-notif'); } catch { _notif = {}; }
let _voix = {}; try { _voix = require('./casino-voix'); } catch { _voix = {}; }
const _sous = uid => (casino.solde ? casino.solde(uid) : 0);

const PREFIXE = 'dom_';

// ── Émotes RP à coller EN JEU (RedM) : garde la scène vivante pendant qu'on joue sur Discord ──
const _EMOTES_SCENE = [
  '/do Les tuiles s\'alignent dans un cliquetis d\'ivoire sur le bois usé.',
  '/do Une partie de dominos s\'étire, chaque raccord ponctué d\'un claquement sec.',
  '/do L\'odeur du tabac froid flotte au-dessus de la chaîne d\'os qui serpente.',
  '/me balaie la table du regard, comptant en silence les pips restants.',
];
const _EMOTES_LOBBY = [
  '/me tire une chaise et pose sa mise au centre de la table.',
  '/me fait glisser ses tuiles face cachée et les redresse d\'un doigt.',
  '/me ajuste son chapeau et jauge ses adversaires avant la donne.',
  '/me mélange les os d\'un revers de main dans un cliquetis sourd.',
];
const _EMOTES_TOUR = [
  '/me étudie ses dominos en cherchant le bon raccord.',
  '/me pose une tuile au bout de la chaîne d\'un geste sec.',
  '/me hésite, une tuile suspendue au-dessus des deux extrémités.',
  '/me tapote une tuile contre le bord de la table, songeur.',
];
const _EMOTES_GAGNE = [
  '/me abat sa dernière tuile et écarte les bras, la main vide.',
  '/me ramasse le pot d\'un geste ample, un sourire au coin des lèvres.',
];
const _EMOTES_PERDU = [
  '/me repousse ses tuiles restantes en soupirant.',
  '/me retourne ses derniers os, encore lourds de pips.',
];
const _EMOTES_GEN = [
  '/me surveille les extrémités ouvertes en attendant son tour.',
  '/me sirote son verre, ses tuiles serrées contre lui.',
  '/me croise les bras, impassible, la chaîne s\'allongeant devant lui.',
];
function _emotePerso(t, j) {
  if (!j) return _pick(_EMOTES_SCENE);
  if (t.phase === 'lobby') {
    if (t.manche > 0 && j.net != null) { const n = j.net || 0; return _pick(n > 0 ? _EMOTES_GAGNE : n < 0 ? _EMOTES_PERDU : _EMOTES_GEN); }
    return _pick(_EMOTES_LOBBY);
  }
  if (t.joueurs[t.tourIdx]?.userId === j.userId) return _pick(_EMOTES_TOUR);
  return _pick(_EMOTES_GEN);
}
// ── Règles : « comment jouer », montrées avant de lancer une partie ──
const _REGLES = [
  '📖 **DOMINOS (DOUBLE-SIX, BLOQUÉ) — COMMENT JOUER**',
  '',
  '**But :** être le premier à **vider sa main** de tuiles pour rafler le **pot**.',
  '',
  '**Le jeu :** 28 tuiles (de 0-0 à 6-6). Chacun mise un **ante** ; toutes les mises forment le pot.',
  '**La donne :** 7 tuiles à 2 joueurs, 6 à 3, 5 à 4. Le reste forme la **pioche** (boneyard). L\'ouvreur est celui qui a le plus gros double (sinon la plus grosse tuile).',
  '**À ton tour :**',
  '• 🀱 **Jouer une tuile** — raccorde une tuile à une des **deux extrémités** ouvertes (pips égaux).',
  '• 🂠 **Piocher** — si rien ne raccorde, tire dans la pioche jusqu\'à pouvoir jouer.',
  '• ⏭️ **Passer** — seulement si tu ne peux pas jouer **et** que la pioche est vide.',
  '• 👁️ **Voir ma main** — affiche tes tuiles en privé (les jouables sont marquées).',
  '**Fin de manche :** le premier à vider sa main **remporte le pot**. Si tout le monde est bloqué (personne ne joue, pioche vide), c\'est le **plus petit total de pips** qui gagne.',
  '',
  '🎭 **Reste en RP :** appuie sur **Emote** à chaque action et colle la ligne **en jeu** — comme ça, personne ne te prend pour un AFK pendant que tu joues ici.',
  '💰 **Sous :** tes gains/pertes sont cumulés dans ton compteur de **sous** du saloon (bouton « Mes sous »).',
];

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const MAX_JOUEURS = 4, MIN_JOUEURS = 2;
const ANTE_MIN = 1, ANTE_MAX = 1000000;
const TOUR_MS = 120000; // 2 min pour jouer, sinon action sûre auto (jouer/piocher/passer)
const MAINS = { 2: 7, 3: 6, 4: 5 }; // tuiles distribuées selon le nombre de joueurs

// ─── Le set de 28 tuiles ───
function _construireSet() { const s = []; for (let a = 0; a <= 6; a++) for (let b = a; b <= 6; b++) s.push({ a, b }); return s; }
function _melanger(arr) { for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; } return arr; }
function _totalPips(main) { return main.reduce((t, x) => t + x.a + x.b, 0); }
function _peutRaccorder(tile, val) { return tile.a === val || tile.b === val; }
function _peutJouerMain(main, gauche, droite) { if (gauche == null) return main.length > 0; return main.some(t => _peutRaccorder(t, gauche) || _peutRaccorder(t, droite)); }

// Options jouables d'une main : [{ idx, cote, tile }]. Un double sur une extrémité = une seule option.
function _optionsJouables(main, gauche, droite) {
  const out = [];
  main.forEach((t, idx) => {
    if (gauche == null) { out.push({ idx, cote: 'gauche', tile: t }); return; }
    if (_peutRaccorder(t, gauche)) out.push({ idx, cote: 'gauche', tile: t });
    if (droite !== gauche && _peutRaccorder(t, droite)) out.push({ idx, cote: 'droite', tile: t });
  });
  return out;
}

function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
function _fmtTuile(t) { return '[' + t.a + '|' + t.b + ']'; }

// ─── Pose d'une tuile sur le plateau ───
// Renvoie true si la pose est valide (et mute la table : chaine, gauche, droite, retire de main).
function _poserTuile(t, main, idx, cote) {
  const tile = main[idx];
  if (!tile) return false;
  if (t.gauche == null) { // première tuile
    t.chaine = [{ g: tile.a, d: tile.b }];
    t.gauche = tile.a; t.droite = tile.b;
    main.splice(idx, 1);
    return true;
  }
  if (cote === 'gauche') {
    if (tile.b === t.gauche) { t.chaine.unshift({ g: tile.a, d: tile.b }); t.gauche = tile.a; }
    else if (tile.a === t.gauche) { t.chaine.unshift({ g: tile.b, d: tile.a }); t.gauche = tile.b; }
    else return false;
  } else { // droite
    if (tile.a === t.droite) { t.chaine.push({ g: tile.a, d: tile.b }); t.droite = tile.b; }
    else if (tile.b === t.droite) { t.chaine.push({ g: tile.b, d: tile.a }); t.droite = tile.a; }
    else return false;
  }
  main.splice(idx, 1);
  return true;
}

// ─── Ambiance ───
const _phrasesOuvre = ['« Posez l\'os, l\'ami. »', '« La table est à vous. »', '« Que le meilleur raccord gagne. »', '« On mélange, on distribue, on joue. »'];
const _phrasesJoue = ['La tuile claque sur le bois.', 'Un raccord net.', 'Le domino trouve sa place.', 'Clac — la chaîne s\'allonge.'];
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ─── État des tables (en mémoire, une par salon) ───
const tables = new Map(); // channelId -> table

function _creerTable(interaction) {
  return {
    channelId: interaction.channelId,
    guildId: interaction.guild?.id,
    hoteId: interaction.user.id,
    hoteNom: interaction.member?.displayName || interaction.user.username,
    phase: 'lobby',          // 'lobby' | 'jeu'
    joueurs: [],             // { userId, nom, main:[{a,b}], ante }
    pioche: [],              // boneyard
    chaine: [],              // tuiles posées [{g,d}] (g=extrémité gauche affichée)
    gauche: null, droite: null,
    pot: 0,
    tourIdx: -1,
    passesConsec: 0,
    soldes: {},              // userId -> jetons cumulés
    manche: 0,
    msg: null,
    timer: null,
    ambiance: '',
    resultat: '',            // texte de fin de manche
    reshuffle: false,
  };
}

function _joueur(t, uid) { return t.joueurs.find(j => j.userId === uid); }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }

// ─── Distribution / déroulé ───
function _distribuer(t) {
  t.manche++;
  const n = t.joueurs.length;
  const nbMain = MAINS[n] || 7;
  const set = _melanger(_construireSet());
  for (const j of t.joueurs) j.main = [];
  for (let k = 0; k < nbMain; k++) for (const j of t.joueurs) j.main.push(set.pop());
  t.pioche = set;
  t.chaine = []; t.gauche = null; t.droite = null;
  t.pot = t.joueurs.reduce((s, j) => s + (j.ante || 0), 0);
  t.passesConsec = 0;
  t.resultat = '';
  t.phase = 'jeu';
  // L'ouvreur : celui qui détient le plus gros double, sinon la plus grosse tuile.
  t.tourIdx = _choisirOuvreur(t);
  t.ambiance = t.joueurs[t.tourIdx].nom + ' ouvre la partie.';
  _armer(t);
}

function _choisirOuvreurValeur(main) {
  let best = -1;
  for (const tile of main) {
    const doub = tile.a === tile.b;
    const v = (doub ? 100 : 0) + tile.a + tile.b;
    if (v > best) best = v;
  }
  return best;
}
function _choisirOuvreur(t) {
  let idx = 0, best = -1;
  t.joueurs.forEach((j, i) => { const v = _choisirOuvreurValeur(j.main); if (v > best) { best = v; idx = i; } });
  return idx;
}

// Fait avancer au prochain joueur (les mains ne sont jamais vides ici : la victoire est traitée avant).
function _prochainJoueur(t) { t.tourIdx = (t.tourIdx + 1) % t.joueurs.length; }

// Détecte le blocage général : personne ne peut jouer et la pioche est vide.
function _detecterBlocage(t) {
  if (t.pioche.length > 0) return false;
  return t.joueurs.every(j => !_peutJouerMain(j.main, t.gauche, t.droite));
}

// Résout une manche gagnée (uid gagnant) OU un blocage (uid = null → plus petit total).
function _resoudreManche(t, gagnantIdx, cause) {
  _clearTimer(t);
  let idx = gagnantIdx;
  if (idx == null) { // blocage → plus petit total de pips, égalité tranchée par ordre de siège
    let best = Infinity;
    t.joueurs.forEach((j, i) => { const tot = _totalPips(j.main); if (tot < best) { best = tot; idx = i; } });
  }
  const gagnant = t.joueurs[idx];
  for (const j of t.joueurs) {
    const net = (j === gagnant) ? (t.pot - (j.ante || 0)) : -(j.ante || 0);
    t.soldes[j.userId] = (t.soldes[j.userId] || 0) + net;
    j.net = net;
  }
  // Compteur de « sous » PERSISTANT du saloon (une seule écriture pour toute la table).
  try { if (casino.crediterLot) casino.crediterLot(t.joueurs.map(j => ({ userId: j.userId, montant: j.net || 0 }))); } catch {}
  const detailPips = cause === 'blocage'
    ? '  (' + t.joueurs.map(j => j.nom + ' : ' + _totalPips(j.main) + ' pips').join(', ') + ')'
    : '';
  t.resultat = (cause === 'blocage' ? '🔒 Partie BLOQUÉE — ' : '🏆 ') + gagnant.nom
    + (cause === 'blocage' ? ' l\'emporte au plus petit total' + detailPips : ' vide sa main et remporte le pot')
    + ' · +' + _money(t.pot - (gagnant.ante || 0)) + '.';
  t.phase = 'lobby';
  t.ambiance = '';
  t.tourIdx = -1;
}

// Après une pose : vérifie victoire / blocage, sinon passe au joueur suivant capable, en avançant.
function _apresCoup(t) {
  const cur = t.joueurs[t.tourIdx];
  if (cur && cur.main.length === 0) { _resoudreManche(t, t.tourIdx, 'main-vide'); return; }
  // Avance jusqu'à trouver un joueur, mais le blocage se détecte via passesConsec.
  _prochainJoueur(t);
  if (_detecterBlocage(t)) { _resoudreManche(t, null, 'blocage'); return; }
  _armer(t);
}

// Un joueur passe (ne peut jouer ET pioche vide). Incrémente les passes ; blocage si tous passent.
function _passer(t) {
  t.passesConsec++;
  if (t.passesConsec >= t.joueurs.length) { _resoudreManche(t, null, 'blocage'); return; }
  _prochainJoueur(t);
  _armer(t);
}

// ─── Timeout de tour : action sûre auto (jouer 1re option / piocher puis jouer / passer) ───
function _armer(t) {
  _clearTimer(t);
  if (t.phase !== 'jeu') return;
  t.timer = setTimeout(async () => {
    try {
      if (t.phase !== 'jeu') return;
      const j = t.joueurs[t.tourIdx];
      if (!j) return;
      // Pioche tant qu'on ne peut pas jouer.
      while (!_peutJouerMain(j.main, t.gauche, t.droite) && t.pioche.length > 0) j.main.push(t.pioche.pop());
      const opts = _optionsJouables(j.main, t.gauche, t.droite);
      if (opts.length) {
        const o = opts[0];
        _poserTuile(t, j.main, o.idx, o.cote);
        t.passesConsec = 0;
        t.ambiance = j.nom + ' a trop tardé — la maison joue ' + _fmtTuile(o.tile) + ' pour lui.';
        _apresCoup(t);
      } else {
        t.ambiance = j.nom + ' a trop tardé — passe (rien à poser).';
        _passer(t);
      }
      await _refresh(t);
    } catch (e) { console.log('⚠️ dom timer:', e.message); }
  }, TOUR_MS);
}

// ─── Rendu ───
function _imgState(t) {
  const j = t.joueurs[t.tourIdx];
  return {
    sousTitre: t.phase === 'jeu'
      ? ('À ' + (j ? j.nom : '—') + ' de jouer — raccordez une tuile ou piochez')
      : (t.manche > 0 ? 'Manche terminée — l\'hôte peut relancer ou fermer' : 'Misez votre ante, puis l\'hôte distribue'),
    chaine: t.chaine.map(c => ({ g: c.g, d: c.d })),
    gauche: t.gauche, droite: t.droite,
    pioche: t.pioche.length,
    pot: _money(t.pot),
    joueurs: t.joueurs.map((jj, i) => ({
      nom: jj.nom,
      restant: jj.main.length,
      ante: _money(jj.ante || 0),
      actif: t.phase === 'jeu' && i === t.tourIdx,
      badge: t.phase === 'jeu' ? '' : (jj.net != null ? (jj.net > 0 ? 'gagne ' + _money(jj.net) : jj.net < 0 ? _money(jj.net) : '—') : ''),
    })),
  };
}

// Lignes texte (repli si l'image ne se génère pas).
function _lignesTexte(t) {
  const L = [];
  if (t.gauche != null) L.push('🁣 **Extrémités ouvertes** — gauche : `' + t.gauche + '`  ·  droite : `' + t.droite + '`');
  else L.push('🁣 *Table nue — l\'ouvreur pose la première tuile.*');
  L.push('🀰 **Chaîne** : ' + (t.chaine.length ? t.chaine.map(c => _fmtTuile({ a: c.g, b: c.d })).join(' ') : '—'));
  L.push('🂠 Pioche : **' + t.pioche.length + '** · Pot : **' + _money(t.pot) + '**');
  L.push('─────────────────────────────');
  if (!t.joueurs.length) L.push('*Personne à la table. Cliquez sur* **🀱 Rejoindre** *pour vous asseoir.*');
  else t.joueurs.forEach((j, i) => {
    const marque = (t.phase === 'jeu' && i === t.tourIdx) ? '▸ ' : '•  ';
    const fin = (t.phase !== 'jeu' && j.net != null && j.net !== 0) ? '  ·  ' + _money(j.net) : '';
    L.push(marque + '**' + j.nom + '** — ' + j.main.length + ' tuile(s) · ante ' + _money(j.ante || 0) + fin);
  });
  return L;
}
function _lignesStatut(t) {
  const L = [];
  if (t.phase === 'jeu') {
    const j = t.joueurs[t.tourIdx];
    L.push('➡️ **À ' + (j ? j.nom : '—') + ' de jouer.** Cliquez **Jouer une tuile**, **Piocher**, ou **Passer**.');
    if (t.ambiance) L.push('💬 *' + t.ambiance + '*');
  } else if (t.manche > 0) {
    if (t.resultat) L.push(t.resultat);
    L.push('🔚 **Manche terminée.** L\'hôte peut **relancer** ou **fermer** la table.');
  } else {
    L.push('💬 *' + (t.ambiance || _pick(_phrasesOuvre)) + '*');
    L.push('👉 **Rejoindre** avec un ante, puis l\'**hôte distribue** (' + MIN_JOUEURS + ' à ' + MAX_JOUEURS + ' joueurs).');
    L.push('📖 *Nouveau ? Clique **Comment jouer** avant de lancer.*  🎭 *Pense à **Emote RP** pour rester crédible en jeu.*');
  }
  const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => { const j = t.joueurs.find(x => x.userId === u); return '• ' + (j ? j.nom : 'Parti') + ' : ' + _money(n); });
  if (sold.length) L.push('💰 **Jetons de la soirée**\n' + sold.join('\n'));
  return L;
}

// Rangée commune : Comment jouer / Emote RP / Mes sous (présente sur toutes les phases).
function _rowExtras() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dom_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dom_emote').setLabel('Emote RP').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dom_voix').setLabel('À dire (voix)').setEmoji('🎙️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('dom_sous').setLabel('Mes sous').setEmoji('💰').setStyle(ButtonStyle.Secondary),
  );
}
function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dom_join').setLabel('Rejoindre').setEmoji('🪑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dom_mise').setLabel('Mon ante').setEmoji('💵').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dom_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dom_deal').setLabel(t.manche > 0 ? 'Relancer une manche' : 'Distribuer').setEmoji('🁢').setStyle(ButtonStyle.Primary).setDisabled(t.joueurs.length < MIN_JOUEURS),
      new ButtonBuilder().setCustomId('dom_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dom_play').setLabel('Jouer une tuile').setEmoji('🀱').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('dom_draw').setLabel('Piocher').setEmoji('🂠').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('dom_pass').setLabel('Passer').setEmoji('⏭️').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('dom_peek').setLabel('Voir ma main').setEmoji('👁️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('dom_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  }
  rows.push(_rowExtras());
  return rows;
}

function _contentLigne(t) {
  if (t.phase === 'jeu') { const j = t.joueurs[t.tourIdx]; return j ? '🎯 **Au tour de ' + j.nom + '** — 🀱 Jouer · 🂠 Piocher · ⏭️ Passer' : ''; }
  if (t.manche > 0 && t.resultat) return '🏁 ' + t.resultat;
  return '💰 Rejoignez et misez (💵 Ma mise), puis l\'hôte distribue.';
}
async function _screen(t) {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🁢  TABLE DE DOMINOS  🁫')
    .setFooter({ text: 'Hôte : ' + t.hoteNom + '  ·  Double-six, jeu bloqué  ·  Le vainqueur ramasse le pot' });
  let buf = null;
  try { if (_img?.genererPlateau) buf = await _img.genererPlateau(_imgState(t)); } catch { buf = null; }
  if (buf) {
    e.setImage('attachment://dominos.png');
    e.setDescription(_lignesStatut(t).join('\n').slice(0, 4000));
    return { content: _contentLigne(t), embeds: [e], components: _components(t), files: [new AttachmentBuilder(buf, { name: 'dominos.png' })] };
  }
  e.setDescription(_lignesTexte(t).concat(['─────────────────────────────']).concat(_lignesStatut(t)).join('\n').slice(0, 4000));
  return { content: _contentLigne(t), embeds: [e], components: _components(t), files: [] };
}

async function _refresh(t) {
  try {
    if (t.msg) { const p = await _screen(t); await t.msg.edit({ ...p, attachments: [], allowedMentions: { parse: [] } }); }
    const _cur = (t.joueurs || [])[t.tourIdx];
    await _notif.majPingTour?.(t, t.msg?.channel, (t.phase === 'jeu') ? _cur?.userId : null);
  } catch (e) { console.log('⚠️ dom refresh:', e.message); }
}

// Image (ou texte) de la main privée d'un joueur → réponse éphémère.
async function _peekPayload(t, j) {
  const tiles = j.main.map(tile => ({ a: tile.a, b: tile.b, jouable: t.gauche == null ? true : (_peutRaccorder(tile, t.gauche) || _peutRaccorder(tile, t.droite)) }));
  let buf = null;
  try { if (_img?.genererMain) buf = await _img.genererMain({ nom: j.nom, tiles, gauche: t.gauche, droite: t.droite }); } catch { buf = null; }
  if (buf) {
    const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('👁️ Votre main').setImage('attachment://main.png');
    return { embeds: [e], files: [new AttachmentBuilder(buf, { name: 'main.png' })], flags: MessageFlags.Ephemeral };
  }
  const txt = tiles.length ? tiles.map(x => _fmtTuile(x) + (x.jouable ? '✅' : '')).join(' ') : '*(main vide)*';
  return { content: '👁️ **Votre main** (✅ = jouable) :\n' + txt, flags: MessageFlags.Ephemeral };
}

// Menu de sélection des poses possibles pour le joueur courant.
function _menuPose(opts) {
  const menu = new StringSelectMenuBuilder().setCustomId('dom_pick').setPlaceholder('Choisissez la tuile et l\'extrémité');
  const vus = new Set();
  for (const o of opts) {
    const key = o.idx + ':' + o.cote;
    if (vus.has(key)) continue; vus.add(key);
    const label = _fmtTuile(o.tile) + ' → extrémité ' + o.cote;
    menu.addOptions({ label: label.slice(0, 100), value: key });
    if (menu.options.length >= 25) break;
  }
  return new ActionRowBuilder().addComponents(menu);
}

// ─── Panneau d'ouverture ───
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🁢 SALOON — TABLE DE DOMINOS')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   DOMINOS  ·  DOUBLE-SIX      ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Tirez une chaise, l\'ami. On aligne les os sur le bois — 28 tuiles, deux extrémités, pas de maison pour tricher.*',
      '',
      '🁫 **Dominos bloqués** — raccordez vos tuiles aux extrémités ouvertes. Le premier à vider sa main rafle le pot ; en cas de blocage, c\'est le plus petit total qui gagne.',
      '',
      '👉 **Ouvrir une table** ci-dessous : vous en devenez l\'**hôte**. Les autres rejoignent avec leur ante, puis la partie commence.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('dom_open').setLabel('Ouvrir une table de Dominos').setEmoji('🁢').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}

async function installerPanelDominos(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('TABLE DE DOMINOS');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ dom panel:', e.message); return null; }
}

// ─── Routeur d'interactions ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table (depuis le panneau)
    if (interaction.isButton() && id === 'dom_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) { await interaction.reply({ content: '🁢 Une table est déjà ouverte dans ce salon. Rejoins-la un peu plus haut !', flags: eph }); return true; }
      await interaction.deferReply({ flags: eph });
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(await _screen(t)).catch(() => null);
      if (!msg) { await interaction.editReply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).' }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.editReply({ content: '🁢 Table ouverte — tu en es l\'**hôte**. Rejoins 👇 puis clique **Distribuer** quand tout le monde a misé (min. ' + MIN_JOUEURS + ' joueurs).' });
      return true;
    }

    // À partir d'ici il faut une table active
    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit() || interaction.isStringSelectMenu()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🁢.', flags: eph }).catch(() => {}); } return true; }

    // Rejoindre → modal d'ante
    if (interaction.isButton() && (id === 'dom_join' || id === 'dom_mise')) {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une partie est en cours — (re)mise à la fin de la manche.', flags: eph }); return true; }
      const _dj = _joueur(t, interaction.user.id);
      if (id === 'dom_mise' && !_dj) { await interaction.reply({ content: 'Rejoins d\'abord (🪑) pour miser ton ante.', flags: eph }); return true; }
      if (!_dj && t.joueurs.length >= MAX_JOUEURS) { await interaction.reply({ content: '🈵 La table est complète (' + MAX_JOUEURS + ' joueurs).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('dom_join_modal').setTitle(_dj ? '💵 Changer mon ante' : '🪑 Rejoindre la table')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('ante').setLabel('Votre ante (en $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setValue(_dj ? String(_dj.ante) : '').setPlaceholder('Ex : 20')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'dom_join_modal') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Partie en cours, patiente.', flags: eph }); return true; }
      let ante = parseInt((interaction.fields.getTextInputValue('ante') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(ante) || ante < ANTE_MIN) ante = ANTE_MIN;
      if (ante > ANTE_MAX) ante = ANTE_MAX;
      let j = _joueur(t, interaction.user.id);
      if (j) { j.ante = ante; }
      else {
        if (t.joueurs.length >= MAX_JOUEURS) { await interaction.reply({ content: '🈵 Table complète.', flags: eph }); return true; }
        j = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, main: [], ante, net: null };
        t.joueurs.push(j);
      }
      await interaction.reply({ content: '✅ Tu es à la table, ante réglé à **' + _money(ante) + '**. Bonne chance !', flags: eph });
      await _refresh(t); return true;
    }

    // Se lever
    if (interaction.isButton() && id === 'dom_leave') {
      if (t.phase === 'jeu' && _joueur(t, interaction.user.id)) { await interaction.reply({ content: '⏳ Impossible de quitter en pleine partie — termine la manche.', flags: eph }); return true; }
      const idx = t.joueurs.findIndex(j => j.userId === interaction.user.id);
      if (idx < 0) { await interaction.reply({ content: 'Tu n\'es pas à cette table.', flags: eph }); return true; }
      const solde = t.soldes[t.joueurs[idx].userId] || 0;
      t.joueurs.splice(idx, 1);
      await interaction.reply({ content: '🚪 Tu quittes la table. Bilan de la soirée : **' + _money(solde) + '** de jetons.', flags: eph });
      await _refresh(t); return true;
    }

    // Distribuer (hôte)
    if (interaction.isButton() && id === 'dom_deal') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut distribuer.', flags: eph }); return true; }
      if (t.phase === 'jeu') { await interaction.reply({ content: 'Une partie est déjà en cours.', flags: eph }); return true; }
      if (t.joueurs.length < MIN_JOUEURS) { await interaction.reply({ content: 'Il faut au moins ' + MIN_JOUEURS + ' joueurs.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _distribuer(t);
      try { _voix.jouer?.(interaction.member?.voice?.channel, 'tuiles'); } catch {}
      await _refresh(t); return true;
    }

    // Voir ma main (info cachée, éphémère) — accessible à tout joueur assis
    if (interaction.isButton() && id === 'dom_peek') {
      const j = _joueur(t, interaction.user.id);
      if (!j) { await interaction.reply({ content: 'Tu n\'es pas à cette table.', flags: eph }); return true; }
      await interaction.deferReply({ flags: eph }); // accuse réception avant de générer l'image
      const _pp = await _peekPayload(t, j); delete _pp.flags;
      await interaction.editReply(_pp); return true;
    }

    // Jouer une tuile → menu de sélection (joueur courant uniquement)
    if (interaction.isButton() && id === 'dom_play') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune partie en cours.', flags: eph }); return true; }
      const j = t.joueurs[t.tourIdx];
      if (!j || j.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + (j ? j.nom : '—') + '** de jouer.', flags: eph }); return true; }
      const opts = _optionsJouables(j.main, t.gauche, t.droite);
      if (!opts.length) { await interaction.reply({ content: '🚫 Aucune tuile jouable. **Pioche** (si la pioche n\'est pas vide) ou **Passe**.', flags: eph }); return true; }
      await interaction.reply({ content: '🀱 Choisis ta pose :', components: [_menuPose(opts)], flags: eph }); return true;
    }
    // Sélection dans le menu de pose
    if (interaction.isStringSelectMenu() && id === 'dom_pick') {
      if (t.phase !== 'jeu') { await interaction.update({ content: 'Partie terminée.', components: [] }).catch(() => {}); return true; }
      const j = t.joueurs[t.tourIdx];
      if (!j || j.userId !== interaction.user.id) { await interaction.update({ content: '⏳ Ce n\'est plus ton tour.', components: [] }).catch(() => {}); return true; }
      const [idxStr, cote] = (interaction.values[0] || '').split(':');
      const idx = parseInt(idxStr, 10);
      const tile = j.main[idx];
      if (!tile) { await interaction.update({ content: 'Tuile introuvable — réessaie.', components: [] }).catch(() => {}); return true; }
      const ok = _poserTuile(t, j.main, idx, cote);
      if (!ok) { await interaction.update({ content: '🚫 Pose invalide (les pips ne correspondent pas).', components: [] }).catch(() => {}); return true; }
      t.passesConsec = 0;
      t.ambiance = j.nom + ' joue ' + _fmtTuile(tile) + '. ' + _pick(_phrasesJoue);
      await interaction.update({ content: '✅ Tu poses ' + _fmtTuile(tile) + ' sur l\'extrémité ' + cote + '.', components: [] }).catch(() => {});
      _apresCoup(t);
      await _refresh(t); return true;
    }

    // Piocher (joueur courant, tant qu'il ne peut pas jouer)
    if (interaction.isButton() && id === 'dom_draw') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune partie en cours.', flags: eph }); return true; }
      const j = t.joueurs[t.tourIdx];
      if (!j || j.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour.', flags: eph }); return true; }
      if (_peutJouerMain(j.main, t.gauche, t.droite)) { await interaction.reply({ content: '✋ Tu as déjà une tuile jouable — clique **Jouer une tuile**.', flags: eph }); return true; }
      if (t.pioche.length === 0) { await interaction.reply({ content: '🂠 La pioche est vide — tu dois **Passer**.', flags: eph }); return true; }
      const pige = t.pioche.pop();
      j.main.push(pige);
      _armer(t); // le joueur garde la main : on réarme le timer
      await interaction.reply({ content: '🂠 Tu piges ' + _fmtTuile(pige) + '.' + (_peutRaccorder(pige, t.gauche) || _peutRaccorder(pige, t.droite) ? ' Elle est jouable !' : ' Toujours rien — repioche ou passe.'), flags: eph });
      await _refresh(t); return true;
    }

    // Passer (seulement si rien à jouer et pioche vide)
    if (interaction.isButton() && id === 'dom_pass') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune partie en cours.', flags: eph }); return true; }
      const j = t.joueurs[t.tourIdx];
      if (!j || j.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour.', flags: eph }); return true; }
      if (_peutJouerMain(j.main, t.gauche, t.droite)) { await interaction.reply({ content: '✋ Tu peux jouer — impossible de passer.', flags: eph }); return true; }
      if (t.pioche.length > 0) { await interaction.reply({ content: '🂠 Il reste des tuiles dans la pioche — tu dois **Piocher** d\'abord.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      t.ambiance = j.nom + ' passe son tour.';
      _passer(t);
      await _refresh(t); return true;
    }

    // Fermer la table (hôte)
    if (interaction.isButton() && id === 'dom_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      const bilan = Object.keys(t.soldes).length
        ? Object.entries(t.soldes).map(([uid, n]) => '• <@' + uid + '> : ' + _money(n)).join('\n')
        : '';
      const e = new EmbedBuilder().setColor(0x8a6d3b).setTitle('🁢 Table fermée')
        .setDescription('On ramasse les os. Merci d\'avoir joué au saloon.' + (bilan ? '\n\n**Bilan des jetons :**\n' + bilan : ''))
        .setFooter({ text: 'Iron Wolf Company · Saloon' });
      try { await t.msg?.edit({ embeds: [e], components: [], files: [], attachments: [] }); } catch {}
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    // Comment jouer (règles, avant de lancer)
    if (interaction.isButton() && id === 'dom_regles') {
      await interaction.reply({ content: _REGLES.join('\n'), flags: eph });
      return true;
    }
    // Emote RP à coller en jeu (anti-AFK)
    if (interaction.isButton() && id === 'dom_emote') {
      const j = _joueur(t, interaction.user.id);
      const lignes = _emotePerso(t, j) + '\n' + _pick(_EMOTES_SCENE);
      await interaction.reply({ content: '🎭 **Reste dans la scène !** Colle une de ces lignes **en jeu** (RedM) pour ne pas passer pour AFK :\n```\n' + lignes + '\n```\n*Astuce : garde le jeu en fenêtre, alterne vite, et remets une émote à chaque tuile posée.*', flags: eph });
      return true;
    }
    // Compteur de sous du saloon (persistant)
    // Réplique à DIRE À VOIX HAUTE en jeu (ambiance IA)
    if (interaction.isButton() && id === 'dom_voix') {
      await interaction.deferReply({ flags: eph });
      const _arr = t.joueurs || t.sieges || [];
      const _cur = _arr[t.tourIdx];
      const _role = _estHote(t, interaction) ? 'croupier' : 'joueur';
      const _sit = (_cur && _cur.userId === interaction.user.id) ? 'tour' : 'general';
      const _ligne = await _ambiance.repliqueVocale?.({ jeu: 'dominos', role: _role, situation: _sit }) || '';
      await interaction.editReply({ content: '🎙️ **À dire à voix haute (en jeu)** :\n> ' + _ligne + '\n\n*Dis-le au micro pour animer la table — pas besoin de le taper.*' });
      return true;
    }
    if (interaction.isButton() && id === 'dom_sous') {
      const total = _sous(interaction.user.id);
      const j = _joueur(t, interaction.user.id);
      const sess = j ? (t.soldes[interaction.user.id] || 0) : 0;
      const top = casino.classement ? casino.classement(3) : [];
      const topTxt = top.length ? '\n\n🏆 **Gros joueurs du saloon**\n' + top.map(([u, n], i) => (i + 1) + '. <@' + u + '> — ' + _money(n)).join('\n') : '';
      await interaction.reply({ content: '💰 **Tes sous au saloon : ' + _money(total) + '**' + (j ? '\n*(à cette table : ' + _money(sess) + ')*' : '') + topTxt, flags: eph, allowedMentions: { parse: [] } });
      return true;
    }

    return true; // customId dom_* pris en charge
  } catch (e) {
    console.log('❌ dominos routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de dominos.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelDominos,
  _test: { _construireSet, _melanger, _totalPips, _peutRaccorder, _peutJouerMain, _optionsJouables, _poserTuile, _detecterBlocage, _resoudreManche, _apresCoup, _passer, _distribuer, _choisirOuvreur, _creerTable, tables },
};
