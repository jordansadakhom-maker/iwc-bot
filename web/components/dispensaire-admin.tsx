"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ShieldAlert, Plus, Check, Pencil, Trash2, UserCog, Sliders, Save, Loader2, BadgeCheck, Layers, ChevronUp, ChevronDown, X } from "lucide-react";
import { roleDefIn, CONFIG_CHAMPS, type Config, type RoleDef } from "@/lib/dispensaire-roles-const";
import type { Membre, RoleContext } from "@/lib/dispensaire-roles";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { creerMembre, majMembre, supprimerMembre, majConfig, creerGrade, majGrade, supprimerGrade, reordonnerGrades } from "@/app/dispensaire/admin/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;

const PERMS: { cle: keyof RoleDef["perms"]; label: string; aide: string }[] = [
  { cle: "admin", label: "Admin", aide: "Gère les membres, les grades et les paramètres." },
  { cle: "rh", label: "RH", aide: "Ressources humaines (pointage, absences, fiches)." },
  { cle: "factures", label: "Factures", aide: "Facturation & transactions." },
  { cle: "stock", label: "Stock", aide: "Modifier stockage & coffres." },
  { cle: "medical", label: "Médical", aide: "Dossiers médicaux." },
];

const sortG = (arr: RoleDef[]) => [...arr].sort((a, b) => b.rang - a.rang);

