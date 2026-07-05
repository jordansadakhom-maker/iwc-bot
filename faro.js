// ───────────────────────────────────────────────────────────────────────────
//  faro.js — Table de FARO immersive (saloon RP 1904). Module 100 % isolé.
//   • Le jeu de saloon banqué le plus populaire de l'Ouest. L'hôte tient la
//     BANQUE (la maison). Les joueurs posent des JETONS sur les 13 rangs
//     (A..K). Le donneur « tourne » deux cartes d'un sabot de 52 :
//        1re carte = PERDANTE (banque)   ·   2e carte = GAGNANTE (joueur).
//     - Mise sur le rang GAGNANT → payée 1:1.
//     - Mise sur le rang PERDANT → perdue (à la banque).
//     - SPLIT (les deux cartes du même rang) → la maison prend la MOITIÉ des
//       mises sur ce rang (l'unique avantage maison, très faible → équitable).
//     - Mise sur un rang non sorti → reste en place pour le coup suivant
//       (retirable via « Retirer mes mises »).
//   • État EN MÉMOIRE seulement (une table par salon). N'écrit RIEN en base,
//     aucune économie réelle touchée — ce sont des jetons de table.
//   • Tout est préfixé faro_. Le plateau est édité EN DIRECT sous forme d'image
//     (faro-image.js). Repli texte si sharp indisponible — jamais de crash.
// ───────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder } = require('discord.js');
let _img = null; try { _img = require('./faro-image'); } catch { _img = null; }

const PREFIXE = 'faro_';

const GESTION = ['Opérateur', 'Operateur', 'Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Secrétaire', 'Instructeur'];
function _estGestion(member) { try { return !!member?.roles?.cache?.some(r => GESTION.some(n => r.name.includes(n))); } catch { return false; } }

const MISE_MIN = 1, MISE_MAX = 1000000;
const TOUR_MS = 120000; // 2 min d'inactivité → auto-tour SÛR (ne résout que les mises déjà posées par les joueurs)

const RANGS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const COULEURS = ['♠', '♥', '♦', '♣'];

// ─── Cartes / sabot ───
function _construireSabot() { const s = []; for (const c of COULEURS) for (const r of RANGS) s.push({ r, s: c }); for (let i = s.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [s[i], s[j]] = [s[j], s[i]]; } return s; }
function _money(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '') + s + ' $'; }
function _signe(n) { const s = Math.abs(Math.round(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' '); return (n < 0 ? '−' : '+') + s + ' $'; }
function _fmtCarte(c) { return '`' + c.r + c.s + '`'; }

// ─── Ambiance donneur ───
const _phrasesMise = ['« Faites vos jeux sur le tableau, messieurs-dames. »', '« Posez vos jetons, le sabot n\'attend pas. »', '« Sur quel rang tentez-vous le sort ce soir ? »'];
const _phrasesTour = ['Le donneur fait glisser deux cartes du sabot…', 'La boîte à faro rend son verdict…', 'Le donneur retourne : perdante, puis gagnante.'];
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }

// ─── État des tables (en mémoire, une par salon) ───
const tables = new Map(); // channelId -> table

function _nouvelleTable() {
  return {
    channelId: null, guildId: null, hoteId: null, hoteNom: '',
    phase: 'jeu',                 // faro : ouvert en continu (mises + tours entrelacés)
    mises: [],                    // [{ rang, userId, nom, montant }] — fusionnées par (userId,rang)
    joueurs: {},                  // userId -> nom (dernier connu)
    soldes: {},                   // userId -> jetons nets (vs banque)
    banque: 0,                    // jetons nets de la maison (= -Σ soldes)
    sabot: _construireSabot(),
    coup: 0,
    dernier: null,                // { perdante, gagnante, split, resultats:[{rang,userId,nom,montant,issue,delta}] }
    reshuffle: false,
    msg: null, messageId: null, timer: null, ambiance: '',
  };
}

function _creerTable(interaction) {
  const t = _nouvelleTable();
  t.channelId = interaction.channelId;
  t.guildId = interaction.guild?.id;
  t.hoteId = interaction.user.id;
  t.hoteNom = interaction.member?.displayName || interaction.user.username;
  t.ambiance = _pick(_phrasesMise);
  return t;
}

function _estHote(t, interaction) { return interaction.user.id === t.hoteId || _estGestion(interaction.member); }
function _clearTimer(t) { if (t.timer) { clearTimeout(t.timer); t.timer = null; } }

