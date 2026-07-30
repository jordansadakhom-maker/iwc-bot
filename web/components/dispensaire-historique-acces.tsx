"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import type { HistoriqueAccesData } from "@/lib/dispensaire-acces";
import { inputCls } from "@/components/edit-ui";

const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const dureeFR = (s: number | null) => { if (s == null) return "—"; if (s < 60) return `${s}s`; const m = Math.floor(s / 60), r = s % 60; return m < 60 ? `${m} min${r ? " " + r + "s" : ""}` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, "0")}`; };
const PERIODES = [{ k: "tout", l: "Tout" }, { k: "24h", l: "24 h" }, { k: "7j", l: "7 jours" }, { k: "30j", l: "30 jours" }] as const;

// Historique des accès aux modules Direction : qui a ouvert quoi, quand, combien
// de temps. Filtres : utilisateur, module, période. Réservé à la direction.
export function DispensaireHistoriqueAcces({ data }: { data: HistoriqueAccesData }) {
  const [q, setQ] = useState("");
  const [user, setUser] = useState("");
  const [module, setModule] = useState("");
  const [periode, setPeriode] = useState<string>("tout");

  const users = useMemo(() => [...new Set(data.entrees.map((e) => e.nom))].sort((a, b) => a.localeCompare(b)), [data.entrees]);
  const modules = useMemo(() => [...new Set(data.entrees.map((e) => e.moduleLabel))].sort((a, b) => a.localeCompare(b)), [data.entrees]);

  const liste = useMemo(() => {
    const now = Date.now();
    const seuil = periode === "24h" ? now - 86400000 : periode === "7j" ? now - 7 * 86400000 : periode === "30j" ? now - 30 * 86400000 : 0;
    const t = q.trim().toLowerCase();
    return data.entrees.filter((e) => {
      if (user && e.nom !== user) return false;
      if (module && e.moduleLabel !== module) return false;
      if (seuil && (Date.parse(e.ouvertAt) || 0) < seuil) return false;
      if (t && !`${e.nom} ${e.role || ""} ${e.moduleLabel}`.toLowerCase().includes(t)) return false;
      return true;
    });
  }, [data.entrees, q, user, module, periode]);

  if (!data.peut) return null;

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><History className="h-4 w-4 text-accent" /> Historique des accès Direction <span className="font-num text-[0.78rem] text-faint">({liste.length})</span></h3>
        <div className="flex items-center gap-1">{PERIODES.map((p) => <button key={p.k} onClick={() => setPeriode(p.k)} className="rounded-lg px-2 py-1 text-[0.72rem] font-semibold transition" style={periode === p.k ? { color: "#000", background: "var(--accent)" } : { color: "var(--muted)", border: "1px solid var(--border)" }}>{p.l}</button>)}</div>
      </div>

      {!data.pret ? <p className="mb-3 text-[0.8rem]" style={{ color: "var(--oxblood)" }}>Lance <b>web/prisma/sql/dispensaire-acces.sql</b> dans Supabase, puis recharge.</p> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[160px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
        <select className={inputCls + " max-w-[170px]"} value={user} onChange={(e) => setUser(e.target.value)}><option value="">Tous les utilisateurs</option>{users.map((u) => <option key={u} value={u}>{u}</option>)}</select>
        <select className={inputCls + " max-w-[180px]"} value={module} onChange={(e) => setModule(e.target.value)}><option value="">Tous les modules</option>{modules.map((m) => <option key={m} value={m}>{m}</option>)}</select>
      </div>

      {liste.length === 0 ? (
        <p className="py-6 text-center text-[0.82rem] italic text-faint">Aucun accès enregistré {periode !== "tout" || user || module || q ? "pour ce filtre" : "pour l'instant"}.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-[0.8rem]">
            <thead><tr className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">
              <th className="border-b border-border px-2 py-2 font-semibold">Quand</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Utilisateur</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Rôle</th>
              <th className="border-b border-border px-2 py-2 font-semibold">Module</th>
              <th className="border-b border-border px-2 py-2 text-right font-semibold">Durée</th>
            </tr></thead>
            <tbody>
              {liste.map((e) => (
                <tr key={e.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                  <td className="border-b border-border px-2 py-2 font-num text-faint">{dtFR(e.ouvertAt)}</td>
                  <td className="border-b border-border px-2 py-2 font-semibold">{e.nom}</td>
                  <td className="border-b border-border px-2 py-2 text-muted">{e.role || "—"}</td>
                  <td className="border-b border-border px-2 py-2">{e.moduleLabel}</td>
                  <td className="border-b border-border px-2 py-2 text-right font-num text-muted">{dureeFR(e.dureeSec)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
