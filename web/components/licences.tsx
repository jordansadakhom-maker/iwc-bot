"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Search, Plus, X, Loader2, CheckCircle2, XCircle, BadgeCheck, Ban, RotateCcw, RefreshCw, Trash2, Pencil, Clock, FileText, BarChart3 } from "lucide-react";
import {
  STATUTS, statutDef, PERMISSIONS, RESTRICTIONS, permLabel, restrLabel,
  statutEffectif, joursAvantExpiration, type Licence, type LicenceType,
} from "@/lib/licences-const";
import { creerLicence, majLicence, suspendreLicence, reactiverLicence, revoquerLicence, renouvelerLicence, supprimerLicence } from "@/app/(app)/licences/actions";

type Flash = { t: "ok" | "bad"; m: string } | null;
const dateFR = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); } catch { return "—"; } };
const inputCls = "w-full rounded-lg border border-border bg-surface px-3 py-2 text-[0.85rem] outline-none focus:border-accent";

function StatutBadge({ l }: { l: Licence }) {
  const eff = statutEffectif(l);
  const d = statutDef(eff);
  return <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.68rem] font-semibold" style={{ background: `color-mix(in srgb,${d.tone} 16%,transparent)`, color: d.tone }}>{d.label}</span>;
}

function Modal({ titre, onClose, children, max = 640 }: { titre: string; onClose: () => void; children: React.ReactNode; max?: number }) {
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm" onClick={onClose}>
      <div className="my-8 w-full rounded-2xl border border-border bg-surface shadow-2xl" style={{ maxWidth: max }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <h3 className="font-display text-[1.05rem]">{titre}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg border border-border text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="p-5">{children}</div>
      </div>
    </div>
  );
}

// ── Vérification rapide : 🟢 / 🔴 sur la meilleure correspondance ────────────
function raisonNonAutorise(l: Licence): string {
  const eff = statutEffectif(l);
  if (eff === "revoquee") return `Licence révoquée${l.revocationMotif ? ` — ${l.revocationMotif}` : ""}`;
  if (eff === "suspendue") return `Licence suspendue${l.suspensionMotif ? ` — ${l.suspensionMotif}` : ""}`;
  if (eff === "expiree") return "Licence expirée";
  return "Non autorisé";
}

