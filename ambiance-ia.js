// ═══════════════════════════════════════════════════════════════
// ambiance-ia.js — Répliques à DIRE À VOIX HAUTE en jeu (RedM, chat vocal de
// proximité) pour garder la scène vivante à une table de jeu. Générées par IA
// (Claude Haiku) selon la situation ; repli sur un pool statique si l'IA est
// absente/lente/en erreur → JAMAIS de plantage. Ce sont des PAROLES (pas du /me).
// ═══════════════════════════════════════════════════════════════

// Repli statique par situation (paroles crédibles d'un saloon ~1900).
const POOL = {
  croupier: [
    'Faites vos jeux, m\'sieurs-dames. La maison n\'attend personne.',
    'Rien ne va plus. Qu\'le sort tranche, à présent.',
    'La banque paie ses dettes… et réclame les siennes, croyez-moi.',
    'Approchez, approchez. Les cartes ne mordent pas — les joueurs, si.',
  ],
  tour: [
    'Laisse-moi réfléchir une seconde… on joue gros, ce soir.',
    'Doucement, doucement. J\'ai tout mon temps, moi.',
    'Bon. Voyons c\'que le destin m\'a réservé.',
  ],
  gagne: [
    'Ha ! La chance a fini par me sourire, pour une fois.',
    'Ramassez, ramassez. C\'est ma tournée après ça.',
    'Qu\'est-ce que j\'vous disais ? Faut jamais douter d\'un vieux renard.',
  ],
  perd: [
    'Bon sang… j\'ai tiré un peu trop sur la corde, là.',
    'La maison a le bras long, ce soir. J\'en aurai un autre.',
    'Pfff. Une main de plus et j\'les avais. Une seule.',
  ],
  bluff: [
    'J\'vous laisse deviner si j\'dis vrai. Ça vous coûtera d\'aller voir.',
    'Un homme honnête n\'a rien à cacher… alors regardez-moi bien dans les yeux.',
    'Sûr de moi ? Comme jamais. Ou peut-être pas. À vous de trancher.',
  ],
  attente: [
    'À toi de voir, l\'ami. Moi j\'bouge pas d\'ici.',
    'J\'attends. Prends ton temps, la nuit est longue.',
  ],
  general: [
    'Belle soirée pour tenter le diable, pas vrai ?',
    'Une partie honnête vaut mieux qu\'un coup de feu. Enfin… presque.',
    'Sers-moi un autre verre, on n\'a pas fini de jouer.',
  ],
};
function _pick(a) { return a[Math.floor(Math.random() * a.length)]; }
function _fallback(situation, role) {
  if (role === 'croupier' || role === 'banquier') return _pick(POOL.croupier);
  return _pick(POOL[situation] || POOL.general);
}

// Génère UNE réplique parlée via l'IA (repli pool si indispo). Renvoie toujours une string.
async function repliqueVocale({ jeu, role, situation, detail } = {}) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  const secours = _fallback(situation, role);
  if (!apiKey) return secours;
  try {
    const qui = (role === 'croupier') ? 'le croupier de la maison' : (role === 'banquier') ? 'le banquier qui tient la table' : 'un joueur assis à la table';
    const prompt = `Jeu de rôle Far West (RedM / Red Dead Redemption 2), Ouest américain vers 1899-1904, dans un saloon. Un joueur va PARLER À VOIX HAUTE en jeu (chat vocal de proximité) pour animer la scène.
Donne UNE réplique COURTE (une phrase, deux au maximum) que ${qui} prononcerait À VOIX HAUTE, en français, ton western crédible et imagé de l'époque.
CONTEXTE : jeu = ${jeu || 'table de jeu'} ; situation = ${situation || 'ambiance générale'}${detail ? ' ; détail = ' + detail : ''}.
RÈGLES STRICTES : ce sont des PAROLES prononcées, PAS une action, donc PAS de "/me", PAS de "/do", PAS de description entre astérisques. Aucun emoji. Aucun anachronisme (rien de moderne). Réponds UNIQUEMENT par la réplique, sans guillemets ni commentaire.`;
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 160, messages: [{ role: 'user', content: prompt }] }),
    });
    if (!resp.ok) return secours;
    const data = await resp.json();
    let txt = (data?.content || []).filter(b => b.type === 'text').map(b => b.text).join('').trim();
    txt = txt.replace(/^["«»*\s]+|["«»*\s]+$/g, '').replace(/^\/(me|do)\b.*/i, '').trim();
    return txt && txt.length > 1 ? txt.slice(0, 300) : secours;
  } catch (e) { console.log('⚠️ ambiance-ia:', e.message); return secours; }
}

module.exports = { repliqueVocale };
