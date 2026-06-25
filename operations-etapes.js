// ───────────────────────────────────────────────────────────────────────────
//  operations-etapes.js — Préparation d'opération PAR ÉTAPES (IWC / Confrérie)
//  ----------------------------------------------------------------------------
//  Déclenché AUTOMATIQUEMENT quand la Direction VALIDE un contrat Confrérie :
//  une « opération » catégorisée d'après le type de mission du contrat est
//  ouverte dans #operations, sous forme d'un fil dédié contenant un panneau
//  d'étapes à préparer puis valider une par une :
//      1. 🔍 Repérage      2. 🗺️ Plan d'approche   3. 👥 Constitution d'équipe
//      4. 🎯 Exécution     5. 💰 Bilan & prime
//
//  Chaque étape porte des champs (formulaire) + des photos (collectées dans le
//  fil) et un bouton « ✅ Valider l'étape » (Direction). Les étapes se
//  déverrouillent dans l'ordre. Quand tout est validé, un DOSSIER D'OPÉRATION
//  est généré : un fichier .md téléchargeable + un récapitulatif.
//
//  Identifiants ISOLÉS : « opx_* »  →  aucune collision avec op_* / opnew_*.
//  Stockage ISOLÉ : db.preparations  →  ne touche pas db.operations.
//  Notion/journal/pole sont INJECTÉS par index.js via init() (facultatif).
// ───────────────────────────────────────────────────────────────────────────
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags, AttachmentBuilder,
} = require('discord.js');

let dbMod = {};
try { dbMod = require('./db'); } catch { dbMod = {}; }
const loadDB = dbMod.loadDB || (() => ({}));
const saveDB = dbMod.saveDB || (() => {});
const backupGit = (typeof dbMod.sauvegarderSurGitHub === 'function') ? dbMod.sauvegarderSurGitHub : null;
function _persist(db) { try { saveDB(db); } catch {} try { if (backupGit) backupGit(); } catch {} }

const SALON_OPERATIONS = '1518349707686973470';
const ROLE_LEGAL = '1508756436082102303';
const ROLE_ILLEGAL = '1508898841993281658';
const DIRECTION_ROLE_NAMES = ['Concepteur', 'Fléau', 'fleau', 'Fondateur', 'Directeur', 'Conseil', 'Officier'];
const COL = { or: 0xC8A45C, bleu: 0x3B82F6, rouge: 0x8B1A1A, vert: 0x2ECC71, gris: 0x555555 };

let _inj = {};
function init(opts) { _inj = opts || {}; }

