"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Target, Plus, Loader2, Trash2, MapPin, Users, CalendarClock, Link2, CheckCircle2, Clock3, Lock, Send, Flag, Landmark, Check, ScrollText, Download } from "lucide-react";
import type { OpDetail, EtapeDetail, MembreLite } from "@/lib/queries";
import { Badge } from "@/components/ui";
import { creerOperation, majOperation, supprimerOperation, assignerOperation, terminerOperation, envoyerContratOperation } from "@/app/(app)/operations/actions";
import { cents } from "@/lib/format";

const dateFR = (s: string | null) => { if (!s) return null; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" }); } catch { return null; } };

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

export function OperationsBoard({ operations, membres = [] }: { operations: Board; membres?: MembreLite[] }) {
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

      {sel ? <EditModal op={sel} membres={membres} onClose={() => setSel(null)} router={router} /> : null}
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

function MetaLigne({ icon, children }: { icon: React.ReactNode; children: React.ReactNode }) {
  return <div className="flex items-center gap-1.5 text-[0.8rem] text-muted">{icon}{children}</div>;
}

function EtapeBloc({ e, i }: { e: EtapeDetail; i: number }) {
  const tone = e.statut === "validee" ? "var(--good)" : e.statut === "encours" ? "var(--steel)" : "var(--faint)";
  const Icon = e.statut === "validee" ? CheckCircle2 : e.statut === "encours" ? Clock3 : Lock;
  return (
    <div className="rounded-[10px] border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <Icon className="h-3.5 w-3.5 shrink-0" style={{ color: tone }} />
        <span className="text-[0.82rem] font-semibold">{e.titre}</span>
        <span className="ml-auto text-[0.66rem] uppercase tracking-[0.05em]" style={{ color: tone }}>
          {e.statut === "validee" ? "Validée" : e.statut === "encours" ? "En cours" : "À venir"}
        </span>
      </div>
      {e.valideePar ? <div className="mt-0.5 pl-5 text-[0.68rem] text-faint">Validée par {e.valideePar}</div> : null}
      {e.champs.length ? (
        <div className="mt-2 flex flex-col gap-1.5 pl-5">
          {e.champs.map((c, k) => (
            <div key={k} className="text-[0.8rem]">
              <span className="text-faint">{c.label} : </span>
              <span className="text-ink">{c.valeur}</span>
            </div>
          ))}
        </div>
      ) : null}
      {e.photos.length ? (
        <div className="mt-2 flex flex-wrap gap-2 pl-5">
          {e.photos.map((ph, k) => (
            <a key={k} href={ph.url} target="_blank" rel="noreferrer" className="block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={ph.url} alt={ph.name} className="h-16 w-16 rounded-[8px] border border-border object-cover transition hover:brightness-110" />
            </a>
          ))}
        </div>
      ) : null}
    </div>
  );
}

// Badge de statut de la feuille de contrat d'opération (envoyé / signé / refusé).
function ContratStatutBadge({ statut, commanditaire }: { statut: string; commanditaire?: string | null }) {
  const cfg = statut === "signe" ? { t: "Contrat signé", c: "var(--good)" } : statut === "refuse" ? { t: "Contrat refusé", c: "var(--oxblood)" } : { t: "Contrat envoyé", c: "var(--steel)" };
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-bold" style={{ color: cfg.c, background: `color-mix(in srgb,${cfg.c} 15%,transparent)` }}>{cfg.t}{commanditaire ? ` · ${commanditaire}` : ""}</span>;
}

function OpDetailBloc({ op }: { op: OpDetail }) {
  const cree = dateFR(op.createdAt);
  const poleLabel = op.pole === "illegal" ? "🔪 La Confrérie" : op.pole === "legal" ? "⚖️ Iron Wolf" : null;
  const rien = !op.objectif && !op.lieu && op.membresNoms.length === 0 && op.etapes.length === 0 && !cree && !op.createurNom && !op.contratLie && !op.contrat;
  return (
    <div className="mb-4 flex flex-col gap-3 rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
      <div className="flex flex-wrap items-center gap-2">
        <Badge>{op.type}</Badge>
        <Badge tone={op.phase === "en_cours" ? "accent" : op.phase === "terminee" ? "good" : op.phase === "annulee" ? "muted" : "warn"}>{op.etape}</Badge>
        {op.contrat?.statut ? <ContratStatutBadge statut={op.contrat.statut} commanditaire={op.contrat.commanditaire} /> : null}
        {poleLabel ? <span className="text-[0.74rem] text-faint">{poleLabel}</span> : null}
        {op.prime ? <span className="ml-auto font-num text-[0.86rem] font-semibold" style={{ color: "var(--accent)" }}>{op.prime}</span> : null}
      </div>
      {op.objectif ? <div className="text-[0.86rem] leading-relaxed text-ink"><span className="text-faint">Objectif : </span>{op.objectif}</div> : null}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5">
        {op.lieu ? <MetaLigne icon={<MapPin className="h-3.5 w-3.5 text-faint" />}>{op.lieu}</MetaLigne> : null}
        {op.contratLie ? <MetaLigne icon={<Link2 className="h-3.5 w-3.5 text-faint" />}>Contrat : {op.contratLie}</MetaLigne> : null}
        {cree ? <MetaLigne icon={<CalendarClock className="h-3.5 w-3.5 text-faint" />}>{cree}{op.createurNom ? ` · ${op.createurNom}` : ""}</MetaLigne> : null}
      </div>
      {op.membresNoms.length ? (
        <div className="flex flex-col gap-1.5">
          <div className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><Users className="h-3.5 w-3.5" /> Agents assignés ({op.membresNoms.length})</div>
          <div className="flex flex-wrap gap-1.5">
            {op.membresNoms.map((n, i) => <span key={i} className="rounded-full border border-border bg-surface px-2 py-0.5 text-[0.76rem]">{n}</span>)}
          </div>
        </div>
      ) : null}
      {op.etapes.length ? (
        <div className="flex flex-col gap-2">
          <div className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Préparation par étapes</div>
          {op.etapes.map((e, i) => <EtapeBloc key={i} e={e} i={i} />)}
        </div>
      ) : null}
      {op.resultat || op.butin || op.debrief ? (
        <div className="flex flex-col gap-1.5 rounded-[10px] border border-border bg-surface px-3 py-2.5">
          <div className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint"><Flag className="h-3.5 w-3.5" /> Bilan</div>
          {op.resultat ? <div className="text-[0.82rem]"><span className="text-faint">Résultat : </span>{op.resultat}</div> : null}
          {op.butin ? <div className="text-[0.82rem]"><span className="text-faint">Butin : </span>{op.butin}</div> : null}
          {op.debrief ? <div className="text-[0.82rem] text-muted"><span className="text-faint">Débrief : </span>{op.debrief}</div> : null}
        </div>
      ) : null}
      {rien && !op.resultat && !op.butin ? <p className="text-[0.8rem] text-faint">Aucun détail supplémentaire synchronisé pour cette opération.</p> : null}
    </div>
  );
}

function EditModal({ op, membres, onClose, router }: { op: OpDetail; membres: MembreLite[]; onClose: () => void; router: Router }) {
  const [cible, setCible] = useState(op.titre);
  const [categorie, setCategorie] = useState(op.type);
  const [prime, setPrime] = useState(op.prime || "");
  const [phase, setPhase] = useState(op.phase);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);
  // Assignation
  const [q, setQ] = useState("");
  const [choisis, setChoisis] = useState<Record<string, boolean>>({});
  // Terminaison
  const [terminer, setTerminer] = useState(false);
  const [resultat, setResultat] = useState("Réussite complète");
  const [butin, setButin] = useState(op.butin || "");
  const [debrief, setDebrief] = useState(op.debrief || "");
  const [montantPrime, setMontantPrime] = useState("");
  // Feuille de contrat d'opération
  const [ctrOuvert, setCtrOuvert] = useState(false);
  const [commanditaire, setCommanditaire] = useState("");
  const [ctrDiscord, setCtrDiscord] = useState("");
  const [ctrRemu, setCtrRemu] = useState(op.prime || "");
  const [ctrConditions, setCtrConditions] = useState("");
  const [ctrSens, setCtrSens] = useState<"client_signe" | "client_propose">("client_signe");
  const dispo = membres.filter((m) => !op.membresIds.includes(m.id));
  const filtres = dispo.filter((m) => m.nom.toLowerCase().includes(q.toLowerCase())).slice(0, 40);
  const nbChoisis = Object.values(choisis).filter(Boolean).length;

  async function assigner() {
    const ids = membres.filter((m) => choisis[m.id]).map((m) => m.id);
    const noms = membres.filter((m) => choisis[m.id]).map((m) => m.nom);
    if (!ids.length) return;
    setBusy("assign");
    const r = await assignerOperation(op.id, ids, noms);
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setChoisis({}); setFlash("Agents assignés & prévenus — mise à jour dans ~30 s."); router.refresh();
  }
  async function confirmerTerminer() {
    setBusy("terminer");
    const r = await terminerOperation(op.id, { resultat, butin, debrief, montantPrime: Number(montantPrime) || 0 });
    setBusy(null);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setPhase("terminee"); setTerminer(false);
    setFlash(`Opération terminée${Number(montantPrime) > 0 ? ` · ${cents(Number(montantPrime))}$ au coffre` : ""}.`); router.refresh();
  }

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
  async function envoyerCtr() {
    if (commanditaire.trim().length < 2) { setFlash("Indique le nom du commanditaire."); return; }
    if (!ctrDiscord.trim()) { setFlash("Indique l'ID Discord du commanditaire pour l'envoi."); return; }
    setBusy("ctr");
    const r = await envoyerContratOperation({
      operationId: op.id, commanditaire, clientDiscordId: ctrDiscord,
      categorie: op.type, objectif: op.objectif || op.titre, lieu: op.lieu || "",
      pole: op.pole, remuneration: ctrRemu, agentsNoms: op.membresNoms.join(", "),
      conditions: ctrConditions, sens: ctrSens,
    });
    setBusy(null);
    // Retour temps réel : verdict réel du bot (MP remis / MP fermés). Le
    // commanditaire signe ensuite en répondant « JE SIGNE » en message privé.
    setFlash(r.ok
      ? (r.enAttente ? "Contrat déposé — envoi au commanditaire en cours…" : (r.message || "Contrat remis au commanditaire en message privé.") + " En attente de sa signature.")
      : (r.error || "Échec."));
  }

  return (
    <>
    <Modal titre={op.titre} onClose={onClose}>
      {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
      <OpDetailBloc op={op} />

      {/* Assigner des agents */}
      {phase !== "terminee" && phase !== "annulee" ? (
        <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
          <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Assigner des agents</span>
          <input className={inputCls} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un membre…" />
          <div className="max-h-36 overflow-y-auto rounded-[10px] border border-border bg-surface-2">
            {filtres.length === 0 ? <p className="px-3 py-2 text-[0.78rem] text-faint">Aucun membre disponible.</p> : filtres.map((m) => (
              <button key={m.id} onClick={() => setChoisis((c) => ({ ...c, [m.id]: !c[m.id] }))} className="flex w-full items-center gap-2 border-b border-border px-3 py-1.5 text-left text-[0.82rem] last:border-b-0 hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                <span className="grid h-4 w-4 place-items-center rounded border" style={{ borderColor: choisis[m.id] ? "var(--accent)" : "var(--border)", background: choisis[m.id] ? "var(--accent)" : "transparent" }}>{choisis[m.id] ? <Check className="h-3 w-3 text-black" /> : null}</span>
                {m.nom}
              </button>
            ))}
          </div>
          <div className="flex justify-end">
            <button onClick={assigner} disabled={busy === "assign" || nbChoisis === 0} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>
              {busy === "assign" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" strokeWidth={2} />} Assigner &amp; prévenir{nbChoisis ? ` (${nbChoisis})` : ""}
            </button>
          </div>
        </div>
      ) : null}

      {/* Terminer l'opération */}
      {phase !== "terminee" && phase !== "annulee" ? (
        <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
          <div className="flex items-center justify-between">
            <span className="text-[0.72rem] uppercase tracking-[0.06em] text-faint">Terminer l&apos;opération</span>
            {!terminer ? <button onClick={() => setTerminer(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2"><Flag className="h-3.5 w-3.5" /> Clôturer &amp; encaisser</button> : null}
          </div>
          {terminer ? (
            <div className="flex flex-col gap-2.5 rounded-[10px] border border-border bg-surface-2 px-3 py-3">
              <div className="flex flex-col gap-1"><span className="text-[0.7rem] text-faint">Résultat</span>
                <Picker options={[{ key: "Réussite complète", label: "Réussite" }, { key: "Réussite partielle", label: "Partielle" }, { key: "Échec", label: "Échec" }, { key: "Abandonnée", label: "Abandon" }]} value={resultat} onChange={setResultat} /></div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Champ label="Butin / gains"><input className={inputCls} value={butin} onChange={(e) => setButin(e.target.value)} placeholder="$3000, 12 caisses…" maxLength={120} /></Champ>
                <Champ label="Prime à verser au coffre ($)"><input className={inputCls} type="number" min={0} value={montantPrime} onChange={(e) => setMontantPrime(e.target.value)} placeholder="0" /></Champ>
              </div>
              <Champ label="Débrief"><textarea className={inputCls + " min-h-[50px] resize-y"} value={debrief} onChange={(e) => setDebrief(e.target.value)} placeholder="Compte-rendu, pertes, suites…" maxLength={800} /></Champ>
              <div className="flex justify-end gap-2">
                <button onClick={() => setTerminer(false)} className="rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.78rem] text-muted hover:text-ink">Annuler</button>
                <button onClick={confirmerTerminer} disabled={busy === "terminer"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>
                  {busy === "terminer" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Landmark className="h-4 w-4" />} Terminer{Number(montantPrime) > 0 ? " & encaisser" : ""}
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* Feuille de contrat d'opération */}
      <div className="mb-3 flex flex-col gap-2 border-t border-border pt-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="flex items-center gap-1.5 text-[0.72rem] uppercase tracking-[0.06em] text-faint"><ScrollText className="h-3.5 w-3.5" /> Feuille de contrat</span>
          {op.contrat?.statut ? <ContratStatutBadge statut={op.contrat.statut} commanditaire={op.contrat.commanditaire} /> : null}
        </div>
        <p className="-mt-1 text-[0.72rem] text-faint">Remplie automatiquement depuis la mission (type, lieu, agents, objectif). Ajoute le client et les conditions, puis imprime-la ou envoie-la à signer.</p>
        <div className="grid gap-2 sm:grid-cols-2">
          <Champ label="Commanditaire (client)"><input className={inputCls} value={commanditaire} onChange={(e) => setCommanditaire(e.target.value)} placeholder="Nom du donneur d'ordre" maxLength={120} /></Champ>
          <Champ label="ID Discord (pour l'envoi)"><input className={inputCls} value={ctrDiscord} onChange={(e) => setCtrDiscord(e.target.value)} placeholder="Optionnel — 18 chiffres" maxLength={40} /></Champ>
        </div>
        <Champ label="Rémunération convenue"><input className={inputCls} value={ctrRemu} onChange={(e) => setCtrRemu(e.target.value)} placeholder="Ex : 2000$, 50% à la signature…" maxLength={120} /></Champ>
        <Champ label="Conditions particulières"><textarea className={inputCls + " min-h-[46px] resize-y"} value={ctrConditions} onChange={(e) => setCtrConditions(e.target.value)} placeholder="Clauses, délais, discrétion…" maxLength={1500} /></Champ>
        <div className="flex flex-col gap-1">
          <span className="text-[0.7rem] text-faint">Sens du contrat</span>
          <Picker options={[{ key: "client_signe", label: "On l'envoie au client" }, { key: "client_propose", label: "Le client propose" }]} value={ctrSens} onChange={(v) => setCtrSens(v as "client_signe" | "client_propose")} />
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <button onClick={() => { if (commanditaire.trim().length < 2) { setFlash("Indique le nom du commanditaire."); return; } setCtrOuvert(true); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.8rem] font-semibold hover:border-border-2"><ScrollText className="h-4 w-4" /> Aperçu / Imprimer</button>
          <button onClick={envoyerCtr} disabled={busy === "ctr"} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy === "ctr" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />} Envoyer au commanditaire</button>
        </div>
      </div>

      <div className="mb-2 border-t border-border pt-3 text-[0.72rem] uppercase tracking-[0.06em] text-faint">Modifier</div>
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
    {ctrOuvert ? <ContratOpDoc op={op} commanditaire={commanditaire} remuneration={ctrRemu} conditions={ctrConditions} sens={ctrSens} onClose={() => setCtrOuvert(false)} /> : null}
    </>
  );
}

// Feuille de contrat d'opération — document imprimable (même mécanisme que ContratDoc de l'armurerie).
function ContratOpDoc({ op, commanditaire, remuneration, conditions, sens, onClose }: { op: OpDetail; commanditaire: string; remuneration: string; conditions: string; sens: "client_signe" | "client_propose"; onClose: () => void }) {
  const num = `CTR-OP-${op.id.slice(-6).toUpperCase()}`;
  const confrerie = op.pole === "illegal";
  const intro = sens === "client_propose"
    ? `Entre ${commanditaire || "le Commanditaire"} (le Commanditaire) et la ${confrerie ? "Confrérie" : "Iron Wolf Company"} (le Prestataire), il est convenu la mission ci-après, que le Prestataire s'engage à mener à bien aux conditions énoncées.`
    : `Entre la ${confrerie ? "Confrérie" : "Iron Wolf Company"} (le Prestataire) et ${commanditaire || "le Commanditaire"} (le Commanditaire), il est convenu la mission ci-après, aux conditions énoncées.`;
  const L = (k: string, v?: string | null) => (v ? (
    <tr><td className="border-b border-border py-1.5 pr-3 align-top text-faint">{k}</td><td className="border-b border-border py-1.5 font-medium">{v}</td></tr>
  ) : null);
  return (
    <Modal titre="📜 Contrat d'opération" onClose={onClose}>
      <style>{`@media print{body *{visibility:hidden!important}#op-ctr-doc,#op-ctr-doc *{visibility:visible!important}#op-ctr-doc{position:fixed;inset:0;margin:0;padding:26px}.no-print{display:none!important}}`}</style>
      <div id="op-ctr-doc" className="flex flex-col gap-3 text-[0.86rem]">
        <div className="flex items-start justify-between gap-3 border-b-2 pb-2" style={{ borderColor: "var(--brass)" }}>
          <div>
            <div className="font-display text-[1.1rem] font-bold" style={{ color: "var(--brass)" }}>🐺 {confrerie ? "La Confrérie" : "Iron Wolf Company"}</div>
            <div className="text-[0.72rem] text-muted">{confrerie ? "Opérations discrètes" : "Sécurité · Escorte · Chasse de prime"} — Contrat d&apos;opération</div>
          </div>
          <div className="text-right">
            <div className="text-[0.66rem] uppercase tracking-[0.08em] text-faint">Contrat</div>
            <div className="mono text-[0.9rem] font-bold">{num}</div>
          </div>
        </div>
        <p className="text-[0.82rem] leading-relaxed text-muted">{intro}</p>
        <table className="w-full border-collapse">
          <tbody>
            {L("Type de mission", op.type)}
            {L("Objectif", op.objectif || op.titre)}
            {L("Lieu", op.lieu || null)}
            {L("Agents engagés", op.membresNoms.length ? op.membresNoms.join(", ") : null)}
            {L("Rémunération convenue", remuneration || op.prime || null)}
          </tbody>
        </table>
        {conditions ? <div><div className="text-[0.66rem] uppercase tracking-[0.06em] text-faint">Conditions</div><p className="whitespace-pre-wrap text-[0.82rem]">{conditions}</p></div> : null}
        <div className="mt-4 grid grid-cols-2 gap-6 text-[0.72rem]">
          <div className="border-t border-border pt-1 text-center text-faint">Pour la Compagnie<div className="mt-5 font-display text-[0.95rem] italic text-ink">{confrerie ? "La Confrérie" : "Iron Wolf Company"}</div></div>
          <div className="border-t border-border pt-1 text-center text-faint">Le Commanditaire<div className="mt-5 font-display text-[0.95rem] italic text-ink">{commanditaire || "—"}</div></div>
        </div>
        <p className="mt-1 text-center text-[0.62rem] italic text-faint">Contrat établi par l&apos;Iron Wolf Company. « La force est dans l&apos;ombre. »</p>
      </div>
      <div className="no-print mt-3 flex justify-end gap-2">
        <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
        <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Download className="h-3.5 w-3.5" /> Imprimer / PDF</button>
      </div>
    </Modal>
  );
}
