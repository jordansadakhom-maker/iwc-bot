// ============================================================================
//  papiers.js — Module « Papiers RP » pour le bot IWC / La Confrérie
//  ----------------------------------------------------------------------------
//  Module ISOLÉ : tout est préfixé "papier_". Ne touche NI à /engagement,
//  NI à /contrat, NI à aucune autre commande existante.
//
//  8 commandes :
//   /recu     — reçu / quittance
//   /dette    — reconnaissance de dette (avec bouton « Signer »)
//   /casier   — fiche (membre ou cible)
//   /ordre    — ordre de mission
//   /carte    — carte de membre
//   /billet   — le billet de la Confrérie laissé après un coup
//   /code     — affiche le Code + bouton « Je jure »
//   /papiers  — consulte les derniers papiers archivés
//
//  Le déploiement des commandes est géré par index.js (voir README).
// ============================================================================

const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  SlashCommandBuilder, MessageFlags,
  WebhookClient, StringSelectMenuBuilder,
} = require('discord.js');

// ─────────────────────────────── CONFIG ────────────────────────────────────
const CONFIG = {
  // Salon où TOUS les papiers sont archivés (consultable avec /papiers)
  REGISTRE_CHANNEL_ID: '1516948864056168498',

  // Ton serveur (utilisé uniquement si tu lances un déploiement manuel)
  GUILD_ID: '1508282392928977038',

  // Déploiement géré par index.js → on laisse sur false (voir README).
  AUTO_DEPLOY: false,
};
// ────────────────────────────────────────────────────────────────────────────

// ─────────────────── SERVEURS ALLIÉS (RP inter-serveurs) ───────────────────
//  Permet d'envoyer un papier sur un AUTRE serveur, en tant que « La Confrérie »
//  (ton compte n'apparaît JAMAIS). Un bouton « Transmettre à un allié » apparaît
//  alors sous chaque papier.
//
//  ⚠️ Ça ne marche QUE sur les serveurs qui t'ont DONNÉ une URL de webhook —
//     donc des serveurs ALLIÉS / partenaires RP. Impossible de poster sur un
//     serveur qui n'a rien demandé.
//
//  Comment obtenir une URL : sur LEUR serveur, un admin va sur le salon cible →
//  « Modifier le salon » → « Intégrations » → « Webhooks » → « Nouveau webhook »
//  → « Copier l'URL ». Garde ces URL SECRÈTES.
//
//  Ajoute tes alliés ci-dessous (enlève les // devant les lignes d'exemple) :
const CONFRERIE_AVATAR = ''; // (optionnel) URL d'une image (logo loup) pour l'avatar
const ALLIES = [
  // { nom: 'Saloon de Valentine', url: 'https://discord.com/api/webhooks/123456/abcdef...' },
  // { nom: 'Gang des Corbeaux',   url: 'https://discord.com/api/webhooks/789012/ghijkl...' },
];
// ────────────────────────────────────────────────────────────────────────────

// Palette
const COL = { sepia: 0x8B5A2A, rouge: 0x8B0000, or: 0xC8A45C, vert: 0x2ECC71, gris: 0x555555, bleu: 0x2C3E50 };

const fmtDate  = () => new Date().toLocaleDateString('fr-FR', { day: '2-digit', month: 'long', year: 'numeric' });
const fmtHeure = () => new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const ref = (p) => `${p}-${Date.now().toString().slice(-5)}`;

// Un membre de l'équipe = possède au moins un rôle autre que @everyone et n'est pas « visiteur »
function estMembre(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => r.name !== '@everyone' && !r.name.toLowerCase().includes('visiteur')) || false;
}

// Archive une copie d'un papier dans le salon registre
async function archiver(client, embed, typeLabel, auteur) {
  try {
    const ch = await client.channels.fetch(CONFIG.REGISTRE_CHANNEL_ID).catch(() => null);
    if (!ch) { console.log('⚠️ papiers: salon registre introuvable (REGISTRE_CHANNEL_ID).'); return; }
    await ch.send({ content: `📋 **${typeLabel}** — par ${auteur} · ${fmtDate()}`, embeds: [embed] }).catch(() => {});
  } catch (e) { console.log('❌ papiers archiver:', e.message); }
}

