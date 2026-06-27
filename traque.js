// ═══════════════════════════════════════════════════════════════
// traque.js — Avis de recherche / chasse à l'homme (mercenaires IWC)
// Créer une cible, signaler des pistes, rejoindre la traque comme
// chasseur, clôturer (capturée / éliminée / abandonnée) + prime.
// Branchement index.js : require + traqueCommands + routeInteraction.
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, SlashCommandBuilder, MessageFlags, AttachmentBuilder, ChannelType,
} = require('discord.js');
const { loadDB, saveDB, sauvegarderSurGitHub } = require('./db');
let relais = {}; try { relais = require('./relais'); } catch {}
let modetest = {}; try { modetest = require('./modetest'); } catch {}

const CH_JOURNAL = '1508756535407542372';
const CH_ELEMENT_OPS = '1518349707686973470'; // #élément-opérations : on y archive les avis clôturés
const ROLE_CONFRERIE = '1508898841993281658';
const RESP_ROLES = ['Concepteur', 'Fléau', 'Fondateur', 'Directeur', 'Conseil', 'Officier', 'Instructeur'];

const STATUTS = {
  chasse:     { label: '🟠 En chasse',   couleur: 0xE67E22 },
  reperee:    { label: '🔵 Repérée',     couleur: 0x3498DB },
  capturee:   { label: '✅ Capturée',    couleur: 0x57F287 },
  eliminee:   { label: '💀 Éliminée',    couleur: 0xED4245 },
  abandonnee: { label: '⚫ Abandonnée',  couleur: 0x555555 },
};
const DANGER = {
  faible: '🟢 Faible', moyen: '🟡 Moyen', eleve: '🟠 Élevé', extreme: '🔴 Extrême',
};

const traqueCommands = [
  new SlashCommandBuilder().setName('avis-recherche').setDescription('🎯 Lancer un avis de recherche (traque une cible)'),
  new SlashCommandBuilder().setName('traques').setDescription('🎯 Voir les avis de recherche en cours')
    .addStringOption(o => o.setName('dangerosite').setDescription('Filtrer par dangerosité').setRequired(false)
      .addChoices({ name: '🟢 Faible', value: 'faible' }, { name: '🟡 Moyen', value: 'moyen' }, { name: '🟠 Élevé', value: 'eleve' }, { name: '🔴 Extrême', value: 'extreme' }))
    .addStringOption(o => o.setName('tri').setDescription('Trier les résultats').setRequired(false)
      .addChoices({ name: '💰 Prime (haute → basse)', value: 'prime' }, { name: '⚠️ Dangerosité', value: 'danger' }, { name: '🆕 Plus récents', value: 'recent' }))
    .addStringOption(o => o.setName('lieu').setDescription('Filtrer par lieu / région (texte)').setRequired(false)),
  new SlashCommandBuilder().setName('signalement').setDescription("📋 Signalement détaillé d'une cible à partir d'une photo")
    .addAttachmentOption(o => o.setName('photo').setDescription('Capture de la personne en jeu').setRequired(true))
    .addStringOption(o => o.setName('cible').setDescription('Nom / identité de la cible (optionnel)').setRequired(false)),
];

// ─── Helpers ───
function estResponsable(member) {
  return !!member?.roles?.cache?.some(r => RESP_ROLES.some(n => r.name.includes(n)));
}
function journalCh(guild) {
  if (typeof global.getJournalCh === 'function') { try { const c = global.getJournalCh(guild); if (c) return c; } catch {} }
  return guild.channels.cache.get(CH_JOURNAL) || null;
}
function elementOpsCh(guild) {
  return guild.channels.cache.get(CH_ELEMENT_OPS) || null;
}
// #élément-opérations est un salon FORUM → pas de .send() : on crée un post (thread).
// Helper unifié : marche pour un forum (crée un post) comme pour un salon texte (.send()).
async function postElementOps(ops, payload, titre = 'Opération') {
  if (!ops) return null;
  try {
    if (ops.type === ChannelType.GuildForum) {
      const thread = await ops.threads.create({
        name: String(titre).slice(0, 100),
        message: payload,
      }).catch(() => null);
      return thread ? { id: thread.id, threadId: thread.id } : null;
    }
    if (typeof ops.send === 'function') {
      const m = await ops.send(payload).catch(() => null);
      return m ? { id: m.id } : null;
    }
  } catch { /* noop */ }
  return null;
}
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR'); }
function findTraque(db, id) { return (db.traques || []).find(t => t.id === id || t.messageId === id); }
// Montant numérique extrait d'une prime en texte libre (ex: "500 $" → 500).
function _montantPrime(s) { const m = String(s || '').replace(/\s/g, '').match(/(\d[\d.,]*)/); return m ? (parseInt(m[1].replace(/[.,]/g, ''), 10) || 0) : 0; }
// Crédite le portefeuille RP (db.economie) des chasseurs, à parts égales. Renvoie {part, total, n}.
function _crediterChasseurs(db, chasseurs, montantTotal, raison) {
  db.economie = db.economie || {};
  const ids = [...new Set((chasseurs || []).filter(Boolean))];
  if (!ids.length || montantTotal <= 0) return { part: 0, total: 0, n: ids.length };
  const part = Math.floor(montantTotal / ids.length);
  if (part <= 0) return { part: 0, total: 0, n: ids.length };
  const date = new Date().toLocaleDateString('fr-FR');
  for (const id of ids) {
    const cur = db.economie[id];
    const compte = (cur && typeof cur === 'object') ? cur : { solde: (typeof cur === 'number' ? cur : 0), historique: [] };
    if (!Array.isArray(compte.historique)) compte.historique = [];
    compte.solde = (compte.solde || 0) + part;
    compte.historique.push({ date, montant: part, raison: String(raison || 'Prime').slice(0, 120) });
    db.economie[id] = compte;
  }
  return { part, total: part * ids.length, n: ids.length };
}
function dangerLabel(v) { return DANGER[v] || '🟡 Moyen'; }

