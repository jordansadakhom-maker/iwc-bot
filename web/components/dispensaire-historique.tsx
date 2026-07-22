"use client";

import { useMemo, useState } from "react";
import { History, Search } from "lucide-react";
import type { HistoData, HistoItem } from "@/lib/dispensaire-historique";
import { Flash, inputCls } from "@/components/edit-ui";

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };
const MOD_TONE: Record<string, string> = { Stockage: "var(--accent)", Ventes: "var(--good)", Pointage: "var(--accent)", Frais: "var(--warn)", Factures: "var(--oxblood)", Certificats: "var(--accent)", Rapports: "var(--accent)", Documents: "var(--muted)", RH: "var(--warn)", "Matières": "var(--warn)", FDO: "var(--accent)" };

export function DispensaireHistorique({ data }: { data: HistoData }) {
  const [q, setQ] = useState("");
  const [mod, setMod] = useState("");
  const query = norm(q);
  const liste = useMemo(() => data.items.filter((i: HistoItem) => (!mod || i.module === mod) && (!query || norm([i.module, i.action, i.cible, i.detail, i.par].filter(Boolean).join(" ")).includes(query))), [data.items, mod, query]);

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">L&apos;historique s&apos;alimentera dès que les modules contiennent des données (SQL exécuté).</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h2 className="flex items-center gap-2 font-display text-[1.15rem]"><History className="h-5 w-5 text-accent" /> Historique global</h2><span className="font-num text-[0.82rem] text-faint">{liste.length}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " w-52 pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher dans l'historique…" /></div>
          <select className={inputCls + " max-w-[160px]"} value={mod} onChange={(e) => setMod(e.target.value)}><option value="">Tous les modules</option>{data.modules.map((m) => <option key={m} value={m}>{m}</option>)}</select>
        </div>
      </div>

      {liste.length === 0 ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucune entrée.</p> : (
        <div className="overflow-x-auto rounded-[14px] border border-border bg-surface">
          <table className="w-full min-w-[640px] text-left text-[0.8rem]">
            <thead><tr className="border-b border-border text-[0.66rem] uppercase tracking-[0.04em] text-faint">
              <th className="px-3 py-2 font-semibold">Module</th><th className="px-3 py-2 font-semibold">Action</th><th className="px-3 py-2 font-semibold">Cible</th><th className="px-3 py-2 font-semibold">Détail</th><th className="px-3 py-2 font-semibold">Par</th><th className="px-3 py-2 font-semibold">Quand</th>
            </tr></thead>
            <tbody>
              {liste.map((i) => (
                <tr key={i.id} className="border-b border-border/50">
                  <td className="px-3 py-1.5"><span className="rounded-full px-1.5 py-0.5 text-[0.64rem] font-bold uppercase" style={{ color: MOD_TONE[i.module] || "var(--muted)", background: `color-mix(in srgb,${MOD_TONE[i.module] || "var(--muted)"} 13%,transparent)` }}>{i.module}</span></td>
                  <td className="px-3 py-1.5 text-muted">{i.action}</td>
                  <td className="px-3 py-1.5 font-semibold">{i.cible}</td>
                  <td className="px-3 py-1.5 text-faint">{i.detail || "—"}</td>
                  <td className="px-3 py-1.5 text-faint">{i.par || "—"}</td>
                  <td className="px-3 py-1.5 whitespace-nowrap font-num text-faint">{dtFR(i.at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
