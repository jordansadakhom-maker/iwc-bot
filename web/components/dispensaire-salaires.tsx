"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Lock, Loader2, Info } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import type { SalairesData, SalaireFonction, LigneSalaire } from "@/lib/dispensaire-salaires";
import { setSalaireFonction } from "@/app/dispensaire/salaires/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const money = (n: number) => "$" + (Number(n) || 0).toLocaleString("fr-FR");
const fmtMin = (min: number) => { if (min <= 0) return "0 min"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
const jjmm = (ymd: string) => { const p = (ymd || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : ymd; };

export function DispensaireSalaires({ data }: { data: SalairesData }) {
  const router = useRouter();
  const [fonctions, setFonctions] = useState<SalaireFonction[]>(data.fonctions);
  const [lignes, setLignes] = useState<LigneSalaire[]>(data.lignes);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { setFonctions(data.fonctions); setLignes(data.lignes); }, [data]);

  if (!data.autorise) {
    return (
      <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
        <Lock className="mx-auto h-6 w-6 text-faint" />
        <p className="mt-2 text-[0.9rem] text-muted">Le calcul des salaires est réservé à la Direction.</p>
      </div>
    );
  }

  async function sauver(fonction: string, valeur: string) {
    const m = Math.max(0, Math.round(Number(valeur) || 0));
    const cur = fonctions.find((f) => f.fonction === fonction);
    if (cur && cur.montantHebdo === m) return;
    setFonctions((p) => p.map((f) => (f.fonction === fonction ? { ...f, montantHebdo: m } : f)));
    setSaving(fonction);
    const r = await setSalaireFonction(fonction, m);
    setSaving(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); } else { setFlash({ t: "ok", m: `Barème « ${fonction} » enregistré.` }); router.refresh(); }
  }

  const totalSemaine = lignes.reduce((a, l) => a + l.salaire, 0);

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-salaires.sql</b> (et <b>dispensaire-pointage.sql</b>) dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><Coins className="h-4 w-4 text-accent" /> Salaires</h3>
        <span className="text-[0.74rem] text-faint">Semaine courante · dès {jjmm(data.semaineLundi)}</span>
      </div>

      <div className="flex items-start gap-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-[0.78rem] text-muted">
        <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-faint" />
        <span>Calcul automatique : <b>salaire = salaire de la fonction ÷ 7 × jours travaillés</b> (jours pris du pointage). Les heures sont affichées à part pour te permettre d&apos;ajouter les primes à la main.</span>
      </div>

      {/* Barème par fonction */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h4 className="mb-2 text-[0.84rem] font-semibold">Barème hebdomadaire par fonction</h4>
        {fonctions.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucune fonction — renseigne le <b>grade</b> des salariés dans RH, il apparaîtra ici.</p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {fonctions.map((f) => (
              <label key={f.fonction} className="flex items-center justify-between gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2">
                <span className="min-w-0 truncate text-[0.84rem] font-medium">{f.fonction}</span>
                <span className="flex shrink-0 items-center gap-1.5">
                  {saving === f.fonction ? <Loader2 className="h-3.5 w-3.5 animate-spin text-faint" /> : null}
                  <span className="text-[0.72rem] text-faint">$/sem.</span>
                  <input type="number" min={0} step="1" defaultValue={f.montantHebdo || ""} onBlur={(e) => sauver(f.fonction, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className={inputCls + " w-24 text-right font-num"} placeholder="0" />
                </span>
              </label>
            ))}
          </div>
        )}
      </section>

      {/* Calcul par employé */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h4 className="text-[0.84rem] font-semibold">Salaires de la semaine</h4>
          <span className="text-[0.78rem] text-faint">Total à verser : <b className="font-num text-ink">{money(totalSemaine)}</b></span>
        </div>
        {lignes.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucun salarié — ajoute des salariés dans RH.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[600px] border-collapse text-left text-[0.82rem]">
              <thead>
                <tr className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">
                  <th className="border-b border-border px-2 py-2 font-semibold">Salarié</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Fonction</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold">Barème /sem.</th>
                  <th className="border-b border-border px-2 py-2 text-center font-semibold">Jours</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold">Heures</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold" style={{ color: "var(--brass-hi)" }}>Salaire</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.nom} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2 py-2 font-semibold">{l.nom}</td>
                    <td className="border-b border-border px-2 py-2 text-faint">{l.fonction || <span className="italic">— non défini —</span>}</td>
                    <td className="border-b border-border px-2 py-2 text-right font-num">{l.montantHebdo ? money(l.montantHebdo) : <span className="text-faint">à définir</span>}</td>
                    <td className="border-b border-border px-2 py-2 text-center font-num">{l.jours}</td>
                    <td className="border-b border-border px-2 py-2 text-right font-num text-muted">{fmtMin(l.heuresMin)}</td>
                    <td className="border-b border-border px-2 py-2 text-right font-num font-bold" style={{ color: l.salaire ? "var(--brass-hi)" : "var(--faint)" }}>{money(l.salaire)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.7rem] text-faint">Les jours et heures proviennent du <b>pointage</b> de la semaine courante. Renseigne le barème d&apos;une fonction ci-dessus pour que le salaire se calcule.</p>
      </section>
    </div>
  );
}
