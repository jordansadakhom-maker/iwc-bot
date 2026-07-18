"use server";

import { createAdminClient } from "@/lib/supabase/admin";

// Enregistre une demande de rendez-vous venue du site PUBLIC (aucune connexion
// requise). Écrit côté serveur avec la clé service (la RLS ne bloque donc pas),
// dans la table Rdv. Le bot Discord relèvera les demandes « nouveau · source
// web » pour prévenir l'équipe. Les infos libres (contact, message, pôle) sont
// stockées dans la colonne JSONB `paiement` (table Rdv non utilisée ailleurs).

export type RdvInput = {
  nomRP: string;
  prestation: string;
  creneau: string;
  lieu: string;
  contact: string;
  message: string;
  // Anti-spam : champ piège, doit rester vide (rempli = robot).
  website?: string;
};

export type RdvResult = { ok: boolean; error?: string };

export async function soumettreRdv(data: RdvInput): Promise<RdvResult> {
  // Honeypot : si rempli, on fait semblant d'accepter sans rien enregistrer.
  if (data.website && data.website.trim()) return { ok: true };

  const nomRP = (data.nomRP || "").trim();
  const contact = (data.contact || "").trim();
  const prestation = (data.prestation || "").trim();
  const creneau = (data.creneau || "").trim();
  const lieu = (data.lieu || "").trim();
  const message = (data.message || "").trim();

  if (nomRP.length < 2) return { ok: false, error: "Merci d'indiquer ton nom." };
  if (contact.length < 2) return { ok: false, error: "Merci d'indiquer un moyen de te contacter (pseudo Discord…)." };
  if ((message + nomRP + contact).length > 5000) return { ok: false, error: "Demande trop longue." };

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible. Réessaie dans un instant." };

  const id = crypto.randomUUID();
  const { error } = await admin.from("Rdv").insert({
    id,
    nomRP: nomRP.slice(0, 120),
    type: prestation.slice(0, 120) || "Rendez-vous",
    lieu: lieu.slice(0, 200) || null,
    creneau: creneau.slice(0, 200) || null,
    statut: "nouveau",
    paiement: {
      source: "web",
      pole: "legal",
      contact: contact.slice(0, 200),
      message: message.slice(0, 2000),
      notifieDiscord: false,
    },
  });

  if (error) {
    console.error("soumettreRdv:", error.message);
    return { ok: false, error: "Envoi impossible pour le moment. Réessaie dans un instant." };
  }
  return { ok: true };
}
