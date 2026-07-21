"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { iaTexte } from "@/lib/ia";

// Briefing du jour : l'IA rédige un court point de situation du poste de
// commandement à partir des VRAIES données (opérations, contrats, absents,
// rendez-vous à traiter, coffre). À la demande (pas à chaque chargement).
export async function genererBriefingDuJour(): Promise<{ ok: boolean; texte?: string; error?: string }> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service indisponible." };
  const s = (v: unknown) => String(v ?? "").trim();
  const [opsR, coR, memR, rdvR, cofR] = await Promise.all([
    admin.from("Operation").select("cible,categorie,phase").limit(200),
    admin.from("Contrat").select("cible,statut,pole").limit(200),
    admin.from("Membre").select("nomIC,statut,absence").limit(300),
    admin.from("Rdv").select("nomRP,statut,creneau").neq("statut", "cloture").limit(200),
    admin.from("Coffre").select("id,solde"),
  ]);
  const ops = (opsR.data || []) as Record<string, unknown>[];
  const contrats = (coR.data || []) as Record<string, unknown>[];
  const membres = (memR.data || []) as Record<string, unknown>[];
  const rdvs = (rdvR.data || []) as Record<string, unknown>[];
  const coffre = (id: string) => (cofR.data || []).find((c: { id: string }) => c.id === id) as { solde?: number } | undefined;

  const opsActives = ops.filter((o) => ["preparation", "en_cours"].includes(s(o.phase)));
  const contratsAttente = contrats.filter((c) => /attente|nouveau/i.test(s(c.statut)));
  const absents = membres.filter((m) => s(m.statut) === "absent").map((m) => {
    const a = (m.absence && typeof m.absence === "object") ? (m.absence as Record<string, unknown>) : null;
    return `${s(m.nomIC)}${a?.jusqu ? ` (retour ${s(a.jusqu).slice(0, 10)})` : ""}`;
  });
  const rdvsATraiter = rdvs.filter((r) => /nouveau|confirme/i.test(s(r.statut)));

  const faits = {
    coffreCommun: coffre("coffre_commun")?.solde ?? null,
    opsActives: opsActives.map((o) => `${s(o.cible)} [${s(o.phase)}]`).slice(0, 15),
    contratsEnAttente: contratsAttente.map((c) => s(c.cible)).slice(0, 15),
    absents: absents.slice(0, 20),
    rendezVousATraiter: rdvsATraiter.map((r) => `${s(r.nomRP)}${r.creneau ? ` — ${s(r.creneau)}` : ""}`).slice(0, 15),
    effectif: membres.filter((m) => s(m.statut) !== "parti").length,
  };
  const system = "Tu es le second du poste de commandement de la Iron Wolf Company (western RP). Rédige un BRIEFING DU JOUR en français : 4 à 6 lignes, ton posé et militaire, qui dégage les priorités du jour (opérations en cours, contrats à traiter, absences à couvrir, rendez-vous à honorer). Base-toi UNIQUEMENT sur les faits fournis. N'invente aucun chiffre ni nom. Si tout est calme, dis-le sobrement.";
  const r = await iaTexte(system, `FAITS DU JOUR :\n${JSON.stringify(faits)}\n\nRédige le briefing.`, 600);
  return r.ok ? { ok: true, texte: r.texte } : { ok: false, error: r.error };
}
