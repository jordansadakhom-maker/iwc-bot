"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { DISP_DIRECTION, aPermDirection } from "@/lib/dispensaire-nav";

// Journalisation des ACCÈS aux modules sensibles (espace Direction) : ouverture
// (qui, quand, module) + durée à la fermeture. Best-effort, jamais bloquant.
export type AccesResult = { ok: boolean; id?: string };

function newId() { return `dac-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

// Enregistre l'ouverture d'un module Direction par le compte connecté. Ne
// journalise QUE si le compte a réellement le droit d'accéder à ce module.
export async function ouvrirAcces(module: string): Promise<AccesResult> {
  try {
    const tab = DISP_DIRECTION.find((t) => t.href === module);
    if (!tab) return { ok: false };
    const role = await getRoleDispensaire();
    if (!role.autorise || !aPermDirection(role.perms, tab.perm)) return { ok: false };
    const admin = createAdminClient();
    if (!admin) return { ok: false };
    const id = newId();
    const { error } = await admin.from("DispensaireAcces").insert({
      id, identifiant: role.identifiant, nom: role.nom, role: role.role,
      module: tab.href, moduleLabel: tab.label, ouvertAt: new Date().toISOString(),
    });
    return error ? { ok: false } : { ok: true, id };
  } catch { return { ok: false }; }
}

// Renseigne la durée de consultation à la fermeture / au changement de page.
export async function fermerAcces(id: string, dureeSec: number): Promise<{ ok: boolean }> {
  try {
    if (!id) return { ok: false };
    const admin = createAdminClient();
    if (!admin) return { ok: false };
    const d = Math.max(0, Math.min(86400, Math.round(Number(dureeSec) || 0)));
    await admin.from("DispensaireAcces").update({ dureeSec: d }).eq("id", id).is("dureeSec", null);
    return { ok: true };
  } catch { return { ok: false }; }
}
