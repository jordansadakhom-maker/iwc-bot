"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Users, Plus, Pencil, Trash2, Search, Radio, Loader2, Check, X, UserCheck, UserX } from "lucide-react";
import { creerAgent, majAgent, basculerActif, supprimerAgent } from "@/app/(app)/agents/actions";

type Agent = { id: string; identifiant: string | null; nom: string; matricule: string | null; grade: string | null; gradeNom: string | null; unite: string | null; statut: string; actif: boolean; dateIntegration: string | null; telephone: string | null; note: string | null; enService: boolean; indicatif: string | null };
type GradeOpt = { key: string; nom: string; ordre: number };
type UniteOpt = { id: string; nom: string; code: string | null };
type Flash = { t: "ok" | "bad"; m: string } | null;

const norm = (x: string) => x.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const STATUT_TONE: Record<string, string> = { actif: "good", probation: "warn", suspendu: "crit", reserve: "steel", parti: "faint" };
const STATUT_LABEL: Record<string, string> = { actif: "Actif", probation: "Probation", suspendu: "Suspendu", reserve: "Réserve", parti: "Parti" };
const inputCls = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-[0.85rem] outline-none focus:border-navy";

type Form = { nom: string; matricule: string; grade: string; unite: string; identifiant: string; dateIntegration: string; statut: string; telephone: string; note: string };
const vide = (): Form => ({ nom: "", matricule: "", grade: "", unite: "", identifiant: "", dateIntegration: "", statut: "actif", telephone: "", note: "" });

export function AgentsRoster({ agents: init, grades, unites, canGerer }: { agents: Agent[]; grades: GradeOpt[]; unites: UniteOpt[]; canGerer: boolean }) {
  const router = useRouter();
  const [agents, setAgents] = useState<Agent[]>(init);
  useEffect(() => { setAgents(init); }, [init]);
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [form, setForm] = useState<{ mode: "new" | "edit"; agent?: Agent } | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const query = norm(q.trim());
  const liste = useMemo(() => agents.filter((a) => !query || norm([a.nom, a.matricule, a.indicatif, a.gradeNom].filter(Boolean).join(" ")).includes(query)), [agents, query]);
  const enService = agents.filter((a) => a.enService).length;

  async function toggle(a: Agent) {
    setAgents((p) => p.map((x) => (x.id === a.id ? { ...x, actif: !x.actif } : x)));
    const r = await basculerActif(a.id, !a.actif);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); router.refresh(); } else { setFlash({ t: "ok", m: `${a.nom} ${!a.actif ? "réactivé" : "désactivé"}.` }); router.refresh(); }
  }
  async function supprimer(id: string) {
    const a = agents.find((x) => x.id === id);
    setAgents((p) => p.filter((x) => x.id !== id)); setDelId(null);
    const r = await supprimerAgent(id);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); router.refresh(); } else { setFlash({ t: "ok", m: `${a?.nom || "Agent"} supprimé.` }); router.refresh(); }
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold uppercase tracking-[0.02em] text-ink">Effectif</h1>
          <p className="mt-0.5 text-[0.82rem] text-muted"><b className="text-ink">{agents.length}</b> agent{agents.length > 1 ? "s" : ""} · <span style={{ color: "var(--good)" }}><b>{enService}</b> en service</span></p>
        </div>
        {canGerer ? (
          <button onClick={() => setForm({ mode: "new" })} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--navy)" }}>
            <Plus className="h-4 w-4" /> Ajouter un agent
          </button>
        ) : null}
      </div>

      {flash ? <div className="rounded-lg border px-3 py-2 text-[0.82rem]" style={{ borderColor: `color-mix(in srgb,var(--${flash.t === "ok" ? "good" : "crit"}) 45%,var(--border))`, color: "var(--ink)", background: `color-mix(in srgb,var(--${flash.t === "ok" ? "good" : "crit"}) 8%,transparent)` }}>{flash.m}</div> : null}

      <div className="relative">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un agent, un matricule, un indicatif…" className={inputCls + " pl-8"} />
      </div>

      <div className="overflow-x-auto rounded-card border border-border shadow-card">
        <table className="w-full min-w-[720px] border-collapse text-left text-[0.84rem]">
          <thead>
            <tr className="text-[0.62rem] uppercase tracking-[0.06em] text-faint">
              <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold">Agent</th>
              <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold">Grade</th>
              <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold">Matricule</th>
              <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold">Unité</th>
              <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold">Statut</th>
              <th className="border-b border-border bg-surface-2 px-3 py-2 font-semibold">Service</th>
              {canGerer ? <th className="border-b border-border bg-surface-2 px-3 py-2" /> : null}
            </tr>
          </thead>
          <tbody>
            {liste.length === 0 ? (
              <tr><td colSpan={canGerer ? 7 : 6} className="px-3 py-10 text-center text-[0.85rem] italic text-faint">{agents.length === 0 ? "Aucun agent dans l'effectif. Ajoute le premier agent pour démarrer." : "Aucun agent ne correspond à ta recherche."}</td></tr>
            ) : liste.map((a) => (
              <tr key={a.id} className="bg-surface" style={a.actif ? undefined : { opacity: 0.55 }}>
                <td className="border-b border-border px-3 py-2">
                  <div className="font-semibold text-ink">{a.nom}</div>
                  {a.identifiant ? <div className="font-num text-[0.64rem] text-faint">Discord lié</div> : <div className="text-[0.64rem]" style={{ color: "var(--warn)" }}>non lié à Discord</div>}
                </td>
                <td className="border-b border-border px-3 py-2 text-muted">{a.gradeNom || <span className="italic text-faint">—</span>}</td>
                <td className="border-b border-border px-3 py-2 font-num text-muted">{a.matricule || "—"}</td>
                <td className="border-b border-border px-3 py-2 text-muted">{a.unite || "—"}</td>
                <td className="border-b border-border px-3 py-2">
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.04em]" style={{ color: `var(--${STATUT_TONE[a.statut] || "muted"})`, background: `color-mix(in srgb,var(--${STATUT_TONE[a.statut] || "muted"}) 15%,transparent)` }}>{STATUT_LABEL[a.statut] || a.statut}</span>
                </td>
                <td className="border-b border-border px-3 py-2">
                  {a.enService ? <span className="inline-flex items-center gap-1 font-num text-[0.72rem] font-bold" style={{ color: "var(--navy-hi)" }}><Radio className="h-3 w-3" /> {a.indicatif || "en service"}</span> : <span className="text-[0.72rem] text-faint">hors service</span>}
                </td>
                {canGerer ? (
                  <td className="border-b border-border px-3 py-2">
                    <div className="flex items-center justify-end gap-1">
                      <button onClick={() => setForm({ mode: "edit", agent: a })} aria-label="Modifier" title="Modifier" className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink"><Pencil className="h-3.5 w-3.5" /></button>
                      <button onClick={() => toggle(a)} aria-label={a.actif ? "Désactiver" : "Réactiver"} title={a.actif ? "Désactiver" : "Réactiver"} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink">{a.actif ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}</button>
                      <button onClick={() => setDelId(a.id)} aria-label="Supprimer" title="Supprimer" className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-crit"><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {form ? <AgentForm mode={form.mode} agent={form.agent} grades={grades} unites={unites} busy={busy} setBusy={setBusy}
        onClose={() => setForm(null)}
        onDone={(msg) => { setForm(null); setFlash({ t: "ok", m: msg }); router.refresh(); }}
        onError={(m) => setFlash({ t: "bad", m })} /> : null}

      {delId ? (
        <Overlay onClose={() => setDelId(null)}>
          <div className="w-full max-w-sm rounded-card border border-border bg-surface p-5 shadow-card">
            <h3 className="font-display text-[1.1rem] uppercase tracking-[0.02em] text-ink">Supprimer l&apos;agent ?</h3>
            <p className="mt-2 text-[0.85rem] text-muted">Supprimer <b className="text-ink">{agents.find((x) => x.id === delId)?.nom}</b> de l&apos;effectif ? Les actions déjà tracées au journal sont conservées.</p>
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setDelId(null)} className="rounded-lg border border-border bg-surface px-3 py-1.5 text-[0.82rem] font-semibold text-muted">Annuler</button>
              <button onClick={() => supprimer(delId)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.82rem] font-semibold text-white" style={{ background: "var(--crit)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
            </div>
          </div>
        </Overlay>
      ) : null}
    </div>
  );
}

