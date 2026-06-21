// ═══════════════════════════════════════════════════════════════
// traque.js — Avis de recherche / chasse à l'homme (mercenaires IWC)
// Créer une cible, signaler des pistes, rejoindre la traque comme
// chasseur, clôturer (capturée / éliminée / abandonnée) + prime.
// Branchement index.js : require + traqueCommands + routeInteraction.
// ═══════════════════════════════════════════════════════════════
const {
  EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, SlashCommandBuilder, MessageFlags, AttachmentBuilder,
} = require('discord.js');
const { loadDB, saveDB } = require('./db');

const CH_JOURNAL = '1508756535407542372';
const ROLE_CONFRERIE = '1508756479274913903';
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
  new SlashCommandBuilder().setName('traques').setDescription('🎯 Voir les avis de recherche en cours'),
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
function fmtDate(d) { if (!d) return '—'; const dt = new Date(d); return isNaN(dt.getTime()) ? String(d) : dt.toLocaleDateString('fr-FR'); }
function findTraque(db, id) { return (db.traques || []).find(t => t.id === id); }
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
{"allure":"sexe apparent, corpulence, carrure, taille estimée, posture/attitude","teint":"carnation de la peau si visible, sinon Non visible","cheveux":"couleur précise, longueur, coiffure, sinon Non visible","pilosite":"barbe/moustache/favoris : type, couleur, longueur, sinon Rasé ou Non visible","visage":"forme du visage, traits marquants, regard/yeux, âge apparent, rides, sinon Non visible","chapeau":"couvre-chef : type précis, couleur, état, bandeau/ornement, sinon Non visible","haut":"vêtements du haut en couches (manteau, veste, gilet, chemise) avec couleurs précises, matières et état","bas":"pantalon/jambières : couleur, matière, état, sinon Non visible","chaussures":"bottes/souliers : couleur, type, éperons, sinon Non visible","accessoires":"bandana/foulard, gants, ceinture, cartouchière, sacoche, bijoux, badge, lunettes, cigare, montre... sinon Aucun visible","armes":"armes visibles : type précis (revolver, carabine, fusil à canon scié, couteau, lasso...) et où elles sont portées (holster, dos, ceinture), sinon Aucune visible","marques":"cicatrices, tatouages, blessures, peintures de guerre, masque, marques distinctives, sinon Aucune visible","monture":"cheval si visible : robe/couleur, marques, selle/équipement, sinon Non visible","environnement":"décor visible, lieu probable, moment de la journée, sinon Non visible","dangerosite":"faible|moyen|eleve|extreme","resume":"une phrase percutante de synthèse, façon avis de recherche du Far West"}
Écris en français, de façon factuelle, riche et précise.`;

async function _imageBytes(url) {
  try { const r = await fetch(url); if (!r.ok) return null; return Buffer.from(await r.arrayBuffer()); } catch { return null; }
}
async function _callVisionSignal(model, b64, mt) {
  const apiKey = process.env.ANTHROPIC_API_KEY; if (!apiKey) return null;
  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model, max_tokens: 1600, messages: [{ role: 'user', content: [
        { type: 'image', source: { type: 'base64', media_type: mt || 'image/png', data: b64 } },
        { type: 'text', text: PROMPT_SIGNALEMENT },
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
async function _analyserSignalement(b64, mt) {
  let txt = await _callVisionSignal('claude-sonnet-4-6', b64, mt);
  if (!txt) txt = await _callVisionSignal('claude-haiku-4-5-20251001', b64, mt);
  return _parseSignal(txt);
}
function _signalementTexte(s) {
  const ok = v => v && !/^(non visible|aucune? visible|aucun visible|rasé|néant)$/i.test(String(v).trim());
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
  let txt = parts.join('. ');
  if (!txt) txt = String(s.resume || "Signalement établi d'après la photo.");
  return txt.slice(0, 700);
}
function buildSignalementEmbed(s, cible, photoUrl, auteur) {
  const dKey = DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite);
  const ok = v => v && !/^(non visible|aucune? visible|aucun visible|rasé|néant)$/i.test(String(v).trim());
  const f = (n, v, inline) => ({ name: n, value: (ok(v) ? String(v) : 'Non visible').slice(0, 1024), inline: !!inline });
  const e = new EmbedBuilder()
    .setColor(0x8B5A2B)
    .setTitle(`📋 SIGNALEMENT${cible ? ' — ' + cible : ''}`)
    .setDescription(s.resume ? `*${String(s.resume).slice(0, 400)}*` : "*Signalement établi d'après la photo.*");
  const fields = [f('🧍 Allure', s.allure, false)];
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
  if (ok(s.monture)) fields.push(f('🐴 Monture', s.monture, false));
  if (ok(s.environnement)) fields.push(f('🌅 Repéré', s.environnement, true));
  fields.push({ name: '⚠️ Dangerosité estimée', value: dangerLabel(dKey), inline: true });
  e.addFields(...fields.slice(0, 25));
  if (photoUrl) e.setThumbnail(photoUrl);
  e.setFooter({ text: `IWC • Signalement établi par ${auteur} • généré par l'IA d'après la photo` });
  return e;
}

// ─── Affichage de l'avis (poster) ───
function buildPoster(t) {
  const st = STATUTS[t.status] || STATUTS.chasse;
  const closed = ['capturee', 'eliminee', 'abandonnee'].includes(t.status);
  const chasseurs = (t.chasseurs || []).length ? t.chasseurs.map(id => `<@${id}>`).join(', ') : '*Aucun chasseur assigné*';
  const pistes = (t.pistes || []).slice(-5).reverse();
  const pistesTxt = pistes.length
    ? pistes.map(p => `• ${fmtDate(p.at)} — ${p.lieu ? `📍 **${p.lieu}** · ` : ''}${p.info || ''}${p.par ? ` _(${p.par})_` : ''}`).join('\n').slice(0, 1024)
    : '*Aucune piste signalée.*';
  const e = new EmbedBuilder()
    .setColor(st.couleur)
    .setTitle(`🎯 AVIS DE RECHERCHE — ${t.cible}`)
    .setDescription(t.signalement ? `*${String(t.signalement).slice(0, 500)}*` : '*Pas de signalement.*')
    .addFields(
      { name: '📍 Dernière position', value: t.position || '—', inline: true },
      { name: '⚠️ Dangerosité', value: dangerLabel(t.dangerosite), inline: true },
      { name: '💰 Prime', value: t.prime || '—', inline: true },
      { name: '👤 Commanditaire', value: t.commanditaire || '—', inline: true },
      { name: '🎯 Consigne', value: t.vivantMort || 'Indifférent', inline: true },
      { name: '📌 Statut', value: st.label, inline: true },
      { name: '🤠 Chasseurs', value: chasseurs, inline: false },
      { name: `🧭 Pistes (${(t.pistes || []).length})`, value: pistesTxt, inline: false },
    )
    .setFooter({ text: `IWC • Avis ${t.id}${closed && t.resultat ? ' • ' + t.resultat : ''}` });
  if (t.photo) e.setThumbnail(t.photo);
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
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('position').setLabel('Dernière position connue').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Armadillo, Tumbleweed, Fort Mercer, Rio Bravo...')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('prime').setLabel('Prime + dangerosité').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : 500 $ · élevé  (faible/moyen/élevé/extrême)')),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('infos').setLabel('Commanditaire + vivant/mort').setStyle(TextInputStyle.Short).setRequired(false).setPlaceholder('Ex : Shérif de Armadillo · Vivant de préférence')),
  );
  return m;
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
    position: (interaction.fields.getTextInputValue('position') || '').trim() || '—',
    prime, dangerosite, commanditaire, vivantMort,
    status: 'chasse',
    chasseurs: [], pistes: [],
    createdAt: new Date().toISOString(),
    createdBy: interaction.user.username,
    channelId: interaction.channelId,
  };
  if (stash && stash.photoUrl) t.photo = stash.photoUrl;
  const sent = await interaction.channel.send({ content: `<@&${ROLE_CONFRERIE}> — 🎯 **Nouvel avis de recherche.** La traque est ouverte.`, embeds: [buildPoster(t)], components: buildBoutons(t), allowedMentions: { roles: [ROLE_CONFRERIE] } }).catch(() => null);
  if (sent) t.messageId = sent.id;
  db.traques.push(t);
  if (sid && db._signalements) delete db._signalements[sid];
  saveDB(db);
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
  if (interaction.channel?.send) await interaction.channel.send({ content: `<@&${ROLE_CONFRERIE}> — une piste vient d'être signalée sur **${t.cible}**.`, embeds: [alerte], allowedMentions: { roles: [ROLE_CONFRERIE] } }).catch(() => {});
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
  const id = interaction.customId.split('::')[1];
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
  saveDB(db);
  await rafraichir(interaction.guild, t);
  const jc = journalCh(interaction.guild);
  if (jc) await jc.send({ embeds: [new EmbedBuilder().setColor((STATUTS[choix] || {}).couleur || 0x555555).setTitle(`🎯 Avis clôturé — ${t.cible}`).setDescription(`Résultat : **${t.resultat}**${prime ? `\n💰 Prime à verser : **${prime}**` : ''}\nChasseurs : ${(t.chasseurs || []).map(x => `<@${x}>`).join(', ') || '—'}`).setFooter({ text: `IWC • ${t.id}` }).setTimestamp()] }).catch(() => {});
  return interaction.update({ content: `✅ Avis **${id}** clôturé : ${t.resultat}.${prime ? ` Pense à verser la prime (${prime}) aux chasseurs via ton système d'économie.` : ''}`, components: [] });
}

// ─── Liste des traques en cours ───
async function handleListe(interaction) {
  const db = loadDB();
  const actifs = (db.traques || []).filter(t => ['chasse', 'reperee'].includes(t.status));
  const e = new EmbedBuilder().setColor(0xE67E22).setTitle('🎯 Avis de recherche en cours').setFooter({ text: `IWC • ${actifs.length} traque(s) active(s)` });
  if (!actifs.length) e.setDescription('*Aucune traque en cours.*');
  else e.setDescription(actifs.slice(0, 20).map(t => {
    const st = STATUTS[t.status] || STATUTS.chasse;
    return `${st.label} \`${t.id}\` — **${t.cible}** · 📍 ${t.position} · 💰 ${t.prime} · 🤠 ${(t.chasseurs || []).length}`;
  }).join('\n').slice(0, 4000));
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
  const s = await _analyserSignalement(buf.toString('base64'), photo.contentType || 'image/png');
  if (!s) { await interaction.editReply({ content: "❌ Je n'ai pas réussi à établir un signalement. Essaie une capture plus nette, où on voit bien la personne." }); return; }
  const db = loadDB();
  if (!db._signalements) db._signalements = {};
  for (const k of Object.keys(db._signalements)) { if (Date.now() - (db._signalements[k].at || 0) > 7200000) delete db._signalements[k]; }
  const sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(-8);
  db._signalements[sid] = { cible, signalement: _signalementTexte(s), dangerosite: (DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite)), photoUrl: photo.url, createdBy: interaction.user.username, at: Date.now() };
  saveDB(db);
  const row = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`traque_from_signal::${sid}`).setLabel("Créer l'avis de recherche").setEmoji('📌').setStyle(ButtonStyle.Danger),
  );
  await interaction.editReply({ embeds: [buildSignalementEmbed(s, cible, photo.url, interaction.user.username)], components: [row] });
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
    .setFooter({ text: 'Iron Wolf Company • New Austin' });
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
async function onMessage(message) {
  try {
    if (!message.guild || message.author?.bot) return false;
    const db = loadDB();
    const wid = db.wantedChannelId;
    const isWanted = (wid && message.channel.id === wid) || /wanted|avis.?recherche/i.test(message.channel?.name || '');
    if (!isWanted) return false;
    const img = message.attachments ? [...message.attachments.values()].find(a => (a.contentType || '').startsWith('image')) : null;
    if (!img) return false;
    const cible = (message.content || '').trim().slice(0, 80);
    const wait = await message.channel.send({ content: "📋 J'établis le signalement à partir de la photo…", allowedMentions: { parse: [] } }).catch(() => null);
    const buf = await _imageBytes(img.url);
    const s = buf ? await _analyserSignalement(buf.toString('base64'), img.contentType || 'image/png') : null;
    if (!s) { if (wait) await wait.edit({ content: "❌ Je n'ai pas réussi à lire cette photo pour un signalement. Essaie une capture plus nette, où on voit bien la personne." }).catch(() => {}); return true; }
    const db2 = loadDB();
    if (!db2._signalements) db2._signalements = {};
    for (const k of Object.keys(db2._signalements)) { if (Date.now() - (db2._signalements[k].at || 0) > 7200000) delete db2._signalements[k]; }
    const sid = (Date.now().toString(36) + Math.random().toString(36).slice(2, 5)).slice(-8);
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`traque_from_signal::${sid}`).setLabel("Créer l'avis de recherche").setEmoji('📌').setStyle(ButtonStyle.Danger),
    );
    // On réuploade la photo dans le récap pour qu'elle survive à la suppression du message d'origine
    const fileName = 'signalement.png';
    const att = new AttachmentBuilder(buf, { name: fileName });
    const payload = { content: `<@&${ROLE_CONFRERIE}> — 📋 **Signalement repéré.** Avis à la Confrérie.`, embeds: [buildSignalementEmbed(s, cible, `attachment://${fileName}`, message.author.username)], components: [row], files: [att], allowedMentions: { roles: [ROLE_CONFRERIE] } };
    const recapMsg = await message.channel.send(payload).catch(() => null); // nouveau message (l'édition ne pingue pas) → le ping Confrérie fonctionne
    if (recapMsg && wait) await wait.delete().catch(() => {}); // on retire le message d'attente une fois le récap publié
    const photoUrl = (recapMsg && [...recapMsg.attachments.values()][0]?.url) || img.url;
    db2._signalements[sid] = { cible, signalement: _signalementTexte(s), dangerosite: (DANGER[s.dangerosite] ? s.dangerosite : parseDanger(s.dangerosite)), photoUrl, createdBy: message.author.username, at: Date.now() };
    saveDB(db2);
    // Supprimer le message photo d'origine (la photo reste dans le récap réuploadé)
    await message.delete().catch(() => {});
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
    if (cid.startsWith('traque_from_signal::')) { await handleFromSignal(interaction); return true; }
    if (cid === 'wanted_avis') { await interaction.showModal(modalCreation()); return true; }
    if (cid === 'wanted_list') { await handleListe(interaction); return true; }
    if (cid.startsWith('traque_noop::'))      { await interaction.deferUpdate().catch(() => {}); return true; }
  }
  if (interaction.isStringSelectMenu?.() && (interaction.customId || '').startsWith('traque_cloture_select::')) { await handleClotureSelect(interaction); return true; }
  if (interaction.isModalSubmit?.()) {
    if (interaction.customId === 'traque_create_modal' || (interaction.customId || '').startsWith('traque_create_modal::')) { await handleCreateModal(interaction); return true; }
    if ((interaction.customId || '').startsWith('traque_piste_modal::')) { await handlePisteModal(interaction); return true; }
  }
  return false;
}

module.exports = { traqueCommands, routeInteraction, onMessage, ensureWantedPanel };
