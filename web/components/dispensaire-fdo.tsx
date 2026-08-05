"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ShieldCheck, Plus, Loader2, Trash2, Building2, FileText, Printer, X, Search,
  ChevronDown, TrendingUp, TrendingDown, Minus, Stethoscope, CalendarDays, Coins,
  Pencil, ListChecks, CheckSquare, Square,
} from "lucide-react";
import { VideRegistre, Cartouche, SceauCire, Fleuron } from "@/components/dispensaire-ui";
import {
  FDO_PRIX, money, norm, BUREAUX_FDO_DEFAUT, FDO_RAPPORT_STATUTS, fdoRapportStatut,
  DISPENSAIRE_NOM, type FDOData, type SoinFDO, type RapportFDO,
} from "@/lib/dispensaire-facturation-const";
import { grouperParSemaine, statsFDO, cleSemaineDate, type SemaineFDO } from "@/lib/dispensaire-fdo-semaines";
import { Flash, inputCls } from "@/components/edit-ui";
import { creerSoin, supprimerSoin, majSoin, majStatutSemaine, archiverRapportSemaine } from "@/app/dispensaire/fdo/actions";

type FlashMsg = { t: "ok" | "bad"; m: string } | null;
const P = { timeZone: "Europe/Paris" } as const;
const dateFR = (iso: string) => { try { return new Intl.DateTimeFormat("fr-FR", { ...P, day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)); } catch { return "—"; } };
const ymd = (iso: string) => (iso || "").slice(0, 10);
const labelCls = "text-[0.68rem] uppercase tracking-[0.05em] text-faint";

