"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ScrollText, Plus, Check, Pencil, Trash2, Search, ExternalLink } from "lucide-react";
import { RAPPORT_CATEGORIES, estCanva, normaliserLien, type RapportsData, type Rapport } from "@/lib/dispensaire-docs-const";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { creerRapport, majRapport, supprimerRapport } from "@/app/dispensaire/rapports/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const dateFR = (s: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };

export function DispensaireRapports({ data }: { data: RapportsData }) {
  const router = useRouter();
  const [rapports, setRapports] = useState<Rapport[]>(data.rapports);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Rapport | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  const cats = useMemo(() => [...new Set(rapports.map((r) => (r.categorie || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [rapports]);
  const query = norm(q);
  const liste = rapports.filter((r) => (!cat || r.categorie === cat) && (!query || norm([r.titre, r.patient, r.auteur, r.categorie, r.note].filter(Boolean).join(" ")).includes(query)));

  async function enregistrer(vals: Record<string, string>, editing: Rapport | null) {
    const clean = { ...vals, lien: vals.lien ? normaliserLien(vals.lien) : "" };
    if (editing) {
      setRapports((p) => p.map((r) => (r.id === editing.id ? { ...r, ...clean } as Rapport : r))); setForm(null);
      const res = await majRapport(editing.id, clean);
      if (!res.ok) setFlash({ t: "bad", m: res.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Rapport = { id: "tmp-" + Math.random().toString(36).slice(2, 8), titre: vals.titre, categorie: vals.categorie || null, patient: vals.patient || null, lien: clean.lien || null, auteur: vals.auteur || null, note: vals.note || null, par: null, createdAt: new Date().toISOString() };
      setRapports((p) => [tmp, ...p]); setForm(null);
      const res = await creerRapport(clean);
      if (!res.ok) { setRapports((p) => p.filter((r) => r.id !== tmp.id)); setFlash({ t: "bad", m: res.error || "Impossible." }); }
      else { setRapports((p) => p.map((r) => (r.id === tmp.id ? { ...r, id: res.id || tmp.id } : r))); setFlash({ t: "ok", m: "Rapport ajouté." }); router.refresh(); }
    }
  }
  async function supprimer(id: string) { setRapports((p) => p.filter((r) => r.id !== id)); setDelId(null); const res = await supprimerRapport(id); if (!res.ok) setFlash({ t: "bad", m: res.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-documents.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><ScrollText className="h-4 w-4 text-accent" /> Rapports médicaux</h3><span className="font-num text-[0.8rem] text-faint">{rapports.length}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " w-44 pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          {cats.length ? <select className={inputCls + " max-w-[160px]"} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select> : null}
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter</button>
        </div>
      </div>

      {liste.length === 0 ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">{rapports.length ? "Aucun rapport ne correspond." : "Aucun rapport — ajoute le premier (lien Canva)."}</p> : (
        <div className="grid gap-2 lg:grid-cols-2">
          {liste.map((r) => (
            <div key={r.id} className="group rounded-[12px] border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5"><span className="text-[0.9rem] font-semibold">{r.titre}</span>{r.categorie ? <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.62rem] font-semibold text-muted">{r.categorie}</span> : null}</div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">{[r.patient, r.auteur].filter(Boolean).join(" · ") || "—"} · {dateFR(r.createdAt)}</div>
                  {r.note ? <div className="mt-1 line-clamp-2 text-[0.74rem] text-muted">{r.note}</div> : null}
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <button onClick={() => setForm(r)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDelId(r.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
              {r.lien ? <a href={r.lien} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.74rem] font-semibold transition hover:border-border-2" style={{ borderColor: estCanva(r.lien) ? "color-mix(in srgb,var(--accent) 45%,var(--border))" : "var(--border)", color: "var(--accent)" }}><ExternalLink className="h-3.5 w-3.5" /> {estCanva(r.lien) ? "Ouvrir sur Canva" : "Ouvrir le lien"}</a> : <span className="mt-2 inline-block text-[0.7rem] italic text-faint">Aucun lien</span>}
            </div>
          ))}
        </div>
      )}

      {form ? <RapportForm initial={form === "new" ? null : form} cats={cats} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={rapports.find((r) => r.id === delId)?.titre || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function RapportForm({ initial, cats, onClose, onSave }: { initial: Rapport | null; cats: string[]; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ titre: initial?.titre || "", categorie: initial?.categorie || "", patient: initial?.patient || "", lien: initial?.lien || "", auteur: initial?.auteur || "", note: initial?.note || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const options = [...new Set([...RAPPORT_CATEGORIES, ...cats])];
  function go() { if (v.titre.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le rapport" : "➕ Nouveau rapport"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom *"><input className={inputCls} value={v.titre} onChange={set("titre")} placeholder="Rapport d'autopsie — …" autoFocus /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Catégorie"><input className={inputCls} value={v.categorie} onChange={set("categorie")} placeholder="Consultation, Chirurgie…" list="rap-cats" /><datalist id="rap-cats">{options.map((c) => <option key={c} value={c} />)}</datalist></Champ>
          <Champ label="Patient"><input className={inputCls} value={v.patient} onChange={set("patient")} placeholder="Optionnel" /></Champ>
        </div>
        <Champ label="Lien Canva"><input className={inputCls} value={v.lien} onChange={set("lien")} placeholder="https://www.canva.com/design/…" /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Auteur"><input className={inputCls} value={v.auteur} onChange={set("auteur")} placeholder="Toi par défaut" /></Champ>
        </div>
        <Champ label="Description"><textarea className={inputCls} rows={2} value={v.note} onChange={set("note")} /></Champ>
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
    <Modal titre="Supprimer le rapport ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer <b className="text-ink">{nom}</b> ? Le lien Canva n&apos;est pas supprimé, seulement la fiche.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
