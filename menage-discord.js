// ═══════════════════════════════════════════════════════════════
// menage-discord.js — Nettoyage « gestion » du serveur (ARCHIVAGE RÉVERSIBLE)
//
// Le site IWC est devenu la plateforme de gestion. Ce module range les anciens
// salons de GESTION (contrats, opérations, coffres, stocks, RH, compta, factures,
// logs, saisie/validation/test…) dans une catégorie masquée « 🗄️ ARCHIVE » — sans
// rien supprimer. Tout est RÉVERSIBLE (`!menage annuler`).
//
// SÉCURITÉ (comme reorg.js) :
//  • Aperçu obligatoire (`!menage test`) : montre exactement ce qui serait archivé
//    ET ce qui est conservé, AVANT toute action.
//  • Les salons de COMMUNICATION (texte de discussion, RP, annonces, règlement,
//    présentations, médias…) et TOUS les vocaux sont protégés par liste blanche
//    PRIORITAIRE : un salon protégé n'est jamais touché.
//  • On n'archive QUE les salons qui matchent un motif de gestion ET ne sont pas
//    protégés. Le reste n'est jamais touché.
//  • Rôles & webhooks : LISTÉS pour revue, jamais supprimés automatiquement
//    (suppression de webhooks possible seulement, explicitement, sur les salons
//    déjà archivés).
//  • Réservé à la Direction / « Gérer les salons ».
// ═══════════════════════════════════════════════════════════════
const { ChannelType, PermissionsBitField } = require('discord.js');
const { loadDB, saveDB } = require('./db');

const ARCHIVE_CAT = '🗄️ ARCHIVE — Gestion (migré vers le site)';

const norm = s => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// PROTÉGÉ — jamais archivé (communication). Un faux positif ici est SANS danger
// (il ne fait que CONSERVER un salon). On est donc volontairement généreux.
const PROTEGE = [
  'discussion', 'parlote', 'parlott', 'papote', 'papotage', 'tchat', 'chat', 'general', 'generale',
  'blabla', 'hrp', 'rp', 'roleplay', 'ooc', 'ic', 'annonce', 'information', 'infos', 'info',
  'reglement', 'regle', 'presentation', 'arrivee', 'bienvenue', 'accueil', 'evenement', 'event',
  'media', 'screenshot', 'clip', 'capture', 'creation', 'photo', 'galerie', 'lore', 'univers',
  'suggestion', 'idee', 'sondage', 'vocal', 'voix', 'communaute', 'communautaire', 'detente',
  'entraide', 'feedback', 'avis', 'histoire', 'fichepersonnage', 'planning',
];

// GESTION — candidats à l'archivage (seulement si NON protégé et NON vocal).
const GESTION = [
  'contrat', 'operation', 'armurerie', 'coffre', 'stock', 'inventaire', 'comptabilit', 'finance',
  'facture', 'facturation', 'absence', 'pointage', 'salaire', 'paie', 'effectif', 'ressourceshumaine',
  'documentinterne', 'documentsinterne', 'formulaire', 'ticket', 'rapportauto', 'rapportautomatique',
  'logs', 'logbot', 'logserveur', 'logstaff', 'logdirection', 'logmodo', 'journalbot', 'auditlog',
  'saisie', 'validation', 'wanted', 'avisrecherche', 'traque', 'prestation', 'bilanauto', 'registre',
  'tableaudebord', 'dashboard', 'rendezvous', 'rdv', 'telegramme', 'candidatureinterne', 'licence',
  'mouvementstock', 'ancienneversion', 'oldversion', 'anciennegestion', 'brouillon', 'salontest',
  'zonetest', 'testgestion', 'demandeinterne',
];

// Salons à NE JAMAIS toucher (identités précises, quelle que soit la classification).
const JAMAIS = ['contacterlacompagnie'];

// Types déplaçables → on ne range QUE des salons écrits (texte / annonce / forum).
// Les vocaux (voix + scène) sont EXCLUS d'office (communication).
const TYPES_ECRITS = new Set([ChannelType.GuildText, ChannelType.GuildAnnouncement, ChannelType.GuildForum]);

const estProtege = n => PROTEGE.some(m => n.includes(m));
const estGestion = n => GESTION.some(m => n.includes(m));

function motifGestion(n) { return GESTION.find(m => n.includes(m)) || null; }

function aArchiver(ch) {
  if (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice) return false; // communication
  if (!TYPES_ECRITS.has(ch.type)) return false;
  const n = norm(ch.name);
  if (JAMAIS.includes(n)) return false;
  if (estProtege(n)) return false;   // communication → protégé (prioritaire)
  return estGestion(n);
}

