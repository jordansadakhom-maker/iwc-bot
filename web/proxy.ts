import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

// Convention Next.js 16 (ex-« middleware ») : rafraîchit la session Supabase à
// chaque requête et protège les pages internes selon REQUIRE_AUTH.
export async function proxy(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  // Exécuté sur toutes les routes sauf les fichiers statiques et images.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)"],
};
