// ═══════════════════════════════════════════════════════════════
// deploy-commands.js — Enregistrement des slash commands
// À exécuter UNE SEULE FOIS : node deploy-commands.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

// IDs des rôles autorisés (Direction + Confrérie)
// Les commandes sont visibles UNIQUEMENT par ces rôles
const ROLES_AUTORISES = [
  '1508289999035039875', // Rôle 1 Direction
  '1508290320763195482', // Rôle 2 Direction
  '1508292278953836655', // Rôle 3 Direction
  '1508756436082102303', // Pôle Légal
  '1508756479274913903', // Pôle Illégal
];

const commands = [
  // /stats — Direction & Confrérie
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('📊 Statistiques de la Compagnie en temps réel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // /solde — Direction & Confrérie
  new SlashCommandBuilder()
    .setName('solde')
    .setDescription('💰 Soldes des coffres légal et illégal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // /fiche — Direction & Confrérie
  new SlashCommandBuilder()
    .setName('fiche')
    .setDescription('👤 Fiche IC d\'un membre')
    .addStringOption(opt =>
      opt.setName('nom')
        .setDescription('Nom IC du membre')
        .setRequired(true)
    )
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // /ops — Direction & Confrérie
  new SlashCommandBuilder()
    .setName('ops')
    .setDescription('🎯 Opérations en cours et en préparation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  // /absent — Tous les membres
  new SlashCommandBuilder()
    .setName('absent')
    .setDescription('🟡 Déclarer une absence')
    .addStringOption(opt =>
      opt.setName('duree')
        .setDescription('Durée (ex: 3 jours, 1 semaine)')
        .setRequired(true)
    )
    .addStringOption(opt =>
      opt.setName('raison')
        .setDescription('Raison (optionnel)')
        .setRequired(false)
    ),

  // /rapport — Direction uniquement
  new SlashCommandBuilder()
    .setName('rapport')
    .setDescription('📋 Envoie le rapport quotidien en DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ Enregistrement des slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands enregistrées avec succès !');
    console.log('');
    console.log('Permissions :');
    console.log('  /stats   → ManageMessages (Direction & Confrérie)');
    console.log('  /solde   → ManageMessages (Direction & Confrérie)');
    console.log('  /fiche   → ManageMessages (Direction & Confrérie)');
    console.log('  /ops     → ManageMessages (Direction & Confrérie)');
    console.log('  /absent  → Tous les membres');
    console.log('  /rapport → Administrator (Direction uniquement)');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
})();