function peutLancer(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return true;
  return member.roles?.cache?.some(r => ['Fondateur', 'Conseil', 'Directeur'].some(x => r.name.includes(x)));
}

// ── Analyse (partagée par l'aperçu et l'application) ─────────────────────────
function _analyser(guild) {
  const archiveCat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && norm(c.name) === norm(ARCHIVE_CAT)) || null;
  const aRanger = [];
  for (const ch of guild.channels.cache.values()) {
    if (!aArchiver(ch)) continue;
    if (archiveCat && ch.parentId === archiveCat.id) continue; // déjà archivé
    aRanger.push(ch);
  }
  aRanger.sort((a, b) => a.name.localeCompare(b.name));

  // Rôles candidats (LISTE seulement) : nom matche un motif de gestion, hors rôles
  // gérés par une intégration (bot) et hors @everyone.
  const rolesCandidats = guild.roles.cache
    .filter(r => r.id !== guild.id && !r.managed && estGestion(norm(r.name)) && !estProtege(norm(r.name)))
    .map(r => ({ nom: r.name, membres: r.members?.size ?? 0 }))
    .sort((a, b) => a.nom.localeCompare(b.nom));

  return { archiveCat, aRanger, rolesCandidats };
}

async function _webhooksDe(guild, channelIds) {
  try {
    const all = await guild.fetchWebhooks();
    return all.filter(w => channelIds.has(w.channelId)).map(w => ({ nom: w.name, chId: w.channelId, id: w.id }));
  } catch { return null; } // permission « Gérer les webhooks » manquante
}

// ── Aperçu (aucune action) ──────────────────────────────────────────────────
async function _apercu(guild) {
  const { archiveCat, aRanger, rolesCandidats } = _analyser(guild);
  const ids = new Set(aRanger.map(c => c.id));
  const webhooks = await _webhooksDe(guild, ids);

  const L = ['🔍 **Aperçu du ménage** — *rien n\'est modifié pour l\'instant.*', ''];
  L.push(`📦 **À ARCHIVER (gestion, migré vers le site) : ${aRanger.length} salon(s)**${archiveCat ? '' : ' — *catégorie « 🗄️ ARCHIVE » à créer*'}`);
  if (!aRanger.length) L.push('   *— rien à archiver, le serveur est déjà propre —*');
  else for (const c of aRanger) L.push(`   • #${c.name}  _(motif : ${motifGestion(norm(c.name))})_`);
  L.push('');

  // Catégories qui seraient ENTIÈREMENT vidées par l'archivage (supprimables ensuite).
  const idsRanger = new Set(aRanger.map(c => c.id));
  const videesApres = [];
  for (const cat of guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()) {
    if (archiveCat && cat.id === archiveCat.id) continue;
    const enfants = [...guild.channels.cache.filter(c => c.parentId === cat.id).values()];
    if (enfants.length && enfants.every(c => idsRanger.has(c.id))) videesApres.push(cat.name);
  }
  if (videesApres.length) {
    L.push(`🗂️ **${videesApres.length} catégorie(s) seraient ensuite vides** : ${videesApres.join(', ')} — supprimables via \`!menage vides\`.`);
    L.push('');
  }

  L.push('🔐 **Toujours conservés** : tous les vocaux, et les salons de discussion / RP / annonces / règlement / présentations / médias… (liste blanche prioritaire).');
  L.push('');

  if (webhooks === null) L.push('🪝 **Webhooks** : impossible de les lister (permission « Gérer les webhooks » manquante).');
  else L.push(`🪝 **Webhooks dans ces salons : ${webhooks.length}**${webhooks.length ? ' — ' + webhooks.map(w => w.nom).join(', ') : ''} _(supprimables ensuite via_ \`!menage webhooks\`_, une fois archivés)_`);
  L.push('');

  L.push(`👥 **Rôles candidats (à revoir à la main, JAMAIS supprimés par le bot) : ${rolesCandidats.length}**`);
  if (!rolesCandidats.length) L.push('   *— aucun rôle de gestion évident —*');
  else for (const r of rolesCandidats) L.push(`   • ${r.nom} _(${r.membres} membre(s))_`);
  L.push('');

  L.push('▶️ Tape **`!menage`** pour archiver (réversible), **`!menage annuler`** pour tout remettre.');
  return L.join('\n');
}

