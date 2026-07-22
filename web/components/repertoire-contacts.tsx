"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BookUser, Plus, Search, Loader2, X, Check, Pencil, Trash2, History, FolderCog, Upload,
  ChevronDown, MapPin, Send, Clock, User, Building2, Tag,
} from "lucide-react";
import type { DispData, DispContact, DispCategorie, DispHisto } from "@/lib/dispensaire";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import {
  creerContact, majContact, supprimerContact, deplacerContact,
  creerCategorie, majCategorie, supprimerCategorie, importerContacts, type FicheImport,
} from "@/app/(app)/repertoire/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };

// Champs affichés dans la fiche (ordre & libellés).
const CHAMPS_GEN: [keyof DispContact, string][] = [
  ["responsable", "Responsable"], ["adresse", "Adresse"], ["telegramme", "Télégramme"],
  ["contactSecondaire", "Contact secondaire"], ["horaires", "Horaires"], ["description", "Description"],
];
const CHAMPS_COM: [keyof DispContact, string][] = [
  ["typeService", "Type de service"], ["produits", "Produits disponibles"], ["tarifs", "Tarifs"],
  ["banque", "Infos bancaires"], ["moyensContact", "Moyens de contact"],
];

export function RepertoireContacts({ data }: { data: DispData }) {
  const router = useRouter();
  const canEdit = data.canEdit;
  const [contacts, setContacts] = useState<DispContact[]>(data.contacts);
  const [cats, setCats] = useState<DispCategorie[]>(data.categories);
  const [q, setQ] = useState("");
  const [catFiltre, setCatFiltre] = useState<string>("");
  const [flash, setFlash] = useState<FlashMsg>(null);

  const [sel, setSel] = useState<DispContact | null>(null);
  const [form, setForm] = useState<DispContact | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [gererCat, setGererCat] = useState(false);
  const [histo, setHisto] = useState(false);
  const [importer, setImporter] = useState(false);

  const catNom = (id: string | null) => cats.find((c) => c.id === id)?.nom || "Sans catégorie";

  const query = norm(q.trim());
  const filtres = useMemo(() => {
    let list = contacts;
    if (catFiltre) list = list.filter((c) => (c.categorieId || "") === catFiltre);
    if (query) list = list.filter((c) => {
      const blob = norm([c.nom, catNom(c.categorieId), c.responsable, c.telegramme, c.contactSecondaire, c.moyensContact, c.description, c.notes, c.produits, c.typeService, c.adresse].filter(Boolean).join(" "));
      return blob.includes(query);
    });
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, catFiltre, query, cats]);

  const parCat = useMemo(() => {
    const groupes = cats.map((c) => ({ cat: c, items: filtres.filter((x) => (x.categorieId || "") === c.id).sort((a, b) => a.nom.localeCompare(b.nom)) }));
    const sans = filtres.filter((x) => !x.categorieId || !cats.some((c) => c.id === x.categorieId)).sort((a, b) => a.nom.localeCompare(b.nom));
    if (sans.length) groupes.push({ cat: { id: "", nom: "Sans catégorie", couleur: null, ordre: 999 }, items: sans });
    return groupes.filter((g) => g.items.length);
  }, [filtres, cats]);

  // ── Écritures optimistes ──
  async function enregistrer(vals: Record<string, string>, editing: DispContact | null) {
    if (editing) {
      setContacts((prev) => prev.map((c) => (c.id === editing.id ? { ...c, ...vals } as DispContact : c)));
      setForm(null); setSel(null);
      const r = await majContact(editing.id, vals);
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Modification impossible." }); else { setFlash({ t: "ok", m: "Fiche mise à jour." }); router.refresh(); }
    } else {
      const tmp: DispContact = { id: "tmp-" + Math.random().toString(36).slice(2, 8), categorieId: vals.categorieId || null, nom: vals.nom, responsable: vals.responsable || null, description: vals.description || null, adresse: vals.adresse || null, telegramme: vals.telegramme || null, contactSecondaire: vals.contactSecondaire || null, horaires: vals.horaires || null, notes: vals.notes || null, typeService: vals.typeService || null, produits: vals.produits || null, tarifs: vals.tarifs || null, banque: vals.banque || null, moyensContact: vals.moyensContact || null, source: "site", createdAt: null, updatedAt: null, updatedBy: null };
      setContacts((prev) => [...prev, tmp]);
      setForm(null);
      const r = await creerContact(vals);
      if (!r.ok) { setContacts((prev) => prev.filter((c) => c.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Ajout impossible." }); }
      else { setContacts((prev) => prev.map((c) => (c.id === tmp.id ? { ...c, id: r.id || tmp.id } : c))); setFlash({ t: "ok", m: "Fiche ajoutée." }); router.refresh(); }
    }
  }
  async function supprimer(id: string) {
    setContacts((prev) => prev.filter((c) => c.id !== id)); setDelId(null); setSel(null);
    const r = await supprimerContact(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Suppression impossible." }); else router.refresh();
  }
  async function bouger(c: DispContact, categorieId: string) {
    setContacts((prev) => prev.map((x) => (x.id === c.id ? { ...x, categorieId: categorieId || null } : x)));
    const r = await deplacerContact(c.id, categorieId || null);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Déplacement impossible." }); else router.refresh();
  }

  return (
    <>
      {/* En-tête */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><BookUser className="h-4 w-4 text-accent" /> Répertoire des contacts</h3>
          <span className="font-num text-[0.8rem] text-faint">{contacts.length} fiche{contacts.length > 1 ? "s" : ""}</span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => setHisto(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><History className="h-3.5 w-3.5" /> Historique</button>
          {canEdit ? <>
            <button onClick={() => setGererCat(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><FolderCog className="h-3.5 w-3.5" /> Catégories</button>
            <button onClick={() => setImporter(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"><Upload className="h-3.5 w-3.5" /> Importer</button>
            <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter un contact</button>
          </> : null}
        </div>
      </div>

      {!data.pret ? (
        <div className="mb-3 flex items-start gap-2 rounded-[10px] border px-3 py-2.5 text-[0.82rem]" style={{ color: "var(--warn)", borderColor: "color-mix(in srgb,var(--warn) 45%,var(--border))", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}>
          <span>Le répertoire attend sa base : lance <b>web/prisma/sql/dispensaire.sql</b> dans Supabase, puis recharge.</span>
        </div>
      ) : null}
      {flash ? <div className="mb-3"><Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash></div> : null}

      {/* Recherche + filtre catégorie */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher : nom, catégorie, responsable, télégramme, mot-clé…" />
        </div>
      </div>
      <div className="mb-3 flex flex-wrap items-center gap-1.5">
        <button onClick={() => setCatFiltre("")} className="rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition" style={catFiltre === "" ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>Toutes ({contacts.length})</button>
        {cats.map((c) => { const n = contacts.filter((x) => x.categorieId === c.id).length; return (
          <button key={c.id} onClick={() => setCatFiltre(catFiltre === c.id ? "" : c.id)} className="rounded-full border px-2.5 py-1 text-[0.74rem] font-semibold transition" style={catFiltre === c.id ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>{c.nom} <span className="font-num opacity-70">{n}</span></button>
        ); })}
      </div>

      {/* Fiches groupées par catégorie */}
      {parCat.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-12 text-center">
          <BookUser className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.85rem] italic text-muted">{q || catFiltre ? "Aucune fiche ne correspond." : "Le répertoire est vide. Ajoute un contact, ou importe les fiches du salon Discord."}</p>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {parCat.map((g) => (
            <div key={g.cat.id || "sans"}>
              <div className="mb-1.5 flex items-center gap-2 text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-faint"><Tag className="h-3 w-3" /> {g.cat.nom} <span className="font-num">{g.items.length}</span></div>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
                {g.items.map((c) => <FicheCard key={c.id} c={c} onOpen={() => setSel(c)} />)}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modales */}
      {sel ? <FicheDetail c={sel} catNom={catNom(sel.categorieId)} canEdit={canEdit} cats={cats} onClose={() => setSel(null)} onEdit={() => { setForm(sel); }} onDelete={() => setDelId(sel.id)} onMove={(cid) => bouger(sel, cid)} /> : null}
      {form ? <ContactForm initial={form === "new" ? null : form} cats={cats} onClose={() => setForm(null)} onSave={(vals) => enregistrer(vals, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={contacts.find((c) => c.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
      {gererCat ? <CategorieManager cats={cats} setCats={setCats} setFlash={setFlash} onClose={() => setGererCat(false)} /> : null}
      {histo ? <HistoriqueModal historique={data.historique} onClose={() => setHisto(false)} /> : null}
      {importer ? <ImportModal cats={cats} onClose={() => setImporter(false)} onDone={(msg) => { setFlash({ t: "ok", m: msg }); setImporter(false); router.refresh(); }} setFlash={setFlash} /> : null}
    </>
  );
}

// ── Carte fiche (aperçu type registre) ──────────────────────────
function FicheCard({ c, onOpen }: { c: DispContact; onOpen: () => void }) {
  return (
    <button onClick={onOpen} className="flex flex-col gap-1 rounded-[12px] border border-border bg-surface-2 p-3 text-left transition hover:border-border-2 hover:bg-[color-mix(in_srgb,var(--ink)_3%,var(--surface-2))]">
      <div className="flex items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg" style={{ background: "color-mix(in srgb,var(--accent) 16%,transparent)" }}><Building2 className="h-4 w-4 text-accent" /></span>
        <div className="min-w-0">
          <div className="truncate text-[0.86rem] font-semibold">{c.nom}</div>
          {c.responsable ? <div className="truncate text-[0.72rem] text-faint"><User className="mb-0.5 mr-0.5 inline h-3 w-3" />{c.responsable}</div> : null}
        </div>
      </div>
      <div className="flex flex-wrap gap-x-3 gap-y-0.5 text-[0.72rem] text-muted">
        {c.telegramme ? <span className="inline-flex items-center gap-1"><Send className="h-3 w-3 text-faint" />{c.telegramme}</span> : null}
        {c.adresse ? <span className="inline-flex items-center gap-1 truncate"><MapPin className="h-3 w-3 text-faint" />{c.adresse}</span> : null}
        {c.horaires ? <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3 text-faint" />{c.horaires}</span> : null}
      </div>
    </button>
  );
}

// ── Détail complet d'une fiche ──────────────────────────────────
function FicheDetail({ c, catNom, canEdit, cats, onClose, onEdit, onDelete, onMove }: { c: DispContact; catNom: string; canEdit: boolean; cats: DispCategorie[]; onClose: () => void; onEdit: () => void; onDelete: () => void; onMove: (cid: string) => void }) {
  const lignes = [...CHAMPS_GEN, ...CHAMPS_COM].filter(([k]) => c[k]);
  return (
    <Modal titre={c.nom} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center gap-2 text-[0.74rem]">
          <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-muted"><Tag className="mb-0.5 mr-1 inline h-3 w-3" />{catNom}</span>
          {c.source === "discord" ? <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-faint">importé de Discord</span> : null}
          {c.updatedBy ? <span className="text-faint">maj {dateFR(c.updatedAt)}{c.updatedBy ? ` · ${c.updatedBy}` : ""}</span> : null}
        </div>
        {lignes.length ? (
          <div className="flex flex-col divide-y divide-border rounded-[10px] border border-border">
            {lignes.map(([k, label]) => (
              <div key={String(k)} className="flex gap-3 px-3 py-2 text-[0.82rem]">
                <span className="w-[42%] shrink-0 text-faint">{label}</span>
                <span className="min-w-0 flex-1 whitespace-pre-wrap break-words text-ink">{String(c[k])}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-[0.82rem] italic text-faint">Fiche sans détail — à compléter.</p>}
        {c.notes ? <div className="rounded-[10px] border border-border bg-surface-2 p-3 text-[0.82rem]"><div className="mb-1 text-[0.68rem] uppercase tracking-[0.05em] text-faint">Notes</div><div className="whitespace-pre-wrap break-words text-muted">{c.notes}</div></div> : null}

        {canEdit ? (
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
            <div className="flex items-center gap-1.5 text-[0.74rem]">
              <span className="text-faint">Catégorie :</span>
              <select value={c.categorieId || ""} onChange={(e) => onMove(e.target.value)} className={inputCls + " py-1 text-[0.76rem]"}>
                <option value="">Sans catégorie</option>
                {cats.map((x) => <option key={x.id} value={x.id}>{x.nom}</option>)}
              </select>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold hover:border-border-2"><Pencil className="h-3.5 w-3.5" /> Modifier</button>
              <button onClick={onDelete} className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-[0.78rem] font-semibold" style={{ color: "var(--oxblood)", borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
            </div>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}

// ── Formulaire (création / édition) ─────────────────────────────
function ContactForm({ initial, cats, onClose, onSave }: { initial: DispContact | null; cats: DispCategorie[]; onClose: () => void; onSave: (vals: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => {
    const base: Record<string, string> = { nom: "", categorieId: "", responsable: "", description: "", adresse: "", telegramme: "", contactSecondaire: "", horaires: "", notes: "", typeService: "", produits: "", tarifs: "", banque: "", moyensContact: "" };
    if (initial) for (const k of Object.keys(base)) base[k] = (initial[k as keyof DispContact] as string) || "";
    return base;
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  function go() {
    if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; }
    onSave(v);
  }
  const ligne = (k: string, label: string, ph?: string, area?: boolean) => (
    <Champ label={label}>{area ? <textarea className={inputCls} rows={2} value={v[k]} onChange={set(k)} placeholder={ph} /> : <input className={inputCls} value={v[k]} onChange={set(k)} placeholder={ph} />}</Champ>
  );
  return (
    <Modal titre={initial ? "✏️ Modifier la fiche" : "➕ Nouveau contact"} onClose={onClose} max={620}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Nom (entreprise / personne) *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Menuiserie de Rhodes…" autoFocus /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Catégorie</span>
            <select className={inputCls} value={v.categorieId} onChange={(e) => setV((p) => ({ ...p, categorieId: e.target.value }))}><option value="">Sans catégorie</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">{ligne("responsable", "Responsable", "Nom du gérant")}{ligne("telegramme", "Télégramme", "@indicatif")}</div>
        <div className="grid gap-3 sm:grid-cols-2">{ligne("adresse", "Adresse", "Rhodes, Lemoyne…")}{ligne("horaires", "Horaires", "9h – 18h")}</div>
        {ligne("contactSecondaire", "Contact secondaire", "Autre moyen de joindre")}
        {ligne("description", "Description", "Ce que fait ce contact…", true)}
        <div className="border-t border-border pt-1 text-[0.7rem] uppercase tracking-[0.06em] text-faint">Informations commerciales</div>
        <div className="grid gap-3 sm:grid-cols-2">{ligne("typeService", "Type de service", "Fourniture, réparation…")}{ligne("produits", "Produits disponibles", "Bois, munitions…")}</div>
        <div className="grid gap-3 sm:grid-cols-2">{ligne("tarifs", "Tarifs", "Prix connus")}{ligne("moyensContact", "Moyens de contact", "Télégramme, sur place…")}</div>
        {ligne("banque", "Infos bancaires (si présentes)", "Compte, références…")}
        {ligne("notes", "Notes / informations complémentaires", "Tout le reste…", true)}
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
    <Modal titre="Supprimer la fiche ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer définitivement la fiche <b className="text-ink">{nom}</b> ? Cette action est tracée dans l&apos;historique.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Gestion des catégories ──────────────────────────────────────
function CategorieManager({ cats, setCats, setFlash, onClose }: { cats: DispCategorie[]; setCats: React.Dispatch<React.SetStateAction<DispCategorie[]>>; setFlash: (f: FlashMsg) => void; onClose: () => void }) {
  const [nouv, setNouv] = useState("");
  const [busy, setBusy] = useState(false);
  async function ajouter() {
    if (nouv.trim().length < 1) return; setBusy(true);
    const r = await creerCategorie(nouv.trim());
    setBusy(false);
    if (r.ok && r.id) { setCats((p) => [...p, { id: r.id!, nom: nouv.trim(), couleur: null, ordre: (p.reduce((m, c) => Math.max(m, c.ordre), 0) + 1) }]); setNouv(""); }
    else setFlash({ t: "bad", m: r.error || "Impossible." });
  }
  async function renommer(c: DispCategorie, nom: string) { setCats((p) => p.map((x) => (x.id === c.id ? { ...x, nom } : x))); const r = await majCategorie(c.id, nom); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); }
  async function suppr(c: DispCategorie) { setCats((p) => p.filter((x) => x.id !== c.id)); const r = await supprimerCategorie(c.id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); }
  return (
    <Modal titre="🗂️ Catégories" onClose={onClose} max={460}>
      <div className="flex flex-col gap-2">
        <p className="text-[0.78rem] text-muted">Supprimer une catégorie ne perd aucune fiche : elles passent en « Sans catégorie ».</p>
        {cats.map((c) => (
          <div key={c.id} className="flex items-center gap-2">
            <input defaultValue={c.nom} onBlur={(e) => { if (e.target.value.trim() && e.target.value !== c.nom) renommer(c, e.target.value.trim()); }} className={inputCls + " py-1.5"} />
            <button onClick={() => suppr(c)} className="grid h-8 w-8 shrink-0 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2 border-t border-border pt-2">
          <input value={nouv} onChange={(e) => setNouv(e.target.value)} placeholder="Nouvelle catégorie…" className={inputCls + " py-1.5"} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} />
          <button onClick={ajouter} disabled={busy} className="inline-flex shrink-0 items-center gap-1 rounded-lg px-3 py-2 text-[0.78rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />} Ajouter</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Historique ──────────────────────────────────────────────────
function HistoriqueModal({ historique, onClose }: { historique: DispHisto[]; onClose: () => void }) {
  const phrase = (h: DispHisto) => {
    if (h.action === "creation") return `a créé la fiche ${h.contactNom || ""}`;
    if (h.action === "suppression") return `a supprimé la fiche ${h.contactNom || ""}`;
    if (h.action === "import") return `a importé la fiche ${h.contactNom || ""}`;
    return `a modifié « ${h.champ || "un champ"} » de ${h.contactNom || ""}${h.nouveau ? ` → ${h.nouveau}` : ""}`;
  };
  return (
    <Modal titre="🕰️ Historique des modifications" onClose={onClose} max={560}>
      {historique.length === 0 ? <p className="py-6 text-center text-[0.84rem] text-faint">Aucune modification enregistrée pour l&apos;instant.</p> : (
        <div className="flex max-h-[62vh] flex-col gap-1 overflow-y-auto pr-1">
          {historique.map((h) => (
            <div key={h.id} className="flex items-start justify-between gap-3 rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
              <span className="min-w-0"><b className="text-ink">{h.par || "Quelqu'un"}</b> <span className="text-muted">{phrase(h)}</span>{h.ancien && h.action === "modification" ? <span className="text-faint"> (avant : {h.ancien})</span> : null}</span>
              <span className="shrink-0 text-faint">{dateFR(h.createdAt)}</span>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}

// ── Import (coller le contenu du salon Discord) ─────────────────
const CLE_MAP: [RegExp, string][] = [
  [/responsable|g[eé]rant|patron|proprio|propri[eé]taire/i, "responsable"],
  [/adresse|lieu|localisation|ville/i, "adresse"],
  [/t[eé]l[eé]gramme|telegram/i, "telegramme"],
  [/horaire/i, "horaires"],
  [/service|prestation/i, "typeService"],
  [/produit|stock|mati[eè]re/i, "produits"],
  [/tarif|prix|co[uû]t/i, "tarifs"],
  [/banque|compte|iban|paiement/i, "banque"],
  [/cat[eé]gorie/i, "categorie"],
  [/description/i, "description"],
  [/contact|t[eé]l[eé]phone|joindre/i, "moyensContact"],
  [/note|remarque|info/i, "notes"],
];
function parsePaste(texte: string): FicheImport[] {
  const blocs = texte.split(/\n\s*(?:[-–—=*_]{3,}\s*)?\n(?=\s*\S)/).map((b) => b.trim()).filter((b) => b.length > 1);
  const out: FicheImport[] = [];
  for (const bloc of blocs) {
    const lignes = bloc.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lignes.length) continue;
    const nom = lignes[0].replace(/^[#>*•\-–\s]+/, "").replace(/\*\*/g, "").slice(0, 200);
    if (!nom) continue;
    const f: FicheImport = { nom };
    const notes: string[] = [];
    for (const l of lignes.slice(1)) {
      const m = l.match(/^[*•\->\s]*([A-Za-zÀ-ÿ' ]{2,30})\s*[:：]\s*(.+)$/);
      if (m) {
        const champ = CLE_MAP.find(([re]) => re.test(m[1]));
        if (champ) { const key = champ[1] as keyof FicheImport; f[key] = ((f[key] ? f[key] + " · " : "") + m[2].trim()) as never; continue; }
      }
      notes.push(l.replace(/^[*•\->\s]+/, ""));
    }
    if (notes.length) f.notes = ((f.notes ? f.notes + "\n" : "") + notes.join("\n")) as never;
    out.push(f);
  }
  return out;
}
function ImportModal({ cats, onClose, onDone, setFlash }: { cats: DispCategorie[]; onClose: () => void; onDone: (msg: string) => void; setFlash: (f: FlashMsg) => void }) {
  const [texte, setTexte] = useState("");
  const [apercu, setApercu] = useState<FicheImport[] | null>(null);
  const [defautCat, setDefautCat] = useState("");
  const [busy, setBusy] = useState(false);
  function analyser() { const f = parsePaste(texte); if (!f.length) { setFlash({ t: "bad", m: "Rien de détecté — colle le contenu des fiches (une fiche par bloc, séparé par une ligne vide)." }); return; } setApercu(f); }
  async function lancer() {
    if (!apercu) return; setBusy(true);
    const fiches = defautCat ? apercu.map((f) => ({ ...f, categorie: f.categorie || cats.find((c) => c.id === defautCat)?.nom })) : apercu;
    const r = await importerContacts(fiches);
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Import impossible." }); return; }
    onDone(`Import terminé : ${r.importes} fiche(s) ajoutée(s)${r.doublons ? `, ${r.doublons} doublon(s) ignoré(s)` : ""}${r.aVerifier.length ? `, ${r.aVerifier.length} à vérifier` : ""}.`);
  }
  return (
    <Modal titre="📥 Importer des fiches" onClose={onClose} max={620}>
      <div className="flex flex-col gap-3">
        {!apercu ? (
          <>
            <p className="text-[0.82rem] text-muted">Colle ici le contenu des fiches du salon Discord — <b>une fiche par bloc</b> (séparées par une ligne vide ou « --- »). La 1ʳᵉ ligne = le nom ; les lignes « <i>Clé : valeur</i> » sont rangées automatiquement, le reste va en notes. Rien n&apos;est perdu.</p>
            <textarea className={inputCls} rows={10} value={texte} onChange={(e) => setTexte(e.target.value)} placeholder={"Menuiserie de Rhodes\nResponsable : Earl\nTélégramme : @rhodes-bois\nProduits : planches, poutres\n\nMine de Fer d'Annesburg\n…"} autoFocus />
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5 text-[0.76rem]"><span className="text-faint">Catégorie par défaut :</span><select value={defautCat} onChange={(e) => setDefautCat(e.target.value)} className={inputCls + " py-1"}><option value="">—</option>{cats.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select></div>
              <button onClick={analyser} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2"><Search className="h-3.5 w-3.5" /> Analyser</button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[0.82rem] text-muted"><b>{apercu.length}</b> fiche(s) détectée(s). Vérifie l&apos;aperçu puis lance l&apos;import (les doublons seront ignorés).</p>
            <div className="flex max-h-[46vh] flex-col gap-1 overflow-y-auto pr-1">
              {apercu.map((f, i) => (
                <div key={i} className="rounded-[8px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem]">
                  <div className="font-semibold">{f.nom}</div>
                  <div className="text-faint">{Object.entries(f).filter(([k, val]) => k !== "nom" && val).map(([k]) => k).join(" · ") || "nom seul — à compléter"}</div>
                </div>
              ))}
            </div>
            <div className="flex justify-end gap-2">
              <button onClick={() => setApercu(null)} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Retour</button>
              <button onClick={lancer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />} Importer {apercu.length}</button>
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
