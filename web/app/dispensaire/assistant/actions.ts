"use server";

import { setEtatOverlay } from "@/lib/notif-etat";
import { TABLE_ETAT_DISPENSAIRE } from "@/lib/dispensaire-assistant";
import { getRoleDispensaire, peutFacturer } from "@/lib/dispensaire-roles";
import { createAdminClient } from "@/lib/supabase/admin";
import { terminerService } from "@/app/dispensaire/pointage/actions";
import { factureOuverte } from "@/lib/dispensaire-facturation-const";
import type { ActionConstatResult } from "@/lib/erp-assistant-const";

// Change l'état d'une notification du DISPENSAIRE (couche persistée).
// Gardé par la liste blanche : un compte non autorisé ne peut pas écrire
// (le layout protège l'affichage, pas l'appel direct à l'action).
export async function setEtatNotif(id: string, etat: string): Promise<{ ok: boolean; error?: string }> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  return setEtatOverlay(TABLE_ETAT_DISPENSAIRE, id, etat);
}

// Exécute l'action inline d'un constat du Dispensaire (« régler en 1 clic »).
// `ref` = cible facultative (ex. l'objet de la facture à relancer).
export async function executerConstat(kind: string, ref?: string): Promise<ActionConstatResult> {
  try { if (!(await getRoleDispensaire()).autorise) return { ok: false, error: "Accès refusé." }; } catch { return { ok: false, error: "Accès refusé." }; }
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  if (kind === "clore-pointages") {
    const iso12 = new Date(Date.now() - 12 * 3600000).toISOString();
    const { data } = await admin.from("DispensairePointage").select("id").is("fin", null).lt("debut", iso12);
    const ids = ((data as { id: string }[]) || []).map((r) => r.id);
    let n = 0; let lastErr: string | undefined;
    for (const id of ids) { const r = await terminerService(id); if (r.ok) n++; else lastErr = r.error; }
    if (n === 0 && ids.length) return { ok: false, error: lastErr || "Aucun service clôturé." };
    return { ok: true, message: `${n} service(s) clôturé(s).` };
  }
  if (kind === "relancer-facture") {
    // Droit dédié : seul un compte pouvant facturer peut relancer un impayé.
    if (!(await peutFacturer())) return { ok: false, error: "Droit de facturation requis." };
    const cible = (ref || "").trim();
    if (!cible) return { ok: false, error: "Facture cible manquante." };
    // Ne relance QUE les factures encore ouvertes et pas déjà « relancée ».
    const { data } = await admin.from("DispensaireFacture").select("id,statut").eq("objet", cible);
    const cibles = ((data as { id: string; statut: string }[]) || []).filter((f) => factureOuverte(f.statut) && f.statut !== "relancee");
    if (!cibles.length) return { ok: false, error: "Aucune facture ouverte à relancer pour cette cible." };
    let n = 0; let lastErr: string | undefined;
    for (const f of cibles) { const { error } = await admin.from("DispensaireFacture").update({ statut: "relancee" }).eq("id", f.id); if (error) lastErr = error.message; else n++; }
    if (n === 0) return { ok: false, error: lastErr || "Relance impossible." };
    return { ok: true, message: `${n} facture(s) marquée(s) « relancée ».` };
  }
  return { ok: false, error: "Action inconnue." };
}
