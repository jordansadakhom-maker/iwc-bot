/**
 * patch-deploy.js — IWC Bot
 * Poste les patch notes dans le salon Discord configuré.
 * Usage : node patch-deploy.js
 * À lancer après chaque déploiement.
 */

require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ChannelType } = require('discord.js');

const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// ── Config ──
// Mettre l'ID du salon où poster les patch notes
// Si vide, cherche automatiquement un salon contenant 'patch', 'update', 'logs-bot' ou 'annonce'
const PATCH_CHANNEL_ID = process.env.PATCH_CHANNEL_ID || null;

// ── Patch actuel ──
const PATCH = {
  version: 'v3.4',
  date:    '31 Mai 2026',
  titre:   'Correctifs & Améliorations — IWC Bot',

  corrections: [
    '**Trésorerie** — Blocage après validation du modal corrigé (`deferUpdate` au lieu de `deferReply`)',
    '**Coffres séparés** — Soldes légal ⚖️ et illégal 🔒 totalement indépendants, jamais mélangés',
    '**Coffre illégal** — Post propre dans `🔒・coffre-illegal` au style La Confrérie',
    '**Affaires** — Doublon sur le bouton Détails supprimé (réponse directe sans defer)',
    '**Grade épinglé** — Notification "X a épinglé un message" supprimée au démarrage',
    '**Planning** — Salon propre, aucun panneau épinglé, images → Notion uniquement',
  ],

  nouveautes: [
    '**Fiches personnages** — Embed propre automatique + synchro Notion à chaque post dans `#fiches-personnages`',
    '**Plans tactiques** — Salon `🗺️・plans` actif : images de lieux archivées dans Notion automatiquement',
    '**DM grades cohérents** — Légal → "Iron Wolf Company • Légal" / Illégal → "La Confrérie • Confidentiel"',
    '**Trésorerie format** — Post dans les salons coffre avec header organisation, mouvement +/- et solde actuel',
    '**Nettoyage démarrage** — Pins, doublons et notifications système supprimés automatiquement',
  ],

  technique: [
    'Séparation stricte des clés `legal` / `illegal` dans la base de données',
    '`getCh()` gère les emojis Unicode (🗺️・, 🎩・, 🔒・) par inclusion après nettoyage',
    '`getChExact()` match exact après nettoyage pour `coffre-illegal`',
    'Toutes les interactions modal utilisent `deferUpdate` + `followUp` pour éviter les timeouts',
  ],
};

client.once('ready', async () => {
  console.log(`✅ Connecté : ${client.user.tag}`);

  for (const guild of client.guilds.cache.values()) {
    console.log(`📡 Serveur : ${guild.name}`);

    // Trouver le salon
    let ch = null;
    if (PATCH_CHANNEL_ID) {
      ch = guild.channels.cache.get(PATCH_CHANNEL_ID);
    }
    if (!ch) {
      const clean = s => s.toLowerCase().replace(/[^a-z0-9]/g, '');
      ch = guild.channels.cache.find(c =>
        [ChannelType.GuildText, ChannelType.GuildAnnouncement].includes(c.type) &&
        ['patch', 'update', 'logsbot', 'logs-bot', 'annonces', 'patch-note'].some(k => clean(c.name).includes(clean(k)))
      );
    }

    if (!ch) {
      console.log(`⚠️  Aucun salon patch trouvé sur ${guild.name} — set PATCH_CHANNEL_ID dans .env`);
      continue;
    }

    // Build embed
    const embed = new EmbedBuilder()
      .setColor(0x8B1A1A)
      .setAuthor({ name: 'Iron Wolf Company • IWC Setup', iconURL: guild.iconURL() || undefined })
      .setTitle(`🔧 Patch ${PATCH.version} — ${PATCH.titre}`)
      .setDescription(`*Déployé le **${PATCH.date}***\n\n*Ce patch apporte des corrections critiques sur la trésorerie, les grades et les fiches personnages.*`)
      .addFields(
        {
          name: '✅ Corrections',
          value: PATCH.corrections.map(c => `→ ${c}`).join('\n'),
          inline: false,
        },
        {
          name: '✨ Nouveautés',
          value: PATCH.nouveautes.map(n => `→ ${n}`).join('\n'),
          inline: false,
        },
        {
          name: '⚙️ Technique',
          value: PATCH.technique.map(t => `\`${t}\``).join('\n'),
          inline: false,
        },
      )
      .setFooter({ text: `IWC Bot ${PATCH.version} • Déployé automatiquement` })
      .setTimestamp();

    await ch.send({ embeds: [embed] });
    console.log(`✅ Patch notes postées dans #${ch.name} sur ${guild.name}`);
  }

  client.destroy();
  process.exit(0);
});

client.login(process.env.TOKEN || process.env.DISCORD_TOKEN);