// ─── Signalement par photo (vision IA) ───
const PROMPT_SIGNALEMENT = `Tu es un traqueur chevronné qui rédige un SIGNALEMENT TRÈS DÉTAILLÉ à partir d'une capture d'écran d'un personnage dans un jeu vidéo Far West (RedM / Red Dead Redemption 2). C'est un personnage de jeu fictif.
Observe l'image avec la plus grande minutie, comme un chasseur de primes qui doit pouvoir reconnaître la cible dans une foule. Sois EXHAUSTIF et PRÉCIS :
- Note les COULEURS EXACTES (pas "sombre" mais "brun foncé", "bordeaux", "bleu nuit", "beige sable"...).
- Précise les MATIÈRES (cuir, laine, lin, peau de bête...) et l'ÉTAT (neuf, usé, sale, déchiré, rapiécé).
- Décris les vêtements en COUCHES, du dessus au-dessous (manteau → veste → gilet → chemise).
- Repère le moindre détail distinctif : accessoires, marques, façon de porter les armes, posture.
Décris UNIQUEMENT ce qui est réellement visible. N'invente rien : si un élément n'est pas visible, mets "Non visible".
Réponds UNIQUEMENT avec un objet JSON valide, sans aucun texte ni balise autour, au format EXACT :
{"allure":"sexe apparent, corpulence, carrure, taille estimée, posture/attitude","teint":"carnation de la peau si visible, sinon Non visible","cheveux":"couleur précise, longueur, coiffure, sinon Non visible","pilosite":"barbe/moustache/favoris : type, couleur, longueur, sinon Rasé ou Non visible","visage":"forme du visage, traits marquants, regard/yeux, âge apparent, rides, sinon Non visible","chapeau":"couvre-chef : type précis, couleur, état, bandeau/ornement, sinon Non visible","haut":"vêtements du haut en couches (manteau, veste, gilet, chemise) avec couleurs précises, matières et état","bas":"pantalon/jambières : couleur, matière, état, sinon Non visible","chaussures":"bottes/souliers : couleur, type, éperons, sinon Non visible","accessoires":"bandana/foulard, gants, ceinture, cartouchière, sacoche, bijoux, badge, lunettes, cigare, montre... sinon Aucun visible","armes":"armes visibles : type précis (revolver, carabine, fusil à canon scié, couteau, lasso...) et où elles sont portées (holster, dos, ceinture), sinon Aucune visible","marques":"cicatrices, tatouages, blessures, peintures de guerre, masque, marques distinctives, sinon Aucune visible","monture":"cheval si visible : robe/couleur, marques, selle/équipement, sinon Non visible","environnement":"décor visible, lieu probable, moment de la journée, sinon Non visible","etat_general":"état général : propre/soigné, débraillé, couvert de boue ou de poussière, ensanglanté, blessé, trempé... sinon Non visible","trait_distinctif":"LE signe le plus reconnaissable pour repérer cette cible dans une foule — le seul détail le plus marquant (ex : cicatrice en travers de l'œil, manteau rouge sang, absence d'un bras...)","position":"emplacement de la cible SUR LA PHOTO si plusieurs personnes sont présentes (à gauche / au centre / à droite, premier ou arrière-plan), sinon Non applicable","dangerosite":"faible|moyen|eleve|extreme","resume":"une phrase percutante de synthèse, façon avis de recherche du Far West"}
Écris en français, de façon factuelle, riche et précise.`;

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}
async function _callVisionSignal(model, b64, mt, indice) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const hint = (indice && indice.trim())
      ? `\n\n⚠️ INDICATION SUR LA CIBLE : « ${indice.trim()} ». S'il y a PLUSIEURS personnes sur l'image, identifie et décris UNIQUEMENT celle qui correspond à cette indication — ignore complètement les autres personnes.`
      : `\n\n⚠️ S'il y a PLUSIEURS personnes sur l'image et aucune indication précise, décris la personne la plus AU CENTRE et au PREMIER PLAN (la plus mise en avant). Indique alors dans "resume" qu'il y a plusieurs personnes et précise laquelle tu as décrite.`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1600, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mt || 'image/png', data: b64 } },
        { type: 'text', text: PROMPT_SIGNALEMENT + hint },
      ] }] }),
    });
    if (!resp.ok) return null;
    const data = await resp.json();
    return (data?.content?.[0]?.text || "");
  } catch { return null; }
}
function _parseSignal(txt) {
  if (!txt) return null;
  txt = String(txt).trim().replace(/```json/gi, "").replace(/```/g, "").trim();
  const m = txt.match(/\{[\s\S]*\}/); if (!m) return null;
  try { const o = JSON.parse(m[0]); return (o && typeof o === 'object') ? o : null; } catch { return null; }
}
async function _analyserSignalement(b64, mt, indice) {
  let txt = await _callVisionSignal('claude-sonnet-4-6', b64, mt, indice);
  if (!txt) txt = await _callVisionSignal('claude-haiku-4-5-20251001', b64, mt, indice);
  return _parseSignal(txt);
}
function _signalementTexte(s) {
  const ok = v => v && !/^(non visible|aucune? visible|aucun visible|non applicable|n\/a|rasé|néant)$/i.test(String(v).trim());
  const parts = [];
  if (ok(s.allure)) parts.push(String(s.allure));
  if (ok(s.teint)) parts.push('Teint : ' + s.teint);
  if (ok(s.cheveux)) parts.push('Cheveux : ' + s.cheveux);
  if (ok(s.pilosite)) parts.push('Pilosité : ' + s.pilosite);
  if (ok(s.visage)) parts.push('Visage : ' + s.visage);
  if (ok(s.chapeau)) parts.push('Chapeau : ' + s.chapeau);
  if (ok(s.haut)) parts.push('Haut : ' + s.haut);
  if (ok(s.bas)) parts.push('Bas : ' + s.bas);
  if (ok(s.accessoires)) parts.push('Accessoires : ' + s.accessoires);
  if (ok(s.armes)) parts.push('Armé : ' + s.armes);
  if (ok(s.marques)) parts.push('Marques : ' + s.marques);
  if (ok(s.trait_distinctif)) parts.push('⭐ Signe : ' + s.trait_distinctif);
  let txt = parts.join('. ');
  if (!txt) txt = String(s.resume || "Signalement établi d'après la photo.");
  return txt.slice(0, 700);
}
function buildSignalementEmbed(s, cible, photoUrl, auteur) {
  const dKey = DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite);
  const ok = v => v && !/^(non visible|aucune? visible|aucun visible|non applicable|n\/a|rasé|néant)$/i.test(String(v).trim());
  const f = (n, v, inline) => ({ name: n, value: (ok(v) ? String(v) : 'Non visible').slice(0, 1024), inline: !!inline });
  const e = new EmbedBuilder()
    .setColor(0x8B5A2B)
    .setTitle(`📋 SIGNALEMENT${cible ? ' — ' + cible : ''}`)
    .setDescription(s.resume ? `*${String(s.resume).slice(0, 400)}*` : "*Signalement établi d'après la photo.*");
  const fields = [f('🧍 Allure', s.allure, false)];
  if (ok(s.trait_distinctif)) fields.push(f('⭐ Signe le plus reconnaissable', s.trait_distinctif, false));
  if (ok(s.position)) fields.push(f('📍 Position sur la photo', s.position, true));
  if (ok(s.teint)) fields.push(f('🎨 Teint', s.teint, true));
  if (ok(s.cheveux)) fields.push(f('💈 Cheveux', s.cheveux, true));
  if (ok(s.pilosite)) fields.push(f('🧔 Pilosité', s.pilosite, true));
  if (ok(s.visage)) fields.push(f('👤 Visage', s.visage, false));
  fields.push(f('🤠 Couvre-chef', s.chapeau, true), f('🔫 Armes', s.armes, true));
  fields.push(f('🧥 Haut du corps', s.haut, false));
  if (ok(s.bas)) fields.push(f('👖 Bas', s.bas, true));
  if (ok(s.chaussures)) fields.push(f('🥾 Chaussures', s.chaussures, true));
  if (ok(s.accessoires)) fields.push(f('🎒 Accessoires', s.accessoires, false));
  if (ok(s.marques)) fields.push(f('🩹 Marques distinctives', s.marques, false));
  if (ok(s.etat_general)) fields.push(f('🧭 État général', s.etat_general, true));
  if (ok(s.monture)) fields.push(f('🐴 Monture', s.monture, false));
  if (ok(s.environnement)) fields.push(f('🌅 Repéré', s.environnement, true));
  fields.push({ name: '⚠️ Dangerosité estimée', value: dangerLabel(dKey), inline: true });
  e.addFields(...fields.slice(0, 25));
  if (photoUrl) e.setThumbnail(photoUrl);
  e.setFooter({ text: `IWC • Signalement établi par ${auteur} • généré par l'IA d'après la photo` });
  return e;
}

