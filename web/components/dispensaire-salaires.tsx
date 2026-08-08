"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Coins, Lock, Loader2, Info, Archive, Printer, Trash2, Check } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import type { SalairesData, SalaireFonction, LigneSalaire, ArchivePaie } from "@/lib/dispensaire-salaires";
import { salairePlein, SEUIL_JOURS_PLEIN, joursRetenus, salaireFinal } from "@/lib/dispensaire-salaires-const";
import { setSalaireFonction, archiverSemaine, supprimerArchivePaie, setPrime, setAjustJours, setAjustHeures } from "@/app/dispensaire/salaires/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const money = (n: number) => "$" + (Number(n) || 0).toLocaleString("fr-FR");
const fmtMin = (min: number) => { if (min <= 0) return "0 min"; const h = Math.floor(min / 60), m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };
// Valeur éditable des heures, pré-remplie « H:MM ».
const hhmm = (min: number) => { const v = Math.max(0, Math.round(min)); return `${Math.floor(v / 60)}:${String(v % 60).padStart(2, "0")}`; };
// Parse une saisie d'heures en minutes : « 72 », « 72:30 », « 72h30 », « 72,5 », « 72.5 ». null si invalide.
function heuresSaisieMin(v: string): number | null {
  const t = v.trim().toLowerCase().replace(/\s/g, "");
  if (t === "") return null;
  const m = t.match(/^(\d+)[:h](\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Math.min(59, Number(m[2]));
  const dec = Number(t.replace(",", "."));
  if (Number.isFinite(dec) && dec >= 0) return Math.round(dec * 60);
  return null;
}
const jjmm = (ymd: string) => { const p = (ymd || "").split("-"); return p.length === 3 ? `${p[2]}/${p[1]}` : ymd; };
const escH = (t: unknown) => String(t ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Récapitulatif de paie imprimable (une semaine) → PDF / partage.
function imprimerPaie(a: ArchivePaie) {
  const w = window.open("", "_blank", "width=880,height=1040");
  if (!w) return;
  const rows = a.lignes.map((l) => `<tr><td>${escH(l.nom)}</td><td>${escH(l.fonction || "—")}</td><td class="r">${l.jours}</td><td class="r">${fmtMin(l.heuresMin)}</td><td class="r">${l.prime ? money(l.prime) : "—"}</td><td class="r"><b>${money(l.salaire)}</b></td></tr>`).join("");
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
    <table><thead><tr><th>Salarié</th><th>Fonction</th><th class="r">Jours</th><th class="r">Heures</th><th class="r">Prime</th><th class="r">Salaire</th></tr></thead>
    <tbody>${rows || '<tr><td colspan="6">Aucun salarié.</td></tr>'}</tbody>
    <tfoot><tr><td colspan="5">Total à verser</td><td class="r">${money(a.total)}</td></tr></tfoot></table>
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

  // Prime manuelle : optimiste (recalcule le salaire final = base + prime) puis persiste + trace.
  async function sauverPrime(nom: string, valeur: string) {
    const p = Math.max(0, Math.round(Number(valeur) || 0));
    const cur = lignes.find((l) => l.nom === nom);
    if (!cur || cur.prime === p) return;
    setLignes((prev) => prev.map((l) => (l.nom === nom ? { ...l, prime: p, salaire: l.salaireBase + p } : l)));
    setSaving(nom + "|prime");
    const r = await setPrime(nom, p);
    setSaving(null);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else setFlash({ t: "ok", m: `Prime de ${nom} : ${money(p)}.` });
    router.refresh();
  }
  // Ajustement de jours (±) : recalcule jours retenus + salaire, puis persiste + trace.
  async function sauverAjust(nom: string, valeur: string) {
    const a = Math.max(-14, Math.min(14, Math.round(Number(valeur) || 0)));
    const cur = lignes.find((l) => l.nom === nom);
    if (!cur || cur.ajustJours === a) return;
    const jr = joursRetenus(cur.joursAuto, a);
    const base = salaireFinal(cur.montantHebdo, jr, 0);
    setLignes((prev) => prev.map((l) => (l.nom === nom ? { ...l, ajustJours: a, jours: jr, salaireBase: base, salaire: base + l.prime } : l)));
    setSaving(nom + "|jours");
    const r = await setAjustJours(nom, a);
    setSaving(null);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else setFlash({ t: "ok", m: `Jours de ${nom} ajustés (${a >= 0 ? "+" : ""}${a}).` });
    router.refresh();
  }
  // Ajustement manuel des HEURES (n'impacte PAS le salaire) : on saisit le total
  // corrigé (72 / 72:30 / 72,5), on en déduit le delta vs les heures pointées.
  async function sauverHeures(nom: string, valeur: string) {
    const cur = lignes.find((l) => l.nom === nom);
    if (!cur) return;
    const target = heuresSaisieMin(valeur);
    if (target === null) { setFlash({ t: "bad", m: "Heures invalides — utilise « 72 », « 72:30 » ou « 72,5 »." }); return; }
    if (target === cur.heuresMin) return;
    const delta = target - cur.heuresAutoMin;
    setLignes((prev) => prev.map((l) => (l.nom === nom ? { ...l, heuresMin: Math.max(0, target), ajustMin: delta } : l)));
    setSaving(nom + "|heures");
    const r = await setAjustHeures(nom, delta);
    setSaving(null);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else setFlash({ t: "ok", m: `Heures de ${nom} : ${fmtMin(Math.max(0, target))}.` });
    router.refresh();
  }

  const totalSemaine = lignes.reduce((a, l) => a + l.salaire, 0);
  const editable = data.autorise;

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
        <span>Calcul automatique : <b>4 jours pointés dans la semaine = salaire plein</b>. En deçà, salaire au prorata (jours ÷ 4) ; au-delà de 4 jours, plus besoin d&apos;en faire davantage. Les jours viennent du <b>pointage</b> — corrige-les à la main (colonne <b>Ajust.</b>) s&apos;il manque un pointage, et ajoute une <b>prime</b> : elle s&apos;ajoute au salaire. Chaque changement est tracé dans le journal d&apos;audit.</span>
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
            <table className="w-full min-w-[760px] border-collapse text-left text-[0.82rem]">
              <thead>
                <tr className="text-[0.64rem] uppercase tracking-[0.05em] text-faint">
                  <th className="border-b border-border px-2 py-2 font-semibold">Salarié</th>
                  <th className="border-b border-border px-2 py-2 font-semibold">Fonction</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold">Barème /sem.</th>
                  <th className="border-b border-border px-2 py-2 text-center font-semibold">Jours</th>
                  <th className="border-b border-border px-2 py-2 text-center font-semibold">Ajust.</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold">Heures</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold">Prime ($)</th>
                  <th className="border-b border-border px-2 py-2 text-right font-semibold" style={{ color: "var(--brass-hi)" }}>Salaire</th>
                </tr>
              </thead>
              <tbody>
                {lignes.map((l) => (
                  <tr key={l.nom} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2 py-2 font-semibold">{l.nom}</td>
                    <td className="border-b border-border px-2 py-2 text-faint">{l.fonction || <span className="italic">— non défini —</span>}</td>
                    <td className="border-b border-border px-2 py-2 text-right font-num">{l.montantHebdo ? money(l.montantHebdo) : <span className="text-faint">à définir</span>}</td>
                    <td className="border-b border-border px-2 py-2 text-center font-num">
                      <span className="inline-flex items-center gap-1">{l.jours}{salairePlein(l.jours) ? <span title={`${SEUIL_JOURS_PLEIN} jours atteints — salaire plein`} className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.58rem] font-bold" style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 16%,transparent)" }}><Check className="h-2.5 w-2.5" /> plein</span> : null}</span>
                      {l.ajustJours !== 0 ? <div className="mt-0.5 text-[0.58rem] text-faint" title="Jours détectés au pointage · ajustement manuel">auto {l.joursAuto} · {l.ajustJours > 0 ? "+" : ""}{l.ajustJours}</div> : null}
                    </td>
                    <td className="border-b border-border px-2 py-2 text-center">
                      {editable ? (
                        <span className="inline-flex items-center gap-1">
                          <input key={`aj-${l.nom}-${l.ajustJours}`} type="number" step="1" min={-14} max={14} defaultValue={l.ajustJours || ""} onBlur={(e) => sauverAjust(l.nom, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className={inputCls + " w-14 text-center font-num !py-1"} placeholder="0" title="Correction manuelle des jours (±)" />
                          {saving === l.nom + "|jours" ? <Loader2 className="h-3 w-3 animate-spin text-faint" /> : null}
                        </span>
                      ) : (l.ajustJours ? `${l.ajustJours > 0 ? "+" : ""}${l.ajustJours}` : "—")}
                    </td>
                    <td className="border-b border-border px-2 py-2 text-right">
                      {editable ? (
                        <span className="inline-flex items-center justify-end gap-1">
                          {saving === l.nom + "|heures" ? <Loader2 className="h-3 w-3 animate-spin text-faint" /> : null}
                          <input key={`he-${l.nom}-${l.heuresMin}`} type="text" inputMode="decimal" defaultValue={hhmm(l.heuresMin)} onBlur={(e) => sauverHeures(l.nom, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className={inputCls + " w-[68px] text-right font-num !py-1"} title="Heures retenues — corrige à la main (72, 72:30 ou 72,5)" />
                        </span>
                      ) : <span className="font-num text-muted">{fmtMin(l.heuresMin)}</span>}
                      {l.ajustMin !== 0 ? <div className="mt-0.5 text-[0.58rem] text-faint" title="Heures pointées · ajustement manuel">auto {fmtMin(l.heuresAutoMin)}</div> : null}
                    </td>
                    <td className="border-b border-border px-2 py-2 text-right">
                      {editable ? (
                        <span className="inline-flex items-center gap-1">
                          {saving === l.nom + "|prime" ? <Loader2 className="h-3 w-3 animate-spin text-faint" /> : null}
                          <input key={`pr-${l.nom}-${l.prime}`} type="number" step="1" min={0} defaultValue={l.prime || ""} onBlur={(e) => sauverPrime(l.nom, e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} className={inputCls + " w-20 text-right font-num !py-1"} placeholder="0" title="Prime ajoutée au salaire" />
                        </span>
                      ) : money(l.prime)}
                    </td>
                    <td className="border-b border-border px-2 py-2 text-right font-num font-bold" style={{ color: l.salaire ? "var(--brass-hi)" : "var(--faint)" }}>
                      {money(l.salaire)}
                      {l.prime > 0 ? <div className="text-[0.58rem] font-normal text-faint">dont +{money(l.prime)} prime</div> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="mt-2 text-[0.7rem] text-faint">Les jours et heures proviennent du <b>pointage</b> de la semaine courante ; corrige les jours (<b>Ajust.</b>), les <b>heures</b> (saisis le total corrigé : 72, 72:30 ou 72,5) ou ajoute une <b>prime</b> au besoin. Les heures sont indicatives — elles n&apos;influent pas sur le salaire (calculé sur les jours). Renseigne le barème d&apos;une fonction ci-dessus pour que le salaire se calcule.</p>
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