function isDirection(member) {
  try { return !!member?.roles?.cache?.some(r => DIRECTION_ROLE_NAMES.some(n => r.name.includes(n))); } catch { return false; }
}
function _poleRoleId(guild, pole) {
  if (typeof _inj.poleRoleId === 'function') { try { return _inj.poleRoleId(guild, pole); } catch {} }
  return pole === 'legal' ? ROLE_LEGAL : ROLE_ILLEGAL;
}
function _salonOps(guild) {
  return guild.channels.cache.get(SALON_OPERATIONS)
    || guild.channels.cache.find(c => /op[eé]rations?/i.test(c.name || ''))
    || null;
}
function _clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
function _fmtDate(iso) {
  try { return new Date(iso).toLocaleString('fr-FR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }); }
  catch { return '—'; }
}

// ── Catégorie d'opération déduite du type de mission du contrat ──
const CATEGORIES = {
  'Contrebande':           { emoji: '📦',  pole: 'illegal' },
  'Sabotage':              { emoji: '🧨',  pole: 'illegal' },
  'Vol organisé':          { emoji: '💰',  pole: 'illegal' },
  'Élimination':           { emoji: '🗡️',  pole: 'illegal' },
  'Extorsion':             { emoji: '✊',  pole: 'illegal' },
  'Espionnage':            { emoji: '👁️',  pole: 'illegal' },
  'Protection':            { emoji: '🛡️',  pole: 'legal'   },
  'Chasseur de primes':    { emoji: '🎯',  pole: 'legal'   },
  'Récupération de dette': { emoji: '⛓️',  pole: 'illegal' },
  'Autre':                 { emoji: '❓',  pole: 'illegal' },
};
function _categorie(typeMission) { return CATEGORIES[typeMission] || { emoji: '🎯', pole: 'illegal' }; }

// ═══════════════════════════════════════════════════════════════
//  DÉFINITION DES ÉTAPES (5)
//  champs : max 5 par étape (limite des formulaires Discord)
//  type : 'short' | 'para'   ·   req : obligatoire pour valider
//  photo : 'req' (photo obligatoire) | true (photo proposée) | false
// ═══════════════════════════════════════════════════════════════
const STEP_DEFS = [
  {
    key: 'reperage', label: '🔍 Repérage / Reconnaissance', photo: 'req',
    intro: 'Localiser et observer la cible avant toute action.',
    champs: [
      { id: 'position',  label: 'Dernière position connue',          type: 'short', req: true,  max: 120, ph: 'Ex : ferme à l\'est de Valentine' },
      { id: 'effectif',  label: 'Cibles + gardes / escorte (nombre)', type: 'short', req: true,  max: 80,  ph: 'Ex : 1 cible + 3 hommes armés' },
      { id: 'habitudes', label: 'Habitudes / horaires observés',      type: 'para',  req: false, max: 500, ph: 'Déplacements, routines, points faibles…' },
      { id: 'notes',     label: 'Notes de repérage',                  type: 'para',  req: false, max: 500, ph: 'Terrain, accès, dangers…' },
    ],
  },
  {
    key: 'plan', label: '🗺️ Plan d\'approche', photo: true,
    intro: 'Définir comment on entre, on agit, on se replie.',
    champs: [
      { id: 'ralliement', label: 'Point de ralliement',            type: 'short', req: true,  max: 120, ph: 'Ex : vieux moulin au nord' },
      { id: 'itineraire', label: 'Itinéraire (approche + repli)',   type: 'para',  req: true,  max: 600, ph: 'Chemin d\'approche, plan B, repli…' },
      { id: 'equipement', label: 'Équipement / matériel',           type: 'para',  req: false, max: 400, ph: 'Armes, chevaux, dynamite, déguisements…' },
      { id: 'horaire',    label: 'Heure d\'intervention prévue',     type: 'short', req: false, max: 80,  ph: 'Ex : 22/06 à 21h' },
    ],
  },
  {
    key: 'equipe', label: '👥 Constitution de l\'équipe', photo: false,
    intro: 'Réunir et répartir les membres de l\'opération.',
    champs: [
      { id: 'effectif',     label: 'Effectif requis (nombre)',       type: 'short', req: true,  max: 40,  ph: 'Ex : 4 membres' },
      { id: 'roles',        label: 'Rôles assignés (qui fait quoi)',  type: 'para',  req: true,  max: 600, ph: 'Guetteur, tireur, conducteur, négociateur…' },
      { id: 'participants', label: 'Membres confirmés',               type: 'para',  req: false, max: 500, ph: 'Liste des frères engagés' },
    ],
  },
  {
    key: 'execution', label: '🎯 Exécution', photo: 'req',
    intro: 'L\'action elle-même : ce qui s\'est réellement passé.',
    champs: [
      { id: 'issue',       label: 'Issue / résultat',               type: 'short', req: true,  max: 120, ph: 'Ex : cible capturée vivante' },
      { id: 'deroulement', label: 'Déroulement de l\'action',        type: 'para',  req: true,  max: 700, ph: 'Compte-rendu de l\'intervention…' },
      { id: 'pertes',      label: 'Pertes / incidents',              type: 'para',  req: false, max: 400, ph: 'Blessés, imprévus, témoins…' },
    ],
  },
  {
    key: 'bilan', label: '💰 Bilan & prime', photo: true,
    intro: 'Remise, encaissement et bilan final.',
    champs: [
      { id: 'lieuRemise', label: 'Lieu de remise',          type: 'short', req: false, max: 120, ph: 'Ex : arrière-salle du saloon de Rhodes' },
      { id: 'prime',      label: 'Prime encaissée ($)',      type: 'short', req: true,  max: 80,  ph: 'Ex : 3000$' },
      { id: 'bilan',      label: 'Bilan final / butin',      type: 'para',  req: false, max: 600, ph: 'Ce qui a été récupéré, répartition…' },
    ],
  },
];

function genId() { return 'OP-' + Date.now().toString().slice(-6); }
function _find(db, id) { return (db.preparations || []).find(o => o.id === id); }
function _currentIdx(op) {
  const i = (op.etapes || []).findIndex(e => !e.valide);
  return i === -1 ? (op.etapes || []).length : i;
}
function _newEtapes() {
  return STEP_DEFS.map(s => ({ key: s.key, valide: false, valideePar: null, valideeAt: null, champs: {}, photos: [] }));
}

// ── Vérifie les champs requis + photo d'une étape ──
function _manque(et, def) {
  const out = [];
  for (const c of def.champs) {
    if (c.req && !(et.champs && et.champs[c.id] && String(et.champs[c.id]).trim())) out.push(c.label);
  }
  if (def.photo === 'req' && !(et.photos && et.photos.length)) out.push('au moins une photo');
  return out;
}
function _resumeChamps(et, def) {
  const lines = [];
  for (const c of def.champs) {
    const v = et.champs && et.champs[c.id];
    if (v && String(v).trim()) lines.push(`• **${c.label}** : ${_clip(v, 90)}`);
  }
  return lines.length ? lines.join('\n') : '*Rien de renseigné pour l\'instant.*';
}

// ═══════════════════════════════════════════════════════════════
//  PANNEAU D'ÉTAPES (embed + boutons)
// ═══════════════════════════════════════════════════════════════
function _embedPanel(op) {
  const total = op.etapes.length;
  const done = op.etapes.filter(e => e.valide).length;
  const bar = '🟩'.repeat(done) + '⬜'.repeat(total - done);
  const cur = _currentIdx(op);
  const termine = op.status === 'termine' || done === total;

  const e = new EmbedBuilder()
    .setColor(termine ? COL.vert : (op.pole === 'legal' ? COL.bleu : COL.rouge))
    .setTitle(`${op.emoji} OPÉRATION — « ${_clip(op.cible, 70)} »`)
    .setDescription([
      '```', ' PRÉPARATION D\'OPÉRATION · IRON WOLF / CONFRÉRIE ', '```',
      'Préparez la mission **étape par étape**. Chaque étape se remplit puis se **valide** ; la suivante se déverrouille ensuite. Une fois tout validé, le **dossier d\'opération** est généré.',
    ].join('\n'))
    .addFields(
      { name: 'Statut', value: termine ? '✅ Préparation terminée' : '🟡 En préparation', inline: true },
      { name: 'Catégorie', value: `${op.emoji} ${op.categorie}`, inline: true },
      { name: 'Contrat lié', value: `\`${op.contratId || '—'}\``, inline: true },
      { name: '💰 Prime / rémunération', value: _clip(op.remuneration || '—', 80), inline: true },
      { name: '⚠️ Risque', value: op.risque ? String(op.risque) : '—', inline: true },
      { name: 'Avancement', value: `${bar}  **${done}/${total}**`, inline: false },
    );

  op.etapes.forEach((et, i) => {
    const def = STEP_DEFS[i];
    let icon;
    if (et.valide) icon = '✅';
    else if (i === cur) icon = '⏳';
    else icon = '🔒';
    const ph = (et.photos || []).length;
    let body = _resumeChamps(et, def);
    if (ph) body += `\n📷 **${ph} photo(s)** jointe(s)`;
    if (et.valide) body += `\n*✔️ validée par ${et.valideePar || '—'} le ${_fmtDate(et.valideeAt)}*`;
    else if (i === cur) body += `\n*▶️ étape en cours — à compléter puis valider*`;
    else body += `\n*🔒 verrouillée (valide d\'abord les étapes précédentes)*`;
    e.addFields({ name: `${icon} Étape ${i + 1} · ${def.label}`, value: _clip(body, 1020), inline: false });
  });

  e.setFooter({ text: `Réf. ${op.id} • Préparation d'opération` }).setTimestamp();
  return e;
}

function _boutons(op) {
  const rows = [];
  const idx = _currentIdx(op);
  const termine = op.status === 'termine' || idx >= op.etapes.length;
  if (!termine && op.status !== 'annulee') {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`opx_fill::${op.id}::${idx}`).setLabel(`📝 Remplir l'étape ${idx + 1}`).setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`opx_photo::${op.id}::${idx}`).setLabel('📷 Ajouter une photo').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`opx_valid::${op.id}::${idx}`).setLabel(`✅ Valider l'étape ${idx + 1}`).setStyle(ButtonStyle.Success),
    ));
  }
  if (op.status !== 'annulee') {
    const row2 = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`opx_doc::${op.id}`).setLabel(termine ? '📄 Régénérer le dossier' : '📄 Dossier (brouillon)').setStyle(ButtonStyle.Secondary),
    );
    if (!termine) row2.addComponents(new ButtonBuilder().setCustomId(`opx_cancel::${op.id}`).setLabel('🗑️ Annuler l\'opération').setStyle(ButtonStyle.Danger));
    rows.push(row2);
  }
  return rows;
}