// ───────────────── Bouton « Transmettre à un allié » (anonyme) ──────────────
// N'apparaît que si au moins un serveur allié est configuré dans ALLIES.
function boutonTransmettre() {
  if (!ALLIES.length) return null;
  return new ButtonBuilder()
    .setCustomId('papier_transmit')
    .setLabel('📤 Transmettre à un allié')
    .setStyle(ButtonStyle.Secondary);
}
// Construit la rangée de boutons d'un papier (boutons éventuels + transmit)
function rowsAvecTransmit(...extraButtons) {
  const btns = [...extraButtons].filter(Boolean);
  const t = boutonTransmettre();
  if (t) btns.push(t);
  if (!btns.length) return [];
  return [new ActionRowBuilder().addComponents(...btns)];
}

// ───────────────────── DÉFINITION DES 8 COMMANDES ──────────────────────────
const papiersCommands = [
  new SlashCommandBuilder().setName('recu').setDescription('🧾 Établir un reçu / une quittance'),
  new SlashCommandBuilder().setName('dette').setDescription('📜 Rédiger une reconnaissance de dette'),
  new SlashCommandBuilder().setName('casier').setDescription('🗂️ Créer une fiche (membre ou cible)'),
  new SlashCommandBuilder().setName('ordre').setDescription('🎖️ Émettre un ordre de mission'),
  new SlashCommandBuilder().setName('carte').setDescription('🎴 Délivrer une carte de membre'),
  new SlashCommandBuilder().setName('billet').setDescription('🃏 Laisser le billet de la Confrérie'),
  new SlashCommandBuilder().setName('code').setDescription('📖 Afficher le Code de la Confrérie').addUserOption(o => o.setName('membre').setDescription('Envoyer le Code en privé à ce membre (DM)').setRequired(false)),
  new SlashCommandBuilder().setName('papiers').setDescription('📒 Consulter les derniers papiers archivés'),
].map(c => c.toJSON());

const NOMS = ['recu', 'dette', 'casier', 'ordre', 'carte', 'billet', 'code', 'papiers'];

// ─────────────────────────── MODALS (formulaires) ──────────────────────────
function buildModal(cmd) {
  const ti = (id, label, style, req, ph, max) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(req);
    if (ph) t.setPlaceholder(ph);
    if (max) t.setMaxLength(max);
    return new ActionRowBuilder().addComponents(t);
  };
  const S = TextInputStyle.Short, P = TextInputStyle.Paragraph;

  if (cmd === 'recu') {
    return new ModalBuilder().setCustomId('papier_modal_recu').setTitle('🧾 Reçu / Quittance').addComponents(
      ti('beneficiaire', 'Bénéficiaire (qui reçoit le reçu)', S, true, 'Ex : M. Hawthorne', 100),
      ti('objet', 'Objet (mission, marchandise…)', S, true, 'Ex : Escorte de convoi jusqu\'à Valentine', 120),
      ti('montant', 'Montant', S, true, 'Ex : 250 $', 60),
      ti('detail', 'Détails (optionnel)', P, false, 'Conditions, lieu, mentions…', 500),
    );
  }
  if (cmd === 'dette') {
    return new ModalBuilder().setCustomId('papier_modal_dette').setTitle('📜 Reconnaissance de dette').addComponents(
      ti('debiteur', 'Débiteur (celui qui doit)', S, true, 'Ex : Cole Ferguson', 100),
      ti('creancier', 'Créancier (celui à qui on doit)', S, true, 'Ex : La Confrérie', 100),
      ti('montant', 'Montant dû', S, true, 'Ex : 500 $', 60),
      ti('echeance', 'Échéance', S, false, 'Ex : Avant la fin du mois', 80),
      ti('motif', 'Motif de la dette', P, true, 'Pourquoi cette dette ?', 500),
    );
  }
  if (cmd === 'casier') {
    return new ModalBuilder().setCustomId('papier_modal_casier').setTitle('🗂️ Fiche / Casier').addComponents(
      ti('nom', 'Nom / Alias', S, true, 'Ex : « Le Corbeau »', 100),
      ti('statut', 'Statut (membre ou cible)', S, true, 'membre  ·  cible', 40),
      ti('description', 'Description', P, true, 'Apparence, rôle, réputation…', 600),
      ti('faits', 'Faits connus', P, false, 'Ce qu\'on sait, ce qu\'il/elle a fait…', 600),
      ti('notes', 'Notes (optionnel)', S, false, 'À surveiller, contacts…', 120),
    );
  }
  if (cmd === 'ordre') {
    return new ModalBuilder().setCustomId('papier_modal_ordre').setTitle('🎖️ Ordre de mission').addComponents(
      ti('operation', 'Nom de l\'opération', S, true, 'Ex : Opération Cendres', 100),
      ti('objectif', 'Cible / Objectif', S, true, 'Ex : Récupérer la cargaison volée', 120),
      ti('assignes', 'Membres assignés', S, false, 'Ex : Coldt, Sean, Casey', 120),
      ti('quand', 'Date / Heure', S, false, 'Ex : Ce soir, 21h', 80),
      ti('consignes', 'Consignes', P, false, 'Discrétion, matériel, repli…', 600),
    );
  }
  if (cmd === 'carte') {
    return new ModalBuilder().setCustomId('papier_modal_carte').setTitle('🎴 Carte de membre').addComponents(
      ti('nom', 'Nom du personnage', S, true, 'Ex : Jonas Caverly', 100),
      ti('grade', 'Grade', S, true, 'Ex : Bras droit', 80),
      ti('entree', 'Date d\'entrée', S, false, 'Ex : 1899', 40),
      ti('mention', 'Mention (optionnel)', S, false, 'Ex : Membre fondateur', 100),
    );
  }
  if (cmd === 'billet') {
    return new ModalBuilder().setCustomId('papier_modal_billet').setTitle('🃏 Billet de la Confrérie').addComponents(
      ti('message', 'Mot à laisser (optionnel)', P, false, 'Laisse vide pour le billet standard.', 400),
    );
  }
  return null;
}

