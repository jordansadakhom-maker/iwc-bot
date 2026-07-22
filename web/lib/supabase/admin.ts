import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client Supabase « service » — LECTURE DES DONNÉES CÔTÉ SERVEUR UNIQUEMENT.
//
// Utilise la clé secrète (service_role) qui contourne la RLS. Elle ne quitte
// JAMAIS le serveur (pas de préfixe NEXT_PUBLIC → jamais envoyée au navigateur).
// La base reste protégée : quiconque récupère la clé publiable côté site
// n'obtient rien en direct (RLS active). L'accès aux pages est verrouillé par
// REQUIRE_AUTH (membres Discord connectés uniquement).
//
// ⚠️ Ne JAMAIS importer ce fichier dans un composant client ("use client").

// Nettoie une variable d'env : espaces + guillemets accidentels (erreurs de copie).
function clean(v: string | undefined): string {
  return (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
}

export function createAdminClient() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  // Garde-fou : sans URL/clé valides, on renvoie null (les pages affichent alors
  // un état vide) — JAMAIS d'exception qui casserait le build ou le rendu.
  if (!url || !key || !/^https?:\/\//i.test(url)) return null;
  try {
    return createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}
