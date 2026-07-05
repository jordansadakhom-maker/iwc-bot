// ───────────────────────────────────────────────────────────────────────────
//  cinqdoigts.js — CINQ DOIGTS (Five Finger Fillet) immersif (saloon RP 1904).
//  Module 100 % ISOLÉ, préfixe fff_. N'écrit RIEN en base, aucune économie
//  réelle touchée : les mises du DUEL sont des JETONS de table, comptés par un
//  solde de soirée (gains/pertes), exactement comme le blackjack.
//
//  JEU DE NERFS / RÉFLEXE :
//   • 5 intervalles entre les doigts (boutons 1..5).
//   • Chaque MANCHE, le bot désigne un intervalle CIBLE (en lueur dorée sur
//     l'image) ; le joueur doit presser le BON bouton dans une FENÊTRE de temps.
//   • La fenêtre RÉTRÉCIT à chaque manche (départ ≈ 4000 ms, plancher ≈ 1300 ms,
//     tolérant à la latence Discord). Mauvais bouton OU trop lent = « PLANTÉ ».
//   • Mesure du temps côté serveur : Date.now() à la POSE (t.poseTs, fixé une
//     fois le plateau affiché) vs interaction.createdTimestamp au CLIC.
//   • SOLO : survivre au plus de manches → score. DUEL (2 joueurs, mise) :
//     alterné et SYMÉTRIQUE (les deux affrontent la même fenêtre au même niveau) ;
//     le premier planté perd le pot, l'autre gagne.
//   • Compétence pure ⇒ ÉQUITABLE, aucune maison.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
let _img = null; try { _img = require('./cinqdoigts-image'); } catch { _img = null; }

const PREFIXE = 'fff_';

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

// ─── Réglages du jeu ───
const N_INTERVALLES = 5;
const FENETRE_DEPART = 4000;   // ms — fenêtre de la 1re manche
const PLANCHER = 1300;         // ms — fenêtre minimale (tolérante à la latence)
const PAS = 250;               // ms retirés par NIVEAU de vitesse
const GRACE_LATENCE = 500;     // ms de tolérance ajoutés au JUGEMENT (latence Discord)
const TIMER_GRACE = 1000;      // ms de sursis avant l'auto-« planté » (>= GRACE_LATENCE)
const MISE_MIN = 1, MISE_MAX = 1000000;

// Fenêtre au niveau de vitesse « niv » (niv ≥ 1) : monotone décroissante, bornée
// au plancher. C'est une fonction PURE (le cœur testé de l'équilibrage/tempo).
function _fenetre(niv) {
  const n = Math.max(1, Math.floor(niv));
  return Math.max(PLANCHER, FENETRE_DEPART - (n - 1) * PAS);
}
// Niveau de vitesse pour une manche donnée. En DUEL (2 joueurs) les deux tours
// d'un même niveau partagent la MÊME fenêtre → duel symétrique/équitable.
function _niveau(manche, nJoueurs) { return Math.ceil(Math.max(1, manche) / Math.max(1, nJoueurs)); }

// Intervalle cible aléatoire (1..5).
function _cible() { return 1 + Math.floor(Math.random() * N_INTERVALLES); }

// Jugement PUR d'un coup. Succès ssi bon bouton ET dans la fenêtre.
//   { cible, bouton, dt (ms écoulés), fenetre } → { ok, cause }
//   cause: 'ok' | 'mauvais' (mauvais intervalle) | 'lent' (hors délai)
function _juger({ cible, bouton, dt, fenetre }) {
  if (Number(bouton) !== Number(cible)) return { ok: false, cause: 'mauvais' };
  if (Number(dt) > Number(fenetre)) return { ok: false, cause: 'lent' };
  return { ok: true, cause: 'ok' };
}

function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }

