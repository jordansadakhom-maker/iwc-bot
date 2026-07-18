"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Bandage, Pill, Stethoscope, Clock, History, UserPlus, Loader2, Trash2, Plus } from "lucide-react";
import type { DossierItem } from "@/lib/queries";
import { creerDossier, majDossier, ajouterBlessure, ajouterOrdonnance, supprimerDossier } from "@/app/(app)/medical/actions";

const STATUTS: { key: string; label: string; tone: string }[] = [
  { key: "apte", label: "Apte", tone: "var(--good)" },
  { key: "observation", label: "Observation", tone: "var(--warn)" },
  { key: "inapte", label: "Inapte", tone: "var(--oxblood)" },
  { key: "non_teste", label: "Non testé", tone: "var(--muted)" },
];
const toneOf = (k: string) => STATUTS.find((s) => s.key === (k || "").toLowerCase())?.tone || "var(--muted)";
const labelOf = (k: string) => STATUTS.find((s) => s.key === (k || "").toLowerCase())?.label || k;

const inputCls =
  "w-full rounded-[9px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

function StatutBadge({ statut }: { statut: string }) {
  const c = toneOf(statut);
  return (
    <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: c, background: "color-mix(in srgb," + c + " 16%,transparent)" }}>
      {labelOf(statut)}
    </span>
  );
}

function Section({ titre, icon: Icon, children, action }: { titre: string; icon: typeof Bandage; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="mt-3 border-t border-border pt-3">
      <div className="mb-2 flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint">
          <Icon className="h-3.5 w-3.5" strokeWidth={1.8} /> {titre}
        </div>
        {action}
      </div>
      <div className="flex flex-col gap-1.5">{children}</div>
    </div>
  );
}

