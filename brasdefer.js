// ───────────────────────────────────────────────────────────────────────────
//  brasdefer.js — BRAS DE FER (arm-wrestling) immersif du saloon RP 1904.
//  Module 100 % ISOLÉ, préfixe brf_. N'écrit RIEN en base de jeu réelle : les
//  mises du DUEL sont des JETONS de table, comptés par casino-banque exactement
//  comme le blackjack / cinq doigts. Aucune économie IWC/Confrérie touchée.
//
//  PRINCIPE :
//   • Un curseur part du centre. joueur[0] (à gauche) pousse le curseur vers la
//     DROITE, joueur[1] / le PNJ (à droite) le pousse vers la GAUCHE. Coller le
//     curseur au bord de l'adversaire = on lui plaque le bras → victoire.
//   • Chaque manche, chaque joueur presse « 💪 POUSSER » : on tire une FORCE
//     (aléatoire + coup de rein critique). Le curseur bouge de (forceA − forceB).
//   • Sursaut de survie : quand un joueur est au bord de la défaite, il gagne un
//     petit bonus → parties disputées, pas de K.O. instantané.
//   • SOLO : contre un PNJ (difficulté variable, comme demandé : parfois facile,
//     parfois costaud). DUEL (2 joueurs, mise) : le pot va au vainqueur.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');
let casino = {}; try { casino = require('./casino-banque'); } catch { casino = {}; }

const PREFIXE = 'brf_';
const MISE_MIN = 1, MISE_MAX = 100;   // plafond bas (100 $) — cohérent avec le blackjack
const LIMITE = 5;                      // le curseur va de −LIMITE à +LIMITE (bar courte = partie nerveuse)
const MAX_MANCHES = 11;                // garde-fou : au-delà, l'avantage tranche (jamais de partie infinie)
const ATTENTE = 30000;                 // ms : si l'adversaire ne pousse pas, il « flanche »

const tables = new Map();              // channelId -> table

const _sous = uid => (casino.solde ? casino.solde(uid) : 0);
function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

// ── PNJ du solo : difficulté variable pour de la variété ──
// L'avantage se joue sur le COUP DE REIN (crit) et un petit bonus PROBABILISTE
// (edge) — jamais un +1 garanti chaque manche (qui rendrait la partie ingagnable).
const PNJS = [
  { key: 'gamin',   nom: 'Gamin des rues', emoji: '🧒', baseMax: 3, crit: 0.08, edge: 0.00 }, // facile
  { key: 'bucheron',nom: 'Bûcheron',       emoji: '🪓', baseMax: 4, crit: 0.15, edge: 0.00 }, // équilibré
  { key: 'forgeron',nom: 'Forgeron',        emoji: '🔨', baseMax: 4, crit: 0.22, edge: 0.20 }, // costaud
  { key: 'trappeur',nom: 'Vieux trappeur',  emoji: '🐻', baseMax: 4, crit: 0.28, edge: 0.35 }, // très dur
];
// Tirage pondéré : le costaud le plus fréquent, les extrêmes plus rares.
function _rollPNJ() { const r = Math.random(); if (r < 0.25) return PNJS[0]; if (r < 0.65) return PNJS[1]; if (r < 0.90) return PNJS[2]; return PNJS[3]; }

// ── Émotes RP à coller EN JEU (RedM) pour rester crédible pendant qu'on clique ──
const _EMOTES_LOBBY = [
  '/me pose son coude sur la table et ouvre grand la paume, défiant l\'autre du regard.',
  '/me crache dans sa main, saisit la poigne offerte et cale son coude sur le bois.',
  '/me roule l\'épaule, fait craquer sa nuque et empoigne la main de l\'adversaire.',
];
const _EMOTES_POUSSE = [
  '/me serre les dents, les veines du bras saillantes, et pousse de toutes ses forces.',
  '/me grogne sous l\'effort, le poignet tremblant, refusant de céder un pouce.',
  '/me arc-boute tout son corps, le front en sueur, et force sur la poigne adverse.',
];
const _EMOTES_GAGNE = [
  '/me plaque la main de l\'adversaire sur le bois dans un cri de triomphe.',
  '/me relâche la pression, souffle un grand coup et savoure sa victoire.',
];
const _EMOTES_PERDU = [
  '/me sent son poignet céder et lâche prise en grimaçant de douleur.',
  '/me repose son bras endolori, dépité, en secouant la main.',
];
function _emotePerso(t, uid) {
  if (t.phase === 'jeu') return _pick(_EMOTES_POUSSE);
  if (t.phase === 'fini') { const g = t.gagnantId; return g && g === uid ? _pick(_EMOTES_GAGNE) : (g ? _pick(_EMOTES_PERDU) : _pick(_EMOTES_LOBBY)); }
  return _pick(_EMOTES_LOBBY);
}