// ─── Ambiance ───
const _phrasesLance = ['« Pose la main, tends les nerfs. »', '« Le couteau ne pardonne pas l\'hésitation. »', '« Vite et juste, ou rien. »', '« La table retient son souffle… »'];
const _phrasesReussite = ['La lame frappe juste !', 'Plantée entre les doigts — sang-froid.', 'Impeccable, la main tremble à peine.', 'Le saloon retient un souffle.'];
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ─── État des tables (en mémoire, une par salon) ───
const tables = new Map(); // channelId -> table

function _nouvelleTable({ channelId, guildId, hoteId, hoteNom }) {
  return {
    channelId, guildId, hoteId, hoteNom,
    phase: 'lobby',        // 'lobby' | 'jeu'
    mode: null,            // null | 'solo' | 'duel'
    joueurs: [],           // { userId, nom, mise, score, vivant }
    mise: 0,               // enjeu commun du duel (jetons)
    manche: 0,             // nombre total de tours joués dans la partie en cours
    tourIdx: 0,
    cible: null,
    fenetre: FENETRE_DEPART,
    poseTs: 0,
    entaille: false,
    dernierResultat: '',
    ambiance: '',
    soldes: {},            // userId -> jetons de duel cumulés (gains/pertes)
    scores: {},            // userId -> meilleur score SOLO de la soirée
    msg: null,
    messageId: null,
    timer: null,
  };
}
function _creerTable(interaction) {
  return _nouvelleTable({
    channelId: interaction.channelId,
    guildId: interaction.guild?.id,
    hoteId: interaction.user.id,
    hoteNom: interaction.member?.displayName || interaction.user.username,
  });
}

function _joueur(t, uid) { return t.joueurs.find(j => j.userId === uid); }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }

// ─── Déroulé d'une manche ───
// _prep : choisit la cible et la fenêtre de la prochaine manche (sans démarrer le
// chrono). _lancer : fixe poseTs (une fois le plateau affiché) et arme le timer.
function _prep(t) {
  t.manche++;
  t.cible = _cible();
  t.fenetre = _fenetre(_niveau(t.manche, t.joueurs.length));
  t.entaille = false;
  t.ambiance = _pick(_phrasesLance);
}
function _lancer(t) {
  _clearTimer(t);
  t.poseTs = Date.now();
  t.timer = setTimeout(async () => {
    try {
      if (t.phase !== 'jeu') return;
      const j = t.joueurs[t.tourIdx];
      if (!j) return;
      // Auto-action SÛRE : le joueur actif n'a pas planté à temps → PLANTÉ (lenteur).
      _resoudrePlante(t, j.userId, 'lent');
      await _refresh(t);
    } catch (e) { console.log('⚠️ fff timer:', e.message); }
  }, t.fenetre + TIMER_GRACE);
}

// Résout une réussite : score +1, puis manche suivante (tour alterné en duel).
function _reussite(t, j) {
  _clearTimer(t);
  j.score++;
  t.entaille = false;
  t.dernierResultat = '';
  if (t.mode === 'duel') t.tourIdx = (t.tourIdx + 1) % t.joueurs.length;
  _prep(t);
}

// Résout un « planté » (mauvais intervalle ou trop lent) → fin de partie.
// Renvoie { perdantId, gagnantId (duel), score (solo), cause }.
function _resoudrePlante(t, perdantId, cause) {
  _clearTimer(t);
  t.entaille = true;
  const motif = cause === 'lent' ? 'trop lent' : 'mauvais intervalle';
  let info = { perdantId, cause };
  if (t.mode === 'duel' && t.joueurs.length === 2) {
    const perdant = _joueur(t, perdantId) || t.joueurs[t.tourIdx];
    const gagnant = t.joueurs.find(j => j.userId !== perdant.userId);
    const mise = t.mise || 0;
    t.soldes[perdant.userId] = (t.soldes[perdant.userId] || 0) - mise;
    t.soldes[gagnant.userId] = (t.soldes[gagnant.userId] || 0) + mise;
    t.dernierResultat = perdant.nom + ' s\'est PLANTÉ (' + motif + ') — ' + gagnant.nom + ' rafle le pot (+' + _money(mise) + ').';
    info.gagnantId = gagnant.userId;
    info.perdantId = perdant.userId;
  } else {
    const j = _joueur(t, perdantId) || t.joueurs[0];
    const sc = j ? j.score : 0;
    if (j) t.scores[j.userId] = Math.max(t.scores[j.userId] || 0, sc);
    t.dernierResultat = (j ? j.nom : 'Le joueur') + ' s\'est PLANTÉ (' + motif + ') après ' + sc + ' manche(s). Score : ' + sc + '.';
    info.score = sc;
  }
  t.phase = 'lobby';
  t.mode = null;
  return info;
}