export function DispensaireAdmin({ membres: init, config: cfg0, grades: grades0, moi, pret }: { membres: Membre[]; config: Config; grades: RoleDef[]; moi: RoleContext; pret: boolean }) {
  const router = useRouter();
  const [membres, setMembres] = useState<Membre[]>(init);
  const [grades, setGrades] = useState<RoleDef[]>(sortG(grades0));
  const [flash, setFlash] = useState<FlashMsg>(null);
  const [form, setForm] = useState<Membre | "new" | null>(null);
  const [delId, setDelId] = useState<string | null>(null);
  const [autoBusy, setAutoBusy] = useState(false);

  const topGrade = grades[0]?.key || "directeur";
  const topLabel = grades[0]?.label || "Directeur";

  // Première prise en main : le compte connecté se nomme au grade le plus élevé
  // en un clic (utilise son identité de session — ID Discord + nom). Ferme l'amorçage.
  async function meNommerDirecteur() {
    setAutoBusy(true);
    const r = await creerMembre({ nom: moi.nom, identifiant: moi.identifiant || "", role: topGrade });
    setAutoBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    setFlash({ t: "ok", m: `C'est fait — tu es désormais ${topLabel} du dispensaire.` });
    router.refresh();
  }

  async function enregistrer(vals: Record<string, string>, editing: Membre | null) {
    if (editing) {
      setMembres((p) => p.map((m) => (m.id === editing.id ? { ...m, ...vals } as Membre : m))); setForm(null);
      const r = await majMembre(editing.id, vals); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
    } else {
      const tmp: Membre = { id: "tmp-" + Math.random().toString(36).slice(2, 8), identifiant: vals.identifiant || null, nom: vals.nom, role: vals.role || topGrade, actif: true, note: vals.note || null, updatedAt: null, updatedBy: null };
      setMembres((p) => [...p, tmp]); setForm(null);
      const r = await creerMembre(vals);
      if (!r.ok) { setMembres((p) => p.filter((m) => m.id !== tmp.id)); setFlash({ t: "bad", m: r.error || "Impossible." }); }
      else { setMembres((p) => p.map((m) => (m.id === tmp.id ? { ...m, id: r.id || tmp.id } : m))); setFlash({ t: "ok", m: "Membre ajouté." }); router.refresh(); }
    }
  }
  async function changerRole(m: Membre, role: string) { setMembres((p) => p.map((x) => (x.id === m.id ? { ...x, role } : x))); const r = await majMembre(m.id, { role }); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function toggleActif(m: Membre) { const actif = !m.actif; setMembres((p) => p.map((x) => (x.id === m.id ? { ...x, actif } : x))); const r = await majMembre(m.id, { actif }); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }
  async function supprimer(id: string) { setMembres((p) => p.filter((m) => m.id !== id)); setDelId(null); const r = await supprimerMembre(id); if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh(); }

  const moiDef = roleDefIn(grades, moi.role);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center gap-2"><ShieldAlert className="h-5 w-5 text-accent" /><h2 className="font-display text-[1.15rem]">Administration</h2></div>
      {!pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-roles.sql</b> puis <b>dispensaire-grades.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* Mon rôle */}
      <div className="flex items-center gap-3 rounded-[12px] border border-border bg-surface-2 p-3">
        <span className="grid h-9 w-9 place-items-center rounded-full" style={{ background: `color-mix(in srgb,${moiDef.tone} 15%,transparent)` }}><BadgeCheck className="h-5 w-5" style={{ color: moiDef.tone }} /></span>
        <div className="text-[0.82rem]">Connecté en tant que <b>{moi.nom}</b> — grade <b style={{ color: moiDef.tone }}>{moiDef.label}</b>{moi.source === "fallback" ? <span className="text-faint"> (par défaut — non encore affecté)</span> : null}</div>
      </div>

      {/* Première prise en main : personne n'est encore affecté → se nommer au grade le plus élevé */}
      {pret && moi.source === "fallback" && membres.length === 0 ? (
        <div className="rounded-[12px] border p-4" style={{ borderColor: "color-mix(in srgb,var(--accent) 50%,var(--border))", background: "color-mix(in srgb,var(--accent) 7%,transparent)" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2 text-[0.9rem] font-semibold"><BadgeCheck className="h-4 w-4 text-accent" /> Première prise en main</div>
              <p className="mt-1 max-w-xl text-[0.8rem] text-muted">Aucun grade n&apos;est encore attribué. Nomme-toi <b>{topLabel}</b> pour prendre la main sur tout le dispensaire — tu pourras ensuite ajouter le reste de l&apos;équipe et régler chaque grade.</p>
            </div>
            <button onClick={meNommerDirecteur} disabled={autoBusy} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{autoBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} Me nommer {topLabel}</button>
          </div>
        </div>
      ) : null}

      {/* Membres & rôles */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><UserCog className="h-4 w-4 text-accent" /> Membres &amp; grades <span className="font-num text-[0.8rem] text-faint">{membres.length}</span></h3>
          <button onClick={() => setForm("new")} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter un membre</button>
        </div>
        <p className="mb-3 text-[0.74rem] text-faint">Tant qu&apos;aucun membre n&apos;est défini, l&apos;accès reste ouvert (comme aujourd&apos;hui). Dès qu&apos;un compte reçoit un grade ici, ce grade décide de ce qu&apos;il voit. Utilise l&apos;<b>ID Discord</b> si tu le connais, sinon le <b>nom exact</b> du compte.</p>

        {membres.length === 0 ? <p className="py-6 text-center text-[0.84rem] italic text-faint">Aucun membre affecté — ajoute le premier (commence par toi, en {topLabel}).</p> : (
          <div className="flex flex-col gap-2">
            {membres.map((m) => {
              const def = roleDefIn(grades, m.role);
              return (
                <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2" style={{ opacity: m.actif ? 1 : 0.55 }}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5"><span className="text-[0.86rem] font-semibold">{m.nom}</span>{!m.actif ? <span className="rounded-full border border-border px-1.5 text-[0.6rem] uppercase text-faint">inactif</span> : null}</div>
                    <div className="text-[0.7rem] text-faint">{m.identifiant ? `ID ${m.identifiant}` : "identifié par le nom"}{m.note ? ` · ${m.note}` : ""}</div>
                  </div>
                  <select value={grades.some((g) => g.key === m.role) ? m.role : def.key} onChange={(e) => changerRole(m, e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-[0.74rem] font-semibold" style={{ color: def.tone }}>{grades.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
                  <button onClick={() => toggleActif(m)} className="rounded-md border border-border px-2 py-1 text-[0.7rem] font-semibold text-muted hover:text-ink">{m.actif ? "Désactiver" : "Activer"}</button>
                  <button onClick={() => setForm(m)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-ink" aria-label="Modifier"><Pencil className="h-3.5 w-3.5" /></button>
                  <button onClick={() => setDelId(m.id)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Grades & permissions (gérables) */}
      <GradesSection grades={grades} setGrades={setGrades} membres={membres} onFlash={setFlash} onSaved={() => router.refresh()} />

      {/* Paramètres */}
      <ParamForm config={cfg0} onFlash={setFlash} onSaved={() => router.refresh()} />

      {form ? <MembreForm initial={form === "new" ? null : form} grades={grades} defaultRole={topGrade} onClose={() => setForm(null)} onSave={(v) => enregistrer(v, form === "new" ? null : form)} /> : null}
      {delId ? <ConfirmDelete nom={membres.find((m) => m.id === delId)?.nom || ""} onCancel={() => setDelId(null)} onConfirm={() => supprimer(delId)} /> : null}
    </div>
  );
}

// ── Grades : créer / renommer / droits / réordonner / supprimer ──────────────
function GradesSection({ grades, setGrades, membres, onFlash, onSaved }: { grades: RoleDef[]; setGrades: (f: (p: RoleDef[]) => RoleDef[]) => void; membres: Membre[]; onFlash: (f: FlashMsg) => void; onSaved: () => void }) {
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editNom, setEditNom] = useState("");
  const [delGrade, setDelGrade] = useState<RoleDef | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const compteMembres = (key: string) => membres.filter((m) => m.role === key).length;

  async function togglePerm(g: RoleDef, cle: keyof RoleDef["perms"]) {
    if (cle === "voir") return;
    const val = !g.perms[cle];
    setGrades((p) => p.map((x) => (x.key === g.key ? { ...x, perms: { ...x.perms, [cle]: val } } : x)));
    setBusy(g.key + cle);
    const r = await majGrade(g.key, { [cle]: val });
    setBusy(null);
    if (!r.ok) { setGrades((p) => p.map((x) => (x.key === g.key ? { ...x, perms: { ...x.perms, [cle]: !val } } : x))); onFlash({ t: "bad", m: r.error || "Impossible." }); }
    else onSaved();
  }

  async function renommer(g: RoleDef) {
    const nom = editNom.trim();
    setEditId(null);
    if (!nom || nom === g.label) return;
    setGrades((p) => p.map((x) => (x.key === g.key ? { ...x, label: nom } : x)));
    const r = await majGrade(g.key, { nom });
    if (!r.ok) { setGrades((p) => p.map((x) => (x.key === g.key ? { ...x, label: g.label } : x))); onFlash({ t: "bad", m: r.error || "Impossible." }); }
    else onSaved();
  }

  async function deplacer(g: RoleDef, sens: -1 | 1) {
    const ordered = [...grades].sort((a, b) => b.rang - a.rang);
    const i = ordered.findIndex((x) => x.key === g.key);
    const j = i + sens;
    if (j < 0 || j >= ordered.length) return;
    [ordered[i], ordered[j]] = [ordered[j], ordered[i]];
    const n = ordered.length;
    const renum = ordered.map((x, idx) => ({ ...x, rang: n - idx }));
    setGrades(() => renum);
    const r = await reordonnerGrades(ordered.map((x) => x.key));
    if (!r.ok) onFlash({ t: "bad", m: r.error || "Impossible." }); else onSaved();
  }

  async function ajouter(nom: string) {
    setAddOpen(false);
    const r = await creerGrade({ nom });
    if (!r.ok) { onFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    onFlash({ t: "ok", m: "Grade créé — règle ses droits ci-dessous." });
    onSaved();
  }

  async function supprimer(g: RoleDef) {
    setDelGrade(null);
    setGrades((p) => p.filter((x) => x.key !== g.key));
    const r = await supprimerGrade(g.key);
    if (!r.ok) { setGrades((p) => sortG([...p, g])); onFlash({ t: "bad", m: r.error || "Impossible." }); } else { onFlash({ t: "ok", m: "Grade supprimé." }); onSaved(); }
  }

  const ordered = [...grades].sort((a, b) => b.rang - a.rang);

  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[0.9rem] font-semibold"><Layers className="h-4 w-4 text-accent" /> Grades &amp; permissions <span className="font-num text-[0.8rem] text-faint">{grades.length}</span></h3>
        <button onClick={() => setAddOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Ajouter un grade</button>
      </div>
      <p className="mb-3 text-[0.74rem] text-faint">Du plus élevé (en haut) au plus bas. Clique une permission pour l&apos;activer / la couper — c&apos;est enregistré aussitôt. <b>Voir</b> est toujours acquis.</p>

      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px] text-left text-[0.78rem]">
          <thead><tr className="border-b border-border text-[0.62rem] uppercase tracking-[0.04em] text-faint"><th className="py-1.5 pr-2 w-16">Rang</th><th className="px-2">Grade</th>{PERMS.map((p) => <th key={p.cle} className="px-2 text-center" title={p.aide}>{p.label}</th>)}<th className="px-2 text-right">Actions</th></tr></thead>
          <tbody>
            {ordered.map((g, idx) => {
              const membresN = compteMembres(g.key);
              return (
                <tr key={g.key} className="border-b border-border/50">
                  <td className="py-1.5 pr-2">
                    <div className="flex items-center gap-0.5">
                      <button onClick={() => deplacer(g, 1)} disabled={idx === 0} className="grid h-6 w-6 place-items-center rounded border border-border text-faint hover:text-ink disabled:opacity-30" aria-label="Monter"><ChevronUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => deplacer(g, -1)} disabled={idx === ordered.length - 1} className="grid h-6 w-6 place-items-center rounded border border-border text-faint hover:text-ink disabled:opacity-30" aria-label="Descendre"><ChevronDown className="h-3.5 w-3.5" /></button>
                    </div>
                  </td>
                  <td className="px-2">
                    {editId === g.key ? (
                      <span className="flex items-center gap-1">
                        <input value={editNom} onChange={(e) => setEditNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") renommer(g); if (e.key === "Escape") setEditId(null); }} autoFocus className="w-36 rounded-md border border-border bg-surface px-2 py-1 text-[0.78rem]" />
                        <button onClick={() => renommer(g)} className="grid h-6 w-6 place-items-center rounded border border-border text-good" aria-label="Valider"><Check className="h-3.5 w-3.5" /></button>
                        <button onClick={() => setEditId(null)} className="grid h-6 w-6 place-items-center rounded border border-border text-faint" aria-label="Annuler"><X className="h-3.5 w-3.5" /></button>
                      </span>
                    ) : (
                      <button onClick={() => { setEditId(g.key); setEditNom(g.label); }} className="group inline-flex items-center gap-1.5 font-semibold" style={{ color: g.tone }} title="Renommer">
                        {g.label}<Pencil className="h-3 w-3 opacity-0 transition group-hover:opacity-60" />
                        {membresN > 0 ? <span className="rounded-full border border-border px-1.5 text-[0.6rem] font-normal text-faint">{membresN}</span> : null}
                      </button>
                    )}
                  </td>
                  {PERMS.map((p) => {
                    const on = g.perms[p.cle];
                    return (
                      <td key={p.cle} className="px-2 text-center">
                        <button onClick={() => togglePerm(g, p.cle)} disabled={busy === g.key + p.cle} title={p.aide} aria-pressed={on}
                          className="grid h-6 w-6 place-items-center rounded-md border transition disabled:opacity-50"
                          style={on ? { borderColor: "var(--good)", background: "color-mix(in srgb,var(--good) 18%,transparent)", color: "var(--good)" } : { borderColor: "var(--border)", color: "var(--faint)" }}>
                          {busy === g.key + p.cle ? <Loader2 className="h-3 w-3 animate-spin" /> : on ? <Check className="h-3.5 w-3.5" /> : <span className="text-[0.7rem]">—</span>}
                        </button>
                      </td>
                    );
                  })}
                  <td className="px-2 text-right">
                    <button onClick={() => setDelGrade(g)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood ml-auto" aria-label="Supprimer le grade"><Trash2 className="h-3.5 w-3.5" /></button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {addOpen ? <GradeForm onClose={() => setAddOpen(false)} onSave={ajouter} /> : null}
      {delGrade ? (
        <Modal titre="Supprimer le grade ?" onClose={() => setDelGrade(null)} max={420}>
          <div className="flex flex-col gap-3">
            {compteMembres(delGrade.key) > 0 ? (
              <p className="text-[0.85rem] text-muted">Le grade <b className="text-ink">{delGrade.label}</b> est encore porté par <b>{compteMembres(delGrade.key)}</b> membre(s). Réaffecte-les à un autre grade avant de le supprimer.</p>
            ) : (
              <p className="text-[0.85rem] text-muted">Supprimer le grade <b className="text-ink">{delGrade.label}</b> ? Cette action est définitive.</p>
            )}
            <div className="flex justify-end gap-2">
              <button onClick={() => setDelGrade(null)} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
              <button onClick={() => supprimer(delGrade)} disabled={compteMembres(delGrade.key) > 0} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white disabled:opacity-40" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
            </div>
          </div>
        </Modal>
      ) : null}
    </section>
  );
}

function GradeForm({ onClose, onSave }: { onClose: () => void; onSave: (nom: string) => void }) {
  const [nom, setNom] = useState("");
  const [err, setErr] = useState<string | null>(null);
  function go() { if (nom.trim().length < 1) { setErr("Le nom du grade est obligatoire."); return; } onSave(nom.trim()); }
  return (
    <Modal titre="➕ Ajouter un grade" onClose={onClose} max={460}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom du grade *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") go(); }} placeholder="ex. Chef de service" autoFocus /></Champ>
        <p className="text-[0.74rem] text-faint">Le grade est créé sans droit particulier (juste « voir »). Tu régleras ses permissions et son rang juste après, dans la liste.</p>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={go} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Check className="h-3.5 w-3.5" /> Créer</button>
        </div>
      </div>
    </Modal>
  );
}

function ParamForm({ config, onFlash, onSaved }: { config: Config; onFlash: (f: FlashMsg) => void; onSaved: () => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(CONFIG_CHAMPS.map((c) => [c.cle, String(config[c.cle])])));
  const [busy, setBusy] = useState(false);
  async function save() {
    setBusy(true);
    const patch: Record<string, number> = {};
    for (const c of CONFIG_CHAMPS) patch[c.cle] = Number(v[c.cle]) || 0;
    const r = await majConfig(patch);
    setBusy(false);
    if (!r.ok) onFlash({ t: "bad", m: r.error || "Impossible." }); else { onFlash({ t: "ok", m: "Paramètres enregistrés." }); onSaved(); }
  }
  return (
    <section className="rounded-[14px] border border-border bg-surface p-4">
      <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><Sliders className="h-4 w-4 text-accent" /> Paramètres &amp; seuils</h3>
      <div className="grid gap-3 sm:grid-cols-2">
        {CONFIG_CHAMPS.map((c) => (
          <label key={c.cle} className="flex flex-col gap-1">
            <span className="text-[0.74rem] font-semibold">{c.label}</span>
            <input className={inputCls + " max-w-[120px]"} value={v[c.cle]} onChange={(e) => setV((p) => ({ ...p, [c.cle]: e.target.value.replace(/[^0-9]/g, "") }))} inputMode="numeric" />
            <span className="text-[0.68rem] text-faint">{c.aide}</span>
          </label>
        ))}
      </div>
      <div className="mt-3 flex justify-end"><button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />} Enregistrer</button></div>
    </section>
  );
}

function MembreForm({ initial, grades, defaultRole, onClose, onSave }: { initial: Membre | null; grades: RoleDef[]; defaultRole: string; onClose: () => void; onSave: (v: Record<string, string>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => ({ nom: initial?.nom || "", identifiant: initial?.identifiant || "", role: initial?.role || defaultRole, note: initial?.note || "" }));
  const [err, setErr] = useState<string | null>(null);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setV((p) => ({ ...p, [k]: e.target.value }));
  function go() { if (v.nom.trim().length < 1) { setErr("Le nom est obligatoire."); return; } onSave(v); }
  return (
    <Modal titre={initial ? "✏️ Modifier le membre" : "➕ Ajouter un membre"} onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <Champ label="Nom du compte *"><input className={inputCls} value={v.nom} onChange={set("nom")} placeholder="Nom exact du compte connecté" autoFocus /></Champ>
        <Champ label="ID Discord (optionnel, plus fiable)"><input className={inputCls} value={v.identifiant} onChange={set("identifiant")} placeholder="123456789012345678" /></Champ>
        <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Grade</span>
          <select className={inputCls} value={grades.some((g) => g.key === v.role) ? v.role : defaultRole} onChange={set("role")}>{grades.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
        </label>
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
    <Modal titre="Retirer le membre ?" onClose={onCancel} max={400}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.85rem] text-muted">Retirer <b className="text-ink">{nom}</b> ? Il repassera sur l&apos;accès par défaut.</p>
        <div className="flex justify-end gap-2">
          <button onClick={onCancel} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={onConfirm} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-white" style={{ background: "var(--oxblood)" }}><Trash2 className="h-3.5 w-3.5" /> Retirer</button>
        </div>
      </div>
    </Modal>
  );
}
