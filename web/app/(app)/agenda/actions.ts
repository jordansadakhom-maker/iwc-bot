"use server";

import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { envoyerCommande, type CommandeResult } from "@/lib/commandes";
import { supprimerFiable } from "@/lib/suppression";

// Ajoute une fiche de contact DEPUIS LE SITE (espace interne, membre connecté).
// On enregistre la demande dans Supabase (table DemandeContact) ; le bot Discord
// la relève et crée la vraie fiche (carnet + post de forum), au même format que
// la commande /contact. La fiche remonte ensuite sur le site par la synchro.

export type ContactInput = {
  nom: string;
  telegramme?: string;
  metier?: string;
  secteur?: string;
  affiliation?: string;
  relation?: string;
  fiabilite?: number;
  statutRP?: string;
  notes?: string;
};

export type ContactResult = { ok: boolean; error?: string };

const AFFILIATIONS = ["Civil", "Loi", "Hors-la-loi", "Loups de Fer", "Cartel", "Autre"];
const RELATIONS = ["Amicale", "Professionnelle", "Affaire", "Tendue", "Hostile"];
const STATUTS = ["Vivant", "Disparu", "Recherché", "Décédé"];

const clip = (v: string | undefined, n: number) => (v || "").trim().slice(0, n);

export async function ajouterContact(data: ContactInput): Promise<ContactResult> {
  const nom = clip(data.nom, 80);
  if (nom.length < 2) return { ok: false, error: "Le nom est obligatoire." };

  // Identité du membre connecté → « fiche établie par ».
  let creeParNom = "Site web";
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const meta = (user.user_metadata || {}) as Record<string, unknown>;
      creeParNom = (meta.full_name || meta.name || meta.user_name || "Membre") as string;
      const discordId = (meta.provider_id || meta.sub || "") as string;
      const admin0 = createAdminClient();
      if (discordId && admin0) {
        const { data: m } = await admin0.from("Membre").select("nomIC").eq("id", String(discordId)).maybeSingle();
        if (m?.nomIC) creeParNom = m.nomIC as string;
      }
    }
  } catch {
    /* best-effort : on garde « Site web » */
  }

  const fiab = Number(data.fiabilite);
  const affiliation = AFFILIATIONS.includes(data.affiliation || "") ? data.affiliation! : null;
  const relation = RELATIONS.includes(data.relation || "") ? data.relation! : null;
  const statutRP = STATUTS.includes(data.statutRP || "") ? data.statutRP! : null;

  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible. Réessaie dans un instant." };

  const id = crypto.randomUUID();
  const { error } = await admin.from("DemandeContact").insert({
    id,
    nom,
    telegramme: clip(data.telegramme, 60) || null,
    metier: clip(data.metier, 60) || null,
    secteur: clip(data.secteur, 60) || null,
    affiliation,
    relation,
    fiabilite: Number.isFinite(fiab) ? Math.max(0, Math.min(5, Math.round(fiab))) : null,
    statutRP,
    notes: clip(data.notes, 500) || null,
    creeParNom: clip(creeParNom, 120) || "Site web",
    statut: "nouveau",
  });

  if (error) {
    console.error("ajouterContact:", error.message);
    // Table pas encore créée → message clair pour lancer le SQL.
    if (/DemandeContact/i.test(error.message) || error.code === "42P01") {
      return { ok: false, error: "La file des contacts n'est pas encore prête (table à créer côté base — voir demande-contact.sql)." };
    }
    return { ok: false, error: "Envoi impossible pour le moment. Réessaie dans un instant." };
  }
  return { ok: true };
}

// ── Modifier / supprimer un contact existant (via la file de commandes) ──
export async function modifierContact(
  id: string,
  patch: { nom?: string; type?: string; telegramme?: string; metier?: string; secteur?: string; affiliation?: string; relation?: string; statutRP?: string; notes?: string; fiabilite?: number }
): Promise<CommandeResult> {
  if (!id) return { ok: false, error: "Contact introuvable." };
  return envoyerCommande("contact.update", { id, ...patch });
}

export async function supprimerContact(id: string): Promise<CommandeResult> {
  return supprimerFiable({ type: "contact.delete", payload: { id }, table: "Contact", colonne: "id", valeur: id, okMsg: "Contact supprimé." });
}
