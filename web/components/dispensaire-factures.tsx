"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Plus, Check, Pencil, Trash2, AlertTriangle, CalendarClock, Lock } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { FACTURE_STATUTS, factureStatut, factureOuverte, money, type FacturesData, type Facture } from "@/lib/dispensaire-facturation-const";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerFacture, majFacture, supprimerFacture } from "@/app/dispensaire/factures/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const todayYmd = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const enRetard = (f: Facture) => factureOuverte(f.statut) && !!f.dateEcheance && f.dateEcheance.slice(0, 10) < todayYmd();

export function DispensaireFactures({ data }: { data: FacturesData }) {
  const router = useRouter();
  const [factures, setFactures] = useState<Facture[]>(data.factures);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Facture | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Le suivi des factures est réservé aux chefs du dispensaire.</p>
    </div>
  );

  const liste = factures.filter((f) => !filtre || f.statut === filtre);
  const retard = factures.filter(enRetard).length;
  const du = factures.filter((f) => factureOuverte(f.statut)).reduce((a, f) => a + f.montant, 0);

  async function enregistrer(vals: Record<string, string>, editing: Facture | null) {
    if (editing) {
      setFactures((p) => p.map((f) => (f.id === editing.id ? { ...f, ...vals, montant: Number(vals.montant) || 0 } as Facture : f))); setForm(null);
      const r = await majFacture(editing.id, { ...vals, montant: Number(vals.montant) || 0 });
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Facture = { id: "tmp-" + Math.random().toString(36).slice(2, 8), objet: vals.objet, destinataire: vals.destinataire || null, montant: Number(vals.montant) || 0, dateEmission: vals.dateEmission || null, dateEcheance: vals.dateEcheance || null, statut: vals.statut || "non_payee", note: vals.note || null, par: null, createdAt: new Date().toISOString() };
      setFactures((p) => [tmp, ...p]); setForm(null);
      const r = await creerFacture({ ...vals, montant: Number(vals.montant) || 0 });
      if (!r.ok) { setFactures((p) => p.filter((f) => f.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setFactures((p) => p.map((f) => (f.id === tmp.id ? { ...f, id: r.id || tmp.id } : f))); setFlash({ t: "ok", m: "Facture créée." }); router.refresh(); }
    }
  }
  async function changerStatut(f: Facture, statut: string) {
    setFactures((p) => p.map((x) => (x.id === f.id ? { ...x, statut } : x)));
    const r = await majFacture(f.id, { statut });
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }
  async function supprimer(id: string) { setFactures((p) => p.filter((f) => f.id !== id)); setDelId(null); const r = await supprimerFacture(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-facturation.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border p-3" style={{ borderColor: retard ? "color-mix(in srgb,var(--oxblood) 45%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
          <div className="flex items-center gap-1.5 text-[0.74rem] text-faint"><AlertTriangle className="h-3.5 w-3.5" style={{ color: retard ? "var(--oxblood)" : "var(--faint)" }} /> En retard</div>
          <div className="font-num text-[1.4rem] font-bold" style={{ color: retard ? "var(--oxblood)" : "var(--ink)" }}>{retard}</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface-2 p-3">
          <div className="text-[0.74rem] text-faint">Encours (non réglé)</div>
          <div className="font-num text-[1.4rem] font-bold">{money(du)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2"><h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Receipt className="h-4 w-4 text-accent" /> Factures</h3><span className="font-num text-[0.8rem] text-faint">{factures.length}</span></div>
        <div className="flex items-center gap-2">
          <select className={inputCls + " max-w-[170px]"} value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="">Tous statuts</option>{FACTURE_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouvelle</button>
        </div>
      </div>

      {liste.length === 0 ? (
        factures.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">Aucune facture pour ce filtre.</p>
          : <VideRegistre icon={Receipt} titre="Aucune facture au registre" sous="Établis une première facture — elle apparaîtra ici avec son échéance et son état de règlement." />
      ) : (
        <div className="flex flex-col gap-2">
          {liste.map((f) => {
            const st = factureStatut(f.statut); const late = enRetard(f);
            return (
              <div key={f.id} className="rounded-[12px] border p-3" style={{ borderColor: late ? "color-mix(in srgb,var(--oxblood) 45%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5"><span className="text-[0.9rem] font-semibold">{f.objet}</span>{f.destinataire ? <span className="text-[0.76rem] text-faint">· {f.destinataire}</span> : null}{late ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-2.5 w-2.5" /> retard</span> : null}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.72rem] text-faint">
                      <span className="font-num text-[0.9rem] font-bold text-ink">{money(f.montant)}</span>
                      {f.dateEcheance ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> échéance {dateFR(f.dateEcheance)}</span> : null}
                    </div>
                    {f.note ? <div className="mt-1 text-[0.74rem] text-muted">{f.note}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => setForm(f)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setDelId(f.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                  {FACTURE_STATUTS.map((s) => (
                    <button key={s.key} onClick={() => changerStatut(f, s.key)} className="rounded-md border px-2 py-1 text-[0.68rem] font-semibold transition" style={f.statut === s.key ? { color: "#000", background: s.tone, borderColor: s.tone } : { color: s.tone, borderColor: "color-mix(in srgb," + s.tone + " 40%,var(--border))" }}>{s.label}</button>
                  ))}
                  <span className="ml-auto text-[0.66rem] uppercase" style={{ color: st.tone }}>{st.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {form ? <FactureForm initial={form === "new" ? null : form} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={factures.find((f) => f.id === delId)?.objet || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

function FactureForm({ initial, onClose, onSave }: { initial: Facture | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({
    objet: initial?.objet || "", destinataire: initial?.destinataire || "", montant: String(initial?.montant ?? 0),
    dateEmission: initial?.dateEmission ? initial.dateEmission.slice(0, 10) : "", dateEcheance: initial?.dateEcheance ? initial.dateEcheance.slice(0, 10) : "",
    statut: initial?.statut || "non_payee", note: initial?.note || "",
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() { if (v.objet.trim().length < 1) { setErr("L'objet est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier la facture" : "➕ Nouvelle facture"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Objet *"><input className={inputCls} value={v.objet} onChange={set("objet")} placeholder="Soins, fournitures…" autoFocus /></Champ>
          <Champ label="Destinataire"><input className={inputCls} value={v.destinataire} onChange={set("destinataire")} placeholder="Nom / entité" /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Montant ($)"><input className={inputCls} value={v.montant} onChange={(e) => setV((p) => ({ ...p, montant: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></Champ>
          <Champ label="Émission"><input className={inputCls} type="date" value={v.dateEmission} onChange={set("dateEmission")} /></Champ>
          <Champ label="Échéance"><input className={inputCls} type="date" value={v.dateEcheance} onChange={set("dateEcheance")} /></Champ>
        </div>
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={FACTURE_STATUTS} value={v.statut} onChange={(x) => setV((p) => ({ ...p, statut: x }))} /></div>
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
    <Modal titre="Supprimer la facture ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Supprimer définitivement <b className="text-ink">{nom}</b> ?</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        </div>
      </div>
    </Modal>
  );
}