// ─── Rendu du plateau ───
function _imgState(t) {
  const actif = t.phase === 'jeu' ? t.joueurs[t.tourIdx] : null;
  let sousTitre;
  if (t.phase === 'jeu') {
    sousTitre = 'À ' + (actif ? actif.nom : '—') + ' de jouer — plante le couteau dans l\'intervalle en LUEUR (' + (t.fenetre / 1000).toFixed(1) + ' s)';
  } else if (t.dernierResultat) {
    sousTitre = 'Partie terminée — l\'hôte peut relancer (Solo/Duel)';
  } else {
    sousTitre = 'Jeu de nerfs : choisis Solo, ou lance un Duel à la mise';
  }
  return {
    sousTitre,
    mode: t.mode,
    cible: t.phase === 'jeu' ? t.cible : null,
    fenetre: t.phase === 'jeu' ? t.fenetre : null,
    manche: t.phase === 'jeu' ? t.manche : 0,
    entaille: !!t.entaille,
    actifNom: actif ? actif.nom : null,
    resultat: t.phase !== 'jeu' ? (t.dernierResultat || '') : '',
    joueurs: t.joueurs.map((j, i) => ({
      nom: j.nom,
      mise: t.mode === 'duel' ? _money(j.mise) : null,
      score: j.score,
      actif: t.phase === 'jeu' && i === t.tourIdx,
    })),
  };
}
// Repli TEXTE si l'image ne se génère pas.
function _lignesTexte(t) {
  const L = [];
  if (t.phase === 'jeu') {
    const actif = t.joueurs[t.tourIdx];
    L.push('🎯 **Intervalle CIBLE : n°' + t.cible + '** — presse le bon bouton !');
    L.push('⏱️ Fenêtre : **' + (t.fenetre / 1000).toFixed(1) + ' s**   ·   Manche **' + t.manche + '**');
    L.push('➡️ À **' + (actif ? actif.nom : '—') + '** de jouer.');
  } else if (t.dernierResultat) {
    L.push('🩸 ' + t.dernierResultat);
    L.push('👉 L\'hôte peut relancer une partie (**Solo** ou **Duel**).');
  } else {
    L.push('🔪 **Cinq Doigts** — jeu de nerfs. Presse le bon intervalle (1..5) dans le temps imparti.');
    L.push('👉 **Solo** pour un run, ou **Duel** (2 joueurs, mise) pour l\'affrontement.');
  }
  L.push('─────────────────────────────');
  if (!t.joueurs.length) L.push('*Personne au couteau.*');
  else t.joueurs.forEach((j, i) => {
    const a = (t.phase === 'jeu' && i === t.tourIdx) ? ' · **à lui**' : '';
    L.push('🖐️ **' + j.nom + '** — score ' + j.score + (t.mode === 'duel' ? ' · mise ' + _money(j.mise) : '') + a);
  });
  const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => { const j = _joueur(t, u); return '• ' + (j ? j.nom : 'Parti') + ' : ' + _money(n); });
  if (sold.length) L.push('💰 **Jetons de la soirée**\n' + sold.join('\n'));
  return L;
}

