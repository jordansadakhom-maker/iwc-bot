"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Truck, Package, PackageCheck, PlusCircle, Pencil, Trash2, Loader2, X, ChevronDown,
  AlertTriangle, CalendarClock, MapPin, Phone, ClipboardList, Building2, ShoppingCart,
} from "lucide-react";
import { Cartouche, VideRegistre } from "@/components/dispensaire-ui";
import { Flash, inputCls } from "@/components/edit-ui";
import {
  APPRO_STATUTS, APPRO_CATEGORIES, approStatut, sousLeSeuil, trierLignes,
  type ApprovisionnementsData, type ApproLigne, type Fournisseur, type ApproStatut,
} from "@/lib/dispensaire-approvisionnements-const";
import {
  creerLigne, majLigne, supprimerLigne, creerFournisseur, majFournisseur, supprimerFournisseur,
} from "@/app/dispensaire/approvisionnements/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const labelCls = "text-[0.68rem] uppercase tracking-[0.05em] text-faint";
const dateFR = (s: string | null) => { if (!s) return null; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "2-digit" }).format(new Date(s)); } catch { return null; } };
const ymd = (iso: string | null) => (iso || "").slice(0, 10);

type LigneForm = { article: string; categorie: string; fournisseur: string; stock: string; seuil: string; unite: string; datePrevue: string; statut: ApproStatut; note: string };
const ligneVide: LigneForm = { article: "", categorie: "", fournisseur: "", stock: "", seuil: "", unite: "", datePrevue: "", statut: "a_commander", note: "" };
type FournForm = { nom: string; categorie: string; contact: string; lieu: string; note: string };
const fournVide: FournForm = { nom: "", categorie: "", contact: "", lieu: "", note: "" };

export function DispensaireApprovisionnements({ data }: { data: ApprovisionnementsData }) {
  const router = useRouter();
  const [lignes, setLignes] = useState<ApproLigne[]>(data.lignes);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>(data.fournisseurs);
  useEffect(() => { setLignes(data.lignes); setFournisseurs(data.fournisseurs); }, [data]);

  const [flash, setFlash] = useState<FlashMsg>(null);
  const canEdit = data.canEdit;

  const tri = useMemo(() => trierLignes(lignes), [lignes]);
  const stats = useMemo(() => ({
    aCommander: lignes.filter((l) => l.statut === "a_commander").length,
    urgente: lignes.filter((l) => l.statut === "urgente").length,
    passee: lignes.filter((l) => l.statut === "passee").length,
    aRecuperer: lignes.filter((l) => l.statut === "a_recuperer").length,
    sousSeuil: lignes.filter(sousLeSeuil).length,
  }), [lignes]);

  const [ligneEdit, setLigneEdit] = useState<ApproLigne | null>(null);
  const [fournEdit, setFournEdit] = useState<Fournisseur | null>(null);

  async function changerStatut(id: string, statut: ApproStatut) {
    setLignes((p) => p.map((l) => (l.id === id ? { ...l, statut } : l)));
    const r = await majLigne(id, { statut });
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); } else router.refresh();
  }
  async function supprLigne(id: string) {
    setLignes((p) => p.filter((l) => l.id !== id));
    const r = await supprimerLigne(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Ligne supprimée." }); router.refresh(); }
  }
  async function supprFourn(id: string) {
    setFournisseurs((p) => p.filter((f) => f.id !== id));
    const r = await supprimerFournisseur(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Fournisseur supprimé." }); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-5">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-approvisionnements.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* ── Tableau de bord ── */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Cartouche icon={ShoppingCart} label="À commander" valeur={stats.aCommander} ton="var(--accent)" sous="en attente de commande" />
        <Cartouche icon={AlertTriangle} label="Urgentes" valeur={stats.urgente} ton="var(--oxblood)" sous="à traiter en priorité" />
        <Cartouche icon={Truck} label="Déjà passées" valeur={stats.passee} sous="commandes en cours" />
        <Cartouche icon={PackageCheck} label="À récupérer" valeur={stats.aRecuperer} ton="var(--good)" sous="prêtes chez le fournisseur" />
        <Cartouche icon={Package} label="Sous le seuil" valeur={stats.sousSeuil} ton={stats.sousSeuil ? "var(--oxblood)" : "var(--muted)"} sous="stock au niveau d'alerte" />
      </div>

      {/* ── Ajouter une ligne ── */}
      {canEdit ? <AjoutLigne fournisseurs={fournisseurs} onDone={(m) => { setFlash(m); router.refresh(); }} /> : null}

      {/* ── Commandes & seuils ── */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><ClipboardList className="h-4 w-4 text-accent" /> Commandes &amp; seuils <span className="font-num text-[0.8rem] text-faint">{lignes.length}</span></h3>
        {tri.length === 0 ? (
          <VideRegistre icon={ShoppingCart} titre="Aucune ligne d'approvisionnement" sous="Ajoute un premier article à surveiller — stock, seuil, date prévue et statut de commande." />
        ) : (
          <div className="flex flex-col gap-2">
            {tri.map((l) => (
              <LigneCarte key={l.id} l={l} canEdit={canEdit} onStatut={changerStatut} onEditer={() => setLigneEdit(l)} onSupprimer={() => supprLigne(l.id)} />
            ))}
          </div>
        )}
      </section>

      {/* ── Carnet de fournisseurs ── */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Building2 className="h-4 w-4 text-accent" /> Carnet de fournisseurs <span className="font-num text-[0.8rem] text-faint">{fournisseurs.length}</span></h3>
        {canEdit ? <AjoutFournisseur onDone={(m) => { setFlash(m); router.refresh(); }} /> : null}
        {fournisseurs.length === 0 ? (
          <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucun fournisseur enregistré (distillerie, tonnellerie, mine, menuisier, cheminots…).</p>
        ) : (
          <div className="mt-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {fournisseurs.map((f) => (
              <FournisseurCarte key={f.id} f={f} canEdit={canEdit} onEditer={() => setFournEdit(f)} onSupprimer={() => supprFourn(f.id)} />
            ))}
          </div>
        )}
      </section>

      {ligneEdit ? <EditLigneModal ligne={ligneEdit} fournisseurs={fournisseurs} onClose={() => setLigneEdit(null)} onDone={(m) => { setFlash(m); if (m?.t === "ok") router.refresh(); }} /> : null}
      {fournEdit ? <EditFournisseurModal fourn={fournEdit} onClose={() => setFournEdit(null)} onDone={(m) => { setFlash(m); if (m?.t === "ok") router.refresh(); }} /> : null}
    </div>
  );
}

