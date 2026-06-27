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
  SlashCommandBuilder, MessageFlags, AttachmentBuilder,
  WebhookClient, StringSelectMenuBuilder, UserSelectMenuBuilder,
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

// Préfixe de référence par type de papier (pour le tampon + le filtre /papiers)
const PREFIX_REF = { recu: 'REÇU', dette: 'DETTE', casier: 'FICHE', ordre: 'ORDRE', carte: 'CARTE', billet: 'BILLET', wanted: 'AVIS', code: 'CODE' };
// Papiers qui concernent une personne précise → peuvent lui être envoyés en DM pour validation
const ENVOYABLE = ['recu', 'dette', 'ordre', 'carte'];
// Appose une référence unique en pied de page (sans effacer le pied existant)
function tamponRef(embed, type) {
  const reference = ref(PREFIX_REF[type] || 'DOC');
  const prev = embed?.data?.footer?.text || '';
  embed.setFooter({ text: prev ? `${prev}  •  Réf. ${reference}` : `Réf. ${reference}` });
  return reference;
}

// Un membre de l'équipe = possède au moins un rôle autre que @everyone et n'est pas « visiteur »
function estMembre(member) {
  if (!member) return false;
  return member.roles?.cache?.some(r => r.name !== '@everyone' && !r.name.toLowerCase().includes('visiteur')) || false;
}

// Direction de la Confrérie (pour réserver l'envoi du Code)
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil'];
// Membres de La Confrérie (pôle illégal) — à pinger sur un avis de recherche (mêmes rôles que index.js)
const CONFRERIE_ROLE_NAMES = ['Concepteur', 'Fléau', 'fleau', 'Exécuteur', 'éxécuteur', 'execu', 'Condamné', 'condamne', 'Maudit', 'Confrérie', 'confrerie'];
function estDirection(member) {
  return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n)));
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
  new SlashCommandBuilder().setName('wanted').setDescription('🔫 Émettre un avis de recherche (Direction)'),
  new SlashCommandBuilder().setName('wanted-liste').setDescription('📋 Liste des avis de recherche actifs (dans ce salon)'),
  new SlashCommandBuilder().setName('code').setDescription('📖 Afficher le Code de la Confrérie').addUserOption(o => o.setName('membre').setDescription('Envoyer le Code en privé à ce membre (DM)').setRequired(false)).addBooleanOption(o => o.setName('tous').setDescription('Envoyer le Code à TOUS les membres en privé (Direction)').setRequired(false)),
  new SlashCommandBuilder().setName('papiers').setDescription('📒 Consulter les derniers papiers archivés')
    .addStringOption(o => o.setName('type').setDescription('Filtrer par type de papier').setRequired(false).addChoices(
      { name: 'Reçu', value: 'recu' }, { name: 'Dette', value: 'dette' }, { name: 'Fiche / Casier', value: 'casier' },
      { name: 'Ordre de mission', value: 'ordre' }, { name: 'Carte de membre', value: 'carte' }, { name: 'Billet', value: 'billet' },
      { name: 'Avis de recherche', value: 'wanted' }, { name: 'Serment (Code)', value: 'code' },
    ))
    .addStringOption(o => o.setName('recherche').setDescription('Chercher un nom ou un mot-clé').setRequired(false)),
].map(c => c.toJSON());

const NOMS = ['recu', 'dette', 'casier', 'ordre', 'carte', 'billet', 'code', 'wanted', 'wanted-liste', 'papiers'];

// ─────────────────────────── MODALS (formulaires) ──────────────────────────
function buildModal(cmd) {
  const ti = (id, label, style, req, ph, max) => {
    const t = new TextInputBuilder().setCustomId(id).setLabel(label).setStyle(style).setRequired(req);
    if (ph) t.setPlaceholder(ph);
    if (max) t.setMaxLength(max);
    return new ActionRowBuilder().addComponents(t);
  };
  const S = TextInputStyle.Short, P = TextInputStyle.Paragraph;

  if (cmd === 'wanted') {
    return new ModalBuilder().setCustomId('papier_modal_wanted').setTitle('🔫 Avis de recherche').addComponents(
      ti('nom', 'Nom du recherché (personnage)', S, true, 'Ex : Cole Bishop'),
      ti('crime', 'Chef d\'accusation / ce qu\'il a fait', P, true, 'Ex : a trahi la Confrérie et balancé deux des nôtres.', 400),
      ti('prime', 'Prime (récompense)', S, true, 'Ex : 500$ mort · 800$ vif'),
      ti('position', 'Dernière position connue (facultatif)', S, false, 'Ex : aperçu près de Valentine'),
      ti('image', 'Portrait — lien image (sinon photo après)', S, false, 'https://…  ou laisse vide : bouton « 📎 photo » après'),
    );
  }

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
      'Ici, on ne signe pas à l\'encre. On scelle le Code **dans le sang**.',
      'Si tu es prêt à jurer, **appose ta marque** ci-dessous.',
    ].join('\n'))
    .setFooter({ text: 'La Confrérie • 1899' }).setTimestamp();
}

