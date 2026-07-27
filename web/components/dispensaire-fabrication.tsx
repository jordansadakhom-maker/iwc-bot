"use client";

import { useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, FlaskConical, Plus, Trash2, Loader2, PackagePlus, Hammer } from "lucide-react";
import { Flash, inputCls } from "@/components/edit-ui";
import type { FabricationData, Recette } from "@/lib/dispensaire-fabrication-const";
import { creerRecette, supprimerRecette, fabriquer } from "@/app/dispensaire/fabrication/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
type IngRow = { matiereId: string; quantite: string };

export function DispensaireFabrication({ data }: { data: FabricationData }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [actif, setActif] = useState<string | null>(null);
  const [form, setForm] = useState({ nom: "", produitStockId: "", rendement: "1", note: "" });
  const [ings, setIngs] = useState<IngRow[]>([{ matiereId: "", quantite: "1" }]);
  const [lots, setLots] = useState<Record<string, string>>({});
  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  const matNom = useMemo(() => new Map(data.matieres.map((m) => [m.id, m.nom])), [data.matieres]);
  const setForm2 = (k: keyof typeof form, v: string) => setForm((p) => ({ ...p, [k]: v }));
  const setIng = (i: number, patch: Partial<IngRow>) => setIngs((p) => p.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const addIng = () => setIngs((p) => [...p, { matiereId: "", quantite: "1" }]);
  const rmIng = (i: number) => setIngs((p) => (p.length > 1 ? p.filter((_, k) => k !== i) : p));

  async function creer() {
    if (!form.nom.trim()) { setFlash({ t: "bad", m: "Donne un nom à la recette." }); return; }
    if (!form.produitStockId) { setFlash({ t: "bad", m: "Choisis l'article produit." }); return; }
    const ingredients = ings
      .map((r) => ({ matiereId: r.matiereId, nom: matNom.get(r.matiereId) || "", quantite: Math.max(1, Math.round(Number(r.quantite) || 1)) }))
      .filter((r) => r.matiereId);
    if (!ingredients.length) { setFlash({ t: "bad", m: "Ajoute au moins une matière première." }); return; }
    const produitNom = data.produits.find((p) => p.id === form.produitStockId)?.nom || "";
    setBusy(true);
    const r = await creerRecette({ nom: form.nom, produitStockId: form.produitStockId, produitNom, rendement: Number(form.rendement) || 1, note: form.note, ingredients, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = "";
    setForm({ nom: "", produitStockId: "", rendement: "1", note: "" });
    setIngs([{ matiereId: "", quantite: "1" }]);
    setFlash({ t: "ok", m: "Recette enregistrée." });
    router.refresh();
  }

  async function lancerFab(rec: Recette) {
    const nb = Math.max(1, Math.round(Number(lots[rec.id]) || 1));
    setActif(rec.id);
    const r = await fabriquer(rec.id, nb);
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Fabrication impossible." }); return; }
    setFlash({ t: "ok", m: `Fabriqué : +${r.produit ?? ""} ${rec.produitNom}.` });
    router.refresh();
  }

  async function supprimer(id: string) {
    setActif(id);
    const r = await supprimerRecette(id);
    setActif(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    router.refresh();
  }

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Factory className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">La fabrication est réservée aux grades disposant du droit « stock ».</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-fabrication.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Nouvelle recette */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Hammer className="h-4 w-4 text-accent" /> Nouvelle recette</h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
          <label className="flex flex-col gap-1 lg:col-span-2"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Nom de la recette</span><input className={inputCls} value={form.nom} onChange={(e) => setForm2("nom", e.target.value)} placeholder="Ex. Bandage propre" /></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Produit (stock)</span>
            <select className={inputCls} value={form.produitStockId} onChange={(e) => setForm2("produitStockId", e.target.value)}><option value="">— Choisir —</option>{data.produits.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}</select></label>
          <label className="flex flex-col gap-1"><span className="text-[0.7rem] uppercase tracking-[0.05em] text-faint">Rendement / lot</span><input className={inputCls} inputMode="numeric" value={form.rendement} onChange={(e) => setForm2("rendement", e.target.value.replace(/[^0-9]/g, ""))} /></label>
        </div>

        <div className="mt-3 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><FlaskConical className="h-3.5 w-3.5" /> Matières premières consommées</span>
            <button onClick={addIng} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2 py-1 text-[0.72rem] font-semibold text-muted hover:text-ink"><Plus className="h-3.5 w-3.5" /> Ajouter</button>
          </div>
          {ings.map((r, i) => (
            <div key={i} className="flex items-center gap-2">
              <select className={inputCls + " flex-1"} value={r.matiereId} onChange={(e) => setIng(i, { matiereId: e.target.value })}><option value="">— Matière —</option>{data.matieres.map((m) => <option key={m.id} value={m.id}>{m.nom} (dispo : {m.quantite}{m.unite ? ` ${m.unite}` : ""})</option>)}</select>
              <input className={inputCls + " w-20"} inputMode="numeric" value={r.quantite} onChange={(e) => setIng(i, { quantite: e.target.value.replace(/[^0-9]/g, "") })} aria-label="Quantité" placeholder="Qté" />
              <button onClick={() => rmIng(i)} className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-border text-faint hover:text-ink" aria-label="Retirer"><Trash2 className="h-3.5 w-3.5" /></button>
            </div>
          ))}
        </div>

        <div className="mt-3 flex justify-end">
          <button onClick={creer} disabled={busy || !data.pret} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enregistrer la recette</button>
        </div>
      </section>

      {/* Recettes */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Factory className="h-4 w-4 text-accent" /> Recettes <span className="font-num text-[0.8rem] text-faint">{data.recettes.length}</span></h3>
        {data.recettes.length === 0 ? (
          <p className="py-6 text-center text-[0.85rem] italic text-faint">Aucune recette — crée-en une pour fabriquer des consommables.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {data.recettes.map((rec) => (
              <div key={rec.id} className="rounded-[12px] border border-border bg-surface-2 p-3">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="text-[0.9rem] font-semibold">{rec.nom}</span>
                  <span className="inline-flex items-center gap-1 text-[0.8rem] text-muted"><PackagePlus className="h-3.5 w-3.5 text-accent" /> {rec.produitNom} <span className="font-num">×{rec.rendement}</span> / lot</span>
                </div>
                <div className="mt-1 text-[0.78rem] text-faint">{rec.ingredients.map((g) => `${g.quantite} ${g.nom}`).join(" · ") || "—"}</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <div className="flex items-center gap-1.5">
                    <span className="text-[0.74rem] text-faint">Lots</span>
                    <input className={inputCls + " h-8 w-16 py-1 text-[0.8rem]"} inputMode="numeric" value={lots[rec.id] ?? "1"} onChange={(e) => setLots((p) => ({ ...p, [rec.id]: e.target.value.replace(/[^0-9]/g, "") }))} aria-label="Nombre de lots" />
                    <button onClick={() => lancerFab(rec)} disabled={actif === rec.id} className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{actif === rec.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Hammer className="h-3.5 w-3.5" />} Fabriquer</button>
                  </div>
                  <button onClick={() => supprimer(rec.id)} disabled={actif === rec.id} className="ml-auto inline-flex items-center gap-1 rounded-lg border border-border px-2 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-oxblood disabled:opacity-50"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