// ─── Logique de mise ───
// Ajoute (ou fusionne) une mise d'un joueur sur un rang. Retourne la mise résultante.
function _ajouterMise(t, userId, nom, rang, montant) {
  t.joueurs[userId] = nom;
  let m = t.mises.find(x => x.userId === userId && x.rang === rang);
  if (m) { m.montant += montant; m.nom = nom; }
  else { m = { rang, userId, nom, montant }; t.mises.push(m); }
  return m;
}
// Retire toutes les mises non résolues d'un joueur. Retourne le total récupéré.
function _retirerMises(t, userId) {
  let total = 0; const reste = [];
  for (const m of t.mises) { if (m.userId === userId) total += m.montant; else reste.push(m); }
  t.mises = reste;
  return total;
}
function _misesDe(t, userId) { return t.mises.filter(m => m.userId === userId); }
function _totalRang(t, rang) { return t.mises.filter(m => m.rang === rang).reduce((a, m) => a + m.montant, 0); }

// ─── Résolution d'un coup (pure : mute soldes/banque/mises, renvoie le détail) ───
// perdante = 1re carte tirée (banque), gagnante = 2e carte (joueur).
function _resoudreCoup(t, perdante, gagnante) {
  const split = perdante.r === gagnante.r;
  const resultats = [];
  const restants = [];
  for (const m of t.mises) {
    let issue = null, delta = 0;
    if (split && m.rang === perdante.r) {
      // Les deux cartes du même rang : la maison rafle la MOITIÉ de la mise.
      delta = -Math.round(m.montant / 2);
      issue = 'split';
    } else if (m.rang === gagnante.r) {
      delta = m.montant;            // payé 1:1 (récupère la mise + gain égal)
      issue = 'gagne';
    } else if (m.rang === perdante.r) {
      delta = -m.montant;           // mise perdue, va à la banque
      issue = 'perd';
    } else {
      restants.push(m);             // rang non sorti → reste en place (carry)
      continue;
    }
    t.soldes[m.userId] = (t.soldes[m.userId] || 0) + delta;
    t.banque -= delta;
    resultats.push({ rang: m.rang, userId: m.userId, nom: m.nom, montant: m.montant, issue, delta });
  }
  t.mises = restants;
  t.coup++;
  t.dernier = { perdante, gagnante, split, resultats };
  return t.dernier;
}

// Tire deux cartes du sabot (rebat si trop bas) et résout le coup.
function _tourner(t) {
  if (t.sabot.length < 2) { t.sabot = _construireSabot(); t.reshuffle = true; }
  else t.reshuffle = false;
  const perdante = t.sabot.pop();
  const gagnante = t.sabot.pop();
  return _resoudreCoup(t, perdante, gagnante);
}

// Libellé synthétique du dernier coup (pour l'image / le texte).
function _labelDernier(d) {
  if (!d) return '';
  if (d.split) return 'SPLIT sur ' + d.perdante.r + ' — la maison prend la moitié des mises de ce rang.';
  const g = d.resultats.filter(r => r.issue === 'gagne').reduce((a, r) => a + r.delta, 0);
  const p = d.resultats.filter(r => r.issue === 'perd').reduce((a, r) => a + r.montant, 0);
  const parts = [];
  if (g) parts.push('gagnants payés ' + _money(g));
  if (p) parts.push('perdants raflés ' + _money(p));
  return parts.length ? parts.join(' · ') : 'aucune mise concernée.';
}

// ─── Rendu (image si possible, sinon texte) ───
function _imgState(t) {
  const rangs = RANGS.map(r => {
    const ms = t.mises.filter(m => m.rang === r);
    const total = ms.reduce((a, m) => a + m.montant, 0);
    const d = t.dernier;
    return {
      r,
      total,
      nJoueurs: new Set(ms.map(m => m.userId)).size,
      perdante: !!(d && !d.split && d.perdante.r === r),
      gagnante: !!(d && !d.split && d.gagnante.r === r),
      split: !!(d && d.split && d.perdante.r === r),
    };
  });
  const soldes = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => ({ nom: t.joueurs[u] || 'Parti', net: n }));
  return {
    sousTitre: t.coup > 0
      ? ('Coup n° ' + t.coup + ' joué — replacez vos mises, l\'hôte peut « Tourner » à nouveau')
      : 'Posez vos jetons sur un rang, puis l\'hôte « Tourne » les cartes',
    coup: t.coup,
    banque: t.banque,
    dernier: t.dernier ? { perdante: t.dernier.perdante, gagnante: t.dernier.gagnante, split: t.dernier.split, label: _labelDernier(t.dernier) } : null,
    rangs,
    soldes,
  };
}

