"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { X, Bandage, Pill, Stethoscope, Clock, History, UserPlus, Loader2, Trash2, Plus, HeartPulse, CalendarClock, ClipboardCheck, Search, Activity, ScrollText, Printer } from "lucide-react";
import type { DossierItem } from "@/lib/queries";
import { creerDossier, majDossier, ajouterBlessure, ajouterOrdonnance, ajouterSuivi, supprimerDossier } from "@/app/(app)/medical/actions";

const STATUTS: { key: string; label: string; tone: string; vit: number | null }[] = [
  { key: "apte", label: "Apte", tone: "var(--good)", vit: 90 },
  { key: "observation", label: "Observation", tone: "var(--warn)", vit: 55 },
  { key: "inapte", label: "Inapte", tone: "var(--oxblood)", vit: 20 },
  { key: "non_teste", label: "Non testé", tone: "var(--muted)", vit: null },
];
const sInfo = (k: string) => STATUTS.find((s) => s.key === (k || "").toLowerCase()) || STATUTS[3];
const toneOf = (k: string) => sInfo(k).tone;
const labelOf = (k: string) => sInfo(k).label;

// 8 remèdes préréglés (comme sur Discord) — pré-remplissent posologie & durée.
const REMEDES = [
  { nom: "Laudanum", poso: "10 gouttes matin & soir", duree: "3 jours" },
  { nom: "Tonique de santé", poso: "1 flacon par jour", duree: "5 jours" },
  { nom: "Onguent", poso: "Application locale 2×/jour", duree: "7 jours" },
  { nom: "Quinine", poso: "1 dose par jour", duree: "5 jours" },
  { nom: "Arnica", poso: "Sur l'hématome, 2×/jour", duree: "4 jours" },
  { nom: "Sirop apaisant", poso: "1 cuillère au coucher", duree: "3 jours" },
  { nom: "Antiseptique", poso: "Nettoyage de plaie 2×/jour", duree: "jusqu'à cicatrisation" },
  { nom: "Reconstituant", poso: "1 dose au réveil", duree: "7 jours" },
];
const GRAVITES = [
  { key: "bénigne", label: "Bénigne", tone: "var(--warn)", statut: null },
  { key: "modérée", label: "Modérée", tone: "#d95926", statut: "observation" },
  { key: "grave", label: "Grave", tone: "var(--oxblood)", statut: "inapte" },
];

const inputCls =
  "w-full rounded-[9px] border border-border bg-surface-2 px-2.5 py-1.5 text-[0.84rem] text-ink outline-none placeholder:text-faint focus:border-[color-mix(in_srgb,var(--accent)_55%,var(--border))]";

type Router = ReturnType<typeof useRouter>;

function StatutBadge({ statut }: { statut: string }) {
  const c = toneOf(statut);
  return <span className="rounded-md px-1.5 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: c, background: "color-mix(in srgb," + c + " 16%,transparent)" }}>{labelOf(statut)}</span>;
}

function Vitalite({ statut, compact = false }: { statut: string; compact?: boolean }) {
  const s = sInfo(statut);
  const pct = s.vit ?? 0;
  return (
    <div className={compact ? "" : "flex items-center gap-2"}>
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "color-mix(in srgb,var(--ink) 10%,transparent)" }}>
        <div className="h-full rounded-full transition-all" style={{ width: `${s.vit == null ? 0 : pct}%`, background: s.tone }} />
      </div>
      {!compact ? <span className="shrink-0 font-num text-[0.72rem] text-faint">{s.vit == null ? "?" : `${pct}%`}</span> : null}
    </div>
  );
}

function Flash({ children, tone = "good" }: { children: React.ReactNode; tone?: "good" | "bad" }) {
  const c = tone === "bad" ? "var(--oxblood)" : "var(--good)";
  return <div className="rounded-lg border px-3 py-2 text-[0.78rem]" style={{ color: c, borderColor: "color-mix(in srgb," + c + " 40%,var(--border))", background: "color-mix(in srgb," + c + " 8%,transparent)" }}>{children}</div>;
}