// ── Carte d'une ligne d'approvisionnement ─────────────────────────────────────
function LigneCarte({ l, canEdit, onStatut, onEditer, onSupprimer }: { l: ApproLigne; canEdit: boolean; onStatut: (id: string, s: ApproStatut) => void; onEditer: () => void; onSupprimer: () => void }) {
  const st = approStatut(l.statut);
  const alerte = sousLeSeuil(l);
  const pct = l.seuil > 0 ? Math.min(100, Math.round((l.stock / l.seuil) * 100)) : 100;
  const dp = dateFR(l.datePrevue);
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 p-3" style={alerte ? { borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))" } : undefined}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface"><Package className="h-4 w-4 text-accent" /></span>
        <div className="min-w-0">
          <div className="flex items-center gap-2"><span className="font-display text-[0.98rem] text-ink">{l.article}</span>{alerte ? <span className="inline-flex items-center gap-1 rounded-full border border-oxblood/40 px-1.5 text-[0.58rem] font-bold uppercase tracking-[0.06em] text-oxblood"><AlertTriangle className="h-3 w-3" /> Sous le seuil</span> : null}</div>
          <div className="text-[0.7rem] text-faint">{l.categorie}{l.fournisseur ? <> · <span className="text-muted">{l.fournisseur}</span></> : null}</div>
        </div>
        <span className="ml-auto shrink-0 rounded-md px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: st.tone, background: `color-mix(in srgb,${st.tone} 15%,transparent)` }}>{st.label}</span>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto] sm:items-center">
        <div>
          <div className="mb-1 flex items-center justify-between text-[0.72rem]">
            <span className="text-faint">Stock&nbsp;: <span className="font-num font-semibold text-ink">{l.stock}{l.unite ? ` ${l.unite}` : ""}</span>{l.seuil > 0 ? <span className="text-faint"> · seuil {l.seuil}</span> : null}</span>
            {dp ? <span className="inline-flex items-center gap-1 text-faint"><CalendarClock className="h-3 w-3" /> prévue {dp}</span> : null}
          </div>
          <div className="h-1.5 overflow-hidden rounded-full" style={{ background: "var(--surface)" }}>
            <div className="h-full rounded-full" style={{ width: `${Math.max(3, pct)}%`, background: alerte ? "var(--oxblood)" : "var(--good)" }} />
          </div>
        </div>
        <div className="flex items-center justify-end gap-2">
          {canEdit ? (
            <>
              <select value={l.statut} onChange={(e) => onStatut(l.id, e.target.value as ApproStatut)} className="rounded-lg border border-border bg-surface px-2 py-1 text-[0.74rem] outline-none" aria-label="Statut">
                {APPRO_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
              </select>
              <button onClick={onEditer} className="text-faint transition hover:text-accent" aria-label="Modifier" title="Modifier"><Pencil className="h-4 w-4" /></button>
              <button onClick={onSupprimer} className="text-faint transition hover:text-oxblood" aria-label="Supprimer" title="Supprimer"><Trash2 className="h-4 w-4" /></button>
            </>
          ) : null}
        </div>
      </div>
      {l.note ? <p className="mt-2 text-[0.74rem] italic text-faint">{l.note}</p> : null}
    </div>
  );
}