function _lignesTexte(t) {
  const L = [];
  const d = t.dernier;
  if (d) {
    L.push('🎴 **Coup n° ' + t.coup + '** — Perdante ' + _fmtCarte(d.perdante) + ' · Gagnante ' + _fmtCarte(d.gagnante) + (d.split ? '  ·  **SPLIT**' : ''));
    L.push('   ' + _labelDernier(d));
  } else {
    L.push('🎴 *Le sabot est prêt. Aucun coup joué.*');
  }
  L.push('─────────────────────────────');
  // Mises actives, groupées par rang
  const parRang = RANGS.map(r => ({ r, ms: t.mises.filter(m => m.rang === r) })).filter(x => x.ms.length);
  if (!parRang.length) L.push('*Aucune mise sur le tableau. Cliquez sur* **🎯 Miser sur un rang**.');
  else for (const g of parRang) L.push('🎯 **' + g.r + '** — ' + g.ms.map(m => m.nom + ' ' + _money(m.montant)).join(', '));
  return L;
}
function _lignesStatut(t) {
  const L = [];
  if (t.coup > 0) L.push('▶️ **Replacez vos mises**, puis l\'hôte **Tourne** un nouveau coup.');
  else L.push('👉 **Misez sur un rang**, puis l\'**hôte** clique **Tourner**.');
  if (t.ambiance) L.push('💬 *' + t.ambiance + '*');
  const sold = Object.entries(t.soldes).filter(([, n]) => n).map(([u, n]) => '• ' + (t.joueurs[u] || 'Parti') + ' : ' + _signe(n));
  if (sold.length) L.push('💰 **Jetons de la soirée** (banque : ' + _signe(t.banque) + ')\n' + sold.join('\n'));
  if (t.reshuffle) L.push('🔀 *(sabot rebattu)*');
  return L;
}

function _components(t) {
  const rows = [];
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('faro_bet').setLabel('Miser sur un rang').setEmoji('🎯').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('faro_pull').setLabel('Retirer mes mises').setEmoji('↩️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('faro_peek').setLabel('Voir mes mises').setEmoji('🔍').setStyle(ButtonStyle.Secondary),
  ));
  rows.push(new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('faro_turn').setLabel('Tourner').setEmoji('🎴').setStyle(ButtonStyle.Primary).setDisabled(!t.mises.length),
    new ButtonBuilder().setCustomId('faro_close').setLabel('Fermer la table').setEmoji('❌').setStyle(ButtonStyle.Danger),
  ));
  return rows;
}

async function _screen(t) {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎰  TABLE DE FARO  🎴')
    .setFooter({ text: 'Hôte (banque) : ' + t.hoteNom + '  ·  Gagnante payée 1:1  ·  Split = moitié à la maison' });
  let buf = null;
  try { if (_img?.genererTableFaro) buf = await _img.genererTableFaro(_imgState(t)); } catch { buf = null; }
  if (buf) {
    e.setImage('attachment://faro.png');
    e.setDescription(_lignesStatut(t).join('\n').slice(0, 4000));
    return { embeds: [e], components: _components(t), files: [new AttachmentBuilder(buf, { name: 'faro.png' })] };
  }
  e.setDescription(_lignesTexte(t).concat(['─────────────────────────────']).concat(_lignesStatut(t)).join('\n').slice(0, 4000));
  return { embeds: [e], components: _components(t), files: [] };
}

async function _refresh(t) { try { if (t.msg) { const p = await _screen(t); await t.msg.edit({ ...p, attachments: [] }); } } catch (e) { console.log('⚠️ faro refresh:', e.message); } }

// ─── Timeout par tour : auto-action SÛRE ───
// Après 120 s d'inactivité alors que des mises sont posées, le donneur tourne
// automatiquement UN coup (il ne résout que des mises que les joueurs ont
// eux-mêmes placées — aucun jeton n'est engagé sans leur geste). On ne réarme
// pas après un auto-tour : la table reprend au prochain geste d'un joueur/hôte.
function _armer(t) {
  _clearTimer(t);
  if (!t.mises.length) return;
  t.timer = setTimeout(async () => {
    try {
      t.timer = null;
      if (!tables.get(t.channelId) || !t.mises.length) return;
      _tourner(t);
      t.ambiance = 'Plus personne ne bouge — le donneur tourne d\'office. ' + _pick(_phrasesTour);
      await _refresh(t);
    } catch (e) { console.log('⚠️ faro timer:', e.message); }
  }, TOUR_MS);
}

