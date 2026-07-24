import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getRapportConfig, enregistrerRapport } from "@/lib/dispensaire-rapport-impayes";

export const dynamic = "force-dynamic";

// Génération planifiée du rapport d'impayés. Déclenchée par Vercel Cron.
// PROTÉGÉE : exige l'en-tête « Authorization: Bearer $CRON_SECRET » (Vercel
// l'ajoute automatiquement aux requêtes cron quand CRON_SECRET est défini).
// Cette route ne renvoie AUCUNE donnée de facture — seulement un statut.
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const cfg = await getRapportConfig();
  if (cfg.mode === "manuel") return NextResponse.json({ ok: true, skipped: "mode manuel" });

  // Repères de temps (Europe/Paris).
  const now = new Date();
  const ymd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const heure = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Paris", hour: "2-digit", hour12: false }).format(now).replace(/\D/g, ""));
  const jourNom = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Paris", weekday: "long" }).format(now);
  const weekday = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"].indexOf(jourNom) + 1; // 1..7
  const dom = Number(ymd.slice(8, 10));

  let dueToday = false;
  if (cfg.mode === "quotidien") dueToday = true;
  else if (cfg.mode === "hebdo") dueToday = weekday === cfg.jour;
  else if (cfg.mode === "mensuel") dueToday = dom === cfg.jour;
  if (!dueToday) return NextResponse.json({ ok: true, skipped: "pas prévu aujourd'hui" });
  if (heure < cfg.heure) return NextResponse.json({ ok: true, skipped: "avant l'heure programmée" });

  // Déjà généré aujourd'hui ? (évite les doublons si le cron passe plusieurs fois).
  if (cfg.lastAutoAt) {
    const lastYmd = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(cfg.lastAutoAt));
    if (lastYmd === ymd) return NextResponse.json({ ok: true, skipped: "déjà généré aujourd'hui" });
  }

  const admin = createAdminClient();
  if (!admin) return NextResponse.json({ ok: false, error: "service indisponible" }, { status: 500 });
  const r = await enregistrerRapport("Génération automatique");
  if (!r.ok) return NextResponse.json({ ok: false, error: r.error }, { status: 500 });
  await admin.from("DispensaireRapportConfig").upsert({ id: "config", mode: cfg.mode, heure: cfg.heure, jour: cfg.jour, lastAutoAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { onConflict: "id" });
  return NextResponse.json({ ok: true, generated: true, nbImpayes: r.rapport?.impayes.length ?? 0, nbPaiements: r.rapport?.payes.length ?? 0 });
}
