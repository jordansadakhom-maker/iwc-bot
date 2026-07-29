"use client";

import { useEffect } from "react";
import { Map as MapIcon, RotateCw, RefreshCw } from "lucide-react";

// Boundary de la route Carte : au lieu de l'écran brut « This page couldn't
// load », un message soigné avec deux issues — « Réessayer » (re-rend le
// segment, utile si l'erreur était passagère) et « Recharger la page »
// (rechargement complet, utile après une mise à jour du site / chunk périmé).
export default function CarteError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Trace côté client (visible dans la console) — aide au diagnostic.
    console.error("Carte — erreur de rendu :", error);
  }, [error]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span
        className="grid h-16 w-16 place-items-center rounded-full border"
        style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 20%,transparent), transparent 70%)" }}
      >
        <MapIcon className="h-7 w-7" style={{ color: "var(--accent)" }} strokeWidth={1.6} />
      </span>
      <div>
        <h2 className="font-display text-[1.4rem]">La carte n&apos;a pas pu se charger</h2>
        <p className="mt-1 max-w-md text-[0.9rem] text-muted">Un contretemps passager. Réessaie — et si ça persiste, recharge la page (une mise à jour du site vient peut-être d&apos;être déployée).</p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button
          onClick={() => reset()}
          className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.85rem] font-semibold text-black/85"
          style={{ background: "var(--accent)" }}
        >
          <RotateCw className="h-4 w-4" /> Réessayer
        </button>
        <button
          onClick={() => window.location.reload()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.85rem] font-semibold hover:border-border-2"
        >
          <RefreshCw className="h-4 w-4" /> Recharger la page
        </button>
      </div>
    </div>
  );
}
