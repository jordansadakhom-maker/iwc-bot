"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FlaskConical, Plus, Search, Check, Pencil, Trash2, AlertTriangle, Minus, Truck, ShoppingCart, Lock } from "lucide-react";
import { enRupture, suggestionCommande, type MatieresData, type Matiere } from "@/lib/dispensaire-matieres-const";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { VideRegistre } from "@/components/dispensaire-ui";
import { creerMatiere, majMatiere, ajusterMatiere, supprimerMatiere } from "@/app/dispensaire/matieres/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function DispensaireMatieres({ data }: { data: MatieresData }) {
  const router = useRouter();
  const canEdit = data.canEdit;
  const [mats, setMats] = useState<Matiere[]>(data.matieres);
  const [q, setQ] = useState("");
  const [seulAlerte, setSeulAlerte] = useState(false);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Matiere | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);

  const query = norm(q);
  const liste = useMemo(() => mats.filter((m) => (!seulAlerte || enRupture(m)) && (!query || norm([m.nom, m.fournisseur, m.note].filter(Boolean).join(" ")).includes(query))), [mats, seulAlerte, query]);
  const alertes = useMemo(() => mats.filter(enRupture), [mats]);
  const aCommander = useMemo(() => alertes.map((m) => ({ m, q: suggestionCommande(m) })).filter((x) => x.q > 0), [alertes]);

  async function enregistrer(vals: Record<string, string>, editing: Matiere | null) {
    const clean = { ...vals, quantite: Number(vals.quantite) || 0, seuil: Number(vals.seuil) || 0, cible: Number(vals.cible) || 0 };
    if (editing) {
      setMats((p) => p.map((m) => (m.id === editing.id ? { ...m, ...clean } as Matiere : m))); setForm(null);
      const r = await majMatiere(editing.id, clean); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Matiere = { id: "tmp-" + Math.random().toString(36).slice(2, 8), nom: vals.nom, quantite: clean.quantite, seuil: clean.seuil, cible: clean.cible, unite: vals.unite || null, fournisseur: vals.fournisseur || null, note: vals.note || null, updatedAt: null, updatedBy: null };
      setMats((p) => [...p, tmp]); setForm(null);
      const r = await creerMatiere(clean);
      if (!r.ok) { setMats((p) => p.filter((m) => m.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setMats((p) => p.map((m) => (m.id === tmp.id ? { ...m, id: r.id || tmp.id } : m))); setFlash({ t: "ok", m: "Matière ajoutée." }); router.refresh(); }
    }
  }
  async function ajuster(m: Matiere, delta: number) {
    const apres = Math.max(0, m.quantite + delta);
    setMats((p) => p.map((x) => (x.id === m.id ? { ...x, quantite: apres } : x)));
    const r = await ajusterMatiere(m.id, delta); if (!r.ok) { setMats((p) => p.map((x) => (x.id === m.id ? { ...x, quantite: m.quantite } : x))); setFlash({ t: "bad", m: r.error || "Impossible." }); } else router.refresh();
  }
  async function supprimer(id: string) { setMats((p) => p.filter((m) => m.id !== id)); setDelId(null); const r = await supprimerMatiere(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-matieres.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}
      {data.pret && !canEdit ? <div className="flex items-center gap-2 rounded-[12px] border border-border bg-surface-2 px-3 py-2 text-[0.78rem] text-muted"><Lock className="h-3.5 w-3.5 text-faint" /> Consultation seule — ton grade ne permet pas de modifier les matières.</div> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><FlaskConical className="h-4 w-4 text-accent" /> Matières premières</h3>
          <span className="font-num text-[0.8rem] text-faint">{mats.length}</span>
          {alertes.length ? <button onClick={() => setSeulAlerte((v) => !v)} className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold text-white" style={{ background: "var(--oxblood)", opacity: seulAlerte ? 1 : 0.85 }}><AlertTriangle className="h-3 w-3" /> {alertes.length} en rupture</button> : null}
        </div>
        {canEdit ? <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter</button> : null}
      </div>

      {/* Suggestion de commande */}
      {aCommander.length && !seulAlerte ? (
        <div className="rounded-[12px] border p-3" style={{ borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 6%,transparent)" }}>
          <div className="mb-1.5 flex items-center gap-1.5 text-[0.78rem] font-semibold" style={{ color: "var(--warn)" }}><ShoppingCart className="h-3.5 w-3.5" /> À commander</div>
          <div className="flex flex-wrap gap-1.5">
            {aCommander.map(({ m, q }) => <span key={m.id} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-surface-2 px-2 py-1 text-[0.72rem]"><span className="font-semibold">{m.nom}</span><span className="font-num" style={{ color: "var(--warn)" }}>+{q}{m.unite ? " " + m.unite : ""}</span>{m.fournisseur ? <span className="text-faint">· {m.fournisseur}</span> : null}</span>)}
          </div>
        </div>
      ) : null}

      <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une matière, un fournisseur…" /></div>

      {liste.length === 0 ? (
        mats.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucune matière ne correspond à ta recherche.</p>
          : <VideRegistre icon={FlaskConical} titre="Aucune matière première au registre" sous="Inscris une première matière — quantité, seuil, fournisseur — et l'officine te signalera d'elle-même ce qu'il faut recommander." />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {liste.map((m) => {
            const rupture = enRupture(m);
            return (
              <div key={m.id} className="rounded-[12px] border p-3" style={{ borderColor: rupture ? "color-mix(in srgb,var(--oxblood) 50%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="text-[0.9rem] font-semibold" style={rupture ? { color: "var(--oxblood)" } : undefined}>{m.nom}</span>{rupture ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-2.5 w-2.5" /> rupture</span> : null}</div>
                    <div className="mt-0.5 flex flex-wrap gap-x-3 text-[0.72rem] text-faint">{m.fournisseur ? <span className="inline-flex items-center gap-1"><Truck className="h-3 w-3" /> {m.fournisseur}</span> : null}<span>Seuil {m.seuil}{m.cible ? ` · cible ${m.cible}` : ""}</span></div>
                    {m.note ? <div className="mt-1 text-[0.73rem] text-muted">{m.note}</div> : null}
                  </div>
                  {canEdit ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button onClick={() => setForm(m)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => setDelId(m.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  ) : null}
                </div>
                <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                  <div className="font-num text-[1.4rem] font-bold leading-none" style={{ color: rupture ? "var(--oxblood)" : "var(--ink)" }}>{m.quantite}</div>
                  <span className="text-[0.64rem] text-faint">{m.unite || "en stock"}</span>
                  {canEdit ? (
                    <div className="ml-auto flex items-center gap-1">
                      <button onClick={() => ajuster(m, -1)} className="grid h-6 w-6 place-items-center rounded border border-border text-muted hover:text-ink"><Minus className="h-3 w-3" /></button>
                      <button onClick={() => ajuster(m, 1)} className="grid h-6 w-6 place-items-center rounded border border-border text-muted hover:text-ink"><Plus className="h-3 w-3" /></button>
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? <MatiereForm initial={form === "new" ? null : form} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={mats.find((m) => m.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function MatiereForm({ initial, onClose, onSave }: { initial: Matiere | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ nom: initial?.nom || "", quantite: String(initial?.quantite ?? 0), seuil: String(initial?.seuil ?? 0), cible: String(initial?.cible ?? 0), unite: initial?.unite || "", fournisseur: initial?.fournisseur || "", note: initial?.note || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const setNum = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setV((p) => ({ ...p, [k]: e.target.value.replace(/[^0-9]/g, "") }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier la matière" : "➕ Ajouter une matière"} onClose={onClose} max={540}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Alcool, tissu, herbes…" autoFocus /></Champ>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Quantité"><input className={inputCls} value={v.quantite} onChange={setNum("quantite")} inputMode="numeric" /></Champ>
          <Champ label="Seuil minimum"><input className={inputCls} value={v.seuil} onChange={setNum("seuil")} inputMode="numeric" /></Champ>
          <Champ label="Cible (commande)"><input className={inputCls} value={v.cible} onChange={setNum("cible")} inputMode="numeric" /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Unité"><input className={inputCls} value={v.unite} onChange={set("unite")} placeholder="u, L, kg…" /></Champ>
          <Champ label="Fournisseur"><input className={inputCls} value={v.fournisseur} onChange={set("fournisseur")} placeholder="Nom / entreprise" /></Champ>
        </div>
        <Champ label="Commentaire"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
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
    <Modal titre="Supprimer la matière ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> ?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
