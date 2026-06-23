// ═══════════════════════════════════════════════════════════════
// reorg.js — Réorganisation sûre du serveur (catégories + déplacement)
// • Ne fait QUE créer des catégories et DÉPLACER des salons (lockPermissions:false)
// • Aucune suppression, aucun rôle touché, permissions de chaque salon conservées
// • Mode aperçu (test), application, et annulation (remise à la catégorie d'origine)
// ═══════════════════════════════════════════════════════════════
const { ChannelType, PermissionsBitField } = require('discord.js');
const { loadDB, saveDB } = require('./db');

// Salon(s) à NE JAMAIS déplacer (réservé visiteurs)
const NE_PAS_BOUGER = ['contacterlacompagnie'];

const norm = s => (s || '')
  .normalize('NFD').replace(/[̀-ͯ]/g, '')
  .toLowerCase().replace(/[^a-z0-9]/g, '');

// Plan : ordre = priorité. Le 1er bloc dont un motif matche gagne (donc ARCHIVES avant LE BUREAU
// pour que « coffre-illegal » parte en archives et non au bureau).
const PLAN = [
  { cat: '📦 ARCHIVES', motifs: ['illegal', 'ombre', 'maudit', 'condamne', 'executeur', 'fleau', 'concepteur'] },
  { cat: '🗂️ LE BUREAU', motifs: ['contrat', 'operation', 'element', 'wanted', 'bandit', 'comptabilit', 'coffreentreprise', 'medical', 'medic', 'telegramme', 'rendezvous'] },
  { cat: '🛠️ DIRECTION / STAFF', motifs: ['conversationdirection', 'tableaudebord', 'dashboard', 'registredesmembres', 'registreengagement', 'registre', 'dossierrecrutement', 'recrutementinterne', 'patchnote', 'journaldebord', 'logs', 'vocdirection', 'conseilvocal'] },
  { cat: '🐺 LA CONFRÉRIE', motifs: ['histoireiwc', 'fichepersonnage', 'fichespersonnages', 'surnompseudo', 'agenda', 'planning', 'affaire', 'informateur', 'plans', 'rumeur', 'notes', 'formation', 'discussionrp', 'grade', 'absence', 'contactsrepertoire', 'contact'] },
  { cat: '🎙️ VOCAUX', motifs: ['vocal', 'voix'] },
];

const TYPES_DEPLACABLES = new Set([
  ChannelType.GuildText, ChannelType.GuildVoice,
  ChannelType.GuildAnnouncement, ChannelType.GuildForum, ChannelType.GuildStageVoice,
]);

function categoriePour(ch) {
  const n = norm(ch.name);
  if (NE_PAS_BOUGER.includes(n)) return null;
  for (const bloc of PLAN) {
    if (bloc.motifs.some(m => n.includes(m))) return bloc.cat;
  }
  return null; // non classé → on n'y touche pas
}

function peutLancer(member) {
  if (!member) return false;
  if (member.permissions?.has(PermissionsBitField.Flags.ManageChannels)) return true;
  return member.roles?.cache?.some(r => ['Fondateur', 'Conseil', 'Directeur'].some(x => r.name.includes(x)));
}

// Construit le plan concret : { cat → [salons à déplacer] }, en ignorant ceux déjà bien placés.
async function _construirePlan(guild) {
  const cats = {}; // nom catégorie → catégorie existante (ou null)
  for (const bloc of PLAN) {
    const existante = guild.channels.cache.find(c => c.type === ChannelType.GuildCategory && norm(c.name) === norm(bloc.cat));
    cats[bloc.cat] = existante || null;
  }
  const aDeplacer = {}; // nom catégorie → [channels]
  for (const ch of guild.channels.cache.values()) {
    if (!TYPES_DEPLACABLES.has(ch.type)) continue;
    const cible = categoriePour(ch);
    if (!cible) continue;
    const catExistante = cats[cible];
    if (catExistante && ch.parentId === catExistante.id) continue; // déjà bien rangé
    (aDeplacer[cible] = aDeplacer[cible] || []).push(ch);
  }
  return { cats, aDeplacer };
}