async function _refreshPanel(guild, op) {
  try {
    if (!op.channelId || !op.msgId) return;
    const ch = await guild.channels.fetch(op.channelId).catch(() => null);
    if (!ch) return;
    const msg = await ch.messages.fetch(op.msgId).catch(() => null);
    if (msg) await msg.edit({ embeds: [_embedPanel(op)], components: _boutons(op) }).catch(() => {});
  } catch {}
}

// ═══════════════════════════════════════════════════════════════
//  CRÉATION DEPUIS UN CONTRAT VALIDÉ (appelée par index.js → contrats)
// ═══════════════════════════════════════════════════════════════
async function creerOperationDepuisContrat(guild, contrat, opts = {}) {
  if (!guild || !contrat) return null;
  const db = loadDB();
  if (!db.preparations) db.preparations = [];

  // anti-doublon : un contrat = une opération
  const exist = db.preparations.find(o => o.contratId === contrat.id);
  if (exist) return exist;

  const cat = _categorie(contrat.typeMission);
  const op = {
    id: genId(),
    contratId: contrat.id,
    guildId: guild.id,
    categorie: contrat.typeMission || 'Autre',
    emoji: cat.emoji,
    pole: cat.pole,
    cible: contrat.objet || contrat.commanditaire || 'Mission',
    risque: contrat.risque || null,
    remuneration: contrat.remuneration || '—',
    echeance: contrat.echeanceTexte || null,
    details: contrat.details || '',
    status: 'prep',
    etapes: _newEtapes(),
    createdAt: new Date().toISOString(),
    createurId: opts.parId || null,
  };

  // mémorise le lien côté contrat (dans la même sauvegarde)
  const c = (db.contrats || []).find(x => x.id === contrat.id);
  if (c) c.operationId = op.id;
  db.preparations.push(op);
  _persist(db);

  // Poste le panneau dans #operations (forum → post / texte → message + fil)
  const opsCh = _salonOps(guild);
  const rid = _poleRoleId(guild, op.pole);
  const payload = {
    content: `${rid ? `<@&${rid}> — ` : ''}${op.emoji} Nouvelle **opération à préparer** : « **${_clip(op.cible, 80)}** » *(${op.categorie})*.\nIssue du contrat \`${op.contratId}\`. Préparez-la **étape par étape** ci-dessous.`,
    embeds: [_embedPanel(op)],
    components: _boutons(op),
    allowedMentions: { roles: rid ? [rid] : [] },
  };
  const coord = `🧭 **Fil de coordination — opération « ${_clip(op.cible, 60)} »**\nPostez ici vos infos, repérages et photos. Pour rattacher une photo à une étape, cliquez « 📷 Ajouter une photo » sur le panneau puis envoyez l'image dans ce fil.`;

  try {
    if (opsCh && opsCh.type === 15 && opsCh.threads?.create) {
      const post = await opsCh.threads.create({ name: `${op.emoji} ${_clip(op.cible, 70)}`.slice(0, 100), message: payload }).catch(() => null);
      if (post) {
        op.channelId = post.id; op.threadId = post.id;
        const starter = await post.fetchStarterMessage().catch(() => null);
        if (starter) { op.msgId = starter.id; await starter.pin().catch(() => {}); }
        await post.send({ content: coord }).catch(() => {});
      }
    } else if (opsCh && typeof opsCh.send === 'function') {
      const sent = await opsCh.send(payload).catch(() => null);
      if (sent) {
        op.channelId = opsCh.id; op.msgId = sent.id;
        await sent.pin().catch(() => {});
        const fil = await sent.startThread({ name: `${op.emoji} ${_clip(op.cible, 70)}`.slice(0, 100), autoArchiveDuration: 10080 }).catch(() => null);
        if (fil) { op.threadId = fil.id; await fil.send({ content: coord }).catch(() => {}); }
      }
    }
  } catch (e) { console.log('⚠️ post opération-étapes:', e.message); }

  _persist(db);
  try { if (typeof _inj.journalHook === 'function') await _inj.journalHook(guild, op); } catch {}
  return op;
}

