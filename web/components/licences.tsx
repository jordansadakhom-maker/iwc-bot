"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ShieldCheck, Search, Plus, X, Loader2, CheckCircle2, XCircle, BadgeCheck, Ban, RotateCcw, RefreshCw, Trash2, Pencil, Clock, FileText, BarChart3, Crosshair } from "lucide-react";
import {
  STATUTS, statutDef, PERMISSIONS, RESTRICTIONS, permLabel, restrLabel,
  statutEffectif, joursAvantExpiration, ROLES_LICENCE, roleLicenceDef, type Licence, type LicenceType, type CapsLicence,
} from "@/lib/licences-const";
import { creerLicence, majLicence, suspendreLicence, reactiverLicence, revoquerLicence, renouvelerLicence, supprimerLicence, setBlocageVentesArmurerie, creerRoleMembre, majRoleMembre, supprimerRoleMembre } from "@/app/(app)/licences/actions";

type MembreRole = { id: string; identifiant: string | null; nom: string; role: string; actif: boolean };
const CAPS_TOUT: CapsLicence = { voir: true, creer: true, cycle: true, revoquer: true, supprimer: true, gererTypes: true, gererIntegration: true, gererRoles: true };

type Flash = { t: "ok" | "bad"; m: string } | null;
const dateFR = (iso: string | null) => { if (!iso) return "—"; try { return new Intl.DateTimeFormat("fr-FR", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(iso)); } catch { return "—"; } };
const escapeHtml = (v: string) => v.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
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