async function _apercu(guild) {
  const { cats, aDeplacer } = await _construirePlan(guild);
  const lignes = ['🔍 **Aperçu de la réorganisation** — *rien n\'est déplacé pour l\'instant.*', ''];
  let total = 0;
  for (const bloc of PLAN) {
    const liste = aDeplacer[bloc.cat] || [];
    const dejaLa = cats[bloc.cat] ? '' : ' *(catégorie à créer)*';
    lignes.push(`**${bloc.cat}**${dejaLa}`);
    if (!liste.length) { lignes.push('   *— rien à déplacer —*'); }
    else liste.forEach(c => { total++; lignes.push(`   • ${c.name}`); });
    lignes.push('');
  }
  lignes.push(`📦 **${total} salon(s)** seraient déplacés. \`contacter-la-compagnie\` n'est jamais touché.`);
  lignes.push('Permissions conservées · rien supprimé. Tape **`!reorg`** pour lancer, ou ne fais rien si ça ne te plaît pas.');
  return lignes.join('\n');
}

async function _appliquer(guild) {
  const { cats, aDeplacer } = await _construirePlan(guild);
  const db = loadDB();
  db.reorgBackup = db.reorgBackup || {};
  let deplaces = 0, echecs = 0;
  for (const bloc of PLAN) {
    const liste = aDeplacer[bloc.cat] || [];
    if (!liste.length) continue;
    // Créer la catégorie si besoin
    if (!cats[bloc.cat]) {
      cats[bloc.cat] = await guild.channels.create({ name: bloc.cat, type: ChannelType.GuildCategory }).catch(() => null);
    }
    const cat = cats[bloc.cat];
    if (!cat) { echecs += liste.length; continue; }
    for (const ch of liste) {
      // mémoriser l'origine (une seule fois) pour pouvoir annuler
      if (db.reorgBackup[ch.id] === undefined) db.reorgBackup[ch.id] = ch.parentId || null;
      const ok = await ch.setParent(cat.id, { lockPermissions: false }).then(() => true).catch(e => { console.log('⚠️ reorg move', ch.name, e.message); return false; });
      if (ok) deplaces++; else echecs++;
    }
  }
  saveDB(db);
  return { deplaces, echecs };
}

async function _annuler(guild) {
  const db = loadDB();
  const backup = db.reorgBackup || {};
  let remis = 0, echecs = 0;
  for (const [chId, oldParent] of Object.entries(backup)) {
    const ch = guild.channels.cache.get(chId);
    if (!ch) continue;
    const ok = await ch.setParent(oldParent || null, { lockPermissions: false }).then(() => true).catch(() => false);
    if (ok) remis++; else echecs++;
  }
  delete db.reorgBackup; saveDB(db);
  return { remis, echecs };
}

// Point d'entrée — renvoie true si le message a été pris en charge
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    const txt = (message.content || '').trim();
    if (!/^!reorg\b/i.test(txt)) return false;
    if (!peutLancer(message.member)) {
      await message.reply({ content: '❌ Réservé à la direction (ou « Gérer les salons »).', allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }
    const arg = norm(txt.replace(/^!reorg/i, ''));
    if (arg === 'test' || arg === 'apercu' || arg === 'preview') {
      const apercu = await _apercu(message.guild);
      // Découper si > 2000 caractères
      for (let i = 0; i < apercu.length; i += 1900) {
        await message.channel.send({ content: apercu.slice(i, i + 1900), allowedMentions: { parse: [] } }).catch(() => {});
      }
      return true;
    }
    if (arg === 'annuler' || arg === 'undo' || arg === 'annule') {
      const { remis, echecs } = await _annuler(message.guild);
      await message.reply({ content: `↩️ Annulation : **${remis}** salon(s) remis à leur place${echecs ? ` · ${echecs} échec(s)` : ''}.`, allowedMentions: { parse: [] } }).catch(() => {});
      return true;
    }
    // Sinon : appliquer
    const wait = await message.reply({ content: '⏳ Réorganisation en cours… (déplacement, permissions conservées)', allowedMentions: { parse: [] } }).catch(() => null);
    const { deplaces, echecs } = await _appliquer(message.guild);
    const txtFin = `✅ Réorganisation terminée : **${deplaces}** salon(s) rangés${echecs ? ` · ⚠️ ${echecs} échec(s) (permission « Gérer les salons » ?)` : ''}.\nRien n'a été supprimé, les permissions sont conservées. \`!reorg annuler\` pour tout remettre comme avant.`;
    if (wait) await wait.edit({ content: txtFin, allowedMentions: { parse: [] } }).catch(() => {});
    else await message.channel.send({ content: txtFin, allowedMentions: { parse: [] } }).catch(() => {});
    return true;
  } catch (e) { console.log('⚠️ reorg onMessage:', e.message); return false; }
}

module.exports = { onMessage };
