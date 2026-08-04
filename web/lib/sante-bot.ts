import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

// ─────────────────────────────────────────────────────────────────────────────
// « Santé du bot » — diagnostic de la file de commandes site → bot (CommandeWeb).
// Le bot est la source de vérité : le site dépose des commandes, le bot les
// applique (~30 s) puis resynchronise. Si le bot décroche, les commandes
// s'accumulent au statut « nouveau » → cet écran le montre d'un coup d'œil.
// Lecture seule, clé service (RLS : seul le service_role lit CommandeWeb).
// ─────────────────────────────────────────────────────────────────────────────

export type CommandeLigne = {
  id: string;
  type: string;
  statut: string;
  resultat: string | null;
  auteurNom: string | null;
  createdAt: string;
};

export type SanteBot = {
  dispo: boolean;                    // table lisible (base joignable)
  enAttente: number;                 // commandes « nouveau »
  appliquees: number;                // commandes « applique »
  echecs: number;                    // commandes « echec »
  plusVieilleAttenteMs: number | null; // âge de la plus vieille commande en attente
  dernierTraitementAt: string | null;  // date de la dernière commande traitée (signe de vie)
  etat: "ok" | "traitement" | "arret" | "indispo"; // verdict global
  attente: CommandeLigne[];          // détail des commandes en attente (plus vieilles d'abord)
  echecsListe: CommandeLigne[];      // derniers échecs (plus récents d'abord)
};

// Au-delà de ce délai sans traitement, une commande « nouveau » signale un bot
// probablement à l'arrêt (le cycle normal est ~30 s → on laisse une marge large).
const SEUIL_ARRET_MS = 90_000;

const s = (v: unknown): string | null => (v == null ? null : String(v));

function ligne(r: Record<string, unknown>): CommandeLigne {
  return {
    id: String(r.id),
    type: String(r.type || "?"),
    statut: String(r.statut || "?"),
    resultat: s(r.resultat),
    auteurNom: s(r.auteurNom),
    createdAt: String(r.createdAt || ""),
  };
}

export async function getSanteBot(): Promise<SanteBot> {
  const vide: SanteBot = {
    dispo: false, enAttente: 0, appliquees: 0, echecs: 0,
    plusVieilleAttenteMs: null, dernierTraitementAt: null, etat: "indispo",
    attente: [], echecsListe: [],
  };
  const admin = createAdminClient();
  if (!admin) return vide;

  // Comptages (head:true → rapide, ne rapatrie pas les lignes).
  const [cAtt, cApp, cEch] = await Promise.all([
    admin.from("CommandeWeb").select("id", { count: "exact", head: true }).eq("statut", "nouveau"),
    admin.from("CommandeWeb").select("id", { count: "exact", head: true }).eq("statut", "applique"),
    admin.from("CommandeWeb").select("id", { count: "exact", head: true }).eq("statut", "echec"),
  ]);
  // Si même le premier comptage échoue (table absente/RLS), la base n'est pas prête.
  if (cAtt.error) return vide;

  // Détail : commandes en attente (plus vieilles d'abord) + derniers échecs +
  // dernière commande traitée (signe de vie du bot).
  const [att, ech, dernier] = await Promise.all([
    admin.from("CommandeWeb").select("id,type,statut,resultat,auteurNom,createdAt").eq("statut", "nouveau").order("createdAt", { ascending: true }).limit(50),
    admin.from("CommandeWeb").select("id,type,statut,resultat,auteurNom,createdAt").eq("statut", "echec").order("createdAt", { ascending: false }).limit(20),
    admin.from("CommandeWeb").select("createdAt").neq("statut", "nouveau").order("createdAt", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const attente = (att.data || []).map((r) => ligne(r as Record<string, unknown>));
  const echecsListe = (ech.data || []).map((r) => ligne(r as Record<string, unknown>));

  const now = Date.now();
  let plusVieilleAttenteMs: number | null = null;
  if (attente.length) {
    const t = Date.parse(attente[0].createdAt);
    if (!Number.isNaN(t)) plusVieilleAttenteMs = Math.max(0, now - t);
  }
  const dernierTraitementAt = (dernier.data as { createdAt?: string } | null)?.createdAt || null;

  const enAttente = cAtt.count ?? attente.length;
  const etat: SanteBot["etat"] =
    enAttente === 0 ? "ok"
    : plusVieilleAttenteMs != null && plusVieilleAttenteMs > SEUIL_ARRET_MS ? "arret"
    : "traitement";

  return {
    dispo: true,
    enAttente,
    appliquees: cApp.count ?? 0,
    echecs: cEch.count ?? 0,
    plusVieilleAttenteMs,
    dernierTraitementAt,
    etat,
    attente,
    echecsListe,
  };
}