const _REGLES = [
  '📖 **BRAS DE FER — COMMENT JOUER**',
  '',
  '**But :** coller le curseur au **bord de l\'adversaire** pour lui plaquer le bras.',
  '',
  '**Chaque manche :** cliquez **💪 POUSSER**. On tire votre **force** (avec une chance de **coup de rein** ×critique). Le curseur bouge selon la différence de force entre les deux bras.',
  '',
  '**Sursaut de survie :** au bord de la défaite, vous poussez plus fort — les parties restent disputées.',
  '',
  '⚔️ **Solo** : contre un PNJ à la force variable (parfois facile, parfois costaud).',
  '💰 **Duel** (2 joueurs, mise en jetons) : le **pot va au vainqueur**. Mise max **100 $**.',
  '',
  '*Mises = jetons de table (soirée), aucune bourse réelle engagée.*',
].join('\n');

// ═══════════════════════════════════════════════════════════════
//  ÉTAT / LOGIQUE
// ═══════════════════════════════════════════════════════════════
function _nouvelleTable({ channelId, guildId, hoteId, hoteNom }) {
  return {
    channelId, guildId, hoteId, hoteNom,
    phase: 'lobby',        // 'lobby' | 'jeu' | 'fini'
    mode: null,            // null | 'solo' | 'duel'
    joueurs: [],           // { userId, nom }  (index 0 = gauche, index 1 = droite)
    pnj: null,             // en solo : { nom, emoji, bonus, crit }
    mise: 0,               // enjeu commun du duel (jetons)
    curseur: 0,            // −LIMITE (droite gagne) .. +LIMITE (gauche gagne)
    pending: {},           // userId -> force poussée cette manche (duel)
    manche: 0,
    dernier: '',           // résumé de la dernière manche
    ambiance: '',
    gagnantId: null,
    soldes: {},            // userId -> jetons de la soirée sur cette table
    msg: null, messageId: null,
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

// Force d'un bras : base 1..baseMax, coup de rein critique (+2), petit edge probabiliste.
// opt = { baseMax=4, crit=0.15, edge=0 }.
function _force(opt) {
  const o = opt || {};
  const baseMax = o.baseMax || 4;
  const crit = o.crit != null ? o.crit : 0.15;
  let f = 1 + Math.floor(Math.random() * baseMax);
  if (Math.random() < crit) f += 2;
  if (o.edge && Math.random() < o.edge) f += 1;
  return Math.max(0, f);
}

// Applique une manche à partir des forces gauche (fG, pousse +) et droite (fD, pousse −).
function _resoudreManche(t, fG, fD) {
  t.manche++;
  // Sursaut de survie PROBABILISTE : au tout dernier cran avant la défaite, une
  // chance de repousser d'un pouce (drame, sans jamais bloquer la partie).
  if (t.curseur <= -(LIMITE - 1) && Math.random() < 0.4) fG += 1;
  if (t.curseur >= (LIMITE - 1) && Math.random() < 0.4) fD += 1;
  const delta = fG - fD;
  t.curseur = Math.max(-LIMITE, Math.min(LIMITE, t.curseur + delta));
  const gN = t.joueurs[0]?.nom || 'Gauche';
  const dN = t.joueurs[1]?.nom || (t.pnj ? t.pnj.nom : 'Droite');
  if (delta > 0) t.dernier = `**${gN}** pousse fort (+${fG} / +${fD}) → le curseur glisse de **${delta}** vers ${dN}.`;
  else if (delta < 0) t.dernier = `**${dN}** reprend le dessus (+${fD} / +${fG}) → le curseur recule de **${-delta}**.`;
  else t.dernier = `Les deux bras se bloquent (+${fG} / +${fD}) — rien ne bouge !`;
}

// Verdict d'une manche : 0 (gauche gagne), 1 (droite gagne) ou null (ça continue).
// Au-delà de MAX_MANCHES, l'avantage tranche — jamais de partie infinie.
function _verifierFin(t) {
  if (t.curseur >= LIMITE) return 0;
  if (t.curseur <= -LIMITE) return 1;
  if (t.manche >= MAX_MANCHES) {
    if (t.curseur > 0) return 0;
    if (t.curseur < 0) return 1;
    return Math.random() < 0.5 ? 0 : 1;
  }
  return null;
}

// Crédite le pot et clôt la partie. gagnantIdx = 0 (gauche) ou 1 (droite).
function _finPartie(t, gagnantIdx) {
  _clearTimer(t);
  t.phase = 'fini';
  t.pending = {};
  if (t.mode === 'duel' && t.joueurs.length === 2 && t.mise > 0) {
    const g = t.joueurs[gagnantIdx], p = t.joueurs[1 - gagnantIdx];
    t.soldes[g.userId] = (t.soldes[g.userId] || 0) + t.mise;
    t.soldes[p.userId] = (t.soldes[p.userId] || 0) - t.mise;
    try { if (casino.crediterLot) casino.crediterLot([{ userId: g.userId, montant: t.mise }, { userId: p.userId, montant: -t.mise }]); } catch {}
    t.gagnantId = g.userId;
  } else {
    // solo : gagnantIdx 0 = joueur, 1 = PNJ
    t.gagnantId = gagnantIdx === 0 ? (t.joueurs[0]?.userId || null) : null;
  }
}

// ═══════════════════════════════════════════════════════════════
//  RENDU
// ═══════════════════════════════════════════════════════════════
function _barre(t) {
  const W = 2 * LIMITE + 1;                 // cases
  const idx = Math.max(0, Math.min(W - 1, LIMITE + t.curseur));
  let s = '';
  for (let i = 0; i < W; i++) s += i === idx ? '⬤' : (i === LIMITE ? '┊' : '─');
  return '├' + s + '┤';
}
function _screenPayload(t) {
  const gauche = t.joueurs[0];
  const droite = t.mode === 'solo' ? { nom: t.pnj?.nom || 'PNJ', emoji: t.pnj?.emoji || '🤜' } : t.joueurs[1];
  const nomG = gauche ? `💪 ${gauche.nom}` : '💪 —';
  const nomD = droite ? `${droite.emoji || '🤜'} ${droite.nom}` : '🤜 En attente…';

  const e = new EmbedBuilder().setColor(0x9B5523).setTitle('💪 BRAS DE FER');

  if (t.phase === 'lobby') {
    const lignes = [
      '*Coude sur la table, paume ouverte. Le premier à plaquer le bras de l\'autre rafle la mise.*',
      '',
      t.mode === 'duel'
        ? `⚔️ **Duel** — inscrits : ${t.joueurs.map(j => `**${j.nom}**`).join(' vs ') || '—'}${t.joueurs.length < 2 ? '\n*En attente d\'un second bras…*' : `\n💰 Enjeu : **${_money(Math.min(...t.joueurs.map(j => t.pending[j.userId] ?? j.mise ?? 0)) || t.mise)}** chacun.`}`
        : '👉 Lance un **Solo** (contre un PNJ) ou monte un **Duel** (2 joueurs, mise).',
    ];
    e.setDescription(lignes.join('\n')).setFooter({ text: `Hôte : ${t.hoteNom} · Saloon · mise max 100 $` });
    return { embeds: [e], components: _components(t) };
  }

  const bloc = [
    '```',
    ` ${nomG}`.padEnd(24) + `${nomD}`,
    '',
    ' ' + _barre(t),
    ' ' + '◀ ' + (gauche?.nom || 'Gauche') + ' gagne'.padEnd(2) + '   |   ' + (droite?.nom || 'Droite') + ' gagne ▶',
    '```',
  ].join('\n');

  const etat = [];
  if (t.dernier) etat.push('🎲 ' + t.dernier);
  if (t.phase === 'jeu') {
    if (t.mode === 'duel') {
      const attente = t.joueurs.filter(j => t.pending[j.userId] == null).map(j => `**${j.nom}**`);
      etat.push(attente.length ? `⏳ On attend la poussée de : ${attente.join(' et ')}` : '💥 Résolution…');
    } else {
      etat.push('💥 Presse **💪 POUSSER** pour forcer !');
    }
  }

  e.setDescription([bloc, '', etat.join('\n')].join('\n'));

  if (t.phase === 'fini') {
    const g = t.gagnantId;
    let txt;
    if (t.mode === 'duel') txt = `🏆 **${(_joueur(t, g)?.nom) || 'Le vainqueur'}** plaque le bras adverse et rafle **${_money(t.mise)}** !`;
    else txt = g ? `🏆 Tu terrasses **${t.pnj?.nom}** ! Bras de fer remporté.` : `😤 **${t.pnj?.nom}** a eu le dessus. La revanche t'attend.`;
    e.addFields({ name: '— Fin de la passe —', value: txt });
  }
  e.setFooter({ text: `Hôte : ${t.hoteNom} · manche ${t.manche} · Saloon` });
  return { embeds: [e], components: _components(t) };
}

function _components(t) {
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('brf_solo').setLabel('Solo (vs PNJ)').setEmoji('🤜').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('brf_join').setLabel('Duel — rejoindre').setEmoji('⚔️').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('brf_start').setLabel('Lancer le duel').setEmoji('▶️').setStyle(ButtonStyle.Secondary),
    ));
  } else if (t.phase === 'jeu') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('brf_push').setLabel('POUSSER').setEmoji('💪').setStyle(ButtonStyle.Danger),
    ));
  } else { // fini
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('brf_rejouer').setLabel('Rejouer').setEmoji('🔄').setStyle(ButtonStyle.Success),
    ));
  }
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('brf_regles').setLabel('Comment jouer').setEmoji('📖').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('brf_emote').setLabel('Emote RP').setEmoji('🎭').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('brf_sous').setLabel('Mes sous').setEmoji('💰').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('brf_close').setLabel('Fermer').setEmoji('🔒').setStyle(ButtonStyle.Secondary),
  ));
  return rows;
}