export function DispensaireFDO({ data }: { data: FDOData }) {
  const router = useRouter();
  const [soins, setSoins] = useState<SoinFDO[]>(data.soins);
  const [rapports, setRapports] = useState<Record<string, RapportFDO>>(data.rapports);
  useEffect(() => { setSoins(data.soins); setRapports(data.rapports); }, [data]);

  const [flash, setFlash] = useState<FlashMsg>(null);
  const [busy, setBusy] = useState(false);
  const [v, setV] = useState({ patient: "", bureau: "", medecin: "", date: "", soin: "", note: "" });
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setV((p) => ({ ...p, [k]: e.target.value }));

  const [ouvert, setOuvert] = useState<string | null>(null);
  const [filtres, setFiltres] = useState({ nom: "", bureau: "", medecin: "", date: "" });
  const [rapportSem, setRapportSem] = useState<SemaineFDO | null>(null);
  const [editS, setEditS] = useState<SoinFDO | null>(null);
  const [decl, setDecl] = useState<{ soins: SoinFDO[]; label: string } | null>(null);

  // « Maintenant » calculé après montage → pas de mismatch SSR (stats + semaine courante).
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); }, []);

  const semaines = useMemo(() => grouperParSemaine(soins), [soins]);
  const stats = useMemo(() => (now ? statsFDO(soins, now) : null), [soins, now]);
  const curCle = now ? cleSemaineDate(now) : null;
  const bureauxSugg = useMemo(() => [...new Set([...BUREAUX_FDO_DEFAUT, ...soins.map((s) => s.bureau)])], [soins]);
  const medecinsConnus = useMemo(() => [...new Set(soins.map((s) => s.par).filter(Boolean))] as string[], [soins]);

  const cleRef = useRef("");
  const jeton = () => (cleRef.current ||= (globalThis.crypto?.randomUUID?.() ?? String(Date.now()) + Math.random()));

  async function ajouter() {
    if (!v.bureau.trim()) { setFlash({ t: "bad", m: "Indique le bureau bénéficiaire." }); return; }
    if (!v.patient.trim()) { setFlash({ t: "bad", m: "Indique le nom du patient (l'agent soigné)." }); return; }
    setBusy(true);
    const r = await creerSoin({ agent: v.patient, bureau: v.bureau, medecin: v.medecin, date: v.date, soin: v.soin, note: v.note, cle: jeton() });
    setBusy(false);
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return; }
    cleRef.current = "";
    const iso = v.date ? new Date(`${v.date}T12:00:00`).toISOString() : new Date().toISOString();
    const tmp: SoinFDO = { id: r.id || "tmp", bureau: v.bureau.trim(), agent: v.patient.trim() || null, soin: v.soin.trim() || null, montant: FDO_PRIX, statut: "facture", note: v.note.trim() || null, par: v.medecin.trim() || null, createdAt: iso };
    setSoins((p) => [tmp, ...p]);
    setV((p) => ({ patient: "", bureau: p.bureau, medecin: p.medecin, date: "", soin: "", note: "" }));
    setFlash({ t: "ok", m: `Soin enregistré — facturé ${money(FDO_PRIX)}, classé automatiquement par semaine.` });
    router.refresh();
  }
  async function supprimer(id: string) {
    setSoins((p) => p.filter((x) => x.id !== id));
    const r = await supprimerSoin(id);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }
  async function modifier(id: string, patch: { date: string; patient: string; bureau: string; medecin: string; soin: string; note: string }): Promise<boolean> {
    const r = await majSoin(id, { date: patch.date, agent: patch.patient, bureau: patch.bureau, medecin: patch.medecin, soin: patch.soin, note: patch.note });
    if (!r.ok) { setFlash({ t: "bad", m: r.error || "Impossible." }); return false; }
    const iso = patch.date ? new Date(`${patch.date}T12:00:00`).toISOString() : null;
    setSoins((p) => p.map((x) => (x.id === id ? { ...x, agent: patch.patient.trim() || null, bureau: patch.bureau.trim() || x.bureau, par: patch.medecin.trim() || null, soin: patch.soin.trim() || null, note: patch.note.trim() || null, ...(iso ? { createdAt: iso } : {}) } : x)));
    setEditS(null);
    setFlash({ t: "ok", m: "Soin modifié — date d'émission et détails mis à jour." });
    router.refresh();
    return true;
  }
  async function changerStatut(cle: string, statut: string) {
    const base: RapportFDO = rapports[cle] || { cle, statut, envoyeLe: null, genereLe: null, note: null, par: null };
    setRapports((p) => ({ ...p, [cle]: { ...base, statut } }));
    const r = await majStatutSemaine(cle, statut);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Impossible." }); else router.refresh();
  }
  async function genererRapport(sem: SemaineFDO) {
    setRapportSem(sem);
    const isoNow = new Date().toISOString();
    const base: RapportFDO = rapports[sem.cle] || { cle: sem.cle, statut: "envoye", envoyeLe: null, genereLe: null, note: null, par: null };
    setRapports((p) => ({ ...p, [sem.cle]: { ...base, statut: "envoye", genereLe: isoNow, envoyeLe: isoNow } }));
    const r = await archiverRapportSemaine(sem.cle);
    if (!r.ok) setFlash({ t: "bad", m: r.error || "Archivage impossible — le rapport reste imprimable." });
    else router.refresh();
  }

  return (
    <div className="flex flex-col gap-5">
      {!data.pret ? <Flash tone="bad">Lance <b>web/prisma/sql/dispensaire-facturation.sql</b> dans Supabase, puis recharge.</Flash> : null}
      {flash ? <Flash tone={flash.t === "ok" ? "good" : "bad"}>{flash.m}</Flash> : null}

      {/* ── Tableau de bord ── */}
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-5">
        <Cartouche icon={CalendarDays} label="Soins cette semaine" valeur={stats ? stats.soinsSemaine : "—"} ton="var(--accent)" sous="semaine en cours" />
        <Cartouche icon={Coins} label="Total remboursable" valeur={stats ? money(stats.totalSemaine) : "—"} ton="var(--good)" sous="à l'État · cette semaine" />
        <Cartouche icon={Building2} label="Administration n°1" valeur={stats?.adminTop ? <span className="text-[0.92rem]">{stats.adminTop.bureau}</span> : "—"} sous={stats?.adminTop ? `${stats.adminTop.nb} soin(s)` : "—"} />
        <Cartouche icon={Stethoscope} label="Médecin le + actif" valeur={stats?.medecinTop ? <span className="text-[0.92rem]">{stats.medecinTop.nom}</span> : "—"} sous={stats?.medecinTop ? `${stats.medecinTop.nb} soin(s)` : "—"} />
        <Cartouche
          icon={stats && stats.deltaSemaine < 0 ? TrendingDown : stats && stats.deltaSemaine > 0 ? TrendingUp : Minus}
          label="vs semaine précédente"
          valeur={stats ? `${stats.deltaSemaine > 0 ? "+" : ""}${stats.deltaSemaine}` : "—"}
          ton={stats && stats.deltaSemaine < 0 ? "var(--oxblood)" : stats && stats.deltaSemaine > 0 ? "var(--good)" : "var(--muted)"}
          sous="en nombre de soins"
        />
      </div>

      {/* ── Enregistrer un soin ── */}
      <section className="rounded-[14px] border border-border bg-surface p-4">
        <h3 className="mb-3 flex items-center gap-2 text-[0.9rem] font-semibold"><ShieldCheck className="h-4 w-4 text-accent" /> Enregistrer un soin aux forces de l&apos;ordre <span className="ml-auto rounded-md border border-border bg-surface-2 px-2 py-0.5 font-num text-[0.72rem] text-muted">{money(FDO_PRIX)} · fixe · remboursé par l&apos;État</span></h3>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          <label className="flex flex-col gap-1"><span className={labelCls}>Nom du patient (agent) *</span><input className={inputCls} value={v.patient} onChange={set("patient")} placeholder="Nom de l'agent soigné" /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Bureau bénéficiaire *</span><input className={inputCls} value={v.bureau} onChange={set("bureau")} placeholder="Bureau des Marshals…" list="fdo-bureaux" /><datalist id="fdo-bureaux">{bureauxSugg.map((b) => <option key={b} value={b} />)}</datalist></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Médecin</span><input className={inputCls} value={v.medecin} onChange={set("medecin")} placeholder="Toi par défaut" list="fdo-medecins" /><datalist id="fdo-medecins">{medecinsConnus.map((m) => <option key={m} value={m} />)}</datalist></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Date du soin</span><input type="date" className={inputCls} value={v.date} onChange={set("date")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Type de soin</span><input className={inputCls} value={v.soin} onChange={set("soin")} placeholder="Suture, bandage, remède…" /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Observations</span><input className={inputCls} value={v.note} onChange={set("note")} placeholder="Remarque éventuelle" /></label>
        </div>
        <div className="mt-3 flex justify-end">
          <button onClick={ajouter} disabled={busy} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Enregistrer le soin</button>
        </div>
      </section>

      {/* ── Fiche de déclaration cochable (sélection par bureau / date) ── */}
      {soins.length > 0 ? <DeclarationPanel soins={soins} onGenerer={(s, label) => setDecl({ soins: s, label })} /> : null}

      {/* ── Registre hebdomadaire ── */}
      {soins.length === 0 ? (
        <VideRegistre icon={ShieldCheck} titre="Aucun soin porté aux forces de l'ordre" sous="Enregistre un premier soin — il sera classé automatiquement par semaine et prêt pour la demande de remboursement." />
      ) : (
        <div className="flex flex-col gap-3">
          {semaines.map((sem) => (
            <SemaineCarte
              key={sem.cle}
              sem={sem}
              rapport={rapports[sem.cle] || null}
              courante={sem.cle === curCle}
              ouvert={ouvert === sem.cle}
              onToggle={() => setOuvert((o) => (o === sem.cle ? null : sem.cle))}
              onStatut={(st) => changerStatut(sem.cle, st)}
              onGenerer={() => genererRapport(sem)}
              onSupprimer={supprimer}
              onEditer={setEditS}
              filtres={filtres}
              setFiltres={setFiltres}
            />
          ))}
        </div>
      )}

      {rapportSem ? <RapportModal sem={rapportSem} onClose={() => setRapportSem(null)} /> : null}
      {editS ? <EditSoinModal soin={editS} onClose={() => setEditS(null)} onSave={modifier} bureaux={bureauxSugg} medecins={medecinsConnus} /> : null}
      {decl ? <DeclarationModal soins={decl.soins} label={decl.label} onClose={() => setDecl(null)} /> : null}
    </div>
  );
}