function embedWanted({ nom, crime, prime, position, statut, image }) {
  const st = (statut && statut.trim()) ? statut.trim() : 'MORT OU VIF';
  const e = new EmbedBuilder().setColor(COL.sepia)
    .setTitle('🔫  AVIS DE RECHERCHE  🔫')
    .setDescription([
      '```',
      '  ★ ─────────────────────────── ★',
      '          R E C H E R C H É',
      `            ${st.toUpperCase()}`,
      '  ★ ─────────────────────────── ★',
      '```',
      'Par ordre de **La Confrérie**, l\'individu ci-dessous est activement recherché.',
      '*Qui le croise est prié d\'agir — ou de prévenir les nôtres. La Confrérie n\'oublie pas, et elle paie ses dettes.*',
    ].join('\n'))
    .addFields(
      { name: '📛 Nom', value: `**${nom || '—'}**`, inline: false },
      { name: '⚖️ Chef d\'accusation', value: crime || '—', inline: false },
      { name: '💰 Prime', value: prime || '—', inline: true },
      { name: '🩸 Statut', value: st, inline: true },
      ...((position && position.trim()) ? [{ name: '📍 Dernière position connue', value: position, inline: false }] : []),
      { name: '\u200b', value: '⚠️ *Considéré comme dangereux. Ne sous-estime jamais un rat acculé.*', inline: false },
    )
    .setFooter({ text: `La Confrérie • Avis de recherche • ${fmtDate()}` })
    .setTimestamp();
  if (image && /^https?:\/\/\S+/i.test(image.trim())) e.setImage(image.trim());
  return e;
}

