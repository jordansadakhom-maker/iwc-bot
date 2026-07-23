import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Contrôle temporaire : vérifie que le SQL « photos » a bien été appliqué
// (colonnes photo + bucket d'images). N'expose aucune clé. À retirer ensuite.
export const dynamic = "force-dynamic";

export async function GET() {
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, raison: "Pas de connexion Supabase (createAdminClient=null)." });

  const out: Record<string, unknown> = {};

  const stock = await admin.from("DispensaireStock").select("id,photo", { count: "exact", head: true });
  out.colonneStockPhoto = stock.error ? `MANQUE — ${stock.error.message}` : "OK";

  const coffre = await admin.from("DispensaireCoffre").select("id,photo", { count: "exact", head: true });
  out.colonneCoffrePhoto = coffre.error ? `MANQUE — ${coffre.error.message}` : "OK";

  try {
    const { data, error } = await admin.storage.getBucket("iwc");
    out.bucketImages = error ? `MANQUE — ${error.message}` : data?.public ? "OK (public)" : "EXISTE mais PRIVÉ (doit être public)";
  } catch (e) {
    out.bucketImages = `erreur — ${(e as Error).message}`;
  }

  out.ok = out.colonneStockPhoto === "OK" && out.colonneCoffrePhoto === "OK" && String(out.bucketImages).startsWith("OK");
  return NextResponse.json(out);
}
