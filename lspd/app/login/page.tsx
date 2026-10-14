"use client";

import { useState } from "react";
import { Shield, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function connexion() {
    setErr(null);
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { error } = await createClient().auth.signInWithOAuth({
        provider: "discord",
        options: { redirectTo: `${origin}/auth/callback?next=/dashboard` },
      });
      if (error) { setErr("Connexion Discord indisponible. Vérifie la configuration."); setBusy(false); }
    } catch {
      setErr("La connexion n'est pas encore configurée (variables Supabase manquantes).");
      setBusy(false);
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-bg px-5">
      <div className="w-full max-w-sm text-center">
        <span className="mx-auto grid h-14 w-14 place-items-center rounded-xl" style={{ background: "color-mix(in srgb,var(--navy) 22%,transparent)" }}>
          <Shield className="h-7 w-7 text-navy-hi" />
        </span>
        <h1 className="mt-4 font-display text-2xl font-bold uppercase tracking-[0.06em] text-ink">LSPD</h1>
        <p className="mt-1 text-[0.8rem] uppercase tracking-[0.12em] text-faint">Los Santos Police Department</p>
        <p className="mt-4 text-[0.88rem] text-muted">Espace interne réservé aux agents. Connecte-toi avec ton compte Discord pour accéder à ton tableau de bord.</p>

        <button onClick={connexion} disabled={busy}
          className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-[0.9rem] font-semibold text-white transition disabled:opacity-60"
          style={{ background: "#5865F2" }}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {busy ? "Redirection…" : "Se connecter avec Discord"}
        </button>

        {err ? <p className="mt-3 text-[0.8rem]" style={{ color: "var(--crit)" }}>{err}</p> : null}
        <p className="mt-6 text-[0.68rem] text-faint">Serveur GTA V RP · plateforme de roleplay — aucune donnée réelle.</p>
      </div>
    </main>
  );
}
