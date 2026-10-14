import "server-only";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";

// Client Supabase « service » — LECTURE/ÉCRITURE CÔTÉ SERVEUR UNIQUEMENT.
// Clé service_role : contourne la RLS, ne quitte jamais le serveur (pas de préfixe
// NEXT_PUBLIC). Sans URL/clé valides → renvoie null (les pages affichent alors un
// état « base non connectée »), jamais d'exception qui casserait le rendu.
// ⚠️ Ne JAMAIS importer ce fichier dans un composant client ("use client").
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function createAdminClient() {
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  if (!url || !key || !/^https?:\/\//i.test(url)) return null;
  try {
    return createSupabaseClient(url, key, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  } catch {
    return null;
  }
}
