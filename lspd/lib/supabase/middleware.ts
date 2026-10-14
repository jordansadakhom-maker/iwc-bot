import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rafraîchit la session à chaque requête et protège les zones internes.
// Fail-safe : si Supabase est absent/mal configuré, on NE casse JAMAIS la requête.
export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  let user: unknown = null;
  if (url && key && /^https?:\/\//i.test(url)) {
    try {
      const supabase = createServerClient(url, key, {
        cookies: {
          getAll() {
            return request.cookies.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
            response = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
          },
        },
      });
      const res = await supabase.auth.getUser();
      user = res.data.user;
    } catch {
      user = null;
    }
  }

  // Zones internes protégées : tout sauf l'accueil public, la connexion et le
  // callback d'auth. Chaque page se re-protège en plus via getActeur (fail-closed).
  // Déverrouillage exceptionnel possible avec REQUIRE_AUTH="false".
  const requireAuth = process.env.REQUIRE_AUTH !== "false";
  const path = request.nextUrl.pathname;
  const publique =
    path === "/" ||
    path === "/login" ||
    path.startsWith("/auth") ||
    path.startsWith("/api/") ||
    path === "/favicon.ico";

  if (requireAuth && !user && !publique) {
    const to = request.nextUrl.clone();
    to.pathname = "/login";
    return NextResponse.redirect(to);
  }

  return response;
}
