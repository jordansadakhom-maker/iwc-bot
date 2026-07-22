"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Users, Plus, Minus, Loader2, Trash2, Check, Download, Clock, Play, Square,
  BadgeDollarSign, Landmark, StickyNote, ListTodo, Activity, Pin, PinOff, Pencil,
  ArrowDownRight, ArrowUpRight, CircleDollarSign, Wallet, ClipboardList, X, Pickaxe, Search, ScanLine, AlertTriangle, CalendarClock, Bell,
} from "lucide-react";
import { PhotoDrop } from "@/components/photo-drop";
import type { ArmEmploye, ArmPointage, ArmPaie, ArmImpot, ArmNote, ArmTache, ArmMouvement, ArmVente, ArmProduit, ArmCommande, ArmCommandeLigne, ArmRessource, ArmRdv } from "@/lib/queries";
import { Modal, Flash, Champ, inputCls } from "@/components/edit-ui";
import { Badge } from "@/components/ui";
import { cents, round2 } from "@/lib/format";
import {
  creerEmploye, majEmploye, supprimerEmploye,
  pointerService, terminerService, supprimerPointage,
  creerPaie, payerPaie, supprimerPaie,
  creerImpot, payerImpot, supprimerImpot,
  ajouterEcriture, reajusterFinancesReckless,
  creerNote, majNote, supprimerNote,
  creerTache, basculerTache, supprimerTache,
  creerCommande, majCommande, marquerCommande, supprimerCommande,
  creerRdv, majRdv, marquerRdv, supprimerRdv, lireCarteIdentite,
  creerRessource, majRessource, supprimerRessource, importerRessources, acheterRessources, type LigneRessource,
  lireCoffreRessources, appliquerStockRessources, annulerStockRessources,
  lireFinancesReckless,
} from "@/app/(app)/armurerie/actions";

