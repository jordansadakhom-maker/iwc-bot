// ═══════════════════════════════════════════════════════════════
// deploy-commands.js — Enregistrement des slash commands
// À exécuter UNE SEULE FOIS : node deploy-commands.js
// ═══════════════════════════════════════════════════════════════

require('dotenv').config();
const { REST, Routes, SlashCommandBuilder } = require('discord.js');

const commands = [
  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('📊 Affiche les statistiques de la Compagnie en temps réel'),

  new SlashCommandBuilder()
    .setName('solde')
    .setDescription('💰 Affiche les soldes des coffres légal et illégal'),

  new SlashCommandBuilder()
    .setName('fiche')
    .setDescription('👤 Affiche la fiche IC d\'un membre')
    .addStringOption(opt => opt.setName('nom').setDescription('Nom IC du membre').setRequired(true)),

  new SlashCommandBuilder()
    .setName('ops')
    .setDescription('🎯 Liste les opérations en cours et en préparation'),

  new SlashCommandBuilder()
    .setName('absent')
    .setDescription('🟡 Déclarer une absence')
    .addStringOption(opt => opt.setName('duree').setDescription('Durée de l\'absence (ex: 3 jours, 1 semaine)').setRequired(true))
    .addStringOption(opt => opt.setName('raison').setDescription('Raison (optionnel)').setRequired(false)),

  new SlashCommandBuilder()
    .setName('rapport')
    .setDescription('📋 Envoie le rapport quotidien en DM (Direction uniquement)'),
].map(c => c.toJSON());

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN || process.env.DISCORD_TOKEN);

(async () => {
  try {
    console.log('⏳ Enregistrement des slash commands...');
    // Enregistrement global (peut prendre jusqu'à 1h pour apparaître)
    await rest.put(Routes.applicationCommands(process.env.CLIENT_ID), { body: commands });
    console.log('✅ Slash commands enregistrées avec succès !');
  } catch (e) {
    console.error('❌ Erreur:', e);
  }
})();

