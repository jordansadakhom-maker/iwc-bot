"use client";

// Dernier rempart : capture une erreur survenue jusque dans le layout racine
// (le cas le plus grave — sinon error.tsx suffit). global-error REMPLACE le layout,
// il doit donc rendre son propre <html>/<body> et n'a pas accès au CSS global :
// on style en ligne, aux couleurs parchemin du Dispensaire. Réessai auto une fois.
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("Erreur racine :", error);
    if (typeof window === "undefined") return;
    try {
      const KEY = "iwc-global-reset";
      const last = Number(sessionStorage.getItem(KEY) || 0);
      if (Date.now() - last > 20000) {
        sessionStorage.setItem(KEY, String(Date.now()));
        const t = setTimeout(() => reset(), 4000);
        return () => clearTimeout(t);
      }
    } catch { /* boutons manuels */ }
  }, [error, reset]);

  return (
    <html lang="fr">
      <body style={{ margin: 0, minHeight: "100vh", display: "grid", placeItems: "center", background: "#e7dcc0", color: "#2a2115", fontFamily: "Georgia, 'Times New Roman', serif", padding: "24px" }}>
        <div style={{ maxWidth: 460, textAlign: "center" }}>
          <div style={{ fontSize: 34 }}>⚕</div>
          <h1 style={{ fontSize: "1.5rem", margin: "6px 0" }}>Service momentanément indisponible</h1>
          <p style={{ fontSize: "0.95rem", color: "#6b5535", lineHeight: 1.5 }}>
            Le Dispensaire revient dans un instant — nouvelle tentative automatique en cours. Tu peux aussi réessayer maintenant.
          </p>
          <div style={{ marginTop: 16, display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
            <button onClick={() => reset()} style={{ cursor: "pointer", border: "1px solid #b8a67e", background: "#c9922f", color: "#1c1710", fontWeight: 700, borderRadius: 8, padding: "9px 16px", fontFamily: "inherit" }}>Réessayer</button>
            <button onClick={() => { if (typeof window !== "undefined") window.location.reload(); }} style={{ cursor: "pointer", border: "1px solid #b8a67e", background: "#efe6cf", color: "#2a2115", fontWeight: 700, borderRadius: 8, padding: "9px 16px", fontFamily: "inherit" }}>Recharger la page</button>
          </div>
        </div>
      </body>
    </html>
  );
}
