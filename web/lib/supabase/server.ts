import "server-only";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

// Client Supabase côté serveur (Server Components, Route Handlers).
// Utilise la clé publiable (anon) + le cookie de session s'il existe → les
// lectures portent l'identité de l'utilisateur connecté (indispensable une fois
// la sécurité RLS activée). N'expose JAMAIS la clé service_role côté web.
export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Appelé depuis un Server Component (lecture seule) — ignoré,
            // le middleware rafraîchit déjà la session.
          }
        },
      },
    }
  );
}