// ── Application : archive (déplace + masque), réversible ─────────────────────
async function _appliquer(guild) {
  const { archiveCat, aRanger } = _analyser(guild);
  if (!aRanger.length) return { archives: 0, echecs: 0, rien: true };

  const db = loadDB();
  db.menageBackup = db.menageBackup || {};

  // Crée la catégorie d'archive masquée (@everyone ne voit rien) si besoin.
  let cat = archiveCat;
  if (!cat) {
    cat = await guild.channels.create({
      name: ARCHIVE_CAT,
      type: ChannelType.GuildCategory,
      permissionOverwrites: [{ id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] }],
    }).catch(() => null);
  }
  if (!cat) return { archives: 0, echecs: aRanger.length, rien: false };

  let archives = 0, echecs = 0;
  for (const ch of aRanger) {
    try {
      // Mémorise l'état d'origine (parent + overwrite @everyone) pour l'annulation.
      if (db.menageBackup[ch.id] === undefined) {
        const ov = ch.permissionOverwrites?.cache?.get(guild.id);
        db.menageBackup[ch.id] = {
          parent: ch.parentId || null,
          everyone: ov ? { allow: ov.allow.bitfield.toString(), deny: ov.deny.bitfield.toString() } : null,
        };
      }
      // Masque le salon pour @everyone (conserve les autres permissions), puis le range.
      await ch.permissionOverwrites.edit(guild.id, { ViewChannel: false });
      await ch.setParent(cat.id, { lockPermissions: false });
      archives++;
    } catch (e) { console.log('⚠️ menage archive', ch.name, e.message); echecs++; }
  }
  saveDB(db);
  return { archives, echecs, rien: false, cat };
}

// ── Annulation : remet chaque salon à sa place + restaure la visibilité ──────
async function _annuler(guild) {
  const db = loadDB();
  const backup = db.menageBackup || {};
  let remis = 0, echecs = 0;
  for (const [chId, info] of Object.entries(backup)) {
    const ch = guild.channels.cache.get(chId);
    if (!ch) continue;
    try {
      await ch.setParent(info.parent || null, { lockPermissions: false });
      if (info.everyone) {
        await ch.permissionOverwrites.edit(guild.id, {
          allow: BigInt(info.everyone.allow),
          deny: BigInt(info.everyone.deny),
        });
      } else {
        // Aucun overwrite @everyone à l'origine → on retire celui qu'on avait posé.
        await ch.permissionOverwrites.delete(guild.id).catch(() => {});
      }
      remis++;
    } catch (e) { console.log('⚠️ menage annuler', ch.name, e.message); echecs++; }
  }
  delete db.menageBackup; saveDB(db);
  return { remis, echecs };
}

// ── Webhooks : supprime ceux situés dans la catégorie d'archive (explicite) ──
async function _supprimerWebhooks(guild) {
  const cat = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && norm(c.name) === norm(ARCHIVE_CAT));
  if (!cat) return { supprimes: 0, echecs: 0, pasDeCategorie: true };
  const idsArchives = new Set(guild.channels.cache.filter(c => c.parentId === cat.id).map(c => c.id));
  let supprimes = 0, echecs = 0;
  try {
    const all = await guild.fetchWebhooks();
    for (const w of all.values()) {
      if (!idsArchives.has(w.channelId)) continue;
      const ok = await w.delete('Ménage : salon de gestion archivé (migré vers le site)').then(() => true).catch(() => false);
      if (ok) supprimes++; else echecs++;
    }
  } catch { return { supprimes: 0, echecs: 0, permission: true }; }
  return { supprimes, echecs };
}

// ── Catégories vides : repère et supprime les catégories sans aucun salon ─────
// (typiquement d'anciennes catégories de gestion, entièrement vidées par
// l'archivage). Ne touche JAMAIS la catégorie d'archive.
function _categoriesVides(guild) {
  const archiveNorm = norm(ARCHIVE_CAT);
  const vides = [];
  for (const cat of guild.channels.cache.filter(c => c.type === ChannelType.GuildCategory).values()) {
    if (norm(cat.name) === archiveNorm) continue;                 // jamais l'archive
    if (guild.channels.cache.filter(c => c.parentId === cat.id).size === 0) vides.push(cat);
  }
  return vides.sort((a, b) => a.name.localeCompare(b.name));
}

async function _supprimerVides(guild) {
  const vides = _categoriesVides(guild);
  let supprimes = 0, echecs = 0;
  for (const cat of vides) {
    const ok = await cat.delete('Ménage : catégorie vide (finalisation)').then(() => true).catch(() => false);
    if (ok) supprimes++; else echecs++;
  }
  return { supprimes, echecs, total: vides.length };
}

