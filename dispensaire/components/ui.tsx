"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";

// Bloc « fiche de registre » : en-tête à filet + contenu.
export function Bloc({ titre, icon, compteur, actions, children }: { titre: string; icon?: ReactNode; compteur?: number; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)]">
      <div className="flex items-center gap-2 border-b border-[var(--line)] px-4 py-2.5">
        {icon}
        <h2 className="font-display text-[1.05rem]">{titre}</h2>
        {compteur !== undefined ? <span className="ml-1 rounded-full border border-[var(--line)] px-2 py-0.5 text-[0.7rem] tabnum text-[var(--muted)]">{compteur}</span> : null}
        {actions ? <div className="ml-auto flex items-center gap-2">{actions}</div> : null}
      </div>
      {children}
    </section>
  );
}

export function Vide({ children }: { children: ReactNode }) {
  return <p className="px-4 py-6 text-center text-[0.86rem] italic text-[var(--faint)]">{children}</p>;
}

// Petit identifiant « qui suis-je » partagé (localStorage disp_moi), pour tracer les mouvements.
export function useMoi(): [string, (v: string) => void] {
  const [moi, setMoi] = useState("");
  useEffect(() => { try { setMoi(localStorage.getItem("disp_moi") || ""); } catch {} }, []);
  const set = (v: string) => { setMoi(v); try { localStorage.setItem("disp_moi", v); } catch {} };
  return [moi, set];
}

export function ChampMoi({ moi, onChange }: { moi: string; onChange: (v: string) => void }) {
  return (
    <label className="flex items-center gap-2 text-[0.78rem] text-[var(--muted)]">
      <span className="whitespace-nowrap">Je suis</span>
      <input className="inp !py-1 !text-[0.85rem]" style={{ width: 170 }} value={moi} onChange={(e) => onChange(e.target.value)} placeholder="ton nom" />
    </label>
  );
}
