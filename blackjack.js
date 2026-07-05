// ───────────────────────────────────────────────────────────────────────────
//  blackjack.js — Table de BLACKJACK immersive (saloon RP). Module 100 % isolé.
//   • Le BOT est le croupier : cartes équitables (sabot 6 jeux), tire jusqu'à 17,
//     blackjack payé 3:2. Un joueur OUVRE la table (il en est l'« hôte »).
//   • Les joueurs S'ASSEYENT avec une mise, puis jouent chacun leur tour
//     (Tirer / Rester / Doubler). Compteur de jetons (gains/pertes) par table.
//   • Tout est préfixé bj_ — n'écrit RIEN en base, aucune économie touchée.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags } = require('discord.js');

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const MAX_SIEGES = 5;
const MISE_MIN = 1, MISE_MAX = 1000000;
const TOUR_MS = 120000; // 2 min pour jouer, sinon « Rester » auto

const RANGS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const COULEURS = ['♠', '♥', '♦', '♣'];
const DOS = '🂠';

// ─── Cartes / totaux ───
function _val(r) { if (r === 'A') return 11; if (r === 'J' || r === 'Q' || r === 'K') return 10; return parseInt(r, 10); }
function _total(main) { let t = 0, as = 0; for (const c of main) { t += _val(c.r); if (c.r === 'A') as++; } while (t > 21 && as > 0) { t -= 10; as--; } return t; }
function _estBJ(main) { return main.length === 2 && _total(main) === 21; }
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
  };
}

function _siege(t, uid) { return t.sieges.find(s => s.userId === uid); }
function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }

// ─── Rendu du plateau ───
function _payload(t) {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎰  TABLE DE BLACKJACK  🃏');
  const lignes = [];

  // Croupier
  if (t.phase === 'jeu') {
    const up = t.croupier.main[0];
    lignes.push('🎩 **Croupier** — ' + (up ? _fmtCarte(up) + '  ' + DOS : '—') + '   *(carte cachée)*');
  } else if (t.croupier.main.length) {
    const dt = _total(t.croupier.main);
    lignes.push('🎩 **Croupier** — ' + _fmtMain(t.croupier.main) + '   **= ' + dt + '**' + (dt > 21 ? '  💥 brûlé' : (_estBJ(t.croupier.main) ? '  ✦ blackjack' : '')));
  } else {
    lignes.push('🎩 **Croupier** — *prêt à distribuer.*');
  }
  lignes.push('─────────────────────────────');

  // Sièges
  if (!t.sieges.length) {
    lignes.push('*Aucun joueur assis. Cliquez sur* **🪑 S\'asseoir** *pour rejoindre la table.*');
  } else {
    t.sieges.forEach((s, i) => {
      const tot = s.main.length ? _total(s.main) : null;
      let statut = '';
      if (t.phase === 'jeu') {
        if (s.statut === 'bust') statut = '💥 brûlé';
        else if (s.statut === 'blackjack') statut = '✦ BLACKJACK';
        else if (s.statut === 'stand') statut = '✋ reste';
        else if (i === t.tourIdx) statut = '🎯 **à lui de jouer**';
        else statut = '⏳';
      } else if (s.resultat) {
        statut = s.resultat;
      }
      const mains = s.main.length ? '  ' + _fmtMain(s.main) + (tot != null ? '  **= ' + tot + '**' : '') : '';
      const solde = t.soldes[s.userId] ? '  ·  jetons ' + _money(t.soldes[s.userId]) : '';
      lignes.push('🪑 **' + s.nom + '** — mise ' + _money(s.mise) + mains + (statut ? '  ' + statut : '') + solde);
    });
  }

  // Invite / phase
  lignes.push('─────────────────────────────');
  if (t.phase === 'lobby') {
    if (t.manche > 0) lignes.push('🔚 **Manche terminée.** L\'hôte peut relancer une manche, ou chacun ajuster sa mise.');
    else lignes.push(t.ambiance || '💬 *' + _pick(_phrasesDeal) + '*');
    lignes.push('👉 Asseyez-vous, réglez votre mise, puis l\'**hôte distribue**.');
  } else {
    const s = t.sieges[t.tourIdx];
    lignes.push('➡️ **À ' + (s ? s.nom : '—') + ' de jouer** — Tirer, Rester' + (s && s.main.length === 2 ? ', ou Doubler' : '') + '.');
    if (t.ambiance) lignes.push('💬 *' + t.ambiance + '*');
  }
  if (t.reshuffle) { lignes.push('🔀 *(le sabot a été rebattu)*'); }

  e.setDescription(lignes.join('\n'));
  e.setFooter({ text: 'Hôte : ' + t.hoteNom + '  ·  Blackjack payé 3:2  ·  Le croupier tire jusqu\'à 17' });

  // Boutons
  const rows = [];
  if (t.phase === 'lobby') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_sit').setLabel('S\'asseoir').setEmoji('🪑').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bj_leave').setLabel('Se lever').setEmoji('🚪').setStyle(ButtonStyle.Secondary),
    ));
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_deal').setLabel(t.manche > 0 ? 'Relancer une manche' : 'Distribuer').setEmoji('🎴').setStyle(ButtonStyle.Primary).setDisabled(!t.sieges.length),
      new ButtonBuilder().setCustomId('bj_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
    ));
  } else {
    const s = t.sieges[t.tourIdx];
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('bj_hit').setLabel('Tirer').setEmoji('🃏').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('bj_stand').setLabel('Rester').setEmoji('✋').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('bj_double').setLabel('Doubler').setEmoji('⏫').setStyle(ButtonStyle.Secondary).setDisabled(!(s && s.main.length === 2)),
    ));
  }
  return { embeds: [e], components: rows };
}

