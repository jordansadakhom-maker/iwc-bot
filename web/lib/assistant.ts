import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// Assistant IA du poste de commandement : transforme un ordre en langage naturel
// en une liste d'ACTIONS (commandes CRUD) à confirmer puis exécuter via la file
// CommandeWeb. Aucune donnée inventée : l'IA travaille sur le CONTEXTE réel lu
// depuis Supabase et ne peut produire que des types d'action connus.

export type Action = { type: string; payload: Record<string, unknown>; description: string };
export type Interpretation = { ok: boolean; resume?: string; actions?: Action[]; questions?: string[]; error?: string };

// Types d'action autorisés (doivent exister dans le dispatcher du bot).
export const TYPES_AUTORISES = new Set([
  "operation.create", "operation.update", "operation.delete",
  "contrat.create", "contrat.update", "contrat.delete",
  "coffre.ajuster",
  "medical.create", "medical.update", "medical.addBlessure", "medical.addOrdonnance", "medical.delete",
  "rapport.create", "rapport.update", "rapport.delete",
  "traque.create", "traque.update", "traque.delete",
  "contact.update", "contact.delete",
]);

const SYSTEM = `Tu es l'assistant du POSTE DE COMMANDEMENT d'une compagnie de jeu de rôle western (RedM, ~1899). Deux pôles : « Iron Wolf » (légal) et « La Confrérie » (illégal). Le Fondateur te donne des ordres en langage naturel ; tu les traduis en ACTIONS structurées que le système exécutera.

Tu disposes d'un CONTEXTE (listes réelles avec identifiants). Sers-t'en pour résoudre les noms en identifiants. N'invente JAMAIS d'identifiant, de nom, de montant ni de donnée. Si une cible est introuvable ou ambiguë, N'AGIS PAS : pose la question dans "questions".

ACTIONS DISPONIBLES (type + payload) :
- operation.create { cible, categorie?, pole?(legal|illegal), prime?, lieu?, objectif?, phase?(preparation|en_cours|terminee|annulee) }
- operation.update { id, cible?, categorie?, prime?, phase? }
- operation.delete { id }
- contrat.create { cible, commanditaire?, remuneration?, statut?(en_attente|valide|signe|termine|annule|refuse), pole?(legal|illegal) }
- contrat.update { id, cible?, commanditaire?, remuneration?, statut?, pole? }
- contrat.delete { id }
- coffre.ajuster { cible(commun|legal|illegal), montant(nombre), mode(depot|retrait|set) }
- medical.create { membreId, statut?(apte|observation|inapte|non_teste) }
- medical.update { membreId, statut?, notes?, prochainRdv? }
- medical.addBlessure { membreId, desc, localisation?, gravite? }
- medical.addOrdonnance { membreId, medicaments, posologie?, duree? }
- medical.delete { membreId }
- rapport.create { info, source?, cible?, fiabilite?(0-5), statut? }
- rapport.update { id, info?, source?, cible?, fiabilite?, statut? }
- rapport.delete { id }
- traque.create { cible, prime?, dangerosite?, statut?(chasse|capturee|eliminee|abandonnee) }
- traque.update { id, cible?, prime?, dangerosite?, statut? }
- traque.delete { id }
- contact.update { id, nom?, type?, telegramme?, metier?, secteur?, affiliation?, relation?, statutRP?, notes?, fiabilite? }
- contact.delete { id }

Pour le médical, "membreId" est l'identifiant du membre (voir contexte.membres).

RÉPONDS STRICTEMENT EN JSON, sans aucun texte autour :
{
 "resume": "une phrase résumant ce que tu vas faire",
 "actions": [ { "type": "...", "payload": { ... }, "description": "phrase lisible en français décrivant précisément l'action" } ],
 "questions": [ "question si quelque chose est ambigu, manquant ou introuvable" ]
}
Si l'instruction ne correspond à aucune action possible, renvoie "actions": [] et explique pourquoi dans "questions".`;

type Ctx = Record<string, unknown>;

