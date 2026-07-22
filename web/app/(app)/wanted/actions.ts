"use server";

import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { createAdminClient } from "@/lib/supabase/admin";
import { iaTexte } from "@/lib/ia";

type AvisInput = {
  cible: string; prime?: string; dangerosite?: string; statut?: string;
  position?: string; vivantMort?: string; commanditaire?: string; signalement?: string; photo?: string;
};

export async function emettreAvis(data: AvisInput): Promise<CommandeResult> {
  if (!data.cible || data.cible.trim().length < 2) return { ok: false, error: "Indique la cible de l'avis." };
  return envoyerCommande("traque.create", { ...data });
}
export async function majAvis(id: string, patch: Partial<AvisInput>): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Avis introuvable." };
  return envoyerCommande("traque.update", { id, ...patch });
}
export async function retirerAvis(id: string): Promise<CommandeResult> {
  const avisId = String(id || "").trim();
  if (!avisId) return { ok: false, error: "Avis introuvable." };
  // 1) Le bot retire la traque de SES données (source de vérité) + du Discord.
  //    On ATTEND son verdict pour un retrait réellement effectif.
  const r = await envoyerCommande("traque.delete", { id: avisId }, { attendre: true, timeoutMs: 12000 });
  // 2) Filet de sécurité : on retire AUSSI la ligne directement en base, tout de
  //    suite → l'avis disparaît du site immédiatement. Sans danger : le bot l'a
  //    déjà retirée de ses données (ou ne l'avait plus après un redéploiement),
  //    donc il ne la ré-ajoutera pas à la prochaine synchro.
  try { const admin = createAdminClient(); if (admin) await admin.from("Traque").delete().eq("id", avisId); } catch { /* best-effort */ }
  return { ok: true, message: r.ok ? (r.message || "Avis retiré.") : "Avis retiré du site." };
}

// Fiche cible IA : à partir des infos réelles de l'avis de recherche, l'IA rédige
// un profil, une estimation de dangerosité et des recommandations d'approche.
// N'invente aucun fait — enrichit seulement l'analyse à partir des indices.
export async function genererFicheCible(id: string): Promise<{ ok: boolean; texte?: string; error?: string }> {
  const avisId = String(id || "").trim();
  if (!avisId) return { ok: false, error: "Avis introuvable." };
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const { data, error } = await admin.from("Traque").select("*").eq("id", avisId).maybeSingle();
  if (error || !data) return { ok: false, error: "Avis introuvable." };
  const t = data as Record<string, unknown>;
  const s = (v: unknown) => String(v ?? "").trim();
  const faits: Record<string, string> = {
    "Cible": s(t.cible), "Prime": s(t.prime), "Dangerosité déclarée": s(t.dangerosite),
    "Mort ou vif": s(t.vivantMort), "Dernière position": s(t.position),
    "Commanditaire": s(t.commanditaire), "Signalement": s(t.signalement), "Statut": s(t.statut),
  };
  const bloc = Object.entries(faits).filter(([, v]) => v).map(([k, v]) => `${k} : ${v}`).join("\n") || "(peu d'indices — reste prudent et sobre)";
  const system = "Tu es l'officier de renseignement de la Iron Wolf Company (univers western RP). À partir des indices RÉELS d'un avis de recherche, rédige une FICHE DE CIBLE en français, structurée : 1) Profil (synthèse), 2) Niveau de dangerosité estimé + justification à partir des seuls indices, 3) Recommandations d'approche et de prudence pour les chasseurs. N'ajoute AUCUN fait inventé (pas de nom, lieu, arme non mentionnés) : tu raisonnes uniquement à partir des indices fournis. Reste concis et opérationnel.";
  const r = await iaTexte(system, `INDICES RÉELS :\n${bloc}\n\nRédige la fiche de cible.`, 900);
  return r.ok ? { ok: true, texte: r.texte } : { ok: false, error: r.error };
}
