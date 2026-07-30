"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Lock, Loader2, Info, Archive, Printer, Trash2, Check } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import type { SalairesData, SalaireFonction, LigneSalaire, ArchivePaie } from "@/lib/dispensaire-salaires";
import { setSalaireFonction, archiverSemaine, supprimerArchivePaie } from "@/app/dispensaire/salaires/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const money = (n: number) => "$" + (Number(n) || 0).toLocaleString("fr-FR");
const fmtMin = (min: number) => { if (min <= 0) return "0 min"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
const jjmm = (ymd: string) => { const p = (ymd || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : ymd; };
const escH = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Récapitulatif de paie imprimable (une semaine) → PDF / partage.
function imprimerPaie(a: ArchivePaie) {
  const w = window.open("", "_blank", "width=880,height=1040");
  if (!w) return;
  const rows = a.lignes.map((l) => `<tr><td>${escH(l.nom)}</td><td>${escH(l.fonction || "—")}</td><td class="r">${l.jours}</td><td class="r">${fmtMin(l.heuresMin)}</td><td class="r"><b>${money(l.salaire)}</b></td></tr>`).join("");
  w.document.write(`<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Paie — semaine du ${escH(jjmm(a.semaineLundi))}</title>
  <style>@page{margin:1.8cm}body{font-family:Georgia,'Times New Roman',serif;color:#2a2115;background:#fff;margin:0;padding:0}
  .doc{background:linear-gradient(180deg,#efe6cf,#e7dcc0);border:2px solid #b8a67e;box-shadow:inset 0 0 0 5px #efe6cf,inset 0 0 0 6px #cdb98d;padding:30px 34px}
  h1{font-size:20px;text-align:center;text-transform:uppercase;letter-spacing:.06em;margin:2px 0}
  .sub{text-align:center;font-style:italic;color:#6b5535;font-size:13px;margin-bottom:16px}
  table{width:100%;border-collapse:collapse;font-family:'Courier New',monospace;margin-top:6px}
  th{border-bottom:2px solid #8a7850;text-align:left;font-size:13px;padding:4px 6px}
  th.r,td.r{text-align:right}
  td{border-bottom:1px solid #c7b68e66;font-size:13px;padding:4px 6px;break-inside:avoid}
  tfoot td{border-top:2px solid #8a7850;font-weight:bold;font-size:14px}
  .foot{margin-top:22px;border-top:1px solid #b8a67e;padding-top:8px;text-align:center;font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#6a5c3f}</style></head>
  <body><div class="doc">
    <div style="text-align:center;font-size:20px">⚕</div>
    <h1>Dispensaire de Saint-Denis — Paie</h1>
    <div class="sub">Semaine du ${escH(jjmm(a.semaineLundi))} · Registre 1904</div>
    <table><thead><tr><th>Salarié</th><th>Fonction</th><th class="r">Jours</th><th class="r">Heures</th><th class="r">Salaire</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="5">Aucun salarié.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="4">Total à verser</td><td class="r">${money(a.total)}</td></tr></tfoot></table>
    <div class="foot">Document interne — Direction du Dispensaire de Saint-Denis</div>
  </div><script>window.onload=function(){window.print()}</script></body></html>`);
  w.document.close();
}

export function DispensaireSalaires({ data }: { data: SalairesData }) {
  const router = useRouter();
  const [fonctions, setFonctions] = useState<SalaireFonction[]>(data.fonctions);
  const [lignes, setLignes] = useState<LigneSalaire[]>(data.lignes);
  const [archives, setArchives] = useState<ArchivePaie[]>(data.archives);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => { setFonctions(data.fonctions); setLignes(data.lignes); setArchives(data.archives); }, [data]);

  async function archiver() {
    setBusy("arch");
    const r = await archiverSemaine();
    setBusy(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: `Semaine figée — ${r.nb} salarié(s), total ${money(r.total || 0)}.` });
    router.refresh();
  }
  async function supprimerArchive(sem: string) {
    setArchives((p) => p.filter((a) => a.semaineLundi !== sem));
    const r = await supprimerArchivePaie(sem);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }

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
          <div className="flex items-center gap-2">
            <span className="text-[0.78rem] text-faint">Total à verser : <b className="font-num text-ink">{money(totalSemaine)}</b></span>
            <button onClick={archiver} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: data.semaineArchivee ? "var(--good)" : "var(--accent)" }} title="Enregistre un instantané des salaires de cette semaine">
              {busy === "arch" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : data.semaineArchivee ? <Check className="h-3.5 w-3.5" /> : <Archive className="h-3.5 w-3.5" />} {data.semaineArchivee ? "Semaine figée — ré-archiver" : "Figer la semaine"}
            </button>
          </div>
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

      {/* Archives de paie (semaines figées) */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h4 className="mb-2 flex items-center gap-2 text-[0.84rem] font-semibold"><Archive className="h-4 w-4 text-accent" /> Archives de paie <span className="font-num text-[0.78rem] text-faint">({archives.length})</span></h4>
        {archives.length === 0 ? (
          <p className="py-3 text-center text-[0.82rem] italic text-faint">Aucune semaine figée. Clique « Figer la semaine » pour archiver la paie et la retrouver ici.</p>
        ) : (
          <div className="flex flex-col gap-1.5">
            {archives.map((a) => (
              <div key={a.semaineLundi} className="group flex flex-wrap items-center gap-x-3 gap-y-1 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.8rem]">
                <span className="font-semibold">Semaine du {jjmm(a.semaineLundi)}</span>
                <span className="text-faint">{a.lignes.length} salarié{a.lignes.length > 1 ? "s" : ""}</span>
                <span className="font-num" style={{ color: "var(--brass-hi)" }}>{money(a.total)}</span>
                <div className="ml-auto flex items-center gap-1">
                  <button onClick={() => imprimerPaie(a)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Imprimer le récapitulatif" title="Imprimer / PDF"><Printer className="h-3.5 w-3.5" /></button>
                  <button onClick={() => supprimerArchive(a.semaineLundi)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer l'archive"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