// ─── Affichage de l'avis (poster CONCIS — le détail complet est dans le fil) ───
function buildPoster(t) {
  const st = STATUTS[t.status] || STATUTS.chasse;
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  const chasseurs = (t.chasseurs || []).length ? t.chasseurs.map(id => `<@${id}>`).join(', ') : '*Aucun*';
  const nbPistes = (t.pistes || []).length;
  const clean = v => v && !/^(non visible|aucune? visible|aucun visible|non applicable|non identifiable|n\/a|néant)$/i.test(String(v).trim());
  const resume = (t.full && clean(t.full.resume)) ? String(t.full.resume) : String(t.signalement || '').slice(0, 200);
  const trait = (t.full && clean(t.full.trait_distinctif)) ? String(t.full.trait_distinctif) : '';
  const e = new EmbedBuilder()
    .setColor(st.couleur)
    .setTitle(`🎯 AVIS DE RECHERCHE — ${t.cible}`)
    .setDescription(`${resume ? `*${resume.slice(0, 280)}*\n\n` : ''}🔍 *Description physique complète et discussion → dans le fil ci-dessous.* 👇`)
    .addFields(
      { name: '💰 Prime', value: t.prime || '—', inline: true },
      { name: '⚠️ Dangerosité', value: dangerLabel(t.dangerosite), inline: true },
      { name: '📌 Statut', value: st.label, inline: true },
      { name: '📍 Dernière position', value: t.position || '—', inline: true },
      { name: '🎯 Consigne', value: t.vivantMort || 'Indifférent', inline: true },
      { name: '👤 Commanditaire', value: t.commanditaire || '—', inline: true },
    );
  if (trait) e.addFields({ name: '⭐ Signe le plus reconnaissable', value: trait.slice(0, 256), inline: false });
  e.addFields(
    { name: '🤠 Chasseurs', value: chasseurs, inline: true },
    { name: '🧭 Pistes', value: nbPistes ? `**${nbPistes}** signalée(s) — voir le fil` : '*Aucune*', inline: true },
  );
  if ((t.linkedOps || []).length) e.addFields({ name: '🔗 Opération(s) liée(s)', value: t.linkedOps.map(o => `• **${o.name}** \`${o.id}\``).join('\n').slice(0, 1000), inline: false });
  e.setFooter({ text: `IWC • Avis ${t.id}${closed && t.resultat ? ' • ' + t.resultat : ''}` });
  if (t.photo) e.setThumbnail(t.photo);
  if (t.photoCapture) e.setImage(t.photoCapture); // preuve de capture/clôture
  if (t.createdAt) e.setTimestamp(new Date(t.createdAt));
  return e;
}
function buildBoutons(t) {
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  if (closed) {
    return [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`traque_noop::${t.id}`).setLabel('Traque clôturée').setEmoji('🔒').setStyle(ButtonStyle.Secondary).setDisabled(true),
    )];
  }
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_piste::${t.id}`).setLabel('Signaler une piste').setEmoji('🧭').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`traque_chasseur::${t.id}`).setLabel('Rejoindre la traque').setEmoji('🤠').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId(`traque_lierop::${t.id}`).setLabel('Lier une opération').setEmoji('🔗').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`traque_cloturer::${t.id}`).setLabel('Clôturer').setEmoji('✅').setStyle(ButtonStyle.Danger),
  )];
}

// ─── Mise à jour du message d'origine ───
async function rafraichir(guild, t) {
  if (!t.messageId || !t.channelId) return;
  try {
    const ch = await guild.channels.fetch(t.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(t.messageId).catch(() => null);
    if (msg) await msg.edit({ embeds: [buildPoster(t)], components: buildBoutons(t) }).catch(() => {});
  } catch {}
}

// ─── Fiche clôturée archivée dans #élément-opérations ───
function buildClosedFiche(t) {
  const st = STATUTS[t.status] || STATUTS.abandonnee;
  const recompense = (t.status === 'capturee' || t.status === 'eliminee') ? (t.prime || '—') : '—';
  const chasseurs = (t.chasseurs || []).length ? t.chasseurs.map(id => `<@${id}>`).join(', ') : '*Aucun*';
  const e = new EmbedBuilder()
    .setColor(st.couleur)
    .setTitle(`🗂️ OPÉRATION CLÔTURÉE — ${t.cible}`)
    .setDescription('Avis de recherche clôturé et archivé.')
    .addFields(
      { name: '📌 Résultat', value: t.resultat || st.label, inline: true },
      { name: '💰 Prime', value: recompense, inline: true },
      { name: '⚠️ Dangerosité', value: dangerLabel(t.dangerosite), inline: true },
      { name: '📍 Dernière position', value: t.position || '—', inline: true },
      { name: '👤 Commanditaire', value: t.commanditaire || '—', inline: true },
      { name: '🤠 Chasseurs', value: chasseurs, inline: true },
    );
  const trait = (t.full && t.full.trait_distinctif) ? String(t.full.trait_distinctif) : '';
  if (trait && !/^non visible|^aucun/i.test(trait)) e.addFields({ name: '⭐ Signe distinctif', value: trait.slice(0, 256), inline: false });
  e.setFooter({ text: `IWC • Avis ${t.id} • clôturé` });
  if (t.photo) e.setThumbnail(t.photo);
  if (t.photoCapture) e.setImage(t.photoCapture);
  if (t.closedAt) e.setTimestamp(new Date(t.closedAt));
  return e;
}
async function rafraichirCloture(guild, t, files) {
  if (!t.opMessageId || !t.opChannelId) return null;
  try {
    const ch = await guild.channels.fetch(t.opChannelId).catch(() => null);
    if (!ch) return null;
    const msg = await ch.messages.fetch(t.opMessageId).catch(() => null);
    if (!msg) return null;
    const payload = { embeds: [buildClosedFiche(t)] };
    if (files) payload.files = files;
    return await msg.edit(payload).catch(() => null);
  } catch { return null; }
}
// Retire l'avis de recherche initial de #wanted (la suppression du message supprime aussi son fil)
async function _retirerAvis(guild, t) {
  try {
    if (t.messageId && t.channelId) {
      const ch = await guild.channels.fetch(t.channelId).catch(() => null);
      if (ch) { const m = await ch.messages.fetch(t.messageId).catch(() => null); if (m) await m.delete().catch(() => {}); }
    }
  } catch {}
  t.messageId = null;
}

// ─── Création : modal ───
function modalCreation(def, sid) {
  def = def || {};
  const m = new ModalBuilder().setCustomId(sid ? `traque_create_modal::${sid}` : 'traque_create_modal').setTitle('🎯 Nouvel avis de recherche');
  const cibleInput = new TextInputBuilder().setCustomId('cible').setLabel('Cible (nom / identité)').setStyle(TextInputStyle.Short).setRequired(true).setPlaceholder('Ex : Cole Bradford, le contrebandier');
  if (def.cible) cibleInput.setValue(String(def.cible).slice(0, 100));
  const signInput = new TextInputBuilder().setCustomId('signalement').setLabel('Signalement (description, délit)').setStyle(TextInputStyle.Paragraph).setRequired(false).setMaxLength(500).setPlaceholder('Apparence, méfaits, raison de la traque...');
  if (def.signalement) signInput.setValue(String(def.signalement).slice(0, 500));
  m.addComponents(
    new ActionRowBuilder().addComponents(cibleInput),
    new ActionRowBuilder().addComponents(signInput),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('position').setLabel('Dernière position connue').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Blackwater, Strawberry, et environs...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prime').setLabel('Prime + dangerosité').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : 500 $ · élevé  (faible/moyen/élevé/extrême)')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('infos').setLabel('Commanditaire + vivant/mort').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : Shérif de Armadillo · Vivant de préférence')),
  );
  return m;
}
// Ouvre le formulaire d'avis de recherche pré-rempli (ex : depuis une note du micro de terrain)
async function ouvrirModalAvis(interaction, def) {
  await interaction.showModal(modalCreation(def || {}));
}
function parseDanger(txt) {
  const s = String(txt || '').toLowerCase();
  if (s.includes('extr')) return 'extreme';
  if (s.includes('élev') || s.includes('elev') || s.includes('haut')) return 'eleve';
  if (s.includes('faible') || s.includes('bas')) return 'faible';
  return 'moyen';
}

async function handleCreateModal(interaction) {
  await interaction.deferReply({ flags: MessageFlags.Ephemeral });
  const sid = (interaction.customId.split('::')[1]) || null;
  const cible = interaction.fields.getTextInputValue('cible').trim();
  const primeRaw = interaction.fields.getTextInputValue('prime') || '';
  const infosRaw = interaction.fields.getTextInputValue('infos') || '';
  const prime = primeRaw.split(/[·|]/)[0].trim() || '—';
  const commanditaire = infosRaw.split(/[·|]/)[0].trim() || '—';
  const vivantMort = (infosRaw.split(/[·|]/)[1] || '').trim() || 'Indifférent';
  const db = loadDB();
  if (!db.traques) db.traques = [];
  const stash = sid && db._signalements ? db._signalements[sid] : null;
  let dangerosite = parseDanger(primeRaw);
  if (stash && stash.dangerosite && !/(faible|moyen|élev|elev|extr|haut|bas)/i.test(primeRaw)) dangerosite = stash.dangerosite;
  const t = {
    id: 'AR-' + Date.now().toString().slice(-5),
    cible,
    signalement: interaction.fields.getTextInputValue('signalement') || '',
    full: (stash && stash.full) ? stash.full : null,
    position: (interaction.fields.getTextInputValue('position') || '').trim() || '—',
    prime, dangerosite, commanditaire, vivantMort,
    status: 'chasse',
    chasseurs: [], pistes: [],
    createdAt: new Date().toISOString(),
    createdBy: interaction.user.username,
    channelId: interaction.channelId,
  };
  if (modetest.estActif?.()) t.test = true;
  if (stash && stash.photoUrl) t.photo = stash.photoUrl;
  // On récupère la photo en mémoire pour la réuploader DANS l'avis (elle survivra à la suppression du signalement)
  let photoBuf = null;
  if (t.photo) photoBuf = await _imageBytes(t.photo);
  // L'avis doit toujours atterrir dans le salon des avis de recherche, même si le modal a été ouvert ailleurs (ex : depuis une note du micro de terrain)
  let targetCh = null;
  try { if (db.wantedChannelId) targetCh = await interaction.guild.channels.fetch(db.wantedChannelId).catch(() => null); } catch {}
  if (!targetCh || !targetCh.send) targetCh = _findWantedChannel(interaction.guild);
  if (!targetCh || !targetCh.send) targetCh = interaction.channel;
  if (targetCh) t.channelId = targetCh.id;
  const posterEmbed = buildPoster(t);
  const posterPayload = { content: `<@&${ROLE_CONFRERIE}> — 🎯 **Nouvel avis de recherche.** La traque est ouverte.`, embeds: [posterEmbed], components: buildBoutons(t), allowedMentions: { roles: [ROLE_CONFRERIE] } };
  if (photoBuf) { posterEmbed.setThumbnail('attachment://wanted.png'); posterPayload.files = [new AttachmentBuilder(photoBuf, { name: 'wanted.png' })]; }
  const sent = await targetCh.send(posterPayload).catch(() => null);
  if (sent) {
    t.messageId = sent.id;
    // La photo de l'avis pointe désormais sur SA propre pièce jointe (indépendante du signalement supprimé)
    if (photoBuf) { const u = [...sent.attachments.values()][0]?.url; if (u) t.photo = u; }
    // Ouvrir un fil « Dossier » avec la description physique complète + la discussion
    try {
      const thread = await sent.startThread({ name: (modetest.prefixe ? modetest.prefixe(`🔍 Dossier — ${t.cible}`, t) : `🔍 Dossier — ${t.cible}`).slice(0, 100), autoArchiveDuration: 10080 }).catch(() => null);
      if (thread) {
        t.threadId = thread.id;
        const intro = "📋 **Dossier complet de la cible.** Signalez vos pistes (bouton sur l'avis ci-dessus) et échangez sur la traque ici.";
        if (t.full && typeof t.full === 'object') {
          await thread.send({ content: intro, embeds: [buildSignalementEmbed(t.full, t.cible, t.photo, t.createdBy)] }).catch(() => {});
        } else if (t.signalement) {
          await thread.send({ content: `${intro}\n\n**Signalement :**\n*${String(t.signalement).slice(0, 1500)}*` }).catch(() => {});
        } else {
          await thread.send({ content: intro }).catch(() => {});
        }
      }
    } catch {}
  }
  // Supprimer le signalement d'origine : le détail est dans le fil, et la photo est désormais dans l'avis
  if (stash && stash.signalMsgId && stash.signalChannelId) {
    try {
      const sch = await interaction.guild.channels.fetch(stash.signalChannelId).catch(() => null);
      if (sch && sch.messages) { const sm = await sch.messages.fetch(stash.signalMsgId).catch(() => null); if (sm) await sm.delete().catch(() => {}); }
    } catch {}
  }
  db.traques.push(t);
  // 🗺️ Lien carte : la dernière position connue de la cible est enregistrée sur la carte (Confrérie).
  if (t.position && t.position !== '—') {
    try {
      if (!db.carte) db.carte = {};
      if (!Array.isArray(db.carte.points)) db.carte.points = [];
      const pid = 'cw-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5);
      db.carte.points.push({
        id: pid, type: 'planque', niveau: 'membre',
        nom: `🎯 ${t.cible}`.slice(0, 80), region: 'Autre',
        lieu: String(t.position).slice(0, 200),
        notes: `Avis de recherche ${t.id} · prime ${t.prime} · ${dangerLabel(t.dangerosite)}`.slice(0, 500),
        avisId: t.id, parId: t.createdBy || null, parNom: t.createdBy || 'La Confrérie',
        createdAt: new Date().toISOString(),
      });
      t.cartePointId = pid;
    } catch {}
  }
  if (sid && db._signalements) delete db._signalements[sid];
  saveDB(db);
  // Relais inter-serveurs : recopie de l'affiche vers l'autre serveur (no-op si non configuré)
  try { await relais.relayer?.('avis', { content: `🎯 **Avis de recherche — ${t.cible}**`, embeds: [EmbedBuilder.from(posterEmbed)], files: photoBuf ? [{ buffer: photoBuf, name: 'wanted.png' }] : [], username: 'La Confrérie • Avis de recherche' }); } catch {}
  sauvegarderSurGitHub?.().catch(() => {}); // sauvegarde immédiate : l'avis survit à un redémarrage
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor(0xE67E22).setTitle(`🎯 Avis de recherche lancé — ${t.cible}`).setDescription(`Prime : **${t.prime}** · Dangerosité : ${dangerLabel(t.dangerosite)}\nLancé par ${t.createdBy}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});
  await interaction.editReply({ content: `✅ Avis de recherche **${t.id}** publié pour **${cible}**.` });
}