// ─────────────────────────── EMBEDS (papiers finis) ────────────────────────
function bandeau(titre) {
  return '```\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' + titre + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n```';
}

function embedRecu(f, auteur) {
  return new EmbedBuilder().setColor(COL.sepia).setTitle('🧾 REÇU — IRON WOLF COMPANY')
    .setDescription(bandeau('   QUITTANCE — POUR SOLDE DE TOUT COMPTE'))
    .addFields(
      { name: '🆔 Référence', value: '`' + ref('RECU') + '`', inline: true },
      { name: '📅 Date', value: fmtDate(), inline: true },
      { name: '✍️ Établi par', value: auteur, inline: true },
      { name: '👤 Bénéficiaire', value: f.beneficiaire, inline: false },
      { name: '📋 Objet', value: f.objet, inline: false },
      { name: '💰 Montant', value: `**${f.montant}**`, inline: true },
      ...(f.detail ? [{ name: '📝 Détails', value: f.detail }] : []),
    ).setFooter({ text: 'Iron Wolf Company • Reçu officiel' }).setTimestamp();
}

function embedDette(f, auteur, signePar) {
  const e = new EmbedBuilder().setColor(signePar ? COL.vert : COL.sepia).setTitle('📜 RECONNAISSANCE DE DETTE')
    .setDescription(bandeau('   ENGAGEMENT DE REMBOURSEMENT'))
    .addFields(
      { name: '🆔 Référence', value: '`' + ref('DETTE') + '`', inline: true },
      { name: '📅 Établie le', value: fmtDate(), inline: true },
      { name: '✍️ Rédigée par', value: auteur, inline: true },
      { name: '👤 Débiteur', value: f.debiteur, inline: true },
      { name: '🤝 Créancier', value: f.creancier, inline: true },
      { name: '💰 Montant dû', value: `**${f.montant}**`, inline: true },
      ...(f.echeance ? [{ name: '⏳ Échéance', value: f.echeance, inline: true }] : []),
      { name: '⚖️ Motif', value: f.motif },
      { name: '🖋️ Signature', value: signePar ? `✅ Signé par **${signePar}** le ${fmtDate()}` : '*En attente de signature du débiteur — bouton ci-dessous.*' },
    ).setFooter({ text: 'La parole donnée vaut engagement.' }).setTimestamp();
  return e;
}

function embedCasier(f, auteur) {
  const cible = (f.statut || '').toLowerCase().includes('cible');
  return new EmbedBuilder().setColor(cible ? COL.rouge : COL.bleu)
    .setTitle(`🗂️ ${cible ? 'FICHE — CIBLE' : 'FICHE — MEMBRE'}`)
    .setDescription(bandeau(cible ? '   DOSSIER DE SURVEILLANCE' : '   FICHE D\'IDENTITÉ'))
    .addFields(
      { name: '🆔 Référence', value: '`' + ref('FICHE') + '`', inline: true },
      { name: '📅 Date', value: fmtDate(), inline: true },
      { name: '✍️ Établi par', value: auteur, inline: true },
      { name: '👤 Nom / Alias', value: `**${f.nom}**`, inline: true },
      { name: '🏷️ Statut', value: cible ? '🎯 Cible' : '🐺 Membre', inline: true },
      { name: '📖 Description', value: f.description },
      ...(f.faits ? [{ name: '🔎 Faits connus', value: f.faits }] : []),
      ...(f.notes ? [{ name: '📝 Notes', value: f.notes }] : []),
    ).setFooter({ text: 'La vérité a un prix. Nous le faisons payer aux autres.' }).setTimestamp();
}

function embedOrdre(f, auteur) {
  return new EmbedBuilder().setColor(COL.rouge).setTitle('🎖️ ORDRE DE MISSION')
    .setDescription(bandeau('   PAR ORDRE DE LA DIRECTION'))
    .addFields(
      { name: '🆔 Référence', value: '`' + ref('ORDRE') + '`', inline: true },
      { name: '📅 Émis le', value: fmtDate(), inline: true },
      { name: '✍️ Signé par', value: auteur, inline: true },
      { name: '🎯 Opération', value: `**${f.operation}**` },
      { name: '⚔️ Cible / Objectif', value: f.objectif },
      ...(f.assignes ? [{ name: '👥 Assignés', value: f.assignes, inline: true }] : []),
      ...(f.quand ? [{ name: '🕐 Quand', value: f.quand, inline: true }] : []),
      ...(f.consignes ? [{ name: '📋 Consignes', value: f.consignes }] : []),
    ).setFooter({ text: 'Exécution sans faute. — La Direction' }).setTimestamp();
}

function embedCarte(f, auteur) {
  return new EmbedBuilder().setColor(COL.or).setTitle('🎴 CARTE DE MEMBRE')
    .setDescription([
      '```',
      '╔═══════════════════════════════╗',
      '║      LA CONFRÉRIE · 1899       ║',
      '╚═══════════════════════════════╝',
      '```',
    ].join('\n'))
    .addFields(
      { name: '👤 Nom', value: `**${f.nom}**`, inline: true },
      { name: '🎖️ Grade', value: f.grade, inline: true },
      ...(f.entree ? [{ name: '📅 Membre depuis', value: f.entree, inline: true }] : []),
      ...(f.mention ? [{ name: '⭐ Mention', value: f.mention, inline: false }] : []),
      { name: '🆔 N° de carte', value: '`' + ref('CARTE') + '`', inline: true },
      { name: '✍️ Délivrée par', value: auteur, inline: true },
    ).setFooter({ text: 'Cette carte atteste de l\'appartenance à la Confrérie.' }).setTimestamp();
}

