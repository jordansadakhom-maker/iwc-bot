"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Archive, Plus, Check, Pencil, Trash2, MapPin, UserRound } from "lucide-react";
import type { CoffresData, Coffre } from "@/lib/dispensaire-matieres-const";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { creerCoffre, majCoffre, supprimerCoffre } from "@/app/dispensaire/coffres/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;

export function DispensaireCoffres({ data }: { data: CoffresData }) {
  const router = useRouter();
  const [coffres, setCoffres] = useState<Coffre[]>(data.coffres);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Coffre | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  async function enregistrer(vals: Record<string, string>, editing: Coffre | null) {
    if (editing) {
      setCoffres((p) => p.map((c) => (c.id === editing.id ? { ...c, ...vals } as Coffre : c))); setForm(null);
      const r = await majCoffre(editing.id, vals); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Coffre = { id: "tmp-" + Math.random().toString(36).slice(2, 8), nom: vals.nom, emplacement: vals.emplacement || null, responsable: vals.responsable || null, note: vals.note || null, updatedAt: null, updatedBy: null };
      setCoffres((p) => [...p, tmp]); setForm(null);
      const r = await creerCoffre(vals);
      if (!r.ok) { setCoffres((p) => p.filter((c) => c.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setCoffres((p) => p.map((c) => (c.id === tmp.id ? { ...c, id: r.id || tmp.id } : c))); setFlash({ t: "ok", m: "Coffre ajouté." }); router.refresh(); }
    }
  }
  async function supprimer(id: string) { setCoffres((p) => p.filter((c) => c.id !== id)); setDelId(null); const r = await supprimerCoffre(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-matieres.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><Archive className="h-4 w-4 text-accent" /> Coffres</h3><span className="font-num text-[0.8rem] text-faint">{coffres.length}</span></div>
        <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter un coffre</button>
      </div>
      <p className="text-[0.76rem] text-faint">Ces coffres sont proposés automatiquement dans le module <b>Stockage</b> quand tu ranges un article.</p>

      {coffres.length === 0 ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun coffre — ajoute le premier.</p> : (
        <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {coffres.map((c) => (
            <div key={c.id} className="group rounded-[12px] border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2"><span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}><Archive className="h-4 w-4 text-accent" /></span><span className="truncate text-[0.9rem] font-semibold">{c.nom}</span></div>
                  <div className="mt-1.5 flex flex-col gap-0.5 text-[0.74rem] text-faint">
                    <span className="inline-flex items-center gap-1.5"><MapPin className="h-3 w-3" /> {c.emplacement || "Emplacement —"}</span>
                    <span className="inline-flex items-center gap-1.5"><UserRound className="h-3 w-3" /> {c.responsable || "Responsable —"}</span>
                  </div>
                  {c.note ? <div className="mt-1 text-[0.73rem] text-muted">{c.note}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setForm(c)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDelId(c.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {form ? <CoffreForm initial={form === "new" ? null : form} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={coffres.find((c) => c.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function CoffreForm({ initial, onClose, onSave }: { initial: Coffre | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ nom: initial?.nom || "", emplacement: initial?.emplacement || "", responsable: initial?.responsable || "", note: initial?.note || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le coffre" : "➕ Ajouter un coffre"} onClose={onClose} max={480}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Coffre principal, pharmacie…" autoFocus /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Emplacement"><input className={inputCls} value={v.emplacement} onChange={set("emplacement")} placeholder="Réserve, bureau…" /></Champ>
          <Champ label="Responsable"><input className={inputCls} value={v.responsable} onChange={set("responsable")} placeholder="Nom" /></Champ>
        </div>
        <Champ label="Note"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}

function ConfirmDelete({ nom, onCancel, onConfirm }: { nom: string; onCancel: () => void; onConfirm: () => void }) {
  return (
    <Modal titre="Supprimer le coffre ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> ? Les articles déjà rangés ne sont pas supprimés.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