// ── Carte d'une semaine (registre) ────────────────────────────────────────────
function SemaineCarte({
  sem, rapport, courante, ouvert, onToggle, onStatut, onGenerer, onSupprimer, onEditer, filtres, setFiltres,
}: {
  sem: SemaineFDO; rapport: RapportFDO | null; courante: boolean; ouvert: boolean;
  onToggle: () => void; onStatut: (s: string) => void; onGenerer: () => void; onSupprimer: (id: string) => void; onEditer: (s: SoinFDO) => void;
  filtres: { nom: string; bureau: string; medecin: string; date: string }; setFiltres: (f: { nom: string; bureau: string; medecin: string; date: string }) => void;
}) {
  const statutKey = rapport?.statut || "en_attente";
  const st = fdoRapportStatut(statutKey);
  const filtres0 = ouvert ? filtres : { nom: "", bureau: "", medecin: "", date: "" };
  const liste = sem.soins.filter((x) => {
    if (filtres0.nom && !norm(x.agent || "").includes(norm(filtres0.nom))) return false;
    if (filtres0.bureau && !norm(x.bureau).includes(norm(filtres0.bureau))) return false;
    if (filtres0.medecin && !norm(x.par || "").includes(norm(filtres0.medecin))) return false;
    if (filtres0.date && ymd(x.createdAt) !== filtres0.date) return false;
    return true;
  });

  return (
    <section
      className="overflow-hidden rounded-[14px] border shadow-card"
      style={{
        borderColor: courante ? "color-mix(in srgb,var(--accent) 45%,var(--border))" : "var(--border)",
        background: "linear-gradient(180deg, color-mix(in srgb,var(--accent) 5%,var(--surface)), var(--surface))",
      }}
    >
      {/* Bandeau semaine */}
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full border font-display text-[0.95rem] font-bold text-accent" style={{ borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,transparent)" }}>{sem.n}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="font-display text-[1.02rem] text-ink">Semaine {sem.n}</span>
            <span className="text-[0.78rem] italic text-muted">· {sem.periode} {sem.moisLabel} {sem.annee}</span>
            {courante ? <span className="rounded-full border border-accent px-1.5 text-[0.56rem] font-bold uppercase tracking-[0.08em] text-accent">En cours</span> : null}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[0.7rem] text-faint">
            <span>{sem.nb} soin(s)</span>
            <span className="font-num font-semibold text-muted">{money(sem.total)}</span>
            <span>{sem.patients} patient(s)</span>
            <span>{sem.nbBureaux} bureau(x)</span>
          </div>
        </div>
        <span className="shrink-0 rounded-md px-2 py-0.5 text-[0.62rem] font-bold uppercase tracking-[0.04em]" style={{ color: st.tone, background: `color-mix(in srgb,${st.tone} 15%,transparent)` }}>{st.label}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-faint transition ${ouvert ? "rotate-180" : ""}`} />
      </button>

      {ouvert ? (
        <div className="border-t border-border px-4 py-3">
          {/* Répartition par administration */}
          <div className="mb-3">
            <div className="mb-1.5 text-[0.7rem] font-semibold uppercase tracking-[0.05em] text-faint">Détail par administration</div>
            <div className="flex flex-wrap gap-2">
              {sem.parBureau.map((b) => (
                <div key={b.bureau} className="flex items-center gap-2 rounded-[10px] border border-border bg-surface-2 px-3 py-1.5">
                  <Building2 className="h-3.5 w-3.5 text-accent" />
                  <div><div className="text-[0.78rem] font-semibold">{b.bureau}</div><div className="text-[0.66rem] text-faint">{b.nb} soin(s) · <span className="font-num">{money(b.total)}</span></div></div>
                </div>
              ))}
            </div>
          </div>

          {/* Barre d'actions : statut + génération */}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className={labelCls}>Statut&nbsp;:</span>
            <select value={statutKey} onChange={(e) => onStatut(e.target.value)} className="rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.78rem] outline-none">
              {FDO_RAPPORT_STATUTS.map((s) => <option key={s.key} value={s.key}>{s.label}</option>)}
            </select>
            {rapport?.genereLe ? <span className="text-[0.66rem] text-faint">Rapport généré le {dateFR(rapport.genereLe)}</span> : null}
            <button onClick={onGenerer} className="ml-auto inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><FileText className="h-3.5 w-3.5" /> Générer le rapport pour l&apos;État</button>
          </div>

          {/* Filtres */}
          <div className="mb-2 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5"><Search className="h-3.5 w-3.5 text-faint" /><input className="min-h-[34px] w-full bg-transparent text-[0.78rem] outline-none" placeholder="Nom du patient" value={filtres.nom} onChange={(e) => setFiltres({ ...filtres, nom: e.target.value })} /></div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5"><Building2 className="h-3.5 w-3.5 text-faint" /><input className="min-h-[34px] w-full bg-transparent text-[0.78rem] outline-none" placeholder="Bureau" value={filtres.bureau} onChange={(e) => setFiltres({ ...filtres, bureau: e.target.value })} /></div>
            <div className="flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5"><Stethoscope className="h-3.5 w-3.5 text-faint" /><input className="min-h-[34px] w-full bg-transparent text-[0.78rem] outline-none" placeholder="Médecin" value={filtres.medecin} onChange={(e) => setFiltres({ ...filtres, medecin: e.target.value })} /></div>
            <input type="date" className="min-h-[34px] rounded-lg border border-border bg-surface-2 px-2.5 text-[0.78rem] outline-none" value={filtres.date} onChange={(e) => setFiltres({ ...filtres, date: e.target.value })} />
          </div>

          {/* Historique détaillé */}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-[0.78rem]">
              <thead>
                <tr className="text-left text-[0.66rem] uppercase tracking-[0.05em] text-faint">
                  <th className="border-b border-border px-2 py-1.5">Date</th>
                  <th className="border-b border-border px-2 py-1.5">Patient</th>
                  <th className="border-b border-border px-2 py-1.5">Bureau</th>
                  <th className="border-b border-border px-2 py-1.5">Médecin</th>
                  <th className="border-b border-border px-2 py-1.5">Soin</th>
                  <th className="border-b border-border px-2 py-1.5 text-right">Montant</th>
                  <th className="border-b border-border px-2 py-1.5">Observations</th>
                  <th className="border-b border-border px-2 py-1.5" />
                </tr>
              </thead>
              <tbody>
                {liste.length === 0 ? (
                  <tr><td colSpan={8} className="px-2 py-4 text-center text-faint">Aucun soin ne correspond aux filtres.</td></tr>
                ) : liste.map((s) => (
                  <tr key={s.id} className="group">
                    <td className="border-b border-border px-2 py-1.5 font-num">{dateFR(s.createdAt)}</td>
                    <td className="border-b border-border px-2 py-1.5 font-semibold">{s.agent || "—"}</td>
                    <td className="border-b border-border px-2 py-1.5">{s.bureau}</td>
                    <td className="border-b border-border px-2 py-1.5 text-muted">{s.par || "—"}</td>
                    <td className="border-b border-border px-2 py-1.5 text-muted">{s.soin || "—"}</td>
                    <td className="border-b border-border px-2 py-1.5 text-right font-num">{money(s.montant)}</td>
                    <td className="border-b border-border px-2 py-1.5 text-faint">{s.note || "—"}</td>
                    <td className="border-b border-border px-2 py-1.5 text-right"><div className="flex justify-end gap-2"><button onClick={() => onEditer(s)} className="text-faint opacity-0 transition hover:text-accent group-hover:opacity-100" aria-label="Modifier (date, détails)" title="Modifier la date d'émission et les détails"><Pencil className="h-3.5 w-3.5" /></button><button onClick={() => onSupprimer(s.id)} className="text-faint opacity-0 transition hover:text-oxblood group-hover:opacity-100" aria-label="Supprimer"><Trash2 className="h-3.5 w-3.5" /></button></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Rapport imprimable (modale + impression / PDF) ────────────────────────────
function RapportModal({ sem, onClose }: { sem: SemaineFDO; onClose: () => void }) {
  const genLe = new Intl.DateTimeFormat("fr-FR", { ...P, day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  return (
    <div className="iwc-print-host fixed inset-0 z-50 grid place-items-start overflow-auto bg-black/55 p-4 sm:p-8" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`@media print{body *{visibility:hidden!important}.iwc-print-host{position:static!important;overflow:visible!important;inset:auto!important;height:auto!important;padding:0!important;background:none!important}#fdo-rapport-print,#fdo-rapport-print *{visibility:visible!important}#fdo-rapport-print{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:none!important;margin:0!important;border-radius:0!important;box-shadow:none!important}.fdo-no-print{display:none!important}}`}</style>
      <div className="mx-auto w-full max-w-[820px]">
        <div className="fdo-no-print mb-2 flex items-center justify-between gap-2">
          <span className="text-[0.8rem] font-semibold text-white">Rapport hebdomadaire — Semaine {sem.n}</span>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
            <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-[0.78rem] font-semibold text-white"><X className="h-3.5 w-3.5" /> Fermer</button>
          </div>
        </div>
        <RapportImprimable sem={sem} genLe={genLe} />
      </div>
    </div>
  );
}