// ─── Piste : modal ───
async function handlePisteButton(interaction) {
  const id = interaction.customId.split('::')[1];
  const m = new ModalBuilder().setCustomId(`traque_piste_modal::${id}`).setTitle('🧭 Signaler une piste');
  m.addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('lieu').setLabel('Lieu (où la cible a été vue)').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : saloon de Tumbleweed')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('info').setLabel('Info / détails').setStyle(TextInputStyle.Paragraph).setRequired(true).setMaxLength(400).setPlaceholder('Ce que tu as vu, entendu, appris...')),
  );
  return interaction.showModal(m);
}
async function handlePisteModal(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  if (!Array.isArray(t.pistes)) t.pistes = [];
  const lieu = (interaction.fields.getTextInputValue('lieu') || '').trim();
  const info = interaction.fields.getTextInputValue('info').trim();
  t.pistes.push({ lieu, info, par: interaction.user.username, at: new Date().toISOString() });
  saveDB(db);
  await rafraichir(interaction.guild, t);
  // Alerte publique + ping Confrérie : une piste fraîche est tombée
  const alerte = new EmbedBuilder().setColor(0x3498DB).setTitle(`🧭 Nouvelle piste — ${t.cible}`)
    .setDescription(`${lieu ? `📍 **Lieu :** ${lieu}\n` : ''}🗒️ ${info}`)
    .setFooter({ text: `Signalée par ${interaction.user.username} • ${t.id}` }).setTimestamp();
  const dest = t.threadId ? (await interaction.guild.channels.fetch(t.threadId).catch(() => null)) : null;
  const cibleDest = dest || interaction.channel;
  if (cibleDest?.send) await cibleDest.send({ content: `<@&${ROLE_CONFRERIE}> — une piste vient d'être signalée sur **${t.cible}**.`, embeds: [alerte], allowedMentions: { roles: [ROLE_CONFRERIE] } }).catch(() => {});
  return interaction.reply({ content: '✅ Piste enregistrée. Merci, chasseur.', flags: MessageFlags.Ephemeral });
}

