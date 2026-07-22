"use client";

import { useState } from "react";
import { CalendarClock, MapPin, User, Hourglass, MessageSquare, Users, Globe, ExternalLink } from "lucide-react";
import type { RdvItem } from "@/lib/queries";
import { Modal } from "@/components/edit-ui";
import { Badge, Empty } from "@/components/ui";
import { AgendaLieuPhoto } from "@/components/agenda-lieu-photo";

const RDV_TONE: Record<string, "good" | "warn" | "muted" | "accent"> = {
  planifié: "warn", planifie: "warn", nouveau: "warn", transmis: "accent", confirmé: "accent", confirme: "accent",
  honoré: "good", honore: "good", lapin: "muted", annulé: "muted", annule: "muted", décliné: "muted", decline: "muted",
};

const CATS = [
  { key: "atraiter", label: "À traiter", color: "var(--warn)" },
  { key: "confirme", label: "Confirmés", color: "var(--steel)" },
  { key: "honore", label: "Honorés", color: "var(--good)" },
  { key: "clos", label: "Clos", color: "var(--faint)" },
] as const;
function catDe(statut: string): "atraiter" | "confirme" | "honore" | "clos" {
  const s = (statut || "").toLowerCase();
  if (["planifié", "planifie", "nouveau", "transmis", "demande", "attente"].includes(s)) return "atraiter";
  if (["confirmé", "confirme"].includes(s)) return "confirme";
  if (["honoré", "honore"].includes(s)) return "honore";
  return "clos";
}

