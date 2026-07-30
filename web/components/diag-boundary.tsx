"use client";

import React from "react";

// ⚠️ DIAGNOSTIC TEMPORAIRE — frontière d'erreur qui CAPTURE un throw de rendu
// (y compris côté client / SSR) et AFFICHE le message + la stack réels. Contrairement
// à la frontière de Next (qui masque le message en prod et ne laisse qu'un digest),
// une frontière définie par nous voit le message avant sa censure. À RETIRER ensuite.
export class DiagBoundary extends React.Component<
  { where: string; children: React.ReactNode },
  { err: unknown }
> {
  constructor(props: { where: string; children: React.ReactNode }) {
    super(props);
    this.state = { err: null };
  }
  static getDerivedStateFromError(err: unknown) {
    return { err };
  }
  render() {
    if (this.state.err != null) {
      const e = this.state.err as { message?: string; stack?: string };
      return (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 16, margin: 12, border: "2px solid #e5484d", borderRadius: 10, background: "#1a1113", color: "#ffd7d7", fontSize: 12, lineHeight: 1.5 }}>
          {`🔧 DIAGNOSTIC (temporaire) — ${this.props.where} [rendu]\n\nMESSAGE: ${e?.message ?? String(this.state.err)}\n\nSTACK:\n${e?.stack ?? "(pas de stack disponible)"}`}
        </pre>
      );
    }
    return this.props.children;
  }
}
