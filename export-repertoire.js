// ═══════════════════════════════════════════════════════════════
// export-repertoire.js — Exporte les fiches d'un salon Discord vers le
// Répertoire du site (table DispensaireContact). Best-effort & LOSSLESS :
// chaque fiche devient une entrée ; les « Clé : valeur » connues sont rangées
// dans les bons champs, le reste va en notes. Rien n'est perdu.
//
// « Ne rien dérégler » : lecture seule côté Discord, écriture additive côté
// Supabase, no-op si les tables/variables ne sont pas là.
// ═══════════════════════════════════════════════════════════════

const { lireNomsContactsDispensaire, importerContactsDispensaire, enregistrerHistoriqueDispensaire } = require('./supabase-sync');

const SALON_REPERTOIRE_ID = '1517505221629050901'; // salon des fiches contacts

const CATS = {
  fournisseurs: 'cat-fournisseurs', fournisseur: 'cat-fournisseurs',
  entreprises: 'cat-entreprises', entreprise: 'cat-entreprises',
  'services publics': 'cat-services', 'service public': 'cat-services', services: 'cat-services',
  artisans: 'cat-artisans', artisan: 'cat-artisans',
  mines: 'cat-mines', mine: 'cat-mines',
  menuiseries: 'cat-menuiseries', menuiserie: 'cat-menuiseries',
  armuriers: 'cat-armuriers', armurier: 'cat-armuriers',
  indics: 'cat-indics', indic: 'cat-indics',
  relations: 'cat-relations', 'relations et allies': 'cat-relations', allies: 'cat-relations', allie: 'cat-relations',
  autres: 'cat-autres', autre: 'cat-autres',
};

