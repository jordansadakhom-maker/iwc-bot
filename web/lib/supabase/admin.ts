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
export function createAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createSupabaseClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