export function LicencesRegistre({ data }: { data: { pret: boolean; licences: Licence[]; types: LicenceType[] } }) {
  const router = useRouter();
  const [licences] = useState<Licence[]>(data.licences);
  const [q, setQ] = useState("");
  const [flash, setFlash] = useState<Flash>(null);
  const [form, setForm] = useState<Licence | "new" | null>(null);
  const [fiche, setFiche] = useState<Licence | null>(null);
  const [pending, start] = useTransition();

  const stats = useMemo(() => {
    const st = { total: licences.length, active: 0, suspendue: 0, revoquee: 0, expiree: 0, renouv: 0 };
    for (const l of licences) { const e = statutEffectif(l); (st as Record<string, number>)[e]++; const j = joursAvantExpiration(l.dateExpiration); if (e === "active" && j != null && j >= 0 && j <= 30) st.renouv++; }
    return st;
  }, [licences]);

  const resultats = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (t.length < 2) return [] as Licence[];
    return licences.filter((l) => l.nom.toLowerCase().includes(t) || (l.prenom || "").toLowerCase().includes(t) || l.numero.toLowerCase().includes(t)).slice(0, 12);
  }, [q, licences]);

  // Lot D — alertes d'expiration (paliers 30/15/7/3/1 j · 24 h · expirée).
  const alertes = useMemo(() => {
    const palier = (j: number) => (j <= 0 ? "24 h" : j <= 1 ? "24 h" : j <= 3 ? "3 jours" : j <= 7 ? "7 jours" : j <= 15 ? "15 jours" : "30 jours");
    const out: { l: Licence; jours: number | null; label: string; tone: string }[] = [];
    for (const l of licences) {
      const eff = statutEffectif(l);
      if (eff === "expiree") { out.push({ l, jours: joursAvantExpiration(l.dateExpiration), label: "Expirée", tone: "var(--oxblood)" }); continue; }
      if (eff !== "active") continue;
      const j = joursAvantExpiration(l.dateExpiration);
      if (j == null || j > 30) continue;
      out.push({ l, jours: j, label: `${palier(j)}`, tone: j <= 7 ? "var(--oxblood)" : "var(--warn)" });
    }
    return out.sort((a, b) => (a.jours ?? -9999) - (b.jours ?? -9999));
  }, [licences]);

  // Lot F — activité mensuelle (licences délivrées sur les 6 derniers mois).
  const parMois = useMemo(() => {
    const now = new Date();
    const mois: { key: string; label: string; n: number }[] = [];
    for (let i = 5; i >= 0; i--) { const d = new Date(now.getFullYear(), now.getMonth() - i, 1); mois.push({ key: `${d.getFullYear()}-${d.getMonth()}`, label: d.toLocaleDateString("fr-FR", { month: "short" }), n: 0 }); }
    const idx = new Map(mois.map((m, i) => [m.key, i]));
    for (const l of licences) { const d = new Date(l.createdAt); const i = idx.get(`${d.getFullYear()}-${d.getMonth()}`); if (i != null) mois[i].n++; }
    const max = Math.max(1, ...mois.map((m) => m.n));
    return { mois, max };
  }, [licences]);

  function apres(r: { ok: boolean; error?: string }, okMsg: string) {
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return false; }
    setFlash({ t: "ok", m: okMsg }); setForm(null); setFiche(null); start(() => router.refresh()); return true;
  }

  return (
    <div className="flex flex-col gap-4">
      {!data.pret ? <div className="rounded-xl border px-4 py-3 text-[0.82rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 10%,transparent)" }}>Lance <b>web/prisma/sql/licences.sql</b> dans le Supabase principal, puis recharge.</div> : null}
      {flash ? <div className="rounded-xl border px-4 py-2.5 text-[0.82rem]" style={{ borderColor: `color-mix(in srgb,${flash.t === "ok" ? "var(--good)" : "var(--oxblood)"} 40%,var(--border))`, background: `color-mix(in srgb,${flash.t === "ok" ? "var(--good)" : "var(--oxblood)"} 10%,transparent)` }}>{flash.m}</div> : null}

      {/* Tableau de bord */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-6">
        {[
          { label: "Total", val: stats.total, tone: "var(--accent)" },
          { label: "Actives", val: stats.active, tone: "var(--good)" },
          { label: "Suspendues", val: stats.suspendue, tone: "var(--warn)" },
          { label: "Expirées", val: stats.expiree, tone: "var(--muted)" },
          { label: "Révoquées", val: stats.revoquee, tone: "var(--oxblood)" },
          { label: "À renouveler", val: stats.renouv, tone: stats.renouv ? "var(--warn)" : "var(--muted)" },
        ].map((k) => (
          <div key={k.label} className="rounded-[14px] border border-border bg-surface p-3 text-center">
            <div className="font-num text-[1.6rem] font-bold" style={{ color: k.tone }}>{k.val}</div>
            <div className="text-[0.7rem] text-faint">{k.label}</div>
          </div>
        ))}
      </div>

      {/* Vérification rapide */}
      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2">
          <Search className="h-4 w-4 text-accent" />
          <h3 className="text-[0.9rem] font-semibold">Vérification rapide</h3>
          <span className="text-[0.72rem] text-faint">nom · prénom · numéro</span>
          <button onClick={() => setForm("new")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouvelle licence</button>
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une personne ou un numéro de licence…" className={inputCls} autoFocus />
        {q.trim().length >= 2 ? (
          <div className="mt-3 flex flex-col gap-2">
            {resultats.length === 0 ? <p className="py-3 text-center text-[0.82rem] italic text-faint">Aucune licence trouvée.</p> : resultats.map((l) => {
              const ok = statutEffectif(l) === "active";
              return (
                <button key={l.id} onClick={() => setFiche(l)} className="flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 text-left transition hover:border-accent">
                  {ok ? <CheckCircle2 className="h-6 w-6 shrink-0" style={{ color: "var(--good)" }} /> : <XCircle className="h-6 w-6 shrink-0" style={{ color: "var(--oxblood)" }} />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2"><span className="truncate font-semibold">{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</span><StatutBadge l={l} /></div>
                    <div className="text-[0.72rem] text-faint">{l.typeNom || l.typeCode} · <span className="font-num">{l.numero}</span>{l.dateExpiration ? ` · exp. ${dateFR(l.dateExpiration)}` : ""}</div>
                    {!ok ? <div className="text-[0.72rem] font-semibold" style={{ color: "var(--oxblood)" }}>{raisonNonAutorise(l)}</div> : null}
                  </div>
                </button>
              );
            })}
          </div>
        ) : null}
      </div>

      {/* Lots D + F — Alertes d'expiration & activité */}
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><Clock className="h-4 w-4 text-accent" /><h3 className="text-[0.9rem] font-semibold">Expirations & renouvellements <span className="font-num text-[0.8rem] text-faint">{alertes.length}</span></h3></div>
          {alertes.length === 0 ? <p className="py-4 text-center text-[0.82rem] italic text-faint">Aucune licence à renouveler prochainement.</p> : (
            <div className="flex max-h-[260px] flex-col gap-1.5 overflow-y-auto">
              {alertes.map((a) => (
                <button key={a.l.id} onClick={() => setFiche(a.l)} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-left text-[0.78rem] transition hover:border-accent">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: a.tone }} />
                  <span className="min-w-0 flex-1 truncate font-semibold">{a.l.nom}{a.l.prenom ? ` ${a.l.prenom}` : ""}</span>
                  <span className="shrink-0 font-num text-faint">{a.l.numero}</span>
                  <span className="shrink-0 rounded-full px-2 py-0.5 text-[0.66rem] font-semibold" style={{ background: `color-mix(in srgb,${a.tone} 16%,transparent)`, color: a.tone }}>{a.label}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="mb-3 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-accent" /><h3 className="text-[0.9rem] font-semibold">Licences délivrées · 6 mois</h3></div>
          <div className="flex h-[220px] items-end justify-between gap-2 px-1">
            {parMois.mois.map((m) => (
              <div key={m.key} className="flex flex-1 flex-col items-center gap-1.5">
                <span className="font-num text-[0.72rem] font-semibold text-faint">{m.n}</span>
                <div className="w-full rounded-t-md" style={{ height: `${Math.round((m.n / parMois.max) * 160) + 4}px`, background: "color-mix(in srgb,var(--accent) 70%,transparent)" }} />
                <span className="text-[0.68rem] capitalize text-faint">{m.label}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Registre complet */}
      <div className="rounded-[14px] border border-border bg-surface p-4">
        <div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-accent" /><h3 className="text-[0.9rem] font-semibold">Registre des licences <span className="font-num text-[0.8rem] text-faint">{licences.length}</span></h3></div>
        {licences.length === 0 ? <p className="py-8 text-center text-[0.84rem] italic text-faint">Aucune licence enregistrée. Clique « Nouvelle licence » pour commencer.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-left text-[0.8rem]">
              <thead><tr className="border-b border-border text-[0.64rem] uppercase tracking-[0.04em] text-faint"><th className="py-1.5 pr-2">Numéro</th><th className="px-2">Titulaire</th><th className="px-2">Type</th><th className="px-2">Statut</th><th className="px-2">Expiration</th></tr></thead>
              <tbody>
                {licences.map((l) => (
                  <tr key={l.id} className="cursor-pointer border-b border-border/50 hover:bg-surface-2" onClick={() => setFiche(l)}>
                    <td className="py-2 pr-2 font-num text-[0.74rem] text-faint">{l.numero}</td>
                    <td className="px-2 font-semibold">{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</td>
                    <td className="px-2 text-faint">{l.typeNom || l.typeCode}</td>
                    <td className="px-2"><StatutBadge l={l} /></td>
                    <td className="px-2 font-num text-faint">{dateFR(l.dateExpiration)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {form ? <LicenceForm initial={form === "new" ? null : form} types={data.types} onClose={() => setForm(null)} onDone={apres} busy={pending} /> : null}
      {fiche ? <LicenceFiche l={fiche} onClose={() => setFiche(null)} onEdit={() => { setForm(fiche); setFiche(null); }} onDone={apres} busy={pending} /> : null}
    </div>
  );
}

// ── Formulaire création / édition ────────────────────────────────────────────
function LicenceForm({ initial, types, onClose, onDone, busy }: { initial: Licence | null; types: LicenceType[]; onClose: () => void; onDone: (r: { ok: boolean; error?: string }, m: string) => boolean; busy: boolean }) {
  const [v, setV] = useState({
    typeCode: initial?.typeCode || types[0]?.code || "",
    nom: initial?.nom || "", prenom: initial?.prenom || "", metier: initial?.metier || "", grade: initial?.grade || "",
    organisation: initial?.organisation || "", identifiant: initial?.identifiant || "", delivrePar: initial?.delivrePar || "",
    dateExpiration: initial?.dateExpiration ? initial.dateExpiration.slice(0, 10) : "", photoUrl: initial?.photoUrl || "", commentaires: initial?.commentaires || "",
  });
  const [perms, setPerms] = useState<Record<string, boolean>>(initial?.permissions || {});
  const [restr, setRestr] = useState<string[]>(initial?.restrictions || []);
  const [local, setLocal] = useState(false);
  const set = (k: string, val: string) => setV((p) => ({ ...p, [k]: val }));

  async function submit() {
    setLocal(true);
    const payload = { ...v, permissions: perms, restrictions: restr };
    const r = initial ? await majLicence(initial.id, payload) : await creerLicence(payload);
    setLocal(false);
    onDone(r, initial ? "Licence mise à jour." : `Licence créée${(r as { numero?: string }).numero ? ` — ${(r as { numero?: string }).numero}` : ""}.`);
  }

  return (
    <Modal titre={initial ? `Modifier — ${initial.numero}` : "Nouvelle licence"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="text-[0.78rem] font-semibold">Type de licence
            <select value={v.typeCode} onChange={(e) => set("typeCode", e.target.value)} className={`mt-1 ${inputCls}`} disabled={!!initial}>{types.map((t) => <option key={t.code} value={t.code}>{t.nom}</option>)}</select>
          </label>
          <label className="text-[0.78rem] font-semibold">Organisation<input value={v.organisation} onChange={(e) => set("organisation", e.target.value)} className={`mt-1 ${inputCls}`} placeholder="Shérif, Armée, IWC…" /></label>
          <label className="text-[0.78rem] font-semibold">Nom *<input value={v.nom} onChange={(e) => set("nom", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
          <label className="text-[0.78rem] font-semibold">Prénom<input value={v.prenom} onChange={(e) => set("prenom", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
          <label className="text-[0.78rem] font-semibold">Métier<input value={v.metier} onChange={(e) => set("metier", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
          <label className="text-[0.78rem] font-semibold">Grade<input value={v.grade} onChange={(e) => set("grade", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
          <label className="text-[0.78rem] font-semibold">Délivrée par<input value={v.delivrePar} onChange={(e) => set("delivrePar", e.target.value)} className={`mt-1 ${inputCls}`} placeholder="autorité" /></label>
          <label className="text-[0.78rem] font-semibold">Date d&apos;expiration<input type="date" value={v.dateExpiration} onChange={(e) => set("dateExpiration", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
          <label className="text-[0.78rem] font-semibold">ID Discord (optionnel)<input value={v.identifiant} onChange={(e) => set("identifiant", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
          <label className="text-[0.78rem] font-semibold">Photo (URL, optionnel)<input value={v.photoUrl} onChange={(e) => set("photoUrl", e.target.value)} className={`mt-1 ${inputCls}`} /></label>
        </div>

        <div>
          <div className="mb-1.5 text-[0.78rem] font-semibold">Autorisations</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PERMISSIONS.map((p) => (
              <label key={p.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem]">
                <input type="checkbox" checked={!!perms[p.key]} onChange={(e) => setPerms((prev) => ({ ...prev, [p.key]: e.target.checked }))} />{p.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-[0.78rem] font-semibold">Restrictions</div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {RESTRICTIONS.map((r) => (
              <label key={r.key} className="flex items-center gap-2 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem]">
                <input type="checkbox" checked={restr.includes(r.key)} onChange={(e) => setRestr((prev) => (e.target.checked ? [...prev, r.key] : prev.filter((k) => k !== r.key)))} />{r.label}
              </label>
            ))}
          </div>
        </div>

        <label className="text-[0.78rem] font-semibold">Commentaires<textarea value={v.commentaires} onChange={(e) => set("commentaires", e.target.value)} rows={2} className={`mt-1 ${inputCls}`} /></label>

        <div className="flex justify-end gap-2 pt-1">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-[0.8rem] font-semibold text-muted hover:text-ink">Annuler</button>
          <button onClick={submit} disabled={local || busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{local ? <Loader2 className="h-4 w-4 animate-spin" /> : <BadgeCheck className="h-4 w-4" />} {initial ? "Enregistrer" : "Délivrer la licence"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ── Fiche + cycle de vie ─────────────────────────────────────────────────────
function LicenceFiche({ l, onClose, onEdit, onDone, busy }: { l: Licence; onClose: () => void; onEdit: () => void; onDone: (r: { ok: boolean; error?: string }, m: string) => boolean; busy: boolean }) {
  const [action, setAction] = useState<"suspendre" | "revoquer" | "renouveler" | null>(null);
  const [motif, setMotif] = useState("");
  const [date, setDate] = useState("");
  const [local, setLocal] = useState(false);
  const eff = statutEffectif(l);
  const d = statutDef(eff);
  const jours = joursAvantExpiration(l.dateExpiration);
  const permsActives = PERMISSIONS.filter((p) => l.permissions[p.key]);

  async function faire(fn: () => Promise<{ ok: boolean; error?: string }>, msg: string) {
    setLocal(true); const r = await fn(); setLocal(false); if (onDone(r, msg)) setAction(null);
  }

  return (
    <Modal titre={`Licence ${l.numero}`} onClose={onClose} max={720}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-start gap-4">
          {l.photoUrl ? <img src={l.photoUrl} alt="" className="h-24 w-24 rounded-xl border border-border object-cover" /> : <div className="grid h-24 w-24 place-items-center rounded-xl border border-border bg-surface-2 text-faint"><ShieldCheck className="h-8 w-8" /></div>}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2"><h2 className="font-display text-[1.2rem]">{l.nom}{l.prenom ? ` ${l.prenom}` : ""}</h2><span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[0.7rem] font-semibold" style={{ background: `color-mix(in srgb,${d.tone} 16%,transparent)`, color: d.tone }}>{d.label}</span></div>
            <p className="text-[0.8rem] text-faint">{l.typeNom || l.typeCode} · <span className="font-num">{l.numero}</span></p>
            <div className="mt-1 grid grid-cols-2 gap-x-4 gap-y-0.5 text-[0.76rem]">
              {l.metier ? <div><span className="text-faint">Métier :</span> {l.metier}</div> : null}
              {l.grade ? <div><span className="text-faint">Grade :</span> {l.grade}</div> : null}
              {l.organisation ? <div><span className="text-faint">Organisation :</span> {l.organisation}</div> : null}
              {l.delivrePar ? <div><span className="text-faint">Délivrée par :</span> {l.delivrePar}</div> : null}
              <div><span className="text-faint">Délivrance :</span> {dateFR(l.dateDelivrance)}</div>
              <div><span className="text-faint">Expiration :</span> {dateFR(l.dateExpiration)}{jours != null && eff === "active" ? <span style={{ color: jours <= 7 ? "var(--oxblood)" : jours <= 30 ? "var(--warn)" : "var(--faint)" }}> · {jours < 0 ? "dépassée" : `${jours} j`}</span> : null}</div>
            </div>
          </div>
        </div>

        {eff === "revoquee" ? <div className="rounded-lg border px-3 py-2 text-[0.78rem]" style={{ borderColor: "color-mix(in srgb,var(--oxblood) 40%,var(--border))", background: "color-mix(in srgb,var(--oxblood) 10%,transparent)" }}><b>Révoquée</b>{l.revocationMotif ? ` — ${l.revocationMotif}` : ""} · {dateFR(l.revocationAt)} · {l.revocationPar || "—"}</div> : null}
        {eff === "suspendue" ? <div className="rounded-lg border px-3 py-2 text-[0.78rem]" style={{ borderColor: "color-mix(in srgb,var(--warn) 40%,var(--border))", background: "color-mix(in srgb,var(--warn) 10%,transparent)" }}><b>Suspendue</b>{l.suspensionMotif ? ` — ${l.suspensionMotif}` : ""}{l.suspensionFin ? ` · jusqu'au ${dateFR(l.suspensionFin)}` : ""}</div> : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <div className="mb-1.5 text-[0.76rem] font-semibold uppercase tracking-wide text-faint">Autorisations</div>
            {permsActives.length === 0 ? <p className="text-[0.78rem] italic text-faint">Aucune.</p> : <ul className="flex flex-col gap-1">{permsActives.map((p) => <li key={p.key} className="flex items-center gap-1.5 text-[0.78rem]"><CheckCircle2 className="h-3.5 w-3.5" style={{ color: "var(--good)" }} /> {p.label}</li>)}</ul>}
          </div>
          <div>
            <div className="mb-1.5 text-[0.76rem] font-semibold uppercase tracking-wide text-faint">Restrictions</div>
            {l.restrictions.length === 0 ? <p className="text-[0.78rem] italic text-faint">Aucune.</p> : <ul className="flex flex-col gap-1">{l.restrictions.map((k) => <li key={k} className="flex items-center gap-1.5 text-[0.78rem]"><Ban className="h-3.5 w-3.5" style={{ color: "var(--oxblood)" }} /> {restrLabel(k)}</li>)}</ul>}
          </div>
        </div>

        {l.commentaires ? <div className="rounded-lg border border-border bg-surface-2 px-3 py-2 text-[0.78rem]"><span className="text-faint">Commentaires :</span> {l.commentaires}</div> : null}

        {/* Cycle de vie */}
        {action ? (
          <div className="rounded-xl border border-border bg-surface-2 p-3">
            {action === "renouveler" ? (
              <div className="flex flex-wrap items-end gap-2">
                <label className="text-[0.76rem] font-semibold">Nouvelle expiration<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className={`mt-1 ${inputCls}`} style={{ width: 180 }} /></label>
                <button disabled={local} onClick={() => faire(() => renouvelerLicence(l.id, date), "Licence renouvelée.")} className="rounded-lg px-3 py-2 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--good)" }}>Confirmer</button>
                <button onClick={() => setAction(null)} className="rounded-lg border border-border px-3 py-2 text-[0.78rem] text-muted">Annuler</button>
              </div>
            ) : (
              <div className="flex flex-wrap items-end gap-2">
                <label className="min-w-[220px] flex-1 text-[0.76rem] font-semibold">Motif<input value={motif} onChange={(e) => setMotif(e.target.value)} className={`mt-1 ${inputCls}`} placeholder="motif obligatoire" /></label>
                <button disabled={local || !motif.trim()} onClick={() => faire(() => (action === "suspendre" ? suspendreLicence(l.id, motif) : revoquerLicence(l.id, motif)), action === "suspendre" ? "Licence suspendue." : "Licence révoquée.")} className="rounded-lg px-3 py-2 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: action === "suspendre" ? "var(--warn)" : "var(--oxblood)" }}>Confirmer</button>
                <button onClick={() => setAction(null)} className="rounded-lg border border-border px-3 py-2 text-[0.78rem] text-muted">Annuler</button>
              </div>
            )}
          </div>
        ) : (
          <div className="flex flex-wrap gap-2 border-t border-border pt-3">
            <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-accent"><Pencil className="h-3.5 w-3.5" /> Modifier</button>
            <button onClick={() => { setDate(l.dateExpiration ? l.dateExpiration.slice(0, 10) : ""); setAction("renouveler"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-good"><RefreshCw className="h-3.5 w-3.5" /> Renouveler</button>
            {eff === "suspendue" ? (
              <button disabled={local || busy} onClick={() => faire(() => reactiverLicence(l.id), "Licence réactivée.")} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-good"><RotateCcw className="h-3.5 w-3.5" /> Réactiver</button>
            ) : (
              <button onClick={() => { setMotif(""); setAction("suspendre"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-warn"><Clock className="h-3.5 w-3.5" /> Suspendre</button>
            )}
            {eff !== "revoquee" ? <button onClick={() => { setMotif(""); setAction("revoquer"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-oxblood"><Ban className="h-3.5 w-3.5" /> Révoquer</button> : null}
          </div>
        )}
      </div>
    </Modal>
  );
}
