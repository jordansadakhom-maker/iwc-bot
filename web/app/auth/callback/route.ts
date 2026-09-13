import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retour de Discord après connexion : on échange le code contre une session,
// puis on redirige vers le tableau de bord.
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  // Sécurité : `next` ne doit rester qu'un chemin LOCAL. Sans ce filtre, une
  // valeur comme "@evil.com" ou "//evil.com" détournerait la redirection post-
  // connexion vers un domaine externe (open redirect → hameçonnage). On n'accepte
  // donc qu'un chemin commençant par "/" mais pas "//" ni "/\".
  const nextBrut = searchParams.get("next") ?? "/dashboard";
  const next = nextBrut.startsWith("/") && !nextBrut.startsWith("//") && !nextBrut.startsWith("/\\") ? nextBrut : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Derrière un proxy (Vercel), respecte l'hôte d'origine.
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      if (isLocal) return NextResponse.redirect(`${origin}${next}`);
      if (forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  return NextResponse.redirect(`${origin}/login?error=auth`);
}
