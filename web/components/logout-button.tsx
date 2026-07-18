"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

// Bouton de déconnexion — coupe la session Supabase et renvoie vers /login.
export function LogoutButton() {
  const router = useRouter();
  async function signOut() {
    try {
      const supabase = createClient();
      await supabase.auth.signOut();
    } catch {
      // ignore
    }
    router.push("/login");
    router.refresh();
  }
  return (
    <button
      onClick={signOut}
      className="grid h-10 w-10 place-items-center rounded-xl border border-border bg-surface text-muted hover:text-ink"
      aria-label="Se déconnecter"
      title="Se déconnecter"
    >
      <LogOut className="h-[18px] w-[18px]" />
    </button>
  );
}
