"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Car, Plus, X, Loader2, Check, UserPlus, UserMinus, Square, Radio, MapPin, Users } from "lucide-react";
import { creerPatrouille, ajouterMembre, retirerMembre, setStatutPatrouille, cloturerPatrouille } from "@/app/(app)/patrouilles/actions";

type Membre = { agentId: string; nom: string; indicatif: string | null; matricule: string | null };
type Patrouille = { id: string; ref: string; indicatif: string | null; type: string | null; secteur: string | null; vehicule: string | null; canalNom: string | null; statut: string; chefNom: string | null; debut: string | null; membres: Membre[] };
type AgentDispo = { agentId: string; nom: string; indicatif: string | null; matricule: string | null };
type Canal = { id: string; nom: string; code: string | null; type: string };
type Flash = { t: "ok" | "bad"; m: string } | null;

const STATUTS: { key: string; label: string; tone: string }[] = [
  { key: "dispo", label: "Disponible", tone: "good" },
  { key: "occupe", label: "Occupé", tone: "warn" },
  { key: "intervention", label: "En intervention", tone: "crit" },
  { key: "indispo", label: "Indispo", tone: "steel" },
];
const STATUT_LABEL: Record<string, string> = { preparation: "En préparation", dispo: "Disponible", occupe: "Occupé", intervention: "En intervention", indispo: "Indispo", terminee: "Clôturée" };
const STATUT_TONE: Record<string, string> = { preparation: "faint", dispo: "good", occupe: "warn", intervention: "crit", indispo: "steel", terminee: "faint" };
const TYPES: { key: string; label: string }[] = [
  { key: "patrouille", label: "Patrouille" }, { key: "traffic", label: "Trafic" }, { key: "tactique", label: "Tactique" },
  { key: "canine", label: "Cynophile" }, { key: "moto", label: "Moto" }, { key: "supervision", label: "Supervision" },
];
const inputCls = "w-full rounded-lg border border-border bg-bg px-3 py-2 text-[0.85rem] outline-none focus:border-navy";

function heure(iso: string | null) {
  if (!iso) return "—";
  try { return new Intl.DateTimeFormat("fr-FR", { hour: "2-digit", minute: "2-digit" }).format(new Date(iso)); } catch { return "—"; }
}