// ─── Rejoindre la traque ───
async function handleChasseurButton(interaction) {
  const id = interaction.customId.split('::')[1];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  if (!Array.isArray(t.chasseurs)) t.chasseurs = [];
  const dejaLa = t.chasseurs.includes(interaction.user.id);
  if (dejaLa) t.chasseurs = t.chasseurs.filter(x => x !== interaction.user.id);
  else t.chasseurs.push(interaction.user.id);
  saveDB(db);
  await rafraichir(interaction.guild, t);
  return interaction.reply({ content: dejaLa ? '↩️ Tu t\'es retiré de la traque.' : '🤠 Tu as rejoint la traque !', flags: MessageFlags.Ephemeral });
}

// ─── Clôture ───
async function handleCloturerButton(interaction) {
  if (!estResponsable(interaction.member)) return interaction.reply({ content: '❌ Seul un responsable peut clôturer un avis.', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  let id = interaction.customId.split('::')[1];
  // On résout l'avis ici (le bouton est sur l'avis → on a son message). Robuste aux ids périmés.
  let t = findTraque(db, id) || (db.traques || []).find(x => x.messageId === interaction.message?.id);
  if (!t) {
    // Avis orphelin (données perdues après un redémarrage) : on le reconstruit depuis le message
    if (!db.traques) db.traques = [];
    const titre = interaction.message?.embeds?.[0]?.title || '';
    const cible = (titre.split('—')[1] || titre.split(' - ')[1] || 'Cible inconnue').trim() || 'Cible inconnue';
    t = { id: id || ('AR-' + Date.now().toString().slice(-5)), cible, status: 'chasse', chasseurs: [], pistes: [], prime: '—', dangerosite: 'moyen', position: '—', vivantMort: 'Indifférent', commanditaire: '—', messageId: interaction.message?.id, channelId: interaction.channelId, createdAt: new Date().toISOString(), recupere: true };
    db.traques.push(t); saveDB(db); sauvegarderSurGitHub?.().catch(() => {});
  }
  id = t.id;
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder().setCustomId(`traque_cloture_select::${id}`).setPlaceholder('Résultat de la traque...').addOptions(
      { label: 'Capturée', value: 'capturee', emoji: '✅', description: 'Cible capturée vivante' },
      { label: 'Éliminée', value: 'eliminee', emoji: '💀', description: 'Cible éliminée' },
      { label: 'Abandonnée', value: 'abandonnee', emoji: '⚫', description: 'Traque abandonnée' },
    ),
  );
  return interaction.reply({ content: `Clôture de l'avis **${id}** — choisis le résultat :`, components: [row], flags: MessageFlags.Ephemeral });
}
async function handleClotureSelect(interaction) {
  const id = interaction.customId.split('::')[1];
  const choix = interaction.values[0];
  const db = loadDB();
  const t = findTraque(db, id);
  if (!t) return interaction.update({ content: '❌ Avis introuvable.', components: [] });
  t.status = choix;
  t.closedAt = new Date().toISOString();
  t.resultat = (STATUTS[choix] || {}).label || choix;
  const prime = choix === 'capturee' || choix === 'eliminee' ? t.prime : null;

  // 💰 Versement AUTOMATIQUE de la prime aux chasseurs (montant fixé à la création → divisé à parts égales)
  let versement = null;
  if ((choix === 'capturee' || choix === 'eliminee') && !t.primeVersee) {
    const montant = _montantPrime(t.prime);
    if (montant > 0 && (t.chasseurs || []).length) {
      const r = _crediterChasseurs(db, t.chasseurs, montant, `Prime — ${t.cible} (${t.id})`);
      if (r.part > 0) {
        t.primeVersee = r.total; t.primePart = r.part; versement = r;
        // Annonce dans le fil dossier
        if (t.threadId) {
          try { const th = await interaction.guild.channels.fetch(t.threadId).catch(() => null);
            if (th?.send) await th.send({ content: `💰 **Prime versée** : ${r.total.toLocaleString('fr-FR')} $ répartis entre ${r.n} chasseur(s) → **${r.part.toLocaleString('fr-FR')} $** chacun.\n${t.chasseurs.map(x => `<@${x}>`).join(' ')}`, allowedMentions: { users: t.chasseurs.slice(0, 25) } }).catch(() => {});
          } catch {}
        }
      }
    }
  }
  const primeJournalTxt = versement
    ? `\n💰 Prime **${versement.total.toLocaleString('fr-FR')} $** versée : **${versement.part.toLocaleString('fr-FR')} $** à chaque chasseur (portefeuille RP)`
    : (prime ? `\n💰 Prime : **${prime}** *(à verser manuellement)*` : '');

  // 1) Archivage de la fiche clôturée dans #élément-opérations (la traque fait partie d'une opération)
  const ops = elementOpsCh(interaction.guild);
  if (ops) {
    const sent = await postElementOps(ops, { embeds: [buildClosedFiche(t)] }, `🎯 ${t.cible} — ${t.resultat}`);
    if (sent) { t.opMessageId = sent.id; t.opChannelId = ops.id; if (sent.threadId) t.opThreadId = sent.threadId; }
  }
  // 2) Trace au journal
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor((STATUTS[choix] || {}).couleur || 0x555555).setTitle(`🎯 Avis clôturé — ${t.cible}`).setDescription(`Résultat : **${t.resultat}**${primeJournalTxt}\nChasseurs : ${(t.chasseurs || []).map(x => `<@${x}>`).join(', ') || '—'}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});

  // 3) Photo optionnelle : on laisse la possibilité de déposer une photo dans le fil du dossier
  //    (les modals Discord ne reçoivent pas de fichier). L'avis n'est retiré qu'ENSUITE — soit dès
  //    qu'une photo arrive, soit via le bouton « Terminer » — car supprimer l'avis supprime son fil.
  let invitePhoto = '';
  let components = [];
  if ((choix === 'capturee' || choix === 'eliminee') && t.threadId) {
    t.attentePhotoCloture = Date.now();
    invitePhoto = `\n📸 Photo **optionnelle** : glisse-la dans le fil <#${t.threadId}> dans l'heure — je l'ajoute à la fiche puis je retire l'avis.\n🗑️ Sinon, clique sur **Terminer** pour retirer l'avis tout de suite.`;
    components = [new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`traque_finir::${t.id}`).setLabel('Terminer (sans photo)').setEmoji('🗑️').setStyle(ButtonStyle.Secondary),
    )];
    await rafraichir(interaction.guild, t); // l'avis affiche « clôturée » en attendant
  } else {
    // Pas de photo attendue → on retire l'avis immédiatement
    await _retirerAvis(interaction.guild, t);
  }
  saveDB(db);
  sauvegarderSurGitHub?.().catch(() => {});
  const primeReply = versement ? ` 💰 Prime **${versement.total.toLocaleString('fr-FR')} $** versée automatiquement (${versement.part.toLocaleString('fr-FR')} $/chasseur).` : (prime ? ` 💰 Prime à verser : ${prime} (aucun chasseur inscrit ou montant non chiffré).` : '');
  return interaction.update({ content: `✅ Avis **${id}** clôturé : ${t.resultat}. Fiche archivée dans <#${CH_ELEMENT_OPS}>.${primeReply}${invitePhoto}`, components });
}
async function handleFinir(interaction) {
  if (!estResponsable(interaction.member)) return interaction.reply({ content: '❌ Réservé aux responsables.', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const t = findTraque(db, interaction.customId.split('::')[1]);
  if (!t) return interaction.update({ content: '✅ Déjà terminé.', components: [] }).catch(() => {});
  delete t.attentePhotoCloture;
  await _retirerAvis(interaction.guild, t);
  saveDB(db);
  sauvegarderSurGitHub?.().catch(() => {});
  return interaction.update({ content: '✅ Avis retiré de #wanted. Fiche conservée dans <#' + CH_ELEMENT_OPS + '>.', components: [] }).catch(() => {});
}

// ─── Lien avis de recherche ↔ opération (côté wanted) ───
function _addLink(t, op) {
  if (!t.linkedOps) t.linkedOps = [];
  if (!t.linkedOps.some(x => x.id === op.id)) t.linkedOps.push({ id: op.id, name: op.name });
  if (!op.linkedWanteds) op.linkedWanteds = [];
  if (!op.linkedWanteds.some(x => x.id === t.id)) op.linkedWanteds.push({ id: t.id, cible: t.cible });
}
async function handleLierOpButton(interaction) {
  if (!estResponsable(interaction.member)) return interaction.reply({ content: '❌ Réservé aux responsables.', flags: MessageFlags.Ephemeral });
  const db = loadDB();
  const t = findTraque(db, interaction.customId.split('::')[1]);
  if (!t) return interaction.reply({ content: '❌ Avis introuvable.', flags: MessageFlags.Ephemeral });
  const ops = (db.operations || []).filter(o => ['preparation', 'programmee', 'en_cours'].includes(o.status)).filter(o => !(t.linkedOps || []).some(x => x.id === o.id));
  if (!ops.length) return interaction.reply({ content: 'ℹ️ Aucune opération en cours à lier.', flags: MessageFlags.Ephemeral });
  const sel = new StringSelectMenuBuilder().setCustomId(`traque_lierop_sel::${t.id}`).setPlaceholder('Choisis l\'opération à lier…')
    .addOptions(ops.slice(0, 25).map(o => ({ label: `${o.name}`.slice(0, 100), value: o.id, description: `${o.lieu || '—'} · ${o.status}`.slice(0, 100) })));
  return interaction.reply({ content: `🔗 Lier une opération à l'avis **${t.cible}** :`, components: [new ActionRowBuilder().addComponents(sel)], flags: MessageFlags.Ephemeral });
}
async function handleLierOpSelect(interaction) {
  const wid = interaction.customId.split('::')[1];
  const opId = interaction.values[0];
  const db = loadDB();
  const t = findTraque(db, wid);
  const op = (db.operations || []).find(o => o.id === opId);
  if (!t || !op) return interaction.update({ content: '❌ Lien impossible (élément introuvable).', components: [] });
  _addLink(t, op);
  saveDB(db);
  sauvegarderSurGitHub?.().catch(() => {});
  try { await rafraichir(interaction.guild, t); } catch {}
  try { if (typeof global.refreshOp === 'function') await global.refreshOp(interaction.guild, opId); } catch {}
  return interaction.update({ content: `✅ Opération **${op.name}** liée à l'avis **${t.cible}**.`, components: [] });
}
// Exposé pour le rafraîchissement croisé (appelé depuis operations.js via global.refreshAvis)
async function refreshAvisById(guild, wantedId) {
  const t = findTraque(loadDB(), wantedId);
  if (t) await rafraichir(guild, t);
}

// ─── Liste des traques en cours ───
async function handleListe(interaction) {
  const db = loadDB();
  const dgr = interaction.options?.getString?.('dangerosite') || null;
  const tri = interaction.options?.getString?.('tri') || null;
  const lieuF = (interaction.options?.getString?.('lieu') || '').trim().toLowerCase();
  const dangerOrder = { extreme: 4, eleve: 3, moyen: 2, faible: 1 };
  let actifs = (db.traques || []).filter(t => ['chasse', 'reperee'].includes(t.status));
  if (dgr) actifs = actifs.filter(t => (t.dangerosite || 'moyen') === dgr);
  if (lieuF) actifs = actifs.filter(t => `${t.position || ''}`.toLowerCase().includes(lieuF));
  if (tri === 'prime') actifs.sort((a, b) => _montantPrime(b.prime) - _montantPrime(a.prime));
  else if (tri === 'danger') actifs.sort((a, b) => (dangerOrder[b.dangerosite] || 0) - (dangerOrder[a.dangerosite] || 0));
  else if (tri === 'recent') actifs.sort((a, b) => new Date(b.createdAt || 0) - new Date(a.createdAt || 0));
  const filtres = [dgr && `dangerosité ${dangerLabel(dgr)}`, lieuF && `lieu « ${lieuF} »`, tri && `tri ${tri}`].filter(Boolean).join(' · ');
  const e = new EmbedBuilder().setColor(0xE67E22).setTitle('🎯 Avis de recherche en cours').setFooter({ text: `IWC • ${actifs.length} traque(s)${filtres ? ' · filtré' : ''}` });
  let desc = filtres ? `*Filtres — ${filtres}*\n\n` : '';
  if (!actifs.length) desc += '*Aucun avis ne correspond.*';
  else desc += actifs.slice(0, 20).map(t => {
    const st = STATUTS[t.status] || STATUTS.chasse;
    return `${st.label} \`${t.id}\` — **${t.cible}** · ⚠️ ${dangerLabel(t.dangerosite)} · 📍 ${t.position} · 💰 ${t.prime} · 🤠 ${(t.chasseurs || []).length}`;
  }).join('\n');
  e.setDescription(desc.slice(0, 4000));
  return interaction.reply({ embeds: [e], flags: MessageFlags.Ephemeral });
}

// ─── Signalement par photo : commande + bouton ───
async function handleSignalement(interaction) {
  const photo = interaction.options.getAttachment('photo');
  const cible = (interaction.options.getString('cible') || '').trim();
  if (!photo || !((photo.contentType || '').startsWith('image'))) { await interaction.reply({ content: "❌ Joins une **image** (capture de la personne en jeu).", flags: MessageFlags.Ephemeral }); return; }
  await interaction.deferReply();
  const buf = await _imageBytes(photo.url);
  if (!buf) { await interaction.editReply({ content: "❌ Impossible de lire l'image. Réessaie." }); return; }
  const s = await _analyserSignalement(buf.toString('base64'), photo.contentType || 'image/png', cible);
  if (!s) { await interaction.editReply({ content: "❌ Je n'ai pas réussi à établir un signalement. Essaie une capture plus nette, où on voit bien la personne." }); return; }
  const db = loadDB();
  if (!db._signalements) db._signalements = {};
  for (const k of Object.keys(db._signalements)) { if (Date.now() - (db._signalements[k].at || 0) > 7200000) delete db._signalements[k]; }
  const sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(-8);
  db._signalements[sid] = { cible, full: s, signalement: _signalementTexte(s), dangerosite: (DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite)), photoUrl: photo.url, createdBy: interaction.user.username, at: Date.now() };
  saveDB(db);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_from_signal::${sid}`).setLabel("Créer l'avis de recherche").setEmoji('📌').setStyle(ButtonStyle.Danger),
  );
  const sentSig = await interaction.editReply({ embeds: [buildSignalementEmbed(s, cible, photo.url, interaction.user.username)], components: [row] }).catch(() => null);
  if (sentSig && db._signalements[sid]) { db._signalements[sid].signalMsgId = sentSig.id; db._signalements[sid].signalChannelId = interaction.channelId; saveDB(db); }
}
async function handleFromSignal(interaction) {
  const sid = interaction.customId.split('::')[1];
  const stash = (loadDB()._signalements || {})[sid];
  if (!stash) { await interaction.reply({ content: "⏱️ Ce signalement a expiré. Relance /signalement avec la photo.", flags: MessageFlags.Ephemeral }); return; }
  await interaction.showModal(modalCreation({ cible: stash.cible, signalement: stash.signalement }, sid));
}

// ─── Panneau #wanted + dépôt de photo ───
function buildWantedPanel() {
  return new EmbedBuilder()
    .setColor(0x8B5A2B)
    .setTitle('🤠 AVIS DE RECHERCHE & SIGNALEMENTS')
    .setDescription([
      'Le tableau des recherches de la compagnie — tout se passe ici 👇',
      '',
      '📸 **Signalement par photo**',
      "Dépose simplement une **photo** de la personne dans ce salon (ajoute son nom en légende si tu veux). J'établis aussitôt un **signalement détaillé** : tenue et couleurs, chapeau, armes, signes distinctifs, dangerosité estimée…",
      'Un bouton te permet ensuite de le transformer en **avis de recherche** en un clic.',
      '',
      '🎯 **Avis de recherche**',
      'Clique sur le bouton ci-dessous pour lancer un avis classique (prime, dangerosité, dernière position connue, vivant/mort…).',
    ].join('\n'))
    .setFooter({ text: 'Iron Wolf Company • État du Texas' });
}
function buildWantedButtons() {
  return [new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('wanted_avis').setLabel('Lancer un avis de recherche').setEmoji('🎯').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('wanted_list').setLabel('Voir les avis en cours').setEmoji('📋').setStyle(ButtonStyle.Secondary),
  )];
}
function _findWantedChannel(guild) {
  return guild.channels.cache.find(c => (c.type === 0 || c.type === 5) && /wanted|avis.?recherche/i.test(c.name || '')) || null;
}
async function ensureWantedPanel(guild) {
  try {
    const db = loadDB();
    let ch = null;
    if (db.wantedChannelId) ch = await guild.channels.fetch(db.wantedChannelId).catch(() => null);
    if (!ch) ch = _findWantedChannel(guild);
    if (!ch) return;
    if (db.wantedPanel && db.wantedPanel.messageId && db.wantedPanel.channelId === ch.id) {
      const existing = await ch.messages.fetch(db.wantedPanel.messageId).catch(() => null);
      if (existing) { if (db.wantedChannelId !== ch.id) { db.wantedChannelId = ch.id; saveDB(db); } return; }
    }
    const sent = await ch.send({ embeds: [buildWantedPanel()], components: buildWantedButtons() }).catch(() => null);
    if (!sent) return;
    sent.pin().catch(() => {});
    const db2 = loadDB();
    db2.wantedChannelId = ch.id;
    db2.wantedPanel = { channelId: ch.id, messageId: sent.id };
    saveDB(db2);
  } catch {}
}
// Traite UNE photo → un signalement complet (récap réuploadé + ping Confrérie + stash pour créer l'avis)
async function _traiterPhotoWanted(message, img, cible, idx, total) {
  const suffixe = total > 1 ? ` (${idx}/${total})` : '';
  const wait = await message.channel.send({ content: `📋 J'établis le signalement${suffixe} à partir de la photo…`, allowedMentions: { parse: [] } }).catch(() => null);
  const buf = await _imageBytes(img.url);
  const s = buf ? await _analyserSignalement(buf.toString('base64'), img.contentType || 'image/png', cible) : null;
  if (!s) { if (wait) await wait.edit({ content: `❌ Photo${suffixe} illisible pour un signalement — essaie une capture plus nette, où on voit bien la personne.` }).catch(() => {}); return false; }
  const db2 = loadDB();
  if (!db2._signalements) db2._signalements = {};
  for (const k of Object.keys(db2._signalements)) { if (Date.now() - (db2._signalements[k].at || 0) > 7200000) delete db2._signalements[k]; }
  const sid = (Date.now().toString(36) + idx + Math.random().toString(36).slice(2, 4)).slice(-8);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_from_signal::${sid}`).setLabel("Créer l'avis de recherche").setEmoji('📌').setStyle(ButtonStyle.Danger),
  );
  // On réuploade la photo dans le récap pour qu'elle survive à la suppression du message d'origine
  const fileName = 'signalement.png';
  const att = new AttachmentBuilder(buf, { name: fileName });
  const payload = { content: `<@&${ROLE_CONFRERIE}> — 📋 **Signalement repéré${suffixe}.** Avis à la Confrérie.`, embeds: [buildSignalementEmbed(s, cible, `attachment://${fileName}`, message.author.username)], components: [row], files: [att], allowedMentions: { roles: [ROLE_CONFRERIE] } };
  const recapMsg = await message.channel.send(payload).catch(() => null); // nouveau message (l'édition ne pingue pas) → le ping Confrérie fonctionne
  if (recapMsg && wait) await wait.delete().catch(() => {}); // on retire le message d'attente une fois le récap publié
  const photoUrl = (recapMsg && [...recapMsg.attachments.values()][0]?.url) || img.url;
  db2._signalements[sid] = { cible, full: s, signalement: _signalementTexte(s), dangerosite: (DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite)), photoUrl, createdBy: message.author.username, at: Date.now(), signalMsgId: recapMsg?.id, signalChannelId: message.channel.id };
  saveDB(db2);
  return true;
}
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    const db = loadDB();
    // ── Photo de clôture déposée dans le fil d'un dossier (après "Capturée"/"Éliminée") ──
    const imgsThread = message.attachments ? [...message.attachments.values()].filter(a => (a.contentType || '').startsWith('image')) : [];
    if (imgsThread.length && message.channel?.isThread?.()) {
      const tt = (db.traques || []).find(x => x.threadId === message.channel.id && x.attentePhotoCloture);
      if (tt && (Date.now() - tt.attentePhotoCloture < 3600000)) {
        // On réuploade la photo dans la fiche archivée pour qu'elle survive à la suppression du fil
        const buf = await _imageBytes(imgsThread[0].url);
        let files;
        if (buf) { files = [new AttachmentBuilder(buf, { name: 'capture-cloture.png' })]; tt.photoCapture = 'attachment://capture-cloture.png'; }
        else { tt.photoCapture = imgsThread[0].url; }
        delete tt.attentePhotoCloture;
        const edited = await rafraichirCloture(message.guild, tt, files);
        const persistUrl = edited ? ([...edited.attachments.values()][0]?.url || null) : null;
        if (persistUrl) tt.photoCapture = persistUrl;
        const jc = journalCh(message.guild);
        if (jc) {
          const jFiles = buf ? [new AttachmentBuilder(buf, { name: 'preuve.png' })] : undefined;
          const jEmbed = new EmbedBuilder().setColor(0x57F287).setTitle(`📸 Preuve de clôture — ${tt.cible}`).setDescription(`Résultat : **${tt.resultat || '—'}**`).setFooter({ text: `IWC • ${tt.id}` }).setTimestamp();
          jEmbed.setImage(buf ? 'attachment://preuve.png' : (persistUrl || imgsThread[0].url));
          await jc.send(jFiles ? { embeds: [jEmbed], files: jFiles } : { embeds: [jEmbed] }).catch(() => {});
        }
        await message.react('✅').catch(() => {});
        // Photo enregistrée → on retire l'avis de recherche initial (et son fil)
        await _retirerAvis(message.guild, tt);
        saveDB(db);
        sauvegarderSurGitHub?.().catch(() => {});
        return true;
      }
    }
    const wid = db.wantedChannelId;
    const isWanted = (wid && message.channel.id === wid) || /wanted|avis.?recherche/i.test(message.channel?.name || '');
    if (!isWanted) return false;
    // Toutes les images du message : chacune donne un signalement / avis distinct
    const imgs = message.attachments ? [...message.attachments.values()].filter(a => (a.contentType || '').startsWith('image')) : [];
    if (!imgs.length) return false;
    const cible = (message.content || '').trim().slice(0, 80);
    let okCount = 0;
    for (let i = 0; i < imgs.length; i++) {
      const done = await _traiterPhotoWanted(message, imgs[i], cible, i + 1, imgs.length);
      if (done) okCount++;
    }
    // Supprimer le message photo d'origine (les photos restent dans les récaps réuploadés)
    if (okCount > 0) await message.delete().catch(() => {});
    return true;
  } catch { return false; }
}

