import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";

// Outil de diagnostic (temporaire) : indique à quel projet Supabase le site est
// connecté et si les tables sont lisibles. N'expose AUCUNE clé — seulement la
// « référence » publique du projet (déjà dans l'URL) et le message d'erreur.
export const dynamic = "force-dynamic";

export async function GET() {
  const rawUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
  const ref = rawUrl.replace(/^https?:\/\//i, "").split(".")[0] || null; // ex. "zcoqmcwsmjldkuubsgkm"
  const serviceKind = (() => {
    const k = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim().replace(/^["']|["']$/g, "");
    if (!k) return "absente";
    if (k.startsWith("sb_secret_")) return "sb_secret";
    if (k.startsWith("sb_publishable_")) return "sb_publishable (⚠ mauvaise : c'est une clé publique)";
    if (k.startsWith("eyJ")) return "legacy (eyJ)";
    return "inconnue";
  })();

  const admin = createAdminClient();
  if (!admin) {
    return NextResponse.json({ ok: false, projet: ref, cleService: serviceKind, admin: false, raison: "createAdminClient=null (URL ou clé service manquante/invalide)" });
  }

  let error: string | null = null;
  let code: string | null = null;
  let count: number | null = null;
  try {
    const res = await admin.from("DispensaireStock").select("id", { count: "exact", head: true });
    error = res.error?.message ?? null;
    code = (res.error as { code?: string } | null)?.code ?? null;
    count = res.count ?? null;
  } catch (e) {
    error = (e as Error).message;
  }

  return NextResponse.json({
    ok: !error,
    projet: ref,           // à quel projet le site est connecté
    cleService: serviceKind, // type de clé service utilisée
    admin: true,
    tableDispensaireStock: error ? "ERREUR" : "OK",
    error,
    code,
    count,
  });
}