function AgentForm({ mode, agent, grades, unites, busy, setBusy, onClose, onDone, onError }: { mode: "new" | "edit"; agent?: Agent; grades: GradeOpt[]; unites: UniteOpt[]; busy: boolean; setBusy: (b: boolean) => void; onClose: () => void; onDone: (msg: string) => void; onError: (m: string) => void }) {
  const [v, setV] = useState<Form>(() => agent ? { nom: agent.nom, matricule: agent.matricule || "", grade: agent.grade || "", unite: agent.unite || "", identifiant: agent.identifiant || "", dateIntegration: agent.dateIntegration || "", statut: agent.statut, telephone: agent.telephone || "", note: agent.note || "" } : vide());
  const set = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  async function enregistrer() {
    if (!v.nom.trim()) { onError("Le nom de l'agent est obligatoire."); return; }
    setBusy(true);
    const r = mode === "new" ? await creerAgent(v) : await majAgent(agent!.id, v);
    setBusy(false);
    if (!r.ok) { onError(r.error || "Impossible."); return; }
    onDone(mode === "new" ? `Agent « ${v.nom} » ajouté.` : `Agent « ${v.nom} » mis à jour.`);
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-lg rounded-card border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-[1.1rem] uppercase tracking-[0.02em] text-ink">{mode === "new" ? "Ajouter un agent" : "Modifier l'agent"}</h3>
          <button onClick={onClose} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Nom du personnage *</span><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="John Doe" autoFocus /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Matricule</span><input className={inputCls} value={v.matricule} onChange={set("matricule")} placeholder="ex. 4412" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Grade</span>
              <select className={inputCls} value={v.grade} onChange={set("grade")}><option value="">—</option>{grades.map((g) => <option key={g.key} value={g.key}>{g.nom}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Unité</span>
              <select className={inputCls} value={v.unite} onChange={set("unite")}><option value="">—</option>{unites.map((u) => <option key={u.id} value={u.nom}>{u.nom}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Statut</span>
              <select className={inputCls} value={v.statut} onChange={set("statut")}>{["actif", "probation", "suspendu", "reserve", "parti"].map((s) => <option key={s} value={s}>{STATUT_LABEL[s]}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Identifiant Discord</span><input className={inputCls} value={v.identifiant} onChange={set("identifiant")} placeholder="ID du compte (connexion)" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Date d&apos;intégration</span><input type="date" className={inputCls} value={v.dateIntegration} onChange={set("dateIntegration")} /></label>
          </div>
          <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Note</span><textarea rows={2} className={inputCls} value={v.note} onChange={set("note")} /></label>
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[0.82rem] font-semibold text-muted">Annuler</button>
            <button onClick={enregistrer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--navy)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Enregistrer</button>
          </div>
        </div>
      </div>
    </Overlay>
  );
}

function Overlay({ children, onClose }: { children: React.ReactNode; onClose: () => void }) {
  return (
    <div role="dialog" aria-modal="true" className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>
  );
}
