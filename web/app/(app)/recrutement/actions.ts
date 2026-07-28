"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { getActeur } from "@/lib/authz";
import { emettreEvenement } from "@/lib/evenements";

// Gestion des candidatures (recrutement). Table site-native Candidature :
// écrite directement via la clé service, jamais réconciliée par le bot.
//
// SÉCURITÉ (fail-closed) : traiter une candidature (statut, notes, suppression)
// est réservé à l'encadrement (officiers / direction) — avant, n'importe quel
// compte connecté pouvait accepter/refuser/supprimer (trou relevé à l'audit).

export type CandResult = { ok: boolean; error?: string };
const s = (v: unknown, max = 2000): string | null => { const t = String(v ?? "").trim(); return t ? t.slice(0, max) : null; };
const STATUTS = ["nouveau", "entretien", "accepte", "refuse"];
function newId(p: string) { return `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`; }

export async function majStatutCandidature(id: string, statut: string): Promise<CandResult> {
  if (!id) return { ok: false, error: "Candidature introuvable." };
  if (!STATUTS.includes(statut)) return { ok: false, error: "Statut inconnu." };
  const acteur = await getActeur();
  if (!acteur || !acteur.officier) return { ok: false, error: "Action réservée aux officiers et à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data: avant } = await admin.from("Candidature").select("nomRP,statut").eq("id", id).maybeSingle();
  const ancienStatut = String(avant?.statut || "");
  if (ancienStatut === statut) return { ok: true }; // pas de changement réel
  const { error } = await admin.from("Candidature").update({ statut, updatedAt: new Date().toISOString() }).eq("id", id);
  if (error) return { ok: false, error: "Enregistrement impossible." };

  const nomCand = String(avant?.nomRP || "Candidat");
  await emettreEvenement({
    aggregate: "candidature", type: "candidature.statut", cibleId: id, cibleLibelle: nomCand,
    avant: { statut: ancienStatut }, apres: { statut }, payload: { par: acteur.nomIC },
  });
  // Décision (acceptée / refusée) → notifie l'encadrement au centre de notifications.
  if (statut === "accepte" || statut === "refuse") {
    try {
      await admin.from("Notification").insert({
        id: newId("ntf"), type: "candidature-statut",
        titre: `Candidature ${statut === "accepte" ? "acceptée" : "refusée"} — ${nomCand}`,
        corps: `Par ${acteur.nomIC}`, lien: "/recrutement", cibleId: id,
        roleCible: "officier", membreId: null, ref: `cand-statut-${id}-${statut}`, lu: false,
      });
    } catch { /* best-effort */ }
  }
  return { ok: true };
}

export async function majNotesCandidature(id: string, notes: string): Promise<CandResult> {
  if (!id) return { ok: false, error: "Candidature introuvable." };
  const acteur = await getActeur();
  if (!acteur || !acteur.officier) return { ok: false, error: "Action réservée aux officiers et à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { error } = await admin.from("Candidature").update({ notes: s(notes, 2000), updatedAt: new Date().toISOString() }).eq("id", id);
  return error ? { ok: false, error: "Enregistrement impossible." } : { ok: true };
}

export async function supprimerCandidature(id: string): Promise<CandResult> {
  const acteur = await getActeur();
  if (!acteur || !acteur.officier) return { ok: false, error: "Action réservée aux officiers et à la direction." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  // Instantané avant suppression → trace au journal (base d'une restauration future).
  const { data: avant } = await admin.from("Candidature").select("*").eq("id", id).maybeSingle();
  const { error } = await admin.from("Candidature").delete().eq("id", id);
  if (error) return { ok: false, error: "Suppression impossible." };
  await emettreEvenement({
    aggregate: "candidature", type: "candidature.suppression", cibleId: id,
    cibleLibelle: String((avant as Record<string, unknown> | null)?.nomRP || "Candidat"),
    avant: (avant as Record<string, unknown> | null) ?? null, payload: { par: acteur.nomIC },
  });
  return { ok: true };
}
