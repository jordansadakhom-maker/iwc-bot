"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Plus, Check, Pencil, Trash2, AlertTriangle, CalendarClock, Lock, Copy, FileText, Clock } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { FACTURE_STATUTS, FACTURE_DELAI_H, factureStatut, factureOuverte, echeanceEtat, copiePolice, money, type FacturesData, type Facture } from "@/lib/dispensaire-facturation-const";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerFacture, majFacture, supprimerFacture, logCopieFacture } from "@/app/dispensaire/factures/actions";
import { RapportImpayesModal } from "@/components/dispensaire-rapport-impayes";
import type { RapportImpayes, RapportHisto } from "@/lib/dispensaire-rapport-impayes";
import type { RapportConfig } from "@/lib/dispensaire-rapport-const";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const dtFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s)); } catch { return "—"; } };

export function DispensaireFactures({ data, rapport, historique, config }: { data: FacturesData; rapport: RapportImpayes; historique: RapportHisto[]; config: RapportConfig }) {
  const router = useRouter();
  const [factures, setFactures] = useState<Facture[]>(data.factures);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Facture | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");
  const [vue, setVue] = useState<"impayees" | "toutes">("impayees");
  const [rapportOpen, setRapportOpen] = useState(false);

  if (!data.canEdit) return (
    <div className="rounded-[14px] border border-border bg-surface p-8 text-center">
      <Lock className="mx-auto h-6 w-6 text-faint" />
      <p className="mt-2 text-[0.9rem] text-muted">Le suivi des factures est réservé aux chefs du dispensaire.</p>
    </div>
  );

  const base = useMemo(() => (vue === "impayees" ? factures.filter((f) => factureOuverte(f.statut)) : factures), [factures, vue]);
  const liste = base.filter((f) => !filtre || f.statut === filtre);
  const retard = factures.filter((f) => echeanceEtat(f) === "depasse").length;
  const du = factures.filter((f) => factureOuverte(f.statut)).reduce((a, f) => a + f.montant, 0);

  async function enregistrer(vals: Record<string, string>, editing: Facture | null) {
    // Émission = date SAISIE (repli : maintenant) ; échéance = émission + 72 h.
    const et = Date.parse(vals.dateEmission || "");
    const emissionIso = Number.isFinite(et) ? new Date(et).toISOString() : new Date().toISOString();
    const ech = new Date(new Date(emissionIso).getTime() + FACTURE_DELAI_H * 3600000).toISOString();
    if (editing) {
      setFactures((p) => p.map((f) => (f.id === editing.id ? { ...f, ...vals, montant: Number(vals.montant) || 0, dateEmission: emissionIso, dateEcheance: ech } as Facture : f))); setForm(null);
      const r = await majFacture(editing.id, { ...vals, montant: Number(vals.montant) || 0 });
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Facture mise à jour." }); router.refresh(); }
    } else {
      const nowIso = new Date().toISOString();
      const tmp: Facture = { id: "tmp-" + Math.random().toString(36).slice(2, 8), objet: vals.objet, destinataire: vals.destinataire || null, montant: Number(vals.montant) || 0, dateEmission: emissionIso, dateEcheance: ech, statut: vals.statut || "non_payee", note: vals.note || null, par: null, createdAt: nowIso, datePaiement: null, payePar: null };
      setFactures((p) => [tmp, ...p]); setForm(null);
      const r = await creerFacture({ ...vals, montant: Number(vals.montant) || 0 });
      if (!r.ok) { setFactures((p) => p.filter((f) => f.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setFactures((p) => p.map((f) => (f.id === tmp.id ? { ...f, id: r.id || tmp.id } : f))); setFlash({ t: "ok", m: `Facture créée — échéance ${FACTURE_DELAI_H} h après l'émission.` }); router.refresh(); }
    }
  }
  async function changerStatut(f: Facture, statut: string) {
    const etait = f.statut;
    setFactures((p) => p.map((x) => (x.id === f.id ? { ...x, statut, datePaiement: statut === "payee" ? new Date().toISOString() : x.datePaiement } : x)));
    const r = await majFacture(f.id, { statut });
    if (!r.ok) { setFactures((p) => p.map((x) => (x.id === f.id ? { ...x, statut: etait } : x))); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setFlash({ t: "ok", m: statut === "payee" ? "Facture réglée — retirée des impayés." : `Statut : ${factureStatut(statut).label}.` }); router.refresh(); }
  }
  async function supprimer(id: string) { setFactures((p) => p.filter((f) => f.id !== id)); setDelId(null); const r = await supprimerFacture(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Facture supprimée." }); router.refresh(); } }
  async function copier(f: Facture) {
    try { await navigator.clipboard.writeText(copiePolice(f)); setFlash({ t: "ok", m: "Informations copiées — Date · Nom · Prix dû." }); logCopieFacture(f.id); }
    catch { setFlash({ t: "bad", m: "Copie impossible sur cet appareil." }); }
  }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <Flash tone="bad">Lance <b>dispensaire-facturation.sql</b> puis <b>dispensaire-factures-plus.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-[12px] border p-3" style={{ borderColor: retard ? "color-mix(in srgb,var(--oxblood) 45%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
          <div className="flex items-center gap-1.5 text-[0.74rem] text-faint"><AlertTriangle className="h-3.5 w-3.5" style={{ color: retard ? "var(--oxblood)" : "var(--faint)" }} /> Délai dépassé</div>
          <div className="font-num text-[1.4rem] font-bold" style={{ color: retard ? "var(--oxblood)" : "var(--ink)" }}>{retard}</div>
        </div>
        <div className="rounded-[12px] border border-border bg-surface-2 p-3">
          <div className="text-[0.74rem] text-faint">Encours (non réglé)</div>
          <div className="font-num text-[1.4rem] font-bold">{money(du)}</div>
        </div>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Receipt className="h-4 w-4 text-accent" /> Factures</h3>
          <div className="flex overflow-hidden rounded-lg border border-border text-[0.72rem] font-semibold">
            {(["impayees", "toutes"] as const).map((k) => <button key={k} onClick={() => setVue(k)} className="px-2.5 py-1 transition" style={vue === k ? { background: "var(--accent)", color: "#000" } : { color: "var(--muted)" }}>{k === "impayees" ? "Impayées" : "Toutes"}</button>)}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setRapportOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted transition hover:text-ink"><FileText className="h-3.5 w-3.5" /> Rapport FDO</button>
          <select className={inputCls + " max-w-[160px]"} value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="">Tous statuts</option>{FACTURE_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouvelle</button>
        </div>
      </div>

      {liste.length === 0 ? (
        factures.length
          ? <p className="px-1 py-10 text-center text-[0.85rem] italic text-faint">{vue === "impayees" ? "Aucune facture impayée — tout est réglé." : "Aucune facture pour ce filtre."}</p>
          : <VideRegistre icon={Receipt} titre="Aucune facture au registre" sous="Établis une première facture — l'échéance à 72 h est posée automatiquement." />
      ) : (
        <div className="flex flex-col gap-2">
          {liste.map((f) => {
            const st = factureStatut(f.statut); const ech = echeanceEtat(f);
            return (
              <div key={f.id} className="rounded-[12px] border p-3" style={{ borderColor: ech === "depasse" ? "color-mix(in srgb,var(--oxblood) 45%,var(--border))" : ech === "bientot" ? "color-mix(in srgb,var(--warn) 45%,var(--border))" : "var(--border)", background: "var(--surface-2)" }}>
                <div className="flex items-start gap-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[0.9rem] font-semibold">{f.objet}</span>
                      {f.destinataire ? <span className="text-[0.76rem] text-faint">· {f.destinataire}</span> : null}
                      {ech === "depasse" ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold text-white" style={{ background: "var(--oxblood)" }}><AlertTriangle className="h-2.5 w-2.5" /> délai dépassé</span> : null}
                      {ech === "bientot" ? <span className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[0.6rem] font-bold" style={{ background: "color-mix(in srgb,var(--warn) 20%,transparent)", color: "var(--warn)" }}><Clock className="h-2.5 w-2.5" /> bientôt échue</span> : null}
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[0.72rem] text-faint">
                      <span className="font-num text-[0.9rem] font-bold text-ink">{money(f.montant)}</span>
                      {f.dateEcheance ? <span className="inline-flex items-center gap-1"><CalendarClock className="h-3 w-3" /> échéance {dtFR(f.dateEcheance)}</span> : null}
                      {f.statut === "payee" && f.datePaiement ? <span className="inline-flex items-center gap-1" style={{ color: "var(--good)" }}><Check className="h-3 w-3" /> réglée {dateFR(f.datePaiement)}{f.payePar ? ` · ${f.payePar}` : ""}</span> : null}
                    </div>
                    {f.note ? <div className="mt-1 text-[0.74rem] text-muted">{f.note}</div> : null}
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button onClick={() => copier(f)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Copier les informations" title="Copier Date · Nom · Prix dû"><Copy className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setForm(f)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                    <button onClick={() => setDelId(f.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                  </div>
                </div>
                {/* Statuts — tous toujours disponibles */}
                <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border pt-2">
                  {FACTURE_STATUTS.map((s) => (
                    <button key={s.key} onClick={() => changerStatut(f, s.key)} className="rounded-md border px-2 py-1 text-[0.68rem] font-semibold transition hover:brightness-110" style={f.statut === s.key ? { color: "#000", background: s.tone, borderColor: s.tone } : { color: s.tone, borderColor: "color-mix(in srgb," + s.tone + " 40%,var(--border))" }}>{s.label}</button>
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
      {rapportOpen ? <RapportImpayesModal initial={rapport} historique={historique} config={config} onClose={() => setRapportOpen(false)} /> : null}
    </div>
  );
}

function FactureForm({ initial, onClose, onSave }: { initial: Facture | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => {
    const d = new Date();
    const auj = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    return {
      objet: initial?.objet || "", destinataire: initial?.destinataire || "", montant: initial ? String(initial.montant) : "2",
      statut: initial?.statut || "non_payee", note: initial?.note || "",
      // Date d'émission SAISIE (on n'émet pas forcément le jour même). Défaut : aujourd'hui.
      dateEmission: initial?.dateEmission ? String(initial.dateEmission).slice(0, 10) : auj,
    };
  });
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  // Échéance = date d'émission + 72 h (FACTURE_DELAI_H). Affichée, recalculée en
  // direct quand on change l'émission. Automatique : le serveur la (re)calcule aussi.
  const echeance = (() => {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v.dateEmission || "");
    if (!m) return "";
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])); d.setUTCDate(d.getUTCDate() + Math.round(FACTURE_DELAI_H / 24));
    return d.toISOString().slice(0, 10);
  })();
  function go() { if (v.objet.trim().length < 1) { setErr("L'objet est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier la facture" : "➕ Nouvelle facture"} onClose={onClose} max={560}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Prénom / Nom *"><input className={inputCls} value={v.objet} onChange={set("objet")} placeholder="Prénom Nom du patient" autoFocus /></Champ>
          <Champ label="Type de soins ou médicaments"><input className={inputCls} value={v.destinataire} onChange={set("destinataire")} placeholder="Ex. bandage, morphine…" /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Montant ($)"><input className={inputCls} value={v.montant} onChange={(e) => setV((p) => ({ ...p, montant: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span><Picker options={FACTURE_STATUTS} value={v.statut} onChange={(x) => setV((p) => ({ ...p, statut: x }))} /></div>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date d'émission"><input type="date" className={inputCls} value={v.dateEmission} onChange={set("dateEmission")} /></Champ>
          <Champ label={`Échéance · auto +${FACTURE_DELAI_H} h`}><input type="date" className={inputCls + " cursor-not-allowed opacity-70"} value={echeance} readOnly tabIndex={-1} title={`Calculée automatiquement : ${FACTURE_DELAI_H} h après la date d'émission`} /></Champ>
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
