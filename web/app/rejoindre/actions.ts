"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Enregistre une candidature déposée depuis la page PUBLIQUE /rejoindre
// (sans connexion). Écrit côté serveur (clé service) dans Candidature. Le bot
// relève les nouvelles candidatures (notifieDiscord = false) et prévient l'équipe.

export type CandInput = {
  nomRP: string; age?: string; moyen?: string; contact: string;
  experience?: string; motivation: string; disponibilites?: string;
  source?: string; // « comment nous as-tu connus ? »
  website?: string; // honeypot
  ms?: number; // temps de remplissage (anti-robot)
};
export type CandResult = { ok: boolean; error?: string; ref?: string };

// N° de dossier public : court, lisible, sans caractères ambigus (ni I, O, 0, 1).
// Sert de jeton pour la page de suivi /candidature/<ref> (aucune connexion).
function refCandidature(): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(6));
  let s = "";
  for (const b of bytes) s += A[b % A.length];
  return `IWC-${s}`;
}

export async function envoyerCandidature(data: CandInput): Promise<CandResult> {
  if (data.website && data.website.trim()) return { ok: true }; // honeypot
  if (typeof data.ms === "number" && data.ms >= 0 && data.ms < 1500) return { ok: true }; // rempli trop vite = robot

  const nomRP = (data.nomRP || "").trim();
  const contact = (data.contact || "").trim();
  const motivation = (data.motivation || "").trim();
  if (nomRP.length < 2) return { ok: false, error: "Indique ton nom RP." };
  if (contact.length < 2) return { ok: false, error: "Indique un moyen de te contacter." };
  if (motivation.length < 3) return { ok: false, error: "Dis-nous pourquoi tu veux nous rejoindre." };
  if ((nomRP + motivation + contact + (data.experience || "")).length > 6000) return { ok: false, error: "Candidature trop longue." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible. Réessaie dans un instant." };

  const id = crypto.randomUUID();
  const ref = refCandidature();
  const { error } = await admin.from("Candidature").insert({
    id,
    ref,
    nomRP: nomRP.slice(0, 120),
    age: (data.age || "").trim().slice(0, 40) || null,
    moyen: (data.moyen || "").trim().slice(0, 40) || null,
    contact: contact.slice(0, 200),
    experience: (data.experience || "").trim().slice(0, 2000) || null,
    motivation: motivation.slice(0, 2000),
    disponibilites: (data.disponibilites || "").trim().slice(0, 300) || null,
    source: (data.source || "").trim().slice(0, 120) || null,
    statut: "nouveau",
    notifieDiscord: false,
  });

  if (error) {
    console.error("envoyerCandidature:", error.message);
    // Base pas encore migrée (colonne « ref »/« source » absente) → réessai sans les
    // nouveaux champs, pour ne jamais bloquer un candidat sur une base non à jour.
    if (/ref|source|column/i.test(error.message)) {
      const { error: e2 } = await admin.from("Candidature").insert({
        id,
        nomRP: nomRP.slice(0, 120),
        age: (data.age || "").trim().slice(0, 40) || null,
        moyen: (data.moyen || "").trim().slice(0, 40) || null,
        contact: contact.slice(0, 200),
        experience: (data.experience || "").trim().slice(0, 2000) || null,
        motivation: motivation.slice(0, 2000),
        disponibilites: (data.disponibilites || "").trim().slice(0, 300) || null,
        statut: "nouveau",
        notifieDiscord: false,
      });
      if (!e2) return { ok: true }; // enregistré, mais pas de suivi tant que la migration n'est pas passée
    }
    if (/Candidature|does not exist|relation/i.test(error.message)) return { ok: false, error: "Le recrutement n'est pas encore prêt (table à créer)." };
    return { ok: false, error: "Envoi impossible pour le moment. Réessaie dans un instant." };
  }
  return { ok: true, ref };
}