// ─── Routage ───
async function routeInteraction(interaction) {
  if (interaction.isChatInputCommand?.()) {
    if (interaction.commandName === 'avis-recherche') {
      await interaction.showModal(modalCreation());
      return true;
    }
    if (interaction.commandName === 'traques') { await handleListe(interaction); return true; }
    if (interaction.commandName === 'signalement') { await handleSignalement(interaction); return true; }
  }
  if (interaction.isButton?.()) {
    const cid = interaction.customId || '';
    if (cid.startsWith('traque_piste::'))     { await handlePisteButton(interaction); return true; }
    if (cid.startsWith('traque_chasseur::'))  { await handleChasseurButton(interaction); return true; }
    if (cid.startsWith('traque_cloturer::'))  { await handleCloturerButton(interaction); return true; }
    if (cid.startsWith('traque_finir::'))     { await handleFinir(interaction); return true; }
    if (cid.startsWith('traque_lierop::'))    { await handleLierOpButton(interaction); return true; }
    if (cid.startsWith('traque_from_signal::')) { await handleFromSignal(interaction); return true; }
    if (cid === 'wanted_avis') { await interaction.showModal(modalCreation()); return true; }
    if (cid === 'wanted_list') { await handleListe(interaction); return true; }
    if (cid.startsWith('traque_noop::'))      { await interaction.deferUpdate().catch(() => {}); return true; }
  }
  if (interaction.isStringSelectMenu?.() && (interaction.customId || '').startsWith('traque_cloture_select::')) { await handleClotureSelect(interaction); return true; }
  if (interaction.isStringSelectMenu?.() && (interaction.customId || '').startsWith('traque_lierop_sel::')) { await handleLierOpSelect(interaction); return true; }
  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'traque_create_modal' || (interaction.customId || '').startsWith('traque_create_modal::')) { await handleCreateModal(interaction); return true; }
    if ((interaction.customId || '').startsWith('traque_piste_modal::')) { await handlePisteModal(interaction); return true; }
  }
  return false;
}

