"use client";

import { useState } from "react";
import { Mic, Gamepad2, MapPin, Clock, Search, FileText } from "lucide-react";
import type { RapportTerrain } from "@/lib/queries";
import { Modal } from "@/components/edit-ui";
import { Badge } from "@/components/ui";

const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const prioTone = (p: string): "warn" | "oxblood" | "muted" => /urgent/i.test(p) ? "oxblood" : /important/i.test(p) ? "warn" : "muted";
const prioLabel = (p: string) => /urgent/i.test(p) ? "Urgente" : /important/i.test(p) ? "Importante" : "Normale";
const clean = (s: string) => s.replace(/^#+\s?/gm, "").replace(/\*\*/g, "");

export function RapportsListe({ rapports }: { rapports: RapportTerrain[] }) {
  const [q, setQ] = useState("");
  const [sel, setSel] = useState<RapportTerrain | null>(null);
  const filtres = rapports.filter((r) => {
    if (!q.trim()) return true;
    const hay = [r.agent, r.cible, r.lieu, r.resume, r.texte].filter(Boolean).join(" ").toLowerCase();
    return hay.includes(q.trim().toLowerCase());
  });

  return (
    <div className="mt-6">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="font-display text-[1.02rem]">Historique des rapports</h3>
        <span className="font-num text-[0.8rem] text-faint">{rapports.length}</span>
      </div>
      {rapports.length === 0 ? (
        <div className="rounded-[12px] border border-border bg-surface-2 px-4 py-8 text-center text-[0.84rem] text-muted">
          Aucun rapport pour l&apos;instant. Chaque scène captée (« Son du jeu » ou « Ma voix ») s&apos;enregistrera ici automatiquement — transcription + résumé, avec recherche.
        </div>
      ) : (
        <>
          <div className="mb-3 flex items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2">
            <Search className="h-4 w-4 text-faint" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un nom, un lieu, un mot…" className="w-full bg-transparent text-[0.86rem] text-ink outline-none placeholder:text-faint" />
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
            {filtres.map((r) => (
              <button key={r.id} onClick={() => setSel(r)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex min-w-0 items-center gap-1.5 text-[0.85rem] font-semibold">
                    {r.source === "micro" ? <Mic className="h-3.5 w-3.5 shrink-0 text-accent" /> : <Gamepad2 className="h-3.5 w-3.5 shrink-0 text-accent" />}
                    <span className="truncate">{r.cible || r.agent || "Rapport"}</span>
                  </span>
                  <Badge tone={prioTone(r.priorite)}>{prioLabel(r.priorite)}</Badge>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-[0.72rem] text-faint">
                  {r.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="h-3 w-3" /> {r.lieu}</span> : null}
                  <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {dateFR(r.createdAt)}</span>
                </div>
                <p className="mt-1.5 line-clamp-3 text-[0.76rem] text-muted">{clean(r.resume || r.texte || "").slice(0, 200)}</p>
              </button>
            ))}
          </div>
          {filtres.length === 0 ? <p className="mt-3 text-center text-[0.8rem] text-faint">Aucun rapport ne correspond à « {q} ».</p> : null}
        </>
      )}
      {sel ? <RapportModal r={sel} onClose={() => setSel(null)} /> : null}
    </div>
  );
}

function RapportModal({ r, onClose }: { r: RapportTerrain; onClose: () => void }) {
  return (
    <Modal titre={r.cible || r.agent || "Rapport de terrain"} onClose={onClose} max={620}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[0.76rem] text-faint">
          <span className="inline-flex items-center gap-1">{r.source === "micro" ? <Mic className="h-3.5 w-3.5" /> : <Gamepad2 className="h-3.5 w-3.5" />} {r.source === "micro" ? "Ma voix" : "Son du jeu"}</span>
          {r.lieu ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5" /> {r.lieu}</span> : null}
          <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" /> {dateFR(r.createdAt)}</span>
          {r.agent ? <span>· {r.agent}</span> : null}
        </div>
        {r.resume ? (
          <div className="rounded-[10px] border border-border bg-surface-2 p-3">
            <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint">Résumé</div>
            <div className="whitespace-pre-wrap text-[0.84rem] leading-relaxed text-ink">{clean(r.resume)}</div>
          </div>
        ) : null}
        {r.texte ? (
          <div className="rounded-[10px] border border-border bg-surface-2 p-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><FileText className="h-3.5 w-3.5" /> Transcription intégrale</div>
            <div className="max-h-[42vh] overflow-y-auto whitespace-pre-wrap text-[0.82rem] leading-relaxed text-muted">{r.texte}</div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
