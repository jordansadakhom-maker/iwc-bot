"use client";

import { useState } from "react";
import { ClipboardCheck, ChevronDown, CheckCircle2, History } from "lucide-react";
import type { JournalScan, JournalAnomalie } from "@/lib/queries";

const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

function ligne(a: JournalAnomalie) {
  if (a.type === "stock_negatif") return `${a.nom ?? "?"} (${a.cible ?? "?"}) — ${a.stock ?? 0}`;
  if (a.type === "doublon") return `${a.nom ?? "?"} (${a.cible ?? "?"}) — ${a.n ?? 2} entrées`;
  if (a.type === "ressource_manquante") return `${a.produitNom ?? "?"} → ${a.ingredient ?? "?"}`;
  return a.nom ?? a.type;
}

const GROUPES = [
  { key: "stock_negatif", label: "Stocks négatifs", emoji: "🔻", tone: "var(--oxblood)" },
  { key: "doublon", label: "Doublons", emoji: "👥", tone: "var(--warn)" },
  { key: "ressource_manquante", label: "Ressources de recette à vérifier", emoji: "❓", tone: "var(--muted)" },
];

// Bloc « Cohérence de l'armurerie » du Journal de bord : le dernier scan horaire
// du bot (négatifs, doublons, ressources de recette non reconnues) + l'historique.
export function JournalScans({ scans }: { scans: JournalScan[] }) {
  const [histo, setHisto] = useState(false);
  if (!scans.length) return null;
  const dernier = scans[0];
  const precedents = scans.slice(1);
  const groupes = GROUPES.map((g) => ({ ...g, items: dernier.anomalies.filter((a) => a.type === g.key) })).filter((g) => g.items.length);

  return (
    <div className="mb-4 rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><ClipboardCheck className="h-4 w-4 text-accent" /> Cohérence de l&apos;armurerie</h3>
        <span className="text-[0.72rem] text-faint">dernier scan · {dateFR(dernier.createdAt)}</span>
      </div>

      {dernier.nb === 0 ? (
        <div className="flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[0.84rem]" style={{ color: "var(--good)", borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
          <CheckCircle2 className="h-4 w-4" /> RAS — aucune incohérence détectée.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="text-[0.8rem] text-muted">{dernier.resume}</div>
          {groupes.map((g) => (
            <div key={g.key} className="rounded-[10px] border border-border bg-surface-2 p-2.5">
              <div className="mb-1 flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color: g.tone }}>{g.emoji} {g.label} <span className="font-num text-faint">{g.items.length}</span></div>
              <div className="flex flex-col gap-0.5 text-[0.78rem] text-muted">
                {g.items.slice(0, 40).map((a, i) => <div key={i}>• {ligne(a)}</div>)}
                {g.items.length > 40 ? <div className="text-faint">… (+{g.items.length - 40} de plus)</div> : null}
              </div>
            </div>
          ))}
          {dernier.anomalies.some((a) => a.type === "ressource_manquante") ? (
            <p className="text-[0.72rem] text-faint">Les « ressources de recette à vérifier » sont souvent des sous-produits (Lasso, Jumelles…) non catalogués comme matière première — à corriger dans l&apos;armurerie si besoin. Elles ne déclenchent plus d&apos;alerte Discord.</p>
          ) : null}
        </div>
      )}

      {precedents.length ? (
        <div className="mt-2 border-t border-border pt-2">
          <button onClick={() => setHisto((v) => !v)} className="inline-flex items-center gap-1.5 text-[0.74rem] font-semibold text-muted hover:text-ink"><History className="h-3.5 w-3.5" /> Scans précédents ({precedents.length}) <ChevronDown className={"h-3.5 w-3.5 transition-transform " + (histo ? "rotate-180" : "")} /></button>
          {histo ? (
            <div className="mt-2 flex flex-col gap-1">
              {precedents.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                  <span className="truncate" style={s.nb ? { color: "var(--muted)" } : { color: "var(--good)" }}>{s.nb ? `⚠️ ${s.resume}` : "✅ RAS"}</span>
                  <span className="shrink-0 text-faint">{dateFR(s.createdAt)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