async function _refresh(t) {
  try { if (t.msg) await t.msg.edit(_screenPayload(t)); } catch (e) { console.log('⚠️ brf refresh:', e.message); }
}

// Duel : arme le délai d'attente de la poussée adverse.
function _armerAttente(t) {
  _clearTimer(t);
  t.timer = setTimeout(async () => {
    try {
      if (t.phase !== 'jeu' || t.mode !== 'duel') return;
      // le(s) joueur(s) qui n'a/ont pas poussé « flanche(nt) » : force 0
      const fG = t.pending[t.joueurs[0].userId] ?? 0;
      const fD = t.pending[t.joueurs[1].userId] ?? 0;
      t.pending = {};
      _resoudreManche(t, fG, fD);
      const w = _verifierFin(t);
      if (w != null) _finPartie(t, w); else _armerAttente(t);
      await _refresh(t);
    } catch (e) { console.log('⚠️ brf timer:', e.message); }
  }, ATTENTE);
}

// ═══════════════════════════════════════════════════════════════
//  PANNEAU AUTONOME (optionnel — le Saloon principal l'inclut déjà)
// ═══════════════════════════════════════════════════════════════
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('💪 SALOON — BRAS DE FER')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║   BRAS DE FER · ÉPREUVE DE FORCE ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Coude sur la table, la poigne se referme. Pousse le curseur jusqu\'au bord adverse pour lui plaquer le bras.*',
      '',
      '💪 **Solo** : contre un PNJ à la force variable. **Duel** (2 joueurs, mise) : le pot va au vainqueur.',
      '',
      '👉 **Ouvrir une table** ci-dessous : tu en deviens l\'**hôte**.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon · mise max 100 $' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('brf_open').setLabel('Ouvrir une table de Bras de fer').setEmoji('💪').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}
