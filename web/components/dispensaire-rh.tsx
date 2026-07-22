"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Search, Loader2, X, Check, Pencil, Trash2, AlertTriangle, CalendarDays, Landmark, Send, Minus } from "lucide-react";
import type { RhData, Salarie } from "@/lib/dispensaire-rh";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { VideRegistre } from "@/components/dispensaire-ui";
import { creerSalarie, majSalarie, supprimerSalarie, ajusterAbsence } from "@/app/dispensaire/rh/actions";

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
    setSal((p) => p.map((x) => (x.id === s.id ? { ...x, statut: "renvoye" } : x)));
    const r = await majSalarie(s.id, { statut: "renvoye" });
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
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
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.72rem] text-faint">
                      <span className="inline-flex items-center gap-1"><CalendarDays className="h-3 w-3" /> Embauché {dateFR(s.dateEmbauche)}</span>
                      {s.telegramme ? <span className="inline-flex items-center gap-1"><Send className="h-3 w-3" /> {s.telegramme}</span> : null}
                      {s.compteBancaire ? <span className="inline-flex items-center gap-1"><Landmark className="h-3 w-3" /> {s.compteBancaire}</span> : null}
                    </div>
                    {s.qualifications ? <div className="mt-1 text-[0.74rem] text-muted">{s.qualifications}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
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
    </div>
  );
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
