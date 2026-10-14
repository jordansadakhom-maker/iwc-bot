import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

// Retour de Discord après connexion : échange le code contre une session puis
// redirige. `next` est restreint aux chemins LOCAUX (anti open-redirect).
export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const brut = searchParams.get("next") ?? "/dashboard";
  const next = brut.startsWith("/") && !brut.startsWith("//") && !brut.startsWith("/\\") ? brut : "/dashboard";

  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocal = process.env.NODE_ENV === "development";
      if (!isLocal && forwardedHost) return NextResponse.redirect(`https://${forwardedHost}${next}`);
      return NextResponse.redirect(`${origin}${next}`);
    }
  }
  return NextResponse.redirect(`${origin}/login?error=auth`);
}
