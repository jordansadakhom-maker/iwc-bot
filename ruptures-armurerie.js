// ═══════════════════════════════════════════════════════════════
// ruptures-armurerie.js — Point stock quotidien de l'armurerie de Van Horn.
//
// Interroge Supabase (table ArmurerieProduit), repère les articles en RUPTURE
// (stock 0) et en STOCK BAS (≤ seuil), et poste un récapitulatif dans le salon
// Discord dédié. N'envoie RIEN s'il n'y a aucune alerte (pas de spam quotidien).
//
// « Ne rien dérégler » : 100 % additif, best-effort, jamais bloquant. No-op sans
// les variables Supabase.
// ═══════════════════════════════════════════════════════════════

const { EmbedBuilder } = require('discord.js');
const { lireProduitsArmurerie } = require('./supabase-sync');

const SALON_RUPTURES_ID = '1509244143199715499'; // salon indiqué par le fondateur
const FONDATEUR_ID = '944208797084311583';        // repli MP
const SEUIL_BAS = 3;

function _stock(p) { return Number(p.stock) || 0; }
function _dispo(p) { return !p.aLaDemande; }
function _liste(items) {
  // Regroupe l'affichage par catégorie, tronqué au format d'un champ d'embed.
  const lignes = items.map(p => `• **${String(p.nom || 'Produit')}**${p.categorie ? ` _(${p.categorie})_` : ''} — ${_stock(p)}`);
  const txt = lignes.join('\n');
  return txt.length > 1000 ? txt.slice(0, 980) + `\n… (+${lignes.length} au total)` : (txt || '—');
}

// options.force = true → poste même s'il n'y a aucune alerte (test manuel).
// Renvoie { ok, envoye, ruptures, bas } pour permettre un retour à l'appelant.
async function verifierRupturesArmurerie(client, options = {}) {
  const force = !!options.force;
  let rows;
  try { rows = await lireProduitsArmurerie(); } catch { return { ok: false, raison: 'lecture' }; }
  if (!Array.isArray(rows)) return { ok: false, raison: 'lecture' };

  const ruptures = rows.filter(p => _dispo(p) && _stock(p) === 0);
  const bas = rows.filter(p => _dispo(p) && _stock(p) > 0 && _stock(p) <= SEUIL_BAS);
  if (!ruptures.length && !bas.length && !force) return { ok: true, envoye: false, ruptures: 0, bas: 0 }; // rien à signaler → silence

  const rien = !ruptures.length && !bas.length;
  const e = new EmbedBuilder()
    .setColor(ruptures.length ? 0x9b2d30 : rien ? 0x2f8f5b : 0xc58a1a)
    .setTitle('📦 Armurerie de Van Horn — point stock')
    .setTimestamp()
    .setFooter({ text: 'Iron Wolf Company · Réappro quotidien' });
  if (rien) e.setDescription('✅ Aucune rupture ni stock bas — tout est approvisionné.');
  if (ruptures.length) e.addFields({ name: `🔴 En rupture (${ruptures.length})`, value: _liste(ruptures) });
  if (bas.length) e.addFields({ name: `🟠 Stock bas ≤ ${SEUIL_BAS} (${bas.length})`, value: _liste(bas) });

  let livre = false;
  try {
    const ch = await client.channels.fetch(SALON_RUPTURES_ID).catch(() => null);
    if (ch && ch.isTextBased?.()) { await ch.send({ content: '📦 **Point stock de l\'armurerie**', embeds: [e] }); livre = true; }
  } catch (err) { console.log('⚠️ ruptures-armurerie salon:', err.message); }
  if (!livre) {
    try { const u = await client.users.fetch(FONDATEUR_ID).catch(() => null); if (u) { await u.send({ content: '📦 **Point stock de l\'armurerie** — *salon introuvable.*', embeds: [e] }); livre = true; } }
    catch (err) { console.log('⚠️ ruptures-armurerie MP:', err.message); }
  }
  return { ok: true, envoye: livre, ruptures: ruptures.length, bas: bas.length };
}

module.exports = { verifierRupturesArmurerie };
