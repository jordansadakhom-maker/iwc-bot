"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Target, Plus, Loader2, Trash2 } from "lucide-react";
import type { OpDetail } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { creerOperation, majOperation, supprimerOperation } from "@/app/(app)/operations/actions";

type Board = { preparation: OpDetail[]; encours: OpDetail[]; terminees: OpDetail[] };
type Router = ReturnType<typeof useRouter>;

const PHASES: { key: string; label: string; tone: string }[] = [
  { key: "preparation", label: "Préparation", tone: "var(--warn)" },
  { key: "en_cours", label: "En cours", tone: "var(--steel)" },
  { key: "terminee", label: "Terminée", tone: "var(--good)" },
  { key: "annulee", label: "Annulée", tone: "var(--muted)" },
];
const POLES = [
  { key: "legal", label: "⚖️ Iron Wolf" },
  { key: "illegal", label: "🔪 La Confrérie" },
];

const inputCls =
  "w-full rounded-[9px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

function Flash({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border px-3 py-2 text-[0.78rem]" style={{ color: "var(--good)", borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
      {children}
    </div>
  );
}

function Modal({ titre, children, onClose }: { titre: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div
        className="max-h-[88vh] w-full max-w-[500px] overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-card"
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

function Picker({ options, value, onChange }: { options: { key: string; label: string; tone?: string }[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.key;
        const tone = o.tone || "var(--accent)";
        return (
          <button
            key={o.key}
            onClick={() => onChange(o.key)}
            className="rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition"
            style={{ color: on ? "#000" : tone, background: on ? tone : "transparent", borderColor: "color-mix(in srgb," + tone + " 45%,var(--border))" }}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function Champ({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">{label}</span>
      {children}
    </label>
  );
}

export function OperationsBoard({ operations }: { operations: Board }) {
  const router = useRouter();
  const [sel, setSel] = useState<OpDetail | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const total = operations.preparation.length + operations.encours.length + operations.terminees.length;

  const cols: [keyof Board, string][] = [["preparation", "Préparation"], ["encours", "En cours"], ["terminees", "Terminées"]];

  return (
    <>
      <div className="mb-3 flex items-center justify-between gap-2.5">
        <div className="flex items-center gap-2.5">
          <h3 className="text-[0.8rem] font-semibold uppercase tracking-[0.06em] text-muted">Opérations</h3>
          <span className="font-num text-[0.8rem] text-faint">{total}</span>
        </div>
        <button
          onClick={() => setNouveau(true)}
          className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-ink transition hover:border-border-2"
        >
          <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Nouvelle opération
        </button>
      </div>

      {total === 0 ? (
        <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
          <Target className="h-6 w-6 text-faint" strokeWidth={1.6} />
          <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">Aucune opération pour l&apos;instant. Crée-en une avec « Nouvelle opération », ou elles remonteront depuis Discord.</p>
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          {cols.map(([key, label]) => (
            <div key={key}>
              <div className="mb-2.5 flex items-center gap-2 text-[0.72rem] uppercase tracking-[0.08em] text-muted">
                {label} <span className="ml-auto font-num text-faint">{operations[key].length}</span>
              </div>
              <div className="flex flex-col gap-2.5">
                {operations[key].length === 0 ? (
                  <div className="rounded-[11px] border border-dashed border-border px-3 py-4 text-center text-[0.72rem] text-faint">—</div>
                ) : operations[key].map((o) => (
                  <button key={o.id} onClick={() => setSel(o)} className="rounded-[11px] border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                    <div className="text-[0.85rem] font-semibold">{o.titre}</div>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-[0.7rem] text-muted">
                      <Badge>{o.type}</Badge>
                      {o.membres > 0 ? <span>{o.membres} agent(s)</span> : null}
                      {o.prime ? <span className="font-num">{o.prime}</span> : null}
                    </div>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {sel ? <EditModal op={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <NouveauModal onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function NouveauModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [cible, setCible] = useState("");
  const [categorie, setCategorie] = useState("");
  const [pole, setPole] = useState("legal");
  const [prime, setPrime] = useState("");
  const [lieu, setLieu] = useState("");
  const [objectif, setObjectif] = useState("");
  const [phase, setPhase] = useState("preparation");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [ok, setOk] = useState(false);

  async function creer() {
    setErr(null);
    if (cible.trim().length < 2) { setErr("Donne un titre à l'opération."); return; }
    setBusy(true);
    const r = await creerOperation({ cible, categorie, pole, prime, lieu, objectif, phase });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    setOk(true);
    router.refresh();
  }

  return (
    <Modal titre="🎯 Nouvelle opération" onClose={onClose}>
      {ok ? (
        <div className="flex flex-col gap-3">
          <Flash>Opération créée — elle apparaîtra ici dans ~30 s.</Flash>
          <div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Champ label="Titre / objectif *"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} placeholder="Escorte d'un convoi vers Saint-Denis" maxLength={200} autoFocus /></Champ>
          <div className="grid gap-3 sm:grid-cols-2">
            <Champ label="Type"><input className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Escorte, Braquage…" maxLength={80} /></Champ>
            <Champ label="Prime / butin visé"><input className={inputCls} value={prime} onChange={(e) => setPrime(e.target.value)} placeholder="$800" maxLength={120} /></Champ>
          </div>
          <Champ label="Lieu"><input className={inputCls} value={lieu} onChange={(e) => setLieu(e.target.value)} placeholder="Valentine, Rhodes…" maxLength={120} /></Champ>
          <Champ label="Objectif détaillé"><textarea className={inputCls + " min-h-[60px] resize-y"} value={objectif} onChange={(e) => setObjectif(e.target.value)} placeholder="Ce qu'il faut accomplir…" maxLength={500} /></Champ>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Pôle</span><Picker options={POLES} value={pole} onChange={setPole} /></div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Phase de départ</span><Picker options={PHASES.filter((p) => p.key !== "annulee")} value={phase} onChange={setPhase} /></div>
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" strokeWidth={2} />} Créer
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function EditModal({ op, onClose, router }: { op: OpDetail; onClose: () => void; router: Router }) {
  const [cible, setCible] = useState(op.titre);
  const [categorie, setCategorie] = useState(op.type);
  const [prime, setPrime] = useState(op.prime || "");
  const [phase, setPhase] = useState(op.phase);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function changerPhaseLocale(ph: string) {
    if (ph === phase) return;
    const prev = phase; setPhase(ph); setBusy("phase");
    const r = await majOperation(op.id, { phase: ph });
    setBusy(null);
    if (!r.ok) { setPhase(prev); setFlash(r.error || "Échec."); return; }
    setFlash("Phase enregistrée — mise à jour dans ~30 s.");
  }
  async function enregistrer() {
    setBusy("save");
    const r = await majOperation(op.id, { cible, categorie, prime });
    setBusy(null);
    setFlash(r.ok ? "Enregistré — mise à jour dans ~30 s." : (r.error || "Échec."));
  }
  async function supprimer() {
    setBusy("del");
    const r = await supprimerOperation(op.id);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    router.refresh();
    onClose();
  }

  return (
    <Modal titre="Modifier l'opération" onClose={onClose}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <div className="flex flex-col gap-3">
        <Champ label="Titre / objectif"><input className={inputCls} value={cible} onChange={(e) => setCible(e.target.value)} maxLength={200} /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Type"><input className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)} maxLength={80} /></Champ>
          <Champ label="Prime / butin"><input className={inputCls} value={prime} onChange={(e) => setPrime(e.target.value)} maxLength={120} /></Champ>
        </div>
        <div className="flex justify-end">
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">
            {busy === "save" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enregistrer
          </button>
        </div>

        <div className="flex flex-col gap-1 border-t border-border pt-3">
          <span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Phase {busy === "phase" ? "· enregistrement…" : "(modifiable même en cours)"}</span>
          <Picker options={PHASES} value={phase} onChange={changerPhaseLocale} />
        </div>

        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]">
              <span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button>
            </div>
          ) : (
            <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
          )}
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
        </div>
      </div>
    </Modal>
  );
}