function RapportImprimable({ sem, genLe }: { sem: SemaineFDO; genLe: string }) {
  return (
    <article
      id="fdo-rapport-print"
      className="rounded-[10px] border p-8 text-[#2a2115]"
      style={{
        borderColor: "#cabfa6",
        background: "radial-gradient(1200px 300px at 50% -8%, #efe7d2, transparent 60%), linear-gradient(#f7f1e2,#f2ead6)",
        fontFamily: "Georgia, 'Times New Roman', serif",
        boxShadow: "0 18px 50px -14px rgba(0,0,0,.5)",
      }}
    >
      <header className="flex items-start justify-between gap-4 border-b-2 pb-3" style={{ borderColor: "#b79e70" }}>
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.2em]" style={{ color: "#8a7648" }}>Comté de Lemoyne · 1904</div>
          <h1 className="mt-1 text-[1.5rem] font-bold" style={{ letterSpacing: ".02em" }}>{DISPENSAIRE_NOM}</h1>
          <p className="mt-0.5 text-[0.86rem] italic" style={{ color: "#6e6353" }}>Demande de remboursement des soins prodigués aux Forces de l&apos;Ordre.</p>
        </div>
        <SceauCire size={62} />
      </header>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.82rem]" style={{ fontFamily: "'Courier New', monospace" }}>
        <div><b>Semaine :</b> {sem.n} ({sem.moisLabel} {sem.annee})</div>
        <div className="text-right"><b>Période :</b> {sem.periode}</div>
        <div><b>Généré le :</b> {genLe}</div>
        <div className="text-right"><b>Soins :</b> {sem.nb} · <b>Patients :</b> {sem.patients}</div>
      </div>

      <Fleuron className="my-4" />

      {/* Détail des soins */}
      <table className="w-full border-collapse text-[0.76rem]" style={{ fontFamily: "'Courier New', monospace" }}>
        <thead>
          <tr style={{ borderBottom: "1.5px solid #b79e70" }}>
            <th className="py-1 pr-2 text-left">Date</th>
            <th className="py-1 pr-2 text-left">Patient</th>
            <th className="py-1 pr-2 text-left">Bureau</th>
            <th className="py-1 pr-2 text-left">Médecin</th>
            <th className="py-1 pr-2 text-left">Soin</th>
            <th className="py-1 pr-2 text-right">Montant</th>
          </tr>
        </thead>
        <tbody>
          {sem.soins.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px dotted #cabfa6" }}>
              <td className="py-1 pr-2">{dateFR(s.createdAt)}</td>
              <td className="py-1 pr-2">{s.agent || "—"}</td>
              <td className="py-1 pr-2">{s.bureau}</td>
              <td className="py-1 pr-2">{s.par || "—"}</td>
              <td className="py-1 pr-2">{s.soin || "—"}</td>
              <td className="py-1 pr-2 text-right">{money(s.montant)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Totaux par administration */}
      <div className="mt-4">
        <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.08em]" style={{ color: "#8a7648" }}>Totaux par administration</div>
        <table className="w-full border-collapse text-[0.8rem]" style={{ fontFamily: "'Courier New', monospace" }}>
          <tbody>
            {sem.parBureau.map((b) => (
              <tr key={b.bureau} style={{ borderBottom: "1px dotted #cabfa6" }}>
                <td className="py-1">{b.bureau}</td>
                <td className="py-1 text-center">{b.nb} soin(s)</td>
                <td className="py-1 text-right font-bold">{money(b.total)}</td>
              </tr>
            ))}
            <tr style={{ borderTop: "2px solid #b79e70" }}>
              <td className="py-1.5 font-bold">TOTAL GÉNÉRAL</td>
              <td className="py-1.5 text-center font-bold">{sem.nb} soin(s)</td>
              <td className="py-1.5 text-right text-[1rem] font-bold" style={{ color: "#8a5a1a" }}>{money(sem.total)}</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Signatures */}
      <div className="mt-10 grid grid-cols-2 gap-8 text-[0.8rem]">
        <div>
          <div className="h-10 border-b" style={{ borderColor: "#8a7648" }} />
          <div className="mt-1 text-[0.72rem] uppercase tracking-[0.08em]" style={{ color: "#6e6353" }}>Signature du Directeur</div>
        </div>
        <div>
          <div className="h-10 border-b" style={{ borderColor: "#8a7648" }} />
          <div className="mt-1 text-[0.72rem] uppercase tracking-[0.08em]" style={{ color: "#6e6353" }}>Signature du Comptable</div>
        </div>
      </div>

      <p className="mt-6 text-center text-[0.72rem] italic" style={{ color: "#6e6353" }}>
        Document officiel du {DISPENSAIRE_NOM}. « Demande de remboursement des soins prodigués aux Forces de l&apos;Ordre. »
      </p>
    </article>
  );
}

