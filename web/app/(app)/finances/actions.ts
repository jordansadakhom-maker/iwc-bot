"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { createAdminClient } from "@/lib/supabase/admin";
import { supprimerFiable } from "@/lib/suppression";
import { round2 } from "@/lib/format";

// Ajuste un coffre (dépôt / retrait / montant exact).
// Double écriture : 1) reflet INSTANTANÉ dans la table Coffre (le site montre le
// nouveau solde tout de suite) ; 2) commande filée au bot, qui reste la SOURCE DE
// VÉRITÉ (data.json) et re-pousse le coffre à sa prochaine synchro — il confirme
// ou corrige le reflet. « Ne rien dérégler » : le bot a toujours le dernier mot.
export async function ajusterCoffre(
  cible: "commun" | "legal" | "illegal",
  montant: number,
  mode: "depot" | "retrait" | "set"
): Promise<CommandeResult & { solde?: number }> {
  if (!["commun", "legal", "illegal"].includes(cible)) return { ok: false, error: "Coffre inconnu." };
  if (!Number.isFinite(montant) || montant < 0) return { ok: false, error: "Montant invalide." };
  const m = round2(montant);

  // 1) Reflet instantané dans la table Coffre (service role → contourne RLS).
  let solde: number | undefined;
  const admin = createAdminClient();
  if (admin) {
    try {
      const id = cible === "commun" ? "coffre_commun" : cible === "legal" ? "coffre_legal" : "coffre_illegal";
      const pole = cible === "commun" ? "both" : cible;
      const { data } = await admin.from("Coffre").select("solde").eq("id", id).maybeSingle();
      const actuel = data ? Number((data as { solde: number }).solde) || 0 : 0;
      solde = Math.max(0, mode === "set" ? m : mode === "retrait" ? actuel - m : actuel + m);
      await admin.from("Coffre").upsert({ id, pole, solde, seuilAlerte: 0, updatedAt: new Date().toISOString() }, { onConflict: "id" });
    } catch { solde = undefined; }
  }

  // 2) Commande filée au bot (source de vérité).
  const r = await envoyerCommande("coffre.ajuster", { cible, montant: m, mode });
  if (!r.ok) return r;
  return { ok: true, solde };
}

// ── Factures ──
export async function creerFacture(data: { objet: string; montant: number; clientNom?: string; type?: string; remuneration?: string }): Promise<CommandeResult> {
  if (!data.objet || data.objet.trim().length < 2) return { ok: false, error: "Indique l'objet de la facture." };
  if (!Number.isFinite(data.montant) || data.montant < 0) return { ok: false, error: "Montant invalide." };
  return envoyerCommande("facture.create", { ...data, montant: Math.round(data.montant) });
}
export async function supprimerFacture(id: string): Promise<CommandeResult> {
  return supprimerFiable({ type: "facture.delete", payload: { id }, table: "Facture", colonne: "id", valeur: id, okMsg: "Facture supprimée." });
}

// ── Portefeuilles perso ──
// Payer un autre membre (l'émetteur = le membre connecté, résolu côté bot).
export async function payerMembre(membreId: string, versNom: string, montant: number, raison: string): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Choisis un destinataire." };
  const m = Math.round(Number(montant) || 0);
  if (m <= 0) return { ok: false, error: "Montant invalide." };
  return envoyerCommande("wallet.payer", { membreId, versNom, montant: m, raison: (raison || "").slice(0, 120) });
}
// Créditer / débiter un portefeuille (Direction).
export async function ajusterArgent(membreId: string, montant: number, raison: string): Promise<CommandeResult> {
  if (!membreId) return { ok: false, error: "Choisis un membre." };
  const m = Math.round(Number(montant) || 0);
  if (!m) return { ok: false, error: "Montant nul." };
  return envoyerCommande("wallet.ajuster", { membreId, montant: m, raison: (raison || "").slice(0, 120) });
}