// ─── Panneau d'ouverture (installable dans le salon casino) ───
function _panelPayload() {
  const e = new EmbedBuilder().setColor(0xC8A45C).setTitle('🎰 SALOON — TABLE DE FARO')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║      FARO  ·  LA BANQUE       ║',
      '╚═══════════════════════════════╝',
      '```',
      '*Le jeu banqué le plus couru de l\'Ouest. Posez vos jetons sur les rangs du tableau — le donneur tire deux cartes : la première pour la banque, la seconde pour vous.*',
      '',
      '🎯 **Miser** sur un ou plusieurs rangs (A → K).',
      '🎴 **Tourner** (hôte) : 1re carte = perdante (banque), 2e = gagnante (joueur, payée **1:1**).',
      '⚖️ **Split** (deux cartes du même rang) → la maison prend la **moitié** des mises de ce rang. C\'est le seul — et très faible — avantage de la banque.',
      '',
      '👉 **Ouvrir une table** ci-dessous : vous tenez la **banque** en tant qu\'hôte.',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company · Saloon' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('faro_open').setLabel('Ouvrir une table de Faro').setEmoji('🎰').setStyle(ButtonStyle.Success),
  );
  return { embeds: [e], components: [row] };
}

async function installerPanelFaro(guild, channel) {
  try {
    if (!channel?.send) return null;
    const me = channel.client.user.id;
    const estPanel = m => m.author?.id === me && (m.embeds?.[0]?.title || '').includes('TABLE DE FARO');
    let existing = null;
    const pins = await channel.messages.fetchPinned().catch(() => null);
    if (pins) existing = [...pins.values()].find(estPanel) || null;
    if (!existing) { const msgs = await channel.messages.fetch({ limit: 50 }).catch(() => null); if (msgs) existing = [...msgs.values()].find(estPanel) || null; }
    if (existing) { await existing.edit(_panelPayload()).catch(() => {}); return existing; }
    const sent = await channel.send(_panelPayload()).catch(() => null);
    if (sent) { try { await sent.pin(); } catch {} }
    return sent;
  } catch (e) { console.log('⚠️ faro panel:', e.message); return null; }
}

