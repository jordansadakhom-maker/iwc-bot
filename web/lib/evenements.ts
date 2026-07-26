import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Émission d'un ÉVÉNEMENT dans le journal unique "Event" (source de vérité).
// Un trigger SQL (audit_from_event) le projette dans "ActivityLog".
//
// BEST-EFFORT ABSOLU : ne jette jamais, no-op si la table n'existe pas encore
// (SQL event-socle.sql non lancé) ou en cas d'erreur — le journal ne doit
// JAMAIS bloquer l'action métier qui l'émet.

export type EvenementInput = {
  aggregate: string;                 // domaine : 'contrat','rdv','coffre','membre'…
  type: string;                      // ex. 'contrat.supprime','coffre.ajuste'
  cibleId?: string | null;
  cibleLibelle?: string | null;
  avant?: unknown;
  apres?: unknown;
  payload?: Record<string, unknown> | null;
  pole?: string | null;
  roleCible?: string | null;
  membreId?: string | null;
  priorite?: number;
  ref?: string | null;
};

// Identité de l'acteur (membre connecté) — pour tracer « par qui ».
async function acteur(): Promise<{ id: string | null; nom: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { id: null, nom: "Système" };
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let nom = (meta.full_name || meta.name || meta.user_name || "Membre") as string;
    const did = String(meta.provider_id || meta.sub || "");
    const admin = createAdminClient();
    if (did && admin) {
      const { data } = await admin.from("Membre").select("nomIC").eq("id", did).maybeSingle();
      if (data?.nomIC) nom = data.nomIC as string;
    }
    return { id: did || null, nom: String(nom).slice(0, 120) };
  } catch {
    return { id: null, nom: "Système" };
  }
}

export async function emettreEvenement(e: EvenementInput): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const a = await acteur();
    await admin.from("Event").insert({
      id: crypto.randomUUID(),
      aggregate: e.aggregate,
      type: e.type,
      actorId: a.id,
      actorNom: a.nom,
      cibleId: e.cibleId ?? null,
      cibleLibelle: e.cibleLibelle ?? null,
      pole: e.pole ?? null,
      roleCible: e.roleCible ?? null,
      membreId: e.membreId ?? null,
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
