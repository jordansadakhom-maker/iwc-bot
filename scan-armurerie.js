// ═══════════════════════════════════════════════════════════════
// scan-armurerie.js — Scan HORAIRE de cohérence de stock de l'armurerie.
//
// Détecte : stocks NÉGATIFS, DOUBLONS (même nom), et RESSOURCES de recette
// MANQUANTES au catalogue. Écrit un rapport dans ArmurerieScanRapport et n'alerte
// le salon Discord QUE s'il y a au moins une anomalie (pas de spam horaire).
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op sans
// les variables Supabase. IMPORTANT : si la LECTURE échoue, on n'écrit AUCUN
// rapport « RAS » (sinon fausse tranquillité) — on ressort proprement.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const { lireProduitsArmurerieRecette, lireRessourcesArmurerie, enregistrerScanArmurerie } = require('./supabase-sync');

const SALON_SCAN_ID = '1509244143199715499'; // même salon que le point stock
const FONDATEUR_ID = '944208797084311583';    // repli MP

const _STOP = new Set(['de', 'du', 'des', 'd', 'l', 'la', 'le', 'les', 'a', 'au', 'aux', 'en', 'pour']);
function _norm(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]/g, ''); }
function _tokens(x) { return String(x || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/).filter((t) => t && !_STOP.has(t)); }
function _num(v) { return Number(v) || 0; }

// MÊME rapprochement ingrédient→ressource que le site (armurerie/actions.ts _matchRes)
// → évite de fausses alertes « ressource manquante » sur les noms résolus par tokens.
function _matchRes(ing, ressources) {
  const n = _norm(ing);
  const exact = ressources.filter((r) => _norm(r.nom) === n);
  if (exact.length === 1) return exact[0];
  const it = _tokens(ing);
  if (!it.length) return null;
  const cand = ressources.filter((r) => { const rt = new Set(_tokens(r.nom)); return it.every((t) => rt.has(t)); });
  if (cand.length === 1) return cand[0];
  if (cand.length > 1) {
    const starts = cand.filter((r) => { const rn = _norm(r.nom); return rn.startsWith(n) || n.startsWith(rn); });
    const pool = (starts.length ? starts : cand).slice().sort((a, b) => _tokens(a.nom).length - _tokens(b.nom).length);
    if (pool.length === 1 || _tokens(pool[0].nom).length !== _tokens(pool[1].nom).length) return pool[0];
  }
  return null;
}

// Analyse PURE (sans I/O). Renvoie { anomalies, nb, resume, parType }.
function _analyser(produits, ressources) {
  const anomalies = [];
  // (a) stocks négatifs
  for (const p of produits) if (_num(p.stock) < 0) anomalies.push({ type: 'stock_negatif', cible: 'produit', id: p.id, nom: p.nom, stock: _num(p.stock) });
  for (const r of ressources) if (_num(r.stock) < 0) anomalies.push({ type: 'stock_negatif', cible: 'ressource', id: r.id, nom: r.nom, stock: _num(r.stock) });
  // (b) doublons (même nom normalisé)
  const grp = (list, cible) => {
    const m = new Map();
    for (const x of list) { const k = _norm(x.nom); if (!k) continue; if (!m.has(k)) m.set(k, []); m.get(k).push(x); }
    for (const xs of m.values()) if (xs.length > 1) anomalies.push({ type: 'doublon', cible, nom: xs[0].nom, ids: xs.map((x) => x.id), n: xs.length });
  };
  grp(produits, 'produit'); grp(ressources, 'ressource');
  // (c) ressources de recette introuvables au catalogue (match token-subset = comme le site)
  for (const p of produits) {
    const rec = Array.isArray(p.recette) ? p.recette : [];
    for (const l of rec) {
      const ing = String((l && l.ingredient) || '').trim();
      if (!ing || !(_num(l.qte) > 0)) continue;
      if (!_matchRes(ing, ressources)) anomalies.push({ type: 'ressource_manquante', produitId: p.id, produitNom: p.nom, ingredient: ing });
    }
  }
  const nb = anomalies.length;
  const parType = anomalies.reduce((acc, a) => { acc[a.type] = (acc[a.type] || 0) + 1; return acc; }, {});
  const resume = nb === 0 ? 'RAS — aucune incohérence.' : Object.entries(parType).map(([t, n]) => `${n} ${t.replace(/_/g, ' ')}`).join(', ');
  return { anomalies, nb, resume, parType };
}

