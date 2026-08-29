"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, RotateCw, RefreshCw, ChevronDown } from "lucide-react";

// Écran d'erreur SOIGNÉ, partagé par les error.tsx (interne + espace Dispensaire).
// Au lieu d'un « souci avec le serveur » brut : un message rassurant + Réessayer /
// Recharger, l'auto-guérison des erreurs de CHUNK (JS non chargé après un
// déploiement), et un repli AUTO : si le rendu échoue (ex. base momentanément
// indisponible), on retente tout seul une fois après un court délai.
const estErreurChunk = (e?: { name?: string; message?: string }) =>
  /ChunkLoadError|Loading chunk|dynamically imported module|Importing a module script failed|Failed to fetch/i.test(
    String(e?.name || "") + " " + String(e?.message || ""),
  );

export function ErreurBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [details, setDetails] = useState(false);
  const [autoRechargement, setAutoRechargement] = useState(false);

  useEffect(() => {
    console.error("Erreur de rendu :", error);
    if (typeof window === "undefined") return;
    // 1) Erreur de chunk (déploiement) → rechargement complet, une fois.
    if (estErreurChunk(error)) {
      try {
        const KEY = "iwc-chunk-reload";
        const last = Number(sessionStorage.getItem(KEY) || 0);
        if (Date.now() - last > 15000) {
          sessionStorage.setItem(KEY, String(Date.now()));
          setAutoRechargement(true);
          window.location.reload();
          return;
        }
      } catch { /* sessionStorage indisponible : boutons manuels */ }
    }
    // 2) Autre erreur (ex. base momentanément injoignable) → on retente TOUT SEUL
    //    une fois après 4 s (le temps que le service se rétablisse), sans boucler.
    try {
      const KEY = "iwc-auto-reset";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 20000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        setAutoRechargement(true);
        const t = setTimeout(() => reset(), 4000);
        return () => clearTimeout(t);
      }
    } catch { /* on retombe sur les boutons manuels */ }
  }, [error, reset]);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-4 text-center">
      <span
        className="grid h-16 w-16 place-items-center rounded-full border"
        style={{ borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))", background: "radial-gradient(circle at 30% 25%, color-mix(in srgb,var(--accent) 20%,transparent), transparent 70%)" }}
      >
        <AlertTriangle className="h-7 w-7" style={{ color: "var(--accent)" }} strokeWidth={1.6} />
      </span>
      <div>
        <h2 className="font-display text-[1.4rem]">Petit contretemps</h2>
        <p className="mt-1 max-w-md text-[0.9rem] text-muted">
          {autoRechargement
            ? "Le service se rétablit — nouvelle tentative automatique en cours…"
            : "Le service était momentanément indisponible. Réessaie — c’est en général réglé en quelques secondes."}
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-center gap-2.5">
        <button onClick={() => reset()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.85rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>
          <RotateCw className="h-4 w-4" /> Réessayer
        </button>
        <button onClick={() => window.location.reload()} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.85rem] font-semibold hover:border-border-2">
          <RefreshCw className="h-4 w-4" /> Recharger la page
        </button>
      </div>

      {(error?.message || error?.digest) ? (
        <div className="mt-1 w-full max-w-md">
          <button onClick={() => setDetails((v) => !v)} className="inline-flex items-center gap-1 text-[0.72rem] text-faint hover:text-muted">
            <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (details ? "rotate-180" : "")} /> Détails techniques
          </button>
          {details ? (
            <pre className="mt-1.5 max-h-40 overflow-auto rounded-lg border border-border bg-surface-2 px-3 py-2 text-left text-[0.72rem] leading-relaxed text-muted">
              {estErreurChunk(error) ? "Type : erreur de chargement (chunk) — souvent après un déploiement.\n" : ""}
              {error?.name ? `Nom : ${error.name}\n` : ""}
              {error?.message ? `Message : ${error.message}\n` : ""}
              {error?.digest ? `Digest : ${error.digest}` : ""}
            </pre>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
