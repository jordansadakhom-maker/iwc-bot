"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// Bouton « Se connecter avec Discord » — lance le flux OAuth Supabase.
export function LoginButton() {
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function signIn() {
    setLoading(true);
    setErr(null);
    try {
      const supabase = createClient();
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "discord",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          scopes: "identify email guilds",
        },
      });
      if (error) {
        setErr("La connexion Discord n'est pas encore configurée. Réessaie une fois la mise en place terminée.");
        setLoading(false);
      }
    } catch {
      setErr("Connexion impossible pour le moment.");
      setLoading(false);
    }
  }

  return (
    <div>
      <button
        onClick={signIn}
        disabled={loading}
        className="mt-6 flex w-full items-center justify-center gap-3 rounded-xl px-4 py-3 text-[0.95rem] font-semibold text-white transition hover:brightness-110 disabled:opacity-60"
        style={{ background: "#5865F2" }}
      >
        <svg viewBox="0 0 24 24" fill="currentColor" className="h-5 w-5" aria-hidden>
          <path d="M20.3 4.4A19.8 19.8 0 0 0 15.4 3l-.3.5c1.6.4 2.9 1 4.2 1.8-1.6-.8-3.3-1.3-5.1-1.5a18.5 18.5 0 0 0-4.4 0C8.2 3.9 6.5 4.4 5 5.2 6.2 4.5 7.6 3.9 9.1 3.5L8.9 3A19.8 19.8 0 0 0 4 4.4C1.7 7.8.9 11.2 1.1 14.5a19.9 19.9 0 0 0 6 3l.8-1.1c-.9-.3-1.7-.7-2.5-1.2l.6-.4c3.3 1.5 6.9 1.5 10.2 0l.6.4c-.8.5-1.6.9-2.5 1.2l.8 1.1c2.2-.7 4.2-1.7 6-3 .3-3.8-.6-7.2-2.4-10.1ZM8.5 12.6c-.9 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9Zm7 0c-.9 0-1.7-.9-1.7-1.9s.8-1.9 1.7-1.9 1.7.9 1.7 1.9-.7 1.9-1.7 1.9Z" />
        </svg>
        {loading ? "Connexion…" : "Se connecter avec Discord"}
      </button>
      {err ? <p className="mt-3 text-center text-[0.75rem] text-crit">{err}</p> : null}
    </div>
  );
}
