require('dotenv').config();
const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('📊 Statistiques de la Compagnie en temps réel')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('solde')
    .setDescription('💰 Soldes des coffres légal et illégal')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('fiche')
    .setDescription('👤 Fiche IC d\'un membre')
    .addStringOption(opt => opt.setName('nom').setDescription('Nom IC du membre').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('ops')
    .setDescription('🎯 Opérations en cours et en préparation')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

  new SlashCommandBuilder()
    .setName('absent')
    .setDescription('🟡 Déclarer une absence')
    .addStringOption(opt => opt.setName('duree').setDescription('Durée (ex: 3 jours, 1 semaine)').setRequired(true))
    .addStringOption(opt => opt.setName('raison').setDescription('Raison (optionnel)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rapport')
    .setDescription('📋 Envoie le rapport quotidien en DM')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('promo')
    .setDescription('⬆️ Promouvoir un membre')
    .addUserOption(opt => opt.setName('membre').setDescription('Membre à promouvoir').setRequired(true))
    .addStringOption(opt => opt.setName('rang').setDescription('Nouveau rang').setRequired(true))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('retro')
    .setDescription('⬇️ Rétrograder un membre')
    .addUserOption(opt => opt.setName('membre').setDescription('Membre à rétrograder').setRequired(true))
    .addStringOption(opt => opt.setName('rang').setDescription('Nouveau rang').setRequired(true))
    .addStringOption(opt => opt.setName('raison').setDescription('Raison').setRequired(false))
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ Enregistrement des slash commands...');
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands enregistrées avec succès !');
    console.log('  /stats   → Direction & Confrérie');
    console.log('  /solde   → Direction & Confrérie');
    console.log('  /fiche   → Direction & Confrérie');
    console.log('  /ops     → Direction & Confrérie');
    console.log('  /absent  → Tous les membres');
    console.log('  /rapport → Direction uniquement');
    console.log('  /promo   → Direction uniquement');
    console.log('  /retro   → Direction uniquement');
  } catch (e) {
    console.error('❌ Erreur:', e.message);
  }
})();