type Router = ReturnType<typeof useRouter>;
const money = (n: number) => `${cents(n)}$`;
const dateFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const heureFR = (s: string | null) => { if (!s) return ""; try { return new Date(s).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
const hm = (min: number) => { const h = Math.floor(min / 60); const m = min % 60; return h ? `${h} h ${String(m).padStart(2, "0")}` : `${m} min`; };

function Vide({ icon: Icon, texte }: { icon: typeof Users; texte: string }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
      <Icon className="h-6 w-6 text-faint" strokeWidth={1.6} />
      <p className="max-w-md text-[0.82rem] leading-relaxed text-muted">{texte}</p>
    </div>
  );
}
function TopBar({ children }: { children: React.ReactNode }) {
  return <div className="mb-3 flex flex-wrap items-center justify-between gap-2">{children}</div>;
}
function Btn({ onClick, children, tone = "accent", disabled }: { onClick: () => void; children: React.ReactNode; tone?: "accent" | "ghost"; disabled?: boolean }) {
  if (tone === "ghost") return <button onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface-2 px-2.5 py-1.5 text-[0.76rem] font-semibold hover:border-border-2 disabled:opacity-60">{children}</button>;
  return <button onClick={onClick} disabled={disabled} className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[0.76rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{children}</button>;
}
function Stat({ label, value, tone, icon: Icon }: { label: string; value: string; tone: string; icon: typeof Users }) {
  return (
    <div className="rounded-[12px] border border-border bg-surface-2 px-3 py-2.5">
      <div className="flex items-center gap-1.5 text-[0.66rem] uppercase tracking-[0.06em] text-faint"><Icon className="h-3.5 w-3.5" style={{ color: tone }} /> {label}</div>
      <div className="mt-1 font-num text-[1.1rem] font-bold" style={{ color: tone }}>{value}</div>
    </div>
  );
}

// ═══════════════════ EMPLOYÉS ═══════════════════
export function EmployesTab({ employes, router }: { employes: ArmEmploye[]; router: Router }) {
  const [sel, setSel] = useState<ArmEmploye | null>(null);
  const [nouveau, setNouveau] = useState(false);
  return (
    <>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">L&apos;équipe de l&apos;armurerie — sert au pointage et au calcul des paies.</p>
        <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Nouvel employé</Btn>
      </TopBar>
      {employes.length === 0 ? (
        <Vide icon={Users} texte="Aucun employé. Ajoute ton équipe (rôle, commission, salaire fixe) pour activer le pointage et les paies." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {employes.map((e) => (
            <button key={e.id} onClick={() => setSel(e)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[0.88rem] font-semibold">{e.nom}</span>
                <Badge tone={e.actif ? "good" : "muted"}>{e.actif ? "Actif" : "Inactif"}</Badge>
              </div>
              <div className="mt-1 text-[0.74rem] text-muted">{e.role || "Armurier"}</div>
              <div className="mt-1.5 flex items-center gap-3 text-[0.72rem] text-faint">
                <span>Commission <b className="font-num text-ink">{e.commission}%</b></span>
                {e.salaireBase ? <span>Fixe <b className="font-num text-ink">{money(e.salaireBase)}</b></span> : null}
              </div>
            </button>
          ))}
        </div>
      )}
      {nouveau ? <EmployeModal onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <EmployeModal key={sel.id} employe={sel} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}
function EmployeModal({ employe, onClose, router }: { employe?: ArmEmploye; onClose: () => void; router: Router }) {
  const editing = !!employe;
  const [nom, setNom] = useState(employe?.nom || "");
  const [role, setRole] = useState(employe?.role || "Armurier");
  const [discordId, setDiscordId] = useState(employe?.discordId || "");
  const [commission, setCommission] = useState(employe ? String(employe.commission) : "10");
  const [salaireBase, setSalaireBase] = useState(employe ? String(employe.salaireBase) : "");
  const [actif, setActif] = useState(employe ? employe.actif : true);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function enregistrer() {
    setErr(null);
    if (nom.trim().length < 2) { setErr("Nom de l'employé requis."); return; }
    setBusy("save");
    const data = { nom, role, discordId, commission: Number(commission) || 0, salaireBase: Number(salaireBase) || 0, actif };
    const r = editing ? await majEmploye(employe!.id, data) : await creerEmploye(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function supprimer() { setBusy("del"); const r = await supprimerEmploye(employe!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }

  return (
    <Modal titre={editing ? employe!.nom : "👤 Nouvel employé"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Nom & prénom *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoFocus /></Champ>
          <Champ label="Rôle"><input className={inputCls} value={role} onChange={(e) => setRole(e.target.value)} placeholder="Patron, Armurier, Apprenti…" maxLength={60} /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Commission sur ventes (%)"><input className={inputCls} type="number" min={0} max={100} value={commission} onChange={(e) => setCommission(e.target.value)} /></Champ>
          <Champ label="Salaire fixe ($ / période)"><input className={inputCls} type="number" min={0} step="0.01" value={salaireBase} onChange={(e) => setSalaireBase(e.target.value)} /></Champ>
        </div>
        <Champ label="ID Discord (optionnel)"><input className={inputCls} value={discordId} onChange={(e) => setDiscordId(e.target.value)} maxLength={40} placeholder="18 chiffres" /></Champ>
        <label className="inline-flex items-center gap-2 text-[0.82rem]"><input type="checkbox" checked={actif} onChange={(e) => setActif(e.target.checked)} /> Employé actif (apparaît au pointage)</label>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
          ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ POINTAGE ═══════════════════
export function PointageTab({ employes, pointages, router }: { employes: ArmEmploye[]; pointages: ArmPointage[]; router: Router }) {
  const [busy, setBusy] = useState<string | null>(null);
  const actifs = employes.filter((e) => e.actif);
  const ouvertPar = useMemo(() => {
    const m = new Map<string, ArmPointage>();
    for (const p of pointages) if (!p.fin && p.employeId) m.set(p.employeId, p);
    return m;
  }, [pointages]);
  const totalMin = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of pointages) if (p.fin && p.employeId) m.set(p.employeId, (m.get(p.employeId) || 0) + p.minutes);
    return m;
  }, [pointages]);

  async function pointer(e: ArmEmploye) { setBusy(e.id); const r = await pointerService(e.id, e.nom); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Action impossible — réessaie."); }
  async function terminer(p: ArmPointage) { setBusy(p.id); const r = await terminerService(p.id); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Action impossible — réessaie."); }

  const recents = pointages.filter((p) => p.fin).slice(0, 12);

  if (employes.length === 0) return <Vide icon={Clock} texte="Ajoute d'abord des employés (onglet « Employés ») pour pointer les services." />;

  return (
    <>
      <p className="mb-3 text-[0.74rem] italic text-faint">Prise et fin de service — les heures alimentent le calcul des paies.</p>
      <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
        {actifs.map((e) => {
          const ouvert = ouvertPar.get(e.id);
          const cumul = totalMin.get(e.id) || 0;
          return (
            <div key={e.id} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <span className="min-w-0 truncate text-[0.86rem] font-semibold">{e.nom}</span>
                {ouvert ? <Badge tone="good">En service</Badge> : <Badge tone="muted">Hors service</Badge>}
              </div>
              <div className="mt-1 text-[0.72rem] text-faint">{ouvert ? `Depuis ${heureFR(ouvert.debut)}` : `Cumul : ${hm(cumul)}`}</div>
              <div className="mt-2">
                {ouvert ? (
                  <button onClick={() => terminer(ouvert)} disabled={busy === ouvert.id} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--oxblood)", color: "#fff" }}>
                    {busy === ouvert.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Square className="h-3.5 w-3.5" />} Terminer le service
                  </button>
                ) : (
                  <button onClick={() => pointer(e)} disabled={busy === e.id} className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-[0.8rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>
                    {busy === e.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Play className="h-3.5 w-3.5" />} Pointer l&apos;arrivée
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {recents.length ? (
        <div className="mt-4">
          <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-faint">Services récents</div>
          <div className="flex flex-col gap-1">
            {recents.map((p) => (
              <div key={p.id} className="flex items-center gap-2.5 rounded-[8px] border border-border bg-surface-2 px-3 py-1.5 text-[0.8rem]">
                <Clock className="h-3.5 w-3.5 shrink-0 text-faint" />
                <span className="min-w-0 flex-1 truncate font-medium">{p.employeNom}</span>
                <span className="shrink-0 text-faint">{heureFR(p.debut)} → {heureFR(p.fin)}</span>
                <span className="shrink-0 font-num font-semibold" style={{ color: "var(--accent)" }}>{hm(p.minutes)}</span>
                <button onClick={async () => { setBusy(p.id); await supprimerPointage(p.id); setBusy(null); router.refresh(); }} className="shrink-0 text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

// ═══════════════════ COMPTABILITÉ ═══════════════════
export function ComptabiliteTab({ mouvements, ca, router }: { mouvements: ArmMouvement[]; ca: number; router: Router }) {
  const [periode, setPeriode] = useState<"7" | "30" | "tout">("30");
  const [nouveau, setNouveau] = useState(false);
  const [importR, setImportR] = useState(false);

  const filtres = useMemo(() => {
    if (periode === "tout") return mouvements;
    const seuil = Date.now() - Number(periode) * 86400000;
    return mouvements.filter((m) => { const t = m.createdAt ? new Date(m.createdAt).getTime() : 0; return t >= seuil; });
  }, [mouvements, periode]);

  // « capital » = apports / retraits de trésorerie : hors résultat d'exploitation
  // (ni recette ni dépense), mais bien pris en compte dans le solde du coffre.
  const estCapital = (m: ArmMouvement) => m.nature === "capital";
  const recettes = filtres.filter((m) => m.sens === "entree" && !estCapital(m)).reduce((s, m) => s + m.montant, 0);
  const sorties = filtres.filter((m) => m.sens === "sortie" && !estCapital(m));
  const depProduit = sorties.filter((m) => m.nature === "produit").reduce((s, m) => s + m.montant, 0);
  const depCharge = sorties.filter((m) => m.nature === "charge").reduce((s, m) => s + m.montant, 0);
  const depAutre = sorties.filter((m) => m.nature !== "produit" && m.nature !== "charge").reduce((s, m) => s + m.montant, 0);
  const depenses = depProduit + depCharge + depAutre;
  const net = recettes - depenses;
  const capitalIn = filtres.filter((m) => m.sens === "entree" && estCapital(m)).reduce((s, m) => s + m.montant, 0);
  const capitalOut = filtres.filter((m) => m.sens === "sortie" && estCapital(m)).reduce((s, m) => s + m.montant, 0);
  const capitalNet = capitalIn - capitalOut;
  const aCapital = capitalIn > 0 || capitalOut > 0;

  function exporter() {
    const l = ["ARMURERIE DE VAN HORN — GRAND LIVRE COMPTABLE", `Période : ${periode === "tout" ? "totale" : periode + " derniers jours"}`, "=".repeat(60), ""];
    filtres.forEach((m) => l.push(`${dateFR(m.createdAt).padEnd(20)} ${(m.sens === "entree" ? "+" : "−")}${money(m.montant).padEnd(10)} ${m.nature === "capital" ? "[capital] " : m.sens === "sortie" && (m.nature === "produit" || m.nature === "charge") ? `[${m.nature}] ` : ""}${m.motif || ""}${m.auteur ? ` (${m.auteur})` : ""}`));
    l.push("", `Recettes : ${money(recettes)}`, `Dépenses produit : ${money(depProduit)}`, `Dépenses charge : ${money(depCharge + depAutre)}`, `Dépenses totales : ${money(depenses)}`, `Résultat net : ${money(net)}`);
    if (aCapital) l.push(`Apports de capital : ${money(capitalIn)}`, `Retraits de capital : ${money(capitalOut)}`, `Capital net : ${money(capitalNet)}`);
    const blob = new Blob([l.join("\n")], { type: "text/plain;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "comptabilite-van-horn.txt"; a.click(); URL.revokeObjectURL(a.href);
  }
  function exporterCSV() {
    const esc = (v: string) => `"${String(v).replace(/"/g, '""')}"`;
    const lignes = [["Date", "Sens", "Nature", "Libellé", "Par", "Montant"].join(";")];
    filtres.forEach((m) => lignes.push([esc(dateFR(m.createdAt)), m.nature === "capital" ? "Capital" : m.sens === "entree" ? "Recette" : "Dépense", m.nature === "capital" ? "capital" : m.sens === "sortie" && (m.nature === "produit" || m.nature === "charge") ? m.nature : "", esc(m.motif || ""), esc(m.auteur || ""), (m.sens === "entree" ? "" : "-") + (Number(m.montant) || 0).toFixed(2)].join(";")));
    // BOM pour Excel + séparateur ; (locale FR)
    const blob = new Blob(["﻿" + lignes.join("\r\n")], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = "comptabilite-van-horn.csv"; a.click(); URL.revokeObjectURL(a.href);
  }

  return (
    <>
      <div className={`mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3 ${aCapital ? "xl:grid-cols-6" : "xl:grid-cols-5"}`}>
        <Stat label="Recettes" value={money(recettes)} tone="var(--good)" icon={ArrowDownRight} />
        <Stat label="Dépenses produit" value={money(depProduit)} tone="var(--oxblood)" icon={ClipboardList} />
        <Stat label="Dépenses charge" value={money(depCharge + depAutre)} tone="var(--oxblood)" icon={ArrowUpRight} />
        {aCapital ? <Stat label="Capital (net)" value={`${capitalNet >= 0 ? "+" : "−"}${money(Math.abs(capitalNet))}`} tone="var(--steel)" icon={Landmark} /> : null}
        <Stat label="Résultat net" value={money(net)} tone={net >= 0 ? "var(--good)" : "var(--oxblood)"} icon={Wallet} />
        <Stat label="CA cumulé" value={money(ca)} tone="var(--accent)" icon={CircleDollarSign} />
      </div>
      <TopBar>
        <div className="flex gap-1.5">
          {(["7", "30", "tout"] as const).map((p) => (
            <button key={p} onClick={() => setPeriode(p)} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold transition" style={{ color: periode === p ? "#000" : "var(--muted)", background: periode === p ? "var(--accent)" : "var(--surface-2)" }}>{p === "tout" ? "Tout" : `${p} j`}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {filtres.length ? <Btn onClick={exporter} tone="ghost"><Download className="h-3.5 w-3.5" /> .txt</Btn> : null}
          {filtres.length ? <Btn onClick={exporterCSV} tone="ghost"><Download className="h-3.5 w-3.5" /> CSV</Btn> : null}
          <Btn onClick={() => setImportR(true)} tone="ghost"><ScanLine className="h-3.5 w-3.5" /> Capture Reckless</Btn>
          <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Écriture</Btn>
        </div>
      </TopBar>
      {filtres.length === 0 ? (
        <Vide icon={BadgeDollarSign} texte="Aucun mouvement sur la période. Les ventes, paies et impôts s'inscrivent ici automatiquement ; ajoute une écriture manuelle pour une recette ou une dépense." />
      ) : (
        <>
        <ComptaChart mouvements={filtres} />
        <div className="overflow-x-auto rounded-[12px] border border-border bg-surface-2">
          <table className="w-full min-w-[560px] border-collapse text-left text-[0.82rem]">
            <thead><tr className="text-[0.66rem] uppercase tracking-[0.06em] text-faint">{["Date", "Libellé", "Par", "Montant"].map((h) => <th key={h} className="border-b border-border px-2.5 py-2 font-semibold">{h}</th>)}</tr></thead>
            <tbody>
              {filtres.map((m) => {
                const entree = m.sens === "entree";
                return (
                  <tr key={m.id} className="hover:bg-[color-mix(in_srgb,var(--ink)_4%,transparent)]">
                    <td className="border-b border-border px-2.5 py-2 text-faint">{dateFR(m.createdAt)}</td>
                    <td className="border-b border-border px-2.5 py-2"><span className="align-middle">{m.motif || (entree ? "Recette" : "Dépense")}</span>{m.nature === "capital" ? <span className="ml-1.5 inline-block rounded-full px-1.5 py-0.5 align-middle text-[0.6rem] font-semibold uppercase tracking-[0.04em]" style={{ color: "var(--steel)", background: "color-mix(in srgb,var(--steel) 14%,transparent)" }}>capital</span> : !entree && (m.nature === "produit" || m.nature === "charge") ? <span className="ml-1.5 inline-block rounded-full px-1.5 py-0.5 align-middle text-[0.6rem] font-semibold uppercase tracking-[0.04em]" style={{ color: m.nature === "produit" ? "var(--accent)" : "var(--oxblood)", background: `color-mix(in srgb,${m.nature === "produit" ? "var(--accent)" : "var(--oxblood)"} 14%,transparent)` }}>{m.nature}</span> : null}</td>
                    <td className="border-b border-border px-2.5 py-2 text-faint">{m.auteur || "—"}</td>
                    <td className="border-b border-border px-2.5 py-2 font-num font-semibold" style={{ color: entree ? "var(--good)" : "var(--oxblood)" }}>{entree ? "+" : "−"}{money(m.montant)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}
      {nouveau ? <EcritureModal onClose={() => setNouveau(false)} router={router} /> : null}
      {importR ? <ImportRecklessModal onClose={() => setImportR(false)} router={router} /> : null}
    </>
  );
}

// Importe les recettes/dépenses depuis une capture du tableau de bord Reckless.
function ImportRecklessModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [lecture, setLecture] = useState(false);
  const [lu, setLu] = useState<{ recettes: number; depenses: number; benefice: number; categories: { nom: string; montant: number }[] } | null>(null);
  const [libelle, setLibelle] = useState("");
  const [mode, setMode] = useState<"detail" | "total">("detail");
  const [detailSide, setDetailSide] = useState<"recettes" | "depenses">("recettes");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onPhoto(url: string) {
    setErr(null); setLu(null); setLecture(true);
    const r = await lireFinancesReckless(url);
    setLecture(false);
    if (!r.ok) { setErr(r.error || "Lecture impossible."); return; }
    setLu({ recettes: r.recettes || 0, depenses: r.depenses || 0, benefice: r.benefice || 0, categories: r.categories || [] });
    setDetailSide(r.detailType || "recettes");
    setLibelle(new Date().toLocaleDateString("fr-FR"));
  }
  async function enregistrer() {
    if (!lu) return;
    setErr(null); setBusy(true);
    const suffixe = libelle.trim() ? " — " + libelle.trim() : "";
    type Mvt = { montant: number; sens: "entree" | "sortie"; motif: string; nature: "produit" | "charge" | null };
    const mvts: Mvt[] = [];
    // Construit un côté (recette/dépense) : au détail des catégories, en regroupant les
    // lignes masquées (« + N autres ») pour coller au total.
    function coteDetaille(total: number, sens: "entree" | "sortie", nature: "charge" | null) {
      let sum = 0;
      for (const c of lu!.categories) { if (c.montant > 0 && c.nom.trim()) { sum += c.montant; mvts.push({ montant: c.montant, sens, motif: "Reckless — " + c.nom.trim() + suffixe, nature }); } }
      const reste = round2((total || sum) - sum);
      if (reste > 0.005) mvts.push({ montant: reste, sens, motif: "Reckless — autres " + (sens === "entree" ? "recettes" : "dépenses") + suffixe, nature });
    }
    const detailOn = mode === "detail" && lu.categories.length > 0;
    if (detailOn && detailSide === "recettes") coteDetaille(lu.recettes, "entree", null);
    else if (lu.recettes > 0) mvts.push({ montant: lu.recettes, sens: "entree", motif: "Recettes Reckless" + suffixe, nature: null });
    if (detailOn && detailSide === "depenses") coteDetaille(lu.depenses, "sortie", "charge");
    else if (lu.depenses > 0) mvts.push({ montant: lu.depenses, sens: "sortie", motif: "Dépenses Reckless" + suffixe, nature: "charge" });

    const r = await reajusterFinancesReckless(mvts);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Enregistrement impossible."); return; }
    router.refresh(); onClose();
  }

  // Édition des valeurs lues (pour corriger un chiffre mal lu avant d'enregistrer).
  const setCat = (i: number, patch: Partial<{ nom: string; montant: number }>) => setLu((l) => (l ? { ...l, categories: l.categories.map((c, j) => (j === i ? { ...c, ...patch } : c)) } : l));
  const delCat = (i: number) => setLu((l) => (l ? { ...l, categories: l.categories.filter((_, j) => j !== i) } : l));
  const addCat = () => setLu((l) => (l ? { ...l, categories: [...l.categories, { nom: "", montant: 0 }] } : l));
  const sommeCat = lu ? lu.categories.reduce((s, c) => s + (Number(c.montant) || 0), 0) : 0;
  const sideTotal = lu ? (detailSide === "recettes" ? lu.recettes : lu.depenses) : 0;
  const reste = round2(sideTotal - sommeCat);

  return (
    <Modal titre="📸 Importer une capture Reckless" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <p className="text-[0.8rem] text-muted">Glisse une capture du tableau de bord financier Reckless : l&apos;IA lit les <b>recettes</b> et <b>dépenses</b>, puis <b>réajuste</b> ta comptabilité pour coller à Reckless. Réimporter <b>remplace</b> l&apos;import précédent (jamais de doublon).</p>
        <PhotoDrop dossier="armurerie-compta" onUploaded={onPhoto} label={lecture ? "Lecture en cours…" : "Glisser la capture du tableau de bord Reckless"} />
        {lecture ? <p className="text-[0.8rem] text-faint">⏳ Lecture de la capture…</p> : null}
        {lu ? (
          <div className="flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 p-3">
            <p className="text-[0.68rem] text-faint">Vérifie / corrige les chiffres lus — <b className="text-ink">ce que tu valides est exactement ce qui sera enregistré</b>.</p>
            <div className="grid grid-cols-3 gap-2">
              <label className="text-[0.6rem] uppercase tracking-[0.05em] text-faint">Recettes ($)<input className={inputCls + " mt-0.5"} type="number" step="0.01" min={0} value={lu.recettes} onChange={(e) => setLu({ ...lu, recettes: Number(e.target.value) || 0 })} /></label>
              <label className="text-[0.6rem] uppercase tracking-[0.05em] text-faint">Dépenses ($)<input className={inputCls + " mt-0.5"} type="number" step="0.01" min={0} value={lu.depenses} onChange={(e) => setLu({ ...lu, depenses: Number(e.target.value) || 0 })} /></label>
              <div className="text-[0.6rem] uppercase tracking-[0.05em] text-faint">Bénéfice<div className="mt-1.5 font-num text-[1.05rem] font-bold" style={{ color: lu.recettes - lu.depenses >= 0 ? "var(--good)" : "var(--oxblood)" }}>{money(lu.recettes - lu.depenses)}</div></div>
            </div>
            <div>
              <div className="mb-1 text-[0.6rem] uppercase tracking-[0.05em] text-faint">Import</div>
              <div className="flex gap-2">
                <button onClick={() => setMode("detail")} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold" style={mode === "detail" ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>Détaillé (par catégorie)</button>
                <button onClick={() => setMode("total")} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold" style={mode === "total" ? { color: "#000", background: "var(--accent)", borderColor: "var(--accent)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>Totaux uniquement</button>
              </div>
              {mode === "detail" ? (
                <div className="mt-2">
                  <div className="mb-1 text-[0.6rem] uppercase tracking-[0.05em] text-faint">Le détail lu concerne</div>
                  <div className="flex gap-2">
                    <button onClick={() => setDetailSide("recettes")} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold" style={detailSide === "recettes" ? { color: "#000", background: "var(--good)", borderColor: "var(--good)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>Recettes</button>
                    <button onClick={() => setDetailSide("depenses")} className="flex-1 rounded-lg border px-2.5 py-1.5 text-[0.76rem] font-semibold" style={detailSide === "depenses" ? { color: "#fff", background: "var(--oxblood)", borderColor: "var(--oxblood)" } : { color: "var(--muted)", borderColor: "var(--border)" }}>Dépenses</button>
                  </div>
                </div>
              ) : null}
              <p className="mt-1 text-[0.68rem] text-faint">{mode === "detail" ? `Une écriture par ${detailSide === "recettes" ? "recette" : "dépense"} lue (le « + N autres » masqué est regroupé pour coller au total). L'autre côté est enregistré en un seul montant.` : "Une écriture pour le total des recettes, une pour le total des dépenses."}</p>
            </div>
            {mode === "detail" ? (
              <div className="border-t border-border pt-2">
                <div className="mb-1 flex items-center justify-between text-[0.6rem] uppercase tracking-[0.05em] text-faint">
                  <span>Détail des {detailSide}</span>
                  <span style={{ color: reste < -0.005 ? "var(--oxblood)" : "var(--faint)" }}>somme {money(sommeCat)} / {money(sideTotal)}{reste > 0.005 ? ` · reste ${money(reste)} regroupé` : reste < -0.005 ? " · dépasse le total !" : ""}</span>
                </div>
                <ul className="flex max-h-[220px] flex-col gap-1 overflow-auto">
                  {lu.categories.map((c, i) => (
                    <li key={i} className="flex items-center gap-1.5">
                      <input className={inputCls + " flex-1"} value={c.nom} onChange={(e) => setCat(i, { nom: e.target.value })} placeholder="Catégorie" />
                      <input className={inputCls} style={{ width: 92 }} type="number" step="0.01" min={0} value={c.montant} onChange={(e) => setCat(i, { montant: Number(e.target.value) || 0 })} />
                      <button onClick={() => delCat(i)} className="grid h-7 w-7 shrink-0 place-items-center rounded-md border border-border text-faint hover:border-border-2 hover:text-ink"><X className="h-3.5 w-3.5" /></button>
                    </li>
                  ))}
                </ul>
                <button onClick={addCat} className="mt-1.5 inline-flex items-center gap-1 text-[0.72rem] font-semibold text-accent hover:underline"><Plus className="h-3.5 w-3.5" /> Ajouter une ligne</button>
              </div>
            ) : null}
            <Champ label="Libellé (date / cycle)"><input className={inputCls} value={libelle} onChange={(e) => setLibelle(e.target.value)} maxLength={120} /></Champ>
            <p className="text-[0.7rem] text-faint">↻ Réajustement : cet import <b>remplace</b> le précédent import Reckless — ta compta reste synchro, sans doubler. Tes autres écritures (ventes, paies…) ne sont pas touchées.</p>
          </div>
        ) : null}
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Fermer</button>
          <button onClick={enregistrer} disabled={!lu || busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Réajuster la comptabilité</button>
        </div>
      </div>
    </Modal>
  );
}
function EcritureModal({ onClose, router }: { onClose: () => void; router: Router }) {
  const [sens, setSens] = useState<"entree" | "sortie">("sortie");
  const [nature, setNature] = useState<"produit" | "charge" | "capital">("produit");
  const [montant, setMontant] = useState("");
  const [motif, setMotif] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function valider() {
    setErr(null);
    if (!(Number(montant) > 0)) { setErr("Montant invalide."); return; }
    setBusy(true);
    const r = await ajouterEcriture(Number(montant), sens, motif, nature === "capital" ? "capital" : sens === "sortie" ? nature : null);
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  return (
    <Modal titre="🧾 Nouvelle écriture" onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="flex gap-2">
          <button onClick={() => setSens("entree")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: sens === "entree" ? "#000" : "var(--good)", background: sens === "entree" ? "var(--good)" : "transparent", borderColor: "color-mix(in srgb,var(--good) 45%,var(--border))" }}><ArrowDownRight className="h-3.5 w-3.5" /> Recette</button>
          <button onClick={() => setSens("sortie")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.8rem] font-semibold" style={{ color: sens === "sortie" ? "#fff" : "var(--oxblood)", background: sens === "sortie" ? "var(--oxblood)" : "transparent", borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))" }}><ArrowUpRight className="h-3.5 w-3.5" /> Dépense</button>
        </div>
        {sens === "sortie" ? (
          <div>
            <div className="mb-1 text-[0.68rem] uppercase tracking-[0.06em] text-faint">Nature de la dépense</div>
            <div className="flex gap-2">
              <button onClick={() => setNature("produit")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold" style={{ color: nature === "produit" ? "#000" : "var(--accent)", background: nature === "produit" ? "var(--accent)" : "transparent", borderColor: "color-mix(in srgb,var(--accent) 45%,var(--border))" }}><ClipboardList className="h-3.5 w-3.5" /> Produit (stock)</button>
              <button onClick={() => setNature("charge")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold" style={{ color: nature === "charge" ? "#fff" : "var(--oxblood)", background: nature === "charge" ? "var(--oxblood)" : "transparent", borderColor: "color-mix(in srgb,var(--oxblood) 45%,var(--border))" }}><Wallet className="h-3.5 w-3.5" /> Charge (frais)</button>
              <button onClick={() => setNature("capital")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold" style={{ color: nature === "capital" ? "#000" : "var(--steel)", background: nature === "capital" ? "var(--steel)" : "transparent", borderColor: "color-mix(in srgb,var(--steel) 45%,var(--border))" }}><Landmark className="h-3.5 w-3.5" /> Capital (retrait)</button>
            </div>
            <p className="mt-1 text-[0.68rem] text-faint">Produit = achat qui entre en stock (armes, matières, ressources). Charge = frais (réparation, loyer, salaires…). Capital = retrait de trésorerie (hors résultat, sort juste du coffre).</p>
          </div>
        ) : (
          <div>
            <div className="mb-1 text-[0.68rem] uppercase tracking-[0.06em] text-faint">Type d&apos;entrée</div>
            <div className="flex gap-2">
              <button onClick={() => setNature("produit")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold" style={{ color: nature !== "capital" ? "#000" : "var(--good)", background: nature !== "capital" ? "var(--good)" : "transparent", borderColor: "color-mix(in srgb,var(--good) 45%,var(--border))" }}><ArrowDownRight className="h-3.5 w-3.5" /> Recette (vente)</button>
              <button onClick={() => setNature("capital")} className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[0.78rem] font-semibold" style={{ color: nature === "capital" ? "#000" : "var(--steel)", background: nature === "capital" ? "var(--steel)" : "transparent", borderColor: "color-mix(in srgb,var(--steel) 45%,var(--border))" }}><Landmark className="h-3.5 w-3.5" /> Apport de capital</button>
            </div>
            <p className="mt-1 text-[0.68rem] text-faint">Recette = vente / prestation (compte dans le chiffre d&apos;affaires). Apport de capital = argent injecté dans le coffre (hors résultat).</p>
          </div>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Montant ($)"><input className={inputCls} type="number" min={0} step="0.01" value={montant} onChange={(e) => setMontant(e.target.value)} autoFocus /></Champ>
          <Champ label="Libellé"><input className={inputCls} value={motif} onChange={(e) => setMotif(e.target.value)} placeholder="Réassort poudre, réparation…" maxLength={200} /></Champ>
        </div>
        <p className="text-[0.74rem] text-faint">L&apos;écriture met à jour le coffre de l&apos;armurerie.</p>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={valider} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: sens === "entree" ? "var(--good)" : "var(--oxblood)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Enregistrer</button>
        </div>
      </div>
    </Modal>
  );
}
// Graphique d'évolution des comptes : recettes & dépenses cumulées sur la période.
type PtC = { t: number; rec: number; dep: number; net: number };
const dJour = (t: number) => { try { return new Date(t).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" }); } catch { return ""; } };
const dHeure = (t: number) => { try { return new Date(t).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" }); } catch { return ""; } };
function niceMax(v: number) { if (v <= 0) return 1; const pow = Math.pow(10, Math.floor(Math.log10(v))); const n = v / pow; const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10; return step * pow; }
function ComptaChart({ mouvements }: { mouvements: ArmMouvement[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const points = useMemo<PtC[]>(() => {
    // Cumul mouvement par mouvement (chronologique) : le graphe s'affiche dès le
    // 1er mouvement, même sur une seule journée. On préfixe un point d'origine à 0.
    const sorted = mouvements.filter((m) => m.createdAt).slice().sort((a, b) => new Date(a.createdAt!).getTime() - new Date(b.createdAt!).getTime());
    if (!sorted.length) return [];
    const pts: PtC[] = [{ t: new Date(sorted[0].createdAt!).getTime(), rec: 0, dep: 0, net: 0 }];
    let cr = 0, cd = 0, solde = 0;
    for (const m of sorted) {
      // Recettes / dépenses = exploitation (hors capital) ; le solde suit TOUS les
      // mouvements (capital compris) → la courbe « Solde » = trajectoire du coffre.
      const cap = m.nature === "capital";
      if (m.sens === "entree") { solde = round2(solde + m.montant); if (!cap) cr = round2(cr + m.montant); }
      else { solde = round2(solde - m.montant); if (!cap) cd = round2(cd + m.montant); }
      pts.push({ t: new Date(m.createdAt!).getTime(), rec: cr, dep: cd, net: solde });
    }
    return pts;
  }, [mouvements]);

  if (points.length < 2) return null;
  const W = 760, H = 240, PL = 54, PR = 58, PT = 16, PB = 26;
  const pw = W - PL - PR, ph = H - PT - PB;
  const n = points.length;
  const rawMax = Math.max(...points.flatMap((p) => [p.rec, p.dep, p.net]), 1);
  const rawMin = Math.min(...points.flatMap((p) => [p.rec, p.dep, p.net]), 0);
  const ymax = niceMax(rawMax);
  const ymin = rawMin < 0 ? -niceMax(-rawMin) : 0;
  const span = ymax - ymin || 1;
  const x = (i: number) => PL + (n === 1 ? pw / 2 : (i / (n - 1)) * pw);
  const y = (v: number) => PT + (1 - (v - ymin) / span) * ph;
  const path = (sel: (p: PtC) => number) => points.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(sel(p)).toFixed(1)}`).join(" ");
  const recPath = path((p) => p.rec);
  const depPath = path((p) => p.dep);
  const netPath = path((p) => p.net);
  const areaPath = `${recPath} L${x(n - 1).toFixed(1)},${y(0).toFixed(1)} L${x(0).toFixed(1)},${y(0).toFixed(1)} Z`;
  const last = points[n - 1];
  const hp = hover != null ? points[hover] : null;

  return (
    <div className="relative mb-3 rounded-[12px] border border-border bg-surface-2 p-3">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <div className="text-[0.72rem] font-semibold uppercase tracking-[0.06em] text-muted">Évolution des comptes (cumul sur la période)</div>
        <div className="flex items-center gap-3 text-[0.68rem] text-faint">
          <span className="inline-flex items-center gap-1"><span className="inline-block h-1.5 w-3 rounded-sm" style={{ background: "var(--good)" }} /> Recettes</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-3 border-t-2 border-dashed" style={{ borderColor: "var(--oxblood)" }} /> Dépenses</span>
          <span className="inline-flex items-center gap-1"><span className="inline-block h-0 w-3 border-t-2 border-dotted" style={{ borderColor: "var(--accent)" }} /> Solde coffre</span>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full select-none" style={{ height: "auto" }}
        onMouseMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); const vbX = ((e.clientX - rect.left) / rect.width) * W; const i = Math.round(((vbX - PL) / pw) * (n - 1)); setHover(Math.max(0, Math.min(n - 1, i))); }}
        onMouseLeave={() => setHover(null)}>
        {[0, 0.25, 0.5, 0.75, 1].map((g) => { const yy = PT + g * ph; return (
          <g key={g}>
            <line x1={PL} y1={yy} x2={W - PR} y2={yy} stroke="var(--border)" strokeWidth={1} />
            <text x={PL - 6} y={yy + 3} textAnchor="end" fontSize={9} fill="var(--faint)">{cents(ymax - g * span)}$</text>
          </g>
        ); })}
        {ymin < 0 ? <line x1={PL} y1={y(0)} x2={W - PR} y2={y(0)} stroke="var(--muted)" strokeWidth={1} opacity={0.55} /> : null}
        <path d={areaPath} fill="var(--good)" opacity={0.1} />
        <path d={recPath} fill="none" stroke="var(--good)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={depPath} fill="none" stroke="var(--oxblood)" strokeWidth={2} strokeDasharray="5 3" strokeLinejoin="round" strokeLinecap="round" />
        <path d={netPath} fill="none" stroke="var(--accent)" strokeWidth={2} strokeDasharray="1.5 3.5" strokeLinejoin="round" strokeLinecap="round" />
        <circle cx={x(n - 1)} cy={y(last.rec)} r={2.6} fill="var(--good)" />
        <circle cx={x(n - 1)} cy={y(last.dep)} r={2.6} fill="var(--oxblood)" />
        <circle cx={x(n - 1)} cy={y(last.net)} r={2.6} fill="var(--accent)" />
        <text x={W - PR + 4} y={y(last.rec) + 3} fontSize={9} fill="var(--good)" className="font-semibold">{cents(last.rec)}</text>
        <text x={W - PR + 4} y={y(last.dep) + 3} fontSize={9} fill="var(--oxblood)" className="font-semibold">{cents(last.dep)}</text>
        <text x={PL} y={H - 7} textAnchor="start" fontSize={9} fill="var(--faint)">{dJour(points[0].t)}</text>
        <text x={W - PR} y={H - 7} textAnchor="end" fontSize={9} fill="var(--faint)">{dJour(last.t)}</text>
        {hp ? (
          <g>
            <line x1={x(hover!)} y1={PT} x2={x(hover!)} y2={PT + ph} stroke="var(--muted)" strokeWidth={1} opacity={0.5} />
            <circle cx={x(hover!)} cy={y(hp.rec)} r={3.5} fill="var(--good)" stroke="var(--surface-2)" strokeWidth={1.5} />
            <circle cx={x(hover!)} cy={y(hp.dep)} r={3.5} fill="var(--oxblood)" stroke="var(--surface-2)" strokeWidth={1.5} />
            <circle cx={x(hover!)} cy={y(hp.net)} r={3.5} fill="var(--accent)" stroke="var(--surface-2)" strokeWidth={1.5} />
          </g>
        ) : null}
      </svg>
      {hp ? (
        <div className="pointer-events-none absolute z-10 rounded-lg border border-border bg-surface px-2 py-1 text-[0.68rem] shadow-lg" style={{ left: `${(x(hover!) / W) * 100}%`, top: 30, transform: `translateX(${hover! > n / 2 ? "-105%" : "5%"})` }}>
          <div className="mb-0.5 font-semibold text-muted">{dJour(hp.t)} · {dHeure(hp.t)}</div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: "var(--good)" }}>Recettes</span><span className="font-num">{money(hp.rec)}</span></div>
          <div className="flex items-center justify-between gap-3"><span style={{ color: "var(--oxblood)" }}>Dépenses</span><span className="font-num">{money(hp.dep)}</span></div>
          <div className="mt-0.5 flex items-center justify-between gap-3 border-t border-border pt-0.5"><span className="font-semibold">Solde coffre</span><span className="font-num font-semibold" style={{ color: hp.net >= 0 ? "var(--good)" : "var(--oxblood)" }}>{money(hp.net)}</span></div>
        </div>
      ) : null}
    </div>
  );
}

// ═══════════════════ PAIES ═══════════════════
export function PaiesTab({ paies, employes, ventes, router }: { paies: ArmPaie[]; employes: ArmEmploye[]; ventes: ArmVente[]; router: Router }) {
  const [nouveau, setNouveau] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const dues = paies.filter((p) => p.statut !== "paye");
  const totalDu = dues.reduce((s, p) => s + p.montant, 0);
  const totalVerse = paies.filter((p) => p.statut === "paye").reduce((s, p) => s + p.montant, 0);

  async function payer(p: ArmPaie) { setBusy(p.id); const r = await payerPaie(p.id); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Versement impossible — réessaie."); }
  async function suppr(p: ArmPaie) { setBusy(p.id); const r = await supprimerPaie(p.id); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Suppression impossible — réessaie."); }

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="À verser" value={money(totalDu)} tone="var(--warn)" icon={Clock} />
        <Stat label="Déjà versé" value={money(totalVerse)} tone="var(--good)" icon={Check} />
        <Stat label="Fiches" value={String(paies.length)} tone="var(--steel)" icon={BadgeDollarSign} />
      </div>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">Commission sur les ventes + salaire fixe + prime. Le versement débite le coffre.</p>
        <Btn onClick={() => setNouveau(true)} disabled={employes.length === 0}><Plus className="h-3.5 w-3.5" /> Nouvelle paie</Btn>
      </TopBar>
      {employes.length === 0 ? (
        <Vide icon={BadgeDollarSign} texte="Ajoute des employés pour établir les fiches de paie (commission automatique sur leurs ventes)." />
      ) : paies.length === 0 ? (
        <Vide icon={BadgeDollarSign} texte="Aucune fiche de paie. Crée-en une : la commission est calculée sur les ventes de l'employé." />
      ) : (
        <div className="flex flex-col gap-2">
          {paies.map((p) => (
            <div key={p.id} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[0.88rem] font-semibold">{p.employeNom} {p.periode ? <span className="text-[0.74rem] font-normal text-faint">· {p.periode}</span> : null}</div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">Commission {money(p.commission)} · Fixe {money(p.base)}{p.prime ? ` · Prime ${money(p.prime)}` : ""}</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-num text-[1.05rem] font-bold" style={{ color: "var(--accent)" }}>{money(p.montant)}</span>
                  {p.statut === "paye" ? <Badge tone="good">Versée</Badge> : <Badge tone="warn">À verser</Badge>}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                {p.statut !== "paye" ? (
                  <button onClick={() => payer(p)} disabled={busy === p.id} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{busy === p.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Wallet className="h-3.5 w-3.5" />} Verser {money(p.montant)}</button>
                ) : <span className="text-[0.74rem] text-faint">Versée le {dateFR(p.payeAt)}</span>}
                <button onClick={() => suppr(p)} disabled={busy === p.id} className="ml-auto inline-flex items-center gap-1.5 text-[0.74rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {nouveau ? <PaieModal employes={employes} ventes={ventes} onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}
function PaieModal({ employes, ventes, onClose, router }: { employes: ArmEmploye[]; ventes: ArmVente[]; onClose: () => void; router: Router }) {
  const [employeId, setEmployeId] = useState(employes[0]?.id || "");
  const [periode, setPeriode] = useState("");
  const [prime, setPrime] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const emp = employes.find((e) => e.id === employeId);
  const caEmploye = useMemo(() => emp ? ventes.filter((v) => (v.vendeur || "").toLowerCase() === emp.nom.toLowerCase()).reduce((s, v) => s + v.prix, 0) : 0, [emp, ventes]);
  const commission = emp ? Math.round((caEmploye * emp.commission) / 100) : 0;
  const base = emp?.salaireBase || 0;
  const montant = commission + base + (Number(prime) || 0);

  async function creer() {
    setErr(null);
    if (!emp) { setErr("Choisis un employé."); return; }
    setBusy(true);
    const r = await creerPaie({ employeId: emp.id, employeNom: emp.nom, periode, ventes: caEmploye, commission, base, prime: Number(prime) || 0, notes });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  return (
    <Modal titre="💵 Nouvelle fiche de paie" onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Employé</span>
          <select className={inputCls} value={employeId} onChange={(e) => setEmployeId(e.target.value)}>{employes.map((e) => <option key={e.id} value={e.id}>{e.nom} · {e.commission}% · fixe {e.salaireBase}$</option>)}</select>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Période"><input className={inputCls} value={periode} onChange={(e) => setPeriode(e.target.value)} placeholder="Ex : 1–15 juillet" maxLength={80} /></Champ>
          <Champ label="Prime ($)"><input className={inputCls} type="number" min={0} step="0.01" value={prime} onChange={(e) => setPrime(e.target.value)} /></Champ>
        </div>
        <div className="rounded-[10px] border border-border bg-surface-2 p-3 text-[0.82rem]">
          <div className="flex justify-between text-faint"><span>Ventes rattachées ({emp?.nom || "—"})</span><span className="font-num">{money(caEmploye)}</span></div>
          <div className="flex justify-between"><span className="text-faint">Commission ({emp?.commission || 0}%)</span><span className="font-num">{money(commission)}</span></div>
          <div className="flex justify-between"><span className="text-faint">Salaire fixe</span><span className="font-num">{money(base)}</span></div>
          <div className="flex justify-between"><span className="text-faint">Prime</span><span className="font-num">{money(Number(prime) || 0)}</span></div>
          <div className="mt-1 flex justify-between border-t border-border pt-1 font-semibold"><span>Total à verser</span><span className="font-num" style={{ color: "var(--accent)" }}>{money(montant)}</span></div>
        </div>
        <Champ label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="flex justify-end">
          <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Établir la fiche</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ IMPÔTS ═══════════════════
export function ImpotsTab({ impots, ca, router }: { impots: ArmImpot[]; ca: number; router: Router }) {
  const [nouveau, setNouveau] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const du = impots.filter((i) => i.statut !== "paye").reduce((s, i) => s + i.montant, 0);
  const paye = impots.filter((i) => i.statut === "paye").reduce((s, i) => s + i.montant, 0);

  async function payer(i: ArmImpot) { setBusy(i.id); const r = await payerImpot(i.id); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Règlement impossible — réessaie."); }
  async function suppr(i: ArmImpot) { setBusy(i.id); const r = await supprimerImpot(i.id); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Suppression impossible — réessaie."); }

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="Impôts dus" value={money(du)} tone="var(--warn)" icon={Clock} />
        <Stat label="Déjà réglés" value={money(paye)} tone="var(--good)" icon={Check} />
        <Stat label="Déclarations" value={String(impots.length)} tone="var(--steel)" icon={Landmark} />
      </div>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">Cycle fiscal de 15 jours : chiffre d&apos;affaires × taux. Le règlement débite le coffre.</p>
        <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Nouvelle déclaration</Btn>
      </TopBar>
      {impots.length === 0 ? (
        <Vide icon={Landmark} texte="Aucune déclaration. Ouvre un cycle fiscal : indique la période et le taux, le montant se calcule sur ton chiffre d'affaires." />
      ) : (
        <div className="flex flex-col gap-2">
          {impots.map((i) => (
            <div key={i.id} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3">
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <div className="truncate text-[0.88rem] font-semibold">{i.libelle || "Cycle fiscal"}{i.debut || i.fin ? <span className="text-[0.74rem] font-normal text-faint"> · {[i.debut, i.fin].filter(Boolean).join(" → ")}</span> : null}</div>
                  <div className="mt-0.5 text-[0.72rem] text-faint">CA {money(i.chiffreAffaires)} × {i.taux}%</div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="font-num text-[1.05rem] font-bold" style={{ color: "var(--accent)" }}>{money(i.montant)}</span>
                  {i.statut === "paye" ? <Badge tone="good">Réglé</Badge> : <Badge tone="warn">Dû</Badge>}
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2 border-t border-border pt-2">
                {i.statut !== "paye" ? (
                  <button onClick={() => payer(i)} disabled={busy === i.id} className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-[0.78rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--good)" }}>{busy === i.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Landmark className="h-3.5 w-3.5" />} Régler {money(i.montant)}</button>
                ) : <span className="text-[0.74rem] text-faint">Réglé le {dateFR(i.payeAt)}</span>}
                <button onClick={() => suppr(i)} disabled={busy === i.id} className="ml-auto inline-flex items-center gap-1.5 text-[0.74rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {nouveau ? <ImpotModal ca={ca} onClose={() => setNouveau(false)} router={router} /> : null}
    </>
  );
}
function ImpotModal({ ca, onClose, router }: { ca: number; onClose: () => void; router: Router }) {
  const [libelle, setLibelle] = useState("");
  const [debut, setDebut] = useState("");
  const [fin, setFin] = useState("");
  const [chiffre, setChiffre] = useState(String(ca || ""));
  const [taux, setTaux] = useState("10");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const montant = Math.round(((Number(chiffre) || 0) * (Number(taux) || 0)) / 100);

  async function creer() {
    setErr(null);
    setBusy(true);
    const r = await creerImpot({ libelle, debut, fin, chiffreAffaires: Number(chiffre) || 0, taux: Number(taux) || 0, notes });
    setBusy(false);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  return (
    <Modal titre="🏛️ Nouvelle déclaration fiscale" onClose={onClose} max={520}>
      <div className="flex flex-col gap-3">
        <Champ label="Libellé"><input className={inputCls} value={libelle} onChange={(e) => setLibelle(e.target.value)} placeholder="Ex : Cycle du 1er au 15 juillet" maxLength={80} /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Début de cycle"><input className={inputCls} value={debut} onChange={(e) => setDebut(e.target.value)} placeholder="01/07" maxLength={40} /></Champ>
          <Champ label="Fin de cycle"><input className={inputCls} value={fin} onChange={(e) => setFin(e.target.value)} placeholder="15/07" maxLength={40} /></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Chiffre d'affaires ($)"><input className={inputCls} type="number" min={0} step="0.01" value={chiffre} onChange={(e) => setChiffre(e.target.value)} /></Champ>
          <Champ label="Taux d'imposition (%)"><input className={inputCls} type="number" min={0} max={100} value={taux} onChange={(e) => setTaux(e.target.value)} /></Champ>
        </div>
        <button onClick={() => setChiffre(String(ca || 0))} className="self-start text-[0.74rem] text-faint underline hover:text-ink">Utiliser le CA total ({money(ca)})</button>
        <div className="rounded-[10px] border border-border bg-surface-2 p-3 text-[0.84rem]"><div className="flex justify-between font-semibold"><span>Impôt à régler</span><span className="font-num" style={{ color: "var(--accent)" }}>{money(montant)}</span></div></div>
        <Champ label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={500} /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="flex justify-end">
          <button onClick={creer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} Ouvrir le cycle</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ BLOC-NOTES ═══════════════════
export function BlocNotesTab({ notes, router }: { notes: ArmNote[]; router: Router }) {
  const [sel, setSel] = useState<ArmNote | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const tri = [...notes].sort((a, b) => (b.epingle ? 1 : 0) - (a.epingle ? 1 : 0));

  async function epingler(n: ArmNote) { setBusy(n.id); const r = await majNote(n.id, { epingle: !n.epingle }); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Action impossible — réessaie."); }

  return (
    <>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">Mémos partagés de l&apos;atelier — épingle les plus importants.</p>
        <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Nouvelle note</Btn>
      </TopBar>
      {notes.length === 0 ? (
        <Vide icon={StickyNote} texte="Aucune note. Ajoute un mémo : consignes, tarifs spéciaux, réassorts à prévoir…" />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {tri.map((n) => (
            <div key={n.id} className="flex flex-col rounded-[12px] border px-3.5 py-3" style={{ borderColor: n.epingle ? "color-mix(in srgb,var(--brass) 45%,var(--border))" : "var(--border)", background: n.epingle ? "color-mix(in srgb,var(--brass) 8%,var(--surface-2))" : "var(--surface-2)" }}>
              <div className="flex items-start justify-between gap-2">
                <button onClick={() => setSel(n)} className="min-w-0 flex-1 text-left">
                  {n.titre ? <div className="truncate text-[0.86rem] font-semibold">{n.titre}</div> : null}
                  <p className="mt-0.5 line-clamp-4 whitespace-pre-wrap text-[0.8rem] text-muted">{n.contenu}</p>
                </button>
                <button onClick={() => epingler(n)} disabled={busy === n.id} className="shrink-0 text-faint hover:text-ink" title={n.epingle ? "Détacher" : "Épingler"}>{n.epingle ? <Pin className="h-4 w-4" style={{ color: "var(--brass)" }} /> : <PinOff className="h-4 w-4" />}</button>
              </div>
              <div className="mt-2 flex items-center justify-between border-t border-border pt-1.5 text-[0.68rem] text-faint">
                <span>{n.auteur || "Équipe"} · {dateFR(n.updatedAt || n.createdAt)}</span>
                <button onClick={() => setSel(n)} className="inline-flex items-center gap-1 hover:text-ink"><Pencil className="h-3 w-3" /> Éditer</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {nouveau ? <NoteModal onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <NoteModal key={sel.id} note={sel} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}
function NoteModal({ note, onClose, router }: { note?: ArmNote; onClose: () => void; router: Router }) {
  const editing = !!note;
  const [titre, setTitre] = useState(note?.titre || "");
  const [contenu, setContenu] = useState(note?.contenu || "");
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function enregistrer() {
    setErr(null);
    if (contenu.trim().length < 1) { setErr("Écris le contenu."); return; }
    setBusy("save");
    const r = editing ? await majNote(note!.id, { titre, contenu }) : await creerNote({ titre, contenu });
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function supprimer() { setBusy("del"); const r = await supprimerNote(note!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }

  return (
    <Modal titre={editing ? "📝 Note" : "📝 Nouvelle note"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <Champ label="Titre (optionnel)"><input className={inputCls} value={titre} onChange={(e) => setTitre(e.target.value)} maxLength={120} /></Champ>
        <Champ label="Contenu *"><textarea className={inputCls + " min-h-[140px] resize-y"} value={contenu} onChange={(e) => setContenu(e.target.value)} maxLength={4000} autoFocus /></Champ>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
          ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ TÂCHES ═══════════════════
export function TachesTab({ taches, router }: { taches: ArmTache[]; router: Router }) {
  const [texte, setTexte] = useState("");
  const [assigne, setAssigne] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const aFaire = taches.filter((t) => !t.fait);
  const faites = taches.filter((t) => t.fait);

  async function ajouter() { if (texte.trim().length < 1) return; setBusy("add"); const r = await creerTache({ texte, assigneA: assigne }); setBusy(null); if (r.ok) { setTexte(""); setAssigne(""); router.refresh(); } else alert(r.error || "Ajout impossible — réessaie."); }
  async function basculer(t: ArmTache) { setBusy(t.id); const r = await basculerTache(t.id, !t.fait); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Action impossible — réessaie."); }
  async function suppr(t: ArmTache) { setBusy(t.id); const r = await supprimerTache(t.id); setBusy(null); if (r.ok) router.refresh(); else alert(r.error || "Action impossible — réessaie."); }

  const Ligne = (t: ArmTache) => (
    <div key={t.id} className="flex items-center gap-2.5 rounded-[8px] border border-border bg-surface-2 px-3 py-2 text-[0.84rem]">
      <button onClick={() => basculer(t)} disabled={busy === t.id} className="grid h-5 w-5 shrink-0 place-items-center rounded border" style={{ borderColor: t.fait ? "var(--good)" : "var(--border)", background: t.fait ? "var(--good)" : "transparent" }}>{t.fait ? <Check className="h-3.5 w-3.5 text-black/85" /> : null}</button>
      <span className={`min-w-0 flex-1 truncate ${t.fait ? "text-faint line-through" : ""}`}>{t.texte}</span>
      {t.assigneA ? <span className="shrink-0 rounded-full border border-border px-2 py-0.5 text-[0.68rem] text-muted">{t.assigneA}</span> : null}
      <button onClick={() => suppr(t)} disabled={busy === t.id} className="shrink-0 text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /></button>
    </div>
  );

  return (
    <>
      <div className="mb-3 flex flex-col gap-2 rounded-[12px] border border-border bg-surface-2 p-3 sm:flex-row">
        <input className={inputCls + " flex-1"} value={texte} onChange={(e) => setTexte(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") ajouter(); }} placeholder="Nouvelle tâche — ex : réassort munitions de fusil" maxLength={300} />
        <input className={inputCls + " sm:w-40"} value={assigne} onChange={(e) => setAssigne(e.target.value)} placeholder="Assignée à…" maxLength={120} />
        <button onClick={ajouter} disabled={busy === "add" || texte.trim().length < 1} className="inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "add" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />} Ajouter</button>
      </div>
      {taches.length === 0 ? (
        <Vide icon={ListTodo} texte="Aucune tâche. Note ce qu'il y a à faire à l'atelier — réassorts, réparations, commandes clients…" />
      ) : (
        <div className="flex flex-col gap-3">
          {aFaire.length ? <div className="flex flex-col gap-1.5">{aFaire.map(Ligne)}</div> : null}
          {faites.length ? (<div><div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-faint">Terminées ({faites.length})</div><div className="flex flex-col gap-1.5">{faites.map(Ligne)}</div></div>) : null}
        </div>
      )}
    </>
  );
}

// ═══════════════════ RESSOURCES (achat à la mine) ═══════════════════
// ── Scanner de coffre (photo → IA → stock) ──
const _normR = (x: string) => String(x).toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, " ").trim();
const _STOPR = new Set(["de", "du", "des", "d", "l", "la", "le", "les", "a", "au", "aux", "en", "pour"]);
const _toksR = (x: string) => _normR(x).split(" ").filter((t) => t && !_STOPR.has(t));
// Associe un nom détecté à UNE ressource existante (sinon "" → à créer). Même logique
// prudente que la fabrication : match exact, sinon sous-ensemble de tokens unique.
function _matchRessource(nom: string, ressources: ArmRessource[]): string {
  const n = _normR(nom);
  const exact = ressources.find((r) => _normR(r.nom) === n);
  if (exact) return exact.id;
  const it = _toksR(nom);
  if (!it.length) return "";
  const cand = ressources.filter((r) => { const rt = new Set(_toksR(r.nom)); return it.every((t) => rt.has(t)); });
  return cand.length === 1 ? cand[0].id : "";
}
// Catégorie proposée pour une ressource créée (organisation seulement ; prix reste 0).
function _guessCatRes(nom: string): string {
  const n = _normR(nom);
  if (/lingot|charbon|soufre|plomb|minerai|poudre|\bfer\b|cuivre|zinc/.test(n)) return "Minerais";
  if (/verre|laiton|acier|metal/.test(n)) return "Métaux & verre";
  if (/bois|planche|buche/.test(n)) return "Bois";
  if (/cuir|corde|tissu|coton|laine|peau/.test(n)) return "Textile";
  if (/arme|canon|crosse|barillet|gachette|carquois|arc/.test(n)) return "Composants";
  return "Divers";
}

type ScanRow = { nom: string; quantite: number; cible: string }; // cible: id ressource | "__new__" | "__skip__"
function ScanCoffreModal({ lignes, ressources, onClose, router }: { lignes: { nom: string; quantite: number }[]; ressources: ArmRessource[]; onClose: () => void; router: Router }) {
  const [mode, setMode] = useState<"add" | "set">("add");
  const [rows, setRows] = useState<ScanRow[]>(() => lignes.map((l) => ({ nom: l.nom, quantite: l.quantite, cible: _matchRessource(l.nom, ressources) || "__new__" })));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const byId = useMemo(() => new Map(ressources.map((r) => [r.id, r])), [ressources]);

  const set = (i: number, patch: Partial<ScanRow>) => setRows((rs) => rs.map((r, k) => (k === i ? { ...r, ...patch } : r)));
  const nbMaj = rows.filter((r) => r.cible && r.cible !== "__new__" && r.cible !== "__skip__").length;
  const nbNew = rows.filter((r) => r.cible === "__new__").length;

  // Aperçu du stock résultant pour une ligne (avant d'appliquer).
  function apercu(r: ScanRow): string {
    if (r.cible === "__skip__") return "ignoré";
    if (r.cible === "__new__") return `nouvelle · stock ${r.quantite}`;
    const cur = Number(byId.get(r.cible)?.stock) || 0;
    return mode === "add" ? `${cur} → ${cur + r.quantite}` : `${cur} → ${r.quantite}`;
  }

  async function appliquer() {
    setErr(null); setBusy(true);
    const items = rows.filter((r) => r.cible && r.cible !== "__new__" && r.cible !== "__skip__").map((r) => ({ id: r.cible, qte: r.quantite }));
    const nouvelles = rows.filter((r) => r.cible === "__new__").map((r) => ({ nom: r.nom, categorie: _guessCatRes(r.nom), qte: r.quantite }));
    if (!items.length && !nouvelles.length) { setBusy(false); setErr("Aucune ligne à appliquer."); return; }
    const res = await appliquerStockRessources({ mode, items, nouvelles });
    setBusy(false);
    if (!res.ok) { setErr(res.error || "Échec."); return; }
    router.refresh();
    onClose();
  }

  return (
    <Modal titre="📷 Stock lu depuis la photo" onClose={onClose} max={620}>
      <p className="mb-2 text-[0.76rem] text-faint">Vérifie ce que l&apos;IA a lu, corrige au besoin, puis applique. Les objets absents du catalogue seront créés (prix à définir).</p>
      <div className="mb-3 grid grid-cols-2 gap-2">
        <button onClick={() => setMode("add")} className="rounded-lg border px-2.5 py-2 text-left text-[0.76rem] transition" style={{ borderColor: mode === "add" ? "var(--accent)" : "var(--border)", background: mode === "add" ? "color-mix(in srgb,var(--accent) 10%,transparent)" : "var(--surface-2)" }}>
          <div className="font-semibold">➕ Ajouter (cumuler)</div>
          <div className="text-[0.66rem] text-faint">additionne plusieurs coffres</div>
        </button>
        <button onClick={() => setMode("set")} className="rounded-lg border px-2.5 py-2 text-left text-[0.76rem] transition" style={{ borderColor: mode === "set" ? "var(--accent)" : "var(--border)", background: mode === "set" ? "color-mix(in srgb,var(--accent) 10%,transparent)" : "var(--surface-2)" }}>
          <div className="font-semibold">🔄 Remplacer</div>
          <div className="text-[0.66rem] text-faint">la photo = le total actuel</div>
        </button>
      </div>
      <div className="flex max-h-[46vh] flex-col gap-1.5 overflow-y-auto pr-1">
        {rows.map((r, i) => {
          const inconnu = r.cible === "__new__";
          return (
            <div key={i} className="flex flex-col gap-1 rounded-lg border border-border bg-surface-2 p-2">
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-[0.82rem] font-medium">{r.nom}{inconnu ? <span className="ml-1 inline-flex items-center gap-0.5 text-[0.62rem]" style={{ color: "var(--brass)" }}><AlertTriangle className="h-3 w-3" /> nouvelle</span> : null}</span>
                <span className="text-[0.66rem] text-faint">×</span>
                <input type="number" min={0} value={r.quantite} onChange={(e) => set(i, { quantite: Math.max(0, Math.round(Number(e.target.value) || 0)) })} onFocus={(e) => e.currentTarget.select()} className={inputCls + " !w-16 !px-1.5 !py-0.5 text-right font-num !text-[0.8rem]"} />
              </div>
              <div className="flex items-center gap-2">
                <select value={r.cible} onChange={(e) => set(i, { cible: e.target.value })} className={inputCls + " !py-1 !text-[0.76rem]"}>
                  <option value="__new__">➕ Créer « {r.nom} »</option>
                  <option value="__skip__">Ignorer cette ligne</option>
                  <optgroup label="Ressource existante">
                    {ressources.map((rr) => <option key={rr.id} value={rr.id}>{rr.nom}</option>)}
                  </optgroup>
                </select>
                <span className="shrink-0 font-num text-[0.72rem]" style={{ color: r.cible === "__skip__" ? "var(--faint)" : "var(--good)" }}>{apercu(r)}</span>
              </div>
            </div>
          );
        })}
      </div>
      {err ? <div className="mt-2"><Flash tone="bad">{err}</Flash></div> : null}
      <div className="mt-3 flex items-center justify-between gap-2">
        <span className="text-[0.7rem] text-faint">{nbMaj} mise(s) à jour{nbNew ? ` · ${nbNew} création(s)` : ""}</span>
        <div className="flex gap-2">
          <button onClick={onClose} className="rounded-lg border border-border bg-surface-2 px-3.5 py-2 text-[0.82rem] font-semibold hover:border-border-2">Annuler</button>
          <button onClick={appliquer} disabled={busy} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--good)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Appliquer</button>
        </div>
      </div>
    </Modal>
  );
}

export function RessourcesTab({ ressources, router }: { ressources: ArmRessource[]; router: Router }) {
  const [q, setQ] = useState("");
  const [cart, setCart] = useState<Record<string, number>>({});
  const [pxEdit, setPxEdit] = useState<Record<string, string>>({}); // prix unitaire ajusté pour cet achat
  const [remise, setRemise] = useState("5");
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [modif, setModif] = useState<ArmRessource | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const [scan, setScan] = useState<{ nom: string; quantite: number }[] | null>(null); // « Vérifier d'abord » : ouvre le tableau
  const [scanBusy, setScanBusy] = useState(false);
  const [scanErr, setScanErr] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<"add" | "set" | "review">("add"); // par défaut : ajout automatique
  const [undo, setUndo] = useState<{ restore: { id: string; avant: number }[]; supprimer: string[]; resume: string } | null>(null);

  // Une ou PLUSIEURS photos de coffre → lecture IA → application AUTOMATIQUE (ajout par
  // défaut). Plusieurs photos se cumulent (les quantités d'une même ressource s'additionnent).
  // « Vérifier d'abord » ouvre le tableau de contrôle ; sinon on applique direct + Annuler.
  async function onScanMany(urls: string[]) {
    setScanErr(null); setUndo(null); setScanBusy(true);
    const raw: { nom: string; quantite: number }[] = [];
    let lus = 0;
    for (const url of urls) { const r = await lireCoffreRessources(url); if (r.ok && r.lignes?.length) { raw.push(...r.lignes); lus++; } }
    if (!raw.length) { setScanBusy(false); setScanErr(`Aucun objet détecté sur ${urls.length > 1 ? "les captures" : "la capture"}.`); return; }
    // Cumul par nom (une même ressource vue sur plusieurs photos → quantités additionnées).
    const parNom = new Map<string, { nom: string; quantite: number }>();
    for (const l of raw) { const k = l.nom.trim().toLowerCase(); const cur = parNom.get(k) || { nom: l.nom, quantite: 0 }; cur.quantite += l.quantite; parNom.set(k, cur); }
    const agg = [...parNom.values()];
    if (scanMode === "review") { setScanBusy(false); setScan(agg); return; }
    const items: { id: string; qte: number }[] = [];
    const nouvelles: { nom: string; categorie: string; qte: number }[] = [];
    for (const l of agg) {
      const id = _matchRessource(l.nom, ressources);
      if (id) items.push({ id, qte: l.quantite });
      else nouvelles.push({ nom: l.nom, categorie: _guessCatRes(l.nom), qte: l.quantite });
    }
    const res = await appliquerStockRessources({ mode: scanMode, items, nouvelles });
    setScanBusy(false);
    if (!res.ok) { setScanErr(res.error || "Application impossible."); return; }
    const sg = scanMode === "add" ? "+" : "=";
    const resume = agg.map((l) => `${l.nom} ${sg}${l.quantite}`).join(" · ");
    setUndo({ restore: res.applied || [], supprimer: res.creesIds || [], resume: (lus > 1 ? `${lus} photos · ` : "") + resume });
    router.refresh();
  }
  async function annulerScan() {
    if (!undo) return;
    setScanBusy(true);
    const r = await annulerStockRessources({ restore: undo.restore, supprimer: undo.supprimer });
    setScanBusy(false);
    if (!r.ok) { setScanErr(r.error || "Annulation impossible."); return; }
    setUndo(null); router.refresh();
  }

  const byId = new Map(ressources.map((r) => [r.id, r]));
  const filtres = ressources.filter((r) => r.nom.toLowerCase().includes(q.trim().toLowerCase()));
  const cats = [...new Set(filtres.map((r) => r.categorie))];
  const lignes = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ r: byId.get(id)!, n })).filter((l) => l.r);
  const pu = (r: ArmRessource) => { const v = pxEdit[r.id]; return v === undefined ? r.prix : Math.max(0, Math.round((Number(v) || 0) * 100) / 100); };
  const brut = lignes.reduce((s, l) => s + pu(l.r) * l.n, 0);
  const brutMine = lignes.filter((l) => l.r.mine).reduce((s, l) => s + pu(l.r) * l.n, 0); // seules les ressources de la mine ont la remise
  const pct = Math.max(0, Math.min(100, Number(remise) || 0));
  const remiseM = Math.round(brutMine * pct) / 100;
  const net = Math.round((brut - remiseM) * 100) / 100;

  const add = (id: string) => setCart((c) => ({ ...c, [id]: (c[id] || 0) + 1 }));
  const sub = (id: string) => setCart((c) => ({ ...c, [id]: Math.max(0, (c[id] || 0) - 1) }));
  const setQte = (id: string, v: number) => setCart((c) => ({ ...c, [id]: Math.max(0, Math.round(v) || 0) }));

  async function importer() { setBusy(true); const r = await importerRessources(); setBusy(false); if (r.ok) { setFlash(r.n ? `${r.n} ressource(s) ajoutée(s).` : "Ressources déjà à jour."); router.refresh(); } else setFlash(r.error || "Échec."); }
  async function majPrix(r: ArmRessource, prix: number) {
    if (prix === r.prix) return;
    const res = await majRessource(r.id, { prix });
    if (!res.ok) { setFlash(res.error || "Échec."); return; }
    router.refresh();
  }
  async function regler() {
    if (!lignes.length) return;
    setBusy(true);
    const payload: LigneRessource[] = lignes.map((l) => ({ id: l.r.id, nom: l.r.nom, qte: l.n, prix: pu(l.r), mine: l.r.mine }));
    const r = await acheterRessources(payload, pct);
    setBusy(false);
    if (!r.ok) { setFlash(r.error || "Échec."); return; }
    setCart({}); setPxEdit({});
    setFlash(`Payé à la mine : ${money(r.net ?? net)} (remise ${pct}% = −${money(r.remise ?? remiseM)}) → débité du coffre + dépense en comptabilité.`);
    router.refresh();
  }

  if (ressources.length === 0) {
    return (
      <>
        <div className="mb-3 flex justify-end"><Btn onClick={importer} disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Importer les ressources</Btn></div>
        {flash ? <div className="mb-3"><Flash>{flash}</Flash></div> : null}
        <Vide icon={Pickaxe} texte="Aucune ressource. Importe les matières nécessaires (charbon, lingots & verre, cordes, bois…) — catégorisées — ou ajoute les tiennes, puis calcule le coût d'un achat (remise mine 5 % applicable)." />
        {nouveau ? <RessourceModal onClose={() => setNouveau(false)} router={router} /> : null}
      </>
    );
  }

  return (
    <>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">Matières premières nécessaires (par catégorie). Clique une ressource pour calculer le coût d&apos;un achat — remise mine 5 % applicable.</p>
        <div className="flex gap-2">
          <Btn onClick={importer} tone="ghost" disabled={busy}>{busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />} Compléter</Btn>
          <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Ressource</Btn>
        </div>
      </TopBar>
      <div className="grid gap-4 lg:grid-cols-[1fr_300px]">
        {/* Grille des ressources par catégorie */}
        <div>
          {/* Scanner de coffre : photo → l'IA lit les quantités → stock réactualisé */}
          <div className="mb-3 rounded-[14px] border p-3.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 35%,var(--border))", background: "color-mix(in srgb,var(--accent) 5%,var(--surface-2))" }}>
            <div className="mb-1 flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em]" style={{ color: "var(--accent)" }}><ScanLine className="h-4 w-4" /> Réactualiser le stock par photo</div>
            <p className="mb-2 text-[0.72rem] text-faint">Glisse <b>une ou plusieurs</b> captures — un <b>coffre en jeu</b> (« x123 ») <b>ou le panneau de stock</b> (Reckless…, « Stock : 123 ») : l&apos;IA lit chaque matière et son stock, et met à jour <b>automatiquement</b>. Pour un total exact, choisis <b>🔄 Remplacer</b> ; pour cumuler plusieurs coffres, <b>➕ Ajouter</b>.</p>
            {/* Mode d'application de la photo */}
            <div className="mb-2 flex flex-wrap gap-1.5">
              {([["add", "➕ Ajouter (auto)"], ["set", "🔄 Remplacer"], ["review", "👁 Vérifier d'abord"]] as const).map(([k, label]) => (
                <button key={k} onClick={() => setScanMode(k)} className="rounded-lg border px-2 py-1 text-[0.7rem] font-semibold transition" style={{ borderColor: scanMode === k ? "var(--accent)" : "var(--border)", background: scanMode === k ? "color-mix(in srgb,var(--accent) 12%,transparent)" : "var(--surface-2)", color: scanMode === k ? "var(--accent)" : "var(--muted)" }}>{label}</button>
              ))}
            </div>
            <PhotoDrop dossier="armurerie-coffres" multiple onUploaded={(u) => onScanMany([u])} onManyUploaded={onScanMany} compact camera={false} label={scanMode === "review" ? "Glisse une ou plusieurs captures — tu vérifieras avant d'appliquer" : scanMode === "set" ? "Glisse une ou plusieurs captures — remplace le stock automatiquement" : "Glisse une ou plusieurs captures — ajoutées automatiquement au stock"} />
            {scanBusy ? <div className="mt-1.5 flex items-center gap-1.5 text-[0.72rem] text-faint"><Loader2 className="h-3 w-3 animate-spin" /> Lecture &amp; mise à jour…</div> : null}
            {scanErr ? <div className="mt-1.5 text-[0.72rem]" style={{ color: "var(--oxblood)" }}>{scanErr}</div> : null}
            {undo && !scanBusy ? (
              <div className="mt-2 flex items-start gap-2 rounded-lg border px-2.5 py-2 text-[0.72rem]" style={{ borderColor: "color-mix(in srgb,var(--good) 40%,var(--border))", background: "color-mix(in srgb,var(--good) 8%,transparent)" }}>
                <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--good)" }} />
                <div className="min-w-0 flex-1">
                  <div style={{ color: "var(--good)" }}>Stock mis à jour depuis la photo.</div>
                  <div className="truncate text-faint" title={undo.resume}>{undo.resume}</div>
                </div>
                <button onClick={annulerScan} className="shrink-0 rounded-md border border-border bg-surface px-2 py-1 font-semibold hover:border-border-2">Annuler</button>
                <button onClick={() => setUndo(null)} className="shrink-0 text-faint hover:text-ink" title="Fermer"><X className="h-3.5 w-3.5" /></button>
              </div>
            ) : null}
          </div>
          <div className="relative mb-3"><Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" /><input className={inputCls + " pl-8"} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Rechercher une ressource…" /></div>
          {cats.map((cat) => (
            <div key={cat} className="mb-3">
              <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.08em] text-faint">{cat}</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {filtres.filter((r) => r.categorie === cat).map((r) => (
                  <RessourceCard key={r.id + ":" + r.prix} r={r} auCalcul={cart[r.id] || 0} onAdd={() => add(r.id)} onEdit={() => setModif(r)} onPrix={(v) => majPrix(r, v)} />
                ))}
              </div>
            </div>
          ))}
        </div>
        {/* Panier / calcul */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <div className="rounded-[14px] border border-border bg-surface-2 p-3.5">
            <div className="mb-2 flex items-center gap-1.5 text-[0.8rem] font-semibold uppercase tracking-[0.05em] text-muted"><Pickaxe className="h-4 w-4" /> Coût des ressources</div>
            {flash ? <div className="mb-2"><Flash>{flash}</Flash></div> : null}
            {lignes.length === 0 ? <p className="py-4 text-center text-[0.8rem] text-faint">Clique une ressource pour la calculer.</p> : (
              <div className="mb-2 flex flex-col gap-1.5">
                {lignes.map((l) => (
                  <div key={l.r.id} className="flex flex-col gap-1 border-b border-border/60 pb-1.5">
                    <div className="flex items-center gap-1.5 text-[0.82rem]">
                      <span className="min-w-0 flex-1 truncate">{l.r.nom}</span>
                      <button onClick={() => sub(l.r.id)} className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border text-muted hover:text-ink"><Minus className="h-3 w-3" /></button>
                      <input className={inputCls + " !w-11 !px-1 !py-0.5 text-center"} type="number" min={0} value={l.n} onChange={(e) => setQte(l.r.id, Number(e.target.value))} />
                      <button onClick={() => add(l.r.id)} className="grid h-5 w-5 shrink-0 place-items-center rounded border border-border text-muted hover:text-ink"><Plus className="h-3 w-3" /></button>
                    </div>
                    <div className="flex items-center gap-1.5 text-[0.72rem] text-faint">
                      <span>Prix à l&apos;unité</span>
                      <input type="number" min={0} step="0.01" value={pxEdit[l.r.id] ?? String(l.r.prix)} onChange={(e) => setPxEdit((o) => ({ ...o, [l.r.id]: e.target.value }))} onFocus={(e) => e.currentTarget.select()} className={inputCls + " !w-16 !px-1.5 !py-0.5 text-right font-num !text-[0.76rem]"} title="Prix unitaire — modifiable pour cet achat" />
                      <span>$/u</span>
                      {pu(l.r) !== l.r.prix ? <span className="text-[0.62rem]" style={{ color: "var(--accent)" }}>(tarif {money(l.r.prix)})</span> : null}
                      <span className="ml-auto font-num text-[0.82rem] font-semibold text-ink">{money(pu(l.r) * l.n)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-col gap-1 border-t border-border pt-2 text-[0.84rem]">
              <div className="flex justify-between text-faint"><span>Total brut</span><span className="font-num">{money(brut)}</span></div>
              <div className="flex items-center justify-between text-faint"><span className="inline-flex items-center gap-1">⛏️ Remise mine <input className={inputCls + " !w-11 !px-1 !py-0.5 text-center"} type="number" min={0} max={100} value={remise} onChange={(e) => setRemise(e.target.value)} /> %</span><span className="font-num" style={{ color: "var(--good)" }}>−{money(remiseM)}</span></div>
              {brutMine > 0 ? <div className="flex justify-between text-[0.68rem] text-faint"><span>appliquée sur les ressources de la mine</span><span className="font-num">{money(brutMine)}</span></div> : null}
              <div className="flex justify-between"><span className="font-semibold">Net à payer</span><span className="font-num font-bold" style={{ color: "var(--accent)" }}>{money(net)}</span></div>
            </div>
            <button onClick={regler} disabled={busy || !lignes.length} className="mt-2.5 inline-flex w-full items-center justify-center gap-1.5 rounded-lg px-3 py-2.5 text-[0.86rem] font-semibold text-black/85 disabled:opacity-50" style={{ background: "var(--good)" }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Régler {money(net)}</button>
            <p className="mt-1 text-center text-[0.62rem] text-faint">Débité du coffre + inscrit en dépense (comptabilité).</p>
          </div>
        </div>
      </div>
      {nouveau ? <RessourceModal onClose={() => setNouveau(false)} router={router} /> : null}
      {modif ? <RessourceModal key={modif.id} ressource={modif} onClose={() => setModif(null)} router={router} /> : null}
      {scan ? <ScanCoffreModal lignes={scan} ressources={ressources} onClose={() => setScan(null)} router={router} /> : null}
    </>
  );
}
// Carte ressource : ajout au calcul (clic sur le nom) + prix unitaire modifiable en ligne.
function RessourceCard({ r, auCalcul, onAdd, onEdit, onPrix }: { r: ArmRessource; auCalcul: number; onAdd: () => void; onEdit: () => void; onPrix: (v: number) => Promise<void> }) {
  const [prix, setPrix] = useState(String(r.prix));
  const [saving, setSaving] = useState(false);
  async function save() {
    const v = Math.max(0, Math.round((Number(prix) || 0) * 100) / 100);
    if (v === r.prix) { setPrix(String(r.prix)); return; }
    setSaving(true);
    await onPrix(v);
    setSaving(false);
  }
  return (
    <div className="rounded-[10px] border border-border bg-surface-2 px-2.5 py-2">
      <button onClick={onAdd} className="block w-full text-left transition hover:-translate-y-0.5">
        <div className="flex items-center gap-1"><span className="min-w-0 truncate text-[0.8rem] font-semibold">{r.nom}</span>{r.mine ? <span title="De la mine — remise applicable" className="shrink-0 text-[0.66rem]">⛏️</span> : null}</div>
        <div className="mt-0.5 text-[0.62rem] text-faint">stock <b className="font-num" style={{ color: r.stock > 0 ? "var(--good)" : "var(--muted)" }}>{r.stock}</b>{auCalcul ? <span> · {auCalcul} au calcul</span> : null}</div>
      </button>
      <div className="mt-1 flex items-center gap-1">
        <input type="number" min={0} step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} onFocus={(e) => e.currentTarget.select()} onBlur={save} onKeyDown={(e) => { if (e.key === "Enter") (e.currentTarget as HTMLInputElement).blur(); }} className={inputCls + " !w-[4.4rem] !px-1.5 !py-0.5 font-num !text-[0.84rem] font-bold"} style={{ color: "var(--accent)" }} title="Prix unitaire — clique pour modifier" />
        <span className="text-[0.6rem] text-faint">$/u</span>
        {saving ? <Loader2 className="h-3 w-3 animate-spin text-faint" /> : null}
        <button onClick={onEdit} className="ml-auto text-faint hover:text-ink" title="Éditer (nom, catégorie, mine)"><Pencil className="h-3.5 w-3.5" /></button>
      </div>
    </div>
  );
}
function RessourceModal({ ressource, onClose, router }: { ressource?: ArmRessource; onClose: () => void; router: Router }) {
  const editing = !!ressource;
  const [nom, setNom] = useState(ressource?.nom || "");
  const [categorie, setCategorie] = useState(ressource?.categorie || "Divers");
  const [prix, setPrix] = useState(ressource ? String(ressource.prix) : "");
  const [stock, setStock] = useState(ressource ? String(ressource.stock) : "");
  const [mine, setMine] = useState(!!ressource?.mine);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  async function enregistrer() {
    setErr(null);
    if (nom.trim().length < 1) { setErr("Nom de la ressource requis."); return; }
    setBusy("save");
    const data = { nom, categorie, prix: Number(prix) || 0, stock: Number(stock) || 0, mine };
    const r = editing ? await majRessource(ressource!.id, data) : await creerRessource(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function supprimer() { setBusy("del"); const r = await supprimerRessource(ressource!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }

  return (
    <Modal titre={editing ? ressource!.nom : "⛏️ Nouvelle ressource"} onClose={onClose}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Nom *"><input className={inputCls} value={nom} onChange={(e) => setNom(e.target.value)} maxLength={120} autoFocus /></Champ>
          <Champ label="Catégorie"><input className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Bois, Métaux, Minerais…" maxLength={60} list="res-cats" /><datalist id="res-cats"><option value="Minerais" /><option value="Métaux & verre" /><option value="Bois" /><option value="Textile" /><option value="Composants" /><option value="Divers" /></datalist></Champ>
          <Champ label="Prix unitaire ($ / u)"><input className={inputCls} type="number" min={0} step="0.01" value={prix} onChange={(e) => setPrix(e.target.value)} /></Champ>
        </div>
        <Champ label="Stock (unités en réserve)"><input className={inputCls} type="number" min={0} value={stock} onChange={(e) => setStock(e.target.value)} placeholder="0" /></Champ>
        <label className="inline-flex items-center gap-2 text-[0.82rem]"><input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> ⛏️ Ressource de la mine (la remise de 5 % s&apos;applique dessus)</label>
        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)", color: "#fff" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
          ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Ajouter"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ CARNET DE COMMANDE ═══════════════════
const CMD_STATUTS = [
  { key: "en_attente", label: "En attente", tone: "warn" as const },
  { key: "prete", label: "Prête", tone: "accent" as const },
  { key: "livree", label: "Livrée", tone: "good" as const },
  { key: "annulee", label: "Annulée", tone: "muted" as const },
];
const cmdStatut = (s: string) => CMD_STATUTS.find((x) => x.key === s) || CMD_STATUTS[0];

export function CarnetCommandesTab({ commandes, produits, clients, router }: { commandes: ArmCommande[]; produits: ArmProduit[]; clients: { id: string; nom: string }[]; router: Router }) {
  const [sel, setSel] = useState<ArmCommande | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const enAttente = commandes.filter((c) => c.statut === "en_attente" || c.statut === "prete");
  const totalAttente = enAttente.reduce((s, c) => s + c.total, 0);
  const livrees = commandes.filter((c) => c.statut === "livree");

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="En cours" value={String(enAttente.length)} tone="var(--warn)" icon={ClipboardList} />
        <Stat label="Montant en cours" value={money(totalAttente)} tone="var(--accent)" icon={CircleDollarSign} />
        <Stat label="Livrées" value={String(livrees.length)} tone="var(--good)" icon={Check} />
      </div>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">Bons de commande client — objets, quantités, prix unitaire et total par pile.</p>
        <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Nouvelle commande</Btn>
      </TopBar>
      {commandes.length === 0 ? (
        <Vide icon={ClipboardList} texte="Aucune commande. Crée un bon de commande : catégorie, client, puis la liste des objets avec quantité et prix unitaire — le total se calcule tout seul." />
      ) : (
        <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
          {commandes.map((c) => {
            const st = cmdStatut(c.statut);
            const nbPieces = c.lignes.reduce((s, l) => s + l.qte, 0);
            return (
              <button key={c.id} onClick={() => setSel(c)} className="rounded-[12px] border border-border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate text-[0.88rem] font-semibold">{[c.clientPrenom, c.clientNom].filter(Boolean).join(" ")}</span>
                  <Badge tone={st.tone}>{st.label}</Badge>
                </div>
                {c.categorie ? <div className="mt-0.5 text-[0.72rem] text-faint">{c.categorie}</div> : null}
                <div className="mt-1.5 text-[0.74rem] text-muted">{c.lignes.length} objet{c.lignes.length > 1 ? "s" : ""} · {nbPieces} pièce{nbPieces > 1 ? "s" : ""}</div>
                <div className="mt-1 font-num text-[1rem] font-bold" style={{ color: "var(--accent)" }}>{money(c.total)}</div>
              </button>
            );
          })}
        </div>
      )}
      {nouveau ? <CommandeModal produits={produits} clients={clients} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <CommandeModal key={sel.id} commande={sel} produits={produits} clients={clients} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function CommandeModal({ commande, produits, clients, onClose, router }: { commande?: ArmCommande; produits: ArmProduit[]; clients: { id: string; nom: string }[]; onClose: () => void; router: Router }) {
  const editing = !!commande;
  const [categorie, setCategorie] = useState(commande?.categorie || "");
  const [clientNom, setClientNom] = useState(commande?.clientNom || "");
  const [clientPrenom, setClientPrenom] = useState(commande?.clientPrenom || "");
  const [statut, setStatut] = useState(commande?.statut || "en_attente");
  const [notes, setNotes] = useState(commande?.notes || "");
  const [lignes, setLignes] = useState<ArmCommandeLigne[]>(commande?.lignes?.length ? commande.lignes : [{ objet: "", qte: 1, prixUnitaire: 0 }]);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  const prixParNom = new Map(produits.map((p) => [p.nom.toLowerCase(), p.prix]));
  const total = lignes.reduce((s, l) => s + (Number(l.qte) || 0) * (Number(l.prixUnitaire) || 0), 0);

  function setLigne(i: number, patch: Partial<ArmCommandeLigne>) {
    setLignes((ls) => ls.map((l, idx) => (idx === i ? { ...l, ...patch } : l)));
  }
  function setObjet(i: number, objet: string) {
    setLignes((ls) => ls.map((l, idx) => {
      if (idx !== i) return l;
      const prix = prixParNom.get(objet.trim().toLowerCase());
      return { ...l, objet, prixUnitaire: (!l.prixUnitaire && prix != null) ? prix : l.prixUnitaire };
    }));
  }
  const addLigne = () => setLignes((ls) => [...ls, { objet: "", qte: 1, prixUnitaire: 0 }]);
  const delLigne = (i: number) => setLignes((ls) => ls.length > 1 ? ls.filter((_, idx) => idx !== i) : ls);
  const catsProd = [...new Set(produits.map((p) => p.categorie))];
  function ajouterProduit(p: ArmProduit) {
    setLignes((ls) => {
      const ligne = { objet: p.nom, qte: 1, prixUnitaire: p.prix };
      // Remplace la 1re ligne si elle est encore vide, sinon ajoute à la suite.
      if (ls.length === 1 && !ls[0].objet.trim() && !ls[0].prixUnitaire) return [ligne];
      // Si l'article est déjà au panier, incrémente sa quantité.
      const idx = ls.findIndex((l) => l.objet.trim().toLowerCase() === p.nom.toLowerCase());
      if (idx >= 0) return ls.map((l, j) => j === idx ? { ...l, qte: (Number(l.qte) || 0) + 1 } : l);
      return [...ls, ligne];
    });
  }

  async function enregistrer() {
    setErr(null);
    if (clientNom.trim().length < 2) { setErr("Indique le nom du client."); return; }
    const propres = lignes.filter((l) => l.objet.trim() || l.qte);
    if (!propres.length) { setErr("Ajoute au moins un objet."); return; }
    setBusy("save");
    const data = { categorie, clientNom, clientPrenom, lignes: propres, statut, notes };
    const r = editing ? await majCommande(commande!.id, data) : await creerCommande(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function marquer(st: string) { setBusy("st"); const r = await marquerCommande(commande!.id, st); setBusy(null); if (r.ok) { setStatut(st); router.refresh(); } else alert(r.error || "Changement de statut impossible — réessaie."); }
  async function supprimer() { setBusy("del"); const r = await supprimerCommande(commande!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }

  return (
    <Modal titre={editing ? `Commande — ${[commande!.clientPrenom, commande!.clientNom].filter(Boolean).join(" ")}` : "🧾 Nouveau bon de commande"} onClose={onClose} max={640}>
      <div className="flex flex-col gap-3">
        <div className="grid gap-3 sm:grid-cols-3">
          <Champ label="Catégorie"><input className={inputCls} value={categorie} onChange={(e) => setCategorie(e.target.value)} placeholder="Armes, Munitions, Sur mesure…" maxLength={80} list="cmd-cats" /><datalist id="cmd-cats"><option value="Armes" /><option value="Munitions" /><option value="Matériel" /><option value="Sur mesure" /><option value="Réparation" /></datalist></Champ>
          <Champ label="Prénom du client"><input className={inputCls} value={clientPrenom} onChange={(e) => setClientPrenom(e.target.value)} maxLength={120} /></Champ>
          <Champ label="Nom du client *"><input className={inputCls} value={clientNom} onChange={(e) => setClientNom(e.target.value)} maxLength={120} list="cmd-clients" /><datalist id="cmd-clients">{clients.map((c) => <option key={c.id} value={c.nom} />)}</datalist></Champ>
        </div>

        {/* Liste d'objets */}
        <div className="rounded-[10px] border border-border bg-surface-2 p-2.5">
          <div className="mb-1.5 hidden grid-cols-[1fr_58px_92px_92px_28px] gap-2 px-1 text-[0.66rem] uppercase tracking-[0.05em] text-faint sm:grid">
            <span>Objet</span><span className="text-center">Qté</span><span className="text-right">Prix unit.</span><span className="text-right">Total pile</span><span />
          </div>
          <div className="flex flex-col gap-1.5">
            {lignes.map((l, i) => {
              const pile = (Number(l.qte) || 0) * (Number(l.prixUnitaire) || 0);
              return (
                <div key={i} className="grid grid-cols-[1fr_58px_92px_92px_28px] items-center gap-2">
                  <input className={inputCls + " !px-2 !py-1.5"} value={l.objet} onChange={(e) => setObjet(i, e.target.value)} placeholder="Objet…" maxLength={120} list="cmd-objets" />
                  <input className={inputCls + " !px-1.5 !py-1.5 text-center"} type="number" min={0} value={l.qte || ""} onChange={(e) => setLigne(i, { qte: Math.max(0, Math.round(Number(e.target.value) || 0)) })} />
                  <input className={inputCls + " !px-2 !py-1.5 text-right"} type="number" min={0} step="0.01" value={l.prixUnitaire || ""} onChange={(e) => setLigne(i, { prixUnitaire: Math.max(0, Number(e.target.value) || 0) })} />
                  <span className="truncate text-right font-num text-[0.82rem] font-semibold" style={{ color: "var(--accent)" }}>{money(pile)}</span>
                  <button onClick={() => delLigne(i)} className="grid h-6 w-6 place-items-center rounded text-faint hover:text-ink" title="Retirer"><X className="h-3.5 w-3.5" /></button>
                </div>
              );
            })}
          </div>
          <datalist id="cmd-objets">{produits.map((p) => <option key={p.id} value={p.nom} />)}</datalist>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {produits.length ? (
              <select value="" onChange={(e) => { const p = produits.find((x) => x.id === e.target.value); if (p) ajouterProduit(p); }} className={inputCls + " !py-1.5 sm:max-w-[320px]"} aria-label="Ajouter un article du catalogue">
                <option value="">＋ Ajouter un article du catalogue…</option>
                {catsProd.map((cat) => (
                  <optgroup key={cat} label={cat}>
                    {produits.filter((p) => p.categorie === cat).map((p) => <option key={p.id} value={p.id}>{p.nom} — {money(p.prix)}</option>)}
                  </optgroup>
                ))}
              </select>
            ) : null}
            <button onClick={addLigne} className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-border px-2.5 py-1.5 text-[0.76rem] font-semibold text-muted hover:border-border-2 hover:text-ink"><Plus className="h-3.5 w-3.5" /> Ligne libre (sur mesure)</button>
          </div>
        </div>

        {/* Total général */}
        <div className="flex items-center justify-between rounded-[10px] border px-3.5 py-2.5" style={{ borderColor: "color-mix(in srgb,var(--accent) 40%,var(--border))", background: "color-mix(in srgb,var(--accent) 8%,var(--surface-2))" }}>
          <span className="text-[0.82rem] font-semibold uppercase tracking-[0.05em] text-muted">Total de la commande</span>
          <span className="font-num text-[1.3rem] font-bold" style={{ color: "var(--accent)" }}>{money(total)}</span>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span>
            <div className="flex flex-wrap gap-1.5">
              {CMD_STATUTS.map((st) => (
                <button key={st.key} onClick={() => editing ? marquer(st.key) : setStatut(st.key)} disabled={busy === "st"} className="rounded-lg px-2.5 py-1 text-[0.74rem] font-semibold transition" style={{ color: statut === st.key ? "#000" : "var(--muted)", background: statut === st.key ? "var(--accent)" : "var(--surface)", border: "1px solid var(--border)" }}>{st.label}</button>
              ))}
            </div>
          </div>
          <Champ label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Délai, acompte…" /></Champ>
        </div>

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
          ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Créer la commande"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ RENDEZ-VOUS (agenda du comptoir) ═══════════════════
const RDV_STATUTS = [
  { key: "a_venir", label: "À venir", tone: "accent" as const },
  { key: "honore", label: "Honoré", tone: "good" as const },
  { key: "annule", label: "Annulé", tone: "muted" as const },
];
const rdvStatut = (s: string) => RDV_STATUTS.find((x) => x.key === s) || RDV_STATUTS[0];
const rdvDateFR = (s: string | null) => { if (!s) return "—"; try { return new Date(s).toLocaleString("fr-FR", { weekday: "short", day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }); } catch { return "—"; } };
// ISO → valeur d'un <input type="datetime-local"> (heure LOCALE du navigateur).
function toLocalInput(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso); if (isNaN(d.getTime())) return "";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

export function RdvArmurerieTab({ rdvs, clients, router }: { rdvs: ArmRdv[]; clients: { id: string; nom: string }[]; router: Router }) {
  const [sel, setSel] = useState<ArmRdv | null>(null);
  const [nouveau, setNouveau] = useState(false);
  const now = Date.now();
  const t = (r: ArmRdv) => (r.dateRdv ? new Date(r.dateRdv).getTime() : 0);
  const aVenir = rdvs.filter((r) => r.statut === "a_venir").sort((a, b) => t(a) - t(b));
  const prochain = aVenir[0] || null;
  const passes = rdvs.filter((r) => r.statut !== "a_venir").sort((a, b) => t(b) - t(a));

  return (
    <>
      <div className="mb-3 grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        <Stat label="À venir" value={String(aVenir.length)} tone="var(--accent)" icon={CalendarClock} />
        <Stat label="Prochain" value={prochain ? rdvDateFR(prochain.dateRdv) : "—"} tone="var(--brass)" icon={Clock} />
        <Stat label="Honorés" value={String(rdvs.filter((r) => r.statut === "honore").length)} tone="var(--good)" icon={Check} />
      </div>
      <TopBar>
        <p className="text-[0.74rem] italic text-faint">Rendez-vous clients — heure + commande. L&apos;équipe est prévenue sur Discord 45 min & 15 min avant.</p>
        <Btn onClick={() => setNouveau(true)}><Plus className="h-3.5 w-3.5" /> Nouveau rendez-vous</Btn>
      </TopBar>
      {aVenir.length === 0 && passes.length === 0 ? (
        <Vide icon={CalendarClock} texte="Aucun rendez-vous. Crée-en un : nom du client, heure et commande — glisse une pièce d'identité pour remplir le nom tout seul. Un rappel part sur Discord 45 et 15 min avant l'heure." />
      ) : (
        <div className="flex flex-col gap-4">
          {aVenir.length ? (
            <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
              {aVenir.map((r) => <RdvCarte key={r.id} r={r} now={now} onClick={() => setSel(r)} />)}
            </div>
          ) : null}
          {passes.length ? (
            <div>
              <div className="mb-1.5 text-[0.72rem] uppercase tracking-[0.05em] text-faint">Passés</div>
              <div className="grid gap-2.5 sm:grid-cols-2 xl:grid-cols-3">
                {passes.slice(0, 30).map((r) => <RdvCarte key={r.id} r={r} now={now} onClick={() => setSel(r)} />)}
              </div>
            </div>
          ) : null}
        </div>
      )}
      {nouveau ? <RdvModal clients={clients} onClose={() => setNouveau(false)} router={router} /> : null}
      {sel ? <RdvModal key={sel.id} rdv={sel} clients={clients} onClose={() => setSel(null)} router={router} /> : null}
    </>
  );
}

function RdvCarte({ r, now, onClick }: { r: ArmRdv; now: number; onClick: () => void }) {
  const st = rdvStatut(r.statut);
  const nom = [r.clientPrenom, r.clientNom].filter(Boolean).join(" ") || r.clientNom;
  const t = r.dateRdv ? new Date(r.dateRdv).getTime() : 0;
  const mins = t ? Math.round((t - now) / 60000) : 0;
  const bientot = r.statut === "a_venir" && mins > 0 && mins <= 60;
  const compte = r.statut === "a_venir" && t ? (mins < 0 ? "dépassé" : mins < 60 ? `dans ${mins} min` : mins < 1440 ? `dans ${Math.round(mins / 60)} h` : `dans ${Math.round(mins / 1440)} j`) : null;
  return (
    <button onClick={onClick} className="rounded-[12px] border bg-surface-2 px-3.5 py-3 text-left transition hover:-translate-y-0.5 hover:border-border-2" style={{ borderColor: bientot ? "color-mix(in srgb,var(--warn) 55%,var(--border))" : "var(--border)" }}>
      <div className="flex items-center justify-between gap-2">
        <span className="min-w-0 truncate text-[0.88rem] font-semibold">{nom}</span>
        <Badge tone={st.tone}>{st.label}</Badge>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[0.78rem] text-muted"><Clock className="h-3.5 w-3.5 text-faint" /> {rdvDateFR(r.dateRdv)} {compte ? <span className="text-faint">· {compte}</span> : null}</div>
      {r.commande ? <div className="mt-1 truncate text-[0.74rem] text-faint">🧾 {r.commande}</div> : null}
    </button>
  );
}

function RdvModal({ rdv, clients, onClose, router }: { rdv?: ArmRdv; clients: { id: string; nom: string }[]; onClose: () => void; router: Router }) {
  const editing = !!rdv;
  const [clientPrenom, setClientPrenom] = useState(rdv?.clientPrenom || "");
  const [clientNom, setClientNom] = useState(rdv?.clientNom || "");
  const [telegramme, setTelegramme] = useState(rdv?.telegramme || "");
  const [commande, setCommande] = useState(rdv?.commande || "");
  const [lieu, setLieu] = useState(rdv?.lieu || "");
  const [dateLocal, setDateLocal] = useState(toLocalInput(rdv?.dateRdv || null));
  const [notes, setNotes] = useState(rdv?.notes || "");
  const [statut, setStatut] = useState(rdv?.statut || "a_venir");
  const [carte, setCarte] = useState(rdv?.carteIdentite || "");
  const [lisant, setLisant] = useState(false);
  const [lu, setLu] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirmDel, setConfirmDel] = useState(false);

  // Pièce d'identité déposée → l'IA lit le nom/prénom et pré-remplit la fiche.
  async function onPhoto(url: string) {
    setCarte(url); setLu(null); setLisant(true);
    const r = await lireCarteIdentite(url);
    setLisant(false);
    if (!r.ok) { setLu(r.error || "Lecture impossible — saisis le nom à la main."); return; }
    if (r.prenom) setClientPrenom(r.prenom);
    if (r.nom) setClientNom(r.nom);
    const extra = [r.dateNaissance ? `né(e) ${r.dateNaissance}` : "", r.residence ? `réside : ${r.residence}` : ""].filter(Boolean).join(" · ");
    if (extra && !notes) setNotes(extra);
    const nomComplet = `${r.prenom || ""} ${r.nom || ""}`.trim();
    setLu(nomComplet ? `📇 Identité lue : ${nomComplet}${extra ? " — " + extra : ""}` : "Carte lue, mais nom non détecté — saisis-le à la main.");
  }

  async function enregistrer() {
    setErr(null);
    if (clientNom.trim().length < 2) { setErr("Indique le nom du client."); return; }
    if (!dateLocal) { setErr("Choisis la date et l'heure du rendez-vous."); return; }
    const d = new Date(dateLocal); // navigateur → instant absolu (pas de décalage de fuseau)
    if (isNaN(d.getTime())) { setErr("Date invalide."); return; }
    setBusy("save");
    const data = { clientPrenom, clientNom, telegramme, carteIdentite: carte, commande, lieu, dateRdv: d.toISOString(), notes };
    const r = editing ? await majRdv(rdv!.id, data) : await creerRdv(data);
    setBusy(null);
    if (!r.ok) { setErr(r.error || "Impossible."); return; }
    router.refresh(); onClose();
  }
  async function marquer(st: string) { setBusy("st"); const r = await marquerRdv(rdv!.id, st); setBusy(null); if (r.ok) { setStatut(st); router.refresh(); } else alert(r.error || "Changement de statut impossible — réessaie."); }
  async function supprimer() { setBusy("del"); const r = await supprimerRdv(rdv!.id); setBusy(null); if (!r.ok) { setErr(r.error || "Échec."); return; } router.refresh(); onClose(); }

  const nomComplet = [clientPrenom, clientNom].filter(Boolean).join(" ");
  return (
    <Modal titre={editing ? `Rendez-vous — ${nomComplet || rdv!.clientNom}` : "🗓️ Nouveau rendez-vous"} onClose={onClose} max={640}>
      <div className="flex flex-col gap-3">
        {/* Pièce d'identité → remplissage automatique */}
        <div className="rounded-[10px] border border-border bg-surface-2 p-2.5">
          <PhotoDrop dossier="armurerie-rdv-id" onUploaded={onPhoto} compact label="Glisse la pièce d'identité — le nom se remplit tout seul" />
          {lisant ? <p className="mt-1.5 flex items-center gap-1.5 text-[0.76rem] text-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" /> Lecture de la pièce d&apos;identité…</p> : null}
          {lu && !lisant ? <p className="mt-1.5 text-[0.76rem]" style={{ color: /impossible|illisible|non détecté/i.test(lu) ? "var(--warn)" : "var(--good)" }}>{lu}</p> : null}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Prénom du client"><input className={inputCls} value={clientPrenom} onChange={(e) => setClientPrenom(e.target.value)} maxLength={120} /></Champ>
          <Champ label="Nom du client *"><input className={inputCls} value={clientNom} onChange={(e) => setClientNom(e.target.value)} maxLength={120} list="rdv-clients" /><datalist id="rdv-clients">{clients.map((c) => <option key={c.id} value={c.nom} />)}</datalist></Champ>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Date & heure *"><input className={inputCls} type="datetime-local" value={dateLocal} onChange={(e) => setDateLocal(e.target.value)} /></Champ>
          <Champ label="Contact (télégramme…)"><input className={inputCls} value={telegramme} onChange={(e) => setTelegramme(e.target.value)} maxLength={120} placeholder="N° télégramme, Discord…" /></Champ>
        </div>
        <Champ label="Commande / objet du rendez-vous"><textarea className={inputCls + " min-h-[70px] resize-y"} value={commande} onChange={(e) => setCommande(e.target.value)} maxLength={1000} placeholder="Ce que le client vient chercher / commander : armes, munitions, réparation…" /></Champ>
        <div className="grid gap-3 sm:grid-cols-2">
          <Champ label="Lieu"><input className={inputCls} value={lieu} onChange={(e) => setLieu(e.target.value)} maxLength={200} placeholder="Armurerie de Van Horn…" /></Champ>
          <Champ label="Notes"><input className={inputCls} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={1000} placeholder="Acompte, détails…" /></Champ>
        </div>

        {/* Rappel automatique */}
        <div className="flex items-start gap-2 rounded-[10px] border px-3 py-2 text-[0.76rem]" style={{ borderColor: "color-mix(in srgb,var(--accent) 30%,var(--border))", background: "color-mix(in srgb,var(--accent) 6%,transparent)" }}>
          <Bell className="mt-0.5 h-3.5 w-3.5 shrink-0" style={{ color: "var(--accent)" }} />
          <span className="text-muted">L&apos;équipe reçoit un <b className="text-ink">rappel Discord 45 min puis 15 min</b> avant l&apos;heure (salon #agenda).</span>
        </div>

        {editing ? (
          <div className="flex flex-col gap-1"><span className="text-[0.72rem] uppercase tracking-[0.05em] text-faint">Statut</span>
            <div className="flex flex-wrap gap-1.5">
              {RDV_STATUTS.map((st) => (
                <button key={st.key} onClick={() => marquer(st.key)} disabled={busy === "st"} className="rounded-lg px-2.5 py-1 text-[0.74rem] font-semibold transition" style={{ color: statut === st.key ? "#000" : "var(--muted)", background: statut === st.key ? "var(--accent)" : "var(--surface)", border: "1px solid var(--border)" }}>{st.label}</button>
              ))}
            </div>
          </div>
        ) : null}

        {err ? <p className="text-[0.8rem]" style={{ color: "var(--oxblood)" }}>{err}</p> : null}
        <div className="mt-1 flex items-center justify-between border-t border-border pt-3">
          {editing ? (confirmDel ? (
            <div className="flex items-center gap-2 text-[0.78rem]"><span className="text-muted">Supprimer ?</span>
              <button onClick={supprimer} disabled={busy === "del"} className="rounded-lg px-2.5 py-1 text-[0.76rem] font-semibold text-black/85" style={{ background: "var(--oxblood)" }}>{busy === "del" ? "…" : "Oui"}</button>
              <button onClick={() => setConfirmDel(false)} className="text-[0.76rem] text-muted hover:text-ink">Annuler</button></div>
          ) : <button onClick={() => setConfirmDel(true)} className="inline-flex items-center gap-1.5 text-[0.76rem] text-faint hover:text-ink"><Trash2 className="h-3.5 w-3.5" /> Supprimer</button>) : <span />}
          <button onClick={enregistrer} disabled={busy === "save"} className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-[0.82rem] font-semibold text-black/85 disabled:opacity-60" style={{ background: "var(--accent)" }}>{busy === "save" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />} {editing ? "Enregistrer" : "Créer le rendez-vous"}</button>
        </div>
      </div>
    </Modal>
  );
}

// ═══════════════════ ACTIVITÉ ═══════════════════
type Evt = { id: string; at: number; icon: typeof Users; tone: string; label: string; detail: string };
export function ActiviteTab({ mouvements, ventes, pointages, paies }: { mouvements: ArmMouvement[]; ventes: ArmVente[]; pointages: ArmPointage[]; paies: ArmPaie[] }) {
  const evts = useMemo<Evt[]>(() => {
    const t = (s: string | null) => (s ? new Date(s).getTime() : 0);
    const out: Evt[] = [];
    for (const m of mouvements) out.push({ id: "m" + m.id, at: t(m.createdAt), icon: m.sens === "entree" ? ArrowDownRight : ArrowUpRight, tone: m.sens === "entree" ? "var(--good)" : "var(--oxblood)", label: (m.sens === "entree" ? "+" : "−") + money(m.montant), detail: m.motif || (m.sens === "entree" ? "Recette" : "Dépense") });
    for (const p of pointages) if (p.fin) out.push({ id: "p" + p.id, at: t(p.fin), icon: Clock, tone: "var(--steel)", label: hm(p.minutes), detail: `${p.employeNom} — fin de service` });
    for (const pa of paies) if (pa.statut === "paye") out.push({ id: "pa" + pa.id, at: t(pa.payeAt), icon: Wallet, tone: "var(--brass)", label: money(pa.montant), detail: `Paie versée — ${pa.employeNom}` });
    return out.filter((e) => e.at > 0).sort((a, b) => b.at - a.at).slice(0, 60);
  }, [mouvements, pointages, paies]);

  if (evts.length === 0) return <Vide icon={Activity} texte="Aucune activité pour l'instant. Ventes, écritures, services et paies s'afficheront ici au fil de l'eau." />;

  return (
    <div className="flex flex-col gap-1.5">
      <p className="mb-1 text-[0.74rem] italic text-faint">Journal de l&apos;atelier — {ventes.length} ventes au registre.</p>
      {evts.map((e) => (
        <div key={e.id} className="flex items-center gap-2.5 rounded-[8px] border border-border bg-surface-2 px-3 py-2 text-[0.83rem]">
          <e.icon className="h-4 w-4 shrink-0" style={{ color: e.tone }} />
          <span className="min-w-0 flex-1 truncate">{e.detail}</span>
          <span className="shrink-0 font-num font-semibold" style={{ color: e.tone }}>{e.label}</span>
          <span className="hidden shrink-0 text-[0.68rem] text-faint sm:inline">{dateFR(new Date(e.at).toISOString())}</span>
        </div>
      ))}
    </div>
  );
}
