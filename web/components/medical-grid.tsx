"use client";

import { useState } from "react";
import { X, Bandage, Pill, Stethoscope, Clock, History } from "lucide-react";
import type { DossierItem } from "@/lib/queries";

const STATUT_TONE: Record<string, string> = {
  apte: "var(--good)", observation: "var(--warn)", inapte: "var(--oxblood)", non_teste: "var(--muted)",
};
const STATUT_LABEL: Record<string, string> = {
  apte: "Apte", observation: "En observation", inapte: "Inapte", non_teste: "Non testé",
};

function StatutBadge({ statut }: { statut: string }) {
  const k = (statut || "").toLowerCase();
  const c = STATUT_TONE[k] || "var(--muted)";
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: c, background: "color-mix(in srgb," + c + " 16%,transparent)" }}>
      {STATUT_LABEL[k] || statut}
    </span>
  );
}

function Compteur({ icon: Icon, n, mot }: { icon: typeof Bandage; n: number; mot: string }) {
  return (
    <span className="inline-flex items-center gap-1.5"><Icon className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {n} {mot}</span>
  );
}

function Section({ titre, icon: Icon, children }: { titre: string; icon: typeof Bandage; children: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint">
        <Icon className="h-3.5 w-3.5" strokeWidth={1.8} /> {titre}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function MedicalGrid({ dossiers }: { dossiers: DossierItem[] }) {
  const [sel, setSel] = useState<DossierItem | null>(null);

  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dossiers.map((d) => (
          <button
            key={d.id}
            onClick={() => setSel(d)}
            className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[0.92rem] font-semibold">{d.nom}</div>
              <StatutBadge statut={d.statut} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.74rem] text-muted">
              <Compteur icon={Bandage} n={d.blessures.length} mot="blessure(s)" />
              <Compteur icon={Pill} n={d.ordonnances.length} mot="ordo." />
              <Compteur icon={Stethoscope} n={d.suivis.length} mot="soin(s)" />
            </div>
            {d.reposJusquAt ? (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[0.72rem]" style={{ color: "var(--warn)" }}>
                <Clock className="h-3.5 w-3.5" strokeWidth={1.8} /> Convalescence
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {sel ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={() => setSel(null)}>
          <div
            className="max-h-[86vh] w-full max-w-[520px] overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-card"
            style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <div className="font-display text-xl">{sel.nom}</div>
                <div className="mt-1.5 flex items-center gap-2">
                  <StatutBadge statut={sel.statut} />
                  {sel.testValide === true ? <span className="text-[0.72rem] text-good">✅ Test d&apos;aptitude validé</span> : null}
                  {sel.testValide === false ? <span className="text-[0.72rem] text-faint">Test non validé</span> : null}
                </div>
              </div>
              <button onClick={() => setSel(null)} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-muted hover:text-ink" aria-label="Fermer">
                <X className="h-4 w-4" />
              </button>
            </div>

            {sel.reposJusquAt || sel.prochainRdv ? (
              <div className="flex flex-wrap gap-2">
                {sel.reposJusquAt ? (
                  <span className="rounded-lg border border-border px-2.5 py-1.5 text-[0.76rem]" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 40%,var(--border))" }}>
                    ⏳ Convalescence jusqu&apos;au {new Date(sel.reposJusquAt).toLocaleDateString("fr-FR")}{sel.reposMotif ? ` — ${sel.reposMotif}` : ""}
                  </span>
                ) : null}
                {sel.prochainRdv ? (
                  <span className="rounded-lg border border-border px-2.5 py-1.5 text-[0.76rem] text-muted">📅 {sel.prochainRdv}</span>
                ) : null}
              </div>
            ) : null}

            {sel.notes ? (
              <div className="mt-3 border-t border-border pt-3">
                <div className="mb-1 text-[0.72rem] uppercase tracking-[0.05em] text-faint">Notes du médecin</div>
                <p className="whitespace-pre-wrap text-[0.86rem] leading-relaxed text-muted">{sel.notes}</p>
              </div>
            ) : null}

            {sel.blessures.length ? (
              <Section titre="Blessures / soins" icon={Bandage}>
                {sel.blessures.slice().reverse().map((b, i) => (
                  <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{b.desc || "Blessure"}</span>
                      {b.gravite ? <span className="shrink-0 text-[0.7rem] font-semibold" style={{ color: "var(--oxblood)" }}>{b.gravite}</span> : null}
                    </div>
                    <div className="mt-0.5 text-[0.72rem] text-faint">
                      {[b.date, b.localisation].filter(Boolean).join(" · ") || "—"}
                    </div>
                  </div>
                ))}
              </Section>
            ) : null}

            {sel.ordonnances.length ? (
              <Section titre="Ordonnances" icon={Pill}>
                {sel.ordonnances.slice().reverse().map((o, i) => (
                  <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
                    <div className="font-medium">{o.medicaments || "Traitement"}</div>
                    <div className="mt-0.5 text-[0.72rem] text-muted">
                      {[o.posologie, o.duree].filter(Boolean).join(" · ") || "—"}
                    </div>
                    {o.conseils ? <div className="mt-0.5 text-[0.72rem] text-faint">{o.conseils}</div> : null}
                  </div>
                ))}
              </Section>
            ) : null}

            {sel.suivis.length ? (
              <Section titre="Suivi de soin" icon={Stethoscope}>
                {sel.suivis.slice().reverse().map((s, i) => (
                  <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
                    <div className="flex items-start justify-between gap-2">
                      <span className="font-medium">{s.soin || "Soin"}</span>
                      {s.soignant ? <span className="shrink-0 text-[0.7rem] text-faint">{s.soignant}</span> : null}
                    </div>
                    <div className="mt-0.5 text-[0.72rem] text-muted">
                      {[s.etat && `état : ${s.etat}`, s.traitement && `traitement : ${s.traitement}`, s.suite && `suite : ${s.suite}`].filter(Boolean).join(" · ") || (s.date ?? "—")}
                    </div>
                  </div>
                ))}
              </Section>
            ) : null}

            {sel.historique.length ? (
              <Section titre="Historique" icon={History}>
                {sel.historique.slice().reverse().slice(0, 12).map((h, i) => (
                  <div key={i} className="flex items-baseline gap-2 text-[0.78rem]">
                    <span className="shrink-0 font-num text-[0.7rem] text-faint">{h.date || ""}</span>
                    <span className="text-muted">{h.action || ""}{h.par ? ` — ${h.par}` : ""}</span>
                  </div>
                ))}
              </Section>
            ) : null}

            {sel.majPar ? <div className="mt-4 text-[0.7rem] text-faint">Dernière mise à jour par {sel.majPar}</div> : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