// Envoie un papier en MP à une personne (membre OU n'importe quel ID Discord), avec bouton de validation
async function envoyerPapierA(interaction, channelId, messageId, type, senderId, cibleIdRaw) {
  const cibleId = String(cibleIdRaw || '').replace(/\D/g, '');
  if (!/^\d{15,21}$/.test(cibleId)) {
    return interaction.editReply({ content: '⚠️ ID Discord invalide. Donne un ID numérique (Mode développeur → clic droit sur le profil → « Copier l\'identifiant »).' }).catch(() => {});
  }
  // Récupère le papier d'origine
  let embedJSON = null;
  try {
    const ch = await interaction.client.channels.fetch(channelId);
    const msg = await ch.messages.fetch(messageId);
    if (msg.embeds?.[0]) embedJSON = EmbedBuilder.from(msg.embeds[0]).toJSON();
  } catch { /* ignore */ }
  if (!embedJSON) return interaction.editReply({ content: '⚠️ Document introuvable (message supprimé ?).' }).catch(() => {});

  // Bouton de validation pour le destinataire
  const labelValide = type === 'dette' ? '✍️ Signer la dette' : '✅ Confirmer la réception';
  const btn = new ButtonBuilder().setCustomId(`papier_valider:${channelId}:${messageId}:${type}:${senderId}`).setLabel(labelValide).setStyle(ButtonStyle.Success);

  let user;
  try { user = await interaction.client.users.fetch(cibleId); }
  catch { return interaction.editReply({ content: `⚠️ Aucun utilisateur Discord trouvé avec l'ID \`${cibleId}\`.` }).catch(() => {}); }
  const nomCible = user.username || cibleId;

  try {
    await user.send({
      content: '📨 **La Confrérie t\'a transmis un document.** Lis-le, puis valide-le ci-dessous.',
      embeds: [embedJSON],
      components: [new ActionRowBuilder().addComponents(btn)],
    });
  } catch {
    return interaction.editReply({ content: `⚠️ Impossible d'envoyer un MP à **${nomCible}**. Il faut qu'il partage au moins un serveur avec le bot et que ses messages privés soient ouverts.` }).catch(() => {});
  }

  // Marque le papier d'origine « en attente de validation »
  try {
    const ch = await interaction.client.channels.fetch(channelId);
    const msg = await ch.messages.fetch(messageId);
    const base = msg.embeds?.[0];
    if (base) {
      const e = EmbedBuilder.from(base);
      const fields = (base.fields || []).filter(f => !f.name.includes('Transmission') && !f.name.includes('Validation'));
      fields.push({ name: '📨 Transmission', value: `Envoyé à **${nomCible}** le ${fmtDate()} — *en attente de validation*`, inline: false });
      e.setFields(fields);
      await msg.edit({ embeds: [e] }).catch(() => {});
    }
  } catch { /* ignore */ }

  return interaction.editReply({ content: `✅ Document envoyé en MP à **${nomCible}**. Tu seras notifié dans le salon dès qu'il l'aura validé.` }).catch(() => {});
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

      if (cmd === 'wanted' && !estDirection(interaction.member)) {
        return interaction.reply({ content: '🔒 Émettre un avis de recherche est réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }

      // /code → affiche le Code, ou l'envoie en DM (à un membre, ou à tous). Envoi réservé à la Direction.
      if (cmd === 'code') {
        const row = new ActionRowBuilder().addComponents(
          new ButtonBuilder().setCustomId('papier_code_jurer').setLabel('🩸 Apposer ma marque de sang').setStyle(ButtonStyle.Danger),
        );
        const cible = interaction.options.getUser?.('membre');
        const tous  = interaction.options.getBoolean?.('tous');

        // → Envoi à TOUS les membres en privé (Direction)
        if (tous) {
          if (!estDirection(interaction.member)) {
            return interaction.reply({ content: '🔒 Seule la Direction peut envoyer le Code à tous les membres.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
          const membres = await interaction.guild.members.fetch().catch(() => null);
          if (!membres) return interaction.editReply({ content: '⚠️ Impossible de récupérer la liste des membres.' }).catch(() => {});
          const destinataires = [...membres.values()].filter(m => !m.user.bot && estMembre(m));
          let ok = 0, ko = 0;
          for (const m of destinataires) {
            try { await m.send({ embeds: [embedCode()], components: [row] }); ok++; }
            catch { ko++; }
            await new Promise(r => setTimeout(r, 600)); // anti rate-limit Discord
          }
          return interaction.editReply({ content: `📨 Code envoyé à **${ok}** membre(s) en privé.${ko ? ` ⚠️ ${ko} n'ont pas pu être joints (DM fermés).` : ''}` }).catch(() => {});
        }

        // → Envoi en privé à un membre précis (Direction)
        if (cible) {
          if (!estDirection(interaction.member)) {
            return interaction.reply({ content: '🔒 Seule la Direction peut envoyer le Code à un membre.', flags: MessageFlags.Ephemeral }).catch(() => {});
          }
          try {
            const dest = await interaction.guild?.members.fetch(cible.id).catch(() => null) || cible;
            await dest.send({ embeds: [embedCode()], components: [row] });
            return interaction.reply({ content: `📨 Le Code de la Confrérie a été envoyé à <@${cible.id}> en privé. Il pourra jurer directement depuis son message.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          } catch {
            return interaction.reply({ content: `⚠️ Impossible d'envoyer le Code à <@${cible.id}> — ses messages privés sont sûrement fermés.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          }
        }

        // → Affichage normal dans le salon (tout membre)
        return interaction.reply({ embeds: [embedCode()], components: [row] }).catch(() => {});
      }

      // /papiers → consulter les derniers papiers archivés
      if (cmd === 'papiers') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const fType = interaction.options.getString('type');
        const fRech = (interaction.options.getString('recherche') || '').trim().toLowerCase();
        const ch = await interaction.client.channels.fetch(CONFIG.REGISTRE_CHANNEL_ID).catch(() => null);
        if (!ch) return interaction.editReply({ content: '⚠️ Salon registre introuvable. Vérifie REGISTRE_CHANNEL_ID dans papiers.js.' });
        const msgs = await ch.messages.fetch({ limit: (fType || fRech) ? 100 : 30 }).catch(() => null);
        if (!msgs) return interaction.editReply({ content: '⚠️ Impossible de lire le salon registre (permissions ?).' });
        let papiers = [...msgs.values()].filter(m => m.author.id === interaction.client.user.id && m.embeds?.length > 0);
        if (fType) {
          const pref = `${PREFIX_REF[fType] || '∅'}-`;
          papiers = papiers.filter(m => (m.embeds[0]?.footer?.text || '').includes(pref));
        }
        if (fRech) {
          papiers = papiers.filter(m => {
            const e = m.embeds[0];
            const hay = [e.title, e.description, ...(e.fields || []).flatMap(f => [f.name, f.value]), e.footer?.text]
              .filter(Boolean).join(' ').toLowerCase();
            return hay.includes(fRech);
          });
        }
        papiers = papiers.sort((a, b) => b.createdTimestamp - a.createdTimestamp).slice(0, 12);
        if (!papiers.length) return interaction.editReply({ content: (fType || fRech) ? '📭 Aucun papier ne correspond à ce filtre.' : '📭 Aucun papier archivé pour le moment.' });
        const lignes = papiers.map(m => {
          const titre = (m.embeds[0]?.title || 'Papier').replace(/[*_`]/g, '');
          const quand = `<t:${Math.floor(m.createdTimestamp / 1000)}:R>`;
          return `• [**${titre}**](${m.url}) — ${quand}`;
        });
        const sousTitre = [fType ? `type : ${fType}` : null, fRech ? `recherche : « ${fRech} »` : null].filter(Boolean).join(' · ');
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COL.sepia)
          .setTitle('📒 Papiers archivés' + (sousTitre ? ` — ${sousTitre}` : ''))
          .setDescription(lignes.join('\n'))
          .setFooter({ text: `${papiers.length} papier(s) affiché(s)` })] });
      }

      // /wanted-liste → le « bounty board » : tous les avis encore actifs dans ce salon
      if (cmd === 'wanted-liste') {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const msgs = await interaction.channel?.messages?.fetch({ limit: 100 }).catch(() => null);
        if (!msgs) return interaction.editReply({ content: '⚠️ Impossible de lire ce salon.' });
        const avis = [...msgs.values()]
          .filter(m => m.author.id === interaction.client.user.id && m.embeds?.[0]?.title?.includes('AVIS DE RECHERCHE'))
          .sort((a, b) => b.createdTimestamp - a.createdTimestamp)
          .slice(0, 15);
        if (!avis.length) return interaction.editReply({ content: '📭 Aucun avis de recherche actif dans ce salon.' });
        const lignes = avis.map(m => {
          const f = m.embeds[0].fields || [];
          const nom = (f.find(x => x.name.includes('Nom'))?.value || '?').replace(/\*/g, '');
          const prime = (f.find(x => x.name.includes('Prime'))?.value || '—').replace(/\*/g, '');
          return `• **${nom}** — 💰 ${prime} · [voir l'avis](${m.url})`;
        });
        return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COL.sepia)
          .setTitle('📋 Avis de recherche actifs')
          .setDescription(lignes.join('\n'))
          .setFooter({ text: `${avis.length} avis actif(s) • La Confrérie` })] });
      }

      // Les autres → on ouvre un formulaire (modal)
      const modal = buildModal(cmd);
      if (modal) return interaction.showModal(modal).catch(e => console.log('⚠️ papiers showModal:', e.message));
      return;
    }

    // 1b) Boutons du panneau Papiers → ouvrir le bon formulaire
    if (interaction.isButton?.() && interaction.customId?.startsWith('papier_open_')) {
      if (!estMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres de la Compagnie.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const type = interaction.customId.replace('papier_open_', '');
      if (type === 'wanted' && !estDirection(interaction.member)) return interaction.reply({ content: '🔒 Émettre un avis de recherche est réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const modal = buildModal(type);
      if (modal) return interaction.showModal(modal).catch(e => console.log('⚠️ papiers showModal (bouton):', e.message));
      return;
    }

    // 1c) Bouton « 🪖 Code » → affiche le Code (en privé) + bouton pour jurer
    if (interaction.isButton?.() && interaction.customId === 'papier_code_open') {
      if (!estMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres de la Compagnie.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('papier_code_jurer').setLabel('🩸 Apposer ma marque de sang').setStyle(ButtonStyle.Danger),
      );
      return interaction.reply({ embeds: [embedCode()], components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
    }

    // 1d) Bouton « 🔍 Consulter » → derniers papiers archivés (en privé)
    if (interaction.isButton?.() && interaction.customId === 'papier_consult') {
      if (!estMembre(interaction.member)) return interaction.reply({ content: '🔒 Réservé aux membres de la Compagnie.', flags: MessageFlags.Ephemeral }).catch(() => {});
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const ch = await interaction.client.channels.fetch(CONFIG.REGISTRE_CHANNEL_ID).catch(() => null);
      if (!ch) return interaction.editReply({ content: '⚠️ Salon registre introuvable.' }).catch(() => {});
      const msgs = await ch.messages.fetch({ limit: 40 }).catch(() => null);
      if (!msgs) return interaction.editReply({ content: '⚠️ Impossible de lire le salon registre (permissions ?).' }).catch(() => {});
      const me = interaction.client.user.id;
      const papiers = [...msgs.values()]
        .filter(m => m.author.id === me && m.embeds?.length > 0 && !(m.embeds[0]?.title || '').includes('PAPIERS — IRON WOLF COMPANY'))
        .sort((a, b) => b.createdTimestamp - a.createdTimestamp).slice(0, 12);
      if (!papiers.length) return interaction.editReply({ content: '📭 Aucun papier archivé pour le moment.' }).catch(() => {});
      const lignes = papiers.map(m => `• [**${(m.embeds[0]?.title || 'Papier').replace(/[*_`]/g, '')}**](${m.url}) — <t:${Math.floor(m.createdTimestamp / 1000)}:R>`);
      return interaction.editReply({ embeds: [new EmbedBuilder().setColor(COL.sepia)
        .setTitle('📒 Derniers papiers archivés')
        .setDescription(lignes.join('\n'))
        .setFooter({ text: `${papiers.length} papier(s) • /papiers pour filtrer` })] }).catch(() => {});
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
      else if (type === 'wanted') { embed = embedWanted({ nom: g('nom'), crime: g('crime'), prime: g('prime'), position: g('position'), image: g('image') }); label = 'Avis de recherche'; }
      else if (type === 'dette') {
        embed = embedDette({ debiteur: g('debiteur'), creancier: g('creancier'), montant: g('montant'), echeance: g('echeance'), motif: g('motif') }, auteur);
        label = 'Reconnaissance de dette';
        tamponRef(embed, 'dette');
        const signer  = new ButtonBuilder().setCustomId('papier_dette_signer').setLabel('✍️ Signer la dette').setStyle(ButtonStyle.Success);
        const solder  = new ButtonBuilder().setCustomId('papier_dette_solder').setLabel('💰 Marquer soldée').setStyle(ButtonStyle.Secondary);
        const revoq   = new ButtonBuilder().setCustomId('papier_revoquer').setLabel('🚫 Révoquer').setStyle(ButtonStyle.Secondary);
        const envoyer = new ButtonBuilder().setCustomId('papier_envoyer:dette').setLabel('📨 Envoyer au débiteur').setStyle(ButtonStyle.Primary);
        const dRow1 = new ActionRowBuilder().addComponents(signer, solder, revoq);
        const dRow2cmps = [envoyer]; const dT = boutonTransmettre(); if (dT) dRow2cmps.push(dT);
        const dRow2 = new ActionRowBuilder().addComponents(...dRow2cmps);
        await interaction.editReply({ embeds: [embed], components: [dRow1, dRow2] }).catch(() => {});
        await archiver(interaction.client, embed, label, auteur);
        return;
      }

      if (!embed) return interaction.editReply({ content: '⚠️ Type de papier inconnu.' }).catch(() => {});
      tamponRef(embed, type);
      let comps;
      if (type === 'wanted') {
        const closeBtn = new ButtonBuilder().setCustomId('papier_wanted_close').setLabel('💀 Capturé / Abattu').setStyle(ButtonStyle.Danger);
        comps = rowsAvecTransmit(closeBtn);
      } else {
        const extras = [new ButtonBuilder().setCustomId('papier_revoquer').setLabel('🚫 Révoquer').setStyle(ButtonStyle.Secondary)];
        if (ENVOYABLE.includes(type)) extras.unshift(new ButtonBuilder().setCustomId(`papier_envoyer:${type}`).setLabel('📨 Envoyer à une personne').setStyle(ButtonStyle.Primary));
        comps = rowsAvecTransmit(...extras);
      }
      const postOpts = { embeds: [embed], components: comps };
      if (type === 'wanted') {
        const ids = interaction.guild?.roles?.cache?.filter(r => CONFRERIE_ROLE_NAMES.some(n => r.name.includes(n))).map(r => r.id) || [];
        if (ids.length) {
          postOpts.content = `🚨 ${ids.map(id => `<@&${id}>`).join(' ')} — un avis de recherche vient d'être émis.`;
          postOpts.allowedMentions = { roles: ids };
        }
      }
      await interaction.editReply(postOpts).catch(() => {});
      if (type === 'wanted') {
        try {
          const m = await interaction.fetchReply();
          await m.pin().catch(() => {});
          const photoBtn = new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId(`papier_wanted_photo::${m.channelId}::${m.id}`).setLabel('📎 Ajouter une photo du recherché').setStyle(ButtonStyle.Secondary));
          await interaction.followUp({ content: '📎 *Facultatif : tu peux joindre une photo du recherché (en pièce jointe).*', components: [photoBtn], flags: MessageFlags.Ephemeral }).catch(() => {});
        } catch {}
      }
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
      const solder = new ButtonBuilder().setCustomId('papier_dette_solder').setLabel('💰 Marquer soldée').setStyle(ButtonStyle.Secondary);
      const revoq  = new ButtonBuilder().setCustomId('papier_revoquer').setLabel('🚫 Révoquer').setStyle(ButtonStyle.Secondary);
      const envoyer = new ButtonBuilder().setCustomId('papier_envoyer:dette').setLabel('📨 Envoyer au débiteur').setStyle(ButtonStyle.Primary);
      const sRow1 = new ActionRowBuilder().addComponents(solder, revoq);
      const sRow2cmps = [envoyer]; const sT = boutonTransmettre(); if (sT) sRow2cmps.push(sT);
      const sRow2 = new ActionRowBuilder().addComponents(...sRow2cmps);
      return interaction.update({ embeds: [e], components: [sRow1, sRow2] }).catch(() => {});
    }

    // Ajouter une photo au recherché EN PIÈCE JOINTE : on attend la prochaine image postée par la Direction
    if (interaction.isButton?.() && interaction.customId?.startsWith('papier_wanted_photo::')) {
      if (!estDirection(interaction.member)) return interaction.reply({ content: '🔒 Seule la Direction peut ajouter une photo.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const [, channelId, messageId] = interaction.customId.split('::');
      await interaction.reply({ content: '📎 **Envoie maintenant la photo** (en pièce jointe) ici même, dans ce salon. Tu as 2 minutes — ton message sera nettoyé automatiquement après.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const ch = interaction.channel;
      if (!ch || typeof ch.createMessageCollector !== 'function') { await interaction.followUp({ content: '⚠️ Impossible d\'attendre une photo dans ce salon.', flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
      const collector = ch.createMessageCollector({ filter: (m) => m.author.id === interaction.user.id && m.attachments.size > 0, time: 120000, max: 1 });
      collector.on('collect', async (m) => {
        try {
          const att = m.attachments.first();
          const estImage = (att?.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp)(\?|$)/i.test(att?.url || '');
          if (!att || !estImage) { await interaction.followUp({ content: '⚠️ Ce n\'est pas une image — réessaie avec une photo.', flags: MessageFlags.Ephemeral }).catch(() => {}); await m.delete().catch(() => {}); return; }
          const tch = await interaction.client.channels.fetch(channelId).catch(() => null);
          const tmsg = tch && await tch.messages.fetch(messageId).catch(() => null);
          if (!tmsg) { await interaction.followUp({ content: '⚠️ Avis introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return; }
          const base = tmsg.embeds?.[0];
          const e = base ? EmbedBuilder.from(base).setImage('attachment://wanted.png') : null;
          if (e) await tmsg.edit({ embeds: [e], files: [new AttachmentBuilder(att.url, { name: 'wanted.png' })] }).catch(() => {});
          await m.delete().catch(() => {});
          await interaction.followUp({ content: '✅ Photo ajoutée à l\'avis de recherche.', flags: MessageFlags.Ephemeral }).catch(() => {});
        } catch {}
      });
      collector.on('end', async (collected) => {
        if (collected.size === 0) { await interaction.followUp({ content: '⏱️ Temps écoulé — aucune photo reçue. Tu pourras réessayer.', flags: MessageFlags.Ephemeral }).catch(() => {}); }
      });
      return;
    }

    // Clôturer un avis de recherche → demande qui l'a eu, puis marque CAPTURÉ / ABATTU (Direction)
    if (interaction.isButton?.() && interaction.customId === 'papier_wanted_close') {
      if (!estDirection(interaction.member)) return interaction.reply({ content: '🔒 Seule la Direction peut clôturer un avis.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const modal = new ModalBuilder().setCustomId(`papier_wanted_close:${interaction.channelId}:${interaction.message.id}`).setTitle('💀 Clôturer l\'avis de recherche')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('par').setLabel('Capturé / abattu par (chasseur)').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : Jonas Caverly')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('issue').setLabel('Issue : capturé vivant ou abattu ?').setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(30).setPlaceholder('capturé / abattu')),
        );
      return interaction.showModal(modal).catch(() => {});
    }

    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('papier_wanted_close:')) {
      const [, channelId, messageId] = interaction.customId.split(':');
      const par = (interaction.fields.getTextInputValue('par') || '').trim() || 'un chasseur';
      const issue = (interaction.fields.getTextInputValue('issue') || '').trim().toLowerCase();
      const abattu = /abat|mort|tu[eé]|descend|ex[eé]cu|enterr/.test(issue);
      const badge = abattu ? '💀' : '⛓️';
      const mot = abattu ? 'ABATTU' : 'CAPTURÉ';
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      try {
        const ch = await interaction.client.channels.fetch(channelId);
        const msg = await ch.messages.fetch(messageId);
        const base = msg.embeds?.[0];
        if (!base) return interaction.editReply({ content: '⚠️ Avis introuvable.' });
        const e = EmbedBuilder.from(base).setColor(abattu ? COL.rouge : COL.vert)
          .setTitle(`${badge} AVIS CLÔTURÉ — ${mot}`)
          .addFields({ name: `${badge} Issue`, value: `**${mot}** par **${par}**\n${fmtDate()} à ${fmtHeure()}`, inline: false });
        await msg.edit({ embeds: [e], components: [] }).catch(() => {});
        await msg.unpin().catch(() => {});
        return interaction.editReply({ content: `✅ Avis clôturé : **${mot.toLowerCase()}** par **${par}**.` });
      } catch {
        return interaction.editReply({ content: '⚠️ Impossible de clôturer cet avis (message introuvable ou permissions manquantes).' });
      }
    }

    // Révoquer / annuler un papier (Direction)
    if (interaction.isButton?.() && interaction.customId === 'papier_revoquer') {
      if (!estDirection(interaction.member)) return interaction.reply({ content: '🔒 Seule la Direction peut révoquer un document.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const base = interaction.message.embeds?.[0];
      if (!base) return interaction.reply({ content: '⚠️ Document introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const par = interaction.member?.displayName || interaction.user.username;
      const titre = (base.title || 'Document').replace(/^🚫 \[RÉVOQUÉ\]\s*/, '');
      const e = EmbedBuilder.from(base).setColor(COL.gris)
        .setTitle(`🚫 [RÉVOQUÉ] ${titre}`)
        .addFields({ name: '🚫 Révocation', value: `Document annulé par **${par}** le ${fmtDate()} à ${fmtHeure()}.`, inline: false });
      return interaction.update({ embeds: [e], components: [] }).catch(() => {});
    }

    // Marquer une dette comme soldée (Direction)
    if (interaction.isButton?.() && interaction.customId === 'papier_dette_solder') {
      if (!estDirection(interaction.member)) return interaction.reply({ content: '🔒 Seule la Direction peut solder une dette.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const base = interaction.message.embeds?.[0];
      if (!base) return interaction.reply({ content: '⚠️ Document introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {});
      const par = interaction.member?.displayName || interaction.user.username;
      const titre = (base.title || 'Reconnaissance de dette').replace(/^💰 \[SOLDÉE\]\s*/, '');
      const e = EmbedBuilder.from(base).setColor(COL.vert)
        .setTitle(`💰 [SOLDÉE] ${titre}`)
        .addFields({ name: '💰 Règlement', value: `Dette **soldée** — confirmée par **${par}** le ${fmtDate()} à ${fmtHeure()}.`, inline: false });
      return interaction.update({ embeds: [e], components: [] }).catch(() => {});
    }

    // ── Envoyer un papier à une personne (MP) + validation ──
    // 1) Bouton « Envoyer » → propose un membre OU la saisie d'un ID Discord
    if (interaction.isButton?.() && interaction.customId?.startsWith('papier_envoyer:')) {
      const type = interaction.customId.split(':')[1] || 'doc';
      const refData = `${interaction.channelId}:${interaction.message.id}:${type}:${interaction.user.id}`;
      const sel = new UserSelectMenuBuilder().setCustomId(`papier_envoyer_go:${refData}`).setPlaceholder('Choisir un membre du serveur…').setMinValues(1).setMaxValues(1);
      const idBtn = new ButtonBuilder().setCustomId(`papier_envoyer_id:${refData}`).setLabel('🔢 Entrer un ID Discord (hors serveur)').setStyle(ButtonStyle.Secondary);
      return interaction.reply({
        content: '📨 À qui envoyer ce document ? Choisis un **membre**, ou entre un **ID Discord** pour quelqu\'un hors du serveur. Il devra **valider** la réception.',
        components: [new ActionRowBuilder().addComponents(sel), new ActionRowBuilder().addComponents(idBtn)],
        flags: MessageFlags.Ephemeral,
      }).catch(() => {});
    }

    // 2a) Sélection d'un membre → envoi
    if (interaction.isUserSelectMenu?.() && interaction.customId?.startsWith('papier_envoyer_go:')) {
      await interaction.update({ content: '📨 Envoi en cours…', components: [] }).catch(() => {});
      const [, channelId, messageId, type, senderId] = interaction.customId.split(':');
      return envoyerPapierA(interaction, channelId, messageId, type, senderId, interaction.values[0]);
    }

    // 2b) Bouton « Entrer un ID » → formulaire ID
    if (interaction.isButton?.() && interaction.customId?.startsWith('papier_envoyer_id:')) {
      const rest = interaction.customId.slice('papier_envoyer_id:'.length);
      const modal = new ModalBuilder().setCustomId(`papier_envoyer_idgo:${rest}`).setTitle('📨 Envoyer par ID Discord')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('cibleid').setLabel('ID Discord du destinataire').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(25).setPlaceholder('Ex : 123456789012345678'),
        ));
      return interaction.showModal(modal).catch(() => {});
    }

    // 2c) Soumission de l'ID → envoi
    if (interaction.isModalSubmit?.() && interaction.customId?.startsWith('papier_envoyer_idgo:')) {
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      const [, channelId, messageId, type, senderId] = interaction.customId.split(':');
      const cibleId = (interaction.fields.getTextInputValue('cibleid') || '').trim();
      return envoyerPapierA(interaction, channelId, messageId, type, senderId, cibleId);
    }

    // 3) Le destinataire valide en MP → met à jour le papier d'origine + prévient l'expéditeur
    if (interaction.isButton?.() && interaction.customId?.startsWith('papier_valider:')) {
      const [, channelId, messageId, type, senderId] = interaction.customId.split(':');
      await interaction.update({ content: '✅ **Document validé.** Merci — c\'est transmis à La Confrérie.', components: [] }).catch(() => {});
      try {
        const ch = await interaction.client.channels.fetch(channelId);
        const msg = await ch.messages.fetch(messageId);
        const base = msg.embeds?.[0];
        let nom = interaction.user.username;
        try { const mem = await ch.guild.members.fetch(interaction.user.id); nom = mem.displayName; } catch { /* hors serveur */ }
        if (base) {
          const e = EmbedBuilder.from(base);
          if (type === 'dette') {
            e.setColor(COL.vert);
            let hasSig = false;
            let fields = (base.fields || []).filter(f => !f.name.includes('Transmission'))
              .map(f => f.name.includes('Signature') ? (hasSig = true, { name: '🖋️ Signature', value: `✅ Signé par **${nom}** (par MP) le ${fmtDate()} à ${fmtHeure()}`, inline: false }) : f);
            if (!hasSig) fields.push({ name: '✅ Validation', value: `Reçu et validé par **${nom}** le ${fmtDate()} à ${fmtHeure()}`, inline: false });
            e.setFields(fields);
          } else {
            const fields = (base.fields || []).filter(f => !f.name.includes('Transmission') && !f.name.includes('Validation'));
            fields.push({ name: '✅ Validation', value: `Document reçu et validé par **${nom}** le ${fmtDate()} à ${fmtHeure()}`, inline: false });
            e.setFields(fields);
          }
          await msg.edit({ embeds: [e] }).catch(() => {});
        }
        if (senderId && /^\d{15,21}$/.test(senderId)) {
          await ch.send({ content: `✅ <@${senderId}> — **${nom}** a validé le document que tu lui as envoyé.`, allowedMentions: { users: [senderId] } }).catch(() => {});
        }
      } catch { /* ignore */ }
      return;
    }

    if (interaction.isButton?.() && interaction.customId === 'papier_code_jurer') {
      const modal = new ModalBuilder().setCustomId('papier_code_serment').setTitle('🩸 Sceller le serment dans le sang')
        .addComponents(
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('nomrp').setLabel('Nom & prénom de ton personnage').setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(60).setPlaceholder('Ex : Jonas Caverly')),
          new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('mots').setLabel('Tes mots, pour sceller le pacte (facultatif)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(300).setPlaceholder('Sur mon sang, je jure de garder le silence et de ne jamais trahir les miens.')),
        );
      return interaction.showModal(modal).catch(() => {});
    }

    if (interaction.isModalSubmit?.() && interaction.customId === 'papier_code_serment') {
      const nomRP = (interaction.fields.getTextInputValue('nomrp') || '').trim() || (interaction.member?.displayName || interaction.user.username);
      const mots  = (interaction.fields.getTextInputValue('mots') || '').trim();
      const serment = mots ? `*« ${mots} »*` : '*« Sur mon honneur et sur mon sang, je jure de respecter le Code. »*';
      const e = new EmbedBuilder().setColor(0x6B0000).setTitle('🩸 SERMENT SCELLÉ DANS LE SANG')
        .setDescription([
          '*La lame a mordu la paume. Une goutte de sang, puis le nom — apposé sous le Code.*',
          '*Ce qui se jure dans le sang ne se reprend jamais.*',
          '',
          '🩸 ▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬▬ 🩸',
        ].join('\n'))
        .addFields(
          { name: '🖋️ Marque de sang', value: `\`\`\`\n${nomRP}\n\`\`\``, inline: false },
          { name: '🗝️ Serment prêté', value: serment, inline: false },
          { name: '📅 Scellé le', value: `${fmtDate()} à ${fmtHeure()}`, inline: false },
        )
        .setFooter({ text: 'La Confrérie • Scellé dans le sang' }).setTimestamp();
      tamponRef(e, 'code');
      await archiver(interaction.client, e, 'Serment scellé (Code)', nomRP);
      return interaction.reply({ embeds: [new EmbedBuilder().setColor(0x6B0000).setTitle('🩸 Ton sang scelle ta parole')
        .setDescription(`**${nomRP}**, ta marque est apposée sous le Code.\n\nTu es désormais des nôtres. Que le silence te garde, et que le sang te lie.\n\n— La Confrérie`)
        .setFooter({ text: 'La Confrérie' })], flags: MessageFlags.Ephemeral }).catch(() => {});
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

// ─── Panneau « 📜 PAPIERS » : un bouton par document (fini les 8 commandes) ───
function _panelPapiersPayload() {
  const e = new EmbedBuilder().setColor(COL.sepia).setTitle('📜 PAPIERS — IRON WOLF COMPANY')
    .setDescription([
      '*Tous les documents officiels de la Compagnie — créés et archivés ici.*',
      '',
      '__**✍️ Créer un document**__',
      'Clique un bouton ci-dessous, remplis le formulaire : il est généré, tamponné d\'une référence, puis archivé dans ce salon.',
      '',
      '__**🔍 Consulter**__',
      '« Consulter les derniers papiers » liste les derniers documents avec un lien direct vers chacun.',
      '',
      '📌 *Reçu · Dette (signable) · Casier · Carte · Ordre de mission · Billet · Avis de recherche (Direction) · Code de la Confrérie.*',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company • Registre des papiers' });
  // 📄 Documents courants
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('papier_open_recu').setLabel('Reçu').setEmoji('🧾').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('papier_open_dette').setLabel('Dette').setEmoji('📜').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('papier_open_casier').setLabel('Casier').setEmoji('🗂️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('papier_open_carte').setLabel('Carte').setEmoji('🎴').setStyle(ButtonStyle.Secondary),
  );
  // 🎖️ Mission & Confrérie
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('papier_open_ordre').setLabel('Ordre de mission').setEmoji('🎖️').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('papier_open_billet').setLabel('Billet').setEmoji('🃏').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('papier_open_wanted').setLabel('Avis de recherche').setEmoji('🔫').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('papier_code_open').setLabel('Code').setEmoji('🪖').setStyle(ButtonStyle.Secondary),
  );
  // 🔍 Consultation
  const row3 = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('papier_consult').setLabel('Consulter les derniers papiers').setEmoji('🔍').setStyle(ButtonStyle.Primary),
  );
  return { embeds: [e], components: [row1, row2, row3] };
}
async function installerPanelPapiers(client) {
  try {
    const ch = await client.channels.fetch(CONFIG.REGISTRE_CHANNEL_ID).catch(() => null);
    if (!ch?.messages) return;
    const me = client.user.id;
    const msgs = await ch.messages.fetch({ limit: 30 }).catch(() => null);
    const panel = msgs ? [...msgs.values()].find(m => m.author.id === me && (m.embeds?.[0]?.title || '').includes('PAPIERS — IRON WOLF COMPANY')) : null;
    const payload = _panelPapiersPayload();
    if (panel) { await panel.edit(payload).catch(() => {}); return; }
    const sent = await ch.send(payload).catch(() => null);
    if (sent) await sent.pin().catch(() => {});
  } catch (e) { console.log('⚠️ papiers installerPanel:', e.message); }
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
  // Panneau à boutons dans le salon registre (créé/maj au démarrage)
  if (client.isReady()) installerPanelPapiers(client);
  else client.once('clientReady', () => installerPanelPapiers(client));
  console.log('📜 Module Papiers RP chargé (8 commandes + panneau).');
}

module.exports = { initPapiers, papiersCommands };