export function AgendaRdvs({ rdvs }: { rdvs: RdvItem[] }) {
  const [sel, setSel] = useState<RdvItem | null>(null);
  const [cat, setCat] = useState("");

  if (rdvs.length === 0) {
    return <Empty icon={CalendarClock}>Aucun rendez-vous pour l&apos;instant. Les demandes (Discord et site public) apparaîtront ici.</Empty>;
  }

  const counts = CATS.map((c) => ({ ...c, n: rdvs.filter((r) => catDe(r.statut) === c.key).length })).filter((c) => c.n);
  // Filtre par catégorie + les « à traiter » remontent toujours en tête.
  const affiches = [...rdvs]
    .filter((r) => !cat || catDe(r.statut) === cat)
    .sort((a, b) => Number(catDe(b.statut) === "atraiter") - Number(catDe(a.statut) === "atraiter"));

  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setCat("")} aria-pressed={!cat}
          className="rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition"
          style={!cat ? { borderColor: "color-mix(in srgb,var(--accent) 55%,var(--border))", background: "color-mix(in srgb,var(--accent) 16%,transparent)", color: "var(--accent)" } : { borderColor: "var(--border)", color: "var(--muted)" }}>
          Tous <span className="font-num text-faint">{rdvs.length}</span>
        </button>
        {counts.map((c) => {
          const on = cat === c.key;
          return (
            <button key={c.key} onClick={() => setCat(on ? "" : c.key)} aria-pressed={on}
              className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[0.72rem] font-semibold transition"
              style={{ borderColor: on ? `color-mix(in srgb,${c.color} 55%,var(--border))` : "var(--border)", background: on ? `color-mix(in srgb,${c.color} 16%,transparent)` : "transparent", color: on ? "var(--ink)" : "var(--muted)" }}>
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: c.color }} /> {c.label} <span className="font-num text-faint">{c.n}</span>
            </button>
          );
        })}
      </div>
      <p className="mb-2 text-[0.74rem] text-faint">Clique sur un rendez-vous pour voir tous ses détails.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[680px] border-collapse text-left text-[0.85rem]">
          <thead>
            <tr className="text-[0.7rem] uppercase tracking-[0.06em] text-faint">
              {["Client", "Prestation", "Lieu", "Créneau", "Statut", "Lieu (photo)"].map((h) => <th key={h} className="border-b border-border px-2.5 py-2 font-semibold">{h}</th>)}
            </tr>
          </thead>
          <tbody>
            {affiches.map((r) => (
              <tr key={r.id} className="cursor-pointer hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                <td onClick={() => setSel(r)} className="border-b border-border px-2.5 py-2.5 font-medium">
                  {r.nomRP || "—"}
                  {r.source === "web" ? <span className="ml-1.5 align-middle"><Badge tone="accent">web</Badge></span> : null}
                  {r.assignes.length ? <span className="ml-1.5 align-middle text-[0.7rem] text-faint">· {r.assignes.length} assigné(s)</span> : null}
                </td>
                <td onClick={() => setSel(r)} className="border-b border-border px-2.5 py-2.5 text-muted">{r.type || "—"}</td>
                <td onClick={() => setSel(r)} className="border-b border-border px-2.5 py-2.5 text-muted">{r.lieu || "—"}</td>
                <td onClick={() => setSel(r)} className="border-b border-border px-2.5 py-2.5 text-muted">
                  {r.creneau || "—"}
                  {r.duree ? <span className="block text-[0.72rem] text-faint">⏳ {r.duree}</span> : null}
                </td>
                <td onClick={() => setSel(r)} className="border-b border-border px-2.5 py-2.5"><Badge tone={RDV_TONE[r.statut?.toLowerCase()] ?? "muted"}>{r.statut}</Badge></td>
                <td className="border-b border-border px-2.5 py-2.5"><AgendaLieuPhoto id={r.id} lieuPhoto={r.lieuPhoto} lieu={r.lieu} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {sel ? <DetailModal rdv={sel} onClose={() => setSel(null)} /> : null}
    </>
  );
}

function Ligne({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-[0.86rem]">
      <span className="mt-0.5 text-faint">{icon}</span>
      <div><span className="text-faint">{label} : </span><span className="text-ink">{children}</span></div>
    </div>
  );
}

function DetailModal({ rdv, onClose }: { rdv: RdvItem; onClose: () => void }) {
  return (
    <Modal titre={rdv.nomRP || "Rendez-vous"} onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={RDV_TONE[rdv.statut?.toLowerCase()] ?? "muted"}>{rdv.statut}</Badge>
          {rdv.source === "web" ? <Badge tone="accent">via le site</Badge> : <Badge>Discord</Badge>}
        </div>

        <div className="flex flex-col gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
          {rdv.type ? <Ligne icon={<User className="h-3.5 w-3.5" />} label="Prestation">{rdv.type}</Ligne> : null}
          {rdv.duree ? <Ligne icon={<Hourglass className="h-3.5 w-3.5" />} label="Durée estimée">{rdv.duree}</Ligne> : null}
          {rdv.creneau ? <Ligne icon={<CalendarClock className="h-3.5 w-3.5" />} label="Créneau">{rdv.creneau}</Ligne> : null}
          {rdv.lieu ? <Ligne icon={<MapPin className="h-3.5 w-3.5" />} label="Lieu">{rdv.lieu}</Ligne> : null}
          {rdv.contact ? <Ligne icon={<MessageSquare className="h-3.5 w-3.5" />} label="Contact">{rdv.contact}</Ligne> : null}
          {rdv.assignes.length ? <Ligne icon={<Users className="h-3.5 w-3.5" />} label="Assignés">{rdv.assignes.join(", ")}</Ligne> : null}
        </div>

        {rdv.message ? (
          <div className="rounded-[10px] border border-border bg-surface-2 px-3 py-2.5 text-[0.84rem]">
            <div className="mb-1 text-[0.7rem] uppercase tracking-[0.05em] text-faint">Demande du client</div>
            <p className="whitespace-pre-wrap text-ink">{rdv.message}</p>
          </div>
        ) : null}

        {rdv.lieuPhoto ? (
          <div>
            <div className="mb-1 text-[0.7rem] uppercase tracking-[0.05em] text-faint">Photo du lieu</div>
            <a href={rdv.lieuPhoto} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={rdv.lieuPhoto} alt="Lieu du rendez-vous" className="max-h-56 w-full rounded-[10px] border border-border object-cover" />
            </a>
          </div>
        ) : null}

        <div className="flex items-center justify-between border-t border-border pt-3">
          <a href="/communication" className="inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-muted hover:text-ink"><ExternalLink className="h-3.5 w-3.5" /> Gérer (assigner, répondre, statut)</a>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
        </div>
      </div>
    </Modal>
  );
}