function _components(t) {
  const rows = [];
  if (t.phase === 'jeu') {
    rows.push(new ActionRowBuilder().addComponents(
      ...Array.from({ length: N_INTERVALLES }, (_, i) =>
        new ButtonBuilder().setCustomId('fff_' + (i + 1)).setLabel(String(i + 1)).setStyle(ButtonStyle.Secondary)),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fff_peek').setLabel('Lire mes nerfs').setEmoji('👀').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('fff_close').setLabel('Ranger le couteau').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else {
    const duelPret = t.mode === 'duel' && t.joueurs.length === 2;
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fff_solo').setLabel('Jouer en solo').setEmoji('🖐️').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('fff_duel_join').setLabel('Rejoindre le duel').setEmoji('⚔️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('fff_leave').setLabel('Se retirer').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('fff_start').setLabel('Lancer le duel').setEmoji('🔪').setStyle(ButtonStyle.Success).setDisabled(!duelPret),
      new ButtonBuilder().setCustomId('fff_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  }
  return rows;
}

async function _screen(t) {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🔪  CINQ DOIGTS  ·  FIVE FINGER FILLET')
    .setFooter({ text: 'Hôte : ' + t.hoteNom + '  ·  Jeu de nerfs — vite et juste  ·  Duel symétrique, aucune maison' });
  let buf = null;
  try { if (_img?.genererTable) buf = await _img.genererTable(_imgState(t)); } catch { buf = null; }
  if (buf) {
    e.setImage('attachment://cinqdoigts.png');
    e.setDescription((t.ambiance ? '💬 *' + t.ambiance + '*' : '​').slice(0, 4000));
    return { embeds: [e], components: _components(t), files: [new AttachmentBuilder(buf, { name: 'cinqdoigts.png' })] };
  }
  e.setDescription(_lignesTexte(t).join('\n').slice(0, 4000));
  return { embeds: [e], components: _components(t), files: [] };
}

async function _refresh(t) { try { if (t.msg) { const p = await _screen(t); await t.msg.edit({ ...p, attachments: [] }); } } catch (e) { console.log('⚠️ fff refresh:', e.message); } }

// ─── Panneau d'ouverture (installable dans le salon casino) ───
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🔪 SALOON — CINQ DOIGTS')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   CINQ DOIGTS · JEU DE NERFS  ║',
      '╚═══════════════════════════════╝',
      '```',
      '*La main à plat sur la table, le couteau qui danse entre les doigts. Un intervalle s\'illumine — plante au bon endroit, avant que le tempo ne t\'échappe.*',
      '',
      '🖐️ **Cinq Doigts** — presse le **bon intervalle (1..5)** dans la fenêtre de temps. Elle rétrécit à chaque manche. Mauvais choix ou trop lent : **PLANTÉ**.',
      '',
      '⚔️ **Solo** : survis au plus de manches.  **Duel** (2 joueurs, mise) : le premier planté perd le pot.',
      '',
      '👉 **Ouvrir une table** ci-dessous : tu en deviens l\'**hôte**.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('fff_open').setLabel('Ouvrir une table de Cinq Doigts').setEmoji('🔪').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}

async function installerPanelCinqDoigts(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('CINQ DOIGTS');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ fff panel:', e.message); return null; }
}

// ─── Routeur d'interactions ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table (depuis le panneau)
    if (interaction.isButton() && id === 'fff_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) { await interaction.reply({ content: '🔪 Une table de Cinq Doigts est déjà ouverte dans ce salon. Rejoins-la plus haut !', flags: eph }); return true; }
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(await _screen(t)).catch(() => null);
      if (!msg) { await interaction.reply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).', flags: eph }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.reply({ content: '🔪 Table ouverte — tu en es l\'**hôte**. Lance un **Solo**, ou monte un **Duel** 👇', flags: eph });
      return true;
    }

    // À partir d'ici, il faut une table active dans ce salon.
    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🔪.', flags: eph }).catch(() => {}); } return true; }

    // ── SOLO : démarrage immédiat par le joueur qui clique ──
    if (interaction.isButton() && id === 'fff_solo') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une partie est déjà en cours — attends la fin.', flags: eph }); return true; }
      const nom = interaction.member?.displayName || interaction.user.username;
      t.mode = 'solo';
      t.joueurs = [{ userId: interaction.user.id, nom, mise: 0, score: 0, vivant: true }];
      t.mise = 0; t.tourIdx = 0; t.manche = 0; t.dernierResultat = ''; t.entaille = false;
      t.phase = 'jeu';
      await interaction.deferUpdate().catch(() => {});
      _prep(t);
      await _refresh(t);
      _lancer(t);
      return true;
    }

    // ── DUEL : rejoindre (modal de mise) ──
    if (interaction.isButton() && id === 'fff_duel_join') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une partie est en cours — patiente.', flags: eph }); return true; }
      if (t.mode === 'solo') { await interaction.reply({ content: 'Une partie solo est prête. Relance une partie pour passer en duel.', flags: eph }); return true; }
      if (!_joueur(t, interaction.user.id) && t.joueurs.length >= 2) { await interaction.reply({ content: '⚔️ Le duel est déjà complet (2 bretteurs).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('fff_duel_modal').setTitle('⚔️ Rejoindre le duel')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mise').setLabel('Ta mise en jetons (en $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setPlaceholder('Ex : 50')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'fff_duel_modal') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Partie en cours, patiente.', flags: eph }); return true; }
      let mise = parseInt((interaction.fields.getTextInputValue('mise') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(mise) || mise < MISE_MIN) mise = MISE_MIN;
      if (mise > MISE_MAX) mise = MISE_MAX;
      t.mode = 'duel';
      let j = _joueur(t, interaction.user.id);
      if (j) { j.mise = mise; }
      else {
        if (t.joueurs.length >= 2) { await interaction.reply({ content: '⚔️ Duel complet.', flags: eph }); return true; }
        j = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, mise, score: 0, vivant: true };
        t.joueurs.push(j);
      }
      // Enjeu commun = plus petite des mises (personne ne risque plus qu'il n'a annoncé).
      t.mise = t.joueurs.length ? Math.min(...t.joueurs.map(x => x.mise)) : mise;
      await interaction.reply({ content: '⚔️ Tu entres dans le duel, mise **' + _money(mise) + '**.' + (t.joueurs.length < 2 ? ' En attente d\'un adversaire…' : ' L\'hôte peut lancer !'), flags: eph });
      await _refresh(t); return true;
    }

    // ── Lancer le duel (hôte) ──
    if (interaction.isButton() && id === 'fff_start') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut lancer le duel.', flags: eph }); return true; }
      if (t.phase === 'jeu') { await interaction.reply({ content: 'Une partie est déjà en cours.', flags: eph }); return true; }
      if (t.mode !== 'duel' || t.joueurs.length !== 2) { await interaction.reply({ content: '⚔️ Il faut **2 bretteurs** inscrits au duel pour lancer.', flags: eph }); return true; }
      t.mise = Math.min(...t.joueurs.map(x => x.mise));
      for (const j of t.joueurs) { j.score = 0; j.vivant = true; }
      t.manche = 0; t.tourIdx = 0; t.dernierResultat = ''; t.entaille = false;
      t.phase = 'jeu';
      await interaction.deferUpdate().catch(() => {});
      _prep(t);
      await _refresh(t);
      _lancer(t);
      return true;
    }

    // ── Se retirer (lobby) ──
    if (interaction.isButton() && id === 'fff_leave') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ On ne quitte pas une lame en plein vol — finis la partie.', flags: eph }); return true; }
      const idx = t.joueurs.findIndex(j => j.userId === interaction.user.id);
      if (idx < 0) { await interaction.reply({ content: 'Tu n\'es pas inscrit à cette table.', flags: eph }); return true; }
      t.joueurs.splice(idx, 1);
      if (!t.joueurs.length) t.mode = null;
      await interaction.reply({ content: '🚪 Tu ranges ta main. À la prochaine.', flags: eph });
      await _refresh(t); return true;
    }

    // ── Lire mes nerfs (peek, éphémère) ──
    if (interaction.isButton() && id === 'fff_peek') {
      const lignes = ['🔪 **Ta lecture des nerfs**'];
      if (t.phase === 'jeu') {
        lignes.push('🎯 Intervalle CIBLE : **n°' + t.cible + '** (celui en lueur dorée).');
        lignes.push('⏱️ Fenêtre : **' + (t.fenetre / 1000).toFixed(1) + ' s** — plante vite et juste.');
        const actif = t.joueurs[t.tourIdx];
        lignes.push(actif && actif.userId === interaction.user.id ? '➡️ C\'est **TON** tour, vas-y !' : '⏳ Attends ton tour.');
      } else { lignes.push('Aucune manche en cours pour l\'instant.'); }
      const meilleur = t.scores[interaction.user.id] || 0;
      if (meilleur) lignes.push('🏅 Ton meilleur score solo de la soirée : **' + meilleur + '** manche(s).');
      let buf = null;
      try { if (_img?.genererPeek) buf = await _img.genererPeek(_imgState(t)); } catch { buf = null; }
      if (buf) await interaction.reply({ content: lignes.join('\n'), files: [new AttachmentBuilder(buf, { name: 'nerfs.png' })], flags: eph });
      else await interaction.reply({ content: lignes.join('\n'), flags: eph });
      return true;
    }

    // ── Coups de couteau (fff_1 .. fff_5) ──
    if (interaction.isButton() && /^fff_[1-5]$/.test(id)) {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const j = t.joueurs[t.tourIdx];
      if (!j) { await interaction.reply({ content: 'Aucun joueur à jouer.', flags: eph }); return true; }
      if (j.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + j.nom + '** de tenter le coup.', flags: eph }); return true; }
      const bouton = parseInt(id.slice(PREFIXE.length), 10);
      const dt = (interaction.createdTimestamp || Date.now()) - t.poseTs;
      // Jugement tolérant à la latence Discord : fenêtre + GRACE_LATENCE.
      const verdict = _juger({ cible: t.cible, bouton, dt, fenetre: t.fenetre + GRACE_LATENCE });
      _clearTimer(t);
      await interaction.deferUpdate().catch(() => {});
      if (verdict.ok) {
        _reussite(t, j);
        t.ambiance = _pick(_phrasesReussite);
        await _refresh(t);
        _lancer(t);
      } else {
        _resoudrePlante(t, j.userId, verdict.cause);
        await _refresh(t);
      }
      return true;
    }

    // ── Fermer la table (hôte) ──
    if (interaction.isButton() && id === 'fff_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      const bilan = Object.entries(t.soldes).filter(([, n]) => n).map(([uid, n]) => '• <@' + uid + '> : ' + _money(n)).join('\n');
      const e = new EmbedBuilder().setColor(0x8a6d3b).setTitle('🔪 Table de Cinq Doigts fermée')
        .setDescription('On essuie la lame, on range les couteaux. Merci d\'avoir joué.' + (bilan ? '\n\n**Bilan des jetons de duel :**\n' + bilan : ''))
        .setFooter({ text: 'Iron Wolf Company · Saloon' });
      try { await t.msg?.edit({ embeds: [e], components: [], files: [], attachments: [] }); } catch {}
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    return true; // customId fff_* pris en charge
  } catch (e) {
    console.log('❌ cinqdoigts routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de Cinq Doigts.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelCinqDoigts,
  _test: { _fenetre, _niveau, _juger, _cible, _prep, _reussite, _resoudrePlante, _nouvelleTable, _creerTable, tables, FENETRE_DEPART, PLANCHER, PAS, N_INTERVALLES },
};