function _liste(items, fmt) {
  const lignes = items.map(fmt);
  const out = []; let len = 0;
  for (const l of lignes) { if (len + l.length + 1 > 950) break; out.push(l); len += l.length + 1; }
  const reste = lignes.length - out.length;
  if (reste > 0) out.push(`… (+${reste} de plus)`);
  return out.join('\n') || '—';
}

// options.force = true → poste même sans anomalie (test manuel).
async function scannerCoherenceArmurerie(client, options = {}) {
  const force = !!options.force;
  let produits, ressources;
  try { produits = await lireProduitsArmurerieRecette(); ressources = await lireRessourcesArmurerie(); }
  catch { return { ok: false, raison: 'lecture' }; }
  // Lecture échouée (null) → surtout PAS de rapport « RAS » trompeur.
  if (produits == null || ressources == null) return { ok: false, raison: 'lecture' };

  const { anomalies, nb, resume, parType } = _analyser(produits, ressources);

  // Trace le passage du scan (même RAS) → le site affiche « dernier scan à … ».
  try { await enregistrerScanArmurerie({ id: 'scan_' + Date.now(), createdAt: new Date().toISOString(), anomalies, resume, nb }); } catch { /* best-effort */ }

  if (nb === 0 && !force) return { ok: true, envoye: false, nb: 0 };

  const negs = anomalies.filter((a) => a.type === 'stock_negatif');
  const doubles = anomalies.filter((a) => a.type === 'doublon');
  const manques = anomalies.filter((a) => a.type === 'ressource_manquante');
  const e = new EmbedBuilder()
    .setColor(nb ? 0x9b2d30 : 0x2f8f5b)
    .setTitle('🧪 Armurerie — scan de cohérence')
    .setTimestamp()
    .setFooter({ text: 'Iron Wolf Company · Scan horaire' });
  if (!nb) e.setDescription('✅ Aucune incohérence détectée.');
  if (negs.length) e.addFields({ name: `🔻 Stocks négatifs (${negs.length})`, value: _liste(negs, (a) => `• **${a.nom}** _(${a.cible})_ — ${a.stock}`) });
  if (doubles.length) e.addFields({ name: `👥 Doublons (${doubles.length})`, value: _liste(doubles, (a) => `• **${a.nom}** _(${a.cible})_ — ${a.n} entrées`) });
  if (manques.length) e.addFields({ name: `❓ Ressources de recette manquantes (${manques.length})`, value: _liste(manques, (a) => `• ${a.produitNom} → **${a.ingredient}**`) });

  let livre = false;
  try {
    const ch = await client.channels.fetch(SALON_SCAN_ID).catch(() => null);
    if (ch && ch.isTextBased?.()) { await ch.send({ content: '🧪 **Scan de cohérence du stock — armurerie**', embeds: [e] }); livre = true; }
  } catch (err) { console.log('⚠️ scan-armurerie salon:', err.message); }
  if (!livre) {
    try { const u = await client.users.fetch(FONDATEUR_ID).catch(() => null); if (u) { await u.send({ content: '🧪 **Scan de cohérence du stock — armurerie** — *salon introuvable.*', embeds: [e] }); livre = true; } }
    catch (err) { console.log('⚠️ scan-armurerie MP:', err.message); }
  }
  return { ok: true, envoye: livre, nb, parType };
}

module.exports = { scannerCoherenceArmurerie };