// ═══════════════════════════════════════════════════════════════
//  DOSSIER D'OPÉRATION (fichier .md + embed récap)
// ═══════════════════════════════════════════════════════════════
function _genererMarkdown(op) {
  const L = [];
  L.push(`# ${op.emoji} DOSSIER D'OPÉRATION`);
  L.push('');
  L.push(`**Objet / cible :** ${op.cible}`);
  L.push(`**Catégorie :** ${op.emoji} ${op.categorie}`);
  L.push(`**Référence opération :** ${op.id}`);
  L.push(`**Contrat lié :** ${op.contratId || '—'}`);
  L.push(`**Pôle :** ${op.pole === 'legal' ? '⚖️ Iron Wolf Company' : '🔪 La Confrérie'}`);
  if (op.risque) L.push(`**Risque :** ${op.risque}`);
  L.push(`**Prime / rémunération :** ${op.remuneration || '—'}`);
  if (op.echeance) L.push(`**Échéance :** ${op.echeance}`);
  L.push(`**Établi le :** ${_fmtDate(new Date().toISOString())}`);
  L.push('');
  if (op.details) { L.push('> ' + String(op.details).replace(/\n/g, '\n> ')); L.push(''); }
  L.push('---');
  op.etapes.forEach((et, i) => {
    const def = STEP_DEFS[i];
    L.push('');
    L.push(`## Étape ${i + 1} — ${def.label}`);
    L.push(`*${def.intro}*`);
    L.push('');
    L.push(`**Statut :** ${et.valide ? `✅ validée par ${et.valideePar || '—'} le ${_fmtDate(et.valideeAt)}` : '⬜ non validée'}`);
    for (const c of def.champs) {
      const v = et.champs && et.champs[c.id];
      if (v && String(v).trim()) L.push(`- **${c.label} :** ${v}`);
    }
    if ((et.photos || []).length) {
      L.push('');
      L.push('**Photos :**');
      et.photos.forEach((p, n) => L.push(`- [Photo ${n + 1}](${p.url || p})`));
    }
  });
  L.push('');
  L.push('---');
  L.push('*Dossier généré automatiquement par le Centre des opérations — Iron Wolf Company.*');
  return L.join('\n');
}