function embedBillet(message, auteur) {
  const lignes = ['*« Pris aux puissants, rendu aux oubliés. »*', ''];
  if (message && message.trim()) { lignes.push(message.trim(), ''); }
  lignes.push('— **La Confrérie**');
  return new EmbedBuilder().setColor(COL.rouge).setTitle('🃏 LE BILLET DE LA CONFRÉRIE')
    .setDescription(lignes.join('\n'))
    .setFooter({ text: `Laissé sur les lieux • ${fmtDate()}` }).setTimestamp();
}

function embedCode() {
  return new EmbedBuilder().setColor(COL.rouge).setTitle('📖 LE CODE DE LA CONFRÉRIE')
    .setDescription([
      '*À lire et à jurer avant d\'être des nôtres.*',
      '',
      '**▌ I · DU SILENCE**',
      'Ce qui se dit dans l\'ombre y reste. Une bouche cousue est la première vertu.',
      '',
      '**▌ II · DE LA LOYAUTÉ**',
      'On ne laisse pas un frère derrière. On ne vend pas les siens. Jamais.',
      '',
      '**▌ III · DU PARTAGE**',
      'Pris aux puissants, rendu aux oubliés. Le butin se partage, l\'orgueil se tait.',
      '',
      '**▌ IV · DE LA DISCRÉTION**',
      'Bandana relevé, tenue neutre, aucun nom sur le terrain. On ne laisse pas de trace.',
      '',
      '**▌ V · DE LA PAROLE**',
      'La parole donnée se tient jusqu\'au bout. Qui trahit en répond.',
      '',
      '─────────────────────────',
      'Si tu jures sur l\'honneur de respecter ce Code, clique ci-dessous.',
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • 1899' }).setTimestamp();
}

// ───────────────────────────── HANDLER PRINCIPAL ───────────────────────────
async function gererInteractionPapiers(interaction) {
  try {
    // 1) Commandes slash
    if (interaction.isChatInputCommand?.() && NOMS.includes(interaction.commandName)) {
      const cmd = interaction.commandName;

      if (!estMembre(interaction.member)) {
        return interaction.reply({ content: '🔒 Réservé aux membres de la Compagnie.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      // /code → affiche le Code + bouton « Je jure » (ou l'envoie en DM à un membre)
      if (cmd === 'code') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('papier_code_jurer').setLabel('🤝 Je jure sur l\'honneur').setStyle(ButtonStyle.Success),
        );
        const cible = interaction.options.getUser?.('membre');
        if (cible) {
          try {
            const dest = await interaction.guild?.members.fetch(cible.id).catch(() => null) || cible;
            await dest.send({ embeds: [embedCode()], components: [row] });
            return interaction.reply({ content: `📨 Le Code de la Confrérie a été envoyé à <@${cible.id}> en privé. Il pourra jurer directement depuis son message.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          } catch {
            return interaction.reply({ content: `⚠️ Impossible d'envoyer le Code à <@${cible.id}> — ses messages privés sont sûrement fermés.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
        }
        return interaction.reply({ embeds: [embedCode()], components: [row] }).catch(() => {});
      }

      // /papiers → consulter les derniers papiers archivés
      if (cmd === 'papiers') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const ch = await interaction.client.channels.fetch(CONFIG.REGISTRE_CHANNEL_ID).catch(() => null);
        if (!ch) return interaction.editReply({ content: '⚠️ Salon registre introuvable. Vérifie REGISTRE_CHANNEL_ID dans papiers.js.' });
        const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
        if (!msgs) return interaction.editReply({ content: '⚠️ Impossible de lire le salon registre (permissions ?).' });
        const papiers = [...msgs.values()]
          .filter(m => m.author.id === interaction.client.user.id && m.embeds?.length > 0)
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          .slice(0, 12);
        if (!papiers.length) return interaction.editReply({ content: '📭 Aucun papier archivé pour le moment.' });
        const lignes = papiers.map(m => {
          const titre = (m.embeds[0]?.title || 'Papier').replace(/[*_`]/g, '');
          const quand = `<t:${Math.floor(m.createdTimestamp / 1000)}:R>`;
          return `• [**${titre}**](${m.url}) — ${quand}`;
        });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COL.sepia)
          .setTitle('📒 Derniers papiers archivés')
          .setDescription(lignes.join('\n'))
          .setFooter({ text: `${papiers.length} papier(s) affiché(s)` })] });
      }

      // Les autres → on ouvre un formulaire (modal)
      const modal = buildModal(cmd);
      if (modal) return interaction.showModal(modal).catch(e => console.log('⚠️ papiers showModal:', e.message));
      return;
    }

    // 2) Soumission des formulaires
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('papier_modal_')) {
      const type = interaction.customId.replace('papier_modal_', '');
      await interaction.deferReply().catch(() => {});
      const auteur = interaction.member?.displayName || interaction.user.username;
      const g = (id) => { try { return interaction.fields.getTextInputValue(id); } catch { return ''; } };

      let embed, label;
      if (type === 'recu')   { embed = embedRecu({ beneficiaire: g('beneficiaire'), objet: g('objet'), montant: g('montant'), detail: g('detail') }, auteur); label = 'Reçu'; }
      else if (type === 'casier') { embed = embedCasier({ nom: g('nom'), statut: g('statut'), description: g('description'), faits: g('faits'), notes: g('notes') }, auteur); label = 'Fiche / Casier'; }
      else if (type === 'ordre')  { embed = embedOrdre({ operation: g('operation'), objectif: g('objectif'), assignes: g('assignes'), quand: g('quand'), consignes: g('consignes') }, auteur); label = 'Ordre de mission'; }
      else if (type === 'carte')  { embed = embedCarte({ nom: g('nom'), grade: g('grade'), entree: g('entree'), mention: g('mention') }, auteur); label = 'Carte de membre'; }
      else if (type === 'billet') { embed = embedBillet(g('message'), auteur); label = 'Billet de la Confrérie'; }
      else if (type === 'dette') {
        embed = embedDette({ debiteur: g('debiteur'), creancier: g('creancier'), montant: g('montant'), echeance: g('echeance'), motif: g('motif') }, auteur);
        label = 'Reconnaissance de dette';
        const signer = new ButtonBuilder().setCustomId('papier_dette_signer').setLabel('✍️ Signer la dette').setStyle(ButtonStyle.Success);
        await interaction.editReply({ embeds: [embed], components: rowsAvecTransmit(signer) }).catch(() => {});
        await archiver(interaction.client, embed, label, auteur);
        return;
      }

      if (!embed) return interaction.editReply({ content: '⚠️ Type de papier inconnu.' }).catch(() => {});
      await interaction.editReply({ embeds: [embed], components: rowsAvecTransmit() }).catch(() => {});
      await archiver(interaction.client, embed, label, auteur);
      return;
    }

    // 3) Boutons
    if (interaction.isButton?.() && interaction.customId === 'papier_dette_signer') {
      const signataire = interaction.member?.displayName || interaction.user.username;
      const base = interaction.message.embeds?.[0];
      if (!base) return interaction.reply({ content: '⚠️ Document introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const e = EmbedBuilder.from(base).setColor(COL.vert);
      const fields = (base.fields || []).map(f => f.name.includes('Signature')
        ? { name: '🖋️ Signature', value: `✅ Signé par **${signataire}** le ${fmtDate()} à ${fmtHeure()}`, inline: false }
        : f);
      e.setFields(fields);
      return interaction.update({ embeds: [e], components: [] }).catch(() => {});
    }

    if (interaction.isButton?.() && interaction.customId === 'papier_code_jurer') {
      const jureur = interaction.member?.displayName || interaction.user.username;
      const e = new EmbedBuilder().setColor(COL.vert).setTitle('🤝 Serment prêté')
        .setDescription(`**${jureur}** a juré sur l'honneur de respecter le Code de la Confrérie.`)
        .setFooter({ text: `La Confrérie • ${fmtDate()} à ${fmtHeure()}` }).setTimestamp();
      await archiver(interaction.client, e, 'Serment (Code)', jureur);
      return interaction.reply({ content: '🤝 Ton serment est enregistré. Bienvenue parmi les nôtres.', flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // Bouton « Transmettre à un allié » → propose la liste des serveurs alliés
    if (interaction.isButton?.() && interaction.customId === 'papier_transmit') {
      if (!ALLIES.length) {
        return interaction.reply({ content: '⚠️ Aucun serveur allié configuré. Ajoute-les dans la liste `ALLIES` (en haut de papiers.js).', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
      const base = interaction.message?.embeds?.[0];
      if (!base) return interaction.reply({ content: '⚠️ Papier introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const select = new StringSelectMenuBuilder()
        .setCustomId(`papier_transmit_go:${interaction.channelId}:${interaction.message.id}`)
        .setPlaceholder('Choisis le serveur allié…')
        .addOptions(ALLIES.slice(0, 25).map((a, i) => ({ label: (a.nom || `Allié ${i + 1}`).slice(0, 100), value: String(i) })));
      return interaction.reply({
        content: '📤 Sur quel serveur allié veux-tu **laisser ce papier** (anonymement, en tant que « La Confrérie ») ?',
        components: [new ActionRowBuilder().addComponents(select)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    // Sélection de l'allié → envoi anonyme via webhook
    if (interaction.isStringSelectMenu?.() && interaction.customId?.startsWith('papier_transmit_go:')) {
      await interaction.update({ content: '📤 Transmission en cours…', components: [] }).catch(() => {});
      const [, channelId, messageId] = interaction.customId.split(':');
      const idx = parseInt(interaction.values[0], 10);
      const allie = ALLIES[idx];
      if (!allie || !allie.url) return interaction.editReply({ content: '⚠️ Serveur allié introuvable.' }).catch(() => {});

      // Récupère le papier d'origine pour le renvoyer tel quel
      let embed = null;
      try {
        const ch = await interaction.client.channels.fetch(channelId);
        const msg = await ch.messages.fetch(messageId);
        if (msg.embeds?.[0]) embed = EmbedBuilder.from(msg.embeds[0]).toJSON();
      } catch { /* ignore */ }
      if (!embed) return interaction.editReply({ content: '⚠️ Impossible de retrouver le papier à transmettre.' }).catch(() => {});

      // Envoi via le webhook de l'allié → apparaît comme « La Confrérie »
      try {
        const wh = new WebhookClient({ url: allie.url });
        await wh.send({
          username: 'La Confrérie',
          ...(CONFRERIE_AVATAR ? { avatarURL: CONFRERIE_AVATAR } : {}),
          embeds: [embed],
        });
        return interaction.editReply({ content: `✅ Papier laissé sur **${allie.nom}** — signé « La Confrérie », sans aucune trace de ton compte.` }).catch(() => {});
      } catch (e) {
        console.log('❌ papiers webhook:', e.message);
        return interaction.editReply({ content: `❌ Échec de l'envoi vers **${allie.nom}**. Vérifie que l'URL du webhook est correcte et toujours active.` }).catch(() => {});
      }
    }
  } catch (e) {
    console.log('❌ papiers handler:', e.message);
    try {
      const msg = { content: '⚠️ Une erreur est survenue avec ce papier.', flags: MessageFlags.Ephemeral };
      if (interaction.deferred) interaction.editReply(msg).catch(() => {});
      else if (!interaction.replied) interaction.reply(msg).catch(() => {});
    } catch {}
  }
}

// ───────────────── (OPTIONNEL) déploiement manuel autonome ──────────────────
async function deployerPapiers(client) {
  if (!CONFIG.AUTO_DEPLOY) return;
  try {
    const guild = client.guilds.cache.get(CONFIG.GUILD_ID) || client.guilds.cache.first();
    if (!guild) { console.log('⚠️ papiers AUTO_DEPLOY: serveur introuvable.'); return; }
    const existantes = await guild.commands.fetch().catch(() => null);
    const base = existantes ? [...existantes.values()].map(c => c.toJSON()) : [];
    const noms = new Set(papiersCommands.map(c => c.name));
    const fusion = [...base.filter(c => !noms.has(c.name)), ...papiersCommands];
    await guild.commands.set(fusion);
    console.log('✅ papiers: 8 commandes déployées (AUTO_DEPLOY).');
  } catch (e) { console.log('❌ papiers AUTO_DEPLOY:', e.message); }
}

// ─────────────────────────────── INIT ──────────────────────────────────────
function initPapiers(client) {
  // Écouteur dédié : ne gère QUE les interactions « papier_ » et les 8 commandes.
  client.on('interactionCreate', (interaction) => { gererInteractionPapiers(interaction); });

  // Si AUTO_DEPLOY=true, déploie les commandes au démarrage (sinon index.js s'en charge)
  if (CONFIG.AUTO_DEPLOY) {
    if (client.isReady()) deployerPapiers(client);
    else client.once('clientReady', () => deployerPapiers(client));
  }
  console.log('📜 Module Papiers RP chargé (8 commandes).');
}

module.exports = { initPapiers, papiersCommands };