// ── Carte d'un fournisseur ────────────────────────────────────────────────────
function FournisseurCarte({ f, canEdit, onEditer, onSupprimer }: { f: Fournisseur; canEdit: boolean; onEditer: () => void; onSupprimer: () => void }) {
  return (
    <div className="group flex flex-col rounded-[12px] border border-border bg-surface-2 p-3">
      <div className="flex items-start gap-2">
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border border-border bg-surface"><Truck className="h-4 w-4 text-accent" /></span>
        <div className="min-w-0 flex-1">
          <div className="font-display text-[0.95rem] text-ink">{f.nom}</div>
          <div className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">{f.categorie}</div>
        </div>
        {canEdit ? <div className="flex gap-1.5 opacity-0 transition group-hover:opacity-100"><button onClick={onEditer} className="text-faint hover:text-accent" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button><button onClick={onSupprimer} className="text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button></div> : null}
      </div>
      <div className="mt-2 flex flex-col gap-1 text-[0.76rem]">
        {f.contact ? <span className="inline-flex items-center gap-1.5 text-muted"><Phone className="h-3 w-3 text-faint" /> {f.contact}</span> : null}
        {f.lieu ? <span className="inline-flex items-center gap-1.5 text-muted"><MapPin className="h-3 w-3 text-faint" /> {f.lieu}</span> : null}
        {f.note ? <span className="text-[0.72rem] italic text-faint">{f.note}</span> : null}
      </div>
    </div>
  );
}

// ── Formulaire d'ajout d'une ligne ────────────────────────────────────────────
function AjoutLigne({ fournisseurs, onDone }: { fournisseurs: Fournisseur[]; onDone: (m: FlashMsg) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<LigneForm>(ligneVide);
  const set = (k: keyof LigneForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function ajouter() {
    if (!f.article.trim()) { onDone({ t: "bad", m: "Donne un nom à l'article." }); return; }
    setBusy(true);
    const r = await creerLigne({ ...f });
    setBusy(false);
    if (!r.ok) { onDone({ t: "bad", m: r.error || "Impossible." }); return; }
    setF((p) => ({ ...ligneVide, categorie: p.categorie, fournisseur: p.fournisseur, unite: p.unite, statut: p.statut }));
    onDone({ t: "ok", m: "Ligne d'approvisionnement ajoutée." });
  }
  return (
    <section className="rounded-[14px] border border-border bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <PlusCircle className="h-4 w-4 text-accent" />
        <span className="text-[0.9rem] font-semibold">Ajouter un article à surveiller</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-faint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="border-t border-border p-4">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1"><span className={labelCls}>Article *</span><input className={inputCls} value={f.article} onChange={set("article")} placeholder="Whisky, tonneaux, charbon…" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Catégorie</span><input className={inputCls} value={f.categorie} onChange={set("categorie")} placeholder="Distillerie…" list="appro-cats" /><datalist id="appro-cats">{APPRO_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Fournisseur</span><input className={inputCls} value={f.fournisseur} onChange={set("fournisseur")} placeholder="Nom du fournisseur" list="appro-fourn" /><datalist id="appro-fourn">{fournisseurs.map((x) => <option key={x.id} value={x.nom} />)}</datalist></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Stock actuel</span><input type="number" min="0" step="0.01" className={inputCls} value={f.stock} onChange={set("stock")} placeholder="0" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Seuil d&apos;alerte</span><input type="number" min="0" step="0.01" className={inputCls} value={f.seuil} onChange={set("seuil")} placeholder="0" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Unité</span><input className={inputCls} value={f.unite} onChange={set("unite")} placeholder="caisses, sacs…" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Date prévue de commande</span><input type="date" className={inputCls} value={f.datePrevue} onChange={set("datePrevue")} /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Statut</span><select className={inputCls} value={f.statut} onChange={set("statut")}>{APPRO_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
            <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1"><span className={labelCls}>Note</span><input className={inputCls} value={f.note} onChange={set("note")} placeholder="Précision éventuelle" /></label>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={ajouter} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Ajouter</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Formulaire d'ajout d'un fournisseur ───────────────────────────────────────
function AjoutFournisseur({ onDone }: { onDone: (m: FlashMsg) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [f, setF] = useState<FournForm>(fournVide);
  const set = (k: keyof FournForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function ajouter() {
    if (!f.nom.trim()) { onDone({ t: "bad", m: "Donne un nom au fournisseur." }); return; }
    setBusy(true);
    const r = await creerFournisseur({ ...f });
    setBusy(false);
    if (!r.ok) { onDone({ t: "bad", m: r.error || "Impossible." }); return; }
    setF((p) => ({ ...fournVide, categorie: p.categorie }));
    onDone({ t: "ok", m: "Fournisseur ajouté au carnet." });
  }
  return (
    <div className="rounded-lg border border-border bg-surface-2">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2 text-left">
        <PlusCircle className="h-4 w-4 text-accent" />
        <span className="text-[0.82rem] font-semibold">Ajouter un fournisseur</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-faint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="border-t border-border p-3">
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            <label className="flex flex-col gap-1"><span className={labelCls}>Nom *</span><input className={inputCls} value={f.nom} onChange={set("nom")} placeholder="Distillerie de Saint-Denis…" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Catégorie</span><input className={inputCls} value={f.categorie} onChange={set("categorie")} placeholder="Distillerie…" list="appro-cats-f" /><datalist id="appro-cats-f">{APPRO_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Contact</span><input className={inputCls} value={f.contact} onChange={set("contact")} placeholder="Personne, canal, téléphone…" /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Lieu</span><input className={inputCls} value={f.lieu} onChange={set("lieu")} placeholder="Où le trouver" /></label>
            <label className="flex flex-col gap-1 sm:col-span-2 lg:col-span-1"><span className={labelCls}>Note</span><input className={inputCls} value={f.note} onChange={set("note")} placeholder="Horaires, tarifs…" /></label>
          </div>
          <div className="mt-3 flex justify-end">
            <button onClick={ajouter} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlusCircle className="h-4 w-4" />} Ajouter</button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── Édition d'une ligne ───────────────────────────────────────────────────────
function EditLigneModal({ ligne, fournisseurs, onClose, onDone }: { ligne: ApproLigne; fournisseurs: Fournisseur[]; onClose: () => void; onDone: (m: FlashMsg) => void }) {
  const [f, setF] = useState<LigneForm>({ article: ligne.article, categorie: ligne.categorie, fournisseur: ligne.fournisseur || "", stock: String(ligne.stock), seuil: String(ligne.seuil), unite: ligne.unite || "", datePrevue: ymd(ligne.datePrevue), statut: ligne.statut, note: ligne.note || "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof LigneForm) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save() {
    if (!f.article.trim()) { onDone({ t: "bad", m: "Le nom de l'article ne peut pas être vide." }); return; }
    setBusy(true);
    const r = await majLigne(ligne.id, { article: f.article, categorie: f.categorie, fournisseur: f.fournisseur, stock: f.stock, seuil: f.seuil, unite: f.unite, datePrevue: f.datePrevue, statut: f.statut, note: f.note });
    setBusy(false);
    if (!r.ok) { onDone({ t: "bad", m: r.error || "Impossible." }); return; }
    onDone({ t: "ok", m: "Ligne modifiée." });
    onClose();
  }
  return (
    <ModalCadre titre="Modifier l'article" onClose={onClose}>
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Article</span><input className={inputCls} value={f.article} onChange={set("article")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Catégorie</span><input className={inputCls} value={f.categorie} onChange={set("categorie")} list="appro-cats-e" /><datalist id="appro-cats-e">{APPRO_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Fournisseur</span><input className={inputCls} value={f.fournisseur} onChange={set("fournisseur")} list="appro-fourn-e" /><datalist id="appro-fourn-e">{fournisseurs.map((x) => <option key={x.id} value={x.nom} />)}</datalist></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Stock</span><input type="number" min="0" step="0.01" className={inputCls} value={f.stock} onChange={set("stock")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Seuil</span><input type="number" min="0" step="0.01" className={inputCls} value={f.seuil} onChange={set("seuil")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Unité</span><input className={inputCls} value={f.unite} onChange={set("unite")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Date prévue</span><input type="date" className={inputCls} value={f.datePrevue} onChange={set("datePrevue")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Statut</span><select className={inputCls} value={f.statut} onChange={set("statut")}>{APPRO_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select></label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Note</span><input className={inputCls} value={f.note} onChange={set("note")} /></label>
      </div>
      <PiedModal busy={busy} onClose={onClose} onSave={save} />
    </ModalCadre>
  );
}

// ── Édition d'un fournisseur ──────────────────────────────────────────────────
function EditFournisseurModal({ fourn, onClose, onDone }: { fourn: Fournisseur; onClose: () => void; onDone: (m: FlashMsg) => void }) {
  const [f, setF] = useState<FournForm>({ nom: fourn.nom, categorie: fourn.categorie, contact: fourn.contact || "", lieu: fourn.lieu || "", note: fourn.note || "" });
  const [busy, setBusy] = useState(false);
  const set = (k: keyof FournForm) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save() {
    if (!f.nom.trim()) { onDone({ t: "bad", m: "Le nom ne peut pas être vide." }); return; }
    setBusy(true);
    const r = await majFournisseur(fourn.id, { nom: f.nom, categorie: f.categorie, contact: f.contact, lieu: f.lieu, note: f.note });
    setBusy(false);
    if (!r.ok) { onDone({ t: "bad", m: r.error || "Impossible." }); return; }
    onDone({ t: "ok", m: "Fournisseur modifié." });
    onClose();
  }
  return (
    <ModalCadre titre="Modifier le fournisseur" onClose={onClose}>
      <div className="grid gap-2 p-4 sm:grid-cols-2">
        <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Nom</span><input className={inputCls} value={f.nom} onChange={set("nom")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Catégorie</span><input className={inputCls} value={f.categorie} onChange={set("categorie")} /></label>
        <label className="flex flex-col gap-1"><span className={labelCls}>Contact</span><input className={inputCls} value={f.contact} onChange={set("contact")} /></label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Lieu</span><input className={inputCls} value={f.lieu} onChange={set("lieu")} /></label>
        <label className="flex flex-col gap-1 sm:col-span-2"><span className={labelCls}>Note</span><input className={inputCls} value={f.note} onChange={set("note")} /></label>
      </div>
      <PiedModal busy={busy} onClose={onClose} onSave={save} />
    </ModalCadre>
  );
}

function ModalCadre({ titre, onClose, children }: { titre: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/55 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iwc-pop w-full max-w-[560px] rounded-[14px] border border-border-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-[1.05rem]"><Pencil className="h-4 w-4 text-accent" /> {titre}</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
function PiedModal({ busy, onClose, onSave }: { busy: boolean; onClose: () => void; onSave: () => void }) {
  return (
    <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
      <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-semibold transition hover:border-accent">Annuler</button>
      <button onClick={onSave} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer</button>
    </div>
  );
}
