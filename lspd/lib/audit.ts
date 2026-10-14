import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/rbac";
import { newId } from "@/lib/ids";

// Journal d'audit — trace les actions sensibles (qui, quand, quoi, avant/après).
// Non modifiable par les utilisateurs (écrit uniquement via la clé service_role).
// Best-effort : une panne du journal ne doit jamais bloquer l'action métier.
export async function logAudit(input: {
  aggregate: string; // ex. "agent", "intervention", "armurerie"
  type: string; // ex. "agent.cree", "intervention.cloturee"
  cibleId?: string | null;
  cibleLibelle?: string | null;
  avant?: unknown;
  apres?: unknown;
  payload?: unknown;
}): Promise<void> {
  try {
    const admin = createAdminClient();
    if (!admin) return;
    const a = await getActeur();
    await admin.from("LspdAudit").insert({
      id: newId("aud"),
      aggregate: input.aggregate,
      type: input.type,
      cibleId: input.cibleId ?? null,
      cibleLibelle: input.cibleLibelle ?? null,
      avant: input.avant ?? null,
      apres: input.apres ?? null,
      payload: input.payload ?? null,
      parNom: a.nom,
      parId: a.discordId,
      createdAt: new Date().toISOString(),
    });
  } catch {
    /* le journal ne bloque jamais l'action métier */
  }
}
