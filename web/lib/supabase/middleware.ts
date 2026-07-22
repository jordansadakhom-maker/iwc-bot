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

  // Nettoie les variables (espaces / guillemets accidentels de copie).
  const clean = (v: string | undefined) => (v ?? "").trim().replace(/^["']|["']$/g, "").trim();
  const url = clean(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const key = clean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // Session de l'utilisateur — dans un try/catch : si Supabase est absent ou mal
  // configuré, on NE FAIT JAMAIS planter la requête (pas de 500), on laisse passer.
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
            supabaseResponse = NextResponse.next({ request });
            cookiesToSet.forEach(({ name, value, options }) => supabaseResponse.cookies.set(name, value, options));
          },
        },
      });
      const res = await supabase.auth.getUser();
      user = res.data.user;
    } catch {
      // Supabase injoignable / clé invalide → on n'enferme personne, on continue.
      user = null;
    }
  }

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

  // ── Mode « site autonome du Dispensaire » ──────────────────────────────────
  // Tout est ramené au Dispensaire : l'accueil et les autres sections d'Iron Wolf
  // renvoient vers /dispensaire (le reste de la plateforme n'apparaît jamais).
  if (process.env.NEXT_PUBLIC_DISPENSAIRE_STANDALONE === "true") {
    const auth = path === "/login" || path.startsWith("/auth");
    const meta = path === "/opengraph-image" || path === "/manifest.webmanifest" || path === "/pwa-icon" || path === "/icon" || path === "/apple-icon";
    const autorise = path.startsWith("/dispensaire") || auth || meta;
    if (!autorise) {
      const to = request.nextUrl.clone();
      to.pathname = "/dispensaire";
      to.search = "";
      return NextResponse.redirect(to);
    }
  }

  return supabaseResponse;
}
