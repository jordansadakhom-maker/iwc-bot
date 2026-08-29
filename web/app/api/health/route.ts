import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Point de santé PUBLIC + « réveil » de la base. Une requête minime maintient le
// projet Supabase ACTIF : sur le plan gratuit, la base se met en pause après une
// longue inactivité — c'est la cause n°1 des « soucis serveur » intermittents.
// Le cron keep-alive (GitHub Actions) appelle cette route régulièrement.
//   • ne divulgue AUCUNE donnée (juste un état) ;
//   • ne plante JAMAIS (toujours 200) ;
//   • jamais mis en cache (la requête doit réellement atteindre la base).
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  let db = false;
  try {
    const admin = createAdminClient();
    if (admin) {
      // Requête ultra-légère (aucune ligne rapatriée) : suffit à réveiller la base.
      const { error } = await admin.from("DispensaireConfig").select("cle", { count: "exact", head: true });
      db = !error;
    }
  } catch {
    db = false;
  }
  return NextResponse.json(
    { ok: true, db, at: new Date().toISOString() },
    { status: 200, headers: { "cache-control": "no-store, max-age=0" } },
  );
}
