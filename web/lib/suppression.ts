import { createAdminClient } from "@/lib/supabase/admin";
import { envoyerCommande, type CommandeResult } from "@/lib/commandes";

// Suppression FIABLE d'un élément géré par le bot (tables réconciliées côté
// bot → une suppression « fire-and-forget » revient toute seule).
//   1. On ATTEND le verdict du bot : il retire l'élément de SES données, sinon
//      la réconciliation le ré-ajouterait à la prochaine synchro.
//   2. On retire AUSSI la ligne directement en base → disparition immédiate du
//      site, même si le bot est momentanément désynchronisé (Render éphémère).
export async function supprimerFiable(opts: {
  type: string;                       // ex. "operation.delete"
  payload: Record<string, unknown>;   // ex. { id } ou { membreId }
  table: string;                      // ex. "Operation"
  colonne: string;                    // ex. "id" ou "membreId"
  valeur: string;                     // la valeur à faire correspondre
  okMsg: string;
}): Promise<CommandeResult> {
  const v = String(opts.valeur || "").trim();
  if (!v) return { ok: false, error: "Élément introuvable." };
  const r = await envoyerCommande(opts.type, opts.payload, { attendre: true, timeoutMs: 12000 });
  try {
    const admin = createAdminClient();
    if (admin) await admin.from(opts.table).delete().eq(opts.colonne, v);
  } catch { /* best-effort : le bot a déjà retiré l'élément de ses données */ }
  return { ok: true, message: r.ok ? (r.message || opts.okMsg) : opts.okMsg };
}
