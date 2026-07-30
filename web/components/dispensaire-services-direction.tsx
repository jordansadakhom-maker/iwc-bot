"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Loader2, Check, ChevronDown } from "lucide-react";
import { inputCls } from "@/components/edit-ui";
import type { ServiceAValider } from "@/lib/dispensaire-pointage";
import { cloturerServiceDirection } from "@/app/dispensaire/pointage/actions";

const dt = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", weekday: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const fmtMin = (m: number) => { const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h ${String(r).padStart(2, "0")}` : `${m} min`; };
function toLocalInput(iso: string | null) { const d = iso ? new Date(iso) : new Date(); const off = d.getTimezoneOffset(); return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16); }

// Tableau réservé à la Direction : services restés ouverts (« à confirmer » ou
// escaladés au-delà du seuil). La Direction clôture à l'heure du dernier signal
// (par défaut) ou corrige l'heure, avec un commentaire — le tout tracé.
export function ServicesDirection({ services }: { services: ServiceAValider[] }) {
  const router = useRouter();
  const [rows, setRows] = useState<ServiceAValider[]>(services);
  const [open, setOpen] = useState<string | null>(null);
  const [fin, setFin] = useState("");
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  if (!rows.length) return null;

  function ouvrir(s: ServiceAValider) {
    if (open === s.id) { setOpen(null); return; }
    setOpen(s.id); setErr(null); setComment(""); setFin(toLocalInput(s.lastSeen));
  }
  async function traiter(id: string) {
    setBusy(id); setErr(null);
    const iso = fin ? new Date(fin).toISOString() : null;
    const r = await cloturerServiceDirection(id, iso, comment);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setRows((p) => p.filter((x) => x.id !== id)); setOpen(null); router.refresh();
  }

  return (
    <section className="rounded-[14px] border p-4" style={{ borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 5%,transparent)" }}>
      <h3 className="mb-1 flex items-center gap-2 text-[0.9rem] font-semibold" style={{ color: "var(--warn)" }}>
        <ShieldAlert className="h-4 w-4" /> Services à valider <span className="font-num rounded-full px-1.5 py-0.5 text-[0.66rem] text-white" style={{ background: "var(--warn)" }}>{rows.length}</span>
      </h3>
      <p className="mb-3 text-[0.76rem] text-muted">Services restés ouverts (oubli probable ou escalade). Clôture au dernier signal par défaut — corrige l&apos;heure si besoin, ajoute un commentaire. Toutes les actions sont tracées.</p>
      <div className="flex flex-col gap-1.5">
        {rows.map((s) => (
          <div key={s.id} className="rounded-[10px] border border-border bg-surface">
            <button onClick={() => ouvrir(s)} className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-[0.82rem]">
              <span className="font-semibold">{s.nom}</span>
              <span className="text-faint">début {dt(s.debut)}</span>
              <span className="text-faint">· dernier signal {dt(s.lastSeen)}</span>
              <span className="font-num text-muted">· ouvert {fmtMin(s.dureeMin)}</span>
              <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold" style={{ color: s.motif === "escalade" ? "var(--oxblood)" : "var(--warn)", background: `color-mix(in srgb,${s.motif === "escalade" ? "var(--oxblood)" : "var(--warn)"} 14%,transparent)` }}>{s.motif === "escalade" ? "escaladé" : "à confirmer"}</span>
              <ChevronDown className="ml-auto h-4 w-4 text-faint transition" style={{ transform: open === s.id ? "rotate(180deg)" : "none" }} />
            </button>
            {open === s.id ? (
              <div className="flex flex-col gap-2 border-t border-border px-3 py-2.5">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.05em] text-faint">Heure de fin</span><input type="datetime-local" className={inputCls} value={fin} onChange={(e) => setFin(e.target.value)} /></label>
                  <label className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.05em] text-faint">Commentaire</span><input className={inputCls} value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Motif de la correction…" /></label>
                </div>
                {err ? <p className="text-[0.78rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
                <button onClick={() => traiter(s.id)} disabled={busy === s.id} className="self-end inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === s.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Clôturer & valider</button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}