// ── Édition d'un soin (date d'émission modifiable + détails) ──────────────────
function EditSoinModal({ soin, onClose, onSave, bureaux, medecins }: { soin: SoinFDO; onClose: () => void; onSave: (id: string, patch: { date: string; patient: string; bureau: string; medecin: string; soin: string; note: string }) => Promise<boolean>; bureaux: string[]; medecins: string[] }) {
  const [f, setF] = useState({ date: (soin.createdAt || "").slice(0, 10), patient: soin.agent || "", bureau: soin.bureau, medecin: soin.par || "", soin: soin.soin || "", note: soin.note || "" });
  const [busy, setBusy] = useState(false);
  const upd = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) => setF((p) => ({ ...p, [k]: e.target.value }));
  async function save() { if (!f.bureau.trim()) return; setBusy(true); await onSave(soin.id, f); setBusy(false); }
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-auto bg-black/55 p-4" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="iwc-pop w-full max-w-[520px] rounded-[14px] border border-border-2 bg-surface shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="flex items-center gap-2 font-display text-[1.05rem]"><Pencil className="h-4 w-4 text-accent" /> Modifier le soin</h2>
          <button onClick={onClose} className="text-faint hover:text-ink"><X className="h-4 w-4" /></button>
        </div>
        <div className="grid gap-2 p-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1"><span className={labelCls}>Date d&apos;émission</span><input type="date" className={inputCls} value={f.date} onChange={upd("date")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Patient (agent)</span><input className={inputCls} value={f.patient} onChange={upd("patient")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Bureau</span><input className={inputCls} value={f.bureau} onChange={upd("bureau")} list="fdo-edit-bureaux" /><datalist id="fdo-edit-bureaux">{bureaux.map((b) => <option key={b} value={b} />)}</datalist></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Médecin</span><input className={inputCls} value={f.medecin} onChange={upd("medecin")} list="fdo-edit-medecins" /><datalist id="fdo-edit-medecins">{medecins.map((m) => <option key={m} value={m} />)}</datalist></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Type de soin</span><input className={inputCls} value={f.soin} onChange={upd("soin")} /></label>
          <label className="flex flex-col gap-1"><span className={labelCls}>Observations</span><input className={inputCls} value={f.note} onChange={upd("note")} /></label>
        </div>
        <div className="flex justify-end gap-2 border-t border-border px-4 py-3">
          <button onClick={onClose} className="rounded-lg border border-border px-3 py-1.5 text-[0.8rem] font-semibold transition hover:border-accent">Annuler</button>
          <button onClick={save} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Enregistrer</button>
        </div>
      </div>
    </div>
  );
}

