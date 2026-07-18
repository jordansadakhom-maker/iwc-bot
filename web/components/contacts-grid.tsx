"use client";

import { useState } from "react";
import { X } from "lucide-react";
import type { ContactItem } from "@/lib/queries";

const TYPE_TONE: Record<string, string> = {
  "Allié": "var(--good)", "Client": "var(--accent)", "Indic": "var(--steel)", "Ennemi": "var(--oxblood)", "Neutre": "var(--muted)",
};

function Stars({ n }: { n: number }) {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  if (v === 0) return <span className="text-faint">—</span>;
  return (
    <span className="inline-flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((i) => (
        <span key={i} className="h-1.5 w-2.5 rounded-sm" style={{ background: i <= v ? "var(--accent)" : "color-mix(in srgb,var(--ink) 12%,transparent)" }} />
      ))}
    </span>
  );
}

function Ligne({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="flex justify-between gap-4 border-t border-border py-2 first:border-t-0">
      <span className="text-[0.76rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      <span className="text-right text-[0.86rem] text-ink">{value}</span>
    </div>
  );
}

function TypeBadge({ type }: { type: string }) {
  const c = TYPE_TONE[type] || "var(--muted)";
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: c, background: "color-mix(in srgb," + c + " 15%,transparent)" }}>
      {type}
    </span>
  );
}

export function ContactsGrid({ contacts }: { contacts: ContactItem[] }) {
  const [sel, setSel] = useState<ContactItem | null>(null);

  return (
    <>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {contacts.map((c) => (
          <button
            key={c.id}
            onClick={() => setSel(c)}
            className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-border-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[0.88rem] font-semibold">{c.nom}</div>
              <TypeBadge type={c.type} />
            </div>
            <div className="mt-2 flex items-center justify-between gap-2 text-[0.72rem] text-muted">
              {c.secteur ? <span className="truncate">{c.secteur}</span> : <span className="text-faint">—</span>}
              <Stars n={c.fiabilite} />
            </div>
          </button>
        ))}
      </div>

      {sel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setSel(null)}>
          <div
            className="w-full max-w-[440px] rounded-card border border-border bg-surface p-5 shadow-card"
            style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-xl">{sel.nom}</div>
                <div className="mt-1"><TypeBadge type={sel.type} /></div>
              </div>
              <button onClick={() => setSel(null)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-ink" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mb-3 flex items-center gap-2 text-[0.8rem] text-muted">
              <span>Fiabilité</span> <Stars n={sel.fiabilite} />
            </div>

            <div className="flex flex-col">
              <Ligne label="Télégramme" value={sel.telegramme} />
              <Ligne label="Métier" value={sel.metier} />
              <Ligne label="Secteur" value={sel.secteur} />
              <Ligne label="Affiliation" value={sel.affiliation} />
              <Ligne label="Relation" value={sel.relation} />
              <Ligne label="Statut" value={sel.statutRP} />
              <Ligne label="Fiche par" value={sel.creeParNom} />
            </div>

            {sel.notes ? (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1 text-[0.72rem] uppercase tracking-[0.05em] text-faint">Notes</div>
                <p className="whitespace-pre-wrap text-[0.86rem] leading-relaxed text-muted">{sel.notes}</p>
              </div>
            ) : null}

            {!sel.telegramme && !sel.metier && !sel.affiliation && !sel.relation && !sel.statutRP && !sel.notes ? (
              <p className="mt-2 text-[0.8rem] text-faint">Détails complets bientôt disponibles (une fois les colonnes ajoutées côté base).</p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
