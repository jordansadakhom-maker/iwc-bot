"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Plus, Loader2, Trash2, Check, X, Banknote } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { FRAIS_STATUTS, fraisStatut, money, type FraisData, type Frais } from "@/lib/dispensaire-facturation-const";
import { Flash, inputCls } from "@/components/edit-ui";
import { creerFrais, statutFrais, supprimerFrais } from "@/app/dispensaire/frais/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dtFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short" }).format(new Date(iso)); } catch { return "—"; } };

export function DispensaireFrais({ data }: { data: FraisData }) {
  const router = useRouter();
  const canValidate = data.canValidate;
  const [frais, setFrais] = useState<Frais[]>(data.frais);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [filtre, setFiltre] = useState("");
  const [v, setV] = useState({ objet: "", montant: "0", demandeur: "", note: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const liste = frais.filter((f) => !filtre || f.statut === filtre);
  const enAttente = frais.filter((f) => f.statut === "en_attente").length;

  async function ajouter() {
    if (!v.objet.trim()) { setFlash({ t: "bad", m: "Donne l'objet de la note." }); return; }
    setBusy(true);
    const r = await creerFrais({ ...v, montant: Number(v.montant) || 0 });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    const tmp: Frais = { id: r.id || "tmp", objet: v.objet.trim(), montant: Number(v.montant) || 0, demandeur: v.demandeur || null, statut: "en_attente", validePar: null, note: v.note || null, par: null, createdAt: new Date().toISOString() };
    setFrais((p) => [tmp, ...p]);
    setV({ objet: "", montant: "0", demandeur: "", note: "" });
    setFlash({ t: "ok", m: "Note de frais déposée." });
    router.refresh();
  }
  async function changer(f: Frais, statut: string) {
    setFrais((p) => p.map((x) => (x.id === f.id ? { ...x, statut } : x)));
    const r = await statutFrais(f.id, statut);
    if (!r.ok) { setFrais((p) => p.map((x) => (x.id === f.id ? { ...x, statut: f.statut } : x))); setFlash({ t: "bad", m: r.error || "Impossible." }); } else router.refresh();
  }
  async function supprimer(id: string) { setFrais((p) => p.filter((x) => x.id !== id)); const r = await supprimerFrais(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-facturation.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Déposer une note de frais */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><FileText className="h-4 w-4 text-accent" /> Déposer une note de frais</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Objet</span><input className={inputCls} value={v.objet} onChange={set("objet")} placeholder="Achat, déplacement…" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Montant ($)</span><input className={inputCls} value={v.montant} onChange={(e) => setV((p) => ({ ...p, montant: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Demandeur</span><input className={inputCls} value={v.demandeur} onChange={set("demandeur")} placeholder="Toi par défaut" /></label>
          <label className="flex flex-col gap-1 lg:col-span-3"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Note</span><input className={inputCls} value={v.note} onChange={set("note")} placeholder="Optionnel" /></label>
          <div className="flex items-end justify-end"><button onClick={ajouter} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Déposer</button></div>
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="text-[0.9rem] font-semibold">Notes de frais</h3><span className="font-num text-[0.8rem] text-faint">{frais.length}</span>{enAttente ? <span className="rounded-full px-2 py-0.5 text-[0.68rem] font-bold" style={{ color: "var(--warn)", background: "color-mix(in srgb,var(--warn) 14%,transparent)" }}>{enAttente} en attente</span> : null}</div>
        <select className={inputCls + " max-w-[170px]"} value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="">Tous statuts</option>{FRAIS_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      </div>

      {liste.length === 0 ? (
        frais.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucune note pour ce filtre.</p>
          : <VideRegistre icon={Banknote} titre="Aucune note de frais" sous="Déclare une première dépense avancée — elle attendra ici sa validation puis son remboursement." />
      ) : (
        <div className="flex flex-col gap-2">
          {liste.map((f) => {
            const st = fraisStatut(f.statut);
            return (
              <div key={f.id} className="group flex flex-wrap items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="text-[0.86rem] font-semibold">{f.objet}</span><span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase" style={{ color: st.tone, background: `color-mix(in srgb,${st.tone} 14%,transparent)` }}>{st.label}</span></div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">{f.demandeur || "—"} · {dtFR(f.createdAt)}{f.validePar ? ` · validé par ${f.validePar}` : ""}{f.note ? ` · ${f.note}` : ""}</div>
                </div>
                <span className="shrink-0 font-num text-[0.95rem] font-bold">{money(f.montant)}</span>
                {canValidate ? (
                  <div className="flex shrink-0 items-center gap-1">
                    {f.statut === "en_attente" ? <>
                      <button onClick={() => changer(f, "valide")} title="Valider" className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-[var(--good)]"><Check className="h-3.5 w-3.5" /></button>
                      <button onClick={() => changer(f, "refuse")} title="Refuser" className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood"><X className="h-3.5 w-3.5" /></button>
                    </> : null}
                    {f.statut === "valide" ? <button onClick={() => changer(f, "vire")} className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[0.7rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Banknote className="h-3.5 w-3.5" /> Virer</button> : null}
                    <button onClick={() => supprimer(f.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
