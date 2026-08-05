"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle, Pencil, Trash2, Loader2, X, ArrowUpRight, ArrowDownRight, ChevronDown, Info } from "lucide-react";
import { money } from "@/lib/dispensaire-facturation-const";
import { Flash, inputCls } from "@/components/edit-ui";
import type { EcritureManuelle } from "@/lib/dispensaire-comptabilite";
import { ajouterEcriture, majEcriture, supprimerEcriture } from "@/app/dispensaire/comptabilite/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const labelCls = "text-[0.68rem] uppercase tracking-[0.05em] text-faint";
const dateFR = (s: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "2-digit" }).format(new Date(s)); } catch { return "—"; } };
const ymd = (iso: string) => (iso || "").slice(0, 10);

// Catégories suggérées — la première vise explicitement les factures réglées en jeu.
const CATEGORIES = ["Facture (en jeu)", "Subvention", "Don", "Divers", "Achat", "Loyer", "Réparation", "Salaire", "Approvisionnement"];

type Form = { date: string; libelle: string; categorie: string; montant: string; type: "recette" | "depense"; note: string };
const formVide: Form = { date: "", libelle: "", categorie: "", montant: "", type: "recette", note: "" };

export function ComptaManuelle({ manuelles, canEditer }: { manuelles: EcritureManuelle[]; canEditer: boolean }) {
  const router = useRouter();
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<Form>(formVide);
  const [edit, setEdit] = useState<EcritureManuelle | null>(null);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));

  const total = manuelles.reduce((a, e) => a + (e.type === "recette" ? e.montant : -e.montant), 0);

  async function ajouter() {
    if (!f.libelle.trim()) { setFlash({ t: "bad", m: "Donne un libellé à l'écriture." }); return; }
    if (!(Number(f.montant) > 0)) { setFlash({ t: "bad", m: "Indique un montant supérieur à 0." }); return; }
    setBusy(true);
    const r = await ajouterEcriture({ date: f.date, libelle: f.libelle, categorie: f.categorie, montant: f.montant, type: f.type, note: f.note });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setF((p) => ({ ...formVide, type: p.type, categorie: p.categorie }));
    setFlash({ t: "ok", m: "Écriture ajoutée au grand-livre." });
    router.refresh();
  }
  async function supprimer(id: string) {
    const r = await supprimerEcriture(id);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: "Écriture supprimée." });
    router.refresh();
  }

  if (!canEditer) return null;

  return (
    <section className="rounded-[14px] border border-border bg-surface">
      <div className="flex items-center gap-2 border-b border-border px-4 py-3">
        <PlusCircle className="h-4 w-4 text-accent" />
        <h3 className="text-[0.9rem] font-semibold">Écritures manuelles <span className="font-num text-[0.8rem] text-faint">{manuelles.length}</span></h3>
        <span className="ml-auto text-[0.72rem] text-faint">Solde manuel&nbsp;: <span className="font-num font-semibold" style={{ color: total >= 0 ? "var(--good)" : "var(--oxblood)" }}>{total >= 0 ? "+" : "−"}{money(Math.abs(total))}</span></span>
      </div>

      <div className="p-4">
        {flash ? <div className="mb-3"><Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash></div> : null}

        <div className="mb-3 flex items-start gap-2 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.74rem] text-muted">
          <Info className="mt-0.5 h-3.5 w-3.5 shrink-0 text-accent" />
          <span>Saisis ici toute recette ou dépense qui n&apos;est pas captée automatiquement — en particulier les <b>factures réglées en jeu</b> par les joueurs. Chaque écriture entre aussitôt dans la trésorerie, la répartition et le grand-livre.</span>
        </div>

        {/* Formulaire d'ajout */}
        <button onClick={() => setOpen((o) => !o)} className="mb-2 inline-flex items-center gap-1.5 text-[0.8rem] font-semibold text-accent">
          <PlusCircle className="h-4 w-4" /> Ajouter une écriture <ChevronDown className={`h-3.5 w-3.5 transition ${open ? "rotate-180" : ""}`} />
        </button>
        {open ? (
          <div className="mb-4 rounded-lg border border-border bg-surface-2 p-3">
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <label className="flex flex-col gap-1"><span className={labelCls}>Date</span><input type="date" className={inputCls} value={f.date} onChange={set("date")} /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>Type</span>
                <select className={inputCls} value={f.type} onChange={set("type")}><option value="recette">Recette (+)</option><option value="depense">Dépense (−)</option></select>
              </label>
              <label className="flex flex-col gap-1"><span className={labelCls}>Montant ($) *</span><input type="number" min="0" step="0.01" className={inputCls} value={f.montant} onChange={set("montant")} placeholder="0" /></label>
              <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Libellé *</span><input className={inputCls} value={f.libelle} onChange={set("libelle")} placeholder="Ex. Facture réglée en jeu — M. Dupont" /></label>
              <label className="flex flex-col gap-1"><span className={labelCls}>Catégorie</span><input className={inputCls} value={f.categorie} onChange={set("categorie")} placeholder="Facture (en jeu)" list="compta-cats" /><datalist id="compta-cats">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
              <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-3"><span className={labelCls}>Note (facultatif)</span><input className={inputCls} value={f.note} onChange={set("note")} placeholder="Précision éventuelle" /></label>
            </div>
            <div className="mt-3 flex justify-end">
              <button onClick={ajouter} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Ajouter au grand-livre</button>
            </div>
          </div>
        ) : null}

        {/* Liste des écritures manuelles */}
        {manuelles.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucune écriture manuelle pour l&apos;instant.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-left text-[0.82rem]">
              <thead>
                <tr className="border-b border-border text-[0.66rem] uppercase tracking-[0.04em] text-faint">
                  <th className="py-1.5 pr-2 font-semibold">Date</th>
                  <th className="px-2 py-1.5 font-semibold">Libellé</th>
                  <th className="px-2 py-1.5 font-semibold">Catégorie</th>
                  <th className="px-2 py-1.5 text-right font-semibold">Montant</th>
                  <th className="px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {manuelles.map((e) => {
                  const ton = e.type === "recette" ? "var(--good)" : "var(--oxblood)";
                  const Ic = e.type === "recette" ? ArrowUpRight : ArrowDownRight;
                  return (
                    <tr key={e.id} className="group border-b border-border/60">
                      <td className="py-2 pr-2 font-num text-faint">{dateFR(e.date)}</td>
                      <td className="px-2 py-2"><span className="line-clamp-1">{e.libelle}</span>{e.note ? <span className="block text-[0.7rem] text-faint">{e.note}</span> : null}</td>
                      <td className="px-2 py-2 text-muted">{e.categorie}</td>
                      <td className="px-2 py-2 text-right"><span className="inline-flex items-center gap-1 font-num font-semibold" style={{ color: ton }}><Ic className="h-3.5 w-3.5" />{e.type === "recette" ? "+" : "−"}{money(e.montant)}</span></td>
                      <td className="px-2 py-2 text-right"><div className="flex justify-end gap-2"><button onClick={() => setEdit(e)} className="text-faint opacity-0 transition hover:text-accent group-hover:opacity-100" aria-label="Modifier" title="Modifier"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => supprimer(e.id)} className="text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer" title="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {edit ? <EditEcritureModal ecriture={edit} onClose={() => setEdit(null)} onSaved={(m) => { setFlash({ t: m.t, m: m.m }); if (m.t === "ok") router.refresh(); }} /> : null}
    </section>
  );
}

