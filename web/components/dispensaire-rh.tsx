"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Search, Loader2, X, Check, Pencil, Trash2, AlertTriangle, CalendarDays, Landmark, Send, Minus, Link2, Gavel } from "lucide-react";
import type { RhData, Salarie } from "@/lib/dispensaire-rh";
import { type Sanction, SANCTION_TYPES, sanctionLabel, sanctionTone } from "@/lib/dispensaire-sanctions-const";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { VideRegistre } from "@/components/dispensaire-ui";
import { creerSalarie, majSalarie, supprimerSalarie, ajusterAbsence } from "@/app/dispensaire/rh/actions";
import { ajouterSanction, supprimerSanction } from "@/app/dispensaire/rh/sanctions-actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const GRADES = ["Interne", "Aide-soignant", "Infirmier", "Médecin", "Médecin-chef", "Adjoint", "Chef", "Directeur"];
const STATUTS = [{ key: "actif", label: "Actif", tone: "var(--good)" }, { key: "suspendu", label: "Suspendu", tone: "var(--warn)" }, { key: "renvoye", label: "Renvoyé", tone: "var(--oxblood)" }];
const statTone = (s: string) => STATUTS.find((x) => x.key === s)?.tone || "var(--muted)";
const statLabel = (s: string) => STATUTS.find((x) => x.key === s)?.label || s;
const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };
const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function DispensaireRh({ data }: { data: RhData }) {
  const router = useRouter();
  const canEdit = data.canEdit;
  const SEUIL = data.seuilRenvoi; // seuil configurable (panneau admin)
  const [sal, setSal] = useState<Salarie[]>(data.salaries);
  const [q, setQ] = useState("");
  const [statut, setStatut] = useState("");
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Salarie | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [sancFor, setSancFor] = useState<Salarie | null>(null);
  const [sancMap, setSancMap] = useState<Record<string, Sanction[]>>(data.sanctionsParSalarie);

  async function addSanction(salarie: Salarie, v: { type: string; motif: string; date: string; duree: string; commentaire: string }) {
    const tmp: Sanction = { id: "tmp-" + Math.random().toString(36).slice(2, 8), salarieId: salarie.id, nom: salarie.nom, type: v.type, motif: v.motif, date: v.date || new Date().toISOString().slice(0, 10), duree: v.duree || null, commentaire: v.commentaire || null, par: null, createdAt: new Date().toISOString() };
    setSancMap((m) => ({ ...m, [salarie.id]: [tmp, ...(m[salarie.id] || [])] }));
    const r = await ajouterSanction({ salarieId: salarie.id, nom: salarie.nom, type: v.type, motif: v.motif, date: v.date, duree: v.duree, commentaire: v.commentaire });
    if (!r.ok) { setSancMap((m) => ({ ...m, [salarie.id]: (m[salarie.id] || []).filter((x) => x.id !== tmp.id) })); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setSancMap((m) => ({ ...m, [salarie.id]: (m[salarie.id] || []).map((x) => (x.id === tmp.id ? { ...x, id: r.id || tmp.id } : x)) })); setFlash({ t: "ok", m: "Sanction enregistrée." }); router.refresh(); }
  }
  async function delSanction(salarieId: string, id: string) {
    setSancMap((m) => ({ ...m, [salarieId]: (m[salarieId] || []).filter((x) => x.id !== id) }));
    const r = await supprimerSanction(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }

  const query = norm(q.trim());
  const liste = sal
    .filter((s) => (!statut || s.statut === statut) && (!query || norm([s.nom, s.grade, s.qualifications, s.telegramme].filter(Boolean).join(" ")).includes(query)))
    .sort((a, b) => a.nom.localeCompare(b.nom));
  const aRenvoyer = sal.filter((s) => s.statut === "actif" && s.absInjustifiees >= SEUIL).length;

  async function enregistrer(vals: Record<string, string>, editing: Salarie | null) {
    if (editing) {
      setSal((p) => p.map((s) => (s.id === editing.id ? { ...s, ...vals } as Salarie : s)));
      setForm(null);
      const r = await majSalarie(editing.id, vals);
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Salarie = { id: "tmp-" + Math.random().toString(36).slice(2, 8), nom: vals.nom, grade: vals.grade || null, qualifications: vals.qualifications || null, dateEmbauche: vals.dateEmbauche || null, compteBancaire: vals.compteBancaire || null, telegramme: vals.telegramme || null, statut: vals.statut || "actif", absJustifiees: 0, absInjustifiees: 0, notes: vals.notes || null, updatedAt: null, updatedBy: null };
      setSal((p) => [...p, tmp]); setForm(null);
      const r = await creerSalarie(vals);
      if (!r.ok) { setSal((p) => p.filter((s) => s.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setSal((p) => p.map((s) => (s.id === tmp.id ? { ...s, id: r.id || tmp.id } : s))); setFlash({ t: "ok", m: "Salarié ajouté." }); router.refresh(); }
    }
  }
  async function supprimer(id: string) { setSal((p) => p.filter((s) => s.id !== id)); setDelId(null); const r = await supprimerSalarie(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function absence(s: Salarie, type: "j" | "i", delta: number) {
    setSal((p) => p.map((x) => (x.id === s.id ? { ...x, [type === "i" ? "absInjustifiees" : "absJustifiees"]: Math.max(0, (type === "i" ? x.absInjustifiees : x.absJustifiees) + delta) } : x)));
    const r = await ajusterAbsence(s.id, type, delta);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." });
  }
  async function renvoyer(s: Salarie) {
    // Le renvoi coupe l'accès dans la foulée (côté serveur) → on l'anticipe à l'écran.
    setSal((p) => p.map((x) => (x.id === s.id ? { ...x, statut: "renvoye", acces: x.acces ? { ...x.acces, actif: false } : x.acces } : x)));
    const r = await majSalarie(s.id, { statut: "renvoye" });
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: `${s.nom} renvoyé — accès au site coupé.` }); router.refresh(); }
  }

  if (!canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Users className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Cet onglet est réservé aux membres habilités du dispensaire.</p>
    </div>
  );

  return (
    <div className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Users className="h-4 w-4 text-accent" /> Salariés</h3>
          <span className="font-num text-[0.8rem] text-faint">{sal.length}</span>
          {aRenvoyer ? <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-3 w-3" /> {aRenvoyer} à renvoyer</span> : null}
        </div>
        <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" strokeWidth={2} /> Ajouter salarié</button>
      </div>

      {!data.pret ? <div className="mb-3"><Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-rh.sql</b> dans Supabase, puis recharge.</Flash></div> : null}
      {flash ? <div className="mb-3"><Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash></div> : null}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[180px] flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un salarié, un grade…" /></div>
        <select className={inputCls + " max-w-[160px]"} value={statut} onChange={(e) => setStatut(e.target.value)}><option value="">Tous statuts</option>{STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
      </div>

      {liste.length === 0 ? (
        q || statut
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucun salarié ne correspond à ta recherche.</p>
          : <VideRegistre icon={Users} titre="Le personnel n'est pas encore inscrit" sous="Enregistre un premier salarié — grade, embauche, télégramme — et sa fiche s'ouvrira ici, avec le suivi des absences." />
      ) : (
        <div className="grid gap-2.5 lg:grid-cols-2">
          {liste.map((s) => {
            const danger = s.statut === "actif" && s.absInjustifiees >= SEUIL;
            return (
              <div key={s.id} className="rounded-[12px] border p-3" style={{ borderColor: danger ? "color-mix(in srgb,var(--oxblood) 50%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.9rem] font-semibold">{s.nom}</span>
                      {s.grade ? <span className="rounded-full border border-border px-1.5 py-0.5 text-[0.64rem] font-semibold text-muted">{s.grade}</span> : null}
                      <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold uppercase" style={{ color: statTone(s.statut), background: `color-mix(in srgb,${statTone(s.statut)} 14%,transparent)` }}>{statLabel(s.statut)}</span>
                      {s.acces ? <AccesPastille acces={s.acces} renvoye={s.statut === "renvoye"} /> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.72rem] text-faint">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Embauché {dateFR(s.dateEmbauche)}</span>
                      {s.telegramme ? <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" /> {s.telegramme}</span> : null}
                      {s.compteBancaire ? <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" /> {s.compteBancaire}</span> : null}
                    </div>
                    {s.qualifications ? <div className="mt-1 text-[0.74rem] text-muted">{s.qualifications}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setSancFor(s)} className="relative grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Sanctions" title="Sanctions disciplinaires">
                      <Gavel className="h-3.5 w-3.5" />
                      {(sancMap[s.id]?.length || 0) > 0 ? <span className="absolute -right-1 -top-1 grid h-3.5 min-w-[0.9rem] place-items-center rounded-full px-0.5 text-[0.54rem] font-bold text-white" style={{ background: "var(--oxblood)" }}>{sancMap[s.id].length}</span> : null}
                    </button>
                    <button onClick={() => setForm(s)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setDelId(s.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-3 border-t border-border pt-2 text-[0.74rem]">
                  <AbsCtrl label="Justifiées" val={s.absJustifiees} tone="var(--good)" onMinus={() => absence(s, "j", -1)} onPlus={() => absence(s, "j", 1)} />
                  <AbsCtrl label="Injustifiées" val={s.absInjustifiees} tone={danger ? "var(--oxblood)" : "var(--warn)"} onMinus={() => absence(s, "i", -1)} onPlus={() => absence(s, "i", 1)} />
                  {danger ? <button onClick={() => renvoyer(s)} className="ml-auto inline-flex items-center gap-1 rounded-md px-2 py-1 text-[0.72rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-3 w-3" /> Renvoyer</button> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? <SalarieForm initial={form === "new" ? null : form} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={sal.find((s) => s.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
      {sancFor ? <SanctionsModal salarie={sancFor} sanctions={sancMap[sancFor.id] || []} onClose={() => setSancFor(null)} onAdd={(v) => addSanction(sancFor, v)} onDel={(id) => delSanction(sancFor.id, id)} /> : null}
    </div>
  );
}

const dateFRcourt = (s: string | null) => { if (!s) return "—"; try { return new Date(s.length <= 10 ? s + "T00:00:00" : s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" }); } catch { return "—"; } };

// Dossier disciplinaire d'un salarié : historique complet + ajout d'une sanction.
function SanctionsModal({ salarie, sanctions, onClose, onAdd, onDel }: { salarie: Salarie; sanctions: Sanction[]; onClose: () => void; onAdd: (v: { type: string; motif: string; date: string; duree: string; commentaire: string }) => void; onDel: (id: string) => void }) {
  const [v, setV] = useState({ type: "avertissement", motif: "", date: new Date().toISOString().slice(0, 10), duree: "", commentaire: "" });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: keyof typeof v) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() {
    if (!v.motif.trim()) { setErr("Indique le motif."); return; }
    setErr(null);
    onAdd({ ...v, motif: v.motif.trim() });
    setV((p) => ({ ...p, motif: "", duree: "", commentaire: "" }));
  }
  return (
    <Modal titre={`Sanctions — ${salarie.nom}`} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        {/* Ajout */}
        <div className="rounded-[10px] border border-border bg-surface-2 p-3">
          <div className="mb-2 flex items-center gap-1.5 text-[0.78rem] font-semibold"><Gavel className="h-3.5 w-3.5 text-accent" /> Nouvelle sanction</div>
          <div className="flex flex-col gap-2">
            <div className="flex flex-col gap-1"><span className="text-[0.68rem] uppercase tracking-[0.05em] text-faint">Type</span><Picker options={SANCTION_TYPES.map((t) => ({ key: t.key, label: t.label, tone: t.tone }))} value={v.type} onChange={(x) => setV((p) => ({ ...p, type: x }))} /></div>
            <Champ label="Motif *"><input className={inputCls} value={v.motif} onChange={set("motif")} placeholder="Raison de la sanction" autoFocus /></Champ>
            <div className="grid gap-2 sm:grid-cols-2">
              <Champ label="Date"><input type="date" className={inputCls} value={v.date} onChange={set("date")} /></Champ>
              <Champ label="Durée (si applicable)"><input className={inputCls} value={v.duree} onChange={set("duree")} placeholder="ex. 7 jours" /></Champ>
            </div>
            <Champ label="Commentaire"><textarea className={inputCls} rows={2} value={v.commentaire} onChange={set("commentaire")} placeholder="Précisions, contexte…" /></Champ>
            {err ? <p className="text-[0.78rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
            <button onClick={go} className="self-end inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Enregistrer la sanction</button>
          </div>
        </div>

        {/* Historique */}
        <div>
          <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint">Historique ({sanctions.length})</div>
          {sanctions.length === 0 ? (
            <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucune sanction au dossier.</p>
          ) : (
            <div className="flex flex-col gap-1.5">
              {sanctions.map((sx) => (
                <div key={sx.id} className="group rounded-[10px] border border-border bg-surface p-2.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold" style={{ color: sanctionTone(sx.type), background: `color-mix(in srgb,${sanctionTone(sx.type)} 14%,transparent)` }}>{sanctionLabel(sx.type)}</span>
                    <span className="text-[0.82rem] font-semibold">{sx.motif}</span>
                    {sx.duree ? <span className="text-[0.72rem] text-muted">· {sx.duree}</span> : null}
                    <span className="ml-auto font-num text-[0.72rem] text-faint">{dateFRcourt(sx.date)}</span>
                    <button onClick={() => onDel(sx.id)} className="text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer la sanction"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                  {sx.commentaire ? <div className="mt-1 text-[0.76rem] text-muted">{sx.commentaire}</div> : null}
                  {sx.par ? <div className="mt-0.5 text-[0.68rem] text-faint">Par {sx.par}</div> : null}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
}

// Pastille d'accès au site rapproché depuis la liste blanche (une seule fiche).
function AccesPastille({ acces, renvoye }: { acces: NonNullable<Salarie["acces"]>; renvoye: boolean }) {
  const base = "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.62rem] font-semibold";
  if (!acces.present) return <span className={base} style={{ color: "var(--muted)", background: "color-mix(in srgb,var(--muted) 12%,transparent)" }} title="Aucune fiche d'accès au site pour ce salarié">Sans accès</span>;
  // Désynchronisation critique : renvoyé mais l'accès est resté ouvert.
  if (renvoye && acces.actif) return <span className="rounded-full px-1.5 py-0.5 text-[0.62rem] font-bold text-white" style={{ background: "var(--oxblood)" }} title="Renvoyé mais l'accès au site est encore actif — le bouton « Renvoyer » le coupe">⚠ Accès actif</span>;
  if (acces.actif) return <span className={base} style={{ color: "var(--good)", background: "color-mix(in srgb,var(--good) 14%,transparent)" }} title={`Accès au site actif${acces.role ? " · grade d'accès : " + acces.role : ""}${acces.lieDiscord ? " · Discord lié" : ""}`}>{acces.lieDiscord ? <Link2 className="h-2.5 w-2.5" /> : null} Accès</span>;
  return <span className={base} style={{ color: "var(--faint)", background: "color-mix(in srgb,var(--faint) 12%,transparent)" }} title="Accès au site coupé">Accès coupé</span>;
}

function AbsCtrl({ label, val, tone, onMinus, onPlus }: { label: string; val: number; tone: string; onMinus: () => void; onPlus: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="text-faint">{label}</span>
      <button onClick={onMinus} className="grid h-5 w-5 place-items-center rounded border border-border text-muted hover:text-ink"><Minus className="h-3 w-3" /></button>
      <span className="min-w-[1.2rem] text-center font-num font-semibold" style={{ color: tone }}>{val}</span>
      <button onClick={onPlus} className="grid h-5 w-5 place-items-center rounded border border-border text-muted hover:text-ink"><Plus className="h-3 w-3" /></button>
    </span>
  );
}

function SalarieForm({ initial, onClose, onSave }: { initial: Salarie | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({
    nom: initial?.nom || "", grade: initial?.grade || "", qualifications: initial?.qualifications || "",
    dateEmbauche: initial?.dateEmbauche ? initial.dateEmbauche.slice(0, 10) : "", compteBancaire: initial?.compteBancaire || "",
    telegramme: initial?.telegramme || "", statut: initial?.statut || "actif", notes: initial?.notes || "",
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le salarié" : "➕ Ajouter un salarié"} onClose={onClose} max={540}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Nom *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Prénom Nom" autoFocus /></Champ>
          <Champ label="Grade / niveau"><input className={inputCls} value={v.grade} onChange={set("grade")} placeholder="Infirmier, Médecin…" list="disp-grades" /><datalist id="disp-grades">{GRADES.map((g) => <option key={g} value={g} />)}</datalist></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date d'embauche"><input className={inputCls} type="date" value={v.dateEmbauche} onChange={set("dateEmbauche")} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={STATUTS.map((s) => ({ key: s.key, label: s.label, tone: s.tone }))} value={v.statut} onChange={(x) => setV((p) => ({ ...p, statut: x }))} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="N° de compte bancaire"><input className={inputCls} value={v.compteBancaire} onChange={set("compteBancaire")} placeholder="123456" /></Champ>
          <Champ label="N° de télégramme"><input className={inputCls} value={v.telegramme} onChange={set("telegramme")} placeholder="@indicatif" /></Champ>
        </div>
        <Champ label="Qualifications"><input className={inputCls} value={v.qualifications} onChange={set("qualifications")} placeholder="Chirurgie, pharmacie…" /></Champ>
        <Champ label="Notes"><textarea className={inputCls} rows={2} value={v.notes} onChange={set("notes")} /></Champ>
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
    <Modal titre="Supprimer le salarié ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer définitivement <b className="text-ink">{nom}</b> du registre ?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
