"use client";

import React from "react";

// ⚠️ DIAGNOSTIC TEMPORAIRE — frontière d'erreur qui CAPTURE un throw de rendu.
// En prod, React masque le MESSAGE d'une erreur de rendu serveur (seul un digest
// reste) ; on récupère alors la PILE DE COMPOSANTS (componentStack) qui, elle,
// nomme le composant fautif. À RETIRER une fois la cause identifiée.
export class DiagBoundary extends React.Component<
  { where: string; children: React.ReactNode },
  { err: unknown; info: string | null }
> {
  constructor(props: { where: string; children: React.ReactNode }) {
    super(props);
    this.state = { err: null, info: null };
  }
  static getDerivedStateFromError(err: unknown) {
    return { err };
  }
  componentDidCatch(err: unknown, info: { componentStack?: string }) {
    this.setState({ err, info: info?.componentStack ?? null });
  }
  render() {
    if (this.state.err != null) {
      const e = this.state.err as { message?: string; stack?: string; digest?: string };
      return (
        <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", padding: 16, margin: 12, border: "2px solid #e5484d", borderRadius: 10, background: "#1a1113", color: "#ffd7d7", fontSize: 12, lineHeight: 1.5 }}>
          {`🔧 DIAGNOSTIC — ${this.props.where}\n\nMESSAGE: ${e?.message ?? String(this.state.err)}\nDIGEST: ${e?.digest ?? "(aucun)"}\n\nPILE DE COMPOSANTS:${this.state.info ?? "\n(non disponible)"}\n\nSTACK:\n${e?.stack ?? "(pas de stack)"}`}
        </pre>
      );
    }
    return this.props.children;
  }
}
