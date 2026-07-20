"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bandage, ShoppingBag, AlertTriangle } from "lucide-react";
import { vendreBandage } from "@/app/actions";
import { LIMITE_BANDAGES } from "@/lib/const";
import type { VenteBandage } from "@/lib/data";
import { Bloc, Vide, useMoi, ChampMoi } from "./ui";
import { useToast } from "./ux";

function quand(iso: string) {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "2-digit", month: "2-digit" }) + " " + d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

export function Ventes({ ventes, patients = [] }: { ventes: VenteBandage[]; patients?: string[] }) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, start] = useTransition();
  const [moi, setMoi] = useMoi();
  const [patient, setPatient] = useState("");
  const [qte, setQte] = useState("1");

  const parPatient = useMemo(() => {
    const map = new Map<string, number>();
    for (const v of ventes) { const k = v.patient.toLowerCase(); map.set(k, (map.get(k) || 0) + v.quantite); }
    return [...map.entries()].map(([k, total]) => ({ nom: ventes.find((v) => v.patient.toLowerCase() === k)!.patient, total })).sort((a, b) => b.total - a.total);
  }, [ventes]);

  const totalSemaine = ventes.reduce((a, v) => a + v.quantite, 0);
  const dejaCePatient = patient.trim() ? parPatient.find((p) => p.nom.toLowerCase() === patient.trim().toLowerCase())?.total || 0 : 0;

  function vendre() {
    if (patient.trim().length < 2) { toast("Nom du patient requis.", "err"); return; }
    start(async () => {
      const r = await vendreBandage({ patient: patient.trim(), quantite: Number(qte) || 1, auteur: moi });
      if (!r.ok) { toast(r.error || "Échec.", "err"); return; }
      toast(r.alerte ? `Vendu — ${patient.trim()} atteint la limite (${r.total}/${LIMITE_BANDAGES}).` : `Vendu — ${patient.trim()} : ${r.total}/${LIMITE_BANDAGES} cette semaine.`, r.alerte ? "info" : "ok");
      setPatient(""); setQte("1"); router.refresh();
    });
  }

  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <aside className="lg:sticky lg:top-4 lg:self-start">
        <section className="rounded-[8px] border border-[var(--line)] bg-[var(--card)] p-4">
          <h2 className="mb-1 flex items-center gap-2 font-display text-[1.05rem]"><Bandage className="h-4 w-4 text-[var(--muted)]" /> Vendre des bandages</h2>
          <p className="mb-3 text-[0.8rem] text-[var(--muted)]">Limite légale : <b>{LIMITE_BANDAGES} bandages par personne et par semaine.</b></p>
          <div className="mb-2"><ChampMoi moi={moi} onChange={setMoi} /></div>
          <label className="mb-1 block text-[0.68rem] uppercase tracking-[0.08em] text-[var(--faint)]">Patient</label>
          <input className="inp mb-2" list="disp-patients" value={patient} onChange={(e) => setPatient(e.target.value)} placeholder="Prénom Nom" onKeyDown={(e) => { if (e.key === "Enter") vendre(); }} />
          <datalist id="disp-patients">{patients.map((n) => <option key={n} value={n} />)}</datalist>
          {patient.trim() ? <p className="mb-2 text-[0.78rem] text-[var(--muted)]">Déjà cette semaine : <b style={{ color: dejaCePatient >= LIMITE_BANDAGES ? "var(--oxblood)" : "var(--ink)" }}>{dejaCePatient}/{LIMITE_BANDAGES}</b></p> : null}
          <label className="mb-1 block text-[0.68rem] uppercase tracking-[0.08em] text-[var(--faint)]">Quantité</label>
          <input className="inp mb-3 tabnum" type="number" min={1} max={LIMITE_BANDAGES} value={qte} onChange={(e) => setQte(e.target.value)} />
          <button className="btn-accent btn w-full justify-center" onClick={vendre} disabled={isPending}>{isPending ? <span className="spin" /> : <ShoppingBag className="h-4 w-4" />} Enregistrer la vente</button>
        </section>
      </aside>

      <div className="flex flex-col gap-5">
        <Bloc titre="Cette semaine — par patient" icon={<AlertTriangle className="h-4 w-4 text-[var(--muted)]" />} compteur={parPatient.length} actions={<span className="text-[0.78rem] text-[var(--muted)]">Total : <b className="tabnum">{totalSemaine}</b></span>}>
          {parPatient.length === 0 ? <Vide>Aucune vente cette semaine.</Vide> : (
            <ul>
              {parPatient.map((p) => {
                const atteint = p.total >= LIMITE_BANDAGES;
                return (
                  <li key={p.nom} className="rise flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2.5 last:border-0">
                    {atteint ? <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: "var(--oxblood)" }} /> : <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: "var(--good)" }} />}
                    <span className="min-w-0 flex-1 truncate font-medium">{p.nom}</span>
                    <div className="h-2 w-24 overflow-hidden rounded-full bg-[var(--paper-2)]">
                      <div className="h-full rounded-full" style={{ width: `${Math.min(100, (p.total / LIMITE_BANDAGES) * 100)}%`, background: atteint ? "var(--oxblood)" : "var(--good)" }} />
                    </div>
                    <span className="tabnum w-14 text-right font-bold" style={{ color: atteint ? "var(--oxblood)" : "var(--ink)" }}>{p.total}/{LIMITE_BANDAGES}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </Bloc>

        <Bloc titre="Journal des ventes" compteur={ventes.length}>
          {ventes.length === 0 ? <Vide>Aucune vente enregistrée cette semaine.</Vide> : (
            <ul className="max-h-[360px] overflow-auto">
              {ventes.map((v) => (
                <li key={v.id} className="flex items-center gap-3 border-b border-[var(--line)]/60 px-4 py-2 text-[0.85rem] last:border-0">
                  <span className="tabnum w-8 shrink-0 text-right font-bold" style={{ color: "var(--accent)" }}>{v.quantite}</span>
                  <span className="min-w-0 flex-1 truncate">{v.patient}</span>
                  <span className="hidden shrink-0 text-[0.78rem] text-[var(--muted)] sm:inline">{v.auteur || "—"}</span>
                  <span className="shrink-0 text-[0.72rem] text-[var(--faint)] tabnum">{quand(v.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Bloc>
      </div>
    </div>
  );
}
