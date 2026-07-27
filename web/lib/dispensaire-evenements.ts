import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Émission d'un ÉVÉNEMENT dans le journal unique « DispensaireEvent » (source de
// vérité). Un trigger SQL (dispensaire_audit_from_event) le projette dans
// « DispensaireActivityLog » (journal d'audit lisible : qui / quand / avant → après).
//
// BEST-EFFORT ABSOLU : ne jette jamais, no-op si la table n'existe pas encore
// (SQL dispensaire-event-socle.sql non lancé) ou en cas d'erreur — le journal ne
// doit JAMAIS bloquer l'action métier qui l'émet.

export type EvenementDispensaireInput = {
  aggregate: string;                 // domaine : 'membre','grade','config','salarie'…
  type: string;                      // ex. 'membre.cree','grade.maj','salarie.supprime'
  cibleId?: string | null;
  cibleLibelle?: string | null;
  avant?: unknown;
  apres?: unknown;
  payload?: Record<string, unknown> | null;
  ref?: string | null;               // clé d'idempotence facultative
  priorite?: number;
};

// Identité de l'acteur (compte connecté) — pour tracer « par qui ». Lit le nom
// depuis la fiche DispensaireMembre si elle existe, sinon les métadonnées Discord.
async function acteur(): Promise<{ id: string | null; nom: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, nom: "Système" };
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let nom = String(meta.full_name || meta.name || meta.user_name || user.email || "Membre");
    const did = String(meta.provider_id || meta.sub || "");
    const admin = createAdminClient();
    if (did && admin) {
      const { data } = await admin.from("DispensaireMembre").select("nom").eq("identifiant", did).maybeSingle();
      if (data?.nom) nom = String(data.nom);
    }
    return { id: did || null, nom: nom.slice(0, 120) };
  } catch {
    return { id: null, nom: "Système" };
  }
}

// Lit une ligne par id (best-effort) pour capturer l'état « avant » d'un
// événement. Renvoie null si indisponible — le journal ne bloque jamais l'action.
export async function lireAvant(table: string, id: string): Promise<Record<string, unknown> | null> {
  const admin = createAdminClient();
  if (!admin || !id) return null;
  try { const { data } = await admin.from(table).select("*").eq("id", id).maybeSingle(); return (data as Record<string, unknown>) ?? null; } catch { return null; }
}

export async function emettreEvenementDispensaire(e: EvenementDispensaireInput): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const a = await acteur();
    await admin.from("DispensaireEvent").insert({
      id: crypto.randomUUID(),
      aggregate: e.aggregate,
      type: e.type,
      actorId: a.id,
      actorNom: a.nom,
      cibleId: e.cibleId ?? null,
      cibleLibelle: e.cibleLibelle ?? null,
      avant: e.avant ?? null,
      apres: e.apres ?? null,
      payload: e.payload ?? null,
      ref: e.ref ?? null,
      priorite: e.priorite ?? 0,
    });
  } catch {
    /* best-effort : le journal ne bloque jamais l'action métier */
  }
}

// ── Lecture du journal d'audit (projection lisible) ──────────────────────────
export type AuditEntree = {
  id: string; module: string; action: string; cible: string | null; cibleId: string | null;
  avant: unknown; apres: unknown; par: string | null; at: string;
};

// Renvoie les dernières entrées d'audit (best-effort : [] si le socle n'est pas
// encore en place). `module` filtre facultativement sur un domaine.
export async function getJournalAudit(opts?: { limit?: number; module?: string }): Promise<{ pret: boolean; entrees: AuditEntree[] }> {
  const admin = createAdminClient();
  if (!admin) return { pret: false, entrees: [] };
  try {
    let req = admin.from("DispensaireActivityLog").select("id,module,action,cible,cibleId,avant,apres,par,at").order("at", { ascending: false }).limit(Math.min(500, Math.max(1, opts?.limit ?? 200)));
    if (opts?.module) req = req.eq("module", opts.module);
    const { data, error } = await req;
    if (error) return { pret: false, entrees: [] };
    const entrees: AuditEntree[] = ((data || []) as Record<string, unknown>[]).map((r) => ({
      id: String(r.id), module: String(r.module || ""), action: String(r.action || ""),
      cible: r.cible == null ? null : String(r.cible), cibleId: r.cibleId == null ? null : String(r.cibleId),
      avant: r.avant ?? null, apres: r.apres ?? null, par: r.par == null ? null : String(r.par), at: String(r.at),
    }));
    return { pret: true, entrees };
  } catch {
    return { pret: false, entrees: [] };
  }
}