// ── Point d'entrée ───────────────────────────────────────────────────────────
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    const txt = (message.content || '').trim();
    if (!/^!menage\b/i.test(txt)) return false;
    if (!peutLancer(message.member)) {
      await message.reply({ content: '❌ Réservé à la Direction (ou « Gérer les salons »).', allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }
    const arg = norm(txt.replace(/^!menage/i, ''));

    if (arg === 'test' || arg === 'apercu' || arg === 'preview' || arg === '') {
      const apercu = await _apercu(message.guild);
      for (let i = 0; i < apercu.length; i += 1900) {
        await message.channel.send({ content: apercu.slice(i, i + 1900), allowedMentions: { parse: [] } }).catch(() => {});
      }
      if (arg === '') await message.channel.send({ content: '⚠️ Pour lancer réellement l\'archivage : **`!menage go`** (ou `!menage confirmer`).', allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }

    if (arg === 'annuler' || arg === 'undo' || arg === 'annule') {
      const { remis, echecs } = await _annuler(message.guild);
      await message.reply({ content: `↩️ Annulation : **${remis}** salon(s) remis à leur place${echecs ? ` · ${echecs} échec(s)` : ''}. La catégorie « 🗄️ ARCHIVE » peut être supprimée à la main si elle est vide.`, allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }

    if (arg === 'webhooks' || arg === 'webhook') {
      const r = await _supprimerWebhooks(message.guild);
      if (r.pasDeCategorie) await message.reply({ content: '❌ Aucune catégorie « 🗄️ ARCHIVE » : lance d\'abord `!menage go`.', allowedMentions: { parse: [] } }).catch(() => {});
      else if (r.permission) await message.reply({ content: '❌ Permission « Gérer les webhooks » manquante.', allowedMentions: { parse: [] } }).catch(() => {});
      else await message.reply({ content: `🪝 Webhooks supprimés dans les salons archivés : **${r.supprimes}**${r.echecs ? ` · ${r.echecs} échec(s)` : ''}.`, allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }

    if (arg === 'vides' || arg === 'vide') {
      const vides = _categoriesVides(message.guild);
      if (!vides.length) { await message.reply({ content: '✨ Aucune catégorie vide à supprimer.', allowedMentions: { parse: [] } }).catch(() => {}); return true; }
      const L = [`🗂️ **Catégories vides (0 salon) : ${vides.length}**`];
      for (const c of vides) L.push(`   • ${c.name}`);
      L.push('');
      L.push('▶️ Tape **`!menage vides go`** pour les supprimer. ⚠️ Après ça, `!menage annuler` ne pourra plus remettre un salon dans une catégorie supprimée.');
      await message.channel.send({ content: L.join('\n'), allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }
    if (arg === 'videsgo' || arg === 'videsconfirmer' || arg === 'videsconfirm' || arg === 'videslancer') {
      const r = await _supprimerVides(message.guild);
      await message.reply({ content: r.total ? `🗑️ Catégories vides supprimées : **${r.supprimes}**${r.echecs ? ` · ${r.echecs} échec(s) (permissions ?)` : ''}.` : '✨ Aucune catégorie vide à supprimer.', allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }

    if (arg === 'go' || arg === 'confirmer' || arg === 'confirm' || arg === 'lancer') {
      const wait = await message.reply({ content: '⏳ Archivage en cours… (déplacement + masquage, rien n\'est supprimé)', allowedMentions: { parse: [] } }).catch(() => null);
      const { archives, echecs, rien } = await _appliquer(message.guild);
      const fin = rien
        ? '✅ Rien à archiver — le serveur est déjà propre.'
        : `✅ Ménage terminé : **${archives}** salon(s) de gestion archivé(s)${echecs ? ` · ⚠️ ${echecs} échec(s) (permissions ?)` : ''}.\nIls sont masqués dans « 🗄️ ARCHIVE » — **rien n'est supprimé**.\n↩️ \`!menage annuler\` pour tout remettre · 🪝 \`!menage webhooks\` pour leurs webhooks · 🗂️ \`!menage vides\` pour retirer les catégories devenues vides · 🧭 \`!reorg test\` pour ranger les salons de communication restants.`;
      if (wait) await wait.edit({ content: fin, allowedMentions: { parse: [] } }).catch(() => {});
      else await message.channel.send({ content: fin, allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }

    await message.reply({ content: 'ℹ️ Commandes : `!menage test` (aperçu/audit) · `!menage go` (archiver) · `!menage annuler` · `!menage webhooks` · `!menage vides` (catégories vides).', allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } catch (e) { console.log('⚠️ menage onMessage:', e.message); return false; }
}

module.exports = { onMessage };