export function LicencesRegistre({ data, config, caps = CAPS_TOUT, roleLabel, membres = [] }: { data: { pret: boolean; licences: Licence[]; types: LicenceType[] }; config?: { bloquerVentes: boolean }; caps?: CapsLicence; roleLabel?: string; membres?: MembreRole[] }) {
  const router = useRouter();
  const [licences] = useState<Licence[]>(data.licences);
  const [bloque, setBloque] = useState(!!config?.bloquerVentes);
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

  async function toggleBlocage() {
    const next = !bloque; setBloque(next);
    const r = await setBlocageVentesArmurerie(next);
    if (!r.ok) { setBloque(!next); setFlash({ t: "bad", m: r.error || "Impossible." }); }
    else { setFlash({ t: "ok", m: next ? "Contrôle des ventes Armurerie activé." : "Contrôle des ventes Armurerie désactivé." }); start(() => router.refresh()); }
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
          {caps.creer ? <button onClick={() => setForm("new")} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Nouvelle licence</button> : <span className="ml-auto text-[0.72rem] text-faint">{roleLabel ? roleLicenceDef(roleLabel).label : "Consultation"}</span>}
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

      {/* Lot E — Intégration Armurerie (interrupteur de blocage des ventes) */}
      {caps.gererIntegration ? (
        <div className="rounded-[14px] border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center gap-3">
            <Crosshair className="h-4 w-4 shrink-0 text-accent" />
            <div className="min-w-0 flex-1">
              <h3 className="text-[0.9rem] font-semibold">Intégration Armurerie — contrôle des ventes</h3>
              <p className="text-[0.76rem] text-faint">Activé, chaque vente à l&apos;Armurerie vérifie la licence de l&apos;acquéreur (validité, autorisation d&apos;achat, restrictions) et <b>bloque</b> avec un motif précis si non conforme. Désactivé, les ventes suivent leur cours habituel.</p>
            </div>
            <button onClick={toggleBlocage} className="relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors" style={{ background: bloque ? "var(--good)" : "var(--border-2)" }} aria-pressed={bloque} aria-label="Basculer le contrôle des ventes">
              <span className="inline-block h-5 w-5 rounded-full bg-white transition-transform" style={{ transform: bloque ? "translateX(22px)" : "translateX(3px)" }} />
            </button>
            <span className="shrink-0 text-[0.78rem] font-semibold" style={{ color: bloque ? "var(--good)" : "var(--faint)" }}>{bloque ? "Activé" : "Désactivé"}</span>
          </div>
        </div>
      ) : null}

      {/* Lot G — Rôles & accès */}
      {caps.gererRoles ? <RolesPanel membres={membres} onFlash={setFlash} onRefresh={() => start(() => router.refresh())} /> : null}

      {form ? <LicenceForm initial={form === "new" ? null : form} types={data.types} onClose={() => setForm(null)} onDone={apres} busy={pending} /> : null}
      {fiche ? <LicenceFiche l={fiche} caps={caps} onClose={() => setFiche(null)} onEdit={() => { setForm(fiche); setFiche(null); }} onDone={apres} busy={pending} /> : null}
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
function LicenceFiche({ l, caps, onClose, onEdit, onDone, busy }: { l: Licence; caps: CapsLicence; onClose: () => void; onEdit: () => void; onDone: (r: { ok: boolean; error?: string }, m: string) => boolean; busy: boolean }) {
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

  // Lot H — certificat officiel imprimable / PDF (avec QR code de vérification).
  async function certificat() {
    try {
      const QRCode = (await import("qrcode")).default;
      const qr = await QRCode.toDataURL(`IWC-LICENCE:${l.numero}`, { margin: 1, width: 220 });
      const li = (arr: string[]) => (arr.length ? arr.map((x) => `<li>${x}</li>`).join("") : `<li class="muted">Aucune</li>`);
      const perms = PERMISSIONS.filter((p) => l.permissions[p.key]).map((p) => escapeHtml(p.label));
      const restr = l.restrictions.map((k) => escapeHtml(restrLabel(k)));
      const dd = statutDef(statutEffectif(l));
      const html = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>Certificat ${escapeHtml(l.numero)}</title><style>
*{box-sizing:border-box}body{font-family:Georgia,'Times New Roman',serif;margin:0;color:#2a2118;background:#e9e0cd}
.page{width:210mm;min-height:296mm;margin:0 auto;padding:16mm;background:#f7f1e3}
.frame{border:3px double #7a5a2a;padding:12mm;position:relative;min-height:262mm}
.head{text-align:center;border-bottom:2px solid #7a5a2a;padding-bottom:10px;margin-bottom:16px}
.org{letter-spacing:3px;font-size:11px;text-transform:uppercase;color:#7a5a2a}
h1{font-size:23px;margin:8px 0 4px}.num{font-family:'Courier New',monospace;font-size:15px;letter-spacing:1px;background:#efe3c8;border:1px solid #b89a5a;display:inline-block;padding:4px 12px;border-radius:4px}
.statut{display:inline-block;margin-left:8px;padding:2px 10px;border-radius:12px;font-size:11px;font-weight:bold;border:1px solid ${dd.tone};color:${dd.tone}}
.grid{display:grid;grid-template-columns:1fr 1fr;gap:5px 18px;margin:16px 0;font-size:13px}.grid b{color:#6a5230}
.cols{display:grid;grid-template-columns:1fr 1fr;gap:18px;margin-top:8px}
h3{font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#7a5a2a;border-bottom:1px solid #cbb27a;padding-bottom:3px}
ul{margin:6px 0;padding-left:18px;font-size:12.5px;line-height:1.5}.muted{color:#998;font-style:italic;list-style:none;margin-left:-18px}
.foot{display:flex;align-items:flex-end;justify-content:space-between;margin-top:34px}
.sign{font-size:12px}.line{border-top:1px solid #7a5a2a;width:190px;margin-top:30px;padding-top:4px}
.cachet{width:104px;height:104px;border:2px solid #a4322b;border-radius:50%;color:#a4322b;display:flex;align-items:center;justify-content:center;text-align:center;font-size:9px;letter-spacing:1px;transform:rotate(-11deg);opacity:.82;text-transform:uppercase;line-height:1.4}
.qr{text-align:center;font-size:9px;color:#7a5a2a}.qr img{width:104px;height:104px}
@media print{body{background:#fff}.page{margin:0;padding:0}}
</style></head><body><div class="page"><div class="frame">
<div class="head"><div class="org">Iron Wolf Company — Registre officiel des licences</div><h1>${escapeHtml(l.typeNom || l.typeCode)}</h1><span class="num">${escapeHtml(l.numero)}</span><span class="statut">${dd.label}</span></div>
<div class="grid"><div><b>Nom :</b> ${escapeHtml(l.nom)}</div><div><b>Prénom :</b> ${escapeHtml(l.prenom || "—")}</div><div><b>Métier :</b> ${escapeHtml(l.metier || "—")}</div><div><b>Grade :</b> ${escapeHtml(l.grade || "—")}</div><div><b>Organisation :</b> ${escapeHtml(l.organisation || "—")}</div><div><b>Délivrée par :</b> ${escapeHtml(l.delivrePar || "—")}</div><div><b>Délivrance :</b> ${dateFR(l.dateDelivrance)}</div><div><b>Expiration :</b> ${dateFR(l.dateExpiration)}</div></div>
<div class="cols"><div><h3>Autorisations</h3><ul>${li(perms)}</ul></div><div><h3>Restrictions</h3><ul>${li(restr)}</ul></div></div>
<div class="foot"><div class="sign"><div>Signature de l'autorité</div><div class="line">${escapeHtml(l.delivrePar || "—")}</div></div><div class="cachet">Iron Wolf<br/>Company<br/>Officiel</div><div class="qr"><img src="${qr}" alt="QR"/><div>Vérification<br/>${escapeHtml(l.numero)}</div></div></div>
</div></div><script>window.onload=function(){setTimeout(function(){window.print()},300)}</script></body></html>`;
      const w = window.open("", "_blank", "width=920,height=1180");
      if (!w) return;
      w.document.open(); w.document.write(html); w.document.close();
    } catch { /* génération impossible — ignore */ }
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
            <button onClick={certificat} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-accent"><FileText className="h-3.5 w-3.5" /> Certificat</button>
            {caps.creer ? <button onClick={onEdit} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-accent"><Pencil className="h-3.5 w-3.5" /> Modifier</button> : null}
            {caps.cycle ? <button onClick={() => { setDate(l.dateExpiration ? l.dateExpiration.slice(0, 10) : ""); setAction("renouveler"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-good"><RefreshCw className="h-3.5 w-3.5" /> Renouveler</button> : null}
            {caps.cycle ? (eff === "suspendue" ? (
              <button disabled={local || busy} onClick={() => faire(() => reactiverLicence(l.id), "Licence réactivée.")} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-good"><RotateCcw className="h-3.5 w-3.5" /> Réactiver</button>
            ) : (
              <button onClick={() => { setMotif(""); setAction("suspendre"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-warn"><Clock className="h-3.5 w-3.5" /> Suspendre</button>
            )) : null}
            {caps.revoquer && eff !== "revoquee" ? <button onClick={() => { setMotif(""); setAction("revoquer"); }} className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-2 text-[0.78rem] font-semibold hover:border-oxblood"><Ban className="h-3.5 w-3.5" /> Révoquer</button> : null}
          </div>
        )}
      </div>
    </Modal>
  );
}

// ── Lot G — Panneau « Rôles & accès » ────────────────────────────────────────
function RolesPanel({ membres, onFlash, onRefresh }: { membres: MembreRole[]; onFlash: (f: Flash) => void; onRefresh: () => void }) {
  const [list, setList] = useState<MembreRole[]>(membres);
  const [form, setForm] = useState(false);

  async function changerRole(m: MembreRole, role: string) {
    setList((p) => p.map((x) => (x.id === m.id ? { ...x, role } : x)));
    const r = await majRoleMembre(m.id, { role }); if (!r.ok) onFlash({ t: "bad", m: r.error || "Impossible." }); else onRefresh();
  }
  async function toggleActif(m: MembreRole) {
    const actif = !m.actif; setList((p) => p.map((x) => (x.id === m.id ? { ...x, actif } : x)));
    const r = await majRoleMembre(m.id, { actif }); if (!r.ok) onFlash({ t: "bad", m: r.error || "Impossible." }); else onRefresh();
  }
  async function supprimer(m: MembreRole) {
    setList((p) => p.filter((x) => x.id !== m.id));
    const r = await supprimerRoleMembre(m.id); if (!r.ok) onFlash({ t: "bad", m: r.error || "Impossible." }); else onRefresh();
  }
  async function enregistrer(vals: { nom: string; identifiant: string; role: string }) {
    setForm(false);
    const r = await creerRoleMembre(vals);
    if (!r.ok) { onFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    onFlash({ t: "ok", m: "Rôle attribué." }); onRefresh();
  }

  return (
    <div className="rounded-[14px] border border-border bg-surface p-4">
      <div className="mb-2 flex items-center gap-2">
        <ShieldCheck className="h-4 w-4 text-accent" />
        <h3 className="text-[0.9rem] font-semibold">Rôles &amp; accès <span className="font-num text-[0.8rem] text-faint">{list.length}</span></h3>
        <button onClick={() => setForm(true)} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.74rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Plus className="h-3.5 w-3.5" /> Attribuer un rôle</button>
      </div>
      <p className="mb-3 text-[0.72rem] text-faint">Attribue un rôle précis par personne (via son ID Discord). Sans fiche, l&apos;accès se déduit des droits IWC (Direction = complet).</p>
      {list.length === 0 ? <p className="py-3 text-center text-[0.8rem] italic text-faint">Aucun rôle attribué — accès dérivé des droits IWC.</p> : (
        <div className="flex flex-col gap-2">
          {list.map((m) => {
            const d = roleLicenceDef(m.role);
            return (
              <div key={m.id} className="flex flex-wrap items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-2" style={{ opacity: m.actif ? 1 : 0.55 }}>
                <div className="min-w-0 flex-1"><div className="text-[0.84rem] font-semibold">{m.nom}</div><div className="text-[0.7rem] text-faint">{m.identifiant ? `ID ${m.identifiant}` : "identifié par le nom"}</div></div>
                <select value={m.role} onChange={(e) => changerRole(m, e.target.value)} className="rounded-md border border-border bg-surface px-2 py-1 text-[0.74rem] font-semibold" style={{ color: d.tone }}>{ROLES_LICENCE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select>
                <button onClick={() => toggleActif(m)} className="rounded-md border border-border px-2 py-1 text-[0.7rem] font-semibold text-muted hover:text-ink">{m.actif ? "Désactiver" : "Activer"}</button>
                <button onClick={() => supprimer(m)} className="grid h-7 w-7 place-items-center rounded-md border border-border text-faint hover:text-oxblood" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            );
          })}
        </div>
      )}
      {form ? <RoleForm onClose={() => setForm(false)} onSave={enregistrer} /> : null}
    </div>
  );
}

function RoleForm({ onClose, onSave }: { onClose: () => void; onSave: (v: { nom: string; identifiant: string; role: string }) => void }) {
  const [v, setV] = useState({ nom: "", identifiant: "", role: "consultation" });
  return (
    <Modal titre="Attribuer un rôle" onClose={onClose} max={460}>
      <div className="flex flex-col gap-3">
        <label className="text-[0.78rem] font-semibold">Nom<input value={v.nom} onChange={(e) => setV({ ...v, nom: e.target.value })} className={`mt-1 ${inputCls}`} autoFocus /></label>
        <label className="text-[0.78rem] font-semibold">ID Discord<input value={v.identifiant} onChange={(e) => setV({ ...v, identifiant: e.target.value })} className={`mt-1 ${inputCls}`} placeholder="pour lier au compte" /></label>
        <label className="text-[0.78rem] font-semibold">Rôle<select value={v.role} onChange={(e) => setV({ ...v, role: e.target.value })} className={`mt-1 ${inputCls}`}>{ROLES_LICENCE.map((r) => <option key={r.key} value={r.key}>{r.label}</option>)}</select></label>
        <div className="flex justify-end gap-2"><button onClick={onClose} className="rounded-lg border border-border px-3 py-2 text-[0.8rem] font-semibold text-muted hover:text-ink">Annuler</button><button onClick={() => v.nom.trim() && onSave(v)} className="rounded-lg px-3.5 py-2 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Attribuer</button></div>
      </div>
    </Modal>
  );
}