async function installerPanelBrasDeFer(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('BRAS DE FER');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ brf panel:', e.message); return null; }
}

// ═══════════════════════════════════════════════════════════════
//  ROUTEUR D'INTERACTIONS
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table
    if (interaction.isButton() && id === 'brf_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) {
        const vivante = await exist.msg?.fetch?.().then(() => true).catch(() => false);
        if (vivante) { await interaction.reply({ content: '💪 Une table de Bras de fer est déjà ouverte ici. Rejoins-la plus haut !', flags: eph }); return true; }
        _clearTimer(exist); tables.delete(interaction.channelId); // message disparu → on repart proprement
      }
      await interaction.deferReply({ flags: eph });
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(_screenPayload(t)).catch(() => null);
      if (!msg) { await interaction.editReply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).' }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.editReply({ content: '💪 Table ouverte — tu en es l\'**hôte**. Lance un **Solo**, ou monte un **Duel** 👇' });
      return true;
    }

    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 💪.', flags: eph }).catch(() => {}); } return true; }

    // ── Extras (toujours dispo) ──
    if (interaction.isButton() && id === 'brf_regles') { await interaction.reply({ content: _REGLES, flags: eph }); return true; }
    if (interaction.isButton() && id === 'brf_emote') { await interaction.reply({ content: '🎭 **Émote à coller en jeu :**\n```\n' + _emotePerso(t, interaction.user.id) + '\n```', flags: eph }); return true; }
    if (interaction.isButton() && id === 'brf_sous') {
      const perso = t.soldes[interaction.user.id] || 0;
      const top = casino.classement ? casino.classement(3) : [];
      const cls = top.length ? '\n\n🏆 **Meneurs du saloon :**\n' + top.map((x, i) => `${['🥇','🥈','🥉'][i] || '•'} <@${x.userId}> — ${_money(x.montant)}`).join('\n') : '';
      await interaction.reply({ content: `💰 **Sur cette table :** ${_money(perso)}\n🏦 **Ton solde de soirée :** ${_money(_sous(interaction.user.id))}${cls}`, flags: eph });
      return true;
    }
    if (interaction.isButton() && id === 'brf_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      try { if (t.msg) await t.msg.edit({ content: '🔒 Table de Bras de fer fermée.', embeds: [], components: [] }); } catch {}
      await interaction.reply({ content: '🔒 Table fermée.', flags: eph });
      return true;
    }

    // ── SOLO ──
    if (interaction.isButton() && id === 'brf_solo') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une passe est déjà en cours — finis-la.', flags: eph }); return true; }
      // Ne pas écraser un duel en préparation (anti-griefing) : si des joueurs sont
      // inscrits au duel (autres que celui qui clique), le solo est refusé.
      if (t.mode === 'duel' && t.joueurs.some(j => j.userId !== interaction.user.id)) {
        await interaction.reply({ content: '⚔️ Un **duel est en préparation** à cette table. Clique **Rejoindre** pour y entrer, ou attends qu\'il se termine.', flags: eph }); return true;
      }
      const nom = interaction.member?.displayName || interaction.user.username;
      t.mode = 'solo';
      t.joueurs = [{ userId: interaction.user.id, nom }];
      t.pnj = _rollPNJ();
      t.mise = 0; t.curseur = 0; t.manche = 0; t.pending = {}; t.dernier = ''; t.gagnantId = null;
      t.phase = 'jeu';
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      return true;
    }

    // ── DUEL : rejoindre (modal de mise) ──
    if (interaction.isButton() && id === 'brf_join') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une passe est en cours — patiente.', flags: eph }); return true; }
      if (t.mode === 'solo') { await interaction.reply({ content: 'Une partie solo est prête. Rejoue pour repasser en duel.', flags: eph }); return true; }
      if (!_joueur(t, interaction.user.id) && t.joueurs.length >= 2) { await interaction.reply({ content: '⚔️ Le duel est déjà complet (2 bras).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('brf_join_modal').setTitle('⚔️ Rejoindre le bras de fer')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mise').setLabel('Ta mise en jetons (max 100 $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(3).setPlaceholder('Ex : 50 — plafond 100 $')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'brf_join_modal') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Passe en cours, patiente.', flags: eph }); return true; }
      let mise = parseInt((interaction.fields.getTextInputValue('mise') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(mise) || mise < MISE_MIN) mise = MISE_MIN;
      if (mise > MISE_MAX) mise = MISE_MAX;
      t.mode = 'duel';
      let j = _joueur(t, interaction.user.id);
      if (j) { j.mise = mise; }
      else {
        if (t.joueurs.length >= 2) { await interaction.reply({ content: '⚔️ Duel complet.', flags: eph }); return true; }
        j = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, mise };
        t.joueurs.push(j);
      }
      t.mise = t.joueurs.length ? Math.min(...t.joueurs.map(x => x.mise || MISE_MIN)) : mise;
      await interaction.reply({ content: '⚔️ Tu poses ton coude, mise **' + _money(mise) + '**.' + (t.joueurs.length < 2 ? ' En attente d\'un adversaire…' : ' L\'hôte peut lancer !'), flags: eph });
      await _refresh(t); return true;
    }

    // ── Lancer le duel (hôte) ──
    if (interaction.isButton() && id === 'brf_start') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut lancer le duel.', flags: eph }); return true; }
      if (t.phase === 'jeu') { await interaction.reply({ content: 'Une passe est déjà en cours.', flags: eph }); return true; }
      if (t.mode !== 'duel' || t.joueurs.length !== 2) { await interaction.reply({ content: '⚔️ Il faut **2 bras** inscrits pour lancer.', flags: eph }); return true; }
      t.mise = Math.min(...t.joueurs.map(x => x.mise || MISE_MIN));
      t.curseur = 0; t.manche = 0; t.pending = {}; t.dernier = ''; t.gagnantId = null;
      t.phase = 'jeu';
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      _armerAttente(t);
      return true;
    }

    // ── POUSSER ──
    if (interaction.isButton() && id === 'brf_push') {
      if (t.phase !== 'jeu') { await interaction.reply({ content: '⏳ Aucune passe en cours. Lance un solo ou un duel.', flags: eph }); return true; }

      if (t.mode === 'solo') {
        if (interaction.user.id !== t.joueurs[0]?.userId) { await interaction.reply({ content: '👀 Cette passe solo n\'est pas la tienne — ouvre ta propre table.', flags: eph }); return true; }
        await interaction.deferUpdate().catch(() => {});
        const fG = _force();
        const fD = _force(t.pnj);
        _resoudreManche(t, fG, fD);
        const w = _verifierFin(t);
        if (w != null) _finPartie(t, w);
        await _refresh(t);
        return true;
      }

      // DUEL
      const j = _joueur(t, interaction.user.id);
      if (!j) { await interaction.reply({ content: '👀 Tu n\'es pas dans ce duel. Rejoins une prochaine passe.', flags: eph }); return true; }
      if (t.pending[j.userId] != null) { await interaction.reply({ content: '💪 Tu as déjà poussé cette manche — on attend l\'autre bras.', flags: eph }); return true; }
      t.pending[j.userId] = _force();
      await interaction.deferUpdate().catch(() => {});
      // Les deux ont poussé → on résout.
      if (t.joueurs.every(x => t.pending[x.userId] != null)) {
        const fG = t.pending[t.joueurs[0].userId];
        const fD = t.pending[t.joueurs[1].userId];
        t.pending = {};
        _resoudreManche(t, fG, fD);
        const w = _verifierFin(t);
        if (w != null) _finPartie(t, w); else _armerAttente(t);
      } else {
        _armerAttente(t);
      }
      await _refresh(t);
      return true;
    }

    // ── Rejouer (retour au lobby) ──
    if (interaction.isButton() && id === 'brf_rejouer') {
      _clearTimer(t);
      t.phase = 'lobby'; t.mode = null; t.joueurs = []; t.pnj = null;
      t.mise = 0; t.curseur = 0; t.manche = 0; t.pending = {}; t.dernier = ''; t.gagnantId = null;
      await interaction.deferUpdate().catch(() => {});
      await _refresh(t);
      return true;
    }

    // filet de sécurité : tout brf_* non géré est quand même acquitté (jamais « interaction failed »)
    if ((interaction.isButton?.() || interaction.isModalSubmit?.()) && !interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate().catch(() => {});
    }
    return true; // customId brf_* pris en charge
  } catch (e) {
    console.log('❌ brasdefer routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Un pépin sur la table. Réessaie.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelBrasDeFer,
  // exposés pour les tests
  _nouvelleTable, _force, _resoudreManche, _verifierFin, _finPartie, _barre, _screenPayload, _components, LIMITE, MAX_MANCHES, tables, _rollPNJ,
};