function EditEcritureModal({ ecriture, onClose, onSaved }: { ecriture: EcritureManuelle; onClose: () => void; onSaved: (m: { t: "ok" | "bad"; m: string }) => void }) {
  const [f, setF] = useState<Form>({ date: ymd(ecriture.date), libelle: ecriture.libelle, categorie: ecriture.categorie, montant: String(ecriture.montant), type: ecriture.type, note: ecriture.note || "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save() {
    if (!f.libelle.trim()) { onSaved({ t: "bad", m: "Le libellé ne peut pas être vide." }); return; }
    if (!(Number(f.montant) > 0)) { onSaved({ t: "bad", m: "Indique un montant supérieur à 0." }); return; }
    setBusy(true);
    const r = await majEcriture(ecriture.id, { date: f.date, libelle: f.libelle, categorie: f.categorie, montant: f.montant, type: f.type, note: f.note });
    setBusy(false);
    if (!r.ok) { onSaved({ t: "bad", m: r.error || "Impossible." }); return; }
    onSaved({ t: "ok", m: "Écriture modifiée." });
    onClose();
  }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/55 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iwc-pop w-full max-w-[520px] rounded-[14px] border border-border-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-[1.05rem]"><Pencil className="h-4 w-4 text-accent" /> Modifier l&apos;écriture</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className={labelCls}>Date</span><input type="date" className={inputCls} value={f.date} onChange={set("date")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Type</span><select className={inputCls} value={f.type} onChange={set("type")}><option value="recette">Recette (+)</option><option value="depense">Dépense (−)</option></select></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Montant ($)</span><input type="number" min="0" step="0.01" className={inputCls} value={f.montant} onChange={set("montant")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Catégorie</span><input className={inputCls} value={f.categorie} onChange={set("categorie")} list="compta-cats-edit" /><datalist id="compta-cats-edit">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Libellé</span><input className={inputCls} value={f.libelle} onChange={set("libelle")} /></label>
          <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Note</span><input className={inputCls} value={f.note} onChange={set("note")} /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-semibold transition hover:border-accent">Annuler</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer</button>
        </div>
      </div>
    </div>
  );
}