export function MedicalGrid({ dossiers, membresLibres }: { dossiers: DossierItem[]; membresLibres: { id: string; nom: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<DossierItem | null>(null);
  const [nouveau, setNouveau] = useState(false);

  return (
    <>
      <div className="mb-3 flex justify-end">
        <button
          onClick={() => setNouveau(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"
        >
          <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} /> Nouveau dossier
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {dossiers.map((d) => (
          <button
            key={d.id}
            onClick={() => setSel(d)}
            className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[0.92rem] font-semibold">{d.nom}</div>
              <StatutBadge statut={d.statut} />
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-[0.74rem] text-muted">
              <span className="inline-flex items-center gap-1.5"><Bandage className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.blessures.length} blessure(s)</span>
              <span className="inline-flex items-center gap-1.5"><Pill className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.ordonnances.length} ordo.</span>
              <span className="inline-flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.suivis.length} soin(s)</span>
            </div>
            {d.reposJusquAt ? (
              <div className="mt-2 inline-flex items-center gap-1.5 text-[0.72rem]" style={{ color: "var(--warn)" }}>
                <Clock className="h-3.5 w-3.5" strokeWidth={1.8} /> Convalescence
              </div>
            ) : null}
          </button>
        ))}
      </div>

      {sel ? <DetailModal dossier={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <NouveauModal membres={membresLibres} onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

type Router = ReturnType<typeof useRouter>;

function Flash({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-[0.78rem]" style={{ color: "var(--good)", borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
      {children}
    </div>
  );
}

function NouveauModal({ membres, onClose, router }: { membres: { id: string; nom: string }[]; onClose: () => void; router: Router }) {
  const [membreId, setMembreId] = useState("");
  const [statut, setStatut] = useState("non_teste");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function creer() {
    setErr(null);
    if (!membreId) { setErr("Choisis un membre."); return; }
    setBusy(true);
    const r = await creerDossier(membreId, statut);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOk(true);
    router.refresh();
  }

  return (
    <Modal onClose={onClose} titre="🩺 Nouveau dossier médical">
      {ok ? (
        <div className="flex flex-col gap-3">
          <Flash>Dossier créé — il apparaîtra ici et sur Discord dans ~30 s.</Flash>
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Membre</span>
            <select className={inputCls} value={membreId} onChange={(e) => setMembreId(e.target.value)} autoFocus>
              <option value="">— Choisir —</option>
              {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select>
          </label>
          <div className="flex flex-col gap-1">
            <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut initial</span>
            <StatutPicker value={statut} onChange={setStatut} />
          </div>
          {membres.length === 0 ? <p className="text-[0.78rem] text-faint">Tous les membres ont déjà un dossier.</p> : null}
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />}
              Créer le dossier
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function StatutPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STATUTS.map((s) => {
        const on = value === s.key;
        return (
          <button
            key={s.key}
            onClick={() => onChange(s.key)}
            className="rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition"
            style={{ color: on ? "#000" : s.tone, background: on ? s.tone : "transparent", borderColor: "color-mix(in srgb," + s.tone + " 45%,var(--border))" }}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

function DetailModal({ dossier, onClose, router }: { dossier: DossierItem; onClose: () => void; router: Router }) {
  const id = dossier.membreId;
  const [statut, setStatut] = useState(dossier.statut);
  const [notes, setNotes] = useState(dossier.notes || "");
  const [blessures, setBlessures] = useState(dossier.blessures);
  const [ordos, setOrdos] = useState(dossier.ordonnances);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // formulaires
  const [bDesc, setBDesc] = useState(""); const [bLoc, setBLoc] = useState(""); const [bGrav, setBGrav] = useState("");
  const [oMed, setOMed] = useState(""); const [oPoso, setOPoso] = useState(""); const [oDuree, setODuree] = useState("");

  const notify = (m: string) => { setFlash(m); };

  async function changerStatut(s: string) {
    if (s === statut) return;
    const prev = statut; setStatut(s); setBusy("statut");
    const r = await majDossier(id, { statut: s });
    setBusy(null);
    if (!r.ok) { setStatut(prev); setFlash(r.error || "Échec."); return; }
    notify("Statut enregistré — mise à jour dans ~30 s.");
  }
  async function sauverNotes() {
    setBusy("notes");
    const r = await majDossier(id, { notes });
    setBusy(null);
    notify(r.ok ? "Notes enregistrées — mise à jour dans ~30 s." : (r.error || "Échec."));
  }
  async function addBlessure() {
    if (bDesc.trim().length < 2) { setFlash("Décris la blessure."); return; }
    setBusy("blessure");
    const r = await ajouterBlessure(id, { desc: bDesc, localisation: bLoc, gravite: bGrav });
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setBlessures((p) => [...p, { date: "à l'instant", desc: bDesc, localisation: bLoc, gravite: bGrav }]);
    setBDesc(""); setBLoc(""); setBGrav("");
    notify("Blessure ajoutée — mise à jour dans ~30 s.");
  }
  async function addOrdo() {
    if (oMed.trim().length < 2) { setFlash("Indique le médicament."); return; }
    setBusy("ordo");
    const r = await ajouterOrdonnance(id, { medicaments: oMed, posologie: oPoso, duree: oDuree });
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setOrdos((p) => [...p, { medicaments: oMed, posologie: oPoso, duree: oDuree }]);
    setOMed(""); setOPoso(""); setODuree("");
    notify("Ordonnance ajoutée — mise à jour dans ~30 s.");
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerDossier(id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh();
    onClose();
  }

  return (
    <Modal onClose={onClose} titre={dossier.nom}>
      <div className="mb-3"><StatutBadge statut={statut} /></div>

      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}

      <div className="flex flex-col gap-1">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut d&apos;aptitude</span>
        <StatutPicker value={statut} onChange={changerStatut} />
      </div>

      <div className="mt-3 flex flex-col gap-1">
        <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Notes du médecin</span>
        <textarea className={inputCls + " min-h-[70px] resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations, consignes…" maxLength={2000} />
        <div className="flex justify-end">
          <button onClick={sauverNotes} disabled={busy === "notes"} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
            {busy === "notes" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enregistrer les notes
          </button>
        </div>
      </div>

      <Section titre="Blessures / soins" icon={Bandage}>
        {blessures.slice().reverse().map((b, i) => (
          <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
            <div className="flex items-start justify-between gap-2">
              <span className="font-medium">{b.desc || "Blessure"}</span>
              {b.gravite ? <span className="shrink-0 text-[0.7rem] font-semibold" style={{ color: "var(--oxblood)" }}>{b.gravite}</span> : null}
            </div>
            <div className="mt-0.5 text-[0.72rem] text-faint">{[b.date, b.localisation].filter(Boolean).join(" · ") || "—"}</div>
          </div>
        ))}
        <div className="rounded-[9px] border border-dashed border-border p-2">
          <input className={inputCls} value={bDesc} onChange={(e) => setBDesc(e.target.value)} placeholder="Nouvelle blessure (ex : balle dans l'épaule)" maxLength={300} />
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <input className={inputCls} value={bLoc} onChange={(e) => setBLoc(e.target.value)} placeholder="Localisation" maxLength={120} />
            <input className={inputCls} value={bGrav} onChange={(e) => setBGrav(e.target.value)} placeholder="Gravité (bénigne/grave…)" maxLength={40} />
          </div>
          <div className="mt-1.5 flex justify-end">
            <button onClick={addBlessure} disabled={busy === "blessure"} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
              {busy === "blessure" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Ajouter
            </button>
          </div>
        </div>
      </Section>

      <Section titre="Ordonnances" icon={Pill}>
        {ordos.slice().reverse().map((o, i) => (
          <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
            <div className="font-medium">{o.medicaments || "Traitement"}</div>
            <div className="mt-0.5 text-[0.72rem] text-muted">{[o.posologie, o.duree].filter(Boolean).join(" · ") || "—"}</div>
          </div>
        ))}
        <div className="rounded-[9px] border border-dashed border-border p-2">
          <input className={inputCls} value={oMed} onChange={(e) => setOMed(e.target.value)} placeholder="Médicament (ex : Laudanum)" maxLength={300} />
          <div className="mt-1.5 grid grid-cols-2 gap-1.5">
            <input className={inputCls} value={oPoso} onChange={(e) => setOPoso(e.target.value)} placeholder="Posologie" maxLength={150} />
            <input className={inputCls} value={oDuree} onChange={(e) => setODuree(e.target.value)} placeholder="Durée" maxLength={80} />
          </div>
          <div className="mt-1.5 flex justify-end">
            <button onClick={addOrdo} disabled={busy === "ordo"} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
              {busy === "ordo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Ajouter
            </button>
          </div>
        </div>
      </Section>

      {dossier.historique.length ? (
        <Section titre="Historique" icon={History}>
          {dossier.historique.slice().reverse().slice(0, 10).map((h, i) => (
            <div key={i} className="flex items-baseline gap-2 text-[0.78rem]">
              <span className="shrink-0 font-num text-[0.7rem] text-faint">{h.date || ""}</span>
              <span className="text-muted">{h.action || ""}{h.par ? ` — ${h.par}` : ""}</span>
            </div>
          ))}
        </Section>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        {confirmDel ? (
          <div className="flex items-center gap-2 text-[0.78rem]">
            <span className="text-muted">Supprimer ce dossier ?</span>
            <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>
              {busy === "del" ? "…" : "Oui, supprimer"}
            </button>
            <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
          </div>
        ) : (
          <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink">
            <Trash2 className="h-3.5 w-3.5" /> Supprimer le dossier
          </button>
        )}
        <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
      </div>
    </Modal>
  );
}

function Modal({ titre, children, onClose }: { titre: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[540px] overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-card"
        style={{ background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="font-display text-xl">{titre}</div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-ink" aria-label="Fermer">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
