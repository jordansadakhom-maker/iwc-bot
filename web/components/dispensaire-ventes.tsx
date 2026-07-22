"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeDollarSign, Plus, Loader2, Trash2, AlertTriangle, Bandage } from "lucide-react";
import { PRIX_BANDAGE, MAX_BANDAGES_SEM, money, type VentesData, type Vente } from "@/lib/dispensaire-facturation-const";
import { Flash, inputCls } from "@/components/edit-ui";
import { creerVente, supprimerVente } from "@/app/dispensaire/ventes/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; } };

export function DispensaireVentes({ data }: { data: VentesData }) {
  const router = useRouter();
  const [ventes, setVentes] = useState<Vente[]>(data.ventes);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ patient: "", item: "Bandage", quantite: "1", prixUnitaire: String(PRIX_BANDAGE), note: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const semaine = data.semaine;
  const total = useMemo(() => (Math.max(1, Number(v.quantite) || 1)) * (Number(v.prixUnitaire) || 0), [v.quantite, v.prixUnitaire]);

  async function ajouter() {
    if (!v.patient.trim()) { setFlash({ t: "bad", m: "Indique le patient." }); return; }
    setBusy(true);
    const r = await creerVente({ ...v, quantite: Number(v.quantite) || 1, prixUnitaire: Number(v.prixUnitaire) || 0 });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    const tmp: Vente = { id: r.id || "tmp", patient: v.patient.trim(), item: v.item || "Bandage", quantite: Math.max(1, Number(v.quantite) || 1), prixUnitaire: Number(v.prixUnitaire) || 0, total, note: v.note || null, par: null, createdAt: new Date().toISOString() };
    setVentes((p) => [tmp, ...p]);
    setV({ patient: "", item: "Bandage", quantite: "1", prixUnitaire: String(PRIX_BANDAGE), note: "" });
    setFlash({ t: "ok", m: "Vente enregistrée." });
    router.refresh();
  }
  async function supprimer(id: string) { setVentes((p) => p.filter((x) => x.id !== id)); const r = await supprimerVente(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-facturation.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Enregistrer une vente */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-1 flex items-center gap-2 text-[0.9rem] font-semibold"><BadgeDollarSign className="h-4 w-4 text-accent" /> Enregistrer une vente</h3>
        <p className="mb-3 text-[0.72rem] text-faint">Règle : <b>{MAX_BANDAGES_SEM} bandages</b> maximum par patient et par semaine, à <b>{money(PRIX_BANDAGE)}</b> l&apos;unité.</p>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Patient</span><input className={inputCls} value={v.patient} onChange={set("patient")} placeholder="Prénom Nom" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Article</span><input className={inputCls} value={v.item} onChange={set("item")} placeholder="Bandage" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Quantité</span><input className={inputCls} value={v.quantite} onChange={(e) => setV((p) => ({ ...p, quantite: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Prix unité ($)</span><input className={inputCls} value={v.prixUnitaire} onChange={(e) => setV((p) => ({ ...p, prixUnitaire: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></label>
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Note</span><input className={inputCls} value={v.note} onChange={set("note")} placeholder="Optionnel" /></label>
          <div className="flex items-end lg:col-span-1"><div className="text-[0.8rem] text-faint">Total <b className="font-num text-ink">{money(total)}</b></div></div>
          <div className="flex items-end justify-end"><button onClick={ajouter} disabled={busy} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Vendre</button></div>
        </div>
      </section>

      {/* Suivi hebdo par patient */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Bandage className="h-4 w-4 text-accent" /> Cette semaine</h3>
          <span className="text-[0.78rem] text-faint">Recette <b className="font-num text-ink">{money(data.caSemaine)}</b></span>
        </div>
        {semaine.length === 0 ? <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucune vente cette semaine.</p> : (
          <div className="flex flex-col divide-y divide-border">
            {semaine.map((p) => (
              <div key={p.patient} className="flex items-center justify-between gap-2 py-1.5 text-[0.82rem]">
                <span className="min-w-0 flex-1 truncate font-semibold">{p.patient}</span>
                <span className="shrink-0 font-num" style={{ color: p.depasse ? "var(--oxblood)" : "var(--muted)" }}>{p.bandages}/{MAX_BANDAGES_SEM} bandages</span>
                {p.depasse ? <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-2.5 w-2.5" /> dépassé</span> : null}
                <span className="w-16 shrink-0 text-right font-num text-faint">{money(p.total)}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Dernières ventes */}
      {ventes.length ? (
        <section className="rounded-[14px] border border-border bg-surface p-4">
          <h3 className="mb-2 text-[0.9rem] font-semibold">Dernières ventes</h3>
          <div className="flex flex-col divide-y divide-border">
            {ventes.slice(0, 40).map((s) => (
              <div key={s.id} className="group flex items-center gap-2 py-1.5 text-[0.8rem]">
                <span className="min-w-0 flex-1 truncate"><b className="font-semibold">{s.patient}</b> <span className="text-faint">· {s.quantite}× {s.item}</span></span>
                <span className="shrink-0 font-num text-muted">{money(s.total)}</span>
                <span className="shrink-0 text-faint">{dtFR(s.createdAt)}</span>
                <button onClick={() => supprimer(s.id)} className="shrink-0 text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </section>
      ) : null}
    </div>
  );
}