function _embedDossier(op) {
  const e = new EmbedBuilder()
    .setColor(COL.or)
    .setTitle(`📄 DOSSIER D'OPÉRATION — « ${_clip(op.cible, 70)} »`)
    .setDescription(`${op.emoji} **${op.categorie}** · contrat \`${op.contratId || '—'}\` · réf. \`${op.id}\``)
    .addFields(
      { name: '💰 Prime / rémunération', value: _clip(op.remuneration || '—', 100), inline: true },
      { name: '🗂️ Pôle', value: op.pole === 'legal' ? '⚖️ Iron Wolf' : '🔪 Confrérie', inline: true },
    );
  op.etapes.forEach((et, i) => {
    const def = STEP_DEFS[i];
    let body = _resumeChamps(et, def);
    const ph = (et.photos || []).length;
    if (ph) body += `\n📷 ${ph} photo(s)`;
    e.addFields({ name: `${et.valide ? '✅' : '⬜'} Étape ${i + 1} · ${def.label}`, value: _clip(body, 1020), inline: false });
  });
  e.setFooter({ text: `Dossier ${op.id} • Iron Wolf Company` }).setTimestamp();
  return e;
}

async function _posterDossier(guild, op) {
  const md = _genererMarkdown(op);
  const file = new AttachmentBuilder(Buffer.from(md, 'utf8'), { name: `dossier-${op.id}.md` });
  const target = op.threadId || op.channelId;
  const ch = target ? await guild.channels.fetch(target).catch(() => null) : null;
  if (ch && typeof ch.send === 'function') {
    await ch.send({ content: '📄 **Dossier d\'opération** — compilation des étapes validées :', embeds: [_embedDossier(op)], files: [file] }).catch(() => {});
  }
  return file;
}

