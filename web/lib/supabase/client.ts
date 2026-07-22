import { createBrowserClient } from "@supabase/ssr";

// Client Supabase côté navigateur — sert à lancer la connexion Discord (OAuth)
// et la déconnexion. Ne manipule que la clé publiable (anon), jamais de secret.
const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();

export function createClient() {
  return createBrowserClient(
    clean(process.env.NEXT_PUBLIC_SUPABASE_URL),
    clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY)
  );
}