// ─── Relance automatique des avis dormants (non résolus depuis X jours) ───
const RELANCE_JOURS = 3;
async function verifierDormants(client) {
  try {
    const db = loadDB();
    const now = Date.now();
    const seuilMs = RELANCE_JOURS * 24 * 3600 * 1000;
    const dormants = (db.traques || [])
      .filter(t => ['chasse', 'reperee'].includes(t.status))
      .filter(t => { const ref = new Date(t.lastRelance || t.createdAt || 0).getTime(); return ref && (now - ref) >= seuilMs; });
    if (!dormants.length) return;
    for (const g of client.guilds.cache.values()) {
      let ch = db.wantedChannelId ? await g.channels.fetch(db.wantedChannelId).catch(() => null) : null;
      if (!ch) ch = _findWantedChannel(g);
      if (!ch?.send) continue;
      for (const t of dormants) {
        const jours = Math.floor((now - new Date(t.createdAt || now).getTime()) / 86400000);
        const lien = (t.messageId && t.channelId) ? `https://discord.com/channels/${g.id}/${t.channelId}/${t.messageId}` : '';
        const e = new EmbedBuilder().setColor(0xE67E22).setTitle(`⏰ Avis toujours ouvert — ${t.cible}`)
          .setDescription(`Ouvert depuis **${jours} jour(s)**, toujours pas résolu.\n💰 Prime : **${t.prime}** · ⚠️ ${dangerLabel(t.dangerosite)} · 📍 ${t.position || '—'}\n🤠 Chasseurs : ${(t.chasseurs || []).map(x => `<@${x}>`).join(', ') || '*aucun*'}`)
          .setFooter({ text: `IWC • ${t.id} • relance automatique` });
        if (t.photo) e.setThumbnail(t.photo);
        await ch.send({ content: `<@&${ROLE_CONFRERIE}> — ⏰ **Un avis de recherche attend toujours preneur.** ${lien}`, embeds: [e], allowedMentions: { roles: [ROLE_CONFRERIE] } }).catch(() => {});
        t.lastRelance = new Date().toISOString();
        await new Promise(r => setTimeout(r, 500));
      }
      break; // le salon wanted n'existe que dans un seul serveur
    }
    saveDB(db); sauvegarderSurGitHub?.().catch(() => {});
  } catch (e) { console.log('❌ traque verifierDormants:', e.message); }
}

