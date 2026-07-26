"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Notation client PUBLIQUE (sans connexion) — le client note sa prestation après
// un rendez-vous. Écrit côté serveur (clé service) dans Rdv.satisfaction (TEXT,
// on y stocke un petit JSON) + une trace dans le fil pour l'équipe. Anti-spam
// (honeypot + délai). Un avis ne peut être déposé qu'une fois par rendez-vous.

export type AvisResult = { ok: boolean; error?: string };

export async function getAvisContexte(rdvId: string): Promise<{ trouve: boolean; nom: string | null; prestation: string | null; dejaNote: boolean }> {
  const vide = { trouve: false, nom: null, prestation: null, dejaNote: false };
  const admin = createAdminClient();
  const id = (rdvId || "").trim();
  if (!admin || !id) return vide;
  const { data, error } = await admin.from("Rdv").select("nomRP,type,satisfaction").eq("id", id).maybeSingle();
  if (error || !data) return vide;
  const r = data as { nomRP?: string | null; type?: string | null; satisfaction?: string | null };
  return { trouve: true, nom: r.nomRP || null, prestation: r.type || null, dejaNote: !!r.satisfaction };
}

export async function soumettreAvis(data: { rdvId: string; note: number; commentaire?: string; website?: string; ms?: number }): Promise<AvisResult> {
  // Honeypot + délai de remplissage (robots).
  if (data.website && data.website.trim()) return { ok: true };
  if (typeof data.ms === "number" && data.ms >= 0 && data.ms < 1200) return { ok: true };
  const rdvId = (data.rdvId || "").trim();
  const note = Math.round(Number(data.note) || 0);
  if (!rdvId) return { ok: false, error: "Lien invalide." };
  if (note < 1 || note > 5) return { ok: false, error: "Choisis une note de 1 à 5 étoiles." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible. Réessaie dans un instant." };
  const { data: row, error } = await admin.from("Rdv").select("satisfaction,paiement").eq("id", rdvId).maybeSingle();
  if (error || !row) return { ok: false, error: "Rendez-vous introuvable." };
  const r = row as { satisfaction?: string | null; paiement?: Record<string, unknown> | null };
  if (r.satisfaction) return { ok: false, error: "Un avis a déjà été enregistré pour ce rendez-vous — merci !" };
  const commentaire = (data.commentaire || "").trim().slice(0, 1000);
  const satisfaction = JSON.stringify({ note, commentaire: commentaire || null, at: new Date().toISOString() });
  // Trace dans le fil pour que l'équipe voie l'avis dans la modale du RDV.
  const paiement = (r.paiement && typeof r.paiement === "object" ? r.paiement : {}) as Record<string, unknown>;
  const reponses = Array.isArray(paiement.reponses) ? (paiement.reponses as unknown[]) : [];
  reponses.push({ texte: `⭐ Avis client : ${note}/5${commentaire ? ` — ${commentaire}` : ""}`, par: "Client", at: new Date().toISOString() });
  const { error: e2 } = await admin.from("Rdv").update({ satisfaction, paiement: { ...paiement, reponses } }).eq("id", rdvId);
  if (e2) { console.error("soumettreAvis:", e2.message); return { ok: false, error: "Enregistrement impossible. Réessaie." }; }
  return { ok: true };
}