async function _refresh(t) { try { if (t.msg) await t.msg.edit(_payload(t)); } catch (e) { console.log('⚠️ bj refresh:', e.message); } }

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
  if (enJeu) { while (_total(t.croupier.main) < 17) t.croupier.main.push(_piocher(t)); }
  const dt = _total(t.croupier.main);
  const dBJ = _estBJ(t.croupier.main);
  for (const s of t.sieges) {
    const pt = _total(s.main);
    let net = 0, label = '';
    if (s.statut === 'bust') { net = -s.mise; label = '❌ Perdu (brûlé)'; }
    else if (s.statut === 'blackjack') { if (dBJ) { net = 0; label = '➖ Égalité (double blackjack)'; } else { net = Math.round(s.mise * 1.5); label = '✦ BLACKJACK ! +' + _money(net); } }
    else { // stand
      if (dBJ) { net = -s.mise; label = '❌ Perdu (blackjack croupier)'; }
      else if (dt > 21) { net = s.mise; label = '✅ Gagné (croupier brûlé) +' + _money(net); }
      else if (pt > dt) { net = s.mise; label = '✅ Gagné +' + _money(net); }
      else if (pt < dt) { net = -s.mise; label = '❌ Perdu'; }
      else { net = 0; label = '➖ Égalité'; }
    }
    s.resultat = label; s.net = net; s.statut = 'fini';
    t.soldes[s.userId] = (t.soldes[s.userId] || 0) + net;
  }
  t.phase = 'lobby';
  t.ambiance = _pick(_phrasesTire);
}

