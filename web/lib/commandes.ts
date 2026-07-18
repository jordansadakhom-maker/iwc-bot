import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Dépose une commande CRUD dans la file Supabase (table CommandeWeb). Le bot
// Discord la relève (~30 s), l'applique à ses vraies données puis resynchronise
// le site. Le bot reste la source de vérité — le site ne casse jamais l'état.

export type CommandeResult = { ok: boolean; error?: string };

// Identité du membre connecté (pour tracer « par qui » la modif a été faite).
async function auteur(): Promise<{ nom: string; id: string | null }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { nom: "Site web", id: null };
    const meta = (user.user_metadata || {}) as Record<string, unknown>;
    let nom = (meta.full_name || meta.name || meta.user_name || "Membre") as string;
    const discordId = (meta.provider_id || meta.sub || "") as string;
    const admin = createAdminClient();
    if (discordId && admin) {
      const { data: m } = await admin.from("Membre").select("nomIC").eq("id", String(discordId)).maybeSingle();
      if (m?.nomIC) nom = m.nomIC as string;
    }
    return { nom: String(nom).slice(0, 120), id: discordId ? String(discordId) : null };
  } catch {
    return { nom: "Site web", id: null };
  }
}

export async function envoyerCommande(type: string, payload: Record<string, unknown>): Promise<CommandeResult> {
  const admin = createAdminClient();
  if (!admin) return { ok: false, error: "Service momentanément indisponible. Réessaie dans un instant." };

  const a = await auteur();
  const id = crypto.randomUUID();
  const { error } = await admin.from("CommandeWeb").insert({
    id,
    type,
    payload: { ...payload, auteurNom: a.nom },
    auteurNom: a.nom,
    auteurId: a.id,
    statut: "nouveau",
  });

  if (error) {
    console.error("envoyerCommande:", error.message);
    if (/CommandeWeb/i.test(error.message) || error.code === "42P01") {
      return { ok: false, error: "La file de commandes n'est pas encore prête (table à créer côté base — voir commandes-web.sql)." };
    }
    return { ok: false, error: "Enregistrement impossible pour le moment. Réessaie dans un instant." };
  }
  return { ok: true };
}