// ═══════════════════════════════════════════════════════════════
//  ROUTEUR D'INTERACTIONS  (préfixe opx_ )
// ═══════════════════════════════════════════════════════════════
async function routeInteraction(interaction) {
  try {
    const cid = interaction.customId || '';
    if (!cid.startsWith('opx_')) return false;

    // ── Remplir une étape → formulaire ──
    if (interaction.isButton?.() && cid.startsWith('opx_fill::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (idx !== _currentIdx(op)) { await interaction.reply({ content: '⛔ Cette étape n\'est pas l\'étape en cours.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const def = STEP_DEFS[idx];
      const et = op.etapes[idx];
      const modal = new ModalBuilder().setCustomId(`opx_fillm::${id}::${idx}`).setTitle(_clip(`Étape ${idx + 1} · ${def.label.replace(/^[^ ]+ /, '')}`, 45));
      for (const c of def.champs) {
        const ti = new TextInputBuilder().setCustomId(c.id).setLabel(_clip(c.label, 45))
          .setStyle(c.type === 'para' ? TextInputStyle.Paragraph : TextInputStyle.Short)
          .setRequired(!!c.req).setMaxLength(c.max || 300).setPlaceholder(_clip(c.ph || '', 100));
        const cur = et.champs && et.champs[c.id];
        if (cur) ti.setValue(_clip(String(cur), c.max || 300));
        modal.addComponents(new ActionRowBuilder().addComponents(ti));
      }
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    // ── Soumission du formulaire ──
    if (interaction.isModalSubmit?.() && cid.startsWith('opx_fillm::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const def = STEP_DEFS[idx];
      const et = op.etapes[idx];
      if (!et.champs) et.champs = {};
      for (const c of def.champs) {
        const v = (interaction.fields.getTextInputValue(c.id) || '').trim();
        if (v) et.champs[c.id] = v; else delete et.champs[c.id];
      }
      _persist(db);
      await interaction.reply({ content: `✅ Étape **${idx + 1}** mise à jour.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      await _refreshPanel(interaction.guild, op);
      return true;
    }

    // ── Ajouter une / des photo(s) → collecte dans le fil ──
    if (interaction.isButton?.() && cid.startsWith('opx_photo::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (idx !== _currentIdx(op)) { await interaction.reply({ content: '⛔ Cette étape n\'est pas l\'étape en cours.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const ch = interaction.channel;
      if (!ch || typeof ch.createMessageCollector !== 'function') { await interaction.reply({ content: '❌ Impossible de collecter une photo ici (utilise le fil de l\'opération).', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.reply({ content: `📷 **Envoie ta/tes photo(s) dans ce fil dans les 2 minutes** (étape ${idx + 1}). Je les rattacherai automatiquement.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      const userId = interaction.user.id;
      const isImg = (a) => ((a.contentType || '').startsWith('image/') || /\.(png|jpe?g|gif|webp|bmp)$/i.test(a.name || ''));
      const collector = ch.createMessageCollector({
        filter: (m) => m.author.id === userId && m.attachments.some(isImg),
        time: 120000, max: 6,
      });
      collector.on('collect', async (m) => {
        const imgs = [...m.attachments.values()].filter(isImg).map(a => ({ url: a.url, name: a.name || 'photo' }));
        if (!imgs.length) return;
        const db2 = loadDB();
        const op2 = _find(db2, id);
        if (!op2) return;
        if (!op2.etapes[idx].photos) op2.etapes[idx].photos = [];
        op2.etapes[idx].photos.push(...imgs);
        _persist(db2);
        await m.react('✅').catch(() => {});
        await _refreshPanel(interaction.guild, op2);
      });
      collector.on('end', (collected) => {
        if (collected.size === 0) interaction.followUp({ content: '⏳ Aucune photo reçue (délai écoulé).', flags: MessageFlags.Ephemeral }).catch(() => {});
      });
      return true;
    }

    // ── Valider une étape (Direction) ──
    if (interaction.isButton?.() && cid.startsWith('opx_valid::')) {
      const [, id, idxS] = cid.split('::');
      const idx = parseInt(idxS, 10);
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Seule la Direction peut valider une étape.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      if (idx !== _currentIdx(op)) { await interaction.reply({ content: '⛔ Étape déjà validée ou verrouillée.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const def = STEP_DEFS[idx];
      const et = op.etapes[idx];
      const manque = _manque(et, def);
      if (manque.length) { await interaction.reply({ content: `⛔ Impossible de valider l'étape ${idx + 1} — il manque :\n• ${manque.join('\n• ')}`, flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      et.valide = true;
      et.valideePar = interaction.member?.displayName || interaction.user.username;
      et.valideeAt = new Date().toISOString();
      const fini = _currentIdx(op) >= op.etapes.length;
      if (fini) op.status = 'termine';
      _persist(db);
      await interaction.reply({ content: fini ? `✅ Étape ${idx + 1} validée. **Toutes les étapes sont validées** — je génère le dossier.` : `✅ Étape ${idx + 1} validée. L'étape ${idx + 2} est déverrouillée.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      await _refreshPanel(interaction.guild, op);
      if (fini) { op.dossierGenere = true; _persist(db); await _posterDossier(interaction.guild, op).catch(() => {}); }
      return true;
    }

    // ── Générer / régénérer le dossier ──
    if (interaction.isButton?.() && cid.startsWith('opx_doc::')) {
      const id = cid.split('::')[1];
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      await interaction.deferReply({ flags: MessageFlags.Ephemeral }).catch(() => {});
      await _posterDossier(interaction.guild, op).catch(() => {});
      await interaction.editReply({ content: '📄 Dossier généré dans le fil.' }).catch(() => {});
      return true;
    }

    // ── Annuler l'opération (Direction) ──
    if (interaction.isButton?.() && cid.startsWith('opx_cancel::')) {
      const id = cid.split('::')[1];
      if (!isDirection(interaction.member)) { await interaction.reply({ content: '🔒 Réservé à la Direction.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      const db = loadDB();
      const op = _find(db, id);
      if (!op) { await interaction.reply({ content: '❌ Opération introuvable.', flags: MessageFlags.Ephemeral }).catch(() => {}); return true; }
      op.status = 'annulee';
      _persist(db);
      await interaction.reply({ content: `🗑️ Opération **${op.id}** annulée.`, flags: MessageFlags.Ephemeral }).catch(() => {});
      await _refreshPanel(interaction.guild, op);
      return true;
    }

    return false;
  } catch (e) {
    if ([10062, 10008, 40060].includes(e?.code)) return true;
    console.log('❌ operations-etapes routeInteraction error:', e.message);
    try { if (interaction.isRepliable?.() && !interaction.replied && !interaction.deferred) await interaction.reply({ content: '❌ Une erreur est survenue.', flags: MessageFlags.Ephemeral }); } catch {}
    return true;
  }
}

module.exports = { init, routeInteraction, creerOperationDepuisContrat, STEP_DEFS };
