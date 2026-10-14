"use client";
import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur (connexion Discord uniquement). N'utilise que
// la clé publiable (anon) — jamais la clé service_role.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function createClient() {
  return createBrowserClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
  );
}