// Restauration : reposte les avis de recherche OUVERTS sauvegardes en base
// (utile si les messages du salon wanted ont disparu). Renvoie le nombre reposte.
async function restaurerAvis(guild) {
  const db = loadDB();
  const ouverts = (db.traques || []).filter(t => ['chasse', 'reperee'].includes(String(t.status || '').toLowerCase()));
  if (!ouverts.length) return 0;
  let targetCh = null;
  if (db.wantedChannelId) targetCh = await guild.channels.fetch(db.wantedChannelId).catch(() => null);
  if (!targetCh || !targetCh.send) targetCh = _findWantedChannel(guild);
  if (!targetCh || !targetCh.send) return 0;
  let n = 0;
  for (const t of ouverts) {
    // Si l'affiche existe encore, on ne la double pas.
    if (t.messageId) { const ex = await targetCh.messages.fetch(t.messageId).catch(() => null); if (ex) continue; }
    const embed = buildPoster(t);
    const payload = { embeds: [embed], components: buildBoutons(t), allowedMentions: { parse: [] } };
    if (t.photo) { try { const buf = await _imageBytes(t.photo); if (buf) { embed.setThumbnail('attachment://wanted.png'); payload.files = [new AttachmentBuilder(buf, { name: 'wanted.png' })]; } } catch {} }
    const sent = await targetCh.send(payload).catch(() => null);
    if (sent) { t.messageId = sent.id; t.channelId = targetCh.id; n++; }
    await new Promise(r => setTimeout(r, 400)); // anti rate-limit
  }
  saveDB(db); sauvegarderSurGitHub?.().catch(() => {});
  return n;
}

module.exports = { traqueCommands, routeInteraction, onMessage, ensureWantedPanel, refreshAvisById, ouvrirModalAvis, verifierDormants, restaurerAvis };