export function PatrouillesBoard({ patrouilles, agentsDispo, canaux, indicatifPropose, canGerer }: { patrouilles: Patrouille[]; agentsDispo: AgentDispo[]; canaux: Canal[]; indicatifPropose: string | null; canGerer: boolean }) {
  const router = useRouter();
  const [flash, setFlash] = useState<Flash>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [creer, setCreer] = useState(false);

  async function run(key: string, fn: () => Promise<{ ok: boolean; error?: string }>, okMsg?: string) {
    setBusy(key); setFlash(null);
    const r = await fn();
    setBusy(null);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    if (okMsg) setFlash({ t: "ok", m: okMsg });
    router.refresh();
  }

  const enService = patrouilles.filter((p) => p.statut !== "terminee").length;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-3">
        <div>
          <h1 className="font-display text-[1.6rem] font-semibold uppercase tracking-[0.02em] text-ink">Patrouilles</h1>
          <p className="mt-0.5 text-[0.82rem] text-muted"><b className="text-ink">{enService}</b> patrouille{enService > 1 ? "s" : ""} en service · <span style={{ color: "var(--good)" }}><b>{agentsDispo.length}</b> agent{agentsDispo.length > 1 ? "s" : ""} dispo</span></p>
        </div>
        {canGerer ? (
          <button onClick={() => setCreer(true)} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--navy)" }}>
            <Plus className="h-4 w-4" /> Créer une patrouille
          </button>
        ) : null}
      </div>

      {flash ? <div className="rounded-lg border px-3 py-2 text-[0.82rem]" style={{ borderColor: `color-mix(in srgb,var(--${flash.t === "ok" ? "good" : "crit"}) 45%,var(--border))`, color: "var(--ink)", background: `color-mix(in srgb,var(--${flash.t === "ok" ? "good" : "crit"}) 8%,transparent)` }}>{flash.m}</div> : null}

      {patrouilles.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-card border border-dashed border-border px-4 py-12 text-center">
          <Car className="h-7 w-7 text-faint" strokeWidth={1.5} />
          <div className="font-display text-[1.05rem] uppercase tracking-[0.02em] text-ink">Aucune patrouille en service</div>
          <p className="max-w-md text-[0.84rem] text-muted">{canGerer ? "Constitue une patrouille en sélectionnant des agents actuellement en service." : "Les patrouilles constituées par le commandement apparaîtront ici."}</p>
        </div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {patrouilles.map((p) => {
            const tone = STATUT_TONE[p.statut] || "muted";
            return (
              <div key={p.id} className="flex flex-col gap-3 rounded-card border border-border bg-surface p-4 shadow-card">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 font-display text-[0.95rem] font-bold tracking-[0.04em]" style={{ background: "color-mix(in srgb,var(--navy) 22%,transparent)", color: "var(--navy-hi)" }}>
                    <Car className="h-4 w-4" /> {p.indicatif || p.ref}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.62rem] font-semibold uppercase tracking-[0.04em]" style={{ color: `var(--${tone})`, background: `color-mix(in srgb,var(--${tone}) 15%,transparent)` }}>{STATUT_LABEL[p.statut] || p.statut}</span>
                  {p.type ? <span className="text-[0.72rem] text-faint">{TYPES.find((t) => t.key === p.type)?.label || p.type}</span> : null}
                  {canGerer ? (
                    <button onClick={() => run(`clo-${p.id}`, () => cloturerPatrouille(p.id), `Patrouille ${p.indicatif || p.ref} clôturée.`)} disabled={busy === `clo-${p.id}`}
                      className="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1.5 text-[0.74rem] font-semibold text-muted transition hover:text-crit disabled:opacity-60">
                      {busy === `clo-${p.id}` ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Clôturer
                    </button>
                  ) : null}
                </div>

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[0.76rem] text-muted">
                  {p.secteur ? <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-faint" /> {p.secteur}</span> : null}
                  {p.canalNom ? <span className="inline-flex items-center gap-1"><Radio className="h-3.5 w-3.5 text-faint" /> {p.canalNom}</span> : null}
                  {p.vehicule ? <span className="inline-flex items-center gap-1"><Car className="h-3.5 w-3.5 text-faint" /> {p.vehicule}</span> : null}
                  <span className="inline-flex items-center gap-1 font-num text-faint">depuis {heure(p.debut)}</span>
                </div>

                <div className="rounded-lg border border-border bg-surface-2 p-2.5">
                  <div className="mb-1.5 flex items-center gap-1.5 text-[0.64rem] uppercase tracking-[0.05em] text-faint"><Users className="h-3.5 w-3.5" /> Équipage ({p.membres.length})</div>
                  {p.membres.length === 0 ? (
                    <p className="text-[0.76rem] italic text-faint">Aucun agent — ajoute un équipier.</p>
                  ) : (
                    <ul className="flex flex-col gap-1">
                      {p.membres.map((m, i) => (
                        <li key={m.agentId} className="flex items-center gap-2 text-[0.8rem]">
                          <span className="font-semibold text-ink">{m.nom}</span>
                          {m.indicatif ? <span className="font-num text-[0.68rem] text-navy-hi">{m.indicatif}</span> : null}
                          {i === 0 ? <span className="rounded-full px-1.5 py-px text-[0.56rem] uppercase tracking-[0.04em]" style={{ color: "var(--gold)", background: "color-mix(in srgb,var(--gold) 15%,transparent)" }}>chef de bord</span> : null}
                          {canGerer ? (
                            <button onClick={() => run(`rm-${p.id}-${m.agentId}`, () => retirerMembre(p.id, m.agentId))} disabled={busy === `rm-${p.id}-${m.agentId}`} aria-label="Retirer" title="Retirer de l'équipage" className="ml-auto grid h-6 w-6 place-items-center rounded-md border border-border text-faint hover:text-crit disabled:opacity-60">
                              {busy === `rm-${p.id}-${m.agentId}` ? <Loader2 className="h-3 w-3 animate-spin" /> : <UserMinus className="h-3 w-3" />}
                            </button>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  )}
                  {canGerer && agentsDispo.length > 0 ? (
                    <div className="mt-2 flex items-center gap-1.5">
                      <UserPlus className="h-3.5 w-3.5 text-faint" />
                      <select defaultValue="" onChange={(e) => { const v = e.target.value; e.target.value = ""; if (v) run(`add-${p.id}`, () => ajouterMembre(p.id, v)); }} disabled={busy === `add-${p.id}`}
                        className="flex-1 rounded-lg border border-border bg-bg px-2 py-1.5 text-[0.78rem] outline-none focus:border-navy disabled:opacity-60">
                        <option value="">+ Ajouter un agent en service…</option>
                        {agentsDispo.map((ag) => <option key={ag.agentId} value={ag.agentId}>{ag.nom}{ag.indicatif ? ` · ${ag.indicatif}` : ""}</option>)}
                      </select>
                    </div>
                  ) : null}
                </div>

                {canGerer ? (
                  <div className="flex flex-wrap gap-1.5">
                    {STATUTS.map((st) => {
                      const actif = p.statut === st.key;
                      return (
                        <button key={st.key} onClick={() => run(`st-${p.id}-${st.key}`, () => setStatutPatrouille(p.id, st.key))} disabled={busy === `st-${p.id}-${st.key}`}
                          className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold transition disabled:opacity-60"
                          style={actif ? { background: `color-mix(in srgb,var(--${st.tone}) 22%,transparent)`, color: `var(--${st.tone})`, boxShadow: `inset 0 0 0 1px color-mix(in srgb,var(--${st.tone}) 45%,transparent)` } : { color: "var(--muted)", border: "1px solid var(--border)" }}>
                          <span className="h-2 w-2 rounded-full" style={{ background: `var(--${st.tone})` }} /> {st.label}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {creer ? <CreerForm agentsDispo={agentsDispo} canaux={canaux} indicatifPropose={indicatifPropose}
        onClose={() => setCreer(false)}
        onDone={(msg) => { setCreer(false); setFlash({ t: "ok", m: msg }); router.refresh(); }}
        onError={(m) => setFlash({ t: "bad", m })} /> : null}
    </div>
  );
}

function CreerForm({ agentsDispo, canaux, indicatifPropose, onClose, onDone, onError }: { agentsDispo: AgentDispo[]; canaux: Canal[]; indicatifPropose: string | null; onClose: () => void; onDone: (m: string) => void; onError: (m: string) => void }) {
  const [indicatif, setIndicatif] = useState(indicatifPropose || "");
  const [type, setType] = useState("patrouille");
  const [secteur, setSecteur] = useState("");
  const [vehicule, setVehicule] = useState("");
  const [canalId, setCanalId] = useState(canaux.find((c) => c.type === "patrol")?.id || "");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);

  function toggle(id: string) { setSel((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; }); }

  async function go() {
    setBusy(true);
    const r = await creerPatrouille({ indicatif: indicatif.trim() || undefined, type, secteur: secteur.trim() || undefined, vehicule: vehicule.trim() || undefined, canalId: canalId || undefined, membres: [...sel] });
    setBusy(false);
    if (!r.ok) { onError(r.error || "Impossible."); return; }
    onDone(`Patrouille « ${indicatif.trim() || "sans indicatif"} » créée.`);
  }

  return (
    <Overlay onClose={onClose}>
      <div className="w-full max-w-lg rounded-card border border-border bg-surface shadow-card">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-[1.1rem] uppercase tracking-[0.02em] text-ink">Créer une patrouille</h3>
          <button onClick={onClose} aria-label="Fermer" className="grid h-8 w-8 place-items-center rounded-lg border border-border text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="flex flex-col gap-3 p-5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Indicatif</span><input className={inputCls} value={indicatif} onChange={(e) => setIndicatif(e.target.value)} placeholder="ex. ADAM-12" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Type</span>
              <select className={inputCls} value={type} onChange={(e) => setType(e.target.value)}>{TYPES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Secteur</span><input className={inputCls} value={secteur} onChange={(e) => setSecteur(e.target.value)} placeholder="ex. Downtown" /></label>
            <label className="flex flex-col gap-1"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Canal radio</span>
              <select className={inputCls} value={canalId} onChange={(e) => setCanalId(e.target.value)}><option value="">— aucun —</option>{canaux.map((c) => <option key={c.id} value={c.id}>{c.nom}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1 sm:col-span-2"><span className="text-[0.66rem] uppercase tracking-[0.05em] text-faint">Véhicule</span><input className={inputCls} value={vehicule} onChange={(e) => setVehicule(e.target.value)} placeholder="ex. Cruiser 118" /></label>
          </div>

          <div>
            <div className="mb-1.5 text-[0.66rem] uppercase tracking-[0.05em] text-faint">Équipage ({sel.size}) — agents en service</div>
            {agentsDispo.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-3 py-3 text-[0.78rem] italic text-faint">Aucun agent en service disponible. Les agents doivent d&apos;abord prendre leur service depuis le tableau de bord.</p>
            ) : (
              <div className="flex max-h-44 flex-col gap-1 overflow-y-auto rounded-lg border border-border p-1.5">
                {agentsDispo.map((ag) => {
                  const on = sel.has(ag.agentId);
                  return (
                    <button key={ag.agentId} type="button" onClick={() => toggle(ag.agentId)}
                      className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-[0.82rem] transition"
                      style={on ? { background: "color-mix(in srgb,var(--navy) 16%,transparent)" } : undefined}>
                      <span className="grid h-4 w-4 shrink-0 place-items-center rounded border" style={{ borderColor: on ? "var(--navy)" : "var(--border)", background: on ? "var(--navy)" : "transparent" }}>{on ? <Check className="h-3 w-3 text-black/85" /> : null}</span>
                      <span className="font-semibold text-ink">{ag.nom}</span>
                      {ag.indicatif ? <span className="font-num text-[0.68rem] text-navy-hi">{ag.indicatif}</span> : null}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface px-3.5 py-2 text-[0.82rem] font-semibold text-muted">Annuler</button>
            <button onClick={go} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--navy)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Créer</button>
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