// ── Fiche de déclaration cochable (sélection par bureau / date) ────────────────
function DeclarationPanel({ soins, onGenerer }: { soins: SoinFDO[]; onGenerer: (sel: SoinFDO[], label: string) => void }) {
  const [open, setOpen] = useState(false);
  const [bureau, setBureau] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const bureaux = useMemo(() => [...new Set(soins.map((s) => s.bureau))].sort((a, b) => a.localeCompare(b)), [soins]);
  const liste = useMemo(() => soins.filter((s) => {
    if (bureau && s.bureau !== bureau) return false;
    const d = ymd(s.createdAt);
    if (from && d < from) return false;
    if (to && d > to) return false;
    return true;
  }).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)), [soins, bureau, from, to]);
  const allChecked = liste.length > 0 && liste.every((s) => checked.has(s.id));
  const toggle = (id: string) => setChecked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const toggleAll = () => setChecked((p) => { const n = new Set(p); if (allChecked) liste.forEach((s) => n.delete(s.id)); else liste.forEach((s) => n.add(s.id)); return n; });
  const sel = liste.filter((s) => checked.has(s.id));
  const total = sel.reduce((a, s) => a + s.montant, 0);
  const label = `${bureau || "Tous les bureaux"} · ${from || to ? `du ${from || "…"} au ${to || "…"}` : "toutes dates"}`;
  return (
    <section className="rounded-[14px] border border-border bg-surface">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-4 py-3 text-left">
        <ListChecks className="h-4 w-4 text-accent" />
        <span className="text-[0.9rem] font-semibold">Fiche de déclaration — sélection par bureau / date</span>
        <ChevronDown className={`ml-auto h-4 w-4 text-faint transition ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="border-t border-border px-4 py-3">
          <div className="mb-2 grid gap-2 sm:grid-cols-3">
            <label className="flex flex-col gap-1"><span className={labelCls}>Bureau</span>
              <select className={inputCls} value={bureau} onChange={(e) => setBureau(e.target.value)}><option value="">Tous les bureaux</option>{bureaux.map((b) => <option key={b} value={b}>{b}</option>)}</select>
            </label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Du</span><input type="date" className={inputCls} value={from} onChange={(e) => setFrom(e.target.value)} /></label>
            <label className="flex flex-col gap-1"><span className={labelCls}>Au</span><input type="date" className={inputCls} value={to} onChange={(e) => setTo(e.target.value)} /></label>
          </div>
          <div className="mb-1.5 flex items-center justify-between">
            <button onClick={toggleAll} className="inline-flex items-center gap-1.5 text-[0.76rem] font-semibold text-accent">{allChecked ? <CheckSquare className="h-4 w-4" /> : <Square className="h-4 w-4" />} Tout {allChecked ? "décocher" : "cocher"} ({liste.length})</button>
            <span className="text-[0.72rem] text-faint">{sel.length} sélectionné(s) · <span className="font-num font-semibold text-muted">{money(total)}</span></span>
          </div>
          <div className="max-h-[280px] overflow-auto rounded-lg border border-border">
            {liste.length === 0 ? <div className="px-3 py-6 text-center text-[0.8rem] text-faint">Aucun soin pour ces critères.</div> : (
              <ul className="divide-y divide-border">
                {liste.map((s) => (
                  <li key={s.id} className="flex items-center gap-2 px-3 py-1.5 text-[0.78rem]">
                    <button onClick={() => toggle(s.id)} className="shrink-0" aria-label="Sélectionner">{checked.has(s.id) ? <CheckSquare className="h-4 w-4 text-accent" /> : <Square className="h-4 w-4 text-faint" />}</button>
                    <span className="w-[76px] shrink-0 font-num text-faint">{dateFR(s.createdAt)}</span>
                    <span className="flex-1 truncate font-semibold">{s.agent || "—"}</span>
                    <span className="hidden max-w-[130px] truncate text-muted sm:block">{s.bureau}</span>
                    <span className="shrink-0 font-num">{money(s.montant)}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <div className="mt-2.5 flex justify-end">
            <button onClick={() => sel.length && onGenerer(sel, label)} disabled={!sel.length} className="inline-flex items-center gap-1.5 rounded-lg px-4 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}><FileText className="h-4 w-4" /> Générer la fiche de déclaration ({sel.length})</button>
          </div>
        </div>
      ) : null}
    </section>
  );
}

// ── Fiche de déclaration imprimable (sélection libre) ─────────────────────────
function DeclarationModal({ soins, label, onClose }: { soins: SoinFDO[]; label: string; onClose: () => void }) {
  const genLe = new Intl.DateTimeFormat("fr-FR", { ...P, day: "2-digit", month: "long", year: "numeric" }).format(new Date());
  return (
    <div className="iwc-print-host fixed inset-0 z-50 grid place-items-start overflow-auto bg-black/55 p-4 sm:p-8" onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <style>{`@media print{body *{visibility:hidden!important}.iwc-print-host{position:static!important;overflow:visible!important;inset:auto!important;height:auto!important;padding:0!important;background:none!important}#fdo-decl-print,#fdo-decl-print *{visibility:visible!important}#fdo-decl-print{position:absolute!important;left:0!important;top:0!important;width:100%!important;max-width:none!important;margin:0!important;border-radius:0!important;box-shadow:none!important}.fdo-no-print{display:none!important}}`}</style>
      <div className="mx-auto w-full max-w-[820px]">
        <div className="fdo-no-print mb-2 flex items-center justify-between gap-2">
          <span className="text-[0.8rem] font-semibold text-white">Fiche de déclaration — {soins.length} soin(s)</span>
          <div className="flex gap-2">
            <button onClick={() => window.print()} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85" style={{ background: "var(--accent)" }}><Printer className="h-3.5 w-3.5" /> Imprimer / PDF</button>
            <button onClick={onClose} className="inline-flex items-center gap-1.5 rounded-lg border border-white/30 px-3 py-1.5 text-[0.78rem] font-semibold text-white"><X className="h-3.5 w-3.5" /> Fermer</button>
          </div>
        </div>
        <DeclarationImprimable soins={soins} label={label} genLe={genLe} />
      </div>
    </div>
  );
}

function DeclarationImprimable({ soins, label, genLe }: { soins: SoinFDO[]; label: string; genLe: string }) {
  const pb = parBureauDe(soins);
  const total = soins.reduce((a, s) => a + s.montant, 0);
  const patients = patientsDe(soins);
  const tries = [...soins].sort((a, b) => (a.createdAt < b.createdAt ? -1 : 1));
  return (
    <article id="fdo-decl-print" className="rounded-[10px] border p-8 text-[#2a2115]" style={{ borderColor: "#cabfa6", background: "radial-gradient(1200px 300px at 50% -8%, #efe7d2, transparent 60%), linear-gradient(#f7f1e2,#f2ead6)", fontFamily: "Georgia, 'Times New Roman', serif", boxShadow: "0 18px 50px -14px rgba(0,0,0,.5)" }}>
      <header className="flex items-start justify-between gap-4 border-b-2 pb-3" style={{ borderColor: "#b79e70" }}>
        <div>
          <div className="text-[0.66rem] font-bold uppercase tracking-[0.2em]" style={{ color: "#8a7648" }}>Comté de Lemoyne · 1904</div>
          <h1 className="mt-1 text-[1.5rem] font-bold" style={{ letterSpacing: ".02em" }}>{DISPENSAIRE_NOM}</h1>
          <p className="mt-0.5 text-[0.86rem] italic" style={{ color: "#6e6353" }}>Fiche de déclaration — Demande de remboursement des soins prodigués aux Forces de l&apos;Ordre.</p>
        </div>
        <SceauCire size={62} />
      </header>
      <div className="mt-3 grid grid-cols-2 gap-2 text-[0.82rem]" style={{ fontFamily: "'Courier New', monospace" }}>
        <div><b>Sélection :</b> {label}</div>
        <div className="text-right"><b>Généré le :</b> {genLe}</div>
        <div><b>Soins retenus :</b> {soins.length}</div>
        <div className="text-right"><b>Patients :</b> {patients}</div>
      </div>
      <Fleuron className="my-4" />
      <table className="w-full border-collapse text-[0.76rem]" style={{ fontFamily: "'Courier New', monospace" }}>
        <thead><tr style={{ borderBottom: "1.5px solid #b79e70" }}>
          <th className="py-1 pr-2 text-left">Date</th><th className="py-1 pr-2 text-left">Patient</th><th className="py-1 pr-2 text-left">Bureau</th><th className="py-1 pr-2 text-left">Médecin</th><th className="py-1 pr-2 text-left">Soin</th><th className="py-1 pr-2 text-right">Montant</th>
        </tr></thead>
        <tbody>{tries.map((s) => (
          <tr key={s.id} style={{ borderBottom: "1px dotted #cabfa6" }}>
            <td className="py-1 pr-2">{dateFR(s.createdAt)}</td><td className="py-1 pr-2">{s.agent || "—"}</td><td className="py-1 pr-2">{s.bureau}</td><td className="py-1 pr-2">{s.par || "—"}</td><td className="py-1 pr-2">{s.soin || "—"}</td><td className="py-1 pr-2 text-right">{money(s.montant)}</td>
          </tr>
        ))}</tbody>
      </table>
      <div className="mt-4">
        <div className="mb-1 text-[0.72rem] font-bold uppercase tracking-[0.08em]" style={{ color: "#8a7648" }}>Totaux par administration</div>
        <table className="w-full border-collapse text-[0.8rem]" style={{ fontFamily: "'Courier New', monospace" }}><tbody>
          {pb.map((b) => (<tr key={b.bureau} style={{ borderBottom: "1px dotted #cabfa6" }}><td className="py-1">{b.bureau}</td><td className="py-1 text-center">{b.nb} soin(s)</td><td className="py-1 text-right font-bold">{money(b.total)}</td></tr>))}
          <tr style={{ borderTop: "2px solid #b79e70" }}><td className="py-1.5 font-bold">TOTAL GÉNÉRAL</td><td className="py-1.5 text-center font-bold">{soins.length} soin(s)</td><td className="py-1.5 text-right text-[1rem] font-bold" style={{ color: "#8a5a1a" }}>{money(total)}</td></tr>
        </tbody></table>
      </div>
      <div className="mt-10 grid grid-cols-2 gap-8 text-[0.8rem]">
        <div><div className="h-10 border-b" style={{ borderColor: "#8a7648" }} /><div className="mt-1 text-[0.72rem] uppercase tracking-[0.08em]" style={{ color: "#6e6353" }}>Signature du Directeur</div></div>
        <div><div className="h-10 border-b" style={{ borderColor: "#8a7648" }} /><div className="mt-1 text-[0.72rem] uppercase tracking-[0.08em]" style={{ color: "#6e6353" }}>Signature du Comptable</div></div>
      </div>
      <p className="mt-6 text-center text-[0.72rem] italic" style={{ color: "#6e6353" }}>Document officiel du {DISPENSAIRE_NOM}. « Demande de remboursement des soins prodigués aux Forces de l&apos;Ordre. »</p>
    </article>
  );
}

function parBureauDe(soins: SoinFDO[]): { bureau: string; nb: number; total: number }[] {
  const m = new Map<string, { nb: number; total: number }>();
  for (const s of soins) { const e = m.get(s.bureau) || { nb: 0, total: 0 }; e.nb += 1; e.total += s.montant; m.set(s.bureau, e); }
  return [...m.entries()].map(([bureau, e]) => ({ bureau, ...e })).sort((a, b) => b.total - a.total || a.bureau.localeCompare(b.bureau));
}
function patientsDe(soins: SoinFDO[]): number { return new Set(soins.map((s) => (s.agent || "—").toLowerCase().trim())).size; }
