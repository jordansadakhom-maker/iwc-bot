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

  // Modèle « liste des zones PROTÉGÉES » (dossier app/(app) + espace Dispensaire).
  // Tout le reste passe librement : accueil, /login, /auth, formulaires publics
  // (/rendez-vous, /telegramme, /rejoindre), /suivi (signature client), /avis,
  // boutique publique /armurerie-vh, routes API (auto-authentifiées, ex. cron),
  // métadonnées (opengraph/manifest/icônes), robots.txt & sitemap.xml — et les
  // URL inconnues, qui rendent ainsi une VRAIE page 404 au lieu d'être renvoyées
  // vers /login. Chaque page interne se protège en plus via getActeur (fail-closed).
  const PROTECTED = [
    "/absences", "/activite", "/agenda", "/armurerie", "/assistant", "/carte", "/carte-metier",
    "/chasse", "/communication", "/dashboard", "/direction", "/documents", "/finances", "/inventaire",
    "/journal", "/medical", "/membres", "/messages", "/mouvements", "/notes-vocales", "/notifications",
    "/operations", "/recrutement", "/renseignement", "/repertoire", "/statistiques", "/taches", "/wanted",
    "/dispensaire",
  ];
  // Frontière stricte : "/armurerie" protégé n'attrape PAS le public "/armurerie-vh".
  const estProtege = PROTECTED.some((p) => path === p || path.startsWith(p + "/"));

  if (requireAuth && !user && estProtege) {
    const redirectUrl = request.nextUrl.clone();
    redirectUrl.pathname = "/login";
    return NextResponse.redirect(redirectUrl);
  }

  // ── Mode « site autonome du Dispensaire » ──────────────────────────────────
  // Actif si la variable est à "true" OU si le domaine contient « dispensaire »
  // (détection automatique — pas besoin de configurer quoi que ce soit). Tout est
  // ramené au Dispensaire : l'accueil et les autres sections renvoient vers /dispensaire.
  const host = (request.headers.get("host") || "").toLowerCase();
  const standalone = process.env.NEXT_PUBLIC_DISPENSAIRE_STANDALONE === "true" || host.includes("dispensaire");
  if (standalone) {
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