function _distribuer(t) {
  t.manche++;
  t.reshuffle = false;
  t.croupier.main = [];
  for (const s of t.sieges) { s.main = []; s.statut = 'jeu'; s.resultat = ''; s.net = 0; }
  // 2 cartes chacun, puis 2 au croupier
  for (let k = 0; k < 2; k++) { for (const s of t.sieges) s.main.push(_piocher(t)); t.croupier.main.push(_piocher(t)); }
  for (const s of t.sieges) { if (_estBJ(s.main)) s.statut = 'blackjack'; }
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
      '🃏 **Blackjack** — battez le croupier sans dépasser 21. Le blackjack paie **3:2**, le croupier tire jusqu\'à **17**.',
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
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(_payload(t)).catch(() => null);
      if (!msg) { await interaction.reply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).', flags: eph }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.reply({ content: '🎰 Table ouverte — tu en es l\'**hôte**. Assieds-toi 👇 puis clique **Distribuer** quand tout le monde a misé.', flags: eph });
      return true;
    }

    // À partir d'ici il faut une table active dans ce salon
    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🎰.', flags: eph }).catch(() => {}); } return true; }

    // S'asseoir → modal de mise
    if (interaction.isButton() && id === 'bj_sit') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Une manche est en cours — assieds-toi à la fin de celle-ci.', flags: eph }); return true; }
      if (_siege(t, interaction.user.id)) { await interaction.reply({ content: 'Tu es déjà assis. Tu peux ajuster ta mise en te rasseyant.', flags: eph }); return true; }
      if (t.sieges.length >= MAX_SIEGES) { await interaction.reply({ content: '🈵 La table est complète (' + MAX_SIEGES + ' joueurs).', flags: eph }); return true; }
      const modal = new ModalBuilder().setCustomId('bj_sit_modal').setTitle('🪑 S\'asseoir à la table')
        .addComponents(new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mise').setLabel('Votre mise (en $)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setPlaceholder('Ex : 50')));
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'bj_sit_modal') {
      if (t.phase === 'jeu') { await interaction.reply({ content: '⏳ Manche en cours, patiente.', flags: eph }); return true; }
      let mise = parseInt((interaction.fields.getTextInputValue('mise') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(mise) || mise < MISE_MIN) mise = MISE_MIN;
      if (mise > MISE_MAX) mise = MISE_MAX;
      let s = _siege(t, interaction.user.id);
      if (s) { s.mise = mise; }
      else {
        if (t.sieges.length >= MAX_SIEGES) { await interaction.reply({ content: '🈵 Table complète.', flags: eph }); return true; }
        s = { userId: interaction.user.id, nom: interaction.member?.displayName || interaction.user.username, mise, main: [], statut: 'attente', resultat: '', net: 0 };
        t.sieges.push(s);
      }
      await interaction.reply({ content: '✅ Tu es assis, mise réglée à **' + _money(mise) + '**. Bonne chance !', flags: eph });
      await _refresh(t); return true;
    }

    // Se lever
    if (interaction.isButton() && id === 'bj_leave') {
      if (t.phase === 'jeu' && _siege(t, interaction.user.id)) { await interaction.reply({ content: '⏳ Tu ne peux pas quitter en pleine manche — finis le coup.', flags: eph }); return true; }
      const idx = t.sieges.findIndex(s => s.userId === interaction.user.id);
      if (idx < 0) { await interaction.reply({ content: 'Tu n\'es pas assis à cette table.', flags: eph }); return true; }
      const solde = t.soldes[t.sieges[idx].userId] || 0;
      t.sieges.splice(idx, 1);
      await interaction.reply({ content: '🚪 Tu quittes la table. Bilan de la soirée : **' + _money(solde) + '** de jetons.', flags: eph });
      await _refresh(t); return true;
    }

    // Distribuer (hôte)
    if (interaction.isButton() && id === 'bj_deal') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut distribuer.', flags: eph }); return true; }
      if (t.phase === 'jeu') { await interaction.reply({ content: 'Une manche est déjà en cours.', flags: eph }); return true; }
      if (!t.sieges.length) { await interaction.reply({ content: 'Personne n\'est assis à la table.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _distribuer(t);
      await _refresh(t); return true;
    }

    // Actions de jeu : Tirer / Rester / Doubler
    if (interaction.isButton() && (id === 'bj_hit' || id === 'bj_stand' || id === 'bj_double')) {
      if (t.phase !== 'jeu') { await interaction.reply({ content: 'Aucune manche en cours.', flags: eph }); return true; }
      const s = t.sieges[t.tourIdx];
      if (!s) { await interaction.reply({ content: 'Aucun joueur à jouer.', flags: eph }); return true; }
      if (s.userId !== interaction.user.id) { await interaction.reply({ content: '⏳ Ce n\'est pas ton tour — c\'est à **' + s.nom + '** de jouer.', flags: eph }); return true; }
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
        if (s.main.length !== 2) { await _refresh(t); return true; }
        s.mise *= 2; s.main.push(_piocher(t));
        const tot = _total(s.main);
        s.statut = tot > 21 ? 'bust' : 'stand';
        t.ambiance = s.nom + ' double la mise et tire une carte' + (tot > 21 ? ' — brûlé !' : '.');
        _avancer(t);
      }
      await _refresh(t); return true;
    }

    // Fermer la table (hôte)
    if (interaction.isButton() && id === 'bj_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (ou la Direction) peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      const bilan = t.sieges.length || Object.keys(t.soldes).length
        ? Object.entries(t.soldes).map(([uid, n]) => '• <@' + uid + '> : ' + _money(n)).join('\n')
        : '';
      const e = new EmbedBuilder().setColor(0x8a6d3b).setTitle('🎰 Table fermée')
        .setDescription('Le croupier ramasse les cartes. Merci d\'avoir joué à la maison.' + (bilan ? '\n\n**Bilan des jetons :**\n' + bilan : ''))
        .setFooter({ text: 'Iron Wolf Company · Saloon' });
      try { await t.msg?.edit({ embeds: [e], components: [] }); } catch {}
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    return true; // customId bj_* pris en charge
  } catch (e) {
    console.log('❌ blackjack routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de jeu.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { routeInteraction, installerPanelBlackjack, _test: { _total, _estBJ, _construireSabot, _distribuer, _croupierEtResolution, _creerTable, tables } };
