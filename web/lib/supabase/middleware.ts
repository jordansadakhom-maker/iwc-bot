import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// Rafraîchit la session à chaque requête et protège les pages internes.
//
// Déploiement en douceur : tant que la variable REQUIRE_AUTH n'est pas à "true",
// le site reste ouvert (comportement actuel) — on n'enferme personne pendant
// la mise en place de la connexion Discord. Une fois Discord configuré et
// testé, mettre REQUIRE_AUTH=true verrouille l'accès aux membres connectés.
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return supabaseResponse; // Supabase non configuré → on laisse passer.

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
      },
    },
  });

  // IMPORTANT : ne rien exécuter entre createServerClient et getUser().
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Verrouillé PAR DÉFAUT : l'espace interne exige la connexion Discord.
  // Pour déverrouiller exceptionnellement, définir REQUIRE_AUTH="false".
  const requireAuth = process.env.REQUIRE_AUTH !== "false";
  const path = request.nextUrl.pathname;
  // Pages accessibles SANS connexion, même quand le site est verrouillé :
  // la connexion, le retour OAuth, la prise de rendez-vous publique — ET les
  // routes de métadonnées (image d'aperçu Discord, manifeste + icône PWA), sinon
  // le crawler Discord (anonyme) est redirigé vers /login et l'embed n'a pas
  // d'image, et l'appli ne peut pas s'installer.
  const isPublic = path === "/" || path === "/login" || path.startsWith("/auth") || path === "/rendez-vous" || path === "/telegramme" || path === "/rejoindre" || path === "/suivi" || path === "/armurerie-vh"
    || path === "/opengraph-image" || path === "/manifest.webmanifest" || path === "/pwa-icon" || path === "/icon" || path === "/apple-icon";

  if (requireAuth && !user && !isPublic) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  return supabaseResponse;
}
