// ─────────────────────────────────────────────────────────────────────────────
//  accueil.js — Accueil des nouveaux + relance des visiteurs inactifs
//  • À l'arrivée : MP clair expliquant comment prendre RDV pour nos prestations
//    ou envoyer un télégramme, avec un bouton d'accès direct au salon.
//  • Direction : bouton « Relancer un visiteur » → choisir un membre → lui
//    renvoyer ce message (beaucoup rejoignent sans faire les démarches).
// ─────────────────────────────────────────────────────────────────────────────
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, UserSelectMenuBuilder, MessageFlags } = require('discord.js');

// Salon où les clients prennent RDV / envoient un télégramme (bouton « ✉ Envoyer un télégramme »)
const SALON_DEMANDES = '1512171267560702013';
const ROLES_DIRECTION = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Officier', 'Instructeur', 'Secrétaire'];
const estDirection = (member) => !!member?.roles?.cache?.some(r => ROLES_DIRECTION.some(n => r.name.includes(n)));

// Message d'accueil/relance (MP). opts.relance = true → ton « petit rappel ».
// Un SEUL message, clair et logique : la personne sait tout de suite quoi faire.
function messageClientPayload(guild, opts = {}) {
  const lien = `https://discord.com/channels/${guild.id}/${SALON_DEMANDES}`;
  const intro = opts.relance
    ? '👋 *Petit rappel : tu as rejoint le serveur mais tu n\'as pas encore fait de démarche.*'
    : '🐺 **Bienvenue à l\'Iron Wolf Company.**';
  const embed = new EmbedBuilder().setColor(0x8B5A2A)
    .setTitle('🤝 Comment travailler avec nous')
    .setDescription([
      intro,
      '',
      'On s\'occupe de **protection, escorte, contrats, enquêtes, récupérations…** Pour faire appel à nous, c\'est **simple et rapide** :',
      '',
      `**1.** Ouvre le salon <#${SALON_DEMANDES}> *(bouton ci-dessous).*`,
      '**2.** Clique sur **« ✉ Envoyer un télégramme ».**',
      '**3.** Explique ta demande *(ou prends rendez-vous).*',
      '**4.** La Direction te répond **directement ici, en privé.**',
      '',
      '*C\'est tout — pas besoin d\'autre chose.* 👇',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company — à votre service' });
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setLabel('Faire ma demande').setEmoji('📨').setStyle(ButtonStyle.Link).setURL(lien),
  );
  return { embeds: [embed], components: [row] };
}

// Envoie le MP d'accueil à un membre. Renvoie true si le MP est passé.
async function envoyerAccueil(member, opts = {}) {
  try { await member.send(messageClientPayload(member.guild, opts)); return true; }
  catch { return false; }
}

async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (cid !== 'relance_open' && cid !== 'relance_sel') return false;
    if (!estDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }

    if (cid === 'relance_open') {
      const row = new ActionRowBuilder().addComponents(
        new UserSelectMenuBuilder().setCustomId('relance_sel').setPlaceholder('Choisis la personne à relancer…').setMinValues(1).setMaxValues(1),
      );
      await interaction.reply({ content: '📨 **Relancer un visiteur** — sélectionne la personne à qui renvoyer les explications (RDV / télégramme) :', components: [row], flags: MessageFlags.Ephemeral }).catch(() => {});
      return true;
    }

    if (cid === 'relance_sel') {
      const userId = interaction.values?.[0];
      const member = userId ? await interaction.guild.members.fetch(userId).catch(() => null) : null;
      if (!member) { await interaction.update({ content: '⚠️ Membre introuvable.', components: [] }).catch(() => {}); return true; }
      const ok = await envoyerAccueil(member, { relance: true });
      await interaction.update({
        content: ok ? `✅ Relance envoyée en MP à <@${userId}>.` : `⚠️ Impossible d'envoyer le MP à <@${userId}> (ses messages privés sont probablement fermés).`,
        components: [],
      }).catch(() => {});
      return true;
    }
    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ accueil routeInteraction:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Erreur.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { messageClientPayload, envoyerAccueil, routeInteraction, estDirection, SALON_DEMANDES };