function _norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9 ]/g, '').trim(); }
function _clean(x, max = 1000) { const t = String(x || '').replace(/\*\*|__|`/g, '').trim(); return t ? t.slice(0, max) : ''; }
function _nom(x) { return String(x || '').replace(/[*_`~>#]/g, '').replace(/^[\s•\-–—]+/, '').trim().slice(0, 200); }

function _champDe(cle) {
  const c = _norm(cle);
  if (/responsable|gerant|patron|proprio/.test(c)) return 'responsable';
  if (/adresse|localisation|ou le trouver|ville|lieu/.test(c)) return 'adresse';
  if (/telegramme|telegram/.test(c)) return 'telegramme';
  if (/horaire|dispo/.test(c)) return 'horaires';
  if (/type de service|service|prestation/.test(c)) return 'typeService';
  if (/produit|stock|matiere|marchandise/.test(c)) return 'produits';
  if (/tarif|prix|cout/.test(c)) return 'tarifs';
  if (/banque|compte|iban|paiement/.test(c)) return 'banque';
  if (/relation|indic|allie|nature du contact/.test(c)) return 'relation';
  if (/categorie/.test(c)) return '__cat';
  if (/contact secondaire|secondaire/.test(c)) return 'contactSecondaire';
  if (/description|activite/.test(c)) return 'description';
  if (/contact|telephone|joindre|moyen/.test(c)) return 'moyensContact';
  if (/note|remarque|info|complement/.test(c)) return 'notes';
  return null;
}
function _applique(f, champ, val) {
  const v = _clean(val, champ === 'notes' || champ === 'description' ? 4000 : 500);
  if (!v) return;
  if (champ === '__cat') { f.__cat = v; return; }
  f[champ] = f[champ] ? f[champ] + ' · ' + v : v;
}

// Construit une fiche depuis un nom + des lignes de détail.
function _fiche(nomBrut, lignes) {
  const nom = _nom(nomBrut);
  if (!nom) return null;
  const f = { nom };
  const notes = [];
  for (const l of lignes) {
    const m = String(l).match(/^[*•>\-\s]*([A-Za-zÀ-ÿ'’\/ ]{2,34})\s*[:：]\s*(.+)$/);
    if (m) { const champ = _champDe(m[1]); if (champ) { _applique(f, champ, m[2]); continue; } }
    const t = _clean(String(l).replace(/^[*•>\-–\s]+/, ''), 500);
    if (t) notes.push(t);
  }
  if (notes.length) f.notes = (f.notes ? f.notes + '\n' : '') + notes.join('\n');
  return f;
}

// Découpe un message texte en une ou plusieurs fiches (bloc = fiche).
function _fichesTexte(txt) {
  const blocs = String(txt || '').split(/\n\s*(?:[-–—=*_]{3,}\s*)?\n(?=\s*\S)/).map((b) => b.trim()).filter((b) => b.length > 1);
  const out = [];
  for (const bloc of blocs) {
    const lignes = bloc.split('\n').map((l) => l.trim()).filter(Boolean);
    if (lignes.length < 2) continue; // évite les messages de discussion (une seule ligne)
    const f = _fiche(lignes[0], lignes.slice(1));
    if (f) out.push(f);
  }
  return out;
}

function _ficheEmbed(embed) {
  const lignes = [];
  if (embed.description) lignes.push(...String(embed.description).split('\n').map((l) => l.trim()).filter(Boolean));
  for (const fld of (embed.fields || [])) lignes.push(`${fld.name}: ${String(fld.value || '').replace(/\n/g, ' ')}`);
  if (embed.footer && embed.footer.text) lignes.push(embed.footer.text);
  let nomBrut = embed.title || (embed.author && embed.author.name) || '';
  if (!nomBrut) { nomBrut = lignes.shift() || ''; }
  return _fiche(nomBrut, lignes);
}

async function _fetchTous(ch, cap = 3000) {
  let all = [], before;
  while (all.length < cap) {
    const batch = await ch.messages.fetch({ limit: 100, before }).catch(() => null);
    if (!batch || batch.size === 0) break;
    const arr = [...batch.values()];
    all = all.concat(arr);
    before = arr[arr.length - 1].id;
    if (batch.size < 100) break;
  }
  return all;
}

async function exporterRepertoire(client, options = {}) {
  const salonId = options.salonId || SALON_REPERTOIRE_ID;
  const ch = await client.channels.fetch(salonId).catch(() => null);
  if (!ch || !ch.isTextBased || !ch.isTextBased()) return { ok: false, raison: 'salon' };

  const messages = await _fetchTous(ch);

  const fiches = [];
  for (const m of messages) {
    for (const e of (m.embeds || [])) { const f = _ficheEmbed(e); if (f && f.nom) fiches.push(f); }
    const contenu = (m.content || '').trim();
    if (contenu.length > 1 && !contenu.startsWith('/')) for (const f of _fichesTexte(contenu)) if (f && f.nom) fiches.push(f);
  }

  const existants = await lireNomsContactsDispensaire();
  const vus = new Set((existants || []).map(_norm));
  const now = new Date().toISOString();
  const base36 = Date.now().toString(36);
  const rows = [], histo = [];
  let doublons = 0, n = 0;

  for (const f of fiches) {
    const k = _norm(f.nom);
    if (!k) continue;
    if (vus.has(k)) { doublons++; continue; }
    vus.add(k);
    const id = `dc-imp-${base36}-${n}`;
    const cat = f.__cat ? CATS[_norm(f.__cat)] : null;
    rows.push({
      id, categorieId: cat || null, nom: f.nom, relation: f.relation || null, responsable: f.responsable || null,
      description: f.description || null, adresse: f.adresse || null, telegramme: f.telegramme || null,
      contactSecondaire: f.contactSecondaire || null, horaires: f.horaires || null, notes: f.notes || null,
      typeService: f.typeService || null, produits: f.produits || null, tarifs: f.tarifs || null,
      banque: f.banque || null, moyensContact: f.moyensContact || null,
      source: 'discord', updatedBy: 'Import Discord', updatedAt: now,
    });
    histo.push({ id: `dh-imp-${base36}-${n}`, contactId: id, contactNom: f.nom, action: 'import', par: 'Import Discord', createdAt: now });
    n++;
  }

  let importes = 0;
  for (let j = 0; j < rows.length; j += 200) {
    const ok = await importerContactsDispensaire(rows.slice(j, j + 200));
    if (ok) importes += Math.min(200, rows.length - j);
  }
  try { for (let j = 0; j < histo.length; j += 200) await enregistrerHistoriqueDispensaire(histo.slice(j, j + 200)); } catch { /* best-effort */ }

  return { ok: true, lus: messages.length, detectees: fiches.length, importes, doublons };
}

module.exports = { exporterRepertoire, SALON_REPERTOIRE_ID };
