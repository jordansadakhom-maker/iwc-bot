// ═══════════════════════════════════════════════════════════════
// PATCH index.js — Changements à apporter
// ═══════════════════════════════════════════════════════════════

// ── 1. Dans interactionCreate → bloc BOUTONS v2 ──
// REMPLACER :
//   if (interaction.customId === 'btn_nouvelle_transaction') return notionModules.handleTresorCommand?.(interaction);
// PAR :
//   if (interaction.customId === 'btn_nouvelle_transaction') return notionModules.handleTresorCommand?.(interaction);
//   if (interaction.customId.startsWith('tresor_'))          return notionModules.handleTresorFlow?.(interaction);

// ── 2. Dans interactionCreate → bloc MODAUX v2 ──
// REMPLACER :
//   if (interaction.isModalSubmit() && interaction.customId === 'modal_tresor') {
//     return notionModules.handleTresorModal?.(interaction);
//   }
// PAR :
//   if (interaction.isModalSubmit() && interaction.customId.startsWith('modal_tresor_')) {
//     return notionModules.handleTresorModal?.(interaction);
//   }

// ── 3. Dans messageCreate → bloc #planning ──
// SUPPRIMER tout le bloc :
//   if (isDirection(message.member) && message.content.toUpperCase().includes('SESSION') && ...) { ... }
//
// GARDER uniquement :
//   const planCh = getCh(guild, 'planning-sessions', 'planning');
//   if (planCh && message.channel.id === planCh.id) {
//     if (message.attachments.size > 0) {
//       await notionV3.handlePlanningScreenshot?.(message);
//     }
//     // Texte seul → ignoré silencieusement (pas de return, pas d'action)
//     return;
//   }

// ── 4. Dans messageCreate → AJOUTER le bloc #plans (après le bloc #planning) ──
//   const plansTactCh = getCh(guild, 'plans');
//   if (plansTactCh && message.channel.id === plansTactCh.id) {
//     await notionV3.handlePlansMessage?.(message);
//     return;
//   }

// ── 5. Dans autoSetup → SUPPRIMER setupPlanningPanel(guild) ──
// La fonction setupPlanningPanel n'est plus nécessaire.
// Supprimer aussi son appel dans autoSetup.

// ── 6. Dans autoSetup → AJOUTER setupInformateursPanel ──
//   await notionV3.setupInformateursPanel?.(guild);
// (si pas déjà présent)

// ── 7. Supprimer la fonction setupPlanningPanel dans index.js ──
// Elle n'est plus utile, le salon planning n'a plus de message épinglé.