// ─── Routeur d'interactions ───
async function routeInteraction(interaction) {
  try {
    const id = interaction.customId || '';
    if (!id.startsWith(PREFIXE)) return false;
    const eph = MessageFlags.Ephemeral;

    // Ouvrir une table (depuis le panneau)
    if (interaction.isButton() && id === 'faro_open') {
      const exist = tables.get(interaction.channelId);
      if (exist) { await interaction.reply({ content: '🎰 Une table de Faro est déjà ouverte dans ce salon. Rejoins-la un peu plus haut !', flags: eph }); return true; }
      const t = _creerTable(interaction);
      const msg = await interaction.channel.send(await _screen(t)).catch(() => null);
      if (!msg) { await interaction.reply({ content: '❌ Impossible d\'ouvrir la table ici (permissions ?).', flags: eph }); return true; }
      t.msg = msg; t.messageId = msg.id; tables.set(interaction.channelId, t);
      await interaction.reply({ content: '🎰 Table de Faro ouverte — tu tiens la **banque**. Les joueurs misent 👇 puis tu cliques **Tourner**.', flags: eph });
      return true;
    }

    // À partir d'ici il faut une table active dans ce salon
    const t = tables.get(interaction.channelId);
    if (!t) { if (interaction.isButton() || interaction.isModalSubmit()) { await interaction.reply({ content: '⌛ Cette table n\'est plus active. Ouvre-en une nouvelle depuis le panneau 🎰.', flags: eph }).catch(() => {}); } return true; }

    // Miser → modal (rang + montant)
    if (interaction.isButton() && id === 'faro_bet') {
      const modal = new ModalBuilder().setCustomId('faro_bet_modal').setTitle('🎯 Miser sur un rang')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('rang').setLabel('Rang (A,2,3,4,5,6,7,8,9,10,J,Q,K)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(2).setPlaceholder('Ex : Q')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('montant').setLabel('Montant en jetons ($)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(8).setPlaceholder('Ex : 50')),
        );
      await interaction.showModal(modal); return true;
    }
    if (interaction.isModalSubmit() && id === 'faro_bet_modal') {
      let rang = (interaction.fields.getTextInputValue('rang') || '').trim().toUpperCase();
      if (rang === '1') rang = 'A';
      if (!RANGS.includes(rang)) { await interaction.reply({ content: '❌ Rang invalide. Choisis parmi : ' + RANGS.join(', ') + '.', flags: eph }); return true; }
      let montant = parseInt((interaction.fields.getTextInputValue('montant') || '').replace(/[^0-9]/g, ''), 10);
      if (!Number.isFinite(montant) || montant < MISE_MIN) montant = MISE_MIN;
      if (montant > MISE_MAX) montant = MISE_MAX;
      const nom = interaction.member?.displayName || interaction.user.username;
      const m = _ajouterMise(t, interaction.user.id, nom, rang, montant);
      await interaction.reply({ content: '✅ Mise posée sur **' + rang + '** — total de ta mise sur ce rang : **' + _money(m.montant) + '**. Bonne chance !', flags: eph });
      _armer(t);
      await _refresh(t); return true;
    }

    // Retirer mes mises (entre deux coups)
    if (interaction.isButton() && id === 'faro_pull') {
      const total = _retirerMises(t, interaction.user.id);
      if (!total) { await interaction.reply({ content: 'Tu n\'as aucune mise posée sur le tableau.', flags: eph }); return true; }
      await interaction.reply({ content: '↩️ Tu retires tes mises du tableau : **' + _money(total) + '** de jetons récupérés.', flags: eph });
      _armer(t);
      await _refresh(t); return true;
    }

    // Voir mes mises (info privée, éphémère)
    if (interaction.isButton() && id === 'faro_peek') {
      const ms = _misesDe(t, interaction.user.id);
      const net = t.soldes[interaction.user.id] || 0;
      if (!ms.length) { await interaction.reply({ content: '🔍 Tu n\'as aucune mise en jeu. Solde de la soirée : **' + _signe(net) + '**.', flags: eph }); return true; }
      const lignes = ms.map(m => '• Rang **' + m.rang + '** : ' + _money(m.montant)).join('\n');
      const tot = ms.reduce((a, m) => a + m.montant, 0);
      await interaction.reply({ content: '🔍 **Tes mises en jeu**\n' + lignes + '\n— — —\nTotal engagé : **' + _money(tot) + '**  ·  Solde soirée : **' + _signe(net) + '**', flags: eph });
      return true;
    }

    // Tourner (hôte / banque)
    if (interaction.isButton() && id === 'faro_turn') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (la banque) ou la Direction peut tourner les cartes.', flags: eph }); return true; }
      if (!t.mises.length) { await interaction.reply({ content: 'Aucune mise sur le tableau — inutile de tourner à vide.', flags: eph }); return true; }
      await interaction.deferUpdate().catch(() => {});
      _clearTimer(t);
      _tourner(t);
      t.ambiance = _pick(_phrasesTour);
      _armer(t);
      await _refresh(t); return true;
    }

    // Fermer la table (hôte / banque)
    if (interaction.isButton() && id === 'faro_close') {
      if (!_estHote(t, interaction)) { await interaction.reply({ content: '🔒 Seul l\'hôte (la banque) ou la Direction peut fermer la table.', flags: eph }); return true; }
      _clearTimer(t);
      tables.delete(interaction.channelId);
      const bilan = Object.entries(t.soldes).filter(([, n]) => n).map(([uid, n]) => '• <@' + uid + '> : ' + _signe(n));
      const e = new EmbedBuilder().setColor(0x8a6d3b).setTitle('🎰 Table de Faro fermée')
        .setDescription('Le donneur range la boîte à faro. Merci d\'avoir joué à la maison.' + (bilan.length ? '\n\n**Bilan des jetons :**\n' + bilan.join('\n') + '\n\n🏦 Banque : **' + _signe(t.banque) + '**' : ''))
        .setFooter({ text: 'Iron Wolf Company · Saloon' });
      try { await t.msg?.edit({ embeds: [e], components: [], files: [], attachments: [] }); } catch {}
      await interaction.deferUpdate().catch(() => {});
      return true;
    }

    return true; // customId faro_* pris en charge
  } catch (e) {
    console.log('❌ faro routeInteraction:', e.message);
    try { if (!interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur à la table de Faro.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = {
  routeInteraction,
  installerPanelFaro,
  _test: { _construireSabot, _ajouterMise, _retirerMises, _misesDe, _totalRang, _resoudreCoup, _tourner, _labelDernier, _nouvelleTable, _creerTable, RANGS, tables },
};
