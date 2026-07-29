import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { reapprovisionner } from "@/lib/armurerie-reappro";

export const dynamic = "force-dynamic";

// Réapprovisionnement quotidien RÉEL de l'armurerie, déclenché par Vercel Cron.
// Remonte chaque produit vendable sous sa cible (jamais de réduction). Programmé
// avant le « point stock » du bot (09:30 Paris) → le rapport reflète le réappro.
// PROTÉGÉE : exige « Authorization: Bearer $CRON_SECRET » (ajouté par Vercel).
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "service indisponible" }, { status: 500 });
  const { maj, total } = await reapprovisionner(admin);
  return NextResponse.json({ ok: true, reapprovisionnes: maj, total });
}