// Construit un contexte compact des données réelles pour que l'IA résolve les références.
export async function construireContexte(): Promise<Ctx> {
  const admin = createAdminClient();
  if (!admin) return {};
  const [opsR, coR, cofR, memR, conR, medR] = await Promise.all([
    admin.from("Operation").select("id,cible,categorie,phase").limit(80),
    admin.from("Contrat").select("id,cible,statut,pole").limit(80),
    admin.from("Coffre").select("id,solde"),
    admin.from("Membre").select("id,nomIC").limit(80),
    admin.from("Contact").select("id,nom,type").order("nom").limit(200),
    admin.from("DossierMedical").select("id,membreId,statut").limit(80),
  ]);
  const coffre = (id: string) => (cofR.data || []).find((c: { id: string; solde: number }) => c.id === id)?.solde ?? null;
  const noms = new Map<string, string>();
  for (const m of (memR.data || []) as { id: string; nomIC: string }[]) noms.set(String(m.id), m.nomIC);
  return {
    coffres: { commun: coffre("coffre_commun"), legal: coffre("coffre_legal"), illegal: coffre("coffre_illegal") },
    operations: ((opsR.data || []) as { id: string; cible: string; categorie: string; phase: string }[]).map((o) => ({ id: o.id, titre: o.cible, type: o.categorie, phase: o.phase })),
    contrats: ((coR.data || []) as { id: string; cible: string; statut: string; pole: string }[]).map((c) => ({ id: c.id, objet: c.cible, statut: c.statut, pole: c.pole })),
    membres: ((memR.data || []) as { id: string; nomIC: string }[]).map((m) => ({ id: m.id, nom: m.nomIC })),
    contacts: ((conR.data || []) as { id: string; nom: string; type: string }[]).map((c) => ({ id: c.id, nom: c.nom, type: c.type })),
    dossiers: ((medR.data || []) as { membreId: string; statut: string }[]).map((d) => ({ membreId: d.membreId, nom: noms.get(String(d.membreId)) || d.membreId, statut: d.statut })),
  };
}

// Parse + valide la réponse de l'IA (fonction pure, testable).
export function parseReponse(txt: string): Interpretation {
  let clean = String(txt || "").trim();
  clean = clean.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/```\s*$/i, "").trim();
  let data: unknown;
  try { data = JSON.parse(clean); } catch { return { ok: false, error: "Réponse de l'IA illisible. Reformule ton ordre." }; }
  const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  const rawActions = Array.isArray(obj.actions) ? obj.actions : [];
  const actions: Action[] = [];
  for (const a of rawActions) {
    const o = (a && typeof a === "object" ? a : {}) as Record<string, unknown>;
    const type = String(o.type || "");
    if (!TYPES_AUTORISES.has(type)) continue; // n'exécute que des types connus
    const payload = (o.payload && typeof o.payload === "object" ? o.payload : {}) as Record<string, unknown>;
    actions.push({ type, payload, description: String(o.description || type) });
  }
  const questions = Array.isArray(obj.questions) ? obj.questions.map(String).filter(Boolean) : [];
  return { ok: true, resume: obj.resume ? String(obj.resume) : undefined, actions, questions };
}

// Appelle l'IA pour interpréter une instruction dans le contexte donné.
export async function interpreter(instruction: string, contexte: Ctx): Promise<Interpretation> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, error: "L'assistant IA n'est pas encore activé (ajoute la variable ANTHROPIC_API_KEY sur Vercel)." };
  const prompt = `CONTEXTE (données réelles actuelles) :\n${JSON.stringify(contexte)}\n\nORDRE DU FONDATEUR :\n${instruction}\n\nProduis le JSON demandé.`;
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-sonnet-5", max_tokens: 1800, system: SYSTEM, messages: [{ role: "user", content: prompt }] }),
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      console.error("assistant interpreter:", res.status, t.slice(0, 200));
      return { ok: false, error: "L'assistant est momentanément indisponible. Réessaie dans un instant." };
    }
    const data = await res.json();
    const txt = (data?.content || []).filter((b: { type: string }) => b.type === "text").map((b: { text: string }) => b.text).join("");
    return parseReponse(txt);
  } catch (e) {
    console.error("assistant interpreter:", (e as Error).message);
    return { ok: false, error: "L'assistant est injoignable pour le moment." };
  }
}
