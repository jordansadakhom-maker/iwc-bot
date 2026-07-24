"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getRoleDispensaire } from "@/lib/dispensaire-roles";
import { jourParis } from "@/lib/dispensaire-consignes";

// Enregistre la consigne du jour (sauvegarde auto). Réservé aux responsables
// (RH / factures / admin). Journalise chaque enregistrement pour l'historique.
export async function enregistrerConsigne(texte: string): Promise<{ ok: boolean; error?: string; at?: string; par?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible." };
  let role;
  try { role = await getRoleDispensaire(); } catch { return { ok: false, error: "Accès refusé." }; }
  if (!role.autorise) return { ok: false, error: "Accès refusé." };
  if (!(role.perms.rh || role.perms.factures || role.perms.admin)) return { ok: false, error: "Réservé aux responsables du dispensaire." };

  const jour = jourParis();
  const t = String(texte ?? "").slice(0, 4000);
  const par = role.nom || "Équipe";
  const now = new Date().toISOString();

  try {
    const { data: ex } = await admin.from("DispensaireConsigne").select("jour").eq("jour", jour).maybeSingle();
    if (ex) {
      const { error } = await admin.from("DispensaireConsigne").update({ texte: t, updatedBy: par, updatedAt: now }).eq("jour", jour);
      if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-consignes.sql ?)." };
    } else {
      const { error } = await admin.from("DispensaireConsigne").insert({ jour, texte: t, createdBy: par, createdAt: now, updatedBy: par, updatedAt: now });
      if (error) return { ok: false, error: "Enregistrement impossible (lance dispensaire-consignes.sql ?)." };
    }
    // Journalise (best-effort — n'échoue pas l'enregistrement si la table de log manque).
    try { await admin.from("DispensaireConsigneLog").insert({ id: `dcl-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, jour, texte: t, par, at: now }); } catch { /* log optionnel */ }
    return { ok: true, at: now, par };
  } catch { return { ok: false, error: "Enregistrement impossible." }; }
}