export function MedicalGrid({ dossiers, membresLibres }: { dossiers: DossierItem[]; membresLibres: { id: string; nom: string }[] }) {
  const router = useRouter();
  const [sel, setSel] = useState<DossierItem | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [q, setQ] = useState("");
  const [filtre, setFiltre] = useState<string | null>(null);

  const counts = STATUTS.map((s) => ({ ...s, n: dossiers.filter((d) => (d.statut || "").toLowerCase() === s.key).length }));
  const convalescents = dossiers.filter((d) => d.reposJusquAt).length;
  const filtres = dossiers
    .filter((d) => !filtre || (filtre === "__conval" ? !!d.reposJusquAt : (d.statut || "").toLowerCase() === filtre))
    .filter((d) => !q.trim() || d.nom.toLowerCase().includes(q.trim().toLowerCase()));

  return (
    <>
      {/* Vue d'ensemble */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-5">
        {counts.map((c) => (
          <button key={c.key} onClick={() => setFiltre(filtre === c.key ? null : c.key)} className="rounded-[11px] border px-3 py-2 text-left transition"
            style={{ borderColor: filtre === c.key ? c.tone : "var(--border)", background: filtre === c.key ? `color-mix(in srgb,${c.tone} 12%,transparent)` : "var(--surface-2)" }}>
            <div className="font-num text-[1.2rem] font-bold" style={{ color: c.tone }}>{c.n}</div>
            <div className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">{c.label}</div>
          </button>
        ))}
        <button onClick={() => setFiltre(filtre === "__conval" ? null : "__conval")} className="rounded-[11px] border px-3 py-2 text-left transition"
          style={{ borderColor: filtre === "__conval" ? "var(--warn)" : "var(--border)", background: filtre === "__conval" ? "color-mix(in srgb,var(--warn) 12%,transparent)" : "var(--surface-2)" }}>
          <div className="font-num text-[1.2rem] font-bold" style={{ color: "var(--warn)" }}>{convalescents}</div>
          <div className="text-[0.68rem] uppercase tracking-[0.04em] text-faint">Convalescence</div>
        </button>
      </div>

      <div className="mb-3 flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" />
          <input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher un patient…" />
        </div>
        <button onClick={() => setNouveau(true)} className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-2 text-[0.76rem] font-semibold text-ink transition hover:border-border-2">
          <UserPlus className="h-3.5 w-3.5" strokeWidth={1.8} /> Nouveau dossier
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {filtres.map((d) => (
          <button key={d.id} onClick={() => setSel(d)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 truncate text-[0.92rem] font-semibold">{d.nom}</div>
              <StatutBadge statut={d.statut} />
            </div>
            <div className="mt-2.5"><Vitalite statut={d.statut} /></div>
            <div className="mt-2.5 flex flex-wrap items-center gap-x-3.5 gap-y-1 text-[0.74rem] text-muted">
              <span className="inline-flex items-center gap-1.5"><Bandage className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.blessures.length}</span>
              <span className="inline-flex items-center gap-1.5"><Pill className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.ordonnances.length}</span>
              <span className="inline-flex items-center gap-1.5"><Stethoscope className="h-3.5 w-3.5 text-faint" strokeWidth={1.8} /> {d.suivis.length}</span>
              {d.testValide ? <span className="inline-flex items-center gap-1" style={{ color: "var(--good)" }}><ClipboardCheck className="h-3.5 w-3.5" /> testé</span> : null}
            </div>
            {d.prochainRdv ? <div className="mt-2 inline-flex items-center gap-1.5 text-[0.72rem]" style={{ color: "var(--steel)" }}><CalendarClock className="h-3.5 w-3.5" /> RDV : {d.prochainRdv}</div> : null}
            {d.reposJusquAt ? <div className="mt-1 inline-flex items-center gap-1.5 text-[0.72rem]" style={{ color: "var(--warn)" }}><Clock className="h-3.5 w-3.5" /> Convalescence</div> : null}
          </button>
        ))}
        {filtres.length === 0 ? <p className="col-span-full px-1 py-6 text-center text-[0.84rem] text-faint">Aucun patient{filtre ? (filtre === "__conval" ? " en convalescence" : ` « ${labelOf(filtre)} »`) : ""}{q ? ` pour « ${q} »` : ""}.</p> : null}
      </div>

      {sel ? <DetailModal dossier={sel} onClose={() => setSel(null)} router={router} /> : null}
      {nouveau ? <NouveauModal membres={membresLibres} onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}

function StatutPicker({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {STATUTS.map((s) => {
        const on = value === s.key;
        return <button key={s.key} onClick={() => onChange(s.key)} className="rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold transition" style={{ color: on ? "#000" : s.tone, background: on ? s.tone : "transparent", borderColor: "color-mix(in srgb," + s.tone + " 45%,var(--border))" }}>{s.label}</button>;
      })}
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
    setOk(true); router.refresh();
  }

  return (
    <Modal onClose={onClose} titre="🩺 Nouveau dossier médical">
      {ok ? (
        <div className="flex flex-col gap-3"><Flash>Dossier créé — il apparaîtra ici dans ~10 s.</Flash><div className="flex justify-end"><button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button></div></div>
      ) : (
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Membre</span>
            <select className={inputCls} value={membreId} onChange={(e) => setMembreId(e.target.value)} autoFocus>
              <option value="">— Choisir —</option>
              {membres.map((m) => <option key={m.id} value={m.id}>{m.nom}</option>)}
            </select></label>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut initial</span><StatutPicker value={statut} onChange={setStatut} /></div>
          {membres.length === 0 ? <p className="text-[0.78rem] text-faint">Tous les membres ont déjà un dossier.</p> : null}
          {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
          <div className="mt-1 flex justify-end gap-2">
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
            <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <UserPlus className="h-3.5 w-3.5" strokeWidth={2} />} Créer le dossier
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

const TABS = [
  { key: "vue", label: "Vue", icon: HeartPulse },
  { key: "blessures", label: "Blessures", icon: Bandage },
  { key: "ordonnances", label: "Ordonnances", icon: Pill },
  { key: "soins", label: "Soins", icon: Stethoscope },
  { key: "histo", label: "Historique", icon: History },
] as const;

function DetailModal({ dossier, onClose, router }: { dossier: DossierItem; onClose: () => void; router: Router }) {
  const id = dossier.membreId;
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("vue");
  const [statut, setStatut] = useState(dossier.statut);
  const [notes, setNotes] = useState(dossier.notes || "");
  const [prochainRdv, setProchainRdv] = useState(dossier.prochainRdv || "");
  const [testValide, setTestValide] = useState(!!dossier.testValide);
  const [reposMotif, setReposMotif] = useState(dossier.reposMotif || "");
  const [reposJours, setReposJours] = useState("");
  const [certifOpen, setCertifOpen] = useState(false);
  const [blessures, setBlessures] = useState(dossier.blessures);
  const [ordos, setOrdos] = useState(dossier.ordonnances);
  const [suivis, setSuivis] = useState(dossier.suivis);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const [flashBad, setFlashBad] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const [bDesc, setBDesc] = useState(""); const [bLoc, setBLoc] = useState(""); const [bGrav, setBGrav] = useState("");
  const [oMed, setOMed] = useState(""); const [oPoso, setOPoso] = useState(""); const [oDuree, setODuree] = useState("");
  const [sSoin, setSSoin] = useState(""); const [sSoignant, setSSoignant] = useState(""); const [sEtat, setSEtat] = useState("");

  const notify = (m: string, bad = false) => { setFlash(m); setFlashBad(bad); };

  async function patch(p: Record<string, unknown>, key: string, msg: string) {
    setBusy(key);
    const r = await majDossier(id, p);
    setBusy(null);
    notify(r.ok ? msg : (r.error || "Échec."), !r.ok);
    return r.ok;
  }
  async function changerStatut(s: string) { if (s === statut) return; const prev = statut; setStatut(s); if (!(await patch({ statut: s }, "statut", "Statut enregistré."))) setStatut(prev); }
  async function addBlessure() {
    if (bDesc.trim().length < 2) { notify("Décris la blessure.", true); return; }
    setBusy("blessure");
    const g = GRAVITES.find((x) => x.key === bGrav);
    const r = await ajouterBlessure(id, { desc: bDesc, localisation: bLoc, gravite: bGrav, statut: g?.statut || undefined });
    setBusy(null);
    if (!r.ok) { notify(r.error || "Échec.", true); return; }
    setBlessures((p) => [...p, { date: "à l'instant", desc: bDesc, localisation: bLoc, gravite: bGrav }]);
    if (g?.statut) setStatut(g.statut);
    setBDesc(""); setBLoc(""); setBGrav(""); notify("Blessure ajoutée.");
  }
  async function addOrdo() {
    if (oMed.trim().length < 2) { notify("Indique le médicament.", true); return; }
    setBusy("ordo");
    const r = await ajouterOrdonnance(id, { medicaments: oMed, posologie: oPoso, duree: oDuree });
    setBusy(null);
    if (!r.ok) { notify(r.error || "Échec.", true); return; }
    setOrdos((p) => [...p, { medicaments: oMed, posologie: oPoso, duree: oDuree }]);
    setOMed(""); setOPoso(""); setODuree(""); notify("Ordonnance ajoutée.");
  }
  async function addSuivi() {
    if (sSoin.trim().length < 2) { notify("Décris le soin.", true); return; }
    setBusy("suivi");
    const r = await ajouterSuivi(id, { soin: sSoin, soignant: sSoignant, etat: sEtat });
    setBusy(null);
    if (!r.ok) { notify(r.error || "Échec.", true); return; }
    setSuivis((p) => [...p, { date: "à l'instant", soin: sSoin, soignant: sSoignant, etat: sEtat }]);
    setSSoin(""); setSSoignant(""); setSEtat(""); notify("Soin enregistré.");
  }
  async function supprimer() { setBusy("del"); const r = await supprimerDossier(id); setBusy(null); if (!r.ok) { notify(r.error || "Échec.", true); return; } router.refresh(); onClose(); }

  return (
    <Modal onClose={onClose} titre={dossier.nom} max={620}>
      <div className="mb-3 flex items-center gap-3">
        <StatutBadge statut={statut} />
        <div className="flex-1"><Vitalite statut={statut} /></div>
      </div>
      {flash ? <div className="mb-3"><Flash tone={flashBad ? "bad" : "good"}>{flash}</Flash></div> : null}

      {/* Onglets */}
      <div className="mb-3 flex flex-wrap gap-1 border-b border-border pb-2">
        {TABS.map((t) => {
          const on = tab === t.key;
          const n = t.key === "blessures" ? blessures.length : t.key === "ordonnances" ? ordos.length : t.key === "soins" ? suivis.length : t.key === "histo" ? dossier.historique.length : 0;
          return (
            <button key={t.key} onClick={() => setTab(t.key)} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.78rem] font-semibold transition" style={{ color: on ? "#000" : "var(--muted)", background: on ? "var(--accent)" : "transparent" }}>
              <t.icon className="h-3.5 w-3.5" /> {t.label}{n ? <span className="font-num opacity-70">{n}</span> : null}
            </button>
          );
        })}
      </div>

      {tab === "vue" ? (
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut d&apos;aptitude</span><StatutPicker value={statut} onChange={changerStatut} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Prochain RDV</span>
              <div className="flex gap-1.5">
                <input className={inputCls} value={prochainRdv} onChange={(e) => setProchainRdv(e.target.value)} placeholder="Ex : lundi 14h" maxLength={200} />
                <button onClick={() => patch({ prochainRdv }, "rdv", "RDV enregistré.")} disabled={busy === "rdv"} className="shrink-0 rounded-lg border border-border bg-surface-2 px-2 text-[0.74rem] font-semibold hover:border-border-2">OK</button>
              </div>
            </label>
            <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Test d&apos;aptitude</span>
              <button onClick={() => { const v = !testValide; setTestValide(v); patch({ testValide: v }, "test", v ? "Test validé." : "Test retiré."); }} className="inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: testValide ? "#000" : "var(--good)", background: testValide ? "var(--good)" : "transparent", borderColor: "color-mix(in srgb,var(--good) 45%,var(--border))" }}>
                <ClipboardCheck className="h-3.5 w-3.5" /> {testValide ? "Test validé" : "Marquer testé"}
              </button>
            </div>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Convalescence / repos</span>
            <div className="flex gap-1.5">
              <input className={inputCls} value={reposMotif} onChange={(e) => setReposMotif(e.target.value)} placeholder="Motif (ex : fracture)" maxLength={300} />
              <input className={inputCls + " w-24 shrink-0"} type="number" min={0} value={reposJours} onChange={(e) => setReposJours(e.target.value)} placeholder="jours" title="Durée en jours (4 par défaut)" />
              <button onClick={() => patch({ reposMotif, reposJusquAt: reposMotif ? new Date(Date.now() + Math.max(1, Number(reposJours) || 4) * 864e5).toISOString() : null }, "repos", reposMotif ? `Convalescence : ${Math.max(1, Number(reposJours) || 4)} j.` : "Convalescence levée.")} disabled={busy === "repos"} className="shrink-0 rounded-lg border border-border bg-surface-2 px-2 text-[0.74rem] font-semibold hover:border-border-2">OK</button>
            </div>
          </div>
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Notes du médecin</span>
            <textarea className={inputCls + " min-h-[70px] resize-y"} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Observations, consignes…" maxLength={2000} />
            <div className="flex justify-end"><button onClick={() => patch({ notes }, "notes", "Notes enregistrées.")} disabled={busy === "notes"} className="mt-1 inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "notes" ? <Loader2 className="h-3 w-3 animate-spin" /> : null} Enregistrer</button></div>
          </div>
        </div>
      ) : null}

      {tab === "blessures" ? (
        <div className="flex flex-col gap-2">
          {blessures.slice().reverse().map((b, i) => {
            const g = GRAVITES.find((x) => x.key === (b.gravite || "").toLowerCase());
            return (
              <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
                <div className="flex items-start justify-between gap-2">
                  <span className="font-medium">{b.desc || "Blessure"}</span>
                  {b.gravite ? <span className="shrink-0 rounded px-1.5 py-0.5 text-[0.66rem] font-bold uppercase" style={{ color: g?.tone || "var(--oxblood)", background: `color-mix(in srgb,${g?.tone || "var(--oxblood)"} 15%,transparent)` }}>{b.gravite}</span> : null}
                </div>
                <div className="mt-0.5 text-[0.72rem] text-faint">{[b.date, b.localisation].filter(Boolean).join(" · ") || "—"}</div>
              </div>
            );
          })}
          {blessures.length === 0 ? <p className="text-[0.8rem] text-faint">Aucune blessure enregistrée.</p> : null}
          <div className="rounded-[9px] border border-dashed border-border p-2">
            <input className={inputCls} value={bDesc} onChange={(e) => setBDesc(e.target.value)} placeholder="Nouvelle blessure (ex : balle dans l'épaule)" maxLength={300} />
            <input className={inputCls + " mt-1.5"} value={bLoc} onChange={(e) => setBLoc(e.target.value)} placeholder="Localisation" maxLength={120} />
            <div className="mt-1.5 flex items-center gap-1.5">
              <span className="text-[0.72rem] text-faint">Gravité :</span>
              {GRAVITES.map((g) => <button key={g.key} onClick={() => setBGrav(g.key)} className="rounded-lg border px-2 py-1 text-[0.74rem] font-semibold" style={{ color: bGrav === g.key ? "#000" : g.tone, background: bGrav === g.key ? g.tone : "transparent", borderColor: `color-mix(in srgb,${g.tone} 45%,var(--border))` }}>{g.label}</button>)}
            </div>
            <div className="mt-1.5 flex justify-end"><button onClick={addBlessure} disabled={busy === "blessure"} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "blessure" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Ajouter</button></div>
          </div>
        </div>
      ) : null}

      {tab === "ordonnances" ? (
        <div className="flex flex-col gap-2">
          {ordos.slice().reverse().map((o, i) => (
            <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
              <div className="font-medium">{o.medicaments || "Traitement"}</div>
              <div className="mt-0.5 text-[0.72rem] text-muted">{[o.posologie, o.duree].filter(Boolean).join(" · ") || "—"}</div>
            </div>
          ))}
          {ordos.length === 0 ? <p className="text-[0.8rem] text-faint">Aucune ordonnance.</p> : null}
          <div className="rounded-[9px] border border-dashed border-border p-2">
            <div className="mb-1.5 flex flex-wrap gap-1">
              {REMEDES.map((r) => <button key={r.nom} onClick={() => { setOMed(r.nom); setOPoso(r.poso); setODuree(r.duree); }} className="rounded-md border border-border bg-surface px-2 py-1 text-[0.72rem] hover:border-border-2">{r.nom}</button>)}
            </div>
            <input className={inputCls} value={oMed} onChange={(e) => setOMed(e.target.value)} placeholder="Médicament" maxLength={300} />
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <input className={inputCls} value={oPoso} onChange={(e) => setOPoso(e.target.value)} placeholder="Posologie" maxLength={150} />
              <input className={inputCls} value={oDuree} onChange={(e) => setODuree(e.target.value)} placeholder="Durée" maxLength={80} />
            </div>
            <div className="mt-1.5 flex justify-end"><button onClick={addOrdo} disabled={busy === "ordo"} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "ordo" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Prescrire</button></div>
          </div>
        </div>
      ) : null}

      {tab === "soins" ? (
        <div className="flex flex-col gap-2">
          {suivis.slice().reverse().map((s, i) => (
            <div key={i} className="rounded-[9px] border border-border bg-surface-2 px-2.5 py-2 text-[0.82rem]">
              <div className="flex items-start justify-between gap-2"><span className="font-medium">{s.soin || "Soin"}</span>{s.etat ? <span className="shrink-0 text-[0.7rem]" style={{ color: "var(--good)" }}>{s.etat}</span> : null}</div>
              <div className="mt-0.5 text-[0.72rem] text-faint">{[s.date, s.soignant].filter(Boolean).join(" · ") || "—"}</div>
            </div>
          ))}
          {suivis.length === 0 ? <p className="text-[0.8rem] text-faint">Aucun soin enregistré.</p> : null}
          <div className="rounded-[9px] border border-dashed border-border p-2">
            <input className={inputCls} value={sSoin} onChange={(e) => setSSoin(e.target.value)} placeholder="Soin prodigué (ex : suture, extraction de balle)" maxLength={300} />
            <div className="mt-1.5 grid grid-cols-2 gap-1.5">
              <input className={inputCls} value={sSoignant} onChange={(e) => setSSoignant(e.target.value)} placeholder="Soignant" maxLength={120} />
              <input className={inputCls} value={sEtat} onChange={(e) => setSEtat(e.target.value)} placeholder="État après soin" maxLength={120} />
            </div>
            <div className="mt-1.5 flex justify-end"><button onClick={addSuivi} disabled={busy === "suivi"} className="inline-flex items-center gap-1 rounded-lg border border-border bg-surface-2 px-2.5 py-1 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{busy === "suivi" ? <Loader2 className="h-3 w-3 animate-spin" /> : <Plus className="h-3 w-3" />} Enregistrer le soin</button></div>
          </div>
        </div>
      ) : null}

      {tab === "histo" ? (
        <div className="flex flex-col gap-1.5">
          {dossier.historique.slice().reverse().map((h, i) => (
            <div key={i} className="flex items-baseline gap-2 text-[0.8rem]"><Activity className="h-3 w-3 shrink-0 text-faint" /><span className="shrink-0 font-num text-[0.7rem] text-faint">{h.date || ""}</span><span className="text-muted">{h.action || ""}{h.par ? ` — ${h.par}` : ""}</span></div>
          ))}
          {dossier.historique.length === 0 ? <p className="text-[0.8rem] text-faint">Aucun historique.</p> : null}
        </div>
      ) : null}

      <div className="mt-4 flex items-center justify-between border-t border-border pt-3">
        {confirmDel ? (
          <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ce dossier ?</span>
            <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui, supprimer"}</button>
            <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
        ) : (
          <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
        )}
        <div className="flex items-center gap-2">
          <button onClick={() => setCertifOpen(true)} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted hover:border-border-2 hover:text-ink"><ScrollText className="h-3.5 w-3.5" /> Certificat</button>
          <button onClick={onClose} className="rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}>Fermer</button>
        </div>
      </div>

      {certifOpen ? <CertificatOverlay nom={dossier.nom} statut={statut} notes={notes} reposMotif={reposMotif} blessures={blessures} onClose={() => setCertifOpen(false)} /> : null}
    </Modal>
  );
}

function CertificatOverlay({ nom, statut, notes, reposMotif, blessures, onClose }: { nom: string; statut: string; notes: string; reposMotif: string; blessures: DossierItem["blessures"]; onClose: () => void }) {
  const verdict = labelOf(statut);
  const actives = blessures.slice(-6).reverse();
  const dateStr = new Date().toLocaleDateString("fr-FR", { day: "2-digit", month: "long", year: "numeric" });
  return (
    <div className="fixed inset-0 z-[60] grid place-items-center bg-black/70 p-4" onClick={onClose}>
      <style>{`@media print{body *{visibility:hidden!important}#certif-doc,#certif-doc *{visibility:visible!important}#certif-doc{position:fixed;inset:0;margin:0;padding:44px;background:#fff}.no-print{display:none!important}}`}</style>
      <div className="w-full max-w-[620px] overflow-y-auto rounded-card border border-border-2 bg-surface p-5 shadow-card" style={{ maxHeight: "88vh" }} onClick={(e) => e.stopPropagation()}>
        <div className="no-print mb-3 flex items-center justify-between">
          <span className="font-display text-lg">Certificat médical</span>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
            <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3 py-1.5 text-[0.78rem] font-semibold hover:border-border-2">Fermer</button>
          </div>
        </div>
        <div id="certif-doc">
          <div style={{ fontFamily: "Iowan Old Style, Palatino, Georgia, serif", color: "#1a1206", background: "#fff", padding: "28px 32px", border: "1px solid #ddd", borderRadius: 8 }}>
            <div style={{ textAlign: "center", letterSpacing: "3px", fontWeight: 700, fontSize: "0.9rem", borderBottom: "2px solid #1a1206", paddingBottom: 8, marginBottom: 18 }}>DISPENSAIRE · IRON WOLF COMPANY</div>
            <div style={{ textAlign: "center", fontSize: "1.5rem", fontWeight: 700, letterSpacing: "2px", marginBottom: 16 }}>CERTIFICAT MÉDICAL</div>
            <p style={{ marginBottom: 10 }}>Je soussigné(e), médecin de la compagnie, certifie avoir examiné ce jour :</p>
            <p style={{ fontSize: "1.25rem", fontWeight: 700, textAlign: "center", margin: "10px 0" }}>{nom}</p>
            <p style={{ margin: "14px 0 6px" }}>et le déclare, à l&apos;issue de l&apos;examen :</p>
            <p style={{ textAlign: "center", fontSize: "1.1rem", fontWeight: 700, textTransform: "uppercase", padding: "8px", border: "1.5px solid #1a1206", borderRadius: 6, margin: "6px auto", maxWidth: 360 }}>{verdict}</p>
            {actives.length ? <div style={{ marginTop: 16 }}><b>Blessures constatées :</b><ul style={{ margin: "6px 0 0 18px" }}>{actives.map((b, i) => <li key={i}>{b.desc || "—"}{b.localisation ? ` (${b.localisation})` : ""}{b.gravite ? ` — ${b.gravite}` : ""}</li>)}</ul></div> : null}
            {reposMotif ? <p style={{ marginTop: 12 }}><b>Convalescence prescrite :</b> {reposMotif}.</p> : null}
            {notes ? <p style={{ marginTop: 12 }}><b>Observations :</b> {notes}</p> : null}
            <p style={{ marginTop: 28 }}>Fait à Saint-Denis, le {dateStr}.</p>
            <div style={{ marginTop: 30, display: "flex", justifyContent: "flex-end" }}><div style={{ textAlign: "center" }}>Le médecin,<br /><span style={{ fontStyle: "italic", fontSize: "1.1rem" }}>_____________________</span></div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Modal({ titre, children, onClose, max = 540 }: { titre: string; children: React.ReactNode; onClose: () => void; max?: number }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full overflow-y-auto rounded-card border border-border bg-surface p-5 shadow-card" style={{ maxWidth: max, background: "linear-gradient(180deg,var(--surface),color-mix(in srgb,var(--surface) 88%,#000))" }} onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="font-display text-xl">{titre}</div>
          <button onClick={onClose} className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-border text-muted hover:text-ink" aria-label="Fermer"><X className="h-4 w-4" /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
