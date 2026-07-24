"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Plus, Check, Pencil, Trash2, AlertTriangle, CalendarClock, Lock, Copy, FileText, Printer, Loader2, Clock } from "lucide-react";
import { VideRegistre } from "@/components/dispensaire-ui";
import { FACTURE_STATUTS, FACTURE_DELAI_H, factureStatut, factureOuverte, echeanceEtat, copiePolice, money, type FacturesData, type Facture } from "@/lib/dispensaire-facturation-const";
import { Modal, Flash, Champ, Picker, inputCls } from "@/components/edit-ui";
import { creerFacture, majFacture, supprimerFacture, genererRapportPolice, logCopieFacture, type RapportPolice } from "@/app/dispensaire/factures/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const dateFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", year: "numeric" }).format(new Date(s)); } catch { return "—"; } };
const dtFR = (s: string | null) => { if (!s) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }).format(new Date(s)); } catch { return "—"; } };

export function DispensaireFactures({ data }: { data: FacturesData }) {
  const router = useRouter();
  const [factures, setFactures] = useState<Facture[]>(data.factures);
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Facture | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [filtre, setFiltre] = useState("");
  const [vue, setVue] = useState<"impayees" | "toutes">("impayees");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [rapport, setRapport] = useState<RapportPolice | null>(null);
  const [busyRap, setBusyRap] = useState(false);

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
  const selValides = [...sel].filter((id) => factures.some((f) => f.id === id));

  function toggleSel(id: string) { setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }
  function selTout() { const ids = liste.map((f) => f.id); setSel((p) => (ids.every((id) => p.has(id)) ? new Set() : new Set(ids))); }

  async function enregistrer(vals: Record<string, string>, editing: Facture | null) {
    if (editing) {
      setFactures((p) => p.map((f) => (f.id === editing.id ? { ...f, ...vals, montant: Number(vals.montant) || 0 } as Facture : f))); setForm(null);
      const r = await majFacture(editing.id, { ...vals, montant: Number(vals.montant) || 0 });
      if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Facture mise à jour." }); router.refresh(); }
    } else {
      const now = new Date(); const ech = new Date(now.getTime() + FACTURE_DELAI_H * 3600000).toISOString();
      const tmp: Facture = { id: "tmp-" + Math.random().toString(36).slice(2, 8), objet: vals.objet, destinataire: vals.destinataire || null, montant: Number(vals.montant) || 0, dateEmission: now.toISOString(), dateEcheance: ech, statut: vals.statut || "non_payee", note: vals.note || null, par: null, createdAt: now.toISOString(), datePaiement: null, payePar: null };
      setFactures((p) => [tmp, ...p]); setForm(null);
      const r = await creerFacture({ ...vals, montant: Number(vals.montant) || 0 });
      if (!r.ok) { setFactures((p) => p.filter((f) => f.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setFactures((p) => p.map((f) => (f.id === tmp.id ? { ...f, id: r.id || tmp.id } : f))); setFlash({ t: "ok", m: `Facture créée — échéance dans ${FACTURE_DELAI_H} h.` }); router.refresh(); }
    }
  }
  async function changerStatut(f: Facture, statut: string) {
    const etait = f.statut;
    setFactures((p) => p.map((x) => (x.id === f.id ? { ...x, statut, datePaiement: statut === "payee" ? new Date().toISOString() : x.datePaiement } : x)));
    const r = await majFacture(f.id, { statut });
    if (!r.ok) { setFactures((p) => p.map((x) => (x.id === f.id ? { ...x, statut: etait } : x))); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setFlash({ t: "ok", m: statut === "payee" ? "Facture réglée — retirée des impayés." : `Statut : ${factureStatut(statut).label}.` }); router.refresh(); }
  }
  async function supprimer(id: string) { setFactures((p) => p.filter((f) => f.id !== id)); setDelId(null); setSel((p) => { const n = new Set(p); n.delete(id); return n; }); const r = await supprimerFacture(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else { setFlash({ t: "ok", m: "Facture supprimée." }); router.refresh(); } }
  async function copier(f: Facture) {
    try { await navigator.clipboard.writeText(copiePolice(f)); setFlash({ t: "ok", m: "Informations copiées — Date · Nom · Prix dû." }); logCopieFacture(f.id); }
    catch { setFlash({ t: "bad", m: "Copie impossible sur cet appareil." }); }
  }
  async function generer() {
    if (!selValides.length) { setFlash({ t: "bad", m: "Sélectionne au moins une facture." }); return; }
    setBusyRap(true);
    const r = await genererRapportPolice(selValides);
    setBusyRap(false);
    if (!r.ok || !r.rapport) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setRapport(r.rapport); router.refresh();
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
          <select className={inputCls + " max-w-[160px]"} value={filtre} onChange={(e) => setFiltre(e.target.value)}><option value="">Tous statuts</option>{FACTURE_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}</select>
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouvelle</button>
        </div>
      </div>

      {/* Barre de sélection → rapport de police */}
      {liste.length ? (
        <div className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2 text-[0.76rem]">
          <button onClick={selTout} className="font-semibold text-muted hover:text-ink">{liste.every((f) => sel.has(f.id)) && liste.length ? "Tout désélectionner" : "Tout sélectionner"}</button>
          <span className="text-faint">· {selValides.length} sélectionnée(s)</span>
          <button onClick={generer} disabled={!selValides.length || busyRap} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--warn)" }}>{busyRap ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileText className="h-3.5 w-3.5" />} Générer le rapport</button>
        </div>
      ) : null}

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
                  <input type="checkbox" checked={sel.has(f.id)} onChange={() => toggleSel(f.id)} className="mt-1 h-4 w-4 shrink-0 accent-[var(--accent)]" aria-label="Sélectionner" />
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
      {rapport ? <RapportPoliceModal rapport={rapport} onClose={() => setRapport(null)} onFlash={setFlash} /> : null}
    </div>
  );
}

function RapportPoliceModal({ rapport, onClose, onFlash }: { rapport: RapportPolice; onClose: () => void; onFlash: (f: FlashMsg) => void }) {
  const genFR = dtFR(rapport.genereLe);
  function texte() {
    const l = ["DISPENSAIRE DE SAINT-DENIS", "Signalement d'impayés aux forces de l'ordre", "", `Établi le ${genFR} par ${rapport.medecin}`, "", ...rapport.lignes.map((x) => `• ${dateFR(x.date)} — ${x.nom || "—"}${x.soins ? ` — ${x.soins}` : ""} — ${money(x.montant)}`), "", `Nombre de dossiers : ${rapport.nbDossiers}`, `Total à recouvrer : ${money(rapport.total)}`];
    return l.join("\n");
  }
  async function copier() { try { await navigator.clipboard.writeText(texte()); onFlash({ t: "ok", m: "Rapport copié." }); } catch { onFlash({ t: "bad", m: "Copie impossible." }); } }
  return (
    <Modal titre="🚔 Rapport pour les forces de l'ordre" onClose={onClose} max={680}>
      <style>{`@media print { body * { visibility: hidden !important; } .rapport-police, .rapport-police * { visibility: visible !important; } .rapport-police { position: fixed; inset: 0; margin: 0; padding: 24px; background: #fff; color: #111; } .rapport-noprint { display: none !important; } }`}</style>
      <div className="flex flex-col gap-3">
        <div className="rapport-police rounded-[10px] border border-border bg-surface-2 p-4">
          <div className="text-center">
            <div className="font-display text-[1.1rem] font-bold">Dispensaire de Saint-Denis</div>
            <div className="text-[0.82rem] text-muted">Signalement d&apos;impayés aux forces de l&apos;ordre</div>
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 border-y border-border py-1.5 text-[0.74rem] text-faint">
            <span>Établi le <b className="text-ink">{genFR}</b></span>
            <span>Médecin : <b className="text-ink">{rapport.medecin}</b></span>
          </div>
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[440px] text-left text-[0.8rem]">
              <thead><tr className="border-b border-border text-[0.64rem] uppercase tracking-[0.04em] text-faint"><th className="py-1.5 pr-2">Date des soins</th><th className="px-2">Nom</th><th className="px-2">Soins / médicaments</th><th className="px-2 text-right">Montant dû</th></tr></thead>
              <tbody>
                {rapport.lignes.map((x, i) => (
                  <tr key={i} className="border-b border-border/50">
                    <td className="py-1.5 pr-2 font-num">{dateFR(x.date)}</td><td className="px-2 font-semibold">{x.nom || "—"}</td><td className="px-2 text-muted">{x.soins || "—"}</td><td className="px-2 text-right font-num font-semibold">{money(x.montant)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-2 flex flex-wrap justify-between gap-2 border-t border-border pt-2 text-[0.82rem]">
            <span>Nombre de dossiers : <b className="font-num">{rapport.nbDossiers}</b></span>
            <span>Total à recouvrer : <b className="font-num" style={{ color: "var(--oxblood)" }}>{money(rapport.total)}</b></span>
          </div>
        </div>
        <div className="rapport-noprint flex justify-end gap-2">
          <button onClick={copier} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2"><Copy className="h-3.5 w-3.5" /> Copier</button>
          <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Printer className="h-3.5 w-3.5" /> Imprimer</button>
        </div>
      </div>
    </Modal>
  );
}

function FactureForm({ initial, onClose, onSave }: { initial: Facture | null; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({
    objet: initial?.objet || "", destinataire: initial?.destinataire || "", montant: initial ? String(initial.montant) : "2",
    statut: initial?.statut || "non_payee", note: initial?.note || "",
  }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
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
        {!initial ? <p className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.74rem] text-faint"><CalendarClock className="h-3.5 w-3.5" /> Échéance posée automatiquement : <b>{FACTURE_DELAI_H} h</b> après la création.</p> : null}
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
