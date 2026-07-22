"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { FolderOpen, Plus, Check, Trash2, Search, ExternalLink, FileText, Link2, Paperclip } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { DOC_CATEGORIES, normaliserLien, type DocsData, type Doc } from "@/lib/dispensaire-docs-const";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { PhotoDrop } from "@/components/photo-drop";
import { creerDocument, supprimerDocument } from "@/app/dispensaire/documents/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();
const dateFR = (s: string) => { try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };

export function DispensaireDocuments({ data }: { data: DocsData }) {
  const router = useRouter();
  const [docs, setDocs] = useState<Doc[]>(data.documents);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState(false);
  const [delId, setDelId] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState("");

  const cats = useMemo(() => [...new Set(docs.map((d) => (d.categorie || "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b)), [docs]);
  const query = norm(q);
  const liste = docs.filter((d) => (!cat || d.categorie === cat) && (!query || norm([d.titre, d.categorie, d.note].filter(Boolean).join(" ")).includes(query)));

  async function enregistrer(vals: { titre: string; categorie: string; type: string; url: string; note: string }) {
    const tmp: Doc = { id: "tmp-" + Math.random().toString(36).slice(2, 8), titre: vals.titre, categorie: vals.categorie || null, type: vals.type, url: vals.url || null, note: vals.note || null, par: null, createdAt: new Date().toISOString() };
    setDocs((p) => [tmp, ...p]); setForm(false);
    const r = await creerDocument(vals);
    if (!r.ok) { setDocs((p) => p.filter((d) => d.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setDocs((p) => p.map((d) => (d.id === tmp.id ? { ...d, id: r.id || tmp.id } : d))); setFlash({ t: "ok", m: "Document ajouté." }); router.refresh(); }
  }
  async function supprimer(id: string) { setDocs((p) => p.filter((d) => d.id !== id)); setDelId(null); const r = await supprimerDocument(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-documents.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-[0.95rem] font-semibold"><FolderOpen className="h-4 w-4 text-accent" /> Documents</h3><span className="font-num text-[0.8rem] text-faint">{docs.length}</span></div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " w-44 pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher…" /></div>
          {cats.length ? <select className={inputCls + " max-w-[160px]"} value={cat} onChange={(e) => setCat(e.target.value)}><option value="">Toutes catégories</option>{cats.map((c) => <option key={c} value={c}>{c}</option>)}</select> : null}
          <button onClick={() => setForm(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter</button>
        </div>
      </div>

      {liste.length === 0 ? (
        docs.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun document ne correspond à ta recherche.</p>
          : <VideRegistre icon={FolderOpen} titre="Aucune pièce au dossier" sous="Ajoute un premier document — fichier ou lien — et il sera classé ici, à portée de main." />
      ) : (
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {liste.map((d) => (
            <div key={d.id} className="group flex flex-col rounded-[12px] border border-border bg-surface-2 p-3">
              <div className="flex items-start justify-between gap-2">
                <div className="flex min-w-0 items-start gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 12%,transparent)" }}>{d.type === "fichier" ? <Paperclip className="h-4 w-4 text-accent" /> : <Link2 className="h-4 w-4 text-accent" />}</span>
                  <div className="min-w-0"><div className="truncate text-[0.86rem] font-semibold">{d.titre}</div><div className="text-[0.68rem] text-faint">{d.categorie || "Sans catégorie"} · {dateFR(d.createdAt)}</div></div>
                </div>
                <button onClick={() => setDelId(d.id)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
              {d.note ? <div className="mt-1.5 line-clamp-2 text-[0.74rem] text-muted">{d.note}</div> : null}
              {d.url ? <a href={d.url} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 self-start rounded-lg border border-border px-2.5 py-1.5 text-[0.74rem] font-semibold text-accent transition hover:border-border-2"><ExternalLink className="h-3.5 w-3.5" /> Ouvrir</a> : null}
            </div>
          ))}
        </div>
      )}

      {form ? <DocForm cats={cats} onClose={() => setForm(false)} onSave={enregistrer} onFlash={(m) => setFlash({ t: "bad", m })} /> : null}
      {delId ? <ConfirmDelete nom={docs.find((d) => d.id === delId)?.titre || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function DocForm({ cats, onClose, onSave, onFlash }: { cats: string[]; onClose: () => void; onSave: (v: { titre: string; categorie: string; type: string; url: string; note: string }) => void; onFlash: (m: string) => void }) {
  const [mode, setMode] = useState<"fichier" | "lien">("fichier");
  const [v, setV] = useState({ titre: "", categorie: "", note: "" });
  const [url, setUrl] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  const options = [...new Set([...DOC_CATEGORIES, ...cats])];
  function go() {
    if (v.titre.trim().length < 1) { setErr("Le titre est obligatoire."); return; }
    const finalUrl = mode === "lien" ? normaliserLien(url) : url;
    if (!finalUrl) { setErr(mode === "lien" ? "Ajoute un lien." : "Téléverse un fichier."); return; }
    onSave({ titre: v.titre.trim(), categorie: v.categorie.trim(), type: mode, url: finalUrl, note: v.note.trim() });
  }
  return (
    <Modal titre="➕ Ajouter un document" onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <Champ label="Titre *"><input className={inputCls} value={v.titre} onChange={set("titre")} placeholder="Règlement intérieur, formulaire…" autoFocus /></Champ>
        <Champ label="Catégorie"><input className={inputCls} value={v.categorie} onChange={set("categorie")} placeholder="Procédures, Formulaires…" list="doc-cats" /><datalist id="doc-cats">{options.map((c) => <option key={c} value={c} />)}</datalist></Champ>
        <div className="flex gap-1.5">
          <button onClick={() => setMode("fichier")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[0.8rem] font-semibold transition" style={mode === "fichier" ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}><Paperclip className="h-4 w-4" /> Fichier</button>
          <button onClick={() => setMode("lien")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[0.8rem] font-semibold transition" style={mode === "lien" ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}><Link2 className="h-4 w-4" /> Lien</button>
        </div>
        {mode === "fichier" ? (
          <div>
            <PhotoDrop dossier="dispensaire-docs" camera={false} maxDim={2200} label="Glisse un PDF ou une image, ou clique pour choisir" onUploaded={(u) => { setUrl(u); setErr(null); }} />
            {url ? <p className="mt-1.5 inline-flex items-center gap-1.5 text-[0.74rem]" style={{ color: "var(--good)" }}><FileText className="h-3.5 w-3.5" /> Fichier prêt à enregistrer.</p> : null}
          </div>
        ) : (
          <Champ label="Lien"><input className={inputCls} value={url} onChange={(e) => { setUrl(e.target.value); setErr(null); }} placeholder="https://…" /></Champ>
        )}
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
    <Modal titre="Supprimer le document ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Retirer <b className="text-ink">{nom}</b> de la bibliothèque ?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
